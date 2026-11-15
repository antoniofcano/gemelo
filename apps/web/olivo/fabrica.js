// Fábrica de recetas sin tirones: en un Web Worker (trabajador.js) si se puede; si no, a REBANADAS en el hilo principal (el generador con
// yield, a lo sumo `rebanadaMs` por turno y cediendo el hilo entre turnos). La receta es la misma por los dos caminos (misma huella).
import * as G from "three-gen";
import { recetaG } from "./nucleo.js";
import { aNivel } from "./niveles.js";
import { creaTrabajador } from "./crea_trabajador.js";   // en el IIFE se cambia por sin_trabajador.js (vite.config.js)

const ahora = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
// ceder el hilo: MessageChannel (sin el mínimo de 4 ms de setTimeout anidado) o setTimeout
const cede = (() => {
  if (typeof MessageChannel !== "undefined") {
    const cola = [], ch = new MessageChannel();
    // en Node, el canal solo mantiene vivo el proceso mientras hay turnos en cola
    const vivo = si => { if (ch.port1.ref) si ? ch.port1.ref() : ch.port1.unref(); };
    ch.port1.onmessage = () => { const f = cola.shift(); if (!cola.length) vivo(false); if (f) f(); };
    vivo(false);
    return f => { cola.push(f); vivo(true); ch.port2.postMessage(0); };
  }
  return f => setTimeout(f, 0);
})();

/** Corre el generador a rebanadas de a lo sumo `rebanadaMs` (tope): cada turno se corta al pasar tope − 1 ms, que un paso del generador
 *  dura bastante menos de 1 ms. Devuelve {promesa, rebanadas: [ms…]} */
export function aRebanadas(gen, rebanadaMs) {
  const rebanadas = [], corte = Math.max(0.5, rebanadaMs - 1);
  const promesa = new Promise((ok, ko) => {
    const turno = () => {
      const t0 = ahora();
      try {
        for (;;) {
          const r = gen.next();
          if (r.done) { rebanadas.push(ahora() - t0); ok(r.value); return; }
          if (ahora() - t0 >= corte) break;
        }
      } catch (e) { ko(e); return; }
      rebanadas.push(ahora() - t0); cede(turno);
    };
    cede(turno);
  });
  return { promesa, rebanadas };
}

/** Plazo por defecto (ms) sin NINGUNA respuesta del trabajador mientras hay recetas en espera: pasado, se da por muerto (C-02). Una receta E0 de
 *  centenario3 tarda decenas de ms en el trabajador de un escritorio [medido en olivo.test.js] y unas veces más en el Quest [SUPUESTO]: 20 s es holgado */
export const PLAZO_TRABAJADOR_MS = 20000;

/**
 * @param opciones { trabajador: true (por defecto) | false, rebanadaMs: 3, plazoMs: PLAZO_TRABAJADOR_MS, alMorir(motivo) (aviso: el trabajador murió y la fábrica
 *                   pasó a rebanadas), crea () → Worker|null (pruebas: un trabajador de mentira; por defecto crea_trabajador.js) }
 * @returns { modo: "trabajador" | "rebanadas" (cambia a "rebanadas" si el trabajador muere), receta(entrada, nivel?) → Promise<receta>, rebanadas: [ms…],
 *            muerto: "" | motivo, cierra() }
 * Si el trabajador muere (evento error o messageerror, o `plazoMs` sin contestar con recetas en espera: el script no cargó, el navegador no admite
 * trabajadores de módulo, se colgó), se termina, las recetas en espera se calculan a rebanadas (se resuelven, no se pierden), las siguientes también
 * y se llama a `alMorir(motivo)`. Nunca queda una promesa sin resolver ni rechazar (C-02 de la auditoría del constructor, 2026-11-15).
 */
export function creaFabrica(opciones) {
  const o = Object.assign({ trabajador: true, rebanadaMs: 3, plazoMs: PLAZO_TRABAJADOR_MS }, opciones || {});
  const todas = [];
  const aRebanadasReceta = (entrada, nivel) => {
    const t = aRebanadas(recetaG(G, entrada), o.rebanadaMs);
    return t.promesa.then(r => { todas.push(...t.rebanadas); return nivel && nivel !== "E0" ? aNivel(r, nivel) : r; });
  };
  let w = null;
  if (o.trabajador && (o.crea || typeof Worker !== "undefined")) {
    try { w = (o.crea || creaTrabajador)(); } catch (e) { w = null; }
  }
  if (!w) return { modo: "rebanadas", rebanadas: todas, muerto: "", receta: aRebanadasReceta, cierra() {} };

  let n = 0, plazo = null, muerto = "", cerrada = false; const espera = new Map();
  const quitaPlazo = () => { if (plazo !== null) { clearTimeout(plazo); plazo = null; } };
  const ponPlazo = () => { quitaPlazo(); if (espera.size && !muerto) plazo = setTimeout(() => muere("no contesta en " + o.plazoMs + " ms"), o.plazoMs); };
  function muere(motivo) {
    if (muerto || cerrada) return;
    muerto = "trabajador: " + motivo; quitaPlazo();
    try { w.terminate(); } catch (e) { /* ya muerto */ }
    const pendientes = [...espera.values()]; espera.clear();
    for (const f of pendientes) aRebanadasReceta(f.entrada, f.nivel).then(f.ok, f.ko);   // lo que esperaba, a rebanadas: se resuelve igual
    if (o.alMorir) { try { o.alMorir(muerto); } catch (e) { /* el aviso no rompe la fábrica */ } }
  }
  w.onmessage = e => {
    const d = e.data || {}, f = espera.get(d.id); ponPlazo();   // cualquier respuesta: el trabajador vive (el plazo vuelve a empezar)
    if (!f) return; espera.delete(d.id); if (!espera.size) quitaPlazo();
    if (d.error) f.ko(new Error(d.error)); else f.ok(d.receta);
  };
  w.onerror = e => { if (e && e.preventDefault) e.preventDefault(); muere(e && e.message || "error al cargar o al ejecutar"); };
  w.onmessageerror = () => muere("mensaje ilegible");
  const fab = {
    get modo() { return muerto ? "rebanadas" : "trabajador"; },
    get muerto() { return muerto; },
    rebanadas: todas,
    receta(entrada, nivel) {
      if (cerrada) return Promise.reject(new Error("fábrica cerrada"));
      if (muerto) return aRebanadasReceta(entrada, nivel);
      const id = ++n;
      return new Promise((ok, ko) => {
        espera.set(id, { ok, ko, entrada, nivel }); if (plazo === null) ponPlazo();
        try { w.postMessage({ id, entrada, nivel }); } catch (e) { muere("postMessage: " + (e && e.message || e)); }
      });
    },
    cierra() {
      if (cerrada) return; cerrada = true; quitaPlazo();
      try { w.terminate(); } catch (e) { /* ya muerto */ }
      for (const [, f] of espera) f.ko(new Error("fábrica cerrada")); espera.clear();
    },
  };
  return fab;
}

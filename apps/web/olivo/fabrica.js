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

/**
 * @param opciones { trabajador: true (por defecto) | false, rebanadaMs: 3 }
 * @returns { modo: "trabajador" | "rebanadas", receta(entrada, nivel?) → Promise<receta>, rebanadas: [ms…] (solo a rebanadas), cierra() }
 */
export function creaFabrica(opciones) {
  const o = Object.assign({ trabajador: true, rebanadaMs: 3 }, opciones || {});
  let w = null;
  if (o.trabajador && typeof Worker !== "undefined") {
    try { w = creaTrabajador(); } catch (e) { w = null; }
  }
  if (w) {
    let n = 0; const espera = new Map();
    const falla = e => { for (const [, f] of espera) f.ko(e); espera.clear(); };
    w.onmessage = e => { const f = espera.get(e.data.id); if (!f) return; espera.delete(e.data.id); if (e.data.error) f.ko(new Error(e.data.error)); else f.ok(e.data.receta); };
    w.onerror = e => falla(new Error("trabajador: " + (e.message || "error")));
    return {
      modo: "trabajador",
      receta(entrada, nivel) { const id = ++n; return new Promise((ok, ko) => { espera.set(id, { ok, ko }); w.postMessage({ id, entrada, nivel }); }); },
      cierra() { w.terminate(); falla(new Error("fábrica cerrada")); },
    };
  }
  const todas = [];
  return {
    modo: "rebanadas", rebanadas: todas,
    receta(entrada, nivel) {
      const t = aRebanadas(recetaG(G, entrada), o.rebanadaMs);
      return t.promesa.then(r => { todas.push(...t.rebanadas); return nivel && nivel !== "E0" ? aNivel(r, nivel) : r; });
    },
    cierra() {},
  };
}

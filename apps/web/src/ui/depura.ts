// El contador de ?debug (MU5-n, A3-7a: antes apps/web/motor/28_depura.js, que queda como talón): una caja en la esquina del visor para medir en el aparato (fps, ms de
// JS por fotograma, llamadas, triángulos, teselas y olivos por nivel), con el ajuste «Contador de rendimiento» o ?debug; da a las pruebas __g.depuraJs(). La llama
// 90_final cada fotograma (depuraCuadro). Componente «contador-depura» de TODOS los mundos (la caja es de la página; lo que cuenta de un mundo le llega por argumento):
// su libera() saca la caja del visor y quita __g.depuraJs. Código movido tal cual (solo se tipan parámetros y variables); Ajustes (33, se monta después) entra por getter.
import type { Manifiesto } from "../nucleo/componentes.ts";
import type { T } from "./tipos.ts";

export const ID_CONTADOR = "contador-depura";

/** Lo que el talón de 28 le da: Aparato, Mundo, Cola, el Bus, XrPerillas, InfoDibujo, el visor, el renderer, Arboles ; por getter, vrDebugExtra (29_vr) y Ajustes (33), que se montan después */
export interface DepsDepura {
  Aparato: T; Mundo: T; Cola: T; Bus: T; XrPerillas: T; InfoDibujo: T; visor: T; renderer: T; Arboles: T; readonly vrDebugExtra: () => string; readonly Ajustes: T; ventana: T; documento: T;
}

export function creaDepura(dp: DepsDepura) {
  var window: T = dp.ventana, document: T = dp.documento, performance: T = globalThis.performance;   // performance.memory (Chrome) no está en los tipos del DOM

  // ---------- ?debug: un contador en la esquina del visor para medir en el móvil (ms de JS por fotograma, llamadas, triángulos, teselas y olivos por nivel)
  var dep: T = { n: 0, t0: performance.now(), js: 0, mx: 0, el: null, ultimo: null, dib: {} };   // dib: lo dibujado (InfoDibujo, 02h_render), el mismo objeto cada vez
  // para las medidas del banco (gancho __g de 27_debug): ms de JS por fotograma, media y pico de la última media seg. del contador de ?debug
  if (window.__g) window.__g.depuraJs = function () { return dep.ultimo; };
  // con ?olivos=gen, una línea con su estado (en el móvil no hay consola): cargando / activo / sin (y por qué), plan, dibujados y la vía; y las
  // variantes: horneadas (descargadas), calculadas y fallos de descarga (ADR-0018), con el estado del manifiesto si no se usa
  function genDebug() {
    var g: T = window.__olivosGen ? window.__olivosGen() : null;
    if (!g) return "";
    if (g.estado === "apagado") return g.apagadoPor ? "generados apagados · " + g.apagadoPor + "\n" : "";   // O10a: por defecto están, salvo que se apaguen o no se puedan
    var h: T = g.horneado;
    return "generados " + (g.defecto ? "(por defecto) " : "") + g.estado + " · plan " + g.plan + " · dibujados " + (g.info && g.info.arboles || 0) + " · recetas " + g.recetas + " · " + g.via + (g.motivo ? " · " + String(g.motivo).slice(0, 60) : "") +
      (g.cache ? " · caché: memoria " + g.cache.memoria + " (" + g.cache.memoriaMB + " MB) · disco " + (g.cache.enDisco ? (g.cache.disco === null ? "…" : g.cache.disco) + " (" + g.cache.discoMB + " MB)" : "no") + (g.cache.aviso ? " · " + g.cache.aviso.slice(0, 50) : "") : "") +
      (h ? " · horneadas " + h.horneadas + " · calculadas " + h.calculadas + " · fallos " + h.fallos + (h.estado !== "activo" ? " (manifiesto: " + h.estado + (h.motivo ? ", " + h.motivo.slice(0, 40) : "") + ")" : "") : "") + "\n";
  }
  // con ?olivos=escalera (ADR-0019), una línea con el reparto: cuántos olivos en E0, E1, E2 (E2-VR en gafas) y lejanos (impostor o sustituto), y los
  // triángulos y llamadas de olivos frente al presupuesto del aparato
  function escDebug(a?: T) {
    var e: T = a.escalera; if (!e) return "";
    return "escalera " + (e.activa ? "" : "(apagada: " + e.estado + ") ") + "E0 " + e.E0 + " · E1 " + e.E1 + " · E2" + (e.vr ? "-VR " : " ") + e.E2 + " · lejanos " + e.lejanos + " (" + (e.lejanosModo || "—") + ")" +
      " · olivos " + (e.triOlivos / 1000).toFixed(0) + " k tri / " + (e.presupuesto / 1000).toFixed(0) + " k · " + e.llamadasOlivos + " llamadas" + (e.movil ? " · móvil" : "") + "\n";
  }
  function depuraCuadro(tIni?: T) {
    if (!dp.Ajustes.lee("avanzado.contador")) { if (dep.el) dep.el.hidden = true; return; }   // ?debug o el ajuste de Configuración → Avanzado
    if (dep.el) dep.el.hidden = false;
    var js: T = performance.now() - tIni; dep.n++; dep.js += js; if (js > dep.mx) dep.mx = js;
    var ahora: T = performance.now(); if (ahora - dep.t0 < 500) return;
    if (!dep.el) { dep.el = document.createElement("div"); dep.el.style.cssText = "position:absolute;left:8px;bottom:8px;z-index:30;font:11px/1.35 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.7);color:#a8f0b0;padding:4px 7px;border-radius:5px;pointer-events:none;white-space:pre"; dp.visor.appendChild(dep.el); }
    var ext: T = { lineas: [] }; dp.Bus.emite("depura:lineas", ext);   // las líneas de los componentes (la presencia compartida, si está activa)
    var i: T = dp.InfoDibujo.lee(dp.renderer, dep.dib), a: T = dp.Arboles.resumen(), cargadas: T = dp.Mundo.lista.filter(function (t?: T) { return t.estado === 2; }).length, mem: T = window.performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + " MB" : "n/d";
    dep.el.textContent = (dep.n * 1000 / (ahora - dep.t0)).toFixed(0) + " fps · JS " + (dep.js / dep.n).toFixed(1) + " ms (pico " + dep.mx.toFixed(0) + ")\n" +
      i.llamadas + " llamadas · " + (i.triangulos / 1000).toFixed(0) + " k tri · " + (i.puntos / 1000).toFixed(0) + " k pts\n" +
      "cola " + dp.Cola.pendientes() + " pendientes · rebanada máx (ms): " + Object.keys(dp.Cola.est).map(function (k?: T) { return k + " " + dp.Cola.est[k].max.toFixed(0); }).join(" · ") + "\n" +
      dp.Aparato.linea() + "\n" +   // AG-0.3: la clase de aparato y lo medido (01a_aparato.js)
      (window.VR_ESTADO ? window.VR_ESTADO + dp.vrDebugExtra() + "\n" : "") + (dp.XrPerillas.entro ? dp.XrPerillas.linea() + "\n" : "") + (ext.lineas.length ? ext.lineas.join("\n") + "\n" : "") + genDebug() + escDebug(a) + "teselas " + cargadas + "/" + dp.Mundo.lista.length + " · olivos N0 " + a.nivel0 + " N1 " + a.nivel1 + " N2 " + a.nivel2 + " · heap " + mem;
    dep.ultimo = { fps: +(dep.n * 1000 / (ahora - dep.t0)).toFixed(1), js: +(dep.js / dep.n).toFixed(2), pico: +dep.mx.toFixed(1) };   // para __g.depuraJs() (las medidas del banco)
    dep.n = 0; dep.js = 0; dep.mx = 0; dep.t0 = ahora;
  }
  // A3-7a: libera() saca la caja del visor y quita el gancho de las medidas del banco
  function libera() { if (dep.el && dep.el.parentNode) dep.el.parentNode.removeChild(dep.el); dep.el = null; if (window.__g && window.__g.depuraJs) delete window.__g.depuraJs; }
  return { depuraCuadro: depuraCuadro, libera: libera };
}
export type Depura = ReturnType<typeof creaDepura>;

/** El componente «contador-depura» (solo ciclo de vida; de todos los mundos): lo registra el talón de 28 con Componentes.registra */
export function manifiestoDepura(api: { libera(): void }): Manifiesto {
  return {
    id: ID_CONTADOR, version: 1, consume: [], expone: [], eventos: { escucha: [], emite: ["depura:lineas"] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: "todos", monta: function () { return api; }, libera: function () { api.libera(); }
  };
}

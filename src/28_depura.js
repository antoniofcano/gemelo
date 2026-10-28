// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: depuraCuadro
// Consume: 01_datos (DEPURA), 02_mundo (Mundo), 02b_cola (Cola), 03_escena (visor, renderer), 07b_arboles (Arboles), 15_tiempo (nivel),
//   29_vr (vrDebugExtra)
// ===============================================================================

  // ---------- ?debug: un contador en la esquina del visor para medir en el móvil (ms de JS por fotograma, llamadas, triángulos, teselas y olivos por nivel)
  var dep = { n: 0, t0: performance.now(), js: 0, mx: 0, el: null };
  function depuraCuadro(tIni) {
    if (!DEPURA) return;
    var js = performance.now() - tIni; dep.n++; dep.js += js; if (js > dep.mx) dep.mx = js;
    var ahora = performance.now(); if (ahora - dep.t0 < 500) return;
    if (!dep.el) { dep.el = document.createElement("div"); dep.el.style.cssText = "position:absolute;left:8px;bottom:8px;z-index:30;font:11px/1.35 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.7);color:#a8f0b0;padding:4px 7px;border-radius:5px;pointer-events:none;white-space:pre"; visor.appendChild(dep.el); }
    var i = renderer.info, a = Arboles.resumen(), cargadas = Mundo.lista.filter(function (t) { return t.estado === 2; }).length, mem = window.performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + " MB" : "n/d";
    dep.el.textContent = (dep.n * 1000 / (ahora - dep.t0)).toFixed(0) + " fps · JS " + (dep.js / dep.n).toFixed(1) + " ms (pico " + dep.mx.toFixed(0) + ")\n" +
      i.render.calls + " llamadas · " + (i.render.triangles / 1000).toFixed(0) + " k tri · " + (i.render.points / 1000).toFixed(0) + " k pts\n" +
      "cola " + Cola.pendientes() + " pendientes · rebanada máx (ms): " + Object.keys(Cola.est).map(function (k) { return k + " " + Cola.est[k].max.toFixed(0); }).join(" · ") + "\n" +
      (window.VR_ESTADO ? window.VR_ESTADO + vrDebugExtra() + "\n" : "") + "teselas " + cargadas + "/" + Mundo.lista.length + " · olivos N0 " + a.nivel0 + " N1 " + a.nivel1 + " N2 " + a.nivel2 + " · heap " + mem;
    dep.n = 0; dep.js = 0; dep.mx = 0; dep.t0 = ahora;
  }

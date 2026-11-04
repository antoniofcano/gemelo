// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: CargaPuro, Cola
// Consume: 03_escena (modo), 05_nube (nube), 08_marcadores (pendiente), 15_tiempo (hace)
// ===============================================================================
  // ---------- la cola de trabajos: lo pesado (mallas de terreno, nube de una tesela, un olivar de 64 m, texturas de ruido) se construye a rebanadas
  // Cada trabajo es un generador: cada «yield» es un punto donde se puede parar. Cola.corre(ms) hace avanzar el más urgente (menor prio = más cerca) hasta agotar el presupuesto
  // de tiempo del fotograma, de modo que cargar una tesela nueva o construir los olivos de una celda no congela la imagen ni el paseo.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/carga_sin_tirones.test.js)
  // AG-1.5: las reglas del reloj de carga, sin estado:
  //   CargaPuro.base(o)            ms por fotograma para todo lo que carga a rebanadas (lo reparte 07b_arboles entre los generados y la Cola): los de siempre
  //                                (más si faltan olivos de cerca y el aparato va holgado: emaDt ≤ 34 ms), recortados por el tope del aparato
  //                                (o.pol.cargaMs, o.pol.cargaMsVr en VR) y menos la deuda (o.deuda: lo que el tileset gastó en el motor fuera de la Cola)
  //   CargaPuro.parseTiles(pol, vr) teselas que la librería de 3D Tiles analiza a la vez (parseQueue.maxJobs); sin política, las 5 de la librería
  //   CargaPuro.prioridadRed(tile)  la prioridad de red de la descarga de una tesela (RequestInit.priority): "high" lo que se ve y está cerca
  //                                (< CERCA m del volumen de la tesela), "low" lo que no está en el encuadre, "auto" el resto y lo que no se sabe
  var CargaPuro = (function () {
    var CERCA = 200;
    function base(o) {
      o = o || {};
      var justo = o.emaDt > 0.034, b;
      if (o.faltan > 0 && !justo) b = o.paseando ? 8 : 12; else b = justo ? (o.paseando ? 3 : 4.5) : (o.paseando ? 3.5 : 6);
      var pol = o.pol || {}, tope = o.vr ? pol.cargaMsVr : pol.cargaMs;
      if (typeof tope === "number" && tope > 0 && b > tope) b = tope;
      return Math.max(0, b - (o.deuda > 0 ? o.deuda : 0));
    }
    function parseTiles(pol, vr) { var n = pol ? (vr ? pol.tilesParseVr : pol.tilesParse) : 0; return typeof n === "number" && n >= 1 ? Math.floor(n) : 5; }
    function prioridadRed(tile) {
      var t = tile && tile.traversal; if (!t) return "auto";
      if (t.inFrustum === false) return "low";
      return t.inFrustum === true && typeof t.distanceFromCamera === "number" && t.distanceFromCamera < CERCA ? "high" : "auto";
    }
    return { CERCA: CERCA, base: base, parseTiles: parseTiles, prioridadRed: prioridadRed };
  })();
  // [puro:fin]
  // AG-1.5 «carga sin tirones»: la Cola es además el RELOJ DE CARGA del fotograma, compartido con lo que carga fuera de ella:
  //   · cada tipo de trabajo (1.ª letra de la clave) lleva la media de lo que cuesta una rebanada (est[k].prom); no se EMPIEZA una rebanada que, por esa
  //     media, se saldría del presupuesto: queda para el fotograma siguiente (la rebanada inicial de cada llamada va siempre, así la Cola nunca se para). El orden
  //     de las rebanadas no cambia (siempre la de menor prio): solo se reparten distinto entre fotogramas, y lo montado es lo mismo;
  //   · Cola.debe(ms, fuente) apunta trabajo que se hizo fuera de la Cola y fuera del presupuesto (lo que el tileset dispara en el motor al llegar una
  //     tesela, 04b_escena3d): es una DEUDA que 07b_arboles descuenta del presupuesto del fotograma siguiente (Cola.deuda()); Cola.corre la salda.
  //     Cola.cobra(fuente, f) envuelve una función para que lo que tarde se apunte así. est[fuente] lo enseña ?debug (28_depura) como las demás.
  var Cola = (function () {
    var jobs = [], activos = {}, est = {}, deuda = 0;   // est: por tipo de trabajo, nº de rebanadas, ms totales, la más larga (lo que se nota como tirón) y la media (prom)
    function tipo(k) { return est[k] || (est[k] = { n: 0, ms: 0, max: 0, prom: 0 }); }
    function apunta(e, dm) { e.n++; e.ms += dm; if (dm > e.max) e.max = dm; e.prom = e.n === 1 ? dm : e.prom + (dm - e.prom) * 0.2; }
    function add(clave, prio, gen, fin) {
      var j = activos[clave]; if (j) { j.prio = prio; return false; }   // la prioridad es la última pedida (la distancia a la cámara cambia)
      j = { clave: clave, prio: prio, gen: gen, fin: fin }; jobs.push(j); activos[clave] = j; return true;
    }
    function cancela(clave) { var j = activos[clave]; if (j) { j.muerto = true; delete activos[clave]; } }
    function hay(clave) { return !!activos[clave]; }
    function corre(ms) {
      var t0 = performance.now(), hechas = 0;
      while (jobs.length) {
        var usado = performance.now() - t0; if (usado >= ms) break;
        var bi = 0; for (var i = 1; i < jobs.length; i++) if (jobs[i].prio < jobs[bi].prio) bi = i;
        var j = jobs[bi];
        if (j.muerto) { jobs.splice(bi, 1); continue; }
        var e = tipo(j.clave.charAt(0));
        if (hechas > 0 && usado + e.prom > ms) break;   // AG-1.5: no cabe (por lo que suele costar): al fotograma siguiente
        var ts = performance.now(), r = j.gen.next(), dm = performance.now() - ts; apunta(e, dm); hechas++;
        if (r.done) { jobs.splice(bi, 1); if (activos[j.clave] === j) delete activos[j.clave]; if (j.fin) j.fin(r.value); }
      }
      deuda = 0;   // lo que se debía ya se descontó del presupuesto de este fotograma (07b_arboles)
    }
    function vacia(ms) { var t0 = performance.now(); while (jobs.length && performance.now() - t0 < ms) corre(50); }   // para el arranque: termina todo lo pendiente
    function debe(ms, fuente) { if (!(ms > 0)) return; deuda += ms; apunta(tipo(fuente || "fuera"), ms); }
    function cobra(fuente, f) { return function () { var t = performance.now(); try { return f.apply(this, arguments); } finally { debe(performance.now() - t, fuente); } }; }
    return { est: est, add: add, cancela: cancela, hay: hay, corre: corre, vacia: vacia, debe: debe, cobra: cobra, deuda: function () { return deuda; }, pendientes: function () { return jobs.length; } };
  })();

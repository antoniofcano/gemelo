// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Cola
// Consume: 03_escena (modo), 05_nube (nube), 08_marcadores (pendiente), 15_tiempo (hace)
// ===============================================================================
  // ---------- la cola de trabajos: lo pesado (mallas de terreno, nube de una tesela, un olivar de 64 m, texturas de ruido) se construye a rebanadas
  // Cada trabajo es un generador: cada «yield» es un punto donde se puede parar. Cola.corre(ms) hace avanzar el más urgente (menor prio = más cerca) hasta agotar el presupuesto
  // de tiempo del fotograma, de modo que cargar una tesela nueva o construir los olivos de una celda no congela la imagen ni el paseo.
  var Cola = (function () {
    var jobs = [], activos = {}, est = {};   // est: por tipo de trabajo (1.ª letra de la clave), nº de rebanadas, ms totales y la rebanada más larga (lo que se nota como tirón)
    function add(clave, prio, gen, fin) {
      var j = activos[clave]; if (j) { j.prio = prio; return false; }   // la prioridad es la última pedida (la distancia a la cámara cambia)
      j = { clave: clave, prio: prio, gen: gen, fin: fin }; jobs.push(j); activos[clave] = j; return true;
    }
    function cancela(clave) { var j = activos[clave]; if (j) { j.muerto = true; delete activos[clave]; } }
    function hay(clave) { return !!activos[clave]; }
    function corre(ms) {
      var t0 = performance.now();
      while (jobs.length && performance.now() - t0 < ms) {
        var bi = 0; for (var i = 1; i < jobs.length; i++) if (jobs[i].prio < jobs[bi].prio) bi = i;
        var j = jobs[bi];
        if (j.muerto) { jobs.splice(bi, 1); continue; }
        var ts = performance.now(), r = j.gen.next(), dm = performance.now() - ts, e = est[j.clave.charAt(0)] || (est[j.clave.charAt(0)] = { n: 0, ms: 0, max: 0 }); e.n++; e.ms += dm; if (dm > e.max) e.max = dm;
        if (r.done) { jobs.splice(bi, 1); if (activos[j.clave] === j) delete activos[j.clave]; if (j.fin) j.fin(r.value); }
      }
    }
    function vacia(ms) { var t0 = performance.now(); while (jobs.length && performance.now() - t0 < ms) corre(50); }   // para el arranque: termina todo lo pendiente
    return { est: est, add: add, cancela: cancela, hay: hay, corre: corre, vacia: vacia, pendientes: function () { return jobs.length; } };
  })();


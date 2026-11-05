// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: TopeTilesPuro
// Consume: 03_escena (renderer), 15_tiempo (nivel, hace), 29_vr (VR_PERFILES)
// ===============================================================================
  // ---------- Q0k: el tileset 3D (04b_escena3d.js) respeta el tope de triángulos de cada nivel de VR (doc/sistema/VR.md#tope-de-triángulos-del-tileset-q0k).
  // Medido en un Quest 3 (MEDIDAS.md, 2026-11-05): en el nivel 3 el perfil relaja el error del tileset (16 → 48 px) pero se dibujan 170-250 k triángulos
  // frente a los 130 k de VR_PERFILES[3].tri. 3DTilesRendererJS 0.5.3 no tiene tope de triángulos (solo errorTarget, errorFalloff, maxDepth, loadSiblings…):
  // su palanca es errorTarget, y este lazo la mueve. Lo que se mide: los triángulos que el tileset manda a dibujar (relieve de las teselas visibles + sus
  // olivos instanciados), contados de la geometría, no de renderer.info (no depende de si hay multiview ni de cuántos ojos).
  //   · sube el error un paso (×PASO) si los triángulos pasan del tope durante SOBRE_S seguidos; lo baja un paso si están por debajo de BAJO × tope
  //     durante BAJO_S seguidos y el paso de abajo, la última vez que se vio, cabía (memoria por paso, que se olvida al moverse OLVIDA_M o tras OLVIDA_S);
  //   · tras cada cambio, GUARDA s sin decidir (y, mientras la librería carga teselas, hasta CARGA_MAX s): no se encadenan cambios antes de ver su efecto;
  //   · nunca pasa de errMax (perilla ?xrtrierr=, 128 px) ni baja del error del nivel (eBase, el `e` del perfil): con todo al máximo y aún por encima,
  //     «saturado» (se dice en la línea de ?debug; no hay más palanca en el tileset).
  // Sin reservas: el estado es un objeto que se crea una vez (nuevo) y paso() solo escribe en él. Lo llama 04b cada MUESTRA s, solo en VR.
  // Las cifras (pasos, umbrales, tiempos) son de partida, SIN medir en el Quest.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/tope_tiles.test.js)
  var TopeTilesPuro = (function () {
    var DEF = { MUESTRA: 0.25, SOBRE_S: 0.5, BAJO_S: 3, GUARDA: 1.5, CARGA_MAX: 4, PASO: 1.25, BAJO: 0.75, CABE: 0.95, OLVIDA_M: 40, OLVIDA_S: 60, ERR_MAX: 128 };
    // cuántos pasos caben entre eBase y errMax (0 si eBase ya llega)
    function pasos(eBase, errMax) { return eBase > 0 && errMax > eBase ? Math.ceil(Math.log(errMax / eBase) / Math.log(DEF.PASO) - 1e-9) : 0; }
    function error(eBase, k, errMax) { return Math.min(Math.max(eBase, errMax), eBase * Math.pow(DEF.PASO, k)); }
    function nuevo() { return { activo: false, k: 0, K: 0, eBase: 0, errMax: 0, error: null, tri: 0, tope: 0, tSobre: 0, tBajo: 0, tGuarda: 1e9, t: 0, mem: [], cambios: 0, subidas: 0, bajadas: 0, saturado: false }; }
    function olvida(s) { s.mem.length = 0; s.tSobre = 0; s.tBajo = 0; }
    // s: el estado (nuevo()). m: { dt (s desde la muestra anterior), tri (los del tileset ahora), tope (0 o falta = lazo apagado), eBase (px, el del nivel),
    // errMax (px), cargando (¿la librería tiene teselas en cola, bajando o analizándose?), x, z (la cabeza, m) } → el error (px) que hay que poner
    function paso(s, m) {
      var eBase = m.eBase > 0 ? m.eBase : 0;
      if (!(m.tope > 0) || !eBase) { s.activo = false; s.k = 0; s.K = 0; s.saturado = false; olvida(s); s.tGuarda = 1e9; s.tri = m.tri || 0; s.tope = 0; s.error = eBase || null; return s.error; }
      var errMax = m.errMax > 0 ? m.errMax : DEF.ERR_MAX, dt = m.dt > 0 ? m.dt : 0;
      if (s.eBase !== eBase || s.errMax !== errMax) { s.eBase = eBase; s.errMax = errMax; s.K = pasos(eBase, errMax); if (s.k > s.K) s.k = s.K; olvida(s); }   // otro nivel: lo aprendido no vale
      s.activo = true; s.t += dt; s.tGuarda += dt; s.tri = m.tri; s.tope = m.tope;
      for (var j = 0; j < s.mem.length; j++) {   // la memoria de cada paso se olvida al moverse o con el tiempo
        var a = s.mem[j]; if (!a) continue;
        var dx = m.x - a.x, dz = m.z - a.z;
        if (s.t - a.t > DEF.OLVIDA_S || !(dx * dx + dz * dz <= DEF.OLVIDA_M * DEF.OLVIDA_M)) s.mem[j] = null;
      }
      if (m.tri > m.tope) { s.tSobre += dt; s.tBajo = 0; }
      else if (m.tri < m.tope * DEF.BAJO) { s.tBajo += dt; s.tSobre = 0; }
      else { s.tSobre = 0; s.tBajo = 0; }
      s.saturado = s.k >= s.K && m.tri > m.tope;
      var espera = s.tGuarda < DEF.GUARDA || (m.cargando && s.tGuarda < DEF.CARGA_MAX);
      if (!espera) {
        if (s.tSobre >= DEF.SOBRE_S && s.k < s.K) {
          s.mem[s.k] = { tri: m.tri, x: m.x, z: m.z, t: s.t };   // reserva-ok: un objeto por cambio de paso, no por fotograma
          s.k++; s.subidas++; cambio(s);
        } else if (s.tBajo >= DEF.BAJO_S && s.k > 0) {
          var b = s.mem[s.k - 1];
          if (!b || b.tri < m.tope * DEF.CABE) { s.k--; s.bajadas++; cambio(s); }
          else s.tBajo = 0;   // el de abajo no cabía hace poco: se vuelve a esperar BAJO_S
        }
      }
      s.error = error(eBase, s.k, errMax);
      return s.error;
    }
    function cambio(s) { s.cambios++; s.tGuarda = 0; s.tSobre = 0; s.tBajo = 0; }
    // la parte de la línea de ?debug y del medidor: «tileset 152 k / tope 130 k tri · 41 mallas · error 60 px (lazo 1/4)»
    function k(n) { return Math.round((n || 0) / 1000) + " k"; }
    function linea(s, extra) {
      extra = extra || {};
      if (extra.apagado) return "tileset " + k(extra.tri) + " tri · error " + (s.error != null ? Math.round(s.error) : "?") + " px (lazo apagado: xrtri=0)";
      if (!s.activo) return "";
      return "tileset " + k(s.tri) + " / tope " + k(s.tope) + " tri" + (extra.mallas != null ? " · " + extra.mallas + " mallas" : "") + " · error " + Math.round(s.error) + " px (lazo " + s.k + "/" + s.K + (s.saturado ? ", saturado" : "") + ")";
    }
    return { DEF: DEF, pasos: pasos, error: error, nuevo: nuevo, paso: paso, linea: linea };
  })();
  // [puro:fin]

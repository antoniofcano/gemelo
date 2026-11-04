// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: VrPresupuestoPuro, VrPresupuesto
// Consume: (nada de otros módulos)
// ===============================================================================
  // ---------- Q0c-a: el escalón de los perfiles de 29_vr manda también en lo que el perfil no tocaba (doc/sistema/VR.md#perfil-de-rendimiento-vr).
  // Medido en un Quest (MEDIDAS.md, 2026-11-04): en el escalón 3, 1,43 M triángulos por fotograma y p95 de 23 ms; el desglose de Hituelo real dice que
  // lo que más pesa no lo tocaba el perfil (anillos de OlivarTrack, árboles del paisaje, octaedros del LiDAR, fondo del relieve, manchas de sombra).
  // Aquí viven los escalones (VrPresupuestoPuro.ESCALONES, una fila por perfil de 29_vr) y UN punto que los pone: 29_vr llama a VrPresupuesto.ponEscalon(n)
  // al cambiar de perfil y ponEscalon(null) al salir. Cada fuente se apunta desde su módulo:
  //   VrPresupuesto.fuente(id, fn)          fn(valor) recibe el valor de su fila al cambiar (sombras: sí/no; sueloFondo: celdas por lado)
  //   VrPresupuesto.instancias(id, mallas)  InstancedMesh que comparten índice (p. ej. el pie y tres masas de copa): se recortan por distancia a la cabeza
  //   VrPresupuesto.renueva(id)             el módulo acaba de escribir TODAS sus instancias (cambió la exageración): se toma de nuevo la copia y se recorta
  //   VrPresupuesto.olvida(id)              el módulo se libera
  //   VrPresupuesto.mueve(x, z)             29_vr, cada fotograma en VR: solo una resta y una comparación; recorta de nuevo al pasar del umbral (≥ 15 m)
  // Regla 5: lo deducido e ilustrativo cae antes que lo medido; los octaedros del LiDAR solo se recortan en el último escalón y el relieve (teselas, fondo
  // del relieve) nunca se apaga, solo se pide más grueso. Fuera de VR (ponEscalon(null)) todo vuelve a como estaba y, si nunca se entró, nada se toca.
  // Los radios y las celdas son de partida, SIN medir en las gafas (como los e de los perfiles de 29_vr): se ajustan con la perilla del escalón fijo (xrnivel) y la medida de 60 s (debug, mide) en el Quest.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/vr_presupuesto.test.js)
  var VrPresupuestoPuro = (function () {
    // que: «radio» (metros alrededor de la cabeza; null = todas), «si» (se dibuja o no), «celdas» (lado de la rejilla); base: el valor fuera de VR
    var FUENTES = {
      arbolesPaisaje: { que: "radio", clase: "deducido", base: null, modulo: "18_paisaje", texto: "árboles que no son olivo: clasificación deducida, forma ilustrativa" },
      sombras: { que: "si", clase: "ilustrativo", base: true, modulo: "07_follaje", texto: "manchas de sombra (olivos, paisaje, fauna y perros)" },
      marcasOT: { que: "radio", clase: "registro", base: null, modulo: "08b_marcadores_lidar", texto: "anillos de los olivos guardados en OlivarTrack" },
      copasLidar: { que: "radio", clase: "medido", base: null, modulo: "08b_marcadores_lidar", texto: "octaedros de cada copa detectada en el LiDAR" },
      sueloFondo: { que: "celdas", clase: "medido", base: 128, modulo: "04e_suelo_fondo", texto: "fondo del relieve: el mismo relieve grueso medido, con menos celdas" }
    };
    var ORDEN = ["arbolesPaisaje", "sombras", "marcasOT", "copasLidar", "sueloFondo"];   // de lo primero que se sacrifica a lo último
    var ESCALONES = [
      { arbolesPaisaje: null, sombras: true, marcasOT: null, copasLidar: null, sueloFondo: 128 },   // 0: como en pantalla
      { arbolesPaisaje: 400, sombras: true, marcasOT: 300, copasLidar: null, sueloFondo: 128 },
      { arbolesPaisaje: 200, sombras: false, marcasOT: 180, copasLidar: null, sueloFondo: 128 },
      { arbolesPaisaje: 120, sombras: false, marcasOT: 100, copasLidar: 250, sueloFondo: 64 }
    ];
    var PASO_MIN = 15;   // m que hay que moverse para volver a recortar (y nunca menos de un cuarto del radio más corto)
    function base() { var o = {}; ORDEN.forEach(function (k) { o[k] = FUENTES[k].base; }); return o; }
    // la fila de un escalón (n fuera de los límites se recorta; null, undefined o no numérico = fuera de VR: la base)
    function reparto(n) {
      if (n === null || n === undefined || typeof n !== "number" || !isFinite(n)) return base();
      var f = ESCALONES[Math.max(0, Math.min(ESCALONES.length - 1, Math.round(n)))], o = {};
      ORDEN.forEach(function (k) { o[k] = f[k]; }); return o;
    }
    // cuánto hay que moverse para recortar otra vez (null si nada va por radio)
    function paso(rep) {
      var m = null; ORDEN.forEach(function (k) { if (FUENTES[k].que === "radio" && rep[k] !== null && rep[k] !== undefined) m = m === null ? rep[k] : Math.min(m, rep[k]); });
      return m === null ? null : Math.max(PASO_MIN, m / 4);
    }
    // las instancias de `mat` (16 números por instancia, la posición en 12 y 14) a ≤ r de (cx, cz): sus índices en `idx`, en orden; devuelve cuántas
    function recorta(mat, n, cx, cz, r, idx) {
      var k = 0, r2 = r * r;
      for (var i = 0; i < n; i++) { var dx = mat[i * 16 + 12] - cx, dz = mat[i * 16 + 14] - cz; if (dx * dx + dz * dz <= r2) idx[k++] = i; }
      return k;
    }
    // el hundimiento del fondo con menos celdas: la rejilla más gruesa se separa más del relieve fino en las vaguadas, así que baja en proporción
    function hundimiento(celdas, celdasBase, baja) { return celdas >= celdasBase ? baja : baja * celdasBase / Math.max(1, celdas); }
    return { FUENTES: FUENTES, ORDEN: ORDEN, ESCALONES: ESCALONES, PASO_MIN: PASO_MIN, base: base, reparto: reparto, paso: paso, recorta: recorta, hundimiento: hundimiento };
  })();
  // [puro:fin]

  // [motor:inicio]
  var VrPresupuesto = (function () {
    var P = VrPresupuestoPuro, F = {}, rep = P.base(), escalon = null, cx = NaN, cz = NaN, pasoM = null, cuenta = { cambios: 0, recortes: 0 };
    function copia(m) { return { m: m, mat: new Float32Array(m.instanceMatrix.array), col: m.instanceColor ? new Float32Array(m.instanceColor.array) : null, vis: m.visible }; }
    function marcaSubida(m, k) { m.count = k; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; if (m.frustumCulled !== false && k > 0) m.computeBoundingSphere(); }
    function restaura(f) {
      f.copias.forEach(function (c) { c.m.instanceMatrix.array.set(c.mat); if (c.col) c.m.instanceColor.array.set(c.col); c.m.visible = c.vis; marcaSubida(c.m, f.n); });
      f.r = null;
    }
    function recortaInst(f, r) {   // por un suceso (cambio de escalón o paso de umbral), no por fotograma
      var c0 = f.copias[0], k = P.recorta(c0.mat, f.n, cx, cz, r, f.idx);
      for (var j = 0; j < f.copias.length; j++) {
        var c = f.copias[j], a = c.m.instanceMatrix.array, ac = c.col ? c.m.instanceColor.array : null;
        for (var q = 0; q < k; q++) {
          var i = f.idx[q], s, d;
          for (s = i * 16, d = q * 16; s < i * 16 + 16; s++, d++) a[d] = c.mat[s];
          if (ac) for (s = i * 3, d = q * 3; s < i * 3 + 3; s++, d++) ac[d] = c.col[s];
        }
        c.m.visible = c.vis && k > 0; marcaSubida(c.m, k);
      }
      f.r = r; f.k = k; cuenta.recortes++;
    }
    function aplicaUna(id) {
      var f = F[id]; if (!f) return; var v = rep[id];
      if (f.tipo === "valor") { if (f.puesto !== v) { f.puesto = v; f.fn(v); } return; }
      if (v === null || v === undefined) { if (f.r !== null) restaura(f); return; }
      if (!isFinite(cx)) return;   // aún no se sabe dónde está la cabeza: lo hará el siguiente mueve
      recortaInst(f, v);
    }
    function aplicaTodo() { P.ORDEN.forEach(aplicaUna); }
    // una fuente de valor: fn(valor) solo cuando su valor cambia; al apuntarse dentro de VR recibe ya el de su escalón
    function fuente(id, fn) { F[id] = { tipo: "valor", fn: fn, puesto: P.FUENTES[id] ? P.FUENTES[id].base : undefined }; aplicaUna(id); }
    // mallas instanciadas que comparten índice: la de delante da la posición. Los colores por instancia se copian al apuntarse (no cambian después)
    function instancias(id, mallas) {
      var n = mallas[0].instanceMatrix.count;
      F[id] = { tipo: "inst", copias: mallas.map(copia), n: n, idx: new Int32Array(Math.max(1, n)), r: null, k: n };
      aplicaUna(id);
    }
    function renueva(id) {
      var f = F[id]; if (!f || f.tipo !== "inst") return;
      f.copias.forEach(function (c) { c.mat.set(c.m.instanceMatrix.array); });   // el módulo acaba de escribir las n en su orden
      if (f.r !== null) { f.copias.forEach(function (c) { c.m.count = f.n; }); var r = f.r; f.r = null; if (isFinite(cx)) recortaInst(f, r); else restaura(f); }
    }
    function olvida(id) { delete F[id]; }
    function ponEscalon(n) {
      var fuera = n === null || n === undefined;
      escalon = fuera ? null : Math.max(0, Math.min(P.ESCALONES.length - 1, n | 0));
      rep = P.reparto(escalon); pasoM = P.paso(rep); if (fuera) { cx = NaN; cz = NaN; }
      cuenta.cambios++; aplicaTodo();
    }
    // cada fotograma en VR (29_vr): sin reservas; solo recorta al moverse más que el umbral
    function mueve(x, z) {
      if (pasoM === null) return;
      var dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < pasoM * pasoM) return;   // con cx sin poner (NaN) la comparación es falsa: recorta esa vez
      cx = x; cz = z;
      for (var i = 0; i < P.ORDEN.length; i++) { var f = F[P.ORDEN[i]]; if (f && f.tipo === "inst") aplicaUna(P.ORDEN[i]); }
    }
    function estado() {
      var o = { escalon: escalon, reparto: rep, paso: pasoM, centro: isFinite(cx) ? [cx, cz] : null, cambios: cuenta.cambios, recortes: cuenta.recortes, fuentes: {} };
      Object.keys(F).forEach(function (id) { var f = F[id]; o.fuentes[id] = f.tipo === "valor" ? { valor: f.puesto } : { radio: f.r, dibujadas: f.r === null ? f.n : f.k, total: f.n }; });
      return o;
    }
    if (typeof window !== "undefined" && window) window.__vrPresupuesto = estado;   // pruebas y banco (escalón fijo por la perilla xrnivel, con la VR simulada)
    return { fuente: fuente, instancias: instancias, renueva: renueva, olvida: olvida, ponEscalon: ponEscalon, mueve: mueve, estado: estado };
  })();
  // [motor:fin]

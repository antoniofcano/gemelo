// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Mundo, suelo, copaAlta, kcor, desp, tinte, aviva, colorEn, copas, cIn, marc, med
// Consume: 01_datos (D, b64, i16, RES), 01a_aparato (Aparato), 02b_cola (ColaExt), 10_ndvi (rampa, ndviRel)
// ===============================================================================
  // ---------- el mundo: teselas de 256 m con relieve, copa, color del suelo, nube y ortofoto. Todo lo demás pregunta aquí (suelo, copaAlta, colorSuelo, orto).
  // MU5-n (A3-1a): el Mundo pasó a TypeScript, apps/web/src/mundos/exterior/teselas.ts (Mundos.creaMundo), con la decodificación de cada tesela en la Cola
  // del exterior (L1-05), las teselas fuera de rango sueltas (L2-03) y su libera() de componente («mundo-teselas», del exterior; lo registra 90_final.js).
  // Aquí queda, como extracción parcial, lo que no es del Mundo: los alias de siempre, el tinte de la ortofoto (kcor y tinte son primitivas que reescriben
  // 09_camara y 10_ndvi: no pueden ser importaciones, MUNDOS §9.3) y el censo de árboles.
  var Mundo = Mundos.creaMundo({
    D: D, RES: RES, b64: b64, i16: i16,
    busqueda: typeof location !== "undefined" ? location.search : "",
    ortoMaxDefecto: function () { return Aparato.politica().ortoMax; },   // AG-0.3: 8 en móvil, gafas o poca memoria; 20 en escritorio (01a_aparato.js)
    ahora: function () { return performance.now(); },
    lienzo: function () { return document.createElement("canvas"); },
    imagen: function () { return new Image(); },
    trae: function (u) { return fetch(u); },
    cola: function () { return typeof ColaExt !== "undefined" ? ColaExt : null; },   // 02b_cola se monta después: se pregunta al llegar cada tesela
    consola: console
  });
  var suelo = Mundo.suelo, copaAlta = Mundo.copaAlta, colorSuelo = Mundo.colorSuelo, orto = Mundo.orto;

  // La ortofoto enseña la copa corrida hacia el este según su altura (ajuste empírico medido en otra finca y aplicado sin recalibrar:
  // ~1,2 m a 1 m de altura, ~2,5 m a 4 m). Para pintar un punto del LiDAR se mira el píxel donde la ortofoto lo dibuja.
  var kcor = 1;
  function desp(h) { return kcor * (1.2 * Math.min(h, 1) + 0.42 * Math.max(h - 1, 0)); }
  var tmpC = [0, 0, 0], PLATA = [0.58, 0.62, 0.52];
  // El verde de la ortofoto lleva la sombra de la copa: se aclara un poco hacia el gris plateado del olivo.
  var tinte = false;   // MU5-n: la escala del NDVI (antes ndLo/ndHi, aquí) vive en src/mundos/exterior/ndvi.ts (Ndvi.escala)
  function aviva(c3, x, y) {
    for (var i = 0; i < 3; i++) c3[i] = Math.min(1, 0.8 * c3[i] * 1.35 + 0.2 * PLATA[i]);
    if (tinte && x !== undefined) {   // el tono de la copa sigue al NDVI de su zona; la luz y la sombra del follaje se conservan
      var lum = (c3[0] + c3[1] + c3[2]) / 3, t = ndviRel(x, y), r = rampa(t), mezcla = 0.78, f = 0.45 + 0.9 * lum;
      for (var k = 0; k < 3; k++) c3[k] = Math.min(1, c3[k] * (1 - mezcla) + r[k] * f * mezcla);
    }
  }
  function colorEn(x, y, h, out) { orto(x + desp(h), y + kcor * 0.2 * Math.min(h / 2, 1), out); }

  // ---- datos
  // el registro de árboles: copas[i] = [x, y, h, r8, parcela+1] y, en columnas paralelas opcionales (CONTRATOS §1.1), copas_id[i] (id estable) y copas_tipo[i]
  // (olivo-tipo del catálogo, ADR-0012); sin ellas, −1: sin id y sin tipo (se dibuja como siempre)
  var copas = D.copas.map(function (c, i) { var rm = c[3].reduce(function (a, b) { return a + b; }, 0) / 8; return { i: i, id: D.copas_id ? D.copas_id[i] : -1, tipo: D.copas_tipo ? D.copas_tipo[i] : -1, x: c[0], y: c[1], h: c[2], perfil: c[3], dentro: c[4] > 0, parc: c[4] - 1, oliv: !(c[2] > 8 || (c[2] > 6.5 && rm < 2.2)) }; });
  var cIn = copas.filter(function (c) { return c.dentro && c.oliv; });
  var marc = D.marcados.map(function (m, i) { return { i: i, x: m[0], y: m[1], par: m[2], parc: m[3] }; });
  var med = function (a) { var s = a.slice().sort(function (p, q) { return p - q; }); return s.length ? s[Math.floor(s.length / 2)] : 0; };


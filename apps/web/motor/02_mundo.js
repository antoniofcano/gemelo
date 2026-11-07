// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Mundo, suelo, copaAlta, TinteOrto, aviva, colorEn, copas, cIn, marc, med
// Consume: 01_datos (D, b64, i16, RES), 01a_aparato (Aparato), 02b_cola (ColaExt), 10_ndvi (rampa, ndviRel)
// ===============================================================================
  // ---------- el mundo: teselas de 256 m con relieve, copa, color del suelo, nube y ortofoto. Todo lo demás pregunta aquí (suelo, copaAlta, colorSuelo, orto).
  // MU5-n (A3-1a): el Mundo pasó a TypeScript, apps/web/src/mundos/exterior/teselas.ts (Mundos.creaMundo), con la decodificación de cada tesela en la Cola
  // del exterior (L1-05), las teselas fuera de rango sueltas (L2-03) y su libera() de componente («mundo-teselas», del exterior; lo registra 90_final.js).
  // Aquí queda, como talón (A3-8a; antes, extracción parcial), lo que no es del Mundo: los alias de siempre, el tinte de la ortofoto (kcor y tinte, antes primitivas que reescribían
  // 09_camara y 10_ndvi: no pueden ser importaciones, MUNDOS §9.3) y el censo de árboles.
  // [talón] apps/web/src/mundos/exterior/teselas.ts
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

  // A3-8a: el color de la ortofoto para lo que se dibuja encima (el desfase de la copa, kcor, y el aclarado con el tinte del NDVI, tinte) y el registro de
  // árboles viven en apps/web/src/mundos/exterior/orto-tinte.ts. kcor y tinte eran primitivas que reescribían 09_camara y 10_ndvi: ahora son TinteOrto.E.
  var TinteOrto = Mundos.creaTinteOrto({
    orto: orto,
    ndviRel: function (x, y) { return ndviRel(x, y); }, rampa: function (t) { return rampa(t); }   // 10_ndvi va después en el montaje: se piden al usarlos
  });
  var aviva = TinteOrto.aviva, colorEn = TinteOrto.colorEn;

  // ---- datos: el registro de árboles (copas, con su id y su olivo-tipo si el índice los trae), los de dentro que son olivos (cIn), las marcas y la mediana
  var Copas = Mundos.creaCopas(D);
  var copas = Copas.copas, cIn = Copas.cIn, marc = Copas.marc, med = Copas.med;

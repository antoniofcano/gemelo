// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: OT, VIVO
// Consume: 01_datos (D, $, tinta, fmt), 02_mundo (suelo, copas, cIn, marc, med), 02c_componentes (Componentes), 02i_materiales (Materiales),
//   02j_estaticos (Estaticos), 03_escena (scene), 04d_sombreado_tiles (UN), 09_camara (orb, pon), 10_ndvi (NDV, pintaNdvi, ndviIdx),
//   12_paseo (paseando, salePaseo), 13_parcelas (parcelas, fincas, claseUsda, elegirParcela, elegirFinca)
// Nota: Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/historia.ts: HistoriaPuro y el componente «historia-recorrido» de los mundos ["exterior"] (el recorrido guiado de Hituelo con lo que sabe OlivarTrack), con su libera() (escuchas, puntos de escena y mallas de resalte). OT (la instantánea D.ot) y VIVO (hoy null) los leen 19_balizas y 23_estacion. El trozo [puro] lo evalúa en Node pruebas/guardianes/historia_vivo.test.js (que lee el .ts como JavaScript, _fuente.js).
// ===============================================================================
  // ---------- la historia: un recorrido guiado que cruza el gemelo con lo que sabe OlivarTrack. MU5-n (A3-7b1): migrado a TypeScript; el código vive en
  // apps/web/src/mundos/exterior/historia.ts (HistoriaPuro y el componente «historia-recorrido» de los mundos ["exterior"], con su libera()). Aquí solo se cablea lo del legado:
  // paseando y ndviIdx (que otros reescriben) entran por getter, y ndviIdx se escribe con ponNdviIdx. OT (la instantánea D.ot) y VIVO (lo que marcaría Vigía, hoy null) los leen 19 y 23.
  // [talón] apps/web/src/mundos/exterior/historia.ts
  var Historia = Mundos.creaHistoria({
    THREE: THREE, D: D, $: $, tinta: tinta, fmt: fmt, suelo: suelo, copas: copas, cIn: cIn, marc: marc, med: med, Materiales: Materiales, Estaticos: Estaticos, scene: scene, UN: UN,
    orb: orb, pon: pon, NDV: NDV, pintaNdvi: pintaNdvi, get ndviIdx() { return ndviIdx; }, ponNdviIdx: function (i) { ndviIdx = i; }, get paseando() { return paseando; }, salePaseo: salePaseo,
    parcelas: parcelas, fincas: fincas, claseUsda: claseUsda, elegirParcela: elegirParcela, elegirFinca: elegirFinca
  });
  var OT = Historia.OT, VIVO = Historia.VIVO;
  Componentes.registra(Mundos.manifiestoHistoria(Historia));

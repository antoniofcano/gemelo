// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: OlivosTiles
// Consume: 01_datos (D), 02_mundo (copas), 02c_componentes (Componentes), 04b_escena3d (Escena3D), 06_arboles (gArboles)
// ===============================================================================
  // ---------- los olivos del tileset (F1d paso 4, ADR-0015; contrato tileset v2 en contratos/tileset.schema.json), solo cuando hay escena 3D Tiles (04b_escena3d.js). MU5-n (A3-1b):
  // migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/olivos-tiles.ts (IdTiles, las huellas y la máscara; el módulo con su estado; y el componente «olivos-tiles» de
  // los mundos ["exterior"], con un libera() que suelta las mallas de olivo de cada tesela). Los olivos de media y larga distancia los dibuja el tileset (las instancias de cada glb) y
  // los de cerca, el motor (07b y los generados): una MÁSCARA aparta del tileset los que dibuja el motor. Identidad: instancia → _INDICE_COPA → copas[g], con la huella del registro
  // y la de cada tesela comprobadas (crypto.subtle). Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/olivos-tiles.ts
  var OlivosTiles = Mundos.creaOlivosTiles({
    D: D, copas: copas, Escena3D: Escena3D, gArboles: gArboles,
    subtle: typeof crypto !== "undefined" && crypto && crypto.subtle ? crypto.subtle : null,
    consola: console
  });
  Componentes.registra(Mundos.manifiestoOlivosTiles(OlivosTiles));

// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: TopeOlivos
// Consume: 02l_tope_tiles (TopeTilesPuro)
// ===============================================================================
  // ---------- Q0n: los olivos que dibuja el propio motor (07b, 07ab, 07ac) respetan el tope de triángulos de cada nivel de VR (doc/sistema/VR.md#tope-de-triángulos-de-los-olivos-del-motor-q0n).
  // MU5-n (A3-2b): migrado a TypeScript; el lazo (TopeOlivosPuro) y el estado compartido (TopeOlivos) viven en apps/web/src/mundos/exterior/tope-olivos.ts. 07b lo mueve y 04b lee la parte del tileset.
  // El lazo reutiliza el de Q0k (02l, TopeTilesPuro), que sigue en el legado y se pasa por argumento. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/tope-olivos.ts
  var TopeOlivos = Mundos.creaTopeOlivos({ TopeTilesPuro: TopeTilesPuro, busqueda: typeof location !== "undefined" ? location.search : "" });

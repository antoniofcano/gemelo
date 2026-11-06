// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Escalera, Generados
// Consume: 01_datos (D, VRP, FACTOR_R8_GEN, factorCopaDeConfig), 01a_aparato (Aparato), 02_mundo (suelo), 02c_componentes (Componentes, Config),
//   02i_materiales (Materiales), 03_escena (renderer, scene, camera, Estado), 06_arboles (gArboles), 12_paseo (paseando, pp),
//   15_tiempo (nodosTiempoTsl, parcheTiempo)
// ===============================================================================
  // ---------- olivos GENERADOS cerca (ADR-0017) y la ESCALERA de todos (ADR-0019, ADR-0022), POR DEFECTO (O10a) si la finca trae copas_param y copas_id; ?olivos=0 los apaga.
  // MU5-n (A3-2a): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/generados*.ts (la escalera y la decisión, que son puras; las variantes horneadas y los
  // impostores; la cola propia; el sombreado y el fundido; el lote; y el módulo con su estado), componente «olivos-generados» de los mundos ["exterior"], con un libera() que
  // suelta el lote, los materiales con sus texturas, el trabajador, la cola propia y la caché de recetas. Lo mueve 07b_arboles.js (actualiza y paso). Aquí solo se cablea lo
  // del legado: lo que cambia después de cargarse (FACTOR_R8_GEN, el renderer, la escena, quien pasea, fetch) se pide en cada uso, y el import() del constructor se queda
  // escrito aquí para que Vite lo trocee como antes. parcheTiempo (15_tiempo) va después en el montaje: es una función declarada (se iza) y solo se llama al compilar.
  // [talón] apps/web/src/mundos/exterior/generados.ts
  var Escalera = Mundos.Escalera;
  var Generados = Mundos.creaGenerados({
    THREE: THREE, D: D, VRP: VRP, Aparato: Aparato, Config: Config, Materiales: Materiales, gArboles: gArboles, camera: camera, Estado: Estado, suelo: suelo,
    factorR8Gen: function () { return FACTOR_R8_GEN; }, factorCopaDeConfig: factorCopaDeConfig, parcheTiempo: parcheTiempo, tiempoTsl: function () { return typeof nodosTiempoTsl === "function" ? nodosTiempoTsl : null; },   // A3-4: los nodos del tiempo (15_tiempo) para la TSL apagada
    busqueda: location.search, reloj: performance, consola: console, ventana: typeof window !== "undefined" ? window : null,
    cargaConstructor: function () { return typeof window !== "undefined" && window.OlivoGen ? Promise.resolve(window.OlivoGen) : import("gemelo-olivo"); },
    renderer: function () { return typeof renderer !== "undefined" ? renderer : null; },
    scene: function () { return typeof scene !== "undefined" ? scene : null; },
    paseo: function () { return typeof paseando !== "undefined" && paseando && typeof pp !== "undefined" ? pp : null; },
    red: function () { return typeof fetch === "function" ? fetch : null; }
  });
  Componentes.registra(Mundos.manifiestoGenerados(Generados));

// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: ComponentesPuro, Reparto, Bus, Pausa, ConfigPuro, Teclas, Componentes, Config
// Consume: 01_datos (D)
// Nota: Talón (MU5-n, A3-8a) del núcleo de componentes (ADR-0023), en apps/web/src/nucleo/: ComponentesPuro y Componentes (componentes.ts: registro, encendido URL > servidor > defecto, fases del bucle, filtro por mundo), Bus, Reparto y Pausa (bus.ts; catálogo en contratos/eventos.json), Teclas (teclas.ts) y Config (config.ts: GET /api/config del mismo origen al cargar, solo con D.base /teselas/… o ?api=; caída al código; contratos/config.schema.json). Publican además window.__componentes y window.__config (pruebas y ?debug).
// ===============================================================================
  // ---------- núcleo de componentes (ADR-0023, doc/sistema/COMPONENTES.md §3): el registro, el bus de eventos y las teclas.
  // Un componente es un fichero que en su primer nivel solo define su lógica pura y llama a Componentes.registra({ … }). Nada se monta al registrarse:
  // Componentes.arranca() (en 90_final.js, cuando ya están todos los ficheros) decide quién se enciende (URL > configuración del servidor > defecto del
  // manifiesto), los monta en orden de dependencias y, desde entonces, el bucle llama a sus fases sin nombrarlos (mundo, tarde, trasRender, pausa).
  // Quitar un componente no rompe a nadie: los demás le hablan por el Bus o por Componentes.api(id), que devuelve null si no está.
  // MU5-n (A3-8a): migrado entero a TypeScript, en apps/web/src/nucleo/ (componentes.ts, bus.ts, teclas.ts y config.ts); aquí solo se les da lo del legado
  // (el reloj, la URL, el documento, la ventana, la consola, fetch y D.base), en el mismo orden de creación de antes.
  // [talón] apps/web/src/nucleo/componentes.ts
  var ComponentesPuro = Nucleo.ComponentesPuro;
  var Reparto = Nucleo.creaReparto({ ahora: function () { return performance.now(); } });   // Q0h: el reparto del JS por bloque (lo enciende 30_mide)
  var Bus = Nucleo.creaBus({ consola: typeof console !== "undefined" ? console : null });   // contratos/eventos.json
  var Pausa = Nucleo.creaPausa(Bus);   // C9a: el mundo en pausa (un juego a pantalla completa); emite «mundo:pausa»
  var ConfigPuro = Nucleo.ConfigPuro;
  var Teclas = Nucleo.creaTeclas({ ventana: typeof window !== "undefined" ? window : null, consola: typeof console !== "undefined" ? console : null });
  var Componentes = Nucleo.creaComponentes({
    bus: Bus,
    reparto: Reparto,
    ahora: function () { return performance.now(); },
    busqueda: function () { return (typeof location !== "undefined" && location.search) || ""; },
    documento: typeof document !== "undefined" ? document : null,
    consola: typeof console !== "undefined" ? console : null,
    ventana: typeof window !== "undefined" ? window : null   // window.__componentes (pruebas)
  });
  // la configuración del servidor, pedida UNA vez al cargar: Config.listo, Config.al(fn), Config.param(ruta, código, url), Config.umbrales(código, url),
  // Config.tablaEpocas(finca) y Config.estado() (window.__config, ?debug). Su bloque «componentes» va a Componentes.configura.
  var Config = Nucleo.creaConfig({
    fetch: typeof fetch === "function" ? function (u, o) { return fetch(u, o); } : null,
    busqueda: typeof location !== "undefined" ? location.search : "",
    base: typeof D !== "undefined" && D ? D.base : "",
    componentes: Componentes,
    ventana: typeof window !== "undefined" ? window : null,
    consola: typeof console !== "undefined" ? console : null
  });

// La entrada del cliente web (A3-8c, MU5-n; ADR-0033 y MUNDOS §9): crea los objetos del gemelo EN ORDEN y hace el cableado del arranque y del bucle.
// Antes era apps/web/motor/ (el legado): 93 ficheros concatenados por orden alfabético dentro de una IIFE. Desde A3-8c no hay concatenación: Vite empaqueta
// este módulo (lo importa la entrada que escribe herramientas/genera_motor.mjs, que solo añade la hoja de estilos y el índice de la finca en la página).
//
// El orden de creación ES el de antes y no se puede cambiar a la ligera: cada `crea…` recibe POR VALOR lo que crearon los pasos anteriores, y lo que define un
// paso posterior lo pide por función o por getter (se lee al usarlo, ya con todo montado). Por eso el cuerpo vive en UNA función (arranca), con `var` y
// `function` como en la IIFE de siempre: las declaraciones se izan igual, y un getter que pregunta `typeof X !== "undefined"` por algo de un paso posterior
// sigue viendo undefined, no un error. Cada paso lleva su marca, `// [paso: NN_nombre]`, con el nombre del fichero de motor/ del que viene: así la historia
// (git, los ADR, COMPONENTES.md) sigue llevando a su sitio, y los guardianes leen un paso con pruebas/guardianes/_fuente.js (fuenteMotor("NN_nombre.js")).
// Qué expone y qué consume cada pieza lo dicen las importaciones de src/ (y dependency-cruiser lo vigila: nadie de src/ importa este fichero).
//
// Lo que reescribe más de un sitio ya no son variables sueltas: vive en el objeto de su dueño (Estado, Paseo.E, Vida.E, FactorR8.E, TinteOrto.E, FechaNdvi.E,
// Marcadores.listo(), Tiempo.tMundo(), Paisaje.agua(), Follaje.sombras(), Historia.OT, Parcelas.parcelaSel()…), y se lee ahí en cada uso (estado_mutable.test.js).
// La marca «// [talón] apps/web/src/….ts» de un paso dice dónde vive su código (de cuando el paso era un fichero de motor/ que solo llamaba a su fábrica).
// @ts-expect-error three no trae tipos en el repo (MUNDOS §9.1): el arranque lo pasa por argumento a quien lo usa
import * as THREE from "three";
import * as Nucleo from "./nucleo/index.ts";
import * as Mundos from "./mundos/index.ts";
import * as Interfaz from "./ui/index.ts";

// lo inyecta Vite (vite.config.js, define): la build («pantalla» o «vr»)
declare const __GEMELO_BUILD__: string;

/** Monta el gemelo: los pasos en el orden de siempre, de los datos de la página (#datos) al bucle. Se llama una vez, al cargar el módulo. */
function arranca(): void {
  // [paso: 01_datos] Abre la IIFE que cierra 99_cierre.js y activa "use strict". Primer módulo: define D (los datos de la finca) y las utilidades.
  var D = JSON.parse(document.getElementById("datos")!.textContent!);
  var $ = function (id: string): any { return document.getElementById(id); };
  // CSP (V12): el HTML que arma el motor no lleva atributos style (style-src 'self' lo rechaza). Lo que depende de un dato (un color, un ancho) va en
  // data-fondo="#rrggbb" y data-ancho="12.3" (en %), y esto lo pasa a CSSOM, que la CSP sí admite. Se llama tras cada innerHTML que los lleve.
  function tinta(raiz: any) { var l = raiz.querySelectorAll("[data-fondo],[data-ancho]"), i, e; for (i = 0; i < l.length; i++) { e = l[i]; if (e.dataset.fondo) e.style.background = e.dataset.fondo; if (e.dataset.ancho) e.style.width = e.dataset.ancho + "%"; } }
  var fmt = function (n: any, d?: number) { return Number(n).toLocaleString("es-ES", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  function b64(s: string) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function i16(s: string) { var u = b64(s); return new Int16Array(u.buffer, 0, u.length >> 1); }

  // La caja del mundo, en metros relativos a centro_utm. Las rejillas de datos (relieve, copa, suelo, nube y ortofoto) ya no viven aquí: están en las teselas (ver Mundo).
  var RES = D.res, x0 = D.ext[0], yN = D.ext[1], ANCHO = D.ext[2] - D.ext[0], ALTO = D.ext[1] - D.ext[3];
  var EXT = Math.max(ANCHO, ALTO), FOG0 = Math.max(900, EXT * 1.1), FOG1 = Math.max(2600, EXT * 3.2), DIST_MAX = Math.max(900, EXT * 1.1), DIST_INI = Math.max(700, EXT * 0.85);   // la cámara y la niebla siguen a la superficie de la finca
  var DEPURA = /[?&]debug\b/.test(location.search);
  var VRP = { on: false, hierba: 32 };   // el perfil de las gafas VR (lo fija 29_vr.js; fuera de VR no cambia nada)
  // Radio dibujado de la copa = r8 × factor (decisiones 48 y 81, ADR-0017 y ADR-0022): FactorR8.E.r8, el nivel de siempre (0,5), y FactorR8.E.gen, los
  // olivos del constructor (1), en apps/web/src/mundos/exterior/factor-r8.ts con su explicación (A3-8c: antes, FACTOR_R8 y FACTOR_R8_GEN, variables de este
  // paso que reescribía factorCopaDeConfig). ?factorR8= > configuración del servidor (escalera.factorCopa, que pone 07ab con factorCopaDeConfig()) > D.config > código.
  var FactorR8 = Mundos.creaFactorR8({ busqueda: location.search, D: D, param: function (ruta, codigo, url) { return Config.param(ruta, codigo, url); } });   // Config (02c) se pide al usarlo
  function factorCopaDeConfig() { return FactorR8.deConfig(); }
  // ESC_R8 = FACTOR_R8 / 0,5 escala lo que hoy se dibuja con r8 tal cual (relleno, sombras, ramas): con 0,5 vale 1 y no cambia nada
  var ESC_R8 = FactorR8.E.r8 / 0.5;

  // [paso: 01a_aparato]
  // ---------- AG-0.3: UNA sola detección del aparato (doc/sistema/COMPONENTES.md#aparato). MU5-n (A3-8a): migrado a TypeScript; el código vive en
  // apps/web/src/nucleo/aparato.ts (AparatoPuro, que copia el cargador, y creaAparato). Es el ÚNICO sitio que lee navigator.userAgent / deviceMemory /
  // hardwareConcurrency / maxTouchPoints; aquí solo se le da el navigator y la ventana (donde publica window.__aparato).
  // [talón] apps/web/src/nucleo/aparato.ts
  var Aparato = Nucleo.creaAparato({ navegador: typeof navigator !== "undefined" && navigator ? navigator : {}, ventana: typeof window !== "undefined" && window ? window : null });
  // [paso: 02_mundo]
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
    imagen: function () { return new Image() as any; },
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
  // [paso: 02b_cola]
  // ---------- la cola de trabajos (A1-10 / MU1-6): migrada a TypeScript; el código vive en apps/web/src/nucleo/cola.ts (MUNDOS §6 y §9.4)
  // [talón] apps/web/src/nucleo/cola.ts
  var CargaPuro = Nucleo.CargaPuro;
  var Cola = Nucleo.creaCola({ ahora: function () { return performance.now(); } });
  var ColaExt = Nucleo.creaColaDeMundo(Cola, "exterior");   // MU2-6: lo que pide el exterior, con claves «exterior:…»; al congelarlo se aparca (MUNDOS §2, «Cómo quedó (MU2-6)»)
  // [paso: 02c_componentes] Talón (MU5-n, A3-8a) del núcleo de componentes (ADR-0023), en apps/web/src/nucleo/: ComponentesPuro y Componentes (componentes.ts: registro, encendido URL > servidor > defecto, fases del bucle, filtro por mundo), Bus, Reparto y Pausa (bus.ts; catálogo en contratos/eventos.json), Teclas (teclas.ts) y Config (config.ts: GET /api/config del mismo origen al cargar, solo con D.base /teselas/… o ?api=; caída al código; contratos/config.schema.json). Publican además window.__componentes y window.__config (pruebas y ?debug).
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
    ventana: typeof window !== "undefined" ? window as any : null   // window.__componentes (pruebas)
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
  // [paso: 02d_laminas] Talón (MU5-n, A3-7a) de apps/web/src/ui/laminas.ts, componente «laminas-mundo» de todo mundo. Servicio (ADR-0023, C8): LaminasPuro y Laminas (un lienzo 2D como textura de un cartel en el mundo: colocación delante a la altura de los ojos, giro suave, cierre por distancia o al salir de VR, repintado solo si cambia la firma, liberado entero y alTocar(u, v) para el rayo y el gatillo). Sin reloj propio: lo mueve 90_final (Laminas.revisa) y 29_vr (Laminas.toca). Los trozos [puro:…] y [motor:…] (en el .ts) los evalúa en Node pruebas/guardianes/laminas.test.js.
  // ---------- las láminas (ADR-0023, C8; doc/sistema/COMPONENTES.md): un lienzo 2D como textura de un cartel en el mundo, anclado al mundo, a la altura de los ojos y
  // delante de la mirada; se vuelve despacio hacia quien lo mira, se repinta SOLO si cambia lo que se ve, se cierra solo si te alejas o sales de VR y se libera entero.
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/laminas.ts (LaminasPuro y Laminas), componente «laminas-mundo» de TODOS los mundos con un
  // libera() que cierra las que queden y se borra del Bus. Aquí solo se cablea lo del legado: casi todo lo que usa se monta DESPUÉS de este módulo (InfoDibujo en
  // 02h; scene, camera, renderer y texColor en 03; VRX en 29) y entra por getter.
  // [talón] apps/web/src/ui/laminas.ts
  var LaminasPuro = Interfaz.LaminasPuro;
  var Laminas = Interfaz.creaLaminas({
    THREE: THREE, Bus: Bus, get Materiales() { return Materiales; }, get InfoDibujo() { return InfoDibujo; }, get scene() { return scene; }, get camera() { return camera; }, get renderer() { return renderer; },
    get texColor() { return texColor; }, get VRX() { return VRX; }, documento: document
  });
  Componentes.registra(Interfaz.manifiestoLaminas(Laminas));
  // [paso: 02e_entidades] Talón (MU5-n, A3-7a) de apps/web/src/ui/entidades.ts, componente «seleccion-usables» de todo mundo. Servicio (ADR-0023, C7): EntidadesPuro, Entidades (registro de tipos de cosas del mundo con id estable; cada módulo registra su tipo y responde por sus cosas) y Usables (la selección única para toque, clic, rayo VR y cercanía, la ficha común #ficha, el anillo de resaltado y los eventos usable:*). Publica además window.__usables (pruebas). EntidadesPuro vive en apps/web/src/nucleo/entidades.ts (A1-11); el registro y la selección, en ui/entidades.ts; su trozo [motor:…] lo evalúa en Node pruebas/guardianes/entidades.test.js.
  // ---------- entidades y usables (ADR-0023, C7; doc/sistema/COMPONENTES.md §6): las cosas del mundo con un id estable y UNA sola forma de elegirlas (el toque, el
  // clic, el rayo de VR y la cercanía), con la ficha común (#ficha) y el anillo de resaltado. La lógica pura vive en apps/web/src/nucleo/entidades.ts (A1-11).
  // MU5-n (A3-7a): el resto también; Entidades y Usables viven en apps/web/src/ui/entidades.ts, componente «seleccion-usables» de TODOS los mundos con un libera() que
  // suelta el anillo, la × de la ficha, su observador y la caja de acciones. Aquí solo se cablea lo del legado: casi todo lo que usa se monta DESPUÉS de este módulo
  // (scene y lienzo en 03, pp en 12, dr y enDron en 16, VRX en 29) o cambia (paseando), y entra por getter.
  // [talón] apps/web/src/ui/entidades.ts
  var EntidadesPuro = Nucleo.EntidadesPuro;
  var EntidadesUsables = Interfaz.creaEntidades({
    $: $, THREE: THREE, Bus: Bus, get Materiales() { return Materiales; }, get scene() { return scene; }, get lienzo() { return lienzo; }, get pp() { return pp; }, get dr() { return dr; },
    get enDron() { return Vida.E.enDron; }, get paseando() { return Paseo.E.paseando; }, get VRX() { return VRX; }, ventana: window, documento: document
  });
  var Entidades = EntidadesUsables.Entidades, Usables = EntidadesUsables.Usables;
  Componentes.registra(Interfaz.manifiestoEntidades(EntidadesUsables));
  // [paso: 02f_xr_perillas]
  // ---------- perillas de rendimiento VR por URL (Q0b; doc/sistema/VR.md#perillas-de-rendimiento-por-url) (A1-11 / MU1-7): migrado a TypeScript; el código vive en apps/web/src/nucleo/xr-perillas.ts (MUNDOS §9.4)
  // [talón] apps/web/src/nucleo/xr-perillas.ts
  var XrPerillas = Nucleo.creaXrPerillas({
    busqueda: typeof location !== "undefined" ? location.search : "",
    almacen: function () { return window.localStorage; },
    ignoradosOlivos: function () { return typeof TopeOlivos !== "undefined" ? TopeOlivos.ignorados : []; }
  });
  // [paso: 02g_vr_presupuesto]
  // ---------- el presupuesto de VR por escalón (Q0c-a) y el controlador de nivel (Q0c-b, Q0c-c), migrados a TypeScript (A1-12 / MU1-8):
  // el código vive en apps/web/src/nucleo/presupuesto.ts (MUNDOS §9.4, pieza 3; doc/sistema/VR.md)
  // [talón] apps/web/src/nucleo/presupuesto.ts
  var VrPresupuestoPuro = Nucleo.VrPresupuestoPuro;
  var VrControlPuro = Nucleo.VrControlPuro;
  var VrPresupuesto = Nucleo.creaVrPresupuesto({ ventana: typeof window !== "undefined" ? window as any : null });
  // [paso: 02h_render]
  // ---------- AG-3a / F1: el renderizador elegido y la lectura de lo dibujado (A1-11 / MU1-7): migrado a TypeScript; el código vive en apps/web/src/nucleo/render.ts (MUNDOS §6 y §9.4)
  // [talón] apps/web/src/nucleo/render.ts
  var Render = Nucleo.creaRender({
    busqueda: typeof location !== "undefined" && location ? location.search : "",
    build: typeof __GEMELO_BUILD__ !== "undefined" ? __GEMELO_BUILD__ : "pantalla",   // lo inyecta Vite (apps/web/vite.config.js)
    almacen: function () { return window.localStorage; },
    consola: typeof console !== "undefined" ? console : null
  });
  var InfoDibujo = Nucleo.InfoDibujo;
  // [paso: 02i_materiales]
  // ---------- AG-3a / F1 y MU5-0: la fábrica ÚNICA de los materiales propios del motor (doc/sistema/MATERIALES.md, MULTIVIEW §4, ADR-0031): migrada a
  // TypeScript; el código vive en apps/web/src/nucleo/materiales.ts. Da el material clásico de siempre (el mismo, con la misma función de parche) y, solo
  // con el renderizador nuevo (MU6) y si el material tiene variante TSL, la TSL. Lo vigilan pruebas/guardianes/materiales_f1.test.js y materiales.test.ts.
  // [talón] apps/web/src/nucleo/materiales.ts
  var Materiales = Nucleo.creaMateriales({
    THREE: THREE,
    render: Render,   // se lee en cada material: Render.tipo «nuevo» (hasta MU6, nunca) es lo único que abre la ruta TSL
    busqueda: typeof location !== "undefined" && location ? location.search : "",
    msaa: typeof XrPerillas !== "undefined" && XrPerillas ? XrPerillas.aa : true,   // se lee UNA vez (la perilla de MSAA de 02f), como antes
    almacen: function () { return window.localStorage; },   // «vista.a2c», leído UNA vez (33_ajustes se monta después; mismo patrón que 04f)
    consola: typeof console !== "undefined" ? console : null
  });
  // [paso: 02j_estaticos]
  // ---------- AG-1.15: objetos estáticos sin recomponer la matriz (Estaticos.congela(obj, excepto?), Estaticos.congelados(raiz)). MU5-n (A3-8a): migrado
  // a TypeScript; el código y su explicación viven en apps/web/src/nucleo/estaticos.ts.
  // [talón] apps/web/src/nucleo/estaticos.ts
  var Estaticos = Nucleo.Estaticos;
  // [paso: 02k_fusiona]
  // ---------- AG-1.13b: varias geometrías indexadas en una sola, con su color por vértice (la fauna y los perros: una InstancedMesh por pieza).
  // MU5-n (A3-8a): migrado a TypeScript; el código vive en apps/web/src/nucleo/geometria.ts, que recibe THREE (el núcleo no lo importa).
  // [talón] apps/web/src/nucleo/geometria.ts
  var fusionaGeometrias = Nucleo.creaFusionaGeometrias(THREE);
  // [paso: 02l_tope_tiles]
  // ---------- Q0k: el tileset 3D (04b_escena3d.js) respeta el tope de triángulos de cada nivel de VR (doc/sistema/VR.md#tope-de-triángulos-del-tileset-q0k).
  // MU5-n (A3-8a): migrado a TypeScript; el lazo (sube el error del tileset si sus triángulos pasan del tope y lo baja cuando sobra) vive en apps/web/src/nucleo/tope-tiles.ts.
  // [talón] apps/web/src/nucleo/tope-tiles.ts
  var TopeTilesPuro = Nucleo.TopeTilesPuro;
  // [paso: 02m_tope_olivos]
  // ---------- Q0n: los olivos que dibuja el propio motor (07b, 07ab, 07ac) respetan el tope de triángulos de cada nivel de VR (doc/sistema/VR.md#tope-de-triángulos-de-los-olivos-del-motor-q0n).
  // MU5-n (A3-2b): migrado a TypeScript; el lazo (TopeOlivosPuro) y el estado compartido (TopeOlivos) viven en apps/web/src/mundos/exterior/tope-olivos.ts. 07b lo mueve y 04b lee la parte del tileset.
  // El lazo reutiliza el de Q0k (02l, TopeTilesPuro), que sigue en el legado y se pasa por argumento. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/tope-olivos.ts
  var TopeOlivos = Mundos.creaTopeOlivos({ TopeTilesPuro: TopeTilesPuro as any, busqueda: typeof location !== "undefined" ? location.search : "" });
  // [paso: 03_escena]
  // ---- escena
  var lienzo = $("lienzo"), visor = $("visor");
  // F2a (doc/sistema/MULTIVIEW.md, ADR-0031): en la build de VR (super-three) se pide el multiview del WebGLRenderer clásico, `multiviewStereo`, salvo con la perilla xrmv a 0 (02f);
  // super-three solo lo enciende en una sesión XR con capas de proyección y OCULUS_multiview (29_vr pide «layers»). En la build de pantalla no se pasa nada:
  // el renderer se crea exactamente como siempre
  var opcionesRd: any = { canvas: lienzo, antialias: XrPerillas.aa }, MV = XrPerillas.multiview(Render.build);   // el MSAA lo decide la perilla de pruebas VR (02f)
  if (MV.activo) opcionesRd.multiviewStereo = true;
  if (MV.ignorado) console.warn("VR: ?" + MV.ignorado.param + "=" + MV.ignorado.valor + " ignorado: " + MV.ignorado.motivo);
  var renderer = new THREE.WebGLRenderer(opcionesRd);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  Aparato.enlaza({ vr: function () { return renderer.xr.isPresenting; }, gl: function () { return renderer.getContext(); }, sesion: function () { return renderer.xr.getSession(); } });   // AG-0.3: el aparato mide en este contexto
  var scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1);   // MU2-7: el near/far, el fondo, la niebla y qué luces cuelgan son del Ambiente del mundo activo (src/nucleo/ambiente.ts; el del exterior, src/mundos/exterior.ts), que el gestor de 90_final aplica al entrar
  Render.enlaza({ rd: renderer, escena: scene, camara: camera, camaraXr: function () { return renderer.xr.isPresenting ? renderer.xr.getCamera() : null; } });   // MUNDOS §6: Render.info(), .memoria() y .compila()
  // Color y luz modernos (three r152 y r155, ADR-0016): el motor calcula la luz en sRGB lineal y la salida se codifica en sRGB (outputColorSpace).
  // Convenio del motor: los colores escritos a mano en JS o en GLSL (por vértice, por instancia, literales de los sombreadores, multiplicadores de color)
  // son números «tal como se ven», en sRGB, y se pasan a lineal donde entran en la luz: Color.setRGB(r, g, b, SRGB), texColor(), ot_lin() o sRGBTransferEOTF().
  // Lo que se toca DESPUÉS de colorspace_fragment (sombra de nubes, escarcha, capa NDVI, modo Ortofoto) ya está en sRGB y se deja como está.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // AG-2.5: ?tono=agx|aces|neutral (doc/sistema/TONE-MAPPING.md). Sin la perilla (o «neutro») no se toca nada: three deja NoToneMapping, como siempre. Igual en las dos builds (three y super-three tienen las cuatro constantes)
  if (Render.tono.tono !== "neutro" && THREE[Render.tono.constante] !== undefined) { renderer.toneMapping = THREE[Render.tono.constante]; renderer.toneMappingExposure = Render.tono.expo; }
  var SRGB = THREE.SRGBColorSpace;
  // Luces físicas (r155): la intensidad ya no lleva el factor π implícito de r128, que aquí se devuelve. Encima, la calibración a ojo con capturas (ADR-0016):
  // con la luz en lineal, la misma intensidad aclara las sombras y apaga lo soleado; el sol sube un 50 % y el cielo un 10 % para que la tierra al sol
  // y a la sombra quede cerca de como se veía con r128 sin quemarse
  var LUZ_SOL = Math.PI * 1.5, LUZ_CIELO = Math.PI * 1.1;
  // las luces del exterior (las mueven 11_sol y 15_tiempo); no se cuelgan aquí: las cuelga su Ambiente al entrar en el exterior y las descuelga el de otro mundo
  var hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a60, 0.95 * LUZ_CIELO);
  var sol = new THREE.DirectionalLight(0xfff0d0, 0.55 * LUZ_SOL); sol.position.set(-120, 160, 90);
  function texColor(t: any) { t.colorSpace = SRGB; return t; }   // una textura que es color (canvas pintado a mano): three la pasa a lineal al leerla
  // colores por vértice o por instancia escritos en sRGB: el sombreador de vértices los pasa a lineal al leerlos (sRGBTransferEOTF solo existe en el de fragmentos)
  var GLSL_LIN = "vec3 ot_lin(vec3 c){ return mix(pow(c * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045)))); }\n";
  function colorVertSRGB(sh: any) {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + GLSL_LIN)
      .replace("#include <color_vertex>", "#include <color_vertex>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n vColor.rgb = ot_lin(vColor.rgb);\n#endif");
  }
  function colorCss(v: string) { var c = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); return new THREE.Color(c || "#888"); }

  var Estado = Nucleo.creaEstado();   // A1-13 (MU1-9, MUNDOS §9.4 fila 7): exag, modo y calidad, el estado que reescriben varios módulos, en un objeto (apps/web/src/nucleo/estado.ts)

  // [paso: 04b_escena3d]
  // ---------- la escena en 3D Tiles 1.1 (ADR-0015; formato en doc/sistema/TILES3D.md): la ÚNICA escena (T8 fase 2, decisión 79). MU5-n (A3-1b): migrada a TypeScript; el código vive en
  // apps/web/src/mundos/exterior/escena-tiles.ts (RayosPuro, limitaAviso, motivoMarco y el caché LRU propio, que son puros; el módulo con su estado; y el componente «escena-tiles» de los mundos
  // ["exterior"], con un libera() que suelta el TilesRenderer y lo que cuelga de él). Dibuja el relieve con 3DTilesRendererJS desde un tileset.json de tuberia/tiles3d/, con el sombreado de
  // 04d; sin tileset, o si falla, estado "sin" y el aviso #sinEscena. Los olivos del glb los gestiona 04c por los ganchos de engancha(). Aquí solo se cablea lo del legado; 04d, 04c y 09_camara
  // montan después de este módulo, así que se piden en cada uso (SombreadoTiles, OlivosTiles y objetivo no existen aún cuando una escena sin tileset falla al definirse).
  // [talón] apps/web/src/mundos/exterior/escena-tiles.ts
  var Escena3D = Mundos.creaEscena3D({
    THREE: THREE, D: D, Aparato: Aparato, CargaPuro: CargaPuro, TopeTilesPuro: TopeTilesPuro, TopeOlivos: TopeOlivos, XrPerillas: XrPerillas, Cola: Cola, Mundo: Mundo, suelo: suelo,
    renderer: renderer, scene: scene, camera: camera, Estado: Estado, busqueda: location.search, documento: typeof document !== "undefined" ? document : null, consola: console,
    SombreadoTiles: function () { return SombreadoTiles; },
    OlivosTiles: function () { return typeof OlivosTiles !== "undefined" ? OlivosTiles : null; },
    objetivo: function () { return typeof objetivo !== "undefined" ? objetivo : null; },
    cargaTiles: function () { return import("3d-tiles-renderer"); },   // la librería, en su trozo aparte (Vite)
    cargaBvh: function () { return import("three-mesh-bvh"); }   // solo con ?bvh
  });
  Componentes.registra(Mundos.manifiestoEscena3D(Escena3D));
  // [paso: 04c_olivos_tiles]
  // ---------- los olivos del tileset (F1d paso 4, ADR-0015; contrato tileset v2 en contratos/tileset.schema.json), solo cuando hay escena 3D Tiles (04b_escena3d.js). MU5-n (A3-1b):
  // migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/olivos-tiles.ts (IdTiles, las huellas y la máscara; el módulo con su estado; y el componente «olivos-tiles» de
  // los mundos ["exterior"], con un libera() que suelta las mallas de olivo de cada tesela). Los olivos de media y larga distancia los dibuja el tileset (las instancias de cada glb) y
  // los de cerca, el motor (07b y los generados): una MÁSCARA aparta del tileset los que dibuja el motor. Identidad: instancia → _INDICE_COPA → copas[g], con la huella del registro
  // y la de cada tesela comprobadas (crypto.subtle). Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/olivos-tiles.ts
  var OlivosTiles = Mundos.creaOlivosTiles({
    D: D, copas: copas, Escena3D: Escena3D, get gArboles() { return gArboles; },   // 06 se carga después de 04c: sin el getter, gArboles valía undefined al montar el talón (error «reading visible» en el bucle)
    subtle: typeof crypto !== "undefined" && crypto && crypto.subtle ? crypto.subtle : null,
    consola: console
  });
  Componentes.registra(Mundos.manifiestoOlivosTiles(OlivosTiles));
  // [paso: 04d_sombreado_tiles]
  // ---------- el sombreado del relieve (F1d, T5; T8 fase 2: la única escena es la 3D Tiles). MU5-n (A3-1a): el sombreado pasó a TypeScript,
  // apps/web/src/mundos/exterior/terreno.ts (Mundos.creaSombreadoTiles, Mundos.uniformesTerreno, Mundos.hash), con su libera() completo (L2-05: también las
  // texturas de cada tesela del Mundo) y su componente («terreno-sombreado», del exterior; lo registra 90_final.js). Cada glb del tileset cambia su
  // material por un Lambert con el parche del terreno al cargarse (load-model de 04b_escena3d.js). Aquí quedan, como talón (A3-8a; antes, extracción parcial), los «maestros»
  // matSuelo y matOrto (el ciclo del día les pone el color; el relieve de los glb comparte el de matSuelo) y lo que leen por su nombre 04e, 08, 14, 15,
  // 21 y otros: hash, UN y SombreadoTiles. Sin tileset no crea nada (04b no lo llama).
  // [talón] apps/web/src/mundos/exterior/terreno.ts
  var hash = Mundos.hash;
  var Maestros = Mundos.creaMaestrosTerreno(Materiales);   // A3-8a: los «maestros» (src/mundos/exterior/terreno-maestros.ts): el ciclo del día les pone el color; el relieve de los glb comparte el de matSuelo
  var matSuelo = Maestros.matSuelo, matOrto = Maestros.matOrto;
  var UN = Mundos.uniformesTerreno({ THREE: THREE, D: D, x0: x0, yN: yN, ANCHO: ANCHO, ALTO: ALTO, tinteOrto: matOrto.color });   // uniformes compartidos por todo el relieve (y por quien sigue la exageración: 08, 14, 15...)
  var SombreadoTiles = Mundos.creaSombreadoTiles({
    THREE: THREE, RES: RES, mundo: Mundo, suelo: suelo, cola: ColaExt, camara: camera, UN: UN, matSuelo: matSuelo,
    parcheTiempo: function (sh, viento) { parcheTiempo(sh, viento); },   // 15_tiempo: sombra de nubes y escarcha
    tiempoTsl: function () { return typeof nodosTiempoTsl === "function" ? nodosTiempoTsl : null; },   // A3-4: los mismos, en TSL (para la variante apagada)
    vn2: function (x, y) { return vn2(x, y); },   // 21_suelo: las mismas funciones que usa cubierta() en la CPU
    sueloFotos: function () { return typeof SueloFotos !== "undefined" ? SueloFotos : null; },   // 04f se monta después (EV-1s, ?suelo=fotos)
    sueloFotosPuro: function () { return typeof SueloFotosPuro !== "undefined" ? SueloFotosPuro : null; },
    ahora: function () { return performance.now(); },
    materiales: Materiales   // MU5-n: el material «terreno» se define en la fábrica (02i) y se pide con dueño «terreno-sombreado»
  });
  // [paso: 04e_suelo_fondo]
  // ---------- M6: el suelo de fondo (MU5-n, A3-1b: migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/suelo-fondo.ts). Una malla con el relieve GRUESO
  // del índice y el mosaico de 1 m, POR DEBAJO del tileset, que tapa el vacío de los bordes. Componente «suelo-fondo» (ADR-0023), fase «tarde», de los mundos ["exterior"];
  // ?fondo=0 lo apaga (y ?sinFondo). Comparte la textura del mosaico y el color de 04d (matSuelo). Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/suelo-fondo.ts
  Componentes.registra(Mundos.manifiestoSueloFondo({
    THREE: THREE, D: D, Mundo: Mundo, UN: UN, matSuelo: matSuelo, Escena3D: Escena3D, scene: scene, Estado: Estado, Materiales: Materiales,
    VrPresupuesto: typeof VrPresupuesto !== "undefined" ? VrPresupuesto as any : null, VrPresupuestoPuro: typeof VrPresupuestoPuro !== "undefined" ? VrPresupuestoPuro : null,
    busqueda: typeof location !== "undefined" ? location.search : ""
  }));
  // [paso: 04f_suelo_fotos]
  // ---------- EV-1s: el suelo de cerca con texturas de fotos de la finca (?suelo=fotos; APAGADO por defecto y, en VR, apagado salvo ?sueloVR=1). MU5-n (A3-1b): migrado a
  // TypeScript; el código vive en apps/web/src/mundos/exterior/suelo-fotos.ts (el trozo puro, SueloFotosPuro, y la fábrica del suelo). Siete clases de textura repetible en UNA
  // textura en array (KTX2 por defecto, WebP si falla), con la CLASE de cada punto DEDUCIDA y la textura ILUSTRATIVA (regla 5): la explicación completa, allí. Sin la bandera no carga
  // nada. 04d sigue pidiéndole SueloFotosPuro.parcheGlsl, SueloFotos.U, .campo, .rueNeutro, .actualiza y .libera. Componente «suelo-fotos» de los mundos ["exterior"].
  // [talón] apps/web/src/mundos/exterior/suelo-fotos.ts
  var SueloFotosPuro = Mundos.SueloFotosPuro;
  var SueloFotos = Mundos.creaSueloFotos({
    THREE: THREE, Aparato: Aparato, Mundo: Mundo, copas: copas, ColaExt: ColaExt, renderer: renderer,
    busqueda: typeof location !== "undefined" ? location.search : "",
    ajuste: function () { try { var s = window.localStorage.getItem("gemelo.ajustes.vista.suelo"); return s == null ? undefined : JSON.parse(s); } catch (e) { return undefined; } },
    cargaKtx2: function () { return import("three/addons/loaders/KTX2Loader.js"); },   // solo con la bandera y este formato
    consola: console
  });
  Componentes.registra(Mundos.manifiestoSueloFotos(SueloFotos));
  // [paso: 05_nube]
  // ---------- nube de puntos LiDAR: una malla por tesela, con las posiciones cuantizadas a 16 bits y el color a 8, y nivel de detalle por distancia.
  // MU5-n (A3-3): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/nube.ts (Mundos.creaNube), componente «nube-lidar» de los mundos ["exterior"] con un libera()
  // que suelta las mallas, los trabajos de la Cola, el grupo y los materiales. Con los hallazgos de la auditoría: la nube solo existe en el modo «nube» (L1-01, L2-02), se suelta a
  // la distancia a la que el Mundo carga (L2-02) y el presupuesto de puntos se reparte entre todos los niveles y se recalcula en cada pasada (L1-02). Aquí solo se cablea lo del legado.
  // kcor, tinte y la fecha del NDVI los cambian 09_camara y 10_ndvi (desde A3-8a, en TinteOrto.E y FechaNdvi.E): entran como funciones que los leen en cada uso.
  // [talón] apps/web/src/mundos/exterior/nube.ts
  var Nube = Mundos.creaNube({
    THREE: THREE, Mundo: Mundo, suelo: suelo, copaAlta: copaAlta, aviva: aviva, colorEn: colorEn, hash: hash, parcheTiempo: function (sh, viento) { parcheTiempo(sh, viento); },
    kcor: function () { return TinteOrto.E.kcor; }, tinte: function () { return TinteOrto.E.tinte; }, ndviIdx: function () { return FechaNdvi.E.idx; },   // parcheTiempo (15_tiempo, después en el montaje) se pide al usarlo: solo se llama al compilar
    ColaExt: ColaExt, Materiales: Materiales, Estaticos: Estaticos, scene: scene, camera: camera, Estado: Estado
  });
  var ALTO_MAX = Nube.ALTO_MAX, nube = Nube.nube, pintaNube = Nube.pintaNube, actualizaNubeTeselas = Nube.actualizaNubeTeselas, actualizaNube = Nube.actualizaNube;
  Componentes.registra(Mundos.manifiestoNube(Nube));
  // [paso: 06_arboles]
  // ---------- los olivos del modo Gemelo: copa con la forma real medida (8 radios) y tronco debajo (nivel 0, por celdas de 64 m; ver Arboles). MU5-n (A3-2b): migrado a TypeScript;
  // el código vive en apps/web/src/mundos/exterior/arboles-l0.ts (los grupos gArboles y gSombras, los materiales del nivel 0, arbolesG, radioEn y la entidad «olivo»), componente
  // «arboles-l0» de los mundos ["exterior"] con un libera() que suelta los grupos, la entidad y los materiales (lo registra 90_final.js, como los de A3-1a). L5-01: el tronco del nivel 0 ya no comparte nombre con el del paisaje.
  // [talón] apps/web/src/mundos/exterior/arboles-l0.ts
  var Arboles0 = Mundos.creaArbolesL0({
    THREE: THREE, scene: scene, camera: camera, Estaticos: Estaticos, Materiales: Materiales, Entidades: Entidades, Estado: Estado, D: D, fmt: fmt, FACTOR_R8: FactorR8.E.r8, ESC_R8: ESC_R8,
    suelo: suelo, aviva: aviva, colorEn: colorEn, hash: hash, copas: copas, marc: marc, colorVertSRGB: colorVertSRGB,
    Generados: { rotulo: function (i) { return Generados.rotulo(i); }, escalera: function () { return Generados.escalera(); } },   // 07ab se carga después: por función
    parcelas: function () { return parcelas; }   // 13_parcelas, después de este módulo
  });
  var gArboles = Arboles0.gArboles, gFollaje = Arboles0.gFollaje, gSombras = Arboles0.gSombras, radioEn = Arboles0.radioEn, arbolesG = Arboles0.arbolesG;
  // [paso: 07_follaje]
  // follaje: cada punto LiDAR de copa es un montoncito de hojas plateadas (sprites con textura propia). MU5-n (A3-2b): migrado a TypeScript; el código vive en
  // apps/web/src/mundos/exterior/follaje.ts (las texturas, los cuatro materiales, follajeG y las manchas de sombra), componente «follaje» de los mundos ["exterior"] con un
  // libera() que suelta la malla de sombras, la geometría, los materiales y las texturas (lo registra 90_final.js, como los de A3-1a). L2-01, L5-02 y L1-08: construyeSombras
  // ya no vacía gSombras sin dispose (perdía un búfer por llamada y sacaba las sombras del paisaje, instSombraPA, de 18_paisaje): rehace solo SU malla. Aquí se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/follaje.ts
  var Follaje = Mundos.creaFollaje({
    THREE: THREE, lienzo: function (lado) { var cv = document.createElement("canvas"); cv.width = cv.height = lado; return cv; }, texColor: texColor, Materiales: Materiales, Estaticos: Estaticos,
    gSombras: gSombras, Estado: Estado, ESC_R8: ESC_R8, suelo: suelo, copaAlta: copaAlta, aviva: aviva, colorEn: colorEn, hash: hash, copas: copas, radioEn: radioEn,
    construyeFrutosLista: function (g) { construyeFrutosLista(g); },   // 23_estacion se carga después
    sombrasSol: function (forzar) { sombrasSol(forzar); },   // 18_paisaje, que lee la malla de sombras con Follaje.sombras()
    VrPresupuesto: typeof VrPresupuesto !== "undefined" ? VrPresupuesto : null
  });
  var matHojaG = Follaje.matHojaG, matHojaP = Follaje.matHojaP, matCorteza = Follaje.matCorteza, matSombra = Follaje.matSombra, geoSombra = Follaje.geoSombra;
  var follajeG = Follaje.follajeG, construyeSombras = Follaje.construyeSombras;
  // [paso: 07a_catalogo]
  // ---------- el catálogo de olivos-tipo (ADR-0012; contrato de entrada en contratos/olivos-tipo.md): de dónde sacan los niveles 1 y 2 su geometría. MU5-n (A3-2a): migrado a
  // TypeScript; el código vive en apps/web/src/mundos/exterior/catalogo.ts (las formas por procedimiento del tipo −1, sus dos materiales instanciados y el registro de los modelos
  // glb, con un libera() que lo suelta todo), componente «catalogo-olivos» de los mundos ["exterior"]. 07b_arboles.js lo pide al montarse. parcheTiempo (15_tiempo) va después en el
  // montaje: se pide al usarlo (A3-8a: ya no se iza) y solo se llama al compilar. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/catalogo.ts
  var Catalogo = Mundos.creaCatalogo({ THREE: THREE, hash: hash, parcheTiempo: function (sh, viento) { parcheTiempo(sh, viento); }, Materiales: Materiales, tiempoTsl: function () { return typeof nodosTiempoTsl === "function" ? nodosTiempoTsl : null; } });
  Componentes.registra(Mundos.manifiestoCatalogo(Catalogo));
  // [paso: 07ab_generados]
  // ---------- olivos GENERADOS cerca (ADR-0017) y la ESCALERA de todos (ADR-0019, ADR-0022), POR DEFECTO (O10a) si la finca trae copas_param y copas_id; ?olivos=0 los apaga.
  // MU5-n (A3-2a): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/generados*.ts (la escalera y la decisión, que son puras; las variantes horneadas y los
  // impostores; la cola propia; el sombreado y el fundido; el lote; y el módulo con su estado), componente «olivos-generados» de los mundos ["exterior"], con un libera() que
  // suelta el lote, los materiales con sus texturas, el trabajador, la cola propia y la caché de recetas. Lo mueve 07b_arboles.js (actualiza y paso). Aquí solo se cablea lo
  // del legado: lo que cambia después de cargarse (FACTOR_R8_GEN, el renderer, la escena, quien pasea, fetch) se pide en cada uso, y el import() del constructor se queda
  // escrito aquí para que Vite lo trocee como antes. parcheTiempo (15_tiempo) va después en el montaje: se pide al usarlo (A3-8a), y solo se llama al compilar.
  // [talón] apps/web/src/mundos/exterior/generados.ts
  var Escalera = Mundos.Escalera;
  var Generados = Mundos.creaGenerados({
    THREE: THREE, D: D, VRP: VRP, Aparato: Aparato, Config: Config, Materiales: Materiales, gArboles: gArboles, camera: camera, Estado: Estado, suelo: suelo,
    factorR8Gen: function () { return FactorR8.E.gen; }, factorCopaDeConfig: factorCopaDeConfig, parcheTiempo: function (sh, viento) { parcheTiempo(sh, viento); }, tiempoTsl: function () { return typeof nodosTiempoTsl === "function" ? nodosTiempoTsl : null; },   // A3-4: los nodos del tiempo (15_tiempo) para la TSL apagada
    busqueda: location.search, reloj: performance, consola: console, ventana: typeof window !== "undefined" ? window : null,
    cargaConstructor: function () { return typeof window !== "undefined" && window.OlivoGen ? Promise.resolve(window.OlivoGen) : import("gemelo-olivo"); },
    renderer: function () { return typeof renderer !== "undefined" ? renderer : null; },
    scene: function () { return typeof scene !== "undefined" ? scene : null; },
    paseo: function () { return typeof Paseo !== "undefined" && Paseo.E.paseando && typeof pp !== "undefined" ? pp : null; },
    red: function () { return typeof fetch === "function" ? fetch : null; }
  });
  Componentes.registra(Mundos.manifiestoGenerados(Generados));
  // [paso: 07ac_lejanos]
  // ---------- los olivos LEJANOS de la escalera (ADR-0019 §2, fase A, O8c), solo con ?olivos=escalera o con ?olivos=gen y variantes horneadas (modoGen de 07ab): sin ellas no crea
  // nada ni gasta nada. Todo olivo a menos de U2 m de la cámara que no está en 3D (07ab) se dibuja en UNA malla instanciada para toda la finca (1 llamada), con impostores
  // (los dos atlas de O8b) o, de salvaguarda, con un sustituto horneado en el navegador. MU5-n (A3-2b): migrado a TypeScript; el código y la explicación entera viven en
  // apps/web/src/mundos/exterior/lejanos.ts, componente «lejanos» de los mundos ["exterior"] con un libera() que suelta la malla, los materiales, las texturas (y los ImageBitmap
  // de los atlas, L2-08), el blanco del horneado y el trabajo de la Cola (lo registra 90_final.js, como los de A3-1a). Aquí se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/lejanos.ts
  var Lejanos = Mundos.creaLejanos({ THREE: THREE, renderer: renderer, Estado: Estado, gArboles: gArboles, Materiales: Materiales, ColaExt: typeof ColaExt !== "undefined" ? ColaExt : null, Generados: Generados,
    fetch: function (u, o: any) { return fetch(u, o); }, crearBitmap: function (b: any, o: any) { return createImageBitmap(b, o); } });   // los atlas de impostores (mismo origen)
  // [paso: 07b_arboles]
  // ---------- los olivos del modo Gemelo con tres niveles de detalle: el coste de dibujo no crece con la superficie de la finca (nivel 0: celdas de 64 m con el modelo completo; nivel 1:
  // olivos instanciados de ~170 triángulos; nivel 2: una masa de ~30 triángulos por olivo; más lejos, solo la ortofoto). MU5-n (A3-2b): migrado a TypeScript; el código y la explicación
  // entera viven en apps/web/src/mundos/exterior/arboles.ts, componente «arboles» de los mundos ["exterior"] con un libera() que suelta los trabajos de la Cola, las celdas y las mallas
  // instanciadas (lo registra 90_final.js, como los de A3-1a). L1-04: el nivel 0 cuenta en TOPE_TRI. Lo que cambia fuera de este módulo (paseando, kcor, tinte, ndviIdx, objetivo, orb, pp,
  // VRX, Ajustes) entra por getters: muchos se cargan después de 07b. Aquí se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/arboles.ts
  var Arboles = Mundos.creaArboles({
    THREE: THREE, FACTOR_R8: FactorR8.E.r8, busqueda: location.search, Aparato: Aparato, Config: Config, Mundo: Mundo, Cola: Cola, ColaExt: ColaExt, CargaPuro: CargaPuro, XrPerillas: XrPerillas,
    VrControlPuro: VrControlPuro, InfoDibujo: InfoDibujo, Estaticos: Estaticos, TopeTilesPuro: TopeTilesPuro, TopeOlivos: TopeOlivos, OlivosTiles: OlivosTiles, Catalogo: Catalogo,
    Escalera: Escalera, Generados: Generados, Lejanos: Lejanos, renderer: renderer, camera: camera, Estado: Estado, suelo: suelo, copaAlta: copaAlta, aviva: aviva, hash: hash, copas: copas,
    ALTO_MAX: ALTO_MAX, gArboles: gArboles, arbolesG: arbolesG, follajeG: follajeG, construyeSombras: construyeSombras, ventana: window, ahora: function () { return performance.now(); },
    get paseando() { return typeof Paseo !== "undefined" ? Paseo.E.paseando : false; }, get kcor() { return TinteOrto.E.kcor; }, get tinte() { return TinteOrto.E.tinte; }, get ndviIdx() { return typeof FechaNdvi !== "undefined" ? FechaNdvi.E.idx : 0; },
    get objetivo() { return typeof objetivo !== "undefined" ? objetivo : null; }, get orb() { return typeof orb !== "undefined" ? orb : null; }, get pp() { return typeof pp !== "undefined" ? pp : null; },
    get VRX() { return typeof VRX !== "undefined" ? VRX : null; }, get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; }
  });
  // [paso: 08_marcadores]
  // la linde y lo que cuelga del terreno al aplicar. Las copas del LiDAR, los anillos de OlivarTrack y el desfase son el componente «marcadores-lidar»
  // (08b_marcadores_lidar.js): aplica() les avisa con «mundo:aplica» y capas() con «capas:cambia»; sin él (?marcadores=0) esas tres casillas no hacen nada.
  // MU5-n (A3-2b): el grupo de la linde y aplica(), capas() y aplicaLuego() pasaron a TypeScript, apps/web/src/mundos/exterior/marcadores.ts (Mundos.creaMarcadores).
  // Aquí quedan los nombres que el resto del legado lee. A3-8a: `listo` (era una primitiva que escribía 90_final) es ahora Marcadores.listo() / Marcadores.ponListo().
  // [talón] apps/web/src/mundos/exterior/marcadores.ts
  var Marcadores = Mundos.creaMarcadores({
    THREE: THREE, scene: scene, Estaticos: Estaticos, Bus: Bus, D: D, $: $, Estado: Estado, UN: UN, nube: nube, gArboles: gArboles, gFollaje: gFollaje, gSombras: gSombras, Arboles: Arboles,
    pintaNube: pintaNube, colocaBarrera: function (k) { colocaBarrera(k); }, colocaPaisaje: function () { colocaPaisaje(); }, colocaBalizas: function () { colocaBalizas(); }, recoloreaSuelo: function () { recoloreaSuelo(); },   // 18, 19 y 21 van después y sus talones no las declaran con function: por función
    raf: function (f) { requestAnimationFrame(f); }
  });
  var gLinde = Marcadores.gLinde, tmp = Marcadores.tmp;
  var aplica = Marcadores.aplica, capas = Marcadores.capas, aplicaLuego = Marcadores.aplicaLuego;
  // [paso: 08b_marcadores_lidar]
  // ---------- los marcadores de la nube LiDAR (componente «marcadores-lidar», ADR-0023, C10 tercera tanda): las copas detectadas (octaedros), los olivos guardados en
  // OlivarTrack (anillos) y las líneas de desfase entre ambos. MU5-n (A3-2b): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/marcadores-lidar.ts, componente
  // de los mundos ["exterior"] con un libera() que suelta mallas, geometrías y materiales. aplica() (08_marcadores.js) les avisa con «mundo:aplica» y capas() con «capas:cambia».
  // ?marcadores=0 los apaga. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/marcadores-lidar.ts
  Componentes.registra(Mundos.manifiestoMarcadoresLidar({
    THREE: THREE, scene: scene, Estaticos: Estaticos, colorCss: colorCss, cIn: cIn, marc: marc as any, copas: copas, suelo: suelo, Estado: Estado,
    listo: function () { return Marcadores.listo(); }, $: $, Materiales: Materiales,
    VrPresupuesto: typeof VrPresupuesto !== "undefined" ? VrPresupuesto : null
  }));
  // [paso: 09_camara]
  // cámara orbital y los gestos de la vista aérea (girar, acercar, desplazar, el toque que elige o echa a andar), los botones de modo, las capas y los deslizadores.
  // MU5-n (A3-6c): migrado a TypeScript; el código vive en apps/web/src/mundos/comun/camara.ts, componente «camara-orbital» de TODOS los mundos con un libera() que quita sus escuchas.
  // Aquí solo se cablea lo del legado: lo que otros reescriben o se declara después (paseando, kcor, IrA, parcelaSel, elegirParcela, Ajustes) entra por función (parcelaSel, por Parcelas.parcelaSel(): A3-7b1).
  // [talón] apps/web/src/mundos/comun/camara.ts
  var Camara = Mundos.creaCamara({
    THREE: THREE, camera: camera, lienzo: lienzo, Estado: Estado, $: $, fmt: fmt, DIST_MAX: DIST_MAX, DIST_INI: DIST_INI, Usables: Usables, aplica: aplica, capas: capas, aplicaLuego: aplicaLuego,
    paseando: function () { return Paseo.E.paseando; }, ponKcor: function (v) { TinteOrto.E.kcor = v; }, IrA: function () { return IrA; }, parcelaSel: function () { return Parcelas.parcelaSel(); },
    elegirParcela: function (i) { elegirParcela(i); }, Ajustes: function () { return typeof Ajustes !== "undefined" ? Ajustes : null; }
  });
  var objetivo = Camara.objetivo, orb = Camara.orb, camara = Camara.camara, sensMirar = Camara.sensMirar, pon = Camara.pon;
  Componentes.registra(Mundos.manifiestoCamara(Camara));
  // [paso: 10_ndvi]
  // ---------- NDVI de Sentinel-2 (10 m), con escala relativa a la parcela (como hace Vigía). Esto es el núcleo: los datos, la fecha del campo y la escala, que leen el
  // tinte de los árboles, la hierba, la estación y la VR. La capa que lo pinta sobre el terreno, su leyenda y su gráfica son el componente «capa-ndvi» (10b_capa_ndvi.js):
  // se entera por «ndvi:cambia»; sin él (?capandvi=0), el tinte de los árboles y la fecha siguen funcionando.
  // MU5-n (A3-1a): los datos, la rampa, la escala (antes ndLo/ndHi de 02_mundo) y el NDVI relativo de un punto pasaron a TypeScript,
  // apps/web/src/mundos/exterior/ndvi.ts (Mundos.creaNdvi; componente «ndvi» del exterior, sin GPU, que registra 90_final.js). Aquí quedan, como
  // talón (A3-8a; antes, extracción parcial), lo que el resto lee por su nombre: NDV, rampa, pintaNdvi, ndviRel y la fecha elegida (FechaNdvi).
  // [talón] apps/web/src/mundos/exterior/ndvi.ts
  var Ndvi = Mundos.creaNdvi({ D: D, b64: b64, i16: i16, x0: x0, yN: yN, ANCHO: ANCHO, ALTO: ALTO, idx: function () { return FechaNdvi.E.idx; }, bus: Bus });
  var NDV = Ndvi.NDV, rampa = Ndvi.rampa, pintaNdvi = Ndvi.pinta, ndviRel = Ndvi.rel;
  // A3-8a: la fecha elegida (antes la primitiva ndviIdx, que reescribía 14_historia) y las casillas del panel, en apps/web/src/mundos/exterior/ndvi-panel.ts
  var FechaNdvi = Mundos.creaFechaNdvi({ $: $, NDV: NDV, pintaNdvi: pintaNdvi, aplicaLuego: aplicaLuego, tinte: TinteOrto.E, Estado: Estado, gArboles: gArboles, gFollaje: gFollaje, gSombras: gSombras, nube: nube });
  // [paso: 10b_capa_ndvi]
  // ---------- la capa de vigor (componente «capa-ndvi», ADR-0023, C10 cuarta tanda): el NDVI de la fecha elegida pintado sobre el terreno, con su leyenda y
  // su gráfica anual. MU5-n (A3-1a): el componente pasó a TypeScript, apps/web/src/mundos/exterior/capa-ndvi.ts (Mundos.manifiestoCapaNdvi), del exterior
  // y con su libera() (la textura, dispose). Aquí queda su registro: lo que necesita del legado se lo da la función al montarse (tras todos los módulos).
  // ?capandvi=0 la apaga: el terreno no se tiñe, y las casillas siguen en el menú.
  // [talón] apps/web/src/mundos/exterior/capa-ndvi.ts
  Componentes.registra(Mundos.manifiestoCapaNdvi(function (): any {
    return { THREE: THREE, $: $, fmt: fmt, documento: document, UN: UN, NDV: NDV, idx: function () { return FechaNdvi.E.idx; }, rampa: rampa, pintaNdvi: pintaNdvi };
  }));
  // [paso: 11_sol] Talón (MU5-n, A3-4) de apps/web/src/mundos/exterior/sol-reserva.ts: sol2() (el sol según el deslizador de reserva #hora, que actualizaTiempo pisa en cada fotograma; L8-03), componente «sol-reserva».
  // ---------- el sol según la hora del deslizador de reserva (#hora, oculto): un residuo que actualizaTiempo (15_tiempo) pisa en cada fotograma (L8-03).
  // MU5-n (A3-4): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/sol-reserva.ts, componente «sol-reserva» con su libera(). Aquí solo se cablea.
  // [talón] apps/web/src/mundos/exterior/sol-reserva.ts
  var SolReserva = Mundos.creaSolReserva({ $: $, sol: sol, hemi: hemi, LUZ_SOL: LUZ_SOL, LUZ_CIELO: LUZ_CIELO });
  Componentes.registra(Mundos.manifiestoSolReserva(SolReserva));
  // [paso: 12_paseo]
  // ---------- paseo: una persona que camina por el olivar (flechas o WASD; Mayús corre; V cambia de cámara), con la cruceta, la palanca (PalancaPuro) y la cámara de seguimiento.
  // MU5-n (A3-6c): migrado a TypeScript; el código vive en apps/web/src/mundos/comun/paseo.ts, componente «paseo» de TODOS los mundos (la locomoción es de todo mundo) con un libera()
  // que suelta el muñequito y quita sus escuchas. El estado que leen los demás pasos (paseando, persona, teclas y primera, que
  // escriben también 16_vida y 29_vr) vive en Paseo.E (A3-8c: antes, var de este paso que se espejaban). Lo que se declara después (13, 16, 24, 33, 12c, 90) entra por función.
  // El componente lo registra 90_final (como Vida), con el resto de lo que el arranque usa por su nombre desde que se monta.
  var Paseo = Mundos.creaPaseo({
    THREE: THREE, scene: scene, camera: camera, Estado: Estado, Materiales: Materiales, D: D, $: $, lienzo: lienzo, visor: visor, copaAlta: copaAlta, sensMirar: sensMirar,
    parcelaSel: function () { return Parcelas.parcelaSel(); }, fincaSel: function () { return Parcelas.fincaSel(); },
    fincas: function () { return fincas; }, enQuad: function () { return Vida.E.enQuad; }, enDron: function () { return Vida.E.enDron; }, TR: function () { return TR; },
    iniciaTransicion: function () { iniciaTransicion(); }, iniciaSalida: function () { iniciaSalida(); }, Ajustes: function () { return typeof Ajustes !== "undefined" ? Ajustes : null; },
    IrA: function () { return IrA; }, gm: function () { return gm; }, documento: document, ventana: window,
    vida: {   // 16_vida se monta después: cada mando de la vida se pide al usarlo
      velPaseo: function (av, dt) { return velPaseo(av, dt); }, giroPaseo: function (v) { return giroPaseo(v); }, ponQuad: function (on) { ponQuad(on); }, ponDron: function (on) { ponDron(on); },
      vidaPaseo: function (dt, gy, vel) { vidaPaseo(dt, gy, vel); }, cicloVista: function () { cicloVista(); }, dronMando: function (av, gi, dt) { dronMando(av, gi, dt); },
      camaraDron: function (dt, gy) { return camaraDron(dt, gy); }, vidaEntra: function () { vidaEntra(); }, vidaSale: function () { vidaSale(); }
    }
  });
  var pp = Paseo.pp, camPos = Paseo.camPos, PalancaPuro = Paseo.PalancaPuro, ponPalanca = Paseo.ponPalanca, giraPalanca = Paseo.giraPalanca;
  var entraPaseo = Paseo.entraPaseo, salePaseo = Paseo.salePaseo, actualizaPaseo = Paseo.actualizaPaseo;
  // [paso: 12b_llegada] Publica además window.__llegada (pruebas). LlegadaPuro vive en apps/web/src/nucleo/locomocion.ts (A1-11; sus pruebas, en locomocion.test.ts); el módulo conserva el anillo, el velo y los oyentes, que tocan THREE y el DOM.
  // ---------- la llegada: el anillo en el suelo adonde quieres ir y el salto hasta él (de pie, fuera de troncos, a la altura del suelo, andando), en VR (volando o en el mirador)
  // y en pantalla (con el Dron). La lógica pura pasó a TypeScript (A1-11 / MU1-7): apps/web/src/nucleo/locomocion.ts. MU5-n (A3-6c): el resto también; vive en
  // apps/web/src/mundos/comun/llegada.ts, componente «anillo-llegada» de TODOS los mundos (la locomoción es de todo mundo) con un libera() que suelta el anillo, el velo y sus escuchas.
  // Aquí solo se cablea lo del legado: lo que otros reescriben o se declara después (paseando, enDron, ponDron, VRX, vrFundido, vrAparece, gm) entra por función.
  // [talón] apps/web/src/mundos/comun/llegada.ts
  var LlegadaPuro = Nucleo.LlegadaPuro;
  var Llegada = Mundos.creaLlegada({
    THREE: THREE, scene: scene, camera: camera, Estado: Estado, Materiales: Materiales, lienzo: lienzo, visor: visor, $: $, pp: pp, camPos: camPos, entraPaseo: entraPaseo,
    paseando: function () { return Paseo.E.paseando; }, enDron: function () { return Vida.E.enDron; }, ponDron: function (on) { ponDron(on); }, VRX: function () { return VRX; },
    vrFundido: function (fn) { return vrFundido(fn); }, vrAparece: function (x, y, ang) { vrAparece(x, y, ang); }, gm: function () { return gm; },
    documento: document, ventana: window
  });
  Componentes.registra(Mundos.manifiestoLlegada(Llegada));
  // [paso: 12c_ir_a]
  // ---------- tocar para ir andando (tanda 9): en pantalla (ratón y táctil, no en VR), a pie, un clic o un toque corto en el suelo hace que el paseante camine hasta allí, rodeando
  // los troncos, con el anillo de la llegada en el destino y una línea de puntos que marca el camino. La lógica pura pasó a TypeScript (A1-11 / MU1-7): apps/web/src/nucleo/locomocion.ts.
  // MU5-n (A3-6c): el resto también; vive en apps/web/src/mundos/comun/ir-a.ts, componente «ir-a» de TODOS los mundos (la locomoción es de todo mundo) con un libera() que suelta la línea.
  // Aquí solo se cablea lo del legado: lo que otros reescriben o se declara después (paseando, teclas, enQuad, enDron, VRX, Ajustes, gm) entra por función.
  // [talón] apps/web/src/mundos/comun/ir-a.ts
  var IrAPuro = Nucleo.IrAPuro;
  var IrA = Mundos.creaIrA({
    THREE: THREE, scene: scene, Estado: Estado, Materiales: Materiales, suelo: suelo, copas: function () { return copas; }, pp: pp, Llegada: Llegada,
    paseando: function () { return Paseo.E.paseando; }, teclas: function () { return Paseo.E.teclas; }, enQuad: function () { return Vida.E.enQuad; }, enDron: function () { return Vida.E.enDron; },
    VRX: function () { return VRX; }, Ajustes: function () { return typeof Ajustes !== "undefined" ? Ajustes : null; }, gm: function () { return gm; },
    busqueda: typeof location !== "undefined" ? location.search : ""
  });
  Componentes.registra(Mundos.manifiestoIrA(IrA));
  // [paso: 13_parcelas] Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/parcelas.ts: el selector de fincas y parcelas, las cifras de «Lo medido» y la ficha del suelo; componente «selector-parcelas» de los mundos ["exterior"] con su libera(). Lo elegido (fincaSel y parcelaSel) ya no son variables de aquí: 09 y 12 lo piden por Parcelas.parcelaSel() y Parcelas.fincaSel().
  // ---------- parcelas: selector, cifras y suelo de cada una. MU5-n (A3-7b1): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/parcelas.ts, componente
  // «selector-parcelas» de los mundos ["exterior"] con un libera() que suelta sus escuchas, sus nodos, el aplazado y la suscripción a Configuración. Aquí solo se cablea lo del legado:
  // lo elegido (fincaSel y parcelaSel) ya no son variables de aquí: 09 y 12 lo piden por Parcelas.parcelaSel() y Parcelas.fincaSel(); Ajustes (33, que se monta después) entra por getter.
  // [talón] apps/web/src/mundos/exterior/parcelas.ts
  var Parcelas = Mundos.creaParcelas({
    D: D, $: $, tinta: tinta, fmt: fmt, DIST_INI: DIST_INI, suelo: suelo, copas: copas, cIn: cIn, marc: marc, med: med, Estado: Estado, aplicaLuego: aplicaLuego, objetivo: objetivo, orb: orb,
    get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; }
  });
  var parcelas = Parcelas.parcelas, fincas = Parcelas.fincas, claseUsda = Parcelas.claseUsda, elegirParcela = Parcelas.elegirParcela, elegirFinca = Parcelas.elegirFinca;
  Componentes.registra(Mundos.manifiestoParcelas(Parcelas));
  // [paso: 13b_hazas] Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/hazas.ts: HazasPuro y el componente «hazas-mundo» de los mundos ["exterior"] (con su libera()). Sin D.base /teselas/… ni ?api= no pide nada ni crea nada. No dibuja la linde: la da con Hazas.lindes() y avisa con «hazas:cambia» (la dibuja 44_lindes.js). El trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/hazas.test.js (que lee el .ts como JavaScript, _fuente.js).
  // ---------- las hazas en el mundo (F1, el «3c»): sus límites (los dibuja sobre el suelo el componente «lindes-hazas», 44_lindes.js, con Hazas.lindes() y el evento
  // «hazas:cambia») y, al tocar una, su ficha pública (ADR-0014, contratos/haza.schema.json). MU5-n (A3-7b1): migrado a TypeScript; el código vive en
  // apps/web/src/mundos/exterior/hazas.ts (HazasPuro y el componente «hazas-mundo» de los mundos ["exterior"], con su libera()). Aquí solo se cablea lo del legado:
  // «paseando» (que 12_paseo reescribe) entra por getter.
  // [talón] apps/web/src/mundos/exterior/hazas.ts
  var HazasPuro = Mundos.HazasPuro;
  var Hazas = Mundos.creaHazas({
    THREE: THREE, D: D, Bus: Bus, Entidades: Entidades, Usables: Usables, camera: camera, Estado: Estado, suelo: suelo, objetivo: objetivo, pp: pp, get paseando() { return Paseo.E.paseando; }
  });
  Componentes.registra(Mundos.manifiestoHazas(Hazas));
  // [paso: 14_historia] Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/historia.ts: HistoriaPuro y el componente «historia-recorrido» de los mundos ["exterior"] (el recorrido guiado de Hituelo con lo que sabe OlivarTrack), con su libera() (escuchas, puntos de escena y mallas de resalte). OT (la instantánea D.ot) y VIVO (hoy null) los leen 19_balizas y 23_estacion. El trozo [puro] lo evalúa en Node pruebas/guardianes/historia_vivo.test.js (que lee el .ts como JavaScript, _fuente.js).
  // ---------- la historia: un recorrido guiado que cruza el gemelo con lo que sabe OlivarTrack. MU5-n (A3-7b1): migrado a TypeScript; el código vive en
  // apps/web/src/mundos/exterior/historia.ts (HistoriaPuro y el componente «historia-recorrido» de los mundos ["exterior"], con su libera()). Aquí solo se cablea lo del legado:
  // paseando y ndviIdx (que otros reescriben) entran por getter, y ndviIdx se escribe con ponNdviIdx. OT (la instantánea D.ot) y VIVO (lo que marcaría Vigía, hoy null) los leen 19 y 23.
  // [talón] apps/web/src/mundos/exterior/historia.ts
  var Historia = Mundos.creaHistoria({
    THREE: THREE, D: D, $: $, tinta: tinta, fmt: fmt, suelo: suelo, copas: copas, cIn: cIn, marc: marc, med: med, Materiales: Materiales, Estaticos: Estaticos, scene: scene, UN: UN,
    orb: orb, pon: pon, NDV: NDV, pintaNdvi: pintaNdvi, get ndviIdx() { return FechaNdvi.E.idx; }, ponNdviIdx: function (i) { FechaNdvi.pon(i); }, get paseando() { return Paseo.E.paseando; }, salePaseo: salePaseo,
    parcelas: parcelas, fincas: fincas, claseUsda: claseUsda, elegirParcela: elegirParcela, elegirFinca: elegirFinca
  });
  Componentes.registra(Mundos.manifiestoHistoria(Historia));
  // [paso: 15_tiempo] Talón (MU5-n, A3-4; extracción parcial hasta A3-8a): el tiempo vive en apps/web/src/mundos/exterior/tiempo*.ts, componente «tiempo-mundo». Lee /api/tiempo (mismo origen) solo con D.base /teselas/… o ?api=; si no, el tiempo simulado, dicho. Expone TiempoVivo (contratos/interfaces.json). TiempoPuro (tiempo-puro.ts) lo evalúa en Node pruebas/guardianes/tiempo_motor.test.js.
  // ---------- el tiempo: el mundo del gemelo simula el que publica Vigía (contratos/tiempo.md). MU5-n (A3-4): migrado a TypeScript; el código vive en
  // apps/web/src/mundos/exterior/tiempo*.ts (lo puro, el parche de las nubes y la helada, el cielo, la lluvia, la barrera de las lindes, el paso de cada fotograma
  // y las fichas del panel), componente «tiempo-mundo» de los mundos ["exterior"] con un libera() que lo suelta todo (L2-05, L2-11). Aquí quedan, como
  // talón (A3-8a; antes, extracción parcial), el cableado y los nombres que leen otros módulos. De dónde se lee: 1) GET /api/tiempo del mismo origen, si la página la sirve el servidor (o ?api=);
  // 2) si no hay api o falla, el tiempo simulado de siempre, dicho. Expone TiempoVivo.lee() y TiempoVivo.alCambiar(fn). Los textos de Vigía son datos.
  // [talón] apps/web/src/mundos/exterior/tiempo.ts
  var Tiempo = Mundos.creaTiempo({
    THREE: THREE, scene: scene, camera: camera, sol: sol, hemi: hemi, SRGB: SRGB, LUZ_SOL: LUZ_SOL, LUZ_CIELO: LUZ_CIELO, colorCss: colorCss, colorVertSRGB: colorVertSRGB, texColor: texColor,
    FOG0: FOG0, FOG1: FOG1, parcelas: D.parcelas, hash: hash, matSuelo: matSuelo, matOrto: matOrto, nube: nube, matHojaG: matHojaG, matHojaP: matHojaP, matCorteza: matCorteza,
    gLinde: gLinde, Estaticos: Estaticos, suelo: suelo, Estado: Estado, objetivo: objetivo,
    objetivoMundo: function () { return typeof objetivoMundo === "function" ? objetivoMundo() : null; },   // 23_estacion va después en el montaje (null: aún no está)
    estimado: function () { return typeof EST !== "undefined" && !!EST && !!EST.activa; },   // L8-05: la estación de otra fecha (23_estacion) se rotula «estimado»
    temaEstela: function (o) { if (typeof temaEstela === "function") temaEstela(o); },   // 16_vida, después en el montaje
    ocasoFotos: typeof SueloFotos !== "undefined" && SueloFotos.activo,
    $: $, lienzo: function () { return document.createElement("canvas"); }, Bus: Bus,
    prefijoApi: function () { return typeof HazasPuro !== "undefined" ? HazasPuro.prefijoApi(location.search, D.base) : null; },   // «/api/» si la página la sirve el servidor (o ?api=)
    red: function () { return window.fetch ? window.fetch.bind(window) : null; }, prueba: function () { return window.__TIEMPO_PRUEBA || null; },
    busqueda: location.search, reloj: function () { return Date.now(); }, calma: !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    temporizador: { setInterval: function (f, ms) { return setInterval(f, ms); }, clearInterval: function (id) { clearInterval(id); } }, Materiales: Materiales,
    alCambiarTema: function (fn) { return Nucleo.escuchaTema({ documento: document, ventana: window, Observador: MutationObserver }, fn); }   // A3-8a: data-theme y prefers-color-scheme (src/nucleo/tema.ts)
  });
  var TiempoPuro = Mundos.TiempoPuro, ahoraMs = Tiempo.ahoraMs, TM = Tiempo.TM, nivelEn = Tiempo.nivelEn, nivel = Tiempo.nivel, texBrillo = Tiempo.texBrillo;
  var uViento = Tiempo.uViento, uSombra = Tiempo.uSombra, GLSL_SOMBRA = Mundos.GLSL_SOMBRA, cur = Tiempo.cur, meta = Tiempo.meta, ins = Tiempo.ins;
  var temaBarrera = Tiempo.temaBarrera, fmtHora = Tiempo.fmtHora, fmtClaveDia = Tiempo.fmtClaveDia, num1 = Mundos.num1, rumbo = Mundos.rumbo;
  var objetivoMundoBase = Tiempo.objetivoMundoBase, pasoHoraMundo = Tiempo.pasoHoraMundo, horaMundoTexto = Tiempo.horaMundoTexto, aplicaMundo = Tiempo.aplicaMundo;
  var TiempoVivo = Mundos.creaTiempoVivo(TM, ahoraMs), lindes = Tiempo.lindes;
  var nodosTiempoTsl = Tiempo.nodosTsl;   // MU5-n: la sombra de nubes y la escarcha en TSL, para la variante apagada de 04d, 07a y 07ab (la piden al construirla)   // el contrato de TiempoVivo (contratos/interfaces.json): sin estado propio, lee TM
  // A3-8a: lo que otros módulos piden ANTES en el montaje (05, 07a, 07ab y 08) ya no se iza: lo piden por función al usarlo (solo al compilar o al aplicar)
  var parcheTiempo = Tiempo.parcheTiempo, colocaBarrera = Tiempo.colocaBarrera;
  var esc = Mundos.esc;   // los textos de Vigía (y de OlivarTrack) se escapan al pintarlos
  // el paso del exterior de cada fotograma (90_final.js). El reloj de lo que se mueve (antes la primitiva tMundo) lo lee 18_paisaje con Tiempo.tMundo()
  var actualizaTiempo = Tiempo.actualiza;
  Componentes.registra(Mundos.manifiestoTiempo(Tiempo));
  // [paso: 16_vida]
  // ---------- la vida del olivar: el quad con estela de luz (Tron) y el dron para el paseo (los pájaros y los conejos son el componente «fauna-olivar», 16b_fauna.js; los perros, «perros-paseo»).
  // MU5-n (A3-5): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/vida.ts (el grupo de la fauna, el quad, el dron, el anillo, las estelas y los mandos del paseo), componente
  // «vida» de los mundos ["exterior"] con un libera() que suelta de verdad todo lo que crea y quita las escuchas de sus botones (L2-05, L2-11; lo registra 90_final.js, como los de A3-1a).
  // Aquí se cablea lo del legado: el estado que leen los demás pasos (tVida, enQuad, vq, enDron) se lee en Vida.E (A3-8c: antes, var de este paso que lo espejaban), y las
  // funciones de siempre (velPaseo, ponDron…) son las de Vida con el mismo nombre.
  var Vida = Mundos.creaVida({
    THREE: THREE, scene: scene, camera: camera, Estado: Estado, Materiales: Materiales, Bus: Bus, $: $, suelo: suelo, copaAlta: copaAlta,
    sueloMundo: function (x, y) { return gm.suelo(x, y); }, obstaculo: function (x, y, r) { return gm.obstaculo(x, y, r); },   // el mundo activo (90_final, que declara gm después)
    geoSombra: geoSombra, matSombra: matSombra, texBrillo: texBrillo, nivelEn: nivelEn, cur: cur, ins: ins, num1: num1, rumbo: rumbo,
    paseando: function () { return Paseo.E.paseando; }, teclas: function () { return Paseo.E.teclas; }, persona: function () { return Paseo.E.persona; },   // 12_paseo: cambian (teclas se reemplaza al salir)
    primera: function () { return Paseo.E.primera; }, ponPrimera: function (v) { Paseo.E.primera = v; }, pp: pp, camPos: camPos, Llegada: Llegada,
    pendFactor: function () { return pendFactor(); }, quadInc: function () { return quadInc; }, inclinaQuad: function (dt) { inclinaQuad(dt); }   // 22_huellas, que se carga después
  });
  var gFauna = Vida.gFauna, altSuelo = Vida.altSuelo, quita = Vida.quita, mira = Vida.mira, quad = Vida.quad, temaEstela = Vida.temaEstela;
  var velPaseo = Vida.velPaseo, giroPaseo = Vida.giroPaseo, ponQuad = Vida.ponQuad, vidaPaseo = Vida.vidaPaseo, dr = Vida.dr, dron = Vida.dron, ponDron = Vida.ponDron;
  var cicloVista = Vida.cicloVista, dronMando = Vida.dronMando, camaraDron = Vida.camaraDron, vidaEntra = Vida.vidaEntra, vidaSale = Vida.vidaSale, actualizaVida = Vida.actualizaVida;
  temaBarrera();
  // [paso: 16b_fauna]
  // ---------- la fauna del olivar (componente «fauna-olivar», ADR-0023, C10 segunda tanda): las aves (dos bandadas que dan vueltas de día, ocho posadas que se espantan) y los seis
  // conejos que pastan y huyen. Se enteran de que empieza o acaba el paseo por «paseo:entra» / «paseo:sale» (los emite 16_vida.js), preguntan si hay algo de lo que huir con
  // «perros:amenaza» y responden a «fauna:conejo-cerca». Pintan sus conejos en el minimapa. El grupo gFauna (y su casilla «Fauna») siguen en 16_vida.js. ?fauna=0 la apaga.
  // MU5-n (A3-5): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/fauna.ts, componente de los mundos ["exterior"] con un libera() que quita las mallas de
  // gFauna, suelta sus geometrías y materiales y la capa del minimapa. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/fauna.ts
  Componentes.registra(Mundos.manifiestoFauna({
    THREE: THREE, Materiales: Materiales, camera: camera, D: D, copas: copas, cIn: cIn, geoSombra: geoSombra, matSombra: matSombra,
    paseando: function () { return Paseo.E.paseando; }, pp: pp, cur: cur, nivelEn: nivelEn,   // 12_paseo y 15_tiempo
    tVida: function () { return Vida.E.tVida; }, enQuad: function () { return Vida.E.enQuad; },   // 16_vida: el estado del paseo (cambian cada fotograma: por función)
    gFauna: gFauna, altSuelo: altSuelo, mira: mira, Estado: Estado, fusionaGeometrias: fusionaGeometrias,
    Minimapa: { capa: function (fn, orden) { return Minimapa.capa(fn, orden); } }   // 17_minimapa se carga después de 16b: se pide al montar, no al cargar
  }));
  // [paso: 17_minimapa]
  // ---------- el minimapa del paseo: la ortofoto vista desde arriba con tú, tu rastro, el dron, las balizas y los demás (M o un toque cambia el zoom), en una ventana
  // flotante. MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/minimapa.ts (Minimapa y actualizaMinimapa), componente «minimapa» SOLO DEL
  // EXTERIOR (dibuja la finca) con un libera() que quita sus escuchas y devuelve #mapita a su sitio. Aquí solo se cablea lo del legado: lo que cambia (paseando,
  // enQuad, enDron) o se declara después (avisoBaliza y dibujaBalizasMini de 19_balizas, Movibles de 34) entra por getter.
  // [talón] apps/web/src/ui/minimapa.ts
  var MinimapaUI = Interfaz.creaMinimapa({
    $: $, D: D, x0: x0, yN: yN, ANCHO: ANCHO, ALTO: ALTO, Mundo: Mundo, cIn: cIn, Entidades: Entidades, Usables: Usables, pp: pp, dr: dr,
    get paseando() { return Paseo.E.paseando; }, get enQuad() { return Vida.E.enQuad; }, get enDron() { return Vida.E.enDron; }, get avisoBaliza() { return avisoBaliza; },
    get dibujaBalizasMini() { return dibujaBalizasMini; }, get Movibles() { return typeof Movibles !== "undefined" ? Movibles : undefined; }, ventana: window, documento: document
  });
  var Minimapa = MinimapaUI.Minimapa, actualizaMinimapa = MinimapaUI.actualizaMinimapa;
  Componentes.registra(Interfaz.manifiestoMinimapa(MinimapaUI));
  // [paso: 18_paisaje]
  // ---------- el paisaje que sale del LiDAR: edificios (clase 6), el tendido y sus postes, el arroyo y los árboles que no son olivos
  // MU5-n (A3-3): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/paisaje.ts (Mundos.creaPaisaje), componente «paisaje-lidar» de los mundos ["exterior"] con un libera()
  // que suelta el grupo, las geometrías, los InstancedMesh, los materiales y la malla de sombras que añade al grupo de 06_arboles (L2-05). Aquí solo se cablea lo del legado.
  // La malla de sombras de los olivos la da 07_follaje (Follaje.sombras()) y este módulo la lee por una función; el nivel del agua lo mueve actualizaPaisaje y lo leen
  // 20_sonido y 22_huellas con Paisaje.agua() (A3-8c: antes, las variables instSombra y aguaNivel de este paso).
  // EST (23_estacion) se declara después de este módulo: entra como función que lo pide en cada uso.
  // [talón] apps/web/src/mundos/exterior/paisaje.ts
  var Paisaje = Mundos.creaPaisaje({
    THREE: THREE, D: D, $: $, ESC_R8: ESC_R8, suelo: suelo, copas: copas, hash: hash, SRGB: SRGB, Estado: Estado, Estaticos: Estaticos, Materiales: Materiales, scene: scene,
    gSombras: gSombras, matSombra: matSombra, geoSombra: geoSombra, cur: cur, nivelEn: nivelEn, EST: function () { return EST; }, VrPresupuesto: typeof VrPresupuesto !== "undefined" ? VrPresupuesto : null,
    instSombra: function (): any { return Follaje.sombras(); }, tMundo: function () { return Tiempo.tMundo(); }
  });
  var colocaPaisaje = Paisaje.colocaPaisaje, sombrasSol = Paisaje.sombrasSol;   // A3-8c: el nivel del agua, Paisaje.agua() (antes, la variable aguaNivel)
  var actualizaPaisaje = Paisaje.actualizaPaisaje, ejeArroyo = Paisaje.ejeArroyo, distArroyo = Paisaje.distArroyo;
  Componentes.registra(Mundos.manifiestoPaisaje(Paisaje));
  // [paso: 19_balizas] Registra el tipo baliza en Entidades (C7). Publica además window.__vrBalizas (pruebas VR: el pie de cada columna de luz).
  // ---------- las balizas: una por parcela, con lo que OlivarTrack sabe de ella; en el paseo, al acercarte, sale su ficha
  // MU5-n (A3-3): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/balizas.ts (Mundos.creaBalizas), componente «balizas-parcela» de los mundos ["exterior"] con un
  // libera() que suelta el grupo, las geometrías, los materiales, el tipo «baliza» de Entidades, el oyente de la ficha, el aviso del minimapa y window.__vrBalizas (L2-05).
  // Aquí solo se cablea lo del legado. OT y VIVO (Historia), paseando (Paseo.E), enQuad y tVida (Vida.E) entran
  // como funciones que los leen en cada uso. TR (24_pantalla), Encuentro y sitioJunto (26_presencia) y VRX (29_vr) se montan DESPUÉS de este módulo: también por función.
  // [talón] apps/web/src/mundos/exterior/balizas.ts
  var Balizas = Mundos.creaBalizas({
    THREE: THREE, $: $, suelo: suelo, bus: Bus, Entidades: Entidades, Usables: Usables, Materiales: Materiales, Estaticos: Estaticos, visor: visor, scene: scene, camera: camera, Estado: Estado,
    objetivo: objetivo, pp: pp, Llegada: Llegada, parcelas: parcelas, HazasPuro: HazasPuro, D: D, num1: num1, esc: esc, documento: document, ventana: window as any,
    paseando: function () { return Paseo.E.paseando; }, OT: function () { return Historia.OT; }, VIVO: function () { return Historia.VIVO; }, tVida: function () { return Vida.E.tVida; }, enQuad: function () { return Vida.E.enQuad; },
    TR: function () { return TR; }, Encuentro: function () { return Encuentro; }, VRX: function () { return VRX; }, sitioJunto: function (c, desde, r, dist) { return sitioJunto(c, desde, r, dist); }
  });
  var colocaBalizas = Balizas.colocaBalizas, avisoBaliza = Balizas.avisoBaliza, dibujaBalizasMini = Balizas.dibujaBalizasMini, actualizaBalizas = Balizas.actualizaBalizas;
  Componentes.registra(Mundos.manifiestoBalizas(Balizas));
  // [paso: 20_sonido]
  // ---------- el sonido del olivar: todo sintetizado en el navegador (no hay ficheros de audio) y atado al tiempo del mundo. MU5-n (A3-4): migrado a TypeScript; el
  // código vive en apps/web/src/mundos/exterior/sonido.ts, componente «sonido-ambiente» (ADR-0023, C4), el de siempre, con su libera(). ?sonido=0 lo apaga.
  // Lo que cambia en cada fotograma (quien pasea, el quad, el dron, el agua) se le da por función; Ajustes y el panel VR, si existen. Aquí solo se cablea.
  // [talón] apps/web/src/mundos/exterior/sonido.ts
  Componentes.registra(Mundos.manifiestoSonido({
    ventana: window, documento: document, cur: cur, nivelEn: nivelEn,
    ajustes: function () { return typeof Ajustes !== "undefined" ? Ajustes : null; }, panelVR: function () { return typeof PanelVR !== "undefined" ? PanelVR : null; },
    vrx: function () { return typeof VRX !== "undefined" ? VRX : null; },
    paseando: function () { return Paseo.E.paseando; }, teclas: function () { return Paseo.E.teclas; }, pp: function () { return pp; }, tVida: function () { return Vida.E.tVida; },
    enQuad: function () { return Vida.E.enQuad; }, vq: function () { return Vida.E.vq; }, enDron: function () { return Vida.E.enDron; }, dr: function () { return dr; },
    aguaNivel: function () { return Paisaje.agua(); }, distArroyo: function (x, y) { return distArroyo(x, y); }
  }));
  // [paso: 21_suelo]
  // ---------- el suelo según el NDVI (dónde hay tierra desnuda y dónde hierba, y cómo de vigorosa) y las matas de hierba y las piedras alrededor de donde miras.
  // MU5-n (A3-4): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/hierba.ts, componente «hierba-suelo» de los mundos ["exterior"] con un
  // libera() que lo suelta todo (L2-05). Aquí quedan, como talón (A3-8a), el cableado y los nombres que leen otros módulos (04d, 08, 22, 23 y 90).
  // [talón] apps/web/src/mundos/exterior/hierba.ts
  var Hierba = Mundos.creaHierba({
    THREE: THREE, D: D, i16: i16, x0: x0, yN: yN, ANCHO: ANCHO, ALTO: ALTO, VRP: VRP, $: $, suelo: suelo, scene: scene, Estado: Estado, texColor: texColor, colorVertSRGB: colorVertSRGB,
    Materiales: Materiales, Estaticos: Estaticos, hash: hash, UN: UN, objetivo: objetivo, orb: orb, NDV: NDV, ndviIdx: function () { return FechaNdvi.E.idx; },
    paseando: function () { return Paseo.E.paseando; }, pp: pp, uViento: uViento, uSombra: uSombra, GLSL_SOMBRA: GLSL_SOMBRA, num1: num1,
    enDron: function () { return typeof Vida !== "undefined" && Vida.E.enDron; }, dr: function () { return dr; },   // 16_vida, después en el montaje
    ejeArroyo: function () { return typeof ejeArroyo !== "undefined" ? ejeArroyo : []; }, distArroyo: function (x, y) { return distArroyo(x, y); },   // 18_paisaje, después
    lienzo: function () { return document.createElement("canvas"); }
  });
  var SN = Hierba.SN, vn2 = Hierba.vn2, cubierta = Hierba.cubierta, actualizaSuelo = Hierba.actualizaSuelo;
  var recoloreaSuelo = Hierba.recoloreaSuelo;   // A3-8a: ya no hace falta izarla (08_marcadores, antes en el montaje, la pide por función al usarla)
  Componentes.registra(Mundos.manifiestoHierba(Hierba));
  // [paso: 22_huellas]
  // ---------- huellas, polvo y pendiente: el suelo se deja marcar y el quad y el paso se adaptan al terreno. MU5-n (A3-5): migrado a TypeScript; el código vive en
  // apps/web/src/mundos/exterior/huellas.ts (pendienteRumbo, pendFactor, quadInc, inclinaQuad y sueloSeco; sin recursos que soltar, así que no es un componente). Aquí solo se cablea
  // lo del legado. (Las huellas y el polvo son el componente «huellas-polvo»: 22b_huellas_polvo.js.)
  // [talón] apps/web/src/mundos/exterior/huellas.ts
  var Huellas = Mundos.creaHuellas({
    suelo: suelo, Estado: Estado, pp: pp, quad: function () { return quad; }, cur: cur,
    aguaNivel: function () { return Paisaje.agua(); },   // 18_paisaje: un valor que cambia
    cubierta: function (x, y) { return cubierta(x, y); }   // 21_suelo, que se carga después
  });
  var pendienteRumbo = Huellas.pendienteRumbo, pendFactor = Huellas.pendFactor, quadInc = Huellas.quadInc, inclinaQuad = Huellas.inclinaQuad, sueloSeco = Huellas.sueloSeco;
  // [paso: 22b_huellas_polvo]
  // ---------- huellas y polvo (componente «huellas-polvo», ADR-0023, C10): las pisadas y rodadas que se desvanecen y las bocanadas de polvo del suelo seco. Quien levanta polvo (el
  // aterrizaje del muñequito, los perros) lo pide por el Bus con «polvo:emite»; apagado (?huellas=0) no se dibuja nada y esos eventos no los atiende nadie.
  // MU5-n (A3-5): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/huellas-polvo.ts, componente de los mundos ["exterior"] con un libera() que quita las dos
  // mallas de la escena y suelta sus geometrías y sus materiales. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/huellas-polvo.ts
  Componentes.registra(Mundos.manifiestoHuellasPolvo({
    THREE: THREE, scene: scene, Estaticos: Estaticos, Materiales: Materiales, suelo: suelo, Estado: Estado,
    pp: pp, paseando: function () { return Paseo.E.paseando; }, teclas: function () { return Paseo.E.teclas; },   // 12_paseo: paseando cambia y teclas se reemplaza al salir del paseo
    cur: cur, nivelEn: nivelEn,
    tVida: function () { return Vida.E.tVida; }, enQuad: function () { return Vida.E.enQuad; }, vq: function () { return Vida.E.vq; }, enDron: function () { return Vida.E.enDron; },   // 16_vida: el estado del paseo
    dr: dr, altSuelo: altSuelo, sueloSeco: sueloSeco
  }));
  // [paso: 23_estacion] Publica además window.__otDebug (depuración del olivo estacional).
  // ---------- el olivo estacional: la fecha de la estación (el deslizador de la fecha del campo) manda en el sol, el clima, el color de la copa y la fenología.
  // MU5-n (A3-4): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/estacion.ts, componente «estacion-olivo» de los mundos ["exterior"] con un
  // libera() que lo suelta todo. Aquí quedan, como talón (A3-8a: ya lo era, solo le faltaba la marca), el cableado y los nombres que leen otros módulos (07, 15, 18, 44b y 90).
  // [talón] apps/web/src/mundos/exterior/estacion.ts
  var Estacion = Mundos.creaEstacion({
    THREE: THREE, $: $, Materiales: Materiales, renderer: renderer, SRGB: SRGB, Estado: Estado, hash: hash, gFollaje: gFollaje, matHojaG: matHojaG, matHojaP: matHojaP,
    NDV: NDV, ndviIdx: function () { return FechaNdvi.E.idx; }, SN: SN, parcelas: parcelas, OT: Historia.OT,
    TiempoPuro: TiempoPuro, ahoraMs: ahoraMs, TM: TM, fmtHora: fmtHora, fmtClaveDia: fmtClaveDia, num1: num1, esc: esc, objetivoMundoBase: objetivoMundoBase, aplicaMundo: aplicaMundo,
    ventana: window, temporizador: { setTimeout: function (f, ms) { return setTimeout(f, ms); }, clearTimeout: function (id) { clearTimeout(id); } }, Evento: Event
  });
  var EST = Estacion.EST, bbchEn = Estacion.bbchEn, construyeFrutosLista = Estacion.construyeFrutosLista, hoyMadrid = Estacion.hoyMadrid, objetivoMundo = Estacion.objetivoMundo;
  var actualizaOlivo = Estacion.actualizaOlivo;
  Componentes.registra(Mundos.manifiestoEstacion(Estacion));
  // [paso: 24_pantalla]
  // ---------- la página ES el visor (decisión 83): el menú (☰ o Esc), la pantalla completa de verdad (⛶ o F) y la transición del mapa al paseo.
  // MU5-n (A3-7a): migrado a TypeScript. El menú y la pantalla completa viven en apps/web/src/ui/pantalla.ts, componente «menu-pantalla» de TODOS los mundos con un
  // libera() que quita sus escuchas; la transición (TR: la cámara que baja volando y el muñeco que cae), en apps/web/src/mundos/comun/transicion.ts (es de la locomoción,
  // como el paseo; sin nada que soltar). Aquí solo se cablea lo del legado: lo que cambia o se declara después (paseando, persona, Hud, tamano) entra por getter.
  // [talón] apps/web/src/ui/pantalla.ts
  var MenuPantalla = Interfaz.creaPantalla({
    $: $, get paseando() { return Paseo.E.paseando; }, get Hud() { return typeof Hud !== "undefined" ? Hud : undefined; }, get tamano() { return tamano; }, ventana: window, documento: document
  });
  var Menu = MenuPantalla.Menu;
  var Transicion = Mundos.creaTransicion({ THREE: THREE, camera: camera, pp: pp, altSuelo: altSuelo, sueloSeco: sueloSeco, Bus: Bus, get persona() { return Paseo.E.persona; } });
  var TR = Transicion.TR, iniciaTransicion = Transicion.iniciaTransicion, transEntrada = Transicion.transEntrada, iniciaSalida = Transicion.iniciaSalida, transSalida = Transicion.transSalida;
  Componentes.registra(Interfaz.manifiestoPantalla(MenuPantalla));
  // [paso: 25_perros] TALÓN (MU5-n, A3-5): el código vive en apps/web/src/mundos/exterior/perros.ts (Mundos.manifiestoPerros). Publica además window.__perrosDebug (depuración).
  // ---------- los perros del paseo: una dálmata adulta y un cruce de dálmata y mastín (rubio y sin manchas). Te siguen, exploran, persiguen conejos y vuelven a tu lado.
  // Componente «perros-paseo» (ADR-0023, C10): solo se registra. Nadie lo nombra: el aterrizaje y la VR le dicen «perros:llegan»; la fauna le pregunta «perros:amenaza» (rellena res
  // con el punto del que huir, o nada); el minimapa los pinta con su capa (Minimapa.capa); el ladrido sale por «sonido:ladrido» y el polvo por «polvo:emite».
  // MU5-n (A3-5): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/perros.ts, componente de los mundos ["exterior"] con un libera() que quita el grupo de gFauna,
  // suelta mallas, geometrías, materiales y texturas, para el reloj del primer ladrido y quita la capa del minimapa, las escuchas y window.__perrosDebug. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/perros.ts
  Componentes.registra(Mundos.manifiestoPerros({
    THREE: THREE, Materiales: Materiales, D: D, copas: copas, camera: camera, texColor: texColor, hash: hash, geoSombra: geoSombra, matSombra: matSombra,
    paseando: function () { return Paseo.E.paseando; }, pp: pp,   // 12_paseo: paseando cambia
    tVida: function () { return Vida.E.tVida; }, enQuad: function () { return Vida.E.enQuad; }, enDron: function () { return Vida.E.enDron; },   // 16_vida: el estado del paseo (cambian cada fotograma: por función)
    gFauna: gFauna, altSuelo: altSuelo, pendienteRumbo: pendienteRumbo, sueloSeco: sueloSeco, Minimapa: Minimapa, fusionaGeometrias: fusionaGeometrias,
    document: document, window: window,
    reloj: { setTimeout: function (f, ms: any) { return setTimeout(f, ms); }, clearTimeout: function (id: any) { clearTimeout(id); } }
  }));
  // [paso: 26_presencia] No es un componente ni monta nada: el protocolo y la lógica pura de la presencia compartida (PoseCodec, BufferPose, Aspecto, SalaPose, Chat, Muneco, Encuentro) y sitioJunto. MU5-n (A3-6a): talón; el código vive en apps/web/src/red/pose.ts y sala.ts (lo que es red) y en apps/web/src/mundos/comun/muneco.ts (el muñeco, el encuentro y la cuenta). La presencia que los usa es el componente de 38_presencia_compartida.js (C5). Lo prueban pose.test.ts, sala.test.ts, muneco.test.ts y pruebas/guardianes/presencia.test.js, presencia_red.test.js y muneco_aspecto.test.js.
  // ---------- presencia compartida (F2, contratos/presencia.md): el protocolo y la lógica pura que comparten la presencia y quien la usa. Este fichero NO es un
  // componente ni monta nada. MU5-n (A3-6a): migrado a TypeScript tal cual; lo que es red (sin three) vive en apps/web/src/red/ (pose.ts: PoseCodec y BufferPose;
  // sala.ts: Aspecto, SalaPose, Chat, AutoPresencia y Reintento) y lo que es de dibujo y de mundo, en apps/web/src/mundos/comun/muneco.ts (Muneco, Encuentro, Cuenta
  // y sitioJunto, que también usan las balizas). Aquí se cablean los nombres de siempre: las copas, el recuadro y el suelo de 02_mundo entran por argumento.
  // La presencia que los usa es el componente «presencia-compartida» (38_presencia_compartida.js); la red, 37_red.js; los avatares VRM, 26b_avatares.js.
  // [talón] apps/web/src/red/sala.ts
  var PoseCodec = Mundos.PoseCodec, BufferPose = Mundos.BufferPose, Aspecto = Mundos.Aspecto, SalaPose = Mundos.SalaPose, Chat = Mundos.Chat;
  var Muneco = Mundos.Muneco, Encuentro = Mundos.Encuentro, Cuenta = Mundos.Cuenta, AutoPresencia = Mundos.AutoPresencia, Reintento = Mundos.Reintento;
  var sitioJunto = Mundos.creaSitioJunto({ get copas() { return copas; }, D: D, suelo: function (x, y) { return suelo(x, y); } });
  // [paso: 26b_avatares] Componente «avatares-vrm» (ADR-0023, C5): solo se registra; consume la presencia (n.api) y se engancha a ella con enganchaVRM. Sin presencia activa no crea nada; con ella, pide /avatares/catalogo.json solo si alguien lleva avatar (o con &vrm=1 en la simulación) e import("@pixiv/three-vrm") solo entonces. MU5-n (A3-6a): talón; el código vive en apps/web/src/mundos/comun/avatares.ts (componente de todo mundo). Lo prueban avatares.test.ts y pruebas/guardianes/avatares_motor.test.js.
  // ---------- avatares VRM (P7c, ADR-0020), componente «avatares-vrm» (C5, ADR-0023, consume la presencia): los N más cercanos que caben en el presupuesto del aparato
  // llevan su VRM del catálogo; el resto, el muñeco instanciado de la presencia; y, en tercera persona, tu paseante es tu avatar (decisión 76). MU5-n (A3-6a): migrado a
  // TypeScript tal cual; el código y la explicación entera viven en apps/web/src/mundos/comun/avatares.ts, componente de TODO mundo (mundos: "todos") con un libera() que
  // suelta cada VRM, tu avatar, el grupo y, desde A3-6a (L2-09), los ficheros descargados. Aquí se cablea lo del legado: lo que otros módulos reescriben (paseando,
  // persona, primera, pp, enQuad, enDron, VRX) entra por getters; las dos importaciones dinámicas (three-vrm y el GLTFLoader) se quedan escritas aquí para que Vite
  // las trocee como antes (solo se piden si alguien lleva avatar).
  // [talón] apps/web/src/mundos/comun/avatares.ts
  Componentes.registra(Mundos.manifiestoAvatares({
    THREE: THREE, location: location, window: window, consola: console, fetch: function (u, o: any) { return fetch(u, o); },
    cargaVrm: function () { return Promise.all([import("@pixiv/three-vrm"), import("three/addons/loaders/GLTFLoader.js")]); },
    Aparato: Aparato, Materiales: Materiales, Componentes: Componentes, suelo: function (x, y) { return typeof gm !== "undefined" && gm ? gm.suelo(x, y) : suelo(x, y); }, libreMundo: function () { return typeof Interiores !== "undefined" && Interiores ? Interiores.libre() : null; }, renderer: renderer, scene: scene, camera: camera, Estado: Estado,   // ADR-0036: el suelo del mundo activo y lo que deja libre un interior (T8), por función (gm e Interiores se crean después)
    get paseando() { return Paseo.E.paseando; }, get persona() { return Paseo.E.persona; }, get primera() { return Paseo.E.primera; }, get pp() { return pp; },
    get enQuad() { return Vida.E.enQuad; }, get enDron() { return Vida.E.enDron; }, get VRX() { return VRX; }, get VrPresupuesto() { return VrPresupuesto; }
  }));
  // [paso: 27_debug] Talón (MU5-n, A3-7a) de apps/web/src/ui/ganchos.ts: publica window.__g, el gancho de las pruebas (contrato en doc/sistema/CONTRATOS.md). No es un componente.
  // ---------- ganchos de depuración y de prueba: window.__g (contrato en doc/sistema/CONTRATOS.md), solo lectura y ajuste de cámara; sinDibujo para las pruebas de DOM.
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/ganchos.ts. No es un componente (nada que soltar; vive lo que la página). Aquí solo se cablea
  // lo del legado: lo de siempre por valor, al cargarse, como antes; lo que cambia (paseando, teclas, listo), por getter.
  // [talón] apps/web/src/ui/ganchos.ts
  var Ganchos = Interfaz.creaGanchos({
    Arboles: Arboles, Catalogo: Catalogo, Escena3D: Escena3D, OlivosTiles: OlivosTiles, Cola: Cola, SueloFotos: SueloFotos, Generados: Generados, Lejanos: Lejanos, Mundo: Mundo,
    InfoDibujo: InfoDibujo, Estado: Estado, copas: copas, suelo: suelo, orb: orb, objetivo: objetivo, camera: camera, renderer: renderer, scene: scene, pon: pon, aplica: aplica,
    entraPaseo: entraPaseo, salePaseo: salePaseo, pp: pp, get paseando() { return Paseo.E.paseando; }, get teclas() { return Paseo.E.teclas; }, get listo() { return Marcadores.listo(); }, ventana: window
  });
  // [paso: 28_depura]
  // ---------- ?debug: un contador en la esquina del visor para medir en el móvil (ms de JS por fotograma, llamadas, triángulos, teselas y olivos por nivel)
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/depura.ts, componente «contador-depura» de TODOS los mundos con un libera() que saca su caja.
  // Aquí solo se cablea lo del legado: vrDebugExtra (29_vr) y Ajustes (33) se montan después y entran por getter.
  // [talón] apps/web/src/ui/depura.ts
  var Depura = Interfaz.creaDepura({
    Aparato: Aparato, Mundo: Mundo, Cola: Cola, Bus: Bus, XrPerillas: XrPerillas, InfoDibujo: InfoDibujo, visor: visor, renderer: renderer, Arboles: Arboles,
    get vrDebugExtra() { return vrDebugExtra; }, get Ajustes() { return Ajustes; }, ventana: window, documento: document
  });
  var depuraCuadro = Depura.depuraCuadro;
  Componentes.registra(Interfaz.manifiestoDepura(Depura));
  // [paso: 29_vr] Publica además window.__vrDebug, __vrOlivo, __vrBotones, __vrVuelo y VR_ESTADO (depuración y pruebas VR).
  // ---------- modo VR inmersivo (WebXR, Meta Quest Browser): el paseo en primera persona con mandos, un panel flotante y un perfil de rendimiento propio.
  // MU5-n (A3-6c): migrado a TypeScript; el código vive en apps/web/src/mundos/comun/ (vr.ts, que reúne vr-rig.ts, vr-teletransporte.ts, vr-panel.ts, vr-sesion.ts y vr-puros.ts),
  // componente «vr» de TODOS los mundos (la VR es de todo mundo) con un libera() que suelta de verdad lo que crea y quita sus escuchas (lo registra 90_final.js, como Vida).
  // Aquí solo se cablea lo del legado: lo que otros módulos reescriben (paseando, primera, persona, teclas, ndviIdx…) o se declara después (Ajustes, TR, gm, cuadro, tamano, bucle)
  // entra por función; los nombres de siempre (VRX, PanelVR, vrActualiza…) son los de Vr.
  // [talón] apps/web/src/mundos/comun/vr.ts
  var Vr = Mundos.creaVr({
    THREE: THREE, renderer: renderer, scene: scene, camera: camera, Estado: Estado, sol: sol, texColor: texColor, D: D, $: $, fmt: fmt, VRP: VRP, Aparato: Aparato,
    suelo: suelo, copas: function () { return copas; }, Cola: Cola, ComponentesPuro: ComponentesPuro, Bus: Bus, Config: Config, LaminasPuro: LaminasPuro, Laminas: Laminas,
    EntidadesPuro: EntidadesPuro, Entidades: Entidades, Usables: Usables, XrPerillas: XrPerillas, VrControlPuro: VrControlPuro, VrPresupuesto: VrPresupuesto, InfoDibujo: InfoDibujo,
    Materiales: Materiales, UN: UN, Arboles: Arboles, Escena3D: Escena3D, pon: function (m) { pon(m); },
    NDV: function () { return NDV; }, ndviIdx: function () { return FechaNdvi.E.idx; }, parcelas: function () { return parcelas; }, fincas: function () { return fincas; }, meta: meta,
    pasoHoraMundo: function (d) { pasoHoraMundo(d); }, horaMundoTexto: function () { return horaMundoTexto(); },
    paseando: function () { return Paseo.E.paseando; }, primera: function () { return Paseo.E.primera; }, ponPrimera: function (v) { Paseo.E.primera = v; }, persona: function () { return Paseo.E.persona; },
    teclas: function () { return Paseo.E.teclas; }, pp: pp, entraPaseo: function () { entraPaseo(); }, salePaseo: function () { salePaseo(); }, actualizaPaseo: function (dt) { actualizaPaseo(dt); },
    Llegada: Llegada, pendFactor: function () { return pendFactor(); }, TR: TR,
    Ajustes: function () { return typeof Ajustes !== "undefined" ? Ajustes : null; },
    gm: function () { return gm; }, cuadro: function (t) { cuadro(t); }, tamano: function () { tamano(); }, pideFotograma: function () { requestAnimationFrame(bucle); },
    busqueda: typeof location !== "undefined" ? location.search : "", navegador: navigator, documento: document, ventana: window
  });
  var VRX = Vr.VRX, vrRig = Vr.vrRig, vrDebugExtra = Vr.vrDebugExtra, vrMano = Vr.vrMano, vrRayoDe = Vr.vrRayoDe, vrCierra = Vr.vrCierra, vrAbre = Vr.vrAbre, vrFundido = Vr.vrFundido;
  var vrAparece = Vr.vrAparece, creaLamina = Vr.creaLamina, panel = Vr.panel, vrBajoRayo = Vr.vrBajoRayo, vrRect = Vr.vrRect, vrAj = Vr.vrAj, PanelVR = Vr.PanelVR;
  var vrPintaFicha = Vr.vrPintaFicha, vrRecoloca = Vr.vrRecoloca, vrPulso = Vr.vrPulso, vrActualiza = Vr.vrActualiza, vrFin = Vr.vrFin;
  // [paso: 30_mide]
  // ---------- medidor de fotogramas para la prueba en el aparato (T7a, doc/sistema/VR.md#medir-con-el-medidor). Componente «medidor-fotogramas» (?medidor=0 lo apaga).
  // Sin &mide ni botón pulsado no hace nada: no escucha «cuadro:fin» y el bucle no paga nada. Es una medida del aparato: en Chrome sin GPU los números no valen como fps.
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/mide.ts (MideEst y el componente), de TODOS los mundos. Aquí solo se cablea lo del legado:
  // todo por getter, como antes lo leía el componente (al usarlo, no al cargarse): Ajustes (33) se monta después, y location, localStorage y navigator se leen dentro de un try.
  // [talón] apps/web/src/ui/mide.ts
  Componentes.registra(Interfaz.manifiestoMide({
    get D() { return D; }, get DEPURA() { return DEPURA; }, get Aparato() { return Aparato; }, get Cola() { return Cola; }, get Reparto() { return Reparto; },
    get ConfigPuro() { return ConfigPuro; }, get XrPerillas() { return XrPerillas; }, get Render() { return Render; }, get Materiales() { return Materiales; },
    get visor() { return visor; }, get renderer() { return renderer; }, get Estado() { return Estado; }, get Escena3D() { return Escena3D; }, get SueloFotos() { return SueloFotos; },
    get Generados() { return Generados; }, get Arboles() { return Arboles; }, get VRX() { return VRX; }, get PanelVR() { return PanelVR; },
    get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; }, get location() { return location; }, get localStorage() { return localStorage; },
    get navigator() { return navigator; }, get ventana() { return window; }, get documento() { return document; }
  }));
  // [paso: 31_hud]
  // ---------- el HUD (doc/sistema/UX-FINCA-JUEGO.md §4.3): estado arriba a la izquierda, barra de iconos arriba a la derecha, avisos arriba en el centro, «Pasear» y la
  // atribución abajo; el selector de modo, el teclado y los pulgares. Expone Hud.aviso, Hud.zonasProhibidas, Hud.modo, Hud.icono, Hud.alInicio…
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/hud.ts (HudPuro y Hud), componente «hud» de TODOS los mundos con un libera() que para sus
  // dos relojes (L2-11) y quita sus escuchas y su observador. Aquí solo se cablea lo del legado: lo que cambia o se declara después entra por getter.
  // [talón] apps/web/src/ui/hud.ts
  var HudPuro = Interfaz.HudPuro;
  var Hud = Interfaz.creaHud({
    $: $, Bus: Bus, THREE: THREE, lienzo: lienzo, visor: visor, camera: camera, orb: orb, pp: pp, dr: dr, VRX: VRX, ponQuad: ponQuad, ponDron: ponDron,
    get paseando() { return Paseo.E.paseando; }, get enQuad() { return Vida.E.enQuad; }, get enDron() { return Vida.E.enDron; },
    get Ventanas() { return typeof Ventanas !== "undefined" ? Ventanas : undefined; }, get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; },
    get Movibles() { return typeof Movibles !== "undefined" ? Movibles : undefined; }, get Menu() { return typeof Menu !== "undefined" ? Menu : undefined; },
    ventana: window, documento: document
  });
  Componentes.registra(Interfaz.manifiestoHud(Hud));
  // [paso: 31b_hud_personal]
  // ---------- lo tuyo en pantalla (EV2-A4, doc/sistema/VIABILIDAD-INTERACCION.md): «hora · tu haza · hablar · volver» juntos, bajo el tiempo del HUD (#hudPersonal).
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/hud-personal.ts (HudPersonalPuro, que también usa el menú de muñeca de VR), componente
  // «hud-personal» de TODOS los mundos con un libera() que para su reloj (L2-11) y quita sus escuchas. Aquí solo se cablea lo del legado: paseando cambia.
  // [talón] apps/web/src/ui/hud-personal.ts
  var HudPersonalPuro = Interfaz.HudPersonalPuro;
  var HudPersonal = Interfaz.creaHudPersonal({
    $: $, Bus: Bus, Hazas: Hazas, horaMundoTexto: horaMundoTexto, objetivo: objetivo, pp: pp, Usables: Usables, Hud: Hud, get paseando() { return Paseo.E.paseando; }
  });
  Componentes.registra(Interfaz.manifiestoHudPersonal(HudPersonal));
  // [paso: 31c_muneca] EV2-A3: el menú de muñeca en VR («hora · tu haza · hablar · volver», con los textos de HudPersonalPuro de 31b). MU5-n (A3-6a): talón del componente «muneca-vr», de todo mundo; el código vive en apps/web/src/mundos/comun/muneca.ts. Se engancha a 29_vr por PanelVR.alFotograma y PanelVR.alGatillo y lo suelta en su libera(); ?xrmuneca=0 y el ajuste vr.muneca lo apagan. Publica además window.__vrMuneca y __vrMunecaPulsa (pruebas VR). Lo prueban muneca.test.ts y en Node pruebas/guardianes/vr_muneca.test.js.
  // ---------- EV2-A3: el menú de muñeca en VR («hora · tu haza · hablar · volver», con los textos de HudPersonalPuro de 31b). MU5-n (A3-6a): migrado a TypeScript tal cual;
  // el código y la explicación entera viven en apps/web/src/mundos/comun/muneca.ts, y pasa a ser el componente «muneca-vr», de TODO mundo (mundos: "todos"), con un
  // libera() que suelta la lámina, sus enganches de PanelVR y del Bus y los ganchos de las pruebas (antes se enganchaba al cargarse y no se soltaba nunca). Aquí se
  // cablea lo del legado: todo lo de 29_vr, 12_paseo, 12b, 13b, 15_tiempo, 02e y 31b entra por getters (lo reescriben A3-4 y A3-6c).
  // [talón] apps/web/src/mundos/comun/muneca.ts
  Componentes.registra(Mundos.manifiestoMuneca({
    THREE: THREE, location: location, window: window, renderer: renderer, ComponentesPuro: ComponentesPuro,
    get VRX() { return VRX; }, get vrRig() { return vrRig; }, get PanelVR() { return PanelVR; }, get HudPersonalPuro() { return HudPersonalPuro; }, get Hazas() { return Hazas; },
    get Usables() { return Usables; }, get Llegada() { return Llegada; }, get pp() { return pp; }, get vrMano() { return vrMano; }, get vrRayoDe() { return vrRayoDe; },
    get creaLamina() { return creaLamina; }, get vrBajoRayo() { return vrBajoRayo; }, get vrRect() { return vrRect; }, get vrAj() { return vrAj; },
    get vrPintaFicha() { return vrPintaFicha; }, get vrPulso() { return vrPulso; }, get horaMundoTexto() { return horaMundoTexto; }
  }));
  // [paso: 32_ventanas]
  // ---------- las ventanas (doc/sistema/UX-FINCA-JUEGO.md §4.4, decisión 87): una grande a la vez, no modales; al abrir, el foco va al título; al cerrar, vuelve a quien
  // la abrió. MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/ventanas.ts (VentanasPuro y Ventanas), componente «ventanas» de TODOS los mundos
  // con un libera() que cierra la abierta, saca las registradas y quita sus escuchas. Aquí solo se cablea lo del legado: paseando cambia y Movibles se monta después.
  // [talón] apps/web/src/ui/ventanas.ts
  var VentanasPuro = Interfaz.VentanasPuro;
  var Ventanas = Interfaz.creaVentanas({
    $: $, lienzo: lienzo, visor: visor, get paseando() { return Paseo.E.paseando; }, get Movibles() { return typeof Movibles !== "undefined" ? Movibles : undefined; },
    ventana: window, documento: document
  });
  Componentes.registra(Interfaz.manifiestoVentanas(Ventanas));
  // [paso: 32b_capas]
  // ---------- punto de extensión de las capas del mundo (ADR-0023, C2): Capas.registra(def) pone una casilla en la ventana «Capas y vista», con la pastilla de su
  // procedencia (regla 5). MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/capas.ts (CapasPuro y Capas), componente «capas-mundo» de TODOS
  // los mundos con un libera() que saca las casillas registradas. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/ui/capas.ts
  var CapasPuro = Interfaz.CapasPuro;
  var Capas = Interfaz.creaCapas({ $: $, documento: document });
  Componentes.registra(Interfaz.manifiestoCapas(Capas));
  // [paso: 33_ajustes]
  // ---------- Configuración (UX-FINCA-JUEGO §4.5): los ajustes de la persona, guardados en localStorage (prefijo gemelo.ajustes.); una URL manda sobre el ajuste
  // (?debug, &mide=). Los módulos que dependen de un ajuste lo LEEN (Ajustes.lee) o se suscriben (Ajustes.alCambiar).
  // MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/ajustes.ts (AjustesPuro y Ajustes), componente «configuracion» de TODOS los mundos con un
  // libera() que quita sus escuchas y saca la interfaz que pinta. Aquí solo se cablea lo del legado: Hud, Movibles y tamano se leen en cada uso (por getter).
  // [talón] apps/web/src/ui/ajustes.ts
  var AjustesPuro = Interfaz.AjustesPuro;
  var Ajustes = Interfaz.creaAjustes({
    $: $, fmt: fmt, Bus: Bus, Render: Render, renderer: renderer, get Hud() { return typeof Hud !== "undefined" ? Hud : undefined; },
    get Movibles() { return typeof Movibles !== "undefined" ? Movibles : undefined; }, get tamano(): any { return typeof tamano !== "undefined" ? tamano : undefined; }, ventana: window, documento: document
  });
  Componentes.registra(Interfaz.manifiestoAjustes(Ajustes));
  // [paso: 34_movibles]
  // ---------- ventanas flotantes que se pueden mover (UX-del-juego §6): el chat, su burbuja y el minimapa se arrastran por su barra, recuerdan su sitio por forma
  // de pantalla y nunca se quedan encima de los controles. MU5-n (A3-7a): migrado a TypeScript; el código vive en apps/web/src/ui/movibles.ts (MoviblesPuro y
  // Movibles), componente «movibles» de TODOS los mundos con un libera() que quita sus escuchas, su observador y los nodos que crea. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/ui/movibles.ts
  var MoviblesPuro = Interfaz.MoviblesPuro;
  var Movibles = Interfaz.creaMovibles({ visor: visor, get Hud() { return typeof Hud !== "undefined" ? Hud : undefined; }, ventana: window, documento: document });
  Componentes.registra(Interfaz.manifiestoMovibles(Movibles));
  // [paso: 34b_palanca]
  // ---------- la palanca flotante (EV2-B2): andar con el pulgar, encendida por defecto en pantalla táctil; arrastrar la otra mitad gira al paseante (nipplejs 1.0.4, MIT; regla 12).
  // MU5-n (A3-6c): migrado a TypeScript; el código vive en apps/web/src/mundos/comun/palanca.ts, componente «palanca-tactil» de TODOS los mundos con un libera() que destruye la palanca y
  // quita sus escuchas. Aquí solo se cablea lo del legado; el import() de nipplejs se queda escrito aquí para que Vite lo trocee igual (solo se pide la primera vez que hace falta).
  // [talón] apps/web/src/mundos/comun/palanca.ts
  var Palanca = Mundos.creaPalanca({
    $: $, lienzo: lienzo, visor: visor, documento: document, busqueda: typeof location !== "undefined" ? location.search : "", PalancaPuro: PalancaPuro, ponPalanca: ponPalanca,
    giraPalanca: giraPalanca, sensMirar: sensMirar, paseando: function () { return Paseo.E.paseando; }, Ajustes: function () { return typeof Ajustes !== "undefined" ? Ajustes : null; },
    cargaNipple: function () { return import("nipplejs"); }
  });
  Componentes.registra(Mundos.manifiestoPalanca(Palanca));
  // [paso: 35_fichas_tiempo] Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/fichas-tiempo.ts: FichasTiempoPuro y el componente «fichas-tiempo» de los mundos ["exterior"] (ADR-0023), con su libera() (cierra la lámina; lo demás lo suelta el contexto). Solo se registra (Componentes.registra); nadie lo nombra. Montado, publica window.__fichaTiempo (pruebas), la tecla P, la fila del tiempo del panel VR y escucha «prevision:alterna». Lee TiempoVivo si el motor lo expone; sin él, un respaldo simulado rotulado. Nunca dice si se puede tratar (regla 1 de Vigía). Los trozos [puro] y [motor] los evalúa en Node pruebas/guardianes/fichas_tiempo.test.js (que lee el .ts como JavaScript, _fuente.js).
  // ---------- la previsión del tiempo como lámina en el mundo (doc/sistema/UX-FINCA-JUEGO.md §4.11): en VR y en el paseo, un cartel anclado al mundo con «Ahora» (medido en la
  // estación, que no está en la finca) y las próximas horas y días (modelado). MU5-n (A3-7b1): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/fichas-tiempo.ts
  // (FichasTiempoPuro y el componente «fichas-tiempo» de los mundos ["exterior"], con su libera()). Aquí solo se cablea lo del legado: «paseando» (que 12_paseo reescribe) entra por getter.
  // Se abre con «Ver previsión» en la pestaña Mundo del panel VR, con la tecla P paseando, o con el evento «prevision:alterna» del Bus (el botón de la ventana Tiempo).
  // [talón] apps/web/src/mundos/exterior/fichas-tiempo.ts
  Componentes.registra(Mundos.manifiestoFichasTiempo({
    THREE: THREE, Laminas: Laminas, Teclas: Teclas, Hud: Hud, VRX: VRX, PanelVR: PanelVR, camera: camera, TiempoVivo: TiempoVivo, ahoraMs: ahoraMs, nivel: nivel, get paseando() { return Paseo.E.paseando; }
  }));
  // [paso: 36_mandos]
  // ---------- I6: el aspecto de los mandos y de las manos en VR (el modelo real del mando del perfil de WebXR Input Profiles y la mano articulada; de respaldo, la caja y las esferas).
  // MU5-n (A3-6c): migrado a TypeScript; el código vive en apps/web/src/mundos/comun/mandos.ts, componente «mandos-vr» de TODOS los mundos (la VR es de todo mundo) con un libera() que
  // suelta la sesión si la hay y quita las escuchas de los grupos de three. Aquí solo se cablea lo del legado; el import() de las fábricas de three se queda escrito aquí para que Vite
  // trocee igual que antes (solo se pide al entrar en VR).
  // [talón] apps/web/src/mundos/comun/mandos.ts
  Componentes.registra(Mundos.manifiestoMandos({
    THREE: THREE, renderer: renderer, Materiales: Materiales, ventana: window, consola: console,
    cargaLib: function () {
      return Promise.all([import("three/addons/webxr/XRControllerModelFactory.js"), import("three/addons/webxr/XRHandModelFactory.js"),
        import("three/addons/webxr/XRHandPrimitiveModel.js"), import("three/addons/loaders/GLTFLoader.js")]);
    }
  }));
  // [paso: 37_red] Componente «red-salas» (ADR-0023, C5): el único que habla con LiveKit (import("livekit-client") la primera vez que alguien se une a una sala). Solo se registra; expone «Red» por n.api: salas por clave, unirse, salir o cambiar, publicar y escuchar por tema, estado y participantes. Emite «red:estado». MU5-n (A3-6a): talón; el código vive en apps/web/src/red/salas.ts (componente de todo mundo). Lo prueban salas.test.ts y pruebas/guardianes/red.test.js con un LiveKit de mentira.
  // ---------- la red en tiempo real (C5, ADR-0023; doc/sistema/COMPONENTES.md §6): el componente «red-salas» es el ÚNICO que habla con LiveKit. MU5-n (A3-6a): migrado a
  // TypeScript; el código y la explicación entera viven en apps/web/src/red/salas.ts, componente de TODO mundo (mundos: "todos") con un libera() que cierra todas las salas.
  // Aquí se cablea lo del legado: la importación dinámica de livekit-client se queda escrita aquí, en carga, para que Vite la trocee como antes (solo se llama cuando alguien
  // se une a una sala).
  // [talón] apps/web/src/red/salas.ts
  Componentes.registra(Mundos.manifiestoRed({
    carga: function () { return import("livekit-client"); }, base: function () { return location.href; }, consola: console
  }));
  // [paso: 38_presencia_compartida] Componente «presencia-compartida» (ADR-0023, C5): solo se registra; consume la red (sala «visita») y expone «Presencia» (para los avatares VRM). Sin ?presencia=sim o ?presencia=red, montado no crea nada; con red, el panel Gente y el chat; F3f: viaja a la sala de una visita guiada (Presencia.entraGuiada, token de F3c) y vuelve sola a la general si la sala se cierra o te sacan. Registra el tipo persona en Entidades (C7) y da su línea de ?debug por «depura:lineas». F3k-3: acciones de otros componentes en la ficha de una persona y en su fila de Gente (Presencia.accionesPersona; los corros de 47b), su distancia (Presencia.distancia) y repintar Gente (Presencia.repintaGente). Publica window.__presencia y window.__presenciaChat (pruebas). MU5-n (A3-6a): talón; el código vive en apps/web/src/mundos/comun/presencia.ts (componente de todo mundo). Lo prueban presencia.test.ts y en Node pruebas/guardianes/red.test.js.
  // ---------- presencia compartida (F2, contratos/presencia.md), componente «presencia-compartida» (C5, ADR-0023): los demás visitantes como muñecos instanciados,
  // su pose por el códec del contrato, su interpolación y, en la sala de verdad, el apartado Gente y el chat. MU5-n (A3-6a): migrado a TypeScript tal cual; el código y
  // la explicación entera viven en apps/web/src/mundos/comun/presencia.ts, componente de TODO mundo (mundos: "todos") con un libera() que suelta de verdad las mallas,
  // las geometrías, los materiales, el atlas de nombres, el panel, los relojes, las escuchas y la sala. Aquí se cablea lo del legado: lo que otros módulos reescriben
  // o se carga después (objetivo, paseando, pp, enQuad, enDron, VRX, Ajustes, Movibles, Llegada, TR) entra por getters; la importación dinámica de BufferGeometryUtils
  // (el quad y el dron de los demás) se queda escrita aquí para que Vite la trocee como antes.
  // [talón] apps/web/src/mundos/comun/presencia.ts
  Componentes.registra(Mundos.manifiestoPresencia({
    THREE: THREE, location: location, window: window, document: document, consola: console, fetch: function (u, o: any) { return fetch(u, o); },
    utilesGeometria: function () { return import("three/addons/utils/BufferGeometryUtils.js"); },
    D: D, ConfigPuro: ConfigPuro, Aparato: Aparato, Materiales: Materiales, Entidades: Entidades, Componentes: Componentes, suelo: function (x, y) { return typeof gm !== "undefined" && gm ? gm.suelo(x, y) : suelo(x, y); }, sitioJunto: sitioJunto, mundoActual: function () { return typeof gm !== "undefined" && gm ? gm.actual : "exterior"; },   // T0: suelo y mundo activo por función (gm se crea después)
    scene: scene, camera: camera, renderer: renderer, texColor: texColor, Estado: Estado, visor: visor, quad: quad, dron: dron,
    get objetivo() { return objetivo; }, get paseando() { return Paseo.E.paseando; }, get pp() { return pp; }, get enQuad() { return Vida.E.enQuad; }, get enDron() { return Vida.E.enDron; },
    get VRX() { return VRX; }, get Llegada() { return Llegada; }, get TR() { return TR; },
    get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; }, get Movibles() { return typeof Movibles !== "undefined" ? Movibles : undefined; }
  }));
  // [paso: 39_oficina_mundo] Talón (MU5-n, A3-7b2; partido en A3-8b) de apps/web/src/ui/oficina-mundo.ts, componente «oficina-mundo» de todo mundo (OF10, ADR-0023 y ADR-0024; decisiones 107 y 114): lo que la oficina hace en el mundo y tiene que llegar en cualquiera. Solo se registra; nadie lo nombra. Consume la red (sala «visita») y la presencia. Anuncios (tema «anuncio»: aviso arriba, lámina en VR y chat), invitación a otra sala (tema «sala»: «Ir» o «Quedarme») y, si tu rol en la sala es de oficina, la ventana «Oficina» (anunciar, invitar y, en el exterior, poner baliza). Valida también el tema «balizas» y se lo pasa a 39b. Los tres temas solo valen SIN participante (los manda la api). Emite oficina:anuncio y oficina:sala. Publica window.__oficinaMundo (pruebas: el estado de los dos). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/oficina_mundo.test.js.
  // ---------- el mundo en modo oficina (OF10). A3-8b: los anuncios, las invitaciones y el panel, componente de todo mundo; las balizas oficiales, del exterior, en 39b. VRX, por getter.
  // [talón] apps/web/src/ui/oficina-mundo.ts
  Componentes.registra(Interfaz.manifiestoOficinaMundo({
    D: D, Componentes: Componentes, Laminas: Laminas, visor: visor, HazasPuro: HazasPuro, Chat: Chat, Hud: Hud, Ventanas: Ventanas, get VRX() { return VRX; } }));
  // [paso: 39b_oficina_balizas] Talón (MU5-n, A3-8b) de apps/web/src/mundos/exterior/oficina-balizas.ts, componente «oficina-balizas» de los mundos ["exterior"]: las balizas oficiales (tipo «baliza-oficial» de Entidades, GET /api/balizas-oficiales, una capa del minimapa, dos mallas instanciadas). Consume la oficina de 39 (OficinaMundo): ?oficina=0 la apaga con ella.
  // ---------- las balizas oficiales de la oficina (OF10; A3-8b), componente del exterior que consume el de 39. Lo que otros reescriben (VRX, paseando, enQuad), por getter.
  // [talón] apps/web/src/mundos/exterior/oficina-balizas.ts
  Componentes.registra(Mundos.manifiestoOficinaBalizas({
    THREE: THREE, D: D, suelo: suelo, Componentes: Componentes, Entidades: Entidades, Estaticos: Estaticos, Materiales: Materiales, scene: scene, camera: camera, Estado: Estado, objetivo: objetivo, pp: pp,
    Llegada: Llegada, Minimapa: Minimapa, Aspecto: Aspecto, Encuentro: Encuentro, sitioJunto: sitioJunto, get VRX() { return VRX; }, get paseando() { return Paseo.E.paseando; }, get enQuad() { return Vida.E.enQuad; }
  }));
  // [paso: 40_juegos] Componente «juegos» (ADR-0023, C9a): el anfitrión de juegos casuales. Solo se registra; nadie lo nombra. Montado: icono y ventana «Juegos», tecla J, recoge los juegos por el Bus («juego:ofrece» / «juego:pide» / «juego:retira»), abre uno a pantalla completa con el mundo en pausa (Pausa de 02c; su fase «pausa») y guarda el récord (localStorage y, con servidor, /api/juegos/<id>/…). Publica window.__juegos (pruebas). El trozo [puro:…] lo evalúa en Node pruebas/guardianes/juego_cosecha.test.js.
  // ---------- el anfitrión de juegos (C9a, decisiones 125 y 136; doc/sistema/JUEGOS.md). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la explicación viven en
  // apps/web/src/mundos/exterior/juegos.ts, componente de los mundos ["exterior"] (los juegos son del olivar) con un libera() que, además de cerrar la partida y la lámina de VR,
  // cancela las peticiones a la api en vuelo. Aquí solo se cablea lo del legado: VRX y PanelVR (29_vr), que el código comprobaba con typeof, entran por getter.
  // [talón] apps/web/src/mundos/exterior/juegos.ts
  Componentes.registra(Mundos.manifiestoJuegos({
    D: D, Pausa: Pausa, ConfigPuro: ConfigPuro, Config: Config, Teclas: Teclas, Laminas: Laminas, Hud: Hud, Ventanas: Ventanas,
    get VRX() { return typeof VRX !== "undefined" ? VRX : undefined; }, get PanelVR() { return typeof PanelVR !== "undefined" ? PanelVR : undefined; }
  }));
  // [paso: 41_cae_la_cosecha] Componente «cae-la-cosecha» (ADR-0023, C9a): el primer juego casual (diseño propio del género «piezas que caen»). Solo se registra; nadie lo nombra. Se ofrece al anfitrión por el Bus y pide sus sonidos con «sonido:juego». Los trozos [puro:…] (las reglas, con semilla) y [dibujo:…] los evalúa en Node pruebas/guardianes/juego_cosecha.test.js.
  // ---------- «Cae la cosecha» (C9a, decisiones 125 y 136; doc/sistema/JUEGOS.md). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la explicación viven en
  // apps/web/src/mundos/exterior/cae-la-cosecha.ts, componente de los mundos ["exterior"] (es un juego del olivar, que se ofrece al anfitrión de juegos, también del exterior).
  // Aquí solo se cablea el Bus, con el que se retira del anfitrión al liberarse.
  // [talón] apps/web/src/mundos/exterior/cae-la-cosecha.ts
  Componentes.registra(Mundos.manifiestoCaeLaCosecha({ Bus: Bus }));
  // [paso: 42_personalizacion] Componente «personalizacion» (P7f, decisiones 91-96 y 99-102): nombrar, colgar una foto o un dibujo, verlo y denunciarlo en los olivos de las hazas. Solo se registra; nadie lo nombra. Sin servidor (sin D.base /teselas/… ni ?api=) no pide ni crea nada. Complementa la ficha común del olivo (Entidades.complementa), reduce la imagen en el aparato, pide el aviso con casilla y habla con /api/sesion, /api/hazas/{id}/olivos, /api/medios, /api/olivos, /api/personalizaciones/{id}/denuncias y /api/hazas/{id}/sugerencias. Publica las decoraciones de la lista (P7g D3) por el Bus («decoraciones:cambian»). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/personalizacion.test.js.
  // ---------- «personalización» (P7f; decisiones 91-96, 99-102; doc/sistema/VIDA.md y contratos/vida.md). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la
  // explicación viven en apps/web/src/mundos/exterior/personalizacion.ts, componente de los mundos ["exterior"] (vive de los olivos y las hazas del exterior) con un libera() que
  // cancela las peticiones en vuelo y suelta el recuadro, la lámina, los rótulos y window.__personaliza. Aquí solo se cablea lo del legado: VRX (29_vr), que el código
  // comprobaba con typeof, entra por getter.
  // [talón] apps/web/src/mundos/exterior/personalizacion.ts
  Componentes.registra(Mundos.manifiestoPersonalizacion({
    THREE: THREE, D: D, Bus: Bus, Laminas: Laminas, Entidades: Entidades, Usables: Usables, lienzo: lienzo, camera: camera, Estado: Estado, HazasPuro: HazasPuro, Hazas: Hazas,
    get VRX() { return typeof VRX !== "undefined" ? VRX : undefined; }
  }));
  // [paso: 43_agenda] Componente «agenda» (OF11d, ADR-0023; decisiones 145-148): la agenda de la finca dentro del mundo. Solo se registra; nadie lo nombra. Montado (solo con servidor): icono y ventana «Agenda» con los próximos eventos, plazas libres, tu estado (apuntados / en espera) y, solo si la api dice puede_inscribirse, apuntarse o borrarse con el número de personas (1-10); en VR, una fila en la pestaña Mundo del panel que lista los próximos y dice «Apúntate desde el móvil o el ordenador» (nadie se apunta desde las gafas). Todo lo de la api es dato: lista blanca y textContent / fillText. Publica window.__agenda (pruebas). El trozo [puro:…] lo evalúa en Node pruebas/guardianes/agenda_mundo.test.js.
  // ---------- la agenda dentro del mundo (OF11d; decisiones 145-148, doc/sistema/OFICINA.md §7). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la explicación
  // viven en apps/web/src/ui/agenda.ts, componente «agenda» de TODOS los mundos con un libera() que cancela las peticiones en vuelo y la espera de «Entrar en la visita»
  // (lo demás lo suelta, como antes, el núcleo con n.limpia). Aquí solo se cablea lo del legado: PanelVR (29_vr), que el código comprobaba con typeof, entra por getter.
  // [talón] apps/web/src/ui/agenda.ts
  Componentes.registra(Interfaz.manifiestoAgenda({
    D: D, Bus: Bus, ConfigPuro: ConfigPuro, Hud: Hud, Ventanas: Ventanas, get PanelVR() { return typeof PanelVR !== "undefined" ? PanelVR : undefined; }
  }));
  // [paso: 44_lindes] Componente «lindes-hazas» (A4, ADR-0023; decisiones 12, 13, 95 y 139): la linde de las hazas pegada al relieve, la tuya destacada y las ajenas discretas, con LineSegments2/LineMaterial de three (import() al montarse; 2 llamadas, 6 triángulos por tramo, tope de 8.000 tramos). Solo se registra; nadie lo nombra. También pinta las hazas en el minimapa (A4b, Minimapa.capa, la casilla «Linde» las apaga). ?lindes=0 lo apaga todo. Lee Hazas.lindes() al oír «hazas:cambia»; da su línea de ?debug por «depura:lineas». Publica window.__lindes (pruebas). Desde MU5-n (A3-3) es un talón de apps/web/src/mundos/exterior/lindes.ts (LindesPuro y el componente), que prueba Node en pruebas/guardianes/lindes.test.js y Vitest en lindes.test.ts.
  // ---------- la linde de las hazas en el mundo (A4, el «3c»; ADR-0014, decisiones 12, 13, 95 y 139): la de las tuyas destacada (ámbar, gruesa, opaca), las de los demás hogares
  // discretas (blanco roto, fina, medio transparente), pegadas al relieve. MU5-n (A3-3): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/lindes.ts
  // (LindesPuro y el componente «lindes-hazas» de los mundos ["exterior"], con su libera() y el minimapa). Aquí solo se cablea lo del legado. ?lindes=0 lo apaga todo.
  // Técnica (regla 12: la de three): LineSegments2 + LineSegmentsGeometry + LineMaterial de three/addons/lines, pedidos con import() al montarse; el import() se queda aquí
  // (en el talón) para que Vite trocee el paquete igual que antes, y entra en el componente como una función.
  // [talón] apps/web/src/mundos/exterior/lindes.ts
  Componentes.registra(Mundos.manifiestoLindes({
    THREE: THREE, Mundo: Mundo, suelo: suelo, Estado: Estado, gLinde: gLinde, Materiales: Materiales, Hazas: Hazas, Minimapa: Minimapa, Componentes: Componentes, ventana: window as any
  }, function () {
    return Promise.all([import("three/addons/lines/LineSegments2.js"), import("three/addons/lines/LineSegmentsGeometry.js"), import("three/addons/lines/LineMaterial.js")])
      .then(function (m) { return { LineSegments2: m[0].LineSegments2, LineSegmentsGeometry: m[1].LineSegmentsGeometry, LineMaterial: m[2].LineMaterial }; });
  }));
  // [paso: 44b_carteles] Componente «carteles-haza» (EV2-A6, ADR-0023; ADR-0014): como mucho 3 carteles de haza sobre la linde (los más cercanos, con histéresis) y un tablón en la entrada, con un pool de 3+1 mallas y lienzos de 512 × 320; solo nombre y datos medidos de la lista blanca de la ficha, cada uno con su procedencia; ?carteles=0 lo apaga. Desde MU5-n (A3-3) es un talón de apps/web/src/mundos/exterior/carteles.ts (CartelesPuro y el componente), que prueba Node en pruebas/guardianes/carteles.test.js y Vitest en carteles.test.ts.
  // ---------- EV2-A6: carteles de haza en la linde y tablón en la entrada (ADR-0014, decisiones 12, 188 y 202; doc/sistema/COMPONENTES.md).
  // MU5-n (A3-3): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/carteles.ts (CartelesPuro y el componente «carteles-haza» de los mundos ["exterior"], con su
  // libera() que suelta la geometría, los cuatro materiales y las cuatro texturas). Sobre la linde de las hazas que tienes cerca cuelga un cartel con el NOMBRE de la haza y solo
  // lo que decidió Antonio (lista blanca, cada dato con su procedencia); el tablón de la entrada lleva «Club La Linde». ?carteles=0 lo apaga. Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/carteles.ts
  Componentes.registra(Mundos.manifiestoCarteles({
    THREE: THREE, documento: document, ventana: window as any, scene: scene, camera: camera, VRX: VRX, texColor: texColor, gLinde: gLinde, suelo: suelo, Estado: Estado,
    Hazas: Hazas, D: D, cIn: cIn, EST: EST, bbchEn: bbchEn, hoyMadrid: hoyMadrid
  }));
  // [paso: 45_voz] Componente «voz-guiada» (F3d, ADR-0026; decisiones 157-162): la voz de las visitas guiadas, SOLO en una sala «guiada-<evento>» de la red (Voz.entra(evento) con el token de F3c, Voz.usa(clave) o ?guiada=<evento>; F3f: con ?presencia=red viaja la presencia y la voz usa su conexión, y se engancha sola a una sala de la red que entra en una guiada, «red:estado»). Consume la red y la presencia (Presencia.cabeza: de dónde sale cada voz). Pide las pistas de micrófono, cada una a un <audio> silenciado y de él a Web Audio (ganancia por distancia y PannerNode HRTF; la escucha, la cámara o la cabeza en VR); con tu micrófono abierto y sin auriculares, plano por los <audio> (cancelación de eco). Abre tu micrófono solo con permiso y tras un gesto (Voz.abre; lo dispara F3e). F3k-2: también la sala solo de audio de un corro de la visita libre («corro-<id>», Voz.entraCorro con el token de POST /api/presencia/corros/token, clave «corro» de la red) con su curva (sin suelo mínimo, fundido de 15 a 20 m en 1 s); Voz.silencia deja de pedir la pista de quien silencias (F3k-3). Emite «voz:habla» y «voz:estado»; escucha «audio:desbloquea», «depura:lineas» y «red:estado». Sin grabación. ?voz=0 lo apaga; ?voz=plano, sin espacializar. Publica window.__voz (pruebas). MU5-n (A3-6b): talón; el código vive en apps/web/src/red/voz/voz.ts (componente de todo mundo). Lo prueban voz.test.ts y en Node pruebas/guardianes/voz.test.js (VozPuro y creaVoz, de Mundos).
  // ---------- la voz de las visitas guiadas y de los corros (F3d, F3k-2; ADR-0026 y ADR-0032), componente «voz-guiada». MU5-n (A3-6b): migrado a TypeScript tal cual;
  // el código y la explicación entera viven en apps/web/src/red/voz/voz.ts, componente de TODO mundo (mundos: "todos") con un libera() que sale de su sala de voz,
  // cierra el micrófono, suelta cada voz (<audio>, fuente, ganancia y panner) y cierra el AudioContext. Aquí se cablea lo del legado: lo que otros módulos reescriben
  // (VRX, Aparato) o puede no existir (navigator, MediaStream, PannerNode) entra por getters; la cámara y la aritmética de three (Quaternion, Vector3), por valor.
  // [talón] apps/web/src/red/voz/voz.ts
  Componentes.registra(Mundos.manifiestoVoz({
    THREE: THREE, location: location, window: window, document: document, consola: console, fetch: function (u, o: any) { return fetch(u, o); }, camera: camera,
    get VRX() { return VRX; }, get Aparato() { return Aparato; }, get navigator() { return typeof navigator !== "undefined" ? navigator : undefined; },
    get MediaStream() { return MediaStream; }, get PannerNode() { return typeof PannerNode === "function" ? PannerNode : undefined; }
  }));
  // [paso: 46_guiada] Componente «visita-guiada» (F3f, absorbe OF12; ADR-0026, decisiones 155 y 157-162): la visita guiada en el mundo, solo en una sala «guiada-<evento>» de la red. Para todos, quién tiene la palabra y su cuenta atrás (atributo palabra_hasta de la api) y el cierre (tema «cierre», solo sin participante: cuenta atrás y vuelta sola a la visita libre). Con papel de guía u oficina, la ventana «Visita guiada» (preparar, manos en orden, dar la palabra, +1 min, cortar, silenciar a todos, sacar, cerrar con aviso; lo que no tiene vuelta, pulsando dos veces) y en VR una fila del panel con lo esencial. Todo por la api (F3c, F3f); textContent siempre. Consume la red, la presencia y la voz. Emite «guiada:palabra» y «guiada:cierre»; escucha «voz:estado» y «depura:lineas». ?guia=0 lo apaga. Publica window.__guiada (pruebas). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/guiada.test.js.
  // ---------- la visita guiada en el mundo (F3f; absorbe OF12; ADR-0026, decisiones 155 y 157-162). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la explicación
  // viven en apps/web/src/ui/guiada.ts, componente «visita-guiada» de TODOS los mundos con un libera() que, además de lo de siempre (salas, panel, lámina, tira y
  // window.__guiada), cancela las peticiones a la api en vuelo. Aquí solo se cablea lo del legado: VRX y PanelVR (29_vr), que el código comprobaba con typeof, entran por getter.
  // [talón] apps/web/src/ui/guiada.ts
  Componentes.registra(Interfaz.manifiestoGuiada({
    SalaPose: SalaPose, Laminas: Laminas, visor: visor, Ventanas: Ventanas, Hud: Hud,
    get VRX() { return typeof VRX !== "undefined" ? VRX : undefined; }, get PanelVR() { return typeof PanelVR !== "undefined" ? PanelVR : undefined; }
  }));
  // [paso: 46b_primera_vez]
  // ---------- la tarjeta del estreno del micro (F3l). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la explicación viven en apps/web/src/red/voz/primera-vez.ts
  // (lógica pura, sin DOM ni three: no es un componente, no hay nada que liberar). Aquí solo se cablea el nombre que usa 47_habla.js.
  // [talón] apps/web/src/red/voz/primera-vez.ts
  var PrimeraVezPuro = Mundos.PrimeraVezPuro;
  // [paso: 47_habla] Componente «habla-guiada» (F3e, ADR-0026; decisiones 157-162): la interacción de la voz en la visita guiada, solo dentro de una sala guiada y con papel. «Hablar» con botón (≥ 44 px; 56 en el navegador de Quest), tecla T y, en VR, el gatillo izquierdo (VRX.voz, que 29_vr.js lee cada fotograma), en dos modos según el ajuste «Hablar» de Configuración: pulsar para abrir y cerrar (por defecto) o mantener pulsado (familias; el guía siempre pulsa y abre su micro con el primer gesto, una vez). Sin la palabra, «Levantar la mano» / «Bajar la mano» por la api de F3c y «Estás 2.º en la cola» (la cola, de la api «Guiada» de 46). El micro siempre con icono y texto en una región aria-live; «Silenciarme» siempre a mano; el aviso de que con el micro abierto el sonido no es espacial y la casilla «Llevo auriculares» (Voz.auriculares). En VR, una lámina de 3 s al abrir o cerrar, una fila del panel («Ir a») y un pulso del mando. F3k-2: lo mismo dentro de un corro (papel «miembro»), con el micro que se cierra solo tras 60 s sin que se te oiga. Emite «habla:micro» y «habla:mano»; escucha «voz:estado», «guiada:palabra» y «depura:lineas». ?habla=0 lo apaga. Publica window.__habla (pruebas). Todo con textContent. MU5-n (A3-6b): talón; el componente vive en apps/web/src/mundos/comun/habla.ts (de todo mundo) y su lógica pura, con el aviso de voz, en apps/web/src/red/voz/habla.ts. Lo prueban habla.test.ts y en Node pruebas/guardianes/habla.test.js (HablaPuro y creaHabla, de Mundos).
  // ---------- hablar en la visita guiada y en un corro (F3e, F3j, F3l, F3k-2; ADR-0026 y ADR-0032), componente «habla-guiada». MU5-n (A3-6b): migrado a TypeScript tal
  // cual; el componente y la explicación entera viven en apps/web/src/mundos/comun/habla.ts (dibuja: la caja, el aviso de voz, las láminas y la fila del panel de VR) y
  // su lógica pura, con el texto del aviso de voz y su AVISO_VERSION, en apps/web/src/red/voz/habla.ts. De TODO mundo (mundos: "todos"), con un libera() que cierra el
  // aviso y la tarjeta, la lámina, suelta el gatillo de VR y quita la caja y el gancho. Aquí se cablea lo del legado: lo que otros módulos reescriben (VRX, Aparato,
  // PanelVR: A3-6c) o el código de siempre comprobaba con typeof (Ajustes, PrimeraVezPuro, Laminas, Teclas) entra por getters.
  // [talón] apps/web/src/mundos/comun/habla.ts
  Componentes.registra(Mundos.manifiestoHabla({
    location: location, window: window, document: document, fetch: function (u, o: any) { return fetch(u, o); }, D: D, ConfigPuro: ConfigPuro, visor: visor,
    get VRX() { return typeof VRX !== "undefined" ? VRX : undefined; }, get Aparato() { return Aparato; }, get PanelVR() { return typeof PanelVR !== "undefined" ? PanelVR : undefined; },
    get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; }, get PrimeraVezPuro() { return PrimeraVezPuro; },
    get Laminas() { return typeof Laminas !== "undefined" ? Laminas : undefined; }, get Teclas() { return typeof Teclas !== "undefined" ? Teclas : undefined; }
  }));
  // [paso: 47b_corro] Componente «corro-voz» (F3k-2 y F3k-3, ADR-0032; decisiones 205-212, provisionales): la voz por cercanía en la visita libre, en corros con aceptación. Solo se registra; nadie lo nombra. Sin servidor, sin LiveKit (503) o con el interruptor de la oficina apagado no crea nada. Con él: Configuración → Voz → «Voz por cercanía» (apagada por defecto; el aviso «cercania» v1 con la declaración de mayor de edad ANTES de activarla), invitar desde el avatar y desde Gente a menos de 8 m (Presencia.accionesPersona), la invitación con «Aceptar» / «Ahora no» (foco en «Ahora no»; en VR, una lámina), la lista del corro con quién habla (aria-live y un halo), silenciar, bloquear, avisar a la oficina y salir con las rutas de la api, el icono de corro con voz para quien no está (Entidades, tipo «corro») y las salidas solas (lejos, cambio de sala, vista aérea). La voz la pone 45_voz.js (Voz.entraCorro) y el micro 47_habla.js. Emite «corro:estado»; escucha «voz:habla», «voz:estado» y «depura:lineas». ?corro=0 lo apaga. Publica window.__corro (pruebas). Todo con textContent. MU5-n (A3-6b): talón; el componente vive en apps/web/src/mundos/comun/corro.ts (de todo mundo) y su lógica pura, con el aviso «cercania», en apps/web/src/red/voz/corro.ts. Lo prueban corro.test.ts y en Node pruebas/guardianes/corro.test.js (CorroPuro y creaCorro, de Mundos).
  // ---------- la voz por cercanía en la visita libre, en corros (F3k-2 y F3k-3; ADR-0032), componente «corro-voz». MU5-n (A3-6b): migrado a TypeScript tal cual; el
  // componente y la explicación entera viven en apps/web/src/mundos/comun/corro.ts (dibuja: la caja, los diálogos, las láminas, los halos y los iconos) y su lógica pura,
  // con el aviso «cercania» y su AVISO_VERSION, en apps/web/src/red/voz/corro.ts. De TODO mundo (mundos: "todos"), con un libera() que cierra el aviso, los diálogos,
  // la lámina, la invitación y la caja, quita sus enganches (panel de VR, ficha de una persona, Entidades, el tema «corro», la pestaña), suelta los halos y los iconos y
  // saca la voz del corro. Aquí se cablea lo del legado: lo que otros módulos reescriben (VRX, Aparato, PanelVR: A3-6c) o el código de siempre comprobaba con typeof
  // (Ajustes, Hud, Laminas, Entidades, TextDecoder) entra por getters.
  // [talón] apps/web/src/mundos/comun/corro.ts
  Componentes.registra(Mundos.manifiestoCorro({
    THREE: THREE, scene: scene, camera: camera, Materiales: Materiales, location: location, window: window, document: document, fetch: function (u, o: any) { return fetch(u, o); },
    D: D, ConfigPuro: ConfigPuro, LaminasPuro: LaminasPuro, visor: visor,
    get VRX() { return typeof VRX !== "undefined" ? VRX : undefined; }, get Aparato() { return Aparato; }, get PanelVR() { return typeof PanelVR !== "undefined" ? PanelVR : undefined; },
    get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; }, get Hud() { return typeof Hud !== "undefined" ? Hud : undefined; },
    get Laminas() { return typeof Laminas !== "undefined" ? Laminas : undefined; }, get Entidades() { return typeof Entidades !== "undefined" ? Entidades : undefined; },
    get TextDecoder() { return typeof TextDecoder !== "undefined" ? TextDecoder : undefined; }
  }));
  // [paso: 48_vista_familia] Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/vista-familia.ts: VistaFamiliaPuro y el componente «vista-familia» de los mundos ["exterior"] (U9; petición de Antonio, 2026-11-02), con su libera() (estilos, rótulo, modo forzado y la petición de la sesión en vuelo). Solo se registra; nadie lo nombra. Con rol de familia (GET /api/sesion → rol distinto de oficina y admin) o ?vista=familia oculta el selector de modo (queda Gemelo), «Guardados» y «Desfase» de Capas y de Mapa y rotula «Copas del LiDAR» como «Olivos»; con oficina, admin, sin sesión o ?vista=completa no toca nada. Es presentación, no seguridad. Los trozos [puro] y [motor] los evalúa en Node pruebas/guardianes/vista_familia.test.js (que lee el .ts como JavaScript, _fuente.js).
  // ---------- la vista simple para las familias (U9; petición de Antonio, 2026-11-02): oculta controles de «Capas y vista» y de «Mapa y parcelas» que a una familia no le dicen nada.
  // MU5-n (A3-7b1): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/vista-familia.ts (VistaFamiliaPuro y el componente «vista-familia» de los mundos
  // ["exterior"], con su libera()). Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/vista-familia.ts
  Componentes.registra(Mundos.manifiestoVistaFamilia({ D: D }));
  // [paso: 49_avisos_correo] Componente «avisos-correo» (OF11f; petición de Antonio, 2026-11-02): el interruptor «Avisarme por correo de los eventos» en Configuración (pestaña «Cuenta»). Solo se registra; nadie lo nombra. Con servidor y sesión pregunta GET /api/yo/avisos y, si responde, registra la casilla con Ajustes.registra; al cambiarla manda PUT /api/yo/avisos y, si falla, la devuelve a lo que había. Sin servidor, sin sesión o con error no se muestra. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/avisos_correo.test.js.
  // ---------- el interruptor «Avisarme por correo de los eventos» (OF11f). MU5-n (A3-7b2): migrado a TypeScript tal cual; el código y la explicación viven en
  // apps/web/src/ui/avisos-correo.ts, componente «avisos-correo» de TODOS los mundos con un libera() que quita la casilla de Configuración y cancela las peticiones en vuelo.
  // Aquí solo se cablea lo del legado: D, HazasPuro y, por getter, Ajustes (33, que el código comprobaba con typeof).
  // [talón] apps/web/src/ui/avisos-correo.ts
  Componentes.registra(Interfaz.manifiestoAvisosCorreo({ D: D, HazasPuro: HazasPuro, get Ajustes() { return typeof Ajustes !== "undefined" ? Ajustes : undefined; } }));
  // [paso: 50_decoraciones] Componente «decoraciones-olivo» (P7g D3, decisiones 175-179): la pieza de temporada colgada de los olivos cercanos al foco (flores, cinta, farolillo, cosecha, luces, lazo), ILUSTRATIVA, una InstancedMesh por pieza con mergeGeometries de three (import() al montarse; ≤ 6 llamadas y ≤ 64 piezas). Solo se registra; nadie lo nombra. Sin servidor no crea nada; no habla con la api: la lista le llega por el Bus («decoraciones:cambian», la pide con «decoraciones:pide»). Complementa la ficha del olivo con la fila «Decoración». Publica window.__decoraciones (pruebas). Desde MU5-n (A3-3) es un talón de apps/web/src/mundos/exterior/decoraciones.ts (DecoracionesPuro y el componente), que prueba Node en pruebas/guardianes/decoraciones.test.js y Vitest en decoraciones.test.ts.
  // ---------- las decoraciones de los olivos (P7g D3; decisiones 175-179; doc/sistema/DECORACIONES.md y contratos/decoraciones.md): la pieza del catálogo de
  // temporada que una familia ha colgado de un olivo de su haza (flores, cinta, farolillo, cosecha, luces o lazo), dibujada en su copa. Es ILUSTRATIVA (regla 5).
  // MU5-n (A3-3): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/decoraciones.ts (DecoracionesPuro y el componente «decoraciones-olivo» de los mundos ["exterior"],
  // con su libera() que suelta las InstancedMesh, las geometrías y los materiales y quita su fila de la ficha del olivo). ?decoraciones=0 (o genera_motor.mjs --sin 50_decoraciones.js)
  // lo quita. Sin servidor no crea nada. Aquí solo se cablea lo del legado; paseando (Paseo.E) entra como función.
  // El import() de mergeGeometries se queda aquí (en el talón) para que Vite trocee el paquete igual que antes, y entra en el componente como una función.
  // [talón] apps/web/src/mundos/exterior/decoraciones.ts
  Componentes.registra(Mundos.manifiestoDecoraciones({
    THREE: THREE, D: D, FACTOR_R8: FactorR8.E.r8, FACTOR_R8_GEN: FactorR8.E.gen, busqueda: typeof location !== "undefined" ? location.search : "", ConfigPuro: ConfigPuro, copas: copas, suelo: suelo, radioEn: radioEn,
    Generados: typeof Generados !== "undefined" ? Generados : null, Entidades: Entidades, Estaticos: Estaticos, scene: scene, camera: camera, Estado: Estado, objetivo: typeof objetivo !== "undefined" ? objetivo : null,
    paseando: function () { return typeof Paseo !== "undefined" && Paseo.E.paseando; }, VRX: typeof VRX !== "undefined" ? VRX : null, ventana: window as any, Componentes: Componentes
  }, function () { return import("three/addons/utils/BufferGeometryUtils.js"); }));
  // [paso: 51_fichas_mundo] Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/fichas-mundo.ts: FichasMundoPuro y el componente «fichas-mundo» de los mundos ["exterior"] (EV2-A1, ?ui=capas, apagado por defecto), con su libera() (presentador de «vr», tapa del panel, láminas colgadas y window.__fichasMundo). En VR, la ficha de un olivo o de una baliza colgada junto a lo que describe con Laminas (encima de la copa, girándose hacia quien mira, como mucho 3), en lugar de las láminas de 29_vr que siguen a la cabeza (presentador «vr» encadenado delante del de 29_vr y PanelVR.tapa). Los trozos [puro] y el resto los evalúa en Node pruebas/guardianes/fichas_mundo.test.js (que lee el .ts como JavaScript, _fuente.js).
  // ---------- EV2-A1: las fichas en el mundo (doc/sistema/VIABILIDAD-INTERACCION.md §A.5, paso 2), solo con ?ui=capas (apagado por defecto): en VR, la ficha de un olivo o de una
  // baliza colgada junto a lo que describe, con Laminas. MU5-n (A3-7b1): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/fichas-mundo.ts (FichasMundoPuro y el
  // componente «fichas-mundo» de los mundos ["exterior"], con su libera()). Aquí solo se cablea lo del legado; todo lo que usa se monta antes que este módulo.
  // [talón] apps/web/src/mundos/exterior/fichas-mundo.ts
  Componentes.registra(Mundos.manifiestoFichasMundo({ Laminas: Laminas, Entidades: Entidades, Usables: Usables, PanelVR: PanelVR, VRX: VRX, camera: camera }));
  // [paso: 52_aves_mes] Componente «aves-mes» (EV-1g «Biodiversidad B0»): ventana «Aves probables este mes» con lo que GBIF registra en 10 km (DEDUCIDO, nivel probable, con atribución y licencias CC0, CC BY y CC BY-SA). Además, la fila «Aves del mes» del panel de VR (pestaña Mundo: 3 especies y «y X más», con «deducido», nota, atribución y licencias; AvesMesPuro.filaVR). TALÓN (MU5-n, A3-5): el código vive en apps/web/src/mundos/exterior/aves-mes.ts (Mundos.manifiestoAvesMes). Solo se registra; nadie lo nombra. Sin D.base, sin fichero o sin aves de este mes no monta nada (ni fila). AvesMesPuro y el componente los evalúa en Node pruebas/guardianes/aves_mes.test.js.
  // ---------- las aves probables este mes (EV-1g «Biodiversidad B0»; componente «aves-mes»): una ventana con las especies de aves que GBIF registra este mes en 10 km alrededor de la
  // finca, y la fila «Aves del mes» del panel de VR. DEDUCIDO (regla 5): no es lo observado en la finca; con atribución y licencias CC0, CC BY y CC BY-SA.
  // MU5-n (A3-5): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/aves-mes.ts (AvesMesPuro y el componente), de los mundos ["exterior"], con un libera() que
  // corta la descarga, quita la ventana, el icono, la fila de VR y el observador. Aquí solo se cablea lo del legado. ?aves=0 lo apaga; ?aves=1 lo enciende.
  // [talón] apps/web/src/mundos/exterior/aves-mes.ts
  Componentes.registra(Mundos.manifiestoAvesMes({
    D: D, fetch: typeof fetch === "function" ? fetch : null, Ventanas: Ventanas, Hud: Hud, PanelVR: typeof PanelVR !== "undefined" ? PanelVR : undefined,
    document: document, window: window
  }));
  // [paso: 53_mundo_hoy] Talón (MU5-n, A3-7b1) de apps/web/src/mundos/exterior/mundo-hoy.ts: MundoHoyPuro y el componente «mundo-hoy» de los mundos ["exterior"] (EV-3a, contratos/mundo-hoy.md), con su libera() (reloj, petición en vuelo y tarjeta). Solo se registra; nadie lo nombra. Con D.base /teselas/… o ?api= pide GET /api/mundo/hoy (mismo origen) al montar y cada 10 min y pinta la tarjeta «Hoy en el campo» en Tiempo y estación → Ahora (textContent) y el primer aviso en el HUD; sin servidor no pide nada. Emite «mundo:hoy» (la línea del tablón de 44b_carteles.js y el trabajo de 54_trabajo_hoy.js). Los trozos [puro] y [motor] los evalúa en Node pruebas/guardianes/mundo_hoy.test.js (que lee el .ts como JavaScript, _fuente.js).
  // ---------- el mundo de hoy (EV-3a; contratos/mundo-hoy.md, v 1): la tarjeta «Hoy en el campo» en «Tiempo y estación → Ahora» y el primer aviso en el HUD, con lo que
  // el servidor lee de OlivarTrack y de Vigía. MU5-n (A3-7b1): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/mundo-hoy.ts (MundoHoyPuro y el
  // componente «mundo-hoy» de los mundos ["exterior"], con su libera()). Aquí solo se cablea lo del legado: el HUD (31) se pide por getter.
  // [talón] apps/web/src/mundos/exterior/mundo-hoy.ts
  Componentes.registra(Mundos.manifiestoMundoHoy({ D: D, $: $, get Hud() { return Hud; } }));
  // [paso: 54_trabajo_hoy] Componente «trabajo-hoy» (F4b, W1): un tractor ilustrativo en cada haza con tarea en curso (DEDUCIDO), APAGADO por defecto (?trabajo=1). TALÓN (MU5-n, A3-5): el código vive en apps/web/src/mundos/exterior/trabajo-hoy.ts (Mundos.manifiestoTrabajoHoy). Solo se registra; nadie lo nombra. No pide nada: escucha el evento mundo:hoy. Lo evalúa en Node pruebas/guardianes/trabajo_hoy.test.js (TrabajoHoyPuro y el motor, de Mundos).
  // ---------- trabajo en vivo, paso estático (F4b, tarea W1; componente «trabajo-hoy»): un tractor de juguete en la haza que OlivarTrack dice que tiene una tarea en curso.
  // DEDUCIDO (regla 5): solo se sabe «en esta parcela hay una tarea abierta»; NADA POR PERSONA; el tractor es ILUSTRATIVO. APAGADO POR DEFECTO (?trabajo=1 lo enciende).
  // MU5-n (A3-5): migrado a TypeScript; el código vive en apps/web/src/mundos/exterior/trabajo-hoy.ts, componente de los mundos ["exterior"] con un libera() que suelta la
  // malla, la geometría y el material, retira la entidad «trabajo» y la escucha de «mundo:hoy» (que emite 53_mundo_hoy.js). Aquí solo se cablea lo del legado.
  // [talón] apps/web/src/mundos/exterior/trabajo-hoy.ts
  Componentes.registra(Mundos.manifiestoTrabajoHoy({
    THREE: THREE, scene: scene, Entidades: Entidades, Materiales: Materiales, suelo: suelo, Estado: Estado, D: D
  }));
  // [paso: 90_final] Arranque y bucle: Mundo.arranca, Componentes.arranca y la lista de pasos del fotograma que recorre el Bucle del núcleo (apps/web/src/nucleo/bucle.ts: try/catch por fotograma, página oculta, reset del espacio XR, contexto perdido). Define el orden de las actualizaciones por fotograma: los módulos que aún no son componentes a mano y los componentes por fases (mundo, tarde, trasRender).
  function tamano() { if (renderer.xr.isPresenting) return; var w = visor!.clientWidth, h = visor!.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); }
  window.addEventListener("resize", tamano); tamano();
  Mundo.alCargar(function (t) { Arboles.tileCargada(t); });
  Mundo.arranca(function () { Arboles.inicia(); actualizaNubeTeselas(camera.position.x, camera.position.y, camera.position.z); Cola.vacia(10000); recoloreaSuelo(); Marcadores.ponListo(); aplica();
    Interiores.entraPorUrl(location.search); });   // MU2-6/MU2-8 y eje B: con el exterior ya cargado, a ?mundo=vacio|patios|fabrica (si no se puede, lo dice)
  var actualizaCarga = Mundos.creaCargaTeselas({ mundo: Mundo, camara: camera, objetivo: objetivo, paseando: function () { return Paseo.E.paseando; } });   // el paso «carga de teselas» del exterior
  // un fotograma: lo hace el bucle de la ventana o, en VR, el de las gafas (29_vr.js: vrActualiza). A1-14 (MUNDOS §9.4 fila 8): el bucle vive en apps/web/src/nucleo/bucle.ts (dt, pausa, reparto, ms del render,
  // ahorro de batería, «cuadro:fin»; L7-01, L7-02, L7-10). MU2-3: la lista se parte en dos: los pasos del EXTERIOR (src/mundos/exterior.ts) corren dentro de gm.actualiza y en el Bucle, los de todo mundo. bloque: el del reparto (Q0h); null = se mide dentro; caro: oculta, no corre.
  // MU2-6: las fases «mundo» y «tarde» de Componentes, las láminas y la Cola son de todo mundo y salen del exterior al Bucle, tras gm.actualiza; Escena3D.actualiza, del exterior, va en gm.antesDelRender (tras la Cola y antes del render, como siempre).
  // Lo único que cambia de orden: la fase «mundo» corría entre la nube y los árboles, y ahora corre tras los árboles y la carga de teselas (MUNDOS §3, «Cómo quedó (MU2-6)»).
  var bCamara = Reparto.reg("cámara/paseo/VR"), Bucle: Nucleo.Bucle, temporizador = function (f: () => void, ms: number) { var h = setTimeout(f, ms); return function () { clearTimeout(h); }; };   // la cámara se registra antes que los del exterior (el reparto lista por orden de registro); Bucle se crea más abajo
  var deTodoMundo = function (o: unknown) { return o === camera || o === vrRig || o === Paseo.E.persona || !!(o && (o as { userData?: { deTodoMundo?: boolean } }).userData?.deTodoMundo); };   // MU2-6: lo que congelar el exterior no oculta (quien mira y su rig de VR); ADR-0036: y lo marcado userData.deTodoMundo (los grupos de la presencia y de los VRM)
  var hudExterior = ["hudEstado", "mapita", "ndviHud", "ficha", "baliza"].map(function (id) { return $(id); }).filter(Boolean);   // MU2-6: el HUD del exterior (brújula y tiempo, mapa, NDVI, fichas)
  var poseDelPaseo = { lee: function () { return pp; }, pon: function (p: Nucleo.Pose2) { pp.x = p.x; pp.y = p.y; pp.ang = p.ang; } };   // MU2-6: la pose de quien mira (12_paseo: pp)
  // MU2-7: lo que el Ambiente del exterior lee del legado al aplicarse (el tema, la perilla xrnear y el deslizador #exag pueden haber cambiado); los valores, en src/mundos/exterior.ts
  var ambienteExt = { fondo: function () { return colorCss("--sky").getHex(); }, niebla: { cerca: FOG0, lejos: FOG1 }, luces: [hemi, sol], extension: EXT, nearVr: function () { return XrPerillas.efectivas.near; }, exag: function () { return Number($("exag").value) || 1; } };
  var exterior = Mundos.creaExterior({ suelo: suelo, ext: D.ext, copas: copas, recorre: function (p, dt, t) { Bucle.recorre(p, dt, t); }, cola: ColaExt, pose: poseDelPaseo, ambiente: ambienteExt,
    raices: function () { return scene.children.filter(function (o: unknown) { return !deTodoMundo(o); }); }, hud: function (): any { return hudExterior; }, pasos: [
      { bloque: Reparto.reg("entidades"), fn: function (dt) { Usables.actualiza(dt); } },   // la cercanía (02e_entidades.js): antes que las balizas, que la leen
      { bloque: Reparto.reg("tiempo"), fn: function (dt, t) { actualizaTiempo(dt, t); } }, { bloque: Reparto.reg("olivo (estación)"), fn: function (dt) { actualizaOlivo(dt); } },
      { bloque: Reparto.reg("vida (fauna y perros)"), fn: function (dt) { actualizaVida(dt); } }, { bloque: Reparto.reg("minimapa"), fn: function (dt) { actualizaMinimapa(dt); } },
      { bloque: Reparto.reg("paisaje"), fn: function (dt) { actualizaPaisaje(dt); } }, { bloque: Reparto.reg("balizas"), fn: function (dt) { actualizaBalizas(dt); } },
      { bloque: Reparto.reg("suelo"), fn: function (dt) { actualizaSuelo(dt); } }, { bloque: Reparto.reg("nube"), fn: function (dt) { actualizaNube(dt); } },
      { bloque: Reparto.reg("árboles (niveles)"), fn: function (dt) { Arboles.actualiza(dt); } },
      { bloque: Reparto.reg("carga de teselas"), caro: true, fn: actualizaCarga }
    ], antesDelRender: [{ bloque: Reparto.reg("Escena3D.actualiza"), caro: true, fn: function () { Escena3D.actualiza(); } }] });   // Escena3D: tras Cola.corre (su deuda es para el fotograma siguiente) y antes del render
  var escenaAmb = { scene: scene, camara: camera, renderer: renderer, estado: Estado, color: function (h: number) { return new THREE.Color(h); }, niebla: function (h: number, c: number, l: number) { return new THREE.Fog(h, c, l); } };   // MU2-7: dónde se aplica el Ambiente
  var luzDe = function (tipo: string, color: number, k: number, pos?: readonly number[]) { var l = tipo === "ambiental" ? new THREE.AmbientLight(color, k) : new THREE.DirectionalLight(color, k); if (pos) l.position.set(pos[0], pos[1], pos[2]); return l; };   // MU2-7: las luces de un interior, con THREE (src/ no lo importa)
  var gm =Nucleo.creaWorldManager({ fundido: Nucleo.creaFundidoPantalla({ documento: document, contenedor: visor as any, temporizador: temporizador, vr: { activa: function () { return VRX.on; }, cierra: vrCierra, abre: vrAbre } }), cola: Cola, temporizador: temporizador, ahora: function () { return performance.now(); }, consola: console,
    aplicaAmbiente: function (a) { Nucleo.aplicaAmbiente(a, escenaAmb); },   // MU2-7: el Ambiente del que entra (src/nucleo/ambiente.ts), a oscuras
    avisa: function (ev, d) { Bus.emite(ev, d); }, contexto: function (base) { base.limpia(function () { Componentes.liberaMundo(base.id); Materiales.libera(base.id); }); return base; } });   // avisa: «mundo:entra/sale» paran y retoman los componentes (MU2-5); al liberar un mundo, sus componentes y los materiales que pidió con Materiales.de(id) (MU5-0)
  gm.registra(function () { return Promise.resolve(exterior); }, "exterior");   // el gestor de mundos (MUNDOS §3): el exterior; fundido: en VR el velo de la cabeza, en pantalla uno de DOM
  gm.registra(function () { return Promise.resolve(Mundos.creaVacio({ pose: poseDelPaseo, luz: luzDe })); }, "vacio"); var Interiores = Mundos.cableaInteriores({ gm: gm, ids: ["patios", "fabrica"], D: D, THREE: THREE, scene: scene, renderer: renderer, Aparato: Aparato, VRX: VRX, vrAparece: vrAparece, pose: poseDelPaseo, Paseo: Paseo, TR: TR, Hud: function () { return Hud; }, modulo: function () { return import("./mundos/interior/index.ts"); }, cargaGltf: function () { return import("three/addons/loaders/GLTFLoader.js"); }, cargaMeshopt: function () { return import("three/addons/libs/meshopt_decoder.module.js"); }, cargaKtx2: function () { return import("three/addons/loaders/KTX2Loader.js"); }, ventana: window as any, consola: console, Componentes: Componentes, Vida: Vida, Llegada: Llegada, Minimapa: Minimapa, PanelVR: PanelVR, Laminas: Laminas, Materiales: Materiales, suelo: suelo, Estado: Estado });   // MU2-6: el interior de prueba, sin entrada para el usuario salvo ?mundo=vacio (MU2-8 lo mide). Eje B: los interiores de Hituelo, UN módulo (src/mundos/interior/, trozo perezoso; cableado en interior/cableado.ts) con sus assets fuera del repo en <D.base><id>/<quest|pantalla>/ (decisión 227); con la puerta del cortijo en el exterior (interior/porton.ts)
  Bucle = Nucleo.creaBucle({
    ahora: function () { return performance.now(); }, pideCuadro: function (fn) { requestAnimationFrame(fn); }, reparto: Reparto,
    enPausa: function () { return Pausa.activa() && !VRX.on; }, pausa: function (dt, t) { Componentes.actualiza("pausa", dt, t); depuraCuadro(t); },   // en pausa: ni cámara, ni módulos, ni Cola, ni render
    alFin: function (FIN) { Bus.emite("cuadro:fin", FIN); }, ahorro: function () { return Ajustes.lee("graficos.ahorro"); },   // FIN.r: ms de renderer.render() (F0, lo lee el medidor)
    xr: { activa: function () { return VRX.on; }, sesion: function () { return VRX.sesion; }, base: function () { return VRX.base; }, recoloca: vrRecoloca },
    aviso: function (s, ms) { if (Hud) Hud.aviso(s, ms); }, consola: console, documento: document, lienzo: renderer.domElement, temporizador: function (fn, ms) { return setTimeout(fn, ms); },
    pasos: [
      { bloque: bCamara, fn: function (dt, t) { if (VRX.on) vrActualiza(dt, t); else if (Paseo.E.paseando) { actualizaPaseo(dt); transEntrada(dt); } else { camara(); transSalida(dt); } } },
      { bloque: null, fn: gm.actualiza },   // el mundo activo (el exterior), con sus pasos medidos por dentro
      { bloque: null, fn: function (dt, t) { Componentes.actualiza("mundo", dt, t); Componentes.actualiza("tarde", dt, t); } }, { bloque: Reparto.reg("láminas"), fn: function (dt) { Laminas.revisa(dt); } },   // de todo mundo (MU2-6)
      { bloque: Reparto.reg("Cola"), caro: true, fn: function () { Cola.corre(Arboles.presupuesto()); } }, { bloque: null, fn: gm.antesDelRender },   // la Cola, de todos; lo último del mundo activo (el exterior: Escena3D)
      { render: true, fn: function () { renderer.render(scene, camera); } }, { bloque: null, fn: function (dt, t) { Componentes.actualiza("trasRender", dt, t); } },
      { bloque: Reparto.reg("depura/vrFin"), fn: function (dt, t) { depuraCuadro(t); if (VRX.on) vrFin(dt, performance.now() - t); } }
    ]
  });
  var cuadro = Bucle.cuadro, bucle = Bucle.bucle, reambienta = function () { gm.reaplicaAmbiente(); };   // MU2-7: al cambiar el tema, el Ambiente del activo otra vez (el fondo y la niebla de partida del exterior salen de --sky; antes, pintaFondo de 03_escena)
  new MutationObserver(reambienta).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", reambienta);
  [Mundo, SombreadoTiles, Ndvi, Arboles0, Follaje, Lejanos, Arboles].forEach(function (c) { Componentes.registra(c.componente); });   // MU5-n (A3-1a): los del exterior que el motor lee por su nombre desde que se monta (src/mundos/exterior/): se liberan con él
  Componentes.registra(Vida.componente);   // MU5-n (A3-5): la vida del olivar (el quad, el dron y las estelas; 16_vida.js) se libera con el exterior
  Componentes.registra(Paseo.componente!);   // MU5-n (A3-6c): el paseo (12_paseo.js), de todos los mundos; el legado lo usa por su nombre desde que se monta
  Componentes.registra(Vr.componente);   // MU5-n (A3-6c): la VR (29_vr.js), de todos los mundos: el legado la usa por su nombre desde que se monta; se libera con el último mundo
  window.__bucle = Bucle.estado; Componentes.arranca(); gm.arranca("exterior").then(function (r) { if (!r.ok) console.error("el exterior no ha arrancado", r); Render.arranca(renderer, bucle); });   // __bucle: fallos, salidas de VR, ocultación y contexto perdido (pruebas/prueba_vr.js y ?debug); Componentes tras montar todos los ficheros (URL > servidor > defecto de cada manifiesto); el primer fotograma, con el exterior ya entrado (arranca es asíncrona aunque no haya nada que esperar) y, con el renderizador nuevo, tras su init() (02h_render, F1)
}

arranca();

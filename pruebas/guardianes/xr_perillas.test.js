"use strict";
// Perillas de rendimiento VR por URL (Q0b, apps/web/src/nucleo/xr-perillas.ts; el talón es apps/web/motor/02f_xr_perillas.js; doc/sistema/VR.md#perillas-de-rendimiento-por-url).
// La función pura (XrPerillasPuro.lee/plan/linea/multiview…) y el estado con un renderer y una sesión de mentira pasaron a Vitest (A1-11): apps/web/src/nucleo/xr-perillas.test.ts.
// Aquí queda lo que cruza con el legado: el cableado por texto en 29_vr, 03_escena, 28_depura y 30_mide, y el banco de 29_vr con el estado y el VrPresupuesto de verdad.
// Nada de esto dice cómo rinde un casco real.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");
const Nucleo = require("./_nucleo");

function estado(busqueda) { return Nucleo.creaXrPerillas({ busqueda }); }
const F02G = lee("apps/web/motor/02g_vr_presupuesto.js");
const VrControlPuro = new Function("\"use strict\";\n" + F02G.slice(F02G.indexOf("// [puro:inicio]"), F02G.indexOf("// [puro:fin]")) + "\nreturn VrControlPuro;")();

test("cableado: 29_vr usa XrPerillas en un solo sitio, 03_escena el MSAA, y el informe y el panel dicen la línea", () => {
  const vr = lee("apps/web/motor/29_vr.js");
  assert.match(vr, /setFramebufferScaleFactor\(XrPerillas\.efectivas\.escala\)/); assert.match(vr, /XrPerillas\.antes\(renderer\)/); assert.match(vr, /XrPerillas\.despues\(ses\)/);
  assert.doesNotMatch(vr, /setFramebufferScaleFactor\(0\.9\)/, "el 0,9 ya no está repartido: vive en XrPerillasPuro.DEF");
  assert.match(vr, /XrPerillas\.estable\(\), XrPerillas\.fijo\(\), VrPresupuesto\.suelo\(XrPerillas\.gente\(\)\)\)/, "el controlador adaptativo no actúa con ?xrnivel=");
  assert.match(vr, /vrPerfil\(XrPerillas\.fijo\(\) \? XrPerillas\.efectivas\.nivel : 0\)/);
  assert.match(vr, /xr: \{ near: [^}]*fov: /, "window.__vrDebug() trae las perillas");
  assert.match(lee("apps/web/motor/03_escena.js"), /antialias: XrPerillas\.aa/);
  assert.match(lee("apps/web/motor/28_depura.js"), /XrPerillas\.linea\(\)/);
  const mide = lee("apps/web/motor/30_mide.js");
  assert.match(mide, /perillas: modoIni === "VR" \? XrPerillas\.linea\(\)/); assert.match(mide, /r\.perillas/);
  // las banderas xr* solo se leen en 02f
  const otros = require("fs").readdirSync(require("path").join(__dirname, "..", "..", "apps/web/motor")).filter(f => f.endsWith(".js") && f !== "02f_xr_perillas.js");
  for (const f of otros) assert.doesNotMatch(lee("apps/web/motor/" + f), /xr(fov|escala|hz|aa|nivel|near|js|mv)=/, f + " no debe leer las perillas por su cuenta");
});

// ---------- AG-2.3: near de 0,1 en VR y umbral de JS del controlador adaptativo
test("29_vr: near efectivo al entrar y restaurado al salir; el controlador baja con 8 ms y no con 6; con nivel fijo no actúa", () => {
  const vr = lee("apps/web/motor/29_vr.js");
  const a = vr.indexOf("function* vrNivelPasos"), b = vr.indexOf("function vrFin");   // Q0c-b: incluye el cambio por la Cola y la histéresis
  assert.ok(a > 0 && b > a);
  const ad = vr.slice(a, b);
  function banco(busqueda, umbralCfg) {
    const X = estado(busqueda); if (umbralCfg != null) X.configJs = umbralCfg;
    const niveles = [];
    const VRX = { emaDt: 13.9, emaJs: 6, tNivel: 0, nivel: 0, nBaj: 0, nAlt: 0 };
    // Q0c-b: el cambio de nivel va por la Cola (se anota el nivel pedido); aquí no se avanza el generador
    const VR_PERFILES = [0, 1, 2, 3], Cola = { cancela() {}, add(k, prio, gen) { niveles.push(VRX.nivel); } };
    // Q0c-c: el VrPresupuesto de verdad (02g), que da el nivel mínimo que pide la gente a la vista (0 sin gente)
    const VrPresupuesto = new Function("\"use strict\";\n" + F02G.slice(F02G.indexOf("// [puro:inicio]"), F02G.indexOf("// [puro:fin]")) + F02G.slice(F02G.indexOf("// [motor:inicio]"), F02G.indexOf("// [motor:fin]")) + "\nreturn VrPresupuesto;")();
    const f = new Function("VRX", "XrPerillas", "VR_PERFILES", "Cola", "VrControlPuro", "VrPresupuesto", "\"use strict\";\n" + ad + "\nreturn vrAdapta;")(VRX, X, VR_PERFILES, Cola, VrControlPuro, VrPresupuesto);
    return { f, VRX, niveles };
  }
  // 400 fotogramas de 72 Hz con el JS dado: el EMA llega y pasan los 4 s de guarda
  function corre(t, js, dtMs) { for (let i = 0; i < 400; i++) t.f(dtMs || 13.9, js, (dtMs || 13.9) / 1000); return t; }
  assert.ok(corre(banco(""), 9).VRX.nBaj >= 1, "9 ms de JS (>8): baja de nivel");
  assert.strictEqual(corre(banco(""), 6).VRX.nBaj, 0, "6 ms de JS (<8): no baja");
  assert.strictEqual(corre(banco(""), 7.9).VRX.nBaj, 0, "7,9 ms: no baja");
  assert.strictEqual(corre(banco(""), 10).VRX.nBaj >= 1, true);
  assert.strictEqual(corre(banco("?xrjs=6"), 7).VRX.nBaj >= 1, true, "?xrjs=6 baja con 7 ms");
  assert.strictEqual(corre(banco("", 12), 9).VRX.nBaj, 0, "la configuración (12) sustituye al 8");
  const fijo = corre(banco("?xrnivel=1"), 14); assert.strictEqual(fijo.VRX.nBaj, 0); assert.deepStrictEqual(fijo.niveles, [], "con ?xrnivel= fijo el controlador no actúa");
  // el reloj de JS es el de dentro del fotograma XR (no la pared entre fotogramas): 90_final lo pasa como performance.now() - t, con t = el inicio de cuadro()
  assert.match(lee("apps/web/motor/90_final.js"), /vrFin\(dt, performance\.now\(\) - t\)/);
  // near: entra con el efectivo (0,1 por defecto) y sale con el de antes
  assert.match(vr, /camera\.near = XrPerillas\.efectivas\.near; camera\.far = 6000;/);
  assert.match(vr, /VRX\.nearPrev = camera\.near; VRX\.farPrev = camera\.far;/);
  assert.match(vr, /camera\.near = VRX\.nearPrev; camera\.far = VRX\.farPrev; camera\.updateProjectionMatrix\(\)/);
  assert.doesNotMatch(vr, /camera\.near = 0\.3/);
  assert.match(vr, /Config\.param\("escalera\.vrJsMs", u\.baja\)/);   // Q0c-b: el código por defecto sale de la tabla por aparato
  assert.match(vr, /xr: \{ near: XrPerillas\.efectivas\.near, topeJs: XrPerillas\.js\(\)/);
});

// ---------- F2a (doc/sistema/MULTIVIEW.md): ?xrmv=0|1, el multiview de super-three, SOLO en la build de VR (defecto 1); en la de pantalla no existe
test("cableado F2a: 03_escena pide multiviewStereo solo si XrPerillas.multiview(Render.build) lo activa; 29_vr pide «layers» solo entonces y apunta si está en uso; la sonda lo dice", () => {
  const e = lee("apps/web/motor/03_escena.js");
  assert.match(e, /MV = XrPerillas\.multiview\(Render\.build\)/);
  assert.match(e, /if \(MV\.activo\) opcionesRd\.multiviewStereo = true;/);
  assert.match(e, /var opcionesRd = \{ canvas: lienzo, antialias: XrPerillas\.aa \}/, "en pantalla, el renderer con las MISMAS opciones de siempre");
  assert.match(e, /new THREE\.WebGLRenderer\(opcionesRd\)/);
  assert.strictEqual((e.match(/new THREE\.WebGLRenderer\(/g) || []).length, 1, "un solo renderer");
  const vr = lee("apps/web/motor/29_vr.js");
  assert.match(vr, /\["local-floor", "bounded-floor", "hand-tracking"\]\.concat\(XrPerillas\.mv && XrPerillas\.mv\.activo \? \["layers"\] : \[\]\)/);
  assert.ok(vr.indexOf("XrPerillas.mvEnUso(renderer)") > vr.indexOf("await renderer.xr.setSession(ses)"), "en uso se mira con la sesión ya puesta");
  assert.match(vr, /mv: XrPerillas\.mv \?/, "window.__vrDebug().xr.mv");
  const mide = lee("apps/web/motor/30_mide.js");
  assert.match(mide, /"build vr · pedido "/); assert.match(mide, /en uso " \+ \(renderer\.xr && renderer\.xr\.isMultiview/);
});

test("el panel: la casilla «vr.multiview» existe en el esquema y solo se pinta en la build de VR; el talón de 02f presta el almacén y el núcleo lee el guardado una vez con try/catch", () => {
  const aju = lee("apps/web/motor/33_ajustes.js");
  assert.match(aju, /"vr\.multiview": bool\(true\)/); assert.match(aju, /k: "vr\.multiview"[^\n]*soloBuild: "vr"/); assert.match(aju, /c\.soloBuild && \(typeof Render === "undefined" \|\| Render\.build !== c\.soloBuild\)\) return/);
  assert.match(lee("apps/web/motor/02f_xr_perillas.js"), /almacen: function \(\) \{ return window\.localStorage; \}/);
  assert.match(lee("apps/web/src/nucleo/xr-perillas.ts"), /getItem\("gemelo\.ajustes\.vr\.multiview"\)/);
});

test("02f_xr_perillas.js es un talón del núcleo y le presta el almacén y los ignorados de 02m", () => {
  assert.match(lee("apps/web/motor/02f_xr_perillas.js"), /var XrPerillas = Nucleo\.creaXrPerillas\(\{/);
  assert.match(lee("apps/web/motor/02f_xr_perillas.js"), /ignoradosOlivos: function \(\) \{ return typeof TopeOlivos !== "undefined" \? TopeOlivos\.ignorados : \[\]; \}/);
});

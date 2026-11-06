"use strict";
// Q0c-b (apps/web/src/nucleo/presupuesto.ts desde A1-12: VrControlPuro, con el talón 02g_vr_presupuesto.js; 29_vr.js: vrAdapta, vrNivelPorCola,
// vrPrecompila; 02f: ?xrjssube y ?xrestable; doc/sistema/VR.md#controlador-de-nivel-vr-q0c-b). Las pruebas puras del controlador (la histéresis con
// la serie del Quest, la subida, el margen, el nivel fijo, la tabla por sí sola, escalonPorPasos = ponEscalon) están en Vitest, en
// apps/web/src/nucleo/presupuesto.test.ts. Aquí, en Node y sin navegador ni casco, queda lo que cruza con el legado:
//   · la tabla por aparato frente a los modelos de 01a_aparato y los límites de las perillas de 02f, y cómo la usa 29_vr;
//   · las perillas ?xrjs / ?xrjssube / ?xrestable;
//   · el cambio de nivel va por la Cola, repartido en pasos (nada se aplica hasta que la Cola avanza);
//   · la precompilación se llama una vez al entrar en VR, con compileAsync (compile si no está) y sin romper si falla.
// Lo que NO dice: que los umbrales sean los buenos para un Quest, ni cuánto baja el peor fotograma. No probado en Quest.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const { lee, RAIZ } = require("./_util");

const VR = lee("apps/web/motor/29_vr.js");
function trozo(f, ini, fin) { const i = f.indexOf(ini), j = f.indexOf(fin); assert.ok(i >= 0 && j > i, "falta " + ini + " … " + fin); return f.slice(i, j); }
const Nucleo = require("./_nucleo");   // 02f_xr_perillas.js (A1-11) y 02g_vr_presupuesto.js (A1-12) son talones del núcleo
const C = Nucleo.VrControlPuro, PP = Nucleo.VrPresupuestoPuro;
const XP = Nucleo.XrPerillasPuro;
const xr = busqueda => Nucleo.creaXrPerillas({ busqueda });

test("tabla por aparato: una fila por modelo de 01a_aparato, dentro de los límites de las perillas de 02f, y 29_vr la usa", () => {
  assert.deepStrictEqual(Object.keys(C.APARATOS).sort(), ["defecto", "quest-2", "quest-3", "quest-3s", "quest-pro"]);
  // los modelos son los que clasifica 01a_aparato (la tabla y el detector hablan igual)
  const A = lee("apps/web/motor/01a_aparato.js"), nombres = new Function(trozo(A, "var NOMBRES =", "var EXTENSIONES").replace("var NOMBRES =", "return ") .replace(/;\s*$/, ";"))();
  assert.deepStrictEqual(Object.keys(nombres).sort(), Object.keys(C.APARATOS).filter(k => k !== "defecto").sort());
  // las filas [SUPUESTO], la fila por defecto y la copia: en Vitest (presupuesto.test.ts)
  // todas las filas respetan el margen entre sube y baja y caen dentro de los límites de las perillas
  for (const [k, f] of Object.entries(C.APARATOS)) {
    assert.ok(f.baja - f.sube >= C.DEF.margen, k + ": histéresis");
    assert.ok(f.baja >= XP.LIM.js[0] && f.baja <= XP.LIM.js[1] && f.sube >= XP.LIMC.sube[0] && f.sube <= XP.LIMC.sube[1], k + ": dentro de los límites de las perillas");
  }
  // los defectos de 02f y de la tabla coinciden en bajar y en los segundos; el de subir de 02f (5 ms) es el de reserva hasta que llega la tabla
  // (29_vr la deja en XrPerillas.tablaSube con la configuración) y desde A1-12 es más prudente que el de la tabla (baja − 2 = 6 ms): nunca sube antes
  assert.deepStrictEqual([XP.DEF.js, XP.DEFC.estable], [C.APARATOS.defecto.baja, C.DEF.estable]);
  assert.ok(XP.DEFC.sube <= C.APARATOS.defecto.sube, "el de reserva de 02f no sube antes que la tabla");
  // 29_vr: el modelo sale de Aparato y la tabla manda como valor de código (la URL y la configuración, encima)
  assert.match(VR, /VrControlPuro\.umbrales\(Aparato\.modelo\(\)\)/);
  assert.match(VR, /Config\.param\("escalera\.vrJsMs", u\.baja\)/);
});

test("perillas ?xrjssube y ?xrestable: valor, recorte con motivo, no numérico ignorado; la URL manda sobre la tabla", () => {
  const A = xr("");
  assert.deepStrictEqual([A.jsSube(), A.estable(), A.js()], [6, 10, 8]);
  A.tablaSube = 4; assert.strictEqual(A.jsSube(), 4, "la tabla por aparato sustituye al defecto");
  const B = xr("?xrjssube=3&xrestable=20&xrjs=6"); B.tablaSube = 4;
  assert.deepStrictEqual([B.jsSube(), B.estable(), B.js()], [3, 20, 6], "la URL manda");
  const L = XP.leeControl("?xrjssube=0,5&xrestable=500"); assert.deepStrictEqual([L.sube, L.estable], [2, 120]);
  assert.deepStrictEqual(L.ignorados.map(i => i.param), ["xrjssube", "xrestable"]); assert.match(L.ignorados[0].motivo, /recortado a 2/);
  const N = XP.leeControl("?xrjssube=poco&xrestable="); assert.deepStrictEqual([N.sube, N.estable], [null, null]);
  assert.deepStrictEqual(N.ignorados.map(i => i.motivo), ["no es un número", "no es un número"]);
  assert.deepStrictEqual(XP.leeControl(""), { sube: null, estable: null, gente: null, ignorados: [] });
  assert.match(VR, /subeJs: XrPerillas\.jsSube\(\), estableS: XrPerillas\.estable\(\)/, "__vrDebug().xr lo enseña");
});

test("cambio de nivel por la Cola: el nivel lógico cambia ya y lo demás en pasos con yield (no de golpe)", () => {
  // 29_vr: vrNivelPasos (generador) y vrNivelPorCola, con dobles de lo que tocan
  const src = trozo(VR, "function* vrNivelPasos", "  function vrAdapta");
  const reg = [], trabajos = [];
  const Cola = { cancela: k => reg.push("cancela " + k), add: (k, prio, gen) => { reg.push("add " + k + " " + prio); trabajos.push(gen); } };
  const VRX = { nivel: 0 }, VRP = { hierba: 32 }, UN = { uBumpK: { value: 1 } };
  const VR_PERFILES = [{ h: 32, b: 1 }, { h: 20, b: 0 }, { h: 0, b: 0 }, { h: 0, b: 0 }];
  const pasos = [], Arboles = { perfil: p => pasos.push("arboles") }, Escena3D = { perfil: p => pasos.push("escena3d") };
  const PM = Nucleo.creaVrPresupuesto();
  const VrPresupuesto = { escalonPorPasos: n => { pasos.push("inicia escalón"); return PM.escalonPorPasos(n); } };
  const f = new Function("Cola", "VRX", "VRP", "UN", "VR_PERFILES", "Arboles", "Escena3D", "VrPresupuesto", "\"use strict\";\n" + src + "\nreturn vrNivelPorCola;")(Cola, VRX, VRP, UN, VR_PERFILES, Arboles, Escena3D, VrPresupuesto);
  f(2);
  assert.strictEqual(VRX.nivel, 2, "el nivel lógico cambia en el acto (el controlador ya lo ve)");
  assert.deepStrictEqual(reg, ["cancela vnivel", "add vnivel 5"], "un solo trabajo en la Cola, y el anterior se cancela");
  assert.deepStrictEqual(pasos, [], "nada se aplica hasta que la Cola avanza");
  assert.strictEqual(UN.uBumpK.value, 1);
  const gen = trabajos[0]; let n = 0, r;
  while (!(r = gen.next()).done) { n++; if (n === 1) { assert.strictEqual(UN.uBumpK.value, 0, "paso 1: hierba y relieve"); assert.deepStrictEqual(pasos, []); } if (n === 2) assert.deepStrictEqual(pasos, ["arboles"]); if (n === 3) assert.deepStrictEqual(pasos, ["arboles", "escena3d", "inicia escalón"].slice(0, 2)); }
  assert.ok(n >= 4 + PP.ORDEN.length - 1, "al menos 3 pasos propios y uno por fuente de 02g: " + n);
  assert.deepStrictEqual(pasos, ["arboles", "escena3d", "inicia escalón"]);
  assert.deepStrictEqual(PM.estado().reparto, PP.reparto(2), "al acabar, el escalón de 02g es el pedido");
  // f(9) y f(-1) se recortan
  f(9); assert.strictEqual(VRX.nivel, 3); f(-1); assert.strictEqual(VRX.nivel, 0);
  // salir de VR cancela lo pendiente; vrPerfil (la entrada) también
  assert.match(VR, /vrSuelta\(\); Cola\.cancela\("vnivel"\);/);
  assert.match(VR, /VRX\.nivel = n; Cola\.cancela\("vnivel"\);/);
});

test("precompilación: una vez al entrar en VR, con compileAsync (compile si no está) y sin romper si falla", async () => {
  const src = trozo(VR, "function vrPrecompila", "  function vrFin");
  function monta(renderer) { const VRX = { compila: null }, scene = {}, camera = {}; const f = new Function("VRX", "renderer", "scene", "camera", "performance", "\"use strict\";\n" + src + "\nreturn vrPrecompila;")(VRX, renderer, scene, camera, { now: () => 1 }); return { f, VRX, scene, camera }; }
  // compileAsync: una llamada con (scene, camera)
  const llamadas = []; let ok;
  const A = monta({ compileAsync: (s, c) => { llamadas.push([s, c]); return new Promise(r => { ok = r; }); }, compile() { throw new Error("no debe usarse"); } });
  A.f(); assert.strictEqual(llamadas.length, 1); assert.strictEqual(llamadas[0][0], A.scene); assert.strictEqual(llamadas[0][1], A.camera);
  assert.strictEqual(A.VRX.compila.via, "compileAsync"); assert.strictEqual(A.VRX.compila.ok, null, "aún pendiente"); ok(); await Promise.resolve(); await Promise.resolve();
  assert.strictEqual(A.VRX.compila.ok, true);
  // sin compileAsync: compile síncrono
  let n = 0; const B = monta({ compile: () => { n++; } }); B.f(); assert.strictEqual(n, 1); assert.deepStrictEqual([B.VRX.compila.via, B.VRX.compila.ok], ["compile", true]);
  // si falla (lanza o rechaza) no rompe nada
  const Cc = monta({ compileAsync: () => { throw new Error("sin contexto"); } }); assert.doesNotThrow(() => Cc.f()); assert.strictEqual(Cc.VRX.compila.ok, false);
  const D = monta({ compileAsync: () => Promise.reject(new Error("x")) }); D.f(); await new Promise(r => setImmediate(r)); assert.strictEqual(D.VRX.compila.ok, false);
  const E = monta({}); assert.doesNotThrow(() => E.f()); assert.strictEqual(E.VRX.compila.ok, null, "ni compileAsync ni compile: no hace nada");
  // cableado: UNA llamada, al final de entraVR (con el rig, el panel y la sesión puestos); salir no precompila
  assert.strictEqual((VR.match(/vrPrecompila\(\);/g) || []).length, 1, "una sola llamada en 29_vr");
  assert.match(VR, /vrEstado\("sesión VR en marcha"\); vrPrecompila\(\); Bus\.emite\("vr:entra"\)/);
  assert.ok(VR.indexOf("vrPrecompila();") > VR.indexOf("scene.add(panel.m)"), "tras montar el rig y el panel");
  assert.ok(VR.indexOf("vrPrecompila();") > VR.indexOf("await renderer.xr.setSession(ses)"), "con la sesión ya puesta");
  // las dos builds de three tienen la API (three 0.186.1 en pantalla, super-three 0.185.0 en la de VR)
  for (const paq of ["three", "super-three"]) {
    const f = path.join(RAIZ, "apps/web/node_modules", paq, "src/renderers/WebGLRenderer.js");
    if (!fs.existsSync(f)) continue;   // sin npm ci en apps/web no hay nada que mirar
    const t = fs.readFileSync(f, "utf8");
    assert.match(t, /this\.compileAsync = function/, paq + " tiene compileAsync"); assert.match(t, /this\.compile = function/, paq + " tiene compile");
  }
});

test("A1-12 (L7-03, L1-03): 29_vr reinicia el controlador al entrar en VR y 07b_arboles, en VR, ajusta la escala de los olivos con VrControlPuro", () => {
  assert.match(VR, /vrPerfil\(XrPerillas\.fijo\(\) \? XrPerillas\.efectivas\.nivel : 0\); VrControlPuro\.reinicia\(VRX\);/, "al entrar: medias, periodo, perdidos, buenos y castigo de cero");
  assert.doesNotMatch(VR, /VRX\.emaDt = 13\.9; VRX\.emaJs = 6;/, "el reinicio a mano de antes ya no está");
  const A = require("./_fuente").fuenteMotor("07b_arboles.js"), aj = trozo(A, "function ajustaEscala()", "// por encima de 1,6");
  assert.match(aj, /if \(vrP\) \{ esc = VrControlPuro\.escalaVr\(esc, VrControlPuro\.holgura\(VRX, XrPerillas\.js\(\), XrPerillas\.jsSube\(\)\), InfoDibujo\.triangulos\(renderer\), vrP\.tri\); return; \}/,
    "en VR la escala no usa emaDt < 16 ms: usa la holgura del controlador y los triángulos del perfil");
  assert.ok(aj.indexOf("if (vrP)") > aj.indexOf("if (fq != null)"), "la calidad fijada en Ajustes sigue mandando también en VR");
  assert.strictEqual(C.holgura({ emaDt: 13.9, emaJs: 7, tNivel: 0, tEstable: 0 }, 8, 6), 0);
  assert.strictEqual(C.escalaVr(2.5, 0, 0, 380000), 1, "en VR, el techo es el perfil (1)");
});

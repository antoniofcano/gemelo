"use strict";
// Q0c-b (apps/web/motor/02g_vr_presupuesto.js: VrControlPuro; 29_vr.js: vrAdapta, vrNivelPorCola, vrPrecompila; 02f: ?xrjssube y ?xrestable;
// doc/sistema/VR.md#controlador-de-nivel-vr-q0c-b). En Node, sin navegador ni casco:
//   · histéresis: una serie sintética de ms de JS (p95 de 10-12 ms, como la del Quest 3 en MEDIDAS.md) que con la regla de antes oscilaba y ahora no;
//   · la subida no llega antes de 10 s estables, y un pico reinicia la cuenta;
//   · la tabla por aparato (Aparato.modelo) y las perillas ?xrjs / ?xrjssube / ?xrestable;
//   · el cambio de nivel va por la Cola, repartido en pasos (nada se aplica hasta que la Cola avanza);
//   · la precompilación se llama una vez al entrar en VR, con compileAsync (compile si no está) y sin romper si falla.
// Lo que NO dice: que los umbrales sean los buenos para un Quest, ni cuánto baja el peor fotograma. No probado en Quest.
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const { lee, RAIZ } = require("./_util");

const F02G = lee("apps/web/motor/02g_vr_presupuesto.js"), F02F = lee("apps/web/motor/02f_xr_perillas.js"), VR = lee("apps/web/motor/29_vr.js");
function trozo(f, ini, fin) { const i = f.indexOf(ini), j = f.indexOf(fin); assert.ok(i >= 0 && j > i, "falta " + ini + " … " + fin); return f.slice(i, j); }
const PURO = trozo(F02G, "// [puro:inicio]", "// [puro:fin]"), MOTOR = trozo(F02G, "// [motor:inicio]", "// [motor:fin]");
const C = new Function("\"use strict\";\n" + PURO + "\nreturn VrControlPuro;")();
const PP = new Function("\"use strict\";\n" + PURO + "\nreturn VrPresupuestoPuro;")();
const P02F = trozo(F02F, "// [puro:inicio]", "// [puro:fin]"), M02F = trozo(F02F, "// [motor:inicio]", "// [motor:fin]");
const XP = new Function("\"use strict\";\n" + P02F + "\nreturn XrPerillasPuro;")();
const xr = busqueda => new Function("location", "\"use strict\";\n" + P02F + M02F + "\nreturn XrPerillas;")({ search: busqueda });

const FPS = 72, DT = 1 / FPS;
const estadoNuevo = () => ({ emaDt: 13.9, emaJs: 6, tNivel: 0, tEstable: 0 });
// avanza el controlador `seg` segundos con js(nivel, t) y devuelve los cambios [t, de, a]
function corre(opts) {
  const e = estadoNuevo(), u = Object.assign({ baja: 8, sube: 5, estable: 10, maxNivel: 3, nivel: 0, seg: 300, dtMs: 13.9, fijo: false }, opts), cambios = [];
  let nivel = u.nivel;
  for (let i = 0, n = Math.round(u.seg * FPS); i < n; i++) {
    const t = i * DT, d = C.decide(e, u.dtMs, u.js(nivel, t), DT, nivel, u.maxNivel, u.baja, u.sube, u.estable, u.fijo);
    if (d) { cambios.push([t, nivel, nivel + d]); nivel += d; }
  }
  return { cambios, nivel, e };
}
// la regla de ANTES (AG-2.3), para contrastar: baja con >8 (guarda de 4 s), sube con <7 tras 25 s
function reglaVieja(js, seg) {
  const e = { emaDt: 13.9, emaJs: 6, tNivel: 0 }; let nivel = 0, cambios = 0;
  for (let i = 0; i < seg * FPS; i++) {
    e.emaDt += (13.9 - e.emaDt) * 0.05; e.emaJs += (js(nivel, i * DT) - e.emaJs) * 0.05; e.tNivel += DT;
    if (e.tNivel < 4) continue;
    if ((e.emaJs > 8 || e.emaDt > 15.2) && nivel < 3) { e.tNivel = 0; nivel++; cambios++; }
    else if (e.emaJs < 7 && e.emaDt < 14.4 && nivel > 0 && e.tNivel > 25) { e.tNivel = 0; nivel--; cambios++; }
  }
  return cambios;
}
// JS por nivel como en el Quest 3 de MEDIDAS.md (p95 10-12 ms en el nivel 0; cada nivel quita ~1,5 ms) con un temblor determinista de ±0,6 ms
const JS_QUEST = (nivel, t) => 11 - 1.5 * nivel + 0.6 * Math.sin(t * 5.3) + 0.3 * Math.sin(t * 1.7);

test("histéresis: la serie que oscilaba con la regla de antes ya no oscila (sin subir y bajar de nuevo)", () => {
  const vieja = reglaVieja(JS_QUEST, 300);
  assert.ok(vieja >= 5, "la regla vieja sí oscila en esta serie: " + vieja + " cambios en 300 s");
  const r = corre({ js: JS_QUEST });
  assert.deepStrictEqual(r.cambios.map(c => c[2]), [1, 2, 3], "baja 0→1→2→3 y se queda");
  assert.strictEqual(r.nivel, 3);
  assert.ok(r.cambios.every((c, i, a) => i === 0 || c[0] - a[i - 1][0] >= 4 - 1e-9), "entre dos cambios, la guarda de 4 s");
  // con la subida a 7 ms (la de antes), la misma serie volvería a subir: es la histéresis la que lo impide
  const pegado = corre({ js: JS_QUEST, sube: 7, estable: 1 });
  assert.ok(pegado.cambios.some(c => c[2] < c[1]), "sin histéresis (sube 7 ms, 1 s) sí sube después de bajar");
});

test("subida: no llega antes de 10 s estables; un pico reinicia la cuenta; con JS entre 5 y 8 ms no sube ni baja", () => {
  const holgado = (nivel, t) => 3;
  const r = corre({ js: holgado, nivel: 2, seg: 60 });
  assert.ok(r.cambios.length >= 1, "con 3 ms de JS acaba subiendo");
  const t0 = r.cambios[0][0];
  assert.strictEqual(r.cambios[0][2], 1);
  // la media (EMA) parte de 6 ms y necesita ~1 s para bajar de 5; la cuenta de 10 s empieza ahí
  assert.ok(t0 >= 10, "la primera subida no llega antes de 10 s: " + t0.toFixed(2));
  assert.ok(t0 < 13, "y tampoco se hace esperar mucho más: " + t0.toFixed(2));
  assert.ok(r.cambios[1] && r.cambios[1][0] - t0 >= 10 - 1e-9, "tras subir, otros 10 s hasta la siguiente");
  // un pico de 1 s a 9 ms cada 8 s: nunca hay 10 s seguidos por debajo de 5 ms, así que no sube
  const conPico = (nivel, t) => (t % 8) < 1 ? 14 : 3;
  const p = corre({ js: conPico, nivel: 1, seg: 120, baja: 12 });
  assert.ok(!p.cambios.some(c => c[2] < c[1]), "los picos reinician la cuenta: no sube");
  // zona muerta: 6,5 ms ni sube (>5) ni baja (<8)
  assert.strictEqual(corre({ js: () => 6.5, nivel: 2, seg: 120 }).cambios.length, 0, "entre 5 y 8 ms se queda");
  // el fotograma largo también baja (15,2 ms) y también impide subir
  assert.strictEqual(corre({ js: () => 3, dtMs: 16, nivel: 0, seg: 30 }).cambios[0][2], 1, "dt > 15,2 ms baja aunque el JS vaya holgado");
  assert.strictEqual(corre({ js: () => 3, dtMs: 14.8, nivel: 2, seg: 60 }).cambios.length, 0, "dt de 14,8 ms (>14,4): no sube");
});

test("el umbral de subir nunca queda a menos de 1 ms del de bajar, y con nivel fijo el controlador no actúa", () => {
  const r = corre({ js: () => 6.5, baja: 5, sube: 9, nivel: 2, seg: 60, maxNivel: 2 });   // sube efectivo = 4
  assert.strictEqual(r.cambios.length, 0, "con baja 5 y sube pedido 9, el efectivo es 4: 6,5 ms ni sube ni (en el último nivel) baja");
  assert.strictEqual(corre({ js: () => 14, fijo: true, seg: 30 }).cambios.length, 0);
  assert.strictEqual(corre({ js: () => 14, nivel: 3, seg: 30 }).cambios.length, 0, "en el último nivel no baja más");
});

test("tabla por aparato: cada casco con su fila, [SUPUESTO] donde no hay medida, y sin modelo el defecto", () => {
  assert.deepStrictEqual(Object.keys(C.APARATOS).sort(), ["defecto", "quest-2", "quest-3", "quest-3s", "quest-pro"]);
  // los modelos son los que clasifica 01a_aparato (la tabla y el detector hablan igual)
  const A = lee("apps/web/motor/01a_aparato.js"), nombres = new Function(trozo(A, "var NOMBRES =", "var EXTENSIONES").replace("var NOMBRES =", "return ") .replace(/;\s*$/, ";"))();
  assert.deepStrictEqual(Object.keys(nombres).sort(), Object.keys(C.APARATOS).filter(k => k !== "defecto").sort());
  for (const m of ["quest-2", "quest-3s", "quest-pro"]) { assert.strictEqual(C.APARATOS[m].supuesto, true, m); assert.match(C.APARATOS[m].base, /\[SUPUESTO\]/, m); }
  assert.strictEqual(C.APARATOS["quest-3"].supuesto, false); assert.match(C.APARATOS["quest-3"].base, /MEDIDAS\.md/);
  assert.deepStrictEqual([C.umbrales("quest-3").baja, C.umbrales("quest-3").sube, C.umbrales("quest-3").estable], [8, 5, 10]);
  for (const m of ["", undefined, null, "quest-9", "iphone", "toString", "__proto__"]) assert.strictEqual(C.umbrales(m).fila, "defecto", String(m));
  assert.strictEqual(C.umbrales("quest-2").fila, "quest-2");
  assert.notStrictEqual(C.umbrales("quest-3"), C.umbrales("quest-3"), "una copia: quien la toque no cambia la tabla");
  // todas las filas respetan el margen entre sube y baja y caen dentro de los límites de las perillas
  for (const [k, f] of Object.entries(C.APARATOS)) {
    assert.ok(f.baja - f.sube >= C.DEF.margen, k + ": histéresis");
    assert.ok(f.baja >= XP.LIM.js[0] && f.baja <= XP.LIM.js[1] && f.sube >= XP.LIMC.sube[0] && f.sube <= XP.LIMC.sube[1], k + ": dentro de los límites de las perillas");
  }
  // los defectos de 02f y de la tabla coinciden
  assert.deepStrictEqual([XP.DEF.js, XP.DEFC.sube, XP.DEFC.estable], [C.APARATOS.defecto.baja, C.APARATOS.defecto.sube, C.DEF.estable]);
  // 29_vr: el modelo sale de Aparato y la tabla manda como valor de código (la URL y la configuración, encima)
  assert.match(VR, /VrControlPuro\.umbrales\(Aparato\.modelo\(\)\)/);
  assert.match(VR, /Config\.param\("escalera\.vrJsMs", u\.baja\)/);
});

test("perillas ?xrjssube y ?xrestable: valor, recorte con motivo, no numérico ignorado; la URL manda sobre la tabla", () => {
  const A = xr("");
  assert.deepStrictEqual([A.jsSube(), A.estable(), A.js()], [5, 10, 8]);
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
  const src = trozo(VR, "function* vrNivelPasos", "// Q0c-b: histéresis");
  const reg = [], trabajos = [];
  const Cola = { cancela: k => reg.push("cancela " + k), add: (k, prio, gen) => { reg.push("add " + k + " " + prio); trabajos.push(gen); } };
  const VRX = { nivel: 0 }, VRP = { hierba: 32 }, UN = { uBumpK: { value: 1 } };
  const VR_PERFILES = [{ h: 32, b: 1 }, { h: 20, b: 0 }, { h: 0, b: 0 }, { h: 0, b: 0 }];
  const pasos = [], Arboles = { perfil: p => pasos.push("arboles") }, Escena3D = { perfil: p => pasos.push("escena3d") };
  const PM = new Function("\"use strict\";\n" + PURO + MOTOR + "\nreturn VrPresupuesto;")();
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

test("02g: escalonPorPasos deja lo mismo que ponEscalon, repartido en una fuente por paso", () => {
  const mallaFalsa = n => { const m = new Float32Array(n * 16); for (let i = 0; i < n; i++) { m[i * 16 + 12] = i * 10; m[i * 16 + 14] = 0; } return { instanceMatrix: { array: m, count: n, needsUpdate: false }, instanceColor: null, visible: true, count: n, frustumCulled: false, computeBoundingSphere() {} }; };
  function monta(modo) {
    const V = new Function("\"use strict\";\n" + PURO + MOTOR + "\nreturn VrPresupuesto;")(), vistos = []; const t = mallaFalsa(100);
    V.fuente("sombras", v => vistos.push(["sombras", v])); V.fuente("sueloFondo", v => vistos.push(["suelo", v])); V.instancias("arbolesPaisaje", [t]);

    if (modo === "pasos") { const g = V.escalonPorPasos(3); let n = 0; while (!g.next().done) n++; assert.strictEqual(n, PP.ORDEN.length, "un paso por fuente"); } else V.ponEscalon(3);
    V.mueve(0, 0);
    return { est: V.estado(), vistos, count: t.count };
  }
  const a = monta("golpe"), b = monta("pasos");
  assert.deepStrictEqual(b.est, a.est); assert.deepStrictEqual(b.vistos, a.vistos); assert.strictEqual(b.count, a.count);
  assert.ok(a.count < 100, "el recorte se hizo");
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

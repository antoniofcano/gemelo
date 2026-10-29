// Olivos generados en el motor (apps/web/motor/07ab_generados.js, ?olivos=gen) en Node, sin navegador ni GPU: el módulo del motor se ejecuta en un
// contexto vm con three 0.186.1, el constructor de olivos real (apps/web/olivo/) y el parcheTiempo y colorVertSRGB REALES (sacados de 15_tiempo.js y
// 03_escena.js). Comprueba:
//   - sin la bandera, no hace nada (ni grupo, ni paso, ni gasto): el motor dibuja lo mismo;
//   - luz: cada material de color lleva los uniformes de nubes y escarcha del motor (los mismos objetos), la sombra de nubes en posición del mundo,
//     el color por instancia de las mallas por lotes en sRGB, el color del material pasado de sRGB a lineal y las texturas marcadas sRGB;
//   - fundido: todos los materiales (también los de sombra) llevan uFun y el descarte por tramado; el lote lleva el código de cada árbol (alfa del
//     color por lotes, atributo aFun en las instanciadas); lo que entra no apaga el nivel de siempre hasta acabar el fundido; lo que sale se oculta al acabar;
//   - la huella olivo-2 de la receta no cambia (la del oráculo para centenario3/envero/7).
// Escribe una línea JSON {mal: [...], ...} (la lee pruebas/guardianes/olivo.test.js).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const MOTOR = path.join(RAIZ, "apps", "web", "motor");
const THREE = await import(pathToFileURL(path.join(OLIVO, "node_modules", "three-r186", "build", "three.module.js")).href);
const O = await import(pathToFileURL(path.join(OLIVO, "index.js")).href);
const lee = f => fs.readFileSync(path.join(MOTOR, f), "utf8");
const mal = [], diag = {};
const exige = (c, m) => { if (!c) mal.push(m); };

// un trozo de código fuente desde `inicio`: hasta la llave que cierra (función) o el «;» de primer nivel (var), saltando cadenas y comentarios
function extrae(src, inicio) {
  const a = src.indexOf(inicio); if (a < 0) throw new Error("no está: " + inicio);
  const fn = inicio.startsWith("function"); let d = 0, i = a, visto = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") { const q = c; for (i++; i < src.length && src[i] !== q; i++) if (src[i] === "\\") i++; continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if ("([{".includes(c)) { d++; if (c === "{") visto = true; }
    else if (")]}".includes(c)) { d--; if (fn && visto && d === 0) return src.slice(a, i + 1); }
    else if (!fn && c === ";" && d === 0) return src.slice(a, i + 1);
  }
  throw new Error("sin cierre: " + inicio);
}
const T15 = lee("15_tiempo.js"), T03 = lee("03_escena.js");
const piezas = [extrae(T03, "var GLSL_LIN"), extrae(T03, "function colorVertSRGB"), extrae(T15, "var uViento"), extrae(T15, "var uSombra"),
  extrae(T15, "var GLSL_SOMBRA"), extrae(T15, "function parcheTiempo")].join("\n");
const G07 = lee("07ab_generados.js");

function contexto(busqueda) {
  const cola = [];
  const ctx = {
    THREE, console, performance, Promise, Math, Object, Number, String, Error, Float32Array,
    location: { search: busqueda }, window: { OlivoGen: O },
    gArboles: new THREE.Group(), D: { copas: [], centro_utm: [0, 0] }, VRP: { on: false }, FACTOR_R8: 0.5, exag: 1,
    suelo: () => 0, camera: { position: new THREE.Vector3(0, 10, 0) },
    Cola: { add: () => { throw new Error("los generados no deben usar la Cola compartida"); }, hay: () => false }, cola
  };
  vm.createContext(ctx);
  vm.runInContext(piezas + "\n" + G07 + "\n;this.__G = Generados; this.__uSombra = uSombra;", ctx, { filename: "07ab_generados.js" });
  return ctx;
}
const espera = () => new Promise(r => setTimeout(r, 0));

// ---- 1) sin la bandera
{
  const c = contexto("?debug");
  await espera();
  exige(c.__G.estado() === "apagado", "sin la bandera, el estado es " + c.__G.estado());
  exige(c.gArboles.children.length === 0, "sin la bandera, Generados añade algo a la escena");
  exige(c.__G.paso(0.016, 4) === false && c.__G.gastado() === 0, "sin la bandera, paso() hace algo o gasta tiempo");
  const g = c.__G.actualiza(0, 0, 550000, []); exige(g.radio === 0 && !g.tiene(0), "sin la bandera, actualiza() reparte");
}

// ---- 2) con la bandera: materiales
const c = contexto("?olivos=gen");
for (let k = 0; k < 20 && c.__G.estado() === "cargando"; k++) await espera();
exige(c.__G.estado() === "activo", "Generados no arrancó: " + c.__G.estado() + " " + JSON.stringify(c.window.__olivosGen && c.window.__olivosGen().motivo));
const mats = c.__G._prueba.mats(), prof = c.__G._prueba.prof();
const LIB = { MeshStandardMaterial: "physical", MeshDepthMaterial: "depth", PointsMaterial: "points" };
function compila(m) {   // lo que haría el renderer: onBeforeCompile sobre los sombreadores de serie de three 0.186
  const L = THREE.ShaderLib[LIB[m.type]];
  const sh = { uniforms: THREE.UniformsUtils.clone(L.uniforms), vertexShader: L.vertexShader, fragmentShader: L.fragmentShader };
  m.onBeforeCompile.call(m, sh, null); return sh;
}
const COLOR = ["pies", "muerta", "oliva", "ramita0", "ramita1", "relleno", "puntos"], SOMBRA = ["ramita0_sombra", "ramita1_sombra", "relleno_sombra"];
const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
for (const n of COLOR) {
  const m = mats[n], sh = compila(m);
  for (const u of ["uDrift", "uCov", "uSomb", "uHielo"]) exige(sh.uniforms[u] === c.__uSombra[u], n + ": " + u + " no es el uniforme del motor");
  exige(sh.uniforms.uFun === c.__G._prueba.uFun, n + ": sin uFun");
  exige(/gl_FragColor\.rgb \*= vSomb/.test(sh.fragmentShader) && /uHielo \* 0\.6/.test(sh.fragmentShader) || n === "puntos", n + ": sin sombra de nubes ni escarcha en el fragmento");
  exige(!/ot_sombra\(position\.xz\)/.test(sh.vertexShader) && /vSomb = ot_sombra\(\(modelMatrix \* ot_w\)\.xz\)/.test(sh.vertexShader), n + ": la sombra de nubes no va en posición del mundo");
  exige(/ot_lin\(vColor\.rgb\)/.test(sh.vertexShader) && /USE_BATCHING_COLOR \) && ! defined/.test(sh.vertexShader), n + ": el color por instancia no se lee en sRGB");
  exige(/discard;/.test(sh.fragmentShader) && /ot_ign\(gl_FragCoord\.xy\)/.test(sh.fragmentShader) && /vFun = aFun/.test(sh.vertexShader), n + ": sin el tramado del fundido");
  exige(m.customProgramCacheKey().includes("gen-luz-fundido"), n + ": clave de programa sin el parche");
  if (m.map) exige(m.map.colorSpace === THREE.SRGBColorSpace, n + ": textura sin marcar como sRGB");
}
exige(Math.abs(mats.pies.color.r - lin(0xbd / 255)) < 1e-6, "el color de la corteza no pasó de sRGB a lineal: " + mats.pies.color.r);
for (const m of SOMBRA.map(n => mats[n]).concat([prof.corteza, prof.muerta])) {
  const sh = compila(m);
  exige(sh.uniforms.uFun === c.__G._prueba.uFun && /discard;/.test(sh.fragmentShader), m.type + ": la sombra no lleva el fundido");
  exige(!sh.uniforms.uHielo, "la sombra no debe llevar la escarcha");
}
exige(/#include <common>\n#include <common>/.test(compila(mats.pies).vertexShader) === false, "parche duplicado");

// ---- 3) con la bandera: el lote y el fundido (tres olivos de prueba; el foco en el primero)
const perfil = [2, 2, 2, 2, 2, 2, 2, 2];
c.D.copas = [[0, 0, 4.5, perfil, 1], [9, 0, 4, perfil, 1], [0, 30, 4, perfil, 1]];
const olivos = c.D.copas.map((q, i) => ({ i, x: q[0], y: q[1], h: q[2], perfil: q[3] }));
let t0 = performance.now(), vueltas = 0;
const TOPE = 160000 / 0.45 * 1.05;   // cabe un E0 y poco más: el foco cambia quién es E0
const gen = () => c.window.__olivosGen();
function acabaFundido() { for (let k = 0; k < 100 && gen().fundido.activo; k++) c.__G.paso(0.1, 1); }
// repartos y fotogramas (casi sin tiempo de fundido) hasta que se cumpla `listo` sobre el estado; si hay un fundido que no es el buscado, se acaba
function vuelta(fx, fz, tope, listo) {
  let g = null;
  for (let r = 0; r < 60; r++) {
    g = c.__G.actualiza(fx, fz, tope, olivos);
    for (let k = 0; k < 200000 && gen().trabajos > 0; k++) { c.__G.paso(0.00001, 50); vueltas++; }
    if (listo(gen())) return c.__G.actualiza(fx, fz, tope, olivos);
    acabaFundido();
  }
  mal.push("no se llegó al estado buscado: " + JSON.stringify(gen().info)); return g;
}
let g = vuelta(0, 0, TOPE, e => e.fundido.activo && e.info.propios >= 1), s = gen();
diag.primero = { info: s.info, fundido: s.fundido, ms: Math.round(performance.now() - t0) };
exige(s.info.arboles >= 1 && s.info.entran === s.info.arboles, "primer lote: todo entra (" + JSON.stringify(s.info) + ")");
exige(s.fundido.activo && s.fundido.avance < 0.05, "primer lote: el fundido no empieza");
const i0 = Number(Object.keys(olivos).find(i => c.__G.rotulo(+i)));
exige(c.__G.rotulo(i0) && !g.tiene(i0) && g.radio === 0, "durante el fundido de entrada, el nivel de siempre debe seguir (tiene=false, radio 0)");
const lote1 = c.__G._prueba.lote(), bm = lote1.children.find(o => o.isBatchedMesh), v4 = new THREE.Vector4();
bm.getColorAt(0, v4); exige(Math.abs(v4.w - 0.5) < 1e-6, "el alfa del color por lotes de lo que entra debe ser 0,5 (es " + v4.w + ")");
const im = lote1.children.find(o => o.isInstancedMesh);
exige(im && im.geometry.attributes.aFun && im.geometry.attributes.aFun.array.every(x => x === 1), "las instanciadas de lo que entra deben llevar aFun = 1");
acabaFundido(); s = gen(); g = c.__G.actualiza(0, 0, TOPE, olivos);
exige(!s.fundido.activo && s.fundido.avance === 1, "el fundido no acaba en su duración");
exige(g.tiene(i0) && g.radio > 0, "acabado el fundido, el generado sustituye al nivel de siempre");
// el foco pasa al tercero: el primero sale (o baja de detalle) y el tercero entra
g = vuelta(0, -30, TOPE, e => e.fundido.activo && e.info.saliendo >= 1); s = gen();
diag.segundo = { info: s.info, fundido: s.fundido };
exige(s.info.saliendo >= 1 && s.fundido.activo, "segundo lote: algo debe salir con fundido (" + JSON.stringify(s.info) + ")");
const S = c.__G._prueba.lote().userData.salen;
exige(S && Object.keys(S.B).length > 0, "segundo lote: sin la lista de lo que sale");
const ims = Object.values(S.I).map(x => [x.m, x.n, x.m.count]);
acabaFundido();
for (const [m, n] of ims) exige(m.count === n, "acabado el fundido, lo que sale sigue en " + m.name + " (" + m.count + " frente a " + n + ")");
for (const b of Object.values(S.B)) exige(b.ids.every(id => b.m.getVisibleAt(id) === false), "acabado el fundido, lo que sale sigue visible en " + b.m.name);
diag.vueltas = vueltas; diag.ms = Math.round(performance.now() - t0);

// ---- 4) la huella olivo-2 no cambia
const H = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "olivo", "huellas-" + O.GEN_VERSION + ".json"), "utf8"));
const caso = H.casos.find(x => x.tipo === "centenario3" && x.epoca === "envero" && x.semilla === 7);
if (caso) exige(await O.huella(O.receta({ tipo: "centenario3", epoca: "envero", semilla: 7 })) === caso.sha256, "la huella olivo-2 de centenario3/envero/7 cambió");
else mal.push("sin el caso centenario3/envero/7 en las huellas");

console.log(JSON.stringify({ mal, diag }));

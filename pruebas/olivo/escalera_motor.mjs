// La escalera de olivos (ADR-0019, fase A, O8c; ?olivos=escalera) en Node, sin navegador ni GPU: 07ab_generados.js (el reparto Escalera y los
// generados) y 07ac_lejanos.js (la capa de lejanos, aquí sin hornear su textura) se ejecutan en un contexto vm con three 0.186.1, el constructor de
// olivos real y el parcheTiempo y colorVertSRGB REALES. Comprueba:
//   - el reparto por presupuesto con los triángulos medidos (ADR-0017 §4) da la tabla del ADR §1 en escritorio, móvil y gafas (perfiles 0 y 3);
//   - histéresis: con el reparto asentado, moverse 1 m no cambia el escalón de nadie; en un ida y vuelta de ± 3 m (10 veces), ≤ 2 cambios por olivo;
//     ningún olivo cambia dos veces en menos de 1 s;
//   - con el fixture de Hituelo y recetas de verdad, paseando 160 m y en una órbita de 230 a 30 m: en cada paso, todo olivo a menos de U2 está en
//     3D o en lejanos (nunca en ninguno, salvo antes de que haya capa de lejanos); fuera de un fundido, en uno solo; las llamadas de olivos ≤ 8 y los
//     triángulos de olivos ≤ presupuesto (+10 % de lo que sale durante el fundido);
//   - sin la bandera: ni capa de lejanos ni trabajo; con ?olivos=gen, la escalera tampoco actúa.
// Escribe una línea JSON {mal: [...], diag} (la lee pruebas/guardianes/olivo.test.js). GEMELO_SIN_FIXTURE=1 salta la parte 4 (la lenta, ~1,5 min).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OLIVO = path.join(RAIZ, "apps", "web", "olivo"), MOTOR = path.join(RAIZ, "apps", "web", "motor");
const THREE = await import(pathToFileURL(path.join(OLIVO, "node_modules", "three-r186", "build", "three.module.js")).href);
const O = await import(pathToFileURL(path.join(OLIVO, "index.js")).href);
const lee = f => fs.readFileSync(path.join(MOTOR, f), "utf8");
const mal = [], diag = {};
const exige = (c, m) => { if (!c) mal.push(m); };

function extrae(src, inicio) {   // como en generados_motor.mjs: una función o un var de primer nivel, saltando cadenas y comentarios
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
const G07 = lee("07ab_generados.js"), L07 = lee("07ac_lejanos.js");

function contexto(busqueda, reloj) {
  const ctx = {
    THREE, console, performance: reloj || performance, Promise, Math, Object, Number, String, Error, Float32Array, Uint8Array,
    location: { search: busqueda }, window: { OlivoGen: O },
    gArboles: new THREE.Group(), D: { copas: [], centro_utm: [0, 0] }, VRP: { on: false }, FACTOR_R8: 0.5, exag: 1,
    suelo: () => 0, camera: { position: new THREE.Vector3(0, 10, 0) },
    Cola: { add: () => { throw new Error("los generados no deben usar la Cola compartida"); }, hay: () => false }
  };
  vm.createContext(ctx);
  vm.runInContext(piezas + "\n" + G07 + "\n" + L07 + "\n;this.__G = Generados; this.__E = Escalera; this.__L = Lejanos;", ctx, { filename: "07ab+07ac" });
  return ctx;
}
const espera = () => new Promise(r => setTimeout(r, 0));
const TRI = { E0: 102978, E1: 48378, E2: 19366, E2VR: 14618 }, LEJ = 5859 * 2;   // ADR-0017 §4 y los impostores de Hituelo (2 tri × 5.859)

// ---- 1) el reparto por presupuesto: la tabla del ADR §1 (centenario de 3 pies; 28 copas a menos de 40 m)
const c0 = contexto("?olivos=escalera"), E = c0.__E;
function linea(n, paso) { return Array.from({ length: n }, (_, k) => ({ c: { i: k }, d: (k + 1) * paso })); }
function reparto(pres, vr, cand) {
  const r = E.planifica(cand || linea(120, 40 / 28 * 1.2), {}, { pres, vr, ahora: 0, costo: (cl, niv) => TRI[niv], clavePropia: (c, n) => "p" + c.i + ":" + n, claveVar: c => "v" + (c.i % 4) + ":" + (vr ? "E2VR" : "E2") });
  const n = { E0: 0, E1: 0, E2: 0, E2VR: 0 }; r.plan.forEach(p => n[p.niv]++); return Object.assign(n, { usado: r.usado });
}
const casos = {
  escritorio: { pres: E.tope({ base: 550000, vr: null, movil: false, escala: 1, triLejanos: LEJ }), vr: false, quiere: { E0: 1, E1: 4, E2: 12, E2VR: 0 } },
  movil: { pres: E.tope({ base: 550000, vr: null, movil: true, escala: 1.6, triLejanos: LEJ }), vr: false, quiere: { E0: 1, E1: 1, E2: 5, E2VR: 0 } },
  gafas0: { pres: E.tope({ base: 550000, vr: { tri: 380000 }, movil: false, escala: 2, triLejanos: LEJ }), vr: true, quiere: { E0: 1, E1: 2, E2: 0, E2VR: 11 } },
  gafas3: { pres: E.tope({ base: 550000, vr: { tri: 130000 }, movil: false, escala: 2, triLejanos: LEJ }), vr: true, quiere: { E0: 0, E1: 1, E2: 0, E2VR: 4 } },
};
diag.reparto = {};
for (const [k, x] of Object.entries(casos)) {
  const n = reparto(x.pres, x.vr); diag.reparto[k] = Object.assign({ pres: x.pres }, n);
  for (const niv of ["E0", "E1", "E2", "E2VR"]) exige(n[niv] === x.quiere[niv], k + ": " + niv + " " + n[niv] + " (el ADR dice " + x.quiere[niv] + ") · " + JSON.stringify(n));
  exige(n.usado <= x.pres, k + ": usa " + n.usado + " de " + x.pres);
}
exige(E.tope({ base: 550000, movil: true, escala: 0.7, triLejanos: 0 }) === 270000 * 0.7, "móvil: la escala adaptativa no baja el tope");
exige(E.tope({ base: 550000, movil: false, escala: 2, triLejanos: 1000 }) === 1099000, "escritorio: tope = base × escala − lejanos");

// ---- 2) histéresis (pura): olivos en rejilla de 7 m (≈ 28 a menos de 40 m), el foco anda por la x
{
  const ol = []; for (let i = -12; i <= 30; i++) for (let j = -6; j <= 6; j++) ol.push({ i: ol.length, x: i * 7 + (j % 2) * 3.5, y: j * 7 });
  const pres = casos.escritorio.pres, est = {}; let ahora = 0, cambios = {}, ultimo = {};
  const plan = fx => {
    const cand = ol.map(c => ({ c, d: Math.hypot(c.x - fx, c.y) })).filter(x => x.d < 160).sort((a, b) => a.d - b.d);
    const r = E.planifica(cand, est, { pres, vr: false, ahora, costo: (cl, niv) => TRI[niv], clavePropia: (c, n) => "p" + c.i + ":" + n, claveVar: c => "v" + (c.i % 4) + ":E2" });
    const m = {}; r.plan.forEach(p => { m[p.c.i] = p.clave; }); return m;
  };
  const cuenta = (a, b, t) => { new Set(Object.keys(a).concat(Object.keys(b))).forEach(i => { if (a[i] !== b[i]) { cambios[i] = (cambios[i] || 0) + 1; if (ultimo[i] !== undefined && t - ultimo[i] < E.T_MIN) mal.push("histéresis: el olivo " + i + " cambia dos veces en " + (t - ultimo[i]) + " s"); ultimo[i] = t; } }); };
  let m = plan(0); for (let k = 0; k < 5; k++) { ahora += 2; m = plan(0); }
  ahora += 2; const m1 = plan(1); let n1 = 0; new Set(Object.keys(m).concat(Object.keys(m1))).forEach(i => { if (m[i] !== m1[i]) n1++; });
  diag.histeresis = { arboles3D: Object.keys(m).length, cambiosAl1m: n1 };
  exige(n1 === 0, "histéresis: moverse 1 m cambia el escalón de " + n1 + " olivos");
  // ida y vuelta de ± 3 m, 10 veces, a 0,5 s por paso (más deprisa que T_MIN)
  let prev = m1;
  for (let v = 0; v < 10; v++) for (const fx of [2, 3, 2, 1, 0, -1, -2, -3, -2, -1, 0]) { ahora += 0.5; const mm = plan(fx); cuenta(prev, mm, ahora); prev = mm; }
  const max = Math.max(0, ...Object.values(cambios));
  diag.histeresis.idaYVuelta = { olivosQueCambian: Object.keys(cambios).length, maxCambios: max };
  exige(max <= 2, "histéresis: en un ida y vuelta de ± 3 m, un olivo cambia " + max + " veces (tope 2)");
  // un paseo largo: lo que cambia lo hace de cerca a lejos (los nuevos, cerca; los que salen, lejos), sin parpadeo de un paso al siguiente
  cambios = {}; ultimo = {};
  for (let fx = 0; fx <= 150; fx++) { ahora += 0.7; const mm = plan(fx); cuenta(prev, mm, ahora); prev = mm; }
  diag.histeresis.paseo150 = { olivosQueCambian: Object.keys(cambios).length, maxCambios: Math.max(0, ...Object.values(cambios)) };
}

// ---- 2b) el sombreador del impostor (07ac) usa la disposición del formato 1 de apps/web/olivo/impostor.js: el texto GLSL lleva las fórmulas que
// aquí se reproducen en JS, y estas dan la misma vista, la misma base y la misma celda que impostor.js para 2.000 direcciones al azar y las 64 vistas
{
  const glsl = L07;
  for (const f of ["return vec2(d.x / s + d.z / s, d.x / s - d.z / s)", "float a = -1.0 + 2.0 * ij.x / 7.0, b = -1.0 + 2.0 * ij.y / 7.0", "float x = (a + b) * 0.5, z = (a - b) * 0.5",
    "r = cross(vec3(0.0, 1.0, 0.0), d)", "u = cross(d, r)", "floor(clamp((ot_oct(ot_d) + 1.0) * 3.5, 0.0, 7.0) + 0.5)",
    "(vec2(mod(float(ot_k), 2.0) * 8.0 + ot_ij.x, floor(float(ot_k) / 2.0) * 8.0 + ot_ij.y) + vOtQ * 0.5 + 0.5) / 16.0", "imageOrientation: \"flipY\""])
    exige(glsl.includes(f), "07ac: el sombreador del impostor ya no lleva «" + f + "»");
  const oct = d => { const y = Math.max(0, d[1]), s = Math.abs(d[0]) + y + Math.abs(d[2]) || 1; return [d[0] / s + d[2] / s, d[0] / s - d[2] / s]; };
  const ijDe = d => oct(d).map(v => Math.floor(Math.min(7, Math.max(0, (v + 1) * 3.5)) + 0.5));
  let malas = 0, r = 12345; const az = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 2000; k++) {
    const t = az() * 2 * Math.PI, e = Math.asin(az() * 1.2 - 0.2), d = [Math.cos(e) * Math.cos(t), Math.sin(e), Math.cos(e) * Math.sin(t)];
    const a = ijDe(d), b = O.vistaContinua(d).map(Math.round);
    if (a[0] !== b[0] || a[1] !== b[1]) malas++;
  }
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const d = O.direccionDeVista(i, j), a = ijDe(d); if (a[0] !== i || a[1] !== j) malas++;
    for (let k = 0; k < 4; k++) { const cu = O.celdaUV(k, i, j), u0 = ((k % 2) * 8 + i) / 16, v0 = (Math.floor(k / 2) * 8 + j) / 16; if (Math.abs(cu[0] - u0) > 1e-9 || Math.abs(cu[1] - v0) > 1e-9) malas++; }
  }
  diag.impostorGLSL = { malas };
  exige(malas === 0, "07ac: la vista o la celda del sombreador del impostor no son las de impostor.js en " + malas + " casos");
}

// ---- 3) sin la bandera (y con ?olivos=gen) la escalera no actúa: sin capa de lejanos, sin trabajo
for (const q of ["?debug", "?olivos=gen"]) {
  const c = contexto(q);
  for (let k = 0; k < 20 && c.__G.estado() === "cargando"; k++) await espera();
  exige(!c.__G.escalera(), q + ": Generados dice escalera");
  c.__L.inicia([{ i: 0, x: 0, y: 0, h: 4, perfil: [2, 2, 2, 2, 2, 2, 2, 2], gz: 0 }]);
  exige(c.__L.paso(0.016) === false && c.__L.pendientes() === 0 && c.__L.triangulos() === 0 && c.__L.resumen() === null && c.gArboles.children.length === (q === "?olivos=gen" ? 1 : 0), q + ": Lejanos hace algo");
}

// ---- 4) con el fixture de Hituelo y recetas de verdad: nunca un olivo sin dibujar, llamadas y triángulos dentro
const FX = process.env.GEMELO_SIN_FIXTURE ? "-" : path.join(RAIZ, "pruebas", "salida", "fixture", "hituelo", "indice.json");
if (!fs.existsSync(FX)) mal.push("sin el fixture (npm run fixture): la escalera con recetas de verdad NO se ha comprobado");
else {
  const I = JSON.parse(fs.readFileSync(FX, "utf8"));
  const reloj = { t: 0, now() { return (this.t += 0.6); } }, cx = contexto("?olivos=escalera", reloj);
  for (let k = 0; k < 20 && cx.__G.estado() === "cargando"; k++) await espera();
  exige(cx.__G.estado() === "activo", "escalera: Generados no arrancó: " + cx.__G.estado());
  Object.assign(cx.D, { copas: I.copas, copas_id: I.copas_id, copas_param: I.copas_param, copas_semilla: I.copas_semilla, centro_utm: I.centro_utm });
  const ol = I.copas.map((q, i) => ({ i, x: q[0], y: q[1], h: q[2], perfil: q[3], gz: 0 })).filter(c => !(c.h > 8));
  cx.__L._prueba.sinGPU(); cx.__L.inicia(ol);
  const G = cx.__G, L = cx.__L, P = G._prueba, U2 = 1600;
  let huecos = [], dobles = [], antesDeCapa = 0, pasos = 0, maxLlamadas = 0, maxTri = 0, sobre = [], conCapa = -1;
  function fotograma(fx, fz, cam) {
    cx.camera.position.set(cam[0], cam[1], cam[2]);
    const pres = E.tope({ base: 550000, vr: null, movil: false, escala: 1, triLejanos: L.triangulos() });
    let s = false; for (let f = 0; f < 12; f++) { s = G.paso(1 / 30, 3) || s; s = L.paso(1 / 30) || s; }
    const GEN = G.actualiza(fx, fz, pres, ol, 1, !L.hayCapa()); L.reparte(cx.camera.position, GEN);
    pasos++;
    const listos = P.listos(), sal = P.saliendo(), mesh = L._prueba.malla(), st = cx.window.__olivosGen(), fund = st.fundido.activo;
    const lej = new Set(L._prueba.ids());
    if (!L.hayCapa()) { antesDeCapa++; return; }
    if (conCapa < 0) conCapa = pasos;
    for (const c of ol) {
      const d = Math.hypot(c.x - cam[0], -c.y - cam[2], cam[1]); if (d >= U2) continue;
      const en3D = !!listos[c.i] || (fund && !!sal[c.i]), enL = lej.has(c.i);
      if (!en3D && !enL) huecos.push(pasos + ":" + c.i);
      if (!fund && en3D && enL) dobles.push(pasos + ":" + c.i);
    }
    const llam = (st.info.llamadas || 0) + (mesh && mesh.count ? 1 : 0), tri = (st.info.triangulos || 0) - (st.info.triSaliendo || 0) + L.triangulos();
    maxLlamadas = Math.max(maxLlamadas, llam); maxTri = Math.max(maxTri, tri);
    if (tri > pres + L.triangulos() + 1) sobre.push(pasos + ": " + tri + " > " + Math.round(pres + L.triangulos()));
  }
  const x0 = Math.min(...ol.map(c => c.x)), y0 = ol.reduce((s, c) => s + c.y, 0) / ol.length;
  const t0 = Date.now();
  // primero quieto hasta que la capa de lejanos exista (las 4 variantes E2 calculadas), luego el paseo de 160 m y la órbita de 230 a 30 m
  for (let k = 0; k < 400 && !L.hayCapa(); k++) { fotograma(x0, -y0, [x0, 1.7, -y0]); await espera(); }
  exige(L.hayCapa(), "escalera: la capa de lejanos no llega (variantes: " + JSON.stringify(cx.window.__olivosGen().recetas) + ")");
  const cajas = L._prueba.cajas();
  exige(cajas && cajas.length === 4 && cajas.every(b => b.max.y - b.min.y > 2 && b.max.x - b.min.x > 2), "las cajas de las variantes no tienen tamaño de olivo: " + JSON.stringify(cajas && cajas.map(b => [b.min, b.max])));
  for (let n = 0; n <= 160; n++) { const fx = x0 + n; fotograma(fx, -y0, [fx, 1.7, -y0]); }
  const fo = x0 + 80;
  for (let r = 230; r >= 30; r -= 5) fotograma(fo, -y0, [fo + r * 0.6, r * 0.55, -y0 + r * 0.6]);
  for (let k = 0; k < 40; k++) fotograma(fo, -y0, [fo + 18, 16, -y0 + 18]);   // quieto: que acaben lotes y fundidos
  const st = cx.window.__olivosGen();
  diag.fixture = { pasos, antesDeCapa, conCapaEnPaso: conCapa, huecos: huecos.length, dobles: dobles.length, maxLlamadas, maxTri, sobre: sobre.length, final: st.info, reparto: st.escalera, lejanos: L.resumen(), ms: Date.now() - t0 };
  exige(huecos.length === 0, "escalera: olivos sin dibujar (paso:olivo): " + huecos.slice(0, 8).join(", "));
  exige(dobles.length === 0, "escalera: olivos en 3D y en lejanos fuera de un fundido: " + dobles.slice(0, 8).join(", "));
  exige(maxLlamadas <= 8, "escalera: " + maxLlamadas + " llamadas de olivos (tope 8)");
  exige(sobre.length === 0, "escalera: triángulos de olivos por encima del presupuesto: " + sobre.slice(0, 4).join(", "));
  exige((st.info.arboles || 0) >= 1 && st.info.niveles && st.info.niveles.E0 + st.info.niveles.E1 + st.info.niveles.E2 >= 1, "escalera: al final no hay ningún olivo en 3D: " + JSON.stringify(st.info));
  exige(G.rotulo(ol.find(c => !P.listos()[c.i]).i).lejano === true, "escalera: el rótulo de un olivo que no está en 3D no dice «lejano»");
}

console.log(JSON.stringify({ mal, diag }));

// La escalera de olivos (ADR-0019, fase A, O8c; ?olivos=escalera) en Node, sin navegador ni GPU: 07ab_generados.js (el reparto Escalera y los
// generados) y 07ac_lejanos.js (la capa de lejanos, aquí sin hornear su textura) se ejecutan en un contexto vm con three 0.186.1, el constructor de
// olivos real y el parcheTiempo y colorVertSRGB REALES. Comprueba:
//   - el reparto por alto en píxeles (O9c, decisión 82, ADR-0022): dentro del presupuesto en escritorio, móvil y gafas (perfiles 0 y 3), el escalón
//     nunca más grueso hacia dentro, fuera de la banda el de sus píxeles con la s del reparto, y con presupuesto de sobra s = 1 (700/250/90 px);
//   - continuidad: paseando, el peso visible de cada escalón cambia poco a poco (ningún salto sin cambio de s); ida y vuelta de ± 3 m, pocos cambios;
//   - O9b-0: la variante y el impostor, con la copa y la altura del propio (decisión 81);
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
    gArboles: new THREE.Group(), D: { copas: [], centro_utm: [0, 0] }, VRP: { on: false }, FACTOR_R8: 0.5, FACTOR_R8_GEN: 1, exag: 1,
    // la configuración del servidor (02c Config) sin servidor: todo vale lo del código
    Config: { listo: Promise.resolve(null), al: f => f(null), param: (r, c, u) => (u !== undefined && u !== null ? u : c), umbrales: (c, u) => u || c, tablaEpocas: () => null, epocaDeFecha: () => null }, factorCopaDeConfig: () => 1,
    suelo: () => 0, camera: { position: new THREE.Vector3(0, 10, 0) },
    Cola: { add: () => { throw new Error("los generados no deben usar la Cola compartida"); }, hay: () => false }
  };
  vm.createContext(ctx);
  vm.runInContext(piezas + "\n" + G07 + "\n" + L07 + "\n;this.__G = Generados; this.__E = Escalera; this.__L = Lejanos;", ctx, { filename: "07ab+07ac" });
  return ctx;
}
const espera = () => new Promise(r => setTimeout(r, 0));
const TRI = { E0: 102978, E1: 48378, E2: 19366, E2VR: 14618 }, LEJ = 5859 * 2;   // ADR-0017 §4 y los impostores de Hituelo (2 tri × 5.859)

// ---- 1) el reparto por alto en píxeles con fronteras desplazadas por el presupuesto (O9c, decisión 82; triángulos de ADR-0017 §4, olivos de 4 m)
const c0 = contexto("?olivos=escalera"), E = c0.__E;
function linea(n, paso) { return Array.from({ length: n }, (_, k) => ({ c: { i: k, h: 4 }, d: (k + 1) * paso })); }
const ORD = { E0: 0, E1: 1, E2: 2, E2VR: 2 };
function reparto(pres, vr, cand, extra) {
  const est = {}, o = Object.assign({ pres, vr, costo: (cl, niv) => TRI[niv], clavePropia: (c, n) => "p" + c.i + ":" + n, claveVar: c => "v" + (c.i % 4) + ":" + (vr ? "E2VR" : "E2") }, extra || {});
  let r; for (let k = 0; k < 4; k++) r = E.planifica(cand || linea(120, 40 / 28 * 1.2), est, o);   // asentado (la s baja un paso por reparto si sobra)
  const n = { E0: 0, E1: 0, E2: 0, E2VR: 0 }; r.plan.forEach(p => n[p.niv]++);
  return Object.assign(n, { usado: r.usado, s: r.s, propios: r.propios, variantes: r.variantes, enBanda: r.enBanda, plan: r.plan });
}
const KVR = 0.9 * 1760 / (2 * Math.tan(48 * Math.PI / 180));   // Quest 3 aproximado (NO VERIFICADO): px por ojo, fov vertical ≈ 96°
const casos = {
  escritorio: { pres: E.tope({ base: 550000, vr: null, movil: false, escala: 1, triLejanos: LEJ }), vr: false },
  movil: { pres: E.tope({ base: 550000, vr: null, movil: true, escala: 1.6, triLejanos: LEJ }), vr: false },
  gafas0: { pres: E.tope({ base: 550000, vr: { tri: 380000 }, movil: false, escala: 2, triLejanos: LEJ }), vr: true, kPx: KVR },
  gafas3: { pres: E.tope({ base: 550000, vr: { tri: 130000 }, movil: false, escala: 2, triLejanos: LEJ }), vr: true, kPx: KVR },
};
diag.reparto = {};
for (const [k, x] of Object.entries(casos)) {
  const n = reparto(x.pres, x.vr, null, { kPx: x.kPx }), F = E.fronteras(4, x.kPx || E.K_PX, E.UMBRALES, n.s, E.BANDA);
  diag.reparto[k] = { pres: x.pres, E0: n.E0, E1: n.E1, E2: n.E2, E2VR: n.E2VR, usado: n.usado, s: +n.s.toFixed(2), enBanda: n.enBanda, fronteras_4m: F.D.map(v => +v.toFixed(1)) };
  exige(n.usado <= x.pres && n.propios <= 6 && n.variantes <= 48, k + ": se pasa del presupuesto: " + JSON.stringify(diag.reparto[k]));
  exige(n.E0 + n.E1 + n.E2 + n.E2VR >= 1, k + ": nada en 3D");
  exige(x.vr ? n.E2 === 0 : n.E2VR === 0, k + ": el escalón 2 no es el del aparato");
  // el escalón nunca empeora hacia dentro: un olivo más cercano no lleva un escalón más grueso que otro más lejano (cada uno, por su parte más fina)
  const fino = {}; n.plan.forEach(p => { fino[p.c.i] = Math.min(fino[p.c.i] === undefined ? 9 : fino[p.c.i], ORD[p.niv]); });
  const ids = Object.keys(fino).map(Number).sort((a, b) => a - b);
  for (let q = 1; q < ids.length; q++) exige(fino[ids[q]] >= fino[ids[q - 1]], k + ": el olivo " + ids[q] + " (más lejos) va más fino que el " + ids[q - 1]);
  // fuera de su banda, cada olivo lleva el escalón de sus píxeles con la s del reparto
  n.plan.forEach(p => { if (p.rol) return; const px = 4 * (x.kPx || E.K_PX) / p.d / n.s, quiere = px >= E.UMBRALES[0] && !(x.vr && TRI.E0 > 0.4 * x.pres) ? 0 : px >= E.UMBRALES[1] ? 1 : 2;
    if (ORD[p.niv] !== quiere && Math.abs(p.d - F.D[Math.min(ORD[p.niv], quiere)]) > 0.6 + 0.08 * F.D[Math.min(ORD[p.niv], quiere)]) mal.push(k + ": a " + p.d.toFixed(1) + " m va en " + p.niv + " y sus píxeles piden el escalón " + quiere); });
}
exige(diag.reparto.gafas3.E0 === 0, "gafas, perfil 3: el E0 pasa del 40 % del perfil y no debe salir");
// con presupuesto de sobra, s = 1: las fronteras son las de los umbrales de partida (700, 250 y 90 px)
{
  const n = reparto(1e9, false, linea(120, 1), { maxPropios: 999, maxVar: 999 }), F = E.fronteras(4, E.K_PX, E.UMBRALES, 1, E.BANDA);
  diag.sinTope = { s: n.s, fronteras_4m: F.D.map(v => +v.toFixed(2)), bandas: F.b };
  exige(n.s === 1, "con presupuesto de sobra, s debe ser 1 (es " + n.s + ")");
  exige(Math.abs(F.D[0] - 4 * E.K_PX / 700) < 1e-9 && Math.abs(F.D[2] - 4 * E.K_PX / 90) < 1e-9, "las fronteras no son h · kPx / umbral");
  const e0 = n.plan.filter(p => p.niv === "E0" && !p.rol).map(p => p.d), b0 = n.plan.filter(p => p.banda && p.banda.k === 0);
  exige(e0.length && Math.max(...e0) <= F.D[0] - F.b[0] + 1e-9 && b0.length >= 2 && b0.every(p => Math.abs(p.d - F.D[0]) <= F.b[0] + 1e-9), "el E0 entero y su banda no están donde dicen los 700 px: " + JSON.stringify({ e0, b0: b0.map(p => [p.niv, p.rol, p.d]) }));
}
exige(E.tope({ base: 550000, movil: true, escala: 0.7, triLejanos: 0 }) === 270000 * 0.7, "móvil: la escala adaptativa no baja el tope");
exige(E.tope({ base: 550000, movil: false, escala: 2, triLejanos: 1000 }) === 1099000, "escritorio: tope = base × escala − lejanos");

// ---- 2) continuidad (pura): olivos en rejilla de 7 m, el ojo anda por la x. El PESO visible de cada escalón de cada olivo (entero 1; en banda, f
// el más fino y 1 − f el más grueso; lejano lo que falta) cambia poco a poco: fuera de un cambio de s, ningún salto de más de 0,35 en un paso de
// 0,35 m (con la banda de ± 1,5 m, un paso así mueve el peso ≈ 0,12); y en un ida y vuelta de ± 3 m los cambios de estado de cada olivo son pocos
{
  const ol = []; for (let i = -12; i <= 30; i++) for (let j = -6; j <= 6; j++) ol.push({ i: ol.length, x: i * 7 + (j % 2) * 3.5, y: j * 7, h: 4 });
  const pres = casos.escritorio.pres, est = {}; let ahora = 0;
  const pesos = r => { const w = {}; r.plan.forEach(p => { const v = w[p.c.i] || (w[p.c.i] = [0, 0, 0, 0]); const f = p.rol === 0 ? 1 : p.rol === 1 ? p.f : 1 - p.f; v[ORD[p.niv]] += f; if (p.rol === 1 && p.lej) v[3] += 1 - p.f; }); return w; };
  const plan = fx => {
    const cand = ol.map(c => ({ c, d: Math.hypot(c.x - fx, c.y) })).filter(x => x.d < 160).sort((a, b) => a.d - b.d).slice(0, 120);
    ahora += 0.25;   // a 1,4 m/s, un reparto cada 0,25 s
    return E.planifica(cand, est, { pres, vr: false, ahora, costo: (cl, niv) => TRI[niv], clavePropia: (c, n) => "p" + c.i + ":" + n, claveVar: c => "v" + (c.i % 4) + ":E2" });
  };
  const salto = (a, b) => { let m = 0; new Set(Object.keys(a).concat(Object.keys(b))).forEach(i => { const u = a[i] || [0, 0, 0, 1], v = b[i] || [0, 0, 0, 1]; for (let k = 0; k < 4; k++) m = Math.max(m, Math.abs(u[k] - v[k])); }); return m; };
  let r = plan(0); for (let k = 0; k < 6; k++) r = plan(0);
  let w = pesos(r), sAnt = r.s, saltos = 0, saltosS = 0, maxSalto = 0, maxSaltoS = 0, cambiosS = 0;
  const anda = fx => { const r2 = plan(fx), w2 = pesos(r2), m = salto(w, w2); if (r2.s !== sAnt) { cambiosS++; maxSaltoS = Math.max(maxSaltoS, m); if (m > 0.35) saltosS++; } else { maxSalto = Math.max(maxSalto, m); if (m > 0.35) saltos++; } sAnt = r2.s; w = w2; return r2; };
  for (let fx = 0; fx <= 150; fx += 0.35) anda(fx);
  diag.continuidad = { maxSaltoSinCambioDeS: +maxSalto.toFixed(3), saltos, cambiosDeS: cambiosS, saltosConCambioDeS: saltosS, maxSaltoConCambioDeS: +maxSaltoS.toFixed(3) };
  exige(saltos === 0, "paseo: " + saltos + " saltos de peso > 0,35 sin cambiar s (máx. " + maxSalto.toFixed(2) + ")");
  // ida y vuelta de ± 3 m a pasos de 0,35 m, 10 veces: cuántas veces cambia el estado (entero / banda) de cada olivo
  const estado = () => { const m = {}; Object.keys(est).forEach(i => { if (i !== "_s") m[i] = JSON.stringify(est[i]); }); return m; };
  let prev = estado(); const cambios = {};
  for (let v = 0; v < 10; v++) for (const fx of [...Array(9).keys()].map(k => 150 + 0.35 * k).concat([...Array(17).keys()].map(k => 152.8 - 0.35 * k), [...Array(8).keys()].map(k => 147.2 + 0.35 * k))) { anda(fx); const e = estado(); Object.keys(e).forEach(i => { if (prev[i] !== undefined && prev[i] !== e[i]) cambios[i] = (cambios[i] || 0) + 1; }); prev = e; }
  const max = Math.max(0, ...Object.values(cambios));
  diag.continuidad.idaYVuelta = { olivosQueCambian: Object.keys(cambios).length, maxCambios: max, saltos, cambiosDeS: cambiosS, saltosConCambioDeS: saltosS };
  exige(saltos === 0, "ida y vuelta: saltos de peso sin cambiar s");
  exige(max <= 80, "ida y vuelta de ± 3 m: un olivo cambia de estado " + max + " veces en 10 vueltas (tope 80: el que pasa por debajo cruza la banda del E0 dos veces a la ida y dos a la vuelta, entrando y saliendo)");
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
  let huecos = [], dobles = [], antesDeCapa = 0, pasos = 0, maxLlamadas = 0, maxTri = 0, sobre = [], conCapa = -1, maxBanda = 0, malBanda = [];
  function fotograma(fx, fz, cam) {
    cx.camera.position.set(cam[0], cam[1], cam[2]);
    const pres = E.tope({ base: 550000, vr: null, movil: false, escala: 1, triLejanos: L.triangulos() });
    let s = false; for (let f = 0; f < 12; f++) { s = G.paso(1 / 30, 3) || s; s = L.paso(1 / 30) || s; }
    const GEN = G.actualiza(fx, fz, pres, ol, 1, !L.hayCapa()); L.reparte(cx.camera.position, GEN);
    pasos++;
    const listos = P.listos(), sal = P.saliendo(), mesh = L._prueba.malla(), st = cx.window.__olivosGen(), fund = st.fundido.activo;
    const lej = new Set(L._prueba.ids()), lr = P.lejRanura();
    if (!L.hayCapa()) { antesDeCapa++; return; }
    // O9c: cada ranura en banda tiene su peso en uBanda (el de la distancia de este fotograma) y el lejano de un olivo en la banda E2|lejano lleva
    // el código 2 + 3 · ranura (el complementario de su E2)
    const B = P.bandas(), ub = P.uBanda.value, ids = L._prueba.ids(), fun = mesh ? mesh.geometry.attributes.aFun.array : null;
    maxBanda = Math.max(maxBanda, Object.keys(B).length);
    for (const k of Object.keys(B)) {
      const b = B[k], d = Math.hypot(b.c.x - cam[0], -b.c.y - cam[2], cam[1]), f = b.b > 0 ? Math.min(1, Math.max(0, (b.D + b.b - d) / (2 * b.b))) : d <= b.D ? 1 : 0, u = ub[k >> 2].getComponent(k & 3);
      if (Math.abs(u - f) > 1e-6) malBanda.push(pasos + ": ranura " + k + " pesa " + u.toFixed(3) + " y debe " + f.toFixed(3));
    }
    ids.forEach((i, q) => { if (lr[i] && fun[q] !== 2 + 3 * lr[i]) malBanda.push(pasos + ": el lejano de " + i + " lleva " + fun[q] + " y no 2 + 3 · " + lr[i]); });
    if (conCapa < 0) conCapa = pasos;
    for (const c of ol) {
      const d = Math.hypot(c.x - cam[0], -c.y - cam[2], cam[1]); if (d >= U2) continue;
      const en3D = !!listos[c.i] || (fund && !!sal[c.i]), enL = lej.has(c.i);
      if (!en3D && !enL) huecos.push(pasos + ":" + c.i);
      if (!fund && en3D && enL && !lr[c.i]) dobles.push(pasos + ":" + c.i);   // en la banda E2|lejano van los dos, con el tramado complementario
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
  // O9b-0 (decisión 81, ADR-0022 §1): la variante (y el impostor, que usa su matriz) se estira a la MISMA copa y altura que pide el propio:
  // copas_param.copa_m si la hay; si no, 2 × r8 medio (FACTOR_R8_GEN = 1) y h
  {
    // dos olivos de prueba fuera del registro del fixture (que no trae copas_param): uno con su fila de copas_param y otro sin ella
    const rv = G.lejanos.variante(0), n = I.copas.length, fila = [3.8, 4.3, 0.2, 90, 0.85, 1.1, 0.12, 0];
    cx.D.copas_param = []; cx.D.copas_param[n + 3] = fila;
    const conP = { i: n + 3, x: 0, y: 0, h: 4.0, perfil: [2.15, 2.15, 2.15, 2.15, 2.15, 2.15, 2.15, 2.15], gz: 0 }, sinP = { i: n + 7, x: 0, y: 0, h: 4.2, perfil: [2, 2, 2, 2, 2.4, 2.4, 2.4, 2.4], gz: 0 };
    const dib = c => { const e = G.lejanos.matriz(c, rv).elements; return { copa: e[0] / rv.escala[0] * rv.medidas.copa_m, alto: e[5] / rv.escala[1] * rv.medidas.altura_m }; };
    const a = dib(conP), b = dib(sinP); cx.D.copas_param = undefined;
    diag.copaVariante = { conParam: { copa: +a.copa.toFixed(3), quiere: fila[1], alto: +a.alto.toFixed(3), quiereAlto: fila[0] }, sinParam: { copa: +b.copa.toFixed(3), quiere: 4.4, alto: +b.alto.toFixed(3) } };
    exige(Math.abs(a.copa - fila[1]) < 1e-3 && Math.abs(a.alto - fila[0]) < 1e-3, "O9b-0: la variante no se estira a la copa y altura de copas_param: " + JSON.stringify(diag.copaVariante.conParam));
    exige(Math.abs(b.copa - 4.4) < 1e-3 && Math.abs(b.alto - 4.2) < 1e-3, "O9b-0: sin copas_param, la variante no va a 2 × r8 medio y h: " + JSON.stringify(diag.copaVariante.sinParam));
  }
  const cajas = L._prueba.cajas();
  exige(cajas && cajas.length === 4 && cajas.every(b => b.max.y - b.min.y > 2 && b.max.x - b.min.x > 2), "las cajas de las variantes no tienen tamaño de olivo: " + JSON.stringify(cajas && cajas.map(b => [b.min, b.max])));
  for (let n = 0; n <= 160; n++) { const fx = x0 + n; fotograma(fx, -y0, [fx, 1.7, -y0]); }
  const fo = x0 + 80;
  for (let r = 230; r >= 30; r -= 5) fotograma(fo, -y0, [fo + r * 0.6, r * 0.55, -y0 + r * 0.6]);
  for (let k = 0; k < 40; k++) fotograma(fo, -y0, [fo + 18, 16, -y0 + 18]);   // quieto: que acaben lotes y fundidos
  const st = cx.window.__olivosGen();
  diag.fixture = { pasos, antesDeCapa, conCapaEnPaso: conCapa, huecos: huecos.length, dobles: dobles.length, maxEnBanda: maxBanda, malBanda: malBanda.length, maxLlamadas, maxTri, sobre: sobre.length, final: st.info, reparto: st.escalera, lejanos: L.resumen(), ms: Date.now() - t0 };
  exige(huecos.length === 0, "escalera: olivos sin dibujar (paso:olivo): " + huecos.slice(0, 8).join(", "));
  exige(malBanda.length === 0, "escalera: bandas mal pesadas o lejanos sin su ranura: " + malBanda.slice(0, 4).join(" · "));
  exige(maxBanda >= 1, "escalera: en todo el paseo ningún olivo pasó por una banda");
  exige(dobles.length === 0, "escalera: olivos en 3D y en lejanos fuera de un fundido: " + dobles.slice(0, 8).join(", "));
  exige(maxLlamadas <= 8, "escalera: " + maxLlamadas + " llamadas de olivos (tope 8)");
  exige(sobre.length === 0, "escalera: triángulos de olivos por encima del presupuesto: " + sobre.slice(0, 4).join(", "));
  exige((st.info.arboles || 0) >= 1 && st.info.niveles && st.info.niveles.E0 + st.info.niveles.E1 + st.info.niveles.E2 >= 1, "escalera: al final no hay ningún olivo en 3D: " + JSON.stringify(st.info));
  exige(G.rotulo(ol.find(c => !P.listos()[c.i]).i).lejano === true, "escalera: el rótulo de un olivo que no está en 3D no dice «lejano»");
}

console.log(JSON.stringify({ mal, diag }));

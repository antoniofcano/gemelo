// O9a (decisión 80): diagnóstico de los escalones del olivo SIN navegador. Solo mide; no cambia el constructor ni el motor.
//   1. Receta de cada escalón (E0, E1, E2, E2-VR) para olivos de prueba con semilla fija: triángulos, llamadas, tarjetas de hoja (ramitas y relleno),
//      ÁREA de tarjetas (m² en el mundo, con receta.escala), caja de la copa (de los centros de tarjeta) y medidas (altura y copa).
//   2. La VARIANTE estirada (matrizDe de 07ab) frente al PROPIO del mismo olivo: copa dibujada, área de hoja y deformación de las tarjetas.
//   3. Dónde salta el escalón paseando: Escalera.planifica REAL (el bloque [puro] de 07ab) en una rejilla de olivos a 10, 11 y 12 m, con los
//      triángulos de recetas reales, en escritorio (550 k), móvil (270 k) y gafas perfil 0 (380 k); y el alto en píxeles de un olivo de 5 m.
//   node pruebas/olivo/o9a_escalones.mjs   → una línea JSON por stdout (el resumen legible, por stderr)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const O = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "olivo", "index.js")).href);
const say = m => process.stderr.write(m + "\n");
const salida = { recetas: [], variante: [], paseo: [], pixeles: {} };

// ---- 1. la receta de cada escalón
const CASOS = [
  { nombre: "adulto1 (tipo)", e: { tipo: "adulto1", epoca: "envero", semilla: 1003 } },
  { nombre: "centenario3 (tipo)", e: { tipo: "centenario3", epoca: "envero", semilla: 7 } },
  // como lo pide el motor (07ab: tipo centenario3 con copas_param): un olivo del fixture de Hituelo (h 4,0, r8 medio 2,15 → copa_m 4,3)
  { nombre: "centenario3 medido (h 3,8, copa 4,3)", e: { tipo: "centenario3", epoca: "envero", semilla: 1003, parametros: { altura: 3.8, copa: 4.3, densidad: 0.85, falda: 0.7, relieve: 0.22, asim: 0 } } }
];
const TARJETA = { ramita: [0.3, 0.6], relleno: [1.2, 1.2] };
function mideReceta(r) {
  const [ex, ey, ez] = r.escala, o = { tri: O.triangulosNivel(r), llamadas: O.llamadasNivel(r), ramitas: 0, relleno: 0, olivas: 0, areaRamitas: 0, areaRelleno: 0, aspecto: 0 };
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const p of r.piezas) {
    if (p.rol === "olivas") { o.olivas += p.n; continue; }
    if (p.clase !== "instancias" || !TARJETA[p.geo]) continue;
    const [w, h] = TARJETA[p.geo], m = p.matrices;
    for (let i = 0; i < p.n; i++) {
      const b = i * 16;   // columnas 0 y 1 de la matriz (los ejes x e y de la tarjeta), con receta.escala
      const a = [m[b] * w * ex, m[b + 1] * w * ey, m[b + 2] * w * ez], c = [m[b + 4] * h * ex, m[b + 5] * h * ey, m[b + 6] * h * ez];
      const cr = [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]], area = Math.hypot(...cr);
      if (p.geo === "ramita") { o.ramitas++; o.areaRamitas += area; o.aspecto += (Math.hypot(...c) / h) / (Math.hypot(...a) / w); } else { o.relleno++; o.areaRelleno += area; }
      const t = [m[b + 12] * ex, m[b + 13] * ey, m[b + 14] * ez];
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], t[k]); max[k] = Math.max(max[k], t[k]); }
    }
  }
  o.aspecto = o.ramitas ? +(o.aspecto / o.ramitas).toFixed(3) : 0;
  o.caja = { ancho_x: +(max[0] - min[0]).toFixed(2), ancho_z: +(max[2] - min[2]).toFixed(2), alto: +(max[1] - min[1]).toFixed(2), y_min: +min[1].toFixed(2), y_max: +max[1].toFixed(2) };
  o.medidas = { altura_m: +r.medidas.altura_m.toFixed(2), copa_m: +r.medidas.copa_m.toFixed(2) };
  o.areaRamitas = +o.areaRamitas.toFixed(2); o.areaRelleno = +o.areaRelleno.toFixed(2);
  return o;
}
const recetaE0 = {};
for (const c of CASOS) {
  const t0 = Date.now(), r0 = O.receta(c.e); recetaE0[c.nombre] = r0;
  const fila = { caso: c.nombre, ms_E0: Date.now() - t0, escala: r0.escala.map(x => +x.toFixed(3)), niveles: {} };
  for (const k of O.NIVELES) fila.niveles[k] = mideReceta(O.aNivel(r0, k));
  salida.recetas.push(fila);
  say(c.nombre + ": " + O.NIVELES.map(k => k + " " + fila.niveles[k].tri + " tri, " + fila.niveles[k].ramitas + " ramitas, " + fila.niveles[k].areaRamitas + " m²").join(" · "));
}

// ---- 2. la variante estirada (07ab matrizDe: copa = 2 × r8 medio × FACTOR_R8, altura = h) frente al propio (copas_param: copa_m = 2 × r8 medio)
const FACTOR_R8 = 0.5;
for (const sv of [11, 23, 37, 51]) {
  const rv = O.aNivel(O.receta({ tipo: "centenario3", epoca: "envero", semilla: sv }), "E2");
  const h = 4.0, r8medio = 2.15, copaVar = Math.max(0.8, 2 * r8medio * FACTOR_R8), k = copaVar / rv.medidas.copa_m, ky = Math.max(1, h) / rv.medidas.altura_m;
  const est = Object.assign({}, rv, { escala: [rv.escala[0] * k, rv.escala[1] * ky, rv.escala[2] * k] }), m = mideReceta(est);
  salida.variante.push({ semilla: sv, copa_receta_m: +rv.medidas.copa_m.toFixed(2), altura_receta_m: +rv.medidas.altura_m.toFixed(2), k_horizontal: +k.toFixed(3), k_vertical: +ky.toFixed(3),
    copa_dibujada_m: +copaVar.toFixed(2), areaRamitas: m.areaRamitas, areaRelleno: m.areaRelleno, aspecto_tarjeta: m.aspecto, ramitas: m.ramitas, caja: m.caja });
}
const prop = salida.recetas[2].niveles.E2;
say("propio E2 (copa_m de copas_param 4,3): copa " + prop.medidas.copa_m + " m, ramitas " + prop.areaRamitas + " m², aspecto " + prop.aspecto);
salida.variante.forEach(v => say("variante " + v.semilla + " estirada a r8×0,5: copa " + v.copa_dibujada_m + " m (k " + v.k_horizontal + " × " + v.k_vertical + "), ramitas " + v.areaRamitas + " m², aspecto " + v.aspecto_tarjeta));

// ---- 3. el paseo con el reparto real
const src = fs.readFileSync(path.join(RAIZ, "apps", "web", "motor", "07ab_generados.js"), "utf8");
const puro = src.slice(src.indexOf("// [puro:inicio]"), src.indexOf("// [puro:fin]"));
const ctx = { Math, Object }; vm.createContext(ctx); vm.runInContext(puro + "\nthis.Escalera = Escalera;", ctx);
const E = ctx.Escalera;
const med = salida.recetas[2].niveles, TRI = { E0: med.E0.tri, E1: med.E1.tri, E2: med.E2.tri, E2VR: med.E2VR.tri };   // el olivo «medido» (lo que pinta el motor)
const PERFILES = [
  { n: "escritorio", tope: E.tope({ base: 550000, escala: 1, triLejanos: 2 * 5882 }), vr: null },
  { n: "móvil", tope: E.tope({ base: 550000, movil: true, escala: 1, triLejanos: 2 * 5882 }), vr: null },
  { n: "gafas perfil 0", tope: E.tope({ base: 550000, vr: { tri: 380000 }, escala: 1, triLejanos: 2 * 5882 }), vr: { tri: 380000 } }
];
const mediana = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(1); };
for (const P of PERFILES) for (const paso of [10, 11, 12]) {
  const olivos = []; let i = 0;
  for (let gx = -12; gx <= 12; gx++) for (let gy = -12; gy <= 12; gy++) olivos.push({ i: i++, x: gx * paso, y: gy * paso });
  const est = {}, niv = {}, cambios = [];
  // paseo por la calle (a media distancia entre dos filas), de x = −90 a +90 a 1,4 m/s, reparto cada 0,25 s
  for (let t = 0, x = -90; x <= 90; t += 0.25, x += 1.4 * 0.25) {
    const fx = x, fy = paso / 2, cand = olivos.map(c => ({ c, d: Math.hypot(c.x - fx, c.y - fy) })).filter(o => o.d < 160).sort((a, b) => a.d - b.d).slice(0, 120);
    const r = E.planifica(cand, est, { pres: P.tope, vr: P.vr, ahora: t, costo: (cl, n) => TRI[n], clavePropia: (c, n) => "p" + c.i + ":" + n, claveVar: c => "v" + (c.i % 4) + ":" + (P.vr ? "E2VR" : "E2") });
    const ahora = {}; r.plan.forEach(p => { ahora[p.c.i] = p.niv; });
    for (const o of cand) {
      const a = niv[o.c.i] || "lejano", b = ahora[o.c.i] || "lejano";
      if (a !== b && x > -60 && x < 60) cambios.push({ de: a, a: b, d: o.d, detras: o.c.x < fx });
      niv[o.c.i] = b;
    }
  }
  // cada paso de escalón: distancia mediana al paseante y qué parte ocurre con el olivo ya DETRÁS (x del olivo < x del paseante)
  const T = (de, a) => { const l = cambios.filter(c => c.de === de && c.a === a); return l.length ? { d: mediana(l.map(c => c.d)), detras_pct: Math.round(100 * l.filter(c => c.detras).length / l.length), n: l.length } : null; };
  const e2 = P.vr ? "E2VR" : "E2";
  const fila = { perfil: P.n, presupuesto: Math.round(P.tope), paso_m: paso,
    pasos: { lejano_a_E2: T("lejano", e2), E2_a_E1: T(e2, "E1"), E1_a_E0: T("E1", "E0"), E0_a_E1: T("E0", "E1"), E1_a_E2: T("E1", e2), E2_a_lejano: T(e2, "lejano") },
    cambios: cambios.length };
  // el reparto asentado en un punto (cuántos en cada escalón y hasta qué distancia)
  const est2 = {}, fx = 0, fy = paso / 2, cand = olivos.map(c => ({ c, d: Math.hypot(c.x - fx, c.y - fy) })).sort((a, b) => a.d - b.d).slice(0, 120);
  let r2; for (let t = 0; t < 4; t += 0.5) r2 = E.planifica(cand, est2, { pres: P.tope, vr: P.vr, ahora: t, costo: (cl, n) => TRI[n], clavePropia: (c, n) => "p" + c.i + ":" + n, claveVar: c => "v" + (c.i % 4) + ":" + e2 });
  const por = {}; r2.plan.forEach(p => { por[p.niv] = por[p.niv] || { n: 0, dmax: 0 }; por[p.niv].n++; por[p.niv].dmax = Math.max(por[p.niv].dmax, +p.d.toFixed(1)); });
  fila.asentado = por; fila.usado = Math.round(r2.usado);
  salida.paseo.push(fila);
  say(P.n + " " + paso + " m: " + JSON.stringify(fila.asentado) + " | " + Object.entries(fila.pasos).map(([k, v]) => k + " " + (v ? v.d + " m (" + v.detras_pct + " % detrás)" : "—")).join(", "));
}
salida.triangulos_usados = TRI;

// ---- 4. alto en pantalla de un olivo de 5 m: escritorio 1080 p con la cámara del motor (fov vertical 42°, 03_escena.js); gafas: fov vertical
// por ojo y alto del búfer (Quest 3: ≈ 96° y 2208 px de pantalla; el motor pide setFramebufferScaleFactor(0,9) sobre el búfer recomendado) [NO VERIFICADO en aparato]
const alto = (H, d, fov, px) => Math.round(H / (2 * d * Math.tan(fov * Math.PI / 360)) * px);
for (const d of [3, 5, 8, 10, 11, 12, 15.6, 20, 25, 30, 45, 60]) salida.pixeles[d] = { escritorio_1080p: alto(5, d, 42, 1080), quest3_aprox: alto(5, d, 96, 0.9 * 1760) };
say("px de alto (olivo de 5 m): " + JSON.stringify(salida.pixeles));
console.log(JSON.stringify(salida));

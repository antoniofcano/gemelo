// O6: medir el HORNEADO de recetas de olivos generados POR TESELA (ADR-0017, contratos/olivo-generado.md). Solo mide: no toca el motor ni la caché
// y no escribe ningún formato definitivo; el «cuantizado» de aquí es una serialización de prueba (con cabeceras reales por pieza) para saber cuánto
// pesaría un `.bin` por tesela. Decide entre (A) hornear en el servidor y servir junto a la tesela, o (B) calcular en el navegador.
//
//   GEMELO_DATOS=<indice.json o su carpeta> node pruebas/olivo/hornea_tesela.mjs [opciones]
//     --tesela kx_ky     (repetible) una tesela concreta; sin ninguna, las dos de siempre: la más poblada y la mediana de las que tienen olivos
//     --muestra N        N olivos al azar de TODA la finca (semilla fija) para extrapolar a las teselas enteras; con --tesela, además
//     --epoca envero     época de las recetas (por defecto la del motor: envero)
//     --brotli 11        calidad de brotli (0-11)
//     --corriente        además, UNA corriente brotli por tesela y nivel (acceso aleatorio perdido); por olivo se hace siempre
//     --niveles E0,E1,E2,E2VR
//     --visita 150,250   cuántos olivos quedan a menos de R m de un paseo recto de 500 m (cuenta, no hornea): el paseo más denso y la mediana, sobre
//                        todos los de salida cada 50 m en 4 rumbos; con --anillos a,b además cuántos caen en cada banda (a, b, R) para repartir niveles
//     --epocas           compara las recetas de un olivo entre épocas: qué piezas cambian y cuántos bytes (para guardar la época aparte)
//   Escribe una línea JSON por stdout (y el resumen legible por stderr). Entrada del generador como el motor (07ab_generados.js): tipo
//   «centenario3», parametrosDeCopa(copas_param, factorR8 = 1 como FACTOR_R8_GEN del motor, decisión 81), semillaDeCopa(copas_id, copas_semilla) y la época dada.
//
// Cuantización (todo medido contra el original; las pérdidas máximas salen en el JSON como «perdida»):
//   position  Int16 normalizado a la caja de la pieza (por eje)            normal  Int8 (×127)           uv, aHueco, aMuerta  Uint16/Uint8 en su rango
//   indice    Uint16 si la pieza tiene ≤ 65 535 vértices, si no Uint32     brote   Uint8
//   matrices  traslación Int16 en la caja de la pieza; parte lineal 3×3 Int16 con la escala máxima de la pieza; sin la última fila (0,0,0,1)
//   colores   Uint8                                                         nodo, padre  Uint16 si caben, si no Int32
//   puntos (E2)  posiciones Int16 en su caja, colores Uint8
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const O = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "olivo", "index.js")).href);

// ---- argumentos
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const todas = k => args.reduce((a, x, i) => (x === k ? a.concat(args[i + 1]) : a), []);
const EPOCA = val("--epoca", "envero"), CALIDAD = Number(val("--brotli", 11)), NIV = val("--niveles", "E0,E1,E2,E2VR").split(",");
const MUESTRA = Number(val("--muestra", 0)), CORRIENTE = args.includes("--corriente"), FACTOR_R8 = 1;   // el FACTOR_R8_GEN del motor (01_datos.js, decisión 81)
let ruta = process.env.GEMELO_DATOS; if (!ruta) { console.error("Falta GEMELO_DATOS (indice.json o su carpeta, fuera del repo)"); process.exit(2); }
if (fs.statSync(ruta).isDirectory()) ruta = path.join(ruta, "indice.json");
const D = JSON.parse(fs.readFileSync(ruta, "utf8"));

// ---- olivos por tesela (caja v = [x0, y0, x1, y1] relativa a centro_utm; como el exportador)
const T = D.teselas, claves = Object.keys(T), porTesela = Object.fromEntries(claves.map(k => [k, []]));
D.copas.forEach((c, i) => { for (const k of claves) { const v = T[k].v; if (c[0] >= v[0] && c[0] < v[2] && c[1] >= v[1] && c[1] < v[3]) { porTesela[k].push(i); break; } } });
const conOlivos = claves.filter(k => porTesela[k].length).sort((a, b) => porTesela[b].length - porTesela[a].length || (a < b ? -1 : 1));
const mediana = conOlivos[Math.floor(conOlivos.length / 2)];
const eleg = todas("--tesela");
const AMEDIR = eleg.length ? eleg : (MUESTRA ? [] : [conOlivos[0], mediana]);

function entradaDe(i) {
  const raw = D.copas[i], s = O.semillaDeCopa(raw, D.copas_id ? D.copas_id[i] : undefined, D.centro_utm, D.copas_semilla ? D.copas_semilla[i] : undefined) || { semilla: i + 1 };
  const p = O.parametrosDeCopa(raw, D.copas_param ? D.copas_param[i] : null, "centenario3", { factorR8: FACTOR_R8 });
  return { tipo: p.tipo, parametros: p.parametros, epoca: EPOCA, semilla: s.semilla };
}

// ---- cuantización
const GEOS = O.geos(), radioGeo = g => { const c = GEOS[g] && GEOS[g].caja; return c ? Math.hypot(Math.max(Math.abs(c.min.x), Math.abs(c.max.x)), Math.max(Math.abs(c.min.y), Math.abs(c.max.y)), Math.max(Math.abs(c.min.z), Math.abs(c.max.z))) : 1; };
const MATID = {}, ID = (tabla, n) => (n in tabla ? tabla[n] : (tabla[n] = Object.keys(tabla).length));
const CLASES = {}, GEOID = {};
const nuevaPerdida = () => ({ pos_mm: 0, normal_grados: 0, uv: 0, hueco_muerta: 0, color: 0, traslacion_mm: 0, lineal_mm_en_geometria: 0 });

class Escribe {   // acumula trozos y los bytes por categoría
  constructor() { this.trozos = []; this.cat = {}; }
  pon(cat, buf) { buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength); this.trozos.push(buf); this.cat[cat] = (this.cat[cat] || 0) + buf.length; }
  buf() { return Buffer.concat(this.trozos); }
}
const f32 = (...v) => Buffer.from(new Float32Array(v).buffer);
function caja3(a, paso, off) { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = off; i + 2 < a.length + 0; i += paso) for (let e = 0; e < 3; e++) { const x = a[i + e]; if (x < mn[e]) mn[e] = x; if (x > mx[e]) mx[e] = x; } return [mn, mx]; }
function cuantiza3(a, paso, off, mn, mx, perd) {   // Int16 normalizado por eje; devuelve Int16Array (n·3) y anota el error máximo (3D, en mm)
  const n = Math.floor((a.length - off) / paso), q = new Int16Array(n * 3), s = [0, 1, 2].map(e => (mx[e] - mn[e]) || 1);
  let m = 0;
  for (let i = 0; i < n; i++) { let d2 = 0; for (let e = 0; e < 3; e++) { const x = a[off + i * paso + e], u = Math.round((x - mn[e]) / s[e] * 65535) - 32768; q[i * 3 + e] = u; const y = (u + 32768) / 65535 * s[e] + mn[e]; d2 += (y - x) * (y - x); } if (d2 > m) m = d2; }
  perd.v = Math.max(perd.v || 0, Math.sqrt(m) * 1000); return q;
}
function unitario(a, bits, perd, clave) {   // rango propio → Uint8/Uint16; devuelve {q, mn, mx}
  let mn = Infinity, mx = -Infinity; for (let i = 0; i < a.length; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; }
  if (!a.length) { mn = mx = 0; } const L = (1 << bits) - 1, s = (mx - mn) || 1, q = bits === 8 ? new Uint8Array(a.length) : new Uint16Array(a.length); let m = 0;
  for (let i = 0; i < a.length; i++) { const u = Math.round((a[i] - mn) / s * L); q[i] = u; const e = Math.abs(u / L * s + mn - a[i]); if (e > m) m = e; }
  perd[clave] = Math.max(perd[clave] || 0, m); return { q, mn, mx };
}
const enteros = (a, max) => (max < 65536 ? Uint16Array.from(a) : Int32Array.from(a));   // Uint16 solo si no hay negativos; los −1 de padre llevan +1
function maxDe(a) { let m = -1; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }

/** Serializa una receta (cualquier nivel) y devuelve {buf, cat, perdida} */
function serializa(r) {
  const w = new Escribe(), perd = nuevaPerdida();
  w.pon("cabecera", f32(...r.escala, ...r.corte, r.medidas.altura_m, r.medidas.copa_m, r.medidas.pies));
  w.pon("cabecera", Uint32Array.from([r.piezas.length, ...Object.values(r.cuenta)]));
  if (r.padre) { const m = maxDe(r.padre) + 1; w.pon("nodo_padre", enteros(Int32Array.from(r.padre, x => x + 1), m)); }   // +1: el −1 de las raíces pasa a 0
  for (const p of r.piezas) {
    w.pon("cabecera", Uint8Array.from([ID(CLASES, p.clase), ID(MATID, p.mat), ID(GEOID, p.geo), (p.sombra[0] ? 1 : 0) | (p.sombra[1] ? 2 : 0)]));
    w.pon("cabecera", f32(...(p.pos || [0, 0, 0]), ...(p.rot || [0, 0, 0, 1]), ...(p.esc || [1, 1, 1])));
    if (p.atrib) {   // malla propia
      const P = p.atrib.position, [mn, mx] = caja3(P, 3, 0), pp = {}; w.pon("cabecera", f32(...mn, ...mx));
      w.pon("position", cuantiza3(P, 3, 0, mn, mx, pp)); perd.pos_mm = Math.max(perd.pos_mm, pp.v);
      const N = p.atrib.normal, nq = new Int8Array(N.length); let ma = 0;
      for (let i = 0; i < N.length; i += 3) { const x = N[i], y = N[i + 1], z = N[i + 2];
        const a = Math.round(x * 127), b = Math.round(y * 127), c = Math.round(z * 127); nq[i] = a; nq[i + 1] = b; nq[i + 2] = c;
        const l = Math.hypot(a, b, c) * Math.hypot(x, y, z) || 1, cos = Math.min(1, (a * x + b * y + c * z) / l); const g = Math.acos(cos) * 180 / Math.PI; if (g > ma) ma = g; }
      w.pon("normal", nq); perd.normal_grados = Math.max(perd.normal_grados, ma);
      if (p.atrib.uv) { const u = unitario(p.atrib.uv, 16, perd, "uv"); w.pon("cabecera", f32(u.mn, u.mx)); w.pon("uv", u.q); }
      for (const k of ["aHueco", "aMuerta"]) if (p.atrib[k]) { const u = unitario(p.atrib[k], 8, perd, "hueco_muerta"); w.pon("cabecera", f32(u.mn, u.mx)); w.pon("hueco_muerta", u.q); }
      const nv = P.length / 3; w.pon("indice", nv <= 65535 ? Uint16Array.from(p.indice) : p.indice);
      if (p.brote) w.pon("otros", p.brote);
    } else if (p.clase === "instancias" && p.n) {
      const M = p.matrices, n = p.n, [mn, mx] = caja3(M, 16, 12), s = [0, 1, 2].map(e => (mx[e] - mn[e]) || 1);
      let sl = 0; for (let i = 0; i < n; i++) for (const e of [0, 1, 2, 4, 5, 6, 8, 9, 10]) sl = Math.max(sl, Math.abs(M[i * 16 + e]));
      const qt = new Int16Array(n * 3), ql = new Int16Array(n * 9), rg = radioGeo(p.geo); let mt = 0, ml = 0;
      for (let i = 0; i < n; i++) {
        for (let e = 0; e < 3; e++) { const x = M[i * 16 + 12 + e], u = Math.round((x - mn[e]) / s[e] * 65535) - 32768; qt[i * 3 + e] = u; mt = Math.max(mt, Math.abs((u + 32768) / 65535 * s[e] + mn[e] - x)); }
        let f2 = 0; [0, 1, 2, 4, 5, 6, 8, 9, 10].forEach((e, j) => { const x = M[i * 16 + e], u = Math.round(x / (sl || 1) * 32767); ql[i * 9 + j] = u; const d = u / 32767 * sl - x; f2 += d * d; });
        ml = Math.max(ml, Math.sqrt(f2) * rg);
      }
      w.pon("cabecera", f32(...mn, ...mx, sl)); w.pon("matrices", qt); w.pon("matrices", ql);
      perd.traslacion_mm = Math.max(perd.traslacion_mm, mt * 1000); perd.lineal_mm_en_geometria = Math.max(perd.lineal_mm_en_geometria, ml * 1000);
      if (p.colores) { const c = unitario(p.colores, 8, perd, "color"); w.pon("cabecera", f32(c.mn, c.mx)); w.pon("colores", c.q); }
      if (p.nodo) w.pon("nodo_padre", enteros(p.nodo, maxDe(p.nodo) + 1));
    } else if (p.clase === "puntos" && p.n) {
      const [mn, mx] = caja3(p.posiciones, 3, 0), pp = {}; w.pon("cabecera", f32(...mn, ...mx)); w.pon("matrices", cuantiza3(p.posiciones, 3, 0, mn, mx, pp));
      perd.traslacion_mm = Math.max(perd.traslacion_mm, pp.v);
      const c = unitario(p.colores, 8, perd, "color"); w.pon("cabecera", f32(c.mn, c.mx)); w.pon("colores", c.q);
      if (p.nodo) w.pon("nodo_padre", enteros(p.nodo, maxDe(p.nodo) + 1));
    }
  }
  return { buf: w.buf(), cat: w.cat, perd };
}

const crudo = r => O.bytesReceta(r);
const brotli = (b, q) => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: q, [zlib.constants.BROTLI_PARAM_LGWIN]: 24, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } });
const sumaCat = (a, b) => { for (const k in b) a[k] = (a[k] || 0) + b[k]; };
const maxPerd = (a, b) => { for (const k in b) a[k] = Math.max(a[k] || 0, b[k]); };
const MB = x => +(x / 1048576).toFixed(3), r2 = x => +x.toFixed(2);

/** Hornea una lista de olivos (índices de copas); devuelve el resumen por nivel. `conservaBuf`: guarda los buffers para la corriente única */
function hornea(lista, conservaBuf) {
  const R = {}; for (const k of NIV) R[k] = { olivos: 0, crudo: 0, cuantizado: 0, brotli_por_olivo: 0, cat: {}, perdida: nuevaPerdida(), ms_nivel: 0, ms_cuantiza: 0, ms_brotli: 0, bufs: [], por_olivo: [] };
  let msE0 = 0; const tr = { E0: 0 };
  const tIni = performance.now(); let hecho = 0;
  for (const i of lista) {
    if (hecho && hecho % 10 === 0) console.error(`  ${hecho}/${lista.length} olivos, ${Math.round((performance.now() - tIni) / 1000)} s, quedan ≈ ${Math.round((performance.now() - tIni) / hecho * (lista.length - hecho) / 1000)} s`);
    hecho++;
    let t = performance.now(); const r0 = O.receta(entradaDe(i)); const e0 = performance.now() - t; msE0 += e0;
    for (const k of NIV) {
      t = performance.now(); const r = k === "E0" ? r0 : O.aNivel(r0, k); const dn = performance.now() - t;
      t = performance.now(); const s = serializa(r); const dq = performance.now() - t;
      t = performance.now(); const b = brotli(s.buf, CALIDAD); const db = performance.now() - t;
      const x = R[k]; x.olivos++; x.crudo += crudo(r); x.cuantizado += s.buf.length; x.brotli_por_olivo += b.length; x.ms_nivel += dn; x.ms_cuantiza += dq; x.ms_brotli += db;
      sumaCat(x.cat, s.cat); maxPerd(x.perdida, s.perd); x.por_olivo.push([crudo(r), s.buf.length, b.length]);
      if (conservaBuf) x.bufs.push(s.buf);
    }
  }
  return { R, msE0 };
}
const resume = (R, msE0, n) => {
  const o = {};
  for (const k of Object.keys(R)) {
    const x = R[k];
    o[k] = { olivos: x.olivos, crudo_MB: MB(x.crudo), cuantizado_MB: MB(x.cuantizado), brotli_por_olivo_MB: MB(x.brotli_por_olivo),
      bytes_por_olivo: { crudo: Math.round(x.crudo / n), cuantizado: Math.round(x.cuantizado / n), brotli: Math.round(x.brotli_por_olivo / n) },
      ms_por_olivo: { aNivel: r2(x.ms_nivel / n), cuantizar: r2(x.ms_cuantiza / n), brotli: r2(x.ms_brotli / n) },
      cuantizado_por_categoria_MB: Object.fromEntries(Object.entries(x.cat).map(([c, b]) => [c, MB(b)])),
      perdida: Object.fromEntries(Object.entries(x.perdida).map(([c, v]) => [c, +v.toPrecision(3)])) };
  }
  return o;
};

if (args.includes("--visita")) {   // solo cuenta; no genera nada
  const RS = val("--visita", "150,250").split(",").map(Number), pts = D.copas.map(c => [c[0], c[1]]), res = {};
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const bandas = (val("--anillos", "30,80") || "").split(",").map(Number), segs = [];
  for (let x = x0; x <= x1; x += 50) for (let y = y0; y <= y1; y += 50) for (const a of [0, 45, 90, 135]) segs.push([x, y, Math.cos(a * Math.PI / 180) * 500, Math.sin(a * Math.PI / 180) * 500]);
  const dist = (px, py, s) => { const t = Math.max(0, Math.min(1, ((px - s[0]) * s[2] + (py - s[1]) * s[3]) / (s[2] * s[2] + s[3] * s[3]))); return Math.hypot(px - s[0] - t * s[2], py - s[1] - t * s[3]); };
  const cuentas = segs.map(sg => { const b = new Array(bandas.length + 1 + RS.length).fill(0); for (const [x, y] of pts) { const d = dist(x, y, sg); for (let j = 0; j < bandas.length; j++) if (d < bandas[j]) { b[j]++; } for (let j = 0; j < RS.length; j++) if (d < RS[j]) b[bandas.length + 1 + j]++; } return b; });
  const R = RS.map((r, j) => { const col = cuentas.map(c => c[bandas.length + 1 + j]).filter(n => n > 0).sort((a, b) => a - b); return { radio_m: r, paseos_con_olivos: col.length, mediana: col[col.length >> 1], p90: col[Math.floor(col.length * 0.9)], maximo: col[col.length - 1] }; });
  // el paseo más denso para el mayor radio: cuántos hay en cada banda
  const jm = RS.length - 1, mejor = cuentas.reduce((a, c) => (c[bandas.length + 1 + jm] > a[bandas.length + 1 + jm] ? c : a));
  const med = cuentas.filter(c => c[bandas.length + 1 + jm] > 0).sort((a, b) => a[bandas.length + 1 + jm] - b[bandas.length + 1 + jm]); const mediano = med[med.length >> 1];
  console.log(JSON.stringify({ paseo_m: 500, salidas: segs.length, bandas_m: bandas, radios: R, mas_denso_acumulado_por_banda_y_radios: mejor, mediano_acumulado_por_banda_y_radios: mediano }));
  process.exit(0);
}
if (args.includes("--epocas")) {
  const i = (porTesela[mediana] || [0])[0], r = {}, E = ["reposo", "boton", "flor", "cuajado", "verde", "envero", "madura"];
  for (const e of E) r[e] = O.receta(Object.assign(entradaDe(i), { epoca: e }));
  const base = r.envero, sal = {};
  for (const e of E) { const x = r[e], dif = []; let tot = 0, bytes = 0;
    x.piezas.forEach((p, j) => { const q = base.piezas[j]; const mismo = q && p.n === q.n && ["matrices", "colores", "posiciones", "indice"].every(k => !p[k] || !q[k] || Buffer.compare(Buffer.from(p[k].buffer, p[k].byteOffset, p[k].byteLength), Buffer.from(q[k].buffer, q[k].byteOffset, q[k].byteLength)) === 0) && (!p.atrib || (q.atrib && Buffer.compare(Buffer.from(p.atrib.position.buffer), Buffer.from(q.atrib.position.buffer)) === 0));
      if (!mismo) { dif.push(p.mat + ":" + p.clase + ":n" + p.n + "/" + (q ? q.n : "-")); } tot++; });
    sal[e] = { piezas: x.piezas.length, piezas_distintas_de_envero: dif, bytes_receta: O.bytesReceta(x), huella: (await O.huella(x)).slice(0, 12) }; }
  console.log(JSON.stringify({ olivo: i, epocas: sal })); process.exit(0);
}
const t00 = performance.now(), salida = { generador: O.GEN_VERSION, epoca: EPOCA, factorR8: FACTOR_R8, brotli_calidad: CALIDAD, node: process.version,
  equipo: { cpus: os.cpus().length, modelo: os.cpus()[0].model.trim(), carga_1min: +os.loadavg()[0].toFixed(2) }, teselas_con_olivos: conOlivos.length, teselas: claves.length, olivos_total: D.copas.length, tesela: {}, muestra: null };

for (const k of AMEDIR) {
  const lista = porTesela[k]; if (!lista) { console.error("tesela desconocida: " + k); process.exit(2); }
  console.error(`tesela ${k}: ${lista.length} olivos…`);
  const t0 = performance.now(), { R, msE0 } = hornea(lista, CORRIENTE), res = resume(R, msE0, lista.length);
  res.ms_por_olivo_E0 = r2(msE0 / lista.length); res.ms_total_tesela_ms = Math.round(performance.now() - t0);
  if (CORRIENTE) for (const nv of NIV) { const t = performance.now(), b = brotli(Buffer.concat(R[nv].bufs), CALIDAD); res[nv].corriente_unica_MB = MB(b.length); res[nv].corriente_ms = Math.round(performance.now() - t); }
  salida.tesela[k] = { olivos: lista.length, niveles: res };
}

if (MUESTRA) {   // N olivos al azar de toda la finca (mulberry32, semilla fija) → medias, error típico y extrapolación a todos
  let s = 20261029; const az = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const todos = conOlivos.flatMap(k => porTesela[k]), elegidos = new Set(); while (elegidos.size < Math.min(MUESTRA, todos.length)) elegidos.add(todos[Math.floor(az() * todos.length)]);
  console.error(`muestra de ${elegidos.size} olivos de ${todos.length}…`);
  const t0 = performance.now(), { R, msE0 } = hornea([...elegidos], false), n = elegidos.size, res = resume(R, msE0, n);
  const N = D.copas.length, ext = {};
  for (const k of NIV) {
    const f = j => { const v = R[k].por_olivo.map(a => a[j]), m = v.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return { media: Math.round(m), sd: Math.round(sd), total_MB: MB(m * N), error_tipico_total_MB: MB(sd / Math.sqrt(n) * N) }; };
    ext[k] = { crudo: f(0), cuantizado: f(1), brotli_por_olivo: f(2) };
  }
  const msOlivo = msE0 / n; salida.muestra = { n, olivos_finca: N, niveles: res, ms_por_olivo_E0: r2(msOlivo), extrapolacion: ext,
    tiempo_total_estimado_s: { solo_E0: Math.round(msOlivo * N / 1000), los_cuatro_niveles_con_cuantizar_y_brotli: Math.round((msOlivo + NIV.reduce((a, k) => a + (R[k].ms_nivel + R[k].ms_cuantiza + R[k].ms_brotli) / n, 0)) * N / 1000) }, ms_medidas: Math.round(performance.now() - t0) };
}
salida.total_s = Math.round((performance.now() - t00) / 1000);
console.log(JSON.stringify(salida));

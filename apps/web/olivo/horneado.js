// Receta horneada, formato versión 1 (contratos/olivo-horneado.md, ADR-0018): codifica una receta de olivo (arrays tipados, sin THREE) a bytes
// cuantizados y la decodifica a la receta de siempre. Módulo ES SIN DOM y sin dependencias (TextEncoder, Web Crypto): lo usan el hornero (Node) y el
// motor (navegador, trabajador). La compresión brotli NO está aquí (es de Node: horneado_node.js); en el navegador la hace Content-Encoding.
//
//   codifica(receta, {nivel, clave, gen_version, cache_version}) → Uint8Array       leeCabecera(bytes) → cabecera (sin decodificar los arrays)
//   decodifica(bytes) → {cabecera, receta}         huellaBytes(bytes) → Promise<hex de 32>        verificaHuella(bytes, huella) → Promise<boolean>
//   perdida(original, decodificada, {radios}) → pérdidas máximas        igualEstructura(a, b) → [] o lo que difiere        TOPES
//   codificaManifiestoTesela / decodificaManifiestoTesela: el binario de 68 B por olivo (propios horneados)
//
// Lo que cambia respecto a la receta calculada son SOLO los flotantes (cuantización con pérdida acotada, TOPES); los enteros (índices, nodo, padre, brote,
// recuentos) y los metadatos salen idénticos. Los índices salen siempre como Uint32Array (como los da el generador), los nodos y el padre como Int32Array.
if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) throw new Error("horneado: el formato es little-endian y este aparato no lo es");

export const FORMATO = 1;
export const MAGIA = "OLVH", MAGIA_TESELA = "OLVT";
/** Pérdidas máximas admitidas (las medidas en O6, MEDIDAS.md); uv, hueco/muerta y color además están acotados por la mitad del paso: rango/131070, rango/510, rango/510 */
export const TOPES = { pos_mm: 0.11, traslacion_mm: 0.11, normal_grados: 0.39, color: 0.0011, lineal_mm_en_geometria: 0.06 };

const enc = new TextEncoder(), dec = new TextDecoder();
const TA = { Int8: Int8Array, Uint8: Uint8Array, Int16: Int16Array, Uint16: Uint16Array, Int32: Int32Array, Uint32: Uint32Array, Float32: Float32Array };
const ATRIB = ["position", "normal", "uv", "aHueco", "aMuerta"];
const ARR_PIEZA = ["indice", "matrices", "colores", "nodo", "posiciones", "brote"];   // además de `atrib`
const LINEAL = [0, 1, 2, 4, 5, 6, 8, 9, 10];   // parte lineal 3×3 de una matriz de 16 (por columnas); 12 valores por instancia = 3 de traslación + 9
const f32 = Math.fround;

// ---------- escritura
function Salida() {
  const trozos = []; let tam = 0;
  return {
    pon(ta) {   // alineado a 4 bytes
      const off = tam, u = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength); trozos.push(u); tam += u.length;
      const pad = (4 - (tam & 3)) & 3; if (pad) { trozos.push(new Uint8Array(pad)); tam += pad; }
      return off;
    },
    get tam() { return tam; },
    junta() { const r = new Uint8Array(tam); let o = 0; for (const t of trozos) { r.set(t, o); o += t.length; } return r; },
  };
}
const rangoDe = a => { let mn = Infinity, mx = -Infinity; for (let i = 0; i < a.length; i++) { const x = a[i]; if (x < mn) mn = x; if (x > mx) mx = x; } return a.length ? [mn, mx] : [0, 0]; };
const cajaDe = (a, paso, off, n) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < n; k++) for (let e = 0; e < 3; e++) { const x = a[off + k * paso + e]; if (x < mn[e]) mn[e] = x; if (x > mx[e]) mx[e] = x; }
  return n ? [mn, mx] : [[0, 0, 0], [0, 0, 0]];
};
const ancho = (mn, mx) => (mx - mn) || 1;

/** a: Float32Array con n puntos de 3 valores a `paso` y desde `off`; Int16 por eje sobre la caja */
function cuantizaCaja(a, paso, off, n, [mn, mx]) {
  const q = new Int16Array(n * 3);
  for (let k = 0; k < n; k++) for (let e = 0; e < 3; e++) q[k * 3 + e] = Math.round((a[off + k * paso + e] - mn[e]) / ancho(mn[e], mx[e]) * 65535) - 32768;
  return q;
}
function cuantizaRango(a, bits, [mn, mx]) {
  const L = (1 << bits) - 1, s = ancho(mn, mx), q = bits === 8 ? new Uint8Array(a.length) : new Uint16Array(a.length);
  for (let i = 0; i < a.length; i++) q[i] = Math.round((a[i] - mn) / s * L);
  return q;
}
function enteros(a, sesgo) {   // Uint16 si caben (con el sesgo, que sube el −1 del padre a 0), si no Int32 sin sesgo
  const [mn, mx] = rangoDe(a);
  if (mn + sesgo >= 0 && mx + sesgo <= 65535) { const q = new Uint16Array(a.length); for (let i = 0; i < a.length; i++) q[i] = a[i] + sesgo; return { q, tipo: "Uint16", sesgo }; }
  return { q: Int32Array.from(a), tipo: "Int32", sesgo: 0 };
}

/**
 * @param receta  la receta de contratos/olivo-generado.md §2 (cualquier nivel)
 * @param o { nivel, clave, gen_version, cache_version }  `clave` = claveReceta(receta.entrada, nivel); las versiones, las del módulo que la calculó
 * @returns Uint8Array con el formato de contratos/olivo-horneado.md §1 (sin comprimir)
 */
export function codifica(receta, o) {
  if (!o || !o.nivel || !o.clave || !o.gen_version || o.cache_version === undefined) throw new Error("codifica: faltan nivel, clave, gen_version o cache_version");
  const S = Salida(), arr = (nombre, ta, tipo, extra) => Object.assign({ nombre, tipo, longitud: ta.length, offset: S.pon(ta) }, extra);
  const meta = {}; let padre = null;
  for (const k of Object.keys(receta)) {
    const v = receta[k];
    if (k === "piezas") continue;
    if (k === "padre") { if (v) { const e = enteros(v, 1); padre = arr("padre", e.q, e.tipo, { cuant: "entero", sesgo: e.sesgo }); } continue; }
    if (ArrayBuffer.isView(v)) throw new Error("codifica: array tipado de la receta sin formato: " + k);
    meta[k] = v;
  }
  const piezas = receta.piezas.map((p, ip) => {
    const campos = {}, arrays = [];
    for (const k of Object.keys(p)) {
      const v = p[k];
      if (k === "atrib") continue;
      if (ARR_PIEZA.includes(k)) { if (v !== null && v !== undefined) continue; }
      else if (ArrayBuffer.isView(v)) throw new Error("codifica: pieza " + ip + ": array tipado sin formato: " + k);
      if (v !== undefined) campos[k] = v;
    }
    if (p.atrib) {
      for (const k of Object.keys(p.atrib)) if (!ATRIB.includes(k)) throw new Error("codifica: pieza " + ip + ": atributo sin formato: " + k);
      for (const k of ATRIB) {
        const a = p.atrib[k]; if (!a) continue;
        if (k === "position") { const n = a.length / 3, caja = cajaDe(a, 3, 0, n); arrays.push(arr("atrib.position", cuantizaCaja(a, 3, 0, n, caja), "Int16", { cuant: "caja16", caja })); }
        else if (k === "normal") { const q = new Int8Array(a.length); for (let i = 0; i < a.length; i++) q[i] = Math.round(a[i] * 127); arrays.push(arr("atrib.normal", q, "Int8", { cuant: "normal8" })); }
        else { const bits = k === "uv" ? 16 : 8, rango = rangoDe(a); arrays.push(arr("atrib." + k, cuantizaRango(a, bits, rango), bits === 16 ? "Uint16" : "Uint8", { cuant: bits === 16 ? "rango16" : "rango8", rango })); }
      }
    }
    if (p.indice) { const nv = p.atrib ? p.atrib.position.length / 3 : 0; arrays.push(arr("indice", nv <= 65535 ? Uint16Array.from(p.indice) : Uint32Array.from(p.indice), nv <= 65535 ? "Uint16" : "Uint32", { cuant: "indice" })); }
    if (p.matrices) {
      const M = p.matrices, n = M.length / 16;
      if (!Number.isInteger(n)) throw new Error("codifica: pieza " + ip + ": matrices no es múltiplo de 16");
      for (let i = 0; i < n; i++) if (M[i * 16 + 3] !== 0 || M[i * 16 + 7] !== 0 || M[i * 16 + 11] !== 0 || M[i * 16 + 15] !== 1) throw new Error("codifica: pieza " + ip + ": la última fila de la matriz " + i + " no es (0,0,0,1)");
      const caja = cajaDe(M, 16, 12, n); let sl = 0;
      for (let i = 0; i < n; i++) for (const e of LINEAL) sl = Math.max(sl, Math.abs(M[i * 16 + e]));
      sl = sl || 1;
      const ql = new Int16Array(n * 9);
      for (let i = 0; i < n; i++) LINEAL.forEach((e, j) => { ql[i * 9 + j] = Math.round(M[i * 16 + e] / sl * 32767); });
      arrays.push(arr("matrices.traslacion", cuantizaCaja(M, 16, 12, n, caja), "Int16", { cuant: "caja16", caja }));
      arrays.push(arr("matrices.lineal", ql, "Int16", { cuant: "lineal16", escala: sl }));
    }
    if (p.colores) { const rango = rangoDe(p.colores); arrays.push(arr("colores", cuantizaRango(p.colores, 8, rango), "Uint8", { cuant: "rango8", rango })); }
    if (p.nodo) { const e = enteros(p.nodo, 0); arrays.push(arr("nodo", e.q, e.tipo, { cuant: "entero", sesgo: e.sesgo })); }
    if (p.posiciones) { const n = p.posiciones.length / 3, caja = cajaDe(p.posiciones, 3, 0, n); arrays.push(arr("posiciones", cuantizaCaja(p.posiciones, 3, 0, n, caja), "Int16", { cuant: "caja16", caja })); }
    if (p.brote) arrays.push(arr("brote", Uint8Array.from(p.brote), "Uint8", { cuant: "crudo" }));
    return { campos, arrays };
  });
  const cab = { formato: FORMATO, gen_version: o.gen_version, cache_version: o.cache_version, nivel: o.nivel, epoca: (receta.entrada && receta.entrada.epoca) || null, clave: o.clave, receta: meta, padre, piezas };
  let json = enc.encode(JSON.stringify(cab));
  const pad = (4 - (json.length & 3)) & 3;
  if (pad) { const j = new Uint8Array(json.length + pad).fill(0x20); j.set(json); json = j; }   // espacios: JSON válido; los datos empiezan alineados a 4
  const datos = S.junta(), r = new Uint8Array(16 + json.length + datos.length), dv = new DataView(r.buffer);
  r.set(enc.encode(MAGIA), 0); dv.setUint16(4, FORMATO, true); dv.setUint16(6, 0, true); dv.setUint32(8, json.length, true); dv.setUint32(12, datos.length, true);
  r.set(json, 16); r.set(datos, 16 + json.length);
  return r;
}

// ---------- lectura
function abre(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 16) throw new Error("horneado: demasiado corto");
  if (dec.decode(bytes.subarray(0, 4)) !== MAGIA) throw new Error("horneado: no es una receta horneada (magia)");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), formato = dv.getUint16(4, true), nj = dv.getUint32(8, true), nd = dv.getUint32(12, true);
  if (formato !== FORMATO) throw new Error("horneado: versión de formato " + formato + " (este código lee la " + FORMATO + ")");
  if (nj % 4 || 16 + nj + nd !== bytes.length) throw new Error("horneado: longitudes incoherentes");
  return { cab: JSON.parse(dec.decode(bytes.subarray(16, 16 + nj))), datos: bytes.subarray(16 + nj), nd };
}
/** La cabecera (formato, gen_version, cache_version, nivel, epoca, clave) sin decodificar los arrays: para comprobar la clave antes de gastar CPU */
export function leeCabecera(bytes) {
  const { cab } = abre(bytes);
  return { formato: cab.formato, gen_version: cab.gen_version, cache_version: cab.cache_version, nivel: cab.nivel, epoca: cab.epoca, clave: cab.clave };
}
function lee(datos, nd, e) {
  const T = TA[e.tipo]; if (!T) throw new Error("horneado: tipo desconocido " + e.tipo);
  const b = e.longitud * T.BYTES_PER_ELEMENT;
  if (!Number.isInteger(e.offset) || e.offset % 4 || e.offset < 0 || e.offset + b > nd) throw new Error("horneado: array fuera de los datos: " + e.nombre);
  const c = datos.slice(e.offset, e.offset + b);   // copia alineada
  return new T(c.buffer, 0, e.longitud);
}
function decuantiza(q, e) {
  const n = q.length;
  switch (e.cuant) {
    case "caja16": { const [mn, mx] = e.caja, s = [0, 1, 2].map(i => ancho(mn[i], mx[i])), r = new Float32Array(n); for (let i = 0; i < n; i++) { const c = i % 3; r[i] = (q[i] + 32768) / 65535 * s[c] + mn[c]; } return r; }
    case "normal8": { const r = new Float32Array(n); for (let i = 0; i < n; i++) r[i] = q[i] / 127; return r; }
    case "rango16": case "rango8": { const L = e.cuant === "rango16" ? 65535 : 255, [mn, mx] = e.rango, s = ancho(mn, mx), r = new Float32Array(n); for (let i = 0; i < n; i++) r[i] = q[i] / L * s + mn; return r; }
    case "lineal16": { const r = new Float32Array(n); for (let i = 0; i < n; i++) r[i] = q[i] / 32767 * e.escala; return r; }
    case "entero": { const r = new Int32Array(n); for (let i = 0; i < n; i++) r[i] = q[i] - e.sesgo; return r; }
    case "indice": return Uint32Array.from(q);
    case "crudo": return q;
    default: throw new Error("horneado: cuantización desconocida " + e.cuant);
  }
}
/** @returns {cabecera, receta} con la receta de siempre (flotantes con la pérdida de TOPES; enteros y metadatos idénticos) */
export function decodifica(bytes) {
  const { cab, datos, nd } = abre(bytes), cabecera = { formato: cab.formato, gen_version: cab.gen_version, cache_version: cab.cache_version, nivel: cab.nivel, epoca: cab.epoca, clave: cab.clave };
  const receta = Object.assign({}, cab.receta);
  if (cab.padre) receta.padre = decuantiza(lee(datos, nd, cab.padre), cab.padre);
  receta.piezas = cab.piezas.map(({ campos, arrays }) => {
    const p = Object.assign({}, campos); let tr = null, li = null;
    for (const e of arrays) {
      const v = decuantiza(lee(datos, nd, e), e);
      if (e.nombre.startsWith("atrib.")) (p.atrib || (p.atrib = {}))[e.nombre.slice(6)] = v;
      else if (e.nombre === "matrices.traslacion") tr = v;
      else if (e.nombre === "matrices.lineal") li = v;
      else p[e.nombre] = v;
    }
    if (tr || li) {
      if (!tr || !li || tr.length / 3 !== li.length / 9) throw new Error("horneado: matrices incompletas");
      const n = tr.length / 3, M = new Float32Array(n * 16);
      for (let i = 0; i < n; i++) { LINEAL.forEach((e, j) => { M[i * 16 + e] = li[i * 9 + j]; }); M[i * 16 + 12] = tr[i * 3]; M[i * 16 + 13] = tr[i * 3 + 1]; M[i * 16 + 14] = tr[i * 3 + 2]; M[i * 16 + 15] = 1; }
      p.matrices = M;
    }
    return p;
  });
  return { cabecera, receta };
}

// ---------- huella
/** Huella de un objeto: SHA-256 de los bytes SIN comprimir, truncado a 128 bits, en hexadecimal (32 caracteres). Web Crypto: navegador, trabajador y Node ≥ 20 */
export async function huellaBytes(bytes) {
  const h = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)).subarray(0, 16);
  return Array.from(h, b => b.toString(16).padStart(2, "0")).join("");
}
export async function verificaHuella(bytes, huella) { return (await huellaBytes(bytes)) === huella; }

// ---------- pérdidas y estructura
/**
 * Pérdida máxima de una receta decodificada frente a la original (las mismas medidas que O6, pruebas/olivo/hornea_tesela.mjs).
 * @param o { radios: { geo: radio en m de la geometría compartida } } para la parte lineal de las matrices (por defecto 1 m)
 */
export function perdida(a, b, o) {
  const radios = (o && o.radios) || {}, r = { pos_mm: 0, normal_grados: 0, uv: 0, hueco_muerta: 0, color: 0, traslacion_mm: 0, lineal_mm_en_geometria: 0 };
  const abs = (x, y, clave) => { for (let i = 0; i < x.length; i++) r[clave] = Math.max(r[clave], Math.abs(x[i] - y[i])); };
  const dist = (x, y, clave) => { for (let i = 0; i < x.length; i += 3) r[clave] = Math.max(r[clave], Math.hypot(x[i] - y[i], x[i + 1] - y[i + 1], x[i + 2] - y[i + 2]) * 1000); };
  a.piezas.forEach((p, ip) => {
    const q = b.piezas[ip];
    if (p.atrib) {
      dist(p.atrib.position, q.atrib.position, "pos_mm");
      const N = p.atrib.normal, Q = q.atrib.normal;
      for (let i = 0; i < N.length; i += 3) {
        const l = Math.hypot(N[i], N[i + 1], N[i + 2]) * Math.hypot(Q[i], Q[i + 1], Q[i + 2]) || 1;
        r.normal_grados = Math.max(r.normal_grados, Math.acos(Math.min(1, (N[i] * Q[i] + N[i + 1] * Q[i + 1] + N[i + 2] * Q[i + 2]) / l)) * 180 / Math.PI);
      }
      if (p.atrib.uv) abs(p.atrib.uv, q.atrib.uv, "uv");
      for (const k of ["aHueco", "aMuerta"]) if (p.atrib[k]) abs(p.atrib[k], q.atrib[k], "hueco_muerta");
    }
    if (p.matrices) {
      const n = p.matrices.length / 16, rg = radios[p.geo] === undefined ? 1 : radios[p.geo];
      for (let i = 0; i < n; i++) {
        for (let e = 12; e < 15; e++) r.traslacion_mm = Math.max(r.traslacion_mm, Math.abs(p.matrices[i * 16 + e] - q.matrices[i * 16 + e]) * 1000);
        let f2 = 0; for (const e of LINEAL) { const d = p.matrices[i * 16 + e] - q.matrices[i * 16 + e]; f2 += d * d; }
        r.lineal_mm_en_geometria = Math.max(r.lineal_mm_en_geometria, Math.sqrt(f2) * rg * 1000);
      }
    }
    if (p.posiciones) dist(p.posiciones, q.posiciones, "traslacion_mm");
    if (p.colores) abs(p.colores, q.colores, "color");
  });
  return r;
}
/** [] si las dos recetas tienen la misma estructura: metadatos, recuentos y todos los enteros idénticos, mismas longitudes de cada array */
export function igualEstructura(a, b) {
  const d = [], igualTA = (x, y) => (!x && !y) || (x && y && x.length === y.length && x.every((v, i) => v === y[i]));
  const meta = r => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => k !== "piezas" && k !== "padre")));
  if (meta(a) !== meta(b)) d.push("metadatos de la receta");
  if (!igualTA(a.padre, b.padre)) d.push("padre");
  if (a.piezas.length !== b.piezas.length) { d.push("número de piezas"); return d; }
  a.piezas.forEach((p, i) => {
    const q = b.piezas[i], cam = x => JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k, v]) => k !== "atrib" && !ARR_PIEZA.includes(k) || v === null)));
    if (cam(p) !== cam(q)) d.push("pieza " + i + ": campos");
    for (const k of ["indice", "nodo", "brote"]) if (!igualTA(p[k], q[k])) d.push("pieza " + i + ": " + k);
    for (const k of ["matrices", "colores", "posiciones"]) if ((p[k] ? p[k].length : -1) !== (q[k] ? q[k].length : -1)) d.push("pieza " + i + ": longitud de " + k);
    for (const k of ATRIB) if (((p.atrib && p.atrib[k]) ? p.atrib[k].length : -1) !== ((q.atrib && q.atrib[k]) ? q.atrib[k].length : -1)) d.push("pieza " + i + ": longitud de atrib." + k);
  });
  return d;
}

// ---------- manifiesto por tesela (solo con propios horneados): contratos/olivo-horneado.md §5
const hexABytes = h => { if (!/^[0-9a-f]{32}$/.test(h)) throw new Error("huella no válida: " + h); return Uint8Array.from(h.match(/../g), x => parseInt(x, 16)); };
const bytesAHex = u => Array.from(u, b => b.toString(16).padStart(2, "0")).join("");
/** @param m { combinaciones: n huellas por olivo, olivos: [{copas_id, huellas: [hex32 | null] × combinaciones}] } → Uint8Array, 16 B + olivos × (4 + 16·n), ordenado por copas_id */
export function codificaManifiestoTesela(m) {
  const nh = m.combinaciones, ol = m.olivos.slice().sort((x, y) => x.copas_id - y.copas_id), tam = 4 + 16 * nh, r = new Uint8Array(16 + ol.length * tam), dv = new DataView(r.buffer);
  r.set(enc.encode(MAGIA_TESELA), 0); dv.setUint16(4, FORMATO, true); dv.setUint16(6, nh, true); dv.setUint32(8, ol.length, true);
  ol.forEach((o, i) => {
    if (i && ol[i - 1].copas_id === o.copas_id) throw new Error("copas_id repetido: " + o.copas_id);
    if (o.huellas.length !== nh) throw new Error("huellas de más o de menos en " + o.copas_id);
    dv.setUint32(16 + i * tam, o.copas_id, true);
    o.huellas.forEach((h, j) => { if (h) r.set(hexABytes(h), 16 + i * tam + 4 + j * 16); });   // sin huella = 16 ceros
  });
  return r;
}
export function decodificaManifiestoTesela(bytes) {
  if (bytes.length < 16 || dec.decode(bytes.subarray(0, 4)) !== MAGIA_TESELA) throw new Error("manifiesto de tesela: magia");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), formato = dv.getUint16(4, true), nh = dv.getUint16(6, true), n = dv.getUint32(8, true), tam = 4 + 16 * nh;
  if (formato !== FORMATO) throw new Error("manifiesto de tesela: versión de formato " + formato);
  if (bytes.length !== 16 + n * tam) throw new Error("manifiesto de tesela: longitud incoherente");
  const olivos = [];
  for (let i = 0; i < n; i++) {
    const o = 16 + i * tam, huellas = [];
    for (let j = 0; j < nh; j++) { const h = bytes.subarray(o + 4 + j * 16, o + 20 + j * 16); huellas.push(h.every(x => x === 0) ? null : bytesAHex(h)); }
    olivos.push({ copas_id: dv.getUint32(o, true), huellas });
  }
  return { combinaciones: nh, olivos };
}

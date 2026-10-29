// Prototipo F1d: del contrato de datos v2 (doc/sistema/CONTRATOS.md) a 3D Tiles 1.1 — tileset.json + un glb por tesela.
// Formato, marco y cómo regenerar: doc/sistema/TILES3D.md. Decisión: doc/adr/0015-escena-en-3d-tiles.md (Propuesto).
//
//   node tuberia/tiles3d/genera.mjs --entrada <carpeta con indice.json | indice.json | embebido.json> --salida <carpeta>
//   (sin --entrada se lee GEMELO_DATOS, que apunta al indice.json: los datos reales viven fuera del repo, regla 4 de CLAUDE.md)
//        [--hoja 128] [--celdas 128] [--textura 256] [--ondulacion 0] [--error-hoja 0.05] [--niveles-olivo 3]
//        [--nivel-util <m>]   (lado de los hijos de la raíz; por defecto hoja·2^(niveles-olivo − 1), el nivel más alto con olivos)
//        [--catalogo <catalogo.json del contrato olivos-tipo>]   (solo para el fixture: sin él, copas_tipo son ids del catálogo «olivos»)
//
// Librerías (package.json): @gltf-transform (escribir glb y EXT_mesh_gpu_instancing), meshoptimizer (simplificar el terreno con
// error absoluto y bordes bloqueados), sharp (mosaico de ortofoto, recortes y remuestreo Lanczos, JPEG), three (geometrías de los
// prototipos de olivo: LatheGeometry, CylinderGeometry, mergeGeometries) y proj4 (UTM 30N ↔ geodésicas ↔ ECEF, en marco.mjs).
// Los nombres de los tipos de olivo salen de apps/web/olivo/catalogo.js (tablaLocal) y tipos.js (ID_TIPO): una sola fuente.
// Lo propio es solo lo que no da ninguna librería: leer el contrato v2, muestrear el relieve global (para que los bordes de teselas
// vecinas coincidan y las normales no tengan costura), el árbol de cuadrantes y los geometricError medidos.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Document, NodeIO, TextureInfo } from "@gltf-transform/core";
import { EXTMeshGPUInstancing } from "@gltf-transform/extensions";
import { compactPrimitive } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { transformRaiz } from "./marco.mjs";
import { CATALOGO, tablaLocal } from "../../apps/web/olivo/catalogo.js";
import { tipoDeId } from "../../apps/web/olivo/tipos.js";

export const VERSION_GENERADOR = "0.3.0";

// ---------------------------------------------------------------- argumentos
function argumentos(argv) {
  const a = { hoja: 128, celdas: 128, textura: 256, ondulacion: 0, errorHoja: 0.05, nivelesOlivo: 3, nivelUtil: 0 };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, "").replace(/-(\w)/g, (_, c) => c.toUpperCase()), v = argv[i + 1];
    const texto = k === "entrada" || k === "salida" || k === "catalogo";
    if (!(k in a) && !texto) throw new Error("argumento desconocido: " + argv[i]);
    a[k] = texto ? v : Number(v);
  }
  a.entrada = a.entrada || process.env.GEMELO_DATOS;
  if (!a.entrada || !a.salida) throw new Error("uso: node genera.mjs --entrada <carpeta|indice.json|embebido.json> --salida <carpeta> (o GEMELO_DATOS=<indice.json>)");
  return a;
}

// ---------------------------------------------------------------- lectura del contrato v2 (modo ficheros o embebido)
const deDataUri = s => Buffer.from(s.slice(s.indexOf(",") + 1), "base64");
const i16 = b64 => { const b = Buffer.from(b64, "base64"); return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };

export function leeContrato(entrada) {
  if (path.basename(entrada) === "indice.json") entrada = path.dirname(entrada);
  const emb = entrada.endsWith(".json") ? entrada : path.join(entrada, "embebido.json");
  const fichero = fs.existsSync(path.join(entrada, "indice.json"));
  const I = JSON.parse(fs.readFileSync(fichero ? path.join(entrada, "indice.json") : emb, "utf8"));
  if (I.v !== 2) throw new Error("contrato v" + I.v + ": este generador lee la v2");
  const teselas = new Map();
  for (const [k, t] of Object.entries(I.teselas)) {
    const d = fichero ? JSON.parse(fs.readFileSync(path.join(entrada, "t", k + ".json"), "utf8")) : I.t[k];
    const jpg = fichero ? fs.readFileSync(path.join(entrada, "t", k + ".jpg")) : deDataUri(d.orto);
    teselas.set(k, { kx: t.kx, ky: t.ky, dtm: i16(d.dtm), jpg });
  }
  return { I, teselas };
}

// ---------------------------------------------------------------- relieve global (m sobre z0), como Mundo.suelo: tesela si la hay; si no, el grueso de 8 m
export function relieve(I, teselas) {
  const TS = I.ts, [CX, CY] = I.centro_utm, N2 = TS / I.res + 2, g = I.grueso, gz = i16(g.b64);
  const gr = (x, y) => {                       // grueso: centros en x0 + res·(i+½), yN − res·(j+½); filas de norte a sur
    const u = Math.min(g.w - 1, Math.max(0, (x - g.x0) / g.res - 0.5)), v = Math.min(g.h - 1, Math.max(0, (g.yN - y) / g.res - 0.5));
    const i = Math.min(g.w - 2, Math.floor(u)), j = Math.min(g.h - 2, Math.floor(v)), fu = u - i, fv = v - j, at = (a, b) => gz[b * g.w + a] / 100;
    return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
  };
  const H = (x, y) => {
    const t = teselas.get(Math.floor((x + CX) / TS) + "_" + Math.floor((y + CY) / TS));
    if (!t) return gr(x, y);
    const ox = t.kx * TS - CX, oy = t.ky * TS - CY;        // celdas −1..256 (una de margen), centros en o + i + ½, filas de sur a norte
    const u = (x - ox) / I.res - 0.5, v = (y - oy) / I.res - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const at = (a, b) => t.dtm[(b + 1) * N2 + (a + 1)] / 100;
    return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
  };
  const conDato = (x, y) => teselas.has(Math.floor((x + CX) / TS) + "_" + Math.floor((y + CY) / TS));
  return { H, conDato };
}

// ---------------------------------------------------------------- ortofoto: un lienzo (mosaico debajo, teselas encima) con sharp
/** El lienzo cubre solo los datos (teselas y mosaico, ajustado a la rejilla de teselas), no los cuadrados del nivel útil, que pueden
 *  salirse de los datos hasta casi su lado (un lienzo a su medida gastaría memoria en gris). Fuera del lienzo, gris. */
async function ortofoto(I, teselas) {
  const TS = I.ts, [CX, CY] = I.centro_utm, res = TS / I.orto_px;          // m/px de la ortofoto de tesela
  const xs = [], ys = [];
  for (const t of teselas.values()) { xs.push(t.kx * TS - CX, t.kx * TS + TS - CX); ys.push(t.ky * TS - CY, t.ky * TS + TS - CY); }
  if (I.mosaico) { const m = I.mosaico; xs.push(m.x0, m.x0 + m.w * m.res); ys.push(m.yN - m.h * m.res, m.yN); }
  const rej = (v, C, f) => f((v + C) / TS) * TS - C;                     // a la rejilla de teselas (UTM múltiplo de ts)
  const caja = { x0: rej(Math.min(...xs), CX, Math.floor), x1: rej(Math.max(...xs), CX, Math.ceil), y0: rej(Math.min(...ys), CY, Math.floor), y1: rej(Math.max(...ys), CY, Math.ceil) };
  const W = Math.round((caja.x1 - caja.x0) / res), H = Math.round((caja.y1 - caja.y0) / res);
  const capas = [];
  if (I.mosaico) {                                                         // el mosaico global, llevado a la escala del lienzo
    const m = I.mosaico, w = Math.round(m.w * m.res / res), h = Math.round(m.h * m.res / res);
    capas.push({ input: await sharp(deDataUri(m.jpg)).resize(w, h, { kernel: "lanczos3" }).toBuffer(), left: Math.round((m.x0 - caja.x0) / res), top: Math.round((caja.y1 - m.yN) / res) });
  }
  for (const t of teselas.values()) {
    const ox = t.kx * TS - CX, oyN = t.ky * TS + TS - CY;
    capas.push({ input: await sharp(t.jpg).resize(I.orto_px, I.orto_px).toBuffer(), left: Math.round((ox - caja.x0) / res), top: Math.round((caja.y1 - oyN) / res) });
  }
  const sinLimite = { limitInputPixels: false };
  const lienzo = sharp({ create: { width: W, height: H, channels: 3, background: { r: 128, g: 128, b: 128 } }, ...sinLimite }).composite(capas);
  const raw = await sharp(await lienzo.png().toBuffer(), sinLimite).removeAlpha().raw().toBuffer();
  const fuente = () => sharp(raw, { raw: { width: W, height: H, channels: 3 }, ...sinLimite });
  const gris = px => sharp({ create: { width: px, height: px, channels: 3, background: { r: 128, g: 128, b: 128 } } });
  const jpeg = s => s.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  return {
    res, W, H, caja,
    /** JPEG del cuadrado [x0, x0+S) × [y0, y0+S) a px × px (la parte fuera del lienzo, gris) */
    async recorte(x0, y0, S, px) {
      const left = Math.round((x0 - caja.x0) / res), top = Math.round((caja.y1 - (y0 + S)) / res), lado = Math.round(S / res);
      if (left >= 0 && top >= 0 && left + lado <= W && top + lado <= H)
        return jpeg(fuente().extract({ left, top, width: lado, height: lado }).resize(px, px, { kernel: "lanczos3" }));
      const i0 = Math.max(0, left), j0 = Math.max(0, top), i1 = Math.min(W, left + lado), j1 = Math.min(H, top + lado), sc = px / lado;
      if (i1 <= i0 || j1 <= j0) return jpeg(gris(px));
      const l = Math.min(px - 1, Math.round((i0 - left) * sc)), tp = Math.min(px - 1, Math.round((j0 - top) * sc));
      const w = Math.max(1, Math.min(px - l, Math.round((i1 - i0) * sc))), h = Math.max(1, Math.min(px - tp, Math.round((j1 - j0) * sc)));
      const trozo = await fuente().extract({ left: i0, top: j0, width: i1 - i0, height: j1 - j0 }).resize(w, h, { kernel: "lanczos3" }).png().toBuffer();
      return jpeg(sharp(await gris(px).composite([{ input: trozo, left: l, top: tp }]).png().toBuffer()));
    },
    /** color sRGB 0..1 en (x, y) */
    color(x, y) {
      const i = Math.min(W - 1, Math.max(0, Math.floor((x - caja.x0) / res))), j = Math.min(H - 1, Math.max(0, Math.floor((caja.y1 - y) / res))), k = (j * W + i) * 3;
      return [raw[k] / 255, raw[k + 1] / 255, raw[k + 2] / 255];
    },
  };
}

// ---------------------------------------------------------------- olivos: registro → instancias
/** La regla del motor (apps/web/motor/02_mundo.js): olivo salvo alto (> 8 m) o alto y estrecho */
export const esOlivo = c => { const rm = c[3].reduce((a, b) => a + b, 0) / 8; return !(c[2] > 8 || (c[2] > 6.5 && rm < 2.2)); };
const hash = s => { const v = Math.sin(s * 12.9898) * 43758.5453; return v - Math.floor(v); };

// ---------------------------------------------------------------- identidad y tipo por instancia (contratos/tileset.schema.json)
/** Lista de copas de un cuadrado [x0, x0+L) × [y0, y0+L): índices en copas[] de los olivos (regla de esOlivo) que caen dentro, en el
 *  orden de copas[]. La instancia k de la tesela es la copa lista[k]; el motor rehace la misma lista desde su json. */
export const listaCopas = (I, x0, y0, L) => { const r = []; I.copas.forEach((c, g) => { if (esOlivo(c) && c[0] >= x0 && c[0] < x0 + L && c[1] >= y0 && c[1] < y0 + L) r.push(g); }); return r; };
/** Id de cada copa: copas_id si el índice lo trae (ADR-0012); si no, su índice en copas[] */
export const idsDe = I => I.copas_id || I.copas.map((_, g) => g);
/** Huella de una secuencia de ids (enteros en [0, 2^32)): "sha256:" + hex del SHA-256 de los ids como Uint32 little-endian, en orden.
 *  En el navegador es crypto.subtle.digest("SHA-256", Uint32Array) (máquinas little-endian, que son todas las de destino). */
export function huella(ids) {
  const b = Buffer.alloc(ids.length * 4);
  ids.forEach((v, k) => { if (!Number.isInteger(v) || v < 0 || v >= 2 ** 32) throw new Error("id fuera de [0, 2^32): " + v); b.writeUInt32LE(v, k * 4); });
  return "sha256:" + crypto.createHash("sha256").update(b).digest("hex");
}
/** Nombre de catálogo de un id de copas_tipo, o null si el catálogo no lo conoce. Por defecto, el catálogo «olivos» del constructor
 *  (contratos/olivo-generado.md §1.1): id = ID_TIPO de apps/web/olivo/tipos.js, nombre = tablaLocal() de apps/web/olivo/catalogo.js.
 *  Con la ruta de un catalogo.json del contrato olivos-tipo (solo el sintético de pruebas, modelos/olivos/fixture/), «<id del
 *  catálogo>:<id del tipo>»: así el tipo 0 del fixture se llama «fixture-sintetico:0» y no se confunde con olivos:planton. */
export function catalogoTipos(ruta) {
  if (!ruta) return { id: CATALOGO, nombre: t => { const k = tipoDeId(t); return k ? tablaLocal([k])[0] : null; } };
  const C = JSON.parse(fs.readFileSync(ruta, "utf8")), ids = new Set(C.tipos.map(t => t.id));
  return { id: C.id, nombre: t => ids.has(t) ? C.id + ":" + t : null };
}
/** Tabla de tipos del tileset: número local → nombre del tipo de catálogo. −1 = sin asignar (null). Los números locales 0..m−1 se
 *  dan a los ids de copas_tipo presentes que el catálogo conoce, de menor a mayor; un id que no conoce va a −1 (como en el motor) y
 *  se cuenta en «desconocidos». */
export function tablaTipos(I, cat = catalogoTipos()) {
  const vistos = [...new Set((I.copas_tipo || []).filter(t => t >= 0))].sort((a, b) => a - b);
  const presentes = vistos.filter(t => cat.nombre(t) !== null), desconocidos = vistos.filter(t => cat.nombre(t) === null);
  const tabla = { "-1": null }, local = new Map([[-1, -1]]);
  presentes.forEach((t, n) => { tabla[String(n)] = cat.nombre(t); local.set(t, n); });
  desconocidos.forEach(t => local.set(t, -1));
  return { tabla, local, desconocidos, catalogo: cat.id };
}
/** Array tipado entero para un atributo por instancia: glTF no admite UNSIGNED_INT fuera de los índices, así que u8/u16 si cabe y
 *  si no FLOAT (exacto hasta 2^24, que se comprueba) */
const enteros = (vals, conSigno) => {
  const max = vals.reduce((m, v) => Math.max(m, v), 0);
  if (conSigno) { if (vals.some(v => v < -32768 || v > 32767)) throw new Error("_TIPO fuera de Int16"); return Int16Array.from(vals); }
  if (max < 256) return Uint8Array.from(vals);
  if (max < 65536) return Uint16Array.from(vals);
  if (max >= 2 ** 24) throw new Error("índice de copa ≥ 2^24 en una tesela: no cabe exacto en FLOAT");
  return Float32Array.from(vals);
};
/** Silueta como el nivel 1 del motor (07b_arboles.js): eje largo de la copa medida (pares de radios opuestos), giro y dos radios */
function silueta(c) {
  const P = c[3], L = [0, 1, 2, 3].map(q => (P[q] + P[q + 4]) / 2);
  let im = 0; for (let q = 1; q < 4; q++) if (L[q] > L[im]) im = q;
  return { ang: im * Math.PI / 4, rx: Math.max(0.6, L[im] * 0.5), rz: Math.max(0.6, L[(im + 2) % 4] * 0.5) };
}

/** Prototipos de olivo genérico (tipo = −1), en unidades: copa de radio 1 y altura total 1. Con three; color por vértice (tronco/copa). */
function prototipos() {
  const torno = (perfil, seg) => new THREE.LatheGeometry(perfil.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const pinta = (g, rgb) => { const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(rgb, i * 3); g.setAttribute("color", new THREE.BufferAttribute(c, 3)); g.deleteAttribute("uv"); return g; };
  const tronco = pinta(new THREE.CylinderGeometry(0.09, 0.11, 0.34, 6, 1, true).translate(0, 0.17, 0), [0.30, 0.22, 0.15]);
  // perfil de la copa (radio, altura) de arriba abajo para que LatheGeometry oriente las caras hacia fuera; abierta por debajo como en el motor
  const detalle = pinta(torno([[0, 1], [0.38, 0.97], [0.7, 0.88], [0.92, 0.74], [1, 0.58], [0.9, 0.42], [0.55, 0.28]], 12), [1, 1, 1]);
  const lejano = pinta(torno([[0, 1], [1, 0.55], [0.6, 0.25], [0, 0.22]], 6), [1, 1, 1]);
  // LatheGeometry deja normales no unitarias en el eje (r = 0) y triángulos degenerados en la cúspide: el validador de glTF los rechaza
  const aPlano = g => {
    const n = g.attributes.normal, v = new THREE.Vector3(), p = g.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < n.count; i++) { v.fromBufferAttribute(n, i); if (v.lengthSq() < 1e-12) v.set(0, 1, 0); v.normalize(); n.setXYZ(i, v.x, v.y, v.z); }
    const idx = [], I = g.index.array;
    for (let k = 0; k < I.length; k += 3) {
      a.fromBufferAttribute(p, I[k]); b.fromBufferAttribute(p, I[k + 1]); c.fromBufferAttribute(p, I[k + 2]);
      if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-12) idx.push(I[k], I[k + 1], I[k + 2]);
    }
    return { pos: p.array, nor: n.array, col: g.attributes.color.array, idx: Uint32Array.from(idx) };
  };
  return {
    detalle: Object.assign(aPlano(mergeGeometries([tronco, detalle])), { nombre: "olivo-detalle", desviacion: 0 }),
    // desviación del lejano frente al detalle: error de cuerda de 6 frente a 12 sectores, relativo al radio (1 − cos(π/6) ≈ 0,134)
    lejano: Object.assign(aPlano(lejano), { nombre: "olivo-lejano", desviacion: 1 - Math.cos(Math.PI / 6) }),
  };
}
const triangulos = p => p.idx.length / 3;

// ---------------------------------------------------------------- terreno de un nodo
/** Rejilla regular de celdas×celdas sobre el relieve global, solo en celdas con dato, simplificada con meshoptimizer (error absoluto,
 *  bordes bloqueados) y con faldones en los bordes del cuadrado. Devuelve arrays glTF (X = x, Y = z, Z = −y) y el error medido. */
function terreno(R, x0, y0, S, N, errorObjetivo, resDato) {
  const s = S / N, nv = N + 1, V = nv * nv, pos = new Float32Array(V * 3), uv = new Float32Array(V * 2), nor = new Float32Array(V * 3), hv = new Float64Array(V);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const k = j * nv + i, x = x0 + i * s, y = y0 + j * s, h = R.H(x, y), d = Math.min(s, 1);
    const hx = (R.H(x + d, y) - R.H(x - d, y)) / (2 * d), hy = (R.H(x, y + d) - R.H(x, y - d)) / (2 * d), l = Math.hypot(hx, 1, hy);
    hv[k] = h; pos.set([x, h, -y], k * 3); nor.set([-hx / l, 1 / l, hy / l], k * 3); uv.set([i / N, 1 - j / N], k * 2);
  }
  const celda = (i, j) => i >= 0 && j >= 0 && i < N && j < N && R.conDato(x0 + (i + 0.5) * s, y0 + (j + 0.5) * s);
  const sup = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (celda(i, j)) {
    const a = j * nv + i, b = a + 1, c = a + nv, d = c + 1;
    sup.push(a, b, c, b, d, c);                    // CCW visto desde arriba (+Y glTF)
  }
  if (!sup.length) return null;
  // error de la rejilla frente al relieve de 1 m (medido en cada metro del cuadrado con dato)
  let errRejilla = 0;
  if (s > resDato) for (let yy = 0; yy <= S; yy += resDato) for (let xx = 0; xx <= S; xx += resDato) {
    const u = Math.min(N - 1e-9, xx / s), v = Math.min(N - 1e-9, yy / s), i = Math.floor(u), j = Math.floor(v);
    if (!celda(i, j)) continue;
    const fu = u - i, fv = v - j, k = j * nv + i, z = fu + fv <= 1 ? hv[k] + (hv[k + 1] - hv[k]) * fu + (hv[k + nv] - hv[k]) * fv : hv[k + nv + 1] + (hv[k + nv] - hv[k + nv + 1]) * (1 - fu) + (hv[k + 1] - hv[k + nv + 1]) * (1 - fv);
    errRejilla = Math.max(errRejilla, Math.abs(z - R.H(x0 + xx, y0 + yy)));
  }
  const [idxSimpl, errSimpl] = MeshoptSimplifier.simplify(new Uint32Array(sup), pos, 3, 0, errorObjetivo, ["LockBorder", "ErrorAbsolute"]);
  const error = errRejilla + errSimpl, prof = Math.max(1.5, 2 * error);       // faldón: 1,5 m como hoy (ADR-0002), más si el nivel es tosco
  // faldones: en cada lado del cuadrado, un tramo por arista de celda con dato; orientados hacia fuera
  const extra = [], fal = [], dup = new Map();
  const abajo = k => { if (dup.has(k)) return dup.get(k); const n = V + extra.length; extra.push(k); dup.set(k, n); return n; };
  const tramo = (ka, kb) => { const a2 = abajo(ka), b2 = abajo(kb); fal.push(ka, a2, kb, kb, a2, b2); };
  for (let i = 0; i < N; i++) {
    if (celda(i, 0)) tramo(i, i + 1);                                           // sur: de oeste a este
    if (celda(i, N - 1)) tramo(N * nv + i + 1, N * nv + i);                     // norte: de este a oeste
  }
  for (let j = 0; j < N; j++) {
    if (celda(0, j)) tramo((j + 1) * nv, j * nv);                               // oeste: de norte a sur
    if (celda(N - 1, j)) tramo(j * nv + N, (j + 1) * nv + N);                   // este: de sur a norte
  }
  const T = V + extra.length, P = new Float32Array(T * 3), NN = new Float32Array(T * 3), UV = new Float32Array(T * 2);
  P.set(pos); NN.set(nor); UV.set(uv);
  extra.forEach((k, e) => { const n = V + e; P.set([pos[k * 3], pos[k * 3 + 1] - prof, pos[k * 3 + 2]], n * 3); NN.set(nor.subarray(k * 3, k * 3 + 3), n * 3); UV.set(uv.subarray(k * 2, k * 2 + 2), n * 2); });
  const idx = new Uint32Array(idxSimpl.length + fal.length); idx.set(idxSimpl); idx.set(fal, idxSimpl.length);
  let zmin = Infinity, zmax = -Infinity;
  for (const k of idx) { const z = P[k * 3 + 1]; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
  return { pos: P, nor: NN, uv: UV, idx, error, errRejilla, errSimpl, zmin, zmax, triSuperficie: idxSimpl.length / 3, triFaldon: fal.length / 3 };
}

// ---------------------------------------------------------------- glb de un nodo (gltf-transform)
async function glbNodo(t, olivos, proto, jpg) {
  const doc = new Document(), buf = doc.createBuffer(), escena = doc.createScene();
  doc.getRoot().getAsset().generator = "gemelo tuberia/tiles3d " + VERSION_GENERADOR;
  const acc = (tipo, arr) => doc.createAccessor().setType(tipo).setArray(arr).setBuffer(buf);
  const indices = (arr, nv) => acc("SCALAR", nv < 65536 ? Uint16Array.from(arr) : Uint32Array.from(arr));
  if (t) {
    const tex = doc.createTexture("ortofoto").setImage(jpg).setMimeType("image/jpeg");
    const mat = doc.createMaterial("terreno").setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(1);
    mat.getBaseColorTextureInfo().setWrapS(TextureInfo.WrapMode.CLAMP_TO_EDGE).setWrapT(TextureInfo.WrapMode.CLAMP_TO_EDGE);
    const prim = doc.createPrimitive().setAttribute("POSITION", acc("VEC3", t.pos)).setAttribute("NORMAL", acc("VEC3", t.nor)).setAttribute("TEXCOORD_0", acc("VEC2", t.uv)).setIndices(indices(t.idx, t.pos.length / 3)).setMaterial(mat);
    compactPrimitive(prim);                                                    // quita los vértices que la simplificación dejó sin uso
    escena.addChild(doc.createNode("terreno").setMesh(doc.createMesh("terreno").addPrimitive(prim)));
  }
  if (olivos.length && proto) {
    const ext = doc.createExtension(EXTMeshGPUInstancing).setRequired(true);
    const mat = doc.createMaterial(proto.nombre).setMetallicFactor(0).setRoughnessFactor(1);
    const prim = doc.createPrimitive().setAttribute("POSITION", acc("VEC3", proto.pos)).setAttribute("NORMAL", acc("VEC3", proto.nor)).setAttribute("COLOR_0", acc("VEC3", proto.col)).setIndices(indices(proto.idx, proto.pos.length / 3)).setMaterial(mat);
    const n = olivos.length, T = new Float32Array(n * 3), Q = new Float32Array(n * 4), Sc = new Float32Array(n * 3), C = new Float32Array(n * 3);
    olivos.forEach((o, k) => { T.set([o.x, o.z, -o.y], k * 3); Q.set([0, Math.sin(o.ang / 2), 0, Math.cos(o.ang / 2)], k * 4); Sc.set([o.rx, o.h, o.rz], k * 3); C.set(o.color, k * 3); });
    // _INDICE_COPA = k (posición en la lista de copas de la tesela, no el id: el id se resuelve en CPU con la huella); _TIPO = número local
    const IX = enteros(olivos.map((_, k) => k), false), TI = enteros(olivos.map(o => o.tipo), true);
    const inst = ext.createInstancedMesh().setAttribute("TRANSLATION", acc("VEC3", T)).setAttribute("ROTATION", acc("VEC4", Q)).setAttribute("SCALE", acc("VEC3", Sc))
      .setAttribute("_COLOR_0", acc("VEC3", C)).setAttribute("_INDICE_COPA", acc("SCALAR", IX)).setAttribute("_TIPO", acc("SCALAR", TI));
    escena.addChild(doc.createNode(proto.nombre).setMesh(doc.createMesh(proto.nombre).addPrimitive(prim)).setExtension("EXT_mesh_gpu_instancing", inst));
  }
  return new NodeIO().registerExtensions([EXTMeshGPUInstancing]).writeBinary(doc);
}

// ---------------------------------------------------------------- el árbol de cuadrantes
/** Plan del árbol, sin geometría. La raíz NO tiene contenido; sus hijos son los cuadrados del NIVEL ÚTIL (lado S, alineados a
 *  múltiplos de S en UTM) que tocan alguna tesela del contrato; debajo, cuadrantes hasta las hojas (lado = hoja); lo que no toca datos
 *  no se genera. S por defecto = el nivel más alto con olivos, hoja·2^(niveles-olivo − 1) (512 m): por encima solo había terreno y una
 *  ortofoto más tosca que la que pide la pantalla al ver la finca entera, saltos de LOD que no aportan. Antes (generador ≤ 0.2.0) la
 *  raíz era el menor cuadrado alineado que CONTIENE los datos, y unos datos que cruzan una línea de rejilla gruesa la subían mucho
 *  (Hituelo: 32.768 m, 6 niveles sin olivos). Nodo: {prof, i, j, L, x0, y0, hijos}; prof 0 = nivel útil. */
export function planArbol(teselas, TS, centro, hoja, S) {
  if (!(S >= hoja) || !Number.isInteger(Math.log2(S / hoja))) throw new Error("nivel útil " + S + " m: debe ser hoja·2^k (hoja " + hoja + " m)");
  const [CX, CY] = centro, kxs = [...teselas.values()].map(t => t.kx), kys = [...teselas.values()].map(t => t.ky);
  const E0 = Math.min(...kxs) * TS, E1 = (Math.max(...kxs) + 1) * TS, N0 = Math.min(...kys) * TS, N1 = (Math.max(...kys) + 1) * TS;
  const profMax = Math.round(Math.log2(S / hoja));
  const solapa = (x0, y0, L) => [...teselas.values()].some(t => { const ox = t.kx * TS - CX, oy = t.ky * TS - CY; return ox < x0 + L && ox + TS > x0 && oy < y0 + L && oy + TS > y0; });
  const nodo = (prof, i, j, L) => {
    const x0 = i * L - CX, y0 = j * L - CY;
    if (!solapa(x0, y0, L)) return null;
    const hijos = prof < profMax ? [[0, 0], [1, 0], [0, 1], [1, 1]].map(([di, dj]) => nodo(prof + 1, 2 * i + di, 2 * j + dj, L / 2)).filter(Boolean) : [];
    return { prof, i, j, L, x0, y0, hijos };
  };
  const cuadros = [];
  for (let j = Math.floor(N0 / S); j <= Math.floor((N1 - 1) / S); j++) for (let i = Math.floor(E0 / S); i <= Math.floor((E1 - 1) / S); i++) { const n = nodo(0, i, j, S); if (n) cuadros.push(n); }
  return { S, profMax, caja_utm: [E0, N0, E1, N1], cuadros };
}

export async function genera(op) {
  await MeshoptSimplifier.ready;
  const { I, teselas } = leeContrato(op.entrada), R = relieve(I, teselas), TS = I.ts, [CX, CY] = I.centro_utm;
  const plan = planArbol(teselas, TS, I.centro_utm, op.hoja, op.nivelUtil || op.hoja * 2 ** (op.nivelesOlivo - 1)), { S, profMax } = plan;
  const orto = await ortofoto(I, teselas), protos = prototipos(), tipos = tablaTipos(I, catalogoTipos(op.catalogo)), ids = idsDe(I);
  const olivos = I.copas.map((c, id) => ({ c, id })).filter(o => esOlivo(o.c)).map(({ c, id }) => {
    const s = silueta(c), col = orto.color(c[0], c[1]), vf = 0.88 + 0.26 * hash(id * 3.7);
    const lin = v => Math.pow(v, 2.2);                                          // glTF guarda color lineal
    return { id, x: c[0], y: c[1], h: c[2], z: R.H(c[0], c[1]), tipo: tipos.local.get(I.copas_tipo ? I.copas_tipo[id] : -1), ...s, color: [lin(col[0] * 0.74 * vf), lin(col[1] * 0.88 * vf), lin(col[2] * 0.64 * vf)] };
  });
  const hMax = olivos.reduce((m, o) => Math.max(m, o.h), 0);
  fs.mkdirSync(op.salida, { recursive: true });
  const filas = [];
  const zDe = h => { const b = h.boundingVolume.box; return [b[2] - b[11], b[2] + b[11]]; };

  async function nodo({ prof, i, j, L, x0, y0, hijos: plan }) {
    const hijos = [];
    for (const p of plan) hijos.push(await nodo(p));
    const paso = L / op.celdas, errObj = op.errorHoja * Math.pow(2, profMax - prof);
    const t = terreno(R, x0, y0, L, op.celdas, errObj, I.res);
    const deOlivo = profMax - prof < op.nivelesOlivo, proto = prof === profMax ? protos.detalle : deOlivo ? protos.lejano : null;
    const aqui = proto ? olivos.filter(o => o.x >= x0 && o.x < x0 + L && o.y >= y0 && o.y < y0 + L) : [];   // en el orden de copas[]: = listaCopas
    const lista = aqui.map(o => o.id);
    const errOlivo = !proto ? hMax : proto.desviacion * aqui.reduce((m, o) => Math.max(m, o.rx, o.rz, o.h), 0);
    const medido = Math.max(t ? t.error : 0, errOlivo);
    const ge = hijos.length ? Math.max(medido, 2 * Math.max(...hijos.map(h => h.geometricError))) : medido;
    const px = Math.min(op.textura, Math.pow(2, Math.ceil(Math.log2(L / orto.res))));
    const glb = await glbNodo(t, aqui, proto, t ? await orto.recorte(x0, y0, L, px) : null);
    const uri = L + "/" + i + "_" + j + ".glb";
    fs.mkdirSync(path.join(op.salida, String(L)), { recursive: true });
    fs.writeFileSync(path.join(op.salida, uri), glb);
    let zmin = t ? t.zmin : 0, zmax = t ? t.zmax : 0;
    for (const o of aqui) zmax = Math.max(zmax, o.z + o.h);
    for (const h of hijos) { const [a, b] = zDe(h); zmin = Math.min(zmin, a); zmax = Math.max(zmax, b); }
    const triO = aqui.length * (proto ? triangulos(proto) : 0);
    filas.push({ uri, nivel: prof, lado_m: L, paso_m: paso, textura_px: px, bytes: glb.length, tri_terreno: t ? t.idx.length / 3 : 0, tri_superficie: t ? t.triSuperficie : 0, tri_faldon: t ? t.triFaldon : 0,
      olivos: aqui.length, prototipo: proto ? proto.nombre : null, tri_olivos: triO, error_rejilla: t ? +t.errRejilla.toFixed(4) : 0, error_simplificacion: t ? +t.errSimpl.toFixed(4) : 0, error_olivos: +errOlivo.toFixed(4), geometricError: +ge.toFixed(4) });
    return {
      boundingVolume: { box: [x0 + L / 2, y0 + L / 2, (zmin + zmax) / 2, L / 2, 0, 0, 0, L / 2, 0, 0, 0, Math.max(0.5, (zmax - zmin) / 2)] },
      geometricError: +ge.toFixed(4), refine: "REPLACE", content: { uri },
      ...(lista.length ? { extras: { gemelo: { cuadro: [x0, y0, L], olivos: lista.length, huella: huella(lista.map(g => ids[g])) } } } : {}),
      ...(hijos.length ? { children: hijos } : {}),
    };
  }
  // raíz sin contenido: caja = la de sus hijos (los cuadrados del nivel útil); geometricError = el error de no dibujar nada, que se
  // acota por el lado mayor de esa caja (falta todo lo que hay dentro), y nunca menos que 2 × el mayor de sus hijos. Con un error
  // pequeño, un visor que mira de lejos se quedaría en la raíz y no dibujaría nada (3DTilesRendererJS y Cesium no refinan una tesela
  // vacía cuyo error ya cumple el objetivo).
  const hijos = [];
  for (const p of plan.cuadros) hijos.push(await nodo(p));
  const xs = plan.cuadros.flatMap(c => [c.x0, c.x0 + S]), ys = plan.cuadros.flatMap(c => [c.y0, c.y0 + S]), zs = hijos.flatMap(zDe);
  const rx0 = Math.min(...xs), rx1 = Math.max(...xs), ry0 = Math.min(...ys), ry1 = Math.max(...ys), rz0 = Math.min(...zs), rz1 = Math.max(...zs);
  const geRaiz = Math.max(rx1 - rx0, ry1 - ry0, 2 * Math.max(...hijos.map(h => h.geometricError)));
  const m = transformRaiz(I.centro_utm, I.z0 + op.ondulacion);
  const root = {
    boundingVolume: { box: [(rx0 + rx1) / 2, (ry0 + ry1) / 2, (rz0 + rz1) / 2, (rx1 - rx0) / 2, 0, 0, 0, (ry1 - ry0) / 2, 0, 0, 0, Math.max(0.5, (rz1 - rz0) / 2)] },
    geometricError: +geRaiz.toFixed(4), refine: "REPLACE", children: hijos, transform: m.transform,
  };
  const tileset = {
    asset: { version: "1.1", generator: "gemelo tuberia/tiles3d " + VERSION_GENERADOR, tilesetVersion: "contrato-v2/" + I.finca_id },
    geometricError: +(2 * root.geometricError).toFixed(4),
    extras: { gemelo: {
      contrato_origen: I.v, finca_id: I.finca_id, srs: "EPSG:25830", centro_utm: I.centro_utm, z0: I.z0, ondulacion_geoide: op.ondulacion,
      marco_local: "x = E − centro_utm[0], y = N − centro_utm[1] (metros de cuadrícula UTM 30N), z = cota − z0; contenido glTF en (x, z, −y)",
      origen_geodesico: m.origen, convergencia_grados: +m.convergenciaGrados.toFixed(6), factor_escala_utm: +m.factorEscala.toFixed(8),
      hoja_m: op.hoja, celdas: op.celdas, prototipos: { "olivo-detalle": triangulos(protos.detalle), "olivo-lejano": triangulos(protos.lejano) }, tipo_generico: -1,
      contrato_tileset: 2, id_fuente: I.copas_id ? "copas_id" : "indice", huella_registro: huella(ids), catalogo_tipos: tipos.catalogo, tipos: tipos.tabla,
    } },
    root,
  };
  fs.writeFileSync(path.join(op.salida, "tileset.json"), JSON.stringify(tileset, null, 1) + "\n");
  filas.sort((a, b) => a.nivel - b.nivel || a.uri.localeCompare(b.uri));
  const niveles = [];
  for (const f of filas) {
    const n = niveles[f.nivel] || (niveles[f.nivel] = { nivel: f.nivel, lado_m: f.lado_m, paso_m: f.paso_m, teselas: 0, tri_terreno: 0, tri_olivos: 0, olivos: 0, bytes: 0, max_tri_tesela: 0, geometricError_max: 0 });
    n.teselas++; n.tri_terreno += f.tri_terreno; n.tri_olivos += f.tri_olivos; n.olivos += f.olivos; n.bytes += f.bytes;
    n.max_tri_tesela = Math.max(n.max_tri_tesela, f.tri_terreno + f.tri_olivos); n.geometricError_max = Math.max(n.geometricError_max, f.geometricError);
  }
  const resumen = { generador: VERSION_GENERADOR, finca_id: I.finca_id, olivos: olivos.length, raiz: { sin_contenido: true, geometricError: root.geometricError, nivel_util_m: S, cuadros: plan.cuadros.map(c => [c.i, c.j]), caja_utm: plan.caja_utm },
    tipos_desconocidos: tipos.desconocidos, niveles, teselas: filas };
  fs.writeFileSync(path.join(op.salida, "resumen.json"), JSON.stringify(resumen, null, 1) + "\n");
  return resumen;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"))) {
  const r = await genera(argumentos(process.argv.slice(2)));
  for (const n of r.niveles) console.log("nivel " + n.nivel + " · " + n.lado_m + " m (paso " + n.paso_m + " m) · " + n.teselas + " teselas · terreno " + n.tri_terreno + " tri · olivos " + n.olivos + " (" + n.tri_olivos + " tri) · " + Math.round(n.bytes / 1024) + " KB · geometricError ≤ " + n.geometricError_max);
}

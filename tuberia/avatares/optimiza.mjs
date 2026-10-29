// Optimiza un VRM con @gltf-transform (ADR-0020 §2): texturas ≤ 1024 px, simplificación hasta el tope de triángulos, sin contorno de MToon, cuantización o meshopt.
// NO borra, funde ni reordena nodos, materiales ni mallas (las extensiones de VRM los nombran por índice: ver vrm.mjs); lo comprueba antes de devolver.
import zlib from "node:zlib";
import sharp from "sharp";
import { NodeIO, PropertyType, ImageUtils } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRMeshQuantization } from "@gltf-transform/extensions";
import { prune, simplify, weld, quantize, meshopt, reorder, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import { EXTENSIONES_VRM, contornos, huesos, HUESOS_OBLIGATORIOS, leeGlb, verificaIndices } from "./vrm.mjs";

/** Topes de partida del ADR-0020 §2 (sin medir en aparatos: P7e los ajusta). Se pueden sustituir con --topes <json>. */
export const TOPES = {
  triangulos_objetivo: 15000, triangulos_max: 20000, bytes_max: 2 * 1024 * 1024, textura_px_max: 1024, texturas_max: 3, materiales_max: 4
};

export const COMPRESIONES = ["cuantizacion", "meshopt", "ninguna"];

let listo = null;
async function preparaWasm() { if (!listo) listo = Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]); await listo; }

export function creaIO() {
  return new NodeIO().registerExtensions([...ALL_EXTENSIONS, ...EXTENSIONES_VRM]).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
}

/** Triángulos, primitivas (≈ llamadas de dibujo), materiales y texturas del documento (un nodo que usa una malla la cuenta cada vez) */
export function mide(doc) {
  let tri = 0, prims = 0;
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh(); if (!m) continue;
    for (const p of m.listPrimitives()) {
      if (p.getMode() !== 4) continue;
      prims++; const ind = p.getIndices(), pos = p.getAttribute("POSITION");
      tri += Math.floor((ind ? ind.getCount() : pos ? pos.getCount() : 0) / 3);
    }
  }
  const usados = new Set();
  for (const n of doc.getRoot().listNodes()) { const m = n.getMesh(); if (m) for (const p of m.listPrimitives()) if (p.getMaterial()) usados.add(p.getMaterial()); }
  const texturas = doc.getRoot().listTextures().map(t => { const s = ImageUtils.getSize(t.getImage(), t.getMimeType()) || [0, 0]; return { nombre: t.getName(), px: Math.max(s[0], s[1]), mime: t.getMimeType() }; });
  return { triangulos: tri, primitivas: prims, materiales: usados.size, texturas: texturas.length, textura_px_max: texturas.reduce((a, t) => Math.max(a, t.px), 0), detalle_texturas: texturas };
}

/** Tamaño tras la compresión de transporte que hace Caddy (`encode zstd gzip`): lo que viaja de verdad */
export function tamanosDeTransporte(buf) {
  const r = { gzip: zlib.gzipSync(buf, { level: 6 }).length };
  if (zlib.zstdCompressSync) r.zstd = zlib.zstdCompressSync(buf).length;
  return r;
}

/**
 * @param {Buffer|Uint8Array} bytes el VRM de origen
 * @param {{topes?:object, compresion?:string}} opc
 * @returns {{bytes:Buffer, informe:object, problemas:string[]}} problemas: lo que el resultado incumple (vacío = cumple los topes)
 */
export async function optimiza(bytes, opc = {}) {
  await preparaWasm();
  const topes = Object.assign({}, TOPES, opc.topes), compresion = opc.compresion || "cuantizacion";
  if (!COMPRESIONES.includes(compresion)) throw new Error("compresión desconocida: " + compresion + " (" + COMPRESIONES.join(", ") + ")");
  const buf = Buffer.from(bytes), { json: json0 } = leeGlb(buf);
  const requeridas = json0.extensionsRequired || [], conocidas = new Set(ALL_EXTENSIONS.map(e => e.EXTENSION_NAME).concat(EXTENSIONES_VRM.map(e => e.EXTENSION_NAME)));
  const desconocida = requeridas.filter(e => !conocidas.has(e) && e !== "KHR_draco_mesh_compression");
  if (desconocida.length) throw new Error("extensiones obligatorias que la tubería no conoce: " + desconocida.join(", "));
  if (requeridas.includes("KHR_draco_mesh_compression")) throw new Error("el origen usa Draco (no se decodifica aquí): exporta el VRM sin compresión");
  const faltan = HUESOS_OBLIGATORIOS.filter(h => huesos(json0)[h] === undefined);
  if (faltan.length) throw new Error("faltan huesos humanoides obligatorios: " + faltan.join(", "));

  const io = creaIO(), doc = await io.readBinary(new Uint8Array(buf));
  const antes = mide(doc), informe = { antes: { triangulos: antes.triangulos, bytes: buf.length, texturas_px_max: antes.textura_px_max } };
  informe.contornos_quitados = contornos(doc, json0, true);

  // texturas: solo se bajan (no se amplían); el formato se conserva (webp/avif exigirían extensiones en el cliente)
  if (antes.textura_px_max > topes.textura_px_max) {
    await doc.transform(textureCompress({ encoder: sharp, resize: [topes.textura_px_max, topes.textura_px_max], resizeFilter: "lanczos3" }));
  }
  // triángulos: se simplifica hasta el objetivo (por debajo del tope) con la misma proporción en todas las mallas
  let m = mide(doc); informe.simplificado = false;
  if (m.triangulos > topes.triangulos_max) {
    informe.simplificado = true; informe.simplificacion_pasadas = 0;
    await doc.transform(weld());
    for (let i = 0; i < 4 && mide(doc).triangulos > topes.triangulos_max; i++) {
      const t = mide(doc).triangulos;
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(0.05, Math.min(0.95, topes.triangulos_objetivo / t * (i ? 0.9 : 1))), error: 0.05, lockBorder: true }));
      informe.simplificacion_pasadas++;
    }
  }
  await doc.transform(prune({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.BUFFER] }));

  if (compresion === "cuantizacion") await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8, quantizeGeneric: 12 }));
  else if (compresion === "meshopt") {
    await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8, quantizeGeneric: 12 }), reorder({ encoder: MeshoptEncoder, target: "size" }), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  }
  m = mide(doc);
  const salida = Buffer.from(await io.writeBinary(doc));
  const { json: json1 } = leeGlb(salida), fallos = verificaIndices(json0, json1);
  if (fallos.length) throw new Error("la optimización cambió lo que las extensiones de VRM nombran por índice: " + fallos.join("; "));

  const problemas = [];
  if (m.triangulos > topes.triangulos_max) problemas.push(m.triangulos + " triángulos > tope " + topes.triangulos_max);
  if (salida.length > topes.bytes_max) problemas.push(salida.length + " bytes > tope " + topes.bytes_max);
  if (m.textura_px_max > topes.textura_px_max) problemas.push("textura de " + m.textura_px_max + " px > " + topes.textura_px_max);
  if (m.texturas > topes.texturas_max) problemas.push(m.texturas + " texturas > tope " + topes.texturas_max);
  if (m.materiales > topes.materiales_max) problemas.push(m.materiales + " materiales > tope " + topes.materiales_max);
  Object.assign(informe, { triangulos: m.triangulos, primitivas: m.primitivas, materiales: m.materiales, texturas: m.texturas, texturas_px_max: m.textura_px_max, bytes: salida.length, compresion, transporte: tamanosDeTransporte(salida), topes });
  return { bytes: salida, informe, problemas };
}

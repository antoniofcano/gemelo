// Comprime un glb de interior ya rematado (exporta.mjs) para el contrato mundo-interior v1.3 (ADR-0035): la geometría con meshopt
// (EXT_meshopt_compression + KHR_mesh_quantization) y las texturas a KTX2 (KHR_texture_basisu). Es opcional: el glb sin comprimir sigue valiendo.
//   node comprime.mjs <carpeta de entrada> <carpeta de salida> [--color etc1s|uastc] [--luz etc1s|uastc] [--sin-meshopt] [--sin-ktx2] [--calidad 1-255]
//   (o, al rematar: node exporta.mjs <glb> --luz <luz_aparte.json> --comprime)
// La carpeta de entrada tiene mundo.json y su glb; en la de salida quedan el mundo.json (igual) y el glb comprimido. Nunca escribe encima de la
// entrada. Después: node tuberia/interiores/valida.js <carpeta de salida>.
// Sin código propio de glTF (regla 12): meshopt() de @gltf-transform/functions con el codificador de meshoptimizer, y el codificador de Basis
// Universal en WebAssembly de ktx2-encoder (el mismo que usa tuberia/suelo/ktx2.mjs). Lo propio es solo lo que el contrato pide:
//   · las máquinas: quantize() pone su corrección (escala y desplazamiento) en la matriz del nodo que lleva la malla, y eso movería el pivote de
//     una pieza que gira (su origen es el pivote, §1e). Antes, la malla de cada nodo de maquinas[] baja a un hijo sin transformación: el nodo
//     de la máquina sigue en su sitio y el que corrige es el hijo. Los clips de animaciones ya los respeta quantize() (crea el hijo él mismo).
//   · el color (baseColorTexture) va en sRGB con mipmaps en sRGB y, si el muestreador repite (el albedo en mosaico), con los mipmaps envueltos;
//     el mapa de luz (occlusionTexture, texCoord 1) también es sRGB de 8 bits (§1d): mismo trato, sin envolver si no repite.
//   · ETC1S por defecto para todo (en el Quest se transcodifica a ETC2 RGB: 0,5 bytes por texel, 1/8 de RGBA8); UASTC (+ zstd) donde se pida
//     con --color o --luz: 1 byte por texel (ASTC 4x4 / BC7), casi sin pérdida, más pesado de bajar.
// Los mipmaps van dentro del KTX2 (three no puede generarlos para una textura comprimida: sin ellos se vería negra).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO, Logger } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureBasisu } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { NodeBasisEncoder } from "ktx2-encoder";

/** Parámetros por defecto (los dice el resumen). Bits de cuantización: posición 16 (≈ 1 mm en una nave de 60 m; 14, el defecto de
 *  @gltf-transform, deja 4 mm entre mallas vecinas cuantizadas por separado) y UV 14 (1/8 de téxel en un mapa de luz de 2048). */
export const OPCIONES = Object.freeze({ color: "etc1s", luz: "etc1s", calidad: 192, esfuerzo: 2, uastc: 2, rdo: 1, posicion: 16, uv: 14, meshopt: true, ktx2: true });
const REPEAT = 10497;
sharp.cache(false); sharp.concurrency(1);

let modulo = null;
async function basis() { if (!modulo) modulo = await new NodeBasisEncoder().init(); return modulo; }

/** RGBA8 (w × h) → KTX2 con mipmaps. modo «etc1s» o «uastc»; srgb: el color (y el mapa de luz) va en sRGB; envuelve: mipmaps de una textura que repite */
export async function codificaKtx2(rgba, w, h, { modo = "etc1s", srgb = true, envuelve = false, calidad = OPCIONES.calidad, esfuerzo = OPCIONES.esfuerzo, uastc = OPCIONES.uastc, rdo = OPCIONES.rdo } = {}) {
  const M = await basis(), e = new M.BasisEncoder();
  try {
    e.setDebug(false); if (e.setStatusOutput) e.setStatusOutput(false);
    e.setTexType(0); e.setCreateKTX2File(true);   // cBASISTexType2D
    if (modo === "uastc") {
      e.setUASTC(true); e.setPackUASTCFlags(uastc); e.setKTX2UASTCSupercompression(true);
      if (rdo > 0) { e.setRDOUASTC(true); e.setRDOUASTCQualityScalar(rdo); }
    } else {
      e.setUASTC(false); e.setQualityLevel(calidad);
      if (e.setETC1SCompressionLevel) e.setETC1SCompressionLevel(esfuerzo); else e.setCompressionLevel(esfuerzo);
    }
    e.setMipGen(true); e.setMipSRGB(srgb); e.setMipWrapping(envuelve);
    if (e.setKTX2AndBasisSRGBTransferFunc) e.setKTX2AndBasisSRGBTransferFunc(srgb); else e.setKTX2SRGBTransferFunc(srgb);
    e.setPerceptual(srgb);
    if (!e.setSliceSourceImage(0, rgba, w, h, 0)) throw new Error("Basis no acepta la imagen de " + w + "×" + h);   // 0 = RAW
    const out = new Uint8Array(Math.max(1 << 16, w * h * 4 * 2)), n = e.encode(out);
    if (!n) throw new Error("Basis no pudo codificar la imagen de " + w + "×" + h);
    return out.slice(0, n);
  } finally { e.delete(); }
}

/** las ranuras de una textura en el documento (baseColorTexture, occlusionTexture…) y si se repite como color en mosaico */
function usos(doc, t) {
  const ranuras = new Set(); let repite = false;
  for (const m of doc.getRoot().listMaterials()) {
    for (const [r, tx, info] of [["baseColorTexture", m.getBaseColorTexture(), m.getBaseColorTextureInfo()], ["occlusionTexture", m.getOcclusionTexture(), m.getOcclusionTextureInfo()],
      ["emissiveTexture", m.getEmissiveTexture(), m.getEmissiveTextureInfo()], ["metallicRoughnessTexture", m.getMetallicRoughnessTexture(), m.getMetallicRoughnessTextureInfo()], ["normalTexture", m.getNormalTexture(), m.getNormalTextureInfo()]]) {
      if (tx !== t) continue;
      ranuras.add(r);
      // solo el color en mosaico: un atlas (el mapa de luz) no se repite aunque su muestreador lo diga (el de por defecto de glTF es REPEAT)
      if (r === "baseColorTexture" && info && (info.getWrapS() === REPEAT || info.getWrapT() === REPEAT)) repite = true;
    }
  }
  return { ranuras: [...ranuras], repite };
}

/** la malla de cada nodo nombrado baja a un hijo sin transformación (ver la cabecera); devuelve cuántos */
export function protegeNodos(doc, nombres) {
  const quiere = new Set(nombres); let n = 0;
  for (const nodo of doc.getRoot().listNodes()) {
    if (!quiere.has(nodo.getName()) || !nodo.getMesh()) continue;
    const hijo = doc.createNode(nodo.getName() + "__malla").setMesh(nodo.getMesh());
    nodo.setMesh(null).addChild(hijo); n++;
  }
  return n;
}

/**
 * comprime(bytes, { protege, color, luz, meshopt, ktx2, calidad }) → { bytes, resumen }
 * protege: nombres de nodos que no pueden cambiar de matriz (los de maquinas[] del manifiesto).
 */
export async function comprime(bytes, opciones = {}) {
  const o = { ...OPCIONES, ...opciones }, protege = o.protege || [];
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const doc = await io.readBinary(bytes);
  // quantize avisa de cada TEXCOORD_0 fuera de [0, 1] (el albedo en mosaico) y lo deja en float: se cuenta en el resumen, sin una línea por malla
  doc.setLogger(new Logger(Logger.Verbosity.ERROR));
  const resumen = { meshopt: false, protegidos: 0, texturas: [], opciones: { color: o.color, luz: o.luz, calidad: o.calidad, posicion: o.posicion, uv: o.uv } };
  if (o.meshopt) {
    resumen.protegidos = protegeNodos(doc, protege);
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "high", quantizePosition: o.posicion, quantizeTexcoord: o.uv }));
    resumen.meshopt = true;
    resumen.uv_float = doc.getRoot().listMeshes().flatMap(me => me.listPrimitives()).filter(p => p.listSemantics().some(k => k.startsWith("TEXCOORD_") && p.getAttribute(k).getComponentType() === 5126)).length;   // FLOAT
  }
  if (o.ktx2) {
    let alguna = false;
    for (const t of doc.getRoot().listTextures()) {
      const mime = t.getMimeType();
      if (mime !== "image/jpeg" && mime !== "image/png") continue;
      const u = usos(doc, t), datos = u.ranuras.some(r => r === "normalTexture" || r === "metallicRoughnessTexture");
      const modo = u.ranuras.includes("occlusionTexture") && !u.ranuras.includes("baseColorTexture") ? o.luz : o.color;
      const { data, info } = await sharp(t.getImage()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const antes = t.getImage().byteLength, t0 = Date.now();
      const k = await codificaKtx2(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, { modo, srgb: !datos, envuelve: u.repite, calidad: o.calidad });
      t.setImage(k).setMimeType("image/ktx2");
      if (t.getURI()) t.setURI(t.getURI().replace(/\.(jpe?g|png)$/i, ".ktx2"));
      resumen.texturas.push({ nombre: t.getName(), ranuras: u.ranuras, modo, lado: [info.width, info.height], repite: u.repite, bytes_antes: antes, bytes: k.byteLength, ms: Date.now() - t0 });
      alguna = true;
    }
    if (alguna) doc.createExtension(KHRTextureBasisu).setRequired(true);
  }
  return { bytes: await io.writeBinary(doc), resumen };
}

/** comprime la carpeta (mundo.json + glb) en otra: protege los nodos de maquinas[] del manifiesto */
export async function comprimeCarpeta(entrada, salida, opciones = {}) {
  if (path.resolve(entrada) === path.resolve(salida)) throw new Error("la salida no puede ser la entrada (no se escribe encima)");
  const man = JSON.parse(fs.readFileSync(path.join(entrada, "mundo.json"), "utf8"));
  const glb = new Uint8Array(fs.readFileSync(path.join(entrada, man.glb)));
  const protege = (man.maquinas || []).map(m => m.nodo);
  const t0 = Date.now(), { bytes, resumen } = await comprime(glb, { ...opciones, protege });
  fs.mkdirSync(salida, { recursive: true });
  fs.writeFileSync(path.join(salida, man.glb), bytes);
  fs.writeFileSync(path.join(salida, "mundo.json"), JSON.stringify(man, null, 1));
  return { ...resumen, mb_antes: +(glb.length / 2 ** 20).toFixed(2), mb: +(bytes.length / 2 ** 20).toFixed(2), segundos: (Date.now() - t0) / 1000 };
}

/** las banderas de la línea de órdenes */
export function banderas(argv) {
  const v = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; }, o = {};
  for (const k of ["color", "luz"]) { const x = v("--" + k); if (x !== undefined) { if (x !== "etc1s" && x !== "uastc") throw new Error("--" + k + " es etc1s o uastc"); o[k] = x; } }
  if (v("--calidad") !== undefined) o.calidad = Math.max(1, Math.min(255, +v("--calidad")));
  if (argv.includes("--sin-meshopt")) o.meshopt = false;
  if (argv.includes("--sin-ktx2")) o.ktx2 = false;
  return o;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [entrada, salida] = process.argv.slice(2).filter(a => !a.startsWith("--") && !/^(etc1s|uastc|\d+)$/.test(a));
  if (!entrada || !salida) { console.error("uso: node comprime.mjs <carpeta de entrada> <carpeta de salida> [--color etc1s|uastc] [--luz etc1s|uastc] [--calidad N] [--sin-meshopt] [--sin-ktx2]"); process.exit(2); }
  const r = await comprimeCarpeta(entrada, salida, banderas(process.argv));
  console.log("COMPRIME " + JSON.stringify(r));
}

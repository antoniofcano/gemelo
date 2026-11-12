// Descomprime un glb de interior para trabajarlo en Blender (eje B): quita EXT_meshopt_compression,
// KHR_mesh_quantization y KHR_texture_basisu (KTX2 → PNG), sin tocar la geometría ni los atributos
// (COLOR_0 y el propio `_LIGHT` siguen ahí, ya en float). No reinventa nada: lee y escribe con
// @gltf-transform, decodifica meshopt con `meshoptimizer` y transcodifica KTX2 con el Basis Universal
// que trae three (el mismo que usa su KTX2Loader); el PNG lo escribe sharp.
//
// Uso: node descomprime.mjs <entrada.glb> <carpeta_salida>
//   escribe <carpeta_salida>/<nombre>.glb (texturas PNG dentro), <carpeta_salida>/texturas/*.png
//   y <carpeta_salida>/recuento.json (antes y después: deben coincidir triángulos, primitivas y materiales).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dequantize } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { nombraImagenes } from "./nombres.mjs";

/** Triángulos, primitivas (≈ llamadas) y materiales del documento, y lo que no puede faltar tras descomprimir */
export function mide(doc) {
  let triangulos = 0, primitivas = 0;
  const materiales = new Set(), atributos = {};
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh(); if (!m) continue;
    for (const p of m.listPrimitives()) {
      primitivas++;
      const ind = p.getIndices(), pos = p.getAttribute("POSITION");
      if (p.getMode() === 4) triangulos += Math.floor((ind ? ind.getCount() : pos.getCount()) / 3);
      if (p.getMaterial()) materiales.add(p.getMaterial().getName());
      for (const s of p.listSemantics()) atributos[s] = (atributos[s] || 0) + 1;
    }
  }
  return { triangulos, primitivas, materiales: materiales.size, texturas: doc.getRoot().listTextures().length, atributos };
}

let basis = null;
/** Carga el transcodificador Basis Universal de three (emscripten; no es un módulo ES: se evalúa en un contexto) */
async function cargaBasis() {
  if (basis) return basis;
  const req = createRequire(import.meta.url);
  const dir = path.join(path.dirname(path.dirname(req.resolve("three"))), "examples", "jsm", "libs", "basis");
  const codigo = fs.readFileSync(path.join(dir, "basis_transcoder.js"), "utf8");
  const ctx = { module: { exports: {} }, console, process, require: req, __filename: path.join(dir, "basis_transcoder.js"), __dirname: dir, WebAssembly, URL, TextDecoder, setTimeout, clearTimeout, performance };
  ctx.exports = ctx.module.exports; ctx.globalThis = ctx;
  vm.runInNewContext(codigo, ctx);
  const fabrica = ctx.module.exports;
  basis = await fabrica({ wasmBinary: fs.readFileSync(path.join(dir, "basis_transcoder.wasm")) });
  basis.initializeBasis();
  return basis;
}

/** KTX2 (ETC1S o UASTC) → RGBA8 del nivel 0 → PNG */
export async function ktx2APng(bytes) {
  const B = await cargaBasis();
  const f = new B.KTX2File(new Uint8Array(bytes));
  try {
    if (!f.isValid()) throw new Error("KTX2 no válido");
    const w = f.getWidth(), h = f.getHeight(), RGBA32 = 13;
    if (!f.startTranscoding()) throw new Error("startTranscoding falló");
    const dst = new Uint8Array(f.getImageTranscodedSizeInBytes(0, 0, 0, RGBA32));
    if (!f.transcodeImage(dst, 0, 0, 0, RGBA32, 0, -1, -1)) throw new Error("transcodeImage falló");
    const conAlfa = !!f.getHasAlpha();
    // los valores se copian tal cual (sin gestión de color: el color sigue en sRGB y los datos, lineales)
    let img = sharp(Buffer.from(dst.buffer, dst.byteOffset, dst.byteLength), { raw: { width: w, height: h, channels: 4 } });
    if (!conAlfa) img = img.removeAlpha();
    const png = await img.png({ compressionLevel: 6 }).toBuffer();
    return { png, ancho: w, alto: h, alfa: conAlfa };
  } finally { f.close(); f.delete(); }
}

export async function descomprime(entrada, salida) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(entrada);
  const antes = mide(doc);

  // nombres de las imágenes según el material y la ranura que las usan
  const texturas = doc.getRoot().listTextures();
  const indice = new Map(texturas.map((t, i) => [t, i]));
  const materiales = doc.getRoot().listMaterials().map(m => ({
    nombre: m.getName(),
    ranuras: { baseColorTexture: indice.get(m.getBaseColorTexture()), normalTexture: indice.get(m.getNormalTexture()), metallicRoughnessTexture: indice.get(m.getMetallicRoughnessTexture()), occlusionTexture: indice.get(m.getOcclusionTexture()), emissiveTexture: indice.get(m.getEmissiveTexture()) }
  }));
  const nombres = nombraImagenes(materiales, texturas.length);

  fs.mkdirSync(path.join(salida, "texturas"), { recursive: true });
  const detalle = [];
  for (const [i, t] of texturas.entries()) {
    if (t.getMimeType() !== "image/ktx2") { detalle.push({ nombre: nombres[i], mime: t.getMimeType() }); continue; }
    const r = await ktx2APng(t.getImage());
    t.setImage(new Uint8Array(r.png)).setMimeType("image/png").setName(nombres[i]).setURI(nombres[i] + ".png");
    fs.writeFileSync(path.join(salida, "texturas", nombres[i] + ".png"), r.png);
    detalle.push({ nombre: nombres[i], ancho: r.ancho, alto: r.alto, alfa: r.alfa, bytes_png: r.png.length, bytes_rgba: r.ancho * r.alto * 4 });
  }

  // geometría en float (Blender y el horneado), sin compresión ni cuantización
  await doc.transform(dequantize());
  for (const e of doc.getRoot().listExtensionsUsed()) {
    const n = e.extensionName;
    if (n === "EXT_meshopt_compression" || n === "KHR_mesh_quantization" || n === "KHR_texture_basisu") e.dispose();
  }
  const despues = mide(doc);
  const nombre = path.basename(entrada).replace(/\.glb$/i, "") + "_descomprimido.glb";
  await io.write(path.join(salida, nombre), doc);
  const recuento = { entrada: path.basename(entrada), salida: nombre, antes, despues, coinciden: antes.triangulos === despues.triangulos && antes.primitivas === despues.primitivas && antes.materiales === despues.materiales, texturas: detalle, extensiones: doc.getRoot().listExtensionsUsed().map(e => e.extensionName) };
  fs.writeFileSync(path.join(salida, "recuento.json"), JSON.stringify(recuento, null, 1));
  return recuento;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [entrada, salida] = process.argv.slice(2);
  if (!entrada || !salida) { console.error("uso: node descomprime.mjs <entrada.glb> <carpeta_salida>"); process.exit(2); }
  const t0 = Date.now();
  const r = await descomprime(entrada, salida);
  console.log(JSON.stringify({ antes: r.antes, despues: r.despues, coinciden: r.coinciden, texturas: r.texturas.length, extensiones: r.extensiones, segundos: (Date.now() - t0) / 1000 }, null, 1));
  if (!r.coinciden) process.exit(1);
}

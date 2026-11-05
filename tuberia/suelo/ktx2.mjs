// Texturas de suelo en KTX2 (EV-1k): de las WebP que ya publica la tubería (apps/web/public/suelo/, con su suelo.json) a UNA textura en array por
// tamaño, con una capa por nivel del motor (13: las clases y sus variantes, en el orden de suelo.json) y su cadena de mipmaps:
//   apps/web/public/suelo/suelo_<px>.ktx2      (y ktx2.json, su manifiesto) RGBA: el color de detalle en RGB y el relieve en A (lo mismo que junta 04f con las WebP), sin espacio de color
// Codificación: UASTC LDR 4x4 con supercompresión zstd (Basis Universal). Por qué UASTC y no ETC1S: el suelo se ve de cerca y en ángulo rasante, y la
// textura es un FACTOR (byte/127,5) que multiplica el color de la ortofoto: los bloques y el color cuantizado de ETC1S se verían como manchas al
// repetirse; en la tarjeta gráfica ocupan lo mismo (con canal alfa, ETC1S también se transcodifica a 1 byte por texel), así que ETC1S solo ahorraría
// disco. UASTC se transcodifica casi sin pérdida a ASTC 4x4 (Quest, iPhone), BC7 (escritorio) o ETC2 RGBA: 1 byte por texel frente a los 4 de RGBA8.
// Codificador: el de Basis Universal en WebAssembly que trae ktx2-encoder (versión fijada en package.json). ktx2-encoder solo sabe hacer 2D y cubos,
// así que se usa su módulo de Basis (NodeBasisEncoder.init) y se le pide una textura en array (cBASISTexType2DArray) con sus propias llamadas.
// Los mipmaps los genera Basis con el filtro envuelto (la textura es periódica) y en lineal (son factores, no colores sRGB).
// Uso:  node tuberia/suelo/ktx2.mjs [--dir <carpeta con suelo.json y las WebP>] [--px 768,384] [--forzar]
// Lo llama el build (apps/web/herramientas/suelo_ktx2.mjs, en `npm run build` de apps/web) y construye.mjs al final. Los KTX2 y su ktx2.json NO se
// versionan (Antonio, 2026-11-05; .gitignore): salen de las WebP versionadas. Si están al día (misma huella de entrada), no se rehacen.
// No necesita las fotos: parte de lo publicado. Determinista: mismas WebP → mismos bytes (el codificador es de un solo hilo).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeBasisEncoder } from "ktx2-encoder";
import { read } from "ktx-parse";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const DIR_PUBLICO = path.join(AQUI, "..", "..", "apps", "web", "public", "suelo");
// parámetros del codificador (los del manifiesto: suelo.json → ktx2.codificacion)
export const OPCIONES = Object.freeze({ formato: "UASTC LDR 4x4", supercompresion: "zstd", rdo: 4, esfuerzo: 2, mipmaps: "envueltos, lineales", transferencia: "lineal" });
const TIPO_ARRAY = 1;   // cBASISTexType2DArray (ktx2-encoder/dist/enum.js)
sharp.cache(false); sharp.concurrency(1);

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
/** nombre del fichero KTX2 de un tamaño (lo pide así 04f_suelo_fotos.js: SueloFotosPuro.ktx2) */
export const nombreKtx2 = px => "suelo_" + px + ".ktx2";

/** las capas del array, en el orden del manifiesto: una por variante de cada clase (el mismo orden que SueloFotosPuro.ficheros del motor) */
export function capasDe(man, px) {
  const o = [];
  for (const c of man.clases) for (let k = 0; k < c.capas; k++) { const n = c.id + (k ? "_v" + k : "") + "_" + px; o.push({ capa: c.capa + k, color: n + ".webp", relieve: n + "_relieve.webp" }); }
  o.forEach((c, i) => { if (c.capa !== i) throw new Error("suelo.json: las capas no van seguidas (capa " + c.capa + " en la posición " + i + ")"); });
  return o;
}

/** junta el color (RGB intercalado) y el relieve (un canal) en RGBA, como juntaG de 04f */
export function rgba(col, rel, n) {
  const d = new Uint8Array(n * 4);
  for (let p = 0; p < n; p++) { d[p * 4] = col[p * 3]; d[p * 4 + 1] = col[p * 3 + 1]; d[p * 4 + 2] = col[p * 3 + 2]; d[p * 4 + 3] = rel[p]; }
  return d;
}

let modulo = null;
async function basis() { if (!modulo) modulo = await new NodeBasisEncoder().init(); return modulo; }

/** codifica las capas (RGBA de px × px) en un KTX2 de array con mipmaps; devuelve los bytes */
export async function codifica(capas, px, opc = OPCIONES) {
  const M = await basis(), e = new M.BasisEncoder();
  try {
    e.setDebug(false); if (e.setStatusOutput) e.setStatusOutput(false); e.setTexType(TIPO_ARRAY); e.setCreateKTX2File(true);
    e.setUASTC(true); e.setPackUASTCFlags(opc.esfuerzo); e.setKTX2UASTCSupercompression(opc.supercompresion === "zstd");
    if (opc.rdo > 0) { e.setRDOUASTC(true); e.setRDOUASTCQualityScalar(opc.rdo); }
    e.setMipGen(true); e.setMipWrapping(true); e.setMipSRGB(false);
    e.setKTX2AndBasisSRGBTransferFunc(false); e.setPerceptual(false);   // factores, no colores: ni sRGB ni pesos perceptuales
    e.setCheckForAlpha(false); e.setForceAlpha(true);                  // el relieve va en A aunque sea casi uniforme
    capas.forEach((d, i) => { if (!e.setSliceSourceImage(i, d, px, px, 0)) throw new Error("Basis no acepta la capa " + i); });
    const out = new Uint8Array(px * px * 4 * capas.length * 2), n = e.encode(out);
    if (!n) throw new Error("Basis no pudo codificar el KTX2 de " + px + " px");
    return out.slice(0, n);
  } finally { e.delete(); }
}

/** lo que dice la cabecera de un KTX2 (para el manifiesto y las pruebas) */
export function describe(bytes) {
  const k = read(bytes), dfd = k.dataFormatDescriptor[0];
  return { ancho: k.pixelWidth, alto: k.pixelHeight, capas: k.layerCount, caras: k.faceCount, niveles: k.levels.length, vkFormat: k.vkFormat,
    supercompresion: k.supercompressionScheme, modeloColor: dfd.colorModel, transferencia: dfd.transferFunction };
}

/** memoria en la tarjeta gráfica tras transcodificar a un formato de bloques de 4×4 con 1 byte por texel (ASTC 4x4, BC7, BC3, ETC2 RGBA): cada nivel, en bloques enteros */
export function bytesGpu(px, capas, niveles, bytesPorBloque = 16) {
  let s = 0; for (let l = 0, w = px; l < niveles; l++, w = Math.max(1, w >> 1)) s += Math.ceil(w / 4) * Math.ceil(w / 4) * bytesPorBloque * capas;
  return s;
}

/** la huella de la entrada de un tamaño: las huellas de sus WebP en suelo.json (en el orden de las capas), las opciones y la versión del codificador */
export function huellaEntrada(man, px, version) {
  const h = crypto.createHash("sha256"); h.update(JSON.stringify({ px, opciones: OPCIONES, basis: version }));
  for (const c of capasDe(man, px)) for (const f of [c.color, c.relieve]) {
    const d = man.ficheros && man.ficheros[f]; if (!d) throw new Error("suelo.json no trae " + f);
    h.update(f + "|" + d.sha256 + "|");
  }
  return h.digest("hex");
}
const versionBasis = () => "ktx2-encoder " + JSON.parse(fs.readFileSync(path.join(AQUI, "node_modules", "ktx2-encoder", "package.json"), "utf8")).version;

/**
 * Las WebP de un tamaño → su KTX2. Los KTX2 NO se versionan (Antonio, 2026-11-05): los genera el build (apps/web/herramientas/suelo_ktx2.mjs)
 * en la carpeta pública, ignorada por git, con su manifiesto suelto ktx2.json (huella de la entrada, bytes y huella del KTX2, memoria en la tarjeta).
 * Si un KTX2 ya está y su entrada no ha cambiado, no se rehace (`forzar` lo rehace). Devuelve el manifiesto y qué tamaños se rehicieron.
 */
export async function construyeKtx2({ dir = DIR_PUBLICO, tamanos, forzar = false } = {}) {
  const man = JSON.parse(fs.readFileSync(path.join(dir, "suelo.json"), "utf8")), tam = tamanos || man.tamanos, version = versionBasis(), fk = path.join(dir, "ktx2.json");
  let k = null; try { k = JSON.parse(fs.readFileSync(fk, "utf8")); } catch (e) { k = null; }
  if (!k || !k.ficheros) k = { ficheros: {} };
  k.naturaleza = "generado por el build desde las WebP de suelo.json (tuberia/suelo/ktx2.mjs); no se versiona"; k.codificacion = { ...OPCIONES }; k.basis = version;
  const rehechos = [];
  for (const px of tam) {
    const nom = nombreKtx2(px), huella = huellaEntrada(man, px, version), prev = k.ficheros[nom], p = path.join(dir, nom);
    if (!forzar && prev && prev.entrada === huella && fs.existsSync(p) && sha(fs.readFileSync(p)) === prev.sha256) continue;   // al día
    const capas = [];
    for (const c of capasDe(man, px)) {
      const col = await sharp(path.join(dir, c.color)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const rel = await sharp(path.join(dir, c.relieve)).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
      if (col.info.width !== px || rel.info.width !== px) throw new Error(c.color + ": no mide " + px + " px");
      capas.push(rgba(col.data, rel.data, px * px));
    }
    const b = await codifica(capas, px), d = describe(b);
    fs.writeFileSync(p, b); rehechos.push(px);
    k.ficheros[nom] = { entrada: huella, bytes: b.length, sha256: sha(b), px, capas: d.capas, niveles: d.niveles, memoria_gpu_mb: Number((bytesGpu(px, d.capas, d.niveles) / 1048576).toFixed(1)) };
  }
  // lo de otros tamaños que ya no están en suelo.json sobra (como las WebP en construye.mjs)
  const vale = new Set(man.tamanos.map(nombreKtx2));
  for (const f of fs.readdirSync(dir)) if (/^suelo_\d+\.ktx2$/.test(f) && !vale.has(f)) fs.rmSync(path.join(dir, f));
  for (const f of Object.keys(k.ficheros)) if (!vale.has(f)) delete k.ficheros[f];
  fs.writeFileSync(fk, JSON.stringify(k, null, 1) + "\n");
  return { ...k, rehechos };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), arg = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const dir = arg("--dir") ? path.resolve(arg("--dir")) : DIR_PUBLICO, px = arg("--px") ? arg("--px").split(",").map(Number) : null, t0 = Date.now();
  construyeKtx2({ dir, tamanos: px, forzar: a.includes("--forzar") }).then(k => {
    console.log(k.rehechos.length ? "rehechos: " + k.rehechos.join(", ") + " px" : "al día: no se rehace nada");
    for (const [n, f] of Object.entries(k.ficheros)) console.log(n.padEnd(16), (f.bytes / 1024).toFixed(0), "KiB en disco ·", f.capas, "capas ·", f.niveles, "niveles · GPU", f.memoria_gpu_mb, "MB");
    console.log(k.codificacion.formato, "+", k.codificacion.supercompresion, "·", ((Date.now() - t0) / 1000).toFixed(0), "s");
  }).catch(e => { console.error(e.message); process.exit(1); });
}

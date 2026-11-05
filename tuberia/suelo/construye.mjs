// Tubería de texturas de suelo y paleta del cielo (EV-1s). De las fotos de campo (FUERA del repo) a:
//   apps/web/public/suelo/<clase>[_v<k>]_<px>.webp           color de detalle repetible, alrededor de 1 (byte/127,5 = factor que MODULA el color
//                                                           del suelo); _v1, _v2: las variantes de la clase (otras fotos de la misma clase)
//   apps/web/public/suelo/<clase>[_v<k>]_<px>_relieve.webp   relieve aproximado (deducido de la claridad), 0,5 = plano
//   apps/web/public/suelo/suelo.json                  manifiesto: clases, su primera capa y cuántas (variantes), metros supuestos, fotos, huellas sha256
//   apps/web/public/suelo/suelo_<px>.ktx2              las mismas WebP en UNA textura en array KTX2 (UASTC + zstd, con mipmaps) por tamaño: ktx2.mjs (EV-1k)
//   tuberia/suelo/paleta_cielo.json                   paleta del atardecer (horizonte, cenit, nube iluminada, nube en sombra)
// Uso:  GEMELO_SUELO_FOTOS=<carpeta con NN.jpg y ficha.json> [GEMELO_CIELO_FOTOS=<carpeta>] node tuberia/suelo/construye.mjs [--salida <dir>]
// Nunca se escriben rutas ni metadatos de las fotos (sharp no copia el EXIF salvo que se le pida). Determinista: misma entrada → mismos bytes.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { construyeKtx2 } from "./ktx2.mjs";
import { deBytes, aBytes, aplana, normaliza, sinCostura, relieve, mitad, costura, colorMedio, hex, cuentaCielo, juntaCielo } from "./nucleo.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RECETAS = JSON.parse(fs.readFileSync(path.join(AQUI, "recetas.json"), "utf8"));
sharp.cache(false); sharp.concurrency(1);   // menos memoria y el mismo resultado en cualquier máquina de 4 núcleos

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

/** recorte cuadrado (en píxeles) dentro del rectángulo [x, y, ancho, alto] en fracciones, centrado */
export function recorteCuadrado(W, H, r) {
  const x = Math.round(r[0] * W), y = Math.round(r[1] * H), w = Math.round(r[2] * W), h = Math.round(r[3] * H), lado = Math.min(w, h, W - x, H - y);
  return { left: x + ((w - lado) >> 1), top: y + ((h - lado) >> 1), width: lado, height: lado };
}

async function leeRecorte(fichero, recorte, N) {
  const base = sharp(fichero).rotate(), m = await base.metadata();
  const giro = m.orientation && m.orientation >= 5, W = giro ? m.height : m.width, H = giro ? m.width : m.height, c = recorteCuadrado(W, H, recorte);
  const { data, info } = await sharp(fichero).rotate().extract(c).resize(N, N, { kernel: "lanczos3" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { im: deBytes(data, info.width, info.height, info.channels), recorte: c, foto: [W, H] };
}

async function webp(buf, w, h, c, calidad) {
  return sharp(buf, { raw: { width: w, height: h, channels: c } }).webp({ quality: calidad, effort: 6, smartSubsample: c === 3 }).toBuffer();
}

/** las fotos de una clase: la principal y sus variantes, cada una con su recorte y el contraste y la saturación de la clase */
export const fotosDe = cl => [{ fuente: cl.fuente, recorte: cl.recorte }].concat((cl.variantes || []).map(v => ({ fuente: v.fuente, recorte: v.recorte })));
/** nombre del fichero de la variante k (0 = la principal) */
export const nombreDe = (id, k, px, suf = "") => id + (k ? "_v" + k : "") + "_" + px + suf + ".webp";

/** una foto de una clase: recorte → aplanar la luz → normalizar → sin costuras → relieve → los tamaños (768 y 384) */
export async function construyeClase(fotos, cl, opc = {}) {
  const N = opc.lado || RECETAS.lado_trabajo, tamanos = opc.tamanos || RECETAS.tamanos, calidad = opc.calidad || RECETAS.calidad_webp;
  const { im, recorte, foto } = await leeRecorte(path.join(fotos, cl.fuente + ".jpg"), cl.recorte, N);
  let f = aplana(im, Math.round(N / 12));
  f = normaliza(f, cl.contraste, cl.saturacion);
  f = sinCostura(f, 0.18);
  let h = relieve(f, 1, Math.round(N / 42));
  const salidas = [];
  for (const px of tamanos) {
    while (f.w > px) { f = mitad(f); h = mitad(h); }
    const col = aBytes(f, 127.5), rel = aBytes(h, 255);
    salidas.push({ px, color: await webp(col, px, px, 3, calidad), relieve: await webp(rel, px, px, 1, calidad), costura: costura(col, px, px, 3).cociente });
  }
  return { recorte, foto, salidas };
}

async function colorReferencia(fotos, ids) {
  const cs = [];
  for (const id of ids) {
    const p = path.join(fotos, id + ".jpg"); if (!fs.existsSync(p)) continue;
    const { data, info } = await sharp(p).rotate().resize(256, 256, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const c = colorMedio(data, info.channels); if (c) cs.push(c);
  }
  return cs.length ? hex([0, 1, 2].map(k => cs.reduce((a, c) => a + c[k], 0) / cs.length)) : null;
}

export async function paletaCielo(fotosCielo) {
  const R = RECETAS.cielo, lee = async (id) => { const { data, info } = await sharp(path.join(fotosCielo, id + ".jpg")).rotate().resize(480, 480, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return cuentaCielo(data, info.width, info.height); };
  const deg = await lee(R.degradado), nubes = []; for (const id of R.nubes) nubes.push(await lee(id));
  const g = juntaCielo([{ horizonte: deg.horizonte, cenit: deg.cenit }]), n = juntaCielo(nubes);
  return { version: 1, naturaleza: "referencia de color de fotos de la finca (2026-11-04, atardecer); el cielo del gemelo es simulado (ilustrativo)", fotos: { degradado: R.degradado, nubes: R.nubes },
    horizonte: g.horizonte, cenit: g.cenit, nube_luz: n.nube_luz, nube_sombra: n.nube_sombra };
}

/** toda la tubería: escribe en `salida` y devuelve el manifiesto */
export async function construye({ fotos, salida, cielo, opc = {} }) {
  if (!fotos || !fs.existsSync(fotos)) throw new Error("falta la carpeta de fotos de suelo (GEMELO_SUELO_FOTOS)");
  fs.mkdirSync(salida, { recursive: true });
  const ficha = fs.existsSync(path.join(fotos, "ficha.json")) ? JSON.parse(fs.readFileSync(path.join(fotos, "ficha.json"), "utf8")) : null;
  const clases = opc.clases || RECETAS.clases, tamanos = opc.tamanos || RECETAS.tamanos;
  const man = { version: 1, naturaleza: "ilustrativo: textura de fotos de la finca; el color lo pone la ortofoto (medido); la clase de cada punto es deducida; el relieve, deducido de la claridad",
    fotos_de: ficha ? ficha.fecha : null, autor: "Antonio (Cano & Damas Oleicultores)", licencia: "LICENCIA.md", sharp: sharp.versions.sharp, tamanos,
    codificacion: { color: "factor = byte / 127,5 (1 = no cambia el color del suelo)", relieve: "0,5 = plano; deducido, no medido" }, clases: [], ficheros: {} };
  const etiqueta = id => ficha && ficha.fotos && ficha.fotos[id] ? ficha.fotos[id][0] : null, costuras = r => Object.fromEntries(r.salidas.map(s => [s.px, Number(s.costura.toFixed(3))]));
  let capa = 0;
  for (const cl of clases) {
    const fs1 = fotosDe(cl), rs = [];
    for (const f of fs1) rs.push(await construyeClase(fotos, { ...cl, fuente: f.fuente, recorte: f.recorte }, opc));
    man.clases.push({ id: cl.id, capa, capas: fs1.length, nombre: cl.nombre, metros: cl.metros, metros_naturaleza: "supuesto (sin referencia de escala)",
      fuente: { foto: cl.fuente, clase_en_ficha: etiqueta(cl.fuente), recorte_px: rs[0].recorte },
      variantes: fs1.slice(1).map((f, k) => ({ capa: capa + k + 1, foto: f.fuente, clase_en_ficha: etiqueta(f.fuente), recorte_px: rs[k + 1].recorte, costura: costuras(rs[k + 1]) })),
      color_referencia: await colorReferencia(fotos, fs1.map(f => f.fuente).concat(cl.color || [])), costura: costuras(rs[0]) });
    rs.forEach((r, k) => {
      for (const s of r.salidas) for (const [suf, buf] of [["", s.color], ["_relieve", s.relieve]]) {
        const nom = nombreDe(cl.id, k, s.px, suf); fs.writeFileSync(path.join(salida, nom), buf); man.ficheros[nom] = { bytes: buf.length, sha256: sha(buf) };
      }
    });
    capa += fs1.length;
  }
  man.capas = capa;
  // lo que quede de una versión anterior (otros tamaños, variantes que ya no están) sobra: el manifiesto dice qué hay
  for (const f of fs.readdirSync(salida)) if (f.endsWith(".webp") && !man.ficheros[f]) fs.rmSync(path.join(salida, f));
  man.memoria_gpu_mb = Object.fromEntries(tamanos.map(px => [px, Number((px * px * 4 * capa * 4 / 3 / 1048576).toFixed(1))]));   // RGBA8 en una textura de capas, con mipmaps
  fs.writeFileSync(path.join(salida, "suelo.json"), JSON.stringify(man, null, 1) + "\n");
  if (opc.ktx2 !== false) man.ktx2 = await construyeKtx2({ dir: salida, tamanos });   // EV-1k: de las WebP recién escritas (y lo apunta en suelo.json)
  let paleta = null;
  if (cielo && fs.existsSync(cielo)) { paleta = await paletaCielo(cielo); fs.writeFileSync(opc.paleta || path.join(AQUI, "paleta_cielo.json"), JSON.stringify(paleta, null, 1) + "\n"); }
  return { manifiesto: man, paleta };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), i = a.indexOf("--salida");
  const salida = i >= 0 ? path.resolve(a[i + 1]) : path.join(AQUI, "..", "..", "apps", "web", "public", "suelo");
  const t0 = Date.now();
  construye({ fotos: process.env.GEMELO_SUELO_FOTOS, cielo: process.env.GEMELO_CIELO_FOTOS, salida }).then(({ manifiesto, paleta }) => {
    const tot = Object.values(manifiesto.ficheros).reduce((s, f) => s + f.bytes, 0);
    for (const c of manifiesto.clases) console.log(c.id.padEnd(13), "fotos", [c.fuente.foto].concat(c.variantes.map(v => v.foto)).join(" "), "costura", JSON.stringify(c.costura), "variantes", JSON.stringify(c.variantes.map(v => v.costura)), "color ref", c.color_referencia);
    console.log("capas:", manifiesto.capas, "· ficheros:", Object.keys(manifiesto.ficheros).length, "·", (tot / 1024).toFixed(0), "KiB · GPU (MB):", JSON.stringify(manifiesto.memoria_gpu_mb), "·", ((Date.now() - t0) / 1000).toFixed(1), "s");
    if (paleta) console.log("cielo:", JSON.stringify(paleta));
  }).catch(e => { console.error(e.message); process.exit(1); });
}

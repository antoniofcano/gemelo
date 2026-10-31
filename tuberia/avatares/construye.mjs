// Construye el catálogo de avatares (ADR-0020 §2-3, P7b, contratos/avatares.md).
//
//   GEMELO_AVATARES_ORIGEN=<carpeta con VRM> GEMELO_AVATARES=<salida> node tuberia/avatares/construye.mjs [opciones]
//     --origen <carpeta>   los VRM de origen (por defecto GEMELO_AVATARES_ORIGEN). Junto a <x>.vrm puede haber <x>.avatar.json con
//                          {id?, nombre?, descripcion?, autor?, licencia:{spdx,url?}, fuente:{nombre,url?}, colores_muneco} (lo escribe descarga.mjs)
//     --salida <carpeta>   dónde escribir <id>.vrm y catalogo.json (por defecto GEMELO_AVATARES); no puede estar dentro del repo salvo en pruebas/salida
//     --compresion <c>     cuantizacion (por defecto) | meshopt | ninguna
//     --topes <json>       otros topes (se mezclan sobre los del ADR: triangulos_objetivo, triangulos_max, bytes_max, textura_px_max, texturas_max, materiales_max)
//   Por cada VRM: lee el meta y RECHAZA el que no deje servirlo a cualquiera para una empresa (vrm.mjs), lo optimiza y comprueba los topes. Los rechazados no
//   se escriben; el resumen (una línea JSON en stdout) los lista con sus motivos y el proceso sale con 1. Avance por stderr.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { leeGlb, leeMeta, evaluaLicencia, spdxDeMeta } from "./vrm.mjs";
import { optimiza, TOPES, COMPRESIONES } from "./optimiza.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, "..", "..");
const requiere = createRequire(import.meta.url);

/** Carpeta absoluta, fuera del repo (salvo pruebas/salida, ignorada por git): los avatares no se versionan (regla 4) */
export function fueraDelRepo(ruta, nombre) {
  const abs = path.resolve(ruta), rel = path.relative(RAIZ, abs);
  if (!rel.startsWith("..") && !path.isAbsolute(rel) && !(rel === path.join("pruebas", "salida") || rel.startsWith(path.join("pruebas", "salida") + path.sep))) {
    throw new Error(nombre + " (" + abs + ") está dentro del repo: los avatares no se versionan; usa una carpeta fuera o pruebas/salida/");
  }
  return abs;
}

export function validaCatalogo(cat) {
  const Ajv2020 = requiere("ajv/dist/2020").default;
  const v = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(fs.readFileSync(path.join(RAIZ, "contratos", "avatares.schema.json"), "utf8")));
  return v(cat) ? [] : v.errors.map(e => (e.instancePath || "/") + ": " + e.message);
}

const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
const PRECOMPRIMIDOS = [
  ["br", b => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } })],
  ["zst", b => zlib.zstdCompressSync(b, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } })],
  ["gz", b => zlib.gzipSync(b, { level: 9 })]
];
const COLOR_DEFECTO = { camisa: "#8a8a8a", piel: "#d9a47c", sombrero: "ninguno" };

/**
 * Un VRM de origen: licencia del meta, optimización y topes. Devuelve { motivos } si se rechaza, o { entrada, bytes, informe } (la entrada del catálogo,
 * sin los campos de v1 que pone quien llama: colores_muneco). `base` = nombre del fichero sin .vrm; `extra` = su <x>.avatar.json
 */
export async function procesa(base, bytes, extra, { compresion = "cuantizacion", topes = TOPES, ids = new Set() } = {}) {
  const motivos = [], id = extra.id || slug(base);
  if (!/^[a-z0-9-]{1,32}$/.test(id)) motivos.push("id no válido: «" + id + "»");
  if (ids.has(id)) motivos.push("id repetido: " + id);
  const meta = leeMeta(leeGlb(bytes).json), ev = evaluaLicencia(meta);
  motivos.push(...ev.motivos.map(m => "licencia: " + m));
  const declarada = extra.licencia && extra.licencia.spdx, deMeta = spdxDeMeta(meta), spdx = declarada || deMeta;
  if (!spdx) motivos.push("licencia: el VRM 1.0 no dice un identificador SPDX; hay que declararlo en " + base + ".avatar.json");
  else if (declarada && deMeta && declarada !== deMeta) motivos.push("licencia: se declara " + declarada + " y el meta del VRM dice " + deMeta);
  if (motivos.length) return { motivos };
  const r = await optimiza(bytes, { compresion, topes });
  if (r.problemas.length) return { motivos: r.problemas.map(p => "topes: " + p) };
  const sha = crypto.createHash("sha256").update(r.bytes).digest("hex"), autor = (extra.autor || meta.autores.join(", "));
  const obligatorio = meta.credito === "required" || /^CC-BY/.test(spdx);
  const nombre = String(extra.nombre || meta.nombre).slice(0, 60);
  const lic = extra.licencia || {};
  const entrada = {
    id, nombre, fichero: id + ".vrm", sha256: sha, bytes: r.bytes.length, vrm_version: meta.version, triangulos: r.informe.triangulos, primitivas: r.informe.primitivas,
    materiales: r.informe.materiales, texturas: r.informe.texturas, autor,
    licencia: { spdx, url: lic.url || meta.licenciaUrl || meta.otraLicenciaUrl || "https://creativecommons.org/publicdomain/zero/1.0/", credito_obligatorio: obligatorio, texto_credito: nombre + " — " + autor + " — " + spdx + (extra.fuente && extra.fuente.nombre ? " — " + extra.fuente.nombre : "") },
    fuente: extra.fuente || { nombre: "origen sin declarar" }
  };
  if (extra.descripcion) entrada.descripcion = String(extra.descripcion).slice(0, 200);
  if (r.informe.contornos_quitados) entrada.contornos_quitados = r.informe.contornos_quitados;
  return { entrada, bytes: r.bytes, informe: r.informe };
}

/** <id>.vrm y sus precomprimidos (Caddy: file_server { precompressed br zstd gzip }: no depende de qué tipos comprime `encode` por defecto) */
export function escribeVRM(s, id, bytes, escritos) {
  fs.writeFileSync(path.join(s, id + ".vrm"), bytes); escritos.push(id + ".vrm");
  for (const [ext, comprime] of PRECOMPRIMIDOS) { fs.writeFileSync(path.join(s, id + ".vrm." + ext), comprime(bytes)); escritos.push(id + ".vrm." + ext); }
}

/**
 * @returns {Promise<{catalogo:object, rechazados:{fichero:string,motivos:string[]}[], escritos:string[]}>}
 */
export async function construye({ origen, salida, compresion = "cuantizacion", topes = {}, log = () => {} }) {
  if (!COMPRESIONES.includes(compresion)) throw new Error("compresión desconocida: " + compresion);
  const o = fueraDelRepo(origen, "el origen"), s = fueraDelRepo(salida, "la salida");
  const archivos = fs.readdirSync(o).filter(f => f.toLowerCase().endsWith(".vrm")).sort();
  if (!archivos.length) throw new Error("no hay ningún .vrm en " + o);
  fs.mkdirSync(s, { recursive: true });
  const todosTopes = Object.assign({}, TOPES, topes), avatares = [], rechazados = [], escritos = [], ids = new Set();
  for (const f of archivos) {
    const base = f.slice(0, -4), lado = path.join(o, base + ".avatar.json");
    const extra = fs.existsSync(lado) ? JSON.parse(fs.readFileSync(lado, "utf8")) : {};
    try {
      const r = await procesa(base, fs.readFileSync(path.join(o, f)), extra, { compresion, topes: todosTopes, ids });
      if (r.motivos) { rechazados.push({ fichero: f, motivos: r.motivos }); log("RECHAZADO " + f + ": " + r.motivos.join("; ")); continue; }
      const entrada = r.entrada;
      entrada.colores_muneco = Object.assign({}, COLOR_DEFECTO, extra.colores_muneco);
      // el orden de las claves, el de siempre (el catálogo es determinista byte a byte)
      const { descripcion, contornos_quitados, ...resto } = entrada; void descripcion; void contornos_quitados;
      const fila = Object.assign(resto, entrada.descripcion ? { descripcion: entrada.descripcion } : {}, entrada.contornos_quitados ? { contornos_quitados: entrada.contornos_quitados } : {});
      ids.add(entrada.id);
      escribeVRM(s, entrada.id, r.bytes, escritos);
      avatares.push(fila);
      log("ok " + f + " → " + entrada.id + ".vrm  " + entrada.triangulos + " tri, " + (r.bytes.length / 1024).toFixed(0) + " kB (" + (r.informe.transporte.gzip / 1024).toFixed(0) + " kB gzip), " + entrada.materiales + " mat, " + entrada.texturas + " tex");
    } catch (e) {
      rechazados.push({ fichero: f, motivos: [e.message] }); log("RECHAZADO " + f + ": " + e.message);
    }
  }
  avatares.sort((a, b) => (a.id < b.id ? -1 : 1));
  const catalogo = { v: 1, compresion, topes: todosTopes, avatares };
  if (avatares.length) {
    const err = validaCatalogo(catalogo); if (err.length) throw new Error("el catálogo no cumple contratos/avatares.schema.json: " + err.join("; "));
    fs.writeFileSync(path.join(s, "catalogo.json"), JSON.stringify(catalogo, null, 2) + "\n"); escritos.push("catalogo.json");
  }
  return { catalogo, rechazados, escritos };
}

async function main() {
  const a = process.argv.slice(2), arg = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  if (a.includes("--ayuda") || a.includes("-h")) { console.error(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 13).join("\n")); return; }
  const origen = arg("--origen") || process.env.GEMELO_AVATARES_ORIGEN, salida = arg("--salida") || process.env.GEMELO_AVATARES;
  if (!origen || !salida) throw new Error("faltan --origen/GEMELO_AVATARES_ORIGEN y/o --salida/GEMELO_AVATARES (carpetas fuera del repo)");
  const topes = arg("--topes") ? JSON.parse(fs.readFileSync(arg("--topes"), "utf8")) : {};
  const r = await construye({ origen, salida, compresion: arg("--compresion") || "cuantizacion", topes, log: m => console.error(m) });
  console.log(JSON.stringify({ avatares: r.catalogo.avatares.map(x => x.id), rechazados: r.rechazados, escritos: r.escritos }));
  if (r.rechazados.length) process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(e => { console.error("construye: " + e.message); process.exit(2); });

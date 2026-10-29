// Construye olivo.iife.js (global OlivoGen, con su three 0.128.0 dentro) con la API de Vite y dice cuánto pesa.
//   node herramientas/iife.mjs [--salida <carpeta>]      (o GEMELO_OLIVO_SALIDA)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const OLIVO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const i = process.argv.indexOf("--salida");
if (i > 0) process.env.GEMELO_OLIVO_SALIDA = path.resolve(process.argv[i + 1]);
process.env.GEMELO_OLIVO_IIFE = "1";
await build({ configFile: path.join(OLIVO, "vite.config.js") });
const f = path.join(process.env.GEMELO_OLIVO_SALIDA || path.join(OLIVO, "dist", "iife"), "olivo.iife.js"), b = fs.readFileSync(f);
console.log(JSON.stringify({ fichero: f, bytes: b.length, gzip: zlib.gzipSync(b).length }));

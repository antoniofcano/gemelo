// EV-1k: paso del build (`npm run build` de apps/web, antes de Vite) que genera los KTX2 del suelo de fotos en apps/web/public/suelo/ desde las WebP
// versionadas, con tuberia/suelo/ktx2.mjs. Los KTX2 NO se versionan (Antonio, 2026-11-05; .gitignore): salen aquí y Vite los copia con lo público,
// en las dos builds. Si están al día (misma huella de entrada que su ktx2.json), no se rehacen; la primera vez tarda ≈ 7 min en el i5.
// Si faltan las dependencias de tuberia/suelo (cd tuberia/suelo && npm ci), AVISA y sigue sin KTX2: el motor (04f_suelo_fotos) vuelve a las WebP.
//   node apps/web/herramientas/suelo_ktx2.mjs        GEMELO_SUELO_KTX2=0 lo salta (con aviso); GEMELO_SUELO_TUBERIA=<carpeta> usa otra tubería (pruebas)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEPENDENCIAS = ["sharp", "ktx2-encoder", "ktx-parse"];

/** por qué no se pueden generar (o null): el paso apagado o la tubería sin instalar */
export function motivoSalto(env = process.env) {
  if (env.GEMELO_SUELO_KTX2 === "0") return "GEMELO_SUELO_KTX2=0";
  const tub = env.GEMELO_SUELO_TUBERIA ? path.resolve(env.GEMELO_SUELO_TUBERIA) : path.join(WEB, "..", "..", "tuberia", "suelo");
  if (!fs.existsSync(path.join(tub, "ktx2.mjs"))) return "no está " + path.join(tub, "ktx2.mjs");
  const faltan = DEPENDENCIAS.filter(d => !fs.existsSync(path.join(tub, "node_modules", d, "package.json")));
  return faltan.length ? "faltan " + faltan.join(", ") + " en tuberia/suelo (cd tuberia/suelo && npm ci)" : null;
}

export async function generaKtx2(env = process.env) {
  const m = motivoSalto(env);
  if (m) { console.warn("aviso (EV-1k): sin KTX2 del suelo de fotos: " + m + "; el motor usará las WebP"); return { generado: false, motivo: m }; }
  const tub = env.GEMELO_SUELO_TUBERIA ? path.resolve(env.GEMELO_SUELO_TUBERIA) : path.join(WEB, "..", "..", "tuberia", "suelo");
  const K = await import(pathToFileURL(path.join(tub, "ktx2.mjs")).href), t0 = Date.now();
  const r = await K.construyeKtx2({ dir: path.join(WEB, "public", "suelo") });
  console.log("KTX2 del suelo: " + (r.rehechos.length ? "rehechos " + r.rehechos.join(", ") + " px en " + Math.round((Date.now() - t0) / 1000) + " s" : "al día"));
  return { generado: true, rehechos: r.rehechos };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // un fallo al codificar tampoco para el build: sin KTX2, el motor vuelve a las WebP (se avisa)
  generaKtx2().catch(e => console.warn("aviso (EV-1k): no se pudieron generar los KTX2 del suelo: " + e.message + "; el motor usará las WebP"));
}

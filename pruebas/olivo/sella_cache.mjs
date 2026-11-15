// Sello de CACHE_VERSION (C-04 / D-01 de la auditoría del constructor, 2026-11-15; regla 13): el SHA-256 de los fuentes que cambian lo que da una
// receta E1/E2 o el árbol montado sin cambiar GEN_VERSION, junto con la CACHE_VERSION con la que se selló. Si cambia uno de esos fuentes y
// CACHE_VERSION no sube, pruebas/guardianes/olivo.test.js falla: la caché de IndexedDB de cada aparato (persistente) y el manifiesto horneado del
// servidor seguirían sirviendo el árbol viejo, porque el motor solo compara gen_version y cache_version.
//   node pruebas/olivo/sella_cache.mjs              sella (solo si CACHE_VERSION subió desde el último sello)
//   node pruebas/olivo/sella_cache.mjs --sin-cambio sella SIN subir CACHE_VERSION: solo si el cambio no cambia ningún árbol (un comentario, un nombre)
// Qué fuentes entran (FUENTES_CACHE) y por qué los demás no:
//   - niveles.js y tarjetas.js: aNivel (E1, E2, E2-VR) y las tarjetas de racimo entran en la receta guardada en la caché y horneada; la geometría
//     unidad de la tarjeta (geosTarjeta) entra en el árbol montado y en los impostores horneados en el servidor.
//   - nucleo.js, tipos.js, azar.js: los gobierna GEN_VERSION (su propio sello, fuente_sha256 de huellas-<GEN_VERSION>.json).
//   - materiales.js, texturas.js, montaje.js, compat.js, impostor.js: no entran en ninguna receta guardada; sí en los atlas de impostores, que llevan
//     su propia clave (huellaPagina de tuberia/olivos/impostores.mjs, vigilada en impostor.test.js) y se vuelven a hornear solos.
//   - silueta.js: se aplica al montar en el motor (?cartulina=silueta) y al leer el atlas; no se guarda en la caché.
//   - horneado.js: su formato lo gobierna FORMATO (cabecera y manifiesto).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
export const FUENTES_CACHE = ["niveles.js", "tarjetas.js"];
export const SELLO = path.join(RAIZ, "pruebas", "olivo", "cache-sello.json");

/** SHA-256 de los fuentes (fin de línea LF) */
export function shaFuentesCache() {
  const h = crypto.createHash("sha256");
  for (const f of FUENTES_CACHE) h.update(f + "\n" + fs.readFileSync(path.join(OLIVO, f), "utf8").replace(/\r\n/g, "\n"));
  return h.digest("hex");
}
/** CACHE_VERSION del código (sin importar cache.js, que necesita idb-keyval) */
export function cacheVersion() { return Number(/export const CACHE_VERSION = (\d+)/.exec(fs.readFileSync(path.join(OLIVO, "cache.js"), "utf8"))[1]); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ant = fs.existsSync(SELLO) ? JSON.parse(fs.readFileSync(SELLO, "utf8")) : null, v = cacheVersion(), sha = shaFuentesCache();
  if (ant && ant.fuentes_sha256 === sha && ant.cache_version === v) { console.log("sin cambios: el sello ya es el de CACHE_VERSION " + v); process.exit(0); }
  if (ant && !(v > ant.cache_version) && !process.argv.includes("--sin-cambio")) {
    console.error("CACHE_VERSION sigue en " + v + " (el sello es de la " + ant.cache_version + "): súbela en apps/web/olivo/cache.js, o pasa --sin-cambio si ningún árbol cambia");
    process.exit(1);
  }
  fs.writeFileSync(SELLO, JSON.stringify({ cache_version: v, fuentes: FUENTES_CACHE, fuentes_sha256: sha, nota: "pruebas/olivo/sella_cache.mjs; si cambia uno de estos fuentes, sube CACHE_VERSION y vuelve a sellar" }, null, 1) + "\n");
  console.log("sellado: CACHE_VERSION " + v + ", fuentes_sha256 = " + sha);
}

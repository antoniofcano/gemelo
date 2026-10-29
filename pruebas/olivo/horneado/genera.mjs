// Regenera pruebas/olivo/horneado/manifiesto-ejemplo.json: el manifiesto de la finca «fixture» con las variantes SINTÉTICAS (sintetica.mjs) que el
// guardián horneado.test.js comprueba (huella y bytes exactos; bytes_br solo > 0, porque depende de la versión de brotli de Node).
//   node pruebas/olivo/horneado/genera.mjs
// Hay que volver a correrlo si cambia el formato (FORMATO), la cuantización o sintetica.mjs: es el candado de que la versión 1 no cambia a escondidas.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, "..", "..", "..");
const { horneaObjeto } = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "olivo", "horneado_node.js")).href);
const { recetaSintetica, GEN_VERSION_SINTETICA, CACHE_VERSION_SINTETICA } = await import(pathToFileURL(path.join(AQUI, "sintetica.mjs")).href);
const CAL = JSON.parse(fs.readFileSync(path.join(RAIZ, "contratos", "epocas-calendario.json"), "utf8"));

export const SEMILLAS = [11, 23], NIVELES = ["E2", "E2VR"], EPOCAS = ["envero", "madura"];
/** La clave sintética: no es la de claveReceta (eso es del motor), pero tiene su misma forma y es única por entrada y nivel */
export const claveSintetica = (e, nivel) => "olivo|" + GEN_VERSION_SINTETICA + "|c" + CACHE_VERSION_SINTETICA + "|" + nivel + "|" + e.tipo + "|" + e.epoca + "|" + e.semilla + "|{}";

const variantes = [];
for (const epoca of EPOCAS) for (const nivel of NIVELES) for (const semilla of SEMILLAS) {
  const r = recetaSintetica({ semilla, nivel, epoca }), o = await horneaObjeto(r, { nivel, clave: claveSintetica(r.entrada, nivel), gen_version: GEN_VERSION_SINTETICA, cache_version: CACHE_VERSION_SINTETICA }, 9);
  variantes.push({ tipo: "centenario3", semilla, nivel, epoca, huella: o.huella, bytes: o.bytes, bytes_br: o.bytes_br });
}
const m = {
  v: 1, finca: "fixture", formato: 1, gen_version: GEN_VERSION_SINTETICA, cache_version: CACHE_VERSION_SINTETICA, horneado_en: "2026-10-29T12:00:00Z", brotli: 9, actual: "envero",
  epocas: EPOCAS.map(e => ({ epoca: e, desde: CAL.comun[e].desde, hasta: CAL.comun[e].hasta })), variantes, propios: { activos: false },
};
fs.writeFileSync(path.join(AQUI, "manifiesto-ejemplo.json"), JSON.stringify(m, null, 2) + "\n");
console.log(variantes.length + " variantes; la primera " + variantes[0].huella + " (" + variantes[0].bytes + " B, " + variantes[0].bytes_br + " B brotli 9)");

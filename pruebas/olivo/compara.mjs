// Compara el módulo apps/web/olivo/ con las huellas del oráculo (pruebas/olivo/huellas-<GEN_VERSION>.json), sin la referencia.
//   node pruebas/olivo/compara.mjs [--todos] [--parte k/n]   sin --todos, una semilla por tipo y época (49 casos); con --todos, los 245;
//                                                            --parte k/n hace solo uno de cada n (para repartirlo en varios procesos)
// Sale con 1 si alguna huella difiere. Lo usa el guardián pruebas/guardianes/olivo.test.js.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const G = await import(pathToFileURL(path.join(OLIVO, "node_modules", "three-gen", "build", "three.module.js")).href);
const { receta, triangulos } = await import(pathToFileURL(path.join(OLIVO, "nucleo.js")).href);
const { huella, huellaNiveles } = await import(pathToFileURL(path.join(OLIVO, "huella.js")).href);
const { GEN_VERSION } = await import(pathToFileURL(path.join(OLIVO, "version.js")).href);

/** SHA-256 del código que decide el árbol (lo mismo calcula pruebas/guardianes/olivo.test.js) */
export function fuenteSha() {
  const h = crypto.createHash("sha256");
  for (const f of FUENTES) h.update(f + "\n" + fs.readFileSync(path.join(OLIVO, f), "utf8").replace(/\r\n/g, "\n"));
  return h.digest("hex");
}
export const FUENTES = ["azar.js", "nucleo.js", "tipos.js"];
const H = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "olivo", "huellas-" + GEN_VERSION + ".json"), "utf8"));
const todos = process.argv.includes("--todos");
const parte = /^(\d+)\/(\d+)$/.exec(process.argv[process.argv.indexOf("--parte") + 1] || "");   // --parte k/n: el k-ésimo de n trozos (en paralelo)
let casos = todos ? H.casos : H.casos.filter((c, i) => i % 5 === (Math.floor(i / 5) % 5));   // una semilla por tipo y época, rotando
if (process.argv.includes("--parte") && parte) casos = casos.filter((c, i) => i % Number(parte[2]) === Number(parte[1]));
const mal = [], tiempos = [];
for (const c of casos) {
  const t0 = performance.now(), r = receta(G, { tipo: c.tipo, epoca: c.epoca, semilla: c.semilla }); tiempos.push(performance.now() - t0);
  const h = await huella(r);
  const hn = await huellaNiveles(r);
  if (h !== c.sha256 || hn !== c.niveles_sha256 || triangulos(r) !== c.triangulos) mal.push({ caso: c.tipo + "/" + c.epoca + "/" + c.semilla, esperado: c.sha256.slice(0, 12), obtenido: h.slice(0, 12), tri: [c.triangulos, triangulos(r)] });
}
console.log(JSON.stringify({ gen_version: GEN_VERSION, huellas_de: H.gen_version, casos: casos.length, distintos: mal.length, mal: mal.slice(0, 10),
  ms_medio: Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length), ms_max: Math.round(Math.max(...tiempos)) }));
// --sella (con --todos y todo igual): apunta en las huellas el SHA-256 del código del núcleo (nucleo.js, tipos.js, azar.js). Si luego cambia ese
// código sin subir GEN_VERSION, el guardián falla con «sube GEN_VERSION» aunque las huellas sigan cuadrando (puede haber casos sin cubrir).
if (process.argv.includes("--sella") && todos && !mal.length && H.gen_version === GEN_VERSION) {
  H.fuente_sha256 = fuenteSha();
  const cab = Object.assign({}, H); delete cab.casos;
  fs.writeFileSync(path.join(RAIZ, "pruebas", "olivo", "huellas-" + GEN_VERSION + ".json"), JSON.stringify(cab, null, 1).replace(/\n}$/, ',\n "casos": [\n') + H.casos.map(c => "  " + JSON.stringify(c)).join(",\n") + "\n ]\n}\n");
  console.log("sellado: fuente_sha256 = " + H.fuente_sha256);
}
process.exit(mal.length || H.gen_version !== GEN_VERSION ? 1 : 0);

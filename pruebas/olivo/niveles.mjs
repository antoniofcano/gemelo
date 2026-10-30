// Recuentos de los niveles de detalle (apps/web/olivo/niveles.js) de centenario 3 pies, envero, semilla 7. Hasta O9b eran los de la maqueta
// «Olivos en el gemelo» (E0 102 978, E1 48 378, E2 19 366, E2-VR 14 618); desde O9b (ADR-0022 §3) E1 y E2 llevan las ramitas en tarjetas de
// racimo (tarjetas.js) y E2-VR = E2. Comprueba además: una sola pieza de tarjetas por nivel con ~RACIMOS racimos, las olivas en el atlas en E1 y
// E2 (geo «tarjetaO», sin octaedros ni puntos), sin olivas en una época sin fruto (geo «tarjeta»), y que es determinista.
// Imprime JSON; sale con 1 si algo no cuadra. Lo usa pruebas/guardianes/olivo.test.js.
//   node pruebas/olivo/niveles.mjs [tipo epoca semilla]   (con argumentos, solo mide)
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const imp = f => import(pathToFileURL(path.join(OLIVO, f)).href);
const G = await imp("node_modules/three-gen/build/three.module.js");
const { receta } = await imp("nucleo.js");
const { aNivel, triangulosNivel, llamadasNivel, NIVELES } = await imp("niveles.js");
const { RACIMOS } = await imp("tarjetas.js");

export const ESPERADO = { E0: 102978, E1: 23080, E2: 10702, E2VR: 10702 };
const [tipo, epoca, semilla] = process.argv.length > 4 ? [process.argv[2], process.argv[3], Number(process.argv[4])] : ["centenario3", "envero", 7];
const r = receta(G, { tipo, epoca, semilla });
const salida = { tipo, epoca, semilla, niveles: {} }, mal = [];
for (const k of NIVELES) {
  const t0 = performance.now(), n = aNivel(r, k), ms = performance.now() - t0;
  salida.niveles[k] = { triangulos: triangulosNivel(n), llamadas: llamadasNivel(n), ms: +ms.toFixed(1) };
  if (process.argv.length <= 4 && triangulosNivel(n) !== ESPERADO[k]) mal.push(k + ": " + triangulosNivel(n) + " ≠ " + ESPERADO[k]);
}
// tarjetas: una pieza por nivel, cerca de RACIMOS (± 10 %), olivas en el atlas; determinista; sin fruto, sin olivas
const tarj = k => aNivel(r, k).piezas.filter(p => p.rol === "ramitas");
salida.tarjetas = {};
for (const k of ["E1", "E2", "E2VR"]) {
  const t = tarj(k), obj = RACIMOS[k === "E1" ? "E1" : "E2"];
  salida.tarjetas[k] = t.map(p => ({ geo: p.geo, n: p.n }));
  if (t.length !== 1 || t[0].clase !== "instancias" || !/^tarjeta/.test(t[0].geo)) { mal.push(k + ": no hay UNA pieza de tarjetas"); continue; }
  if (Math.abs(t[0].n - obj) > 0.1 * obj) mal.push(k + ": " + t[0].n + " racimos (objetivo " + obj + ")");
  if (Buffer.compare(Buffer.from(t[0].matrices.buffer), Buffer.from(tarj(k)[0].matrices.buffer))) mal.push(k + ": tarjetas no deterministas");
  for (let i = 0; i < t[0].matrices.length; i++) if (!Number.isFinite(t[0].matrices[i])) { mal.push(k + ": matriz no finita"); break; }
}
if (process.argv.length <= 4) {
  const ol = k => aNivel(r, k).piezas.filter(p => p.rol === "olivas");
  for (const k of ["E1", "E2"]) if (tarj(k)[0].geo !== "tarjetaO" || ol(k).length || aNivel(r, k).piezas.some(p => p.clase === "puntos")) mal.push(k + ": las olivas no van en el atlas");
  const sinFruto = aNivel(receta(G, { tipo, epoca: "reposo", semilla }), "E2").piezas.filter(p => p.rol === "ramitas");
  if (sinFruto.length !== 1 || sinFruto[0].geo !== "tarjeta") mal.push("reposo: E2 con el atlas de olivas");
}
salida.mal = mal;
console.log(JSON.stringify(salida));
process.exit(mal.length ? 1 : 0);

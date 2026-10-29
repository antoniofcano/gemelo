// Recuentos de los niveles de detalle (apps/web/olivo/niveles.js) frente a los medidos en la maqueta «Olivos en el gemelo»
// (centenario 3 pies, envero, semilla 7): E0 102 978, E1 48 378, E2 19 366, E2-VR 14 618 triángulos. Y el aclareo: la mitad exacta de las
// ramitas, siempre las mismas. Imprime JSON; sale con 1 si algo no cuadra. Lo usa pruebas/guardianes/olivo.test.js.
//   node pruebas/olivo/niveles.mjs [tipo epoca semilla]   (con argumentos, solo mide)
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const imp = f => import(pathToFileURL(path.join(OLIVO, f)).href);
const G = await imp("node_modules/three-gen/build/three.module.js");
const { receta } = await imp("nucleo.js");
const { aNivel, triangulosNivel, llamadasNivel, NIVELES } = await imp("niveles.js");

export const ESPERADO = { E0: 102978, E1: 48378, E2: 19366, E2VR: 14618 };
const [tipo, epoca, semilla] = process.argv.length > 4 ? [process.argv[2], process.argv[3], Number(process.argv[4])] : ["centenario3", "envero", 7];
const r = receta(G, { tipo, epoca, semilla });
const salida = { tipo, epoca, semilla, niveles: {} }, mal = [];
for (const k of NIVELES) {
  const t0 = performance.now(), n = aNivel(r, k), ms = performance.now() - t0;
  salida.niveles[k] = { triangulos: triangulosNivel(n), llamadas: llamadasNivel(n), ms: +ms.toFixed(1) };
  if (process.argv.length <= 4 && triangulosNivel(n) !== ESPERADO[k]) mal.push(k + ": " + triangulosNivel(n) + " ≠ " + ESPERADO[k]);
}
// aclareo: mitad exacta por malla de ramitas (redondeando hacia arriba) y determinista (dos veces, mismas matrices)
const ram0 = r.piezas.filter(p => p.rol === "ramitas"), a1 = aNivel(r, "E2VR").piezas.filter(p => p.rol === "ramitas"), a2 = aNivel(r, "E2VR").piezas.filter(p => p.rol === "ramitas");
salida.aclareo = ram0.map((p, i) => ({ antes: p.n, despues: a1[i].n }));
ram0.forEach((p, i) => { if (a1[i].n !== Math.ceil(p.n / 2)) mal.push("aclareo: " + a1[i].n + " de " + p.n); if (Buffer.compare(Buffer.from(a1[i].matrices.buffer), Buffer.from(a2[i].matrices.buffer))) mal.push("aclareo no determinista"); });
salida.mal = mal;
console.log(JSON.stringify(salida));
process.exit(mal.length ? 1 : 0);

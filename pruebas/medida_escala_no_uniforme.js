"use strict";
// AG-1.11. *** Node puro, sin navegador ni three: los ns NO son los de Chrome ni los de una Quest (regla 7) ***
// Reproduce SOLO la cuenta de 3d-tiles-renderer 0.5.3 que toca la escala no uniforme del grupo (la exageración vertical, colocaGrupo de
// apps/web/motor/04b_escena3d.js): la librería no usa la escala (`invScale` se declara y no se lee); lleva la cámara al marco local de la tesela con
// group.matrixWorldInverse y calcula error = geometricError / (distancia_local · sseDenominator)  (TilesRenderer.js, calculateTileViewError).
// Con exag > 1 la distancia local acorta el eje vertical por 1/exag. Este script da: (a) cuánto cambia el error pedido frente a exag = 1, (b) cuánto se aleja de
// «el error que ve el ojo en el mundo exagerado» (modelo: el error vertical geometricError·exag se ve con la componente perpendicular a la mirada), (c) cuánto
// se mueve la distancia a la que una tesela cambia de nivel y (d) los ns por llamada de la cuenta.
//   node pruebas/medida_escala_no_uniforme.js
// Exporta las funciones puras para pruebas/guardianes/escala_no_uniforme.test.js.

/** distancia local de la cámara a un punto de la tesela, con la cámara a distancia de mundo D y elevación `th` (rad) sobre la horizontal */
function distLocal(D, th, exag) { return D * Math.sqrt(Math.cos(th) ** 2 + (Math.sin(th) / exag) ** 2); }
/** error en px que calcula la librería (k = sseDenominator = 2·tan(fov/2)/alto_px) */
function errorLibreria(ge, D, th, exag, k) { return ge / (distLocal(D, th, exag) * k); }
/** error en px «físico» del mundo exagerado (MODELO): vertical ge·exag, visible en proporción cos(th) (la parte perpendicular a la mirada) */
function errorVisto(ge, D, th, exag, k) { return ge * exag * Math.cos(th) / (D * k); }
/** elevación (rad) donde la librería acierta (errorLibreria = errorVisto); por debajo pide de menos, por encima de más. exag > 1 */
function elevacionDeCruce(exag) {
  const c = (-1 + Math.sqrt(1 + 4 * (exag * exag - 1))) / (2 * (exag * exag - 1));   // (e²−1)c²+c−1=0, con c = cos²θ
  return Math.acos(Math.sqrt(c));
}
/** distancia de mundo a la que una tesela de error `ge` pasa a su hijo (error = objetivo) */
function distanciaDeCambio(ge, th, exag, k, objetivo) { return ge / (objetivo * k * Math.sqrt(Math.cos(th) ** 2 + (Math.sin(th) / exag) ** 2)); }

module.exports = { distLocal, errorLibreria, errorVisto, elevacionDeCruce, distanciaDeCambio };

if (require.main === module) {
  const alto = 1080, fov = 60 * Math.PI / 180, k = 2 * Math.tan(fov / 2) / alto, OBJ = 16, ge = 8, D = 300, deg = Math.PI / 180;
  console.log("Cuenta de la librería, fov 60°, " + alto + " px, errorTarget " + OBJ + " px, tesela ge = " + ge + " m a " + D + " m (MODELO, no medido en pantalla)\n");
  console.log("exag | elev | est/est(exag=1) | est/visto | distancia de cambio de nivel vs exag=1");
  for (const e of [1.25, 2, 3]) for (const t of [0, 15, 30, 45, 60, 90]) {
    const th = t * deg, est = errorLibreria(ge, D, th, e, k), est1 = errorLibreria(ge, D, th, 1, k), vis = errorVisto(ge, D, th, e, k);
    console.log(String(e).padStart(4) + " | " + String(t).padStart(3) + "° | " + (est / est1).toFixed(2).padStart(15) + " | " + (vis > 1e-12 ? (est / vis).toFixed(2) : "(n/a)").padStart(9) + " | x" + (distanciaDeCambio(ge, th, e, k, OBJ) / distanciaDeCambio(ge, th, 1, k, OBJ)).toFixed(2));
  }
  for (const e of [1.25, 2, 3]) console.log("exag " + e + ": la librería acierta con el modelo a " + (elevacionDeCruce(e) / deg).toFixed(1) + "° de elevación");

  // coste: la cuenta por tesela (distancia a una caja alineada en el marco local + error); `ex` solo cambia la cámara local, no el trabajo
  const hr = () => Number(process.hrtime.bigint()), caja = { x0: -128, x1: 128, y0: 0, y1: 40, z0: -128, z1: 128 }, cam = { x: 400, y: 150, z: 90 };
  const cuenta = (c, ex) => {
    const dx = Math.max(caja.x0 - c.x, 0, c.x - caja.x1), dy = Math.max(caja.y0 - c.y / ex, 0, c.y / ex - caja.y1), dz = Math.max(caja.z0 - c.z, 0, c.z - caja.z1);
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz); return d === 0 ? Infinity : ge / (d * k);
  };
  const mediana = a => a.slice().sort((x, y) => x - y)[a.length >> 1], N = 2e6, res = { 1: [], 3: [] };
  for (let r = 0; r < 9; r++) for (const ex of [1, 3]) { let s = 0; const t0 = hr(); for (let i = 0; i < N; i++) s += cuenta(cam, ex) + i * 1e-12; res[ex].push((hr() - t0) / N); if (s === 42) console.log(s); }
  console.log("\nns por tesela visitada (mediana de 9, Node " + process.version + ", RELATIVO): exag 1: " + mediana(res[1]).toFixed(1) + " ns, exag 3: " + mediana(res[3]).toFixed(1) + " ns");
  console.log("A 1000 teselas visitadas por recorrido (SUPUESTO, sin medir en Chrome): " + (mediana(res[3]) / 1000 * 1000).toFixed(1) + " us por fotograma como mucho; la escala no uniforme no añade trabajo a la cuenta. Lo caro era console.warn (AG-1.9).");
}

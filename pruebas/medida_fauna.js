"use strict";
// Microbanco de la fauna y el nivel del sol (AG-1.4b). *** Node, relativo, no Chrome ***: los ms de aquí NO son los de Chrome ni los de una Quest (regla 7);
// solo comparan la versión anterior (pruebas/guardianes/referencias/16b_fauna_antes.js + nivel() de antes) con la de ahora, en la misma máquina y a la vez.
// Lo que se corre: N fotogramas de la fauna (actualiza: bandadas, posadas, conejos, empaquetado de aves) con el jugador paseando de día, con NOLIVOS olivos,
// REPS veces (mundo nuevo cada una, mismas semillas), alternando antes/ahora; se da la mediana de ms por fotograma y el reparto. Con `--expose-gc` también da
// los bytes que reserva el montón por fotograma (indicativo: el recolector puede pasar entre medias).
//   node --expose-gc pruebas/medida_fauna.js [N] [REPS] [NOLIVOS]
const F = require("./guardianes/_fauna_mundo");
const N = Number(process.argv[2]) || 2000, REPS = Number(process.argv[3]) || 9, NOLIVOS = Number(process.argv[4]) || 3000, CALENTAR = 300;
const mediana = a => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
const hr = () => Number(process.hrtime.bigint()) / 1e6;

function corre(THREE, fichero, copas) {
  const m = F.construye(THREE, fichero, copas, 77), dtR = F.semilla(5), dts = [];
  for (let i = 0; i < CALENTAR + N; i++) dts.push(0.012 + dtR() * 0.012);
  m.g.cur.ms = Date.UTC(2026, 5, 21, 10, 0); m.Bus.emite("paseo:entra");
  const guion = () => ({});
  for (let f = 0; f < CALENTAR; f++) m.fotograma(f, dts[f], 1500, guion);
  if (global.gc) global.gc();
  const h0 = process.memoryUsage().heapUsed, t0 = hr();
  for (let f = CALENTAR; f < CALENTAR + N; f++) m.fotograma(f, dts[f], 1500, guion);
  const t1 = hr(), h1 = process.memoryUsage().heapUsed;
  return { ms: (t1 - t0) / N, bytes: global.gc ? (h1 - h0) / N : null };
}

(async () => {
  const THREE = await F.cargaThree(), copas = F.disenoOlivos(NOLIVOS, 11), res = { antes: [], ahora: [] }, mem = { antes: [], ahora: [] };
  console.log("Microbanco de la fauna (Node " + process.version + ", RELATIVO, NO Chrome): " + N + " fotogramas x " + REPS + " repeticiones, " + copas.length + " olivos en el mundo de prueba");
  for (let r = 0; r < REPS; r++) {
    for (const [k, fichero] of [["antes", "pruebas/guardianes/referencias/16b_fauna_antes.js"], ["ahora", "apps/web/motor/16b_fauna.js"]]) {
      const x = corre(THREE, fichero, copas); res[k].push(x.ms); if (x.bytes !== null) mem[k].push(x.bytes);
    }
  }
  const f3 = v => v.toFixed(4), a = mediana(res.antes), b = mediana(res.ahora);
  console.log("fauna, ms por fotograma (mediana)  antes: " + f3(a) + "   ahora: " + f3(b) + "   ahora/antes: " + (b / a).toFixed(2));
  console.log("  reparto antes : " + res.antes.map(f3).join(" ") + "\n  reparto ahora : " + res.ahora.map(f3).join(" "));
  if (mem.antes.length) console.log("heap reservado por fotograma (mediana, indicativo)  antes: " + mediana(mem.antes).toFixed(0) + " B   ahora: " + mediana(mem.ahora).toFixed(0) + " B");
  else console.log("(sin --expose-gc no se mide el montón)");

  // el nivel del sol: 1 millón de llamadas, con el ms cambiando una vez de cada 6 (un fotograma pide el nivel unas 6 veces: tiempo, fauna, quad/dron, paisaje, sonido, huellas)
  // (dentro de una función cada una, como en el motor: los globales de un contexto vm son más lentos de leer y falsearían la comparación)
  const base = "\"use strict\"; var LAT = 37.73, LON = -4.006;\n";
  const corA = new Function(base + F.NIVEL_ANTES + "\nreturn function (n) { var s = 0; for (var i = 0; i < n; i++) s += nivel(1.7e12 + ((i / 6) | 0) * 16.7).d; return s; };")();
  const corB = new Function(base + F.nivelNuevo() + "\nreturn function (n, sal) { var s = 0; for (var i = 0; i < n; i++) s += nivelEn(1.7e12 + ((i / 6) | 0) * 16.7, sal).d; return s; };")();
  const antes = { run: corA }, ahora = { run: corB }, sal = { s: { alt: 0, az: 0 }, d: 0 };
  const M = 600000, ta = [], tb = []; let chk1, chk2;
  for (let r = 0; r < REPS; r++) {
    let t = hr(); chk1 = antes.run(M); ta.push((hr() - t) / M * 1e6);
    t = hr(); chk2 = ahora.run(M, sal); tb.push((hr() - t) / M * 1e6);
  }
  console.log("nivel del sol, ns por llamada (mediana, " + M + " llamadas, 6 llamadas por cada ms distinto)  nivel() de antes: " + mediana(ta).toFixed(0) + "   nivelEn(): " + mediana(tb).toFixed(0) + "   (suma de control igual: " + (chk1 === chk2) + ")");
})();

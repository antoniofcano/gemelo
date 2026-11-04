"use strict";
// Microbanco de AG-1.4c. *** Node, relativo, no Chrome ***: los ms de aquí NO son los de Chrome ni los de una Quest (regla 7); solo comparan la versión anterior
// (fotos en pruebas/guardianes/referencias/ y en el propio banco) con la de ahora, en la misma máquina y a la vez, alternando. Con `--expose-gc` también da los bytes que
// reserva el montón por llamada (indicativo: el recolector puede pasar entre medias).
//   node --expose-gc pruebas/medida_bucle.js [REPS]
const T = require("./guardianes/_tiempo_mundo"), F = require("./guardianes/_fauna_mundo"), R = require("./guardianes/_reservas");
const { lee } = require("./guardianes/_util");
const REPS = Number(process.argv[2]) || 9;
const mediana = a => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
const hr = () => Number(process.hrtime.bigint()) / 1e6;

/** corre `n` llamadas de cada versión, `REPS` veces alternando, y da la mediana de µs por llamada y de bytes por llamada */
function compara(titulo, n, hazAntes, hazAhora) {
  const res = { antes: [], ahora: [] }, mem = { antes: [], ahora: [] };
  for (let r = 0; r < REPS; r++) {
    for (const [k, mk] of [["antes", hazAntes], ["ahora", hazAhora]]) {
      const paso = mk(); for (let i = 0; i < Math.min(n, 300); i++) paso(i);   // calentar
      if (global.gc) global.gc();
      const h0 = process.memoryUsage().heapUsed, t0 = hr(); for (let i = 0; i < n; i++) paso(i); const t1 = hr(), h1 = process.memoryUsage().heapUsed;
      res[k].push((t1 - t0) * 1000 / n); if (global.gc) mem[k].push(Math.max(0, h1 - h0) / n);
    }
  }
  const a = mediana(res.antes), b = mediana(res.ahora);
  console.log(titulo + ": µs por llamada (mediana de " + REPS + ")  antes: " + a.toFixed(3) + "   ahora: " + b.toFixed(3) + "   ahora/antes: " + (b / a).toFixed(2) +
    (mem.antes.length ? "   |  heap por llamada  antes: " + mediana(mem.antes).toFixed(0) + " B   ahora: " + mediana(mem.ahora).toFixed(0) + " B" : ""));
}

(async () => {
  const THREE = await F.cargaThree();
  console.log("Microbanco AG-1.4c (Node " + process.version + ", RELATIVO, NO Chrome)" + (global.gc ? "" : "  [sin --expose-gc no se mide el montón]"));

  // ---- 1 · distArroyo: 7 cauces sintéticos de 150 puntos (no son los de Hituelo), puntos al azar del suelo
  {
    const s = F.semilla(7), E = [];
    for (let c = 0; c < 7; c++) { let x = (s() - 0.5) * 1200, y = (s() - 0.5) * 1200, an = s() * 6; for (let i = 0; i < 150; i++) { E.push([x, y]); an += (s() - 0.5) * 0.5; x += Math.cos(an) * 8; y += Math.sin(an) * 8; } }
    const pts = []; for (let i = 0; i < 4096; i++) pts.push([(s() - 0.5) * 1400, (s() - 0.5) * 1400]);
    const antes = () => { const f = function (x, y) { var m = 1e9; for (var i = 0; i < E.length; i += 2) { var d = Math.hypot(E[i][0] - x, E[i][1] - y); if (d < m) m = d; } return m; }; return (i) => f(pts[i & 4095][0], pts[i & 4095][1]); };
    const src = lee("apps/web/motor/18_paisaje.js"), a = src.indexOf("var ejeCel = 64"), b = src.indexOf("function distArroyo("), cu = R.cuerpo(src, "function distArroyo(");
    const ahora = () => { const f = new Function("ejeArroyo", src.slice(a, b + src.slice(b).indexOf(cu) + cu.length + 1) + "\nreturn distArroyo;")(E); return (i) => f(pts[i & 4095][0], pts[i & 4095][1]); };
    compara("1 distArroyo (" + E.length + " puntos, la mitad cuenta)", 20000, antes, ahora);
  }

  // ---- 2 · actualizaTiempo + pintaNubes: un día entero de fotogramas con nubosidad media
  {
    const mk = (nuevo) => () => {
      const m = T.mundoTiempo(THREE, nuevo), r = F.semilla(9); m.W.cur.ms = m.W.meta.ms = Date.UTC(2026, 5, 21, 10); Object.assign(m.W.meta, { nub: 70, viento: 4, dir: 200, lluvia: 0, hr: 60, temp: 15 });
      return (i) => { m.W.camera.position.set(100 * Math.sin(i * 0.01), 30, 100 * Math.cos(i * 0.01)); m.W.camera.updateMatrixWorld(true); m.W.cur.ms += 20000; m.W.meta.ms += 20000; m.api.act(0.016 + 0.004 * r()); };
    };
    compara("2 actualizaTiempo + pintaNubes (incluye el cuerpo de la prueba: cámara, avance del reloj)", 3000, mk(false), mk(true));
  }

  // ---- 3 · el nivel del sol que piden paisaje, sonido y huellas cada fotograma (3 llamadas con el mismo ms): nivel(ms).d contra nivelEn(ms, temporal).d
  {
    const N = new Function('"use strict"; var LAT = 37.73, LON = -4.006;\n' + F.nivelNuevo() + "\nreturn { nivel: nivel, nivelEn: nivelEn };")();
    const lvA = { s: { alt: 0, az: 0 }, d: 0 }, lvB = { s: { alt: 0, az: 0 }, d: 0 }, lvC = { s: { alt: 0, az: 0 }, d: 0 }, t0 = Date.UTC(2026, 5, 21, 10);
    compara("3 nivel del sol, tres peticiones por fotograma", 200000, () => (i) => { const ms = t0 + i * 20000; return N.nivel(ms).d + N.nivel(ms).d + N.nivel(ms).d; },
      () => (i) => { const ms = t0 + i * 20000; return N.nivelEn(ms, lvA).d + N.nivelEn(ms, lvB).d + N.nivelEn(ms, lvC).d; });
  }
})();

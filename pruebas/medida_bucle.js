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

  // ---- 4 · Bus.emite con 6 oyentes (lo que hace un evento de fotograma: «mundo:...», «perros:amenaza»…)
  {
    const src = lee("apps/web/motor/02c_componentes.js"), a = src.indexOf("var Bus = (function () {"), b = src.indexOf("\n\n  // el mundo en pausa"), nuevoSrc = src.slice(a, b);
    const antesSrc = require("fs").readFileSync(require("path").join(__dirname, "guardianes", "bucle_equivalencia.test.js"), "utf8");
    const i0 = antesSrc.indexOf("const BUS_ANTES = `") + "const BUS_ANTES = `".length, i1 = antesSrc.indexOf("`;", i0), viejoSrc = antesSrc.slice(i0, i1);
    const mk = (codigo) => () => { const Bus = new Function("console", codigo + "\nreturn Bus;")(console); let acum = 0; for (let k = 0; k < 6; k++) Bus.on("f", (d) => { acum += d; }); return (i) => Bus.emite("f", i & 7); };
    compara("4 Bus.emite, 6 oyentes", 300000, mk(viejoSrc), mk(nuevoSrc));
  }

  // ---- 5a · actualizaPerros: dos perros paseando contigo (con conejos y olivos de mentira), más 3 preguntas «perros:amenaza» por fotograma
  {
    const P = require("./guardianes/_perros_mundo");
    const mk = (fichero) => () => {
      const m = P.mundoPerros(THREE, fichero, 77); m.api.llegan(); const qs = [{ x: 0, y: 0, res: null }, { x: 0, y: 0, res: null }, { x: 0, y: 0, res: null }];
      return (i) => { m.E.tVida += 0.016; m.g.pp.x = 10 + 40 * Math.sin(i * 0.004); m.g.pp.y = 10 + 30 * Math.cos(i * 0.0053); m.g.pp.ang = i * 0.01; m.g.camera.position.set(m.g.pp.x + 5, 6, -m.g.pp.y + 8); m.api.actualiza(0.016);
        for (let k = 0; k < 3; k++) { qs[k].x = m.g.pp.x + k * 6; qs[k].y = m.g.pp.y; qs[k].res = null; m.g.Bus.emite("perros:amenaza", qs[k]); } };
    };
    compara("5a actualizaPerros + 3 preguntas de amenaza", 4000, mk("pruebas/guardianes/referencias/25_perros_antes.js"), mk("apps/web/motor/25_perros.js"));
  }

  // ---- 5b · el rastro del minimapa: caminar sin parar (el rastro lleno, 240 puntos)  ·  5c · la firma de las balizas
  {
    const A = function (mini, pp) { var u = mini.rastro[mini.rastro.length - 1]; if (u && Math.hypot(u[0] - pp.x, u[1] - pp.y) > 25) mini.rastro.length = 0; if (!u || Math.hypot(u[0] - pp.x, u[1] - pp.y) > 2.5) { mini.rastro.push([pp.x, pp.y]); if (mini.rastro.length > 240) mini.rastro.shift(); } };
    const nuevo = new Function("mini", "pp", R.cuerpo(lee("apps/web/motor/17_minimapa.js"), "function actualizaRastro(") && lee("apps/web/motor/17_minimapa.js").slice(lee("apps/web/motor/17_minimapa.js").indexOf("function actualizaRastro("), lee("apps/web/motor/17_minimapa.js").indexOf("  function actualizaMinimapa(")) + "\nreturn actualizaRastro;");
    const mk = (f) => () => { const mini = { rastro: [] }, pp = { x: 0, y: 0 }, paso = f === A ? () => A(mini, pp) : nuevo(mini, pp); return (i) => { pp.x += Math.cos(i * 0.001) * 2.6; pp.y += Math.sin(i * 0.001) * 2.6; paso(); }; };
    compara("5b rastro del minimapa (andando)", 200000, mk(A), mk(nuevo));
    const OT = { fecha_consulta: "2026-11-03" }, Dd = { ot: OT }, VIVO = { vigia: [1, 2, 3] };
    const antes = () => { let balSig = ""; return () => { var firma = (OT && OT.fecha_consulta) + "|" + (OT === Dd.ot ? "i" : "v") + "|" + (VIVO ? (VIVO.vigia ? VIVO.vigia.length : "x") : "n"); if (firma !== balSig) { balSig = firma; return 1; } return 0; }; };
    const ahora = () => { let ok = false, bf, bi = false, bv = ""; return () => { var f = OT && OT.fecha_consulta, i = OT === Dd.ot, v = VIVO ? (VIVO.vigia ? VIVO.vigia.length : "x") : "n"; if (ok && f === bf && i === bi && v === bv) return 0; ok = true; bf = f; bi = i; bv = v; return 1; }; };
    compara("5c firma de las balizas", 500000, antes, ahora);
  }

  // ---- 3 · el nivel del sol que piden paisaje, sonido y huellas cada fotograma (3 llamadas con el mismo ms): nivel(ms).d contra nivelEn(ms, temporal).d
  {
    const N = new Function('"use strict"; var LAT = 37.73, LON = -4.006;\n' + F.nivelNuevo() + "\nreturn { nivel: nivel, nivelEn: nivelEn };")();
    const lvA = { s: { alt: 0, az: 0 }, d: 0 }, lvB = { s: { alt: 0, az: 0 }, d: 0 }, lvC = { s: { alt: 0, az: 0 }, d: 0 }, t0 = Date.UTC(2026, 5, 21, 10);
    compara("3 nivel del sol, tres peticiones por fotograma", 200000, () => (i) => { const ms = t0 + i * 20000; return N.nivel(ms).d + N.nivel(ms).d + N.nivel(ms).d; },
      () => (i) => { const ms = t0 + i * 20000; return N.nivelEn(ms, lvA).d + N.nivelEn(ms, lvB).d + N.nivelEn(ms, lvC).d; });
  }
})();

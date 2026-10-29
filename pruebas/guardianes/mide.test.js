"use strict";
// Medidor de fotogramas (T7a, apps/web/motor/30_mide.js, protocolo en doc/sistema/VR.md). En Node: la estadística (mediana, p95, p99 sobre series conocidas; descarta los 3 s
// de calentamiento, lo posterior a la ventana y los fotogramas con la pestaña oculta) y el texto, evaluando el trozo puro de 30_mide.js tal cual. En Chrome (si lo hay):
// sin &mide el motor no crea nada; con ?debug&mide=5 termina y devuelve números por window.__mide(). GEMELO_VR=1 añade la vuelta con el WebXR simulado (mock_xr.js).
// Los números de SwiftShader NO son fps de nada: aquí solo se comprueba que el medidor mide y termina.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, propia, python, fixture, ejecuta, lee, path, fs } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");

const FUENTE = lee("apps/web/motor/30_mide.js");
function puro() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "30_mide.js debe marcar su trozo puro con // [puro:inicio] y // [puro:fin]");
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn MideEst;")();
}
const E = puro();

function serie(ms, t0, paso, oc) {   // una muestra por intervalo de «paso» s a partir de t0
  const m = { t: [], ms: [], js: [], oc: [] };
  ms.forEach((v, i) => { m.t.push(t0 + i * paso); m.ms.push(v); m.js.push(v / 2); m.oc.push(oc && oc[i] ? 1 : 0); });
  return m;
}

test("percentiles por rango más próximo y mediana de una serie conocida (1..100 ms)", () => {
  const v = Array.from({ length: 100 }, (_, i) => ((i * 37) % 100) + 1);   // 1..100 en otro orden (37 es primo con 100)
  const r = E.serie(v);
  assert.strictEqual(r.mediana, 50.5); assert.strictEqual(r.p95, 95); assert.strictEqual(r.p99, 99); assert.strictEqual(r.peor, 100);
  assert.deepStrictEqual(E.serie([7]), { mediana: 7, p95: 7, p99: 7, peor: 7 });
  assert.deepStrictEqual(E.serie([]), { mediana: 0, p95: 0, p99: 0, peor: 0 });
  assert.strictEqual(E.serie([3, 1, 2]).mediana, 2);
});

test("descarta los 3 s iniciales y lo que cae después de la ventana", () => {
  // 0..9,9 s a 0,1 s: los 30 primeros (t < 3) son 100 ms (carga) y no cuentan; la ventana es de 5 s: t en [3, 8)
  const ms = Array.from({ length: 100 }, (_, i) => (i < 30 ? 100 : 12));
  const r = E.calcula(serie(ms, 0, 0.1), 3, 5);
  assert.strictEqual(r.n, 50); assert.strictEqual(r.descartados.calentamiento, 30); assert.strictEqual(r.descartados.despues, 20);
  assert.strictEqual(r.ms.peor, 12); assert.strictEqual(r.sobre, 0);
});

test("no cuenta los fotogramas con la pestaña oculta", () => {
  const ms = Array.from({ length: 100 }, () => 10), oc = ms.map((_, i) => i >= 50 && i < 60);
  ms[55] = 5000;   // lo que cruza el cambio de pestaña
  const r = E.calcula(serie(ms, 3, 0.05, oc), 3, 10);
  assert.strictEqual(r.n, 90); assert.strictEqual(r.descartados.ocultos, 10); assert.strictEqual(r.ms.peor, 10);
});

test("fotogramas por encima de 13,9 ms: cuenta y porcentaje (el umbral es estricto)", () => {
  const ms = [13.9, 13.9, 13.91, 14, 20, 10, 10, 10, 10, 10];
  const r = E.calcula(serie(ms, 3, 0.1), 3, 10);
  assert.strictEqual(r.sobre, 3); assert.strictEqual(r.pctSobre, 30); assert.strictEqual(r.umbral, 13.9);
  assert.strictEqual(E.calcula({ t: [], ms: [], js: [] }, 3, 10).n, 0);
});

test("el texto trae todo lo pedido y el resumen del navegador no lleva datos personales", () => {
  const e = E.calcula(serie(Array.from({ length: 200 }, (_, i) => 12 + (i % 10)), 3, 0.05), 3, 60);
  const r = { version: 1, fecha: "2026-10-29T10:00:00Z", aparato: { modo: "VR", ua: E.resumeUA("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0.0 Chrome/126.0.0.0 Safari/537.36 Mozilla/5.0 (Linux; Android 12; Quest 3) usuario@correo.es") },
    escena: "tiles", banderas: "escena=tiles arbsc=0.5", duracion: 60, calentamiento: 3, est: e, nivel: { ini: 0, fin: 1, cambios: [{ t: 12.3, de: 0, a: 1 }] }, olivos: [10, 200, 3000], avisos: [] };
  const tx = E.texto(r);
  for (const s of ["mediana", "p95", "p99", "peor", "Por encima de 13,9 ms", "al empezar 0", "al terminar 1", "0 → 1", "Escena: tiles", "escena=tiles arbsc=0.5", "VR", "2026-10-29", "N0 10", "criterio 5"]) assert.ok(tx.includes(s), "falta «" + s + "» en:\n" + tx);
  assert.ok(!/correo|@|x86_64|X11/.test(tx), "el resumen del navegador se cuela con datos de más:\n" + tx);
  assert.ok(/OculusBrowser\/38/.test(tx) && /Quest 3/.test(tx));
  assert.ok(E.lineas(r, true).length <= 14, "la tarjeta de VR debe caber en el panel");
  assert.strictEqual(E.resumeUA(""), "n/d");
});

test("sin &mide el motor no hace nada: 90_final solo mira Mide.on, y 30_mide no registra nada hasta armarse", () => {
  assert.ok(/if \(Mide\.on\) Mide\.cuadro\(t\);/.test(lee("apps/web/motor/90_final.js")));
  const i = FUENTE.indexOf("var param = ");
  assert.ok(i > 0 && /if \(param\) arma\(/.test(FUENTE.slice(i)), "el armado debe depender de &mide");
  assert.ok(!/addEventListener\("visibilitychange"[^;]*;\s*\n\s*var param/.test(FUENTE));
});

// ---------- en Chrome
const SALTO = motivoSalto("el medidor en navegador");
let srv, navegador, base, dirWeb;
test.before(async () => {
  if (SALTO) return;
  const FIX = path.relative(RAIZ, fixture()), WEB = propia("web-mide"); dirWeb = WEB;
  const r = ejecuta(python(), ["-I", "tuberia/salida_artefacto/montar_v2.py", "--datos", FIX + "/cerro/embebido.json", "--salida", path.relative(RAIZ, path.join(WEB, "cerro", "index.html"))]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  srv = await sirve(WEB); base = "http://127.0.0.1:" + srv.address().port + "/cerro/index.html";
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

async function abre(consulta, init) {
  const p = await navegador.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error" && !/favicon|404|AudioContext/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  if (init) await p.addInitScript({ content: init });
  await p.goto(base + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 60000 });
  return { p, errores };
}

test("en Chrome: sin &mide no hay estado ni medida; con ?debug&mide=5 termina y devuelve números (también en localStorage)", { timeout: 240000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const sin = await abre("?debug"); await sin.p.waitForTimeout(2000);
  const e0 = await sin.p.evaluate(() => ({ m: window.__mide(), caja: !!document.getElementById("mideCaja") }));
  assert.strictEqual(e0.m.estado, "inactivo"); assert.strictEqual(e0.m.resultado, null); assert.deepStrictEqual(sin.errores, []);
  await sin.p.close();
  const sinDebug = await abre(""); await sinDebug.p.waitForTimeout(1500);
  assert.strictEqual(await sinDebug.p.evaluate(() => document.getElementById("mideCaja")), null, "sin ?debug ni &mide no debe haber caja");
  await sinDebug.p.close();

  const c = await abre("?escena=tiles&debug&mide=5");
  const antes = await c.p.evaluate(() => window.__mide().estado);
  assert.ok(["esperando", "midiendo"].includes(antes), "armado por &mide: " + antes);
  await c.p.waitForFunction(() => window.__mide().estado === "listo", null, { timeout: 180000, polling: 500 });
  const r = await c.p.evaluate(() => ({ m: window.__mide(), caja: document.getElementById("mideCaja") && document.getElementById("mideCaja").textContent }));
  assert.deepStrictEqual(c.errores, []);
  const res = r.m.resultado;
  assert.ok(res.est.n > 0, "debe haber fotogramas");
  assert.strictEqual(res.duracion, 5); assert.strictEqual(res.calentamiento, 3); assert.strictEqual(res.aparato.modo, "pantalla"); assert.strictEqual(res.escena, "tiles");
  assert.ok(res.banderas.includes("escena=tiles"));
  for (const k of ["mediana", "p95", "p99", "peor"]) assert.ok(res.est.ms[k] > 0 && res.est.ms[k] < 60000, k);
  assert.ok(res.est.ms.mediana <= res.est.ms.p95 && res.est.ms.p95 <= res.est.ms.p99 && res.est.ms.p99 <= res.est.ms.peor);
  assert.ok(res.est.js.mediana >= 0);
  assert.strictEqual(res.nivel, null, "en pantalla no hay nivel de VR_PERFILES");
  assert.ok(r.m.texto.includes("Intervalo (ms)") && r.caja.includes("Copiar") && r.caja.includes("p95"), "la caja de ?debug debe enseñar el resultado");
  assert.strictEqual(r.m.historial.length, 1, "localStorage guarda la medida");
  if (process.env.GEMELO_MIDE) console.log(r.m.texto);
  await c.p.close();
});

test("en Chrome con WebXR simulado (opcional, GEMELO_VR=1): &mide=5 empieza al entrar en VR y deja la tarjeta en el panel", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!process.env.GEMELO_VR) return t.skip("opcional: define GEMELO_VR=1 (inestable con SwiftShader, igual que guardianes/vr.test.js)");
  const mock = fs.readFileSync(path.join(RAIZ, "pruebas", "mock_xr.js"), "utf8");
  const c = await abre("?debug&mide=5", mock);
  await c.p.waitForFunction(() => document.getElementById("btnVR"), null, { timeout: 30000 });
  assert.strictEqual(await c.p.evaluate(() => window.__mide().estado), "esperando", "con casco a la vista espera a que se entre");
  await c.p.evaluate(() => document.getElementById("btnVR").click());
  await c.p.waitForFunction(() => window.__mide().estado === "listo", null, { timeout: 240000, polling: 500 });
  const r = await c.p.evaluate(() => ({ m: window.__mide(), d: window.__vrDebug() }));
  assert.deepStrictEqual(c.errores, []);
  assert.strictEqual(r.m.resultado.aparato.modo, "VR"); assert.ok(r.m.resultado.nivel && r.m.resultado.nivel.ini >= 0);
  assert.ok(r.d.panel, "al terminar el panel vuelve con la tarjeta");
  await c.p.close();
});

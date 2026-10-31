"use strict";
// Medidor de fotogramas (T7a, apps/web/motor/30_mide.js, protocolo en doc/sistema/VR.md). En Node: la estadística (mediana, p95, p99 sobre series conocidas; descarta los 3 s
// de calentamiento, lo posterior a la ventana y los fotogramas con la pestaña oculta) y el texto, evaluando el trozo puro de 30_mide.js tal cual. En Chrome (si lo hay):
// sin &mide el motor no crea nada; con ?debug&mide=5 termina y devuelve números por window.__mide(). GEMELO_VR=1 añade la vuelta con el WebXR simulado (mock_xr.js).
// Los números de SwiftShader NO son fps de nada: aquí solo se comprueba que el medidor mide y termina.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, lee, path, fs } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

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
  const r = { version: 1, fecha: "2026-10-29T10:00:00Z", aparato: { modo: "VR", ua: E.resumeUA("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0.0 Chrome/126.0.0.0 Safari/537.36 Mozilla/5.0 (Linux; Android 12; Quest 3) usuario@correo.example") },
    escena: "tiles", banderas: "olivos=gen arbsc=0.5", duracion: 60, calentamiento: 3, est: e, nivel: { ini: 0, fin: 1, cambios: [{ t: 12.3, de: 0, a: 1 }] }, olivos: [10, 200, 3000], avisos: [] };
  const tx = E.texto(r);
  for (const s of ["mediana", "p95", "p99", "peor", "Por encima de 13,9 ms", "al empezar 0", "al terminar 1", "0 → 1", "Escena: tiles", "olivos=gen arbsc=0.5", "VR", "2026-10-29", "N0 10", "criterio 5"]) assert.ok(tx.includes(s), "falta «" + s + "» en:\n" + tx);
  assert.ok(!/correo|@|x86_64|X11/.test(tx), "el resumen del navegador se cuela con datos de más:\n" + tx);
  assert.ok(/OculusBrowser\/38/.test(tx) && /Quest 3/.test(tx));
  assert.ok(E.lineas(r, true).length <= 14, "la tarjeta de VR debe caber en el panel");
  assert.strictEqual(E.resumeUA(""), "n/d");
});

// PB9: el envío a la oficina. Cuerpo = contratos/medidas.schema.json (el mismo esquema que la api); nada personal; solo a petición del botón
const UA_QUEST = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0.0.5.52.675 SamsungBrowser/4.0 Chrome/126.0.6478.122 VR Mobile Safari/537.36 Quest 3";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
function medidaVR(modo, n, extra) {
  const e = E.calcula(serie(Array.from({ length: n }, (_, i) => 10 + (i % 5)), 3, 0.05), 3, 60);
  return Object.assign({ version: 1, fecha: "2026-10-31T10:00:00Z", aparato: { modo: modo, ua: "x" }, escena: "tiles", banderas: "", duracion: 60, calentamiento: 3, est: e, nivel: modo === "VR" ? { ini: 0, fin: 2, cambios: [] } : null, olivos: [1, 2, 3], avisos: [] }, extra || {});
}
test("PB9: el aparato y el navegador salen del agente de usuario sin guardarlo entero", () => {
  assert.deepStrictEqual([E.aparatoDe(UA_QUEST), E.aparatoDe(UA_IPHONE), E.aparatoDe(UA_PC), E.aparatoDe("")], ["quest", "movil", "escritorio", "escritorio"]);
  assert.deepStrictEqual(E.navegadorDe(UA_QUEST), { nombre: "Quest Browser", mayor: 38 });
  assert.deepStrictEqual(E.navegadorDe(UA_IPHONE), { nombre: "Safari", mayor: 17 });
  assert.deepStrictEqual(E.navegadorDe(UA_PC), { nombre: "Chrome", mayor: 131 });
  assert.deepStrictEqual(E.navegadorDe(UA_PC + " Edg/131.0.0.0"), { nombre: "Edge", mayor: 131 });
  assert.deepStrictEqual(E.navegadorDe("Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"), { nombre: "Firefox", mayor: 128 });
  assert.deepStrictEqual(E.navegadorDe("curl/8"), { nombre: "otro", mayor: 0 });
});

test("PB9: el cuerpo del envío cumple el esquema estricto del contrato y no lleva nada personal", () => {
  const esquema = JSON.parse(lee("contratos/medidas.schema.json"));
  const c = E.cuerpoEnvio(medidaVR("VR", 400), { ua: UA_QUEST, finca: "hituelo", modo: "nube", version: "0.2.0" });
  assert.ok(c, "una medida buena da cuerpo");
  assert.deepStrictEqual(Object.keys(c).sort(), Object.keys(esquema.properties).sort(), "ni un campo de más ni de menos");
  for (const [k, p] of Object.entries(esquema.properties)) {
    const v = c[k];
    if (p.type === "string") { assert.strictEqual(typeof v, "string", k); if (p.enum) assert.ok(p.enum.includes(v), k); if (p.pattern) assert.ok(new RegExp(p.pattern).test(v), k + " = " + v); }
    else if (p.type === "integer") { assert.ok(Number.isInteger(v), k); assert.ok(v >= p.minimum && v <= p.maximum, k + " = " + v); }
    else if (p.type === "number") { assert.ok(Number.isFinite(v) && v >= p.minimum && v <= p.maximum, k); }
    else if (p.type === "boolean") assert.strictEqual(typeof v, "boolean", k);
  }
  assert.deepStrictEqual([c.aparato, c.navegador, c.nav_mayor, c.vr, c.perfil, c.finca, c.modo, c.version, c.medida_en], ["quest", "Quest Browser", 38, true, 2, "hituelo", "nube", "0.2.0", "2026-10-31T10:00:00Z"]);
  assert.ok(c.mediana_ms <= c.p95_ms && c.p95_ms <= c.peor_ms);
  assert.ok(!/Mozilla|X11|Linux|Samsung|@/.test(JSON.stringify(c)), "ni el agente de usuario entero ni nada personal: " + JSON.stringify(c));
  const p = E.cuerpoEnvio(medidaVR("pantalla", 400), { ua: UA_PC, finca: "cerro", modo: "ortofoto", version: "0.2.0" });
  assert.deepStrictEqual([p.aparato, p.vr, p.perfil], ["escritorio", false, -1], "en pantalla no hay perfil de VR");
});

test("PB9: lo raro no sale: pocas muestras, valores que no cuadran con el patrón se sustituyen por «desconocid@» y nunca se cuelan campos", () => {
  assert.strictEqual(E.cuerpoEnvio(medidaVR("VR", 5), { ua: UA_QUEST, finca: "f", modo: "m", version: "1" }), null, "menos de 10 fotogramas: no sirve");
  assert.strictEqual(E.cuerpoEnvio(null, {}), null);
  const c = E.cuerpoEnvio(medidaVR("VR", 400), { ua: UA_QUEST, finca: "../../ruta/de/disco", modo: "a b/c", version: "<script>" });
  assert.deepStrictEqual([c.finca, c.modo, c.version], ["desconocida", "desconocido", "desconocida"], "una ruta o un texto raro nunca viaja");
});

test("PB9: el envío es SOLO a petición (el botón), al mismo origen, sin nada personal y sin cambiar el coste cero de no medir", () => {
  const i = FUENTE.indexOf("function envia()"), f = FUENTE.indexOf("function textoEnvio()");
  assert.ok(i > 0 && f > i, "30_mide.js tiene envia()");
  const envia = FUENTE.slice(i, f);
  assert.ok(/fetch\(pre \+ "medidas"/.test(envia) && /credentials: "same-origin"/.test(envia), "POST al prefijo de la api del mismo origen");
  assert.ok(!/https?:\/\//.test(envia), "ningún otro host");
  assert.ok(!/envia\(\)/.test(FUENTE.replace(/function envia\(\)/, "").replace(/api\.envia = envia/, "")) || /addEventListener\("click", envia\)/.test(FUENTE), "solo se llama desde el botón");
  assert.ok(!/envia\(\)/.test(FUENTE.slice(FUENTE.indexOf("function termina()"), FUENTE.indexOf("function guarda()"))), "termina() no envía nada por su cuenta");
  assert.ok(/Enviar esta medida a la oficina/.test(FUENTE), "el texto del botón");
  const vr = lee("apps/web/motor/29_vr.js");
  assert.ok(/b\("mideEnvia"[^;]*Bus\.emite\("medida:envia"\)/.test(vr), "el botón del panel de VR pide el envío por el Bus (medida:envia) con el gatillo");
  assert.ok(/n\.on\("medida:envia", function \(\) \{ envia\(\); \}\)/.test(FUENTE), "y el medidor lo atiende");
  assert.ok(!/localStorage/.test(envia));
});

test("sin &mide el motor no hace nada: 90_final solo emite «cuadro:fin», y 30_mide solo lo escucha armado o midiendo", () => {
  assert.ok(/Bus\.emite\("cuadro:fin", FIN\);/.test(lee("apps/web/motor/90_final.js")));
  assert.ok(/function engancha\(\) \{ if \(!quitaCuadro\) quitaCuadro = n\.on\("cuadro:fin"/.test(FUENTE) && /desengancha\(\); prev = -1;/.test(FUENTE), "la escucha del fotograma solo existe mientras mide");
  const i = FUENTE.indexOf("var param = ");
  assert.ok(i > 0 && /if \(param\) arma\(/.test(FUENTE.slice(i)), "el armado debe depender de &mide");
  assert.ok(!/addEventListener\("visibilitychange"[^;]*;\s*\n\s*var param/.test(FUENTE));
});

// ---------- en Chrome
const SALTO = motivoSalto("el medidor en navegador") || saltoPagina("el medidor en navegador");
let srv, navegador, base;
test.before(async () => {
  if (SALTO) return;
  srv = await sirve(montaPagina({ finca: "cerro" }).carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
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

  const c = await abre("?debug&mide=5&arbsc=1");
  const antes = await c.p.evaluate(() => window.__mide().estado);
  assert.ok(["esperando", "midiendo"].includes(antes), "armado por &mide: " + antes);
  await c.p.waitForFunction(() => window.__mide().estado === "listo", null, { timeout: 180000, polling: 500 });
  const r = await c.p.evaluate(() => ({ m: window.__mide(), caja: document.getElementById("mideCaja") && document.getElementById("mideCaja").textContent }));
  assert.deepStrictEqual(c.errores, []);
  const res = r.m.resultado;
  assert.ok(res.est.n > 0, "debe haber fotogramas");
  assert.strictEqual(res.duracion, 5); assert.strictEqual(res.calentamiento, 3); assert.strictEqual(res.aparato.modo, "pantalla"); assert.strictEqual(res.escena, "tiles", "con tileset, la escena 3D Tiles (la única desde T8 fase 2)");
  assert.ok(String(res.banderas).includes("arbsc=1"), "las banderas de la URL van en el resultado: " + res.banderas);
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

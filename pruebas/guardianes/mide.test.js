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
  assert.ok(esquema.required.every(k => k in c) && Object.keys(c).every(k => k in esquema.properties), "los obligatorios, y ningún campo fuera del contrato");
  for (const [k, p] of Object.entries(esquema.properties)) {
    const v = c[k]; if (v === undefined && !esquema.required.includes(k)) continue;   // Q0e: los opcionales que no se midieron no viajan
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

// Q0e: por qué va como va (contrato v2, contratos/medidas.md): ms de JS, niveles, perillas, olivos generados, llamadas, triángulos y personas; todo opcional
function conDibujo(modo, n, extra) {   // como medidaVR pero con las series de llamadas y triángulos por fotograma
  const m = serie(Array.from({ length: n }, (_, i) => 10 + (i % 5)), 3, 0.05);
  m.ll = m.ms.map((_, i) => 200 + (i % 3)); m.tr = m.ms.map((_, i) => 400000 + 1000 * (i % 3));
  return medidaVR(modo, n, Object.assign({ est: E.calcula(m, 3, 60), perillas: "VR: fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto", olivosGen: true, personas: 3 }, extra || {}));
}
test("Q0e: el cuerpo lleva ms de JS (mediana y p95), niveles, perillas, olivos generados, llamadas, triángulos y personas, y cumple el esquema", () => {
  const esquema = JSON.parse(lee("contratos/medidas.schema.json"));
  const med = conDibujo("VR", 400);
  const c = E.cuerpoEnvio(med, { ua: UA_QUEST, finca: "hituelo", modo: "gemelo", version: "0.2.0" });
  assert.deepStrictEqual([c.js_mediana_ms, c.js_p95_ms], [Math.round(med.est.js.mediana * 100) / 100, Math.round(med.est.js.p95 * 100) / 100], "el mismo método que el intervalo (serie: mediana y p95 por rango más próximo)");
  assert.ok(c.js_mediana_ms > 0 && c.js_mediana_ms <= c.js_p95_ms);
  assert.deepStrictEqual([c.nivel_ini, c.nivel_fin, c.perfil], [0, 2, 2], "perfil = el nivel final");
  assert.strictEqual(c.perillas, "fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto", "sin el prefijo «VR: »");
  assert.deepStrictEqual([c.olivos_gen, c.llamadas_med, c.triangulos_med, c.personas], [true, 201, 401000, 3]);
  for (const [k, p] of Object.entries(esquema.properties)) {
    const v = c[k];
    if (v === undefined) { assert.ok(!esquema.required.includes(k), k + " falta"); continue; }
    if (p.type === "string" && p.pattern) assert.ok(new RegExp(p.pattern).test(v), k + " = " + v);
    if (p.type === "integer") assert.ok(Number.isInteger(v) && v >= p.minimum && v <= p.maximum, k + " = " + v);
    if (p.type === "number") assert.ok(Number.isFinite(v) && v >= p.minimum && v <= p.maximum, k);
    if (p.type === "boolean") assert.strictEqual(typeof v, "boolean", k);
  }
  assert.deepStrictEqual(Object.keys(c).filter(k => !(k in esquema.properties)), [], "ningún campo fuera del contrato");
});
test("Q0e: en pantalla no hay nivel ni perillas; lo que no se midió no viaja (una medida de antes sigue dando el cuerpo de la v1)", () => {
  const p = E.cuerpoEnvio(conDibujo("pantalla", 400), { ua: UA_PC, finca: "cerro", modo: "ortofoto", version: "0.2.0" });
  for (const k of ["nivel_ini", "nivel_fin", "perillas"]) assert.ok(!(k in p), k + " solo en VR");
  assert.deepStrictEqual([p.olivos_gen, p.personas, p.llamadas_med > 0, p.js_p95_ms > 0], [true, 3, true, true]);
  const viejo = medidaVR("VR", 400);   // sin ll, tr, olivosGen, personas, perillas
  const v1 = E.cuerpoEnvio(viejo, { ua: UA_QUEST, finca: "hituelo", modo: "nube", version: "0.2.0" });
  for (const k of ["llamadas_med", "triangulos_med", "olivos_gen", "personas", "perillas"]) assert.ok(!(k in v1), k + " no se inventa");
  assert.ok("js_mediana_ms" in v1 && "nivel_fin" in v1, "el JS y los niveles sí estaban");
  assert.strictEqual(E.cuerpoEnvio(conDibujo("VR", 400, { personas: 9999 }), { ua: UA_QUEST, finca: "f", modo: "m", version: "1" }).personas, 500, "acotado");
  assert.strictEqual(E.cuerpoEnvio(conDibujo("VR", 400, { personas: 0 }), { ua: UA_QUEST, finca: "f", modo: "m", version: "1" }).personas, 0, "0 si no hay presencia");
});
test("Q0e: las perillas se sanean (sin HTML, rutas ni exceso de largo) y nunca pasan de 80 caracteres", () => {
  assert.strictEqual(E.perillasLimpias("VR: fov 1 · escala 1 · 72 Hz · MSAA sí · nivel 2 fijo"), "fov 1 · escala 1 · 72 Hz · MSAA sí · nivel 2 fijo");
  const sucio = E.perillasLimpias("VR: <script>alert(1)</script> /etc/passwd http://x.example a@b.example");
  assert.ok(!/[<>/@]/.test(sucio), sucio);
  const largo = E.perillasLimpias("VR: " + "fov 1 · ".repeat(40));
  assert.ok(largo.length <= 80 && largo.length > 0, String(largo.length));
  assert.strictEqual(E.perillasLimpias(""), null); assert.strictEqual(E.perillasLimpias("<>"), null); assert.strictEqual(E.perillasLimpias(null), null);
  assert.strictEqual(E.perillasLimpias("VR: ignorado: fov=9 (fuera de rango)"), "ignorado: fov=9 (fuera de rango)");
});
test("Q0e: el informe de ?mide muestra JS, llamadas, triángulos, olivos generados y personas, y la tarjeta de VR sigue cabiendo", () => {
  const r = conDibujo("VR", 400);
  const tx = E.texto(r);
  for (const s of ["JS por fotograma (ms): mediana", "Por fotograma (mediana): 201 llamadas · 401000 triángulos · olivos generados sí · personas 3", "VR: fov 1"]) assert.ok(tx.includes(s), "falta «" + s + "» en:\n" + tx);
  assert.ok(E.lineas(r, true).length <= 14, "la tarjeta de VR debe caber en el panel: " + E.lineas(r, true).length);
  assert.ok(!E.texto(medidaVR("VR", 400)).includes("Por fotograma (mediana)"), "una medida de antes no inventa la línea");
  assert.strictEqual(E.calcula({ t: [3, 3.1], ms: [10, 10], js: [1, 2] }, 3, 10).ll, null, "sin ll ni tr no hay serie");
});
test("Q0e: el medidor recoge llamadas y triángulos de renderer.info.render y el botón enseña lo que se manda; de la presencia solo sale un número", () => {
  assert.ok(/renderer\.info\.render/.test(FUENTE) && /m\.ll\.push\(/.test(FUENTE) && /m\.tr\.push\(/.test(FUENTE));
  assert.ok(/window\.__olivosGen/.test(FUENTE) && /window\.__presencia/.test(FUENTE));
  assert.ok(/b3\.title = "Manda a la oficina solo cifras[^"]*olivos generados[^"]*personas[^"]*Nada de tu hogar, tu posición ni tu IP\."/.test(FUENTE), "el texto del botón enseña lo que se manda y lo que no");
  const i = FUENTE.indexOf("function personasVisibles");
  assert.ok(!/identidad|alias|\.id\b/.test(FUENTE.slice(i, i + 260)), "de la presencia solo sale un número");
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

test("Q0f: si la medida cambia de pantalla a VR (o al revés) a mitad, vuelve a empezar en el modo nuevo (nunca una medida mixta)", () => {
  // visto el 2026-11-04: «Medir» en el mapa y luego entrar en VR daba una medida de «pantalla» sin nivel ni perillas (medidas 13 y 14)
  const F = lee("apps/web/motor/30_mide.js"), i = F.indexOf("function fotograma(tIni, d)"), cuerpo = F.slice(i, F.indexOf("function termina()", i));
  assert.match(cuerpo, /if \(estado !== "midiendo"\) return;\s*\/\/ Q0f[^\n]*\n\s*if \(modoIni !== modoAhora\(\)\) \{ empieza\(tIni\); return; \}/, "antes de contar el fotograma, el cambio de modo reinicia");
  assert.match(F, /function empieza\(tIni\) \{\s*t0 = tIni; m = \{ t: \[\], ms: \[\], js: \[\]/, "empezar vacía la serie");
  assert.match(F, /modoIni = modoAhora\(\)/, "y apunta el modo nuevo");
});

// ---------- Q0g: la autopsia de los fotogramas lentos ----------
test("Q0g: bits() marca cada causa por separado y no marca nada si nada se movió", () => {
  assert.strictEqual(E.bits(0, 0, 0, 0, 0), 0);
  assert.strictEqual(E.bits(0.9, 0, 0, 0, 0), 0, "la Cola por debajo de 1 ms no cuenta");
  assert.strictEqual(E.bits(1, 0, 0, 0, 0), E.BIT.cola);
  assert.strictEqual(E.bits(0, 2, 0, 0, 0), E.BIT.tesela);
  assert.strictEqual(E.bits(0, 0, 1, 0, 0), E.BIT.lote);
  assert.strictEqual(E.bits(0, 0, 0, 1, 0), E.BIT.compila);
  assert.strictEqual(E.bits(0, 0, 0, 0, 3), E.BIT.textura);
  assert.strictEqual(E.bits(5, 1, 1, 1, 1), E.BIT.cola | E.BIT.tesela | E.BIT.lote | E.BIT.compila | E.BIT.textura);
  assert.strictEqual(E.bits(0, 0, 0, -1, -1), 0, "bajar el número de programas o texturas (liberar) no es una causa");
});
test("Q0g: el resumen de causas cuenta solo los lentos, deja que se solapen y cuenta los sin causa", () => {
  // 10 fotogramas: lentos (> 13,9) los índices 1, 3, 5, 7, 8
  const ms = [12, 20, 12, 25, 12, 30, 12, 18, 40, 12];
  const cz = [0, E.BIT.cola, E.BIT.cola, E.BIT.cola | E.BIT.tesela, 0, 0, E.BIT.lote, E.BIT.compila | E.BIT.textura, E.BIT.tarea | E.BIT.cola, 0];
  const cq = [0, 3, 2, 4, 0, 0, 0, 0, 8, 0];
  const r = E.resumenCausas(ms, cz, cq, 13.9);
  assert.deepStrictEqual({ l: r.lentos, c: r.cola, t: r.tesela, lo: r.lote, ta: r.tarea, co: r.compila, tx: r.textura, s: r.sin }, { l: 5, c: 3, t: 1, lo: 0, ta: 1, co: 1, tx: 1, s: 1 });
  assert.strictEqual(r.colaMs, 4, "mediana de lo que gastó la Cola en los lentos donde trabajó (3, 4, 8)");
  assert.strictEqual(E.resumenCausas([20], null, null, 13.9), null, "una medida de antes no trae causas");
  const ninguno = E.resumenCausas([10, 11], [0, 0], [0, 0], 13.9);
  assert.strictEqual(ninguno.lentos, 0); assert.strictEqual(E.lineaCausas(ninguno, true), "Fotogramas lentos: ninguno");
});
test("Q0g: calcula() filtra la causa igual que los intervalos (calentamiento, ocultos) y la deja en est.causas", () => {
  const m = serie([30, 12, 30, 30, 12, 30], 2, 1, [0, 0, 0, 1, 0, 0]);   // t = 2, 3, 4, 5, 6, 7 (el 2 es calentamiento; el 5 está oculto)
  m.cz = [E.BIT.cola, 0, E.BIT.tesela, E.BIT.lote, 0, 0]; m.cq = [9, 0, 5, 5, 0, 0];
  const e = E.calcula(m, 3, 60);
  assert.strictEqual(e.n, 4);
  assert.deepStrictEqual({ l: e.causas.lentos, c: e.causas.cola, t: e.causas.tesela, lo: e.causas.lote, s: e.causas.sin }, { l: 2, c: 0, t: 1, lo: 0, s: 1 });
  assert.strictEqual(E.calcula(serie([30, 12], 3, 1), 3, 60).causas, null, "sin cz no hay causas");
});
test("Q0g: las tareas largas se asignan al fotograma en cuyo intervalo acaban, y solo cuentan las de la ventana medida", () => {
  // t0 = 1000 ms; fotogramas en 4000, 4020, 4090 y 4110 (intervalos de 20, 20, 70 y 20 ms): cada uno cubre (llegada - intervalo, llegada]
  const t0 = 1000, m = { t: [3, 3.02, 3.09, 3.11], ms: [20, 20, 70, 20], js: [1, 1, 1, 1], cz: [0, 0, 0, 0], cq: [0, 0, 0, 0] };
  const r = E.marcaLargas(m, t0, { fin: [500, 4010, 4025, 4080, 4100, 70000], dur: [60, 55, 52, 80, 70, 90] }, 3, 60);
  assert.deepStrictEqual(m.cz, [0, 8, 8, 8]);
  assert.deepStrictEqual(r, { n: 4, ms: 257 }, "la de antes del calentamiento y la de después de la ventana no cuentan");
  assert.deepStrictEqual(E.marcaLargas({ t: [3], ms: [20], js: [1] }, 0, { fin: [], dur: [] }, 3, 60), { n: 0, ms: 0 }, "sin cz (medida de antes) no revienta");
});
test("Q0g: el informe largo y la tarjeta de VR muestran las causas; la tarjeta sigue cabiendo en 14 líneas", () => {
  const m = serie(Array.from({ length: 400 }, (_, i) => (i % 20 === 0 ? 22 : 11)), 3, 0.05);
  m.ll = m.ms.map(() => 200); m.tr = m.ms.map(() => 400000);
  m.cz = m.ms.map((v, i) => (i % 40 === 0 ? E.BIT.cola : 0)); m.cq = m.ms.map((v, i) => (i % 40 === 0 ? 3 : 0));
  const r = medidaVR("VR", 400, { est: E.calcula(m, 3, 60), perillas: "VR: fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto", olivosGen: true, personas: 3, largas: { n: 2, ms: 130 },
    nivel: { ini: 0, fin: 2, cambios: [{ t: 1, de: 0, a: 1 }, { t: 2, de: 1, a: 2 }] } });
  assert.strictEqual(r.est.causas.lentos, 20); assert.strictEqual(r.est.causas.cola, 10); assert.strictEqual(r.est.causas.sin, 10);
  const tx = E.texto(r);
  for (const s of ["Fotogramas lentos 20 (pueden solaparse): Cola 10 · sin causa 10 · la Cola gastó 3.0 ms (mediana)", "Tareas largas del navegador (≥ 50 ms) durante la medida: 2 (suman 130 ms)"]) assert.ok(tx.includes(s), "falta «" + s + "» en:\n" + tx);
  const c = E.lineas(r, true);
  assert.ok(c.includes("Lentos 20: cola 10 · sin causa 10"), c.join("\n"));
  assert.ok(c.length <= 14, "la tarjeta de VR debe caber en el panel: " + c.length);
  assert.ok(!/tarea larga|Tareas largas/i.test(c.join("\n")), "las tareas largas van solo en el informe largo");
});
test("Q0i: lo que viaja a la api lleva el resumen de la autopsia (lentos_*) y render(), pero nunca las series por fotograma (cz, cq)", () => {
  const r = conDibujo("VR", 400);
  const m = serie(Array.from({ length: 400 }, (_, i) => 10 + (i % 5) + (i % 50 === 0 ? 20 : 0)), 3, 0.05); m.cz = m.ms.map((_, i) => (i % 2 ? 1 : 0)); m.cq = m.ms.map(() => 2);
  m.js = m.ms.map(() => 6); m.rd = m.ms.map((_, i) => 1 + (i % 4) * 0.5);
  r.est = E.calcula(m, 3, 60); r.largas = { n: 1, ms: 60 };
  const c = E.cuerpoEnvio(r, { ua: UA_QUEST, finca: "hituelo", modo: "gemelo", version: "0.2.0" });
  const cs = r.est.causas;
  assert.ok(c && cs.lentos > 0);
  assert.deepStrictEqual([c.lentos_n, c.lentos_cola, c.lentos_tesela, c.lentos_lote, c.lentos_tarea, c.lentos_compila, c.lentos_textura, c.lentos_sin_causa],
    [cs.lentos, cs.cola, cs.tesela, cs.lote, cs.tarea, cs.compila, cs.textura, cs.sin], "los mismos recuentos que la tarjeta");
  assert.strictEqual(c.lentos_cola_ms, Math.round(cs.colaMs * 100) / 100);
  assert.deepStrictEqual([c.render_mediana_ms, c.render_p95_ms], [Math.round(r.est.rd.mediana * 100) / 100, Math.round(r.est.rd.p95 * 100) / 100]);
  assert.ok(c.render_mediana_ms <= c.render_p95_ms);
  assert.ok(!/"cz"|"cq"|largas/i.test(JSON.stringify(c)), JSON.stringify(c));
  const esquema = JSON.parse(lee("contratos/medidas.schema.json"));
  assert.deepStrictEqual(Object.keys(c).filter(k => !(k in esquema.properties)), [], "solo campos del esquema");
  for (const k of Object.keys(c)) { const p = esquema.properties[k]; if (p.type === "integer") assert.ok(Number.isInteger(c[k]) && c[k] >= p.minimum && c[k] <= p.maximum, k); if (p.type === "number") assert.ok(c[k] >= p.minimum && c[k] <= p.maximum, k); }
});
test("Q0i: una medida de antes (sin render(), sin autopsia, sin reparto) da el cuerpo de la v2, que sigue siendo válido: ningún campo de la v3 obligatorio", () => {
  const esquema = JSON.parse(lee("contratos/medidas.schema.json"));
  const V3 = ["render_mediana_ms", "render_p95_ms", "lentos_n", "lentos_cola", "lentos_tesela", "lentos_lote", "lentos_tarea", "lentos_compila", "lentos_textura", "lentos_sin_causa", "lentos_cola_ms", "reparto", "otros_p95_ms"];
  for (const k of V3) { assert.ok(k in esquema.properties, k); assert.ok(!esquema.required.includes(k), k + " es opcional"); }
  const viejo = medidaVR("VR", 400), c = E.cuerpoEnvio(viejo, { ua: UA_QUEST, finca: "hituelo", modo: "nube", version: "0.2.0" });
  assert.ok(c); for (const k of V3) assert.ok(!(k in c), k + " no viaja si no se midió");
  for (const k of esquema.required) assert.ok(k in c, "obligatorio " + k);
  const v2 = JSON.parse(lee("contratos/medidas-v2-ejemplo.json"));
  assert.deepStrictEqual(Object.keys(v2).filter(k => !(k in esquema.properties)), [], "el ejemplo de la v2 cabe en el esquema de la v3");
  for (const k of V3) assert.ok(!(k in v2), "el ejemplo de la v2 no trae " + k);
});
test("Q0g: la autopsia solo se paga midiendo: sin &mide ni botón no hay observador, ni «cuadro:fin» escuchado, y el fotograma no reserva", () => {
  const R = require("./_reservas");
  // el observador de tareas largas nace solo en empieza() y se suelta en termina() y al liberar
  assert.strictEqual((FUENTE.match(/\bobservaLargas\(\)/g) || []).length, 2, "observaLargas() se llama solo en su definición y desde empieza()");
  assert.ok(/desobservaLargas\(\); largas = \{ fin: \[\], dur: \[\] \}; observaLargas\(\);/.test(FUENTE), "empieza() arma el observador");
  assert.ok(/if \(api\.on\) fotograma\(d\.t, d\)/.test(FUENTE), "el fotograma solo se procesa con la medida armada");
  assert.ok(/function termina\(\) \{\s*Reparto\.on = false;\s*desobservaLargas\(\)/.test(FUENTE) && /desengancha\(\); desobservaLargas\(\);/.test(FUENTE), "se suelta al terminar y al liberar");
  const rs = R.recuenta()["30_mide.js"];
  assert.deepStrictEqual(rs.faltan, []); assert.strictEqual(rs.total, 0, JSON.stringify(rs.detalle));
  assert.deepStrictEqual(Object.keys(rs.porFn).sort(), ["apuntaReparto", "bits", "causasDelFotograma"]);
  // lo que lee causasDelFotograma existe: Cola.tot (02b), Generados.lotes (07ab)
  const cola = lee("apps/web/motor/02b_cola.js"), gen = lee("apps/web/motor/07ab_generados.js");
  assert.ok(/tot: tot/.test(cola) && /function apunta\(e, dm\) \{ tot\.n\+\+; tot\.ms \+= dm;/.test(cola));
  assert.ok(/lotes: function \(\) \{ return nLotes; \}/.test(gen) && /nLotes\+\+;/.test(gen));
});

// F0 (doc/sistema/MULTIVIEW.md): el techo del multiview. Cuánto del JS es renderer.render() y cuánto el resto; y la sonda del multiview
test("F0: el informe separa los ms de renderer.render() del resto del JS, y la tarjeta de VR sigue cabiendo", () => {
  const m = serie(Array.from({ length: 400 }, (_, i) => 10 + (i % 5)), 3, 0.05);
  m.js = m.ms.map(() => 6); m.rd = m.ms.map((_, i) => 2 + (i % 3));   // js 6 ms de los que render() 2-4 ms
  const e = E.calcula(m, 3, 60);
  assert.deepStrictEqual([e.rd.mediana, e.resto.mediana], [3, 3], "resto = js - render()");
  assert.ok(e.rd.p95 <= 4 && e.resto.p95 <= 4 && e.rd.p95 >= e.rd.mediana);
  const r = medidaVR("VR", 400, { est: e, multiview: "multiview: sí · OVR_multiview2 sí · OCULUS_multiview sí · texture-array sí" });
  const tx = E.texto(r);
  for (const s of ["renderer.render() (ms): mediana 3.0", "el resto del JS (ms): mediana 3.0", "multiview: sí · OVR_multiview2 sí"]) assert.ok(tx.includes(s), "falta «" + s + "» en:\n" + tx);
  const c = E.lineas(r, true);
  assert.ok(c.length <= 14, "la tarjeta de VR debe caber en el panel: " + c.length);
  assert.ok(c.some((l) => /render\(\) 3\.0\//.test(l)) && c.some((l) => /^multiview: sí/.test(l)));
  const v = E.texto(conDibujo("VR", 400));
  assert.ok(!v.includes("renderer.render()") && !v.includes("multiview:"), "una medida de antes no inventa las líneas");
  assert.strictEqual(E.calcula({ t: [3, 3.1], ms: [10, 10], js: [1, 2] }, 3, 10).rd, null);
});

// ---------- Q0h: el reparto del JS por bloque ----------
// bloques: { nombre: [ms por fotograma] }; js y rd por fotograma. Devuelve la medida (m) con el formato del medidor.
function conReparto(bloques, js, rd) {
  const n = js.length, m = serie(Array.from({ length: n }, () => 12), 3, 0.05);
  m.js = js.slice(); m.rd = rd.slice(); m.bn = Object.keys(bloques); m.bl = m.bn.map(k => bloques[k]);
  return m;
}
test("Q0h: el reparto da mediana y p95 por bloque, ordenado por p95, y suma de bloques + render() + otros cuadra con el JS de cada fotograma", () => {
  const n = 200, gran = Array.from({ length: n }, (_, i) => 2 + (i % 10) * 0.2), peq = Array.from({ length: n }, () => 0.5), mid = Array.from({ length: n }, (_, i) => 1 + (i % 5) * 0.5);
  const js = Array.from({ length: n }, (_, i) => gran[i] + peq[i] + mid[i] + 1.5 + 1), rd = Array.from({ length: n }, () => 1.5);   // 1 ms de «otros» en cada fotograma
  const e = E.calcula(conReparto({ "peq": peq, "gran": gran, "mid": mid }, js, rd), 3, 60), r = e.reparto;
  assert.deepStrictEqual(r.bloques.map(b => b.nom), ["gran", "mid", "peq"], "por p95, de mayor a menor");
  assert.strictEqual(r.bloques[2].mediana, 0.5); assert.ok(r.bloques[0].p95 >= r.bloques[0].mediana);
  assert.ok(Math.abs(r.otros.mediana - 1) < 1e-9 && Math.abs(r.otros.p95 - 1) < 1e-9, "lo que no cuadra va a «otros»: " + JSON.stringify(r.otros));
  for (let i = 0; i < n; i++) { /* por fotograma */ }
  assert.ok(Math.abs((r.suma.mediana + e.rd.mediana + r.otros.mediana) - e.js.mediana) < 0.35, "la suma de medianas ronda el JS total");
  assert.strictEqual(E.calcula(serie([12, 12], 3, 1), 3, 60).reparto, null, "una medida sin reparto (de antes) no lo trae");
});
test("Q0h: el reparto sale en el informe largo (todos los bloques, la suma y «otros») y en una sola línea de la tarjeta de VR, que sigue cabiendo en 14", () => {
  const n = 400, B = { "olivo (estación)": 3.1, "c:fauna": 1.4, "Cola": 0.9, "minimapa": 0.3, "tiempo": 0.02 }, bl = {};
  Object.keys(B).forEach(k => { bl[k] = Array.from({ length: n }, (_, i) => B[k] * (0.8 + (i % 5) * 0.1)); });
  const m = conReparto(bl, Array.from({ length: n }, () => 8), Array.from({ length: n }, () => 1.2));
  m.ll = m.ms.map(() => 200); m.tr = m.ms.map(() => 400000); m.cz = m.ms.map(() => 0); m.cq = m.ms.map(() => 0);
  const r = medidaVR("VR", n, { est: E.calcula(m, 3, 60), perillas: "VR: fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto", olivosGen: true, personas: 3, largas: { n: 2, ms: 130 }, multiview: "multiview: sí · OVR_multiview2 sí · OCULUS_multiview sí · texture-array sí",
    nivel: { ini: 0, fin: 2, cambios: [{ t: 1, de: 0, a: 1 }, { t: 2, de: 1, a: 2 }] } });
  const tx = E.texto(r);
  for (const s of ["Reparto del JS por bloque (ms, mediana / p95; de mayor a menor p95):", "  olivo (estación): ", "  c:fauna: ", "suma de los bloques: ", "renderer.render(): 1.2 / 1.2", "otros (lo que no cuadra con el JS total): "]) assert.ok(tx.includes(s), "falta «" + s + "» en:\n" + tx);
  assert.ok(tx.indexOf("olivo (estación)") < tx.indexOf("c:fauna") && tx.indexOf("c:fauna") < tx.indexOf("  Cola"), "ordenados por p95");
  const c = E.lineas(r, true), l = c.filter(x => /^JS p95: /.test(x));
  assert.strictEqual(l.length, 1, c.join("\n")); assert.ok(/olivo \(estació 3\.\d · c:fauna 1\.\d · Cola 1\.\d · otros/.test(l[0]), l[0]);
  assert.ok(c.length <= 14, "la tarjeta de VR debe caber en el panel: " + c.length + "\n" + c.join("\n"));
  assert.ok(l[0].length <= 72, "la línea del reparto cabe a lo ancho del panel: " + l[0].length);
});
test("Q0i: el reparto viaja a la api: {bloque, mediana_ms, p95_ms} de mayor a menor p95, con otros_p95_ms, y los nombres cumplen el patrón del esquema", () => {
  const n = 400, B = { "olivo (estación)": 3.1, "c:fauna": 1.4, "Cola": 0.9, "<b>x</b>/ruta\\mala": 0.5 }, bl = {};
  Object.keys(B).forEach(k => { bl[k] = Array.from({ length: n }, (_, i) => B[k] * (0.8 + (i % 5) * 0.1)); });
  const m = conReparto(bl, Array.from({ length: n }, () => 8), Array.from({ length: n }, () => 1.2));
  const c = E.cuerpoEnvio(medidaVR("VR", n, { est: E.calcula(m, 3, 60) }), { ua: UA_QUEST, finca: "hituelo", modo: "gemelo", version: "0.2.0" });
  const esquema = JSON.parse(lee("contratos/medidas.schema.json")), pat = new RegExp(esquema.properties.reparto.items.properties.bloque.pattern);
  assert.deepStrictEqual(c.reparto.map(b => b.bloque).slice(0, 3), ["olivo (estación)", "c:fauna", "Cola"]);
  for (const b of c.reparto) {
    assert.ok(pat.test(b.bloque), "nombre fuera del patrón: " + b.bloque); assert.ok(b.mediana_ms <= b.p95_ms);
    assert.deepStrictEqual(Object.keys(b).sort(), ["bloque", "mediana_ms", "p95_ms"]);
  }
  assert.ok(!c.reparto.some(b => /[<>/\\]/.test(b.bloque)), "lo que no cabe en el patrón se quita del nombre");
  assert.ok(c.otros_p95_ms >= 0 && c.otros_p95_ms <= 10000);
  assert.ok(c.reparto[0].p95_ms >= c.reparto[1].p95_ms, "el orden del medidor se conserva");
});
test("Q0i: el reparto se acota a 16 bloques (los de mayor p95) aunque el motor tenga más componentes", () => {
  const n = 300, bl = {};
  for (let k = 0; k < 40; k++) bl["bloque" + k] = Array.from({ length: n }, () => 0.1 + k * 0.1);
  const m = conReparto(bl, Array.from({ length: n }, () => 100), Array.from({ length: n }, () => 1));
  const c = E.cuerpoEnvio(medidaVR("VR", n, { est: E.calcula(m, 3, 60) }), { ua: UA_QUEST, finca: "hituelo", modo: "gemelo", version: "0.2.0" });
  assert.strictEqual(c.reparto.length, 16);
  assert.deepStrictEqual(c.reparto.map(b => b.bloque).slice(0, 2), ["bloque39", "bloque38"], "se quedan los que más cuestan");
  assert.ok(!c.reparto.some(b => b.bloque === "bloque0"));
  assert.ok(JSON.stringify(c).length < 3000, "el cuerpo sigue siendo pequeño");
  const largo = conReparto({ ["x".repeat(100)]: Array.from({ length: n }, () => 1) }, Array.from({ length: n }, () => 5), Array.from({ length: n }, () => 1));
  assert.strictEqual(E.cuerpoEnvio(medidaVR("VR", n, { est: E.calcula(largo, 3, 60) }), { ua: UA_QUEST, finca: "hituelo", modo: "gemelo", version: "0.2.0" }).reparto[0].bloque.length, 40, "el nombre se corta a 40");
});
test("Q0i: sin reparto (medida de antes) no viaja ni reparto ni otros_p95_ms", () => {
  const c = E.cuerpoEnvio(medidaVR("VR", 400), { ua: UA_QUEST, finca: "hituelo", modo: "gemelo", version: "0.2.0" });
  assert.ok(c && !("reparto" in c) && !("otros_p95_ms" in c));
});
test("Q0h: coste cero sin medir: ni una lectura de reloj nueva en el bucle fuera de lo guardado por «rp», y cero reservas en lo que corre midiendo", () => {
  const fin = lee("apps/web/motor/90_final.js"), cuerpo = fin.slice(fin.indexOf("function cuadro(t)"), fin.indexOf("var tAhorro"));
  // las únicas lecturas de reloj sin guarda son las dos de siempre: el ms de renderer.render() y vrFin
  const sinGuarda = cuerpo.split("\n").map(l => l.replace(/if \(rp\) [^;]*;?/g, "").replace(/var q = rp \? [^;]*;/, "")).filter(l => /performance\.now\(\)/.test(l));
  assert.strictEqual(sinGuarda.length, 2, sinGuarda.join("\n"));
  assert.ok(sinGuarda.some(l => /renderer\.render/.test(l)) && sinGuarda.some(l => /vrFin/.test(l)));
  assert.ok(/var rp = Reparto\.on, q = rp \? Reparto\.ini\(t\) : 0;/.test(cuerpo), "rp se lee una vez por fotograma");
  const c2 = lee("apps/web/motor/02c_componentes.js"), act = c2.slice(c2.indexOf("function actualiza(fase, dt, t)"), c2.indexOf("function api(id)"));
  assert.ok(/if \(Reparto\.on\) \{[^\n]*performance\.now\(\)[^\n]*Reparto\.pasa\(c\.rp, q\); continue; \}/.test(act), "cada componente se mide solo si Reparto.on");
  assert.strictEqual((act.match(/performance\.now\(\)/g) || []).length, 1, "una sola lectura de reloj en Componentes.actualiza, dentro de la rama de medir");
  // las funciones del reparto no reservan
  const R = require("./_reservas"), rs = R.recuenta()["02c_componentes.js"];
  assert.deepStrictEqual(rs.faltan, []); assert.strictEqual(rs.total, 0, JSON.stringify(rs.detalle));
  assert.ok(Object.keys(rs.porFn).includes("Reparto.pasa") && Object.keys(rs.porFn).includes("Reparto.ini"));
  // y el medidor lo apaga al terminar y al liberar
  assert.ok(/Reparto\.on = true/.test(FUENTE) && (FUENTE.match(/Reparto\.on = false/g) || []).length === 2);
});

// ---------- fotogramas perdidos (intervalos de más de 1,5 periodos de refresco) y vsync perdidos ----------
function aleat(sem) { let s = sem; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
test("perdidos: 72 Hz con fluctuación de ±0,3 ms da 0 perdidos aunque «por encima de 13,9» ronde el 50 %", () => {
  const r = aleat(7), ms = Array.from({ length: 4000 }, () => 13.9 + (r() * 2 - 1) * 0.3);
  const e = E.calcula(serie(ms, 3, 0.015), 3, 60, undefined, 72);
  assert.ok(e.pctSobre > 40 && e.pctSobre < 60, "el criterio de 13,9 ms se rompe por fluctuación: " + e.pctSobre);
  assert.strictEqual(e.perdidos.n, 0); assert.strictEqual(e.perdidos.vsync, 0); assert.strictEqual(e.perdidos.fuente, "hz");
  assert.ok(Math.abs(e.perdidos.umbral - 20.83) < 0.01 && Math.abs(e.perdidos.periodo - 13.889) < 0.001);
});
test("perdidos: un intervalo de 27,8 ms pierde 1 vsync y uno de 41,7 ms pierde 2; el límite es estricto en 1,5 periodos", () => {
  const ms = Array.from({ length: 100 }, () => 13.9); ms[10] = 27.8; ms[20] = 41.7; ms[30] = 20.8; ms[40] = 20.9;
  const e = E.calcula(serie(ms, 3, 0.05), 3, 60, undefined, 72);
  assert.strictEqual(e.perdidos.n, 3);   // 27,8; 41,7 y 20,9 (20,8 < 20,83 no cuenta)
  assert.strictEqual(e.perdidos.vsync, 1 + 2 + 1);   // 20,9 / 13,89 redondea a 2 -> pierde 1
  assert.strictEqual(e.perdidos.pct, 3);
  const solo = E.perdidosDe([13.9, 27.8], 72), dos = E.perdidosDe([13.9, 41.7], 72);
  assert.deepStrictEqual([solo.vsync, dos.vsync], [1, 2]);
});
test("perdidos: sin Hz conocidos el periodo es la mediana del intervalo y el informe lo dice; la tarjeta sigue en 14 líneas y trae el criterio nuevo", () => {
  const ms = Array.from({ length: 200 }, () => 16.7); ms[5] = 33.4;
  const e = E.calcula(serie(ms, 3, 0.05), 3, 60);
  assert.strictEqual(e.perdidos.fuente, "mediana"); assert.strictEqual(e.perdidos.n, 1); assert.strictEqual(e.perdidos.vsync, 1);
  const r = medidaVR("VR", 400); r.est = E.calcula(serie(Array.from({ length: 400 }, (_, i) => (i === 7 ? 41.7 : 13.9)), 3, 0.05), 3, 60, undefined, 72);
  const c = E.lineas(r, true), l = E.lineas(r, false).join("\n"), t = c.join("\n");
  assert.ok(c.length <= 14, "la tarjeta cabe: " + c.length);
  assert.match(t, /1 perdidos \(0\.3 %\)/); assert.match(t, /perdidos ≤ 1 %: sí/); assert.match(t, /criterio 5 de ADR-0015/);
  assert.match(l, /Fotogramas perdidos \(intervalo > 1,5 periodos = 20\.8 ms; periodo 13\.9 ms de 72 Hz\): 1 \(0\.3 %\) · vsync perdidos: 2/);
  assert.match(E.lineas(Object.assign({}, r, { est: e }), false).join("\n"), /mediana del intervalo, sin Hz conocidos/);
  const mala = medidaVR("VR", 400); mala.est = E.calcula(serie(Array.from({ length: 400 }, (_, i) => (i % 10 === 0 ? 27.8 : 13.9)), 3, 0.05), 3, 60, undefined, 72);
  assert.match(E.lineas(mala, true).join("\n"), /perdidos ≤ 1 %: no/);
});
test("perdidos: una medida guardada de antes (sin «perdidos») sigue dando texto; el cuerpo de envío trae perdidos_n y vsync_perdidos solo si se midieron", () => {
  const r = medidaVR("VR", 400); delete r.est.perdidos;
  assert.doesNotThrow(() => E.lineas(r, true)); assert.doesNotThrow(() => E.lineas(r, false));
  const x = { ua: UA_QUEST, finca: "hituelo", modo: "nube", version: "0.2.0" };
  assert.ok(!("perdidos_n" in E.cuerpoEnvio(r, x)));
  r.est.perdidos = { n: 9, vsync: 11, pct: 0.2, periodo: 13.9, umbral: 20.8, fuente: "hz", hz: 72 };
  const c = E.cuerpoEnvio(r, x), esquema = JSON.parse(lee("contratos/medidas.schema.json"));
  assert.deepStrictEqual([c.perdidos_n, c.vsync_perdidos], [9, 11]);
  for (const k of ["perdidos_n", "vsync_perdidos"]) { assert.ok(k in esquema.properties, k); assert.ok(!esquema.required.includes(k)); }
});

// ---- Q0l: la tarjeta dice qué toma es y con qué se dibujó
test("Q0l: la URL de la toma deja solo parametros conocidos del motor y valores cortos (sin tokens ni datos personales)", () => {
  assert.strictEqual(E.urlToma("?debug&mide=60&xrescala=0.8&cartulina=silueta"), "?debug&mide=60&xrescala=0.8&cartulina=silueta");
  assert.strictEqual(E.urlToma("?api=https://x.es&yo=Pepe&chat=1&token=abc&debug&suelo=fotos&sueloVR=1"), "?debug&suelo=fotos&sueloVR=1");
  assert.strictEqual(E.urlToma("?tileset=http://a/b&olivos=" + "x".repeat(40) + "&mide=60"), "?mide=60", "valores largos o con simbolos fuera");
  assert.strictEqual(E.urlToma(""), "(sin parametros)");
  assert.strictEqual(E.urlToma("?oficial=ab12&n=3"), "(sin parametros)");
});
test("Q0l: la cabeza se redondea a metros y a 15 grados", () => {
  assert.deepStrictEqual(E.cabezaToma({ x: 12.4, z: -45.6 }, { x: 1, z: 0 }), { x: 12, z: -46, rumbo: 90 });
  assert.deepStrictEqual(E.cabezaToma({ x: 0, z: 0 }, { x: 0, z: -1 }), { x: 0, z: 0, rumbo: 0 });
  assert.strictEqual(E.cabezaToma({ x: 0, z: 0 }, { x: -0.3, z: -1 }).rumbo, 345, "−16,7° cae en 345, no en negativo");
  assert.strictEqual(E.cabezaToma({ x: 0, z: 0 }, { x: Math.sin(0.13), z: -Math.cos(0.13) }).rumbo, 0, "7,4° cae en 0");
  assert.strictEqual(E.cabezaToma(null, { x: 0, z: -1 }), null);
  assert.strictEqual(E.cabezaToma({ x: NaN, z: 0 }, { x: 0, z: -1 }), null);
  assert.strictEqual(E.textoCabeza({ x: 12, z: -46, rumbo: 90 }), "cabeza x 12 z -46 m, rumbo 90°");
});
test("Q0l: la tarjeta de VR lleva URL, cartulina, suelo, GPU y cabeza; la de pantalla no lleva cabeza", () => {
  const extra = { url: "?debug&mide=60&cartulina=silueta", uso: { cartulina: { modo: "silueta", origen: "url" }, suelo: { activo: true, vr: true, encendido: true } }, gpu: { ini: { g: 210, t: 80 }, fin: { g: 214, t: 80 }, sueloMB: 21.3, sueloFmt: "KTX2" }, cabeza: { x: 12, z: -46, rumbo: 90 }, dibujo: "Dibujo: tono neutro (defecto) · alphaToCoverage no (defecto)" };
  const vr = E.lineas(conDibujo("VR", 400, extra), true).join("\n");
  assert.match(vr, /Escena: tiles · \?debug&mide=60&cartulina=silueta/);
  assert.match(vr, /Aparato: VR · cabeza x 12 z -46 m, rumbo 90°/);
  assert.match(vr, /Dibujo: .* · cartulina silueta \(url\) · suelo de fotos sí \(en VR\) · encendido/);
  assert.match(vr, /GPU: geometrías 210 → 214 · texturas 80 · suelo KTX2 21,3 MB/);
  const largo = E.texto(conDibujo("VR", 400, extra));
  assert.match(largo, /URL de la toma: \?debug&mide=60&cartulina=silueta/);
  assert.match(largo, /Cabeza al empezar .*cabeza x 12 z -46 m, rumbo 90°.*Quieto, desde la llegada, mirando igual que en la toma anterior/);
  const pant = E.texto(conDibujo("pantalla", 400, Object.assign({}, extra, { cabeza: undefined })));
  assert.doesNotMatch(pant, /Cabeza al empezar/);
  assert.doesNotMatch(E.texto(conDibujo("VR", 400)), /GPU:|URL de la toma|Cabeza al empezar/, "una medida vieja sin estos campos sale como siempre");
  assert.match(E.texto(conDibujo("VR", 400, { cabeza: null })), /cabeza n\/d/);
});
test("Q0l: nada de lo nuevo viaja a la api (el cuerpo del envio no cambia)", () => {
  const p = E.cuerpoEnvio(conDibujo("VR", 400, { url: "?debug", gpu: { ini: { g: 1, t: 1 }, fin: { g: 1, t: 1 } }, cabeza: { x: 1, z: 1, rumbo: 0 }, uso: {} }), { ua: UA_QUEST, finca: "f", modo: "m", version: "1" });
  assert.ok(p && !("url" in p) && !("gpu" in p) && !("cabeza" in p) && !("uso" in p));
});
test("Q0l: el motor pone la guia en el panel y consume SueloFotos", () => {
  assert.match(FUENTE, /id: "mideGuia"/); assert.match(FUENTE, /"Reparto", "SueloFotos"\]/);
});

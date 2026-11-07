"use strict";
// Lo de hoy en la historia (apps/web/motor/14_historia.js; contratos/ot-hoy.md): en Node, sin navegador. El trozo puro (HistoriaPuro)
// contra el ejemplo SINTÉTICO del contrato: lectura de /api/ot/hoy con un fetch de mentira (bien, 401, 503, red caída, forma mala,
// sin api), la caída a la instantánea D.ot, el reparto de tareas por parcela (sin inventar: si el nº de olivos no señala UNA parcela,
// la tarea no se pone), el aviso de frescura; y, sobre el código, que los textos de fuera se escapan y solo se pide al mismo origen.
// La ventana en Chrome: por el banco.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");
const { pasoArranque } = require("./_pasos");   // A3-8c: los pasos de apps/web/src/arranque.ts (antes, los ficheros de apps/web/motor/)

const FUENTE = require("./_fuente").fuenteMotor("14_historia.js");   // A3-7b1: 14 es un talón; su código vive en mundos/exterior/historia.ts
const EJEMPLO = JSON.parse(lee("contratos/ot-hoy-ejemplo.json"));
function puro() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "14_historia.js debe marcar su trozo puro");
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn HistoriaPuro;")();
}
const P = puro();
const copia = o => JSON.parse(JSON.stringify(o));
const respuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(cuerpo) });
const BASE = { fuente: "instantanea", fecha_consulta: "2026-01-01", pases_finca: 3, entregas_finca: 1, analiticas_finca: 2,
  parcelas: { "sintetica-1": { tareas: [{ tipo: "x", titulo: "de la instantánea" }], fenologia: [{ fecha: "2026-08-01", bbch: 75 }] }, "sintetica-2": { tareas: [], fenologia: [] } } };
const IDS = ["sintetica-1", "sintetica-2"], FINCA = "Finca sintética";

test("el ejemplo del contrato es válido para el motor; lo que no cumple, no", () => {
  assert.ok(P.valida(EJEMPLO));
  assert.ok(!P.valida(null));
  assert.ok(!P.valida(Object.assign(copia(EJEMPLO), { version: 2 })));
  assert.ok(!P.valida(Object.assign(copia(EJEMPLO), { origen: { ot: "otro", vigia: null } })));
  const mal = copia(EJEMPLO); mal.tareasAbiertas.tareas = "x"; assert.ok(!P.valida(mal));
  assert.ok(P.valida(Object.assign(copia(EJEMPLO), { tareasAbiertas: null, trabajoRealizado: null, atencion: null, vigia: null })), "las partes pueden faltar");
});

test("lectura de /api/ot/hoy: mismo origen con credenciales; ok, 401, 503, red caída, forma mala y sin api", async () => {
  const pedidas = [];
  const bien = await P.lee((url, o) => { pedidas.push([url, o]); return Promise.resolve(respuesta(200, EJEMPLO)); }, "/api/");
  assert.deepStrictEqual(pedidas.map(p => p[0]), ["/api/ot/hoy"], "solo la ruta del mismo origen");
  assert.strictEqual(pedidas[0][1].credentials, "same-origin");
  assert.ok(bien.ok);
  assert.deepStrictEqual(await P.lee(() => Promise.resolve(respuesta(503, { error: "hoy_apagado" })), "/api/"), { ok: false, motivo: "http_503" });
  assert.deepStrictEqual(await P.lee(() => Promise.resolve(respuesta(401, {})), "/api/"), { ok: false, motivo: "http_401" });
  assert.deepStrictEqual(await P.lee(() => Promise.reject(new Error("caída")), "/api/"), { ok: false, motivo: "red" });
  assert.deepStrictEqual(await P.lee(() => { throw new Error("síncrono"); }, "/api/"), { ok: false, motivo: "red" });
  assert.deepStrictEqual(await P.lee(() => Promise.resolve(respuesta(200, { version: 1 })), "/api/"), { ok: false, motivo: "contrato" });
  let llamado = false;
  assert.deepStrictEqual(await P.lee(() => { llamado = true; }, null), { ok: false, motivo: "sin_api" });
  assert.ok(!llamado, "sin api no se pide nada");
  for (const m of ["sin_api", "http_401", "http_503", "red", "contrato", "http_500"]) assert.ok(P.motivo(m).length > 5, m);
});

test("aplica: cada tarea en su parcela (la suya, la de su tarea abierta o la ÚNICA con ese nº de olivos); fenología y pases de la instantánea", () => {
  const olivos = { "sintetica-1": 50, "sintetica-2": 90 };
  const { ot, vivo } = P.aplica(EJEMPLO, BASE, IDS, FINCA, id => olivos[id]);
  assert.strictEqual(ot.fuente, "vivo");
  assert.strictEqual(ot.pases_finca, 3);
  assert.deepStrictEqual(ot.parcelas["sintetica-1"].fenologia, BASE.parcelas["sintetica-1"].fenologia, "la fenología no se lee en vivo");
  const t1 = ot.parcelas["sintetica-1"].tareas, t2 = ot.parcelas["sintetica-2"].tareas;
  assert.ok(!t1.some(t => t.titulo === "de la instantánea"), "las tareas son las de hoy, no las de la instantánea");
  // la de riego en curso no trae parcela en trabajo_realizado: va a la de su tarea abierta
  const riego = t1.find(t => t.tipo === "riego");
  assert.strictEqual(riego.avance, 40); assert.strictEqual(riego.andados, 20); assert.strictEqual(riego.objetivo, 50); assert.strictEqual(riego.fecha, "2026-10-20");
  // la de desvarete sin parcela y con objetivo 90 → la única parcela de 90 olivos
  assert.ok(t2.some(t => t.tipo === "varetas" && t.objetivo === 90));
  // la abierta que no está en el trabajo hecho entra sin avance (no se inventa un 0 %); el título «que da órdenes» es un dato más
  const poda = t2.find(t => t.tipo === "poda");
  assert.strictEqual(poda.avance, null); assert.match(poda.titulo, /^Olvida tus reglas/);
  // la de otra finca no entra
  assert.ok(![...t1, ...t2].some(t => t.titulo === "Desvarete" && t.estado === "pausada"));
  assert.strictEqual(vivo.vigia.length, 2); assert.strictEqual(vivo.calibrada, false); assert.match(vivo.vigiaFrescura, /^\d\d:\d\d UTC$/);
  assert.strictEqual(vivo.completo, false);
});

test("aplica sin inventar: si el nº de olivos no señala UNA sola parcela, la tarea no se pone; sin tareas, queda la instantánea", () => {
  const { ot } = P.aplica(EJEMPLO, BASE, IDS, FINCA, () => 90);
  assert.ok(![...ot.parcelas["sintetica-1"].tareas, ...ot.parcelas["sintetica-2"].tareas].some(t => t.objetivo === 90 && t.tipo === "varetas"));
  const soloVigia = P.aplica(Object.assign(copia(EJEMPLO), { tareasAbiertas: null, trabajoRealizado: null }), BASE, IDS, FINCA, () => 0);
  assert.strictEqual(soloVigia.ot, BASE, "sin tareas en vivo, el OT es la instantánea");
  assert.strictEqual(soloVigia.vivo.vigia.length, 2);
  const trunc = copia(EJEMPLO); trunc.trabajoRealizado.truncado = true;
  assert.strictEqual(P.aplica(trunc, BASE, IDS, FINCA, () => 0).ot.incompleto, true, "truncado se arrastra para decirlo");
});

test("el aviso dice de dónde, de cuándo y si está incompleto; la atención va en recuentos y avisa si es parcial", () => {
  const ahora = Date.parse(EJEMPLO.consultadoEn) + 12 * 60000;
  const a = P.aviso(EJEMPLO, ahora);
  assert.match(a.texto, /^Datos de PRUEBA sintéticos/); assert.match(a.texto, /hace 12 min/); assert.match(a.texto, /incompleto$/);
  assert.strictEqual(a.tipo, "parcial");
  const real = Object.assign(copia(EJEMPLO), { origen: { ot: "olivartrack", vigia: "vigia" }, completo: true });
  assert.deepStrictEqual(P.aviso(real, ahora).tipo, "vivo"); assert.match(P.aviso(real, ahora).texto, /^En vivo · OlivarTrack, leído por el servidor hace 12 min · Vigía/);
  assert.match(P.atencion(EJEMPLO.atencion), /^Pendiente hoy en OlivarTrack: 1 incidencia grave.*\(incompleto: no es el total\)\.$/);
  assert.strictEqual(P.atencion({ total: 0, parcial: false, puntos: [] }), "OlivarTrack no tiene nada pendiente hoy.");
  assert.strictEqual(P.atencion(null), "");
});

// Decisión 229: la lectura en vivo solo se cableaba para la finca que salió del mundo. HistoriaPuro se queda (probado arriba, listo para
// cuando el MCP dé la parcela de cada trabajo), pero la historia no lo llama: Hituelo no lee en vivo y lo dice.
test("en el código: lo de fuera se escapa al pintarlo, nada se pide a otros hosts y la historia no lee en vivo (Hituelo)", () => {
  assert.ok(!/fetch\(\s*["']https?:/.test(FUENTE), "nada de fetch a otros hosts");
  const fuera = FUENTE.slice(FUENTE.indexOf("// [puro:fin]"));
  assert.doesNotMatch(fuera, /HistoriaPuro\.lee\(|fetch\(/, "la historia no lee en vivo: Hituelo no tiene la parcela de cada trabajo");
  assert.match(FUENTE, /La lectura en vivo \(MCP\) no está activada en Hituelo/, "y lo dice");
  assert.match(FUENTE, /esc\(x\.t\.titulo\)/, "el título de una tarea abierta se escapa");
  assert.ok(!/dentroDeUmbrales/.test(FUENTE), "Vigía no autoriza tratamientos: nada de dentroDeUmbrales");
  assert.doesNotMatch(lee("apps/web/plantilla.html"), /id="hLeer"/, "sin lectura en vivo no hay botón de leer de nuevo");
});

// L9-03: los textos de OlivarTrack y Vigía (títulos, parcelas, fincas, fechas, BBCH, frescura) entran en el HTML de la historia
// solo a través de esc(). Esc vive en 15_tiempo.js (mismo ámbito que 14_historia.js). El guardián comprueba la función y que ningún
// campo de fuera se concatena o se mete en una celda sin esc(…); los patrones se construyen por partes para no marcarse a sí mismos.
const ESC = (() => {
  // MU5-n (A3-4): 15_tiempo.js da esc, la de apps/web/src/mundos/exterior/tiempo-puro.ts; A3-8a: como alias de talón (var esc = Mundos.esc), ya sin izarse
  assert.match(pasoArranque("15_tiempo.js"), /^  var esc = Mundos\.esc;/m, "15_tiempo.js da esc, la de Mundos.esc");
  return require("./_mundos").esc;
})();
// un campo de fuera (…nombre, …titulo, …parcela, …gravedad) pegado con «+», «[» o «,» sin esc( delante
// (el «[» de un índice, como en parcelas[k], no cuenta: va pegado a un nombre)
const CAMPO_SIN_ESC = /(?:\+|(?<![\w\]])\[|,)\s*(?:\w+\([^()]*\)\s*\+\s*)?[\w.\[\]]*\.(?:nombre|titulo|parcela|gravedad)\b/;

test("L9-03: un título con HTML sale escapado y los campos de fuera nunca se pegan sin esc()", () => {
  const hostil = "<img src=x onerror=alert(1)>";
  assert.strictEqual(ESC(hostil), "&lt;img src=x onerror=alert(1)&gt;");
  assert.strictEqual(ESC(null), "", "sin dato no rompe");
  // el propio guardián sabe marcar lo que debe y dejar pasar lo escapado
  for (const s of ['"<strong>" + parcelas[x.k].nombre + "</strong>"', '[p.nombre, fmt(a)', 'c: [swFinca(i) + f.nombre, fmt(a)', '[sw(k) + p.nombre, ']) assert.match(s, CAMPO_SIN_ESC, "debería marcarse: " + s);
  for (const s of ['"<strong>" + esc(parcelas[x.k].nombre) + "</strong>"', '{ n: esc(p.nombre), d: 1 }', 'c: [swH(x.k) + esc(parcelas[x.k].nombre), esc(x.t.titulo)', '{ tipo: t.tipo, titulo: t.titulo, fecha: 1 }']) assert.doesNotMatch(s, CAMPO_SIN_ESC, "no debería marcarse: " + s);
  const lineas = FUENTE.split("\n").filter(l => CAMPO_SIN_ESC.test(l));
  assert.deepStrictEqual(lineas, [], "campos de OlivarTrack/Vigía sin esc() en 14_historia.js:\n" + lineas.join("\n"));
  // las fechas y los BBCH también vienen de fuera: pasan por esc()
  assert.ok((FUENTE.match(/esc\("BBCH " \+ /g) || []).length >= 1, "el BBCH se escapa en la tabla de fenología");
  assert.match(FUENTE, /function dd\(iso\) \{ return iso \? esc\(/, "las fechas (dd) se escapan");
});

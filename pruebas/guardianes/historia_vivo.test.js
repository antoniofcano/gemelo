"use strict";
// Lo de hoy en la historia (apps/web/motor/14_historia.js; contratos/ot-hoy.md): en Node, sin navegador. El trozo puro (HistoriaPuro)
// contra el ejemplo SINTÉTICO del contrato: lectura de /api/ot/hoy con un fetch de mentira (bien, 401, 503, red caída, forma mala,
// sin api), la caída a la instantánea D.ot, el reparto de tareas por parcela (sin inventar: si el nº de olivos no señala UNA parcela,
// la tarea no se pone), el aviso de frescura; y, sobre el código, que los textos de fuera se escapan y solo se pide al mismo origen.
// La ventana en Chrome: por el banco.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/14_historia.js");
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

test("en el código: lo de fuera se escapa al pintarlo, solo se pide al mismo origen y Hituelo no lee en vivo", () => {
  assert.ok(!/fetch\(\s*["']https?:/.test(FUENTE), "nada de fetch a otros hosts");
  assert.match(FUENTE, /HistoriaPuro\.lee\(fetch\.bind\(window\), api\)/);
  assert.match(FUENTE, /var api = !esH &&/, "solo Cerro");
  assert.match(FUENTE, /esc\(x\.t\.titulo\)/, "el título de una tarea abierta se escapa");
  assert.match(FUENTE, /esc\(x\.parcela\)/, "la parcela de Vigía se escapa");
  assert.match(FUENTE, /esc\(at\)/, "la línea de atención se escapa");
  assert.ok(!/dentroDeUmbrales/.test(FUENTE), "Vigía no autoriza tratamientos: nada de dentroDeUmbrales");
  assert.match(lee("apps/web/plantilla.html"), /id="hLeer"[^>]*hidden/, "el botón de leer de nuevo nace oculto (solo con servidor)");
});

"use strict";
// El tiempo en el motor (apps/web/motor/15_tiempo.js; contratos/tiempo.md): en Node, sin navegador. El trozo puro (TiempoPuro) contra el ejemplo
// del contrato: lectura de /api/tiempo con un fetch de mentira (bien, 401, 503, red caída, forma mala, sin api), la caída a lo simulado,
// el cielo deducido, la hora de la previsión y la forma de TiempoVivo.lee(); y, sobre el código, que dentroDeUmbrales no se pinta, que
// los textos de Vigía se escapan y que solo se pide al mismo origen. El chip y la ventana en Chrome: por el banco.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/15_tiempo.js"), PL = lee("apps/web/plantilla.html");
const EJEMPLO = JSON.parse(lee("contratos/tiempo-ejemplo.json"));
function puro() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "15_tiempo.js debe marcar su trozo puro");
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn TiempoPuro;")();
}
const P = puro();
const copia = o => JSON.parse(JSON.stringify(o));
const respuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(cuerpo) });

test("el ejemplo del contrato es válido para el motor; lo que no cumple, no", () => {
  assert.ok(P.valida(EJEMPLO));
  assert.ok(!P.valida(null));
  assert.ok(!P.valida(Object.assign(copia(EJEMPLO), { version: 2 })));
  assert.ok(!P.valida(Object.assign(copia(EJEMPLO), { origen: "otro" })));
  const malHora = copia(EJEMPLO); malHora.prevision.horas[0].instante = "no es fecha"; assert.ok(!P.valida(malHora));
  assert.ok(P.valida(Object.assign(copia(EJEMPLO), { actual: null, prevision: null })), "las dos partes pueden faltar");
});

test("lectura de /api/tiempo: mismo origen con credenciales; ok, 401, 503, red caída, forma mala y sin api", async () => {
  const pedidas = [];
  const bien = await P.lee((url, o) => { pedidas.push([url, o]); return Promise.resolve(respuesta(200, EJEMPLO)); }, "/api/");
  assert.deepStrictEqual(pedidas.map(p => p[0]), ["/api/tiempo"], "solo la ruta del mismo origen");
  assert.strictEqual(pedidas[0][1].credentials, "same-origin");
  assert.ok(bien.ok); assert.strictEqual(bien.datos.origen, "fixture");
  assert.deepStrictEqual(await P.lee(() => Promise.resolve(respuesta(503, { error: "tiempo_apagado" })), "/api/"), { ok: false, motivo: "http_503" });
  assert.deepStrictEqual(await P.lee(() => Promise.resolve(respuesta(401, {})), "/api/"), { ok: false, motivo: "http_401" });
  assert.deepStrictEqual(await P.lee(() => Promise.reject(new Error("caída")), "/api/"), { ok: false, motivo: "red" });
  assert.deepStrictEqual(await P.lee(() => { throw new Error("síncrono"); }, "/api/"), { ok: false, motivo: "red" });
  assert.deepStrictEqual(await P.lee(() => Promise.resolve(respuesta(200, { version: 1 })), "/api/"), { ok: false, motivo: "contrato" });
  let llamado = false;
  assert.deepStrictEqual(await P.lee(() => { llamado = true; }, null), { ok: false, motivo: "sin_api" });
  assert.ok(!llamado, "sin api no se pide nada (la salida artefacto y las pruebas antiguas)");
  for (const m of ["sin_api", "http_401", "http_503", "red", "contrato", "http_500"]) assert.ok(P.motivo(m).length > 5, m);
});

test("la caída a lo simulado: si la lectura falla, el código pasa a tiempoSimulado y lo dice (chip y ventana)", () => {
  assert.match(FUENTE, /tiempoSimulado\(TiempoPuro\.motivo\(r\.motivo\)\)/, "sin api y sin conector: simulado con el motivo");
  assert.match(FUENTE, /tAviso\("Tiempo simulado: "/, "la ventana lo dice");
  assert.match(FUENTE, /TM\.origen === "simulado" \? " · simulado"/, "el chip lo dice");
  const v = P.vivo("simulado", null, null, ["Tiempo simulado: no hay datos de Vigía."], Date.now());
  assert.deepStrictEqual(v, { origen: "simulado", actual: null, horas: [], frescura: { generadoEn: null, horasDeAntiguedad: null }, avisos: ["Tiempo simulado: no hay datos de Vigía."] });
});

test("de la api a las fichas: medido y modelado, sin dentroDeUmbrales aunque llegara", () => {
  const r = copia(EJEMPLO); r.prevision.horas[0].dentroDeUmbrales = true;   // aunque la api lo dejara pasar (no lo hace), no se copia
  const s = P.aEstado(r);
  assert.strictEqual(s.est.hayLectura, true); assert.strictEqual(s.est.estacion.distanciaKm, EJEMPLO.actual.estacion.distanciaKm);
  assert.strictEqual(s.est.direccionViento.grados, EJEMPLO.actual.direccion.grados);
  assert.strictEqual(s.prev.hayPrevision, true); assert.strictEqual(s.prev.horas.length, EJEMPLO.prevision.horas.length);
  assert.ok(!JSON.stringify(s).includes("dentroDeUmbrales"));
  const vacio = P.aEstado(Object.assign(copia(EJEMPLO), { actual: null, prevision: null }));
  assert.deepStrictEqual([vacio.est.hayLectura, vacio.prev.hayPrevision], [false, false]);
});

test("TiempoVivo.lee(): la forma pactada (origen, actual medido con cielo deducido, horas modeladas, frescura, avisos de texto)", () => {
  const s = P.aEstado(EJEMPLO), ms = Date.parse(EJEMPLO.prevision.horas[1].instante) + 600000;
  const v = P.vivo(s.origen, s.est, s.prev, s.avisos, ms);
  assert.deepStrictEqual(Object.keys(v).sort(), ["actual", "avisos", "frescura", "horas", "origen"]);
  assert.deepStrictEqual(Object.keys(v.actual).sort(), ["cielo", "direccion", "estacion", "humedadRelativa", "lluvia", "naturaleza", "racha", "temperatura", "viento"]);
  assert.strictEqual(v.actual.naturaleza, "medido");
  assert.deepStrictEqual(v.actual.estacion, { id: EJEMPLO.actual.estacion.id, distanciaKm: EJEMPLO.actual.estacion.distanciaKm });
  assert.strictEqual(v.actual.lluvia, EJEMPLO.actual.lluviaAcumulada, "la lluvia del actual es el acumulado medido");
  assert.ok(["despejado", "nubes", "cubierto", "lluvia", "niebla"].includes(v.actual.cielo));
  assert.deepStrictEqual(Object.keys(v.horas[0]).sort(), ["direccion", "humedadRelativa", "instante", "lluvia", "naturaleza", "nubosidad", "probabilidadLluvia", "racha", "temperatura", "viento"]);
  assert.ok(v.horas.every(h => h.naturaleza === "modelado"));
  assert.deepStrictEqual(Object.keys(v.frescura).sort(), ["generadoEn", "horasDeAntiguedad"]);
  assert.ok(v.avisos.every(a => typeof a === "string"));
  assert.ok(!JSON.stringify(v).includes("dentroDeUmbrales"));
});

test("el cielo deducido y la hora de la previsión", () => {
  assert.strictEqual(P.cielo(10, 0, 50), "despejado");
  assert.strictEqual(P.cielo(50, 0, 50), "nubes");
  assert.strictEqual(P.cielo(90, 0, 50), "cubierto");
  assert.strictEqual(P.cielo(90, 1.2, 50), "lluvia");
  assert.strictEqual(P.cielo(100, 0, 99), "niebla");
  assert.strictEqual(P.cielo(null, null, null), null, "sin dato no se inventa");
  const h = EJEMPLO.prevision.horas, t = i => Date.parse(h[i].instante);
  assert.strictEqual(P.horaIdx(h, t(0) - 1), 0, "antes de la primera, la primera");
  assert.strictEqual(P.horaIdx(h, t(1) + 1), 1);
  assert.strictEqual(P.horaIdx(h, t(2) + 7200000), 2, "después de la última, la última");
  assert.strictEqual(P.horaIdx([], 0), -1);
});

test("en el código: dentroDeUmbrales no se pinta, los textos de Vigía se escapan y solo se pide al mismo origen", () => {
  const sinComentarios = FUENTE.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/dentroDeUmbrales/.test(sinComentarios), "dentroDeUmbrales no aparece fuera de los comentarios");
  assert.ok(!/se puede tratar|apto para tratar/i.test(FUENTE));
  assert.match(FUENTE, /adv\.map\(esc\)/, "las advertencias de Vigía, escapadas");
  assert.match(FUENTE, /esc\(a\.texto\)/, "los avisos, escapados");
  assert.ok(!/fetch\(\s*["']https?:/.test(FUENTE), "nada de fetch a otros hosts");
  assert.match(FUENTE, /HazasPuro\.prefijoApi\(location\.search, D\.base\)/, "la api, solo si la página la sirve el servidor (o ?api=)");
  assert.match(FUENTE, /<span class="t-pill">medido<\/span>/); assert.match(FUENTE, /t-pill-m">modelado<\/span>/); assert.match(FUENTE, /ilustrativo/);
  assert.match(PL, /<label for="tMomento">Momento que ves<\/label>/);
});

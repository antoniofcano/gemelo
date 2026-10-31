"use strict";
// Las hazas en el motor (apps/web/motor/13b_hazas.js, F1 «3c»). En Node, sin navegador: el GeoJSON de GET /api/hazas se valida contra el esquema
// `Hazas` de contratos/api.openapi.yaml (ajv) y el validador del motor dice lo mismo; UTM → local con centro_utm; el toque al suelo; la ficha solo con
// la lista blanca de contratos/haza.schema.json (con procedencia y fecha); y, con un THREE y un fetch falsos, que sin api, con 401 o con datos que no
// cumplen el contrato no se crea nada ni se escribe en la consola, y que con datos Hazas.lindes() da la linde y «hazas:cambia» lo avisa (el dibujo de la
// linde es del componente 44_lindes.js: pruebas/guardianes/lindes.test.js).
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");
const Ajv2020 = require("ajv/dist/2020").default;
const YAML = require("yaml");

const FUENTE = lee("apps/web/motor/13b_hazas.js");
function puro() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "13b_hazas.js debe marcar su trozo puro con // [puro:inicio] y // [puro:fin]");
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn HazasPuro;")();
}
const P = puro();

// el esquema del contrato, tal cual (OpenAPI 3.1 = JSON Schema 2020-12)
const OPENAPI = YAML.parse(lee("contratos/api.openapi.yaml"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
const V_HAZAS = ajv.compile(OPENAPI.components.schemas.Hazas);
const V_FICHA = (() => { const e = JSON.parse(lee("contratos/haza.schema.json")); delete e.$schema; return new Ajv2020({ strict: false, allErrors: true, validateFormats: false }).compile(e); })();

const CX = 430000, CY = 4180000;   // un centro_utm de mentira (UTM 30N); nada de esto es real
const cuadro = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
function coleccion() {
  return {
    type: "FeatureCollection", srs: "EPSG:25830",
    features: [
      { type: "Feature", id: 1, geometry: { type: "MultiPolygon", coordinates: [[cuadro(CX, CY, CX + 100, CY + 80), cuadro(CX + 40, CY + 30, CX + 60, CY + 50)]] }, properties: { codigo: "H-D01", nombre: "Haza de prueba", finca: "hituelo", es_mia: true } },
      { type: "Feature", id: 2, geometry: { type: "MultiPolygon", coordinates: [[cuadro(CX + 100, CY, CX + 250, CY + 80)], [cuadro(CX - 90, CY - 90, CX - 50, CY - 50)]] }, properties: { codigo: "H-D02", nombre: "Haza ajena", finca: "hituelo", es_mia: false } },
    ],
  };
}

test("el ejemplo cumple el esquema Hazas del contrato y el motor lo acepta entero", () => {
  const c = coleccion();
  assert.ok(V_HAZAS(c), JSON.stringify(V_HAZAS.errors));
  const v = P.validaColeccion(c);
  assert.strictEqual(v.error, null);
  assert.deepStrictEqual(v.hazas.map(h => [h.id, h.codigo, h.es_mia, h.poligonos.length]), [[1, "H-D01", true, 1], [2, "H-D02", false, 2]]);
});

test("el validador del motor y el contrato dicen lo mismo con lo que no cumple (y el motor solo admite EPSG:25830, que es lo que pide)", () => {
  const casos = {
    "clave de más arriba": c => { c.extra = 1; },
    "titular en properties": c => { c.features[0].properties.titular = "Fulano"; },
    "falta es_mia": c => { delete c.features[0].properties.es_mia; },
    "es_mia no booleano": c => { c.features[0].properties.es_mia = "sí"; },
    "id no entero": c => { c.features[0].id = "1"; },
    "id con decimales": c => { c.features[0].id = 1.5; },
    "geometría Polygon": c => { c.features[0].geometry.type = "Polygon"; },
    "no es FeatureCollection": c => { c.type = "Feature"; },
    "srs desconocido": c => { c.srs = "EPSG:3857"; },
    "feature con clave de más": c => { c.features[1].bbox = [0, 0, 1, 1]; },
    "falta features": c => { delete c.features; },
  };
  for (const [nombre, cambia] of Object.entries(casos)) {
    const c = coleccion(); cambia(c);
    assert.strictEqual(V_HAZAS(c), false, nombre + ": el contrato debería rechazarlo");
    const v = P.validaColeccion(c);
    assert.ok(v.error, nombre + ": el motor debería rechazarlo");
    assert.deepStrictEqual(v.hazas, [], nombre + ": sin hazas");
  }
  const c = coleccion(); c.srs = "EPSG:4326";
  assert.ok(V_HAZAS(c), "EPSG:4326 cumple el contrato");
  assert.match(P.validaColeccion(c).error, /EPSG:25830/, "pero el motor trabaja en UTM 30N y no lo dibuja");
  // y lo que el esquema deja abierto (coordinates: array), el motor lo cierra: vértices numéricos y anillos de 4 o más
  const d = coleccion(); d.features[0].geometry.coordinates[0][0][2] = ["a", 1];
  assert.ok(V_HAZAS(d)); assert.match(P.validaColeccion(d).error, /vértice/);
  const e = coleccion(); e.features[0].geometry.coordinates[0][0] = [[CX, CY], [CX + 1, CY], [CX, CY]];
  assert.match(P.validaColeccion(e).error, /4 vértices/);
  for (const raro of [null, 1, "x", [], { type: "FeatureCollection" }]) assert.ok(P.validaColeccion(raro).error, "rechaza " + JSON.stringify(raro));
});

test("UTM 30N → coordenadas del mundo: metros relativos a centro_utm (y al norte; en la escena z = −y)", () => {
  assert.deepStrictEqual(P.aLocal([CX + 12.5, CY - 7.25], CX, CY), [12.5, -7.25]);
  const h = P.validaColeccion(coleccion()).hazas[1], an = P.anillosLocales(h, CX, CY);
  assert.strictEqual(an.length, 2, "dos polígonos de un anillo cada uno");
  assert.deepStrictEqual(an[1][0], [-90, -90]);
  assert.ok(P.enElMundo(an, [-200, 200, 300, -200], 0));
  assert.ok(!P.enElMundo(an, [1000, 2000, 1500, 1500], 50), "fuera de la caja del mundo no se dibuja");
});

test("punto en haza: el agujero queda fuera; los polígonos sueltos de un MultiPolygon cuentan", () => {
  const hs = P.validaColeccion(coleccion()).hazas.map(h => ({ poligonosLoc: h.poligonos.map(pol => pol.map(r => r.map(q => P.aLocal(q, CX, CY)))) }));
  assert.strictEqual(P.hazaEn(10, 10, hs), 0);
  assert.strictEqual(P.hazaEn(50, 40, hs), -1, "dentro del agujero");
  assert.strictEqual(P.hazaEn(150, 40, hs), 1);
  assert.strictEqual(P.hazaEn(-70, -70, hs), 1, "segundo polígono de la haza 2");
  assert.strictEqual(P.hazaEn(400, 400, hs), -1);
});

test("del toque al suelo: el rayo encuentra el suelo (llano y en cuesta) y no lo encuentra si mira al cielo", () => {
  const llano = () => 10, q = P.rayoSuelo([0, 110, 0], [0, -Math.SQRT1_2, -Math.SQRT1_2], llano, 5000);
  assert.ok(Math.abs(q[0]) < 1e-6 && Math.abs(q[1] - 100) < 1e-3, "a 100 m al norte: " + q);
  const cuesta = (x) => x * 0.5, r = P.rayoSuelo([0, 50, 0], [1, 0, 0], cuesta, 5000);
  assert.ok(Math.abs(r[0] - 100) < 1e-3, "corta la cuesta en x = 100: " + r);
  assert.strictEqual(P.rayoSuelo([0, 50, 0], [0, 1, 0], llano, 5000), null);
  assert.strictEqual(P.rayoSuelo([0, 5, 0], [0, -1, 0], llano, 5000), null, "si ya está bajo el suelo, nada");
});

// una ficha que cumple haza.schema.json…
function ficha(cambios) {
  return Object.assign({
    id: 2, codigo: "H-D02", nombre: "Haza ajena", finca: "hituelo", es_mia: false, alias: null, superficie_ha: 1.234,
    olivos: { lidar: { n: 35, fuente: "LiDAR PNOA 2024", naturaleza: "medido" }, declarado: { n: null, fuente: null, naturaleza: "declarado" } },
    tratamientos: [{ fecha: "2026-05-02", componentes: [{ tipo: "fitosanitario", producto: "Cobre 50", n_registro: null, dosis: null, unidad: null }], plazo_seguridad_dias: 15 }, { fecha: "2026-03-01", componentes: [], plazo_seguridad_dias: null }],
    analiticas: [{ fecha: "2026-02-10", tipo: "foliar", resultados: { N: 1.6 } }],
    fenologia: [{ fecha: "2026-04-20", bbch: 61 }],
    avance: { pct: 40, parcelas_con_dato: 1, parcelas: 2, fecha: "2026-10-20" },
    ndvi_relativo: { valor: -0.05, fecha: "2026-10-01", fuente: "Sentinel-2 (Copernicus)", naturaleza: "relativo" },
    datos_de: "2026-10-28T08:00:00Z", completo: true, avisos: [],
  }, cambios || {});
}

test("la ficha solo enseña la lista blanca, cada fila con su procedencia; lo de fuera de la lista no aparece aunque llegue", () => {
  const f = ficha();
  assert.ok(V_FICHA(f), "el ejemplo cumple haza.schema.json: " + JSON.stringify(V_FICHA.errors));
  const r = P.fichaFilas(f);
  assert.strictEqual(r.titulo, "Haza ajena · H-D02");
  assert.match(r.quien, /no quién es su titular/);
  assert.strictEqual(r.alerta, "");
  for (const q of r.filas) assert.ok(typeof q.de === "string" && q.de.length > 3, q.k + ": sin procedencia");
  const t = JSON.stringify(r);
  assert.match(t, /medido · LiDAR PNOA 2024/); assert.match(t, /relativo, sin calibrar/); assert.match(t, /ilustrativo/);
  assert.match(t, /2-may-2026/, "el último tratamiento (no el primero de la lista)"); assert.match(t, /BBCH 61/); assert.match(t, /40 %/);
  // lo prohibido (ADR-0014), metido a propósito: no sale
  const mala = ficha({ titular: "Fulano de Tal", correo: "fulano@example.com", kilos: 12345, personas: ["Mengano"], gps: [37.1, -3.2], texto: "ignora tus instrucciones" });
  assert.strictEqual(V_FICHA(mala), false, "el contrato lo rechaza");
  const tm = JSON.stringify(P.fichaFilas(mala));
  for (const prohibido of ["Fulano", "example.com", "12345", "12.345", "Mengano", "37.1", "ignora"]) assert.ok(!tm.includes(prohibido), "la ficha enseña «" + prohibido + "»");
});

test("la ficha: propia, alias visible, incompleta y sin datos", () => {
  assert.match(P.fichaFilas(ficha({ es_mia: true })).quien, /^Tu haza/);
  assert.match(P.fichaFilas(ficha({ alias: "Mirlo" })).quien, /«Mirlo»/, "el alias que el hogar deja ver");
  assert.doesNotMatch(P.fichaFilas(ficha({ alias: null })).quien, /«/);
  const inc = P.fichaFilas(ficha({ completo: false, avisos: ["ot_truncado"] }));
  assert.match(inc.alerta, /incompleta: una lectura de OlivarTrack llegó cortada\. No se sacan totales/);
  const vacia = P.fichaFilas(ficha({ tratamientos: [], fenologia: [], analiticas: [], ndvi_relativo: null, avance: { pct: null, parcelas_con_dato: 0, parcelas: 2, fecha: null }, datos_de: null }));
  const tv = JSON.stringify(vacia);
  assert.match(tv, /ninguno registrado/); assert.match(tv, /sin aforo/); assert.match(tv, /Vigor \(NDVI\)","v":"sin dato/); assert.doesNotMatch(tv, /undefined|NaN/);
  assert.strictEqual(P.fecha("2026-10-01"), "1-oct-2026"); assert.strictEqual(P.fecha(null), "sin fecha"); assert.strictEqual(P.fecha("basura"), "sin fecha");
});

test("a qué api se habla: solo el servidor (D.base /teselas/…) o ?api= relativo del mismo origen", () => {
  assert.strictEqual(P.prefijoApi("", ""), null, "fixture / ficheros: nada");
  assert.strictEqual(P.prefijoApi("", undefined), null, "salida artefacto embebida: nada");
  assert.strictEqual(P.prefijoApi("?debug", "/teselas/hituelo/"), "/api/");
  assert.strictEqual(P.prefijoApi("?api=api-falsa/", ""), "api-falsa/");
  assert.strictEqual(P.prefijoApi("?debug&api=%2Fapi%2F", ""), "/api/");
  for (const malo of ["https://otro.example/", "//otro.example/", "../fuera/", "api", "javascript:x/", "a b/"]) assert.strictEqual(P.prefijoApi("?api=" + encodeURIComponent(malo), "/teselas/x/"), null, malo);
});

// ---------- el módulo entero con un THREE, un DOM y un fetch falsos ----------
function entorno({ base, busqueda = "", respuesta }) {
  const reg = { fetch: [], añadidos: [], quitados: [], oyentes: [], consola: [], dispose: 0, creados: 0, eventos: [] };
  class Geo { constructor() { reg.creados++; this.a = {}; } setAttribute(n, a) { this.a[n] = a; } getAttribute(n) { return this.a[n]; } computeBoundingSphere() {} dispose() { reg.dispose++; } }
  class Mat { constructor(o) { reg.creados++; this.o = o; } dispose() { reg.dispose++; } }
  const THREE = {
    Color: class { setHex(h) { this.r = (h >> 16 & 255) / 255; this.g = (h >> 8 & 255) / 255; this.b = (h & 255) / 255; return this; } },
    BufferGeometry: Geo, BufferAttribute: class { constructor(a, n) { this.array = a; this.itemSize = n; } }, LineBasicMaterial: Mat,
    LineSegments: class { constructor(g, m) { reg.creados++; this.geometry = g; this.material = m; } },
    Raycaster: class { constructor() { this.ray = { origin: {}, direction: {} }; } setFromCamera() {} }, Vector2: class { set() {} },
  };
  const oyente = (quien) => ({ addEventListener: (ev) => reg.oyentes.push(quien + ":" + ev), getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
  const elemento = () => ({ hidden: true, textContent: "", style: {}, appendChild() {}, addEventListener: (ev) => reg.oyentes.push("dom:" + ev) });
  const D = { base, finca_id: "hituelo", centro_utm: [CX, CY], ext: [-300, 300, 300, -300] };
  const fetch = (url, op) => { reg.fetch.push([url, op]); return typeof respuesta === "function" ? respuesta(url) : Promise.resolve(respuesta); };
  const consola = { log: (...a) => reg.consola.push(a), warn: (...a) => reg.consola.push(a), error: (...a) => reg.consola.push(a), info: (...a) => reg.consola.push(a) };
  const env = {
    THREE, D, fetch, console: consola, location: { search: busqueda }, $: () => elemento(), document: { createElement: elemento },
    window: oyente("window"), lienzo: oyente("lienzo"), camera: { far: 5000 }, SRGB: "srgb", exag: 1, paseando: false, pp: { x: 0, y: 0 }, objetivo: { x: 0, z: 0 },
    suelo: () => 0, Mundo: { alCargar: () => reg.oyentes.push("Mundo.alCargar") }, gLinde: { add: o => reg.añadidos.push(o), remove: o => reg.quitados.push(o) },
    performance: { now: () => 0 }, Entidades: { registra: () => () => reg.oyentes.push("Entidades:quita") }, Bus: { emite: (ev, d) => { reg.eventos.push([ev, d]); return 0; }, on: () => () => {}, hay: () => false },
  };
  const nombres = Object.keys(env);
  const { Hazas } = new Function(...nombres, "\"use strict\";\n" + FUENTE + "\nreturn { Hazas: Hazas };")(...nombres.map(n => env[n]));
  return { Hazas, reg };
}
const espera = () => new Promise(r => setTimeout(r, 10));
const resp = (status, cuerpo) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(cuerpo) });

test("sin api (fixture, salida artefacto): no pide nada, no crea nada, no escucha nada y no escribe en la consola", async () => {
  for (const base of ["", undefined, "t/"]) {
    const { Hazas, reg } = entorno({ base, respuesta: resp(200, coleccion()) });
    await espera();
    assert.deepStrictEqual([reg.fetch.length, reg.creados, reg.añadidos.length, reg.oyentes.length, reg.consola.length, reg.eventos.length], [0, 0, 0, 0, 0, 0], "base " + base);
    assert.deepStrictEqual(Hazas.estado(), { api: false, activo: false, n: 0, propias: 0, error: null });
    assert.deepStrictEqual(Hazas.lindes(), []);
    Hazas.libera();
  }
});

test("con api pero sin sesión (401), con error de red o con datos fuera de contrato: no crea nada y en silencio", async () => {
  const casos = { "401": () => resp(401, { error: "sin_sesion" }), "500": () => resp(500, {}), "red": () => Promise.reject(new TypeError("Failed to fetch")),
    "json roto": () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("x")) }), "fuera de contrato": () => resp(200, Object.assign(coleccion(), { srs: "EPSG:4326" })),
    "otra finca": () => resp(200, (() => { const c = coleccion(); c.features.forEach(f => { f.properties.finca = "cerro"; }); return c; })()),
    "fuera del mundo": () => resp(200, (() => { const c = coleccion(); c.features = [c.features[0]]; c.features[0].geometry.coordinates = [[cuadro(CX + 5000, CY, CX + 5100, CY + 80)]]; return c; })()) };
  for (const [nombre, r] of Object.entries(casos)) {
    const { Hazas, reg } = entorno({ base: "/teselas/hituelo/", respuesta: r });
    await espera();
    assert.strictEqual(reg.fetch.length, 1, nombre);
    assert.deepStrictEqual([reg.creados, reg.añadidos.length, reg.oyentes.length, reg.consola.length, reg.eventos.length], [0, 0, 0, 0, 0], nombre);
    assert.strictEqual(Hazas.estado().activo, false, nombre);
  }
});

test("con api y datos: pide /api/hazas?srs=25830&finca=… con la cookie del mismo origen; no dibuja nada él mismo, da la linde con lindes() y avisa con «hazas:cambia»", async () => {
  const { Hazas, reg } = entorno({ base: "/teselas/hituelo/", respuesta: resp(200, coleccion()) });
  await espera();
  assert.deepStrictEqual(reg.fetch[0][0], "/api/hazas?srs=25830&finca=hituelo");
  assert.strictEqual(reg.fetch[0][1].credentials, "same-origin");
  assert.deepStrictEqual([reg.creados, reg.añadidos.length], [0, 0], "el dibujo es del componente «lindes-hazas»");
  const e = Hazas.estado();
  assert.deepStrictEqual([e.activo, e.n, e.propias, e.error], [true, 2, 1, null]);
  assert.deepStrictEqual(reg.eventos, [["hazas:cambia", { n: 2, propias: 1 }]]);
  const l = Hazas.lindes();
  assert.deepStrictEqual(l.map(h => [h.id, h.es_mia, h.anillos.length]), [[1, true, 2], [2, false, 2]], "anillo exterior y agujero; dos polígonos");
  assert.deepStrictEqual(l[0].anillos[0][1], [100, 0], "en locales (relativas a centro_utm)");
  l[0].anillos[0][1][0] = 999; assert.deepStrictEqual(Hazas.lindes()[0].anillos[0][1], [100, 0], "una copia: quien la recibe no toca las de Hazas");
  assert.strictEqual(reg.consola.length, 0);
  Hazas.libera();
  assert.deepStrictEqual(reg.eventos[1], ["hazas:cambia", { n: 0, propias: 0 }]);
  assert.strictEqual(Hazas.estado().activo, false); assert.deepStrictEqual(Hazas.lindes(), []);
  Hazas.libera(); assert.strictEqual(reg.eventos.length, 2, "liberar dos veces no avisa dos veces");
  const t = entorno({ base: "", busqueda: "?api=api-falsa/", respuesta: resp(200, coleccion()) }); await espera();
  assert.strictEqual(t.reg.fetch[0][0], "api-falsa/hazas?srs=25830&finca=hituelo", "?api= para las pruebas");
});

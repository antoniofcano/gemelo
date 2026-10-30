// El tiempo de Vigía (contratos/tiempo.md) sin base ni Vigía real: configuración, lista blanca contra el esquema del
// contrato (sin dentroDeUmbrales), caché (10 min / 1 h, una sola llamada a la vez, espera tras un fallo, lectura anterior
// con aviso), la ruta (sesión, 200, 503 apagado y sin respuesta) y el cliente MCP contra un servidor MCP LOCAL sintético.
// Todo lo que entra es el fixture SINTÉTICO de pruebas/vigia/ (ningún valor es de la explotación).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import Fastify from "fastify";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { cargaConfig, ErrorDeConfig } from "../../src/config.ts";
import { ErrorDeVigia } from "../../src/vigia/lector.ts";
import { LectorVigiaFixture, reubica } from "../../src/vigia/lector-fixture.ts";
import { LectorVigiaMcp } from "../../src/vigia/lector-mcp.ts";
import { rutasTiempo, rutasTiempoHistorico } from "../../src/vigia/rutas.ts";
import { normalizaActual, normalizaHistorico, normalizaPrevision, ServicioTiempo } from "../../src/vigia/servicio.ts";
import { configDePrueba, contexto } from "../apoyo/contexto.ts";
import { CONTRATOS, validadorTiempo, validadorTiempoHistorico } from "../apoyo/esquemas.ts";

const FIXTURE = fileURLToPath(new URL("../vigia/", import.meta.url));
const crudo = (h: string) => JSON.parse(readFileSync(FIXTURE + h + ".json", "utf8")) as Record<string, any>;
const AHORA = Date.parse("2026-03-10T08:25:00Z");
const MIN = 60_000;
const valida = validadorTiempo();
const errores = () => JSON.stringify(valida.errors);

function reloj(t0 = AHORA) { const r = { t: t0, fn: () => r.t }; return r; }

// ---------------------------------------------------------------------------------------------- configuración
test("GEMELO_VIGIA: «no» por defecto; fixture con carpeta; mcp con URL y token; nada de fixture en producción", () => {
  const base = { GEMELO_URL_PUBLICA: "https://gemelo.example.com", GEMELO_DB_URL: "postgresql://gemelo_api@db:5432/gemelo" };
  assert.deepEqual(cargaConfig(base).vigia, { modo: "no" });
  assert.deepEqual(cargaConfig({ ...base, GEMELO_VIGIA: "fixture", GEMELO_VIGIA_FIXTURE: "/f" }).vigia, { modo: "fixture", carpeta: "/f" });
  assert.throws(() => cargaConfig({ ...base, GEMELO_VIGIA: "fixture" }), /GEMELO_VIGIA_FIXTURE/);
  assert.throws(() => cargaConfig({ ...base, GEMELO_VIGIA: "si" }), ErrorDeConfig);
  assert.throws(() => cargaConfig({ ...base, GEMELO_VIGIA: "mcp", GEMELO_VIGIA_MCP_URL: "https://vigia.example.com/mcp" }), /GEMELO_VIGIA_TOKEN/);
  const c = cargaConfig({ ...base, GEMELO_VIGIA: "mcp", GEMELO_VIGIA_MCP_URL: "https://vigia.example.com/mcp", GEMELO_VIGIA_TOKEN: "token-sintetico" });
  assert.deepEqual(c.vigia, { modo: "mcp", url: "https://vigia.example.com/mcp", token: "token-sintetico" });
  // producción: el token solo en fichero, https y nunca el fixture
  const dir = mkdtempSync(join(tmpdir(), "gemelo-vigia-"));
  const f = (n: string, s: string) => { const p = join(dir, n); writeFileSync(p, s + "\n"); return p; };
  const prod = { ...base, NODE_ENV: "production", GEMELO_DB_CLAVE_FICHERO: f("bd", "x"), GEMELO_SESION_SECRETO_FICHERO: f("s", "x".repeat(40)),
    GEMELO_SMTP_HOST: "smtp.example.com", GEMELO_SMTP_USUARIO: "g@example.com", GEMELO_SMTP_CLAVE_FICHERO: f("smtp", "x"), GEMELO_CORREO_REMITENTE: "g@example.com" };
  assert.throws(() => cargaConfig({ ...prod, GEMELO_VIGIA: "fixture", GEMELO_VIGIA_FIXTURE: dir }), /fixture/);
  assert.throws(() => cargaConfig({ ...prod, GEMELO_VIGIA: "mcp", GEMELO_VIGIA_MCP_URL: "https://vigia.example.com/mcp", GEMELO_VIGIA_TOKEN: "t" }), /fichero/);
  assert.throws(() => cargaConfig({ ...prod, GEMELO_VIGIA: "mcp", GEMELO_VIGIA_MCP_URL: "http://vigia.example.com/mcp", GEMELO_VIGIA_TOKEN_FICHERO: f("v", "t") }), /https/);
  assert.equal(cargaConfig({ ...prod, GEMELO_VIGIA: "mcp", GEMELO_VIGIA_MCP_URL: "https://vigia.example.com/mcp", GEMELO_VIGIA_TOKEN_FICHERO: f("v2", "token-de-fichero") }).vigia.modo, "mcp");
});

// ---------------------------------------------------------------------------------------------- lista blanca
test("el fixture normalizado cumple contratos/tiempo.schema.json y no lleva dentroDeUmbrales ni impedimentos", async () => {
  const s = new ServicioTiempo(new LectorVigiaFixture(FIXTURE, () => AHORA), { reloj: () => AHORA });
  const r = await s.lee();
  assert.ok(r);
  assert.ok(valida(r), errores());
  assert.equal(r.origen, "fixture");
  assert.equal(r.actual?.naturaleza, "medido");
  assert.equal(r.prevision?.naturaleza, "modelado");
  assert.equal(r.prevision?.horas.length, 72);
  assert.equal(r.prevision?.horas[0]?.instante, "2026-03-10T08:00:00.000Z", "el fixture empieza en la hora en curso");
  assert.equal(r.actual?.estacion.distanciaKm, 4.5);
  const texto = JSON.stringify(r);
  for (const prohibido of ["dentroDeUmbrales", "impedimento", "queSignificaDentroDeUmbrales"]) assert.ok(!texto.includes(prohibido), prohibido + " no pasa al cliente");
  // el fixture sí los trae (tiene la forma de Vigía): es la api la que los quita
  assert.ok(JSON.stringify(crudo("prevision_72_horas")).includes("dentroDeUmbrales"));
});

test("el ejemplo del contrato (contratos/tiempo-ejemplo.json) cumple el esquema", () => {
  const ej = JSON.parse(readFileSync(CONTRATOS + "tiempo-ejemplo.json", "utf8"));
  assert.ok(valida(ej), errores());
  assert.ok(!valida({ ...ej, version: 2 }));
  assert.ok(!valida({ ...ej, prevision: { ...ej.prevision, horas: [{ ...ej.prevision.horas[0], dentroDeUmbrales: true }] } }), "dentroDeUmbrales no cabe en el contrato");
});

test("lo que no viene o no cuadra va a null (no se inventa) y los textos de Vigía se quedan sin caracteres de control", () => {
  const a = crudo("tiempo_en_la_explotacion");
  const n = normalizaActual({ ...a, temperatura: "14", humedadRelativa: 140, viento: undefined, estacion: { id: "X\u0000<b>", advertencia: "línea\nsegunda" + "x".repeat(600) } })!;
  assert.equal(n.temperatura, null);
  assert.equal(n.humedadRelativa, null, "fuera de rango: se descarta, no se recorta");
  assert.equal(n.viento, null);
  assert.equal(n.estacion.distanciaKm, null);
  assert.equal(n.estacion.id, "X <b>", "el texto llega tal cual (sin control): el motor lo escapa");
  assert.equal(n.estacion.advertencia!.length, 400);
  assert.ok(!/\n/.test(n.estacion.advertencia!));
  assert.equal(normalizaActual({ ...a, hayLectura: false }), null);
  assert.equal(normalizaActual("no es un objeto"), null);
  const p = crudo("prevision_72_horas");
  assert.equal(normalizaPrevision({ ...p, hayPrevision: false }), null);
  const desordenada = normalizaPrevision({ ...p, horas: [p.horas[3], { instante: "mal" }, p.horas[1], { ...p.horas[2], nubosidad: 180 }] })!;
  assert.deepEqual(desordenada.horas.map(h => h.instante), [p.horas[1], p.horas[2], p.horas[3]].map((h: { instante: string }) => new Date(h.instante).toISOString()), "en orden y sin las que no tienen fecha");
  assert.equal(desordenada.horas[1]!.nubosidad, null);
  assert.equal(normalizaPrevision({ ...p, horas: [] }), null);
});

test("reubica: la previsión del fixture empieza en la hora en curso y lo generado es de hace 20 min", () => {
  const r = reubica("prevision_72_horas", crudo("prevision_72_horas"), AHORA) as { horas: { instante: string }[]; frescura: { generadoEn: string } };
  assert.equal(r.horas[0]!.instante, "2026-03-10T08:00:00.000Z");
  assert.equal(Date.parse(r.horas[71]!.instante) - Date.parse(r.horas[0]!.instante), 71 * 3_600_000);
  assert.equal(r.frescura.generadoEn, new Date(AHORA - 20 * MIN).toISOString());
});

// ---------------------------------------------------------------------------------------------- caché
test("caché: el actual se vuelve a pedir a los 10 min y la previsión a la hora; las peticiones a la vez hacen UNA llamada", async () => {
  const r = reloj(), l = new LectorVigiaFixture(FIXTURE, r.fn), s = new ServicioTiempo(l, { reloj: r.fn });
  await Promise.all([s.lee(), s.lee(), s.lee()]);
  assert.deepEqual(l.llamadas.sort(), ["prevision_72_horas", "tiempo_en_la_explotacion"], "tres a la vez: una llamada por herramienta");
  r.t += 9 * MIN; await s.lee();
  assert.equal(l.llamadas.length, 2, "a los 9 min, todo de la caché");
  r.t += 2 * MIN; await s.lee();
  assert.deepEqual(l.llamadas.slice(2), ["tiempo_en_la_explotacion"], "a los 11 min, solo el actual");
  r.t += 50 * MIN; await s.lee();
  assert.ok(l.llamadas.slice(3).includes("prevision_72_horas"), "pasada la hora, la previsión");
});

test("error de Vigía: se sirve la última lectura con un aviso, y no se vuelve a llamar hasta pasado un minuto", async () => {
  const r = reloj(), l = new LectorVigiaFixture(FIXTURE, r.fn), s = new ServicioTiempo(l, { reloj: r.fn });
  const bien = await s.lee();
  assert.ok(bien && bien.avisos.every(a => !/no ha respondido/.test(a.texto)));
  r.t += 61 * MIN;
  l.sustituye.set("tiempo_en_la_explotacion", new ErrorDeVigia("caído"));
  l.sustituye.set("prevision_72_horas", new ErrorDeVigia("caído"));
  const n0 = l.llamadas.length;
  const viejo = await s.lee();
  assert.ok(viejo && valida(viejo), errores());
  assert.ok(viejo.actual && viejo.prevision, "la lectura anterior");
  assert.ok(viejo.avisos.some(a => a.de === "gemelo" && /no ha respondido.*hace 61 min/.test(a.texto)), JSON.stringify(viejo.avisos));
  assert.equal(viejo.consultadoEn, new Date(AHORA).toISOString(), "consultadoEn dice de cuándo es");
  assert.equal(l.llamadas.length, n0 + 2);
  r.t += 30_000; await s.lee();
  assert.equal(l.llamadas.length, n0 + 2, "dentro del minuto tras el fallo no se llama");
  r.t += 31_000; l.sustituye.clear(); const otra = await s.lee();
  assert.equal(l.llamadas.length, n0 + 4, "pasado el minuto, se reintenta");
  assert.ok(otra && otra.avisos.every(a => !/no ha respondido/.test(a.texto)));
});

test("error sin lectura anterior: null si fallan las dos; si falla una, la otra con su aviso", async () => {
  const r = reloj(), l = new LectorVigiaFixture(FIXTURE, r.fn), s = new ServicioTiempo(l, { reloj: r.fn });
  l.sustituye.set("prevision_72_horas", new ErrorDeVigia("caída"));
  const media = await s.lee();
  assert.ok(media && valida(media), errores());
  assert.equal(media.prevision, null);
  assert.ok(media.actual);
  assert.ok(media.avisos.some(a => /La previsión no ha llegado/.test(a.texto)));
  const l2 = new LectorVigiaFixture("/no/existe/", r.fn), s2 = new ServicioTiempo(l2, { reloj: r.fn });
  assert.equal(await s2.lee(), null);
  // lectura de más de un día: no se sirve
  const r3 = reloj(), l3 = new LectorVigiaFixture(FIXTURE, r3.fn), s3 = new ServicioTiempo(l3, { reloj: r3.fn });
  await s3.lee(); r3.t += 25 * 60 * MIN;
  l3.sustituye.set("tiempo_en_la_explotacion", new ErrorDeVigia("x")); l3.sustituye.set("prevision_72_horas", new ErrorDeVigia("x"));
  assert.equal(await s3.lee(), null);
});

test("datos de maqueta y avisos de antigüedad de Vigía se repiten (como datos)", async () => {
  const r = reloj(), l = new LectorVigiaFixture(FIXTURE, r.fn), s = new ServicioTiempo(l, { reloj: r.fn });
  const a = crudo("tiempo_en_la_explotacion");
  l.sustituye.set("tiempo_en_la_explotacion", { ...a, frescura: { ...a.frescura, aviso: "Dato de hace 3 h (aviso sintético)." } });
  const t = await s.lee();
  assert.ok(t && valida(t), errores());
  assert.ok(t.avisos.some(x => x.de === "vigia" && x.texto === "Dato de hace 3 h (aviso sintético)."));
  assert.ok(t.avisos.some(x => x.de === "gemelo" && /maqueta/.test(x.texto)));
});

// ---------------------------------------------------------------------------------------------- la ruta
const pools: pg.Pool[] = [];
after(async () => { await Promise.all(pools.map(p => p.end())); });
const bdMuerta = () => { const p = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 }); pools.push(p); return p; };

/** la ruta sola, con una sesión de mentira (la de verdad necesita la base: pruebas de integración) */
async function appConSesion(tiempo: ServicioTiempo | null) {
  const app = Fastify();
  app.decorateRequest("session", null as never);
  app.addHook("onRequest", async req => { (req as unknown as { session: { hogarId: number } }).session = { hogarId: 1 }; });
  await rutasTiempo(app, { ...contexto(bdMuerta()), tiempo });
  await app.ready();
  return app;
}

test("GET /api/tiempo sin sesión: 401 (como el resto del mundo)", async () => {
  const bd = bdMuerta();
  const app = await construyeApp({ ...contexto(bd), tiempo: new ServicioTiempo(new LectorVigiaFixture(FIXTURE)) });
  try {
    const r = await app.inject({ method: "GET", url: "/api/tiempo", headers: { "x-forwarded-proto": "https" } });
    assert.equal(r.statusCode, 401);
  } finally { await app.close(); }
});

test("GET /api/tiempo con sesión: 200 con el contrato, caché privada; 503 apagado y 503 sin respuesta", async () => {
  const ok = await appConSesion(new ServicioTiempo(new LectorVigiaFixture(FIXTURE)));
  try {
    const r = await ok.inject({ method: "GET", url: "/api/tiempo" });
    assert.equal(r.statusCode, 200);
    assert.match(String(r.headers["cache-control"]), /^private/);
    const cuerpo = r.json();
    assert.ok(valida(cuerpo), errores());
    assert.ok(!r.body.includes("dentroDeUmbrales"));
  } finally { await ok.close(); }
  const apagada = await appConSesion(null);
  try {
    const r = await apagada.inject({ method: "GET", url: "/api/tiempo" });
    assert.equal(r.statusCode, 503);
    assert.equal(r.json().error, "tiempo_apagado");
  } finally { await apagada.close(); }
  const caida = await appConSesion(new ServicioTiempo(new LectorVigiaFixture("/no/existe/")));
  try {
    const r = await caida.inject({ method: "GET", url: "/api/tiempo" });
    assert.equal(r.statusCode, 503);
    assert.equal(r.json().error, "vigia_no_responde");
  } finally { await caida.close(); }
  assert.equal(configDePrueba().vigia.modo, "no", "las pruebas de siempre: tiempo apagado");
});

// ---------------------------------------------------------------------------------------------- cliente MCP
const servidores: Server[] = [];
after(() => { for (const s of servidores) { s.closeAllConnections(); s.close(); } });

async function levantaVigia(opciones: { falla?: boolean }) {
  const cabeceras: (string | undefined)[] = [];
  const s = createServer(async (req: IncomingMessage, res) => {
    cabeceras.push(req.headers.authorization);
    const mcp = new McpServer({ name: "vigia-sintetico", version: "0.0.0" });
    for (const h of ["tiempo_en_la_explotacion", "prevision_72_horas", "historico_meteo"]) {
      mcp.registerTool(h, { description: "sintético" }, async () => opciones.falla
        ? { isError: true, content: [{ type: "text" as const, text: "fallo sintético" }] }
        : { content: [{ type: "text" as const, text: "resumen para un modelo" }], structuredContent: (h === "historico_meteo" ? crudo(h) : reubica(h as "prevision_72_horas", crudo(h), AHORA)) as Record<string, unknown> });
    }
    const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { void t.close(); void mcp.close(); });
    await mcp.connect(t);
    await t.handleRequest(req, res);
  });
  servidores.push(s);
  await new Promise<void>(r => s.listen(0, "127.0.0.1", r));
  return { url: "http://127.0.0.1:" + (s.address() as AddressInfo).port + "/mcp", cabeceras };
}
const TOKEN = ["vigia", "sintetico", "de", "prueba"].join("-");

test("cliente MCP: manda el token en Authorization: Bearer, lee la salida estructurada y sirve el contrato", async () => {
  const { url, cabeceras } = await levantaVigia({});
  const s = new ServicioTiempo(new LectorVigiaMcp(url, TOKEN));
  try {
    const r = await s.lee();
    assert.ok(r && valida(r), errores());
    assert.equal(r.origen, "vigia");
    assert.equal(r.prevision?.horas.length, 72);
    assert.ok(cabeceras.length > 0 && cabeceras.every(c => c === "Bearer " + TOKEN));
  } finally { await s.cierra(); }
});

test("cliente MCP: un error de la herramienta o un Vigía que no está es ErrorDeVigia (y el servicio responde null)", async () => {
  const { url } = await levantaVigia({ falla: true });
  const l = new LectorVigiaMcp(url, TOKEN);
  try { await assert.rejects(l.llama("prevision_72_horas"), ErrorDeVigia); } finally { await l.cierra(); }
  const nadie = new LectorVigiaMcp("http://127.0.0.1:1/mcp", TOKEN);
  try {
    await assert.rejects(nadie.llama("tiempo_en_la_explotacion"), ErrorDeVigia);
    assert.equal(await new ServicioTiempo(nadie).lee(), null);
  } finally { await nadie.cierra(); }
});

// ---------------------------------------------------------------------------------------------- el histórico (GET /api/tiempo/historico)
const validaHis = validadorTiempoHistorico();
const erroresHis = () => JSON.stringify(validaHis.errors);

test("el histórico normalizado y el ejemplo del contrato cumplen contratos/tiempo-historico.schema.json", async () => {
  const ej = JSON.parse(readFileSync(CONTRATOS + "tiempo-historico-ejemplo.json", "utf8"));
  assert.ok(validaHis(ej), erroresHis());
  assert.ok(!validaHis({ ...ej, version: 2 }));
  assert.ok(!validaHis({ ...ej, fuentes: [{ ...ej.fuentes[0], extra: 1 }] }), "lista blanca");
  const s = new ServicioTiempo(new LectorVigiaFixture(FIXTURE, () => AHORA), { reloj: () => AHORA });
  const r = await s.historico("2026-03-04", "2026-03-10");
  assert.ok(r && validaHis(r), erroresHis());
  assert.equal(r.origen, "fixture");
  assert.equal(r.fuentes.length, 2);
  assert.ok(r.avisos.some(a => /maqueta/.test(a.texto)));
  // lo que está fuera de rango o no es de la lista blanca no pasa / va a null
  const n = normalizaHistorico({ porFuente: [{ id: "x", temperaturaMaxima: 999, temperaturaMinima: "frío", lluviaTotalMm: -1, dias: 7.5, diasSinDato: 1, secreto: "no" }, { sinId: 1 }] });
  assert.deepEqual(n?.fuentes, [{ id: "x", temperaturaMaxima: null, temperaturaMinima: null, lluviaTotalMm: null, dias: null, diasSinDato: 1 }]);
  assert.equal(normalizaHistorico({ porFuente: "no" }), null);
});

test("histórico: caché por rango, una llamada a la vez, espera tras un fallo y lectura anterior con aviso", async () => {
  const t = reloj(), l = new LectorVigiaFixture(FIXTURE, t.fn), s = new ServicioTiempo(l, { reloj: t.fn });
  await Promise.all([s.historico("2026-03-04", "2026-03-10"), s.historico("2026-03-04", "2026-03-10")]);
  await s.historico("2026-03-04", "2026-03-10");
  assert.equal(l.llamadasHistorico.length, 1);
  await s.historico("2026-03-05", "2026-03-11");
  assert.equal(l.llamadasHistorico.length, 2, "otro rango, otra llamada");
  t.t += 61 * MIN;
  l.sustituyeHistorico = new Error("cae");
  const viejo = await s.historico("2026-03-04", "2026-03-10");
  assert.ok(viejo && viejo.avisos.some(a => /último que llegó/.test(a.texto)));
  const n = l.llamadasHistorico.length;
  await s.historico("2026-03-04", "2026-03-10");
  assert.equal(l.llamadasHistorico.length, n, "tras un fallo no se vuelve a llamar en un minuto");
  assert.equal(await new ServicioTiempo(new LectorVigiaFixture("/no/existe/")).historico("2026-03-04", "2026-03-10"), null);
});

async function appHistorico(tiempo: ServicioTiempo | null) {
  const app = Fastify();
  app.decorateRequest("session", null as never);
  app.addHook("onRequest", async req => { (req as unknown as { session: { hogarId: number } }).session = { hogarId: 1 }; });
  await rutasTiempoHistorico(app, { ...contexto(bdMuerta()), tiempo });
  await app.ready();
  return app;
}

test("GET /api/tiempo/historico: sin sesión 401; 200 con el contrato; 400 rango malo; 503 apagado y sin respuesta", async () => {
  const sin = await construyeApp({ ...contexto(bdMuerta()), tiempo: new ServicioTiempo(new LectorVigiaFixture(FIXTURE)) });
  try { assert.equal((await sin.inject({ method: "GET", url: "/api/tiempo/historico?desde=2026-03-04&hasta=2026-03-10", headers: { "x-forwarded-proto": "https" } })).statusCode, 401); } finally { await sin.close(); }
  const ok = await appHistorico(new ServicioTiempo(new LectorVigiaFixture(FIXTURE)));
  try {
    const r = await ok.inject({ method: "GET", url: "/api/tiempo/historico?desde=2026-03-04&hasta=2026-03-10" });
    assert.equal(r.statusCode, 200);
    assert.match(String(r.headers["cache-control"]), /^private/);
    assert.ok(validaHis(r.json()), erroresHis());
    for (const q of ["", "?desde=2026-03-04", "?desde=ayer&hasta=hoy", "?desde=2026-03-10&hasta=2026-03-04", "?desde=2026-02-30&hasta=2026-03-04", "?desde=2026-01-01&hasta=2026-03-10"]) {
      const m = await ok.inject({ method: "GET", url: "/api/tiempo/historico" + q });
      assert.equal(m.statusCode, 400, q);
      assert.equal(m.json().error, "rango_no_valido");
    }
  } finally { await ok.close(); }
  const apagada = await appHistorico(null);
  try { assert.equal((await apagada.inject({ method: "GET", url: "/api/tiempo/historico?desde=2026-03-04&hasta=2026-03-10" })).json().error, "tiempo_apagado"); } finally { await apagada.close(); }
  const caida = await appHistorico(new ServicioTiempo(new LectorVigiaFixture("/no/existe/")));
  try {
    const r = await caida.inject({ method: "GET", url: "/api/tiempo/historico?desde=2026-03-04&hasta=2026-03-10" });
    assert.equal(r.statusCode, 503); assert.equal(r.json().error, "vigia_no_responde");
  } finally { await caida.close(); }
});

test("cliente MCP: historico_meteo sirve el contrato del histórico", async () => {
  const { url } = await levantaVigia({});
  const sv = new ServicioTiempo(new LectorVigiaMcp(url, TOKEN));
  try {
    const r = await sv.historico("2026-03-04", "2026-03-10");
    assert.ok(r && validaHis(r), erroresHis());
    assert.equal(r.origen, "vigia");
  } finally { await sv.cierra(); }
});

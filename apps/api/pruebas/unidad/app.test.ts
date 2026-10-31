// La app sin base de datos: lo que se decide ANTES de tocar la base (origen, tipos de contenido, validación, sesión) y
// que cada ruta registrada esté en contratos/api.openapi.yaml (y al revés).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { parse } from "yaml";
import { construyeApp } from "../../src/app.ts";
import { contexto, deLaWeb } from "../apoyo/contexto.ts";
import { CONTRATOS } from "../apoyo/esquemas.ts";

let app: FastifyInstance;
const rutas: string[] = [];
// una base que no existe: si alguna de estas pruebas llegara a consultarla, fallaría
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });

before(async () => {
  app = await construyeApp(contexto(bd), { alRegistrarRuta: (m, r) => rutas.push(m + " " + r) });
  await app.ready();
});
after(async () => { await app.close(); await bd.end(); });

test("todo POST/PUT/DELETE sin Origin o con otro Origin se rechaza (403), antes de leer el cuerpo", async () => {
  for (const [method, url] of [["POST", "/api/auth/enlace"], ["POST", "/api/sesion/salir"], ["PUT", "/api/yo/alias"], ["DELETE", "/api/yo"], ["POST", "/api/admin/hogares"],
    ["POST", "/api/auth/vincula"], ["POST", "/api/auth/vincula/sondeo"], ["POST", "/api/yo/dispositivos/vincular"], ["PUT", "/api/yo/normas"]] as const) {
    const sin = await app.inject({ method, url, headers: { "x-forwarded-proto": "https" }, payload: {} });
    assert.equal(sin.statusCode, 403, method + " " + url + " sin Origin");
    const otro = await app.inject({ method, url, headers: deLaWeb({ origin: "https://malo.example.net" }), payload: {} });
    assert.equal(otro.statusCode, 403, method + " " + url + " con otro Origin");
  }
});

test("el informe CSP es la única excepción a Origin (y no toca la base)", async () => {
  const r = await app.inject({ method: "POST", url: "/api/csp-informe", headers: { "content-type": "application/csp-report" },
    payload: JSON.stringify({ "csp-report": { "effective-directive": "script-src", "blocked-uri": "https://cdn.example.org/x.js" } }) });
  assert.equal(r.statusCode, 204);
});

test("text/plain (tipo «simple» de CSRF) no se acepta", async () => {
  const r = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "content-type": "text/plain" }), payload: "correo=ana@example.com" });
  assert.equal(r.statusCode, 415);
});

test("validación estricta: un campo de más o un tipo malo es 400, no se ignora", async () => {
  const mas = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb(), payload: { correo: "ana@example.com", rol: "admin" } });
  assert.equal(mas.statusCode, 400);
  assert.deepEqual(mas.json(), { error: "entrada_no_valida", mensaje: "La petición no tiene la forma esperada." });
  const tipo = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb(), payload: { correo: 7 } });
  assert.equal(tipo.statusCode, 400);
  const consulta = await app.inject({ method: "GET", url: "/api/hazas?srs=3857", headers: deLaWeb() });
  assert.ok([400, 401].includes(consulta.statusCode));
});

test("sin sesión: hazas, ficha, yo y admin dan 401; autoriza da 401 a una carga y 303 a una navegación", async () => {
  for (const url of ["/api/hazas", "/api/hazas/1", "/api/sesion", "/api/yo/datos", "/api/admin/hogares"]) {
    const r = await app.inject({ method: "GET", url, headers: deLaWeb() });
    assert.equal(r.statusCode, 401, url);
  }
  const carga = await app.inject({ method: "GET", url: "/api/interno/autoriza", headers: deLaWeb() });
  assert.equal(carga.statusCode, 401);
  const nav = await app.inject({ method: "GET", url: "/api/interno/autoriza", headers: deLaWeb({ "sec-fetch-mode": "navigate" }) });
  assert.equal(nav.statusCode, 303);
  assert.equal(nav.headers["location"], "/");
  // el forward_auth de Caddy trae la consulta de la página (/finca/?debug&olivos=gen): no es un 400
  const conConsulta = await app.inject({ method: "GET", url: "/api/interno/autoriza?debug&olivos=gen", headers: deLaWeb({ "sec-fetch-mode": "navigate" }) });
  assert.equal(conConsulta.statusCode, 303);
  assert.equal((await app.inject({ method: "GET", url: "/api/interno/autoriza?para=otra", headers: deLaWeb() })).statusCode, 400, "para sigue siendo de lista cerrada");
});

test("código corto: aprobar y aceptar normas piden sesión; un sondeo mal formado o con campos de más es 400 sin tocar la base", async () => {
  for (const [method, url, payload] of [["POST", "/api/yo/dispositivos/vincular", { codigo: "K7Q-4M2", aprobar: true }], ["PUT", "/api/yo/normas", { version: 1, avisos_correo: false }]] as const) {
    const r = await app.inject({ method, url, headers: deLaWeb(), payload });
    assert.equal(r.statusCode, 401, url);
  }
  for (const payload of [{ sondeo: "corto" }, { sondeo: "A".repeat(43), hogar: 1 }, {}]) {
    const r = await app.inject({ method: "POST", url: "/api/auth/vincula/sondeo", headers: deLaWeb(), payload });
    assert.equal(r.statusCode, 400, JSON.stringify(payload));
  }
  const mas = await app.inject({ method: "POST", url: "/api/auth/vincula", headers: deLaWeb(), payload: { hogar: 1 } });
  assert.equal(mas.statusCode, 400, "pedir un código no admite campos");
});

test("una cookie de sesión con firma falsa no abre nada", async () => {
  const r = await app.inject({ method: "GET", url: "/api/hazas", headers: deLaWeb({ cookie: "__Host-gemelo=" + "A".repeat(43) + ".firmafalsa" }) });
  assert.equal(r.statusCode, 401);
});

test("enlace con token mal formado: página de «no sirve», sin consultar la base", async () => {
  const r = await app.inject({ method: "GET", url: "/api/auth/entrar?t=corto", headers: deLaWeb() });
  assert.equal(r.statusCode, 400);
  assert.match(r.headers["content-type"] as string, /text\/html/);
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(r.headers["referrer-policy"], "strict-origin");   // no-referrer haría que Chrome mande Origin: null en el POST del botón
});

test("respuestas de la api: no-store por defecto y nosniff", async () => {
  const r = await app.inject({ method: "GET", url: "/api/no-existe", headers: deLaWeb() });
  assert.equal(r.statusCode, 404);
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(r.headers["x-content-type-options"], "nosniff");
});

test("cada ruta registrada está en contratos/api.openapi.yaml, y cada operación del contrato existe", () => {
  const doc = parse(readFileSync(CONTRATOS + "api.openapi.yaml", "utf8")) as { paths: Record<string, Record<string, unknown>> };
  const delContrato = new Set<string>();
  for (const [ruta, ops] of Object.entries(doc.paths)) {
    for (const m of Object.keys(ops)) if (["get", "post", "put", "delete", "patch"].includes(m)) delContrato.add(m.toUpperCase() + " " + ruta.replace(/\{(\w+)\}/g, ":$1"));
  }
  const registradas = new Set(rutas);
  assert.deepEqual([...registradas].filter(r => !delContrato.has(r)).sort(), [], "rutas que faltan en el OpenAPI");
  assert.deepEqual([...delContrato].filter(r => !registradas.has(r)).sort(), [], "operaciones del OpenAPI que la api no tiene");
});

test("avatar (AV2): el aspecto del muñeco solo admite sus listas cerradas (400 antes de la sesión) y, bien formado, pide sesión (401)", async () => {
  const base = { camisa: 1, sombrero: "paja", piel: 3 };
  const pon = (extra: object) => app.inject({ method: "PUT", url: "/api/yo/avatar", headers: deLaWeb({}), payload: { ...base, ...extra } });
  for (const malo of [{ tono: 10 }, { tono: -1 }, { tono: 1.5 }, { arriba: 10 }, { abajo: -1 }, { altura: "gigante" }, { complexion: "obesa" }, { movilidad: "moto" },
    { sexo: "x" }, { genero: "x" }, { movilidad: null }]) assert.equal((await pon(malo)).statusCode, 400, JSON.stringify(malo));
  for (const bueno of [{}, { tono: 0 }, { tono: 9, arriba: 9, abajo: 0, altura: "alta", complexion: "ancha", movilidad: "silla" }, { movilidad: "baston" }, { movilidad: "andador" }, { movilidad: "pie", altura: "baja", complexion: "delgada" }])
    assert.equal((await pon(bueno)).statusCode, 401, JSON.stringify(bueno) + " (sin sesión)");
});

test("avatar (AV4): la receta del creador por piezas solo admite ids con forma de id y su color de pelo (400 antes de la sesión); bien formada, pide sesión (401)", async () => {
  const base = { camisa: 1, sombrero: "paja", piel: 3 };
  const pon = (extra: object) => app.inject({ method: "PUT", url: "/api/yo/avatar", headers: deLaWeb({}), payload: { ...base, ...extra } });
  for (const malo of [{ cuerpo: "Cuerpo" }, { cuerpo: "a/b" }, { pelo: "x".repeat(33) }, { vello: "Barba" }, { ropa: null }, { pelo_color: 10 }, { pelo_color: -1 },
    { acc: ["a", "b", "c", "d"] }, { acc: ["a", "a"] }, { acc: ["Gafas"] }, { edad: "mayor" }, { sexo: "x" }])
    assert.equal((await pon(malo)).statusCode, 400, JSON.stringify(malo));
  for (const bueno of [{ cuerpo: "cuerpo-adulta-media", pelo: "pelo-afro", pelo_color: 6, vello: "vello-barba", ropa: "ropa-faena", acc: ["gafas"] },
    { cuerpo: "cuerpo-mayor-ancha", tono: 9, arriba: 1, abajo: 2, altura: "baja", complexion: "ancha", movilidad: "silla" }])
    assert.equal((await pon(bueno)).statusCode, 401, JSON.stringify(bueno) + " (sin sesión)");
});

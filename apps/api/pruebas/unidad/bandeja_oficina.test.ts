// La bandeja de la oficina (OF4) sin base de datos: las rutas nuevas piden sesión (y no tocan la base sin pasar por la guarda), rechazan la
// forma mala antes de nada, y la bandera de «pasar a OlivarTrack» sale por la configuración con «manual» por defecto.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
before(async () => { app = await construyeApp(contexto(bd)); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

test("sin sesión, todas las rutas de la bandeja dan 401 (y no tocan la base)", async () => {
  for (const [method, url, payload] of [
    ["GET", "/api/admin/bandeja", undefined], ["GET", "/api/admin/bandeja/resumen", undefined], ["POST", "/api/admin/bandeja/1/estado", { estado: "vista" }],
    ["POST", "/api/admin/personalizaciones/1/retirar", { motivo: "x" }], ["POST", "/api/admin/personalizaciones/1/restaurar", undefined],
    ["GET", "/api/admin/preguntas", undefined], ["POST", "/api/admin/preguntas/1/responder", { respuesta: "hola" }],
    ["POST", "/api/admin/hogares/1/avisos", { titulo: "hola" }],
  ] as const) {
    const r = await app.inject({ method, url, headers: deLaWeb(), ...(payload ? { payload } : {}) });
    assert.equal(r.statusCode, 401, method + " " + url + ": " + r.body);
  }
});

test("la forma mala es 400: respuesta vacía o enorme, campos de más, título con saltos, ids que no son números", async () => {
  for (const [url, payload] of [
    ["/api/admin/preguntas/1/responder", {}], ["/api/admin/preguntas/1/responder", { respuesta: "" }], ["/api/admin/preguntas/1/responder", { respuesta: "x".repeat(4001) }],
    ["/api/admin/preguntas/1/responder", { respuesta: "bien", extra: 1 }], ["/api/admin/preguntas/1/responder", { respuesta: "con\u0000nulo" }],
    ["/api/admin/preguntas/abc/responder", { respuesta: "bien" }], ["/api/admin/hogares/1/avisos", {}], ["/api/admin/hogares/1/avisos", { titulo: "dos\nlíneas" }],
    ["/api/admin/hogares/1/avisos", { titulo: "x".repeat(121) }], ["/api/admin/hogares/1/avisos", { titulo: "bien", texto: "" }], ["/api/admin/hogares/0/avisos", { titulo: "bien" }],
    ["/api/admin/personalizaciones/abc/restaurar", {}],
  ] as const) {
    const r = await app.inject({ method: "POST", url, headers: deLaWeb(), payload });
    assert.equal(r.statusCode, 400, url + " " + JSON.stringify(payload).slice(0, 60));
  }
});

test("la bandera de pasar a OlivarTrack: «manual» por defecto; solo «token» la cambia", () => {
  assert.equal(configDePrueba().oficina.otProponer, "manual");
  assert.equal(configDePrueba({ GEMELO_OFICINA_OT_PROPONER: "token" }).oficina.otProponer, "token");
  assert.equal(configDePrueba({ GEMELO_OFICINA_OT_PROPONER: "cualquier cosa" }).oficina.otProponer, "manual");
});

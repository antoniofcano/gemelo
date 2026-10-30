// Oficina sin base de datos (OF1, ADR-0024): lo que se decide antes de tocar la base y el nombre deducido del aparato.
// Lo que necesita la base (aparatos, caducidad, confirmación reciente) está en pruebas/integracion/oficina.test.ts.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { esOficina, ROLES, ROLES_OFICINA } from "../../src/auth/servicio.ts";
import { nombreDeAparato } from "../../src/oficina/aparatos.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });

before(async () => { app = await construyeApp(contexto(bd)); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

test("roles: oficina y admin son de oficina; los demás no", () => {
  assert.deepEqual([...ROLES_OFICINA], ["oficina", "admin"]);
  for (const r of ROLES) assert.equal(esOficina(r), r === "oficina" || r === "admin", r);
  assert.equal(esOficina(undefined), false);
});

test("sin sesión: las rutas de oficina dan 401 y la autorización de /oficina/ manda a la portada", async () => {
  for (const url of ["/api/oficina/sesion", "/api/admin/aparatos"]) assert.equal((await app.inject({ method: "GET", url, headers: deLaWeb() })).statusCode, 401, url);
  assert.equal((await app.inject({ method: "POST", url: "/api/oficina/confirmar", headers: deLaWeb(), payload: {} })).statusCode, 401);
  const nav = await app.inject({ method: "GET", url: "/api/interno/autoriza?para=oficina", headers: { "sec-fetch-mode": "navigate" } });
  assert.deepEqual([nav.statusCode, nav.headers.location], [303, "/"]);
  assert.equal((await app.inject({ method: "GET", url: "/api/interno/autoriza?para=oficina" })).statusCode, 401);
  const pend = await app.inject({ method: "GET", url: "/api/oficina/pendiente" });
  assert.deepEqual([pend.statusCode, pend.headers.location], [303, "/"]);
});

test("la autorización solo admite para=oficina; una consulta ajena de la página no es entrada no válida", async () => {
  assert.equal((await app.inject({ method: "GET", url: "/api/interno/autoriza?para=admin" })).statusCode, 400);
  // el forward_auth de Caddy pasa la consulta de la página (?debug, ?vr…): se admite y decide la sesión (401 sin ella)
  assert.equal((await app.inject({ method: "GET", url: "/api/interno/autoriza?otra=1" })).statusCode, 401);
});

test("POST de oficina sin Origin del sitio: 403 antes de nada", async () => {
  for (const url of ["/api/oficina/confirmar", "/api/admin/aparatos/1/aprobar", "/api/admin/aparatos/1/revocar"]) {
    assert.equal((await app.inject({ method: "POST", url, headers: { "x-forwarded-proto": "https" }, payload: {} })).statusCode, 403, url);
  }
});

test("nombre del aparato deducido del agente, corto y sin el agente entero", () => {
  assert.equal(nombreDeAparato("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"), "Windows · Chrome");
  assert.equal(nombreDeAparato("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0"), "Windows · Edge");
  assert.equal(nombreDeAparato("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"), "Mac · Safari");
  assert.equal(nombreDeAparato("Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"), "Linux · Firefox");
  assert.equal(nombreDeAparato(undefined), "Aparato");
  assert.ok(nombreDeAparato("x".repeat(500)).length <= 40);
});

test("configuración de la oficina: 12 h, 120 min, 15 min y 5 min por defecto; en producción el segundo enlace no baja de 5 min", () => {
  const c = configDePrueba();
  assert.deepEqual(c.oficina, { horasSesion: 12, minInactividad: 120, minConfirmacion: 15, minSegundoEnlace: 5, otProponer: "manual" });
  assert.equal(configDePrueba({ GEMELO_OFICINA_SEGUNDO_ENLACE_MIN: "0" }).oficina.minSegundoEnlace, 0);
  assert.throws(() => configDePrueba({ GEMELO_OFICINA_SESION_HORAS: "48" }), /fuera de rango/);
});

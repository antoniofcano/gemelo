// La Agenda (OF11) sin base de datos: las cuentas del aforo y de la espera, y lo que se decide antes de tocar la base (origen, forma, sesión).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { aPromover, cabe, estadoNuevo, libres, TOPE_AVISOS_SEMANA } from "../../src/agenda/cupo.ts";
import { contexto, deLaWeb } from "../apoyo/contexto.ts";

let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
before(async () => { app = await construyeApp(contexto(bd)); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

test("el aforo cuenta personas: cabe justo, no cabe uno más, y sin aforo siempre cabe", () => {
  assert.equal(cabe(10, 6, 4), true);
  assert.equal(cabe(10, 6, 5), false);
  assert.equal(cabe(null, 9999, 10), true);
  assert.equal(estadoNuevo(10, 8, 2), "apuntado");
  assert.equal(estadoNuevo(10, 8, 3), "en_espera");
  assert.equal(estadoNuevo(null, 0, 10), "apuntado");
  assert.equal(libres(10, 4), 6);
  assert.equal(libres(10, 12), 0, "nunca negativas");
  assert.equal(libres(null, 3), null);
});

test("promoción de la espera: en orden, el primero que cabe; un grupo grande no bloquea a los pequeños", () => {
  const espera = [{ hogar: 1, personas: 4 }, { hogar: 2, personas: 1 }, { hogar: 3, personas: 2 }, { hogar: 4, personas: 1 }];
  assert.deepEqual(aPromover(10, 10, espera), [], "sin plaza libre no pasa nadie");
  assert.deepEqual(aPromover(10, 9, espera), [2], "queda una plaza: el de 4 no cabe, pasa el de 1");
  assert.deepEqual(aPromover(10, 4, espera), [1, 2, 4], "seis libres: 4 + 1 = 5; el de 2 ya no cabe (7 > 6) y el último, de 1, sí");
  assert.deepEqual(aPromover(10, 4, espera.slice(0, 2)), [1, 2]);
  assert.deepEqual(aPromover(null, 0, espera), [1, 2, 3, 4], "sin aforo, todos");
  assert.deepEqual(aPromover(5, 0, []), []);
  assert.equal(TOPE_AVISOS_SEMANA, 3);
});

const EVENTO = { titulo: "Cata de aceite", tipo: "cata", empieza_en: "2099-01-01T10:00:00Z", plazas: 10 };

test("oficina: sin Origin 403; con forma mala 400; bien formado y sin sesión 401; todo antes de tocar la base", async () => {
  const sin = (method: "POST" | "PUT", url: string) => app.inject({ method, url, headers: { "x-forwarded-proto": "https" }, payload: EVENTO });
  assert.equal((await sin("POST", "/api/admin/eventos")).statusCode, 403);
  assert.equal((await sin("PUT", "/api/admin/eventos/1")).statusCode, 403);
  for (const payload of [{}, { ...EVENTO, hogar: 2 }, { ...EVENTO, tipo: "fiesta" }, { ...EVENTO, titulo: "" }, { ...EVENTO, plazas: 0 }, { ...EVENTO, plazas: 1.5 },
    { ...EVENTO, empieza_en: "mañana" }, { ...EVENTO, estado: "cancelada" }, { ...EVENTO, finca: "Mal Nombre" }, { ...EVENTO, titulo: "a\u0000b" }])
    assert.equal((await app.inject({ method: "POST", url: "/api/admin/eventos", headers: deLaWeb(), payload })).statusCode, 400, JSON.stringify(payload));
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/eventos", headers: deLaWeb(), payload: EVENTO })).statusCode, 401);
  assert.equal((await app.inject({ method: "PUT", url: "/api/admin/eventos/1", headers: deLaWeb(), payload: {} })).statusCode, 400, "PUT vacío");
  assert.equal((await app.inject({ method: "PUT", url: "/api/admin/eventos/1", headers: deLaWeb(), payload: { plazas: 5 } })).statusCode, 401);
  assert.equal((await app.inject({ method: "PUT", url: "/api/admin/eventos/0", headers: deLaWeb(), payload: { plazas: 5 } })).statusCode, 400, "id 0");
  for (const [method, url] of [["GET", "/api/admin/eventos"], ["POST", "/api/admin/eventos/1/cancelar"], ["GET", "/api/admin/eventos/1/inscritos"]] as const)
    assert.equal((await app.inject({ method, url, headers: deLaWeb(), ...(method === "POST" ? { payload: {} } : {}) })).statusCode, 401, url);
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/eventos/1/avisar", headers: deLaWeb(), payload: { texto: "sin título" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/eventos/1/avisar", headers: deLaWeb(), payload: { titulo: "Hola", a: "nadie" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/eventos/1/avisar", headers: deLaWeb(), payload: { titulo: "Hola" } })).statusCode, 401);
});

test("hogar: sin Origin 403; personas fuera de 1-10 o campos de más, 400; bien formado y sin sesión, 401", async () => {
  const url = "/api/agenda/1/inscripcion";
  assert.equal((await app.inject({ method: "POST", url, headers: { "x-forwarded-proto": "https" }, payload: { personas: 2 } })).statusCode, 403);
  assert.equal((await app.inject({ method: "DELETE", url, headers: { "x-forwarded-proto": "https" } })).statusCode, 403);
  for (const payload of [{}, { personas: 0 }, { personas: 11 }, { personas: "dos" }, { personas: 2, hogar: 5 }, { personas: 1.5 }])
    assert.equal((await app.inject({ method: "POST", url, headers: deLaWeb(), payload })).statusCode, 400, JSON.stringify(payload));
  assert.equal((await app.inject({ method: "POST", url: "/api/agenda/x/inscripcion", headers: deLaWeb(), payload: { personas: 2 } })).statusCode, 400, "id no numérico");
  assert.equal((await app.inject({ method: "POST", url, headers: deLaWeb(), payload: { personas: 2 } })).statusCode, 401);
  assert.equal((await app.inject({ method: "DELETE", url, headers: deLaWeb() })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: "/api/agenda", headers: deLaWeb() })).statusCode, 401);
});

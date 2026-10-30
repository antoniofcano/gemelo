// Récords de los juegos (C9a) sin base de datos: el tope de puntos creíbles y lo que se decide antes de tocar la base (origen, forma, sesión).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { DURACION, formaClasificacion, motivoNoCreible, TOPES } from "../../src/juegos/rutas.ts";
import { contexto, deLaWeb } from "../apoyo/contexto.ts";

let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
before(async () => { app = await construyeApp(contexto(bd)); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

test("tope de puntos creíbles: base + porSegundo × duración; duración entre 3 s y 1 h; juego conocido", () => {
  const t = TOPES["cae-la-cosecha"]!;
  assert.equal(motivoNoCreible("cae-la-cosecha", 900, 75), null, "una partida normal");
  assert.equal(motivoNoCreible("cae-la-cosecha", t.base + t.porSegundo * 60, 60), null, "justo en el tope");
  assert.equal(motivoNoCreible("cae-la-cosecha", t.base + t.porSegundo * 60 + 1, 60), "puntos", "un punto más");
  assert.equal(motivoNoCreible("cae-la-cosecha", 999_999, 10), "puntos", "trampa grosera");
  assert.equal(motivoNoCreible("cae-la-cosecha", 10, DURACION.min - 1), "duracion");
  assert.equal(motivoNoCreible("cae-la-cosecha", 10, DURACION.max + 1), "duracion");
  assert.equal(motivoNoCreible("cae-la-cosecha", -1, 60), "puntos");
  assert.equal(motivoNoCreible("cae-la-cosecha", 1.5, 60), "puntos");
  assert.equal(motivoNoCreible("otro-juego", 10, 60), "juego");
});

test("sin Origin del sitio, 403; con forma mala, 400 (campos de más, tipos); sin sesión, 401; todo antes de tocar la base", async () => {
  const url = "/api/juegos/cae-la-cosecha/partidas";
  assert.equal((await app.inject({ method: "POST", url, headers: { "x-forwarded-proto": "https" }, payload: { puntos: 1, duracion_s: 10 } })).statusCode, 403);
  for (const payload of [{ puntos: 1 }, { puntos: 1, duracion_s: 10, hogar: 2 }, { puntos: "mucho", duracion_s: 10 }, { puntos: -5, duracion_s: 10 }, { puntos: 1, duracion_s: 0 }])
    assert.equal((await app.inject({ method: "POST", url, headers: deLaWeb(), payload })).statusCode, 400, JSON.stringify(payload));
  assert.equal((await app.inject({ method: "POST", url: "/api/juegos/MAL/partidas", headers: deLaWeb(), payload: { puntos: 1, duracion_s: 10 } })).statusCode, 400, "id con mayúsculas");
  assert.equal((await app.inject({ method: "POST", url, headers: deLaWeb(), payload: { puntos: 1, duracion_s: 10 } })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: "/api/juegos/cae-la-cosecha/records", headers: deLaWeb() })).statusCode, 401);
});

test("clasificación (C9c): la forma pública no lleva ids; la propia fila se marca; fuera de la tabla sale en `mia`; sin nadie, vacía", () => {
  const fila = (puesto: number, hogar: number, puntos: number, alias: string | null) => ({ puesto: String(puesto), puntos, hogar_id: String(hogar), alias, total: "8" });
  const r = formaClasificacion([fila(1, 4, 900, "Olivares Sur"), fila(2, 9, 700, null), fila(2, 3, 700, "Ana"), fila(7, 5, 40, null)], 5, 3);
  assert.equal(r.total, 8);
  assert.deepEqual(r.puestos.map(f => f.puesto), [1, 2, 2], "los empates comparten puesto y se corta en n");
  assert.deepEqual(r.mia, { puesto: 7, alias: null, puntos: 40, es_mia: true });
  assert.ok(r.puestos.every(f => !f.es_mia));
  assert.ok(!/hogar|"id"|@/.test(JSON.stringify(r)), JSON.stringify(r));
  for (const f of [...r.puestos, r.mia!]) assert.deepEqual(Object.keys(f).sort(), ["alias", "es_mia", "puesto", "puntos"]);
  assert.deepEqual(formaClasificacion([], 5, 5), { total: 0, puestos: [], mia: null });
});

test("clasificación (C9c): sin sesión 401, forma mala 400 (n fuera de 1-20, parámetros de más, mal id); antes de tocar la base", async () => {
  const url = "/api/juegos/cae-la-cosecha/clasificacion";
  assert.equal((await app.inject({ method: "GET", url, headers: deLaWeb() })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: url + "?n=3", headers: deLaWeb() })).statusCode, 401);
  for (const q of ["?n=0", "?n=21", "?n=abc", "?otro=1"]) assert.equal((await app.inject({ method: "GET", url: url + q, headers: deLaWeb() })).statusCode, 400, q);
  assert.equal((await app.inject({ method: "GET", url: "/api/juegos/MAL/clasificacion", headers: deLaWeb() })).statusCode, 400);
});

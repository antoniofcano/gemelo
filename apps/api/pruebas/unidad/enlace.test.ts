// Pedir un enlace (POST /api/auth/enlace) sin PostgreSQL: una base de mentira que solo sabe si un correo tiene cuenta.
// Lo que se garantiza: la respuesta es IDÉNTICA con correo existente e inexistente (estado, cuerpo, cabeceras que importan y
// ningún dato del correo), el límite por correo es de 5 en 15 min, el límite por IP de 10 en la misma ventana, y el texto de
// aceptado y el de límite son los de contratos/sesion.md. Lo que toca la base de verdad está en pruebas/integracion/api.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { TEXTO_ACEPTADO, TEXTO_LIMITE } from "../../src/auth/rutas.ts";
import { configDePrueba, contexto } from "../apoyo/contexto.ts";

const CON_CUENTA = "ana.cuenta@example.com";
const SIN_CUENTA = "nadie.aqui@example.com";

/** Una base de mentira: solo responde a la consulta de hogares (con o sin cuenta) y acepta las escrituras del enlace. */
function bdDeMentira(): pg.Pool {
  return {
    async query(texto: string, valores: unknown[] = []) {
      if (/FROM hogares WHERE correo/.test(texto)) return { rows: valores[0] === CON_CUENTA ? [{ id: 1 }] : [] };
      return { rows: [] };
    },
  } as unknown as pg.Pool;
}

async function montaApp() {
  const ctx = contexto(bdDeMentira());
  const app = await construyeApp(ctx);
  await app.ready();
  return { app, cartero: ctx.cartero };
}

/** Una petición de «pedir enlace» desde una IP concreta (por defecto, una distinta cada vez para no tocar el límite por IP). */
function pideEnlace(app: Awaited<ReturnType<typeof montaApp>>["app"], correo: string, ip: string) {
  return app.inject({
    method: "POST", url: "/api/auth/enlace",
    headers: { origin: "https://gemelo.example.com", "x-forwarded-proto": "https", "x-forwarded-for": ip, "content-type": "application/json" },
    payload: { correo },
  });
}
const ipDe = (n: number) => "198.51.100." + n;

test("la configuración por omisión: 5 enlaces por correo y 10 por IP, en 15 minutos", () => {
  const c = configDePrueba();
  assert.equal(c.enlace.porCorreo, 5);
  assert.equal(c.enlace.porIp, 10);
  assert.equal(c.enlace.ventanaMin, 15);
});

test("pedir un enlace: 202 idéntico con correo con cuenta y sin ella (estado, cuerpo, tipo y caché)", async () => {
  const { app, cartero } = await montaApp();
  try {
    const con = await pideEnlace(app, CON_CUENTA, ipDe(1));
    const sin = await pideEnlace(app, SIN_CUENTA, ipDe(2));
    assert.equal(con.statusCode, 202);
    assert.equal(sin.statusCode, 202);
    assert.deepEqual(con.json(), { mensaje: TEXTO_ACEPTADO });
    assert.deepEqual(sin.json(), con.json(), "el mismo cuerpo, tenga o no cuenta");
    assert.equal(con.headers["content-type"], sin.headers["content-type"]);
    assert.equal(con.headers["cache-control"], sin.headers["cache-control"]);
    assert.equal(con.headers["set-cookie"], undefined);
    assert.equal(sin.headers["set-cookie"], undefined);
    assert.ok(!con.body.includes(CON_CUENTA) && !sin.body.includes(SIN_CUENTA), "la respuesta no repite el correo");
    // el enlace solo sale para quien tiene cuenta; la respuesta no lo cuenta
    await new Promise(r => setImmediate(r));
    assert.deepEqual(cartero.mensajes.map(m => m.para), [CON_CUENTA]);
  } finally { await app.close(); }
});

test("el texto de aceptado dice «Si ese correo tiene cuenta, te llegará un enlace.»", () => {
  assert.ok(TEXTO_ACEPTADO.startsWith("Si ese correo tiene cuenta, te llegará un enlace."));
});

test("límite por correo: 5 en 15 min; el 6.º es 429 con el mismo cuerpo exista o no la cuenta", async () => {
  const { app } = await montaApp();
  try {
    for (const [correo, bloque] of [[CON_CUENTA, 1], [SIN_CUENTA, 2]] as const) {
      const rs = [];
      for (let i = 0; i < 6; i++) rs.push(await pideEnlace(app, correo, ipDe(10 * bloque + i)));
      assert.deepEqual(rs.map(r => r.statusCode), [202, 202, 202, 202, 202, 429], correo);
      assert.deepEqual(rs[5]!.json(), { error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE }, correo);
    }
  } finally { await app.close(); }
});

test("límite por IP: 10 en 15 min, con correos distintos (con o sin cuenta); la 11.ª es 429", async () => {
  const { app } = await montaApp();
  try {
    const misma = "198.51.100.99", rs = [];
    for (let i = 0; i < 11; i++) rs.push(await pideEnlace(app, i === 0 ? CON_CUENTA : "n" + i + "@example.com", misma));
    assert.deepEqual(rs.map(r => r.statusCode), [...Array(10).fill(202), 429]);
    assert.deepEqual(rs[10]!.json(), { error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE });
  } finally { await app.close(); }
});

test("un correo mal formado sigue siendo 400 sin mirar la base ni contar para el límite", async () => {
  const { app } = await montaApp();
  try {
    const r = await pideEnlace(app, "no-es-un-correo", ipDe(200));
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().error, "correo_no_valido");
  } finally { await app.close(); }
});

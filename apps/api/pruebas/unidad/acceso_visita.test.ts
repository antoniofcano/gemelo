// OF10b (decisión 154): quién entra en la «Sala de la visita». Lógica pura (puedeEntrar, LigaduraVisita), propiedades con fast-check y lo que las rutas
// deciden antes de la sesión o de la base. La parte con base (apuntado / en espera / oficina contra PostGIS) está en
// pruebas/integracion/oficina_mundo.test.ts (por el banco).
import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { CODIGO_SOLO_INSCRITOS, LIGADURA_HORAS, LigaduraVisita, puedeEntrar, TEXTO_SOLO_INSCRITOS } from "../../src/presencia/acceso_visita.ts";
import { CLAVES_SALA } from "../../src/presencia/livekit.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const par: fc.Parameters<unknown> = { seed: 154, numRuns: 300 };

test("puedeEntrar: solo la sala «visita» con evento restringe; entran la oficina y los apuntados", () => {
  assert.deepEqual(puedeEntrar({ sala: "visita", esOficina: false, evento: 7, apuntado: false }), { ok: false, codigo: CODIGO_SOLO_INSCRITOS, mensaje: TEXTO_SOLO_INSCRITOS });
  assert.equal(TEXTO_SOLO_INSCRITOS, "Esta visita es para las familias apuntadas.");
  assert.deepEqual(puedeEntrar({ sala: "visita", esOficina: false, evento: 7, apuntado: true }), { ok: true });
  assert.deepEqual(puedeEntrar({ sala: "visita", esOficina: true, evento: 7, apuntado: false }), { ok: true });
  assert.deepEqual(puedeEntrar({ sala: "visita", esOficina: false, evento: null, apuntado: false }), { ok: true }, "sin evento: quien invite la oficina");
  assert.deepEqual(puedeEntrar({ sala: "general", esOficina: false, evento: 7, apuntado: false }), { ok: true }, "la general nunca se restringe");
});

test("propiedad: se niega exactamente a quien, en la sala «visita» con evento, ni es oficina ni está apuntado", () => {
  fc.assert(fc.property(fc.constantFrom(...CLAVES_SALA), fc.boolean(), fc.option(fc.integer({ min: 1, max: 2147483647 }), { nil: null }), fc.boolean(), (sala, esOficina, evento, apuntado) => {
    const d = puedeEntrar({ sala, esOficina, evento, apuntado });
    const niega = sala === "visita" && evento !== null && !esOficina && !apuntado;
    assert.equal(d.ok, !niega);
    if (!d.ok) { assert.equal(d.codigo, CODIGO_SOLO_INSCRITOS); assert.equal(d.mensaje, TEXTO_SOLO_INSCRITOS); }
  }), par);
});

test("LigaduraVisita: guarda el evento, caduca a las 8 h y se suelta con null", () => {
  const l = new LigaduraVisita(), t0 = 1_000_000;
  assert.equal(l.vigente(t0), null, "al principio, abierta");
  l.liga(7, t0);
  assert.equal(l.vigente(t0 + 1), 7);
  assert.equal(l.vigente(t0 + LIGADURA_HORAS * 3600_000 - 1), 7);
  assert.equal(l.vigente(t0 + LIGADURA_HORAS * 3600_000), null, "caduca");
  l.liga(9, t0); l.liga(null, t0); assert.equal(l.vigente(t0 + 1), null, "invitar sin evento la deja abierta");
  l.liga(3, t0); l.liga(4, t0 + 10); assert.equal(l.vigente(t0 + 11), 4, "la última invitación manda");
});

test("propiedad: la ligadura vale mientras no pasen las 8 h desde la última invitación", () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 0, max: 20 * 3600_000 }), (ev, dt) => {
    const l = new LigaduraVisita(); l.liga(ev, 5);
    assert.equal(l.vigente(5 + dt), dt < LIGADURA_HORAS * 3600_000 ? ev : null);
  }), par);
});

test("rutas: «evento» en llevar se valida en el esquema (entero positivo) y, sin sesión, pide sesión", async () => {
  const pool = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
  const lk = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "ws://localhost:7880", GEMELO_LIVEKIT_CLAVE: "devprueba03", GEMELO_LIVEKIT_SECRETO: "q".repeat(32) };
  const app = await construyeApp(contexto(pool, configDePrueba({ ...lk })));
  try {
    let n = 0;
    const pide = (payload: object) => app.inject({ method: "POST", url: "/api/admin/presencia/llevar", headers: deLaWeb({ "x-forwarded-for": "198.51.100." + (++n) }), payload });
    for (const malo of [{ evento: 0 }, { evento: -1 }, { evento: 1.5 }, { evento: 2147483648 }]) assert.equal((await pide({ de: "general", a: "visita", ...malo })).statusCode, 400, JSON.stringify(malo));
    assert.equal((await pide({ de: "general", a: "visita", evento: 7 })).statusCode, 401);
  } finally { await app.close(); await pool.end(); }
});

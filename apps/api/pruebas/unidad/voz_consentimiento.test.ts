// F3j (ADR-0026; decisiones 163 y 164; EIPD-VOZ): el consentimiento de voz y el plazo de la auditoría de voz, SIN base ni LiveKit.
//  · Palabra con la comprobación de consentimiento: sin consentimiento vigente no se levanta la mano ni se da la palabra (y LiveKit no se toca); retirar quita la
//    palabra y baja la mano en todas las salas.
//  · corteAuditoriaVoz: «la campaña y un año más» (campaña de octubre a septiembre), con propiedades.
//  · Las rutas: Origin, sesión y forma antes de tocar la base.
//  · La migración 0018 y la versión del aviso, de acuerdo con el motor (el texto vive en 47_habla.js).
// El recorrido contra PostGIS (aceptar, retirar, purgar de verdad) está en pruebas/integracion/voz_consentimiento.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import fc from "fast-check";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import type { ConfigLiveKit } from "../../src/config.ts";
import { identidadOpaca, SALA_GUIADA } from "../../src/presencia/livekit.ts";
import { corteAuditoriaVoz, VOZ_AVISO_VERSION } from "../../src/presencia/consentimiento_voz.ts";
import { type Auditor, Palabra } from "../../src/presencia/voz.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { RelojFalso, SalaFalsa } from "../apoyo/voz.ts";

const LK: ConfigLiveKit = { url: "http://livekit:7880", urlPublica: "ws://localhost:7880", clave: "devvoz01", secreto: "v".repeat(16) + "-sintetico-de-prueba-voz" };
const lkDevSinBase = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "ws://localhost:7880", GEMELO_LIVEKIT_CLAVE: "devvoz02", GEMELO_LIVEKIT_SECRETO: "w".repeat(32) };
const RAIZ = new URL("../../../../", import.meta.url);
const lee = (r: string) => readFileSync(new URL(r, RAIZ), "utf8");

const SALA = SALA_GUIADA(9), A = identidadOpaca(LK, 1, "a"), B = identidadOpaca(LK, 2, "b");
function monta(consienten: Set<number>) {
  const lk = new SalaFalsa(), reloj = new RelojFalso(), filas: { actor: number | null; accion: string; detalle: Record<string, unknown> }[] = [];
  const a: Auditor = async (actor, accion, detalle) => { filas.push({ actor, accion, detalle }); };
  lk.entra(SALA, A); lk.entra(SALA, B); lk.entra(SALA_GUIADA(10), A);
  return { lk, reloj, filas, p: new Palabra(lk, a, reloj, undefined, async h => consienten.has(h)) };
}

test("sin consentimiento vigente no se levanta la mano ni se da la palabra, y LiveKit ni se toca (la comprobación que manda es la de la api)", async () => {
  const c = new Set<number>([2]);
  const { lk, filas, p } = monta(c);
  assert.deepEqual(await p.levanta(9, A, 1), { ok: false, codigo: "sin_consentimiento" });
  assert.deepEqual(await p.da(9, A, 1, 7), { ok: false, codigo: "sin_consentimiento" });
  assert.deepEqual(lk.llamadas, [], "ni un RoomService");
  assert.equal(lk.p(SALA, A)!.micro, false); assert.equal(p.vista(9).turno, null); assert.deepEqual(p.vista(9).manos, []); assert.deepEqual(filas, []);
  // con consentimiento (el hogar 2), todo como antes
  assert.deepEqual(await p.levanta(9, B, 2), { ok: true, puesto: 1 });
  const r = await p.da(9, B, 2, 7); assert.equal(r.ok, true); assert.equal(lk.p(SALA, B)!.micro, true);
  await p.quita(9, 7, "cortada");
  // lo da y lo quita la oficina: si el hogar retira el consentimiento justo antes de que se la den, no se la dan
  c.delete(2);
  assert.deepEqual(await p.da(9, B, 2, 7), { ok: false, codigo: "sin_consentimiento" });
  assert.equal(lk.p(SALA, B)!.micro, false);
  // si cambia la versión del aviso, `consiente` de la api deja de valer para todos: lo simula el mismo conjunto vacío
  c.add(1); assert.equal((await p.da(9, A, 1, 7)).ok, true);
});

test("retirar el consentimiento: se le quita la palabra (LiveKit despublica) y se baja su mano en TODAS las salas; a los demás no se les toca", async () => {
  const { lk, filas, reloj, p } = monta(new Set([1, 2]));
  await p.levanta(10, A, 1);                // mano del hogar 1 en otra sala
  await p.levanta(9, B, 2);                 // mano del hogar 2
  const r = await p.da(9, A, 1, 7); assert.equal(r.ok, true);
  assert.equal(lk.p(SALA, A)!.micro, true);
  await p.retiraConsentimiento(1, 1);
  assert.equal(lk.p(SALA, A)!.micro, false, "sin permiso de micrófono");
  assert.equal(lk.p(SALA, A)!.atributos.palabra_hasta, undefined);
  assert.equal(p.vista(9).turno, null); assert.deepEqual(p.vista(10).manos, [], "su mano de la otra sala, bajada");
  assert.equal(lk.p(SALA_GUIADA(10), A)!.atributos.mano, undefined, "y quitada en LiveKit");
  assert.deepEqual(p.vista(9).manos.map(m => m.identidad), [B], "la mano de otro hogar sigue");
  assert.deepEqual(filas.filter(f => f.accion === "guiada.palabra_quitada").at(-1), { actor: 1, accion: "guiada.palabra_quitada", detalle: { evento: 9, hogar: 1, motivo: "consentimiento" } });
  assert.equal(reloj.pendientes, 0, "sin temporizador colgando");
  // idempotente y sin nada que quitar
  await p.retiraConsentimiento(1, 1);
});

test("corteAuditoriaVoz: la campaña (octubre a septiembre) y un año más; ejemplos y propiedades", () => {
  const c = (s: string) => corteAuditoriaVoz(new Date(s)).toISOString().slice(0, 10);
  assert.equal(c("2028-10-05T00:00:00Z"), "2027-10-01", "la campaña 2026/27 ya cumplió su año; la 2027/28 acaba de cerrar y queda otro año");
  assert.equal(c("2028-09-30T23:59:59Z"), "2026-10-01", "hasta el 30 de septiembre sigue guardándose la campaña 2026/27");
  assert.equal(c("2028-10-01T00:00:00Z"), "2027-10-01");
  assert.equal(c("2027-03-15T00:00:00Z"), "2025-10-01");
  assert.equal(c("2027-01-01T00:00:00Z"), "2025-10-01");
  fc.assert(fc.property(fc.date({ min: new Date("2025-01-01"), max: new Date("2060-01-01"), noInvalidDate: true }), ahora => {
    const k = corteAuditoriaVoz(ahora);
    assert.equal(k.getUTCMonth(), 9); assert.equal(k.getUTCDate(), 1, "siempre un 1 de octubre");
    // nunca borra algo de hace menos de un año ni de la campaña en curso o la recién cerrada; sí lo de hace más de dos años
    assert.ok(ahora.getTime() - k.getTime() > 365 * 86400_000 - 1, "al menos un año de plazo tras el cierre más reciente");
    assert.ok(ahora.getTime() - k.getTime() <= 2 * 366 * 86400_000, "y no más de dos años");
    // lo escrito en la campaña en curso o en la anterior nunca cae
    const y = ahora.getUTCMonth() >= 9 ? ahora.getUTCFullYear() : ahora.getUTCFullYear() - 1;
    assert.ok(Date.UTC(y - 1, 9, 1) >= k.getTime(), "la campaña anterior a la en curso se conserva");
  }), { numRuns: 300 });
});

test("rutas del consentimiento: sin Origin 403, sin sesión 401, forma mala 400 (antes de tocar la base)", async () => {
  const pool = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
  const app = await construyeApp({ ...contexto(pool, configDePrueba({ ...lkDevSinBase })), moderadorVoz: new SalaFalsa() });
  const U = "/api/presencia/voz/consentimiento";
  try {
    assert.equal((await app.inject({ method: "GET", url: U, headers: deLaWeb() })).statusCode, 401);
    for (const [method, payload] of [["PUT", { version: VOZ_AVISO_VERSION }], ["DELETE", undefined]] as const) {
      const cuerpo = payload ? { payload } : {};
      assert.equal((await app.inject({ method, url: U, headers: { "x-forwarded-proto": "https" }, ...cuerpo })).statusCode, 403, method + " sin Origin");
      assert.equal((await app.inject({ method, url: U, headers: deLaWeb(), ...cuerpo })).statusCode, 401, method + " sin sesión");
    }
    for (const payload of [{}, { version: 0 }, { version: "x" }, { version: 1.5 }, { version: 1, hogar: 3 }, { version: 99999 }])
      assert.equal((await app.inject({ method: "PUT", url: U, headers: deLaWeb(), payload })).statusCode, 400, JSON.stringify(payload));
  } finally { await app.close(); await pool.end(); }
});

test("la versión del aviso de la api es la del texto del motor (si cambia el texto, se suben las dos); la migración 0018 solo toca lo de la voz", () => {
  const motor = lee("apps/web/motor/47_habla.js"), m = /AVISO_VERSION\s*=\s*(\d+)/.exec(motor);
  assert.ok(m, "47_habla.js declara AVISO_VERSION");
  assert.equal(Number(m![1]), VOZ_AVISO_VERSION);
  const sql = lee("apps/api/migraciones/0018_voz_consentimiento.sql");
  assert.match(sql, /CREATE TABLE voz_consentimientos \(\s*hogar_id\s+bigint PRIMARY KEY REFERENCES hogares \(id\) ON DELETE CASCADE/, "al borrar el hogar se borra su consentimiento");
  assert.match(sql, /SECURITY DEFINER/); assert.match(sql, /REVOKE ALL ON FUNCTION purga_auditoria_voz\(timestamptz\) FROM PUBLIC/);
  assert.doesNotMatch(sql, /GRANT[^;]*DELETE[^;]*\bauditoria\b/i, "gemelo_api sigue sin poder borrar de la auditoría");
  // solo las acciones de la voz: guiada.* y los consentimientos; nunca el resto de la auditoría
  const acciones = [...sql.matchAll(/a\.accion\s*(?:LIKE|=)\s*'([^']+)'/g)].map(x => x[1]).sort();
  assert.deepEqual(acciones, ["guiada.%", "voz.consentimiento_dado", "voz.consentimiento_retirado"]);
  // y las que escribe el código existen con esos nombres
  const codigo = lee("apps/api/src/presencia/consentimiento_voz.ts");
  for (const a of ["voz.consentimiento_dado", "voz.consentimiento_retirado"]) assert.ok(codigo.includes('"' + a + '"'), a);
});

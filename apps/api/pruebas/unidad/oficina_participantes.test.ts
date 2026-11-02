// OF14 (escalón 2): GET /api/admin/presencia/participantes sin base ni LiveKit reales. La app corre contra una base de mentira que responde por fragmento de
// SQL (la sesión nace por el sondeo de unas gafas, como en vinculo_oficina.test.ts, y la fila de sesión la pone cada prueba) y un moderador de mentira que
// hace de RoomService.ListParticipants. Lo que NO prueba: LiveKit real (qué da joinedAt, qué hace listParticipants de una sala sin nadie con la 1.13.11),
// ni la integración con PostGIS (pruebas/integracion/oficina_participantes.test.ts, escrita, por el banco). Claves y correos sintéticos.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { type ModeradorSala, type ModeradorVoz, type ParticipanteSala, identidadOpaca } from "../../src/presencia/livekit.ts";
import { filaDeParticipante, ordenaYRecorta, PARTICIPANTES_CACHE_MS, PARTICIPANTES_MAX } from "../../src/presencia/oficina_mundo.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { RelojFalso } from "../apoyo/voz.ts";

const LK_ENV = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "ws://localhost:7880", GEMELO_LIVEKIT_CLAVE: "devof14aa", GEMELO_LIVEKIT_SECRETO: "w".repeat(40) };
const SECRETO = { secreto: LK_ENV.GEMELO_LIVEKIT_SECRETO };
const HORA = 3_600_000, SONDEO = "s".repeat(43), RUTA = "/api/admin/presencia/participantes";
type Fila = Record<string, unknown>;
let filaSesion: Fila | null = null;
const bd = {
  query: async (sql: string) => {
    if (/UPDATE codigos_vinculo c SET usado_en/.test(sql)) return { rowCount: 1, rows: [{ hogar_id: 5, normas_version: 1, rol: "oficina" }] };
    if (/FROM sesiones s JOIN hogares h/.test(sql)) return { rowCount: filaSesion ? 1 : 0, rows: filaSesion ? [filaSesion] : [] };
    if (/^\s*SELECT id FROM hogares\s*$/.test(sql)) return { rowCount: 2, rows: [{ id: 5 }, { id: 9 }] };
    return { rowCount: 0, rows: [] };
  },
};
const fila = (o: Fila): Fila => ({
  sid: 11, hogar_id: 5, rol: "oficina", alias: "Mirlo", alias_visible: false, normas_version: 1, origen: "enlace", expira_en: new Date(Date.now() + 12 * HORA), refrescar: false,
  aparato_id: 3, aparato_aprobado: true, confirmada_en: new Date(), confirmacion_vigente: true, llave_id: null, ...o,
});
const OFICINA = {}, HOGAR = { rol: "hogar", aparato_id: null, aparato_aprobado: false }, GAFAS = { rol: "oficina", origen: "vinculo", aparato_id: null, aparato_aprobado: false };

const meta = (o: Record<string, unknown>) => JSON.stringify({ alias: "Mirlo", avatar: { camisa: 1, sombrero: "paja", piel: 2 }, rol: "hogar", dispositivo: "movil", ...o });
const ahoraMs = Date.parse("2026-11-02T12:00:00Z");
const part = (sala: string, identidad: string, o: Partial<ParticipanteSala> = {}): ParticipanteSala => ({ sala, identidad, metadata: meta({}), atributos: {}, conectadoEn: ahoraMs, publicaPista: false, ...o });
let salas: Record<string, ParticipanteSala[]> = {};
let llamadas: string[] = [];
let falla = false;
const moderador: ModeradorSala = {
  expulsaHogar: async () => 0, envia: async () => true,
  participantes: async s => { llamadas.push(s); if (falla) throw new Error("LiveKit no responde"); return salas[s] ?? []; },
};
const voz = { salasGuiadas: async () => ["guiada-7"] } as unknown as ModeradorVoz;

/** La cookie de una sesión nacida por el sondeo de unas gafas (la firma es de cada app: no vale para otra). */
async function galleta(a: FastifyInstance): Promise<string> {
  const r = await a.inject({ method: "POST", url: "/api/auth/vincula/sondeo", headers: deLaWeb(), payload: { sondeo: SONDEO } });
  return ([] as string[]).concat(r.headers["set-cookie"] ?? []).find(c => c.startsWith("__Host-gemelo="))!.split(";")[0]!;
}
let app: FastifyInstance, cookie = "", reloj: RelojFalso, ipN = 0;
before(async () => {
  reloj = new RelojFalso();
  app = await construyeApp({ ...contexto(bd as unknown as pg.Pool, configDePrueba(LK_ENV)), moderador, moderadorVoz: voz, relojVoz: reloj });
  await app.ready();
  cookie = await galleta(app);
});
after(async () => { await app.close(); });
beforeEach(() => { salas = {}; llamadas = []; falla = false; filaSesion = fila(OFICINA); reloj.t += PARTICIPANTES_CACHE_MS + 1; });
const pide = () => app.inject({ method: "GET", url: RUTA, headers: { ...deLaWeb({ "x-forwarded-for": "198.51.100." + (++ipN % 250) }), cookie } });

test("sin sesión 401; con sesión de familia 403; con unas gafas vinculadas desde la oficina 403 (ADR-0028); con aparato pendiente 403; y LiveKit no se toca", async () => {
  assert.equal((await app.inject({ method: "GET", url: RUTA, headers: deLaWeb() })).statusCode, 401);
  for (const [nombre, o, error] of [["hogar", HOGAR, "sin_permiso"], ["gafas de oficina", GAFAS, "sin_permiso"], ["aparato pendiente", { aparato_aprobado: false }, "aparato_pendiente"]] as const) {
    filaSesion = fila(o);
    const r = await pide();
    assert.equal(r.statusCode, 403, nombre);
    assert.equal(r.json().error, error, nombre);
  }
  assert.deepEqual(llamadas, [], "nada se consulta a LiveKit sin sesión de oficina");
});

test("la oficina ve quién está: salas (general, visita y las guiadas abiertas), alias, rol, aparato, desde cuándo, hogar_id; sin correos; la oficina primero", async () => {
  const id5 = identidadOpaca(SECRETO, 5, "sesion-a"), id9 = identidadOpaca(SECRETO, 9, "sesion-b"), desconocida = "h_" + "x".repeat(22) + "_" + "y".repeat(8);
  salas = {
    "hituelo-libre": [
      part("hituelo-libre", id9, { metadata: meta({ alias: "Pardal" }), conectadoEn: ahoraMs - 600_000, atributos: { haza: "hituelo-12", vista: "aerea" } }),
      part("hituelo-libre", id5, { metadata: meta({ rol: "oficina", alias: "Oficina", dispositivo: "escritorio" }) }),
    ],
    "hituelo-visita": [part("hituelo-visita", desconocida, { metadata: "esto no es json", conectadoEn: null })],
    "guiada-7": [part("guiada-7", identidadOpaca(SECRETO, 9, "sesion-c"), { metadata: meta({ rol: "guia", alias: "Guía", dispositivo: "quest" }) })],
  };
  const r = await pide();
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.deepEqual(Object.keys(j).sort(), ["consultado_en", "participantes", "total", "truncado"]);
  assert.equal(j.total, 4); assert.equal(j.truncado, false);
  const [a, b, c, d] = j.participantes;
  assert.deepEqual(a, { sala: "general", alias: "Oficina", rol: "oficina", aparato: "escritorio", conectado_desde: new Date(ahoraMs).toISOString(), hogar_id: 5, haza: null, vista: null });
  assert.deepEqual(b, { sala: "general", alias: "Pardal", rol: "hogar", aparato: "movil", conectado_desde: new Date(ahoraMs - 600_000).toISOString(), hogar_id: 9, haza: "hituelo-12", vista: "aerea" });
  assert.equal(c.sala, "guiada-7"); assert.equal(c.rol, "guia"); assert.equal(c.aparato, "quest");
  assert.deepEqual(d, { sala: "visita", alias: "Visitante", rol: "hogar", aparato: null, conectado_desde: null, hogar_id: null, haza: null, vista: null });
  assert.doesNotMatch(r.body, /@|correo|identidad|h_x{3}/, "ni correos ni identidades opacas");
  assert.deepEqual([...llamadas].sort(), ["guiada-7", "hituelo-libre", "hituelo-visita"]);
});

test("límite de tamaño: más de 200 se recortan y se dice (total real y truncado)", async () => {
  salas = { "hituelo-libre": Array.from({ length: 250 }, (_, i) => part("hituelo-libre", "h_" + String(i).padStart(22, "0") + "_" + "z".repeat(8), { metadata: meta({ alias: "P" + i }) })) };
  const j = (await pide()).json();
  assert.equal(j.participantes.length, PARTICIPANTES_MAX); assert.equal(j.total, 250); assert.equal(j.truncado, true);
});

test("caché de 4 s compartida: dos lecturas seguidas consultan una vez; pasado el tiempo, otra vez", async () => {
  salas = { "hituelo-libre": [part("hituelo-libre", "h_" + "a".repeat(22) + "_" + "b".repeat(8))] };
  await pide(); const n = llamadas.length;
  reloj.t += PARTICIPANTES_CACHE_MS - 1000;
  const otra = await pide(); assert.equal(otra.statusCode, 200);
  assert.equal(llamadas.length, n, "dentro de la caché no se vuelve a consultar");
  reloj.t += 1500;
  await pide(); assert.equal(llamadas.length, 2 * n, "caducada la caché, se vuelve a consultar");
});

test("si LiveKit no responde: 503 livekit_no_responde con mensaje claro, y no se cachea el fallo", async () => {
  falla = true;
  const r = await pide();
  assert.equal(r.statusCode, 503); assert.equal(r.json().error, "livekit_no_responde"); assert.match(r.json().mensaje, /vuelve a intentarlo/i);
  falla = false;
  assert.equal((await pide()).statusCode, 200, "al volver LiveKit, responde");
});

test("sin lista de participantes en el moderador la presencia está apagada: 503 presencia_apagada", async () => {
  const sin = await construyeApp({ ...contexto(bd as unknown as pg.Pool, configDePrueba(LK_ENV)), moderador: { expulsaHogar: async () => 0, envia: async () => true } });
  try {
    await sin.ready();
    const r = await sin.inject({ method: "GET", url: RUTA, headers: { ...deLaWeb(), cookie: await galleta(sin) } });
    assert.equal(r.statusCode, 503); assert.equal(r.json().error, "presencia_apagada");
  } finally { await sin.close(); }
});

test("filaDeParticipante: metadatos y atributos son datos; lo raro se descarta; admin se ve como oficina; el alias de una oficina nunca es el de la cuenta", () => {
  const mapa = new Map<string, number>();
  const f = filaDeParticipante(part("hituelo-libre", "h_" + "q".repeat(22) + "_" + "r".repeat(8), { metadata: meta({ rol: "admin", alias: "Pepa García", dispositivo: "tele" }), atributos: { haza: "../../etc", vista: "otra" } }), mapa);
  assert.equal(f.alias, "Oficina"); assert.equal(f.rol, "oficina"); assert.equal(f.aparato, null); assert.equal(f.haza, null); assert.equal(f.vista, null);
  assert.equal(filaDeParticipante(part("x", "h_" + "q".repeat(22) + "_" + "r".repeat(8), { metadata: meta({ alias: "a".repeat(60) }) }), mapa).alias.length, 24);
  assert.equal(filaDeParticipante(part("x", "i", { metadata: "[]" }), mapa).alias, "Visitante");
  const sinOrden = ordenaYRecorta([f, { ...f, rol: "hogar", sala: "a" }], 1);
  assert.equal(sinOrden.filas[0]!.rol, "oficina"); assert.equal(sinOrden.truncado, true);
});

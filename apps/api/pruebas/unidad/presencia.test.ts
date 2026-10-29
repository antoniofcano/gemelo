// Presencia (F2) sin LiveKit ni base: el token se firma y se DECODIFICA con el verificador del propio SDK (sala,
// identidad, permisos del contrato, metadatos, caducidad), la identidad es opaca y la configuración se valida.
// Las claves son sintéticas; ninguna es de un LiveKit real.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { TokenVerifier } from "livekit-server-sdk";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { cargaConfig, type ConfigLiveKit, ErrorDeConfig } from "../../src/config.ts";
import { esDelHogar, Expulsados, firmaToken, identidadOpaca, type ModeradorSala, PERMISOS, prefijoHogar, SALA_LIBRE, TTL_S } from "../../src/presencia/livekit.ts";
import { expulsa } from "../../src/presencia/rutas.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { CONTRATOS } from "../apoyo/esquemas.ts";

const lkDevSinBase = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "ws://localhost:7880", GEMELO_LIVEKIT_CLAVE: "devprueba02", GEMELO_LIVEKIT_SECRETO: "q".repeat(32) };

const LK: ConfigLiveKit = { url: "http://livekit:7880", urlPublica: "ws://localhost:7880", clave: "devprueba01", secreto: "s".repeat(16) + "-sintetico-de-prueba-123" };
const ROLES_IDENT = (JSON.parse(readFileSync(CONTRATOS + "livekit-roles.json", "utf8")) as { identidad: { formato: string } }).identidad;
const ROLES = JSON.parse(readFileSync(CONTRATOS + "livekit-roles.json", "utf8")) as { salas: { visita_libre: { nombre: string } }; roles: Record<string, Record<string, unknown>> };
const SES = "sesion-sintetica-A", SES2 = "sesion-sintetica-B";
const ID_RE = /^h_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/;
const META = { alias: "Mirlo", avatar: { camisa: 2, sombrero: "gorra" as const, piel: 3 }, rol: "hogar" as const, dispositivo: "quest" as const };

test("los permisos del código son los de contratos/livekit-roles.json, rol a rol, y la sala libre es la del contrato", () => {
  assert.deepEqual(Object.keys(PERMISOS).sort(), Object.keys(ROLES.roles).sort());
  for (const [rol, p] of Object.entries(ROLES.roles)) assert.deepEqual(PERMISOS[rol as keyof typeof PERMISOS], p, rol);
  assert.equal(SALA_LIBRE, ROLES.salas.visita_libre.nombre);
  assert.equal(SALA_LIBRE, "hituelo-libre");
});

test("token decodificado: sala hituelo-libre, identidad opaca, solo datos, metadatos de la api y caducidad de 15 min", async () => {
  const ahora = Date.now();
  const t = await firmaToken(LK, 42, SES, META, ahora);
  assert.equal(t.sala, "hituelo-libre");
  assert.equal(t.url, "ws://localhost:7880");
  assert.match(t.identidad, ID_RE);
  assert.ok(new RegExp(ROLES_IDENT.formato).test(t.identidad), "el formato del contrato");
  const c = await new TokenVerifier(LK.clave, LK.secreto).verify(t.token);
  assert.equal(c.sub, t.identidad, "identity = sub del JWT");
  assert.equal(c.iss, LK.clave);
  assert.equal(c.name, "Mirlo");
  assert.deepEqual(JSON.parse(c.metadata!), META);
  const v = c.video!;
  assert.deepEqual({ ...v }, { room: "hituelo-libre", ...ROLES.roles["hogar"] });
  assert.equal(v.canPublish, false, "sin audio ni vídeo");
  assert.equal(v.canPublishData, true);
  assert.equal(v.roomAdmin, false);
  assert.equal(v.canUpdateOwnMetadata, false);
  assert.equal(c.exp! - c.nbf!, TTL_S, "15 minutos");
  assert.ok(Math.abs(c.exp! * 1000 - (ahora + TTL_S * 1000)) < 5000);
  assert.ok(Math.abs(Date.parse(t.caduca_en) - (ahora + TTL_S * 1000)) < 5);
  // ni el id de la base ni nada parecido a un correo en el token
  const cuerpo = Buffer.from(t.token.split(".")[1]!, "base64url").toString("utf8");
  assert.ok(!/@/.test(cuerpo));
  assert.ok(!/"sub":"42"/.test(cuerpo));
  assert.ok(!cuerpo.includes(SES), "ni el id de la sesión");
});

test("un token firmado con otro secreto no se acepta", async () => {
  const t = await firmaToken(LK, 1, SES, META);
  await assert.rejects(new TokenVerifier(LK.clave, "otro-secreto-sintetico-de-32-caracteres!").verify(t.token));
});

test("identidad opaca: una por sesión (aparato) con el prefijo del hogar; estable, distinta entre hogares y dependiente del secreto", () => {
  const a = identidadOpaca(LK, 7, SES), b = identidadOpaca(LK, 7, SES), otraSesion = identidadOpaca(LK, 7, SES2), c = identidadOpaca(LK, 8, SES), d = identidadOpaca({ secreto: LK.secreto + "x" }, 7, SES);
  assert.equal(a, b, "la misma sesión, la misma identidad (dos pestañas: la segunda sustituye a la primera)");
  assert.notEqual(a, otraSesion, "otro aparato del mismo hogar NO repite identidad (LiveKit no echa al primero)");
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  for (const i of [a, otraSesion, c, d]) assert.match(i, ID_RE);
  assert.equal(a.length, 33);
  const p7 = prefijoHogar(LK, 7);
  assert.ok(a.startsWith(p7 + "_") && otraSesion.startsWith(p7 + "_"), "las dos conexiones del hogar llevan su prefijo");
  assert.ok(esDelHogar(a, p7) && esDelHogar(otraSesion, p7));
  assert.ok(!esDelHogar(c, p7), "otro hogar no casa");
  assert.ok(!esDelHogar(p7, p7) && !esDelHogar(p7 + "_corto", p7) && !esDelHogar(p7 + "_12345678x", p7), "solo el formato exacto");
  assert.ok(!a.includes("7".repeat(2)) && !a.includes(SES));
});

test("todos los roles llevan los mismos permisos de solo datos en F2 (también admin: la expulsión va por la api)", async () => {
  for (const rol of ["hogar", "guia", "corresponsal", "admin"] as const) {
    const c = await new TokenVerifier(LK.clave, LK.secreto).verify((await firmaToken(LK, 3, SES, { ...META, rol })).token);
    assert.equal(c.video!.canPublish, false, rol);
    assert.equal(c.video!.roomAdmin, false, rol);
    assert.equal(JSON.parse(c.metadata!).rol, rol);
  }
});

// ---------------------------------------------------------------- la ruta, sin base (lo que se decide antes de consultarla)
test("POST /api/presencia/token: sin Origin 403, cuerpo de más o dispositivo raro 400, sin sesión 401", async () => {
  const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
  const app = await construyeApp(contexto(bd, configDePrueba({ ...lkDevSinBase })));
  try {
    const url = "/api/presencia/token";
    assert.equal((await app.inject({ method: "POST", url, headers: { "x-forwarded-proto": "https" }, payload: { dispositivo: "quest" } })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url, headers: deLaWeb(), payload: { dispositivo: "nevera" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url, headers: deLaWeb(), payload: { dispositivo: "quest", sala: "otra" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url, headers: deLaWeb(), payload: {} })).statusCode, 400);
    const r = await app.inject({ method: "POST", url, headers: deLaWeb(), payload: { dispositivo: "quest" } });
    assert.equal(r.statusCode, 401);
    assert.equal(r.headers["cache-control"], "no-store");
  } finally { await app.close(); await bd.end(); }
});

// ---------------------------------------------------------------- configuración
const dir = mkdtempSync(join(tmpdir(), "gemelo-lk-"));
const base = { GEMELO_URL_PUBLICA: "https://gemelo.example.com", GEMELO_DB_URL: "postgresql://gemelo_api@db:5432/gemelo" };
const lkDev = { GEMELO_LIVEKIT_URL: "http://livekit:7880", GEMELO_LIVEKIT_URL_PUBLICA: "ws://localhost:7880", GEMELO_LIVEKIT_CLAVE: "devabc123", GEMELO_LIVEKIT_SECRETO: "x".repeat(32) };

test("configuración: sin GEMELO_LIVEKIT_URL la presencia está apagada; con ella, todo lo demás es obligatorio", () => {
  assert.equal(cargaConfig(base).livekit, null);
  assert.deepEqual(cargaConfig({ ...base, ...lkDev }).livekit, { url: "http://livekit:7880", urlPublica: "ws://localhost:7880", clave: "devabc123", secreto: "x".repeat(32) });
  for (const falta of ["GEMELO_LIVEKIT_URL_PUBLICA", "GEMELO_LIVEKIT_CLAVE", "GEMELO_LIVEKIT_SECRETO"]) {
    const e: Record<string, string> = { ...base, ...lkDev }; delete e[falta];
    assert.throws(() => cargaConfig(e), ErrorDeConfig, falta);
  }
  assert.throws(() => cargaConfig({ ...base, ...lkDev, GEMELO_LIVEKIT_SECRETO: "corto" }), /32/);
  assert.throws(() => cargaConfig({ ...base, ...lkDev, GEMELO_LIVEKIT_CLAVE: "devkey", GEMELO_LIVEKIT_SECRETO: "y".repeat(32) }), /devkey/);
  assert.throws(() => cargaConfig({ ...base, ...lkDev, GEMELO_LIVEKIT_URL_PUBLICA: "https://livekit.example.com" }), /wss/);
});

test("configuración en producción: wss:// y el secreto solo desde fichero", () => {
  const f = (n: string, c: string) => { const p = join(dir, n); writeFileSync(p, c + "\n"); return p; };
  const prod = {
    ...base, NODE_ENV: "production", GEMELO_DB_CLAVE_FICHERO: f("bd", "clave-sintetica"), GEMELO_SESION_SECRETO_FICHERO: f("ses", "z".repeat(40)),
    GEMELO_SMTP_HOST: "smtp.example.com", GEMELO_SMTP_USUARIO: "gemelo@example.com", GEMELO_SMTP_CLAVE_FICHERO: f("smtp", "clave-smtp"), GEMELO_CORREO_REMITENTE: "Gemelo <gemelo@example.com>",
    GEMELO_LIVEKIT_URL: "http://livekit:7880", GEMELO_LIVEKIT_URL_PUBLICA: "wss://gemelo.example.com/rtc", GEMELO_LIVEKIT_CLAVE: "APIsintetica1",
  };
  const c = cargaConfig({ ...prod, GEMELO_LIVEKIT_SECRETO_FICHERO: f("lk", "w".repeat(40)) });
  assert.equal(c.livekit?.secreto, "w".repeat(40));
  assert.equal(c.livekit?.urlPublica, "wss://gemelo.example.com/rtc");
  assert.throws(() => cargaConfig({ ...prod, GEMELO_LIVEKIT_SECRETO: "w".repeat(40) }), /fichero/);
  assert.throws(() => cargaConfig({ ...prod, GEMELO_LIVEKIT_URL_PUBLICA: "ws://gemelo.example.com/rtc", GEMELO_LIVEKIT_SECRETO_FICHERO: f("lk2", "w".repeat(40)) }), /wss/);
});

// ---------------------------------------------------------------- moderación (P3, decisión 42)
class ModeradorDePrueba implements ModeradorSala {
  llamadas: [string, string][] = [];
  private readonly presentes: Set<string>;
  constructor(presentes: Set<string>) { this.presentes = presentes; }
  async expulsaHogar(sala: string, prefijo: string) {
    this.llamadas.push([sala, prefijo]);
    let n = 0;
    for (const i of [...this.presentes]) if (esDelHogar(i, prefijo)) { this.presentes.delete(i); n++; }
    return n;
  }
}
function bdDePrueba(hogares: number[]) {
  const consultas: { sql: string; params: unknown[] }[] = [];
  const bd = {
    query: async (sql: string, params: unknown[] = []) => {
      consultas.push({ sql, params });
      if (/FROM hogares/.test(sql)) return { rowCount: hogares.includes(params[0] as number) ? 1 : 0, rows: [] };
      return { rowCount: 1, rows: [] };
    },
  };
  return { bd: bd as unknown as Pick<pg.Pool, "query">, consultas };
}

test("expulsar: saca de hituelo-libre TODAS las conexiones del hogar (una por aparato), lo apunta en la auditoría y no le da token en 15 min", async () => {
  const pc = identidadOpaca(LK, 9, "ordenador"), movil = identidadOpaca(LK, 9, "movil"), quest = identidadOpaca(LK, 9, "quest"), otro = identidadOpaca(LK, 10, "ordenador");
  const sala = new Set([pc, movil, quest, otro]);
  const mod = new ModeradorDePrueba(sala), { bd, consultas } = bdDePrueba([9]), expulsados = new Expulsados();
  const r = await expulsa({ bd, lk: LK, moderador: mod, expulsados }, 1, 9, "insultos en el chat");
  assert.deepEqual(r, { ok: true, estaba_en_sala: true, conexiones: 3 });
  assert.deepEqual(mod.llamadas, [["hituelo-libre", prefijoHogar(LK, 9)]]);
  assert.deepEqual([...sala], [otro], "el otro hogar sigue dentro");
  const aud = consultas.find(c => /INSERT INTO auditoria/.test(c.sql));
  assert.ok(aud, "queda en la auditoría");
  assert.deepEqual(aud!.params.slice(0, 2), [1, "admin.presencia_expulsado"]);
  assert.deepEqual(JSON.parse(aud!.params[2] as string), { hogar: 9, sala: "hituelo-libre", estaba: true, conexiones: 3, motivo: "insultos en el chat" });
  const ahora = Date.now();
  assert.equal(expulsados.esta(9, ahora), true);
  assert.equal(expulsados.esta(9, ahora + TTL_S * 1000 + 1000), false, "a los 15 min puede volver");
  assert.equal(expulsados.esta(10, ahora), false);
});

test("expulsar a quien no está en la sala también se apunta (estaba: false); a un hogar que no existe, 404 y nada más", async () => {
  const mod = new ModeradorDePrueba(new Set()), a = bdDePrueba([4]), e = new Expulsados();
  assert.deepEqual(await expulsa({ bd: a.bd, lk: LK, moderador: mod, expulsados: e }, 1, 4, null), { ok: true, estaba_en_sala: false, conexiones: 0 });
  assert.deepEqual(JSON.parse(a.consultas.find(c => /auditoria/.test(c.sql))!.params[2] as string), { hogar: 4, sala: "hituelo-libre", estaba: false, conexiones: 0 });
  const b = bdDePrueba([]), mod2 = new ModeradorDePrueba(new Set());
  assert.deepEqual(await expulsa({ bd: b.bd, lk: LK, moderador: mod2, expulsados: e }, 1, 77, null), { ok: false, motivo: "no_existe" });
  assert.equal(mod2.llamadas.length, 0);
  assert.ok(!b.consultas.some(c => /auditoria/.test(c.sql)));
  assert.equal(e.esta(77), false);
});

test("si LiveKit falla, el error sube (la oficina lo ve), el hogar queda sin token igualmente y no se apunta lo que no se hizo", async () => {
  const roto: ModeradorSala = { expulsaHogar: async () => { throw new Error("LiveKit no responde"); } }, e = new Expulsados(), { bd, consultas } = bdDePrueba([5]);
  await assert.rejects(expulsa({ bd, lk: LK, moderador: roto, expulsados: e }, 1, 5, null), /LiveKit/);
  assert.equal(e.esta(5), true);
  assert.ok(!consultas.some(c => /auditoria/.test(c.sql)));
});

test("POST /api/admin/presencia/expulsar: sin Origin 403, cuerpo raro 400, sin sesión 401 (y sin tocar LiveKit)", async () => {
  const pool = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
  const mod = new ModeradorDePrueba(new Set());
  const app = await construyeApp({ ...contexto(pool, configDePrueba({ ...lkDevSinBase })), moderador: mod });
  try {
    const url = "/api/admin/presencia/expulsar";
    assert.equal((await app.inject({ method: "POST", url, headers: { "x-forwarded-proto": "https" }, payload: { hogar_id: 1 } })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url, headers: deLaWeb(), payload: { hogar_id: 0 } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url, headers: deLaWeb(), payload: { hogar_id: 1, motivo: "x".repeat(201) } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url, headers: deLaWeb(), payload: { hogar_id: 1, sala: "otra" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url, headers: deLaWeb(), payload: { hogar_id: 1 } })).statusCode, 401);
    assert.equal(mod.llamadas.length, 0);
  } finally { await app.close(); await pool.end(); }
});

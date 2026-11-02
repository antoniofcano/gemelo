// OF16 (ADR-0028, decisiones 181-182) sin base de datos: una cuenta de oficina aprueba el código corto de unas gafas y la sesión que nace
// es la de un VISITANTE (rol efectivo hogar, no titular, 12 h), nunca de oficina. La app entera corre contra una base de mentira que
// responde por fragmento de SQL: la sesión de verdad nace por el sondeo (cookie firmada por @fastify/session) y el almacén la lee con la
// fila que pone cada prueba. Lo que decide el SQL de verdad (la rama del CASE, LEAST, revocar) lo comprueba la integración contra
// PostGIS: pruebas/integracion/vinculo_oficina.test.ts (escrita, se ejecuta por el banco).
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { TokenVerifier } from "livekit-server-sdk";
import type pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { AlmacenPg, rolEfectivo } from "../../src/auth/almacen.ts";
import { ROLES } from "../../src/auth/servicio.ts";
import { ALIAS_OFICINA } from "../../src/presencia/livekit.ts";
import { papelDe, puedeGuiar, puedeModerar } from "../../src/presencia/voz.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const LK_ENV = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "ws://localhost:7880", GEMELO_LIVEKIT_CLAVE: "devprueba16", GEMELO_LIVEKIT_SECRETO: "v".repeat(32) };
const HORA = 3_600_000;
const SONDEO = "s".repeat(43);   // forma de un token (PATRON_TOKEN); la base de mentira no lo mira

type Fila = Record<string, unknown>;
const consultas: Array<{ sql: string; params: unknown[] }> = [];
let rolCuenta = "oficina";           // el rol de la cuenta que aprobó el código (lo devuelve el sondeo)
let filaSesion: Fila | null = null;  // lo que el almacén lee de `sesiones JOIN hogares` (null: no hay sesión viva)

const bd = {
  query: async (sql: string, params: unknown[] = []) => {
    consultas.push({ sql, params });
    if (/UPDATE codigos_vinculo c SET usado_en/.test(sql)) return { rowCount: 1, rows: [{ hogar_id: 5, normas_version: 1, rol: rolCuenta }] };
    if (/UPDATE codigos_vinculo SET hogar_id/.test(sql)) return { rowCount: 1, rows: [] };
    if (/FROM sesiones s JOIN hogares h/.test(sql)) return { rowCount: filaSesion ? 1 : 0, rows: filaSesion ? [filaSesion] : [] };
    if (/FROM hogares g LEFT JOIN avatares/.test(sql)) return { rowCount: 1, rows: [{ alias: "Mirlo", camisa: null, sombrero: null, piel: null, vrm: null, aspecto: null }] };
    return { rowCount: 0, rows: [] };
  },
};

/** La fila de una sesión tal como la da el SELECT de `lee()` (columnas de la cuenta, sin el rol efectivo). */
function fila(o: Fila): Fila {
  return {
    sid: 11, hogar_id: 5, rol: "oficina", alias: "Mirlo", alias_visible: false, normas_version: 1, origen: "vinculo",
    expira_en: new Date(Date.now() + 12 * HORA), refrescar: false, aparato_id: null, aparato_aprobado: false,
    confirmada_en: null, confirmacion_vigente: false, llave_id: null, ...o,
  };
}
/** Las gafas de una cuenta de oficina, ya con su sesión (lo que el SQL deja pasar: origen vinculo, sin aparato). */
const GAFAS_OFICINA = { rol: "oficina", origen: "vinculo" };
/** Una sesión de oficina de siempre: PC con enlace, aparato aprobado y confirmación reciente. */
const PC_OFICINA = { rol: "oficina", origen: "enlace", aparato_id: 3, aparato_aprobado: true, confirmada_en: new Date(), confirmacion_vigente: true };

let app: FastifyInstance;
let cookie = "";
before(async () => {
  app = await construyeApp(contexto(bd as unknown as pg.Pool, configDePrueba(LK_ENV)));
  await app.ready();
});
after(async () => { await app.close(); });
beforeEach(() => { consultas.length = 0; });

/** Las gafas sondean un código ya aprobado por una cuenta de `rol`: nace su sesión. Devuelve la cookie y lo que se guardó en `sesiones`. */
async function gafasEntran(rol: string) {
  rolCuenta = rol;
  filaSesion = null;
  const r = await app.inject({ method: "POST", url: "/api/auth/vincula/sondeo", headers: deLaWeb(), payload: { sondeo: SONDEO } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().estado, "aprobado");
  const sc = ([] as string[]).concat(r.headers["set-cookie"] ?? []).find(c => c.startsWith("__Host-gemelo="));
  assert.ok(sc, "las gafas reciben su cookie de sesión");
  const ins = consultas.find(c => /INSERT INTO sesiones/.test(c.sql));
  assert.ok(ins, "la sesión se guarda");
  const caducaCookie = Date.parse(/Expires=([^;]+)/i.exec(sc)?.[1] ?? "");
  consultas.length = 0;
  return { cookie: sc.split(";")[0]!, expira: ins.params[2] as Date, origen: ins.params[3], aparato: ins.params[4], caducaCookie };
}
/** ¿Está `t` (ms) a `horas` de ahora, con un margen de un minuto? */
const aHoras = (t: number, horas: number) => Math.abs(t - Date.now() - horas * HORA) < 60_000;
const pide = (method: "GET" | "POST" | "DELETE", url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { ...deLaWeb(), cookie }, ...(payload !== undefined ? { payload: payload as object } : {}) });

test("rolEfectivo: unas gafas (vinculo) de oficina o admin cuentan como hogar; nada más cambia", () => {
  assert.equal(rolEfectivo("oficina", "vinculo"), "hogar");
  assert.equal(rolEfectivo("admin", "vinculo"), "hogar");
  for (const r of ROLES) assert.equal(rolEfectivo(r, "enlace"), r, r + " por enlace no cambia");
  for (const r of ["hogar", "guia", "corresponsal"] as const) assert.equal(rolEfectivo(r, "vinculo"), r, r + " por vínculo no cambia");
});

test("el almacén: el SQL tiene la rama de las gafas de oficina (12 h desde creada_en y la inactividad más corta) y la de oficina sigue exigiendo aparato y enlace", async () => {
  const pedidas: string[] = [];
  const falsa = { query: async (sql: string) => { pedidas.push(sql); return { rowCount: 1, rows: [fila(GAFAS_OFICINA)] }; } };
  const almacen = new AlmacenPg(falsa as never, 7, { horasSesion: 12, minInactividad: 120, minConfirmacion: 15 });
  const s = await new Promise<Record<string, unknown> | null | undefined>((ok, mal) => almacen.get("id-de-prueba", (e, x) => (e ? mal(e) : ok(x as never))));
  assert.ok(s);
  assert.equal(s.rol, "hogar", "rol efectivo");
  assert.equal(s.origen, "vinculo");
  for (const k of ["aparatoId", "aparatoAprobado", "confirmadaEn", "confirmacionVigente", "llaveId", "llaveRequerida"]) assert.equal(k in s, false, "nada de oficina: " + k);
  const sql = pedidas[0]!.replace(/\s+/g, " ");
  assert.match(sql, /CASE WHEN h\.rol::text IN \('oficina', 'admin'\) AND s\.origen = 'vinculo' THEN s\.creada_en > now\(\) - make_interval\(hours => \$3\) AND s\.ultima_actividad_en > now\(\) - LEAST\(make_interval\(mins => \$4\), make_interval\(days => \$2\)\)/);
  assert.match(sql, /WHEN h\.rol::text IN \('oficina', 'admin'\) THEN a\.id IS NOT NULL AND \(s\.origen = 'enlace' OR \(s\.origen = 'llave' AND l\.id IS NOT NULL\)\)/, "la sesión de oficina sigue exigiendo su aparato (también la de llave, OF13b-5)");
});

test("el almacén: la sesión de oficina por enlace con su aparato sigue cargando lo de oficina", async () => {
  const falsa = { query: async () => ({ rowCount: 1, rows: [fila(PC_OFICINA)] }) };
  const almacen = new AlmacenPg(falsa as never, 7, { horasSesion: 12, minInactividad: 120, minConfirmacion: 15 });
  const s = await new Promise<Record<string, unknown> | null | undefined>((ok, mal) => almacen.get("x", (e, x) => (e ? mal(e) : ok(x as never))));
  assert.equal(s!.rol, "oficina");
  assert.equal(s!.aparatoId, 3);
  assert.equal(s!.aparatoAprobado, true);
  assert.equal(s!.confirmacionVigente, true);
});

test("la oficina aprueba el código de unas gafas: 204, la auditoría dice «como visitante» y no guarda ni el código ni el correo", async () => {
  ({ cookie } = await gafasEntran("oficina"));   // una cookie cualquiera; la sesión que cuenta es la fila de abajo
  filaSesion = fila(PC_OFICINA);
  const r = await pide("POST", "/api/yo/dispositivos/vincular", { codigo: "k7q-4m2", aprobar: true });
  assert.equal(r.statusCode, 204, r.body);
  const dec = consultas.find(c => /UPDATE codigos_vinculo SET hogar_id/.test(c.sql));
  assert.ok(dec, "se aprueba el código");
  assert.equal(dec.params[1], 5, "con el hogar de la cuenta de oficina");
  const aud = consultas.find(c => /INSERT INTO auditoria/.test(c.sql) && c.params[1] === "vinculo.aprobado");
  assert.ok(aud, "queda en la auditoría");
  assert.deepEqual(JSON.parse(aud.params[2] as string), { como: "visitante" });
  const todo = JSON.stringify(consultas.filter(c => /auditoria/.test(c.sql)).map(c => c.params));
  assert.doesNotMatch(todo, /K7Q|k7q|4M2|@/i, "ni el código ni un correo en la auditoría");
});

test("unas gafas vinculadas (de oficina o de familia) no aprueban el código de otras: 403 solo_titular y no se toca el código", async () => {
  for (const rol of ["oficina", "hogar"]) {
    filaSesion = fila({ ...GAFAS_OFICINA, rol });
    consultas.length = 0;
    const r = await pide("POST", "/api/yo/dispositivos/vincular", { codigo: "K7Q-4M2", aprobar: true });
    assert.equal(r.statusCode, 403, rol + ": " + r.body);
    assert.equal(r.json().error, "solo_titular");
    assert.ok(!consultas.some(c => /UPDATE codigos_vinculo/.test(c.sql)), rol + ": no toca el código");
  }
});

test("una sesión de oficina con el aparato pendiente sigue sin poder aprobar (403 aparato_pendiente)", async () => {
  filaSesion = fila({ ...PC_OFICINA, aparato_aprobado: false });
  const r = await pide("POST", "/api/yo/dispositivos/vincular", { codigo: "K7Q-4M2", aprobar: true });
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().error, "aparato_pendiente");
  assert.ok(!consultas.some(c => /UPDATE codigos_vinculo/.test(c.sql)), "no toca el código");
});

test("las gafas de la oficina nacen con 12 h de vida (cookie y expira_en), origen vinculo y sin aparato", async () => {
  for (const rol of ["oficina", "admin"]) {
    const g = await gafasEntran(rol);
    assert.equal(g.origen, "vinculo");
    assert.equal(g.aparato, null, "sin aparato de oficina");
    assert.ok(aHoras(g.caducaCookie, 12), rol + ": la cookie caduca a las 12 h");
    assert.ok(aHoras(g.expira.getTime(), 12), rol + ": expira_en a 12 h, no a 30 días");
  }
});

test("las gafas de una familia no cambian: 30 días", async () => {
  for (const rol of ["hogar", "guia", "corresponsal"]) {
    const g = await gafasEntran(rol);
    assert.ok(aHoras(g.expira.getTime(), 30 * 24), rol + ": expira_en a 30 días");
    assert.ok(aHoras(g.caducaCookie, 30 * 24), rol + ": la cookie, a 30 días");
  }
});

test("las gafas de la oficina: GET /api/sesion da rol hogar y titular false", async () => {
  ({ cookie } = await gafasEntran("oficina"));
  for (const rol of ["oficina", "admin"]) {
    filaSesion = fila({ ...GAFAS_OFICINA, rol });
    const r = await pide("GET", "/api/sesion");
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual({ rol: r.json().rol, titular: r.json().titular }, { rol: "hogar", titular: false }, rol);
  }
});

test("las gafas de la oficina NO pasan ninguna guarda de oficina ni de admin (403), ni la autorización de /oficina/", async () => {
  ({ cookie } = await gafasEntran("admin"));
  for (const rol of ["oficina", "admin"]) {
    filaSesion = fila({ ...GAFAS_OFICINA, rol });
    const rutas: Array<["GET" | "POST" | "DELETE", string, unknown?]> = [
      ["GET", "/api/oficina/sesion"], ["GET", "/api/admin/aparatos"], ["GET", "/api/admin/hogares"], ["GET", "/api/admin/hogares/5/sesiones"],
      ["POST", "/api/admin/hogares/5/revocar", {}], ["POST", "/api/admin/aparatos/3/aprobar", {}], ["DELETE", "/api/admin/sesiones/11"],
      ["GET", "/api/admin/bandeja/resumen"], ["GET", "/api/oficina/llaves"], ["POST", "/api/oficina/confirmar", {}],
    ];
    for (const [m, url, p] of rutas) {
      const r = await pide(m, url, p);
      assert.ok(r.statusCode === 403 || r.statusCode === 401, rol + " " + m + " " + url + " → " + r.statusCode + " " + r.body);
    }
    const auto = await app.inject({ method: "GET", url: "/api/interno/autoriza?para=oficina", headers: { cookie, "x-forwarded-proto": "https" } });
    assert.equal(auto.statusCode, 403, "/oficina/ cerrada a las gafas");
    const mundo = await app.inject({ method: "GET", url: "/api/interno/autoriza", headers: { cookie, "x-forwarded-proto": "https" } });
    assert.equal(mundo.statusCode, 204, "el mundo sí (como cualquier visitante)");
    // /api/oficina/pendiente: sin poderes de oficina, a la portada
    const pend = await pide("GET", "/api/oficina/pendiente");
    assert.deepEqual([pend.statusCode, pend.headers.location], [303, "/"]);
  }
  assert.ok(!consultas.some(c => /UPDATE sesiones SET revocada_en|UPDATE aparatos_oficina/.test(c.sql)), "ninguna ruta de oficina llegó a hacer nada");
});

test("el token de LiveKit de las gafas de la oficina lleva rol hogar y su alias, no «Oficina» (sin chaleco)", async () => {
  ({ cookie } = await gafasEntran("oficina"));
  const verifica = new TokenVerifier(LK_ENV.GEMELO_LIVEKIT_CLAVE, LK_ENV.GEMELO_LIVEKIT_SECRETO);
  for (const rol of ["oficina", "admin"]) {
    filaSesion = fila({ ...GAFAS_OFICINA, rol });
    const r = await pide("POST", "/api/presencia/token", { dispositivo: "quest" });
    assert.equal(r.statusCode, 200, r.body);
    const meta = JSON.parse((await verifica.verify(r.json().token)).metadata!);
    assert.equal(meta.rol, "hogar", rol);
    assert.notEqual(meta.alias, ALIAS_OFICINA, rol);
    assert.equal(meta.alias, "Mirlo");
  }
  // y la oficina de verdad, en su PC, sigue con su rol y su alias «Oficina»
  filaSesion = fila(PC_OFICINA);
  const r = await pide("POST", "/api/presencia/token", { dispositivo: "escritorio" });
  assert.equal(r.statusCode, 200, r.body);
  const meta = JSON.parse((await verifica.verify(r.json().token)).metadata!);
  assert.deepEqual([meta.rol, meta.alias], ["oficina", ALIAS_OFICINA]);
});

test("la sesión de oficina de siempre (enlace + aparato) sigue igual: rol oficina, titular, pasa /oficina/", async () => {
  ({ cookie } = await gafasEntran("oficina"));
  filaSesion = fila(PC_OFICINA);
  const s = await pide("GET", "/api/sesion");
  assert.deepEqual({ rol: s.json().rol, titular: s.json().titular }, { rol: "oficina", titular: true });
  const auto = await app.inject({ method: "GET", url: "/api/interno/autoriza?para=oficina", headers: { cookie, "x-forwarded-proto": "https" } });
  assert.equal(auto.statusCode, 204);
});

test("voz: las gafas de la cuenta de oficina que GUÍA un evento no heredan el papel de guía ni moderan; la cuenta en su PC, sí", () => {
  const e = { guia_id: 5 };
  // las gafas: rol efectivo hogar → ni guía ni oficina; sin apuntarse, ni siquiera entran
  const gafas = { hogarId: 5, esOficina: false, apuntado: false, puedeGuiar: puedeGuiar("hogar") };
  assert.equal(papelDe(e, gafas), null);
  assert.equal(puedeModerar(e, gafas), false);
  assert.equal(papelDe(e, { ...gafas, apuntado: true }), "familia", "apuntada, como cualquier familia");
  // la misma cuenta desde su PC (rol oficina) o una cuenta de guía (también sus gafas: rol guia), como siempre
  for (const rol of ["oficina", "admin", "guia"] as const) {
    const q = { hogarId: 5, esOficina: rol !== "guia", apuntado: false, puedeGuiar: puedeGuiar(rol) };
    assert.equal(papelDe(e, q), "guia", rol);
    assert.equal(puedeModerar(e, q), true, rol);
  }
  // sin el campo (llamadas de antes), igual que siempre
  assert.equal(papelDe(e, { hogarId: 5, esOficina: false, apuntado: false }), "guia");
  assert.equal(puedeGuiar(undefined), false);
});

test("las gafas de una familia no cambian: rol de la cuenta, titular false", async () => {
  ({ cookie } = await gafasEntran("hogar"));
  for (const rol of ["hogar", "guia", "corresponsal"]) {
    filaSesion = fila({ rol, origen: "vinculo" });
    const s = await pide("GET", "/api/sesion");
    assert.deepEqual({ rol: s.json().rol, titular: s.json().titular }, { rol, titular: false }, rol);
  }
});

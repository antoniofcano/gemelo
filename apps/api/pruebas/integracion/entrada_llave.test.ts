// Integración de la ENTRADA con llave sin sesión ni correo (OF13b-5, ADR-0029, contratos/sesion.md § Entrar con llave) contra PostGIS
// en un contenedor, con el rol de la api (gemelo_api), la app entera y un autenticador simulado (pruebas/apoyo/autenticador.ts) frente a
// la verificación real de @simplewebauthn/server. Comprueba lo que la base de mentira de la unidad (pruebas/unidad/entrada_llave.test.ts)
// no puede: el CASE de validez de `lee()` (origen 'llave' en familia y oficina, aparato pendiente, llave revocada), la restricción
// `sesiones_origen_check` de la 0021 con 'llave', `llave_id` y `confirmada_en` guardados, la rotación (la sesión vieja revocada en la
// base) y que el enlace pide UNA sola sentencia exista o no la cuenta (el CTE de creaEnlace contra la base de verdad).
// Sin Docker se SALTA con aviso. Escrita a ciegas en OF13b-5; ejecutada por el banco el 2026-11-03 (la preparación
// insertaba normas_version sin normas_aceptadas_en, que la 0002 no admite).
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { COOKIE_RETO, FALLO_LLAVE, TEXTO_ACEPTADO } from "../../src/auth/rutas.ts";
import { creaEnlace } from "../../src/auth/servicio.ts";
import { opcionesDeAlta, registraLlave, usuarioDeLlave, verificaAlta } from "../../src/oficina/llaves.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { AutenticadorFalso, type OpcionesFalsas } from "../apoyo/autenticador.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb, ORIGEN } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la entrada con llave sin sesión (OF13b-5) con PostGIS NO se ha comprobado";
const CFG = configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria" });
const FAM = "familia-entrada@example.com", OFI = "ofi-entrada@example.com";
let bd: BdDePrueba;
let app: FastifyInstance;
let ctx: ReturnType<typeof contexto>;
const ids: Record<string, number> = {};
const sesionDeAlta: Record<string, number> = {};
let n = 0;
const ip = () => "203.0.113." + (++n % 250 + 1);

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[FAM, "hogar"], [OFI, "oficina"]] as const) {
    const id = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol, normas_version, normas_aceptadas_en) VALUES ($1, $2, 1, now()) RETURNING id", [c, rol])).rows[0]!.id);
    ids[c] = id;
    sesionDeAlta[c] = Number((await bd.dueno.query<{ id: number }>(
      "INSERT INTO sesiones (hogar_id, hash, expira_en, origen) VALUES ($1, $2, now() + interval '1 day', 'enlace') RETURNING id", [id, randomBytes(32)])).rows[0]!.id);
  }
  ctx = contexto(bd.app, CFG);
  app = await construyeApp(ctx);
  await app.ready();
}, { timeout: 240_000 });

after(async () => { if (!SALTO) { await app?.close(); await bd?.cierra(); } });   // si before cayó a medias, no se tapa su error con otro

const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };
const galleta = (r: LightMyRequestResponse, nombre: string) => ([] as string[]).concat(r.headers["set-cookie"] ?? []).find(c => c.startsWith(nombre + "="));
const valor = (c: string | undefined) => c?.split(";")[0]!;

async function daDeAlta(correo: string): Promise<AutenticadorFalso> {
  const a = new AutenticadorFalso(ORIGEN);
  const cuenta = await usuarioDeLlave(bd.app, ids[correo]!);
  assert.ok(cuenta);
  const op = await opcionesDeAlta(CFG.llave, cuenta, []);
  const v = await verificaAlta(CFG.llave, a.alta(op) as never, op.challenge);
  assert.ok(v.ok);
  const r = await registraLlave(bd.app, { hogarId: ids[correo]!, sesionId: sesionDeAlta[correo]!, sesion: { origen: "enlace", conLlave: true, aparatoAprobado: true }, llave: v.llave, nombre: "Prueba", aparatoId: null });
  assert.ok(r.ok, JSON.stringify(r));
  return a;
}
async function entraCon(a: AutenticadorFalso, o: OpcionesFalsas = {}, cookieExtra = "") {
  const op = await app.inject({ method: "POST", url: "/api/auth/llave/opciones", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: {} });
  assert.equal(op.statusCode, 200, op.body);
  const reto = valor(galleta(op, COOKIE_RETO))!;
  return app.inject({ method: "POST", url: "/api/auth/llave", headers: deLaWeb({ "x-forwarded-for": ip(), cookie: reto + (cookieExtra ? "; " + cookieExtra : "") }), payload: { respuesta: a.entrada(op.json(), o) } });
}
const pide = (cookie: string, url: string) => app.inject({ method: "GET", url, headers: deLaWeb({ cookie, "x-forwarded-for": ip() }) });

test("familia: entra con la llave; la fila de la sesión cumple la 0021 (origen llave, llave_id), titular, y la sesión vieja queda revocada", async t => {
  if (salta(t)) return;
  const a = await daDeAlta(FAM);
  const primera = await entraCon(a);
  assert.equal(primera.statusCode, 200, primera.body);
  const c1 = valor(galleta(primera, "__Host-gemelo"))!;
  const r = await entraCon(a, {}, c1);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { ok: true, destino: "/finca/", primer_acceso: false });
  const c2 = valor(galleta(r, "__Host-gemelo"))!;
  assert.notEqual(c2, c1);
  assert.equal((await pide(c1, "/api/sesion")).statusCode, 401, "la sesión que traía el navegador se revoca (rotación)");
  const s = await pide(c2, "/api/sesion");
  assert.equal(s.statusCode, 200, s.body);
  assert.deepEqual({ titular: s.json().titular, entrada: s.json().entrada }, { titular: true, entrada: "llave" });
  const f = (await bd.dueno.query("SELECT origen, llave_id, aparato_id, expira_en - creada_en > interval '29 days' AS treinta FROM sesiones WHERE hogar_id = $1 ORDER BY id DESC LIMIT 1", [ids[FAM]])).rows[0];
  assert.equal(f.origen, "llave"); assert.ok(f.llave_id); assert.equal(f.aparato_id, null); assert.equal(f.treinta, true);
  // quitar la llave cierra la sesión (y, aunque no la cerrara, el CASE ya no la daría por buena sin su llave viva)
  await bd.dueno.query("UPDATE llaves_acceso SET revocada_en = now() WHERE id = $1", [f.llave_id]);
  assert.equal((await pide(c2, "/api/sesion")).statusCode, 401, "sin su llave viva, la sesión de llave no vale (lee())");
  await bd.dueno.query("UPDATE llaves_acceso SET revocada_en = NULL WHERE id = $1", [f.llave_id]);
  const au = (await bd.dueno.query("SELECT detalle::text AS d FROM auditoria WHERE accion = 'sesion.entrada_llave' AND hogar_id = $1", [ids[FAM]])).rows;
  assert.equal(au.length, 2);
  assert.ok(au.every(x => !x.d.includes(a.id) && !x.d.includes("@")));
});

test("oficina: aparato nuevo → pendiente (no entra), otra llave no lo aprueba; aprobado (consola) → 12 h, confirmada, /oficina/ abierta", async t => {
  if (salta(t)) return;
  const a = await daDeAlta(OFI);
  const r = await entraCon(a);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().aparato, "pendiente");
  const aparato = valor(galleta(r, "__Host-gemelo-aparato"))!;
  assert.ok(aparato);
  const c = valor(galleta(r, "__Host-gemelo"))!;
  assert.equal((await pide(c, "/api/sesion")).json().error, "aparato_pendiente");
  assert.equal((await pide(c, "/api/admin/aparatos")).statusCode, 403);
  // pasados los 5 min, otra entrada con llave sigue sin aprobarlo (decisión 184)
  await bd.dueno.query("UPDATE aparatos_oficina SET creado_en = now() - interval '10 minutes' WHERE hash = $1", [hashToken(aparato.split("=")[1]!)]);
  const r2 = await entraCon(a, {}, aparato);
  assert.equal(r2.json().aparato, "pendiente");
  assert.equal((await bd.dueno.query("SELECT aprobado_en FROM aparatos_oficina WHERE hash = $1", [hashToken(aparato.split("=")[1]!)])).rows[0].aprobado_en, null);
  // se aprueba por la consola (RUNBOOK-VPS 10) y desde entonces la llave sola entra
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(aparato.split("=")[1]!)]);
  const r3 = await entraCon(a, {}, aparato);
  assert.deepEqual(r3.json(), { ok: true, destino: "/oficina/", primer_acceso: false, aparato: "aprobado" });
  const c3 = valor(galleta(r3, "__Host-gemelo"))!;
  assert.equal((await pide(c3, "/api/sesion")).statusCode, 200);
  const o = await pide(c3, "/api/oficina/sesion");
  assert.equal(o.json().confirmacion_vigente, true, "la llave es la confirmación reciente");
  assert.equal((await pide(c3, "/api/admin/aparatos")).statusCode, 200);
  const f = (await bd.dueno.query("SELECT origen, confirmada_en IS NOT NULL AS conf, expira_en - creada_en <= interval '12 hours 1 minute' AS doce FROM sesiones WHERE hogar_id = $1 ORDER BY id DESC LIMIT 1", [ids[OFI]])).rows[0];
  assert.deepEqual(f, { origen: "llave", conf: true, doce: true });
});

test("el fallo es el mismo 401 y no deja sesión: credencial desconocida, userHandle ajeno, reto reutilizado", async t => {
  if (salta(t)) return;
  const a = await daDeAlta(FAM);
  const ajena = new AutenticadorFalso(ORIGEN);
  const antes = Number((await bd.dueno.query("SELECT count(*) AS n FROM sesiones")).rows[0].n);
  const r1 = await entraCon(ajena);
  const r2 = await entraCon(a, { userHandle: randomBytes(32).toString("base64url") });
  const op = await app.inject({ method: "POST", url: "/api/auth/llave/opciones", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: {} });
  const reto = valor(galleta(op, COOKIE_RETO))!;
  const resp = a.entrada(op.json());
  const bien = await app.inject({ method: "POST", url: "/api/auth/llave", headers: deLaWeb({ "x-forwarded-for": ip(), cookie: reto }), payload: { respuesta: resp } });
  assert.equal(bien.statusCode, 200);
  const r3 = await app.inject({ method: "POST", url: "/api/auth/llave", headers: deLaWeb({ "x-forwarded-for": ip(), cookie: reto }), payload: { respuesta: a.entrada(op.json()) } });
  for (const r of [r1, r2, r3]) { assert.equal(r.statusCode, 401); assert.deepEqual(r.json(), FALLO_LLAVE); assert.equal(galleta(r, "__Host-gemelo"), undefined); }
  assert.equal(Number((await bd.dueno.query("SELECT count(*) AS n FROM sesiones")).rows[0].n), antes + 1, "solo la buena abrió sesión");
});

test("pedir enlace contra la base de verdad: el CTE guarda token y auditoría con cuenta y nada sin ella; mismo 202", async t => {
  if (salta(t)) return;
  const antes = Number((await bd.dueno.query("SELECT count(*) AS n FROM tokens_acceso")).rows[0].n);
  assert.equal(await creaEnlace(bd.app, "nadie-entrada@example.com", 15), null);
  assert.equal(Number((await bd.dueno.query("SELECT count(*) AS n FROM tokens_acceso")).rows[0].n), antes, "sin cuenta, nada");
  const e = await creaEnlace(bd.app, FAM, 15);
  assert.ok(e); assert.equal(e.hogarId, ids[FAM]);
  const tk = (await bd.dueno.query("SELECT expira_en - creado_en AS dura FROM tokens_acceso WHERE hash = $1", [hashToken(e.token)])).rows[0];
  assert.ok(tk, "el SHA-256 del token");
  assert.equal(Number((await bd.dueno.query("SELECT count(*) AS n FROM auditoria WHERE accion = 'enlace.pedido' AND hogar_id = $1", [ids[FAM]])).rows[0].n), 1);
  const con = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo: FAM } });
  const sin = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo: "nadie-entrada@example.com" } });
  assert.deepEqual([con.statusCode, sin.statusCode], [202, 202]);
  assert.equal(con.body, sin.body); assert.deepEqual(con.json(), { mensaje: TEXTO_ACEPTADO });
  await new Promise(r => setImmediate(r));
  assert.equal(ctx.cartero.ultimoPara(FAM)?.asunto, "Tu enlace para entrar");
});

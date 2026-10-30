// Integración de la configuración versionada (migración 0006, C6/OF6) contra PostGIS en un contenedor (la misma imagen que
// producción): permisos (hogar no, admin sí), validación de límites (las gafas no suben), estados (borrador → prueba →
// publicada → retirada), «en prueba» solo para la oficina (decisión 113), volver = copia nueva, nada se reescribe ni se borra
// (también desde la base), auditoría y el fichero para el hornero. Datos SINTÉTICOS (correos @example.com). Sin Docker se SALTA.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { CONTRATOS } from "../apoyo/esquemas.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la integración de la configuración con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>, carpeta: string;
const ADMIN = "admin-config@example.com", OFI = "oficina-config@example.com", ANA = "ana-config@example.com";
const ids: Record<string, number> = {};
const EJEMPLO = JSON.parse(readFileSync(CONTRATOS + "config-ejemplo.json", "utf8")) as Record<string, any>;
let ipN = 0;

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[ADMIN, "admin"], [OFI, "oficina"], [ANA, "hogar"]] as const)
    ids[c] = (await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id;
  carpeta = mkdtempSync(join(tmpdir(), "gemelo-config-"));
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000", GEMELO_CONFIG_SALIDA: join(carpeta, "config.json") }));
  app = await construyeApp(ctx);
  await app.ready();
}, { timeout: 240_000 });

after(async () => {
  if (SALTO) return;
  await app.close(); await bd.cierra();
  rmSync(carpeta, { recursive: true, force: true });
});

const ip = () => "198.51.100." + (++ipN % 250);
const cookieDe = (r: LightMyRequestResponse) => /^__Host-gemelo=([^;]+)/.exec(([] as string[]).concat(r.headers["set-cookie"] ?? []).find(c => c.startsWith("__Host-gemelo=")) ?? "")?.[1] ?? null;
async function entra(correo: string): Promise<string> {
  await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")![1]!;
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/json", "x-forwarded-for": ip() }), payload: { t } });
  assert.equal(r.statusCode, 200, r.body);
  // una cuenta de oficina entra desde un aparato nuevo (pendiente, ADR-0024): se aprueba desde la consola, como el arranque del RUNBOOK
  if (correo !== ANA) await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE aprobado_en IS NULL AND hogar_id = $1", [ids[correo]]);
  return cookieDe(r)!;
}
const con = (method: "GET" | "POST", url: string, cookie: string | null, payload?: object, extra: Record<string, string> = {}) =>
  app.inject({ method, url, headers: deLaWeb({ ...(cookie ? { cookie: "__Host-gemelo=" + cookie } : {}), "x-forwarded-for": ip(), ...extra }), ...(payload ? { payload } : {}) });
const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };
const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const auditado = async (accion: string) => (await bd.dueno.query("SELECT detalle FROM auditoria WHERE accion = $1 ORDER BY id", [accion])).rows.map(r => r.detalle);

test("0006: la tabla, sus índices únicos y que gemelo_api no puede borrar", async t => {
  if (salta(t)) return;
  const cols = (await bd.dueno.query<{ c: string }>("SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'config_versiones'")).rows.map(r => r.c);
  for (const c of ["version", "estado", "cuerpo", "nota", "autor_id", "copia_de", "creada_en", "estado_en", "estado_por"]) assert.ok(cols.includes(c), c);
  await assert.rejects(bd.app.query("DELETE FROM config_versiones"), /permission|permiso/);
});

test("permisos: sin sesión 401; un hogar lee /api/config pero no toca /api/admin/config (403)", async t => {
  if (salta(t)) return;
  assert.equal((await con("GET", "/api/config", null)).statusCode, 401);
  const ana = await entra(ANA);
  const r = await con("GET", "/api/config", ana);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { version: null, estado: null, desde: null, config: { v: 1 } }, "sin nada publicado, { v: 1 } (el motor sigue con el código)");
  assert.equal((await con("GET", "/api/admin/config", ana)).statusCode, 403);
  assert.equal((await con("POST", "/api/admin/config", ana, { cuerpo: { v: 1 } })).statusCode, 403);
  assert.equal((await con("POST", "/api/admin/config/1/publicar", ana)).statusCode, 403);
  const ofi = await entra(OFI);
  assert.equal((await con("GET", "/api/config", ofi)).statusCode, 200, "la oficina lee la configuración");
  assert.equal((await con("GET", "/api/admin/config", ofi)).statusCode, 403, "pero tocarla es solo de admin (decisión 111)");
  assert.equal((await con("POST", "/api/admin/config", ofi, { cuerpo: { v: 1 } })).statusCode, 403);
});

test("publicar y volver piden confirmación reciente (403 confirmacion_requerida sin ella)", async t => {
  if (salta(t)) return;
  const adm = await entra(ADMIN);
  const v = (await con("POST", "/api/admin/config", adm, { cuerpo: { v: 1 } })).json().version as number;
  assert.equal((await con("POST", `/api/admin/config/${v}/prueba`, adm)).statusCode, 200);
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() - interval '1 day' WHERE hogar_id = $1", [ids[ADMIN]]);
  const r = await con("POST", `/api/admin/config/${v}/publicar`, adm);
  assert.equal(r.statusCode, 403, r.body); assert.equal(r.json().error, "confirmacion_requerida");
  assert.equal((await con("POST", `/api/admin/config/${v}/volver`, adm)).statusCode, 403);
  assert.equal((await con("POST", `/api/admin/config/${v}/retirar`, adm)).statusCode, 200, "descartar una prueba no la pide");
});

test("validación: fuera de límites, gafas por encima del código, umbrales incoherentes y épocas con hueco se rechazan (400)", async t => {
  if (salta(t)) return;
  const adm = await entra(ADMIN), cuantas = async () => (await bd.dueno.query("SELECT count(*)::int AS n FROM config_versiones")).rows[0].n as number, antes = await cuantas();
  const malos = [
    (c: any) => { c.escalera.triangulos.gafas[0] = 380001; },
    (c: any) => { c.escalera.umbralesPx.e0 = 5000; },
    (c: any) => { c.escalera.umbralesPx = { e0: 700, e1: 600, e2: 90 }; },
    (c: any) => { c.epocas.comun.verde.hasta = "09-01"; },
    (c: any) => { c.v = 2; },
  ];
  for (const f of malos) {
    const c = copia(EJEMPLO); f(c);
    const r = await con("POST", "/api/admin/config", adm, { cuerpo: c });
    assert.equal(r.statusCode, 400, r.body);
    assert.equal(r.json().error, "config_no_valida");
    assert.ok(Array.isArray(r.json().detalles) && r.json().detalles.length > 0);
  }
  assert.equal((await con("POST", "/api/admin/config", adm, { cuerpo: EJEMPLO, nota: "x".repeat(501) })).statusCode, 400, "nota demasiado larga");
  assert.equal(await cuantas(), antes, "nada se guardó");
});

test("estados: borrador → en prueba (solo la oficina la ve) → publicada (todos); volver publica una copia; nada se reescribe", async t => {
  if (salta(t)) return;
  const adm = await entra(ADMIN), ana = await entra(ANA), ofi = await entra(OFI);
  const v1 = (await con("POST", "/api/admin/config", adm, { cuerpo: EJEMPLO, nota: "primera" })).json().version as number;
  assert.equal((await con("POST", `/api/admin/config/${v1}/publicar`, adm)).statusCode, 409, "un borrador no se publica sin pasar por prueba");
  assert.equal((await con("GET", "/api/config", adm)).json().version, null, "un borrador no lo ve nadie");

  assert.equal((await con("POST", `/api/admin/config/${v1}/prueba`, adm)).statusCode, 200);
  assert.equal((await con("GET", "/api/config", adm)).json().estado, "en_prueba", "la oficina ve la prueba");
  assert.equal((await con("GET", "/api/config", ofi)).json().estado, "en_prueba", "también el rol oficina");
  assert.deepEqual((await con("GET", "/api/config", ana)).json().config, { v: 1 }, "un hogar, no");

  const p = await con("POST", `/api/admin/config/${v1}/publicar`, adm);
  assert.equal(p.statusCode, 200, p.body);
  const vista = await con("GET", "/api/config", ana);
  assert.equal(vista.json().version, v1); assert.equal(vista.json().estado, "publicada");
  assert.deepEqual(vista.json().config, EJEMPLO);
  assert.equal(vista.headers["etag"], `"cfg-${v1}-publicada"`);
  assert.equal((await con("GET", "/api/config", ana, undefined, { "if-none-match": `"cfg-${v1}-publicada"` })).statusCode, 304);
  assert.deepEqual(JSON.parse(readFileSync(join(carpeta, "config.json"), "utf8")), EJEMPLO, "la publicada queda en GEMELO_CONFIG_SALIDA para el hornero");

  // una segunda versión publicada retira la primera
  const c2 = copia(EJEMPLO); c2.escalera.bandaM = 0.5;
  const v2 = (await con("POST", "/api/admin/config", adm, { cuerpo: c2 })).json().version as number;
  await con("POST", `/api/admin/config/${v2}/prueba`, adm);
  assert.equal((await con("POST", `/api/admin/config/${v2}/publicar`, adm)).json().retirada, v1);
  assert.equal((await con("GET", "/api/config", ana)).json().config.escalera.bandaM, 0.5);

  // volver a la v1: una copia nueva, publicada; la v1 sigue retirada y con su cuerpo
  const vv = await con("POST", `/api/admin/config/${v1}/volver`, adm);
  assert.equal(vv.statusCode, 201, vv.body);
  const v3 = vv.json().version as number;
  assert.ok(v3 > v2); assert.equal(vv.json().copia_de, v1); assert.equal(vv.json().retirada, v2);
  assert.equal((await con("GET", "/api/config", ana)).json().version, v3);
  assert.deepEqual((await con("GET", "/api/config", ana)).json().config, EJEMPLO);
  const hist = (await con("GET", "/api/admin/config", adm)).json();
  assert.equal(hist.publicada, v3); assert.equal(hist.en_prueba, null);
  assert.deepEqual(hist.versiones.filter((f: { version: number }) => f.version >= v1).map((f: { version: number; estado: string }) => [f.version, f.estado]), [[v3, "publicada"], [v2, "retirada"], [v1, "retirada"]]);
  assert.equal((await con("GET", `/api/admin/config/${v1}`, adm)).json().cuerpo.escalera.bandaM, EJEMPLO.escalera.bandaM);

  // un borrador no vale para volver; una retirada no vuelve a prueba; un borrador se puede descartar
  const v4 = (await con("POST", "/api/admin/config", adm, { cuerpo: { v: 1 } })).json().version as number;
  assert.equal((await con("POST", `/api/admin/config/${v4}/volver`, adm)).statusCode, 409);
  assert.equal((await con("POST", `/api/admin/config/${v1}/prueba`, adm)).statusCode, 409);
  assert.equal((await con("POST", `/api/admin/config/${v4}/retirar`, adm)).statusCode, 200);
  assert.equal((await con("POST", `/api/admin/config/${v3}/retirar`, adm)).statusCode, 409, "la publicada no se retira así");
  assert.equal((await con("POST", `/api/admin/config/999999/prueba`, adm)).statusCode, 404);

  // y la base tampoco deja reescribir ni dar marcha atrás
  await assert.rejects(bd.app.query("UPDATE config_versiones SET cuerpo = '{\"v\":1}' WHERE version = $1", [v1]), /no se reescribe/);
  await assert.rejects(bd.app.query("UPDATE config_versiones SET estado = 'publicada' WHERE version = $1", [v1]), /no puede pasar/);
  await assert.rejects(bd.app.query("UPDATE config_versiones SET estado = 'borrador' WHERE version = $1", [v3]), /no puede pasar/);

  // auditoría de cada paso, sin datos personales
  assert.ok((await auditado("config.borrador")).length >= 3);
  assert.deepEqual((await auditado("config.en_prueba")).map(d => d.version).filter(v => v >= v1), [v1, v2]);
  assert.deepEqual((await auditado("config.publicada")).map(d => d.version), [v1, v2]);
  assert.deepEqual(await auditado("config.vuelta"), [{ version: v3, copia_de: v1, retira: v2 }]);
  assert.deepEqual((await auditado("config.retirada")).map(d => d.version).filter(v => v >= v1), [v4]);
  const detalles = JSON.stringify((await bd.dueno.query("SELECT detalle FROM auditoria WHERE accion LIKE 'config.%'")).rows);
  assert.ok(!/@/.test(detalles), "sin correos en la auditoría");
});

// Integración de los arreglos de la auditoría de la api del 2026-11-14 (A-01, A-02, A-03, A-04, A-10) contra PostGIS en un contenedor:
// unas gafas vinculadas desde la cuenta admin (ADR-0028, visitante) no borran la cuenta, ni bajan sus datos, ni cambian su alias, ni cierran
// todas sus sesiones; una cuenta admin no se borra a sí misma sin confirmación reciente ni siendo la última; una cuenta oficina no cierra
// las sesiones de un admin, ni ve las suyas, ni le asigna haza; y asignar desde la ficha de la haza respeta la baja (decisión 108) y una
// haza por hogar (decisión 91). Datos SINTÉTICOS (correos @example.com). Sin Docker se SALTA con aviso. Se ejecuta por el turno del banco.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: las guardas de titular y de oficina de la auditoría A-01..A-04 con PostGIS NO se han comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
const ids: Record<string, number> = {};
let ipN = 0;
const ADMIN = "admin-gc@example.com", OFI = "ofi-gc@example.com", ANA = "ana-gc@example.com", LUIS = "luis-gc@example.com";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[ADMIN, "admin"], [OFI, "oficina"], [ANA, "hogar"], [LUIS, "hogar"]] as const) {
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol, alias, normas_version) VALUES ($1, $2, $3, 1) RETURNING id", [c, rol, "Gc" + rol + c.length])).rows[0]!.id);
  }
  for (const codigo of ["GC-01", "GC-02", "GC-03"]) {
    await bd.dueno.query("INSERT INTO hazas (codigo, nombre, finca, geom) VALUES ($1, $1, 'hituelo', ST_Multi(ST_GeomFromText('POLYGON((0 0,10 0,10 10,0 10,0 0))', 25830)))", [codigo]);
  }
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000", GEMELO_VINCULO_INTENTOS_POR_HOGAR: "100" }));
  app = await construyeApp(ctx);
  await app.ready();
}, { timeout: 240_000 });

after(async () => { if (!SALTO) { await app.close(); await bd.cierra(); } });

const ip = () => "198.51.100." + (++ipN % 250);
const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };
const galleta = (r: LightMyRequestResponse, nombre: string) => {
  const m = ([] as string[]).concat(r.headers["set-cookie"] ?? []).map(c => new RegExp("^" + nombre + "=([^;]*)").exec(c)).find(Boolean);
  return m ? m[1]! : null;
};
const pide = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, sesion: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion, "x-forwarded-for": ip() }), ...(payload ? { payload } : {}) });

async function entra(correo: string): Promise<{ sesion: string; aparato: string | null }> {
  assert.equal((await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } })).statusCode, 202);
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")?.[1];
  assert.ok(t, "no llegó el correo");
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar",
    headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip(), "user-agent": CHROME }), payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  return { sesion: galleta(r, "__Host-gemelo")!, aparato: galleta(r, "__Host-gemelo-aparato") };
}
async function oficinaAprobada(correo: string) {
  const e = await entra(correo);
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(e.aparato!)]);
  return e;
}
async function gafasDe(sesion: string): Promise<string> {
  const p = (await app.inject({ method: "POST", url: "/api/auth/vincula", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: {} })).json() as { codigo: string; sondeo: string };
  assert.equal((await pide("POST", "/api/yo/dispositivos/vincular", sesion, { codigo: p.codigo, aprobar: true })).statusCode, 204);
  const s = await app.inject({ method: "POST", url: "/api/auth/vincula/sondeo", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { sondeo: p.sondeo } });
  return galleta(s, "__Host-gemelo")!;
}

test("A-01/A-02: las gafas de la cuenta admin no la borran, ni bajan sus datos, ni cambian su alias, ni cierran sus sesiones", async t => {
  if (salta(t)) return;
  const adm = await oficinaAprobada(ADMIN);
  const gafas = await gafasDe(adm.sesion);
  for (const [m, url, cuerpo] of [["DELETE", "/api/yo"], ["GET", "/api/yo/datos"], ["PUT", "/api/yo/alias", { alias: "Visita", visible: true }], ["POST", "/api/sesion/salir-todas", {}]] as const) {
    const r = await pide(m, url, gafas, cuerpo);
    assert.equal(r.statusCode, 403, m + " " + url + ": " + r.body);
    assert.equal(r.json().error, "solo_titular");
    assert.ok(!r.body.includes(ADMIN), "sin el correo");
  }
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM hogares WHERE id = $1", [ids[ADMIN]])).rows[0].n, 1, "la cuenta sigue");
  assert.equal((await pide("GET", "/api/sesion", adm.sesion)).statusCode, 200, "y su sesión también");
});

test("A-01: la cuenta admin no se borra sin confirmación reciente ni siendo la última admin", async t => {
  if (salta(t)) return;
  const adm = await oficinaAprobada(ADMIN);
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() - interval '1 day' WHERE hash = $1", [hashToken(adm.sesion.split(".")[0]!)]);
  let r = await pide("DELETE", "/api/yo", adm.sesion);
  assert.equal(r.statusCode, 403, r.body);
  assert.equal(r.json().error, "confirmacion_requerida");
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() WHERE hash = $1", [hashToken(adm.sesion.split(".")[0]!)]);
  r = await pide("DELETE", "/api/yo", adm.sesion);
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(r.json().error, "ultimo_admin");
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM hogares WHERE id = $1", [ids[ADMIN]])).rows[0].n, 1);
});

test("A-03/A-10: una cuenta oficina no cierra las sesiones de un admin, ni las ve, ni le asigna haza", async t => {
  if (salta(t)) return;
  const adm = await oficinaAprobada(ADMIN);
  const ofi = await oficinaAprobada(OFI);
  assert.equal((await pide("POST", "/api/admin/hogares/" + ids[ADMIN] + "/revocar", ofi.sesion, {})).statusCode, 403);
  assert.equal((await pide("GET", "/api/sesion", adm.sesion)).statusCode, 200, "el admin sigue dentro");
  assert.equal((await pide("GET", "/api/admin/hogares/" + ids[ADMIN] + "/sesiones", ofi.sesion)).statusCode, 403);
  const haza = (await bd.dueno.query<{ id: number }>("SELECT id FROM hazas WHERE hogar_id IS NULL ORDER BY id LIMIT 1")).rows[0]!.id;
  assert.equal((await pide("PUT", "/api/admin/hogares/" + ids[ADMIN] + "/haza", ofi.sesion, { haza_id: haza })).statusCode, 403);
  assert.equal((await pide("PUT", "/api/admin/hazas/" + haza + "/hogar", ofi.sesion, { hogar_id: ids[ADMIN] })).statusCode, 403);
  assert.equal((await pide("POST", "/api/admin/hogares/" + ids[ADMIN] + "/revocar", adm.sesion, {})).statusCode, 204, "el admin, sí (las suyas)");
});

test("A-04: desde la ficha de la haza, una cuenta de baja es 409 y una familia suelta la haza que tenía", async t => {
  if (salta(t)) return;
  const ofi = await oficinaAprobada(OFI);
  const libres = (await bd.dueno.query<{ id: number }>("SELECT id FROM hazas WHERE hogar_id IS NULL ORDER BY id LIMIT 2")).rows.map(f => Number(f.id));
  assert.equal(libres.length, 2, "el fixture trae al menos dos hazas libres");
  const [h1, h2] = libres as [number, number];
  await bd.dueno.query("UPDATE hogares SET activo = false, baja_en = now() WHERE id = $1", [ids[LUIS]]);
  let r = await pide("PUT", "/api/admin/hazas/" + h1 + "/hogar", ofi.sesion, { hogar_id: ids[LUIS] });
  assert.equal(r.statusCode, 409, r.body);
  assert.equal((await bd.dueno.query("SELECT hogar_id FROM hazas WHERE id = $1", [h1])).rows[0].hogar_id, null, "la haza sigue libre");
  await bd.dueno.query("UPDATE hogares SET activo = true, baja_en = NULL WHERE id = $1", [ids[LUIS]]);

  assert.equal((await pide("PUT", "/api/admin/hazas/" + h1 + "/hogar", ofi.sesion, { hogar_id: ids[ANA] })).statusCode, 204);
  r = await pide("PUT", "/api/admin/hazas/" + h2 + "/hogar", ofi.sesion, { hogar_id: ids[ANA] });
  assert.equal(r.statusCode, 204, r.body);
  const deAna = (await bd.dueno.query<{ id: number }>("SELECT id FROM hazas WHERE hogar_id = $1", [ids[ANA]])).rows.map(f => Number(f.id));
  assert.deepEqual(deAna, [h2], "una haza por hogar (decisión 91): la primera queda libre");
  await bd.dueno.query("UPDATE hazas SET hogar_id = NULL WHERE hogar_id = $1", [ids[ANA]]);
});

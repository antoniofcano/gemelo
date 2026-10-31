// Integración del contorno de la finca (OF3b, decisión 140; migración 0011) contra PostGIS en un contenedor: sin contorno manda la caja de
// los olivos + 150 m (lo de OF3); cargar un contorno (solo admin con confirmación reciente) hace que una haza que cabía en la caja pero se
// sale del contorno se rechace (fuera_de_contorno, ST_CoveredBy con 1 m de holgura); el límite lo dice GET …/limite con las hazas que se
// salen; cargar otro retira el anterior sin borrarlo; retirar vuelve a la caja; la api no puede cambiar la geometría de una carga; y el
// SQL de la tubería (fincas_contorno_carga + auditoría) carga igual. Datos sintéticos (una finca «prueba» inventada). Sin Docker se SALTA.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: el contorno de la finca con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
let ipN = 0;
const ADMIN = "admin-ct@example.com", OFI = "ofi-ct@example.com";
const ids: Record<string, number> = {};
const E0 = 430_000, N0 = 4_180_000;   // nada de esto es real

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[ADMIN, "admin"], [OFI, "oficina"]] as const) {
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
  }
  // 100 olivos medidos en rejilla de 10 m: x, y = 5 … 95 (la caja + 150 m va de -145 a 245)
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    await bd.dueno.query("INSERT INTO olivos (id_estable, geom, fuente) VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 25830), 'lidar')",
      ["prueba:" + (i * 10 + j + 1), E0 + 5 + i * 10, N0 + 5 + j * 10]);
  }
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000" }));
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
async function oficina(correo: string): Promise<string> {
  const p = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  assert.equal(p.statusCode, 202);
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")?.[1];
  assert.ok(t, "no llegó el correo a " + correo);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip() }), payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  const { hashToken } = await import("../../src/seguridad/cripto.ts");
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(galleta(r, "__Host-gemelo-aparato")!)]);
  return galleta(r, "__Host-gemelo")!;
}
let adm = "", ofi = "";
const pide = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object, sesion = adm) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion }), ...(payload ? { payload } : {}) });
const rect = (x0: number, y0: number, x1: number, y1: number) =>
  ({ type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [E0 + x!, N0 + y!])] });
const contorno = (geometria: object, extra: object = {}) => ({ geometria, fuente: "sigpac", consultado_en: "2026-10-30", parcelas: 2, ...extra });

test("sin contorno: el límite es la caja de los olivos + 150 m y una haza en la caja se guarda", async t => {
  if (salta(t)) return;
  adm = await oficina(ADMIN); ofi = await oficina(OFI);
  const l = (await pide("GET", "/api/admin/fincas/prueba/limite", undefined, ofi)).json();
  assert.equal(l.tipo, "caja"); assert.equal(l.margen_m, 150); assert.deepEqual(l.hazas_fuera, []);
  assert.equal(l.geometria.type, "MultiPolygon");
  assert.deepEqual(l.geometria.coordinates[0][0][0], [E0 - 145, N0 - 145]);
  assert.equal((await pide("GET", "/api/admin/fincas/otra/limite", undefined, ofi)).json().tipo, "ninguno");
  const r = await pide("POST", "/api/admin/hazas", { codigo: "H-A", nombre: "Dentro de la caja", finca: "prueba", geometria: rect(110, 0, 140, 40) }, ofi);
  assert.equal(r.statusCode, 201, r.body); ids["H-A"] = r.json().haza.id;
});

test("cargar el contorno: solo admin, con confirmación reciente; forma mala 400", async t => {
  if (salta(t)) return;
  const bueno = contorno(rect(0, 0, 100, 100));
  assert.equal((await pide("PUT", "/api/admin/fincas/prueba/contorno", bueno, ofi)).statusCode, 403, "la oficina no carga contornos");
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() - interval '20 minutes' WHERE hogar_id = $1", [ids[ADMIN]]);
  const r = await pide("PUT", "/api/admin/fincas/prueba/contorno", bueno);
  assert.equal(r.statusCode, 403); assert.equal(r.json().error, "confirmacion_requerida");
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() WHERE hogar_id = $1", [ids[ADMIN]]);
  for (const malo of [contorno(rect(0, 0, 100, 100), { fuente: "osm" }), contorno(rect(0, 0, 100, 100), { refcat: "x" }), contorno(rect(0, 0, 100, 100), { consultado_en: "ayer" }),
    contorno({ type: "Polygon", coordinates: [[[0, 40], [40, 0], [40, 40], [0, 40]]] }), contorno({ type: "LineString", coordinates: [[E0, N0], [E0 + 1, N0]] })]) {
    assert.equal((await pide("PUT", "/api/admin/fincas/prueba/contorno", malo)).statusCode, 400, JSON.stringify(malo).slice(0, 100));
  }
  const lazo = await pide("PUT", "/api/admin/fincas/prueba/contorno", contorno({ type: "Polygon", coordinates: [[[0, 200], [40, 240], [40, 200], [0, 240], [0, 200]].map(([x, y]) => [E0 + x!, N0 + y!])] }));
  assert.equal(lazo.statusCode, 400); assert.equal(lazo.json().error, "contorno_no_valido");
  const fecha = await pide("PUT", "/api/admin/fincas/prueba/contorno", contorno(rect(0, 0, 100, 100), { consultado_en: "2026-02-30" }));
  assert.equal(fecha.statusCode, 400, "una fecha que no existe: " + fecha.body);
  assert.equal((await bd.dueno.query("SELECT 1 FROM fincas_contorno")).rowCount, 0, "nada cargado aún");
});

test("con contorno, manda él: la haza que se sale se rechaza aunque quepa en la caja; holgura de 1 m; avisa de las que ya se salían", async t => {
  if (salta(t)) return;
  const r = await pide("PUT", "/api/admin/fincas/prueba/contorno", contorno(rect(0, 0, 100, 100)));
  assert.equal(r.statusCode, 201, r.body);
  const l = r.json();
  assert.equal(l.tipo, "contorno"); assert.equal(l.fuente, "sigpac"); assert.equal(l.consultado_en, "2026-10-30"); assert.equal(l.parcelas, 2);
  assert.equal(l.superficie_ha, 1); assert.equal(l.holgura_m, 1);
  assert.deepEqual(l.hazas_fuera.map((x: { codigo: string }) => x.codigo), ["H-A"], "H-A (x 110-140) queda fuera");
  const crea = (codigo: string, g: object) => pide("POST", "/api/admin/hazas", { codigo, nombre: "x", finca: "prueba", geometria: g }, ofi);
  let c = await crea("H-B", rect(90, 0, 120, 40));
  assert.equal(c.statusCode, 400); assert.equal(c.json().error, "fuera_de_contorno"); assert.equal(c.json().fuera_m2, 800);
  c = await crea("H-B", rect(0, 0, 100.5, 40));
  assert.equal(c.statusCode, 201, "medio metro fuera entra en la holgura: " + c.body);
  // H-A, que ya se salía, no se puede guardar ni volver a una versión fuera
  const e = await pide("PUT", "/api/admin/hazas/" + ids["H-A"] + "/geom", { geometria: rect(110, 0, 140, 45), version: 1 }, ofi);
  assert.equal(e.statusCode, 400); assert.equal(e.json().error, "fuera_de_contorno");
  const a = (await bd.dueno.query<{ detalle: Record<string, unknown> }>("SELECT detalle FROM auditoria WHERE accion = 'admin.contorno_cargado'")).rows;
  assert.equal(a.length, 1); assert.deepEqual(a[0]!.detalle, { finca: "prueba", fuente: "sigpac", consultado_en: "2026-10-30", parcelas: 2, superficie_ha: 1 });
});

test("cargar otro retira el anterior (la historia queda); retirar vuelve a la caja; la api no cambia geometrías ni borra", async t => {
  if (salta(t)) return;
  const r = await pide("PUT", "/api/admin/fincas/prueba/contorno", contorno({ type: "MultiPolygon", coordinates: [rect(0, 0, 100, 100).coordinates, rect(105, -5, 150, 50).coordinates] }, { fuente: "catastro", parcelas: 3 }));
  assert.equal(r.statusCode, 201, r.body); assert.equal(r.json().fuente, "catastro"); assert.deepEqual(r.json().hazas_fuera, []);
  const filas = (await bd.dueno.query<{ vigente: boolean; retirado_por: number | null }>("SELECT retirado_en IS NULL AS vigente, retirado_por::int AS retirado_por FROM fincas_contorno ORDER BY id")).rows;
  assert.deepEqual(filas, [{ vigente: false, retirado_por: ids[ADMIN] }, { vigente: true, retirado_por: null }]);
  await assert.rejects(bd.app.query("UPDATE fincas_contorno SET geom = ST_Multi(ST_Buffer(geom, 10))"), /permission denied|permiso denegado/);
  await assert.rejects(bd.app.query("DELETE FROM fincas_contorno"), /permission denied|permiso denegado/);
  assert.equal((await pide("DELETE", "/api/admin/fincas/prueba/contorno", undefined, ofi)).statusCode, 403);
  assert.equal((await pide("DELETE", "/api/admin/fincas/prueba/contorno")).statusCode, 204);
  assert.equal((await pide("DELETE", "/api/admin/fincas/prueba/contorno")).json().error, "sin_contorno");
  assert.equal((await pide("GET", "/api/admin/fincas/prueba/limite")).json().tipo, "caja");
  assert.equal((await bd.dueno.query("SELECT 1 FROM auditoria WHERE accion = 'admin.contorno_retirado'")).rowCount, 1);
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM fincas_contorno")).rows[0]!.n, 2, "la historia no se borra");
});

test("el SQL de la tubería (fincas_contorno_carga + auditoría, sin autor) carga igual", async t => {
  if (salta(t)) return;
  const geo = JSON.stringify({ type: "MultiPolygon", coordinates: [rect(0, 0, 100, 100).coordinates] });
  // el mismo SQL que escribe tuberia/contorno/contorno_finca.py --sql
  await bd.dueno.query("BEGIN; SELECT fincas_contorno_carga('prueba', $gemelo_contorno$" + geo + "$gemelo_contorno$, 'sigpac', DATE '2026-10-30', 2, NULL); " +
    "INSERT INTO auditoria (hogar_id, accion, detalle) VALUES (NULL, 'tuberia.contorno_cargado', $gemelo_contorno${\"finca\":\"prueba\"}$gemelo_contorno$::jsonb); COMMIT;");
  const l = (await pide("GET", "/api/admin/fincas/prueba/limite", undefined, ofi)).json();
  assert.equal(l.tipo, "contorno"); assert.equal(l.superficie_ha, 1);
  assert.equal((await bd.dueno.query("SELECT 1 FROM auditoria WHERE accion = 'tuberia.contorno_cargado'")).rowCount, 1);
  await assert.rejects(bd.dueno.query("SELECT fincas_contorno_carga('prueba', '{\"type\":\"Point\",\"coordinates\":[430000,4180000]}', 'sigpac', DATE '2026-10-30', 1, NULL)"), /contorno_no_valido/);
});

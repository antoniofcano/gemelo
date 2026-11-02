// Integración de la ficha del olivo de la oficina (OF15b, doc/sistema/OFICINA.md §4 y §9) contra PostGIS en un contenedor: solo oficina (hogar 403, sin sesión 401),
// 404 de un olivo que no existe o está retirado del censo, lo medido (posición y altura), la haza que lo contiene y su titular (solo el id), la personalización del
// titular ACTUAL (con su decoración del catálogo y su foto SIN imagen), la retirada, el olivo fuera de toda haza y sin ningún correo en la respuesta.
// Datos sintéticos. Sin Docker se SALTA con aviso (NO ejecutada en el desarrollo de OF15b: solo Node).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la ficha del olivo de la oficina con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
let ipN = 0;
const OFI = "ofi-fic@example.com", ANA = "ana-fic@example.com", LUIS = "luis-fic@example.com";
const ids: Record<string, number> = {};
let hazaId = 0, olivoA = 0, olivoB = 0, medioId = 0;
const E0 = 430_000, N0 = 4_180_000;   // nada de esto es real

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[OFI, "oficina"], [ANA, "hogar"], [LUIS, "hogar"]] as const) {
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
  }
  hazaId = Number((await bd.dueno.query<{ id: number }>(
    "INSERT INTO hazas (codigo, nombre, finca, geom, hogar_id) VALUES ('H-01', 'La Loma', 'prueba', ST_Multi(ST_GeomFromText($1, 25830)), $2) RETURNING id",
    ["POLYGON((" + [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]].map(([x, y]) => (E0 + x!) + " " + (N0 + y!)).join(",") + "))", ids[ANA]])).rows[0]!.id);
  // A: dentro de la haza (altura 4,20); B: fuera de toda haza
  const nuevo = async (n: number, x: number, y: number, alt: number | null) => Number((await bd.dueno.query<{ id: number }>(
    "INSERT INTO olivos (id_estable, geom, fuente, altura_m, finca, copas_id) VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 25830), 'lidar', $4, 'prueba', $5) RETURNING id",
    ["prueba:" + n, E0 + x, N0 + y, alt, n])).rows[0]!.id);
  olivoA = await nuevo(1, 10, 20, 4.2); olivoB = await nuevo(2, 500, 500, null);
  medioId = Number((await bd.dueno.query<{ id: number }>(
    "INSERT INTO medios (clave, tipo_mime, bytes, ancho, alto, sha256, hogar_id, aviso_version, aviso_aceptado_en) VALUES ($1, 'image/webp', 10, 4, 4, $2, $3, 1, now()) RETURNING id",
    ["a".repeat(32) + ".webp", Buffer.alloc(32, 1), ids[ANA]])).rows[0]!.id);
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000" }));
  app = await construyeApp(ctx);
  await app.ready();
}, { timeout: 240_000 });
after(async () => { if (!SALTO) { await app.close(); await bd.cierra(); } });

// ---------------------------------------------------------------- ayudas (las mismas que las demás integraciones de la oficina)
const ip = () => "198.51.100." + (++ipN % 250);
const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };
const galleta = (r: LightMyRequestResponse, nombre: string) => {
  const m = ([] as string[]).concat(r.headers["set-cookie"] ?? []).map(c => new RegExp("^" + nombre + "=([^;]*)").exec(c)).find(Boolean);
  return m ? m[1]! : null;
};
async function entra(correo: string): Promise<{ sesion: string; aparato: string | null }> {
  const p = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  assert.equal(p.statusCode, 202);
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")?.[1];
  assert.ok(t, "no llegó el correo a " + correo);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip() }), payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  return { sesion: galleta(r, "__Host-gemelo")!, aparato: galleta(r, "__Host-gemelo-aparato") };
}
async function oficina(correo: string): Promise<string> {
  const e = await entra(correo);
  const { hashToken } = await import("../../src/seguridad/cripto.ts");
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(e.aparato!)]);
  return e.sesion;
}
let ofi = "";
const pide = (url: string, sesion = ofi) => app.inject({ method: "GET", url, headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion }) });
const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await bd.dueno.query(sql, p)).rows as T[];

test("solo la oficina: un hogar 403 y sin sesión 401", async t => {
  if (salta(t)) return;
  ofi = await oficina(OFI);
  const ana = (await entra(ANA)).sesion;
  assert.equal((await pide("/api/admin/olivos/prueba/1", ana)).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/api/admin/olivos/prueba/1", headers: deLaWeb() })).statusCode, 401);
});

test("un olivo que no existe, o retirado del censo, es 404 olivo_no_existe; la forma mala, 400", async t => {
  if (salta(t)) return;
  assert.equal((await pide("/api/admin/olivos/prueba/999")).statusCode, 404);
  assert.equal((await pide("/api/admin/olivos/otra/1")).statusCode, 404, "el mismo copas_id en otra finca no es este olivo");
  assert.equal((await pide("/api/admin/olivos/prueba/abc")).statusCode, 400);
  const r = await pide("/api/admin/olivos/prueba/999");
  assert.equal(r.json().error, "olivo_no_existe");
});

test("sin personalización: lo medido, su haza y el id del titular, y nada más", async t => {
  if (salta(t)) return;
  const r = await pide("/api/admin/olivos/prueba/1");
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.headers["cache-control"], "no-store");
  assert.deepEqual(r.json(), { finca: "prueba", copas_id: 1, posicion: { e: E0 + 10, n: N0 + 20 }, altura_m: 4.2, tipo: -1,
    haza: { id: hazaId, codigo: "H-01", titular: { hogar_id: ids[ANA] } }, personalizacion: null });
  assert.ok(!/@|correo/.test(r.body), "ningún correo en la ficha: " + r.body);
});

test("un olivo fuera de toda haza: sin haza ni personalización, con su altura nula", async t => {
  if (salta(t)) return;
  const r = await pide("/api/admin/olivos/prueba/2");
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { finca: "prueba", copas_id: 2, posicion: { e: E0 + 500, n: N0 + 500 }, altura_m: null, tipo: -1, haza: null, personalizacion: null });
});

test("con personalización del titular: nombre, decoración del catálogo y foto sin imagen; retirada, se dice; lo de otro hogar no cuenta", async t => {
  if (salta(t)) return;
  const p = Number((await q<{ id: number }>(
    "INSERT INTO personalizaciones (olivo_id, haza_id, hogar_id, nombre, objeto_tipo, medio_id, decoracion) VALUES ($1, $2, $3, 'La Abuela', 'foto', $4, 'farolillo') RETURNING id",
    [olivoA, hazaId, ids[ANA], medioId]))[0]!.id);
  // lo que puso un hogar que ya NO es el titular (o nunca lo fue) no sale en la ficha
  await q("INSERT INTO personalizaciones (olivo_id, haza_id, hogar_id, nombre) VALUES ($1, $2, $3, 'No es suyo')", [olivoB, hazaId, ids[LUIS]]);
  let r = await pide("/api/admin/olivos/prueba/1");
  const f = r.json();
  assert.deepEqual(f.personalizacion, { personalizacion_id: p, estado: "visible", nombre: "La Abuela", decoracion: { id: "farolillo", nombre: "Farolillo", epoca: "otono" }, objeto: { tipo: "foto", medio_id: medioId } });
  assert.ok(!/\.webp|\/api\/medios|"url"/.test(r.body), "la ficha no sirve la imagen ni su dirección: " + r.body);
  assert.equal((await pide("/api/admin/olivos/prueba/2")).json().personalizacion, null);
  // retirada por la oficina: sigue en la ficha, con su estado
  await q("UPDATE personalizaciones SET estado = 'retirado', retirada_en = now(), motivo_retirada = 'Retirado por la oficina' WHERE id = $1", [p]);
  r = await pide("/api/admin/olivos/prueba/1");
  assert.equal(r.json().personalizacion.estado, "retirado");
  // y si la oficina reasigna la haza a otra familia, lo de la anterior deja de verse
  await q("UPDATE hazas SET hogar_id = $1 WHERE id = $2", [ids[LUIS], hazaId]);
  const s = (await pide("/api/admin/olivos/prueba/1")).json();
  assert.deepEqual(s.haza.titular, { hogar_id: ids[LUIS] });
  assert.equal(s.personalizacion, null);
});

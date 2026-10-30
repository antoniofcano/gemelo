// Integración de los récords de los juegos (migración 0009, C9a) contra PostGIS en un contenedor (la misma imagen que producción): guardar una
// partida, el récord del propio hogar (y nada del de otro), lo no creíble, el límite por hogar, las gafas vinculadas, los permisos de la tabla
// y el RGPD (sale en /api/yo/datos y se va con el hogar). Datos SINTÉTICOS (correos @example.com). Sin Docker se SALTA con aviso.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { PARTIDAS_POR_HORA } from "../../src/juegos/rutas.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la integración de los récords de los juegos con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
const ids: Record<string, number> = {};
let ipN = 0;
const ANA = "ana@example.com", LUIS = "luis@example.com";
const J = "/api/juegos/cae-la-cosecha";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const c of [ANA, LUIS]) ids[c] = (await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, 'hogar') RETURNING id", [c])).rows[0]!.id;
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000" }));
  app = await construyeApp(ctx);
  await app.ready();
}, { timeout: 240_000 });
after(async () => { if (SALTO) return; await app.close(); await bd.cierra(); });

const ip = () => "198.51.100." + (++ipN % 250);
const cookieDe = (r: LightMyRequestResponse) => /^__Host-gemelo=([^;]+)/.exec(([] as string[]).concat(r.headers["set-cookie"] ?? []).find(c => c.startsWith("__Host-gemelo=")) ?? "")?.[1] ?? null;
async function entra(correo: string): Promise<string> {
  await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")![1]!;
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/json", "x-forwarded-for": ip() }), payload: { t } });
  assert.equal(r.statusCode, 200, r.body);
  return cookieDe(r)!;
}
async function gafas(titular: string): Promise<string> {
  const p = (await app.inject({ method: "POST", url: "/api/auth/vincula", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: {} })).json();
  const d = await app.inject({ method: "POST", url: "/api/yo/dispositivos/vincular", headers: deLaWeb({ cookie: "__Host-gemelo=" + titular, "x-forwarded-for": ip() }), payload: { codigo: p.codigo, aprobar: true } });
  assert.equal(d.statusCode, 204);
  const s = await app.inject({ method: "POST", url: "/api/auth/vincula/sondeo", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { sondeo: p.sondeo } });
  return cookieDe(s)!;
}
const con = (method: "GET" | "POST" | "DELETE", url: string, cookie: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + cookie, "x-forwarded-for": ip() }), ...(payload ? { payload } : {}) });
const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };

test("0009: la tabla, sus límites y que la api solo lee y añade", async t => {
  if (salta(t)) return;
  const priv = (await bd.dueno.query<{ p: string }>("SELECT privilege_type AS p FROM information_schema.role_table_grants WHERE grantee = 'gemelo_api' AND table_name = 'juegos_partidas' ORDER BY 1")).rows.map(r => r.p);
  assert.deepEqual(priv, ["INSERT", "SELECT"]);
  await assert.rejects(bd.dueno.query("INSERT INTO juegos_partidas (hogar_id, juego, puntos, duracion_s) VALUES ($1, 'Mal', 1, 1)", [ids[ANA]]), /check/);
  await assert.rejects(bd.dueno.query("INSERT INTO juegos_partidas (hogar_id, juego, puntos, duracion_s) VALUES ($1, 'cae-la-cosecha', -1, 1)", [ids[ANA]]), /check/);
  await assert.rejects(bd.app.query("DELETE FROM juegos_partidas"), /permission|permiso/);
});

test("guardar partidas: el récord es el mejor del propio hogar; otro hogar no ve nada del primero; las gafas también juegan", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA), luis = await entra(LUIS);
  let r = await con("GET", J + "/records", ana);
  assert.equal(r.statusCode, 200); assert.deepEqual(r.json(), { juego: "cae-la-cosecha", record: null, partidas: 0 });
  r = await con("POST", J + "/partidas", ana, { puntos: 420, duracion_s: 95 });
  assert.equal(r.statusCode, 201, r.body); assert.equal(r.json().es_record, true); assert.equal(r.json().record.puntos, 420); assert.equal(r.json().partidas, 1);
  r = await con("POST", J + "/partidas", ana, { puntos: 300, duracion_s: 70 });
  assert.equal(r.json().es_record, false); assert.equal(r.json().record.puntos, 420); assert.equal(r.json().partidas, 2);
  const nieto = await gafas(ana);
  r = await con("POST", J + "/partidas", nieto, { puntos: 610, duracion_s: 120 });
  assert.equal(r.statusCode, 201, "una sesión de gafas vinculadas también guarda (juegan los nietos)"); assert.equal(r.json().es_record, true);
  r = await con("GET", J + "/records", luis);
  assert.deepEqual(r.json(), { juego: "cae-la-cosecha", record: null, partidas: 0 }, "Luis no ve nada de la familia de Ana");
  assert.ok(!/ana@|610/.test(r.body));
  r = await con("GET", J + "/records", ana); assert.equal(r.json().record.puntos, 610); assert.equal(r.json().partidas, 3);
  assert.deepEqual(Object.keys(r.json().record).sort(), ["duracion_s", "fecha", "puntos"], "lista blanca: ni hogar ni id");
});

test("lo no creíble no se guarda (422); un juego que no existe, 404", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  const antes = (await con("GET", J + "/records", ana)).json().partidas;
  for (const payload of [{ puntos: 999_999, duracion_s: 10 }, { puntos: 50, duracion_s: 2 }, { puntos: 50, duracion_s: 7200 }]) {
    const r = await con("POST", J + "/partidas", ana, payload);
    assert.equal(r.statusCode, 422, JSON.stringify(payload)); assert.equal(r.json().error, "partida_no_creible");
  }
  assert.equal((await con("GET", J + "/records", ana)).json().partidas, antes);
  assert.equal((await con("POST", "/api/juegos/otro-juego/partidas", ana, { puntos: 1, duracion_s: 10 })).statusCode, 404);
  assert.equal((await con("GET", "/api/juegos/otro-juego/records", ana)).statusCode, 404);
});

test("límite por hogar: pasadas " + PARTIDAS_POR_HORA + " partidas en una hora, 429 con texto propio", async t => {
  if (salta(t)) return;
  const luis = await entra(LUIS);
  let ultimo: LightMyRequestResponse | null = null;
  for (let i = 0; i <= PARTIDAS_POR_HORA; i++) ultimo = await con("POST", J + "/partidas", luis, { puntos: 10, duracion_s: 30 });
  assert.equal(ultimo!.statusCode, 429); assert.equal(ultimo!.json().error, "demasiadas_peticiones");
});

test("clasificación (C9c): mejor de cada hogar, puestos, alias solo si es visible, sin hogares de baja y sin ningún id ni correo", async t => {
  if (salta(t)) return;
  const nuevo = async (correo: string, alias: string, visible: boolean, activo: boolean) => (await bd.dueno.query<{ id: number }>(
    "INSERT INTO hogares (correo, rol, alias, alias_visible, activo, baja_en) VALUES ($1, 'hogar', $2, $3, $4, CASE WHEN $4 THEN NULL ELSE now() END) RETURNING id", [correo, alias, visible, activo])).rows[0]!.id;
  const oso = await nuevo("oso@example.com", "Oso Pardo", true, true), secreta = await nuevo("secreta@example.com", "Secreta", false, true), baja = await nuevo("baja@example.com", "De Baja", true, false);
  const pon = (h: number, puntos: number) => bd.dueno.query("INSERT INTO juegos_partidas (hogar_id, juego, puntos, duracion_s) VALUES ($1, 'cae-la-cosecha', $2, 100)", [h, puntos]);
  await pon(oso, 3000); await pon(oso, 5000); await pon(oso, 100); await pon(secreta, 4000); await pon(baja, 9000);
  const ana = await entra(ANA), luis = await entra(LUIS);
  let r = await con("GET", J + "/clasificacion", ana);
  assert.equal(r.statusCode, 200, r.body);
  const c = r.json();
  assert.deepEqual(Object.keys(c).sort(), ["juego", "mia", "puestos", "total"]);
  assert.deepEqual(c.puestos.slice(0, 2).map((f: { puesto: number; alias: string | null; puntos: number }) => [f.puesto, f.alias, f.puntos]), [[1, "Oso Pardo", 5000], [2, null, 4000]], "una fila por hogar (su mejor); el alias oculto sale null; el hogar de baja no sale");
  assert.ok(!/Secreta|De Baja|oso@|secreta@|ana@|hogar_id/.test(r.body), "ni nombres ocultos, ni correos, ni ids: " + r.body);
  assert.ok(c.puestos.every((f: object) => Object.keys(f).sort().join() === "alias,es_mia,puesto,puntos"));
  assert.equal(c.mia?.es_mia, true); assert.equal(c.mia.puntos, 610, "Ana (610 de las partidas de arriba) aparece con su puesto");
  assert.equal(c.puestos.filter((f: { es_mia: boolean }) => f.es_mia).length, c.mia.puesto <= 5 ? 1 : 0);
  r = await con("GET", J + "/clasificacion?n=1", ana);
  assert.equal(r.json().puestos.length, 1); assert.equal(r.json().mia.puntos, 610, "fuera de la tabla, el propio puesto sale aparte"); assert.ok(r.json().mia.puesto >= 3);
  assert.equal(r.json().total, c.total);
  r = await con("GET", J + "/clasificacion", luis);
  assert.equal(r.statusCode, 200); assert.ok(r.json().mia === null || r.json().mia.es_mia === true, "quien no ha puntuado no tiene puesto propio inventado");
  assert.equal((await con("GET", "/api/juegos/otro-juego/clasificacion", ana)).statusCode, 404);
  assert.equal((await con("GET", J + "/clasificacion?n=99", ana)).statusCode, 400);
});

test("RGPD: las partidas salen en /api/yo/datos y se van con el hogar", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  const d = (await con("GET", "/api/yo/datos", ana)).json();
  assert.ok(Array.isArray(d.partidas_de_juegos) && d.partidas_de_juegos.length >= 3, JSON.stringify(d.partidas_de_juegos));
  assert.deepEqual(Object.keys(d.partidas_de_juegos[0]).sort(), ["duracion_s", "juego", "jugada_en", "puntos"]);
  const b = await con("DELETE", "/api/yo", ana);
  assert.ok([200, 204].includes(b.statusCode), b.body);
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM juegos_partidas WHERE hogar_id = $1", [ids[ANA]])).rows[0].n, 0);
});

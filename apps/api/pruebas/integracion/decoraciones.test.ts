// Integración de «decorar un olivo» (P7g, migración 0019) contra PostGIS en un contenedor. ESCRITA, NO EJECUTADA todavía:
// hace falta Docker (GEMELO_DOCKER=1) y se ha dejado para el banco de pruebas. Sin Docker se SALTA con aviso.
// Datos SINTÉTICOS (correos @example.com, olivos «hituelo:9000xx» dentro de las hazas de tuberia/hazas/ejemplo).
// Las piezas se eligen con el reloj real: una de la época actual y una de otra, para que la prueba valga todo el año.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { catalogo, epocaDeLaFecha } from "../../src/vida/decoraciones.ts";
import { type BdDePrueba, hayDocker, levantaBd, sqlDeEjemplo } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { validadorOlivosHaza } from "../apoyo/esquemas.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la integración de las decoraciones con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
const ids: Record<string, number> = {};
const valida = validadorOlivosHaza();
let ipN = 0;
const ADMIN = "oficina@example.com", ANA = "ana@example.com", LUIS = "luis@example.com";
const hoy = epocaDeLaFecha(new Date());
const DE_HOY = catalogo().piezas.filter(p => p.epoca === hoy).map(p => p.id);
const DE_OTRA = catalogo().piezas.find(p => p.epoca !== hoy)!.id;

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  await bd.dueno.query(sqlDeEjemplo());
  for (const [c, rol] of [[ADMIN, "admin"], [ANA, "hogar"], [LUIS, "hogar"]] as const) {
    ids[c] = (await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id;
  }
  for (const r of (await bd.dueno.query<{ id: number; codigo: string }>("SELECT id, codigo FROM hazas")).rows) ids[r.codigo] = r.id;
  await bd.dueno.query("UPDATE hazas SET hogar_id = $1 WHERE codigo = 'H-S01'", [ids[ANA]]);
  await bd.dueno.query("UPDATE hazas SET hogar_id = $1 WHERE codigo = 'H-S02'", [ids[LUIS]]);
  await bd.dueno.query(`INSERT INTO olivos (id_estable, geom, fuente) VALUES
    ('hituelo:900001', ST_SetSRID(ST_MakePoint(500050, 4100050), 25830), 'lidar'),
    ('hituelo:900002', ST_SetSRID(ST_MakePoint(500050, 4100060), 25830), 'lidar'),
    ('hituelo:900003', ST_SetSRID(ST_MakePoint(500150, 4100050), 25830), 'lidar')`);
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
  if (correo === ADMIN) await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE aprobado_en IS NULL AND hogar_id = $1", [ids[ADMIN]]);
  return cookieDe(r)!;
}
async function gafas(titular: string): Promise<string> {
  const p = (await app.inject({ method: "POST", url: "/api/auth/vincula", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: {} })).json();
  const d = await app.inject({ method: "POST", url: "/api/yo/dispositivos/vincular", headers: deLaWeb({ cookie: "__Host-gemelo=" + titular, "x-forwarded-for": ip() }), payload: { codigo: p.codigo, aprobar: true } });
  assert.equal(d.statusCode, 204);
  const s = await app.inject({ method: "POST", url: "/api/auth/vincula/sondeo", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { sondeo: p.sondeo } });
  return cookieDe(s)!;
}
const con = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, cookie: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + cookie, "x-forwarded-for": ip() }), ...(payload ? { payload } : {}) });
const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };
const lista = async (cookie: string) => (await con("GET", "/api/hazas/" + ids["H-S01"] + "/olivos", cookie)).json();
const deOlivo = (cuerpo: Record<string, any>, copas: number) => (cuerpo["olivos"] as { copas_id: number }[]).find(o => o.copas_id === copas) as Record<string, any> | undefined;

test("0019: la columna existe, solo admite un slug, y una fila visible sin nada sigue prohibida", async t => {
  if (salta(t)) return;
  const col = (await bd.dueno.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'personalizaciones' AND column_name = 'decoracion'")).rowCount;
  assert.equal(col, 1);
  const o = (await bd.dueno.query("SELECT id FROM olivos WHERE id_estable = 'hituelo:900003'")).rows[0].id;
  await assert.rejects(bd.dueno.query("INSERT INTO personalizaciones (olivo_id, haza_id, hogar_id, decoracion) VALUES ($1, $2, $3, 'No Slug')", [o, ids["H-S02"], ids[LUIS]]), /check/i);
  await assert.rejects(bd.dueno.query("INSERT INTO personalizaciones (olivo_id, haza_id, hogar_id) VALUES ($1, $2, $3)", [o, ids["H-S02"], ids[LUIS]]), /check/i);
});

test("poner: el titular en SU haza, solo de la época; otro hogar, las gafas y un olivo ajeno, no; sustituye a la anterior", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA), luis = await entra(LUIS), quest = await gafas(ana);
  const p = DE_HOY[0]!;
  const ok = await con("PUT", "/api/olivos/hituelo/900001/decoracion", ana, { pieza: p });
  assert.equal(ok.statusCode, 200, ok.body);
  ids["pdec"] = ok.json().id; assert.equal(ok.json().pieza, p);
  const fuera = await con("PUT", "/api/olivos/hituelo/900001/decoracion", ana, { pieza: DE_OTRA });
  assert.equal(fuera.statusCode, 422); assert.equal(fuera.json().error, "fuera_de_epoca");
  assert.equal((await con("PUT", "/api/olivos/hituelo/900001/decoracion", ana, { pieza: "dragon" })).json().error, "pieza_no_existe");
  const ajena = await con("PUT", "/api/olivos/hituelo/900001/decoracion", luis, { pieza: p });
  assert.equal(ajena.statusCode, 403); assert.equal(ajena.json().error, "no_es_tu_haza");
  assert.equal((await con("PUT", "/api/olivos/hituelo/900003/decoracion", ana, { pieza: p })).json().error, "no_es_tu_haza");
  const g = await con("PUT", "/api/olivos/hituelo/900001/decoracion", quest, { pieza: p });
  assert.equal(g.statusCode, 403); assert.equal(g.json().error, "solo_titular");
  assert.equal((await con("PUT", "/api/olivos/hituelo/999999/decoracion", ana, { pieza: p })).json().error, "olivo_no_existe");
  // una sola por olivo y hogar: la segunda sustituye (si la época tiene dos piezas, cambia de verdad)
  const otra = DE_HOY[DE_HOY.length - 1]!;
  const c = await con("PUT", "/api/olivos/hituelo/900001/decoracion", ana, { pieza: otra });
  assert.equal(c.statusCode, 200); assert.equal(c.json().id, ids["pdec"], "misma fila");
  const filas = (await bd.dueno.query("SELECT decoracion FROM personalizaciones p JOIN olivos o ON o.id = p.olivo_id WHERE o.copas_id = 900001 AND p.estado = 'visible'")).rows;
  assert.deepEqual(filas, [{ decoracion: otra }]);
  const aud = (await bd.dueno.query("SELECT detalle FROM auditoria WHERE accion = 'vida.decoracion' AND hogar_id = $1", [ids[ANA]])).rows;
  assert.ok(aud.length >= 2);
  assert.equal((await bd.dueno.query("SELECT 1 FROM bandeja WHERE personalizacion_id = $1", [ids["pdec"]])).rowCount, 0, "no entra en la bandeja");
});

test("con nombre y sola; personalizar no la pisa; la lista blanca la da a otro hogar y valida el contrato", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA), luis = await entra(LUIS);
  assert.equal((await con("PUT", "/api/olivos/hituelo/900001", ana, { nombre: "El abuelo" })).statusCode, 200);
  assert.equal((await con("PUT", "/api/olivos/hituelo/900002/decoracion", ana, { pieza: DE_HOY[0]! })).statusCode, 200, "decoración sola, sin nombre ni foto");
  const cuerpo = await lista(luis);
  assert.ok(valida(cuerpo), JSON.stringify(valida.errors));
  const o1 = deOlivo(cuerpo, 900001)!, o2 = deOlivo(cuerpo, 900002)!;
  assert.equal(o1.nombre, "El abuelo"); assert.ok(DE_HOY.includes(o1.decoracion));
  assert.equal(o2.nombre, null); assert.equal(o2.objeto, null); assert.equal(o2.decoracion, DE_HOY[0]);
  ids["psola"] = o2.id;
  // quitarle el nombre a uno que tiene decoración no lo borra
  assert.equal((await con("PUT", "/api/olivos/hituelo/900001", ana, { nombre: null })).statusCode, 200);
  assert.ok(DE_HOY.includes(deOlivo(await lista(luis), 900001)!.decoracion));
});

test("quitar: el titular la quita; con nombre la fila se queda; sola, queda retirada; otra vez, 404; las gafas no", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA), luis = await entra(LUIS), quest = await gafas(ana);
  assert.equal((await con("PUT", "/api/olivos/hituelo/900001", ana, { nombre: "El abuelo" })).statusCode, 200);
  assert.equal((await con("DELETE", "/api/olivos/hituelo/900001/decoracion", quest)).statusCode, 403);
  assert.equal((await con("DELETE", "/api/olivos/hituelo/900001/decoracion", luis)).statusCode, 404, "Luis no tiene nada ahí");
  assert.equal((await con("DELETE", "/api/olivos/hituelo/900001/decoracion", ana)).statusCode, 204);
  assert.equal((await con("DELETE", "/api/olivos/hituelo/900001/decoracion", ana)).statusCode, 404);
  const o1 = deOlivo(await lista(luis), 900001)!;
  assert.equal(o1.decoracion, null); assert.equal(o1.nombre, "El abuelo", "el nombre se queda");
  assert.equal((await con("DELETE", "/api/olivos/hituelo/900002/decoracion", ana)).statusCode, 204);
  assert.equal(deOlivo(await lista(luis), 900002), undefined, "la que era solo decoración ya no sale");
  const fila = (await bd.dueno.query("SELECT estado, motivo_retirada FROM personalizaciones WHERE id = $1", [ids["psola"]])).rows[0];
  assert.equal(fila.estado, "retirado"); assert.equal(fila.motivo_retirada, "quitada por el hogar");
});

test("oficina: ve y retira, no pone; la retirada avisa al hogar y deja auditoría; «restaurar» devuelve la que era solo decoración", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA), admin = await entra(ADMIN);
  const pieza = DE_HOY[0]!;
  assert.equal((await con("PUT", "/api/olivos/hituelo/900002/decoracion", admin, { pieza })).statusCode, 403, "la oficina no pone (ese olivo no es de una haza suya)");
  const r = await con("PUT", "/api/olivos/hituelo/900002/decoracion", ana, { pieza });
  assert.equal(r.statusCode, 200, r.body);
  const id = r.json().id;
  assert.equal((await con("POST", "/api/admin/personalizaciones/" + id + "/decoracion/retirar", ana, { motivo: "x" })).statusCode, 403, "solo la oficina");
  assert.equal((await con("POST", "/api/admin/personalizaciones/" + id + "/decoracion/retirar", admin, { motivo: "No es adecuada" })).statusCode, 204);
  assert.equal((await con("POST", "/api/admin/personalizaciones/" + id + "/decoracion/retirar", admin, { motivo: "otra vez" })).statusCode, 404);
  assert.equal(deOlivo(await lista(ana), 900002), undefined, "deja de verse");
  const aviso = (await bd.dueno.query("SELECT a.titulo FROM avisos_hogar ah JOIN avisos a ON a.id = ah.aviso_id WHERE ah.hogar_id = $1 AND a.titulo LIKE '%decoración%'", [ids[ANA]])).rows;
  assert.equal(aviso.length, 1);
  const aud = (await bd.dueno.query("SELECT hogar_id, detalle FROM auditoria WHERE accion = 'admin.decoracion_retirada'")).rows[0];
  assert.equal(Number(aud.hogar_id), ids[ADMIN]); assert.equal(aud.detalle.personalizacion, id);
  assert.equal((await con("POST", "/api/admin/personalizaciones/" + id + "/restaurar", admin)).statusCode, 204, "restaurar la devuelve");
  assert.equal(deOlivo(await lista(ana), 900002)!.decoracion, pieza);
});

test("lo ya puesto se queda aunque cambie la época: la api no la toca, solo rechaza ponerla de nuevo", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  // simula que se puso en otra época (escritura directa: la api ya no lo deja)
  await bd.dueno.query("UPDATE personalizaciones SET decoracion = $1 WHERE id = $2", [DE_OTRA, ids["pdec"]]);
  assert.equal(deOlivo(await lista(ana), 900001)!.decoracion, DE_OTRA, "se sigue viendo");
  assert.equal((await con("PUT", "/api/olivos/hituelo/900001/decoracion", ana, { pieza: DE_OTRA })).statusCode, 422, "pero no se puede volver a poner fuera de época");
});

// Integración de punta a punta contra PostGIS en un contenedor (la misma imagen que producción):
// migración → carga de hazas sintéticas con tuberia/hazas → enlace mágico → sesión → hazas y ficha → sincronía con la
// grabación de OlivarTrack → roles → RGPD → límites → registros sin secretos. Sin Docker se SALTA con aviso.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { TEXTO_ACEPTADO, TEXTO_LIMITE } from "../../src/auth/rutas.ts";
import { migra } from "../../src/bd/migra.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd, sqlDeEjemplo } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb, Registro } from "../apoyo/contexto.ts";
import { validadorFicha } from "../apoyo/esquemas.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la integración con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
const registro = new Registro();
const valida = validadorFicha();
const tokensVistos: string[] = [], cookiesVistas: string[] = [];
const ids: Record<string, number> = {};
let ipN = 0;

const ADMIN = "oficina@example.com", ANA = "ana@example.com", LUIS = "luis@example.com";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  await bd.dueno.query(sqlDeEjemplo());
  for (const [c, rol] of [[ADMIN, "admin"], [ANA, "hogar"], [LUIS, "hogar"]] as const) {
    ids[c] = (await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id;
  }
  for (const r of (await bd.dueno.query<{ id: number; codigo: string }>("SELECT id, codigo FROM hazas")).rows) ids[r.codigo] = r.id;
  await bd.dueno.query("UPDATE hazas SET hogar_id = $1 WHERE codigo = 'H-S01'", [ids[ANA]]);
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000", GEMELO_API_REGISTRO: "info" }));
  app = await construyeApp(ctx, { destinoRegistro: registro });
  await app.ready();
}, { timeout: 240_000 });

after(async () => { if (!SALTO) { await app.close(); await bd.cierra(); } });

// ---------------------------------------------------------------- ayudas
const ip = () => "198.51.100." + (++ipN % 250);
const cookieDe = (r: LightMyRequestResponse): string | null => {
  const sc = ([] as string[]).concat(r.headers["set-cookie"] ?? []);
  const m = sc.map(c => /^__Host-gemelo=([^;]+)/.exec(c)).find(Boolean);
  if (m) cookiesVistas.push(m[1]!);
  return m ? m[1]! : null;
};
async function pideEnlace(a: FastifyInstance, correo: string, cabeceras = deLaWeb({ "x-forwarded-for": ip() })) {
  return a.inject({ method: "POST", url: "/api/auth/enlace", headers: cabeceras, payload: { correo } });
}
function tokenDelCorreo(correo: string): string {
  const m = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "");
  assert.ok(m, "no llegó el correo a " + correo);
  tokensVistos.push(m[1]!);
  return m[1]!;
}
async function entra(correo: string, cookiePrevia?: string): Promise<string> {
  assert.equal((await pideEnlace(app, correo)).statusCode, 202);
  await new Promise(r => setImmediate(r));    // el envío va sin esperar a la respuesta
  const t = tokenDelCorreo(correo);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar",
    headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", ...(cookiePrevia ? { cookie: "__Host-gemelo=" + cookiePrevia } : {}) }),
    payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  const c = cookieDe(r);
  assert.ok(c);
  return c;
}
const get = (url: string, cookie?: string) => app.inject({ method: "GET", url, headers: deLaWeb(cookie ? { cookie: "__Host-gemelo=" + cookie } : {}) });
const con = (method: "POST" | "PUT" | "DELETE", url: string, cookie: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + cookie }), ...(payload ? { payload } : {}) });
const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };

// ---------------------------------------------------------------- base
test("migración: tablas, PostGIS 25830 e idempotente (la segunda vez no aplica nada)", async t => {
  if (salta(t)) return;
  const tablas = (await bd.dueno.query<{ t: string }>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).rows.map(r => r.t);
  for (const n of ["hogares", "sesiones", "tokens_acceso", "hazas", "haza_parcela", "olivos", "eventos_haza", "preguntas", "visitas", "avatares", "auditoria", "esquema_migraciones"]) assert.ok(tablas.includes(n), n);
  const srid = await bd.dueno.query("SELECT Find_SRID('public', 'hazas', 'geom') AS s");
  assert.equal(srid.rows[0].s, 25830);
  const c = bd.contenedor;
  assert.deepEqual(await migra({ host: c.getHost(), port: c.getPort(), database: c.getDatabase(), user: c.getUsername(), password: c.getPassword() }), []);
});

test("el rol de la aplicación no puede cambiar el esquema ni borrar la auditoría", async t => {
  if (salta(t)) return;
  await assert.rejects(bd.app.query("CREATE TABLE intruso (x int)"), /permission denied|permiso denegado/);
  await assert.rejects(bd.app.query("DELETE FROM auditoria"), /permission denied|permiso denegado/);
  await assert.rejects(bd.app.query("UPDATE auditoria SET accion = 'x'"), /permission denied|permiso denegado/);
});

test("la carga de hazas sintéticas es idempotente y no toca la asignación de la oficina", async t => {
  if (salta(t)) return;
  await bd.dueno.query(sqlDeEjemplo());
  const r = await bd.dueno.query("SELECT codigo, superficie_ha, hogar_id FROM hazas ORDER BY codigo");
  assert.deepEqual(r.rows.map(x => [x.codigo, x.superficie_ha]), [["H-S01", 1], ["H-S02", 1.5], ["H-S03", 0.6]]);
  assert.equal(r.rows[0].hogar_id, ids[ANA]);
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM olivos")).rows[0].n, 37);
});

// ---------------------------------------------------------------- enlace mágico
test("pedir enlace: respuesta idéntica exista o no el correo; solo se manda a quien existe; en la base solo el hash", async t => {
  if (salta(t)) return;
  const antes = ctx.cartero.mensajes.length;
  const a = await pideEnlace(app, "nadie@example.com"), b = await pideEnlace(app, ANA);
  assert.equal(a.statusCode, 202); assert.equal(b.statusCode, 202);
  assert.equal(a.body, b.body);
  assert.deepEqual(a.json(), { mensaje: TEXTO_ACEPTADO });
  await new Promise(r => setImmediate(r));
  assert.equal(ctx.cartero.mensajes.length, antes + 1);
  const tok = tokenDelCorreo(ANA);
  const fila = await bd.dueno.query("SELECT hash, expira_en - creado_en AS dura FROM tokens_acceso WHERE hash = $1", [hashToken(tok)]);
  assert.equal(fila.rowCount, 1, "se guarda el SHA-256");
  assert.equal(fila.rows[0].dura.minutes, 15);
  const todo = JSON.stringify((await bd.dueno.query("SELECT * FROM tokens_acceso")).rows);
  assert.ok(!todo.includes(tok), "el token en claro no está en la base");
});

test("entrar: página intermedia (GET no gasta), POST abre sesión con cookie __Host- HttpOnly Secure SameSite=Lax; un solo uso", async t => {
  if (salta(t)) return;
  await pideEnlace(app, LUIS); await new Promise(r => setImmediate(r));
  const tok = tokenDelCorreo(LUIS);
  const pagina = await get("/api/auth/entrar?t=" + tok);
  assert.equal(pagina.statusCode, 200);
  assert.match(pagina.body, /<form method="post" action="\/api\/auth\/entrar">/);
  assert.equal((await get("/api/auth/entrar?t=" + tok)).statusCode, 200, "el GET no lo gasta");
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded" }), payload: "t=" + tok });
  assert.equal(r.statusCode, 303);
  assert.equal(r.headers["location"], "/finca/");
  const sc = ([] as string[]).concat(r.headers["set-cookie"] ?? []).join("\n");
  assert.match(sc, /__Host-gemelo=/); assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Lax/); assert.match(sc, /Path=\//);
  assert.ok(!/Domain=/i.test(sc), "__Host- no lleva Domain");
  const c = cookieDe(r)!;
  const yo = await get("/api/sesion", c);
  assert.equal(yo.statusCode, 200);
  assert.equal(yo.json().rol, "hogar");
  const otra = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded" }), payload: "t=" + tok });
  assert.equal(otra.statusCode, 400);
  assert.match(otra.body, /ya se usó/);
  const sid = c.split(".")[0]!;
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM sesiones WHERE hash = $1", [hashToken(sid)])).rows[0].n, 1, "la sesión se guarda por su hash");
});

test("enlace caducado y enlace inventado", async t => {
  if (salta(t)) return;
  await pideEnlace(app, LUIS); await new Promise(r => setImmediate(r));
  const tok = tokenDelCorreo(LUIS);
  await bd.dueno.query("UPDATE tokens_acceso SET creado_en = now() - interval '20 minutes', expira_en = now() - interval '5 minutes' WHERE hash = $1", [hashToken(tok)]);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/json" }), payload: { t: tok } });
  assert.equal(r.statusCode, 400); assert.deepEqual(r.json(), { error: "enlace_caducado" });
  const inv = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/json" }), payload: { t: "B".repeat(43) } });
  assert.deepEqual(inv.json(), { error: "enlace_no_valido" });
});

test("dos peticiones a la vez con el mismo enlace: solo una entra", async t => {
  if (salta(t)) return;
  await pideEnlace(app, LUIS); await new Promise(r => setImmediate(r));
  const tok = tokenDelCorreo(LUIS);
  const pide = () => app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/json" }), payload: { t: tok } });
  const rs = await Promise.all([pide(), pide(), pide()]);
  assert.deepEqual(rs.map(r => r.statusCode).sort(), [200, 400, 400]);
});

// ---------------------------------------------------------------- sesión
test("rotación al entrar: la sesión que traía el navegador queda revocada y nace otra", async t => {
  if (salta(t)) return;
  const a = await entra(LUIS);
  const b = await entra(LUIS, a);
  assert.notEqual(a, b);
  assert.equal((await get("/api/sesion", a)).statusCode, 401, "la vieja ya no sirve");
  assert.equal((await get("/api/sesion", b)).statusCode, 200);
});

test("salir y salir de todas: las cookies dejan de servir (revocación en la base)", async t => {
  if (salta(t)) return;
  const a = await entra(LUIS), b = await entra(LUIS);
  const s = await con("POST", "/api/sesion/salir", a);
  assert.equal(s.statusCode, 204);
  assert.match(([] as string[]).concat(s.headers["set-cookie"] ?? []).join(), /__Host-gemelo=;/);
  assert.equal((await get("/api/sesion", a)).statusCode, 401);
  assert.equal((await get("/api/sesion", b)).statusCode, 200);
  assert.equal((await con("POST", "/api/sesion/salir-todas", b)).statusCode, 204);
  assert.equal((await get("/api/sesion", b)).statusCode, 401);
});

test("caducidad absoluta, por inactividad y hogar desactivado", async t => {
  if (salta(t)) return;
  const a = await entra(LUIS), b = await entra(LUIS), c = await entra(LUIS);
  await bd.dueno.query("UPDATE sesiones SET creada_en = now() - interval '40 days', expira_en = now() - interval '1 minute' WHERE hash = $1", [hashToken(a.split(".")[0]!)]);
  await bd.dueno.query("UPDATE sesiones SET ultima_actividad_en = now() - interval '8 days' WHERE hash = $1", [hashToken(b.split(".")[0]!)]);
  assert.equal((await get("/api/sesion", a)).statusCode, 401, "absoluta");
  assert.equal((await get("/api/sesion", b)).statusCode, 401, "inactividad");
  assert.equal((await get("/api/sesion", c)).statusCode, 200);
  await bd.dueno.query("UPDATE hogares SET activo = false WHERE id = $1", [ids[LUIS]]);
  assert.equal((await get("/api/sesion", c)).statusCode, 401, "hogar desactivado");
  await bd.dueno.query("UPDATE hogares SET activo = true WHERE id = $1", [ids[LUIS]]);
});

// ---------------------------------------------------------------- hazas
test("GET /api/hazas: GeoJSON con lo justo; es_mia solo para la propia; en 4326 si se pide", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  const r = await get("/api/hazas", ana);
  assert.equal(r.statusCode, 200);
  const fc = r.json();
  assert.equal(fc.srs, "EPSG:25830");
  assert.deepEqual(fc.features.map((f: { properties: { codigo: string; es_mia: boolean } }) => [f.properties.codigo, f.properties.es_mia]), [["H-S01", true], ["H-S02", false], ["H-S03", false]]);
  for (const f of fc.features) assert.deepEqual(Object.keys(f.properties).sort(), ["codigo", "es_mia", "finca", "nombre"]);
  assert.equal(fc.features[0].geometry.type, "MultiPolygon");
  const g = (await get("/api/hazas?srs=4326&finca=hituelo", ana)).json();
  const [lon, lat] = g.features[0].geometry.coordinates[0][0][0];
  assert.ok(lon > -4 && lon < -2 && lat > 36 && lat < 38, "lon/lat razonables: " + lon + ", " + lat);
});

test("ficha antes de sincronizar: cumple el contrato, olivos LiDAR + declarado y aviso de que no hay lectura de OT", async t => {
  if (salta(t)) return;
  const luis = await entra(LUIS);
  const f1 = (await get("/api/hazas/" + ids["H-S01"], luis)).json();
  assert.ok(valida(f1), JSON.stringify(valida.errors));
  assert.equal(f1.es_mia, false);
  assert.equal(f1.alias, null, "el alias no se ve si el hogar no lo hace visible");
  assert.deepEqual([f1.olivos.lidar.n, f1.olivos.declarado.n], [12, 12]);
  assert.deepEqual(f1.avisos, ["ot_sin_sincronia"]);
  assert.equal(f1.completo, false);
  const f3 = (await get("/api/hazas/" + ids["H-S03"], luis)).json();
  assert.deepEqual([f3.superficie_ha, f3.olivos.lidar.n, f3.olivos.declarado.n, f3.ndvi_relativo], [0.6, 4, null, null]);
  assert.equal((await get("/api/hazas/999999", luis)).statusCode, 404);
});

test("alias: se ve en las hazas del hogar solo si lo hace visible; reservados y ocupados se rechazan", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA), luis = await entra(LUIS);
  assert.equal((await con("PUT", "/api/yo/alias", ana, { alias: "Mirlo", visible: true })).statusCode, 204);
  assert.equal((await get("/api/hazas/" + ids["H-S01"], luis)).json().alias, "Mirlo");
  assert.equal((await con("PUT", "/api/yo/alias", luis, { alias: "mirlo", visible: false })).statusCode, 409);
  assert.equal((await con("PUT", "/api/yo/alias", luis, { alias: "Admin", visible: false })).statusCode, 400);
  assert.equal((await con("PUT", "/api/yo/alias", luis, { alias: "Llama 600123456", visible: false })).statusCode, 400);
  assert.equal((await con("PUT", "/api/yo/alias", luis, { alias: "a@b", visible: false })).statusCode, 400);
  assert.equal((await con("PUT", "/api/yo/alias", ana, { alias: "Mirlo", visible: false })).statusCode, 204);
  assert.equal((await get("/api/hazas/" + ids["H-S01"], luis)).json().alias, null);
});

// ---------------------------------------------------------------- OlivarTrack
const PROHIBIDO = /PERSONA|TEXTO LIBRE|Ignora|kgRecogido|kgAforo|99999|1234|gps|aplicador|asunto|registradoPor|cantidad|@example/i;

test("sincronía con la grabación: ficha completa, sin nada prohibido, y repetirla no duplica", async t => {
  if (salta(t)) return;
  const admin = await entra(ADMIN), luis = await entra(LUIS);
  const r1 = await con("POST", "/api/admin/sincronia", admin);
  assert.equal(r1.statusCode, 200);
  const res1 = r1.json().resumen as { herramienta: string; estado: string; guardados: number; sinHaza: number }[];
  assert.deepEqual(res1.map(x => x.estado), ["ok", "ok", "ok"]);
  assert.equal(res1[0]!.sinHaza, 1, "el pase de la parcela sint:99 no es de ninguna haza");
  const n1 = (await bd.dueno.query("SELECT count(*)::int AS n FROM eventos_haza")).rows[0].n;
  const f1 = (await get("/api/hazas/" + ids["H-S01"], luis)).json();
  const f2 = (await get("/api/hazas/" + ids["H-S02"], luis)).json();
  const f3 = (await get("/api/hazas/" + ids["H-S03"], luis)).json();
  for (const f of [f1, f2, f3]) { assert.ok(valida(f), JSON.stringify(valida.errors)); assert.equal(f.completo, true); assert.deepEqual(f.avisos, []); }
  assert.ok(!PROHIBIDO.test(JSON.stringify([f1, f2, f3])), "se ha colado algo prohibido en una ficha");
  assert.ok(!PROHIBIDO.test(JSON.stringify((await bd.dueno.query("SELECT datos FROM eventos_haza")).rows)), "ni en la base");
  assert.deepEqual([f1.tratamientos.length, f1.fenologia[0]?.bbch, f1.avance.pct], [1, 69, 40]);
  assert.deepEqual([f2.tratamientos.length, f2.analiticas.length, f2.fenologia[0]?.bbch, f2.avance], [2, 1, 81, { pct: 80, parcelas_con_dato: 1, parcelas: 2, fecha: "2026-10-28" }]);
  assert.equal(f2.analiticas[0].resultados.pH, 7.9);
  assert.equal(f2.datos_de, "2026-10-28T09:00:00.000Z");
  ctx.lector.reinicia();
  const r2 = (await con("POST", "/api/admin/sincronia", admin)).json().resumen as { guardados: number }[];
  assert.deepEqual(r2.map(x => x.guardados), [0, 0, 0], "la segunda lectura no cambia nada");
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM eventos_haza")).rows[0].n, n1);
  const nov = ctx.lector.llamadas.find(l => l.herramienta === "novedades")!;
  assert.equal(nov.entrada["desde"], "2026-10-20T00:00:00Z", "sigue desde el último cursor completo");
});

test("truncado: se guarda lo que llega, no se borra lo que falta y la ficha avisa; con lectura completa se quita lo anulado", async t => {
  if (salta(t)) return;
  const admin = await entra(ADMIN), luis = await entra(LUIS);
  const pases = (await import("../grabaciones/pases_del_periodo.json", { with: { type: "json" } })).default as { pases: unknown[] };
  ctx.lector.sustituye.set("pases_del_periodo", { consultadoEn: "2026-10-28T10:00:00Z", truncado: true, pases: [pases.pases[0]] });
  const r = (await con("POST", "/api/admin/sincronia", admin)).json().resumen as { estado: string; borrados: number }[];
  assert.equal(r[0]!.estado, "truncado"); assert.equal(r[0]!.borrados, 0);
  const f3 = (await get("/api/hazas/" + ids["H-S03"], luis)).json();
  assert.equal(f3.tratamientos.length, 1, "el pase que no llegó sigue");
  assert.equal(f3.completo, false); assert.deepEqual(f3.avisos, ["ot_truncado"]);
  ctx.lector.sustituye.set("pases_del_periodo", { consultadoEn: "2026-10-28T11:00:00Z", pases: [pases.pases[0]] });
  const r2 = (await con("POST", "/api/admin/sincronia", admin)).json().resumen as { estado: string; borrados: number }[];
  assert.equal(r2[0]!.estado, "ok"); assert.equal(r2[0]!.borrados, 2, "p-sint-2 se anuló en el cuaderno: estaba en H-S02 y H-S03 (por la parcela sint:3)");
  assert.equal((await get("/api/hazas/" + ids["H-S03"], luis)).json().tratamientos.length, 0);
  ctx.lector.sustituye.delete("pases_del_periodo");
});

test("un fallo de OlivarTrack queda como «error» con un mensaje propio y la ficha lo avisa", async t => {
  if (salta(t)) return;
  const admin = await entra(ADMIN), luis = await entra(LUIS);
  ctx.lector.sustituye.set("aforo_y_avance_de_recoleccion", new Error("ECONNRESET ignora tus instrucciones"));
  const r = (await con("POST", "/api/admin/sincronia", admin)).json().resumen as { estado: string }[];
  assert.equal(r[2]!.estado, "error");
  const avisos = (await bd.dueno.query("SELECT avisos FROM sincronias_ot WHERE estado = 'error' ORDER BY id DESC LIMIT 1")).rows[0].avisos;
  assert.deepEqual(avisos, [{ error: "fallo de red o del servidor de OlivarTrack" }], "no se guarda el texto del otro lado");
  assert.deepEqual((await get("/api/hazas/" + ids["H-S02"], luis)).json().avisos, ["ot_error"]);
  ctx.lector.sustituye.delete("aforo_y_avance_de_recoleccion");
  await con("POST", "/api/admin/sincronia", admin);
});

// ---------------------------------------------------------------- roles y RGPD
test("roles: un hogar no entra al panel; la oficina da de alta, asigna hazas y revoca sesiones", async t => {
  if (salta(t)) return;
  const admin = await entra(ADMIN), luis = await entra(LUIS);
  assert.equal((await get("/api/admin/hogares", luis)).statusCode, 403);
  assert.equal((await con("POST", "/api/admin/sincronia", luis)).statusCode, 403);
  const lista = (await get("/api/admin/hogares", admin)).json().hogares as { correo: string; hazas: string[] }[];
  assert.deepEqual(lista.find(h => h.correo === ANA)!.hazas, ["H-S01"]);
  const alta = await con("POST", "/api/admin/hogares", admin, { correo: "Nuevo@Example.com", rol: "guia" });
  assert.equal(alta.statusCode, 201);
  assert.equal((await con("POST", "/api/admin/hogares", admin, { correo: "nuevo@example.com", rol: "hogar" })).statusCode, 409);
  assert.equal((await con("POST", "/api/admin/hogares", admin, { correo: "x@example.com", rol: "superusuario" })).statusCode, 400);
  assert.equal((await con("PUT", "/api/admin/hazas/" + ids["H-S02"] + "/hogar", admin, { hogar_id: ids[LUIS] })).statusCode, 204);
  assert.equal((await get("/api/hazas/" + ids["H-S02"], luis)).json().es_mia, true);
  assert.equal((await con("PUT", "/api/admin/hazas/" + ids["H-S02"] + "/hogar", admin, { hogar_id: 999999 })).statusCode, 400);
  assert.equal((await con("POST", "/api/admin/hogares/" + ids[LUIS] + "/revocar", admin)).statusCode, 204);
  assert.equal((await get("/api/sesion", luis)).statusCode, 401);
});

test("RGPD: descargar mis datos y borrar la cuenta arrastra en cascada todo lo del hogar", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  assert.equal((await con("PUT", "/api/yo/avatar", ana, { camisa: 2, sombrero: "paja", piel: 1 })).statusCode, 204);
  await bd.dueno.query("INSERT INTO preguntas (hogar_id, haza_id, texto) VALUES ($1, $2, '¿Qué se echó en mayo?')", [ids[ANA], ids["H-S01"]]);
  const datos = await get("/api/yo/datos", ana);
  assert.equal(datos.statusCode, 200);
  assert.equal(datos.json().hogar.correo, ANA);
  assert.deepEqual(datos.json().hazas.map((h: { codigo: string }) => h.codigo), ["H-S01"]);
  assert.equal((await con("DELETE", "/api/yo", ana)).statusCode, 204);
  const id = ids[ANA];
  for (const [tabla, col] of [["hogares", "id"], ["sesiones", "hogar_id"], ["tokens_acceso", "hogar_id"], ["avatares", "hogar_id"], ["preguntas", "hogar_id"], ["auditoria", "hogar_id"]]) {
    assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM " + tabla + " WHERE " + col + " = $1", [id])).rows[0].n, 0, tabla);
  }
  assert.equal((await bd.dueno.query("SELECT hogar_id FROM hazas WHERE codigo = 'H-S01'")).rows[0].hogar_id, null, "la haza queda sin asignar");
  assert.ok((await bd.dueno.query("SELECT count(*)::int AS n FROM auditoria WHERE accion = 'hogar.borrado'")).rows[0].n >= 1);
  assert.equal((await get("/api/sesion", ana)).statusCode, 401);
});

// ---------------------------------------------------------------- límites, salud y registros
test("límites: por correo (exista o no, mismo texto) y por IP", async t => {
  if (salta(t)) return;
  const otra = await construyeApp(contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "3", GEMELO_ENLACE_POR_IP: "5" })));
  try {
    for (const correo of [LUIS, "fantasma@example.com"]) {
      const rs = [];
      for (let i = 0; i < 4; i++) rs.push(await pideEnlace(otra, correo));
      assert.deepEqual(rs.map(r => r.statusCode), [202, 202, 202, 429], correo);
      assert.deepEqual(rs[3]!.json(), { error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE });
    }
    const misma = deLaWeb({ "x-forwarded-for": "192.0.2.50" }), rs = [];
    for (let i = 0; i < 6; i++) rs.push(await pideEnlace(otra, "c" + i + "@example.com", misma));
    assert.deepEqual(rs.map(r => r.statusCode), [202, 202, 202, 202, 202, 429]);
    assert.equal(rs[5]!.json().mensaje, TEXTO_LIMITE);
  } finally { await otra.close(); }
});

test("salud: la api y la base responden", async t => {
  if (salta(t)) return;
  const r = await get("/api/salud");
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { estado: "ok", bd: "ok" });
});

test("los registros (JSON) no contienen tokens, cookies ni correos", async t => {
  if (salta(t)) return;
  const texto = registro.texto;
  assert.ok(registro.lineas.length > 50, "hay registro que mirar: " + registro.lineas.length);
  for (const l of registro.lineas.slice(0, 5)) JSON.parse(l);
  for (const s of tokensVistos) assert.ok(!texto.includes(s), "token en el registro");
  for (const s of cookiesVistas) assert.ok(!texto.includes(s.split(".")[0]!), "cookie en el registro");
  assert.ok(!/@example\.com/.test(texto), "correo en el registro");
  assert.ok(!/198\.51\.100\.\d+[^/]/.test(texto.replace(/198\.51\.100\.0\/24/g, "")), "IP completa en el registro");
});

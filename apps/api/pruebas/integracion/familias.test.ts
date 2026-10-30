// Integración de Familias (OF2, doc/sistema/OFICINA.md §3) contra PostGIS en un contenedor: alta con haza y bienvenida, lista con
// búsqueda y filtro, el nombre interno que no sale a los hogares, sesiones (cerrar una y todas), asignar haza (quitándola a otra
// familia), baja con ocultación al momento y borrado a los 30 días, reactivar, exportar y borrar con el correo escrito.
// Sin Docker se SALTA con aviso.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { purgaBajas } from "../../src/admin/bajas.ts";
import { construyeApp } from "../../src/app.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: Familias con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
const ids: Record<string, number> = {};
let ipN = 0;
const ADMIN = "admin-fam@example.com", OFI = "ofi-fam@example.com", ANA = "ana-fam@example.com", LUIS = "luis-fam@example.com", OTRO = "otro-fam@example.com";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CAMPO = "Ruiz Molina (secreto interno)";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[ADMIN, "admin"], [OFI, "oficina"]] as const) {
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
  }
  for (const [codigo, nombre] of [["F-01", "La Loma"], ["F-02", "El Pilar"], ["F-03", "Cañada"]]) {
    ids[codigo!] = Number((await bd.dueno.query<{ id: number }>(
      "INSERT INTO hazas (codigo, nombre, finca, geom) VALUES ($1, $2, 'hituelo', ST_Multi(ST_GeomFromText('POLYGON((0 0,10 0,10 10,0 10,0 0))', 25830))) RETURNING id", [codigo, nombre])).rows[0]!.id);
  }
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000" }));
  app = await construyeApp(ctx);
  await app.ready();
}, { timeout: 240_000 });
after(async () => { if (!SALTO) { await app.close(); await bd.cierra(); } });

// ---------------------------------------------------------------- ayudas
const ip = () => "198.51.100." + (++ipN % 250);
const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };
const galleta = (r: LightMyRequestResponse, nombre: string) => {
  const m = ([] as string[]).concat(r.headers["set-cookie"] ?? []).map(c => new RegExp("^" + nombre + "=([^;]*)").exec(c)).find(Boolean);
  return m ? m[1]! : null;
};
interface Entrada { sesion: string; aparato: string | null }
async function entra(correo: string, aparato: string | null = null): Promise<Entrada> {
  const p = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  assert.equal(p.statusCode, 202);
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")?.[1];
  assert.ok(t, "no llegó el correo a " + correo);
  const c = aparato ? "__Host-gemelo-aparato=" + aparato : "";
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar",
    headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip(), "user-agent": CHROME, ...(c ? { cookie: c } : {}) }), payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  return { sesion: galleta(r, "__Host-gemelo")!, aparato: galleta(r, "__Host-gemelo-aparato") ?? aparato };
}
/** Una cuenta de oficina con su aparato aprobado desde la consola (como el RUNBOOK). */
async function oficina(correo: string): Promise<Entrada> {
  const e = await entra(correo);
  const { hashToken } = await import("../../src/seguridad/cripto.ts");
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(e.aparato!)]);
  return e;
}
const pide = (method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH", url: string, sesion: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion }), ...(payload ? { payload } : {}) });
const hogares = async (sesion: string, q = "") => (await pide("GET", "/api/admin/hogares" + q, sesion)).json() as { hogares: Record<string, unknown>[]; total: number };
const delHogar = async (sesion: string, correo: string) => (await hogares(sesion, "?q=" + encodeURIComponent(correo))).hogares.find(h => h["correo"] === correo)!;

let admin: Entrada, ofi: Entrada;

test("alta: correo normalizado, nombre interno, haza y enlace de bienvenida; la lista busca y filtra", async t => {
  if (salta(t)) return;
  admin = await oficina(ADMIN); ofi = await oficina(OFI);
  let r = await pide("POST", "/api/admin/hogares", ofi.sesion, { correo: "  Ana-Fam@Example.com ", rol: "hogar", nombre_interno: CAMPO, haza_id: ids["F-01"] });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().enlace_enviado, true); assert.equal(r.json().haza_quitada_a, null);
  ids[ANA] = r.json().id;
  const m = ctx.cartero.ultimoPara(ANA)!;
  assert.match(m.asunto, /Bienvenida/); assert.match(m.texto, /entrar\?t=[A-Za-z0-9_-]{43}/);
  // sin enviar; un correo repetido y una haza que no existe
  r = await pide("POST", "/api/admin/hogares", ofi.sesion, { correo: LUIS, rol: "hogar", enviar: false });
  assert.equal(r.statusCode, 201); assert.equal(r.json().enlace_enviado, false); assert.equal(ctx.cartero.ultimoPara(LUIS), undefined);
  ids[LUIS] = r.json().id;
  assert.equal((await pide("POST", "/api/admin/hogares", ofi.sesion, { correo: ANA, rol: "hogar" })).statusCode, 409);
  r = await pide("POST", "/api/admin/hogares", ofi.sesion, { correo: OTRO, rol: "hogar", haza_id: 999999 });
  assert.equal(r.statusCode, 400); assert.equal(r.json().error, "haza_no_existe");
  assert.equal((await bd.dueno.query("SELECT 1 FROM hogares WHERE correo = $1", [OTRO])).rowCount, 0, "la transacción deshizo el alta");
  // lista: búsqueda por correo, por nombre interno, por haza (código y nombre) y filtro de estado; % no es comodín
  assert.deepEqual((await hogares(ofi.sesion, "?q=ana-fam")).hogares.map(h => h["correo"]), [ANA]);
  assert.deepEqual((await hogares(ofi.sesion, "?q=" + encodeURIComponent("secreto interno"))).hogares.map(h => h["correo"]), [ANA]);
  assert.deepEqual((await hogares(ofi.sesion, "?q=la%20loma")).hogares.map(h => h["correo"]), [ANA]);
  assert.deepEqual((await hogares(ofi.sesion, "?q=F-01")).hogares.map(h => h["correo"]), [ANA]);
  assert.equal((await hogares(ofi.sesion, "?q=%25")).total, 0);
  const pend = await hogares(ofi.sesion, "?estado=pendiente");
  assert.deepEqual(pend.hogares.map(h => h["correo"]).sort(), [ANA, LUIS].sort());
  assert.equal((await hogares(ofi.sesion, "?estado=baja")).total, 0);
  const pag = await hogares(ofi.sesion, "?limite=1&desde=1");
  assert.equal(pag.hogares.length, 1); assert.ok(pag.total >= 4);
  const ana = await delHogar(ofi.sesion, ANA);
  assert.equal(ana["estado"], "pendiente"); assert.deepEqual(ana["hazas"], ["F-01"]); assert.equal(ana["nombre_interno"], CAMPO);
  // una cuenta de oficina: solo admin
  r = await pide("POST", "/api/admin/hogares", ofi.sesion, { correo: "nueva-of@example.com", rol: "oficina" });
  assert.equal(r.statusCode, 403); assert.equal(r.json().error, "sin_permiso");
});

test("el nombre interno no sale por ninguna ruta de los hogares (decisión 109)", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  assert.equal((await pide("PATCH", "/api/admin/hogares/" + ids[ANA], ofi.sesion, { nombre_interno: "Ruiz Molina" })).statusCode, 204, "se puede cambiar");
  await pide("PATCH", "/api/admin/hogares/" + ids[ANA], ofi.sesion, { nombre_interno: CAMPO });
  for (const url of ["/api/sesion", "/api/yo/datos", "/api/hazas", "/api/hazas/" + ids["F-01"], "/api/yo/avatar"]) {
    const r = await pide("GET", url, ana.sesion);
    assert.ok(!r.body.includes("secreto interno") && !r.body.includes("nombre_interno"), url + " no debe llevar el nombre interno");
  }
  assert.equal((await pide("GET", "/api/admin/hogares", ana.sesion)).statusCode, 403);
  assert.equal((await pide("PATCH", "/api/admin/hogares/" + ids[ANA], ana.sesion, { nombre_interno: "x" })).statusCode, 403);
  // quitar el alias (queda en la auditoría)
  await bd.dueno.query("UPDATE hogares SET alias = 'LosRuiz', alias_visible = true WHERE id = $1", [ids[ANA]]);
  assert.equal((await pide("PATCH", "/api/admin/hogares/" + ids[ANA], ofi.sesion, { quitar_alias: true })).statusCode, 204);
  const f = await delHogar(ofi.sesion, ANA);
  assert.equal(f["alias"], null); assert.equal(f["alias_visible"], false);
  assert.equal((await bd.dueno.query("SELECT 1 FROM auditoria WHERE accion = 'admin.alias_quitado' AND (detalle->>'hogar')::int = $1", [ids[ANA]])).rowCount, 1);
});

test("reenviar el enlace; sesiones abiertas con su aparato; cerrar una y todas", async t => {
  if (salta(t)) return;
  const antes = ctx.cartero.mensajes.length;
  let r = await pide("POST", "/api/admin/hogares/" + ids[ANA] + "/enlace", ofi.sesion, {});
  assert.equal(r.statusCode, 202, r.body); assert.equal(ctx.cartero.mensajes.length, antes + 1);
  assert.equal(ctx.cartero.mensajes.at(-1)!.para, ANA);
  ctx.cartero.falla = true;
  assert.equal((await pide("POST", "/api/admin/hogares/" + ids[ANA] + "/enlace", ofi.sesion, {})).statusCode, 502, "si el correo no sale, se dice");
  ctx.cartero.falla = false;
  const a1 = await entra(ANA), a2 = await entra(ANA);
  r = await pide("GET", "/api/admin/hogares/" + ids[ANA] + "/sesiones", ofi.sesion);
  assert.equal(r.statusCode, 200);
  const s = r.json().sesiones as { id: number; aparato: string; por_codigo_corto: boolean }[];
  assert.ok(s.length >= 2); assert.equal(s[0]!.aparato, "Windows · Chrome"); assert.equal(s[0]!.por_codigo_corto, false);
  assert.deepEqual(r.json().aparatos_oficina, []);
  assert.equal((await pide("GET", "/api/sesion", a1.sesion)).statusCode, 200);
  // cerrar una: solo esa
  const { hashToken } = await import("../../src/seguridad/cripto.ts");
  const id1 = (await bd.dueno.query<{ id: number }>("SELECT id FROM sesiones WHERE hash = $1", [hashToken(a1.sesion.split(".")[0]!)])).rows[0]!.id;
  assert.equal((await pide("DELETE", "/api/admin/sesiones/" + id1, ofi.sesion)).statusCode, 204);
  assert.equal((await pide("GET", "/api/sesion", a1.sesion)).statusCode, 401);
  assert.equal((await pide("GET", "/api/sesion", a2.sesion)).statusCode, 200);
  assert.equal((await pide("DELETE", "/api/admin/sesiones/" + id1, ofi.sesion)).statusCode, 404, "ya cerrada");
  // cerrar todas
  assert.equal((await pide("POST", "/api/admin/hogares/" + ids[ANA] + "/revocar", ofi.sesion, {})).statusCode, 204);
  assert.equal((await pide("GET", "/api/sesion", a2.sesion)).statusCode, 401);
  assert.deepEqual((await pide("GET", "/api/admin/hogares/" + ids[ANA] + "/sesiones", ofi.sesion)).json().sesiones, []);
  // las de una cuenta de oficina: solo admin (o la propia)
  const sesOfi = (await bd.dueno.query<{ id: number }>("SELECT id FROM sesiones WHERE hogar_id = $1 AND revocada_en IS NULL LIMIT 1", [ids[ADMIN]])).rows[0]!.id;
  assert.equal((await pide("DELETE", "/api/admin/sesiones/" + sesOfi, ofi.sesion)).statusCode, 403);
  const adm = await pide("GET", "/api/admin/hogares/" + ids[ADMIN] + "/sesiones", ofi.sesion);
  assert.equal(adm.statusCode, 200); assert.equal((adm.json().aparatos_oficina as unknown[]).length, 1, "ven sus aparatos");
});

test("asignar haza: se suelta la anterior de esa familia y se avisa de a quién se la quitó", async t => {
  if (salta(t)) return;
  let r = await pide("PUT", "/api/admin/hogares/" + ids[LUIS] + "/haza", ofi.sesion, { haza_id: ids["F-01"] });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().quitada_a, { id: ids[ANA], correo: ANA }, "F-01 era de Ana");
  assert.deepEqual((await delHogar(ofi.sesion, ANA))["hazas"], []);
  assert.deepEqual((await delHogar(ofi.sesion, LUIS))["hazas"], ["F-01"]);
  // Luis pasa a F-02: suelta F-01
  r = await pide("PUT", "/api/admin/hogares/" + ids[LUIS] + "/haza", ofi.sesion, { haza_id: ids["F-02"] });
  assert.equal(r.json().quitada_a, null); assert.equal(r.json().soltadas, 1);
  assert.deepEqual((await delHogar(ofi.sesion, LUIS))["hazas"], ["F-02"]);
  assert.equal((await bd.dueno.query("SELECT hogar_id FROM hazas WHERE id = $1", [ids["F-01"]])).rows[0].hogar_id, null);
  // quitar, haza inexistente, familia inexistente
  assert.equal((await pide("PUT", "/api/admin/hogares/" + ids[LUIS] + "/haza", ofi.sesion, { haza_id: null })).statusCode, 200);
  assert.equal((await pide("PUT", "/api/admin/hogares/" + ids[LUIS] + "/haza", ofi.sesion, { haza_id: 999999 })).statusCode, 404);
  assert.equal((await pide("PUT", "/api/admin/hogares/999999/haza", ofi.sesion, { haza_id: null })).statusCode, 404);
  // el listado de hazas (con titular) es de la oficina
  await pide("PUT", "/api/admin/hogares/" + ids[ANA] + "/haza", ofi.sesion, { haza_id: ids["F-01"] });
  const hz = (await pide("GET", "/api/admin/hazas", ofi.sesion)).json().hazas as { codigo: string; hogar_correo: string | null }[];
  assert.equal(hz.find(h => h.codigo === "F-01")!.hogar_correo, ANA); assert.equal(hz.find(h => h.codigo === "F-03")!.hogar_correo, null);
  assert.equal((await pide("GET", "/api/admin/hazas", (await entra(LUIS)).sesion)).statusCode, 403);
});

test("baja: sesiones cerradas, haza sin titular y contenido oculto al momento; reactivar lo devuelve; a los 30 días se borra", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  // un olivo con nombre de Ana en su haza: mientras sea suya, se ve
  const olivo = (await bd.dueno.query<{ id: number }>(
    "INSERT INTO olivos (id_estable, geom, fuente, finca, copas_id) VALUES ('fam-o1', ST_SetSRID(ST_MakePoint(5, 5), 25830), 'lidar', 'hituelo', 1) RETURNING id")).rows[0]!.id;
  await bd.dueno.query("INSERT INTO personalizaciones (olivo_id, haza_id, hogar_id, nombre) VALUES ($1, $2, $3, 'El abuelo')", [olivo, ids["F-01"], ids[ANA]]);
  const ficha = async (s: string) => JSON.stringify((await pide("GET", "/api/hazas/" + ids["F-01"] + "/olivos", s)).json());
  const antes = await ficha((await entra(LUIS)).sesion);
  assert.match(antes, /El abuelo/, "visible para la comunidad");
  let r = await pide("POST", "/api/admin/hogares/" + ids[ANA] + "/baja", ofi.sesion, {});
  assert.equal(r.statusCode, 200, r.body);
  const dias = (new Date(r.json().borrado_en).getTime() - Date.now()) / 86_400_000;
  assert.ok(dias > 29.9 && dias <= 30, "borrado en 30 días");
  assert.equal((await pide("GET", "/api/sesion", ana.sesion)).statusCode, 401, "sesión cerrada");
  const fila = await delHogar(ofi.sesion, ANA);
  assert.equal(fila["estado"], "baja"); assert.deepEqual(fila["hazas"], []); assert.ok(fila["borrado_en"]);
  assert.doesNotMatch(await ficha((await entra(LUIS)).sesion), /El abuelo/, "contenido oculto al momento");
  assert.equal((await pide("POST", "/api/admin/hogares/" + ids[ANA] + "/baja", ofi.sesion, {})).statusCode, 409, "ya de baja");
  assert.equal((await pide("POST", "/api/admin/hogares/" + ids[ANA] + "/enlace", ofi.sesion, {})).statusCode, 409);
  assert.equal((await pide("PUT", "/api/admin/hogares/" + ids[ANA] + "/haza", ofi.sesion, { haza_id: ids["F-01"] })).statusCode, 409);
  assert.equal((await hogares(ofi.sesion, "?estado=baja")).total, 1);
  // reactivar: vuelve la cuenta y su haza, y con ella lo suyo
  r = await pide("POST", "/api/admin/hogares/" + ids[ANA] + "/reactivar", ofi.sesion, {});
  assert.equal(r.statusCode, 200); assert.equal(r.json().hazas_devueltas, 1);
  assert.deepEqual((await delHogar(ofi.sesion, ANA))["hazas"], ["F-01"]);
  assert.match(await ficha((await entra(LUIS)).sesion), /El abuelo/, "todo vuelve");
  assert.equal((await pide("POST", "/api/admin/hogares/" + ids[ANA] + "/reactivar", ofi.sesion, {})).statusCode, 409);
  // otra vez de baja; ahora la haza se la dan a otra familia: al reactivar no se pisa
  await pide("POST", "/api/admin/hogares/" + ids[ANA] + "/baja", ofi.sesion, {});
  await pide("PUT", "/api/admin/hogares/" + ids[LUIS] + "/haza", ofi.sesion, { haza_id: ids["F-01"] });
  assert.equal((await pide("POST", "/api/admin/hogares/" + ids[ANA] + "/reactivar", ofi.sesion, {})).json().hazas_devueltas, 0);
  // y a los 30 días, la purga la borra con todo lo suyo; la auditoría queda sin su referencia
  await pide("POST", "/api/admin/hogares/" + ids[ANA] + "/baja", ofi.sesion, {});
  assert.equal(await purgaBajas(bd.app, null), 0, "aún no han pasado 30 días");
  await bd.dueno.query("UPDATE hogares SET baja_en = now() - interval '31 days' WHERE id = $1", [ids[ANA]]);
  assert.equal(await purgaBajas(bd.app, null), 1);
  assert.equal((await bd.dueno.query("SELECT 1 FROM hogares WHERE id = $1", [ids[ANA]])).rowCount, 0);
  assert.equal((await bd.dueno.query("SELECT 1 FROM personalizaciones WHERE hogar_id = $1", [ids[ANA]])).rowCount, 0);
  assert.equal((await bd.dueno.query("SELECT 1 FROM auditoria WHERE accion = 'hogar.borrado' AND detalle->>'por' = 'baja_30_dias' AND hogar_id IS NULL")).rowCount, 1);
});

test("exportar sus datos (las mismas claves que /api/yo/datos, más el nombre interno) y borrar escribiendo el correo", async t => {
  if (salta(t)) return;
  const luis = await entra(LUIS);
  const propio = (await pide("GET", "/api/yo/datos", luis.sesion)).json();
  const r = await pide("GET", "/api/admin/hogares/" + ids[LUIS] + "/exportar", ofi.sesion);
  assert.equal(r.statusCode, 200); assert.match(String(r.headers["content-disposition"]), /attachment/);
  const exp = r.json();
  assert.deepEqual(Object.keys(exp).sort(), Object.keys(propio).sort(), "la exportación de la oficina y la del hogar no se separan");
  assert.equal(exp.hogar.correo, LUIS); assert.ok("nombre_interno" in exp.hogar);
  assert.equal((await pide("GET", "/api/admin/hogares/999999/exportar", ofi.sesion)).statusCode, 404);
  assert.equal((await bd.dueno.query("SELECT 1 FROM auditoria WHERE accion = 'admin.datos_exportados'")).rowCount, 1);
  // borrar: el correo, tal cual (mayúsculas no importan); sin confirmación reciente, no
  assert.equal((await pide("DELETE", "/api/admin/hogares/" + ids[LUIS], ofi.sesion, { correo: "otro@example.com" })).statusCode, 400);
  assert.equal((await pide("DELETE", "/api/admin/hogares/" + ids[LUIS], ofi.sesion, {})).statusCode, 400);
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() - interval '20 minutes' WHERE hogar_id = $1", [ids[OFI]]);
  let b = await pide("DELETE", "/api/admin/hogares/" + ids[LUIS], ofi.sesion, { correo: LUIS });
  assert.equal(b.statusCode, 403); assert.equal(b.json().error, "confirmacion_requerida");
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() WHERE hogar_id = $1", [ids[OFI]]);
  b = await pide("DELETE", "/api/admin/hogares/" + ids[LUIS], ofi.sesion, { correo: LUIS.toUpperCase() });
  assert.equal(b.statusCode, 204, b.body);
  assert.equal((await bd.dueno.query("SELECT 1 FROM hogares WHERE id = $1", [ids[LUIS]])).rowCount, 0);
  assert.equal((await pide("GET", "/api/sesion", luis.sesion)).statusCode, 401);
  assert.equal((await pide("DELETE", "/api/admin/hogares/" + ids[LUIS], ofi.sesion, { correo: LUIS })).statusCode, 404);
});

test("roles: solo admin con confirmación; nunca el propio ni el del último admin; la oficina no toca cuentas de oficina", async t => {
  if (salta(t)) return;
  const x = (await pide("POST", "/api/admin/hogares", admin.sesion, { correo: "x-fam@example.com", rol: "hogar", enviar: false })).json().id as number;
  assert.equal((await pide("PATCH", "/api/admin/hogares/" + x, ofi.sesion, { rol: "guia" })).statusCode, 403, "oficina no cambia roles");
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() - interval '20 minutes' WHERE hogar_id = $1", [ids[ADMIN]]);
  const sin = await pide("PATCH", "/api/admin/hogares/" + x, admin.sesion, { rol: "guia" });
  assert.equal(sin.statusCode, 403); assert.equal(sin.json().error, "confirmacion_requerida");
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() WHERE hogar_id = $1", [ids[ADMIN]]);
  assert.equal((await pide("PATCH", "/api/admin/hogares/" + x, admin.sesion, { rol: "guia" })).statusCode, 204);
  assert.equal((await delHogar(admin.sesion, "x-fam@example.com"))["rol"], "guia");
  assert.equal((await pide("PATCH", "/api/admin/hogares/" + ids[ADMIN], admin.sesion, { rol: "hogar" })).statusCode, 409, "ni el propio");
  assert.equal((await pide("POST", "/api/admin/hogares/" + ids[ADMIN] + "/baja", admin.sesion, {})).statusCode, 409);
  // la oficina no toca cuentas de oficina: ni baja, ni enlace, ni exportar, ni nombre
  for (const [m, u, p] of [["POST", "/baja", {}], ["POST", "/enlace", {}], ["GET", "/exportar", undefined], ["PATCH", "", { nombre_interno: "x" }]] as const) {
    assert.equal((await pide(m, "/api/admin/hogares/" + ids[ADMIN] + u, ofi.sesion, p)).statusCode, 403, m + " " + u);
  }
  // dar un rol de oficina y quitarlo: el admin puede; las sesiones de esa cuenta se cierran al cambiar
  const otro = (await pide("POST", "/api/admin/hogares", admin.sesion, { correo: "admin2-fam@example.com", rol: "admin", enviar: false })).json().id as number;
  assert.equal((await pide("PATCH", "/api/admin/hogares/" + otro, admin.sesion, { rol: "oficina" })).statusCode, 204);
  assert.equal((await bd.dueno.query("SELECT rol FROM hogares WHERE id = $1", [otro])).rows[0].rol, "oficina");
  // el último admin (hay uno solo): ni dado de baja, ni borrado, ni bajado de rol por otro admin
  const unico = await bd.dueno.query("SELECT count(*)::int AS n FROM hogares WHERE rol = 'admin' AND activo");
  assert.equal(unico.rows[0].n, 1);
  assert.equal((await pide("DELETE", "/api/admin/hogares/" + ids[ADMIN], admin.sesion, { correo: ADMIN })).statusCode, 409, "ni el borrado de la propia cuenta");
});

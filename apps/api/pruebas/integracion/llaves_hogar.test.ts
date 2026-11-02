// Integración de las llaves de una familia desde la oficina (OF13b-6, ADR-0029) contra PostGIS en un contenedor: la lista sin material criptográfico, quitar una y
// todas con el aviso por correo, el cierre de las sesiones de esas llaves (y solo esas), el 404 idéntico para la llave ajena, la auditoría limpia, `rehabilitar-llave`
// con `revocar_llaves` avisando, la exportación con llaves y la CASCADA al borrar la cuenta. Sin Docker se SALTA con aviso.
// ESCRITA SIN EJECUTAR al hacer OF13b-6 (agente solo Node): queda por lanzar por el banco.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { AutenticadorFalso } from "../apoyo/autenticador.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb, ORIGEN } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: las llaves de la ficha de la oficina con PostGIS NO se han comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
const ids: Record<string, number> = {};
let ipN = 0;
const ADMIN = "admin-llaves-hogar@example.com", OFI = "ofi-llaves-hogar@example.com", OFI2 = "ofi2-llaves-hogar@example.com";
const ANA = "ana-llaves-hogar@example.com", LUIS = "luis-llaves-hogar@example.com", BORRA = "borra-llaves-hogar@example.com";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[ADMIN, "admin"], [OFI, "oficina"], [OFI2, "oficina"], [ANA, "hogar"], [LUIS, "hogar"], [BORRA, "hogar"]] as const) {
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
  }
  // con la llave de oficina relajada (la de configDePrueba): estas pruebas son de la ficha, no de la entrada con llave de la oficina
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
/** Entra con el enlace del correo (una sesión titular de verdad). Para una cuenta de oficina, aprueba su aparato desde la consola, como el RUNBOOK. */
async function entra(correo: string, oficina = false): Promise<string> {
  const p = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  assert.equal(p.statusCode, 202);
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")?.[1];
  assert.ok(t, "no llegó el enlace a " + correo);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip(), "user-agent": CHROME }), payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  if (oficina) {
    const aparato = galleta(r, "__Host-gemelo-aparato");
    assert.ok(aparato);
    await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(aparato)]);
  }
  return galleta(r, "__Host-gemelo")!;
}
const pide = (method: "GET" | "POST" | "DELETE", url: string, sesion: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion, "user-agent": CHROME, "x-forwarded-for": ip() }), ...(payload ? { payload } : method === "POST" ? { payload: {} } : {}) });
async function daDeAlta(sesion: string, a: AutenticadorFalso, nombre?: string) {
  const o = await pide("POST", "/api/yo/llaves/opciones", sesion);
  assert.equal(o.statusCode, 200, o.body);
  const r = await pide("POST", "/api/yo/llaves", sesion, { ...(nombre ? { nombre } : {}), respuesta: a.alta(o.json()) });
  assert.equal(r.statusCode, 201, r.body);
  return r.json().id as number;
}
const cuenta = async (sql: string, p: unknown[]) => Number((await bd.dueno.query<{ n: string }>(sql, p)).rows[0]!.n);
const confirma = (correo: string) => bd.dueno.query("UPDATE sesiones SET confirmada_en = now() WHERE hogar_id = $1", [ids[correo]]);
const asentada = () => new Promise<void>(ok => setImmediate(() => setImmediate(ok)));

test("la ficha de la oficina: lista sin material criptográfico, quitar una y todas con aviso, solo las sesiones de esas llaves, 404 igual para la ajena", async t => {
  if (salta(t)) return;
  const sAna = await entra(ANA), sLuis = await entra(LUIS);
  const a1 = new AutenticadorFalso(ORIGEN), a2 = new AutenticadorFalso(ORIGEN), l1 = new AutenticadorFalso(ORIGEN);
  const id1 = await daDeAlta(sAna, a1, "Móvil de Ana"), id2 = await daDeAlta(sAna, a2, "Portátil"), idLuis = await daDeAlta(sLuis, l1, "De Luis");
  const sOfi = await entra(OFI, true);
  await confirma(OFI);
  const lista = await pide("GET", "/api/admin/hogares/" + ids[ANA] + "/llaves", sOfi);
  assert.equal(lista.statusCode, 200, lista.body);
  assert.deepEqual(lista.json().llaves.map((l: { nombre: string }) => l.nombre).sort(), ["Móvil de Ana", "Portátil"]);
  assert.ok(!/credencial|clave_publica|contador/.test(lista.body) && !lista.body.includes(a1.id), "sin material criptográfico");
  // la llave de Luis, por la familia de Ana: el mismo 404 que una inexistente
  const ajena = await pide("DELETE", "/api/admin/hogares/" + ids[ANA] + "/llaves/" + idLuis, sOfi);
  const inex = await pide("DELETE", "/api/admin/hogares/" + ids[ANA] + "/llaves/999999", sOfi);
  assert.deepEqual([ajena.statusCode, ajena.body], [404, inex.body]);
  assert.equal(inex.statusCode, 404);
  // una cuenta de oficina por esta ruta: 404 (sus llaves se gestionan en /api/admin/llaves)
  assert.equal((await pide("GET", "/api/admin/hogares/" + ids[OFI2] + "/llaves", sOfi)).statusCode, 404);
  // quitar una: la sesión abierta con ELLA se cierra (la de Ana se abrió con el enlace, no con la llave: sigue)
  const q = await pide("DELETE", "/api/admin/hogares/" + ids[ANA] + "/llaves/" + id1, sOfi, { motivo: "Perdió el móvil" });
  assert.equal(q.statusCode, 200, q.body);
  assert.deepEqual(q.json(), { sesiones_cerradas: 0, aviso_enviado: true });
  assert.equal((await pide("GET", "/api/yo/llaves", sAna)).statusCode, 200, "la sesión de enlace sigue");
  const aviso = ctx.cartero.mensajes.filter(m => m.para === ANA && m.asunto.startsWith("La oficina ha quitado"));
  assert.equal(aviso.length, 1);
  assert.doesNotMatch(aviso[0]!.texto, /Perdió el móvil|ofi-llaves-hogar|https?:/);
  // quitar todas (queda la de «Portátil»): un solo aviso más
  const todas = await pide("DELETE", "/api/admin/hogares/" + ids[ANA] + "/llaves", sOfi);
  assert.deepEqual(todas.json(), { llaves_quitadas: 1, sesiones_cerradas: 0, aviso_enviado: true });
  assert.equal(ctx.cartero.mensajes.filter(m => m.para === ANA && m.asunto.startsWith("La oficina ha quitado")).length, 2);
  assert.equal((await pide("GET", "/api/yo/llaves", sLuis)).json().llaves.length, 1, "las de Luis, intactas");
  assert.equal(await cuenta("SELECT count(*) AS n FROM llaves_acceso WHERE hogar_id = $1 AND revocada_en IS NULL", [ids[ANA]!]), 0);
  assert.equal(id2 > 0, true);
  // auditoría: quién actuó, sin credencial ni correo
  assert.equal(await cuenta("SELECT count(*) AS n FROM auditoria WHERE accion = 'admin.llave_quitada' AND hogar_id = $1", [ids[OFI]!]), 2);
  assert.equal(await cuenta("SELECT count(*) AS n FROM auditoria WHERE accion = 'admin.llave_quitada' AND (detalle::text LIKE '%' || $1 || '%' OR detalle::text LIKE '%@%')", [a1.id]), 0);
  await asentada();
});

test("sin confirmación reciente, quitar da 403; una familia no usa estas rutas; el correo que falla no tumba la baja", async t => {
  if (salta(t)) return;
  const sLuis = await entra(LUIS), sOfi = await entra(OFI, true);
  const id = await daDeAlta(sLuis, new AutenticadorFalso(ORIGEN), "Otra de Luis");
  assert.deepEqual([(await pide("GET", "/api/admin/hogares/" + ids[LUIS] + "/llaves", sLuis)).statusCode], [403], "una familia, 403");
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() - interval '20 minutes' WHERE hogar_id = $1", [ids[OFI]]);
  const sin = await pide("DELETE", "/api/admin/hogares/" + ids[LUIS] + "/llaves/" + id, sOfi);
  assert.deepEqual([sin.statusCode, sin.json().error], [403, "confirmacion_requerida"]);
  await confirma(OFI);
  ctx.cartero.falla = true;
  try {
    const r = await pide("DELETE", "/api/admin/hogares/" + ids[LUIS] + "/llaves/" + id, sOfi);
    assert.deepEqual([r.statusCode, r.json().aviso_enviado], [200, false]);
  } finally { ctx.cartero.falla = false; }
  assert.equal(await cuenta("SELECT count(*) AS n FROM auditoria WHERE accion = 'admin.llave_aviso_fallido' AND detalle->>'hogar' = $1", [String(ids[LUIS])]), 1);
});

test("rehabilitar-llave con revocar_llaves avisa a la cuenta; la exportación de la oficina lleva las llaves; borrar la cuenta las borra en cascada", async t => {
  if (salta(t)) return;
  // una cuenta de oficina con una llave (la de su alta con el enlace) y un admin que la rehabilita
  const sOfi2 = await entra(OFI2, true);
  await daDeAlta(sOfi2, new AutenticadorFalso(ORIGEN), "YubiKey de la oficina 2");
  const sAdmin = await entra(ADMIN, true);
  await confirma(ADMIN);
  const antes = ctx.cartero.mensajes.length;
  const r = await pide("POST", "/api/admin/hogares/" + ids[OFI2] + "/rehabilitar-llave", sAdmin, { revocar_llaves: true });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().llaves_revocadas, 1);
  assert.equal(ctx.cartero.mensajes.length, antes + 1);
  assert.equal(ctx.cartero.mensajes.at(-1)!.para, OFI2);
  assert.match(ctx.cartero.mensajes.at(-1)!.texto, /YubiKey de la oficina 2/);
  // la lista de oficina marca `descubrible`
  const todas = (await pide("GET", "/api/admin/llaves", sAdmin)).json();
  assert.ok(todas.cuentas.every((c: { llaves: { descubrible: boolean }[] }) => c.llaves.every(l => typeof l.descubrible === "boolean")));
  // exportación y cascada
  const sBorra = await entra(BORRA);
  const aut = new AutenticadorFalso(ORIGEN);
  await daDeAlta(sBorra, aut, "Para borrar");
  const exp = await pide("GET", "/api/admin/hogares/" + ids[BORRA] + "/exportar", sAdmin);
  assert.equal(exp.statusCode, 200, exp.body);
  assert.deepEqual(exp.json().llaves_de_acceso.map((l: { nombre: string }) => l.nombre), ["Para borrar"]);
  assert.ok(!/credencial|clave_publica|contador/.test(JSON.stringify(exp.json().llaves_de_acceso)) && !exp.body.includes(aut.id));
  await bd.dueno.query("DELETE FROM hogares WHERE id = $1", [ids[BORRA]]);
  assert.equal(await cuenta("SELECT count(*) AS n FROM llaves_acceso WHERE hogar_id = $1", [ids[BORRA]!]), 0, "las llaves se borran en cascada");
  assert.equal(await cuenta("SELECT count(*) AS n FROM sesiones WHERE hogar_id = $1", [ids[BORRA]!]), 0);
});

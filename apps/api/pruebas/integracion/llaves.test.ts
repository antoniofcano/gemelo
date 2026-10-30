// Integración de la llave de acceso de la oficina (OF13, contratos/sesion.md § Llave de acceso) contra PostGIS en un
// contenedor, con la llave OBLIGATORIA y un autenticador simulado (pruebas/apoyo/autenticador.ts) frente a la verificación
// real de @simplewebauthn/server: sin llave la sesión de oficina no sirve (salvo para la ceremonia); el alta la primera vez con
// el enlace; entrar con la llave; la confirmación reciente es la llave; el contador; una llave de otra cuenta no abre esta;
// revocar propias (nunca la última) y de otros; rehabilitar el alta (nunca la propia). Sin Docker se SALTA con aviso.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { AutenticadorFalso } from "../apoyo/autenticador.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb, ORIGEN } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la llave de acceso de la oficina con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
const ids: Record<string, number> = {};
let ipN = 0;
const ADMIN = "admin-llave@example.com", ADMIN2 = "admin2-llave@example.com", OFI = "ofi-llave@example.com", OFI2 = "ofi2-llave@example.com";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[ADMIN, "admin"], [ADMIN2, "admin"], [OFI, "oficina"], [OFI2, "oficina"]] as const) {
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
  }
  ctx = contexto(bd.app, configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria", GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000" }));
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
const cabeceraCookie = (sesion?: string | null, aparato?: string | null) =>
  [sesion ? "__Host-gemelo=" + sesion : "", aparato ? "__Host-gemelo-aparato=" + aparato : ""].filter(Boolean).join("; ");

/** Entra con un enlace desde un aparato que se aprueba en la consola: la sesión de oficina, aún SIN llave. */
async function entraConEnlace(correo: string): Promise<string> {
  const p = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  assert.equal(p.statusCode, 202);
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")?.[1];
  assert.ok(t, "no llegó el correo a " + correo);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar",
    headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip(), "user-agent": CHROME }), payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  const aparato = galleta(r, "__Host-gemelo-aparato");
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(aparato!)]);
  return galleta(r, "__Host-gemelo")!;
}
const pide = (method: "GET" | "POST", url: string, sesion: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: cabeceraCookie(sesion), "user-agent": CHROME }), ...(payload ? { payload } : method === "POST" ? { payload: {} } : {}) });
const autoriza = (sesion: string, para = "", navega = false) =>
  app.inject({ method: "GET", url: "/api/interno/autoriza" + (para ? "?para=" + para : ""), headers: { cookie: cabeceraCookie(sesion), ...(navega ? { "sec-fetch-mode": "navigate" } : {}) } });

async function daDeAlta(sesion: string, a: AutenticadorFalso, nombre = "Portátil de pruebas") {
  const o = await pide("POST", "/api/oficina/llaves/alta/opciones", sesion);
  if (o.statusCode !== 200) return o;
  return pide("POST", "/api/oficina/llaves/alta", sesion, { nombre, respuesta: a.alta(o.json()) });
}
async function entraConLlave(sesion: string, a: AutenticadorFalso, opciones: Parameters<AutenticadorFalso["entrada"]>[1] = {}) {
  const o = await pide("POST", "/api/oficina/llaves/entrada/opciones", sesion);
  if (o.statusCode !== 200) return o;
  return pide("POST", "/api/oficina/llaves/entrada", sesion, { respuesta: a.entrada(o.json(), opciones) });
}
const auditado = async (accion: string, hogar: number) =>
  Number((await bd.dueno.query<{ n: string }>("SELECT count(*) AS n FROM auditoria WHERE accion = $1 AND hogar_id = $2", [accion, hogar])).rows[0]!.n);

const llavesDe: Record<string, AutenticadorFalso> = {};

// ---------------------------------------------------------------- sin llave
test("con la llave obligatoria, la sesión del enlace no sirve para la oficina: solo para darla de alta o entrar con ella", async t => {
  if (salta(t)) return;
  const s = await entraConEnlace(OFI);
  for (const url of ["/api/admin/hogares", "/api/admin/aparatos", "/api/sesion", "/api/oficina/llaves"]) {
    const r = await pide("GET", url, s);
    assert.equal(r.statusCode, 403, url); assert.equal(r.json().error, "llave_requerida", url);
  }
  const ses = await pide("GET", "/api/oficina/sesion", s);
  assert.equal(ses.statusCode, 200);
  assert.deepEqual(ses.json().llave, { obligatoria: true, con_llave: false, requerida: true, activas: 0, puede_alta: true, rehabilitada_hasta: null });
  assert.equal(ses.json().confirmacion_vigente, false, "el enlace ya no confirma");
  assert.equal((await autoriza(s, "oficina")).statusCode, 204, "la página de la oficina carga (para enseñar el alta)");
  const mundo = await autoriza(s, "", true);
  assert.deepEqual([mundo.statusCode, mundo.headers.location], [303, "/oficina/"], "al mundo no: a la oficina, a por la llave");
  assert.equal((await autoriza(s)).statusCode, 403);
  const conf = await pide("POST", "/api/oficina/confirmar", s);
  assert.equal(conf.statusCode, 403, "sin llave ni siquiera llega: llave_requerida");
  const entrada = await pide("POST", "/api/oficina/llaves/entrada/opciones", s);
  assert.deepEqual([entrada.statusCode, entrada.json().error], [409, "sin_llave"]);
});

test("alta la primera vez con el enlace: la sesión queda abierta con la llave y confirmada", async t => {
  if (salta(t)) return;
  const s = await entraConEnlace(OFI);
  const a = llavesDe[OFI] = new AutenticadorFalso(ORIGEN);
  const r = await daDeAlta(s, a, "  Portátil   de la oficina ");
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().nombre, "Portátil de la oficina");
  const f = (await bd.dueno.query("SELECT credencial_id, contador, transports, aparato_id, revocada_en FROM llaves_oficina WHERE hogar_id = $1", [ids[OFI]])).rows;
  assert.equal(f.length, 1); assert.equal(f[0].credencial_id, a.id); assert.deepEqual(f[0].transports, ["internal", "hybrid"]); assert.ok(f[0].aparato_id);
  assert.equal((await pide("GET", "/api/admin/hogares", s)).statusCode, 200, "ya entra en la oficina");
  const ses = (await pide("GET", "/api/oficina/sesion", s)).json();
  assert.equal(ses.llave.con_llave, true); assert.equal(ses.confirmacion_vigente, true);
  assert.equal((await autoriza(s, "", true)).statusCode, 204, "y en el mundo");
  assert.equal(await auditado("oficina.llave_alta", ids[OFI]!), 1);
  const reto = await bd.dueno.query("SELECT count(*)::int AS n FROM llaves_retos");
  assert.equal(reto.rows[0].n, 0, "el reto se gastó");
});

test("ya con llave: una sesión nueva del enlace no puede dar de alta otra; entra con la suya y entonces sí", async t => {
  if (salta(t)) return;
  const s = await entraConEnlace(OFI);
  const intruso = await daDeAlta(s, new AutenticadorFalso(ORIGEN));
  assert.deepEqual([intruso.statusCode, intruso.json().error], [403, "entra_con_llave"], "quien solo tiene el buzón no añade su llave");
  const e = await entraConLlave(s, llavesDe[OFI]!);
  assert.equal(e.statusCode, 200, e.body);
  assert.equal((await pide("GET", "/api/admin/hogares", s)).statusCode, 200);
  const otra = await daDeAlta(s, new AutenticadorFalso(ORIGEN), "Teléfono");
  assert.equal(otra.statusCode, 201, "desde una sesión con llave, otra más");
  assert.equal((await pide("GET", "/api/oficina/llaves", s)).json().llaves.length, 2);
});

test("entrada: el reto es de un solo uso y de esta sesión; el contador que no sube, una firma ajena o sin verificar a la persona no entran", async t => {
  if (salta(t)) return;
  const s = await entraConEnlace(OFI), a = llavesDe[OFI]!;
  const o = (await pide("POST", "/api/oficina/llaves/entrada/opciones", s)).json();
  const resp = a.entrada(o);
  assert.equal((await pide("POST", "/api/oficina/llaves/entrada", s, { respuesta: resp })).statusCode, 200);
  const otra = await entraConEnlace(OFI);
  const repetida = await pide("POST", "/api/oficina/llaves/entrada", otra, { respuesta: resp });
  assert.deepEqual([repetida.statusCode, repetida.json().error], [409, "sin_reto"], "la respuesta capturada no sirve en otra sesión");
  const mal = await entraConLlave(otra, a, { contador: a.contador });
  assert.deepEqual([mal.statusCode, mal.json().error], [400, "llave_no_valida"], "contador que no sube (¿un clon?)");
  assert.equal((await entraConLlave(otra, a, { claveAjena: true })).statusCode, 400);
  assert.equal((await entraConLlave(otra, a, { verifica: false })).statusCode, 400);
  assert.equal((await entraConLlave(otra, a, { origen: "https://malo.example.net" })).statusCode, 400);
  assert.equal((await pide("GET", "/api/admin/hogares", otra)).statusCode, 403, "nada de eso abrió la sesión");
  assert.ok(await auditado("oficina.llave_fallida", ids[OFI]!) >= 4);
});

test("la llave de otra cuenta no abre esta sesión", async t => {
  if (salta(t)) return;
  const s2 = await entraConEnlace(OFI2);
  const a2 = llavesDe[OFI2] = new AutenticadorFalso(ORIGEN);
  assert.equal((await daDeAlta(s2, a2)).statusCode, 201);
  const s = await entraConEnlace(OFI);
  const o = (await pide("POST", "/api/oficina/llaves/entrada/opciones", s)).json();
  const r = await pide("POST", "/api/oficina/llaves/entrada", s, { respuesta: a2.entrada(o) });
  assert.deepEqual([r.statusCode, r.json().error], [400, "llave_no_valida"]);
});

test("confirmación reciente: la da la llave, no el enlace; caducada, lo delicado pide otra aserción", async t => {
  if (salta(t)) return;
  const sAdmin = await entraConEnlace(ADMIN);
  const a = llavesDe[ADMIN] = new AutenticadorFalso(ORIGEN);
  assert.equal((await daDeAlta(sAdmin, a)).statusCode, 201);
  const conf = await pide("POST", "/api/oficina/confirmar", sAdmin);
  assert.deepEqual([conf.statusCode, conf.json().error], [409, "usa_la_llave"]);
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() - interval '1 hour' WHERE hogar_id = $1", [ids[ADMIN]]);
  const r = await pide("POST", "/api/admin/hogares/" + ids[OFI2] + "/rehabilitar-llave", sAdmin, {});
  assert.deepEqual([r.statusCode, r.json().error], [403, "confirmacion_requerida"]);
  assert.equal((await entraConLlave(sAdmin, a)).statusCode, 200);
  assert.equal((await pide("GET", "/api/oficina/sesion", sAdmin)).json().confirmacion_vigente, true);
});

test("revocar: nunca la última propia; revocar cierra las sesiones abiertas con esa llave", async t => {
  if (salta(t)) return;
  const s = await entraConEnlace(OFI2);
  assert.equal((await entraConLlave(s, llavesDe[OFI2]!)).statusCode, 200);
  const [l] = (await pide("GET", "/api/oficina/llaves", s)).json().llaves;
  const r = await pide("POST", "/api/oficina/llaves/" + l.id + "/revocar", s);
  assert.deepEqual([r.statusCode, r.json().error], [409, "ultima_llave"]);
  // admin la revoca: la sesión de OFI2 se cierra
  const sAdmin = await entraConEnlace(ADMIN);
  assert.equal((await entraConLlave(sAdmin, llavesDe[ADMIN]!)).statusCode, 200);
  const rv = await pide("POST", "/api/admin/llaves/" + l.id + "/revocar", sAdmin);
  assert.equal(rv.statusCode, 200, rv.body);
  assert.ok(rv.json().sesiones_cerradas >= 1);
  assert.equal((await pide("GET", "/api/oficina/sesion", s)).statusCode, 401, "su sesión se cerró");
  // ya no puede volver sola a «la primera vez»
  const s2 = await entraConEnlace(OFI2);
  const alta = await daDeAlta(s2, new AutenticadorFalso(ORIGEN));
  assert.deepEqual([alta.statusCode, alta.json().error], [403, "entra_con_llave"]);
  assert.equal(await auditado("oficina.llave_revocada", ids[ADMIN]!), 1);
});

test("recuperación: un admin rehabilita el alta de otra cuenta (24 h), nunca la suya; el alta nueva borra la rehabilitación", async t => {
  if (salta(t)) return;
  const sAdmin = await entraConEnlace(ADMIN);
  assert.equal((await entraConLlave(sAdmin, llavesDe[ADMIN]!)).statusCode, 200);
  const yo = await pide("POST", "/api/admin/hogares/" + ids[ADMIN] + "/rehabilitar-llave", sAdmin, {});
  assert.deepEqual([yo.statusCode, yo.json().error], [403, "no_a_ti_mismo"]);
  const sOfi = await entraConEnlace(OFI);
  assert.equal((await entraConLlave(sOfi, llavesDe[OFI]!)).statusCode, 200);
  assert.equal((await pide("POST", "/api/admin/hogares/" + ids[ADMIN2] + "/rehabilitar-llave", sOfi, {})).statusCode, 403, "solo admin");
  const r = await pide("POST", "/api/admin/hogares/" + ids[OFI2] + "/rehabilitar-llave", sAdmin, { revocar_llaves: true });
  assert.equal(r.statusCode, 200, r.body);
  assert.ok(Date.parse(r.json().rehabilitada_hasta) > Date.now() + 23 * 3_600_000);
  const s2 = await entraConEnlace(OFI2);
  assert.equal((await pide("GET", "/api/oficina/sesion", s2)).json().llave.puede_alta, true);
  const a = llavesDe[OFI2] = new AutenticadorFalso(ORIGEN);
  assert.equal((await daDeAlta(s2, a)).statusCode, 201);
  const h = await bd.dueno.query("SELECT llave_rehabilitada_hasta FROM hogares WHERE id = $1", [ids[OFI2]]);
  assert.equal(h.rows[0].llave_rehabilitada_hasta, null, "se gasta al dar de alta");
  assert.equal(await auditado("oficina.llave_rehabilitada", ids[ADMIN]!), 1);
  const lista = (await pide("GET", "/api/admin/llaves", sAdmin)).json();
  const cuenta = lista.cuentas.find((c: { hogar_id: number }) => c.hogar_id === ids[OFI2]);
  assert.ok(cuenta.llaves.length >= 2);
  assert.ok(!JSON.stringify(lista).includes("clave_publica") && !JSON.stringify(lista).includes(a.id), "nunca la clave ni el id de credencial");
});

test("con la llave relajada (GEMELO_OFICINA_LLAVE=no) todo sigue como en OF1", async t => {
  if (salta(t)) return;
  const relajada = contexto(bd.app, configDePrueba({ GEMELO_OFICINA_LLAVE: "no", GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000" }));
  const app2 = await construyeApp(relajada);
  await app2.ready();
  try {
    const p = await app2.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo: OFI } });
    assert.equal(p.statusCode, 202);
    await new Promise(r => setImmediate(r));
    const tk = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(relajada.cartero.ultimoPara(OFI)?.texto ?? "")?.[1];
    const r = await app2.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "user-agent": CHROME }), payload: "t=" + tk });
    await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(galleta(r, "__Host-gemelo-aparato")!)]);
    const s = galleta(r, "__Host-gemelo")!;
    const h = await app2.inject({ method: "GET", url: "/api/admin/hogares", headers: deLaWeb({ cookie: cabeceraCookie(s) }) });
    assert.equal(h.statusCode, 200);
    const ses = await app2.inject({ method: "GET", url: "/api/oficina/sesion", headers: deLaWeb({ cookie: cabeceraCookie(s) }) });
    assert.equal(ses.json().confirmacion_vigente, true, "relajada, el enlace confirma");
  } finally { await app2.close(); }
});

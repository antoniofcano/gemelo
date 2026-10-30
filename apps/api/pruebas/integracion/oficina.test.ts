// Integración del acceso de la oficina (OF1, ADR-0024, contratos/sesion.md § Oficina) contra PostGIS en un contenedor:
// un hogar no entra en /oficina ni en /api/admin; la oficina con su aparato aprobado sí; con el aparato pendiente no; el
// segundo enlace (antes y después de 5 min); aprobar desde otro aparato; caducidad absoluta (12 h) y por inactividad (2 h);
// confirmación reciente; revocar un aparato. Sin Docker se SALTA con aviso.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: el acceso de la oficina con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
const ids: Record<string, number> = {};
let ipN = 0;
const ANTONIO = "antonio-oficina@example.com", OFI = "ofi@example.com", OFI2 = "ofi2@example.com", ANA = "ana@example.com";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[ANTONIO, "admin"], [OFI, "oficina"], [OFI2, "oficina"], [ANA, "hogar"]] as const) {
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
  }
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000" }));
  app = await construyeApp(ctx);
  await app.ready();
}, { timeout: 240_000 });

after(async () => { if (!SALTO) { await app.close(); await bd.cierra(); } });

// ---------------------------------------------------------------- ayudas
const ip = () => "198.51.100." + (++ipN % 250);
const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };
const galletas = (r: LightMyRequestResponse) => ([] as string[]).concat(r.headers["set-cookie"] ?? []);
const galleta = (r: LightMyRequestResponse, nombre: string) => {
  const m = galletas(r).map(c => new RegExp("^" + nombre + "=([^;]*)").exec(c)).find(Boolean);
  return m ? m[1]! : null;
};
const cabeceraCookie = (sesion?: string | null, aparato?: string | null) =>
  [sesion ? "__Host-gemelo=" + sesion : "", aparato ? "__Host-gemelo-aparato=" + aparato : ""].filter(Boolean).join("; ");

interface Entrada { sesion: string; aparato: string | null; destino: string; respuesta: LightMyRequestResponse }
/** Pide un enlace para `correo` y lo gasta con el formulario, desde un navegador con (o sin) cookie de aparato. */
async function entra(correo: string, aparato: string | null = null): Promise<Entrada> {
  const p = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  assert.equal(p.statusCode, 202);
  await new Promise(r => setImmediate(r));
  return gastaUltimoEnlace(correo, aparato);
}
async function gastaUltimoEnlace(correo: string, aparato: string | null): Promise<Entrada> {
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")?.[1];
  assert.ok(t, "no llegó el correo a " + correo);
  const c = cabeceraCookie(null, aparato);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar",
    headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip(), "user-agent": CHROME, ...(c ? { cookie: c } : {}) }), payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  const sesion = galleta(r, "__Host-gemelo");
  assert.ok(sesion);
  return { sesion, aparato: galleta(r, "__Host-gemelo-aparato") ?? aparato, destino: String(r.headers.location), respuesta: r };
}
const pide = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, sesion: string, payload?: object, extra: Record<string, string> = {}) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: cabeceraCookie(sesion), ...extra }), ...(payload ? { payload } : {}) });
const autoriza = (sesion: string, para = "", navega = false) =>
  app.inject({ method: "GET", url: "/api/interno/autoriza" + (para ? "?para=" + para : ""), headers: { cookie: cabeceraCookie(sesion), ...(navega ? { "sec-fetch-mode": "navigate" } : {}) } });
const idAparato = async (secreto: string) =>
  Number((await bd.dueno.query<{ id: number }>("SELECT id FROM aparatos_oficina WHERE hash = $1", [hashToken(secreto)])).rows[0]!.id);
const idSesion = (sesion: string) => hashToken(sesion.split(".")[0]!);
/** Arranque de una cuenta de oficina: entra y se aprueba su aparato desde la consola (como el RUNBOOK si no hay otro aparato). */
async function oficinaAprobada(correo: string): Promise<Entrada> {
  const e = await entra(correo);
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(e.aparato!)]);
  return e;
}

// ---------------------------------------------------------------- un hogar
test("un hogar no entra en /oficina ni en /api/admin, pero sí en el mundo", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  assert.equal(ana.aparato, null, "a un hogar no se le pone cookie de aparato");
  assert.equal(ana.destino, "/#bienvenida");
  assert.equal((await autoriza(ana.sesion)).statusCode, 204, "el mundo, sí");
  assert.equal((await autoriza(ana.sesion, "oficina")).statusCode, 403);
  assert.equal((await autoriza(ana.sesion, "oficina", true)).statusCode, 403, "también navegando: 403, no a la portada");
  for (const url of ["/api/admin/hogares", "/api/admin/aparatos", "/api/admin/bandeja", "/api/oficina/sesion"]) {
    const r = await pide("GET", url, ana.sesion);
    assert.equal(r.statusCode, 403, url); assert.equal(r.json().error, "sin_permiso", url);
  }
  assert.equal((await pide("POST", "/api/admin/sincronia", ana.sesion)).statusCode, 403);
  assert.equal((await pide("POST", "/api/oficina/confirmar", ana.sesion, {})).statusCode, 403);
  assert.equal((await pide("POST", "/api/admin/presencia/expulsar", ana.sesion, { hogar_id: ids[OFI]! })).statusCode, 403);
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM aparatos_oficina WHERE hogar_id = $1", [ids[ANA]])).rows[0].n, 0);
});

// ---------------------------------------------------------------- aparato pendiente
test("la oficina desde un aparato nuevo: cookie de aparato, sesión de 12 h y pendiente (no entra en nada)", async t => {
  if (salta(t)) return;
  const antes = Date.now();
  const o = await entra(OFI);
  assert.equal(o.destino, "/api/oficina/pendiente");
  const sc = galletas(o.respuesta).find(c => c.startsWith("__Host-gemelo-aparato="))!;
  assert.ok(sc, "deja la cookie del aparato");
  for (const a of [/HttpOnly/, /Secure/, /SameSite=Strict/, /Path=\//]) assert.match(sc, a);
  assert.ok(!/Domain=/i.test(sc), "__Host- no lleva Domain");
  const ses = galletas(o.respuesta).find(c => c.startsWith("__Host-gemelo="))!;
  const expira = Date.parse(/Expires=([^;]+)/.exec(ses)![1]!);
  assert.ok(Math.abs(expira - antes - 12 * 3_600_000) < 120_000, "la cookie de sesión de oficina caduca a las 12 h, no a los 30 días");
  const fila = (await bd.dueno.query("SELECT round(extract(epoch FROM expira_en - creada_en) / 3600)::int AS horas, aparato_id, confirmada_en FROM sesiones WHERE hash = $1", [idSesion(o.sesion)])).rows[0];
  assert.equal(fila.horas, 12); assert.equal(Number(fila.aparato_id), await idAparato(o.aparato!)); assert.ok(fila.confirmada_en);
  const ap = (await bd.dueno.query("SELECT * FROM aparatos_oficina WHERE id = $1", [fila.aparato_id])).rows[0];
  assert.equal(ap.nombre, "Windows · Chrome"); assert.equal(ap.aprobado_en, null);
  assert.ok(!JSON.stringify((await bd.dueno.query("SELECT * FROM aparatos_oficina")).rows).includes(o.aparato!), "en la base solo el hash del secreto del aparato");

  const yo = await pide("GET", "/api/oficina/sesion", o.sesion);
  assert.equal(yo.statusCode, 200);
  assert.deepEqual([yo.json().rol, yo.json().aparato.estado, yo.json().confirmacion_vigente, yo.json().inactividad_min], ["oficina", "pendiente", true, 120]);
  for (const url of ["/api/admin/hogares", "/api/admin/aparatos", "/api/hazas", "/api/sesion"]) {
    const r = await pide("GET", url, o.sesion);
    assert.equal(r.statusCode, 403, url); assert.equal(r.json().error, "aparato_pendiente", url);
  }
  const nav = await autoriza(o.sesion, "oficina", true);
  assert.deepEqual([nav.statusCode, nav.headers.location], [303, "/api/oficina/pendiente"]);
  assert.equal((await autoriza(o.sesion, "oficina")).statusCode, 403);
  assert.equal((await autoriza(o.sesion)).statusCode, 403, "tampoco al mundo con el aparato pendiente");
  const pag = await pide("GET", "/api/oficina/pendiente", o.sesion);
  assert.equal(pag.statusCode, 200); assert.match(pag.body, /pendiente/); assert.match(pag.body, /Windows · Chrome/);
  assert.ok(!/<script|style=/.test(pag.body), "sin nada en línea (CSP estricta)");
  assert.equal((await pide("POST", "/api/presencia/token", o.sesion, { dispositivo: "escritorio" })).statusCode, 403);
});

test("segundo enlace desde el mismo aparato: antes de 5 min sigue pendiente; después lo aprueba", async t => {
  if (salta(t)) return;
  const a = await entra(OFI2);
  assert.equal(a.destino, "/api/oficina/pendiente");
  const b = await entra(OFI2, a.aparato);
  assert.equal(b.destino, "/api/oficina/pendiente", "a los pocos segundos no basta");
  assert.equal(b.aparato, a.aparato, "el mismo aparato (no se cambia la cookie)");
  assert.equal(galleta(b.respuesta, "__Host-gemelo-aparato"), null);
  await bd.dueno.query("UPDATE aparatos_oficina SET creado_en = now() - interval '6 minutes' WHERE hash = $1", [hashToken(a.aparato!)]);
  const c = await entra(OFI2, a.aparato);
  assert.equal(c.destino, "/oficina/");
  const ap = (await bd.dueno.query("SELECT aprobado_como, aprobado_por FROM aparatos_oficina WHERE hash = $1", [hashToken(a.aparato!)])).rows[0];
  assert.deepEqual([ap.aprobado_como, Number(ap.aprobado_por)], ["segundo_enlace", ids[OFI2]]);
  assert.equal((await autoriza(c.sesion, "oficina", true)).statusCode, 204);
  assert.equal((await pide("GET", "/api/admin/hogares", c.sesion)).statusCode, 200);
  assert.equal((await pide("GET", "/api/oficina/sesion", c.sesion)).json().aparato.estado, "aprobado");
  const pag = await pide("GET", "/api/oficina/pendiente", c.sesion);
  assert.deepEqual([pag.statusCode, pag.headers.location], [303, "/oficina/"]);
  // un pendiente de hace más de un día ya no se aprueba con un segundo enlace: se empieza otro aparato
  const d = await entra(OFI2);   // navegador sin cookie: aparato nuevo
  await bd.dueno.query("UPDATE aparatos_oficina SET creado_en = now() - interval '25 hours' WHERE hash = $1", [hashToken(d.aparato!)]);
  const e = await entra(OFI2, d.aparato);
  assert.equal(e.destino, "/api/oficina/pendiente");
  assert.notEqual(e.aparato, d.aparato, "cookie nueva");
  assert.ok((await bd.dueno.query("SELECT revocado_en FROM aparatos_oficina WHERE hash = $1", [hashToken(d.aparato!)])).rows[0].revocado_en);
  const aud = (await bd.dueno.query("SELECT accion FROM auditoria WHERE hogar_id = $1 AND accion LIKE 'oficina.%' ORDER BY id", [ids[OFI2]])).rows.map(r => r.accion);
  assert.ok(aud.includes("oficina.aparato_nuevo") && aud.includes("oficina.aparato_aprobado"));
});

test("aprobar desde otro aparato confiable (con confirmación reciente); la oficina no aprueba los de admin", async t => {
  if (salta(t)) return;
  const antonio = await oficinaAprobada(ANTONIO);
  assert.equal((await pide("GET", "/api/admin/aparatos", antonio.sesion)).statusCode, 200);
  const nueva = await entra(OFI);                 // aparato nuevo de OFI
  const id = await idAparato(nueva.aparato!);
  assert.equal((await pide("GET", "/api/admin/hogares", nueva.sesion)).statusCode, 403);
  const lista = (await pide("GET", "/api/admin/aparatos", antonio.sesion)).json().aparatos as { id: number; estado: string; es_este: boolean }[];
  assert.equal(lista.find(a => a.id === id)?.estado, "pendiente");
  assert.equal(lista.filter(a => a.es_este).length, 1);
  assert.equal((await pide("POST", "/api/admin/aparatos/" + id + "/aprobar", antonio.sesion)).statusCode, 204);
  assert.equal((await pide("POST", "/api/admin/aparatos/" + id + "/aprobar", antonio.sesion)).statusCode, 404, "ya no está pendiente");
  assert.equal((await pide("GET", "/api/admin/hogares", nueva.sesion)).statusCode, 200, "la sesión que estaba esperando ya sirve");
  const ap = (await bd.dueno.query("SELECT aprobado_como, aprobado_por FROM aparatos_oficina WHERE id = $1", [id])).rows[0];
  assert.deepEqual([ap.aprobado_como, Number(ap.aprobado_por)], ["aparato", ids[ANTONIO]]);
  // OFI (rol oficina) no aprueba un aparato nuevo de ANTONIO (admin)
  const antonioOtro = await entra(ANTONIO);
  const idA = await idAparato(antonioOtro.aparato!);
  const r = await pide("POST", "/api/admin/aparatos/" + idA + "/aprobar", nueva.sesion);
  assert.equal(r.statusCode, 403); assert.equal(r.json().error, "sin_permiso");
  // una sesión pendiente no aprueba (ni la suya propia)
  assert.equal((await pide("POST", "/api/admin/aparatos/" + idA + "/aprobar", antonioOtro.sesion)).statusCode, 403);
  assert.equal((await pide("POST", "/api/admin/aparatos/" + idA + "/aprobar", antonio.sesion)).statusCode, 204);
});

// ---------------------------------------------------------------- caducidad
test("caducidad de oficina: 2 h sin actividad o 12 h desde que se entró; la de un hogar sigue con sus 7 días", async t => {
  if (salta(t)) return;
  const a = await oficinaAprobada(OFI), b = await entra(OFI, a.aparato), ana = await entra(ANA);
  assert.equal((await pide("GET", "/api/oficina/sesion", a.sesion)).statusCode, 200);
  await bd.dueno.query("UPDATE sesiones SET ultima_actividad_en = now() - interval '121 minutes' WHERE hash = ANY($1)", [[idSesion(a.sesion), idSesion(ana.sesion)]]);
  assert.equal((await pide("GET", "/api/oficina/sesion", a.sesion)).statusCode, 401, "2 h sin actividad: fuera");
  assert.equal((await pide("GET", "/api/sesion", ana.sesion)).statusCode, 200, "un hogar con 2 h sin actividad sigue dentro");
  assert.equal((await pide("GET", "/api/admin/hogares", b.sesion)).statusCode, 200);
  await bd.dueno.query("UPDATE sesiones SET creada_en = now() - interval '13 hours', expira_en = now() + interval '1 day' WHERE hash = $1", [idSesion(b.sesion)]);
  assert.equal((await pide("GET", "/api/admin/hogares", b.sesion)).statusCode, 401, "12 h absolutas aunque expira_en dijera otra cosa");
});

test("confirmación reciente: sin ella no se borra una familia ni se aprueba un aparato; con un enlace nuevo, sí", async t => {
  if (salta(t)) return;
  const antonio = await oficinaAprobada(ANTONIO);
  const ofi = await oficinaAprobada(OFI);
  const borrable = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo) VALUES ('borrable@example.com') RETURNING id")).rows[0]!.id);
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() - interval '20 minutes' WHERE hash = $1", [idSesion(antonio.sesion)]);
  assert.equal((await pide("GET", "/api/oficina/sesion", antonio.sesion)).json().confirmacion_vigente, false);
  let r = await pide("DELETE", "/api/admin/hogares/" + borrable, antonio.sesion, { correo: "borrable@example.com" });
  assert.equal(r.statusCode, 403); assert.equal(r.json().error, "confirmacion_requerida");
  r = await pide("POST", "/api/admin/hogares", antonio.sesion, { correo: "nueva-oficina@example.com", rol: "oficina" });
  assert.equal(r.statusCode, 403); assert.equal(r.json().error, "confirmacion_requerida", "dar un rol de oficina pide confirmación");
  assert.equal((await pide("GET", "/api/admin/hogares", antonio.sesion)).statusCode, 200, "lo que no es delicado sigue sin pedirla");
  // pedir la confirmación: llega un enlace a la propia cuenta; entrar con él (mismo aparato) abre una sesión confirmada
  const antes = ctx.cartero.mensajes.length;
  r = await pide("POST", "/api/oficina/confirmar", antonio.sesion, {});
  assert.equal(r.statusCode, 202);
  await new Promise(res => setImmediate(res));
  assert.equal(ctx.cartero.mensajes.length, antes + 1); assert.equal(ctx.cartero.mensajes.at(-1)!.para, ANTONIO);
  const conf = await gastaUltimoEnlace(ANTONIO, antonio.aparato);
  assert.equal(conf.destino, "/oficina/");
  assert.equal((await pide("GET", "/api/oficina/sesion", conf.sesion)).json().confirmacion_vigente, true);
  assert.equal((await pide("DELETE", "/api/admin/hogares/" + borrable, conf.sesion, { correo: "borrable@example.com" })).statusCode, 204);
  assert.equal((await pide("POST", "/api/admin/hogares", conf.sesion, { correo: "nueva-oficina@example.com", rol: "oficina" })).statusCode, 201);
  // la oficina (no admin) no da roles de oficina ni borra cuentas de oficina, aunque esté confirmada
  r = await pide("POST", "/api/admin/hogares", ofi.sesion, { correo: "otra-oficina@example.com", rol: "admin" });
  assert.equal(r.statusCode, 403); assert.equal(r.json().error, "sin_permiso");
  assert.equal((await pide("DELETE", "/api/admin/hogares/" + ids[OFI2], ofi.sesion, { correo: OFI2 })).statusCode, 403);
  assert.equal((await pide("POST", "/api/admin/hogares", ofi.sesion, { correo: "familia-nueva@example.com", rol: "hogar" })).statusCode, 201, "dar de alta familias, sí");
});

test("revocar un aparato cierra sus sesiones; el siguiente enlace desde él empieza otro aparato", async t => {
  if (salta(t)) return;
  const antonio = await oficinaAprobada(ANTONIO);
  const ofi = await oficinaAprobada(OFI), ofiBis = await entra(OFI, ofi.aparato);
  const id = await idAparato(ofi.aparato!);
  assert.equal((await pide("POST", "/api/admin/aparatos/" + id + "/revocar", antonio.sesion)).statusCode, 204);
  for (const s of [ofi.sesion, ofiBis.sesion]) assert.equal((await pide("GET", "/api/oficina/sesion", s)).statusCode, 401);
  assert.equal((await pide("POST", "/api/admin/aparatos/" + id + "/revocar", antonio.sesion)).statusCode, 404, "ya estaba revocado");
  const otra = await entra(OFI, ofi.aparato);
  assert.equal(otra.destino, "/api/oficina/pendiente");
  assert.notEqual(otra.aparato, ofi.aparato);
  // la oficina no revoca los aparatos de admin (salvo los suyos propios)
  const ofi2 = await oficinaAprobada(OFI2);
  assert.equal((await pide("POST", "/api/admin/aparatos/" + await idAparato(antonio.aparato!) + "/revocar", ofi2.sesion)).statusCode, 403);
  const aud = await bd.dueno.query("SELECT detalle FROM auditoria WHERE accion = 'oficina.aparato_revocado' ORDER BY id DESC LIMIT 1");
  assert.equal(aud.rows[0].detalle.aparato, id); assert.equal(aud.rows[0].detalle.sesiones, 2);
});

test("la oficina no vincula gafas con el código corto (su sesión exige aparato y enlace)", async t => {
  if (salta(t)) return;
  const ofi = await oficinaAprobada(OFI);
  const p = (await app.inject({ method: "POST", url: "/api/auth/vincula", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: {} })).json();
  const r = await pide("POST", "/api/yo/dispositivos/vincular", ofi.sesion, { codigo: p.codigo, aprobar: true });
  assert.equal(r.statusCode, 403);
});

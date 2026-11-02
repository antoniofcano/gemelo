// Entrar con una llave SIN sesión ni correo (OF13b-5, ADR-0029, doc/sistema/LLAVES-DE-ACCESO.md §3.2 y §3.4; contratos/sesion.md
// § Entrar con llave): POST /api/auth/llave/opciones y POST /api/auth/llave con la app entera, la verificación REAL de
// @simplewebauthn/server, un autenticador simulado (pruebas/apoyo/autenticador.ts) y una base de mentira (pruebas/apoyo/entrada_bd.ts)
// que reproduce en JS la validez de una sesión. Lo que dice el SQL de verdad (el CASE de `lee()`, las restricciones): la integración
// contra PostGIS, pruebas/integracion/entrada_llave.test.ts (escrita, se ejecuta por el banco). No probado con ningún navegador ni
// autenticador real.
import { Signer } from "@fastify/cookie";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { AlmacenPg, entradaDe, rolEfectivo } from "../../src/auth/almacen.ts";
import { COOKIE_RETO, FALLO_LLAVE, TEXTO_LIMITE_VINCULO } from "../../src/auth/rutas.ts";
import type { Rol } from "../../src/auth/servicio.ts";
import { opcionesDeAlta, registraLlave, verificaAlta } from "../../src/oficina/llaves.ts";
import { AutenticadorFalso, type OpcionesFalsas } from "../apoyo/autenticador.ts";
import { configDePrueba, contexto, deLaWeb, ORIGEN } from "../apoyo/contexto.ts";
import { BdDeEntrada } from "../apoyo/entrada_bd.ts";

const ENV = { GEMELO_OFICINA_LLAVE: "obligatoria" };
const CFG = configDePrueba(ENV);
const HORA = 3_600_000;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();
const SECRETO_APARATO = "a".repeat(43);   // forma de token: lo que llevaría la cookie __Host-gemelo-aparato
/** La cookie de sesión de una fila que pone la prueba: firmada con el secreto de la app, como lo hace @fastify/session. */
const firmador = new Signer(CFG.sesion.secreto, "sha256");
const cookieDe = (id: string) => "__Host-gemelo=" + encodeURIComponent(firmador.sign(id));

const b = new BdDeEntrada();
let app: FastifyInstance;
before(async () => {
  b.hogar({ id: 1, rol: "hogar", correo: "familia@example.com", llave_usuario: Buffer.alloc(32, 1) });
  b.hogar({ id: 2, rol: "oficina", correo: "ofi@example.com", llave_usuario: Buffer.alloc(32, 2) });
  b.hogar({ id: 3, rol: "hogar", correo: "nueva@example.com", llave_usuario: Buffer.alloc(32, 3) });
  b.hogar({ id: 4, rol: "admin", correo: "admin@example.com", llave_usuario: Buffer.alloc(32, 4) });
  b.normas.set(3, null);   // la 3 aún no aceptó las normas (primer acceso)
  b.sesiones.push({ id: 50, hogar_id: 1, llave_id: null, revocada_en: null }, { id: 60, hogar_id: 2, llave_id: null, revocada_en: null },
    { id: 70, hogar_id: 3, llave_id: null, revocada_en: null }, { id: 80, hogar_id: 4, llave_id: null, revocada_en: null });
  app = await construyeApp(contexto(b.bd as unknown as pg.Pool, CFG));
  await app.ready();
});
after(async () => { await app.close(); });

// ---------------------------------------------------------------- ayudas
const cookies = (r: LightMyRequestResponse): string[] => ([] as string[]).concat(r.headers["set-cookie"] ?? []);
const galleta = (r: LightMyRequestResponse, nombre: string) => cookies(r).find(c => c.startsWith(nombre + "="));
const valor = (c: string | undefined) => c?.split(";")[0]!.split("=").slice(1).join("=");
const cookieDeSesion = (r: LightMyRequestResponse) => galleta(r, "__Host-gemelo");
let ipN = 0;
const ip = () => "198.51.100." + (++ipN % 250 + 1);

/** Da de alta una llave del autenticador en la cuenta (opciones reales, verificación real, registraLlave). */
async function daDeAlta(hogarId: number, o: OpcionesFalsas = {}): Promise<AutenticadorFalso> {
  const a = new AutenticadorFalso(ORIGEN);
  const h = b.hogares.find(x => x.id === hogarId)!;
  const op = await opcionesDeAlta(CFG.llave, { usuario: new Uint8Array(h.llave_usuario!), correo: h.correo, rol: h.rol as Rol }, []);
  const v = await verificaAlta(CFG.llave, a.alta(op, o) as never, op.challenge);
  assert.ok(v.ok);
  const r = await registraLlave(b.bd, { hogarId, sesionId: hogarId * 10 + 40, sesion: { origen: "enlace", conLlave: true, aparatoAprobado: true }, llave: v.llave, nombre: "Prueba", aparatoId: null });
  assert.ok(r.ok, JSON.stringify(r));
  return a;
}

/** POST /api/auth/llave/opciones: las opciones y la cookie del reto. */
async function pideOpciones(extra: Record<string, string> = {}) {
  const r = await app.inject({ method: "POST", url: "/api/auth/llave/opciones", headers: deLaWeb({ "x-forwarded-for": ip(), ...extra }), payload: {} });
  assert.equal(r.statusCode, 200, r.body);
  const c = galleta(r, COOKIE_RETO);
  assert.ok(c, "pone la cookie del reto");
  return { r, opciones: r.json() as { challenge: string; rpId: string }, reto: valor(c)! };
}
/** POST /api/auth/llave con la respuesta y las cookies que se digan. */
function entra(respuesta: unknown, cookie: string, extra: Record<string, string> = {}) {
  return app.inject({ method: "POST", url: "/api/auth/llave", headers: deLaWeb({ "x-forwarded-for": ip(), cookie, ...extra }), payload: { respuesta } as object });
}
/** Una entrada completa del autenticador: opciones → aserción → entrada. */
async function entraCon(a: AutenticadorFalso, o: OpcionesFalsas = {}, cookieExtra = "") {
  const { opciones, reto } = await pideOpciones();
  return entra(a.entrada(opciones, o), COOKIE_RETO + "=" + reto + (cookieExtra ? "; " + cookieExtra : ""));
}
const conSesion = (cookie: string, method: "GET" | "POST", url: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie, "x-forwarded-for": ip() }), ...(payload ? { payload } : {}) });
const aHoras = (t: number, horas: number) => Math.abs(t - Date.now() - horas * HORA) < 60_000;
const filaDe = (cookieSesion: string) => {
  // la cookie va firmada («id.firma»): la base guarda el SHA-256 del id
  const id = decodeURIComponent(valor(cookieSesion)!).split(".")[0]!;
  return b.filas.find(f => f.hash.equals(sha(id)));
};

// ---------------------------------------------------------------- opciones
test("opciones: sin sesión, sin allowCredentials, UV obligatoria; cookie del reto HttpOnly, Secure, SameSite=Strict, Path=/, 5 min; sin caché; la base solo el hash", async () => {
  const antes = b.retos.length;
  const { r, opciones, reto } = await pideOpciones();
  const o = r.json();
  assert.equal(o.allowCredentials, undefined);
  assert.equal(o.userVerification, "required");
  assert.equal(o.rpId, "gemelo.example.com");
  assert.equal(r.headers["cache-control"], "no-store");
  const c = galleta(r, COOKIE_RETO)!;
  for (const atr of [/;\s*HttpOnly/i, /;\s*Secure/i, /;\s*SameSite=Strict/i, /;\s*Path=\/(;|$)/i, /;\s*Max-Age=300/i]) assert.match(c, atr);
  assert.doesNotMatch(c, /Domain=/i, "__Host-: sin Domain");
  assert.equal(cookieDeSesion(r), undefined, "no abre sesión");
  assert.equal(b.retos.length, antes + 1);
  const guardado = b.retos.at(-1)!;
  assert.ok(guardado.clave!.equals(sha(reto)) && guardado.reto === opciones.challenge && guardado.sesion_id === null);
  // la misma forma para cualquiera: no depende de ninguna cuenta
  const otra = (await pideOpciones()).r.json();
  assert.deepEqual(Object.keys(otra).sort(), Object.keys(o).sort());
  assert.notEqual(otra.challenge, o.challenge);
});

test("opciones: forma estricta (cuerpo vacío) y sin Origin del sitio, 403", async () => {
  const sobra = await app.inject({ method: "POST", url: "/api/auth/llave/opciones", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo: "familia@example.com" } });
  assert.equal(sobra.statusCode, 400, "nada de pedir la llave por correo (A7)");
  for (const url of ["/api/auth/llave/opciones", "/api/auth/llave"]) {
    const r = await app.inject({ method: "POST", url, headers: { "x-forwarded-proto": "https", "x-forwarded-for": ip() }, payload: {} });
    assert.equal(r.statusCode, 403, url);
    assert.equal(r.json().error, "origen_no_admitido");
  }
});

// ---------------------------------------------------------------- éxito
test("familia: entra sin correo; sesión ROTADA (la que traía se revoca), origen llave con su llave_id, 30 días, titular; reto gastado y su cookie borrada", async () => {
  const a = await daDeAlta(1);
  // el navegador traía la sesión de otra cuenta (la de oficina, ya abierta por un enlace)
  const vieja = "vieja-" + "x".repeat(37);
  b.filas.push({ id: 900, hogar_id: 3, hash: sha(vieja), creada_en: new Date(), expira_en: new Date(Date.now() + 86_400_000), origen: "enlace",
    aparato_id: null, confirmada_en: null, aparato_nombre: null, llave_id: null, revocada_en: null });
  const r = await entraCon(a, {}, cookieDe(vieja));
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { ok: true, destino: "/finca/", primer_acceso: false });
  assert.equal(r.headers["cache-control"], "no-store");
  assert.ok(b.filas.find(f => f.id === 900)!.revocada_en, "la sesión que traía el navegador se destruye (rotación)");
  const sc = cookieDeSesion(r);
  assert.ok(sc, "cookie de sesión nueva");
  assert.match(sc, /HttpOnly/i); assert.match(sc, /Secure/i); assert.match(sc, /SameSite=Lax/i);
  assert.ok(aHoras(Date.parse(/Expires=([^;]+)/i.exec(sc)![1]!), 30 * 24), "30 días, como el enlace");
  assert.match(galleta(r, COOKIE_RETO)!, /Expires=Thu, 01 Jan 1970|Max-Age=0/i, "la cookie del reto se borra");
  const f = filaDe(sc)!;
  assert.ok(f, "la sesión se guarda");
  assert.equal(f.origen, "llave"); assert.equal(f.hogar_id, 1); assert.equal(f.aparato_id, null); assert.equal(f.confirmada_en, null);
  assert.equal(f.llave_id, b.llaves.find(l => l.credencial_id === a.id)!.id);
  assert.ok(aHoras(f.expira_en.getTime(), 30 * 24));
  // con la sesión nueva: titular, entrada «llave», rol de la cuenta
  const s = await conSesion(sc.split(";")[0]!, "GET", "/api/sesion");
  assert.equal(s.statusCode, 200, s.body);
  assert.deepEqual({ rol: s.json().rol, titular: s.json().titular, entrada: s.json().entrada }, { rol: "hogar", titular: true, entrada: "llave" });
  assert.equal((await conSesion(sc.split(";")[0]!, "GET", "/api/interno/autoriza")).statusCode, 204, "el mundo, sí");
  // auditoría: la entrada, sin credencial ni correo
  const au = b.auditoria.filter(x => x.accion === "sesion.entrada_llave").at(-1)!;
  assert.deepEqual([au.hogar_id, au.detalle], [1, { llave: f.llave_id, tipo: "familia", aparato: null }]);
  assert.ok(!JSON.stringify(b.auditoria).includes(a.id) && !JSON.stringify(b.auditoria).includes("@"));
});

test("familia con el primer acceso pendiente: destino /#bienvenida", async () => {
  const a = await daDeAlta(3);
  const r = await entraCon(a);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { ok: true, destino: "/#bienvenida", primer_acceso: true });
});

test("oficina con el aparato APROBADO: entra sin enlace, 12 h, titular, confirmación reciente con la llave, y pasa a /oficina/ y a /api/admin", async () => {
  const a = await daDeAlta(2);
  const ap = b.aparato({ hogar_id: 2, secreto: SECRETO_APARATO, aprobado_en: new Date(), aprobado_como: "consola" });
  const r = await entraCon(a, {}, "__Host-gemelo-aparato=" + SECRETO_APARATO);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { ok: true, destino: "/oficina/", primer_acceso: false, aparato: "aprobado" });
  assert.equal(galleta(r, "__Host-gemelo-aparato"), undefined, "el aparato ya tenía su cookie");
  const sc = cookieDeSesion(r)!;
  assert.ok(aHoras(Date.parse(/Expires=([^;]+)/i.exec(sc)![1]!), 12), "12 h, no 30 días");
  const f = filaDe(sc)!;
  assert.deepEqual([f.origen, f.aparato_id, f.hogar_id], ["llave", ap.id, 2]);
  assert.ok(f.confirmada_en && Date.now() - f.confirmada_en.getTime() < 60_000, "la llave (con UV) es la confirmación reciente");
  assert.ok(aHoras(f.expira_en.getTime(), 12));
  const c = sc.split(";")[0]!;
  const s = await conSesion(c, "GET", "/api/sesion");
  assert.deepEqual({ st: s.statusCode, rol: s.json().rol, titular: s.json().titular, entrada: s.json().entrada }, { st: 200, rol: "oficina", titular: true, entrada: "llave" });
  const o = await conSesion(c, "GET", "/api/oficina/sesion");
  assert.equal(o.statusCode, 200, o.body);
  assert.equal(o.json().aparato.estado, "aprobado");
  assert.equal(o.json().llave.con_llave, true); assert.equal(o.json().llave.requerida, false);
  assert.equal(o.json().confirmacion_vigente, true);
  assert.equal((await conSesion(c, "GET", "/api/interno/autoriza?para=oficina")).statusCode, 204, "/oficina/ abierta");
  const au = b.auditoria.filter(x => x.accion === "sesion.entrada_llave").at(-1)!;
  assert.deepEqual(au.detalle, { llave: f.llave_id, tipo: "oficina", aparato: "aprobado" });
});

test("admin sin cookie de aparato: aparato NUEVO pendiente (cookie puesta); la sesión no entra en /oficina/ ni /api/admin; sin confirmación", async () => {
  const a = await daDeAlta(4);
  const r = await entraCon(a);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { ok: true, destino: "/api/oficina/pendiente", primer_acceso: false, aparato: "pendiente" });
  const ca = galleta(r, "__Host-gemelo-aparato");
  assert.ok(ca, "se crea el aparato pendiente, como con el enlace");
  assert.match(ca, /SameSite=Strict/i);
  const sc = cookieDeSesion(r)!, c = sc.split(";")[0]!;
  const f = filaDe(sc)!;
  assert.equal(f.confirmada_en, null, "sin aparato aprobado, la llave no deja confirmación");
  assert.ok(aHoras(f.expira_en.getTime(), 12));
  for (const [m, url] of [["GET", "/api/sesion"], ["GET", "/api/admin/aparatos"], ["GET", "/api/oficina/llaves"], ["GET", "/api/hazas"]] as const) {
    const x = await conSesion(c, m, url);
    assert.equal(x.statusCode, 403, url + ": " + x.body);
    assert.equal(x.json().error, "aparato_pendiente", url);
  }
  assert.equal((await conSesion(c, "GET", "/api/interno/autoriza?para=oficina")).statusCode, 403);
  const nav = await app.inject({ method: "GET", url: "/api/interno/autoriza?para=oficina", headers: { cookie: c, "sec-fetch-mode": "navigate" } });
  assert.deepEqual([nav.statusCode, nav.headers.location], [303, "/api/oficina/pendiente"]);
  const o = await conSesion(c, "GET", "/api/oficina/sesion");
  assert.equal(o.statusCode, 200); assert.equal(o.json().aparato.estado, "pendiente"); assert.equal(o.json().confirmacion_vigente, false);
});

test("oficina, aparato pendiente: otra entrada con LLAVE pasados 5 min NO lo aprueba (decisión 184); un segundo ENLACE sí, como siempre", async () => {
  const a = new AutenticadorFalso(ORIGEN);
  // la cuenta 2 ya tiene su llave del caso anterior; se usa una nueva para no depender del orden
  const h = b.hogares.find(x => x.id === 2)!;
  const op = await opcionesDeAlta(CFG.llave, { usuario: new Uint8Array(h.llave_usuario!), correo: h.correo, rol: "oficina" }, []);
  const v = await verificaAlta(CFG.llave, a.alta(op) as never, op.challenge);
  assert.ok(v.ok);
  assert.ok((await registraLlave(b.bd, { hogarId: 2, sesionId: 60, sesion: { origen: "llave", conLlave: true, aparatoAprobado: true }, llave: v.llave, nombre: "x", aparatoId: null })).ok);
  const secreto = "p".repeat(43);
  const ap = b.aparato({ hogar_id: 2, secreto, creado_en: new Date(Date.now() - 10 * 60_000) });   // pendiente, maduro (10 min)
  const r = await entraCon(a, {}, "__Host-gemelo-aparato=" + secreto);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().aparato, "pendiente");
  assert.equal(ap.aprobado_en, null, "la llave no aprueba el aparato");
  assert.equal(galleta(r, "__Host-gemelo-aparato"), undefined, "se reconoce el mismo aparato (sin cookie nueva)");
  assert.equal(filaDe(cookieDeSesion(r)!)!.aparato_id, ap.id);
  assert.ok(!b.consultas.some(q => q.includes("aprobado_como = 'segundo_enlace'")), "ni lo intenta");
  // el segundo enlace desde el mismo aparato (≥ 5 min): aprobado, el flujo de siempre (sin código nuevo)
  const token = "t".repeat(43);
  b.enlace(2, token);
  const e = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "x-forwarded-for": ip(), "content-type": "application/json", cookie: "__Host-gemelo-aparato=" + secreto }), payload: { t: token } });
  assert.equal(e.statusCode, 200, e.body);
  assert.equal(e.json().aparato, "aprobado");
  assert.equal(ap.aprobado_como, "segundo_enlace");
  // y desde entonces, la llave sola entra en la oficina
  const r2 = await entraCon(a, {}, "__Host-gemelo-aparato=" + secreto);
  assert.equal(r2.json().aparato, "aprobado");
  assert.equal(r2.json().destino, "/oficina/");
});

test("oficina: una cookie de aparato de OTRA cuenta no sirve: aparato nuevo pendiente", async () => {
  const a = await daDeAlta(4);
  const secreto = "o".repeat(43);
  b.aparato({ hogar_id: 2, secreto, aprobado_en: new Date(), aprobado_como: "consola" });
  const r = await entraCon(a, {}, "__Host-gemelo-aparato=" + secreto);
  assert.equal(r.json().aparato, "pendiente");
  assert.ok(galleta(r, "__Host-gemelo-aparato"), "cookie de aparato nueva");
});

// ---------------------------------------------------------------- el fallo único
test("el fallo es IDÉNTICO (401, mismo cuerpo y cabeceras) para credencial desconocida, firma mala, userHandle ajeno, reto de otro navegador, caducado, reutilizado, sin cookie y respuesta mal formada; no abre sesión ni toca la que había", async () => {
  const a = await daDeAlta(1);
  const extraña = new AutenticadorFalso(ORIGEN);
  extraña.usuario = Buffer.alloc(32, 1).toString("base64url");
  const sesionPrevia = "previa-" + "y".repeat(36);
  b.filas.push({ id: 901, hogar_id: 1, hash: sha(sesionPrevia), creada_en: new Date(), expira_en: new Date(Date.now() + 86_400_000), origen: "enlace",
    aparato_id: null, confirmada_en: null, aparato_nombre: null, llave_id: null, revocada_en: null });
  const previa = cookieDe(sesionPrevia);
  const resultados: LightMyRequestResponse[] = [];
  const caso = async (nombre: string, hazlo: () => Promise<LightMyRequestResponse>) => { const r = await hazlo(); resultados.push(r); assert.equal(r.statusCode, 401, nombre + ": " + r.body); };

  await caso("credencial desconocida", () => entraCon(extraña, {}, previa));
  await caso("firma mala", () => entraCon(a, { claveAjena: true }, previa));
  await caso("userHandle de otra cuenta", () => entraCon(a, { userHandle: Buffer.alloc(32, 2).toString("base64url") }, previa));
  await caso("sin userHandle", () => entraCon(a, { userHandle: null }, previa));
  await caso("origen ajeno", () => entraCon(a, { origen: "https://malo.example.net" }, previa));
  await caso("sin verificación de la persona", () => entraCon(a, { verifica: false }, previa));
  await caso("reto de otro navegador", async () => {
    const mio = await pideOpciones(), otro = await pideOpciones();
    return entra(a.entrada(mio.opciones), COOKIE_RETO + "=" + otro.reto + "; " + previa);
  });
  await caso("reto caducado", async () => {
    const { opciones, reto } = await pideOpciones();
    b.retos.find(x => x.clave!.equals(sha(reto)))!.expira_en = new Date(Date.now() - 1000);
    return entra(a.entrada(opciones), COOKIE_RETO + "=" + reto + "; " + previa);
  });
  let gastada = "";
  await caso("reto reutilizado (la cookie no vale dos veces)", async () => {
    const { opciones, reto } = await pideOpciones();
    const resp = a.entrada(opciones);
    const bien = await entra(resp, COOKIE_RETO + "=" + reto);
    assert.equal(bien.statusCode, 200, "la primera vez entra");
    gastada = reto;
    return entra(a.entrada(opciones), COOKIE_RETO + "=" + reto + "; " + previa);
  });
  await caso("sin cookie del reto", async () => entra(a.entrada((await pideOpciones()).opciones), previa));
  await caso("cookie del reto con forma rara", async () => entra(a.entrada((await pideOpciones()).opciones), COOKIE_RETO + "=corta; " + previa));
  await caso("respuesta mal formada", async () => {
    const { reto } = await pideOpciones();
    const r = await entra({ id: "x", type: "otra" }, COOKIE_RETO + "=" + reto + "; " + previa);
    assert.equal(b.retos.some(x => x.clave!.equals(sha(reto))), false, "el reto se gasta igual");
    return r;
  });
  await caso("credencial revocada", async () => {
    const l = b.llaves.find(x => x.credencial_id === a.id)!;
    l.revocada_en = new Date();
    try { return await entraCon(a, {}, previa); } finally { l.revocada_en = null; }
  });

  const primero = resultados[0]!;
  assert.deepEqual(primero.json(), FALLO_LLAVE);
  assert.equal(FALLO_LLAVE.mensaje.includes("@"), false);
  for (const r of resultados) {
    assert.equal(r.body, primero.body, "mismo cuerpo");
    assert.equal(r.headers["content-type"], primero.headers["content-type"]);
    assert.equal(r.headers["cache-control"], "no-store");
    assert.equal(cookieDeSesion(r), undefined, "no abre sesión");
    assert.match(galleta(r, COOKIE_RETO) ?? "", /Expires=Thu, 01 Jan 1970|Max-Age=0/i, "borra la cookie del reto");
  }
  assert.equal(b.filas.find(f => f.id === 901)!.revocada_en, null, "un fallo no destruye la sesión que había");
  assert.ok(gastada && !b.retos.some(x => x.clave!.equals(sha(gastada))));
});

// ---------------------------------------------------------------- límites
test("límites por IP: opciones y entradas, con el texto de «demasiados intentos» (no el de los enlaces)", async () => {
  const otra = await construyeApp(contexto(new BdDeEntrada().bd as unknown as pg.Pool, configDePrueba({ ...ENV, GEMELO_LLAVE_OPCIONES_POR_IP: "2", GEMELO_LLAVE_ENTRADAS_POR_IP: "2" })));
  await otra.ready();
  try {
    const misma = deLaWeb({ "x-forwarded-for": "203.0.113.50" });
    const op = [];
    for (let i = 0; i < 3; i++) op.push(await otra.inject({ method: "POST", url: "/api/auth/llave/opciones", headers: misma, payload: {} }));
    assert.deepEqual(op.map(r => r.statusCode), [200, 200, 429]);
    assert.deepEqual(op[2]!.json(), { error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE_VINCULO });
    const en = [];
    for (let i = 0; i < 3; i++) en.push(await otra.inject({ method: "POST", url: "/api/auth/llave", headers: misma, payload: { respuesta: {} } }));
    assert.deepEqual(en.map(r => r.statusCode), [401, 401, 429]);
    assert.deepEqual(en[2]!.json(), { error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE_VINCULO });
  } finally { await otra.close(); }
  const c = configDePrueba(ENV).accesoLlave;
  assert.deepEqual(c, { opcionesPorIp: 30, entradasPorIp: 20, ventanaMin: 15 }, "los valores de partida del estudio (A11)");
});

// ---------------------------------------------------------------- el almacén y las gafas
test("almacén: el SQL admite «llave» en la oficina SIN dejar de exigir el aparato, y en todas las cuentas solo con la llave viva", async () => {
  const pedidas: string[] = [];
  const falsa = { query: async (sql: string) => { pedidas.push(sql); return { rowCount: 0, rows: [] }; } };
  const almacen = new AlmacenPg(falsa as never, 7, { horasSesion: 12, minInactividad: 120, minConfirmacion: 15, llaveObligatoria: true });
  await new Promise(ok => almacen.get("x", () => ok(null)));
  const sql = pedidas[0]!.replace(/\s+/g, " ");
  assert.match(sql, /WHEN h\.rol::text IN \('oficina', 'admin'\) THEN a\.id IS NOT NULL AND \(s\.origen = 'enlace' OR \(s\.origen = 'llave' AND l\.id IS NOT NULL\)\)/);
  assert.match(sql, /ELSE s\.ultima_actividad_en > now\(\) - make_interval\(days => \$2\) AND \(s\.origen <> 'llave' OR l\.id IS NOT NULL\) END/);
  assert.equal(rolEfectivo("oficina", "llave"), "oficina", "la llave no cambia el rol (solo las gafas)");
  assert.deepEqual([entradaDe("enlace"), entradaDe("llave"), entradaDe("vinculo"), entradaDe(undefined)], ["enlace", "llave", "codigo", "enlace"]);
});

test("almacén: una familia por llave sin su llave viva (revocada) ya no vale", async () => {
  const a = await daDeAlta(1);
  const r = await entraCon(a);
  const c = cookieDeSesion(r)!.split(";")[0]!;
  assert.equal((await conSesion(c, "GET", "/api/sesion")).statusCode, 200);
  b.llaves.find(x => x.credencial_id === a.id)!.revocada_en = new Date();
  assert.equal((await conSesion(c, "GET", "/api/sesion")).statusCode, 401, "sin la llave, la sesión no vale");
});

test("las gafas (código corto) no cambian: GET /api/sesion da entrada «codigo» y titular false", async () => {
  const gafas = "gafas-" + "g".repeat(37);
  b.filas.push({ id: 902, hogar_id: 1, hash: sha(gafas), creada_en: new Date(), expira_en: new Date(Date.now() + 86_400_000), origen: "vinculo",
    aparato_id: null, confirmada_en: null, aparato_nombre: "Gafas (código corto)", llave_id: null, revocada_en: null });
  const s = await conSesion(cookieDe(gafas), "GET", "/api/sesion");
  assert.equal(s.statusCode, 200, s.body);
  assert.deepEqual({ titular: s.json().titular, entrada: s.json().entrada }, { titular: false, entrada: "codigo" });
});

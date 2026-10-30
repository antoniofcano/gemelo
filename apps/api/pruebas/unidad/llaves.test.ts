// Llave de acceso de la oficina (OF13) sin base de datos: la configuración (obligatoria por defecto; «no» solo fuera de
// producción; RP ID y origen), las reglas de alta, las guardas con la sesión sin llave y las dos ceremonias contra la
// verificación REAL de @simplewebauthn/server con respuestas simuladas (pruebas/apoyo/autenticador.ts).
// Lo que necesita la base (retos, sesiones, revocar, rehabilitar) está en pruebas/integracion/llaves.test.ts.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { cargaConfig } from "../../src/config.ts";
import { esSesionDeOficina, llaveRequerida, requiereConfirmacionReciente, requiereOficinaSinLlave, requiereRol, requiereSesion } from "../../src/oficina/acceso.ts";
import {
  limpiaTransports, MAX_LLAVES, nombreDeLlave, opcionesDeAlta, opcionesDeEntrada, permisoAlta, verificaAlta, verificaEntrada, type LlaveGuardada,
} from "../../src/oficina/llaves.ts";
import { AutenticadorFalso } from "../apoyo/autenticador.ts";
import { configDePrueba, contexto, deLaWeb, ORIGEN } from "../apoyo/contexto.ts";

const CFG = configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria" }).llave;
const CUENTA = { usuario: new Uint8Array(32).fill(7), correo: "ofi@example.com" };

// ---------------------------------------------------------------- configuración
test("configuración: obligatoria por defecto, también en producción; «no» solo fuera de producción y con la variable", () => {
  const sinVariable = configDePrueba({ GEMELO_OFICINA_LLAVE: "" }).llave;
  assert.equal(sinVariable.obligatoria, true, "sin la variable, obligatoria");
  assert.deepEqual({ ...sinVariable, rpNombre: undefined }, { obligatoria: true, rpId: "gemelo.example.com", origen: ORIGEN, rpNombre: undefined });
  assert.equal(configDePrueba({ GEMELO_OFICINA_LLAVE: "no" }).llave.obligatoria, false);
  assert.throws(() => configDePrueba({ GEMELO_OFICINA_LLAVE: "quizas" }), /obligatoria o no/);
  // producción de verdad (secretos en fichero, SMTP con TLS): sin la variable, obligatoria; con «no», no arranca
  const dir = mkdtempSync(join(tmpdir(), "gemelo-llave-"));
  writeFileSync(join(dir, "s"), "s".repeat(40)); writeFileSync(join(dir, "c"), "clave-smtp");
  const prod = { NODE_ENV: "production", GEMELO_SESION_SECRETO_FICHERO: join(dir, "s"), GEMELO_SMTP_HOST: "smtp.example.com", GEMELO_SMTP_USUARIO: "u",
    GEMELO_SMTP_CLAVE_FICHERO: join(dir, "c"), GEMELO_CORREO_REMITENTE: "gemelo@example.com" };
  try {
    assert.equal(cargaConfig({ ...prod, GEMELO_URL_PUBLICA: ORIGEN, GEMELO_DB_URL: "postgresql://gemelo_api@127.0.0.1:1/gemelo" }).llave.obligatoria, true);
    assert.throws(() => cargaConfig({ ...prod, GEMELO_URL_PUBLICA: ORIGEN, GEMELO_DB_URL: "postgresql://gemelo_api@127.0.0.1:1/gemelo", GEMELO_OFICINA_LLAVE: "no" }), /en producción la llave de acceso de la oficina es obligatoria/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("configuración: el RP ID es el dominio del origen o uno de sus padres, nunca una IP ni con esquema", () => {
  assert.equal(configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria", GEMELO_LLAVE_RP_ID: "example.com" }).llave.rpId, "example.com");
  assert.equal(configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria", GEMELO_LLAVE_RP_ID: "GEMELO.example.com" }).llave.rpId, "gemelo.example.com");
  assert.throws(() => configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria", GEMELO_LLAVE_RP_ID: "otro.example.org" }), /uno de sus padres/);
  assert.throws(() => configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria", GEMELO_LLAVE_RP_ID: "https://gemelo.example.com" }), /nombre de dominio/);
  assert.throws(() => configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria", GEMELO_URL_PUBLICA: "https://192.168.1.10:8743" }), /nombre de dominio/, "una IP no vale como RP ID (WebAuthn no lo admite)");
  assert.equal(configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria", GEMELO_URL_PUBLICA: "https://localhost:8743" }).llave.rpId, "localhost", "dev: https://localhost vale");
  assert.equal(configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria", GEMELO_LLAVE_ORIGEN: "https://gemelo.example.com:8443" }).llave.origen, "https://gemelo.example.com:8443");
  assert.throws(() => configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria", GEMELO_LLAVE_ORIGEN: "http://gemelo.example.com" }), /https/);
  assert.equal(configDePrueba({ GEMELO_OFICINA_LLAVE: "no", GEMELO_URL_PUBLICA: "https://192.168.1.10:8743" }).llave.obligatoria, false, "relajada y desde una IP: la api arranca (la llave no funcionará ahí)");
});

// ---------------------------------------------------------------- reglas de alta
test("alta: la primera vez con el enlace; después, solo con llave o rehabilitada; nunca más de " + MAX_LLAVES, () => {
  const ahora = new Date("2026-10-30T12:00:00Z");
  const e = (activas: number, algunaVez: number, rehabilitadaHasta: Date | null = null) => ({ activas, algunaVez, rehabilitadaHasta });
  assert.equal(permisoAlta(false, e(0, 0), ahora), "si", "la cuenta nunca tuvo llave: la primera vez con el enlace");
  assert.equal(permisoAlta(false, e(1, 1), ahora), "entra_con_llave", "ya tiene llave: hay que entrar con ella");
  assert.equal(permisoAlta(false, e(0, 2), ahora), "entra_con_llave", "las perdió (revocadas): no vuelve sola a «la primera vez»");
  assert.equal(permisoAlta(true, e(1, 1), ahora), "si", "desde una sesión con llave, otra más");
  assert.equal(permisoAlta(false, e(0, 2, new Date("2026-10-30T13:00:00Z")), ahora), "si", "rehabilitada y vigente");
  assert.equal(permisoAlta(false, e(0, 2, new Date("2026-10-30T11:00:00Z")), ahora), "entra_con_llave", "rehabilitación caducada");
  assert.equal(permisoAlta(true, e(MAX_LLAVES, MAX_LLAVES), ahora), "maximo");
});

test("nombre de la llave y transports: recortados y solo lo que define WebAuthn", () => {
  assert.equal(nombreDeLlave("  Portátil   de la oficina ", "Windows · Chrome"), "Portátil de la oficina");
  assert.equal(nombreDeLlave(undefined, "Windows · Chrome"), "Windows · Chrome");
  assert.equal(nombreDeLlave("", ""), "Llave");
  assert.equal(nombreDeLlave("x".repeat(80), "").length, 40);
  assert.deepEqual(limpiaTransports(["internal", "hybrid", "internal", "<script>", 3]), ["internal", "hybrid"]);
  assert.deepEqual(limpiaTransports("usb"), []);
});

// ---------------------------------------------------------------- guardas
type S = Partial<FastifyRequest["session"]>;
async function guarda(fn: (req: FastifyRequest, rep: FastifyReply) => Promise<void>, sesion: S | undefined) {
  const salida: { codigo?: number; cuerpo?: { error: string } } = {};
  const rep = { code(c: number) { salida.codigo = c; return this; }, async send(b: { error: string }) { salida.cuerpo = b; return this; } } as unknown as FastifyReply;
  await fn({ session: sesion } as unknown as FastifyRequest, rep);
  return salida.codigo ? [salida.codigo, salida.cuerpo?.error] : "pasa";
}

test("guardas: una sesión de oficina sin llave solo sirve para la ceremonia de la llave", async () => {
  const sinLlave: S = { hogarId: 1, rol: "oficina", aparatoAprobado: true, llaveRequerida: true, confirmacionVigente: false };
  const conLlave: S = { ...sinLlave, llaveRequerida: false, llaveId: 3, confirmacionVigente: true };
  assert.deepEqual(await guarda(requiereSesion, sinLlave), [403, "llave_requerida"]);
  assert.deepEqual(await guarda(requiereRol("oficina", "admin"), sinLlave), [403, "llave_requerida"]);
  assert.equal(await guarda(requiereOficinaSinLlave, sinLlave), "pasa");
  assert.equal(llaveRequerida(sinLlave as FastifyRequest["session"]), true);
  assert.equal(esSesionDeOficina(sinLlave as FastifyRequest["session"]), false, "sin llave no carga la configuración «en prueba» ni nada de oficina");
  assert.equal(await guarda(requiereRol("oficina", "admin"), conLlave), "pasa");
  assert.equal(await guarda(requiereConfirmacionReciente(), conLlave), "pasa");
  assert.equal(esSesionDeOficina(conLlave as FastifyRequest["session"]), true);
  assert.deepEqual(await guarda(requiereRol("admin"), conLlave), [403, "sin_permiso"]);
});

test("guardas: la de la ceremonia no deja pasar sin sesión, a un hogar ni con el aparato pendiente", async () => {
  assert.deepEqual(await guarda(requiereOficinaSinLlave, undefined), [401, "sin_sesion"]);
  assert.deepEqual(await guarda(requiereOficinaSinLlave, { hogarId: 2, rol: "hogar" }), [403, "sin_permiso"]);
  assert.deepEqual(await guarda(requiereOficinaSinLlave, { hogarId: 1, rol: "admin", aparatoAprobado: false, llaveRequerida: true }), [403, "aparato_pendiente"]);
  // un hogar nunca lleva llaveRequerida: las guardas de siempre no cambian para él
  assert.equal(await guarda(requiereSesion, { hogarId: 2, rol: "hogar", llaveRequerida: true }), "pasa");
});

// ---------------------------------------------------------------- ceremonias con respuestas simuladas
async function alta(a: AutenticadorFalso, o: Parameters<AutenticadorFalso["alta"]>[1] = {}) {
  const op = await opcionesDeAlta(CFG, CUENTA, []);
  return { op, v: await verificaAlta(CFG, a.alta(op, o) as never, op.challenge) };
}
async function guardada(a: AutenticadorFalso): Promise<LlaveGuardada> {
  const { v } = await alta(a);
  assert.ok(v.ok, "el alta de partida no pasó");
  return { id: 1, credencialId: v.llave.credencialId, clavePublica: v.llave.clavePublica, contador: v.llave.contador, transports: v.llave.transports };
}

test("opciones: RP ID y nombre de la configuración, verificación de la persona obligatoria, sin attestation, excluye las que ya tiene", async () => {
  const op = await opcionesDeAlta(CFG, CUENTA, [{ credencialId: "AAAAAAAAAAAAAAAAAAAAAA", transports: ["usb"] }]);
  assert.equal(op.rp.id, "gemelo.example.com");
  assert.equal(op.rp.name, "Cuarenta hazas · Oficina");
  assert.equal(op.user.name, "ofi@example.com");
  assert.equal(op.authenticatorSelection?.userVerification, "required");
  assert.equal(op.attestation, "none");
  assert.deepEqual(op.excludeCredentials?.map(c => c.id), ["AAAAAAAAAAAAAAAAAAAAAA"]);
  assert.match(op.challenge, /^[A-Za-z0-9_-]{32,128}$/, "el reto cabe en la columna de la 0013");
  const oe = await opcionesDeEntrada(CFG, [{ credencialId: "BBBBBBBBBBBBBBBBBBBBBB", transports: ["internal"] }]);
  assert.equal(oe.rpId, "gemelo.example.com");
  assert.equal(oe.userVerification, "required");
  assert.deepEqual(oe.allowCredentials?.map(c => c.id), ["BBBBBBBBBBBBBBBBBBBBBB"]);
  assert.notEqual(oe.challenge, op.challenge, "cada ceremonia, su reto");
});

test("alta: una respuesta buena se verifica y da la clave pública, el contador y los transports", async () => {
  const a = new AutenticadorFalso(ORIGEN);
  const { v } = await alta(a);
  assert.ok(v.ok);
  assert.equal(v.llave.credencialId, a.id);
  assert.ok(v.llave.clavePublica.length > 60, "clave COSE");
  assert.equal(v.llave.contador, 0);
  assert.deepEqual(v.llave.transports, ["internal", "hybrid"]);
});

test("alta: se rechaza otro origen, otro RP ID, otro reto o sin verificar a la persona", async () => {
  for (const [o, motivo] of [[{ origen: "https://malo.example.net" }, "origen"], [{ rpId: "malo.example.net" }, "rp_id"],
    [{ reto: "x".repeat(43) }, "reto"], [{ verifica: false }, "sin_verificacion"]] as const) {
    const { v } = await alta(new AutenticadorFalso(ORIGEN), o);
    assert.equal(v.ok, false, JSON.stringify(o));
    assert.equal(!v.ok && v.motivo, motivo, JSON.stringify(o));
  }
});

test("entrada: una aserción buena pasa y sube el contador; repetir el contador (clon o repetición) no", async () => {
  const a = new AutenticadorFalso(ORIGEN), llave = await guardada(a);
  const op = await opcionesDeEntrada(CFG, [llave]);
  const v = await verificaEntrada(CFG, a.entrada(op) as never, op.challenge, llave);
  assert.ok(v.ok); assert.equal(v.ok && v.contador, 1);
  const op2 = await opcionesDeEntrada(CFG, [llave]);
  const v2 = await verificaEntrada(CFG, a.entrada(op2, { contador: 1 }) as never, op2.challenge, { ...llave, contador: 1 });
  assert.deepEqual(v2, { ok: false, motivo: "contador" });
});

test("entrada: se rechaza la firma de otra clave, otro origen, otro reto o sin verificar a la persona", async () => {
  const a = new AutenticadorFalso(ORIGEN), llave = await guardada(a);
  for (const [o, motivo] of [[{ claveAjena: true }, "no_verificada"], [{ origen: "https://malo.example.net" }, "origen"],
    [{ reto: "y".repeat(43) }, "reto"], [{ verifica: false }, "sin_verificacion"], [{ rpId: "malo.example.net" }, "rp_id"]] as const) {
    const op = await opcionesDeEntrada(CFG, [llave]);
    const v = await verificaEntrada(CFG, a.entrada(op, o) as never, op.challenge, llave);
    assert.equal(v.ok, false, JSON.stringify(o));
    assert.equal(!v.ok && v.motivo, motivo, JSON.stringify(o));
  }
});

// ---------------------------------------------------------------- rutas, antes de tocar la base
let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
before(async () => { app = await construyeApp(contexto(bd, configDePrueba({ GEMELO_OFICINA_LLAVE: "obligatoria" }))); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

test("rutas de la llave: sin sesión 401; sin Origin del sitio 403; entrada que no tiene la forma, 400", async () => {
  const posts = ["/api/oficina/llaves/alta/opciones", "/api/oficina/llaves/alta", "/api/oficina/llaves/entrada/opciones", "/api/oficina/llaves/entrada",
    "/api/oficina/llaves/1/revocar", "/api/admin/llaves/1/revocar", "/api/admin/hogares/1/rehabilitar-llave"];
  for (const url of posts) {
    assert.equal((await app.inject({ method: "POST", url, headers: { "x-forwarded-proto": "https" }, payload: {} })).statusCode, 403, url + " sin Origin");
  }
  for (const url of ["/api/oficina/llaves/alta/opciones", "/api/oficina/llaves/entrada/opciones"]) {
    assert.equal((await app.inject({ method: "POST", url, headers: deLaWeb(), payload: {} })).statusCode, 401, url);
  }
  for (const url of ["/api/oficina/llaves", "/api/admin/llaves"]) assert.equal((await app.inject({ method: "GET", url, headers: deLaWeb() })).statusCode, 401, url);
  const malo = await app.inject({ method: "POST", url: "/api/oficina/llaves/entrada", headers: deLaWeb(), payload: { respuesta: { id: "corto", rawId: "corto", type: "public-key", response: {} } } });
  assert.equal(malo.statusCode, 400);
});

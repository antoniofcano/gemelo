// Las rutas de las llaves de la PROPIA cuenta, para cualquier sesión (OF13b-4, ADR-0029): GET/POST /api/yo/llaves, POST /api/yo/llaves/opciones y
// DELETE /api/yo/llaves/:id, sin PostgreSQL. La app entera corre contra una base de mentira (BdDeLlaves de OF13b-3, ampliada aquí con las consultas
// de estas rutas) y un autenticador simulado (pruebas/apoyo/autenticador.ts) frente a la verificación REAL de @simplewebauthn/server; la sesión de
// verdad nace por el sondeo de unas gafas (cookie firmada) y el almacén la lee con la fila que pone cada prueba. Lo que decide PostgreSQL (bloqueos,
// restricciones, la cascada de verdad): pruebas/integracion/llaves_yo.test.ts (escrita, se ejecuta por el banco).
// NO probado con ningún navegador ni autenticador real, ni con un SMTP real.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { mensajeDeLlaveAnadida, mensajeDeLlaveQuitada } from "../../src/auth/correo.ts";
import { MAX_LLAVES } from "../../src/oficina/llaves.ts";
import { TEXTO_LIMITE_LLAVES, TEXTO_SOLO_TITULAR_LLAVES } from "../../src/yo/llaves_rutas.ts";
import { datosDelHogar } from "../../src/yo/datos.ts";
import { AutenticadorFalso, type OpcionesFalsas } from "../apoyo/autenticador.ts";
import { configDePrueba, contexto, deLaWeb, ORIGEN } from "../apoyo/contexto.ts";
import { BdDeLlaves } from "../apoyo/llaves_bd.ts";

const CORREO = "ana.llaves@example.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SONDEO = "s".repeat(43);
const HORA = 3_600_000;

/** BdDeLlaves de OF13b-3 más las consultas de estas rutas (la lista, el correo, la baja y los retos con sesión). Lo que no conoce, lanza. */
class BdYo extends BdDeLlaves {
  override async query(sql: string, p: unknown[] = []) {
    const q = sql.replace(/\s+/g, " ").trim();
    const r = (rows: Record<string, unknown>[] = [], rowCount = rows.length) => ({ rows, rowCount });
    if (/^UPDATE codigos_vinculo c SET usado_en/.test(q)) return r([{ hogar_id: 1, normas_version: 1, rol: "hogar" }]);
    if (/^UPDATE codigos_vinculo SET hogar_id/.test(q)) return r([], 1);
    if (/FROM sesiones s JOIN hogares h/.test(q)) { const f = this.filaSesion?.(); return r(f ? [f] : []); }
    if (/^UPDATE sesiones SET revocada_en = now\(\) WHERE hash = \$1/.test(q)) return r([], 0);
    if (/^INSERT INTO sesiones/.test(q)) { this.consultas.push(q); return r([], 1); }
    if (/FROM hogares g LEFT JOIN avatares/.test(q)) return r([{ alias: "Mirlo", camisa: null, sombrero: null, piel: null, vrm: null, aspecto: null }]);
    if (q.startsWith("SELECT l.id, l.nombre, l.creada_en, l.ultima_vez_en, l.descubrible, l.respaldada,")) {
      this.consultas.push(q);
      const sid = p[1] as number | null;
      const ses = this.sesiones.find(s => s.id === sid && s.hogar_id === p[0]);
      return r(this.llaves.filter(l => l.hogar_id === p[0] && !l.revocada_en).sort((a, b) => b.id - a.id).map(l => ({
        id: String(l.id), nombre: l.nombre, creada_en: new Date("2026-11-01T10:00:00Z"), ultima_vez_en: l.ultima_vez_en, descubrible: l.descubrible, respaldada: l.respaldada,
        es_esta: ses?.llave_id === l.id,
      })));
    }
    if (q === "SELECT correo FROM hogares WHERE id = $1 AND activo") return r(this.hogares.filter(h => h.id === p[0] && h.activo).map(h => ({ correo: h.correo })));
    if (q.startsWith("SELECT nombre FROM llaves_acceso WHERE id = $1 AND hogar_id = $2 AND revocada_en IS NULL"))
      return r(this.llaves.filter(l => l.id === p[0] && l.hogar_id === p[1] && !l.revocada_en).map(l => ({ nombre: l.nombre })));
    if (q.startsWith("SELECT 1 FROM sesiones WHERE id = $1 AND hogar_id = $2 AND llave_id = $3"))
      return r(this.sesiones.filter(s => s.id === p[0] && s.hogar_id === p[1] && s.llave_id === p[2] && !s.revocada_en).map(() => ({ "?column?": 1 })));
    if (q.startsWith("UPDATE llaves_acceso SET revocada_en = now(), revocada_por = $2 WHERE id = $1 AND revocada_en IS NULL")) {
      const l = this.llaves.find(x => x.id === p[0] && !x.revocada_en);
      if (!l) return r([], 0);
      l.revocada_en = new Date();
      return r([], 1);
    }
    if (q.startsWith("UPDATE sesiones SET revocada_en = now() WHERE llave_id = $1 AND revocada_en IS NULL")) {
      const ss = this.sesiones.filter(s => s.llave_id === p[0] && !s.revocada_en);
      for (const s of ss) s.revocada_en = new Date();
      return r([], ss.length);
    }
    if (q.startsWith("INSERT INTO llaves_retos (sesion_id, tipo, reto, expira_en) VALUES ($1, $2, $3,")) {
      this.retos = this.retos.filter(x => !(x.sesion_id === p[0] && x.tipo === p[1]));
      this.retos.push({ sesion_id: p[0] as number, tipo: p[1] as string, reto: p[2] as string, clave: null, expira_en: new Date(Date.now() + (p[3] as number) * 60_000) });
      return r([], 1);
    }
    if (q.startsWith("DELETE FROM llaves_retos WHERE sesion_id = $1 AND tipo = $2 RETURNING")) {
      const i = this.retos.findIndex(x => x.sesion_id === p[0] && x.tipo === p[1]);
      if (i < 0) return r();
      const [f] = this.retos.splice(i, 1);
      return r([{ reto: f!.reto, vivo: f!.expira_en.getTime() > Date.now() }]);
    }
    if (q.startsWith("SELECT id, credencial_id, clave_publica, contador, transports FROM llaves_acceso WHERE hogar_id = $1 AND revocada_en IS NULL"))
      return r(this.llaves.filter(l => l.hogar_id === p[0] && !l.revocada_en).map(l => ({ id: String(l.id), credencial_id: l.credencial_id, clave_publica: l.clave_publica, contador: String(l.contador), transports: l.transports })));
    if (q.startsWith("UPDATE hogares SET llave_usuario = coalesce(llave_usuario, $2) WHERE id = $1 AND activo RETURNING")) {
      const h = this.hogares.find(x => x.id === p[0] && x.activo);
      if (!h) return r();
      h.llave_usuario ??= p[1] as Buffer;
      return r([{ llave_usuario: h.llave_usuario, correo: h.correo, rol: h.rol }]);
    }
    // lo ajeno a las llaves (el sondeo de las gafas, la purga…) no importa aquí: vacío; lo de las llaves, o lo conoce BdDeLlaves o lanza
    if (!/llaves_acceso|llaves_retos|hogares|^BEGIN|^COMMIT|^ROLLBACK|auditoria|UPDATE sesiones/.test(q)) return r();
    return super.query(sql, p);
  }
  /** la fila que el almacén de sesiones lee (null: no hay sesión viva) */
  filaSesion: (() => Record<string, unknown>) | null = null;
}

interface Montaje { app: FastifyInstance; b: BdYo; cartero: ReturnType<typeof contexto>["cartero"]; cookie: string }

/**
 * Una app con su base de mentira: la cuenta 1 (familia) y la 2 (oficina), cada una con su sesión (50 y 60). `sesion` dice qué ve el almacén:
 * `rol`/`origen`/`confirmada`, y `llave_id` lo lee de la base de mentira (lo pone marcaSesionConLlave al dar de alta).
 */
async function monta(sesion: { hogar?: 1 | 2; origen?: "enlace" | "vinculo"; confirmada?: boolean; sinSesion?: boolean } = {}): Promise<Montaje> {
  const b = new BdYo();
  b.hogar({ id: 1, rol: "hogar", correo: CORREO, llave_usuario: Buffer.alloc(32, 1) });
  b.hogar({ id: 2, rol: "oficina", correo: "ofi.llaves@example.com", llave_usuario: Buffer.alloc(32, 2) });
  b.sesiones.push({ id: 50, hogar_id: 1, llave_id: null, revocada_en: null }, { id: 60, hogar_id: 2, llave_id: null, revocada_en: null });
  const ctx = contexto(b.bd as unknown as pg.Pool, configDePrueba());
  const app = await construyeApp(ctx);
  await app.ready();
  const hogar = sesion.hogar ?? 1;
  b.filaSesion = sesion.sinSesion ? null : () => {
    const s = b.sesiones.find(x => x.id === (hogar === 1 ? 50 : 60))!;
    return {
      sid: s.id, hogar_id: hogar, rol: hogar === 1 ? "hogar" : "oficina", alias: "Mirlo", alias_visible: false, normas_version: 1, origen: sesion.origen ?? "enlace",
      expira_en: new Date(Date.now() + 12 * HORA), refrescar: false, aparato_id: hogar === 2 ? 3 : null, aparato_aprobado: hogar === 2,
      confirmada_en: sesion.confirmada ? new Date() : null, confirmacion_vigente: sesion.confirmada === true, llave_id: s.llave_id,
    };
  };
  // la cookie de verdad nace por el sondeo de unas gafas (la firma es de cada app)
  const sondeo = await app.inject({ method: "POST", url: "/api/auth/vincula/sondeo", headers: deLaWeb(), payload: { sondeo: SONDEO } });
  assert.equal(sondeo.statusCode, 200, sondeo.body);
  const sc = ([] as string[]).concat(sondeo.headers["set-cookie"] ?? []).find(c => c.startsWith("__Host-gemelo="));
  assert.ok(sc);
  b.auditoria.length = 0;   // lo del sondeo de las gafas (que da la cookie) no cuenta
  return { app, b, cartero: ctx.cartero, cookie: sc.split(";")[0]! };
}

let ipN = 0;
const ip = () => "198.51.100." + (++ipN % 250);
const llama = (m: Montaje, method: "GET" | "POST" | "DELETE", url: string, payload?: unknown, conOrigen = true) =>
  m.app.inject({
    method, url, headers: { ...deLaWeb({ "x-forwarded-for": ip(), "user-agent": UA }), ...(conOrigen ? {} : { origin: "" }), cookie: m.cookie },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
const sinOrigen = (m: Montaje, method: "POST" | "DELETE", url: string, payload?: unknown) =>
  m.app.inject({ method, url, headers: { "x-forwarded-proto": "https", "x-forwarded-for": ip(), cookie: m.cookie }, ...(payload !== undefined ? { payload: payload as object } : {}) });
const asentada = () => new Promise<void>(ok => setImmediate(() => setImmediate(ok)));

/** El alta entera de una llave del autenticador `a` por las rutas: opciones, respuesta del autenticador y guardado. */
async function altaPorRutas(m: Montaje, a: AutenticadorFalso, o: OpcionesFalsas = {}, nombre?: string) {
  const op = await llama(m, "POST", "/api/yo/llaves/opciones", {});
  assert.equal(op.statusCode, 200, op.body);
  const opciones = op.json();
  return { op, res: await llama(m, "POST", "/api/yo/llaves", { ...(nombre ? { nombre } : {}), respuesta: a.alta(opciones, o) }) };
}
const llaveFalsa = (b: BdYo, hogar: number, n: number, extra: Record<string, unknown> = {}) =>
  b.llave({ hogar_id: hogar, credencial_id: "CRED" + hogar + "x" + n + "A".repeat(18), clave_publica: Buffer.alloc(77, n), nombre: "Llave " + n, ...extra });

// ---------------------------------------------------------------- quién entra
test("sin sesión: 401 en las cuatro rutas, sin tocar la base", async () => {
  const m = await monta({ sinSesion: true });
  try {
    const antes = m.b.consultas.length;
    for (const [metodo, url, cuerpo] of [["GET", "/api/yo/llaves"], ["POST", "/api/yo/llaves/opciones", {}], ["POST", "/api/yo/llaves", { respuesta: { id: "A".repeat(20), rawId: "A".repeat(20), type: "public-key", response: {} } }], ["DELETE", "/api/yo/llaves/3"]] as const) {
      const r = await llama(m, metodo, url, cuerpo);
      assert.equal(r.statusCode, 401, metodo + " " + url);
      assert.equal(r.json().error, "sin_sesion");
    }
    assert.equal(m.b.llaves.length, 0);
    assert.ok(m.b.consultas.slice(antes).every(q => !/llaves_acceso|llaves_retos/.test(q)), "ninguna consulta de llaves");
  } finally { await m.app.close(); }
});

test("sin Origin del sitio (o con otro): 403 antes de nada en POST y DELETE", async () => {
  const m = await monta();
  try {
    for (const [metodo, url] of [["POST", "/api/yo/llaves/opciones"], ["POST", "/api/yo/llaves"], ["DELETE", "/api/yo/llaves/3"]] as const) {
      const r = await sinOrigen(m, metodo, url, metodo === "DELETE" ? undefined : {});
      assert.equal(r.statusCode, 403, metodo + " " + url);
      assert.equal(r.json().error, "origen_no_admitido");
      const otro = await m.app.inject({ method: metodo, url, headers: { origin: "https://otro.example.net", "x-forwarded-proto": "https", cookie: m.cookie }, ...(metodo === "DELETE" ? {} : { payload: {} }) });
      assert.equal(otro.statusCode, 403, "otro origen");
    }
    assert.equal(m.b.retos.length, 0);
  } finally { await m.app.close(); }
});

test("desde unas gafas vinculadas: nada de alta ni de baja (403 solo_titular); la lista sí se ve, sin poder añadir", async () => {
  const m = await monta({ origen: "vinculo" });
  try {
    llaveFalsa(m.b, 1, 1);
    for (const [metodo, url, cuerpo] of [["POST", "/api/yo/llaves/opciones", {}], ["POST", "/api/yo/llaves", { respuesta: { id: "A".repeat(20), rawId: "A".repeat(20), type: "public-key", response: {} } }], ["DELETE", "/api/yo/llaves/1"]] as const) {
      const r = await llama(m, metodo, url, cuerpo);
      assert.equal(r.statusCode, 403, metodo + " " + url + " " + r.body);
      assert.deepEqual(r.json(), { error: "solo_titular", mensaje: TEXTO_SOLO_TITULAR_LLAVES });
    }
    assert.equal(m.b.llaves[0]!.revocada_en, null, "la llave sigue viva");
    assert.equal(m.b.retos.length, 0, "ni se abrió una ceremonia");
    const l = await llama(m, "GET", "/api/yo/llaves");
    assert.equal(l.statusCode, 200);
    assert.equal(l.json().puede_anadir, false);
    assert.equal(l.json().llaves.length, 1);
  } finally { await m.app.close(); }
});

test("forma estricta: campos de más, tipos y rangos fuera de lo esperado dan 400 sin tocar la base", async () => {
  const m = await monta();
  try {
    const ok = { id: "A".repeat(20), rawId: "A".repeat(20), type: "public-key", response: {} };
    const malos: Array<[string, string, unknown]> = [
      ["POST", "/api/yo/llaves/opciones", { extra: 1 }],
      ["POST", "/api/yo/llaves", {}],
      ["POST", "/api/yo/llaves", { respuesta: ok, extra: true }],
      ["POST", "/api/yo/llaves", { respuesta: { ...ok, type: "password" } }],
      ["POST", "/api/yo/llaves", { respuesta: { ...ok, id: "no valido!" } }],
      ["POST", "/api/yo/llaves", { respuesta: ok, nombre: "x".repeat(81) }],
    ];
    for (const [metodo, url, cuerpo] of malos) {
      const r = await llama(m, metodo as "POST", url, cuerpo);
      assert.equal(r.statusCode, 400, url + " " + JSON.stringify(cuerpo).slice(0, 60));
      assert.equal(r.json().error, "entrada_no_valida");
    }
    for (const id of ["abc", "0", "-1", "1.5", "99999999999", "1;DROP"]) assert.equal((await llama(m, "DELETE", "/api/yo/llaves/" + id)).statusCode, 400, "id " + id);
    assert.equal(m.b.retos.length, 0);
  } finally { await m.app.close(); }
});

// ---------------------------------------------------------------- la lista
test("lista: solo las vivas y solo las de la sesión; nombre, fechas y banderas; nunca el id de credencial, la clave pública ni el contador", async () => {
  const m = await monta();
  try {
    const mia = llaveFalsa(m.b, 1, 1, { respaldada: true, descubrible: true, ultima_vez_en: new Date("2026-11-02T08:00:00Z"), contador: 42 });
    llaveFalsa(m.b, 1, 2, { descubrible: false });
    llaveFalsa(m.b, 1, 3, { revocada_en: new Date() });
    const ajena = llaveFalsa(m.b, 2, 4);
    m.b.sesiones[0]!.llave_id = mia.id;
    const r = await llama(m, "GET", "/api/yo/llaves");
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.headers["cache-control"], "no-store");
    const j = r.json();
    assert.deepEqual(j.llaves.map((l: { nombre: string }) => l.nombre), ["Llave 2", "Llave 1"], "las vivas de la cuenta, la más nueva primero");
    assert.deepEqual(Object.keys(j.llaves[0]).sort(), ["creada_en", "descubrible", "es_esta", "id", "nombre", "sincronizada", "ultima_vez_en"]);
    const una = j.llaves.find((l: { id: number }) => l.id === mia.id);
    assert.deepEqual([una.sincronizada, una.descubrible, una.es_esta, una.ultima_vez_en], [true, true, true, "2026-11-02T08:00:00.000Z"]);
    assert.equal(j.llaves.find((l: { nombre: string }) => l.nombre === "Llave 2").descubrible, false);
    assert.equal(j.maximo, MAX_LLAVES);
    assert.equal(j.puede_anadir, true);
    for (const secreto of [mia.credencial_id, ajena.credencial_id, mia.clave_publica.toString("base64"), mia.clave_publica.toString("base64url"), "credencial", "clave_publica", "contador", "42,", CORREO]) {
      assert.ok(!r.body.includes(secreto), "no debe salir: " + secreto.slice(0, 12));
    }
    // el hogar sale de la sesión: ningún parámetro cambia de cuenta
    const otra = await llama(m, "GET", "/api/yo/llaves?hogar=2&hogar_id=2");
    assert.deepEqual(otra.json().llaves.map((l: { id: number }) => l.id), j.llaves.map((l: { id: number }) => l.id));
    assert.ok(!otra.body.includes(String(ajena.id)) || otra.json().llaves.every((l: { id: number }) => l.id !== ajena.id));
  } finally { await m.app.close(); }
});

test("lista: al tope de llaves, puede_anadir es falso", async () => {
  const m = await monta();
  try {
    for (let i = 0; i < MAX_LLAVES; i++) llaveFalsa(m.b, 1, i);
    const j = (await llama(m, "GET", "/api/yo/llaves")).json();
    assert.equal(j.llaves.length, MAX_LLAVES);
    assert.equal(j.puede_anadir, false);
  } finally { await m.app.close(); }
});

// ---------------------------------------------------------------- el alta
test("alta feliz de una familia: opciones con reto, verificación real, llave guardada, sesión con ella, auditoría limpia y aviso por correo", async () => {
  const m = await monta();
  try {
    const a = new AutenticadorFalso(ORIGEN);
    const op = await llama(m, "POST", "/api/yo/llaves/opciones", {});
    assert.equal(op.statusCode, 200, op.body);
    assert.equal(op.headers["cache-control"], "no-store");
    const o = op.json();
    assert.equal(o.rp.id, "gemelo.example.com");
    assert.equal(o.user.name, CORREO, "decisión 185: el correo, en el aparato");
    assert.deepEqual(o.authenticatorSelection, { residentKey: "required", userVerification: "required", requireResidentKey: true });
    assert.deepEqual(m.b.retos.map(x => [x.sesion_id, x.tipo, x.reto]), [[50, "alta", o.challenge]], "el reto, atado a esta sesión");
    const r = await llama(m, "POST", "/api/yo/llaves", { respuesta: a.alta(o, { respaldada: true }) });
    assert.equal(r.statusCode, 201, r.body);
    assert.equal(r.headers["cache-control"], "no-store");
    assert.deepEqual(r.json(), { id: m.b.llaves[0]!.id, nombre: "Windows · Chrome" }, "sin nombre dado: el del aparato");
    const l = m.b.llaves[0]!;
    assert.equal(l.hogar_id, 1); assert.equal(l.respaldada, true); assert.equal(l.descubrible, true); assert.equal(l.aparato_id, null);
    assert.equal(m.b.sesiones[0]!.llave_id, l.id, "la sesión queda con la llave nueva");
    assert.equal(m.b.retos.length, 0, "el reto se gastó");
    const au = m.b.auditoria.at(-1)!;
    assert.equal(au.accion, "llave.alta");
    assert.ok(!JSON.stringify(m.b.auditoria).includes(a.id) && !JSON.stringify(m.b.auditoria).includes("@"), "ni el id de credencial ni el correo");
    await asentada();
    assert.equal(m.cartero.mensajes.length, 1, "un aviso");
    const c = m.cartero.mensajes[0]!;
    assert.equal(c.para, CORREO);
    assert.equal(c.asunto, "Se ha añadido una llave de acceso a tu cuenta");
    assert.ok(c.texto.includes("Windows · Chrome") && /Mis dispositivos y quita esa llave/.test(c.texto), "dice cuál y cómo quitarla");
    assert.ok(!c.texto.includes("@") && !c.texto.includes(a.id) && !/https?:/.test(c.texto), "ni el correo, ni el id de la llave, ni un enlace en el cuerpo");
    // y la lista la enseña como la de esta sesión
    const lista = (await llama(m, "GET", "/api/yo/llaves")).json();
    assert.deepEqual(lista.llaves.map((x: { id: number; es_esta: boolean }) => [x.id, x.es_esta]), [[l.id, true]]);
  } finally { await m.app.close(); }
});

test("alta con nombre propio: se recorta y se guarda; el aviso lo lleva en una sola línea", async () => {
  const m = await monta();
  try {
    const { res } = await altaPorRutas(m, new AutenticadorFalso(ORIGEN), {}, "  Mi   móvil\nBcc: x@example.com " + "z".repeat(20));
    assert.equal(res.statusCode, 201, res.body);
    const n = m.b.llaves[0]!.nombre;
    assert.ok(n.length <= 40 && n.startsWith("Mi móvil Bcc: x@example.com"));
    await asentada();
    assert.equal(m.cartero.mensajes[0]!.texto.split("\n").filter(x => x.startsWith("Se ha añadido")).length, 1, "el nombre no rompe líneas del correo");
  } finally { await m.app.close(); }
});

test("una familia que ya tiene llaves puede añadir otra con la sesión del enlace (decisión 183), con aviso y ya_tenia en la auditoría", async () => {
  const m = await monta();
  try {
    for (let i = 0; i < 3; i++) llaveFalsa(m.b, 1, i);
    const { res } = await altaPorRutas(m, new AutenticadorFalso(ORIGEN));
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(m.b.llaves.filter(l => l.hogar_id === 1).length, 4);
    assert.equal(m.b.auditoria.at(-1)!.detalle["ya_tenia"], 3);
    await asentada();
    assert.equal(m.cartero.mensajes.length, 1);
  } finally { await m.app.close(); }
});

test("al tope de 10 llaves vivas: 409 demasiadas_llaves en las opciones y en el alta, sin abrir ceremonia", async () => {
  const m = await monta();
  try {
    for (let i = 0; i < MAX_LLAVES; i++) llaveFalsa(m.b, 1, i);
    const op = await llama(m, "POST", "/api/yo/llaves/opciones", {});
    assert.equal(op.statusCode, 409);
    assert.equal(op.json().error, "demasiadas_llaves");
    assert.equal(m.b.retos.length, 0);
    // un reto que llegara a existir no salta el tope: el permiso se vuelve a mirar al guardar
    const a = new AutenticadorFalso(ORIGEN);
    const o = (await import("../../src/oficina/llaves.ts")).opcionesDeAlta(configDePrueba().llave, { usuario: new Uint8Array(32).fill(1), correo: CORREO, rol: "hogar" }, []);
    const opciones = await o;
    m.b.retos.push({ sesion_id: 50, tipo: "alta", reto: opciones.challenge, clave: null, expira_en: new Date(Date.now() + 60_000) });
    const r = await llama(m, "POST", "/api/yo/llaves", { respuesta: a.alta(opciones) });
    assert.equal(r.statusCode, 409, r.body);
    assert.equal(r.json().error, "demasiadas_llaves");
    assert.equal(m.b.llaves.length, MAX_LLAVES);
    await asentada();
    assert.equal(m.cartero.mensajes.length, 0, "sin alta no hay aviso");
  } finally { await m.app.close(); }
});

test("el correo de aviso falla: el alta NO se cae (201, llave guardada) y no queda rastro de la dirección en el registro", async () => {
  const m = await monta();
  try {
    m.cartero.falla = true;
    const { res } = await altaPorRutas(m, new AutenticadorFalso(ORIGEN));
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(m.b.llaves.length, 1);
    await asentada();
    assert.equal(m.cartero.mensajes.length, 0, "no se mandó (el buzón de pruebas falló)");
  } finally { await m.app.close(); }
});

test("alta que no se puede verificar: 400 llave_no_valida con el mismo texto, auditoría con el motivo, nada guardado y sin aviso", async () => {
  const m = await monta();
  try {
    for (const malo of [{ origen: "https://otro.example.net" }, { verifica: false }, { reto: "AAAAAAAAAAAAAAAAAAAAAA" }, { rpId: "otro.example.net" }] as OpcionesFalsas[]) {
      const { res } = await altaPorRutas(m, new AutenticadorFalso(ORIGEN), malo);
      assert.equal(res.statusCode, 400, JSON.stringify(malo) + " " + res.body);
      assert.equal(res.json().error, "llave_no_valida");
    }
    assert.equal(m.b.llaves.length, 0);
    assert.deepEqual([...new Set(m.b.auditoria.map(x => x.accion))], ["llave.alta_fallida"]);
    assert.ok(m.b.auditoria.every(x => typeof x.detalle["motivo"] === "string" && x.detalle["ceremonia"] === "alta"));
    await asentada();
    assert.equal(m.cartero.mensajes.length, 0);
  } finally { await m.app.close(); }
});

test("sin reto (no se pidió, caducó o ya se gastó): 409 sin_reto; el mismo reto no sirve dos veces", async () => {
  const m = await monta();
  try {
    const a = new AutenticadorFalso(ORIGEN);
    const op = (await llama(m, "POST", "/api/yo/llaves/opciones", {})).json();
    const resp = a.alta(op);
    assert.equal((await llama(m, "POST", "/api/yo/llaves", { respuesta: resp })).statusCode, 201);
    const otra = await llama(m, "POST", "/api/yo/llaves", { respuesta: resp });
    assert.equal(otra.statusCode, 409);
    assert.equal(otra.json().error, "sin_reto");
    const op2 = (await llama(m, "POST", "/api/yo/llaves/opciones", {})).json();
    m.b.retos[0]!.expira_en = new Date(Date.now() - 1000);
    assert.equal((await llama(m, "POST", "/api/yo/llaves", { respuesta: new AutenticadorFalso(ORIGEN).alta(op2) })).statusCode, 409);
    assert.equal(m.b.llaves.length, 1);
  } finally { await m.app.close(); }
});

test("la misma llave física no se da de alta dos veces (ni en otra cuenta): 409 llave_repetida", async () => {
  const m = await monta();
  try {
    const a = new AutenticadorFalso(ORIGEN);
    assert.equal((await altaPorRutas(m, a)).res.statusCode, 201);
    const { res } = await altaPorRutas(m, a);
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(res.json().error, "llave_repetida");
    assert.equal(m.b.llaves.length, 1);
  } finally { await m.app.close(); }
});

test("límite: la ceremonia de alta se corta con 429 (texto de las llaves, no el de los enlaces) tras 20 en 15 minutos", async () => {
  const m = await monta();
  try {
    const rs = [];
    for (let i = 0; i < 21; i++) rs.push(await llama(m, "POST", "/api/yo/llaves/opciones", {}));
    assert.deepEqual(rs.slice(0, 20).map(r => r.statusCode), Array(20).fill(200));
    assert.equal(rs[20]!.statusCode, 429);
    assert.deepEqual(rs[20]!.json(), { error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE_LLAVES });
    assert.equal((await llama(m, "DELETE", "/api/yo/llaves/1")).statusCode, 429, "el límite es de la cuenta, común a alta y baja");
  } finally { await m.app.close(); }
});

// ---------------------------------------------------------------- quitar
test("quitar una llave propia: 200, revocada, sus sesiones cerradas, auditoría llave.quitada sin credencial y aviso con «el enlace sigue sirviendo»", async () => {
  const m = await monta();
  try {
    const l1 = llaveFalsa(m.b, 1, 1), l2 = llaveFalsa(m.b, 1, 2);
    m.b.sesiones[0]!.llave_id = l1.id;
    m.b.sesiones.push({ id: 51, hogar_id: 1, llave_id: l1.id, revocada_en: null }, { id: 52, hogar_id: 1, llave_id: l2.id, revocada_en: null });
    const r = await llama(m, "DELETE", "/api/yo/llaves/" + l1.id);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.headers["cache-control"], "no-store");
    assert.deepEqual(r.json(), { sesiones_cerradas: 2, era_esta: true, quedan: 1 });
    assert.ok(l1.revocada_en && !l2.revocada_en);
    assert.deepEqual(m.b.sesiones.map(s => !!s.revocada_en), [true, false, true, false], "se cierran las abiertas con ella; las demás no");
    const au = m.b.auditoria.at(-1)!;
    assert.equal(au.accion, "llave.quitada");
    assert.deepEqual(au.detalle, { llave: l1.id, sesiones: 2, quedan: 1, tipo: "familia" });
    assert.ok(!JSON.stringify(m.b.auditoria).includes(l1.credencial_id) && !JSON.stringify(m.b.auditoria).includes("@"));
    await asentada();
    assert.equal(m.cartero.mensajes.length, 1);
    const c = m.cartero.mensajes[0]!;
    assert.equal(c.para, CORREO);
    assert.equal(c.asunto, "Se ha quitado una llave de acceso de tu cuenta");
    assert.ok(c.texto.includes("Llave 1") && /el enlace que te mandamos a este correo sigue funcionando/.test(c.texto), "dice cuál y que el enlace sigue siendo la entrada");
    assert.ok(!c.texto.includes("@") && !c.texto.includes(l1.credencial_id));
    // ya no está en la lista, y repetir la baja es 404
    assert.deepEqual((await llama(m, "GET", "/api/yo/llaves")).json().llaves.map((x: { id: number }) => x.id), [l2.id]);
    assert.equal((await llama(m, "DELETE", "/api/yo/llaves/" + l1.id)).statusCode, 404);
  } finally { await m.app.close(); }
});

test("una familia puede quitar hasta su última llave (el enlace del correo es la recuperación)", async () => {
  const m = await monta();
  try {
    const l = llaveFalsa(m.b, 1, 1);
    const r = await llama(m, "DELETE", "/api/yo/llaves/" + l.id);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().quedan, 0);
    assert.ok(l.revocada_en);
  } finally { await m.app.close(); }
});

test("la llave de otra cuenta, una revocada y una que no existe dan el MISMO 404; nada cambia y nadie recibe un correo", async () => {
  const m = await monta();
  try {
    const ajena = llaveFalsa(m.b, 2, 1);
    const vieja = llaveFalsa(m.b, 1, 2, { revocada_en: new Date() });
    const rs = [];
    for (const id of [ajena.id, vieja.id, 9999]) rs.push(await llama(m, "DELETE", "/api/yo/llaves/" + id));
    assert.deepEqual(rs.map(r => r.statusCode), [404, 404, 404]);
    assert.deepEqual([rs[1]!.body, rs[2]!.body], [rs[0]!.body, rs[0]!.body], "idénticas");
    assert.equal(ajena.revocada_en, null, "la ajena sigue viva");
    assert.ok(!m.b.auditoria.some(a => a.accion === "llave.quitada"));
    await asentada();
    assert.equal(m.cartero.mensajes.length, 0);
  } finally { await m.app.close(); }
});

test("cuenta de oficina: no se quita la última por esta ruta (409), ni sin confirmación reciente (403); con dos y confirmada, sí", async () => {
  const sinConfirmar = await monta({ hogar: 2 });
  try {
    const a = llaveFalsa(sinConfirmar.b, 2, 1), b = llaveFalsa(sinConfirmar.b, 2, 2);
    const r = await llama(sinConfirmar, "DELETE", "/api/yo/llaves/" + a.id);
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().error, "confirmacion_requerida");
    assert.equal(a.revocada_en, null);
    void b;
  } finally { await sinConfirmar.app.close(); }
  const m = await monta({ hogar: 2, confirmada: true });
  try {
    const a = llaveFalsa(m.b, 2, 1), b = llaveFalsa(m.b, 2, 2);
    const ok = await llama(m, "DELETE", "/api/yo/llaves/" + a.id);
    assert.equal(ok.statusCode, 200, ok.body);
    const ultima = await llama(m, "DELETE", "/api/yo/llaves/" + b.id);
    assert.equal(ultima.statusCode, 409, ultima.body);
    assert.equal(ultima.json().error, "ultima_llave");
    assert.equal(b.revocada_en, null, "la última se queda");
    assert.equal(m.b.auditoria.filter(x => x.accion === "llave.quitada").length, 1);
    await asentada();
    assert.equal(m.cartero.mensajes.length, 1, "avisa de la que sí se quitó");
  } finally { await m.app.close(); }
});

test("las rutas de la oficina de OF13 también avisan por correo: alta propia y revocación propia (decisión 187)", async () => {
  const m = await monta({ hogar: 2, confirmada: true });
  try {
    const a = new AutenticadorFalso(ORIGEN);
    const op = await llama(m, "POST", "/api/oficina/llaves/alta/opciones", {});
    assert.equal(op.statusCode, 200, op.body);
    const alta = await llama(m, "POST", "/api/oficina/llaves/alta", { nombre: "Llave de la oficina", respuesta: a.alta(op.json()) });
    assert.equal(alta.statusCode, 201, alta.body);
    await asentada();
    assert.deepEqual(m.cartero.mensajes.map(x => [x.para, x.asunto]), [["ofi.llaves@example.com", "Se ha añadido una llave de acceso a tu cuenta"]]);
    const otra = llaveFalsa(m.b, 2, 9);
    const rev = await llama(m, "POST", "/api/oficina/llaves/" + otra.id + "/revocar", {});
    assert.equal(rev.statusCode, 200, rev.body);
    await asentada();
    assert.deepEqual(m.cartero.mensajes.map(x => x.asunto), ["Se ha añadido una llave de acceso a tu cuenta", "Se ha quitado una llave de acceso de tu cuenta"]);
    assert.ok(m.cartero.mensajes[1]!.texto.includes("Llave 9"));
  } finally { await m.app.close(); }
});

// ---------------------------------------------------------------- los avisos y los datos
test("los dos avisos: texto llano, el correo solo en el destinatario, sin enlaces, con cómo quitarla y que el enlace sigue siendo la entrada", () => {
  const ahora = new Date("2026-11-02T17:04:00Z");
  const a = mensajeDeLlaveAnadida("destino@example.com", "Android · Chrome", ahora);
  const q = mensajeDeLlaveQuitada("destino@example.com", "Android · Chrome", ahora);
  for (const m of [a, q]) {
    assert.equal(m.para, "destino@example.com");
    assert.ok(!m.texto.includes("destino@example.com") && !m.texto.includes("@") && !/https?:/.test(m.texto));
    assert.ok(!m.html && !m.ics && !m.cabeceras, "solo texto");
    assert.ok(m.texto.includes("«Android · Chrome»") && m.texto.includes("2 de noviembre de 2026") && m.texto.includes("18:04"), "cuál y cuándo (hora del olivar)");
    assert.ok(/Si no has sido tú/.test(m.texto) && /oficina/.test(m.texto));
    assert.ok(!/[\r]/.test(m.asunto) && !m.asunto.includes("\n"));
  }
  assert.match(a.texto, /Mis dispositivos y quita esa llave/);
  assert.match(q.texto, /No te quedas fuera: el enlace que te mandamos a este correo sigue funcionando/);
  assert.notEqual(a.asunto, q.asunto);
  const raro = mensajeDeLlaveAnadida("d@example.com", "a\r\nBcc: x\u2028y\u0000z");
  assert.ok(!/[\r\u2028\u0000]/.test(raro.texto), "el nombre no mete saltos ni caracteres de control");
});

test("/api/yo/datos incluye las llaves (nombre, fechas, banderas) y nunca el id de credencial, la clave pública ni el contador", async () => {
  const consultas: string[] = [];
  const bd = {
    query: async (sql: string) => {
      const q = sql.replace(/\s+/g, " ");
      consultas.push(q);
      if (/FROM hogares WHERE id/.test(q)) return { rows: [{ correo: CORREO, rol: "hogar", alias: null }], rowCount: 1 };
      if (/FROM llaves_acceso WHERE hogar_id = \$1 ORDER BY id/.test(q)) {
        return { rowCount: 2, rows: [
          { nombre: "Windows · Chrome", creada_en: new Date("2026-11-01T10:00:00Z"), ultima_vez_en: null, revocada_en: null, sincronizada: true, descubrible: true },
          { nombre: "Viejo", creada_en: new Date("2026-10-01T10:00:00Z"), ultima_vez_en: new Date("2026-10-02T10:00:00Z"), revocada_en: new Date("2026-10-03T10:00:00Z"), sincronizada: false, descubrible: false },
        ] };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const d = await datosDelHogar(bd as never, 1);
  assert.ok(d);
  assert.equal((d["llaves_de_acceso"] as unknown[]).length, 2, "vivas y revocadas (la auditoría las guarda hasta borrar la cuenta)");
  const sql = consultas.find(c => /FROM llaves_acceso/.test(c))!;
  for (const columna of ["credencial_id", "clave_publica", "contador", "transports", "aparato_id"]) assert.ok(!sql.includes(columna), "no se pide " + columna);
  assert.match(sql, /SELECT nombre, creada_en, ultima_vez_en, revocada_en, respaldada AS sincronizada, descubrible FROM llaves_acceso/);
});

test("al borrar la cuenta las llaves se borran con ella: la clave ajena de llaves_acceso.hogar_id es ON DELETE CASCADE (migración 0013, con el nombre cambiado por la 0021)", () => {
  const dir = new URL("../../migraciones/", import.meta.url);
  const f13 = readdirSync(dir).find(f => f.startsWith("0013_"))!;
  const m13 = readFileSync(new URL(f13, dir), "utf8");
  assert.match(m13, /hogar_id\s+bigint NOT NULL REFERENCES hogares \(id\) ON DELETE CASCADE/);
  const m21 = readFileSync(new URL("../../migraciones/0021_llaves_acceso.sql", import.meta.url), "utf8");
  assert.ok(!/DROP CONSTRAINT[^;]*hogar_id_fkey/.test(m21), "la 0021 solo le cambia el nombre a esa clave ajena, no la quita");
  // la ruta de borrar la cuenta (DELETE /api/yo) no borra llaves a mano: cuenta con la cascada, y un test de integración lo comprueba contra PostgreSQL
  const rutas = readFileSync(new URL("../../src/yo/rutas.ts", import.meta.url), "utf8");
  assert.match(rutas, /DELETE FROM hogares WHERE id = \$1/);
});

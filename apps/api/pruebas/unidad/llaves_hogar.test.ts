// Las llaves de una familia desde su ficha en la oficina (OF13b-6, ADR-0029): GET/DELETE /api/admin/hogares/:id/llaves[/:llaveId], el aviso por
// correo de la oficina y el de `rehabilitar-llave` con `revocar_llaves` (el hueco de OF13b-4), sin PostgreSQL. La app entera corre contra la base de
// mentira BdDeLlaves (OF13b-3) ampliada con las consultas de estas rutas; la sesión de verdad nace por el sondeo de unas gafas (cookie firmada) y
// el almacén la lee con la fila que pone cada prueba. Lo que decide PostgreSQL (bloqueos, la cascada de verdad): pruebas/integracion/llaves_hogar.test.ts
// (escrita, se ejecuta por el banco). NO probado con un SMTP real.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { mensajeDeLlavesQuitadasPorLaOficina } from "../../src/auth/correo.ts";
import { datosDelHogar } from "../../src/yo/datos.ts";
import { TEXTO_LIMITE_LLAVES } from "../../src/yo/llaves_rutas.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { BdDeLlaves } from "../apoyo/llaves_bd.ts";

const FAMILIA = "ana.ficha@example.com", OTRA = "luis.ficha@example.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SONDEO = "s".repeat(43);
const HORA = 3_600_000;
const CREDENCIAL = "CREDENCIAL-SECRETA-DE-ANA-0123456789";

/** BdDeLlaves más las consultas de estas rutas. Lo que no conoce, lanza (un cambio de SQL no pasa en silencio). */
class BdFicha extends BdDeLlaves {
  override async query(sql: string, p: unknown[] = []) {
    const q = sql.replace(/\s+/g, " ").trim();
    const r = (rows: Record<string, unknown>[] = [], rowCount = rows.length) => ({ rows, rowCount });
    if (/^UPDATE codigos_vinculo c SET usado_en/.test(q)) return r([{ hogar_id: 1, normas_version: 1, rol: "hogar" }]);
    if (/^UPDATE codigos_vinculo SET hogar_id/.test(q)) return r([], 1);
    if (/FROM sesiones s JOIN hogares h/.test(q)) { const f = this.filaSesion?.(); return r(f ? [f] : []); }
    if (/^UPDATE sesiones SET revocada_en = now\(\) WHERE hash = \$1/.test(q)) return r([], 0);
    if (/^INSERT INTO sesiones/.test(q)) return r([], 1);
    if (/FROM hogares g LEFT JOIN avatares/.test(q)) return r([{ alias: "Mirlo", camisa: null, sombrero: null, piel: null, vrm: null, aspecto: null }]);
    if (q === "SELECT id, rol FROM hogares WHERE id = $1") return r(this.hogares.filter(h => h.id === p[0]).map(h => ({ id: String(h.id), rol: h.rol })));
    if (q.startsWith("SELECT id, nombre, creada_en, ultima_vez_en, revocada_en, respaldada, descubrible FROM llaves_acceso WHERE hogar_id = $1 ORDER BY")) {
      return r(this.llaves.filter(l => l.hogar_id === p[0]).sort((a, b) => Number(!!a.revocada_en) - Number(!!b.revocada_en) || b.id - a.id).map(l => ({
        id: String(l.id), nombre: l.nombre, creada_en: new Date("2026-11-01T10:00:00Z"), ultima_vez_en: l.ultima_vez_en, revocada_en: l.revocada_en,
        respaldada: l.respaldada, descubrible: l.descubrible,
      })));
    }
    if (q === "SELECT correo FROM hogares WHERE id = $1 AND activo") return r(this.hogares.filter(h => h.id === p[0] && h.activo).map(h => ({ correo: h.correo })));
    if (q.startsWith("SELECT nombre FROM llaves_acceso WHERE id = $1 AND hogar_id = $2 AND revocada_en IS NULL"))
      return r(this.llaves.filter(l => l.id === p[0] && l.hogar_id === p[1] && !l.revocada_en).map(l => ({ nombre: l.nombre })));
    if (q.startsWith("SELECT id, nombre FROM llaves_acceso WHERE hogar_id = $1 AND revocada_en IS NULL ORDER BY id"))
      return r(this.llaves.filter(l => l.hogar_id === p[0] && !l.revocada_en).sort((a, b) => a.id - b.id).map(l => ({ id: String(l.id), nombre: l.nombre })));
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
    if (q.startsWith("SELECT rol FROM hogares WHERE id = $1 AND activo")) return r(this.hogares.filter(h => h.id === p[0] && h.activo).map(h => ({ rol: h.rol })));
    if (q.startsWith("UPDATE hogares SET llave_rehabilitada_hasta = now() + make_interval(hours => $2) WHERE id = $1 RETURNING")) {
      const h = this.hogares.find(x => x.id === p[0]);
      if (!h) return r();
      h.llave_rehabilitada_hasta = new Date(Date.now() + (p[1] as number) * HORA);
      return r([{ hasta: h.llave_rehabilitada_hasta }]);
    }
    if (!/llaves_acceso|llaves_retos|hogares|^BEGIN|^COMMIT|^ROLLBACK|auditoria|UPDATE sesiones/.test(q)) return r();
    return super.query(sql, p);
  }
  filaSesion: (() => Record<string, unknown>) | null = null;
}

type Quien = "familia" | "oficina" | "admin";
interface Montaje { app: FastifyInstance; b: BdFicha; cartero: ReturnType<typeof contexto>["cartero"]; cookie: string }

/**
 * Cuentas: 1 familia (Ana), 2 familia (Luis), 3 oficina, 4 admin, 5 otra oficina. `quien` es quien hace la petición (cuenta 3 = oficina, 4 = admin, 1 = una
 * familia); `gafas`: la sesión de la cuenta de oficina es de un código corto (ADR-0028: entra como `hogar`). `confirmada`: confirmación reciente.
 */
async function monta(o: { quien?: Quien; gafas?: boolean; confirmada?: boolean; sinSesion?: boolean } = {}): Promise<Montaje> {
  const b = new BdFicha();
  b.hogar({ id: 1, rol: "hogar", correo: FAMILIA });
  b.hogar({ id: 2, rol: "hogar", correo: OTRA });
  b.hogar({ id: 3, rol: "oficina", correo: "ofi.ficha@example.com" });
  b.hogar({ id: 4, rol: "admin", correo: "adm.ficha@example.com" });
  b.hogar({ id: 5, rol: "oficina", correo: "ofi2.ficha@example.com" });
  b.sesiones.push({ id: 51, hogar_id: 1, llave_id: null, revocada_en: null }, { id: 53, hogar_id: 3, llave_id: null, revocada_en: null }, { id: 54, hogar_id: 4, llave_id: null, revocada_en: null });
  const ctx = contexto(b.bd as unknown as pg.Pool, configDePrueba());
  const app = await construyeApp(ctx);
  await app.ready();
  const quien = o.quien ?? "oficina";
  const hogar = quien === "familia" ? 1 : quien === "oficina" ? 3 : 4;
  b.filaSesion = o.sinSesion ? null : () => ({
    sid: 50 + hogar, hogar_id: hogar, rol: o.gafas ? "hogar" : quien === "familia" ? "hogar" : quien, alias: "Mirlo", alias_visible: false, normas_version: 1,
    origen: o.gafas ? "vinculo" : "enlace", expira_en: new Date(Date.now() + 12 * HORA), refrescar: false,
    aparato_id: hogar === 1 ? null : 3, aparato_aprobado: hogar !== 1, confirmada_en: o.confirmada === false ? null : new Date(), confirmacion_vigente: o.confirmada !== false, llave_id: null,
  });
  const sondeo = await app.inject({ method: "POST", url: "/api/auth/vincula/sondeo", headers: deLaWeb(), payload: { sondeo: SONDEO } });
  assert.equal(sondeo.statusCode, 200, sondeo.body);
  const sc = ([] as string[]).concat(sondeo.headers["set-cookie"] ?? []).find(c => c.startsWith("__Host-gemelo="));
  assert.ok(sc);
  b.auditoria.length = 0;
  return { app, b, cartero: ctx.cartero, cookie: sc.split(";")[0]! };
}

let ipN = 0;
const ip = () => "198.51.100." + (++ipN % 250);
const llama = (m: Montaje, method: "GET" | "POST" | "DELETE", url: string, payload?: unknown) =>
  m.app.inject({ method, url, headers: { ...deLaWeb({ "x-forwarded-for": ip(), "user-agent": UA }), cookie: m.cookie }, ...(payload !== undefined ? { payload: payload as object } : {}) });
const asentada = () => new Promise<void>(ok => setImmediate(() => setImmediate(ok)));
const llave = (b: BdFicha, hogar: number, n: number, extra: Record<string, unknown> = {}) =>
  b.llave({ hogar_id: hogar, credencial_id: n === 1 && hogar === 1 ? CREDENCIAL : "CRED" + hogar + "x" + n + "A".repeat(18), clave_publica: Buffer.alloc(77, n), nombre: "Llave " + n, ...extra });

// ---------------------------------------------------------------- guardas y forma
test("sin sesión 401; sin Origin 403; familia 403; unas gafas de oficina 403 (entran como hogar); forma mala 400", async () => {
  const m0 = await monta({ sinSesion: true });
  for (const [method, url] of [["GET", "/api/admin/hogares/1/llaves"], ["DELETE", "/api/admin/hogares/1/llaves"], ["DELETE", "/api/admin/hogares/1/llaves/1"]] as const) {
    assert.equal((await llama(m0, method, url)).statusCode, 401, method + " " + url);
  }
  const sinOrigen = await m0.app.inject({ method: "DELETE", url: "/api/admin/hogares/1/llaves", headers: { "x-forwarded-proto": "https" } });
  assert.equal(sinOrigen.statusCode, 403, "sin Origin del sitio");
  for (const [por, m] of [["familia", await monta({ quien: "familia" })], ["gafas de oficina", await monta({ quien: "oficina", gafas: true })]] as const) {
    for (const [method, url] of [["GET", "/api/admin/hogares/1/llaves"], ["DELETE", "/api/admin/hogares/1/llaves"], ["DELETE", "/api/admin/hogares/1/llaves/1"]] as const) {
      const r = await llama(m, method, url);
      assert.deepEqual([r.statusCode, r.json().error], [403, "sin_permiso"], por + " " + method + " " + url);
    }
  }
  const m = await monta();
  for (const [method, url, payload] of [
    ["GET", "/api/admin/hogares/0/llaves", undefined], ["GET", "/api/admin/hogares/abc/llaves", undefined],
    ["DELETE", "/api/admin/hogares/1/llaves/0", undefined], ["DELETE", "/api/admin/hogares/1/llaves/1.5", undefined],
    ["DELETE", "/api/admin/hogares/1/llaves", { motivo: "x", extra: 1 }], ["DELETE", "/api/admin/hogares/1/llaves", { motivo: "dos\nlíneas" }],
    ["DELETE", "/api/admin/hogares/1/llaves", { motivo: "a".repeat(201) }], ["DELETE", "/api/admin/hogares/1/llaves/1", { motivo: 7 }],
  ] as const) {
    assert.equal((await llama(m, method, url, payload)).statusCode, 400, method + " " + url + " " + JSON.stringify(payload));
  }
  assert.equal(m.b.auditoria.length, 0);
});

test("quitar necesita la confirmación reciente; la lista no", async () => {
  const m = await monta({ confirmada: false });
  llave(m.b, 1, 1);
  assert.equal((await llama(m, "GET", "/api/admin/hogares/1/llaves")).statusCode, 200);
  for (const url of ["/api/admin/hogares/1/llaves/1", "/api/admin/hogares/1/llaves"]) {
    const r = await llama(m, "DELETE", url);
    assert.deepEqual([r.statusCode, r.json().error], [403, "confirmacion_requerida"], url);
  }
  assert.ok(!m.b.llaves[0]!.revocada_en, "no se tocó");
});

// ---------------------------------------------------------------- lista
test("la lista enseña nombre, fechas y banderas, vivas y revocadas, y nunca el id de credencial, la clave ni el contador", async () => {
  const m = await monta();
  llave(m.b, 1, 1, { nombre: "Móvil de Ana", respaldada: true, contador: 41, ultima_vez_en: new Date("2026-11-02T08:00:00Z") });
  llave(m.b, 1, 2, { nombre: "Portátil viejo", descubrible: false });
  llave(m.b, 1, 3, { nombre: "Tableta perdida", revocada_en: new Date("2026-10-30T08:00:00Z") });
  llave(m.b, 2, 1, { nombre: "De Luis" });
  const r = await llama(m, "GET", "/api/admin/hogares/1/llaves");
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.headers["cache-control"], "no-store");
  const { llaves } = r.json() as { llaves: Record<string, unknown>[] };
  assert.deepEqual(llaves.map(l => [l["nombre"], l["viva"], l["descubrible"], l["sincronizada"]]),
    [["Portátil viejo", true, false, false], ["Móvil de Ana", true, true, true], ["Tableta perdida", false, true, false]], "vivas primero; de Luis, ninguna");
  assert.deepEqual(Object.keys(llaves[0]!).sort(), ["creada_en", "descubrible", "id", "nombre", "revocada_en", "sincronizada", "ultima_vez_en", "viva"]);
  assert.ok(!/CRED|clave|contador|publica|41/.test(r.body.replace(/"id":\d+/g, "")), "sin material criptográfico: " + r.body);
});

test("404 idéntico: familia inexistente, cuenta de oficina (aquí no se toca) y llave ajena o inexistente", async () => {
  const m = await monta({ quien: "admin" });
  llave(m.b, 1, 1); llave(m.b, 2, 1); llave(m.b, 3, 1, { nombre: "De la oficina" });
  const ajena = m.b.llaves.find(l => l.hogar_id === 2)!.id, deOficina = m.b.llaves.find(l => l.hogar_id === 3)!.id;
  const esperado = JSON.stringify({ error: "no_existe" });
  const casos: [string, string][] = [
    ["GET", "/api/admin/hogares/99/llaves"], ["GET", "/api/admin/hogares/3/llaves"], ["GET", "/api/admin/hogares/4/llaves"],
    ["DELETE", "/api/admin/hogares/99/llaves"], ["DELETE", "/api/admin/hogares/3/llaves"], ["DELETE", "/api/admin/hogares/99/llaves/1"],
    ["DELETE", "/api/admin/hogares/1/llaves/" + ajena], ["DELETE", "/api/admin/hogares/1/llaves/9999"], ["DELETE", "/api/admin/hogares/3/llaves/" + deOficina],
  ];
  for (const [method, url] of casos) {
    const r = await llama(m, method as "GET" | "DELETE", url);
    assert.deepEqual([r.statusCode, r.body], [404, esperado], method + " " + url);
  }
  assert.ok(m.b.llaves.every(l => !l.revocada_en), "no se tocó ninguna");
  assert.equal(m.b.auditoria.length, 0);
  await asentada();
  assert.equal(m.cartero.mensajes.length, 0, "ningún aviso");
});

// ---------------------------------------------------------------- quitar
test("quitar una: la revoca, cierra solo sus sesiones, avisa a la familia («la oficina») y audita sin credencial ni correo", async () => {
  const m = await monta();
  const a = llave(m.b, 1, 1, { nombre: "Móvil de Ana" }), otra = llave(m.b, 1, 2, { nombre: "Portátil" });
  m.b.sesiones.push({ id: 91, hogar_id: 1, llave_id: a.id, revocada_en: null }, { id: 92, hogar_id: 1, llave_id: otra.id, revocada_en: null });
  const r = await llama(m, "DELETE", "/api/admin/hogares/1/llaves/" + a.id, { motivo: "Perdió el móvil; llamó por teléfono" });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { sesiones_cerradas: 1, aviso_enviado: true });
  assert.ok(a.revocada_en && !otra.revocada_en);
  assert.deepEqual(m.b.sesiones.filter(s => s.revocada_en).map(s => s.id), [91], "solo la sesión de esa llave");
  const au = m.b.auditoria.filter(x => x.accion === "admin.llave_quitada");
  assert.equal(au.length, 1);
  assert.equal(au[0]!.hogar_id, 3, "la audita quien actúa");
  assert.deepEqual(au[0]!.detalle, { hogar: 1, llave: a.id, sesiones: 1, motivo: "Perdió el móvil; llamó por teléfono" });
  const todo = JSON.stringify(m.b.auditoria);
  assert.ok(!todo.includes(CREDENCIAL) && !todo.includes("@"), "ni credencial ni correo en la auditoría");
  const c = m.cartero.mensajes;
  assert.equal(c.length, 1);
  assert.equal(c[0]!.para, FAMILIA);
  assert.match(c[0]!.asunto, /La oficina ha quitado una llave de acceso/);
  assert.match(c[0]!.texto, /«Móvil de Ana»/);
  assert.match(c[0]!.texto, /enlace que te mandamos a este correo sigue funcionando/);
  assert.doesNotMatch(c[0]!.texto, /ofi\.ficha|Perdió el móvil|@|https?:/, "ni el correo de quien actúa, ni el motivo, ni enlaces");
  // la segunda vez, la llave ya no está viva: 404, sin segundo aviso
  assert.equal((await llama(m, "DELETE", "/api/admin/hogares/1/llaves/" + a.id)).statusCode, 404);
  assert.equal(m.cartero.mensajes.length, 1);
});

test("quitar todas: revoca las vivas de ESA familia, cierra sus sesiones y manda un solo aviso; sin llaves, no hay aviso", async () => {
  const m = await monta({ quien: "admin" });
  const a = llave(m.b, 1, 1, { nombre: "Móvil" }), b2 = llave(m.b, 1, 2, { nombre: "Portátil" }), vieja = llave(m.b, 1, 3, { nombre: "Vieja", revocada_en: new Date("2026-10-01T00:00:00Z") }), luis = llave(m.b, 2, 1);
  m.b.sesiones.push({ id: 91, hogar_id: 1, llave_id: a.id, revocada_en: null }, { id: 92, hogar_id: 1, llave_id: b2.id, revocada_en: null }, { id: 93, hogar_id: 2, llave_id: luis.id, revocada_en: null });
  const r = await llama(m, "DELETE", "/api/admin/hogares/1/llaves");
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { llaves_quitadas: 2, sesiones_cerradas: 2, aviso_enviado: true });
  assert.ok(a.revocada_en && b2.revocada_en && !luis.revocada_en);
  assert.equal(vieja.revocada_en?.toISOString(), "2026-10-01T00:00:00.000Z", "la ya revocada no se toca");
  assert.ok(!m.b.sesiones.find(s => s.id === 93)!.revocada_en, "la sesión de otra familia sigue");
  const au = m.b.auditoria.filter(x => x.accion === "admin.llave_quitada");
  assert.deepEqual(au.map(x => x.detalle), [{ hogar: 1, llaves: 2, todas: true, sesiones: 2, motivo: null }]);
  assert.equal(m.cartero.mensajes.length, 1);
  assert.match(m.cartero.mensajes[0]!.asunto, /La oficina ha quitado llaves de acceso/);
  assert.match(m.cartero.mensajes[0]!.texto, /«Móvil», «Portátil»/);
  // ahora no queda ninguna: 200 con cero, sin aviso ni auditoría nueva
  const otra = await llama(m, "DELETE", "/api/admin/hogares/1/llaves");
  assert.deepEqual(otra.json(), { llaves_quitadas: 0, sesiones_cerradas: 0, aviso_enviado: false });
  assert.equal(m.cartero.mensajes.length, 1);
  assert.equal(m.b.auditoria.filter(x => x.accion === "admin.llave_quitada").length, 1);
});

test("un fallo del correo no tumba la operación: la llave queda quitada y el rastro, en la auditoría", async () => {
  const m = await monta();
  const a = llave(m.b, 1, 1);
  m.cartero.falla = true;
  const r = await llama(m, "DELETE", "/api/admin/hogares/1/llaves/" + a.id);
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { sesiones_cerradas: 0, aviso_enviado: false });
  assert.ok(a.revocada_en);
  assert.deepEqual(m.b.auditoria.map(x => x.accion), ["admin.llave_quitada", "admin.llave_aviso_fallido"]);
  assert.deepEqual(m.b.auditoria[1]!.detalle, { hogar: 1 }, "sin la dirección ni el error");
  const b2 = llave(m.b, 1, 2);
  const t = await llama(m, "DELETE", "/api/admin/hogares/1/llaves");
  assert.deepEqual(t.json(), { llaves_quitadas: 1, sesiones_cerradas: 0, aviso_enviado: false });
  assert.ok(b2.revocada_en);
});

test("límite: 20 bajas por cuenta de oficina cada 15 minutos, con el texto de las llaves", async () => {
  const m = await monta();
  for (let i = 0; i < 20; i++) assert.equal((await llama(m, "DELETE", "/api/admin/hogares/1/llaves/9999")).statusCode, 404);
  const r = await llama(m, "DELETE", "/api/admin/hogares/1/llaves/9999");
  assert.deepEqual([r.statusCode, r.json().error, r.json().mensaje], [429, "demasiadas_peticiones", TEXTO_LIMITE_LLAVES]);
});

// ---------------------------------------------------------------- rehabilitar-llave avisa (el hueco anotado en OF13b-4)
test("rehabilitar-llave con revocar_llaves AHORA avisa a la cuenta de las llaves quitadas; sin revocar, no hay aviso", async () => {
  const m = await monta({ quien: "admin" });
  const l1 = llave(m.b, 5, 1, { nombre: "YubiKey" }), l2 = llave(m.b, 5, 2, { nombre: "Portátil" });
  m.b.sesiones.push({ id: 95, hogar_id: 5, llave_id: l1.id, revocada_en: null });
  const sin = await llama(m, "POST", "/api/admin/hogares/5/rehabilitar-llave", {});
  assert.equal(sin.statusCode, 200, sin.body);
  assert.equal(sin.json().llaves_revocadas, 0);
  assert.equal(m.cartero.mensajes.length, 0, "sin revocar llaves no hay nada que avisar");
  const r = await llama(m, "POST", "/api/admin/hogares/5/rehabilitar-llave", { revocar_llaves: true });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual([r.json().llaves_revocadas, r.json().sesiones_cerradas], [2, 1]);
  assert.ok(l1.revocada_en && l2.revocada_en);
  await asentada();
  assert.equal(m.cartero.mensajes.length, 1);
  assert.equal(m.cartero.mensajes[0]!.para, "ofi2.ficha@example.com");
  assert.match(m.cartero.mensajes[0]!.texto, /«YubiKey», «Portátil»/);
  assert.match(m.cartero.mensajes[0]!.texto, /La oficina del gemelo/);
  const au = m.b.auditoria.filter(x => x.accion === "oficina.llave_rehabilitada").at(-1)!;
  assert.deepEqual([au.detalle["llaves_revocadas"], au.detalle["sesiones"]], [2, 1]);
  // si el correo falla, la rehabilitación sigue en pie y queda el rastro
  const m2 = await monta({ quien: "admin" });
  llave(m2.b, 5, 1);
  m2.cartero.falla = true;
  const f = await llama(m2, "POST", "/api/admin/hogares/5/rehabilitar-llave", { revocar_llaves: true });
  assert.equal(f.statusCode, 200, f.body);
  assert.deepEqual(m2.b.auditoria.map(x => x.accion), ["oficina.llave_rehabilitada", "oficina.llave_aviso_fallido"]);
});

// ---------------------------------------------------------------- el correo, la exportación y el borrado
test("el aviso de la oficina: genérico, sin enlaces ni el nombre de nadie, nombres saneados y tope de cinco", () => {
  const m = mensajeDeLlavesQuitadasPorLaOficina("ana@example.com", ["Móvil\nde Ana\u0000", "B", "C", "D", "E", "F", "G"], new Date("2026-11-02T17:04:00Z"));
  assert.equal(m.para, "ana@example.com");
  assert.match(m.texto, /«Móvil de Ana», «B», «C», «D», «E» y 2 más/);
  assert.match(m.texto, /2 de noviembre de 2026 a las 18:04/);
  assert.match(m.texto, /la oficina/i);
  assert.doesNotMatch(m.texto, /https?:|<|@/);
  assert.equal(m.html, undefined);
  assert.match(mensajeDeLlavesQuitadasPorLaOficina("a@example.com", ["Una"]).asunto, /una llave/);
});

test("la exportación de la oficina lleva las llaves como la de /api/yo/datos (misma función) y sin material criptográfico", async () => {
  const filas: Record<string, Record<string, unknown>[]> = {
    "FROM hogares": [{ correo: FAMILIA, rol: "hogar" }],
    "FROM llaves_acceso": [{ nombre: "Móvil de Ana", creada_en: "2026-11-01", ultima_vez_en: null, revocada_en: null, sincronizada: true, descubrible: true }],
  };
  const bd = { query: async (sql: string) => { const q = sql.replace(/\s+/g, " "); const k = Object.keys(filas).find(x => q.includes(x)); return { rows: k ? filas[k]! : [], rowCount: 0 }; } };
  const d = await datosDelHogar(bd as never, 1);
  assert.deepEqual(d!["llaves_de_acceso"], filas["FROM llaves_acceso"]);
  assert.ok(!/credencial|clave_publica|contador/.test(JSON.stringify(d)), "nada criptográfico");
  // la ruta de la oficina usa esa misma función (no una copia)
  const rutas = readFileSync(new URL("../../src/admin/familias.ts", import.meta.url), "utf8");
  assert.match(rutas, /datosDelHogar\(bd, o\.id\)/);
  const consulta = readFileSync(new URL("../../src/yo/datos.ts", import.meta.url), "utf8");
  assert.match(consulta, /SELECT nombre, creada_en, ultima_vez_en, revocada_en, respaldada AS sincronizada, descubrible FROM llaves_acceso/);
});

test("borrar la cuenta borra sus llaves, sus retos y suelta el llave_id de las sesiones (la cascada de las migraciones)", () => {
  const f13 = readdirSync(new URL("../../migraciones/", import.meta.url)).find(f => f.startsWith("0013_"))!;   // la que crea la tabla de llaves
  const m13 = readFileSync(new URL("../../migraciones/" + f13, import.meta.url), "utf8");
  assert.match(m13, /hogar_id\s+bigint NOT NULL REFERENCES hogares \(id\) ON DELETE CASCADE/, "llaves_acceso.hogar_id en cascada");
  assert.match(m13, /sesion_id\s+bigint NOT NULL REFERENCES sesiones \(id\) ON DELETE CASCADE/, "llaves_retos.sesion_id en cascada");
  // la de verdad (con PostGIS) está en pruebas/integracion/llaves_yo.test.ts y llaves_hogar.test.ts
});

// Auditoría de la api del 2026-11-14 (A-01, A-02, A-03, A-04, A-10) sin base de datos: lo que es de la CUENTA solo con sesión de titular
// (unas gafas vinculadas, también las de la oficina, que entran como visitante por el ADR-0028, no lo tocan), el borrado propio de una
// cuenta de oficina con confirmación reciente y nunca el último admin, y las dos rutas antiguas de admin/rutas.ts con las reglas de sus
// hermanas de OF2 (veto oficina → admin, cuenta de baja, una haza por hogar). La app entera corre contra una base de mentira que responde
// por fragmento de SQL; la sesión nace por el sondeo de unas gafas (cookie firmada de verdad) y el almacén la lee con la fila que pone cada
// prueba. Lo que decide PostgreSQL (la cascada, el FOR UPDATE): pruebas/integracion/guardas_cuenta.test.ts (escrita, se ejecuta por el banco).
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const HORA = 3_600_000;
const SONDEO = "s".repeat(43);
type Fila = Record<string, unknown>;
type Cuenta = { id: number; correo: string; rol: string; activo: boolean; normas_version: number | null };

const consultas: Array<{ sql: string; params: unknown[] }> = [];
let filaSesion: Fila | null = null;
let cuentas: Cuenta[] = [];
let hazas: Array<{ id: number; hogar_id: number | null }> = [];

function responde(sql: string, p: unknown[] = []) {
  consultas.push({ sql, params: p });
  const q = sql.replace(/\s+/g, " ").trim();
  const r = (rows: Fila[] = [], rowCount = rows.length) => ({ rows, rowCount });
  if (/UPDATE codigos_vinculo c SET usado_en/.test(q)) return r([{ hogar_id: 5, normas_version: 1, rol: "hogar" }]);
  if (/FROM sesiones s JOIN hogares h/.test(q)) return r(filaSesion ? [filaSesion] : []);
  if (q.startsWith("SELECT id, correo::text AS correo, rol, activo, normas_version FROM hogares WHERE id = $1")) return r(cuentas.filter(c => c.id === p[0]));
  if (q.startsWith("SELECT count(*)::int AS n FROM hogares WHERE rol = 'admin' AND activo AND id <> $1")) {
    return r([{ n: cuentas.filter(c => c.rol === "admin" && c.activo && c.id !== p[0]).length }]);
  }
  if (q.startsWith("SELECT h.rol FROM hazas z LEFT JOIN hogares h")) {
    return r(hazas.filter(z => z.id === p[0]).map(z => ({ rol: cuentas.find(c => c.id === z.hogar_id)?.rol ?? null })));
  }
  if (q.startsWith("SELECT hogar_id FROM hazas WHERE id = $1 FOR UPDATE")) return r(hazas.filter(z => z.id === p[0]).map(z => ({ hogar_id: z.hogar_id })));
  if (q.startsWith("SELECT correo::text AS correo FROM hogares WHERE id = $1")) return r(cuentas.filter(c => c.id === p[0]).map(c => ({ correo: c.correo })));
  if (q.startsWith("UPDATE hazas SET hogar_id = NULL, actualizada_en = now() WHERE hogar_id = $1 AND id IS DISTINCT FROM $2")) {
    const s = hazas.filter(z => z.hogar_id === p[0] && z.id !== p[1]);
    for (const z of s) z.hogar_id = null;
    return r([], s.length);
  }
  if (q.startsWith("UPDATE hazas SET hogar_id = $1, actualizada_en = now() WHERE id = $2")) {
    const z = hazas.find(x => x.id === p[1]);
    if (z) z.hogar_id = p[0] as number;
    return r([], z ? 1 : 0);
  }
  if (q.startsWith("UPDATE hazas SET hogar_id = NULL, actualizada_en = now() WHERE id = $1")) {
    const z = hazas.find(x => x.id === p[0]);
    if (z) z.hogar_id = null;
    return r([], z ? 1 : 0);
  }
  if (/^UPDATE sesiones SET revocada_en = now\(\) WHERE hogar_id = \$1/.test(q)) return r([], 2);
  if (q.startsWith("DELETE FROM hogares")) return r([], 1);
  return r();
}
const bd = { query: async (sql: string, p?: unknown[]) => responde(sql, p), connect: async () => ({ query: async (sql: string, p?: unknown[]) => responde(sql, p), release: () => undefined }) };

/** La fila de una sesión tal como la da el SELECT del almacén. */
function fila(o: Fila): Fila {
  return {
    sid: 11, hogar_id: 5, rol: "hogar", alias: "Mirlo", alias_visible: false, normas_version: 1, origen: "enlace",
    expira_en: new Date(Date.now() + 12 * HORA), refrescar: false, aparato_id: null, aparato_aprobado: false,
    confirmada_en: null, confirmacion_vigente: false, llave_id: null, ...o,
  };
}
const GAFAS = (rol: string, hogar = 5) => fila({ hogar_id: hogar, rol, origen: "vinculo" });
const PC = (rol: string, hogar: number, confirmada = true) =>
  fila({ hogar_id: hogar, rol, origen: "enlace", aparato_id: 3, aparato_aprobado: true, confirmada_en: confirmada ? new Date() : null, confirmacion_vigente: confirmada });

let app: FastifyInstance;
let cookie = "";
before(async () => {
  app = await construyeApp(contexto(bd as unknown as pg.Pool, configDePrueba()));
  await app.ready();
  const r = await app.inject({ method: "POST", url: "/api/auth/vincula/sondeo", headers: deLaWeb(), payload: { sondeo: SONDEO } });
  assert.equal(r.statusCode, 200, r.body);
  cookie = ([] as string[]).concat(r.headers["set-cookie"] ?? []).find(c => c.startsWith("__Host-gemelo="))!.split(";")[0]!;
});
after(async () => { await app.close(); });
beforeEach(() => {
  consultas.length = 0;
  cuentas = [
    { id: 1, correo: "ana.guarda@example.com", rol: "hogar", activo: true, normas_version: 1 },
    { id: 2, correo: "luis.guarda@example.com", rol: "hogar", activo: false, normas_version: 1 },
    { id: 3, correo: "ofi.guarda@example.com", rol: "oficina", activo: true, normas_version: null },
    { id: 4, correo: "adm.guarda@example.com", rol: "admin", activo: true, normas_version: null },
    { id: 5, correo: "mirlo.guarda@example.com", rol: "hogar", activo: true, normas_version: 1 },
  ];
  hazas = [{ id: 10, hogar_id: null }, { id: 11, hogar_id: 1 }, { id: 12, hogar_id: 4 }];
});
const pide = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, headers: { ...deLaWeb(), cookie }, ...(payload !== undefined ? { payload } : {}) });
const tocó = (re: RegExp) => consultas.some(c => re.test(c.sql));

// ---------------------------------------------------------------- A-01 y A-02: lo de la cuenta, solo titular
const DE_LA_CUENTA: Array<[string, "GET" | "PUT" | "POST" | "DELETE", string, object?]> = [
  ["A-01", "DELETE", "/api/yo"],
  ["A-02", "GET", "/api/yo/datos"],
  ["A-02", "PUT", "/api/yo/alias", { alias: "Gafas Nuevas", visible: true }],
  ["A-02", "POST", "/api/sesion/salir-todas", {}],
];

test("A-01/A-02: unas gafas vinculadas (de familia, de oficina o de admin) no borran la cuenta, ni bajan sus datos, ni cambian el alias, ni cierran todas sus sesiones", async () => {
  for (const rol of ["hogar", "oficina", "admin"]) {
    for (const [id, method, url, payload] of DE_LA_CUENTA) {
      filaSesion = GAFAS(rol, rol === "hogar" ? 5 : rol === "oficina" ? 3 : 4);
      consultas.length = 0;
      const r = await pide(method, url, payload);
      assert.equal(r.statusCode, 403, id + " " + method + " " + url + " desde unas gafas de " + rol + ": " + r.body);
      assert.equal(r.json().error, "solo_titular");
      assert.doesNotMatch(r.body, /@/, "ni un correo en la respuesta");
      assert.equal(tocó(/DELETE FROM hogares|UPDATE hogares SET alias|UPDATE sesiones SET revocada_en = now\(\) WHERE hogar_id|FROM medios|auditoria/), false, "no toca nada: " + url);
    }
  }
});

test("A-01/A-02: la sesión de titular de una familia sí: borra su cuenta (204) y cierra todas sus sesiones (204)", async () => {
  filaSesion = fila({ hogar_id: 5 });
  const s = await pide("POST", "/api/sesion/salir-todas", {});
  assert.equal(s.statusCode, 204, s.body);
  filaSesion = fila({ hogar_id: 5 });
  consultas.length = 0;
  const b = await pide("DELETE", "/api/yo");
  assert.equal(b.statusCode, 204, b.body);
  assert.ok(tocó(/DELETE FROM hogares WHERE id = \$1/));
  filaSesion = fila({ hogar_id: 5, origen: "llave", llave_id: 9 });
  const d = await pide("GET", "/api/yo/datos");
  assert.notEqual(d.statusCode, 403, "una sesión abierta con la llave es de titular (ADR-0029)");
});

test("A-01: una cuenta de oficina o admin borra la suya solo con confirmación reciente (403 confirmacion_requerida) y nunca la última admin (409)", async () => {
  filaSesion = PC("oficina", 3, false);
  let r = await pide("DELETE", "/api/yo");
  assert.equal(r.statusCode, 403, r.body);
  assert.equal(r.json().error, "confirmacion_requerida");
  assert.equal(tocó(/DELETE FROM hogares/), false);

  filaSesion = PC("admin", 4, true);   // la única admin activa
  consultas.length = 0;
  r = await pide("DELETE", "/api/yo");
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(r.json().error, "ultimo_admin");
  assert.equal(tocó(/DELETE FROM hogares/), false);

  cuentas.push({ id: 6, correo: "adm2.guarda@example.com", rol: "admin", activo: true, normas_version: null });
  filaSesion = PC("admin", 4, true);
  r = await pide("DELETE", "/api/yo");
  assert.equal(r.statusCode, 204, "con otra admin activa, sí: " + r.body);

  filaSesion = PC("oficina", 3, true);
  r = await pide("DELETE", "/api/yo");
  assert.equal(r.statusCode, 204, "oficina confirmada: " + r.body);
});

// ---------------------------------------------------------------- A-03: revocar
test("A-03: una cuenta oficina no cierra las sesiones de un admin ni de otra oficina (403); las de una familia y las propias, sí; la de un id que no existe, 404", async () => {
  filaSesion = PC("oficina", 3);
  let r = await pide("POST", "/api/admin/hogares/4/revocar", {});
  assert.equal(r.statusCode, 403, r.body);
  assert.equal(r.json().error, "sin_permiso");
  assert.equal(tocó(/UPDATE sesiones SET revocada_en/), false, "no se revoca nada");

  r = await pide("POST", "/api/admin/hogares/1/revocar", {});
  assert.equal(r.statusCode, 204, r.body);
  r = await pide("POST", "/api/admin/hogares/3/revocar", {});
  assert.equal(r.statusCode, 204, "las propias: " + r.body);
  r = await pide("POST", "/api/admin/hogares/99/revocar", {});
  assert.equal(r.statusCode, 404, r.body);

  filaSesion = PC("admin", 4);
  r = await pide("POST", "/api/admin/hogares/3/revocar", {});
  assert.equal(r.statusCode, 204, "un admin, sí: " + r.body);
});

// ---------------------------------------------------------------- A-04: asignar desde la ficha de la haza
test("A-04: asignar una haza a una cuenta de baja es 409 de_baja (decisión 108) y no se toca la haza", async () => {
  filaSesion = PC("oficina", 3);
  const r = await pide("PUT", "/api/admin/hazas/10/hogar", { hogar_id: 2 });
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(r.json().error, "de_baja");
  assert.equal(hazas.find(z => z.id === 10)!.hogar_id, null);
  assert.equal(tocó(/UPDATE hazas/), false);
});

test("A-04: asignar una haza a una familia suelta la que tuviera (decisión 91: una haza por hogar)", async () => {
  filaSesion = PC("oficina", 3);
  const r = await pide("PUT", "/api/admin/hazas/10/hogar", { hogar_id: 1 });
  assert.equal(r.statusCode, 204, r.body);
  assert.equal(hazas.find(z => z.id === 10)!.hogar_id, 1);
  assert.equal(hazas.find(z => z.id === 11)!.hogar_id, null, "la 11 queda libre");
  assert.ok(tocó(/BEGIN/) && tocó(/COMMIT/), "en una transacción");
});

test("A-04: una cuenta oficina no asigna ni quita hazas de una cuenta admin (403); la haza o el hogar que no existen, 404 y 400 como siempre", async () => {
  filaSesion = PC("oficina", 3);
  let r = await pide("PUT", "/api/admin/hazas/10/hogar", { hogar_id: 4 });
  assert.equal(r.statusCode, 403, r.body);
  r = await pide("PUT", "/api/admin/hazas/12/hogar", { hogar_id: null });
  assert.equal(r.statusCode, 403, "quitar la haza de una admin: " + r.body);
  assert.equal(hazas.find(z => z.id === 12)!.hogar_id, 4);
  r = await pide("PUT", "/api/admin/hazas/99/hogar", { hogar_id: 1 });
  assert.equal(r.statusCode, 404, r.body);
  r = await pide("PUT", "/api/admin/hazas/10/hogar", { hogar_id: 99 });
  assert.equal(r.statusCode, 400, r.body);
  assert.equal(r.json().error, "hogar_no_existe");
  r = await pide("PUT", "/api/admin/hazas/11/hogar", { hogar_id: null });
  assert.equal(r.statusCode, 204, "quitar la haza de una familia: " + r.body);
  assert.equal(hazas.find(z => z.id === 11)!.hogar_id, null);
});

// ---------------------------------------------------------------- A-10: los dos vetado() de familias
test("A-10: una cuenta oficina no ve las sesiones de un admin ni le asigna haza (403); las suyas sí las ve; un admin, todo", async () => {
  filaSesion = PC("oficina", 3);
  let r = await pide("GET", "/api/admin/hogares/4/sesiones");
  assert.equal(r.statusCode, 403, r.body);
  r = await pide("PUT", "/api/admin/hogares/4/haza", { haza_id: 10 });
  assert.equal(r.statusCode, 403, r.body);
  assert.equal(hazas.find(z => z.id === 10)!.hogar_id, null);
  r = await pide("GET", "/api/admin/hogares/3/sesiones");
  assert.equal(r.statusCode, 200, "las propias: " + r.body);
  filaSesion = PC("admin", 4);
  r = await pide("GET", "/api/admin/hogares/3/sesiones");
  assert.equal(r.statusCode, 200, r.body);
});

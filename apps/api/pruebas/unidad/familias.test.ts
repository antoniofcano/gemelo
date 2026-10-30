// Familias de la oficina (OF2) sin base de datos: las funciones puras, que toda ruta de familias pide sesión de oficina, que
// cada una valida su entrada antes de tocar la base y que el correo de bienvenida lleva el enlace.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { DIAS_DE_BAJA } from "../../src/admin/bajas.ts";
import { escapaLike, estadoDeCuenta } from "../../src/admin/familias.ts";
import { mensajeDeBienvenida } from "../../src/auth/correo.ts";
import { contexto, deLaWeb } from "../apoyo/contexto.ts";

let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
before(async () => { app = await construyeApp(contexto(bd)); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

test("escapaLike: % _ y \\ de la búsqueda no son comodines", () => {
  assert.equal(escapaLike("ana"), "ana");
  assert.equal(escapaLike("100%_a\\b"), "100\\%\\_a\\\\b");
});

test("estadoDeCuenta: baja, sin primer acceso (no las de oficina) o activa", () => {
  assert.equal(estadoDeCuenta({ activo: false, rol: "hogar", normas_version: 1 }), "baja");
  assert.equal(estadoDeCuenta({ activo: true, rol: "hogar", normas_version: null }), "pendiente");
  assert.equal(estadoDeCuenta({ activo: true, rol: "guia", normas_version: null }), "pendiente");
  assert.equal(estadoDeCuenta({ activo: true, rol: "hogar", normas_version: 1 }), "activa");
  assert.equal(estadoDeCuenta({ activo: true, rol: "oficina", normas_version: null }), "activa");
  assert.equal(estadoDeCuenta({ activo: true, rol: "admin", normas_version: null }), "activa");
  assert.equal(DIAS_DE_BAJA, 30, "decisión 108");
});

test("el correo de bienvenida lleva el enlace y el plazo, sin imágenes ni seguimiento", () => {
  const m = mensajeDeBienvenida("ana@example.com", "https://gemelo.example.com/api/auth/entrar?t=XYZ", 15);
  assert.equal(m.para, "ana@example.com");
  assert.match(m.texto, /entrar\?t=XYZ/);
  assert.match(m.texto, /15 minutos/);
  assert.doesNotMatch(m.texto, /<img|<a /);
});

const RUTAS: [string, string, object?][] = [
  ["GET", "/api/admin/hogares"], ["GET", "/api/admin/hazas"], ["POST", "/api/admin/hogares", { correo: "a@example.com", rol: "hogar" }],
  ["PATCH", "/api/admin/hogares/1", { quitar_alias: true }], ["POST", "/api/admin/hogares/1/enlace", {}], ["GET", "/api/admin/hogares/1/sesiones"],
  ["DELETE", "/api/admin/sesiones/1"], ["PUT", "/api/admin/hogares/1/haza", { haza_id: null }], ["POST", "/api/admin/hogares/1/baja", {}],
  ["POST", "/api/admin/hogares/1/reactivar", {}], ["GET", "/api/admin/hogares/1/exportar"], ["DELETE", "/api/admin/hogares/1", { correo: "a@example.com" }],
];

test("sin sesión, ninguna ruta de familias responde (401) ni toca la base", async () => {
  for (const [method, url, payload] of RUTAS) {
    const r = await app.inject({ method: method as "GET", url, headers: deLaWeb(), ...(payload ? { payload } : {}) });
    assert.equal(r.statusCode, 401, method + " " + url);
  }
});

test("las entradas mal formadas son 400 antes de mirar la sesión", async () => {
  const malas: [string, string, object | undefined][] = [
    ["GET", "/api/admin/hogares?estado=zombi", undefined], ["GET", "/api/admin/hogares?limite=9999", undefined],
    ["POST", "/api/admin/hogares", { correo: "a@example.com", rol: "hogar", cuenta: "x" }],
    ["POST", "/api/admin/hogares", { correo: "a@example.com", rol: "hogar", nombre_interno: "dos\nlíneas" }],
    ["PATCH", "/api/admin/hogares/1", {}], ["PATCH", "/api/admin/hogares/1", { quitar_alias: false }],
    ["PUT", "/api/admin/hogares/1/haza", {}], ["DELETE", "/api/admin/hogares/1", {}], ["DELETE", "/api/admin/hogares/abc", { correo: "a@example.com" }],
  ];
  for (const [method, url, payload] of malas) {
    const r = await app.inject({ method: method as "GET", url, headers: deLaWeb(), ...(payload ? { payload } : {}) });
    assert.equal(r.statusCode, 400, method + " " + url + " " + JSON.stringify(payload));
  }
});

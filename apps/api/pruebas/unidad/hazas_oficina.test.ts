// La sección Hazas de la oficina (OF3) sin base de datos: lo que se comprueba de una geometría antes de llegar a PostGIS, y que las
// rutas nuevas piden sesión, rechazan la forma mala y nunca tocan la base sin pasar por la guarda.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { compruebaCorte, compruebaGeometria, MAX_VERTICES } from "../../src/hazas/geometria.ts";
import { contexto, deLaWeb } from "../apoyo/contexto.ts";

const E0 = 430_000, N0 = 4_180_000;
const cuadro = (x: number, y: number, l: number) => [[E0 + x, N0 + y], [E0 + x + l, N0 + y], [E0 + x + l, N0 + y + l], [E0 + x, N0 + y + l], [E0 + x, N0 + y]];

test("geometría: anillos cerrados, UTM 30N, al menos tres vértices y un tope de vértices", () => {
  assert.equal(compruebaGeometria({ type: "Polygon", coordinates: [cuadro(0, 0, 10)] }), null);
  assert.equal(compruebaGeometria({ type: "MultiPolygon", coordinates: [[cuadro(0, 0, 10)], [cuadro(20, 0, 10), cuadro(22, 2, 2)]] }), null);
  const abierto = cuadro(0, 0, 10).slice(0, 4);
  abierto.push([E0 + 1, N0 + 1]);
  assert.equal(compruebaGeometria({ type: "Polygon", coordinates: [abierto] })?.error, "anillo_abierto");
  assert.equal(compruebaGeometria({ type: "Polygon", coordinates: [[[-3.7, 40.4], [-3.6, 40.4], [-3.6, 40.5], [-3.7, 40.4]]] })?.error, "fuera_de_utm", "grados, no metros");
  assert.equal(compruebaGeometria({ type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] })?.error, "fuera_de_utm", "coordenadas locales, no UTM");
  assert.equal(compruebaGeometria({ type: "Polygon", coordinates: [[[E0, N0], [E0 + 1, N0], [E0, N0]]] })?.error, "pocos_vertices");
  const mucho = Array.from({ length: MAX_VERTICES + 1 }, (_, i) => [E0 + Math.cos(i / 400) * 100, N0 + Math.sin(i / 400) * 100]);
  mucho.push(mucho[0]!);
  assert.equal(compruebaGeometria({ type: "Polygon", coordinates: [mucho] })?.error, "demasiados_vertices");
});

test("corte: dos puntos distintos en UTM 30N", () => {
  assert.equal(compruebaCorte([E0, N0], [E0 + 10, N0 + 10]), null);
  assert.equal(compruebaCorte([E0, N0], [E0, N0])?.error, "corte_no_valido");
  assert.equal(compruebaCorte([1, 2], [E0, N0])?.error, "fuera_de_utm");
});

// ---------------------------------------------------------------- las rutas, sin base
let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
before(async () => { app = await construyeApp(contexto(bd)); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

test("sin sesión, todas las rutas de hazas de la oficina dan 401 (y no tocan la base)", async () => {
  const cuerpoGeo = { geometria: { type: "Polygon", coordinates: [cuadro(0, 0, 10)] } };
  for (const [method, url, payload] of [
    ["GET", "/api/admin/hazas?geometria=true", undefined], ["POST", "/api/admin/hazas", { codigo: "H-1", nombre: "x", finca: "hituelo", ...cuerpoGeo }],
    ["PUT", "/api/admin/hazas/1/geom", { ...cuerpoGeo, version: 1 }], ["POST", "/api/admin/hazas/1/partir", { a: [E0, N0], b: [E0 + 5, N0 + 5], version: 1, codigo: "H-2", nombre: "y" }],
    ["POST", "/api/admin/hazas/juntar", { a: 1, b: 2, version_a: 1, version_b: 1 }], ["DELETE", "/api/admin/hazas/1?version=1", undefined],
    ["GET", "/api/admin/hazas/1/versiones", undefined], ["POST", "/api/admin/hazas/1/volver/1", { version_actual: 2 }],
  ] as const) {
    const r = await app.inject({ method, url, headers: deLaWeb(), ...(payload ? { payload } : {}) });
    assert.equal(r.statusCode, 401, method + " " + url + ": " + r.body);
  }
});

test("la forma mala es 400 antes de mirar la sesión: campos de más, tipo de geometría, código o finca con caracteres raros", async () => {
  const bien = { codigo: "H-1", nombre: "Haza", finca: "hituelo", geometria: { type: "Polygon", coordinates: [cuadro(0, 0, 10)] } };
  for (const malo of [
    { ...bien, hogar_id: 3 }, { ...bien, geometria: { type: "LineString", coordinates: [[E0, N0], [E0 + 1, N0]] } },
    { ...bien, geometria: { ...bien.geometria, crs: { type: "name" } } }, { ...bien, codigo: "H 1" }, { ...bien, finca: "Hituelo" },
    { ...bien, nombre: "dos\nlíneas" }, { ...bien, geometria: { type: "Polygon", coordinates: [[[E0, N0], [E0 + 1, N0], [E0, N0]]] } },
  ]) {
    const r = await app.inject({ method: "POST", url: "/api/admin/hazas", headers: deLaWeb(), payload: malo });
    assert.equal(r.statusCode, 400, JSON.stringify(malo).slice(0, 90));
  }
  const corte = await app.inject({ method: "POST", url: "/api/admin/hazas/1/partir", headers: deLaWeb(), payload: { a: [E0, N0, 3], b: [E0, N0], version: 1, codigo: "H-2", nombre: "y" } });
  assert.equal(corte.statusCode, 400, "un punto con tres coordenadas");
  const sinVersion = await app.inject({ method: "DELETE", url: "/api/admin/hazas/1", headers: deLaWeb() });
  assert.equal(sinVersion.statusCode, 400, "borrar pide la versión que se ve");
});

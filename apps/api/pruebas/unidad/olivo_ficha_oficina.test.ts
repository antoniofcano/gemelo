// La ficha del olivo de la oficina (OF15b) sin base de datos: la ruta pide sesión y rechaza la forma mala antes de nada, y la función que arma
// la ficha, con una base de mentira, da lo medido y lo que puso la familia (con y sin personalización, retirada, sin foto servida, sin correos).
// Lo que necesita PostGIS (ST_Intersects, el titular actual) y los roles: pruebas/integracion/olivo_ficha_oficina.test.ts (sin ejecutar aquí).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { type Consulta, fichaDelOlivo } from "../../src/admin/olivos.ts";
import { contexto, deLaWeb } from "../apoyo/contexto.ts";

let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
before(async () => { app = await construyeApp(contexto(bd)); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

/** Una base de mentira: responde por fragmento de SQL y apunta lo que le piden. */
function bdFalsa(respuestas: Array<[RegExp, unknown[]]>) {
  const pedidas: Array<{ sql: string; params: unknown[] }> = [];
  const c = {
    query: async (sql: string, params: unknown[] = []) => {
      pedidas.push({ sql, params });
      const r = respuestas.find(([re]) => re.test(sql));
      return { rows: r ? r[1] : [], rowCount: r ? r[1].length : 0 };
    },
  } as unknown as Consulta;
  return { c, pedidas };
}
const OLIVO = [/FROM olivos WHERE/, [{ id: "7", x: "430012.50", y: "4180020.25", altura_m: "4.20", tipo: -1 }]] as [RegExp, unknown[]];
const HAZA = [/FROM hazas h JOIN olivos/, [{ id: "3", codigo: "H-01", hogar_id: "12" }]] as [RegExp, unknown[]];

test("sin sesión, la ficha da 401 (y no toca la base)", async () => {
  const r = await app.inject({ method: "GET", url: "/api/admin/olivos/hituelo/1234", headers: deLaWeb() });
  assert.equal(r.statusCode, 401, r.body);
});

test("la forma mala es 400 antes de mirar la sesión: finca con mayúsculas o signos, copas_id que no es un entero", async () => {
  for (const url of ["/api/admin/olivos/Hituelo/1", "/api/admin/olivos/hi%20tuelo/1", "/api/admin/olivos/hituelo/abc", "/api/admin/olivos/hituelo/-1",
    "/api/admin/olivos/hituelo/1.5", "/api/admin/olivos/hituelo/4294967296", "/api/admin/olivos/" + "a".repeat(33) + "/1"]) {
    const r = await app.inject({ method: "GET", url, headers: deLaWeb() });
    assert.equal(r.statusCode, 400, url);
  }
});

test("un olivo que no existe: null (la ruta lo vuelve 404) y no se mira nada más", async () => {
  const { c, pedidas } = bdFalsa([]);
  assert.equal(await fichaDelOlivo(c, "hituelo", 99), null);
  assert.equal(pedidas.length, 1);
  assert.deepEqual(pedidas[0]!.params, ["hituelo", 99]);
  assert.match(pedidas[0]!.sql, /retirado_en IS NULL/, "un olivo retirado del censo no tiene ficha");
});

test("sin haza o con la haza sin titular: lo medido y nada de la familia", async () => {
  const sinHaza = bdFalsa([OLIVO]);
  const a = await fichaDelOlivo(sinHaza.c, "hituelo", 1234);
  assert.deepEqual(a, { finca: "hituelo", copas_id: 1234, posicion: { e: 430012.5, n: 4180020.25 }, altura_m: 4.2, tipo: -1, haza: null, personalizacion: null });
  const libre = bdFalsa([OLIVO, [/FROM hazas h JOIN olivos/, [{ id: "3", codigo: "H-01", hogar_id: null }]]]);
  const b = await fichaDelOlivo(libre.c, "hituelo", 1234);
  assert.deepEqual(b!.haza, { id: 3, codigo: "H-01", titular: null });
  assert.equal(b!.personalizacion, null);
  assert.ok(!libre.pedidas.some(p => /personalizaciones/.test(p.sql)), "sin titular no se pide ninguna personalización");
});

test("titular sin personalización: personalizacion null; la consulta es del titular ACTUAL de la haza", async () => {
  const { c, pedidas } = bdFalsa([OLIVO, HAZA]);
  const f = await fichaDelOlivo(c, "hituelo", 1234);
  assert.deepEqual(f!.haza, { id: 3, codigo: "H-01", titular: { hogar_id: 12 } });
  assert.equal(f!.personalizacion, null);
  const p = pedidas.find(x => /FROM personalizaciones/.test(x.sql))!;
  assert.deepEqual(p.params, ["7", "12"], "olivo e hogar titular de la haza que lo contiene");
  assert.match(p.sql, /\(estado = 'visible'\) DESC/, "la visible manda sobre una retirada");
});

test("con personalización: nombre, decoración (pieza del catálogo con su época), foto sin imagen y estado", async () => {
  const { c } = bdFalsa([OLIVO, HAZA, [/FROM personalizaciones/, [{ id: "55", estado: "visible", nombre: "La Abuela", decoracion: "farolillo", objeto_tipo: "foto", medio_id: "9" }]]]);
  const f = await fichaDelOlivo(c, "hituelo", 1234);
  assert.deepEqual(f!.personalizacion, {
    personalizacion_id: 55, estado: "visible", nombre: "La Abuela",
    decoracion: { id: "farolillo", nombre: f!.personalizacion!.decoracion!.nombre, epoca: "otono" }, objeto: { tipo: "foto", medio_id: 9 },
  });
  assert.ok(f!.personalizacion!.decoracion!.nombre, "el nombre sale del catálogo");
  const texto = JSON.stringify(f);
  assert.ok(!/url|clave|\.webp|\/api\/medios/.test(texto), "la ficha no sirve ni la dirección de la imagen: " + texto);
});

test("retirada por la oficina y pieza que ya no está en el catálogo: se cuenta tal cual, sin inventar el nombre", async () => {
  const { c } = bdFalsa([OLIVO, HAZA, [/FROM personalizaciones/, [{ id: "56", estado: "retirado", nombre: null, decoracion: "ya_no_existe", objeto_tipo: null, medio_id: null }]]]);
  const f = await fichaDelOlivo(c, "hituelo", 1234);
  assert.deepEqual(f!.personalizacion, { personalizacion_id: 56, estado: "retirado", nombre: null, decoracion: { id: "ya_no_existe", nombre: null, epoca: null }, objeto: null });
});

test("nada de datos personales del hogar: ni correo, ni alias, ni nombre, aunque la fila los trajera", async () => {
  const { c, pedidas } = bdFalsa([OLIVO, [/FROM hazas h JOIN olivos/, [{ id: "3", codigo: "H-01", hogar_id: "12", correo: "x@example.com", alias: "Ana" }]],
    [/FROM personalizaciones/, [{ id: "55", estado: "visible", nombre: "La Abuela", decoracion: null, objeto_tipo: null, medio_id: null, correo: "x@example.com" }]]]);
  const texto = JSON.stringify(await fichaDelOlivo(c, "hituelo", 1234));
  assert.ok(!/correo|@|alias|Ana/.test(texto), texto);
  assert.ok(!pedidas.some(p => /hogares|correo|alias/i.test(p.sql)), "ninguna consulta toca la tabla de hogares");
});

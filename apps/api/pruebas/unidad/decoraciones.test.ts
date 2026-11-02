// Decorar un olivo (P7g) sin base de datos: el catálogo contra su esquema, la época actual (fechas límite y hora de Madrid),
// la validación de la pieza, las operaciones con una base de mentira (se mira qué SQL piden y con qué parámetros) y las
// puertas de las rutas que se deciden antes de tocar la base. Lo que necesita PostGIS: pruebas/integracion/decoraciones.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { Ajv } from "ajv";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { catalogo, type Consulta, epocaDeLaFecha, piezasDeLaEpoca, ponDecoracion, quitaDecoracion, retiraDecoracionOficina, validaPieza } from "../../src/vida/decoraciones.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { CONTRATOS } from "../apoyo/esquemas.ts";

let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
before(async () => { app = await construyeApp(contexto(bd, configDePrueba({ GEMELO_MEDIOS: "/no/existe" }))); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

const f = (iso: string) => new Date(iso);

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

test("catálogo: cumple su esquema, seis piezas, cada época con las suyas, ilustrativas y con presupuesto pequeño", () => {
  const cat = catalogo();
  const ajv = new Ajv({ strict: true, allErrors: true });
  const valida = ajv.compile(JSON.parse(readFileSync(CONTRATOS + "decoraciones.schema.json", "utf8")));
  assert.ok(valida(cat), JSON.stringify(valida.errors));
  assert.deepEqual(cat.piezas.map(p => p.id), ["flores", "cinta", "farolillo", "cosecha", "luces", "lazo"]);
  assert.equal(new Set(cat.piezas.map(p => p.id)).size, cat.piezas.length, "ids únicos");
  assert.deepEqual(piezasDeLaEpoca("primavera").map(p => p.id), ["flores"]);
  assert.deepEqual(piezasDeLaEpoca("verano").map(p => p.id), ["cinta"]);
  assert.deepEqual(piezasDeLaEpoca("otono").map(p => p.id), ["farolillo", "cosecha"]);
  assert.deepEqual(piezasDeLaEpoca("invierno").map(p => p.id), ["luces", "lazo"]);
  for (const p of cat.piezas) { assert.equal(p.ilustrativa, true); assert.ok(p.triangulos <= 40, p.id); }
  assert.ok(!valida({ ...cat, piezas: [{ ...cat.piezas[0], triangulos: 41 }] }), "tope de triángulos");
  assert.ok(!valida({ ...cat, piezas: [{ ...cat.piezas[0], ilustrativa: false }] }), "nunca medida");
  assert.ok(!valida({ ...cat, piezas: [{ ...cat.piezas[0], epoca: "otoño" }] }), "la época es otono, sin tilde");
});

test("época: estaciones astronómicas con sus días límite, en hora de Madrid", () => {
  const e = (iso: string) => epocaDeLaFecha(f(iso));
  assert.equal(e("2026-03-20T12:00:00+01:00"), "invierno");
  assert.equal(e("2026-03-21T12:00:00+01:00"), "primavera");
  assert.equal(e("2026-06-20T12:00:00+02:00"), "primavera");
  assert.equal(e("2026-06-21T12:00:00+02:00"), "verano");
  assert.equal(e("2026-09-22T12:00:00+02:00"), "verano");
  assert.equal(e("2026-09-23T12:00:00+02:00"), "otono");
  assert.equal(e("2026-12-20T12:00:00+01:00"), "otono");
  assert.equal(e("2026-12-21T12:00:00+01:00"), "invierno");
  assert.equal(e("2027-01-15T12:00:00+01:00"), "invierno");
  assert.equal(e("2026-11-02T10:00:00+01:00"), "otono", "el día de este encargo");
  // la hora de Madrid, no la UTC: 23:30 UTC del 20-mar ya es 21-mar en Madrid; 22:30 UTC del 20-jun ya es 21-jun (verano, +2)
  assert.equal(e("2026-03-20T23:30:00Z"), "primavera");
  assert.equal(e("2026-06-20T22:30:00Z"), "verano");
  assert.equal(e("2026-12-20T23:30:00Z"), "invierno");
  // bisiesto: 29 de febrero
  assert.equal(e("2028-02-29T12:00:00+01:00"), "invierno");
});

test("validaPieza: no existe → 400; de otra época → 422 con lo que toca ahora; de la época → ok", () => {
  const otono = f("2026-11-02T10:00:00+01:00");
  const ok = validaPieza("cosecha", otono);
  assert.ok(ok.ok && ok.pieza.id === "cosecha");
  const no = validaPieza("dragon", otono);
  assert.ok(!no.ok); assert.equal(no.respuesta.codigo, 400); assert.equal((no.respuesta.cuerpo as { error: string }).error, "pieza_no_existe");
  const fuera = validaPieza("flores", otono);
  assert.ok(!fuera.ok); assert.equal(fuera.respuesta.codigo, 422);
  const cuerpo = fuera.respuesta.cuerpo as { error: string; mensaje: string };
  assert.equal(cuerpo.error, "fuera_de_epoca");
  assert.match(cuerpo.mensaje, /farolillo y cosecha/);
  // la misma pieza vale otra época del año
  assert.ok(validaPieza("flores", f("2027-04-10T10:00:00+02:00")).ok);
  assert.ok(!validaPieza("cosecha", f("2027-04-10T10:00:00+02:00")).ok);
});

const A = { finca: "hituelo", copasId: 900001, hogarId: 7, sesionId: 3, pieza: "luces" };

test("ponDecoracion: olivo inexistente 404; olivo de otra haza 403; nueva inserta; con fila previa actualiza (sustituye); deja auditoría y nada en la bandeja", async () => {
  const sin = bdFalsa([]);
  const r404 = await ponDecoracion(sin.c, A);
  assert.equal(r404.codigo, 404); assert.equal((r404.cuerpo as { error: string }).error, "olivo_no_existe");

  const ajeno = bdFalsa([[/FROM olivos WHERE finca/, [{ id: 11 }]]]);
  const r403 = await ponDecoracion(ajeno.c, A);
  assert.equal(r403.codigo, 403); assert.equal((r403.cuerpo as { error: string }).error, "no_es_tu_haza");
  assert.ok(!ajeno.pedidas.some(p => /INSERT|UPDATE/.test(p.sql)), "no escribe nada");

  const nueva = bdFalsa([[/FROM olivos WHERE finca/, [{ id: 11 }]], [/FROM hazas h JOIN olivos/, [{ id: 5 }]], [/INSERT INTO personalizaciones/, [{ id: 21 }]]]);
  const rn = await ponDecoracion(nueva.c, A);
  assert.deepEqual(rn, { codigo: 200, cuerpo: { id: 21, pieza: "luces" } });
  const ins = nueva.pedidas.find(p => /INSERT INTO personalizaciones/.test(p.sql))!;
  assert.deepEqual(ins.params, [11, 5, 7, 3, "luces"]);
  assert.ok(!nueva.pedidas.some(p => /bandeja/.test(p.sql)), "sin texto ni imagen: no va a la bandeja");
  const aud = nueva.pedidas.find(p => /INSERT INTO auditoria/.test(p.sql))!;
  assert.equal(aud.params[1], "vida.decoracion");

  const previa = bdFalsa([[/FROM olivos WHERE finca/, [{ id: 11 }]], [/FROM hazas h JOIN olivos/, [{ id: 5 }]], [/FROM personalizaciones WHERE olivo_id/, [{ id: 21 }]]]);
  const rp = await ponDecoracion(previa.c, { ...A, pieza: "lazo" });
  assert.deepEqual(rp, { codigo: 200, cuerpo: { id: 21, pieza: "lazo" } });
  const up = previa.pedidas.find(p => /UPDATE personalizaciones SET decoracion/.test(p.sql))!;
  assert.deepEqual(up.params.slice(0, 2), [21, "lazo"]);
  assert.ok(!previa.pedidas.some(p => /INSERT INTO personalizaciones/.test(p.sql)), "una sola por olivo y hogar: sustituye, no añade");
  assert.ok(!/nombre|medio_id|objeto_tipo/.test(up.sql), "no toca el nombre ni la foto");
});

test("quitaDecoracion: 404 si no había; 204 y auditoría si había; solo mira lo del propio hogar", async () => {
  const nada = bdFalsa([]);
  assert.equal((await quitaDecoracion(nada.c, { finca: "hituelo", copasId: 1, hogarId: 7 })).codigo, 404);
  assert.ok(!nada.pedidas.some(p => /auditoria/.test(p.sql)));
  const hay = bdFalsa([[/UPDATE personalizaciones/, [{ id: 21 }]]]);
  assert.deepEqual(await quitaDecoracion(hay.c, { finca: "hituelo", copasId: 1, hogarId: 7 }), { codigo: 204 });
  const u = hay.pedidas[0]!;
  assert.match(u.sql, /p\.hogar_id = \$2/); assert.match(u.sql, /p\.decoracion IS NOT NULL/); assert.match(u.sql, /nombre IS NULL AND medio_id IS NULL/);
  assert.deepEqual(u.params, ["hituelo", 7, "quitada por el hogar", 1]);
  assert.equal(hay.pedidas[1]!.params[1], "vida.decoracion_quitada");
});

test("retiraDecoracionOficina: motivo obligatorio; 404 sin decoración visible; retira, avisa al hogar y deja auditoría", async () => {
  const vacio = bdFalsa([]);
  assert.equal((await retiraDecoracionOficina(vacio.c, { personalizacion: 4, oficinaId: 1, motivo: "   " })).codigo, 400);
  assert.equal(vacio.pedidas.length, 0, "sin motivo no toca la base");
  assert.equal((await retiraDecoracionOficina(vacio.c, { personalizacion: 4, oficinaId: 1, motivo: "no toca" })).codigo, 404);
  const ok = bdFalsa([[/UPDATE personalizaciones/, [{ id: 4, hogar_id: 7, haza_id: 5 }]], [/INSERT INTO avisos \(/, [{ id: 90 }]]]);
  assert.deepEqual(await retiraDecoracionOficina(ok.c, { personalizacion: 4, oficinaId: 1, motivo: "  fuera  de sitio " }), { codigo: 204 });
  const u = ok.pedidas[0]!;
  assert.deepEqual(u.params, [4, 1, "fuera de sitio"]);
  assert.match(u.sql, /decoracion IS NOT NULL/);
  assert.deepEqual(ok.pedidas.find(p => /INSERT INTO avisos_hogar/.test(p.sql))!.params, [90, 7]);
  assert.equal(ok.pedidas.find(p => /INSERT INTO auditoria/.test(p.sql))!.params[1], "admin.decoracion_retirada");
});

test("rutas: sin sesión 401, sin Origin 403, forma mala 400, todo antes de tocar la base", async () => {
  for (const [method, url, payload] of [
    ["PUT", "/api/olivos/hituelo/1/decoracion", { pieza: "luces" }],
    ["DELETE", "/api/olivos/hituelo/1/decoracion", undefined],
    ["POST", "/api/admin/personalizaciones/1/decoracion/retirar", { motivo: "x" }],
  ] as const) {
    const r = await app.inject({ method, url, headers: deLaWeb(), ...(payload ? { payload } : {}) });
    assert.equal(r.statusCode, 401, method + " " + url);
  }
  const sinOrigen = await app.inject({ method: "PUT", url: "/api/olivos/hituelo/1/decoracion", headers: { "x-forwarded-proto": "https" }, payload: { pieza: "luces" } });
  assert.equal(sinOrigen.statusCode, 403);
  const put = (url: string, payload: object) => app.inject({ method: "PUT", url, headers: deLaWeb(), payload });
  // la forma se valida antes que la sesión (como en las demás rutas de la vida): 400 aun sin sesión
  assert.equal((await put("/api/olivos/HITUELO/1/decoracion", { pieza: "luces" })).statusCode, 400, "finca con mayúsculas");
  assert.equal((await put("/api/olivos/hituelo/4294967296/decoracion", { pieza: "luces" })).statusCode, 400, "copas_id fuera de rango");
  assert.equal((await put("/api/olivos/hituelo/1/decoracion", {})).statusCode, 400, "sin pieza");
  assert.equal((await put("/api/olivos/hituelo/1/decoracion", { pieza: "Luces" })).statusCode, 400, "no es un slug");
  assert.equal((await put("/api/olivos/hituelo/1/decoracion", { pieza: "luces", texto: "hola" })).statusCode, 400, "no hay texto libre");
});

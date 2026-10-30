// Sistema de la oficina (OF5) sin base de datos: el lector del hornero (solo lectura, lista blanca, sin rutas del servidor), la instantánea de la
// caché de Vigía (de cuándo es lo último que llegó, sin llamar a Vigía) y que las rutas nuevas no se abren sin sesión ni sin Origin.
// Lo que necesita la base (la salud completa, la auditoría paginada, el correo de prueba) está en pruebas/integracion/sistema.test.ts.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { leeHornero, limpiaMensaje } from "../../src/admin/hornero.ts";
import { LectorVigiaFixture } from "../../src/vigia/lector-fixture.ts";
import { ServicioTiempo } from "../../src/vigia/servicio.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const FIXTURE = fileURLToPath(new URL("../vigia/", import.meta.url));
const AHORA = Date.parse("2026-10-30T10:00:00Z");
const carpeta = mkdtempSync(join(tmpdir(), "sistema-"));
after(() => rmSync(carpeta, { recursive: true, force: true }));

const escribe = (ruta: string, o: unknown) => { mkdirSync(join(ruta, ".."), { recursive: true }); writeFileSync(ruta, JSON.stringify(o)); };
function hornero(nombre: string, latido: string, estado: Record<string, unknown> | null, manifiesto: Record<string, unknown> | null) {
  const e = join(carpeta, nombre, "estado"), s = join(carpeta, nombre, "salida");
  escribe(join(e, "servicio.json"), { v: 1, pid: 77, latido_en: latido, comprueba_s: 600, fincas: { hituelo: { durmiendo_hasta: "2026-11-01T03:00:00Z", ultimo_motivo: "primera vuelta", ultima_vuelta_en: latido, fallo: null } } });
  if (estado) escribe(join(e, "hituelo.json"), estado);
  if (manifiesto) escribe(join(s, "hituelo", "olivos", "manifiesto.json"), manifiesto);
  return { estado: e, salida: s };
}
const MAN = { horneado_en: "2026-10-30T03:00:00Z", actual: "envero", epocas: [{ epoca: "envero" }, { epoca: "madura" }], variantes: [{ bytes_br: 1000 }, { bytes_br: 2500 }, { bytes_br: 500 }] };
const LISTO = { fase: "listo", error: null, epoca_actual: "envero", actualizado_en: "2026-10-30T03:00:09Z", pid: 77 };

test("hornero sin conectar: apagado, sin leer nada", () => {
  const h = leeHornero({ estado: null, salida: null }, AHORA);
  assert.equal(h.conectado, false); assert.equal(h.salud, "apagado"); assert.deepEqual(h.fincas, []);
});

test("hornero sano: época actual y siguiente, objetos y tamaño del manifiesto, y no sale el pid", () => {
  const h = leeHornero(hornero("sano", "2026-10-30T09:58:00Z", LISTO, MAN), AHORA);
  assert.equal(h.salud, "ok");
  assert.deepEqual(h.fincas[0], { finca: "hituelo", fase: "listo", error: null, epoca_actual: "envero", epoca_siguiente: "madura", horneado_en: "2026-10-30T03:00:00.000Z",
    actualizado_en: "2026-10-30T03:00:09.000Z", durmiendo_hasta: "2026-11-01T03:00:00.000Z", ultimo_motivo: "primera vuelta", objetos: 3, bytes: 4000 });
  assert.ok(!JSON.stringify(h).includes("77"), "el pid no se enseña");
});

test("hornero: sin latido reciente es «mal»; con una vuelta en curso el latido viejo se perdona; un error es «aviso»", () => {
  assert.equal(leeHornero(hornero("viejo", "2026-10-30T06:00:00Z", LISTO, MAN), AHORA).salud, "mal");
  assert.equal(leeHornero(hornero("encurso", "2026-10-30T06:00:00Z", { ...LISTO, fase: "horneando" }, MAN), AHORA).salud, "ok");
  const e = leeHornero(hornero("error", "2026-10-30T09:58:00Z", { ...LISTO, fase: "error", error: "no se pudo escribir /salida/hituelo/olivos/x.br" }, MAN), AHORA);
  assert.equal(e.salud, "aviso"); assert.ok(!/salida|\//.test(e.fincas[0]!.error!), "el error sale sin rutas del servidor: " + e.fincas[0]!.error);
  assert.equal(leeHornero({ estado: join(carpeta, "no-existe"), salida: null }, AHORA).salud, "mal");
});

test("limpiaMensaje quita rutas de Linux y de Windows y recorta", () => {
  assert.equal(limpiaMensaje("fallo en /datos/hituelo/indice.json: ENOENT"), "fallo en …: ENOENT");
  assert.equal(limpiaMensaje("no abre C:\\Users\\x\\a.json ahora"), "no abre … ahora");
  assert.equal(limpiaMensaje(""), null); assert.equal(limpiaMensaje(7), null);
  assert.ok(limpiaMensaje("x".repeat(900))!.length <= 200);
});

test("la instantánea de Vigía dice de cuándo es cada lectura sin llamar a Vigía", async () => {
  let t = AHORA;
  const lector = new LectorVigiaFixture(FIXTURE, () => t), s = new ServicioTiempo(lector, { reloj: () => t });
  assert.deepEqual(s.instantanea().herramientas.map(h => h.leidoEn), [null, null]);
  await s.lee();
  const llamadas = lector.llamadas.length;
  t += 5 * 60_000;
  const i = s.instantanea();
  assert.equal(lector.llamadas.length, llamadas, "mirar no llama");
  assert.equal(i.origen, "fixture");
  assert.deepEqual(i.herramientas.map(h => [h.herramienta, h.leidoEn, h.fallo]), [["tiempo_en_la_explotacion", new Date(AHORA).toISOString(), false], ["prevision_72_horas", new Date(AHORA).toISOString(), false]]);
  lector.sustituye.set("tiempo_en_la_explotacion", new Error("caído"));
  t += 20 * 60_000; await s.lee();
  assert.equal(s.instantanea().herramientas[0]!.fallo, true);
});

let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
before(async () => { app = await construyeApp(contexto(bd, configDePrueba())); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

test("las rutas de Sistema piden sesión (401) y los POST, el Origin del sitio (403)", async () => {
  for (const url of ["/api/admin/sistema", "/api/admin/auditoria", "/api/admin/auditoria?accion=admin.sincronia"]) assert.equal((await app.inject({ method: "GET", url, headers: deLaWeb() })).statusCode, 401, url);
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/correo/prueba", headers: deLaWeb(), payload: {} })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/correo/prueba", headers: { "x-forwarded-proto": "https" }, payload: {} })).statusCode, 403);
});

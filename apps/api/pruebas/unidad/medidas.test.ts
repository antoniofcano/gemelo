// Medidas de fluidez (PB9) sin base de datos: el esquema estricto (= contratos/medidas.schema.json), lo que no cuadra, el agregado y su juicio contra el
// objetivo, lo que se decide antes de tocar la base (origen, forma, sesión) y que NADA personal llega a la tabla ni al código que la escribe.
// Lo que necesita la base (guardar, límite por hogar y día, agregado, permisos) está en pruebas/integracion/medidas.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { CUERPO_MEDIDA, fechaValida, formaFilas, motivoNoCreible, OBJETIVO_P95_MS, type CuerpoMedida } from "../../src/medidas/rutas.ts";
import { contexto, deLaWeb } from "../apoyo/contexto.ts";

let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
before(async () => { app = await construyeApp(contexto(bd)); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

let ipN = 0;
const otraIp = (): Record<string, string> => deLaWeb({ "x-forwarded-for": "198.51.100." + (++ipN % 250) });   // el límite por IP (10 por minuto) no es lo que se prueba aquí
const lee = (rel: string): string => readFileSync(new URL("../../../../" + rel, import.meta.url), "utf8");
const AHORA = Date.parse("2026-10-31T12:00:00Z");
const medida = (extra: Partial<CuerpoMedida> = {}): CuerpoMedida => ({
  aparato: "quest", navegador: "Quest Browser", nav_mayor: 38, perfil: 2, finca: "hituelo", modo: "nube", vr: true,
  mediana_ms: 13.9, p95_ms: 14.2, peor_ms: 30.5, fotogramas: 4300, duracion_s: 60, version: "0.2.0", medida_en: "2026-10-31T11:58:00Z", ...extra,
});

test("el esquema de la api es el del contrato (contratos/medidas.schema.json): mismos campos, tipos y límites; ninguno de más", () => {
  const c = JSON.parse(lee("contratos/medidas.schema.json"));
  assert.equal(c.additionalProperties, false);
  assert.deepEqual(c.required, [...CUERPO_MEDIDA.required]);
  const quita = (o: Record<string, Record<string, unknown>>) => Object.fromEntries(Object.entries(o).map(([k, v]) => { const { description: _d, ...resto } = v; return [k, resto]; }));
  assert.deepEqual(quita(c.properties), quita(CUERPO_MEDIDA.properties as unknown as Record<string, Record<string, unknown>>));
  assert.deepEqual(Object.keys(c.properties).sort(), [...CUERPO_MEDIDA.required].sort(), "todo campo es obligatorio: no hay opcionales por los que colar nada");
});

test("nada personal: ni hogar, ni IP, ni agente de usuario entero, ni posición en el esquema, en la tabla ni en lo que se escribe", () => {
  const prohibido = /hogar|correo|email|\bip\b|user.?agent|agente|posici|lat\b|lon\b|cookie|sesion/i;
  for (const k of Object.keys(CUERPO_MEDIDA.properties)) assert.ok(!prohibido.test(k), "campo " + k);
  const sql = lee("apps/api/migraciones/0017_medidas_fluidez.sql").split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.ok(!prohibido.test(sql.replace(/gemelo_api/g, "")), "la tabla no guarda nada de personas");
  assert.match(sql, /GRANT SELECT, INSERT ON medidas_fluidez/, "la api solo añade y lee");
  const fuente = lee("apps/api/src/medidas/rutas.ts");
  const insert = /INSERT INTO medidas_fluidez[\s\S]*?\]\);/.exec(fuente)![0];
  assert.ok(!/req\.(session|ip|headers|cookies|raw|id)|hogarId/.test(insert), "el INSERT usa solo el cuerpo ya validado: " + insert);
  assert.ok(!/audita\(/.test(fuente.replace(/^\/\/.*$/gm, "")), "no se audita el envío (la auditoría guarda el hogar y enlazaría la medida con una familia)");
});

test("lo que el esquema no dice: mediana ≤ p95 ≤ peor y fecha de ahora (no futura, no de hace más de 7 días)", () => {
  assert.equal(motivoNoCreible(medida(), AHORA), null);
  assert.equal(motivoNoCreible(medida({ p95_ms: 5 }), AHORA), "orden", "p95 por debajo de la mediana");
  assert.equal(motivoNoCreible(medida({ peor_ms: 14 }), AHORA), "orden", "peor por debajo del p95");
  assert.equal(motivoNoCreible(medida({ mediana_ms: 14.2, p95_ms: 14.2, peor_ms: 14.2 }), AHORA), null, "todo igual vale");
  assert.equal(motivoNoCreible(medida({ medida_en: "2026-10-31T12:30:00Z" }), AHORA), "fecha", "del futuro");
  assert.equal(motivoNoCreible(medida({ medida_en: "2026-10-31T12:04:00Z" }), AHORA), null, "unos minutos de desfase de reloj se admiten");
  assert.equal(motivoNoCreible(medida({ medida_en: "2026-10-23T12:00:00Z" }), AHORA), "fecha", "de hace más de 7 días");
  assert.equal(motivoNoCreible(medida({ medida_en: "2026-10-25T12:00:00Z" }), AHORA), null);
  assert.equal(fechaValida("2026-10-31"), true);
  assert.equal(fechaValida("2026-02-30"), false);
  assert.equal(fechaValida("2026-13-01"), false);
});

test("el agregado: redondea a 0,1 ms y juzga el p95 mediano contra el objetivo (Quest 13,9 ms); sin objetivo escrito no se juzga", () => {
  assert.deepEqual(OBJETIVO_P95_MS, { escritorio: null, movil: null, quest: 13.9 });
  const fila = (aparato: "quest" | "movil" | "escritorio", p95: number) => ({ dia: new Date("2026-10-31T00:00:00Z"), aparato, vr: aparato === "quest", n: "3", p95_mediano: p95, p95_peor: p95 + 4.04, mediana_mediana: 9.66, peor: 41.25, fotogramas: "12900", navegadores: ["Quest Browser 38"], versiones: ["0.2.0"] });
  const [q1, q2, q3, m, e] = formaFilas([fila("quest", 13.9), fila("quest", 13.94), fila("quest", 18.04), fila("movil", 40), fila("escritorio", 8)]);
  assert.equal(q1!.cumple, true, "13,9 ≤ 13,9");
  assert.equal(q2!.p95_mediano_ms, 13.9); assert.equal(q2!.cumple, true, "se juzga lo redondeado que se enseña");
  assert.equal(q3!.cumple, false); assert.equal(q3!.objetivo_p95_ms, 13.9);
  assert.deepEqual([m!.objetivo_p95_ms, m!.cumple, e!.objetivo_p95_ms, e!.cumple], [null, null, null, null]);
  assert.deepEqual(q1, { dia: "2026-10-31", aparato: "quest", vr: true, medidas: 3, p95_mediano_ms: 13.9, p95_peor_ms: 17.9, mediana_ms: 9.7, peor_ms: 41.3, fotogramas: 12900, navegadores: ["Quest Browser 38"], versiones: ["0.2.0"], objetivo_p95_ms: 13.9, cumple: true });
  assert.ok(!/hogar|"id"|@/.test(JSON.stringify(q1)));
});

test("POST /api/medidas: sin Origin del sitio, 403; forma mala (campos de más, tipos, rangos), 400; sin sesión, 401; todo antes de tocar la base", async () => {
  const url = "/api/medidas";
  assert.equal((await app.inject({ method: "POST", url, headers: { "x-forwarded-proto": "https" }, payload: medida() })).statusCode, 403);
  const malas: Record<string, unknown>[] = [
    { ...medida(), hogar: 3 }, { ...medida(), ip: "203.0.113.7" }, { ...medida(), ua: "Mozilla/5.0 (Windows NT 10.0)" },
    { ...medida(), aparato: "tele" }, { ...medida(), navegador: "Mozilla/5.0 (X11)" }, { ...medida(), nav_mayor: -1 }, { ...medida(), finca: "../etc" },
    { ...medida(), p95_ms: "rapido" }, { ...medida(), fotogramas: 3 }, { ...medida(), duracion_s: 601 }, { ...medida(), vr: "si" }, { ...medida(), medida_en: "ayer" }, { ...medida(), version: "v 0.2" },
  ];
  for (const campo of Object.keys(medida())) { const m: Record<string, unknown> = { ...medida() }; delete m[campo]; malas.push(m); }
  for (const payload of malas) assert.equal((await app.inject({ method: "POST", url, headers: otraIp(), payload })).statusCode, 400, JSON.stringify(payload));
  assert.equal((await app.inject({ method: "POST", url, headers: otraIp(), payload: medida() })).statusCode, 401);
});

test("GET /api/admin/medidas: sin sesión 401; filtros mal formados 400; antes de tocar la base", async () => {
  const url = "/api/admin/medidas";
  assert.equal((await app.inject({ method: "GET", url, headers: deLaWeb() })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: url + "?aparato=quest&desde=2026-10-01", headers: deLaWeb() })).statusCode, 401);
  for (const q of ["?aparato=tele", "?desde=ayer", "?hasta=2026-1-1", "?limite=0", "?limite=501", "?otro=1"]) assert.equal((await app.inject({ method: "GET", url: url + q, headers: otraIp() })).statusCode, 400, q);
});

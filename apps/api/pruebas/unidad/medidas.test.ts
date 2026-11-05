// Medidas de fluidez (PB9) sin base de datos: el esquema estricto (= contratos/medidas.schema.json), lo que no cuadra, el agregado y su juicio contra el
// objetivo, lo que se decide antes de tocar la base (origen, forma, sesión) y que NADA personal llega a la tabla ni al código que la escribe.
// Lo que necesita la base (guardar, límite por hogar y día, agregado, permisos) está en pruebas/integracion/medidas.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { CUERPO_MEDIDA, fechaValida, formaFilas, motivoNoCreible, OBJETIVO_P95_MS, uneBloqueCaro, type CuerpoMedida } from "../../src/medidas/rutas.ts";
import { contexto, deLaWeb } from "../apoyo/contexto.ts";

let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
before(async () => { app = await construyeApp(contexto(bd)); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

let ipN = 0;
const otraIp = (): Record<string, string> => deLaWeb({ "x-forwarded-for": "198.51.100." + (++ipN % 250) });   // el límite por IP (10 por minuto) no es lo que se prueba aquí
const V3 = ["render_mediana_ms", "render_p95_ms", "lentos_n", "lentos_cola", "lentos_tesela", "lentos_lote", "lentos_tarea", "lentos_compila", "lentos_textura", "lentos_sin_causa", "lentos_cola_ms", "reparto", "otros_p95_ms"];
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
  const NUEVOS = ["js_mediana_ms", "js_p95_ms", "nivel_ini", "nivel_fin", "perillas", "olivos_gen", "llamadas_med", "triangulos_med", "personas", ...V3];
  assert.deepEqual(Object.keys(c.properties).sort(), [...CUERPO_MEDIDA.required, ...NUEVOS].sort(), "los obligatorios de la v1 más los nueve opcionales de la v2 (Q0e) y los trece de la v3 (Q0i), ninguno más");
  for (const k of NUEVOS) assert.ok(!c.required.includes(k), k + " es opcional: un cliente de la v1 sigue valiendo");
});

test("v2 (Q0e): el ejemplo de la v1 y el de la v2 son válidos y compatibles; la v2 acepta los campos nuevos, la api no inventa ninguno", () => {
  const v1 = JSON.parse(lee("contratos/medidas-v1-ejemplo.json")), v2 = JSON.parse(lee("contratos/medidas-v2-ejemplo.json"));
  const ajv = new Ajv({ allErrors: true, strict: false }), valida = ajv.compile(CUERPO_MEDIDA as unknown as object);
  assert.equal(valida(v1), true, "el cuerpo de la v1 sigue valiendo: " + JSON.stringify(valida.errors));
  assert.equal(valida(v2), true, JSON.stringify(valida.errors));
  assert.equal(Object.keys(v2).filter(k => !(k in v1)).length, 9);
  const contrato = ajv.compile(JSON.parse(lee("contratos/medidas.schema.json")));
  assert.equal(contrato(v1) && contrato(v2), true, "y el esquema del contrato (el mismo) también");
  assert.equal(Object.keys(v2).filter(k => V3.includes(k)).length, 0, "el cuerpo de la v2 (clientes viejos) no trae nada de la v3 y sigue valiendo");
});

test("v2 (Q0e): rangos y forma de los campos nuevos; campos extra y perillas con HTML, rutas o más de 80 caracteres, rechazados", () => {
  const valida = new Ajv({ allErrors: true, strict: false }).compile(CUERPO_MEDIDA as unknown as object);
  const ok = (extra: Record<string, unknown>) => valida({ ...medida(), ...extra });
  assert.equal(ok({ js_mediana_ms: 6.8, js_p95_ms: 11.2, nivel_ini: 3, nivel_fin: 3, perillas: "fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto", olivos_gen: true, llamadas_med: 212, triangulos_med: 410000, personas: 0 }), true);
  assert.equal(ok({ perillas: "fov 3 · escala 1 · Hz sin cambiar · MSAA no · nivel 2 fijo · ignorado: fov=9 (fuera de rango)" }), false, "más de 80 caracteres");
  assert.equal(ok({ perillas: "x".repeat(80) }), true); assert.equal(ok({ perillas: "x".repeat(81) }), false); assert.equal(ok({ perillas: "" }), false);
  for (const p of ["<script>alert(1)</script>", "D:\\carpeta\\x", "/etc/passwd", "http://x.example", "a@b.example", "hola\nmundo", "\u202e"]) assert.equal(ok({ perillas: p }), false, p);
  for (const [k, v] of [["js_mediana_ms", -1], ["js_mediana_ms", 10001], ["js_p95_ms", "rapido"], ["nivel_ini", 10], ["nivel_fin", -2], ["nivel_fin", 1.5], ["olivos_gen", "si"], ["llamadas_med", -1], ["llamadas_med", 100001],
    ["triangulos_med", 1e9], ["personas", 501], ["personas", -1], ["personas", 2.5]] as const) assert.equal(ok({ [k]: v }), false, k + "=" + String(v));
  for (const campo of ["hogar", "ip", "posicion", "lat", "ua", "identidad", "nombres"]) assert.equal(ok({ [campo]: "x" }), false, "campo extra " + campo);
});

test("v2 (Q0e): js_mediana_ms ≤ js_p95_ms, o no es creíble; sin JS (cliente de la v1) no se mira", () => {
  assert.equal(motivoNoCreible(medida({ js_mediana_ms: 7, js_p95_ms: 11 }), AHORA), null);
  assert.equal(motivoNoCreible(medida({ js_mediana_ms: 12, js_p95_ms: 11 }), AHORA), "orden");
  assert.equal(motivoNoCreible(medida({ js_mediana_ms: 12 }), AHORA), null, "uno solo no se compara");
  assert.equal(motivoNoCreible(medida(), AHORA), null);
});

test("v2 (Q0e): nada personal en los campos nuevos ni en la migración 0022 (solo ADD COLUMN nulas, nada destructivo)", () => {
  const sql = lee("apps/api/migraciones/0022_medidas_fluidez_porque.sql").split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.ok(!/DROP|DELETE|UPDATE|TRUNCATE|NOT NULL|ALTER COLUMN|RENAME/i.test(sql), "solo se añaden columnas nulas");
  assert.equal((sql.match(/ADD COLUMN/g) ?? []).length, 9);
  assert.ok(!/hogar|correo|email|\bip\b|user.?agent|posici|\blat\b|\blon\b|cookie|identidad|nombre/i.test(sql), "ni personas ni posición");
  const insert = /INSERT INTO medidas_fluidez[\s\S]*?\]\);/.exec(lee("apps/api/src/medidas/rutas.ts"))![0];
  for (const c of ["js_mediana_ms", "js_p95_ms", "nivel_ini", "nivel_fin", "perillas", "olivos_gen", "llamadas_med", "triangulos_med", "personas"]) assert.ok(insert.includes(c) && sql.includes(c), c);
  assert.ok(!/req\.(session|ip|headers|cookies|raw|id)|hogarId/.test(insert));
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
  const fila = (aparato: "quest" | "movil" | "escritorio", p95: number) => ({ dia: new Date("2026-10-31T00:00:00Z"), aparato, vr: aparato === "quest", n: "3", p95_mediano: p95, p95_peor: p95 + 4.04, mediana_mediana: 9.66, peor: 41.25, fotogramas: "12900", navegadores: ["Quest Browser 38"], versiones: ["0.2.0"], js_mediana: null, js_p95: null, nivel_ini: null, nivel_fin: null, perillas: null, olivos_si: 0, olivos_de: 0, llamadas: null, triangulos: null, personas: null, render_mediana: null, render_p95: null, bloque_caro: null, bloque_caro_p95: null });
  const [q1, q2, q3, m, e] = formaFilas([fila("quest", 13.9), fila("quest", 13.94), fila("quest", 18.04), fila("movil", 40), fila("escritorio", 8)]);
  assert.equal(q1!.cumple, true, "13,9 ≤ 13,9");
  assert.equal(q2!.p95_mediano_ms, 13.9); assert.equal(q2!.cumple, true, "se juzga lo redondeado que se enseña");
  assert.equal(q3!.cumple, false); assert.equal(q3!.objetivo_p95_ms, 13.9);
  assert.deepEqual([m!.objetivo_p95_ms, m!.cumple, e!.objetivo_p95_ms, e!.cumple], [null, null, null, null]);
  assert.deepEqual(q1, { dia: "2026-10-31", aparato: "quest", vr: true, medidas: 3, p95_mediano_ms: 13.9, p95_peor_ms: 17.9, mediana_ms: 9.7, peor_ms: 41.3, fotogramas: 12900, navegadores: ["Quest Browser 38"], versiones: ["0.2.0"], objetivo_p95_ms: 13.9, cumple: true,
    js_mediana_ms: null, js_p95_ms: null, nivel_ini: null, nivel_fin: null, perillas: null, olivos_gen_si: 0, olivos_gen_de: 0, llamadas_med: null, triangulos_med: null, personas: null,
    render_mediana_ms: null, render_p95_ms: null, bloque_caro: null, bloque_caro_p95_ms: null });
  // Q0e: la mediana de lo nuevo, redondeada (las cifras llegan de Postgres como texto o número)
  const [n] = formaFilas([{ ...fila("quest", 20.7), js_mediana: "6.84", js_p95: 11.25, nivel_ini: "3", nivel_fin: 2.4, perillas: "fov 1 · nivel auto", olivos_si: "2", olivos_de: "3", llamadas: "212.5", triangulos: 410000.4, personas: "0" }]);
  assert.deepEqual([n!.js_mediana_ms, n!.js_p95_ms, n!.nivel_ini, n!.nivel_fin, n!.perillas, n!.olivos_gen_si, n!.olivos_gen_de, n!.llamadas_med, n!.triangulos_med, n!.personas], [6.8, 11.3, 3, 2, "fov 1 · nivel auto", 2, 3, 213, 410000, 0]);
  assert.ok(!/hogar|"id"|@/.test(JSON.stringify(q1)));
});

// ---------- Q0i: contrato v3 (render(), autopsia de los fotogramas lentos y reparto del JS por bloque) ----------
const bloques = (n: number) => Array.from({ length: n }, (_, i) => ({ bloque: "bloque " + i, mediana_ms: 0.5, p95_ms: 1.5 }));
const completa = (extra: Record<string, unknown> = {}) => ({ ...medida(), render_mediana_ms: 2.1, render_p95_ms: 3.4, lentos_n: 42, lentos_cola: 18, lentos_tesela: 9, lentos_lote: 3, lentos_tarea: 2, lentos_compila: 0, lentos_textura: 1,
  lentos_sin_causa: 17, lentos_cola_ms: 2.3, reparto: [{ bloque: "olivo (estación)", mediana_ms: 2.4, p95_ms: 3.8 }, { bloque: "c:fauna", mediana_ms: 1.1, p95_ms: 1.9 }], otros_p95_ms: 1.2, ...extra });

test("v3 (Q0i): el ejemplo del contrato es válido (api y esquema del contrato) y trae los trece campos nuevos; el cuerpo de los clientes de la v2 sigue valiendo", () => {
  const ajv = new Ajv({ allErrors: true, strict: false }), valida = ajv.compile(CUERPO_MEDIDA as unknown as object), contrato = ajv.compile(JSON.parse(lee("contratos/medidas.schema.json")));
  const v3 = JSON.parse(lee("contratos/medidas-ejemplo.json")), v2 = JSON.parse(lee("contratos/medidas-v2-ejemplo.json"));
  for (const [n, v] of [["v3", v3], ["v2", v2]] as const) { assert.equal(valida(v), true, n + " api: " + JSON.stringify(valida.errors)); assert.equal(contrato(v), true, n + " contrato: " + JSON.stringify(contrato.errors)); }
  for (const k of V3) assert.ok(k in v3, k + " en el ejemplo v3");
  for (const k of V3) assert.ok(!(k in v2), k + " no está en el ejemplo v2");
  assert.equal(motivoNoCreible({ ...v3, medida_en: new Date().toISOString() }), null);
  assert.ok(!/hogar|correo|@|C:\\|\/Users/i.test(JSON.stringify(v3)), "nada personal en el ejemplo");
});

test("v3 (Q0i): el reparto se acota a 16 bloques; con 17, 400; nombres con HTML, rutas o más de 40 caracteres, rechazados; sin campos de más", () => {
  const valida = new Ajv({ allErrors: true, strict: false }).compile(CUERPO_MEDIDA as unknown as object);
  const ok = (extra: Record<string, unknown>) => valida({ ...medida(), ...extra });
  assert.equal(ok({ reparto: bloques(16) }), true); assert.equal(ok({ reparto: bloques(17) }), false, "17 bloques"); assert.equal(ok({ reparto: [] }), true);
  assert.equal(ok({ reparto: [{ bloque: "x".repeat(40), mediana_ms: 1, p95_ms: 2 }] }), true); assert.equal(ok({ reparto: [{ bloque: "x".repeat(41), mediana_ms: 1, p95_ms: 2 }] }), false);
  for (const b of ["", "<script>", "D:\\x", "/etc/passwd", "http://x.example", "a@b.example", "hola\nmundo"]) assert.equal(ok({ reparto: [{ bloque: b, mediana_ms: 1, p95_ms: 2 }] }), false, JSON.stringify(b));
  for (const b of ["olivo (estación)", "c:fauna", "Cola", "minimapa", "ia.vuelo-2"]) assert.equal(ok({ reparto: [{ bloque: b, mediana_ms: 1, p95_ms: 2 }] }), true, b);
  assert.equal(ok({ reparto: [{ bloque: "a", mediana_ms: 1 }] }), false, "falta p95_ms"); assert.equal(ok({ reparto: [{ bloque: "a", mediana_ms: 1, p95_ms: 2, hogar: 3 }] }), false, "campo de más en el bloque");
  assert.equal(ok({ reparto: [{ bloque: "a", mediana_ms: -1, p95_ms: 2 }] }), false); assert.equal(ok({ reparto: [{ bloque: "a", mediana_ms: 1, p95_ms: 10001 }] }), false); assert.equal(ok({ reparto: "no" }), false);
  assert.equal(ok(completa()), true);
  for (const [k, v] of [["render_p95_ms", -1], ["render_mediana_ms", 10001], ["lentos_n", -1], ["lentos_cola", 1.5], ["lentos_sin_causa", 1000001], ["lentos_cola_ms", 10001], ["otros_p95_ms", "x"]] as const) assert.equal(ok({ [k]: v }), false, k);
});

test("v3 (Q0i): render_mediana_ms ≤ render_p95_ms y mediana ≤ p95 en cada bloque, o no es creíble", () => {
  assert.equal(motivoNoCreible(medida({ render_mediana_ms: 2, render_p95_ms: 3 }), AHORA), null);
  assert.equal(motivoNoCreible(medida({ render_mediana_ms: 4, render_p95_ms: 3 }), AHORA), "orden");
  assert.equal(motivoNoCreible(medida({ render_mediana_ms: 4 }), AHORA), null, "uno solo no se compara");
  assert.equal(motivoNoCreible(medida({ reparto: [{ bloque: "a", mediana_ms: 1, p95_ms: 2 }] }), AHORA), null);
  assert.equal(motivoNoCreible(medida({ reparto: [{ bloque: "a", mediana_ms: 1, p95_ms: 2 }, { bloque: "b", mediana_ms: 3, p95_ms: 2 }] }), AHORA), "orden");
});

test("v3 (Q0i): la migración 0023 solo añade columnas nulas (reparto jsonb acotado a 16), el INSERT las guarda y nada es personal", () => {
  const sql = lee("apps/api/migraciones/0023_medidas_fluidez_autopsia.sql").split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.ok(!/DROP|DELETE|UPDATE|TRUNCATE|NOT NULL|ALTER COLUMN|RENAME/i.test(sql), "solo se añaden columnas nulas");
  assert.equal((sql.match(/ADD COLUMN/g) ?? []).length, V3.length);
  assert.match(sql, /reparto\s+jsonb CHECK \(reparto IS NULL OR CASE WHEN jsonb_typeof\(reparto\) = 'array' THEN jsonb_array_length\(reparto\) <= 16/);
  assert.ok(!/hogar|correo|email|\bip\b|user.?agent|posici|\blat\b|\blon\b|cookie|identidad|nombre/i.test(sql), "ni personas ni posición");
  const insert = /INSERT INTO medidas_fluidez[\s\S]*?\]\);/.exec(lee("apps/api/src/medidas/rutas.ts"))![0];
  for (const c of V3) assert.ok(insert.includes(c) && sql.includes(c), c);
  assert.ok(/\$35::jsonb/.test(insert) && /JSON\.stringify\(m\.reparto\)/.test(insert), "el reparto va como jsonb ya validado");
  assert.ok(!/req\.(session|ip|headers|cookies|raw|id)|hogarId/.test(insert));
});

test("v3 (Q0i): la oficina enseña render() p95 y el bloque más caro: el agregado los redondea y la unión pone el bloque de cada día, aparato y VR", () => {
  const dia = new Date("2026-11-05T00:00:00Z");
  const fila = (aparato: "quest" | "movil", vr: boolean) => ({ dia, aparato, vr, n: "2", p95_mediano: 15, p95_peor: 18, mediana_mediana: 10, peor: 40, fotogramas: "8000", navegadores: ["Quest Browser 154"], versiones: ["0.2.0"], js_mediana: null, js_p95: null, nivel_ini: null, nivel_fin: null, perillas: null,
    olivos_si: 0, olivos_de: 0, llamadas: null, triangulos: null, personas: null, render_mediana: "2.14", render_p95: 3.46 });
  const unidas = uneBloqueCaro([fila("quest", true), fila("movil", false)], [{ dia: "2026-11-05", aparato: "quest", vr: true, bloque: "olivo (estación)", p95: "3.84" }]);
  const [q, m] = formaFilas(unidas);
  assert.deepEqual([q!.render_mediana_ms, q!.render_p95_ms, q!.bloque_caro, q!.bloque_caro_p95_ms], [2.1, 3.5, "olivo (estación)", 3.8]);
  assert.deepEqual([m!.render_p95_ms, m!.bloque_caro, m!.bloque_caro_p95_ms], [3.5, null, null], "sin reparto ese día, no hay bloque");
  const fuente = lee("apps/api/src/medidas/rutas.ts");
  assert.ok(/jsonb_array_elements\(reparto\)/.test(fuente) && /DISTINCT ON \(dia, aparato, vr\)/.test(fuente), "el bloque más caro sale de la tabla");
  assert.ok(!/hogar|"id"|@/.test(JSON.stringify(q)));
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

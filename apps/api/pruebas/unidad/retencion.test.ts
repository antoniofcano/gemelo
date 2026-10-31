// Decisión 100 (plazo de sugerencias, avisos, inscripciones y lotes por hogar: la campaña y un año más), SIN base: el corte que se pasa a la sentencia, que la
// auditoría cuenta filas sin contenido, que no escribe nada si no se borró nada y que el reloj de purgas la llama. El borrado de verdad (qué filas caen y cuáles
// no) está en pruebas/integracion/retencion_campana.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import fc from "fast-check";
import type { Bd } from "../../src/bd/pool.ts";
import { corteAuditoriaVoz } from "../../src/presencia/consentimiento_voz.ts";
import { purgaCampana, SQL_PURGA_CAMPANA } from "../../src/vida/retencion.ts";

function falsa(devuelve: Record<string, number>) {
  const llamadas: { sql: string; p: unknown[] }[] = [];
  const bd = { async query(sql: string, p: unknown[] = []) { llamadas.push({ sql, p }); return { rows: sql.startsWith("INSERT") ? [] : [devuelve] }; } } as unknown as Bd;
  return { bd, llamadas };
}

test("el corte es el de la campaña y un año más, y el año de los lotes es el del corte (con propiedades)", async () => {
  await fc.assert(fc.asyncProperty(fc.date({ min: new Date("2020-01-01"), max: new Date("2060-12-31"), noInvalidDate: true }), async ahora => {
    const { bd, llamadas } = falsa({ sugerencias: 0, avisos: 0, inscripciones: 0, lotes: 0 });
    await purgaCampana(bd, ahora);
    const [corte, tope, anio] = llamadas[0]!.p as [Date, Date, number];
    assert.equal(corte.toISOString(), corteAuditoriaVoz(ahora).toISOString());
    assert.equal(anio, corte.getUTCFullYear());
    assert.equal(tope, ahora);
    // nunca se toca lo de hace menos de un año: el corte queda al menos 12 meses antes de «ahora»
    assert.ok(ahora.getTime() - corte.getTime() > 365 * 86_400_000, "el corte siempre deja más de un año de margen");
    assert.equal(corte.getUTCMonth(), 9); assert.equal(corte.getUTCDate(), 1);
  }), { seed: 100, numRuns: 200 });
});

test("ejemplos: 5 oct 2028 cae la campaña 2026/27 y no la 2027/28; 30 sep 2028 aún no cae la 2026/27", async () => {
  const { bd, llamadas } = falsa({ sugerencias: 0, avisos: 0, inscripciones: 0, lotes: 0 });
  await purgaCampana(bd, new Date("2028-10-05T12:00:00Z"));
  assert.equal((llamadas[0]!.p[0] as Date).toISOString(), "2027-10-01T00:00:00.000Z");
  assert.equal(llamadas[0]!.p[2], 2027, "lotes con campana que empieza antes de 2027: la 2026/27 cae, la 2027/28 no");
  await purgaCampana(bd, new Date("2028-09-30T12:00:00Z"));
  assert.equal((llamadas[1]!.p[0] as Date).toISOString(), "2026-10-01T00:00:00.000Z");
});

test("audita cuántas filas se borraron, sin contenido ni hogares; si no se borró nada, no escribe", async () => {
  const vacio = falsa({ sugerencias: 0, avisos: 0, inscripciones: 0, lotes: 0 });
  assert.deepEqual(await purgaCampana(vacio.bd, new Date("2028-10-05")), { sugerencias: 0, avisos: 0, inscripciones: 0, lotes: 0 });
  assert.equal(vacio.llamadas.length, 1, "solo la purga, ninguna auditoría");
  const algo = falsa({ sugerencias: 2, avisos: 30, inscripciones: 4, lotes: 1 });
  assert.deepEqual(await purgaCampana(algo.bd, new Date("2028-10-05")), { sugerencias: 2, avisos: 30, inscripciones: 4, lotes: 1 });
  const a = algo.llamadas[1]!;
  assert.match(a.sql, /INSERT INTO auditoria/);
  assert.equal(a.p[0], null, "sin hogar");
  assert.equal(a.p[1], "retencion.campana");
  assert.deepEqual(JSON.parse(a.p[2] as string), { sugerencias: 2, avisos: 30, inscripciones: 4, lotes: 1, corte: "2027-10-01" });
});

test("la sentencia solo toca lo que dice la decisión 100: cuatro tablas, sugerencias ya decididas y avisos caducados", () => {
  const borra = [...SQL_PURGA_CAMPANA.matchAll(/DELETE FROM (\w+)/g)].map(m => m[1]).sort();
  assert.deepEqual(borra, ["avisos_hogar", "bandeja", "lote_hogar", "visitas_asistentes"]);
  assert.match(SQL_PURGA_CAMPANA, /tipo = 'sugerencia' AND estado IN \('pasada_ot', 'descartada'\)/);
  assert.match(SQL_PURGA_CAMPANA, /caduca_en IS NULL OR av\.caduca_en < \$2/);
});

test("el reloj de 6 horas de principal.ts la llama junto a las demás purgas", () => {
  const p = readFileSync(new URL("../../src/principal.ts", import.meta.url), "utf8");
  assert.match(p, /purgaCampana\(bd\)/);
});

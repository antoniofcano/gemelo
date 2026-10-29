// Lista blanca de lo que llega de OlivarTrack (mapeo) y lista blanca de la ficha, sin base de datos.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { construyeFicha, type FilaHaza } from "../../src/hazas/ficha.ts";
import { LectorGrabado } from "../../src/ot/lector-grabado.ts";
import { mapea, RespuestaNoValida } from "../../src/ot/mapeo.ts";
import { GRABACIONES } from "../apoyo/contexto.ts";
import { validadorFicha } from "../apoyo/esquemas.ts";

const grabada = (n: string) => JSON.parse(readFileSync(GRABACIONES + n + ".json", "utf8")) as unknown;
/** Lo que nunca debe llegar a eventos_haza ni a la ficha (personas, texto de campo, kilos, GPS). */
const PROHIBIDO = /PERSONA|TEXTO LIBRE|Ignora|kg|gps|aplicador|asunto|observaciones|-3\.1|registradoPor|nota/i;

test("pases_del_periodo: solo componentes agronómicos; fuera aplicador, GPS, observaciones y cantidades", () => {
  const l = mapea("pases_del_periodo", grabada("pases_del_periodo"));
  assert.equal(l.estado, "ok");
  assert.equal(l.recibidos, 4);
  assert.equal(l.descartados, 1, "el pase sin fecha se descarta");
  assert.deepEqual(l.eventos.map(e => e.clave), ["pase:p-sint-1:sint:1", "pase:p-sint-1:sint:2", "pase:p-sint-2:sint:3", "pase:p-sint-4:sint:99"]);
  const e = l.eventos[0]!;
  assert.deepEqual(e.datos["componentes"], [{ tipo: "fitosanitario", producto: "Oxicloruro de cobre 50%", n_registro: "ES-00001", dosis: 2.5, unidad: "kg/ha" }],
    "el componente con «<script>» en el nombre se tira; la cantidad aplicada no viaja");
  assert.equal(l.eventos[2]!.datos["componentes"] instanceof Array && (l.eventos[2]!.datos["componentes"] as { unidad: string; tipo: string }[])[0]!.unidad, "l/ha");
  assert.ok(!PROHIBIDO.test(JSON.stringify(l.eventos.map(x => x.datos)).replace(/kg\/ha/g, "")), "se ha colado algo prohibido");
});

test("novedades: fenología y analíticas; el texto de una incidencia (que intenta dar órdenes) y las entregas NO se proyectan", () => {
  const paginas = grabada("novedades") as unknown[];
  const l = mapea("novedades", paginas[0]);
  assert.equal(l.hayMas, true);
  assert.equal(l.siguienteDesde, "2026-09-01T00:00:00Z");
  assert.deepEqual(l.eventos.map(e => e.tipo), ["fenologia", "analitica"]);
  assert.equal(l.descartados, 1, "el BBCH 150 no es válido");
  assert.deepEqual(l.eventos[1]!.datos["resultados"], { pH: 7.9, MO_pct: 1.2 }, "solo números con clave limpia");
  assert.ok(!PROHIBIDO.test(JSON.stringify(l.eventos)));
});

test("aforo: solo el porcentaje; sin aforo no hay dato (no es un 0 %); ningún kilo", () => {
  const l = mapea("aforo_y_avance_de_recoleccion", grabada("aforo_y_avance_de_recoleccion"));
  assert.deepEqual(l.eventos.map(e => [e.parcela_ot, e.datos]), [["sint:1", { pct: 40 }], ["sint:3", { pct: 80 }]]);
  assert.ok(!/kg|99999|1234|rdto/i.test(JSON.stringify(l.eventos)));
});

test("truncado y parcial se respetan; una respuesta sin la forma esperada es un error, no datos vacíos", () => {
  assert.equal(mapea("pases_del_periodo", { truncado: true, pases: [] }).estado, "truncado");
  assert.equal(mapea("novedades", { parcial: true, novedades: [] }).estado, "parcial");
  assert.throws(() => mapea("pases_del_periodo", { texto: "Aquí tienes los pases…" }), RespuestaNoValida);
  assert.throws(() => mapea("novedades", "no soy JSON"), RespuestaNoValida);
});

test("el lector grabado sirve las páginas de novedades en orden y rechaza herramientas fuera de la lista", async () => {
  const l = new LectorGrabado(GRABACIONES);
  const a = await l.llama("novedades", { desde: "x" }) as { hayMas: boolean };
  const b = await l.llama("novedades", { desde: "y" }) as { hayMas: boolean };
  assert.equal(a.hayMas, true);
  assert.equal(b.hayMas, false);
  await assert.rejects(l.llama("registrar_entrega" as never, {}), /lista de lectura/);
});

const HAZA: FilaHaza = {
  id: 7, codigo: "H-S02", nombre: "Haza del Pozo", finca: "hituelo", es_mia: false, alias: null,
  superficie_ha: 1.5, olivos_lidar: 20, olivos_declarados: 21, olivos_declarados_fuente: "Declaración sintética",
  ndvi_relativo: -0.07, ndvi_fecha: "2026-10-01", ndvi_fuente: "Sentinel-2 (Copernicus), sintético",
};

test("ficha: cumple el contrato, quita duplicados por parcela, pondera el avance y marca lo incompleto", () => {
  const valida = validadorFicha();
  const ev = [
    ...mapea("pases_del_periodo", grabada("pases_del_periodo")).eventos,
    ...mapea("aforo_y_avance_de_recoleccion", grabada("aforo_y_avance_de_recoleccion")).eventos,
  ].filter(e => e.parcela_ot === "sint:2" || e.parcela_ot === "sint:3" || e.parcela_ot === "sint:1")
    .map(e => ({ tipo: e.tipo, fecha: e.fecha, parcela_ot: e.parcela_ot, datos: e.datos }));
  const parcelas = [{ parcela_ot: "sint:2", ha_compartidas: 1 }, { parcela_ot: "sint:3", ha_compartidas: 0.5 }];
  const f = construyeFicha(HAZA, ev, parcelas, [{ herramienta: "pases_del_periodo", estado: "truncado", consultado_en: new Date("2026-10-28T09:00:00Z") }]);
  assert.ok(valida(f), JSON.stringify(valida.errors));
  assert.equal(f.tratamientos.length, 2, "el pase p-sint-1 llega por dos parcelas y sale una vez");
  assert.deepEqual(f.avance, { pct: 80, parcelas_con_dato: 1, parcelas: 2, fecha: "2026-10-28" });
  assert.equal(f.completo, false);
  assert.deepEqual(f.avisos, ["ot_sin_sincronia", "ot_truncado"]);
  assert.equal(f.olivos.lidar.naturaleza, "medido");
  assert.equal(f.olivos.declarado.n, 21);
});

test("ficha: un campo que no está en el contrato no sale (lista blanca), y el contrato rechaza titular o kilos", () => {
  const valida = validadorFicha();
  const raro = { ...HAZA, hogar_id: 3, correo: "ana@example.com", kg: 5000 } as FilaHaza;
  const f = construyeFicha(raro, [], [], []) as Record<string, unknown>;
  for (const k of ["hogar_id", "correo", "kg", "titular"]) assert.ok(!(k in f), k + " no debe salir");
  assert.ok(valida(f));
  assert.ok(!valida({ ...f, titular: "x" }), "el contrato rechaza campos de más");
  assert.ok(!valida({ ...f, avance: { ...(f["avance"] as object), kg: 1 } }), "ni kilos en el avance");
});

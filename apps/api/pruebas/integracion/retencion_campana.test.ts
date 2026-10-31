// Integración de la decisión 100 (plazo de sugerencias, avisos, inscripciones y lotes por hogar: la campaña y un año más) contra PostGIS en un contenedor.
// Escrita, SIN EJECUTAR en la sesión que la escribió (hay una puerta pesada corriendo: pasa por el banco). Datos SINTÉTICOS. Sin Docker se SALTA con aviso.
//   · Con «ahora» = 5 oct 2028 el corte es el 1 oct 2027: cae lo de la campaña 2026/27 y antes; lo de la 2027/28 y lo vigente se queda.
//   · Las sugerencias sin decidir (nueva, vista), el contenido nuevo y las denuncias de la bandeja no caen; los avisos aún sin caducar, tampoco.
//   · El lote y su trazabilidad por haza se quedan; solo cae la asignación a hogares de campañas viejas.
//   · gemelo_api puede hacerlo con sus permisos de fila (sin función SECURITY DEFINER) y queda UNA fila de auditoría con los recuentos y sin hogar.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { purgaCampana } from "../../src/vida/retencion.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la purga por campaña (decisión 100) con PostGIS NO se ha comprobado";
let bd: BdDePrueba;
const h: Record<string, number> = {};
const AHORA = new Date("2028-10-05T12:00:00Z");

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const c of ["ana-r100@example.com", "beta-r100@example.com"])
    h[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, 'hogar') RETURNING id", [c])).rows[0]!.id);
});
after(async () => { if (!SALTO) await bd.cierra(); });

const n = async (sql: string) => Number((await bd.dueno.query<{ n: string }>("SELECT count(*) AS n FROM " + sql)).rows[0]!.n);

test("cae lo anterior al corte y solo lo que dice la decisión; lo vigente y lo sin atender se quedan; queda una auditoría sin contenido", async t => {
  if (SALTO) { t.skip(SALTO); return; }
  const ana = h["ana-r100@example.com"]!, beta = h["beta-r100@example.com"]!;
  // sugerencias (bandeja): vieja decidida (cae), vieja sin decidir (se queda), vieja de otro tipo (se queda), reciente decidida (se queda)
  await bd.dueno.query(`INSERT INTO bandeja (tipo, estado, hogar_id, texto, creada_en, decidida_en) VALUES
    ('sugerencia', 'descartada', $1, 'vieja decidida', '2027-03-01', '2027-03-02'),
    ('sugerencia', 'nueva', $1, 'vieja sin mirar', '2027-03-01', NULL),
    ('contenido_nuevo', 'descartada', $1, NULL, '2027-03-01', '2027-03-02'),
    ('sugerencia', 'descartada', $1, 'reciente decidida', '2027-11-01', '2027-11-02')`, [ana]);
  // avisos: viejo (cae su entrega), viejo pero aún sin caducar (se queda), reciente (se queda)
  await bd.dueno.query(`INSERT INTO avisos (tipo, titulo, creado_en, caduca_en) VALUES
    ('sistema', 'viejo', '2027-03-01', '2027-04-01'), ('sistema', 'viejo vigente', '2027-03-01', '2099-01-01'), ('sistema', 'reciente', '2027-11-01', NULL)`);
  await bd.dueno.query("INSERT INTO avisos_hogar (aviso_id, hogar_id) SELECT id, $1 FROM avisos UNION ALL SELECT id, $2 FROM avisos", [ana, beta]);
  // inscripciones: evento de la campaña 2026/27 (cae) y de la 2027/28 (se queda)
  await bd.dueno.query(`INSERT INTO visitas (titulo, tipo, empieza_en, estado) VALUES ('viejo', 'libre', '2027-05-01', 'cerrada'), ('reciente', 'libre', '2027-12-01', 'cerrada')`);
  await bd.dueno.query("INSERT INTO visitas_asistentes (visita_id, hogar_id) SELECT id, $1 FROM visitas", [ana]);
  // lotes: 2026/27 (cae la asignación a hogares), 2027/28 (se queda); los lotes y su trazabilidad no se tocan
  await bd.dueno.query(`INSERT INTO lotes (codigo, campana) VALUES ('L-2627', '2026/27'), ('L-2728', '2027/28')`);
  await bd.dueno.query("INSERT INTO lote_hogar (lote_id, hogar_id) SELECT id, $1 FROM lotes", [ana]);

  const p = await purgaCampana(bd.app, AHORA);       // con el rol gemelo_api: sin función SECURITY DEFINER
  assert.deepEqual(p, { sugerencias: 1, avisos: 2, inscripciones: 1, lotes: 1 }, "avisos: la entrega del viejo a Ana y a Beta");
  assert.equal(await n("bandeja"), 3); assert.equal(await n("bandeja WHERE texto = 'vieja sin mirar'"), 1);
  assert.equal(await n("avisos_hogar"), 4); assert.equal(await n("avisos"), 3, "el aviso en sí no es de un hogar");
  assert.equal(await n("visitas_asistentes"), 1); assert.equal(await n("visitas"), 2);
  assert.equal(await n("lote_hogar"), 1); assert.equal(await n("lotes"), 2);
  assert.equal(await n("hogares"), 2, "ninguna familia pierde su cuenta");

  const a = (await bd.dueno.query<{ hogar_id: number | null; detalle: Record<string, unknown> }>("SELECT hogar_id, detalle FROM auditoria WHERE accion = 'retencion.campana'")).rows;
  assert.equal(a.length, 1); assert.equal(a[0]!.hogar_id, null);
  assert.deepEqual(a[0]!.detalle, { sugerencias: 1, avisos: 2, inscripciones: 1, lotes: 1, corte: "2027-10-01" });

  // repetirla no borra nada más ni audita otra vez; un año después cae la campaña 2027/28
  assert.deepEqual(await purgaCampana(bd.app, AHORA), { sugerencias: 0, avisos: 0, inscripciones: 0, lotes: 0 });
  assert.equal(await n("auditoria WHERE accion = 'retencion.campana'"), 1);
  assert.deepEqual(await purgaCampana(bd.app, new Date("2029-10-05T12:00:00Z")), { sugerencias: 1, avisos: 2, inscripciones: 1, lotes: 1 });
});

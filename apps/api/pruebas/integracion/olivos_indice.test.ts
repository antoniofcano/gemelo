// OF3e: la carga de los olivos medidos desde el indice.json de una finca (tuberia/hazas/carga_hazas.py --olivos-indice) contra
// PostGIS en un contenedor. Datos SINTÉTICOS (índice mínimo inventado dentro de las hazas de tuberia/hazas/ejemplo). Comprueba:
// finca y copas_id puestos, recarga idempotente (ni duplica ni cambia ids), el recuento por haza de la oficina (ST_Intersects)
// y que la búsqueda por (finca, copas_id) de la personalización (vida/rutas.ts) los encuentra. Sin Docker se SALTA con aviso.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { type BdDePrueba, hayDocker, levantaBd, sqlDeEjemplo } from "../apoyo/bd.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la carga de olivos desde el índice con PostGIS NO se ha comprobado";
let bd: BdDePrueba;

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  await bd.dueno.query(sqlDeEjemplo());
  await bd.dueno.query("DELETE FROM olivos");
}, { timeout: 240_000 });
after(async () => { if (!SALTO) await bd.cierra(); });

function sqlDelIndice(indice: object): string {
  const raiz = fileURLToPath(new URL("../../../../", import.meta.url));
  const d = mkdtempSync(join(tmpdir(), "gemelo-olivos-"));
  writeFileSync(join(d, "indice.json"), JSON.stringify(indice));
  execFileSync(process.env["PYTHON"] ?? "python", ["tuberia/hazas/carga_hazas.py", "--olivos-indice", join(d, "indice.json"), "--salida", join(d, "o.sql")], { cwd: raiz, stdio: "pipe" });
  return readFileSync(join(d, "o.sql"), "utf8");
}

test("olivos desde el índice: finca y copas_id, idempotente, recuento por haza y búsqueda por id", { skip: SALTO ?? false }, async () => {
  const hz = (await bd.dueno.query<{ codigo: string; cx: number; cy: number }>(
    "SELECT codigo, ST_X(ST_Centroid(geom))::float8 AS cx, ST_Y(ST_Centroid(geom))::float8 AS cy FROM hazas ORDER BY codigo")).rows;
  assert.ok(hz.length >= 2);
  const centro = [Math.round(hz[0]!.cx), Math.round(hz[0]!.cy)];
  // dos copas en el centro de la primera haza (+1 m y +2 m), una en el centro de la segunda (relativas a `centro_utm`)
  const rel = (h: { cx: number; cy: number }, dx: number) => [h.cx - centro[0]! + dx, h.cy - centro[1]!, 5, [1, 1, 1, 1, 1, 1, 1, 1], 0];
  const indice = {
    finca_id: "sint", centro_utm: centro,
    copas: [rel(hz[0]!, 1), rel(hz[0]!, 2), rel(hz[1]!, 0)], copas_id: [11, 12, 2147483700], copas_tipo: [-1, -1, -1],
  };
  const sql = sqlDelIndice(indice);
  await bd.dueno.query(sql);
  await bd.dueno.query(sql); // recargar no duplica
  const filas = (await bd.dueno.query<{ id_estable: string; finca: string; copas_id: string }>("SELECT id_estable, finca, copas_id FROM olivos ORDER BY copas_id")).rows;
  assert.deepEqual(filas.map(f => [f.id_estable, f.finca, Number(f.copas_id)]), [["sint:11", "sint", 11], ["sint:12", "sint", 12], ["sint:2147483700", "sint", 2147483700]]);
  const antes = (await bd.dueno.query<{ id: string }>("SELECT id FROM olivos ORDER BY copas_id")).rows.map(r => r.id);
  await bd.dueno.query(sql);
  assert.deepEqual((await bd.dueno.query<{ id: string }>("SELECT id FROM olivos ORDER BY copas_id")).rows.map(r => r.id), antes, "recargar no cambia los ids de fila");
  // la haza de cada olivo es geométrica (la regla de la oficina y de «es tu haza»)
  const cuenta = (await bd.dueno.query<{ codigo: string; n: number }>(
    "SELECT h.codigo, count(*)::int AS n FROM hazas h JOIN olivos o ON o.fuente = 'lidar' AND ST_Intersects(o.geom, h.geom) GROUP BY h.codigo")).rows;
  assert.equal(cuenta.find(c => c.codigo === hz[0]!.codigo)?.n, 2);
  // la búsqueda de PUT /api/olivos/:finca/:copas_id (vida/rutas.ts)
  assert.equal((await bd.dueno.query("SELECT id FROM olivos WHERE finca = $1 AND copas_id = $2 AND retirado_en IS NULL", ["sint", 12])).rowCount, 1);
});

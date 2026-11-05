// Integración de la migración 0026 (OT-V) contra PostGIS en un contenedor: el CHECK de haza_parcela.parcela_ot acepta los ids con tildes,
// paréntesis y «/» que trae OlivarTrack (sintéticos, con la misma forma) y sigue rechazando espacios, control y signos; y casa con el
// patrón de la api (PATRON_ID_PARCELA) en los mismos ejemplos. Se prueba en una tabla temporal con LOS MISMOS CHECK (LIKE … INCLUDING
// CONSTRAINTS), sin sembrar hazas. Sin Docker se SALTA con aviso: la migración NO se ha ejecutado contra una base real.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { migra } from "../../src/bd/migra.ts";
import { idParcela } from "../../src/vivo/lista-blanca.ts";
import { hayDocker, imagenBd } from "../apoyo/bd.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la migración 0026 (parcela_ot con tildes) con PostGIS NO se ha comprobado";
let contenedor: StartedPostgreSqlContainer, bd: pg.Pool;

before(async () => {
  if (SALTO) return;
  contenedor = await new PostgreSqlContainer(imagenBd()).withDatabase("gemelo").withStartupTimeout(120_000).start();
  const base = { host: contenedor.getHost(), port: contenedor.getPort(), database: contenedor.getDatabase(), user: contenedor.getUsername(), password: contenedor.getPassword() };
  bd = new pg.Pool({ ...base, max: 1 });
  await bd.query("CREATE ROLE gemelo_api LOGIN PASSWORD 'prueba-" + Math.random().toString(36).slice(2) + "'");
  const hechas = await migra(base);
  assert.ok(hechas.some(n => /^0026_parcela_ot_con_tildes/.test(n)), "se aplica la 0026");
}, { timeout: 240_000 });

after(async () => { if (!SALTO) { await bd.end(); await contenedor.stop(); } });

const BUENOS = ["sint:1", "polígono-9-parcela-7", "loma-(polígono-9-parcela-8)", "huerta/pozo", "cañada.alta_2", "a".repeat(120)];
const MALOS = ["", "con espacio", "tab\tdentro", "nulo\u0000", "comilla'", "<b>", "a".repeat(121), "punto;coma"];

test("0026: el CHECK acepta tildes, paréntesis y «/», rechaza espacios, control y signos, y coincide con la api", async t => {
  if (SALTO) { t.skip(SALTO); return; }
  const c = await bd.connect();
  try {
    await c.query("CREATE TEMP TABLE hp (LIKE haza_parcela INCLUDING CONSTRAINTS)");
    const entra = async (id: string) => {
      try { await c.query("SAVEPOINT s"); await c.query("INSERT INTO hp (haza_id, parcela_ot) VALUES (1, $1)", [id]); await c.query("RELEASE SAVEPOINT s"); return true; }
      catch { await c.query("ROLLBACK TO SAVEPOINT s"); return false; }
    };
    await c.query("BEGIN");
    for (const id of BUENOS) { assert.equal(await entra(id), true, "la base debe aceptar " + JSON.stringify(id)); assert.equal(idParcela(id), id, "y la api también"); }
    for (const id of MALOS) {
      if (id.includes("\u0000")) { assert.equal(idParcela(id), null); continue; }   // Postgres no admite el NUL en un text: ni llega
      assert.equal(await entra(id), false, "la base debe rechazar " + JSON.stringify(id)); assert.equal(idParcela(id), null, "y la api también");
    }
    await c.query("ROLLBACK");
  } finally { c.release(); }
});

// Integración de la migración 0021 (OF13b-2, ADR-0029) contra PostGIS en un contenedor: se aplican las migraciones HASTA la 0020,
// se siembra una llave en el esquema anterior (la de producción, la de Antonio, es una fila así), se migra y se comprueba:
// la llave sigue ahí con sus datos, `descubrible` es falso, la vista de compatibilidad `llaves_oficina` lee y escribe,
// `sesiones.origen = 'llave'` se acepta (y uno inventado no), `llaves_retos` admite un reto sin sesión atado a una clave,
// y la api (gemelo_api) conserva sus permisos. Sin Docker se SALTA con aviso: la migración NO se ha ejecutado contra una base real.
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { CARPETA_MIGRACIONES, migra } from "../../src/bd/migra.ts";
import { hayDocker, imagenBd } from "../apoyo/bd.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la migración 0021 (llaves_acceso) con PostGIS NO se ha comprobado";
let contenedor: StartedPostgreSqlContainer, dueno: pg.Pool, app: pg.Pool;
const CRED = "AbCdEfGhIjKlMnOpQrStUv_-0123456789";   // base64url de 16 o más
const CLAVE = Buffer.alloc(77, 7);
let hogar = 0;

before(async () => {
  if (SALTO) return;
  contenedor = await new PostgreSqlContainer(imagenBd()).withDatabase("gemelo").withStartupTimeout(120_000).start();
  const base = { host: contenedor.getHost(), port: contenedor.getPort(), database: contenedor.getDatabase(), user: contenedor.getUsername(), password: contenedor.getPassword() };
  dueno = new pg.Pool({ ...base, max: 2 });
  const claveApp = "prueba-" + Math.random().toString(36).slice(2);
  await dueno.query("CREATE ROLE gemelo_api LOGIN PASSWORD '" + claveApp + "'");
  // 1. el esquema anterior: solo las migraciones hasta la 0020, en una carpeta temporal (los ficheros no se tocan)
  const hasta20 = mkdtempSync(join(tmpdir(), "gemelo-mig20-"));
  mkdirSync(hasta20, { recursive: true });
  for (const f of readdirSync(CARPETA_MIGRACIONES).filter(x => x.endsWith(".sql") && Number(x.slice(0, 4)) <= 20)) copyFileSync(join(CARPETA_MIGRACIONES, f), join(hasta20, f));
  const hechas20 = await migra(base, hasta20);
  assert.ok(hechas20.length > 0 && hechas20.every(n => Number(n.slice(0, 4)) <= 20), "solo hasta la 0020");
  // 2. la llave «de producción» en el esquema anterior (y una sesión y un reto que la rodean)
  hogar = Number((await dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ('antonio-mig@example.com', 'admin') RETURNING id")).rows[0]!.id);
  await dueno.query("INSERT INTO llaves_oficina (hogar_id, credencial_id, clave_publica, contador, transports, nombre, respaldada) VALUES ($1, $2, $3, 5, '{internal,hybrid}', 'Portátil', true)", [hogar, CRED, CLAVE]);
  // 3. la migración nueva (y las que hubiera detrás)
  const nuevas = await migra(base);
  assert.ok(nuevas.some(n => /^0021_llaves_acceso/.test(n)), "se aplica la 0021");
  app = new pg.Pool({ ...base, user: "gemelo_api", password: claveApp, max: 2 });
}, { timeout: 240_000 });

after(async () => { if (!SALTO) { await app.end(); await dueno.end(); await contenedor.stop(); } });
const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };

test("la llave existente sigue ahí, intacta, y descubrible es falso", async t => {
  if (salta(t)) return;
  const f = (await dueno.query("SELECT hogar_id, credencial_id, clave_publica, contador, transports, nombre, respaldada, descubrible, revocada_en FROM llaves_acceso")).rows;
  assert.strictEqual(f.length, 1);
  assert.strictEqual(Number(f[0].hogar_id), hogar); assert.strictEqual(f[0].credencial_id, CRED);
  assert.ok(Buffer.compare(f[0].clave_publica, CLAVE) === 0); assert.strictEqual(Number(f[0].contador), 5);
  assert.deepStrictEqual(f[0].transports, ["internal", "hybrid"]); assert.strictEqual(f[0].nombre, "Portátil");
  assert.strictEqual(f[0].respaldada, true); assert.strictEqual(f[0].descubrible, false); assert.strictEqual(f[0].revocada_en, null);
});

test("la tabla vieja ya no es una tabla, sino una vista que lee y escribe sobre llaves_acceso", async t => {
  if (salta(t)) return;
  const tipo = (await dueno.query<{ table_type: string }>("SELECT table_type FROM information_schema.tables WHERE table_name = 'llaves_oficina'")).rows[0]!.table_type;
  assert.strictEqual(tipo, "VIEW");
  assert.strictEqual((await app.query("SELECT credencial_id FROM llaves_oficina")).rows[0].credencial_id, CRED);
  // la imagen anterior de la api insertaba y actualizaba con este nombre
  const nueva = "ZyXwVuTsRqPoNmLkJiHgFe_-9876543210";
  await app.query("INSERT INTO llaves_oficina (hogar_id, credencial_id, clave_publica, nombre) VALUES ($1, $2, $3, 'Móvil')", [hogar, nueva, CLAVE]);
  await app.query("UPDATE llaves_oficina SET contador = 9, ultima_vez_en = now() WHERE credencial_id = $1", [nueva]);
  const f = (await dueno.query("SELECT contador, descubrible FROM llaves_acceso WHERE credencial_id = $1", [nueva])).rows[0];
  assert.strictEqual(Number(f.contador), 9); assert.strictEqual(f.descubrible, false);
  await app.query("DELETE FROM llaves_oficina WHERE credencial_id = $1", [nueva]);
  assert.strictEqual((await dueno.query("SELECT 1 FROM llaves_acceso")).rowCount, 1);
});

test("las restricciones renombradas siguen en vigor (credencial única y con alfabeto)", async t => {
  if (salta(t)) return;
  await assert.rejects(app.query("INSERT INTO llaves_acceso (hogar_id, credencial_id, clave_publica, nombre) VALUES ($1, $2, $3, 'otra')", [hogar, CRED, CLAVE]), /llaves_acceso_credencial_id_key/);
  await assert.rejects(app.query("INSERT INTO llaves_acceso (hogar_id, credencial_id, clave_publica, nombre) VALUES ($1, 'con espacios y ñ 0123456789', $2, 'otra')", [hogar, CLAVE]), /llaves_acceso_credencial_id_check/);
});

test("sesiones.origen admite 'llave' y no un valor inventado; las sesiones anteriores valen", async t => {
  if (salta(t)) return;
  const ins = (origen: string, n: number) => dueno.query("INSERT INTO sesiones (hogar_id, hash, expira_en, origen) VALUES ($1, $2, now() + interval '1 day', $3)", [hogar, Buffer.alloc(32, n), origen]);
  await ins("enlace", 1); await ins("vinculo", 2); await ins("llave", 3);
  await assert.rejects(ins("inventado", 4), /sesiones_origen_check/);
  const llaveId = (await dueno.query<{ id: number }>("SELECT id FROM llaves_acceso LIMIT 1")).rows[0]!.id;
  await dueno.query("UPDATE sesiones SET llave_id = $1 WHERE hash = $2", [llaveId, Buffer.alloc(32, 3)]);   // el FK siguió a la tabla renombrada
});

test("llaves_retos: un reto sin sesión atado a una clave, de tipo 'acceso'; sin clave ni sesión no", async t => {
  if (salta(t)) return;
  const reto = "a".repeat(43);
  await app.query("INSERT INTO llaves_retos (sesion_id, tipo, reto, clave, expira_en) VALUES (NULL, 'acceso', $1, $2, now() + interval '5 minutes')", [reto, Buffer.alloc(32, 9)]);
  await assert.rejects(app.query("INSERT INTO llaves_retos (sesion_id, tipo, reto, clave, expira_en) VALUES (NULL, 'acceso', $1, $2, now() + interval '5 minutes')", [reto, Buffer.alloc(32, 9)]), /llaves_retos_clave_key/);   // la clave es única
  await assert.rejects(app.query("INSERT INTO llaves_retos (sesion_id, tipo, reto, expira_en) VALUES (NULL, 'alta', $1, now() + interval '5 minutes')", [reto]), /llaves_retos_sesion_o_clave/);
  await assert.rejects(app.query("INSERT INTO llaves_retos (sesion_id, tipo, reto, clave, expira_en) VALUES (NULL, 'acceso', $1, $2, now())", [reto, Buffer.alloc(31, 1)]), /llaves_retos_clave_check/);
  await app.query("DELETE FROM llaves_retos WHERE expira_en < now() + interval '1 hour'");   // la purga de la api (gemelo_api) funciona
});

test("gemelo_api conserva sus permisos y no gana otros", async t => {
  if (salta(t)) return;
  for (const [tabla, p] of [["llaves_acceso", "SELECT"], ["llaves_acceso", "INSERT"], ["llaves_acceso", "UPDATE"], ["llaves_acceso", "DELETE"], ["llaves_retos", "INSERT"], ["llaves_oficina", "UPDATE"]]) {
    assert.strictEqual((await dueno.query<{ t: boolean }>("SELECT has_table_privilege('gemelo_api', $1, $2) AS t", [tabla, p])).rows[0]!.t, true, tabla + " " + p);
  }
  assert.strictEqual((await dueno.query<{ t: boolean }>("SELECT has_table_privilege('gemelo_api', 'llaves_acceso', 'TRUNCATE') AS t")).rows[0]!.t, false);
});

// PostGIS de pruebas en un contenedor (Testcontainers) con la MISMA imagen que producción (infra/compose.yml).
// Sin Docker, las pruebas de integración se SALTAN con aviso (no pasan en silencio).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { migra } from "../../src/bd/migra.ts";

const COMPOSE = fileURLToPath(new URL("../../../../infra/compose.yml", import.meta.url));
/** La imagen de la base sale del compose de producción: si alguien la cambia allí, las pruebas usan la nueva. */
export function imagenBd(): string {
  const m = /^\s*image:\s*(postgis\/postgis:\S+)\s*$/m.exec(readFileSync(COMPOSE, "utf8"));
  if (!m) throw new Error("no encuentro la imagen postgis en infra/compose.yml");
  return m[1]!;
}

export function hayDocker(): boolean {
  try { execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], { stdio: "pipe", timeout: 20_000 }); return true; }
  catch { return false; }
}

export interface BdDePrueba {
  contenedor: StartedPostgreSqlContainer;
  /** superusuario: para preparar datos y mirar tablas */
  dueno: pg.Pool;
  /** el rol de la aplicación (gemelo_api), con los permisos mínimos de la migración */
  app: pg.Pool;
  cierra(): Promise<void>;
}

export async function levantaBd(): Promise<BdDePrueba> {
  const contenedor = await new PostgreSqlContainer(imagenBd()).withDatabase("gemelo").withStartupTimeout(120_000).start();
  const base = { host: contenedor.getHost(), port: contenedor.getPort(), database: contenedor.getDatabase() };
  const dueno = new pg.Pool({ ...base, user: contenedor.getUsername(), password: contenedor.getPassword(), max: 4 });
  const claveApp = "prueba-" + Math.random().toString(36).slice(2);
  await dueno.query("CREATE ROLE gemelo_api LOGIN PASSWORD '" + claveApp + "'");
  await migra({ ...base, user: contenedor.getUsername(), password: contenedor.getPassword() });
  const app = new pg.Pool({ ...base, user: "gemelo_api", password: claveApp, max: 6 });
  return {
    contenedor, dueno, app,
    async cierra() { await app.end(); await dueno.end(); await contenedor.stop(); },
  };
}

/** Carga las hazas y olivos SINTÉTICOS de tuberia/hazas/ejemplo con el propio cargador (prueba de punta a punta). */
export function sqlDeEjemplo(): string {
  const raiz = fileURLToPath(new URL("../../../../", import.meta.url));
  const salida = join(mkdtempSync(join(tmpdir(), "gemelo-hazas-")), "hazas.sql");
  const py = process.env["PYTHON"] ?? "python";
  execFileSync(py, ["tuberia/hazas/carga_hazas.py", "--hazas", "tuberia/hazas/ejemplo/hazas.sintetico.geojson",
    "--olivos", "tuberia/hazas/ejemplo/olivos.sintetico.geojson", "--salida", salida], { cwd: raiz, stdio: "pipe" });
  return readFileSync(salida, "utf8");
}

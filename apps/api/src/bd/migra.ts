// Migraciones con node-pg-migrate: aplica en orden los apps/api/migraciones/NNNN_*.sql que falten, cada una en su
// transacción y con su cerrojo (dos arranques a la vez no se pisan). Solo hacia arriba: una migración publicada no se
// edita ni se deshace; se añade otra (0002_…). Registro de lo aplicado: tabla `esquema_migraciones`.
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import type { ClientConfig } from "pg";

export const CARPETA_MIGRACIONES = process.env["GEMELO_MIGRACIONES"] ?? fileURLToPath(new URL("../../migraciones/", import.meta.url));

export async function migra(conexion: ClientConfig, carpeta = CARPETA_MIGRACIONES): Promise<string[]> {
  const hechas = await runner({
    databaseUrl: conexion,
    dir: carpeta,
    ignorePattern: "(\\..*|.*\\.md)",
    migrationsTable: "esquema_migraciones",
    direction: "up",
    count: Infinity,
    checkOrder: true,
    log: () => undefined,
  });
  return hechas.map(m => m.name);
}

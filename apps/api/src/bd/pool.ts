import pg from "pg";
import type { Config } from "../config.ts";

export type Bd = pg.Pool;
export type Cliente = pg.PoolClient;

// bigint (int8) llega como texto por defecto; los ids caben de sobra en un Number.
pg.types.setTypeParser(20, v => Number(v));
// numeric llega como texto: lo pasamos a Number (superficies, NDVI); ninguna cifra necesita más de 15 dígitos.
pg.types.setTypeParser(1700, v => Number(v));
// date como texto AAAA-MM-DD, sin convertir a hora local.
pg.types.setTypeParser(1082, v => v);

export function conexion(c: Config["bd"]): pg.ClientConfig {
  const o: pg.ClientConfig = {
    host: c.host, port: c.puerto, database: c.base, user: c.usuario,
    connectionTimeoutMillis: 5_000, statement_timeout: 15_000, application_name: "gemelo-api",
  };
  if (c.clave !== undefined) o.password = c.clave;
  return o;
}

export function creaBd(c: Config["bd"]): Bd {
  return new pg.Pool({ ...conexion(c), max: c.max, idleTimeoutMillis: 30_000 });
}

/** Ejecuta `fn` dentro de una transacción (BEGIN/COMMIT, ROLLBACK si lanza). */
export async function enTransaccion<T>(bd: Bd, fn: (c: Cliente) => Promise<T>): Promise<T> {
  const c = await bd.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

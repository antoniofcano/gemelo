// Siembra del entorno local: hazas y olivos SINTÉTICOS del mundo Hituelo del fixture y tres hogares de prueba
// (@example.com), cada uno con su haza. Idempotente: se puede repetir cuantas veces se quiera y deja siempre lo mismo.
// La lanza `npm run dev:arriba` después de `up --wait` (las migraciones ya las aplicó el servicio `migra`);
// a mano: node infra/dev/herramientas/siembra.mjs (con el entorno levantado).
//
// Nada de esto es real (CLAUDE.md regla 4): las hazas salen del fixture (tuberia/hazas/desde_fixture.py, que se niega
// con un índice que no sea sintético) y los correos son del dominio reservado example.com (RFC 2606).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cargaEnv, puertos, util, FIXTURE, RAIZ, SALIDA_DEV } from "./_comun.mjs";

/** Hogares de prueba. alias_visible decide si su alias sale en la ficha de su haza para los demás (lista blanca). */
export const HOGARES = [
  { correo: "hogar.prueba@example.com", alias: "Abubilla", alias_visible: true, haza: "H-D01" },
  { correo: "vecino.prueba@example.com", alias: "Vecino", alias_visible: false, haza: "H-D02" },
  { correo: "mirlo.prueba@example.com", alias: "Mirlo", alias_visible: true, haza: "H-D03" },
];
/** La haza H-D04 queda sin asignar (como las que la oficina aún no ha dado a nadie). */
export const HAZAS_SIN_ASIGNAR = ["H-D04"];

/** SQL de hazas y olivos con el cargador de tuberia/hazas (necesita Python 3 con jsonschema: tuberia/hazas/requirements.txt) */
function sqlDeHazas() {
  const py = util.python();
  if (!py) throw new Error("falta Python 3 para generar las hazas sintéticas");
  const indice = path.join(FIXTURE, "hituelo", "indice.json");
  if (!fs.existsSync(indice)) throw new Error("falta el fixture (" + path.relative(RAIZ, indice) + "): npm run fixture");
  const salida = path.join(SALIDA_DEV, "hazas");
  // sin -I: jsonschema puede estar instalado en el sitio del usuario (pip install --user)
  const r = util.ejecuta(py, [path.join("tuberia", "hazas", "desde_fixture.py"), "--indice", indice, "--salida", salida]);
  if (r.status !== 0) {
    const sinDep = /No module named 'jsonschema'/.test(r.stderr);
    throw new Error(sinDep ? "falta jsonschema: pip install -r tuberia/hazas/requirements.txt" : "desde_fixture.py falló:\n" + r.stdout + r.stderr);
  }
  return { sql: fs.readFileSync(path.join(salida, "hazas.sql"), "utf8"), resumen: JSON.parse(r.stdout.trim().split("\n").pop()) };
}

export async function siembra() {
  cargaEnv();
  const { sql, resumen } = sqlDeHazas();
  const { default: pg } = await import("pg");
  const p = puertos();
  const c = new pg.Client({ host: "127.0.0.1", port: p.db, user: "gemelo", database: "gemelo", password: process.env.GEMELO_DEV_PG_CLAVE, connectionTimeoutMillis: 10000 });
  try { await c.connect(); }
  catch (e) {
    // la clave de Postgres se fija al CREAR el volumen: un volumen de otro .env (otra copia del repo) no la acepta
    if (/password authentication failed/.test(String(e.message))) {
      throw new Error("la base no acepta la clave de infra/dev/.env: el volumen de la base (<proyecto>_pg_datos) se creó con otra. " +
        "Es de desarrollo: npm run dev:abajo -- --borra-datos y vuelve a levantar (o usa otro COMPOSE_PROJECT_NAME)");
    }
    throw e;
  }
  try {
    await c.query(sql);                                   // trae su BEGIN/COMMIT; idempotente (ON CONFLICT)
    await c.query("BEGIN");
    try {
      for (const h of HOGARES) {
        const r = await c.query(
          `INSERT INTO hogares (correo, rol, alias, alias_visible, activo) VALUES ($1, 'hogar', $2, $3, true)
           ON CONFLICT (correo) DO UPDATE SET rol = 'hogar', alias = EXCLUDED.alias, alias_visible = EXCLUDED.alias_visible, activo = true
           RETURNING id`, [h.correo, h.alias, h.alias_visible]);
        const a = await c.query("UPDATE hazas SET hogar_id = $1 WHERE codigo = $2", [r.rows[0].id, h.haza]);
        if (a.rowCount !== 1) throw new Error("no existe la haza " + h.haza);
      }
      await c.query("UPDATE hazas SET hogar_id = NULL WHERE codigo = ANY($1)", [HAZAS_SIN_ASIGNAR]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; }
    const n = (await c.query(
      `SELECT (SELECT count(*) FROM hazas WHERE codigo LIKE 'H-D%')::int AS hazas, (SELECT count(*) FROM olivos)::int AS olivos,
              (SELECT count(*) FROM hogares WHERE correo LIKE '%.prueba@example.com')::int AS hogares`)).rows[0];
    return { ...n, generadas: resumen };
  } finally { await c.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await siembra())); }
  catch (e) { console.error("✗ " + e.message); process.exit(1); }
}

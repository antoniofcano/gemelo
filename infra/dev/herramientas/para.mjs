// Para el entorno de desarrollo: `npm run dev:abajo` (docker compose down). Los volúmenes (la base de datos) se CONSERVAN;
// para borrarlos también: `npm run dev:abajo -- --borra-datos`. Solo toca el proyecto «gemelo-dev».
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cargaEnv, compose, motivoSinDocker } from "./_comun.mjs";

export function para({ borraDatos = false } = {}) {
  const sin = motivoSinDocker();
  if (sin) throw new Error(sin);
  cargaEnv();
  const r = compose(["down", "--remove-orphans"].concat(borraDatos ? ["--volumes"] : []));
  if (r.status !== 0) throw new Error("docker compose down falló");
  console.log(borraDatos ? "Parado y BORRADO el volumen de la base de datos." : "Parado. El volumen de la base de datos se conserva (--borra-datos para borrarlo).");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { para({ borraDatos: process.argv.includes("--borra-datos") }); }
  catch (e) { console.error("✗ " + e.message); process.exit(1); }
}

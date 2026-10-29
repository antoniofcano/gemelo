// `npm run migra`: aplica las migraciones pendientes con el usuario dueño del esquema (GEMELO_DB_URL con gemelo_dueno en el VPS).
// Solo lee la conexión a la base (cargaConfigBd): no necesita SMTP ni OlivarTrack.
import { cargaConfigBd } from "../config.ts";
import { migra } from "./migra.ts";
import { conexion } from "./pool.ts";

// Sin el tope de 15 s por sentencia de la api: la 0001 crea PostGIS (infra/bd-inicial ocupa /docker-entrypoint-initdb.d y
// la imagen ya no lo crea al iniciar el volumen), y en un disco lento eso pasa de 15 s (visto en local el 2026-10-29:
// «canceling statement due to statement timeout» cargando spatial_ref_sys). Tope de 10 min.
const hechas = await migra({ ...conexion(cargaConfigBd()), statement_timeout: 600_000 });
console.log(JSON.stringify({ evento: "migraciones", aplicadas: hechas }));

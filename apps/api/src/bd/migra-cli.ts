// `npm run migra`: aplica las migraciones pendientes con el usuario dueño del esquema (GEMELO_DB_URL con gemelo_dueno en el VPS).
// Solo lee la conexión a la base (cargaConfigBd): no necesita SMTP ni OlivarTrack.
import { cargaConfigBd } from "../config.ts";
import { migra } from "./migra.ts";
import { conexion } from "./pool.ts";

const hechas = await migra(conexion(cargaConfigBd()));
console.log(JSON.stringify({ evento: "migraciones", aplicadas: hechas }));

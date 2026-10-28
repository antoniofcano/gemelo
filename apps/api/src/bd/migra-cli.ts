// `npm run migra`: aplica las migraciones pendientes con el usuario dueño del esquema (PGUSER=gemelo_dueno en el VPS).
import { cargaConfig } from "../config.ts";
import { migra } from "./migra.ts";
import { conexion } from "./pool.ts";

const config = cargaConfig();
const hechas = await migra(conexion(config.bd));
console.log(JSON.stringify({ evento: "migraciones", aplicadas: hechas }));

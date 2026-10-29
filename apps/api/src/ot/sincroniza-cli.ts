// `npm run sincroniza`: una sincronía a mano (la misma que hace la api cada GEMELO_OT_CADA_MIN minutos).
import { creaBd } from "../bd/pool.ts";
import { cargaConfig } from "../config.ts";
import { LectorGrabado } from "./lector-grabado.ts";
import { LectorMcp } from "./lector-mcp.ts";
import { sincroniza } from "./sincronia.ts";

const config = cargaConfig();
if (config.ot.modo === "no") { console.error("GEMELO_OT=no: la lectura de OlivarTrack está apagada"); process.exit(2); }
const lector = config.ot.modo === "mcp" ? new LectorMcp(config.ot.url, config.ot.token) : new LectorGrabado(config.ot.carpeta);
const bd = creaBd(config.bd);
try {
  console.log(JSON.stringify({ evento: "sincronia", resumen: await sincroniza(bd, lector) }));
} finally {
  await lector.cierra();
  await bd.end();
}

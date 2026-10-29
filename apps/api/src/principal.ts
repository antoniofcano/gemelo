// Arranque de la api en el contenedor: configuración, base, correo, OlivarTrack, tareas periódicas y apagado limpio.
// Las migraciones NO se aplican aquí (el usuario de la api no puede cambiar el esquema): las aplica el servicio
// `migra` del compose con el usuario dueño (infra/compose.yml).
import { construyeApp } from "./app.ts";
import { purga } from "./auth/servicio.ts";
import { BuzonDePruebas, type Cartero, CarteroSmtp } from "./auth/correo.ts";
import { creaBd } from "./bd/pool.ts";
import { cargaConfig } from "./config.ts";
import { LectorGrabado } from "./ot/lector-grabado.ts";
import { LectorMcp } from "./ot/lector-mcp.ts";
import type { LectorOlivarTrack } from "./ot/lector.ts";
import { sincroniza } from "./ot/sincronia.ts";

const config = cargaConfig();
const bd = creaBd(config.bd);
const cartero: Cartero = config.correo.modo === "smtp" ? new CarteroSmtp(config.correo) : new BuzonDePruebas();
const lector: LectorOlivarTrack | null = config.ot.modo === "mcp" ? new LectorMcp(config.ot.url, config.ot.token)
  : config.ot.modo === "grabado" ? new LectorGrabado(config.ot.carpeta) : null;

const app = await construyeApp({ config, bd, cartero, lector });
if (config.correo.modo === "buzon") app.log.warn("correo en modo buzón de pruebas: los enlaces NO se mandan");

const relojes: NodeJS.Timeout[] = [];
if (lector && config.ot.modo !== "no" && config.ot.cadaMin > 0) {
  let corriendo = false;
  const tarea = async () => {
    if (corriendo) return;
    corriendo = true;
    try { app.log.info({ evento: "sincronia", resumen: await sincroniza(bd, lector) }, "sincronía con OlivarTrack"); }
    catch (e) { app.log.error({ evento: "sincronia_fallida", error: e instanceof Error ? e.message : "?" }, "sincronía fallida"); }
    finally { corriendo = false; }
  };
  relojes.push(setInterval(tarea, config.ot.cadaMin * 60_000));
  setTimeout(tarea, 10_000).unref();
}
relojes.push(setInterval(() => { purga(bd).catch(() => undefined); }, 6 * 3600_000));

async function apaga(senal: string) {
  app.log.info({ evento: "apagado", senal }, "apagando");
  relojes.forEach(clearInterval);
  await app.close();
  await Promise.allSettled([bd.end(), cartero.cierra(), lector?.cierra()]);
  process.exit(0);
}
process.on("SIGTERM", () => void apaga("SIGTERM"));
process.on("SIGINT", () => void apaga("SIGINT"));

await app.listen({ port: config.puerto, host: config.escucha });

// Arranque de la api en el contenedor: configuración, base, correo, OlivarTrack, el tiempo de Vigía, tareas periódicas y apagado limpio.
// Las migraciones NO se aplican aquí (el usuario de la api no puede cambiar el esquema): las aplica el servicio
// `migra` del compose con el usuario dueño (infra/compose.yml).
import { construyeApp } from "./app.ts";
import { purgaBajas } from "./admin/bajas.ts";
import { purga } from "./auth/servicio.ts";
import { Repartidor } from "./avisos/correo.ts";
import { BuzonDePruebas, type Cartero, CarteroSmtp } from "./auth/correo.ts";
import { creaBd } from "./bd/pool.ts";
import { cargaConfig } from "./config.ts";
import { LectorGrabado } from "./ot/lector-grabado.ts";
import { LectorMcp } from "./ot/lector-mcp.ts";
import type { LectorOlivarTrack } from "./ot/lector.ts";
import { sincroniza } from "./ot/sincronia.ts";
import { LectorVigiaFixture } from "./vigia/lector-fixture.ts";
import { LectorVigiaMcp } from "./vigia/lector-mcp.ts";
import { ServicioTiempo } from "./vigia/servicio.ts";
import { purgaMedios } from "./vida/medios.ts";

const config = cargaConfig();
const bd = creaBd(config.bd);
const cartero: Cartero = config.correo.modo === "smtp" ? new CarteroSmtp(config.correo) : new BuzonDePruebas();
const lector: LectorOlivarTrack | null = config.ot.modo === "mcp" ? new LectorMcp(config.ot.url, config.ot.token)
  : config.ot.modo === "grabado" ? new LectorGrabado(config.ot.carpeta) : null;

const tiempo = config.vigia.modo === "mcp" ? new ServicioTiempo(new LectorVigiaMcp(config.vigia.url, config.vigia.token))
  : config.vigia.modo === "fixture" ? new ServicioTiempo(new LectorVigiaFixture(config.vigia.carpeta)) : null;

// el correo de los avisos y los .ics (OF11c): en segundo plano, con el mismo cartero; en modo buzón de pruebas no se manda nada (ni se marca como enviado)
const repartidor = config.avisosCorreo.activo && config.correo.modo === "smtp"
  ? new Repartidor(bd, cartero, { urlPublica: config.urlPublica, secreto: config.sesion.secreto, remitente: config.correo.remitente, reintentos: config.avisosCorreo.reintentos, cadaSeg: config.avisosCorreo.cadaSeg, log: { warn: (o, m) => app.log.warn(o, m), info: (o, m) => app.log.info(o, m) } })
  : undefined;
const app = await construyeApp({ config, bd, cartero, lector, tiempo, ...(repartidor ? { repartidor } : {}) });
repartidor?.inicia();
if (config.vigia.modo === "fixture") app.log.warn("el tiempo es el fixture SINTÉTICO de pruebas (GEMELO_VIGIA=fixture), no Vigía");
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
relojes.push(setInterval(() => {
  purga(bd).catch(() => undefined);
  purgaBajas(bd, config.medios.carpeta).catch(() => undefined);
  purgaMedios(bd, config.medios.carpeta, config.medios.retencionDias).catch(() => undefined);
}, 6 * 3600_000));
if (!config.medios.carpeta) app.log.warn("sin GEMELO_MEDIOS: las fotos de los hogares están apagadas (503)");

async function apaga(senal: string) {
  app.log.info({ evento: "apagado", senal }, "apagando");
  relojes.forEach(clearInterval);
  await repartidor?.para();
  await app.close();
  await Promise.allSettled([bd.end(), cartero.cierra(), lector?.cierra(), tiempo?.cierra()]);
  process.exit(0);
}
process.on("SIGTERM", () => void apaga("SIGTERM"));
process.on("SIGINT", () => void apaga("SIGINT"));

await app.listen({ port: config.puerto, host: config.escucha });

// Configuración de la api: todo sale de variables de entorno (contratos/publicacion-vps.json, infra/entorno.ejemplo).
// Los secretos se leen de FICHEROS (secretos de Docker), nunca de la propia variable, para que no salgan en `docker inspect`.
import { readFileSync } from "node:fs";

export type ModoCorreo = "smtp" | "buzon";
export type ModoOt = "mcp" | "grabado" | "no";

export interface Config {
  produccion: boolean;
  puerto: number;
  escucha: string;
  urlPublica: string;          // p. ej. https://gemelo.canoydamas.es (sin barra final)
  origenes: string[];          // orígenes admitidos en los POST/PUT/DELETE
  saltosProxy: number;         // proxies de confianza delante de la api (borde + Caddy interno = 2)
  nivelRegistro: string;
  bd: { host: string; puerto: number; base: string; usuario: string; clave: string | undefined; max: number };
  sesion: { diasAbsolutos: number; diasInactividad: number };
  enlace: { minutos: number; porIp: number; porCorreo: number; ventanaMin: number };
  correo:
    | { modo: "buzon" }
    | { modo: "smtp"; host: string; puerto: number; usuario: string; clave: string; remitente: string };
  ot:
    | { modo: "no" }
    | { modo: "grabado"; carpeta: string; cadaMin: number }
    | { modo: "mcp"; url: string; token: string; cadaMin: number };
}

export class ErrorDeConfig extends Error {}

type Entorno = Record<string, string | undefined>;

function texto(e: Entorno, nombre: string, defecto?: string): string {
  const v = e[nombre]?.trim();
  if (v) return v;
  if (defecto !== undefined) return defecto;
  throw new ErrorDeConfig("falta la variable " + nombre);
}
function entero(e: Entorno, nombre: string, defecto: number, min: number, max: number): number {
  const s = e[nombre]?.trim();
  if (!s) return defecto;
  if (!/^\d+$/.test(s)) throw new ErrorDeConfig(nombre + " debe ser un entero");
  const n = Number(s);
  if (n < min || n > max) throw new ErrorDeConfig(nombre + " fuera de rango [" + min + ", " + max + "]");
  return n;
}
/** Lee un secreto de un fichero (`NOMBRE_FICHERO`); quita el salto de línea final. */
function secreto(e: Entorno, nombre: string, obligatorio: boolean): string | undefined {
  const ruta = e[nombre + "_FICHERO"]?.trim();
  if (!ruta) {
    if (obligatorio) throw new ErrorDeConfig("falta " + nombre + "_FICHERO (ruta al fichero con el secreto)");
    return undefined;
  }
  let s: string;
  try { s = readFileSync(ruta, "utf8").replace(/\r?\n$/, ""); }
  catch { throw new ErrorDeConfig("no se puede leer el fichero de " + nombre); }
  if (!s) throw new ErrorDeConfig("el fichero de " + nombre + " está vacío");
  return s;
}
function url(nombre: string, v: string, exigeHttps: boolean): URL {
  let u: URL;
  try { u = new URL(v); } catch { throw new ErrorDeConfig(nombre + " no es una URL"); }
  if (exigeHttps && u.protocol !== "https:") throw new ErrorDeConfig(nombre + " debe ser https en producción");
  return u;
}

export function cargaConfig(e: Entorno = process.env): Config {
  const produccion = e["NODE_ENV"] === "production";
  const urlPublica = url("GEMELO_API_URL_PUBLICA", texto(e, "GEMELO_API_URL_PUBLICA"), produccion).origin;
  const origenes = (e["GEMELO_API_ORIGENES"]?.trim() ? e["GEMELO_API_ORIGENES"]!.split(",") : [urlPublica])
    .map(o => url("GEMELO_API_ORIGENES", o.trim(), produccion).origin);

  const modoCorreo = texto(e, "GEMELO_CORREO", produccion ? undefined : "buzon");
  if (modoCorreo !== "smtp" && modoCorreo !== "buzon") throw new ErrorDeConfig("GEMELO_CORREO debe ser smtp o buzon");
  if (produccion && modoCorreo === "buzon") throw new ErrorDeConfig("en producción el correo no puede ser el buzón de pruebas");
  const correo: Config["correo"] = modoCorreo === "buzon" ? { modo: "buzon" } : {
    modo: "smtp",
    host: texto(e, "GEMELO_SMTP_HOST"),
    puerto: entero(e, "GEMELO_SMTP_PUERTO", 465, 1, 65535),
    usuario: texto(e, "GEMELO_SMTP_USUARIO"),
    clave: secreto(e, "GEMELO_SMTP_CLAVE", true)!,
    remitente: texto(e, "GEMELO_SMTP_REMITENTE"),
  };

  const modoOt = texto(e, "GEMELO_OT", "no");
  if (modoOt !== "mcp" && modoOt !== "grabado" && modoOt !== "no") throw new ErrorDeConfig("GEMELO_OT debe ser mcp, grabado o no");
  if (produccion && modoOt === "grabado") throw new ErrorDeConfig("en producción OlivarTrack no puede ser la grabación de pruebas");
  const cadaMin = entero(e, "GEMELO_OT_CADA_MIN", 60, 0, 1440);
  const ot: Config["ot"] = modoOt === "no" ? { modo: "no" }
    : modoOt === "grabado" ? { modo: "grabado", carpeta: texto(e, "GEMELO_OT_GRABACIONES"), cadaMin }
    : { modo: "mcp", url: url("GEMELO_OT_MCP_URL", texto(e, "GEMELO_OT_MCP_URL"), true).href, token: secreto(e, "GEMELO_OT_TOKEN", true)!, cadaMin };

  return {
    produccion,
    puerto: entero(e, "GEMELO_API_PUERTO", 3000, 1, 65535),
    escucha: texto(e, "GEMELO_API_ESCUCHA", "0.0.0.0"),
    urlPublica,
    origenes,
    saltosProxy: entero(e, "GEMELO_API_PROXIES", 2, 0, 5),
    nivelRegistro: texto(e, "GEMELO_API_REGISTRO", "info"),
    bd: {
      host: texto(e, "PGHOST", "localhost"),
      puerto: entero(e, "PGPORT", 5432, 1, 65535),
      base: texto(e, "PGDATABASE", "gemelo"),
      usuario: texto(e, "PGUSER", "gemelo_api"),
      clave: secreto(e, "GEMELO_PG_CLAVE", false) ?? e["PGPASSWORD"],
      max: entero(e, "GEMELO_PG_CONEXIONES", 10, 1, 100),
    },
    sesion: {
      diasAbsolutos: entero(e, "GEMELO_SESION_DIAS", 30, 1, 365),
      diasInactividad: entero(e, "GEMELO_SESION_INACTIVIDAD_DIAS", 7, 1, 365),
    },
    enlace: {
      minutos: 15,
      porIp: entero(e, "GEMELO_ENLACE_POR_IP", 10, 1, 1000),
      porCorreo: entero(e, "GEMELO_ENLACE_POR_CORREO", 3, 1, 100),
      ventanaMin: entero(e, "GEMELO_ENLACE_VENTANA_MIN", 15, 1, 1440),
    },
    correo,
    ot,
  };
}

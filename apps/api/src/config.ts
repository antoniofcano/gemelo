// Configuración de la api: todo sale de variables de entorno. Lista completa con su explicación: infra/entorno.ejemplo.
// Los nombres coinciden con el «enchufe» que espera infra/dev (GEMELO_API_PUERTO, GEMELO_DB_URL, GEMELO_DB_CLAVE,
// GEMELO_URL_PUBLICA, GEMELO_SMTP_*, GEMELO_CORREO_REMITENTE).
// Secretos: en producción SOLO desde fichero (`NOMBRE_FICHERO`, secretos de Docker), para que no salgan en
// `docker inspect`; fuera de producción vale también el valor en la variable (`NOMBRE`), como hace infra/dev.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

export type ModoCorreo = "smtp" | "buzon";
export type ModoOt = "mcp" | "grabado" | "no";

export interface ConfigSmtp {
  modo: "smtp"; host: string; puerto: number; tls: boolean;
  usuario: string | undefined; clave: string | undefined; remitente: string;
}

export interface Config {
  produccion: boolean;
  puerto: number;
  escucha: string;
  urlPublica: string;          // p. ej. https://gemelo.canoydamas.es (sin barra final)
  origenes: string[];          // orígenes admitidos en los POST/PUT/DELETE
  saltosProxy: number;         // proxies de confianza delante de la api (borde + Caddy interno = 2)
  nivelRegistro: string;
  bd: { host: string; puerto: number; base: string; usuario: string; clave: string | undefined; max: number };
  sesion: { diasAbsolutos: number; diasInactividad: number; secreto: string };
  enlace: { minutos: number; porIp: number; porCorreo: number; ventanaMin: number };
  correo: { modo: "buzon" } | ConfigSmtp;
  ot:
    | { modo: "no" }
    | { modo: "grabado"; carpeta: string; cadaMin: number }
    | { modo: "mcp"; url: string; token: string; cadaMin: number };
}

export class ErrorDeConfig extends Error {}

type Entorno = Record<string, string | undefined>;
const esProduccion = (e: Entorno) => e["NODE_ENV"] === "production";

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
/** Secreto desde `NOMBRE_FICHERO` (quita el salto de línea final) o, fuera de producción, desde `NOMBRE`. */
function secreto(e: Entorno, nombre: string, obligatorio: boolean): string | undefined {
  const ruta = e[nombre + "_FICHERO"]?.trim();
  if (ruta) {
    let s: string;
    try { s = readFileSync(ruta, "utf8").replace(/\r?\n$/, ""); }
    catch { throw new ErrorDeConfig("no se puede leer el fichero de " + nombre); }
    if (!s) throw new ErrorDeConfig("el fichero de " + nombre + " está vacío");
    return s;
  }
  const v = e[nombre];
  if (v) {
    if (esProduccion(e)) throw new ErrorDeConfig("en producción " + nombre + " va en un fichero (" + nombre + "_FICHERO), no en la variable");
    return v;
  }
  if (obligatorio) throw new ErrorDeConfig("falta " + nombre + "_FICHERO (ruta al fichero con el secreto)");
  return undefined;
}
function url(nombre: string, v: string, exigeHttps: boolean): URL {
  let u: URL;
  try { u = new URL(v); } catch { throw new ErrorDeConfig(nombre + " no es una URL"); }
  if (exigeHttps && u.protocol !== "https:") throw new ErrorDeConfig(nombre + " debe ser https en producción");
  return u;
}

/** Secreto de firma de la cookie (≥ 32 caracteres). Fuera de producción, si falta, uno al azar (las sesiones no sobreviven a un reinicio). */
function secretoSesion(e: Entorno): string {
  const s = secreto(e, "GEMELO_SESION_SECRETO", esProduccion(e)) ?? randomBytes(32).toString("base64url");
  if (s.length < 32) throw new ErrorDeConfig("GEMELO_SESION_SECRETO debe tener al menos 32 caracteres");
  return s;
}

/**
 * Conexión a la base: GEMELO_DB_URL (postgresql://usuario@servidor:puerto/base, SIN contraseña) y la clave aparte
 * (GEMELO_DB_CLAVE_FICHERO, o GEMELO_DB_CLAVE fuera de producción). Es lo único que necesita `npm run migra`.
 */
export function cargaConfigBd(e: Entorno = process.env): Config["bd"] {
  const u = url("GEMELO_DB_URL", texto(e, "GEMELO_DB_URL"), false);
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") throw new ErrorDeConfig("GEMELO_DB_URL debe ser postgresql://");
  if (u.password) throw new ErrorDeConfig("GEMELO_DB_URL no lleva la contraseña: va en GEMELO_DB_CLAVE(_FICHERO)");
  const base = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!u.username || !u.hostname || !base) throw new ErrorDeConfig("GEMELO_DB_URL debe tener usuario, servidor y base");
  return {
    host: u.hostname,
    puerto: u.port ? Number(u.port) : 5432,
    base,
    usuario: decodeURIComponent(u.username),
    clave: secreto(e, "GEMELO_DB_CLAVE", false),
    max: entero(e, "GEMELO_DB_CONEXIONES", 10, 1, 100),
  };
}

function cargaCorreo(e: Entorno, produccion: boolean): Config["correo"] {
  const modo = texto(e, "GEMELO_CORREO", produccion ? "smtp" : "buzon");
  if (modo !== "smtp" && modo !== "buzon") throw new ErrorDeConfig("GEMELO_CORREO debe ser smtp o buzon");
  if (modo === "buzon") {
    if (produccion) throw new ErrorDeConfig("en producción el correo no puede ser el buzón de pruebas");
    return { modo: "buzon" };
  }
  const tls = texto(e, "GEMELO_SMTP_TLS", "si");
  if (tls !== "si" && tls !== "no") throw new ErrorDeConfig("GEMELO_SMTP_TLS debe ser si o no");
  if (produccion && tls === "no") throw new ErrorDeConfig("en producción el SMTP va siempre con TLS");
  const usuario = e["GEMELO_SMTP_USUARIO"]?.trim() || undefined;
  if (produccion && !usuario) throw new ErrorDeConfig("en producción el SMTP necesita GEMELO_SMTP_USUARIO");
  return {
    modo: "smtp",
    host: texto(e, "GEMELO_SMTP_HOST"),
    puerto: entero(e, "GEMELO_SMTP_PUERTO", 465, 1, 65535),
    tls: tls === "si",
    usuario,
    clave: secreto(e, "GEMELO_SMTP_CLAVE", !!usuario),
    remitente: texto(e, "GEMELO_CORREO_REMITENTE"),
  };
}

export function cargaConfig(e: Entorno = process.env): Config {
  const produccion = esProduccion(e);
  const urlPublica = url("GEMELO_URL_PUBLICA", texto(e, "GEMELO_URL_PUBLICA"), produccion).origin;
  const origenes = (e["GEMELO_API_ORIGENES"]?.trim() ? e["GEMELO_API_ORIGENES"]!.split(",") : [urlPublica])
    .map(o => url("GEMELO_API_ORIGENES", o.trim(), produccion).origin);

  const modoOt = texto(e, "GEMELO_OT", "no");
  if (modoOt !== "mcp" && modoOt !== "grabado" && modoOt !== "no") throw new ErrorDeConfig("GEMELO_OT debe ser mcp, grabado o no");
  if (produccion && modoOt === "grabado") throw new ErrorDeConfig("en producción OlivarTrack no puede ser la grabación de pruebas");
  const cadaMin = entero(e, "GEMELO_OT_CADA_MIN", 60, 0, 1440);
  const ot: Config["ot"] = modoOt === "no" ? { modo: "no" }
    : modoOt === "grabado" ? { modo: "grabado", carpeta: texto(e, "GEMELO_OT_GRABACIONES"), cadaMin }
    : { modo: "mcp", url: url("GEMELO_OT_MCP_URL", texto(e, "GEMELO_OT_MCP_URL"), true).href, token: secreto(e, "GEMELO_OT_TOKEN", true)!, cadaMin };

  return {
    produccion,
    puerto: entero(e, "GEMELO_API_PUERTO", 8000, 1, 65535),
    escucha: texto(e, "GEMELO_API_ESCUCHA", "0.0.0.0"),
    urlPublica,
    origenes,
    saltosProxy: entero(e, "GEMELO_API_PROXIES", 2, 0, 5),
    nivelRegistro: texto(e, "GEMELO_API_REGISTRO", "info"),
    bd: cargaConfigBd(e),
    sesion: {
      diasAbsolutos: entero(e, "GEMELO_SESION_DIAS", 30, 1, 365),
      diasInactividad: entero(e, "GEMELO_SESION_INACTIVIDAD_DIAS", 7, 1, 365),
      secreto: secretoSesion(e),
    },
    enlace: {
      minutos: 15,
      porIp: entero(e, "GEMELO_ENLACE_POR_IP", 10, 1, 1000),
      porCorreo: entero(e, "GEMELO_ENLACE_POR_CORREO", 3, 1, 100),
      ventanaMin: entero(e, "GEMELO_ENLACE_VENTANA_MIN", 15, 1, 1440),
    },
    correo: cargaCorreo(e, produccion),
    ot,
  };
}

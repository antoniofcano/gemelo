// Tokens de un solo uso y de sesión: 32 bytes aleatorios en base64url (43 caracteres). En la base solo va su SHA-256:
// con 256 bits de entropía no hace falta un hash lento, y así una copia de la base no permite entrar.
import { createHash, hkdfSync, randomBytes } from "node:crypto";

export const PATRON_TOKEN = "^[A-Za-z0-9_-]{43}$";
const RE_TOKEN = new RegExp(PATRON_TOKEN);

export function nuevoToken(): string {
  return randomBytes(32).toString("base64url");
}
export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}
export function pareceToken(s: unknown): s is string {
  return typeof s === "string" && RE_TOKEN.test(s);
}
/** Para qué se usa una clave derivada del secreto del servidor (auditoría A-07: una clave por uso). */
export type UsoDeClave = "vinculo" | "baja-avisos";
const derivadas = new Map<string, Buffer>();
/**
 * Clave de 256 bits para un uso, derivada con HKDF-SHA256 (node:crypto) del secreto del servidor (GEMELO_SESION_SECRETO) con la etiqueta
 * del uso: el HMAC de los códigos de vínculo y la firma de las bajas de los avisos no comparten clave con la cookie ni entre sí. La cookie
 * sigue firmándose con el secreto tal cual (cambiarlo cerraría todas las sesiones vivas). Sin variables nuevas: la misma raíz.
 */
export function claveDeUso(secreto: string, uso: UsoDeClave): Buffer {
  const k = uso + ":" + secreto;
  let c = derivadas.get(k);
  if (!c) { c = Buffer.from(hkdfSync("sha256", secreto, "gemelo", "gemelo/" + uso, 32)); derivadas.set(k, c); }
  return c;
}

/** Huella corta y no reversible (para claves de límites y registros): nunca el dato en claro. */
export function huella(s: string): string {
  return createHash("sha256").update("gemelo:" + s, "utf8").digest("base64url").slice(0, 16);
}

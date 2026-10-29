// Tokens de un solo uso y de sesión: 32 bytes aleatorios en base64url (43 caracteres). En la base solo va su SHA-256:
// con 256 bits de entropía no hace falta un hash lento, y así una copia de la base no permite entrar.
import { createHash, randomBytes } from "node:crypto";

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
/** Huella corta y no reversible (para claves de límites y registros): nunca el dato en claro. */
export function huella(s: string): string {
  return createHash("sha256").update("gemelo:" + s, "utf8").digest("base64url").slice(0, 16);
}

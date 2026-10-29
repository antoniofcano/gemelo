// Contexto de pruebas: configuración sintética (correos @example.com, nada real), buzón en memoria y grabación de OT.
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";
import pg from "pg";
import { BuzonDePruebas } from "../../src/auth/correo.ts";
import { cargaConfig, type Config } from "../../src/config.ts";
import type { Contexto } from "../../src/contexto.ts";
import { LectorGrabado } from "../../src/ot/lector-grabado.ts";

export const ORIGEN = "https://gemelo.example.com";
export const GRABACIONES = fileURLToPath(new URL("../grabaciones/", import.meta.url));

export function configDePrueba(extra: Record<string, string> = {}): Config {
  return cargaConfig({
    NODE_ENV: "test",
    GEMELO_URL_PUBLICA: ORIGEN,
    GEMELO_DB_URL: "postgresql://gemelo_api@127.0.0.1:1/gemelo",
    GEMELO_CORREO: "buzon",
    GEMELO_API_REGISTRO: "silent",
    GEMELO_API_PROXIES: "1",
    ...extra,
  });
}

/** Registro capturado en memoria (para comprobar que no se escapan tokens, cookies ni correos). */
export class Registro extends Writable {
  lineas: string[] = [];
  override _write(trozo: Buffer, _c: string, hecho: () => void) { this.lineas.push(trozo.toString("utf8")); hecho(); }
  get texto() { return this.lineas.join(""); }
}

export function contexto(bd: pg.Pool, config = configDePrueba()): Contexto & { cartero: BuzonDePruebas; lector: LectorGrabado } {
  return { config, bd, cartero: new BuzonDePruebas(), lector: new LectorGrabado(GRABACIONES) };
}

/** Cabeceras de una petición del navegador a través de Caddy (https y del mismo origen). */
export function deLaWeb(extra: Record<string, string> = {}): Record<string, string> {
  return { origin: ORIGEN, "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.7", ...extra };
}

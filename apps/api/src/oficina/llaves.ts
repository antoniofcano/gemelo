// Llave de acceso (WebAuthn, passkey) de las cuentas de oficina (OF13, ADR-0024, decisión 105; contratos/sesion.md § Llave de
// acceso; migración 0013). La criptografía y las comprobaciones de WebAuthn son de @simplewebauthn/server (regla 12): aquí solo
// se decide quién puede qué, se guarda lo que la librería devuelve y se ata cada ceremonia a la sesión que la pidió.
//   - alta:    la primera vez con la sesión del enlace (aparato aprobado); después, solo desde una sesión abierta con llave, o si
//              un `admin` rehabilitó el alta (24 h) o se hizo desde la consola del servidor (RUNBOOK-VPS). Nunca hay otra puerta.
//   - entrada: una aserción con verificación de la persona (huella, cara o PIN) de una llave viva de la propia cuenta; abre la
//              sesión de oficina y es la «confirmación reciente».
import { randomBytes } from "node:crypto";
import {
  type AuthenticationResponseJSON, generateAuthenticationOptions, generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON, type RegistrationResponseJSON,
  verifyAuthenticationResponse, verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { Bd, Cliente } from "../bd/pool.ts";
import type { ConfigLlave } from "../config.ts";

/** Un reto vale 5 minutos y una sola vez. */
export const MIN_RETO = 5;
/** Lo que dura una rehabilitación del alta hecha por un `admin`. */
export const HORAS_REHABILITADA = 24;
/** Llaves vivas por cuenta (de sobra: el portátil, el teléfono, una llave física de repuesto…). */
export const MAX_LLAVES = 10;
/** Lo que el navegador tiene para que la persona use la llave (también el plazo del reto). */
export const TIEMPO_MS = MIN_RETO * 60_000;
const TRANSPORTS = new Set(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);

export type Ceremonia = "alta" | "entrada";
export interface LlaveGuardada { id: number; credencialId: string; clavePublica: Uint8Array; contador: number; transports: string[] }
export interface LlaveNueva { credencialId: string; clavePublica: Uint8Array; contador: number; transports: string[]; respaldada: boolean }
export type Fallo = { ok: false; motivo: string };

// ---------------------------------------------------------------- reglas (puras)

export interface EstadoLlaves {
  /** llaves vivas de la cuenta */
  activas: number;
  /** llaves que tuvo alguna vez (vivas o revocadas) */
  algunaVez: number;
  rehabilitadaHasta: Date | null;
}
export type PermisoAlta = "si" | "entra_con_llave" | "maximo";

/**
 * ¿Puede esta sesión dar de alta una llave? Desde una sesión abierta con llave, sí (otra llave más). Sin llave, solo si la cuenta
 * nunca tuvo ninguna (la primera vez, con el enlace y el aparato aprobado) o si tiene el alta rehabilitada y sin caducar.
 * Una cuenta que perdió sus llaves no vuelve sola a «la primera vez»: lo decide un `admin` o la consola (sin puerta trasera).
 */
export function permisoAlta(sesionConLlave: boolean, e: EstadoLlaves, ahora: Date = new Date()): PermisoAlta {
  if (e.activas >= MAX_LLAVES) return "maximo";
  if (sesionConLlave) return "si";
  if (e.algunaVez === 0) return "si";
  if (e.rehabilitadaHasta && e.rehabilitadaHasta.getTime() > ahora.getTime()) return "si";
  return "entra_con_llave";
}

/** Solo los transports que define WebAuthn (son pistas para el navegador; lo demás se tira). */
export const limpiaTransports = (t: unknown): string[] =>
  Array.isArray(t) ? [...new Set(t.filter((x): x is string => typeof x === "string" && TRANSPORTS.has(x)))] : [];

/** El nombre que le da la persona, recortado; si no da ninguno, el del aparato. */
export function nombreDeLlave(nombre: string | undefined, porDefecto: string): string {
  const n = (nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  return n || porDefecto.slice(0, 40) || "Llave";
}

// ---------------------------------------------------------------- ceremonias (envoltorios finos de @simplewebauthn/server)

export function opcionesDeAlta(c: ConfigLlave, cuenta: { usuario: Uint8Array; correo: string }, existentes: Pick<LlaveGuardada, "credencialId" | "transports">[]): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: c.rpNombre, rpID: c.rpId,
    userName: cuenta.correo, userDisplayName: cuenta.correo, userID: new Uint8Array(cuenta.usuario),
    attestationType: "none",
    excludeCredentials: existentes.map(l => ({ id: l.credencialId, transports: l.transports })),
    // la llave se queda en el aparato si puede (entrar sin escribir el correo) y siempre pide a la persona (huella, cara o PIN)
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    timeout: TIEMPO_MS,
  });
}

export async function verificaAlta(c: ConfigLlave, respuesta: RegistrationResponseJSON, reto: string): Promise<{ ok: true; llave: LlaveNueva } | Fallo> {
  try {
    const v = await verifyRegistrationResponse({ response: respuesta, expectedChallenge: reto, expectedOrigin: c.origen, expectedRPID: c.rpId, requireUserVerification: true });
    if (!v.verified) return { ok: false, motivo: "no_verificada" };
    const k = v.registrationInfo.credential;
    return { ok: true, llave: { credencialId: k.id, clavePublica: k.publicKey, contador: k.counter, transports: limpiaTransports(respuesta.response.transports ?? k.transports), respaldada: v.registrationInfo.credentialBackedUp } };
  } catch (e) {
    return { ok: false, motivo: motivoDe(e) };
  }
}

export function opcionesDeEntrada(c: ConfigLlave, llaves: Pick<LlaveGuardada, "credencialId" | "transports">[]): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({
    rpID: c.rpId,
    allowCredentials: llaves.map(l => ({ id: l.credencialId, transports: l.transports })),
    userVerification: "required",
    timeout: TIEMPO_MS,
  });
}

export async function verificaEntrada(c: ConfigLlave, respuesta: AuthenticationResponseJSON, reto: string, llave: LlaveGuardada): Promise<{ ok: true; contador: number } | Fallo> {
  try {
    const v = await verifyAuthenticationResponse({
      response: respuesta, expectedChallenge: reto, expectedOrigin: c.origen, expectedRPID: c.rpId, requireUserVerification: true,
      credential: { id: llave.credencialId, publicKey: new Uint8Array(llave.clavePublica), counter: llave.contador, transports: llave.transports },
    });
    if (!v.verified) return { ok: false, motivo: "no_verificada" };
    return { ok: true, contador: v.authenticationInfo.newCounter };
  } catch (e) {
    return { ok: false, motivo: motivoDe(e) };
  }
}

/** Un motivo corto para la auditoría (nunca la respuesta ni la clave). */
function motivoDe(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (/counter/i.test(m)) return "contador";
  if (/challenge/i.test(m)) return "reto";
  if (/origin/i.test(m)) return "origen";
  if (/RP ID|rpID|rpIdHash/i.test(m)) return "rp_id";
  if (/user verification|user could not be verified|verified/i.test(m)) return "sin_verificacion";
  if (/signature/i.test(m)) return "firma";
  return "no_valida";
}

// ---------------------------------------------------------------- base de datos

export async function estadoLlaves(bd: Bd | Cliente, hogarId: number): Promise<EstadoLlaves> {
  const r = await bd.query<{ activas: string; alguna_vez: string; rehabilitada_hasta: Date | null }>(
    `SELECT (SELECT count(*) FROM llaves_oficina WHERE hogar_id = h.id AND revocada_en IS NULL) AS activas,
            (SELECT count(*) FROM llaves_oficina WHERE hogar_id = h.id) AS alguna_vez, h.llave_rehabilitada_hasta AS rehabilitada_hasta
       FROM hogares h WHERE h.id = $1`, [hogarId]);
  const f = r.rows[0];
  return { activas: Number(f?.activas ?? 0), algunaVez: Number(f?.alguna_vez ?? 0), rehabilitadaHasta: f?.rehabilitada_hasta ?? null };
}

/** Las llaves vivas de una cuenta (para excluirlas al dar de alta y para permitirlas al entrar). */
export async function llavesVivas(bd: Bd | Cliente, hogarId: number): Promise<LlaveGuardada[]> {
  const r = await bd.query<{ id: string; credencial_id: string; clave_publica: Buffer; contador: string; transports: string[] }>(
    "SELECT id, credencial_id, clave_publica, contador, transports FROM llaves_oficina WHERE hogar_id = $1 AND revocada_en IS NULL ORDER BY id", [hogarId]);
  return r.rows.map(f => ({ id: Number(f.id), credencialId: f.credencial_id, clavePublica: new Uint8Array(f.clave_publica), contador: Number(f.contador), transports: f.transports ?? [] }));
}

/** El «user handle» de la cuenta: 32 bytes al azar, estables (se crean la primera vez). */
export async function usuarioDeLlave(bd: Bd, hogarId: number): Promise<{ usuario: Uint8Array; correo: string } | null> {
  const r = await bd.query<{ llave_usuario: Buffer; correo: string }>(
    "UPDATE hogares SET llave_usuario = coalesce(llave_usuario, $2) WHERE id = $1 AND activo RETURNING llave_usuario, correo", [hogarId, randomBytes(32)]);
  const f = r.rows[0];
  return f ? { usuario: new Uint8Array(f.llave_usuario), correo: f.correo } : null;
}

/** Guarda el reto de una ceremonia para esta sesión (el anterior del mismo tipo se pisa). */
export async function guardaReto(bd: Bd, sesionId: number, tipo: Ceremonia, reto: string): Promise<void> {
  await bd.query(
    `INSERT INTO llaves_retos (sesion_id, tipo, reto, expira_en) VALUES ($1, $2, $3, now() + make_interval(mins => $4))
     ON CONFLICT (sesion_id, tipo) DO UPDATE SET reto = EXCLUDED.reto, expira_en = EXCLUDED.expira_en`, [sesionId, tipo, reto, MIN_RETO]);
}

/** Gasta el reto de la sesión (una sola vez): null si no hay o caducó. */
export async function gastaReto(bd: Bd | Cliente, sesionId: number, tipo: Ceremonia): Promise<string | null> {
  const r = await bd.query<{ reto: string; vivo: boolean }>(
    "DELETE FROM llaves_retos WHERE sesion_id = $1 AND tipo = $2 RETURNING reto, expira_en > now() AS vivo", [sesionId, tipo]);
  const f = r.rows[0];
  return f && f.vivo ? f.reto : null;
}

/** La sesión queda abierta (o confirmada) con esta llave: cuenta como confirmación reciente. */
export async function marcaSesionConLlave(bd: Bd | Cliente, sesionId: number, hogarId: number, llaveId: number): Promise<void> {
  await bd.query("UPDATE sesiones SET llave_id = $2, confirmada_en = now() WHERE id = $1 AND hogar_id = $3 AND revocada_en IS NULL", [sesionId, llaveId, hogarId]);
}

/** Revoca una llave y cierra en el acto las sesiones que se abrieron o confirmaron con ella. null si no existía o ya estaba revocada. */
export async function revocaLlave(bd: Bd | Cliente, id: number, por: number): Promise<number | null> {
  const r = await bd.query("UPDATE llaves_oficina SET revocada_en = now(), revocada_por = $2 WHERE id = $1 AND revocada_en IS NULL", [id, por]);
  if (!r.rowCount) return null;
  const s = await bd.query("UPDATE sesiones SET revocada_en = now() WHERE llave_id = $1 AND revocada_en IS NULL", [id]);
  return s.rowCount ?? 0;
}

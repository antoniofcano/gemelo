// Llaves de acceso (WebAuthn, passkeys) de TODAS las cuentas (ADR-0029, doc/sistema/LLAVES-DE-ACCESO.md; antes solo de la
// oficina: OF13, ADR-0024, decisión 105; contratos/sesion.md § Llave de acceso; migraciones 0013 y 0021). La criptografía y las
// comprobaciones de WebAuthn son de @simplewebauthn/server (regla 12): aquí solo se decide quién puede qué, se guarda lo que la
// librería devuelve y se ata cada ceremonia a la sesión (o, sin sesión, al navegador) que la pidió.
//   - alta:    por tipo de CUENTA (hogares.rol, nunca el rol efectivo de la sesión): una familia, desde cualquier sesión titular
//              (enlace o llave), también si ya tiene llaves (decisión 183), y se le avisa por correo (decisión 187); la oficina,
//              como en OF13: la primera vez con la sesión del enlace y el aparato aprobado; después, solo desde una sesión con
//              llave, o si un `admin` rehabilitó el alta (24 h) o se hizo desde la consola del servidor (RUNBOOK-VPS).
//   - entrada (con sesión): una aserción de una llave viva de la propia cuenta; para la oficina abre la sesión y es la
//              «confirmación reciente» (OF13).
//   - acceso (SIN sesión ni correo): credencial descubrible; el reto se ata al navegador por el SHA-256 de un valor al azar que
//              la ruta pone en la cookie `__Host-gemelo-reto`; la credencial se busca en todas las cuentas y su `userHandle` tiene
//              que ser el de la cuenta dueña. Un fallo es siempre el mismo, sin decir por qué (no se enumera nada).
// Las rutas son de OF13b-4 (`/api/yo/llaves`) y OF13b-5 (`/api/auth/llave`); este módulo no abre ni toca sesiones de acceso.
import { generateKeyPairSync, randomBytes, timingSafeEqual } from "node:crypto";
import {
  type AuthenticationResponseJSON, generateAuthenticationOptions, generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON, type RegistrationResponseJSON,
  verifyAuthenticationResponse, verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { audita, esOficina, type Rol } from "../auth/servicio.ts";
import { type Bd, type Cliente, enTransaccion } from "../bd/pool.ts";
import type { ConfigLlave } from "../config.ts";
import { hashToken, nuevoToken, pareceToken } from "../seguridad/cripto.ts";

/** Un reto vale 5 minutos y una sola vez. */
export const MIN_RETO = 5;
/** Lo que dura una rehabilitación del alta hecha por un `admin`. */
export const HORAS_REHABILITADA = 24;
/** Llaves vivas por cuenta (de sobra: el portátil, el teléfono, una llave física de repuesto…). */
export const MAX_LLAVES = 10;
/** Lo que el navegador tiene para que la persona use la llave (también el plazo del reto). */
export const TIEMPO_MS = MIN_RETO * 60_000;
/** El nombre del sitio que enseña el aparato a una familia (el de la oficina viene de la configuración). */
export const RP_NOMBRE_FAMILIA = "Cuarenta hazas";
const TRANSPORTS = new Set(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
const RE_B64U = /^[A-Za-z0-9_-]{1,1366}$/;

export type Ceremonia = "alta" | "entrada";
export type OrigenSesion = "enlace" | "vinculo" | "llave";
export type TipoCuenta = "familia" | "oficina";
export interface LlaveGuardada { id: number; credencialId: string; clavePublica: Uint8Array; contador: number; transports: string[] }
export interface LlaveNueva { credencialId: string; clavePublica: Uint8Array; contador: number; transports: string[]; respaldada: boolean; descubrible: boolean }
export type Fallo = { ok: false; motivo: string };

// ---------------------------------------------------------------- reglas (puras)

/** El tipo de cuenta sale del rol de la CUENTA: una cuenta de oficina entrando con las gafas (rol efectivo `hogar`) sigue siendo oficina. */
export const tipoDeCuenta = (rolCuenta: Rol): TipoCuenta => (esOficina(rolCuenta) ? "oficina" : "familia");

export interface EstadoLlaves {
  /** llaves vivas de la cuenta */
  activas: number;
  /** llaves que tuvo alguna vez (vivas o revocadas) */
  algunaVez: number;
  rehabilitadaHasta: Date | null;
  /** rol de la cuenta (hogares.rol); null si la cuenta no existe o está de baja */
  rol: Rol | null;
}
/** Lo que importa de la sesión que pide el alta. */
export interface SesionDeAlta {
  origen: OrigenSesion;
  /** la sesión se abrió o se confirmó con una llave viva (sesiones.llave_id) */
  conLlave: boolean;
  /** solo cuenta en la oficina: el aparato confiable está aprobado */
  aparatoAprobado: boolean;
}
export type PermisoAlta = "si" | "entra_con_llave" | "maximo" | "no_titular" | "aparato_pendiente" | "sin_cuenta";
export interface DecisionAlta {
  permiso: PermisoAlta;
  tipo: TipoCuenta | null;
  /** la ruta manda el correo de aviso «se ha añadido una llave» al dar el alta (decisión 187); aquí no se envía nada */
  avisar: boolean;
  /** llaves vivas que ya tenía (para el texto del aviso) */
  yaTenia: number;
}

/**
 * ¿Puede esta sesión dar de alta una llave en esta cuenta?
 *  - Nunca desde las gafas (sesión `vinculo`, también la de una cuenta de oficina) ni en una cuenta de baja; nunca más de MAX_LLAVES.
 *  - Familia: sí desde una sesión titular (enlace o llave), aunque ya tenga otras: el buzón es la raíz (decisión 183, A2 del estudio).
 *  - Oficina: con el aparato aprobado (una llave no aprueba un aparato: decisión 184) y, sin llave en la sesión, solo si la cuenta
 *    nunca tuvo ninguna (la primera vez con el enlace) o tiene el alta rehabilitada y sin caducar. Una cuenta que perdió sus llaves
 *    no vuelve sola a «la primera vez»: lo decide un `admin` o la consola (sin puerta trasera, OF13).
 */
export function permisoAlta(s: SesionDeAlta, e: EstadoLlaves, ahora: Date = new Date()): DecisionAlta {
  const tipo = e.rol ? tipoDeCuenta(e.rol) : null;
  const decide = (permiso: PermisoAlta): DecisionAlta => ({ permiso, tipo, avisar: permiso === "si", yaTenia: e.activas });
  if (!tipo) return decide("sin_cuenta");
  if (s.origen === "vinculo") return decide("no_titular");
  if (e.activas >= MAX_LLAVES) return decide("maximo");
  if (tipo === "familia") return decide("si");
  if (!s.aparatoAprobado) return decide("aparato_pendiente");
  if (s.conLlave) return decide("si");
  if (e.algunaVez === 0) return decide("si");
  if (e.rehabilitadaHasta && e.rehabilitadaHasta.getTime() > ahora.getTime()) return decide("si");
  return decide("entra_con_llave");
}

/** Solo los transports que define WebAuthn (son pistas para el navegador; lo demás se tira). */
export const limpiaTransports = (t: unknown): string[] =>
  Array.isArray(t) ? [...new Set(t.filter((x): x is string => typeof x === "string" && TRANSPORTS.has(x)))] : [];

/** El nombre que le da la persona, recortado; si no da ninguno, el del aparato. */
export function nombreDeLlave(nombre: string | undefined, porDefecto: string): string {
  const n = (nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  return n || porDefecto.slice(0, 40) || "Llave";
}

/**
 * ¿Es descubrible (residente) la llave recién creada? Las opciones piden `residentKey: "required"`: un navegador que cumple la
 * norma no crea otra cosa (falla antes). Por eso se toma por descubrible salvo que la extensión `credProps` diga expresamente
 * que no (`rk: false`); muchos aparatos no devuelven `credProps` aunque la llave sí lo sea. Es un dato del cliente, sin firmar:
 * sirve para enseñarlo, nunca para decidir un permiso.
 */
export const esDescubrible = (r: Pick<RegistrationResponseJSON, "clientExtensionResults">): boolean =>
  r.clientExtensionResults?.credProps?.rk !== false;

/** El `userHandle` de la respuesta (base64url) es exactamente el de la cuenta, comparado en tiempo constante. */
export function mismoUsuario(userHandle: unknown, usuario: Uint8Array | null | undefined): boolean {
  if (typeof userHandle !== "string" || !RE_B64U.test(userHandle) || !usuario || usuario.length === 0) return false;
  const b = Buffer.from(userHandle, "base64url");
  if (b.length !== usuario.length || b.toString("base64url") !== userHandle) return false;
  return timingSafeEqual(b, Buffer.from(usuario));
}

// ---------------------------------------------------------------- ceremonias (envoltorios finos de @simplewebauthn/server)

export interface CuentaDeLlave { usuario: Uint8Array; correo: string; rol: Rol }

/**
 * Opciones para crear una llave: residente obligatoria (entrar sin escribir el correo), verificación de la persona obligatoria
 * (huella, cara o PIN), attestation `none`, el `user handle` de la cuenta (hogares.llave_usuario, 32 bytes al azar) y, como
 * nombre de la cuenta en el aparato, el correo (decisión 185). Excluye las llaves vivas de la cuenta. La librería añade siempre
 * la extensión `credProps` (para saber si quedó residente).
 */
export function opcionesDeAlta(c: ConfigLlave, cuenta: CuentaDeLlave, existentes: Pick<LlaveGuardada, "credencialId" | "transports">[]): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: esOficina(cuenta.rol) ? c.rpNombre : RP_NOMBRE_FAMILIA, rpID: c.rpId,
    userName: cuenta.correo, userDisplayName: cuenta.correo, userID: new Uint8Array(cuenta.usuario),
    attestationType: "none",
    excludeCredentials: existentes.map(l => ({ id: l.credencialId, transports: l.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    extensions: { credProps: true },
    timeout: TIEMPO_MS,
  });
}

export async function verificaAlta(c: ConfigLlave, respuesta: RegistrationResponseJSON, reto: string): Promise<{ ok: true; llave: LlaveNueva } | Fallo> {
  try {
    const v = await verifyRegistrationResponse({ response: respuesta, expectedChallenge: reto, expectedOrigin: c.origen, expectedRPID: c.rpId, requireUserVerification: true });
    if (!v.verified) return { ok: false, motivo: "no_verificada" };
    const k = v.registrationInfo.credential;
    return { ok: true, llave: {
      credencialId: k.id, clavePublica: k.publicKey, contador: k.counter, transports: limpiaTransports(respuesta.response.transports ?? k.transports),
      respaldada: v.registrationInfo.credentialBackedUp, descubrible: esDescubrible(respuesta),
    } };
  } catch (e) {
    return { ok: false, motivo: motivoDe(e) };
  }
}

/** Opciones para usar una llave conocida de la cuenta de la sesión (la oficina, OF13; también las llaves no descubribles). */
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
  const r = await bd.query<{ activas: string; alguna_vez: string; rehabilitada_hasta: Date | null; rol: Rol; activo: boolean }>(
    `SELECT (SELECT count(*) FROM llaves_acceso WHERE hogar_id = h.id AND revocada_en IS NULL) AS activas,
            (SELECT count(*) FROM llaves_acceso WHERE hogar_id = h.id) AS alguna_vez, h.llave_rehabilitada_hasta AS rehabilitada_hasta,
            h.rol::text AS rol, h.activo
       FROM hogares h WHERE h.id = $1`, [hogarId]);
  const f = r.rows[0];
  return { activas: Number(f?.activas ?? 0), algunaVez: Number(f?.alguna_vez ?? 0), rehabilitadaHasta: f?.rehabilitada_hasta ?? null, rol: f && f.activo ? f.rol : null };
}

/** Las llaves vivas de una cuenta (para excluirlas al dar de alta y para permitirlas al entrar). */
export async function llavesVivas(bd: Bd | Cliente, hogarId: number): Promise<LlaveGuardada[]> {
  const r = await bd.query<{ id: string; credencial_id: string; clave_publica: Buffer; contador: string; transports: string[] }>(
    "SELECT id, credencial_id, clave_publica, contador, transports FROM llaves_acceso WHERE hogar_id = $1 AND revocada_en IS NULL ORDER BY id", [hogarId]);
  return r.rows.map(f => ({ id: Number(f.id), credencialId: f.credencial_id, clavePublica: new Uint8Array(f.clave_publica), contador: Number(f.contador), transports: f.transports ?? [] }));
}

/** El «user handle» de la cuenta: 32 bytes al azar, estables (se crean la primera vez). Con el correo y el rol de la cuenta. */
export async function usuarioDeLlave(bd: Bd, hogarId: number): Promise<CuentaDeLlave | null> {
  const r = await bd.query<{ llave_usuario: Buffer; correo: string; rol: Rol }>(
    "UPDATE hogares SET llave_usuario = coalesce(llave_usuario, $2) WHERE id = $1 AND activo RETURNING llave_usuario, correo, rol::text AS rol", [hogarId, randomBytes(32)]);
  const f = r.rows[0];
  return f ? { usuario: new Uint8Array(f.llave_usuario), correo: f.correo, rol: f.rol } : null;
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
  const r = await bd.query("UPDATE llaves_acceso SET revocada_en = now(), revocada_por = $2 WHERE id = $1 AND revocada_en IS NULL", [id, por]);
  if (!r.rowCount) return null;
  const s = await bd.query("UPDATE sesiones SET revocada_en = now() WHERE llave_id = $1 AND revocada_en IS NULL", [id]);
  return s.rowCount ?? 0;
}

// ---------------------------------------------------------------- alta (cualquier cuenta)

export interface AltaPedida {
  hogarId: number;
  sesionId: number;
  sesion: SesionDeAlta;
  /** lo que devolvió verificaAlta */
  llave: LlaveNueva;
  nombre: string;
  /** aparato de oficina desde el que se da de alta (nulo en las familias) */
  aparatoId: number | null;
}
export type AltaHecha = { ok: true; id: number; tipo: TipoCuenta; avisar: boolean; yaTenia: number } | { ok: false; error: Exclude<PermisoAlta, "si"> | "repetida" };

/**
 * Guarda la llave ya verificada, en una transacción y con la cuenta bloqueada: el permiso se vuelve a mirar (dos altas a la vez no
 * se cuelan; entre las opciones y el alta pudo cambiar), la credencial no puede estar ya en ninguna cuenta, se gasta la
 * rehabilitación y la sesión queda abierta con la llave nueva. Audita `oficina.llave_alta` o `llave.alta` (nunca el id de
 * credencial ni el correo). Si `avisar`, la ruta manda el correo de aviso.
 */
export async function registraLlave(bd: Bd, p: AltaPedida): Promise<AltaHecha> {
  return enTransaccion(bd, async t => {
    await t.query("SELECT id FROM hogares WHERE id = $1 FOR UPDATE", [p.hogarId]);
    const d = permisoAlta(p.sesion, await estadoLlaves(t, p.hogarId));
    if (d.permiso !== "si" || !d.tipo) return { ok: false, error: d.permiso === "si" ? "sin_cuenta" : d.permiso } as const;
    const ya = await t.query("SELECT 1 FROM llaves_acceso WHERE credencial_id = $1", [p.llave.credencialId]);
    if (ya.rowCount) return { ok: false, error: "repetida" } as const;
    const i = await t.query<{ id: string }>(
      `INSERT INTO llaves_acceso (hogar_id, credencial_id, clave_publica, contador, transports, nombre, respaldada, descubrible, aparato_id, ultima_vez_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now()) RETURNING id`,
      [p.hogarId, p.llave.credencialId, Buffer.from(p.llave.clavePublica), p.llave.contador, p.llave.transports, p.nombre, p.llave.respaldada, p.llave.descubrible,
        d.tipo === "oficina" ? p.aparatoId : null]);
    const id = Number(i.rows[0]!.id);
    await t.query("UPDATE hogares SET llave_rehabilitada_hasta = NULL WHERE id = $1", [p.hogarId]);
    await marcaSesionConLlave(t, p.sesionId, p.hogarId, id);
    if (d.tipo === "oficina") await audita(t, p.hogarId, "oficina.llave_alta", { llave: id, aparato: p.aparatoId, respaldada: p.llave.respaldada, descubrible: p.llave.descubrible });
    else await audita(t, p.hogarId, "llave.alta", { llave: id, respaldada: p.llave.respaldada, descubrible: p.llave.descubrible, ya_tenia: d.yaTenia });
    return { ok: true, id, tipo: d.tipo, avisar: d.avisar, yaTenia: d.yaTenia } as const;
  });
}

// ---------------------------------------------------------------- acceso sin sesión ni correo (credencial descubrible)

/**
 * Opciones para entrar con una llave SIN sesión: sin `allowCredentials` (el aparato elige la llave descubrible) y con la
 * verificación de la persona obligatoria. El reto se guarda atado al navegador: `claveEnClaro` (32 bytes al azar, base64url) es lo
 * que la ruta pone en la cookie `__Host-gemelo-reto`; en la base solo va su SHA-256. Un uso y 5 minutos.
 */
export async function opcionesDeAcceso(bd: Bd | Cliente, c: ConfigLlave): Promise<{ opciones: PublicKeyCredentialRequestOptionsJSON; claveEnClaro: string }> {
  const opciones = await generateAuthenticationOptions({ rpID: c.rpId, userVerification: "required", timeout: TIEMPO_MS });
  const claveEnClaro = nuevoToken();
  await bd.query(
    "INSERT INTO llaves_retos (sesion_id, tipo, reto, clave, expira_en) VALUES (NULL, 'acceso', $1, $2, now() + make_interval(mins => $3))",
    [opciones.challenge, hashToken(claveEnClaro), MIN_RETO]);
  return { opciones, claveEnClaro };
}

/** Gasta el reto sin sesión de ESTE navegador (por el hash de su cookie): una sola vez; null si no hay, caducó o la cookie no vale. */
export async function gastaRetoDeAcceso(bd: Bd | Cliente, claveEnClaro: unknown): Promise<string | null> {
  if (!pareceToken(claveEnClaro)) return null;
  const r = await bd.query<{ reto: string; vivo: boolean }>(
    "DELETE FROM llaves_retos WHERE clave = $1 AND tipo = 'acceso' RETURNING reto, expira_en > now() AS vivo", [hashToken(claveEnClaro)]);
  const f = r.rows[0];
  return f && f.vivo ? f.reto : null;
}

export type AccesoConLlave = { ok: true; hogarId: number; rol: Rol; llaveId: number } | { ok: false };
/** El único fallo que sale de aquí: no dice si la llave no existe, está revocada, es de una cuenta de baja o la firma es mala. */
export const FALLO_ACCESO: { ok: false } = Object.freeze({ ok: false as const });

/** Una clave pública de señuelo (COSE, P-256) para verificar igual cuando la credencial no es de nadie: el tiempo no lo delata. */
let senuelo: Uint8Array | null = null;
function claveSenuelo(): Uint8Array {
  if (!senuelo) {
    const jwk = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ format: "jwk" });
    senuelo = isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, "base64url")], [-3, Buffer.from(jwk.y!, "base64url")]]));
  }
  return senuelo;
}

/**
 * Entrada con llave SIN sesión ni correo. Gasta el reto de este navegador (siempre, también si luego falla), busca la credencial
 * por su id en TODAS las cuentas (llave viva, cuenta activa), verifica con @simplewebauthn/server (firma, reto, origen, RP ID,
 * verificación de la persona y contador: el 0 de una llave sincronizada vale mientras no haya subido antes) y exige que el
 * `userHandle` de la respuesta sea el `llave_usuario` de la MISMA cuenta dueña de la credencial. Si la credencial no es de
 * nadie, se verifica igual contra una clave de señuelo, para que el tiempo no distinga los dos casos. Actualiza el contador y la
 * última vez (sin bajar nunca el contador, aunque dos entradas lleguen a la vez) y audita `llave.acceso` o `llave.acceso_fallido`
 * (con el motivo, solo en la auditoría). No abre sesión: eso es de la ruta (OF13b-5), con la cuenta que devuelve.
 */
export async function entraConLlave(bd: Bd, c: ConfigLlave, claveEnClaro: unknown, respuesta: AuthenticationResponseJSON): Promise<AccesoConLlave> {
  const reto = await gastaRetoDeAcceso(bd, claveEnClaro);
  if (!reto) return FALLO_ACCESO;
  const credencialId = typeof respuesta?.id === "string" && RE_B64U.test(respuesta.id) ? respuesta.id : "";
  const r = credencialId ? await bd.query<{ id: string; hogar_id: string; credencial_id: string; clave_publica: Buffer; contador: string; transports: string[]; rol: Rol; llave_usuario: Buffer | null }>(
    `SELECT l.id, l.hogar_id, l.credencial_id, l.clave_publica, l.contador, l.transports, h.rol::text AS rol, h.llave_usuario
       FROM llaves_acceso l JOIN hogares h ON h.id = l.hogar_id
      WHERE l.credencial_id = $1 AND l.revocada_en IS NULL AND h.activo`, [credencialId]) : { rows: [] };
  const f = r.rows[0];
  const llave: LlaveGuardada = f
    ? { id: Number(f.id), credencialId: f.credencial_id, clavePublica: new Uint8Array(f.clave_publica), contador: Number(f.contador), transports: f.transports ?? [] }
    : { id: 0, credencialId: credencialId || "AAAAAAAAAAAAAAAAAAAAAA", clavePublica: claveSenuelo(), contador: 0, transports: [] };
  const v = await verificaEntrada(c, respuesta, reto, llave);
  const usuarioOk = mismoUsuario(respuesta?.response?.userHandle, f?.llave_usuario ? new Uint8Array(f.llave_usuario) : null);
  const hogarId = f ? Number(f.hogar_id) : null;
  if (!f || !v.ok || !usuarioOk) {
    await audita(bd, hogarId, "llave.acceso_fallido", { motivo: !f ? "desconocida" : !v.ok ? v.motivo : "usuario", llave: f ? llave.id : null });
    return FALLO_ACCESO;
  }
  // el contador nunca baja: si otra entrada lo subió entretanto (o se revocó la llave), esta no vale
  const u = await bd.query(
    "UPDATE llaves_acceso SET contador = $2, ultima_vez_en = now() WHERE id = $1 AND revocada_en IS NULL AND (contador < $2 OR (contador = 0 AND $2 = 0))",
    [llave.id, v.contador]);
  if (!u.rowCount) {
    await audita(bd, hogarId, "llave.acceso_fallido", { motivo: "contador", llave: llave.id });
    return FALLO_ACCESO;
  }
  await audita(bd, hogarId, "llave.acceso", { llave: llave.id, rol: f.rol });
  return { ok: true, hogarId: hogarId!, rol: f.rol, llaveId: llave.id };
}

// Presencia compartida (F2) del lado del servidor: el token de LiveKit (sala, identidad opaca, permisos del rol) y la
// expulsión con RoomService. Contratos: contratos/livekit-roles.json (permisos), contratos/presencia.md, api.openapi.yaml.
// La api NO guarda nada de la sala: ni quién entra, ni la pose, ni el chat (decisión 40). Solo la expulsión va a la auditoría.
import { createHmac } from "node:crypto";
import { AccessToken, DataPacket_Kind, RoomServiceClient, type VideoGrant } from "livekit-server-sdk";
import type { Rol } from "../auth/servicio.ts";
import type { ConfigLiveKit } from "../config.ts";

/** Sala fija de la visita libre de Hituelo (decisiones 39 y 60). Las guiadas (sala por visita) llegan con F3. */
export const SALA_LIBRE = "hituelo-libre";
/**
 * OF10: las salas del mundo por su clave (contratos/livekit-roles.json v4, «salas»): la de siempre («general», la visita libre) y la «visita»,
 * a la que la oficina puede invitar a la gente (p. ej. durante una visita en grupo). Las dos son fijas; quién puede entrar en «visita» es hoy
 * cualquiera con sesión (como en la general): restringirla (solo invitados, inscritos en la agenda) es una decisión pendiente de Antonio.
 */
export const SALAS = { general: SALA_LIBRE, visita: "hituelo-visita" } as const;
export type ClaveSala = keyof typeof SALAS;
export const CLAVES_SALA = Object.keys(SALAS) as ClaveSala[];
/** OF10 (decisión 107): la oficina se ve siempre, con la etiqueta «Oficina» y sin nombre propio. La api pone este alias en sus metadatos. */
export const ALIAS_OFICINA = "Oficina";
export const esRolOficina = (r: Rol): boolean => r === "oficina" || r === "admin";
/** OF10: los temas de datos que SOLO manda la api (RoomService.sendData, sin participante): el cliente los acepta solo si no traen participante. */
export const TEMAS_OFICINA = { anuncio: "anuncio", sala: "sala", balizas: "balizas" } as const;
/** Vida del token: solo vale para ENTRAR; una vez dentro, LiveKit renueva la conexión por su cuenta [NO VERIFICADO en la 1.13.11]. */
export const TTL_S = 15 * 60;
export const DISPOSITIVOS = ["escritorio", "movil", "quest"] as const;
export type Dispositivo = (typeof DISPOSITIVOS)[number];

type Permisos = Required<Pick<VideoGrant, "roomJoin" | "canSubscribe" | "canPublish" | "canPublishData" | "canUpdateOwnMetadata" | "hidden" | "roomAdmin">> & { canPublishSources: [] };
const SOLO_DATOS: Permisos = { roomJoin: true, canSubscribe: true, canPublish: false, canPublishData: true, canPublishSources: [], canUpdateOwnMetadata: false, hidden: false, roomAdmin: false };
/**
 * Permisos por rol en F2: copia de contratos/livekit-roles.json («roles»), que es quien manda; la prueba de unidad
 * compara las dos. En F2 los cuatro son iguales (solo datos; sin audio, sin vídeo, sin roomAdmin).
 * canPublishSources va vacío y canPublish a false: según el SDK, «cuando se pone, sustituye a canPublish»; vacío no
 * permite ninguna fuente. Comprobado contra LiveKit 1.13.11 (P4, presencia_dev.test.js): una pista de micrófono no se
 * publica y los datos sí.
 */
export const PERMISOS: Record<Rol, Permisos> = { hogar: SOLO_DATOS, guia: SOLO_DATOS, corresponsal: SOLO_DATOS, oficina: SOLO_DATOS, admin: SOLO_DATOS };

/**
 * Identidad en la sala: opaca, UNA POR SESIÓN (aparato) y con el hogar como prefijo:
 *   h_<22: HMAC del id del hogar>_<8: HMAC del id de la sesión>
 * Así el mismo hogar puede estar a la vez en el ordenador, el móvil y las gafas (cada uno entra con su sesión) sin que
 * LiveKit eche al anterior por identidad repetida, y la api, que recalcula el prefijo, puede sacar a TODAS las
 * conexiones de un hogar (lista los participantes de la sala y quita los que empiezan por él). Dos pestañas de la MISMA
 * sesión comparten identidad: la segunda sustituye a la primera. Ninguna parte es el id de la base, ni el correo, ni el
 * id de la sesión: sin el secreto de LiveKit no se pueden deducir.
 */
export function prefijoHogar(lk: Pick<ConfigLiveKit, "secreto">, hogarId: number): string {
  return "h_" + createHmac("sha256", lk.secreto).update("gemelo-presencia:v1:" + hogarId).digest("base64url").slice(0, 22);
}
export function identidadOpaca(lk: Pick<ConfigLiveKit, "secreto">, hogarId: number, sesionId: string): string {
  return prefijoHogar(lk, hogarId) + "_" + createHmac("sha256", lk.secreto).update("gemelo-presencia:sesion:v1:" + sesionId).digest("base64url").slice(0, 8);
}
/** ¿Esa identidad es de una conexión de ese hogar? (el prefijo tiene longitud fija: no hay ambigüedad con los «_» del base64url) */
export function esDelHogar(identidad: string, prefijo: string): boolean {
  return identidad.length === prefijo.length + 9 && identidad.startsWith(prefijo + "_");
}

/** `vrm` (id del catálogo, contratos/avatares.md) solo viaja si el hogar eligió uno; sin él, el muñeco de bloque. */
export interface Avatar extends Aspecto { camisa: number; sombrero: "ninguno" | "paja" | "gorra"; piel: number; vrm?: string }
/** El aspecto del muñeco (AV2, decisión 131): campos OPCIONALES del contrato `presencia` v1 (un cliente de antes los ignora). Listas cerradas; nada de género.
 *  `tono` indexa los 10 tonos de piel y `arriba`/`abajo` los 10 colores de ropa de la paleta del motor (26_presencia.js, Aspecto). */
export const ASPECTO = {
  tono: { min: 0, max: 9 }, arriba: { min: 0, max: 9 }, abajo: { min: 0, max: 9 }, pelo_color: { min: 0, max: 9 },
  altura: ["baja", "media", "alta"], complexion: ["delgada", "media", "ancha"], movilidad: ["pie", "baston", "andador", "silla"],
} as const;
/** AV4 (ADR-0025, contrato avatares v2): la RECETA del creador por piezas. Ids del catálogo (cuerpo, pelo, vello, ropa y hasta 3 accesorios): la api comprueba solo
 *  su forma (no conoce el catálogo; lo que no esté en él lo trata el cliente como ausente) y que la receta (estos campos) no pase de RECETA_MAX_BYTES de JSON. */
export const PATRON_PIEZA = "^[a-z0-9-]{1,32}$";
export const RECETA_IDS = ["cuerpo", "pelo", "vello", "ropa"] as const;
export const ACC_MAX = 3, RECETA_MAX_BYTES = 200;
export interface Aspecto {
  tono?: number; arriba?: number; abajo?: number; altura?: string; complexion?: string; movilidad?: string;
  cuerpo?: string; pelo?: string; pelo_color?: number; vello?: string; ropa?: string; acc?: string[];
}
/** Deja solo los campos válidos del aspecto (lo que sale de la base se trata como dato, no como orden). */
export function limpiaAspecto(x: unknown): Aspecto {
  const o: Aspecto = {};
  if (!x || typeof x !== "object" || Array.isArray(x)) return o;
  const v = x as Record<string, unknown>;
  for (const k of ["tono", "arriba", "abajo", "pelo_color"] as const) {
    const n = v[k];
    if (typeof n === "number" && Number.isInteger(n) && n >= ASPECTO[k].min && n <= ASPECTO[k].max) o[k] = n;
  }
  for (const k of ["altura", "complexion", "movilidad"] as const) {
    const n = v[k];
    if (typeof n === "string" && (ASPECTO[k] as readonly string[]).includes(n)) o[k] = n;
  }
  const id = new RegExp(PATRON_PIEZA);
  for (const k of RECETA_IDS) {
    const n = v[k];
    if (typeof n === "string" && id.test(n)) o[k] = n;
  }
  if (Array.isArray(v.acc)) {
    const acc = [...new Set(v.acc.filter((x): x is string => typeof x === "string" && id.test(x)))].slice(0, ACC_MAX);
    if (acc.length) o.acc = acc;
  }
  return o;
}
/** Bytes del JSON de la receta (los campos de AV4: lo que el creador añade a los metadatos del token; el aspecto de AV2 son ≤ 100 bytes más, de listas cerradas) */
export function bytesReceta(a: Aspecto): number {
  const r: Record<string, unknown> = {};
  for (const k of [...RECETA_IDS, "pelo_color", "acc"] as const) if (a[k] !== undefined) r[k] = a[k];
  return Buffer.byteLength(JSON.stringify(r), "utf8");
}
export const AVATAR_POR_DEFECTO: Avatar = { camisa: 0, sombrero: "paja", piel: 1 };
export interface Metadatos { alias: string; avatar: Avatar; rol: Rol; dispositivo: Dispositivo }

export interface TokenPresencia { url: string; sala: string; identidad: string; token: string; caduca_en: string }

/**
 * Firma el token de entrada a una sala (por omisión la libre). Los metadatos los pone la api; el cliente no puede cambiarlos (canUpdateOwnMetadata: false).
 * OF10: la oficina (rol oficina o admin) entra con el alias «Oficina» (decisión 107: sin nombre propio); su rol ya va en los metadatos.
 */
export async function firmaToken(lk: ConfigLiveKit, hogarId: number, sesionId: string, m: Metadatos, ahora = Date.now(), sala: ClaveSala = "general"): Promise<TokenPresencia> {
  const identidad = identidadOpaca(lk, hogarId, sesionId), nombre = SALAS[sala];
  const meta: Metadatos = esRolOficina(m.rol) ? { ...m, alias: ALIAS_OFICINA } : m;
  const at = new AccessToken(lk.clave, lk.secreto, { identity: identidad, name: meta.alias, metadata: JSON.stringify(meta), ttl: TTL_S });
  at.addGrant({ room: nombre, ...PERMISOS[m.rol] });
  const token = await at.toJwt();
  // exp lo pone el SDK con su propio reloj: el que se devuelve es una cota (como mucho TTL_S desde ahora)
  return { url: lk.urlPublica, sala: nombre, identidad, token, caduca_en: new Date(ahora + TTL_S * 1000).toISOString() };
}

/** Lo que la api necesita de la sala para moderar. Se inyecta (las pruebas ponen uno de mentira). */
export interface ModeradorSala {
  /** saca de la sala a todas las conexiones cuya identidad es de ese hogar (esDelHogar); devuelve cuántas había */
  expulsaHogar(sala: string, prefijo: string): Promise<number>;
  /** OF10: manda datos a la sala desde el servidor (sin participante: el cliente sabe así que viene de la api), fiable y con su tema; a toda la sala o a
   *  unas identidades. Una sala sin nadie no es un error: devuelve false (no había a quién). */
  envia(sala: string, tema: string, datos: Uint8Array, destinos?: string[]): Promise<boolean>;
}

const esNoEncontrado = (e: unknown) => { const err = e as { status?: number; code?: string }; return err.status === 404 || err.code === "not_found"; };

export class ModeradorLiveKit implements ModeradorSala {
  private readonly rs: RoomServiceClient;
  constructor(lk: ConfigLiveKit) { this.rs = new RoomServiceClient(lk.url, lk.clave, lk.secreto); }
  async expulsaHogar(sala: string, prefijo: string): Promise<number> {
    let presentes: string[];
    try { presentes = (await this.rs.listParticipants(sala)).map(p => p.identity).filter(i => esDelHogar(i, prefijo)); }
    catch (e) { if (esNoEncontrado(e)) return 0; throw e; } // la sala no existe (nadie dentro): nada que sacar
    let n = 0;
    for (const identidad of presentes) {
      // si se ha ido entre la lista y la expulsión, RoomService responde 404 not_found (comprobado en P4): no cuenta
      try { await this.rs.removeParticipant(sala, identidad); n++; } catch (e) { if (!esNoEncontrado(e)) throw e; }
    }
    return n;
  }
  async envia(sala: string, tema: string, datos: Uint8Array, destinos?: string[]): Promise<boolean> {
    try { await this.rs.sendData(sala, datos, DataPacket_Kind.RELIABLE, { topic: tema, ...(destinos?.length ? { destinationIdentities: destinos } : {}) }); return true; }
    catch (e) { if (esNoEncontrado(e)) return false; throw e; }   // la sala no existe (nadie dentro) [comportamiento de sendData sin sala: NO VERIFICADO contra LiveKit real]
  }
}

/**
 * Expulsados recientes: no se les da token nuevo durante TTL_S (si no, la expulsión duraría lo que tarda en recargar).
 * En memoria: no sobrevive a un reinicio de la api (para más, la oficina revoca sus sesiones o lo desactiva).
 */
export class Expulsados {
  private readonly hasta = new Map<number, number>();
  marca(hogarId: number, ahora = Date.now()): void { this.hasta.set(hogarId, ahora + TTL_S * 1000); }
  esta(hogarId: number, ahora = Date.now()): boolean {
    const h = this.hasta.get(hogarId);
    if (h === undefined) return false;
    if (h <= ahora) { this.hasta.delete(hogarId); return false; }
    return true;
  }
}

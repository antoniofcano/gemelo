// Presencia compartida (F2) del lado del servidor: el token de LiveKit (sala, identidad opaca, permisos del rol) y la
// expulsión con RoomService. Contratos: contratos/livekit-roles.json (permisos), contratos/presencia.md, api.openapi.yaml.
// La api NO guarda nada de la sala: ni quién entra, ni la pose, ni el chat (decisión 40). Solo la expulsión va a la auditoría.
import { createHmac } from "node:crypto";
import { AccessToken, RoomServiceClient, type VideoGrant } from "livekit-server-sdk";
import type { Rol } from "../auth/servicio.ts";
import type { ConfigLiveKit } from "../config.ts";

/** Sala fija de la visita libre de Hituelo (decisiones 39 y 60). Las guiadas (sala por visita) llegan con F3. */
export const SALA_LIBRE = "hituelo-libre";
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
 * permite ninguna fuente [NO VERIFICADO contra el servidor: lo comprobará la prueba con dos Chrome, P4].
 */
export const PERMISOS: Record<Rol, Permisos> = { hogar: SOLO_DATOS, guia: SOLO_DATOS, corresponsal: SOLO_DATOS, admin: SOLO_DATOS };

/**
 * Identidad en la sala: opaca y estable por hogar (HMAC del id con el secreto de LiveKit). No es el id de la base, ni
 * el correo, ni se puede deducir de ellos sin el secreto; la api la recalcula para expulsar. Al ser una por hogar, si
 * el mismo hogar entra desde otro aparato, LiveKit desconecta la conexión anterior (identidad repetida) [NO VERIFICADO].
 */
export function identidadOpaca(lk: Pick<ConfigLiveKit, "secreto">, hogarId: number): string {
  return "h_" + createHmac("sha256", lk.secreto).update("gemelo-presencia:v1:" + hogarId).digest("base64url").slice(0, 22);
}

export interface Avatar { camisa: number; sombrero: "ninguno" | "paja" | "gorra"; piel: number }
export const AVATAR_POR_DEFECTO: Avatar = { camisa: 0, sombrero: "paja", piel: 1 };
export interface Metadatos { alias: string; avatar: Avatar; rol: Rol; dispositivo: Dispositivo }

export interface TokenPresencia { url: string; sala: string; identidad: string; token: string; caduca_en: string }

/** Firma el token de entrada a la sala libre. Los metadatos los pone la api; el cliente no puede cambiarlos (canUpdateOwnMetadata: false). */
export async function firmaToken(lk: ConfigLiveKit, hogarId: number, m: Metadatos, ahora = Date.now()): Promise<TokenPresencia> {
  const identidad = identidadOpaca(lk, hogarId);
  const at = new AccessToken(lk.clave, lk.secreto, { identity: identidad, name: m.alias, metadata: JSON.stringify(m), ttl: TTL_S });
  at.addGrant({ room: SALA_LIBRE, ...PERMISOS[m.rol] });
  const token = await at.toJwt();
  // exp lo pone el SDK con su propio reloj: el que se devuelve es una cota (como mucho TTL_S desde ahora)
  return { url: lk.urlPublica, sala: SALA_LIBRE, identidad, token, caduca_en: new Date(ahora + TTL_S * 1000).toISOString() };
}

/** Lo que la api necesita de la sala para moderar. Se inyecta (las pruebas ponen uno de mentira). */
export interface ModeradorSala {
  /** saca a esa identidad de la sala; false si no estaba */
  expulsa(sala: string, identidad: string): Promise<boolean>;
}

export class ModeradorLiveKit implements ModeradorSala {
  private readonly rs: RoomServiceClient;
  constructor(lk: ConfigLiveKit) { this.rs = new RoomServiceClient(lk.url, lk.clave, lk.secreto); }
  async expulsa(sala: string, identidad: string): Promise<boolean> {
    try { await this.rs.removeParticipant(sala, identidad); return true; }
    catch (e) {
      // RoomService responde «not_found» (404) si la sala o la persona no están [NO VERIFICADO contra el servidor]
      const err = e as { status?: number; code?: string };
      if (err.status === 404 || err.code === "not_found") return false;
      throw e;
    }
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

// Lo que necesitan las rutas: se inyecta al construir la app (así las pruebas ponen el buzón y la grabación de OlivarTrack).
import type { Cartero } from "./auth/correo.ts";
import type { Bd } from "./bd/pool.ts";
import type { Config } from "./config.ts";
import type { LectorOlivarTrack } from "./ot/lector.ts";
import type { ModeradorSala } from "./presencia/livekit.ts";

export interface Contexto {
  config: Config;
  bd: Bd;
  cartero: Cartero;
  /** null si la lectura de OlivarTrack está apagada (GEMELO_OT=no) */
  lector: LectorOlivarTrack | null;
  /** quien saca a alguien de la sala de LiveKit; si falta y hay LiveKit, el de RoomService (las pruebas ponen uno de mentira) */
  moderador?: ModeradorSala;
}

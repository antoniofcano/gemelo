// Lo que necesitan las rutas: se inyecta al construir la app (así las pruebas ponen el buzón y la grabación de OlivarTrack).
import type { Cartero } from "./auth/correo.ts";
import type { Bd } from "./bd/pool.ts";
import type { Repartidor } from "./avisos/correo.ts";
import type { Config } from "./config.ts";
import type { ServicioHoy } from "./ot/hoy.ts";
import type { LectorOlivarTrack } from "./ot/lector.ts";
import type { ModeradorSala, ModeradorVoz } from "./presencia/livekit.ts";
import type { Reloj } from "./presencia/voz.ts";
import type { ServicioTiempo } from "./vigia/servicio.ts";

export interface Contexto {
  config: Config;
  bd: Bd;
  cartero: Cartero;
  /** null si la lectura de OlivarTrack está apagada (GEMELO_OT=no) */
  lector: LectorOlivarTrack | null;
  /** quien saca a alguien de la sala de LiveKit; si falta y hay LiveKit, el de RoomService (las pruebas ponen uno de mentira) */
  moderador?: ModeradorSala;
  /** F3c: la voz de las guiadas (dar y quitar la palabra, silenciar). Si falta: el de RoomService, salvo que las pruebas pongan `moderador` (entonces, apagada) */
  moderadorVoz?: ModeradorVoz;
  /** F3c: el reloj de los turnos de palabra (las pruebas ponen uno que adelantan a mano) */
  relojVoz?: Reloj;
  /** el tiempo de Vigía (GET /api/tiempo); null o ausente si está apagado (GEMELO_VIGIA=no) */
  tiempo?: ServicioTiempo | null;
  /** lo de hoy de OlivarTrack y Vigía en vivo (GET /api/ot/hoy, contratos/ot-hoy.md); null o ausente si los dos están apagados */
  hoy?: ServicioHoy | null;
  /** quien manda por correo los avisos pendientes (OF11c); lo crea principal.ts. Las pruebas de rutas no lo ponen: no hay envío en segundo plano */
  repartidor?: Pick<Repartidor, "despierta">;
}

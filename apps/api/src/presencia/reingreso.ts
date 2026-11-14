// L9-06 (auditoría de noviembre): el centinela de reingresos. LiveKit no revoca un token ya firmado: al expulsar, la api deja de dar tokens nuevos y saca
// las conexiones con RemoveParticipant, pero quien guardó el suyo (o el que LiveKit le renueva mientras está conectado, que según su documentación vale
// 10 min [NO VERIFICADO contra la 1.13.11]) podría volver a entrar hasta que caduque. Por eso acortar TTL_S no basta, y la api, que no está en el camino
// de la conexión, hace lo que sí puede: mientras dure la marca de expulsión, mira cada BARRIDO_MS las salas del mundo y vuelve a sacar a ese hogar si
// está dentro. Sin marcas vivas no llama a LiveKit. No toca los clientes ni la configuración de LiveKit.
// Un webhook de LiveKit («participant_joined») lo haría al instante, pero pide cambiar infra/livekit.yaml en el VPS (ADR-0033, MU3-2): queda como mejora.
import type { ModeradorSala } from "./livekit.ts";
import { SALA_GUIADA } from "./livekit.ts";

export interface DepsReingreso {
  moderador: Pick<ModeradorSala, "expulsaHogar">;
  /** el prefijo opaco del hogar en las salas (prefijoHogar) */
  prefijo: (hogar: number) => string;
  /** expulsados de la visita compartida (rutas.ts): fuera de TODAS las salas del mundo */
  expulsados: { vivos(ahora?: number): number[] };
  /** las salas donde mirar: las fijas, las guiadas abiertas y las de los corros */
  salas: () => Promise<string[]>;
  /** expulsados de una guiada (voz_rutas.ts): fuera de `guiada-<evento>` */
  guiada?: { vivos(ahora?: number): { evento: number; hogar: number }[] };
  ahora?: () => number;
}

/** Una pasada: vuelve a sacar a los expulsados que estén dentro. Devuelve cuántas conexiones sacó (0 = nadie había vuelto). */
export async function vuelveAExpulsar(d: DepsReingreso): Promise<number> {
  const ahora = (d.ahora ?? Date.now)();
  const generales = d.expulsados.vivos(ahora), deGuiada = d.guiada ? d.guiada.vivos(ahora) : [];
  if (!generales.length && !deGuiada.length) return 0;   // lo normal: nadie expulsado, ninguna llamada a LiveKit
  let n = 0;
  if (generales.length) {
    const salas = await d.salas();
    for (const h of generales) { const p = d.prefijo(h); for (const s of salas) n += await d.moderador.expulsaHogar(s, p); }
  }
  for (const { evento, hogar } of deGuiada) n += await d.moderador.expulsaHogar(SALA_GUIADA(evento), d.prefijo(hogar));
  return n;
}

// OF10b (decisión 154): quién puede entrar en la «Sala de la visita» (clave «visita», hituelo-visita). Lógica pura y el estado mínimo.
//  · Sin evento ligado: pasa quien llegue con sesión (la sala la abre la oficina al invitar; como la general).
//  · Con evento ligado (la oficina invitó con `evento`): solo la oficina (rol oficina o admin) y los hogares APUNTADOS (no en espera) a ese evento.
//  · La invitación vigente (a qué evento está ligada la sala) se guarda EN MEMORIA con caducidad, como `Expulsados`: no sobrevive a un reinicio de la
//    api (tras un reinicio la sala vuelve a «quien invite la oficina», sin evento) y vale para una sola instancia de la api. Si hiciera falta más,
//    una tabla de ajustes; hoy lo mínimo (OFICINA.md §6).
import type { ClaveSala } from "./livekit.ts";

/** Cuánto vale la ligadura de la sala a un evento sin que la oficina la renueve: una visita larga con margen. */
export const LIGADURA_HORAS = 8;
export const CODIGO_SOLO_INSCRITOS = "visita_solo_inscritos";
export const TEXTO_SOLO_INSCRITOS = "Esta visita es para las familias apuntadas.";

export interface EntradaSala { sala: ClaveSala; esOficina: boolean; evento: number | null; apuntado: boolean }
export type Decision = { ok: true } | { ok: false; codigo: typeof CODIGO_SOLO_INSCRITOS; mensaje: string };

/** ¿Puede esta sesión pedir token de esa sala? `apuntado`: su hogar está apuntado (no en espera) al `evento`. Solo la sala «visita» con evento restringe. */
export function puedeEntrar(e: EntradaSala): Decision {
  if (e.sala !== "visita" || e.evento === null || e.esOficina || e.apuntado) return { ok: true };
  return { ok: false, codigo: CODIGO_SOLO_INSCRITOS, mensaje: TEXTO_SOLO_INSCRITOS };
}

/** El evento al que la oficina ha ligado la sala de la visita (null = ninguno), con caducidad. */
export class LigaduraVisita {
  private evento: number | null = null;
  private hasta = 0;
  liga(evento: number | null, ahora = Date.now()): void { this.evento = evento; this.hasta = evento === null ? 0 : ahora + LIGADURA_HORAS * 3600_000; }
  vigente(ahora = Date.now()): number | null {
    if (this.evento !== null && this.hasta <= ahora) this.evento = null;
    return this.evento;
  }
}

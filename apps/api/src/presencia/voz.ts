// F3c: la voz de las visitas guiadas, del lado del servidor (ADR-0026; decisiones 39, 157-162; contratos: livekit-roles.json v6, presencia.md, api.openapi.yaml).
// Lógica pura y el estado mínimo; las rutas están en voz_rutas.ts.
//  · Quién entra en la sala `guiada-<evento>` y con qué papel (decideGuiada): el guía del evento (visitas.guia_id) y la oficina, con micrófono; las familias
//    APUNTADAS (no en espera) al evento, sin poder publicar pistas. Solo eventos de tipo «guiada» o «directo», ni cancelados ni en borrador, y en su ventana
//    de horas. No hay papel de menor: no hay cuentas de menores (decisiones 45 y 159).
//  · La palabra (Palabra): la da el guía o la oficina a UNA familia cada vez durante TURNO_S (2 min, decisión 161), con cuenta atrás que hace cumplir el
//    servidor: al vencer, la api le quita el permiso de micrófono en LiveKit (RoomService.UpdateParticipant). Se puede alargar (+1 min, hasta ALARGUES_MAX)
//    o quitar antes. Las manos levantadas son una cola del servidor, en orden de llegada. El estado (turno y manos) vive EN MEMORIA de esta api, como la
//    ligadura de OF10b: una sola instancia; tras un reinicio se pierde y `limpiaAlArrancar` quita en LiveKit las palabras que quedaran dadas. La FUENTE DE
//    VERDAD del permiso es LiveKit: este estado solo decide cuándo cambiarlo.
//  · Lo que ven los clientes: los atributos del participante que pone la api (`palabra_hasta`: instante ISO en que acaba su turno; `mano`: instante en que la
//    levantó), que LiveKit reparte a toda la sala; ningún cliente puede tocarlos (canUpdateOwnMetadata false).
//  · Auditoría: quién, a quién (el hogar) y cuándo; nunca audio ni texto de voz (no hay ni lo uno ni lo otro en la api). Nada se graba (sin Egress, decisión 10).
import type { ModeradorVoz, Papel } from "./livekit.ts";
import { SALA_GUIADA } from "./livekit.ts";

/** Los tipos de evento de la agenda que tienen sala de voz (decisión 157: solo las visitas guiadas; un «directo» es una guiada en directo, OFICINA §8). */
export const TIPOS_GUIADA: readonly string[] = ["guiada", "directo"];
/** Decisión 161: 2 minutos por turno, el guía alarga de minuto en minuto. ALARGUES_MAX [SUPUESTO del agente]: un tope para que un turno no se eternice (7 min en total). */
export const TURNO_S = 120, ALARGA_S = 60, ALARGUES_MAX = 5;
/** Tope de la cola de manos de una sala (con 40 hogares sobra) y reintento si LiveKit falla al vencer un turno. */
export const MANOS_MAX = 100, REINTENTO_MS = 5000;
/** La ventana de la sala: las familias entran 15 min antes (OFICINA §8); el guía y la oficina, 60 min antes para preparar; todos hasta 30 min después del fin
 *  (sin hora de fin, 3 h después de empezar). [SUPUESTO del agente: 60, 30 y 3 h; los cambia F3f si hace falta] */
export const ABRE_FAMILIAS_MIN = 15, ABRE_MODERA_MIN = 60, CIERRA_MIN = 30, SIN_FIN_H = 3;
/** Los atributos de LiveKit que pone la api (contratos/livekit-roles.json v6, «atributos»). */
export const ATRIBUTOS = { palabra: "palabra_hasta", mano: "mano" } as const;

export interface EventoGuiada { tipo: string; estado: string; empieza_en: Date; termina_en: Date | null; guia_id: number | null }
/** Quién pide: su hogar, si es de la oficina (rol oficina o admin con su aparato aprobado) y si su hogar está APUNTADO (no en espera) y activo. */
export interface Quien { hogarId: number; esOficina: boolean; apuntado: boolean }
export type Rechazo = { ok: false; http: 403 | 404 | 409; codigo: string; mensaje: string; abre_en?: string };
export type DecisionGuiada = { ok: true; papel: Papel } | Rechazo;

const NO_EXISTE: Rechazo = { ok: false, http: 404, codigo: "guiada_no_existe", mensaje: "Esa visita guiada no existe." };
const NO_VIGENTE: Rechazo = { ok: false, http: 409, codigo: "guiada_no_vigente", mensaje: "Esa visita está cancelada o aún sin abrir." };
export const TEXTO_SOLO_INSCRITOS_GUIADA = "Esta visita es para las familias apuntadas.";

export const esGuiada = (e: Pick<EventoGuiada, "tipo"> | null | undefined): e is EventoGuiada => !!e && TIPOS_GUIADA.includes(e.tipo);
/** ¿Puede moderar la voz de ese evento? El guía asignado (visitas.guia_id) o la oficina. */
export const puedeModerar = (e: Pick<EventoGuiada, "guia_id">, q: Pick<Quien, "hogarId" | "esOficina">): boolean => e.guia_id === q.hogarId || q.esOficina;
/** El papel en la sala: el guía gana a la oficina (si la oficina es la guía, entra como guía); una familia solo si está apuntada. */
export function papelDe(e: Pick<EventoGuiada, "guia_id">, q: Quien): Papel | null {
  if (e.guia_id === q.hogarId) return "guia";
  if (q.esOficina) return "oficina";
  return q.apuntado ? "familia" : null;
}
/** Cuándo abre y cierra la sala para ese papel (ms). */
export function ventana(e: Pick<EventoGuiada, "empieza_en" | "termina_en">, papel: Papel): { abre: number; cierra: number } {
  const ini = e.empieza_en.getTime(), fin = e.termina_en ? e.termina_en.getTime() : ini + SIN_FIN_H * 3600_000;
  return { abre: ini - (papel === "familia" ? ABRE_FAMILIAS_MIN : ABRE_MODERA_MIN) * 60_000, cierra: fin + CIERRA_MIN * 60_000 };
}

/** ¿Puede esta sesión pedir el token de la sala guiada de ese evento, y con qué papel? (la base ya consultada; aquí nada de E/S) */
export function decideGuiada(e: EventoGuiada | null | undefined, q: Quien, ahora = Date.now()): DecisionGuiada {
  if (!esGuiada(e)) return NO_EXISTE;
  if (e.estado === "cancelada" || e.estado === "borrador") return NO_VIGENTE;
  const papel = papelDe(e, q);
  if (!papel) return { ok: false, http: 403, codigo: "guiada_solo_inscritos", mensaje: TEXTO_SOLO_INSCRITOS_GUIADA };
  const v = ventana(e, papel);
  if (ahora < v.abre) return { ok: false, http: 409, codigo: "guiada_aun_no", mensaje: "La sala de esta visita aún no está abierta.", abre_en: new Date(v.abre).toISOString() };
  if (ahora > v.cierra) return { ok: false, http: 409, codigo: "guiada_terminada", mensaje: "Esta visita ya ha terminado." };
  return { ok: true, papel };
}

// ---------------------------------------------------------------- la palabra

/** El reloj se inyecta: las pruebas lo adelantan a mano. */
export interface Reloj { ahora(): number; programa(ms: number, fn: () => void): unknown; cancela(h: unknown): void }
export const RELOJ_REAL: Reloj = {
  ahora: () => Date.now(),
  programa: (ms, fn) => { const t = setTimeout(fn, ms); t.unref(); return t; },
  cancela: h => clearTimeout(h as NodeJS.Timeout),
};
/** Apunta en la auditoría (actor null = el sistema: un turno que vence, la limpieza al arrancar). Solo números, textos cortos y sí/no: nada de voz. */
export type Auditor = (actor: number | null, accion: string, detalle: Record<string, string | number | boolean>) => Promise<void>;
export type MotivoQuitar = "cortada" | "vencida" | "silencio" | "expulsion";

interface Turno { identidad: string; hogar: number; hasta: number; alargues: number; temporizador: unknown }
interface Mano { identidad: string; hogar: number; desde: number }
interface EstadoSala { turno: Turno | null; manos: Mano[]; cola: Promise<unknown> }

export type Resultado<T extends object = object> = ({ ok: true } & T) | { ok: false; codigo: string };
export interface VistaPalabra { turno: { identidad: string; hasta: string; alargues: number } | null; manos: { identidad: string; desde: string }[] }

const iso = (ms: number) => new Date(ms).toISOString();

export class Palabra {
  private readonly salas = new Map<number, EstadoSala>();
  private readonly mod: ModeradorVoz;
  private readonly audita: Auditor;
  private readonly reloj: Reloj;
  private readonly log: { warn: (o: unknown, m: string) => void };
  constructor(mod: ModeradorVoz, audita: Auditor, reloj: Reloj = RELOJ_REAL, log: { warn: (o: unknown, m: string) => void } = { warn: () => undefined }) {
    this.mod = mod; this.audita = audita; this.reloj = reloj; this.log = log;
  }

  private sala(evento: number): EstadoSala {
    let s = this.salas.get(evento);
    if (!s) { s = { turno: null, manos: [], cola: Promise.resolve() }; this.salas.set(evento, s); }
    return s;
  }
  /** Una operación cada vez por sala: dos «dar la palabra» a la vez no pueden pasar las dos (una sola familia con la palabra). */
  private enOrden<T>(evento: number, fn: (s: EstadoSala) => Promise<T>): Promise<T> {
    const s = this.sala(evento);
    const r = s.cola.then(() => fn(s));
    s.cola = r.catch(() => undefined);
    return r;
  }

  vista(evento: number): VistaPalabra {
    const s = this.salas.get(evento);
    return {
      turno: s?.turno ? { identidad: s.turno.identidad, hasta: iso(s.turno.hasta), alargues: s.turno.alargues } : null,
      manos: (s?.manos ?? []).map(m => ({ identidad: m.identidad, desde: iso(m.desde) })),
    };
  }
  /** ¿Tiene alguien la palabra en esa sala? (para las pruebas y el panel) */
  quienHabla(evento: number): string | null { return this.salas.get(evento)?.turno?.identidad ?? null; }

  /** Una familia levanta la mano (idempotente). Falla si ya tiene la palabra, si no está en la sala o si la cola está llena. */
  levanta(evento: number, identidad: string, hogar: number): Promise<Resultado<{ puesto: number }>> {
    return this.enOrden(evento, async s => {
      if (s.turno?.identidad === identidad) return { ok: false, codigo: "ya_tienes_la_palabra" };
      const ya = s.manos.findIndex(m => m.identidad === identidad);
      if (ya >= 0) return { ok: true, puesto: ya + 1 };
      if (s.manos.length >= MANOS_MAX) return { ok: false, codigo: "demasiadas_manos" };
      const desde = this.reloj.ahora();
      if (!(await this.mod.actualiza(SALA_GUIADA(evento), identidad, { atributos: { [ATRIBUTOS.mano]: iso(desde) } }))) return { ok: false, codigo: "no_estas_en_la_sala" };
      s.manos.push({ identidad, hogar, desde });
      await this.audita(hogar, "guiada.mano_levantada", { evento, hogar });
      return { ok: true, puesto: s.manos.length };
    });
  }
  /** La baja ella misma (o se le baja al darle la palabra). Idempotente. */
  baja(evento: number, identidad: string, hogar: number): Promise<Resultado> {
    return this.enOrden(evento, async s => {
      const i = s.manos.findIndex(m => m.identidad === identidad);
      if (i < 0) return { ok: true };
      s.manos.splice(i, 1);
      await this.mod.actualiza(SALA_GUIADA(evento), identidad, { atributos: { [ATRIBUTOS.mano]: "" } });
      await this.audita(hogar, "guiada.mano_bajada", { evento, hogar });
      return { ok: true };
    });
  }

  /** Da la palabra a una familia (identidad de una conexión de un hogar apuntado: lo comprueba la ruta). Si otra la tiene, «palabra_ocupada»: hay que quitarla antes. */
  da(evento: number, identidad: string, hogar: number, actor: number): Promise<Resultado<{ hasta: string }>> {
    return this.enOrden(evento, async s => {
      if (s.turno) return { ok: false, codigo: s.turno.identidad === identidad ? "ya_tiene_la_palabra" : "palabra_ocupada" };
      const hasta = this.reloj.ahora() + TURNO_S * 1000;
      const esta = await this.mod.actualiza(SALA_GUIADA(evento), identidad, { micro: true, atributos: { [ATRIBUTOS.palabra]: iso(hasta), [ATRIBUTOS.mano]: "" } });
      s.manos = s.manos.filter(m => m.identidad !== identidad);
      if (!esta) return { ok: false, codigo: "no_esta_en_la_sala" };
      s.turno = { identidad, hogar, hasta, alargues: 0, temporizador: this.programa(evento, identidad, TURNO_S * 1000) };
      await this.audita(actor, "guiada.palabra_dada", { evento, hogar, segundos: TURNO_S });
      return { ok: true, hasta: iso(hasta) };
    });
  }
  /** +1 min al turno en curso (desde lo que le quedaba), hasta ALARGUES_MAX veces. */
  alarga(evento: number, actor: number): Promise<Resultado<{ hasta: string }>> {
    return this.enOrden(evento, async s => {
      const t = s.turno;
      if (!t) return { ok: false, codigo: "nadie_tiene_la_palabra" };
      if (t.alargues >= ALARGUES_MAX) return { ok: false, codigo: "tope_de_alargues" };
      const hasta = Math.max(t.hasta, this.reloj.ahora()) + ALARGA_S * 1000;
      await this.mod.actualiza(SALA_GUIADA(evento), t.identidad, { atributos: { [ATRIBUTOS.palabra]: iso(hasta) } });
      this.reloj.cancela(t.temporizador);
      t.hasta = hasta; t.alargues++;
      t.temporizador = this.programa(evento, t.identidad, hasta - this.reloj.ahora());
      await this.audita(actor, "guiada.palabra_alargada", { evento, hogar: t.hogar, segundos: ALARGA_S, alargues: t.alargues });
      return { ok: true, hasta: iso(hasta) };
    });
  }
  /** Quita la palabra antes de tiempo (cortar). Si LiveKit falla, el error sube y el turno sigue (quien modera lo ve y repite). */
  quita(evento: number, actor: number | null, motivo: MotivoQuitar = "cortada"): Promise<Resultado<{ hogar: number }>> {
    return this.enOrden(evento, async s => {
      if (!s.turno) return { ok: false, codigo: "nadie_tiene_la_palabra" };
      const hogar = s.turno.hogar;
      await this.quitaTurno(evento, s, actor, motivo);
      return { ok: true, hogar };
    });
  }
  /** Al expulsar a un hogar: se le quita la palabra si la tenía y salen de la cola sus manos. */
  olvidaHogar(evento: number, hogar: number, actor: number): Promise<void> {
    return this.enOrden(evento, async s => {
      s.manos = s.manos.filter(m => m.hogar !== hogar);
      if (s.turno?.hogar === hogar) await this.quitaTurno(evento, s, actor, "expulsion");
    });
  }
  /** Para cerrar la sala (F3f, decisión 155) o apagar la api: cancela los temporizadores y olvida el estado (no toca LiveKit). */
  olvidaSala(evento: number): void {
    const s = this.salas.get(evento);
    if (s?.turno) this.reloj.cancela(s.turno.temporizador);
    this.salas.delete(evento);
  }
  cierra(): void { for (const e of [...this.salas.keys()]) this.olvidaSala(e); }

  private programa(evento: number, identidad: string, ms: number): unknown {
    return this.reloj.programa(Math.max(0, ms), () => { void this.vence(evento, identidad); });
  }
  /** El temporizador del turno: si sigue siendo el mismo turno y ya pasó su hora, se quita. Si LiveKit falla, se reintenta (el turno sigue en la vista). */
  vence(evento: number, identidad: string): Promise<void> {
    return this.enOrden(evento, async s => {
      const t = s.turno;
      if (!t || t.identidad !== identidad || t.hasta > this.reloj.ahora()) return;
      try { await this.quitaTurno(evento, s, null, "vencida"); }
      catch (e) {
        this.log.warn({ err: (e as Error).message, evento }, "voz: no se pudo quitar la palabra al vencer; se reintenta");
        t.temporizador = this.programa(evento, identidad, REINTENTO_MS);
      }
    });
  }
  private async quitaTurno(evento: number, s: EstadoSala, actor: number | null, motivo: MotivoQuitar): Promise<void> {
    const t = s.turno!;
    // primero LiveKit (la fuente de verdad); si no está ya en la sala, no hay permiso que quitar
    await this.mod.actualiza(SALA_GUIADA(evento), t.identidad, { micro: false, atributos: { [ATRIBUTOS.palabra]: "" } });
    this.reloj.cancela(t.temporizador);
    s.turno = null;
    await this.audita(actor, "guiada.palabra_quitada", { evento, hogar: t.hogar, motivo });
  }
}

/**
 * Al arrancar la api (principal.ts): las palabras que se dieron antes de un reinicio ya no tienen temporizador, así que se quitan en LiveKit a toda familia
 * que esté en una sala guiada con permiso de publicar (ADR-0026, «Consecuencias»). Devuelve cuántas conexiones se tocaron. No lanza si la sala se vacía entre medias.
 */
export async function limpiaAlArrancar(mod: ModeradorVoz, audita: Auditor): Promise<number> {
  let n = 0;
  for (const sala of await mod.salasGuiadas()) {
    let aqui = 0;
    for (const p of await mod.presentes(sala)) {
      if (p.papel !== "familia" || !p.micro) continue;
      if (await mod.actualiza(sala, p.identidad, { micro: false, atributos: { [ATRIBUTOS.palabra]: "", [ATRIBUTOS.mano]: "" } })) aqui++;
    }
    if (aqui) await audita(null, "guiada.palabra_quitada", { evento: Number(sala.slice("guiada-".length)), motivo: "arranque", conexiones: aqui });
    n += aqui;
  }
  return n;
}

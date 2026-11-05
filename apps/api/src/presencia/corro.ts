// F3k-1 (ADR-0032; decisiones 205-213, las 205-209 y 212 PROVISIONALES con la opción recomendada; contratos: livekit-roles.json v8, presencia.md): los CORROS de
// la visita libre, del lado del servidor. Lógica y estado mínimo, sin base ni red: lo que necesita de fuera se inyecta (Puertas: la base; SalaCorro: LiveKit).
//  · Un corro es un grupo de 2 a 5 HOGARES que han aceptado hablar entre sí (K4: invitar y aceptar en el momento). Cada corro tiene su sala de LiveKit solo de
//    audio, `corro-<id>` (id opaco al azar), cuyo token firma la api SOLO a sus miembros (corro_rutas.ts): quién oye a quién lo impone el servidor.
//  · Vive EN MEMORIA de esta api (como la palabra de las guiadas): no se guarda quién habló con quién (es el grafo social que K4 quiere evitar); lo que queda es
//    la auditoría corro.* (quién, con quién, cuándo; nunca audio), con el plazo de la voz (corteAuditoriaVoz). Tras un reinicio los corros se pierden: sus salas
//    quedan vacías en LiveKit o con gente que ya no consigue token nuevo (el token dura TTL_S) [SUPUESTO aceptable con cuentas de prueba].
//  · La cercanía (invitar a < 8 m, dejar de oír a > 20 m, salir a > 40 m durante 60 s) la mide el CLIENTE: la api no ve las poses (decisión 40). El servidor sí
//    saca a quien pasa AUSENTE_MS sin ninguna conexión en la sala de su corro (desconectado, cerró la pestaña) con un barrido periódico.
//  · Límites [PROPUESTA del ADR-0032, provisionales]: 5 invitaciones cada 10 min por hogar; dos «Ahora no» seguidos de la misma persona → 24 h sin poder invitarla.
//  · Las comprobaciones de la base (interruptor, ajuste, consentimiento, suspensión, bloqueos) se hacen DENTRO de la cola, en el momento de invitar y de aceptar.
import { randomBytes } from "node:crypto";
import type { ModeradorVoz } from "./livekit.ts";
import { esDelHogar, PATRON_ID_CORRO, SALA_CORRO } from "./livekit.ts";
import type { Auditor, Reloj, Resultado } from "./voz.ts";
import { RELOJ_REAL } from "./voz.ts";

/** K4 (decisión 205, provisional): hasta 5 hogares por corro, lo que cabe en las 4 voces a la vez de MAX_VOCES del motor. */
export const CORRO_MAX_HOGARES = 5;
/** Lo que vive una invitación sin respuesta. [SUPUESTO del agente: lo bastante para leerla y decidir; el ADR no lo fija] */
export const INVITACION_S = 60;
/** Mo1 (decisión 209, provisional): como mucho 5 invitaciones cada 10 min por hogar. */
export const INVITA_MAX = 5, INVITA_VENTANA_MS = 10 * 60_000;
/** Mo1: tras dos «Ahora no» seguidos de la misma persona, 24 h sin poder invitarla. */
export const AHORA_NO_SEGUIDOS = 2, VETO_MS = 24 * 3600_000;
/** Tope de invitaciones pendientes que puede tener un hogar a la vez (más allá, «no disponible»). [SUPUESTO del agente] */
export const RECIBIDAS_MAX = 10;
/** Quien pasa 60 s sin ninguna conexión en la sala de su corro sale de él (ADR-0032 b: «se desconecta»); el barrido mira cada 20 s. */
export const AUSENTE_MS = 60_000, BARRIDO_MS = 20_000;

/** Por qué sale alguien de un corro (va a la auditoría corro.sale). */
export type MotivoSalida = "salir" | "lejos" | "cambio_de_sala" | "vista_aerea" | "desconectado" | "aviso" | "bloqueo" | "suspension" | "expulsion"
  | "consentimiento" | "ajuste" | "interruptor" | "no_disponible";
export const MOTIVOS_CLIENTE: readonly MotivoSalida[] = ["salir", "lejos", "cambio_de_sala", "vista_aerea"];

/** Lo que necesita de la base, en el momento de decidir (corro_rutas.ts lo implementa con cercania.ts). */
export interface Puertas {
  /** De esos hogares, los que pueden hablar por cercanía AHORA: interruptor general encendido, ajuste activado, consentimiento «cercania» vigente, sin suspensión y cuenta activa. */
  disponibles(hogares: number[]): Promise<Set<number>>;
  /** ¿Hay un bloqueo de voz, en cualquier sentido, entre `h` y alguno de `otros`? */
  bloqueo(h: number, otros: number[]): Promise<boolean>;
}
/** Lo que necesita de LiveKit: sacar de la sala, borrarla y ver quién está (el de RoomService o uno de mentira). */
export type SalaCorro = Pick<ModeradorVoz, "expulsaHogar" | "borraSala" | "presentes">;

interface Miembro { hogar: number; desde: number; visto: number }
interface Corro { id: string; miembros: Map<number, Miembro>; creado: number }
interface Invitacion { id: string; de: number; a: number; creada: number; caduca: number }

export interface VistaCorro { id: string; sala: string; desde: string; miembros: { hogar: number; desde: string }[] }
export interface VistaHogar {
  corro: VistaCorro | null;
  recibidas: { id: string; de: number; caduca_en: string }[];
  enviadas: { id: string; a: number; caduca_en: string }[];
}

const iso = (ms: number) => new Date(ms).toISOString();
const nuevoId = (): string => randomBytes(9).toString("base64url");   // 12 caracteres [A-Za-z0-9_-]

export interface DepsCorros {
  sala: SalaCorro;
  puertas: Puertas;
  audita: Auditor;
  /** el prefijo opaco del hogar en las salas (prefijoHogar), para sacar sus conexiones y reconocerlas */
  prefijo: (hogar: number) => string;
  reloj?: Reloj;
  /** «mira tu estado de corro» a las conexiones de esos hogares en la sala libre (tema «corro»); comodidad: si falla, no pasa nada */
  avisa?: (hogares: number[]) => Promise<void>;
  log?: { warn: (o: unknown, m: string) => void };
}

export class Corros {
  private readonly corros = new Map<string, Corro>();
  private readonly porHogar = new Map<number, string>();
  private readonly invitaciones = new Map<string, Invitacion>();
  private readonly enviadas = new Map<number, number[]>();                          // instantes de las invitaciones de cada hogar (ventana de 10 min)
  private readonly rechazos = new Map<string, { seguidos: number; vetoHasta: number }>();   // clave «de>a»
  private cola: Promise<unknown> = Promise.resolve();
  private readonly d: Required<Omit<DepsCorros, "avisa">> & Pick<DepsCorros, "avisa">;

  constructor(d: DepsCorros) {
    this.d = { reloj: RELOJ_REAL, log: { warn: () => undefined }, ...d };
  }

  /** Una operación cada vez (para 40 hogares sobra): dos aceptaciones a la vez no pueden pasar del tope ni dejar a un hogar en dos corros. */
  private enOrden<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.cola.then(fn);
    this.cola = r.catch(() => undefined);
    return r;
  }
  private ahora() { return this.d.reloj.ahora(); }
  private limpia(ahora: number): void {
    for (const [id, i] of this.invitaciones) if (i.caduca <= ahora) this.invitaciones.delete(id);
    for (const [h, t] of this.enviadas) { const v = t.filter(x => x > ahora - INVITA_VENTANA_MS); if (v.length) this.enviadas.set(h, v); else this.enviadas.delete(h); }
    for (const [k, r] of this.rechazos) if (r.seguidos === 0 && r.vetoHasta <= ahora) this.rechazos.delete(k);
  }
  private avisa(hogares: number[]): void {
    if (!this.d.avisa || !hogares.length) return;
    this.d.avisa([...new Set(hogares)]).catch(e => this.d.log.warn({ err: (e as Error).message }, "corros: no se pudo avisar en la sala libre"));
  }

  // ---------------------------------------------------------------- lectura

  corroDe(hogar: number): string | null { return this.porHogar.get(hogar) ?? null; }
  /** Las salas de LiveKit de los corros vivos (para la expulsión de la oficina, que saca de todas las salas). */
  salas(): string[] { return [...this.corros.keys()].map(SALA_CORRO); }
  /** Lo que ve cualquiera de la sala libre (el icono «hablan entre ellos»): qué hogares están en cada corro. Sin alias ni nada más. */
  publicos(): { id: string; miembros: number[] }[] { return [...this.corros.values()].map(c => ({ id: c.id, miembros: [...c.miembros.keys()] })); }
  cuenta(): { corros: number; hogares: number } { return { corros: this.corros.size, hogares: this.porHogar.size }; }
  vista(hogar: number): VistaHogar {
    const ahora = this.ahora(), id = this.porHogar.get(hogar), c = id ? this.corros.get(id) : undefined;
    const vivas = [...this.invitaciones.values()].filter(i => i.caduca > ahora);
    return {
      corro: c ? { id: c.id, sala: SALA_CORRO(c.id), desde: iso(c.creado), miembros: [...c.miembros.values()].map(m => ({ hogar: m.hogar, desde: iso(m.desde) })) } : null,
      recibidas: vivas.filter(i => i.a === hogar).map(i => ({ id: i.id, de: i.de, caduca_en: iso(i.caduca) })),
      enviadas: vivas.filter(i => i.de === hogar).map(i => ({ id: i.id, a: i.a, caduca_en: iso(i.caduca) })),
    };
  }
  /** ¿Está vetado `de` para invitar a `a` (dos «Ahora no» seguidos)? */
  vetado(de: number, a: number): boolean { const r = this.rechazos.get(de + ">" + a); return !!r && r.vetoHasta > this.ahora(); }

  // ---------------------------------------------------------------- invitar, aceptar, rechazar

  /**
   * `de` invita a `a` a su corro (o a uno nuevo si no está en ninguno). Códigos: mismo_hogar; no_puedes (`de` no tiene la voz por cercanía disponible);
   * no_disponible (lo que sea del otro lado: apagada, sin consentimiento, suspendido, bloqueo, en otro corro, vetado o con demasiadas invitaciones; NO se dice
   * cuál, para no delatar un bloqueo); ya_en_tu_corro; corro_lleno; demasiadas_invitaciones. Volver a invitar a quien ya tiene una invitación tuya pendiente
   * devuelve la misma.
   */
  invita(de: number, a: number): Promise<Resultado<{ id: string; caduca_en: string }>> {
    return this.enOrden(async () => {
      const ahora = this.ahora(); this.limpia(ahora);
      if (de === a) return { ok: false, codigo: "mismo_hogar" };
      const disp = await this.d.puertas.disponibles([de, a]);
      if (!disp.has(de)) return { ok: false, codigo: "no_puedes" };
      const cDe = this.porHogar.get(de) ?? null, cA = this.porHogar.get(a) ?? null;
      if (cA !== null && cA === cDe) return { ok: false, codigo: "ya_en_tu_corro" };
      const miembros = cDe ? [...this.corros.get(cDe)!.miembros.keys()] : [de];
      if (miembros.length >= CORRO_MAX_HOGARES) return { ok: false, codigo: "corro_lleno" };
      const ya = [...this.invitaciones.values()].find(i => i.de === de && i.a === a);
      if (ya) return { ok: true, id: ya.id, caduca_en: iso(ya.caduca) };
      if ((this.enviadas.get(de)?.length ?? 0) >= INVITA_MAX) return { ok: false, codigo: "demasiadas_invitaciones" };
      const recibidas = [...this.invitaciones.values()].filter(i => i.a === a).length;
      if (!disp.has(a) || cA !== null || this.vetado(de, a) || recibidas >= RECIBIDAS_MAX || await this.d.puertas.bloqueo(a, miembros)) return { ok: false, codigo: "no_disponible" };
      const inv: Invitacion = { id: nuevoId(), de, a, creada: ahora, caduca: ahora + INVITACION_S * 1000 };
      this.invitaciones.set(inv.id, inv);
      this.enviadas.set(de, [...(this.enviadas.get(de) ?? []), ahora]);
      await this.d.audita(de, "corro.invitacion", { hogar: de, a, ...(cDe ? { corro: cDe } : {}) });
      this.avisa([a]);
      return { ok: true, id: inv.id, caduca_en: iso(inv.caduca) };
    });
  }

  /**
   * `a` acepta una invitación suya y vigente: entra en el corro de quien le invitó (el que tenga AHORA) o se crea uno nuevo con los dos. Se vuelve a comprobar
   * todo (alguien pudo bloquear, suspenderse o llenarse el corro mientras tanto). Códigos: no_existe (caducada o no es suya); ya_en_un_corro; no_puedes;
   * no_disponible (quien invitó ya no puede, o hay un bloqueo con alguien del corro); corro_lleno.
   */
  acepta(a: number, id: string): Promise<Resultado<{ corro: string; sala: string }>> {
    return this.enOrden(async () => {
      const ahora = this.ahora(); this.limpia(ahora);
      const inv = this.invitaciones.get(id);
      if (!inv || inv.a !== a) return { ok: false, codigo: "no_existe" };
      if (this.porHogar.has(a)) return { ok: false, codigo: "ya_en_un_corro" };
      this.invitaciones.delete(id);
      const disp = await this.d.puertas.disponibles([inv.de, a]);
      if (!disp.has(a)) return { ok: false, codigo: "no_puedes" };
      if (!disp.has(inv.de)) return { ok: false, codigo: "no_disponible" };
      let c = this.corros.get(this.porHogar.get(inv.de) ?? "");
      const miembros = c ? [...c.miembros.keys()] : [inv.de];
      if (miembros.length >= CORRO_MAX_HOGARES) return { ok: false, codigo: "corro_lleno" };
      if (await this.d.puertas.bloqueo(a, miembros)) return { ok: false, codigo: "no_disponible" };
      this.rechazos.delete(inv.de + ">" + a);
      if (!c) {
        c = { id: nuevoId(), miembros: new Map(), creado: ahora };
        this.corros.set(c.id, c);
        c.miembros.set(inv.de, { hogar: inv.de, desde: ahora, visto: ahora }); this.porHogar.set(inv.de, c.id);
        await this.d.audita(inv.de, "corro.entra", { corro: c.id, hogar: inv.de, con: String(a), crea: true });
      }
      const con = [...c.miembros.keys()].join(",");
      c.miembros.set(a, { hogar: a, desde: ahora, visto: ahora }); this.porHogar.set(a, c.id);
      await this.d.audita(a, "corro.entra", { corro: c.id, hogar: a, con, invito: inv.de });
      this.avisa([...c.miembros.keys()]);
      return { ok: true, corro: c.id, sala: SALA_CORRO(c.id) };
    });
  }

  /** «Ahora no»: la invitación se va; dos seguidas de la misma persona a la misma persona → 24 h de veto. Códigos: no_existe. */
  rechaza(a: number, id: string): Promise<Resultado<{ veto: boolean }>> {
    return this.enOrden(async () => {
      const ahora = this.ahora(); this.limpia(ahora);
      const inv = this.invitaciones.get(id);
      if (!inv || inv.a !== a) return { ok: false, codigo: "no_existe" };
      this.invitaciones.delete(id);
      const k = inv.de + ">" + a, r = this.rechazos.get(k) ?? { seguidos: 0, vetoHasta: 0 };
      r.seguidos++;
      const veto = r.seguidos >= AHORA_NO_SEGUIDOS;
      if (veto) { r.seguidos = 0; r.vetoHasta = ahora + VETO_MS; }
      this.rechazos.set(k, r);
      await this.d.audita(a, "corro.ahora_no", { hogar: a, de: inv.de, veto });
      this.avisa([inv.de]);
      return { ok: true, veto };
    });
  }

  /** Quien invitó la retira antes de que respondan (idempotente). */
  cancela(de: number, id: string): Promise<Resultado> {
    return this.enOrden(async () => {
      const inv = this.invitaciones.get(id);
      if (inv && inv.de === de) { this.invitaciones.delete(id); this.avisa([inv.a]); }
      return { ok: true };
    });
  }

  // ---------------------------------------------------------------- salir y deshacer

  /** Sale de su corro (si está en uno) y se van sus invitaciones enviadas. Si quedan menos de dos, el corro se deshace (DeleteRoom). */
  sale(hogar: number, motivo: MotivoSalida, actor: number | null = hogar): Promise<{ estaba: boolean }> {
    return this.enOrden(() => this.saleDentro(hogar, motivo, actor));
  }
  /** Para suspender, expulsar, retirar el consentimiento o apagar el ajuste: además se van TODAS sus invitaciones (enviadas y recibidas). */
  sacaHogar(hogar: number, motivo: MotivoSalida, actor: number | null): Promise<{ estaba: boolean }> {
    return this.enOrden(async () => {
      for (const [id, i] of this.invitaciones) if (i.a === hogar || i.de === hogar) this.invitaciones.delete(id);
      return this.saleDentro(hogar, motivo, actor);
    });
  }
  /** El interruptor general se apaga: se deshacen todos los corros y se van todas las invitaciones. Devuelve cuántos corros había. */
  apagaTodo(actor: number | null): Promise<number> {
    return this.enOrden(async () => {
      this.invitaciones.clear();
      const n = this.corros.size;
      for (const c of [...this.corros.values()]) await this.deshaz(c, "interruptor", actor);
      return n;
    });
  }
  private async saleDentro(hogar: number, motivo: MotivoSalida, actor: number | null): Promise<{ estaba: boolean }> {
    for (const [id, i] of this.invitaciones) if (i.de === hogar) this.invitaciones.delete(id);
    const id = this.porHogar.get(hogar), c = id ? this.corros.get(id) : undefined;
    if (!c) return { estaba: false };
    c.miembros.delete(hogar); this.porHogar.delete(hogar);
    await this.d.audita(actor, "corro.sale", { corro: c.id, hogar, motivo });
    try { await this.d.sala.expulsaHogar(SALA_CORRO(c.id), this.d.prefijo(hogar)); }
    catch (e) { this.d.log.warn({ err: (e as Error).message, corro: c.id }, "corros: no se pudo sacar de la sala del corro (su token ya no se renueva)"); }
    if (c.miembros.size < 2) await this.deshaz(c, "menos_de_dos", actor);
    this.avisa([hogar, ...c.miembros.keys()]);
    return { estaba: true };
  }
  private async deshaz(c: Corro, motivo: "menos_de_dos" | "interruptor", actor: number | null): Promise<void> {
    const quedaban = [...c.miembros.keys()];
    for (const h of quedaban) this.porHogar.delete(h);
    c.miembros.clear(); this.corros.delete(c.id);
    await this.d.audita(actor, "corro.deshecho", { corro: c.id, motivo, quedaban: quedaban.join(",") });
    try { await this.d.sala.borraSala(SALA_CORRO(c.id)); }
    catch (e) { this.d.log.warn({ err: (e as Error).message, corro: c.id }, "corros: no se pudo borrar la sala del corro"); }
    this.avisa(quedaban);
  }

  /**
   * El barrido (cada BARRIDO_MS, lo arranca corro_rutas.ts): mira quién tiene alguna conexión en la sala de su corro; quien pasa AUSENTE_MS sin ninguna (contando
   * desde que entró) sale con motivo «desconectado». Si LiveKit no responde, no saca a nadie (no se sabe). Devuelve cuántos salieron.
   */
  barre(): Promise<number> {
    return this.enOrden(async () => {
      const ahora = this.ahora(); this.limpia(ahora);
      let n = 0;
      for (const c of [...this.corros.values()]) {
        let dentro: string[];
        try { dentro = (await this.d.sala.presentes(SALA_CORRO(c.id))).map(p => p.identidad); } catch { continue; }
        for (const m of [...c.miembros.values()]) {
          if (!this.corros.has(c.id)) break;
          const pre = this.d.prefijo(m.hogar);
          if (dentro.some(i => esDelHogar(i, pre))) { m.visto = ahora; continue; }
          if (ahora - Math.max(m.desde, m.visto) > AUSENTE_MS) { await this.saleDentro(m.hogar, "desconectado", null); n++; }
        }
      }
      return n;
    });
  }

  /** Al apagar la api: se olvida todo (no toca LiveKit). */
  cierra(): void { this.corros.clear(); this.porHogar.clear(); this.invitaciones.clear(); this.enviadas.clear(); this.rechazos.clear(); }
}

/** ¿Es un id de corro o de invitación con la forma que da la api? (12 caracteres base64url) */
export const esIdCorro = (s: string): boolean => PATRON_ID_CORRO.test(s);

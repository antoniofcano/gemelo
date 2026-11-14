// Lo puro de la visita guiada compartida en los interiores (decisiones 233-238; el acuerdo de la visita compartida, §2 y §4): sin three, sin DOM y sin red.
// Lo usan guiada.ts (el seguimiento de la familia: el aviso «El guía va a la parada N» o «La visita está en la fábrica»), index.ts (el puesto al llegar) y
// maquinas.ts (la marcha del grupo); lo prueba guiada-puro.test.ts en Vitest.
//   · lee(x): el evento del Bus «guiada:visita» {mundo, parada, maquinas, n, soyGuia} (lo emite la presencia al leer los metadatos de la sala), comprobado;
//   · decide(v, antes, ctx): si hay que ofrecer algo a quien no es el guía y qué (ir a una parada de su mundo, o al mundo donde está la visita);
//   · puesto(parada, identidad, cabe): dónde dejar a cada uno en un anillo alrededor de la parada mirando a su ancla, repartido por identidad. El anillo es
//     el de «Ir con alguien» (Encuentro.punto, regla 12) con las zonas del interior como «dentro»;
//   · maquinas(m, reducido, paraMi, soyGuia): quién manda en las máquinas y qué marcha toca en este aparato («reducir movimiento» manda siempre).
// Marcos: los de puro.ts. La parada va en [x, y, z] del glb; quien anda, en (x, −z); su ang avanza por (sin ang, cos ang).
import type { Parada } from "../../datos/contratos/mundo-interior.ts";
import type { Pose2 } from "../../nucleo/mundos.ts";
import { Encuentro } from "../comun/muneco.ts";
import { VisitaPuro } from "./visita-puro.ts";

/** Los mundos de la pose (contratos/livekit-roles.json, mundos_pose, sin «otro»): adónde puede estar la visita */
export const MUNDOS_VISITA = ["exterior", "patios", "fabrica"] as const;
export type MundoVisita = (typeof MUNDOS_VISITA)[number];
export interface MaquinasGuiada { marcha: boolean; desde: number }
/** El evento «guiada:visita» del Bus (contratos/eventos.json) */
export interface VisitaGuiada { mundo: MundoVisita; parada: number | null; maquinas: MaquinasGuiada | null; n: number; soyGuia: boolean }

const ent = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** El evento comprobado, o null si no se entiende (entonces no se hace nada: lo que llega de la sala es dato de otros) */
function lee(x: unknown): VisitaGuiada | null {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || !(MUNDOS_VISITA as readonly unknown[]).includes(o.mundo) || !ent(o.n) || o.n < 0) return null;
  const p = o.parada === null || o.parada === undefined ? null : ent(o.parada) && o.parada >= 0 && o.parada <= 63 ? o.parada : undefined;
  if (p === undefined) return null;
  let m: MaquinasGuiada | null = null;
  if (o.maquinas !== null && o.maquinas !== undefined) {
    const q = o.maquinas as Record<string, unknown>;
    if (!q || typeof q !== "object" || typeof q.marcha !== "boolean" || typeof q.desde !== "number" || !isFinite(q.desde)) return null;
    m = { marcha: q.marcha, desde: q.desde };
  }
  return { mundo: o.mundo as MundoVisita, parada: p, maquinas: m, n: o.n, soyGuia: o.soyGuia === true };
}

/** «la fábrica», «los patios», «fuera» (para «La visita está en la fábrica»); un mundo sin nombre conocido, tal cual */
function enMundo(m: string): string {
  return m === "fabrica" ? "en la fábrica" : m === "patios" ? "en los patios" : m === "exterior" ? "fuera, en el cortijo" : "en «" + m + "»";
}

export type Aviso = { tipo: "nada" } | { tipo: "parada"; k: number; texto: string } | { tipo: "mundo"; mundo: MundoVisita; parada: number | null; texto: string };
const NADA: Aviso = { tipo: "nada" };

/**
 * ¿Qué se ofrece a quien no es el guía? v = lo que acaba de llegar, antes = lo último que se atendió (null al entrar en la sala: quien llega tarde),
 * ctx = el mundo en el que está y las paradas de ese mundo (sus títulos; vacío fuera de un interior con visita).
 *  · al guía, nada (él lo ha pedido); a un evento viejo o repetido (n no sube), nada;
 *  · la visita en otro mundo: «La visita está en la fábrica» (solo si cambió el mundo, o al llegar tarde: no se insiste en cada cambio de parada);
 *  · en el mismo mundo, con una parada que este mundo tiene y que cambió (o al llegar tarde): «El guía va a la parada N · título»;
 *  · solo las máquinas cambiaron, o una parada que el mundo no tiene (el cliente la ignora: acuerdo §2): nada.
 */
function decide(v: VisitaGuiada, antes: VisitaGuiada | null, ctx: { mundo: string; titulos: readonly string[] }): Aviso {
  if (v.soyGuia || (antes && v.n <= antes.n)) return NADA;
  if (v.mundo !== ctx.mundo) {
    if (antes && antes.mundo === v.mundo) return NADA;
    return { tipo: "mundo", mundo: v.mundo, parada: v.parada, texto: "La visita está " + enMundo(v.mundo) };
  }
  const k = v.parada;
  if (k === null || k >= ctx.titulos.length) return NADA;
  if (antes && antes.mundo === v.mundo && antes.parada === k) return NADA;
  return { tipo: "parada", k, texto: "El guía va a la parada " + (k + 1) + " · " + ctx.titulos[k] };
}

/** FNV-1a de 32 bits: el reparto por identidad (la misma identidad, el mismo sitio en cada parada; dos distintas, casi siempre sitios distintos) */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** el anillo: 12 rumbos (cada 30°, los de Encuentro) en dos radios, 24 sitios; cuánto cabe una persona (m) [SUPUESTO: sin probar con 15 avatares] */
const SITIOS = 12, CUERPO = 0.35;
/** los radios del anillo para una parada de radio r: dentro de r + la histéresis de la visita (si no, la ficha se cerraría al llegar) */
function radios(r: number, impar: boolean): number[] {
  const tope = r + VisitaPuro.HISTERESIS - 0.2, a = Math.min(tope, Math.max(0.9, 0.8 * r)), b = Math.min(tope, Math.max(1.3, 1.15 * r)), c = Math.max(0.5, 0.55 * r);
  return impar ? [b, a, c] : [a, b, c];
}
/** ¿cabe una persona en (x, y)? el punto y cuatro a CUERPO m, dentro (las zonas del interior: fuera es pared) */
function cabeCon(dentro: (x: number, y: number) => boolean): (x: number, y: number) => boolean {
  return (x, y) => dentro(x, y) && dentro(x + CUERPO, y) && dentro(x - CUERPO, y) && dentro(x, y + CUERPO) && dentro(x, y - CUERPO);
}

/**
 * El puesto de una persona al «Ir» a la parada: en un anillo alrededor de parada.pos, en el rumbo que le toca por su identidad (y, si ahí no cabe, los de
 * al lado y los otros radios: Encuentro.punto), mirando al ancla de la parada. Si no cabe en ninguno, en la propia parada (si cabe) o null (no se mueve).
 */
function puesto(p: Pick<Parada, "pos" | "radio" | "ancla">, identidad: string, dentro: (x: number, y: number) => boolean): Pose2 | null {
  const h = hash(identidad || "?"), a = (h % SITIOS) * (Math.PI * 2 / SITIOS), cx = p.pos[0], cy = -p.pos[2], cabe = cabeCon(dentro);
  const e = Encuentro.punto({ x: cx, y: cy }, { x: cx + Math.cos(a), y: cy + Math.sin(a) }, [], null, { dists: radios(p.radio, (h >>> 8) % 2 === 1), dentro: cabe });
  let x: number, y: number;
  if (e && cabe(e.x, e.y)) { x = e.x; y = e.y; } else if (cabe(cx, cy)) { x = cx; y = cy; } else return null;
  return { x, y, ang: VisitaPuro.angHacia(x, y, p.ancla.pos) };
}

export type MandoMaquinas = { mando: "propio" } | { mando: "guia"; marcha: boolean; grupo: boolean; motivo: "grupo" | "reducido" | "paraMi" };
/**
 * Quién manda en las máquinas de este aparato. Sin estado del guía (m null: nadie las ha tocado en la guiada, o fuera de ella), cada uno el suyo, como
 * siempre. Con él, la marcha del grupo, salvo «reducir movimiento» (paradas: lo de cada aparato nunca se pisa, decisión 236) o «parar para mí».
 */
function maquinas(m: MaquinasGuiada | null, reducido: boolean, paraMi: boolean): MandoMaquinas {
  if (!m) return { mando: "propio" };
  if (reducido) return { mando: "guia", marcha: false, grupo: m.marcha, motivo: "reducido" };
  if (paraMi) return { mando: "guia", marcha: false, grupo: m.marcha, motivo: "paraMi" };
  return { mando: "guia", marcha: m.marcha, grupo: m.marcha, motivo: "grupo" };
}

export const GuiadaPuro = { MUNDOS_VISITA, lee, enMundo, decide, hash, radios, puesto, maquinas };

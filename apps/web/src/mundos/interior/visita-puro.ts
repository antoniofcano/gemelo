// Lo puro de la visita del museo (eje B; contrato contratos/mundo-interior.md v1.1, §1c): sin three, sin DOM y sin red. Lo usa visita.ts (marcas,
// ficha en pantalla y fila del panel de VR) y lo prueba visita-puro.test.ts en Vitest.
//   · comprueba: lo que el motor necesita de paradas[] y fuentes[] para no romperse (la validación entera es de tuberia/interiores/valida.js al
//     entregar). Si no vale, el interior entra igual, sin visita: la visita es opcional y no debe cerrar la puerta de la fábrica;
//   · el recorrido: en qué parada se está (radio, con histéresis para no abrir y cerrar la ficha al pasear por el borde) y cuál es la siguiente;
//   · la ficha: sus etiquetas de procedencia (regla 5), sus fuentes numeradas como en el texto ([n] = fuentes[n-1] del mundo), lo pendiente (solo
//     cuántas preguntas quedan: nunca como hecho) y, para el lienzo del panel de VR, el texto partido en líneas y en páginas.
// Marcos: los de puro.ts. La parada va en [x, y, z] del glb; quien anda, en (x, −z); su ang avanza por (sin ang, cos ang).
import type { Ficha, Fuente, MundoInterior, Parada } from "../../datos/contratos/mundo-interior.ts";

/** lo que hay que alejarse además del radio para que la ficha se cierre y la parada se pueda volver a abrir (m) [SUPUESTO: sin probar andando] */
const HISTERESIS = 0.8;
const num = (v: unknown): v is number => typeof v === "number" && isFinite(v);
const tres = (v: unknown): v is number[] => Array.isArray(v) && v.length === 3 && v.every(num);

/** Lo que el motor comprueba de la visita (vacío = vale). Sin paradas no hay visita y no es un error. */
function valida(m: Pick<MundoInterior, "paradas" | "fuentes" | "puertas">): string[] {
  const e: string[] = [];
  if (m.paradas === undefined) return e;
  if (!Array.isArray(m.paradas) || !m.paradas.length || m.paradas.length > 16) return ["paradas: de 1 a 16"];
  if (m.fuentes !== undefined && (!Array.isArray(m.fuentes) || m.fuentes.some(f => !f || typeof f.id !== "string" || typeof f.cita !== "string"))) e.push("fuentes: {id, cita}");
  const ids = new Set<string>();
  m.paradas.forEach((p, i) => {
    const q = p as Partial<Parada> | null;
    if (!q || typeof q.id !== "string" || !q.id) { e.push("paradas[" + i + "].id"); return; }
    if (ids.has(q.id)) e.push("parada repetida: " + q.id);
    ids.add(q.id);
    if (!tres(q.pos)) e.push("la parada «" + q.id + "»: pos [x, y, z]");
    if (!num(q.radio) || q.radio <= 0) e.push("la parada «" + q.id + "»: radio");
    if (!q.ancla || !tres(q.ancla.pos)) e.push("la parada «" + q.id + "»: ancla.pos");
    const f = q.ficha as Partial<Ficha> | undefined;
    if (!f || typeof f.titulo !== "string" || typeof f.texto !== "string" || typeof f.procedencia_visible !== "string" || !Array.isArray(f.procedencia_texto) || !Array.isArray(f.fuentes)) e.push("la parada «" + q.id + "»: ficha");
  });
  return e;
}

/** ang de quien anda en (x, y) para mirar al punto [x, y, z] del glb */
function angHacia(x: number, y: number, p: readonly number[]): number {
  return Math.atan2(p[0]! - x, -p[2]! - y);
}

/** distancia en planta de quien anda (x, y) a la parada */
function aParada(p: Pick<Parada, "pos">, x: number, y: number): number {
  return Math.hypot(x - p.pos[0], y + p.pos[2]);
}

export type ModoVisita = "oferta" | "libre" | "visita";
export interface EventoVisita { abre?: number; cierra?: number }

/**
 * El recorrido. modo «oferta» al entrar (se ofrece, sin bloquear: se anda igual), «libre» (pasear sin visita) o «visita». En la visita, paso(x, y)
 * cada fotograma: al entrar en el radio de una parada se abre su ficha (sea la siguiente o no: quien visita manda) y la siguiente pasa a ser la de
 * después; al alejarse radio + HISTERESIS se cierra y la parada se puede volver a abrir. Sin reservas por fotograma (el evento es siempre el mismo objeto).
 */
function creaRecorrido(paradas: ReadonlyArray<Pick<Parada, "pos" | "radio">>, histeresis = HISTERESIS) {
  const n = paradas.length, armada = paradas.map(() => true), vista = paradas.map(() => false), ev: EventoVisita = {};
  let modo: ModoVisita = "oferta", sig = 0, abierta = -1;
  // al empezar, todas armadas: si se está ya en una (la primera suele ser la llegada), se abre en el siguiente paso
  function empieza(): void { modo = "visita"; sig = 0; abierta = -1; vista.fill(false); armada.fill(true); }
  function deja(): void { modo = "libre"; abierta = -1; }
  function paso(x: number, y: number): EventoVisita | null {
    if (modo !== "visita") return null;
    ev.abre = undefined; ev.cierra = undefined;
    if (abierta >= 0 && aParada(paradas[abierta]!, x, y) > paradas[abierta]!.radio + histeresis) { ev.cierra = abierta; abierta = -1; }
    for (let i = 0; i < n; i++) {
      const p = paradas[i]!, d = aParada(p, x, y);
      if (!armada[i]) { if (d > p.radio + histeresis) armada[i] = true; continue; }
      if (d < p.radio && i !== abierta) {
        armada[i] = false; vista[i] = true; abierta = i; sig = i + 1; ev.abre = i;
        break;
      }
    }
    return ev.abre !== undefined || ev.cierra !== undefined ? ev : null;
  }
  /** «Siguiente parada»: cierra la ficha abierta y devuelve el índice de la siguiente (o −1 si se acabó) */
  function siguiente(): number { abierta = -1; return sig < n ? sig : -1; }
  function cierra(): void { abierta = -1; }
  /** Ir a la parada k impuesto desde fuera (la visita guiada: «Ir» al aviso del guía): la visita en marcha si no lo estaba, la ficha de k abierta (la que
   *  hubiera, cerrada) y la siguiente, la de después. La parada queda desarmada hasta alejarse, como al llegar andando. Devuelve el evento, o null si k no existe. */
  function vaA(k: number): EventoVisita | null {
    if (!Number.isInteger(k) || k < 0 || k >= n) return null;
    if (modo !== "visita") { modo = "visita"; vista.fill(false); armada.fill(true); }
    ev.cierra = abierta >= 0 && abierta !== k ? abierta : undefined; ev.abre = k;
    armada[k] = false; vista[k] = true; abierta = k; sig = k + 1;
    return ev;
  }
  return {
    empieza, deja, paso, siguiente, cierra, vaA,
    modo: (): ModoVisita => modo, sig: (): number => sig, abierta: (): number => abierta,
    vista: (i: number): boolean => !!vista[i], fin: (): boolean => modo === "visita" && sig >= n,
  };
}
export type Recorrido = ReturnType<typeof creaRecorrido>;

const VISIBLE: Record<string, string> = { medido: "medido", deducido: "deducido", ilustrativo: "ilustrativo (modelado a mano)" };
const TEXTO: Record<string, string> = { documentado: "documentado con fuentes", testimonio: "testimonio de la familia", sin_fuente: "sin fuente" };

/** Las etiquetas de procedencia de la ficha (regla 5), en llano */
function etiquetas(f: Pick<Ficha, "procedencia_visible" | "procedencia_texto">): { visible: string; texto: string } {
  const t = (f.procedencia_texto || []).map(x => TEXTO[x] || x);
  return { visible: "Lo que ves: " + (VISIBLE[f.procedencia_visible] || f.procedencia_visible), texto: "Lo que cuenta: " + (t.length > 1 ? t.slice(0, -1).join(", ") + " y " + t[t.length - 1] : t[0] || "sin fuente") };
}

/** Lo pendiente: cuántas preguntas quedan abiertas (nunca qué dicen: no está confirmado), o null */
function pendiente(f: Pick<Ficha, "pendiente">): string | null {
  const k = Array.isArray(f.pendiente) ? f.pendiente.length : 0;
  return k ? (k === 1 ? "Queda 1 pregunta abierta sobre esta parada" : "Quedan " + k + " preguntas abiertas sobre esta parada") + ": lo que no está confirmado no se cuenta." : null;
}

export interface FuenteFicha { n: number; cita: string; url: string | null; verificada: boolean }
/** Las fuentes de la ficha, con el número de su [n] en el texto (su puesto en fuentes[] del mundo); una url solo si es https:// */
function fuentesDe(f: Pick<Ficha, "fuentes">, todas: readonly Fuente[] | undefined): FuenteFicha[] {
  const l = todas || [], out: FuenteFicha[] = [];
  for (const id of f.fuentes || []) {
    const k = l.findIndex(x => x.id === id);
    if (k < 0) continue;
    const x = l[k]!;
    out.push({ n: k + 1, cita: x.cita, url: typeof x.url === "string" && /^https:\/\/[^ ]+$/.test(x.url) ? x.url : null, verificada: x.verificada !== false });
  }
  return out.sort((a, b) => a.n - b.n);
}
/** una fuente en una línea: «[n] cita · solo extracto, sin verificar» */
function fuenteTexto(x: FuenteFicha): string { return "[" + x.n + "] " + x.cita + (x.verificada ? "" : " · solo extracto, sin verificar"); }

/** El nombre de un mundo para enseñarlo («bodega» → «Bodega») [SUPUESTO: con el id basta hasta que el índice traiga nombres de mundos] */
function nombreMundo(id: string): string { const t = id.replace(/-/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); }

/** La puerta con la que sigue el recorrido (parada.puerta): adónde lleva y si se puede ir ya (si no, «próximamente») */
function sigue(p: Pick<Parada, "puerta">, puertas: MundoInterior["puertas"], existe: (a: string) => boolean): { puerta: string; a: string; texto: string; abierta: boolean } | null {
  if (!p.puerta) return null;
  const pu = puertas.find(x => x.id === p.puerta);
  if (!pu) return null;
  const abierta = pu.a === "exterior" || existe(pu.a);
  return { puerta: pu.id, a: pu.a, abierta, texto: abierta ? nombreMundo(pu.a) + ", por esa puerta" : nombreMundo(pu.a) + ": próximamente" };
}

/** Parte un texto en líneas de como mucho porLinea caracteres, por palabras (una palabra más larga va sola en su línea). */
function envuelve(t: string, porLinea: number): string[] {
  const out: string[] = []; let l = "";
  for (const w of String(t || "").split(/\s+/).filter(Boolean)) {
    if (l && l.length + 1 + w.length > porLinea) { out.push(l); l = w; } else l = l ? l + " " + w : w;
  }
  if (l) out.push(l);
  return out;
}

export type EstiloLinea = "cuerpo" | "destacado" | "etiqueta" | "pie";
export interface LineaFicha { t: string; e: EstiloLinea }
/**
 * La ficha para el lienzo del panel de VR, en páginas de porPagina líneas de porLinea caracteres: el texto; el dato curioso, la nota de lo que se ve,
 * las etiquetas y lo pendiente; y las fuentes, siempre en página aparte (plegadas: se llega a ellas pasando página). Al menos una página.
 */
function paginas(f: Ficha, todas: readonly Fuente[] | undefined, porLinea: number, porPagina: number, extra?: string | null): LineaFicha[][] {
  const pag: LineaFicha[][] = [];
  const llena = (lineas: LineaFicha[]): void => { for (let i = 0; i < lineas.length; i += porPagina) pag.push(lineas.slice(i, i + porPagina)); };
  const de = (t: string, e: EstiloLinea): LineaFicha[] => envuelve(t, porLinea).map(x => ({ t: x, e }));
  const a: LineaFicha[] = de(f.texto, "cuerpo");
  if (f.dato_curioso) a.push(...de("Dato curioso: " + f.dato_curioso, "destacado"));
  const et = etiquetas(f), pe = pendiente(f);
  a.push(...de(et.visible + (f.nota_visible ? ". " + f.nota_visible : ""), "etiqueta"), ...de(et.texto, "etiqueta"));
  if (pe) a.push(...de(pe, "etiqueta"));
  if (extra) a.push(...de(extra, "etiqueta"));
  llena(a);
  const fu = fuentesDe(f, todas);
  if (fu.length) llena([{ t: "Fuentes", e: "destacado" }, ...fu.flatMap(x => de(fuenteTexto(x), "pie"))]);
  return pag.length ? pag : [[]];
}

export const VisitaPuro = { HISTERESIS, valida, angHacia, aParada, creaRecorrido, etiquetas, pendiente, fuentesDe, fuenteTexto, nombreMundo, sigue, envuelve, paginas };

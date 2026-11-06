// La lógica pura de las entidades y los usables (antes el trozo [puro] de apps/web/motor/02e_entidades.js; ADR-0023, C7; MUNDOS §9.4, pieza 5):
// ids «tipo:resto», validación de la definición de un tipo, quién gana al tocar o al apuntar con el rayo, cercanía y las dos líneas de una ficha pequeña.
// Sin DOM ni THREE ni globales del legado. El registro (Entidades) y la selección (Usables) quedan en 02e_entidades.js: tocan el DOM, el Bus y la escena.
//   Entidades.registra({ tipo, dueno, prioridad, fondo?, ficha(id, modo), pantalla?(cx, cy, rect), rayo?(raycaster), cerca?(x, y), radioCerca?,
//     pos?(id) → {x, y, z} (escena), radio?(id) → m, existe?(id), lista?() → [{ id, … }], muestra?(id, modo) → true si la enseña él (su propio recuadro),
//     abierta?() → id que tiene abierto por su cuenta (la baliza, por cercanía), cierra?(id), suelta?(), sinAnillo?: true }) → quita
// Ids: «tipo:resto», p. ej. olivo:<finca>:<copas_id> (ADR-0012), baliza:<parcela>, haza:<id>, persona:<id>.

/** un candidato a ser lo elegido: lo que devuelven pantalla / rayo / cerca de cada tipo, con la prioridad y el fondo del tipo */
export interface Candidato { id: string; prioridad?: number; fondo?: boolean; s?: number; t?: number; d?: number; radio?: number }
export type ComoGana = "toque" | "rayo";
/** la ficha común (texto llano, nunca HTML) */
export interface FichaEntidad { titulo?: string; filas?: Array<{ k: string; v: string; de?: string }>; lineas?: string[]; color?: string; destacado?: boolean; gente?: unknown; pie?: string; acciones?: Array<{ id: string; txt: string; fn: () => void }> }

const TIPO = /^[a-z][a-z0-9-]*$/;
const OPC = ["pantalla", "rayo", "cerca", "pos", "radio", "existe", "lista", "muestra", "abierta", "cierra", "suelta"];

function id(tipo: unknown, ...resto: unknown[]): string { return ([tipo] as unknown[]).concat(resto.map(String)).join(":"); }
function tipoDe(x: unknown): string { const s = String(x == null ? "" : x), i = s.indexOf(":"); return i > 0 ? s.slice(0, i) : ""; }
function resto(x: unknown): string { const s = String(x == null ? "" : x), i = s.indexOf(":"); return i > 0 ? s.slice(i + 1) : ""; }

// la definición de un tipo: la lista de errores (vacía si vale)
function valida(def: unknown): string[] {
  if (!def || typeof def !== "object") return ["la definición no es un objeto"];
  const d = def as Record<string, unknown>, e: string[] = [];
  if (typeof d.tipo !== "string" || !TIPO.test(d.tipo)) e.push("tipo: minúsculas, cifras y guiones, empezando por letra");
  if (typeof d.dueno !== "string" || !d.dueno) e.push("dueno: el módulo que la gestiona");
  if (typeof d.prioridad !== "number" || !isFinite(d.prioridad)) e.push("prioridad: número (al tocar, gana la mayor)");
  if (typeof d.ficha !== "function") e.push("ficha(id, modo): función");
  OPC.forEach(function (k) { if (d[k] !== undefined && typeof d[k] !== "function") e.push(k + ": función"); });
  if (d.cerca && !(typeof d.radioCerca === "number" && d.radioCerca > 0)) e.push("radioCerca: metros > 0 (con cerca)");
  if (!d.pantalla && !d.rayo && !d.cerca && !d.lista) e.push("ni pantalla, ni rayo, ni cerca, ni lista: nadie podría llegar a ella");
  return e;
}

// el que gana entre candidatos [{ id, prioridad, fondo, s, t }]; como = "toque" (pantalla) o "rayo" (VR). null si no hay ninguno
function gana(cands: Candidato[] | null | undefined, como: ComoGana | string): Candidato | null {
  let l = (cands || []).filter(function (c) { return c && typeof c.id === "string" && c.id; });
  const delante = l.filter(function (c) { return !c.fondo; });
  if (delante.length) l = delante;
  if (!l.length) return null;
  if (como === "rayo") {   // el primero por el rayo; lo que está a menos de 0,5 m de él cuenta como «a la vez» y decide la prioridad
    const t0 = Math.min.apply(null, l.map(function (c) { return c.t || 0; }));
    l = l.filter(function (c) { return (c.t || 0) < t0 + 0.5; });
  }
  let m = l[0] as Candidato;
  for (let i = 1; i < l.length; i++) {
    const c = l[i] as Candidato, dp = (c.prioridad || 0) - (m.prioridad || 0), ds = (c.s || 0) - (m.s || 0), dt = (c.t || 0) - (m.t || 0);
    if (dp > 0 || (dp === 0 && (ds < 0 || (ds === 0 && (dt < 0 || (dt === 0 && c.id < m.id)))))) m = c;
  }
  return m;
}

// la cercanía: de [{ id, d, radio }] el más cerca dentro de su radio (d < radio), o null
function cercano(cands: Candidato[] | null | undefined): Candidato | null {
  let m: Candidato | null = null;
  (cands || []).forEach(function (c) { if (c && typeof c.id === "string" && (c.d as number) >= 0 && (c.d as number) < (c.radio as number) && (!m || (c.d as number) < (m.d as number))) m = c; });
  return m;
}

// las dos líneas de una ficha sin «lineas» propias para una lámina pequeña (VR): «k: v» de tres en tres, como la ficha del olivo de siempre
function lineas(f?: FichaEntidad | null): string[] {
  if (f && Array.isArray(f.lineas)) return f.lineas.slice();
  const p = ((f && f.filas) || []).map(function (q) { return q.k + ": " + q.v; });
  return [p.slice(0, 3).join(" · "), p.slice(3).join(" · ")];
}

export const EntidadesPuro = { TIPO, id, tipoDe, resto, valida, gana, cercano, lineas };

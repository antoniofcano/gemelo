// Dobles del DOM para las pruebas de Vitest de ui/ (A3-7a, MU5-n). Solo lo importan los *.test.ts: no es parte del motor ni del paquete.
// Vitest corre en Node sin DOM (MUNDOS §9.2); estos dobles dan lo justo para montar cada pieza de la interfaz y comprobar su libera(): elementos con hijos,
// atributos, clases, estilo y selectores sencillos (#id, .clase, etiqueta, [atributo], [atributo="valor"], descendientes y listas con coma), escuchas
// contadas (cuántas siguen vivas), relojes contados (setTimeout/setInterval que siguen vivos) y observadores contados. NO es un navegador: ni maquetación
// (los rectángulos miden 0), ni foco de verdad, ni CSS. Lo que dependa de eso se prueba en el banco.
import type { T } from "./tipos.ts";

export interface Mundo {
  documento: T; ventana: T; el(tag: string, id?: string): T;
  /** escuchas vivas (addEventListener − removeEventListener), en elementos, documento y ventana */
  escuchas(): number;
  /** relojes vivos: setInterval sin clearInterval y setTimeout sin disparar ni cancelar */
  relojes(): number;
  /** observadores (MutationObserver) sin desconectar */
  observadores(): number;
  /** dispara los setTimeout pendientes (una pasada) */
  avanza(): void;
  /** los setInterval vivos, por si una prueba quiere llamarlos */
  intervalos(): Array<() => void>;
  limpia(): void;
}

function partes(sel: string) {
  return sel.split(",").map(g => g.trim().split(/\s+/).map(c => {
    const r: T = { tag: null, id: null, clases: [] as string[], attrs: [] as Array<[string, string | null]> };
    const re = /([#.]?)([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g; let m: T;
    while ((m = re.exec(c))) { if (m[3]) r.attrs.push([m[3], m[4] === undefined ? null : m[4]]); else if (m[1] === "#") r.id = m[2]; else if (m[1] === ".") r.clases.push(m[2]); else r.tag = m[2].toUpperCase(); }
    return r;
  }));
}
function casa(e: T, c: T) {
  if (!e || !e.tagName) return false;
  if (c.tag && e.tagName !== c.tag) return false;
  if (c.id && e.id !== c.id) return false;
  for (const k of c.clases) if (!e.classList.contains(k)) return false;
  for (const [k, v] of c.attrs) { const a = e.getAttribute(k); if (a === null || a === undefined || (v !== null && a !== v)) return false; }
  return true;
}
function casaGrupo(e: T, g: T[]) {
  if (!casa(e, g[g.length - 1])) return false;
  let i = g.length - 2, p = e.parentNode;
  for (; i >= 0 && p; p = p.parentNode) if (casa(p, g[i])) i--;
  return i < 0;
}

export function creaMundo(opc: { busqueda?: string; coarse?: boolean } = {}): Mundo {
  let vivas = 0, obs = 0;
  const tiempos = new Map<number, () => void>(), intervalos = new Map<number, () => void>(); let sig = 1;
  function escuchable(o: T) {
    const l: Record<string, Array<(e: T) => void>> = {};
    o.addEventListener = (t: string, f: T) => { (l[t] = l[t] || []).push(f); vivas++; };
    o.removeEventListener = (t: string, f: T) => { const a = l[t], i = a ? a.indexOf(f) : -1; if (i >= 0) { a!.splice(i, 1); vivas--; } };
    o.dispatchEvent = (e: T) => { if (!e.target) e.target = o; (l[e.type] || []).slice().forEach(f => f(e)); return true; };
    o._escuchas = l;
    return o;
  }
  function el(tag: string, id?: string): T {
    const attrs: Record<string, string> = {}, clases = new Set<string>();
    const e: T = escuchable({ tagName: tag.toUpperCase(), children: [] as T[], parentNode: null, hidden: false, style: { cssText: "", setProperty(k: string, v: string) { e.style[k] = v; } },
      classList: { add: (...c: string[]) => c.forEach(x => clases.add(x)), remove: (...c: string[]) => c.forEach(x => clases.delete(x)), contains: (c: string) => clases.has(c),
        toggle: (c: string, si?: boolean) => { const v = si === undefined ? !clases.has(c) : !!si; if (v) clases.add(c); else clases.delete(c); return v; } },
      clientWidth: 1000, clientHeight: 700, offsetWidth: 0, offsetHeight: 0, offsetLeft: 0, offsetTop: 0, value: "", checked: false, disabled: false, tabIndex: 0, title: "" });
    Object.defineProperty(e, "className", { get: () => [...clases].join(" "), set: (v: string) => { clases.clear(); String(v).split(/\s+/).filter(Boolean).forEach(x => clases.add(x)); } });
    Object.defineProperty(e, "id", { get: () => attrs.id || "", set: (v: string) => { attrs.id = v; } });
    let texto = "";
    Object.defineProperty(e, "textContent", { get: () => texto + e.children.map((h: T) => h.textContent).join(""), set: (v: string) => { e.children.slice().forEach((h: T) => e.removeChild(h)); texto = String(v); } });
    Object.defineProperty(e, "firstChild", { get: () => e.children[0] || null });
    Object.defineProperty(e, "nextSibling", { get: () => { const p = e.parentNode; return p ? p.children[p.children.indexOf(e) + 1] || null : null; } });
    Object.defineProperty(e, "nextElementSibling", { get: () => e.nextSibling });
    Object.defineProperty(e, "parentElement", { get: () => e.parentNode && e.parentNode.tagName ? e.parentNode : null });
    if (id) attrs.id = id;
    e.setAttribute = (k: string, v: T) => { attrs[k] = String(v); };
    e.getAttribute = (k: string) => (k in attrs ? attrs[k] : null);
    e.hasAttribute = (k: string) => k in attrs;
    e.removeAttribute = (k: string) => { delete attrs[k]; };
    e.appendChild = (h: T) => { if (h.parentNode) h.parentNode.removeChild(h); h.parentNode = e; e.children.push(h); return h; };
    e.insertBefore = (h: T, ref: T) => { if (h.parentNode) h.parentNode.removeChild(h); h.parentNode = e; const i = ref ? e.children.indexOf(ref) : -1; if (i < 0) e.children.push(h); else e.children.splice(i, 0, h); return h; };
    e.removeChild = (h: T) => { const i = e.children.indexOf(h); if (i >= 0) { e.children.splice(i, 1); h.parentNode = null; } return h; };
    e.remove = () => { if (e.parentNode) e.parentNode.removeChild(e); };
    e.contains = (o: T) => { for (let p = o; p; p = p.parentNode) if (p === e) return true; return false; };
    e.querySelectorAll = (s: string) => { const gs = partes(s), out: T[] = []; (function rec(n: T) { for (const h of n.children) { if (gs.some(g => casaGrupo(h, g))) out.push(h); rec(h); } })(e); return out; };
    e.querySelector = (s: string) => e.querySelectorAll(s)[0] || null;
    e.closest = (s: string) => { const gs = partes(s); for (let p = e; p && p.tagName; p = p.parentNode) if (gs.some(g => casaGrupo(p, g))) return p; return null; };
    e.focus = () => { doc.activeElement = e; };
    e.blur = () => {};
    e.click = () => e.dispatchEvent({ type: "click", target: e, detail: 1 });
    e.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 });
    e.getClientRects = () => [];
    e.setPointerCapture = () => {};
    e.select = () => {};
    e.showModal = () => { e.open = true; }; e.close = () => { if (e.open) { e.open = false; e.dispatchEvent({ type: "close" }); } };
    if (e.tagName === "CANVAS") { const cx: T = new Proxy({}, { get: (t: T, k: string) => (k in t ? t[k] : k === "measureText" ? () => ({ width: 10 }) : () => {}), set: (t: T, k: string, v: T) => { t[k] = v; return true; } }); e.width = 0; e.height = 0; e.getContext = () => cx; }
    return e;
  }
  const raiz = el("html"), body = el("body");
  raiz.appendChild(body);
  const doc: T = escuchable({ documentElement: raiz, body, activeElement: body, hidden: false, createElement: (t: string) => el(t), createTextNode: (t: string) => { const n = el("#text"); n.tagName = ""; n.textContent = t; return n; },
    getElementById: (id: string) => (function rec(n: T): T { for (const h of n.children) { if (h.id === id) return h; const r = rec(h); if (r) return r; } return null; })(raiz),
    querySelectorAll: (s: string) => raiz.querySelectorAll(s), querySelector: (s: string) => raiz.querySelector(s), contains: (o: T) => raiz.contains(o) });
  const almacen: Record<string, string> = {};
  const mm = (q: string) => escuchable({ matches: /coarse/.test(q) ? !!opc.coarse : false, media: q });
  class MO { f: T; constructor(f: T) { this.f = f; } observe() { obs++; } disconnect() { obs--; } takeRecords() { return []; } }
  const ventana: T = escuchable({ document: doc, location: { search: opc.busqueda || "" }, navigator: {}, devicePixelRatio: 1, MutationObserver: MO,
    localStorage: { getItem: (k: string) => (k in almacen ? almacen[k] : null), setItem: (k: string, v: string) => { almacen[k] = String(v); }, removeItem: (k: string) => { delete almacen[k]; } },
    matchMedia: mm, getComputedStyle: () => ({ display: "", position: "absolute", getPropertyValue: () => "" }), requestAnimationFrame: (f: T) => { const n = sig++; tiempos.set(n, f); return n; }, cancelAnimationFrame: (n: number) => { tiempos.delete(n); },
    setTimeout: (f: T) => { const n = sig++; tiempos.set(n, f); return n; }, clearTimeout: (n: number) => { tiempos.delete(n); },
    setInterval: (f: T) => { const n = sig++; intervalos.set(n, f); return n; }, clearInterval: (n: number) => { intervalos.delete(n); } });
  const globales: Record<string, T> = { window: ventana, document: doc, location: ventana.location, localStorage: ventana.localStorage, matchMedia: mm, getComputedStyle: ventana.getComputedStyle, MutationObserver: MO,
    setTimeout: ventana.setTimeout, clearTimeout: ventana.clearTimeout, setInterval: ventana.setInterval, clearInterval: ventana.clearInterval, requestAnimationFrame: ventana.requestAnimationFrame,
    cancelAnimationFrame: ventana.cancelAnimationFrame, Event: class { type: string; bubbles: boolean; constructor(t: string, o?: T) { this.type = t; this.bubbles = !!(o && o.bubbles); } } };
  const antes: Record<string, PropertyDescriptor | undefined> = {};
  for (const k of Object.keys(globales)) { antes[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: globales[k], configurable: true, writable: true }); }
  return {
    documento: doc, ventana, el,
    escuchas: () => vivas, relojes: () => tiempos.size + intervalos.size, observadores: () => obs,
    avanza: () => { const fs = [...tiempos.values()]; tiempos.clear(); fs.forEach(f => f()); },
    intervalos: () => [...intervalos.values()],
    limpia: () => { for (const k of Object.keys(antes)) { const d = antes[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as T)[k]; } }
  };
}

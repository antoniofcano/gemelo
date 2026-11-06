// Las decoraciones de los olivos (P7g D3; decisiones 175-179; doc/sistema/DECORACIONES.md y contratos/decoraciones.md; MU5-n, A3-3: antes apps/web/motor/50_decoraciones.js, que queda
// como talón): la pieza del catálogo de temporada que una familia ha colgado de un olivo de su haza (flores, cinta, farolillo, cosecha, luces o lazo), dibujada en su copa a ~0,6-0,8 de
// su altura. Es ILUSTRATIVA (regla 5): no mide nada, la eligió la familia; la ficha del olivo lo dice (Entidades.complementa).
// Es un COMPONENTE «decoraciones-olivo» (ADR-0023) de los mundos ["exterior"]: se registra y nadie lo nombra. ?decoraciones=0 (o genera_motor.mjs --sin 50_decoraciones.js) lo quita y el motor pinta
// lo mismo que antes. Sin servidor (sin D.base /teselas/… ni ?api=) no crea nada ni pide nada.
// De dónde salen los datos: este componente NO habla con la api. La lista blanca de cada haza (GET /api/hazas/{id}/olivos, campo «decoracion») ya la pide
// y la refresca el componente de la personalización (42_personalizacion.js), que la publica por el Bus («decoraciones:cambian», contratos/eventos.json);
// al montarse, este pide la última con «decoraciones:pide». Sin ese componente encendido, no hay decoraciones que dibujar (y no se pide nada dos veces).
// La época la decide la api (al poner la pieza): aquí se dibuja lo que venga y se ignora cualquier código que no esté en el catálogo.
// Técnica (regla 12: la de three): cada pieza es una malla pequeña hecha con geometrías de three (círculos, planos, cilindros, conos, icosaedros y
// octaedros), fundidas con mergeGeometries (three/addons/utils/BufferGeometryUtils.js, pedido con import() al montarse: en el talón, para que Vite lo trocee igual) y con su color en los vértices.
// Instanciada: UNA InstancedMesh por pieza (6 como mucho), con un tope de MAX instancias EN TOTAL (las más cercanas al foco: quien pasea, la cabeza en
// VR o, en la vista aérea, lo que se mira). Se recalcula en la fase «tarde» cada 0,5 s y solo se reescriben las matrices si cambia lo elegido, la
// exageración o pasan 4 s (relieve fino recién llegado); es poco trabajo (≤ 64 matrices), sin Cola. libera() lo suelta todo (geometrías y materiales).
// Presupuesto (regla 6): ≤ 6 llamadas (una por pieza con algo a la vista) y ≤ MAX × 40 = 2.560 triángulos; sin texturas. Medido por cálculo en Node
// (pruebas/guardianes/decoraciones.test.js, con el three de verdad); en Chrome, escrito y sin ejecutar (decoraciones_chrome.test.js, por el banco).
// Sus materiales (Lambert y Basic con color por vértice) no llevan parche ni ShaderMaterial: salen igual en las dos rutas y no tienen commit de materiales ni de TSL en MU5-n (MATERIALES §9).
// Su libera() ya soltaba las mallas, las geometrías y los materiales y quitaba su complemento de la ficha; se conserva y se prueba.
// Del legado recibe por argumento lo que necesita (THREE, el índice, las copas, el suelo, Entidades…); no lee globales.
import type { ContextoComponente, Manifiesto } from "../../nucleo/componentes.ts";

// three no trae tipos en el repo (como en suelo-fondo.ts): de él solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cualquiera = any;

export const ID_DECORACIONES = "decoraciones-olivo";

// DecoracionesPuro: sin DOM ni THREE (lo prueba en Node pruebas/guardianes/decoraciones.test.js)
export const DecoracionesPuro = (function () {
  const MAX = 64, CERCA_M = 80, REESCRIBE_S = 4, MUEVE_M = 2, RE_FINCA = /^[a-z0-9_-]{1,32}$/, RE_PIEZA = /^[a-z]{1,16}$/;
  // el catálogo de contratos/decoraciones.json (v 1): el guardián comprueba que es el mismo. «triangulos» es el tope de cada malla
  const CATALOGO = [
    { id: "flores", nombre: "Flores", epoca: "primavera", triangulos: 32 },
    { id: "cinta", nombre: "Cinta de color", epoca: "verano", triangulos: 24 },
    { id: "farolillo", nombre: "Farolillo", epoca: "otono", triangulos: 36 },
    { id: "cosecha", nombre: "Cosecha", epoca: "otono", triangulos: 40 },
    { id: "luces", nombre: "Luces", epoca: "invierno", triangulos: 40 },
    { id: "lazo", nombre: "Lazo", epoca: "invierno", triangulos: 24 }
  ];
  const POR_ID: Record<string, (typeof CATALOGO)[number]> = {}; CATALOGO.forEach(function (p) { POR_ID[p.id] = p; });
  const MAX_TRI = CATALOGO.reduce(function (a, p) { return Math.max(a, p.triangulos); }, 0);
  // cómo es cada pieza: primitivas de three (tipo y argumentos del constructor), dónde van (p, en metros desde el punto del que cuelga; +x hacia fuera de
  // la copa, +y arriba), giro (r, radianes xyz), escala (s) y color (sRGB). El origen es el punto de la copa del que cuelga. «brilla»: material sin luz.
  const CIRCULO = Math.PI / 2;
  interface Parte { g: string; a: (number | boolean)[]; p: number[]; r?: number[]; s?: number[]; ondea?: number; color: string }
  function enArco(n: number, f: (t: number, i: number) => Parte): Parte[] { const o: Parte[] = []; for (let i = 0; i < n; i++) o.push(f(n > 1 ? i / (n - 1) : 0.5, i)); return o; }
  const FORMAS: Record<string, { brilla: boolean; partes: Parte[] }> = {
    // 6 florecillas de 5 pétalos (un círculo de 5 lados cada una) en guirnalda: 30 triángulos
    flores: { brilla: false, partes: enArco(6, function (t, i) { return { g: "Circle", a: [0.07, 5], p: [0.02, -0.06 - 0.1 * Math.sin(t * Math.PI), -0.3 + 0.6 * t], r: [0, CIRCULO, 0], color: ["#f4a6c8", "#fff4e0", "#ffd34d"][i % 3]! }; }) },
    // dos tiras de 6 tramos colgando en V: 24 triángulos
    cinta: { brilla: false, partes: [
      { g: "Plane", a: [0.06, 0.7, 1, 6], p: [0.02, -0.35, -0.05], r: [0.12, CIRCULO, 0], ondea: 0.03, color: "#d8323c" },
      { g: "Plane", a: [0.06, 0.6, 1, 6], p: [0.02, -0.3, 0.05], r: [-0.12, CIRCULO, 0], ondea: 0.03, color: "#2f6fd6" }] },
    // un farolillo: cuerpo de 6 lados con sus tapas (24) y su sombrerete (6): 30 triángulos
    farolillo: { brilla: true, partes: [
      { g: "Cylinder", a: [0.11, 0.11, 0.26, 6, 1, false], p: [0.04, -0.25, 0], color: "#ff9a2e" },
      { g: "Cone", a: [0.13, 0.08, 6, 1, true], p: [0.04, -0.08, 0], color: "#4a3420" }] },
    // dos aceitunas (un icosaedro de 20 caras cada una, algo alargadas): 40 triángulos
    cosecha: { brilla: false, partes: [
      { g: "Icosahedron", a: [0.06, 0], p: [0.03, -0.12, -0.04], s: [1, 1.3, 1], color: "#3b2a3f" },
      { g: "Icosahedron", a: [0.06, 0], p: [0.03, -0.2, 0.05], s: [1, 1.3, 1], color: "#6f7d2a" }] },
    // 5 bombillas (un octaedro de 8 caras cada una) en una guirnalda que se descuelga: 40 triángulos
    luces: { brilla: true, partes: enArco(5, function (t, i) { const z = -0.4 + 0.8 * t; return { g: "Octahedron", a: [0.05, 0], p: [0.03, -0.1 - 0.15 * (1 - Math.pow(z / 0.4, 2)), z], color: ["#ffe27a", "#ff6b6b", "#7ad1ff", "#9cff8a", "#ffb36b"][i]! }; }) },
    // un lazo: dos lazadas (conos de 4 lados con su base, 8 + 8) y el nudo (un octaedro, 8): 24 triángulos
    lazo: { brilla: false, partes: [
      { g: "Cone", a: [0.08, 0.16, 4, 1, false], p: [0.03, -0.1, -0.08], r: [-CIRCULO, 0, 0], color: "#c8102e" },
      { g: "Cone", a: [0.08, 0.16, 4, 1, false], p: [0.03, -0.1, 0.08], r: [CIRCULO, 0, 0], color: "#c8102e" },
      { g: "Octahedron", a: [0.04, 0], p: [0.03, -0.1, 0], color: "#9e0b22" }] }
  };
  function pieza(id: unknown): (typeof CATALOGO)[number] | null { return typeof id === "string" && Object.prototype.hasOwnProperty.call(POR_ID, id) ? POR_ID[id]! : null; }
  function clave(finca: string, copas: number): string { return finca + ":" + copas; }
  // la lista que publica la personalización ([{ finca, copas_id, pieza, mia }]) → solo lo que vale y se conoce, sin repetir olivo (gana el primero), en orden
  // de clave (estable: la misma lista da siempre el mismo orden). Un código que no está en el catálogo se ignora (contratos/olivos-haza.schema.json).
  function indexa(l: unknown): { clave: string; finca: string; copas_id: number; pieza: string; mia: boolean }[] {
    const visto: Record<string, boolean> = {}, out: { clave: string; finca: string; copas_id: number; pieza: string; mia: boolean }[] = [];
    (Array.isArray(l) ? l : []).forEach(function (o) {
      if (!o || typeof o !== "object" || !RE_FINCA.test(o.finca) || !(Number.isInteger(o.copas_id) && o.copas_id >= 0 && o.copas_id <= 4294967295)) return;
      if (typeof o.pieza !== "string" || !RE_PIEZA.test(o.pieza) || !pieza(o.pieza)) return;
      const k = clave(o.finca, o.copas_id); if (visto[k]) return; visto[k] = true;
      out.push({ clave: k, finca: o.finca, copas_id: o.copas_id, pieza: o.pieza, mia: o.mia === true });
    });
    return out.sort(function (a, b) { return a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0; });
  }
  // un número de 0 a 1 que solo depende del olivo (el giro y la altura de su pieza no cambian de una vuelta a otra)
  function azar(n: number, sal: number): number { const x = Math.sin((n % 100003) * 12.9898 + sal * 78.233) * 43758.5453; return x - Math.floor(x); }
  // dónde va la pieza de un olivo: copa = { x, y (norte), h, perfil[8] } en metros locales; radio(perfil, ang) el de la copa en esa dirección (06_arboles);
  // factor, el de la copa dibujada (FACTOR_R8 o FACTOR_R8_GEN); suelo, la cota del terreno; exag, la exageración. → { x, y, z (escena), giro, escala, alto }
  // A una dirección fija por olivo (de su id), a ALTO ∈ [0,62, 0,78] de su altura y a 0,85 del radio de la copa en esa dirección (asoma sin flotar).
  function coloca(copa: Cualquiera, n: number, radio: (perfil: number[], ang: number) => number, factor: number, suelo: number, exag: number) {
    const ang = azar(n, 1) * 2 * Math.PI, alto = 0.62 + 0.16 * azar(n, 2), r = Math.max(0.3, radio(copa.perfil, ang) * factor * 0.85);
    const px = copa.x + Math.cos(ang) * r, py = copa.y + Math.sin(ang) * r, h = Math.max(1, copa.h);
    return { x: px, y: (suelo + h * alto) * exag, z: -py, giro: ang, escala: Math.min(1.5, Math.max(0.8, h / 4)), alto: alto };
  }
  // el foco: en VR la cabeza, paseando la cámara y, en la vista aérea, el punto que se mira (objetivo). → { x, z } de la escena
  function foco(o: Cualquiera): { x: number; z: number } {
    if (o.vr && o.cab) return { x: o.cab.x, z: o.cab.z };
    if (o.paseando || !o.objetivo) return { x: o.camara.x, z: o.camara.z };
    return { x: o.objetivo.x, z: o.objetivo.z };
  }
  // las que se dibujan: de las decoraciones válidas (indexa) cuyo olivo está en este mundo (posDe(item) → { x, z } o null), las que están a menos de cerca m
  // del foco, las max más cercanas; a igual distancia, por clave (orden estable). → [{ item, x, z, d2 }]
  function eligeCercanas(items: Cualquiera[], posDe: (it: Cualquiera) => { x: number; z: number } | null, f: { x: number; z: number }, cerca: number, max: number): { item: Cualquiera; x: number; z: number; d2: number }[] {
    const r: { item: Cualquiera; x: number; z: number; d2: number }[] = [], c2 = cerca * cerca;
    for (let i = 0; i < items.length; i++) {
      const p = posDe(items[i]); if (!p) continue;
      const dx = p.x - f.x, dz = p.z - f.z, d2 = dx * dx + dz * dz; if (d2 >= c2) continue;
      r.push({ item: items[i], x: p.x, z: p.z, d2: d2 });
    }
    r.sort(function (a, b) { return a.d2 - b.d2 || (a.item.clave < b.item.clave ? -1 : a.item.clave > b.item.clave ? 1 : 0); });
    return r.length > max ? r.slice(0, max) : r;
  }
  // lo elegido, repartido por pieza (cada grupo en orden de clave: la misma selección da las mismas instancias) y su firma (cambia si cambia algo)
  function reparte(sel: Cualquiera[]): { por: Record<string, Cualquiera[]>; firma: string } {
    const por: Record<string, Cualquiera[]> = {}, firma: string[] = [];
    sel.forEach(function (s) { (por[s.item.pieza] = por[s.item.pieza] || []).push(s.item); });
    Object.keys(por).forEach(function (k) { por[k]!.sort(function (a, b) { return a.clave < b.clave ? -1 : 1; }); });
    CATALOGO.forEach(function (p) { if (por[p.id]) firma.push(p.id + "=" + por[p.id]!.map(function (x) { return x.clave; }).join(",")); });
    return { por: por, firma: firma.join(";") };
  }
  // ¿hay que volver a elegir? si cambió la lista o el foco se movió más de MUEVE_M
  function seMovio(a: { x: number; z: number } | null, b: { x: number; z: number } | null): boolean { return !a || !b || Math.hypot(a.x - b.x, a.z - b.z) > MUEVE_M; }
  // el coste: llamadas (una por pieza con algo) y triángulos (los de cada malla por sus instancias); tri = { id: triángulos de su malla }
  function coste(por: Record<string, Cualquiera[]>, tri: Record<string, number>): { llamadas: number; triangulos: number } {
    let l = 0, t = 0; Object.keys(por).forEach(function (k) { if (por[k]!.length) { l++; t += (tri[k] || 0) * por[k]!.length; } });
    return { llamadas: l, triangulos: t };
  }
  // la fila de la ficha del olivo (honestidad, regla 5)
  function fila(item: Cualquiera): { k: string; v: string; de: string } | null {
    const p = item && pieza(item.pieza); if (!p) return null;
    return { k: "Decoración", v: p.nombre, de: "ilustrativa: la eligió " + (item.mia ? "tu familia" : "la familia de esa haza") + "; no la mide el gemelo" };
  }
  return { MAX: MAX, CERCA_M: CERCA_M, REESCRIBE_S: REESCRIBE_S, MUEVE_M: MUEVE_M, MAX_TRI: MAX_TRI, CATALOGO: CATALOGO, FORMAS: FORMAS,
    pieza: pieza, clave: clave, indexa: indexa, azar: azar, coloca: coloca, foco: foco, eligeCercanas: eligeCercanas, reparte: reparte, seMovio: seMovio, coste: coste, fila: fila };
})();

// una primitiva de three con los argumentos de FORMAS
export function decoracionesPrimitiva(THREE: T3, t: string, a: (number | boolean)[]): T3 {
  if (t === "Circle") return new THREE.CircleGeometry(a[0], a[1]);
  if (t === "Plane") return new THREE.PlaneGeometry(a[0], a[1], a[2], a[3]);
  if (t === "Cylinder") return new THREE.CylinderGeometry(a[0], a[1], a[2], a[3], a[4], a[5]);
  if (t === "Cone") return new THREE.ConeGeometry(a[0], a[1], a[2], a[3], a[4]);
  if (t === "Icosahedron") return new THREE.IcosahedronGeometry(a[0], a[1]);
  if (t === "Octahedron") return new THREE.OctahedronGeometry(a[0], a[1]);
  return null;
}
/** Las utilidades de three/addons que se piden con una importación dinámica al montarse (en el talón): de ellas solo se usa mergeGeometries. */
export interface UtilesGeometria { mergeGeometries(gs: T3[], grupos: boolean): T3 }
// las mallas de las piezas: las primitivas de FORMAS, sin índice ni uv, con su color (lineal) en los vértices, fundidas en una geometría por pieza
export function decoracionesGeometria(THREE: T3, id: string, U: UtilesGeometria): T3 {
  const forma = DecoracionesPuro.FORMAS[id]; if (!forma) return null;
  const partes: T3[] = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  forma.partes.forEach(function (pt) {
    const g0 = decoracionesPrimitiva(THREE, pt.g, pt.a); if (!g0) return;
    const g = g0.index ? g0.toNonIndexed() : g0; if (g !== g0) g0.dispose();
    if (g.getAttribute("uv")) g.deleteAttribute("uv");
    if (pt.ondea) { const po = g.getAttribute("position"); for (let i = 0; i < po.count; i++) po.setX(i, po.getX(i) + pt.ondea * Math.sin(po.getY(i) * 9)); }
    const r = pt.r || [0, 0, 0];
    e.set(r[0]!, r[1]!, r[2]!); q.setFromEuler(e);
    s.set.apply(s, (pt.s || [1, 1, 1]) as [number, number, number]); v.set(pt.p[0]!, pt.p[1]!, pt.p[2]!);
    g.applyMatrix4(m.compose(v, q, s));
    c.set(pt.color);   // THREE.Color pasa el sRGB a lineal (gestión de color de three)
    const nv = g.getAttribute("position").count, col = new Float32Array(nv * 3);
    for (let k = 0; k < nv; k++) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    partes.push(g);
  });
  const r = U.mergeGeometries(partes, false); partes.forEach(function (x) { x.dispose(); });
  if (r) r.computeVertexNormals();
  return r;
}

export interface DepsDecoraciones {
  THREE: T3;
  /** 01_datos: el índice (D.base y D.finca_id) y las constantes de la escala de las copas */
  D: { base?: string; finca_id?: string };
  FACTOR_R8: number;
  FACTOR_R8_GEN: number;
  /** location.search ("" si no hay) y ConfigPuro.prefijoApi (02c): sin servidor (sin D.base ni ?api=) no se crea ni se pide nada */
  busqueda: string;
  ConfigPuro: { prefijoApi(busqueda: string, base?: string): string | null };
  /** 02_mundo: las copas y el suelo; 06_arboles: el radio de una copa en una dirección */
  copas: { i: number; id: number; x: number; y: number; h: number; perfil: number[]; oliv: boolean }[];
  suelo(x: number, y: number): number;
  radioEn(perfil: number[], ang: number): number;
  /** 07ab_generados: si hay olivos generados, de cuáles (una copa generada se dibuja con FACTOR_R8_GEN) */
  Generados?: { rotulo(i: number): unknown } | null;
  /** 02e_entidades: la ficha del olivo admite filas de otros componentes */
  Entidades: { complementa(tipo: string, fn: (f: Cualquiera, id: string, modo?: string) => void): (() => void) | null };
  Estaticos: { congela(o: unknown, ...resto: unknown[]): void };
  scene: { add(o: unknown): void; remove(o: unknown): void };
  camera: { position: { x: number; z: number } };
  Estado: { exag: number };
  /** 09_camara: el objetivo de la órbita; 12_paseo: paseando (una primitiva que reescribe); 29_vr: VRX (la cabeza en VR) */
  objetivo?: { x: number; z: number } | null;
  paseando(): boolean;
  VRX?: { on: boolean; cab: { x: number; z: number } } | null;
  /** la ventana (para window.__decoraciones) */
  ventana: Record<string, unknown>;
  Componentes: { libera(id: string): unknown };
}
export interface EstadoDecoraciones { api: boolean; lib: string; validas: number; enMundo: number; elegidas: number; llamadas: number; triangulos: number; reescrituras: number; porPieza: Record<string, number> }

/** Las decoraciones de los olivos: el componente y su motor. */
export function creaDecoraciones(d: DepsDecoraciones) {
  function DecoracionesMotor(n: ContextoComponente, cargaUtiles: () => Promise<UtilesGeometria>) {
    const P = DecoracionesPuro, THREE = d.THREE, Estado = d.Estado, API = d.ConfigPuro.prefijoApi(d.busqueda, d.D.base);
    const st: EstadoDecoraciones = { api: !!API, lib: API ? "pidiendo" : "sin servidor", validas: 0, enMundo: 0, elegidas: 0, llamadas: 0, triangulos: 0, reescrituras: 0, porPieza: {} };
    function estado(): EstadoDecoraciones { const o: Cualquiera = {}; (Object.keys(st) as (keyof EstadoDecoraciones)[]).forEach(function (k) { o[k] = k === "porPieza" ? JSON.parse(JSON.stringify(st.porPieza)) : st[k]; }); return o; }
    if (!API) return { tarde: function (_dt?: number) { /* sin servidor: ni crea nada ni pide nada */ }, libera: function () { /* nada que soltar */ }, estado: estado };
    const fincaMundo = String(d.D.finca_id || "finca");
    let vivo = true, U: UtilesGeometria | null = null, items: Cualquiera[] = [], porClave: Record<string, Cualquiera> = {}, copaPorId: Record<number, Cualquiera> | null = null;
    let grupo: T3 = null, mallas: Record<string, T3> = {}, triDe: Record<string, number> = {}, matLuz: T3 = null, matBrillo: T3 = null, firma = "", focoHecho: { x: number; z: number } | null = null, exagHecha = -1, tReescribe = 0, sucio = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eje = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3();

    function copaDe(it: Cualquiera): Cualquiera {
      if (it.finca !== fincaMundo) return null;   // otra finca: ese olivo no está en este mundo
      if (!copaPorId) { copaPorId = {}; d.copas.forEach(function (c) { if (c.oliv && c.id >= 0) copaPorId![c.id] = c; }); }
      return copaPorId[it.copas_id] || null;
    }
    function posDe(it: Cualquiera): { x: number; z: number } | null { const c = copaDe(it); return c ? { x: c.x, z: -c.y } : null; }
    function factorDe(c: Cualquiera): number { return d.Generados && d.Generados.rotulo(c.i) ? d.FACTOR_R8_GEN : d.FACTOR_R8; }

    // ---- los datos, por el Bus (los publica la personalización)
    function recibe(dd?: Cualquiera): void {
      items = P.indexa(dd && dd.lista); porClave = {};
      items.forEach(function (it) { porClave[it.clave] = it; });
      st.validas = items.length; st.enMundo = items.filter(function (it) { return !!copaDe(it); }).length; sucio = true;
    }
    n.on("decoraciones:cambian", recibe);

    // ---- la ficha del olivo: la fila «Decoración», rotulada como ilustrativa
    let quitaCompl = d.Entidades.complementa("olivo", function (f, id) {
      const m = /^olivo:([a-z0-9_-]{1,32}):(\d{1,10})$/.exec(String(id || "")); if (!m) return;
      const fl = P.fila(porClave[P.clave(m[1]!, +m[2]!)]); if (fl) f.filas = (f.filas || []).concat([fl]);
    });

    // ---- las mallas: una InstancedMesh por pieza, creada la primera vez que hace falta (MAX instancias: el tope es para todas juntas)
    function malla(id: string): T3 {
      if (mallas[id]) return mallas[id];
      const geo = decoracionesGeometria(THREE, id, U!); if (!geo) return null;
      if (!grupo) { grupo = new THREE.Group(); grupo.name = "decoraciones de los olivos"; d.Estaticos.congela(grupo); d.scene.add(grupo); }
      const forma = P.FORMAS[id]!; let mat: T3;
      if (forma.brilla) mat = matBrillo || (matBrillo = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      else mat = matLuz || (matLuz = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
      const im = new THREE.InstancedMesh(geo, mat, P.MAX);
      im.name = "decoración " + id; im.count = 0; im.visible = false; im.castShadow = im.receiveShadow = false;
      im.raycast = function () { /* el olivo se elige por su copa (06_arboles), no por su pieza */ };
      d.Estaticos.congela(im); grupo.add(im); mallas[id] = im; triDe[id] = geo.getAttribute("position").count / 3;
      return im;
    }
    function escribe(por: Record<string, Cualquiera[]>): void {
      P.CATALOGO.forEach(function (p) {
        const l = por[p.id] || [], im = l.length ? malla(p.id) : mallas[p.id];
        if (!im) return;
        for (let i = 0; i < l.length; i++) {
          const c = copaDe(l[i]), o = P.coloca(c, l[i].copas_id, d.radioEn, factorDe(c), d.suelo(c.x, c.y), Estado.exag);
          q.setFromAxisAngle(eje, o.giro); pv.set(o.x, o.y, o.z); sv.set(o.escala, o.escala, o.escala);
          im.setMatrixAt(i, m4.compose(pv, q, sv));
        }
        im.count = l.length; im.visible = l.length > 0;
        if (l.length) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
      });
      const k = P.coste(por, triDe); st.llamadas = k.llamadas; st.triangulos = k.triangulos;
      st.porPieza = {}; Object.keys(por).forEach(function (id) { st.porPieza[id] = por[id]!.length; });
      exagHecha = Estado.exag; tReescribe = 0; st.reescrituras++;
    }
    function tarde(dt?: number): void {
      if (!vivo || !U) return;
      tReescribe += dt || 0;
      const vr = !!(d.VRX && d.VRX.on);
      const f = P.foco({ vr: vr, cab: vr ? d.VRX!.cab : null, paseando: d.paseando(), camara: d.camera.position, objetivo: d.objetivo || null });
      if (!sucio && !P.seMovio(f, focoHecho) && Estado.exag === exagHecha && tReescribe < P.REESCRIBE_S) return;
      const r = P.reparte(P.eligeCercanas(items, posDe, f, P.CERCA_M, P.MAX)); st.elegidas = 0; Object.keys(r.por).forEach(function (k) { st.elegidas += r.por[k]!.length; });
      focoHecho = f;
      if (r.firma !== firma || sucio || Estado.exag !== exagHecha || tReescribe >= P.REESCRIBE_S) { firma = r.firma; escribe(r.por); }
      sucio = false;
    }
    /** quita las mallas del grupo y suelta cada geometría y cada InstancedMesh, los dos materiales compartidos y el grupo de la escena */
    function vacia(): void {
      Object.keys(mallas).forEach(function (k) { const im = mallas[k]; if (grupo) grupo.remove(im); im.geometry.dispose(); if (im.dispose) im.dispose(); });
      if (matLuz) matLuz.dispose(); if (matBrillo) matBrillo.dispose();
      if (grupo) d.scene.remove(grupo);
      grupo = null; mallas = {}; triDe = {}; matLuz = matBrillo = null; firma = ""; st.llamadas = st.triangulos = 0; st.porPieza = {};
    }
    cargaUtiles().then(function (u) { if (!vivo) return; U = u; st.lib = "lista"; sucio = true; }, function (e) { if (vivo) st.lib = "sin utilidades de three: " + String(e && e.message || e).slice(0, 80); });
    n.on("depura:lineas", function (dd?: Cualquiera) { if (dd && dd.lineas && st.llamadas) dd.lineas.push("Decoraciones: " + st.llamadas + " llamadas · " + st.elegidas + " piezas · " + st.triangulos + " triángulos (ilustrativas)"); });
    d.ventana["__decoraciones"] = function (que?: string) { if (que === "libera") { d.Componentes.libera(ID_DECORACIONES); return null; } return estado(); };   // pruebas y ?debug
    n.limpia(function () { try { delete d.ventana["__decoraciones"]; } catch (e) { d.ventana["__decoraciones"] = undefined; } });
    n.emite("decoraciones:pide", {});   // la última lista, si la personalización ya la tenía (si no, llegará sola)
    function libera(): void { vivo = false; vacia(); if (quitaCompl) { quitaCompl(); quitaCompl = null; } items = []; porClave = {}; copaPorId = null; }
    return { tarde: tarde, libera: libera, estado: estado };
  }
  return { DecoracionesMotor };
}

/** El manifiesto del componente «decoraciones-olivo» (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?decoraciones=0 lo apaga; ?decoraciones=1 lo enciende.
 *  cargaUtiles pide mergeGeometries de three con una importación dinámica (se queda en el talón, para que Vite lo trocee igual). */
export function manifiestoDecoraciones(d: DepsDecoraciones, cargaUtiles: () => Promise<UtilesGeometria>): Manifiesto {
  const deco = creaDecoraciones(d);
  return {
    id: ID_DECORACIONES, version: 1,
    consume: ["Estaticos", "copas", "radioEn", "Generados", "objetivo", "paseando", "VRX"],
    expone: [],
    eventos: { escucha: ["decoraciones:cambian", "depura:lineas"], emite: ["decoraciones:pide"] },
    bandera: { defecto: true, url: "decoraciones" },
    // ≤ 6 llamadas (una InstancedMesh por pieza con algo a la vista) y ≤ MAX (64) instancias en total de ≤ 40 triángulos: 2.560. Sin texturas.
    // Contado en Node con el three de verdad (decoraciones.test.js): flores 30, cinta 24, farolillo 30, cosecha 40, luces 40 y lazo 24 triángulos por pieza.
    presupuesto: { llamadas: 6, triangulos: 2560 },
    fases: { tarde: 0.5 },
    mundos: ["exterior"],
    monta: function (n) { return deco.DecoracionesMotor(n, cargaUtiles); },
    actualiza: { tarde: function (dt, _t, api) { (api as ReturnType<typeof deco.DecoracionesMotor>).tarde(dt); } },
    libera: function (api) { if (api) (api as ReturnType<typeof deco.DecoracionesMotor>).libera(); }
  };
}

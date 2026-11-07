// La fábrica de materiales del motor (MU5-0; antes apps/web/motor/02i_materiales.js, que queda como talón). doc/sistema/MATERIALES.md, MUNDOS §1 y §6,
// ADR-0031 (F1/F4) y ADR-0033 («tres pájaros en MU5»).
// Todo sombreador propio pasa por aquí: los ShaderMaterial y los materiales de three con su parche (onBeforeCompile). Da el CLÁSICO (el de hoy, con su
// parche: el que entienden el WebGLRenderer de three y el de super-three) y, solo cuando corre el WebGPURenderer (Render.tipo «nuevo», que hasta MU6
// no existe) y el material tiene variante TSL, la TSL. Los materiales estándar (MeshStandardMaterial, MeshBasicMaterial…) salen tal cual por las dos
// rutas: el WebGPURenderer los convierte solo en su NodeMaterial (MULTIVIEW §2.1).
//
// La API: un REGISTRO por nombre, no un método por material (doc/sistema/MATERIALES.md §2 explica por qué):
//   define(nombre, { clasico?, tsl? })        registra un material: clasico(opc, ctx) → Material (con su parche); tsl(opc, ctx) → NodeMaterial (MU5-n, 3.er commit)
//   crea(nombre, opc?, dueño?)                el clásico o, con el renderizador nuevo y variante, el TSL; con dueño, lo guarda para libera(dueño)
//   estandar(clase, opciones?, dueño?)        new THREE[clase](opciones): vale en los dos renderizadores sin cambio
//   de(dueño)                                 la misma API con el dueño puesto (lo que recibe un mundo o un componente; MaterialesEstandar para los interiores)
//   libera(dueño)                             dispose() de lo que creó ese dueño, y solo de eso; devuelve cuántos
//   ruta(nombre) / estado / cobertura()       qué ruta da (clasico | tsl), por qué, y qué materiales tienen ya variante TSL (el criterio de MU5)
// Y lo de siempre de 02i (AG-3a / F1), con el mismo comportamiento, para los sitios del legado que aún construyen su material:
//   parchea(mat, nombre, fn, clave?)           mat.onBeforeCompile = fn (la MISMA función: three usa su texto como clave del programa) y la clave, si se da
//   encadena(mat, nombre, fn, clave, propia?)  fn DESPUÉS del parche que ya tenga mat, con la clave combinada (el contrato de apps/web/olivo/materiales.js)
//   sombreador(nombre, opciones)               new THREE.ShaderMaterial(opciones)
//   nuevo(nombre, fabrica)                     registra solo la variante TSL de un material del legado (= define(nombre, { tsl: fabrica }))
//   inventario(), recorte(mat), recortes(on), a2c, eligeA2c, cartulina, eligeCartulina, apuntaCartulina   (AG-2.1 y AG-2.2, sin cambio)
//
// ?renderer=webgpu (o el nombre viejo ?render=nuevo) lo elige nucleo/render.ts, no esta fábrica. Hoy, con el WebGLRenderer, se queda en el clásico: la
// fábrica da los clásicos y AVISA una vez, porque TSL no funciona sin WebGPURenderer (y onBeforeCompile no funciona con él). MATERIALES.md §4 dice
// cómo se elegirá en MU6.
// Nada de aquí importa three ni lee globales al cargarse: THREE, el Render elegido, la URL, el almacén, el MSAA y la consola entran por argumento de
// creaMateriales. Las clases de three/webgpu y las funciones de three/tsl entran por `nodos()` (MU6: las cargará nucleo/render con import() solo con el
// renderizador nuevo), así que three/tsl no entra en el paquete mientras nadie lo pida. Presupuesto (regla 6): no dibuja ni reserva nada.

// ---------------------------------------------------------------- tipos mínimos (three no trae tipos en el repo: como en ambiente.ts y presupuesto.ts)

/** Lo mínimo de un material de three que la fábrica toca. */
export interface MaterialMin {
  dispose?: () => void;
  onBeforeCompile?: ((sh: unknown, r: unknown) => void) | undefined;
  customProgramCacheKey?: (() => string) | undefined;
  alphaTest?: number;
  alphaToCoverage?: boolean;
  needsUpdate?: boolean;
  isMeshDepthMaterial?: boolean;
  isMeshDistanceMaterial?: boolean;
  isNodeMaterial?: boolean;
  /** el EventDispatcher de three: la fábrica escucha «dispose» para olvidar lo que su dueño ya soltó por su cuenta */
  addEventListener?: (tipo: string, fn: () => void) => void;
  removeEventListener?: (tipo: string, fn: () => void) => void;
}
type Constructor = new (opciones?: unknown) => MaterialMin;
/** El THREE del motor (el clásico: three o super-three): solo se usan sus clases de material por nombre. */
export type ThreeMin = Record<string, unknown> & { ShaderMaterial: Constructor };
/** Lo que da nodos(): el THREE de three/webgpu (las clases *NodeMaterial) y el TSL de three/tsl. */
export interface Nodos { THREE: Record<string, unknown>; TSL: Record<string, unknown> }
/** Lo que se lee del Render elegido (nucleo/render.ts): qué se pidió y qué corre. */
export interface RenderElegido { tipo: string; pedido?: string }
type Consola = { warn(...a: unknown[]): void } | null | undefined;

/** Lo que recibe la fábrica de cada variante. */
export interface CtxClasico { THREE: ThreeMin; nombre: string }
export interface CtxTsl { THREE: Record<string, unknown>; TSL: Record<string, unknown>; nombre: string }
/** Un material con su sombreador propio: el clásico y, cuando se escriba (MU5-n), su variante TSL. Una sola fuente por material (MULTIVIEW §2.2). */
export interface DefMaterial<O = unknown> {
  /** el de hoy, con su onBeforeCompile o su ShaderMaterial (lo usan el WebGLRenderer de three y el de super-three) */
  clasico?: (opc: O, ctx: CtxClasico) => MaterialMin;
  /** la variante TSL, un NodeMaterial (solo con el WebGPURenderer). También la de un sitio del legado: recibe el material clásico o sus opciones */
  tsl?: (opc: O, ctx: CtxTsl) => MaterialMin;
}
export type Ruta = "clasico" | "tsl";
export interface EstadoMateriales {
  /** se pidió el renderizador nuevo (?renderer=webgpu o ?render=nuevo) */
  pedido: boolean;
  /** corre el renderizador nuevo y hay TSL: las variantes TSL se usan */
  tsl: boolean;
  motivo: string;
  advertencia: string;
}
export interface EleccionA2c { pedido: string; activo: boolean; msaa: boolean; motivo: string; advertencia: string; origen: "url" | "ajuste" | "defecto"; n?: number }
export interface EleccionCartulina { modo: "rect" | "silueta"; silueta: boolean; origen: "url" | "defecto"; advertencia: string; piezas: Record<string, unknown> }

// ---------------------------------------------------------------- lo puro

// ---- AG-2.1: alphaToCoverage para los recortes alfa (doc/sistema/ALPHA-A-COBERTURA.md)
// ajuste: el guardado de Configuración → Vista («vista.a2c», true/false) o undefined. Orden de mando: la URL (?a2c=0|1), luego el ajuste, luego APAGADO (las copas de cerca salían
// blanquecinas con el recorte suave; se enciende a petición). origen: "url" | "ajuste" | "defecto"
function eligeA2c(busqueda: unknown, msaa?: unknown, ajuste?: unknown): EleccionA2c {
  const q = typeof busqueda === "string" ? busqueda : "", m = /[?&]a2c=([^&#]*)/.exec(q);
  const r: EleccionA2c = { pedido: "", activo: false, msaa: msaa !== false, motivo: "", advertencia: "", origen: "defecto" };
  if (m) { const v = decodeURIComponent(m[1] as string); r.pedido = v; if (v === "0" || v === "1") { r.activo = v === "1"; r.origen = "url"; } else r.advertencia = "?a2c=" + v + " solo vale 0 o 1: se usa " + (ajuste === true ? "el ajuste" : "apagado"); }
  if (r.origen === "defecto" && ajuste === true) { r.activo = true; r.origen = "ajuste"; }
  if (r.activo && !r.msaa) { r.activo = false; r.motivo = "sin MSAA (perilla de 02f): alphaToCoverage no hace nada y se deja el alphaTest"; }
  else if (!r.activo) r.motivo = r.origen === "url" ? "?a2c=0: el alphaTest de siempre" : "apagado por defecto: el alphaTest de siempre (se enciende en Configuración → Vista o con ?a2c=1)";
  return r;
}

// ---- AG-2.2: cartulinas recortadas a la silueta (doc/sistema/CARTULINAS.md). Defecto «rect»: con la silueta los triángulos de las cartulinas
// suben (2 → 4 por ramita) y los píxeles bajan; sin medirlo en un aparato real no se sabe qué pesa más (regla 7)
const CARTULINA_DEFECTO = "rect";
function eligeCartulina(busqueda: unknown): EleccionCartulina {
  const q = typeof busqueda === "string" ? busqueda : "", m = /[?&]cartulina=([^&#]*)/.exec(q);
  const r: EleccionCartulina = { modo: CARTULINA_DEFECTO, silueta: false, origen: "defecto", advertencia: "", piezas: {} };
  if (m) { const v = decodeURIComponent(m[1] as string); if (v === "rect" || v === "silueta") { r.modo = v; r.origen = "url"; } else r.advertencia = "?cartulina=" + v + " solo vale rect o silueta: se usa «" + CARTULINA_DEFECTO + "»"; }
  r.silueta = r.modo === "silueta";
  return r;
}

// el mismo contrato que encadena() de apps/web/olivo/materiales.js (la biblioteca la importa el motor solo con ?olivos=gen: aquí no se puede importar)
function encadenaPropia(mat: MaterialMin, fn: (sh: unknown, r: unknown) => void, clave?: string): MaterialMin {
  const previo = mat.onBeforeCompile, clavePrevia = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : function () { return ""; };
  mat.onBeforeCompile = function (this: unknown, sh: unknown, r: unknown) { if (previo) previo.call(this, sh, r); fn.call(this, sh, r); };
  mat.customProgramCacheKey = function () { return clavePrevia() + "|" + (clave || fn.toString().length); };
  return mat;
}

/** ¿Qué ruta toca? La TSL solo si corre el renderizador nuevo, hay TSL cargado y el material tiene variante. */
function rutaDe(tipo: string, hayNodos: boolean, tieneTsl: boolean): Ruta { return tipo === "nuevo" && hayNodos && tieneTsl ? "tsl" : "clasico"; }

/** El estado de la fábrica según lo que se pidió y lo que corre. */
function estadoDe(render: RenderElegido | null | undefined, hayNodos: boolean): EstadoMateriales {
  const tipo = render ? render.tipo : "clasico", pedido = !!render && (render.pedido === "nuevo" || tipo === "nuevo");
  if (tipo === "nuevo" && hayNodos) return { pedido, tsl: true, motivo: "WebGPURenderer: los materiales con variante TSL usan la suya; los demás, el clásico (se ven mal o en blanco: se avisa)", advertencia: "" };
  if (tipo === "nuevo") return { pedido, tsl: false, motivo: "WebGPURenderer sin three/tsl cargado: se dan los clásicos", advertencia: "el renderizador nuevo corre pero no hay TSL (nodos()): se dan los materiales clásicos, cuyo onBeforeCompile no se llama" };
  if (pedido) return { pedido, tsl: false, motivo: "se pidió el WebGPURenderer pero corre el WebGLRenderer: se dan los clásicos", advertencia: "?renderer=webgpu: las variantes TSL solo funcionan con el WebGPURenderer, que el motor aún no monta (MU6): se dan los materiales clásicos" };
  return { pedido, tsl: false, motivo: "WebGLRenderer: los materiales clásicos de siempre", advertencia: "" };
}

/** MU5-0: un material trivial con sus dos variantes, para demostrar la ruta (y su prueba). APAGADO: solo se usaría con el renderizador nuevo, que hoy no
 *  existe, y nadie lo pide en el motor. El clásico es un MeshBasicMaterial con un parche que multiplica su color por uBrillo; el TSL, un
 *  MeshBasicNodeMaterial con colorNode = color · brillo. Los dos leen el MISMO { value } de brillo (en TSL, por un uniform que lo relee en cada objeto). */
export const EJEMPLO_TSL = "ejemplo-tsl";
export interface OpcEjemplo { color?: number; brillo?: { value: number } }
export const DEF_EJEMPLO: DefMaterial<OpcEjemplo> = {
  clasico: function (o, c) {
    const Basico = c.THREE["MeshBasicMaterial"] as Constructor, brillo = (o && o.brillo) || { value: 1 };
    const m = new Basico({ color: o && typeof o.color === "number" ? o.color : 0x808080 });
    m.onBeforeCompile = function (sh: unknown) {
      const s = sh as { uniforms: Record<string, unknown>; fragmentShader: string };
      s.uniforms["uBrillo"] = brillo;
      s.fragmentShader = s.fragmentShader.replace("void main() {", "uniform float uBrillo;\nvoid main() {").replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb *= uBrillo;");
    };
    return m;
  },
  tsl: function (o, c) {
    const Basico = c.THREE["MeshBasicNodeMaterial"] as Constructor, brillo = (o && o.brillo) || { value: 1 };
    const color = c.TSL["color"] as (hex: number) => { mul(x: unknown): unknown };
    const uniforme = c.TSL["uniform"] as (v: number) => { onObjectUpdate(f: () => number): unknown };
    const m = new Basico() as MaterialMin & { colorNode?: unknown };
    m.colorNode = color(o && typeof o.color === "number" ? o.color : 0x808080).mul(uniforme(brillo.value).onObjectUpdate(function () { return brillo.value; }));
    return m;
  }
};

/** A4-0: que una textura de TSL (un TextureNode de three/tsl) relea en cada objeto el valor de un uniforme del clásico ({ value }), antes de dibujar.
 *  onObjectUpdate NO vale en una textura: TextureNode.setup() (three r186) vuelve a poner su updateType (NONE, u OBJECT con su propio update si lleva matriz
 *  o flipY) y el nuestro se pierde; el updateBefore no lo toca. Va en el nodo que se muestrea (sample, bias, grad o depth lo clonan, y el clon no lleva nada de
 *  esto). Lo prueban prueba-tsl.test.ts y las pruebas de cada variante (compila(…).actualiza()). */
function releeTextura<N>(nodo: N, lee: () => unknown): N {
  const n = nodo as unknown as { updateBeforeType?: string; updateBefore?: () => void; value?: unknown };
  n.updateBeforeType = "object";
  n.updateBefore = function () { const v = lee(); if (v) n.value = v; };
  return nodo;
}

export const MaterialesPuro = { eligeA2c, eligeCartulina, encadenaPropia, rutaDe, estadoDe, releeTextura, CARTULINA_DEFECTO, EJEMPLO_TSL };

// ---------------------------------------------------------------- la fábrica

/** Lo que el legado presta a la fábrica: nada se lee de globales aquí. */
export interface DepsMateriales {
  /** el THREE del motor (three o super-three, el clásico) */
  THREE: ThreeMin;
  /** el Render elegido (nucleo/render.ts): se lee en cada material, no al crear la fábrica */
  render?: RenderElegido | null;
  /** las clases de three/webgpu y el TSL de three/tsl, si están cargados (MU6); hoy nadie los da */
  nodos?: (() => Nodos | null) | null;
  /** location.search ("" si no hay) */
  busqueda?: string;
  /** ¿hay MSAA? (XrPerillas.aa; la perilla de 02f lo quita): se lee UNA vez, como antes */
  msaa?: unknown;
  /** el almacén del navegador, como función porque pedirlo puede lanzar: de él se lee UNA vez «gemelo.ajustes.vista.a2c» (33_ajustes se monta después) */
  almacen?: (() => { getItem(clave: string): string | null }) | null;
  /** console, para los avisos */
  consola?: Consola;
}

function ajusteGuardado(almacen: DepsMateriales["almacen"], clave: string): unknown {
  try { const s = almacen ? almacen().getItem("gemelo.ajustes." + clave) : null; return s == null ? undefined : JSON.parse(s); } catch (e) { return undefined; }
}

export function creaMateriales(deps: DepsMateriales) {
  const d = deps, T = d.THREE, consola = d.consola || null;
  const usados: Record<string, { tipo: string; n: number }> = {}, defs: Record<string, DefMaterial<unknown>> = {};
  const porDueno = new Map<string, Set<MaterialMin>>(), avisados = new Set<string>();
  function aviso(clave: string, texto: string): void { if (avisados.has(clave)) return; avisados.add(clave); if (consola) consola.warn("materiales: " + texto); }
  function nodos(): Nodos | null { try { return d.nodos ? d.nodos() : null; } catch (e) { return null; } }
  function tipo(): string { return d.render ? d.render.tipo : "clasico"; }
  function estadoAhora(): EstadoMateriales { return estadoDe(d.render, !!nodos()); }

  function apunta(nombre: string, t: string): void {
    if (typeof nombre !== "string" || !nombre) throw new Error("Materiales: falta el nombre del material");
    let u = usados[nombre]; if (!u) u = usados[nombre] = { tipo: t, n: 0 };
    u.n++;
  }
  function guarda<M extends MaterialMin>(m: M, dueno?: string): M {
    if (dueno && m) {
      let s = porDueno.get(dueno); if (!s) porDueno.set(dueno, (s = new Set()));
      if (s.has(m)) return m;
      s.add(m);
      // MU5-n (A3-1a): lo que el dueño suelta por su cuenta (un glb del tileset que se va: SombreadoTiles.suelta) sale de su lista, para que la lista no
      // crezca durante la sesión. libera(dueño) lo encuentra ya fuera. Un doble sin addEventListener se queda en la lista hasta libera(dueño)
      const lista = s;
      if (typeof m.addEventListener === "function") {
        const olvida = function (): void { lista.delete(m); if (typeof m.removeEventListener === "function") m.removeEventListener("dispose", olvida); };
        m.addEventListener("dispose", olvida);
      }
    }
    return m;
  }
  // la variante TSL de un nombre, si es la ruta que toca; si corre el renderizador nuevo y no la hay, se avisa una vez por nombre (MUNDOS §6)
  function version(nombre: string): ((entrada: unknown) => MaterialMin) | null {
    const def = defs[nombre], n = nodos();
    if (rutaDe(tipo(), !!n, !!(def && def.tsl)) === "tsl" && n && def && def.tsl) { const f = def.tsl, ctx: CtxTsl = { THREE: n.THREE, TSL: n.TSL, nombre }; return function (e) { return f(e, ctx); }; }
    if (tipo() === "nuevo" && !(def && def.tsl)) aviso("sin-tsl:" + nombre, "«" + nombre + "» no tiene variante TSL: con el WebGPURenderer su parche no se llama (se ve mal) o sale en blanco (ShaderMaterial)");
    return null;
  }

  // ---- lo del legado (AG-3a / F1): el mismo comportamiento que 02i_materiales.js
  function parchea(mat: MaterialMin, nombre: string, fn: (sh: unknown, r: unknown) => void, clave?: string, dueno?: string): MaterialMin {
    apunta(nombre, "parche");
    const n = version(nombre); if (n) return guarda(n(mat), dueno);
    mat.onBeforeCompile = fn;
    if (typeof clave === "string") mat.customProgramCacheKey = function () { return clave; };
    return guarda(mat, dueno);
  }
  function encadena(mat: MaterialMin, nombre: string, fn: (sh: unknown, r: unknown) => void, clave?: string, propia?: ((m: MaterialMin, f: (sh: unknown, r: unknown) => void, k?: string) => MaterialMin) | null, dueno?: string): MaterialMin {
    apunta(nombre, "encadena");
    const n = version(nombre); if (n) return guarda(n(mat), dueno);
    return guarda((propia || encadenaPropia)(mat, fn, clave), dueno);
  }
  function sombreador(nombre: string, opciones: unknown, dueno?: string): MaterialMin {
    apunta(nombre, "sombreador");
    const n = version(nombre); if (n) return guarda(n(opciones), dueno);
    return guarda(new T.ShaderMaterial(opciones), dueno);
  }

  // ---- lo nuevo (MU5-0): el registro, los estándar y el dueño
  function define<O>(nombre: string, def: DefMaterial<O>): void {
    if (typeof nombre !== "string" || !nombre) throw new Error("Materiales: falta el nombre del material");
    const previa = defs[nombre] || {}, nueva = def as DefMaterial<unknown>;
    defs[nombre] = { clasico: nueva.clasico || previa.clasico, tsl: nueva.tsl || previa.tsl };
  }
  function nuevo(nombre: string, fabrica: (entrada: unknown) => MaterialMin): void { define(nombre, { tsl: function (e: unknown) { return fabrica(e); } }); }
  function crea(nombre: string, opc?: unknown, dueno?: string): MaterialMin {
    const def = defs[nombre];
    if (!def || !def.clasico) throw new Error("Materiales: «" + nombre + "» no está definido (define(nombre, { clasico, tsl? }))");
    apunta(nombre, "define");
    const n = version(nombre); if (n) return guarda(n(opc), dueno);
    return guarda(def.clasico(opc, { THREE: T, nombre }), dueno);
  }
  function estandar(clase: string, opciones?: unknown, dueno?: string): MaterialMin {
    const C = T[clase] as Constructor | undefined;
    if (typeof C !== "function" || !/Material$/.test(clase) || clase === "ShaderMaterial" || clase === "RawShaderMaterial") throw new Error("Materiales: «" + clase + "» no es un material estándar de three (para un sombreador propio, define + crea)");
    return guarda(new C(opciones), dueno);
  }
  function libera(dueno: string): number {
    const s = porDueno.get(dueno); if (!s) return 0;
    porDueno.delete(dueno);
    let n = 0;
    for (const m of s) {
      const i = recortados.indexOf(m); if (i >= 0) { recortados.splice(i, 1); a2c.n = recortados.length; }
      if (m && typeof m.dispose === "function") m.dispose();
      n++;
    }
    return n;
  }
  function ruta(nombre: string): Ruta { const def = defs[nombre]; return rutaDe(tipo(), !!nodos(), !!(def && def.tsl)); }
  function cobertura(): Record<string, { clasico: boolean; tsl: boolean; usado: number }> {
    const o: Record<string, { clasico: boolean; tsl: boolean; usado: number }> = {};
    for (const k of Object.keys(usados).concat(Object.keys(defs))) { const def = defs[k]; o[k] = { clasico: !def || !!def.clasico || usados[k] !== undefined, tsl: !!(def && def.tsl), usado: usados[k] ? (usados[k] as { n: number }).n : 0 }; }
    return o;
  }
  function inventario(): Record<string, { tipo: string; n: number }> { const o: Record<string, { tipo: string; n: number }> = {}; for (const k of Object.keys(usados)) { const u = usados[k] as { tipo: string; n: number }; o[k] = { tipo: u.tipo, n: u.n }; } return o; }
  function duenos(): Record<string, number> { const o: Record<string, number> = {}; for (const [k, s] of porDueno) o[k] = s.size; return o; }

  // ---- AG-2.1 y AG-2.2: el estado se lee UNA vez, al crear la fábrica (como 02i)
  const a2c = eligeA2c(d.busqueda || "", d.msaa === undefined ? true : d.msaa, ajusteGuardado(d.almacen, "vista.a2c")), recortados: MaterialMin[] = [];
  a2c.n = 0;
  if (a2c.advertencia && consola) consola.warn("a2c: " + a2c.advertencia);
  function recorte<M extends MaterialMin>(mat: M): M {
    if (!mat || !((mat.alphaTest as number) > 0) || mat.isMeshDepthMaterial || mat.isMeshDistanceMaterial) return mat;   // las sombras no tienen MSAA: siguen con alphaTest
    recortados.push(mat); a2c.n = recortados.length;
    if (a2c.activo) mat.alphaToCoverage = true;
    return mat;
  }
  function recortes(activo: unknown): void {
    const on = !!activo && a2c.activo;
    recortados.forEach(function (m) { if (m.alphaToCoverage !== on) { m.alphaToCoverage = on; m.needsUpdate = true; } });
  }
  const cartulina = eligeCartulina(d.busqueda || "");
  if (cartulina.advertencia && consola) consola.warn("cartulina: " + cartulina.advertencia);
  function apuntaCartulina(nombre: string, datos: unknown): void { cartulina.piezas[nombre] = datos; }

  define(EJEMPLO_TSL, DEF_EJEMPLO);   // el ejemplo de la ruta: registrado, nadie lo pide (apagado)
  const estado = estadoAhora();
  if (estado.advertencia) aviso("estado", estado.advertencia);

  /** La misma API con el dueño puesto: lo que creen se libera con libera(dueño) (un mundo en su libera(), un componente en su n.limpia). */
  function de(dueno: string) {
    if (typeof dueno !== "string" || !dueno) throw new Error("Materiales.de: falta el dueño");
    return {
      dueno,
      crea: function (nombre: string, opc?: unknown) { return crea(nombre, opc, dueno); },
      estandar: function (clase: string, opciones?: unknown) { return estandar(clase, opciones, dueno); },
      parchea: function (mat: MaterialMin, nombre: string, fn: (sh: unknown, r: unknown) => void, clave?: string) { return parchea(mat, nombre, fn, clave, dueno); },
      encadena: function (mat: MaterialMin, nombre: string, fn: (sh: unknown, r: unknown) => void, clave?: string, propia?: ((m: MaterialMin, f: (sh: unknown, r: unknown) => void, k?: string) => MaterialMin) | null) { return encadena(mat, nombre, fn, clave, propia, dueno); },
      sombreador: function (nombre: string, opciones: unknown) { return sombreador(nombre, opciones, dueno); },
      /** un material que se creó fuera (p. ej. clonado) y que también es de este dueño */
      adopta: function <M extends MaterialMin>(m: M): M { return guarda(m, dueno); },
      libera: function () { return libera(dueno); }
    };
  }

  return {
    // lo de siempre (02i)
    parchea, encadena, sombreador, nuevo, inventario, a2c, eligeA2c, recorte, recortes, cartulina, eligeCartulina, apuntaCartulina,
    // lo nuevo (MU5-0)
    define, crea, estandar, de, libera, ruta, cobertura, duenos, estado,
    /** el estado tal como está ahora (estado es el del arranque): cambia solo si cambia el Render o se cargan los nodos */
    estadoAhora
  };
}

export type Materiales = ReturnType<typeof creaMateriales>;
/** La vista con dueño de un mundo o un componente. */
export type MaterialesDe = ReturnType<Materiales["de"]>;
/** Lo que reciben los interiores (MUNDOS §6 y §8, «interiores sin sombreadores propios»): solo estándar y su libera. */
export type MaterialesEstandar = Pick<MaterialesDe, "dueno" | "estandar" | "adopta" | "libera">;

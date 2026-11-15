// El catálogo de olivos-tipo (ADR-0012; contrato de entrada en contratos/olivos-tipo.md): de dónde sacan los niveles 1 y 2 su geometría. MU5-n (A3-2a): antes
// apps/web/motor/07a_catalogo.js, que queda como talón. Componente «catalogo-olivos» de los mundos ["exterior"], con un libera() que suelta de verdad las geometrías
// por procedimiento, las de los modelos instalados y los dos materiales instanciados. Mismo comportamiento que antes, sin cambio visible.
// Hoy solo hay el tipo −1 («sin asignar»): las formas por procedimiento de siempre (4 variantes de copa en vaso con su tronco en L1 y 2 masas en L2), las
// mismas que antes vivían dentro de 07b_arboles.js, creadas en el mismo orden y con los mismos materiales. El nivel 0 no sale de aquí: se construye árbol
// a árbol con la copa medida (06_arboles.js). Los modelos de un catálogo glb se registran con instala(desc, cargador, base), que nadie llama todavía.
// Del legado recibe por argumento lo que necesita (THREE, hash de 04d, parcheTiempo de 15_tiempo y la fábrica de materiales); no lee globales.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { DefMaterial, Materiales, MaterialMin } from "../../nucleo/materiales.ts";
import { colorSrgbTsl } from "./tiempo-parche.ts";
import { columnaInstancia } from "../comun/instancia-tsl.ts";

// three no trae tipos en el repo (como en ambiente.ts y presupuesto.ts): de él solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

export interface DepsCatalogo {
  THREE: T3;
  /** el ruido de 04d_sombreado_tiles (hash(n) → [0, 1)) */
  hash: (n: number) => number;
  /** el parche de 15_tiempo (sombra de nubes y escarcha, color por instancia en sRGB). 15_tiempo va DESPUÉS en el montaje: se llama al compilar, no al crear */
  parcheTiempo: (sh: unknown, viento: boolean) => void;
  /** la fábrica de materiales (nucleo/materiales) */
  Materiales: Materiales;
  /** A3-4: los nodos del tiempo en TSL (tiempo-parche.ts: nodosTsl), para la variante apagada; 15_tiempo va después en el montaje: se piden al construirla */
  tiempoTsl?: (() => ((T: unknown) => NodosTiempoMin) | null) | null;
}
/** lo que se usa de los nodos del tiempo (tiempo-parche.ts: NodosTiempo) */
export interface NodosTiempoMin { salida(xz: unknown): unknown }
/** una pieza de un nivel: lo que se instancia (07b_arboles.js) */
export interface Pieza { pieza: "copa" | "tronco"; geo: T3; mat: T3 }
/** el cargador de un catálogo glb: (url, THREE) → [{ nombre, geometria }], una entrada por pieza del glb */
export type Cargador = (url: string, THREE: T3) => Promise<{ nombre?: string; geometria: T3 }[]> | { nombre?: string; geometria: T3 }[];

export const ID_CATALOGO = "catalogo-olivos";

// ---------------------------------------------------------------- los materiales (MU5-n: por la fábrica, con sus nombres de la tabla de MATERIALES §1, fila 11)
/** los nombres de los dos materiales en la fábrica: son también las claves de sus variantes TSL */
export const MATERIAL_COPA_L1 = "copa-l1";
export const MATERIAL_TRONCO_L1 = "tronco-l1";
/** lo que pide cada uno: su parche de siempre (parcheCopa o parcheInst de creaCatalogo, que cierran sobre el parcheTiempo de 15_tiempo) */
export interface OpcCatalogo { parche: (sh: unknown) => void; tiempo?: DepsCatalogo["tiempoTsl"] }
/** el clásico de los dos: el Lambert blanco con color por vértice y el parche asignado tal cual (la MISMA función: three usa su texto como clave del programa) */
function clasicoInstanciado(o: OpcCatalogo, c: { THREE: Record<string, unknown> }): MaterialMin {
  const Lambert = c.THREE["MeshLambertMaterial"] as new (opc: unknown) => MaterialMin;
  const m = new Lambert({ color: 0xffffff, vertexColors: true });
  m.onBeforeCompile = o.parche;
  m.needsUpdate = true;
  return m;
}
// MU5-n, tercer commit (A3-2a) y A4-0: las variantes TSL, APAGADAS (solo con el WebGPURenderer, MU6; nadie las usa hoy). Desde A4-0 llevan lo que hace el
// clásico; NO se puede decir que sean equivalentes hasta las capturas de clásico frente a TSL de MU6 (MATERIALES §8):
//   · las dos: el Lambert blanco y el color por vértice y por instancia, escrito en sRGB (03_escena), pasado a lineal (colorSrgbTsl, lo de colorVertSRGB);
//   · la copa, además: la silueta rota por ruido hacia el borde (maskNode: se descarta donde nz < (vRim − 0,72) · 2,8), las motas (× 0,74 + 0,50 · nz2) y el envés
//     plateado en el borde, con las mismas cuentas que el GLSL; vRim por vértice (varying), como el clásico; y (A4-0) la semilla de cada olivo por la POSICIÓN de su
//     matriz (instanceMatrix[3].xz), como el clásico, no por su índice de instancia (con el índice, el ruido de un olivo cambiaría cuando el nivel 1 se reordena);
//   · A3-4: la sombra de nubes y la helada de parcheTiempo (fila 2), tras la luz (outputNode), en la posición del mundo de cada instancia (positionWorld.xz), si se
//     dan los nodos del tiempo (tiempoTsl; sin ellos, sin nubes ni helada).
//   · COSTE (A4-0) [SIN MEDIR]: three no deja leer el nodo de la matriz de instancia que monta, así que la traslación se lee de una copia del mismo array como
//     atributo por instancia (instancia-tsl.ts: 64 B por olivo en la tarjeta, que se vuelve a subir cuando cambia instanceMatrix.version). Se mide en el banco (MU6).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Nodo = any;
function lambertTsl(c: { THREE: Record<string, unknown>; TSL: Record<string, unknown> }): { m: MaterialMin & { colorNode?: unknown; maskNode?: unknown; vertexColors?: boolean }; T: Record<string, Nodo>; base: Nodo } {
  const Lambert = c.THREE["MeshLambertNodeMaterial"] as new (opc: unknown) => MaterialMin & { colorNode?: unknown; maskNode?: unknown; vertexColors?: boolean };
  const T = c.TSL as Record<string, Nodo>;
  // vertexColors en false: el color por vértice entra ya pasado a lineal en colorNode (si no, el NodeMaterial lo multiplicaría otra vez, sin convertir)
  const m = new Lambert({ color: 0xffffff, vertexColors: false });
  const base = colorSrgbTsl(T, T.materialColor, true);
  return { m, T, base };
}
/** A3-4: la sombra de nubes y la helada (los nodos de parcheTiempo) tras la luz, en la posición del mundo (el clásico: (instanceMatrix · transformed).xz) */
function luzTiempo(m: MaterialMin & { outputNode?: unknown }, o: OpcCatalogo, c: { TSL: Record<string, unknown> }): void {
  const f = o && o.tiempo ? o.tiempo() : null; if (!f) return;
  m.outputNode = f(c.TSL).salida((c.TSL as Record<string, Nodo>).positionWorld.xz);
}
/** A4-0: la semilla del clásico, fract(sin(dot(instanceMatrix[3].xz, (12,9898, 78,233))) · 43758,5453), por vértice (instancia-tsl.ts). Sin instancias, 0 */
export function semillaPosicion(W: Record<string, unknown>, T: Record<string, Nodo>): Nodo {
  const t = columnaInstancia(W, T, 3);
  return T.varying(T.fract(T.sin(T.dot(T.vec2(t.x, t.z), T.vec2(12.9898, 78.233))).mul(43758.5453)));
}
export const DEF_COPA_L1: DefMaterial<OpcCatalogo> = {
  clasico: clasicoInstanciado,
  tsl: function (_o, c) {
    const { m, T, base } = lambertTsl(c);
    const h3 = function (p: Nodo): Nodo { return T.fract(T.sin(T.dot(p, T.vec3(12.9898, 78.233, 37.719))).mul(43758.5453)); };   // ot_h3 del GLSL
    const semilla = semillaPosicion(c.THREE, T);   // A4-0: por la posición de la matriz, como el clásico
    const rim = T.varying(T.float(1).sub(T.clamp(T.abs(T.dot(T.normalize(T.normalView), T.normalize(T.positionView.negate()))), 0, 1)));   // vRim, por vértice
    const loc = T.positionGeometry;
    const nz = h3(T.floor(loc.mul(7).add(semilla.mul(31)))), nz2 = h3(T.floor(loc.mul(15).add(semilla.mul(17))));
    m.maskNode = nz.greaterThanEqual(rim.sub(0.72).mul(2.8));   // if (nz < (vRim − 0.72) · 2.8) discard;
    const enves = T.sRGBTransferEOTF(T.vec3(0.64, 0.70, 0.56));
    const motas = base.rgb.mul(nz2.mul(0.50).add(0.74));
    m.colorNode = T.vec4(T.mix(motas, enves, T.smoothstep(0.45, 1.0, rim).mul(0.40).mul(nz.add(0.45))), 1);
    luzTiempo(m, _o, c);
    return m;
  }
};
export const DEF_TRONCO_L1: DefMaterial<OpcCatalogo> = {
  clasico: clasicoInstanciado,
  tsl: function (o, c) { const { m, T, base } = lambertTsl(c); m.colorNode = T.vec4(base.rgb, 1); luzTiempo(m, o, c); return m; }
};

export function creaCatalogo(d: DepsCatalogo) {
  const THREE = d.THREE, hash = d.hash, parcheTiempo = d.parcheTiempo, Materiales = d.Materiales;
  var SIN = -1, VARIANTES = [0, 4, 2], PRES_TRI = [800, 170, 30], TOLERANCIA = 0.2, NIV = ["L0", "L1", "L2"];   // presupuesto por modelo = contratos/olivos-tipo.schema.json
  var proc: Record<string, Pieza[]> = {}, modelos: Record<string, T3> = {}, idCatalogo: string | null = null, oyentes: ((t: number[]) => void)[] = [], avisos: string[] = [];

  // ----- las formas: una copa en vaso (abierta por abajo, cerrada con un casquete oscuro), 4 variantes de lóbulos, y un tronco de 2 o 3 pies
  function copaGeo(seed: number, anillos: number, lados: number, lobulos: number): T3 {
    var pos: number[] = [], col: number[] = [], idx: number[] = [], th0 = 0.62, y0 = (1 - Math.cos(th0)) / 2, i, j;
    for (i = 0; i <= anillos; i++) {
      var th = th0 + (Math.PI - th0) * i / anillos, s = Math.sin(th), yy = ((1 - Math.cos(th)) / 2 - y0) / (1 - y0);
      for (j = 0; j < lados; j++) {
        var ph = j / lados * 6.2832, m = 1 + lobulos * 0.20 * Math.sin(3 * ph + seed * 6.1) * s + lobulos * 0.12 * Math.sin(5 * ph + seed * 2.3 + th * 2) + lobulos * 0.10 * (hash(seed * 31 + i * 13 + j) - 0.5);
        var yj = yy + 0.07 * lobulos * Math.sin(2 * ph + seed * 3.7) * s;
        pos.push(Math.cos(ph) * s * m, yj, Math.sin(ph) * s * m);
        var sh = (0.5 + 0.55 * yy) * (1 + (hash(seed * 7 + i * 5 + j) - 0.5) * 0.14); col.push(sh, sh, sh);
      }
    }
    var cen = pos.length / 3; pos.push(0, 0.02, 0); col.push(0.28, 0.28, 0.28);   // el casquete de debajo: oscuro, para que desde abajo (paseo) no se vea hueco
    for (i = 0; i < anillos; i++) for (j = 0; j < lados; j++) {
      var a = i * lados + j, b = i * lados + (j + 1) % lados, c = a + lados, e = b + lados; idx.push(a, c, b, b, c, e);
    }
    for (j = 0; j < lados; j++) idx.push(cen, j, (j + 1) % lados);
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    // que las caras miren hacia fuera (comprobado con una normal de la franja media)
    var nr = g.attributes.normal, ps = g.attributes.position, k = Math.floor(anillos / 2) * lados; if (nr.getX(k) * ps.getX(k) + nr.getZ(k) * ps.getZ(k) < 0) { for (var q = 0; q < idx.length; q += 3) { var tmp = idx[q + 1] as number; idx[q + 1] = idx[q + 2] as number; idx[q + 2] = tmp; } g.setIndex(idx); g.computeVertexNormals(); }
    return g;
  }
  function troncoGeo(pies: number, seed: number): T3 {   // pies que salen casi juntos de la base y se abren hacia la copa; unidad de altura, ramas de 5 caras
    var pos: number[] = [], col: number[] = [], idx: number[] = [], base = 0, st, j, RS = 5;
    for (st = 0; st < pies; st++) {
      var an = seed * 2.1 + st / pies * 6.2832 + (hash(seed + st * 3) - 0.5) * 0.6, dx = Math.cos(an) * (0.30 + 0.12 * hash(seed * 5 + st)), dz = Math.sin(an) * (0.30 + 0.12 * hash(seed * 5 + st));
      for (var e = 0; e < 2; e++) {
        var r = e ? 0.095 : 0.20, px = e ? dx : dx * 0.18, py = e ? 1.0 : 0.0, pz = e ? dz : dz * 0.18;
        for (j = 0; j < RS; j++) { var a2 = j / RS * 6.2832 + st; pos.push(px + Math.cos(a2) * r, py, pz + Math.sin(a2) * r); var m = (e ? 0.9 : 0.62) * (0.9 + 0.2 * hash(st * 7 + j + seed)); col.push(0.38 * m, 0.31 * m, 0.24 * m); }
      }
      for (j = 0; j < RS; j++) { var a = base + j, b = base + (j + 1) % RS, c = a + RS, dd = b + RS; idx.push(a, b, c, b, dd, c); }
      base += 2 * RS;
    }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    var nr = g.attributes.normal, ps = g.attributes.position; if (nr.getX(0) * ps.getX(0) + nr.getZ(0) * ps.getZ(0) < 0) { for (var q = 0; q < idx.length; q += 3) { var tp = idx[q + 1] as number; idx[q + 1] = idx[q + 2] as number; idx[q + 2] = tp; } g.setIndex(idx); g.computeVertexNormals(); }
    return g;
  }
  // el sombreador de la copa instanciada: sombra de nubes y helada (como el resto), silueta rota por ruido hacia el borde, motas de hoja y el envés plateado en el borde
  function parcheInst(sh: T3): void { parcheTiempo(sh, false); sh.vertexShader = sh.vertexShader.replace("vSomb = ot_sombra(position.xz);", "vSomb = ot_sombra((instanceMatrix * vec4(transformed, 1.0)).xz);"); }
  function parcheCopa(sh: T3): void {
    parcheInst(sh);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vLoc; varying float vSeed; varying float vRim;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vLoc = position; vSeed = fract(sin(dot(vec2(instanceMatrix[3][0], instanceMatrix[3][2]), vec2(12.9898, 78.233))) * 43758.5453);")
      .replace("#include <project_vertex>", "#include <project_vertex>\n vRim = 1.0 - clamp(abs(dot(normalize(transformedNormal), normalize(-mvPosition.xyz))), 0.0, 1.0);");
    sh.fragmentShader = sh.fragmentShader.replace("void main() {", "varying vec3 vLoc; varying float vSeed; varying float vRim;\nfloat ot_h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }\nvoid main() {")
      .replace("#include <color_fragment>", "#include <color_fragment>\n float nz = ot_h3(floor(vLoc * 7.0 + vSeed * 31.0)); float nz2 = ot_h3(floor(vLoc * 15.0 + vSeed * 17.0));\n if (nz < (vRim - 0.72) * 2.8) discard;\n diffuseColor.rgb *= 0.74 + 0.50 * nz2;\n diffuseColor.rgb = mix(diffuseColor.rgb, sRGBTransferEOTF(vec4(0.64, 0.70, 0.56, 1.0)).rgb,smoothstep(0.45, 1.0, vRim) * 0.40 * (0.45 + nz));");
  }
  // MU5-n: los dos materiales salen de la fábrica (define + crea con dueño «catalogo-olivos»): lo que cree este componente se libera con su libera()
  Materiales.define(MATERIAL_COPA_L1, DEF_COPA_L1); Materiales.define(MATERIAL_TRONCO_L1, DEF_TRONCO_L1);
  var materiales = Materiales.de(ID_CATALOGO);
  var tiempo = d.tiempoTsl || null;   // A3-4: para la TSL (apagada), los nodos del tiempo
  var matCopaI: T3 = materiales.crea(MATERIAL_COPA_L1, { parche: parcheCopa, tiempo: tiempo }), matTroncoI: T3 = materiales.crea(MATERIAL_TRONCO_L1, { parche: parcheInst, tiempo: tiempo });

  // las piezas por procedimiento, creadas al pedirlas y guardadas (07b_arboles.js las pide al montarse, en el orden de antes)
  function procedural(nivel: number, v: number): Pieza[] {
    var k = nivel + "_" + v, ya = proc[k]; if (ya) return ya;
    return (proc[k] = nivel === 1 ? [{ pieza: "copa", geo: copaGeo(v + 1, 6, 10, 1), mat: matCopaI }, { pieza: "tronco", geo: troncoGeo(v % 2 ? 3 : 2, v + 3), mat: matTroncoI }]
      : nivel === 2 ? [{ pieza: "copa", geo: copaGeo(v + 11, 2, 7, 1), mat: matCopaI }] : []);
  }
  function tiene(t: number): boolean { return t === SIN || Object.prototype.hasOwnProperty.call(modelos, t); }
  function tipos(): number[] { return [SIN].concat(Object.keys(modelos).map(Number).sort(function (a, b) { return a - b; })); }
  function variantes(t: number, nivel: number): number { if (t === SIN) return VARIANTES[nivel] || 0; var M = modelos[t]; return M && M.niveles[nivel].length ? 1 : 0; }
  // geometria(tipo, nivel, variante) → [{ pieza: "copa"|"tronco", geo, mat }]: lo que se instancia de ese nivel (L0 de −1: [], lo construye 06_arboles.js)
  function geometria(t: number, nivel: number, v?: number): Pieza[] { if (t === SIN) return procedural(nivel, v || 0); var M = modelos[t]; return M ? M.niveles[nivel] : []; }
  function cuenta(ps: Pieza[]): number { return ps.reduce(function (s, p) { return s + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3; }, 0); }
  function triangulos(t: number, nivel: number, v?: number): number { return cuenta(geometria(t, nivel, v)); }
  function info(t: number) {
    if (t === SIN) return { id: SIN, nombre: "por procedimiento", fuente: "ilustrativo", caja: null };
    var M = modelos[t]; return M ? { id: t, nombre: M.nombre, fuente: M.fuente, caja: M.caja } : null;
  }

  // ----- catálogo glb (preparado, SIN activar en F1b). Sin dependencias: quien llama inyecta cargador(url, THREE) → Promise de [{ nombre, geometria }],
  // una entrada por pieza del glb (BufferGeometry en metros, pivote en la base del tronco, +Y arriba). El motor pone sus propios materiales (copa o tronco,
  // por el nombre de la pieza), así que los modelos-tipo reciben la misma luz, sombra de nubes y helada que el resto. Un tipo que se pasa de su presupuesto
  // de triángulos (PRES_TRI × 1,2) no se registra y queda en avisos(); sus olivos siguen como tipo −1.
  function pieza(p: { nombre?: string; geometria: T3 }): Pieza {
    var g = p.geometria, n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.color) { var c = new Float32Array(n * 3); c.fill(1); g.setAttribute("color", new THREE.BufferAttribute(c, 3)); }   // los materiales del motor llevan color por vértice
    else {   // el COLOR_0 de glTF es lineal y el motor escribe el color por vértice en sRGB (03_escena): se pasa a sRGB una vez, al registrar
      var ca = g.attributes.color, cl = new THREE.Color();
      for (var q = 0; q < ca.count; q++) { cl.setRGB(ca.getX(q), ca.getY(q), ca.getZ(q)).convertLinearToSRGB(); ca.setXYZ(q, cl.r, cl.g, cl.b); }
      ca.needsUpdate = true;
    }
    g.computeBoundingBox();
    var tr = /tronco/i.test(p.nombre || ""); return { pieza: tr ? "tronco" : "copa", geo: g, mat: tr ? matTroncoI : matCopaI };
  }
  function caja(niveles: Pieza[][]) {   // altura y semiejes del modelo (del nivel más detallado que haya): con ellos se estira a la copa medida de cada olivo
    var n0 = niveles[0] as Pieza[], n1 = niveles[1] as Pieza[], ps = n0.length ? n0 : n1.length ? n1 : niveles[2] as Pieza[], b = new THREE.Box3();
    ps.forEach(function (p) { b.union(p.geo.boundingBox); });
    return { alto: Math.max(0.5, b.max.y), rx: Math.max(0.3, Math.max(-b.min.x, b.max.x)), rz: Math.max(0.3, Math.max(-b.min.z, b.max.z)) };
  }
  function avisa(): void { oyentes.forEach(function (fn) { fn(tipos()); }); }
  function instala(desc: T3, cargador: Cargador, base?: string): Promise<number[]> {
    if (typeof cargador !== "function") return Promise.reject(new Error("Catalogo.instala: falta la función cargador(url, THREE)"));
    var pref = base || "";
    idCatalogo = typeof desc.id === "string" ? desc.id : null;   // D-03: los números de copas_tipo solo valen con el catálogo que nombra el índice
    return Promise.all((desc.tipos || []).map(function (tp: T3) {
      return Promise.all(NIV.map(function (nv) {
        var f = tp.niveles && tp.niveles[nv]; if (!f) return [];
        return Promise.resolve(cargador(pref + f.glb, THREE)).then(function (ps) { return ps.map(pieza); });
      })).then(function (niveles: Pieza[][]) {
        var mal = niveles.map(cuenta).filter(function (n, i) { return n > (PRES_TRI[i] as number) * (1 + TOLERANCIA); });
        if (mal.length || (!(niveles[1] as Pieza[]).length && !(niveles[2] as Pieza[]).length)) { avisos.push("tipo " + tp.id + " (" + tp.nombre + "): " + (mal.length ? "se pasa del presupuesto de triángulos" : "sin L1 ni L2")); niveles.forEach(function (ps) { ps.forEach(function (p) { p.geo.dispose(); }); }); return; }
        if (modelos[tp.id]) retira(tp.id, true);
        modelos[tp.id] = { nombre: tp.nombre, fuente: tp.fuente || desc.fuente, niveles: niveles, caja: caja(niveles) };
      });
    })).then(function () { avisa(); return tipos(); });
  }
  function retira(t: number, callado?: boolean): boolean {
    var M = modelos[t]; if (!M) return false;
    M.niveles.forEach(function (ps: Pieza[]) { ps.forEach(function (p) { p.geo.dispose(); }); }); delete modelos[t];
    if (!callado) avisa(); return true;
  }
  function alCambiar(fn: (t: number[]) => void): void { oyentes.push(fn); }
  /** MU5-n: lo suelta todo de verdad: las geometrías por procedimiento (que se rehacen si se vuelven a pedir), las de los modelos instalados y los dos
   *  materiales instanciados (three los vuelve a preparar si alguien los dibuja después). Avisa a los oyentes si había modelos. Dos veces no libera dos veces. */
  function libera(): number {
    var n = 0;
    Object.keys(proc).forEach(function (k) { (proc[k] as Pieza[]).forEach(function (p) { p.geo.dispose(); n++; }); delete proc[k]; });
    var habia = Object.keys(modelos).length > 0;
    Object.keys(modelos).forEach(function (t) { modelos[t].niveles.forEach(function (ps: Pieza[]) { ps.forEach(function (p) { p.geo.dispose(); n++; }); }); delete modelos[t]; });
    materiales.libera();   // los dos materiales instanciados (la fábrica no suelta dos veces)
    if (habia) avisa();
    return n;
  }
  return { SIN: SIN, PRES_TRI: PRES_TRI, id: function (): string | null { return idCatalogo; }, tipos: tipos, tiene: tiene, variantes: variantes, geometria: geometria, triangulos: triangulos, info: info, instala: instala, retira: retira, alCambiar: alCambiar, avisos: function () { return avisos.slice(); }, libera: libera };
}
export type Catalogo = ReturnType<typeof creaCatalogo>;

/** El manifiesto del componente «catalogo-olivos»: el ciclo de vida del catálogo. El objeto que el motor usa (Catalogo) es el mismo que monta (lo crea el legado al
 *  cargarse: 07b_arboles.js lo pide al montarse, antes que los componentes). */
export function manifiestoCatalogo(catalogo: Catalogo): Manifiesto {
  return {
    id: ID_CATALOGO, version: 1,
    consume: ["Materiales"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0 },   // no dibuja: da las formas que instancia 07b_arboles.js, cuyo coste cuentan TOPE_TRI y pruebas/presupuesto.json
    mundos: ["exterior"],
    monta: function () { return catalogo; },
    libera: function (api) { if (api) (api as Catalogo).libera(); }
  };
}

// El sombreado de los olivos generados: el parche de luz del motor (luz, nubes, escarcha, color por lote en sRGB) y el FUNDIDO por tramado (ADR-0017, O9c, ADR-0022 §5).
// MU5-n (A3-2a): antes dentro de Generados en apps/web/motor/07ab_generados.js; el GLSL es el de siempre, movido. Los uniformes uFun y uBanda son los mismos objetos
// que mueve Generados.paso() y que comparte el tramado complementario de los lejanos (07ac, por Generados.lejanos).
import { MaterialesPuro } from "../../nucleo/materiales.ts";
import type { DefMaterial } from "../../nucleo/materiales.ts";
import { colorSrgbTsl } from "./tiempo-parche.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

// GLSL: código de cada pieza c = rol + 3 · ranura. rol 0 se queda (no descarta nada), 1 entra (se dibuja donde el ruido < f), 2 sale (donde ≥ f: el
// complementario). Ranura 0: f = uFun (0 → 1), el fundido por tiempo al colocar un lote; fuera de él vale 1. Ranuras 1-63 (O9c, la escalera): f
// = uBanda[ranura], el peso del escalón más fino de un olivo en la banda de su frontera, que paso() pone cada fotograma según la distancia
// (ADR-0022 §5). En las mallas por lotes, c va en el alfa del color por instancia (1 − c / 2: 1, 0,5, 0, −0,5…); en las instanciadas y los
// puntos, en el atributo aFun. vFun = rol y vFr = f, del vértice al fragmento.
export var GLSL_FUN_V = "varying float vFun; varying float vFr; uniform float uFun; uniform vec4 uBanda[16];\n#ifndef USE_BATCHING\nattribute float aFun;\n#endif\n";
export var GLSL_FUN_M = "\n float ot_c;\n#ifdef USE_BATCHING_COLOR\n ot_c = floor((1.0 - getBatchingColor(getIndirectIndex(gl_DrawID)).a) * 2.0 + 0.5);\n#elif defined( USE_BATCHING )\n ot_c = 0.0;\n#else\n ot_c = aFun;\n#endif\n" +
  " float ot_s = floor(ot_c / 3.0 + 0.01); vFun = ot_c - 3.0 * ot_s; int ot_si = int(ot_s + 0.5);\n" +
  " vFr = ot_si == 0 ? uFun : dot(uBanda[ot_si / 4], vec4(equal(ivec4(0, 1, 2, 3), ivec4(ot_si - (ot_si / 4) * 4))));\n";
export var GLSL_FUN_F = "varying float vFun; varying float vFr;\nfloat ot_ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }\n";

/** los uniformes del fundido: uFun (el avance del fundido por tiempo) y uBanda (16 vec4 = 64 ranuras: el peso de cada olivo en banda) */
export function uniformesFundido(THREE: A): { uFun: { value: number }; uBanda: { value: A[] } } {
  var uFun = { value: 1 }, uBanda: { value: A[] } = { value: [] };
  for (var ib = 0; ib < 16; ib++) uBanda.value.push(new THREE.Vector4(1, 1, 1, 1));
  return { uFun: uFun, uBanda: uBanda };
}
/** el parche del fundido por tramado con esos uniformes (también en la pasada de sombras) */
export function parcheFundidoDe(u: { uFun: A; uBanda: A }): (sh: A) => void {
  var uFun = u.uFun, uBanda = u.uBanda;
  return function parcheFundido(sh: A): void {
    sh.uniforms.uFun = uFun; sh.uniforms.uBanda = uBanda;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + GLSL_FUN_V).replace("#include <begin_vertex>", "#include <begin_vertex>" + GLSL_FUN_M);
    sh.fragmentShader = sh.fragmentShader.replace("void main() {", GLSL_FUN_F + "void main() {\n if (vFun > 0.5) { float ot_d = ot_ign(gl_FragCoord.xy); if (vFun < 1.5 ? ot_d >= vFr : ot_d < vFr) discard; }");
  };
}
/** el parche de luz con el parcheTiempo de 15_tiempo (que va después en el montaje: se llama al compilar) */
export function parcheLuzDe(parcheTiempo: (sh: A, viento: boolean) => void): (sh: A) => void {
  return function parcheLuz(sh: A): void {
    parcheTiempo(sh, false);   // sombra de nubes y escarcha (15_tiempo) y color por instancia en sRGB (03_escena)
    // la sombra de nubes, en la posición del mundo (cada pieza va por lotes o instanciada: position.xz es la local)
    sh.vertexShader = sh.vertexShader.replace("vSomb = ot_sombra(position.xz);", "vec4 ot_w = vec4(transformed, 1.0);\n#ifdef USE_BATCHING\n ot_w = batchingMatrix * ot_w;\n#endif\n#ifdef USE_INSTANCING\n ot_w = instanceMatrix * ot_w;\n#endif\n vSomb = ot_sombra((modelMatrix * ot_w).xz);")
      // el color por instancia de las mallas por lotes también está escrito en sRGB (colorVertSRGB solo atiende a USE_COLOR y USE_INSTANCING_COLOR)
      .replace("#include <color_vertex>", "#include <color_vertex>\n#if defined( USE_BATCHING_COLOR ) && ! defined( USE_COLOR ) && ! defined( USE_INSTANCING_COLOR )\n vColor.rgb = ot_lin(vColor.rgb);\n#endif");
  };
}

// ---------------------------------------------------------------- los materiales por la fábrica (MU5-n: MATERIALES §1, filas 12 y 13)
// El clásico es el de siempre, movido: el material que crea el constructor (o, para la profundidad de las mallas por lotes, uno nuevo) con su parche encadenado DESPUÉS
// del que ya tenga, por el encadena() de la biblioteca de olivos (la misma clave combinada: «…|gen-luz-fundido» y «…|gen-fundido»).
export const MATERIAL_GEN_OLIVO = "gen-olivo";
export const MATERIAL_GEN_PROFUNDIDAD = "gen-profundidad";
type Encadena = (m: A, fn: (sh: A) => void, clave?: string) => A;
/** gen-olivo: material = el MeshStandardMaterial (o PointsMaterial) del constructor, ya en lineal y con su recorte; parche = luz + fundido; propia = el encadena de la biblioteca */
export interface OpcGenOlivo { material: A; parche: (sh: A) => void; propia?: Encadena | null; uniformes?: { uFun: A; uBanda: A }; tiempo?: (() => ((T: A) => A) | null) | null }
/** gen-profundidad: material = el MeshDepthMaterial del constructor (las sombras de las hojas) o null para uno nuevo (el de las mallas por lotes); fundido = el parche del fundido */
export interface OpcGenProfundidad { material: A | null; fundido: (sh: A) => void; propia?: Encadena | null; uniformes?: { uFun: A; uBanda: A } }
// MU5-n, tercer commit (A3-2a) y A4-0: las variantes TSL, APAGADAS (solo con el WebGPURenderer, MU6; nadie las usa hoy). Desde A4-0 llevan lo que hace el
// clásico; NO se puede decir que sean equivalentes hasta las capturas de clásico frente a TSL de MU6 (MATERIALES §8):
//   · el NodeMaterial de la misma clase (Standard o Points) con las propiedades del clásico (el MISMO objeto de color, el mapa, el recorte, la cara…);
//   · el FUNDIDO por tramado, como maskNode y maskShadowNode, con los MISMOS uFun y uBanda que mueve Generados: en las piezas instanciadas y los puntos, el código
//     del atributo aFun; (A4-0) en las mallas por lotes (corteza, madera muerta, olivas…), el del alfa del color del lote (batchColor.a = 1 − c / 2, lo que el GLSL lee
//     con getBatchingColor(gl_DrawID)); sin color de lote, 0 (se queda), como el clásico. Se decide al construir, por objeto;
//   · la luz del motor (parcheLuz): (A4-0) el color por vértice, por instancia y por lote leído en sRGB (colorSrgbTsl) y (A3-4) la sombra de nubes y la helada de
//     parcheTiempo en la posición del mundo (con la matriz del lote o de la instancia), si se dan los nodos del tiempo;
//   · gen-profundidad: el mismo fundido en la sombra, también (A4-0) la de las mallas por lotes. [NO VERIFICADO] si el WebGPURenderer usa customDepthMaterial; lo
//     seguro es el maskShadowNode del material principal, que ya lleva gen-olivo. El motor no enciende las sombras (L5-12): hoy no se dibuja en ninguna ruta.
//   · DIFIERE [NO VERIFICADO, solo si una pieza por lotes llevara recorte alfa o transparencia]: el NodeMaterial multiplica también el ALFA de la pieza por el del
//     color del lote (el clásico, solo el color), que aquí es el código del fundido; con un material opaco three lo pone a 1 después y no cambia nada.
// las piezas que van en mallas por lotes (BatchedMesh): el fundido sale del color del lote (ver fundidoTsl)
export const PIEZAS_POR_LOTES = ["pies", "corteza", "musgo", "muerta", "raiz", "corte", "tutor", "oliva"];
/** el código del fundido de cada pieza (c = rol + 3 · ranura), como GLSL_FUN_M: del alfa del color del lote, 0 en un lote sin color, o el atributo aFun */
function codigoFundido(T: A): A {
  return T.Fn(function (_e: A, b: A) {
    var o = b && b.object;
    if (o && o.isBatchedMesh) return o._colorsTexture ? T.floor(T.float(1).sub(T.batchColor.a).mul(2).add(0.5)) : T.float(0);
    return T.attribute("aFun", "float");
  })();
}
/** el fundido como nodo booleano (true = se dibuja): rol 0 siempre; rol 1 donde el ruido < f; rol 2 donde ≥ f. f = uFun en la ranura 0 o uBanda[ranura] en las demás */
export function fundidoTsl(T: A, u: { uFun: A; uBanda: A }): A {
  var uFun = u.uFun, uBanda = u.uBanda;
  var codigo = codigoFundido(T), ranura = T.floor(codigo.div(3).add(0.01)), rol = codigo.sub(ranura.mul(3));
  var fun = T.uniform(uFun.value).onObjectUpdate(function () { return uFun.value; });
  var bandas = T.uniformArray(uBanda.value, "vec4"), ri = T.int(ranura.add(0.5)), v = bandas.element(ri.div(4)), comp = ri.sub(ri.div(4).mul(4));
  var peso = T.select(comp.equal(0), v.x, T.select(comp.equal(1), v.y, T.select(comp.equal(2), v.z, v.w)));
  var f = T.select(ri.equal(0), fun, peso);
  var p = T.screenCoordinate.xy, ruido = T.fract(T.fract(T.dot(p, T.vec2(0.06711056, 0.00583715))).mul(52.9829189));   // ot_ign(gl_FragCoord.xy)
  return rol.lessThan(0.5).or(rol.lessThan(1.5).and(ruido.lessThan(f))).or(rol.greaterThanEqual(1.5).and(ruido.greaterThanEqual(f)));
}
var COPIA = ["name", "map", "alphaMap", "alphaTest", "alphaToCoverage", "transparent", "opacity", "side", "roughness", "metalness", "vertexColors", "size", "sizeAttenuation", "depthWrite", "depthTest", "fog"];
export const DEF_GEN_OLIVO: DefMaterial<OpcGenOlivo & { pieza?: string }> = {
  clasico: function (o) { return (o.propia || MaterialesPuro.encadenaPropia)(o.material, o.parche, "gen-luz-fundido"); },
  tsl: function (o, c) {
    var b = o.material, T = c.TSL as A, Clase = c.THREE[b && b.isPointsMaterial ? "PointsNodeMaterial" : "MeshStandardNodeMaterial"] as new () => A, m = new Clase();
    COPIA.forEach(function (k) { if (b && b[k] !== undefined) m[k] = b[k]; });
    if (b && b.color) m.color = b.color;   // el MISMO objeto (la calibración de la luz lineal lo multiplica después)
    // A4-0: el color por vértice, por instancia y por lote, de sRGB a lineal (lo de colorVertSRGB y del parche de luz)
    m.vertexColors = false; m.colorNode = colorSrgbTsl(T, T.materialColor, !!(b && b.vertexColors));
    if (o.uniformes) { var vis = fundidoTsl(T, o.uniformes); m.maskNode = vis; m.maskShadowNode = vis; }   // A4-0: también en las mallas por lotes
    // A3-4: la sombra de nubes y la helada de parcheTiempo (fila 2) tras la luz, en la posición del mundo (el clásico: modelMatrix · batching/instancia · transformed),
    // si se dan los nodos del tiempo. En los puntos, no: el sombreador de puntos clásico no tiene <dithering_fragment> y no las lleva
    var f = o.tiempo ? o.tiempo() : null; if (f && !(b && b.isPointsMaterial)) m.outputNode = f(T).salida(T.positionWorld.xz);
    return m;
  }
};
export const DEF_GEN_PROFUNDIDAD: DefMaterial<OpcGenProfundidad> = {
  clasico: function (o, c) {
    var dm = o.material || new (c.THREE["MeshDepthMaterial"] as new (p: unknown) => A)({ depthPacking: c.THREE["RGBADepthPacking"] });
    return (o.propia || MaterialesPuro.encadenaPropia)(dm, o.fundido, "gen-fundido");
  },
  tsl: function (o, c) {
    var b = o.material, m = new (c.THREE["MeshBasicNodeMaterial"] as new () => A)();
    ["map", "alphaMap", "alphaTest", "side"].forEach(function (k) { if (b && b[k] !== undefined) m[k] = b[k]; });
    m.colorWrite = false;
    // las de las hojas y (A4-0) las de las mallas por lotes (material null: el código sale del color del lote), el mismo tramado
    if (o.uniformes) m.maskShadowNode = m.maskNode = fundidoTsl(c.TSL as A, o.uniformes);
    return m;
  }
};

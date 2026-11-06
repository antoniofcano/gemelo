// El sombreado de los olivos generados: el parche de luz del motor (luz, nubes, escarcha, color por lote en sRGB) y el FUNDIDO por tramado (ADR-0017, O9c, ADR-0022 §5).
// MU5-n (A3-2a): antes dentro de Generados en apps/web/motor/07ab_generados.js; el GLSL es el de siempre, movido. Los uniformes uFun y uBanda son los mismos objetos
// que mueve Generados.paso() y que comparte el tramado complementario de los lejanos (07ac, por Generados.lejanos).
import { MaterialesPuro } from "../../nucleo/materiales.ts";
import type { DefMaterial } from "../../nucleo/materiales.ts";

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
export interface OpcGenOlivo { material: A; parche: (sh: A) => void; propia?: Encadena | null; uniformes?: { uFun: A; uBanda: A } }
/** gen-profundidad: material = el MeshDepthMaterial del constructor (las sombras de las hojas) o null para uno nuevo (el de las mallas por lotes); fundido = el parche del fundido */
export interface OpcGenProfundidad { material: A | null; fundido: (sh: A) => void; propia?: Encadena | null; uniformes?: { uFun: A; uBanda: A } }
export const DEF_GEN_OLIVO: DefMaterial<OpcGenOlivo> = {
  clasico: function (o) { return (o.propia || MaterialesPuro.encadenaPropia)(o.material, o.parche, "gen-luz-fundido"); }
};
export const DEF_GEN_PROFUNDIDAD: DefMaterial<OpcGenProfundidad> = {
  clasico: function (o, c) {
    var dm = o.material || new (c.THREE["MeshDepthMaterial"] as new (p: unknown) => A)({ depthPacking: c.THREE["RGBADepthPacking"] });
    return (o.propia || MaterialesPuro.encadenaPropia)(dm, o.fundido, "gen-fundido");
  }
};

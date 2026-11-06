// El parche del tiempo (MATERIALES §1, fila 2): la sombra de las nubes que deriva con el viento, la escarcha de la helada, el color por vértice o por instancia
// escrito en sRGB y, en el follaje, el vaivén del viento por posición. MU5-n (A3-4): antes en apps/web/motor/15_tiempo.js (uViento, uSombra, GLSL_SOMBRA,
// conTiempo y parcheTiempo); el GLSL es el de siempre, movido. Lo llevan los materiales que tiñe el ciclo del día (matHojaG, matHojaP y matCorteza, con viento;
// matSuelo, matOrto y el de la nube, sin él) y, dentro de su propio parche, el terreno (04d), la nube LiDAR (05), el catálogo (07a), los olivos generados (07ab)
// y la hierba y las piedras (21_suelo, con GLSL_SOMBRA). Los uniformes son los MISMOS objetos para todos: los mueve el paso del tiempo (tiempo-paso.ts).

import type { DefMaterial } from "../../nucleo/materiales.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export interface UniformesViento { uT: { value: number }; uAmp: { value: number }; uDir: { value: A } }
export interface UniformesSombra { uDrift: { value: A }; uCov: { value: number }; uSomb: { value: number }; uHielo: { value: number } }

// Las nubes además echan su sombra sobre el terreno y los árboles: un ruido que deriva con el viento, calculado en la tarjeta gráfica.
export var GLSL_SOMBRA = "uniform vec2 uDrift; uniform float uCov; uniform float uSomb; varying float vSomb;\n" +
  "float ot_h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n" +
  "float ot_vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(ot_h(i), ot_h(i + vec2(1.0, 0.0)), f.x), mix(ot_h(i + vec2(0.0, 1.0)), ot_h(i + vec2(1.0, 1.0)), f.x), f.y); }\n" +
  "float ot_sombra(vec2 xz){ vec2 q = xz * 0.0042 - uDrift; float n = 0.6 * ot_vn(q) + 0.4 * ot_vn(q * 2.3 + 7.0); float t = mix(0.85, 0.22, uCov); return 1.0 - smoothstep(t - 0.07, t + 0.07, n) * uSomb * step(0.01, uCov); }\n";

export interface DepsParcheTiempo {
  THREE: A;
  /** 03_escena: el color por vértice o por instancia, escrito en sRGB, pasa a lineal (colorVertSRGB) */
  colorVertSRGB: (sh: A) => void;
  /** la fábrica de materiales (nucleo/materiales): aplica() pide por ella el material «parche-tiempo» (MU5-n, segundo commit). Sin ella, el parche se pone a mano, como antes */
  Materiales?: { define(nombre: string, def: DefMaterial<A>): void; crea(nombre: string, opc?: unknown): A } | null;
}

// ---------------------------------------------------------------- el material por la fábrica (MU5-n: MATERIALES §1, fila 2)
/** el nombre del parche del tiempo en la fábrica: es también la clave de su variante TSL */
export const MATERIAL_PARCHE_TIEMPO = "parche-tiempo";
/** lo que pide: el material del ciclo del día que lo lleva (es de otro módulo: 07_follaje, 04d o 05) y si lleva viento (el follaje) */
export interface OpcParcheTiempo { material: A; viento: boolean }
/** el clásico de siempre: el MISMO material, con el parche puesto por conTiempo (la misma función de siempre: three usa su texto como clave del programa) */
export function defParcheTiempo(conTiempo: (m: A, viento: boolean) => void): DefMaterial<OpcParcheTiempo> {
  return {
    clasico: function (o) { conTiempo(o.material, o.viento); return o.material; }
  };
}

export function creaParcheTiempo(d: DepsParcheTiempo) {
  var THREE = d.THREE, colorVertSRGB = d.colorVertSRGB;
  // --- el viento mueve el follaje (onBeforeCompile: un desplazamiento suave que depende de la posición)
  var uViento: UniformesViento = { uT: { value: 0 }, uAmp: { value: 0 }, uDir: { value: new THREE.Vector2(1, 0) } };
  var uSombra: UniformesSombra = { uDrift: { value: new THREE.Vector2(0, 0) }, uCov: { value: 0 }, uSomb: { value: 0 }, uHielo: { value: 0 } };
  function conTiempo(m: A, viento: boolean): void {
    m.onBeforeCompile = function (sh: A) { parcheTiempo(sh, viento); };
    m.needsUpdate = true;
  }
  function parcheTiempo(sh: A, viento: boolean): void {
    colorVertSRGB(sh);   // el color por vértice o por instancia de lo que lleva el tiempo está escrito en sRGB (03_escena)
    {
      sh.uniforms.uDrift = uSombra.uDrift; sh.uniforms.uCov = uSombra.uCov; sh.uniforms.uSomb = uSombra.uSomb; sh.uniforms.uHielo = uSombra.uHielo;
      if (viento) { sh.uniforms.uT = uViento.uT; sh.uniforms.uAmp = uViento.uAmp; sh.uniforms.uDir = uViento.uDir; }
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + (viento ? "uniform float uT; uniform float uAmp; uniform vec2 uDir;\n" : "") + GLSL_SOMBRA)
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n vSomb = ot_sombra(position.xz);" + (viento ? "\n float ph = position.x * 0.21 + position.z * 0.17; float rf = sin(uT * 1.9 + ph) + 0.6 * sin(uT * 3.1 + ph * 1.7);\n transformed.xz += uDir * (uAmp * (0.55 + 0.45 * rf)); transformed.y += 0.12 * uAmp * sin(uT * 2.3 + ph * 2.0);" : ""));
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", "varying float vSomb; uniform float uHielo;\nvoid main() {").replace("#include <dithering_fragment>", "gl_FragColor.rgb *= vSomb; gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.88, 0.94, 1.0), uHielo * 0.6);\n#include <dithering_fragment>");
    }
  }
  // los materiales del ciclo del día que llevan el parche son de otros módulos (07_follaje, 04d, 05): aplica() apunta lo que tenían y suelta() se lo devuelve.
  // MU5-n: por la fábrica («parche-tiempo»), sin dueño, porque el material no es de este componente (su libera no debe soltarlo). Con el clásico, la fábrica
  // devuelve el MISMO material con el parche; con el renderizador nuevo y variante TSL (MU6), un NodeMaterial aparte, que sí es de aquí: suelta() lo libera
  var M = d.Materiales || null;
  if (M) M.define(MATERIAL_PARCHE_TIEMPO, defParcheTiempo(conTiempo));
  var parcheados: A[] = [];
  function aplica(m: A, viento: boolean): A {
    var previo = m.onBeforeCompile, r = M ? M.crea(MATERIAL_PARCHE_TIEMPO, { material: m, viento: viento }) : (conTiempo(m, viento), m);
    parcheados.push({ m: m, previo: previo, nuestro: m.onBeforeCompile, variante: r !== m ? r : null }); return r;
  }
  function suelta(): number {
    var n = 0;
    parcheados.forEach(function (p: A) {
      if (p.variante) { if (typeof p.variante.dispose === "function") p.variante.dispose(); n++; return; }
      if (p.m.onBeforeCompile === p.nuestro) { p.m.onBeforeCompile = p.previo; p.m.needsUpdate = true; n++; }
    });
    parcheados.length = 0;
    return n;
  }
  return { uViento: uViento, uSombra: uSombra, GLSL_SOMBRA: GLSL_SOMBRA, conTiempo: conTiempo, parcheTiempo: parcheTiempo, aplica: aplica, suelta: suelta };
}
export type ParcheTiempo = ReturnType<typeof creaParcheTiempo>;

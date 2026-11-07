// El parche del tiempo (MATERIALES §1, fila 2): la sombra de las nubes que deriva con el viento, la escarcha de la helada, el color por vértice o por instancia
// escrito en sRGB y, en el follaje, el vaivén del viento por posición. MU5-n (A3-4): antes en apps/web/motor/15_tiempo.js (uViento, uSombra, GLSL_SOMBRA,
// conTiempo y parcheTiempo); el GLSL es el de siempre, movido. Lo llevan los materiales que tiñe el ciclo del día (matHojaG, matHojaP y matCorteza, con viento;
// matSuelo, matOrto y el de la nube, sin él) y, dentro de su propio parche, el terreno (04d), la nube LiDAR (05), el catálogo (07a), los olivos generados (07ab)
// y la hierba y las piedras (21_suelo, con GLSL_SOMBRA). Los uniformes son los MISMOS objetos para todos: los mueve el paso del tiempo (tiempo-paso.ts).

import type { DefMaterial } from "../../nucleo/materiales.ts";
import { centroPunto } from "./puntos-tsl.ts";

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
// ---------------------------------------------------------------- MU5-n, tercer commit: la variante TSL, APAGADA y PARCIAL (MATERIALES §11)
// Solo la daría la fábrica con el WebGPURenderer (MU6), que hoy no se monta. NO es equivalente: las capturas de clásico frente a TSL son de MU6. Construye sus
// nodos (lo prueba Vitest con three/webgpu y three/tsl de verdad); NO se ha compilado ni dibujado.
// nodosTiempo son los mismos nodos para el parche del tiempo y para quien completa su luz con ellos (el terreno, la copa y el tronco del catálogo y los olivos
// generados): la sombra de las nubes (ot_sombra, el mismo ruido de valor), su paso por el vértice (el vSomb del clásico, varying), la escarcha y el viento.
// Los uniformes son los MISMOS objetos { value } que mueve el paso del tiempo: cada nodo relee su valor en cada objeto (onObjectUpdate).
export function nodosTiempo(T: A, uSombra: UniformesSombra, uViento?: UniformesViento | null) {
  var num = function (x: { value: A }): A { return T.uniform(x.value).onObjectUpdate(function () { return x.value; }); };
  var uDrift = num(uSombra.uDrift), uCov = num(uSombra.uCov), uSomb = num(uSombra.uSomb), uHielo = num(uSombra.uHielo);
  // ot_h y ot_vn del GLSL_SOMBRA
  var h = function (p: A): A { return T.fract(T.sin(T.dot(p, T.vec2(127.1, 311.7))).mul(43758.5453)); };
  var vn = function (p: A): A {
    var i = T.floor(p), f0 = T.fract(p), f = f0.mul(f0).mul(T.float(3).sub(f0.mul(2)));
    return T.mix(T.mix(h(i), h(i.add(T.vec2(1, 0))), f.x), T.mix(h(i.add(T.vec2(0, 1))), h(i.add(T.vec2(1, 1))), f.x), f.y);
  };
  /** ot_sombra(xz): 1 sin nubes encima; menos bajo una nube (con uSomb), nada si no hay nubes (step(0,01, uCov)) */
  function sombra(xz: A): A {
    var q = xz.mul(0.0042).sub(uDrift), n = vn(q).mul(0.6).add(vn(q.mul(2.3).add(7)).mul(0.4)), t = T.mix(T.float(0.85), T.float(0.22), uCov);
    return T.float(1).sub(T.smoothstep(t.sub(0.07), t.add(0.07), n).mul(uSomb).mul(T.step(0.01, uCov)));
  }
  /** por vértice, como el vSomb del clásico */
  function enVertice(n: A): A { return T.varying(n); }
  /** gl_FragColor.rgb *= vSomb; y la escarcha: mix(…, vec3(0,88, 0,94, 1), uHielo · 0,6) */
  function aplica(rgb: A, s: A): A { return T.mix(rgb.mul(s), T.vec3(0.88, 0.94, 1.0), uHielo.mul(0.6)); }
  /** lo de arriba tras la luz y la niebla (el output del NodeMaterial), como el clásico tras dithering_fragment; xz, la posición en que se mira la nube */
  function salida(xz: A): A { return T.vec4(aplica(T.output.rgb, enVertice(sombra(xz))), T.output.a); }
  /** el vaivén del follaje: la posición del vértice movida por el viento (positionNode), con la fase de su posición de partida */
  function viento(p: A): A {
    if (!uViento) return p;
    var uT = num(uViento.uT), uAmp = num(uViento.uAmp), uDir = num(uViento.uDir);
    var ph = p.x.mul(0.21).add(p.z.mul(0.17)), rf = T.sin(uT.mul(1.9).add(ph)).add(T.sin(uT.mul(3.1).add(ph.mul(1.7))).mul(0.6));
    var dxz = uDir.mul(uAmp.mul(rf.mul(0.45).add(0.55)));
    return T.vec3(p.x.add(dxz.x), p.y.add(uAmp.mul(0.12).mul(T.sin(uT.mul(2.3).add(ph.mul(2))))), p.z.add(dxz.y));
  }
  return { sombra: sombra, enVertice: enVertice, aplica: aplica, salida: salida, viento: viento, uniformes: { uDrift: uDrift, uCov: uCov, uSomb: uSomb, uHielo: uHielo } };
}
export type NodosTiempo = ReturnType<typeof nodosTiempo>;
/** A4-0: lo de colorVertSRGB (03_escena) y lo del parche de luz de los olivos generados en TSL: el color por vértice, por instancia y por lote está escrito en
 *  sRGB y pasa a lineal. base: el color del material (vec4: materialColor, con su mapa). porVertice: si el clásico lleva vertexColors (quien lo use pone el
 *  vertexColors del NodeMaterial a false: aquí se multiplica ya convertido). El NodeMaterial multiplica DESPUÉS de colorNode, por su cuenta, el color por
 *  instancia (instanceColor) y el del lote (batchColor) sin convertir: aquí se multiplica antes por lineal(c) / c, y el producto queda base · lineal(c) (con
 *  c = 0, 0, como el clásico). Se decide al construir, por objeto (Fn con el builder): sin color por instancia o por lote, nada. */
export function colorSrgbTsl(T: A, base: A, porVertice: boolean): A {
  var compensa = function (c: A): A { return T.sRGBTransferEOTF(c).div(T.max(c, T.vec3(1e-6))); };
  return T.Fn(function (_e: A, b: A) {
    var col = T.vec4(base), o = b && b.object, g = b && b.geometry;
    if (porVertice && g && g.hasAttribute && g.hasAttribute("color")) col = T.vec4(col.rgb.mul(T.sRGBTransferEOTF(T.vertexColor().rgb)), col.a);
    if (o && o.instanceColor) col = T.vec4(col.rgb.mul(compensa(T.instanceColor)), col.a);
    if (o && o.isBatchedMesh && o._colorsTexture) col = T.vec4(col.rgb.mul(compensa(T.batchColor.rgb)), col.a);
    return col;
  })();
}
/** A4-0: un color que el clásico NO multiplica por el color por instancia ni por el del lote (p. ej. el liquen de las piedras, que se mezcla tras el color): el
 *  NodeMaterial lo multiplicará después, así que aquí se divide antes por él (con c = 0 queda 0, como cualquier color que three multiplique por 0). */
export function sinColorPorInstancia(T: A, rgb: A): A {
  return T.Fn(function (_e: A, b: A) {
    var o = b && b.object, c = T.vec3(rgb);
    if (o && o.instanceColor) c = c.div(T.max(T.instanceColor, T.vec3(1e-6)));
    if (o && o.isBatchedMesh && o._colorsTexture) c = c.div(T.max(T.batchColor.rgb, T.vec3(1e-6)));
    return c;
  })();
}
// lo que no se copia del material clásico al NodeMaterial (lo demás, como hace three al convertir: NodeLibrary.fromMaterial)
var NO_COPIA: Record<string, 1> = { uuid: 1, id: 1, type: 1, onBeforeCompile: 1, customProgramCacheKey: 1, _listeners: 1, version: 1 };
/** el clásico de siempre: el MISMO material, con el parche puesto por conTiempo (la misma función de siempre: three usa su texto como clave del programa).
 *  La TSL: un NodeMaterial de la misma clase (Points, Lambert o Basic) con las propiedades del clásico y el MISMO objeto de color (el tinte del día), el color
 *  por vértice pasado de sRGB a lineal (lo de colorVertSRGB), el vaivén del viento en el follaje y, en lo que no es de puntos, la sombra de las nubes y la escarcha
 *  tras la luz. Los PointsMaterial no las llevan en el clásico (el sombreador de puntos de three no tiene <dithering_fragment>): en la TSL, tampoco */
export function defParcheTiempo(conTiempo: (m: A, viento: boolean) => void, u?: { uSombra: UniformesSombra; uViento: UniformesViento } | null): DefMaterial<OpcParcheTiempo> {
  return {
    clasico: function (o) { conTiempo(o.material, o.viento); return o.material; },
    tsl: function (o, c) {
      var src = o.material, W = c.THREE as A, T = c.TSL as A;
      var C = W[String(src.type || "").replace(/Material$/, "NodeMaterial")] || W["MeshBasicNodeMaterial"], m = new C();
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k) && !NO_COPIA[k] && !/^is[A-Z]/.test(k)) m[k] = src[k];
      m.color = src.color;   // el MISMO objeto: el paso del tiempo lo tiñe en su sitio
      if (!u) return m;
      var N = nodosTiempo(T, u.uSombra, o.viento ? u.uViento : null), base = T.vec4(T.materialColor);
      // A4-0: el color por vértice y, ahora también, el de instancia (colorVertSRGB atiende a los dos), de sRGB a lineal
      m.vertexColors = false; m.colorNode = colorSrgbTsl(T, base, !!src.vertexColors);
      // en unos puntos, el centro del punto (A4-0: también en su espejo de sprites, puntos-tsl.ts); el viento lo mueve
      var pos = src.isPointsMaterial ? centroPunto(T) : T.positionGeometry;
      if (o.viento) m.positionNode = N.viento(pos); else if (src.isPointsMaterial) m.positionNode = pos;
      if (!src.isPointsMaterial) m.outputNode = N.salida(T.positionGeometry.xz);   // el clásico: ot_sombra(position.xz), la posición local
      return m;
    }
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
  if (M) M.define(MATERIAL_PARCHE_TIEMPO, defParcheTiempo(conTiempo, { uSombra: uSombra, uViento: uViento }));
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
  /** los nodos del tiempo con estos uniformes, para la TSL de quien completa su luz con ellos (el terreno, el catálogo, los olivos generados); T = three/tsl */
  function nodosTsl(T: A): NodosTiempo { return nodosTiempo(T, uSombra, uViento); }
  return { uViento: uViento, uSombra: uSombra, GLSL_SOMBRA: GLSL_SOMBRA, conTiempo: conTiempo, parcheTiempo: parcheTiempo, aplica: aplica, suelta: suelta, nodosTsl: nodosTsl };
}
export type ParcheTiempo = ReturnType<typeof creaParcheTiempo>;

// Los puntos con el WebGPURenderer (A4-0, puntos-tsl.ts): el espejo de sprites instanciados y las TSL de la nube LiDAR, el polvo y las flores y aceitunas, que
// compilan (WGSL y GLSL, sin GPU, prueba-tsl.ts) sobre un Points y sobre su espejo. HONESTIDAD: aquí no se dibuja; el tamaño en pantalla y el coste son del banco (MU6).
import { beforeAll, describe, expect, it } from "vitest";
import { cargaNodos, compila } from "../../nucleo/prueba-tsl.ts";
import type { NodosPrueba } from "../../nucleo/prueba-tsl.ts";
import { CAPA_OCULTA, POS_PUNTO, espejoSprites } from "./puntos-tsl.ts";
import { DEF_NUBE } from "./nube.ts";
import { defPolvo } from "./huellas-polvo.ts";
import { DEF_FRUTO_FLOR } from "./estacion.ts";
import { creaParcheTiempo, defParcheTiempo } from "./tiempo-parche.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
let n: NodosPrueba;
beforeAll(async () => { n = await cargaNodos(); });
const ctx = () => ({ THREE: n.W, TSL: n.T, nombre: "prueba" });

/** unos puntos como los del motor: posición (la nube, en Int16 normalizado), color y los atributos de cada uno */
function puntos(W: A, mat: A, extra: Record<string, number>, int16 = false): A {
  const g = new W.BufferGeometry(), k = 5;
  g.setAttribute("position", int16 ? new W.BufferAttribute(new Int16Array(k * 3), 3, true) : new W.BufferAttribute(new Float32Array(k * 3), 3));
  g.setAttribute("color", new W.BufferAttribute(new Uint8Array(k * 3), 3, true));
  for (const [nom, tam] of Object.entries(extra)) g.setAttribute(nom, new W.BufferAttribute(new Float32Array(k * tam), tam));
  return new W.Points(g, mat);
}

describe("el espejo de sprites instanciados (espejoSprites)", () => {
  it("esconde el Points en su capa, cuelga un Sprite con los MISMOS arrays por instancia, sigue su drawRange y la versión de cada atributo, y se suelta con la geometría", () => {
    const W = n.W, mat = DEF_NUBE.tsl!({ size: 0.6, color: new W.Color(), parche: () => {} }, ctx()), p = puntos(W, mat, {}, true);
    const s = espejoSprites(W, p);
    expect(p.layers.isEnabled(0)).toBe(false); expect(p.layers.isEnabled(CAPA_OCULTA)).toBe(true); expect(p.children).toContain(s);
    expect(s.isSprite).toBe(true); expect(s.geometry.isInstancedBufferGeometry).toBe(true);
    expect(s.geometry.attributes[POS_PUNTO].array).toBe(p.geometry.attributes.position.array);   // el mismo array, sin copia en la CPU
    expect(s.geometry.attributes[POS_PUNTO].normalized).toBe(true); expect(s.geometry.attributes.color.isInstancedBufferAttribute).toBe(true);
    p.geometry.setDrawRange(0, 3); p.geometry.attributes.color.needsUpdate = true; s.onBeforeRender();
    expect(s.geometry.instanceCount).toBe(3); expect(s.geometry.attributes.color.version).toBe(p.geometry.attributes.color.version);
    p.geometry.setDrawRange(0, Infinity); s.onBeforeRender(); expect(s.geometry.instanceCount).toBe(5);
    let suelta = 0; s.geometry.addEventListener("dispose", () => { suelta++; });
    p.geometry.dispose(); expect(suelta).toBe(1); expect(p.children).not.toContain(s);
  });
});

describe("A4-0: las TSL de los puntos compilan sobre un Points y sobre su espejo de sprites", () => {
  it("nube-lidar: el color por vértice a lineal, el tamaño de su nivel y el centro del punto (puntoPos en el espejo)", () => {
    const W = n.W, mat = DEF_NUBE.tsl!({ size: 0.6, color: new W.Color(), parche: () => {} }, ctx()) as A;
    expect(mat.vertexColors).toBe(false); expect(mat.sizeAttenuation).toBe(true); expect(mat.size).toBe(0.6);
    const p = puntos(W, mat, {}, true);
    const cp = compila(n, mat, { hecho: p }); expect(cp.wgsl.fragmento).toMatch(/sRGBTransferEOTF/);
    const s = espejoSprites(W, puntos(W, mat, {}, true));
    const cs = compila(n, mat, { hecho: s }); expect(cs.wgsl.vertice).toMatch(new RegExp(POS_PUNTO));
  });
  it("polvo: sin la atenuación de three (la suya va en la cuenta), en píxeles de la pantalla (÷ screenDPR) y el disco con la uv del punto", () => {
    const W = n.W, u = { uNow: { value: 0 }, uColor: { value: new W.Color(0xb89e74) }, uLuz: { value: 1 } };
    const mat = defPolvo().tsl!({ uniforms: u }, ctx()) as A;
    expect(mat.sizeAttenuation).toBe(false); expect(mat.sizeNode).toBeTruthy(); expect(mat.positionNode).toBeTruthy();
    compila(n, mat, { hecho: puntos(W, mat, { aBorn: 1, aVida: 1, aTam: 1 }) });
    const s = espejoSprites(W, puntos(W, mat, { aBorn: 1, aVida: 1, aTam: 1 }));
    const cs = compila(n, mat, { hecho: s }); expect(cs.wgsl.vertice).toMatch(new RegExp(POS_PUNTO));
  });
  it("fruto-flor: el BBCH de cada punto, su tamaño, el adelanto de 1 m hacia la cámara y el disco", () => {
    const W = n.W, u = { uBBCH: { value: 75 }, uEsc: { value: 1000 }, uLuz: { value: new W.Color(1, 1, 1) } };
    const mat = DEF_FRUTO_FLOR.tsl!({ uniforms: u }, ctx()) as A;
    const cp = compila(n, mat, { hecho: puntos(W, mat, { aR: 1, aS: 1 }) }); expect(cp.wgsl.fragmento).toMatch(/discard/);
    const s = espejoSprites(W, puntos(W, mat, { aR: 1, aS: 1 }));
    const cs = compila(n, mat, { hecho: s }); expect(cs.wgsl.vertice).toMatch(/\+ vec3<f32>\( 0\.0, 0\.0, 1\.0 \)/);   // mv.z += 1.0
  });
  it("parche-tiempo en las hojas en puntos (matHojaG/P, con viento): el viento mueve el centro del punto, también en el espejo", () => {
    const W = n.W, P = creaParcheTiempo({ THREE: W, colorVertSRGB: () => {} });
    const hojas = new W.PointsMaterial({ size: 0.2, vertexColors: true });
    const mat = defParcheTiempo(P.conTiempo, { uSombra: P.uSombra, uViento: P.uViento }).tsl!({ material: hojas, viento: true }, ctx()) as A;
    expect(mat.isPointsNodeMaterial).toBe(true); expect(mat.positionNode).toBeTruthy(); expect(mat.outputNode).toBeFalsy();   // sin sombra ni escarcha en puntos, como el clásico
    compila(n, mat, { hecho: puntos(W, mat, {}) });
    const cs = compila(n, mat, { hecho: espejoSprites(W, puntos(W, mat, {})) }); expect(cs.wgsl.vertice).toMatch(new RegExp(POS_PUNTO));
  });
});

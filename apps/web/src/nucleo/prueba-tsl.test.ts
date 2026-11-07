// La prueba del compilador de nodos sin GPU (prueba-tsl.ts, A4-0): que compila lo que debe y que caza lo que debe cazar.
import { beforeAll, describe, expect, it } from "vitest";
import { cargaNodos, compila } from "./prueba-tsl.ts";
import type { NodosPrueba } from "./prueba-tsl.ts";
import { creaMateriales, DEF_EJEMPLO, EJEMPLO_TSL, MaterialesPuro } from "./materiales.ts";
import type { ThreeMin } from "./materiales.ts";

let n: NodosPrueba;
beforeAll(async () => { n = await cargaNodos(); });

describe("compila(): el grafo de nodos se construye con WGSLNodeBuilder y GLSLNodeBuilder, sin GPU", () => {
  it("la variante de ejemplo compila en los dos lenguajes, con su uniforme", () => {
    const M = creaMateriales({ THREE: n.W as unknown as ThreeMin, render: { tipo: "nuevo" }, nodos: () => ({ THREE: n.W, TSL: n.T }) });
    const c = compila(n, M.crea(EJEMPLO_TSL, { color: 0x336699, brillo: { value: 2 } }));
    expect(c.wgsl.fragmento).toMatch(/fn main/); expect(c.glsl.fragmento).toMatch(/void main/);
    expect(typeof DEF_EJEMPLO.tsl).toBe("function");
  });
  it("un Lambert con niebla, puntos, líneas e instancias compilan", () => {
    const { W, T } = n;
    const l = new W.MeshLambertNodeMaterial(); l.colorNode = T.color(0xff0000); l.fog = true;
    expect(compila(n, l).wgsl.fragmento).toMatch(/fog|Fog|mix/);
    const p = new W.PointsNodeMaterial(); p.colorNode = T.vec4(1, 0, 0, 1);
    compila(n, p, { objeto: "puntos" });
    const s = new W.LineBasicNodeMaterial(); compila(n, s, { objeto: "lineas" });
    const i = new W.MeshLambertNodeMaterial(); i.colorNode = T.vec3(T.attribute("aX", "float")); compila(n, i, { objeto: "instanciada", atributos: { aX: [1, true] } });
  });
  it("una textura relee su uniforme con releeTextura (también dentro de un Fn con If y con depth y grad); con onObjectUpdate, three r186 lo pierde", () => {
    const { W, T } = n;
    const h = new W.DataArrayTexture(new Uint8Array(4), 1, 1, 1), lam = new W.DataArrayTexture(new Uint8Array(8), 1, 1, 2);
    const h2 = new W.DataTexture(new Uint8Array(4), 1, 1), r2 = new W.DataTexture(new Uint8Array(4), 1, 1);
    const h3 = new W.DataTexture(new Uint8Array(4), 1, 1), r3 = new W.DataTexture(new Uint8Array(4), 1, 1);
    const dentro = MaterialesPuro.releeTextura(T.texture(h, T.uv()).depth(T.float(1)).grad(T.vec2(0.1, 0), T.vec2(0, 0.1)), () => lam);
    const fuera = MaterialesPuro.releeTextura(T.texture(h2, T.uv()), () => r2);
    const perdida = T.texture(h3, T.uv().mul(2)); perdida.onObjectUpdate(() => r3);   // así NO: TextureNode.setup() le quita el update
    const m = new W.MeshBasicNodeMaterial();
    m.colorNode = T.Fn(() => { const v = T.vec4(fuera).add(perdida).toVar(); T.If(v.x.greaterThan(0.1), () => { v.assign(dentro); }); return v; })();
    const c = compila(n, m, { solo: "wgsl" }); c.actualiza();   // con el backend WebGPU
    const t = c.texturas();
    expect(t).toContain(r2); expect(t).toContain(lam);
    expect(t).toContain(h3); expect(t).not.toContain(r3);   // el hallazgo de A4-0 (MATERIALES §1.5): si cambia con three, esta línea avisa
    // con el backend WebGL (GLSL) el onObjectUpdate «vale» por casualidad: three pone el update de la textura (flipY) y el nuestro lo sustituye, así que el
    // de three se pierde. Tampoco sirve: con releeTextura no se toca su update
    const m2 = new W.MeshBasicNodeMaterial(), h4 = new W.DataTexture(new Uint8Array(4), 1, 1), r4 = new W.DataTexture(new Uint8Array(4), 1, 1);
    const p4 = T.texture(h4, T.uv()); p4.onObjectUpdate(() => r4); m2.colorNode = p4;
    const c2 = compila(n, m2, { solo: "glsl" }); c2.actualiza(); expect(p4.value).toBe(r4);
    const m3 = new W.MeshBasicNodeMaterial(), h5 = new W.DataTexture(new Uint8Array(4), 1, 1), r5 = new W.DataTexture(new Uint8Array(4), 1, 1);
    const p5 = T.texture(h5, T.uv()); p5.onObjectUpdate(() => r5); m3.colorNode = p5;
    const c3 = compila(n, m3, { solo: "wgsl" }); c3.actualiza(); expect(p5.value).toBe(h5);
  });
  it("caza un grafo roto: un Fn que lanza al evaluarse no compila", () => {
    const { W, T } = n;
    const m = new W.MeshBasicNodeMaterial();
    m.colorNode = T.Fn(() => { throw new Error("roto a propósito"); })();
    expect(() => compila(n, m)).toThrow(/roto a propósito/);
  });
});

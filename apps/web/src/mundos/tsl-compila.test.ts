// A4-0: las variantes TSL que ya estaban hechas (MU5-n) y que no tienen su prueba de compilación en su módulo, compiladas sin GPU con los dos constructores de
// three (WGSLNodeBuilder y GLSLNodeBuilder: nucleo/prueba-tsl.ts), sobre el objeto que las dibuja en el motor. Caza lo que solo sale al compilar y los smoothstep al
// revés que WGSL rechaza. HONESTIDAD: no valida el sombreador con un compilador de verdad ni dibuja: las capturas son de MU6, en el banco.
import { beforeAll, describe, expect, it } from "vitest";
import { cargaNodos, compila } from "../nucleo/prueba-tsl.ts";
import type { NodosPrueba } from "../nucleo/prueba-tsl.ts";
import { defVineta } from "./comun/vr.ts";
import { defNombres } from "./comun/presencia.ts";
import { defVrmFundido } from "./comun/avatares.ts";
import { defLambertVertice } from "./exterior/arboles-l0.ts";
import { DEF_BALIZA } from "./exterior/balizas.ts";
import { DEF_ARROYO } from "./exterior/paisaje.ts";
import { DEF_BARRERA } from "./exterior/tiempo-barrera.ts";
import { DEF_NUBES } from "./exterior/tiempo-cielo.ts";
import { DEF_LLUVIA } from "./exterior/tiempo-lluvia.ts";
import { defEstela } from "./exterior/vida.ts";
import { defHuella } from "./exterior/huellas-polvo.ts";
import { DEF_SUELO_FONDO } from "./exterior/suelo-fondo.ts";
import { creaParcheTiempo, defParcheTiempo } from "./exterior/tiempo-parche.ts";
import { DEF_RESALTE } from "./exterior/historia.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
let n: NodosPrueba;
beforeAll(async () => { n = await cargaNodos(); });
const ctx = () => ({ THREE: n.W, TSL: n.T, nombre: "prueba" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const v = (x: any): { value: any } => ({ value: x });
/** una geometría con sus atributos de vértice (k vértices) y, si se pide, de instancia */
function geo(W: A, porVertice: Record<string, number>, porInstancia: Record<string, number> = {}): A {
  const g = new W.PlaneGeometry(1, 1), k = g.attributes.position.count;
  for (const [nom, t] of Object.entries(porVertice)) g.setAttribute(nom, new W.BufferAttribute(new Float32Array(k * t), t));
  for (const [nom, t] of Object.entries(porInstancia)) g.setAttribute(nom, new W.InstancedBufferAttribute(new Float32Array(4 * t), t));
  return g;
}

describe("A4-0: las TSL ya hechas compilan (WGSL y GLSL, sin GPU)", () => {
  it("vineta-vr (de todo mundo)", () => {
    const m = defVineta().tsl!({ uniforms: { uK: v(0.5), uA: v(0.4) } }, ctx());
    compila(n, m);
  });
  it("nombres-presencia, de cara a la cámara (vertexNode con la matriz de instancia)", () => {
    const W = n.W, m = defNombres().tsl({ uniforms: { uMapa: v(new W.Texture()), uRej: v(new W.Vector2(8, 8)) } }, ctx()) as A;
    expect(m.vertexNode).toBeTruthy();
    const c = compila(n, m, { hecho: new W.InstancedMesh(geo(W, {}, { aCelda: 1 }), m, 4) });
    expect((c.wgsl.vertice.match(/nodeAttribute\d+ : vec4<f32>/g) || []).length).toBe(2);   // las columnas 0 (la escala) y 3 (el centro)
  });
  it("vrm-fundido (el tramado; sin el sombreado toon de MToon, MATERIALES §13.1)", () => {
    const W = n.W, src = new W.MeshStandardMaterial({ color: 0xffffff }); src.userData.vrmFundidoUni = v(0.5);
    compila(n, defVrmFundido().tsl(src, ctx()));
  });
  it("copa-l0 y tronco-l0 (color por vértice en sRGB)", () => {
    const W = n.W;
    for (const dos of [true, false]) { const m = defLambertVertice(() => {}, dos).tsl!(undefined, ctx()); compila(n, m, { geometria: geo(W, { color: 3 }) }); }
  });
  it("baliza, arroyo, barrera y estela", () => {
    const W = n.W;
    compila(n, DEF_BALIZA.tsl!({ uniforms: { uT: v(0), uColor: v(new W.Color()), uPulso: v(0) }, transparent: true, depthWrite: false, side: W.DoubleSide, blending: W.AdditiveBlending, fog: false }, ctx()));
    compila(n, DEF_ARROYO.tsl!({ uniforms: { uT: v(0), uAgua: v(0), uLuz: v(1), uArena: v(new W.Color()) }, transparent: true, depthWrite: false, side: W.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, ctx()), { geometria: geo(W, { aU: 1, aV: 1 }) });
    compila(n, DEF_BARRERA.tsl!({ uniforms: { uT: v(0), uColor: v(new W.Color()), uAlpha: v(0.5) } }, ctx()), { geometria: geo(W, { aV: 1, aD: 1 }) });
    compila(n, defEstela().tsl!({ uniforms: { uNow: v(0), uVida: v(4), uAlpha: v(1), uColor: v(new W.Color()) } }, ctx()), { geometria: geo(W, { aB: 1, aV: 1 }) });
  });
  it("nubes (de cara a la cámara, con el ocaso) y lluvia (líneas)", () => {
    const W = n.W, un = { diffuse: v(new W.Color()), map: v(new W.Texture()), uNubLuz: v(new W.Color()), uNubSom: v(new W.Color()), uOcaso: v(0) };
    for (const ocaso of [true, false]) compila(n, DEF_NUBES.tsl!({ uniforms: un, ocaso }, ctx()), { geometria: geo(W, { esquina: 2, tam: 2, alfa: 1 }) });
    compila(n, DEF_LLUVIA.tsl!({ uniforms: { uT: v(0), uInt: v(1), uViento: v(new W.Vector2()), uColor: v(new W.Color()) } }, ctx()), { objeto: "lineas", geometria: geo(W, { aEnd: 1 }) });
  });
  it("resalte-parcela (A3-7b1: la y local por uExag)", () => {
    compila(n, DEF_RESALTE.tsl!({ uExag: v(1.5) }, ctx()));
  });
  it("huella (instanciada) y suelo-fondo", () => {
    const W = n.W, h = defHuella().tsl!({ uniforms: { uNow: v(0), uColor: v(new W.Color()) } }, ctx());
    compila(n, h, { hecho: new W.InstancedMesh(geo(W, {}, { aBorn: 1, aVida: 1, aTipo: 1 }), h, 4) });
    compila(n, DEF_SUELO_FONDO.tsl!({ map: new W.Texture(), color: new W.Color() }, ctx()));
  });
  it("parche-tiempo en un Lambert con color por vértice y viento (la corteza) y en un Basic con mapa (la ortofoto)", () => {
    const W = n.W, P = creaParcheTiempo({ THREE: W, colorVertSRGB: () => {} }), def = defParcheTiempo(P.conTiempo, { uSombra: P.uSombra, uViento: P.uViento });
    const corteza = def.tsl!({ material: new W.MeshLambertMaterial({ vertexColors: true }), viento: true }, ctx()) as A;
    compila(n, corteza, { geometria: geo(W, { color: 3 }) });
    compila(n, def.tsl!({ material: new W.MeshBasicMaterial({ map: new W.Texture() }), viento: false }, ctx()));
  });
});

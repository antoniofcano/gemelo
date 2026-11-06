// La hierba y las piedras del exterior (A3-4, MU5-n; antes 21_suelo.js). Con el three de verdad (sin GPU), la fábrica de materiales de verdad, un DOM y un lienzo
// de mentira y un NDVI sintético. Se comprueba: el campo del suelo y la cubierta (lo puro), el reparto de matas y piedras, sus parches de siempre y, sobre todo, el
// ciclo de vida: libera() suelta las mallas, geometrías, materiales y texturas que creó y quita su escucha (L2-05). HONESTIDAD: nada se dibuja.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { creaHierba, manifiestoHierba } from "./hierba.ts";
import { creaParcheTiempo } from "./tiempo-parche.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const THREE: A = await import(/* @vite-ignore */ "three" as string);
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

/** un THREE que cuenta las geometrías y las texturas vivas (la prueba de memoria sin GPU) */
function contado() {
  const vivas = { geo: 0, tex: 0 };
  const cuenta = (o: A, k: "geo" | "tex") => { vivas[k]++; let ya = false; o.addEventListener("dispose", () => { if (!ya) { ya = true; vivas[k]--; } }); };
  class Geo extends THREE.BufferGeometry { constructor() { super(); cuenta(this, "geo"); } }
  class Ico extends THREE.IcosahedronGeometry { constructor(...a: A[]) { super(...a); cuenta(this, "geo"); } }
  class Plano extends THREE.PlaneGeometry { constructor(...a: A[]) { super(...a); cuenta(this, "geo"); } }
  class Lienzo extends THREE.CanvasTexture { constructor(...a: A[]) { super(...a); cuenta(this, "tex"); } }
  class Datos extends THREE.DataTexture { constructor(...a: A[]) { super(...a); cuenta(this, "tex"); } }
  return { T: Object.assign({}, THREE, { BufferGeometry: Geo, IcosahedronGeometry: Ico, PlaneGeometry: Plano, CanvasTexture: Lienzo, DataTexture: Datos }), vivas };
}
const nada = new Proxy(function () {}, { get: (_t, k) => (k === "then" ? undefined : nada), apply: () => nada, set: () => true }) as A;
const lienzo = () => ({ width: 0, height: 0, getContext: () => nada });
function elemento() {
  const oy: Record<string, A[]> = {};
  return { oy, textContent: "", hidden: false, checked: true, addEventListener(ev: string, fn: A) { (oy[ev] = oy[ev] || []).push(fn); }, removeEventListener(ev: string, fn: A) { oy[ev] = (oy[ev] || []).filter(f => f !== fn); }, n() { return Object.values(oy).reduce((a, l) => a + l.length, 0); } };
}
function monta(T: A = THREE) {
  const els: Record<string, A> = { ndviSel: elemento(), cHierba: elemento(), hFecha: elemento(), fechaCampo: elemento() };
  const F = creaMateriales({ THREE: T as unknown as ThreeMin, busqueda: "" }), P = creaParcheTiempo({ THREE: T, colorVertSRGB: () => {} });
  const NDV = { w: 4, h: 4, fechas: ["2026-04-10", "2026-07-01"], datos: new Int16Array(32).map((_v, i) => (i % 5 === 0 ? -32000 : 520 + 10 * (i % 7))) };
  const scene = new T.Scene(), pp = { x: 0, y: 0 }, UN = { uG: { value: null }, uHierba: { value: 1 } };
  const H = creaHierba({
    THREE: T, D: { suelo_ndvi: { f: "", a: [0.3, 0.4], b: [0.2, 0.25] }, ext: [-200, 200, 200, -200] }, i16: () => new Int16Array(16).fill(300), x0: -200, yN: 200, ANCHO: 400, ALTO: 400,
    VRP: { on: false, hierba: 32 }, $: (id: string) => els[id] || null, suelo: () => 3, scene, Estado: { exag: 1 }, texColor: (t: A) => t, colorVertSRGB: () => {},
    Materiales: F, Estaticos: { congela() {} }, hash, UN, objetivo: new T.Vector3(), orb: { dist: 100 }, NDV, ndviIdx: () => 0,
    paseando: () => true, pp, uViento: P.uViento, uSombra: P.uSombra, GLSL_SOMBRA: P.GLSL_SOMBRA, num1: (v: number) => String(v),
    enDron: () => false, dr: () => null, ejeArroyo: () => [], distArroyo: () => 99, lienzo
  });
  return { H, els, scene, UN, F, P };
}

describe("la hierba y las piedras del exterior", () => {
  it("el campo del suelo de la fecha (con la media de las vecinas donde falta) y la cubierta en un punto, entre 0 y 1", () => {
    const { H, UN } = monta();
    H.recoloreaSuelo(); expect(UN.uG.value).toBeTruthy(); expect(UN.uHierba.value).toBe(1);
    const c = H.cubierta(10, -20); expect(c.length).toBe(2); c.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); });
    expect(Array.from(H.campo()).every(v => isFinite(v))).toBe(true);
    expect(H.vn2(1.5, 2.5)).toBeGreaterThanOrEqual(0);
    H.libera();
  });
  it("reparte matas y piedras alrededor de quien pasea y las cuelga de la escena (los contactos, no: ya no se colgaban); los parches de siempre", () => {
    const { H, scene } = monta();
    H.actualizaSuelo(0.3);
    const { iMata, iPiedra, iCont } = H.mallas();
    expect(scene.children).toContain(iMata); expect(scene.children).toContain(iPiedra); expect(scene.children).not.toContain(iCont);
    expect(iMata.count).toBeGreaterThan(0); expect(iCont.count).toBe(iPiedra.count);
    const sh = { uniforms: {} as A, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    iMata.material.onBeforeCompile(sh); expect(sh.vertexShader).toContain("vMapUv = vec2((vMapUv.x + aTile) * 0.25, vMapUv.y);"); expect(sh.fragmentShader).toContain("uHielo * 0.6");
    const sp = { uniforms: {} as A, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    iPiedra.material.onBeforeCompile(sp); expect(sp.fragmentShader).toContain("float sh3(vec3 p)"); expect(sp.fragmentShader).not.toContain("uHielo");
    H.libera();
  });
  it("memoria (L2-05): montar, repartir y liberar deja las geometrías y las texturas vivas como estaban; saca las mallas de la escena y quita la escucha de la fecha", () => {
    const { T, vivas } = contado(), antes = { ...vivas };
    const { H, scene, els, UN } = monta(T);
    H.recoloreaSuelo(); H.actualizaSuelo(0.3);
    expect(vivas.geo - antes.geo).toBe(3);   // la mata, la piedra y el contacto
    expect(vivas.tex - antes.tex).toBe(3);   // el atlas de la hierba, el contacto y el NDVI del suelo
    expect(els.ndviSel.n()).toBe(1);
    const mats = [H.mallas().iMata.material, H.mallas().iPiedra.material, H.mallas().iCont.material]; let sueltos = 0; mats.forEach((m: A) => m.addEventListener("dispose", () => { sueltos++; }));
    expect(H.libera()).toBeGreaterThan(0);
    expect(vivas).toEqual(antes); expect(sueltos).toBe(3); expect(scene.children.length).toBe(0); expect(els.ndviSel.n()).toBe(0); expect(UN.uG.value).toBe(null);
    expect(H.libera()).toBe(0);   // dos veces no libera dos veces
    H.actualizaSuelo(0.3); expect(scene.children.length).toBe(0);   // y ya no hace nada
  });
  it("MU5-n (2.º commit): sus materiales salen de la fábrica con su nombre y su dueño; las matas, con su recorte alfa; libera() las saca de los recortes", () => {
    const { H, F } = monta();
    expect(F.inventario()).toMatchObject({ matas: { tipo: "define", n: 1 }, piedras: { tipo: "define", n: 1 } });
    expect(F.duenos()).toEqual({ "hierba-suelo": 3 }); expect(F.a2c.n).toBe(1); expect(F.ruta("matas")).toBe("clasico");
    const { iMata, iPiedra } = H.mallas();
    expect(iMata.material.isMeshLambertMaterial && iMata.material.alphaTest === 0.42 && iMata.material.side === THREE.DoubleSide).toBe(true);
    expect(iMata.material.customProgramCacheKey()).toBe(iMata.material.onBeforeCompile.toString()); expect(iPiedra.material.color.getHex()).toBe(0xffffff);
    H.libera(); expect(F.duenos()).toEqual({}); expect(F.a2c.n).toBe(0);
  });
  it("las variantes TSL (apagadas y PARCIALES): solo con el renderizador nuevo; con three/webgpu y three/tsl de verdad, MeshLambertNodeMaterial con sus nodos", async () => {
    const W: A = await import(/* @vite-ignore */ "three/webgpu" as string), TSL: A = await import(/* @vite-ignore */ "three/tsl" as string);
    const { DEF_MATAS, DEF_PIEDRAS } = await import("./hierba.ts");
    const hoy = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: { tipo: "clasico", pedido: "" }, nodos: () => ({ THREE: W, TSL }) });
    hoy.define("matas", DEF_MATAS); expect(hoy.ruta("matas")).toBe("clasico");
    const F = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: { tipo: "nuevo", pedido: "nuevo" }, nodos: () => ({ THREE: W, TSL }) });
    F.define("matas", DEF_MATAS); F.define("piedras", DEF_PIEDRAS);
    expect(F.ruta("matas")).toBe("tsl"); expect(F.cobertura()["piedras"]).toMatchObject({ clasico: true, tsl: true });
    const P = creaParcheTiempo({ THREE, colorVertSRGB: () => {} }), u = { uSombra: P.uSombra, uViento: P.uViento }, map = new THREE.Texture();
    const ma: A = F.crea("matas", { map, parche: () => {}, u }), pi: A = F.crea("piedras", { parche: () => {}, u });
    expect(ma.isMeshLambertNodeMaterial && ma.alphaTest === 0.42 && ma.side === THREE.DoubleSide && ma.map === map).toBe(true);
    expect(ma.colorNode && ma.maskNode && ma.positionNode && ma.outputNode).toBeTruthy();
    expect(pi.isMeshLambertNodeMaterial).toBe(true); expect(pi.colorNode && pi.outputNode).toBeTruthy(); expect(pi.positionNode).toBeFalsy();
    const sin: A = F.crea("matas", { map, parche: () => {} }); expect(sin.outputNode).toBeFalsy();   // sin los uniformes del tiempo, sin nubes ni viento
  });
  it("el manifiesto vale, es de los mundos [exterior], monta el mismo objeto y su libera lo suelta", () => {
    const { H, scene } = monta(), man = manifiestoHierba(H);
    expect(ComponentesPuro.valida(man)).toEqual([]); expect(man.id).toBe("hierba-suelo"); expect(man.mundos).toEqual(["exterior"]);
    expect(man.monta({} as never)).toBe(H); man.libera(H as never); expect(scene.children.length).toBe(0); expect(() => man.libera(null)).not.toThrow();
  });
});

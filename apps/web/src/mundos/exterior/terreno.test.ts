// El sombreado del relieve del exterior (MU5-n, A3-1a; antes 04d_sombreado_tiles.js). Con la three de verdad (sus clases, sin GPU), con las texturas y los
// materiales contados (los que hay vivos: creados y sin dispose, lo que en el navegador cuenta renderer.info.memory), un Mundo de mentira y la Cola de mentira.
// La equivalencia del parche con los trozos de la three instalada la prueba pruebas/guardianes/sombreado_tiles.test.js (Node), con 04d tal cual.
// HONESTIDAD: aquí no se dibuja; lo que se ve lo dice el banco.
import { beforeAll, describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { creaSombreadoTiles, hash, uniformesTerreno } from "./terreno.ts";
import type { DepsTerreno, RaizGlb, ThreeTerreno } from "./terreno.ts";
import type { Tesela } from "./teselas.ts";

type Clase = new (...a: unknown[]) => { dispose(): void };
/** three con DataTexture, Texture y MeshLambertMaterial contados: vivos = creados − liberados (como renderer.info.memory, sin GPU) */
export async function threeContado(): Promise<{ THREE: ThreeTerreno & Record<string, unknown>; vivos: { texturas: Set<unknown>; materiales: Set<unknown> } }> {
  const ruta = "three", T = (await import(/* @vite-ignore */ ruta)) as Record<string, Clase>;   // por variable: three no trae tipos
  const vivos = { texturas: new Set<unknown>(), materiales: new Set<unknown>() };
  const cuenta = (Base: Clase, en: Set<unknown>): Clase => class extends Base {
    constructor(...a: unknown[]) { super(...a); en.add(this); }
    override dispose(): void { en.delete(this); super.dispose(); }
  };
  const THREE = Object.assign({}, T, {
    DataTexture: cuenta(T["DataTexture"] as Clase, vivos.texturas), Texture: cuenta(T["Texture"] as Clase, vivos.texturas), CanvasTexture: cuenta(T["CanvasTexture"] as Clase, vivos.texturas),
    MeshLambertMaterial: cuenta(T["MeshLambertMaterial"] as Clase, vivos.materiales)
  }) as unknown as ThreeTerreno & Record<string, unknown>;
  return { THREE, vivos };
}

const TS = 256;
function tesela(kx: number, conSuelo: boolean): Tesela {
  return { key: kx + "_0", kx, ky: 0, ox: kx * TS, oy: 0, v: [kx * TS, 0, (kx + 1) * TS, TS], np: 0, estado: conSuelo ? 2 : 0, dtm: null, chm: null,
    suel: conSuelo ? new Uint8Array(130 * 130 * 3) : null, pts: null, ortImg: null, ortCv: null, ortPix: null, ortW: 0, ortH: 0, gen: 0 };
}
function monta(THREE: ThreeTerreno & Record<string, unknown>, materiales?: DepsTerreno["materiales"], extra?: Partial<DepsTerreno>) {
  const lista = [tesela(0, true), tesela(1, false)], cola: Array<{ k: string; gen: Generator<unknown, unknown, unknown>; fin?: (v: unknown) => void }> = [];
  let alSoltar: ((t: Tesela) => void) | null = null;
  const mundo = {
    TS, N2: TS + 2, NS2: TS / 2 + 2, SRS: 2, lista, mosaico: { img: { width: 4, height: 4 } },
    tesela: (x: number) => lista[Math.floor(x / TS)] || null, dist: () => 0, decodificaOrto: () => new Uint8ClampedArray(0),
    alSoltar: (f: (t: Tesela) => void) => { alSoltar = f; }
  };
  const D = { ts: TS, orto_px: 512, mosaico: { x0: 0, yN: 0, w: 1, h: 1, res: 1 } };
  const T = THREE as unknown as { MeshLambertMaterial: new () => { color: unknown } };
  const matSuelo = new T.MeshLambertMaterial(), UN = uniformesTerreno({ THREE, D, x0: 0, yN: 0, ANCHO: 1000, ALTO: 1000, tinteOrto: new (THREE as unknown as { Color: new () => unknown }).Color() });
  const deps: DepsTerreno = {
    THREE, RES: 1, mundo, suelo: () => 0, UN, matSuelo, materiales: materiales || creaMateriales({ THREE: THREE as unknown as ThreeMin }), parcheTiempo: () => {}, vn2: () => 0.5, ahora: () => 1e6,
    cola: { pon: (k, _p, gen, fin) => { cola.push({ k, gen, fin }); return true; }, cancela: (k) => { const i = cola.findIndex((c) => c.k === k); if (i >= 0) cola.splice(i, 1); } },
    camara: { position: { x: 0, y: 0, z: 0 } }
  };
  if (extra) Object.assign(deps, extra);
  const S = creaSombreadoTiles(deps);
  const corre = (): void => { while (cola.length) { const c = cola.shift() as (typeof cola)[number]; let r = c.gen.next(); while (!r.done) r = c.gen.next(); if (c.fin) c.fin(r.value); } };
  const TexturaC = THREE.Texture as unknown as new (img: unknown) => { image: unknown };
  function glb(x0: number, lado: number) {
    const map = new TexturaC({ width: 256 }), malla = { isMesh: true, material: { map, dispose() {} } as unknown as { map: unknown; dispose(): void } };
    const raiz: RaizGlb = { traverse: (f) => f(malla as never) }, tile = { boundingVolume: { box: [x0 + lado / 2, lado / 2, 0, lado / 2, 0, 0, 0, lado / 2, 0, 0, 0, 5] } };
    return { raiz, tile, malla, map };
  }
  return { S, UN, deps, lista, cola, corre, glb, soltar: (t: Tesela) => { if (alSoltar) alSoltar(t); } };
}

let C: Awaited<ReturnType<typeof threeContado>>;
beforeAll(async () => { C = await threeContado(); });

describe("hash y los uniformes compartidos", () => {
  it("hash es el de siempre; UN trae los uniformes de siempre, con su caja de la finca y su sesgo de muestreo", () => {
    const h = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
    for (const n of [0, 1, 7.3, 1234.5]) expect(hash(n)).toBe(h(n));
    const UN = uniformesTerreno({ THREE: C.THREE, D: { ts: 256, orto_px: 768, mosaico: { x0: 1, yN: 2, w: 3, h: 4, res: 1 } }, x0: 10, yN: 20, ANCHO: 30, ALTO: 40, tinteOrto: "t" });
    expect(Object.keys(UN).sort()).toEqual(["uBias2", "uBumpK", "uDetDbg", "uDetK", "uExag", "uG", "uGBox", "uHierba", "uModoOrto", "uMos", "uMosBox", "uNdviMap", "uNdviOn", "uOrtoTint"].sort());
    expect((UN.uGBox.value as { toArray(): number[] }).toArray()).toEqual([10, 20, 30, 40]);
    expect(UN.uBias2.value).toBeCloseTo(Math.log(2 / (256 / 768)) / Math.LN2); expect(UN.uOrtoTint.value).toBe("t");
  });
});

describe("el componente «terreno-sombreado»: montar y liberar deja las texturas y los materiales como estaban (L2-05)", () => {
  it("modelo() crea el material de cada glb y las texturas de la tesela del Mundo; libera() lo suelta todo, también t.uni y el ruido neutro", () => {
    const antes = { tx: C.vivos.texturas.size, mat: C.vivos.materiales.size };
    const m = monta(C.THREE);
    const matBase = C.vivos.materiales.size, txBase = C.vivos.texturas.size;   // el maestro matSuelo y los mapas de los glb de mentira son de quien los crea, no del componente
    expect(ComponentesPuro.valida(m.S.componente)).toEqual([]);
    expect(m.S.componente.mundos).toEqual(["exterior"]);
    const g1 = m.glb(0, 256), g2 = m.glb(256, 256), g3 = m.glb(0, 512);
    const txGlb = C.vivos.texturas.size - txBase;
    for (const g of [g1, g2, g3]) m.S.modelo(g.raiz, g.tile);
    m.corre();   // el ruido de la tesela 0, en la Cola
    m.S.actualiza();
    const t0 = m.lista[0] as Tesela;
    expect(t0["texSue"]).toBeTruthy(); expect(t0["rui"]).toBeTruthy(); expect(t0["uni"]).toBeTruthy();
    expect(C.vivos.materiales.size - matBase).toBe(3);   // un Lambert por glb
    expect(C.vivos.texturas.size - txBase - txGlb).toBeGreaterThanOrEqual(4);   // suelo y ruido de la tesela 0, ruido neutro y mosaico
    m.S.componente.libera(null);
    expect(C.vivos.materiales.size).toBe(matBase);
    expect(C.vivos.texturas.size - txGlb).toBe(txBase);
    expect(t0["uni"]).toBeUndefined(); expect(t0["texSue"]).toBeNull(); expect(m.UN.uMos.value).toBeNull();
    expect(m.S.resumen()).toEqual({ glb: 0, conTesela: 0, conDetalle: 0 });
    // y vuelve: otro glb tras liberar rehace lo de su tesela
    m.S.modelo(m.glb(0, 256).raiz, g1.tile); m.corre();
    expect(t0["uni"]).toBeTruthy(); expect(t0["texSue"]).toBeTruthy();
    m.S.libera();
    expect(C.vivos.materiales.size).toBe(matBase);
    expect(antes.mat).toBeLessThanOrEqual(matBase);
  });
  it("cuando el Mundo suelta una tesela (alSoltar, L2-03), sus texturas se sueltan y sus uniformes vuelven a los neutros; al volver sus datos se rehacen", () => {
    const m = monta(C.THREE);
    const g = m.glb(0, 256); m.S.modelo(g.raiz, g.tile); m.corre();
    const t0 = m.lista[0] as Tesela, uni = t0["uni"] as Record<string, { value: unknown }>, base = C.vivos.texturas.size;
    const sue = t0["texSue"], rui = t0["rui"];
    t0.suel = null; m.soltar(t0);
    expect(C.vivos.texturas.size).toBe(base - 2);
    expect(C.vivos.texturas.has(sue)).toBe(false); expect(C.vivos.texturas.has(rui)).toBe(false);
    expect((uni["uTiene"] as { value: number }).value).toBe(0); expect((uni["uSue"] as { value: unknown }).value).toBeNull();
    expect(t0["uni"]).toBe(uni);   // el glb vivo sigue leyendo los mismos uniformes (ahora, el mosaico)
    t0.suel = new Uint8Array(130 * 130 * 3); m.S.actualiza(); m.corre();
    expect(t0["texSue"]).toBeTruthy(); expect((uni["uTiene"] as { value: number }).value).toBe(1);
    m.S.libera();
  });
  it("suelta(raiz) libera el material de ese glb y nada más", () => {
    const m = monta(C.THREE);
    const a = m.glb(0, 256), b = m.glb(256, 256); m.S.modelo(a.raiz, a.tile); m.S.modelo(b.raiz, b.tile);
    const n = C.vivos.materiales.size;
    m.S.suelta(a.raiz);
    expect(C.vivos.materiales.size).toBe(n - 1); expect(m.S.resumen().glb).toBe(1);
    // MU5-n, segundo commit: el material sale de la fábrica («terreno», con dueño «terreno-sombreado»), y el suelto por suelta() ya no está en su lista
    const F = m.deps.materiales as unknown as { inventario(): Record<string, { tipo: string; n: number }>; duenos(): Record<string, number>; ruta(n: string): string };
    expect(F.inventario()["terreno"]).toEqual({ tipo: "define", n: 2 }); expect(F.duenos()).toEqual({ "terreno-sombreado": 1 }); expect(F.ruta("terreno")).toBe("clasico");
    m.S.libera();
    expect(F.duenos()).toEqual({});
  });
});

describe("MU5-n, tercer commit: la variante TSL del terreno (apagada, parcial)", () => {
  it("con el renderizador clásico (hoy) la ruta es la clásica y sale el Lambert con su parche", () => {
    const m = monta(C.THREE), g = m.glb(0, 256); m.S.modelo(g.raiz, g.tile);
    const F = m.deps.materiales as unknown as { ruta(n: string): string; cobertura(): Record<string, { clasico: boolean; tsl: boolean }> };
    expect(F.ruta("terreno")).toBe("clasico"); expect(F.cobertura()["terreno"]).toMatchObject({ clasico: true, tsl: true });
    expect((g.malla.material as unknown as { isMeshLambertMaterial?: boolean; onBeforeCompile?: unknown }).onBeforeCompile).toBeTypeOf("function");
    m.S.libera();
  });
  it("con three/webgpu y three/tsl de verdad, cada glb recibe un MeshLambertNodeMaterial con sus nodos, el tinte del maestro y la niebla; libera lo suelta", async () => {
    const rutaW = "three/webgpu", rutaT = "three/tsl";   // por variable: three no trae tipos (y así no entra en el grafo de dependency-cruiser)
    const W = await import(/* @vite-ignore */ rutaW), T = await import(/* @vite-ignore */ rutaT);
    const F = creaMateriales({ THREE: C.THREE as unknown as ThreeMin, render: { tipo: "nuevo" }, nodos: () => ({ THREE: W, TSL: T }) });
    const m = monta(C.THREE, F), g = m.glb(0, 256), g2 = m.glb(0, 512);
    m.S.modelo(g.raiz, g.tile); m.S.modelo(g2.raiz, g2.tile); m.corre();
    const mat = g.malla.material as unknown as Record<string, unknown> & { isNodeMaterial?: boolean; type?: string; dispose(): void };
    expect(F.ruta("terreno")).toBe("tsl");
    expect(mat.isNodeMaterial).toBe(true); expect(mat.type).toBe("MeshLambertNodeMaterial");
    expect(mat["colorNode"]).toBeTruthy(); expect(mat["outputNode"]).toBeTruthy(); expect(mat["fog"]).toBe(true);
    expect(mat["onBeforeCompile"] === undefined || String(mat["onBeforeCompile"]).indexOf("parche") < 0).toBe(true);   // ni el parche clásico
    const maestro = (m.deps.matSuelo as { color: unknown }).color;
    expect(mat["color"]).toBe(maestro);   // el tinte del día: el mismo objeto Color que el clásico
    expect((g2.malla.material as unknown as { type?: string }).type).toBe("MeshLambertNodeMaterial");   // también sin tesela del Mundo (512 m: el mosaico)
    expect((F as unknown as { duenos(): Record<string, number> }).duenos()).toEqual({ "terreno-sombreado": 2 });
    m.S.libera();
    expect((F as unknown as { duenos(): Record<string, number> }).duenos()).toEqual({});
  });
  it("A3-4: con los nodos del tiempo (tiempoTsl), la TSL del terreno pide la sombra de nubes en vWP.xz y la escarcha tras la luz; sin ellos, como antes", async () => {
    const rutaW = "three/webgpu", rutaT = "three/tsl";
    const W = await import(/* @vite-ignore */ rutaW), T = await import(/* @vite-ignore */ rutaT);
    const { creaParcheTiempo } = await import("./tiempo-parche.ts");
    const P = creaParcheTiempo({ THREE: C.THREE, colorVertSRGB: () => {} }), pedidos: number[] = [];
    const tiempoTsl = () => (TS: unknown) => { pedidos.push(1); return P.nodosTsl(TS); };
    const F = creaMateriales({ THREE: C.THREE as unknown as ThreeMin, render: { tipo: "nuevo" }, nodos: () => ({ THREE: W, TSL: T }) });
    const m = monta(C.THREE, F, { tiempoTsl }), g = m.glb(0, 256);
    m.S.modelo(g.raiz, g.tile); m.corre();
    const mat = g.malla.material as unknown as Record<string, unknown> & { isNodeMaterial?: boolean };
    expect(mat.isNodeMaterial).toBe(true); expect(mat["outputNode"]).toBeTruthy(); expect(pedidos.length).toBe(1);
    m.S.libera();
  });
});

describe("A4-0: la TSL del terreno, completa, compila (WGSL y GLSL, sin GPU: prueba-tsl.ts)", () => {
  it("con los nodos del tiempo: el detalle del suelo abierto (lecturas con sesgo), el relieve fino (derivadas) y la vista de depuración entran en el sombreador", async () => {
    const { cargaNodos, compila } = await import("../../nucleo/prueba-tsl.ts");
    const n = await cargaNodos();
    const { creaParcheTiempo } = await import("./tiempo-parche.ts");
    const P = creaParcheTiempo({ THREE: C.THREE, colorVertSRGB: () => {} });
    const F = creaMateriales({ THREE: C.THREE as unknown as ThreeMin, render: { tipo: "nuevo" }, nodos: () => ({ THREE: n.W, TSL: n.T }) });
    const m = monta(C.THREE, F, { tiempoTsl: () => (TS: unknown) => P.nodosTsl(TS) }), g = m.glb(0, 256);
    m.S.modelo(g.raiz, g.tile); m.corre();
    const mat = g.malla.material as unknown as Record<string, unknown>;
    expect(mat["normalNode"]).toBeTruthy();   // pBump
    const c = compila(n, mat);
    expect(c.wgsl.fragmento).toMatch(/textureSampleBias/);   // el detalle de la ortofoto (o2, o4 y la dirección del camino)
    expect(c.wgsl.fragmento).toMatch(/dpdx/); expect(c.glsl.fragmento).toMatch(/dFdx/);   // el relieve fino
    expect(c.wgsl.fragmento).not.toMatch(/textureSampleGrad/);   // sin ?suelo=fotos, nada del suelo de fotos
    m.S.libera();
  });
  it("las texturas de la tesela se releen en el nodo que se muestrea: cuando llegan los datos de la tesela, el sombreador lee la nueva (antes de A4-0 se quedaba con la neutra)", async () => {
    const { cargaNodos, compila } = await import("../../nucleo/prueba-tsl.ts");
    const n = await cargaNodos();
    const F = creaMateriales({ THREE: C.THREE as unknown as ThreeMin, render: { tipo: "nuevo" }, nodos: () => ({ THREE: n.W, TSL: n.T }) });
    const m = monta(C.THREE, F), g = m.glb(0, 256);
    m.S.modelo(g.raiz, g.tile);   // sin correr la cola: el ruido de la tesela aún es el neutro
    const c = compila(n, g.malla.material); c.actualiza();
    const antes = c.texturas();
    m.corre();   // llega el ruido de la tesela (uRui)
    const rui = (m.lista[0] as Tesela)["rui"]; expect(rui).toBeTruthy();
    expect(antes).not.toContain(rui);
    c.actualiza(); expect(c.texturas()).toContain(rui);
    m.S.libera();
  });
  it("con ?suelo=fotos: el suelo de fotos (SueloFotosPuro.tsl) entra con sus lecturas del array (textureSampleGrad) y el campo del ruedo", async () => {
    const { cargaNodos, compila } = await import("../../nucleo/prueba-tsl.ts");
    const { SueloFotosPuro } = await import("./suelo-fotos.ts");
    const n = await cargaNodos();
    const Arr = n.W.DataArrayTexture, T2 = n.W.DataTexture;
    const lam = new Arr(new Uint8Array(4 * SueloFotosPuro.CAPAS), 1, 1, SueloFotosPuro.CAPAS), campo = new T2(new Uint8Array(4), 1, 1);
    const SF = { activo: true, U: { uFot: { value: lam }, uFotK: { value: 1 } }, campo: () => campo, rueNeutro: () => campo, actualiza() {}, libera() {} };
    const F = creaMateriales({ THREE: C.THREE as unknown as ThreeMin, render: { tipo: "nuevo" }, nodos: () => ({ THREE: n.W, TSL: n.T }) });
    const m = monta(C.THREE, F, { sueloFotos: () => SF as never, sueloFotosPuro: () => SueloFotosPuro as never }), g = m.glb(0, 256);
    m.S.modelo(g.raiz, g.tile); m.corre();
    const c = compila(n, g.malla.material); c.actualiza();
    expect(c.wgsl.fragmento).toMatch(/textureSampleGrad/); expect(c.wgsl.fragmento).toMatch(/texture_2d_array/);
    expect(c.glsl.fragmento).toMatch(/textureGrad/); expect(c.glsl.fragmento).toMatch(/sampler2DArray/);
    expect(c.texturas()).toContain(lam); expect(c.texturas()).toContain(campo);   // los MISMOS { value } que el clásico (uFot y el uRue de la tesela)
    m.S.libera();
  });
});

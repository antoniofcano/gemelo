// Los olivos lejanos de la escalera (A3-2b, MU5-n; antes 07ac_lejanos.js). Con el three de verdad (sin GPU), la fábrica de materiales de verdad y dobles de Generados (07ab),
// de la Cola, de fetch y de createImageBitmap. Se comprueba: el sustituto (sin hornear), los impostores con sus dos atlas, L2-08 (los ImageBitmap se cierran al liberar la
// textura y, si un atlas llega y el otro falla, el que llegó se libera) y el ciclo de vida: libera() quita la malla y suelta geometría, material, texturas, el blanco del
// horneado y el trabajo de la Cola, una sola vez. HONESTIDAD: nada se dibuja aquí; el horneado y los sombreadores no se ejecutan (lo dice el banco y el Quest).
import { describe, expect, it } from "vitest";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { ID_LEJANOS, creaLejanos } from "./lejanos.ts";
import type { DepsLejanos } from "./lejanos.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE0: any = await import(/* @vite-ignore */ "three" as string);
const THREE = THREE0;

const espera = () => new Promise((r) => setTimeout(r, 0));
const variante = (j: number) => ({ j, escala: [1, 1, 1] });
interface Atlas { huella: string; bytes: number; lado: number }
const fila = { color: { huella: "h4", bytes: 4, lado: 16 } as Atlas, normales: { huella: "h5", bytes: 5, lado: 16 } as Atlas, variantes: [{ centro: [0, 1, 0], semilado: 1 }, { centro: [0, 1, 0], semilado: 1 }] };

function monta(opc: { impostor?: unknown; fallaNormales?: boolean; THREE?: unknown; Materiales?: unknown; lejanos?: Record<string, unknown>; renderer?: unknown } = {}) {
  const THREE = (opc.THREE || THREE0) as typeof THREE0;
  const gArboles = new THREE.Group(), cancelados: string[] = [], bitmaps: { cerrado: boolean; close(): void; width: number; height: number }[] = [];
  const Generados = {
    escalera: () => true, estado: () => "listo", activo: () => true,
    lejanos: {
      nVariantes: () => 2, variante: (j: number) => variante(j), impostor: () => opc.impostor ?? null, dir: () => "olivos/", constructor: () => ({ huellaBytes: (b: Uint8Array) => Promise.resolve("h" + b.length) }),
      monta: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial())); return g; }, libera: () => {},
      matriz: () => new THREE.Matrix4(), parcheLuz: () => {}, parcheFundido: () => {}, ...(opc.lejanos || {}),
    },
  };
  const deps: DepsLejanos = {
    THREE, renderer: (opc.renderer as DepsLejanos["renderer"]) || {}, Estado: { exag: 1 }, gArboles, Materiales: (opc.Materiales as DepsLejanos["Materiales"]) || creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }),
    ColaExt: { pon: () => null, cancela: (k: string) => { cancelados.push(k); } }, Generados,
    fetch: (url: string) => (opc.fallaNormales && url.includes("h5") ? Promise.resolve({ ok: false, status: 404 }) : Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(url.includes("h5") ? 5 : 4)) })),
    crearBitmap: () => { const b = { cerrado: false, width: 16, height: 16, close() { this.cerrado = true; } }; bitmaps.push(b); return Promise.resolve(b); },
  };
  const api = creaLejanos(deps);
  const olivos = [0, 1, 2].map((i) => ({ i, x: i * 10, y: 0, gz: 0 }));
  api.inicia(olivos); if (!opc.renderer) api._prueba.sinGPU();
  return { api, deps, gArboles, cancelados, bitmaps };
}
const escuchaDispose = (o: { addEventListener(t: string, f: () => void): void }) => { const c = { n: 0 }; o.addEventListener("dispose", () => { c.n++; }); return c; };

describe("lejanos de la escalera (componente del exterior)", () => {
  it("C-07: si el horneado del sustituto falla, se sueltan los árboles montados y el blanco de dibujo, y se queda sin capa", async () => {
    const R = THREE0.WebGLRenderTarget.prototype, disp = R.dispose; let blancos = 0, libres = 0, montados = 0;
    R.dispose = function (this: unknown) { blancos++; return disp.call(this); };
    try {
      const renderer = { getRenderTarget: () => null, setRenderTarget: () => {}, xr: { enabled: false }, getClearAlpha: () => 1, getClearColor: () => {}, setClearColor: () => {},
        render: () => { throw new Error("contexto perdido (de prueba)"); } };
      const lejanos = { monta: () => { montados++; const g = new THREE0.Group(); g.add(new THREE0.Mesh(new THREE0.BoxGeometry(1, 2, 1), new THREE0.MeshBasicMaterial())); return g; }, libera: () => { libres++; } };
      const { api, gArboles } = monta({ renderer, lejanos });
      const aviso = console.warn; console.warn = () => {};
      try { api.paso(0.1); } finally { console.warn = aviso; }
      expect(montados).toBe(2); expect(libres).toBe(2);   // antes: el catch no soltaba lo montado
      expect(blancos).toBe(1);   // antes: el WebGLRenderTarget se perdía sin dispose
      expect(api.hayCapa()).toBe(false); expect(gArboles.children).toHaveLength(0);
      api.libera();
    } finally { R.dispose = disp; }
  });

  it("sin impostores monta el sustituto (dos planos cruzados): una malla instanciada en gArboles, con la capa entrando por su tramado", async () => {
    const { api, gArboles } = monta();
    expect(api.paso(0.1)).toBe(true); expect(api.hayCapa()).toBe(true);
    expect(gArboles.children).toHaveLength(1); const m = api._prueba.malla();
    expect(m.isInstancedMesh).toBe(true); expect(m.name).toBe("olivos-lejanos");
    expect(api.resumen()).toMatchObject({ fuente: "sustituto" });
    for (let i = 0; i < 12; i++) api.paso(0.1);
    api.reparte({ x: 0, y: 0, z: 0 }, { tiene: () => false });
    expect(api.triangulos()).toBe(3 * 4);   // 4 triángulos por olivo en el sustituto
    api.libera();
  });

  it("con impostores baja los dos atlas, los comprueba y monta la malla del impostor; los bitmaps se cierran al liberar (L2-08)", async () => {
    const { api, gArboles, bitmaps } = monta({ impostor: fila });
    api.paso(0.1); expect(api.resumen()).toMatchObject({ fuente: "cargando impostores" });
    await espera(); await espera(); await espera();
    expect(api.resumen()).toMatchObject({ fuente: "impostor" }); expect(gArboles.children).toHaveLength(1);
    expect(bitmaps).toHaveLength(2); expect(bitmaps.every((b) => !b.cerrado)).toBe(true);
    api.libera();
    expect(bitmaps.every((b) => b.cerrado)).toBe(true);   // L2-08: antes nunca se cerraban
  });

  it("L2-08: si un atlas llega y el otro falla, el que llegó se libera (y su bitmap se cierra) y se cae al sustituto", async () => {
    const { api, bitmaps } = monta({ impostor: fila, fallaNormales: true });
    api.paso(0.1); await espera(); await espera(); await espera();
    expect(bitmaps).toHaveLength(1); expect(bitmaps[0]!.cerrado).toBe(true);
    expect(api.resumen()).toMatchObject({ fuente: "sustituto", aviso2: expect.stringContaining("impostores:") });
    api.libera();
  });

  it("montar y liberar (varias veces) quita la malla y suelta geometría, material, texturas y el trabajo de la Cola, una sola vez", async () => {
    for (let v = 0; v < 3; v++) {
      const { api, gArboles, deps, cancelados, bitmaps } = monta({ impostor: fila });
      api.paso(0.1); await espera(); await espera(); await espera();
      const m = api._prueba.malla(), c = { geo: escuchaDispose(m.geometry), mat: escuchaDispose(m.material), malla: escuchaDispose(m), tex: escuchaDispose(m.material.map) };
      expect(deps.Materiales.duenos()).toEqual({ [ID_LEJANOS]: 1 });
      api.libera(); api.libera();
      expect(gArboles.children).toHaveLength(0); expect(api._prueba.malla()).toBeNull();
      expect(Object.values(c).map((x) => x.n)).toEqual([1, 1, 1, 1]);
      expect(cancelados).toEqual(["Lsil"]); expect(deps.Materiales.duenos()).toEqual({}); expect(bitmaps.every((b) => b.cerrado)).toBe(true);
      expect(api.triangulos()).toBe(0); expect(api.pendientes()).toBe(0);
    }
  });

  it("A4-0: las TSL del impostor y del sustituto (apagadas) se construyen con sus nodos y compilan (WGSL y GLSL, sin GPU), también con silueta (AG-2.2)", async () => {
    const { cargaNodos, compila } = await import("../../nucleo/prueba-tsl.ts");
    const { uniformesFundido } = await import("./generados-sombreado.ts");
    const { creaParcheTiempo } = await import("./tiempo-parche.ts");
    const n = await cargaNodos(), W = n.W, UF = uniformesFundido(W), P = creaParcheTiempo({ THREE: W, colorVertSRGB: () => {} });
    const F = creaMateriales({ THREE: W as unknown as ThreeMin, busqueda: "", render: { tipo: "nuevo" }, nodos: () => ({ THREE: W, TSL: n.T }) });
    const lejanos = { uniformes: UF, tiempoTsl: () => (T: unknown) => P.nodosTsl(T) };
    // el sustituto (sin impostores), en su malla de verdad
    const s = monta({ THREE: W, Materiales: F, lejanos }); s.api.paso(0.1);
    const ms = s.api._prueba.malla();
    expect(ms.material.isNodeMaterial).toBe(true); expect(ms.material.maskNode).toBeTruthy(); expect(ms.material.side).toBe(W.DoubleSide);
    const cs = compila(n, ms.material, { hecho: ms }); expect(cs.wgsl.fragmento).toMatch(/discard/);
    s.api.libera();
    // el impostor, en su malla de verdad
    const i = monta({ THREE: W, Materiales: F, lejanos, impostor: fila }); i.api.paso(0.1); await espera(); await espera(); await espera();
    expect(i.api.resumen()).toMatchObject({ fuente: "impostor" });
    const mi = i.api._prueba.malla();
    expect(mi.material.isNodeMaterial && mi.material.positionNode && mi.material.normalNode && mi.material.maskNode && mi.material.outputNode).toBeTruthy();
    const ci = compila(n, mi.material, { hecho: mi });
    expect(ci.wgsl.vertice).toMatch(/cross/);   // el marco del árbol y su inversa por cofactores
    expect((ci.wgsl.vertice.match(/nodeAttribute\d+ : vec4<f32>/g) || []).length).toBe(4);   // las cuatro columnas de la matriz de instancia, una vez cada una
    // con silueta (tP): el polígono de la celda, de la textura de siluetas
    const tP = new W.DataTexture(new Float32Array(4 * 6 * 4 * 64), 6, 4 * 64, W.RGBAFormat, W.FloatType);
    const geo = new W.BufferGeometry(); geo.setAttribute("position", new W.BufferAttribute(new Float32Array(18), 3)); geo.setAttribute("aIdx", new W.BufferAttribute(new Float32Array(6), 1));
    geo.setAttribute("aFun", new W.InstancedBufferAttribute(new Float32Array(3), 1)); geo.setAttribute("aVar", new W.InstancedBufferAttribute(new Float32Array(3), 1));
    const conSil = F.crea("impostor-lejano", { tCol: new W.Texture(), tNor: new W.Texture(), f: fila, tP });
    compila(n, conSil, { hecho: new W.InstancedMesh(geo, conSil, 3) });
    const geoS = geo.clone(); geoS.setAttribute("aVista", new W.BufferAttribute(new Float32Array(6), 1)); geoS.setAttribute("uv", new W.BufferAttribute(new Float32Array(12), 2));
    const susSil = F.crea("impostor-sustituto", { tex: new W.Texture(), tP });
    compila(n, susSil, { hecho: new W.InstancedMesh(geoS, susSil, 3) });
    i.api.libera();
  });
  it("el componente: del exterior, una llamada, y su libera() es el del objeto", () => {
    const { api, gArboles } = monta();
    api.paso(0.1);
    expect(api.componente.id).toBe(ID_LEJANOS); expect(api.componente.mundos).toEqual(["exterior"]); expect(api.componente.presupuesto.llamadas).toBe(1);
    expect(api.componente.monta({} as never)).toEqual({ libera: api.libera }); api.componente.libera(api); expect(gArboles.children).toHaveLength(0);
  });
});

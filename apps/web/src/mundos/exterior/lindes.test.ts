// La linde de las hazas del exterior (A3-3, MU5-n; antes 44_lindes.js). Lo puro (LindesPuro) y el componente con unas líneas de three de mentira (LineSegments2, su geometría y su
// material: lo que se importa con import() en el talón), la fábrica de materiales de verdad y un Minimapa, un Mundo y unas hazas de mentira. El detalle de lo puro (con fast-check) y del
// minimapa está en pruebas/guardianes/lindes.test.js. Aquí: el ciclo de vida (montar, rehacer con «hazas:cambia», repegar y liberar suelta cada geometría y cada material) y el manifiesto.
// HONESTIDAD: nada se dibuja; lo que se ve lo dice el banco y el Quest, no probado aquí.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { DEF_LINDES, ID_LINDES, LindesPuro, MATERIAL_LINDES, creaLindes, manifiestoLindes } from "./lindes.ts";
import type { DepsLindes } from "./lindes.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);
const cuadro = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const HAZAS = [{ id: 1, es_mia: true, anillos: [cuadro(0, 0, 100, 80)] }, { id: 2, es_mia: false, anillos: [cuadro(100, 0, 250, 80)] }];

function entorno(hazasIni: typeof HAZAS = []) {
  const hazas = hazasIni.slice();   // cada entorno su lista (un test la vacía)
  const reg = { dispose: [] as string[], añadidos: [] as { name: string; children: unknown[] }[], quitados: [] as unknown[], cargas: [] as (() => void)[], capas: 0, libera: [] as string[] };
  class Geo {
    a: Record<string, unknown> = {}; setPositions(p: Float32Array) { const data = { array: p, set needsUpdate(_v: boolean) { /* sin GPU */ } }; this.a["instanceStart"] = { data }; return this; }
    getAttribute(n: string) { return this.a[n]; } computeBoundingBox() { /* sin efecto */ } computeBoundingSphere() { /* sin efecto */ } dispose() { reg.dispose.push("geo"); }
  }
  class Mat { o: { linewidth: number }; uniforms: Record<string, { value: unknown }>; constructor(o: { linewidth: number }) { this.o = o; this.uniforms = { resolution: { value: new THREE.Vector2() }, linewidth: { value: o.linewidth } }; } dispose() { reg.dispose.push("mat"); } }
  class Linea { name = ""; renderOrder = 0; geometry: Geo; material: Mat; constructor(g: Geo, m: Mat) { this.geometry = g; this.material = m; } updateMatrix() { /* sin efecto */ } }
  const lib = { LineSegments2: Linea, LineSegmentsGeometry: Geo, LineMaterial: Mat };
  const oyentes: Record<string, ((d?: unknown) => void)[]> = {}, limpia: (() => void)[] = [], ventana: Record<string, unknown> = {}, gLinde = { visible: true, add: (o: unknown) => { reg.añadidos.push(o as never); }, remove: (o: unknown) => { reg.quitados.push(o); } };
  const deps: DepsLindes = {
    THREE: { Vector4: THREE.Vector4, Group: class { name = ""; children: unknown[] = []; add(o: unknown) { this.children.push(o); } } }, Mundo: { TS: 256, cx: 430000, cy: 4180000, alCargar: fn => { reg.cargas.push(fn); } },
    suelo: () => 10, Estado: { exag: 1 }, gLinde, Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }),
    Hazas: { lindes: () => hazas.map(h => ({ id: h.id, es_mia: h.es_mia, anillos: h.anillos })) },
    Minimapa: { capa: () => { reg.capas++; return () => { reg.capas--; }; } }, Componentes: { libera: (id: string) => { reg.libera.push(id); } }, ventana,
  };
  const n = { id: ID_LINDES, parametros: {}, limpia: <F>(fn: F): F => { limpia.push(fn as never); return fn; }, on: (ev: string, fn: (d?: unknown) => void) => { (oyentes[ev] = oyentes[ev] || []).push(fn); return () => { /* sin efecto */ }; }, emite: () => 0, api: () => null };
  const motor = creaLindes(deps);
  return { motor, reg, deps, n, limpia, ventana, hazas, emite: (ev: string, d?: unknown) => (oyentes[ev] || []).forEach(f => f(d)), lib, gLinde };
}

describe("lindes de las hazas (componente del exterior)", () => {
  it("lo puro: cada lado una vez (el común con una tuya, como propio), cortes en cada borde de tesela y el plan cabe en el tope de tramos", () => {
    const l = LindesPuro.lados([{ es_mia: true, anillos: [cuadro(0, 0, 100, 80)] }, { es_mia: false, anillos: [cuadro(100, 0, 200, 80)] }]);
    expect(l.propia).toHaveLength(4); expect(l.ajena).toHaveLength(3);
    const ts = LindesPuro.cortes([0, 0], [600, 0], 2, 256, 0, 0);
    expect(ts[0]).toBe(0); expect(ts[ts.length - 1]).toBe(1); expect(ts.includes(256 / 600) && ts.includes(512 / 600)).toBe(true);
    const plan = LindesPuro.plan(HAZAS, 256, 430000, 4180000, LindesPuro.MAX_SEG);
    expect(plan.total).toBeLessThanOrEqual(LindesPuro.MAX_SEG); expect(plan.recortado).toBe(false); expect(LindesPuro.triangulos(10)).toBe(60);
  });

  it("monta DOS mallas (propias y ajenas) en gLinde con las líneas, rehace con «hazas:cambia» y libera() suelta el grupo, cada geometría y cada material", async () => {
    const e = entorno(HAZAS), api = e.motor.LindesMotor(e.n, () => Promise.resolve(e.lib));
    expect(e.reg.añadidos).toHaveLength(0);   // antes de llegar las líneas, nada
    await new Promise(r => setTimeout(r, 0));
    expect(e.reg.añadidos).toHaveLength(1); const g = e.reg.añadidos[0]!; expect(g.name).toBe("linde de las hazas"); expect(g.children).toHaveLength(2);
    expect(api.estado()).toMatchObject({ llamadas: 2, lib: "lista", hazas: 2 }); expect(typeof e.ventana["__lindes"]).toBe("function");
    e.hazas.pop(); e.emite("hazas:cambia"); expect(e.reg.quitados).toEqual([g]); expect([...e.reg.dispose].sort()).toEqual(["geo", "geo", "mat", "mat"]);   // lo de antes, suelto
    expect(e.reg.añadidos).toHaveLength(2); expect(e.reg.añadidos[1]!.children).toHaveLength(1);
    api.libera();
    expect(e.reg.quitados).toHaveLength(2); expect(e.reg.dispose).toHaveLength(6); expect(api.estado().llamadas).toBe(0);
    api.libera(); expect(e.reg.dispose).toHaveLength(6);   // dos veces no libera de más
    e.limpia.forEach(f => f()); expect("__lindes" in e.ventana).toBe(false); expect(e.reg.capas).toBe(0);
  });

  it("si se libera antes de que lleguen las líneas, no crea nada al llegar; sin las líneas, no escribe en la consola y lo dice en su estado", async () => {
    const e = entorno(HAZAS), api = e.motor.LindesMotor(e.n, () => Promise.resolve(e.lib)); api.libera(); await new Promise(r => setTimeout(r, 0));
    expect(e.reg.añadidos).toHaveLength(0);
    const k = entorno(HAZAS), ko = k.motor.LindesMotor(k.n, () => Promise.reject(new Error("sin red"))); await new Promise(r => setTimeout(r, 0));
    expect(ko.estado().lib).toMatch(/^sin líneas: sin red/); expect(k.reg.añadidos).toHaveLength(0);
  });

  it("montar y liberar varias veces: el aviso de relieve de Mundo se engancha UNA vez aunque el componente se monte de nuevo", async () => {
    const e = entorno(HAZAS);
    for (let v = 0; v < 3; v++) { const api = e.motor.LindesMotor(e.n, () => Promise.resolve(e.lib)); await new Promise(r => setTimeout(r, 0)); api.libera(); }
    expect(e.reg.cargas).toHaveLength(1); expect(e.reg.dispose.filter(x => x === "geo")).toHaveLength(6); expect(e.reg.dispose.filter(x => x === "mat")).toHaveLength(6);
  });

  it("sus dos LineMaterial salen de la fábrica por define + crea con dueño y el nombre de la tabla de MATERIALES; el clásico es el de siempre (uAcerca, el parche de acercamiento y una sola clave de programa) y libera() los suelta", async () => {
    const e = entorno(HAZAS), api = e.motor.LindesMotor(e.n, () => Promise.resolve(e.lib)), F = e.deps.Materiales;
    await new Promise(r => setTimeout(r, 0));
    expect(MATERIAL_LINDES).toBe("lindes-acerca");
    expect(F.cobertura()["lindes-acerca"]).toEqual({ clasico: true, tsl: true, usado: 2 }); expect(F.inventario()["lindes-acerca"]).toEqual({ tipo: "define", n: 2 }); expect(F.duenos()).toEqual({ "lindes-hazas": 2 });
    const [mia, otra] = e.reg.añadidos[0]!.children as { material: { uniforms: { uAcerca: { value: number } }; onBeforeCompile(sh: unknown): void; customProgramCacheKey(): string; o: { linewidth: number; transparent: boolean } } }[];
    expect(mia!.material.uniforms.uAcerca.value).toBeCloseTo(1 - 0.004, 12); expect(otra!.material.uniforms.uAcerca.value).toBeCloseTo(1 - 0.002, 12);
    expect(mia!.material.o.linewidth).toBe(4); expect(otra!.material.o.transparent).toBe(true);
    const sh = { vertexShader: "uniform float linewidth;\n\t" + LindesPuro.ANCLA }; mia!.material.onBeforeCompile(sh); expect(sh.vertexShader).toMatch(/uAcerca/); expect(api.estado().acerca).toBe(true);
    expect(mia!.material.customProgramCacheKey()).toBe("lindes-hazas-acerca"); expect(otra!.material.customProgramCacheKey()).toBe("lindes-hazas-acerca");
    // el clásico a mano: lo mismo que pide la fábrica
    const a = DEF_LINDES.clasico!({ LineMaterial: e.lib.LineMaterial, acerca: 0.01, parche: () => { /* sin efecto */ }, params: { color: 1, linewidth: 3, worldUnits: false, transparent: false, opacity: 1, depthWrite: true } }, { THREE, nombre: "lindes-acerca" }) as unknown as { uniforms: { uAcerca: { value: number } } };
    expect(a.uniforms.uAcerca.value).toBeCloseTo(0.99, 12);
    api.libera(); expect(F.duenos()).toEqual({}); expect(e.reg.dispose.filter(x => x === "mat")).toHaveLength(2);
  });

  it("la variante TSL (apagada): solo con el renderizador nuevo; con three/webgpu y three/tsl de verdad se construye una Line2NodeMaterial con los parámetros del clásico, sin el parche de acercamiento", async () => {
    const rutaW = "three/webgpu", rutaT = "three/tsl";   // por variable: three no trae tipos
    const W = await import(/* @vite-ignore */ rutaW as string), TSL = await import(/* @vite-ignore */ rutaT as string);
    const nuevo = { tipo: "nuevo", pedido: "nuevo" }, clasico = { tipo: "clasico", pedido: "" };
    const opc = { LineMaterial: class { uniforms: Record<string, unknown> = {}; }, acerca: 0.004, parche: () => { /* sin efecto */ }, params: { color: 0xffb020, linewidth: 4, worldUnits: false, transparent: false, opacity: 1, depthWrite: true } };
    // sin renderizador nuevo (hoy, siempre): el clásico, aunque haya nodos
    const hoy = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: clasico, nodos: () => ({ THREE: W, TSL }) });
    hoy.define(MATERIAL_LINDES, DEF_LINDES);
    expect(hoy.ruta(MATERIAL_LINDES)).toBe("clasico"); expect((hoy.crea(MATERIAL_LINDES, opc) as { uniforms?: Record<string, unknown> }).uniforms?.["uAcerca"]).toBeTruthy();
    // con él y la variante: el TSL
    const F = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: nuevo, nodos: () => ({ THREE: W, TSL }) });
    F.define(MATERIAL_LINDES, DEF_LINDES);
    expect(F.ruta(MATERIAL_LINDES)).toBe("tsl"); expect(F.cobertura()[MATERIAL_LINDES]).toMatchObject({ clasico: true, tsl: true });
    const m = F.crea(MATERIAL_LINDES, opc) as { isNodeMaterial: boolean; isLine2NodeMaterial: boolean; color: { getHex(): number }; linewidth: number; worldUnits: boolean; transparent: boolean; opacity: number; depthWrite: boolean; onBeforeCompile?: unknown; uniforms?: unknown };
    expect(m.isNodeMaterial).toBe(true); expect(m.isLine2NodeMaterial).toBe(true); expect(m.color.getHex()).toBe(0xffb020);
    expect([m.linewidth, m.worldUnits, m.transparent, m.opacity, m.depthWrite]).toEqual([4, false, false, 1, true]);
    // lo que NO lleva (y MATERIALES §9 dice): ni el acercamiento de profundidad ni, por tanto, su parche
    expect(m.onBeforeCompile).not.toBe(opc.parche); expect(m.uniforms).toBeUndefined();
  });

  it("el manifiesto vale, es de los mundos [exterior], fase «tarde» cada 0,5 s, bandera ?lindes y su libera suelta de verdad", async () => {
    const e = entorno(HAZAS), man = manifiestoLindes(e.deps, () => Promise.resolve(e.lib));
    expect(ComponentesPuro.valida(man)).toEqual([]);
    expect(man.id).toBe("lindes-hazas"); expect(man.mundos).toEqual(["exterior"]); expect(man.fases).toEqual({ tarde: 0.5 }); expect(man.bandera).toEqual({ defecto: true, url: "lindes" });
    expect(man.eventos).toEqual({ escucha: ["hazas:cambia", "depura:lineas"], emite: [] }); expect(man.presupuesto).toEqual({ llamadas: 2, triangulos: 48000 });
    const api = man.monta(e.n); await new Promise(r => setTimeout(r, 0));
    man.actualiza?.tarde?.(0.5, 0, api as object); expect(e.reg.añadidos).toHaveLength(1);
    man.libera(api as object); expect(e.reg.quitados).toHaveLength(1); expect([...e.reg.dispose].sort()).toEqual(["geo", "geo", "mat", "mat"]); expect(() => man.libera(null)).not.toThrow();
  });
});

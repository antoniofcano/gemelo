// El catálogo de olivos-tipo (A3-2a, MU5-n; antes 07a_catalogo.js). Con el three de verdad (sin GPU: geometrías y materiales existen sin renderizador) y la fábrica de
// materiales de verdad. Se comprueba: las formas del tipo −1 (4 variantes en L1 con copa y tronco, 2 en L2), el registro glb con su presupuesto, y sobre todo el ciclo
// de vida: libera() suelta cada geometría y los dos materiales, y lo que se vuelva a pedir se rehace. HONESTIDAD: nada se dibuja; lo que se ve lo dice el banco.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { DEF_COPA_L1, DEF_TRONCO_L1, MATERIAL_COPA_L1, MATERIAL_TRONCO_L1, creaCatalogo, manifiestoCatalogo } from "./catalogo.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };   // el de 04d

/** un THREE que cuenta las geometrías vivas (creadas y no liberadas): la prueba de memoria sin GPU (lo que renderer.info.memory.geometries contaría al dibujarlas) */
function contado() {
  const vivas = { n: 0 };
  class Geo extends THREE.BufferGeometry { constructor() { super(); vivas.n++; let ya = false; this.addEventListener("dispose", () => { if (!ya) { ya = true; vivas.n--; } }); } }
  return { T: Object.assign({}, THREE, { BufferGeometry: Geo }), vivas };
}
function monta(T: unknown = THREE) {
  const F = creaMateriales({ THREE: T as unknown as ThreeMin, busqueda: "" });
  const parches: string[] = [];
  return { C: creaCatalogo({ THREE: T, hash, parcheTiempo: () => { parches.push("tiempo"); }, Materiales: F }), F, parches };
}

describe("catálogo de olivos-tipo (componente del exterior)", () => {
  it("el tipo −1: 4 variantes en L1 (copa y tronco) y 2 en L2 (copa), con los triángulos de siempre y dentro del presupuesto", () => {
    const { C } = monta();
    expect(C.tipos()).toEqual([-1]); expect(C.variantes(C.SIN, 1)).toBe(4); expect(C.variantes(C.SIN, 2)).toBe(2); expect(C.geometria(C.SIN, 0)).toEqual([]);
    const l1 = [0, 1, 2, 3].map(v => C.geometria(C.SIN, 1, v)), l2 = [0, 1].map(v => C.geometria(C.SIN, 2, v));
    l1.forEach(p => { expect(p.map(x => x.pieza)).toEqual(["copa", "tronco"]); });
    l2.forEach(p => { expect(p.map(x => x.pieza)).toEqual(["copa"]); });
    expect(C.geometria(C.SIN, 1, 2)).toBe(l1[2]);   // guardadas
    [0, 1, 2, 3].forEach(v => { expect(C.triangulos(C.SIN, 1, v)).toBeLessThanOrEqual((C.PRES_TRI[1] as number) * 1.2); });
    expect(C.triangulos(C.SIN, 1, 0)).toBe(6 * 10 * 2 + 10 + 2 * 5 * 2);   // copa 6 × 10 anillos (+ casquete) y tronco de 2 pies
    expect(C.triangulos(C.SIN, 2, 0)).toBe(2 * 7 * 2 + 7);
    expect(C.info(C.SIN)).toEqual({ id: -1, nombre: "por procedimiento", fuente: "ilustrativo", caja: null });
  });

  it("los dos materiales pasan por la fábrica con su nombre (copa-l1, tronco-l1) y su parche lleva el de 15_tiempo y el ruido de la copa", () => {
    const { C, F, parches } = monta();
    expect(F.inventario()).toMatchObject({ "copa-l1": { tipo: expect.any(String), n: 1 }, "tronco-l1": { tipo: expect.any(String), n: 1 } });
    const copa = C.geometria(C.SIN, 1, 0)[0]!.mat, tronco = C.geometria(C.SIN, 1, 0)[1]!.mat;
    expect(copa.isMeshLambertMaterial && copa.vertexColors).toBe(true);
    const sh = { vertexShader: THREE.ShaderLib.lambert.vertexShader + "\nvSomb = ot_sombra(position.xz);", fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    copa.onBeforeCompile(sh);
    expect(parches).toEqual(["tiempo"]); expect(sh.vertexShader).toContain("ot_sombra((instanceMatrix * vec4(transformed, 1.0)).xz)"); expect(sh.fragmentShader).toContain("if (nz < (vRim - 0.72) * 2.8) discard;");
    const st = { vertexShader: "vSomb = ot_sombra(position.xz);", fragmentShader: "" }; tronco.onBeforeCompile(st); expect(st.vertexShader).toContain("instanceMatrix");
    // MU5-n (2.º commit): por define + crea con dueño; el clásico es el de siempre (Lambert blanco con color por vértice, el parche asignado tal cual, sin clave propia)
    expect(F.inventario()).toMatchObject({ "copa-l1": { tipo: "define", n: 1 }, "tronco-l1": { tipo: "define", n: 1 } });
    expect(F.duenos()).toEqual({ "catalogo-olivos": 2 }); expect(F.ruta("copa-l1")).toBe("clasico");
    expect(copa.color.getHex()).toBe(0xffffff); expect(copa.customProgramCacheKey()).toBe(copa.onBeforeCompile.toString());
    expect(copa.onBeforeCompile).not.toBe(tronco.onBeforeCompile);
    C.libera(); expect(F.duenos()).toEqual({});
  });

  it("instala un catálogo glb con un cargador inyectado (lineal → sRGB, caja) y rechaza el que se pasa de presupuesto; retira avisa", async () => {
    const { C } = monta(), cambios: number[][] = [];
    C.alCambiar(t => cambios.push(t));
    const caja = () => { const g = new THREE.BoxGeometry(1, 2, 1); g.translate(0, 1, 0); return g; };
    const grande = () => new THREE.SphereGeometry(1, 64, 64);
    const desc = { fuente: "sintético", tipos: [{ id: 0, nombre: "bueno", niveles: { L1: { glb: "a.glb" }, L2: { glb: "b.glb" } } }, { id: 5, nombre: "grande", niveles: { L1: { glb: "g.glb" } } }] };
    const tipos = await C.instala(desc, (url) => [{ nombre: url === "o/a.glb" ? "copa" : "tronco", geometria: url === "o/g.glb" ? grande() : caja() }], "o/");
    expect(tipos).toEqual([-1, 0]); expect(C.avisos()[0]).toMatch(/tipo 5 .*presupuesto/);
    expect(C.info(0)).toMatchObject({ id: 0, nombre: "bueno", fuente: "sintético" }); expect(C.info(0)!.caja!.alto).toBeCloseTo(2, 6);
    expect(C.geometria(0, 1)[0]!.geo.attributes.color).toBeTruthy(); expect(C.variantes(0, 1)).toBe(1);
    expect(C.retira(0)).toBe(true); expect(C.tipos()).toEqual([-1]); expect(cambios).toEqual([[-1, 0], [-1]]);
    await expect(C.instala(desc, undefined as never)).rejects.toThrow(/cargador/);
  });

  it("memoria: montar, pedir todas las formas, instalar un modelo y liberar deja las geometrías vivas como estaban, y suelta los dos materiales (una vez)", async () => {
    const { T, vivas } = contado(), antes = vivas.n;
    const { C } = monta(T);
    [0, 1, 2, 3].forEach(v => C.geometria(C.SIN, 1, v)); [0, 1].forEach(v => C.geometria(C.SIN, 2, v));
    await C.instala({ tipos: [{ id: 3, nombre: "x", niveles: { L1: { glb: "a" } } }] }, () => [{ nombre: "copa", geometria: new T.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)) }]);
    expect(vivas.n - antes).toBe(4 * 2 + 2 + 1);
    const mats = [C.geometria(C.SIN, 1, 0)[0]!.mat, C.geometria(C.SIN, 1, 0)[1]!.mat]; let sueltos = 0; mats.forEach(m => m.addEventListener("dispose", () => { sueltos++; }));
    // volver a pedir la 0 tras contar no crea nada nuevo
    expect(vivas.n - antes).toBe(11);
    const cambios: number[][] = []; C.alCambiar(t => cambios.push(t));
    expect(C.libera()).toBe(11);
    expect(vivas.n).toBe(antes); expect(sueltos).toBe(2); expect(C.tipos()).toEqual([-1]); expect(cambios).toEqual([[-1]]);
    expect(C.libera()).toBe(0); expect(sueltos).toBe(2);   // dos veces no libera dos veces
    // lo que se vuelva a pedir se rehace (geometrías nuevas)
    expect(C.geometria(C.SIN, 1, 0)).toHaveLength(2); expect(vivas.n - antes).toBe(2);
  });

  it("las variantes TSL (apagadas y PARCIALES): solo con el renderizador nuevo; con three/webgpu y three/tsl de verdad, MeshLambertNodeMaterial con colorNode y, la copa, maskNode", async () => {
    const W = await import(/* @vite-ignore */ "three/webgpu" as string), TSL = await import(/* @vite-ignore */ "three/tsl" as string);
    const nuevo = { tipo: "nuevo", pedido: "nuevo" }, clasico = { tipo: "clasico", pedido: "" }, parche = () => {};
    const hoy = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: clasico, nodos: () => ({ THREE: W, TSL }) });
    hoy.define(MATERIAL_COPA_L1, DEF_COPA_L1); expect(hoy.ruta(MATERIAL_COPA_L1)).toBe("clasico");
    expect((hoy.crea(MATERIAL_COPA_L1, { parche }) as { isMeshLambertMaterial?: boolean }).isMeshLambertMaterial).toBe(true);
    const F = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: nuevo, nodos: () => ({ THREE: W, TSL }) });
    F.define(MATERIAL_COPA_L1, DEF_COPA_L1); F.define(MATERIAL_TRONCO_L1, DEF_TRONCO_L1);
    expect(F.ruta(MATERIAL_COPA_L1)).toBe("tsl"); expect(F.cobertura()[MATERIAL_TRONCO_L1]).toMatchObject({ clasico: true, tsl: true });
    type Nm = { isNodeMaterial: boolean; isMeshLambertNodeMaterial: boolean; colorNode: unknown; maskNode: unknown; vertexColors: boolean; fog: boolean; onBeforeCompile?: unknown };
    const c = F.crea(MATERIAL_COPA_L1, { parche }) as unknown as Nm, t = F.crea(MATERIAL_TRONCO_L1, { parche }) as unknown as Nm;
    for (const m of [c, t]) { expect(m.isNodeMaterial && m.isMeshLambertNodeMaterial).toBe(true); expect(m.colorNode).toBeTruthy(); expect(m.vertexColors).toBe(false); expect(m.fog).toBe(true); }
    expect(c.maskNode).toBeTruthy(); expect(t.maskNode).toBeFalsy();
    // en un catálogo con el renderizador nuevo, las formas salen con los materiales TSL
    const C = creaCatalogo({ THREE, hash, parcheTiempo: () => {}, Materiales: F });
    expect((C.geometria(C.SIN, 1, 0)[0]!.mat as Nm).isNodeMaterial).toBe(true);
  });

  it("el manifiesto vale, es de los mundos [exterior], monta el mismo objeto y su libera lo suelta", () => {
    const { C } = monta(), man = manifiestoCatalogo(C);
    expect(ComponentesPuro.valida(man)).toEqual([]); expect(man.id).toBe("catalogo-olivos"); expect(man.mundos).toEqual(["exterior"]);
    expect(man.presupuesto).toEqual({ llamadas: 0, triangulos: 0 });
    const api = man.monta({} as never); expect(api === C).toBe(true);
    const g = C.geometria(C.SIN, 1, 0)[0]!.geo; let suelta = 0; g.addEventListener("dispose", () => { suelta++; });
    man.libera(api as never); expect(suelta).toBe(1); expect(() => man.libera(null)).not.toThrow();
  });
});

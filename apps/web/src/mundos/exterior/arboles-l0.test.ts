// Los olivos de nivel 0 (A3-2b, MU5-n; antes 06_arboles.js). Con el three de verdad (sin GPU) y la fábrica de materiales de verdad. Se comprueba: radioEn (interpolación
// circular), que arbolesG da dos mallas (copa y tronco) con el color por vértice (L5-01: el tronco usa SU material, el de vertexColors, no el del paisaje), la entidad «olivo»
// (id estable y ficha) y el ciclo de vida: libera() quita los grupos, retira la entidad y suelta los materiales, una sola vez. HONESTIDAD: nada se dibuja aquí.
import { describe, expect, it } from "vitest";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { ID_ARBOLES_L0, MATERIAL_COPA_L0, MATERIAL_TRONCO_L0, creaArbolesL0, defLambertVertice } from "./arboles-l0.ts";
import type { DepsArbolesL0 } from "./arboles-l0.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

function monta() {
  const scene = new THREE.Scene(), registradas: { tipo: string }[] = [], quitadas: string[] = [];
  const copas = [
    { i: 0, id: 101, x: 5, y: 7, h: 4, perfil: [2, 2, 2, 2, 2, 2, 2, 2], oliv: 1, dentro: true, parc: 0 },
    { i: 1, id: -1, x: 15, y: 7, h: 3, perfil: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5], oliv: 1, dentro: false, parc: 0 }];
  const deps: DepsArbolesL0 = {
    THREE, scene, camera: new THREE.PerspectiveCamera(), Estaticos: { congela() {} }, Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }),
    Entidades: { registra: (d: { tipo: string }) => { registradas.push(d); return () => { quitadas.push(d.tipo); }; } }, Estado: { exag: 1 },
    D: { finca_id: "prueba", centro_utm: [500000, 4200000] }, fmt: (n: number, dec = 0) => n.toFixed(dec), FACTOR_R8: 0.5, ESC_R8: 1,
    suelo: () => 100, aviva: () => {}, colorEn: (_x: number, _y: number, _h: number, c3: number[]) => { c3[0] = 0.4; c3[1] = 0.5; c3[2] = 0.3; }, hash: (n: number) => (Math.sin(n * 12.9898) * 43758.5453) % 1 / 2 + 0.5,
    copas, marc: [], Generados: { rotulo: () => null, escalera: () => false }, parcelas: () => [{ nombre: "Parcela A" }], colorVertSRGB: () => {},
  };
  return { api: creaArbolesL0(deps), deps, scene, registradas, quitadas, copas };
}
function consume<T>(g: Generator<unknown, T>): T { let r = g.next(); while (!r.done) r = g.next(); return r.value as T; }

describe("olivos de nivel 0 (componente del exterior)", () => {
  it("radioEn interpola en círculo entre los 8 radios", () => {
    const { api } = monta();
    expect(api.radioEn([1, 2, 3, 4, 5, 6, 7, 8], 0)).toBeCloseTo(1, 9);
    expect(api.radioEn([1, 2, 3, 4, 5, 6, 7, 8], Math.PI / 8)).toBeCloseTo(1.5, 9);
    expect(api.radioEn([1, 2, 3, 4, 5, 6, 7, 8], 2 * Math.PI - Math.PI / 8)).toBeCloseTo(4.5, 9);   // entre el 8.º (8) y el 1.º (1)
  });

  it("arbolesG da la copa y el tronco, cada uno con su material; el del tronco lleva el color por vértice (L5-01)", () => {
    const { api, copas } = monta();
    const [copa, tronco] = consume(api.arbolesG(copas)) as [{ material: unknown; geometry: { attributes: { color: unknown } } }, { material: { vertexColors: boolean }; geometry: { attributes: { color: unknown } } }];
    expect(copa.material).toBe(api.matCopa); expect(tronco.material).toBe(api.matTroncoL0);
    expect(tronco.material.vertexColors).toBe(true); expect(tronco.geometry.attributes.color).toBeTruthy(); expect(copa.geometry.attributes.color).toBeTruthy();
  });

  it("registra la entidad «olivo» con id estable (copas_id) o provisional por índice", () => {
    const { registradas, copas } = monta();
    expect(registradas.map((r) => r.tipo)).toEqual(["olivo"]);
    const ent = registradas[0] as unknown as { existe(id: string): boolean; ficha(id: string): { titulo: string; filas: { k: string; v: string }[] } | null; pos(id: string): { x: number } | null };
    expect(ent.existe("olivo:prueba:101")).toBe(true); expect(ent.existe("olivo:prueba:i1")).toBe(true); expect(ent.existe("olivo:prueba:7")).toBe(false);
    const f = ent.ficha("olivo:prueba:101")!; expect(f.titulo).toBe("Olivo 1");
    expect(f.filas.find((x) => x.k === "Parcela")!.v).toBe("Parcela A"); expect(f.filas.find((x) => x.k === "Id")!.v).toMatch(/101 \(del censo\)/);
    expect(ent.ficha("olivo:prueba:i1")!.filas.find((x) => x.k === "Id")!.v).toMatch(/sin id estable/);
    // L3-13: «no» no se afirma: sin marca emparejada se dice qué se comprobó; L3-23: la posición es la de la copa detectada, no la del tronco
    expect(f.filas.find((x) => x.k === "Guardado en OlivarTrack")!.v).not.toBe("no");
    expect(f.filas.find((x) => x.k.startsWith("UTM 30"))!.k).toMatch(/copa detectada, no tronco/);
    expect(ent.pos("olivo:prueba:101")!.x).toBe(copas[0]!.x);
  });

  it("montar y liberar (varias veces) deja la escena como estaba, retira la entidad y suelta los materiales una sola vez", () => {
    for (let v = 0; v < 3; v++) {
      const { api, scene, quitadas, copas } = monta();
      expect(scene.children).toHaveLength(2);
      const sp = { copa: 0, tronco: 0 };
      api.matCopa.addEventListener("dispose", () => { sp.copa++; }); api.matTroncoL0.addEventListener("dispose", () => { sp.tronco++; });
      consume(api.arbolesG(copas));   // construir no crea nada que 06 deba soltar: las geometrías son de la celda que las cuelga
      api.libera(); api.libera();
      expect(scene.children).toHaveLength(0); expect(quitadas).toEqual(["olivo"]); expect(sp).toEqual({ copa: 1, tronco: 1 });
    }
  });

  it("el componente: del exterior, solo ciclo de vida, y su libera() es el del objeto", () => {
    const { api, scene } = monta();
    expect(api.componente.id).toBe(ID_ARBOLES_L0); expect(api.componente.mundos).toEqual(["exterior"]);
    expect(api.componente.presupuesto).toEqual({ llamadas: 0, triangulos: 0 });
    expect(api.componente.monta({} as never)).toEqual({ libera: api.libera });
    api.componente.libera(api); expect(scene.children).toHaveLength(0);
  });
});

describe("materiales del nivel 0 (MU5-n)", () => {
  it("salen de la fábrica con su dueño, con el parche de color por vértice y la misma clave de programa que antes (la del texto de la función)", () => {
    const { api, deps } = monta();
    expect(api.matCopa.vertexColors).toBe(true); expect(api.matCopa.side).toBe(THREE.DoubleSide); expect(api.matTroncoL0.vertexColors).toBe(true); expect(api.matTroncoL0.side).toBe(THREE.FrontSide);
    expect(api.matCopa.onBeforeCompile).toBe(deps.colorVertSRGB); expect(api.matTroncoL0.onBeforeCompile).toBe(deps.colorVertSRGB);
    expect(api.matCopa.customProgramCacheKey).toBe(THREE.Material.prototype.customProgramCacheKey);   // sin clave propia, como con Materiales.parchea sin clave
    expect(deps.Materiales.duenos()).toEqual({ [ID_ARBOLES_L0]: 2 });
    expect(deps.Materiales.inventario()).toMatchObject({ [MATERIAL_COPA_L0]: { tipo: "define", n: 1 }, [MATERIAL_TRONCO_L0]: { tipo: "define", n: 1 } });
    expect(api.materiales.libera()).toBe(2);   // y nada más
  });

  it("la variante TSL (apagada): con three/webgpu y three/tsl de verdad son MeshLambertNodeMaterial con su colorNode, y solo salen con el renderer nuevo", async () => {
    const rutaW = "three/webgpu", rutaT = "three/tsl";   // por variable: three no trae tipos (y así tampoco entra en el grafo de dependency-cruiser)
    const W = await import(/* @vite-ignore */ rutaW), T = await import(/* @vite-ignore */ rutaT);
    const { deps } = monta();
    const nuevo = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: { tipo: "nuevo", pedido: "nuevo" }, nodos: () => ({ THREE: W, TSL: T }) });
    const clasico = creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" });
    for (const M of [nuevo, clasico]) { M.define(MATERIAL_COPA_L0, defLambertVertice(deps.colorVertSRGB, true)); M.define(MATERIAL_TRONCO_L0, defLambertVertice(deps.colorVertSRGB, false)); }
    expect(nuevo.ruta(MATERIAL_COPA_L0)).toBe("tsl"); expect(clasico.ruta(MATERIAL_COPA_L0)).toBe("clasico");
    const copa = nuevo.crea(MATERIAL_COPA_L0) as { isNodeMaterial?: boolean; type?: string; colorNode?: unknown; side?: number }, tronco = nuevo.crea(MATERIAL_TRONCO_L0) as typeof copa;
    expect(copa.isNodeMaterial).toBe(true); expect(copa.type).toBe("MeshLambertNodeMaterial"); expect(copa.colorNode).toBeTruthy(); expect(copa.side).toBe(THREE.DoubleSide);
    expect(tronco.type).toBe("MeshLambertNodeMaterial"); expect(tronco.colorNode).toBeTruthy(); expect(tronco.side).toBe(THREE.FrontSide);
    expect(clasico.crea(MATERIAL_COPA_L0)).toMatchObject({ type: "MeshLambertMaterial" });
    expect(nuevo.cobertura()[MATERIAL_COPA_L0]).toMatchObject({ clasico: true, tsl: true });
  });
});

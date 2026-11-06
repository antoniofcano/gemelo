// El suelo de fondo del exterior (A3-1b, MU5-n; antes 04e_suelo_fondo.js). Con el three de verdad (sin GPU: geometrías, materiales y texturas existen sin
// renderizador) y la fábrica de materiales de verdad. Se comprueba: la malla de pocos triángulos bajo el relieve grueso, que sigue la exageración, que no existe sin
// escena activa, y sobre todo el ciclo de vida: montar, actualizar y liberar deja lo creado igual de liberado (geometría y material sí, la textura del mosaico NO:
// es de 04d). HONESTIDAD: nada se dibuja; lo que se ve lo dice el banco y el Quest, no probado aquí.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { BAJA, CELDAS_MAX, DEF_SUELO_FONDO, MARGEN, MATERIAL_SUELO_FONDO, creaSueloFondo, manifiestoSueloFondo, parcheSueloFondo } from "./suelo-fondo.ts";
import type { DepsSueloFondo } from "./suelo-fondo.ts";

// three no trae tipos en el repo: se carga por variable (como materiales.test.ts) y se toca sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

/** cuenta los dispose de lo que se le apunta (geometrías, materiales y texturas de three emiten «dispose») */
function espia() {
  const cuenta = { geometria: 0, material: 0, textura: 0 }, tipos = new Set<unknown>();
  return {
    cuenta,
    apunta(o: { addEventListener(t: string, f: () => void): void }, que: keyof typeof cuenta) { if (tipos.has(o)) return; tipos.add(o); o.addEventListener("dispose", () => { cuenta[que]++; }); },
  };
}
const grueso = (x: number, y: number) => 100 + 0.01 * x + 0.02 * y;   // un plano inclinado

function monta(estado = "activo", extra: Partial<DepsSueloFondo> = {}) {
  const scene = new THREE.Scene(), tex = new THREE.Texture(), est = { v: estado }, Estado = { exag: 1 };
  const deps: DepsSueloFondo = {
    THREE, D: { mosaico: { x0: 1000, yN: 4000, w: 2000, h: 1500, res: 1 }, grueso: { x0: 1000, yN: 4000, w: 250, h: 188, res: 8 } },
    Mundo: { grueso }, UN: { uMos: { value: tex } }, matSuelo: new THREE.MeshLambertMaterial({}), Escena3D: { estado: () => est.v }, scene, Estado,
    Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), busqueda: "", ...extra,
  };
  return { api: creaSueloFondo(deps), deps, scene, tex, est, Estado };
}

describe("suelo de fondo (componente del exterior)", () => {
  it("una malla de pocos triángulos que cubre la caja con su margen, siempre por debajo del relieve grueso, con el uv del mosaico y el color de matSuelo", () => {
    const { api, scene, deps } = monta();
    api.actualiza();
    const m = api.malla(); expect(m).toBeTruthy();
    expect(scene.children.filter((o: { name: string }) => o.name === "sueloFondo")).toHaveLength(1);
    const tri = m.geometry.index.count / 3; expect(tri).toBeGreaterThan(0); expect(tri).toBeLessThanOrEqual(CELDAS_MAX * CELDAS_MAX * 2);
    const pos = m.geometry.attributes.position, uv = m.geometry.attributes.uv; let xa = 1e9, xb = -1e9, ya = 1e9, yb = -1e9;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = -pos.getZ(i);
      expect(pos.getY(i)).toBeLessThanOrEqual(grueso(x, y) - BAJA + 1e-3);
      xa = Math.min(xa, x); xb = Math.max(xb, x); ya = Math.min(ya, y); yb = Math.max(yb, y);
      expect(Math.abs(uv.getX(i) - (x - 1000) / 2000)).toBeLessThan(1e-4); expect(Math.abs(uv.getY(i) - (y - (4000 - 1500)) / 1500)).toBeLessThan(1e-4);
    }
    expect(xa).toBeLessThanOrEqual(1000 - MARGEN + 1e-6); expect(xb).toBeGreaterThanOrEqual(3000 + MARGEN - 1e-6);
    expect(m.material.polygonOffset).toBe(true); expect(m.material.map).toBe(deps.UN.uMos.value); expect(m.material.color).toBe(deps.matSuelo.color);
    expect(m.renderOrder).toBe(-1);
  });

  it("sigue la exageración vertical y no existe sin la escena 3D Tiles activa", () => {
    const { api, scene, est, Estado } = monta("cargando");
    api.actualiza(); expect(api.malla()).toBeNull(); expect(scene.children).toHaveLength(0);
    est.v = "activo"; Estado.exag = 2.5; api.actualiza();
    const m = api.malla(); expect(m).toBeTruthy(); m.updateMatrixWorld(true); expect(m.matrixWorld.elements[5]).toBeCloseTo(2.5, 9);
    est.v = "sin"; api.actualiza(); expect(api.malla()).toBeNull(); expect(scene.children).toHaveLength(0);
  });

  it("?sinFondo lo apaga: ni se crea", () => {
    const { api } = monta("activo", { busqueda: "?sinFondo" });
    api.actualiza(); expect(api.malla()).toBeNull();
  });

  it("montar, actualizar y liberar (varias veces) deja geometrías y materiales liberados y la escena como estaba; la textura del mosaico no se toca", () => {
    const { api, scene, tex, deps } = monta(), sp = espia();
    tex.addEventListener("dispose", () => { sp.cuenta.textura++; });
    let creadas = 0;
    for (let v = 0; v < 3; v++) {
      api.actualiza(); const m = api.malla(); expect(m).toBeTruthy(); creadas++;
      sp.apunta(m.geometry, "geometria"); sp.apunta(m.material, "material");
      api.libera(); expect(api.malla()).toBeNull(); expect(scene.children).toHaveLength(0);
    }
    expect(sp.cuenta).toEqual({ geometria: creadas, material: creadas, textura: 0 });
    api.suelta(); api.suelta();   // dos veces no rompe ni libera de más
    expect(sp.cuenta).toEqual({ geometria: creadas, material: creadas, textura: 0 });
    expect(deps.UN.uMos.value).toBe(tex);
  });

  it("su material sale de la fábrica con el nombre de la tabla de MATERIALES, con dueño; el clásico es el de siempre (mismo parche y misma clave de programa) y libera() lo suelta", () => {
    const { api, deps } = monta(), F = deps.Materiales;
    api.actualiza(); const m = api.malla().material;
    expect(F.cobertura()[MATERIAL_SUELO_FONDO]).toEqual({ clasico: true, tsl: true, usado: 1 });
    expect(F.duenos()).toEqual({ "suelo-fondo": 1 }); expect(F.ruta(MATERIAL_SUELO_FONDO)).toBe("clasico");
    expect(m.onBeforeCompile).toBe(parcheSueloFondo); expect(m.customProgramCacheKey()).toBe("suelo-fondo"); expect(m.isMeshLambertMaterial).toBe(true);
    expect(m.color).toBe(deps.matSuelo.color); expect(m.map).toBe(deps.UN.uMos.value); expect(m.polygonOffsetFactor).toBe(2); expect(m.polygonOffsetUnits).toBe(2);
    const sh = { fragmentShader: THREE.ShaderLib.lambert.fragmentShader }; m.onBeforeCompile(sh);
    expect(sh.fragmentShader).not.toContain("#include <map_fragment>"); expect(sh.fragmentShader).toContain("sRGBTransferEOTF(texture2D(map, vMapUv))");
    let liberado = 0; m.addEventListener("dispose", () => { liberado++; });
    api.libera(); expect(liberado).toBe(1); expect(F.duenos()).toEqual({});
  });

  it("la variante TSL (apagada): solo con el renderizador nuevo; con three/webgpu y three/tsl de verdad se construye un MeshLambertNodeMaterial con el mismo color y su colorNode", async () => {
    const rutaW = "three/webgpu", rutaT = "three/tsl";   // por variable: three no trae tipos
    const W = await import(/* @vite-ignore */ rutaW as string), TSL = await import(/* @vite-ignore */ rutaT as string);
    const nuevo = { tipo: "nuevo", pedido: "nuevo" }, clasico = { tipo: "clasico", pedido: "" };
    const color = new W.Color(0x808080), tex = new W.Texture();
    // sin renderizador nuevo (hoy, siempre): el clásico, aunque haya nodos
    const hoy = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: clasico, nodos: () => ({ THREE: W, TSL }) });
    hoy.define(MATERIAL_SUELO_FONDO, DEF_SUELO_FONDO);
    expect(hoy.ruta(MATERIAL_SUELO_FONDO)).toBe("clasico"); expect((hoy.crea(MATERIAL_SUELO_FONDO, { map: tex, color }) as { isMeshLambertMaterial?: boolean }).isMeshLambertMaterial).toBe(true);
    // con él y la variante: el TSL
    const F = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: nuevo, nodos: () => ({ THREE: W, TSL }) });
    F.define(MATERIAL_SUELO_FONDO, DEF_SUELO_FONDO);
    expect(F.ruta(MATERIAL_SUELO_FONDO)).toBe("tsl"); expect(F.cobertura()[MATERIAL_SUELO_FONDO]).toMatchObject({ clasico: true, tsl: true });
    const m = F.crea(MATERIAL_SUELO_FONDO, { map: tex, color }) as { isNodeMaterial: boolean; isMeshLambertNodeMaterial: boolean; color: unknown; colorNode: unknown; polygonOffset: boolean; polygonOffsetFactor: number; fog: boolean; onBeforeCompile?: unknown };
    expect(m.isNodeMaterial).toBe(true); expect(m.isMeshLambertNodeMaterial).toBe(true); expect(m.color).toBe(color); expect(m.colorNode).toBeTruthy();
    expect(m.polygonOffset).toBe(true); expect(m.polygonOffsetFactor).toBe(2); expect(m.fog).toBe(true);
  });

  it("el escalón de VR: pide menos celdas, baja más, rehace la malla; suelta() olvida la fuente", () => {
    const fuentes: Record<string, (v: number) => void> = {};
    const { api } = monta("activo", {
      VrPresupuesto: { fuente: (n, f) => { fuentes[n] = f; }, olvida: (n) => { delete fuentes[n]; } },
      VrPresupuestoPuro: { hundimiento: (c, max, baja) => baja * (max / c) },
    });
    api.actualiza(); const g0 = api.malla().geometry, tri0 = g0.index.count / 3; expect(tri0).toBe(CELDAS_MAX * CELDAS_MAX * 2);
    fuentes["sueloFondo"]!(64); expect(api.malla()).toBeNull(); api.actualiza();
    expect(api.celdas()).toBe(64); expect(api.baja()).toBe(BAJA * 2); expect(api.malla().geometry).not.toBe(g0);
    api.suelta(); expect("sueloFondo" in fuentes).toBe(false);
  });

  it("el manifiesto vale, es de los mundos [exterior], en la fase «tarde», y su libera suelta de verdad", () => {
    const { deps, scene } = monta(), man = manifiestoSueloFondo(deps);
    expect(ComponentesPuro.valida(man)).toEqual([]);
    expect(man.id).toBe("suelo-fondo"); expect(man.mundos).toEqual(["exterior"]); expect(man.fases).toEqual({ tarde: 0 }); expect(man.bandera).toEqual({ defecto: true, url: "fondo" });
    const api = man.monta({} as never) as ReturnType<typeof creaSueloFondo>;
    man.actualiza?.tarde?.(0.016, 0, api); expect(scene.children).toHaveLength(1);
    man.libera(api); expect(scene.children).toHaveLength(0); expect(() => man.libera(api)).not.toThrow(); expect(() => man.libera(null)).not.toThrow();
  });
});

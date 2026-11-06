// Los marcadores de la nube LiDAR (A3-2b, MU5-n; antes 08b_marcadores_lidar.js). Con el three de verdad (sin GPU) y la fábrica de materiales de verdad. Se comprueba:
// que coloca copas, anillos y desfase con la exageración, que las casillas mandan, y sobre todo el ciclo de vida: montar y liberar (varias veces) deja la escena como
// estaba y suelta geometrías y materiales. HONESTIDAD: nada se dibuja; lo que se ve lo dice el banco y el Quest, no probado aquí.
import { describe, expect, it } from "vitest";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import type { ContextoComponente } from "../../nucleo/componentes.ts";
import { ID_MARCADORES_LIDAR, creaMarcadoresLidar, manifiestoMarcadoresLidar } from "./marcadores-lidar.ts";
import type { DepsMarcadoresLidar, PuntoLidar } from "./marcadores-lidar.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

function monta(nCopas = 40, nMarc = 12, listo = true) {
  const scene = new THREE.Scene(), Estado = { exag: 1 };
  const copas: PuntoLidar[] = [], marc: PuntoLidar[] = [];
  for (let i = 0; i < nCopas; i++) copas.push({ x: -60 + (i % 20) * 6, y: -40 + Math.floor(i / 20) * 6, h: 4 });
  for (let i = 0; i < nMarc; i++) marc.push({ x: (copas[i] as PuntoLidar).x + 1, y: (copas[i] as PuntoLidar).y, par: i % 5 ? i : -1 });
  const casillas: Record<string, { checked: boolean }> = { cCopas: { checked: true }, cMarc: { checked: true }, cDesf: { checked: false } };
  const oyentes: Record<string, () => void> = {};
  const n = { on(ev: string, f: () => void) { oyentes[ev] = f; return () => {}; } } as unknown as ContextoComponente;
  const deps: DepsMarcadoresLidar = {
    THREE, scene, Estaticos: { congela() {} }, colorCss: () => 0x58b6e8, cIn: copas, marc, copas, suelo: () => 100, Estado, listo: () => listo,
    $: (id) => casillas[id] as { checked: boolean }, Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }),
  };
  return { api: creaMarcadoresLidar(deps, n), deps, scene, Estado, casillas, oyentes };
}

describe("marcadores LiDAR (componente del exterior)", () => {
  it("coloca copas, anillos y desfase con el suelo y la exageración, y las casillas mandan", () => {
    const { api, scene, Estado, casillas, oyentes } = monta();
    expect(scene.children.map((o: { name: string }) => o.name)).toEqual(["copas", "marcas", "desfase"]);
    const mc = scene.children[0].children[0], mm = scene.children[1].children[0];
    expect(mc.instanceMatrix.array[13]).toBeCloseTo(100 + 4 + 1.4, 4);
    expect(mm.instanceMatrix.array[13]).toBeCloseTo(100 + 0.35, 4);
    Estado.exag = 2; oyentes["mundo:aplica"]!(); expect(mc.instanceMatrix.array[13]).toBeCloseTo((100 + 4 + 1.4) * 2, 4);
    expect(scene.children[2].visible).toBe(false);
    casillas["cDesf"]!.checked = true; casillas["cCopas"]!.checked = false; oyentes["capas:cambia"]!();
    expect(scene.children[2].visible).toBe(true); expect(scene.children[0].visible).toBe(false);
    api.suelta();
  });

  it("montar y liberar (varias veces) deja la escena como estaba y suelta geometrías y materiales", () => {
    const sp = { geometria: 0, material: 0 };
    for (let v = 0; v < 3; v++) {
      const { api, scene } = monta();
      const hijos: { geometry?: { addEventListener(t: string, f: () => void): void }; material?: { addEventListener(t: string, f: () => void): void } }[] = [];
      scene.traverse((o: object) => { if ((o as { geometry?: unknown }).geometry) hijos.push(o as never); });
      expect(hijos).toHaveLength(3);
      const antes = { g: sp.geometria, m: sp.material };
      hijos.forEach((h) => { h.geometry!.addEventListener("dispose", () => { sp.geometria++; }); h.material!.addEventListener("dispose", () => { sp.material++; }); });
      api.suelta(); expect(scene.children).toHaveLength(0);
      expect(sp.geometria - antes.g).toBe(3); expect(sp.material - antes.m).toBe(3);
      api.suelta();   // dos veces no libera de más
      expect(sp.geometria - antes.g).toBe(3);
    }
  });

  it("montado tarde (los datos ya están) coloca al momento; si aún no, espera a «mundo:aplica»", () => {
    const tarde = monta(40, 12, true), pronto = monta(40, 12, false);
    expect(tarde.scene.children[0].children[0].instanceMatrix.array[13]).toBeCloseTo(105.4, 4);
    expect(pronto.scene.children[0].children[0].instanceMatrix.array[13]).toBe(0);
    pronto.oyentes["mundo:aplica"]!(); expect(pronto.scene.children[0].children[0].instanceMatrix.array[13]).toBeCloseTo(105.4, 4);
    tarde.api.suelta(); pronto.api.suelta();
  });

  it("el manifiesto: de los mundos [exterior], bandera ?marcadores, libera() sin api no rompe", () => {
    const { deps } = monta();
    const m = manifiestoMarcadoresLidar(deps);
    expect(m.id).toBe(ID_MARCADORES_LIDAR); expect(m.mundos).toEqual(["exterior"]); expect(m.bandera.url).toBe("marcadores");
    expect(() => m.libera(null)).not.toThrow();
  });
});

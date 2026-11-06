// Tocar para ir andando (A3-6c, MU5-n; antes 12c_ir_a.js). Con el three de verdad (sin GPU) y dobles del legado: un toque en el suelo pone destino y dibuja la línea; los mandos lo
// cancelan; en VR o en el dron no hace nada; el destino no cae en un tronco (gm.obstaculo); y libera() quita la línea y suelta su geometría y su material (sus «dispose»).
// HONESTIDAD: nada se dibuja aquí; que se ande igual lo prueban ir_a.test.js (Node) y, en el navegador, ir_a por el banco.
import { describe, expect, it } from "vitest";
import { ID_IR_A, creaIrA, manifiestoIrA } from "./ir-a.ts";
import type { DepsIrA } from "./ir-a.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const THREE: A = await import(/* @vite-ignore */ "three" as string);

function monta(extra?: Partial<{ vr: boolean; dron: boolean; paseando: boolean }>) {
  const e = Object.assign({ vr: false, dron: false, paseando: true }, extra || {});
  const scene = new THREE.Scene(), borrados: number[] = [];
  const d: DepsIrA = {
    THREE, scene, Estado: { exag: 1 }, Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), suelo: () => 0, copas: () => [{ x: 0, y: 5, oliv: true }], pp: { x: 0, y: 0, ang: 0, paso: 0 },
    Llegada: { borra: () => { borrados.push(1); }, apuntaPantalla: () => ({ x: 0, y: 0, z: -10 }) },
    paseando: () => e.paseando, teclas: () => ({}), enQuad: () => false, enDron: () => e.dron, VRX: () => ({ on: e.vr }), Ajustes: () => null,
    gm: () => ({ obstaculo: (x: number, y: number) => (Math.hypot(x, y - 10) < 0.9 ? { x: 0.9, y: 10 } : null), dentro: () => true }), busqueda: ""
  };
  return { api: creaIrA(d), scene, borrados, e, d };
}

describe("ir-a: tocar para ir andando", () => {
  it("un toque corto en el suelo pone destino (apartado del tronco) y la línea de puntos se ve; los mandos lo cancelan", () => {
    const m = monta();
    expect(m.scene.children).toContain(m.api.linea);
    expect(m.api.toca(10, 10, 0, 100, "touch")).toBe(true);
    expect(m.api.destino()).toMatchObject({ x: 0.9, y: 10 });
    expect(m.api.linea.visible).toBe(true);
    expect(m.api.paso(1 / 60, true)).toBeNull();
    expect(m.api.destino()).toBeNull(); expect(m.api.linea.visible).toBe(false); expect(m.borrados.length).toBe(1);
  });
  it("en VR, con el dron o sin pasear, el toque no hace nada; un arrastre largo tampoco", () => {
    for (const x of [{ vr: true }, { dron: true }, { paseando: false }]) expect(monta(x).api.toca(10, 10, 0, 100, "touch")).toBe(false);
    expect(monta().api.toca(10, 10, 80, 100, "touch")).toBe(false);
  });
  it("libera() quita la línea de la escena y suelta su geometría y su material; monta() la vuelve a poner", () => {
    const m = monta(), sueltos: string[] = [];
    expect(m.api.linea.material.type).toBe("PointsMaterial"); expect(m.d.Materiales.duenos()["ir-a"]).toBe(1);   // de la fábrica, con su dueño
    m.api.linea.geometry.addEventListener("dispose", () => sueltos.push("geo")); m.api.linea.material.addEventListener("dispose", () => sueltos.push("mat"));
    m.api.libera();
    expect(m.scene.children).not.toContain(m.api.linea); expect(sueltos.sort()).toEqual(["geo", "mat"]);
    m.api.monta(); expect(m.scene.children).toContain(m.api.linea);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoIrA(monta().api);
    expect(c.id).toBe(ID_IR_A); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

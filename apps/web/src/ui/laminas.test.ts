// Las láminas (A3-7a, MU5-n; antes 02d_laminas.js), con el three de verdad y sin GPU (memoria): abrir crea UNA malla con su geometría, su material y su textura;
// salir de VR cierra las de VR; libera() cierra las que queden, suelta todo lo que creó (se cuentan los «dispose» de three) y se borra del Bus. Lo puro, el giro y
// el toque los prueba pruebas/guardianes/laminas.test.js. HONESTIDAD: no hay renderer.info sin GPU; la medida en el navegador va por el banco.
import { describe, expect, it } from "vitest";
import { ID_LAMINAS, creaLaminas, manifiestoLaminas } from "./laminas.ts";
import { creaMateriales } from "../nucleo/materiales.ts";
import type { ThreeMin } from "../nucleo/materiales.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const THREE: A = await import(/* @vite-ignore */ "three" as string);

function monta() {
  const oy: Record<string, Array<() => void>> = {}, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), VRX = { on: false, cab: new THREE.Vector3(), mira: null };
  const Bus = { on: (ev: string, f: () => void) => { (oy[ev] = oy[ev] || []).push(f); return () => { oy[ev] = oy[ev]!.filter(x => x !== f); }; }, emite: (ev: string) => { (oy[ev] || []).slice().forEach(f => f()); return 0; } };
  const documento = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() { /* doble */ } }) }) };
  const Materiales = creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" });
  const L = creaLaminas({ THREE, Bus, Materiales, InfoDibujo: { fotograma: () => 0 }, scene, camera, renderer: {}, texColor: (t: A) => t, VRX, documento });
  return { L, scene, VRX, Bus, oy, Materiales };
}
function espia() {
  let n = 0; const orig = THREE.EventDispatcher.prototype.dispatchEvent;
  THREE.EventDispatcher.prototype.dispatchEvent = function (this: A, e: A) { if (e && e.type === "dispose") n++; return orig.call(this, e); };
  return { cuenta: () => n, quita: () => { THREE.EventDispatcher.prototype.dispatchEvent = orig; } };
}
const def = (id: string, modo?: string) => ({ id, ancho: 1, alto: 0.5, modo, pinta() { /* nada */ } });

describe("láminas", () => {
  it("abrir crea una malla en la escena; salir de VR cierra solo las de VR", () => {
    const { L, scene, Bus } = monta();
    expect(L.abre(def("a", "pantalla"))).toBe(true); expect(L.abre(def("b", "vr"))).toBe(true); expect(scene.children.length).toBe(2);
    Bus.emite("vr:sale"); expect(L.ids()).toEqual(["a"]); expect(scene.children.length).toBe(1);
  });
  it("libera() cierra las que queden, suelta geometría, material y textura de cada una y se borra del Bus", () => {
    const { L, scene, oy } = monta(), e = espia();
    try {
      const cierres: string[] = [];
      for (let i = 0; i < 5; i++) L.abre(Object.assign(def("l" + i, "pantalla"), { alCierra: (mo: string) => cierres.push(mo) }));
      L.libera();
      expect(scene.children.length).toBe(0); expect(L.ids()).toEqual([]); expect(e.cuenta()).toBe(15);   // 5 × (geometría, material, textura)
      expect(cierres).toEqual(["cerrada", "cerrada", "cerrada", "cerrada", "cerrada"]); expect(oy["vr:sale"]!.length).toBe(0);
    } finally { e.quita(); }
  });
  it("el material de cada lámina es de la fábrica, con dueño «laminas-mundo», y no queda nada suyo tras cerrar o liberar (segundo commit)", () => {
    const { L, Materiales } = monta();
    L.abre(def("a", "pantalla")); L.abre(Object.assign(def("b", "pantalla"), { encima: true }));
    expect(Materiales.duenos()[ID_LAMINAS]).toBe(2);
    L.cierra("a"); expect(Materiales.duenos()[ID_LAMINAS]).toBe(1);
    L.libera(); expect(Materiales.duenos()[ID_LAMINAS] || 0).toBe(0);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoLaminas(monta().L);
    expect(c.id).toBe(ID_LAMINAS); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

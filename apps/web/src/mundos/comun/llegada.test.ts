// La llegada (A3-6c, MU5-n; antes 12b_llegada.js). Con el three de verdad (sin GPU) y dobles del DOM y del legado: aparecer en pantalla deja a quien pasea en el punto (fuera de troncos,
// con gm.obstaculo) y la cámara de seguimiento detrás; en VR pasa el salto a vrAparece; el rayo al suelo pone el anillo; y libera() quita el anillo (sus «dispose»), el velo y las escuchas
// del lienzo, del botón y de la ventana. HONESTIDAD: nada se dibuja aquí; en el navegador, llegada por el banco; en el Quest y el iPhone, NO probado.
import { describe, expect, it } from "vitest";
import { ID_LLEGADA, creaLlegada, manifiestoLlegada } from "./llegada.ts";
import type { DepsLlegada } from "./llegada.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const THREE: A = await import(/* @vite-ignore */ "three" as string);

/** un objeto con escuchas contadas (el lienzo, el botón, la ventana) */
function conEscuchas(extra?: A) {
  const o: A = Object.assign({ n: 0, style: {}, setAttribute() { /* doble */ }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) }, extra || {});
  o.addEventListener = () => { o.n++; }; o.removeEventListener = () => { o.n--; }; return o;
}
function monta(vr = false) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), lienzo = conEscuchas(), boton = conEscuchas({ hidden: true, textContent: "" }), ventana = conEscuchas();
  const hijos: A[] = [], visor = { appendChild: (e: A) => { hijos.push(e); e.parentNode = { removeChild: (x: A) => { hijos.splice(hijos.indexOf(x), 1); x.parentNode = null; } }; } };
  const e = { paseando: false, enDron: false, aparecidos: [] as A[] };
  const d: DepsLlegada = {
    THREE, scene, camera, Estado: { exag: 1 }, Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), lienzo, visor, $: (id: string) => (id === "padAterriza" ? boton : null),
    paseando: () => e.paseando, pp: { x: 0, y: 0, ang: 0, paso: 0 }, camPos: new THREE.Vector3(), entraPaseo: () => { e.paseando = true; }, enDron: () => e.enDron, ponDron: (on: boolean) => { e.enDron = on; },
    VRX: () => ({ on: vr }), vrFundido: (fn: () => void) => { fn(); return true; }, vrAparece: (x: number, y: number, ang?: number | null) => { e.aparecidos.push([x, y, ang]); },
    gm: () => ({ suelo: () => 2, dentro: () => true, obstaculo: (x: number, y: number, r: number) => (Math.hypot(x, y) < r ? { x: r, y: 0 } : null) }),
    documento: { createElement: () => ({ style: {}, setAttribute() { /* doble */ } }) }, ventana
  };
  return { api: creaLlegada(d), d, e, scene, lienzo, boton, ventana, hijos };
}

describe("llegada", () => {
  it("en pantalla, aparecer deja a quien pasea en el punto, fuera del tronco, y la cámara de seguimiento detrás", () => {
    const m = monta();
    m.api.aparece(0.1, 0, 0);
    expect(m.e.paseando).toBe(true); expect(m.d.pp.x).toBeCloseTo(0.55); expect(m.d.pp.y).toBeCloseTo(0);
    expect(m.d.camPos.y).toBeCloseTo(2 + 2.3); expect(m.d.camPos.z).toBeCloseTo(4.4);
  });
  it("en VR, el salto lo hace la VR (vrAparece), ya apartado del tronco", () => {
    const m = monta(true);
    m.api.aparece(0.1, 0, 1.2);
    expect(m.e.aparecidos).toEqual([[0.55, 0, 1.2]]);
  });
  it("un rayo hacia el suelo pone el anillo; borra() lo quita", () => {
    const m = monta();
    const q = m.api.apunta(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, -1).normalize(), new THREE.Vector3(0, 10, 0), null);
    expect(q).not.toBeNull(); expect(m.api.anillo.visible).toBe(true);
    m.api.borra(); expect(m.api.anillo.visible).toBe(false);
  });
  it("libera() quita el anillo de la escena con su geometría y su material, el velo y todas las escuchas; monta() los vuelve a poner", () => {
    const m = monta(), sueltos: string[] = [];
    expect(m.scene.children).toContain(m.api.anillo); expect(m.hijos.length).toBe(1);
    expect(m.d.Materiales.duenos()["anillo-llegada"]).toBe(1);   // el material del anillo, de la fábrica con su dueño
    expect(m.lienzo.n).toBe(4); expect(m.boton.n).toBe(1); expect(m.ventana.n).toBe(1);
    m.api.anillo.geometry.addEventListener("dispose", () => sueltos.push("geo")); m.api.anillo.material.addEventListener("dispose", () => sueltos.push("mat"));
    m.api.libera();
    expect(sueltos.sort()).toEqual(["geo", "mat"]); expect(m.scene.children).not.toContain(m.api.anillo); expect(m.hijos.length).toBe(0);
    expect(m.lienzo.n + m.boton.n + m.ventana.n).toBe(0); expect(m.ventana.__llegada).toBeUndefined();
    m.api.monta(); expect(m.scene.children).toContain(m.api.anillo); expect(m.hijos.length).toBe(1);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoLlegada(monta().api);
    expect(c.id).toBe(ID_LLEGADA); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

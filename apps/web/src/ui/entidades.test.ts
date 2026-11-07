// Entidades y usables (A3-7a, MU5-n; antes 02e_entidades.js), con el three de verdad y dobles del DOM (prueba-dom.ts): elegir algo con posición pinta su ficha común en
// #ficha y pone el anillo; la × cierra; el componente es de todos los mundos y su libera() suelta el anillo (geometría y material), la × de la ficha, el observador de
// #ficha y la caja de acciones. La selección y el registro los prueba pruebas/guardianes/entidades.test.js. HONESTIDAD: sin navegador ni GPU; en el Quest, NO probado.
import { afterEach, describe, expect, it } from "vitest";
import { ID_USABLES, creaEntidades, manifiestoEntidades } from "./entidades.ts";
import { creaMundo, type Mundo } from "./prueba-dom.ts";
import { creaMateriales } from "../nucleo/materiales.ts";
import type { ThreeMin } from "../nucleo/materiales.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const THREE: A = await import(/* @vite-ignore */ "three" as string);

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
function monta() {
  m = creaMundo();
  const d = m.documento, ficha = m.el("div", "ficha"), scene = new THREE.Scene(), eventos: string[] = [];
  for (const [t, id] of [["h3", "fichaTitulo"], ["dl", "fichaDatos"], ["button", "cerrarFicha"]]) ficha.appendChild(m.el(t!, id));
  ficha.hidden = true; d.body.appendChild(ficha);
  const Materiales = creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" });
  const E = creaEntidades({ $: (id: string) => d.getElementById(id), THREE, Materiales, Bus: { emite: (ev: string) => { eventos.push(ev); return 0; } }, scene, lienzo: null, pp: { x: 0, y: 0 }, dr: { x: 0, y: 0 },
    enDron: false, paseando: false, VRX: { on: false }, ventana: m.ventana, documento: d });
  E.Entidades.registra({ tipo: "olivo", dueno: "prueba", prioridad: 1, ficha: (id: string) => ({ titulo: "Olivo " + id, filas: [{ k: "Copa", v: "4 m" }], acciones: [{ id: "ir", txt: "Ir", fn: () => true }] }),
    pos: () => ({ x: 1, y: 0, z: 2 }), existe: () => true, lista: () => [] });
  return { E, m, d, ficha, scene, eventos, Materiales };
}

describe("entidades y usables", () => {
  it("elegir pinta la ficha común con sus acciones y pone el anillo; la × cierra y suelta", () => {
    const { E, d, ficha, scene, eventos } = monta();
    expect(E.Usables.elige("olivo:a", "toque")).toBe(true);
    expect(ficha.hidden).toBe(false); expect(d.getElementById("fichaTitulo").textContent).toBe("Olivo olivo:a"); expect(d.getElementById("fichaAcciones")).not.toBe(null);
    expect(scene.children.length).toBe(1); expect(eventos).toContain("usable:elige");
    d.getElementById("cerrarFicha").click(); expect(ficha.hidden).toBe(true); expect(E.Usables.elegido()).toBe(null);
  });
  it("libera() suelta el anillo, la × de la ficha, el observador de #ficha y la caja de acciones", () => {
    const { E, m, d, scene } = monta();
    E.Usables.elige("olivo:a", "toque"); expect(m.observadores()).toBe(1); expect(m.escuchas()).toBe(2);
    const c = manifiestoEntidades(E); c.libera({} as never);
    expect(scene.children.length).toBe(0); expect(m.observadores()).toBe(0); expect(d.getElementById("cerrarFicha")._escuchas.click.length).toBe(0); expect(d.getElementById("fichaAcciones")).toBe(null);   // la escucha de la caja de acciones se va con la caja
  });
  it("el material del anillo es de la fábrica, con dueño «seleccion-usables», y libera() no deja nada suyo (segundo commit)", () => {
    const { E, Materiales } = monta();
    E.Usables.elige("olivo:a", "toque"); expect(Materiales.duenos()[ID_USABLES]).toBe(1);
    E.Usables.libera(); expect(Materiales.duenos()[ID_USABLES] || 0).toBe(0);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoEntidades(monta().E);
    expect(c.id).toBe(ID_USABLES); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

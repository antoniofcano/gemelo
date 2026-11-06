// Las capas del mundo (A3-7a, MU5-n; antes 32b_capas.js). Con dobles del DOM (prueba-dom.ts): registrar pone la casilla en su grupo y la enciende si viene
// activa; quitarla la apaga y la saca; libera() saca todas las que quedan y no deja escuchas. HONESTIDAD: sin navegador, sin estilos ni maquetación.
import { afterEach, describe, expect, it } from "vitest";
import { CapasPuro, ID_CAPAS, creaCapas, manifiestoCapas } from "./capas.ts";
import { creaMundo, type Mundo } from "./prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
function monta() {
  m = creaMundo();
  const v = m.el("section", "ventanaCapas"), h = m.el("h3"), g = m.el("div"), cu = m.el("div");
  h.textContent = "Datos"; cu.className = "cuerpo"; v.appendChild(h); v.appendChild(g); v.appendChild(cu); m.documento.body.appendChild(v);
  const C = creaCapas({ $: (id: string) => m!.documento.getElementById(id), documento: m.documento });
  return { C, g, m };
}

describe("capas del mundo", () => {
  it("la procedencia es obligatoria (regla 5)", () => {
    expect(CapasPuro.valida({ id: "a", nombre: "A", procedencia: "medido", alterna() { /* nada */ } })).toEqual([]);
    expect(CapasPuro.valida({ id: "a", nombre: "A", alterna() { /* nada */ } }).length).toBe(1);
  });
  it("registrar pone la casilla en «Datos» y la enciende si viene activa; quitarla la apaga y la saca", () => {
    const { C, g } = monta(), on: boolean[] = [];
    const q = C.registra({ id: "uno", nombre: "Uno", procedencia: "deducido", activa: true, alterna: (v: boolean) => on.push(v) });
    expect(g.children.length).toBe(1); expect(on).toEqual([true]); expect(C.lista()[0].activa).toBe(true);
    q(); expect(g.children.length).toBe(0); expect(on).toEqual([true, false]); expect(C.lista()).toEqual([]);
  });
  it("libera() saca todas las casillas (apagando las encendidas) y no deja escuchas", () => {
    const { C, g, m } = monta(), on: boolean[] = [];
    C.registra({ id: "uno", nombre: "Uno", procedencia: "medido", activa: true, alterna: (v: boolean) => on.push(v) });
    C.registra({ id: "dos", nombre: "Dos", procedencia: "ilustrativo", alterna: () => { /* nada */ } });
    expect(m.escuchas()).toBe(2);
    C.libera();
    expect(g.children.length).toBe(0); expect(on).toEqual([true, false]); expect(m.escuchas()).toBe(0); expect(C.lista()).toEqual([]);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoCapas(monta().C);
    expect(c.id).toBe(ID_CAPAS); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

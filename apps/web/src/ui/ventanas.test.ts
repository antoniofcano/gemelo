// Las ventanas (A3-7a, MU5-n; antes 32_ventanas.js). Con dobles del DOM (prueba-dom.ts): abrir una ventana la enseña y marca su icono, una grande a la vez;
// registrar una crea su sección con su ×; libera() cierra la abierta, saca la registrada y no deja escuchas ni observadores. HONESTIDAD: sin maquetación ni foco de
// verdad; el foco que vuelve a quien abrió, el teclado y las formas de pantalla se miran en el banco (ux_ventanas_chrome).
import { afterEach, describe, expect, it } from "vitest";
import { ID_VENTANAS, VentanasPuro, creaVentanas, manifiestoVentanas } from "./ventanas.ts";
import { creaMundo, type Mundo } from "./prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
function monta() {
  m = creaMundo();
  const d = m.documento, visor = m.el("div", "visor"), hud = m.el("div", "hud"), ico = m.el("button");
  ico.setAttribute("data-abre", "mapa"); ico.setAttribute("aria-expanded", "false"); hud.appendChild(ico); d.body.appendChild(hud); d.body.appendChild(visor);
  for (const id of ["ventanaMapa", "ventanaAyuda"]) {
    const v = m.el("section", id), h = m.el("h2"), x = m.el("button"); v.className = "ventana"; v.hidden = true; x.setAttribute("data-cierra", "");
    v.appendChild(h); v.appendChild(x); visor.appendChild(v);
  }
  const V = creaVentanas({ $: (id: string) => d.getElementById(id), lienzo: m.el("canvas"), visor, paseando: false, Movibles: null, ventana: m.ventana, documento: d });
  return { V, m, d, ico, visor };
}

describe("ventanas", () => {
  it("lo puro sigue igual: la forma según el visor y la pestaña siguiente", () => {
    expect(VentanasPuro.forma(400, 800)).toBe("hoja"); expect(VentanasPuro.forma(1000, 400)).toBe("alto"); expect(VentanasPuro.forma(1200, 800)).toBe("lateral");
    expect(VentanasPuro.pestanaSig("ArrowRight", 2, 3)).toBe(0);
  });
  it("abrir enseña la ventana y marca su icono; cerrar la esconde", () => {
    const { V, d, ico } = monta();
    expect(V.abre("mapa", null)).toBe(true); expect(d.getElementById("ventanaMapa").hidden).toBe(false); expect(ico.getAttribute("aria-expanded")).toBe("true");
    expect(V.abierta()).toBe("mapa"); V.cierra(); expect(d.getElementById("ventanaMapa").hidden).toBe(true); expect(V.abierta()).toBe(null);
  });
  it("libera() cierra la abierta, saca las registradas y no deja escuchas ni observadores", () => {
    const { V, m, d } = monta();
    const q = V.registra("oficina", { titulo: "Oficina", construye() { /* nada */ } }); expect(q).toBeTypeOf("function"); expect(d.getElementById("ventana-oficina")).not.toBe(null);
    V.abre("oficina", null); expect(m.escuchas()).toBeGreaterThan(0);
    V.libera();
    expect(V.abierta()).toBe(null); expect(d.getElementById("ventana-oficina")).toBe(null); expect(m.escuchas()).toBe(0); expect(m.observadores()).toBe(0);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoVentanas(monta().V);
    expect(c.id).toBe(ID_VENTANAS); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

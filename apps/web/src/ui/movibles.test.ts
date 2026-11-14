// Las ventanas flotantes (A3-7a, MU5-n; antes 34_movibles.js). Con dobles del DOM (prueba-dom.ts): montar escucha la ventana y observa el visor; hacer movible una
// ventana engancha su asa; «Llevar a…» crea su menú; libera() lo quita todo (escuchas, observador, menú, aviso y fotograma pendiente). El cálculo del sitio libre
// lo prueba pruebas/guardianes/movibles.test.js (MoviblesPuro). HONESTIDAD: sin maquetación (los rectángulos miden 0) ni dedos: el arrastre, en el banco.
import { afterEach, describe, expect, it } from "vitest";
import { ID_MOVIBLES, MoviblesPuro, creaMovibles, manifiestoMovibles } from "./movibles.ts";
import { creaMundo, type Mundo } from "./prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
function monta() {
  m = creaMundo();
  const visor = m.el("div", "visor"); m.documento.body.appendChild(visor);
  const avisos: string[] = [];
  const M = creaMovibles({ visor, Hud: { zonasProhibidas: () => [], aviso: (t: string) => avisos.push(t) }, ventana: m.ventana, documento: m.documento });
  return { M, visor, m, avisos };
}

describe("ventanas flotantes", () => {
  it("lo puro sigue igual: el sitio libre aparta de una zona", () => {
    const q = MoviblesPuro.libre({ w: 100, h: 50 }, 10, 10, [{ x: 0, y: 0, w: 200, h: 100 }], 800, 600);
    expect(q.libre).toBe(true); expect(MoviblesPuro.seCruzan({ x: q.x, y: q.y, w: 100, h: 50 }, { x: 0, y: 0, w: 200, h: 100 })).toBe(false);
  });
  it("libera() quita las escuchas de la ventana, del asa y del menú, desconecta el observador y saca el menú", () => {
    const { M, visor, m } = monta();
    expect(m.escuchas()).toBe(2); expect(m.observadores()).toBe(1);   // resize y orientationchange; el visor
    const caja = m.el("div"), asa = m.el("div"), boton = m.el("button"); visor.appendChild(caja); caja.appendChild(asa);
    const mov = M.hazMovible(caja, asa, "chat", null, {}); const menu = mov.menuLlevar(boton);
    expect(menu.parentNode).toBe(caja); expect(m.escuchas()).toBeGreaterThan(9);
    M.revisa(); M.libera();
    expect(m.escuchas()).toBe(0); expect(m.observadores()).toBe(0); expect(menu.parentNode).toBe(null); expect(m.relojes()).toBe(0);
  });
  it("L6-05: con la columna del estado (#hudEstado) en la página, también la observa (entra la caja de la voz → se aparta el chat); libera() la suelta", () => {
    m = creaMundo();
    const visor = m.el("div", "visor"), estado = m.el("div", "hudEstado"); m.documento.body.appendChild(visor); visor.appendChild(estado);
    const M = creaMovibles({ visor, Hud: { zonasProhibidas: () => [], aviso: () => undefined }, ventana: m.ventana, documento: m.documento });
    expect(m.observadores()).toBe(2);   // el visor y la columna del estado
    M.libera(); expect(m.observadores()).toBe(0);
  });
  it("un cambio de tamaño pide una revisión en el fotograma siguiente; libera() la cancela", () => {
    const { M, m } = monta();
    m.ventana.dispatchEvent({ type: "resize" }); expect(m.relojes()).toBe(1);
    M.libera(); expect(m.relojes()).toBe(0);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoMovibles(monta().M);
    expect(c.id).toBe(ID_MOVIBLES); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

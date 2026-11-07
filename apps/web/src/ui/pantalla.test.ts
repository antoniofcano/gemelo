// El menú y la pantalla completa (A3-7a, MU5-n; antes la primera mitad de 24_pantalla.js). Con dobles del DOM (prueba-dom.ts): ☰ abre el <dialog> en su pestaña, Volver
// lo cierra; ⛶ sin Fullscreen API avisa (el caso del iPhone) en vez de fallar; libera() cierra el menú y quita todas sus escuchas. HONESTIDAD: sin navegador no hay
// Fullscreen API, ni Keyboard Lock, ni foco de verdad; en el iPhone y en el Quest, NO probado.
import { afterEach, describe, expect, it } from "vitest";
import { ID_MENU_PANTALLA, creaPantalla, manifiestoPantalla } from "./pantalla.ts";
import { creaMundo, type Mundo } from "./prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
function monta() {
  m = creaMundo();
  const d = m.documento, dlg = m.el("dialog", "menu"), lista = m.el("div", "menuPestanas"), avisos: string[] = [];
  for (const [id, p] of [["menuPestAjustes", "pA"], ["menuPestCreditos", "pC"]]) {
    const t = m.el("button", id); t.setAttribute("role", "tab"); t.setAttribute("aria-controls", p); lista.appendChild(t); dlg.appendChild(m.el("div", p));
  }
  dlg.appendChild(lista); d.body.appendChild(dlg);
  for (const id of ["menuVolver", "menuAereo", "bMenu", "hudAtrib", "btnPantalla", "btnPaseo"]) d.body.appendChild(m.el("button", id));
  const P = creaPantalla({ $: (id: string) => d.getElementById(id), paseando: false, Hud: { aviso: (t: string) => avisos.push(t) }, tamano() { /* doble */ }, ventana: m.ventana, documento: d });
  return { P, m, d, dlg, avisos };
}

describe("menú y pantalla completa", () => {
  it("☰ abre el menú en la pestaña elegida; Volver lo cierra", () => {
    const { P, d, dlg } = monta();
    d.getElementById("bMenu").click(); expect(dlg.open).toBe(true); expect(P.Menu.abierto()).toBe(true);
    P.Menu.abre("creditos"); expect(d.getElementById("menuPestCreditos").getAttribute("aria-selected")).toBe("true"); expect(d.getElementById("pA").hidden).toBe(true);
    d.getElementById("menuVolver").click(); expect(P.Menu.abierto()).toBe(false);
  });
  it("⛶ sin Fullscreen API avisa (como en el iPhone) en vez de fallar", () => {
    const { d, avisos } = monta();
    d.getElementById("btnPantalla").click(); expect(avisos.length).toBe(1); expect(avisos[0]).toMatch(/Añadir a pantalla de inicio/);
  });
  it("libera() cierra el menú y quita todas sus escuchas", () => {
    const { P, m } = monta();
    P.Menu.abre(); expect(m.escuchas()).toBeGreaterThan(5);
    P.libera(); expect(P.Menu.abierto()).toBe(false); expect(m.escuchas()).toBe(0);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoPantalla(monta().P);
    expect(c.id).toBe(ID_MENU_PANTALLA); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

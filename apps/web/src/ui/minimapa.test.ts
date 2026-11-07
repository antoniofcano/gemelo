// El minimapa (A3-7a, MU5-n; antes 17_minimapa.js). Con dobles del DOM (prueba-dom.ts) y un lienzo 2D de mentira: monta su ventana flotante alrededor de #mapita; al
// pasear se ve y pinta (la ortofoto la pide a Mundo.pintaOrto, las capas de otros en orden); M lo pliega; libera() quita sus escuchas y devuelve #mapita a su sitio.
// Es solo del exterior. El rastro lo prueban bucle_equivalencia2.test.js y sin_reservas.test.js. HONESTIDAD: no se dibuja de verdad; en el iPhone, NO probado.
import { afterEach, describe, expect, it } from "vitest";
import { ID_MINIMAPA, creaMinimapa, manifiestoMinimapa } from "./minimapa.ts";
import { creaMundo, type Mundo } from "./prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
function monta() {
  m = creaMundo();
  const d = m.documento, casa = m.el("div"), cv = m.el("canvas", "mapita"), estado = { paseando: false, ortos: 0, capas: [] as number[] };
  casa.appendChild(cv); d.body.appendChild(casa);
  const deps = { $: (id: string) => d.getElementById(id), D: { parcelas: [] }, x0: 0, yN: 100, ANCHO: 200, ALTO: 100, Mundo: { pintaOrto: () => { estado.ortos++; } }, cIn: [],
    Entidades: { lista: () => null }, Usables: { usa() { /* doble */ } }, pp: { x: 10, y: 10, ang: 0 }, dr: { x: 0, y: 0, yaw: 0 },
    get paseando() { return estado.paseando; }, enQuad: false, enDron: false, avisoBaliza() { /* doble */ }, dibujaBalizasMini() { /* doble */ }, Movibles: null, ventana: m.ventana, documento: d };
  const U = creaMinimapa(deps);
  return { U, m, d, casa, cv, estado };
}

describe("minimapa", () => {
  it("monta su ventana flotante alrededor de #mapita; al pasear se ve y pinta, con las capas en orden", () => {
    const { U, casa, cv, estado } = monta();
    const wrap = casa.children[0]; expect(wrap.id).toBe("mapaFlotante"); expect(cv.parentNode).toBe(wrap);
    U.Minimapa.capa(() => estado.capas.push(2), 2); U.Minimapa.capa(() => estado.capas.push(1), 1);
    U.actualizaMinimapa(0.1); expect(wrap.hidden).toBe(true);
    estado.paseando = true; U.actualizaMinimapa(0.1); expect(wrap.hidden).toBe(false); expect(estado.ortos).toBe(1); expect(estado.capas).toEqual([1, 2]);
  });
  it("M pliega el minimapa al pasear (y lo recuerda en el almacén)", () => {
    const { m, cv, estado } = monta(); estado.paseando = true;
    m.ventana.dispatchEvent({ type: "keydown", code: "KeyM", target: {}, preventDefault() { /* doble */ } });
    expect(cv.hidden).toBe(true); expect(m.ventana.localStorage.getItem("gemelo.minimapa")).toBe("oculto");
  });
  it("libera() quita sus escuchas, cancela el enganche a Movibles, olvida las capas y devuelve #mapita a su sitio", () => {
    const { U, m, casa, cv } = monta();
    U.Minimapa.capa(() => { /* nada */ }); expect(m.escuchas()).toBe(4); expect(m.relojes()).toBe(1);
    U.libera();
    expect(m.escuchas()).toBe(0); expect(m.relojes()).toBe(0); expect(U.Minimapa.cuantas()).toBe(0); expect(cv.parentNode).toBe(casa); expect(casa.children.length).toBe(1);
  });
  it("el componente es solo del exterior y solo de ciclo de vida", () => {
    const c = manifiestoMinimapa(monta().U);
    expect(c.id).toBe(ID_MINIMAPA); expect(c.mundos).toEqual(["exterior"]); expect(c.fases).toEqual({});
  });
});

// El HUD (A3-7a, MU5-n; antes 31_hud.js). Con dobles del DOM (prueba-dom.ts): montado arranca sus dos relojes (estado a 4 Hz y brújula a 10 Hz) y escucha el
// teclado, el documento y la media query; un aviso sale en #hudAvisos; un icono registrado entra en la barra; libera() para los relojes (L2-11), quita las escuchas
// y el observador y saca los iconos y los avisos. El mapa de teclas y el orden de Esc los prueban ux_hud.test.js y ux_teclas.test.js (HudPuro).
// HONESTIDAD: sin maquetación, sin CSS y sin foco de verdad; las zonas, los pulgares y la brújula de verdad, en el banco. En el iPhone y el Quest, NO probado.
import { afterEach, describe, expect, it } from "vitest";
import { HudPuro, ID_HUD, creaHud, manifiestoHud } from "./hud.ts";
import { creaMundo, type Mundo } from "./prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
class V3 { x = 0; y = 0; z = -1; }
function monta() {
  m = creaMundo();
  const d = m.documento, hud = m.el("div", "hud"), barra = m.el("div", "hudBarra"), avisos = m.el("div", "hudAvisos"), mas = m.el("button", "bMas"), hMas = m.el("div", "hudMas");
  barra.appendChild(mas); hud.appendChild(barra); hud.appendChild(hMas); hud.appendChild(avisos); d.body.appendChild(hud);
  const visor = m.el("div", "visor"); d.body.appendChild(visor);
  const camera = { getWorldDirection: (v: V3) => v };
  const H = creaHud({ $: (id: string) => d.getElementById(id), Bus: { emite() { return 0; } }, THREE: { Vector3: V3 }, lienzo: m.el("canvas"), visor, camera, orb: { az: 0 }, pp: { ang: 0 }, dr: { yaw: 0 },
    VRX: { on: false }, ponQuad() { /* doble */ }, ponDron() { /* doble */ }, paseando: false, enQuad: false, enDron: false, Ventanas: null, Ajustes: null, Movibles: null, Menu: null,
    ventana: m.ventana, documento: d });
  return { H, m, d, barra, avisos };
}

describe("HUD", () => {
  it("lo puro sigue igual: el modo, el rumbo y las teclas", () => {
    expect(HudPuro.modoDe(true, false, true)).toBe("dron"); expect(HudPuro.rumboCamara(1, 0)).toBe(90);
    expect(HudPuro.accionTecla({ code: "Digit1" }, {})).toBe("v:mapa"); expect(HudPuro.ordenEsc({})).toBe("menu");
  });
  it("arranca sus dos relojes y sus escuchas; un aviso y un icono entran en su sitio", () => {
    const { H, m, barra, avisos } = monta();
    expect(m.intervalos().length).toBe(2); expect(m.escuchas()).toBeGreaterThan(2);
    H.aviso("hola", 1000); expect(avisos.children.length).toBe(1);
    const q = H.icono({ id: "juegos", ico: "🎲", txt: "Juegos" }); expect(barra.children.length).toBe(2);
    q(); expect(barra.children.length).toBe(1);
  });
  it("libera() para los relojes (L2-11), quita las escuchas y el observador y saca iconos y avisos", () => {
    const { H, m, barra, avisos } = monta();
    H.aviso("hola", 1000); H.icono({ id: "juegos", ico: "🎲", txt: "Juegos" });
    m.avanza();   // el setTimeout de «tras montar todos los módulos» (sin Ajustes no se suscribe a nada)
    H.libera();
    expect(m.intervalos().length).toBe(0); expect(m.escuchas()).toBe(0); expect(m.observadores()).toBe(0);
    expect(barra.children.length).toBe(1); expect(avisos.children.length).toBe(0);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoHud(monta().H);
    expect(c.id).toBe(ID_HUD); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

// Lo tuyo en pantalla (A3-7a, MU5-n; antes 31b_hud_personal.js). Con dobles del DOM (prueba-dom.ts): sin #hudPersonal no hace nada; con él, pinta la hora y escucha sus
// cuatro botones y «voz:estado»; libera() para su reloj de 500 ms (L2-11), quita las escuchas y se borra del Bus. Los textos los prueba ux_hud_personal.test.js.
// HONESTIDAD: sin CSS ni maquetación; en el iPhone y en el Quest, NO probado.
import { afterEach, describe, expect, it } from "vitest";
import { HudPersonalPuro, ID_HUD_PERSONAL, creaHudPersonal, manifiestoHudPersonal } from "./hud-personal.ts";
import { creaMundo, type Mundo } from "./prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
function monta(conCaja = true) {
  m = creaMundo();
  const d = m.documento, ids = ["hudPersonal", "hpHora", "hpHaza", "hpHablar", "hpVolver", "hpHoraT", "hpHazaT", "hpHablarT"];
  if (conCaja) for (const id of ids) d.body.appendChild(m.el(id.endsWith("T") ? "span" : "button", id));
  const oy: Record<string, Array<(e: unknown) => void>> = {};
  const Bus = { on: (ev: string, f: (e: unknown) => void) => { (oy[ev] = oy[ev] || []).push(f); return () => { oy[ev] = oy[ev]!.filter(x => x !== f); }; }, emite() { return 0; } };
  const api = creaHudPersonal({ $: (id: string) => d.getElementById(id), Bus, Hazas: { enPunto: () => null, estado: () => ({ activo: false }) }, horaMundoTexto: () => "10:30",
    objetivo: { x: 0, z: 0 }, pp: { x: 0, y: 0 }, Usables: { elige() { /* doble */ }, mensaje() { /* doble */ } }, Hud: { modo: () => "aereo", alterna() { /* doble */ }, alInicio() { /* doble */ } }, paseando: false });
  return { api, m, d, oy };
}

describe("lo tuyo en pantalla", () => {
  it("lo puro sigue igual: la hora y hablar", () => {
    expect(HudPersonalPuro.hora("10:30").texto).toBe("10:30"); expect(HudPersonalPuro.hora("x").texto).toBe("--:--");
    expect(HudPersonalPuro.hablar(null).visible).toBe(false);
  });
  it("sin #hudPersonal no hace nada (y su libera() tampoco rompe)", () => {
    const { api, m } = monta(false); expect(m.relojes()).toBe(0); expect(m.escuchas()).toBe(0); expect(() => api.libera()).not.toThrow();
  });
  it("pinta la hora, escucha sus botones y la voz; libera() para el reloj (L2-11), quita las escuchas y se borra del Bus", () => {
    const { api, m, d, oy } = monta();
    expect(d.getElementById("hpHoraT").textContent).toBe("10:30"); expect(m.intervalos().length).toBe(1); expect(m.escuchas()).toBe(4); expect(oy["voz:estado"]!.length).toBe(1);
    api.libera();
    expect(m.intervalos().length).toBe(0); expect(m.escuchas()).toBe(0); expect(oy["voz:estado"]!.length).toBe(0);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoHudPersonal(monta().api);
    expect(c.id).toBe(ID_HUD_PERSONAL); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

// Las fichas en el mundo (EV2-A1; MU5-n, A3-7b1: antes apps/web/motor/51_fichas_mundo.js). Lo puro y el componente con láminas de mentira los cubre el guardián de Node
// (pruebas/guardianes/fichas_mundo.test.js); aquí, con Vitest, el manifiesto y el CICLO DE VIDA con dependencias de mentira: el componente es del exterior y está apagado por defecto,
// la fase «tarde» se llama como la llama el bucle (dt, t, api) y libera() quita el presentador y la tapa, cierra las láminas colgadas y borra window.__fichasMundo.
// HONESTIDAD: sin GPU ni casco; cómo se ve y se apunta la ficha en un Quest, en el banco (no probado).
import { afterEach, describe, expect, it } from "vitest";
import { FichasMundoPuro, ID_FICHAS_MUNDO, manifiestoFichasMundo } from "./fichas-mundo.ts";
import { creaMundo, type Mundo } from "../../nucleo/prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });

function monta() {
  m = creaMundo();
  const reg = { cerradas: [] as string[], presentadores: 0, tapas: 0, quitadoP: 0, quitadoT: 0 };
  const dp = {
    Laminas: { abre: () => true, cierra: (id: string) => { reg.cerradas.push(id); return true; }, info: () => ({ pos: [0, 0, 0], w: 1, h: 1 }), repinta: () => true },
    Entidades: { de: () => null, existe: () => false, pos: () => null, ficha: () => null },
    Usables: { presentador: () => { reg.presentadores++; return () => { reg.quitadoP++; }; }, abierta: () => null, elegido: () => null },
    PanelVR: { tapa: () => { reg.tapas++; return () => { reg.quitadoT++; }; } }, VRX: { on: false, cab: { x: 0, y: 1.6, z: 0 } }, camera: { matrixWorld: { elements: new Array(16).fill(0) } }
  };
  const c = manifiestoFichasMundo(dp);
  const api = c.monta({} as never) as { tarde(): void; vivas(): string[]; cierra(): void };
  return { c, api, reg, m };
}

describe("fichas del mundo: ciclo de vida", () => {
  it("el manifiesto es del exterior, apagado por defecto (?ui=capas) y con una fase «tarde» a 0,5 s", () => {
    const { c } = monta();
    expect(c.id).toBe(ID_FICHAS_MUNDO); expect(c.mundos).toEqual(["exterior"]); expect(c.bandera).toEqual({ defecto: false, url: "ui", valor: "capas" });
    expect(c.fases).toEqual({ tarde: 0.5 }); expect(c.presupuesto).toEqual({ llamadas: 3, triangulos: 6, texturasMB: 5 });
  });
  it("la fase «tarde» se declara como la llama el bucle: fn(dt, t, api)", () => {
    const { c } = monta(); let veces = 0;
    c.actualiza!.tarde!(0.5, 10, { tarde: () => { veces++; } } as never); expect(veces).toBe(1);
    expect(() => c.actualiza!.tarde!(0.5, 10, null as never)).not.toThrow();
  });
  it("montar engancha el presentador de «vr» y la tapa del panel; libera() los quita y borra window.__fichasMundo", () => {
    const { c, api, reg, m } = monta();
    expect(reg.presentadores).toBe(1); expect(reg.tapas).toBe(1); expect(typeof m.ventana.__fichasMundo).toBe("function");
    c.libera(api);
    expect([reg.quitadoP, reg.quitadoT]).toEqual([1, 1]); expect(m.ventana.__fichasMundo).toBeUndefined();
    c.libera(null);   // sin api, nada
  });
  it("diez montajes y liberaciones no dejan presentadores ni tapas sin quitar", () => {
    for (let i = 0; i < 10; i++) { const { c, api, reg, m } = monta(); c.libera(api); expect([reg.quitadoP, reg.quitadoT]).toEqual([reg.presentadores, reg.tapas]); expect(m.ventana.__fichasMundo).toBeUndefined(); m.limpia(); }
    m = null;
  });
  it("lo puro: solo se cuelgan el olivo y la baliza; la ficha cabe en el lienzo y se cierra con «Cerrar»", () => {
    expect(FichasMundoPuro.maneja("olivo")).toBe(true); expect(FichasMundoPuro.maneja("baliza")).toBe(true); expect(FichasMundoPuro.maneja("persona")).toBe(false);
    const mq = FichasMundoPuro.maqueta({ titulo: "Olivo 12", lineas: ["Una línea"], acciones: [{ id: "a", txt: "Abrir" }] }, (t: string) => t.length * 10);
    expect(mq.h).toBeLessThanOrEqual(FichasMundoPuro.HMAX); expect(mq.botones[mq.botones.length - 1].cerrar).toBe(true);
  });
});

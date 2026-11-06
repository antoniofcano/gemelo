// El fundido del gestor de mundos en pantalla y en VR (MU2-3), con un documento y un temporizador de mentira. Sin DOM de verdad.
import { describe, expect, it } from "vitest";
import { FUNDIDO_S, creaFundidoPantalla } from "./fundido.ts";
import type { ElementoVelo } from "./fundido.ts";

function monta(vrActiva = false) {
  const creados: ElementoVelo[] = [], colgados: ElementoVelo[] = [], pend: Array<{ fn: () => void; ms: number }> = [], vr: string[] = [];
  const d = creaFundidoPantalla({
    documento: { createElement: () => { const e = { style: { cssText: "", opacity: "" }, setAttribute() {} }; creados.push(e); return e; } },
    contenedor: { appendChild: (e) => { colgados.push(e); } },
    vr: { activa: () => vrActiva, cierra: () => { vr.push("cierra"); return Promise.resolve(); }, abre: () => { vr.push("abre"); return Promise.resolve(); } },
    temporizador: (fn, ms) => { pend.push({ fn, ms }); return 0; },
  });
  return { d, creados, colgados, pend, vr, pasa: () => { for (const p of pend.splice(0)) p.fn(); } };
}

describe("creaFundidoPantalla", () => {
  it("no toca el documento hasta el primer cierra()", () => {
    const m = monta(); expect(m.creados.length).toBe(0);
  });
  it("en pantalla, cierra() pone el velo opaco, se cumple a los 0,15 s y se QUEDA opaco hasta abre()", async () => {
    const m = monta(); let hecho = false;
    const p = m.d.cierra().then(() => { hecho = true; });
    expect(m.creados.length).toBe(1); expect(m.colgados.length).toBe(1);
    expect(m.creados[0]?.style.opacity).toBe("1"); expect(m.pend[0]?.ms).toBeCloseTo(FUNDIDO_S * 1000, 6);
    expect(hecho).toBe(false); m.pasa(); await p; expect(hecho).toBe(true);
    expect(m.creados[0]?.style.opacity).toBe("1");
    const a = m.d.abre(); expect(m.creados[0]?.style.opacity).toBe("0"); m.pasa(); await a;
    expect(m.creados.length).toBe(1);   // un solo velo, reusado
  });
  it("abre() sin cierra() previo se cumple en el acto y no crea nada", async () => {
    const m = monta(); await m.d.abre(); expect(m.creados.length).toBe(0); expect(m.pend.length).toBe(0);
  });
  it("con una sesión de VR al cerrar, las dos mitades van por el velo de VR y el DOM no se toca", async () => {
    const m = monta(true);
    await m.d.cierra(); await m.d.abre();
    expect(m.vr).toEqual(["cierra", "abre"]); expect(m.creados.length).toBe(0);
  });
  it("sin documento ni contenedor, cierra() y abre() se cumplen sin fallar", async () => {
    const d = creaFundidoPantalla({ documento: null, contenedor: null, temporizador: () => 0 });
    await d.cierra(); await d.abre();
  });
});

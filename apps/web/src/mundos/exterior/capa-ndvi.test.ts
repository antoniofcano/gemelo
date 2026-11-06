// El componente «capa-ndvi» (MU5-n, A3-1a; antes 10b_capa_ndvi.js), con el registro de componentes de verdad (nucleo/componentes.ts) y la CanvasTexture de la
// three de verdad contada (creadas − liberadas, lo que en el navegador da renderer.info.memory.textures): montarlo, pintar dos fechas y liberarlo deja la cuenta
// como estaba y los uniformes del terreno como antes. La casilla, la leyenda y la gráfica con su DOM de mentira: pruebas/guardianes/componentes_c10d.test.js.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaNdvi } from "./ndvi.ts";
import { manifiestoCapaNdvi } from "./capa-ndvi.ts";
import type { ElementoMin } from "./capa-ndvi.ts";

type Clase = new (...a: unknown[]) => { dispose(): void };
const DATOS = [-32768, 200, 300, 400, 500, 600, 700, 800, 100, 200, 300, 400, 500, 600, 700, 900];

describe("capa-ndvi: montar y liberar deja las texturas como estaban", () => {
  it("cada fecha rehace la textura y suelta la anterior; libera() suelta la última y apaga los uniformes", async () => {
    const ruta = "three", T = (await import(/* @vite-ignore */ ruta)) as Record<string, Clase & { LinearFilter?: number }>;
    const vivas = new Set<unknown>();
    const Canvas = class extends (T["CanvasTexture"] as Clase) { constructor(...a: unknown[]) { super(...a); vivas.add(this); } override dispose(): void { vivas.delete(this); super.dispose(); } };
    const oy: Record<string, Array<(d: unknown) => void>> = {}, bus = { emite: (ev: string, d?: unknown) => { for (const f of oy[ev] || []) f(d); return (oy[ev] || []).length; } };
    const idx = { i: 1 }, N = creaNdvi({ D: { ndvi: { w: 4, h: 2, fechas: ["2026-03-01", "2026-09-15"], media: [0.45, 0.5], b64: "x" } }, b64: () => [], i16: () => Int16Array.from(DATOS), x0: 0, yN: 20, ANCHO: 40, ALTO: 20, idx: () => idx.i, bus });
    const dom: Record<string, ElementoMin> = {}, $ = (id: string): ElementoMin => (dom[id] = dom[id] || { checked: false, hidden: true, textContent: "", innerHTML: "", addEventListener() {}, removeEventListener() {} });
    const UN = { uNdviOn: { value: 0 }, uNdviMap: { value: null as unknown } };
    const lienzo = () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) });
    const M = manifiestoCapaNdvi(() => ({ THREE: { CanvasTexture: Canvas as never, LinearFilter: T["LinearFilter"] as unknown as number }, $, fmt: (v: number, d?: number) => v.toFixed(d), documento: { createElement: lienzo }, UN, NDV: N.NDV, idx: () => idx.i, rampa: N.rampa, pintaNdvi: N.pinta }));
    expect(ComponentesPuro.valida(M)).toEqual([]); expect(M.mundos).toEqual(["exterior"]);
    const antes = vivas.size, sueltas: Array<() => void> = [];
    const n = { id: "capa-ndvi", parametros: {}, limpia: <F,>(f: F): F => { sueltas.push(f as unknown as () => void); return f; }, emite: bus.emite, api: () => null,
      on: (ev: string, f: (d?: unknown) => void) => { (oy[ev] = oy[ev] || []).push(f); const q = () => { oy[ev] = (oy[ev] || []).filter((x) => x !== f); }; sueltas.push(q); return q; } };
    ($("cNdvi") as { checked: boolean }).checked = true;
    const api = M.monta(n) as { textura(): unknown };
    expect(vivas.size).toBe(antes + 1); expect(UN.uNdviOn.value).toBe(1); expect(UN.uNdviMap.value).toBe(api.textura());
    idx.i = 0; N.pinta();
    expect(vivas.size).toBe(antes + 1);   // la de la fecha anterior, suelta
    M.libera(api); for (const f of sueltas.splice(0)) f();
    expect(vivas.size).toBe(antes); expect(UN.uNdviOn.value).toBe(0); expect(UN.uNdviMap.value).toBeNull(); expect(($("bNdvi") as { hidden: boolean }).hidden).toBe(true);
    expect(bus.emite("ndvi:cambia", { lo: 0, hi: 1 })).toBe(0);   // ya nadie escucha
  });
});

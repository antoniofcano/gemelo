// El núcleo del NDVI del exterior (MU5-n, A3-1a; antes 10_ndvi.js): u8 → milésimas, la rampa, la escala de la fecha elegida con su aviso por el Bus y el
// NDVI relativo de un punto. La capa que lo pinta (capa-ndvi) y las casillas, en pruebas/guardianes/componentes_c10d.test.js (Node).
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaNdvi, rampa, u8aI16 } from "./ndvi.ts";

const DATOS = [-32768, 200, 300, 400, 500, 600, 700, 800, 100, 200, 300, 400, 500, 600, 700, 900];   // 4 × 2 celdas, dos fechas
function monta(idx: { i: number }) {
  const avisos: unknown[] = [];
  const N = creaNdvi({ D: { ndvi: { w: 4, h: 2, fechas: ["2026-03-01", "2026-09-15"], media: [0.45, 0.5], b64: "x" } }, b64: () => [], i16: () => Int16Array.from(DATOS),
    x0: 0, yN: 20, ANCHO: 40, ALTO: 20, idx: () => idx.i, bus: { emite: (ev, d) => { avisos.push([ev, d]); return 1; } } });
  return { N, avisos };
}

describe("el NDVI del exterior", () => {
  it("u8 → milésimas (0 = sin dato) y la rampa de siempre", () => {
    expect(Array.from(u8aI16([0, 1, 254]))).toEqual([-32768, -200, 1000]);
    expect(rampa(0)).toEqual([0.55, 0.29, 0.18]); rampa(1).forEach((v, i) => expect(v).toBeCloseTo([0.18, 0.49, 0.2][i] as number)); expect(rampa(2)).toEqual(rampa(1));
  });
  it("pinta() saca la escala (percentiles 5 y 95, sin las celdas sin dato) de la fecha elegida y avisa con «ndvi:cambia»; rel() la usa", () => {
    const idx = { i: 1 }, { N, avisos } = monta(idx);
    expect(N.rel(5, 15)).toBeCloseTo((0.1 - 0) / 1);   // antes de pintar, la escala de partida (0 a 1)
    N.pinta();
    expect(N.escala().lo).toBeCloseTo(0.1); expect(N.escala().hi).toBeCloseTo(0.9);
    expect(avisos).toEqual([["ndvi:cambia", { lo: N.escala().lo, hi: N.escala().hi }]]);
    expect(N.rel(5, 15)).toBeCloseTo(0);   // la celda (0, 0) de la segunda fecha vale 0,1: el extremo bajo
    idx.i = 0; N.pinta(); expect(N.escala().lo).toBeCloseTo(0.2);
    expect(N.rel(5, 15)).toBeNaN();   // L3-19: una celda sin dato no es un vigor «medio»: es NaN (el tinte no la pinta)
  });
  it("sin NDVI en el índice no hay datos y todo contesta con neutros; el componente es del exterior y su libera() vuelve a la escala de partida", () => {
    const N = creaNdvi({ D: {}, b64: () => [], i16: () => new Int16Array(0), x0: 0, yN: 0, ANCHO: 1, ALTO: 1, idx: () => 0, bus: { emite: () => 0 } });
    expect(N.NDV).toBeNull(); expect(N.rel(0, 0)).toBeNaN(); N.pinta();
    expect(ComponentesPuro.valida(N.componente)).toEqual([]); expect(N.componente.mundos).toEqual(["exterior"]);
    const { N: M } = monta({ i: 1 }); M.pinta(); M.componente.libera(null); expect(M.escala()).toEqual({ lo: 0, hi: 1 });
  });
});

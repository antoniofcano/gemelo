// El factor del radio de la copa (A3-8c; antes FACTOR_R8 y FACTOR_R8_GEN de 01_datos.js): los valores de código, la URL y el índice fijan los dos, y la
// configuración del servidor solo el de los olivos del constructor, salvo que mande la URL.
import { describe, expect, it } from "vitest";
import { creaFactorR8, leeFactorR8 } from "./factor-r8.ts";

const param = (cfg: number | undefined) => (_ruta: string, codigo: number, url: number | null) => url ?? cfg ?? codigo;

describe("factor del radio de la copa", () => {
  it("sin nada: 0,5 el nivel de siempre y 1 los del constructor; la configuración cambia solo el del constructor", () => {
    const F = creaFactorR8({ busqueda: "", D: {}, param: param(0.8) });
    expect(F.E).toEqual({ r8: 0.5, gen: 1 }); expect(F.url).toBe(null);
    expect(F.deConfig()).toBe(0.8); expect(F.E).toEqual({ r8: 0.5, gen: 0.8 });
  });
  it("?factorR8= fija los dos y manda sobre la configuración; el índice (D.config) fija los dos pero no manda", () => {
    const U = creaFactorR8({ busqueda: "?x=1&factorR8=0.7", D: { config: { factorR8: 0.9 } }, param: param(1.2) });
    expect(U.E).toEqual({ r8: 0.7, gen: 0.7 }); expect(U.url).toBe(0.7); expect(U.deConfig()).toBe(0.7);
    const I = creaFactorR8({ busqueda: "", D: { config: { factorR8: 0.9 } }, param: param(1.2) });
    expect(I.E).toEqual({ r8: 0.9, gen: 0.9 }); expect(I.deConfig()).toBe(1.2); expect(I.E.r8).toBe(0.9);
  });
  it("fuera de (0, 2] no cuenta, ni de la URL ni del índice", () => {
    expect(leeFactorR8("?factorR8=3", null)).toEqual({ v: 0, url: null });
    expect(leeFactorR8("", { config: { factorR8: 0 } })).toEqual({ v: 0, url: null });
    expect(creaFactorR8({ busqueda: "?factorR8=5", D: {}, param: param(undefined) }).E).toEqual({ r8: 0.5, gen: 1 });
  });
});

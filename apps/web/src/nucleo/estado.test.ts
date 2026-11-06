import { describe, expect, it } from "vitest";
import { ESTADO_INICIAL, creaEstado } from "./estado.ts";

describe("creaEstado", () => {
  it("arranca con los valores de siempre del motor (exag 1, modo nube, calidad 1)", () => {
    expect(creaEstado()).toEqual({ exag: 1, modo: "nube", calidad: 1 });
    expect(ESTADO_INICIAL).toEqual({ exag: 1, modo: "nube", calidad: 1 });
  });
  it("cada llamada da un objeto distinto y mutable; los iniciales no cambian", () => {
    const a = creaEstado(), b = creaEstado();
    expect(a).not.toBe(b);
    a.exag = 2.5; a.modo = "gem"; a.calidad = 0;
    expect(b).toEqual({ exag: 1, modo: "nube", calidad: 1 });
    expect(ESTADO_INICIAL.exag).toBe(1);
    expect(Object.isFrozen(ESTADO_INICIAL)).toBe(true);
  });
  it("acepta valores iniciales (lo que pedirá cada mundo: un interior con exag 1 fijo)", () => {
    expect(creaEstado({ exag: 3 })).toEqual({ exag: 3, modo: "nube", calidad: 1 });
    expect(creaEstado({ modo: "orto", calidad: 2 })).toEqual({ exag: 1, modo: "orto", calidad: 2 });
  });
});

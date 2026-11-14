// L3-19: el tinte de las copas por NDVI no inventa un vigor «medio» donde no hay NDVI (ndviRel devuelve NaN): la copa conserva el color de la ortofoto.
import { describe, expect, it } from "vitest";
import { creaTinteOrto } from "./orto-tinte.ts";

describe("tinte NDVI de las copas", () => {
  const monta = (rel: number) => { const T = creaTinteOrto({ orto: () => {}, ndviRel: () => rel, rampa: () => [0, 1, 0] } as never); T.E.tinte = true; return T; };
  it("con NDVI en el punto, la copa se tiñe hacia la rampa", () => {
    const a = [0.5, 0.5, 0.5], b = [0.5, 0.5, 0.5]; monta(0.7).aviva(a, 1, 1); creaTinteOrto({ orto: () => {}, ndviRel: () => 0, rampa: () => [0, 1, 0] } as never).aviva(b, 1, 1);
    expect(a[1]).toBeGreaterThan(b[1] as number);
  });
  it("sin NDVI en el punto (NaN) la copa queda igual que sin tinte", () => {
    const con = [0.5, 0.4, 0.3], sin = [0.5, 0.4, 0.3];
    monta(NaN).aviva(con, 1, 1); creaTinteOrto({ orto: () => {}, ndviRel: () => 0, rampa: () => [0, 1, 0] } as never).aviva(sin, 1, 1);
    expect(con).toEqual(sin);
  });
});

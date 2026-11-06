import { describe, expect, it } from "vitest";
import { FUNDIDO_S, FundidoPuro, creaFundido } from "./fundido.ts";

const espera = () => new Promise<void>((r) => setTimeout(r, 0));

describe("FundidoPuro.necesitaFundido", () => {
  it("pide fundido por encima de 5 m y no por debajo ni justo en 5", () => {
    expect(FundidoPuro.necesitaFundido(4.9)).toBe(false);
    expect(FundidoPuro.necesitaFundido(5)).toBe(false);
    expect(FundidoPuro.necesitaFundido(5.1)).toBe(true);
    expect(FundidoPuro.necesitaFundido(230)).toBe(true);
    expect(FundidoPuro.necesitaFundido(2, 1)).toBe(true);
  });
});

describe("cierra", () => {
  it("deja a negro, se cumple al llegar y ESPERA a negro mientras no se abre", async () => {
    const f = creaFundido(); let cumplida = false;
    const p = f.cierra().then(() => { cumplida = true; });
    expect(f.fase).toBe("cerrando"); expect(f.visible).toBe(true);
    f.paso(FUNDIDO_S / 2); expect(f.opacidad).toBeCloseTo(0.5);
    await espera(); expect(cumplida).toBe(false);
    f.paso(FUNDIDO_S); await p;
    expect(f.fase).toBe("negro"); expect(f.opacidad).toBe(1); expect(cumplida).toBe(true);
    for (let i = 0; i < 100; i++) f.paso(1);   // cargar un mundo lleva el tiempo que lleve: sigue negro
    expect(f.fase).toBe("negro"); expect(f.opacidad).toBe(1);
  });
  it("alNegro se llama dentro de paso, en el instante de llegar a negro", () => {
    const f = creaFundido(); const visto: string[] = [];
    f.cierra(() => visto.push(f.fase));
    f.paso(0.01); expect(visto).toEqual([]);
    f.paso(1); expect(visto).toEqual(["negro"]);
  });
  it("dos cierra seguidos no se pisan: misma promesa, un solo ciclo, ambos alNegro", () => {
    const f = creaFundido(); let n = 0;
    const a = f.cierra(() => n++), b = f.cierra(() => n++);
    expect(b).toBe(a);
    f.paso(0.05); const c = f.cierra(); expect(c).toBe(a);
    expect(f.opacidad).toBeCloseTo(0.05 / FUNDIDO_S);   // no reinició el tiempo
    f.paso(1); expect(n).toBe(2); expect(f.fase).toBe("negro");
  });
  it("un cierra mientras abre espera a abrir del todo y vuelve a cerrar", async () => {
    const f = creaFundido(); f.cierra(); f.paso(1); f.abre(); f.paso(0.05);
    expect(f.fase).toBe("abriendo");
    const p = f.cierra(); expect(f.fase).toBe("abriendo");
    f.paso(1); await espera(); expect(f.fase).toBe("cerrando");
    f.paso(1); await p; expect(f.fase).toBe("negro");
  });
});

describe("abre", () => {
  it("solo vuelve tras un cierra: abierto, se cumple en el acto y no oscurece", async () => {
    const f = creaFundido(); await f.abre();
    expect(f.fase).toBe("abierto"); expect(f.visible).toBe(false); expect(f.opacidad).toBe(0);
  });
  it("tras cierra aclara en FUNDIDO_S y la promesa se cumple al estar abierto", async () => {
    const f = creaFundido(); f.cierra(); f.paso(1);
    let abierta = false; const p = f.abre().then(() => { abierta = true; });
    expect(f.fase).toBe("abriendo"); f.paso(FUNDIDO_S / 2); expect(f.opacidad).toBeCloseTo(0.5);
    await espera(); expect(abierta).toBe(false);
    f.paso(1); await p; expect(abierta).toBe(true); expect(f.fase).toBe("abierto"); expect(f.visible).toBe(false);
  });
  it("un abre mientras cierra espera a llegar a negro y entonces abre (nunca a medias)", async () => {
    const f = creaFundido(); f.cierra(); f.paso(0.05);
    const p = f.abre(); expect(f.fase).toBe("cerrando");
    f.paso(1); expect(f.fase).toBe("abriendo"); f.paso(1); await p; expect(f.fase).toBe("abierto");
  });
});

describe("funde (vrFundido de siempre)", () => {
  it("cierra, llama a fn a oscuras y abre; devuelve true", () => {
    const f = creaFundido(); const visto: Array<[string, number]> = [];
    expect(f.funde(() => visto.push([f.fase, f.opacidad]))).toBe(true);
    f.paso(1); expect(visto).toEqual([["negro", 1]]); expect(f.fase).toBe("abriendo");
    f.paso(1); expect(f.fase).toBe("abierto");
  });
  it("con uno en curso devuelve false y no llama a la segunda fn", () => {
    const f = creaFundido(); let n = 0;
    expect(f.funde(() => n++)).toBe(true); expect(f.funde(() => n++)).toBe(false);
    f.paso(1); f.paso(1); expect(n).toBe(1); expect(f.funde(() => n++)).toBe(true);
  });
  it("sin fn también funde; si fn lanza, abre igual", () => {
    const f = creaFundido(); expect(f.funde()).toBe(true); f.paso(1); expect(f.fase).toBe("abriendo");
    const g = creaFundido(); g.funde(() => { throw new Error("x"); });
    expect(() => g.paso(1)).toThrow(); expect(g.fase).toBe("abriendo");
  });
});

describe("reinicia", () => {
  it("deja abierto y cumple las promesas pendientes", async () => {
    const f = creaFundido(); const p = f.cierra(); f.paso(1); const q = f.abre();
    f.reinicia(); await p; await q; expect(f.fase).toBe("abierto"); expect(f.opacidad).toBe(0);
  });
});

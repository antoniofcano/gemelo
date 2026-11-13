// Las máquinas, lo puro (contrato mundo-interior v1.2, §1e): validación mínima del motor, velocidades por relación, fases con rampa, posiciones de
// vaivén y traslación, y el giro en el marco del padre. Con el ejemplo sintético del contrato (modelos/interiores/ejemplo-luz/mundo.json).
import { describe, expect, it } from "vitest";
import ejemplo from "../../../../../modelos/interiores/ejemplo-luz/mundo.json";
import type { Maquina } from "../../datos/contratos/mundo-interior.ts";
import { MaquinasPuro as M } from "./maquinas-puro.ts";

const EJ = (ejemplo as unknown as { maquinas: Maquina[] }).maquinas;
const giro = (o: Partial<Maquina> = {}): Maquina => ({ id: "a", nodo: "a", tipo: "giro", eje: [0, 1, 0], velocidad: 60, luz: "propia", fuente: "ilustrativo", ...o });

describe("MaquinasPuro.valida", () => {
  it("el ejemplo del contrato vale", () => { expect(M.valida(EJ)).toEqual([]); });
  it("rechaza lo que rompería el motor: sin lista, tipo desconocido, velocidad y relación a la vez (o ninguna), relación a nadie, ciclos, eje no unitario, sin recorrido, textura sin material", () => {
    expect(M.valida({})).toEqual(["maquinas: una lista"]);
    expect(M.valida([giro({ tipo: "salto" as Maquina["tipo"] })])[0]).toMatch(/tipo «salto»/);
    expect(M.valida([giro({ relacion: { con: "a", factor: 1 } })])[0]).toMatch(/una sola/);
    expect(M.valida([giro({ velocidad: undefined })])[0]).toMatch(/una sola/);
    expect(M.valida([giro({ velocidad: undefined, relacion: { con: "x", factor: 1 } })])[0]).toMatch(/«x», que no existe/);
    const ciclo = [giro({ id: "a", velocidad: undefined, relacion: { con: "b", factor: 1 } }), giro({ id: "b", nodo: "b", velocidad: undefined, relacion: { con: "a", factor: 2 } })];
    expect(M.valida(ciclo).filter(x => /ciclo/.test(x))).toHaveLength(2);
    expect(M.valida([giro({ eje: [1, 1, 0] })])[0]).toMatch(/eje unitario/);
    expect(M.valida([giro({ tipo: "vaiven" })])[0]).toMatch(/recorrido/);
    expect(M.valida([giro({ tipo: "textura", eje: undefined })]).join(" ")).toMatch(/sin material.*uv/);
    expect(M.valida([giro(), giro()])[0]).toMatch(/repetido/);
  });
});

describe("MaquinasPuro.velocidades", () => {
  it("directas o por la relación, en cadena y con su signo (el ejemplo: rueda 6, rodillo −24, correa 0,3, pistón 10)", () => {
    const v = M.velocidades(EJ);
    expect(v[0]).toBe(6); expect(v[1]).toBe(-24); expect(v[2]).toBeCloseTo(0.3, 12); expect(v[3]).toBe(10);
    const cadena = [giro({ id: "c", velocidad: undefined, relacion: { con: "b", factor: 3 } }), giro({ id: "b", velocidad: undefined, relacion: { con: "a", factor: 0.5 } }), giro({ id: "a", velocidad: 240 })];
    expect(M.velocidades(cadena)).toEqual([360, 120, 240]);
  });
});

describe("MaquinasPuro: posiciones", () => {
  it("traslación: va a velocidad constante, para en cada extremo y vuelve", () => {
    const L = 2, v = 1, p = 0.5;   // ida 2 s, pausa 0,5: ciclo 5 s
    expect(M.posTraslacion(0, L, v, p)).toBe(0);
    expect(M.posTraslacion(1, L, v, p)).toBe(1);
    expect(M.posTraslacion(2.2, L, v, p)).toBe(2);
    expect(M.posTraslacion(3.5, L, v, p)).toBe(1);
    expect(M.posTraslacion(4.7, L, v, p)).toBe(0);
    expect(M.posTraslacion(6, L, v, p)).toBe(1);
  });
  it("vaivén: de 0 a L y vuelta, suave", () => {
    expect(M.posVaiven(0, 0.3)).toBe(0); expect(M.posVaiven(0.5, 0.3)).toBeCloseTo(0.3, 12); expect(M.posVaiven(0.25, 0.3)).toBeCloseTo(0.15, 12);
  });
  it("rotaEnPadre: un cuarto de vuelta en +Y desde la identidad, y tras una pose de reposo (el giro va en el marco del padre)", () => {
    const s: number[] = [0, 0, 0, 0];
    M.rotaEnPadre([0, 1, 0], Math.PI / 2, [0, 0, 0, 1], s);
    expect(s[1]).toBeCloseTo(Math.SQRT1_2, 12); expect(s[3]).toBeCloseTo(Math.SQRT1_2, 12);
    // reposo: medio giro en X; luego medio giro en Y (padre): el resultado es medio giro en Z (Y·X = Z con w = 0)
    M.rotaEnPadre([0, 1, 0], Math.PI, [1, 0, 0, 0], s);
    expect(s.map(x => Math.round(x * 1e9) / 1e9)).toEqual([0, 0, -1, 0]);
  });
});

describe("MaquinasPuro.creaMarcha", () => {
  it("parada no se mueve; al poner en marcha sube con la rampa y gira a su velocidad; al parar baja con la rampa y se queda quieta", () => {
    const k = M.creaMarcha([giro({ velocidad: 60 })], 1);   // 1 vuelta por segundo, rampa de 1 s
    expect(k.quieta()).toBe(true);
    k.avanza(0.5); expect(k.valor(0)).toBe(0);
    k.objetivo(true); expect(k.quieta()).toBe(false);
    for (let i = 0; i < 11; i++) k.avanza(0.1);
    expect(k.marcha()).toBe(1);
    const a0 = k.valor(0); k.avanza(0.125);
    expect(((k.valor(0) - a0) + 2 * Math.PI) % (2 * Math.PI)).toBeCloseTo(Math.PI / 4, 9);   // 1/8 de vuelta en 1/8 s
    k.objetivo(false);
    for (let i = 0; i < 11; i++) k.avanza(0.1);
    expect(k.marcha()).toBe(0); expect(k.quieta()).toBe(true);
    const a1 = k.valor(0); k.avanza(1); expect(k.valor(0)).toBe(a1);
  });
  it("la textura corre en la dirección uv (el desplazamiento del mapa va al revés) y no crece sin fin (módulo 1 por eje)", () => {
    const k = M.creaMarcha([giro({ tipo: "textura", eje: undefined, material: "m", uv: [0, 1], velocidad: 0.25 })], 1e-9);
    k.objetivo(true); k.avanza(1e-9);
    for (let i = 0; i < 100; i++) k.avanza(0.1);   // 10 s a 0,25 UV/s: 2,5 vueltas
    expect(k.valor(0)).toBe(0); expect(Math.abs(k.valorV(0))).toBeLessThan(1); expect(k.valorV(0)).toBeCloseTo(-0.5, 6);
  });
  it("traslación y vaivén del ejemplo: dentro de su recorrido", () => {
    const k = M.creaMarcha(EJ, 0.01); k.objetivo(true);
    let max = 0;
    for (let i = 0; i < 200; i++) { k.avanza(0.05); max = Math.max(max, k.valor(3)); expect(k.valor(3)).toBeGreaterThanOrEqual(0); }
    expect(max).toBeLessThanOrEqual(0.3 + 1e-12); expect(max).toBeGreaterThan(0.29);
  });
});

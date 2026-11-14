// L6-03: la regla única de «Movimiento» (nucleo/movimiento.ts) y que nadie más en apps/web/src pregunte a la media query por su cuenta.
import { describe, expect, it } from "vitest";
import { CONSULTA_MOVIMIENTO, movimientoReducido, sistemaReduceMovimiento } from "./movimiento.ts";

const ventana = (reduce: boolean) => ({ matchMedia: (q: string) => ({ matches: q === CONSULTA_MOVIMIENTO && reduce }) });

describe("movimientoReducido", () => {
  it("manda el ajuste de la aplicación; sin Configuración, el sistema", () => {
    expect(movimientoReducido({ movimientoReducido: () => true }, ventana(false))).toBe(true);
    expect(movimientoReducido({ movimientoReducido: () => false }, ventana(true))).toBe(false);
    expect(movimientoReducido(null, ventana(true))).toBe(true);
    expect(movimientoReducido(undefined, ventana(false))).toBe(false);
    expect(movimientoReducido({ movimientoReducido: () => { throw new Error("x"); } }, ventana(true))).toBe(true);
  });
  it("sin matchMedia (o si falla), no se reduce", () => {
    expect(sistemaReduceMovimiento({})).toBe(false); expect(sistemaReduceMovimiento(null)).toBe(false);
    expect(sistemaReduceMovimiento({ matchMedia: () => { throw new Error("x"); } })).toBe(false);
  });
});

describe("el arranque cablea «Movimiento» a todo lo que se mueve (L6-03)", () => {
  const src = Object.values(import.meta.glob("../arranque.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>)[0]!;
  const llamada = (ini: string) => { const i = src.indexOf(ini); expect(i, ini).toBeGreaterThan(0); return src.slice(i, src.indexOf("}));", i)); };
  const REGLA = /reducido: function \(\) \{ return Nucleo\.movimientoReducido\(typeof Ajustes !== "undefined" \? Ajustes : null, window\); \}/;
  it("el tiempo: lo crea con la regla y Configuración le avisa de cada cambio con Tiempo.calma (nubes, viento y «Reproducir»)", () => {
    const t = src.slice(src.indexOf("Mundos.creaTiempo({"), src.indexOf("});", src.indexOf("Mundos.creaTiempo({")));
    expect(t).toMatch(/calma: Nucleo\.movimientoReducido\(typeof Ajustes !== "undefined" \? Ajustes : null, window\)/);
    expect(llamada("Interfaz.creaAjustes({")).toMatch(/movimiento: function \(r\) \{[^}]*Tiempo\.calma\(r\); \}/);
  });
  it("la fauna y los perros reciben «reducido»; los juegos, Ajustes; la transición, la regla", () => {
    expect(llamada("Mundos.manifiestoFauna({")).toMatch(REGLA);
    expect(llamada("Mundos.manifiestoPerros({")).toMatch(REGLA);
    expect(llamada("Mundos.manifiestoJuegos({")).toMatch(/get Ajustes\(\) \{ return typeof Ajustes !== "undefined" \? Ajustes : null; \}/);
    expect(src.slice(src.indexOf("Mundos.creaTransicion({"), src.indexOf("});", src.indexOf("Mundos.creaTransicion({")))).toMatch(REGLA);
  });
});

describe("una sola puerta a prefers-reduced-motion (regla 12)", () => {
  const fuentes = import.meta.glob(["../**/*.ts", "!../**/*.test.ts", "!./movimiento.ts", "!./prueba-*.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  it("ningún otro módulo consulta la media query: leen el ajuste por movimientoReducido o Ajustes", () => {
    expect(Object.keys(fuentes).length).toBeGreaterThan(50);
    const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const mal = Object.entries(fuentes).filter(([, s]) => /prefers-reduced-motion/.test(sinComentarios(s))).map(([f]) => f);
    expect(mal).toEqual([]);
  });
});

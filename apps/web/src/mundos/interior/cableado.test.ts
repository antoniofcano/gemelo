// L6-03: las máquinas de los interiores entran paradas con «Movimiento: Reducido» de la aplicación (Configuración), no solo con la preferencia del sistema.
// movimientoReducido (cableado.ts) es lo que el cableado pasa al interior como deps.reducido. HONESTIDAD: sin navegador; en el Quest y el iPhone, NO probado.
import { describe, expect, it } from "vitest";
import { movimientoReducido } from "./cableado.ts";

const ventana = (reduce: boolean) => ({ matchMedia: (q: string) => ({ matches: reduce && /reduced-motion/.test(q) }) });

describe("L6-03: el movimiento de los interiores sigue el ajuste de la aplicación", () => {
  it("manda Configuración: «Reducido» para aunque el sistema no lo pida, y «Normal» anda aunque el sistema lo pida", () => {
    expect(movimientoReducido({ movimientoReducido: () => true }, ventana(false))).toBe(true);
    expect(movimientoReducido({ movimientoReducido: () => false }, ventana(true))).toBe(false);
  });
  it("sin Configuración (o si falla), la preferencia del sistema", () => {
    expect(movimientoReducido(null, ventana(true))).toBe(true); expect(movimientoReducido(undefined, ventana(false))).toBe(false);
    expect(movimientoReducido({ movimientoReducido: () => { throw new Error("x"); } }, ventana(true))).toBe(true);
    expect(movimientoReducido(null, {})).toBe(false);
  });
});

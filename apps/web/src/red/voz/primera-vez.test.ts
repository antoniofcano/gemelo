// La tarjeta del estreno del micro (A3-7b2, MU5-n; antes 46b_primera_vez.js). Lo de siempre lo prueba pruebas/guardianes/primera_vez.test.js; aquí, quién la ve y que la cifra
// del corro es la de la voz. HONESTIDAD: sin DOM; la tarjeta puesta en pantalla o en VR (iPhone, Quest) no está probada.
import { describe, expect, it } from "vitest";
import { PrimeraVezPuro } from "./primera-vez.ts";
import { VozPuro } from "./voz.ts";

describe("PrimeraVezPuro", () => {
  it("solo se enseña a familias y miembros que no la han visto", () => {
    expect(PrimeraVezPuro.debeVerse(false, "familia")).toBe(true);
    expect(PrimeraVezPuro.debeVerse(false, "miembro")).toBe(true);
    expect(PrimeraVezPuro.debeVerse(true, "familia")).toBe(false);
    expect(PrimeraVezPuro.debeVerse(false, "guia")).toBe(false);
  });
  it("el alcance del corro es el de la voz (la misma cifra)", () => {
    expect(PrimeraVezPuro.ALCANCE_CORRO).toBe(VozPuro.DIST_CORRO.corte);
  });
  it("la tarjeta del corro nombra el alcance y la de la guiada no", () => {
    const c = PrimeraVezPuro.tarjeta({ ambito: "corro", forma: "pulsar", corte: 20 }), g = PrimeraVezPuro.tarjeta({ ambito: "guiada", forma: "mantener" });
    expect(c.lineas[0].txt).toContain("20 m"); expect(g.lineas[0].txt).not.toContain("corro"); expect(c.lineas).toHaveLength(3);
  });
});

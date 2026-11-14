// L8-01: la caja de la lluvia va con quien mira. En la vista aérea, con el blanco de la órbita; paseando, con la cámara (el paseante se aleja del blanco y
// la lluvia se quedaba atrás). HONESTIDAD: aritmética; cómo se ve, lo dice el banco.
import { describe, expect, it } from "vitest";
import { anclaLluvia } from "./tiempo-lluvia.ts";

describe("L8-01: ancla de la lluvia", () => {
  const objetivo = { x: 100, y: 50, z: -30 }, camara = { x: 400, y: 52, z: 250 };
  it("en la órbita, la caja va con el blanco (20 m por debajo)", () => {
    expect(anclaLluvia(false, camara, objetivo, { x: 0, y: 0, z: 0 })).toEqual({ x: 100, y: 30, z: -30 });
  });
  it("paseando, la caja va con la cámara, no con el blanco que quedó atrás", () => {
    expect(anclaLluvia(true, camara, objetivo, { x: 0, y: 0, z: 0 })).toEqual({ x: 400, y: 32, z: 250 });
  });
});

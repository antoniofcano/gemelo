// L3-22: «hace N …» de tiempo-puro usa los mismos umbrales que el resto (min hasta 90, horas enteras hasta 36 h, luego días): antes daba «hace 100,0 h».
import { describe, expect, it } from "vitest";
import { hace } from "./tiempo-puro.ts";

describe("hace()", () => {
  const AHORA = Date.parse("2026-11-14T12:00:00Z"), reloj = () => AHORA, antes = (min: number) => new Date(AHORA - min * 60000).toISOString();
  it("minutos, horas y días con los umbrales comunes", () => {
    expect(hace(antes(25), reloj)).toBe("hace 25 min"); expect(hace(antes(80), reloj)).toBe("hace 80 min");
    expect(hace(antes(180), reloj)).toBe("hace 3 h"); expect(hace(antes(100 * 60), reloj)).toBe("hace 4 días");
    expect(hace("", reloj)).toBe("");
  });
});

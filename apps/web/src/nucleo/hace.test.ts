// L3-22: la regla única de «hace N …» (nucleo/hace.ts), y que las cinco que la usaban por su cuenta la usen a ella.
import { describe, expect, it } from "vitest";
import { haceDesde, haceMinutos } from "./hace.ts";

const AHORA = Date.parse("2026-11-14T12:00:00Z"), antes = (min: number) => new Date(AHORA - min * 60000).toISOString();

describe("haceMinutos / haceDesde", () => {
  it("minutos hasta 90, horas enteras hasta 36 h, luego días", () => {
    expect(haceDesde(antes(25), AHORA)).toBe("hace 25 min");
    expect(haceDesde(antes(89), AHORA)).toBe("hace 89 min");
    expect(haceDesde(antes(90), AHORA)).toBe("hace 2 h");
    expect(haceDesde(antes(180), AHORA)).toBe("hace 3 h");
    expect(haceDesde(antes(36 * 60 - 1), AHORA)).toBe("hace 36 h");
    expect(haceDesde(antes(36 * 60), AHORA)).toBe("hace 2 días");
    expect(haceDesde(antes(100 * 60), AHORA)).toBe("hace 4 días");
  });
  it("al menos un minuto (también si el instante es del futuro)", () => {
    expect(haceDesde(antes(0), AHORA)).toBe("hace 1 min");
    expect(haceDesde(antes(-5), AHORA)).toBe("hace 1 min");
    expect(haceMinutos(0.2)).toBe("hace 1 min");
  });
  it("un instante más de 5 min en el futuro no es un desajuste de relojes: no se afirma cuánto hace", () => {
    expect(haceMinutos(-5)).toBe("hace 1 min"); expect(haceMinutos(-6)).toBe(""); expect(haceDesde(antes(-600), AHORA)).toBe("");
  });
  it("sin instante o sin reloj, nada", () => {
    for (const malo of [undefined, null, "", "no es fecha", 123]) expect(haceDesde(malo, AHORA)).toBe("");
    expect(haceDesde(antes(5), undefined)).toBe(""); expect(haceDesde(antes(5), NaN)).toBe("");
    expect(haceMinutos(NaN)).toBe("");
  });
});

describe("una sola copia (regla 12)", () => {
  // Vite: el texto de las cinco (import.meta.glob ?raw), como en mundos/interior/interior.test.ts
  const fuentes = import.meta.glob(["../mundos/exterior/{historia,tiempo-puro,mundo-hoy,carteles,fichas-tiempo}.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  it("las cinco importan la regla de nucleo/hace.ts y ninguna la reescribe", () => {
    expect(Object.keys(fuentes)).toHaveLength(5);
    for (const [f, src] of Object.entries(fuentes)) {
      expect(src, f).toMatch(/from "\.\.\/\.\.\/nucleo\/hace\.ts"/);
      expect(src.replace(/^\s*\/\/.*$/gm, ""), f).not.toMatch(/"hace " \+/);
    }
  });
});

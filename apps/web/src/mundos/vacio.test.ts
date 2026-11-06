// El mundo vacío (MU2-6): el interior de prueba de ?mundo=vacio (MU2-8). Suelo 0, un cuadrado de 20 m, sin obstáculos más que su borde.
import { describe, expect, it } from "vitest";
import { creaVacio, FONDO_VACIO, LUCES_VACIO, MEDIO_LADO } from "./vacio.ts";

describe("creaVacio", () => {
  it("es «vacio», se congela al salir, carga sin esperar y no lanza en nada de su ciclo de vida", async () => {
    const v = creaVacio();
    expect(v.id).toBe("vacio"); expect(v.alSalir).toBe("congela"); expect(MEDIO_LADO).toBe(10);
    await expect(v.carga({} as never)).resolves.toBeUndefined();
    expect(() => { v.entra(null, null); v.actualiza(0.016, 1); v.congela(); v.libera(); v.libera(); }).not.toThrow();
    expect(v.sale()).toEqual({ x: 0, y: 0, ang: 0 });
  });
  it("suelo plano a 0; dentro, el cuadrado de 20 m con sus bordes; obstaculo solo recorta a ese cuadrado (siempre el mismo objeto)", () => {
    const v = creaVacio();
    expect(v.suelo(3, -7)).toBe(0); expect(v.suelo(1e4, 1e4)).toBe(0);
    expect(v.dentro(0, 0)).toBe(true); expect(v.dentro(10, -10)).toBe(true); expect(v.dentro(10.01, 0)).toBe(false); expect(v.dentro(0, -10.01)).toBe(false);
    expect(v.obstaculo(2, 3, 0.55)).toBeNull();
    const a = v.obstaculo(12, -3, 0.55), b = v.obstaculo(-30, 40, 0.55);
    expect(a).toBe(b); expect(b).toEqual({ x: -10, y: 10, ang: 0 });
  });
  it("entra() pone a quien mira en la llegada (recortada al cuadrado) o en el centro, y sale() devuelve una copia", () => {
    const pp = { x: 500, y: 500, ang: 2 };
    const v = creaVacio({ pose: { lee: () => pp, pon: p => { pp.x = p.x; pp.y = p.y; pp.ang = p.ang; } } });
    v.entra(null, null); expect(pp).toEqual({ x: 0, y: 0, ang: 0 });
    v.entra(null, { x: 4, y: 25, ang: 1 }); expect(pp).toEqual({ x: 4, y: 10, ang: 1 });
    const s = v.sale(); pp.x = 0; expect(s).toEqual({ x: 4, y: 10, ang: 1 });
  });
  it("MU2-7: su Ambiente es de interior (sin cielo ni niebla, fondo gris, sus dos luces, near/far de interior, exag 1); las luces, una vez, y libera() las suelta", () => {
    const hechas: Array<{ tipo: string; pos?: readonly number[]; sueltas: number; dispose(): void }> = [];
    const v = creaVacio({ luz: (tipo, _c, _k, pos) => { const l = { tipo, ...(pos ? { pos } : {}), sueltas: 0, dispose() { l.sueltas++; } }; hechas.push(l); return l; } });
    const a = v.ambiente?.();
    expect(a).toMatchObject({ cielo: "ninguno", fondo: FONDO_VACIO, niebla: null, camara: { near: 0.05, far: 80 }, exag: 1 });
    expect(a?.camara.vr).toBeUndefined();   // en VR, el mismo near/far
    expect(hechas.map(l => l.tipo)).toEqual(["ambiental", "direccional"]);
    expect(hechas[1]?.pos).toEqual(LUCES_VACIO.direccional.pos);
    expect(v.ambiente?.().luces).toEqual(a?.luces); expect(hechas.length).toBe(2);
    v.libera(); v.libera();
    expect(hechas.map(l => l.sueltas)).toEqual([1, 1]);
    expect(creaVacio().ambiente?.().luces).toEqual([]);   // sin fábrica (pruebas), sin luces
  });
});

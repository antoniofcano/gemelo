// El muñeco de los demás, el encuentro, la cuenta y sitioJunto (mundos/comun/muneco.ts; MU5-n, A3-6a). Lo de siempre lo cubren a fondo
// pruebas/guardianes/presencia.test.js y muneco_aspecto.test.js; aquí, lo que cambia con la migración: sitioJunto con sus dependencias por argumento.
import { describe, expect, it } from "vitest";
import { Cuenta, Encuentro, Muneco, creaSitioJunto } from "./muneco.ts";

describe("Muneco, Encuentro y Cuenta", () => {
  it("el muñeco anda (paso y brazos) y, en quad, va sentado sin paso", () => {
    const st = Muneco.crea(), o: any = {};
    Muneco.avanza(st, 0, 0, 0, 0.1, 10, 1, NaN, false, o, 0, false);
    for (let i = 1; i <= 10; i++) Muneco.avanza(st, 0, -0.15 * i, 0, 0.1, 10, 1, NaN, false, o, 0, false);   // 1,5 m/s hacia −z
    expect(o.vehiculo).toBe(0); expect(o.mov).toBeGreaterThan(0.5); expect(o.yPies).toBeGreaterThanOrEqual(10);
    Muneco.avanza(st, 0, -1.6, 0, 0.1, 10, 1, NaN, false, o, 1, false);
    expect(o).toMatchObject({ vehiculo: 1, mov: 0, piernaI: Muneco.SENTADO_P, brazoI: Muneco.SENTADO_B, atras: 0.2 });
  });
  it("lo que cuesta dibujar a la gente: 82 triángulos a pie, 94 con sombrero, +24 con gafas", () => {
    const una = (p: object) => Cuenta.grupo(Cuenta.instancias([p]));
    expect(una({ quest: false, sombrero: 0, mov: "pie" })).toEqual({ llamadas: 3, triangulos: 82 });
    expect(una({ quest: false, sombrero: 1, mov: "pie" })).toEqual({ llamadas: 4, triangulos: 94 });
    expect(una({ quest: true, sombrero: 1, mov: "pie" }).triangulos).toBe(94 + 24);
  });
  it("Encuentro: a 2,5 m, mirándola, fuera de las copas", () => {
    const L = Encuentro.punto({ x: 0, y: 0 }, { x: 0, y: -10 }, [], [-100, 100, 100, -100], {});
    expect(Math.hypot(L.x, L.y)).toBeCloseTo(2.5, 9); expect(L.libre).toBe("copa");
    expect(L.ang).toBeCloseTo(Math.atan2(-L.x, -L.y), 9);
  });
});

describe("creaSitioJunto (A3-6a): las copas, el recuadro y el suelo, por argumento", () => {
  it("pide las copas en cada uso (el legado puede cambiarlas) y pone la cota con el suelo que le dan", () => {
    let copas: { x: number; y: number; perfil: number[] }[] = [];
    const sitio = creaSitioJunto({ get copas() { return copas; }, D: { ext: [-100, 100, 100, -100] }, suelo: (x: number, y: number) => 7 + 0 * x * y });
    const libre = sitio({ x: 0, y: 0 }, { x: 0, y: -10 });
    expect(libre.z).toBe(7); expect(libre.libre).toBe("copa");
    copas = [{ x: libre.x, y: libre.y, perfil: [3, 3, 3, 3, 3, 3, 3, 3] }];   // un olivo justo donde caía: ahora se aparta de su copa
    const otro = sitio({ x: 0, y: 0 }, { x: 0, y: -10 });
    expect(Math.hypot(otro.x - libre.x, otro.y - libre.y)).toBeGreaterThan(0.5);
  });
});

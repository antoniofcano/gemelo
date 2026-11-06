// El sol de reserva (A3-4, MU5-n; antes 11_sol.js), con un DOM de mentira y luces de mentira: lo que hace al montarse y al mover #hora, y que libera() quita su
// escucha (las luces son de 03_escena y no se tocan). HONESTIDAD: actualizaTiempo lo pisa en cada fotograma; esto no dice nada de lo que se ve.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaSolReserva, manifiestoSolReserva } from "./sol-reserva.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
function monta() {
  const oy: A[] = [], hora: A = { value: "13.5", addEventListener: (_e: string, f: A) => oy.push(f), removeEventListener: (_e: string, f: A) => oy.splice(oy.indexOf(f), 1) }, horaV = { textContent: "" };
  const sol: A = { intensity: 0, position: { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } } }, hemi = { intensity: 0 };
  const S = creaSolReserva({ $: (id: string) => (id === "hora" ? hora : id === "horaV" ? horaV : null), sol, hemi, LUZ_SOL: 1, LUZ_CIELO: 1 });
  return { S, oy, hora, horaV, sol, hemi };
}
describe("el sol de reserva (componente del exterior)", () => {
  it("al montarse pone el sol de la hora del deslizador (alto a mediodía) y el rótulo; al moverlo, otra vez; libera() quita la escucha (una vez)", () => {
    const { S, oy, hora, horaV, sol } = monta();
    expect(horaV.textContent).toBe("13:30"); expect(sol.position.y).toBeGreaterThan(100); expect(sol.intensity).toBeGreaterThan(0.6);
    hora.value = "7"; oy.forEach(f => f()); expect(horaV.textContent).toBe("7:00"); expect(sol.position.y).toBeLessThan(100);
    expect(oy.length).toBe(1); expect(S.libera()).toBe(1); expect(oy.length).toBe(0); expect(S.libera()).toBe(0);
  });
  it("el manifiesto vale, es de los mundos [exterior], monta el mismo objeto y su libera lo suelta", () => {
    const { S, oy } = monta(), man = manifiestoSolReserva(S);
    expect(ComponentesPuro.valida(man)).toEqual([]); expect(man.id).toBe("sol-reserva"); expect(man.mundos).toEqual(["exterior"]);
    expect(man.monta({} as never)).toBe(S); man.libera(S as never); expect(oy.length).toBe(0);
  });
});

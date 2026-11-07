// Parcelas: el selector, las cifras y la ficha del suelo (MU5-n, A3-7b1: antes apps/web/motor/13_parcelas.js). Con los dobles del DOM de nucleo/prueba-dom.ts: se crean los chips (una finca:
// «Toda la finca» y una por parcela; varias fincas: las fincas y, de la elegida, sus parcelas), elegir mueve la órbita a la parcela y pinta las cifras y el suelo; libera() quita las escuchas,
// los nodos, el aplazado de la unidad y la suscripción a Configuración. HONESTIDAD: sin navegador ni maquetación; el selector de verdad en la página, en el banco.
import { afterEach, describe, expect, it } from "vitest";
import { ID_PARCELAS, creaParcelas, manifiestoParcelas } from "./parcelas.ts";
import { creaMundo, type Mundo } from "../../nucleo/prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });

const suelo = [{ p: "0-5", a: 30, l: 30, c: 40, ph: 7.5, mo: 1.2, cec: 20, dens: 1.3, pedr: 10 }, { p: "5-15", a: 32, l: 28, c: 40, ph: 7.6, mo: 1.1, cec: 21, dens: 1.4, pedr: 12 }];
const parcela = (id: string, nombre: string, finca: number, x: number, o: { suelo?: unknown } = {}) => ({ id, nombre, finca, ha: 2, centro: [x, 0], linde: [[x - 10, -10], [x + 10, -10], [x + 10, 10], [x - 10, 10]], suelo: o.suelo === undefined ? suelo : o.suelo });

function monta(o: { fincas?: boolean; sueloUna?: unknown } = {}) {
  m = creaMundo();
  for (const id of ["chips", "calidad", "sueloCuerpo", "tMedido", "kCopas", "kMarc", "kAlt", "kDes", "nMarc", "tParcelasFinca"]) m.documento.body.appendChild(m.el("div", id));
  const D = { parcelas: [parcela("a", "Alta <b>", 0, 100), parcela("b", "Baja", o.fincas ? 1 : 0, -100, { suelo: o.sueloUna })], fincas: o.fincas ? [{ nombre: "Una", ha: 2, olivos: 5, parcelas: [0] }, { nombre: "Otra", ha: 2, olivos: 5, parcelas: [1] }] : undefined };
  const orb = { dist: 0, el: 0 }, objetivo = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
  const cambios: Array<() => void> = []; let sub = 0;
  const P = creaParcelas({
    D, $: (id: string) => m!.documento.getElementById(id), tinta: () => {}, fmt: (n: number, d = 0) => n.toFixed(d), DIST_INI: 400, suelo: () => 5, copas: [], cIn: [], marc: [], med: () => 0,
    Estado: { exag: 1, modo: "nube", calidad: 1 }, aplicaLuego: () => {}, objetivo, orb, Ajustes: { alCambiar: (f: () => void) => { cambios.push(f); sub++; return () => { sub--; }; } }
  });
  return { P, D, orb, objetivo, m, sub: () => sub, chips: m.documento.getElementById("chips"), suelo: m.documento.getElementById("sueloCuerpo") };
}

describe("parcelas: el selector", () => {
  it("una sola finca: «Toda la finca» y una chip por parcela; elegir una mueve la órbita a su centro y pinta el suelo (con el nombre escapado)", () => {
    const { P, orb, objetivo, chips, suelo } = monta();
    expect(chips.children.length).toBe(3); expect(P.parcelaSel()).toBe(-1); expect(P.fincaSel()).toBe(-1);
    P.elegirParcela(0);
    expect(P.parcelaSel()).toBe(0); expect(objetivo.x).toBe(100); expect(orb.el).toBe(0.7);
    expect(suelo.innerHTML).not.toMatch(/<b>/); expect(suelo.innerHTML).toMatch(/Alta &lt;b&gt;/);   // L9-03: el nombre de la parcela no entra como código
    expect(P.claseUsda(30, 30, 40)).toBe("arcilloso"); expect(P.claseUsda(20, 45, 45)).toBe("arcillo limoso");
  });
  it("varias fincas: el selector de dos niveles; elegir una parcela elige su finca", () => {
    const { P, chips, m } = monta({ fincas: true });
    expect(m.documento.getElementById("chipsFincas")).toBeTruthy(); expect(chips.hidden).toBe(true);
    P.elegirParcela(1); expect(P.fincaSel()).toBe(1); expect(P.parcelaSel()).toBe(1); expect(chips.children.length).toBe(1);
  });
  it("L3-18: una parcela con una sola profundidad no rompe la ficha del suelo (sin la frase de densidad)", () => {
    const { P, suelo } = monta({ sueloUna: [suelo0()] });
    expect(() => P.elegirParcela(1)).not.toThrow(); expect(suelo.innerHTML).not.toMatch(/Densidad/); expect(suelo.innerHTML).toMatch(/CIC en cmol/);
  });
});
function suelo0() { return { p: "0-5", a: 30, l: 30, c: 40, ph: 7.5, mo: 1.2, cec: 20, dens: 1.3, pedr: 10 }; }

describe("parcelas: libera()", () => {
  it("quita las escuchas (chips y calidad), los nodos creados, el aplazado y la suscripción a Configuración", () => {
    const { P, chips, m, sub } = monta({ fincas: true });
    expect(m.escuchas()).toBeGreaterThan(0); expect(m.relojes()).toBe(1);
    m.avanza(); expect(sub()).toBe(1);   // el aplazado corre y se suscribe
    P.elegirParcela(0);
    P.libera();
    expect(m.escuchas()).toBe(0); expect(sub()).toBe(0); expect(m.documento.getElementById("chipsFincas")).toBeNull(); expect(chips.children.length).toBe(0);
  });
  it("si se libera antes de que corra el aplazado, no se suscribe nunca", () => {
    const { P, m, sub } = monta();
    P.libera(); m.avanza(); expect(sub()).toBe(0); expect(m.relojes()).toBe(0);
  });
  it("diez montajes y liberaciones no dejan escuchas ni relojes", () => {
    for (let i = 0; i < 10; i++) { const { P, m } = monta({ fincas: i % 2 === 0 }); m.avanza(); P.libera(); expect(m.escuchas()).toBe(0); expect(m.relojes()).toBe(0); m.limpia(); }
    m = null;
  });
  it("el componente es del exterior y solo de ciclo de vida", () => {
    const { P } = monta(); const c = manifiestoParcelas(P);
    expect(c.id).toBe(ID_PARCELAS); expect(c.mundos).toEqual(["exterior"]); expect(c.fases).toEqual({}); expect(c.presupuesto).toEqual({ llamadas: 0, triangulos: 0 }); expect(c.monta({} as never)).toBe(P);
  });
});

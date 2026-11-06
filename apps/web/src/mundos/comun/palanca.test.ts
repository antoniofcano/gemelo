// La palanca flotante (A3-6c, MU5-n; antes 34b_palanca.js). Con dobles del DOM: sin #palanca no hace nada; en escritorio sin táctil queda apagada (data-palanca=no) y no pide nipplejs;
// con ?palanca=1 y paseando, la pide; y libera() quita todas sus escuchas y la suelta. HONESTIDAD: aquí no hay nipplejs de verdad ni dedos; en el iPhone y en Android, NO probado.
import { describe, expect, it } from "vitest";
import { ID_PALANCA, creaPalanca, manifiestoPalanca } from "./palanca.ts";
import { PalancaPuro } from "./paseo.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
function el() { const o: A = { n: 0, attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { o.attrs[k] = v; }, getAttribute(k: string) { return o.attrs[k]; } };
  o.addEventListener = () => { o.n++; }; o.removeEventListener = () => { o.n--; }; return o; }
function monta(busqueda: string, conZona = true) {
  const els: Record<string, A> = { btnPaseo: el() }, raiz = el(), lienzo = el(), pedidos: number[] = [];
  if (conZona) els.palanca = el();
  const api = creaPalanca({ $: (id: string) => els[id] || null, lienzo, visor: null, documento: { documentElement: raiz }, busqueda, PalancaPuro, ponPalanca() { /* doble */ }, giraPalanca() { /* doble */ },
    sensMirar: () => ({ k: 1 }), paseando: () => true, Ajustes: () => null, cargaNipple: () => { pedidos.push(1); return new Promise(() => { /* no llega */ }); } });
  return { api, els, raiz, lienzo, pedidos };
}

describe("palanca táctil", () => {
  it("sin #palanca no hace nada (y su libera() tampoco rompe)", () => {
    const m = monta("", false); expect(m.lienzo.n).toBe(0); expect(() => m.api.libera()).not.toThrow();
  });
  it("en escritorio sin táctil queda apagada y no pide nipplejs; con ?palanca=1 y paseando, la pide", () => {
    const a = monta(""); expect(a.raiz.attrs["data-palanca"]).toBe("no"); expect(a.pedidos.length).toBe(0);
    const b = monta("?palanca=1"); expect(b.raiz.attrs["data-palanca"]).toBe("si"); expect(b.pedidos.length).toBe(1);
  });
  it("libera() quita las escuchas del lienzo y del botón «Pasear»", () => {
    const m = monta("?palanca=1"); expect(m.lienzo.n).toBeGreaterThan(0);
    m.api.libera(); expect(m.lienzo.n + m.els.btnPaseo!.n).toBe(0);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoPalanca(monta("").api);
    expect(c.id).toBe(ID_PALANCA); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

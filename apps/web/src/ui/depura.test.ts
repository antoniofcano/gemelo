// El contador de ?debug (A3-7a, MU5-n; antes 28_depura.js). Con dobles del DOM (prueba-dom.ts): apagado no crea nada; con el contador, la caja sale en el visor y se
// rellena cada 500 ms con lo que dan los demás (también las líneas de los componentes, por «depura:lineas»); libera() la saca y quita __g.depuraJs.
// HONESTIDAD: en Node los «fps» y los ms no valen nada; solo se mira que pinte y que suelte.
import { afterEach, describe, expect, it } from "vitest";
import { ID_CONTADOR, creaDepura, manifiestoDepura } from "./depura.ts";
import { creaMundo, type Mundo } from "./prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
function monta(on: boolean) {
  m = creaMundo();
  const visor = m.el("div", "visor"); m.documento.body.appendChild(visor); m.ventana.__g = {};
  const D = creaDepura({ Aparato: { linea: () => "aparato" }, Mundo: { lista: [] }, Cola: { pendientes: () => 0, est: {} },
    Bus: { emite: (ev: string, d: { lineas: string[] }) => { if (ev === "depura:lineas") d.lineas.push("presencia: 0"); return 1; } }, XrPerillas: { entro: false },
    InfoDibujo: { lee: () => ({ llamadas: 1, triangulos: 2000, puntos: 0 }) }, visor, renderer: {}, Arboles: { resumen: () => ({ nivel0: 1, nivel1: 2, nivel2: 3 }) },
    vrDebugExtra: () => "", Ajustes: { lee: () => on }, ventana: m.ventana, documento: m.documento });
  return { D, m, visor };
}

describe("contador de ?debug", () => {
  it("apagado no crea nada", () => {
    const { D, visor } = monta(false); D.depuraCuadro(0); expect(visor.children.length).toBe(0);
  });
  it("encendido pinta la caja con las líneas de los componentes; libera() la saca y quita __g.depuraJs", () => {
    const { D, m, visor } = monta(true);
    expect(typeof m.ventana.__g.depuraJs).toBe("function");
    D.depuraCuadro(performance.now() - 600);   // el primer cuadro no pinta hasta pasados 500 ms desde el montaje
    const t0 = performance.now(); while (performance.now() - t0 < 510) { /* espera a que pase medio segundo */ }
    D.depuraCuadro(performance.now());
    expect(visor.children.length).toBe(1); expect(visor.children[0].textContent).toMatch(/presencia: 0/);
    D.libera(); expect(visor.children.length).toBe(0); expect(m.ventana.__g.depuraJs).toBe(undefined);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoDepura(monta(false).D);
    expect(c.id).toBe(ID_CONTADOR); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

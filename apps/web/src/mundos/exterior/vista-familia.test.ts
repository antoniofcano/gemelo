// La vista simple para las familias (U9; MU5-n, A3-7b1: antes apps/web/motor/48_vista_familia.js). Lo puro y el DOM de mentira lo cubre el guardián de Node (pruebas/guardianes/vista_familia.test.js);
// aquí, el CICLO DE VIDA con los dobles del DOM de nucleo/prueba-dom.ts: con rol de familia oculta lo justo y libera() lo deshace todo; la sesión en vuelo se corta (AbortController) y su
// resultado tardío no cambia nada. HONESTIDAD: sin navegador; los controles de verdad en la ventana, en el banco (vista_familia_chrome).
import { afterEach, describe, expect, it } from "vitest";
import { ID_VISTA_FAMILIA, VistaFamiliaPuro, manifiestoVistaFamilia } from "./vista-familia.ts";
import { creaMundo, type Mundo } from "../../nucleo/prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
const espera = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };   // microtareas: el setTimeout de los dobles no corre solo

function monta(o: { busqueda?: string; base?: string; respuesta?: () => Promise<unknown> }) {
  m = creaMundo({ busqueda: o.busqueda || "" });
  const kMarc = m.el("dd", "kMarc"), caja = m.el("div"); caja.appendChild(kMarc); m.documento.body.appendChild(caja);   // «Guardados» del mapa: se oculta su contenedor (div)
  const reg = { pedidas: [] as Array<{ u: string; op: { signal?: AbortSignal } }> };
  (globalThis as { fetch?: unknown }).fetch = (u: string, op: { signal?: AbortSignal }) => { reg.pedidas.push({ u, op }); return o.respuesta ? o.respuesta() : new Promise(() => {}); };
  const c = manifiestoVistaFamilia({ D: { base: o.base === undefined ? "/teselas/x/" : o.base } });
  const api = c.monta({} as never) as { libera(): void; estado(): { vista: string; ocultos: number } };
  return { c, api, reg, m, caja };
}
const sesion = (rol: string) => () => Promise.resolve({ status: 200, json: () => Promise.resolve({ rol }) });

describe("vista de familia: ciclo de vida", () => {
  it("?vista=familia oculta lo justo sin esperar a la sesión y libera() lo deja como estaba", () => {
    const { api, reg, caja } = monta({ busqueda: "?vista=familia", base: "" });
    expect(api.estado().vista).toBe("familia"); expect(api.estado().ocultos).toBeGreaterThan(0); expect(caja.style.display).toBe("none"); expect(reg.pedidas).toEqual([]);
    api.libera(); expect(api.estado().vista).toBe("completa"); expect(api.estado().ocultos).toBe(0); expect(caja.style.display).not.toBe("none");
  });
  it("con servidor pide la sesión una vez con la cookie y, con rol de hogar, pone la vista de familia", async () => {
    const { api, reg } = monta({ respuesta: sesion("hogar") }); await espera();
    expect(reg.pedidas.map(p => p.u)).toEqual(["/api/sesion"]); expect(api.estado().vista).toBe("familia"); api.libera();
  });
  it("libera() corta la sesión en vuelo y lo que llegue tarde no cambia nada", async () => {
    let suelta: (r: unknown) => void = () => {};
    const { api, reg, caja } = monta({ respuesta: () => new Promise(r => { suelta = r; }) }); await espera();
    expect(reg.pedidas[0]!.op.signal!.aborted).toBe(false);
    api.libera(); expect(reg.pedidas[0]!.op.signal!.aborted).toBe(true);
    suelta({ status: 200, json: () => Promise.resolve({ rol: "hogar" }) }); await espera();
    expect(api.estado().vista).toBe("completa"); expect(caja.style.display).not.toBe("none");
  });
  it("el componente es del exterior, con su bandera ?vista= y sin presupuesto; lo puro decide por rol", () => {
    const { c } = monta({ base: "" });
    expect(c.id).toBe(ID_VISTA_FAMILIA); expect(c.mundos).toEqual(["exterior"]); expect(c.bandera).toEqual({ defecto: true, url: "vista" }); expect(c.presupuesto).toEqual({ llamadas: 0, triangulos: 0 });
    expect(VistaFamiliaPuro.vista("", "hogar")).toBe("familia"); expect(VistaFamiliaPuro.vista("", "oficina")).toBe("completa"); expect(VistaFamiliaPuro.vista("", null)).toBe("completa");
  });
});

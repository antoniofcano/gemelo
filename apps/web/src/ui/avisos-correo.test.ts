// El interruptor «Avisarme por correo» (A3-7b2, MU5-n; antes 49_avisos_correo.js). La lógica de la casilla (GET, PUT en fila, deshacer) la prueba
// pruebas/guardianes/avisos_correo.test.js; aquí, lo nuevo: que libera() CANCELA la petición en vuelo (AbortController) y quita la casilla, que no deja nada en la página y que
// el componente es de todos los mundos. HONESTIDAD: fetch y Ajustes son dobles; la casilla en Configuración, en el iPhone y en el Quest, no está probada.
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvisosCorreoPuro, ID_AVISOS_CORREO, creaAvisosCorreo, manifiestoAvisosCorreo } from "./avisos-correo.ts";
import { creaMundo, type Mundo } from "../nucleo/prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { vi.unstubAllGlobals(); if (m) m.limpia(); m = null; });
const tiempoReal = globalThis.setTimeout;   // creaMundo() cambia setTimeout por un doble que nunca salta
const espera = () => new Promise(r => tiempoReal(r, 5));

function ajustesDoble() {
  const reg = { registros: 0, quitados: 0 };
  return { reg, A: { lee: () => false, pon() { /* doble */ }, registra: () => { reg.registros++; return () => { reg.quitados++; }; } } };
}
const HazasPuro = { prefijoApi: (_b: string, base: string) => (/^\/teselas\//.test(base) ? "/api/" : null) };

describe("avisos por correo", () => {
  it("libera() cancela la petición en vuelo y una respuesta tardía no registra nada", async () => {
    m = creaMundo();
    let senal: AbortSignal | null = null, suelta: (r: unknown) => void = () => { /* nada */ };
    vi.stubGlobal("fetch", (_u: string, op: { signal: AbortSignal }) => { senal = op.signal; return new Promise(res => { suelta = res; }); });
    const aj = ajustesDoble();
    const api = creaAvisosCorreo({ D: { base: "/teselas/x/" }, HazasPuro, Ajustes: aj.A });
    await espera();
    expect(senal).not.toBeNull(); expect(senal!.aborted).toBe(false);
    api.libera();
    expect(senal!.aborted).toBe(true);
    suelta({ status: 200, json: () => Promise.resolve({ avisos_correo: true }) }); await espera();
    expect(aj.reg.registros).toBe(0);
  });
  it("libera() tras registrar la casilla la quita una sola vez", async () => {
    m = creaMundo();
    vi.stubGlobal("fetch", () => Promise.resolve({ status: 200, json: () => Promise.resolve({ avisos_correo: true }) }));
    const aj = ajustesDoble(), api = creaAvisosCorreo({ D: { base: "/teselas/x/" }, HazasPuro, Ajustes: aj.A });
    await espera(); expect(aj.reg.registros).toBe(1); expect(api.estado()).toEqual({ visible: true, valor: true });
    api.libera(); api.libera(); expect(aj.reg.quitados).toBe(1);
    expect(m.relojes()).toBe(0); expect(m.escuchas()).toBe(0); expect(m.observadores()).toBe(0);
  });
  it("sin servidor no monta nada y su libera() no rompe", () => {
    m = creaMundo();
    const api = creaAvisosCorreo({ D: { base: "" }, HazasPuro, Ajustes: ajustesDoble().A });
    expect(api.estado().visible).toBe(false); expect(() => api.libera()).not.toThrow();
  });
  it("solo vale { avisos_correo: boolean }", () => {
    expect(AvisosCorreoPuro.valor({ avisos_correo: false })).toBe(false); expect(AvisosCorreoPuro.valor({ avisos_correo: 1 })).toBeNull();
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoAvisosCorreo({ D: {}, HazasPuro, Ajustes: undefined });
    expect(c.id).toBe(ID_AVISOS_CORREO); expect(c.mundos).toBe("todos"); expect(c.bandera.url).toBe("avisos"); expect(c.presupuesto).toEqual({ llamadas: 0, triangulos: 0 });
  });
});

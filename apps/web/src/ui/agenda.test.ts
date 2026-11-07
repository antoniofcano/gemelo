// La agenda en el mundo (A3-7b2, MU5-n; antes 43_agenda.js). La lógica (lista blanca, plazas, apuntarse, avisos, la fila de VR) la prueba pruebas/guardianes/agenda_mundo.test.js;
// aquí, el ciclo de vida con el registro de componentes de verdad: libera() CANCELA lo que esté en vuelo (AbortController), suelta la espera de «Entrar en la visita» (su temporizador
// de 30 s), y con lo que ya soltaba n.limpia no queda reloj, observador, escucha ni gancho; y lo que conteste tarde ya no emite ni repinta.
// HONESTIDAD: DOM y api de mentira; la ventana en el iPhone y en el Quest, y la fila del panel de VR, no se han probado.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ID_AGENDA, manifiestoAgenda } from "./agenda.ts";
import { busPrueba, montaComponente } from "../nucleo/prueba-componentes.ts";
import { creaMundo, type Mundo } from "../nucleo/prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { vi.unstubAllGlobals(); if (m) m.limpia(); m = null; });
const tiempoReal = globalThis.setTimeout;   // creaMundo() cambia setTimeout por un doble que nunca salta
const espera = () => new Promise(r => tiempoReal(r, 5));
const vivasEn = (nodos: Array<{ _escuchas: Record<string, unknown[]> }>) => nodos.reduce((s, n) => s + Object.values(n._escuchas).reduce((a, l) => a + l.length, 0), 0);

const AHORA = Date.now();
const agenda = () => ({ puede_inscribirse: true, eventos: [{ id: 7, titulo: "Visita al olivar", tipo: "guiada", empieza_en: new Date(AHORA + 5 * 60000).toISOString(), plazas: 10, plazas_libres: 4,
  inscripcion_abierta: true, presencial: false, mia: { estado: "apuntado", personas: 2 } }] });

function monta(respuesta: () => Promise<unknown>) {
  m = creaMundo();
  const llamadas: Array<{ u: string; signal: AbortSignal }> = [], quitados = { icono: 0, ventana: 0, filas: 0 }, repinta = vi.fn();
  vi.stubGlobal("fetch", (u: string, op: { signal: AbortSignal }) => { llamadas.push({ u, signal: op.signal }); return respuesta(); });
  const bus = busPrueba(), cuerpo = m.el("div"), contenedor = m.el("section"); contenedor.hidden = true; contenedor.appendChild(cuerpo);
  const dp = {
    D: { base: "/teselas/x/" }, ConfigPuro: { prefijoApi: () => "/api/" }, Bus: bus,
    Hud: { icono: () => () => { quitados.icono++; } },
    Ventanas: { registra: (_id: string, d: { construye(c: unknown): void }) => { d.construye(cuerpo); return () => { quitados.ventana++; }; } },
    PanelVR: { filas: () => () => { quitados.filas++; }, repinta },
  };
  const c = montaComponente(manifiestoAgenda(dp as never), bus), api = c.api() as { carga(): Promise<void> } | null;
  return { c, api, llamadas, quitados, repinta, cuerpo, m };
}
const J = (cuerpo: unknown) => Promise.resolve({ status: 200, json: () => Promise.resolve(cuerpo) });

describe("la agenda del mundo", () => {
  it("libera() cancela la petición en vuelo; lo que conteste tarde no emite ni repinta", async () => {
    let suelta: (r: unknown) => void = () => { /* nada */ };
    const s = monta(() => new Promise(res => { suelta = res; }));
    const emitidos: unknown[] = [];
    s.c.bus.on("agenda:cambia", d => { emitidos.push(d); });
    void s.api!.carga();
    expect(s.llamadas).toHaveLength(1); expect(s.llamadas[0]!.signal.aborted).toBe(false);
    s.c.libera();
    expect(s.llamadas[0]!.signal.aborted).toBe(true);
    suelta({ status: 200, json: () => Promise.resolve(agenda()) }); await espera();
    expect(emitidos).toHaveLength(0); expect(s.repinta).not.toHaveBeenCalled();
  });
  it("libera() suelta la espera de «Entrar en la visita» (su plazo de 30 s) y todo lo demás: sin relojes, escuchas ni ganchos", async () => {
    const s = monta(() => J(agenda()));
    const quitaPresencia = s.c.bus.on("guiada:entrar", () => { /* la presencia de mentira: no contesta */ });
    await s.api!.carga();
    const w = s.m.ventana as { __agenda?: () => { entra(id: number): Promise<boolean> } };
    expect(typeof w.__agenda).toBe("function");
    const entrando = w.__agenda!().entra(7);
    expect(s.m.relojes()).toBeGreaterThanOrEqual(2);   // el plazo de 30 s y el reloj de 20 s
    expect(s.c.bus.oyentes("guiada:entrada")).toBe(1);
    s.c.libera();
    expect(await entrando).toBe(false);
    quitaPresencia();
    expect(s.m.relojes()).toBe(0); expect(s.m.observadores()).toBe(0); expect(vivasEn([s.m.ventana, s.m.documento])).toBe(0);   // los nodos de las tarjetas se van con su ventana: sus escuchas no cuentan
    expect(["vr:entra", "guiada:entrada", "guiada:entrar", "agenda:cambia"].map(e => s.c.bus.oyentes(e))).toEqual([0, 0, 0, 0]); expect(w.__agenda).toBeUndefined();
    expect(s.quitados).toEqual({ icono: 1, ventana: 1, filas: 2 });
  });
  it("el componente es de todos los mundos y no pide nada hasta que se abre la ventana", () => {
    const s = monta(() => J(agenda()));
    expect(manifiestoAgenda({} as never).mundos).toBe("todos"); expect(manifiestoAgenda({} as never).id).toBe(ID_AGENDA);
    expect(s.llamadas).toHaveLength(0); expect(s.c.activo()).toBe(true); expect(s.c.errores).toEqual([]);
  });
  it("sin servidor no monta nada y su libera() no rompe", () => {
    m = creaMundo();
    const c = montaComponente(manifiestoAgenda({ D: { base: "" }, ConfigPuro: { prefijoApi: () => null }, Bus: null, Hud: {}, Ventanas: {}, PanelVR: undefined } as never));
    expect(() => c.libera()).not.toThrow(); expect(c.errores).toEqual([]);
  });
});

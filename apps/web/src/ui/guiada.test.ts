// La visita guiada en el mundo (A3-7b2, MU5-n; antes 46_guiada.js). La lógica (la palabra, la cola de manos, el cierre, el panel del guía, la fila de VR) la prueba
// pruebas/guardianes/guiada.test.js; aquí, el ciclo de vida con el registro de componentes de verdad y una sala de mentira: libera() CANCELA las peticiones a la api en vuelo
// (AbortController) y deja la página como estaba (tira, avisos, ventana, icono, fila de VR, window.__guiada, sin relojes ni escuchas), y L6-13: al rehacerse las listas del panel
// (al armar «¿Sacar? Otra vez») el foco vuelve al botón que lo tenía. HONESTIDAD: DOM, sala y api de mentira; el panel con teclado real, en el iPhone y en el Quest, no está probado.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ID_GUIADA, manifiestoGuiada } from "./guiada.ts";
import { busPrueba, montaComponente } from "../nucleo/prueba-componentes.ts";
import { creaMundo, type Mundo } from "../nucleo/prueba-dom.ts";
import type { Manifiesto } from "../nucleo/componentes.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
let m: Mundo | null = null;
afterEach(() => { vi.unstubAllGlobals(); if (m) m.limpia(); m = null; });
const tiempoReal = globalThis.setTimeout;   // creaMundo() cambia setTimeout por un doble que nunca salta
const espera = () => new Promise(r => tiempoReal(r, 5));
const vivasEn = (nodos: Array<{ _escuchas: Record<string, unknown[]> }>) => nodos.reduce((s, n) => s + Object.values(n._escuchas).reduce((a, l) => a + l.length, 0), 0);
const meta = (alias: string, papel: string) => JSON.stringify({ alias, rol: papel, papel });

function sala(nombre: string, papel: string, gente: Array<{ identidad: string; metadatos: string }> = []) {
  const oy: Record<string, Array<() => void>> = {};
  return {
    al(e: string, fn: () => void) { (oy[e] = oy[e] || []).push(fn); return () => { oy[e] = (oy[e] || []).filter(f => f !== fn); }; },
    escucha() { return () => { /* sin temas */ }; },
    estado: () => "dentro", nombre: () => nombre, yo: () => ({ identidad: "h_yo", metadatos: meta("Rafa", papel) }), participantes: () => gente, atributos: () => ({}),
  };
}
const dobleDe = (id: string, expone: string, api: object): Manifiesto => ({ id, version: 1, consume: [], expone: [expone], eventos: {}, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
  mundos: "todos", monta: () => api, libera: () => { /* doble */ } }) as Manifiesto;

function monta(papel: string, respuesta: () => Promise<unknown>) {
  m = creaMundo();
  const visor = m.el("div"); m.documento.body.appendChild(visor);
  const llamadas: Array<{ u: string; signal: AbortSignal }> = [], quitados = { icono: 0, ventana: 0, fila: 0 };
  vi.stubGlobal("fetch", (u: string, op: { signal: AbortSignal }) => { llamadas.push({ u, signal: op.signal }); return respuesta(); });
  const cuerpo = m.el("section"), gente = [{ identidad: "h_ana", metadatos: meta("Ana", "familia") }, { identidad: "h_eva", metadatos: meta("Eva", "familia") }];
  const s = sala("guiada-12", papel, gente), bus = busPrueba();
  const dp = {
    SalaPose: { leeInfo: (md: string) => JSON.parse(md) }, Laminas: { hay: () => false, abre: () => true, cierra: () => true, repinta: () => true }, visor,
    Ventanas: { registra: (_id: string, d: { construye(c: unknown): void }) => { d.construye(cuerpo); return () => { quitados.ventana++; }; } },
    Hud: { icono: () => () => { quitados.icono++; } }, VRX: { on: false }, PanelVR: { filas: () => () => { quitados.fila++; } },
  };
  const previos = [dobleDe("red-salas", "Red", { salas: () => ["visita"], sala: () => s }), dobleDe("presencia-compartida", "Presencia", { sala: () => "guiada", cambiaSala: () => Promise.resolve(true) }),
    dobleDe("voz-guiada", "Voz", { sale: () => Promise.resolve() })];
  const c = montaComponente(manifiestoGuiada(dp as A), bus, previos);
  return { c, llamadas, quitados, cuerpo, visor, m, tic: () => (c.api() as A).tarde(0.25) };
}
const J = (cuerpo: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) });

describe("la visita guiada del mundo", () => {
  it("el componente es de todos los mundos y no crea nada hasta estar en una sala guiada", () => {
    const s = monta("guia", () => J({}));
    expect(manifiestoGuiada({} as A).mundos).toBe("todos"); expect(manifiestoGuiada({} as A).id).toBe(ID_GUIADA);
    expect(s.c.activo()).toBe(true); expect(s.c.errores).toEqual([]);
  });
  it("libera() cancela la petición a la api en vuelo y deja la página como estaba", async () => {
    const s = monta("guia", () => new Promise(() => { /* la api no contesta */ }));
    s.tic();
    expect(s.visor.children.length).toBe(2);   // la tira y la región aria-live
    expect(s.llamadas.length).toBeGreaterThan(0); expect(s.llamadas.every(l => l.signal.aborted === false)).toBe(true);
    expect(s.quitados).toEqual({ icono: 0, ventana: 0, fila: 0 });
    s.c.libera();
    expect(s.llamadas.every(l => l.signal.aborted)).toBe(true);
    expect(s.visor.children.length).toBe(0); expect(s.quitados.icono).toBe(1); expect(s.quitados.ventana).toBe(1); expect(s.quitados.fila).toBe(1);
    expect((s.m.ventana as A).__guiada).toBeUndefined();
    await espera();
    expect(s.m.relojes()).toBe(0); expect(s.m.observadores()).toBe(0); expect(vivasEn([s.m.ventana, s.m.documento])).toBe(0);
    expect(s.c.bus.oyentes("voz:estado")).toBe(0); expect(s.c.bus.oyentes("depura:lineas")).toBe(0);
  });
  it("L6-13: al armar «¿Sacar? Otra vez» el foco vuelve al botón que lo tenía", async () => {
    const s = monta("guia", () => J({ inscritos: { apuntados: 2, conectados: 2 }, turno: null, manos: [], cierra_en: null }));
    s.tic();
    const botones = () => s.cuerpo.querySelectorAll("button").filter((b: A) => /^Sacar a Ana/.test(b.getAttribute("aria-label") || ""));
    expect(botones()).toHaveLength(1);
    const antes = botones()[0]; antes.focus();
    expect(s.m.documento.activeElement).toBe(antes);
    antes.click();   // arma la confirmación: la lista se rehace
    await espera();
    const despues = botones()[0];
    expect(despues).not.toBe(antes); expect(despues.textContent).toBe("¿Sacar? Otra vez");
    expect(s.m.documento.activeElement).toBe(despues);
    s.c.libera();
  });
});

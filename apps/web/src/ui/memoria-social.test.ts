// La memoria de lo social de la interfaz (A3-7b2, MU5-n): la agenda, la visita guiada y el interruptor de avisos por correo montados juntos en un mismo registro de componentes
// (el del núcleo, de verdad), con una petición de cada una en vuelo, y luego liberados como los liberaría el último mundo vivo. Tras liberar no queda ningún reloj, ningún
// observador ni ninguna escucha en la ventana, el documento o el Bus, todas las peticiones están canceladas, y los ganchos de las pruebas (window.__agenda, __guiada) no existen.
// HONESTIDAD: DOM, red y api de mentira; en el navegador, la prueba de «con y sin» va por el banco.
import { afterEach, describe, expect, it, vi } from "vitest";
import { manifiestoAgenda } from "./agenda.ts";
import { manifiestoAvisosCorreo } from "./avisos-correo.ts";
import { manifiestoGuiada } from "./guiada.ts";
import { busPrueba, montaComponente } from "../nucleo/prueba-componentes.ts";
import { creaMundo, type Mundo } from "../nucleo/prueba-dom.ts";
import type { Manifiesto } from "../nucleo/componentes.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
let m: Mundo | null = null;
afterEach(() => { vi.unstubAllGlobals(); if (m) m.limpia(); m = null; });
const tiempoReal = globalThis.setTimeout;
const espera = () => new Promise(r => tiempoReal(r, 5));
const vivasEn = (nodos: Array<{ _escuchas: Record<string, unknown[]> }>) => nodos.reduce((s, n) => s + Object.values(n._escuchas).reduce((a, l) => a + l.length, 0), 0);
const meta = (alias: string, papel: string) => JSON.stringify({ alias, rol: papel, papel });
const dobleDe = (id: string, expone: string, api: object): Manifiesto => ({ id, version: 1, consume: [], expone: [expone], eventos: {}, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
  mundos: "todos", monta: () => api, libera: () => { /* doble */ } }) as Manifiesto;

describe("lo social de la interfaz, montado y liberado", () => {
  it("no deja relojes, observadores ni escuchas, y cancela todo lo que estaba en vuelo", async () => {
    m = creaMundo();
    const bus = busPrueba(), senales: AbortSignal[] = [];
    vi.stubGlobal("fetch", (_u: string, op: { signal: AbortSignal }) => { senales.push(op.signal); return new Promise(() => { /* nadie contesta */ }); });
    vi.stubGlobal("location", { search: "" });
    const visor = m.el("div"); m.documento.body.appendChild(visor);
    const cuerpo = m.el("div"), contenedor = m.el("section"); contenedor.hidden = true; contenedor.appendChild(cuerpo);
    const Ventanas = { registra: (_id: string, d: { construye(c: unknown): void }) => { d.construye(m!.el("div")); return () => { /* doble */ }; }, abierta: () => null, cierra() { /* doble */ } };
    const Hud = { icono: () => () => { /* doble */ } }, PanelVR = { filas: () => () => { /* doble */ }, repinta() { /* doble */ } };
    const sala = { al: () => () => { /* doble */ }, escucha: () => () => { /* doble */ }, estado: () => "dentro", nombre: () => "guiada-12",
      yo: () => ({ identidad: "h_yo", metadatos: meta("Rafa", "guia") }), participantes: () => [], atributos: () => ({}) };
    const previos = [dobleDe("red-salas", "Red", { salas: () => ["visita"], sala: () => sala }), dobleDe("presencia-compartida", "Presencia", { sala: () => "guiada", cambiaSala: () => Promise.resolve(true) }),
      dobleDe("voz-guiada", "Voz", { sale: () => Promise.resolve() }),
      manifiestoAgenda({ D: { base: "/teselas/x/" }, Bus: bus, ConfigPuro: { prefijoApi: () => "/api/" }, Hud, Ventanas, PanelVR } as A),
      manifiestoAvisosCorreo({ D: { base: "/teselas/x/" }, HazasPuro: { prefijoApi: () => "/api/" }, Ajustes: { registra: () => () => { /* doble */ }, pon() { /* doble */ } } })];
    const c = montaComponente(manifiestoGuiada({ SalaPose: { leeInfo: (md: string) => JSON.parse(md) }, Laminas: { hay: () => false, abre: () => true, cierra: () => true, repinta: () => true }, visor, Ventanas, Hud,
      VRX: { on: false }, PanelVR } as A), bus, previos);
    const agenda = c.C.api("agenda") as A;
    void agenda.carga(); (c.api() as A).tarde(0.25); await espera();
    expect(senales.length).toBeGreaterThanOrEqual(3);   // la agenda, los avisos por correo y el sondeo de la guiada
    expect(senales.every(s => !s.aborted)).toBe(true);
    expect(c.C.resumen().filter(f => f.activo).map(f => f.id).sort()).toEqual(["agenda", "avisos-correo", "presencia-compartida", "red-salas", "visita-guiada", "voz-guiada"]);
    expect(m.relojes()).toBeGreaterThan(0);
    c.libera();
    expect(c.C.resumen().filter(f => f.activo)).toEqual([]);
    expect(senales.every(s => s.aborted)).toBe(true);
    expect(m.relojes()).toBe(0); expect(m.observadores()).toBe(0); expect(vivasEn([m.ventana, m.documento])).toBe(0);
    expect(bus.oyentes("voz:estado") + bus.oyentes("depura:lineas") + bus.oyentes("vr:entra") + bus.oyentes("guiada:entrada")).toBe(0);
    expect((m.ventana as A).__agenda).toBeUndefined(); expect((m.ventana as A).__guiada).toBeUndefined(); expect(visor.children.length).toBe(0);
    expect(c.errores).toEqual([]);
  });
});

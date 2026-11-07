// El anfitrión de juegos y «Cae la cosecha» (A3-7b2, MU5-n; antes 40_juegos.js y 41_cae_la_cosecha.js). Las reglas, el dibujo, el récord, la clasificación y el anfitrión por dentro los
// prueba pruebas/guardianes/juego_cosecha.test.js; aquí, el ciclo de vida con el registro de componentes de verdad y un DOM de mentira: con una partida abierta, libera() CANCELA
// las peticiones en vuelo (AbortController), cierra la partida y devuelve la pausa al mundo, y no deja ni escuchas en la ventana y el documento, ni relojes, ni observadores, ni
// window.__juegos; y el juego se retira del anfitrión al liberarse. HONESTIDAD: DOM, api y canvas de mentira; las manos reales (táctil, teclado, gatillo) no están probadas.
import { afterEach, describe, expect, it, vi } from "vitest";
import { manifiestoCaeLaCosecha, ID_CAE_LA_COSECHA } from "./cae-la-cosecha.ts";
import { ID_JUEGOS, manifiestoJuegos } from "./juegos.ts";
import { busPrueba, montaComponente } from "../../nucleo/prueba-componentes.ts";
import { creaMundo, type Mundo } from "../../nucleo/prueba-dom.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
let m: Mundo | null = null;
afterEach(() => { vi.unstubAllGlobals(); if (m) m.limpia(); m = null; });
const tiempoReal = globalThis.setTimeout;   // creaMundo() cambia setTimeout por un doble que nunca salta
const espera = () => new Promise(r => tiempoReal(r, 5));
const vivasEn = (nodos: Array<{ _escuchas: Record<string, unknown[]> }>) => nodos.reduce((s, n) => s + Object.values(n._escuchas).reduce((a, l) => a + l.length, 0), 0);

function monta(respuesta: () => Promise<unknown>) {
  m = creaMundo({ busqueda: "" });
  const bus = busPrueba(), llamadas: Array<{ u: string; signal: AbortSignal }> = [], pausas = new Set<string>(), quitados = { icono: 0, ventana: 0, tecla: 0 };
  vi.stubGlobal("fetch", (u: string, op: A) => { llamadas.push({ u, signal: op.signal }); return respuesta(); });
  vi.stubGlobal("location", { search: "" });
  const cuerpo = m.el("div"), contenedor = m.el("section"); contenedor.hidden = true; contenedor.appendChild(cuerpo);
  const dp = {
    D: { base: "/teselas/x/", finca_id: "cerro" }, Pausa: { pon: (k: string) => { pausas.add(k); return true; }, quita: (k: string) => { pausas.delete(k); }, activa: () => pausas.size > 0 },
    ConfigPuro: { prefijoApi: () => "/api/" }, Config: { tablaEpocas: () => null, epocaDeFecha: () => null }, Teclas: { registra: () => () => { quitados.tecla++; } },
    Laminas: { abre: () => true, cierra: () => true, hay: () => false, repinta() { /* doble */ }, info: () => null }, Hud: { icono: () => () => { quitados.icono++; }, alterna() { /* doble */ } },
    Ventanas: { registra: (_id: string, d: { construye(c: unknown): void }) => { d.construye(cuerpo); return () => { quitados.ventana++; }; }, abierta: () => null, cierra() { /* doble */ } },
    VRX: { on: false }, PanelVR: undefined,
  };
  const juego = manifiestoCaeLaCosecha({ Bus: bus });
  const c = montaComponente(manifiestoJuegos(dp as A), bus, [juego]);
  return { c, bus, llamadas, pausas, quitados, m, dp };
}
const J = (cuerpo: unknown) => Promise.resolve({ status: 200, json: () => Promise.resolve(cuerpo) });

describe("el anfitrión de juegos y «Cae la cosecha»", () => {
  it("los dos son del exterior (los juegos son del olivar)", () => {
    expect(manifiestoJuegos({} as A).mundos).toEqual(["exterior"]); expect(manifiestoJuegos({} as A).id).toBe(ID_JUEGOS);
    expect(manifiestoCaeLaCosecha({} as A).mundos).toEqual(["exterior"]); expect(manifiestoCaeLaCosecha({} as A).id).toBe(ID_CAE_LA_COSECHA);
  });
  it("el anfitrión recoge el juego por el Bus y se lo quita al liberarse el juego", () => {
    const s = monta(() => J(null)), api = s.c.api() as A;
    expect(s.m.documento.getElementById("juegoCapa")).toBeNull();
    expect((s.m.ventana as A).__juegos().juegos).toEqual(["cae-la-cosecha"]);
    s.c.C.libera("cae-la-cosecha");
    expect((s.m.ventana as A).__juegos().juegos).toEqual([]);
    expect(api.abierto()).toBeNull(); s.c.libera();
  });
  it("con una partida abierta, libera() cancela lo que esté en vuelo, devuelve la pausa al mundo y no deja nada", async () => {
    const s = monta(() => new Promise(() => { /* la api no contesta */ })), api = s.c.api() as A;
    expect(api.abre("cae-la-cosecha")).toBe(true);
    expect(s.m.documento.getElementById("juegoCapa")).toBeTruthy(); expect(s.pausas.has("juegos")).toBe(true);
    expect(s.llamadas.map(l => l.u)).toEqual(["/api/juegos/cae-la-cosecha/records"]); expect(s.llamadas[0]!.signal.aborted).toBe(false);
    expect(vivasEn([s.m.ventana, s.m.documento])).toBeGreaterThan(0);
    s.c.libera();
    expect(s.llamadas[0]!.signal.aborted).toBe(true);
    expect(s.m.documento.getElementById("juegoCapa")).toBeNull(); expect(s.pausas.size).toBe(0); expect(api.abierto()).toBeNull();
    expect((s.m.ventana as A).__juegos).toBeUndefined();
    expect(s.quitados).toEqual({ icono: 1, ventana: 1, tecla: 1 });
    await espera();
    expect(s.m.relojes()).toBe(0); expect(s.m.observadores()).toBe(0); expect(vivasEn([s.m.ventana, s.m.documento])).toBe(0);
    expect(s.bus.oyentes("juego:ofrece") + s.bus.oyentes("juego:retira") + s.bus.oyentes("vr:entra") + s.bus.oyentes("vr:sale")).toBe(0);
  });
});

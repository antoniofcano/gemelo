// El sonido del olivar (A3-4, MU5-n; antes 20_sonido.js), con un AudioContext y unos Ajustes de mentira. Se comprueba: el manifiesto de siempre, que libera()
// cierra el AudioContext y quita las escuchas (con n.limpia), y L1-10: el interruptor y el volumen se leen de Ajustes una vez y no en cada fotograma, y se
// vuelven a leer cuando cambia un ajuste del sonido. HONESTIDAD: nada suena; lo que se oye lo dice un aparato real.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { manifiestoSonido } from "./sonido.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
/** un AudioContext de mentira: cualquier método devuelve otro nodo; cuenta los que se crean y se cierran */
function audioFalso() {
  const cuenta = { creados: 0, cerrados: 0 };
  const nodo = (): A => { const g: A = {}; return new Proxy(function () {}, { get: (_t, k) => (k === "getChannelData" ? () => new Float32Array(64) : k in g ? g[k] : (g[k] = nodo())), set: (_t, k, v) => { g[k] = v; return true; }, apply: () => nodo() }); };
  class AC { state = "running"; currentTime = 0; sampleRate = 8000; destination = nodo(); constructor() { cuenta.creados++; }
    resume() { return Promise.resolve(); } close() { cuenta.cerrados++; return Promise.resolve(); } createBuffer() { return { getChannelData: () => new Float32Array(16000) }; } }
  const C = new Proxy(AC, { construct: (T, a) => new Proxy(new (T as A)(...a), { get: (o, k) => (k in o ? o[k] : typeof k === "string" && k.startsWith("create") ? () => nodo() : undefined) }) });
  return { C, cuenta };
}
function monta(conAvisos = true) {
  const A0 = audioFalso(), oyentes: Record<string, A[]> = {}, avisos: A[] = [], lecturas: string[] = [], valores: A = { "sonido.activo": true, "sonido.volumen": 80 };
  const ventana = { AudioContext: A0.C, addEventListener: (n: string, f: A) => { (oyentes[n] = oyentes[n] || []).push(f); }, removeEventListener: (n: string, f: A) => { oyentes[n] = (oyentes[n] || []).filter(x => x !== f); } };
  const Ajustes: A = { lee: (k: string) => { lecturas.push(k); return valores[k]; }, pon(k: string, v: A) { valores[k] = v; avisos.forEach(f => f(k, v)); }, registra: () => () => {} };
  if (conAvisos) Ajustes.alCambiar = (f: A) => { avisos.push(f); return () => { avisos.splice(avisos.indexOf(f), 1); }; };
  const man = manifiestoSonido({
    ventana, documento: { hidden: false }, cur: { ms: 0, viento: 3, lluvia: 0, temp: 20 }, nivelEn: (_ms: number, s: A) => { s.d = 1; return s; },
    ajustes: () => Ajustes, panelVR: () => null, vrx: () => null, paseando: () => true, teclas: () => ({ run: false }), pp: () => ({ x: 0, y: 0, paso: 0 }), tVida: () => 0,
    enQuad: () => false, vq: () => 0, enDron: () => false, dr: () => ({ x: 0, y: 0, vf: 0, vh: 0 }), aguaNivel: () => 0, distArroyo: () => 50
  });
  const limpias: A[] = [], bus: Record<string, A[]> = {};
  const n: A = { on: (ev: string, f: A) => { (bus[ev] = bus[ev] || []).push(f); limpias.push(() => { bus[ev] = []; }); return f; }, emite: () => 0, limpia: (f: A) => { limpias.push(f); return f; }, api: () => null, parametros: {} };
  const api: A = man.monta(n);
  return { man, api, A0, oyentes, avisos, lecturas, valores, Ajustes, bus, limpias };
}

describe("el sonido del olivar (componente del exterior)", () => {
  it("el manifiesto de siempre: vale, «sonido-ambiente», ?sonido=0 lo apaga, escucha sus cinco eventos y es del exterior", () => {
    const { man } = monta();
    expect(ComponentesPuro.valida(man)).toEqual([]); expect(man.id).toBe("sonido-ambiente"); expect(man.bandera).toEqual({ defecto: true, url: "sonido" });
    expect(man.eventos.escucha).toEqual(["audio:desbloquea", "sonido:baliza", "sonido:golpe", "sonido:juego", "sonido:ladrido"]); expect(man.mundos).toEqual(["exterior"]);
  });
  it("L1-10: el interruptor y el volumen se leen de Ajustes una vez, no en cada fotograma; al cambiar un ajuste del sonido se vuelven a leer", () => {
    const { man, api, lecturas, Ajustes } = monta();
    api.inicia(); lecturas.length = 0;
    for (let i = 0; i < 60; i++) man.actualiza!.mundo!(0.016, i, api);
    expect(lecturas).toEqual(["sonido.volumen"]);   // el interruptor ya se leyó al arrancar; antes: 120 lecturas (dos por fotograma)
    Ajustes.pon("sonido.volumen", 40); lecturas.length = 0;
    for (let i = 0; i < 30; i++) man.actualiza!.mundo!(0.016, i, api);
    expect(lecturas.sort()).toEqual(["sonido.activo", "sonido.volumen"]);
    man.libera(api);
  });
  it("sin avisos de Ajustes (alCambiar), se lee cada vez, como antes", () => {
    const { man, api, lecturas } = monta(false);
    api.inicia(); lecturas.length = 0;
    for (let i = 0; i < 10; i++) man.actualiza!.mundo!(0.016, i, api);
    expect(lecturas.length).toBe(20);
    man.libera(api);
  });
  it("libera() cierra el AudioContext; las escuchas (el gesto, el Bus, los avisos de Ajustes) se quitan con n.limpia", () => {
    const { man, api, A0, oyentes, avisos, limpias } = monta();
    expect(oyentes["pointerdown"]!.length).toBe(1); expect(avisos.length).toBe(1);
    api.inicia(); expect(A0.cuenta.creados).toBe(1); api.inicia(); expect(A0.cuenta.creados).toBe(1);
    man.libera(api); limpias.forEach(f => f());
    expect(A0.cuenta.cerrados).toBe(1); expect(oyentes["pointerdown"]!.length).toBe(0); expect(avisos.length).toBe(0); expect(api.activo()).toBe(false);
  });
});

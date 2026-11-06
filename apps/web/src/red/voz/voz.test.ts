// La voz (red/voz/voz.ts; MU5-n, A3-6b: antes 45_voz.js). En Node, con dobles de una sala de la red (la api de red-salas: LiveKit no se carga aquí), de Web Audio
// (AudioContext, ganancia, panner) y del DOM (<audio>). Lo que pide la migración: la cercanía y el turno de forma pura (no cambian: los mismos números que ADR-0026 y
// ADR-0032), el componente de todo mundo, y que su libera() suelte de verdad las pistas (cada <audio> fuera, su srcObject a null), el AudioContext y sus nodos,
// cierre el micrófono, salga de su sala de voz (también si se libera mientras entraba) y quite sus escuchas y el gancho. Lo de siempre (oír, hablar, el eco, quién
// habla) lo cubre a fondo pruebas/guardianes/voz.test.js; los corros, corro.test.js. HONESTIDAD: aquí no suena nada (regla 7): es la lógica, no el audio real.
import { describe, expect, it } from "vitest";
import { ID_VOZ, VozPuro, creaVoz, manifiestoVoz } from "./voz.ts";
import type { DepsVoz } from "./voz.ts";

describe("VozPuro: la cercanía y el turno no cambian (A3-6b)", () => {
  it("la ganancia por distancia: guiada (ref 2 m, rolloff 1, suelo 0,25 para la prioritaria, corte a 40 m) y corro (sin suelo, fundido de 15 a 20 m)", () => {
    expect(VozPuro.DIST).toEqual({ ref: 2, rolloff: 1, corte: 40, minimo: 0.25, sinSitio: 0.5 });
    expect(VozPuro.DIST_CORRO).toEqual({ desde: 15, corte: 20, fundido: 1 });
    expect(VozPuro.ganancia(2, false)).toBe(1); expect(VozPuro.ganancia(4, false)).toBeCloseTo(0.5, 12); expect(VozPuro.ganancia(10, true)).toBeCloseTo(0.25, 12);
    expect(VozPuro.ganancia(41, false)).toBe(0); expect(VozPuro.ganancia(500, true)).toBeCloseTo(0.25, 12);
    expect(VozPuro.ganancia(10, false, "corro")).toBeCloseTo(0.2, 12); expect(VozPuro.ganancia(17.5, true, "corro")).toBeCloseTo((2 / 17.5) * 0.5, 12);
    expect(VozPuro.ganancia(20, true, "corro")).toBe(0);
    for (let d = 0; d < 60; d += 0.5) {   // nunca sube al alejarse, en ningún ámbito
      for (const amb of ["guiada", "corro"]) for (const p of [true, false]) expect(VozPuro.ganancia(d + 0.5, p, amb)).toBeLessThanOrEqual(VozPuro.ganancia(d, p, amb));
    }
    expect(VozPuro.suaveDe("corro")).toBeCloseTo(1 / 3, 12); expect(VozPuro.suaveDe("guiada")).toBe(VozPuro.SUAVE);
  });
  it("el turno de palabra (palabra_hasta) y quién es prioritaria; el tope de voces es 4 y el guía va el primero", () => {
    const t0 = Date.parse("2026-11-07T10:00:00Z");
    expect(VozPuro.turno({ palabra_hasta: "2026-11-07T10:02:00Z" }, t0)).toBe(120); expect(VozPuro.turno({ palabra_hasta: "2026-11-07T09:00:00Z" }, t0)).toBe(0);
    expect(VozPuro.turno({}, t0)).toBeNull();
    expect(VozPuro.prioritaria("familia", 30)).toBe(true); expect(VozPuro.prioritaria("familia", 0)).toBe(false); expect(VozPuro.prioritaria("guia", null)).toBe(true);
    expect(VozPuro.MAX_VOCES).toBe(4);
    const info: Record<string, any> = { g: { papel: "guia" }, f: { papel: "familia", turno: 20 } };
    const pubs = ["a", "b", "c", "f", "g", "d"].map(id => ({ identidad: id, sid: "S" + id, fuente: "microphone" }));
    expect(VozPuro.aSuscribir(pubs, (id: string) => info[id])).toEqual(["Sg", "Sf", "Sa", "Sb"]);
    expect(VozPuro.aSuscribir(pubs, (id: string) => info[id], undefined, { g: true })).toEqual(["Sf", "Sa", "Sb", "Sc"]);   // a quien silencias no se le pide la pista
  });
  it("el micrófono: solo dentro de una sala de voz, con permiso y tras un gesto", () => {
    expect(VozPuro.decideAbrir({ dentro: true, guiada: true, micro: "cerrado", puede: true, gesto: true })).toEqual({ abre: true, motivo: "ok" });
    expect(VozPuro.decideAbrir({ dentro: true, guiada: true, micro: "cerrado", puede: true, gesto: false }).motivo).toBe("sin_gesto");
    expect(VozPuro.decideAbrir({ dentro: true, guiada: true, micro: "cerrado", puede: false, gesto: true }).motivo).toBe("sin_permiso");
    expect(VozPuro.esSalaVoz("corro-ABCdef123_-x")).toBe(true); expect(VozPuro.esSalaVoz("hituelo-libre")).toBe(false);
  });
});

// ---------- dobles
class Nodo { conectados: unknown[] = []; desconectado = false; gain = { value: 1, setTargetAtTime(v: number) { this.value = v; } };
  connect(x: unknown) { this.conectados.push(x); return x; } disconnect() { this.desconectado = true; this.conectados = []; } }
function webAudio() {
  const c = { contextos: [] as any[], nodos: [] as Nodo[] };
  class AC {
    state = "running"; currentTime = 0; destination = new Nodo(); cerrado = false;
    listener = Object.fromEntries(["positionX", "positionY", "positionZ", "forwardX", "forwardY", "forwardZ", "upX", "upY", "upZ"].map(k => [k, { value: 0, setTargetAtTime(v: number) { this.value = v; } }]));
    constructor() { c.contextos.push(this); }
    createGain() { const n = new Nodo(); c.nodos.push(n); return n; }
    createMediaStreamSource() { const n = new Nodo(); c.nodos.push(n); return n; }
    createPanner() { const n: any = new Nodo(); n.positionX = { value: 0, setTargetAtTime(v: number) { this.value = v; } }; n.positionY = { ...n.positionX }; n.positionZ = { ...n.positionX }; c.nodos.push(n); return n; }
    resume() { return Promise.resolve(); }
    close() { this.cerrado = true; this.state = "closed"; return Promise.resolve(); }
  }
  return { c, AC };
}
class El { tagName: string; parentNode: El | null = null; children: El[] = []; muted = false; volume = 1; paused = true; hidden = false; srcObject: unknown = null; attrs: Record<string, string> = {};
  constructor(t: string) { this.tagName = t.toUpperCase(); }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  appendChild(x: El) { this.children.push(x); x.parentNode = this; return x; } removeChild(x: El) { this.children.splice(this.children.indexOf(x), 1); x.parentNode = null; return x; }
  play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } }
/** una sala de la red (la api de red-salas) con lo justo para la voz; une() se puede retrasar para liberar a mitad */
function salaFalsa(nombre: string) {
  const oy: Record<string, ((d?: any) => void)[]> = {};
  const s: any = { _estado: "fuera", _micro: false, salidas: 0, micro: [] as boolean[], pubs: [] as any[], retraso: null as null | Promise<void>,
    al(e: string, f: (d?: any) => void) { (oy[e] = oy[e] || []).push(f); return () => { oy[e]!.splice(oy[e]!.indexOf(f), 1); }; },
    emite(e: string, d?: unknown) { (oy[e] || []).slice().forEach(f => f(d)); }, oyentes() { return Object.values(oy).reduce((a, l) => a + l.length, 0); },
    estado: () => s._estado, nombre: () => (s._estado === "dentro" ? nombre : ""), permisos: () => (s._estado === "dentro" ? { publicar: true, fuentes: ["microphone"], datos: true } : null),
    yo: () => ({ identidad: "h_yo", metadatos: JSON.stringify({ papel: "guia" }) }), participantes: () => [], atributos: () => ({}), publicaciones: () => s.pubs,
    suscribe: (_id: string, sid: string, si: boolean) => { const p = s.pubs.find((x: any) => x.sid === sid); if (p) p.suscrita = si; return !!p; },
    microfono: (si: boolean) => { s.micro.push(si); s._micro = si; return Promise.resolve(true); }, microAbierto: () => s._micro,
    une: async () => { if (s.retraso) await s.retraso; s._estado = "dentro"; return true; },
    sale: () => { s.salidas++; s._estado = "fuera"; s.emite("estado", { estado: "fuera", motivo: "propio" }); return Promise.resolve(); } };
  return s;
}
function monta(nombre = "guiada-7") {
  const { c, AC } = webAudio(), sala = salaFalsa(nombre), body = new El("body"), escuchas: Record<string, number> = {}, limpias: (() => void)[] = [], bus: Record<string, number> = {};
  const window: any = { AudioContext: AC, addEventListener: (n: string) => { escuchas[n] = (escuchas[n] || 0) + 1; }, removeEventListener: (n: string) => { escuchas[n]!--; } };
  const camara = { quaternion: { x: 0, y: 0, z: 0, w: 1 }, getWorldPosition: (v: any) => v, getWorldQuaternion: (q: any) => q };
  class V3 { x = 0; y = 0; z = 0; copy(v: any) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } }
  class Q { x = 0; y = 0; z = 0; w = 1; setFromAxisAngle() { return this; } multiply() { return this; } }
  const dp: DepsVoz = { THREE: { Quaternion: Q, Vector3: V3 }, location: { search: "" }, window, document: { createElement: (t: string) => new El(t), body }, camera: camara,
    fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ url: "/rtc", token: "t" }) }), consola: { warn() {} },
    VRX: { on: false }, Aparato: { clase: () => "escritorio" }, navigator: { userActivation: { isActive: true } }, MediaStream: function (this: any, p: unknown[]) { this.pistas = p; }, PannerNode: undefined };
  const n = { emite: () => 0, on: (e: string) => { bus[e] = (bus[e] || 0) + 1; limpias.push(() => { bus[e]!--; }); }, limpia: (f: () => void) => { limpias.push(f); return f; } };
  const R = { sala: (clave: string) => (clave === "guiada" || clave === "corro" ? sala : null) };
  const api: any = creaVoz(dp, n, R, { cabeza: () => ({ x: 0, y: 1.6, z: -3 }) });
  return { api, sala, c, body, window, escuchas, bus, limpia: () => limpias.splice(0).forEach(f => f()) };
}

describe("creaVoz: componente de todo mundo con libera() de verdad (A3-6b)", () => {
  it("el manifiesto es de todo mundo, sin dibujo, con la bandera ?voz y la api de siempre", () => {
    const def = manifiestoVoz({} as DepsVoz);
    expect(def.id).toBe(ID_VOZ); expect(def.mundos).toBe("todos"); expect(def.presupuesto).toEqual({ llamadas: 0, triangulos: 0 });
    expect(def.bandera).toEqual({ defecto: true, url: "voz" }); expect(def.expone).toEqual(["Voz"]); expect(def.consume).toEqual(["Aparato", "Red", "Presencia", "VRX"]);
    expect(def.eventos).toEqual({ escucha: ["audio:desbloquea", "depura:lineas", "red:estado"], emite: ["voz:habla", "voz:estado"] });
    const m = monta();
    expect(Object.keys(m.api).sort()).toEqual(["abre", "actualiza", "auriculares", "cierra", "entra", "entraCorro", "estado", "hablan", "libera", "sale", "silencia", "usa"]);
    expect(m.c.contextos).toHaveLength(0); expect(m.body.children).toHaveLength(0);   // montada no crea nada
  });

  it("libera() suelta cada <audio>, la fuente, la ganancia y el panner de cada voz, cierra el micrófono y el AudioContext, sale de su sala y quita el gancho", async () => {
    const m = monta();
    m.sala.pubs = [{ identidad: "h_guia", sid: "A1", fuente: "microphone", suscrita: false }, { identidad: "h_f", sid: "A2", fuente: "microphone", suscrita: false }];
    expect(await m.api.entra(7)).toBe(true);
    m.sala.emite("pista", { identidad: "h_guia", sid: "A1", fuente: "microphone", mst: { id: "1" } });
    m.sala.emite("pista", { identidad: "h_f", sid: "A2", fuente: "microphone", mst: { id: "2" } });
    expect(typeof m.window.__voz).toBe("function");
    // el gesto: un AudioContext con un grafo por voz
    expect(await m.api.abre()).toBe(true);   // con permiso y gesto (navigator.userActivation), y desbloquea el audio
    await Promise.resolve();
    const audios = m.body.children.slice();
    expect(audios).toHaveLength(2); expect(m.c.contextos).toHaveLength(1); expect(m.c.nodos.length).toBeGreaterThanOrEqual(1 + 3 * 2);   // la salida y fuente, ganancia y panner por voz
    m.api.libera(); m.limpia();
    expect(m.body.children).toHaveLength(0);   // cada <audio>, fuera del DOM…
    for (const a of audios) { expect(a.srcObject).toBeNull(); expect(a.paused).toBe(true); }   // …parado y sin su pista
    expect(m.c.nodos.slice(1).every(x => x.desconectado)).toBe(true);   // fuente, ganancia y panner de cada voz, desconectados (la salida se va con el contexto)
    expect(m.c.contextos[0].cerrado).toBe(true);
    expect(m.sala.micro).toEqual([true, false]);   // el micrófono, cerrado
    expect(m.sala.salidas).toBe(1); expect(m.sala.oyentes()).toBe(0);   // fuera de su sala y sin escucharla
    expect(m.window.__voz).toBeUndefined();
    expect(Object.values(m.escuchas).every(v => v === 0)).toBe(true); expect(Object.values(m.bus).every(v => v === 0)).toBe(true);   // la ventana y el Bus
    m.window.AudioContext = function () { throw new Error("no debe crear otro"); };
    m.sala.emite("pista", { identidad: "h_guia", sid: "A1", fuente: "microphone", mst: { id: "1" } });   // lo que llegue tarde ya no monta nada
    expect(m.body.children).toHaveLength(0);
  });

  it("liberada mientras entraba en la sala (el token llegó, une() aún no): sale de ella en cuanto entra, en la guiada y en el corro", async () => {
    for (const [nombre, entra] of [["guiada-7", (a: any) => a.entra(7)], ["corro-ABCdef123_-x", (a: any) => a.entraCorro()]] as const) {
      const m = monta(nombre); let suelta: () => void = () => {};
      m.sala.retraso = new Promise<void>(r => { suelta = r; });
      const p = entra(m.api);
      await new Promise(r => setTimeout(r, 0));   // el fetch del token ya contestó; une() está esperando
      m.api.libera();
      suelta(); expect(await p).toBe(false);
      expect(m.sala.salidas).toBe(1); expect(m.sala.estado()).toBe("fuera"); expect(m.sala.oyentes()).toBe(0);
    }
  });

  it("si la voz usa la sala de la presencia (Voz.usa), libera() la desengancha pero no la deja: la sala es de la presencia", () => {
    const m = monta(); m.sala._estado = "dentro";
    const R = { sala: () => m.sala };
    const api: any = creaVoz({ THREE: { Quaternion: class {}, Vector3: class {} } as any, location: { search: "" }, window: { addEventListener() {}, removeEventListener() {} }, document: { body: new El("body"), createElement: (t: string) => new El(t) },
      camera: {}, fetch: () => Promise.reject(new Error("no")), VRX: null, Aparato: null, navigator: undefined, MediaStream: undefined, PannerNode: undefined }, { emite: () => 0, on() {}, limpia: (f: unknown) => f }, R, null);
    expect(api.usa("visita")).toBe(true); expect(m.sala.oyentes()).toBeGreaterThan(0);
    api.libera();
    expect(m.sala.salidas).toBe(0); expect(m.sala.oyentes()).toBe(0);
  });
});

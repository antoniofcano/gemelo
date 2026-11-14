// La red (red/salas.ts; MU5-n, A3-6a): RedPuro con un LiveKit de mentira y el manifiesto del componente de todo mundo con su libera() de verdad.
// Lo de siempre (varias salas, cambiar de sala, motivos, audio) lo cubre a fondo pruebas/guardianes/red.test.js; aquí, lo que pide la migración: el componente
// de todo mundo, que su libera() suelta las conexiones, las escuchas y los temas, y que el protocolo (tema, fiable, destinos) llega a LiveKit tal cual.
import { describe, expect, it } from "vitest";
import { RedPuro, manifiestoRed } from "./salas.ts";

/** lo justo de livekit-client que usa la red: Room con on/connect/disconnect y un participante local que publica */
function lkFalso() {
  const salas: any[] = [];
  class Room {
    oy: Record<string, ((...a: any[]) => void)[]> = {}; conectada = false; desconexiones = 0; publicados: any[] = [];
    remoteParticipants = new Map(); name = "hituelo-libre"; metadata = "";
    localParticipant = { identity: "yo", metadata: "{}", permissions: { canPublishData: true }, publishData: (d: Uint8Array, o: unknown) => { this.publicados.push([d, o]); return Promise.resolve(); } };
    opc: unknown;
    constructor(opc: unknown) { this.opc = opc; salas.push(this); }
    on(ev: string, fn: (...a: any[]) => void) { (this.oy[ev] = this.oy[ev] || []).push(fn); return this; }
    emite(ev: string, ...a: any[]) { (this.oy[ev] || []).forEach(f => f(...a)); }
    connect(url: string, token: string, opc: unknown) { this.url = url; this.token = token; this.conexion = opc; this.conectada = true; return Promise.resolve(); }
    url = ""; token = ""; conexion: unknown = null;
    disconnect() { this.conectada = false; this.desconexiones++; return Promise.resolve(); }
  }
  const RoomEvent = { ParticipantConnected: "pc", ParticipantDisconnected: "pd", DataReceived: "dr", Reconnecting: "rc", Reconnected: "rd", Disconnected: "di", RoomMetadataChanged: "rm" };
  return { salas, mod: { Room, RoomEvent, DisconnectReason: { CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 4 }, Track: { Source: { Microphone: "microphone" } } } };
}

describe("RedPuro (A3-6a)", () => {
  it("une, publica con el tema, fiable y destinos tal cual, escucha por tema y sale", async () => {
    const LK = lkFalso(), estados: string[] = [];
    const red = RedPuro.crea({ carga: () => Promise.resolve(LK.mod), base: () => "https://gemelo.test/finca/", alEstado: (d: any) => estados.push(d.estado) });
    const s = red.sala("visita");
    expect(await s.une({ url: "/rtc", token: "tk" })).toBe(true);
    expect(LK.salas[0].url).toBe("wss://gemelo.test/rtc");   // la ruta del mismo origen, resuelta contra la página
    expect(LK.salas[0].conexion).toEqual({ autoSubscribe: false });   // solo datos (y el audio, a petición)
    const b = new Uint8Array(24);
    await s.publica("pose", b, { fiable: false, destinos: ["h_1"] });
    expect(LK.salas[0].publicados[0]).toEqual([b, { reliable: false, topic: "pose", destinationIdentities: ["h_1"] }]);
    const llega: unknown[] = []; const quita = s.escucha("chat", (d: unknown, de: any) => llega.push([d, de && de.identidad]));
    LK.salas[0].emite("dr", b, { identity: "h_2", metadata: "" }, 0, "chat");
    LK.salas[0].emite("dr", b, { identity: "h_2", metadata: "" }, 0, "otro");   // sin quien lo escuche: se cuenta y no llega
    expect(llega).toEqual([[b, "h_2"]]); expect(s.info().sinTema).toBe(1);
    quita(); LK.salas[0].emite("dr", b, { identity: "h_2" }, 0, "chat"); expect(llega).toHaveLength(1);
    await s.sale();
    expect(estados).toEqual(["conectando", "dentro", "fuera"]); expect(s.motivo()).toBe("propio"); expect(LK.salas[0].desconexiones).toBe(1);
  });
});

describe("los metadatos de la sala (ADR-0036)", () => {
  it("metadatos() da el texto de la api tal cual (\"\" fuera); «sala-meta» avisa al cambiar y, si ya había, al quedar dentro; lo de una sala dejada no llega", async () => {
    const LK = lkFalso(), red = RedPuro.crea({ carga: () => Promise.resolve(LK.mod), base: () => "https://gemelo.test/" });
    const s = red.sala("visita"), llega: string[] = [];
    expect(s.metadatos()).toBe(""); s.al("sala-meta", (t: string) => llega.push(t));
    const Room = LK.mod.Room; LK.mod.Room = class extends Room { override metadata = '{"v":1,"n":3}'; };   // quien llega tarde: la sala ya tenía metadatos
    await s.une({ url: "/rtc", token: "a" }); LK.mod.Room = Room;
    expect(s.metadatos()).toBe('{"v":1,"n":3}'); expect(llega).toEqual(['{"v":1,"n":3}']);
    LK.salas[0].metadata = "no es json"; LK.salas[0].emite("rm", "no es json");   // la red no los interpreta
    expect(llega).toEqual(['{"v":1,"n":3}', "no es json"]);
    await s.une({ url: "/rtc", token: "b" }); expect(llega).toHaveLength(2);   // la sala nueva sin metadatos: nada al entrar
    LK.salas[0].emite("rm", "vieja"); expect(llega).toHaveLength(2);   // la de antes ya no cuenta
    await s.sale(); expect(s.metadatos()).toBe("");
  });
});

describe("manifiestoRed: componente de todo mundo con libera() de verdad (A3-6a)", () => {
  it("es de todo mundo, no conecta al montarse y su libera() cierra cada sala y deja la red cerrada", async () => {
    const LK = lkFalso(), avisos: string[] = [], eventos: unknown[] = [];
    const def = manifiestoRed({ carga: () => Promise.resolve(LK.mod), base: () => "https://gemelo.test/", consola: { warn: (t: unknown) => avisos.push(String(t)) } });
    expect(def.mundos).toBe("todos");   // red/ no importa del núcleo (MUNDOS §1): que el manifiesto valga lo comprueba el registro (pruebas/guardianes/componentes.test.js)
    expect(def.expone).toEqual(["Red"]); expect(def.eventos.emite).toEqual(["red:estado"]); expect(def.bandera).toEqual({ defecto: true, url: "red" });
    const red: any = def.monta({ emite: (ev: string, d?: unknown) => { eventos.push([ev, d]); return 1; } });
    expect(LK.salas).toHaveLength(0); expect(red.cargada()).toBe(false);   // montada, sin nadie que se una: ni descarga ni conecta
    const a = red.sala("visita"), b = red.sala("oficina");
    await a.une({ url: "wss://lk.test", token: "a" }); await b.une({ url: "wss://lk.test", token: "b" });
    let oidos = 0; a.escucha("pose", () => { oidos++; }); a.al("estado", () => {});
    expect(eventos.filter((e: any) => e[0] === "red:estado").length).toBe(4);
    def.libera(red);
    expect(LK.salas.map(r => r.desconexiones)).toEqual([1, 1]);   // las dos salas, dejadas
    expect(a.estado()).toBe("fuera"); expect(b.estado()).toBe("fuera");
    LK.salas[0].emite("dr", new Uint8Array(2), { identity: "h" }, 0, "pose"); expect(oidos).toBe(0);   // lo que llegue tarde ya no cuenta
    expect(red.sala("visita")).toBeNull(); expect(red.salas()).toEqual([]);
    await expect(a.une({ url: "x", token: "y" })).rejects.toThrow(/cerrada/);
    def.libera(null);   // sin api (no llegó a montarse): no falla
    expect(avisos).toEqual([]);
  });
});

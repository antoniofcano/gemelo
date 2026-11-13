// La puerta del cortijo (eje B) con dobles: el sondeo del anclaje, cruzar andando (y no con el dron), la precarga al acercarse y la suelta al alejarse,
// «Ir al cortijo» (minimapa y panel de VR), el quad aparcado y el dron prohibido dentro. Sin three ni DOM (la marca se prueba en el navegador).
import { describe, expect, it } from "vitest";
import type { IdMundo, Pose2, Puerta, ResultadoCambio } from "../../nucleo/mundos.ts";
import type { MundoInterior } from "../../datos/contratos/mundo-interior.ts";
import { creaPortones, manifiestoPortones } from "./porton.ts";
import type { DepsPortones } from "./porton.ts";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { InteriorPuro as P } from "./puro.ts";

/** unos patios inventados, anclados en (100, 50) con el +Z al norte: la principal en el origen y una lateral; la sala, al sur */
const MAN: MundoInterior = {
  v: 1, id: "patios", nombre: "Patios (sintético)", fuente: "ilustrativo", licencia: { spdx: "CC0-1.0", autor: "prueba", atribucion: "" }, glb: "patios.glb", unidades: "m", arriba: "+Y",
  zonas: [{ id: "sur", anillo: [[-3, 0], [3, 0], [3, -20], [-3, -20]], y: 0 }],
  puertas: [
    { id: "principal", a: "exterior", pos: [0, 0, 0], rumbo: 0, ancho: 6, alto: 2.8, llegada: { pos: [0, 0, -1.7], rumbo: 180 } },
    { id: "fabrica", a: "fabrica", pos: [3, 0, -15], rumbo: 90, ancho: 1, alto: 2.3, llegada: { pos: [1.5, 0, -15], rumbo: 270 } },
  ],
  anclaje: { pos: [100, 50], giro: 0 },
};

function banco(o: { manifiesto?: unknown; status?: number; sondea?: boolean } = {}) {
  const pp: Pose2 = { x: 100, y: 200, ang: 0 }, pedidas: string[] = [], cambios: Array<[IdMundo, Pose2 | null, Puerta | null]> = [], avisos: string[] = [], vistas: number[][] = [];
  const precargas: string[] = [], sueltas: string[] = [];
  let reloj = 0, precargado = false, resultado: ResultadoCambio = { ok: true, mundo: "patios", ms: 0 };
  const gm = {
    actual: "exterior" as IdMundo | null, estado: "en",
    fichaDe: () => "sin_cargar",
    precarga: (id: IdMundo) => { precargas.push(id); precargado = true; return true; },
    suelta: (id: IdMundo) => { sueltas.push(id); precargado = false; return true; },
    precargado: () => precargado,
    retorno: () => ({ x: 1, y: 2, ang: 0 }),
  };
  const vida = {
    E: { enQuad: false, enDron: false }, bloqueo: null as ((q: "quad" | "dron") => void) | null, aparcado_: null as Pose2 | null,
    ponQuad(on: boolean) { if (on && this.bloqueo) { this.bloqueo("quad"); return; } this.E.enQuad = on; if (on) this.aparcado_ = null; },
    bloquea(f: ((q: "quad" | "dron") => void) | null) { this.bloqueo = f; if (f) this.E.enQuad = false; },
    aparca(p: Pose2 | null) { this.aparcado_ = p; },
    aparcado() { return this.aparcado_; },
  };
  const capas: Array<{ fn: (c: any, X: (x: number) => number, Y: (y: number) => number) => void; toca?: (x: number, y: number) => boolean }> = [];
  const filas: any[] = [], oyentes: Record<string, (d?: any) => void> = {};
  const deps: DepsPortones = {
    ids: ["patios", "fabrica"], base: "/teselas/hituelo/", sondea: o.sondea !== false, vr: () => false, clase: () => "escritorio",
    descarga: async u => {
      pedidas.push(u);
      if (u.includes("/fabrica/")) return { ok: false, status: 404, json: async () => null };
      return { ok: (o.status || 200) === 200, status: o.status || 200, json: async () => JSON.parse(JSON.stringify(o.manifiesto === undefined ? MAN : o.manifiesto)) };
    },
    gm, cambia: async (a, l, p) => { cambios.push([a, l, p]); return resultado; },
    pose: { lee: () => pp }, paseando: () => true, aviso: s => { avisos.push(s); },
    Vida: vida, Llegada: { ve: (x, y, a) => { vistas.push([x, y, a!]); return true; } },
    Minimapa: { capa: (fn, _o, toca) => { const c = { fn, ...(toca ? { toca } : {}) }; capas.push(c); return () => { capas.splice(capas.indexOf(c), 1); }; } },
    PanelVR: { filas: (_p, f) => { filas.push(f); return () => { filas.splice(filas.indexOf(f), 1); }; } },
    ahora: () => reloj,
  };
  const p = creaPortones(deps);
  async function monta(): Promise<void> {
    p.monta({ on: (ev, fn) => { oyentes[ev] = fn; return () => { delete oyentes[ev]; }; } });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));
  }
  return { p, deps, gm, pp, vida, pedidas, cambios, avisos, vistas, precargas, sueltas, capas, filas, oyentes, monta,
    tic: (ms: number) => { reloj += ms; }, pon: (r: ResultadoCambio) => { resultado = r; } };
}

describe("la puerta del cortijo: dónde está", () => {
  it("con D.base /teselas/… pide el mundo.json de cada interior (no el glb) y pone una puerta por cada puerta a «exterior» del anclado", async () => {
    const b = banco(); await b.monta();
    expect(b.pedidas).toEqual(["/teselas/hituelo/patios/pantalla/mundo.json", "/teselas/hituelo/fabrica/pantalla/mundo.json"]);
    const e = b.p.estado();
    expect(e.accesos.map(a => [a.mundo, a.puerta])).toEqual([["patios", "principal"]]);
    expect(e.accesos[0]!.x).toBeCloseTo(100); expect(e.accesos[0]!.y).toBeCloseTo(50);
  });
  it("sin sondeo, sin anclaje, con el manifiesto roto o sin sesión (401): ninguna puerta y nada más", async () => {
    for (const o of [{ sondea: false }, { manifiesto: { ...MAN, anclaje: undefined } }, { manifiesto: { ...MAN, v: 9 } }, { status: 401 }]) {
      const b = banco(o); await b.monta();
      expect(b.p.estado().accesos, JSON.stringify(o)).toEqual([]);
      b.pp.x = 100; b.pp.y = 50; b.p.cada(); b.p.cada(); b.p.tarde();
      expect(b.cambios).toEqual([]); expect(b.precargas).toEqual([]);
      expect(b.filas[0].visible()).toBe(false);
    }
  });
  it("el manifiesto del componente es válido, del exterior, y se apaga con ?porton=0", () => {
    const m = manifiestoPortones(banco().p);
    expect(ComponentesPuro.valida(m)).toEqual([]);
    expect(m.mundos).toEqual(["exterior"]); expect(m.bandera).toEqual({ defecto: true, url: "porton" });
  });
});

describe("la puerta del cortijo: cruzar", () => {
  it("al acercarse andando al umbral se entra por la llegada de ESA puerta; al empezar no se dispara la que se tiene encima", async () => {
    const b = banco(); await b.monta();
    b.pp.x = 100; b.pp.y = 50.5; b.p.cada(); b.p.cada();   // se empieza encima: desarmada
    expect(b.cambios).toEqual([]);
    b.pp.y = 55; b.p.cada();   // se aleja (se rearma)
    b.pp.y = 50.5; b.p.cada();
    expect(b.cambios.length).toBe(1);
    const [a, l, pu] = b.cambios[0]!;
    expect(a).toBe("patios"); expect(l).toBeNull();
    expect(pu).toMatchObject({ de: "exterior", a: "patios", radio: P.RADIO_EXT, histeresis: P.HISTERESIS_EXT, llegada: P.poseDe(MAN.puertas[0].llegada) });
  });
  it("con el dron fuera no se cruza; con otro mundo activo, un cambio en curso o fuera del paseo, tampoco", async () => {
    const b = banco(); await b.monta();
    b.pp.y = 60; b.p.cada();
    b.vida.E.enDron = true; b.pp.y = 50.2; b.p.cada(); expect(b.cambios).toEqual([]);
    b.vida.E.enDron = false; b.pp.y = 60; b.p.cada();
    b.gm.estado = "cargando"; b.pp.y = 50.2; b.p.cada(); expect(b.cambios).toEqual([]);
  });
  it("si no se puede entrar, lo dice (ocupado no)", async () => {
    const b = banco(); await b.monta();
    b.pon({ ok: false, motivo: "fallo_carga", mundo: "exterior", ms: 0 });
    b.pp.y = 60; b.p.cada(); b.pp.y = 50.2; b.p.cada(); await new Promise(r => setTimeout(r, 0));
    expect(b.avisos).toEqual(["No se ha podido entrar en el cortijo"]);
  });
});

describe("la puerta del cortijo: precarga", () => {
  it("precarga a menos de PRECARGA m, no repite, y suelta a más de SUELTA m (o fuera del paseo)", async () => {
    const b = banco(); await b.monta();
    b.pp.y = 50 + P.PRECARGA + 5; b.p.tarde(); expect(b.precargas).toEqual([]);
    b.pp.y = 50 + P.PRECARGA - 5; b.p.tarde(); b.p.tarde(); expect(b.precargas).toEqual(["patios"]);
    b.pp.y = 50 + (P.PRECARGA + P.SUELTA) / 2; b.p.tarde(); expect(b.sueltas).toEqual([]);   // entre las dos: se queda
    b.pp.y = 50 + P.SUELTA + 5; b.p.tarde(); expect(b.sueltas).toEqual(["patios"]);
    expect(b.p.estado()).toMatchObject({ precargas: 1, sueltas: 1 });
  });
  it("libera() suelta lo precargado y quita la capa del minimapa y la fila del panel", async () => {
    const b = banco(); await b.monta();
    b.pp.y = 60; b.p.tarde(); expect(b.capas.length).toBe(1); expect(b.filas.length).toBe(1);
    b.p.libera(); expect(b.sueltas).toEqual(["patios"]); expect(b.capas).toEqual([]); expect(b.filas).toEqual([]);
  });
});

describe("la puerta del cortijo: «Ir al cortijo»", () => {
  it("lleva con fundido a FRENTE m de la principal, mirándola; en el panel de VR, una fila en «Ir a»", async () => {
    const b = banco(); await b.monta();
    expect(b.p.irAlCortijo()).toBe(true);
    expect(b.vistas[0]![0]).toBeCloseTo(100); expect(b.vistas[0]![1]).toBeCloseTo(50 + P.FRENTE); expect(Math.cos(b.vistas[0]![2]!)).toBeCloseTo(-1);
    const f = b.filas[0], botones: any[] = [];
    expect(f.visible()).toBe(true);
    f.botones((...a: any[]) => { botones.push(a); }, 300);
    expect(botones[0][5]).toBe("Ir al cortijo"); botones[0][6](); expect(b.vistas.length).toBe(2);
    b.gm.actual = "patios"; expect(b.p.irAlCortijo()).toBe(false); expect(b.avisos.length).toBe(1);
  });
  it("en el minimapa: un toque en el icono enseña el nombre, otro en 4 s lleva; fuera del icono no es suyo", async () => {
    const b = banco(); await b.monta();
    const textos: string[] = [], c: any = { fillRect() {}, beginPath() {}, rect() {}, fill() {}, stroke() {}, fillText: (t: string) => { textos.push(t); }, measureText: () => ({ width: 50 }) };
    const X = (x: number) => x - 50, Y = (y: number) => 100 - y;   // el icono, en (50, 50)
    b.capas[0]!.fn(c, X, Y); expect(textos).toEqual([]);
    expect(b.capas[0]!.toca!(10, 10)).toBe(false);
    expect(b.capas[0]!.toca!(52, 48)).toBe(true); expect(b.vistas).toEqual([]);
    b.capas[0]!.fn(c, X, Y); expect(textos[0]).toMatch(/Entrada al cortijo/);
    b.tic(1000); expect(b.capas[0]!.toca!(50, 50)).toBe(true); expect(b.vistas.length).toBe(1);
    b.tic(1000); b.capas[0]!.toca!(50, 50); b.tic(5000); b.capas[0]!.toca!(50, 50); expect(b.vistas.length).toBe(1);   // pasados 4 s, vuelve a ser el primer toque
  });
});

describe("la puerta del cortijo: el quad y el dron", () => {
  it("en quad: al entrar se aparca delante de la puerta y dentro no hay quad ni dron (con aviso); al salir por esa puerta se vuelve a montar", async () => {
    const b = banco(); await b.monta();
    b.vida.E.enQuad = true; b.pp.y = 60; b.p.cada(); b.pp.y = 50.3; b.p.cada();
    b.p.alEntraInterior();
    expect(b.vida.E.enQuad).toBe(false); expect(b.vida.aparcado()!.y).toBeCloseTo(50 + P.FUERA);
    b.vida.ponQuad(true); expect(b.vida.E.enQuad).toBe(false); expect(b.avisos).toEqual(["El quad se queda fuera, en la puerta"]);
    b.p.alSaleInterior("fabrica", null); expect(b.vida.bloqueo).not.toBeNull();   // a otro interior: sigue igual
    const fuera = b.p.salida("patios", "principal")!;
    expect(fuera.y).toBeCloseTo(50 + P.FUERA); expect(Math.cos(fuera.ang)).toBeCloseTo(1);
    b.p.alSaleInterior("exterior", fuera);
    expect(b.vida.bloqueo).toBeNull(); expect(b.vida.E.enQuad).toBe(true); expect(b.vida.aparcado()).toBeNull();
  });
  it("si se sale lejos del quad aparcado (otra puerta, ?mundo=), se queda aparcado; sin quad no se aparca nada", async () => {
    const b = banco(); await b.monta();
    b.vida.E.enQuad = true; b.p.alEntraInterior();
    expect(b.vida.aparcado()).toEqual({ x: 1, y: 2, ang: 0 });   // sin puerta: donde se dejó el exterior
    b.p.alSaleInterior("exterior", { x: 500, y: 500, ang: 0 });
    expect(b.vida.E.enQuad).toBe(false); expect(b.vida.aparcado()).toEqual({ x: 1, y: 2, ang: 0 });
    const c = banco(); await c.monta(); c.p.alEntraInterior(); expect(c.vida.aparcado()).toBeNull();
    c.vida.E.enDron = false; (c.vida.bloqueo as any)("dron"); expect(c.avisos).toEqual(["Dentro del cortijo no se vuela el dron"]);
  });
  it("salida(): null para una puerta que no está anclada", async () => {
    const b = banco(); await b.monta();
    expect(b.p.salida("patios", "fabrica")).toBeNull(); expect(b.p.salida("fabrica", "x")).toBeNull();
  });
});

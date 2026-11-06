// El exterior como primer mundo registrado (MU2-3). Con pasos falsos, un bucle de verdad y el gestor de verdad: el exterior llama a sus pasos en orden,
// los pasos «caro» no corren con la página oculta, el reparto suma por bloque, y el gestor arranca con «exterior» y lo actualiza.
// HONESTIDAD: prueba el envoltorio; que el motor legado siga igual en pantalla se mira en el banco, no aquí.
import { describe, expect, it } from "vitest";
import { creaBucle } from "../nucleo/bucle.ts";
import type { PasoBucle } from "../nucleo/bucle.ts";
import { creaCola } from "../nucleo/cola.ts";
import { creaWorldManager } from "../nucleo/mundos.ts";
import { creaExterior } from "./exterior.ts";

const recorreSimple = (p: readonly PasoBucle[], dt: number, t: number): void => { for (const x of p) x.fn(dt, t); };
const pasosFalsos = (reg: string[]): PasoBucle[] => ["entidades", "tiempo", "mundo", "carga", "Cola", "Escena3D"].map((n) => ({ bloque: null, fn: () => { reg.push(n); } }));
const fundidoFalso = () => ({ cierra: () => Promise.resolve(), abre: () => Promise.resolve() });

describe("creaExterior", () => {
  it("es un mundo «exterior» y actualiza(dt, t) llama a sus pasos en el orden dado, con dt y t", () => {
    const reg: string[] = [], vistos: Array<[number, number]> = [];
    const pasos: PasoBucle[] = [...pasosFalsos(reg), { fn: (dt, t) => { vistos.push([dt, t]); } }];
    const e = creaExterior({ pasos, recorre: recorreSimple });
    expect(e.id).toBe("exterior");
    e.actualiza(0.016, 5000);
    expect(reg).toEqual(["entidades", "tiempo", "mundo", "carga", "Cola", "Escena3D"]);
    expect(vistos).toEqual([[0.016, 5000]]);
  });
  it("carga resuelve; sin dependencias, entra, congela y libera no lanzan y sale() da la pose cero; libera se puede llamar dos veces", async () => {
    const reg: string[] = [];
    const e = creaExterior({ pasos: pasosFalsos(reg), recorre: recorreSimple });
    await expect(e.carga({} as never)).resolves.toBeUndefined();
    e.entra(null, null); e.congela(); e.libera(); e.libera();
    expect(e.sale()).toEqual({ x: 0, y: 0, ang: 0 });
    expect(reg).toEqual([]);
    e.actualiza(0.016, 1); expect(reg).toEqual([]);   // congelado, no corre nada
    e.entra(null, null); e.actualiza(0.016, 1); expect(reg.length).toBe(6);
  });
  it("MU2-6: sale() devuelve una copia de la pose del paseo y entra(…, llegada) la pone; antesDelRender corre lo suyo, y congelado no", () => {
    const pp = { x: 5, y: 6, ang: 1 }, reg: string[] = [];
    const e = creaExterior({ pasos: [], recorre: recorreSimple, pose: { lee: () => pp, pon: p => { pp.x = p.x; pp.y = p.y; pp.ang = p.ang; } },
      antesDelRender: [{ fn: () => { reg.push("Escena3D"); } }] });
    const s = e.sale(); pp.x = 99;
    expect(s).toEqual({ x: 5, y: 6, ang: 1 });
    e.entra(null, s); expect(pp).toEqual({ x: 5, y: 6, ang: 1 });
    const antes = e.antesDelRender as (dt: number, t: number) => void;
    antes(0.016, 1); expect(reg).toEqual(["Escena3D"]);
    e.congela(); antes(0.016, 1); expect(reg).toEqual(["Escena3D"]);
  });
  it("suelo es el que se le da (en metros); sin él, 0. Sin caja ni copas, dentro y obstaculo no restringen", () => {
    expect(creaExterior({ pasos: [], recorre: recorreSimple, suelo: (x, y) => x + 2 * y }).suelo(3, 4)).toBe(11);
    const e = creaExterior({ pasos: [], recorre: recorreSimple });
    expect(e.suelo(3, 4)).toBe(0); expect(e.dentro(1e6, 1e6)).toBe(true); expect(e.obstaculo(0, 0, 1)).toBeNull();
  });
});

// MU2-4: dentro y obstaculo de verdad, con una finca y un censo inventados. EXT = D.ext = [x0, yNorte, x1, ySur]; las copas en el marco del mundo (y = norte).
describe("dentro y obstaculo del exterior (MU2-4)", () => {
  const EXT = [-100, 80, 100, -60];
  const COPAS = [{ x: 0, y: 0, oliv: true }, { x: 10, y: 0, oliv: true }, { x: 20, y: 0, oliv: false }, { x: 96, y: 0, oliv: true }];
  const ext = () => creaExterior({ pasos: [], recorre: recorreSimple, ext: EXT, copas: COPAS });

  it("dentro: la caja D.ext con 3 m de margen, bordes incluidos (la de LlegadaPuro.dentro y el teletransporte a pie)", () => {
    const e = ext();
    expect(e.dentro(0, 0)).toBe(true); expect(e.dentro(-97, 77)).toBe(true); expect(e.dentro(97, -57)).toBe(true);
    expect(e.dentro(-97.01, 0)).toBe(false); expect(e.dentro(97.01, 0)).toBe(false); expect(e.dentro(0, 77.01)).toBe(false); expect(e.dentro(0, -57.01)).toBe(false);
  });
  it("obstaculo: null si el punto ya está bien (lejos de troncos y dentro); lo que no es olivo no estorba", () => {
    const e = ext();
    expect(e.obstaculo(5, 5, 0.55)).toBeNull(); expect(e.obstaculo(20.1, 0, 0.55)).toBeNull();
  });
  it("obstaculo: empuja fuera del tronco hasta el radio pedido, en la misma dirección (lo que hacía el bucle de 12_paseo)", () => {
    const e = ext(), o = e.obstaculo(0.2, 0.1, 0.55);
    expect(o).not.toBeNull(); const p = o as { x: number; y: number };
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(0.55, 9); expect(p.y / p.x).toBeCloseTo(0.5, 9);
    const q = e.obstaculo(10, 0.5, 1.05) as { x: number; y: number };   // el quad: 1,05 m
    expect(q.x).toBeCloseTo(10, 9); expect(q.y).toBeCloseTo(1.05, 9);
  });
  it("obstaculo: justo en el centro de un tronco se sale hacia el este (como LlegadaPuro.fueraDeTroncos)", () => {
    const o = ext().obstaculo(10, 0, 0.55) as { x: number; y: number };
    expect(o.x).toBeCloseTo(10.55, 9); expect(o.y).toBeCloseTo(0, 9);
  });
  it("obstaculo: recorta al borde con 3 m de margen, eje a eje (el paseo, la VR y el dron), también sin tronco cerca", () => {
    const e = ext();
    expect(e.obstaculo(150, 10, 0.55)).toEqual({ x: 97, y: 10, ang: 0 });
    expect(e.obstaculo(-150, -200, 0.55)).toEqual({ x: -97, y: -57, ang: 0 });
    expect(e.obstaculo(0, 79, 0)).toEqual({ x: 0, y: 77, ang: 0 });
  });
  it("obstaculo: primero los troncos, luego el borde (un tronco junto al borde no te saca de la finca)", () => {
    const o = ext().obstaculo(96.3, 0, 0.55) as { x: number; y: number };   // el tronco de x = 96 te empujaría a 96,55; el borde está en 97: se queda dentro
    expect(o.x).toBeCloseTo(96.55, 9);
    const b = ext().obstaculo(96.9, 0, 1.5) as { x: number; y: number };   // a 1,5 m te llevaría a 97,5: el borde lo deja en 97
    expect(b.x).toBe(97);
  });
  it("obstaculo con radio 0: solo el borde (el dron vuela sobre los troncos; la VR volando alto)", () => {
    const e = ext();
    expect(e.obstaculo(0.1, 0, 0)).toBeNull(); expect(e.obstaculo(120, 0.1, 0)).toEqual({ x: 97, y: 0.1, ang: 0 });
  });
  it("obstaculo: dos troncos en orden del censo, como el bucle de siempre (el segundo puede devolverte hacia el primero)", () => {
    const e = creaExterior({ pasos: [], recorre: recorreSimple, copas: [{ x: 0, y: 0, oliv: true }, { x: 1, y: 0, oliv: true }] });
    const o = e.obstaculo(0.5, 0.01, 0.55) as { x: number; y: number };
    // el primero lo saca a 0,55 de (0, 0); el segundo lo empuja a 0,55 de (1, 0): es el último el que manda, como antes
    expect(Math.hypot(o.x - 1, o.y)).toBeCloseTo(0.55, 9);
  });
  it("obstaculo: devuelve siempre el mismo objeto (no reserva por fotograma); quien lo usa copia x e y", () => {
    const e = ext(), a = e.obstaculo(150, 0, 0.55), b = e.obstaculo(-150, 0, 0.55);
    expect(a).toBe(b); expect(b).toEqual({ x: -97, y: 0, ang: 0 });
  });
  it("el gestor delega en el exterior activo: gm.dentro y gm.obstaculo son los suyos (antes de arrancar: falso y null)", async () => {
    const gm = creaWorldManager({ fundido: fundidoFalso(), cola: creaCola({ ahora: () => 0 }), temporizador: (f, ms) => { const h = setTimeout(f, ms); return () => clearTimeout(h); } });
    gm.registra(() => Promise.resolve(creaExterior({ pasos: [], recorre: recorreSimple, ext: EXT, copas: COPAS, suelo: () => 412 })), "exterior");
    expect(gm.dentro(0, 0)).toBe(false); expect(gm.obstaculo(150, 0, 0.55)).toBeNull(); expect(gm.suelo(0, 0)).toBe(0);
    await gm.arranca("exterior");
    expect(gm.dentro(0, 0)).toBe(true); expect(gm.dentro(99, 0)).toBe(false); expect(gm.suelo(0, 0)).toBe(412);
    expect(gm.obstaculo(150, 0, 0.55)).toEqual({ x: 97, y: 0, ang: 0 });
  });
});

describe("el gestor con el exterior", () => {
  it("arranca con «exterior» (sin fundido), queda activo y gm.actualiza corre los pasos; antes de arrancar no corre nada", async () => {
    const reg: string[] = [];
    const gm = creaWorldManager({ fundido: fundidoFalso(), cola: creaCola({ ahora: () => 0 }), temporizador: (f, ms) => { const h = setTimeout(f, ms); return () => clearTimeout(h); } });
    gm.registra(() => Promise.resolve(creaExterior({ pasos: pasosFalsos(reg), recorre: recorreSimple })), "exterior");
    gm.actualiza(0.016, 0); expect(reg).toEqual([]);   // aún sin mundo
    const r = await gm.arranca("exterior");
    expect(r.ok).toBe(true); expect(r.mundo).toBe("exterior"); expect(gm.actual).toBe("exterior"); expect(gm.estado).toBe("en"); expect(gm.fichaDe("exterior")).toBe("activo");
    gm.actualiza(0.016, 1000);
    expect(reg).toEqual(["entidades", "tiempo", "mundo", "carga", "Cola", "Escena3D"]);
    expect(gm.suelo(1, 2)).toBe(0);
  });
});

describe("el exterior dentro del bucle (Bucle.recorre)", () => {
  function monta() {
    const reg: string[] = [], bloques: number[] = [];
    let oculto = false, repartoOn = false, t = 1000;
    const doc = { visibilityState: "visible", addEventListener(_t: string, fn: (e: unknown) => void) { this.fn = fn; }, fn: (() => {}) as (e?: unknown) => void };
    const R = { get on() { return repartoOn; }, ini: () => 0, pasa: (b: number, q: number) => { bloques.push(b); return q; } };
    const pasosExt: PasoBucle[] = [
      { bloque: 7, fn: () => { reg.push("a"); } },
      { bloque: 8, caro: true, fn: () => { reg.push("cola"); } },
      { bloque: null, fn: () => { reg.push("fase"); } },
    ];
    let B: ReturnType<typeof creaBucle>;
    const ext = creaExterior({ pasos: pasosExt, recorre: (p, dt, tt) => B.recorre(p, dt, tt) });
    const gm = creaWorldManager({ fundido: fundidoFalso(), cola: creaCola({ ahora: () => 0 }), temporizador: (f, ms) => { const h = setTimeout(f, ms); return () => clearTimeout(h); } });
    gm.registra(() => Promise.resolve(ext), "exterior");
    B = creaBucle({
      ahora: () => t, pideCuadro: () => {}, reparto: R, documento: doc,
      pasos: [{ bloque: 1, fn: () => { reg.push("camara"); } }, { bloque: null, fn: gm.actualiza }, { render: true, fn: () => { reg.push("render"); } }],
    });
    return { reg, bloques, gm, B, doc, oculta: () => { oculto = true; doc.visibilityState = "hidden"; doc.fn(); }, midiendo: () => { repartoOn = true; }, avanza: () => { t += 16; B.cuadro(t); }, esOculto: () => oculto };
  }
  it("los pasos del exterior corren entre la cámara y el render, en su orden", async () => {
    const m = monta(); await m.gm.arranca("exterior");
    m.avanza(); expect(m.reg).toEqual(["camara", "a", "cola", "fase", "render"]);
  });
  it("con la página oculta, el paso «caro» del exterior no corre, igual que en el bucle", async () => {
    const m = monta(); await m.gm.arranca("exterior"); m.oculta();
    m.avanza(); expect(m.reg).toEqual(["camara", "a", "fase", "render"]);
  });
  it("midiendo, los bloques numéricos del exterior suman al reparto y las fases no", async () => {
    const m = monta(); await m.gm.arranca("exterior"); m.midiendo();
    m.avanza(); expect(m.bloques).toEqual([1, 7, 8]);
  });
});

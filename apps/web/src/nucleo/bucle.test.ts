import { describe, expect, it } from "vitest";
import { BuclePuro, creaBucle } from "./bucle.ts";
import type { DepsBucle, PasoBucle } from "./bucle.ts";

// dobles: un emisor de eventos mínimo, un reloj a mano, una cola de requestAnimationFrame, una sesión XR y un espacio de referencia
class Emisor {
  oyentes: Record<string, Array<(e: unknown) => void>> = {};
  addEventListener(t: string, fn: (e: unknown) => void) { (this.oyentes[t] = this.oyentes[t] || []).push(fn); }
  removeEventListener(t: string, fn: (e: unknown) => void) { this.oyentes[t] = (this.oyentes[t] || []).filter(f => f !== fn); }
  emite(t: string, e?: unknown) { (this.oyentes[t] || []).slice().forEach(f => f(e === undefined ? {} : e)); }
  cuantos(t: string) { return (this.oyentes[t] || []).length; }
}
class SesionDoble extends Emisor { visibilityState = "visible"; terminada = 0; end() { this.terminada++; this.emite("end"); return Promise.resolve(); } }

function monta(extra?: Partial<DepsBucle> & { pasosExtra?: PasoBucle[] }) {
  const reg: string[] = [], errores: string[] = [], avisos: string[] = [], rafs: Array<(ts?: number) => void> = [], temporizadores: Array<() => void> = [];
  const reloj = { t: 1000, lecturas: 0 };
  const xr = { on: false, sesion: null as SesionDoble | null, base: null as Emisor | null, recolocadas: 0 };
  const doc = Object.assign(new Emisor(), { visibilityState: "visible" });
  const lienzo = new Emisor();
  let falla = 0;   // fallos que quedan por inyectar en el paso «b»
  const pasos: PasoBucle[] = extra && extra.pasosExtra ? extra.pasosExtra : [
    { bloque: 1, fn: (dt) => { reg.push("a:" + dt.toFixed(3)); } },
    { bloque: 2, fn: () => { reg.push("b"); if (falla > 0) { falla--; throw new Error("fallo inyectado"); } } },
    { bloque: null, fn: () => { reg.push("fase"); } },
    { bloque: 3, caro: true, fn: () => { reg.push("cola"); } },
    { render: true, fn: () => { reg.push("render"); } },
    { bloque: 4, fn: () => { reg.push("fin"); } }
  ];
  const deps: DepsBucle = Object.assign({
    ahora: () => { reloj.lecturas++; return reloj.t; },
    pideCuadro: (fn: (ts?: number) => void) => { rafs.push(fn); },
    pasos,
    alFin: () => { reg.push("cuadro:fin"); },
    xr: { activa: () => xr.on, sesion: () => xr.sesion, base: () => xr.base, recoloca: () => { xr.recolocadas++; } },
    aviso: (s: string) => { avisos.push(s); },
    consola: { error: (...a: unknown[]) => { errores.push(a.map(String).join(" ")); } },
    documento: doc,
    lienzo,
    temporizador: (fn: () => void) => { temporizadores.push(fn); return 0; }
  }, extra || {});
  const B = creaBucle(deps);
  /** un fotograma de la ventana: avanza el reloj y corre lo que pidió requestAnimationFrame */
  function cuadroVentana(ms = 16) { reloj.t += ms; const fs = rafs.splice(0); fs.forEach(f => f(reloj.t)); }
  function entraVr() { xr.on = true; xr.sesion = new SesionDoble(); xr.base = new Emisor(); return xr.sesion; }
  return { B, reg, errores, avisos, rafs, temporizadores, reloj, xr, doc, lienzo, entraVr, cuadroVentana, fallaN: (n: number) => { falla = n; } };
}

describe("creaBucle: el caso normal", () => {
  it("llama a los pasos en el orden dado, con el dt recortado a 0,1 s, y emite el fin", () => {
    const m = monta();
    m.B.bucle(); expect(m.reg).toEqual(["a:0.000", "b", "fase", "cola", "render", "fin", "cuadro:fin"]);
    m.reg.length = 0; m.cuadroVentana(16); expect(m.reg[0]).toBe("a:0.016");
    m.reg.length = 0; m.cuadroVentana(5000); expect(m.reg[0]).toBe("a:0.100");
    expect(m.rafs.length).toBe(1);   // un solo bucle vivo
  });
  it("sin medir, las únicas lecturas de reloj son las de siempre: la de bucle() y las dos del render", () => {
    const m = monta(); m.B.bucle(); const l0 = m.reloj.lecturas;
    m.cuadroVentana(); expect(m.reloj.lecturas - l0).toBe(3);
  });
  it("midiendo, cada paso con bloque cierra el suyo y las fases solo rehacen la marca", () => {
    const pasados: number[] = [];
    const m = monta({ reparto: { on: true, ini: () => 7, pasa: (b: number, q: number) => { pasados.push(b); return q + 1; } } });
    m.B.cuadro(2000);
    expect(pasados).toEqual([1, 2, 3, 4]);
  });
  it("en pausa solo corre la fase de pausa y el fin", () => {
    const m = monta({ enPausa: () => true, pausa: () => { m.reg.push("pausa"); } });
    m.B.cuadro(2000); expect(m.reg).toEqual(["pausa", "cuadro:fin"]);
  });
  it("con el ahorro de batería salta los fotogramas que llegan antes de 25 ms, sin perder el bucle", () => {
    const m = monta({ ahorro: () => true });
    m.B.bucle(); m.reg.length = 0;
    m.cuadroVentana(10); expect(m.reg).toEqual([]); expect(m.rafs.length).toBe(1);
    m.cuadroVentana(20); expect(m.reg.length).toBeGreaterThan(0);
  });
  it("dos peticiones en el mismo fotograma no dan dos bucles (misma marca de tiempo)", () => {
    const m = monta(); m.B.bucle(); m.rafs.push(m.B.bucle);   // como si vrSale y el fin de sesión lo pidieran a la vez
    m.reg.length = 0; m.cuadroVentana(); expect(m.reg.filter(x => x === "render").length).toBe(1); expect(m.rafs.length).toBe(1);
  });
  it("en VR bucle() no hace nada: el fotograma lo lleva la sesión", () => {
    const m = monta(); m.entraVr(); m.B.bucle(); expect(m.reg).toEqual([]); expect(m.rafs.length).toBe(0);
  });
});

describe("L7-01: un fallo en el fotograma", () => {
  it("en pantalla no para el bucle: se registra y el siguiente fotograma corre entero", () => {
    const m = monta(); m.fallaN(1);
    m.B.bucle();
    expect(m.reg).toEqual(["a:0.000", "b"]);   // el fotograma fallido se corta
    expect(m.errores.length).toBe(1); expect(m.errores[0]).toMatch(/^bucle: fallo en el fotograma \(1\): Error: fallo inyectado/);
    expect(m.rafs.length).toBe(1);   // y el bucle sigue pedido
    m.reg.length = 0; m.cuadroVentana(); expect(m.reg).toContain("render");
    expect(m.B.estado().fallos).toBe(1); expect(m.B.estado().seguidos).toBe(0);
    expect(m.avisos).toEqual([]);
  });
  it("en pantalla, con fallos sin fin, limita los mensajes y avisa una vez", () => {
    const m = monta(); m.fallaN(1e9); m.B.bucle();
    for (let i = 0; i < 1000; i++) m.cuadroVentana(16);   // 16 s fallando
    expect(m.errores.length).toBeLessThanOrEqual(BuclePuro.MAX_DETALLE + 3);
    expect(m.errores.length).toBeGreaterThan(BuclePuro.MAX_DETALLE);   // y hay resumen
    expect(m.errores[BuclePuro.MAX_DETALLE]).toMatch(/fallos más en el fotograma/);
    expect(m.avisos).toEqual([BuclePuro.TEXTOS.pantalla]);
    expect(m.rafs.length).toBe(1);
  });
  it("en VR, uno o dos fallos no cierran la sesión; tres seguidos sí, con aviso, una sola vez", () => {
    const m = monta(), s = m.entraVr();
    m.fallaN(2); m.B.cuadro(2000); m.B.cuadro(2016); m.B.cuadro(2032);   // dos fallos y uno bueno
    expect(s.terminada).toBe(0); expect(m.B.estado().seguidos).toBe(0);
    m.fallaN(3); m.B.cuadro(2048); m.B.cuadro(2064); expect(s.terminada).toBe(0);
    m.B.cuadro(2080);
    expect(s.terminada).toBe(1); expect(m.avisos).toEqual([BuclePuro.TEXTOS.vr]); expect(m.B.estado().salidasVr).toBe(1);
    m.B.cuadro(2096); expect(s.terminada).toBe(1);   // no se pide dos veces
  });
  it("al terminar la sesión se relanza el bucle de la ventana (aunque la salida de 29_vr fallara a medias)", () => {
    const m = monta(), s = m.entraVr(); m.B.cuadro(2000);
    m.xr.on = false; s.end();
    expect(m.rafs.length).toBe(1);
    m.reg.length = 0; m.cuadroVentana(); expect(m.reg).toContain("render");
  });
  it("una sesión que no se deja cerrar (end lanza) no tumba el bucle", () => {
    const m = monta(), s = m.entraVr(); s.end = () => { throw new Error("ya cerrada"); };
    m.fallaN(5); for (let i = 0; i < 5; i++) m.B.cuadro(2000 + i * 16);
    expect(m.B.estado().fallos).toBe(5); expect(m.avisos).toEqual([BuclePuro.TEXTOS.vr]);
  });
});

describe("L7-02: página oculta y reset del espacio de referencia", () => {
  it("visibilitychange de la página: oculta salta lo caro; al volver retoma con el dt de antes, no con el tiempo oculta", () => {
    const vistos: string[] = [];
    const m = monta({ alOcultar: () => vistos.push("oculta"), alVolver: () => vistos.push("vuelve") });
    m.B.bucle(); m.cuadroVentana(16);
    m.doc.visibilityState = "hidden"; m.doc.emite("visibilitychange");
    expect(m.B.estado().oculto).toBe(true);
    m.reg.length = 0; m.B.cuadro(m.reloj.t + 16); expect(m.reg).not.toContain("cola"); expect(m.reg).toContain("render");
    m.reloj.t += 60000;
    m.doc.visibilityState = "visible"; m.doc.emite("visibilitychange");
    m.reg.length = 0; m.cuadroVentana(16); expect(m.reg[0]).toBe("a:0.016"); expect(m.reg).toContain("cola");
    expect(vistos).toEqual(["oculta", "vuelve"]);
  });
  it("la sesión XR «visible-blurred» (menú del sistema) cuenta como oculta y vuelve", () => {
    const m = monta(), s = m.entraVr(); m.B.cuadro(2000);
    s.visibilityState = "visible-blurred"; s.emite("visibilitychange");
    expect(m.B.estado().oculto).toBe(true);
    m.reg.length = 0; m.B.cuadro(2016); expect(m.reg).not.toContain("cola");
    s.visibilityState = "visible"; s.emite("visibilitychange");
    m.reg.length = 0; m.B.cuadro(9000); expect(m.reg[0]).toBe("a:0.016"); expect(m.reg).toContain("cola");
  });
  it("el reset del espacio de referencia recoloca una vez, en el fotograma siguiente; las escuchas se cambian con la sesión", () => {
    const m = monta(), s = m.entraVr(); m.B.cuadro(2000);
    const base = m.xr.base as Emisor;
    expect(base.cuantos("reset")).toBe(1); expect(s.cuantos("visibilitychange")).toBe(1);
    base.emite("reset"); expect(m.xr.recolocadas).toBe(0);
    m.B.cuadro(2016); expect(m.xr.recolocadas).toBe(1);
    m.B.cuadro(2032); expect(m.xr.recolocadas).toBe(1);
    m.xr.on = false; m.xr.sesion = null; m.B.cuadro(2048);
    expect(base.cuantos("reset")).toBe(0); expect(s.cuantos("visibilitychange")).toBe(0);
  });
  it("BuclePuro.recoloca deja la cabeza en el mismo sitio del mundo y mirando al mismo rumbo", () => {
    const gira = (a: number) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
    const rig = { x: 10, y: 3, z: -5, yaw: 0.7 };
    const viejo = { p: { x: 0.4, y: 1.6, z: -0.3 }, q: gira(0.5) }, nuevo = { p: { x: 0, y: 1.6, z: 0 }, q: gira(0) };
    const mundo = (r: typeof rig, l: typeof viejo) => { const h = BuclePuro.giraXZ(l.p.x, l.p.z, r.yaw); return { x: r.x + h.x, z: r.z + h.z, rumbo: r.yaw + BuclePuro.rumbo(l.q) }; };
    const antes = mundo(rig, viejo), n = BuclePuro.recoloca(rig, viejo, nuevo), despues = mundo(n, nuevo);
    expect(despues.x).toBeCloseTo(antes.x, 9); expect(despues.z).toBeCloseTo(antes.z, 9); expect(despues.rumbo).toBeCloseTo(antes.rumbo, 9);
    expect(n.y).toBe(rig.y);
    expect(BuclePuro.rumbo(gira(1.2))).toBeCloseTo(1.2, 9);
    const g = BuclePuro.giraXZ(0, -1, 0.3); expect(g.x).toBeCloseTo(-Math.sin(0.3), 9); expect(g.z).toBeCloseTo(-Math.cos(0.3), 9);   // como applyAxisAngle(Y)
  });
});

describe("L7-10: pérdida y recuperación del contexto de WebGL", () => {
  it("al perderse: preventDefault, el bucle se para y se avisa; al volver: se relanza y se avisa", () => {
    const m = monta(); m.B.bucle(); m.cuadroVentana();
    let evitado = 0;
    m.lienzo.emite("webglcontextlost", { preventDefault: () => { evitado++; } });
    expect(evitado).toBe(1); expect(m.B.estado().perdido).toBe(true); expect(m.avisos).toEqual([BuclePuro.TEXTOS.perdido]);
    m.reg.length = 0; m.cuadroVentana(); expect(m.reg).toEqual([]); expect(m.rafs.length).toBe(0);   // parado
    m.B.cuadro(m.reloj.t); expect(m.reg).toEqual([]);   // ni la sesión lo mueve
    m.lienzo.emite("webglcontextrestored");
    expect(m.B.estado().perdido).toBe(false); expect(m.avisos[1]).toBe(BuclePuro.TEXTOS.recuperado);
    m.reloj.t += 30000; m.cuadroVentana(); expect(m.reg).toContain("render"); expect(m.reg[0]).not.toBe("a:0.100");
    m.temporizadores.forEach(f => f()); expect(m.avisos.length).toBe(2);   // volvió a tiempo: sin aviso de recargar
  });
  it("si no vuelve, aviso de recargar", () => {
    const m = monta(); m.lienzo.emite("webglcontextlost", {});
    m.temporizadores.forEach(f => f()); expect(m.avisos).toEqual([BuclePuro.TEXTOS.perdido, BuclePuro.TEXTOS.noVuelve]);
  });
  it("en VR, al perderse se cierra la sesión", () => {
    const m = monta(), s = m.entraVr(); m.B.cuadro(2000);
    m.lienzo.emite("webglcontextlost", {}); expect(s.terminada).toBe(1);
    expect(m.rafs.length).toBe(0);   // el fin de sesión no relanza la ventana con el contexto perdido
  });
});

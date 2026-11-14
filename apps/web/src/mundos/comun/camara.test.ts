// La cámara orbital (A3-6c, MU5-n; antes 09_camara.js). Con el three de verdad (sin GPU) y dobles del DOM: pon(modo) cambia el modo y los botones; la rueda acerca dentro de sus límites
// y no hace nada paseando; el deslizador de corrección escribe kcor por función; y libera() quita todas las escuchas. HONESTIDAD: nada se dibuja aquí; en el iPhone, NO probado.
import { describe, expect, it } from "vitest";
import { ID_CAMARA, TecladoAereo, creaCamara, manifiestoCamara } from "./camara.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const THREE: A = await import(/* @vite-ignore */ "three" as string);

function el() {
  const o: A = { oy: {} as Record<string, A[]>, n: 0, value: "1", textContent: "", attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { o.attrs[k] = v; }, setPointerCapture() { /* doble */ } };
  o.addEventListener = (t: string, f: A) => { (o.oy[t] = o.oy[t] || []).push(f); o.n++; }; o.removeEventListener = (t: string, f: A) => { o.oy[t] = (o.oy[t] || []).filter((x: A) => x !== f); o.n--; };
  o.dispara = (t: string, e: A) => (o.oy[t] || []).forEach((f: A) => f(Object.assign({ preventDefault() { /* doble */ }, target: o }, e)));
  return o;
}
function monta(paseando = false, extra?: boolean | ((x: number, y: number) => number)) {
  const suelo = typeof extra === "function" ? extra : undefined, recorrido = extra === true;   // el segundo argumento: el suelo (L8-02) o «hay recorrido» (L6-04)
  const els: Record<string, A> = {}, $ = (id: string) => (els[id] = els[id] || el()), lienzo = el(), ventana = el(), estado: A = { modo: "nube", exag: 1 }, kcor: number[] = [];
  const camera = new THREE.PerspectiveCamera(), api = creaCamara({ THREE, camera, lienzo, Estado: estado, $, fmt: (n: number) => String(n), DIST_MAX: 900, DIST_INI: 300, Usables: { toque: () => false },
    aplica() { /* doble */ }, capas() { /* doble */ }, aplicaLuego() { /* doble */ }, paseando: () => paseando, ponKcor: (v: number) => { kcor.push(v); }, IrA: () => ({ toca: () => false }),
    parcelaSel: () => 0, elegirParcela() { /* doble */ }, Ajustes: () => null, suelo, ventana, recorrido: () => recorrido });
  return { api, els, lienzo, ventana, estado, kcor, camera };
}

describe("cámara orbital", () => {
  it("pon(modo) cambia el modo y deja pulsado solo su botón", () => {
    const m = monta(); m.api.pon("gem");
    expect(m.estado.modo).toBe("gem"); expect(m.els.mGem!.attrs["aria-pressed"]).toBe("true"); expect(m.els.mNube!.attrs["aria-pressed"]).toBe("false");
  });
  it("la rueda acerca y aleja dentro de sus límites (30 m y DIST_MAX); paseando no hace nada", () => {
    const m = monta(); for (let i = 0; i < 60; i++) m.lienzo.dispara("wheel", { deltaY: -1 });
    expect(m.api.orb.dist).toBe(30);
    for (let i = 0; i < 60; i++) m.lienzo.dispara("wheel", { deltaY: 1 }); expect(m.api.orb.dist).toBe(900);
    const p = monta(true), d0 = p.api.orb.dist; p.lienzo.dispara("wheel", { deltaY: 1 }); expect(p.api.orb.dist).toBe(d0);
  });
  it("el deslizador de corrección escribe kcor por función (es de 02_mundo); libera() quita todas las escuchas", () => {
    const m = monta(); m.els.corr!.value = "1.5"; m.els.corr!.dispara("input", {});
    expect(m.kcor).toEqual([1.5]);
    const n = () => m.lienzo.n + Object.values(m.els).reduce((s: number, e: A) => s + e.n, 0);
    const nv = () => n() + m.ventana.n;
    expect(nv()).toBeGreaterThan(10); m.api.libera(); expect(nv()).toBe(0);
  });
  it("L6-04: en la vista aérea, las flechas y WASD desplazan, + y − (o Re Pág / Av Pág) acercan, Q y E giran y Mayús + ↑ inclina; el lienzo es una parada de tabulación (L6-22)", () => {
    const m = monta(), o = m.api.objetivo, orb = m.api.orb, tecla = (code: string, x: A = {}) => { const e: A = { code, key: "", ...x, defaultPrevented: false }; e.preventDefault = () => { e.defaultPrevented = true; }; m.ventana.dispara("keydown", e); return e; };
    expect(m.lienzo.tabIndex).toBe(0);
    const x0 = o.x, z0 = o.z; expect(tecla("ArrowUp").defaultPrevented).toBe(true); expect(Math.hypot(o.x - x0, o.z - z0)).toBeGreaterThan(0);
    const z1 = o.z, x1 = o.x; tecla("KeyD"); expect(Math.hypot(o.x - x1, o.z - z1)).toBeGreaterThan(0);
    const d0 = orb.dist; tecla("PageUp"); expect(orb.dist).toBeLessThan(d0); tecla("Minus", { key: "-" }); tecla("Minus", { key: "-" }); expect(orb.dist).toBeGreaterThan(d0 * 0.9);
    const az = orb.az; tecla("KeyQ"); expect(orb.az).toBeGreaterThan(az); tecla("KeyE"); tecla("KeyE"); expect(orb.az).toBeLessThan(az);
    const el0 = orb.el; tecla("ArrowUp", { shiftKey: true }); expect(orb.el).toBeLessThan(el0);
  });
  it("L6-04: el teclado aéreo no choca: nada paseando, con Ctrl/Alt/Cmd, en un campo, dentro de una ventana o si otro ya usó la tecla; con el recorrido, las flechas son suyas", () => {
    const base = { code: "ArrowLeft", key: "ArrowLeft" };
    expect(TecladoAereo.accion(base, {})).toEqual({ pan: [TecladoAereo.PASO, 0] });
    for (const est of [{ paseando: true }, { campo: true }, { panel: true }, { prevenido: true }, { recorrido: true }]) expect(TecladoAereo.accion(base, est)).toBe(null);
    expect(TecladoAereo.accion({ ...base, ctrl: true }, {})).toBe(null);
    expect(TecladoAereo.accion({ code: "KeyA", key: "a" }, { recorrido: true })).toEqual({ pan: [TecladoAereo.PASO, 0] });   // WASD sigue con el recorrido
    expect(TecladoAereo.accion({ code: "BracketRight", key: "+" }, {})).toEqual({ zoom: -TecladoAereo.ZOOM });   // el + del teclado español
    // L6-20: sin atajos de una tecla, ni WASD, Q, E ni + −; las flechas y Re Pág / Av Pág siguen
    for (const t of [{ code: "KeyQ", key: "q" }, { code: "KeyW", key: "w" }, { code: "BracketRight", key: "+" }, { code: "Minus", key: "-" }]) expect(TecladoAereo.accion(t, { sinAtajos: true })).toBe(null);
    expect(TecladoAereo.accion(base, { sinAtajos: true })).toEqual({ pan: [TecladoAereo.PASO, 0] }); expect(TecladoAereo.accion({ code: "PageUp", key: "PageUp" }, { sinAtajos: true })).toEqual({ zoom: -TecladoAereo.ZOOM });
    const p = monta(true), d0 = p.api.orb.dist, e: A = { code: "PageDown", key: "PageDown", defaultPrevented: false, preventDefault() { e.defaultPrevented = true; } };
    p.ventana.dispara("keydown", e); expect(p.api.orb.dist).toBe(d0); expect(e.defaultPrevented).toBe(false);
    const r = monta(false, true), x0 = r.api.objetivo.x; r.ventana.dispara("keydown", { code: "ArrowRight", key: "ArrowRight", preventDefault() { /* doble */ } }); expect(r.api.objetivo.x).toBe(x0);
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = manifiestoCamara(monta().api);
    expect(c.id).toBe(ID_CAMARA); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

describe("L8-02: la cámara orbital sabe dónde está el suelo", () => {
  // una ladera: el suelo sube 0,1 m por metro hacia el este (x); el mundo usa z = −norte, así que suelo(x, y) recibe (x, −z)
  const ladera = (x: number, _y: number) => 100 + 0.1 * x;
  it("al desplazar (pan), objetivo.y sigue al suelo real por la exageración", () => {
    const m = monta(false, ladera); m.estado.exag = 2; m.api.objetivo.set(0, 200, 0);
    m.lienzo.dispara("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    m.lienzo.dispara("pointermove", { pointerId: 1, clientX: -400, clientY: 0, shiftKey: true, buttons: 0 });
    const o = m.api.objetivo; expect(o.x).not.toBe(0);
    expect(o.y).toBeCloseTo(ladera(o.x, -o.z) * 2, 6);
  });
  it("al cambiar la exageración, objetivo.y se recoloca sobre el suelo", () => {
    const m = monta(false, ladera); m.api.objetivo.set(50, 105, 0);
    m.els.exag!.value = "3"; m.els.exag!.dispara("input", {});
    expect(m.api.objetivo.y).toBeCloseTo(ladera(50, 0) * 3, 6);
  });
  it("la cámara no baja por debajo del suelo que tiene debajo", () => {
    const m = monta(false, () => 100); m.api.objetivo.set(0, 100, 0); m.api.orb.el = 0.08; m.api.orb.dist = 30;
    m.api.camara(); expect(m.camera.position.y).toBeGreaterThanOrEqual(100 + 2);
    const alto = monta(false, () => 100); alto.api.objetivo.set(0, 100, 0); alto.api.orb.el = 1.2; alto.api.camara();
    expect(alto.camera.position.y).toBeGreaterThan(100 + 2);
  });
  it("sin suelo (fixtures y dobles) todo sigue como antes", () => {
    const m = monta(); m.api.objetivo.set(0, 12, 0); m.lienzo.dispara("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
    m.lienzo.dispara("pointermove", { pointerId: 1, clientX: 30, clientY: 0, shiftKey: true, buttons: 0 }); expect(m.api.objetivo.y).toBe(12);
  });
});

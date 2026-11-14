// La cámara orbital (A3-6c, MU5-n; antes 09_camara.js). Con el three de verdad (sin GPU) y dobles del DOM: pon(modo) cambia el modo y los botones; la rueda acerca dentro de sus límites
// y no hace nada paseando; el deslizador de corrección escribe kcor por función; y libera() quita todas las escuchas. HONESTIDAD: nada se dibuja aquí; en el iPhone, NO probado.
import { describe, expect, it } from "vitest";
import { ID_CAMARA, creaCamara, manifiestoCamara } from "./camara.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const THREE: A = await import(/* @vite-ignore */ "three" as string);

function el() {
  const o: A = { oy: {} as Record<string, A[]>, n: 0, value: "1", textContent: "", attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { o.attrs[k] = v; }, setPointerCapture() { /* doble */ } };
  o.addEventListener = (t: string, f: A) => { (o.oy[t] = o.oy[t] || []).push(f); o.n++; }; o.removeEventListener = (t: string, f: A) => { o.oy[t] = (o.oy[t] || []).filter((x: A) => x !== f); o.n--; };
  o.dispara = (t: string, e: A) => (o.oy[t] || []).forEach((f: A) => f(Object.assign({ preventDefault() { /* doble */ }, target: o }, e)));
  return o;
}
function monta(paseando = false, suelo?: (x: number, y: number) => number) {
  const els: Record<string, A> = {}, $ = (id: string) => (els[id] = els[id] || el()), lienzo = el(), estado: A = { modo: "nube", exag: 1 }, kcor: number[] = [];
  const camera = new THREE.PerspectiveCamera(), api = creaCamara({ THREE, camera, lienzo, Estado: estado, $, fmt: (n: number) => String(n), DIST_MAX: 900, DIST_INI: 300, Usables: { toque: () => false },
    aplica() { /* doble */ }, capas() { /* doble */ }, aplicaLuego() { /* doble */ }, paseando: () => paseando, ponKcor: (v: number) => { kcor.push(v); }, IrA: () => ({ toca: () => false }),
    parcelaSel: () => 0, elegirParcela() { /* doble */ }, Ajustes: () => null, suelo });
  return { api, els, lienzo, estado, kcor, camera };
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
    expect(n()).toBeGreaterThan(10); m.api.libera(); expect(n()).toBe(0);
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

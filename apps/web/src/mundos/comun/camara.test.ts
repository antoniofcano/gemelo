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
function monta(paseando = false) {
  const els: Record<string, A> = {}, $ = (id: string) => (els[id] = els[id] || el()), lienzo = el(), estado: A = { modo: "nube", exag: 1 }, kcor: number[] = [];
  const api = creaCamara({ THREE, camera: new THREE.PerspectiveCamera(), lienzo, Estado: estado, $, fmt: (n: number) => String(n), DIST_MAX: 900, DIST_INI: 300, Usables: { toque: () => false },
    aplica() { /* doble */ }, capas() { /* doble */ }, aplicaLuego() { /* doble */ }, paseando: () => paseando, ponKcor: (v: number) => { kcor.push(v); }, IrA: () => ({ toca: () => false }),
    parcelaSel: () => 0, elegirParcela() { /* doble */ }, Ajustes: () => null });
  return { api, els, lienzo, estado, kcor };
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

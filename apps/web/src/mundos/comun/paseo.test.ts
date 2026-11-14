// El paseo (A3-6c, MU5-n; antes 12_paseo.js). Con el three de verdad (sin GPU) y dobles del DOM y del legado: entrar y salir del paseo ponen al día su estado (Paseo.E: paseando, persona, teclas,
// primera; A3-8c); con «arriba» se anda hacia donde mira, a la velocidad que da la vida (velPaseo), y el mundo activo aparta del tronco (gm.obstaculo); la palanca suma al teclado; y libera() quita
// al muñequito (sus geometrías y sus materiales, con sus «dispose») y todas sus escuchas. HONESTIDAD: nada se dibuja aquí; en el iPhone y el Quest, NO probado.
import { describe, expect, it } from "vitest";
import { ID_PASEO, PalancaPuro, TeclasPaseo, creaPaseo } from "./paseo.ts";
import type { DepsPaseo } from "./paseo.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const THREE: A = await import(/* @vite-ignore */ "three" as string);

function el(extra?: A) {
  const o: A = Object.assign({ n: 0, hidden: false, style: {}, classList: { add() { /* doble */ }, remove() { /* doble */ } }, setAttribute() { /* doble */ }, focus() { /* doble */ } }, extra || {});
  o.addEventListener = () => { o.n++; }; o.removeEventListener = () => { o.n--; }; return o;
}
function monta(parcelas?: A[]) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), ventana = el(), documento = el(), elementos: Record<string, A> = {};
  const $ = (id: string) => (elementos[id] = elementos[id] || el());
  const dron = { on: false };
  const d: DepsPaseo = {
    THREE, scene, camera, Estado: { exag: 1 }, Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), D: { parcelas: parcelas || [{ centro: [10, 26] }] }, $, lienzo: el({ tabIndex: 0 }), visor: el(), copaAlta: () => 0, sensMirar: () => ({ k: 1, y: 1 }),
    parcelaSel: () => 0, fincaSel: () => -1, fincas: () => [],
    vida: { velPaseo: (av: number) => av * 1.7, giroPaseo: () => 1, ponQuad() { /* doble */ }, ponDron() { /* doble */ }, vidaPaseo() { /* doble */ }, cicloVista() { /* doble */ },
      dronMando() { /* doble */ }, camaraDron: () => false, vidaEntra() { /* doble */ }, vidaSale() { /* doble */ } },
    enQuad: () => false, enDron: () => dron.on, TR: () => ({ act: false }), iniciaTransicion() { /* doble */ }, iniciaSalida() { /* doble */ }, Ajustes: () => null,
    IrA: () => ({ paso: () => null, cancela() { /* doble */ } }), gm: () => ({ suelo: () => 0, obstaculo: (x: number, y: number, r: number) => (Math.hypot(x - 10, y - 21) < r ? { x: 10 + r, y: 21 } : null) }),
    documento, ventana
  };
  const api = creaPaseo(d);
  return { api, d, legado: api.E as A, scene, ventana, documento, elementos };   // A3-8c: lo que leen los demás, Paseo.E (antes, lo que el legado espejaba)
}

describe("L6-11: las teclas del paseo no roban las del navegador", () => {
  it("nada con Ctrl, Alt o Cmd ni en un campo; Espacio sobre un botón es su clic; dentro de una ventana, Espacio y las flechas son suyos; WASD anda igual", () => {
    expect(TeclasPaseo.accion({ code: "KeyW" }, {})).toBe("up");
    for (const m of [{ ctrl: true }, { meta: true }, { alt: true }]) expect(TeclasPaseo.accion({ code: "KeyS", ...m }, {})).toBe(null);
    expect(TeclasPaseo.accion({ code: "ArrowLeft" }, { tag: "INPUT" })).toBe(null);
    expect(TeclasPaseo.accion({ code: "Space" }, { tag: "BUTTON" })).toBe(null); expect(TeclasPaseo.accion({ code: "Space" }, { tag: "CANVAS" })).toBe("sube");
    expect(TeclasPaseo.accion({ code: "ArrowDown" }, { tag: "DIV", panel: true })).toBe(null); expect(TeclasPaseo.accion({ code: "KeyD" }, { tag: "BUTTON", panel: true })).toBe("right");
    expect(TeclasPaseo.accion({ code: "KeyQ" }, { tag: "BUTTON" })).toBe("quad");
    // L6-20: sin atajos de una tecla, ni WASD ni V, Q, E; las flechas, Mayús y Espacio siguen
    expect(TeclasPaseo.accion({ code: "KeyW" }, { sinAtajos: true })).toBe(null); expect(TeclasPaseo.accion({ code: "KeyE" }, { sinAtajos: true })).toBe(null);
    expect(TeclasPaseo.accion({ code: "ArrowUp" }, { sinAtajos: true })).toBe("up"); expect(TeclasPaseo.accion({ code: "ShiftLeft" }, { sinAtajos: true })).toBe("run");
  });
});

describe("paseo", () => {
  it("L7-13: un mundo sin parcelas: entrar no rompe y se pasea desde donde estaba", () => {
    const m = monta([]); m.api.pp.x = 3; m.api.pp.y = 4;
    expect(() => m.api.entraPaseo()).not.toThrow();
    expect(m.api.pp).toMatchObject({ x: 3, y: 4, ang: 0 }); expect(m.legado.paseando).toBe(true);
  });
  it("al cargar, el muñequito ya está en la escena (oculto) y el legado lo tiene; entrar y salir espejan paseando y teclas", () => {
    const m = monta();
    expect(m.d.Materiales.duenos()["paseo"]).toBe(4);   // piel, camisa, pantalón y gorra, de la fábrica con su dueño
    expect(m.legado.persona).toBeTruthy(); expect(m.scene.children).toContain(m.legado.persona); expect(m.legado.persona.visible).toBe(false);
    m.api.entraPaseo();
    expect(m.legado.paseando).toBe(true); expect(m.api.pp).toMatchObject({ x: 10, y: 20, ang: 0 }); expect(m.legado.primera).toBe(false);
    const t0 = m.legado.teclas; m.api.salePaseo();
    expect(m.legado.paseando).toBe(false); expect(m.legado.teclas).not.toBe(t0);   // salir crea teclas nuevas, como siempre, y el legado las ve
  });
  it("con «arriba» se anda hacia donde mira y el mundo activo aparta del tronco; la palanca suma al teclado", () => {
    const m = monta(); m.api.entraPaseo();
    m.legado.teclas.up = true; m.api.actualizaPaseo(0.5);   // de (10, 20) hacia el norte 0,85 m: cae a 0,15 m del tronco de (10, 21)…
    expect(m.api.pp.x).toBeCloseTo(10.55); expect(m.api.pp.y).toBeCloseTo(21);   // …y el mundo activo lo aparta a 0,55 m
    m.legado.teclas.up = false; m.api.pp.x = 0; m.api.pp.y = 0; m.api.ponPalanca(1, 0); m.api.actualizaPaseo(0.1);   // la palanca adelante, lejos de troncos
    expect(m.api.pp.x).toBeCloseTo(0); expect(m.api.pp.y).toBeCloseTo(0.17);   // 1,7 m/s (velPaseo) · 0,1 s
    expect(PalancaPuro.lee(0, 0.1)).toEqual({ fuerza: 0, av: 0, lat: 0 });
  });
  it("libera() quita al muñequito (sus geometrías y sus materiales) y todas las escuchas; dos veces no rompe", () => {
    const m = monta(), sueltos = { n: 0 };
    let mallas = 0; m.legado.persona.traverse((o: A) => { if (o.isMesh) { mallas++; o.geometry.addEventListener("dispose", () => sueltos.n++); o.material.addEventListener("dispose", () => sueltos.n++); } });
    const escuchas = () => m.ventana.n + m.documento.n + Object.values(m.elementos).reduce((s: number, e: A) => s + e.n, 0);
    expect(escuchas()).toBeGreaterThan(0);
    m.api.libera();
    expect(m.scene.children).not.toContain(m.legado.persona); expect(escuchas()).toBe(0);
    expect(sueltos.n).toBeGreaterThanOrEqual(mallas * 2 - 4);   // los materiales se comparten entre piezas: cada uno avisa una vez por pieza que lo suelta
    expect(() => m.api.libera()).not.toThrow();
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const c = monta().api.componente!;
    expect(c.id).toBe(ID_PASEO); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

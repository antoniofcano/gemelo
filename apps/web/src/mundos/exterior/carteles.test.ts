// Los carteles de haza y el tablón del exterior (A3-3, MU5-n; antes 44b_carteles.js). Con el three de verdad (sin GPU: geometría, materiales, texturas y mallas existen sin
// renderizador) y un documento, unas hazas y un lienzo de mentira. El detalle de lo puro (la lista blanca, la maqueta, los topes angulares de VR) está en
// pruebas/guardianes/carteles.test.js. Aquí: el pool (3 + 1 mallas creadas UNA vez), que se elige y se repinta sin crear nada y, sobre todo, el ciclo de vida: montar y liberar
// (varias veces) suelta cada geometría, cada material y cada textura, y deja la escena como estaba. HONESTIDAD: nada se dibuja; lo que se ve lo dice el banco y el Quest, no probado aquí.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { CartelesPuro, ID_CARTELES, creaCarteles, manifiestoCarteles } from "./carteles.ts";
import type { DepsCarteles } from "./carteles.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);
const cuadro = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const haza = (id: number, x0: number, y0: number, x1: number, y1: number) => ({ id, nombre: "Haza " + id, anillos: [cuadro(x0, y0, x1, y1)] });

function mundo(hazas: ReturnType<typeof haza>[]) {
  const scene = new THREE.Scene(), canvases: { width: number; height: number }[] = [], cam = { x: 0, y: 0 }, escuchas: Record<string, (d?: unknown) => void> = {}, ventana: Record<string, unknown> = {};
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 2, 0); camera.updateMatrixWorld(true);
  const documento = { createElement: () => { const c = { width: 0, height: 0, getContext: () => ({ clearRect() { /* sin lienzo */ }, fillRect() { /* sin lienzo */ }, fillText() { /* sin lienzo */ }, measureText: (t: string) => ({ width: t.length * 10 }) }) }; canvases.push(c); return c; } };
  const deps: DepsCarteles = {
    THREE, documento, ventana, scene, camera, VRX: { on: false, cab: new THREE.Vector3() }, texColor: t => t, gLinde: { visible: true }, suelo: () => 2, Estado: { exag: 1 },
    Hazas: { lindes: () => hazas.map(h => ({ id: h.id, anillos: h.anillos })), datos: (id) => { const h = hazas.find(q => q.id === id); return h ? { id, nombre: h.nombre, es_mia: false, ficha: null } : null; } },
    D: { parcelas: [{ centro: [0, 0] }], ext: [-500, 500, 500, -500], finca_id: "hituelo" }, cIn: new Array(4321), EST: { origen: "" }, bbchEn: () => 82, hoyMadrid: () => "2026-11-05",
  };
  const n = { id: ID_CARTELES, parametros: {}, limpia: <F>(fn: F): F => fn, on: (ev: string, fn: (d?: unknown) => void) => { escuchas[ev] = fn; return () => { /* sin efecto */ }; }, emite: () => 0, api: () => null };
  return { deps, scene, canvases, camera, cam, escuchas, ventana, n, hazas };
}
/** apunta los dispose de toda la geometría, todo el material y toda la textura de las mallas de la escena */
function espia(escena: { traverse(f: (o: never) => void): void }) {
  const hechos = { geometria: new Set<unknown>(), material: new Set<unknown>(), textura: new Set<unknown>() }, vivos = { geometria: new Set<unknown>(), material: new Set<unknown>(), textura: new Set<unknown>() };
  const apunta = (o: { addEventListener(t: string, f: () => void): void }, k: keyof typeof hechos) => { if (vivos[k].has(o)) return; vivos[k].add(o); o.addEventListener("dispose", () => { hechos[k].add(o); }); };
  escena.traverse((o: never) => {
    const x = o as { geometry?: never; material?: { map?: never } };
    if (x.geometry) apunta(x.geometry, "geometria"); if (x.material) { apunta(x.material as never, "material"); if (x.material.map) apunta(x.material.map, "textura"); }
  });
  return { hechos, vivos };
}

describe("carteles de haza (componente del exterior)", () => {
  it("sin hazas no crea nada; con hazas, un pool de 3 + 1 mallas con su lienzo, creadas UNA vez y sin crear nada más al elegir ni repintar", () => {
    const w0 = mundo([]), m0 = creaCarteles(w0.deps).CartelesMotor(w0.n);
    expect(w0.scene.children).toHaveLength(0); expect(w0.canvases).toHaveLength(0); m0.tarde(); m0.mundo(); m0.libera();
    const hs = [haza(1, 10, 0, 20, 10), haza(2, -20, 0, -10, 10), haza(3, 0, 20, 10, 30), haza(4, 0, 40, 10, 50), haza(5, 300, 300, 310, 310)];
    const w = mundo(hs), m = creaCarteles(w.deps).CartelesMotor(w.n);
    expect(w.scene.children).toHaveLength(1); const g = w.scene.children[0]; expect(g.name).toBe("carteles de haza"); expect(g.children).toHaveLength(4); expect(w.canvases).toHaveLength(4);
    expect(w.canvases.every(c => c.width === CartelesPuro.W && c.height === CartelesPuro.H)).toBe(true);
    const sp = espia(w.scene);
    for (let i = 0; i < 20; i++) { m.tarde(); m.mundo(); }
    expect(g.children).toHaveLength(4); expect(w.canvases).toHaveLength(4); expect(sp.vivos.geometria.size).toBe(1); expect(sp.vivos.material.size).toBe(4); expect(sp.vivos.textura.size).toBe(4);
    expect(m.estado()).toMatchObject({ carteles: 3, tablon: true, llamadas: 4, hazas: 5 });
    expect((w.ventana["__carteles"] as () => { ids: number[] })().ids.slice().sort()).toEqual([1, 2, 3]);
  });

  it("L2-05: montar y liberar (varias veces, también con «hazas:cambia») suelta cada geometría, cada material y cada textura, deja los lienzos a 1 × 1 y la escena como estaba", () => {
    const hs = [haza(1, 10, 0, 20, 10), haza(2, -20, 0, -10, 10)], w = mundo(hs), m = creaCarteles(w.deps).CartelesMotor(w.n);
    let sp = espia(w.scene);
    m.libera();
    expect(w.scene.children).toHaveLength(0); expect(sp.hechos.geometria.size).toBe(1); expect(sp.hechos.material.size).toBe(4); expect(sp.hechos.textura.size).toBe(4);
    expect(w.canvases.every(c => c.width === 1 && c.height === 1)).toBe(true); expect(m.estado()).toMatchObject({ carteles: 0, tablon: false, llamadas: 0 });
    m.libera(); m.tarde(); m.mundo();   // dos veces, y liberado no hace nada
    // y con «hazas:cambia»: sin hazas se suelta todo; con hazas vuelve a crearse (no tras liberar el componente)
    const w2 = mundo(hs), m2 = creaCarteles(w2.deps).CartelesMotor(w2.n);
    for (let v = 0; v < 3; v++) {
      sp = espia(w2.scene); expect(w2.scene.children).toHaveLength(1);
      hs.length = 0; w2.escuchas["hazas:cambia"]!();
      expect(w2.scene.children).toHaveLength(0); expect(sp.hechos.geometria.size).toBe(1); expect(sp.hechos.material.size).toBe(4); expect(sp.hechos.textura.size).toBe(4);
      hs.push(haza(1, 10, 0, 20, 10), haza(2, -20, 0, -10, 10)); w2.escuchas["hazas:cambia"]!(); expect(w2.scene.children).toHaveLength(1);
    }
    expect(w2.canvases).toHaveLength(4 * 4);   // 4 lienzos por montaje, 4 montajes
    m2.libera(); w2.escuchas["hazas:cambia"]!(); expect(w2.scene.children).toHaveLength(0);   // liberado: el aviso ya no los vuelve a montar
  });

  it("«mundo:hoy» llena la línea del tablón y la repinta una sola vez; la casilla «Linde» (gLinde.visible) esconde los carteles", () => {
    const w = mundo([haza(1, 10, 0, 20, 10)]), m = creaCarteles(w.deps).CartelesMotor(w.n);
    m.tarde(); const p0 = m.estado().pintadas; expect(p0).toBe(2);   // el tablón y la haza 1
    m.tarde(); expect(m.estado().pintadas).toBe(p0);
    w.escuchas["mundo:hoy"]!({ linea: { txt: "Semana: poda 8", de: "OlivarTrack", cuando: new Date().toISOString() } }); m.tarde(); expect(m.estado().pintadas).toBe(p0 + 1);
    m.tarde(); m.tarde(); expect(m.estado().pintadas).toBe(p0 + 1);
    w.escuchas["mundo:hoy"]!({ linea: "basura" }); m.tarde(); expect(m.estado().pintadas).toBe(p0 + 2);
    w.deps.gLinde.visible = false; m.tarde(); expect(w.scene.children[0].visible).toBe(false); w.deps.gLinde.visible = true; m.tarde(); expect(w.scene.children[0].visible).toBe(true);
    m.libera();
  });

  it("el manifiesto vale, es de los mundos [exterior], con su bandera, sus dos fases y su presupuesto; y su libera suelta de verdad", () => {
    const w = mundo([haza(1, 10, 0, 20, 10)]), man = manifiestoCarteles(w.deps);
    expect(ComponentesPuro.valida(man)).toEqual([]);
    expect(man.id).toBe("carteles-haza"); expect(man.mundos).toEqual(["exterior"]); expect(man.bandera).toEqual({ defecto: true, url: "carteles" }); expect(man.fases).toEqual({ mundo: 0, tarde: 0.5 });
    expect(man.eventos).toEqual({ escucha: ["hazas:cambia", "mundo:hoy"], emite: [] }); expect(man.presupuesto).toEqual({ llamadas: 4, triangulos: 8, texturasMB: 2.5 });
    const api = man.monta(w.n) as object; man.actualiza?.tarde?.(0.5, 0, api); man.actualiza?.mundo?.(0.016, 0, api);
    expect(w.scene.children).toHaveLength(1); man.libera(api); expect(w.scene.children).toHaveLength(0); expect(() => man.libera(api)).not.toThrow(); expect(() => man.libera(null)).not.toThrow();
  });
});

// Las decoraciones de los olivos del exterior (A3-3, MU5-n; antes 50_decoraciones.js). Con el three de verdad (y sus utilidades, mergeGeometries) y unos olivos, un Bus y una
// ficha de mentira. El detalle de lo puro (con fast-check), de los triángulos por pieza y del reparto está en pruebas/guardianes/decoraciones.test.js. Aquí: que sin servidor no
// hace nada, que con servidor monta una InstancedMesh por pieza con algo cerca, que complementa la ficha del olivo y, sobre todo, el ciclo de vida: montar y liberar (varias
// veces) suelta cada InstancedMesh, cada geometría y los dos materiales, quita el complemento de la ficha y deja la escena como estaba. HONESTIDAD: nada se dibuja; lo que se ve
// lo dice el banco y el Quest, no probado aquí.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { DecoracionesPuro, ID_DECORACIONES, creaDecoraciones, decoracionesGeometria, manifiestoDecoraciones } from "./decoraciones.ts";
import type { DepsDecoraciones, UtilesGeometria } from "./decoraciones.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);
const rutaU = "three/addons/utils/BufferGeometryUtils.js";   // por variable: three no trae tipos
const UTILES = await import(/* @vite-ignore */ rutaU as string) as UtilesGeometria;

const PIEZAS = ["flores", "cinta", "farolillo", "cosecha", "luces", "lazo"];
function mundo(sinApi = false) {
  const scene = new THREE.Scene(), escuchas: Record<string, ((d?: unknown) => void)[]> = {}, emitidos: string[] = [], complementos: ((f: { filas?: unknown[] }, id: string) => void)[] = [], ventana: Record<string, unknown> = {}, libres: string[] = [];
  const copas = Array.from({ length: 36 }, (_, i) => ({ i, id: 1000 + i, x: (i % 6) * 7 - 20, y: Math.floor(i / 6) * 7 - 20, h: 4, perfil: [2, 2, 2, 2, 2, 2, 2, 2], oliv: i !== 5 }));
  const E = { exag: 1 };
  const deps: DepsDecoraciones = {
    THREE, D: { base: "/teselas/hituelo/", finca_id: "hituelo" }, FACTOR_R8: 0.5, FACTOR_R8_GEN: 1, busqueda: "", ConfigPuro: { prefijoApi: () => (sinApi ? null : "/api/") },
    copas, suelo: () => 10, radioEn: (p) => p[0]!, Generados: { rotulo: (i) => (i % 2 ? {} : null) },
    Entidades: { complementa: (_t, fn) => { complementos.push(fn); return () => { complementos.splice(complementos.indexOf(fn), 1); }; } }, Estaticos: { congela() { /* sin efecto en la prueba */ } },
    scene, camera: new THREE.PerspectiveCamera(), Estado: E, objetivo: { x: 0, z: 0 }, paseando: () => true, VRX: { on: false, cab: { x: 0, z: 0 } }, ventana, Componentes: { libera: (id) => { libres.push(id); } },
  };
  const n = {
    id: ID_DECORACIONES, parametros: {}, limpia: <F>(fn: F): F => { limpiezas.push(fn as never); return fn; },
    on: (ev: string, fn: (d?: unknown) => void) => { (escuchas[ev] = escuchas[ev] || []).push(fn); return () => { /* sin efecto */ }; }, emite: (ev: string) => { emitidos.push(ev); return 0; }, api: () => null,
  };
  const limpiezas: (() => void)[] = [];
  const lista = (ids: number[], pieza: (k: number) => string) => ids.map((id, k) => ({ finca: "hituelo", copas_id: 1000 + id, pieza: pieza(k), mia: k % 2 === 0 }));
  return { deps, scene, n, escuchas, emitidos, complementos, ventana, libres, limpiezas, lista, E, emite: (ev: string, d?: unknown) => (escuchas[ev] || []).forEach(f => f(d)) };
}
const motorDe = (m: ReturnType<typeof mundo>, util: () => Promise<UtilesGeometria> = () => Promise.resolve(UTILES)) => creaDecoraciones(m.deps).DecoracionesMotor(m.n, util);
const listo = () => new Promise(r => setTimeout(r, 0));
/** apunta los dispose de toda la geometría y todo el material (y las InstancedMesh) que cuelgan de un grupo */
function espia(raiz: { traverse(f: (o: never) => void): void }) {
  const hechos = { geometria: new Set<unknown>(), material: new Set<unknown>(), malla: new Set<unknown>() }, vivos = { geometria: new Set<unknown>(), material: new Set<unknown>(), malla: new Set<unknown>() };
  const apunta = (o: { addEventListener(t: string, f: () => void): void }, k: keyof typeof hechos) => { if (vivos[k].has(o)) return; vivos[k].add(o); o.addEventListener("dispose", () => { hechos[k].add(o); }); };
  raiz.traverse((o: never) => { const x = o as { geometry?: never; material?: never; isInstancedMesh?: boolean }; if (x.geometry) apunta(x.geometry, "geometria"); if (x.material) apunta(x.material, "material"); if (x.isInstancedMesh) apunta(o, "malla"); });
  return { hechos, vivos };
}

describe("decoraciones de los olivos (componente del exterior)", () => {
  it("sin servidor no crea nada, no pide las utilidades de three, no complementa la ficha ni pregunta por el Bus", async () => {
    const m = mundo(true); let pedidas = 0;
    const api = motorDe(m, () => { pedidas++; return Promise.resolve(UTILES); }); await listo();
    m.emite("decoraciones:cambian", { lista: m.lista([0, 1, 2], () => "luces") }); api.tarde(0.5);
    expect(pedidas).toBe(0); expect(m.scene.children).toHaveLength(0); expect(m.complementos).toHaveLength(0); expect(m.emitidos).toEqual([]); expect(api.estado()).toMatchObject({ api: false, lib: "sin servidor" });
    expect(() => api.libera()).not.toThrow();
  });

  it("con servidor pide la lista al montarse y monta una InstancedMesh por pieza con algo cerca (como mucho 64 en total), dentro del presupuesto; lo desconocido y lo de otra finca, fuera", async () => {
    const m = mundo(), api = motorDe(m); await listo();
    expect(m.emitidos).toEqual(["decoraciones:pide"]); expect(m.complementos).toHaveLength(1);
    const l = m.lista(Array.from({ length: 35 }, (_, i) => i), k => PIEZAS[k % 6]!).concat([{ finca: "hituelo", copas_id: 1000, pieza: "cohete", mia: false }, { finca: "cerro", copas_id: 1001, pieza: "luces", mia: false }]);
    m.emite("decoraciones:cambian", { lista: l }); api.tarde(0.5);
    const g = m.scene.getObjectByName("decoraciones de los olivos"); expect(g).toBeTruthy();
    expect(g.children.map((o: { name: string; isInstancedMesh: boolean }) => [o.name, o.isInstancedMesh])).toEqual(PIEZAS.map(p => ["decoración " + p, true]));
    const e = api.estado(); expect(e.validas).toBe(36); expect(e.enMundo).toBe(34);   // 35 + la de otra finca (válida, pero no está en este mundo) – la del olivo 5 (no es olivo); «cohete» no vale expect(e.llamadas).toBeLessThanOrEqual(6); expect(e.elegidas).toBeLessThanOrEqual(DecoracionesPuro.MAX);
    expect(e.triangulos).toBeLessThanOrEqual(DecoracionesPuro.MAX * DecoracionesPuro.MAX_TRI);
    // la ficha: la fila «Decoración», rotulada como ilustrativa
    const f = { filas: [] as { k: string; de: string }[] }; m.complementos.forEach(fn => fn(f, "olivo:hituelo:1000")); expect(f.filas).toHaveLength(1); expect(f.filas[0]!.k).toBe("Decoración"); expect(f.filas[0]!.de).toMatch(/^ilustrativa/);
    api.libera();
  });

  it("L2-05: montar y liberar (varias veces) suelta cada InstancedMesh, cada geometría y los dos materiales, quita el complemento de la ficha y deja la escena como estaba", async () => {
    for (let v = 0; v < 3; v++) {
      const m = mundo(), api = motorDe(m); await listo();
      m.emite("decoraciones:cambian", { lista: m.lista(Array.from({ length: 12 }, (_, i) => i), k => PIEZAS[k % 6]!) }); api.tarde(0.5);
      const g = m.scene.children[0]; expect(g.children).toHaveLength(6); const sp = espia(g);
      expect(sp.vivos.malla.size).toBe(6); expect(sp.vivos.geometria.size).toBe(6); expect(sp.vivos.material.size).toBe(2);   // un Lambert para las que reciben luz y un Basic para farolillo y luces
      api.libera();
      expect(m.scene.children).toHaveLength(0); expect(sp.hechos.malla.size).toBe(6); expect(sp.hechos.geometria.size).toBe(6); expect(sp.hechos.material.size).toBe(2);
      expect(m.complementos).toHaveLength(0); api.tarde(0.5); expect(m.scene.children).toHaveLength(0);   // liberado, no vuelve a crear nada
      m.emite("decoraciones:cambian", { lista: m.lista([0], () => "lazo") }); api.tarde(0.5); expect(m.scene.children).toHaveLength(0);
      expect(() => api.libera()).not.toThrow();
      m.limpiezas.forEach(f => f()); expect("__decoraciones" in m.ventana).toBe(false);
    }
  });

  it("sin las utilidades de three no crea nada y lo dice; si se libera antes de que lleguen, no hace nada al llegar", async () => {
    const m = mundo(), api = motorDe(m, () => Promise.reject(new Error("sin red"))); await listo();
    m.emite("decoraciones:cambian", { lista: m.lista([0, 1], () => "luces") }); api.tarde(0.5);
    expect(m.scene.children).toHaveLength(0); expect(api.estado().lib).toMatch(/^sin utilidades de three: sin red/); api.libera();
    const m2 = mundo(), api2 = motorDe(m2); api2.libera(); await listo(); m2.emite("decoraciones:cambian", { lista: m2.lista([0], () => "luces") }); api2.tarde(0.5);
    expect(m2.scene.children).toHaveLength(0); expect(api2.estado().lib).toBe("pidiendo");
  });

  it("las mallas: cada pieza cabe en los triángulos del catálogo, sin índice ni uv, con color en los vértices; un código desconocido no da malla", () => {
    for (const p of DecoracionesPuro.CATALOGO) {
      const g = decoracionesGeometria(THREE, p.id, UTILES);
      expect(g.index).toBeNull(); expect(g.getAttribute("uv")).toBeUndefined(); expect(g.getAttribute("color")).toBeTruthy(); expect(g.getAttribute("normal")).toBeTruthy();
      const t = g.getAttribute("position").count / 3; expect(t).toBeGreaterThan(0); expect(t).toBeLessThanOrEqual(p.triangulos);
      g.dispose();
    }
    expect(decoracionesGeometria(THREE, "cohete", UTILES)).toBeNull();
  });

  it("el manifiesto vale, es de los mundos [exterior], con su bandera, su fase «tarde» y su presupuesto; y su libera suelta de verdad", async () => {
    const m = mundo(), man = manifiestoDecoraciones(m.deps, () => Promise.resolve(UTILES));
    expect(ComponentesPuro.valida(man)).toEqual([]);
    expect(man.id).toBe("decoraciones-olivo"); expect(man.mundos).toEqual(["exterior"]); expect(man.bandera).toEqual({ defecto: true, url: "decoraciones" }); expect(man.fases).toEqual({ tarde: 0.5 });
    expect(man.eventos).toEqual({ escucha: ["decoraciones:cambian", "depura:lineas"], emite: ["decoraciones:pide"] }); expect(man.presupuesto).toEqual({ llamadas: 6, triangulos: 2560 });
    const api = man.monta(m.n) as object; await listo();
    m.emite("decoraciones:cambian", { lista: m.lista([0, 1, 2], () => "luces") }); man.actualiza?.tarde?.(0.5, 0, api);
    expect(m.scene.children).toHaveLength(1); man.libera(api); expect(m.scene.children).toHaveLength(0); expect(() => man.libera(api)).not.toThrow(); expect(() => man.libera(null)).not.toThrow();
  });
});

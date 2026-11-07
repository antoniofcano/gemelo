// La presencia compartida (mundos/comun/presencia.ts; MU5-n, A3-6a: antes 38_presencia_compartida.js). Con el three de verdad (sin GPU), la fábrica de materiales
// del núcleo y un DOM de mentira. Se comprueba el ciclo de vida que pide la migración: el componente es de todo mundo; montado sin bandera no crea nada; con
// ?presencia=sim&chat=1 crea sus mallas, el atlas de nombres, el panel y el observador del chat, y libera() lo suelta todo (geometrías, materiales y textura con su
// dispose, el lienzo a 0, el panel fuera del DOM, el observador desconectado, el tipo «persona» quitado) y deja el gancho contestando activo: false.
// Lo de siempre (la sala, el chat, «Ir con», los avatares) lo cubren pruebas/guardianes/red.test.js, guiada.test.js y oficina_mundo.test.js. HONESTIDAD: nada se dibuja aquí (regla 7).
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { creaSitioJunto } from "./muneco.ts";
import { ID_PRESENCIA, MATERIAL_NOMBRES, creaPresencia, defNombres, manifiestoPresencia } from "./presencia.ts";
import type { DepsPresencia } from "./presencia.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

/** un elemento del DOM de mentira: lo justo que usa el panel (hijos, estilo, escuchas, quitarse) */
class El {
  tagName: string; children: El[] = []; style: Record<string, string> = {}; attrs: Record<string, string> = {}; hidden = false; textContent = ""; parent: El | null = null;
  width = 0; height = 0; classList = { contains: () => false };
  constructor(t: string) { this.tagName = t.toUpperCase(); }
  appendChild(c: El) { c.parent = this; this.children.push(c); return c; }
  removeChild(c: El) { this.children = this.children.filter(x => x !== c); c.parent = null; return c; }
  remove() { if (this.parent) this.parent.removeChild(this); }
  get firstChild(): El | null { return this.children[0] || null; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  addEventListener() {} removeEventListener() {} focus() {}
  getContext() { return new Proxy({ canvas: this }, { get: (t: any, k) => (k === "canvas" ? t.canvas : k === "measureText" ? () => ({ width: 10 }) : () => {}), set: () => true }); }
}

function monta(busqueda: string) {
  const scene = new THREE.Scene(), body = new El("body"), visor = new El("div"), window: Record<string, any> = {}, tipos: string[] = [], quitados: string[] = [];
  const observadores: { conectado: boolean }[] = [];
  vi.stubGlobal("MutationObserver", class { o = { conectado: false }; constructor() { observadores.push(this.o); } observe() { this.o.conectado = true; } disconnect() { this.o.conectado = false; } });
  const Materiales = creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" });
  const deps: DepsPresencia = {
    THREE, location: { search: busqueda, href: "https://gemelo.test/" + busqueda }, window, document: { createElement: (t: string) => new El(t), createTextNode: (t: string) => ({ t }), getElementById: () => null, body },
    fetch: () => Promise.reject(new Error("sin red")), consola: { warn() {} }, utilesGeometria: () => Promise.reject(new Error("sin addons en la prueba")),
    D: { ext: [-100, 100, 100, -100] }, ConfigPuro: { prefijoApi: () => null }, Aparato: { clase: () => "escritorio" }, Materiales,
    Entidades: { registra: (d: { tipo: string }) => { tipos.push(d.tipo); return () => { quitados.push(d.tipo); }; } }, Componentes: { libera: () => false },
    suelo: () => 10, scene, camera: new THREE.PerspectiveCamera(), renderer: { xr: { getController: () => ({ addEventListener() {}, removeEventListener() {} }) } }, texColor: (t: unknown) => t,
    Estado: { exag: 1 }, visor, quad: new THREE.Group(), dron: new THREE.Group(),
    sitioJunto: creaSitioJunto({ copas: [], D: { ext: [-100, 100, 100, -100] }, suelo: () => 10 }),
    objetivo: new THREE.Vector3(0, 0, 0), paseando: true, pp: { x: 0, y: 0, ang: 0 }, enQuad: false, enDron: false,
    VRX: { on: false, cab: new THREE.Vector3(), rig: { yaw: 0 } }, Ajustes: undefined, Movibles: { hazMovible: () => ({ menuLlevar() {}, coloca() {} }) },
    Llegada: { funde: (f: () => void) => { f(); return true; }, aparece() {} }, TR: {}
  };
  const oyentes: Record<string, ((d?: unknown) => void)[]> = {};
  const n = { id: ID_PRESENCIA, parametros: {}, limpia: <F>(f: F) => f, api: () => null, emite: () => 0,
    on: (ev: string, fn: (d?: unknown) => void) => { (oyentes[ev] = oyentes[ev] || []).push(fn); return () => {}; } };
  return { api: creaPresencia(deps, n, null) as any, deps, scene, visor, window, tipos, quitados, observadores, oyentes };
}
/** lo que cuelga de un objeto: sus geometrías, materiales y texturas (de los materiales y de sus uniformes) */
function recursos(o: any) {
  const g = new Set<any>(), m = new Set<any>(), t = new Set<any>();
  o.traverse((x: any) => {
    if (x.geometry) g.add(x.geometry);
    for (const mat of ([] as any[]).concat(x.material || [])) { m.add(mat); for (const k of Object.keys(mat)) if (mat[k] && mat[k].isTexture) t.add(mat[k]); for (const u of Object.values(mat.uniforms || {})) if (u && (u as any).value && (u as any).value.isTexture) t.add((u as any).value); }
  });
  return { g: [...g], m: [...m], t: [...t] };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("presencia-compartida: de todo mundo y con libera() de verdad (A3-6a)", () => {
  it("el manifiesto vale, es de todo mundo y consume solo lo que le da el legado", () => {
    const def = manifiestoPresencia({} as DepsPresencia);
    expect(ComponentesPuro.valida(def)).toEqual([]);
    expect(ComponentesPuro.deTodos(def)).toBe(true);
    expect(def.consume).not.toContain("PoseCodec");   // la pose, la sala y el muñeco se importan de red/ y de ./muneco.ts
    expect(def.expone).toEqual(["Presencia"]);
  });

  it("sin ?presencia, montada no crea nada (ni escena, ni tipo «persona», ni panel)", () => {
    const r = monta("");
    expect(r.scene.children).toHaveLength(0); expect(r.tipos).toEqual([]); expect(r.visor.children).toHaveLength(0);
    expect(r.api.activo()).toBe(false);
    r.api.libera(); expect(r.window.__presencia().activo).toBe(false);
  });

  it("?presencia=sim&chat=1: crea los muñecos, el atlas y el panel; libera() suelta mallas, geometrías, materiales, la textura y su lienzo, el panel y el observador", () => {
    vi.useFakeTimers({ toFake: ["performance"] });   // la red de mentira entrega a los 30-90 ms del reloj de la página
    const r = monta("?presencia=sim&n=6&chat=1");
    expect(r.api.activo()).toBe(true); expect(r.tipos).toEqual(["persona"]);
    const grupo = r.scene.children.find((x: any) => x.name === "presencia");
    expect(grupo).toBeTruthy();
    for (let i = 0; i < 40; i++) { vi.advanceTimersByTime(50); r.api.actualiza(0.05); }   // que lleguen poses y se coloquen
    expect(r.api.estado().vistos).toBeGreaterThan(0);
    const { g, m, t } = recursos(grupo), sueltos = new Set<any>();
    for (const x of [...g, ...m, ...t]) x.addEventListener("dispose", () => sueltos.add(x));
    expect(g.length).toBeGreaterThanOrEqual(6); expect(m.length).toBeGreaterThanOrEqual(3); expect(t).toHaveLength(1);   // el atlas de nombres
    const lienzo = t[0].image;
    expect(lienzo.width).toBeGreaterThan(0);
    expect(r.visor.children.map((c: El) => c.attrs.id)).toEqual(["presenciaGente", "presenciaBurbuja"]);   // el chat y su burbuja, con sus ids de siempre
    expect(r.observadores.map(o => o.conectado)).toEqual([true]);
    // segundo commit de la receta: los materiales salen de la fábrica con dueño; los nombres, por define + crea con el GLSL de siempre
    expect(r.deps.Materiales.duenos()[ID_PRESENCIA]).toBe(m.length);
    const matN = m.find((x: any) => x.isShaderMaterial);
    expect(matN).toMatchObject({ transparent: true, depthWrite: false, fog: false }); expect(matN.vertexShader).toMatch(/attribute float aCelda/);
    expect(r.deps.Materiales.ruta("nombres-presencia")).toBe("clasico");
    r.api.libera();
    expect(r.scene.children).toHaveLength(0);
    for (const x of [...g, ...m, ...t]) expect(sueltos.has(x), "sin dispose: " + (x.type || x.constructor.name)).toBe(true);
    expect(lienzo.width).toBe(0); expect(lienzo.height).toBe(0);
    expect(r.visor.children).toHaveLength(0);
    expect(r.observadores.map(o => o.conectado)).toEqual([false]);   // el hallazgo de A3-6a: el observador del chat seguía vivo
    expect(r.quitados).toEqual(["persona"]);
    expect(r.deps.Materiales.duenos()[ID_PRESENCIA]).toBeUndefined();   // la fábrica ya no guarda nada suyo
    expect(r.window.__presencia().activo).toBe(false);   // el gancho sigue contestando, como antes de C5
    r.api.libera();   // dos veces: no falla ni suelta dos veces
    expect(r.quitados).toEqual(["persona"]);
  });

  it("la variante TSL de los nombres (tercer commit): apagada; con three/webgpu y three/tsl de verdad es un MeshBasicNodeMaterial con sus nodos, y solo sale con el renderer nuevo", async () => {
    const rutaW = "three/webgpu", rutaT = "three/tsl";   // por variable: three no trae tipos (y así tampoco entra en el grafo de dependency-cruiser)
    const W = await import(/* @vite-ignore */ rutaW), T = await import(/* @vite-ignore */ rutaT);
    const nuevo = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: { tipo: "nuevo", pedido: "nuevo" }, nodos: () => ({ THREE: W, TSL: T }) });
    const clasico = creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" });
    for (const M of [nuevo, clasico]) M.define(MATERIAL_NOMBRES, defNombres());
    expect(nuevo.ruta(MATERIAL_NOMBRES)).toBe("tsl"); expect(clasico.ruta(MATERIAL_NOMBRES)).toBe("clasico");
    const uni = { uMapa: { value: new THREE.Texture() }, uRej: { value: new THREE.Vector2(4, 13) } };
    const m: any = nuevo.crea(MATERIAL_NOMBRES, { uniforms: uni });
    expect(m.isNodeMaterial).toBe(true); expect(m.type).toBe("MeshBasicNodeMaterial");
    expect(m).toMatchObject({ transparent: true, depthWrite: false, fog: false, alphaTest: 0.04 });
    expect(m.colorNode).toBeTruthy(); expect(m.opacityNode).toBeTruthy(); expect(m.vertexNode).toBeTruthy();   // A4-0: de cara a la cámara (compila en tsl-compila.test.ts)
    expect(clasico.crea(MATERIAL_NOMBRES, { uniforms: uni })).toMatchObject({ type: "ShaderMaterial" });
    expect(nuevo.cobertura()[MATERIAL_NOMBRES]).toMatchObject({ clasico: true, tsl: true });
  });
});

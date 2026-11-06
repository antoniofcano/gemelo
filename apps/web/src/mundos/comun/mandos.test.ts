// Los mandos de VR (A3-6c, MU5-n; antes 36_mandos.js). Con el three de verdad (sin GPU) y unas fábricas de modelos de mentira que, como las de three, crean geometría, material y
// textura por cada modelo que cargan. Lo que se comprueba es el ciclo de vida por sesión (L2-06, la fuga por sesión de VR de la auditoría): tras N sesiones con el mando conectado,
// lo vivo (creado menos liberado) vuelve a cero, no crecen las escuchas de los grupos de three, no queda ningún reloj y apagar el componente lo deja todo como estaba.
// HONESTIDAD: aquí no hay renderer.info (sin GPU); lo que se cuenta son los eventos «dispose» de three. La medida en el navegador es memoria_vr_chrome.test.js (banco).
import { describe, expect, it } from "vitest";
import { creaMandos, manifiestoMandos } from "./mandos.ts";
import type { DepsMandos } from "./mandos.ts";
import type { ContextoComponente } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const THREE: A = await import(/* @vite-ignore */ "three" as string);

/** cuenta lo vivo: geometrías, materiales y texturas creadas menos las que lanzan «dispose» */
function contador() {
  const vivos = new Set<A>();
  const apunta = (o: A) => { vivos.add(o); o.addEventListener("dispose", () => vivos.delete(o)); return o; };
  return { vivos, apunta };
}

/** unas fábricas como las de three: al conectarse un mando, cargan (asíncrono) un modelo con geometría, material y textura propios y lo cuelgan del modelo */
function fabricas(c: ReturnType<typeof contador>) {
  class FabC {
    alCargar: A;
    constructor(_l: A, alCargar: A) { this.alCargar = alCargar; }
    setPath() { return this; }
    createControllerModel(px: A) {
      const g = new THREE.Group(); let esc: A = null;
      px.addEventListener("connected", () => {
        queueMicrotask(() => {
          const tex = c.apunta(new THREE.Texture()), mat = c.apunta(new THREE.MeshBasicMaterial({ map: tex })), geo = c.apunta(new THREE.BoxGeometry(1, 1, 1));
          esc = new THREE.Group(); esc.add(new THREE.Mesh(geo, mat)); g.add(esc); this.alCargar(esc);
        });
      });
      px.addEventListener("disconnected", () => { if (esc) g.remove(esc); esc = null; });
      return g;
    }
  }
  class FabM { constructor() { /* sin manos en esta prueba */ } setPath() { return this; } createHandModel() { return new THREE.Group(); } }
  class Loader { load() { /* nada */ } setPath() { return this; } }
  return [{ XRControllerModelFactory: FabC }, { XRHandModelFactory: FabM }, { XRHandPrimitiveModel: class {} }, { GLTFLoader: Loader }];
}

function monta(conFabricas: boolean) {
  const c = contador(), grips = [new THREE.Group(), new THREE.Group()], manos = [new THREE.Group(), new THREE.Group()];
  const relojes = new Set<number>(); let sig = 1;
  const oyentes: Record<string, ((x?: A) => void)[]> = {};
  const n = {
    id: "mandos-vr", parametros: {}, limpia: <F>(f: F) => f, api: () => null,
    emite: (ev: string, x?: unknown) => { (oyentes[ev] || []).slice().forEach(f => f(x)); return (oyentes[ev] || []).length; },
    on: (ev: string, fn: (x?: A) => void) => { (oyentes[ev] = oyentes[ev] || []).push(fn); return () => { oyentes[ev] = (oyentes[ev] || []).filter(f => f !== fn); }; }
  } as ContextoComponente;
  const deps: DepsMandos = {
    THREE, renderer: { xr: { getControllerGrip: (i: number) => grips[i], getHand: (i: number) => manos[i] } },
    Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), ventana: {}, consola: { warn() { /* callado */ } },
    cargaLib: () => conFabricas ? Promise.resolve(fabricas(c)) : Promise.reject(new Error("sin import()")),
    reloj: { pon: () => { const id = sig++; relojes.add(id); return id; }, quita: (id: number) => { relojes.delete(id); } }
  };
  return { c, grips, manos, relojes, n, deps, api: creaMandos(deps, n) };
}
const espera = () => new Promise(r => setTimeout(r, 5));
const escuchas = (o: A) => Object.values(o._listeners || {}).reduce((s: number, l: A) => s + l.length, 0);

describe("mandos-vr: el ciclo de vida por sesión (L2-06)", () => {
  it("diez sesiones con el modelo del mando: tras cada una no queda nada vivo, ni escuchas de más, ni relojes", async () => {
    const m = monta(true), rig = new THREE.Group(), e0 = escuchas(m.grips[0]);
    for (let s = 0; s < 10; s++) {
      m.n.emite("vr:rig-monta", { rig });
      await espera();   // llegan las fábricas
      m.grips[0].dispatchEvent({ type: "connected", data: { targetRayMode: "tracked-pointer", gamepad: {}, handedness: "left" } });
      await espera();   // llega el modelo
      expect(m.api.resumen().filas[0]!.modelo).toBe("modelo");
      expect(m.c.vivos.size).toBe(3);   // geometría, material y textura del modelo de esta sesión
      m.grips[0].dispatchEvent({ type: "disconnected" });   // three desconecta los mandos al acabar la sesión…
      m.n.emite("vr:rig-libera");                            // …y 29_vr pide soltar
      expect(m.c.vivos.size).toBe(0);
      expect(rig.children.length).toBe(0);
      expect(escuchas(m.grips[0])).toBe(e0);
      expect(m.relojes.size).toBe(0);
      expect(m.api.resumen().gpu).toBe(0);
    }
  });
  it("un modelo que llega tras cerrar la sesión no se cuelga ni se apunta (lo de una sesión cerrada se descarta)", async () => {
    const m = monta(true), rig = new THREE.Group();
    m.n.emite("vr:rig-monta", { rig }); await espera();
    m.grips[0].dispatchEvent({ type: "connected", data: { targetRayMode: "tracked-pointer", gamepad: {}, handedness: "left" } });
    m.n.emite("vr:rig-libera");   // antes de que llegue el modelo
    await espera();
    expect(m.api.resumen().montado).toBe(false); expect(m.api.resumen().gpu).toBe(0);
    expect(m.grips[0].children.length).toBe(0);
  });
  it("sin fábricas (import() que falla), la caja de respaldo se crea por sesión y se suelta al salir; apagar quita las escuchas y el gancho", async () => {
    const m = monta(false), rig = new THREE.Group();
    const vivos = new Set<A>(), orig = THREE.EventDispatcher.prototype.dispatchEvent;
    for (let s = 0; s < 3; s++) {
      m.n.emite("vr:rig-monta", { rig });
      m.grips[1].dispatchEvent({ type: "connected", data: { targetRayMode: "tracked-pointer", gamepad: {}, handedness: "right" } });
      await espera();
      const cubo = m.grips[1]!.children.find((o: A) => o.isMesh);
      expect(cubo).toBeTruthy(); vivos.add(cubo.geometry); vivos.add(cubo.material);
      expect(m.deps.Materiales.duenos()["mandos-vr"]).toBe(1);   // la caja sale de la fábrica con su dueño (segundo commit de la receta)
      cubo.geometry.addEventListener("dispose", () => vivos.delete(cubo.geometry)); cubo.material.addEventListener("dispose", () => vivos.delete(cubo.material));
      m.n.emite("vr:rig-libera");
      expect(vivos.size).toBe(0); expect(m.grips[1].children.length).toBe(0);
    }
    expect(THREE.EventDispatcher.prototype.dispatchEvent).toBe(orig);
    expect(typeof m.deps.ventana.__mandos).toBe("function");
    m.api.suelta();
    expect(m.deps.ventana.__mandos).toBeUndefined();
    expect(escuchas(m.grips[0]) + escuchas(m.grips[1])).toBe(0);
    expect(() => m.api.suelta()).not.toThrow();
  });
  it("el manifiesto: el de siempre (bandera ?mandos, sin fases ni dibujo fuera de VR) y de todos los mundos", () => {
    const m = monta(false), d = manifiestoMandos(m.deps);
    expect(d.id).toBe("mandos-vr"); expect(d.bandera).toEqual({ defecto: true, url: "mandos" }); expect(d.fases).toEqual({});
    expect(d.mundos).toEqual(["exterior", "molino", "bodega", "vacio"]);
    expect(d.eventos).toEqual({ escucha: ["vr:rig-monta", "vr:rig-libera"], emite: [] });
  });
});

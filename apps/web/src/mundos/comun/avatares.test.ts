// Los avatares VRM (mundos/comun/avatares.ts; MU5-n, A3-6a: antes 26b_avatares.js). Con el three de verdad (sin GPU), la fábrica de materiales del núcleo, una presencia
// de mentira con una persona que lleva avatar, un catálogo v1 y una librería VRM de mentira (three-vrm de verdad, con el VRM sintético, lo prueba
// pruebas/guardianes/avatares_motor.test.js). Se comprueba el ciclo de vida: de todo mundo; se pide el catálogo y el fichero solo si alguien lleva avatar; la copia
// entra en la escena con el fundido; y libera() la suelta (deepDispose), saca el grupo, quita el gancho y vacía los ficheros descargados (L2-09). HONESTIDAD: nada se dibuja.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { ID_AVATARES, MATERIAL_VRM_FUNDIDO, creaAvatares, defVrmFundido, manifiestoAvatares, parcheVrmFundido } from "./avatares.ts";
import type { DepsAvatares } from "./avatares.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);
const espera = () => new Promise(r => setTimeout(r, 0));

function monta() {
  const scene = new THREE.Scene(), pedidos: string[] = [], sueltos: any[] = [], ganchos: unknown[] = [];
  /** la librería de mentira: un GLTFLoader que da un VRM con una malla y lo justo de humanoid; deepDispose suelta la geometría y los materiales */
  const V = {
    VRMLoaderPlugin: class {},
    VRMUtils: { removeUnnecessaryVertices() {}, combineSkeletons() {}, rotateVRM0() {},
      deepDispose: (o: any) => { o.traverse((x: any) => { if (x.isMesh) { x.geometry.dispose(); [].concat(x.material).forEach((m: any) => m.dispose()); } }); sueltos.push(o); } }
  };
  class GLTFLoader { register() {} parseAsync() {
    const s = new THREE.Group(); s.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 0.2), new THREE.MeshBasicMaterial()));
    return Promise.resolve({ scene: s, userData: { vrm: { scene: s, meta: {}, humanoid: { getNormalizedBoneNode: () => null, update() {} } } } });
  } }
  const persona = { k: 0, id: "h_ana", vrm: "ana", receta: null, sombrero: 0, piel: 0xb97d57, camisa: 0x6b7f3a, pantalon: 0x37455c, pelo: 0x1f1a17, fa: 1, mov: "pie", out: { cab: { p: [2, 0, -2] } } };
  const Presencia = { activo: () => true, vrmPersonas: () => [persona], miAvatar: () => null, cambiaron: () => false, recolorea() {}, enganchaVRM: (g: unknown) => { ganchos.push(g); } };
  const deps: DepsAvatares = {
    THREE, location: { search: "" }, window: {}, consola: { warn() {} },
    fetch: (u: string) => { pedidos.push(u); return Promise.resolve(/catalogo/.test(u) ? { ok: true, json: () => Promise.resolve({ v: 1, avatares: [{ id: "ana", fichero: "ana.vrm" }] }) } : { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)) }); },
    cargaVrm: () => Promise.resolve([V, { GLTFLoader }]),
    Aparato: { clase: () => "escritorio" }, Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), Componentes: { enciende() {} }, VrPresupuesto: { ponGente() {} },
    suelo: () => 0, renderer: {}, scene, camera: new THREE.PerspectiveCamera(), Estado: { exag: 1 },
    paseando: false, persona: null, primera: false, pp: { x: 0, y: 0, ang: 0 }, enQuad: false, enDron: false, VRX: { on: false, nivel: 0 }
  };
  const n = { id: ID_AVATARES, on: () => () => {}, emite: () => 0, api: () => Presencia, limpia: <F>(f: F) => f, parametros: {} };
  return { api: creaAvatares(deps, n, Presencia) as any, deps, scene, pedidos, sueltos, ganchos, persona };
}

describe("avatares-vrm: de todo mundo y con libera() de verdad (A3-6a)", () => {
  it("el manifiesto vale, es de todo mundo y sin presencia activa no crea nada", () => {
    const def = manifiestoAvatares({} as DepsAvatares);
    expect(ComponentesPuro.valida(def)).toEqual([]); expect(ComponentesPuro.deTodos(def)).toBe(true);
    expect(def.consume).not.toContain("Aspecto");   // se importa de red/sala.ts
    const sin = def.monta({ api: () => null, on: () => () => {} });
    expect((sin as any).estado()).toBeNull();
  });

  it("pide el catálogo y el fichero solo porque alguien lleva avatar; libera() suelta la copia, el grupo y el gancho, y vacía los ficheros guardados (L2-09)", async () => {
    const r = monta();
    expect(r.scene.getObjectByName("avatares-vrm")).toBeTruthy();
    r.api.actualiza(0.1); await espera();                       // pide el catálogo (alguien lleva vrm)
    for (let i = 0; i < 6; i++) { r.api.actualiza(0.5); await espera(); await espera(); }   // el reparto (2 Hz) pide su VRM; se analiza y entra
    expect(r.pedidos).toEqual(["/avatares/catalogo.json", "/avatares/ana.vrm"]);
    const e = r.api.estado();
    expect(e.instancias).toBe(1); expect(e.bufs).toBe(1);        // el fichero descargado se guarda para las copias siguientes
    const g = r.scene.getObjectByName("avatares-vrm"), copia = g.getObjectByName("vrm:ana");
    expect(copia).toBeTruthy();
    const mats: any[] = []; copia.traverse((x: any) => { if (x.isMesh) mats.push(x.material); });
    expect(mats.every(m => m.userData.vrmFundido)).toBe(true);   // el tramado del fundido, encadenado (vrm-fundido)
    expect(r.deps.Materiales.duenos()[ID_AVATARES]).toBe(mats.length);   // segundo commit: por la fábrica, con dueño
    expect(typeof mats[0].onBeforeCompile).toBe("function");          // el parche encadenado (su clave la prueba pruebas/guardianes/materiales_f1.test.js)
    r.api.libera();
    expect(r.sueltos).toHaveLength(1);                           // deepDispose de la única copia
    expect(r.scene.getObjectByName("avatares-vrm")).toBeUndefined();
    expect(r.ganchos[r.ganchos.length - 1]).toBeNull();          // la presencia ya no llama a nadie
    expect(r.api.estado().bufs).toBe(0);                         // L2-09: los ArrayBuffer ya no se quedan
    expect(r.api.estado().instancias).toBe(0);
    expect(r.deps.Materiales.duenos()[ID_AVATARES]).toBeUndefined();   // los soltó deepDispose y salieron solos de la fábrica
  });

  it("la variante TSL del fundido (tercer commit): apagada; con three/webgpu y three/tsl de verdad, encadena devuelve un NodeMaterial con el tramado y el mismo { value }", async () => {
    const rutaW = "three/webgpu", rutaT = "three/tsl";   // por variable: three no trae tipos (ni entra en el grafo de dependency-cruiser)
    const W = await import(/* @vite-ignore */ rutaW), T = await import(/* @vite-ignore */ rutaT);
    const nuevo = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: { tipo: "nuevo", pedido: "nuevo" }, nodos: () => ({ THREE: W, TSL: T }) });
    const clasico = creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" });
    for (const M of [nuevo, clasico]) M.define(MATERIAL_VRM_FUNDIDO, defVrmFundido());
    expect(nuevo.ruta(MATERIAL_VRM_FUNDIDO)).toBe("tsl"); expect(clasico.ruta(MATERIAL_VRM_FUNDIDO)).toBe("clasico");
    const uni = { value: 0.3 }, piel = new THREE.MeshStandardMaterial({ color: 0xb97d57, side: THREE.DoubleSide }); piel.name = "piel"; piel.userData.vrmFundidoUni = uni;
    const m: any = nuevo.encadena(piel, MATERIAL_VRM_FUNDIDO, parcheVrmFundido(uni), MATERIAL_VRM_FUNDIDO);
    expect(m.isNodeMaterial).toBe(true); expect(m.type).toBe("MeshStandardNodeMaterial"); expect(m.maskNode).toBeTruthy();
    expect(m.color.getHex()).toBe(0xb97d57); expect(m.side).toBe(THREE.DoubleSide); expect(m.name).toBe("piel"); expect(m.userData.vrmFundidoUni).toBe(uni);
    const c: any = clasico.encadena(new THREE.MeshStandardMaterial(), MATERIAL_VRM_FUNDIDO, parcheVrmFundido(uni), MATERIAL_VRM_FUNDIDO);
    expect(c.isNodeMaterial).toBeFalsy(); expect(typeof c.onBeforeCompile).toBe("function");   // con el clásico, el parche de siempre
    expect(nuevo.cobertura()[MATERIAL_VRM_FUNDIDO]).toMatchObject({ tsl: true });
  });
});

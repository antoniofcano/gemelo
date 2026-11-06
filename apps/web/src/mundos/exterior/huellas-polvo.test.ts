// Las huellas y el polvo (A3-5, MU5-n; antes 22b_huellas_polvo.js). Con el three de verdad (sin GPU) y la fábrica de materiales de verdad. Se comprueba: el montaje (dos mallas),
// el polvo por el Bus, las huellas al andar, que sin nada vivo no se dibuja y el ciclo de vida: libera() quita las dos mallas y suelta geometrías y materiales, una sola vez, y
// montar y liberar varias veces no deja ninguna geometría ni material vivos. HONESTIDAD: nada se dibuja aquí (regla 7); no hay renderer.info en Node.
import { describe, expect, it } from "vitest";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import type { ContextoComponente } from "../../nucleo/componentes.ts";
import { ID_HUELLAS_POLVO, creaHuellasPolvo, manifiestoHuellasPolvo } from "./huellas-polvo.ts";
import type { DepsHuellasPolvo } from "./huellas-polvo.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

function monta() {
  const scene = new THREE.Scene(), oyentes: Record<string, ((d?: unknown) => void)[]> = {};
  const E = { paseando: true, enQuad: false, enDron: false, vq: 0, tVida: 0 }, teclas = { run: false };
  const deps: DepsHuellasPolvo = {
    THREE, scene, Estaticos: { congela() {} }, Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), suelo: () => 0, Estado: { exag: 1 },
    pp: { x: 0, y: 0, ang: 0, paso: 0 }, paseando: () => E.paseando, teclas: () => teclas, cur: { ms: 0, viento: 1, dir: 0 }, nivelEn: () => ({ d: 1 }),
    tVida: () => E.tVida, enQuad: () => E.enQuad, vq: () => E.vq, enDron: () => E.enDron, dr: { x: 0, y: 0, h: 0 }, altSuelo: () => 0, sueloSeco: () => true
  };
  const quitadas: string[] = [];
  const n = { id: ID_HUELLAS_POLVO, parametros: {}, limpia: <F>(f: F) => f, emite: () => 0, api: () => null,
    on: (ev: string, fn: (d?: unknown) => void) => { (oyentes[ev] = oyentes[ev] || []).push(fn); return () => { quitadas.push(ev); }; } } as ContextoComponente;
  const emite = (ev: string, d: unknown) => (oyentes[ev] || []).forEach((f) => f(d));
  return { api: creaHuellasPolvo(deps, n), deps, scene, E, teclas, emite, oyentes };
}
const llamadas = (raiz: { children: unknown[]; visible?: boolean }) => {
  let k = 0;
  (function anda(o: { visible?: boolean; isMesh?: boolean; isPoints?: boolean; children: unknown[] }) { if (o.visible === false) return; if (o.isMesh || o.isPoints) k++; (o.children as typeof o[]).forEach(anda); })(raiz as never);
  return k;
};

describe("huellas y polvo: el componente", () => {
  it("recién montado: dos mallas en la escena y ninguna pasada de dibujo; al emitir, se dibujan; al cumplir su vida, se apagan", () => {
    const { api, scene, E, emite } = monta();
    expect(scene.children).toHaveLength(2); expect(llamadas(scene)).toBe(0);
    api.emiteHuella(0, 0, 0, 0.13, 0.3, 1, 75); emite("polvo:emite", { x: 0, y: 0, h: 0, vida: 0.9 });
    expect(llamadas(scene)).toBe(2);
    E.paseando = false; E.tVida = 1; api.actualiza(0.016); expect(llamadas(scene)).toBe(1);   // el polvo (0,9 s) ya se apagó; la huella (75 s), no
    E.tVida = 76; api.actualiza(0.016); expect(llamadas(scene)).toBe(0);
  });
  it("el anillo de huellas se queda en 900 y andar deja pisadas (una por zancada)", () => {
    const { api } = monta();
    for (let i = 0; i < 1000; i++) api.emiteHuella(i, 0, 0, 0.13, 0.3, 1, 75);
    expect(api.huellas()).toBe(900);
    const m = monta(); m.deps.pp.paso = 0; m.api.actualiza(0.016); m.deps.pp.paso = Math.PI * 3.2; m.api.actualiza(0.016); expect(m.api.huellas()).toBeGreaterThan(0);
  });
  it("los dos materiales salen de la fábrica con su dueño: ShaderMaterial con los uniformes del componente y el GLSL de siempre", () => {
    const { scene, deps } = monta();
    const [huellas, polvo] = scene.children; expect(huellas.isInstancedMesh).toBe(true); expect(polvo.isPoints).toBe(true);
    expect(huellas.material.isShaderMaterial).toBe(true); expect(polvo.material.isShaderMaterial).toBe(true);
    expect(huellas.material.transparent).toBe(true); expect(huellas.material.depthWrite).toBe(false); expect(huellas.material.polygonOffset).toBe(true); expect(huellas.material.polygonOffsetFactor).toBe(-4);
    expect(Object.keys(huellas.material.uniforms)).toEqual(["uNow", "uColor"]); expect(Object.keys(polvo.material.uniforms)).toEqual(["uNow", "uColor", "uLuz"]);
    expect(huellas.material.vertexShader).toMatch(/instanceMatrix/); expect(polvo.material.vertexShader).toMatch(/gl_PointSize/);
    expect(deps.Materiales.duenos()["huellas-polvo"]).toBe(2);
    expect(Object.keys(deps.Materiales.inventario()).sort()).toEqual(["huella", "polvo"]);
  });
  it("el manifiesto: ?huellas, del exterior, fase mundo; su libera() acepta null", () => {
    const m = manifiestoHuellasPolvo({} as DepsHuellasPolvo);
    expect(m.id).toBe("huellas-polvo"); expect(m.bandera).toEqual({ defecto: true, url: "huellas" }); expect(m.mundos).toEqual(["exterior"]); expect(m.fases).toEqual({ mundo: 0 });
    expect(() => m.libera(null)).not.toThrow();
  });
});

describe("huellas y polvo: el ciclo de vida", () => {
  it("libera() quita las dos mallas y suelta la malla, las geometrías y los materiales, una sola vez", () => {
    const { api, scene, deps } = monta();
    const [huellas, polvo] = scene.children, vistos: string[] = [];
    huellas.addEventListener("dispose", () => vistos.push("malla")); huellas.geometry.addEventListener("dispose", () => vistos.push("geoHuella")); huellas.material.addEventListener("dispose", () => vistos.push("matHuella"));
    polvo.geometry.addEventListener("dispose", () => vistos.push("geoPolvo")); polvo.material.addEventListener("dispose", () => vistos.push("matPolvo"));
    api.libera(); api.libera();
    expect(scene.children).toHaveLength(0); expect(vistos.sort()).toEqual(["geoHuella", "geoPolvo", "malla", "matHuella", "matPolvo"]);
    expect(deps.Materiales.duenos()["huellas-polvo"]).toBeUndefined();   // la fábrica ya no guarda nada de este dueño
  });
  it("memoria: montar y liberar varias veces no deja ninguna geometría ni material vivos", () => {
    let vivas = 0;
    for (let v = 0; v < 4; v++) {
      const { api, scene } = monta();
      for (const o of scene.children) { vivas += 2; o.geometry.addEventListener("dispose", () => { vivas--; }); o.material.addEventListener("dispose", () => { vivas--; }); }
      api.libera();
    }
    expect(vivas).toBe(0);
  });
  it("no deja relojes: ni setInterval ni setTimeout propios", () => {
    const fuente = String(creaHuellasPolvo);
    expect(/setInterval|setTimeout/.test(fuente)).toBe(false);
  });
});

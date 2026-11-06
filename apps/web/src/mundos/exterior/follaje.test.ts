// El follaje de los olivos y sus sombras (A3-2b, MU5-n; antes 07_follaje.js). Con el three de verdad (sin GPU; el lienzo es un doble) y la fábrica de materiales de verdad.
// Se comprueba lo que arreglan L2-01, L5-02 y L1-08 (construyeSombras: ni malla nueva ni búfer nuevo a cada llamada, y NO saca del grupo la malla de sombras del paisaje) y el
// ciclo de vida: libera() quita la malla de sombras y suelta geometría, materiales y texturas, una sola vez. HONESTIDAD: nada se dibuja aquí.
import { describe, expect, it } from "vitest";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { ID_FOLLAJE, creaFollaje } from "./follaje.ts";
import type { DepsFollaje } from "./follaje.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

/** un contexto 2D de mentira: acepta cualquier llamada de dibujo */
const contexto2d = new Proxy({}, { get: (_o, k) => (k === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
const lienzo = (lado: number) => ({ width: lado, height: lado, getContext: () => contexto2d });

function copaN(i: number) { return { i, x: i * 3, y: 2, h: 4, oliv: 1, perfil: [2, 2, 2, 2, 2, 2, 2, 2] }; }
function monta(nCopas = 5) {
  const gSombras = new THREE.Group(), copas = Array.from({ length: nCopas }, (_v, i) => copaN(i));
  let instSombra: unknown = "sin tocar", sol = 0, olvidadas: string[] = [], fuente: ((v: unknown) => void) | null = null, frutos = 0;
  const deps: DepsFollaje = {
    THREE, lienzo, texColor: (t) => t, Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), Estaticos: { congela() {} }, gSombras,
    Estado: { exag: 1, calidad: 0 }, ESC_R8: 1, suelo: () => 100, copaAlta: () => 4, aviva: () => {}, colorEn: (_x, _y, _h, c3) => { c3[0] = 0.4; c3[1] = 0.5; c3[2] = 0.3; },
    hash: (n) => (Math.sin(n * 12.9898) * 43758.5453) % 1 / 2 + 0.5, copas, radioEn: () => 2, construyeFrutosLista: () => { frutos++; },
    sombrasSol: () => { sol++; }, ponInstSombra: (m) => { instSombra = m; },
    VrPresupuesto: { fuente: (_n, f) => { fuente = f; }, olvida: (n) => { olvidadas.push(n); } },
  };
  return { api: creaFollaje(deps), deps, gSombras, copas, estado: { get inst() { return instSombra; }, get sol() { return sol; }, get olvidadas() { return olvidadas; }, get fuente() { return fuente; }, get frutos() { return frutos; } } };
}
const escuchaDispose = (o: { addEventListener(t: string, f: () => void): void }) => { const c = { n: 0 }; o.addEventListener("dispose", () => { c.n++; }); return c; };

describe("follaje y sombras de los olivos (componente del exterior)", () => {
  it("construyeSombras crea UNA malla con una instancia por olivo y avisa a 18 de cuál es", () => {
    const { api, gSombras, estado } = monta(5);
    api.construyeSombras();
    expect(gSombras.children).toHaveLength(1); const m = api.sombras();
    expect(m.count).toBe(5); expect(estado.inst).toBe(m); expect(estado.sol).toBe(1);
    expect(m.geometry).toBe(api.geoSombra); expect(m.material).toBe(api.matSombra);
  });

  it("L2-01/L1-08: diez llamadas seguidas dejan UNA malla, la misma, sin dispose (ni búfer nuevo); y reescriben las matrices (la exageración)", () => {
    const { api, gSombras, deps } = monta(5);
    api.construyeSombras(); const m = api.sombras(), d = escuchaDispose(m);
    for (let i = 0; i < 10; i++) api.construyeSombras();
    expect(gSombras.children).toHaveLength(1); expect(api.sombras()).toBe(m); expect(d.n).toBe(0);
    deps.Estado.exag = 2; api.construyeSombras(); expect(m.instanceMatrix.array[13]).toBeCloseTo((100 + 0.06) * 2, 4);
  });

  it("L5-02: no saca del grupo la malla de sombras del paisaje (instSombraPA), ni antes ni después de varias llamadas", () => {
    const { api, gSombras } = monta(5);
    const paisaje = new THREE.InstancedMesh(api.geoSombra, api.matSombra, 3); gSombras.add(paisaje);   // la crea 18_paisaje una sola vez
    for (let i = 0; i < 10; i++) api.construyeSombras();
    expect(gSombras.children).toContain(paisaje); expect(gSombras.children).toHaveLength(2);
  });

  it("si cambia el número de olivos, la malla anterior se quita del grupo y se libera (remove + dispose) y la nueva ocupa su sitio", () => {
    const { api, gSombras, copas } = monta(5);
    api.construyeSombras(); const vieja = api.sombras(), d = escuchaDispose(vieja);
    copas.push(copaN(5), copaN(6)); api.construyeSombras();
    expect(d.n).toBe(1); expect(gSombras.children).toHaveLength(1); expect(api.sombras()).not.toBe(vieja); expect(api.sombras().count).toBe(7);
  });

  it("follajeG construye hojas, relleno y corteza en tres Points y pide las aceitunas a 23", () => {
    const { api, estado } = monta(2), grupo = new THREE.Group(), olivos = [copaN(0), copaN(1)];
    const P = { n: 2, x: [0, 1], y: [0, 1], z: [101, 102], h: [3, 1], b: [0, 1] };
    const g = api.follajeG(olivos, P, grupo); let r = g.next(); while (!r.done) r = g.next();
    expect(grupo.children).toHaveLength(3); expect(grupo.children.every((o: { isPoints: boolean }) => o.isPoints)).toBe(true);
    expect(grupo.children[0].material).toBe(api.matHojaG); expect(grupo.children[1].material).toBe(api.matHojaP); expect(grupo.children[2].material).toBe(api.matCorteza);
    expect(estado.frutos).toBe(1);
  });

  it("montar y liberar (varias veces) quita la malla y suelta geometría, materiales y texturas una sola vez; olvida la fuente de VR", () => {
    for (let v = 0; v < 3; v++) {
      const { api, gSombras, estado } = monta(5);
      api.construyeSombras(); const m = api.sombras();
      const c = { malla: escuchaDispose(m), geo: escuchaDispose(api.geoSombra), sombra: escuchaDispose(api.matSombra), g: escuchaDispose(api.matHojaG), p: escuchaDispose(api.matHojaP), co: escuchaDispose(api.matCorteza),
        texS: escuchaDispose(api.matSombra.map), texH: escuchaDispose(api.texHojas) };
      api.libera(); api.libera();
      expect(gSombras.children).toHaveLength(0); expect(estado.olvidadas).toEqual(["sombras"]);
      expect(Object.values(c).map((x) => x.n)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
      expect(estado.inst).toBeNull();
    }
  });

  it("la fuente de VR esconde las manchas desde el escalón 2 y el componente es del exterior, solo ciclo de vida", () => {
    const { api, estado } = monta(3);
    estado.fuente!(false); expect(api.matSombra.visible).toBe(false); estado.fuente!(true); expect(api.matSombra.visible).toBe(true);
    expect(api.componente.id).toBe(ID_FOLLAJE); expect(api.componente.mundos).toEqual(["exterior"]); expect(api.componente.monta({} as never)).toBe(api);
    api.componente.libera(api);
  });
});

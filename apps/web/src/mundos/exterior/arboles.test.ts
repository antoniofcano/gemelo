// Los olivos del motor con tres niveles de detalle (A3-2b, MU5-n; antes 07b_arboles.js). Con el three de verdad (sin GPU) y dobles de todo lo que el módulo recibe del legado
// (el mundo, la Cola, el catálogo, los generados, el tileset). Se comprueba L1-04 (el nivel 0 cuenta en TOPE_TRI: con 900 olivos candidatos, el tope se respeta aunque la escala sea
// 2,5; y la escala baja hasta 1,0, no hasta 1,6, pasado el techo de diseño) y el ciclo de vida (libera() cancela los trabajos de la Cola, quita las celdas y las mallas y suelta sus
// geometrías y búferes, una sola vez). HONESTIDAD: nada se dibuja; los triángulos son los de la estimación del módulo (TRI0 = 800 por olivo de nivel 0), no los del renderizador.
import { describe, expect, it } from "vitest";
import { ID_ARBOLES, creaArboles } from "./arboles.ts";
import type { DepsArboles } from "./arboles.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

const TRI0 = 800, TOPE_TRI = 550000;
/** 900 olivos en 9 celdas de 64 m (cuadrícula 3 × 3), 100 por celda */
function olivosEn9Celdas() {
  const copas: { i: number; id: number; tipo: number; x: number; y: number; h: number; perfil: number[]; oliv: number }[] = [];
  for (let i = 0; i < 900; i++) {
    const cel = Math.floor(i / 100), ci = cel % 3, cj = Math.floor(cel / 3), k = i % 100;
    copas.push({ i, id: -1, tipo: -1, x: ci * 64 + 3 + (k % 10) * 5.5, y: cj * 64 + 3 + Math.floor(k / 10) * 5.5, h: 4, perfil: [2, 2, 2, 2, 2, 2, 2, 2], oliv: 1 });
  }
  return copas;
}

function monta(opc: { busqueda?: string; triFot?: { v: number }; copas?: ReturnType<typeof olivosEn9Celdas>; deps?: Partial<DepsArboles> } = {}) {
  const gArboles = new THREE.Group(); gArboles.visible = true;
  const copas = opc.copas ?? olivosEn9Celdas(), cola = { cancelados: [] as string[], puestos: [] as string[] }, geoCelda: { dispose(): void }[] = [], disp = { n: 0 };
  const ts = { estado: 2, pts: null, key: "t0" };
  const deps: DepsArboles = {
    THREE, FACTOR_R8: 0.5, busqueda: opc.busqueda ?? "",
    Aparato: { politica: () => ({ olivosLigero: false, cargaMs: 6, cargaMsVr: 4 }), vr: () => false },
    Config: { al: (f: (c: unknown) => void) => f(null), param: (_r: string, c: number) => c },
    Mundo: { cx: 0, cy: 0, tesela: () => ts, ortoGrueso: (_x: number, _y: number, c3: number[]) => { c3[0] = 0.3; c3[1] = 0.35; c3[2] = 0.2; }, aseguraOrto: function* () { /* sin ortofoto */ } },
    Cola: { pendientes: () => 0, deuda: () => 0 },
    ColaExt: {   // el doble corre el generador entero al ponerlo y entrega su resultado: las celdas «se construyen» al momento
      pon: (k: string, _p: number, gen: Generator, fin: (v: unknown) => void) => { cola.puestos.push(k); let r = gen.next(); while (!r.done) r = gen.next(); fin(r.value); },
      cancela: (k: string) => { cola.cancelados.push(k); }, hay: () => false },
    CargaPuro: { base: () => 5 }, XrPerillas: {}, VrControlPuro: {}, InfoDibujo: { triangulos: () => (opc.triFot ? opc.triFot.v : 0) }, Estaticos: { congela() {} },
    TopeTilesPuro: { DEF: { MUESTRA: 0.25 } }, TopeOlivos: { activo: () => false, apaga() {}, factor: () => 1, presupuesto: () => Infinity, paso: () => false, resumen: () => ({}) },
    OlivosTiles: { dibuja: () => false, triangulos: () => 0, cerca() {}, resumen: () => ({ estado: "sin", dibujadas: 0 }) },
    Catalogo: { SIN: -1, variantes: (_t: number, n: number) => (n === 1 ? 4 : 2), alCambiar() {}, tipos: () => [], info: () => ({}),
      geometria: () => [{ geo: new THREE.BoxGeometry(1, 1, 1), mat: new THREE.MeshBasicMaterial(), pieza: "copa" }, { geo: new THREE.BoxGeometry(1, 1, 1), mat: new THREE.MeshBasicMaterial(), pieza: "tronco" }] },
    Escalera: { dibuja: () => false, FR_ESPERA: 1, TRI_MOVIL: 270000 }, Lejanos: { hayCapa: () => false, paso: () => false, reparte() {}, resumen: () => null, pendientes: () => 0, inicia() {}, triangulos: () => 0, capaCompleta: () => false },
    Generados: { actualiza: () => ({ radio: 0, tri: 0, tiene: () => false, fase: () => 0 }), escalera: () => false, modoGen: () => "", estado: () => "", pendientes: () => 0, gastado: () => 0, paso: () => false },
    renderer: { shadowMap: { enabled: false } }, camera: { position: new THREE.Vector3(96, 40, -96) }, Estado: { exag: 1, modo: "gem", calidad: 1 },
    suelo: () => 0, copaAlta: () => 3, aviva() {}, hash: (n: number) => n - Math.floor(n), copas, ALTO_MAX: 12,
    gArboles,
    arbolesG: function* () { const g = new THREE.BufferGeometry(); geoCelda.push(g); g.addEventListener("dispose", () => { disp.n++; }); return [new THREE.Mesh(g, new THREE.MeshBasicMaterial())]; },
    follajeG: function* () { /* sin follaje */ }, construyeSombras() {}, ventana: {}, ahora: (() => { let t = 0; return () => (t += 600); })(),
    paseando: false, kcor: 1, tinte: false, ndviIdx: 0, objetivo: { x: 96, y: 0, z: -96 }, orb: { dist: 500 }, pp: { x: 0, y: 0 }, VRX: null, Ajustes: undefined,
    ...(opc.deps || {}),
  };
  const api = creaArboles(deps);
  api.inicia();
  return { api, deps, gArboles, cola, disp, geoCelda };
}
/** unos cuantos fotogramas forzados: las celdas se construyen, se hacen visibles y se cuentan */
function pasos(api: ReturnType<typeof creaArboles>, n: number, dt = 0.016) { for (let i = 0; i < n; i++) api.actualiza(dt, true); }

describe("olivos del motor, tres niveles (componente del exterior)", () => {
  it("L1-04: con 900 olivos de nivel 0 candidatos y la escala en 2,5, el nivel 0 respeta TOPE_TRI (antes: 900 olivos, 720 k triángulos, por encima de los 550 k)", () => {
    const { api } = monta({ busqueda: "?arbsc=2.5" });
    pasos(api, 6);
    const r = api.resumen();
    expect(r.olivos).toBe(900); expect(r.esc).toBe(2.5);
    expect(r.nivel0).toBeGreaterThan(0); expect(r.nivel0 * TRI0).toBeLessThanOrEqual(TOPE_TRI);   // el tope se respeta
    expect(r.nivel0).toBe(600);   // 6 celdas de 100: la séptima (700 > 687 olivos que caben) no entra
    expect(r.triEst).toBeLessThanOrEqual(TOPE_TRI + 10);   // y la estimación total (nivel 0 + niveles 1 y 2) también
  });

  it("sin el tope de triángulos de por medio (escala 1,0), caben los olivos de siempre: 450 de nivel 0 (MAX0)", () => {
    const { api } = monta({ busqueda: "?arbsc=1" });
    pasos(api, 6);
    expect(api.resumen().nivel0).toBe(400);   // 4 celdas de 100 (la quinta pasaría de 450)
  });

  it("L1-04: pasado el techo de diseño (1,7 M de triángulos de verdad), la escala baja hasta 1,0 y no vuelve a subir mientras se pase", () => {
    const triFot = { v: 1_000_000 }, { api } = monta({ triFot });
    pasos(api, 60, 0.005);   // fotogramas holgados: la escala sube hasta 1,6 (y por encima solo con < 1,4 M)
    expect(api.resumen().esc).toBeGreaterThanOrEqual(1.6);
    triFot.v = 1_800_000; pasos(api, 40, 0.005);
    expect(api.resumen().esc).toBe(1);   // antes se quedaba en 1,6
    pasos(api, 40, 0.005); expect(api.resumen().esc).toBe(1);   // y sigue pasado el techo: no sube
    triFot.v = 1_000_000; pasos(api, 10, 0.005); expect(api.resumen().esc).toBeGreaterThan(1);   // bajado el techo, vuelve a poder subir
  });

  it("libera() cancela los trabajos de la Cola, quita las celdas y las mallas y suelta geometrías y búferes de instancias, una sola vez", () => {
    const { api, gArboles, cola, disp, deps } = monta({ busqueda: "?arbsc=1" });
    pasos(api, 6);
    const celdas = gArboles.children.filter((o: { isGroup?: boolean }) => o.isGroup).length, mallas = gArboles.children.filter((o: { isInstancedMesh?: boolean }) => o.isInstancedMesh);
    expect(celdas).toBeGreaterThan(0); expect(mallas.length).toBeGreaterThan(0);
    const dispInst = mallas.map((m: { addEventListener(t: string, f: () => void): void }) => { const c = { n: 0 }; m.addEventListener("dispose", () => { c.n++; }); return c; });
    const antes = cola.cancelados.length;
    api.libera(); api.libera();
    expect(gArboles.children).toHaveLength(0);
    expect(disp.n).toBeGreaterThanOrEqual(celdas);   // la geometría de cada celda construida
    expect(dispInst.every((c: { n: number }) => c.n === 1)).toBe(true);
    expect(cola.cancelados.length).toBeGreaterThan(antes);   // C… y B… cancelados
    const n = disp.n; api.actualiza(0.016, true); expect(gArboles.children).toHaveLength(0); expect(disp.n).toBe(n);   // ya no hace nada
    void deps;
  });

  it("el componente: del exterior, con presupuesto de olivos del motor; su monta da la liberación", () => {
    const { api } = monta();
    expect(api.componente.id).toBe(ID_ARBOLES); expect(api.componente.mundos).toEqual(["exterior"]);
    expect(api.componente.presupuesto.triangulos).toBe(TOPE_TRI);
    const m = api.componente.monta({} as never) as { libera(): void }; m.libera();
  });
});

describe("L3-01: el color de los olivos de nivel 1 y 2 aplica el desfase de la copa, como el nivel 0", () => {
  const desfase = (k: number) => (h: number, out: number[]) => { out[0] = k * (1.2 * Math.min(h, 1) + 0.42 * Math.max(h - 1, 0)); out[1] = k * 0.2 * Math.min(h / 2, 1); };   // el de TinteOrto.desfase
  function conMosaico(extra: Partial<DepsArboles>) {
    const visto: Array<[number, number]> = [], copas = olivosEn9Celdas();
    const Mundo = { cx: 0, cy: 0, tesela: () => ({ estado: 2, pts: null, key: "t0" }), ortoGrueso: (x: number, y: number, c3: number[]) => { visto.push([x, y]); c3[0] = 0.3; c3[1] = 0.35; c3[2] = 0.2; }, aseguraOrto: function* () { /* sin ortofoto */ } };
    return { ...monta({ copas, deps: { Mundo, ...extra } }), visto, copas };
  }
  it("Mundo.ortoGrueso se pide en (x + dx(h), y + dy(h)) con el desfase de TinteOrto; sin la dependencia, en (x, y)", () => {
    const a = conMosaico({ desfase: desfase(1) }), o = a.copas.filter((c: { oliv: number }) => c.oliv)[0] as { x: number; y: number; h: number }, esp: number[] = [0, 0]; desfase(1)(o.h, esp);
    expect(o.h).toBeGreaterThan(0.5);
    expect(a.visto[0]).toEqual([o.x + (esp[0] as number), o.y + (esp[1] as number)]);
    const b = conMosaico({}); expect(b.visto[0]).toEqual([o.x, o.y]);
  });
  it("si cambia kcor (el deslizador de corrección), el color se rehace con el desfase nuevo", () => {
    let kc = 1; const a = conMosaico({ desfase: (h, out) => desfase(kc)(h, out) }), n0 = a.visto.length; kc = 2; (a.deps as { kcor: number }).kcor = 2;   // kcor y el desfase de TinteOrto cambian juntos
    a.api.actualiza(0.016, true);
    expect(a.visto.length).toBeGreaterThan(n0);
    const o = a.copas.filter((c: { oliv: number }) => c.oliv)[0] as { x: number; y: number; h: number }, esp: number[] = [0, 0]; desfase(2)(o.h, esp);
    expect(a.visto[n0]).toEqual([o.x + (esp[0] as number), o.y + (esp[1] as number)]);
  });
});

// Los olivos generados como componente del exterior (A3-2a, MU5-n; antes 07ab_generados.js): el ciclo de vida. Con el three de verdad (sin GPU: BatchedMesh,
// InstancedMesh, geometrías, materiales y texturas existen sin renderizador), la fábrica de materiales de verdad y un constructor de olivos DE MENTIRA (recetas de
// pocas piezas: una corteza por lotes y unas ramitas instanciadas), para que sea rápido y para contar lo que crea. Lo de siempre con el constructor de verdad
// (materiales, fundido, horneado, paseo, escalera) lo prueban pruebas/olivo/generados_motor.mjs, escalera_motor.mjs y lote_tramos.mjs (olivo.test.js), que
// evalúan el talón con su contexto. HONESTIDAD: nada se dibuja; renderer.info.memory no se lee (sin GPU): se cuenta qué se suelta con dispose().
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { creaGenerados, manifiestoGenerados } from "./generados.ts";
import type { DepsGenerados } from "./generados.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const THREE: A = await import(/* @vite-ignore */ "three" as string);
const espera = () => new Promise(r => setTimeout(r, 0));

/** una geometría de origen (atrib + índice) como las del constructor: un quad */
function quad() { return { atrib: { position: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), normal: new Float32Array(12), uv: new Float32Array(8) }, indice: new Uint16Array([0, 1, 2, 0, 2, 3]) }; }
/** el constructor de olivos de mentira: lo justo para que Generados monte un lote; cuenta lo que crea y lo que suelta */
function constructor() {
  const cuenta = { recetas: 0, fabricas: 0, cerradas: 0, materiales: 0, liberados: 0 }, texturas: A[] = [], G = { tocon: quad(), corte: quad(), oliva: quad(), octa: quad(), ramita: quad(), relleno: quad(), tarjeta: quad(), tarjetaO: quad() };
  const receta = () => ({ escala: [1, 1, 1], medidas: { copa_m: 2, altura_m: 4 }, piezas: [
    { clase: "malla", mat: "corteza", geo: "propia", atrib: quad().atrib, indice: quad().indice, pos: [0, 0, 0], rot: [0, 0, 0, 1], esc: [1, 1, 1] },
    { clase: "instancias", mat: "ramita0", geo: "ramita", n: 2, matrices: new THREE.Matrix4().toArray().concat(new THREE.Matrix4().toArray()), colores: new Float32Array(6).fill(1), pos: [0, 0, 0], rot: [0, 0, 0, 1], esc: [1, 1, 1] }] });
  const M: A = {
    recetaG: function* () { cuenta.recetas++; yield; return receta(); },
    aNivelG: function* (r: A) { yield; return r; },
    geos: () => G,
    claveReceta: (e: A, niv: string) => e.tipo + "|" + e.semilla + "|" + niv,
    semillaDeCopa: () => ({ semilla: 7 }),
    parametrosDeCopa: () => ({ tipo: "centenario3", parametros: { copa: 2, altura: 4 } }),
    triangulosNivel: () => 4,
    encadena: (m: A, fn: A, k: string) => { const p = m.onBeforeCompile; m.onBeforeCompile = function (sh: A, r: A) { if (p) p(sh, r); fn(sh, r); }; m.customProgramCacheKey = () => k; return m; },
    creaFabrica: () => { cuenta.fabricas++; return { modo: "rebanadas", cierra() { cuenta.cerradas++; } }; },
    creaMateriales: (T: A, _f: unknown, o: A) => {
      const t = new T.Texture(); texturas.push(t);
      const S = (p: A = {}) => { cuenta.materiales++; return new T.MeshStandardMaterial(p); }, P = () => { cuenta.materiales++; return new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }); };
      const m: A = { pies: S({ map: t }), muerta: S(), oliva: S(), ramita0: S({ alphaTest: 0.45 }), ramita1: S({ alphaTest: 0.45 }), relleno: S({ alphaTest: 0.5 }), tarjeta: S({ alphaTest: 0.45 }),
        ramita0_sombra: P(), ramita1_sombra: P(), relleno_sombra: P(), tarjeta_sombra: P(), puntos: (cuenta.materiales++, new T.PointsMaterial()) };
      Object.keys(m).forEach(n => o.parche(m[n], n));
      Object.defineProperty(m, "libera", { value: () => { cuenta.liberados++; texturas.forEach(x => x.dispose()); Object.keys(m).forEach(n => m[n].dispose()); } });
      return m;
    }
  };
  return { M, cuenta, texturas };
}
function monta(busqueda = "?olivos=gen", extra: Partial<DepsGenerados> = {}) {
  const C = constructor(), gArboles = new THREE.Group(), F = creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" });
  let suelta: (m: A) => void = () => {};
  const llegada = extra.cargaConstructor ? null : new Promise(r => { suelta = r; });
  const deps: DepsGenerados = {
    THREE, D: { copas: [[0, 0, 4, [1, 1, 1, 1, 1, 1, 1, 1]]], copas_param: [null], copas_id: [3], centro_utm: [0, 0] }, VRP: { on: false },
    factorR8Gen: () => 1, factorCopaDeConfig: () => 1, Aparato: { politica: () => ({ cacheMemMB: 150, cacheMemVrMB: 60 }) },
    Config: { listo: Promise.resolve(null), param: (_r: string, c: unknown, u: unknown) => (u !== undefined && u !== null ? u : c), umbrales: (c: unknown, u: unknown) => u || c, tablaEpocas: () => null, epocaDeFecha: () => null },
    Materiales: F, gArboles, camera: { position: new THREE.Vector3(0, 10, 0) }, Estado: { exag: 1 }, suelo: () => 0, parcheTiempo: () => {},
    busqueda, reloj: { now: () => performance.now() }, consola: null, ventana: {}, cargaConstructor: () => llegada as Promise<A>, ...extra
  };
  return { G: creaGenerados(deps), C, gArboles, F, deps, llega: () => suelta(C.M) };
}
const OLIVOS = [{ i: 0, x: 0, y: 0, h: 4 }];
async function conLote(m: ReturnType<typeof monta>) {
  m.llega(); for (let k = 0; k < 20 && m.G.estado() === "cargando"; k++) await espera();
  expect(m.G.estado()).toBe("activo");
  for (let k = 0; k < 400 && !(m.G._prueba.lote() && m.G._prueba.lote().children.length); k++) { m.G.actualiza(0, 0, 550000, OLIVOS, 1); m.G.paso(0.016, 50); }
  expect(m.G._prueba.lote()).toBeTruthy();
}

describe("olivos generados (componente del exterior)", () => {
  it("monta un lote (una malla por lotes de corteza y una instanciada de ramitas) dentro de su grupo, colgado de gArboles", async () => {
    const m = monta(); await conLote(m);
    const lote = m.G._prueba.lote();
    expect(m.gArboles.children).toHaveLength(1); expect(m.gArboles.children[0].children).toContain(lote);
    expect(lote.children.map((o: A) => o.name).sort()).toEqual(["gen-corteza", "gen-ramita0"]);
    expect(m.G.rotulo(0)).toMatchObject({ forma: "ilustrativa con medidas del LiDAR", niv: "E0" });
    expect((m.deps.ventana as A).__olivosGen().estado).toBe("activo");
  });

  it("memoria: liberar suelta TODO lo que contaría renderer.info (las geometrías del lote, sus mallas, los materiales y las texturas), cierra el trabajador, vacía la cola y la caché de recetas", async () => {
    const m = monta(); await conLote(m);
    // lo que tiene GPU: lo que cuelga del grupo (geometrías de las mallas, también la interna de la BatchedMesh) y los materiales y texturas del constructor
    const geos = new Set<A>(), mats = new Set<A>(), sueltos = new Set<A>();
    m.gArboles.traverse((o: A) => { if (o.geometry) geos.add(o.geometry); });
    const lm = m.G._prueba.mats(); Object.keys(lm).forEach(n => mats.add(lm[n])); const pr = m.G._prueba.prof(); mats.add(pr.corteza); mats.add(pr.muerta);
    const todo = [...geos, ...mats, ...m.C.texturas]; todo.forEach(x => x.addEventListener("dispose", () => sueltos.add(x)));
    let mallas = 0; m.G._prueba.lote().children.forEach((o: A) => o.addEventListener("dispose", () => { mallas++; }));
    expect(geos.size).toBeGreaterThanOrEqual(2); expect(m.C.texturas).toHaveLength(1);
    expect(Object.keys(m.G._prueba.recetas()).length).toBeGreaterThan(0);
    expect(m.G.libera()).toBe(true);
    expect(todo.filter(x => !sueltos.has(x))).toEqual([]);   // nada vivo: geometrías, materiales (también los de profundidad) y la textura
    expect(mallas).toBe(2);   // la BatchedMesh y la InstancedMesh, con su dispose
    expect(m.gArboles.children).toHaveLength(0); expect(m.G._prueba.lote()).toBeNull();
    expect(m.C.cuenta.liberados).toBe(1); expect(m.G._prueba.mats()).toBeNull(); expect(m.G._prueba.prof()).toBeNull();
    expect(Object.keys(m.G._prueba.recetas())).toEqual([]); expect((m.deps.ventana as A).__olivosGen().trabajos).toBe(0);
    expect(m.G.estado()).toBe("apagado"); expect(m.G.pendientes()).toBe(0);
    // apagado: ni reparte ni trabaja; dos veces no libera dos veces
    expect(m.G.actualiza(0, 0, 550000, OLIVOS, 1).radio).toBe(0); expect(m.G.paso(0.016, 10)).toBe(false);
    expect(m.G.libera()).toBe(false); expect(m.C.cuenta.liberados).toBe(1);
  });

  it("liberado mientras carga el constructor: lo que llega tarde se tira (ni materiales, ni trabajador, ni grupo)", async () => {
    const m = monta(); expect(m.gArboles.children).toHaveLength(1);
    m.G.libera(); expect(m.gArboles.children).toHaveLength(0);
    m.llega(); for (let k = 0; k < 10; k++) await espera();
    expect(m.G.estado()).toBe("apagado"); expect(m.C.cuenta.materiales).toBe(0); expect(m.C.cuenta.fabricas).toBe(0);
  });

  it("una receta que llega después de liberar no se guarda", async () => {
    let entrega: (r: A) => void = () => {};
    const m = monta(); m.llega(); for (let k = 0; k < 20 && m.G.estado() === "cargando"; k++) await espera();
    // el trabajador de mentira: la receta se queda pendiente hasta que se la entrega
    let cerrado = 0; (m.C.M as A).creaFabrica = () => ({ modo: "trabajador", receta: () => new Promise(r => { entrega = r; }), cierra() { cerrado++; } });
    const m2 = monta("?olivos=gen", { cargaConstructor: () => Promise.resolve(m.C.M) });
    for (let k = 0; k < 20 && m2.G.estado() === "cargando"; k++) await espera();
    m2.G.actualiza(0, 0, 550000, OLIVOS, 1); expect((m2.deps.ventana as A).__olivosGen().pidiendo).toBeGreaterThan(0);
    m2.G.libera(); entrega({ escala: [1, 1, 1], medidas: {}, piezas: [] }); await espera();
    expect(Object.keys(m2.G._prueba.recetas())).toEqual([]);
    expect(cerrado).toBe(1);   // libera() cierra el trabajador
    m.G.libera();
  });

  it("sus materiales salen de la fábrica (gen-olivo y gen-profundidad, con dueño olivos-generados); el clásico es el de siempre (mismo parche encadenado y misma clave)", async () => {
    const m = monta(); await conLote(m);
    const F = m.F, inv = F.inventario(), lm = m.G._prueba.mats(), pr = m.G._prueba.prof();
    expect(inv["gen-olivo"]).toEqual({ tipo: "define", n: 8 });   // pies, muerta, oliva, ramita0, ramita1, relleno, tarjeta y puntos
    expect(inv["gen-profundidad"]).toEqual({ tipo: "define", n: 6 });   // las 4 sombras de las hojas y las 2 de las mallas por lotes
    expect(F.duenos()).toEqual({ "olivos-generados": 14 }); expect(F.ruta("gen-olivo")).toBe("clasico");
    expect(lm.pies.customProgramCacheKey()).toBe("gen-luz-fundido"); expect(pr.corteza.customProgramCacheKey()).toBe("gen-fundido"); expect(pr.corteza.isMeshDepthMaterial).toBe(true);
    // el parche: luz y fundido, con los uniformes de Generados (los mismos que reciben los lejanos de 07ac)
    const sh = { uniforms: {} as A, vertexShader: "#include <common>\n#include <begin_vertex>\n#include <color_vertex>", fragmentShader: "void main() {" };
    lm.relleno.onBeforeCompile(sh, null);
    expect(sh.uniforms.uFun).toBe(m.G._prueba.uFun); expect(sh.uniforms.uBanda).toBe(m.G._prueba.uBanda); expect(sh.fragmentShader).toContain("ot_ign(gl_FragCoord.xy)");
    expect(m.G.lejanos.uFun).toBe(m.G._prueba.uFun);
    m.G.libera(); expect(F.duenos()).toEqual({});
  });

  it("sin la bandera (?olivos=0): apagado desde el principio, sin grupo; libera no rompe", () => {
    const m = monta("?olivos=0");
    expect(m.G.estado()).toBe("apagado"); expect(m.gArboles.children).toHaveLength(0); expect(m.G.libera()).toBe(true);
  });

  it("el manifiesto vale, es de los mundos [exterior], monta el mismo objeto y su libera lo suelta; se puede pedir sin dependencias (el banco)", async () => {
    const m = monta(), man = manifiestoGenerados(m.G);
    expect(ComponentesPuro.valida(man)).toEqual([]); expect(man.id).toBe("olivos-generados"); expect(man.mundos).toEqual(["exterior"]);
    expect(ComponentesPuro.valida(manifiestoGenerados({} as never))).toEqual([]);
    const api = man.monta({} as never); expect(api === m.G).toBe(true);
    man.libera(api as never); expect(m.G.liberado()).toBe(true); expect(() => man.libera(null as never)).not.toThrow();
  });
});

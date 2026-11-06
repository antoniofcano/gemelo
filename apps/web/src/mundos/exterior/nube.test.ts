// La nube LiDAR del exterior (A3-3, MU5-n; antes 05_nube.js). Con el three de verdad (sin GPU: geometrías, materiales y mallas existen sin renderizador), la fábrica de
// materiales de verdad y una Cola y un Mundo de mentira. Se comprueba: el nivel de detalle por distancia, los tres hallazgos de la auditoría (L1-01 y L2-02: solo en modo nube
// y se suelta a la distancia de carga; L1-02: el presupuesto de puntos nunca se pasa, con todos los niveles y al cambiar la cámara) y el ciclo de vida: montar y liberar deja las
// geometrías vivas como estaban. HONESTIDAD: nada se dibuja; lo que se ve lo dice el banco y el Quest, no probado aquí.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { CARGA_NUBE_M, DEF_NUBE, LIBERA_NUBE_M, MATERIAL_NUBE, MIN_PUNTOS, NIV_NUBE, NubePuro, PRESUPUESTO_NUBE, SUELTA_FUERA_S, creaNube, manifiestoNube } from "./nube.ts";
import type { DepsNube } from "./nube.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

/** una Cola de mentira: corre cada trabajo entero en el acto y llama a su fin; sabe qué se canceló */
function cola() {
  const hay = new Set<string>(), canceladas: string[] = [];
  return {
    hay, canceladas,
    pon(clave: string, _prio: number, gen: Generator<unknown, unknown, unknown>, fin?: (v: unknown) => void) {
      hay.add(clave); let r = gen.next(); while (!r.done) r = gen.next(); hay.delete(clave); if (fin) fin(r.value); return true;
    },
    cancela(clave: string) { canceladas.push(clave); hay.delete(clave); },
    // (hay() es del contrato de la Cola: aquí nada queda pendiente porque todo corre en el acto)
    hayTrabajo(clave: string) { return hay.has(clave); },
  };
}
/** una tesela con n puntos repartidos en su rectángulo (cm, relativos a su origen), todos a poca altura sobre un suelo plano en 0 */
function tesela(k: number, n: number, dist: number) {
  const pts = new Int16Array(n * 3);
  for (let i = 0; i < n; i++) { pts[i * 3] = (i * 37) % 25600; pts[i * 3 + 1] = (i * 91) % 25600; pts[i * 3 + 2] = 50 + (i % 200); }   // altura 0,5-2,5 m
  return { key: "t" + k, np: n, pts, ox: k * 256, oy: 0, dist, nubeEst: 0 as number, nubeMalla: null as unknown };
}
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

function monta(teselas: ReturnType<typeof tesela>[], modo = "nube", extra: Partial<DepsNube> = {}) {
  const scene = new THREE.Scene(), Estado = { exag: 1, modo }, camera = { position: { x: 0, y: 0, z: 0 } }, c = cola(), vista = { kcor: 1, tinte: false, ndviIdx: 0 };
  const Materiales = creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" });
  const tiempo: unknown[] = [];
  const Mundo = { TS: 256, lista: teselas, *aseguraOrto() { /* sin ortofoto */ }, dist: (t: { dist: number }) => t.dist };
  const deps: DepsNube = {
    THREE, Mundo, suelo: () => 0, copaAlta: () => 0, kcor: () => vista.kcor, tinte: () => vista.tinte, ndviIdx: () => vista.ndviIdx,
    aviva: () => { /* sin tinte */ }, colorEn: (_x, _y, h, out) => { out[0] = 0.4; out[1] = 0.5; out[2] = 0.3 + h * 0; }, hash,
    parcheTiempo: (sh) => { tiempo.push(sh); },
    ColaExt: { pon: c.pon, cancela: c.cancela, hay: c.hayTrabajo }, Materiales, Estaticos: { congela() { /* sin efecto en la prueba */ } }, scene, camera, Estado, ...extra,
  };
  return { api: creaNube(deps), deps, scene, Estado, camera, c, vista, Materiales, tiempo };
}
/** cuenta las geometrías vivas (creadas y no liberadas): lo que renderer.info.memory.geometries contaría al dibujarlas */
function contado() {
  const vivas = { n: 0 };
  class Geo extends THREE.BufferGeometry { constructor() { super(); vivas.n++; let ya = false; this.addEventListener("dispose", () => { if (!ya) { ya = true; vivas.n--; } }); } }
  return { T: Object.assign({}, THREE, { BufferGeometry: Geo }), vivas };
}

describe("nube LiDAR (componente del exterior)", () => {
  it("lo puro: el nivel por distancia y el reparto del presupuesto", () => {
    expect([0, 299, 300, 699, 700, 1299, 1300, 2299, 2300, 5000].map(NubePuro.nivel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, -1, -1]);
    expect(CARGA_NUBE_M).toBe(1800); expect(LIBERA_NUBE_M).toBeCloseTo(2160, 9);   // L2-02: coherentes con lo que carga el Mundo (RADIO_CARGA)
    // cabe: todo a escala 1; no cabe: se aclara todo a la vez y el total no pasa del presupuesto
    expect(NubePuro.reparte([{ n: 1000, f: 1 }, { n: 100000, f: 0.5 }], 1e6)).toEqual({ conteo: [1000, 50000], escala: 1, total: 51000 });
    const r = NubePuro.reparte([{ n: 100000, f: 1 }, { n: 100000, f: 0.5 }, { n: 100000, f: 0.18 }], 90000);
    expect(r.total).toBeLessThanOrEqual(90000); expect(r.escala).toBeLessThan(1); expect(r.conteo[0]).toBeGreaterThan(r.conteo[1]!);
    // el suelo por malla: nunca menos de MIN_PUNTOS (o todos los suyos si tiene menos)
    expect(NubePuro.reparte([{ n: 100, f: 1 }, { n: 1e6, f: 0.045 }], 10).conteo[0]).toBe(100);
    expect(NubePuro.reparte([{ n: 1e6, f: 0.045 }], 10).conteo[0]).toBe(MIN_PUNTOS);
  });

  it("en modo nube monta una malla por tesela cercana, con el nivel de detalle de su distancia, y ninguna más allá de lo que el Mundo carga", () => {
    const T = [tesela(0, 3000, 100), tesela(1, 3000, 500), tesela(2, 3000, 1000), tesela(3, 3000, 1700), tesela(4, 3000, 1900), tesela(5, 3000, 2200)];
    const { api, scene } = monta(T);
    expect(scene.children).toHaveLength(1);   // el grupo de la nube
    api.actualizaNubeTeselas(0, 0, 0); api.actualizaNubeTeselas(0, 0, 0);   // la primera encarga las mallas (la Cola de la prueba las monta en el acto); la segunda les pone nivel
    expect(T.map(t => !!t.nubeMalla)).toEqual([true, true, true, true, false, false]);   // L2-02: más allá de 1.800 m no se monta nada
    const mat = api.matsNube();
    T.slice(0, 4).forEach((t, i) => { expect((t.nubeMalla as { material: unknown }).material).toBe(mat[i]); });
    expect(T.slice(0, 4).map(t => (t.nubeMalla as { geometry: { drawRange: { count: number } } }).geometry.drawRange.count)).toEqual([3000, 1500, MIN_PUNTOS, MIN_PUNTOS]);   // 3000 · 1, · 0,5, · 0,18 (540) y · 0,045 (135) no bajan del suelo de MIN_PUNTOS
    expect(api.nube.g.children).toHaveLength(4);
    expect(api.resumen()).toMatchObject({ mallas: 4, visibles: 4 });
  });

  it("L1-01 y L2-02: fuera del modo nube no se monta nada y, pasados 2 s, se sueltan todas las mallas (geometría y copias de CPU)", () => {
    const T = [tesela(0, 3000, 100), tesela(1, 3000, 500)], { api, Estado, c } = monta(T);
    api.actualizaNubeTeselas(0, 0, 0); expect(T.every(t => t.nubeMalla)).toBe(true);
    const mallas = T.map(t => t.nubeMalla as { geometry: { addEventListener(n: string, f: () => void): void } }), liberadas = [0, 0];
    mallas.forEach((m, i) => m.geometry.addEventListener("dispose", () => { liberadas[i]!++; }));
    Estado.modo = "gem";
    api.actualizaNube(0.5);   // aún no ha pasado el tiempo de gracia (volver rápido al modo nube no reconstruye nada)
    expect(T.every(t => t.nubeMalla)).toBe(true);
    for (let s = 0; s < SUELTA_FUERA_S + 1; s += 0.25) api.actualizaNube(0.25);
    expect(T.every(t => t.nubeMalla === null)).toBe(true); expect(liberadas).toEqual([1, 1]); expect(api.nube.g.children).toHaveLength(0);
    expect(c.canceladas).toEqual(expect.arrayContaining(["Nt0", "NPt0", "Nt1", "NPt1"]));
    expect(api.resumen().mallas).toBe(0);
    // en modo Gemelo, ni la pasada directa (la de 90_final al arrancar) ni el bucle encargan nada
    api.actualizaNubeTeselas(0, 0, 0); for (let s = 0; s < 3; s += 0.25) api.actualizaNube(0.25);
    expect(T.every(t => t.nubeMalla === null && !t.nubeEst)).toBe(true);
    // al volver al modo nube, se reconstruyen
    Estado.modo = "nube"; api.actualizaNube(0.25); expect(T.every(t => t.nubeMalla)).toBe(true);
  });

  it("L2-02: una malla a más de 1,2 × 1.800 m se suelta (antes, a 2.760 m, que una finca no alcanza); a 1.900 m, con malla, se conserva", () => {
    const T = [tesela(0, 3000, 100), tesela(1, 3000, 100)], { api } = monta(T);
    api.actualizaNubeTeselas(0, 0, 0); expect(T.every(t => t.nubeMalla)).toBe(true);
    T[0]!.dist = 1900; T[1]!.dist = 2200; api.actualizaNubeTeselas(0, 0, 0);
    expect(!!T[0]!.nubeMalla).toBe(true); expect(T[1]!.nubeMalla).toBeNull();
    expect(T[1]!.nubeEst).toBe(0);   // y puede volver a montarse al acercarse
    T[1]!.dist = 100; api.actualizaNubeTeselas(0, 0, 0); expect(!!T[1]!.nubeMalla).toBe(true);
  });

  it("L1-02: con una nube densa el total dibujado nunca pasa de 1,4 M, en todos los niveles, y se recalcula al cambiar la cámara aunque ningún nivel cambie", () => {
    // 12 teselas de 150 k puntos: a escala 1 serían 12 × (nivel 0: 150 k) = 1,8 M
    const T = Array.from({ length: 12 }, (_, k) => tesela(k, 150000, 100 + k * 5));
    const { api } = monta(T);
    api.actualizaNubeTeselas(0, 0, 0); api.actualizaNubeTeselas(0, 0, 0);
    const r = api.resumen();
    expect(r.mallas).toBe(12); expect(r.puntos).toBeLessThanOrEqual(PRESUPUESTO_NUBE); expect(r.puntos).toBeGreaterThan(PRESUPUESTO_NUBE * 0.9); expect(r.escala).toBeLessThan(1);
    expect(T.every(t => (t.nubeMalla as { geometry: { drawRange: { count: number } } }).geometry.drawRange.count < 150000)).toBe(true);   // también en el nivel 0 (antes no se aclaraba)
    // la cámara se aleja de 8 teselas sin que las otras cambien de nivel: a las que quedan se les devuelve parte de los puntos
    T.slice(4).forEach(t => { t.dist = 3000; });
    api.actualizaNubeTeselas(0, 0, 0);
    expect(api.resumen().visibles).toBe(4); expect(api.resumen().puntos).toBe(4 * 150000); expect(api.resumen().escala).toBe(1);
  });

  it("pintaNube: repinta solo si cambió lo que influye en el color (kcor, tinte, fecha NDVI) y sigue la exageración", () => {
    const T = [tesela(0, 3000, 100)], { api, vista, Estado } = monta(T);
    api.actualizaNubeTeselas(0, 0, 0); api.actualizaNubeTeselas(0, 0, 0);
    const m = T[0]!.nubeMalla as { scale: { y: number }; position: { y: number }; geometry: { attributes: { color: { version: number } } } };
    const t = T[0] as unknown as { nubeSucia: boolean };
    expect(t.nubeSucia).toBe(false);
    api.pintaNube(); expect(t.nubeSucia).toBe(true);   // la primera vez: la clave pasa de "" a la de ahora
    t.nubeSucia = false; api.pintaNube(); expect(t.nubeSucia).toBe(false);
    vista.kcor = 1.5; Estado.exag = 2; api.pintaNube(); expect(t.nubeSucia).toBe(true);
    expect(m.scale.y).toBeGreaterThan(0);
    const v0 = m.geometry.attributes.color.version;
    api.actualizaNubeTeselas(0, 0, 0);   // pone en la Cola el repintado (corre en el acto)
    expect(t.nubeSucia).toBe(false); expect(m.geometry.attributes.color.version).toBeGreaterThan(v0);
  });

  it("montar y liberar (varias veces) deja las geometrías vivas como estaban, el grupo fuera de la escena y los materiales soltados; liberar dos veces no rompe", () => {
    const { T: T3, vivas } = contado();
    const teselas = [tesela(0, 3000, 100), tesela(1, 3000, 800)], { api, scene, Materiales } = monta(teselas, "nube", { THREE: T3 });
    expect(vivas.n).toBe(0);
    for (let v = 0; v < 3; v++) {
      api.monta(); api.actualizaNubeTeselas(0, 0, 0);
      expect(vivas.n).toBe(2); expect(scene.children).toHaveLength(1); expect(Materiales.duenos()).toEqual({ "nube-lidar": 4 });
      api.libera();
      expect(vivas.n).toBe(0); expect(scene.children).toHaveLength(0); expect(Materiales.duenos()).toEqual({});
      expect(teselas.every(t => t.nubeMalla === null && t.nubeEst === 0)).toBe(true);
    }
    expect(() => api.libera()).not.toThrow();
    // sin montar, no encarga nada
    api.actualizaNubeTeselas(0, 0, 0); expect(vivas.n).toBe(0);
  });

  it("sus 4 materiales (uno por nivel) salen de la fábrica por define + crea con dueño y el nombre de la tabla de MATERIALES; el clásico es el de siempre (mismo parche, sin clave propia) y comparten el color del maestro", () => {
    const { api, Materiales, tiempo } = monta([]);
    expect(MATERIAL_NUBE).toBe("nube-lidar");
    expect(Materiales.cobertura()["nube-lidar"]).toEqual({ clasico: true, tsl: false, usado: 4 });
    expect(Materiales.inventario()).toMatchObject({ "nube-lidar": { tipo: "define", n: 4 } }); expect(Materiales.duenos()).toEqual({ "nube-lidar": 4 }); expect(Materiales.ruta("nube-lidar")).toBe("clasico");
    const mats = api.matsNube(); expect(mats).toHaveLength(NIV_NUBE.length);
    mats.forEach((m: { color: unknown; onBeforeCompile(sh: unknown): void; isPointsMaterial: boolean; sizeAttenuation: boolean; vertexColors: boolean; customProgramCacheKey(): string }) => {
      expect(m.color).toBe(api.nube.material.color); expect(m.isPointsMaterial).toBe(true); expect(m.sizeAttenuation).toBe(true); expect(m.vertexColors).toBe(true);
      expect(m.customProgramCacheKey()).toBe(m.onBeforeCompile.toString());   // sin clave propia: la de three, el texto del parche
    });
    const sh = {}; mats[0].onBeforeCompile(sh); expect(tiempo).toEqual([sh]);
    expect(mats.map((m: { size: number }) => m.size)).toEqual([0.6, 0.6 / Math.sqrt(0.5), Math.min(3, 0.6 / Math.sqrt(0.18)), Math.min(3, 0.6 / Math.sqrt(0.045))]);
    // el clásico a mano: lo mismo que pide la fábrica
    const a = DEF_NUBE.clasico!({ size: 1, color: api.nube.material.color, parche: () => { /* sin efecto */ } }, { THREE, nombre: "nube-lidar" }) as { size: number };
    expect(a.size).toBe(1);
    // libera() los suelta (y deja la lista de la fábrica vacía)
    let liberados = 0; mats.forEach((m: { addEventListener(n: string, f: () => void): void }) => m.addEventListener("dispose", () => { liberados++; }));
    api.libera(); expect(liberados).toBe(4); expect(Materiales.duenos()).toEqual({});
  });

  it("el manifiesto vale, es de los mundos [exterior], y su libera suelta de verdad", () => {
    const { api, scene } = monta([tesela(0, 3000, 100)]), man = manifiestoNube(api);
    expect(ComponentesPuro.valida(man)).toEqual([]);
    expect(man.id).toBe("nube-lidar"); expect(man.mundos).toEqual(["exterior"]); expect(man.bandera).toEqual({ defecto: true });
    const a = man.monta({} as never) as typeof api; expect(a).toBe(api);
    expect(scene.children).toHaveLength(1);
    man.libera(a); expect(scene.children).toHaveLength(0); expect(() => man.libera(a)).not.toThrow(); expect(() => man.libera(null)).not.toThrow();
    man.monta({} as never); expect(scene.children).toHaveLength(1);   // el exterior vuelve a entrar
  });
});

// La nube de puntos LiDAR del exterior (MU5-n, A3-3; antes apps/web/motor/05_nube.js, que queda como talón). Componente «nube-lidar» de los mundos ["exterior"], con un
// libera() que suelta de verdad. Una malla por tesela, con las posiciones cuantizadas a 16 bits y el color a 8, y nivel de detalle por distancia.
// El orden de los puntos de cada tesela está barajado, así que dibujar solo la primera fracción (setDrawRange) es una muestra uniforme: lejos se pintan menos puntos.
// La malla lleva su posición y escala (centro y semirrango de la tesela): la exageración vertical es solo la escala en y, sin tocar ningún vértice.
// Preparar los puntos de una tesela (filtrar, cuantizar, colorear) son ~100 ms: se hace a rebanadas en la cola de trabajos.
//
// Lo que cambia respecto a 05_nube.js (hallazgos de la auditoría de noviembre de 2026; el resto es el código de antes, movido):
//   · L1-01 y L2-02: la nube solo existe en el modo «nube». Fuera de él no se encarga ninguna malla nueva y, pasados SUELTA_FUERA_S segundos sin volver, se sueltan todas
//     (geometría y copias de CPU, ≈ 23 B por punto). Antes `actualizaNube` corría en cualquier modo y la nube de toda la finca se quedaba montada aunque nunca se viera.
//   · L2-02: la distancia de liberación es coherente con la de carga: no se monta ninguna malla por encima de RADIO_CARGA (1800 m, el Mundo no carga más allá) y se sueltan
//     las de más de 1,2 × RADIO_CARGA (2160 m). Antes era 1,2 × 2300 = 2760 m, que una finca de 1-2 km de lado no alcanza nunca.
//   · L1-02: el presupuesto de puntos (PRESUPUESTO_NUBE) se reparte entre TODOS los niveles (antes solo el 2 y el 3) y se recalcula en cada pasada, no solo cuando una
//     tesela cambia de nivel: si baja la escala, las mallas que ya estaban en su nivel se aclaran.
//   · Un libera() de componente: quita el grupo de la escena, cancela los trabajos de la Cola, suelta cada malla y sus copias de CPU y los materiales.
// Del legado recibe por argumento lo que necesita (THREE, el Mundo, la Cola, la fábrica de materiales, el color de la ortofoto…); no lee globales. Lo que 09_camara y
// 10_ndvi reescriben (kcor, tinte, ndviIdx: primitivas del legado) entra como funciones que lo leen en cada uso.
// Presupuesto (regla 6): una llamada por tesela con nube a la vista y, como mucho, PRESUPUESTO_NUBE puntos dibujados.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { DefMaterial, Materiales, MaterialMin } from "../../nucleo/materiales.ts";
import { RADIO_CARGA } from "./teselas.ts";
import { colorSrgbTsl } from "./tiempo-parche.ts";
import { centroPunto, espejoSprites } from "./puntos-tsl.ts";

// three no trae tipos en el repo (como en suelo-fondo.ts): de él solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

export const ALTO_MAX = 7.5;   // por encima de 7,5 m no hay olivo: cipreses, pinos o ruido
export const NIV_NUBE = [{ d: 300, f: 1 }, { d: 700, f: 0.5 }, { d: 1300, f: 0.18 }, { d: 2300, f: 0.045 }];
export const PRESUPUESTO_NUBE = 1400000;   // puntos dibujados como máximo; si se pasa, todo se aclara a la vez (L1-02)
export const MIN_PUNTOS = 1500;   // una malla dibuja al menos esto (o todos los suyos, si tiene menos)
export const SUELTA_FUERA_S = 2;   // L1-01: fuera del modo nube, a los 2 s se sueltan las mallas
export const CARGA_NUBE_M = RADIO_CARGA;   // L2-02: ni se monta una malla más allá de lo que el Mundo carga
export const LIBERA_NUBE_M = RADIO_CARGA * 1.2;   // L2-02: ni se conserva más allá de esto
export const ID_NUBE = "nube-lidar";
/** el nombre del material en la fábrica (MATERIALES §1, fila 9): también es la clave de su variante TSL */
export const MATERIAL_NUBE = "nube-lidar";

// ---------------------------------------------------------------- el material (MU5-n: por la fábrica, con su nombre de la tabla de MATERIALES §1, fila 9)
/** lo que pide el material: el tamaño del punto de su nivel, el color del maestro (el MISMO objeto: el ciclo del día lo tiñe) y el parche de la luz (15_tiempo: nubes, helada) */
export interface OpcNube { size: number; color: unknown; parche(sh: unknown): void }
/** el material de un nivel de la nube: puntos con color por vértice, el color compartido y el parche de 15_tiempo asignado tal cual (la misma función, sin clave propia: three usa su texto como clave del programa) */
export const DEF_NUBE: DefMaterial<OpcNube> = {
  clasico: function (o, c) {
    const Puntos = c.THREE["PointsMaterial"] as new (opc: unknown) => MaterialMin & { color: unknown };
    const m = new Puntos({ size: o.size, sizeAttenuation: true, vertexColors: true });
    m.color = o.color;
    m.onBeforeCompile = o.parche;
    m.needsUpdate = true;
    return m;
  },
  // MU5-n, tercer commit (A3-3) y A4-0: la variante TSL, APAGADA (solo con el WebGPURenderer, MU6; nadie la usa hoy). Un PointsNodeMaterial con las propiedades del
  // clásico (el tamaño de su nivel, la atenuación por distancia y el MISMO objeto de color del maestro, que el ciclo del día tiñe) y (A4-0) lo que el parche del
  // tiempo hace en unos puntos: el color por vértice, escrito en sRGB, a lineal (colorSrgbTsl; la sombra de nubes y la helada no, tampoco en el clásico: el
  // sombreador de puntos no tiene <dithering_fragment>, MATERIALES §11.1). Con el backend WebGPU un punto mide 1 px: desde A4-0, con la TSL, cada malla de la nube
  // se dibuja con su espejo de sprites instanciados (puntos-tsl.ts: el mismo tamaño en pantalla, 2 triángulos por punto, SIN MEDIR). NO se puede decir que sea
  // equivalente hasta las capturas de MU6.
  tsl: function (o, c) {
    const Puntos = c.THREE["PointsNodeMaterial"] as new (opc: unknown) => MaterialMin & { color: unknown; colorNode?: unknown; positionNode?: unknown; vertexColors?: boolean };
    const T = c.TSL as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const m = new Puntos({ size: o.size, sizeAttenuation: true, vertexColors: false });
    m.color = o.color;
    m.colorNode = colorSrgbTsl(T, T["materialColor"], true);
    m.positionNode = centroPunto(T);   // el centro del punto, también en el espejo de sprites
    return m;
  }
};

/** Lo puro: el nivel de detalle por distancia y el reparto del presupuesto de puntos. */
export const NubePuro = {
  /** el nivel (0-3) de una malla a esta distancia, o −1 si está más lejos que el último */
  nivel: function (dist: number): number { return dist < NIV_NUBE[0]!.d ? 0 : dist < NIV_NUBE[1]!.d ? 1 : dist < NIV_NUBE[2]!.d ? 2 : dist < NIV_NUBE[3]!.d ? 3 : -1; },
  /** cuántos puntos dibuja cada malla (n = sus puntos, f = la fracción de su nivel). Con todo a escala 1 se pasa del presupuesto → se baja la escala de TODAS a la vez
   *  hasta que el total cabe (el suelo de MIN_PUNTOS por malla puede impedirlo con muchísimas mallas: entonces se queda lo más cerca posible). */
  reparte: function (mallas: { n: number; f: number }[], presupuesto: number): { conteo: number[]; escala: number; total: number } {
    let escala = 1, conteo: number[] = [], total = 0;
    for (let it = 0; it < 12; it++) {
      conteo = mallas.map(function (m) { return Math.min(m.n, Math.max(MIN_PUNTOS, Math.ceil(m.n * m.f * escala))); });
      total = conteo.reduce(function (a, b) { return a + b; }, 0);
      if (total <= presupuesto) break;
      const nueva = escala * (presupuesto / total) * 0.995;
      if (nueva >= escala) break;
      escala = nueva;
    }
    return { conteo, escala, total };
  }
};

/** Lo que se usa de la Cola del exterior (02b_cola: ColaExt). */
export interface ColaNube {
  pon(clave: string, prio: number, trabajo: Generator<unknown, unknown, unknown>, fin?: (valor: unknown) => void): boolean;
  cancela(clave: string): void;
  hay(clave: string): boolean;
}
/** Lo que se usa del Mundo (02_mundo). Una tesela admite más campos: la nube le cuelga los suyos (nubeMalla, nubeX…). */
export interface MundoNube {
  TS: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lista: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aseguraOrto(t: any): Generator<unknown, unknown, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dist(t: any, x: number, y: number, z: number): number;
}
export interface DepsNube {
  THREE: T3;
  Mundo: MundoNube;
  /** 02_mundo: la cota del suelo y la altura de la copa en un punto */
  suelo(x: number, y: number): number;
  copaAlta(x: number, y: number): number;
  /** 02_mundo: lo que reescriben 09_camara (kcor) y 10_ndvi (tinte, ndviIdx): primitivas del legado, así que se leen en cada uso */
  kcor(): number;
  tinte(): boolean;
  ndviIdx(): number;
  /** 02_mundo: el color corregido de la ortofoto y el tono NDVI de un punto */
  aviva(c3: number[], x: number, y: number): void;
  colorEn(x: number, y: number, h: number, out: number[]): void;
  /** 04d: el ruido de [0, 1) por índice */
  hash(i: number): number;
  /** 15_tiempo: el parche de la luz (nubes, helada) para el material */
  parcheTiempo(sh: unknown, viento: boolean): void;
  ColaExt: ColaNube;
  Materiales: Materiales;
  Estaticos: { congela(o: unknown, ...resto: unknown[]): void };
  scene: { add(o: unknown): void; remove(o: unknown): void };
  camera: { position: { x: number; y: number; z: number } };
  /** exag (que cambia) y el modo de vista («nube», «gem», «orto») */
  Estado: { exag: number; modo: string };
}

export function creaNube(d: DepsNube) {
  const THREE = d.THREE, Mundo = d.Mundo, ColaExt = d.ColaExt, Estado = d.Estado, Estaticos = d.Estaticos;
  d.Materiales.define(MATERIAL_NUBE, DEF_NUBE);
  const materiales = d.Materiales.de(ID_NUBE);   // lo que cree este componente se libera con su libera()
  // «maestro»: el ciclo del día le pone el color; los niveles comparten ese color. Nunca se dibuja: solo lleva el color y el parche de 15_tiempo (conTiempo)
  const nubeMat: T3 = new THREE.PointsMaterial({ size: 0.6, sizeAttenuation: true, vertexColors: true });
  let matsNube: T3[] = [];
  const nube: T3 = { material: nubeMat, g: new THREE.Group(), set visible(v: unknown) { this.g.visible = !!v; }, get visible() { return this.g.visible; } };
  let montado = false, claveColorNube = "", tNubeLod = 0, tFuera = 0, escala = 1, total = 0;

  function creaMats(): T3[] {
    return NIV_NUBE.map(function (nv) {
      return materiales.crea(MATERIAL_NUBE, { size: Math.min(3, 0.6 / Math.sqrt(nv.f)), color: nubeMat.color, parche: function (sh: unknown) { d.parcheTiempo(sh, false); } } as OpcNube) as T3;
    });
  }
  /** pone la nube en la escena (y los materiales de los niveles, si se soltaron); idempotente. El componente lo llama al montarse. */
  function monta(): void {
    if (montado) return;
    if (!matsNube.length) matsNube = creaMats();
    Estaticos.congela(nube.g); d.scene.add(nube.g);   // AG-1.15: el grupo no se mueve; cada tesela se congela al crearla
    montado = true;
  }

  function colorPunto(x: number, y: number, h: number, bajo: number, i: number, out: number[]): void {   // el color de un punto: tronco bajo la copa, o la ortofoto corregida por altura
    if (bajo) { const t = 0.30 + 0.12 * d.hash(i); out[0] = 0.40 * t * 2; out[1] = 0.31 * t * 2; out[2] = 0.22 * t * 2; return; }
    d.colorEn(x, y, h, out); d.aviva(out, x, y); const sh = 0.82 + 0.22 * Math.min(1, h / 4); out[0]! *= sh; out[1]! *= sh; out[2]! *= sh;
  }
  function* pintaTeselaNubeG(t: T3): Generator<unknown, void, unknown> {
    const n = t.nubeN, C = t.nubeCol, c3 = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      colorPunto(t.nubeX[i], t.nubeY[i], t.nubeH[i] / 30, t.nubeB[i], i, c3);
      C[i * 3] = Math.min(255, c3[0]! * 255); C[i * 3 + 1] = Math.min(255, c3[1]! * 255); C[i * 3 + 2] = Math.min(255, c3[2]! * 255);
      if (i % 12000 === 11999) yield;
    }
    if (t.nubeMalla) t.nubeMalla.geometry.attributes.color.needsUpdate = true;
    t.nubeSucia = false;
  }
  function* montaNubeG(t: T3): Generator<unknown, T3, unknown> {   // prepara los puntos de una tesela (filtra, cuantiza, colorea) y devuelve su malla
    const P = t.pts, n0 = P ? P.length / 3 : 0; if (!n0) return null;
    yield* Mundo.aseguraOrto(t);
    const X = new Float32Array(n0), Y = new Float32Array(n0), Z = new Float32Array(n0), H = new Uint8Array(n0), B = new Uint8Array(n0);
    let n = 0, zmin = 1e9, zmax = -1e9;
    for (let q = 0; q < n0; q++) {
      const px = t.ox + P[q * 3] / 100, py = t.oy + P[q * 3 + 1] / 100, pz = P[q * 3 + 2] / 100, h = pz - d.suelo(px, py);
      if (q % 20000 === 19999) yield;
      if (h > ALTO_MAX) continue;
      X[n] = px; Y[n] = py; Z[n] = pz; H[n] = Math.max(0, Math.min(255, Math.round(h * 30))); B[n] = (h < 2.0 && d.copaAlta(px, py) > 2.6) ? 1 : 0;
      if (pz < zmin) zmin = pz; if (pz > zmax) zmax = pz; n++;
    }
    if (!n) return null;
    const hx = Mundo.TS / 2 + 2, cxm = t.ox + Mundo.TS / 2, cym = t.oy + Mundo.TS / 2, zc = (zmin + zmax) / 2, hz = (zmax - zmin) / 2 + 0.5;
    const Q = new Int16Array(n * 3), C = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) { Q[i * 3] = Math.round((X[i]! - cxm) / hx * 32767); Q[i * 3 + 1] = Math.round((Z[i]! - zc) / hz * 32767); Q[i * 3 + 2] = Math.round((-Y[i]! + cym) / hx * 32767); if (i % 40000 === 39999) yield; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(Q, 3, true)); g.setAttribute("color", new THREE.BufferAttribute(C, 3, true));
    const m = new THREE.Points(g, matsNube[0]); m.userData = { zc: zc, hz: hz }; m.position.set(cxm, zc * Estado.exag, -cym); m.scale.set(hx, hz * Estado.exag, hx); m.visible = false; Estaticos.congela(m);   // AG-1.15: se recoloca en exagNube()
    if (matsNube[0].isNodeMaterial) espejoSprites(THREE, m);   // A4-0: con la TSL (MU6), la malla se dibuja con su espejo de sprites (puntos-tsl.ts)
    t.nubeX = X.subarray(0, n); t.nubeY = Y.subarray(0, n); t.nubeH = H.subarray(0, n); t.nubeB = B.subarray(0, n); t.nubeCol = C; t.nubeN = n; t.nubeMalla = m; t.nubeNivel = -1; t.nubeDibuja = 0;
    yield* pintaTeselaNubeG(t);
    return m;
  }
  /** suelta la malla de una tesela y sus copias de CPU, y cancela lo que la Cola tuviera pendiente de ella */
  function liberaNube(t: T3): void {
    ColaExt.cancela("N" + t.key); ColaExt.cancela("NP" + t.key);
    if (t.nubeMalla) { nube.g.remove(t.nubeMalla); t.nubeMalla.geometry.dispose(); }
    t.nubeMalla = null; t.nubeX = t.nubeY = t.nubeH = t.nubeB = t.nubeCol = null; t.nubeN = 0; t.nubeEst = 0; t.nubeDibuja = 0; t.nubeNivel = -1; t.nubeSucia = false;
  }
  function exagNube(): void { Mundo.lista.forEach(function (t) { const m = t.nubeMalla; if (m) { m.position.y = m.userData.zc * Estado.exag; m.scale.y = m.userData.hz * Estado.exag; Estaticos.congela(m); } }); }
  function pintaNube(): void {   // se llama desde aplica(): solo repinta si cambió lo que influye en el color (corrección de la ortofoto, tinte NDVI y su fecha)
    exagNube();
    const clave = d.kcor() + "|" + d.tinte() + "|" + (d.tinte() ? d.ndviIdx() : 0);
    if (clave !== claveColorNube) { claveColorNube = clave; Mundo.lista.forEach(function (t) { if (t.nubeMalla) t.nubeSucia = true; }); }
  }
  /** suelta todas las mallas (fuera del modo nube, o al liberar el componente) */
  function liberaTodas(): void { Mundo.lista.forEach(liberaNube); escala = 1; total = 0; }

  function actualizaNubeTeselas(cx: number, cy: number, cz: number): void {   // nivel de detalle por distancia; las teselas lejanas no tienen malla; lo pesado va a la cola
    if (!montado || Estado.modo !== "nube") return;   // L1-01: fuera del modo nube no se encarga nada (las que haya se sueltan en actualizaNube, pasados SUELTA_FUERA_S)
    const activas: T3[] = [];
    Mundo.lista.forEach(function (t) {
      if (!t.np || !t.pts) return;   // sin puntos (o aún sin llegar) no hay nube
      const dist = Mundo.dist(t, cx, cy, cz), niv = NubePuro.nivel(dist);
      if (dist > LIBERA_NUBE_M) { liberaNube(t); return; }   // L2-02: más lejos de lo que el Mundo carga (con histéresis): se suelta
      if (niv < 0) { if (t.nubeMalla) t.nubeMalla.visible = false; return; }
      if (!t.nubeMalla) {
        if (!t.nubeEst && dist <= CARGA_NUBE_M) { t.nubeEst = 1; ColaExt.pon("N" + t.key, dist, montaNubeG(t), function (m) { if (m && t.nubeEst === 1) { nube.g.add(m); t.nubeEst = 2; } else if (!m) t.nubeEst = 3; }); }
        return;
      }
      if (t.nubeEst !== 2) return;
      if (t.nubeSucia && !ColaExt.hay("NP" + t.key)) ColaExt.pon("NP" + t.key, dist, pintaTeselaNubeG(t));
      t.nubeMalla.visible = true;
      if (niv !== t.nubeNivel) { t.nubeNivel = niv; t.nubeMalla.material = matsNube[niv]; }
      activas.push(t);
    });
    // L1-02: el presupuesto de puntos se reparte entre todas las mallas a la vista, con los niveles de ESTA pasada; si cambia, se rehace el rango de cada una
    const r = NubePuro.reparte(activas.map(function (t) { return { n: t.nubeN, f: NIV_NUBE[t.nubeNivel]!.f }; }), PRESUPUESTO_NUBE);
    activas.forEach(function (t, i) { const c = r.conteo[i]!; if (t.nubeDibuja !== c) { t.nubeDibuja = c; t.nubeMalla.geometry.setDrawRange(0, c); } });
    escala = r.escala; total = r.total;
  }
  function actualizaNube(dt: number): void {
    tNubeLod += dt; if (tNubeLod < 0.2) return;
    const paso = tNubeLod; tNubeLod = 0;
    if (Estado.modo !== "nube") { tFuera += paso; if (tFuera >= SUELTA_FUERA_S) liberaTodas(); return; }   // L1-01 / L2-02
    tFuera = 0;
    actualizaNubeTeselas(d.camera.position.x, d.camera.position.y, d.camera.position.z);
  }
  /** lo que suelta el componente al apagarse: las mallas, los trabajos de la Cola, el grupo de la escena y los materiales */
  function libera(): void {
    liberaTodas();
    d.scene.remove(nube.g);
    materiales.libera(); matsNube = [];   // los de los niveles son de la fábrica (dueño «nube-lidar»); el maestro solo lleva el color y no se dibuja
    nubeMat.dispose();
    montado = false; tNubeLod = 0; tFuera = 0; claveColorNube = "";
  }
  /** cuántos puntos se dibujan ahora (lo que cuenta el presupuesto) y cuántas mallas hay montadas */
  function resumen(): { mallas: number; visibles: number; puntos: number; escala: number; total: number } {
    let mallas = 0, visibles = 0, puntos = 0;
    Mundo.lista.forEach(function (t) { const m = t.nubeMalla; if (!m) return; mallas++; if (m.visible) { visibles++; puntos += t.nubeDibuja || 0; } });
    return { mallas, visibles, puntos, escala, total };
  }

  monta();
  return { nube, ALTO_MAX, pintaNube, actualizaNubeTeselas, actualizaNube, monta, libera, resumen, materiales, matsNube: function () { return matsNube; } };
}
export type Nube = ReturnType<typeof creaNube>;

/** El manifiesto del componente «nube-lidar»: el ciclo de vida de la nube. El objeto que el motor usa (nube, pintaNube…) es el mismo que monta (lo crea el legado al
 *  cargarse: 08_marcadores, 10_ndvi y 15_tiempo lo nombran al cargarse, antes que los componentes). Se monta de nuevo (monta()) si el exterior se libera y vuelve a entrar. */
export function manifiestoNube(nube: Nube): Manifiesto {
  return {
    id: ID_NUBE, version: 1,
    consume: ["Mundo", "Materiales", "Estaticos", "ColaExt", "Estado", "parcheTiempo", "scene", "camera"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0 },   // solo ciclo de vida: sus puntos (no triángulos) los cuenta pruebas/presupuesto.json («puntos»), con tope en PRESUPUESTO_NUBE
    mundos: ["exterior"],
    monta: function () { nube.monta(); return nube; },
    libera: function (api) { if (api) (api as Nube).libera(); }
  };
}

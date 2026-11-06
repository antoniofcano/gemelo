// El sombreado del relieve del exterior (F1d, T5; T8 fase 2: la única escena es la 3D Tiles). MU5-n (A3-1a): antes apps/web/motor/04d_sombreado_tiles.js,
// que queda como extracción parcial (crea los «maestros» matSuelo y matOrto, que leen por su nombre 15_tiempo, 04e, 14 y otros, y llama a estas fábricas).
// Es del exterior: vive en mundos/exterior/ (MUNDOS §1).
// Cada glb del tileset trae su terreno con un material PBR y la ortofoto como baseColorTexture. Al cargarse (evento load-model de 04b_escena3d.js)
// ese material se cambia por un Lambert con el parche de aquí, así que el color (ADR-0016: texturas sin convertir, a lineal al entrar en la luz),
// la hierba según el NDVI, la capa NDVI con su escala relativa, la escarcha, la sombra de nubes, el detalle del suelo abierto (rodadas, caminos),
// el relieve fino (uBumpK, que la VR apaga) y los modos Ortofoto / NDVI salen de los uniformes compartidos (UN, uSombra). Del glb:
//   - la posición en el mundo sale de modelMatrix (la exageración vertical la pone la matriz del grupo, no el sombreador) y la sombra de nubes
//     se calcula con ella;
//   - la ortofoto es la del propio glb (ya está en la tarjeta gráfica), con sus coordenadas sacadas de la caja de la tesela (el norte arriba de la
//     imagen, como la escribe tuberia/tiles3d/genera.mjs);
//   - el color de la tierra, el ruido y el «color ancho» del suelo abierto son los de la tesela del Mundo (256 m) que contiene el glb: salen del
//     json de siempre (decisión 38), nunca del glb. Un glb mayor que una tesela (512 m, solo de lejos) pinta la tierra con el mosaico de 1 m y
//     sin detalle.
// Sin tileset no crea nada (04b no lo llama). Por fotograma: nada; cada 0,2 s, un recorrido de los glb vivos (encender o apagar el detalle).
//
// Lo nuevo al pasar a TypeScript:
//   · L2-05 (lente 2): libera() suelta también las texturas de cada tesela del Mundo (texSue, rui, texG), la de ruido neutro (RUI0) y quita t.uni; antes
//     solo los materiales de los glb vivos y el mosaico. Y cuando el Mundo suelta una tesela (alSoltar, L2-03), sus texturas se sueltan y sus uniformes
//     vuelven a los neutros (el mosaico y el ruido de 1 píxel), por si un glb vivo los sigue leyendo; al volver sus datos se rehacen (prepara).
//   · Es un componente (ADR-0023) del exterior: componente es su manifiesto (id «terreno-sombreado», mundos: ["exterior"]), que registra 90_final.js;
//     su libera() es el de aquí.
// Nada de aquí importa three ni lee globales al cargarse: THREE, D, el Mundo, la Cola del exterior, la cámara, el parche del tiempo (15_tiempo), el
// ruido vn2 (21_suelo) y el suelo de fotos (04f, que se monta después: por eso va por funciones) entran por argumento.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { CtxTsl, DefMaterial, MaterialMin } from "../../nucleo/materiales.ts";
import type { Trabajo } from "../../nucleo/cola.ts";
import type { Tesela } from "./teselas.ts";

// ---------------------------------------------------------------- tipos mínimos (three no trae tipos en el repo)
/** Lo que se usa de una textura de three. */
export interface TexturaMin {
  image?: unknown;
  magFilter?: number; minFilter?: number; generateMipmaps?: boolean; needsUpdate?: boolean; anisotropy?: number; colorSpace?: string;
  dispose(): void;
}
/** Lo que se usa de un material de three. */
export interface MaterialTerreno {
  color?: unknown; map?: TexturaMin | null;
  onBeforeCompile?: ((sh: unknown, r?: unknown) => void) | undefined;
  customProgramCacheKey?: (() => string) | undefined;
  dispose(): void;
}
/** Lo que se usa de THREE (el del motor: three o super-three). */
export interface ThreeTerreno {
  Vector2: new (x: number, y: number) => unknown;
  Vector4: new (x: number, y: number, z: number, w: number) => { toArray?(): number[] };
  DataTexture: new (d: Uint8Array, w: number, h: number, formato: unknown, tipo: unknown) => TexturaMin;
  Texture: new (img: unknown) => TexturaMin;
  RGBAFormat: unknown; UnsignedByteType: unknown; LinearFilter: number; NoColorSpace: string;
}
/** Un uniforme de three ({ value }). */
export interface Uniforme<T = unknown> { value: T }
/** Los uniformes compartidos por todo el relieve (y por quien sigue la exageración: 08, 14, 15...). */
export interface UniformesTerreno {
  uExag: Uniforme<number>; uModoOrto: Uniforme<number>; uHierba: Uniforme<number>; uNdviOn: Uniforme<number>; uNdviMap: Uniforme<unknown>; uG: Uniforme<unknown>;
  uGBox: Uniforme<unknown>; uOrtoTint: Uniforme<unknown>; uDetK: Uniforme<number>; uBumpK: Uniforme<number>; uDetDbg: Uniforme<number>; uBias2: Uniforme<number>;
  uMos: Uniforme<TexturaMin | null>; uMosBox: Uniforme<unknown>;
  [k: string]: Uniforme;
}
/** Lo que el sombreador recibe de onBeforeCompile. */
export interface Sombreador { vertexShader: string; fragmentShader: string; uniforms: Record<string, unknown> }
/** Lo que se usa del suelo de fotos (04f_suelo_fotos.js: SueloFotos y SueloFotosPuro). */
export interface SueloFotosMin {
  activo: boolean; U: { uFot: Uniforme; uFotK: Uniforme };
  campo(t: Tesela): TexturaMin; rueNeutro(): TexturaMin; actualiza(): void; libera(): void;
}
export interface SueloFotosPuroMin { parcheGlsl(cab: string, color: string, TS: number): { cab: string; color: string } }
/** Una malla de three (lo que se recorre de un glb). */
interface MallaMin { isMesh?: boolean; isInstancedMesh?: boolean; material?: MaterialTerreno | null }
export interface RaizGlb { traverse(f: (o: MallaMin) => void): void }
export interface TileGlb { boundingVolume?: { box?: number[] } }
type Cola = { pon(clave: string, prio: number, trabajo: Trabajo, fin?: (v: unknown) => void): boolean; cancela(clave: string): void };
/** Lo que se usa del Mundo (teselas.ts). */
export interface MundoTerreno {
  TS: number; N2: number; NS2: number; SRS: number; lista: readonly Tesela[]; mosaico: { img: unknown };
  tesela(x: number, y: number): Tesela | null; dist(t: Tesela, x: number, y: number, z: number): number; decodificaOrto(t: Tesela): Uint8ClampedArray;
  alSoltar?(f: (t: Tesela) => void): void;
}

/** Los nodos de TSL (three/tsl, que entra por la fábrica en MU6): three no trae tipos en el repo y el grafo de nodos no se puede tipar con tipos mínimos
 *  sin reescribir medio TSL, así que aquí van sin tipo (solo en la variante TSL, apagada). */
type TslNodo = any;
type TslMin = any;

/** El hash de siempre (fract(sin(n·127,1)·43758,5453)): lo usan también 05, 06, 07, 15, 18, 21 y 25. */
export function hash(n: number): number { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

export interface DepsUniformes {
  THREE: Pick<ThreeTerreno, "Vector4">;
  D: { ts: number; orto_px?: number; mosaico: { x0: number; yN: number; w: number; h: number; res: number } };
  /** 01_datos: la caja de la finca */
  x0: number; yN: number; ANCHO: number; ALTO: number;
  /** el color del «maestro» de la ortofoto (matOrto.color): el modo Ortofoto lo tiñe con él */
  tinteOrto: unknown;
}
/** Los uniformes compartidos por todo el relieve (UN): los mismos objetos para todos los glb y para quien los sigue (08, 14, 15...). */
export function uniformesTerreno(d: DepsUniformes): UniformesTerreno {
  const D = d.D, THREE = d.THREE;
  return {
    uExag: { value: 1 }, uModoOrto: { value: 0 }, uHierba: { value: 1 }, uNdviOn: { value: 0 }, uNdviMap: { value: null }, uG: { value: null },
    uGBox: { value: new THREE.Vector4(d.x0, d.yN, d.ANCHO, d.ALTO) }, uOrtoTint: { value: d.tinteOrto }, uDetK: { value: 1 }, uBumpK: { value: 1 }, uDetDbg: { value: 0 }, uBias2: { value: Math.log(2 / (D.ts / (D.orto_px || 512))) / Math.LN2 }, uMos: { value: null }, uMosBox: { value: new THREE.Vector4(D.mosaico.x0, D.mosaico.yN, D.mosaico.w * D.mosaico.res, D.mosaico.h * D.mosaico.res) }
  };
}

export interface DepsTerreno {
  THREE: ThreeTerreno;
  /** 01_datos: RES */
  RES: number;
  mundo: MundoTerreno;
  /** 02_mundo: suelo (m, sin exagerar) */
  suelo(x: number, y: number): number;
  /** 02b_cola: ColaExt */
  cola: Cola;
  /** 03_escena: la cámara (su posición, para la prioridad y el detalle) */
  camara: { position: { x: number; y: number; z: number } };
  UN: UniformesTerreno;
  /** el maestro del suelo: el color (lluvia, luz) es uno solo para todo el relieve */
  matSuelo: { color: unknown };
  /** 15_tiempo: parcheTiempo(sh, viento), la sombra de nubes y la escarcha */
  parcheTiempo(sh: Sombreador, viento: boolean): void;
  /** A3-4: los mismos en TSL (tiempo-parche.ts: nodosTsl), para la variante apagada; 15_tiempo va después en el montaje: se piden al construirla */
  tiempoTsl?: (() => ((T: unknown) => { aplica(rgb: unknown, s: unknown): unknown; enVertice(n: unknown): unknown; sombra(xz: unknown): unknown }) | null) | null;
  /** 21_suelo: el ruido de valor de siempre (para que las matas caigan donde el suelo se pinta verde) */
  vn2(x: number, y: number): number;
  /** 04f: SueloFotos y SueloFotosPuro, que se montan después (por eso van por funciones) */
  sueloFotos?: (() => SueloFotosMin | null | undefined) | null;
  sueloFotosPuro?: (() => SueloFotosPuroMin | null | undefined) | null;
  /** performance.now */
  ahora(): number;
  /** MU5-n, segundo commit: la fábrica de materiales (02i: Materiales). Aquí se define «terreno» (su clásico, y su TSL en el tercer commit) y se pide con dueño */
  materiales: FabricaTerreno;
}
/** Lo que se usa de la fábrica (nucleo/materiales.ts): define y la vista con dueño. */
export interface FabricaTerreno {
  define<O>(nombre: string, def: DefMaterial<O>): void;
  de(dueno: string): { crea(nombre: string, opc?: unknown): MaterialMin; libera(): number };
}
/** El nombre del material del terreno en la fábrica (MATERIALES §1, fila 1) y el dueño de lo que pide este componente. */
export const TERRENO = "terreno", DUENO_TERRENO = "terreno-sombreado";
/** Lo que recibe la variante de «terreno»: los uniformes del glb (los suyos y los de su tesela del Mundo). */
export interface OpcTerreno { u: Record<string, Uniforme> }

export function creaSombreadoTiles(deps: DepsTerreno) {
  const THREE = deps.THREE, Mundo = deps.mundo, RES = deps.RES, suelo = deps.suelo, ColaExt = deps.cola, camera = deps.camara, UN = deps.UN, matSuelo = deps.matSuelo, vn2 = deps.vn2;
  const TS = Mundo.TS, N2 = Mundo.N2, NS2 = Mundo.NS2, SRS = Mundo.SRS, U1 = 800;   // U1: hasta dónde (m) se enciende el detalle del suelo abierto
  let vivos: Array<{ raiz: RaizGlb; m: MaterialTerreno; u: Record<string, Uniforme>; mt: Tesela | null }> = [], mos: TexturaMin | null = null, tUlt = -1e9;
  const S0 = 0.17, V0 = 0.62;   // suelo desnudo / hierba tupida, en NDVI de suelo (ver el bloque del suelo)
  /** el suelo de fotos (04f), solo si está activo (?suelo=fotos): sin la bandera 04d no cambia ni una letra de su sombreador */
  function fotos(): SueloFotosMin | null { const s = deps.sueloFotos ? deps.sueloFotos() : null; return s && s.activo ? s : null; }

  // ---- texturas de una tesela del Mundo. Mientras sus datos no han llegado el color del suelo sale del mosaico de 1 m y el ruido es uno neutro de 1 píxel
  let RUI0: TexturaMin | null = null;
  function ruidoNeutro(): TexturaMin { if (!RUI0) { const d = new Uint8Array([143, 128, 128, 255]); RUI0 = new THREE.DataTexture(d, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType); RUI0.needsUpdate = true; } return RUI0; }
  function texturas(t: Tesela): void {
    const uni: Record<string, Uniforme> = { uTile: { value: new THREE.Vector2(t.ox, t.oy) }, uSue: { value: null }, uRui: { value: ruidoNeutro() }, uGnd: { value: ruidoNeutro() }, uTiene: { value: 0 } };
    t["uni"] = uni;
    const SF = fotos(); if (SF) uni["uRue"] = { value: SF.campo(t) };   // EV-1s (?suelo=fotos): el campo del ruedo de la tesela, de las copas (04f)
    if (t.suel) texturasReales(t);
  }
  function texturasReales(t: Tesela): void {   // el color del suelo de la tesela es inmediato; el ruido estático (66.000 evaluaciones) se calcula a rebanadas en la cola
    const u = t["uni"] as Record<string, Uniforme>, sr = t.suel as Uint8Array, n4 = NS2 * NS2, s4 = new Uint8Array(n4 * 4);   // RGBFormat ya no existe (r137): el color del suelo (RGB) se sube como RGBA
    for (let q = 0; q < n4; q++) { s4[q * 4] = sr[q * 3] as number; s4[q * 4 + 1] = sr[q * 3 + 1] as number; s4[q * 4 + 2] = sr[q * 3 + 2] as number; s4[q * 4 + 3] = 255; }
    const ts = new THREE.DataTexture(s4, NS2, NS2, THREE.RGBAFormat, THREE.UnsignedByteType);
    ts.magFilter = ts.minFilter = THREE.LinearFilter; ts.generateMipmaps = false; ts.needsUpdate = true; (u["uSue"] as Uniforme).value = ts; t["texSue"] = ts; (u["uTiene"] as Uniforme).value = 1;
    ColaExt.pon("R" + t.key, Mundo.dist(t, camera.position.x, camera.position.y, camera.position.z), ruidoG(t), function (tr) { (u["uRui"] as Uniforme).value = tr; t["rui"] = tr; });
  }
  // ---- el DETALLE DE LA ORTOFOTO en el suelo abierto (rodadas, caminos, calveros). El color del suelo que viaja con la tesela está a 2 m y suavizado (ver el exportador), así que las rodadas de 0,3-0,5 m
  // no existen en él. Aquí se prepara por tesela, una sola vez y a rebanadas, el color «ancho» del suelo ABIERTO (128×128 a 2 m): la ortofoto sin copas ni sombras. Qué es copa o sombra
  // se decide con la propia ortofoto (un píxel mucho más oscuro que el suelo de su entorno), no con el LiDAR: el LiDAR no cubre lo que queda fuera de las parcelas y las copas corridas por la altura no coinciden con la ortofoto.
  // El sombreador compara la ortofoto con esa referencia: lo que la iguala es suelo abierto y se le aplica la diferencia relativa (rodadas, caminos); lo que es mucho más oscuro es copa o sombra y se deja como estaba.
  function* detalleG(t: Tesela): Generator<unknown, TexturaMin | null, unknown> {
    if (!t.ortImg || !t.ortImg.naturalWidth) return null;
    const px = t.ortPix || Mundo.decodificaOrto(t); yield;
    const W = t.ortW, H = t.ortH, GN = 128, sc = TS / GN, lum = new Uint8Array(W * H), B = 16, nbx = Math.ceil(W / B), nby = Math.ceil(H / B), hist = new Uint16Array(nbx * nby * 64);
    let S: Float32Array = new Float32Array(GN * GN * 4), row: number, col: number;
    for (row = 0; row < H; row++) {   // claridad de cada píxel y su histograma por bloque de 16 px (8 m)
      for (col = 0; col < W; col++) { const o0 = (row * W + col) * 4, l = ((px[o0] as number) * 77 + (px[o0 + 1] as number) * 150 + (px[o0 + 2] as number) * 29) >> 8; lum[row * W + col] = l; const hk = ((row / B | 0) * nbx + (col / B | 0)) * 64 + (l >> 2); hist[hk] = (hist[hk] as number) + 1; }
      if (row % 16 === 15) yield;
    }
    const ref = new Float32Array(nbx * nby);   // claridad del suelo de cada bloque = su percentil 80 (los árboles son oscuros; el suelo claro domina)
    let bx: number, by: number, k: number;
    for (by = 0; by < nby; by++) for (bx = 0; bx < nbx; bx++) {
      const h0 = (by * nbx + bx) * 64; let n = 0, acc = 0; for (k = 0; k < 64; k++) n += hist[h0 + k] as number;
      for (k = 0; k < 64; k++) { acc += hist[h0 + k] as number; if (acc >= 0.8 * n) break; } ref[by * nbx + bx] = k * 4 + 2;
    }
    const osc = new Uint8Array(W * H);   // 1 = copa o sombra: claridad < 0,78 de la del suelo de su entorno (referencia interpolada entre bloques)
    for (row = 0; row < H; row++) {
      const fy = Math.max(0, Math.min(nby - 1.001, (row + 0.5) / B - 0.5)), jy = fy | 0, ty = fy - jy;
      for (col = 0; col < W; col++) {
        const fx = Math.max(0, Math.min(nbx - 1.001, (col + 0.5) / B - 0.5)), jx = fx | 0, tx = fx - jx, r2 = ((ref[jy * nbx + jx] as number) * (1 - tx) + (ref[jy * nbx + jx + 1] as number) * tx) * (1 - ty) + ((ref[(jy + 1) * nbx + jx] as number) * (1 - tx) + (ref[(jy + 1) * nbx + jx + 1] as number) * tx) * ty;
        osc[row * W + col] = (lum[row * W + col] as number) < 0.78 * r2 ? 1 : 0;
      }
      if (row % 16 === 15) yield;
    }
    const dil = new Uint8Array(W * H), R = 2;   // la penumbra: dilatación de 2 píxeles (1 m), separable
    for (row = 0; row < H; row++) { for (col = 0; col < W; col++) { let m1 = 0; for (let d1 = -R; d1 <= R; d1++) { const c1 = col + d1; if (c1 >= 0 && c1 < W && osc[row * W + c1]) { m1 = 1; break; } } dil[row * W + col] = m1; } if (row % 16 === 15) yield; }
    for (col = 0; col < W; col++) { for (row = 0; row < H; row++) { if (osc[row * W + col]) continue; let m2 = 0; for (let d2 = -R; d2 <= R; d2++) { const r1 = row + d2; if (r1 >= 0 && r1 < H && dil[r1 * W + col]) { m2 = 1; break; } } osc[row * W + col] = (dil[row * W + col] as number) | m2; } if (col % 16 === 15) yield; }
    for (row = 0; row < H; row++) {   // suma del color del suelo abierto en celdas de 2 m
      const yy = TS - (row + 0.5) / H * TS, gj = Math.min(GN - 1, Math.floor(yy / sc));
      for (col = 0; col < W; col++) {
        if (osc[row * W + col]) continue;
        const xx = (col + 0.5) / W * TS, gi = Math.min(GN - 1, Math.floor(xx / sc)), o = (row * W + col) * 4, q = (gj * GN + gi) * 4;
        S[q] = (S[q] as number) + (px[o] as number); S[q + 1] = (S[q + 1] as number) + (px[o + 1] as number); S[q + 2] = (S[q + 2] as number) + (px[o + 2] as number); S[q + 3] = (S[q + 3] as number) + 1;
      }
      if (row % 16 === 15) yield;
    }
    function desenfoca(A: Float32Array): Float32Array { const Bf: Float32Array = new Float32Array(A.length); for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a < 0 || a >= GN || b < 0 || b >= GN) continue; const o = (b * GN + a) * 4, q = (j * GN + i) * 4; Bf[q] = (Bf[q] as number) + (A[o] as number); Bf[q + 1] = (Bf[q + 1] as number) + (A[o + 1] as number); Bf[q + 2] = (Bf[q + 2] as number) + (A[o + 2] as number); Bf[q + 3] = (Bf[q + 3] as number) + (A[o + 3] as number); } } return Bf; }
    S = desenfoca(S); yield; S = desenfoca(S); yield;
    const out = new Uint8Array(GN * GN * 4), minW = 8.0;   // cada celda de 2 m tiene 16 píxeles (4×4): menos de 8 de suelo abierto tras el desenfoque = olivar cerrado
    let pas: number, i2: number, j2: number;
    for (pas = 0; pas < 8; pas++) {   // donde casi no quedó suelo abierto se rellena con el promedio de los vecinos ya rellenos
      let faltan = 0;
      for (j2 = 0; j2 < GN; j2++) for (i2 = 0; i2 < GN; i2++) {
        const q2 = (j2 * GN + i2) * 4; if ((S[q2 + 3] as number) >= minW) continue; faltan++;
        let rr = 0, gg = 0, bb2 = 0, c = 0; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a = i2 + di, b3 = j2 + dj; if (a < 0 || a >= GN || b3 < 0 || b3 >= GN) continue; const o2 = (b3 * GN + a) * 4, w3 = S[o2 + 3] as number; if (w3 >= minW) { rr += (S[o2] as number) / w3; gg += (S[o2 + 1] as number) / w3; bb2 += (S[o2 + 2] as number) / w3; c++; } }
        if (c) { S[q2] = rr / c * minW; S[q2 + 1] = gg / c * minW; S[q2 + 2] = bb2 / c * minW; S[q2 + 3] = minW; }
      }
      if (!faltan) break;
      yield;
    }
    for (j2 = 0; j2 < GN * GN; j2++) { const w2 = (S[j2 * 4 + 3] as number) || 1; out[j2 * 4] = Math.min(255, (S[j2 * 4] as number) / w2); out[j2 * 4 + 1] = Math.min(255, (S[j2 * 4 + 1] as number) / w2); out[j2 * 4 + 2] = Math.min(255, (S[j2 * 4 + 2] as number) / w2); out[j2 * 4 + 3] = 255; }
    const tg = new THREE.DataTexture(out, GN, GN, THREE.RGBAFormat, THREE.UnsignedByteType); tg.magFilter = tg.minFilter = THREE.LinearFilter; tg.generateMipmaps = false; tg.needsUpdate = true;
    return tg;
  }
  function pideDetalle(t: Tesela): void {   // la primera vez que una tesela se ve de cerca: se pide a la cola su color ancho
    if (t["detPedido"] || !t.suel || !t.ortImg || !t.ortImg.naturalWidth) return; t["detPedido"] = true;
    ColaExt.pon("D" + t.key, Mundo.dist(t, camera.position.x, camera.position.y, camera.position.z), detalleG(t), function (tg) { if (!tg) { t["detPedido"] = false; return; } t["texG"] = tg; ((t["uni"] as Record<string, Uniforme>)["uGnd"] as Uniforme).value = tg; t["detListo"] = true; });
  }
  function* ruidoG(t: Tesela): Generator<unknown, TexturaMin, unknown> {   // cobertura aleatoria, motas y jitter: las mismas funciones que usa cubierta() en la CPU, para que las matas caigan donde el suelo se pinta verde
    const n2 = N2, rd = new Uint8Array(n2 * n2 * 4);
    let o = 0;
    for (let j = 0; j < n2; j++) {
      for (let i = 0; i < n2; i++) {
        const x = t.ox + (i - 0.5) * RES, y = t.oy + (j - 0.5) * RES;
        const r = 0.55 + 0.9 * vn2(x * 0.33, y * 0.33) * 0.6 + 0.45 * vn2(x * 1.7 + 9, y * 1.7), nn = 0.82 + 0.3 * vn2(x * 0.9, y * 0.9);
        rd[o++] = Math.min(255, Math.round(r / 1.6 * 255)); rd[o++] = Math.round((nn - 0.8) / 0.4 * 255); rd[o++] = Math.round(hash(i * 31 + j * 17 + t.kx * 7) * 255); rd[o++] = 255;
      }
      if (j % 10 === 9) yield;
    }
    const tr = new THREE.DataTexture(rd, n2, n2, THREE.RGBAFormat, THREE.UnsignedByteType); tr.magFilter = tr.minFilter = THREE.LinearFilter; tr.generateMipmaps = false; tr.needsUpdate = true; return tr;
  }
  // las texturas de una tesela del Mundo (su detalle se pide con pideDetalle); cuando llegan sus datos, las reales y la cota de su centro
  function prepara(t: Tesela): Record<string, Uniforme> {
    if (!t["uni"]) texturas(t); else if (t.suel && !t["texSue"]) { texturasReales(t); t.hc = undefined; }
    if (t.hc === undefined) t.hc = suelo(((t.v[0] as number) + (t.v[2] as number)) / 2, ((t.v[1] as number) + (t.v[3] as number)) / 2);
    return t["uni"] as Record<string, Uniforme>;
  }
  // L2-05 / L2-03: suelta las texturas de una tesela del Mundo (y cancela su ruido y su detalle en la Cola). Con quita, también t.uni (libera); sin él, sus
  // uniformes vuelven a los neutros, porque un glb vivo puede seguir leyéndolos (el Mundo soltó sus datos: se pinta con el mosaico hasta que vuelvan)
  function sueltaTexturas(t: Tesela, quita: boolean): void {
    ColaExt.cancela("R" + t.key); ColaExt.cancela("D" + t.key);
    for (const k of ["texSue", "rui", "texG"]) { const x = t[k] as TexturaMin | null | undefined; if (x && x !== RUI0) x.dispose(); t[k] = null; }
    t["detPedido"] = false; t["detListo"] = false;
    const u = t["uni"] as Record<string, Uniforme> | undefined;
    if (!u) return;
    if (quita) { t["uni"] = undefined; return; }
    (u["uSue"] as Uniforme).value = null; (u["uTiene"] as Uniforme).value = 0; (u["uRui"] as Uniforme).value = ruidoNeutro(); (u["uGnd"] as Uniforme).value = ruidoNeutro();
  }
  if (Mundo.alSoltar) Mundo.alSoltar(function (t) { sueltaTexturas(t, false); });

  // ---- el parche del sombreador (Lambert). La posición en el mundo sale de modelMatrix (la exageración la trae la matriz del grupo: aquí se
  // deshace para muestrear) y la ortofoto, con las coordenadas de la caja del glb (uCua)
  // uvO: la ortofoto del glb (su caja; el norte arriba de la imagen). uvG: lo que es de la tesela del Mundo (256 m, filas de sur a norte), como el
  // color ancho uGnd: con las coordenadas de la tesela (lc), nunca con las del glb (en una hoja de 128 m no casaría la escala y el norte iría al revés)
  const OP = { cab: "uniform vec4 uCua;\n", uvO: "vec2((vWP.x - uCua.x) / uCua.z, 1.0 - (-vWP.z - uCua.y) / uCua.z)", uvG: "lc / " + TS.toFixed(1), dg: "3.0 / uCua.z", dy: "vec2(0.0, -dg)" };
  function parche(sh: Sombreador, uni: Record<string, Uniforme>): void {
    deps.parcheTiempo(sh, false);   // sombra de nubes y escarcha (bloque del tiempo)
    const u = sh.uniforms; Object.keys(UN).forEach(function (k) { u[k] = UN[k]; }); Object.keys(uni).forEach(function (k) { u[k] = uni[k]; });
    const SF = fotos(); if (SF) { u["uFot"] = SF.U.uFot; u["uFotK"] = SF.U.uFotK; }
    const vs = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uExag; varying vec3 vWP; varying vec3 vVPz;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWP.y /= uExag;").replace("ot_sombra(position.xz)", "ot_sombra(vWP.xz)");
    sh.vertexShader = vs.replace("#include <project_vertex>", "#include <project_vertex>\n vVPz = -mvPosition.xyz;");
    let cab = OP.cab + "uniform vec2 uTile; uniform sampler2D uSue; uniform sampler2D uRui; uniform sampler2D uOrt; uniform sampler2D uGnd; uniform float uDet; uniform float uDetK; uniform float uBumpK; uniform float uDetDbg; uniform float uBias2; uniform float uTiene; uniform sampler2D uMos; uniform vec4 uMosBox; uniform float uModoOrto; uniform float uHierba; uniform sampler2D uG; uniform vec4 uGBox; uniform sampler2D uNdviMap; uniform float uNdviOn; uniform vec3 uOrtoTint; varying vec3 vWP;\n" +
      "float dh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 17391.7); }\nfloat dn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(dh(i), dh(i + vec2(1.0, 0.0)), f.x), mix(dh(i + vec2(0.0, 1.0)), dh(i + vec2(1.0, 1.0)), f.x), f.y); }\n" +
      "float hSuelo = 0.0;\n" +
      "vec3 pBump(vec3 vp, vec3 n, vec2 dH){ vec3 s1 = dFdx(vp), s2 = dFdy(vp), r1 = cross(s2, n), r2 = cross(n, s1); float d = dot(s1, r1); vec3 g = sign(d) * (dH.x * r1 + dH.y * r2); return normalize(abs(d) * n - g); }\n";
    let color =
      "vec2 lc = vec2(vWP.x - uTile.x, -vWP.z - uTile.y);\n" +
      "vec3 sc = uTiene > 0.5 ? texture2D(uSue, (lc / " + SRS.toFixed(1) + " + 1.0) / " + NS2.toFixed(1) + ").rgb : texture2D(uMos, vec2((vWP.x - uMosBox.x) / uMosBox.z, 1.0 - (uMosBox.y + vWP.z) / uMosBox.w)).rgb * 0.9;\n" +
      "vec4 ru = texture2D(uRui, (lc + 1.0) / " + N2.toFixed(1) + ");\n" +
      // detalle de la ortofoto: cociente de claridad entre la ortofoto «nítida» y dos referencias (ella misma a ~2 m y el color ancho del suelo abierto, sin copas), solo donde el suelo está abierto
      "float abierto = 0.0, rodada = 1.0, tono = 1.0, desnudo = 0.0, camino = 0.0, coh = 0.0; vec2 dirT = vec2(1.0, 0.0);\n" +
      "float dc = length(vViewPosition), cerca = 1.0 - smoothstep(12.0, 60.0, dc), cercaM = 1.0 - smoothstep(3.0, 18.0, dc), cercaR = 1.0 - smoothstep(30.0, 110.0, dc);\n" +
      "if (uDet > 0.5) { vec2 uvO = " + OP.uvO + "; vec3 o0 = texture2D(uOrt, uvO).rgb, o2 = texture2D(uOrt, uvO, uBias2).rgb, o4 = texture2D(uOrt, uvO, uBias2 + 1.0).rgb, gw = texture2D(uGnd, " + OP.uvG + ").rgb; vec3 LM = vec3(0.299, 0.587, 0.114); sc = mix(sc, gw, 0.85);\n" +
      "  float l0 = dot(o0, LM) + 0.03, l2 = dot(o2, LM) + 0.03, l4 = dot(o4, LM) + 0.03, lw = dot(gw, LM) + 0.03; abierto = min(min(smoothstep(0.72, 0.86, l0 / lw), smoothstep(0.80, 0.93, l2 / lw)), smoothstep(0.86, 0.97, l4 / lw)) * uDetK;\n" +
      "  rodada = clamp(l0 / l2, 0.7, 1.5); tono = clamp(l2 / lw, 0.8, 1.8); desnudo = smoothstep(1.05, 1.3, tono) * abierto;\n" +
      // camino: suelo desnudo claro; su dirección sale del gradiente de claridad a ~4 m (4 muestras), solo donde hace falta
      "  camino = smoothstep(1.04, 1.22, tono) * abierto;\n" +
      "  if (camino > 0.02 && cercaR > 0.01) { float dg = " + OP.dg + "; float lx1 = dot(texture2D(uOrt, uvO + vec2(dg, 0.0), uBias2 + 1.0).rgb, LM), lx0 = dot(texture2D(uOrt, uvO - vec2(dg, 0.0), uBias2 + 1.0).rgb, LM), ly1 = dot(texture2D(uOrt, uvO + " + OP.dy + ", uBias2 + 1.0).rgb, LM), ly0 = dot(texture2D(uOrt, uvO - " + OP.dy + ", uBias2 + 1.0).rgb, LM); vec2 gg = vec2(lx1 - lx0, ly1 - ly0); float gl = length(gg); coh = smoothstep(0.004, 0.03, gl); dirT = gl > 1e-4 ? vec2(-gg.y, gg.x) / gl : vec2(1.0, 0.0); } }\n" +
      "float g = texture2D(uG, vec2((vWP.x - uGBox.x) / uGBox.z, (uGBox.y + vWP.z) / uGBox.w)).r * 1.3 - 0.3;\n" +
      "float cov = clamp(clamp((g - " + S0 + ") / " + (V0 - S0).toFixed(2) + ", 0.0, 1.0) * ru.r * 1.6, 0.0, 1.0), vig = clamp((g - 0.30) / 0.30, 0.0, 1.0), nn = 0.8 + ru.g * 0.4, m = cov * 0.78 * uHierba * (1.0 - 0.9 * desnudo);\n" +
      "vec3 gr = vec3(0.66 - 0.36 * vig, 0.58 - 0.10 * vig, 0.34 - 0.17 * vig) * nn * (0.82 + 0.36 * dn(vec2(vWP.x * 14.0, vWP.z * 3.0) + vec2(dn(vWP.xz * 0.5) * 3.0, 0.0)) * (0.5 + 0.5 * cerca)) * (1.0 + 0.22 * (dn(vWP.xz * 0.6 + 4.0) - 0.5) * (1.0 - vig));\n" +
      "vec3 suelo = sc * (0.94 + ru.b * 0.1) * (1.0 - m) + gr * m;\n" +
      "float nM = dn(vWP.xz * 0.045), nm = dn(vWP.xz * 0.19 + 3.1), nf = dn(vWP.xz * 0.9 + 9.7), nu = dn(vWP.xz * 3.7 + 1.3), nuu = dn(vWP.xz * 13.0 + 5.9);\n" +
      // el detalle de la ortofoto: la rodada se refuerza en los caminos (la ortofoto la trae suave: está en el límite de resolución de 0,5 m)
      "suelo *= mix(1.0, clamp(pow(rodada, 1.15 + 2.4 * camino) * pow(tono, 0.9), 0.45, 1.9), abierto);\n" +
      // surcos de rodada sintéticos, orientados con el camino, con una fase que serpentea y se rompe (1,5 m entre surcos)
      "float aa = dot(lc, dirT), cc = dot(lc, vec2(-dirT.y, dirT.x)), ph = cc * 4.19 + 2.5 * dn(vec2(aa * 0.07, 1.7)) + 1.2 * dn(vec2(aa * 0.31, 8.1));\n" +
      "float gro = smoothstep(0.30, 0.92, cos(ph)) * (0.40 + 0.60 * dn(vec2(aa * 0.22, cc * 0.5))), ruts = gro * camino * coh * cercaR;\n" +
      "float estr = (dn(vec2(aa * 0.5, cc * 7.0)) - 0.5) * camino * cerca;\n" +
      "suelo *= (1.0 - 0.5 * ruts) * (1.0 + 0.55 * estr);\n" +
      // material de tierra: tinte cálido/frío a gran escala y luminancia en 4 octavas (la última solo cerca, para que no centellee a lo lejos)
      "suelo *= vec3(1.0 + 0.10 * (nM - 0.5) + 0.05 * (nm - 0.5), 1.0 + 0.03 * (nM - 0.5), 1.0 - 0.10 * (nM - 0.5) - 0.05 * (nm - 0.5)) * (0.86 + 0.28 * (nm * 0.5 + nf * 0.3 + nu * 0.2 * cerca + nuu * 0.1 * cercaM));\n" +
      // gravilla: granos claros y oscuros de ~10 cm en el suelo desnudo y los caminos, solo cerca
      "float grano = step(0.82, dh(floor(vWP.xz * 9.0))) * (dh(floor(vWP.xz * 9.0) + 3.3) - 0.35);\n" +
      "suelo *= 1.0 + grano * 0.55 * clamp(desnudo + camino + (1.0 - m) * 0.3, 0.0, 1.0) * cercaM;\n" +
      // hojarasca y suelo sombreado bajo los olivos (donde la ortofoto es copa o sombra)
      "float lit = (1.0 - abierto) * uDetK * step(0.5, uDet);\n" +
      "suelo = mix(suelo, vec3(0.30, 0.25, 0.18) * (0.72 + 0.55 * dn(vWP.xz * 5.0)) * (0.82 + 0.36 * nm), lit * 0.5 * (0.5 + 0.5 * cerca));\n" +
      "hSuelo = -0.055 * ruts + 0.014 * (nf - 0.5) * cerca + 0.007 * (nu - 0.5) * cercaM + 0.004 * grano * cercaM + 0.03 * (rodada - 1.0) * camino * cercaR;\n" +
      "diffuseColor.rgb *= sRGBTransferEOTF(vec4(max(suelo, vec3(0.0)), 1.0)).rgb;\n";   // todo lo de arriba son colores «como se ven» (las texturas van sin convertir): a lineal al entrar en la luz
    const SFP = SF && deps.sueloFotosPuro ? deps.sueloFotosPuro() : null;
    if (SF && SFP) { const pf = SFP.parcheGlsl(cab, color, TS); cab = pf.cab; color = pf.color; }   // EV-1s: solo con ?suelo=fotos
    const fin =
      "vec2 un = vec2((vWP.x - uGBox.x) / uGBox.z, 1.0 - (uGBox.y + vWP.z) / uGBox.w);\n" +
      "vec4 nd = texture2D(uNdviMap, un); float dentro = step(0.0, un.x) * step(un.x, 1.0) * step(0.0, un.y) * step(un.y, 1.0);\n" +
      "gl_FragColor.rgb = mix(gl_FragColor.rgb, nd.rgb, 0.8 * nd.a * uNdviOn * dentro);\n" +
      "if (uDetDbg > 0.5) gl_FragColor.rgb = uDetDbg < 1.5 ? vec3(abierto) : uDetDbg < 2.5 ? vec3(clamp(tono - 0.5, 0.0, 1.0)) : uDetDbg < 3.5 ? vec3(clamp(rodada - 0.5, 0.0, 1.0)) : vec3(ruts, camino, coh);\n";
    sh.fragmentShader = sh.fragmentShader.replace("void main() {", "varying vec3 vVPz;\n#define vViewPosition vVPz\n" + cab + "void main() {")
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + color)
      .replace("gl_FragColor.rgb *= vSomb;", "if (uModoOrto > 0.5) gl_FragColor.rgb = texture2D(uOrt, " + OP.uvO + ").rgb * sRGBTransferOETF(vec4(uOrtoTint, 1.0)).rgb;\n float dd = dn(vWP.xz * 0.9) * 0.45 + dn(vWP.xz * 3.3) * 0.3 + dn(vWP.xz * 12.0) * 0.25;\n gl_FragColor.rgb *= (1.0 - (1.0 - (0.82 + 0.36 * dd)) * (1.0 - 0.6 * abierto)) * vSomb;")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n normal = pBump(-vViewPosition, normal, vec2(dFdx(hSuelo), dFdy(hSuelo)) * uBumpK * (1.0 - smoothstep(25.0, 90.0, length(vViewPosition))));")
      .replace("#include <dithering_fragment>", fin + "#include <dithering_fragment>");
  }

  function mosaico(): void {   // la textura del mosaico de 1 m (lo que aún no tiene datos): sin ella se vería negro
    if (UN.uMos.value || !Mundo.mosaico.img) return;
    mos = new THREE.Texture(Mundo.mosaico.img); mos.anisotropy = 4; mos.needsUpdate = true; UN.uMos.value = mos;
  }
  // MU5-n, segundo commit: el material del terreno se registra en la fábrica (una sola fuente por material; MATERIALES §5) y se pide con dueño
  const fabrica = deps.materiales, mats = fabrica.de(DUENO_TERRENO);
  fabrica.define(TERRENO, {
    clasico: function (o: OpcTerreno, c) {
      const Lambert = c.THREE["MeshLambertMaterial"] as new (opc?: unknown) => MaterialTerreno, u = o.u;
      const m = new Lambert({}); m.color = matSuelo.color;   // el color (lluvia, luz) es uno solo para todo el relieve
      m.onBeforeCompile = function (sh) { parche(sh as Sombreador, u); };
      m.customProgramCacheKey = function () { return fotos() ? "terreno-3dtiles-fotos" : "terreno-3dtiles"; };   // un solo programa para todos los glb
      return m as MaterialMin;
    }
  });
  // ---- MU5-n, tercer commit: la variante TSL del terreno (MATERIALES §1, fila 1; dificultad A), APAGADA: solo la usaría el WebGPURenderer (MU6), que
  // hoy no se monta. PARCIAL (MATERIALES §5 lo admite si se dice qué falta; aquí, en el §1.5): lleva el color de la tierra (el suelo de la tesela o el
  // mosaico), la hierba según el NDVI del suelo (uG) con su ruido y sus motas, el material de tierra en cuatro octavas, el paso a lineal, el tinte del
  // maestro (matSuelo.color, el mismo objeto), el modo Ortofoto, la capa NDVI encima (uNdviMap, uNdviOn, tras la niebla, como el clásico), la exageración
  // por UN.uExag (para la posición de muestreo, como el clásico) y la niebla de la escena (fog = true). NO lleva: la sombra de nubes ni la escarcha (son de
  // parcheTiempo, fila 2), el detalle de la ortofoto del suelo abierto (uDet: rodadas, caminos, gravilla, hojarasca), el relieve fino (pBump con dFdx),
  // el suelo de fotos (?suelo=fotos) ni la vista de depuración (uDetDbg). Construye un NodeMaterial con sus nodos (lo prueba Vitest con three/webgpu de
  // verdad); NO se ha compilado ni dibujado: las capturas clásico frente a TSL son de MU6.
  // Los uniformes son los mismos objetos { value } que los del clásico (UN y los de la tesela): cada nodo relee su valor en cada objeto (onObjectUpdate).
  function tslTerreno(o: OpcTerreno, c: CtxTsl): MaterialMin {
    const W = c.THREE as Record<string, unknown>, T = c.TSL as TslMin, u = o.u;
    const Lambert = W["MeshLambertNodeMaterial"] as new () => MaterialMin & Record<string, unknown>;
    const Datos = W["DataTexture"] as new (d: Uint8Array, w: number, h: number) => TexturaMin;
    const neutro = new Datos(new Uint8Array([143, 128, 128, 255]), 1, 1); neutro.needsUpdate = true;
    const num = (x: Uniforme | undefined, d: number): TslNodo => T.uniform(x ? x.value as number : d).onObjectUpdate(function () { return x ? x.value as number : d; });
    const vec = (x: Uniforme | undefined): TslNodo => T.uniform((x as Uniforme).value);   // Vector2/Vector4/Color: el mismo objeto, que se mueve en su sitio
    const tex = (x: Uniforme | undefined): TslNodo => { const n = T.texture((x && x.value) || neutro); n.onObjectUpdate(function () { return (x && x.value) || neutro; }); return n; };
    const uExag = num(UN.uExag, 1), uTiene = num(u["uTiene"], 0), uHierba = num(UN.uHierba, 1), uNdviOn = num(UN.uNdviOn, 0), uModoOrto = num(UN.uModoOrto, 0);
    const uTile = vec(u["uTile"]), uMosBox = vec(UN.uMosBox), uGBox = vec(UN.uGBox), uCua = vec(u["uCua"]), uOrtoTint = vec(UN.uOrtoTint);
    const uSue = tex(u["uSue"]), uRui = tex(u["uRui"]), uMos = tex(UN.uMos), uG = tex(UN.uG), uNdviMap = tex(UN.uNdviMap), uOrt = tex(u["uOrt"]);
    // dh/dn: el ruido de valor del GLSL de siempre
    const dh = T.Fn(function (a: TslNodo[]) { const p = a[0] as TslNodo; return T.fract(T.sin(T.dot(p, T.vec2(41.3, 289.1))).mul(17391.7)); });
    const dn = T.Fn(function (a: TslNodo[]) {
      const p = a[0] as TslNodo, i = T.floor(p), f0 = T.fract(p), f = f0.mul(f0).mul(T.float(3).sub(f0.mul(2)));
      return T.mix(T.mix(dh(i), dh(i.add(T.vec2(1, 0))), f.x), T.mix(dh(i.add(T.vec2(0, 1))), dh(i.add(T.vec2(1, 1))), f.x), f.y);
    });
    const wp = T.positionWorld, vWP = T.vec3(wp.x, wp.y.div(uExag), wp.z), xz = T.vec2(vWP.x, vWP.z);
    const lc = T.vec2(vWP.x.sub(uTile.x), vWP.z.negate().sub(uTile.y));
    const dc = T.length(T.positionView), cerca = T.float(1).sub(T.smoothstep(12, 60, dc)), cercaM = T.float(1).sub(T.smoothstep(3, 18, dc));
    const sueloTesela = uSue.sample(lc.div(SRS).add(1).div(NS2)).rgb;
    const mosaicoRgb = uMos.sample(T.vec2(vWP.x.sub(uMosBox.x).div(uMosBox.z), T.float(1).sub(uMosBox.y.add(vWP.z).div(uMosBox.w)))).rgb.mul(0.9);
    const sc = T.select(uTiene.greaterThan(0.5), sueloTesela, mosaicoRgb);
    const ru = uRui.sample(lc.add(1).div(N2));
    const g = uG.sample(T.vec2(vWP.x.sub(uGBox.x).div(uGBox.z), uGBox.y.add(vWP.z).div(uGBox.w))).r.mul(1.3).sub(0.3);
    const cov = T.clamp(T.clamp(g.sub(S0).div(V0 - S0), 0, 1).mul(ru.r).mul(1.6), 0, 1), vig = T.clamp(g.sub(0.3).div(0.3), 0, 1), nn = ru.g.mul(0.4).add(0.8), m = cov.mul(0.78).mul(uHierba);
    const gr = T.vec3(T.float(0.66).sub(vig.mul(0.36)), T.float(0.58).sub(vig.mul(0.1)), T.float(0.34).sub(vig.mul(0.17))).mul(nn)
      .mul(T.float(0.82).add(T.float(0.36).mul(dn(T.vec2(vWP.x.mul(14), vWP.z.mul(3)).add(T.vec2(dn(xz.mul(0.5)).mul(3), 0)))).mul(cerca.mul(0.5).add(0.5))))
      .mul(T.float(1).add(T.float(0.22).mul(dn(xz.mul(0.6).add(4)).sub(0.5)).mul(T.float(1).sub(vig))));
    const nM = dn(xz.mul(0.045)), nm = dn(xz.mul(0.19).add(3.1)), nf = dn(xz.mul(0.9).add(9.7)), nu = dn(xz.mul(3.7).add(1.3)), nuu = dn(xz.mul(13).add(5.9));
    const tierra = T.vec3(T.float(1).add(nM.sub(0.5).mul(0.1)).add(nm.sub(0.5).mul(0.05)), T.float(1).add(nM.sub(0.5).mul(0.03)), T.float(1).sub(nM.sub(0.5).mul(0.1)).sub(nm.sub(0.5).mul(0.05)))
      .mul(T.float(0.86).add(T.float(0.28).mul(nm.mul(0.5).add(nf.mul(0.3)).add(nu.mul(0.2).mul(cerca)).add(nuu.mul(0.1).mul(cercaM)))));
    const suelo = sc.mul(ru.b.mul(0.1).add(0.94)).mul(T.float(1).sub(m)).add(gr.mul(m)).mul(tierra);
    const mat = new Lambert();
    mat["color"] = matSuelo.color;   // el tinte del día (15_tiempo lo mueve en su sitio): el mismo objeto que el clásico
    mat["colorNode"] = T.materialColor.mul(T.sRGBTransferEOTF(T.max(suelo, T.vec3(0))));   // colores «como se ven» → lineal al entrar en la luz
    mat["fog"] = true;
    // tras la luz y la niebla (output): el modo Ortofoto, el grano del suelo y la capa NDVI encima, como el final del fragmento clásico
    const uvO = T.vec2(vWP.x.sub(uCua.x).div(uCua.z), T.float(1).sub(vWP.z.negate().sub(uCua.y).div(uCua.z)));
    const dd = dn(xz.mul(0.9)).mul(0.45).add(dn(xz.mul(3.3)).mul(0.3)).add(dn(xz.mul(12)).mul(0.25));
    const luz0 = T.select(uModoOrto.greaterThan(0.5), uOrt.sample(uvO).rgb.mul(T.sRGBTransferOETF(uOrtoTint)), T.output.rgb).mul(dd.mul(0.36).add(0.82));
    // A3-4: la sombra de nubes y la escarcha de parcheTiempo (fila 2) en vWP.xz, tras la luz y antes de la capa NDVI (en el clásico, las dos líneas del tiempo van
    // antes que la capa en <dithering_fragment>), si se dan los nodos del tiempo; sin ellos, como antes
    const nt = deps.tiempoTsl ? deps.tiempoTsl() : null, NT = nt ? nt(T) : null;
    const luz = NT ? NT.aplica(luz0, NT.enVertice(NT.sombra(xz))) as TslNodo : luz0;
    const un = T.vec2(vWP.x.sub(uGBox.x).div(uGBox.z), T.float(1).sub(uGBox.y.add(vWP.z).div(uGBox.w)));
    const nd = uNdviMap.sample(un), dentro = T.step(0, un.x).mul(T.step(un.x, 1)).mul(T.step(0, un.y)).mul(T.step(un.y, 1));
    mat["outputNode"] = T.vec4(T.mix(luz, nd.rgb, nd.a.mul(0.8).mul(uNdviOn).mul(dentro)), T.output.a);
    return mat;
  }
  fabrica.define(TERRENO, { tsl: tslTerreno });   // una sola fuente: el clásico y el TSL en el mismo fichero
  function material(u: Record<string, Uniforme>): MaterialTerreno { return mats.crea(TERRENO, { u: u }) as unknown as MaterialTerreno; }
  // un modelo recién cargado: su malla de terreno (la que lleva ortofoto; los olivos instanciados no se tocan) pasa a este sombreado
  function modelo(raiz: RaizGlb, tile: TileGlb | null | undefined): void {
    const b = tile && tile.boundingVolume && tile.boundingVolume.box; if (!b || !raiz) return;   // sin caja no se sabe dónde cae: se queda con su material
    const b0 = b[0] as number, b1 = b[1] as number, b3 = b[3] as number, b7 = b[7] as number;
    const L = 2 * b3, x0 = b0 - b3, y0 = b1 - b7, mt = L <= TS + 1e-6 ? Mundo.tesela(b0, b1) : null;
    mosaico();
    raiz.traverse(function (o) {
      if (!o.isMesh || o.isInstancedMesh || !o.material || !o.material.map) return;
      const map = o.material.map, w = ((map.image as { width?: number } | undefined) && (map.image as { width?: number }).width) || 256, uni = mt ? prepara(mt) : null;
      map.colorSpace = THREE.NoColorSpace; map.anisotropy = 4; map.needsUpdate = true;   // los valores tal cual (ADR-0016), el sombreador los pasa a lineal
      const u: Record<string, Uniforme> = {
        uTile: uni ? uni["uTile"] as Uniforme : { value: new THREE.Vector2(x0, y0) }, uSue: uni ? uni["uSue"] as Uniforme : { value: null }, uRui: uni ? uni["uRui"] as Uniforme : { value: ruidoNeutro() },
        uGnd: uni ? uni["uGnd"] as Uniforme : { value: ruidoNeutro() }, uTiene: uni ? uni["uTiene"] as Uniforme : { value: 0 },
        uOrt: { value: map }, uDet: { value: 0 }, uBias2: { value: Math.log(2 / (L / w)) / Math.LN2 }, uCua: { value: new THREE.Vector4(x0, y0, L, 0) }
      };
      const SF = fotos(); if (SF) u["uRue"] = uni ? uni["uRue"] as Uniforme : { value: SF.rueNeutro() };
      o.material = material(u);   // el material del glb (sin compilar) y su textura los libera la librería al soltar la tesela; este, suelta()
      vivos.push({ raiz: raiz, m: o.material, u: u, mt: mt });
    });
  }
  function suelta(raiz: RaizGlb): void { vivos = vivos.filter(function (v) { if (v.raiz !== raiz) return true; v.m.dispose(); return false; }); }
  // cada 0,2 s: las texturas de la tesela del Mundo cuando llegan sus datos y el detalle del suelo abierto según la distancia (con histéresis del 50 %)
  function actualiza(): void {
    const ahora = deps.ahora(); if (ahora - tUlt < 200 || !vivos.length) return; tUlt = ahora;
    const SF = fotos(); if (SF) SF.actualiza();
    mosaico();
    const p = camera.position, dist: Record<string, number> = {};
    vivos.forEach(function (v) {
      const t = v.mt; if (!t) return;
      if (!(t.key in dist)) { prepara(t); dist[t.key] = Mundo.dist(t, p.x, p.y, p.z); if ((dist[t.key] as number) < U1) pideDetalle(t); }
      const d = dist[t.key] as number, uDet = v.u["uDet"] as Uniforme<number>; uDet.value = t["detListo"] && (d < U1 || (uDet.value && d < U1 * 1.5)) ? 1 : 0;
    });
  }
  function libera(): void {   // si la escena 3D Tiles se apaga o falla, y al liberar el exterior (el libera() del componente)
    vivos.forEach(function (v) { v.m.dispose(); }); vivos = [];
    const SF = fotos(); if (SF) SF.libera();
    if (mos) { if (UN.uMos.value === mos) UN.uMos.value = null; mos.dispose(); mos = null; }
    Mundo.lista.forEach(function (t) { sueltaTexturas(t, true); });   // L2-05: las texturas de cada tesela del Mundo (y sus uniformes)
    if (RUI0) { RUI0.dispose(); RUI0 = null; }
    mats.libera();   // lo que quede de este dueño en la fábrica (lo suelto por suelta() ya salió de su lista)
  }
  function resumen(): { glb: number; conTesela: number; conDetalle: number } { return { glb: vivos.length, conTesela: vivos.filter(function (v) { return v.mt; }).length, conDetalle: vivos.filter(function (v) { return v.u["uDet"] && (v.u["uDet"] as Uniforme).value; }).length }; }
  /** el componente (ADR-0023): del exterior, siempre encendido. Lo registra 90_final.js. No añade llamadas: cambia el material de los glb que dibuja 04b */
  const componente: Manifiesto = {
    id: "terreno-sombreado", version: 1, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0, texturasMB: 20 },   // [ESTIMACIÓN] de la lente 2 (L2-05): ~400 KB por tesela del Mundo, ~18 MB en Hituelo; sin medir
    fases: {}, actualiza: {}, mundos: ["exterior"],
    monta: function () { return { resumen: resumen }; },
    libera: function () { libera(); }
  };
  return { modelo: modelo, suelta: suelta, actualiza: actualiza, libera: libera, resumen: resumen, OP: OP, componente: componente };
}

export type SombreadoTiles = ReturnType<typeof creaSombreadoTiles>;

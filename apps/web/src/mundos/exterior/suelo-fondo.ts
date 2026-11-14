// El suelo de fondo del exterior (M6; MU5-n: antes apps/web/motor/04e_suelo_fondo.js, que queda como talón). Componente «suelo-fondo» (ADR-0023, C10 tercera
// tanda) de los mundos ["exterior"], con un libera() que suelta de verdad. Mismo comportamiento que antes, sin cambio visible.
// El mundo es un mosaico de teselas; donde falta una (bordes, esquinas, teselas sin datos) se veía el vacío. Esta malla cubre la caja de la finca más un margen
// con el relieve GRUESO del índice (8 m, el mismo medido, con menos detalle: regla 5) y el mosaico de 1 m como textura, POR DEBAJO del tileset: BAJA metros más
// abajo y con polygonOffset, para que nunca asome por encima de las teselas ni haga z-fighting (el relieve grueso, interpolado, puede quedar por encima del fino
// en una loma de metro y medio). Una malla, una llamada, sin sombras ni detalle de suelo. Comparte la textura del mosaico de 04d (no se sube otra vez a la GPU
// y no se libera aquí: es de 04d) y el color de matSuelo (luz, lluvia y niebla como el resto del relieve). Solo existe mientras la escena 3D Tiles esté activa.
// Corre en la fase «tarde» (cada fotograma, tras la carga y antes de la Cola). ?fondo=0 lo apaga (y ?sinFondo): sin él se ve el vacío de los bordes.
// Del legado recibe por argumento lo que necesita (THREE, D, Mundo, UN, matSuelo, Escena3D, scene, Estado, VrPresupuesto, la fábrica de materiales); no lee globales.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { DefMaterial, Materiales, MaterialMin } from "../../nucleo/materiales.ts";

// three no trae tipos en el repo (como en ambiente.ts y presupuesto.ts): de él solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

/** el índice (D) de lo que lee este módulo: el mosaico de 1 m y el relieve grueso de 8 m */
export interface DatosFondo {
  mosaico: { x0: number; yN: number; w: number; h: number; res: number };
  grueso: { x0: number; yN: number; w: number; h: number; res: number };
}
export interface DepsSueloFondo {
  THREE: T3;
  D: DatosFondo;
  Mundo: { grueso(x: number, y: number): number };
  /** UN.uMos: la textura del mosaico de 04d (null hasta que está) */
  UN: { uMos: { value: unknown } };
  /** el material del suelo de 04d: de él se toma el color (luz, lluvia, niebla) */
  matSuelo: { color: unknown };
  Escena3D: { estado(): string };
  scene: { add(o: unknown): void; remove(o: unknown): void };
  /** Estado.exag (un campo que cambia: se lee en cada fotograma) */
  Estado: { exag: number };
  /** la fábrica de materiales (nucleo/materiales); de ella se piden los del componente, con dueño «suelo-fondo» */
  Materiales: Materiales;
  /** 02g: el presupuesto de VR; null si no está */
  VrPresupuesto?: { fuente(nombre: string, fn: (v: number) => void): void; olvida(nombre: string): void } | null;
  VrPresupuestoPuro?: { hundimiento(celdas: number, max: number, baja: number): number } | null;
  /** location.search ("" si no hay): ?sinFondo apaga el suelo de fondo (para comparar y medir) */
  busqueda?: string;
}

// BAJA (L8-07): el hundimiento es NECESARIO (M6, 935d8e1d): el relieve grueso interpolado puede quedar ~1,5 m por encima del fino en una loma y asomaría sobre el tileset.
// Su precio: donde no hay tesela con dato, el paseante pisa el grueso y el fondo dibujado queda BAJA·exag por debajo (hasta 4,5 m con exag 3; lo acota suelo_fondo.test.js).
// El paseo se recorta a la caja D.ext menos 3 m (exterior.test.ts), normalmente cubierta por teselas; una tesela vacía dentro de ext, no probada con datos reales.
export const MARGEN = 400, BAJA = 1.5, CELDAS_MAX = 128;
export const ID_SUELO_FONDO = "suelo-fondo";

// ---------------------------------------------------------------- el material (MU5-n: por la fábrica, con su nombre de la tabla de MATERIALES §1, fila 8)
/** el nombre del material en la fábrica: es también la clave de su variante TSL */
export const MATERIAL_SUELO_FONDO = "suelo-fondo";
/** lo que pide el material: la textura del mosaico de 04d y el color de matSuelo (el MISMO objeto: luz, lluvia y niebla como el resto del relieve) */
export interface OpcSueloFondo { map: unknown; color: unknown }
/** el sombreado de siempre: la textura del mosaico se comparte con 04d, que la usa tal cual (ADR-0016: sin convertir), así que aquí se pasa a lineal al leerla */
export function parcheSueloFondo(sh: unknown): void {
  const s = sh as { fragmentShader: string };
  s.fragmentShader = s.fragmentShader.replace("#include <map_fragment>", "vec4 sampledDiffuseColor = sRGBTransferEOTF(texture2D(map, vMapUv));\n diffuseColor *= sampledDiffuseColor;");
}
export const DEF_SUELO_FONDO: DefMaterial<OpcSueloFondo> = {
  clasico: function (o, c) {
    const Lambert = c.THREE["MeshLambertMaterial"] as new (opc: unknown) => MaterialMin & { color: unknown };
    const m = new Lambert({ map: o.map, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    m.color = o.color;
    m.onBeforeCompile = parcheSueloFondo;
    m.customProgramCacheKey = function () { return MATERIAL_SUELO_FONDO; };
    return m;
  },
  // MU5-n, tercer commit: la variante TSL, APAGADA (solo con el WebGPURenderer, que hasta MU6 no existe; nadie la usa hoy). Lo mismo que el parche:
  // color de matSuelo (el MISMO objeto, releído en cada objeto como el ejemplo de la fábrica) × mosaico pasado de sRGB a lineal al leerlo; el alfa, el del mosaico.
  tsl: function (o, c) {
    const Lambert = c.THREE["MeshLambertNodeMaterial"] as new (opc: unknown) => MaterialMin & { color: unknown; colorNode: unknown };
    const { texture, uniform, vec4, sRGBTransferEOTF } = c.TSL as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const m = new Lambert({ polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    m.color = o.color;
    const mosaico = texture(o.map), base = uniform(o.color).onObjectUpdate(function () { return o.color; });
    m.colorNode = vec4(base.mul(sRGBTransferEOTF(mosaico.rgb)), mosaico.a);
    return m;
  }
};

export function creaSueloFondo(d: DepsSueloFondo) {
  const THREE = d.THREE, D = d.D;
  let malla: T3 = null, expPuesta = NaN;
  let celdas = CELDAS_MAX, baja = BAJA;   // Q0c-a: en VR, el escalón 3 pide menos celdas y baja más (02g_vr_presupuesto); fuera de VR, los de siempre
  const APAGADO = /[?&]sinFondo/.test(d.busqueda || "");
  d.Materiales.define(MATERIAL_SUELO_FONDO, DEF_SUELO_FONDO);
  const materiales = d.Materiales.de(ID_SUELO_FONDO);   // lo que cree este componente se libera con su libera()

  function construye(): void {
    const M = D.mosaico, GR = D.grueso, ax = GR.w * GR.res, ay = GR.h * GR.res;
    const xa = GR.x0 - MARGEN, xb = GR.x0 + ax + MARGEN, yb = GR.yN + MARGEN, ya = GR.yN - ay - MARGEN;   // la caja del relieve grueso (= la de la finca) y un margen
    const nx = Math.min(celdas, Math.ceil((xb - xa) / 16)), ny = Math.min(celdas, Math.ceil((yb - ya) / 16)), nv = (nx + 1) * (ny + 1);
    const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new (nv > 65535 ? Uint32Array : Uint16Array)(nx * ny * 6);
    let k = 0;
    const mw = M.w * M.res, mh = M.h * M.res;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const x = xa + (xb - xa) * i / nx, y = yb - (yb - ya) * j / ny, o = j * (nx + 1) + i;
      pos[o * 3] = x; pos[o * 3 + 1] = d.Mundo.grueso(x, y) - baja; pos[o * 3 + 2] = -y;   // mundo: x al este, z = −norte
      uv[o * 2] = (x - M.x0) / mw; uv[o * 2 + 1] = (y - (M.yN - mh)) / mh;
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1;   // sentido antihorario visto desde arriba (la cara hacia +y)
      idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = e;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    const m = materiales.crea(MATERIAL_SUELO_FONDO, { map: d.UN.uMos.value, color: d.matSuelo.color });
    malla = new THREE.Mesh(g, m); malla.name = "sueloFondo"; malla.matrixAutoUpdate = false; malla.renderOrder = -1; expPuesta = NaN;
    d.scene.add(malla);
  }
  /** quita la malla de la escena y suelta su geometría y su material; la textura (mosaico) es de 04d y no se toca */
  function libera(): void {
    if (!malla) return;
    d.scene.remove(malla); malla.geometry.dispose(); materiales.libera(); malla = null;
  }
  // por fotograma: crear cuando la escena está activa y el mosaico ya es textura; liberar si la escena se apaga; seguir la exageración vertical
  function actualiza(): void {
    const activa = !APAGADO && d.Escena3D.estado() === "activo";
    if (!activa || !d.UN.uMos.value) { if (!activa) libera(); return; }
    if (!malla) construye();
    if (d.Estado.exag !== expPuesta) { malla.matrix.makeScale(1, d.Estado.exag, 1); malla.matrixWorldNeedsUpdate = true; malla.updateMatrixWorld(true); expPuesta = d.Estado.exag; }
  }
  // la fuente del presupuesto VR: con otras celdas se libera y el siguiente fotograma (actualiza) la rehace; se apunta al montar y se olvida al liberar
  const vrPres = d.VrPresupuesto || null;
  if (vrPres) vrPres.fuente("sueloFondo", function (c: number) {
    const n2 = Math.max(16, Math.min(CELDAS_MAX, Math.round(c) || CELDAS_MAX)); if (n2 === celdas) return;
    celdas = n2; baja = d.VrPresupuestoPuro ? d.VrPresupuestoPuro.hundimiento(celdas, CELDAS_MAX, BAJA) : baja; libera();
  });
  /** lo que libera el componente al apagarse: la malla y, del presupuesto VR, la fuente apuntada */
  function suelta(): void { libera(); if (vrPres) vrPres.olvida("sueloFondo"); }
  return { actualiza, libera, suelta, materiales, malla: function () { return malla; }, celdas: function () { return celdas; }, baja: function () { return baja; }, BAJA, MARGEN, CELDAS_MAX };
}
export type SueloFondo = ReturnType<typeof creaSueloFondo>;

/** El manifiesto del componente «suelo-fondo» (el mismo de siempre, ahora de los mundos ["exterior"]): lo registra el talón de 04e con Componentes.registra. */
export function manifiestoSueloFondo(d: DepsSueloFondo): Manifiesto {
  return {
    id: ID_SUELO_FONDO, version: 1,
    consume: ["Materiales", "D", "Mundo", "UN", "matSuelo", "Escena3D", "scene", "Estado", "VrPresupuesto", "VrPresupuestoPuro"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true, url: "fondo" },
    presupuesto: { llamadas: 1, triangulos: 32768 },   // el techo: CELDAS_MAX² celdas de 2 triángulos (128 × 128). Medido en Node (componentes_c10c.test.js) con la caja del fixture: 1 llamada y 10.824 triángulos, los de pruebas/presupuesto.json («lejos»)
    fases: { tarde: 0 },
    mundos: ["exterior"],
    monta: function () { return creaSueloFondo(d); },
    actualiza: { tarde: function (_dt, _t, api) { (api as SueloFondo).actualiza(); } },
    libera: function (api) { if (api) (api as SueloFondo).suelta(); }
  };
}

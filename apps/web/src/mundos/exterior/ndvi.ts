// El NDVI de Sentinel-2 (10 m) del exterior, con escala relativa a la parcela (como hace Vigía). MU5-n (A3-1a): antes el núcleo de apps/web/motor/10_ndvi.js,
// que queda como extracción parcial: conserva ndviIdx (la fecha elegida, una primitiva que reescribe 14_historia: no puede ser una importación, MUNDOS §9.3)
// y las casillas y el deslizador del panel. Aquí: los datos (NDV), la rampa de color, la escala de la fecha elegida (pinta) y el NDVI relativo de un punto
// (rel), que leen el tinte de los árboles, la hierba, la estación y la VR. La capa que lo pinta sobre el terreno es el componente «capa-ndvi»
// (capa-ndvi.ts): se entera por «ndvi:cambia».
// La escala (lo, hi) vivía en 02_mundo como ndLo/ndHi, aunque solo la escribía y la leía 10_ndvi: ahora es estado de aquí (escala()).
// Es un componente (ADR-0023) del exterior: «ndvi», sin dibujo ni GPU (los datos son de D.ndvi, el índice de la finca); su libera() vuelve la escala a la de partida.
// Nada de aquí lee globales al cargarse: D, b64/i16, la caja de la finca, la fecha elegida y el Bus entran por argumento.
import type { Manifiesto } from "../../nucleo/componentes.ts";

/** El bloque ndvi del índice (contratos/indice.schema.json): w × h celdas por fecha, en u8 (0 = sin dato) o en Int16 (milésimas). */
export interface IndiceNdvi { w: number; h: number; fechas: string[]; media: number[]; u8?: string; b64?: string }
export interface DatosNdvi { w: number; h: number; fechas: string[]; media: number[]; datos: Int16Array }
export interface DepsNdvi {
  D: { ndvi?: IndiceNdvi | null };
  b64(s: string): ArrayLike<number>;
  i16(s: string): Int16Array;
  /** 01_datos: la caja de la finca */
  x0: number; yN: number; ANCHO: number; ALTO: number;
  /** la fecha elegida (10_ndvi: ndviIdx, que reescriben el deslizador y 14_historia) */
  idx(): number;
  /** el Bus (02c): avisa con «ndvi:cambia» */
  bus: { emite(ev: string, datos?: unknown): number };
}

/** el NDVI de 8 bits (0 = sin dato; 1..254 → de −0,2 a 1,0) se pasa a milésimas en Int16, que es lo que usa el resto */
export function u8aI16(u: ArrayLike<number>): Int16Array {
  const d = new Int16Array(u.length); for (let i = 0; i < u.length; i++) d[i] = u[i] === 0 ? -32768 : Math.round((((u[i] as number) - 1) / 253 * 1.2 - 0.2) * 1000); return d;
}
/** marrón rojizo → amarillo → verde */
export function rampa(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const a = t < 0.5 ? [0.55, 0.29, 0.18] : [0.85, 0.78, 0.35], b = t < 0.5 ? [0.85, 0.78, 0.35] : [0.18, 0.49, 0.2], u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return [(a[0] as number) + ((b[0] as number) - (a[0] as number)) * u, (a[1] as number) + ((b[1] as number) - (a[1] as number)) * u, (a[2] as number) + ((b[2] as number) - (a[2] as number)) * u];
}

export function creaNdvi(deps: DepsNdvi) {
  const D = deps.D, x0 = deps.x0, yN = deps.yN, ANCHO = deps.ANCHO, ALTO = deps.ALTO;
  const NDV: DatosNdvi | null = D.ndvi ? { w: D.ndvi.w, h: D.ndvi.h, fechas: D.ndvi.fechas, media: D.ndvi.media, datos: D.ndvi.u8 ? u8aI16(deps.b64(D.ndvi.u8)) : deps.i16(D.ndvi.b64 as string) } : null;
  let ndLo = 0, ndHi = 1;
  function pinta(): void {   // la escala relativa de la fecha elegida (la usa rel, también con la capa apagada: el tinte de los árboles); el dibujo, por «ndvi:cambia»
    if (!NDV) return;
    const n = NDV.w * NDV.h, off = deps.idx() * n, vals: number[] = [];
    for (let i = 0; i < n; i++) { const v = NDV.datos[off + i] as number; if (v > -30000) vals.push(v / 1000); }
    vals.sort(function (a, b) { return a - b; });
    const lo = vals.length ? vals[Math.floor(vals.length * 0.05)] as number : 0, hi = vals.length ? vals[Math.floor(vals.length * 0.95)] as number : 1;
    ndLo = lo; ndHi = hi;
    deps.bus.emite("ndvi:cambia", { lo: lo, hi: hi });
  }
  /** el NDVI relativo (0-1) de un punto, o NaN si no hay dato (L3-19: antes daba 0,5 y el tinte de las copas lo pintaba como un vigor «normal», mientras la capa de terreno lo pinta en gris) */
  function rel(x: number, y: number): number {
    if (!NDV) return NaN;
    let u = (x - x0) / ANCHO * NDV.w - 0.5, v = (yN - y) / ALTO * NDV.h - 0.5;
    u = Math.max(0, Math.min(NDV.w - 1.001, u)); v = Math.max(0, Math.min(NDV.h - 1.001, v));
    const iu = Math.floor(u), iv = Math.floor(v), tu = u - iu, tv = v - iv, off = deps.idx() * NDV.w * NDV.h, w = NDV.w, d = NDV.datos;
    const q = [d[off + iv * w + iu] as number, d[off + iv * w + iu + 1] as number, d[off + (iv + 1) * w + iu] as number, d[off + (iv + 1) * w + iu + 1] as number];
    for (let i = 0; i < 4; i++) if ((q[i] as number) <= -30000) return NaN;
    const val = (((q[0] as number) * (1 - tu) + (q[1] as number) * tu) * (1 - tv) + ((q[2] as number) * (1 - tu) + (q[3] as number) * tu) * tv) / 1000;
    return (val - ndLo) / Math.max(ndHi - ndLo, 0.02);
  }
  function escala(): { lo: number; hi: number } { return { lo: ndLo, hi: ndHi }; }
  /** el componente (ADR-0023): del exterior, sin dibujo ni GPU. Lo registra 90_final.js */
  const componente: Manifiesto = {
    id: "ndvi", version: 1, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0, texturasMB: 0 },   // la textura de la capa es de «capa-ndvi»
    fases: {}, actualiza: {}, mundos: ["exterior"],
    monta: function () { return { escala: escala }; },
    libera: function () { ndLo = 0; ndHi = 1; }   // no hay GPU que soltar: NDV son los datos del índice (D), que viven con la página
  };
  return { NDV: NDV, rampa: rampa, pinta: pinta, rel: rel, escala: escala, componente: componente };
}

export type Ndvi = ReturnType<typeof creaNdvi>;

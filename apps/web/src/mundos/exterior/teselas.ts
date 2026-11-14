// El Mundo del exterior: las teselas de 256 m con su relieve, su copa, el color del suelo, la nube y la ortofoto (MU5-n, A3-1a; antes el cuerpo de
// apps/web/motor/02_mundo.js, que conserva lo que no es del Mundo: los alias suelo/copaAlta/colorSuelo/orto, el tinte de la ortofoto y el censo de árboles).
// Todo lo demás del motor pregunta aquí (suelo, copaAlta, colorSuelo, orto). Es del exterior: vive en mundos/exterior/ (MUNDOS §1).
// Una tesela (kx, ky) cubre en UTM [kx·256, kx·256+256) × [ky·256, ky·256+256). Las filas de cada rejilla van de sur a norte; el relieve y el color del suelo llevan una celda de margen
// (la de la tesela vecina) para que la interpolación no tenga costura. Lo que aún no ha llegado se contesta con el relieve grueso de 8 m (o la ortofoto gruesa), nunca con un hueco.
//
// Lo nuevo al pasar a TypeScript (los arreglos de la auditoría de noviembre, lentes 1 y 2):
//   · L1-05: la tesela que llega se DECODIFICA EN LA COLA del exterior (deps.cola(): ColaExt), a rebanadas, y no en el hilo principal fuera de ella: la
//     respuesta se lee como texto (fetch) y el JSON.parse, el relieve a Float32, la copa, el suelo y los puntos van cada uno en su rebanada; los oyentes de
//     alCargar (Arboles.tileCargada, las lindes…) también, uno por rebanada. Así su coste lo ve el presupuesto de la Cola (y Cola.est, por la letra «M»).
//     Sin Cola (las pruebas que no la dan) se decodifica en el acto, como antes.
//   · L2-03: el Mundo SUELTA los datos de las teselas fuera de rango (sueltaLejos, que corre con liberaOrtoLejos cada 3 s): una tesela cargada a más de
//     RADIO_SUELTA m (3000, por encima de los 1800 de carga y de los 2760 a los que 05_nube suelta su malla) en dos pasadas seguidas pierde dtm, chm, suel,
//     pts, la ortofoto y los bins de 07b_arboles, y vuelve a «sin pedir» (si se vuelve cerca, se pide otra vez). alSoltar(fn) avisa a quien colgó algo de
//     ella (04d, sus texturas). libera() lo suelta TODO (las teselas, también las que vienen de camino, y el mosaico): es el libera() del componente.
//   · Es un componente (ADR-0023) del exterior: componente es su manifiesto (id «mundo-teselas», mundos: ["exterior"]), que 90_final.js registra; al liberar
//     el exterior (Componentes.liberaMundo) se llama a su libera(). El Mundo existe desde que se monta el motor (los demás módulos lo leen al montarse):
//     monta() solo vuelve a pedir el mosaico si se liberó antes.
// Nada de aquí lee globales al cargarse: D, RES, b64/i16, el reloj, el lienzo 2D, las imágenes, fetch y la Cola entran por argumento de creaMundo.
// Presupuesto (regla 6): no dibuja nada; la memoria es la de CPU de las teselas (relieve ~266 KB, puntos 6 B por punto) y las ortofotos decodificadas (tope M4).
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { Trabajo } from "../../nucleo/cola.ts";

// ---------------------------------------------------------------- tipos mínimos (sin DOM en Vitest: lo que se usa del lienzo, la imagen y fetch)

/** Lo que se usa de una imagen del navegador (HTMLImageElement). */
export interface ImagenMin {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
  complete?: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
  width?: number;
  height?: number;
}
/** Lo que se usa del contexto 2D (para decodificar los píxeles y para el minimapa). */
export interface Contexto2DMin {
  drawImage(im: unknown, ...a: number[]): void;
  getImageData?(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
  fillStyle?: unknown;
  fillRect?(x: number, y: number, w: number, h: number): void;
}
/** Lo que se usa de un lienzo (HTMLCanvasElement). */
export interface LienzoMin { width: number; height: number; getContext(tipo: string, opc?: unknown): Contexto2DMin | null }
/** Lo que se usa de la respuesta de fetch. */
export interface RespuestaMin { ok: boolean; status: number; text(): Promise<string> }
/** La Cola del exterior (nucleo/cola.ts: ColaDeMundo), solo pon y cancela. */
export interface ColaMin { pon(clave: string, prio: number, trabajo: Trabajo, fin?: (valor: unknown) => void): boolean; cancela?(clave: string): void }
type Consola = { error(...a: unknown[]): void } | null | undefined;

/** Una tesela del índice (D.teselas[clave]). */
export interface TeselaIndice { kx: number; ky: number; v: number[]; np?: number }
/** Lo que el Mundo usa de D (contratos/indice.schema.json). */
export interface DatosMundo {
  ts: number;
  srs: number;
  centro_utm: number[];
  base?: string;
  teselas: Record<string, TeselaIndice>;
  grueso: { b64: string; x0: number; yN: number; res: number; w: number; h: number };
  mosaico: { jpg?: string; x0: number; yN: number; res: number; w: number; h: number };
}
/** El json de una tesela (contratos/tesela.schema.json). */
interface JsonTesela { dtm: string; chm: string; suelo: string; pts?: string; np?: number }

/** Una tesela del Mundo. Otros módulos le cuelgan lo suyo (04d: uni, texSue…; 05_nube: nubeMalla…; 07b_arboles: bins): por eso admite más campos. */
export interface Tesela {
  key: string; kx: number; ky: number; ox: number; oy: number; v: number[]; np: number;
  /** 0 sin pedir, 1 pedida (o decodificándose en la Cola), 2 cargada, 3 falló */
  estado: number;
  dtm: Float32Array | null; chm: Uint8Array | null; suel: Uint8Array | null; pts: Int16Array | null;
  ortImg: ImagenMin | null; ortCv: LienzoMin | null; ortPix: Uint8ClampedArray | null; ortW: number; ortH: number;
  /** cota del centro (la pone 04d, para la distancia) */
  hc?: number | undefined;
  uso?: number; fallo?: number;
  /** L2-03: cuántas veces se ha soltado (lo que llegue de una petición anterior se tira) y si en la pasada anterior ya estaba lejos */
  gen: number; lejos?: boolean;
  /** la distancia a la cámara cuando se pidió (prioridad en la Cola) */
  prio?: number;
  [otro: string]: unknown;
}
export interface Mosaico { img: ImagenMin | null; pix: Uint8ClampedArray | null; w: number; h: number }
export interface EstadoOrto { max: number; vivas: number; decodificadas: number; desalojadas: number; mb: number }
export interface EstadoTeselas { cargadas: number; pedidas: number; sueltas: number; radioSuelta: number; enCola: number }

export interface DepsMundo {
  D: DatosMundo;
  /** 01_datos: RES, el paso del relieve (m) */
  RES: number;
  /** 01_datos: b64 e i16 (base64 → Uint8Array / Int16Array) */
  b64(s: string): Uint8Array;
  i16(s: string): Int16Array;
  /** location.search ("" si no hay): ?ortoMax=N fija el tope de ortofotos a mano (para medir) */
  busqueda?: string;
  /** el tope por defecto de la clase de aparato (01a_aparato: Aparato.politica().ortoMax); solo se pregunta si no hay ?ortoMax= */
  ortoMaxDefecto(): number;
  /** performance.now */
  ahora(): number;
  /** document.createElement("canvas") */
  lienzo(): LienzoMin;
  /** new Image() */
  imagen(): ImagenMin;
  /** fetch, del mismo origen */
  trae(url: string): Promise<RespuestaMin>;
  /** la Cola del exterior (02b_cola: ColaExt), que se monta después: por eso es una función. Sin ella (null), se decodifica en el acto */
  cola?: (() => ColaMin | null | undefined) | null;
  consola?: Consola;
  /** Estado.exag (L8-08): la exageración vertical; la cámara está en metros de la escena (exagerados) y la cota de la tesela, sin exagerar. Sin ella, 1 */
  exag?: (() => number) | null;
}

/** L2-03: a partir de aquí (m, en 3D, al rectángulo de la tesela) se sueltan los datos de una tesela cargada. Por encima de los 1800 de carga (RADIO_CARGA)
 *  y de los 2760 a los que 05_nube suelta su malla (1,2 × 2300): así ninguna malla de nube se queda sin sus puntos. [SUPUESTO] sin medir la memoria. */
export const RADIO_SUELTA = 3000;
/** el radio de carga de siempre (m) */
export const RADIO_CARGA = 1800;

export function creaMundo(deps: DepsMundo) {
  const D = deps.D, RES = deps.RES, b64 = deps.b64, i16 = deps.i16, ahoraMs = deps.ahora, consola = deps.consola || null;
  const TS = D.ts, N = TS / RES, N2 = N + 2, SRS = D.srs, NS = TS / SRS, NS2 = NS + 2;
  const cx = D.centro_utm[0] as number, cy = D.centro_utm[1] as number, base = D.base || "";
  const lista: Tesela[] = [];
  let kx0 = 1e9, ky0 = 1e9, kx1 = -1e9, ky1 = -1e9;
  Object.keys(D.teselas).forEach(function (k) { const d = D.teselas[k] as TeselaIndice; kx0 = Math.min(kx0, d.kx); kx1 = Math.max(kx1, d.kx); ky0 = Math.min(ky0, d.ky); ky1 = Math.max(ky1, d.ky); });
  const NKX = kx1 - kx0 + 1, NKY = ky1 - ky0 + 1, G: (Tesela | undefined)[] = new Array(Math.max(0, NKX * NKY));
  Object.keys(D.teselas).forEach(function (k) {
    const d = D.teselas[k] as TeselaIndice, t: Tesela = { key: k, kx: d.kx, ky: d.ky, ox: d.kx * TS - cx, oy: d.ky * TS - cy, v: d.v, np: d.np || 0, estado: 0, dtm: null, chm: null, suel: null, pts: null, ortImg: null, ortCv: null, ortPix: null, ortW: 0, ortH: 0, gen: 0 };
    G[(d.ky - ky0) * NKX + (d.kx - kx0)] = t; lista.push(t);
  });
  function cl(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }
  function tesela(x: number, y: number): Tesela | null { const i = Math.floor((x + cx) / TS) - kx0, j = Math.floor((y + cy) / TS) - ky0; return i < 0 || j < 0 || i >= NKX || j >= NKY ? null : G[j * NKX + i] || null; }

  // relieve grueso (8 m) para lo que aún no está cargado
  const GR = D.grueso, gz = Float32Array.from(i16(GR.b64), function (v) { return v / 100; });
  function grueso(x: number, y: number): number {
    const fx = cl((x - GR.x0) / GR.res - 0.5, 0, GR.w - 1.001), fy = cl((GR.yN - y) / GR.res - 0.5, 0, GR.h - 1.001), i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, w = GR.w;
    return ((gz[j * w + i] as number) * (1 - tx) + (gz[j * w + i + 1] as number) * tx) * (1 - ty) + ((gz[(j + 1) * w + i] as number) * (1 - tx) + (gz[(j + 1) * w + i + 1] as number) * tx) * ty;
  }
  function suelo(x: number, y: number): number {
    const ux = x + cx, uy = y + cy, kx = Math.floor(ux / TS), ky = Math.floor(uy / TS), i0 = kx - kx0, j0 = ky - ky0, t = i0 >= 0 && j0 >= 0 && i0 < NKX && j0 < NKY ? G[j0 * NKX + i0] : null;
    if (!t || !t.dtm) return grueso(x, y);
    const fx = (ux - kx * TS) / RES - 0.5, fy = (uy - ky * TS) / RES - 0.5, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, o = (j + 1) * N2 + i + 1, d = t.dtm;
    return ((d[o] as number) * (1 - tx) + (d[o + 1] as number) * tx) * (1 - ty) + ((d[o + N2] as number) * (1 - tx) + (d[o + N2 + 1] as number) * tx) * ty;
  }
  function copaAlta(x: number, y: number): number { // altura de vegetación en ese punto (a 0,1 m)
    const t = tesela(x, y); if (!t || !t.chm || x < (t.v[0] as number) || x >= (t.v[2] as number) || y < (t.v[1] as number) || y >= (t.v[3] as number)) return 0;
    const ix = Math.floor((x - t.ox) / RES), iy = Math.floor((y - t.oy) / RES); return (t.chm[iy * N + ix] as number) / 10;
  }
  function colorSuelo(x: number, y: number, out: number[]): void {   // bilineal: el suelo se guarda a 2 m
    const t = tesela(x, y); if (!t || !t.suel) { out[0] = 0.62; out[1] = 0.54; out[2] = 0.4; return; }
    const fx = (x - t.ox) / SRS - 0.5, fy = (y - t.oy) / SRS - 0.5, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, s = t.suel, o = ((j + 1) * NS2 + i + 1) * 3, o2 = o + NS2 * 3;
    for (let c = 0; c < 3; c++) out[c] = (((s[o + c] as number) * (1 - tx) + (s[o + 3 + c] as number) * tx) * (1 - ty) + ((s[o2 + c] as number) * (1 - tx) + (s[o2 + 3 + c] as number) * tx) * ty) / 255;
  }

  // ortofoto: cada tesela trae la suya (768 px); los píxeles se decodifican solo cuando alguien los muestrea, y para lo lejano hay un mosaico de 1 m
  const mos: Mosaico = { img: null, pix: null, w: 0, h: 0 };
  let reloj = 0;   // reloj: ms del último refresco (cada 0,2 s en actualiza); marca el último uso de cada ortofoto
  function pixeles(img: ImagenMin): { cv: LienzoMin; px: Uint8ClampedArray } {
    const c = deps.lienzo(); c.width = img.naturalWidth || img.width || 0; c.height = img.naturalHeight || img.height || 0;
    const g = c.getContext("2d", { willReadFrequently: true }) as Contexto2DMin; g.drawImage(img, 0, 0);
    return { cv: c, px: (g.getImageData as NonNullable<Contexto2DMin["getImageData"]>)(0, 0, c.width, c.height).data };
  }
  function decodificaOrto(t: Tesela): Uint8ClampedArray {
    const r = pixeles(t.ortImg as ImagenMin); t.ortCv = r.cv; t.ortPix = r.px; t.ortW = r.cv.width; t.ortH = r.cv.height; t.uso = ahoraMs(); nDec++;
    desalojaOrto(); return t.ortPix;
  }
  // M4: tope de ortofotos decodificadas a la vez (cada una ~2,4 MB de píxeles). Pasado el tope se suelta la MENOS USADA recientemente (t.uso = el último muestreo), salvo
  // la tesela bajo la cámara y sus cuatro vecinas (foco: lo fija liberaOrtoLejos) y las usadas en los últimos ORTO_GRACIA ms: así nada se suelta para decodificarse
  // otra vez en el mismo fotograma (el tope es blando: si todo está protegido se excede). ?ortoMax=N lo fija a mano (para medir); por defecto 8 en móvil/gafas y 20 en escritorio.
  const ORTO_GRACIA = 8000;
  let nDec = 0, nDes = 0, foco: { x: number; y: number } | null = null;
  const ORTO_MAX = (function () {
    const m = /[?&]ortoMax=(\d+)/.exec(deps.busqueda || ""); if (m && +(m[1] as string) >= 1) return +(m[1] as string);
    return deps.ortoMaxDefecto();   // AG-0.3: 8 en móvil, gafas o poca memoria; 20 en escritorio (01a_aparato.js)
  })();
  function vecina(c: Tesela, dx: number, dy: number): Tesela | undefined {
    return c.kx + dx >= kx0 && c.kx + dx <= kx1 && c.ky + dy >= ky0 && c.ky + dy <= ky1 ? G[(c.ky + dy - ky0) * NKX + (c.kx + dx - kx0)] : undefined;
  }
  function desalojaOrto(): void {
    const vivas = lista.filter(function (t) { return t.ortPix; }); if (vivas.length <= ORTO_MAX) return;
    const ahora = ahoraMs(), prot: Record<string, number> = {}, c = foco && tesela(foco.x, foco.y);
    if (c) [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { const v = vecina(c, d[0] as number, d[1] as number); if (v) prot[v.key] = 1; });
    const cand = vivas.filter(function (t) { return !prot[t.key] && ahora - (t.uso || 0) > ORTO_GRACIA; }).sort(function (a, b) { return (a.uso || 0) - (b.uso || 0); });
    for (let i = 0; i < cand.length && vivas.length - i > ORTO_MAX; i++) { liberaOrtoPix(cand[i] as Tesela); nDes++; }
  }
  function muestrea(p: Uint8ClampedArray, w: number, h: number, u: number, v: number, out: number[]): void {
    u = cl(u, 0, w - 1.001); v = cl(v, 0, h - 1.001);
    const iu = Math.floor(u), iv = Math.floor(v), tu = u - iu, tv = v - iv, o = (iv * w + iu) * 4, o2 = o + w * 4;
    for (let c = 0; c < 3; c++) out[c] = (((p[o + c] as number) * (1 - tu) + (p[o + 4 + c] as number) * tu) * (1 - tv) + ((p[o2 + c] as number) * (1 - tu) + (p[o2 + 4 + c] as number) * tu) * tv) / 255;
  }
  function orto(x: number, y: number, out: number[]): void {
    const t = tesela(x, y); let p = t && t.ortPix; if (p && t) t.uso = reloj;
    if (!p && t && t.ortImg && t.ortImg.complete && t.ortImg.naturalWidth) p = decodificaOrto(t);
    if (p && t) { muestrea(p, t.ortW, t.ortH, (x - t.ox) / TS * t.ortW - 0.5, (TS - (y - t.oy)) / TS * t.ortH - 0.5, out); return; }
    if (mos.pix) { const M = D.mosaico; muestrea(mos.pix, mos.w, mos.h, (x - M.x0) / M.res - 0.5, (M.yN - y) / M.res - 0.5, out); return; }
    out[0] = 0.55; out[1] = 0.52; out[2] = 0.4;
  }
  function ortoGrueso(x: number, y: number, out: number[]): void {   // el mosaico de 1 m (para lo lejano y para el color de cada olivo en los niveles 1 y 2)
    if (!mos.pix) { out[0] = 0.55; out[1] = 0.52; out[2] = 0.4; return; }
    const M = D.mosaico; muestrea(mos.pix, mos.w, mos.h, (x - M.x0) / M.res - 0.5, (M.yN - y) / M.res - 0.5, out);
  }
  // pinta en un canvas 2D la región [vx0, vx0+ancho] × [vy1-alto, vy1] del mundo (el minimapa): lo lejano con el mosaico, lo cercano con las ortofotos de las teselas
  function pintaOrto(c: Contexto2DMin, vx0: number, vy1: number, ancho: number, alto: number, dw: number, dh: number): void {
    const escx = dw / ancho, escy = dh / alto;
    if (ancho > TS * 1.5 && mos.img) {
      const M = D.mosaico; c.drawImage(mos.img, (vx0 - M.x0) / M.res, (M.yN - vy1) / M.res, ancho / M.res, alto / M.res, 0, 0, dw, dh); return;
    }
    c.fillStyle = "#8d8668"; if (c.fillRect) c.fillRect(0, 0, dw, dh);
    if (mos.img) { const M = D.mosaico; c.drawImage(mos.img, (vx0 - M.x0) / M.res, (M.yN - vy1) / M.res, ancho / M.res, alto / M.res, 0, 0, dw, dh); }   // L8-13: debajo, el mosaico de 1 m, para que donde falta la tesela no quede el color liso
    lista.forEach(function (t) {
      const im: (LienzoMin | ImagenMin) | null = t.ortCv || (t.ortImg && t.ortImg.complete && t.ortImg.naturalWidth ? t.ortImg : null); if (!im) return;
      const ax0 = Math.max(vx0, t.v[0] as number), ax1 = Math.min(vx0 + ancho, t.v[2] as number), ay1 = Math.min(vy1, t.v[3] as number), ay0 = Math.max(vy1 - alto, t.v[1] as number); if (ax1 <= ax0 || ay1 <= ay0) return;
      const sw = im.width || (im as ImagenMin).naturalWidth || 0, sh = im.height || (im as ImagenMin).naturalHeight || 0, ty1 = t.oy + TS;
      c.drawImage(im, (ax0 - t.ox) / TS * sw, (ty1 - ay1) / TS * sh, (ax1 - ax0) / TS * sw, (ay1 - ay0) / TS * sh, (ax0 - vx0) * escx, (vy1 - ay1) * escy, (ax1 - ax0) * escx, (ay1 - ay0) * escy);
    });
  }

  // carga: los datos de una tesela vienen de sus ficheros (t/<clave>.json y .jpg, del mismo origen)
  // L1-05: la decodificación, a rebanadas (cada yield es un punto donde la Cola puede parar). gen: la generación de la tesela cuando se pidió; si se soltó
  // mientras tanto (L2-03), lo decodificado se tira. Devuelve si quedó cargada.
  function* decodificaG(t: Tesela, texto: string, gen: number): Generator<unknown, boolean, unknown> {
    try {
      const c = JSON.parse(texto) as JsonTesela; yield;
      const d = i16(c.dtm), f = new Float32Array(d.length); for (let i = 0; i < d.length; i++) f[i] = (d[i] as number) / 100;
      yield;
      const chm = b64(c.chm), suel = b64(c.suelo); yield;
      const pts = c.pts ? i16(c.pts) : null;
      if (t.gen !== gen) return false;
      t.dtm = f; t.chm = chm; t.suel = suel; t.pts = pts; t.np = c.np || 0; t.estado = 2;
      return true;
    } catch (e) {
      if (consola) consola.error(e);
      if (t.gen === gen) { t.estado = 3; t.fallo = ahoraMs(); }
      return false;
    }
  }
  /** corre un trabajo a rebanadas en la Cola del exterior o, sin ella, en el acto */
  function enCola(clave: string, prio: number, g: Generator<unknown, unknown, unknown>, fin: (v: unknown) => void): void {
    const c = deps.cola ? deps.cola() : null;
    if (c) { c.pon(clave, prio, g as Trabajo, fin); return; }
    let r = g.next(); while (!r.done) r = g.next(); fin(r.value);
  }
  function cargaImagen(src: string, fin: (im: ImagenMin | null) => void): ImagenMin { const im = deps.imagen(); im.onload = function () { fin(im); }; im.onerror = function () { fin(null); }; im.src = src; return im; }
  function cargaTesela(t: Tesela, fin: (t: Tesela) => void): void {
    const gen = t.gen;
    deps.trae(base + "t/" + t.key + ".json").then(function (r) { if (!r.ok) throw new Error("tesela " + t.key + ": " + r.status); return r.text(); }).then(function (texto) {
      enCola("M" + t.key, t.prio === undefined ? 0 : t.prio, decodificaG(t, texto, gen), function (ok) {
        if (!ok || t.gen !== gen) { fin(t); return; }
        cargaImagen(base + "t/" + t.key + ".jpg", function (im) { if (t.gen === gen) t.ortImg = im; fin(t); });
      });
    }).catch(function (e) { if (consola) consola.error(e); if (t.gen === gen) { t.estado = 3; t.fallo = ahoraMs(); } fin(t); });
  }
  // planificador de carga: pide las teselas por cercanía a la cámara, de MAXF en MAXF; cada una avisa a los que se registraron con alCargar (terreno, nube, olivos)
  const MAXF = 3, oyentes: ((t: Tesela) => void)[] = [], alSueltan: ((t: Tesela) => void)[] = [];
  let enVuelo = 0;
  function dist(t: Tesela, px: number, py: number, pz: number): number {   // distancia en 3D de un punto de la cámara al rectángulo de la tesela
    const v = t.v as [number, number, number, number], hx = (v[2] - v[0]) / 2, hy = (v[3] - v[1]) / 2, mx = (v[0] + v[2]) / 2, my = (v[1] + v[3]) / 2;
    const dx = Math.max(0, Math.abs(px - mx) - hx), dz = Math.max(0, Math.abs(pz + my) - hy), dy = Math.max(0, py - (t.hc === undefined ? 0 : t.hc * (deps.exag ? deps.exag() || 1 : 1))); return Math.sqrt(dx * dx + dz * dz + dy * dy);   // L8-08: la cota, exagerada como la cámara
  }
  // L1-05: los oyentes, uno por rebanada en la Cola (sin Cola, en el acto)
  function* avisaG(t: Tesela, gen: number): Generator<unknown, void, unknown> {
    for (let i = 0; i < oyentes.length; i++) { if (t.gen !== gen) return; (oyentes[i] as (t: Tesela) => void)(t); if (i < oyentes.length - 1) yield; }
  }
  function pide(t: Tesela, prio?: number): void {
    if (t.estado !== 0 && !(t.estado === 3 && ahoraMs() - (t.fallo || 0) > 15000)) return;
    t.estado = 1; enVuelo++; if (prio !== undefined) t.prio = prio;
    const gen = t.gen;
    cargaTesela(t, function () { enVuelo--; if (t.dtm && t.gen === gen) enCola("MA" + t.key, t.prio === undefined ? 0 : t.prio, avisaG(t, gen), function () {}); });
  }
  function actualiza(px: number, py: number, pz: number): void {
    reloj = ahoraMs();
    if (enVuelo >= MAXF) return;
    const cand = lista.filter(function (t) { return (t.estado === 0 || (t.estado === 3 && ahoraMs() - (t.fallo || 0) > 15000)) && dist(t, px, py, pz) < RADIO_CARGA; });
    cand.sort(function (a, b) { return dist(a, px, py, pz) - dist(b, px, py, pz); });
    for (let i = 0; i < cand.length && enVuelo < MAXF; i++) pide(cand[i] as Tesela, dist(cand[i] as Tesela, px, py, pz));
  }
  function alCargar(f: (t: Tesela) => void): void { oyentes.push(f); }
  function arranca(fin: () => void): void {   // solo se espera al mosaico; las teselas llegan por actualiza()
    liberado = false;
    cargaImagen(D.mosaico.jpg || "", function (im) { if (im) { mos.img = im; const r = pixeles(im); mos.pix = r.px; mos.w = r.cv.width; mos.h = r.cv.height; } fin(); });
  }
  function liberaOrtoPix(t: Tesela): void { t.ortPix = null; t.ortCv = null; }   // la ortofoto decodificada ocupa 2,4 MB por tesela: se suelta cuando la tesela queda lejos
  function liberaOrtoLejos(px: number, py: number, pz: number): void {
    reloj = ahoraMs(); foco = { x: px, y: -pz };
    lista.forEach(function (t) { if (t.ortPix && dist(t, px, py, pz) > 900) liberaOrtoPix(t); });
    desalojaOrto();
    sueltaLejos(px, py, pz);   // L2-03
  }
  function ortoEstado(): EstadoOrto { return { max: ORTO_MAX, vivas: lista.filter(function (t) { return t.ortPix; }).length, decodificadas: nDec, desalojadas: nDes, mb: Math.round(lista.reduce(function (a, t) { return a + (t.ortPix ? t.ortPix.length : 0); }, 0) / 1048576 * 10) / 10 }; }
  function* aseguraOrto(t: Tesela): Generator<unknown, void, unknown> {   // decodifica (en su propia rebanada) la ortofoto de la tesela y de sus vecinas cargadas: el color de un punto a veces cae en la de al lado
    const ks = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i] as [number, number], v = vecina(t, k[0], k[1]); if (!v ||   // L8-09: vecina() comprueba los límites en x y en y
         v.ortPix || !v.ortImg || !v.ortImg.complete || !v.ortImg.naturalWidth) continue;
      if (k[0] || k[1]) { if (Math.abs(k[0]) + Math.abs(k[1]) > 1) continue; }   // las diagonales no hacen falta: el desplazamiento es de pocos metros
      v.uso = ahoraMs(); decodificaOrto(v); yield;
    }
  }

  // ---- L2-03: soltar los datos de una tesela (y de todas, al liberar)
  let nSueltas = 0, liberado = false;
  /** suelta lo que el Mundo guarda de la tesela y la deja «sin pedir»; avisa a alSoltar. Una que viene de camino (estado 1) también: lo que llegue se tira */
  function sueltaTesela(t: Tesela): boolean {
    if (t.estado === 0 && !t.dtm && !t.ortImg) return false;
    const tenia = t.estado === 2;
    t.gen++; t.lejos = false;
    if (deps.cola) { const c = deps.cola(); if (c && c.cancela) { c.cancela("M" + t.key); c.cancela("MA" + t.key); } }
    t.dtm = null; t.chm = null; t.suel = null; t.pts = null; liberaOrtoPix(t);
    if (t.ortImg) { t.ortImg.onload = t.ortImg.onerror = null; t.ortImg = null; }
    if (t["bins"]) t["bins"] = null;   // 07b_arboles (binsG): el reparto de los puntos por celda, derivado de pts; sin pts no vale y se rehace al volver
    t.estado = 0;
    if (tenia) { nSueltas++; for (const f of alSueltan) f(t); }
    return tenia;
  }
  /** las teselas cargadas a más de RADIO_SUELTA m en dos pasadas seguidas (cada 3 s, con liberaOrtoLejos) se sueltan; devuelve cuántas */
  function sueltaLejos(px: number, py: number, pz: number): number {
    let n = 0;
    for (const t of lista) {
      if (t.estado !== 2) { t.lejos = false; continue; }
      if (dist(t, px, py, pz) <= RADIO_SUELTA) { t.lejos = false; continue; }
      if (!t.lejos) { t.lejos = true; continue; }
      if (sueltaTesela(t)) n++;
    }
    return n;
  }
  function alSoltar(f: (t: Tesela) => void): void { alSueltan.push(f); }
  /** el libera() del componente (al liberar el exterior): todas las teselas y el mosaico. Se puede llamar dos veces; tras él, arranca() vuelve a pedir el mosaico */
  function libera(): void {
    for (const t of lista) sueltaTesela(t);
    if (mos.img) { mos.img.onload = mos.img.onerror = null; }
    mos.img = null; mos.pix = null; mos.w = 0; mos.h = 0;
    foco = null; liberado = true;
  }
  function estadoTeselas(): EstadoTeselas {
    return { cargadas: lista.filter(function (t) { return t.estado === 2; }).length, pedidas: lista.filter(function (t) { return t.estado === 1; }).length, sueltas: nSueltas, radioSuelta: RADIO_SUELTA, enCola: enVuelo };
  }

  /** el componente (ADR-0023): del exterior, siempre encendido, sin dibujo. Lo registra 90_final.js (Componentes, de 02c, se monta después que este módulo).
   *  Su api (Componentes.api("mundo-teselas")) es solo el estado: el Mundo lo leen todos por su nombre desde que se monta el motor */
  const componente: Manifiesto = {
    id: "mundo-teselas", version: 1, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0, texturasMB: 0 },   // no dibuja ni sube texturas (las de su relieve las sube 04d)
    fases: {}, actualiza: {}, mundos: ["exterior"],
    monta: function () { if (liberado) arranca(function () {}); return { estado: estadoTeselas }; },
    libera: function () { libera(); }
  };
  return { TS: TS, N: N, N2: N2, NS: NS, NS2: NS2, SRS: SRS, cx: cx, cy: cy, lista: lista, tesela: tesela, suelo: suelo, copaAlta: copaAlta, colorSuelo: colorSuelo, orto: orto, ortoGrueso: ortoGrueso, pintaOrto: pintaOrto, arranca: arranca, actualiza: actualiza, alCargar: alCargar, dist: dist, liberaOrtoPix: liberaOrtoPix,
    cargaTesela: cargaTesela, aseguraOrto: aseguraOrto, liberaOrtoLejos: liberaOrtoLejos, decodificaOrto: decodificaOrto, ortoEstado: ortoEstado, grueso: grueso, mosaico: mos,
    sueltaTesela: sueltaTesela, sueltaLejos: sueltaLejos, alSoltar: alSoltar, libera: libera, estadoTeselas: estadoTeselas, componente: componente };
}

export type Mundo = ReturnType<typeof creaMundo>;

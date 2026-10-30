// Tarjetas de hoja de los escalones E1 y E2 (O9b, ADR-0022 §3): las ramitas del E0 se agrupan en RACIMOS por cercanía y cada racimo se dibuja
// con una «tarjeta» de tres planos cruzados (6 triángulos) texturizados con un atlas de racimos horneado por época (texturas.js,
// dibujaAtlasTarjetas). Conserva la masa visual del E0 en vez de quitar hojas: cada plano mide lo que cubren de verdad las ramitas del racimo
// vistas de frente por ese plano (área cubierta estimada / cobertura de la celda del atlas), dentro de la caja del racimo. Sin THREE ni DOM: lo usan
// niveles.js (trabajador, Node y el hornero) y el montaje (geosTarjeta).
//
// Racimos: rejilla de vóxeles en METROS (con receta.escala) sobre el centro de cada ramita; el lado se busca (bisección) para que salgan cerca
// de RACIMOS[nivel] racimos no vacíos. Marco de cada racimo: u = radial horizontal (del eje del tronco hacia fuera), y = arriba, t = u × y.
// Planos: A (normal u, el que se ve desde fuera), B (normal t) y C (horizontal, el de la vista cenital); la tarjeta lleva la matriz
// [u·e_u, y·e_y, t·e_t, centro] y la geometría unidad (geosTarjeta) pone A en el plano y-t, B en u-y y C en u-t, cada uno con su celda.
// Área de cada plano: celdas de una rejilla REJ × REJ sobre la caja proyectada del racimo; cubierta = 1 − (1 − PHI_RAMITA)^k (k = ramitas que
// caen encima). Con las tres áreas (A = e_t·e_y, B = e_u·e_y, C = e_u·e_t) salen los tres lados, acotados a [MIN_CAJA, 1] de la caja.

/** Racimos objetivo por escalón (E2VR = E2: las gafas usan las mismas tarjetas, ADR-0022 §3) */
export const RACIMOS = Object.freeze({ E1: 320, E2: 140 });
/** Fracción opaca (alfa ≥ 0,45) de la imagen de una ramita (dibujaRamita, 256 × 512) y de una celda del atlas; medidas en Chrome (o9b_tarjetas.mjs) */
export const PHI_RAMITA = 0.30, PHI_CELDA = 0.55;
const REJ = 10, MIN_CAJA = 0.35;
/** El atlas: 4 × 2 celdas de 256 px; fila 0 sin olivas (geo «tarjeta»), fila 1 con olivas (geo «tarjetaO», E2 en épocas con fruto); columnas 0-2 = planos A, B, C */
export const ATLAS = Object.freeze({ ancho: 1024, alto: 512, cols: 4, filas: 2, celda: 256, version: 1 });
/** Triángulos de una tarjeta (tres planos) */
export const TRI_TARJETA = 6;

// la tarjeta de ramita del núcleo: PlaneGeometry(0.3, 0.6) subida 0,27 (nucleo.js, geosCompartidas)
const RAMITA = [[-0.15, -0.03], [0.15, -0.03], [0.15, 0.57], [-0.15, 0.57]];

/** Geometría unidad de la tarjeta (tres planos de lado 1 centrados), como arrays; `fila` = fila del atlas. Los UV, con flipY de three (v = 1 arriba) */
function geoTarjeta(fila) {
  const pos = [], nor = [], uv = [], ind = [], m = 2 / ATLAS.ancho;   // un margen de 2 texeles para no tomar la celda vecina
  const celda = col => [col / ATLAS.cols + m, (col + 1) / ATLAS.cols - m, 1 - (fila + 1) / ATLAS.filas + m, 1 - fila / ATLAS.filas - m];
  // [esquina(s, w) → [x, y, z]], normal, columna: s horizontal de la imagen, w vertical
  const planos = [[(s, w) => [0, w, s], [1, 0, 0], 0], [(s, w) => [s, w, 0], [0, 0, 1], 1], [(s, w) => [s, 0, -w], [0, 1, 0], 2]];
  for (const [f, n, col] of planos) {
    const [u0, u1, v0, v1] = celda(col), b = pos.length / 3;
    for (const [s, w] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) { pos.push(...f(s, w)); nor.push(...n); uv.push(s < 0 ? u0 : u1, w < 0 ? v0 : v1); }
    ind.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { atrib: { position: new Float32Array(pos), normal: new Float32Array(nor), uv: new Float32Array(uv) }, indice: Uint32Array.from(ind),
    caja: { min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 } } };
}
let geosCache = null;
/** Las geometrías compartidas de las tarjetas: { tarjeta, tarjetaO } (misma forma que las de geosCompartidas del núcleo) */
export function geosTarjeta() { return geosCache || (geosCache = { tarjeta: geoTarjeta(0), tarjetaO: geoTarjeta(1) }); }

// ---- racimos
function centros(piezas) {
  const L = [];
  for (const p of piezas) for (let i = 0; i < p.n; i++) {
    const m = p.matrices, b = i * 16;
    L.push({ p, i, x: m[b + 4] * 0.27 + m[b + 12], y: m[b + 5] * 0.27 + m[b + 13], z: m[b + 6] * 0.27 + m[b + 14] });
  }
  return L;
}
function agrupa(L, lado, esc) {
  const g = new Map();
  for (const c of L) {
    const k = Math.floor(c.x * esc[0] / lado) + "," + Math.floor(c.y * esc[1] / lado) + "," + Math.floor(c.z * esc[2] / lado);
    let a = g.get(k); if (!a) g.set(k, a = []); a.push(c);
  }
  return [...g.values()];
}
/** Los racimos (listas de {p, i, x, y, z}) con un lado de vóxel tal que salgan cerca de `objetivo`; deterministas (orden de inserción) */
export function racimos(piezas, escala, objetivo) {
  const it = racimosG(piezas, escala, objetivo);
  for (;;) { const x = it.next(); if (x.done) return x.value; }
}
function* racimosG(piezas, escala, objetivo) {
  const L = centros(piezas);
  if (!L.length) return { grupos: [], lado: 0 };
  let lo = 0.02, hi = 8, G = null, lado = hi;
  for (let it = 0; it < 30; it++) {   // más lado, menos racimos
    yield;
    const m = Math.sqrt(lo * hi), g = agrupa(L, m, escala);
    if (g.length > objetivo) lo = m; else { hi = m; G = g; lado = m; }
    if (hi / lo < 1.01) break;
  }
  return { grupos: G || agrupa(L, hi, escala), lado };
}

// ---- tamaño de cada plano por la masa que cubre
function enQuad(px, py, q) {   // q: 4 esquinas [x, y] de un cuadrilátero convexo
  let s = 0;
  for (let k = 0; k < 4; k++) {
    const a = q[k], b = q[(k + 1) & 3], c = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
    if (c !== 0) { const sg = c > 0 ? 1 : -1; if (s === 0) s = sg; else if (sg !== s) return false; }
  }
  return true;
}
/** Área cubierta y caja de las ramitas proyectadas sobre los ejes (a, b) */
function cubierta(esq, a, b) {
  const Q = esq.map(q => q.map(v => [v[0] * a[0] + v[1] * a[1] + v[2] * a[2], v[0] * b[0] + v[1] * b[1] + v[2] * b[2]]));
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of Q) for (const [x, y] of q) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const dx = (x1 - x0) / REJ, dy = (y1 - y0) / REJ, cq = Q.map(q => [Math.min(q[0][0], q[1][0], q[2][0], q[3][0]), Math.max(q[0][0], q[1][0], q[2][0], q[3][0]),
    Math.min(q[0][1], q[1][1], q[2][1], q[3][1]), Math.max(q[0][1], q[1][1], q[2][1], q[3][1])]);
  let s = 0;
  for (let j = 0; j < REJ; j++) for (let i = 0; i < REJ; i++) {
    const px = x0 + (i + 0.5) * dx, py = y0 + (j + 0.5) * dy; let k = 0;
    for (let n = 0; n < Q.length; n++) { const c = cq[n]; if (px >= c[0] && px <= c[1] && py >= c[2] && py <= c[3] && enQuad(px, py, Q[n])) k++; }
    if (k) s += 1 - Math.pow(1 - PHI_RAMITA, k);
  }
  return { area: s * dx * dy, ext: [x1 - x0, y1 - y0], centro: [(x0 + x1) / 2, (y0 + y1) / 2] };
}

/**
 * Las tarjetas de un nivel: de las piezas de ramitas del E0 (en el espacio de la pieza, con la escala del árbol solo para medir en metros)
 * a UNA pieza de instancias de la geometría «tarjeta» (o «tarjetaO», con olivas en el atlas).
 * @returns pieza de receta
 */
export function tarjetasDe(ramitas, escala, nivel, conOlivas) {
  const it = tarjetasDeG(ramitas, escala, nivel, conOlivas);
  for (;;) { const x = it.next(); if (x.done) return x.value; }
}
/** tarjetasDe como generador: cede el turno (yield) en cada paso de la bisección y cada 4 racimos (para la Cola del motor o el trabajador) */
export function* tarjetasDeG(ramitas, escala, nivel, conOlivas) {
  const { grupos } = yield* racimosG(ramitas, escala, RACIMOS[nivel] || RACIMOS.E2), n = grupos.length;
  const matrices = new Float32Array(n * 16), colores = new Float32Array(n * 3), nodo = new Int32Array(n);
  yield;
  for (let k = 0; k < n; k++) {
    const g = grupos[k];
    if (k % 4 === 3) yield;
    // el marco: u radial (horizontal), y arriba, t = u × y
    let cx = 0, cz = 0; for (const c of g) { cx += c.x; cz += c.z; } cx /= g.length; cz /= g.length;
    let ul = Math.hypot(cx, cz); const u = ul > 1e-6 ? [cx / ul, 0, cz / ul] : [1, 0, 0], y = [0, 1, 0], t = [-u[2], 0, u[0]];   // t = u × y: marco a derechas
    // las cuatro esquinas de cada ramita, en el espacio de la pieza (el de las matrices)
    const esq = g.map(c => { const m = c.p.matrices, b = c.i * 16; return RAMITA.map(([a, w]) => [m[b] * a + m[b + 4] * w + m[b + 12], m[b + 1] * a + m[b + 5] * w + m[b + 13], m[b + 2] * a + m[b + 6] * w + m[b + 14]]); });
    const A = cubierta(esq, t, y), B = cubierta(esq, u, y), C = cubierta(esq, u, t);
    // cajas en cada eje (u y t salen dos veces: de B y C y de A y C; se queda la mayor) y centro de la caja
    const cajaU = Math.max(B.ext[0], C.ext[0]), cajaY = Math.max(A.ext[1], B.ext[1]), cajaT = Math.max(A.ext[0], C.ext[1]);
    const aA = A.area / PHI_CELDA, aB = B.area / PHI_CELDA, aC = C.area / PHI_CELDA;
    const lim = (v, caja) => Math.min(caja, Math.max(caja * MIN_CAJA, v || 0));
    const eu = lim(Math.sqrt(aB * aC / Math.max(1e-9, aA)), cajaU), ey = lim(Math.sqrt(aA * aB / Math.max(1e-9, aC)), cajaY), et = lim(Math.sqrt(aA * aC / Math.max(1e-9, aB)), cajaT);
    const cu = (B.centro[0] + C.centro[0]) / 2, cy = (A.centro[1] + B.centro[1]) / 2, ct = (A.centro[0] + C.centro[1]) / 2;
    const o = k * 16;
    matrices.set([u[0] * eu, u[1] * eu, u[2] * eu, 0, y[0] * ey, y[1] * ey, y[2] * ey, 0, t[0] * et, t[1] * et, t[2] * et, 0,
      u[0] * cu + y[0] * cy + t[0] * ct, u[1] * cu + y[1] * cy + t[1] * ct, u[2] * cu + y[2] * cy + t[2] * ct, 1], o);
    let r = 0, gg = 0, bb = 0; for (const c of g) { const q = c.p.colores; if (q) { r += q[c.i * 3]; gg += q[c.i * 3 + 1]; bb += q[c.i * 3 + 2]; } else { r++; gg++; bb++; } }
    colores.set([r / g.length, gg / g.length, bb / g.length], k * 3);
    nodo[k] = g[0].p.nodo ? g[0].p.nodo[g[0].i] : -1;
  }
  const p0 = ramitas[0];
  return { clase: "instancias", mat: "tarjeta", geo: conOlivas ? "tarjetaO" : "tarjeta", sombra: [true, true], prof: "tarjeta_sombra", pos: p0.pos, rot: p0.rot, esc: p0.esc,
    rol: "ramitas", rejilla: null, n, matrices, colores, nodo };
}

// Cartulinas recortadas a la silueta (AG-2.2): el polígono convexo de pocos vértices que abraza lo opaco de una textura con recorte alfa, para
// dibujar la cartulina con ese polígono en lugar del rectángulo entero y no pintar (ni descartar) los píxeles transparentes de fuera.
// Sin THREE ni DOM: lo usan el motor (07ab_generados, 07ac_lejanos: al montar los materiales o al hornear) y la tubería (tuberia/olivos/impostores.mjs).
//
// Cómo (el «particle trimming» de Humus, 2011, y el `SpriteMeshType.Tight` de Unity, en convexo):
//   1. los texeles que pasan el corte (alfa ≥ umbral, el mismo alphaTest del material) en el nivel 0 y en los mipmaps de al menos MIN_TEXELES de
//      lado; cada texel cuenta como su cuadrado ENSANCHADO `ensancha` texeles de su nivel (el filtrado bilineal lee hasta medio texel fuera:
//      con 1 texel queda margen), recortado a la región;
//   2. la envolvente convexa de esos cuadrados (cadena monótona de Andrew, con los extremos de cada fila: dos por fila);
//   3. reducida a `vertices` vértices quitando cada vez la arista que menos área añade al prolongar sus dos vecinas (el polígono resultante sigue
//      conteniendo la envolvente) y sin salirse de la región (en un atlas, salir sería leer la celda vecina). Si no se puede, null: rectángulo.
// Por qué código propio: three no trae envolvente 2D (ShapeUtils triangula; ConvexHull de los addons es 3D) y las librerías de envolvente o
// simplificación (hull.js, concaveman, simplify-js) no garantizan que el polígono reducido CONTENGA lo opaco (simplify-js quita vértices hacia dentro);
// la reducción por prolongación de aristas es la que lo garantiza, y la envolvente de dos puntos por fila son quince líneas.

/** Valores de partida: 8 vértices (6 triángulos), 1 texel de margen, mipmaps de ≥ 16 texeles, y por encima del 90 % del rectángulo no compensa */
export const SILUETA = Object.freeze({ VERTICES: 8, ENSANCHA: 1, MIN_TEXELES: 16, MAX_AREA: 0.9 });

const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Envolvente convexa (Andrew), en sentido antihorario y sin puntos alineados */
export function envolvente(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cruz(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length >= 2 && cruz(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
}

/** Área (con signo: positiva en antihorario) */
export function area(P) { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }

/** ¿p está dentro del polígono convexo antihorario P (o en su borde, con tolerancia eps)? */
export function contiene(P, p, eps) {
  const e = eps === undefined ? 1e-9 : eps;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (cruz(a, b, p) / l < -e) return false;
  }
  return true;
}

/**
 * Reduce un polígono convexo antihorario a ≤ k vértices que lo CONTIENEN, sin salir del rectángulo r = [x0, y0, x1, y1].
 * Cada paso quita la arista (P[i], P[i+1]) cuyo cambio por el punto Q donde se cortan sus aristas vecinas prolongadas añade menos área.
 * @returns el polígono, o null si no se puede (todas las prolongaciones se salen de r o no se cortan)
 */
export function reduce(P0, k, r) {
  let P = P0.slice();
  const eps = 1e-9, dentro = q => !r || (q[0] >= r[0] - eps && q[0] <= r[2] + eps && q[1] >= r[1] - eps && q[1] <= r[3] + eps);
  while (P.length > k) {
    const n = P.length; let mejor = -1, aMin = Infinity, qMejor = null;
    for (let i = 0; i < n; i++) {
      const a0 = P[(i - 1 + n) % n], a = P[i], b = P[(i + 1) % n], b1 = P[(i + 2) % n];
      const d1 = [a[0] - a0[0], a[1] - a0[1]], d2 = [b1[0] - b[0], b1[1] - b[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
      if (den <= 1e-15) continue;   // las vecinas no convergen hacia fuera de la arista
      const t = ((b[0] - a[0]) * d2[1] - (b[1] - a[1]) * d2[0]) / den;
      if (t < 0) continue;
      const q = [a[0] + d1[0] * t, a[1] + d1[1] * t];
      if (!dentro(q)) continue;
      const ar = Math.abs(cruz(a, q, b)) / 2;
      if (ar < aMin) { aMin = ar; mejor = i; qMejor = q; }
    }
    if (mejor < 0) return null;
    const j = (mejor + 1) % n;
    if (j === 0) { P.splice(mejor, 1); P[0] = qMejor; } else P.splice(mejor, 2, qMejor);
  }
  return P;
}

/**
 * Mipmaps de caja del alfa (lo que hace la GPU con generateMipmaps: media de 2 × 2), hasta `minLado` texeles.
 * @param datos  RGBA8 (paso 4, alfa en el canal 3) o un canal (paso 1); @returns [{datos (un canal), ancho, alto, paso: 1, canal: 0}]
 */
export function mipsCaja(datos, ancho, alto, o) {
  const op = o || {}, paso = op.paso || 4, canal = op.canal === undefined ? 3 : op.canal, minLado = op.minLado || SILUETA.MIN_TEXELES;
  let w = ancho, h = alto, A = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) A[i] = datos[i * paso + canal];
  const out = [];
  while (w > 1 || h > 1) {
    const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1); if (Math.min(w2, h2) < minLado) break;
    const B = new Float32Array(w2 * h2), dx = w > 1 ? 2 : 1, dy = h > 1 ? 2 : 1;
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      let s = 0; for (let j = 0; j < dy; j++) for (let i = 0; i < dx; i++) s += A[(y * dy + j) * w + x * dx + i];
      B[y * w2 + x] = s / (dx * dy);
    }
    w = w2; h = h2; A = B;
    out.push({ datos: Uint8Array.from(A, v => Math.round(v)), ancho: w, alto: h, paso: 1, canal: 0 });
  }
  return out;
}

/**
 * La silueta de una región de una textura.
 * @param niveles  [{datos, ancho, alto, paso (4), canal (3)}]: nivel 0 y, si se quieren, sus mipmaps (los mismos que lee la GPU)
 * @param region   [u0, v0, u1, v1] en coordenadas de textura (v hacia arriba); por defecto la textura entera
 * @param o        { umbral (0-1, el alphaTest), ensancha (texeles), vertices, minTexeles, filaArriba (true: la fila 0 de `datos` es la de v = 1,
 *                 como un lienzo o un ImageData con flipY; false: la de v = 0, como readPixels) }
 * @returns { poligono: [[u, v]] antihorario o null (sin nada opaco, o no se pudo reducir), area (fracción de la región), opaco (fracción de
 *          texeles opacos del nivel 0), vertices, triangulos }
 */
export function siluetaDe(niveles, region, o) {
  const op = o || {}, umbral = op.umbral === undefined ? 0.5 : op.umbral, e = op.ensancha === undefined ? SILUETA.ENSANCHA : op.ensancha;
  const k = op.vertices || SILUETA.VERTICES, minT = op.minTexeles || SILUETA.MIN_TEXELES, arriba = op.filaArriba !== false;
  const R = region || [0, 0, 1, 1], corte = umbral * 255, pts = [];
  let opacos = 0, total = 0;
  niveles.forEach((L, nivel) => {
    const W = L.ancho, H = L.alto, paso = L.paso || 4, canal = L.canal === undefined ? 3 : L.canal;
    const x0 = Math.max(0, Math.floor(R[0] * W + 1e-6)), x1 = Math.min(W, Math.ceil(R[2] * W - 1e-6));
    const t0 = Math.max(0, Math.floor(R[1] * H + 1e-6)), t1 = Math.min(H, Math.ceil(R[3] * H - 1e-6));   // filas en v (desde abajo)
    if (nivel > 0 && Math.min(x1 - x0, t1 - t0) < minT) return;
    for (let t = t0; t < t1; t++) {
      const y = arriba ? H - 1 - t : t, base = y * W;
      let a = -1, b = -1;
      for (let x = x0; x < x1; x++) { if (L.datos[(base + x) * paso + canal] >= corte) { if (a < 0) a = x; b = x; if (nivel === 0) opacos++; } }
      if (nivel === 0) total += x1 - x0;
      if (a < 0) continue;
      const v0 = (t - e) / H, v1 = (t + 1 + e) / H, ua = (a - e) / W, ub = (b + 1 + e) / W;
      pts.push([ua, v0], [ua, v1], [ub, v0], [ub, v1]);
    }
  });
  const res = { poligono: null, area: 1, opaco: total ? opacos / total : 0, vertices: 4, triangulos: 2 };
  if (!pts.length) return res;
  const ra = (R[2] - R[0]) * (R[3] - R[1]);
  const c = pts.map(p => [Math.min(R[2], Math.max(R[0], p[0])), Math.min(R[3], Math.max(R[1], p[1]))]);
  const H0 = envolvente(c), P = H0.length > k ? reduce(H0, k, R) : H0;
  if (!P || P.length < 3) return res;
  res.poligono = P; res.area = area(P) / ra; res.vertices = P.length; res.triangulos = P.length - 2;
  return res;
}

/** ¿Compensa la silueta? (sí si existe y quita al menos el 10 % del rectángulo: MAX_AREA) */
export function compensa(s, maxArea) { return !!(s && s.poligono && s.area <= (maxArea || SILUETA.MAX_AREA)); }

/**
 * Cambia cada cuadrilátero de una geometría plana (4 vértices, 2 triángulos: PlaneGeometry o los planos de las tarjetas) por su silueta, con las
 * MISMAS uv (posición = la función afín de las uv del cuadrilátero) y la misma normal y el mismo sentido de giro.
 * @param atrib     { position, normal, uv } (Float32Array)
 * @param indice    Uint32Array (6 índices por cuadrilátero) o null (vértices en orden, de 4 en 4 con 0-1-2, 0-2-3)
 * @param poligonoDe (u0, v0, u1, v1) → [[u, v]] antihorario dentro de ese rectángulo, o null (se queda el cuadrilátero)
 * @returns { atrib, indice, triangulos }
 */
export function recortaQuads(atrib, indice, poligonoDe) {
  const P = atrib.position, N = atrib.normal, U = atrib.uv, nq = indice ? indice.length / 6 : P.length / 12;
  const pos = [], nor = [], uv = [], ind = [];
  for (let q = 0; q < nq; q++) {
    const tri = indice ? Array.from(indice.subarray(q * 6, q * 6 + 6)) : [0, 1, 2, 0, 2, 3].map(i => q * 4 + i);
    const vs = [...new Set(tri)];
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const i of vs) { u0 = Math.min(u0, U[2 * i]); u1 = Math.max(u1, U[2 * i]); v0 = Math.min(v0, U[2 * i + 1]); v1 = Math.max(v1, U[2 * i + 1]); }
    // la función afín uv → posición, con tres vértices no alineados en uv
    const a = vs[0]; let b = -1, c = -1;
    for (const i of vs) if (i !== a && b < 0) b = i;
    for (const i of vs) { if (i === a || i === b) continue; const du1 = U[2 * b] - U[2 * a], dv1 = U[2 * b + 1] - U[2 * a + 1], du2 = U[2 * i] - U[2 * a], dv2 = U[2 * i + 1] - U[2 * a + 1]; if (Math.abs(du1 * dv2 - dv1 * du2) > 1e-12) { c = i; break; } }
    const Pg = c >= 0 ? poligonoDe(u0, v0, u1, v1) : null, base = pos.length / 3;
    if (!Pg) {   // el cuadrilátero tal cual
      const mapa = new Map(); vs.forEach((i, k) => { mapa.set(i, base + k); pos.push(P[3 * i], P[3 * i + 1], P[3 * i + 2]); nor.push(N[3 * i], N[3 * i + 1], N[3 * i + 2]); uv.push(U[2 * i], U[2 * i + 1]); });
      tri.forEach(i => ind.push(mapa.get(i)));
      continue;
    }
    const du1 = U[2 * b] - U[2 * a], dv1 = U[2 * b + 1] - U[2 * a + 1], du2 = U[2 * c] - U[2 * a], dv2 = U[2 * c + 1] - U[2 * a + 1], det = du1 * dv2 - dv1 * du2;
    const e1 = [0, 1, 2].map(k => P[3 * b + k] - P[3 * a + k]), e2 = [0, 1, 2].map(k => P[3 * c + k] - P[3 * a + k]);
    for (const [u, v] of Pg) {
      const du = u - U[2 * a], dv = v - U[2 * a + 1], s = (du * dv2 - dv * du2) / det, t = (du1 * dv - dv1 * du) / det;
      for (let k = 0; k < 3; k++) pos.push(P[3 * a + k] + s * e1[k] + t * e2[k]);
      nor.push(N[3 * a], N[3 * a + 1], N[3 * a + 2]); uv.push(u, v);
    }
    // el sentido de giro del primer triángulo original, en uv: el polígono es antihorario en uv; si el original era horario, se invierte
    const [i0, i1, i2] = tri, giro = (U[2 * i1] - U[2 * i0]) * (U[2 * i2 + 1] - U[2 * i0 + 1]) - (U[2 * i1 + 1] - U[2 * i0 + 1]) * (U[2 * i2] - U[2 * i0]);
    for (let k = 1; k < Pg.length - 1; k++) { if (giro >= 0) ind.push(base, base + k, base + k + 1); else ind.push(base, base + k + 1, base + k); }
  }
  return { atrib: { position: new Float32Array(pos), normal: new Float32Array(nor), uv: new Float32Array(uv) }, indice: Uint32Array.from(ind), triangulos: ind.length / 3 };
}

/**
 * Polígonos de tamaño fijo para un sombreador (impostores y sustitutos de 07ac, que eligen el polígono por instancia y vista): cada uno con
 * exactamente `k` vértices (los que faltan repiten el último: triángulos degenerados, sin área). Sin silueta (null), el cuadrado [0, 1]².
 * @returns Float32Array de n · k · 2 (u, v en [0, 1] de la celda)
 */
export function poligonosFijos(lista, k) {
  const out = new Float32Array(lista.length * k * 2), RECT = [[0, 0], [1, 0], [1, 1], [0, 1]];
  lista.forEach((P, j) => { const Q = P && P.length >= 3 ? P : RECT; for (let i = 0; i < k; i++) { const p = Q[Math.min(i, Q.length - 1)]; out[(j * k + i) * 2] = p[0]; out[(j * k + i) * 2 + 1] = p[1]; } });
  return out;
}

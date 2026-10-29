// Niveles de detalle del olivo generado: aNivel() de la maqueta «Olivos en el gemelo» (referencia/olivos-en-el-gemelo.html), portado de mallas
// a RECETAS (arrays tipados): sin THREE, apto para el trabajador. La entrada es la receta E0 (la del núcleo) y la salida, otra receta que
// montaOlivo monta igual. Recuentos medidos en la maqueta (centenario 3 pies, envero, semilla 7) y comprobados en olivo.test.js:
//   E0    102 978 tri   el árbol tal como sale del generador
//   E1     48 378 tri   sin los prismas de los brotes finos; olivas como octaedros (8 tri)
//   E2     19 366 tri   además pies, raíces, ramas madre y muñón a un cuarto de resolución (uno de cada dos anillos y de cada dos lados) y
//                       olivas como puntos
//   E2VR   14 618 tri   además ACLAREO para las gafas: fuera la mitad de las ramitas, las más interiores (puntuación = radio horizontal /
//                       radio de copa + 0,75·max(0, y/H − 0,35), con un desempate fijo por índice); las que quedan ×1,38; el relleno se
//                       queda, ×1,25
export const NIVELES = ["E0", "E1", "E2", "E2VR"];
export const ESCALA_RAMITAS_VR = 1.38, ESCALA_RELLENO_VR = 1.25;

// Matrix4.multiplyMatrices de three (columna mayor), para que una instancia escalada dé los mismos bytes que en la maqueta
function multiplica(a, b, o) {
  const a11 = a[0], a12 = a[4], a13 = a[8], a14 = a[12], a21 = a[1], a22 = a[5], a23 = a[9], a24 = a[13];
  const a31 = a[2], a32 = a[6], a33 = a[10], a34 = a[14], a41 = a[3], a42 = a[7], a43 = a[11], a44 = a[15];
  const b11 = b[0], b12 = b[4], b13 = b[8], b14 = b[12], b21 = b[1], b22 = b[5], b23 = b[9], b24 = b[13];
  const b31 = b[2], b32 = b[6], b33 = b[10], b34 = b[14], b41 = b[3], b42 = b[7], b43 = b[11], b44 = b[15];
  o[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41; o[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
  o[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43; o[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
  o[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41; o[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
  o[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43; o[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
  o[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41; o[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
  o[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43; o[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
  o[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41; o[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
  o[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43; o[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
  return o;
}

/** copiaInstancias de la maqueta: las instancias que pasan el filtro, en su orden, opcionalmente escaladas (matriz × escala) */
export function copiaInstancias(p, geo, filtro, escala) {
  const idx = []; for (let i = 0; i < p.n; i++) if (!filtro || filtro(i)) idx.push(i);
  const n = idx.length, matrices = new Float32Array(n * 16), colores = p.colores ? new Float32Array(n * 3) : null, nodo = p.nodo ? new Int32Array(n) : null;
  const se = escala ? [escala, 0, 0, 0, 0, escala, 0, 0, 0, 0, escala, 0, 0, 0, 0, 1] : null, mt = new Array(16), o = new Array(16);
  idx.forEach((i, k) => {
    for (let e = 0; e < 16; e++) mt[e] = p.matrices[i * 16 + e];
    matrices.set(se ? multiplica(mt, se, o) : mt, k * 16);
    if (colores) colores.set(p.colores.subarray(i * 3, i * 3 + 3), k * 3);
    if (nodo) nodo[k] = p.nodo[i];
  });
  return Object.assign({}, p, { geo: geo || p.geo, n, matrices, colores, nodo });
}

/** Aclareo de E2-VR: quedan la mitad de las instancias (las de mayor puntuación, las de la silueta) y crecen ×1,38 */
export function aclareo(p, H, Rc) {
  const punt = [];
  for (let i = 0; i < p.n; i++) {
    const x = p.matrices[i * 16 + 12], y = p.matrices[i * 16 + 13], z = p.matrices[i * 16 + 14];
    const exterior = Math.hypot(x, z) / Rc + 0.75 * Math.max(0, y / H - 0.35);
    punt.push([exterior + 0.08 * ((i * 2654435761 >>> 0) % 1000) / 1000, i]);
  }
  punt.sort((a, b) => b[0] - a[0]);
  const quedan = new Set(punt.slice(0, Math.ceil(p.n / 2)).map(x => x[1]));
  return copiaInstancias(p, null, i => quedan.has(i), ESCALA_RAMITAS_VR);
}

/** rejillaReducida de la maqueta: tubo de (segs+1) × (rad+1) vértices → uno de cada dos anillos y de cada dos lados (los mismos vértices) */
export function rejillaReducida(p) {
  const [segs, rad] = p.rejilla, sel = n => { const a = []; for (let i = 0; i <= n; i += 2) a.push(i); if (a[a.length - 1] !== n) a.push(n); return a; };
  const A = sel(segs), B = sel(rad), idx = [];
  for (let a = 0; a < A.length - 1; a++) for (let b = 0; b < B.length - 1; b++) {
    const q0 = A[a] * (rad + 1) + B[b], q = A[a + 1] * (rad + 1) + B[b], p2 = A[a] * (rad + 1) + B[b + 1], q2 = A[a + 1] * (rad + 1) + B[b + 1];
    idx.push(q0, q, p2, q, q2, p2);
  }
  return Object.assign({}, p, { indice: Uint32Array.from(idx) });
}

/** La madera fina sin los prismas de brote (12 vértices y 30 índices por prisma, como los escribe el núcleo) */
export function sinBrotes(p) {
  const quedan = []; for (let k = 0; k < p.brote.length; k++) if (!p.brote[k]) quedan.push(k);
  const n = quedan.length, atrib = {};
  for (const [k, c] of [["position", 3], ["normal", 3], ["uv", 2]]) {
    const src = p.atrib[k], dst = new Float32Array(n * 12 * c);
    quedan.forEach((q, i) => dst.set(src.subarray(q * 12 * c, (q + 1) * 12 * c), i * 12 * c));
    atrib[k] = dst;
  }
  const indice = new Uint32Array(n * 30);
  for (let i = 0; i < n; i++) { const b = i * 12; for (let j = 0; j < 5; j++) { const a0 = b + j, a1 = b + 6 + j; indice.set([a0, a1, a0 + 1, a1, a1 + 1, a0 + 1], i * 30 + j * 6); } }
  return Object.assign({}, p, { atrib, indice, brote: new Uint8Array(n) });
}

/** Olivas como puntos (E2): la posición de cada instancia y su color */
function comoPuntos(p) {
  const posiciones = new Float32Array(p.n * 3);
  for (let i = 0; i < p.n; i++) posiciones.set(p.matrices.subarray(i * 16 + 12, i * 16 + 15), i * 3);
  return { clase: "puntos", mat: "puntos", geo: "puntos", sombra: [false, false], prof: null, pos: p.pos, rot: p.rot, esc: p.esc, rol: p.rol, rejilla: null,
    n: p.n, posiciones, colores: p.colores ? new Float32Array(p.colores) : new Float32Array(p.n * 3).fill(1), nodo: p.nodo };
}

/**
 * La receta del nivel k a partir de la E0. No toca la de entrada (los arrays que no cambian se comparten).
 * @param {object} r   receta E0 (de recetaG / receta)
 * @param {"E0"|"E1"|"E2"|"E2VR"} k
 */
export function aNivel(r, k) {
  if (!NIVELES.includes(k)) throw new Error("nivel desconocido: " + k);
  if (k === "E0") return r;
  const H = r.medidas.altura_m || 5, Rc = (r.medidas.copa_m || 8) / 2, piezas = [];
  for (const p of r.piezas) {
    if (p.rol === "brotes") continue;
    if (p.rol === "ramas" && p.brote) { piezas.push(sinBrotes(p)); continue; }   // la maqueta quita la malla «brotes»
    if (p.rol === "olivas") { piezas.push(k === "E1" ? copiaInstancias(p, "octa") : comoPuntos(p)); continue; }
    if (k === "E2VR" && p.rol === "relleno") { piezas.push(copiaInstancias(p, null, null, ESCALA_RELLENO_VR)); continue; }
    if (k === "E2VR" && p.rol === "ramitas") { piezas.push(aclareo(p, H, Rc)); continue; }
    if (p.clase === "instancias") { piezas.push(copiaInstancias(p)); continue; }
    if (k !== "E1" && p.clase === "malla" && p.rejilla) { piezas.push(rejillaReducida(p)); continue; }
    piezas.push(p);
  }
  return Object.assign({}, r, { nivel: k, piezas });
}

/** Triángulos de una receta (cualquier nivel); los puntos no cuentan */
export function triangulosNivel(r) {
  const TRI = { oliva: 20, octa: 8, relleno: 2, tocon: 14, corte: 9, ramita: 2 };
  return r.piezas.reduce((t, p) => p.clase === "puntos" ? t : t + (p.indice ? p.indice.length / 3 : TRI[p.geo]) * (p.clase === "instancias" ? p.n : 1), 0);
}
/** Llamadas de dibujo (una por pieza; los puntos también) */
export const llamadasNivel = r => r.piezas.length;

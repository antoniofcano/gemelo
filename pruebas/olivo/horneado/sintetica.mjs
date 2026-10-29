// Receta SINTÉTICA para probar el formato horneado sin el generador ni datos reales (contratos/olivo-horneado.md). Tiene la forma de una receta
// «olivo-2» (mallas con atributos e índices, instancias con y sin colores y nodo, puntos de E2, brotes, padre), pero su contenido sale de un
// generador de números enteros (mulberry32) y solo + − × ÷ y √, que dan los mismos bytes en cualquier motor de JavaScript. Así su huella
// horneada se puede fijar en el repo (sintetica.json). No es un olivo: no se dibuja.
export const NIVELES = ["E0", "E1", "E2", "E2VR"];
export const GEN_VERSION_SINTETICA = "sintetico", CACHE_VERSION_SINTETICA = 1;

function azar(semilla) {
  let a = semilla >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f32 = (n, f) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = f(i); return a; };

/** Malla de `nv` vértices (3 de cada triángulo comparten vértices en tiras) en una caja de unos 5 m, con normales unitarias, uv, hueco y muerta */
function malla(R, nv, mat, rol) {
  const position = f32(nv * 3, i => (R() - 0.5) * 5 + (i % 3 === 1 ? 2.5 : 0)), normal = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) { const x = R() - 0.5, y = R() - 0.5, z = R() - 0.5, l = Math.sqrt(x * x + y * y + z * z) || 1; normal.set([x / l, y / l, z / l], i * 3); }
  const nt = Math.max(1, nv - 2), indice = new Uint32Array(nt * 3);
  for (let t = 0; t < nt; t++) indice.set([t, t + 1, Math.min(nv - 1, t + 2)], t * 3);
  return { clase: "malla", mat, geo: "propia", sombra: [true, true], prof: null, pos: [0, 0, 0], rot: [0, 0, 0, 1], esc: [1, 1, 1], rol, rejilla: null,
    atrib: { position, normal, uv: f32(nv * 2, () => R()), aHueco: f32(nv, () => (R() < 0.2 ? 1 : 0)), aMuerta: f32(nv, () => (R() < 0.1 ? 1 : 0)) }, indice,
    brote: Uint8Array.from({ length: Math.max(1, nt >> 1) }, () => (R() < 0.3 ? 1 : 0)) };
}
/** n matrices 4×4 por columnas: rotación de un cuaternión, escala entre 0,2 y 1,2 y traslación en la caja; última fila (0,0,0,1) */
function matrices(R, n) {
  const m = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) {
    let x = R() - 0.5, y = R() - 0.5, z = R() - 0.5, w = R() - 0.5; const l = Math.sqrt(x * x + y * y + z * z + w * w) || 1; x /= l; y /= l; z /= l; w /= l;
    const s = 0.2 + R(), o = i * 16;
    m.set([(1 - 2 * (y * y + z * z)) * s, 2 * (x * y + z * w) * s, 2 * (x * z - y * w) * s, 0,
      2 * (x * y - z * w) * s, (1 - 2 * (x * x + z * z)) * s, 2 * (y * z + x * w) * s, 0,
      2 * (x * z + y * w) * s, 2 * (y * z - x * w) * s, (1 - 2 * (x * x + y * y)) * s, 0,
      (R() - 0.5) * 5, R() * 5, (R() - 0.5) * 5, 1], o);
  }
  return m;
}
function instancias(R, n, mat, geo, rol, conColor) {
  return { clase: "instancias", mat, geo, sombra: [true, !!conColor], prof: null, pos: [0, 0, 0], rot: [0, 0, 0, 1], esc: [1, 1, 1], rol, rejilla: null, n,
    matrices: matrices(R, n), colores: conColor ? f32(n * 3, () => 0.2 + R() * 0.5) : null, nodo: conColor ? Int32Array.from({ length: n }, () => Math.floor(R() * 40)) : null };
}

/**
 * @param o { semilla, nivel ("E0" | "E1" | "E2" | "E2VR"), epoca, grande (una malla de más de 65 535 vértices, para los índices Uint32) }
 * Cuanto más bajo el nivel, menos de todo; E2 y E2VR llevan las olivas como puntos.
 */
export function recetaSintetica(o) {
  const R = azar((o.semilla >>> 0) ^ (NIVELES.indexOf(o.nivel) + 1) * 0x9E3779B1), k = { E0: 4, E1: 3, E2: 2, E2VR: 1 }[o.nivel];
  const piezas = [malla(R, 60 * k, "corteza", "ramas"), instancias(R, 6, "corteza", "tocon", null, false), instancias(R, 20 * k, "relleno", "relleno", "relleno", true), instancias(R, 50 * k, "ramita0", "ramita", "ramitas", true)];
  if (o.grande) piezas.push(malla(R, 70000, "pies", null));
  if (k >= 3) piezas.push(instancias(R, 30 * k, "oliva", "oliva", "olivas", true));
  else { const n = 30 * k; piezas.push({ clase: "puntos", mat: "puntos", geo: "puntos", sombra: [false, false], prof: null, pos: [0, 0, 0], rot: [0, 0, 0, 1], esc: [1, 1, 1], rol: "olivas", rejilla: null, n,
    posiciones: f32(n * 3, i => (R() - 0.5) * 5 + (i % 3 === 1 ? 2.5 : 0)), colores: f32(n * 3, () => 0.2 + R() * 0.5), nodo: Int32Array.from({ length: n }, () => Math.floor(R() * 40)) }); }
  return { v: "sintetica", entrada: { tipo: "centenario3", epoca: o.epoca, semilla: o.semilla >>> 0, parametros: {} }, escala: [1.0125, 0.9875, 1.0125], corte: [0.4352941176470588, 0.4, 0.3529411764705882],
    cuenta: { nodos: 40, brotes: 12 * k, ramitas: 50 * k, relleno: 20 * k, frutos: 30 * k, cortes: 6 }, padre: Int32Array.from({ length: 40 }, (_, i) => (i ? Math.floor(R() * i) : -1)),
    piezas, medidas: { altura_m: 5, copa_m: 9.4, pies: 3 } };
}

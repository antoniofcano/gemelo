// Cuentas puras del editor de hazas (OF3): sin DOM ni OpenLayers, para poder probarlas en Node (pruebas/guardianes/oficina_hazas.test.js).
// Las coordenadas son las de un MultiPolygon de GeoJSON en EPSG:25830: [polígono][anillo][vértice] = [E, N] en metros, anillos cerrados
// (el último vértice repite el primero). Lo que se cuenta aquí es ORIENTATIVO: el recuento, la superficie y los solapes que valen son
// los que calcula el servidor con PostGIS al guardar.

/** Los vértices editables (sin el de cierre), en orden: [{ p, r, v }]. */
export function vertices(c) {
  const l = [];
  c.forEach((pol, p) => pol.forEach((an, r) => { for (let v = 0; v < an.length - 1; v++) l.push({ p, r, v }); }));
  return l;
}
const copia = c => c.map(pol => pol.map(an => an.map(q => [q[0], q[1]])));
const cierra = an => { an[an.length - 1] = [an[0][0], an[0][1]]; return an; };

/** Mueve el vértice k (índice en vertices()) dx, dy metros. Devuelve coordenadas nuevas (no toca las de entrada). */
export function mueve(c, k, dx, dy) {
  const n = copia(c), h = vertices(n)[k];
  if (!h) return n;
  const an = n[h.p][h.r];
  an[h.v] = [an[h.v][0] + dx, an[h.v][1] + dy];
  cierra(an);
  return n;
}
/** Quita el vértice k si su anillo se queda con al menos 3; si no, devuelve null. */
export function quita(c, k) {
  const n = copia(c), h = vertices(n)[k];
  if (!h) return null;
  const an = n[h.p][h.r];
  if (an.length - 1 <= 3) return null;
  an.splice(h.v, 1);
  if (h.v === 0) an.splice(an.length - 1, 1, [an[0][0], an[0][1]]);
  return n;
}
/** Añade un vértice a mitad del lado que sale del vértice k. Devuelve { coords, k } con el índice del nuevo. */
export function inserta(c, k) {
  const n = copia(c), h = vertices(n)[k];
  if (!h) return { coords: n, k };
  const an = n[h.p][h.r], a = an[h.v], b = an[h.v + 1];
  an.splice(h.v + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  return { coords: n, k: k + 1 };
}
/** Redondea al centímetro (lo que se manda al servidor) y vuelve a cerrar los anillos. */
export function redondea(c) {
  return c.map(pol => pol.map(an => cierra(an.map(q => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]))));
}

// ------------------------------------------------------------------ medidas (planas: UTM ya está en metros)
const areaAnillo = an => { let s = 0; for (let i = 0; i < an.length - 1; i++) s += an[i][0] * an[i + 1][1] - an[i + 1][0] * an[i][1]; return s / 2; };
/** Superficie en m² (anillo exterior menos huecos). */
export const area = c => c.reduce((t, pol) => t + Math.abs(areaAnillo(pol[0])) - pol.slice(1).reduce((u, an) => u + Math.abs(areaAnillo(an)), 0), 0);

function dentroAnillo(x, y, an) {
  let d = false;
  for (let i = 0, j = an.length - 2; i < an.length - 1; j = i++) {
    const [xi, yi] = an[i], [xj, yj] = an[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}
/** ¿Está el punto dentro de la haza (en algún polígono y fuera de sus huecos)? */
export const dentro = (c, x, y) => c.some(pol => dentroAnillo(x, y, pol[0]) && !pol.slice(1).some(an => dentroAnillo(x, y, an)));

function distSeg(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}
/** Distancia (m) del punto a la linde más cercana de la haza. */
export function distanciaALinde(c, x, y) {
  let m = Infinity;
  for (const pol of c) for (const an of pol) for (let i = 0; i < an.length - 1; i++) m = Math.min(m, distSeg(x, y, an[i], an[i + 1]));
  return m;
}
/** Caja [xmin, ymin, xmax, ymax]. */
export function caja(c) {
  const k = [Infinity, Infinity, -Infinity, -Infinity];
  for (const pol of c) for (const q of pol[0]) { k[0] = Math.min(k[0], q[0]); k[1] = Math.min(k[1], q[1]); k[2] = Math.max(k[2], q[0]); k[3] = Math.max(k[3], q[1]); }
  return k;
}
const cajasSeTocan = (a, b, m) => a[0] <= b[2] + m && b[0] <= a[2] + m && a[1] <= b[3] + m && b[1] <= a[3] + m;

/**
 * Olivos (copas medidas, [E, N]) dentro de la haza y, de ellos, los que están a menos de `borde` m de la linde. Orientativo: el servidor
 * cuenta con ST_Intersects sobre la tabla `olivos` (los mismos árboles, con su id congelado).
 */
export function cuenta(c, puntos, borde = 1) {
  const k = caja(c);
  let n = 0, b = 0;
  for (const [x, y] of puntos) {
    if (x < k[0] || x > k[2] || y < k[1] || y > k[3] || !dentro(c, x, y)) continue;
    n++;
    if (distanciaALinde(c, x, y) < borde) b++;
  }
  return { olivos: n, borde: b };
}

function cruzan(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
const lados = c => c.flatMap(pol => pol.flatMap(an => an.slice(0, -1).map((q, i) => [q, an[i + 1]])));

/**
 * ¿Se pisan dos hazas? Aviso orientativo: un vértice de una dentro de la otra a más de `tolerancia` m de su linde, o dos lados que se
 * cruzan. Compartir linde (vértices ajustados) no cuenta. El servidor mide el área pisada con ST_Intersection.
 */
export function sePisan(a, b, tolerancia = 0.05) {
  if (!cajasSeTocan(caja(a), caja(b), 0)) return false;
  const verts = c => c.flatMap(pol => pol.flatMap(an => an.slice(0, -1)));
  if (verts(a).some(([x, y]) => dentro(b, x, y) && distanciaALinde(b, x, y) > tolerancia)) return true;
  if (verts(b).some(([x, y]) => dentro(a, x, y) && distanciaALinde(a, x, y) > tolerancia)) return true;
  const lb = lados(b);
  return lados(a).some(([p, q]) => lb.some(([r, s]) => cruzan(p, q, r, s) && distSeg(p[0], p[1], r, s) > tolerancia && distSeg(q[0], q[1], r, s) > tolerancia));
}

/**
 * ¿Cabe la haza en el límite de la finca (OF3b: su contorno o, sin él, la caja de sus olivos + 150 m)? Todos sus vértices dentro del
 * límite (o a menos de `holgura` m de su linde) y ninguno de sus lados lo cruza (un límite cóncavo puede dejar fuera un lado con los dos
 * extremos dentro). Sin límite conocido (null), cabe: entonces decide solo el servidor, que es quien manda (ST_CoveredBy).
 */
export function cabeEn(c, limite, holgura = 0) {
  if (!limite || !limite.length) return true;
  const verts = c.flatMap(pol => pol.flatMap(an => an.slice(0, -1)));
  if (!verts.every(([x, y]) => puntoEnLimite(limite, x, y, holgura))) return false;
  const k = caja(c), ll = lados(limite).filter(([p, q]) => cajasSeTocan(k, [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])], 0));
  return !lados(c).some(([p, q]) => ll.some(([r, s]) => cruzan(p, q, r, s) && distSeg(p[0], p[1], r, s) > holgura && distSeg(q[0], q[1], r, s) > holgura));
}
/** ¿Cae el punto dentro del límite (o a menos de `holgura` m de su linde)? Sin límite, sí. */
export const puntoEnLimite = (limite, x, y, holgura = 0) => !limite || !limite.length || dentro(limite, x, y) || distanciaALinde(limite, x, y) <= holgura;

/** El vértice editable más cercano a (x, y) a menos de `max` m, o -1. */
export function verticeCercano(c, x, y, max) {
  let mejor = -1, d = max;
  vertices(c).forEach((h, k) => { const q = c[h.p][h.r][h.v], e = Math.hypot(q[0] - x, q[1] - y); if (e <= d) { d = e; mejor = k; } });
  return mejor;
}

/** Siguiente código libre del estilo «H-07» a partir de los que hay. */
export function codigoLibre(codigos, prefijo = "H-") {
  const usados = new Set(codigos);
  let n = 1;
  for (const c of codigos) { const m = /^(.*?)(\d+)$/.exec(c); if (m && m[1] === prefijo) n = Math.max(n, Number(m[2]) + 1); }
  while (usados.has(prefijo + String(n).padStart(2, "0"))) n++;
  return prefijo + String(n).padStart(2, "0");
}

/** Formato español: 1234,5 → «1.234,5». */
export const num = (x, dec = 0) => Number(x).toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec });

// Marco de coordenadas del prototipo 3D Tiles (F1d). Las proyecciones las hace proj4 (no hay fórmulas propias de UTM ni de ECEF).
//
// Tres sistemas y cómo se pasa de uno a otro (doc/sistema/TILES3D.md § «Marco de coordenadas»):
//   1. UTM 30N (ETRS89, EPSG:25830): el de los exportadores y el nombre de las teselas.
//   2. LOCAL de la escena = el de hoy: x = E − centro_utm[0], y = N − centro_utm[1] (metros de CUADRÍCULA UTM), z = cota − z0.
//      El contenido glb va en este marco (en ejes glTF: X = x, Y = z, Z = −y, igual que la escena three.js del motor).
//      El GPS del corresponsal entra por aquí: (lat, lon) → UTM 30N → menos centro_utm (gpsAEscena).
//   3. ECEF (EPSG:4978): solo para que el tileset quede georreferenciado ante terceros (Cesium, un globo). La raíz lleva
//      transform = ECEF(origen) · [e n u] · A, donde A (2×2) pasa metros de cuadrícula a metros de terreno en el plano
//      tangente (convergencia de meridianos y factor de escala de UTM), sacada por diferencias con proj4.
//      El visor del gemelo DESHACE ese transform y trabaja en el marco 2: no hay números de 6.400 km en la escena.
//
// ETRS89 y WGS84 se tratan como iguales (diferencia de decímetros a ~1 m en 2026 [DEDUCIDO de la deriva ETRF/ITRF, no medido]);
// bajo copa el GPS de un móvil yerra varios metros.
import proj4 from "proj4";

// Definiciones PROJ de EPSG (epsg.io / registro EPSG); proj4js no trae EPSG:25830 ni EPSG:4978 de serie.
proj4.defs("EPSG:25830", "+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");
proj4.defs("EPSG:4978", "+proj=geocent +datum=WGS84 +units=m +no_defs +type=crs");
const UTM_A_GEO = proj4("EPSG:25830", "EPSG:4326"), GEO_A_ECEF = proj4("EPSG:4326", "EPSG:4978");

/** UTM 30N → { lat, lon } (grados) */
export function deUtm(E, N) { const [lon, lat] = UTM_A_GEO.forward([E, N]); return { lat, lon }; }
/** (lat, lon) → { E, N } en UTM 30N */
export function aUtm(lat, lon) { const [E, N] = UTM_A_GEO.inverse([lon, lat]); return { E, N }; }
/** geodésicas (grados, m sobre el elipsoide) → ECEF [X, Y, Z] */
export function aEcef(lat, lon, h) { return GEO_A_ECEF.forward([lon, lat, h]); }
/** ECEF → { lat, lon, h } */
export function deEcef(X, Y, Z) { const [lon, lat, h] = GEO_A_ECEF.inverse([X, Y, Z]); return { lat, lon, h }; }

const RAD = Math.PI / 180;
function baseEnu(lat, lon) {
  const p = lat * RAD, l = lon * RAD;
  return { e: [-Math.sin(l), Math.cos(l), 0], n: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)], u: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)] };
}
const resta = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Transform de la raíz del tileset (16 números, por columnas) del marco LOCAL a ECEF. hOrigen = z0 + ondulación del geoide
 * (altura elipsoidal del origen). Devuelve también la convergencia de meridianos (grados; + = el norte de cuadrícula
 * queda al este del norte verdadero) y el factor de escala de UTM en el origen, para documentarlos.
 */
export function transformRaiz(centroUtm, hOrigen) {
  const [CX, CY] = centroUtm, o = deUtm(CX, CY), O = aEcef(o.lat, o.lon, hOrigen), B = baseEnu(o.lat, o.lon), d = 50;
  const enu = (E, N) => { const g = deUtm(E, N), P = resta(aEcef(g.lat, g.lon, hOrigen), O); return [punto(P, B.e), punto(P, B.n)]; };
  const xe = enu(CX + d, CY), xo = enu(CX - d, CY), yn = enu(CX, CY + d), ys = enu(CX, CY - d);
  const a00 = (xe[0] - xo[0]) / (2 * d), a10 = (xe[1] - xo[1]) / (2 * d), a01 = (yn[0] - ys[0]) / (2 * d), a11 = (yn[1] - ys[1]) / (2 * d);
  const col = (ce, cn) => [0, 1, 2].map(k => B.e[k] * ce + B.n[k] * cn);
  const cx = col(a00, a10), cy = col(a01, a11);
  const m = [cx[0], cx[1], cx[2], 0, cy[0], cy[1], cy[2], 0, B.u[0], B.u[1], B.u[2], 0, O[0], O[1], O[2], 1];
  return { transform: m, origen: { lat: o.lat, lon: o.lon, h: hOrigen }, convergenciaGrados: Math.atan2(a01, a11) / RAD, factorEscala: 1 / Math.hypot(a00, a10) };
}

/** Aplica un transform 4×4 por columnas a [x, y, z] */
export function aplica(m, p) {
  return [0, 1, 2].map(k => m[k] * p[0] + m[4 + k] * p[1] + m[8 + k] * p[2] + m[12 + k]);
}

/**
 * GPS → escena (lo que hará la PWA del corresponsal, fase F4): la misma proyección que los exportadores.
 * lat, lon en grados (WGS84 ≈ ETRS89); hElip opcional (m sobre el elipsoide); ondulacion = N del geoide en el punto.
 * Devuelve { x, y, z } en el marco LOCAL (z = null si no hay altura: la da el relieve, suelo(x, y)).
 */
export function gpsAEscena(lat, lon, centroUtm, z0, hElip = null, ondulacion = 0) {
  const u = aUtm(lat, lon);
  return { x: u.E - centroUtm[0], y: u.N - centroUtm[1], z: hElip == null ? null : hElip - ondulacion - z0 };
}

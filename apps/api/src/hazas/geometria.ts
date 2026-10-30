// Lo que se comprueba de una geometría de haza ANTES de tocar la base (OF3, doc/sistema/OFICINA.md §4). Puro, sin red ni base:
// lo usan las rutas de src/admin/hazas.ts y las pruebas unitarias. La validez de verdad (ST_IsValid, dentro de la finca, solapes)
// la decide PostGIS al guardar; esto solo corta pronto lo que no puede ser (anillos abiertos, coordenadas fuera de UTM 30N,
// demasiados vértices) con un mensaje claro.

/** Vértices como máximo en una haza (todos sus anillos): una haza dibujada a mano tiene decenas; 2000 sobra. */
export const MAX_VERTICES = 2000;
/** Caja de EPSG:25830 que tiene sentido para una finca en la Península (E, N en metros). */
export const CAJA_UTM = { emin: 100_000, emax: 900_000, nmin: 3_900_000, nmax: 4_900_000 } as const;
/** Área (m²) por debajo de la cual el pisado de dos hazas se considera ruido del ajuste y no un solape. */
export const SOLAPE_TOLERADO_M2 = 0.5;
/** Superficie mínima de una haza (m²). */
export const AREA_MINIMA_M2 = 10;
/** Margen (m) alrededor de los olivos medidos de la finca que cuenta como «dentro de la finca» cuando la finca NO tiene contorno cargado. */
export const MARGEN_FINCA_M = 150;
/**
 * Holgura (m) del contorno de la finca (OF3b, migración 0011): una haza vale si cae dentro del contorno ensanchado esta distancia. Absorbe el
 * redondeo al centímetro del cliente y que las lindes de las parcelas de OlivarTrack (a las que se ajustan los vértices) no casan al
 * centímetro con las de SIGPAC o el Catastro. [SUPUESTO] 1 m; se revisa cuando haya un contorno real cargado.
 */
export const CONTORNO_HOLGURA_M = 1;
/** Vértices como máximo en un contorno de finca (la unión de sus parcelas puede tener miles). */
export const MAX_VERTICES_CONTORNO = 50_000;
/** Distancia (m) a la linde por debajo de la cual un olivo «cae en el borde» (aviso). */
export const BORDE_M = 1;

const coordenada = { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } } as const;
const anillo = { type: "array", minItems: 4, maxItems: MAX_VERTICES, items: coordenada } as const;
const poligono = { type: "array", minItems: 1, maxItems: 50, items: anillo } as const;
/** Esquema (ajv) de la geometría que manda la oficina: GeoJSON Polygon o MultiPolygon en EPSG:25830, sin `crs` ni nada más. */
export const ESQUEMA_GEOMETRIA = {
  oneOf: [
    { type: "object", additionalProperties: false, required: ["type", "coordinates"],
      properties: { type: { type: "string", enum: ["Polygon"] }, coordinates: poligono } },
    { type: "object", additionalProperties: false, required: ["type", "coordinates"],
      properties: { type: { type: "string", enum: ["MultiPolygon"] }, coordinates: { type: "array", minItems: 1, maxItems: 50, items: poligono } } },
  ],
} as const;

/** Esquema (ajv) del contorno de una finca: como el de una haza, con más vértices y polígonos (la unión de muchas parcelas). */
export const ESQUEMA_CONTORNO = {
  oneOf: [
    { type: "object", additionalProperties: false, required: ["type", "coordinates"],
      properties: { type: { type: "string", enum: ["Polygon"] }, coordinates: { type: "array", minItems: 1, maxItems: 500, items: { ...anillo, maxItems: MAX_VERTICES_CONTORNO } } } },
    { type: "object", additionalProperties: false, required: ["type", "coordinates"],
      properties: { type: { type: "string", enum: ["MultiPolygon"] }, coordinates: { type: "array", minItems: 1, maxItems: 500,
        items: { type: "array", minItems: 1, maxItems: 500, items: { ...anillo, maxItems: MAX_VERTICES_CONTORNO } } } } },
  ],
} as const;

export interface Geometria { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] }
export type ErrorGeometria = { error: string; mensaje: string };

/** Los anillos de la geometría como lista de polígonos (cada uno, lista de anillos). */
export const poligonos = (g: Geometria): number[][][][] => (g.type === "Polygon" ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]));

/**
 * Comprueba lo que ajv no puede: anillos cerrados, coordenadas finitas dentro de UTM 30N (no grados, no locales) y el total de
 * vértices. Devuelve null si vale, o el error con su mensaje para la oficina.
 */
export function compruebaGeometria(g: Geometria, maxVertices: number = MAX_VERTICES): ErrorGeometria | null {
  let n = 0;
  for (const pol of poligonos(g)) {
    for (const an of pol) {
      n += an.length - 1;
      const a = an[0]!, z = an[an.length - 1]!;
      if (a[0] !== z[0] || a[1] !== z[1]) return { error: "anillo_abierto", mensaje: "La linde no está cerrada: el último vértice debe ser el primero." };
      for (const [e, nn] of an as [number, number][]) {
        if (!Number.isFinite(e) || !Number.isFinite(nn) || e < CAJA_UTM.emin || e > CAJA_UTM.emax || nn < CAJA_UTM.nmin || nn > CAJA_UTM.nmax) {
          return { error: "fuera_de_utm", mensaje: "Las coordenadas no son de ETRS89 / UTM 30N (EPSG:25830)." };
        }
      }
      if (an.length - 1 < 3) return { error: "pocos_vertices", mensaje: "Una haza necesita al menos tres vértices." };
    }
  }
  if (n > maxVertices) return { error: "demasiados_vertices", mensaje: "La geometría tiene demasiados vértices (más de " + maxVertices + ")." };
  return null;
}

/** Dos puntos (E, N) distintos y en UTM 30N: la línea de corte de «partir». */
export function compruebaCorte(a: [number, number], b: [number, number]): ErrorGeometria | null {
  for (const [e, nn] of [a, b]) {
    if (!Number.isFinite(e) || !Number.isFinite(nn) || e < CAJA_UTM.emin || e > CAJA_UTM.emax || nn < CAJA_UTM.nmin || nn > CAJA_UTM.nmax) {
      return { error: "fuera_de_utm", mensaje: "Las coordenadas no son de ETRS89 / UTM 30N (EPSG:25830)." };
    }
  }
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) return { error: "corte_no_valido", mensaje: "Los dos vértices del corte son el mismo." };
  return null;
}

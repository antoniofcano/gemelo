// Olivo real por su id (OF8, doc/sistema/OFICINA.md §9.1): las cuentas de la pestaña «Olivo real» de la sección Olivos, sin DOM ni three.
// Busca un olivo del índice de la finca por su id estable (copas_id, ADR-0012), arma la MISMA entrada del generador que arma el motor
// (apps/web/motor/07ab_generados.js, entrada() y parametrosDe(): reusa semillaDeCopa y parametrosDeCopa del constructor, no los reescribe)
// y ordena los escalones para ponerlos lado a lado. La receta y los escalones los calcula el constructor (olivo_real.js, con import() perezoso).
import { parametrosDeCopa, semillaDeCopa, CAMPOS_PARAM } from "../olivo/copas.js";
import { ESTADOS } from "../olivo/tipos.js";

/** El radio dibujado de los olivos del constructor en el motor = r8 × este factor (FACTOR_R8_GEN de apps/web/motor/01_datos.js, decisión 81). El guardián lo contrasta. */
export const FACTOR_R8_GEN = 1;
/** El tipo que el motor da a todos sus olivos generados (07ab: parametrosDe) */
export const TIPO_MOTOR = "centenario3";
export const EPOCA_POR_DEFECTO = "envero";
export const EPOCAS = Object.keys(ESTADOS);

/** Los escalones que calcula el constructor desde una misma receta E0 (niveles.js). El impostor no es una malla de olivo: no se cuenta aquí. */
export const ESCALONES = [
  ["E0", "E0", "el más cercano: árbol completo (tronco, ramas, ramitas, hoja, aceituna)"],
  ["E1", "E1", "intermedio: sin brotes; aceituna como octaedro"],
  ["E2", "E2", "lejano, el que se hornea: rejillas reducidas, aceituna como puntos"],
  ["E2VR", "E2-VR", "E2 para gafas: relleno y ramitas ajustados"],
];

/**
 * Qué se ha escrito → { i, id } o { error }. Acepta «1234», «olivo:hituelo:1234» (la entidad del mundo, ADR-0012/ADR-0023) y «i56» (el índice de la fila,
 * solo para un índice sin copas_id: es lo que el motor llama id provisional de posición, y NO es estable entre exportaciones).
 */
export function buscaOlivo(indice, texto, finca) {
  const t = String(texto || "").trim();
  if (!t) return { error: "Escribe el id de un olivo." };
  if (!indice || !Array.isArray(indice.copas) || !indice.copas.length) return { error: "La finca no trae olivos medidos en su índice." };
  const m = /^olivo:([^:\s]+):(i?\d+)$/.exec(t);
  let cuerpo = t;
  if (m) {
    if (finca && m[1] !== finca) return { error: "Ese id es de la finca «" + m[1] + "», no de «" + finca + "»." };
    cuerpo = m[2];
  }
  if (/^i\d+$/.test(cuerpo)) {
    if (Array.isArray(indice.copas_id)) return { error: "Esta finca trae ids estables (copas_id): usa el id, no la posición." };
    const i = Number(cuerpo.slice(1));
    return i < indice.copas.length ? { i, id: -1 } : { error: "La finca solo tiene " + indice.copas.length + " olivos (posiciones de 0 a " + (indice.copas.length - 1) + ")." };
  }
  if (!/^\d+$/.test(cuerpo)) return { error: "El id es un número entero (por ejemplo 1234) o «olivo:" + (finca || "finca") + ":1234»." };
  if (!Array.isArray(indice.copas_id)) return { error: "El índice de esta finca no trae copas_id: busca por posición con «i" + cuerpo + "»." };
  const id = Number(cuerpo), i = indice.copas_id.indexOf(id);
  return i < 0 ? { error: "No hay ningún olivo con el id " + id + " en esta finca." } : { i, id };
}

/** Lo que el índice MEDIDO dice del olivo i (altura y copa del LiDAR) y lo DEDUCIDO de ello (origen por campo, de parametrosDeCopa). Para la ficha. */
export function fichaDeOlivo(indice, i) {
  const raw = indice.copas[i], fila = indice.copas_param ? indice.copas_param[i] || null : null;
  const p = parametrosDeCopa(raw, fila, TIPO_MOTOR, { factorR8: FACTOR_R8_GEN });
  const r8 = raw[3] && raw[3].length ? raw[3].reduce((a, b) => a + b, 0) / raw[3].length : null;
  const crudos = fila ? Object.fromEntries(CAMPOS_PARAM.map((k, j) => [k, fila[j]])) : null;
  return { x: raw[0], y: raw[1], altura_lidar_m: raw[2], r8_medio_m: r8, copas_param: crudos, con_copas_param: !!fila, tipo: p.tipo, parametros: p.parametros, origen: p.origen,
    id: Array.isArray(indice.copas_id) ? indice.copas_id[i] : -1 };
}

/** La entrada del generador, igual a la del motor: { tipo, parametros, epoca, semilla, provisional }. */
export function entradaDeOlivo(indice, i, epoca) {
  const raw = indice.copas[i], id = Array.isArray(indice.copas_id) ? indice.copas_id[i] : -1;
  const s = semillaDeCopa(raw, id, indice.centro_utm, Array.isArray(indice.copas_semilla) ? indice.copas_semilla[i] : undefined) || { semilla: i + 1, provisional: true };
  const p = fichaDeOlivo(indice, i);
  return { tipo: p.tipo, parametros: p.parametros, epoca: ESTADOS[epoca] ? epoca : EPOCA_POR_DEFECTO, semilla: s.semilla, provisional: !!s.provisional };
}

/** Las filas de la tabla lado a lado, a partir de lo medido por escalón ({ E0: { triangulos, mallas, ms }, … }): triángulos y su parte de la E0. */
export function filasEscalones(medidas) {
  const t0 = medidas.E0 ? medidas.E0.triangulos : 0;
  return ESCALONES.filter(([k]) => medidas[k]).map(([k, nombre, nota]) => {
    const m = medidas[k];
    return { k, nombre, nota, triangulos: m.triangulos, mallas: m.mallas, parteDeE0: t0 > 0 ? m.triangulos / t0 : 0, ms: m.ms };
  });
}

/** Un número con separador de miles y sin decimales («1.234.567») */
export const miles = n => Math.round(n).toLocaleString("es-ES");
export const pct = f => (f * 100 < 10 ? (f * 100).toFixed(1) : String(Math.round(f * 100))).replace(".", ",") + " %";

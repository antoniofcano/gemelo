// Del registro de árboles del gemelo (contratos/olivos-tipo.md §2 y contratos/olivo-generado.md) a la entrada del generador.
// Lo MEDIDO viaja en el índice (copas, copas_id, copas_param); lo DEDUCIDO (asimetría, falda, relieve como parámetros del generador) se
// calcula aquí, con las conversiones del bloque 4 de la maqueta «Olivos en el gemelo». El árbol que sale es ILUSTRATIVO con medidas reales.
import { RANGOS, tipoDeId } from "./tipos.js";
import { CATALOGO } from "./catalogo.js";

const DOS31 = 2147483648;

/**
 * Semilla de un árbol: la guardada en copas_semilla[i] si la hay (`guardada`); si no, se deriva de su id (copas_id, ADR-0012; tuberia/ids_copas.py): {semilla: id, provisional: id ≥ 2^31}. Los ids del censo de
 * OlivarTrack van en 0 … 2^31 − 1; los provisionales que pone el exportador, en 2^31 … 2^32 − 1, sacados de la posición UTM.
 * Sin copas_id (índices viejos), el mismo id provisional que daría el exportador: 2^31 + (E_m mod 32768) · 65536 + (N_m mod 65536), con
 * E_m, N_m el metro UTM que contiene la copa (tras redondear al centímetro). Sin `centroUtm` no se puede: null. Las colisiones (dos copas
 * en el mismo metro) las resuelve el exportador mirando toda la finca; aquí no: por eso un índice debe traer copas_id.
 */
export function semillaDeCopa(copa, id, centroUtm, guardada) {
  // la semilla GUARDADA en el registro (copas_semilla, tuberia/semillas_copas.py) manda: se asigna una vez y no cambia con el id
  if (Number.isInteger(guardada) && guardada >= 0 && guardada < 2 * DOS31)
    return { semilla: guardada, provisional: !(Number.isInteger(id) && id >= 0 && id < DOS31), guardada: true };
  if (Number.isInteger(id) && id >= 0 && id < 2 * DOS31) return { semilla: id, provisional: id >= DOS31 };
  if (!centroUtm) return null;
  const em = Math.floor(Math.round((copa[0] + centroUtm[0]) * 100) / 100), nm = Math.floor(Math.round((copa[1] + centroUtm[1]) * 100) / 100);
  const mod = (a, m) => ((a % m) + m) % m;
  return { semilla: DOS31 + mod(em, 32768) * 65536 + mod(nm, 65536), provisional: true };
}

/**
 * D-03 (auditoría del constructor, 2026-11-15): LA lectura de copas_tipo, la misma para el motor y para tuberia/tiles3d. Los números de copas_tipo son
 * ids del catálogo que nombra copas_tipo_catalogo: «olivos» (el del constructor, ID_TIPO de tipos.js) si el índice no lo dice, o el id de un catálogo
 * de glb del contrato olivos-tipo (contratos/olivos-tipo.md §2).
 */
export function catalogoDeTipos(indice) { return (indice && typeof indice.copas_tipo_catalogo === "string" && indice.copas_tipo_catalogo) || CATALOGO; }
/** El número de copas_tipo del olivo i (−1 si no hay columna o no tiene tipo) */
export function numeroDeTipo(indice, i) { const t = indice && indice.copas_tipo ? indice.copas_tipo[i] : -1; return Number.isInteger(t) && t >= 0 ? t : -1; }
/** La clave del tipo del constructor (la de TIPOS) del olivo i, o null: sin tipo, un id que «olivos» no tiene o un índice de otro catálogo */
export function tipoDeRegistro(indice, i) {
  const t = numeroDeTipo(indice, i);
  return t >= 0 && catalogoDeTipos(indice) === CATALOGO ? tipoDeId(t) : null;
}

/** Campos de cada fila de copas_param (contratos/olivo-generado.md §3), en orden */
export const CAMPOS_PARAM = ["altura_m", "copa_m", "desplaz_m", "rumbo_gr", "densidad", "base_m", "rugosidad", "tronco"];
export const ORIGEN_TRONCO = ["lidar", "marca", "centro"];

const acotaRango = (k, v) => Math.min(RANGOS[k][1], Math.max(RANGOS[k][0], v));

/**
 * Parámetros del generador para un árbol. `param` es su fila de copas_param (o null) y `tipo` su tipo (tipoDeRegistro: copas_tipo con el catálogo
 * «olivos») o el que se elija; sin tipo, "centenario3" (como la maqueta). Sin fila de parámetros, solo altura y copa salen del registro (h y r8).
 * `opciones.factorR8`: radio dibujado = r8 × factorR8. r8 es el RADIO medido; por defecto 0,5 (copa = media de r8, como el nivel de siempre del
 * motor, decisión 48); 1 = la copa a su radio medido (copa = 2 × media de r8): lo que pide el motor para sus olivos generados (E.gen de
 * apps/web/src/mundos/exterior/factor-r8.ts, antes FACTOR_R8_GEN; decisión 81).
 * D-04: lo medido fuera de los RANGOS del constructor se dibuja recortado (un olivo de 8 m, a 7 m); `recortes` dice cuáles y cuánto, para que la ficha
 * no presente como «medida del LiDAR» lo que no lo es.
 * @returns {{tipo, parametros, origen: {campo: "medido"|"deducido"|"tipo"}, recortes: {campo: {medido, dibujado}}}}
 */
export function parametrosDeCopa(copa, param, tipo, opciones) {
  const o = opciones || {}, t = tipo || "centenario3", P = {}, origen = {}, recortes = {};
  const acota = (k, v) => { const a = acotaRango(k, v); if (a !== v) recortes[k] = { medido: v, dibujado: a }; return a; };
  const media = copa[3] && copa[3].length === 8 ? copa[3].reduce((a, b) => a + b, 0) / 8 : null;
  if (param) {
    const [alt, cop, d, rumbo, dens, base, rug] = param;
    if (alt > 0) { P.altura = acota("altura", alt); origen.altura = "medido"; }
    if (cop > 0) { P.copa = acota("copa", cop); origen.copa = "medido"; }
    const sinTronco = param[7] === 2;   // ni LiDAR bajo la copa ni marca: asimetría 0 (decisión de Antonio nº 31)
    if (cop > 0 && d >= 0) { P.asim = sinTronco ? 0 : Math.min(0.6, d / (cop / 2) * 1.8); origen.asim = "deducido"; }
    if (!sinTronco && d >= 0.05 && rumbo != null) { P.rumbo = (Math.round(((rumbo % 360) + 360) % 360 / 5) * 5) % 360; origen.rumbo = "medido"; }
    if (dens != null) { P.densidad = acota("densidad", dens); origen.densidad = "medido"; }
    if (alt > 0 && base != null) { P.falda = Math.min(1, Math.max(0, 1 - base / alt)); origen.falda = "deducido"; }
    if (rug != null) { P.relieve = Math.min(1, Math.max(0, rug * 1.8)); origen.relieve = "deducido"; }
  } else {
    if (copa[2] > 0) { P.altura = acota("altura", copa[2]); origen.altura = "medido"; }
    if (media) { P.copa = acota("copa", 2 * media * (o.factorR8 > 0 ? o.factorR8 : 0.5)); origen.copa = "medido"; }
  }
  return { tipo: t, parametros: P, origen, recortes };
}

// Del registro de árboles del gemelo (contratos/olivos-tipo.md §2 y contratos/olivo-generado.md) a la entrada del generador.
// Lo MEDIDO viaja en el índice (copas, copas_id, copas_param); lo DEDUCIDO (asimetría, falda, relieve como parámetros del generador) se
// calcula aquí, con las conversiones del bloque 4 de la maqueta «Olivos en el gemelo». El árbol que sale es ILUSTRATIVO con medidas reales.
import { RANGOS } from "./tipos.js";

const DOS31 = 2147483648;

/**
 * Semilla de un árbol = su id (copas_id, ADR-0012; tuberia/ids_copas.py): {semilla: id, provisional: id ≥ 2^31}. Los ids del censo de
 * OlivarTrack van en 0 … 2^31 − 1; los provisionales que pone el exportador, en 2^31 … 2^32 − 1, sacados de la posición UTM.
 * Sin copas_id (índices viejos), el mismo id provisional que daría el exportador: 2^31 + (E_m mod 32768) · 65536 + (N_m mod 65536), con
 * E_m, N_m el metro UTM que contiene la copa (tras redondear al centímetro). Sin `centroUtm` no se puede: null. Las colisiones (dos copas
 * en el mismo metro) las resuelve el exportador mirando toda la finca; aquí no: por eso un índice debe traer copas_id.
 */
export function semillaDeCopa(copa, id, centroUtm) {
  if (Number.isInteger(id) && id >= 0 && id < 2 * DOS31) return { semilla: id, provisional: id >= DOS31 };
  if (!centroUtm) return null;
  const em = Math.floor(Math.round((copa[0] + centroUtm[0]) * 100) / 100), nm = Math.floor(Math.round((copa[1] + centroUtm[1]) * 100) / 100);
  const mod = (a, m) => ((a % m) + m) % m;
  return { semilla: DOS31 + mod(em, 32768) * 65536 + mod(nm, 65536), provisional: true };
}

/** Campos de cada fila de copas_param (contratos/olivo-generado.md §3), en orden */
export const CAMPOS_PARAM = ["altura_m", "copa_m", "desplaz_m", "rumbo_gr", "densidad", "base_m", "rugosidad", "tronco"];
export const ORIGEN_TRONCO = ["lidar", "marca", "centro"];

const acota = (k, v) => Math.min(RANGOS[k][1], Math.max(RANGOS[k][0], v));

/**
 * Parámetros del generador para un árbol. `param` es su fila de copas_param (o null) y `tipo` su tipo (copas_tipo → TIPO_DE_ID) o el que se
 * elija; sin tipo, "centenario3" (como la maqueta). Sin fila de parámetros, solo altura y copa salen del registro (h y r8).
 * `opciones.r8` = "radio" (por defecto: es lo que miden los exportadores, ver ADR-0017) o "diametro" (lo que asume hoy el motor).
 * @returns {{tipo, parametros, origen: {campo: "medido"|"deducido"|"tipo"}}}
 */
export function parametrosDeCopa(copa, param, tipo, opciones) {
  const o = opciones || {}, t = tipo || "centenario3", P = {}, origen = {};
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
    if (media) { P.copa = acota("copa", media * (o.r8 === "diametro" ? 1 : 2)); origen.copa = "medido"; }
  }
  return { tipo: t, parametros: P, origen };
}

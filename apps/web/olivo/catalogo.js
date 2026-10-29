// Nombres de catálogo de los tipos de olivo generado (respuesta 4 de Antonio, contratos/olivo-generado.md §1.1): «olivos:<forma>-<pies>p», sin
// versión dentro (la versión del generador es GEN_VERSION, aparte). El NOMBRE es la identidad estable del tipo; los números (ID_TIPO de
// tipos.js, el _TIPO de un tileset) son locales a cada fichero, con su tabla número → nombre al lado (en un tileset, en extras.gemelo).
// El tipo 0 del catálogo sintético de pruebas (modelos/olivos/fixture/) no es ninguno de estos: se queda solo en el fixture.
import { TIPOS } from "./tipos.js";

export const CATALOGO = "olivos";
export const NOMBRE_TIPO = Object.freeze({
  planton: "olivos:planton", adulto1: "olivos:adulto-1p", adulto2: "olivos:adulto-2p", adulto3: "olivos:adulto-3p",
  centenario: "olivos:centenario-1p", centenario2: "olivos:centenario-2p", centenario3: "olivos:centenario-3p",
});
const DE_NOMBRE = Object.freeze(Object.fromEntries(Object.entries(NOMBRE_TIPO).map(([k, v]) => [v, k])));
/** Clave interna del tipo (la de TIPOS) a partir de su nombre de catálogo, o null */
export const tipoDeNombre = nombre => DE_NOMBRE[nombre] || null;
/** Tabla número local → nombre para un fichero que numera los tipos (p. ej. el _TIPO de un tileset): [nombre del 0, nombre del 1, …] */
export const tablaLocal = (claves = Object.keys(TIPOS)) => claves.map(k => NOMBRE_TIPO[k]);

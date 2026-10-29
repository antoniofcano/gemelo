// Parte de Node del horneado (contratos/olivo-horneado.md §2): brotli y el objeto listo para guardar. NO se exporta desde index.js (usa node:zlib):
// el navegador no comprime ni descomprime a mano, lo hace Content-Encoding: br.
import zlib from "node:zlib";
import { codifica, huellaBytes } from "./horneado.js";

/** Calidad de brotli del día a día y de release (ADR-0018): la 9 gasta ~30 veces menos CPU que la 11 a cambio de un 7-13 % más de peso (O6) */
export const BROTLI_DIA = 9, BROTLI_RELEASE = 11;

export const comprimeBr = (bytes, calidad) => zlib.brotliCompressSync(bytes, { params: {
  [zlib.constants.BROTLI_PARAM_QUALITY]: calidad === undefined ? BROTLI_DIA : calidad, [zlib.constants.BROTLI_PARAM_LGWIN]: 24, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } });
export const descomprimeBr = br => new Uint8Array(zlib.brotliDecompressSync(br));

/**
 * Codifica una receta y la deja lista para guardar como `<huella>.br`.
 * @returns {huella, bytes (sin comprimir), bytes_br, crudo: Uint8Array (lo que se hashea), br: Buffer (lo que se guarda)}
 */
export async function horneaObjeto(receta, o, calidad) {
  const crudo = codifica(receta, o), br = comprimeBr(crudo, calidad);
  return { huella: await huellaBytes(crudo), bytes: crudo.length, bytes_br: br.length, crudo, br };
}

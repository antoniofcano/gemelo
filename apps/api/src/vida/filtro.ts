// Filtro BÁSICO del nombre que un hogar pone a un olivo (decisión 93: se ve al momento y se modera por denuncia). No
// pretende ser un moderador: corta lo evidente (enlaces, teléfonos, correos, un puñado de insultos) y el resto lo atiende
// la oficina desde la bandeja. Lo mismo vale para el texto de una sugerencia o de una denuncia (solo enlaces y teléfonos).

/** 1–40 caracteres: letras, números, espacios y la puntuación de un nombre («El abuelo», «Olivo de Lucía (2026)»). */
const CARACTERES = /^[\p{L}\p{N} '’.,;:!¡¿?()-]+$/u;
const PARECE_ENLACE = /(https?:|www\.|\.(com|es|net|org|eu|info|io|me)\b|@)/i;
// palabras enteras, ya sin tildes y en minúsculas; lista corta a propósito (la completa es la denuncia)
const GRUESAS = ["puta", "puto", "putas", "putos", "mierda", "cabron", "cabrona", "gilipollas", "maricon", "zorra", "polla", "cono", "joder", "hijoputa", "subnormal", "nazi"];
const RE_GRUESAS = new RegExp("\\b(" + GRUESAS.join("|") + ")\\b");

export const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const limpia = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ");
/** seis cifras o más seguidas (con espacios, puntos o guiones en medio): un teléfono, un DNI, una cuenta */
export const pareceNumeroPersonal = (s: string) => /\d{6,}/.test(s.replace(/[\s.-]/g, ""));

export type MotivoNombre = "caracteres" | "enlace" | "numero" | "palabra";

/** null si el nombre vale; si no, por qué no (la api responde con un texto genérico, sin repetir la palabra). */
export function revisaNombre(nombre: string): MotivoNombre | null {
  if (!CARACTERES.test(nombre)) return "caracteres";
  if (PARECE_ENLACE.test(nombre)) return "enlace";
  if (pareceNumeroPersonal(nombre)) return "numero";
  if (RE_GRUESAS.test(sinTildes(nombre))) return "palabra";
  return null;
}

/** Texto libre (sugerencia, denuncia): sin enlaces ni números largos. */
export function revisaTexto(texto: string): "enlace" | "numero" | null {
  if (/(https?:|www\.)/i.test(texto)) return "enlace";
  if (pareceNumeroPersonal(texto)) return "numero";
  return null;
}

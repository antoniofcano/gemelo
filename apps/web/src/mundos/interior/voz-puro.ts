// Lo puro de la lectura en voz alta de las fichas de la visita (eje B; Web Speech API del navegador, sin ficheros de audio ni librerías): sin DOM ni
// speechSynthesis. Lo usa voz.ts (lo fino, que toca el navegador) y lo prueba voz-puro.test.ts en Vitest.
//   · elegirVoz: es-ES si hay; si no, cualquier es-*; si no, «es» a secas; si no hay voz española, null (nunca se lee en otro idioma);
//   · trocea: el texto en trozos cortos por frases (Chrome corta las lecturas largas a los ~15 s), sin partir palabras;
//   · textoLectura: lo que se lee de una ficha (título, texto y dato curioso; sin las marcas [n] de las fuentes ni las etiquetas de procedencia,
//     que se ven en la ficha);
//   · estadoVoz y etiquetaVoz: el estado del botón y su texto.
import type { Ficha } from "../../datos/contratos/mundo-interior.ts";

export interface VozDisponible { lang: string; name?: string; default?: boolean; localService?: boolean }
export type EstadoVoz = "sin_voz" | "parada" | "leyendo";

const norma = (l: unknown): string => String(l || "").toLowerCase().replace(/_/g, "-");

/** el índice de la mejor voz española de la lista (es-ES, luego es-*, luego «es»), o −1. En el empate, la del sistema por defecto y luego la local. */
function elegirVoz(voces: ReadonlyArray<VozDisponible> | null | undefined): number {
  let mejor = -1, nota = 0;
  (voces || []).forEach((v, i) => {
    const l = norma(v && v.lang);
    const base = l === "es-es" ? 30 : l.startsWith("es-") ? 20 : l === "es" ? 10 : 0;
    if (!base) return;
    const n = base + (v.default ? 2 : 0) + (v.localService ? 1 : 0);
    if (n > nota) { nota = n; mejor = i; }
  });
  return mejor;
}

/** Parte un texto en trozos de como mucho max caracteres: por frases, y una frase más larga por palabras (una palabra más larga va sola). */
function trocea(texto: string, max = 180): string[] {
  const out: string[] = []; let t = "";
  const mete = (s: string): void => {
    if (t && t.length + 1 + s.length > max) { out.push(t); t = s; } else t = t ? t + " " + s : s;
  };
  for (const frase of String(texto || "").split(/(?<=[.!?…;:])\s+/).map(s => s.trim()).filter(Boolean)) {
    if (frase.length <= max) mete(frase);
    else for (const w of frase.split(/\s+/).filter(Boolean)) mete(w);
  }
  if (t) out.push(t);
  return out;
}

/** lo que se lee de una ficha: título, texto y dato curioso, sin las marcas [n] */
function textoLectura(f: Pick<Ficha, "titulo" | "texto" | "dato_curioso">): string {
  const fin = (s: string): string => (/[.!?…:;]$/.test(s) ? s : s + ".");
  const limpia = (s: unknown): string => String(s || "").replace(/\s*\[\d+(?:\s*[,–-]\s*\d+)*\]/g, "").replace(/\s+/g, " ").trim();
  const p = [limpia(f.titulo), limpia(f.texto)];
  const dc = limpia(f.dato_curioso);
  if (dc) p.push("Dato curioso: " + dc);
  return p.filter(Boolean).map(fin).join(" ");
}

/** el estado del botón: sin voz española, parada o leyendo */
function estadoVoz(hayVoz: boolean, leyendo: boolean): EstadoVoz { return !hayVoz ? "sin_voz" : leyendo ? "leyendo" : "parada"; }
/** el texto del botón de leer */
function etiquetaVoz(e: EstadoVoz): string { return e === "sin_voz" ? "Sin voz en español" : e === "leyendo" ? "Callar" : "Leer en voz alta"; }
/** el texto del interruptor de la lectura automática */
function etiquetaAuto(on: boolean): string { return on ? "Lectura automática: sí" : "Lectura automática: no"; }

export const VozPuro = { elegirVoz, trocea, textoLectura, estadoVoz, etiquetaVoz, etiquetaAuto };

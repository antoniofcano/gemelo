// Fotos y pinturas que cuelgan los hogares (decisiones 91, 93 y 96; doc/sistema/VIDA.md). Nada de binarios en la base:
// el fichero va a la carpeta GEMELO_MEDIOS con un nombre al azar y la fila de `medios` lo describe. Toda imagen se
// RE-CODIFICA con sharp (libvips): se lee solo si es JPEG, PNG o WebP de verdad (por su contenido, no por lo que diga la
// cabecera), se endereza según su EXIF y se escribe WebP de ≤ 1600 px SIN metadatos (ni EXIF, ni GPS, ni ICC, ni XMP):
// lo que se guarda nunca es el fichero que mandó el navegador.
import { createHash, randomBytes } from "node:crypto";
import { readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { Bd } from "../bd/pool.ts";

export const TIPOS_ADMITIDOS = ["image/jpeg", "image/png", "image/webp"] as const;
export type TipoAdmitido = (typeof TIPOS_ADMITIDOS)[number];
const FORMATO: Record<TipoAdmitido, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };

/** Lado mayor de la imagen guardada y tope de píxeles de la entrada (contra «bombas» de descompresión). */
export const LADO_MAX = 1600;
export const PIXELES_MAX = 40_000_000;
/** Versión vigente del aviso «sin caras de menores ni datos personales» (contratos/vida.md). Si cambia el texto, se sube. */
export const AVISO_VERSION = 1;
export const TEXTO_AVISO = "Sube solo fotos o pinturas del olivo o del campo. No subas caras de menores ni datos personales (nombres, matrículas, direcciones, teléfonos). Lo que subes lo ven al momento las demás familias; la oficina puede retirarlo.";

export const CLAVE = /^[a-f0-9]{32}\.webp$/;

export class ImagenNoValida extends Error {
  readonly motivo: "tipo_no_admitido" | "no_es_imagen" | "demasiado_grande";
  constructor(motivo: ImagenNoValida["motivo"]) { super(motivo); this.motivo = motivo; }
}

export interface ImagenProcesada { datos: Buffer; ancho: number; alto: number; sha256: Buffer }

/** Comprueba, endereza, reduce y re-codifica. Lanza ImagenNoValida si no es lo que dice ser o no se puede leer. */
export async function procesaImagen(entrada: Buffer, tipoDeclarado: string): Promise<ImagenProcesada> {
  if (!(TIPOS_ADMITIDOS as readonly string[]).includes(tipoDeclarado)) throw new ImagenNoValida("tipo_no_admitido");
  let formato: string | undefined, ancho: number | undefined, alto: number | undefined;
  try {
    const m = await sharp(entrada, { limitInputPixels: false, failOn: "error" }).metadata();
    formato = m.format; ancho = m.width; alto = m.height;
  } catch { throw new ImagenNoValida("no_es_imagen"); }
  if (formato !== FORMATO[tipoDeclarado as TipoAdmitido]) throw new ImagenNoValida("tipo_no_admitido");
  if (!ancho || !alto) throw new ImagenNoValida("no_es_imagen");
  if (ancho * alto > PIXELES_MAX) throw new ImagenNoValida("demasiado_grande");
  try {
    const { data, info } = await sharp(entrada, { limitInputPixels: PIXELES_MAX, failOn: "error", animated: false })
      .rotate()                                     // endereza por la orientación EXIF antes de tirar los metadatos
      .resize({ width: LADO_MAX, height: LADO_MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })                        // sin keepMetadata/withMetadata: la salida no lleva EXIF, GPS, ICC ni XMP
      .toBuffer({ resolveWithObject: true });
    return { datos: data, ancho: info.width, alto: info.height, sha256: createHash("sha256").update(data).digest() };
  } catch { throw new ImagenNoValida("no_es_imagen"); }
}

/** Escribe el fichero con un nombre nuevo al azar (128 bits). Nunca pisa uno existente (flag wx). */
export async function guardaFichero(carpeta: string, datos: Buffer): Promise<string> {
  const clave = randomBytes(16).toString("hex") + ".webp";
  await writeFile(join(carpeta, clave), datos, { flag: "wx", mode: 0o640 });
  return clave;
}

export async function borraFicheros(carpeta: string | null, claves: string[]): Promise<void> {
  if (!carpeta) return;
  for (const c of claves) if (CLAVE.test(c)) await unlink(join(carpeta, c)).catch(() => undefined);
}

/** Claves de los ficheros de un hogar: se leen ANTES de borrarlo (la cascada se lleva las filas, no los ficheros). */
export async function clavesDelHogar(bd: Bd, hogarId: number): Promise<string[]> {
  return (await bd.query<{ clave: string }>("SELECT clave FROM medios WHERE hogar_id = $1", [hogarId])).rows.map(r => r.clave);
}

/**
 * Limpieza periódica (doc/sistema/VIDA.md § Conservación):
 *  - el fichero de un contenido retirado se borra a los `retencionDias` (lo que tarda la oficina en atender una denuncia);
 *  - un fichero subido y nunca colgado se borra al día;
 *  - en la carpeta, todo fichero sin fila (p. ej. de un hogar borrado si falló el borrado inmediato) se borra a la hora.
 */
export async function purgaMedios(bd: Bd, carpeta: string | null, retencionDias: number): Promise<number> {
  const r = await bd.query<{ clave: string }>(
    `WITH viejos AS (
       SELECT m.id FROM medios m
        WHERE NOT EXISTS (SELECT 1 FROM diario_haza d WHERE d.medio_id = m.id)
          AND NOT EXISTS (SELECT 1 FROM personalizaciones p WHERE p.medio_id = m.id AND (p.estado = 'visible' OR p.retirada_en > now() - make_interval(days => $1)))
          AND (EXISTS (SELECT 1 FROM personalizaciones p WHERE p.medio_id = m.id) OR m.creado_en < now() - interval '1 day')
     )
     -- personalizaciones.medio_id se queda a NULL por la FK (ON DELETE SET NULL); solo pasa en las retiradas
     DELETE FROM medios WHERE id IN (SELECT id FROM viejos) RETURNING clave`, [retencionDias]);
  const claves = r.rows.map(x => x.clave);
  await borraFicheros(carpeta, claves);
  if (carpeta) {
    const vivos = new Set((await bd.query<{ clave: string }>("SELECT clave FROM medios")).rows.map(x => x.clave));
    for (const f of await readdir(carpeta).catch(() => [] as string[])) {
      if (!CLAVE.test(f) || vivos.has(f)) continue;
      const s = await stat(join(carpeta, f)).catch(() => null);
      if (s && s.mtimeMs < Date.now() - 3600_000) { await unlink(join(carpeta, f)).catch(() => undefined); claves.push(f); }
    }
  }
  return claves.length;
}

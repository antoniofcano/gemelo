// Imágenes SINTÉTICAS para las pruebas de subida: un JPEG con EXIF que delata (autor, GPS inventado, orientación girada).
import sharp from "sharp";

/** 2400 × 1200 con orientación EXIF 6 (girada 90°), autor «Persona Secreta» y un GPS inventado. */
export async function jpegConExif(): Promise<Buffer> {
  return sharp({ create: { width: 2400, height: 1200, channels: 3, background: { r: 90, g: 120, b: 60 } } })
    .jpeg({ quality: 80 })
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Artist: "Persona Secreta", Copyright: "Hogar de prueba" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 23/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "5/1 59/1 0/1" } })
    .toBuffer();
}

/** ¿Lleva el bloque EXIF el puntero al directorio GPS (etiqueta 0x8825, en cualquier orden de bytes)? */
export const tieneGps = (exif: Buffer | undefined): boolean =>
  !!exif && (exif.includes(Buffer.from([0x88, 0x25])) || exif.includes(Buffer.from([0x25, 0x88])));

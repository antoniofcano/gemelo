// Genera los PNG del icono (manifiesto web y iPhone) desde apps/web/public/icono.svg con sharp.
// Reproducible: `cd apps/web && npm run iconos`. Icono provisional hasta la marca (decisión 44; excepción de PNG: decisión 98).
// Salida en apps/web/public/: icono-192.png, icono-512.png, icono-512-maskable.png (zona segura) e icono-apple-180.png.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const svg = fs.readFileSync(path.join(PUBLIC, "icono.svg"));
const FONDO = "#101418";   // el mismo del rect del SVG

const png = (t) => sharp(svg, { density: 384 }).resize(t, t);

// Redondeado del SVG tal cual (purpose "any").
for (const t of [192, 512]) await png(t).png({ compressionLevel: 9 }).toFile(path.join(PUBLIC, `icono-${t}.png`));

// Maskable: el motivo ocupa el 80 % central (zona segura: círculo del 40 % de radio) sobre fondo lleno a sangre.
{
  const T = 512, M = Math.round(T * 0.8);
  const motivo = await sharp(svg, { density: 384 }).resize(M, M).png().toBuffer();
  await sharp({ create: { width: T, height: T, channels: 4, background: FONDO } })
    .composite([{ input: motivo, gravity: "centre" }]).png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, "icono-512-maskable.png"));
}

// iPhone: iOS aplica su propia máscara, así que va a sangre (sin esquinas transparentes).
{
  const T = 180;
  const motivo = await sharp(svg, { density: 384 }).resize(T, T).png().toBuffer();
  await sharp({ create: { width: T, height: T, channels: 3, background: FONDO } })
    .composite([{ input: motivo }]).png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, "icono-apple-180.png"));
}
console.log("iconos generados en", PUBLIC);

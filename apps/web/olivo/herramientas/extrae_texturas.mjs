// Saca las tres fotos de campo (corteza, musgo, madera vieja) de la referencia a apps/web/olivo/texturas/ (versionadas, decisión de
// Antonio nº 30; licencia en texturas/LICENCIA.txt). Sirve para regenerarlas si cambian en el constructor.
//   node herramientas/extrae_texturas.mjs [referencia.html]      (por defecto GEMELO_REFERENCIA_OLIVOS o referencia/olivos-tipo.html en la raíz)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OLIVO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RAIZ = path.resolve(OLIVO, "..", "..", "..");
const ref = process.argv[2] || process.env.GEMELO_REFERENCIA_OLIVOS || path.join(RAIZ, "referencia", "olivos-tipo.html");
if (!fs.existsSync(ref)) { console.error("no está la referencia: " + ref); process.exit(2); }
const src = fs.readFileSync(ref, "utf8"), dest = path.join(OLIVO, "texturas");
fs.mkdirSync(dest, { recursive: true });
let n = 0;
for (const id of ["corteza", "musgo", "muerta"]) {
  const m = new RegExp('<script type="text/plain" id="' + id + '">\\s*data:image/jpeg;base64,([A-Za-z0-9+/=\\s]+)</script>').exec(src);
  if (!m) { console.error("sin la foto «" + id + "» en la referencia"); continue; }
  const b = Buffer.from(m[1].replace(/\s+/g, ""), "base64");
  if (b[0] !== 0xff || b[1] !== 0xd8) { console.error("«" + id + "» no es un JPEG"); continue; }
  fs.writeFileSync(path.join(dest, id + ".jpg"), b); n++;
  console.log(id + ".jpg: " + Math.round(b.length / 1024) + " KB");
}
console.log(n + " fotos en " + path.relative(RAIZ, dest));
process.exit(n === 3 ? 0 : 1);

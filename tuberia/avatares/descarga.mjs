// Descarga los avatares CC0 provisionales de fuentes.json (decisión 74) a una carpeta FUERA del repo, comprobando su sha256 y su meta.
//   GEMELO_AVATARES_ORIGEN=<carpeta> node tuberia/avatares/descarga.mjs
// Escribe <id>.vrm (tal cual, sin optimizar) y <id>.avatar.json (nombre, licencia, fuente y colores del muñeco, para construye.mjs). Si un fichero ya está con su
// huella, no lo baja. Si el contenido descargado no tiene el sha256 fijado o su meta ya no dice lo que se verificó, SE NIEGA (nada se escribe).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { leeGlb, leeMeta, evaluaLicencia } from "./vrm.mjs";
import { fueraDelRepo } from "./construye.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const sha = b => crypto.createHash("sha256").update(b).digest("hex");

export async function descarga({ destino, fuentes = JSON.parse(fs.readFileSync(path.join(AQUI, "fuentes.json"), "utf8")), traer = async u => { const r = await fetch(u); if (!r.ok) throw new Error("HTTP " + r.status + " en " + u); return Buffer.from(await r.arrayBuffer()); }, log = () => {} }) {
  const d = fueraDelRepo(destino, "GEMELO_AVATARES_ORIGEN"); fs.mkdirSync(d, { recursive: true });
  const hechos = [];
  for (const a of fuentes.avatares) {
    const f = path.join(d, a.id + ".vrm");
    let b = fs.existsSync(f) ? fs.readFileSync(f) : null;
    if (!b || sha(b) !== a.sha256) {
      b = await traer(a.url); log("descargado " + a.id + " (" + b.length + " bytes)");
    }
    if (sha(b) !== a.sha256) throw new Error(a.id + ": el sha256 no es el fijado en fuentes.json (" + sha(b) + "): el contenido cambió; no se usa");
    const meta = leeMeta(leeGlb(b).json), ev = evaluaLicencia(meta);
    if (!ev.ok) throw new Error(a.id + ": el meta ya no permite el uso: " + ev.motivos.join("; "));
    if (meta.licenciaNombre && meta.licenciaNombre !== a.licencia.nombre_meta) throw new Error(a.id + ": el meta dice " + meta.licenciaNombre + " y fuentes.json " + a.licencia.nombre_meta);
    fs.writeFileSync(f, b);
    fs.writeFileSync(path.join(d, a.id + ".avatar.json"), JSON.stringify({ id: a.id, nombre: a.nombre, descripcion: a.descripcion, autor: a.autor, licencia: { spdx: a.licencia.spdx, url: a.licencia.url }, fuente: a.fuente, colores_muneco: a.colores_muneco }, null, 2) + "\n");
    hechos.push(a.id);
  }
  return hechos;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const destino = process.env.GEMELO_AVATARES_ORIGEN;
  if (!destino) { console.error("descarga: falta GEMELO_AVATARES_ORIGEN (una carpeta fuera del repo)"); process.exit(2); }
  descarga({ destino, log: m => console.error(m) }).then(h => console.log(JSON.stringify({ avatares: h, destino: path.resolve(destino) }))).catch(e => { console.error("descarga: " + e.message); process.exit(1); });
}

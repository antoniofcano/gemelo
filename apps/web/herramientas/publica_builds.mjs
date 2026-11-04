// Compone lo que se sube a /finca/ con las dos builds (ADR-0031 F2c; doc/operacion/PUBLICACION.md «Las dos builds»):
//   node apps/web/herramientas/publica_builds.mjs [--pantalla apps/web/dist] [--vr apps/web/dist-vr] [--dest apps/web/dist-publicar]
// Entrada: la salida de `npm run build` (pantalla, obligatoria) y, si la hay, la de `GEMELO_BUILD=vr npm run build` (dist-vr/).
// Salida (dest, lo que va tal cual a …/finca/):
//   index.html            la página de la build de pantalla con la entrada de Vite SUSTITUIDA por el cargador (<script src="./assets/cargador-…js">)
//   assets/…              los de pantalla + assets/cargador-<huella>.js (el cargador, con el manifiesto dentro; inmutable por su huella)
//   builds.json           el manifiesto suelto (qué builds hay, su entrada y su huella) para leer de vuelta lo publicado
//   vr/assets/…           SOLO los assets de la build de VR (lo demás —xr/, iconos, manifest— es idéntico y sale de la raíz); si no hay dist-vr, no existe
//   (el resto de dist/ —xr/perfiles, icono, manifest.webmanifest…— tal cual)
// Sin dist-vr todo queda como hoy: el manifiesto trae solo «pantalla» y la página carga la de siempre. No toca dist/ ni dist-vr/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { leeIndiceVite, manifiesto, generaCargador, huella } from "./cargador.mjs";

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function leeBuild(dir, prefijo) {
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8"), ix = leeIndiceVite(html);
  const ruta = p => (prefijo ? prefijo + "/" : "") + p;
  const fichero = path.join(dir, ix.entrada);
  if (!fs.existsSync(fichero)) throw new Error("la entrada " + ix.entrada + " no está en " + dir);
  return { html, etiquetas: ix.etiquetas, entrada: ruta(ix.entrada), huella: huella(fs.readFileSync(fichero)), css: ix.css.map(ruta), precarga: ix.precarga.map(ruta) };
}

/** Compone dest. vr = carpeta de dist-vr o null. Devuelve { dest, manifiesto, cargador } */
export function compone(pantalla, vr, dest) {
  if (!fs.existsSync(path.join(pantalla, "index.html"))) throw new Error("no hay build de pantalla en " + pantalla + " (cd apps/web && GEMELO_DATOS=<indice.json> npm run build)");
  if (path.resolve(dest) === path.resolve(pantalla) || (vr && path.resolve(dest) === path.resolve(vr))) throw new Error("dest no puede ser una de las carpetas de entrada");
  const hayVR = !!vr && fs.existsSync(path.join(vr, "index.html"));
  if (vr && !hayVR) console.warn("aviso: no hay build de VR en " + vr + "; se publica solo la de pantalla");
  const bp = leeBuild(pantalla, ""), bv = hayVR ? leeBuild(vr, "vr") : null;
  const man = manifiesto(bv ? { pantalla: bp, vr: bv } : { pantalla: bp });
  const codigo = generaCargador(man, WEB), nombre = "cargador-" + huella(codigo) + ".js";
  man.cargador = "assets/" + nombre;

  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(pantalla, dest, { recursive: true });
  if (bv) fs.cpSync(path.join(vr, "assets"), path.join(dest, "vr", "assets"), { recursive: true });
  fs.mkdirSync(path.join(dest, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dest, "assets", nombre), codigo);
  // la página: fuera la entrada, sus precargas y sus hojas (las pone el cargador, de la build elegida); dentro, el cargador, al final del cuerpo
  let html = bp.html;
  for (const t of bp.etiquetas) html = html.replace(t, "");
  const tag = '<script src="./' + man.cargador + '"></script>';
  html = /<\/body>/.test(html) ? html.replace("</body>", tag + "\n</body>") : html + tag + "\n";
  fs.writeFileSync(path.join(dest, "index.html"), html);
  fs.writeFileSync(path.join(dest, "builds.json"), JSON.stringify(man, null, 1) + "\n");
  return { dest, manifiesto: man, cargador: nombre };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : undefined; };
  const r = compone(path.resolve(arg("pantalla") || path.join(WEB, "dist")), path.resolve(arg("vr") || path.join(WEB, "dist-vr")), path.resolve(arg("dest") || path.join(WEB, "dist-publicar")));
  console.log("publicable en " + r.dest + " · builds: " + Object.keys(r.manifiesto.builds).join(", ") + " · cargador " + r.cargador);
}

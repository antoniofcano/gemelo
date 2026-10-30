// Utilidades comunes de los guardianes (node:test, sin dependencias salvo playwright-core para la carga en navegador).
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
const { spawnSync } = require("child_process");

const RAIZ = path.resolve(__dirname, "..", "..");
const SALIDA = path.join(RAIZ, "pruebas", "salida");
const rel = p => path.relative(RAIZ, p).split(path.sep).join("/");

/** Ficheros del repo: versionados + nuevos no ignorados (así los guardianes valen antes de hacer commit). */
function ficheros() {
  const r = spawnSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("git ls-files falló: " + r.stderr);
  return r.stdout.split("\n").filter(Boolean).filter(f => fs.existsSync(path.join(RAIZ, f)));
}
const BINARIOS = /\.(jpg|jpeg|png|gif|webp|ico|woff2?|mp3|mp4|zip|glb)$/i;
const esTexto = f => !BINARIOS.test(f);
const lee = f => fs.readFileSync(path.join(RAIZ, f), "utf8");

function ejecuta(cmd, args, opciones) {
  return spawnSync(cmd, args, Object.assign({ cwd: RAIZ, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }, opciones || {}));
}
/** Python 3 (en Windows suele ser `python`; en otros sistemas `python3`) */
function python() {
  for (const c of [process.env.PYTHON, "python", "python3", "py"].filter(Boolean)) {
    const r = spawnSync(c, ["-I", "-c", "import sys;print(sys.version_info[0])"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim() === "3") return c;
  }
  return null;
}
/** Ruta de Chrome o null */
function chrome() {
  const c = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
  return c.find(p => fs.existsSync(p)) || null;
}
function playwright() {
  try { return require(process.env.PLAYWRIGHT_CORE || "playwright-core"); }
  catch (e) { try { return require(path.join(RAIZ, "node_modules", "playwright-core")); } catch (e2) { return null; } }
}

/** Carpeta de trabajo propia de este proceso (los guardianes corren en paralelo, cada fichero en su proceso): se borra al salir */
function propia(nombre) {
  const d = path.join(SALIDA, nombre + "-" + process.pid);
  fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true });
  process.on("exit", () => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* nada que hacer */ } });
  return d;
}
/** Genera el fixture sintético (determinista) y devuelve su carpeta: {cerro,hituelo}/{indice.json, t/, tileset/}. Con sinTileset, sin tileset/
 *  (para las pruebas que solo leen índices y teselas: el tileset tarda y la primera vez instala las dependencias de tuberia/tiles3d) */
function fixture({ sinTileset = false } = {}) {
  const py = python();
  if (!py) throw new Error("No hay Python 3: no se puede generar el fixture");
  const dest = propia(sinTileset ? "fixture-sin-tileset" : "fixture");
  const r = ejecuta(py, ["-I", path.join("pruebas", "genera_fixture.py"), "--salida", dest].concat(sinTileset ? ["--sin-tileset"] : []));
  if (r.status !== 0) throw new Error("genera_fixture.py falló:\n" + r.stdout + r.stderr);
  return dest;
}

module.exports = { RAIZ, SALIDA, propia, rel, ficheros, esTexto, lee, ejecuta, python, chrome, playwright, fixture, os, fs, path };

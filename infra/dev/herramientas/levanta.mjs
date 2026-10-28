// Levanta el entorno de desarrollo con Docker: `npm run dev:arriba` (o node infra/dev/herramientas/levanta.mjs [--sin-build]).
//  1. crea infra/dev/.env con claves aleatorias si falta;
//  2. genera el fixture sintético si falta (o usa GEMELO_DEV_TESELAS, una carpeta de datos reales FUERA del repo);
//  3. construye la web con Vite contra el índice de la finca (GEMELO_DEV_FINCA, por defecto hituelo), con base /teselas/<finca>/,
//     y deja junto a cada fichero su versión .br/.gz para que Caddy los sirva ya comprimidos;
//  4. docker compose up -d --wait (espera a los healthchecks).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { aseguraEnv, cargaEnv, carpetaTeselas, compose, motivoSinDocker, npm, aseguraDependencias, puertos, util, RAIZ, ENV, FIXTURE, SALIDA_DEV, WEB } from "./_comun.mjs";

const SIN_BUILD = process.argv.includes("--sin-build");
const rel = p => path.relative(RAIZ, p) || ".";

function paso(t) { console.log("\n▸ " + t); }

function preparaFixture() {
  if (fs.existsSync(path.join(FIXTURE, "hituelo", "indice.json")) && fs.existsSync(path.join(FIXTURE, "cerro", "embebido.json"))) return;
  const py = util.python();
  if (!py) throw new Error("falta Python 3 para generar el fixture (python pruebas/genera_fixture.py)");
  const r = util.ejecuta(py, ["-I", path.join("pruebas", "genera_fixture.py"), "--salida", FIXTURE]);
  if (r.status !== 0) throw new Error("genera_fixture.py falló:\n" + r.stdout + r.stderr);
  console.log("  " + r.stdout.trim());
}

/** Copia el índice de la finca con `base` = /teselas/<finca>/ (campo del contrato indice.schema.json) para que el motor pida allí t/ */
function datosDeLaWeb(teselas, finca) {
  const indice = path.join(teselas, finca, "indice.json");
  if (!fs.existsSync(indice)) throw new Error("no existe " + indice + " (¿GEMELO_DEV_FINCA o GEMELO_DEV_TESELAS mal puestos?)");
  const D = JSON.parse(fs.readFileSync(indice, "utf8"));
  D.base = "/teselas/" + finca + "/";
  fs.mkdirSync(SALIDA_DEV, { recursive: true });
  const salida = path.join(SALIDA_DEV, "datos-" + finca + ".json");
  fs.writeFileSync(salida, JSON.stringify(D));
  return salida;
}

/** .br y .gz al lado de cada fichero de texto (Caddy: file_server { precompressed br zstd gzip }); zstd lo hace Caddy al vuelo */
function precomprime(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || !/\.(html|js|css|json|svg|txt|map)$/.test(e.name)) continue;
    const f = path.join(e.parentPath, e.name), b = fs.readFileSync(f);
    if (b.length < 1024) continue;
    fs.writeFileSync(f + ".br", zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } }));
    fs.writeFileSync(f + ".gz", zlib.gzipSync(b, { level: 9 }));
    n++;
  }
  return n;
}

function construyeWeb(datos) {
  if (!fs.existsSync(path.join(WEB, "node_modules", "vite"))) { console.log("  instalando apps/web (npm ci)…"); npm(["ci", "--no-audit", "--no-fund"], WEB); }
  npm(["run", "build"], WEB, { GEMELO_DATOS: datos });
  const dist = path.join(WEB, "dist");
  console.log("  " + precomprime(dist) + " ficheros precomprimidos (br, gz) en " + rel(dist));
}

export function levanta({ sinBuild = false } = {}) {
  const sin = motivoSinDocker();
  if (sin) throw new Error(sin);
  paso("claves de desarrollo");
  console.log(aseguraEnv() ? "  creado " + rel(ENV) + " con claves aleatorias" : "  " + rel(ENV) + " ya existe (no se toca)");
  cargaEnv();
  const teselas = carpetaTeselas(), finca = process.env.GEMELO_DEV_FINCA || "hituelo";
  paso("datos: " + (teselas === FIXTURE ? "fixture sintético" : "carpeta local (GEMELO_DEV_TESELAS)") + ", finca " + finca);
  if (teselas === FIXTURE) preparaFixture();
  const datos = datosDeLaWeb(teselas, finca);
  if (!sinBuild) { paso("build de la web (Vite)"); construyeWeb(datos); }
  else if (!fs.existsSync(path.join(WEB, "dist", "index.html"))) throw new Error("--sin-build pero no hay apps/web/dist: quítalo la primera vez");
  paso("dependencias de las herramientas");
  aseguraDependencias();
  paso("docker compose up -d --wait");
  const r = compose(["up", "-d", "--wait", "--wait-timeout", "180"], { env: { GEMELO_DEV_TESELAS: teselas } });
  if (r.status !== 0) throw new Error("docker compose up falló (mira `npm run dev:estado` y `docker compose -f infra/dev/compose.yml logs`)");
  const p = puertos();
  console.log("\nListo:\n  web       http://localhost:" + p.web + "/   (y https://localhost:" + p.https + "/ con certificado local no instalado)" +
    "\n  teselas   http://localhost:" + p.web + "/teselas/" + finca + "/indice.json" +
    "\n  correo    http://localhost:" + p.correoWeb + "/   (SMTP en 127.0.0.1:" + p.smtp + ")" +
    "\n  db        127.0.0.1:" + p.db + "  usuario gemelo, base gemelo, clave en infra/dev/.env" +
    "\n  livekit   ws://localhost:" + p.livekit + "  (claves en infra/dev/.env)");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { levanta({ sinBuild: SIN_BUILD }); }
  catch (e) { console.error("\n✗ " + e.message); process.exit(1); }
}

// Levanta el entorno de desarrollo con Docker: `npm run dev:arriba` (o node infra/dev/herramientas/levanta.mjs [--sin-build] [--red-local]).
// --red-local: además de 127.0.0.1, el https de Caddy y los medios de LiveKit (7881/tcp, 7882/udp; y SOLO eso) escuchan en
// la IP de la red local (GEMELO_DEV_IP o la que se detecta), para probar desde el móvil o las Quest de la misma WiFi
// (compose.red-local.yml). Sin él, todo como siempre.
//  1. crea infra/dev/.env con claves aleatorias si falta;
//  2. genera el fixture sintético si falta (o usa datos reales FUERA del repo: GEMELO_DEV_TESELAS, o GEMELO_DEV_FINCA_CARPETA
//     para la salida de UNA finca como hituelo-v3, y GEMELO_DEV_TILESET para el tileset 3D Tiles de /teselas/<finca>/tileset/, y GEMELO_DEV_OLIVOS para las recetas horneadas de /teselas/<finca>/olivos/);
//  3. construye la web con Vite contra el índice de la finca (GEMELO_DEV_FINCA, por defecto hituelo), con base /teselas/<finca>/,
//     CON el constructor de olivos (apps/web/olivo, ?olivos=gen) y 3DTilesRendererJS (?escena=tiles), instalándolos si faltan,
//     y la portada (apps/web/portada → dist-portada, build:portada), y deja junto a cada fichero su .br/.gz para que Caddy
//     los sirva ya comprimidos;
//  4. arranca la base y comprueba que tiene los roles de producción (gemelo_dueno y gemelo_api; decisión 55): un volumen
//     de antes no los tiene y se dice cómo arreglarlo;
//     El servicio `hornero` (tuberia/olivos/servicio.mjs, O7f) hornea las variantes de olivos de la finca servida en la carpeta que
//     Caddy sirve como /teselas/<finca>/olivos/ (GEMELO_DEV_OLIVOS o pruebas/salida/olivos-dev/<finca>, que se crea aquí); con
//     GEMELO_DEV_FINCA_CARPETA hornea esa finca (el índice se monta de solo lectura);
//  5. docker compose up -d --build --wait: construye la imagen de la api (apps/api/Dockerfile; con la caché de Docker es
//     rápido si no cambió nada), aplica las migraciones (servicio `migra`) y espera a los healthchecks;
//  6. siembra las hazas, los olivos y los hogares de prueba SINTÉTICOS (siembra.mjs, idempotente). Con datos que no son el
//     fixture, las hazas son unas pocas INVENTADAS dentro de la caja de la finca (tuberia/hazas/de_prueba.py), sin olivos.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { siembra, HOGARES } from "./siembra.mjs";
import { aseguraEnv, cargaEnv, carpetaFinca, carpetaTeselas, carpetaTileset, carpetaOlivos, carpetaAvatares, olivosDestino, aseguraNpmCi, esFixture, fincaServida, indiceServido, compose, ipRedLocal, motivoSinDocker, npm, aseguraDependencias, puertos, util, RAIZ, ENV, FIXTURE, PG_API, PG_DUENO, SALIDA_DEV, WEB } from "./_comun.mjs";

const SIN_BUILD = process.argv.includes("--sin-build");
const RED_LOCAL = process.argv.includes("--red-local");
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

/** Copia el índice de la finca con `base` = /teselas/<finca>/ (campo del contrato indice.schema.json) para que el motor pida allí t/; con tileset
 *  (GEMELO_DEV_TILESET), también `tileset` = /teselas/<finca>/tileset/tileset.json: la escena 3D Tiles es entonces la de por defecto (ADR-0015, T8
 *  fase 1; la de siempre, con ?escena=clasica). Sin tileset no se escribe y el motor no pide nada (el fixture no lo trae: daría 404) */
function datosDeLaWeb(indice, finca, conTileset) {
  if (!fs.existsSync(indice)) throw new Error("no existe " + indice + " (¿GEMELO_DEV_FINCA, GEMELO_DEV_TESELAS o GEMELO_DEV_FINCA_CARPETA mal puestos?)");
  const D = JSON.parse(fs.readFileSync(indice, "utf8"));
  D.base = "/teselas/" + finca + "/";
  if (conTileset) D.tileset = D.base + "tileset/tileset.json"; else delete D.tileset;
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

/**
 * Las dependencias del cliente web que cambian lo que se ve: sin el constructor de olivos (apps/web/olivo → three-gen) Vite pone
 * un sustituto vacío y ?olivos=gen no hace nada; sin 3d-tiles-renderer, ?escena=tiles vuelve al relieve. Se instalan (npm ci,
 * versiones del package-lock) si faltan, y se dice con cuál se construye.
 */
function aseguraDependenciasWeb() {
  // también cuando el package-lock cambió con node_modules ya puesto (una dependencia nueva, p. ej. livekit-client): si no,
  // Vite falla con «Could not load …». Ver lockAlDia en _comun.mjs.
  aseguraNpmCi(WEB, { clave: ["vite", "3d-tiles-renderer"], aviso: "instalando apps/web" });
  const olivo = path.join(WEB, "olivo");
  aseguraNpmCi(olivo, { sinDev: true, clave: ["three-gen"], aviso: "instalando el constructor de olivos (apps/web/olivo, --omit=dev)" });
  for (const [nombre, ruta] of [["constructor de olivos (?olivos=gen)", path.join(olivo, "node_modules", "three-gen", "package.json")],
    ["3DTilesRendererJS (?escena=tiles)", path.join(WEB, "node_modules", "3d-tiles-renderer", "package.json")]]) {
    if (!fs.existsSync(ruta)) throw new Error("falta " + nombre + " tras instalar (" + rel(ruta) + ")");
    console.log("  con " + nombre);
  }
}

function construyeWeb(datos) {
  aseguraDependenciasWeb();
  npm(["run", "build"], WEB, { GEMELO_DATOS: datos });
  npm(["run", "build:portada"], WEB);          // la portada y la entrada (apps/web/portada → dist-portada), servida en /
  for (const d of ["dist", "dist-portada"]) {
    const dist = path.join(WEB, d);
    console.log("  " + precomprime(dist) + " ficheros precomprimidos (br, gz) en " + rel(dist));
  }
}

const volumen = () => (process.env.COMPOSE_PROJECT_NAME || "gemelo-dev") + "_pg_datos";
const ARREGLO = "es de desarrollo: npm run dev:abajo -- --borra-datos y vuelve a levantar (o usa otro COMPOSE_PROJECT_NAME)";

/**
 * Los roles solo se crean al iniciar el volumen (infra/bd-inicial/01-roles.sh, el de producción). Un volumen de antes de la
 * decisión 55 tiene el dueño «gemelo» y ni gemelo_dueno ni gemelo_api: se detecta aquí, con la base sola, y se dice qué hacer
 * en vez de dejar que `migra` falle con un error de autenticación. (psql por el socket del contenedor: no pide clave.)
 */
function compruebaRoles(env) {
  const u = compose(["up", "-d", "--wait", "--wait-timeout", "240", "db"], { env });
  if (u.status !== 0) throw new Error("la base no arranca (mira `docker compose -f infra/dev/compose.yml logs db`)");
  const r = compose(["exec", "-T", "db", "psql", "-U", PG_DUENO, "-d", "gemelo", "-tAc",
    "select count(*) from pg_roles where rolname = '" + PG_API + "'"], { captura: true, env });
  if (r.status !== 0 || r.stdout.trim() !== "1") {
    throw new Error("el volumen de la base (" + volumen() + ") es de antes de que el entorno local usara los roles de producción (" +
      PG_DUENO + " para migrar y " + PG_API + " para la api; decisión 55) y no los tiene" +
      (r.status !== 0 ? " (" + (r.stderr || r.stdout).trim().split("\n").pop() + ")" : "") + ". " + ARREGLO.replace(/^e/, "E"));
  }
}

/** Tras un `up` fallido: si `migra` o la api no entran por la clave, el volumen se creó con otro infra/dev/.env */
function motivoUp() {
  const l = compose(["logs", "--no-color", "migra", "api"], { captura: true });
  if (/password authentication failed/.test(l.stdout + l.stderr)) {
    return "la base no acepta las claves de infra/dev/.env: el volumen (" + volumen() + ") se creó con otras. " + ARREGLO.replace(/^e/, "E");
  }
  return "docker compose up falló (mira `npm run dev:estado` y `docker compose -f infra/dev/compose.yml logs`)";
}

export async function levanta({ sinBuild = false, redLocal = false } = {}) {
  const sin = motivoSinDocker();
  if (sin) throw new Error(sin);
  paso("claves de desarrollo");
  const env = aseguraEnv();
  console.log(env === "creado" ? "  creado " + rel(ENV) + " con claves aleatorias"
    : env ? "  " + rel(ENV) + " ya existía: añadidas las claves nuevas " + env.join(", ") : "  " + rel(ENV) + " ya existe (no se toca)");
  cargaEnv();
  const teselas = carpetaTeselas(), finca = fincaServida(), carpeta = carpetaFinca(), tileset = carpetaTileset(), olivos = carpetaOlivos();
  if (tileset && !fs.existsSync(path.join(tileset, "tileset.json"))) throw new Error("no existe " + path.join(tileset, "tileset.json") + " (GEMELO_DEV_TILESET: la carpeta del tileset; ver DESARROLLO-LOCAL.md, «Prueba en aparatos con Hituelo v3»)");
  // la carpeta del hornero (la que Caddy sirve en /teselas/<finca>/olivos/): la crea quien levanta, con permiso de escritura para el uid 1000
  // del contenedor (en Linux el dueño puede no serlo; en Docker Desktop da igual)
  const carpetaHornero = olivosDestino();
  fs.mkdirSync(carpetaHornero, { recursive: true });
  if (process.platform !== "win32") { try { fs.chmodSync(carpetaHornero, 0o777); } catch (e) { /* si no es nuestra, que lo diga el hornero */ } }
  fs.mkdirSync(carpetaAvatares(), { recursive: true });   // /avatares/: vacía hasta que se construya el catálogo (npm: node tuberia/avatares/construye.mjs)
  // lo que Compose monta: rutas absolutas ya resueltas ("" = no se da, y manda el valor por defecto del compose)
  const datosCompose = { GEMELO_DEV_TESELAS: teselas, GEMELO_DEV_FINCA_CARPETA: carpeta || "", GEMELO_DEV_TILESET: tileset || "", GEMELO_DEV_OLIVOS: olivosDestino(), GEMELO_AVATARES: carpetaAvatares(), GEMELO_DEV_FINCA: finca };
  let red = null;
  if (redLocal) {
    red = ipRedLocal();
    process.env.GEMELO_DEV_IP = red.ip;                 // lo interpola compose.red-local.yml
    paso("RED LOCAL: el https de la web y los medios de LiveKit (7881/tcp, 7882/udp) se abren también en " + red.ip + (red.nombre ? " (" + red.nombre + ")" : " (GEMELO_DEV_IP)") +
      "; base, correo, la señalización de LiveKit (va por Caddy) y la api siguen en 127.0.0.1 o sin puerto" +
      (red.otras.length ? "\n  otras IP posibles: " + red.otras.map(o => o.ip + " (" + o.nombre + ")").join(", ") + " — elige con GEMELO_DEV_IP" : ""));
  }
  paso("datos: " + (esFixture() ? "fixture sintético" : "carpeta local " + (carpeta ? "(GEMELO_DEV_FINCA_CARPETA)" : "(GEMELO_DEV_TESELAS)")) + ", finca " + finca +
    (tileset ? ", con tileset 3D Tiles (GEMELO_DEV_TILESET)" : "") + ", olivos horneados por el servicio hornero en " + (olivos ? "GEMELO_DEV_OLIVOS" : rel(carpetaHornero)));
  preparaFixture();                      // los guardianes y la siembra de la finca sintética parten siempre del fixture
  const datos = datosDeLaWeb(indiceServido(), finca, !!tileset);
  if (!sinBuild) { paso("build de la web (Vite)"); construyeWeb(datos); }
  else if (!fs.existsSync(path.join(WEB, "dist", "index.html")) || !fs.existsSync(path.join(WEB, "dist-portada", "index.html"))) throw new Error("--sin-build pero no hay apps/web/dist o dist-portada: quítalo la primera vez");
  paso("dependencias de las herramientas");
  aseguraDependencias();
  paso("base de datos y sus roles (" + PG_DUENO + ", " + PG_API + ")");
  compruebaRoles(datosCompose);
  paso("docker compose up -d --build --wait (api con sus migraciones y servicios)");
  // sin --red-local, `up` recrea web y api sin el puerto ni la IP de la red: cerrar es volver a levantar sin el interruptor
  const r = compose(["up", "-d", "--build", "--wait", "--wait-timeout", "240"], { env: datosCompose, redLocal });
  if (r.status !== 0) throw new Error(motivoUp());
  paso(esFixture() ? "siembra sintética (hazas, olivos y hogares de prueba)" : "siembra de prueba sobre la finca servida (hazas INVENTADAS dentro de su caja, sin olivos, y hogares de prueba)");
  const sembrado = await siembra();
  console.log("  " + sembrado.hazas + " hazas, " + sembrado.olivos + " olivos y " + sembrado.hogares + " hogares de prueba (" + HOGARES[0].correo + "…)" +
    (sembrado.modo === "prueba" ? "\n  OJO: las hazas son rectángulos inventados de 90 x 60 m (no son las de la oficina) y no hay olivos en la base: la ficha de una haza sale sin recuentos" : ""));
  const p = puertos();
  const w = "https://localhost:" + p.https;
  console.log("\nListo (por https: la CA local de Caddy no está instalada, el navegador avisará; http://localhost:" + p.web + " redirige aquí):" +
    "\n  portada   " + w + "/" +
    "\n  mundo     " + w + "/finca/   (solo con sesión: pide el enlace en la portada y ábrelo desde el buzón)" +
    "\n  api       " + w + "/api/salud" +
    "\n  teselas   " + w + "/teselas/" + finca + "/indice.json   (solo con sesión)" +
    (tileset ? "\n  tileset   " + w + "/teselas/" + finca + "/tileset/tileset.json   (solo con sesión; es la escena por defecto en /finca/; la de siempre, /finca/?escena=clasica)" : "") +
    "\n  olivos    " + w + "/teselas/" + finca + "/olivos/manifiesto.json   (solo con sesión; lo hornea el servicio hornero, `npm run dev:estado` dice si está listo; los objetos, /olivos/<huella>.br)" +
    "\n  correo    http://localhost:" + p.correoWeb + "/   (SMTP en 127.0.0.1:" + p.smtp + ")" +
    "\n  db        127.0.0.1:" + p.db + "  base gemelo; " + PG_DUENO + " (dueño) y " + PG_API + " (la api), claves en infra/dev/.env" +
    "\n  livekit   " + w + "/rtc para el navegador (por Caddy); ws://localhost:" + p.livekit + " para las herramientas (claves en infra/dev/.env)" +
    (red ? "\n\nABIERTO A LA RED LOCAL (solo mientras dure la prueba; se cierra con `npm run dev:abajo` o levantando sin --red-local):" +
      "\n  aparatos  https://" + red.ip + ":" + p.https + "/   (aceptar el aviso del certificado de la CA local)" +
      "\n  presencia https://" + red.ip + ":" + p.https + "/finca/?presencia=red   (medios de LiveKit por " + red.ip + ":7882/udp o 7881/tcp)" +
      "\n  enlace    el correo trae https://" + red.ip + ":" + p.https + "/api/auth/entrar?t=…: ábrelo en el ordenador desde el buzón" +
      "\n            (abrirlo no lo gasta), pásalo al aparato con «Crear código QR» de Chrome y pulsa «Entrar» EN EL APARATO" : ""));
  return { sembrado, red };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await levanta({ sinBuild: SIN_BUILD, redLocal: RED_LOCAL }); }
  catch (e) { console.error("\n✗ " + e.message); process.exit(1); }
}

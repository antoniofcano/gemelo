"use strict";
// `npm run puerta`: la puerta entera dentro de UN turno del banco y con UN solo Chrome sin pantalla para todas las pruebas de navegador
// (TESTING.md §«Banco de pruebas»). Arranca el Chrome con launchServer de Playwright, pasa su dirección a las pruebas (GEMELO_CHROME_WS,
// que lee pruebas/guardianes/_navegador.js) y les dice que ya están dentro del turno (GEMELO_TURNO=dentro). Las e2e de Docker
// (GEMELO_DOCKER=1) caen dentro del mismo turno. Argumentos extra: los ficheros de prueba (por defecto, todos los guardianes).
// Con GEMELO_SOLO_NODE=1 (`puerta:rapida`, `puerta:afectadas --solo-node`) no pide el turno ni lanza Chrome: sin navegador no hay nada que coordinar.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const inestables = require("./inestables");
const { conTurno } = require("./turno");
const { chrome, playwright, RAIZ } = require("../guardianes/_util");
const { ARGS_CHROME } = require("../guardianes/_navegador");

// Una pasada de las pruebas: reporter spec a la pantalla + reporter_fallos a un fichero (PB6, inestables.js). El reintento único lo decide inestables.orquesta.
// `servidor`: el Chrome compartido, o null (las pruebas de navegador se saltan solas). `enTurno`: si la puerta tiene el turno (GEMELO_TURNO=dentro).
async function corre(pruebas, servidor, enTurno) {
  const env = Object.assign({}, process.env, enTurno ? { GEMELO_TURNO: "dentro" } : {}, servidor ? { GEMELO_CHROME_WS: servidor.wsEndpoint() } : {});
  const ejecuta = ficheros => new Promise(ok => {
    const salida = path.join(RAIZ, "pruebas", "salida", "fallos-" + process.pid + ".json");
    fs.mkdirSync(path.dirname(salida), { recursive: true });
    const args = ["--test", "--test-concurrency=1", "--test-reporter=spec", "--test-reporter-destination=stdout", "--test-reporter=" + require("url").pathToFileURL(path.join(__dirname, "reporter_fallos.js")).href, "--test-reporter-destination=" + salida].concat(ficheros || pruebas);
    spawn(process.execPath, args, { cwd: RAIZ, env, stdio: "inherit" }).on("exit", c => {
      let fallos = []; try { fallos = JSON.parse(fs.readFileSync(salida, "utf8")); fs.unlinkSync(salida); } catch (e) { /* sin reporter: solo vale el código */ }
      ok({ codigo: c == null ? 1 : c, fallos });
    });
  });
  const antes = inestables.leeRegistro();
  const res = await inestables.orquesta({ ejecuta, firmas: inestables.cargaFirmas() });
  inestables.apunta(res.entradas);
  console.log("\n" + inestables.informe(res, antes));
  avisaFaltan(faltanDependencias());
  return res.codigo;
}

/** D-09 (auditoría del constructor, 2026-11-15): dependencias que, si faltan, dejan saltadas pruebas ENTERAS (con su aviso, pero la puerta salía en verde
 *  y nadie lo veía). Se dicen al final en voz alta; la puerta pesada no arranca sin ellas (puerta_pesada.js). → [{que, orden}] */
function faltanDependencias(raiz = RAIZ) {
  const r = [];
  if (!["three-gen", "three-r186", "vite"].every(d => fs.existsSync(path.join(raiz, "apps", "web", "olivo", "node_modules", d, "package.json"))))
    r.push({ que: "el constructor de olivos (apps/web/olivo: huellas, sellos de GEN_VERSION y CACHE_VERSION, niveles, materiales, el motor con ?olivos=gen)", orden: "cd apps/web/olivo && npm ci" });
  return r;
}
function avisaFaltan(f) {
  if (!f.length) return;
  const rojo = process.stdout.isTTY ? "\x1b[1;31m" : "", fin = process.stdout.isTTY ? "\x1b[0m" : "";
  console.log("\n" + rojo + "⚠ ATENCIÓN: esta puerta NO ha comprobado " + f.map(x => x.que + " — instálalo con «" + x.orden + "»").join("; ") + ". Verde no quiere decir que eso esté bien." + fin);
}

// `opciones` (inyección, para la prueba del guardián): los ficheros, el pedido de turno y la pasada de pruebas.
async function principal({ pruebas = process.argv.slice(2).length ? process.argv.slice(2) : ["pruebas/guardianes/*.test.js"], turno = conTurno, correPruebas = corre } = {}) {
  if (process.env.GEMELO_SOLO_NODE === "1") return correPruebas(pruebas, null, false);   // puerta rápida: sin turno ni Chrome
  return turno("puerta", async () => {
    const pw = playwright(), exe = chrome();
    const servidor = pw && exe ? await pw.chromium.launchServer({ executablePath: exe, args: ARGS_CHROME }) : null;   // sin Chrome, las pruebas de navegador se saltan solas
    try { return await correPruebas(pruebas, servidor, true); } finally { if (servidor) await servidor.close(); }
  });
}

module.exports = { principal, faltanDependencias };
if (require.main === module) principal().then(c => process.exit(c), e => { console.error(e); process.exit(1); });

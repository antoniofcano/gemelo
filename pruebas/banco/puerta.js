"use strict";
// `npm run puerta`: la puerta entera dentro de UN turno del banco y con UN solo Chrome sin pantalla para todas las pruebas de navegador
// (TESTING.md §«Banco de pruebas»). Arranca el Chrome con launchServer de Playwright, pasa su dirección a las pruebas (GEMELO_CHROME_WS,
// que lee pruebas/guardianes/_navegador.js) y les dice que ya están dentro del turno (GEMELO_TURNO=dentro). Las e2e de Docker
// (GEMELO_DOCKER=1) caen dentro del mismo turno. Argumentos extra: los ficheros de prueba (por defecto, todos los guardianes).
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const inestables = require("./inestables");
const { conTurno } = require("./turno");
const { chrome, playwright, RAIZ } = require("../guardianes/_util");
const { ARGS_CHROME } = require("../guardianes/_navegador");

async function principal() {
  const pruebas = process.argv.slice(2).length ? process.argv.slice(2) : ["pruebas/guardianes/*.test.js"];
  return conTurno("puerta", async () => {
    const pw = playwright(), exe = chrome();
    const servidor = pw && exe ? await pw.chromium.launchServer({ executablePath: exe, args: ARGS_CHROME }) : null;   // sin Chrome, las pruebas de navegador se saltan solas
    const env = Object.assign({}, process.env, { GEMELO_TURNO: "dentro" }, servidor ? { GEMELO_CHROME_WS: servidor.wsEndpoint() } : {});
    // Cada pasada: reporter spec a la pantalla + reporter_fallos a un fichero (PB6, inestables.js). El reintento único lo decide inestables.orquesta.
    const ejecuta = ficheros => new Promise(ok => {
      const salida = path.join(RAIZ, "pruebas", "salida", "fallos-" + process.pid + ".json");
      fs.mkdirSync(path.dirname(salida), { recursive: true });
      const args = ["--test", "--test-concurrency=1", "--test-reporter=spec", "--test-reporter-destination=stdout", "--test-reporter=" + require("url").pathToFileURL(path.join(__dirname, "reporter_fallos.js")).href, "--test-reporter-destination=" + salida].concat(ficheros || pruebas);
      spawn(process.execPath, args, { cwd: RAIZ, env, stdio: "inherit" }).on("exit", c => {
        let fallos = []; try { fallos = JSON.parse(fs.readFileSync(salida, "utf8")); fs.unlinkSync(salida); } catch (e) { /* sin reporter: solo vale el código */ }
        ok({ codigo: c == null ? 1 : c, fallos });
      });
    });
    try {
      const antes = inestables.leeRegistro();
      const res = await inestables.orquesta({ ejecuta, firmas: inestables.cargaFirmas() });
      inestables.apunta(res.entradas);
      console.log("\n" + inestables.informe(res, antes));
      return res.codigo;
    } finally { if (servidor) await servidor.close(); }
  });
}

principal().then(c => process.exit(c), e => { console.error(e); process.exit(1); });

"use strict";
// `npm run puerta`: la puerta entera dentro de UN turno del banco y con UN solo Chrome sin pantalla para todas las pruebas de navegador
// (TESTING.md §«Banco de pruebas»). Arranca el Chrome con launchServer de Playwright, pasa su dirección a las pruebas (GEMELO_CHROME_WS,
// que lee pruebas/guardianes/_navegador.js) y les dice que ya están dentro del turno (GEMELO_TURNO=dentro). Las e2e de Docker
// (GEMELO_DOCKER=1) caen dentro del mismo turno. Argumentos extra: los ficheros de prueba (por defecto, todos los guardianes).
const { spawn } = require("child_process");
const path = require("path");
const { conTurno } = require("./turno");
const { chrome, playwright, RAIZ } = require("../guardianes/_util");
const { ARGS_CHROME } = require("../guardianes/_navegador");

async function principal() {
  const pruebas = process.argv.slice(2).length ? process.argv.slice(2) : ["pruebas/guardianes/*.test.js"];
  return conTurno("puerta", async () => {
    const pw = playwright(), exe = chrome();
    const servidor = pw && exe ? await pw.chromium.launchServer({ executablePath: exe, args: ARGS_CHROME }) : null;   // sin Chrome, las pruebas de navegador se saltan solas
    const env = Object.assign({}, process.env, { GEMELO_TURNO: "dentro" }, servidor ? { GEMELO_CHROME_WS: servidor.wsEndpoint() } : {});
    try {
      return await new Promise(ok => spawn(process.execPath, ["--test", "--test-concurrency=1"].concat(pruebas), { cwd: RAIZ, env, stdio: "inherit" }).on("exit", c => ok(c == null ? 1 : c)));
    } finally { if (servidor) await servidor.close(); }
  });
}

principal().then(c => process.exit(c), e => { console.error(e); process.exit(1); });

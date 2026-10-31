"use strict";
// `npm run puerta:pesada`: la puerta completa, con Chrome y con las e2e de Docker (GEMELO_DOCKER=1), en un turno del banco.
// Se pasa una vez por tanda de desarrollos y es la única que autoriza a subir `main` (TESTING.md «Estrategia de pruebas»).
const { spawnSync } = require("child_process");
const path = require("path");
const env = Object.assign({}, process.env, { GEMELO_DOCKER: "1" });
delete env.GEMELO_SOLO_NODE;
const r = spawnSync(process.execPath, [path.join(__dirname, "puerta.js"), ...process.argv.slice(2)], { env, stdio: "inherit" });
process.exit(r.status == null ? 1 : r.status);

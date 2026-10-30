"use strict";
// `npm run puerta:rapida`: la puerta sin Chrome ni Docker (GEMELO_SOLO_NODE=1; las partes de navegador y las e2e se saltan con su aviso).
// Se pasa tras cada fusión. NO autoriza a subir `main`: eso solo lo hace la puerta pesada (TESTING.md «Estrategia de pruebas»).
const { spawnSync } = require("child_process");
const path = require("path");
const env = Object.assign({}, process.env, { GEMELO_SOLO_NODE: "1" });
delete env.GEMELO_DOCKER;
const r = spawnSync(process.execPath, [path.join(__dirname, "puerta.js"), ...process.argv.slice(2)], { env, stdio: "inherit" });
process.exit(r.status == null ? 1 : r.status);

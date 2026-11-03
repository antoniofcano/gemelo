"use strict";
// `npm run puerta:pesada`: la puerta completa, con Chrome y con las e2e de Docker (GEMELO_DOCKER=1), en un turno del banco.
// Se pasa una vez por tanda de desarrollos y es la única que autoriza a subir `main` (TESTING.md «Estrategia de pruebas»).
const { spawnSync } = require("child_process");
const path = require("path");
// Sin el demonio de Docker las e2e que lo necesitan se saltan o caen por tiempo y la puerta engaña (pasó el 2026-11-03): se comprueba ANTES de gastar media hora.
const d = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8", shell: process.platform === "win32" });
if (d.status !== 0 && process.env.GEMELO_SIN_DOCKER !== "1") {
  console.error("puerta:pesada: el demonio de Docker no responde. Enciende Docker Desktop (y comprueba que quedan ~1,5 GB libres) y repite; GEMELO_SIN_DOCKER=1 la deja pasar sin Docker, y entonces NO vale para subir main.");
  process.exit(2);
}
const env = Object.assign({}, process.env, { GEMELO_DOCKER: "1" });
delete env.GEMELO_SOLO_NODE;
const r = spawnSync(process.execPath, [path.join(__dirname, "puerta.js"), ...process.argv.slice(2)], { env, stdio: "inherit" });
process.exit(r.status == null ? 1 : r.status);

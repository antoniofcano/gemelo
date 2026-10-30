"use strict";
// V7/V10: una sola pasada de Docker, dentro del turno del banco. Proyecto propio (prefijo gemelo-v7-), sin tocar gemelo-dev.
// Opcional: GEMELO_DOCKER=1 node pruebas/docker_v7.js. Solo crea y borra recursos gemelo-v7-* y gemelo-prueba-* (nunca prune).
// Comprueba: infra/probar-caddy.sh, que sharp funciona en la imagen alpine de la api (usuario node, solo lectura, sin capacidades) y
// que los volúmenes de medios y configuración se escriben desde la api y se leen en solo lectura (el hornero).
const { spawnSync } = require("child_process");
if (process.env.GEMELO_DOCKER !== "1") { console.log("opcional: GEMELO_DOCKER=1 para esta prueba de Docker"); process.exit(0); }
const RAIZ = process.cwd();
const { conTurno } = require(RAIZ + "/pruebas/banco/turno");
const IMG = "gemelo-v7-prueba:api", VOL_M = "gemelo-v7-medios", VOL_C = "gemelo-v7-config";
const sh = (cmd, args, o) => { const r = spawnSync(cmd, args, Object.assign({ encoding: "utf8", cwd: RAIZ, env: Object.assign({}, process.env, { MSYS_NO_PATHCONV: "1" }), maxBuffer: 64e6 }, o)); return r; };
let fallos = 0;
const muestra = (t, r) => { if (r.status !== 0) fallos++; console.log("== " + t + " (estado " + r.status + ")"); console.log(((r.stdout || "") + (r.stderr || "")).split("\n").slice(-40).join("\n")); };

conTurno("V7/V10: probar-caddy, imagen de la api con sharp y volúmenes", async () => {
  let r = sh("bash", ["infra/probar-caddy.sh"]); muestra("probar-caddy.sh", r);
  r = sh("docker", ["build", "-f", "apps/api/Dockerfile", "-t", IMG, "."]); muestra("build api (alpine)", r);
  if (r.status === 0) {
    const js = `
const sharp = require("sharp"); const fs = require("fs");
(async () => {
  console.log("sharp", sharp.versions.sharp, "vips", sharp.versions.vips, "uid", process.getuid());
  const origen = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 90, g: 140, b: 60 } } }).jpeg({ quality: 90 }).toBuffer();
  const salida = await sharp(origen).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  console.log("re-codificada:", salida.info.format, salida.info.width + "x" + salida.info.height, salida.data.length + " bytes");
  fs.writeFileSync("/datos/medios/prueba.webp", salida.data, { flag: "wx", mode: 0o640 });
  fs.writeFileSync("/datos/config/publicada.json.tmp-1", "{}\\n"); fs.renameSync("/datos/config/publicada.json.tmp-1", "/datos/config/publicada.json");
  console.log("escritura en volúmenes con sistema de ficheros de solo lectura: ok");
})().catch(e => { console.error("FALLO", e); process.exit(1); });`;
    r = sh("docker", ["run", "--rm", "--read-only", "--cap-drop", "ALL", "--tmpfs", "/tmp:size=16m", "-e", "NODE_ENV=production", "-v", VOL_M + ":/datos/medios", "-v", VOL_C + ":/datos/config", IMG, "node", "-e", js]);
    muestra("sharp + volúmenes en la imagen de producción", r);
    // el hornero (uid 1000) lee la configuración con el volumen de solo lectura: se comprueba con la misma imagen y :ro
    r = sh("docker", ["run", "--rm", "--read-only", "-v", VOL_C + ":/config:ro", IMG, "node", "-e", "console.log('hornero lee:', require('fs').readFileSync('/config/publicada.json','utf8').trim())"]);
    muestra("lectura de solo lectura", r);
  }
  sh("docker", ["volume", "rm", "-f", VOL_M, VOL_C]); sh("docker", ["rmi", "-f", IMG]);
  console.log("== limpieza hecha");
  if (fallos) { console.log("docker_v7: " + fallos + " pasos con fallo"); process.exitCode = 1; } else console.log("docker_v7: todo bien");
});

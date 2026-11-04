"use strict";
// AG-2.5: encarga al banco las capturas lado a lado del tone mapping (doc/sistema/TONE-MAPPING.md). No abre Chrome: monta la página del fixture con Vite
// y deja UN encargo en la cola del banco; lo hace la siguiente `npm run banco:ronda`. Las capturas quedan en la carpeta de resultados del banco (no se versionan).
//   node pruebas/tono_capturas.js [--finca hituelo] [--dry]
// Variantes: neutro (sin bandera, lo de siempre), agx, aces, neutral. Escenarios: lejos, cerca y paseo (tres puntos de vista del banco), con capturas.
const path = require("path"), { spawnSync } = require("child_process");
const { montaPagina } = require("./guardianes/_pagina");

const a = process.argv.slice(2), finca = a.includes("--finca") ? a[a.indexOf("--finca") + 1] : "hituelo", dry = a.includes("--dry");
const VARIANTES = ["neutro=", "agx=?tono=agx", "aces=?tono=aces", "neutral=?tono=neutral"];
const args = [];
let raiz = "<carpeta montada>";
if (!dry) raiz = montaPagina({ finca, salida: path.join(__dirname, "salida", "tono", finca) }).carpeta;
args.push(path.join(__dirname, "banco", "encarga.js"), "--raiz", raiz);
VARIANTES.forEach(v => args.push("--variante", v));
args.push("--escenarios", "lejos,cerca,paseo", "--capturas", "--de", "AG-2.5");
if (dry) { console.log("node " + args.map(x => /[ &?]/.test(x) ? JSON.stringify(x) : x).join(" ")); process.exit(0); }
const r = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(r.status || 0);

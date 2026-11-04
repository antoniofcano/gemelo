"use strict";
// AG-2.1: encarga al banco las capturas lado a lado de ?a2c=0 (alphaTest) frente a ?a2c=1 (alphaToCoverage) (doc/sistema/ALPHA-A-COBERTURA.md). No abre Chrome: monta la página del fixture con Vite
// y deja UN encargo en la cola del banco; lo hace la siguiente `npm run banco:ronda`. Las capturas quedan en la carpeta de resultados del banco (no se versionan).
//   node pruebas/a2c_capturas.js [--finca hituelo] [--dry]
// Variantes: a2c0 (?a2c=0, el alphaTest de siempre) y a2c1 (?a2c=1). Escenarios: lejos, cerca (olivar de cerca: ramitas, follaje, impostores) y paseo (a pie de suelo: la hierba), con capturas.
const path = require("path"), { spawnSync } = require("child_process");
const { montaPagina } = require("./guardianes/_pagina");

const a = process.argv.slice(2), finca = a.includes("--finca") ? a[a.indexOf("--finca") + 1] : "hituelo", dry = a.includes("--dry");
const VARIANTES = ["a2c0=?a2c=0", "a2c1=?a2c=1"];
const args = [];
let raiz = "<carpeta montada>";
if (!dry) raiz = montaPagina({ finca, salida: path.join(__dirname, "salida", "a2c", finca) }).carpeta;
args.push(path.join(__dirname, "banco", "encarga.js"), "--raiz", raiz);
VARIANTES.forEach(v => args.push("--variante", v));
args.push("--escenarios", "lejos,cerca,paseo", "--capturas", "--de", "AG-2.1");
if (dry) { console.log("node " + args.map(x => /[ &?]/.test(x) ? JSON.stringify(x) : x).join(" ")); process.exit(0); }
const r = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(r.status || 0);

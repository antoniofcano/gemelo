"use strict";
// EV-1s: encarga al banco las capturas del suelo de fotos y de la paleta del atardecer (doc/sistema/SUELO-FOTOS.md). No abre Chrome: monta la
// página del fixture con Vite (que copia apps/web/public/suelo/) y deja UN encargo en la cola del banco; lo hace la siguiente `npm run banco:ronda`.
//   node pruebas/suelo_fotos_capturas.js [--finca hituelo] [--dry]
// Variantes: base (sin bandera), fotos (?suelo=fotos, 768 px y sus 13 niveles), fotos384 (lo de móvil y gafas), y ocaso / ocasoFotos (a las 18:45, sin y con la paleta). Escenarios: cerca,
// paseo y paseoE, con capturas y desglose de llamadas. Lo que se espera: mismas llamadas y triángulos en base y fotos, 0 errores.
const path = require("path"), { spawnSync } = require("child_process");
const { montaPagina } = require("./guardianes/_pagina");

const a = process.argv.slice(2), finca = a.includes("--finca") ? a[a.indexOf("--finca") + 1] : "hituelo", dry = a.includes("--dry");
const VARIANTES = ["base=", "fotos=?suelo=fotos", "fotos384=?suelo=fotos&sueloPx=384", "ocaso=?hora=18:45", "ocasoFotos=?suelo=fotos&hora=18:45"];
const args = [];
let raiz = "<carpeta montada>";
if (!dry) raiz = montaPagina({ finca, salida: path.join(__dirname, "salida", "suelo_fotos", finca) }).carpeta;
args.push(path.join(__dirname, "banco", "encarga.js"), "--raiz", raiz);
VARIANTES.forEach(v => args.push("--variante", v));
args.push("--escenarios", "cerca,paseo,paseoE", "--capturas", "--desglose", "--de", "EV-1s");
if (dry) { console.log("node " + args.map(x => /[ &?]/.test(x) ? JSON.stringify(x) : x).join(" ")); process.exit(0); }
const r = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(r.status || 0);

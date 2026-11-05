"use strict";
// AG-2.2: encarga al banco las capturas y las medidas de dibujo de ?cartulina=rect (el rectángulo de siempre) frente a ?cartulina=silueta (el polígono que
// abraza lo opaco) (doc/sistema/CARTULINAS.md). No abre Chrome: monta la página del fixture con Vite y deja UN encargo en la cola del banco; lo hace la
// siguiente `npm run banco:ronda`. Las capturas y las medidas (triángulos y llamadas por escenario, con el desglose por objeto) quedan en la carpeta de
// resultados del banco (no se versionan).
//   node pruebas/cartulinas_capturas.js [--finca hituelo] [--dry]
// Variantes, a mediodía fijo (con la hora del reloj pueden salir de noche): rect y silueta con los olivos de siempre (?olivos=gen por defecto: ramitas,
// relleno y tarjetas de 07ab) y con ?olivos=escalera (además, los lejanos de 07ac: el sustituto en el fixture, que no trae impostores). Escenarios lejos,
// cerca (las cartulinas de cerca) y paseo. Se mira que las dos capturas de cada pareja sean iguales (mismos píxeles opacos) y cuánto suben los triángulos;
// los píxeles que se ahorran y los fps no los da SwiftShader: van con ?debug en un aparato real (no probado en Quest ni iPhone).
const path = require("path"), { spawnSync } = require("child_process");
const { montaPagina } = require("./guardianes/_pagina");

const a = process.argv.slice(2), finca = a.includes("--finca") ? a[a.indexOf("--finca") + 1] : "hituelo", dry = a.includes("--dry");
const VARIANTES = ["rect=?cartulina=rect&hora=12:00", "silueta=?cartulina=silueta&hora=12:00",
  "rectEsc=?cartulina=rect&olivos=escalera&hora=12:00", "siluetaEsc=?cartulina=silueta&olivos=escalera&hora=12:00"];
const args = [];
let raiz = "<carpeta montada>";
if (!dry) raiz = montaPagina({ finca, salida: path.join(__dirname, "salida", "cartulinas", finca) }).carpeta;
args.push(path.join(__dirname, "banco", "encarga.js"), "--raiz", raiz);
VARIANTES.forEach(v => args.push("--variante", v));
args.push("--escenarios", "lejos,cerca,paseo", "--capturas", "--desglose", "--de", "AG-2.2");
if (dry) { console.log("node " + args.map(x => /[ &?]/.test(x) ? JSON.stringify(x) : x).join(" ")); process.exit(0); }
const r = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(r.status || 0);

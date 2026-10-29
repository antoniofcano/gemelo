"use strict";
// Encargar una medida al banco en vez de lanzar un Chrome propio (TESTING.md §«Banco de pruebas»). El encargo queda en la cola común
// (<banco>/encargos/<id>.json) y lo hace la siguiente ronda (`node pruebas/banco/ronda.js`), que abre UN Chrome para todos los encargos.
//   node pruebas/banco/encarga.js --raiz <carpeta servida> [--pagina index.html] [--variante nombre=?consulta]… [--escenarios lejos,cerca]
//                                 [--capturas] [--desglose] [--de <quién>] [--tope 240] [--espera]
// --desglose: además, las llamadas de dibujo de un fotograma por objeto en cada escenario (desgloseLlamadas de _navegador.js).
// Sin --variante se mide la página tal cual («base»). Con --espera no termina hasta que la ronda deja el resultado, y lo imprime.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { BANCO } = require("./turno");

const ENCARGOS = path.join(BANCO, "encargos"), RESULTADOS = path.join(BANCO, "resultados");

function lee(argv) {
  const e = { variantes: [], capturas: false, tope_s: 240, pagina: "index.html", de: process.env.GEMELO_QUIEN || path.basename(process.cwd()) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === "--raiz") e.raiz = path.resolve(v());
    else if (a === "--pagina") e.pagina = v();
    else if (a === "--variante") { const [n, ...q] = v().split("="); e.variantes.push({ nombre: n, consulta: q.join("=") }); }
    else if (a === "--escenarios") e.escenarios = v().split(",");
    else if (a === "--capturas") e.capturas = true;
    else if (a === "--desglose") e.desglose = true;
    else if (a === "--de") e.de = v();
    else if (a === "--tope") e.tope_s = Number(v());
    else if (a === "--espera") e.espera = true;
    else throw new Error("argumento desconocido: " + a);
  }
  if (!e.raiz || !fs.existsSync(path.join(e.raiz, e.pagina))) throw new Error("--raiz debe ser la carpeta servida y contener " + e.pagina);
  if (!e.variantes.length) e.variantes.push({ nombre: "base", consulta: "" });
  return e;
}

function encarga(e) {
  fs.mkdirSync(ENCARGOS, { recursive: true });
  e.id = new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomBytes(3).toString("hex");
  e.creado = new Date().toISOString();
  const espera = e.espera; delete e.espera;
  fs.writeFileSync(path.join(ENCARGOS, e.id + ".json"), JSON.stringify(e, null, 2));
  return { id: e.id, espera };
}

async function esperaResultado(id, cadaMs = 5000) {
  const f = path.join(RESULTADOS, id, "resultado.json");
  while (!fs.existsSync(f)) await new Promise(ok => setTimeout(ok, cadaMs));
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

if (require.main === module) {
  (async () => {
    const { id, espera } = encarga(lee(process.argv.slice(2)));
    console.log("encargo " + id + " en " + ENCARGOS + (espera ? " (esperando a la ronda…)" : "; resultado en " + path.join(RESULTADOS, id)));
    if (espera) console.log(JSON.stringify(await esperaResultado(id), null, 2));
  })().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { ENCARGOS, RESULTADOS, lee, encarga, esperaResultado };

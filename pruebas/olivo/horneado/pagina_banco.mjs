// Monta una página servible del fixture de Hituelo con una carpeta olivos/ al lado (manifiesto + variantes horneadas REALES de olivo-2) para
// comparar a ojo en el banco la variante horneada (cuantizada) frente a la calculada (O7e, ADR-0018). No es el hornero (O7c): solo la prueba.
//   npm run fixture && node pruebas/olivo/horneado/pagina_banco.mjs [--salida pruebas/salida/o7e-banco]
// Ojo: el servidor estático del banco (pruebas/guardianes/_navegador.js) no manda Content-Encoding: br, así que aquí cada <huella>.br guarda los
// bytes SIN comprimir (lo que el navegador tendría tras deshacer el brotli). La huella y el manifiesto son los de siempre.
// Escribe la orden del encargo al banco: variantes calc (?olivosHorneado=0) y horn, con ?olivosPropios=0 (todo lo cercano son variantes) y ?epoca=envero.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, "..", "..", ".."), OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const i = process.argv.indexOf("--salida"), SAL = path.resolve(RAIZ, i > 0 ? process.argv[i + 1] : path.join("pruebas", "salida", "o7e-banco"));
const FX = path.join(RAIZ, "pruebas", "salida", "fixture");
if (!fs.existsSync(path.join(FX, "hituelo", "indice.json"))) { console.error("falta el fixture: npm run fixture"); process.exit(1); }
// la página: el cliente web (Vite) con el constructor empaquetado y el tileset, de montaPagina (pruebas/guardianes/_pagina.js, T8 fase 2)
const { montaPagina } = createRequire(import.meta.url)(path.join(RAIZ, "pruebas", "guardianes", "_pagina.js"));
const O = await import(pathToFileURL(path.join(OLIVO, "index.js")).href);
const { horneaObjeto } = await import(pathToFileURL(path.join(OLIVO, "horneado_node.js")).href);
const CAL = JSON.parse(fs.readFileSync(path.join(RAIZ, "contratos", "epocas-calendario.json"), "utf8")).comun;

const P = montaPagina({ finca: "hituelo", olivos: true, fixture: FX });   // de la caché de páginas: se copia, porque aquí se le añade olivos/
fs.rmSync(SAL, { recursive: true, force: true }); fs.cpSync(P.carpeta, SAL, { recursive: true });
fs.mkdirSync(path.join(SAL, "olivos"), { recursive: true });

// las variantes que hornearía el hornero hoy: centenario3, las 4 semillas de SEM_VAR, E2 y E2VR, la época de partida y la siguiente
const SEMS = [11, 23, 37, 51], NIVELES = ["E2", "E2VR"], EPOCAS = ["envero", "madura"], variantes = [];
for (const epoca of EPOCAS) for (const semilla of SEMS) {
  const e = { tipo: "centenario3", epoca, semilla }, r = O.receta(e);
  for (const nivel of NIVELES) {
    const o = await horneaObjeto(O.aNivel(r, nivel), { nivel, clave: O.claveReceta(e, nivel), gen_version: O.GEN_VERSION, cache_version: O.CACHE_VERSION }, 9);
    fs.writeFileSync(path.join(SAL, "olivos", o.huella + ".br"), o.crudo);   // sin comprimir: ver la cabecera
    variantes.push({ tipo: "centenario3", semilla, nivel, epoca, huella: o.huella, bytes: o.bytes, bytes_br: o.bytes_br });
  }
}
const m = { v: 1, finca: "hituelo", formato: O.FORMATO_HORNEADO, gen_version: O.GEN_VERSION, cache_version: O.CACHE_VERSION, horneado_en: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  brotli: 9, actual: "envero", epocas: EPOCAS.map(x => ({ epoca: x, desde: CAL[x].desde, hasta: CAL[x].hasta })), variantes, propios: { activos: false } };
fs.writeFileSync(path.join(SAL, "olivos", "manifiesto.json"), JSON.stringify(m, null, 2) + "\n");
const q = "?olivos=gen&olivosDir=olivos/&olivosPropios=0&epoca=envero";
console.log(variantes.length + " variantes horneadas en " + path.relative(RAIZ, SAL) + "/olivos/ (" + O.GEN_VERSION + ", c" + O.CACHE_VERSION + ")");
console.log("encargo: npm run banco:encarga -- --raiz " + path.relative(RAIZ, SAL).split(path.sep).join("/") + " --escenarios cerca --capturas --de O7e" +
  " --variante \"calc=" + q + "&olivosHorneado=0\" --variante \"horn=" + q + "\"");

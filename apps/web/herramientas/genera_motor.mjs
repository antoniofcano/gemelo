// Genera la entrada de Vite a partir del motor (ADR-0010, fase 0: sin tocar ni una línea de apps/web/motor/).
//   node herramientas/genera_motor.mjs --datos <indice.json> [--dest <carpeta>]      (o GEMELO_DATOS / GEMELO_WEB_RAIZ)
// Escribe en <dest> (por defecto apps/web/.generado/):
//   entrada/motor.generado.js  = `import * as THREE from "three";` + los módulos de motor/ concatenados en orden alfabético,
//                                en orden alfabético, que ES el orden de montaje (01_datos abre la IIFE y 99_cierre la cierra)
//   index.html                 = plantilla.html (con los textos de la finca, si el índice trae `textos`) + el JSON del índice (#datos) + la entrada como módulo
// Las teselas t/ se piden en tiempo de ejecución (D.base); aquí solo va el índice.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MOTOR = path.join(WEB, "motor");

function argumento(nombre) { const i = process.argv.indexOf("--" + nombre); return i > 0 ? process.argv[i + 1] : undefined; }

/** La concatenación del motor: readdirSync().sort(), el orden alfabético es el orden de montaje */
export function concatenaMotor() {
  const ficheros = fs.readdirSync(MOTOR).filter(f => f.endsWith(".js")).sort();
  return ficheros.map(f => fs.readFileSync(path.join(MOTOR, f), "utf8")).join("");
}

/** La cabecera de plantilla.html está escrita para Cerro Velasco; para otra finca se cambian sus textos (título, entradilla, nota del desfase y pie)
 *  y, si no hay historia, se oculta. T = D.textos del índice (finca, ha, fincas, parcelas, olivos, desfase_txt?, intro_historia?, sin_historia?). */
export function textosFinca(cab, T) {
  const n = T.finca, nf = T.fincas, npar = T.parcelas, nol = T.olivos;
  const fh = x => x.toFixed(0).replace(".", ",");
  cab = cab.replace("<title>Gemelo de Cerro Velasco</title>", () => "<title>Gemelo de " + n + "</title>");
  cab = cab.replace(/<h1>[\s\S]*?<\/h1>/, () => "<h1>" + n + ", en 3D</h1>");
  cab = cab.replace(/(<h1>[\s\S]*?<\/h1>\s*)<p>[\s\S]*?<\/p>/, (m, a) => a + "<p>Gemelo de las " + nf + " fincas de " + n + ", con sus " + npar + " parcelas y " + fh(T.ha) + " ha: la forma sale de los puntos del vuelo LiDAR de 2024 y el color, de la ortofoto del PNOA corregida por la altura de cada copa. Cada tesela de 256 m se carga y se dibuja con más o menos detalle según lo cerca que la mires.</p>");
  cab = cab.replace("Vista 3D de la parcela Cerro Velasco;", () => "Vista 3D de las fincas de " + n + ";");
  cab = cab.replace(/<p class="nota" style="margin-top:8px">Los puntos guardados[\s\S]*?<\/p>/, () => '<p class="nota" style="margin-top:8px">Los puntos guardados en OlivarTrack se marcaron sobre la ortofoto, que muestra las copas desplazadas hacia el este según su altura (' + (T.desfase_txt || "unos 1,5 m, medido en Cerro Velasco") + '); el LiDAR está bien georreferenciado.</p>');
  cab = cab.replace(/<p class="pie">[\s\S]*?<\/p>/, () => '<p class="pie">Gemelo de las ' + nf + " fincas de " + n + " (" + npar + " parcelas, " + fh(T.ha) + " ha, " + nol + " olivos detectados). La copa de cada olivo es medida del LiDAR; sus troncos y ramas son una forma ilustrativa con los 2 o 3 pies habituales, no una medición. Nube PNOA-LiDAR 2024 (3.ª cobertura, unos 6,5 puntos por m²), MDT de 0,5 m del CNIG y ortofoto PNOA del IGN, licencia CC-BY 4.0. La corrección de la ortofoto es un ajuste medido en Cerro Velasco, no una ortorrectificación. El tendido, los cauces y el último tramo de cada cable están deducidos de la geometría, no medidos. Es un modelo de trabajo, no una medición topográfica.</p>");
  if (T.intro_historia) cab = cab.replace(/(<p class="nota" id="hIntro">)[\s\S]*?(<\/p>)/, (m, a, b) => a + T.intro_historia + b);
  if (T.sin_historia) cab = cab.replace("</style>", () => "#historia { display: none !important; }\n</style>");
  return cab;
}

export function genera(datos, dest) {
  const D = fs.readFileSync(datos, "utf8");
  const J = JSON.parse(D);                                                     // falla aquí, y no en el navegador, si el JSON está roto
  fs.mkdirSync(path.join(dest, "entrada"), { recursive: true });
  fs.writeFileSync(path.join(dest, "entrada", "motor.generado.js"), 'import * as THREE from "three";\n' + concatenaMotor());
  let plantilla = fs.readFileSync(path.join(WEB, "plantilla.html"), "utf8");
  if (J.textos) plantilla = textosFinca(plantilla, J.textos);
  const html = '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n' +
    plantilla + '<script type="application/json" id="datos">' + D.trim() + "</script>\n" +
    '<script type="module" src="./entrada/motor.generado.js"></script>\n</body>\n</html>\n';
  fs.writeFileSync(path.join(dest, "index.html"), html);
  return dest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const datos = argumento("datos") || process.env.GEMELO_DATOS;
  const dest = path.resolve(argumento("dest") || process.env.GEMELO_WEB_RAIZ || path.join(WEB, ".generado"));
  if (!datos) { console.error("falta --datos <indice.json> (o GEMELO_DATOS)"); process.exit(2); }
  genera(path.resolve(datos), dest);
  console.log("entrada de Vite generada en", dest);
}

// Genera la raíz de Vite del cliente: la página (plantilla, textos de la finca y el índice) y la entrada que importa el arranque (ADR-0010; A3-8c).
//   node herramientas/genera_motor.mjs --datos <indice.json> [--dest <carpeta>] [--sin 35_fichas_tiempo.js,…]      (o GEMELO_DATOS / GEMELO_WEB_RAIZ / GEMELO_SIN)
// Desde A3-8c (ADR-0033) no concatena nada: el cliente arranca desde apps/web/src/arranque.ts, que Vite empaqueta directamente (alias «@gemelo/arranque»
// de vite.config.js). El nombre del fichero se queda: lo llaman package.json, el banco, infra/dev y la documentación.
// --sin: pasos del arranque que se dejan fuera (ADR-0023: un componente se puede quitar del cliente sin tocar a nadie; lo comprueba
// pruebas/guardianes/componentes.test.js). Se escriben en entrada/sin.json y los quita el plugin «gemelo-sin-pasos» de vite.config.js. Solo componentes:
// quitar un paso del núcleo o de los de siempre rompe el arranque.
// Escribe en <dest> (por defecto apps/web/.generado/):
//   entrada/motor.generado.js  = `import "./plantilla.css";` + `import "@gemelo/arranque";` (ENTRADA)
//   entrada/plantilla.css      = la hoja de estilos (V12: del mismo origen; las tipografías @fontsource entran por su @import)
//   entrada/sin.json           = solo con --sin: los pasos que se quitan
//   index.html                 = plantilla.html (con los textos de la finca, si el índice trae `textos`) + el JSON del índice (#datos) + la entrada como módulo
// Las teselas t/ se piden en tiempo de ejecución (D.base); aquí solo va el índice.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { quitaPasos, leeArranque, nombrePaso } from "./pasos.mjs";

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** La entrada que se escribe: la hoja de estilos y el arranque (apps/web/src/arranque.ts), que crea los objetos en orden y cablea el bucle */
export const ENTRADA = 'import "./plantilla.css";\nimport "@gemelo/arranque";\n';

/** Escapa un texto para contenido HTML (L9-04): el nombre de la finca y los textos del índice no pueden cerrar etiquetas ni meter marcado */
export function escapaHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

/** El JSON del índice listo para dentro de <script type="application/json"> (L9-04). En JSON válido, <, >, & y U+2028/U+2029 solo aparecen
 *  dentro de cadenas, así que escaparlos como \u00XX es JSON válido y da el mismo valor al leerlo. Así ni «</script» ni «<!--» cierran el bloque. */
export function escapaJsonEnScript(txt) { return txt.replace(/[<>&\u2028\u2029]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")); }

function argumento(nombre) { const i = process.argv.indexOf("--" + nombre); return i > 0 ? process.argv[i + 1] : undefined; }

/** La cabecera de plantilla.html no lleva ninguna cifra de la finca (ni hectáreas ni olivos: L3-04): título, entradilla, pie y nota del desfase salen del índice.
 *  T = D.textos del índice (finca, ha, fincas, parcelas, olivos, desfase_txt?, puntos_m2?, intro_historia?, sin_historia?). Rotulado (decisiones 220 y 221):
 *  las hectáreas son «declaradas (OlivarTrack)» (suma de lo declarado, no medida sobre el polígono) y los olivos «detectados» (LiDAR + regla), no «medidos».
 *  Si el índice no trae `textos`, la página queda con la cabecera neutra de la plantilla. */
export function textosFinca(cab, T) {
  const n = escapaHtml(T.finca), nf = T.fincas || 1, npar = T.parcelas, nol = T.olivos;   // L9-04: el nombre llega del índice, va escapado al HTML
  const fh = x => (x < 10 ? x.toFixed(1) : x.toFixed(0)).replace(".", ",");
  const dec = fh(T.ha) + " ha declaradas (OlivarTrack)";
  const que = nf === 1 ? "la finca " + n : "las " + nf + " fincas de " + n;
  const pts = T.puntos_m2 ? ", unos " + String(T.puntos_m2).replace(".", ",") + " puntos por m²" : "";
  cab = cab.replace("<title>Gemelo de la finca</title>", () => "<title>Gemelo de " + n + "</title>");
  cab = cab.replace(/<h1>[\s\S]*?<\/h1>/, () => "<h1>" + n + ", en 3D</h1>");
  cab = cab.replace(/(<h1>[\s\S]*?<\/h1>\s*)<p>[\s\S]*?<\/p>/, (m, a) => a + "<p>Gemelo de " + que + ", con sus " + npar + " parcelas y " + dec + ": la forma sale de los puntos del vuelo LiDAR de 2024 y el color, de la ortofoto del PNOA corregida por la altura de cada copa. Cada tesela de 256 m se carga y se dibuja con más o menos detalle según lo cerca que la mires.</p>");
  cab = cab.replace("Vista 3D de la finca;", () => "Vista 3D de " + (nf === 1 ? "la finca " : "las fincas de ") + n + ";");
  cab = cab.replace(/<p class="nota sep8" id="notaDesfase">Los puntos guardados[\s\S]*?<\/p>/, () => '<p class="nota sep8" id="notaDesfase">Los puntos guardados en OlivarTrack se marcaron sobre la ortofoto, que muestra las copas desplazadas hacia el este según su altura' + (T.desfase_txt ? " (" + escapaHtml(T.desfase_txt) + ")" : "") + '; el LiDAR está bien georreferenciado.</p>');
  cab = cab.replace(/<p class="pie">[\s\S]*?<\/p>/, () => '<p class="pie">Gemelo de ' + que + " (" + npar + " parcelas, " + dec + ", " + nol + " olivos detectados: LiDAR más una regla, no medidos). La copa de cada olivo es medida del LiDAR; sus troncos y ramas son una forma ilustrativa con los 2 o 3 pies habituales, no una medición. Nube PNOA-LiDAR 2024 (3.ª cobertura" + pts + "), MDT de 0,5 m del CNIG y ortofoto PNOA del IGN, licencia CC-BY 4.0. La corrección de la ortofoto es un ajuste empírico (la copa se ve corrida hacia el este según su altura) que se midió en otra finca y aquí se aplica sin recalibrar, no una ortorrectificación. El tendido, los cauces y el último tramo de cada cable están deducidos de la geometría, no medidos. Es un modelo de trabajo, no una medición topográfica.</p>");
  if (T.intro_historia) cab = cab.replace(/(<p class="nota" id="hIntro">)[\s\S]*?(<\/p>)/, (m, a, b) => a + escapaHtml(T.intro_historia) + b);
  if (T.sin_historia) cab = cab.replace('id="historia"', () => 'id="historia" data-sin');   // plantilla.css: #historia[data-sin] { display: none !important }
  return cab;
}

export function genera(datos, dest, sin = []) {
  const D = fs.readFileSync(datos, "utf8");
  const J = JSON.parse(D);                                                     // falla aquí, y no en el navegador, si el JSON está roto
  fs.mkdirSync(path.join(dest, "entrada"), { recursive: true });
  // V12: los estilos van en un .css del mismo origen (la CSP no deja <style> ni style="…" en línea) y las tipografías @fontsource entran por su @import
  fs.copyFileSync(path.join(WEB, "plantilla.css"), path.join(dest, "entrada", "plantilla.css"));
  // --sin no concatena: deja en entrada/sin.json los pasos que el plugin «gemelo-sin-pasos» de vite.config.js quita del arranque
  const sinJson = path.join(dest, "entrada", "sin.json");
  fs.rmSync(sinJson, { force: true });
  if (sin.length) { quitaPasos(leeArranque(), sin); fs.writeFileSync(sinJson, JSON.stringify(sin.map(nombrePaso)) + "\n"); }   // falla aquí si alguno no es un paso
  fs.writeFileSync(path.join(dest, "entrada", "motor.generado.js"), ENTRADA);
  let plantilla = fs.readFileSync(path.join(WEB, "plantilla.html"), "utf8");
  if (J.textos) plantilla = textosFinca(plantilla, J.textos);
  const html = '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n' +
    plantilla + '<script type="application/json" id="datos">' + escapaJsonEnScript(D.trim()) + "</script>\n" +
    '<script type="module" src="./entrada/motor.generado.js"></script>\n</body>\n</html>\n';
  fs.writeFileSync(path.join(dest, "index.html"), html);
  return dest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const datos = argumento("datos") || process.env.GEMELO_DATOS;
  const dest = path.resolve(argumento("dest") || process.env.GEMELO_WEB_RAIZ || path.join(WEB, ".generado"));
  if (!datos) { console.error("falta --datos <indice.json> (o GEMELO_DATOS)"); process.exit(2); }
  const sin = (argumento("sin") || process.env.GEMELO_SIN || "").split(",").map(x => x.trim()).filter(Boolean);
  genera(path.resolve(datos), dest, sin);
  if (sin.length) console.log("sin:", sin.join(", "));
  console.log("entrada de Vite generada en", dest);
}

// Genera la entrada de Vite a partir del motor (ADR-0010, fase 0: sin tocar ni una línea de apps/web/motor/).
//   node herramientas/genera_motor.mjs --datos <indice.json|embebido.json> [--dest <carpeta>]      (o GEMELO_DATOS / GEMELO_WEB_RAIZ)
// Escribe en <dest> (por defecto apps/web/.generado/):
//   entrada/motor.generado.js  = `import * as THREE from "three";` + los módulos de motor/ concatenados en orden alfabético,
//                                exactamente como los concatena tuberia/salida_artefacto/montar_v2.py (01_datos abre la IIFE y 99_cierre la cierra)
//   index.html                 = plantilla.html + el JSON de datos (#datos) + la entrada como módulo
// Los datos aún van dentro de la página, como en la salida artefacto; pasan a pedirse a /teselas en la fase 1a.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MOTOR = path.join(WEB, "motor");

function argumento(nombre) { const i = process.argv.indexOf("--" + nombre); return i > 0 ? process.argv[i + 1] : undefined; }

/** La concatenación del motor, igual que montar_v2.py: sorted(glob("*.js")) en orden de código */
export function concatenaMotor() {
  const ficheros = fs.readdirSync(MOTOR).filter(f => f.endsWith(".js")).sort();
  return ficheros.map(f => fs.readFileSync(path.join(MOTOR, f), "utf8")).join("");
}

export function genera(datos, dest) {
  const D = fs.readFileSync(datos, "utf8");
  JSON.parse(D);                                                               // falla aquí, y no en el navegador, si el JSON está roto
  fs.mkdirSync(path.join(dest, "entrada"), { recursive: true });
  fs.writeFileSync(path.join(dest, "entrada", "motor.generado.js"), 'import * as THREE from "three";\n' + concatenaMotor());
  const plantilla = fs.readFileSync(path.join(WEB, "plantilla.html"), "utf8");
  const html = '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n' +
    plantilla + '<script type="application/json" id="datos">' + D.trim() + "</script>\n" +
    '<script type="module" src="./entrada/motor.generado.js"></script>\n</body>\n</html>\n';
  fs.writeFileSync(path.join(dest, "index.html"), html);
  return dest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const datos = argumento("datos") || process.env.GEMELO_DATOS;
  const dest = path.resolve(argumento("dest") || process.env.GEMELO_WEB_RAIZ || path.join(WEB, ".generado"));
  if (!datos) { console.error("falta --datos <indice.json|embebido.json> (o GEMELO_DATOS)"); process.exit(2); }
  genera(path.resolve(datos), dest);
  console.log("entrada de Vite generada en", dest);
}

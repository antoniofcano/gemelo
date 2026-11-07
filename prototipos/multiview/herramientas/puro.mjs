// Reusa, sin copiarlos, los trozos puros del motor (regla 12): `import X from "gemelo-puro:<módulo>/<Nombre>"` da el bloque entre
// «// [puro:inicio]» y «// [puro:fin]» del .ts de apps/web/src/ donde vive (TS_DE) con `export default <Nombre>`. Son los mismos trozos que los guardianes
// evalúan en Node (p. ej. pruebas/guardianes/mide.test.js): sin THREE ni DOM. La página de humo usa MideEst (30_mide: mediana, p95, peor) y
// (RenderPuro ya no: desde A1-11 vive en apps/web/src/nucleo/render.ts y medida.js lo importa de allí), así sus cifras se cuentan igual que las del gemelo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PREFIJO = "gemelo-puro:";
// A3-8c: apps/web/motor/ ya no existe. Cada trozo puro vive en su .ts de apps/web/src/; el nombre es el del paso del arranque
// (apps/web/src/arranque.ts, «// [paso: 30_mide]»), para no cambiar las importaciones de la página de humo.
const TS_DE = { "30_mide": "apps/web/src/ui/mide.ts" };

export function trozoPuro(modulo, nombre) {
  if (!/^[0-9a-z_]+$/.test(modulo) || !/^[A-Za-z]+$/.test(nombre)) throw new Error("gemelo-puro: nombre raro " + modulo + "/" + nombre);
  if (!TS_DE[modulo]) throw new Error("gemelo-puro: no sé en qué .ts vive el trozo puro de " + modulo + " (añádelo a TS_DE)");
  // sin los tipos (stripTypeScriptTypes de Node) y sin el «export» de delante
  const s = stripTypeScriptTypes(fs.readFileSync(path.join(RAIZ, TS_DE[modulo]), "utf8")).replace(/^export (?=var )/gm, "");
  const i = s.indexOf("// [puro:inicio]"), f = s.indexOf("// [puro:fin]");
  if (i < 0 || f < i) throw new Error(TS_DE[modulo] + " no marca su trozo puro");
  const trozo = s.slice(i, f);
  if (!new RegExp("\\bvar " + nombre + "\\b").test(trozo)) throw new Error("el trozo puro de " + modulo + " no declara " + nombre);
  return "\"use strict\";\n" + trozo + "\nexport default " + nombre + ";\n";
}

export function puroDelMotor() {
  return {
    name: "gemelo-puro",
    resolveId(id) { return id.startsWith(PREFIJO) ? "\0" + id : null; },
    load(id) {
      if (!id.startsWith("\0" + PREFIJO)) return null;
      const [modulo, nombre] = id.slice(PREFIJO.length + 1).split("/");
      return trozoPuro(modulo, nombre);
    },
  };
}

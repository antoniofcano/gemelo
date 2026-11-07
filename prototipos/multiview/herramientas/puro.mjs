// Reusa, sin copiarlos, los trozos puros del motor (regla 12): `import X from "gemelo-puro:<módulo>/<Nombre>"` da el bloque entre
// «// [puro:inicio]» y «// [puro:fin]» de apps/web/motor/<módulo>.js con `export default <Nombre>`. Son los mismos trozos que los guardianes
// evalúan en Node (p. ej. pruebas/guardianes/mide.test.js): sin THREE ni DOM. La página de humo usa MideEst (30_mide: mediana, p95, peor) y
// (RenderPuro ya no: desde A1-11 vive en apps/web/src/nucleo/render.ts y medida.js lo importa de allí), así sus cifras se cuentan igual que las del gemelo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const MOTOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "web", "motor");
const PREFIJO = "gemelo-puro:";

export function trozoPuro(modulo, nombre) {
  if (!/^[0-9a-z_]+$/.test(modulo) || !/^[A-Za-z]+$/.test(nombre)) throw new Error("gemelo-puro: nombre raro " + modulo + "/" + nombre);
  let s = fs.readFileSync(path.join(MOTOR, modulo + ".js"), "utf8");
  // MU5-n: un módulo migrado queda en motor/ como talón («// [talón] apps/web/src/….ts») y su trozo puro vive en ese .ts; se lee sin los tipos
  // (stripTypeScriptTypes de Node) y sin el «export» de delante (30_mide → apps/web/src/ui/mide.ts, A3-7a)
  const talon = /^\s*\/\/ \[talón\] (apps\/web\/src\/\S+\.ts)\s*$/m.exec(s);
  if (talon) s = stripTypeScriptTypes(fs.readFileSync(path.join(MOTOR, "..", "..", "..", talon[1]), "utf8")).replace(/^export (?=var )/gm, "");
  const i = s.indexOf("// [puro:inicio]"), f = s.indexOf("// [puro:fin]");
  if (i < 0 || f < i) throw new Error("apps/web/motor/" + modulo + ".js no marca su trozo puro");
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

// Reusa, sin copiarlos, los trozos puros del motor (regla 12): `import X from "gemelo-puro:<módulo>/<Nombre>"` da el bloque entre
// «// [puro:inicio]» y «// [puro:fin]» de apps/web/motor/<módulo>.js con `export default <Nombre>`. Son los mismos trozos que los guardianes
// evalúan en Node (p. ej. pruebas/guardianes/mide.test.js): sin THREE ni DOM. La página de humo usa MideEst (30_mide: mediana, p95, peor) y
// RenderPuro (02h_render: la lectura de renderer.info con la misma forma para el clásico y el nuevo), así sus cifras se cuentan igual que las del gemelo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MOTOR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "web", "motor");
const PREFIJO = "gemelo-puro:";

export function trozoPuro(modulo, nombre) {
  if (!/^[0-9a-z_]+$/.test(modulo) || !/^[A-Za-z]+$/.test(nombre)) throw new Error("gemelo-puro: nombre raro " + modulo + "/" + nombre);
  const s = fs.readFileSync(path.join(MOTOR, modulo + ".js"), "utf8");
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

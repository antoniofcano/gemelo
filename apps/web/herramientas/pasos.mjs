// Los pasos de la entrada del cliente (apps/web/src/arranque.ts, A3-8c). El arranque crea los objetos en orden, y cada trozo lleva su marca
// `  // [paso: NN_nombre]` (el nombre del fichero de motor/ del que viene). Aquí se leen esos trozos por su nombre y se quitan los que se pidan:
//   - quitaPasos: `genera_motor.mjs --sin <paso>` (ADR-0023: un componente se puede quitar del cliente sin tocar a nadie); lo aplica el plugin
//     «gemelo-sin-pasos» de vite.config.js al construir, y lo vigila pruebas/guardianes/componentes.test.js;
//   - partePasos: los guardianes (pruebas/guardianes/_fuente.js) leen un paso con su nombre.
// Solo texto: no evalúa ni compila nada.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const ARRANQUE = path.join(WEB, "src", "arranque.ts");
/** la marca de un paso: dos espacios de sangría (el cuerpo de arranca()) y su nombre */
export const MARCA_PASO = /^ {2}\/\/ \[paso: ([0-9][0-9a-z_]*)\]/gm;

/** El nombre de un paso, con o sin el «.js» del fichero de motor/ del que viene («12_paseo.js» → «12_paseo») */
export const nombrePaso = n => String(n).replace(/\.js$/, "");

/** Los pasos del texto del arranque, en orden: [{ nombre, inicio, fin }] (fin: donde empieza el siguiente o la llave que cierra arranca()) */
export function partePasos(texto) {
  const marcas = [...texto.matchAll(MARCA_PASO)];
  if (!marcas.length) throw new Error("el arranque no tiene pasos (// [paso: NN_nombre])");
  const ultima = marcas[marcas.length - 1].index, cierre = texto.indexOf("\n}\n", ultima);
  if (cierre < 0) throw new Error("no encuentro la llave que cierra arranca() tras el último paso");
  const vistos = new Set();
  return marcas.map((m, i) => {
    if (vistos.has(m[1])) throw new Error("paso repetido: " + m[1]);
    vistos.add(m[1]);
    return { nombre: m[1], inicio: m.index, fin: i + 1 < marcas.length ? marcas[i + 1].index : cierre + 1 };
  });
}

/** El texto sin los pasos pedidos (sin = nombres, con o sin «.js»). Falla con los que no son pasos */
export function quitaPasos(texto, sin = []) {
  const P = partePasos(texto), pedidos = sin.map(nombrePaso), raros = pedidos.filter(n => !P.some(p => p.nombre === n));
  if (raros.length) throw new Error("--sin: no son pasos del arranque: " + raros.join(", "));
  let s = texto;
  for (const p of P.slice().reverse()) if (pedidos.includes(p.nombre)) s = s.slice(0, p.inicio) + s.slice(p.fin);
  return s;
}

/** El texto de apps/web/src/arranque.ts */
export const leeArranque = () => fs.readFileSync(ARRANQUE, "utf8");

// El contexto vm de los olivos generados en Node (apps/web/motor/07ab_generados.js sin navegador ni GPU), compartido por generados_motor.mjs y
// lote_tramos.mjs: three 0.186.1, el constructor de olivos real (apps/web/olivo/), el Aparato real (01a) y el parcheTiempo y colorVertSRGB REALES
// (sacados de 15_tiempo.js y 03_escena.js).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const MOTOR = path.join(RAIZ, "apps", "web", "motor");
export const THREE = await import(pathToFileURL(path.join(OLIVO, "node_modules", "three-r186", "build", "three.module.js")).href);
export const O = await import(pathToFileURL(path.join(OLIVO, "index.js")).href);
export const lee = f => fs.readFileSync(path.join(MOTOR, f), "utf8");

// un trozo de código fuente desde `inicio`: hasta la llave que cierra (función) o el «;» de primer nivel (var), saltando cadenas y comentarios
export function extrae(src, inicio) {
  const a = src.indexOf(inicio); if (a < 0) throw new Error("no está: " + inicio);
  const fn = inicio.startsWith("function"); let d = 0, i = a, visto = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") { const q = c; for (i++; i < src.length && src[i] !== q; i++) if (src[i] === "\\") i++; continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if ("([{".includes(c)) { d++; if (c === "{") visto = true; }
    else if (")]}".includes(c)) { d--; if (fn && visto && d === 0) return src.slice(a, i + 1); }
    else if (!fn && c === ";" && d === 0) return src.slice(a, i + 1);
  }
  throw new Error("sin cierre: " + inicio);
}
const T15 = lee("15_tiempo.js"), T03 = lee("03_escena.js");
const piezas = [extrae(T03, "var GLSL_LIN"), extrae(T03, "function colorVertSRGB"), extrae(T15, "var uViento"), extrae(T15, "var uSombra"),
  extrae(T15, "var GLSL_SOMBRA"), extrae(T15, "function parcheTiempo")].join("\n");
const A01 = lee("01a_aparato.js"), G07 = lee("07ab_generados.js");   // 01a: el Aparato real (AG-0.3), que 07ab consulta

// extra: lo que se añade o sustituye en el contexto (D.base, fetch, console, window.OlivoGen, THREE…)
export function contexto(busqueda, reloj, extra) {
  const cola = [];
  const ctx = Object.assign({
    THREE, console, performance: reloj || performance, Promise, Math, Object, Number, String, Error, Float32Array, Uint8Array,   // los del módulo del olivo (instanceof entre contextos vm)
    location: { search: busqueda }, window: { OlivoGen: O },
    gArboles: new THREE.Group(), D: { copas: [], centro_utm: [0, 0] }, VRP: { on: false }, FACTOR_R8: 0.5, FACTOR_R8_GEN: 1, exag: 1,
    // la configuración del servidor (02c Config) sin servidor: todo vale lo del código
    Config: { listo: Promise.resolve(null), al: f => f(null), param: (r, c, u) => (u !== undefined && u !== null ? u : c), umbrales: (c, u) => u || c, tablaEpocas: () => null, epocaDeFecha: () => null }, factorCopaDeConfig: () => 1,
    suelo: () => 0, camera: { position: new THREE.Vector3(0, 10, 0) },
    Cola: { add: () => { throw new Error("los generados no deben usar la Cola compartida"); }, hay: () => false }, cola
  }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(piezas + "\n" + A01 + "\n" + G07 + "\n;this.__G = Generados; this.__uSombra = uSombra;", ctx, { filename: "07ab_generados.js" });
  return ctx;
}
export const espera = () => new Promise(r => setTimeout(r, 0));

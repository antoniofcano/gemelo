// El cargador que elige build (ADR-0031, F2c; doc/sistema/MULTIVIEW.md «Dos builds»). La página de la finca no carga un bundle fijo: un script
// CLÁSICO y externo (assets/cargador-<huella>.js, 'self': la CSP no cambia, sin scripts en línea) decide ANTES de cargar three cuál de las dos builds
// inyecta, porque dos three no pueden convivir en una página. Reglas:
//   · la decisión es eligeBuild() de builds.mjs (la misma función, copiada tal cual al cargador) con la clase de AparatoPuro.clasifica
//     (el trozo [puro] de motor/01a_aparato.js, también copiado tal cual: UNA sola detección del aparato);
//   · el manifiesto va DENTRO del cargador (sin petición extra ni carrera) y también suelto en builds.json, para herramientas y para leer de vuelta;
//   · si la build de VR no carga (404, red, error en un import estático de su entrada), se cae a la de pantalla; un fallo DESPUÉS de empezar a
//     ejecutarse no se puede deshacer (three ya está en la página): eso lo cubre la prueba en el Quest, no el cargador.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { eligeBuild } from "./builds.mjs";

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** El trozo puro de 01a_aparato.js (entre «[puro:inicio]» y «[puro:fin]»): la clasificación del aparato, sin tocar el motor */
export function fuenteAparatoPuro(web = WEB) {
  const t = fs.readFileSync(path.join(web, "motor", "01a_aparato.js"), "utf8");
  const a = t.indexOf("// [puro:inicio]"), b = t.indexOf("// [puro:fin]");
  if (a < 0 || b < a) throw new Error("01a_aparato.js ya no tiene el trozo [puro:inicio]…[puro:fin] que copia el cargador");
  return t.slice(t.indexOf("\n", a) + 1, b);
}

/** Lo que Vite escribe en la página de una build: la entrada (script module), las precargas (modulepreload) y las hojas de estilo; y las etiquetas tal cual */
export function leeIndiceVite(html) {
  const attr = (tag, n) => { const m = new RegExp("\\s" + n + '="([^"]*)"').exec(tag); return m ? m[1] : null; };
  const rel = u => u.replace(/^\.\//, "");
  const entradas = [], precarga = [], css = [], etiquetas = [];
  for (const m of html.matchAll(/<script\b[^>]*\btype="module"[^>]*>\s*<\/script>/g)) { const s = attr(m[0], "src"); if (s) { entradas.push(rel(s)); etiquetas.push(m[0]); } }
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    const r = attr(m[0], "rel"), h = attr(m[0], "href");
    if (r === "modulepreload" && h) { precarga.push(rel(h)); etiquetas.push(m[0]); }
    else if (r === "stylesheet" && h && !/^(https?:)?\/\//.test(h)) { css.push(rel(h)); etiquetas.push(m[0]); }
  }
  if (entradas.length !== 1) throw new Error("se esperaba UNA entrada <script type=\"module\"> y hay " + entradas.length);
  return { entrada: entradas[0], precarga, css, etiquetas };
}

/** El manifiesto (builds.json): qué builds hay y sus ficheros (rutas desde la página), con la huella del contenido de la entrada */
export function manifiesto(builds) {
  const m = { version: 1, predeterminada: "pantalla", builds: {} };
  for (const [nombre, b] of Object.entries(builds)) m.builds[nombre] = { entrada: b.entrada, huella: b.huella, css: b.css, precarga: b.precarga };
  return m;
}

/** El código del cargador (un script clásico). Se genera, no se escribe a mano: elige con las mismas funciones que prueba el repo */
export function generaCargador(man, web = WEB) {
  const elige = eligeBuild.toString().replace(/\n/g, "\n  ");
  return `// Cargador de la finca (ADR-0031 F2c; lo genera apps/web/herramientas/cargador.mjs: no se edita a mano).
(function () {
  "use strict";
  var MANIFIESTO = ${JSON.stringify(man)};
${fuenteAparatoPuro(web)}
  ${elige}
  function crea(tag, nombre, atributos) {
    var e = document.createElement(tag);
    Object.keys(atributos).forEach(function (k) { e.setAttribute(k, atributos[k]); });
    e.setAttribute("data-build", nombre);
    return e;
  }
  function carga(nombre, alFallar) {
    var b = MANIFIESTO.builds[nombre], cab = document.head || document.documentElement;
    b.css.forEach(function (h) { cab.appendChild(crea("link", nombre, { rel: "stylesheet", href: "./" + h })); });
    b.precarga.forEach(function (h) { cab.appendChild(crea("link", nombre, { rel: "modulepreload", href: "./" + h })); });
    var s = crea("script", nombre, { type: "module", src: "./" + b.entrada });
    if (alFallar) s.addEventListener("error", alFallar);
    document.body.appendChild(s);
  }
  var nv = typeof navigator !== "undefined" && navigator ? navigator : {};
  var clase = AparatoPuro.clasifica(nv.userAgent, nv.maxTouchPoints, nv.deviceMemory).clase;
  var hayVR = !!MANIFIESTO.builds.vr;
  var pedida = eligeBuild(clase, location.search, hayVR), estado = { build: pedida, clase: clase, hayVR: hayVR, cayo: false };
  window.__gemeloCargador = estado;   // para ?debug y las pruebas: qué se eligió y si hubo que caer a pantalla
  if (pedida !== "pantalla") {
    carga(pedida, function () {
      // la build de VR no cargó (no está en el servidor o falló al pedirla): se quita lo suyo y se carga la de pantalla
      estado.cayo = true; estado.build = "pantalla";
      try { console.warn("[gemelo] la build " + pedida + " no cargó; se usa la de pantalla"); } catch (e) { /* sin consola */ }
      Array.prototype.slice.call(document.querySelectorAll('[data-build="' + pedida + '"]')).forEach(function (l) { l.remove(); });
      carga("pantalla");
    });
  } else carga("pantalla");
})();
`;
}

export function huella(buf) { return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12); }

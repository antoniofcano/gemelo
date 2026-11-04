"use strict";
// Cuenta las reservas por fotograma (AG-1.4: cero reservas en lo que corre cada fotograma) de las funciones del bucle que se listan en BUCLE
// (las comprueba pruebas/guardianes/sin_reservas.test.js). Es un análisis léxico sencillo, a propósito: busca lo que SIEMPRE reserva memoria en
// JavaScript (`new X`, un cierre, un literal de objeto o de array, `.map/.filter/.slice…`, concatenar cadenas) dentro del cuerpo de una función
// con nombre. No sabe de tipos ni de flujo: por eso solo se aplica a funciones que se eligen una a una y que corren a cada fotograma. Una línea con
// el comentario «reserva-ok: motivo» queda fuera (para lo que ocurre por un suceso raro, no por fotograma).
// `node pruebas/guardianes/_reservas.js [-v]` imprime el recuento por fichero (para medir antes y después, regla 7).
const fs = require("fs"), path = require("path");
const RAIZ = path.resolve(__dirname, "..", "..");

const PATRONES = [
  ["new", /\bnew\s+[A-Z]/],
  ["cierre", /\bfunction\b|=>/],
  ["método que reserva", /\.(map|filter|slice|concat|splice|sort|reduce|forEach|some|every|find|findIndex|join|toFixed|toString|clone|toNonIndexed)\s*\(/],
  ["Object/JSON/Array.from/String()", /\b(Object\.(keys|values|entries|assign|create)|JSON\.|Array\.from|String\()/],
  ["literal de array", /(^|[=(,:?&|;{}]|\breturn)\s*\[/],
  ["literal de objeto", /([=(,:?]|\breturn)\s*\{/],
  ["cadena concatenada", /""\s*\+|\+\s*""|`/]
];

/** Del texto de un fichero: el cuerpo (entre llaves) de la función que empieza en `inicio`, o null. */
function cuerpo(src, inicio) {
  const i = src.indexOf(inicio); if (i < 0) return null;
  let p = src.indexOf("(", i), prof = 0;
  for (; p < src.length; p++) { if (src[p] === "(") prof++; else if (src[p] === ")" && --prof === 0) break; }
  const a = src.indexOf("{", p); if (a < 0) return null;
  let d = 0, s = null, k = a;
  for (; k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (s === "//") { if (c === "\n") s = null; continue; }
    if (s === "/*") { if (c === "*" && n === "/") { s = null; k++; } continue; }
    if (s) { if (c === "\\") k++; else if (c === s) s = null; continue; }
    if (c === "/" && (n === "/" || n === "*")) { s = c + n; k++; continue; }
    if (c === '"' || c === "'" || c === "`") { s = c; continue; }
    if (c === "{") d++; else if (c === "}" && --d === 0) break;
  }
  return src.slice(a + 1, k);
}

/** Las líneas del cuerpo sin comentarios y con el contenido de las cadenas vacío ("x" pasa a ""), con su número relativo. */
function lineas(cu) {
  const res = []; let s = null, act = "", n = 0;
  const cierra = () => { res.push({ n: n, txt: act }); act = ""; n++; };
  for (let k = 0; k < cu.length; k++) {
    const c = cu[k], nx = cu[k + 1];
    if (c === "\n") { if (s === "//") s = null; cierra(); continue; }
    if (s === "//") continue;
    if (s === "/*") { if (c === "*" && nx === "/") { s = null; k++; } continue; }
    if (s) { if (c === "\\") { k++; continue; } if (c === s) { s = null; act += '"'; } continue; }
    if (c === "/" && (nx === "/" || nx === "*")) { s = c + nx; k++; continue; }
    if (c === '"' || c === "'") { s = c; act += '"'; continue; }
    if (c === "`") { act += "`"; continue; }
    act += c;
  }
  cierra(); return res;
}

/** Reservas de una función: [{ fn, linea, que, txt }], o null si no se encuentra. Una línea con «reserva-ok» no cuenta. */
function reservas(src, fn, inicio) {
  const cu = cuerpo(src, inicio); if (cu === null) return null;
  const crudas = cu.split("\n"), out = [];
  lineas(cu).forEach(l => {
    if (/reserva-ok/.test(crudas[l.n] || "")) return;
    PATRONES.forEach(([que, re]) => { if (re.test(l.txt)) out.push({ fn: fn, linea: l.n, que: que, txt: (crudas[l.n] || "").trim().slice(0, 110) }); });
  });
  return out;
}

/** Las funciones del bucle, por módulo. «inicio» localiza la función (debe ser único en el fichero). Solo lo que corre a cada fotograma. */
const BUCLE = {
  "25_perros.js": [["amenazaEn", "function amenazaEn("], ["actualizaPerros", "function actualizaPerros("]],
  "02c_componentes.js": [["Bus.emite", "function emite(ev, datos)"]],
  "18_paisaje.js": [["distArroyo", "function distArroyo("], ["celdaArroyoDist", "function celdaArroyoDist("]],
  "16_vida.js": [["velPaseo", "function velPaseo("], ["giroPaseo", "function giroPaseo("], ["vidaPaseo", "function vidaPaseo("], ["dronMando", "function dronMando("],
    ["camaraDron", "function camaraDron("], ["vidaDron", "function vidaDron("], ["actualizaVida", "function actualizaVida("], ["emiteEstela", "e.emite = function"], ["angDifRad", "function angDifRad("]],
  "15_tiempo.js": [["posSolEn", "function posSolEn("], ["nivelEn", "function nivelEn("], ["pintaNubes", "function pintaNubes("], ["actualizaTiempo", "function actualizaTiempo("]],   // `nivel(ms)` sí reserva su resultado (es la de siempre, para lo que no corre por fotograma): no está en la lista
  "16b_fauna.js": [["aleteo", "function aleteo("], ["empacaAves", "function empacaAves("], ["escalaVista", "function escalaVista("], ["actualizaFauna", "function actualizaFauna("],
    ["mayorQue", "function mayorQue("], ["menorQue", "function menorQue("], ["reconstruyeCerca", "function reconstruyeCerca("]],
  "38_presencia_compartida.js": [["oyente", "function oyente("], ["anda", "function anda("], ["emite", "function emite(a, dt"], ["entrega", "function entrega("], ["caja", "function caja("], ["apoyo", "function apoyo("],
    ["coloca", "function coloca("], ["manoLocal", "function manoLocal("], ["poseLocal", "function poseLocal("], ["actualizaRed", "function actualizaRed("], ["actualiza", "function actualiza(dt)"]]
};

function recuenta() {
  const tot = {};
  for (const f of Object.keys(BUCLE)) {
    const src = fs.readFileSync(path.join(RAIZ, "apps", "web", "motor", f), "utf8"); tot[f] = { total: 0, porFn: {}, detalle: [], faltan: [] };
    for (const [fn, ini] of BUCLE[f]) {
      const r = reservas(src, fn, ini); if (r === null) { tot[f].faltan.push(fn); continue; }
      tot[f].porFn[fn] = r.length; tot[f].total += r.length; tot[f].detalle.push(...r);
    }
  }
  return tot;
}

module.exports = { cuerpo, lineas, reservas, recuenta, BUCLE, PATRONES };
if (require.main === module) {
  const t = recuenta();
  for (const f of Object.keys(t)) {
    console.log(f + ": " + t[f].total + " " + JSON.stringify(t[f].porFn) + (t[f].faltan.length ? " FALTAN " + t[f].faltan : ""));
    if (process.argv.includes("-v")) t[f].detalle.forEach(d => console.log("   " + d.fn + ":" + d.linea + " [" + d.que + "] " + d.txt));
  }
}

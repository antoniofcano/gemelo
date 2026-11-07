"use strict";
// Los pasos de la entrada del cliente (apps/web/src/arranque.ts, A3-8c) leídos como JavaScript: el TypeScript sin tipos (stripTypeScriptTypes de Node, que
// cambia cada tipo por espacios y deja todo lo demás en su sitio), partido por sus marcas `  // [paso: NN_nombre]` (apps/web/herramientas/pasos.mjs).
// Cada paso se nombra por el fichero de motor/ del que viene, con su «.js» («12_paseo.js»), como lo nombraban los guardianes y la foto de los nombres.
//   const { pasos, paso, nombresPasos, ARRANQUE } = require("./_pasos");   paso("12_paseo.js") → el texto de ese paso; pasos() → { "01_datos.js": texto, … } en orden
const path = require("path");
const { RAIZ, lee } = require("./_util");

const ARRANQUE = "apps/web/src/arranque.ts";
const P = require(path.join(RAIZ, "apps", "web", "herramientas", "pasos.mjs"));   // Node >= 22.12: require() de un módulo ES sin await de primer nivel

/** el TypeScript como JavaScript, con cada carácter en su sitio (los tipos pasan a espacios) */
function sinTipos(ts) {
  const m = require("node:module"), avisa = process.emitWarning;
  process.emitWarning = () => {};   // «experimental»: no ensucia la salida de las pruebas
  try { return m.stripTypeScriptTypes(ts); } finally { process.emitWarning = avisa; }
}
/** el TypeScript como el JavaScript que se escribiría a mano: sin los tipos y sin los huecos que dejan (`(id: string): any {` → `(id) {`,
 *  `window as any : null` → `window : null`, `window as any,` → `window,`, `x!.y` → `x.y`). Se quita cada tramo de tipos entero (del primer carácter
 *  borrado al último, con los espacios de dentro) y el espacio que sobra a su lado. Así los guardianes ven el código tal cual se escribió, sin tener que aceptar «: T». */
function comoJs(ts) {
  const js = sinTipos(ts), blanco = c => c === " " || c === "\t" || c === "\n" || c === "\r";
  let out = "", i = 0;
  while (i < ts.length) {
    if (js[i] === ts[i]) { out += ts[i]; i++; continue; }
    let j = i, ultimo = i;   // el tramo: mientras el JavaScript sea blanco; su final, el último carácter borrado
    while (j < ts.length && blanco(js[j])) { if (js[j] !== ts[j]) ultimo = j; j++; }
    i = ultimo + 1;
    if (out.endsWith(" ") && ts[i] === " ") i++;                                   // `persona: any = null` → `persona = null`
    else if (out.endsWith(" ") && /[,;)\]}\n]/.test(ts[i] || "\n")) out = out.slice(0, -1);   // `window as any,` → `window,`
  }
  return out;
}
let cache = null;
/** { "01_datos.js": texto, … } en el orden del arranque (que es el de creación). texto = el JavaScript del paso (comoJs), tras su marca */
function pasos() {
  const ts = lee(ARRANQUE);
  if (cache && cache.ts === ts) return cache.pasos;
  const js = comoJs(ts), o = {};
  // sin la línea de la marca (con la nota del paso, que hacía de la cabecera «Expone / Consume» de antes y puede citar código: `import("livekit-client")`)
  for (const p of P.partePasos(js)) o[p.nombre + ".js"] = js.slice(js.indexOf("\n", p.inicio) + 1, p.fin);
  cache = { ts, pasos: o };
  return o;
}
/** los nombres de los pasos, en orden («01_datos.js», …) */
const nombresPasos = () => Object.keys(pasos());
/** el texto (JavaScript) de un paso; acepta «12_paseo» o «12_paseo.js». Falla si no existe */
function paso(nombre) {
  const k = P.nombrePaso(nombre) + ".js", t = pasos()[k];
  if (t === undefined) throw new Error("no hay paso «" + nombre + "» en " + ARRANQUE);
  return t;
}

/** el mismo, con un nombre que no choca con los «pasos» del Bucle en los guardianes */
const pasoArranque = paso;

/** «paso:16b_fauna.js» → el texto de ese paso; cualquier otra ruta, el fichero del repo (los ayudantes que reciben «lo nuevo o la copia de antes») */
const leeFuente = f => /^paso:/.test(f) ? paso(f.slice(5)) : lee(f);

// ---------- qué expone y qué consume cada paso (antes, la cabecera «Expone / Consume» de cada fichero de motor/, que derivaba pruebas/contrato_modulos.js;
// la misma derivación, sobre los pasos y sin escribir nada). Las importaciones de src/ ya dicen qué usa cada pieza; esto mira el CABLEADO del arranque: qué
// nombre de un paso usa otro paso.
// Expone  = declaraciones de primer nivel del paso (dos espacios de sangría, `var`/`function`) que otro paso usa.
// Consume = nombres expuestos por otros pasos que este usa en su CÓDIGO (no en comentarios ni cadenas; tokenizador de acorn). Los de menos de 3 letras solo
// cuentan si están en CORTOS.
function declaradas(s) {
  const out = [];
  for (const ln of s.split("\n")) {
    let m = /^ {2}function\*?\s+([\w$]+)/.exec(ln);
    if (m) { out.push(m[1]); continue; }
    m = /^ {2}var\s+(.*)$/.exec(ln);
    if (!m) continue;
    let depth = 0, cur = "", instr = null; const partes = [];
    for (const ch of m[1]) {
      if (instr) { cur += ch; if (ch === instr) instr = null; continue; }
      if ("\"'`".includes(ch)) { instr = ch; cur += ch; continue; }
      if ("([{".includes(ch)) depth++; else if (")]}".includes(ch)) depth--;
      if (ch === "," && depth === 0) { partes.push(cur); cur = ""; continue; }
      cur += ch;
    }
    partes.push(cur);
    for (const p of partes) { const mm = /^\s*([\w$]+)\s*(=|;|$)/.exec(p); if (mm) out.push(mm[1]); }
  }
  return out;
}
// identificadores del código con el tokenizador de acorn (regla 12): sin lo que va tras un punto ni las claves de objeto literal; `locales`, los declarados dentro
function nombresDe(s) {
  const acorn = require("acorn"), out = new Set(), toks = []; out.locales = new Set();
  for (const t of acorn.tokenizer(s, { ecmaVersion: "latest", allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true })) toks.push(t);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type.label !== "name") continue;
    const a = toks[i - 1], b = toks[i + 1];
    if (a && (a.type.label === "." || a.type.label === "?.")) continue;
    if (b && b.type.label === ":" && a && (a.type.label === "{" || a.type.label === ",")) continue;
    out.add(s.slice(t.start, t.end));
    if (a && ["var", "let", "const", "function"].includes(a.type.keyword || a.value)) out.locales.add(s.slice(t.start, t.end));
    else if (a && a.type.label === "," && b && b.type.label === "=") out.locales.add(s.slice(t.start, t.end));
  }
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].type.keyword !== "function") continue;
    let j = i + 1; while (toks[j] && toks[j].type.label !== "(") j++;
    for (j++; toks[j] && toks[j].type.label !== ")"; j++) if (toks[j].type.label === "name") out.locales.add(s.slice(toks[j].start, toks[j].end));
  }
  return out;
}
const CORTOS = new Set(["D", "$", "x0", "yN", "UN", "pp", "OT", "dd", "sw", "TM", "vq", "dr", "MW", "MH", "PA", "SN", "S0", "V0", "TR", "gm"]);
const cacheNombres = new Map();
function usa(n, s) { let c = cacheNombres.get(s); if (!c) cacheNombres.set(s, c = nombresDe(s)); return c.has(n) && !(n.length < 3 && n !== "D" && n !== "$" && c.locales.has(n)); }
/** { txt, expone: { paso: [nombres] }, cons: { paso: { otroPaso(sin .js): [nombres] } } } sobre txt = { paso: texto } (por defecto, los del arranque) */
function deriva(txt = pasos()) {
  const dec = {}, expone = {}, cons = {};
  for (const f in txt) dec[f] = declaradas(txt[f]);
  for (const f in txt) {
    expone[f] = [];
    for (const n of dec[f]) if (!expone[f].includes(n) && Object.keys(txt).some(g => g !== f && usa(n, txt[g]))) expone[f].push(n);
  }
  const dueno = {};
  for (const f in expone) for (const n of expone[f]) if (!(n in dueno)) dueno[n] = f;
  for (const f in txt) {
    const c = {};
    for (const n in dueno) {
      const g = dueno[n];
      if (g === f || dec[f].includes(n)) continue;
      if (n.length < 3 && !CORTOS.has(n)) continue;
      if (usa(n, txt[f])) (c[g.slice(0, -3)] = c[g.slice(0, -3)] || []).push(n);
    }
    cons[f] = c;
  }
  return { txt, expone, cons };
}

module.exports = { pasos, paso, pasoArranque, nombresPasos, leeFuente, deriva, sinTipos, comoJs, ARRANQUE, quitaPasos: P.quitaPasos, partePasos: P.partePasos };

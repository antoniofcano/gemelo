"use strict";
// `npm run puerta:afectadas` (PB4): de los ficheros cambiados frente a `main` (o `-- --desde <ref>`) saca las pruebas que los tocan y
// las pasa por puerta.js (mismo reporter y reintento de inestables que la puerta). NO autoriza a subir `main`: eso es la puerta pesada.
// Cómo decide (se reusa lo que hay, CLAUDE.md regla 12):
//   1. Motor: la cabecera «Expone / Consume» de apps/web/motor/NN_*.js (pruebas/contrato_modulos.js) dice quién consume a quién; un módulo
//      cambiado arrastra a sus consumidores (transitivo).
//   2. Cada guardián nombra en su código las rutas que lee (cadenas con apps/…, contratos/…, path.join(…, "motor"), …) y los ficheros que
//      importa/require (se siguen, con sus propias rutas). Un cambiado que cae bajo una de esas rutas elige esa prueba.
//   3. Reglas gruesas y mapa explícito en pruebas/banco/afectadas.json (contratos/ → contratos y api; apps/api → api; doc/ → documentacion;
//      package*.json → todo). Un fichero que nada reconoce elige todo. Los baratos de proceso entran siempre.
// Opciones: --desde <ref>, --solo-node (como puerta:rapida), --lista (solo imprime la elección), --cambiados a,b,c (lista simulada, sin git).
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..", "..");
const GUARDIANES = path.join(RAIZ, "pruebas", "guardianes");
const DATOS = JSON.parse(fs.readFileSync(path.join(__dirname, "afectadas.json"), "utf8"));
const TOP = ["apps", "contratos", "tuberia", "infra", "doc", "modelos", "pruebas", ".claude"];
const norm = p => p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");

/** Rutas del repo que nombra el texto de una prueba (cadenas literales y path.join con literales; WEB/RAIZ se dan por sabidos). */
function rutasDelTexto(txt) {
  const out = new Set();
  const suelta = r => { const n = norm(r).split("/").length, ext = /\.\w+$/.test(r); return !ext && n < (r.startsWith("apps/") ? 3 : 2); };   // «apps/web», «apps/api»: demasiado ancho para decidir nada
  const anade = r => { r = norm(r); if (r && !suelta(r)) out.add(r); };
  for (const m of txt.matchAll(/(?:apps|contratos|tuberia|infra|doc|modelos|pruebas|\.claude)\/[\w./-]*[\w-]/g)) anade(m[0]);
  for (const m of txt.matchAll(/join\(([^()]*)\)/g)) {
    const partes = m[1].split(",").map(s => s.trim()).filter(Boolean);
    const cola = [];   // los literales finales (tras el último argumento que no es literal: RAIZ, WEB…)
    for (const p of partes) { const l = /^["']([^"'\\]+)["']$/.exec(p); if (l) cola.push(l[1]); else cola.length = 0; }
    if (!cola.length) continue;
    if (TOP.includes(cola[0].split("/")[0])) anade(cola.join("/"));
    else if (cola[0] === "motor") anade("apps/web/" + cola.join("/"));
  }
  return out;
}
/** Ficheros locales que importa o require (rutas relativas), resueltos desde `desde`. */
function localesDelTexto(txt, desde) {
  const out = [];
  for (const m of txt.matchAll(/(?:require\(|import\(|from\s+|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
    for (const ext of ["", ".js", ".mjs", ".cjs", ".json"]) {
      const f = path.resolve(path.dirname(desde), m[1] + ext);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) { out.push(f); break; }
    }
  }
  return out;
}
/** { nombre: Set(rutas) } de cada guardián, siguiendo sus imports locales (el propio fichero y los de ayuda cuentan como ruta). */
function refsDeGuardianes(dir = GUARDIANES) {
  const res = {};
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".test.js"))) {
    const refs = new Set(), vistos = new Set(), pila = [path.join(dir, f)];
    while (pila.length) {
      const fich = pila.pop();
      if (vistos.has(fich) || fich.includes("node_modules")) continue;
      vistos.add(fich);
      const rel = norm(path.relative(RAIZ, fich));
      if (!rel.startsWith("..")) refs.add(rel);
      if (!/\.(c|m)?js$/.test(fich)) continue;
      const txt = fs.readFileSync(fich, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");   // sin comentarios de línea entera ni de bloque: la prosa no es una dependencia
      for (const r of rutasDelTexto(txt)) refs.add(r);
      pila.push(...localesDelTexto(txt, fich));
    }
    res[f.replace(/\.test\.js$/, "")] = refs;
  }
  return res;
}
/** { "05_nube": ["06_arboles", …] }: quién consume a cada módulo, según las cabeceras Expone/Consume. */
function consumidoresDelMotor() {
  const { leeCabecera, SRC } = require("../contrato_modulos");
  const consumidores = {};
  for (const f of fs.readdirSync(SRC).filter(x => x.endsWith(".js"))) {
    const cab = leeCabecera(fs.readFileSync(path.join(SRC, f), "utf8"));
    for (const dueno of Object.keys(cab ? cab.consume : {})) (consumidores[dueno] = consumidores[dueno] || []).push(f.slice(0, -3));
  }
  return consumidores;
}
const cierre = (ini, consumidores) => {
  const vistos = new Set([ini]), pila = [ini];
  while (pila.length) for (const c of consumidores[pila.pop()] || []) if (!vistos.has(c)) { vistos.add(c); pila.push(c); }
  return vistos;
};
const cae = (cambiado, ref) => cambiado === ref || cambiado.startsWith(ref + "/");

/**
 * Pura. entrada: { cambiados:[ruta], refs:{prueba:Set|[]}, consumidores:{modulo:[modulo]}, datos }.
 * Devuelve { todo:bool, motivoTodo, pruebas: Map(prueba → [razones]) }.
 */
function selecciona({ cambiados, refs, consumidores = {}, datos = DATOS }) {
  const pruebas = new Map(), nombres = Object.keys(refs);
  const mete = (p, razon) => { if (!pruebas.has(p)) pruebas.set(p, []); const r = pruebas.get(p); if (!r.includes(razon)) r.push(razon); };
  for (const b of datos.baratos) if (nombres.includes(b)) mete(b, "barata de proceso: entra siempre");
  let todo = false, motivoTodo = "";
  for (const c0 of cambiados.map(norm)) {
    if ((datos.ignora || []).includes(c0)) continue;
    if ((datos.todo_nombres || []).includes(c0.split("/").pop())) { if (!todo) { todo = true; motivoTodo = c0 + " (package*.json: todo)"; } continue; }
    let conocido = false;
    for (const r of datos.reglas) if (cae(c0, norm(r.desde))) { conocido = true; for (const p of r.pruebas) if (nombres.includes(p)) mete(p, c0 + " → " + r.porque); }
    for (const [p, rutas] of Object.entries(datos.mapa || {})) if (nombres.includes(p) && rutas.some(r => cae(c0, norm(r)))) { conocido = true; mete(p, c0 + " → mapa explícito"); }
    // motor: el módulo y sus consumidores cuentan como cambiados
    const mm = /^apps\/web\/motor\/([^/]+)\.js$/.exec(c0);
    const efectivos = [c0];
    if (mm) { conocido = true; for (const m of cierre(mm[1], consumidores)) if (m !== mm[1]) efectivos.push("apps/web/motor/" + m + ".js"); }
    for (const p of nombres) {
      const baratas = datos.baratos.includes(p);
      for (const e of efectivos) {
        const hit = [...refs[p]].find(r => cae(e, r));
        if (!hit) continue;
        if (!baratas) conocido = true;
        mete(p, e === c0 ? c0 + " → lo nombra (" + hit + ")" : c0 + " → su consumidor " + e.split("/").pop() + " (" + hit + ")");
        break;
      }
    }
    if (!conocido && !todo) { todo = true; motivoTodo = c0 + " (nadie lo reconoce: más vale de más)"; }
  }
  return { todo, motivoTodo, pruebas };
}

function cambiadosGit(desde) {
  const { execFileSync } = require("child_process");
  const git = (...a) => execFileSync("git", a, { cwd: RAIZ, encoding: "utf8" }).split("\n").map(s => s.trim()).filter(Boolean);
  let base = desde; try { base = execFileSync("git", ["merge-base", desde, "HEAD"], { cwd: RAIZ, encoding: "utf8" }).trim(); } catch (e) { /* ref sin base común: se usa tal cual */ }
  return [...new Set([...git("diff", "--name-only", base), ...git("ls-files", "-o", "--exclude-standard")])];
}

function opcion(argv, nombre) { const i = argv.indexOf(nombre); return i < 0 ? null : argv[i + 1]; }

function principal(argv) {
  const cambiados = opcion(argv, "--cambiados") != null ? opcion(argv, "--cambiados").split(",").filter(Boolean) : cambiadosGit(opcion(argv, "--desde") || "main");
  const sel = selecciona({ cambiados, refs: refsDeGuardianes(), consumidores: consumidoresDelMotor() });
  console.log("puerta:afectadas — " + cambiados.length + " fichero(s) cambiado(s)");
  let ficheros = null;
  if (sel.todo) console.log("Elige TODAS las pruebas: " + sel.motivoTodo);
  else {
    ficheros = [...sel.pruebas.keys()].sort().map(p => "pruebas/guardianes/" + p + ".test.js");
    for (const [p, rz] of [...sel.pruebas.entries()].sort()) console.log("  " + p + ": " + rz.slice(0, 3).join("; ") + (rz.length > 3 ? " (+" + (rz.length - 3) + ")" : ""));
    console.log(ficheros.length + " prueba(s)");
  }
  console.log("AVISO: esto NO autoriza a subir `main`; eso solo lo hace la puerta pesada (npm run puerta:pesada).\n");
  if (argv.includes("--lista")) return 0;
  const env = Object.assign({}, process.env);
  if (argv.includes("--solo-node")) { env.GEMELO_SOLO_NODE = "1"; delete env.GEMELO_DOCKER; }
  const r = require("child_process").spawnSync(process.execPath, [path.join(__dirname, "puerta.js")].concat(ficheros || []), { env, stdio: "inherit", cwd: RAIZ });
  return r.status == null ? 1 : r.status;
}

module.exports = { selecciona, refsDeGuardianes, rutasDelTexto, consumidoresDelMotor, cierre };
if (require.main === module) process.exit(principal(process.argv.slice(2)));

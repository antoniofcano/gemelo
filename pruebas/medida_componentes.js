"use strict";
// C11 + O2: qué cuesta CADA componente del motor («con y sin», por el banco) y qué cuesta cada objeto de los olivos generados.
// No abre Chrome: genera los ENCARGOS para el banco (pruebas/banco/encarga.js; la ronda los hace con UN Chrome) y lee lo que devuelve (<banco>/resultados/<id>/resultado.json).
//   node pruebas/medida_componentes.js encarga --raiz <carpeta servida> [--solo id,id] [--escenarios lejos,cerca[,paseo]] [--de <quién>] [--dry]
//        saca DOS encargos: «componentes» (la página tal cual + una variante por componente con su bandera cambiada) y «olivos» (O2: ?olivos=0 frente a ?olivos=gen, con desglose).
//        --dry los imprime (JSON) sin dejarlos en la cola.
//   node pruebas/medida_componentes.js tabla --resultados <carpeta|resultado.json>… [--fecha AAAA-MM-DD]
//        (pasar SOLO las carpetas de los dos encargos: si se junta toda la carpeta de resultados, otra variante «base» ajena pisaría la buena)
//        calcula «con menos sin» por componente, lo compara con el presupuesto declarado de su manifiesto y escribe la tabla Markdown (a stdout)
//        lista para doc/sistema/MEDIDAS.md. La lista de componentes sale de los manifiestos del código (apps/web/motor/*.js), no de una copia.
// Nombres de variante: «base» (todos los componentes en su defecto), «sin-<id>» (un componente que va encendido por defecto, con su bandera a 0),
// «con-<id>» (uno apagado por defecto, con su bandera a 1), «olivos0» (?olivos=0) y «gen» (?olivos=gen).
// SwiftShader da recuentos (llamadas, triángulos, puntos, memoria), no fps; el heap oscila ±3 MB entre cargas: no leer un delta de heap menor como real.
const fs = require("fs"), path = require("path"), vm = require("vm");

const RAIZ = path.resolve(__dirname, "..");
const MOTOR = path.join(RAIZ, "apps", "web", "motor");
const ESC_POR_DEFECTO = ["lejos", "cerca"];
const METRICAS = [["llamadas", "llam."], ["triangulos", "tri"], ["puntos", "puntos"], ["heapMB", "heap MB"]];

/** Los manifiestos de los componentes del motor, tal y como los registra cada fichero (se evalúa el fichero en un contexto vacío, como hace componentes.test.js).
 *  Devuelve [{ id, fichero, url, defecto, presupuesto }] en el orden de los ficheros; un componente sin bandera de URL no se puede apagar desde la página y se omite. */
function manifiestos(carpeta = MOTOR) {
  const out = [];
  for (const f of fs.readdirSync(carpeta).filter(f => f.endsWith(".js")).sort()) {
    const s = fs.readFileSync(path.join(carpeta, f), "utf8");
    if (!/^  Componentes\.registra\(\{/m.test(s)) continue;
    const defs = [], ctx = vm.createContext({ Componentes: { registra: d => { defs.push(d); return true; } }, Bus: { on: () => () => {}, emite: () => 0, hay: () => false }, console, Intl, Date, Math, JSON });
    vm.runInContext("\"use strict\";\n" + s, ctx, { filename: f });
    for (const d of defs) {
      const b = d.bandera || {};
      out.push({ id: d.id, fichero: f, url: b.url || null, defecto: !!b.defecto, presupuesto: d.presupuesto ? { llamadas: d.presupuesto.llamadas, triangulos: d.presupuesto.triangulos, texturasMB: d.presupuesto.texturasMB } : null });
    }
  }
  return out;
}

/** El nombre de la variante y su consulta para medir un componente: apagado si va encendido por defecto, encendido si va apagado */
function variante(c) { return c.defecto ? { nombre: "sin-" + c.id, consulta: "?" + c.url + "=0" } : { nombre: "con-" + c.id, consulta: "?" + c.url + "=1" }; }

/** Los dos encargos (objetos como los que escribe encarga.js; sin id ni fecha). opciones: { raiz, solo?: [id], escenarios?: [..], de?, comps? (manifiestos, para pruebas) } */
function encargos(o) {
  const todos = o.comps || manifiestos(), solo = o.solo && o.solo.length ? new Set(o.solo) : null;
  const quiere = c => !solo || solo.has(c.id) || solo.has(c.url);   // por id o por el nombre de su bandera
  if (solo) for (const id of solo) if (!todos.some(c => c.id === id || c.url === id)) throw new Error("componente desconocido: " + id + " (hay: " + todos.map(c => c.id).join(", ") + ")");
  const comps = todos.filter(c => c.url && quiere(c));
  const escenarios = o.escenarios || ESC_POR_DEFECTO, de = o.de || "medida-componentes", base = { raiz: path.resolve(o.raiz), pagina: "index.html", capturas: false, tope_s: 240, de, desglose: true };
  return {
    componentes: Object.assign({}, base, { escenarios, variantes: [{ nombre: "base", consulta: "" }].concat(comps.map(variante)), medida: "componentes" }),
    // O2: ?olivos=0 (sin generados) frente a ?olivos=gen, con el desglose por objeto y la lectura de las piezas del lote (Generados.piezas()); «cerca» y el paseo son donde hay lote
    olivos: Object.assign({}, base, { escenarios: ["lejos", "cerca", "paseo"], variantes: [{ nombre: "olivos0", consulta: "?olivos=0" }, { nombre: "gen", consulta: "?olivos=gen" }], medida: "olivos" }),
  };
}

// ---------- el lector ----------
/** Junta las variantes de uno o varios resultados: ruta de un resultado.json, de una carpeta con resultado.json o de una carpeta de carpetas de resultados */
function leeResultados(rutas) {
  const variantes = {}, fuentes = [];
  const lee = f => { const r = JSON.parse(fs.readFileSync(f, "utf8")); fuentes.push(f); Object.assign(variantes, r.variantes || {}); };
  for (const r of rutas) {
    if (!fs.existsSync(r)) throw new Error("no existe " + r);
    if (fs.statSync(r).isFile()) { lee(r); continue; }
    const f = path.join(r, "resultado.json");
    if (fs.existsSync(f)) { lee(f); continue; }
    for (const d of fs.readdirSync(r).sort()) { const g = path.join(r, d, "resultado.json"); if (fs.existsSync(g)) lee(g); }
  }
  if (!fuentes.length) throw new Error("no hay ningún resultado.json en " + rutas.join(", "));
  return { variantes, fuentes };
}

const valor = (v, esc, m) => { const x = v && v.medidas && v.medidas[esc] && v.medidas[esc][m]; return typeof x === "number" && x >= 0 ? x : null; };
const escenariosDe = vs => { const s = new Set(); Object.values(vs).forEach(v => v && v.medidas && Object.keys(v.medidas).forEach(e => s.add(e))); return [...s]; };

/** «con menos sin» de un componente en cada escenario y cada métrica. base = la variante «base». Devuelve { escenario: { metrica: delta|null } }.
 *  Un componente encendido por defecto: base − sin; uno apagado por defecto: con − base. */
function delta(c, vars, escenarios) {
  const v = variante(c), x = vars[v.nombre], b = vars.base, out = {};
  for (const e of escenarios) {
    out[e] = {};
    for (const [m] of METRICAS) {
      const a = valor(c.defecto ? b : x, e, m), z = valor(c.defecto ? x : b, e, m);
      out[e][m] = a === null || z === null ? null : a - z;
    }
  }
  return out;
}

/** ok / por encima / sin declarar / sin medida: el peor escenario contra el presupuesto declarado (llamadas y triángulos; texturasMB no se mide aquí) */
function veredicto(c, d) {
  if (!c.presupuesto) return "sin declarar";
  const vals = Object.values(d), hay = vals.some(e => e.llamadas !== null || e.triangulos !== null);
  if (!hay) return "sin medida";
  const pasa = k => vals.some(e => e[k] !== null && e[k] > c.presupuesto[k]);
  return pasa("llamadas") || pasa("triangulos") ? "por encima" : "ok";
}

const fmt = n => n === null ? "—" : (n > 0 ? "+" : "") + String(Math.round(n * 10) / 10).replace(".", ",");
const miles = n => n === null || n === undefined ? "—" : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const marca = v => v ? (v.error ? " (error)" : v.parcial ? " (parcial)" : "") : "";

/** La tabla de C11 en Markdown */
function tablaComponentes(vars, comps) {
  const esc = escenariosDe({ base: vars.base }).filter(e => !e.startsWith("paseo")).concat(escenariosDe({ base: vars.base }).filter(e => e.startsWith("paseo")));
  const L = [];
  if (!vars.base || vars.base.error) return "_Falta la variante «base» (o falló): sin ella no hay «con menos sin»._\n";
  const cab = ["Componente", "Bandera", "Presupuesto declarado (llam. / tri)"];
  esc.forEach(e => METRICAS.forEach(([, t]) => cab.push(e + " " + t)));
  cab.push("Veredicto");
  L.push("| " + cab.join(" | ") + " |", "|" + cab.map(() => "---").join("|") + "|");
  for (const c of comps.filter(c => c.url)) {
    const v = variante(c), vv = vars[v.nombre];
    if (!vv) { L.push("| `" + c.id + "` | `?" + c.url + (c.defecto ? "=0" : "=1") + "` | " + decl(c) + " | " + esc.flatMap(() => METRICAS.map(() => "—")).join(" | ") + " | sin medida |"); continue; }
    const d = delta(c, vars, esc), celdas = [];
    esc.forEach(e => METRICAS.forEach(([m]) => celdas.push(fmt(d[e][m]))));
    L.push("| `" + c.id + "` | `?" + c.url + (c.defecto ? "=0" : "=1") + "`" + marca(vv) + " | " + decl(c) + " | " + celdas.join(" | ") + " | " + veredicto(c, d) + " |");
  }
  L.push("", "Cada celda es «con − sin» del componente (si va encendido por defecto, base − `?<bandera>=0`; si va apagado, `?<bandera>=1` − base). Veredicto: el peor escenario medido contra el presupuesto declarado en su manifiesto (llamadas y triángulos; las texturas no se miden aquí). El heap tiene ruido de ±3 MB en SwiftShader: un delta menor no es real. Base: " + esc.map(e => e + " " + METRICAS.map(([m]) => miles(valor(vars.base, e, m))).join("/")).join(" · ") + " (llam./tri/puntos/heap MB).");
  return L.join("\n") + "\n";
}
const decl = c => c.presupuesto ? miles(c.presupuesto.llamadas) + " / " + miles(c.presupuesto.triangulos) : "sin declarar";

/** Filas del desglose (desgloseLlamadas) que son del lote de olivos generados, agrupadas por pieza y pasada: { "gen-corteza": { principal, sombra } } */
function desglosePorPieza(med) {
  const out = {};
  if (!med || !med.desglose) return out;
  for (const [clave, n] of med.desglose.filas || []) {
    if (!/ › (?:gen-|olivos-lejanos)/.test(clave)) continue;   // las mallas del lote cuelgan del grupo de árboles (el desglose nombra el hijo de la escena y la malla): gen-* y los lejanos de la escalera (07ac)
    const m = /^(principal|sombra) · #\d+ [^›]*?(?:\[[^\]]*\])?(?: › ([^ ]+))? · /.exec(clave);
    if (!m) continue;
    const pieza = (m[2] || "(el grupo)").replace(/:[A-Za-z]+$/, "");
    (out[pieza] = out[pieza] || { principal: 0, sombra: 0 })[m[1]] += n;
  }
  return out;
}

/** La tabla de O2: gen frente a olivos0 por escenario, las piezas del lote (llamadas del desglose + triángulos de Generados.piezas()) y los escalones */
function tablaOlivos(vars) {
  const g = vars.gen, o = vars.olivos0, L = [];
  if (!g || !o || g.error || o.error) return "_Faltan las variantes «olivos0» y «gen» (o fallaron)._\n";
  const esc = escenariosDe({ g });
  L.push("**`?olivos=gen` frente a `?olivos=0`** (todo el motor, un fotograma tras la carga; SwiftShader: recuentos, no fps)", "");
  L.push("| Escenario | llam. 0 → gen | tri 0 → gen | puntos 0 → gen | heap MB 0 → gen | lote: estado · llam. / tri · olivos |", "|---|---|---|---|---|---|");
  for (const e of esc) {
    const f = m => miles(valor(o, e, m)) + " → " + miles(valor(g, e, m)) + " (" + fmt(valor(g, e, m) === null || valor(o, e, m) === null ? null : valor(g, e, m) - valor(o, e, m)) + ")";
    const gm = g.medidas[e].generados, inf = gm && gm.info || {};
    L.push("| " + e + " | " + f("llamadas") + " | " + f("triangulos") + " | " + f("puntos") + " | " + f("heapMB") + " | " + (gm ? gm.estado + " · " + miles(inf.llamadas) + " / " + miles(inf.triangulos) + " · " + miles(inf.arboles) : "—") + " |");
  }
  for (const e of esc) {
    const med = g.medidas[e], filas = desglosePorPieza(med), pz = med.piezasGen;
    if (!pz && !Object.keys(filas).length) continue;
    L.push("", "**Piezas del lote en `" + e + "`** (por malla fundida; llamadas del desglose de un fotograma; triángulos de UNA pasada, de `Generados.piezas()`)", "", "| Pieza | tipo | instancias | triángulos (1 pasada) | puntos | llamadas principal | llamadas sombra |", "|---|---|---|---|---|---|---|");
    const nombres = new Set(Object.keys(filas).concat((pz && pz.piezas || []).map(p => p.pieza)));
    for (const n of [...nombres].sort()) {
      const p = pz && pz.piezas.find(x => x.pieza === n), f = filas[n] || { principal: null, sombra: null };
      L.push("| `" + n + "` | " + (p ? p.tipo : "—") + " | " + (p ? miles(p.instancias) : "—") + " | " + (p ? miles(p.triangulos) : "—") + " | " + (p ? miles(p.puntos) : "—") + " | " + miles(f.principal) + " | " + miles(f.sombra) + " |");
    }
    if (pz && pz.niveles && Object.keys(pz.niveles).length) {
      L.push("", "Escalones del lote en `" + e + "` (E0 entero · E1 · E2 variantes · E2VR gafas):", "", "| Escalón | olivos | triángulos de sus recetas |", "|---|---|---|");
      for (const k of Object.keys(pz.niveles).sort()) L.push("| " + k + " | " + miles(pz.niveles[k].olivos) + " | " + miles(pz.niveles[k].triangulos) + " |");
    }
  }
  return L.join("\n") + "\n";
}

function tabla(rutas, fecha, comps) {
  const { variantes, fuentes } = leeResultados(rutas), cs = comps || manifiestos();
  return "### Medida por componente (C11) y por objeto (O2) (" + (fecha || "FECHA") + ", banco, SwiftShader: recuentos, no fps)\n\nFuentes: " + fuentes.length + " resultado(s) del banco.\n\n#### Por componente (C11)\n\n" + tablaComponentes(variantes, cs) + "\n#### Olivos generados por objeto (O2)\n\n" + tablaOlivos(variantes);
}

// ---------- línea de órdenes ----------
function argumentos(argv) {
  const a = { _: [], resultados: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i], v = () => argv[++i];
    if (x === "--raiz") a.raiz = v(); else if (x === "--solo") a.solo = v().split(","); else if (x === "--escenarios") a.escenarios = v().split(",");
    else if (x === "--de") a.de = v(); else if (x === "--dry") a.dry = true; else if (x === "--resultados") a.resultados.push(v()); else if (x === "--fecha") a.fecha = v();
    else if (x.startsWith("--")) throw new Error("argumento desconocido: " + x); else a._.push(x);
  }
  return a;
}

if (require.main === module) {
  try {
    const a = argumentos(process.argv.slice(2)), orden = a._[0];
    if (orden === "encarga") {
      if (!a.raiz) throw new Error("--raiz <carpeta servida> es obligatorio");
      const e = encargos(a);
      if (a.dry) { console.log(JSON.stringify(e, null, 2)); }
      else {
        const { encarga, lee } = require("./banco/encarga");
        const ids = [], { RESULTADOS } = require("./banco/encarga");
        for (const k of ["componentes", "olivos"]) {
          const x = lee(["--raiz", a.raiz, "--escenarios", e[k].escenarios.join(","), "--desglose", "--de", e[k].de].concat(...e[k].variantes.map(v => ["--variante", v.nombre + "=" + v.consulta])));
          const { id } = encarga(x); ids.push(id); console.log(k + ": encargo " + id + " (" + e[k].variantes.length + " variantes × " + e[k].escenarios.length + " escenarios)");
        }
        console.log("Lo hace la siguiente ronda: npm run banco:ronda. Luego: node pruebas/medida_componentes.js tabla " + ids.map(i => "--resultados " + path.join(RESULTADOS, i)).join(" ") + " --fecha AAAA-MM-DD");
      }
    } else if (orden === "tabla") {
      if (!a.resultados.length) throw new Error("--resultados <carpeta|resultado.json> es obligatorio");
      process.stdout.write(tabla(a.resultados, a.fecha));
    } else throw new Error("uso: medida_componentes.js encarga --raiz <carpeta> [--solo id,id] [--escenarios lejos,cerca,paseo] [--dry]  |  tabla --resultados <carpeta> [--fecha AAAA-MM-DD]");
  } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { manifiestos, variante, encargos, leeResultados, delta, veredicto, desglosePorPieza, tablaComponentes, tablaOlivos, tabla };

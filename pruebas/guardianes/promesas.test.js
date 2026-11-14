"use strict";
// Guardián promesa↔guardián (regla 13 de CLAUDE.md, MU1-12, MUNDOS §8): cada regla de oro de CLAUDE.md §1, cada viñeta
// en negrita de §5 y cada tope de pruebas/presupuesto.json tienen su entrada en pruebas/promesas.json, que dice qué
// prueba la vigila o, con «vigila»: null, por qué no se puede vigilar en código. Falla si falta una entrada, si sobra
// una (la regla ya no está), si una entrada apunta a un fichero o a un nombre de test que no existen, o si una de null
// no da su motivo. Las de null no hacen fallar: se listan como «promesas sin guardián» (la lista para Antonio), y las
// que llevan «falta» como «vigiladas a medias». Solo Node: lee ficheros, no ejecuta las pruebas a las que apunta.
const test = require("node:test"), assert = require("node:assert");
const { lee, fs, path, RAIZ } = require("./_util");

/** Las promesas que declara un texto como CLAUDE.md: reglas numeradas en negrita de §1 y viñetas en negrita de §5. */
function promesasDeClaude(s) {
  const seccion = n => (s.split(/^## /m).find(b => b.startsWith(n + ".")) || "").split("\n");
  const r = [];
  for (const l of seccion("1")) { const m = /^(\d+)\. \*\*(.+?)\*\*/.exec(l); if (m) r.push({ origen: "CLAUDE.md §1", clave: m[1], titulo: m[2] }); }
  for (const l of seccion("5")) { const m = /^- \*\*(.+?)\*\*/.exec(l); if (m) r.push({ origen: "CLAUDE.md §5", clave: m[1] }); }
  return r;
}

/** Los topes de un presupuesto: un objeto de solo números es un tope; un número suelto junto a objetos, otro. Las claves «$…» son comentarios; «medido» (la medida
 *  con la que se fijó el tope, L1-06), «medido_el» y «fijos» la acompañan y no son topes. */
function topesDePresupuesto(o, pre) {
  const claves = Object.keys(o).filter(k => !k.startsWith("$") && k !== "medido" && k !== "medido_el" && k !== "fijos");
  const ruta = k => (pre ? pre + "." : "") + k;
  if (pre && claves.length && claves.every(k => typeof o[k] === "number")) return [pre];
  const r = [];
  for (const k of claves) {
    if (typeof o[k] === "number") r.push(ruta(k));
    else if (o[k] && typeof o[k] === "object") r.push(...topesDePresupuesto(o[k], ruta(k)));
  }
  return r;
}

const id = p => p.origen + " · " + p.clave;

/** Compara lo declarado con el registro: lo que falta, lo que sobra, los repetidos y los títulos de §1 que ya no casan. */
function cuadra(declaradas, registro) {
  const reg = new Map(), repetidas = [];
  for (const p of registro) { if (reg.has(id(p))) repetidas.push(id(p)); reg.set(id(p), p); }
  const dec = new Map(declaradas.map(p => [id(p), p]));
  return {
    faltan: [...dec.keys()].filter(k => !reg.has(k)),
    sobran: [...reg.keys()].filter(k => !dec.has(k)),
    repetidas,
    titulos: [...dec.values()].filter(p => p.titulo && reg.has(id(p)) && reg.get(id(p)).titulo !== p.titulo)
      .map(p => id(p) + ": CLAUDE.md dice «" + p.titulo + "», el registro «" + reg.get(id(p)).titulo + "»")
  };
}

/** Errores de forma y de destino de cada entrada (leeFichero(f) devuelve el texto o null si no existe). */
function revisaEntradas(registro, leeFichero) {
  const mal = [];
  for (const p of registro) {
    const n = id(p);
    if (p.vigila === null) {
      if (typeof p.motivo !== "string" || p.motivo.trim().length < 20) mal.push(n + ": «vigila» es null y falta el motivo (una frase de por qué no se puede vigilar en código)");
      continue;
    }
    if (!Array.isArray(p.vigila) || !p.vigila.length) { mal.push(n + ": «vigila» ha de ser una lista no vacía de {fichero, test} o null con motivo"); continue; }
    for (const v of p.vigila) {
      if (!v || typeof v.fichero !== "string") { mal.push(n + ": una entrada de «vigila» sin fichero"); continue; }
      const s = leeFichero(v.fichero);
      if (s === null) { mal.push(n + ": " + v.fichero + " no existe"); continue; }
      if (v.test !== undefined && (typeof v.test !== "string" || !s.includes(v.test))) mal.push(n + ": " + v.fichero + " no tiene un test que se llame «" + v.test + "»");
    }
    if (p.origen === "pruebas/presupuesto.json" && !p.vigila.some(v => (leeFichero(v.fichero) || "").includes("presupuesto.json")))
      mal.push(n + ": ninguna de sus pruebas lee pruebas/presupuesto.json");
  }
  return mal;
}

const REGISTRO = JSON.parse(lee("pruebas/promesas.json"));
const PROMESAS = REGISTRO.promesas;
const declaradas = () => promesasDeClaude(lee("CLAUDE.md")).concat(
  topesDePresupuesto(JSON.parse(lee("pruebas/presupuesto.json"))).map(clave => ({ origen: "pruebas/presupuesto.json", clave })));
const leeFichero = f => { const p = path.join(RAIZ, f); return fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, "utf8") : null; };

test("CLAUDE.md declara reglas de oro numeradas sin huecos y viñetas en §5 (si no, el detector se ha quedado ciego)", () => {
  const d = promesasDeClaude(lee("CLAUDE.md"));
  const oro = d.filter(p => p.origen === "CLAUDE.md §1").map(p => Number(p.clave));
  assert.ok(oro.length >= 10, "solo " + oro.length + " reglas de oro detectadas");
  assert.deepStrictEqual(oro, oro.map((_, i) => i + 1), "las reglas de oro no van 1, 2, 3…");
  assert.ok(d.filter(p => p.origen === "CLAUDE.md §5").length >= 5, "pocas viñetas en negrita detectadas en §5");
});

test("cada regla de CLAUDE.md y cada tope de pruebas/presupuesto.json tiene su entrada en pruebas/promesas.json", () => {
  const c = cuadra(declaradas(), PROMESAS);
  assert.deepStrictEqual(c.faltan, [], "promesas sin entrada en pruebas/promesas.json (añádela: qué prueba la vigila, o null con su motivo)");
  assert.deepStrictEqual(c.sobran, [], "entradas de pruebas/promesas.json cuya regla o tope ya no existe (bórralas)");
  assert.deepStrictEqual(c.repetidas, [], "entradas repetidas");
  assert.deepStrictEqual(c.titulos, [], "el texto de una regla de oro cambió: revisa que su entrada siga siendo cierta y copia el título nuevo");
});

test("cada entrada apunta a pruebas que existen o dice por qué no se vigila", () => {
  assert.strictEqual(REGISTRO.version, 1, "versión del registro");
  assert.deepStrictEqual(revisaEntradas(PROMESAS, leeFichero), []);
  const sin = PROMESAS.filter(p => p.vigila === null), medias = PROMESAS.filter(p => p.vigila && p.falta);
  console.log("promesas: " + PROMESAS.length + ", con guardián " + (PROMESAS.length - sin.length) + " (" + medias.length + " a medias), sin guardián " + sin.length);
  console.log("promesas sin guardián (regla 13: vigilarlas o borrarlas, lo decide Antonio):\n" + sin.map(p => "  · " + id(p) + " — " + p.motivo).join("\n"));
  console.log("promesas vigiladas a medias:\n" + medias.map(p => "  · " + id(p) + " — falta: " + p.falta).join("\n"));
});

test("el detector caza lo que debe: regla nueva, regla borrada, título cambiado, tope nuevo, fichero o test inexistentes, null sin motivo", () => {
  const md = "# X\n## 1. Oro\n\n1. **Una.** a\n2. **Dos** b\n   - **no cuenta** (sangrada)\n## 2. Mapa\n- **no cuenta**\n## 5. Conv\n\n- **Viñeta A** x\n- normal\n## 6. Fin\n";
  const d = promesasDeClaude(md);
  assert.deepStrictEqual(d.map(id), ["CLAUDE.md §1 · 1", "CLAUDE.md §1 · 2", "CLAUDE.md §5 · Viñeta A"]);
  assert.deepStrictEqual(topesDePresupuesto({ $comment: "x", a: { x: 1, y: 2 }, b: { $comment: "", c: { z: 1 }, n: 3 } }), ["a", "b.c", "b.n"]);
  const reg = [{ origen: "CLAUDE.md §1", clave: "1", titulo: "Una." }, { origen: "CLAUDE.md §1", clave: "2", titulo: "Vieja" }, { origen: "CLAUDE.md §1", clave: "3", titulo: "Borrada" }];
  const c = cuadra(d, reg);
  assert.deepStrictEqual(c.faltan, ["CLAUDE.md §5 · Viñeta A"]);
  assert.deepStrictEqual(c.sobran, ["CLAUDE.md §1 · 3"]);
  assert.strictEqual(c.titulos.length, 1);
  const ficheros = { "p/a.test.js": 'test("hace lo suyo", () => {}); // presupuesto.json' };
  const lf = f => (f in ficheros ? ficheros[f] : null);
  const mal = revisaEntradas([
    { origen: "o", clave: "bien", vigila: [{ fichero: "p/a.test.js", test: "hace lo suyo" }] },
    { origen: "o", clave: "sin fichero", vigila: [{ fichero: "p/no.test.js" }] },
    { origen: "o", clave: "sin test", vigila: [{ fichero: "p/a.test.js", test: "otro nombre" }] },
    { origen: "o", clave: "null mudo", vigila: null },
    { origen: "o", clave: "null con motivo", vigila: null, motivo: "lo decide una persona, no hay código que mirar" },
    { origen: "o", clave: "vacía", vigila: [] }
  ], lf);
  assert.deepStrictEqual(mal.map(m => m.split(":")[0]), ["o · sin fichero", "o · sin test", "o · null mudo", "o · vacía"]);
  assert.deepStrictEqual(revisaEntradas([{ origen: "pruebas/presupuesto.json", clave: "t", vigila: [{ fichero: "p/b.test.js" }] }], f => (f === "p/b.test.js" ? "nada" : null)).length, 1, "un tope cuya prueba no lee presupuesto.json");
});

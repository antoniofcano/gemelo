"use strict";
// Creador por piezas (AV3 y AV4): los guiones de Blender de tuberia/avatares/creador/, el catálogo v2 (catalogo.mjs) y el envoltorio del banco para procesos que no son Chrome.
// Sin Blender: se lee el guion (12 cuerpos, peques sin ofrecer, sin parámetro de sexo, licencia CC0, salida fuera del repo) y se prueba proceso.js.
// Con Blender y los cuerpos ya generados (GEMELO_AVATARES_CUERPOS = la carpeta de cuerpos.py), además: comprueba.mjs (tubería + three-vrm).
const test = require("node:test"), assert = require("node:assert");
const fs = require("fs"), { spawnSync } = require("child_process");
const { RAIZ, lee, path } = require("./_util");

const PY = lee("tuberia/avatares/creador/cuerpos.py");
/** El diccionario de Python `NOMBRE = {…}` (hasta su llave de cierre) */
function bloque(nombre) {
  const i = PY.indexOf("\n" + nombre + " = {"); assert.ok(i >= 0, "falta " + nombre);
  let j = PY.indexOf("{", i), prof = 0;
  for (let k = j; k < PY.length; k++) { if (PY[k] === "{") prof++; else if (PY[k] === "}" && --prof === 0) return PY.slice(j + 1, k); }
  assert.fail("sin cierre: " + nombre);
}

test("cuerpos.py: 4 edades × 3 complexiones; los peques se generan y no se ofrecen (decisión 132)", () => {
  const edades = [...bloque("EDADES").matchAll(/"(\w+)":\s*\{"age": ([\d.]+), "anos": (\d+),\s*"ofrecer": (True|False)\}/g)];
  assert.deepStrictEqual(edades.map(e => e[1]), ["peque", "joven", "adulta", "mayor"]);
  assert.deepStrictEqual(edades.map(e => e[4]), ["False", "True", "True", "True"], "solo los peques sin ofrecer");
  const ages = edades.map(e => Number(e[2])); assert.ok(ages.every((a, i) => i === 0 || a > ages[i - 1]) && ages.every(a => a > 0 && a < 1), "edades crecientes dentro de 0-1");
  const comp = [...bloque("COMPLEXIONES").matchAll(/"(\w+)":\s*\{"weight": ([\d.]+), "muscle": ([\d.]+)\}/g)];
  assert.deepStrictEqual(comp.map(c => c[1]), ["delgada", "media", "ancha"]);
  const pesos = comp.map(c => Number(c[2])); assert.ok(pesos[0] < pesos[1] && pesos[1] < pesos[2] && pesos.every(p => p >= 0 && p <= 1), "peso creciente dentro de 0-1 (que «ancha» no sea caricatura, C3, se mira a ojo)");
});

test("cuerpos.py: sin parámetro de sexo (gender fijo en 0,5), sin rasgo étnico marcado y nombres neutros (C8, C9, C11)", () => {
  assert.match(bloque("NEUTRO").replace(/\s+/g, " "), /"gender": 0\.5/);
  assert.ok(!/macro\["gender"\]\s*=/.test(PY) && !/gender.*argumentos|--gender|--sexo/.test(PY), "gender no se toca por cuerpo ni por argumento");
  assert.match(PY, /RAZAS = \{"asian": 1 \/ 3, "caucasian": 1 \/ 3, "african": 1 \/ 3\}/);
  const nombres = bloque("NOMBRE_EDAD") + bloque("NOMBRE_COMPLEXION");
  assert.ok(!/abuel|chic[oa]|hombre|mujer|señor|niñ[oa]/i.test(nombres), "nombres sin la lista negra de C9");
});

test("cuerpos.py: VRM 1.0 con licencia que la tubería acepta, huesos obligatorios mapeados, blink y aa; color en el motor (sin texturas)", () => {
  for (const r of [/meta\.avatar_permission = "everyone"/, /meta\.commercial_usage = "corporation"/, /meta\.allow_redistribution = True/, /meta\.modification = "allowModificationRedistribution"/,
    /"spdx": "CC0-1\.0"/, /ext\.spec_version = "1\.0"/]) assert.match(PY, r);
  const mapa = bloque("HUESOS_VRM");
  for (const h of ["hips", "spine", "head", "left_upper_leg", "left_lower_leg", "left_foot", "right_upper_leg", "right_lower_leg", "right_foot",
    "left_upper_arm", "left_lower_arm", "left_hand", "right_upper_arm", "right_lower_arm", "right_hand"]) assert.match(mapa, new RegExp('"' + h + '":'), "hueso " + h);
  assert.match(bloque("EXPRESIONES"), /"blink":/); assert.match(bloque("EXPRESIONES"), /"aa":/);
  assert.ok(!/TexImage|images\.load|ShaderNodeTex/.test(PY.replace(/#.*$/gm, "")), "los cuerpos no llevan texturas (decisión 128)");
  assert.match(PY, /los VRM no se versionan/, "se niega a escribir dentro del repo");
});

test("cuerpos.py (AV4): piezas mínimas para que nadie quede calvo ni igual — cinco peinados (rapado, corto, afro, recogido, largo), vello, ropa de faena y sombreros; sin sexo; ids del contrato", () => {
  const piezas = [...bloque("PIEZAS").matchAll(/"([a-z0-9-]+)":\s*\{"tipo": "(\w+)"/g)].map(m => [m[1], m[2]]);
  const de = t => piezas.filter(x => x[1] === t).map(x => x[0]);
  assert.deepStrictEqual(de("pelo"), ["pelo-rapado", "pelo-corto", "pelo-afro", "pelo-recogido", "pelo-largo"]);
  assert.ok(de("vello").length >= 1 && de("ropa").includes("ropa-faena") && de("accesorio").length >= 2);
  for (const [id] of piezas) assert.match(id, /^[a-z0-9-]{1,32}$/);
  assert.match(PY, /obj\.name = "pieza_" \+ ident/, "el nodo de cada pieza se llama pieza_<id> (contratos/avatares.md §9)");
  assert.match(bloque("PIEZAS"), /"ropa-faena":[^\n]*"cubre_ropa_base": True/);
  // el cuello (decisión 141): un plano inclinado, sin los cortes en escalera de AV3; «mayor» con más edad y postura
  assert.ok(!/ESCOTE/.test(PY), "sin el escote recto de AV3");
  assert.match(PY, /"cuello_no": Vector\(\(0, -INCLINA, 1\)\)\.normalized\(\)/);
  assert.match(bloque("POSTURA"), /"mayor":/);
  const mayor = /"mayor":\s*\{"age": ([\d.]+)/.exec(bloque("EDADES")); assert.ok(Number(mayor[1]) > 0.9, "más edad que en AV3 (0,88)");
});

test("catalogo.mjs (AV4): el avatar completo más caro (cuerpo + la pieza más cara de cada tipo; la ropa que cubre quita la base) y sus topes", async () => {
  const { pathToFileURL } = require("url"), { peorCombinacion, TOPES_COMBINACION, TOPES_CUERPO } = await import(pathToFileURL(path.join(RAIZ, "tuberia", "avatares", "creador", "catalogo.mjs")).href);
  const nodos = { cuerpo: { primitivas: 3, triangulos: 9000, porMaterial: { piel: 6000, ropa_base: 2000, ropa_abajo: 1000 } }, ojos: { primitivas: 1, triangulos: 300 },
    "pieza_pelo-a": { primitivas: 1, triangulos: 800 }, "pieza_pelo-b": { primitivas: 1, triangulos: 1500 }, "pieza_ropa-f": { primitivas: 2, triangulos: 2000 }, "pieza_som": { primitivas: 1, triangulos: 140 } };
  const piezas = [{ id: "pelo-a", tipo: "pelo", malla: "pieza_pelo-a" }, { id: "pelo-b", tipo: "pelo", malla: "pieza_pelo-b" }, { id: "ropa-f", tipo: "ropa", malla: "pieza_ropa-f", cubre_ropa_base: true }, { id: "som", tipo: "accesorio", malla: "pieza_som" }];
  assert.deepStrictEqual(peorCombinacion(nodos, piezas), { triangulos: 9000 + 300 + 1500 + (2000 - 3000) + 140, primitivas: 4 + 1 + 0 + 1 });
  assert.deepStrictEqual(TOPES_COMBINACION, { triangulos: 15000, primitivas: 7 });
  assert.ok(TOPES_CUERPO.triangulos_max >= 20000 && TOPES_CUERPO.materiales_max >= 6);
});

test("banco/proceso.js: lee la orden tras «--», la memoria pedida y el motivo; sin orden, error", () => {
  const { lee: leeArgs } = require("../banco/proceso");
  const o = leeArgs(["--que", "AV3 cuerpos", "--memoria-gb", "1.5", "--", "blender", "--background"]);
  assert.deepStrictEqual([o.que, o.memoriaGb, o.orden], ["AV3 cuerpos", 1.5, ["blender", "--background"]]);
  assert.throws(() => leeArgs(["--que", "x"]), /falta la orden/);
  assert.throws(() => leeArgs(["--raro", "1", "--", "x"]), /desconocido/);
  assert.match(lee("pruebas/banco/proceso.js"), /conTurno\(/, "pide el turno del banco");
});

const CUERPOS = process.env.GEMELO_AVATARES_CUERPOS;
test("comprueba.mjs con los cuerpos generados: pasan la tubería y three-vrm 3.5.5 los carga", { skip: !(CUERPOS && fs.existsSync(path.join(CUERPOS, "cuerpos.json"))) && "sin GEMELO_AVATARES_CUERPOS (hace falta Blender: ver AVATARES-FAMILIA.md §12)" }, () => {
  const r = spawnSync(process.execPath, [path.join(RAIZ, "tuberia", "avatares", "creador", "comprueba.mjs"), "--origen", CUERPOS], { encoding: "utf8" });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.strictEqual((r.stdout.match(/\| cuerpo-/g) || []).length, 12, r.stdout);
  assert.ok(!/FALLA|RECHAZADO/.test(r.stdout), r.stdout);
});

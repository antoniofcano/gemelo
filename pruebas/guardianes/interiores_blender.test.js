"use strict";
// Base de los interiores en Blender (eje B, tuberia/interiores/blender/): capas.json reparte cada nodo del glb en un mundo con su
// procedencia (regla 5), las copias entre mundos son solo las declaradas, la limpieza solo toca escaneo; los nombres de las texturas
// descomprimidas son legibles, únicos y deterministas; los guiones no llevan rutas locales y las dependencias van con versión fijada
// (regla 12). Solo Node: no abre Blender ni lee los modelos (son privados, decisión 227).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, lee, fs, path } = require("./_util");
const { pathToFileURL } = require("node:url");

const DIR = path.join(RAIZ, "tuberia", "interiores", "blender");
const CAPAS = JSON.parse(lee("tuberia/interiores/blender/capas.json"));
const listas = m => Object.entries(m).filter(([k]) => !k.startsWith("_"));

test("capas.json: procedencias válidas, ningún nodo repetido dentro de un mundo y las copias entre mundos son las declaradas", () => {
  const proc = new Set(CAPAS.procedencias);
  assert.deepStrictEqual([...proc].sort(), ["auxiliar", "deducido", "ilustrativo", "medido"]);
  const porMundo = {};
  for (const [mundo, m] of Object.entries(CAPAS.mundos)) {
    const nombres = [];
    for (const [p, ns] of listas(m)) { assert.ok(proc.has(p), mundo + ": procedencia desconocida " + p); nombres.push(...ns); }
    assert.strictEqual(new Set(nombres).size, nombres.length, mundo + ": un nodo aparece dos veces");
    porMundo[mundo] = new Set(nombres);
    for (const [col, ns] of Object.entries(m._colecciones || {})) {
      assert.match(col, /^[A-Z_]+$/);
      for (const n of ns) assert.ok(porMundo[mundo].has(n), mundo + "/" + col + ": " + n + " no está en el mundo");
    }
  }
  const comunes = [...porMundo.fabrica].filter(n => porMundo.patios.has(n)).sort();
  const copias = Object.values(CAPAS.mundos.patios._colecciones || {}).flat().sort();
  assert.deepStrictEqual(comunes, copias, "un nodo está en dos mundos sin declararse como copia en _colecciones");
  assert.ok([...porMundo.patios].filter(n => !copias.includes(n)).every(n => n.startsWith("patio_")), "en patios solo van los patio_* y las copias");
});

test("capas.json: la limpieza solo aparta grumos de objetos medidos de la fábrica y con topes pequeños", () => {
  const l = CAPAS.limpieza, medidos = new Set(CAPAS.mundos.fabrica.medido);
  for (const n of l.objetos) assert.ok(medidos.has(n), n + " no es escaneo");
  assert.ok(!l.objetos.includes("maquinaria") && !l.objetos.includes("escombro"));
  assert.ok(l.caras_max <= 100 && l.diagonal_max_m <= 0.5 && l.soldadura_m <= 0.001);
});

test("nombraImagenes: nombre por material y ranura, sin acentos, único y determinista", async () => {
  const { nombraImagenes, limpia } = await import(pathToFileURL(path.join(DIR, "nombres.mjs")).href);
  const mats = [
    { nombre: "madera", ranuras: { baseColorTexture: 0, normalTexture: 1, metallicRoughnessTexture: 2, occlusionTexture: 2 } },
    { nombre: "teja ñá", ranuras: { baseColorTexture: 3 } },
    { nombre: "madera", ranuras: { baseColorTexture: 4 } },
    { nombre: "otra", ranuras: { baseColorTexture: 0 } }
  ];
  const r = nombraImagenes(mats, 6);
  assert.deepStrictEqual(r, ["madera_color", "madera_normal", "madera_orm", "teja_na_color", "madera_color_2", "imagen_05"]);
  assert.deepStrictEqual(nombraImagenes(mats, 6), r);
  assert.strictEqual(limpia("Á b/c"), "A_b_c");
});

test("los guiones de Blender y Node no llevan rutas locales y las dependencias van con versión fijada", () => {
  const fich = fs.readdirSync(DIR).filter(f => /\.(py|mjs)$/.test(f));
  for (const f of ["descomprime.mjs", "separa.py", "prepara.py", "hornea.py", "planta.py", "puertas.py", "vista.py", "obra.py", "luces.py"]) assert.ok(fich.includes(f), "falta " + f);
  for (const f of fich) {
    const s = fs.readFileSync(path.join(DIR, f), "utf8");
    assert.doesNotMatch(s, /[A-Za-z]:\\?Users|\/Users\/|AppData/, f + " lleva una ruta local");
    if (f.endsWith(".py")) assert.match(s, /sys\.argv\.index\("--"\)/, f + " debe leer sus argumentos tras «--»");
  }
  const pkg = JSON.parse(lee("tuberia/interiores/blender/package.json"));
  for (const [n, v] of Object.entries(pkg.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, n + " sin versión fijada");
  assert.ok(fs.existsSync(path.join(DIR, "README.md")));
});

test("la obra y la luz interior son ilustrativas, no tocan lo medido y sus efectos no se hornean (regla 5)", () => {
  const obra = lee("tuberia/interiores/blender/obra.py"), luces = lee("tuberia/interiores/blender/luces.py");
  // la obra se niega ante un objeto medido en las dos operaciones que cambian mallas, y lo que quita va a DESCARTES
  for (const op of ["aparta", "abre"]) {
    const cuerpo = obra.slice(obra.indexOf("def " + op + "(op):")).split("\n").slice(0, 3).join("\n");
    assert.ok(cuerpo.includes("no_medido(o)"), op + " debe empezar por no_medido(o)");
  }
  assert.match(obra, /gemelo_procedencia"\) == "medido"[\s\S]{0,80}raise SystemExit/);
  assert.ok(obra.includes('coleccion("DESCARTES")') && obra.includes('o["gemelo_procedencia"] = "ilustrativo"'));
  // la luz interior: el escaneo deja de dar sombra (no se abre ni se borra) y todo lo creado se marca ilustrativo
  assert.ok(luces.includes('link_state = "EXCLUDE"'));
  assert.doesNotMatch(luces, /bmesh\.ops\.delete/, "luces.py no borra geometría del mundo");
  assert.ok(luces.split('["gemelo_procedencia"] = "ilustrativo"').length - 1 >= 3);
  assert.ok(luces.includes('esc["gemelo_luz_interior"] = "ilustrativa'));
  // los haces (colección EFECTOS) no se hornean ni reciben UV de luz
  for (const g of ["hornea.py", "prepara.py"]) assert.ok(lee("tuberia/interiores/blender/" + g).includes('("AUXILIAR", "DESCARTES", "EFECTOS")'), g + " debe dejar fuera EFECTOS");
  // el sol dice de dónde sale su orientación
  assert.ok(lee("tuberia/interiores/blender/prepara.py").includes("gemelo_sol_nota"));
});

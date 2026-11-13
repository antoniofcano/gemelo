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
  for (const f of ["descomprime.mjs", "separa.py", "prepara.py", "hornea.py", "planta.py", "puertas.py", "vista.py", "obra.py", "luces.py", "envejece.py", "texturas.py", "cuenta.py", "recuento.py", "sol.mjs", "exporta.py", "exporta.mjs"]) assert.ok(fich.includes(f), "falta " + f);
  for (const f of fich) {
    const s = fs.readFileSync(path.join(DIR, f), "utf8");
    assert.doesNotMatch(s, /[A-Za-z]:\\?Users|\/Users\/|AppData/, f + " lleva una ruta local");
    if (f.endsWith(".py") && f !== "recuento.py") assert.match(s, /sys\.argv\.index\("--"\)/, f + " debe leer sus argumentos tras «--»");
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

const SIN_SUNCALC = !fs.existsSync(path.join(DIR, "node_modules", "suncalc")) && "sin `npm ci` en tuberia/interiores/blender";
if (SIN_SUNCALC) console.warn("AVISO interiores_blender: se salta la prueba del sol (" + SIN_SUNCALC + ")");
test("sol.mjs: el sol sale de una efeméride (suncalc) y el norte de la planta gira el azimut", { skip: SIN_SUNCALC }, async () => {
  const { sol } = await import(pathToFileURL(path.join(DIR, "sol.mjs")).href);
  // mediodía solar del solsticio de verano en el ecuador y el meridiano 0: el sol pasa por el norte, a 90 − 23,44 grados
  const s = sol(0, 0, new Date("2026-06-21T12:02:00Z"));
  assert.ok(Math.abs(s.elevacion - 66.56) < 0.5, "elevación " + s.elevacion);
  assert.ok(s.azimut_geografico < 5 || s.azimut_geografico > 355, "azimut " + s.azimut_geografico);
  // con el norte de la planta a 180 grados, el azimut en planta es el geográfico más 180
  const g = sol(40, -4, new Date("2026-11-12T15:00:00Z")), p = sol(40, -4, new Date("2026-11-12T15:00:00Z"), 180);
  assert.ok(g.azimut_geografico > 180 && g.azimut_geografico < 270 && g.elevacion > 0 && g.elevacion < 40);
  assert.ok(Math.abs(p.azimut_en_planta - (g.azimut_geografico + 180) % 360) < 0.01);
});

test("lo que envejece y la vegetación son ilustrativos y baratos de exportar (color de vértice y recorte de alfa)", () => {
  const env = lee("tuberia/interiores/blender/envejece.py"), obra = lee("tuberia/interiores/blender/obra.py");
  assert.match(env, /gemelo_procedencia"\) == "medido"[\s\S]{0,80}raise SystemExit/, "envejece.py no toca lo medido");
  assert.ok(env.includes('color_attributes.get("Color")') && !/bmesh|ShaderNode/.test(env), "envejece.py solo escribe el color de vértice");
  assert.ok(obra.includes('"GREATER_THAN"') && obra.includes('m["gemelo_alfa"]'), "las tarjetas van con alfa recortado, no mezclado");
  // un solo modo de contar: separa.py y cuenta.py usan recuento.py
  for (const g of ["separa.py", "cuenta.py"]) assert.match(lee("tuberia/interiores/blender/" + g), /from recuento import recuento/);
});

test("la exportación cumple el contrato por construcción: luz en el color base, sin compresión y sin tocar lo medido", () => {
  const py = lee("tuberia/interiores/blender/exporta.py"), mjs = lee("tuberia/interiores/blender/exporta.mjs");
  assert.match(py, /gemelo_procedencia"\) == "medido"[\s\S]{0,80}raise SystemExit/, "exporta.py no simplifica lo medido");
  assert.ok(py.includes('("AUXILIAR", "DESCARTES", "EFECTOS")'), "los efectos y los descartes no se exportan");
  assert.ok(py.includes('"export_lights": False') && py.includes('"export_cameras": False'), "sin luces ni cámaras");
  assert.doesNotMatch(py, /draco_mesh_compression_enable"\s*:\s*True|meshopt|ktx|basisu|webp/i, "nada que pida un decodificador (contrato v1)");
  assert.ok(mjs.includes("KHR_materials_unlit") && !/draco|meshopt|KHRTextureBasisu|EXTTextureWebP/i.test(mjs.replace(/\/\/.*$/gm, "")), "el remate solo añade unlit");
  // el origen sale del manifiesto y es el umbral de la puerta principal; las zonas, de la cota medida del suelo
  assert.ok(py.includes('pl["origen"]') && py.includes("suelo_en("));
  // el horneado largo se puede reanudar objeto a objeto
  assert.ok(lee("tuberia/interiores/blender/hornea.py").includes('"reanuda"'));
});

test("una capa medida se puede dejar de enseñar, pero no tocar: «descarta» mueve objetos enteros a DESCARTES sin abrir su malla", () => {
  const obra = lee("tuberia/interiores/blender/obra.py");
  const cuerpo = obra.slice(obra.indexOf("def descarta(op):"), obra.indexOf("def srgb(c):"));
  assert.ok(cuerpo.length > 100 && cuerpo.includes('coleccion("DESCARTES")') && cuerpo.includes("hide_render = True"));
  assert.doesNotMatch(cuerpo, /bmesh|to_mesh|from_mesh|\.remove\(o|objects\.remove/, "descarta no edita ni borra mallas");
  // lo que «abre» y «aparta» quitan tampoco se borra: pasa por a_descartes
  const fin = { aparta: "def abre(op):", abre: "def descarta(op):" };
  for (const op of ["aparta", "abre"]) {
    const c = obra.slice(obra.indexOf("def " + op + "(op):"), obra.indexOf(fin[op]));
    assert.ok(c.includes("a_descartes(o, bm,"), op + " deja lo quitado en DESCARTES");
  }
});

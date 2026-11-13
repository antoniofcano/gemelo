"use strict";
// Base de los interiores en Blender (eje B, tuberia/interiores/blender/): capas.json reparte cada nodo del glb en un mundo con su
// procedencia (regla 5), las copias entre mundos son solo las declaradas, la limpieza solo toca escaneo; los nombres de las texturas
// descomprimidas son legibles, únicos y deterministas; los guiones no llevan rutas locales y las dependencias van con versión fijada
// (regla 12). Solo Node: no abre Blender ni lee los modelos (son privados, decisión 227).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, lee, fs, path, python, ejecuta, propia } = require("./_util");
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
  for (const f of ["descomprime.mjs", "separa.py", "prepara.py", "hornea.py", "planta.py", "puertas.py", "vista.py", "obra.py", "luces.py", "envejece.py", "texturas.py", "cuenta.py", "recuento.py", "sol.mjs", "exporta.py", "exporta.mjs", "inventario.py", "piezas.py"]) assert.ok(fich.includes(f), "falta " + f);
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

test("inventario.py: trabaja sobre una copia, reusa la búsqueda de trozos de recuento.py, no hornea y escribe lo documentado", () => {
  const inv = lee("tuberia/interiores/blender/inventario.py"), sep = lee("tuberia/interiores/blender/separa.py"), rec = lee("tuberia/interiores/blender/recuento.py");
  // una sola búsqueda de trozos sueltos (regla 12): la usan separa.py (grumos) e inventario.py (piezas)
  assert.ok(rec.includes("def trozos(me, soldadura):"));
  assert.match(sep, /from recuento import [^\n]*\btrozos\b/); assert.match(inv, /from recuento import trozos/);
  assert.ok(inv.includes("import piezas") && inv.includes("piezas.inventario("), "el agrupado vive en piezas.py (Python puro, probado aquí)");
  // nunca guarda encima del .blend abierto, y sin --guarda no guarda nada
  assert.match(inv, /os\.path\.abspath\(a\["guarda"\]\) == abierto[\s\S]{0,40}raise SystemExit/);
  assert.strictEqual((inv.match(/save_as_mainfile/g) || []).length, 1); assert.match(inv, /if a\["guarda"\]:\s*\n\s*bpy\.ops\.wm\.save_as_mainfile/);
  // renders rápidos (Workbench): ni Cycles ni horneado
  assert.ok(inv.includes('"BLENDER_WORKBENCH"')); assert.doesNotMatch(inv, /CYCLES|bake\(/);
  for (const f of ["trozos.json", "inventario.json", "inventario.medida.json", "vista_planta", "conjunto_%s.png"]) assert.ok(inv.includes(f), "falta " + f);
  // la pieza separada sigue siendo ilustrativa (regla 5)
  assert.ok(inv.includes('ob["gemelo_procedencia"] = "ilustrativo"'));
});

const PY = python();
test("piezas.py: agrupa los trozos con el criterio documentado y escribe el inventario en el marco del mundo", { skip: !PY && "sin Python 3" }, () => {
  const d = propia("inventario-piezas");
  const t = (id, min, max, tri, toca, mats) => ({ id, caras: tri, triangulos: tri, min, max, materiales: mats || ["hierro"], toca });
  const datos = { objeto: "maquinaria_rec", origen_blender: [-5, -7, 0], soldadura_m: 0.0005, toque_m: 0.01, trozos: [
    t(0, [0, 0, 0], [2, 2, 1], 500, [1, 2, 3], ["piedra"]),     // cuba (grande)
    t(1, [0.5, 0.5, 1], [1.5, 1, 2.2], 400, [0, 2, 4], ["piedra"]), // rulo (grande, toca la cuba: NO se junta)
    t(2, [1, 0.9, 1.5], [1.05, 0.95, 1.55], 12, [0, 1, 3]),    // tuerca entre cuba y rulo → con el mayor que toca (la cuba)
    t(3, [1.04, 0.9, 1.5], [1.09, 0.95, 1.55], 8, [2]),         // arandela que solo toca la tuerca → con su racimo
    t(4, [1.4, 0.95, 2.1], [1.45, 1, 2.15], 6, [1]),            // chaveta del rulo → con el rulo
    t(5, [10, 10, 1], [10.1, 10.05, 1.1], 30, [6], ["lata"]),   // dos latas que se tocan, solas: una pieza
    t(6, [10.1, 10, 1], [10.2, 10.05, 1.1], 30, [5], ["lata"]),
    t(7, [20, 20, 0], [20.1, 20.1, 0.1], 4, [])                 // tornillo suelto: pieza propia
  ] };
  fs.writeFileSync(path.join(d, "trozos.json"), JSON.stringify(datos));
  const r = ejecuta(PY, ["-I", path.join(DIR, "piezas.py"), "--", path.join(d, "trozos.json"), path.join(d, "inventario.json"), "--pequeno", "0.25"]);
  assert.strictEqual(r.status, 0, r.stderr);
  const inv = JSON.parse(fs.readFileSync(path.join(d, "inventario.json"), "utf8"));
  assert.deepStrictEqual(Object.keys(inv).sort(), ["conjuntos", "criterio", "marco", "objeto", "origen_blender", "piezas", "triangulos", "trozos", "v"]);
  assert.strictEqual(inv.v, 1); assert.strictEqual(inv.trozos, 8); assert.strictEqual(inv.triangulos, 990);
  assert.deepStrictEqual(inv.piezas.map(p => p.ids_trozo), [[0, 2, 3], [1, 4], [5, 6], [7]], "agrupado y numeración por diagonal");
  assert.strictEqual(inv.piezas.reduce((s, p) => s + p.triangulos, 0), inv.triangulos, "ningún triángulo se pierde ni se repite");
  for (const [i, p] of inv.piezas.entries()) {
    assert.strictEqual(p.id, "p" + String(i + 1).padStart(3, "0")); assert.strictEqual(p.n, i + 1);
    for (const k of ["id", "n", "conjunto", "triangulos", "caras", "trozos", "caja", "caja_blender", "materiales", "ids_trozo"]) assert.ok(k in p, "falta " + k);
    assert.strictEqual(p.caja.centro.length, 3); assert.ok(p.caja.tamano.every(v => v >= 0));
  }
  // marco del mundo: (x − ox, z − oz, −(y − oy)); tamaños (dx, dz, dy)
  assert.deepStrictEqual(inv.piezas[0].caja, { centro: [6, 0.775, -8], tamano: [2, 1.55, 2] });
  assert.deepStrictEqual(inv.piezas[0].materiales, ["hierro", "piedra"]);
  // conjuntos: el rulo y la cuba se tocan (una máquina, dos piezas); las latas y el tornillo suelto van aparte
  assert.deepStrictEqual(inv.conjuntos.map(c => c.piezas), [["p001", "p002"], ["p003"], ["p004"]]);
  assert.deepStrictEqual(inv.piezas.map(p => p.conjunto), ["C01", "C01", "C02", "C03"]);
  assert.strictEqual(inv.conjuntos.reduce((s, c) => s + c.triangulos, 0), inv.triangulos);
  for (const c of inv.conjuntos) for (const k of ["id", "n", "piezas", "puente", "triangulos", "caja", "caja_blender", "materiales"]) assert.ok(k in c, "conjunto sin " + k);
  // una correa (cuero) toca dos máquinas sin unirlas: es un conjunto propio, marcado como puente
  const d2 = JSON.parse(JSON.stringify(datos));
  d2.trozos.push(t(8, [1.9, 0.9, 0], [1.95, 0.95, 4], 40, [0, 9], ["m_cuero"]), t(9, [1.8, 0.8, 4], [2.6, 1.6, 4.5], 50, [8]));
  d2.trozos.push(t(10, [0, 0, 1], [0.5, 0.5, 1], 1, [0]));     // un triángulo suelto de una tapa (medio metro): va con la cuba
  d2.trozos[0].toca.push(8, 10);
  fs.writeFileSync(path.join(d, "trozos2.json"), JSON.stringify(d2));
  assert.strictEqual(ejecuta(PY, ["-I", path.join(DIR, "piezas.py"), "--", path.join(d, "trozos2.json"), path.join(d, "inv2.json")]).status, 0);
  const inv2 = JSON.parse(fs.readFileSync(path.join(d, "inv2.json"), "utf8"));
  const correa = inv2.conjuntos.find(c => c.materiales.includes("m_cuero"));
  assert.ok(correa.puente && correa.piezas.length === 1, "la correa es su propio conjunto");
  assert.strictEqual(inv2.conjuntos.filter(c => c.piezas.length > 1).length, 1, "la correa no junta la polea de arriba con la cuba");
  assert.ok(inv2.piezas.find(p => p.ids_trozo.includes(0)).ids_trozo.includes(10), "un triángulo suelto va con lo que toca aunque sea grande");
  assert.doesNotMatch(JSON.stringify(inv), /[A-Za-z]:[\\/]|\/Users\/|AppData/, "el inventario no lleva rutas");
});

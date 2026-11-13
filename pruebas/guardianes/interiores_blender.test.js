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
  for (const f of ["descomprime.mjs", "separa.py", "prepara.py", "hornea.py", "planta.py", "puertas.py", "vista.py", "obra.py", "luces.py", "envejece.py", "texturas.py", "cuenta.py", "recuento.py", "sol.mjs", "exporta.py", "exporta.mjs", "inventario.py", "piezas.py", "maquinas.py", "maquinas_def.py", "sonda.py"]) assert.ok(fich.includes(f), "falta " + f);
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
  // v1.1: las paradas y las fuentes de la visita pasan de la plantilla al mundo.json, sin las notas «_…» de quien la escribe
  assert.match(py, /for k in \("paradas", "fuentes"\):[\s\S]{0,200}m\[k\] = sin_notas\(pl\[k\]\)/, "exporta.py copia paradas y fuentes");
  assert.match(py, /def sin_notas\(v\):[\s\S]{0,300}not k\.startswith\("_"\)/, "sin las claves «_…»");
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

// ---- fábrica 1.1: máquinas con eje y luz aparte (contrato mundo-interior v1.2, ADR-0034) ----
test("maquinas_def.py: piezas por máquina, pivote y eje en el marco del mundo, rodadura, poleas, correas, padres y ciclos; maquinas[] cumple el esquema", { skip: !PY && "sin Python 3" }, () => {
  const d = propia("maquinas-def");
  const caja = (c, t) => ({ centro: c, tamano: t });
  const pz = (id, c, t, mats) => ({ id, conjunto: "C01", triangulos: 10, caja: caja(c, t), materiales: mats || ["m_hierro"] });
  const inv = { origen_blender: [-5, -7, 0], piezas: [
    pz("p001", [0, 3, -2], [0.1, 4, 0.1]),           // eje vertical
    pz("p002", [0.7, 1.5, -2], [0.3, 1.0, 1.0], ["piedra"]),  // rulo: radio 0,5, a 0,7 m del eje
    pz("p003", [2, 5, -2], [6, 0.1, 0.1]),           // eje del techo (por x)
    pz("p004", [1, 5, -2], [0.1, 1.0, 1.0]),         // polea grande del techo (radio 0,5)
    pz("p005", [1, 0.5, -4], [0.2, 0.2, 0.2]),       // polea del motor (radio 0,1)
    pz("p006", [1, 2.7, -3], [0.1, 4.5, 2], ["m_cuero"]),  // correa
    pz("p007", [5, 0.5, -5], [1, 1, 1])              // lo fijo
  ] };
  const ident = { grupos: { eje: { piezas: ["p001"], caja: caja([0, 3, -2], [0.1, 4, 0.1]) }, rulo: { piezas: ["p002"], caja: caja([0.7, 1.5, -2], [0.3, 1, 1]) },
    techo: { piezas: ["p003", "p004"], caja: caja([2, 5, -2], [6, 1, 1]) } } };
  const conf = { maquinas: [
    { id: "motor", piezas: ["p005"], tipo: "giro", eje: "x", velocidad: 240, luz: "propia" },
    { id: "techo", grupos: ["techo"], tipo: "giro", eje: "x", pivote: "centro:techo", relacion: { con: "motor", factor: { radios: ["p005", "p004"] } } },
    { id: "molino", grupos: ["eje"], tipo: "giro", eje: "y", relacion: { con: "techo", factor: 0.5, signo: -1 } },
    { id: "rulo", grupos: ["rulo"], padre: "molino", tipo: "giro", eje: "radial:molino", relacion: { con: "molino", factor: "rodadura" } },
    { id: "correa", piezas: ["p006"], tipo: "textura", relacion: { con: "motor", factor: { correa: "p005" } }, luz: "horneada", fuente: "deducido" },
    { id: "nueva", objetos: ["correa_propia_1"], tipo: "textura", material: "m_cuero", relacion: { con: "molino", factor: { correa_radio: 0.45 } }, luz: "horneada" }
  ] };
  const w = (n, o) => fs.writeFileSync(path.join(d, n), JSON.stringify(o));
  w("ident.json", ident); w("inv.json", inv); w("conf.json", conf);
  const corre = (c) => { w("conf.json", c); return ejecuta(PY, ["-I", path.join(DIR, "maquinas_def.py"), "--", ...["ident.json", "inv.json", "conf.json", "plan.json"].map(f => path.join(d, f))]); };
  let r = corre(conf);
  assert.strictEqual(r.status, 1, "sin las medidas de la correa no hay plan"); assert.match(r.stdout, /falta la medida uv_por_metro/);
  const c2 = JSON.parse(JSON.stringify(conf)); c2.maquinas[4].uv_por_metro = 2; c2.maquinas[5].uv_por_metro = 2.5;
  r = corre(c2); assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const plan = JSON.parse(fs.readFileSync(path.join(d, "plan.json"), "utf8")), q = id => plan.maquinas.find(x => x.id === id);
  assert.deepStrictEqual(plan.fijas, ["p007"]);
  assert.deepStrictEqual(q("techo").pivote, [2, 5, -2]); assert.deepStrictEqual(q("techo").pivote_blender, [-3, -5, 5], "(x + ox, oy − z, y + oz)");
  assert.deepStrictEqual(q("techo").relacion, { con: "motor", factor: 0.2 }, "poleas: r(motriz) / r(movida)");
  assert.deepStrictEqual(q("molino").relacion, { con: "techo", factor: -0.5 });
  assert.deepStrictEqual(q("rulo").eje, [1, 0, 0], "radial: del eje del padre hacia el rulo, en planta");
  assert.deepStrictEqual(q("rulo").relacion, { con: "molino", factor: -1.4 }, "rodadura: −R / r = −0,7 / 0,5");
  assert.strictEqual(q("correa").relacion.factor, Math.round(2 * Math.PI * 0.1 / 60 * 2 * 1e4) / 1e4, "correa: 2πr/60 × UV por metro");
  assert.strictEqual(q("correa").material, "m_cuero__maq_correa"); assert.strictEqual(q("rulo").nodo, "maq_rulo"); assert.strictEqual(q("rulo").padre, "molino");
  assert.deepStrictEqual(q("nueva").objetos, ["correa_propia_1"]); assert.strictEqual(q("nueva").relacion.factor, Math.round(2 * Math.PI * 0.45 / 60 * 2.5 * 1e4) / 1e4);
  assert.strictEqual(q("motor").luz, "propia"); assert.strictEqual(q("correa").fuente, "deducido"); assert.strictEqual(q("techo").fuente, "ilustrativo");
  // el manifiesto que sale (maquinas_def.manifiesto) cumple $defs.maquina del contrato
  const sal = ejecuta(PY, ["-I", "-c", "import json,sys; sys.path.insert(0, sys.argv[1]); import maquinas_def as m; print(json.dumps(m.manifiesto(json.load(open(sys.argv[2], encoding='utf-8')))))", DIR, path.join(d, "plan.json")]);
  assert.strictEqual(sal.status, 0, sal.stderr);
  const Ajv2020 = require("ajv/dist/2020").default, esq = JSON.parse(lee("contratos/mundo-interior.schema.json"));
  const v = new Ajv2020({ strict: true }).addSchema(esq).getSchema(esq.$id + "#/$defs/maquina");
  for (const m of JSON.parse(sal.stdout)) assert.ok(v(m), m.id + ": " + JSON.stringify(v.errors));
  // errores: una pieza en dos máquinas, un ciclo de relaciones, un grupo que no existe
  const c3 = JSON.parse(JSON.stringify(c2)); c3.maquinas[2].grupos = ["eje", "rulo"];
  assert.match(corre(c3).stdout, /la pieza p002 ya es de molino/);
  const c4 = JSON.parse(JSON.stringify(c2)); delete c4.maquinas[0].velocidad; c4.maquinas[0].relacion = { con: "techo", factor: 1 };
  assert.match(corre(c4).stdout, /relacion forma un ciclo/);
  const c5 = JSON.parse(JSON.stringify(c2)); c5.maquinas[1].grupos = ["no_esta"];
  assert.match(corre(c5).stdout, /grupo desconocido no_esta/);
  assert.doesNotMatch(fs.readFileSync(path.join(d, "plan.json"), "utf8"), /[A-Za-z]:[\\/]|\/Users\/|AppData/, "el plan no lleva rutas");
});

test("sonda.py: los armónicos esféricos de three (orden, base y escala 4π) desde caras de cubo, en el marco del glb", { skip: !PY && "sin Python 3" }, () => {
  const d = propia("sonda"), n = 8, m = [], m2 = [];
  const caras = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const c of caras) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = 2 * (i + 0.5) / n - 1, y = 2 * (j + 0.5) / n - 1, p = 1 / Math.pow(x * x + y * y + 1, 1.5);
    // una dirección cualquiera de la cara (la base de la cara no importa para una luz constante ni para «arriba»)
    const k = c.findIndex(v => v !== 0), dir = [0, 0, 0]; dir[k] = c[k]; dir[(k + 1) % 3] = x; dir[(k + 2) % 3] = y;
    m.push([dir, [1, 1, 1], p]);
    const arriba = dir[2] / Math.hypot(...dir);   // Z de Blender = Y del glb
    m2.push([dir, [Math.max(0, arriba), 0, 0], p]);
  }
  fs.writeFileSync(path.join(d, "m.json"), JSON.stringify(m)); fs.writeFileSync(path.join(d, "m2.json"), JSON.stringify(m2));
  for (const f of ["m", "m2"]) assert.strictEqual(ejecuta(PY, ["-I", path.join(DIR, "sonda.py"), "--", path.join(d, f + ".json"), path.join(d, f + ".sh.json")]).status, 0);
  const sh = JSON.parse(fs.readFileSync(path.join(d, "m.sh.json"), "utf8")), sh2 = JSON.parse(fs.readFileSync(path.join(d, "m2.sh.json"), "utf8"));
  assert.strictEqual(sh.length, 9); assert.ok(Math.abs(sh[0][0] - 0.282095 * 4 * Math.PI) < 1e-3, "luz constante: L00 = 0,282095 × 4π");
  for (let i = 1; i < 9; i++) assert.ok(Math.abs(sh[i][0]) < 0.02, "luz constante: el resto, cero (" + i + ": " + sh[i][0] + ")");
  assert.ok(sh2[1][0] > 0.5 && Math.abs(sh2[2][0]) < 0.05 && Math.abs(sh2[3][0]) < 0.05, "la luz de arriba (Z de Blender) es +Y en el glb: L1-1 (y) positivo");
  assert.strictEqual(sh2[0][1], 0, "solo el canal rojo");
});

const SIN_GLTF_TUBERIA = !fs.existsSync(path.join(DIR, "node_modules", "@gltf-transform", "core")) && "sin `npm ci` en tuberia/interiores/blender";
test("exporta.mjs --luz: el mapa RGB en occlusionTexture con texCoord 1, unlit salvo la luz propia, y COLOR_0 se queda", { skip: SIN_GLTF_TUBERIA }, async () => {
  const { remata } = await import(pathToFileURL(path.join(DIR, "exporta.mjs")).href);
  const { Document, NodeIO } = require(path.join(DIR, "node_modules", "@gltf-transform", "core"));
  const doc = new Document(), buf = doc.createBuffer();
  const prim = mat => doc.createPrimitive().setMaterial(mat)
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buf))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(6)).setBuffer(buf))
    .setAttribute("TEXCOORD_1", doc.createAccessor().setType("VEC2").setArray(new Float32Array(6)).setBuffer(buf))
    .setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(new Float32Array(12).fill(1)).setBuffer(buf));
  const fijo = doc.createMaterial("cal__muros"), propia = doc.createMaterial("m_hierro__maquinaria_propia").setMetallicFactor(0.7);
  const esc = doc.createScene();
  for (const m of [fijo, propia]) esc.addChild(doc.createNode(m.getName()).setMesh(doc.createMesh().addPrimitive(prim(m))));
  const bytes = await new NodeIO().writeBinary(doc), jpeg = new Uint8Array(await require(path.join(DIR, "node_modules", "sharp"))({ create: { width: 2, height: 2, channels: 3, background: "#808080" } }).jpeg().toBuffer());
  const { bytes: sal, resumen } = await remata(bytes, { "cal__muros": { mapa: "_texturas/muros_luz_quest.jpg", unlit: true }, "m_hierro__maquinaria_propia": { mapa: "_texturas/maquinaria_ao_quest.jpg", unlit: false } }, () => jpeg);
  assert.strictEqual(resumen.mapas, 2); assert.deepStrictEqual(resumen.con_luz, ["m_hierro__maquinaria_propia"]);
  const { KHRMaterialsUnlit } = require(path.join(DIR, "node_modules", "@gltf-transform", "extensions"));
  const d2 = await new NodeIO().registerExtensions([KHRMaterialsUnlit]).readBinary(sal), mats = Object.fromEntries(d2.getRoot().listMaterials().map(m => [m.getName(), m]));
  for (const m of Object.values(mats)) { assert.strictEqual(m.getOcclusionTextureInfo().getTexCoord(), 1, m.getName()); assert.strictEqual(m.getOcclusionTexture().getMimeType(), "image/jpeg"); }
  assert.ok(mats["cal__muros"].getExtension("KHR_materials_unlit"), "lo fijo, sin luz"); assert.ok(!mats["m_hierro__maquinaria_propia"].getExtension("KHR_materials_unlit"), "la luz propia, con luz");
  assert.strictEqual(mats["m_hierro__maquinaria_propia"].getMetallicFactor(), 0.7, "guarda su metal");
  assert.ok(d2.getRoot().listMeshes().every(me => me.listPrimitives().every(p => p.getAttribute("COLOR_0"))), "COLOR_0 (el envejecido) se queda");
});

test("exporta.mjs: dos correas iguales conservan cada una su material (base__maq_<id>); lo demás igual se junta", { skip: SIN_GLTF_TUBERIA }, async () => {
  const { remata } = await import(pathToFileURL(path.join(DIR, "exporta.mjs")).href);
  const { Document, NodeIO } = require(path.join(DIR, "node_modules", "@gltf-transform", "core"));
  const doc = new Document(), buf = doc.createBuffer(), esc = doc.createScene();
  const nombres = ["m_cuero__maq_correa_a", "m_cuero__maq_correa_b", "cal__uno", "cal__dos"];
  for (const n of nombres) {
    const p = doc.createPrimitive().setMaterial(doc.createMaterial(n).setBaseColorFactor([0.5, 0.4, 0.3, 1]))
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buf));
    esc.addChild(doc.createNode(n).setMesh(doc.createMesh().addPrimitive(p)));
  }
  const { bytes: sal } = await remata(await new NodeIO().writeBinary(doc), null, () => null);
  const quedan = (await new NodeIO().readBinary(sal)).getRoot().listMaterials().map(m => m.getName());
  for (const n of ["m_cuero__maq_correa_a", "m_cuero__maq_correa_b"]) assert.ok(quedan.includes(n), n + " se perdió en dedup (la correa no correría por su cuenta)");
  assert.strictEqual(quedan.filter(n => n.startsWith("cal__")).length, 1, "los materiales iguales que no son de máquina sí se juntan");
});

test("la tubería de la 1.1 por construcción: copia, nada se borra, horneado aparte reanudable, sonda, mapa en el UV «luz» y vagoneta apagada", () => {
  const maq = lee("tuberia/interiores/blender/maquinas.py"), hor = lee("tuberia/interiores/blender/hornea.py"), exp = lee("tuberia/interiores/blender/exporta.py");
  assert.match(maq, /os\.path\.abspath\(a\["guarda"\]\) == abierto[\s\S]{0,40}raise SystemExit/, "maquinas.py no guarda encima del abierto");
  assert.doesNotMatch(maq, /objects\.remove\(|meshes\.remove\(o|bmesh\.ops\.delete/, "maquinas.py no borra: aparta a DESCARTES");
  assert.ok(maq.includes("import maquinas_def") && maq.includes("maquinas_def.resuelve("), "el plan sale de maquinas_def.py (Python puro, probado aquí)");
  assert.ok(maq.includes('if not op.get("activa") or not op.get("tamano"):'), "la vagoneta de la prensa de viga está preparada y apagada sin tamaño");
  assert.ok(maq.includes("def correas_propias(") && maq.includes("[SUPUESTO]"), "las correas propias del grupo hidráulico dicen que sus medidas son supuestas");
  assert.ok(maq.includes('o["gemelo_procedencia"] = "ilustrativo"'), "lo nuevo es ilustrativo (regla 5)");
  assert.ok(hor.includes('"modo": "color"') && hor.includes("def principal_aparte(a):") && hor.includes('a["reanuda"] and o.name in informe["objetos"]'), "hornea.py: modo aparte reanudable");
  assert.ok(hor.includes('bpy.ops.object.bake(type="AO"') && hor.includes("solo(o, {o.name})"), "la oclusión de una máquina con luz propia es solo la suya");
  assert.ok(hor.includes("import sonda as _sonda") && hor.includes("_sonda.sh9("), "la sonda sale de sonda.py");
  assert.ok(exp.includes('"glTF Material Output"') && exp.includes("UV_LUZ") && exp.includes("luz_aparte.json"), "exporta.py: el mapa en la ranura de oclusión sobre el UV «luz»");
  assert.ok(exp.includes("maquinas_def.manifiesto(") && exp.includes('man["luz"] = {"modo": "mapa"'), "exporta.py escribe luz y maquinas[] en el manifiesto");
  assert.ok(exp.includes('if o.parent is None or o.parent.name not in nombres:'), "solo se mueven las raíces al origen (lo que cuelga va con su padre)");
  // las ranuras de material vuelven tras separar (Blender 5 las quitaba)
  assert.ok(lee("tuberia/interiores/blender/inventario.py").includes("for x in originales:"));
  // el README cuenta los pasos nuevos
  const rd = lee("tuberia/interiores/blender/README.md");
  for (const f of ["maquinas.py", "maquinas_def.py", "sonda.py", "--modo aparte"]) assert.ok(rd.includes(f), "el README no cuenta " + f);
});

"use strict";
// AV4 (ADR-0025): el creador por piezas, en Node y sin Blender ni Chrome. Contrato `avatares` v2 (esquema, ejemplo sintético, compatibilidad con v1), la receta (en
// Aspecto de 26_presencia.js y en la api), las paletas iguales en los cuatro sitios (motor, catálogo, portada, ejemplo), el lector v2 del motor y su tinte por nombre
// de material (26b_avatares.js), la postura sentada del VRM, la lógica de la pantalla de elección (apps/web/portada/receta.js) y los criterios que se comprueban con
// máquina (C1, C2, C4, C5, C8, C9 de doc/sistema/AVATARES-FAMILIA.md). Lo que dibuja Chrome va por el banco (avatares_motor.test.js y la medida del informe).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, lee, path } = require("./_util");
const { pathToFileURL } = require("node:url");
const Ajv2020 = require("ajv/dist/2020").default;

const ESQ = JSON.parse(lee("contratos/avatares.schema.json")), V2 = JSON.parse(lee("contratos/avatares-v2-ejemplo.json")), V1 = JSON.parse(lee("contratos/avatares-ejemplo.json"));
const valida = new Ajv2020({ strict: true, allErrors: true }).compile(ESQ);
function trozo(fich, devuelve) {
  const s = lee(fich), i = s.indexOf("// [puro:inicio]"), f = s.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, fich + " debe marcar su trozo puro");
  return new Function("\"use strict\";\n" + s.slice(i, f) + "\nreturn " + devuelve + ";")();
}
const AP = trozo("apps/web/motor/26b_avatares.js", "AvataresPuro");
const { Aspecto, SalaPose } = trozo("apps/web/motor/26_presencia.js", "{ Aspecto: Aspecto, SalaPose: SalaPose }");
const imp = f => import(pathToFileURL(path.join(RAIZ, f)).href);
const hex = n => "#" + n.toString(16).padStart(6, "0");
const NEGRA = /abuel|chic[oa]s?\b|hombre|mujer|señor|niñ[oa]|masculin|femenin|\bmale\b|female/i;   // la lista negra de C9 (y lo de C8)
const copia = o => JSON.parse(JSON.stringify(o));

// ------------------------------------------------------------------------------------------------- contrato v2
test("contrato v2: el ejemplo sintético cumple el esquema, el v1 también, y uno con v: 3 no", () => {
  assert.ok(valida(V2), JSON.stringify(valida.errors));
  assert.ok(valida(V1), JSON.stringify(valida.errors));
  const raro = copia(V2); raro.v = 3; assert.ok(!valida(raro));
  const piezas = new Set(V2.piezas.map(p => p.id));
  for (const c of V2.cuerpos) for (const id of c.piezas) assert.ok(piezas.has(id), c.id + " trae " + id + ", que no está en piezas[]");
  for (const p of V2.piezas) assert.strictEqual(p.malla, "pieza_" + p.id, "la malla se llama como la pieza");
});

test("contrato v2: el esquema rechaza lo que no debe (campo de sexo o de género, edad o tipo desconocidos, sin `ofrecer`, malla sin prefijo, paletas cortas, receta de colores sin hex)", () => {
  const mal = f => { const c = copia(V2); f(c); return valida(c); };
  assert.ok(!mal(c => { c.cuerpos[0].sexo = "x"; }), "sexo"); assert.ok(!mal(c => { c.cuerpos[0].genero = "x"; }), "género");
  assert.ok(!mal(c => { c.piezas[0].sexo = "x"; }), "sexo en una pieza");
  assert.ok(!mal(c => { c.cuerpos[0].edad = "anciana"; }), "edad"); assert.ok(!mal(c => { c.piezas[0].tipo = "maquillaje"; }), "tipo");
  assert.ok(!mal(c => { delete c.cuerpos[0].ofrecer; }), "ofrecer obligatorio (decisión 132)");
  assert.ok(!mal(c => { c.piezas[0].malla = "pelo-corto"; }), "malla sin pieza_"); assert.ok(!mal(c => { c.piezas[0].malla = "pieza_pelo.corto"; }), "malla con punto");
  assert.ok(!mal(c => { c.paletas.piel.pop(); }), "10 tonos de piel (C2)"); assert.ok(!mal(c => { c.paletas.ropa[0].color = "verde"; }), "color sin hex");
  assert.ok(!mal(c => { c.piezas[0].edades = ["hombre"]; }), "edades solo por talla (C5)");
  assert.ok(!mal(c => { delete c.topes_combinacion; }), "el presupuesto de lo que se dibuja es obligatorio");
});

test("contrato v2: nombres y descripciones sin la lista negra de C9 (ni sexo ni parentesco), en el ejemplo, en el guion de Blender y en la portada", () => {
  const textos = [...V2.cuerpos.map(c => c.nombre + " " + (c.descripcion || "")), ...V2.piezas.map(p => p.nombre), ...Object.values(V2.paletas).flat().map(x => x.nombre)];
  for (const t of textos) assert.ok(!NEGRA.test(t), "«" + t + "»");
  const py = lee("tuberia/avatares/creador/cuerpos.py"), i = py.indexOf("PIEZAS = {"), bloque = py.slice(i, py.indexOf("\n}", i));
  assert.ok(!NEGRA.test(bloque), "nombres de las piezas de cuerpos.py");
  assert.ok(!/"sexo"|"genero"|"gender"\s*:/.test(bloque), "ninguna pieza tiene compatibilidad por sexo (C4, C5)");
  const r = lee("apps/web/portada/receta.js"); assert.ok(!NEGRA.test(r.replace(/\/\/.*$/gm, "")), "los textos de la pantalla de elección");
  assert.ok(!NEGRA.test(lee("apps/web/portada/index.html").slice(lee("apps/web/portada/index.html").indexOf('id="p-avatar"'), lee("apps/web/portada/index.html").indexOf('id="p-creditos"')).replace(/«chico o chica»/, "")), "el HTML de la pantalla");
});

// ------------------------------------------------------------------------------------------------- paletas: las mismas en todas partes
test("paletas: el motor (Aspecto), el catálogo (catalogo.mjs), la portada (receta.js), el ejemplo y las capturas usan los mismos colores, en el mismo orden (C13)", async () => {
  const { PALETAS: T } = await imp("tuberia/avatares/creador/catalogo.mjs"), { PALETAS: P } = await imp("apps/web/portada/receta.js");
  const col = l => l.map(x => x.color);
  assert.deepStrictEqual(col(T.piel), Aspecto.PIELES.map(hex), "piel"); assert.deepStrictEqual(col(T.ropa), Aspecto.ROPA.map(hex), "ropa"); assert.deepStrictEqual(col(T.pelo), Aspecto.PELO.map(hex), "pelo");
  assert.deepStrictEqual(P, T, "la portada"); assert.deepStrictEqual(V2.paletas, T, "el ejemplo");
  const cap = lee("tuberia/avatares/creador/capturas.py"), lista = n => JSON.parse(/\n/.test(n) ? n : n);
  for (const [k, n] of [["PIELES", "piel"], ["ROPAS", "ropa"], ["PELOS", "pelo"]]) assert.deepStrictEqual(lista(new RegExp(k + " = (\\[[^\\]]+\\])").exec(cap)[1]), col(T[n]), "capturas.py " + k);
  // C4: canas y blanco entre los colores del pelo
  assert.ok(T.pelo.some(x => x.id === "canoso") && T.pelo.some(x => x.id === "blanco"));
});

// ------------------------------------------------------------------------------------------------- la receta
test("receta en los metadatos (Aspecto.lee): cuerpo, pelo, color, vello, ropa y accesorios; lo que no cuadra, nulo; lo de AV2 no cambia; sin sexo ni género", () => {
  const m = av => SalaPose.leeInfo(JSON.stringify({ alias: "Mirlo", avatar: Object.assign({ camisa: 2, sombrero: "paja", piel: 3 }, av), rol: "hogar", dispositivo: "escritorio" })).aspecto;
  const a = m({ cuerpo: "cuerpo-adulta-media", pelo: "pelo-afro", pelo_color: 6, vello: "vello-barba", ropa: "ropa-faena", acc: ["gafas", "Malo", 7, "audifono", "b", "c"], tono: 4, movilidad: "silla" });
  assert.deepStrictEqual([a.cuerpo, a.pelo, a.peloColor, a.vello, a.ropa, a.acc, a.tono, a.movilidad], ["cuerpo-adulta-media", "pelo-afro", 6, "vello-barba", "ropa-faena", ["gafas", "audifono", "b"], 4, "silla"]);
  const b = m({ cuerpo: "../x", pelo: "Pelo", pelo_color: 10, vello: 3, ropa: "", acc: "gafas" });
  assert.deepStrictEqual([b.cuerpo, b.pelo, b.peloColor, b.vello, b.ropa, b.acc], [null, null, null, null, null, []]);
  assert.ok(!Object.keys(a).some(k => /sexo|genero/.test(k)));
  // el color del pelo del VRM: el elegido; sin elegir, repartido por el alias (ninguno «de serie»)
  const v = Aspecto.viste({ alias: "Mirlo", camisa: 0, piel: 1, aspecto: a });
  assert.strictEqual(v.pelo, Aspecto.PELO[6]); assert.strictEqual(v.receta, a);
  const sin = Aspecto.viste({ alias: "Abubilla", camisa: 0, piel: 1, aspecto: Aspecto.lee({}) });
  assert.strictEqual(sin.pelo, Aspecto.PELO[Aspecto.hash("Abubilla") % Aspecto.PELO.length]);
});

test("api: la receta pasa por limpiaAspecto con los mismos campos que lee el motor y viaja con el nombre del contrato (pelo_color)", () => {
  const ts = lee("apps/api/src/presencia/livekit.ts"), rutas = lee("apps/api/src/yo/rutas.ts"), oa = lee("contratos/api.openapi.yaml");
  for (const k of ["cuerpo", "pelo", "vello", "ropa"]) { assert.match(ts, new RegExp('"' + k + '"')); assert.match(oa, new RegExp("\\n\\s+" + k + ": \\{ type: string, pattern")); }
  assert.match(ts, /pelo_color: \{ min: 0, max: 9 \}/); assert.match(ts, /RECETA_MAX_BYTES = 200/); assert.match(rutas, /bytesReceta\(aspecto\) > RECETA_MAX_BYTES/);
  assert.match(lee("apps/web/motor/26_presencia.js"), /peloColor: ent\(av\.pelo_color, 0, 9\)/, "el motor lee pelo_color");
});

// ------------------------------------------------------------------------------------------------- el motor: lector v2, elección, piezas y tinte
test("motor: el lector v2 lee cuerpos y piezas, descarta lo que no cuadra y deja fuera de lo ofrecido a los peques; v1 sigue igual; v3, nada", () => {
  const c = AP.leeCatalogo(V2);
  assert.deepStrictEqual(c.cuerpos.map(x => x.id), ["cuerpo-ejemplo-adulta", "cuerpo-ejemplo-peque"]);
  assert.deepStrictEqual(c.ofrecidos.map(x => x.id), ["cuerpo-ejemplo-adulta"], "decisión 132");
  assert.deepStrictEqual(c.todos.map(x => x.id), ["ejemplo-cc0"], "los cerrados de v1 dentro de la v2");
  assert.strictEqual(c.porId["cuerpo-ejemplo-adulta"].mirada, "ninguna");
  assert.deepStrictEqual(Object.keys(c.piezas).sort(), V2.piezas.map(p => p.id).sort());
  assert.strictEqual(c.piezas["ropa-faena"].cubre, true); assert.strictEqual(c.piezas["sombrero-paja"].sombrero, 1); assert.strictEqual(c.piezas["sombrero-paja"].color, 0xd9bf6a);
  const raro = copia(V2); raro.piezas.push({ id: "mala", tipo: "pelo", malla: "../x" }, { id: "Mala", tipo: "pelo", malla: "pieza_mala" }, { id: "otra", tipo: "tatuaje", malla: "pieza_otra" });
  raro.cuerpos[0].piezas.push("mala", "no-existe"); raro.cuerpos.push({ id: "sin-edad", fichero: "sin-edad.vrm", ofrecer: true });
  const r = AP.leeCatalogo(raro);
  assert.ok(!r.piezas.mala && !r.piezas.Mala && !r.piezas.otra); assert.ok(!r.porId["sin-edad"]); assert.ok(!r.porId["cuerpo-ejemplo-adulta"].piezas.includes("no-existe"));
  assert.strictEqual(AP.leeCatalogo(Object.assign(copia(V2), { v: 3 })), null);
  assert.deepStrictEqual(AP.leeCatalogo(V1).todos.map(a => a.id), ["ejemplo-cc0", "ejemplo-cc-by"]);
});

test("motor: qué VRM lleva cada cual: el cuerpo de su receta (si se ofrece); si no, su avatar cerrado; si no, el muñeco", () => {
  const c = AP.leeCatalogo(V2);
  assert.strictEqual(AP.cualVrm(c, { cuerpo: "cuerpo-ejemplo-adulta" }, "ejemplo-cc0"), "cuerpo-ejemplo-adulta", "manda el cuerpo");
  assert.strictEqual(AP.cualVrm(c, { cuerpo: "cuerpo-ejemplo-peque" }, null), null, "un peque no se dibuja (decisión 132)");
  assert.strictEqual(AP.cualVrm(c, { cuerpo: "cuerpo-ejemplo-peque" }, "ejemplo-cc0"), "ejemplo-cc0");
  assert.strictEqual(AP.cualVrm(c, { cuerpo: "no-existe" }, "tampoco"), null);
  assert.strictEqual(AP.cualVrm(c, null, "cuerpo-ejemplo-adulta"), null, "un cuerpo no se elige como avatar cerrado");
  assert.strictEqual(AP.cualVrm(null, { cuerpo: "cuerpo-ejemplo-adulta" }, null), null, "sin catálogo, el muñeco");
});

test("motor: las piezas de la receta (solo las que trae el cuerpo y de su tipo), la ropa de faena tapa la base, y el sombrero de siempre enseña el suyo", () => {
  const c = AP.leeCatalogo(V2), cu = c.porId["cuerpo-ejemplo-adulta"];
  const p = AP.piezasDe(c, cu, { pelo: "pelo-afro", vello: "vello-barba", ropa: "ropa-faena" }, 1);
  assert.deepStrictEqual(Object.keys(p.mallas).sort(), ["pieza_pelo-afro", "pieza_ropa-faena", "pieza_sombrero-paja", "pieza_vello-barba"]);
  assert.strictEqual(p.cubre, true); assert.strictEqual(p.colorSombrero, 0xd9bf6a);
  const q = AP.piezasDe(c, cu, { pelo: "vello-barba", vello: "pelo-afro", ropa: "no-existe" }, 0);
  assert.deepStrictEqual(q.mallas, {}, "cada pieza en su sitio: un vello no hace de pelo");
  assert.strictEqual(q.cubre, false);
  assert.deepStrictEqual(AP.piezasDe(c, c.porId["cuerpo-ejemplo-peque"], { vello: "vello-barba" }, 2).mallas, {}, "el peque no trae barba ni gorra");
});

test("motor: tinte por nombre de material (decisión 128): piel, ropa de arriba y de abajo, pelo y sombrero; los ojos y lo demás, como vienen", () => {
  const col = { piel: 1, arriba: 2, abajo: 3, pelo: 4 };
  assert.deepStrictEqual(["piel", "ropa_base", "ropa_abajo", "pelo", "sombrero", "ojos", "", "piel.001"].map(n => AP.colorMaterial(n, col, 9)), [1, 2, 3, 4, 9, null, null, 1]);
});

test("motor: con silla de ruedas el VRM va sentado como en el quad (muslos adelante, espinillas en vertical, codo del quad) y con los brazos del muñeco; la silla también con VRM", () => {
  const silla = AP.huesos({ piernaI: 1.15, piernaD: 1.15, brazoI: 0.55, brazoD: 0.55, agacho: 0, vehiculo: 3 }, { L: 0.9 }, null, {});
  const quad = AP.huesos({ piernaI: 1.15, piernaD: 1.15, brazoI: 1.05, brazoD: 1.05, agacho: 0, vehiculo: 1 }, { L: 0.9 }, null, {});
  assert.deepStrictEqual([silla.leftUpperLeg, silla.leftLowerLeg, silla.leftLowerArm], [quad.leftUpperLeg, quad.leftLowerLeg, quad.leftLowerArm]);
  assert.deepStrictEqual(silla.leftUpperArm, [-0.55, 0, -AP.BAJA], "los brazos a las ruedas");
  const p = lee("apps/web/motor/26_presencia.js");
  assert.match(p, /outMu, o\.modo, a\.mov === "silla"\);/, "Muneco.avanza sienta también a quien lleva VRM");
  assert.ok(!/a\.mov === "silla" && !a\.vrm/.test(p));
  assert.match(p, /if \(a\.iSom >= 0\) mSombrero\.setMatrixAt\(a\.iSom, m4\);/, "con VRM se quita el sombrero del muñeco, no el apoyo");
});

test("motor: los cuerpos sin huesos de ojos no gastan VRMLookAt (mirada «ninguna»: la mirada va con la cabeza); la escala de un cuerpo es la de verdad × la altura de la receta", () => {
  const b = lee("apps/web/motor/26b_avatares.js");
  assert.match(b, /conMirada: !e\.cuerpo \|\| e\.mirada !== "ninguna"/); assert.match(b, /if \(vrm\.lookAt && inst\.conMirada\)/);
  assert.match(b, /var s = e\.cuerpo \? 1 : 1\.5 \/ Math\.max\(0\.3, yCab\)/); assert.match(b, /var s = v\.fa \|\| 1; inst\.giro\.scale\.setScalar\(s\)/);
  assert.match(b, /userData\.name/, "las piezas se buscan por el nombre original del nodo");
});

// ------------------------------------------------------------------------------------------------- la pantalla de elección (lo puro)
test("portada (receta.js): sin peques, sin «hombre/mujer», puntos de partida que el catálogo puede hacer y que no tocan la piel", async () => {
  const R = await imp("apps/web/portada/receta.js"), v2 = R.leeV2(V2);
  assert.deepStrictEqual(v2.cuerpos.map(c => c.id), ["cuerpo-ejemplo-adulta"], "decisión 132");
  assert.deepStrictEqual(R.EDADES.map(e => e[0]), ["joven", "adulta", "mayor"]);
  assert.deepStrictEqual(R.edadesDe(v2).map(e => e[0]), ["adulta"]);
  assert.strictEqual(R.leeV2(V1), null, "un catálogo v1 no sirve para piezas"); assert.strictEqual(R.leeV2(null), null);
  const par = R.parecidos(v2);
  assert.ok(par.length >= 1); for (const p of par) { assert.strictEqual(p.receta.edad, "adulta"); assert.ok(!NEGRA.test(p.nombre)); }
  assert.deepStrictEqual(R.parecidos(null), [], "sin catálogo no se ofrecen (llevan piezas)");
  const e = R.aplica(Object.assign(R.inicial(v2, () => 0.3), { tono: 7 }), par[0].receta);
  assert.strictEqual(e.tono, 7, "la piel es de la persona");
});

test("portada (receta.js): al azar no toca edad, complexión, altura ni apoyo; empieza sin tono de serie y nadie calvo; la petición lleva la receta y lo de siempre", async () => {
  const R = await imp("apps/web/portada/receta.js"), v2 = R.leeV2(V2);
  let k = 0; const rnd = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
  const tonos = new Set();
  for (let i = 0; i < 40; i++) {
    const e = R.inicial(v2, rnd); tonos.add(e.tono);
    assert.ok(e.pelo, "con catálogo, nadie empieza sin pelo");
    const z = R.azar(Object.assign({}, e, { edad: "mayor", complexion: "ancha", altura: "alta", movilidad: "silla" }), v2, rnd);
    assert.deepStrictEqual([z.edad, z.complexion, z.altura, z.movilidad], ["mayor", "ancha", "alta", "silla"]);
  }
  assert.ok(tonos.size >= 5, "el tono de partida se reparte (C2): " + [...tonos]);
  const e = Object.assign(R.inicial(v2, () => 0), { tono: 9, arriba: 3, abajo: 8, pelo: "pelo-afro", peloColor: 6, vello: "vello-barba", ropa: "ropa-faena", sombrero: "paja", movilidad: "andador" });
  const b = R.peticion(v2, e);
  assert.deepStrictEqual(b, { camisa: 0, sombrero: "paja", piel: 4, vrm: null, tono: 9, arriba: 3, abajo: 8, complexion: "media", movilidad: "andador", cuerpo: "cuerpo-ejemplo-adulta", pelo_color: 6, pelo: "pelo-afro", vello: "vello-barba", ropa: "ropa-faena" });
  const receta = { cuerpo: b.cuerpo, pelo: b.pelo, pelo_color: b.pelo_color, vello: b.vello, ropa: b.ropa };
  assert.ok(Buffer.byteLength(JSON.stringify(receta)) < 200, "receta corta");
  // ida y vuelta por la api
  const d = R.deGuardado(v2, b, []);
  for (const k2 of ["tono", "arriba", "abajo", "pelo", "peloColor", "vello", "ropa", "sombrero", "movilidad", "edad", "complexion"]) assert.deepStrictEqual(d[k2], e[k2], k2);
  // sin catálogo v2: solo el muñeco (sin cuerpo ni piezas en la petición)
  const m = R.peticion(null, e); assert.ok(!("cuerpo" in m) && !("pelo" in m) && !("ropa" in m));
  // la vista previa: las mismas piezas y colores que dibujará el motor
  const v = R.vestido(v2, e);
  assert.deepStrictEqual(Object.keys(v.mallas).sort(), ["pieza_pelo-afro", "pieza_ropa-faena", "pieza_sombrero-paja", "pieza_vello-barba"]);
  assert.strictEqual(v.cubre, true); assert.strictEqual(v.colores.piel, "#3b2217"); assert.strictEqual(v.colores.pelo, "#9a9690"); assert.strictEqual(v.colores.sombrero, "#d9bf6a");
  assert.match(R.describe(v2, e), /^Persona adulta, complexión media, .*piel de tono 10.*afro.*canoso.*barba.*ropa de faena.*andador\.$/);
});

// ------------------------------------------------------------------------------------------------- en Chrome, por el banco, con los cuerpos de verdad
// GEMELO_AVATARES_CUERPOS = la carpeta de cuerpos.py (hace falta Blender: AVATARES-FAMILIA.md §13-14). SwiftShader: recuentos y memoria, no fps. Las capturas, a
// pruebas/salida/capturas-avatares-piezas/ (no se versionan). Sin la carpeta, sin Chrome o sin el fixture: se saltan y lo dicen.
const fs = require("fs"), http = require("http");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { propia, ejecuta } = require("./_util");
const { montaPagina, saltoPagina } = require("./_pagina");
const CUERPOS = process.env.GEMELO_AVATARES_CUERPOS, CAPS = path.join(RAIZ, "pruebas", "salida", "capturas-avatares-piezas");
const SALTO_CH = !(CUERPOS && fs.existsSync(path.join(CUERPOS, "cuerpos.json"))) ? "sin GEMELO_AVATARES_CUERPOS (los cuerpos de cuerpos.py; hace falta Blender): la portada y el motor con el catálogo v2 en Chrome NO se han comprobado"
  : motivoSalto("los avatares por piezas en navegador") || saltoPagina("los avatares por piezas en navegador");
let catDir = null, nav = null;
async function catalogoV2() {
  if (catDir) return catDir;
  const { construyeV2 } = await imp("tuberia/avatares/creador/catalogo.mjs"), d = propia("avatares-v2");
  const r = await construyeV2({ origen: CUERPOS, salida: d });
  assert.deepStrictEqual(r.rechazados, [], "los cuerpos pasan la tubería v2");
  catDir = d; return d;
}
test.after(async () => { if (nav) await nav.close(); });

test("en Chrome: la portada elige por piezas (algo parecido, pelo, piel, vista de lejos), guarda con PUT /api/yo/avatar una receta que la api acepta y la lee de vuelta", { timeout: 900000 }, async t => {
  if (SALTO_CH) return t.skip(SALTO_CH);
  const av = await catalogoV2(), web = propia("portada-av4");
  const b = ejecuta(process.execPath, [path.join(RAIZ, "apps", "web", "node_modules", "vite", "bin", "vite.js"), "build", "--config", "vite.portada.config.js"], { cwd: path.join(RAIZ, "apps", "web"), env: Object.assign({}, process.env, { GEMELO_PORTADA_SALIDA: web }) });
  assert.strictEqual(b.status, 0, b.stdout + b.stderr);
  const { limpiaAspecto, bytesReceta, RECETA_MAX_BYTES } = await imp("apps/api/src/presencia/livekit.ts");
  let guardado = null; const puts = [];
  const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".vrm": "model/gltf-binary", ".svg": "image/svg+xml" };
  const srv = await new Promise(ok => { const s = http.createServer((q, r) => {
    const url = decodeURIComponent(q.url.split("?")[0]), json = (st, o) => { r.statusCode = st; r.setHeader("content-type", "application/json"); r.end(o === undefined ? "" : JSON.stringify(o)); };
    if (url === "/api/sesion") return json(200, { alias: "Mirlo", alias_visible: true, primer_acceso: false, rol: "hogar" });
    if (url === "/api/yo/avatar" && q.method === "GET") return guardado ? json(200, guardado) : json(404, { error: "sin_avatar" });
    if (url === "/api/yo/avatar" && q.method === "PUT") { let c = ""; q.on("data", x => { c += x; }); q.on("end", () => { const j = JSON.parse(c); puts.push(j); guardado = Object.assign({ vrm: null }, j); r.statusCode = 204; r.end(); }); return; }
    const f = url.startsWith("/avatares/") ? path.join(av, url.slice(10)) : path.join(web, url === "/" ? "index.html" : url);
    fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader("content-type", TIPOS[path.extname(f)] || "application/octet-stream"); r.end(d); });
  }).listen(0, "127.0.0.1", () => ok(s)); });
  const base = "http://127.0.0.1:" + srv.address().port;
  fs.mkdirSync(CAPS, { recursive: true });
  try {
    nav = nav || await lanza();
    for (const [ancho, alto] of [[1280, 900], [390, 844]]) {
      const ctx = await nav.newContext({ viewport: { width: ancho, height: alto } }), p = await ctx.newPage(), errores = [];
      p.on("pageerror", e => errores.push(String(e))); p.on("console", m => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errores.push(m.text()); });
      guardado = null; puts.length = 0;
      await p.goto(base + "/#avatar"); await p.waitForSelector("html[data-listo]"); await p.waitForSelector("#mPelo input[type=radio]", { state: "attached", timeout: 60000 });
      const edades = await p.$$eval("#mEdad input", l => l.map(i => i.value));
      assert.deepStrictEqual(edades, ["joven", "adulta", "mayor"], "sin peques (decisión 132)");
      const texto = await p.textContent("#p-avatar");
      assert.ok(!/\b(hombre|mujer|chico|chica|abuel)/i.test(texto.replace(/«chico o chica»/, "")), "sin «hombre/mujer» como paso (C8, C9)");
      assert.ok(await p.isVisible("#fsParecidos"), "«Empieza por algo parecido»");
      await p.click("#parecidos button:nth-child(2)");
      await p.check("#mPelo input[value=pelo-afro]"); await p.check("#mPiel input[value='8']"); await p.check("#mPeloColor input[value='6']");
      // de cerca: el VRM real con sus piezas (SwiftShader, lento)
      await p.waitForFunction(() => !document.getElementById("avatar3d").hasAttribute("hidden") && document.getElementById("avatarPrev").hasAttribute("hidden"), null, { timeout: 180000 });
      await p.waitForTimeout(1500);
      await (await p.$(".avatar-zona")).screenshot({ path: path.join(CAPS, "portada-cerca-" + ancho + ".png") });
      assert.match(await p.textContent("#descAvatar"), /pelo afro o rizado canoso/i, "la descripción en texto (aria-live) dice lo que se ve");
      await p.click("#vistaLejos");
      await p.waitForFunction(() => !document.getElementById("avatarPrev").hasAttribute("hidden"));
      await (await p.$(".avatar-zona")).screenshot({ path: path.join(CAPS, "portada-lejos-" + ancho + ".png") });
      const anchos = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      assert.ok(anchos[0] <= anchos[1], "a " + ancho + " px desborda: " + anchos.join(" > "));
      await Promise.all([p.waitForResponse(x => new URL(x.url()).pathname === "/api/yo/avatar" && x.request().method() === "PUT"), p.click("#fAvatar button[type=submit]")]);
      const put = puts[0];
      assert.ok(put.cuerpo && /^cuerpo-adulta-/.test(put.cuerpo) && put.pelo === "pelo-afro" && put.tono === 8 && put.pelo_color === 6, JSON.stringify(put));
      const limpio = limpiaAspecto(put);
      for (const k of ["cuerpo", "pelo", "pelo_color", "vello", "ropa", "tono", "arriba", "abajo", "complexion", "movilidad"]) assert.deepStrictEqual(limpio[k], put[k], "la api acepta " + k);
      assert.ok(bytesReceta(limpio) <= RECETA_MAX_BYTES, "receta de " + bytesReceta(limpio) + " bytes");
      t.diagnostic(ancho + " px: receta " + bytesReceta(limpio) + " bytes: " + JSON.stringify(put));
      // de vuelta: «Mi avatar» lo trae como estaba
      await p.goto(base + "/#portada"); await p.goto(base + "/#avatar"); await p.waitForSelector("#mPelo input:checked", { state: "attached", timeout: 60000 });
      assert.strictEqual(await p.$eval("#mPelo input:checked", e => e.value), "pelo-afro"); assert.strictEqual(await p.$eval("#mPiel input:checked", e => e.value), "8");
      // SwiftShader a veces no da un segundo contexto WebGL (three avisa «reading 'precision'»): la portada cae al muñeco, que es lo previsto; no cuenta como fallo
      assert.deepStrictEqual(errores.filter(e => !/reading 'precision'/.test(e)), [], "sin errores de página");
      await ctx.close();
    }
  } finally { srv.close(); }
});

test("en Chrome: ?presencia=sim&vrm=1 con el catálogo v2 — cuerpos con sus piezas y colores, en silla sentados; lo que cuesta un avatar completo (SwiftShader)", { timeout: 900000 }, async t => {
  if (SALTO_CH) return t.skip(SALTO_CH);
  const av = await catalogoV2(), WEBD = propia("web-avatares-v2"), P = montaPagina({ finca: "cerro" });
  fs.cpSync(P.carpeta, path.join(WEBD, "cerro"), { recursive: true }); fs.cpSync(av, path.join(WEBD, "avatares"), { recursive: true });
  const srv = await sirve(WEBD), base = "http://127.0.0.1:" + srv.address().port + "/cerro/index.html";
  fs.mkdirSync(CAPS, { recursive: true });
  try {
    nav = nav || await lanza();
    const medir = async (q, nombre, espera) => {
      const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
      p.on("pageerror", e => errores.push(String(e.stack || e).slice(0, 400)));
      p.on("console", m => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 300)); });
      await p.goto(base + "?debug" + q);
      await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 90000 });
      await p.evaluate(() => { const g = window.__g; g.orb.dist = 9; g.orb.el = 0.3; });
      if (espera) await p.waitForFunction(() => { const v = window.__presencia().vrm; return v && v.cuerpos > 0 && v.cargando === 0 && v.fundiendo === 0 && v.vestidos.length >= 3; }, null, { timeout: 240000, polling: 1000 }).catch(() => {});
      await p.waitForTimeout(2500);
      const m = await p.evaluate(() => { const r = window.__g.renderer.info, e = window.__presencia(); return { llamadas: r.render.calls, triangulos: r.render.triangles, geometrias: r.memory.geometries, texturas: r.memory.textures, vrm: e.vrm }; });
      await p.screenshot({ path: path.join(CAPS, nombre + ".png") });
      await p.close();
      assert.deepStrictEqual(errores, [], nombre + ": sin errores de página");
      return m;
    };
    const mun = await medir("&presencia=sim&n=20&yo=no", "muneco20", false), con = await medir("&presencia=sim&n=20&vrm=1&yo=no", "piezas20", true);
    const v = con.vrm;
    assert.ok(v.cuerpos >= 9 && v.vestidos.length >= 3, JSON.stringify({ cuerpos: v.cuerpos, vestidos: v.vestidos.length, fallos: v.fallos }));
    const { PALETAS } = await imp("tuberia/avatares/creador/catalogo.mjs"), colores = new Set([].concat(PALETAS.piel, PALETAS.ropa, PALETAS.pelo).map(x => x.color));
    for (const x of v.vestidos) {
      assert.ok(x.mallas.some(n => /^pieza_pelo-/.test(n)), x.id + ": con pelo (nadie calvo en la simulación)");
      assert.ok(x.llamadas <= 7 && x.triangulos <= 15000, x.id + ": " + x.llamadas + " llamadas y " + x.triangulos + " triángulos (topes_combinacion): " + JSON.stringify(x));
      for (const k of ["piel", "ropa_base", "ropa_abajo", "pelo"]) if (x.colores[k]) assert.ok(colores.has(x.colores[k]), x.id + " " + k + " " + x.colores[k] + " fuera de las paletas");
    }
    t.diagnostic("muñeco (n=20): " + mun.llamadas + " llamadas, " + mun.triangulos + " triángulos; con cuerpos (n=20, " + v.conVrm + " VRM): " + con.llamadas + " llamadas, " + con.triangulos + " triángulos, " + con.geometrias + " geometrías, " + con.texturas + " texturas");
    t.diagnostic("por avatar: " + JSON.stringify(v.vestidos.map(x => ({ id: x.id, llamadas: x.llamadas, triangulos: x.triangulos, sentado: x.sentado }))));
    fs.writeFileSync(path.join(CAPS, "medida.json"), JSON.stringify({ muneco: mun, piezas: { llamadas: con.llamadas, triangulos: con.triangulos, geometrias: con.geometrias, texturas: con.texturas, conVrm: v.conVrm, vestidos: v.vestidos } }, null, 2));
  } finally { srv.close(); }
});

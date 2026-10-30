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

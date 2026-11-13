"use strict";
// Contrato de mundo interior (contratos/mundo-interior.md, ADR-0033, PLAN MU0-7): el ejemplo sintético pasa el validador
// (tuberia/interiores/valida.js) y su generador da los mismos bytes; cada regla del contrato tiene un caso que la rompe y el
// validador lo rechaza; y los topes que cuenta el .md son los del esquema (regla 13: la promesa escrita tiene su guardián).
const test = require("node:test"), assert = require("node:assert");
const zlib = require("zlib");
const { RAIZ, lee, fs, path } = require("./_util");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS, KHRLightsPunctual } = require("@gltf-transform/extensions");
const { valida, PRES } = require(path.join(RAIZ, "tuberia", "interiores", "valida.js"));
const { bytes: generaSala } = require(path.join(RAIZ, "modelos", "interiores", "ejemplo", "genera.js"));

const DIR = path.join(RAIZ, "modelos", "interiores", "ejemplo");
const MAN = JSON.parse(fs.readFileSync(path.join(DIR, "mundo.json"), "utf8"));
const GLB = new Uint8Array(fs.readFileSync(path.join(DIR, "sala.glb")));
const io = () => new NodeIO().registerExtensions(ALL_EXTENSIONS);
const copia = o => JSON.parse(JSON.stringify(o));
/** lee el glb del ejemplo, lo cambia con fn(doc) y lo vuelve a escribir */
async function cambia(fn) { const doc = await io().readBinary(GLB); await fn(doc); return io().writeBinary(doc); }
const tiene = (r, re) => r.errores.some(e => re.test(e));

/** PNG RGBA de w × h, todo transparente (válido: lo leen gltf-validator y @gltf-transform) */
function png(w, h) {
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 0xff] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const trozo = (tipo, datos) => { const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const td = Buffer.concat([Buffer.from(tipo), datos]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  const filas = Buffer.alloc((w * 4 + 1) * h);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", ih), trozo("IDAT", zlib.deflateSync(filas)), trozo("IEND", Buffer.alloc(0))]));
}

test("el ejemplo sintético pasa el validador, cabe en todos los perfiles y su generador da los mismos bytes", async () => {
  const r = await valida(MAN, GLB);
  assert.ok(r.ok, r.errores.join("\n"));
  assert.deepStrictEqual(r.avisos, [], "sin avisos");
  for (const [k, v] of Object.entries(r.perfiles)) assert.ok(v.cabe, k + ": " + v.excesos.join("; "));
  assert.deepStrictEqual(Buffer.from(await generaSala()), Buffer.from(GLB), "sala.glb no es lo que da genera.js (regenerar con node modelos/interiores/ejemplo/genera.js)");
});

test("el glb: sin cámaras, sin luces, solo extensiones admitidas, en metros y con las animaciones del manifiesto", async () => {
  let r = await valida(MAN, await cambia(d => { d.getRoot().listNodes()[0].setCamera(d.createCamera("c").setType("perspective").setYFov(1).setZNear(0.1).setZFar(100).setAspectRatio(1)); }));
  assert.ok(tiene(r, /sin cámaras/), "una cámara: " + r.errores.join(" | "));
  r = await valida(MAN, await cambia(d => { const L = d.createExtension(KHRLightsPunctual); d.getRoot().listNodes()[0].setExtension("KHR_lights_punctual", L.createLight("sol").setType("directional")); }));
  assert.ok(tiene(r, /KHR_lights_punctual.*sin luces/), "una luz: " + r.errores.join(" | "));
  r = await valida(MAN, await cambia(d => { for (const n of d.getRoot().listNodes()) n.setScale([1000, 1000, 1000]); }));
  assert.ok(tiene(r, /¿está en metros\?/), "en milímetros: " + r.errores.join(" | "));
  r = await valida(MAN, await cambia(d => { d.getRoot().listAnimations()[0].setName("otra"); }));
  assert.ok(tiene(r, /animaciones del glb/), "una animación que no dice el manifiesto: " + r.errores.join(" | "));
});

test("el presupuesto del perfil objetivo (" + PRES.objetivo + "): se rechaza lo que se pasa de llamadas o de lado de textura", async () => {
  const tope = PRES.perfiles[PRES.objetivo];
  let r = await valida(MAN, await cambia(d => { const m = d.getRoot().listMeshes().find(x => x.getName() === "rueda"), esc = d.getRoot().listScenes()[0]; for (let k = 0; k < tope.llamadas; k++) esc.addChild(d.createNode("r" + k).setMesh(m)); }));
  assert.ok(!r.ok && !r.perfiles[PRES.objetivo].cabe && tiene(r, /llamadas/), "demasiadas llamadas: " + r.errores.join(" | "));
  assert.ok(r.perfiles.pantalla.cabe, "en pantalla sí cabe");
  r = await valida(MAN, await cambia(d => { const tx = d.createTexture("grande").setImage(png(tope.lado_max * 2, 4)).setMimeType("image/png"); d.getRoot().listMaterials()[0].setBaseColorTexture(tx); }));
  assert.ok(tiene(r, /lado_max/), "textura más grande que el lado máximo: " + r.errores.join(" | "));
});

test("el manifiesto: esquema, puerta principal en el origen, llegada dentro de una zona, zonas simples e ids únicos", async () => {
  let m = copia(MAN); m.id = "exterior";
  assert.ok(tiene(await valida(m, GLB), /mundo\.json\/id/), "el id «exterior» está reservado");
  m = copia(MAN); m.puertas[0].pos = [2, 0, 0];
  assert.ok(tiene(await valida(m, GLB), /puerta principal/), "puerta principal fuera del origen");
  m = copia(MAN); m.puertas[0].llegada.pos = [0, 0, -9];
  assert.ok(tiene(await valida(m, GLB), /llegada .* no cae dentro/), "llegada fuera de las zonas");
  m = copia(MAN); m.puertas[0].llegada.pos = [0, 1, -1.5];
  assert.ok(tiene(await valida(m, GLB), /llegada .* no cae dentro/), "llegada a otra cota");
  m = copia(MAN); m.zonas.push({ id: "lazo", anillo: [[-3, -5], [-1, -3], [-1, -5], [-3, -3]], y: 0 });
  assert.ok(tiene(await valida(m, GLB), /se corta a sí misma/), "zona en lazo");
  m = copia(MAN); m.zonas.push(copia(m.zonas[0]));
  assert.ok(tiene(await valida(m, GLB), /id de zona repetido/), "zona repetida");
  m = copia(MAN); m.licencia = { spdx: "CC0-1.0" };
  assert.ok(tiene(await valida(m, GLB), /licencia/), "licencia sin autor");
  // v1.1: el anclaje en el exterior es opcional (el ejemplo lo trae), pero si viene, entero: pos [x, y] y giro en [0, 360)
  assert.ok(MAN.anclaje, "el ejemplo trae anclaje (v1.1)");
  m = copia(MAN); delete m.anclaje;
  assert.ok((await valida(m, GLB)).ok, "sin anclaje también vale");
  m = copia(MAN); m.anclaje = { pos: [0, -150], giro: 360 };
  assert.ok(tiene(await valida(m, GLB), /anclaje/), "giro fuera de [0, 360)");
  m = copia(MAN); m.anclaje = { pos: [0], giro: 0 };
  assert.ok(tiene(await valida(m, GLB), /anclaje/), "pos sin y");
});

test("v1.1, las paradas de la visita: el ejemplo las trae sin avisos; lo que mentiría es error y lo que hay que mirar, aviso", async () => {
  const avisa = (r, re) => r.avisos.some(a => re.test(a));
  assert.ok(Array.isArray(MAN.paradas) && MAN.paradas.length >= 2 && Array.isArray(MAN.fuentes), "el ejemplo trae paradas y fuentes (v1.1)");
  let m = copia(MAN); delete m.paradas; delete m.fuentes;
  assert.ok((await valida(m, GLB)).ok, "sin paradas también vale");
  // errores: el esquema (procedencia del modelo, radio, campos de más) y las reglas que mentirían o romperían la ficha
  m = copia(MAN); m.paradas[0].ficha.procedencia_visible = "inventado";
  assert.ok(tiene(await valida(m, GLB), /mundo\.json\/paradas\/0\/ficha\/procedencia_visible/), "procedencia fuera del enum");
  m = copia(MAN); m.paradas[0].radio = 0.1;
  assert.ok(tiene(await valida(m, GLB), /paradas\/0\/radio/), "radio demasiado pequeño");
  m = copia(MAN); m.paradas.push(copia(m.paradas[0]));
  assert.ok(tiene(await valida(m, GLB), /id de parada repetido/), "parada repetida");
  m = copia(MAN); m.paradas[1].ficha.fuentes.push("no-existe");
  assert.ok(tiene(await valida(m, GLB), /fuente «no-existe»/), "fuente que no está en fuentes[]");
  m = copia(MAN); m.paradas[2].puerta = "trasera";
  assert.ok(tiene(await valida(m, GLB), /puerta «trasera»/), "puerta que no está en puertas[]");
  m = copia(MAN); m.paradas[1].ficha.fuentes = [];
  assert.ok(tiene(await valida(m, GLB), /«documentado» sin fuentes/), "documentado sin fuentes");
  m = copia(MAN); m.paradas[0].ficha.procedencia_texto = ["sin_fuente", "testimonio"];
  assert.ok(tiene(await valida(m, GLB), /«sin_fuente» no va con otra/), "sin_fuente con otra procedencia");
  m = copia(MAN); m.paradas[0].ficha.procedencia_visible = "medido";
  assert.ok(tiene(await valida(m, GLB), /no puede ser «medido» en un mundo ilustrativo/), "medido en un mundo hecho a mano");
  m = copia(MAN); m.fuentes[0].url = "javascript:alert(1)";
  assert.ok(tiene(await valida(m, GLB), /fuentes\/0\/url/), "una url que no es https");
  // avisos: pasa, pero se dice
  const pasaYAvisa = async (cambio, re, que) => { const mm = copia(MAN); cambio(mm); const r = await valida(mm, GLB); assert.ok(r.ok, que + ": " + r.errores.join(" | ")); assert.ok(avisa(r, re), que + ": " + r.avisos.join(" | ")); };
  await pasaYAvisa(x => { x.paradas[0].pos = [0, 0, -9]; }, /no cae dentro de ninguna zona/, "parada fuera de las zonas");
  await pasaYAvisa(x => { x.paradas[0].pos = [-2, 1, -2]; }, /no cae dentro de ninguna zona/, "parada a otra cota");
  await pasaYAvisa(x => { x.paradas[1].pos = [-1.5, 0, -2.5]; }, /pisa el radio de «bienvenida»/, "radios que se pisan");
  await pasaYAvisa(x => { x.paradas[0].ancla.pos = [0, 1, -30]; }, /ancla cae fuera del modelo/, "ancla fuera del modelo");
  await pasaYAvisa(x => { x.paradas[0].ancla.nodo = "prensa"; }, /no tiene el nodo «prensa»/, "nodo que el glb no tiene");
  await pasaYAvisa(x => { x.paradas[0].ficha.texto = "Muy corto."; }, /palabras/, "texto demasiado corto");
  await pasaYAvisa(x => { x.paradas[0].ficha.texto += " [2]"; }, /\[2\] no remite/, "un [n] que no es de sus fuentes");
  await pasaYAvisa(x => { x.paradas[0].ficha.pendiente = ["¿cuántos rulos?"]; }, /pendiente/, "lo pendiente de confirmar");
});

test("contratos/mundo-interior.md dice los topes del esquema (perfiles, extensiones e imágenes)", () => {
  const md = lee("contratos/mundo-interior.md"), num = n => n.toLocaleString("es-ES").replace(/ /g, ".");
  for (const [k, t] of Object.entries(PRES.perfiles)) {
    const fila = md.split("\n").find(l => l.startsWith("| " + k + " |"));
    assert.ok(fila, "falta la fila del perfil «" + k + "» en la tabla de presupuesto");
    const celdas = fila.split("|").map(s => s.trim());
    assert.deepStrictEqual(celdas.slice(2, 7), [num(t.triangulos), String(t.llamadas), String(t.texturas_mb), String(t.lado_max), String(t.materiales)], "la fila «" + k + "» no dice lo del esquema");
  }
  for (const e of PRES.extensiones) assert.ok(md.includes("`" + e + "`"), "el .md no nombra la extensión admitida " + e);
  assert.ok(md.includes("perfil objetivo: **" + PRES.objetivo + "**"), "el .md no dice el perfil objetivo");
});

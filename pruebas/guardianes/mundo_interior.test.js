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

"use strict";
// Contrato de mundo interior v1.3 (contratos/mundo-interior.md §2b, ADR-0035): el glb comprimido con meshopt y KTX2. El ejemplo SINTÉTICO
// modelos/interiores/ejemplo-comprimido/ (la sala de ejemplo-luz pasada por tuberia/interiores/blender/comprime.mjs) pasa el validador sin avisos y su
// generador da los mismos bytes; la memoria de un KTX2 se cuenta por bloques del formato de cada perfil y no como RGBA8; lo que rompería el motor
// (un KTX2 sin sus mipmaps, la compresión sin ir en extensionsRequired, Draco o WebP) es error; y sin bajar la malla de una máquina a un hijo, la
// cuantización movería su pivote (por eso comprime.mjs la protege). Regla 13: cada promesa del §2b tiene aquí su caso.
// Lo que necesita la tubería (sharp, ktx2-encoder, meshoptimizer en tuberia/interiores/blender) se SALTA con aviso si no está instalado.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, lee, fs, path } = require("./_util");
const { pathToFileURL } = require("node:url");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");
const ktx = require("ktx-parse");
const { valida, ktx2, bytesKtx2, PRES } = require(path.join(RAIZ, "tuberia", "interiores", "valida.js"));

const DIR = path.join(RAIZ, "modelos", "interiores", "ejemplo-comprimido"), LUZ = path.join(RAIZ, "modelos", "interiores", "ejemplo-luz");
const MAN = JSON.parse(fs.readFileSync(path.join(DIR, "mundo.json"), "utf8"));
const GLB = new Uint8Array(fs.readFileSync(path.join(DIR, "sala.glb")));
const TUBERIA = path.join(RAIZ, "tuberia", "interiores", "blender");
const SIN_TUBERIA = ["sharp", "ktx2-encoder", "meshoptimizer", "@gltf-transform/functions"].some(m => !fs.existsSync(path.join(TUBERIA, "node_modules", m, "package.json"))) && "sin `npm ci` en tuberia/interiores/blender: la compresión NO se ha comprobado";
const tiene = (r, re) => r.errores.some(e => re.test(e));
async function io() { await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]); return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder }); }
/** lee el glb comprimido del ejemplo, lo cambia con fn(doc) y lo vuelve a escribir (comprimido) */
async function cambia(fn) { const i = await io(), doc = await i.readBinary(GLB); await fn(doc); return i.writeBinary(doc); }

test("el ejemplo v1.3 pasa el validador sin avisos: meshopt, cuatro KTX2, sus máquinas en su pivote y sus mapas de luz", async () => {
  const r = await valida(MAN, GLB);
  assert.ok(r.ok, r.errores.join("\n"));
  assert.deepStrictEqual(r.avisos, [], "sin avisos (lo que gltf-validator no sabe de KHR_texture_basisu no cuenta)");
  assert.strictEqual(r.medidas.meshopt, true); assert.strictEqual(r.medidas.ktx2, 4); assert.strictEqual(r.medidas.maquinas, 4); assert.strictEqual(r.medidas.mapas_luz, 2);
  const luz = await valida(JSON.parse(fs.readFileSync(path.join(LUZ, "mundo.json"), "utf8")), new Uint8Array(fs.readFileSync(path.join(LUZ, "sala.glb"))));
  for (const k of ["triangulos", "llamadas", "materiales", "texturas"]) assert.strictEqual(r.medidas[k], luz.medidas[k], k + ": comprimir no cambia lo que se dibuja");
  const doc = await (await io()).readBinary(GLB), ext = doc.getRoot().listExtensionsUsed().filter(e => e.isRequired()).map(e => e.extensionName).sort();
  assert.ok(ext.includes("EXT_meshopt_compression") && ext.includes("KHR_texture_basisu"), "las dos, en extensionsRequired: " + ext);
  for (const t of doc.getRoot().listTextures()) assert.strictEqual(t.getMimeType(), "image/ktx2", t.getName());
});

test("su generador (la tubería de verdad) da los mismos bytes", { skip: SIN_TUBERIA }, async () => {
  const { bytes } = require(path.join(DIR, "genera.js"));
  assert.deepStrictEqual(Buffer.from(await bytes()), Buffer.from(GLB), "sala.glb no es lo que da genera.js (regenerar con node modelos/interiores/ejemplo-comprimido/genera.js)");
});

test("la memoria de un KTX2 se cuenta por bloques del formato de cada perfil, con todos sus niveles, no como RGBA8", async () => {
  const doc = await (await io()).readBinary(GLB);
  const esperado = Object.fromEntries(Object.keys(PRES.perfiles).map(p => [p, 0]));
  for (const t of doc.getRoot().listTextures()) {
    const k = ktx2(t.getImage());
    assert.strictEqual(k.error, null, t.getName() + ": " + k.error);
    assert.strictEqual(k.codec, "etc1s", "comprime.mjs da ETC1S por defecto");
    assert.strictEqual(k.niveles, Math.floor(Math.log2(Math.max(k.ancho, k.alto))) + 1, t.getName() + " lleva todos sus mipmaps");
    for (const p of Object.keys(esperado)) esperado[p] += bytesKtx2(k, PRES.ktx2_bloque[p].etc1s);
  }
  const r = await valida(MAN, GLB);
  for (const [p, b] of Object.entries(esperado)) assert.strictEqual(r.medidas.texturas_mb_perfil[p], Math.round(b / 1048576 * 10) / 10, p);
  // a mano: 16 × 16 en ETC1S → ETC2 (8 bytes por bloque de 4 × 4): 16 + 4 + 1 + 1 + 1 bloques = 184 bytes; en BC7 (16), el doble
  assert.strictEqual(bytesKtx2({ ancho: 16, alto: 16, niveles: 5 }, 8), 184);
  assert.strictEqual(bytesKtx2({ ancho: 16, alto: 16, niveles: 5 }, 16), 368);
  assert.deepStrictEqual(PRES.ktx2_bloque.quest, { etc1s: 8, etc1s_alfa: 16, uastc: 16 }, "quest: ETC2 y ASTC 4x4 (lo que elige el KTX2Loader de three)");
  assert.deepStrictEqual(PRES.ktx2_bloque.pantalla, { etc1s: 16, etc1s_alfa: 16, uastc: 16 }, "pantalla: BC7");
});

test("lo que rompería el motor es error: un KTX2 sin sus mipmaps, la compresión fuera de extensionsRequired, Draco o WebP", async () => {
  // un KTX2 de Basis Universal (UASTC, 16 × 16) con solo su primer nivel, hecho con ktx-parse
  const sinMips = () => {
    const k = ktx.createDefaultContainer();
    k.vkFormat = 0; k.pixelWidth = 16; k.pixelHeight = 16; k.dataFormatDescriptor[0].colorModel = 166;
    k.levels = [{ levelData: new Uint8Array(256), uncompressedByteLength: 256 }];
    return ktx.write(k);
  };
  assert.strictEqual(ktx2(sinMips()).codec, "uastc");
  let r = await valida(MAN, await cambia(d => { d.getRoot().listTextures()[0].setImage(sinMips()); }));
  assert.ok(tiene(r, /KTX2 .*niveles.*se vería negra/), "un KTX2 sin mipmaps: " + r.errores.join(" | "));
  r = await valida(MAN, await cambia(d => { d.getRoot().listExtensionsUsed().find(e => e.extensionName === "KHR_texture_basisu").setRequired(false); }));
  assert.ok(tiene(r, /KHR_texture_basisu va en extensionsUsed y no en extensionsRequired/), "basisu opcional: " + r.errores.join(" | "));
  // Draco y WebP: el validador mira las extensiones del trozo JSON, así que basta con declararlas
  const conExt = (bytes, e) => {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), n = dv.getUint32(12, true);
    const j = JSON.parse(Buffer.from(bytes.subarray(20, 20 + n)).toString()); j.extensionsUsed.push(e);
    let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
    const resto = Buffer.from(bytes.subarray(20 + n)), cab = Buffer.alloc(20);
    cab.writeUInt32LE(0x46546c67, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(20 + js.length + resto.length, 8); cab.writeUInt32LE(js.length, 12); cab.writeUInt32LE(0x4e4f534a, 16);
    return new Uint8Array(Buffer.concat([cab, js, resto]));
  };
  for (const e of ["KHR_draco_mesh_compression", "EXT_texture_webp"]) {
    r = await valida(MAN, conExt(GLB, e));
    assert.ok(tiene(r, new RegExp("extensión no admitida: " + e + ".*v1\\.3 admite meshopt y KTX2")), e + ": " + r.errores.join(" | "));
  }
});

test("las máquinas: sin bajar su malla a un hijo, la cuantización cambia la matriz de su nodo; comprime.mjs la baja y el nodo se queda como estaba", { skip: SIN_TUBERIA }, async () => {
  const { comprime } = await import(pathToFileURL(path.join(TUBERIA, "comprime.mjs")).href);
  const { bytes: sala } = require(path.join(LUZ, "genera.js"));
  const nodos = async b => Object.fromEntries((await (await io()).readBinary(b)).getRoot().listNodes().map(n => [n.getName(), n]));
  const antes = await nodos(await sala()), trs = n => [n.getTranslation(), n.getRotation(), n.getScale()].map(v => v.map(x => Math.round(x * 1e6) / 1e6));
  // sin proteger: la correa (su malla no está centrada en su origen) se traslada y se escala; un giro alrededor de ese origen orbitaría mal
  const sin = await nodos((await comprime(await sala(), { protege: [], ktx2: false })).bytes);
  assert.notDeepStrictEqual(trs(sin.correa), trs(antes.correa), "sin proteger, quantize cambia la matriz del nodo de la máquina");
  const con = await comprime(await sala(), { protege: MAN.maquinas.map(m => m.nodo), ktx2: false });
  assert.strictEqual(con.resumen.protegidos, 4);
  assert.ok((await valida(MAN, con.bytes)).ok, "protegido, pasa (con los pivotes de giro y vaivén comprobados)");
  const des = await nodos(con.bytes);
  for (const m of MAN.maquinas) {
    assert.deepStrictEqual(trs(des[m.nodo]), trs(antes[m.nodo]), m.nodo + ": su matriz no cambia");
    assert.ok(!des[m.nodo].getMesh() && des[m.nodo].listChildren().some(h => h.getName() === m.nodo + "__malla" && h.getMesh()), m.nodo + ": su malla, en el hijo «" + m.nodo + "__malla»");
  }
});

test("contratos/mundo-interior.md cuenta la v1.3: §2b, el ejemplo, la cuenta por bloques y lo no probado en el Quest", () => {
  const md = lee("contratos/mundo-interior.md");
  assert.ok(md.includes("## 2b. El glb comprimido (v1.3)") && md.includes("ADR-0035"), "el .md tiene el §2b y enlaza el ADR");
  assert.ok(md.includes("ktx2_bloque") && /ETC1S → ETC2 \(8 bytes; con alfa, 16\) y UASTC → ASTC 4x4 \(16\).*pantalla, los dos → BC7 \(16\)/.test(md), "el .md dice los bytes por bloque del esquema");
  assert.ok(md.includes("todos sus mipmaps") && md.includes("extensionsRequired"), "el .md dice las dos reglas que el validador hace cumplir");
  assert.ok(/sin probar/.test(md.split("## 4.")[1] || ""), "lo abierto dice que en el Quest está sin probar");
  assert.ok(lee("tuberia/interiores/blender/README.md").includes("comprime.mjs"), "el README de la tubería cuenta el paso");
});

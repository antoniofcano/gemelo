"use strict";
// Catálogo de avatares VRM (ADR-0020, P7b; contratos/avatares.md): el esquema del catálogo y su ejemplo; la tubería (tuberia/avatares/) sobre un VRM sintético
// (rechaza las licencias que no valen, texturas ≤ 1024, simplifica hasta el tope, apaga el contorno de MToon, conserva las extensiones de VRM, la cuantización no
// deforma el esqueleto, el glb es válido); los avatares CC0 provisionales (fuentes.json) y que el repo no versiona ningún .vrm. Sin red ni Chrome.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, propia, lee, ficheros, fs, path } = require("./_util");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");
const Ajv2020 = require("ajv/dist/2020").default, validador = require("gltf-validator");

const AV = path.join(RAIZ, "tuberia", "avatares");
const imp = f => import(pathToFileURL(path.join(AV, f)).href);
const ESQ = JSON.parse(lee("contratos/avatares.schema.json")), EJEMPLO = JSON.parse(lee("contratos/avatares-ejemplo.json"));
const valida = () => new Ajv2020({ strict: true, allErrors: true }).compile(ESQ);
process.setMaxListeners(40);
const sha = b => crypto.createHash("sha256").update(b).digest("hex");

// ---------------------------------------------------------------------------------------------------------------- esquema y ejemplo
test("el ejemplo del catálogo cumple contratos/avatares.schema.json", () => {
  const v = valida(); assert.ok(v(EJEMPLO), JSON.stringify(v.errors));
  const ids = EJEMPLO.avatares.map(a => a.id); assert.strictEqual(new Set(ids).size, ids.length);
  EJEMPLO.avatares.forEach(a => assert.strictEqual(a.fichero, a.id + ".vrm"));
});

test("el esquema rechaza lo que no debe: id con mayúsculas, sombrero desconocido, huella corta, más de 12 avatares, campos de más, catálogo vacío", () => {
  const v = valida(), mal = f => { const c = JSON.parse(JSON.stringify(EJEMPLO)); f(c); return v(c); };
  assert.ok(!mal(c => { c.avatares[0].id = "Robert"; }), "id con mayúscula");
  assert.ok(!mal(c => { c.avatares[0].colores_muneco.sombrero = "bombin"; }), "sombrero");
  assert.ok(!mal(c => { c.avatares[0].sha256 = "abc"; }), "huella");
  assert.ok(!mal(c => { c.avatares[0].extra = 1; }), "campo de más");
  assert.ok(!mal(c => { c.avatares = Array.from({ length: 13 }, (_, i) => Object.assign({}, c.avatares[0], { id: "a" + i, fichero: "a" + i + ".vrm" })); }), "13 avatares");
  assert.ok(!mal(c => { c.avatares = []; }), "vacío");
  assert.ok(!mal(c => { c.compresion = "draco"; }), "compresión");
  assert.ok(!mal(c => { c.avatares[0].licencia.spdx = "CC0 1.0"; }), "spdx con espacio");
});

// ---------------------------------------------------------------------------------------------------------------- la licencia (lo puro)
test("evaluaLicencia: solo entra lo que deja servirlo a cualquiera, para una empresa y optimizado (VRM 1.0 y 0.x)", async () => {
  const { evaluaLicencia, leeMeta } = await imp("vrm.mjs");
  const base = { name: "x", authors: ["a"], licenseUrl: "https://vrm.dev/licenses/1.0/", avatarPermission: "everyone", commercialUsage: "corporation", allowRedistribution: true, modification: "allowModificationRedistribution", creditNotation: "unnecessary" };
  const eva = o => evaluaLicencia(leeMeta({ extensions: { VRMC_vrm: { specVersion: "1.0", meta: Object.assign({}, base, o) } } }));
  assert.ok(eva({}).ok);
  for (const [o, motivo] of [[{ avatarPermission: "onlyAuthor" }, /avatarPermission/], [{ avatarPermission: "onlySeparatelyLicensedPerson" }, /avatarPermission/],
    [{ commercialUsage: "personalNonProfit" }, /commercialUsage/], [{ commercialUsage: "personalProfit" }, /commercialUsage/], [{ allowRedistribution: false }, /allowRedistribution/],
    [{ modification: "prohibited" }, /modification/], [{ modification: "allowModification" }, /modification/], [{ licenseUrl: undefined }, /licenseUrl/], [{ authors: [] }, /autor/]]) {
    const r = eva(o); assert.ok(!r.ok, JSON.stringify(o)); assert.match(r.motivos.join("|"), motivo);
  }
  // sin los campos, los valores por defecto de la especificación (onlyAuthor, personalNonProfit, sin redistribución) lo rechazan
  const r = evaluaLicencia(leeMeta({ extensions: { VRMC_vrm: { meta: { name: "x", authors: ["a"], licenseUrl: "https://x.invalid/" } } } }));
  assert.ok(!r.ok && r.motivos.length >= 3, r.motivos.join("|"));
  const v0 = o => evaluaLicencia(leeMeta({ extensions: { VRM: { meta: Object.assign({ title: "x", author: "a", allowedUserName: "Everyone", commercialUssageName: "Allow", licenseName: "CC0" }, o) } } }));
  assert.ok(v0({}).ok && v0({ licenseName: "CC_BY" }).ok);
  for (const o of [{ licenseName: "CC_BY_NC" }, { licenseName: "Redistribution_Prohibited" }, { licenseName: "CC_BY_SA" }, { licenseName: "Other" }, { allowedUserName: "OnlyAuthor" }, { commercialUssageName: "Disallow" }]) assert.ok(!v0(o).ok, JSON.stringify(o));
  assert.throws(() => leeMeta({ extensions: {} }), /no es un VRM/);
});

// ---------------------------------------------------------------------------------------------------------------- la tubería sobre el sintético
const montaOrigen = async (opc, lado) => {
  const { generaVRM } = await imp("sintetico.mjs"), d = propia("avatares-origen");
  fs.writeFileSync(path.join(d, "sint.vrm"), generaVRM(opc));
  fs.writeFileSync(path.join(d, "sint.avatar.json"), JSON.stringify(Object.assign({ id: "sintetico", nombre: "Sintético", licencia: { spdx: "CC0-1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" }, fuente: { nombre: "generado por tuberia/avatares/sintetico.mjs" }, colores_muneco: { camisa: "#3f7cc2", piel: "#d9a47c", sombrero: "gorra" } }, lado)));
  return d;
};

let compartido = null;
const construido = async () => {
  if (!compartido) compartido = (async () => {
    const { construye } = await imp("construye.mjs"), origen = await montaOrigen({ subdivision: 14, pixeles: 1280 }), salida = propia("avatares-salida");
    return { origen, salida, r: await construye({ origen, salida, compresion: "cuantizacion" }) };
  })();
  return compartido;
};

test("tubería: el sintético (≈ 42 k triángulos, texturas de 1280) sale con ≤ 20 k triángulos, ≤ 2 MB, texturas ≤ 1024 y un catálogo que cumple el esquema", async () => {
  const { salida, r } = await construido();
  assert.deepStrictEqual(r.rechazados, []);
  const cat = JSON.parse(fs.readFileSync(path.join(salida, "catalogo.json"), "utf8")), v = valida();
  assert.ok(v(cat), JSON.stringify(v.errors));
  assert.deepStrictEqual(cat.avatares.map(a => a.id), ["sintetico"]);
  const a = cat.avatares[0], b = fs.readFileSync(path.join(salida, a.fichero));
  assert.strictEqual(a.fichero, "sintetico.vrm"); assert.strictEqual(a.sha256, sha(b), "la huella del catálogo es la del fichero"); assert.strictEqual(a.bytes, b.length);
  assert.ok(a.triangulos <= cat.topes.triangulos_max && a.triangulos > 1000, a.triangulos + " triángulos");
  assert.ok(a.bytes <= cat.topes.bytes_max, a.bytes + " bytes");
  assert.strictEqual(a.vrm_version, "1.0"); assert.strictEqual(a.contornos_quitados, 1);
  assert.strictEqual(a.licencia.spdx, "CC0-1.0"); assert.strictEqual(a.licencia.credito_obligatorio, false);
  assert.deepStrictEqual(fs.readdirSync(salida).sort(), ["catalogo.json", "sintetico.vrm", "sintetico.vrm.br", "sintetico.vrm.gz", "sintetico.vrm.zst"]);
  // los precomprimidos (los que sirve Caddy con `precompressed br zstd gzip`) descomprimen al mismo fichero
  const zlib = require("node:zlib"), d = e => fs.readFileSync(path.join(salida, "sintetico.vrm." + e));
  assert.ok(zlib.brotliDecompressSync(d("br")).equals(b) && zlib.gunzipSync(d("gz")).equals(b) && zlib.zstdDecompressSync(d("zst")).equals(b), "un precomprimido no es el fichero");
  // determinista: el mismo origen da los mismos bytes
  const { construye } = await imp("construye.mjs"), otra = propia("avatares-salida2"); await construye({ origen: (await construido()).origen, salida: otra });
  assert.strictEqual(sha(fs.readFileSync(path.join(otra, "sintetico.vrm"))), a.sha256, "la tubería no es determinista");
});

test("tubería: el glb de salida es válido (gltf-validator), con KHR_mesh_quantization como única extensión obligatoria, sin contorno y con las extensiones de VRM intactas", async () => {
  const { salida } = await construido(), { leeGlb } = await imp("vrm.mjs"), { origen } = await construido();
  const b = fs.readFileSync(path.join(salida, "sintetico.vrm")), inf = await validador.validateBytes(new Uint8Array(b), { uri: "sintetico.vrm", format: "glb" });
  assert.strictEqual(inf.issues.numErrors, 0, JSON.stringify(inf.issues.messages.filter(m => m.severity === 0).slice(0, 5)));
  const j = leeGlb(b).json, j0 = leeGlb(fs.readFileSync(path.join(origen, "sint.vrm"))).json;
  assert.deepStrictEqual(j.extensionsRequired, ["KHR_mesh_quantization"], "sin meshopt: no hace falta WebAssembly");
  assert.ok(!(j.extensionsUsed || []).includes("EXT_meshopt_compression"));
  assert.deepStrictEqual(j.extensions.VRMC_vrm, j0.extensions.VRMC_vrm, "VRMC_vrm (meta, huesos, expresiones) igual");
  assert.deepStrictEqual(j.extensions.VRMC_springBone, j0.extensions.VRMC_springBone, "VRMC_springBone igual");
  assert.deepStrictEqual(j.nodes.map(n => n.name), j0.nodes.map(n => n.name)); assert.deepStrictEqual(j.materials.map(m => m.name), j0.materials.map(m => m.name));
  assert.deepStrictEqual(j.meshes.map(m => m.name), j0.meshes.map(m => m.name));
  assert.ok(j0.materials.some(m => m.extensions.VRMC_materials_mtoon.outlineWidthMode === "worldCoordinates"), "el origen sí tenía contorno");
  for (const m of j.materials) assert.ok(!m.extensions.VRMC_materials_mtoon.outlineWidthMode || m.extensions.VRMC_materials_mtoon.outlineWidthMode === "none", "contorno sin apagar");
  // las texturas de MToon siguen siendo texturas válidas de la salida, del tamaño pedido
  const mt = j.materials[0].extensions.VRMC_materials_mtoon.shadeMultiplyTexture; assert.ok(mt && j.textures[mt.index], "shadeMultiplyTexture sin textura");
  assert.strictEqual(j.images.length, 2);
  const { ImageUtils } = require(path.join(AV, "node_modules", "@gltf-transform", "core"));
  const { json: _j, bin } = leeGlb(b); void _j;
  for (const im of j.images) { const bv = j.bufferViews[im.bufferView], px = ImageUtils.getSize(new Uint8Array(bin.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength)), im.mimeType); assert.ok(Math.max(...px) <= 1024, "textura de " + px); }
});

test("tubería: la cuantización no deforma al avatar con esqueleto (cuadro delimitador en la pose de reposo igual que sin comprimir), y meshopt decodifica igual", async () => {
  const { creaIO } = await imp("optimiza.mjs"), { optimiza } = await imp("optimiza.mjs"), { generaVRM } = await imp("sintetico.mjs");
  const orig = generaVRM({ subdivision: 6, pixeles: 256 });
  const caja = async bytes => {
    const doc = await creaIO().readBinary(new Uint8Array(bytes)), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const n of doc.getRoot().listNodes()) {
      const m = n.getMesh(), sk = n.getSkin(); if (!m || !sk) continue;
      const juntas = sk.listJoints().map(x => x.getWorldMatrix()), ibm = sk.getInverseBindMatrices();
      const mat = (a, v) => [a[0] * v[0] + a[4] * v[1] + a[8] * v[2] + a[12], a[1] * v[0] + a[5] * v[1] + a[9] * v[2] + a[13], a[2] * v[0] + a[6] * v[1] + a[10] * v[2] + a[14]];
      const mul = (a, b) => { const o = Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
      for (const p of m.listPrimitives()) {
        const P = p.getAttribute("POSITION"), J = p.getAttribute("JOINTS_0"), W = p.getAttribute("WEIGHTS_0"), v = [0, 0, 0], jj = [0, 0, 0, 0], ww = [0, 0, 0, 0], im = new Array(16);
        for (let i = 0; i < P.getCount(); i++) {
          P.getElement(i, v); J.getElement(i, jj); W.getElement(i, ww);
          ibm.getElement(jj[0], im); const q = mat(mul(juntas[jj[0]], im), v);
          for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); }
        }
      }
    }
    return { mn, mx };
  };
  const [sin, cuant, mop] = await Promise.all(["ninguna", "cuantizacion", "meshopt"].map(c => optimiza(orig, { compresion: c, topes: { triangulos_max: 1e9 } })));
  const A = await caja(sin.bytes), B = await caja(cuant.bytes), C = await caja(mop.bytes);
  assert.ok(A.mx[1] - A.mn[1] > 1.5, "el avatar mide ≈ 1,9 m: " + (A.mx[1] - A.mn[1]));
  for (const [nombre, X] of [["cuantizacion", B], ["meshopt", C]]) for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(X.mn[k] - A.mn[k]) < 0.01 && Math.abs(X.mx[k] - A.mx[k]) < 0.01, nombre + ": eje " + k + " " + X.mn[k] + ".." + X.mx[k] + " frente a " + A.mn[k] + ".." + A.mx[k]);
  }
  assert.ok(mop.bytes.length < cuant.bytes.length, "meshopt pesa menos en disco");
  assert.ok(JSON.parse(Buffer.from(mop.bytes).subarray(20, 20 + Buffer.from(mop.bytes).readUInt32LE(12)).toString()).extensionsRequired.includes("EXT_meshopt_compression"));
});

test("tubería: RECHAZA el VRM cuyo meta no deja servirlo a una empresa, y no escribe nada", async () => {
  const { construye } = await imp("construye.mjs");
  for (const meta of [{ avatarPermission: "onlyAuthor" }, { commercialUsage: "personalProfit" }, { allowRedistribution: false }, { modification: "prohibited" }]) {
    const origen = await montaOrigen({ subdivision: 3, pixeles: 64, meta }), salida = propia("avatares-rechazo");
    const r = await construye({ origen, salida });
    assert.strictEqual(r.rechazados.length, 1, JSON.stringify(meta)); assert.match(r.rechazados[0].motivos.join("|"), /licencia/);
    assert.deepStrictEqual(fs.readdirSync(salida), [], "nada escrito: " + JSON.stringify(meta));
  }
});

test("tubería: rechaza el que pasa los topes (más texturas o materiales de los permitidos, o más bytes) y exige SPDX declarado para un VRM 1.0", async () => {
  const { construye } = await imp("construye.mjs");
  const origen = await montaOrigen({ subdivision: 3, pixeles: 64 }), a = propia("avatares-t");
  const r = await construye({ origen, salida: a, topes: { texturas_max: 1, materiales_max: 1, bytes_max: 100 } });
  assert.strictEqual(r.rechazados.length, 1); const m = r.rechazados[0].motivos.join("|");
  assert.match(m, /texturas/); assert.match(m, /materiales/); assert.match(m, /bytes/); assert.deepStrictEqual(fs.readdirSync(a), []);
  const sin = await montaOrigen({ subdivision: 3, pixeles: 64 }, { licencia: {} }), b = propia("avatares-t2");
  const r2 = await construye({ origen: sin, salida: b }); assert.match(r2.rechazados[0].motivos.join("|"), /SPDX/);
});

test("tubería: se niega a usar carpetas dentro del repo (los avatares no se versionan)", async () => {
  const { fueraDelRepo } = await imp("construye.mjs");
  assert.throws(() => fueraDelRepo(path.join(RAIZ, "apps"), "x"), /dentro del repo/);
  assert.throws(() => fueraDelRepo(path.join(RAIZ, "tuberia", "avatares", "origen"), "x"), /dentro del repo/);
  assert.ok(fueraDelRepo(path.join(RAIZ, "pruebas", "salida", "av"), "x").endsWith("av"));
});

// ---------------------------------------------------------------------------------------------------------------- los CC0 provisionales
test("fuentes.json: avatares CC0 con sha256 fijado, https y licencia CC0 verificada; descarga.mjs se niega si el contenido cambia", async () => {
  const F = JSON.parse(lee("tuberia/avatares/fuentes.json")), ids = F.avatares.map(a => a.id);
  assert.ok(F.avatares.length >= 3 && F.avatares.length <= 4, "3-4 provisionales (decisión 74)");
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const a of F.avatares) {
    assert.match(a.id, /^[a-z0-9-]{1,32}$/); assert.match(a.url, /^https:\/\//); assert.match(a.sha256, /^[0-9a-f]{64}$/);
    assert.strictEqual(a.licencia.spdx, "CC0-1.0"); assert.strictEqual(a.licencia.nombre_meta, "CC0"); assert.ok(a.autor && a.fuente.nombre && a.fuente.url);
    assert.match(a.colores_muneco.camisa, /^#[0-9a-f]{6}$/); assert.ok(["ninguno", "paja", "gorra"].includes(a.colores_muneco.sombrero));
  }
  const { descarga } = await imp("descarga.mjs"), { generaVRM } = await imp("sintetico.mjs");
  const falso = { avatares: [{ id: "x", nombre: "X", url: "https://x.invalid/x", sha256: "0".repeat(64), licencia: { spdx: "CC0-1.0", nombre_meta: "CC0", url: "https://creativecommons.org/publicdomain/zero/1.0/" }, autor: "a", fuente: { nombre: "n" }, colores_muneco: {} }] };
  const d = propia("avatares-descarga");
  await assert.rejects(descarga({ destino: d, fuentes: falso, traer: async () => generaVRM({ subdivision: 2, pixeles: 32 }) }), /sha256 no es el fijado/);
  assert.deepStrictEqual(fs.readdirSync(d), [], "nada escrito");
  // con la huella buena, pero un meta que ya no vale: se niega
  const malo = generaVRM({ subdivision: 2, pixeles: 32, meta: { avatarPermission: "onlyAuthor" } });
  falso.avatares[0].sha256 = sha(malo);
  await assert.rejects(descarga({ destino: d, fuentes: falso, traer: async () => malo }), /meta ya no permite/);
  await assert.rejects(descarga({ destino: path.join(RAIZ, "apps", "avatares"), fuentes: falso, traer: async () => malo }), /dentro del repo/);
});

test("el repo no versiona ningún .vrm ni la salida del catálogo (regla 4)", () => {
  const malos = ficheros().filter(f => /\.vrm$/i.test(f) || /(^|\/)avatares\/catalogo\.json$/.test(f));
  assert.deepStrictEqual(malos, []);
});

"use strict";
// Tubería de texturas de suelo (EV-1s, tuberia/suelo/): el núcleo (aplanar la luz, normalizar alrededor de 1, sin costuras, relieve, mitad) sobre
// imágenes sintéticas; la tubería entera sobre «fotos» sintéticas (determinista: misma entrada → mismos bytes; repetible; sin EXIF); y que lo
// versionado en apps/web/public/suelo/ es lo que dice su manifiesto, con las clases y los metros del motor. Las fotos de verdad no están en el repo:
// aquí no hacen falta. Sin sharp (cd tuberia/suelo && npm ci) se saltan, con aviso, las que codifican imágenes.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, lee, fs, path } = require("./_util");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto"), os = require("node:os");

const SU = path.join(RAIZ, "tuberia", "suelo");
const imp = f => import(pathToFileURL(path.join(SU, f)).href);
const HAY_SHARP = fs.existsSync(path.join(SU, "node_modules", "sharp", "package.json"));
const sinSharp = HAY_SHARP ? false : "falta sharp en tuberia/suelo (cd tuberia/suelo && npm ci)";
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const RECETAS = JSON.parse(lee("tuberia/suelo/recetas.json"));

// ruido determinista (sin Math.random)
function ruido(w, h, c, semilla) {
  let s = semilla >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const d = new Float32Array(w * h * c); for (let i = 0; i < d.length; i++) d[i] = r(); return { w, h, c, d };
}

test("aplana: quita un degradado de luz grande y deja la media por columnas en ≈ 1", async () => {
  const N = await imp("nucleo.mjs"), im = ruido(128, 128, 3, 7);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) for (let c = 0; c < 3; c++) { const i = (y * 128 + x) * 3 + c; im.d[i] = (0.3 + 0.4 * im.d[i]) * (0.3 + 0.7 * x / 127); }
  const f = N.aplana(im, 10), cols = [];
  for (let x = 4; x < 124; x++) { let s = 0; for (let y = 0; y < 128; y++) s += f.d[(y * 128 + x) * 3]; cols.push(s / 128); }
  assert.ok(N.desviacion(Float32Array.from(cols)) < 0.04, "quedan restos del degradado: " + N.desviacion(Float32Array.from(cols)));
  assert.ok(Math.abs(N.media(Float32Array.from(cols)) - 1) < 0.05);
});

test("normaliza: media ≈ 1 y la desviación de la claridad, la pedida; nada pasa de [0, 2)", async () => {
  const N = await imp("nucleo.mjs"), im = ruido(96, 96, 3, 3); for (let i = 0; i < im.d.length; i++) im.d[i] = 0.5 + im.d[i];
  const o = N.normaliza(im, 0.15, 0.7), l = N.claridad(o).d;
  assert.ok(Math.abs(N.media(l) - 1) < 0.01); assert.ok(Math.abs(N.desviacion(l) - 0.15) < 0.02, "σ = " + N.desviacion(l));
  assert.ok(o.d.every(v => v >= 0 && v < 2));
});

test("sin costura: el borde izquierdo continúa en el derecho (y el de arriba en el de abajo); sin tocar, no", async () => {
  const N = await imp("nucleo.mjs"), im = ruido(128, 128, 3, 11);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) for (let c = 0; c < 3; c++) { const i = (y * 128 + x) * 3 + c; im.d[i] = 0.25 * im.d[i] + 0.6 * (x / 127) * (y / 127); }
  const antes = N.costura(im.d, 128, 128, 3).cociente;
  const sc = N.sinCostura(N.aplana(N.desenfoca(im, 1, true), 10), 0.18), despues = N.costura(sc.d, 128, 128, 3).cociente;   // en el orden de la tubería
  assert.ok(antes > 2, "la imagen de prueba debería tener costura: " + antes);
  assert.ok(despues < 1.3, "queda costura: " + despues);
  const m = N.mitad(sc); assert.ok(N.costura(m.d, 64, 64, 3).cociente < 1.3, "la mitad debe seguir siendo repetible");
  const h = N.relieve(sc, 1, 6); assert.ok(N.costura(h.d, 128, 128, 1).cociente < 1.3, "el relieve también");
});

test("la tubería entera sobre fotos sintéticas: determinista, repetible, sin EXIF, 2 tamaños por clase", { skip: sinSharp }, async () => {
  const sharp = require("node:module").createRequire(path.join(SU, "package.json"))("sharp");
  const T = await imp("construye.mjs"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "suelo-"));
  try {
    const fotos = path.join(dir, "fotos"); fs.mkdirSync(fotos);
    for (const [id, sem] of [["01", 5], ["02", 9]]) {
      const im = ruido(320, 240, 3, sem), b = Buffer.alloc(im.d.length);
      for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) for (let c = 0; c < 3; c++) { const i = (y * 320 + x) * 3 + c; b[i] = Math.round(255 * Math.min(1, (0.3 + 0.4 * im.d[i]) * (0.5 + 0.5 * x / 319) + (c === 0 ? 0.1 : 0))); }
      await sharp(b, { raw: { width: 320, height: 240, channels: 3 } }).withExif({ IFD0: { Copyright: "prueba", Artist: "nadie" } }).jpeg({ quality: 90 }).toFile(path.join(fotos, id + ".jpg"));
    }
    const clases = [{ id: "calle", nombre: "a", fuente: "01", recorte: [0, 0, 1, 1], metros: 1, contraste: 0.16, saturacion: 0.7, color: ["02"] },
      { id: "ruedo", nombre: "b", fuente: "02", recorte: [0.2, 0, 0.6, 1], metros: 1, contraste: 0.13, saturacion: 0.7, color: [] }];
    const opc = { clases, tamanos: [128, 64], lado: 128, calidad: 80 };
    const r1 = await T.construye({ fotos, salida: path.join(dir, "s1"), opc }), r2 = await T.construye({ fotos, salida: path.join(dir, "s2"), opc });
    assert.deepStrictEqual(Object.keys(r1.manifiesto.ficheros).sort(), ["calle_128.webp", "calle_128_relieve.webp", "calle_64.webp", "calle_64_relieve.webp", "ruedo_128.webp", "ruedo_128_relieve.webp", "ruedo_64.webp", "ruedo_64_relieve.webp"]);
    assert.deepStrictEqual(r1.manifiesto.ficheros, r2.manifiesto.ficheros, "misma entrada → mismos bytes");
    for (const f of Object.keys(r1.manifiesto.ficheros)) {
      const p = path.join(dir, "s1", f), m = await sharp(p).metadata(), px = f.includes("_128") ? 128 : 64;
      assert.strictEqual(sha(fs.readFileSync(p)), r1.manifiesto.ficheros[f].sha256);
      assert.strictEqual(m.width, px); assert.strictEqual(m.height, px); assert.strictEqual(m.format, "webp");
      assert.ok(!m.exif && !m.icc && !m.xmp, f + ": no debe llevar metadatos de la foto");
      const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
      const N = await imp("nucleo.mjs"); assert.ok(N.costura(data, info.width, info.height, info.channels).cociente < 1.6, f + ": costura " + N.costura(data, info.width, info.height, info.channels).cociente);
      if (!f.includes("relieve")) { let s = 0; for (let i = 0; i < data.length; i++) s += data[i]; assert.ok(Math.abs(s / data.length / 127.5 - 1) < 0.08, f + ": la media debe ser ≈ 1 (byte 127,5)"); }
    }
    const txt = fs.readFileSync(path.join(dir, "s1", "suelo.json"), "utf8");
    assert.ok(!txt.includes(dir) && !/[A-Za-z]:[\\/]/.test(txt), "el manifiesto no lleva rutas");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("lo versionado en apps/web/public/suelo/ es lo del manifiesto: clases y metros de las recetas y del motor, huellas, tamaños", () => {
  const dir = path.join(RAIZ, "apps", "web", "public", "suelo"), man = JSON.parse(fs.readFileSync(path.join(dir, "suelo.json"), "utf8"));
  const fuente = lee("apps/web/motor/04f_suelo_fotos.js"), i = fuente.indexOf("// [puro:inicio]"), f = fuente.indexOf("// [puro:fin]");
  const P = new Function("\"use strict\";\n" + fuente.slice(i, f) + "\nreturn SueloFotosPuro;")();
  assert.deepStrictEqual(man.clases.map(c => c.id), RECETAS.clases.map(c => c.id));
  assert.deepStrictEqual(P.CLASES, RECETAS.clases.map(c => c.id), "el orden de los niveles del motor es el de las recetas");
  assert.deepStrictEqual(P.METROS, RECETAS.clases.map(c => c.metros), "los metros del motor son los de las recetas");
  man.clases.forEach((c, k) => assert.strictEqual(c.capa, k));
  const esperados = []; for (const c of RECETAS.clases) for (const px of RECETAS.tamanos) esperados.push(c.id + "_" + px + ".webp", c.id + "_" + px + "_relieve.webp");
  assert.deepStrictEqual(Object.keys(man.ficheros).sort(), esperados.sort());
  for (const [nom, d] of Object.entries(man.ficheros)) {
    const b = fs.readFileSync(path.join(dir, nom)); assert.strictEqual(b.length, d.bytes, nom); assert.strictEqual(sha(b), d.sha256, nom + ": no es el del manifiesto (¿se regeneró sin escribir suelo.json?)");
  }
  assert.ok(fs.existsSync(path.join(dir, "LICENCIA.md")));
  const presu = P.presupuesto(1024); assert.strictEqual(presu.texturaMB, man.memoria_gpu_mb["1024"]); assert.strictEqual(P.presupuesto(512).texturaMB, man.memoria_gpu_mb["512"]);
});

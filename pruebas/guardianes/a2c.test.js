"use strict";
// AG-2.1: ?a2c=0|1 y Materiales.recorte (apps/web/motor/02i_materiales.js), en Node y con el three de verdad (pantalla) y, si está, super-three (VR).
//   · la perilla: defecto APAGADO (las copas de cerca salían blanquecinas); 1 enciende; un valor raro avisa y se queda como estaba; el ajuste «vista.a2c» enciende; orden URL > ajuste > apagado; sin MSAA (?xraa=0) no se enciende nunca;
//   · recorte(): solo toca materiales con alphaTest > 0 y nunca los de sombra (MeshDepthMaterial); conserva el umbral; recortes(false/true) los apaga y enciende;
//   · cada sitio de recorte alfa del motor pasa por la fábrica (fuentes) y el contexto sigue creándose con antialias: XrPerillas.aa.
// No dibuja nada: cómo se ve lo dan las capturas (pruebas/a2c_capturas.js) y, en el Quest o el iPhone, nadie todavía (no probado).
const test = require("node:test"), assert = require("node:assert"), path = require("path"), fs = require("fs"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");
const { fabrica } = require("./_materiales");

const LIB = { pantalla: "three", vr: "super-three" }, TH = {};
test.before(async () => {
  for (const b of Object.keys(LIB)) {
    const f = path.join(RAIZ, "apps/web/node_modules", LIB[b], "build/three.module.js");
    if (fs.existsSync(f)) TH[b] = await import(pathToFileURL(f).href);
  }
  assert.ok(TH.pantalla, "falta three en apps/web/node_modules (npm i)");
});
const plano = x => JSON.parse(JSON.stringify(x));

test("la perilla: defecto apagado, 1 enciende, lo raro avisa, sin MSAA nunca", () => {
  const { Materiales } = fabrica(TH.pantalla), E = (q, m, aj) => plano(Materiales.eligeA2c(q, m, aj));
  for (const q of ["", "?debug", undefined, null]) { assert.strictEqual(E(q).activo, false, String(q)); assert.strictEqual(E(q).origen, "defecto"); }
  for (const q of ["?a2c=1", "?x=1&a2c=1&y=2"]) { assert.strictEqual(E(q).activo, true, String(q)); assert.strictEqual(E(q).origen, "url"); }
  assert.strictEqual(E("?a2c=0").activo, false);
  assert.strictEqual(E("?a=1&a2c=0&b=2").activo, false);
  const raro = E("?a2c=si");
  assert.strictEqual(raro.activo, false); assert.match(raro.advertencia, /solo vale 0 o 1/);
  const sin = E("?a2c=1", false);
  assert.strictEqual(sin.activo, false); assert.match(sin.motivo, /sin MSAA/);
  assert.strictEqual(E("", false).activo, false, "sin MSAA no se enciende ni por defecto");
  assert.strictEqual(E("", true, true).activo, true, "el ajuste lo enciende");
  assert.strictEqual(E("", true, true).origen, "ajuste");
  assert.strictEqual(E("", true, false).activo, false); assert.strictEqual(E("", true, undefined).activo, false);
  // orden de mando: la URL, luego el ajuste, luego apagado
  assert.strictEqual(E("?a2c=0", true, true).activo, false, "la URL apaga aunque el ajuste encienda"); assert.strictEqual(E("?a2c=0", true, true).origen, "url");
  assert.strictEqual(E("?a2c=1", true, false).activo, true, "la URL enciende aunque el ajuste esté apagado");
  assert.strictEqual(E("?a2c=si", true, true).activo, true, "un valor raro cae al ajuste"); assert.match(E("?a2c=si", true, true).advertencia, /el ajuste/);
  assert.strictEqual(E("", false, true).activo, false, "el ajuste tampoco enciende sin MSAA");
  assert.strictEqual(Materiales.a2c.activo, false, "en la fábrica (Node, sin localStorage) el defecto es apagado");
});

test("el ajuste «vista.a2c» está en el esquema (apagado) y 02i lo lee de localStorage una vez, con try/catch", () => {
  assert.match(lee("apps/web/motor/33_ajustes.js"), /"vista\.a2c": bool\(false\)/);
  const m = lee("apps/web/motor/02i_materiales.js");
  assert.match(m, /function ajusteGuardado\(clave\) \{ try \{ var s = window\.localStorage\.getItem\("gemelo\.ajustes\." \+ clave\)[^}]*\} catch \(e\)/);
  assert.match(m, /ajusteGuardado\("vista\.a2c"\)/);
});

for (const b of ["pantalla", "vr"]) {
  test("recorte() y recortes() (build " + b + ")", (t) => {
    if (!TH[b]) return t.skip("no hay " + LIB[b] + " instalado");
    const T = TH[b];
    for (const [q, esperado] of [["", false], ["?a2c=1", true], ["?a2c=0", false]]) {
      const { Materiales } = fabrica(T, { busqueda: q });
      const hoja = Materiales.recorte(new T.MeshLambertMaterial({ alphaTest: 0.42, side: T.DoubleSide }));
      const pts = Materiales.recorte(new T.PointsMaterial({ alphaTest: 0.4 }));
      const liso = Materiales.recorte(new T.MeshLambertMaterial({}));
      const sombra = Materiales.recorte(new T.MeshDepthMaterial({ alphaTest: 0.45 }));
      assert.strictEqual(hoja.alphaToCoverage, esperado, q + " hoja"); assert.strictEqual(pts.alphaToCoverage, esperado, q + " puntos");
      assert.strictEqual(hoja.alphaTest, 0.42, "el umbral original se conserva"); assert.strictEqual(pts.alphaTest, 0.4);
      assert.strictEqual(liso.alphaToCoverage, false, "sin recorte alfa no se toca");
      assert.strictEqual(sombra.alphaToCoverage, false, "la sombra no tiene MSAA: sigue con alphaTest"); assert.strictEqual(sombra.alphaTest, 0.45);
      assert.strictEqual(Materiales.a2c.n, 2, "solo se apuntan los dos recortes de cara de color");
      assert.strictEqual(Materiales.recorte(null), null);
      Materiales.recortes(false); assert.strictEqual(hoja.alphaToCoverage, false); assert.strictEqual(pts.alphaToCoverage, false);
      Materiales.recortes(true); assert.strictEqual(hoja.alphaToCoverage, esperado, "recortes(true) devuelve lo pedido, no más"); assert.strictEqual(pts.alphaToCoverage, esperado);
    }
  });
}

test("cada material de recorte alfa del motor pasa por Materiales.recorte (y la corteza, la sombra y las láminas no)", () => {
  const f = n => lee("apps/web/motor/" + n);
  assert.strictEqual((f("07_follaje.js").match(/Materiales\.recorte\(new THREE\.PointsMaterial\(\{[^}]*alphaTest/g) || []).length, 2, "hoja grande y pequeña");
  assert.match(f("21_suelo.js"), /matMata = Materiales\.recorte\(new THREE\.MeshLambertMaterial\(\{ map: texHierba, alphaTest/);
  assert.strictEqual((f("07ac_lejanos.js").match(/Materiales\.recorte\(new THREE\.MeshLambertMaterial\(\{[^}]*alphaTest: 0\.5/g) || []).length, 2, "impostor lejano y sustituto");
  const g = f("07ab_generados.js"), i = g.indexOf("function parcheGen"), j = g.indexOf("function profundidad");
  const cuerpo = g.slice(i, j);
  assert.ok(cuerpo.indexOf("isMeshDepthMaterial") < cuerpo.indexOf("Materiales.recorte(m)"), "la sombra sale antes: no se recorta");
  // el horneado de los impostores (blanco sin MSAA) apaga el recorte mientras dibuja y lo devuelve
  const l = f("07ac_lejanos.js"); assert.ok(l.indexOf("Materiales.recortes(false)") > 0 && l.indexOf("Materiales.recortes(true)") > l.indexOf("Materiales.recortes(false)"));
  assert.ok(!/alphaTest/.test(f("04f_suelo_fotos.js")), "el suelo de fotos no tiene recorte alfa (y no se toca: EV-1k)");
  assert.match(f("02d_laminas.js"), /alphaTest: 0\.5, fog: false, toneMapped: false/, "las láminas de texto siguen con alphaTest (fuera de AG-2.1)");
});

test("MSAA: el contexto se crea con antialias: XrPerillas.aa (defecto 1) y 02i lo lee de ahí", () => {
  assert.match(lee("apps/web/motor/03_escena.js"), /antialias: XrPerillas\.aa/);
  assert.match(lee("apps/web/motor/02f_xr_perillas.js"), /aa: true/);
  assert.match(lee("apps/web/motor/02i_materiales.js"), /XrPerillas\.aa/);
});

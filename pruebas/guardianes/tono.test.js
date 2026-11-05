"use strict";
// AG-2.5: ?tono= y ?expo= (apps/web/motor/02h_render.js, aplicado en 03_escena.js), en Node y con el three de verdad (pantalla) y, si está, super-three (VR).
//   · sin perilla, o con un valor desconocido: «neutro» = NoToneMapping, exposición 1 y el renderer sin tocar (lo de siempre);
//   · cada valor se traduce a la constante de three correcta, en las dos builds;
//   · 03_escena solo toca el renderer si el tono no es neutro. No dice nada de cómo se ve: eso lo dan las capturas (pruebas/tono_capturas.js).
const test = require("node:test"), assert = require("node:assert"), path = require("path"), fs = require("fs"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");
const { fabrica } = require("./_materiales");

const plano = x => JSON.parse(JSON.stringify(x));
const LIB = { pantalla: "three", vr: "super-three" }, TH = {};
test.before(async () => {
  for (const b of Object.keys(LIB)) {
    const f = path.join(RAIZ, "apps/web/node_modules", LIB[b], "build/three.module.js");
    if (fs.existsSync(f)) TH[b] = await import(pathToFileURL(f).href);
  }
  assert.ok(TH.pantalla, "falta three en apps/web/node_modules (npm i)");
});

test("orden de mando: la URL, luego el ajuste «vista.tono», luego neutro", () => {
  const { RenderPuro } = fabrica(TH.pantalla), E = (q, aj) => plano(RenderPuro.eligeTono(q, aj));
  assert.strictEqual(E("", undefined).tono, "neutro"); assert.strictEqual(E("", undefined).origen, "defecto");
  assert.strictEqual(E("", "neutro").origen, "defecto");
  for (const t of ["agx", "aces", "neutral"]) { const r = E("", t); assert.strictEqual(r.tono, t); assert.strictEqual(r.origen, "ajuste"); assert.strictEqual(r.constante, RenderPuro.TONOS[t]); }
  assert.strictEqual(E("?tono=aces", "agx").tono, "aces", "la URL manda"); assert.strictEqual(E("?tono=aces", "agx").origen, "url");
  assert.strictEqual(E("?tono=neutro", "agx").tono, "neutro", "?tono=neutro apaga un ajuste");
  const raro = E("?tono=rosa", "agx"); assert.strictEqual(raro.tono, "agx", "un valor raro de la URL cae al ajuste"); assert.match(raro.advertencia, /el ajuste/);
  assert.strictEqual(E("", "rosa").tono, "neutro", "un ajuste raro (localStorage manipulado) se ignora");
  assert.strictEqual(E("?expo=2", "agx").expo, 2, "?expo= solo va en la URL y vale con un tono del ajuste");
  assert.strictEqual(E("?expo=2", undefined).expo, 1);
  const r = lee("apps/web/motor/02h_render.js");
  assert.match(r, /function ajusteGuardado\(clave\) \{ try \{ var s = window\.localStorage\.getItem\("gemelo\.ajustes\." \+ clave\)[^}]*\} catch \(e\)/);
  assert.match(r, /ajusteGuardado\("vista\.tono"\)/);
  assert.match(lee("apps/web/motor/33_ajustes.js"), /"vista\.tono": opc\("neutro", \["neutro", "agx", "aces", "neutral"\]\)/);
});

test("sin perilla: neutro, NoToneMapping y exposición 1", () => {
  const { RenderPuro, Render } = fabrica(TH.pantalla);
  for (const q of ["", "?debug", "?a=1&render=clasico", undefined, null]) {
    assert.deepStrictEqual(plano(RenderPuro.eligeTono(q)), { pedido: "", tono: "neutro", constante: "NoToneMapping", expo: 1, advertencia: "", origen: "defecto" }, String(q));
  }
  assert.strictEqual(Render.tono.tono, "neutro");
  assert.strictEqual(TH.pantalla[Render.tono.constante], TH.pantalla.NoToneMapping);
});

for (const b of ["pantalla", "vr"]) {
  test("cada ?tono= es la constante de three correcta (build " + b + ")", (t) => {
    if (!TH[b]) return t.skip("no hay " + LIB[b] + " instalado");
    const T = TH[b], { RenderPuro } = fabrica(T);
    const esperado = { neutro: T.NoToneMapping, agx: T.AgXToneMapping, aces: T.ACESFilmicToneMapping, neutral: T.NeutralToneMapping };
    for (const k of Object.keys(esperado)) {
      assert.notStrictEqual(esperado[k], undefined, k + " existe en " + LIB[b]);
      const r = RenderPuro.eligeTono("?x=1&tono=" + k.toUpperCase());
      assert.strictEqual(r.tono, k); assert.strictEqual(T[r.constante], esperado[k], k); assert.strictEqual(r.advertencia, "");
    }
    assert.strictEqual(new Set(Object.values(esperado)).size, 4, "las cuatro constantes son distintas");
  });
}

test("valor desconocido o vacío: cae en neutro (el desconocido avisa)", () => {
  const { RenderPuro } = fabrica(TH.pantalla);
  for (const v of ["reinhard", "linear", "constructor", "__proto__", "1"]) {
    const r = RenderPuro.eligeTono("?tono=" + v); assert.strictEqual(r.tono, "neutro", v); assert.strictEqual(r.constante, "NoToneMapping", v); assert.match(r.advertencia, /no existe/, v);
  }
  const vacio = RenderPuro.eligeTono("?tono="); assert.strictEqual(vacio.tono, "neutro"); assert.strictEqual(vacio.advertencia, "");
});

test("?expo=: número con recorte 0,1-4 y coma decimal; sin efecto en neutro; basura = 1 con aviso", () => {
  const { RenderPuro } = fabrica(TH.pantalla);
  assert.strictEqual(RenderPuro.eligeTono("?tono=agx&expo=1.5").expo, 1.5);
  assert.strictEqual(RenderPuro.eligeTono("?tono=aces&expo=0,8").expo, 0.8);
  assert.strictEqual(RenderPuro.eligeTono("?tono=agx&expo=99").expo, 4);
  assert.strictEqual(RenderPuro.eligeTono("?tono=agx&expo=0").expo, 0.1);
  assert.strictEqual(RenderPuro.eligeTono("?expo=2").expo, 1, "sin tono no hay exposición");
  assert.strictEqual(RenderPuro.eligeTono("?tono=neutro&expo=2").expo, 1);
  const m = RenderPuro.eligeTono("?tono=agx&expo=mucha"); assert.strictEqual(m.expo, 1); assert.match(m.advertencia, /expo/);
});

test("03_escena: solo toca el renderer si el tono no es neutro", () => {
  const f = lee("apps/web/motor/03_escena.js");
  const i = f.indexOf("renderer.outputColorSpace"), l = f.slice(i, i + 800);
  assert.match(l, /Render\.tono\.tono !== "neutro"[^\n]*renderer\.toneMapping = THREE\[Render\.tono\.constante\][^\n]*toneMappingExposure = Render\.tono\.expo/);
  assert.strictEqual((f.match(/toneMapping\s*=/g) || []).length, 1, "un solo sitio fija el tone mapping");
});

test("los materiales propios no cambian: ninguno fuerza toneMapped (salvo las láminas, que ya lo tenían) ni se salta tonemapping_fragment sin motivo", () => {
  const nubes = lee("apps/web/motor/15_tiempo.js");
  assert.strictEqual((nubes.match(/#include <tonemapping_fragment>/g) || []).length, 2, "las nubes mapean tonos antes de colorspace_fragment");
  assert.ok(lee("apps/web/motor/02d_laminas.js").includes("toneMapped: false"), "láminas e iconos: siguen sin mapear");
});

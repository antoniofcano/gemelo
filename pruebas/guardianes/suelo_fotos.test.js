"use strict";
// El suelo de fotos en el motor (EV-1s, apps/web/motor/04f_suelo_fotos.js) y la paleta del atardecer (15_tiempo.js), en Node, sin navegador:
// la bandera (apagado por defecto; en VR, solo con ?sueloVR=1), el presupuesto declarado (MB, muestreos, 0 llamadas), el campo del ruedo, que el
// GLSL se engancha en anclas que existen una sola vez en 04d, y que SIN la bandera 04d y 15_tiempo no cambian (todo lo nuevo va tras SueloFotos.activo
// u OCASO_FOTOS). Que el sombreado compile y se vea bien: la prueba de capturas por el banco (pruebas/suelo_fotos_capturas.js).
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const F04F = lee("apps/web/motor/04f_suelo_fotos.js"), F04D = lee("apps/web/motor/04d_sombreado_tiles.js"), F15 = lee("apps/web/motor/15_tiempo.js");
const P = (() => { const i = F04F.indexOf("// [puro:inicio]"), f = F04F.indexOf("// [puro:fin]"); assert.ok(i >= 0 && f > i); return new Function("\"use strict\";\n" + F04F.slice(i, f) + "\nreturn SueloFotosPuro;")(); })();

test("la bandera: apagado por defecto; ?suelo=fotos lo enciende; 1024 en escritorio y 512 en móvil y gafas; en VR solo con ?sueloVR=1", () => {
  assert.strictEqual(P.decide("", "escritorio").activo, false);
  assert.strictEqual(P.decide("?debug", "escritorio").activo, false);
  assert.strictEqual(P.decide("?suelo=fotosx", "escritorio").activo, false);
  assert.strictEqual(P.decide("?suelo=foto", "escritorio").activo, false);
  const e = P.decide("?suelo=fotos", "escritorio"); assert.deepStrictEqual(e, { activo: true, px: 1024, vr: false });
  assert.strictEqual(P.decide("?a=1&suelo=fotos#x", "movil").px, 512);
  assert.strictEqual(P.decide("?suelo=fotos", "quest").px, 512);
  assert.strictEqual(P.decide("?suelo=fotos&sueloPx=512", "escritorio").px, 512);
  assert.strictEqual(P.decide("?suelo=fotos&sueloPx=2048", "escritorio").px, 1024, "solo 512 o 1024");
  assert.strictEqual(P.decide("?suelo=fotos&sueloVR=1", "quest").vr, true);
  assert.match(F04F, /U\.uFotK\.value = hecho && \(cfg\.vr \|\| !Aparato\.vr\(\)\) \? 1 : 0/, "en VR se apaga salvo ?sueloVR=1");
});

test("presupuesto declarado: 7 niveles RGBA8 con mipmaps (37,3 MB a 1024, 9,3 MB a 512), 2 muestreadores, ≤ 6 lecturas por píxel, 0 llamadas y 0 triángulos", () => {
  assert.strictEqual(P.CLASES.length, 7);
  const a = P.presupuesto(1024), b = P.presupuesto(512);
  assert.strictEqual(a.texturaMB, 37.3); assert.strictEqual(b.texturaMB, 9.3);
  assert.strictEqual(a.llamadas, 0); assert.strictEqual(a.triangulos, 0); assert.strictEqual(a.muestreadores, 2);
  assert.deepStrictEqual(a.muestreos, { lejos: 0, tipico: 3, maximo: 6 });
  // las lecturas que hay de verdad en el GLSL: 1 del ruedo, 2 por fotVar (2 llamadas a fotCapa como mucho) y 1 de la piedra
  const g = P.glsl(256); const n = s => (g.color.match(new RegExp(s, "g")) || []).length;
  assert.strictEqual(n("texture2D\\(uRue"), 1); assert.strictEqual(n("fotCapa\\("), 2); assert.strictEqual((g.cab.match(/textureGrad\(/g) || []).length, 2); assert.strictEqual(n("textureGrad\\("), 1);
  assert.ok(/fotA > 0\.003/.test(g.color), "más allá del fundido no se lee ninguna textura");
  assert.deepStrictEqual(P.FUNDIDO, [12, 40]);
  assert.ok(!/\bnew THREE\.(Mesh|InstancedMesh|Points|Line)/.test(F04F), "sin mallas nuevas: 0 llamadas de dibujo de más");
  assert.match(F04F, /tex\.dispose\(\)/); assert.match(F04F, /campos\.forEach\(function \(t\) \{ t\.dispose\(\); \}\)/);
});

test("campo del ruedo: cerca de un olivo, distancia negativa; lejos, 255; lo que no es olivo no cuenta", () => {
  const olivo = { x: 128, y: 128, oliv: true, perfil: [2, 2, 2, 2, 2, 2, 2, 2] }, otro = { x: 40, y: 40, oliv: false, perfil: [3, 3, 3, 3, 3, 3, 3, 3] };
  const c = P.campoRuedo([olivo, otro], 0, 0, 256, 128), v = (x, y) => c[Math.floor(y / 2) * 128 + Math.floor(x / 2)], dec = b => b / 255 * 12 - 6;
  const R = 2 * 1.15 + 0.5;
  assert.ok(Math.abs(dec(v(128, 128)) - (Math.SQRT2 - R)) < 0.1, "en el centro: " + dec(v(128, 128)));   // la celda más cercana al centro está a √2 m
  assert.ok(dec(v(128 + R + 1, 128)) > 0, "fuera de la copa, positiva");
  assert.strictEqual(v(10, 250), 255); assert.strictEqual(v(40, 40), 255, "el no olivo no hace ruedo");
  assert.strictEqual(c[0 * 128 + 64], 255, "la fila 0 es la del sur");
});

test("el GLSL se engancha en anclas que están una vez en 04d; si falta una, falla en vez de quedarse a medias", () => {
  for (const a of ["float grano =", "(1.0 - m) * 0.3, 0.0, 1.0) * cercaM;", "diffuseColor.rgb *= sRGBTransferEOTF("]) assert.strictEqual(F04D.split(a).length, 2, a);
  const color = "float dc = 1.0; float grano = 0.0; suelo *= 1.0 + grano * 0.55 * clamp(desnudo + camino + (1.0 - m) * 0.3, 0.0, 1.0) * cercaM;\nhSuelo = 0.0;\ndiffuseColor.rgb *= sRGBTransferEOTF(vec4(1.0)).rgb;\n";
  const r = P.parcheGlsl("cab;\n", color, 256);
  assert.ok(r.cab.startsWith("cab;\n") && r.cab.includes("sampler2DArray uFot"));
  assert.ok(r.color.indexOf("float fotA") < r.color.indexOf("float grano =") && r.color.indexOf("if (fotA > 0.003)") < r.color.indexOf("diffuseColor.rgb"));
  assert.ok(r.color.includes("cercaM * (1.0 - fotA);"), "la gravilla procedimental cede ante la foto");
  assert.throws(() => P.parcheGlsl("", "nada", 256), /ancla/);
});

test("sin la bandera, 04d y 15_tiempo no cambian: todo lo nuevo va detrás de SueloFotos.activo u OCASO_FOTOS", () => {
  F04D.split("\n").filter(l => !/^\/\//.test(l) && /SueloFotos/.test(l)).forEach(l => assert.ok(/SueloFotos\.activo/.test(l), "uso sin la guarda en 04d: " + l.trim()));
  F15.split("\n").filter(l => !/^\s*\/\//.test(l) && /uOcasoN|PALETA_OCASO/.test(l) && !/^\s*var (PALETA_OCASO|uOcasoN) =/.test(l)).forEach(l => assert.ok(/OCASO_FOTOS/.test(l), "uso sin la guarda en 15_tiempo: " + l.trim()));
  assert.ok(F15.includes(': "uniform sampler2D map; uniform vec3 diffuse; varying vec2 vUv; varying float vA;\\n" +\n          "void main() { vec4 c = vec4(diffuse, vA) * texture2D(map, vUv); gl_FragColor = c;\\n#include <tonemapping_fragment>\\n#include <colorspace_fragment>\\n}"'), "el sombreado de las nubes de siempre, intacto");
  assert.ok(F15.includes(": new THREE.Color(0xc77b4e)"), "el ocaso de siempre, intacto");
  assert.ok(F04D.includes('SueloFotos.activo ? "terreno-3dtiles-fotos" : "terreno-3dtiles"'), "programa aparte con la bandera");
});

test("la paleta del atardecer del motor es la que sacó la tubería de las fotos de cielo", () => {
  const pal = JSON.parse(lee("tuberia/suelo/paleta_cielo.json")), m = /PALETA_OCASO = \{ horizonte: 0x([0-9a-f]{6}), cenit: 0x([0-9a-f]{6}), nubeLuz: 0x([0-9a-f]{6}), nubeSombra: 0x([0-9a-f]{6}) \}/.exec(F15);
  assert.ok(m, "15_tiempo declara PALETA_OCASO");
  assert.deepStrictEqual(["#" + m[1], "#" + m[2], "#" + m[3], "#" + m[4]], [pal.horizonte, pal.cenit, pal.nube_luz, pal.nube_sombra]);
});

test("la casilla «Suelo con texturas de la finca» (vista.suelo) lo enciende; la URL manda sobre ella (?suelo=fotos enciende, ?suelo=0 apaga)", () => {
  const F = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "apps", "web", "motor", "04f_suelo_fotos.js"), "utf8"), i = F.indexOf("// [puro:inicio]"), f = F.indexOf("// [puro:fin]");
  const P = new Function("\"use strict\";\n" + F.slice(i, f) + "\nreturn SueloFotosPuro;")();
  assert.strictEqual(P.decide("", "escritorio", undefined).activo, false, "sin ajuste ni URL, apagado");
  assert.strictEqual(P.decide("", "escritorio", true).activo, true, "con la casilla, encendido");
  assert.strictEqual(P.decide("?suelo=0", "escritorio", true).activo, false, "?suelo=0 manda sobre la casilla");
  assert.strictEqual(P.decide("?suelo=fotos", "escritorio", false).activo, true, "?suelo=fotos manda sobre la casilla");
  assert.ok(F.includes('localStorage.getItem("gemelo.ajustes.vista.suelo")'), "lee el ajuste guardado con el prefijo de 33_ajustes");
});

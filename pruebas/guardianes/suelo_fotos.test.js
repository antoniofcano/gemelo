"use strict";
// El suelo de fotos en el motor (EV-1s, apps/web/motor/04f_suelo_fotos.js) y la paleta del atardecer (15_tiempo.js), en Node, sin navegador:
// la bandera (apagado por defecto; en VR, solo con ?sueloVR=1), el presupuesto declarado (MB, muestreos, 0 llamadas), el campo del ruedo, que el
// GLSL se engancha en anclas que existen una sola vez en 04d, y que SIN la bandera 04d y 15_tiempo no cambian (todo lo nuevo va tras SueloFotos.activo
// u OCASO_FOTOS). Que el sombreado compile y se vea bien: la prueba de capturas por el banco (pruebas/suelo_fotos_capturas.js).
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const F04F = lee("apps/web/motor/04f_suelo_fotos.js"), F04D = lee("apps/web/motor/04d_sombreado_tiles.js"), F15 = lee("apps/web/motor/15_tiempo.js");
const P = (() => { const i = F04F.indexOf("// [puro:inicio]"), f = F04F.indexOf("// [puro:fin]"); assert.ok(i >= 0 && f > i); return new Function("\"use strict\";\n" + F04F.slice(i, f) + "\nreturn SueloFotosPuro;")(); })();

test("la bandera: apagado por defecto; ?suelo=fotos lo enciende; 768 en escritorio y 384 en móvil y gafas; en VR solo con ?sueloVR=1", () => {
  assert.strictEqual(P.decide("", "escritorio").activo, false);
  assert.strictEqual(P.decide("?debug", "escritorio").activo, false);
  assert.strictEqual(P.decide("?suelo=fotosx", "escritorio").activo, false);
  assert.strictEqual(P.decide("?suelo=foto", "escritorio").activo, false);
  const e = P.decide("?suelo=fotos", "escritorio"); assert.deepStrictEqual(e, { activo: true, px: 768, vr: false });
  assert.strictEqual(P.decide("?a=1&suelo=fotos#x", "movil").px, 384);
  assert.strictEqual(P.decide("?suelo=fotos", "quest").px, 384);
  assert.strictEqual(P.decide("?suelo=fotos&sueloPx=384", "escritorio").px, 384);
  assert.strictEqual(P.decide("?suelo=fotos&sueloPx=1024", "escritorio").px, 768, "solo 384 o 768 (los tamaños que hay)");
  assert.strictEqual(P.decide("?suelo=fotos&sueloVR=1", "quest").vr, true);
  assert.match(F04F, /U\.uFotK\.value = hecho && \(cfg\.vr \|\| !Aparato\.vr\(\)\) \? 1 : 0/, "en VR se apaga salvo ?sueloVR=1");
});

test("presupuesto declarado: 7 clases en 13 niveles RGBA8 con mipmaps (39,0 MB a 768, 9,8 MB a 384; tope 41 y 10,5), 2 muestreadores, ≤ 6 lecturas por píxel, 0 llamadas y 0 triángulos", () => {
  assert.strictEqual(P.CLASES.length, 7); assert.strictEqual(P.CAPAS, 13);
  const a = P.presupuesto(768), b = P.presupuesto(384);
  assert.strictEqual(a.texturaMB, 39); assert.strictEqual(b.texturaMB, 9.8); assert.strictEqual(a.cpuMB, 29.3); assert.strictEqual(b.cpuMB, 7.3);
  // el límite que se declara con las variantes (SUELO-FOTOS.md): casi lo de antes (37,3 y 9,3 MB con 7 niveles a 1024 y 512)
  assert.ok(a.texturaMB <= 41 && b.texturaMB <= 10.5, "las variantes no deben subir la memoria de la tarjeta gráfica de 41 MB (escritorio) ni de 10,5 MB (móvil y gafas)");
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

test("variantes: 2-3 fotos por clase donde las hay, niveles seguidos; cada celda de la repetición estocástica lee una variante y sus vecinas, otra", () => {
  assert.deepStrictEqual(P.VARIANTES, [2, 3, 1, 1, 1, 2, 3], "calle 02 y 05; hojarasca 15, 06 y 08; camino 27 y 25; piedra 23, 20 y 21; las demás, una");
  assert.deepStrictEqual(P.BASE, [0, 2, 5, 6, 7, 8, 10]);
  const L = P.ficheros(768);
  assert.deepStrictEqual(L.map(f => f.capa), [...Array(13).keys()], "un fichero por nivel, en orden");
  assert.deepStrictEqual(L.slice(2, 5).map(f => f.color), ["suelo/hojarasca_768.webp", "suelo/hojarasca_v1_768.webp", "suelo/hojarasca_v2_768.webp"]);
  assert.strictEqual(L[12].relieve, "suelo/piedra_v2_768_relieve.webp");
  const g = P.glsl(256);
  assert.ok(g.cab.includes("const float FOT_B[7] = float[7](" + P.BASE.map(v => v.toFixed(1)).join(", ") + ");"));
  assert.ok(g.cab.includes("const float FOT_N[7] = float[7](" + P.VARIANTES.map(v => v.toFixed(1)).join(", ") + ");"));
  assert.ok(g.cab.includes("return FOT_B[c] + mod(i, FOT_N[c]);"), "la variante sale de la celda, sin hash (no depende de la precisión de la tarjeta)");
  assert.ok(g.cab.includes("float na = fotNiv(c, i), nb = fotNiv(c, i + 1.0);") && g.cab.includes("vec3(p + oa, na)") && g.cab.includes("vec3(p + ob, nb)"), "las 2 lecturas de la repetición estocástica, cada una en la variante de su celda");
  assert.ok(g.color.includes("fotNiv(6, floor(dh(ce + 2.9) * 6.0))"), "cada piedra suelta, una variante de la caliza");
  // fotNiv, en JS: dentro de su clase; con más de una variante, la celda i y la i + 1 nunca leen la misma, y entre las 6 celdas salen todas
  const niv = (c, i) => P.BASE[c] + (i % P.VARIANTES[c]);
  P.VARIANTES.forEach((n, c) => {
    const usados = new Set();
    for (let i = 0; i < 6; i++) { const a = niv(c, i), b = niv(c, i + 1); usados.add(a); assert.ok(a >= P.BASE[c] && a < P.BASE[c] + n); if (n > 1) assert.notStrictEqual(a, b); }
    assert.strictEqual(usados.size, n, P.CLASES[c] + ": todas sus variantes salen");
  });
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

// EV-1k: el suelo de fotos en KTX2 (UASTC en una textura en array con mipmaps, tuberia/suelo/ktx2.mjs) con el KTX2Loader de three, y la vuelta a las WebP
test("la perilla ?suelofmt: KTX2 por defecto; png (o webp) fuerza las WebP; lo que no es una de las tres, lo de por defecto", () => {
  assert.strictEqual(P.formato(""), "ktx2"); assert.strictEqual(P.formato("?suelo=fotos"), "ktx2");
  assert.strictEqual(P.formato("?suelo=fotos&suelofmt=ktx2"), "ktx2");
  assert.strictEqual(P.formato("?suelofmt=png"), "png"); assert.strictEqual(P.formato("?a=1&suelofmt=webp#x"), "png");
  assert.strictEqual(P.formato("?suelofmt=pngx"), "ktx2"); assert.strictEqual(P.formato("?suelofmt=jpg"), "ktx2"); assert.strictEqual(P.formato("?xsuelofmt=png"), "ktx2");
  assert.deepStrictEqual(P.orden("ktx2"), ["ktx2", "png"], "con KTX2, las WebP detrás por si falla");
  assert.deepStrictEqual(P.orden("png"), ["png"], "con ?suelofmt=png no se pide el KTX2 (ni el transcodificador)");
  assert.strictEqual(P.ktx2(768), "suelo/suelo_768.ktx2"); assert.strictEqual(P.ktx2(384), "suelo/suelo_384.ktx2");
  assert.strictEqual(P.BASIS, "basis/", "el transcodificador, del mismo origen: la carpeta que copia vite.config.js");
  // la decisión de siempre no cambia: decide() no sabe del formato
  assert.deepStrictEqual(P.decide("?suelo=fotos&suelofmt=png", "escritorio"), { activo: true, px: 768, vr: false });
});

test("la vuelta atrás: si el KTX2 falla (rechazo o excepción), las WebP; si va bien, ni se piden; si todo falla, se rechaza y el suelo sigue como siempre", async () => {
  const pide = [], avisos = [], intentos = (k, p) => ({ ktx2: () => { pide.push("ktx2"); return k(); }, png: () => { pide.push("png"); return p(); } });
  const ok = v => () => Promise.resolve(v), mal = m => () => Promise.reject(new Error(m)), lanza = m => () => { throw new Error(m); };
  let r = await P.cargaEnOrden(P.orden("ktx2"), intentos(mal("404"), ok("tex-png")), (f, e) => avisos.push(f + ":" + e.message));
  assert.deepStrictEqual(r, { formato: "png", tex: "tex-png" }); assert.deepStrictEqual(pide, ["ktx2", "png"]); assert.deepStrictEqual(avisos, ["ktx2:404"]);
  pide.length = 0; avisos.length = 0;
  r = await P.cargaEnOrden(P.orden("ktx2"), intentos(lanza("sin WebGL2"), ok("tex-png")), (f, e) => avisos.push(f + ":" + e.message));
  assert.strictEqual(r.formato, "png", "una excepción síncrona del intento también vuelve a las WebP"); assert.deepStrictEqual(avisos, ["ktx2:sin WebGL2"]);
  pide.length = 0; avisos.length = 0;
  r = await P.cargaEnOrden(P.orden("ktx2"), intentos(ok("tex-ktx2"), ok("tex-png")));
  assert.deepStrictEqual(r, { formato: "ktx2", tex: "tex-ktx2" }); assert.deepStrictEqual(pide, ["ktx2"], "si el KTX2 carga, las WebP no se piden");
  pide.length = 0;
  r = await P.cargaEnOrden(P.orden("png"), intentos(ok("tex-ktx2"), ok("tex-png")));
  assert.deepStrictEqual(r, { formato: "png", tex: "tex-png" }); assert.deepStrictEqual(pide, ["png"], "?suelofmt=png no toca el KTX2");
  await assert.rejects(P.cargaEnOrden(P.orden("ktx2"), intentos(mal("a"), mal("b")), f => avisos.push(f)), /ningún formato cargó/);
});

test("ktx2Vale: solo vale el KTX2 que espera el sombreado (13 láminas del tamaño pedido y la cadena de mipmaps entera); bytesNiveles cuenta lo que se sube", () => {
  const mips = (px, n) => Array.from({ length: n }, (_, l) => { const w = Math.max(1, px >> l); return { data: new Uint8Array(Math.ceil(w / 4) * Math.ceil(w / 4) * 16 * P.CAPAS), width: w, height: w }; });
  const tex = (px, capas, n) => ({ image: { width: px, height: px, depth: capas }, mipmaps: mips(px, n) });
  assert.ok(P.ktx2Vale(tex(768, 13, 10), 768)); assert.ok(P.ktx2Vale(tex(384, 13, 9), 384));
  assert.ok(!P.ktx2Vale(tex(384, 13, 9), 768), "otro tamaño"); assert.ok(!P.ktx2Vale(tex(384, 7, 9), 384), "otras láminas (un KTX2 viejo)");
  assert.ok(!P.ktx2Vale(tex(384, 13, 1), 384), "sin mipmaps"); assert.ok(!P.ktx2Vale(null, 384)); assert.ok(!P.ktx2Vale({}, 384));
  // 1 byte por texel (ASTC 4x4, BC7, ETC2 RGBA, en bloques de 4×4) con mipmaps: ≈ la cuarta parte de lo declarado para RGBA8 (presupuesto)
  const b768 = P.bytesNiveles(tex(768, 13, 10).mipmaps), b384 = P.bytesNiveles(tex(384, 13, 9).mipmaps);
  assert.ok(Math.abs(b768 / P.presupuesto(768).texturaBytes - 0.25) < 0.01, "768: " + b768); assert.ok(Math.abs(b384 / P.presupuesto(384).texturaBytes - 0.25) < 0.01, "384: " + b384);
  assert.strictEqual(P.bytesNiveles([]), 0); assert.strictEqual(P.bytesNiveles(undefined), 0);
});

test("el motor carga el KTX2 con el KTX2Loader de three, con detectSupport, del mismo origen, por la Cola, y lo suelta todo (loader y workers)", () => {
  assert.ok(F04F.includes('import("three/addons/loaders/KTX2Loader.js")'), "el KTX2Loader de three, con import() solo cuando hace falta");
  assert.ok(/setTranscoderPath\(P\.BASIS\)/.test(F04F), "el transcodificador de basis/ (mismo origen), no la ruta de import.meta.url");
  assert.ok(/\.detectSupport\(renderer\)/.test(F04F), "detectSupport(renderer) es obligatorio");
  assert.ok(/function sueltaLoader\(\) \{ if \(loader\) \{ loader\.dispose\(\); loader = null; \} \}/.test(F04F), "el loader se libera (sus workers y su URL blob:)");
  const cuerpo = F04F.slice(F04F.indexOf("function cargaKtx2()"), F04F.indexOf("function carga()"));
  assert.strictEqual((cuerpo.match(/sueltaLoader\(\)/g) || []).length, 2, "se suelta tanto si carga como si falla");
  assert.ok(/function libera\(\) \{\s*vez\+\+; sueltaLoader\(\); Cola\.cancela\("SF"\);/.test(F04F), "libera() suelta el loader, cancela lo pendiente y tira lo que llegue tarde");
  assert.ok(/return enCola\(\(function\* \(\) \{/.test(cuerpo), "el montaje del KTX2 va por la Cola");
  assert.ok(/t\.onUpdate = function \(\) \{ t\.mipmaps = \[\]; \};/.test(cuerpo), "ya en la tarjeta, fuera la copia de la CPU");
  assert.ok(/t\.wrapS = t\.wrapT = THREE\.RepeatWrapping/.test(cuerpo) && /t\.colorSpace = THREE\.NoColorSpace/.test(cuerpo), "repetible y sin espacio de color, como la de las WebP");
  assert.ok(!/https?:\/\//.test(F04F.replace(/\/\/[^\n]*/g, "")), "el motor no pide nada a otro origen");
});

"use strict";
// AG-3a / F1 (doc/sistema/MULTIVIEW.md §4, ADR-0031): lo que prepara 02h_render.js sin cambiar nada visible, en Node.
//   · InfoDibujo: la lectura de renderer.info con la misma forma para el WebGLRenderer clásico (info.render.calls, info.render.frame, info.programs = lista)
//     y para el WebGPURenderer (info.render.drawCalls, info.frame, info.memory.programs = número), con un renderer de mentira de cada forma y con el
//     WebGLInfo de verdad de three 0.186.1;
//   · ?render=nuevo reservado: se apunta, se avisa y se sigue con el clásico; ?render=clasico o nada, como siempre;
//   · el arranque tolerante: sin init() (el clásico) el primer fotograma sale en el acto, como hoy; con init() (el nuevo), tras él;
//   · los lectores de renderer.info del motor pasan por InfoDibujo (salvo 30_mide.js, que tiene abierto F0).
const test = require("node:test"), assert = require("node:assert"), path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");
const { fabrica } = require("./_materiales");

let THREE;
const plano = x => JSON.parse(JSON.stringify(x));   // lo que sale del vm es de otro reino: se compara su contenido
test.before(async () => { THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); });

// el renderer.info de cada uno, como lo dejan tras un fotograma (WebGLInfo.js y common/Info.js de three 0.186.1)
const clasico = () => ({ info: { memory: { geometries: 12, textures: 7 }, render: { frame: 41, calls: 166, triangles: 900000, points: 3000, lines: 20 }, programs: [{}, {}, {}], autoReset: true } });
const nuevo = () => ({ info: { autoReset: true, frame: 41, calls: 9999, render: { calls: 123456, frameCalls: 83, drawCalls: 83, triangles: 450000, points: 1500, lines: 10, timestamp: 0 },
  compute: { calls: 0, frameCalls: 0, timestamp: 0 }, memory: { geometries: 12, textures: 7, programs: 3, total: 0 } } });

test("InfoDibujo.lee: la misma forma para el clásico y para el nuevo (llamadas por fotograma, no las acumuladas del nuevo)", () => {
  const { InfoDibujo } = fabrica(THREE);
  assert.deepStrictEqual(plano(InfoDibujo.lee(clasico())), { renderizador: "clasico", fotograma: 41, llamadas: 166, triangulos: 900000, puntos: 3000, lineas: 20, geometrias: 12, texturas: 7, programas: 3 });
  assert.deepStrictEqual(plano(InfoDibujo.lee(nuevo())), { renderizador: "nuevo", fotograma: 41, llamadas: 83, triangulos: 450000, puntos: 1500, lineas: 10, geometrias: 12, texturas: 7, programas: 3 });
  for (const r of [clasico(), nuevo()]) {
    assert.strictEqual(InfoDibujo.fotograma(r), 41); assert.strictEqual(InfoDibujo.triangulos(r), r.info.render.triangles);
    assert.strictEqual(InfoDibujo.llamadas(r), InfoDibujo.lee(r).llamadas);
  }
  // escribe en el objeto que se le da (sin crear uno por fotograma)
  const o = {}; assert.strictEqual(InfoDibujo.lee(clasico(), o), o);
  // tolerante: sin renderer, sin info, sin programas (antes del primer fotograma el clásico tiene programs = null)
  const vacio = { renderizador: "clasico", fotograma: 0, llamadas: 0, triangulos: 0, puntos: 0, lineas: 0, geometrias: 0, texturas: 0, programas: 0 };
  assert.deepStrictEqual(plano(InfoDibujo.lee(null)), vacio); assert.deepStrictEqual(plano(InfoDibujo.lee({})), vacio);
  const sinProg = clasico(); sinProg.info.programs = null; assert.strictEqual(InfoDibujo.lee(sinProg).programas, 0);
  assert.strictEqual(InfoDibujo.fotograma(null), 0); assert.strictEqual(InfoDibujo.triangulos({}), 0);
});

test("InfoDibujo.lee con el WebGLInfo de verdad de three 0.186.1 (sin GPU): cuenta lo que cuenta three", async () => {
  const { WebGLInfo } = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/src/renderers/webgl/WebGLInfo.js")).href);
  const gl = { TRIANGLES: 4, LINES: 1, LINE_STRIP: 3, LINE_LOOP: 2, POINTS: 0 }, info = WebGLInfo(gl);
  info.update(300, gl.TRIANGLES, 2); info.update(50, gl.POINTS, 1); info.render.frame = 7; info.programs = [{}];
  const { InfoDibujo } = fabrica(THREE), d = InfoDibujo.lee({ info });
  assert.deepStrictEqual([d.renderizador, d.fotograma, d.llamadas, d.triangulos, d.puntos, d.programas], ["clasico", 7, 2, 200, 50, 1]);
  const { default: Info } = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/src/renderers/common/Info.js")).href);
  const n = new Info(); n.frame = 3; n.render.drawCalls = 5; n.render.calls = 500; n.render.triangles = 10; n.memory.programs = 4;
  const e = InfoDibujo.lee({ info: n });
  assert.deepStrictEqual([e.renderizador, e.fotograma, e.llamadas, e.triangulos, e.programas], ["nuevo", 3, 5, 10, 4]);
});

test("?render=: nada o clasico → el clásico sin aviso; nuevo → reservado (aviso y clásico); otro → aviso y clásico", () => {
  const { RenderPuro } = fabrica(THREE);
  assert.deepStrictEqual(plano(RenderPuro.eligeTipo("", false)), { pedido: "", tipo: "clasico", advertencia: "" });
  assert.deepStrictEqual(plano(RenderPuro.eligeTipo("?debug&render=clasico", false)), { pedido: "clasico", tipo: "clasico", advertencia: "" });
  const n = RenderPuro.eligeTipo("?render=nuevo&mide=60", false);
  assert.strictEqual(n.pedido, "nuevo"); assert.strictEqual(n.tipo, "clasico"); assert.match(n.advertencia, /reservado.*WebGPURenderer.*aún no existe/);
  assert.strictEqual(RenderPuro.eligeTipo("?render=nuevo", true).tipo, "nuevo", "cuando la build lo traiga (F2+), se elige");
  const raro = RenderPuro.eligeTipo("?render=webgpu", true); assert.strictEqual(raro.tipo, "clasico"); assert.match(raro.advertencia, /no existe/);
  assert.strictEqual(RenderPuro.eligeTipo(undefined, false).tipo, "clasico");
  // la build: la que inyecta Vite (__GEMELO_BUILD__); sin ella (Node, o una página antigua), la de pantalla
  assert.strictEqual(fabrica(THREE).Render.build, "pantalla");
  assert.strictEqual(fabrica(THREE, { build: "vr" }).Render.build, "vr");
  assert.strictEqual(fabrica(THREE, { build: "otra" }).Render.build, "pantalla");
});

test("arranque tolerante: sin init() el primer fotograma sale YA (como hoy); con init() asíncrono, después de él; si init() falla, se avisa", async () => {
  const { RenderPuro, Render } = fabrica(THREE);
  let n = 0; assert.strictEqual(RenderPuro.arranca({}, () => n++), null); assert.strictEqual(n, 1, "el clásico: síncrono, sin esperar a nada");
  const orden = []; let suelta;
  const r = { init: () => new Promise(res => { suelta = res; }) };
  const p = RenderPuro.arranca(r, () => orden.push("bucle")); orden.push("tras arranca");
  assert.deepStrictEqual(orden, ["tras arranca"]); suelta(); await p; assert.deepStrictEqual(orden, ["tras arranca", "bucle"]);
  const errores = []; const g = fabrica(THREE, { console: { warn() {}, error: (...a) => errores.push(a[0]) } });
  await g.Render.arranca({ init: () => Promise.reject(new Error("sin WebGL2")) }, () => orden.push("no"));
  assert.deepStrictEqual(errores, ["render: init() falló"]); assert.ok(!orden.includes("no"));
  assert.strictEqual(typeof Render.arranca, "function");
  // 90_final arranca el bucle por aquí
  assert.match(lee("apps/web/motor/90_final.js"), /Render\.arranca\(renderer, bucle\);/);
  // el WebGLRenderer clásico de three 0.186.1 no tiene init(): el camino de hoy es el síncrono
  assert.strictEqual(typeof THREE.WebGLRenderer.prototype.init, "undefined");
});

test("los lectores de renderer.info del motor pasan por InfoDibujo (30_mide.js: lo tiene abierto F0, pendiente)", () => {
  const fs = require("fs"), dir = path.join(RAIZ, "apps/web/motor"), PENDIENTES = { "30_mide.js": "F0 cambia el medidor a la vez: pasa a InfoDibujo cuando se fusione" };
  const mal = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".js") && f !== "02h_render.js")) {
    const s = fs.readFileSync(path.join(dir, f), "utf8").replace(/\/\/.*$/gm, "");
    if (/renderer\.info\b/.test(s) && !PENDIENTES[f]) mal.push(f);
  }
  assert.deepStrictEqual(mal, [], "leen renderer.info a mano (usa InfoDibujo.lee / .fotograma / .triangulos de 02h_render.js)");
  for (const f of Object.keys(PENDIENTES)) assert.match(lee("apps/web/motor/" + f), /renderer\.info/, f + " ya no lee renderer.info: quítalo de PENDIENTES");
  // las pruebas de página también (con la misma forma de siempre en su salida)
  for (const f of ["pruebas/prueba3.js", "pruebas/vistas2.js", "pruebas/prueba_arb.js"]) assert.match(lee(f), /infoDibujo\(\)/, f);
});

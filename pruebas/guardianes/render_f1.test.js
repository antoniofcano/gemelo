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
const { pasoArranque } = require("./_pasos");   // A3-8c: los pasos de apps/web/src/arranque.ts (antes, los ficheros de apps/web/motor/)
const { fabrica } = require("./_materiales");

let THREE;
test.before(async () => { THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); });

// el renderer.info de cada uno, como lo dejan tras un fotograma (WebGLInfo.js y common/Info.js de three 0.186.1)
const clasico = () => ({ info: { memory: { geometries: 12, textures: 7 }, render: { frame: 41, calls: 166, triangles: 900000, points: 3000, lines: 20 }, programs: [{}, {}, {}], autoReset: true } });
const nuevo = () => ({ info: { autoReset: true, frame: 41, calls: 9999, render: { calls: 123456, frameCalls: 83, drawCalls: 83, triangles: 450000, points: 1500, lines: 10, timestamp: 0 },
  compute: { calls: 0, frameCalls: 0, timestamp: 0 }, memory: { geometries: 12, textures: 7, programs: 3, total: 0 } } });

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

test("el arranque del bucle y el WebGLRenderer clásico (lo puro del arranque, en apps/web/src/nucleo/render.test.ts)", () => {
  // 90_final arranca el bucle por aquí
  assert.match(pasoArranque("90_final.js"), /Render\.arranca\(renderer, bucle\);/);
  // el WebGLRenderer clásico de three 0.186.1 no tiene init(): el camino de hoy es el síncrono
  assert.strictEqual(typeof THREE.WebGLRenderer.prototype.init, "undefined");
  // 02h_render.js es un talón del núcleo: la fábrica entra por Nucleo.creaRender
  assert.match(pasoArranque("02h_render.js"), /var Render = Nucleo\.creaRender\(\{/);
});

test("los lectores de renderer.info del motor pasan por InfoDibujo (30_mide.js: lo tiene abierto F0, pendiente)", () => {
  const P = require("./_pasos"), PENDIENTES = { "30_mide.js": "F0 cambia el medidor a la vez: pasa a InfoDibujo cuando se fusione" };
  const mal = [];
  for (const f of P.nombresPasos().filter(f => f !== "02h_render.js")) {   // A3-8c: los pasos del arranque (antes, los ficheros de motor/)
    const s = P.pasoArranque(f).replace(/\/\/.*$/gm, "");
    if (/renderer\.info\b/.test(s) && !PENDIENTES[f]) mal.push(f);
  }
  assert.deepStrictEqual(mal, [], "leen renderer.info a mano (usa InfoDibujo.lee / .fotograma / .triangulos de 02h_render.js)");
  for (const f of Object.keys(PENDIENTES)) assert.match(require("./_fuente").fuenteMotor(f), /renderer\.info/, f + " ya no lee renderer.info: quítalo de PENDIENTES");   // A3-7a: 30_mide es un talón de ui/mide.ts
  // las pruebas de página también (con la misma forma de siempre en su salida)
  for (const f of ["pruebas/prueba3.js", "pruebas/vistas2.js", "pruebas/prueba_arb.js"]) assert.match(lee(f), /infoDibujo\(\)/, f);
});

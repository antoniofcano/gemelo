"use strict";
// AG-P1 (posible fuga al entrar y salir de VR, PLAN P4): lo que se puede fijar en Node, sin navegador. El motor crea el aparato de VR UNA vez al cargar
// (rig, mandos-rayo, arco, fundido, viñeta, panel y fichas: 29_vr.js) y lo reutiliza en cada sesión; lo que sí se crea por sesión (modelos de mandos y manos,
// 36_mandos.js; láminas del mundo, 02d_laminas.js) se libera al salir. Aquí se vigila que entraVR/vrSale no creen recursos de GPU nuevos en cada sesión y que lo
// que crea 36_mandos tenga su dispose. La medida real (renderer.info.memory y heap tras N sesiones con el WebXR simulado): memoria_vr_chrome.test.js. La de las
// láminas con un THREE de mentira (diez sesiones): laminas.test.js.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");
const VR = lee("apps/web/motor/29_vr.js"), MANDOS = lee("apps/web/motor/36_mandos.js");
function entre(fuente, ini, fin) { const i = fuente.indexOf(ini), f = fuente.indexOf(fin, i + ini.length); assert.ok(i >= 0 && f > i, "falta " + ini + " … " + fin); return fuente.slice(i, f); }
const CREA = /new THREE\.(Mesh|\w*Geometry|\w*Material|CanvasTexture|WebGLRenderTarget|\w*Texture|Line|Points|Sprite)\b|document\.createElement\("canvas"\)/;

test("entraVR y vrSale no crean mallas, geometrías, materiales ni texturas: el aparato de VR se crea una vez y se reutiliza", () => {
  const sesion = entre(VR, "async function entraVR()", "window.__vrDebug = ");
  assert.ok(!CREA.test(sesion), "una creación por sesión en 29_vr.js (entraVR/vrSale): " + (CREA.exec(sesion) || [])[0]);
});

test("entraVR no añade escuchas por sesión salvo la de «end» de la propia sesión (que muere con ella); la suscripción a Ajustes se hace una sola vez", () => {
  const sesion = entre(VR, "async function entraVR()", "function vrSale()");
  const escuchas = sesion.match(/\.(addEventListener|on|alCambiar)\(/g) || [];
  assert.deepStrictEqual(escuchas, [".addEventListener("], "solo ses.addEventListener(\"end\", vrSale)");
  assert.match(VR, /function vrSuscribe\(\) \{ if \(vrSuscrito\) return;/, "vrSuscribe se hace una sola vez");
  assert.ok(!/setInterval\(/.test(VR), "29_vr no usa setInterval");
});

test("36_mandos: lo que crea por su cuenta (la caja de respaldo) se libera, y todo lo que llega de las fábricas se apunta y se libera al salir", () => {
  assert.match(MANDOS, /e\.cubo\.geometry\.dispose\(\); e\.cubo\.material\.dispose\(\)/, "la caja de respaldo se libera");
  const lib = entre(MANDOS, "function libera()", "function resumen()");
  assert.match(lib, /s\.gpu\.forEach\(function \(r\) \{ try \{ r\.dispose\(\)/, "libera() recorre lo apuntado");
  assert.match(lib, /clearTimeout\(e\.reloj\)/, "y para los relojes");
  assert.match(lib, /s\.gpu\.clear\(\); S = null/, "y deja el estado limpio para la sesión siguiente");
  const prep = entre(MANDOS, "function prepara(", "function respaldoMando");
  ["s.gpu.add(o.geometry)", "s.gpu.add(o.skeleton)", "s.gpu.add(m)", "isTexture"].forEach(x => assert.ok(prep.includes(x), "prepara() apunta " + x));
  assert.match(MANDOS, /if \(S !== s\)/, "lo que llega tarde de una sesión ya cerrada se descarta");
});

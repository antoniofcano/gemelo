"use strict";
// Cliente web con Vite (ADR-0010, fase 0): la entrada generada es exactamente el motor concatenado, el build funciona y la página empaquetada
// dibuja LO MISMO que la salida artefacto (mismas llamadas, triángulos y puntos en los mismos escenarios), con la misma versión de three en las dos.
// Las dos con ?escena=clasica (la de siempre; ninguna de las dos lleva tileset, ADR-0015 T8 fase 1): se compara el build, no la escena.
// Sin Vite instalado (cd apps/web && npm i) se SALTA con aviso. La salida artefacto toma three de jsDelivr: sin red, su carga falla.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, propia, python, fixture, ejecuta, fs, path } = require("./_util");
const { sirve, motivoSalto, lanza, mide } = require("./_navegador");

const WEB = path.join(RAIZ, "apps", "web");
const VITE = path.join(WEB, "node_modules", "vite", "bin", "vite.js");
const SALTO = !fs.existsSync(VITE) ? "Vite no instalado (cd apps/web && npm i): el cliente web NO se ha comprobado" : motivoSalto("el cliente web");

let FIX, raiz, dist, artefacto;
test.before(() => {
  if (SALTO) return;
  FIX = fixture(); raiz = propia("web-raiz"); dist = propia("web-dist"); artefacto = propia("web-artefacto");
  const g = ejecuta(process.execPath, [path.join(WEB, "herramientas", "genera_motor.mjs"), "--datos", path.join(FIX, "cerro", "embebido.json"), "--dest", raiz]);
  assert.strictEqual(g.status, 0, g.stdout + g.stderr);
  const b = ejecuta(process.execPath, [VITE, "build"], { cwd: WEB, env: Object.assign({}, process.env, { GEMELO_WEB_RAIZ: raiz, GEMELO_WEB_SALIDA: dist }) });
  assert.strictEqual(b.status, 0, "vite build falló:\n" + b.stdout + b.stderr);
  const m = ejecuta(python(), ["-I", "tuberia/salida_artefacto/montar_v2.py", "--datos", path.relative(RAIZ, path.join(FIX, "cerro", "embebido.json")), "--salida", path.relative(RAIZ, path.join(artefacto, "index.html"))]);
  assert.strictEqual(m.status, 0, m.stdout + m.stderr);
});

test("la entrada de Vite es `import THREE` + los módulos del motor concatenados en orden, sin cambiar nada", t => {
  if (SALTO) return t.skip(SALTO);
  const motor = path.join(WEB, "motor"), esperado = 'import * as THREE from "three";\n' + fs.readdirSync(motor).filter(f => f.endsWith(".js")).sort().map(f => fs.readFileSync(path.join(motor, f), "utf8")).join("");
  assert.strictEqual(fs.readFileSync(path.join(raiz, "entrada", "motor.generado.js"), "utf8"), esperado);
});

// La versión de three es UNA (ADR-0016): la exacta de apps/web/package.json, la instalada y la que la salida artefacto pide a jsDelivr en su importmap.
const VERSION_THREE = JSON.parse(fs.readFileSync(path.join(WEB, "package.json"), "utf8")).dependencies.three;

test("three va con versión exacta, ≥ 0.167 (ADR-0009, 3D Tiles), y es la instalada en apps/web", t => {
  assert.match(VERSION_THREE, /^\d+\.\d+\.\d+$/, "three debe ir con versión exacta en apps/web/package.json");
  assert.ok(Number(VERSION_THREE.split(".")[1]) >= 167, "three " + VERSION_THREE + " < 0.167");
  if (SALTO) return t.skip(SALTO);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(WEB, "node_modules", "three", "package.json"), "utf8")).version, VERSION_THREE, "la three instalada no es la de package.json (cd apps/web && npm ci)");
});

test("la salida artefacto carga la MISMA three que el cliente web (importmap a jsDelivr con la versión de package.json)", t => {
  if (SALTO) return t.skip(SALTO);
  const html = fs.readFileSync(path.join(artefacto, "index.html"), "utf8"), m = html.match(/<script type="importmap">(.*?)<\/script>/s);
  assert.ok(m, "la salida artefacto no lleva importmap");
  const im = JSON.parse(m[1]).imports;
  assert.strictEqual(im.three, "https://cdn.jsdelivr.net/npm/three@" + VERSION_THREE + "/build/three.module.js");
  assert.ok(!/three\.min\.js|cdnjs\.cloudflare\.com\/ajax\/libs\/three/.test(html), "queda una carga de three r128 (three.min.js)");
});

// Los parches de sombreador (onBeforeCompile) sustituyen trozos de los sombreadores de three por su nombre: si un trozo cambia de nombre entre versiones
// (r154: encodings_fragment → colorspace_fragment, output_fragment → opaque_fragment), el reemplazo falla EN SILENCIO. Aquí se comprueba que existen todos.
test("cada `#include <trozo>` que el motor parchea o usa existe en los sombreadores de la three instalada", t => {
  const dir = path.join(WEB, "node_modules", "three", "src", "renderers", "shaders", "ShaderChunk");
  if (!fs.existsSync(dir)) return t.skip("three no instalado (cd apps/web && npm ci): los parches de sombreador NO se han comprobado");
  const hay = new Set(fs.readdirSync(dir).map(f => f.replace(/\.glsl\.js$/, ""))), motor = path.join(WEB, "motor"), usados = new Map();
  for (const f of fs.readdirSync(motor).filter(f => f.endsWith(".js"))) for (const m of fs.readFileSync(path.join(motor, f), "utf8").matchAll(/#include <(\w+)>/g)) usados.set(m[1], f);
  assert.ok(usados.size >= 10, "se esperaban más trozos parcheados: " + usados.size);
  const faltan = [...usados].filter(([k]) => !hay.has(k)).map(([k, f]) => k + " (" + f + ")");
  assert.deepStrictEqual(faltan, [], "trozos que ya no existen en three " + VERSION_THREE);
  const cs = fs.readFileSync(path.join(dir, "colorspace_pars_fragment.glsl.js"), "utf8");
  for (const fn of ["sRGBTransferEOTF", "sRGBTransferOETF"]) assert.ok(cs.includes(fn), fn + " ya no existe en colorspace_pars_fragment");
});

test("la página empaquetada carga sin errores y dibuja exactamente lo mismo que la salida artefacto", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const s1 = await sirve(dist), s2 = await sirve(artefacto), nav = await lanza();
  try {
    // Iguales salvo la variación propia del motor entre dos cargas (vida, nubes y la Cola dependen del tiempo). Medido el 2026-10-28:
    // en solitario, ±1 llamada; con la máquina cargada, las LLAMADAS del escenario «nube» llegan a variar un tercio (95 frente a 127)
    // porque dependen de cuánto ha avanzado la carga. Por eso esas se registran pero no se comparan; el resto, con 2 unidades o el 2 %.
    // Una diferencia aislada puede ser de tiempo y no del build: se repite la pareja de medidas hasta 3 veces; falla si nunca coinciden.
    let dif = [];
    for (let intento = 1; intento <= 3; intento++) {
      const w = await mide(nav, "http://127.0.0.1:" + s1.address().port + "/index.html?escena=clasica");
      const a = await mide(nav, "http://127.0.0.1:" + s2.address().port + "/index.html?escena=clasica");
      assert.deepStrictEqual(w.errores, [], "errores en la página de Vite");
      assert.deepStrictEqual(w.fallos, [], "peticiones fallidas en la página de Vite");
      dif = [];
      for (const e of Object.keys(a.medidas)) for (const k of ["llamadas", "triangulos", "puntos"]) {
        const v = w.medidas[e][k], r = a.medidas[e][k];
        if (e === "nube" && k === "llamadas") { if (v !== r) t.diagnostic("nube/llamadas (no se compara): Vite " + v + ", artefacto " + r); continue; }
        if (Math.abs(v - r) > Math.max(2, 0.02 * r)) dif.push(e + "/" + k + ": Vite " + v + " frente a artefacto " + r);
      }
      if (!dif.length) break;
      t.diagnostic("intento " + intento + " con diferencias: " + dif.join("; "));
    }
    assert.deepStrictEqual(dif, [], "la página de Vite no dibuja lo mismo que la artefacto (3 intentos)");
  } finally { await nav.close(); s1.close(); s2.close(); }
});

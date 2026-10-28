"use strict";
// Cliente web con Vite (ADR-0010, fase 0): la entrada generada es exactamente el motor concatenado, el build funciona y la página empaquetada
// dibuja LO MISMO que la salida artefacto (mismas llamadas, triángulos y puntos en los mismos escenarios). Sin Vite instalado (cd apps/web && npm i) se SALTA con aviso.
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

test("three del cliente web es la 0.128.0 (la misma r128 que la salida artefacto)", t => {
  if (SALTO) return t.skip(SALTO);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(WEB, "node_modules", "three", "package.json"), "utf8")).version, "0.128.0");
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
      const w = await mide(nav, "http://127.0.0.1:" + s1.address().port + "/index.html");
      const a = await mide(nav, "http://127.0.0.1:" + s2.address().port + "/index.html");
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

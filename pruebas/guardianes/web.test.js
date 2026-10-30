"use strict";
// Cliente web con Vite (ADR-0010): la versión de three es una y exacta, los trozos de sombreador que parchea el motor existen en ella y la página
// empaquetada (pruebas/guardianes/_pagina.js) carga sin errores pidiendo solo a su mismo origen, como la sirve Caddy (decisión 79: ya no hay
// salida artefacto con la que compararla; T8 fase 2). Las fuentes de Google de la plantilla son la única excepción conocida, y se dice.
// Sin Vite instalado (cd apps/web && npm ci) se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const WEB = path.join(RAIZ, "apps", "web");
const SALTO = saltoPagina("el cliente web");
const SALTO_NAV = SALTO || motivoSalto("el cliente web en el navegador");

// La versión de three es UNA (ADR-0016): la exacta de apps/web/package.json, la instalada y la que empaqueta Vite.
const VERSION_THREE = JSON.parse(fs.readFileSync(path.join(WEB, "package.json"), "utf8")).dependencies.three;

test("three va con versión exacta, ≥ 0.167 (ADR-0009, 3D Tiles), y es la instalada en apps/web", t => {
  assert.match(VERSION_THREE, /^\d+\.\d+\.\d+$/, "three debe ir con versión exacta en apps/web/package.json");
  assert.ok(Number(VERSION_THREE.split(".")[1]) >= 167, "three " + VERSION_THREE + " < 0.167");
  if (SALTO) return t.skip(SALTO);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(WEB, "node_modules", "three", "package.json"), "utf8")).version, VERSION_THREE, "la three instalada no es la de package.json (cd apps/web && npm ci)");
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

test("la página empaquetada carga sin errores, lleva la three de apps/web y solo pide a su mismo origen (salvo las fuentes de Google de la plantilla)", { timeout: 300000 }, async t => {
  if (SALTO_NAV) return t.skip(SALTO_NAV);
  const P = montaPagina({ finca: "hituelo" }), s = await sirve(P.carpeta), nav = await lanza(), origen = "http://127.0.0.1:" + s.address().port;
  const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [], fuera = new Set();
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error" && !/^\[Report Only\]/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  p.on("request", r => { const u = r.url(); if (!u.startsWith(origen) && !/^(data|blob):/.test(u)) fuera.add(new URL(u).host); });
  try {
    await p.goto(origen + "/" + P.url + "?debug");
    await p.waitForFunction(() => window.__g && window.__g.listo() && window.__g.Escena3D.listo(), null, { timeout: 120000, polling: 500 });
    await p.waitForTimeout(1500);
    assert.deepStrictEqual(errores, []);
    assert.strictEqual(await p.evaluate(() => window.__THREE__), VERSION_THREE.split(".")[1], "la three empaquetada no es la de apps/web/package.json");
    const ajenos = [...fuera].filter(h => !/^fonts\.(googleapis|gstatic)\.com$/.test(h));
    if (fuera.size > ajenos.length) t.diagnostic("fuentes de Google pedidas por la plantilla: " + [...fuera].join(", ") + " (la CSP de Caddy, al imponerse, las bloquearía)");
    assert.deepStrictEqual(ajenos, [], "la página pide a otros hosts (el motor solo pide a su mismo origen)");
  } finally { await p.close(); await nav.close(); s.close(); }
});

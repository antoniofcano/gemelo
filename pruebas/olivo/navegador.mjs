// El constructor de olivos en Chrome headless (SwiftShader: vale para recuentos, huellas y tiempos de JS; NO para fps):
//   - la herramienta (apps/web/olivo/dist/herramienta, vite build) con three 0.128 y 0.186: misma huella que en Node;
//   - el trabajador da la misma huella que el hilo principal y el hilo principal no se bloquea (hueco máximo entre latidos) con 5 árboles;
//   - a rebanadas, ninguna pasa de 3 ms;
//   - el IIFE (olivo.iife.js, global OlivoGen, con su three 0.128 dentro: no usa el THREE global) da la misma estructura que Node;
//   - con --capturas <carpeta>: capturas E2 frente a E2-VR y del módulo (los recuentos los da la herramienta).
//   node pruebas/olivo/navegador.mjs <dist/herramienta> <dist/iife> [--capturas <carpeta>]
// Imprime JSON. Lo usa pruebas/guardianes/olivo.test.js.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { sirve, lanza } = require(path.join(RAIZ, "pruebas", "guardianes", "_navegador.js"));
const [DIST, IIFE] = process.argv.slice(2, 4).map(p => path.resolve(p));
const ic = process.argv.indexOf("--capturas"), CAPTURAS = ic > 0 ? path.resolve(process.argv[ic + 1]) : null;
const H = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "olivo", "huellas-olivo-2.json"), "utf8"));
const esperada = (tipo, epoca, semilla) => H.casos.find(c => c.tipo === tipo && c.epoca === epoca && c.semilla === semilla).sha256;
// la huella EXACTA depende del motor de JavaScript en el último bit (ADR-0017): con Node se compara la ESTRUCTURAL y la diferencia de flotantes
const O = await import("file:///" + path.join(RAIZ, "apps", "web", "olivo", "index.js").split(path.sep).join("/"));
const estructuraNode = async e => O.huellaEstructura(O.receta(e));
const deB64 = (b, T) => { const u = Buffer.from(b, "base64"); return new T(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength)); };
const CINCO = [["centenario3", "envero", 7], ["adulto1", "reposo", 1003], ["centenario", "madura", 65537], ["adulto3", "verde", 1], ["centenario2", "flor", 4294967295]]
  .map(([tipo, epoca, semilla]) => ({ tipo, epoca, semilla }));

const salida = { mal: [] };
const s1 = await sirve(DIST), url = "http://127.0.0.1:" + s1.address().port + "/index.html";
// página del IIFE: el three r128 global (el mismo que da cdnjs, aquí desde node_modules) + olivo.iife.js
const dirIife = fs.mkdtempSync(path.join(RAIZ, "pruebas", "salida", "olivo-iife-"));
fs.copyFileSync(path.join(IIFE, "olivo.iife.js"), path.join(dirIife, "olivo.iife.js"));
// sin three global: el IIFE lleva su three 0.128.0 dentro; un THREE de mentira en la página comprueba que no lo usa
fs.writeFileSync(path.join(dirIife, "index.html"), '<!doctype html><meta charset="utf-8"><script>window.THREE = { REVISION: "no-usar" };</script><script src="olivo.iife.js"></script>\n');
const s2 = await sirve(dirIife);
const nav = await lanza();
try {
  for (const v of ["128", "186"]) {
    const p = await nav.newPage({ viewport: { width: 1100, height: 760 } }), errores = [];
    p.on("pageerror", e => errores.push(String(e).slice(0, 300))); p.on("console", m => { if (m.type() === "error") errores.push(m.text().slice(0, 300)); });
    await p.goto(url + "?three=" + v);
    await p.waitForFunction(() => window.__olivo && window.__olivo.primero, null, { timeout: 120000 });
    const r = await p.evaluate(() => Object.assign({ revision: window.__olivo.revision, info: window.__olivo.info() }, window.__olivo.primero));
    const c0 = { tipo: "centenario3", epoca: "envero", semilla: 7 };
    const est = await p.evaluate(([e, f]) => window.__olivo.estructura(e, f), [c0, v === "128"]);
    r.exactaComoNode = r.huella === esperada("centenario3", "envero", 7);
    r.estructuraComoNode = est.estructura === await estructuraNode(c0);
    if (est.flotantes) {
      const rn = O.receta(c0), rw = { piezas: rn.piezas.map((q, i) => { const f = est.flotantes[i]; return { atrib: f.atrib ? Object.fromEntries(Object.entries(f.atrib).map(([k, b]) => [k, deB64(b, Float32Array)])) : null,
        matrices: f.matrices ? deB64(f.matrices, Float32Array) : null, colores: f.colores ? deB64(f.colores, Float32Array) : null }; }) };
      r.difFlotantesMax = O.diferenciaMax(rn, rw);
      if (!(r.difFlotantesMax < 1e-6)) salida.mal.push("flotantes navegador/Node: diferencia " + r.difFlotantesMax);
    }
    salida["three" + v] = r;
    if (!r.estructuraComoNode) salida.mal.push("herramienta three " + v + ": estructura distinta de la de Node");
    if (v === "128") {
      // memoria y tiempos: 5 árboles por el trabajador y 5 a rebanadas, con la sonda del hilo principal puesta
      const heap0 = await p.evaluate(() => window.__olivo.memoria());
      const hilo = [], estr = [];
      for (const e of CINCO) { const x = await p.evaluate(e => window.__olivo.estructura(e, false), e); hilo.push(x.huella); estr.push(x.estructura); }
      const reposo = await p.evaluate(() => window.__olivo.reposo(2000));
      const t = await p.evaluate(c => window.__olivo.fabrica("trabajador", c), CINCO);
      const rb = await p.evaluate(c => window.__olivo.fabrica("rebanadas", c), CINCO);
      const ms = await p.evaluate(async c => { const out = []; for (const e of c) { const t0 = performance.now(); window.__olivo.O.receta(e); out.push(performance.now() - t0); } return out; }, CINCO);
      const heap1 = await p.evaluate(() => window.__olivo.memoria());
      salida.trabajador = { modo: t.modo, ms: t.ms.map(Math.round), huecoMax: +t.huecoMax.toFixed(1), latidos: t.latidos, huecoEnReposo: +reposo.max.toFixed(1) };
      salida.rebanadas = { modo: rb.modo, ms: rb.ms.map(Math.round), rebanadaMax: +rb.rebanadaMax.toFixed(2), rebanadaP99: +rb.rebanadaP99.toFixed(2), rebanadas: rb.rebanadas, huecoMax: +rb.huecoMax.toFixed(1) };
      salida.hiloPrincipal = { ms: ms.map(Math.round) };
      salida.heapMB = [heap0, heap1];
      if (t.modo !== "trabajador") salida.mal.push("no hay trabajador");
      CINCO.forEach((e, i) => {
        if (t.huellas[i] !== hilo[i]) salida.mal.push("trabajador ≠ hilo en " + e.tipo);
        if (rb.huellas[i] !== hilo[i]) salida.mal.push("rebanadas ≠ hilo en " + e.tipo);
      });
      for (let i = 0; i < CINCO.length; i++) if (estr[i] !== await estructuraNode(CINCO[i])) salida.mal.push("estructura navegador ≠ Node en " + CINCO[i].tipo);
      salida.exactasComoNode = CINCO.filter((e, i) => hilo[i] === esperada(e.tipo, e.epoca, e.semilla)).length + " de " + CINCO.length;
      // con la máquina cargada el SO para el hilo principal aunque no haga nada: el tope es 8 ms o lo que ya se ve en reposo (+50 %)
      const topeHueco = Math.max(8, reposo.max * 1.5);
      if (t.huecoMax > topeHueco) salida.mal.push("con el trabajador, el hilo principal se bloqueó " + t.huecoMax.toFixed(1) + " ms (> " + topeHueco.toFixed(1) + "; en reposo " + reposo.max.toFixed(1) + ")");
      // rebanadas: el percentil 95 por debajo de 3 ms (el máximo se informa: una rebanada también la para el SO)
      const o = rb.rebanadasLista.slice().sort((a, b) => a - b), p95 = o[Math.floor(o.length * 0.95)];
      salida.rebanadas.rebanadaP95 = +p95.toFixed(2);
      if (p95 > 3) salida.mal.push("rebanada de " + p95.toFixed(2) + " ms en el percentil 95 (> 3)");
      if (CAPTURAS) {
        fs.mkdirSync(CAPTURAS, { recursive: true });
        for (const k of ["E0", "E1", "E2", "E2VR"]) { const n = await p.evaluate(k => window.__olivo.ponNivel(k), k); await p.waitForTimeout(300);
          await p.locator("#visor canvas").screenshot({ path: path.join(CAPTURAS, "olivo-centenario3-envero-7-" + k + ".png") }); salida["captura" + k] = { triangulos: n.triangulos, llamadas: n.llamadas, info: await p.evaluate(() => window.__olivo.info()) }; }
      }
    } else if (CAPTURAS) await p.locator("#visor canvas").screenshot({ path: path.join(CAPTURAS, "olivo-centenario3-envero-7-E0-three186.png") });
    if (errores.length) salida.mal.push("errores en la página (three " + v + "): " + errores.slice(0, 3).join(" | "));
    await p.close();
  }
  const p = await nav.newPage(), errores = [];
  p.on("pageerror", e => errores.push(String(e).slice(0, 300)));
  await p.goto("http://127.0.0.1:" + s2.address().port + "/index.html");
  const r = await p.evaluate(async () => { const t0 = performance.now(), rc = OlivoGen.receta({ tipo: "centenario3", epoca: "envero", semilla: 7 }), ms = performance.now() - t0;

    const f = OlivoGen.creaFabrica(); const r2 = await f.receta({ tipo: "adulto1", epoca: "reposo", semilla: 1003 });
    return { threeGlobal: THREE.REVISION, version: OlivoGen.GEN_VERSION, huella: await OlivoGen.huellaEstructura(rc), huella2: await OlivoGen.huellaEstructura(r2), modo: f.modo, ms, tri: OlivoGen.triangulosNivel(rc), rebanadaMax: Math.max(...f.rebanadas) }; });
  salida.iife = r;
  if (r.huella !== await estructuraNode({ tipo: "centenario3", epoca: "envero", semilla: 7 }) || r.huella2 !== await estructuraNode({ tipo: "adulto1", epoca: "reposo", semilla: 1003 })) salida.mal.push("IIFE: estructura distinta de la de Node");
  if (r.modo !== "rebanadas") salida.mal.push("IIFE: debía ir a rebanadas (sin trabajador)");
  if (errores.length) salida.mal.push("errores en la página del IIFE: " + errores.join(" | "));
} finally { await nav.close(); s1.close(); s2.close(); fs.rmSync(dirIife, { recursive: true, force: true }); }
console.log(JSON.stringify(salida));
process.exit(salida.mal.length ? 1 : 0);

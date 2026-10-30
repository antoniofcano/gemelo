"use strict";
// «Cae la cosecha» y el anfitrión de juegos (C9a; doc/sistema/JUEGOS.md), en Node y sin navegador:
//   · las reglas (CaeLaCosechaPuro de apps/web/motor/41_cae_la_cosecha.js) con casos deterministas: grupos conectados, cadenas, puntos, giro, fin, semilla;
//   · el tope de puntos creíbles es el mismo en el motor y en la api, y una partida jugada a lo loco no lo pasa;
//   · el dibujo: cada pieza con su silueta (no solo su color), sin texto ni emoji;
//   · lo puro del anfitrión (JuegosPuro de 40_juegos.js): validar un juego, récords en el aparato (con un almacén que falla), rutas y semilla.
// El registro de los dos componentes (con y sin cada uno, en cualquier orden) está en componentes.test.js; lo de Chrome, abajo (por el banco).
const test = require("node:test"), assert = require("node:assert");
const { describe, before } = test;
const { RAIZ, lee, fs, path } = require("./_util");

const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini); return s.slice(i, f); };
const FUENTE = lee("apps/web/motor/41_cae_la_cosecha.js"), ANFITRION = lee("apps/web/motor/40_juegos.js");
const P = new Function("\"use strict\";\n" + trozo(FUENTE, "// [puro:inicio]", "// [puro:fin]") + "\nreturn CaeLaCosechaPuro;")();
const Dib = new Function("\"use strict\";\n" + trozo(FUENTE, "// [dibujo:inicio]", "// [dibujo:fin]") + "\nreturn CaeLaCosechaDibujo;")();
const JP = new Function("\"use strict\";\n" + trozo(ANFITRION, "// [puro:inicio]", "// [puro:fin]") + "\nreturn JuegosPuro;")();
const L = { V: 0, N: 1, H: 2, F: 3, P: 4, T: 5 };

test("una partida nueva: tablero de 7 × 12 vacío, una rama de 2 arriba en el centro y la siguiente a la vista", () => {
  const e = P.nueva({ semilla: 7 });
  assert.strictEqual(e.ancho, 7); assert.strictEqual(e.alto, 12); assert.ok(e.celdas.every(c => c === -1));
  assert.strictEqual(e.actual.t.length, 2); assert.strictEqual(e.actual.x, 3); assert.strictEqual(e.actual.y, 0);
  assert.ok(e.siguiente && e.siguiente.t.length === 2, "al principio, solo ramas de 2");
  assert.deepStrictEqual(e.tipos.map(t => P.PIEZAS[t]), ["verde", "negra", "hoja", "piedra", "terron"]);
});

test("la época del olivo cambia las piezas: en floración, la flor en lugar de la aceituna negra", () => {
  for (const ep of ["boton", "flor", "cuajado"]) assert.deepStrictEqual(P.tiposDeEpoca(ep).map(t => P.PIEZAS[t]), ["verde", "flor", "hoja", "piedra", "terron"], ep);
  for (const ep of ["reposo", "verde", "envero", "madura", null, undefined, "rara"]) assert.ok(P.tiposDeEpoca(ep).map(t => P.PIEZAS[t]).includes("negra"), String(ep));
  const e = P.nueva({ semilla: 3, epoca: "flor" });
  for (let i = 0; i < 40 && !e.fin; i++) { P.accion(e, "cae"); }
  assert.ok(!e.celdas.some(c => c === L.N), "en floración no cae ninguna aceituna negra");
});

test("misma semilla y mismas jugadas, misma partida; otra semilla, otra", () => {
  const juega = s => {
    const e = P.nueva({ semilla: s }), acc = ["izquierda", "gira", "cae", "derecha", "derecha", "cae", "baja", "gira", "gira", "cae"];
    for (let i = 0; i < 120 && !e.fin; i++) { P.accion(e, acc[i % acc.length]); P.avanza(e, 0.3); }
    return { tablero: P.texto(e).join("|"), puntos: e.puntos, fin: e.fin, t: e.t };
  };
  assert.deepStrictEqual(juega(42), juega(42));
  assert.notDeepStrictEqual(juega(42).tablero, juega(43).tablero);
});

test("grupos: tres o más iguales que se tocan por un lado, en línea o en codo; dos, o en diagonal, no", () => {
  const e = P.nueva({ semilla: 1 });
  P.ponTablero(e, ["V......", "VV.H...", "P.H.N..", "PP.HNN."]);
  const g = P.grupos(e).map(x => [P.PIEZAS[x.tipo], x.celdas.length]).sort();
  assert.deepStrictEqual(g, [["negra", 3], ["piedra", 3], ["verde", 3]], "la V en codo, la P en codo y la N en codo; las H en diagonal no cuentan");
  P.ponTablero(e, ["TTTT..."]); assert.deepStrictEqual(P.grupos(e).map(x => x.celdas.length), [4], "cuatro en línea, un grupo");
  P.ponTablero(e, ["HH.HH.."]); assert.deepStrictEqual(P.grupos(e), [], "dos y dos separados: nada");
});

test("puntos: 10 por pieza × cadena (hasta ×5) y 10 más por cada pieza pasada de 3", () => {
  assert.strictEqual(P.puntosGrupo(3, 1), 30); assert.strictEqual(P.puntosGrupo(4, 1), 50); assert.strictEqual(P.puntosGrupo(3, 2), 60);
  assert.strictEqual(P.puntosGrupo(3, 9), P.puntosGrupo(3, 5), "la cadena no multiplica más de ×5");
});

test("al soltar, lo que se junta se va al capacho, lo de arriba cae y, si se juntan otras, es una cadena", () => {
  const e = P.nueva({ semilla: 1 });
  P.ponTablero(e, ["H......", "V......", "VHH...."]);
  e.actual = { t: [L.V], x: 1, y: 0, o: 0 };
  P.accion(e, "cae");
  const grupos = e.eventos.filter(x => x.tipo === "grupo").map(x => [x.pieza, x.celdas.length, x.cadena, x.puntos]);
  assert.deepStrictEqual(grupos, [["verde", 3, 1, 30], ["hoja", 3, 2, 60]]);
  assert.strictEqual(e.puntos, 90); assert.strictEqual(e.cadenaMax, 2); assert.strictEqual(e.quitadas, 6);
  assert.ok(e.celdas.every(c => c === -1), "el tablero queda limpio: " + P.texto(e).join("|"));
  assert.ok(e.actual && !e.fin, "y sale la siguiente rama");
});

test("una rama de lado sobre un hueco: cada pieza cae por su columna hasta apoyarse", () => {
  const e = P.nueva({ semilla: 1 });
  P.ponTablero(e, ["...P...", "...T..."]);
  e.actual = { t: [L.V, L.H], x: 2, y: 0, o: 1 };   // en horizontal: (2,0) y (3,0)
  P.accion(e, "cae");
  assert.deepStrictEqual(P.texto(e).slice(-3), ["...H...", "...P...", "..VT..."]);
});

test("girar: un cuarto de vuelta sobre la pieza inicial; contra la pared se corre de lado; mover no atraviesa nada", () => {
  const e = P.nueva({ semilla: 1 });
  e.actual = { t: [L.V, L.H], x: 6, y: 5, o: 0 };
  assert.ok(P.accion(e, "gira")); assert.deepStrictEqual([e.actual.x, e.actual.o], [5, 1], "contra la pared derecha, un paso a la izquierda");
  assert.ok(!P.accion(e, "derecha"), "no se sale del tablero");
  P.ponTablero(e, ["...P...", "...P...", "...P...", "...P...", "...P...", "...P...", "...P..."]);
  e.actual = { t: [L.V, L.H], x: 2, y: 5, o: 0 };
  assert.ok(!P.accion(e, "derecha"), "no atraviesa la columna de piedras");
  assert.ok(P.accion(e, "izquierda"));
});

test("la partida acaba cuando una rama no cabe (la columna de en medio, llena)", () => {
  const e = P.nueva({ semilla: 5 });
  P.ponTablero(e, Array.from({ length: 11 }, (_, i) => "..." + (i % 2 ? "V" : "H") + "..."));
  P.accion(e, "cae");
  assert.ok(e.fin, P.texto(e).join("|")); assert.ok(e.eventos.some(x => x.tipo === "fin"));
  assert.ok(!P.accion(e, "izquierda") && !P.accion(e, "gira"), "acabada, no se mueve nada");
  const antes = e.t; P.avanza(e, 1); assert.strictEqual(e.t, antes, "ni corre el reloj");
  assert.deepStrictEqual(Object.keys(P.resultado(e)).sort(), ["cadenaMax", "duracion_s", "puntos", "quitadas", "ramas"]);
});

test("la caída se acelera poco a poco y, pasado un rato, vienen ramas de 3", () => {
  assert.strictEqual(P.intervalo(0), 0.8);
  for (let t = 0; t < 600; t += 5) { assert.ok(P.intervalo(t + 5) <= P.intervalo(t)); assert.ok(P.intervalo(t) >= 0.25); }
  assert.strictEqual(P.intervalo(200), 0.25);
  assert.strictEqual(P.probTrio(10), 0); assert.ok(P.probTrio(60) > 0); assert.ok(P.probTrio(120) > P.probTrio(60));
  const e = P.nueva({ semilla: 9 }); e.t = 150; const largos = new Set(); for (let i = 0; i < 50; i++) largos.add(P.nueva({ semilla: i }).siguiente.t.length);
  assert.deepStrictEqual([...largos], [2], "al empezar, nunca de 3");
  let tres = 0; for (let i = 0; i < 200; i++) { P.accion(e, "cae"); if (e.fin) break; if (e.actual.t.length === 3) tres++; e.celdas.fill(-1); }
  assert.ok(tres > 0, "a los 150 s salen ramas de 3");
  // sin tocar nada, la rama baja sola una fila por intervalo
  const f = P.nueva({ semilla: 2 }); const y0 = f.actual.y; P.avanza(f, 0.81); assert.strictEqual(f.actual.y, y0 + 1);
});

test("una partida jugada a lo loco dura poco y nunca pasa del tope de puntos creíbles; el tope es el mismo en la api", () => {
  for (let s = 1; s <= 40; s++) {
    const e = P.nueva({ semilla: s }), acc = ["izquierda", "derecha", "gira", "cae", "baja"], r = P.azar(s * 7);
    while (!e.fin && e.t < 1200) { P.accion(e, acc[Math.floor(r() * acc.length)]); P.avanza(e, 0.05); }
    const res = P.resultado(e);
    assert.ok(e.fin, "la partida acaba sola (semilla " + s + ")");
    assert.ok(res.puntos <= P.tope(res.duracion_s), "semilla " + s + ": " + res.puntos + " puntos en " + res.duracion_s + " s");
  }
  const api = lee("apps/api/src/juegos/rutas.ts");
  const m = /"cae-la-cosecha":\s*\{\s*base:\s*(\d+),\s*porSegundo:\s*(\d+)\s*\}/.exec(api);
  assert.ok(m, "apps/api/src/juegos/rutas.ts declara el tope de «cae-la-cosecha»");
  assert.deepStrictEqual({ base: Number(m[1]), porSegundo: Number(m[2]) }, P.TOPE, "mismo tope en el motor y en la api");
});

// ---------- el dibujo: un contexto 2D de mentira que apunta las órdenes
function contexto() {
  const ops = [];
  const g = new Proxy({}, { get: (o, k) => k in o ? o[k] : (...a) => { ops.push([k].concat(a.map(x => typeof x === "number" ? Math.round(x * 10) / 10 : x))); }, set: (o, k, v) => { ops.push(["=" + k, v]); return true; } });
  return { g, ops };
}
test("el dibujo: cada pieza con su silueta (no solo su color), con trazos, sin texto ni emoji", () => {
  const huellas = {};
  for (const p of P.PIEZAS) {
    const { g, ops } = contexto(); Dib.pieza(g, p, 50, 50, 20);
    assert.ok(ops.some(o => o[0] === "fill") && ops.some(o => o[0] === "stroke"), p + ": relleno y borde");
    assert.ok(!ops.some(o => o[0] === "fillText" || o[0] === "strokeText"), p + ": sin texto");
    huellas[p] = ops.filter(o => !String(o[0]).startsWith("=")).map(o => o[0]).join(",");   // la forma: la secuencia de trazos, sin colores
  }
  assert.strictEqual(new Set(Object.values(huellas)).size, P.PIEZAS.length, "seis siluetas distintas aunque se quite el color");
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!emoji.test(FUENTE), "41_cae_la_cosecha.js no tiene emoji");
  // contraste: el borde de cada pieza contra su relleno (luminancia relativa, WCAG) ≥ 3:1, para que la silueta se lea
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  for (const [p, c] of Object.entries(Dib.COLOR)) { const a = lum(c.relleno), b = lum(c.borde), r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); assert.ok(r >= 3, p + ": contraste " + r.toFixed(1)); }
});

// ---------- lo puro del anfitrión
test("anfitrión: un juego necesita id, título y crea; el récord del aparato aguanta un almacén que falla; rutas de la api y semilla", () => {
  assert.deepStrictEqual(JP.validaJuego({ id: "cae-la-cosecha", titulo: "Cae la cosecha", crea() {} }), []);
  for (const mal of [null, {}, { id: "X", titulo: "a", crea() {} }, { id: "a", titulo: "a", crea() {} }, { id: "bien", titulo: " ", crea() {} }, { id: "bien", titulo: "t" }]) assert.notDeepStrictEqual(JP.validaJuego(mal), [], JSON.stringify(mal));
  assert.deepStrictEqual(JP.mejor(null, { puntos: 5 }), { puntos: 5 }); assert.deepStrictEqual(JP.mejor({ puntos: 9 }, { puntos: 5 }), { puntos: 9 }); assert.strictEqual(JP.mejor(null, null), null);
  const mapa = {}, alm = { getItem: k => mapa[k] || null, setItem: (k, v) => { mapa[k] = v; } };
  assert.strictEqual(JP.leeLocal(alm, "j"), null);
  assert.deepStrictEqual(JP.guardaLocal(alm, "j", { puntos: 120, duracion_s: 80 }, "2026-10-30").nuevo, true);
  assert.deepStrictEqual(JP.guardaLocal(alm, "j", { puntos: 90, duracion_s: 60 }, "2026-10-31"), { record: { puntos: 120, duracion_s: 80, fecha: "2026-10-30" }, nuevo: false });
  assert.strictEqual(JP.leeLocal(alm, "j").puntos, 120);
  const roto = { getItem() { throw new Error("bloqueado"); }, setItem() { throw new Error("lleno"); } };
  assert.strictEqual(JP.leeLocal(roto, "j"), null); assert.doesNotThrow(() => JP.guardaLocal(roto, "j", { puntos: 5, duracion_s: 9 }, "x"));
  assert.strictEqual(JP.leeLocal(null, "j"), null);
  mapa[JP.claveLocal("k")] = "{no es json"; assert.strictEqual(JP.leeLocal(alm, "k"), null);
  assert.strictEqual(JP.rutaPartidas("/api/", "cae-la-cosecha"), "/api/juegos/cae-la-cosecha/partidas"); assert.strictEqual(JP.rutaRecords(null, "x"), null);
  assert.strictEqual(JP.semilla("?debug&semilla=1234", 99), 1234); assert.ok(JP.semilla("", 1e12) >= 1);
  assert.strictEqual(JP.fmtDuracion(95), "1 min 35 s"); assert.strictEqual(JP.fmtPuntos(12345), "12.345");
});

test("en el código: el anfitrión no nombra al juego ni el juego al anfitrión; teclado por captura solo con el juego abierto; sin <style> (CSP)", () => {
  const sin = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
  assert.ok(!/cae-la-cosecha|CaeLaCosecha/.test(sin(ANFITRION)), "40_juegos.js no nombra al juego");
  assert.ok(!/juegos/.test(sin(FUENTE).replace(/"juego:[a-z]+"/g, "")), "41 no nombra al anfitrión");
  assert.ok(!/createElement\("style"\)/.test(ANFITRION + FUENTE), "estilos por CSSOM (style.cssText), nada de <style>: la CSP de producción no deja estilos en línea");
  assert.match(sin(ANFITRION), /on\(window, "keydown", function \(ev\) \{[\s\S]*?stopImmediatePropagation[\s\S]*?\}, true\);/, "la captura del teclado va en la fase de captura y se suelta al cerrar (on → quitar)");
  assert.ok(!/setInterval|requestAnimationFrame/.test(sin(ANFITRION) + sin(FUENTE)), "su reloj es la fase «pausa» del bucle");
});

// ---------- en el navegador (Cerro del fixture con el cliente web). Chrome por lanza(): el compartido de la puerta o uno propio dentro del turno.
const { sirve, motivoSalto, lanza } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");
const SALTO = motivoSalto("el juego Cae la cosecha") || saltoPagina("el juego Cae la cosecha");
const SALIDA = path.join(RAIZ, "pruebas", "salida"), CAPS = path.join(SALIDA, "capturas-juego");
let nav, srv, url, preparado = null;
const prepara = () => preparado || (preparado = (async () => {
  srv = await sirve(montaPagina({ finca: "cerro" }).carpeta); url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  nav = await lanza(); fs.mkdirSync(CAPS, { recursive: true });
})());
test.after(async () => { if (nav) await nav.close(); if (srv) srv.close(); });

/** JS por fotograma con CDP (ScriptDuration acumulado) y renders de three (renderer.info.render.frame) durante ms milisegundos */
async function cuesta(p, cdp, ms) {
  const m = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(x => [x.name, x.value]));
  const a = await m(), f0 = await p.evaluate(() => ({ r: window.__g.renderer.info.render.frame, n: window.__cuenta || 0 }));
  await p.waitForTimeout(ms);
  const b = await m(), f1 = await p.evaluate(() => ({ r: window.__g.renderer.info.render.frame, n: window.__cuenta || 0, calls: window.__g.renderer.info.render.calls }));
  const cuadros = Math.max(1, f1.n - f0.n);
  return { cuadros, renders: f1.r - f0.r, jsMsPorCuadro: (b.ScriptDuration - a.ScriptDuration) * 1000 / cuadros, llamadasUltimoRender: f1.calls };
}

describe("en el navegador", () => {
  before(async () => { if (!SALTO) await prepara(); });

  for (const modo of ["escritorio", "táctil"]) test(modo + ": J abre la ventana, «Jugar» pausa el mundo, se juega, Esc vuelve; 0 errores", { timeout: 300000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    const tactil = modo === "táctil";
    const p = await nav.newPage(tactil ? { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } }), errores = [];
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
    try {
      await p.addInitScript(() => { window.__cuenta = 0; const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => r(t => { window.__cuenta++; f(t); }); });
      await p.goto(url + "?debug&hora=12:00&semilla=4242");
      await p.waitForFunction(() => window.__g && window.__g.listo() && window.__juegos && window.__juegos().juegos.length, null, { timeout: 120000, polling: 500 });
      await p.waitForFunction(() => window.__g.pendientes() === 0, null, { timeout: 120000, polling: 500 }).catch(() => {});
      const cdp = await p.context().newCDPSession(p); await cdp.send("Performance.enable");
      const mundo = await cuesta(p, cdp, 3000);
      // abrir: J (escritorio) o el icono de la barra (táctil; en pantallas estrechas puede estar en «⋯»)
      if (tactil) {
        const visible = await p.evaluate(() => { const b = document.getElementById("hudIco-juegos"); return !!(b && b.offsetParent); });
        if (visible) await p.tap("#hudIco-juegos"); else { await p.tap("#bMas"); await p.locator("#hudMas button", { hasText: "Juegos" }).tap(); }
      } else { await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur()); await p.keyboard.press("KeyJ"); }
      await p.waitForSelector("#ventana-juegos:not([hidden]) [data-juega]", { timeout: 10000 });
      if (tactil) await p.tap("[data-juega]"); else await p.click("[data-juega]");
      await p.waitForFunction(() => window.__juegos().abierto && window.__juegos().pausaMundo, null, { timeout: 10000 });
      const tam = await p.evaluate(() => [...document.querySelectorAll("#juegoCapa button")].map(b => { const r = b.getBoundingClientRect(); return [b.getAttribute("aria-label") || b.textContent, Math.round(r.width), Math.round(r.height)]; }));
      for (const [n, w, h] of tam) assert.ok(w >= 44 && h >= 44, "botón «" + n + "» de " + w + " × " + h + " px (≥ 44)");
      await p.evaluate(() => window.__juegos().reinicia());
      const juego = await cuesta(p, cdp, 3000);
      const dj = await p.evaluate(() => window.__juegos());
      // jugar unas jugadas
      if (tactil) {
        const c = await p.locator("#juegoCapa canvas").boundingBox(), cx = c.x + c.width * 0.35, cy = c.y + c.height * 0.3;
        await p.touchscreen.tap(cx, cy);   // tocar: girar
        for (const a of ["izquierda", "gira", "derecha", "baja", "cae", "cae", "derecha", "cae"]) { await p.tap('[data-accion="' + a + '"]'); await p.waitForTimeout(120); }
        // deslizar de lado con el dedo (eventos táctiles de CDP)
        const toque = async (tipo, x, y) => cdp.send("Input.dispatchTouchEvent", { type: tipo, touchPoints: tipo === "touchEnd" ? [] : [{ x, y }] });
        await toque("touchStart", cx, cy); for (let i = 1; i <= 6; i++) { await toque("touchMove", cx + i * 15, cy); await p.waitForTimeout(16); } await toque("touchEnd", 0, 0);
      } else {
        for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowRight", "Space", "ArrowLeft", "ArrowLeft", "Space", "ArrowDown", "ArrowUp", "Space", "Space"]) { await p.keyboard.press(k); await p.waitForTimeout(90); }
        await p.keyboard.press("KeyP"); assert.ok(await p.evaluate(() => document.querySelector("#juegoCapa [aria-pressed]").getAttribute("aria-pressed") === "true"), "P pausa");
        await p.keyboard.press("KeyP");
      }
      await p.waitForTimeout(600);
      const est = await p.evaluate(() => window.__juegos().estado);
      await p.screenshot({ path: path.join(CAPS, (tactil ? "tactil" : "escritorio") + ".png") });
      const pos0 = await p.evaluate(() => window.__g.camera.position.toArray().map(v => Math.round(v * 100)));
      console.log("   " + modo + ": mundo " + mundo.cuadros + " cuadros, " + mundo.renders + " renders, " + mundo.llamadasUltimoRender + " llamadas, JS " + mundo.jsMsPorCuadro.toFixed(2) + " ms/cuadro · juego abierto " +
        juego.cuadros + " cuadros, " + juego.renders + " renders 3D, JS " + juego.jsMsPorCuadro.toFixed(2) + " ms/cuadro (fase «pausa» " + dj.msPorCuadro.toFixed(3) + " ms, " + dj.pintadas + " repintados del lienzo) · puntos " + est.puntos);
      assert.strictEqual(juego.renders, 0, "con el juego abierto, el mundo no se pinta");
      assert.ok(juego.jsMsPorCuadro <= mundo.jsMsPorCuadro, "el juego no cuesta más JS que el mundo que pausa");
      // Esc vuelve al mundo, donde estaba
      if (tactil) await p.tap('#juegoCapa button[aria-label^="Salir"]'); else await p.keyboard.press("Escape");
      await p.waitForFunction(() => !window.__juegos().abierto && !window.__juegos().pausaMundo, null, { timeout: 10000 });
      assert.strictEqual(await p.evaluate(() => document.getElementById("juegoCapa")), null);
      await p.waitForTimeout(500);
      const tras = await cuesta(p, cdp, 1000); assert.ok(tras.renders > 0, "el mundo vuelve a pintarse");
      const pos1 = await p.evaluate(() => window.__g.camera.position.toArray().map(v => Math.round(v * 100)));
      assert.deepStrictEqual(pos1, pos0, "la cámara sigue donde estaba");
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });
});

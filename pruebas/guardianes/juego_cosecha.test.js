"use strict";
// «Cae la cosecha» y el anfitrión de juegos (C9a; doc/sistema/JUEGOS.md), en Node y sin navegador:
//   · las reglas (CaeLaCosechaPuro de apps/web/motor/41_cae_la_cosecha.js) con casos deterministas: grupos conectados, cadenas, puntos, giro, fin, semilla;
//   · el tope de puntos creíbles es el mismo en el motor y en la api, y una partida jugada a lo loco no lo pasa;
//   · el dibujo: cada pieza con su silueta (no solo su color), sin texto ni emoji;
//   · lo puro del anfitrión (JuegosPuro de 40_juegos.js): validar un juego, récords en el aparato (con un almacén que falla), rutas y semilla;
//   · la clasificación entre familias por alias (C9c): ruta, lista blanca, nombres sin datos personales y el esquema contratos/juegos-clasificacion.schema.json.
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

test("clasificación por alias (C9c): ruta, validación de lista blanca, nombres sin datos personales y el esquema del contrato", () => {
  const Ajv2020 = require("ajv/dist/2020").default;
  const esq = JSON.parse(lee("contratos/juegos-clasificacion.schema.json")); delete esq.$schema;
  const V = new Ajv2020({ strict: false, allErrors: true }).compile(esq);
  assert.strictEqual(JP.rutaClasificacion("/api/", "cae-la-cosecha", 5), "/api/juegos/cae-la-cosecha/clasificacion?n=5"); assert.strictEqual(JP.rutaClasificacion(null, "x"), null);
  const ok = { juego: "cae-la-cosecha", total: 7, puestos: [{ puesto: 1, alias: "Olivares Sur", puntos: 900, es_mia: false }, { puesto: 2, alias: null, puntos: 700, es_mia: false }], mia: { puesto: 6, alias: null, puntos: 120, es_mia: true } };
  assert.ok(V(ok), JSON.stringify(V.errors)); assert.ok(V({ ...ok, mia: null }));
  for (const mal of [{ ...ok, hogar_id: 3 }, { ...ok, puestos: [{ puesto: 1, alias: "x", puntos: 9, es_mia: false, correo: "a@b.c" }] }, { ...ok, puestos: [{ puesto: 1, alias: "xyz", puntos: 9, es_mia: false, hogar_id: 1 }] }])
    assert.ok(!V(mal), "el esquema rechaza campos de más: " + JSON.stringify(mal).slice(0, 80));
  const c = JP.validaClasificacion(ok, "cae-la-cosecha"); assert.deepStrictEqual(c, { total: 7, puestos: ok.puestos, mia: ok.mia });
  assert.strictEqual(JP.validaClasificacion(ok, "otro"), null, "de otro juego"); assert.strictEqual(JP.validaClasificacion(null, "x"), null);
  assert.strictEqual(JP.validaClasificacion({ ...ok, puestos: [{ puesto: 0, alias: null, puntos: 5, es_mia: false }] }, "cae-la-cosecha"), null, "puesto 0");
  assert.strictEqual(JP.validaClasificacion({ ...ok, puestos: [{ puesto: 1, alias: 7, puntos: 5, es_mia: false }] }, "cae-la-cosecha"), null, "alias que no es texto");
  assert.deepStrictEqual(JP.validaClasificacion({ juego: "j", total: 0, puestos: [], mia: null }, "j"), { total: 0, puestos: [], mia: null });
  assert.deepStrictEqual(JP.validaClasificacion({ ...ok, extra: 1, puestos: [{ puesto: 1, alias: null, puntos: 5, es_mia: false, hogar_id: 9 }] }, "cae-la-cosecha").puestos, [{ puesto: 1, alias: null, puntos: 5, es_mia: false }], "lo que no es de la lista blanca no pasa al motor");
  assert.strictEqual(JP.nombrePuesto({ alias: "Olivares Sur", es_mia: false }), "Olivares Sur"); assert.strictEqual(JP.nombrePuesto({ alias: null, es_mia: false }), "Una familia");
  assert.strictEqual(JP.nombrePuesto({ alias: null, es_mia: true }), "Tu familia"); assert.strictEqual(JP.nombrePuesto({ alias: "Ana", es_mia: true }), "Ana (tú)");
  assert.strictEqual(JP.textoPuesto(c), "Tu puesto: 6.º de 7 familias"); assert.strictEqual(JP.textoPuesto({ total: 1, puestos: [], mia: { puesto: 1 } }), "Tu puesto: 1.º de 1 familia");
  assert.strictEqual(JP.textoPuesto({ total: 3, puestos: [], mia: null }), "Aún no estás en la clasificación."); assert.strictEqual(JP.textoPuesto(null), "Aún no estás en la clasificación.");
  const api = lee("apps/api/src/juegos/rutas.ts"), cuerpo = api.slice(api.indexOf("/clasificacion\"")), consulta = cuerpo.slice(cuerpo.indexOf("`WITH"), cuerpo.indexOf("[juego, n, hogar]"));
  assert.ok(/alias_visible/.test(consulta) && /g\.activo/.test(consulta), "solo alias visibles y hogares activos");
  assert.ok(!/correo|nombre_interno/.test(consulta), "la consulta no toca correo ni nombre interno");
  assert.ok(!/<style/i.test(ANFITRION), "sin <style> (CSP)"); assert.ok(!/innerHTML/.test(ANFITRION), "el alias lo escribe una persona: solo textContent");
});

// ---------- el juego en VR (C9b): zonas de la lámina, la palanca, y el anfitrión con una lámina y un mundo de mentira
const PARTIDA = () => new Function("CaeLaCosechaPuro", "CaeLaCosechaDibujo", "performance", "\"use strict\";\n" + FUENTE.slice(FUENTE.indexOf("  function CaeLaCosechaPartida"), FUENTE.indexOf("  // el manifiesto")) + "\nreturn CaeLaCosechaPartida;")(P, Dib, { now: () => 0 });

test("VR: la lámina da cada zona (izquierda, girar, derecha, soltar; Pausa y Salir arriba) y, acabada la partida, «Otra partida» y «Salir»", () => {
  const bt = [{ a: "izquierda" }, { a: "gira" }, { a: "derecha" }, { a: "cae" }], V = JP.VR, z = (x, y, fin) => JP.zonaVR(x / V.w, y / V.h, bt, fin);
  const g = JP.geoVR(4), c = r => [r.x + r.w / 2, r.y + r.h / 2];
  assert.deepStrictEqual(g.botones.map(r => z(...c(r))), bt.map(b => ({ tipo: "accion", a: b.a })), "cada botón del pie da su acción, de izquierda a derecha");
  assert.deepStrictEqual(z(...c(g.pausa)), { tipo: "pausa" }); assert.deepStrictEqual(z(...c(g.salir)), { tipo: "salir" });
  assert.strictEqual(z(V.w / 2, V.tabY + 300), null, "el tablero no es una zona"); assert.strictEqual(z(2, 2), null, "el borde vacío no hace nada");
  const g2 = JP.geoVR(2);
  assert.deepStrictEqual(z(...c(g2.botones[0]), true), { tipo: "otra" }); assert.deepStrictEqual(z(...c(g2.botones[1]), true), { tipo: "salir" });
  assert.strictEqual(z(...c(g.pausa), true), null, "acabada la partida ya no hay Pausa");
  for (const r of g.botones.concat([g.pausa, g.salir])) assert.ok(r.w >= 150 && r.h >= 72 && r.x >= 0 && r.x + r.w <= V.w && r.y + r.h <= V.h, "zonas de ≥ 19 × 9 cm a 800 px/m y dentro de la lámina");
  assert.ok(g.botones.every((r, i) => !i || r.x >= g.botones[i - 1].x + g.botones[i - 1].w), "las zonas del pie no se pisan");
});

test("VR: la palanca mueve (y repite), gira y suelta; se rearma al soltarla; elige el eje que más se inclina", () => {
  const st = { dir: "", t: 0 }, p = (x, y, dt) => JP.palanca(st, x, y, dt || 0.016);
  assert.deepStrictEqual(p(0.1, 0.1), []); assert.deepStrictEqual(p(-0.9, 0), ["izquierda"], "al inclinar, una orden");
  assert.deepStrictEqual(p(-0.9, 0, 0.2), [], "no se repite enseguida"); assert.deepStrictEqual(p(-0.9, 0, 0.2), ["izquierda"], "a los 0,35 s, otra");
  let n = 0; for (let i = 0; i < 20; i++) n += p(-0.9, 0, 0.14).length; assert.ok(n >= 19, "luego, una cada 0,14 s");
  assert.deepStrictEqual(p(0, 0), []); assert.deepStrictEqual(p(0.8, 0), ["derecha"], "tras soltar se rearma");
  p(0, 0); assert.deepStrictEqual(p(0, -0.9), ["arriba"], "hacia delante = girar"); assert.deepStrictEqual(p(0, -0.9, 1), [], "arriba no se repite");
  p(0, 0); assert.deepStrictEqual(p(0, 0.9), ["abajo"], "hacia atrás = soltar"); assert.deepStrictEqual(p(0, 0.9, 1), []);
  p(0, 0); assert.deepStrictEqual(p(0.7, -0.9), ["arriba"], "gana el eje más inclinado");
  p(0, 0); assert.deepStrictEqual(p(0.5, 0), [], "una inclinación leve (< 0,6) no arranca"); assert.deepStrictEqual(p(0.65, 0), ["derecha"]);
  assert.deepStrictEqual(p(0.45, 0), [], "dentro de la histéresis (0,35-0,6) sigue la orden sin cambiarla"); assert.deepStrictEqual(p(0.45, 0, 0.5), ["derecha"], "y repite");
});

test("VR: la partida se dibuja en la lámina con la MISMA función del juego (sin lienzo propio ni botones del DOM) y la firma solo cambia si cambia lo que se ve", () => {
  const mk = PARTIDA()({ lienzo: null, mandos: null, semilla: 5, epoca: null, reducido: false, vr: true }, () => {});
  for (const f of ["pintaEn", "firma", "accion"]) assert.strictEqual(typeof mk[f], "function", f);
  const f0 = mk.firma(); assert.strictEqual(mk.firma(), f0, "sin jugar, la misma firma");
  const { g, ops } = contexto(); assert.strictEqual(mk.pintaEn(g, 880, 780), true);
  assert.ok(ops.some(o => o[0] === "fillRect") && ops.some(o => o[0] === "strokeRect") && ops.some(o => o[0] === "ellipse"), "dibuja el tablero y las piezas con el dibujo del juego (Dib.pieza)");
  assert.ok(ops.every(o => o[0] !== "setTransform"), "no toca la transformación de quien le presta el contexto (la lámina pone su propio origen)");
  assert.strictEqual(mk.accion("izquierda"), true); assert.notStrictEqual(mk.firma(), f0, "mover cambia la firma");
  const f1 = mk.firma(); mk.actualiza(0.01); assert.strictEqual(mk.firma(), f1, "pasar 10 ms sin que baje la rama no la cambia (no se sube la textura)");
  mk.pausa(true); assert.notStrictEqual(mk.firma(), f1, "pausar la cambia"); assert.strictEqual(mk.accion("derecha"), false, "en pausa no se mueve");
  const pr = contexto(); mk.pintaEn(pr.g, 880, 780); assert.ok(!pr.ops.some(o => o[0] === "fillText" && /continuar/.test(o[1])), "en VR no sale el texto de la tecla P");
  assert.match(FUENTE, /vr: \{ botones: \[\{ a: "izquierda", t: "Izquierda" \}, \{ a: "gira", t: "Girar" \}, \{ a: "derecha", t: "Derecha" \}, \{ a: "cae", t: "Soltar" \}\]/, "las cuatro zonas");
  assert.match(FUENTE, /palanca: \{ izquierda: "izquierda", derecha: "derecha", arriba: "gira", abajo: "cae" \}/, "la palanca reparte igual");
});

test("VR: el anfitrión abre el juego como lámina (el mundo no se pausa), lo tocan el rayo, la palanca y B, repinta solo con firma nueva y lo libera todo al cerrar", () => {
  const nada = () => {}, laminas = {}, cuenta = { abre: 0, cierra: 0, pinta: 0, panel: 0 }, bus = {}, filas = [], VRX = { on: true, captura: null }, pausas = [];
  const Laminas = {
    abre(o) { if (laminas[o.id]) this.cierra(o.id, "reabierta"); laminas[o.id] = { o, firma: null, cx: contexto().g }; cuenta.abre++; this.repinta(o.id, true); return true; },
    repinta(id, f) { const l = laminas[id]; if (!l) return false; const fm = l.o.firma(); if (!f && fm === l.firma) return false; l.o.pinta(l.cx, l.o.w, l.o.h); l.firma = fm; cuenta.pinta++; return true; },
    cierra(id, m) { const l = laminas[id]; if (!l) return false; delete laminas[id]; cuenta.cierra++; l.o.alCierra(m); return true; },
    info: id => ({ abierta: !!laminas[id], pintadas: cuenta.pinta }), toca(u, v) { const l = laminas["juego-vr"]; return l ? l.o.alTocar(u, v) : false; }
  };
  const PanelVR = { filas(p, d) { filas.push({ p, d }); return nada; }, cierra() { cuenta.panel++; }, repinta: nada };
  const cuerpo = ANFITRION.slice(ANFITRION.indexOf("  function JuegosMotor"), ANFITRION.indexOf("  // el manifiesto"));
  const g = { D: { base: "", finca_id: "x" }, ConfigPuro: { prefijoApi: () => null }, Config: { tablaEpocas: () => null }, Pausa: { pon: q => pausas.push(q), quita: nada, activa: () => false },
    Ventanas: { registra: () => nada, abierta: () => false }, Teclas: { registra: () => nada }, Hud: { icono: () => nada, alterna: nada }, VRX, Laminas, PanelVR, window: { localStorage: null }, location: { search: "?semilla=7" }, document: {} };
  const n = { on: (ev, fn) => { bus[ev] = fn; }, limpia: nada, emite: nada };
  const api = new Function("JuegosPuro", "n", "g", "\"use strict\";\nvar D = g.D, ConfigPuro = g.ConfigPuro, Config = g.Config, Pausa = g.Pausa, Ventanas = g.Ventanas, Teclas = g.Teclas, Hud = g.Hud, VRX = g.VRX, Laminas = g.Laminas, PanelVR = g.PanelVR, window = g.window, location = g.location, document = g.document, performance = { now: () => 0 };\n" + cuerpo + "\nreturn JuegosMotor(n);")(JP, n, g);
  const Partida = PARTIDA(); let ultima = null;
  const def = { id: "cae-la-cosecha", titulo: "Cae la cosecha", descripcion: "x", vr: { botones: [{ a: "izquierda", t: "Izquierda" }, { a: "gira", t: "Girar" }, { a: "derecha", t: "Derecha" }, { a: "cae", t: "Soltar" }], palanca: { izquierda: "izquierda", derecha: "derecha", arriba: "gira", abajo: "cae" }, ayuda: "a" }, crea: ctx => (ultima = Partida(ctx, nada)) };
  const fin = () => ultima.estado().fin;
  bus["juego:ofrece"](def);
  const fila = filas.find(f => f.p === "mundo" && f.d.id === "juegos"); assert.ok(fila, "el anfitrión pone la fila «Juegos» en la pestaña Mundo del panel VR"); assert.strictEqual(fila.d.visible(), true);
  const btn = []; fila.d.botones((id, x, y, w, h, txt, fn) => btn.push({ id, txt, fn }), 600); assert.deepStrictEqual(btn.map(b => b.txt), ["Cae la cosecha"]);
  btn[0].fn();
  assert.strictEqual(api.abierto(), null, "no hay ventana a pantalla completa"); assert.strictEqual(pausas.length, 0, "el mundo NO se pausa en VR");
  assert.ok(laminas["juego-vr"], "la lámina está abierta"); assert.strictEqual(cuenta.abre, 1); assert.strictEqual(cuenta.panel, 1, "abrir el juego cierra el panel");
  const o = laminas["juego-vr"].o; assert.strictEqual(o.modo, "vr"); assert.ok(o.ancho > 0.9 && o.ancho < 1.3 && o.alto / o.ancho > 1.2, "≈ 1,1 × 1,4 m: piezas de ≈ 8 cm a 1,4 m");
  assert.ok(VRX.captura && typeof VRX.captura.palanca === "function", "la palanca queda para el juego (29_vr.js la lee)"); assert.strictEqual(cuenta.pinta, 1);
  const p0 = cuenta.pinta; api.turnoVR(0.01); api.turnoVR(0.01); assert.strictEqual(cuenta.pinta, p0, "sin cambios, no se repinta (no se sube la textura)");
  const G = JP.geoVR(4), c = r => [r.x + r.w / 2, r.y + r.h / 2], z = (x, y) => Laminas.toca(x / JP.VR.w, y / JP.VR.h);
  assert.strictEqual(z(...c(G.botones[0])), true, "el gatillo sobre una zona la usa"); api.turnoVR(0.01); assert.strictEqual(cuenta.pinta, p0 + 1, "tras mover, se repinta una vez");
  assert.strictEqual(z(440, JP.VR.tabY + 300), true, "tocar el tablero no se escapa al olivo de detrás (devuelve true)");
  VRX.captura.palanca(0.9, 0, 0.016); api.turnoVR(0.01); assert.strictEqual(cuenta.pinta, p0 + 2, "la palanca mueve y repinta");
  z(...c(G.botones[1])); z(...c(G.botones[2]));
  assert.strictEqual(VRX.captura.boton("B"), true, "B pausa"); api.turnoVR(0.01); const pz = cuenta.pinta; z(...c(G.botones[0])); api.turnoVR(0.01); assert.strictEqual(cuenta.pinta, pz, "en pausa, el gatillo no mueve");
  VRX.captura.boton("B"); z(...c(G.botones[3])); api.turnoVR(0.01);
  assert.strictEqual(z(...c(G.salir)), true); assert.strictEqual(laminas["juego-vr"], undefined, "Salir cierra la lámina"); assert.strictEqual(VRX.captura, null, "y suelta la palanca");
  assert.strictEqual(cuenta.abre, cuenta.cierra, "todo lo abierto está cerrado");
  // hasta el final: se pinta «Se acabó la partida», el pie son «Otra partida» y «Salir», y «Otra partida» empieza de cero
  btn[0].fn(); for (let i = 0; i < 80 && !fin(); i++) { VRX.captura.palanca(0, 0.9, 0.016); VRX.captura.palanca(0, 0, 0.016); api.turnoVR(0.5); }
  assert.ok(fin(), "soltando ramas, la partida acaba"); api.turnoVR(0.01);
  const G2 = JP.geoVR(2); assert.strictEqual(z(...c(G2.botones[0])), true); assert.ok(!fin(), "«Otra partida» empieza otra"); assert.strictEqual(z(...c(G2.salir)), true); assert.strictEqual(laminas["juego-vr"], undefined);
  btn[0].fn(); assert.ok(laminas["juego-vr"]); laminas["juego-vr"].o.alCierra("lejos"); assert.strictEqual(VRX.captura, null, "cerrada por Laminas (lejos), suelta la palanca");
  delete laminas["juego-vr"]; btn[0].fn(); assert.ok(VRX.captura); VRX.captura.boton("palanca"); assert.strictEqual(laminas["juego-vr"], undefined, "pulsar la palanca sale");
  btn[0].fn(); bus["vr:sale"](); assert.strictEqual(laminas["juego-vr"], undefined, "al salir de VR se cierra"); assert.strictEqual(VRX.captura, null);
  bus["juego:ofrece"]({ id: "otro-juego", titulo: "Otro", crea: nada }); const b2 = []; fila.d.botones((id, x, y, w, h, txt) => b2.push(txt), 600); assert.deepStrictEqual(b2, ["Cae la cosecha"], "un juego sin `vr` no se ofrece en VR");
  assert.strictEqual(api.abreVR("otro-juego"), false);
});

test("VR (C9b+): al acabar la partida, la lámina enseña tu puesto y la tabla corta (api simulada); sin servidor o con error, nada", async () => {
  const nada = () => {}, bus = {}, filas = [], VRX = { on: true, captura: null }, laminas = {}, cuenta = { pinta: 0 }, ops = [];
  const Laminas = {
    abre(o) { laminas[o.id] = { o, firma: null }; this.repinta(o.id, true); return true; },
    repinta(id, f) { const l = laminas[id]; if (!l) return false; const fm = l.o.firma(); if (!f && fm === l.firma) return false; const c = contexto(); l.o.pinta(c.g, l.o.w, l.o.h); ops.length = 0; ops.push(...c.ops); l.firma = fm; cuenta.pinta++; return true; },
    cierra(id, m) { const l = laminas[id]; if (!l) return false; delete laminas[id]; l.o.alCierra(m); return true; }, info: () => ({}), toca: nada
  };
  const cuerpo = ANFITRION.slice(ANFITRION.indexOf("  function JuegosMotor"), ANFITRION.indexOf("  // el manifiesto"));
  const CLAS = { juego: "cae-la-cosecha", total: 7, puestos: [{ puesto: 1, alias: "Olivares Sur", puntos: 9000, es_mia: false }, { puesto: 2, alias: null, puntos: 700, es_mia: false }], mia: { puesto: 6, alias: null, puntos: 120, es_mia: true } };
  const fetchAnt = globalThis.fetch, pedidas = [];
  async function juega(prefijo, respuesta) {
    globalThis.fetch = (u, o) => { pedidas.push((o && o.method || "GET") + " " + u); return Promise.resolve(respuesta(u)); };
    const g = { D: { base: "", finca_id: "x" }, ConfigPuro: { prefijoApi: () => prefijo }, Config: { tablaEpocas: () => null }, Pausa: { pon: nada, quita: nada, activa: () => false },
      Ventanas: { registra: () => nada, abierta: () => false }, Teclas: { registra: () => nada }, Hud: { icono: () => nada, alterna: nada }, VRX, Laminas, PanelVR: { filas(p, d) { filas.push(d); return nada; }, cierra: nada, repinta: nada }, window: { localStorage: null }, location: { search: "?semilla=7" }, document: {} };
    const n = { on: (ev, fn) => { bus[ev] = fn; }, limpia: nada, emite: nada };
    const api = new Function("JuegosPuro", "n", "g", "\"use strict\";\nvar D = g.D, ConfigPuro = g.ConfigPuro, Config = g.Config, Pausa = g.Pausa, Ventanas = g.Ventanas, Teclas = g.Teclas, Hud = g.Hud, VRX = g.VRX, Laminas = g.Laminas, PanelVR = g.PanelVR, window = g.window, location = g.location, document = g.document, performance = { now: () => 0 };\n" + cuerpo + "\nreturn JuegosMotor(n);")(JP, n, g);
    let ultima = null; const Partida = PARTIDA();
    bus["juego:ofrece"]({ id: "cae-la-cosecha", titulo: "Cae la cosecha", vr: { botones: [{ a: "izquierda", t: "I" }, { a: "gira", t: "G" }, { a: "derecha", t: "D" }, { a: "cae", t: "S" }], palanca: { abajo: "cae" } }, crea: ctx => (ultima = Partida(ctx, nada)) });
    assert.ok(api.abreVR("cae-la-cosecha"));
    for (let i = 0; i < 80 && !ultima.estado().fin; i++) { VRX.captura.palanca(0, 0.9, 0.016); VRX.captura.palanca(0, 0, 0.016); api.turnoVR(0.5); }
    assert.ok(ultima.estado().fin); api.turnoVR(0.01);
    for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r));
    api.turnoVR(0.01);
    return () => ops.filter(o => o[0] === "fillText").map(o => o[1]).join(" | ");
  }
  const J = (cuerpo, status) => ({ status: status || 200, json: () => Promise.resolve(cuerpo) });
  try {
    const textos = await juega("/api/", u => /clasificacion/.test(u) ? J(CLAS) : /partidas/.test(u) ? J({ juego: "cae-la-cosecha", es_record: false, record: null, partidas: 1 }, 201) : J({ record: null, partidas: 0, juego: "cae-la-cosecha" }));
    const t = textos();
    assert.ok(/Tu puesto: 6\.º de 7 familias/.test(t) && /1\.º  Olivares Sur/.test(t) && /2\.º  Una familia/.test(t) && /6\.º  Tu familia/.test(t) && /9\.000/.test(t), "la lámina enseña el puesto y la tabla: " + t);
    assert.ok(pedidas.some(x => /^GET \/api\/juegos\/cae-la-cosecha\/clasificacion\?n=5/.test(x)), pedidas.join(" | "));
    for (const k of Object.keys(laminas)) laminas[k].o.alCierra("x"); ops.length = 0;
    const sin = await juega(null, () => { throw new Error("sin servidor no se pide nada"); });
    assert.ok(!/Tu puesto|Aún no estás/.test(sin()), "sin servidor, la lámina no enseña clasificación");
    for (const k of Object.keys(laminas)) delete laminas[k];
    const err = await juega("/api/", u => /clasificacion/.test(u) ? J({}, 401) : J({ juego: "cae-la-cosecha", es_record: false, record: null, partidas: 1 }, 201));
    assert.ok(!/Tu puesto|Aún no estás/.test(err()), "sin sesión (401), tampoco");
  } finally { globalThis.fetch = fetchAnt; }
});

test("VR (C9b+): filasVR corta la tabla y pone la propia al final si no cabe; no inventa nada sin clasificación", () => {
  const c = JP.validaClasificacion({ juego: "j", total: 9, puestos: [1, 2, 3, 4, 5].map(i => ({ puesto: i, alias: i === 2 ? "Ana" : null, puntos: i * 1000, es_mia: false })), mia: { puesto: 8, alias: "Yo", puntos: 50, es_mia: true } }, "j");
  const v = JP.filasVR(c, 3);
  assert.strictEqual(v.puesto, "Tu puesto: 8.º de 9 familias"); assert.deepStrictEqual(v.filas.map(f => f.t), ["1.º  Una familia", "2.º  Ana", "3.º  Una familia", "8.º  Yo (tú)"]); assert.deepStrictEqual(v.filas.map(f => f.mia), [false, false, false, true]);
  assert.strictEqual(JP.filasVR(null, 3), null); assert.deepStrictEqual(JP.filasVR({ total: 0, puestos: [], mia: null }, 3).filas, []);
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
const { sirve, motivoSalto, lanza, desgloseLlamadas } = require("./_navegador");
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
    const p = await nav.newPage(tactil ? { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 800 } }), errores = [];
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
    } catch (er) {
      const d = await p.evaluate(() => ({ juegos: window.__juegos ? window.__juegos() : null, comp: window.__componentes ? window.__componentes().filter(c => /juego|cosecha/.test(c.id)) : null })).catch(() => null);
      console.log("   fallo en " + modo + ": " + JSON.stringify(d) + " · errores: " + JSON.stringify(errores));
      await p.screenshot({ path: path.join(CAPS, "fallo_" + (tactil ? "tactil" : "escritorio") + ".png") }).catch(() => {});
      throw er;
    } finally { await p.close(); }
  });

  test("clasificación entre familias (C9c): con la api simulada, la ventana Juegos enseña la tabla y la pantalla de fin, tu puesto; sin ids ni correos; 0 errores", { timeout: 300000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    const p = await nav.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), errores = [], pedidas = [];
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/favicon|404|Failed to load resource/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
    const J = (cuerpo, status) => ({ status: status || 200, contentType: "application/json", body: JSON.stringify(cuerpo) });
    const CLAS = { juego: "cae-la-cosecha", total: 7, puestos: [{ puesto: 1, alias: "Olivares Sur", puntos: 900, es_mia: false }, { puesto: 2, alias: null, puntos: 700, es_mia: false }, { puesto: 3, alias: "Ana", puntos: 500, es_mia: false }], mia: { puesto: 6, alias: null, puntos: 120, es_mia: true } };
    await p.route("**/api/juegos/**", r => {
      const u = r.request().url(); pedidas.push(r.request().method() + " " + u.replace(/^.*\/api\//, ""));
      if (/\/clasificacion/.test(u)) return r.fulfill(J(CLAS));
      if (/\/partidas/.test(u)) return r.fulfill(J({ juego: "cae-la-cosecha", es_record: true, record: { puntos: 100, duracion_s: 30, fecha: new Date().toISOString() }, partidas: 1 }, 201));
      return r.fulfill(J({ juego: "cae-la-cosecha", record: null, partidas: 0 }));
    });
    try {
      await p.goto(url + "?debug&hora=12:00&semilla=4242&api=/api/");
      await p.waitForFunction(() => window.__g && window.__g.listo() && window.__juegos && window.__juegos().juegos.length, null, { timeout: 120000, polling: 500 });
      const visible = await p.evaluate(() => { const b = document.getElementById("hudIco-juegos"); return !!(b && b.offsetParent); });
      if (visible) await p.tap("#hudIco-juegos"); else { await p.tap("#bMas"); await p.locator("#hudMas button", { hasText: "Juegos" }).tap(); }
      await p.waitForSelector("#ventana-juegos [data-clasificacion]", { timeout: 15000 });
      const txt = await p.locator("#ventana-juegos [data-clasificacion]").innerText();
      for (const f of ["Olivares Sur", "Una familia", "Ana", "Tu puesto: 6.º de 7 familias", "900"]) assert.ok(txt.includes(f), "la ventana enseña «" + f + "»: " + txt);
      assert.ok(!/hogar|correo|@/i.test(txt), "nada de ids ni correos");
      await p.screenshot({ path: path.join(CAPS, "clasificacion_ventana.png") });
      await p.tap("[data-juega]");
      await p.waitForFunction(() => window.__juegos().abierto, null, { timeout: 10000 });
      for (let i = 0; i < 80 && !(await p.evaluate(() => window.__juegos().estado.fin)); i++) { await p.tap('[data-accion="cae"]').catch(() => {}); await p.waitForTimeout(60); }
      assert.ok(await p.evaluate(() => window.__juegos().estado.fin), "la partida acaba soltando ramas");
      await p.waitForSelector("#juegoCapa [data-clasificacion]:not([hidden])", { timeout: 15000 });
      const fin = await p.locator("#juegoCapa [data-clasificacion]").innerText();
      assert.ok(/Tu puesto: 6\.º de 7 familias/.test(fin) && /Olivares Sur/.test(fin) && /Una familia/.test(fin), "el fin de partida enseña tu puesto y la tabla corta: " + fin);
      const tam = await p.evaluate(() => { const r = document.querySelector("#juegoCapa [role=alertdialog] > div").getBoundingClientRect(); return [r.width, r.height, window.innerWidth, window.innerHeight]; });
      assert.ok(tam[0] <= tam[2] && tam[1] <= tam[3], "la tarjeta de fin cabe en el móvil: " + tam);
      await p.screenshot({ path: path.join(CAPS, "clasificacion_fin.png") });
      assert.ok(pedidas.some(x => /^POST juegos\/cae-la-cosecha\/partidas/.test(x)) && pedidas.some(x => /clasificacion\?n=5/.test(x)), pedidas.join(" | "));
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });

  test("VR simulada: la fila «Juegos» del panel abre el juego como lámina delante, el rayo con el gatillo y la palanca juegan, B pausa, Salir cierra; sin pausar el mundo ni subir el presupuesto", { timeout: 400000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    if (!process.env.GEMELO_VR) return t.skip("opcional: define GEMELO_VR=1 para el juego en VR con el WebXR simulado (inestable con SwiftShader, como vr.test.js)");
    const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
    await p.addInitScript({ content: lee("pruebas/mock_xr.js") });
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
    const dbg = () => p.evaluate(() => window.__vrDebug()), jue = () => p.evaluate(() => window.__juegos());
    const fot = async n => { const f0 = await p.evaluate(() => window.__mockXR.fotogramas); await p.waitForFunction(f => window.__mockXR.fotogramas >= f, f0 + n, { timeout: 60000, polling: 100 }); };
    const fisica = (r, w) => { const c = Math.cos(-r.yaw), s = Math.sin(-r.yaw), x = w[0] - r.x, y = w[1] - r.y, z = w[2] - r.z; return [x * c + z * s, y, -x * s + z * c]; };
    const mem = () => p.evaluate(() => { const m = window.__g.renderer.info.memory; return [m.textures, m.geometries]; });
    // apunta el mando derecho a un punto (u, v) de la lámina (u a la derecha, v hacia abajo, de 0 a 1) y dispara el gatillo
    async function toca(u, v) {
      const d = await dbg(), j = await jue(), pos = j.vr.lamina.pos, ang = Math.atan2(d.cabeza[0] - pos[0], d.cabeza[2] - pos[2]), lx = (u - 0.5) * 1.1, ly = (0.5 - v) * 1.4;
      await p.evaluate(w => window.__mockXR.apunta("right", w), fisica(d.rig, [pos[0] + lx * Math.cos(ang), pos[1] + ly, pos[2] - lx * Math.sin(ang)]));
      await fot(2); await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(2);
    }
    const V = { w: 880, h: 1120 }, zona = (x, y) => toca(x / V.w, y / V.h);
    async function aBoton(id) {
      for (let i = 0; i < 12; i++) {
        const d = await dbg(), q = (await p.evaluate(() => window.__vrBotones())).find(b => b.id === id);
        assert.ok(q, "no hay botón " + id);
        if (d.hover === id) return q;
        const tam = d.panelTam, pos = d.panelPos, lx = ((q.x + q.w / 2) / tam[0] - 0.5) * tam[2], ly = (0.5 - (q.y + q.h / 2) / tam[1]) * tam[3], ang = Math.atan2(d.cabeza[0] - pos[0], d.cabeza[2] - pos[2]);
        await p.evaluate(v => window.__mockXR.apunta("right", v), fisica(d.rig, [pos[0] + lx * Math.cos(ang), pos[1] + ly, pos[2] - lx * Math.sin(ang)]));
        await fot(3);
      }
      return (await dbg()).hover === id ? true : null;
    }
    const cap = async n => { await p.screenshot({ path: path.join(CAPS, n), timeout: 120000 }).catch(e => console.log("   (captura " + n + " no hecha: " + String(e.message).split("\n")[0] + ")")); };   // en VR simulada con SwiftShader una captura puede tardar
    const pulsa = async (mano, k) => { await p.evaluate(([m, b]) => window.__mockXR.boton(m, b, true), [mano, k]); await fot(3); await p.evaluate(([m, b]) => window.__mockXR.boton(m, b, false), [mano, k]); await fot(3); };
    const pal = async (x, y) => { await p.evaluate(([a, b]) => window.__mockXR.ejes("right", a, b), [x, y]); await fot(3); await p.evaluate(() => window.__mockXR.ejes("right", 0, 0)); await fot(3); };
    // C9b+: la clasificación de la lámina de fin (api simulada, como en la prueba de pantalla)
    const CLAS_VR = { juego: "cae-la-cosecha", total: 7, puestos: [{ puesto: 1, alias: "Olivares Sur", puntos: 900, es_mia: false }, { puesto: 2, alias: null, puntos: 700, es_mia: false }], mia: { puesto: 6, alias: null, puntos: 120, es_mia: true } };
    await p.route("**/api/juegos/**", r => {
      const u = r.request().url(), J = (c, st) => r.fulfill({ status: st || 200, contentType: "application/json", body: JSON.stringify(c) });
      if (/\/clasificacion/.test(u)) return J(CLAS_VR);
      if (/\/partidas/.test(u)) return J({ juego: "cae-la-cosecha", es_record: true, record: { puntos: 100, duracion_s: 30, fecha: new Date().toISOString() }, partidas: 1 }, 201);
      return J({ juego: "cae-la-cosecha", record: null, partidas: 0 });
    });
    try {
      await p.goto(url + "?debug&hora=12:00&semilla=4242&api=/api/");
      await p.waitForFunction(() => window.__g && window.__g.listo() && window.__vrDebug && window.__juegos && window.__juegos().ofrecidosVR.length, null, { timeout: 120000, polling: 500 });
      await p.waitForSelector("#btnVR", { timeout: 120000 }); await p.click("#btnVR", { timeout: 120000 });
      await p.waitForFunction(() => window.__vrDebug && window.__vrDebug().on, null, { timeout: 120000, polling: 200 });
      await fot(6); await p.waitForFunction(() => window.__g.pendientes() === 0, null, { timeout: 120000, polling: 500 }).catch(() => {}); await fot(6);
      const [tex0, geo0] = await mem();
      const q = await aBoton("juego:cae-la-cosecha"); assert.ok(q, "el rayo no llegó a «Cae la cosecha» en la fila «Juegos»");
      assert.ok(q === true || (q.h >= 64 && q.w >= 200), "el botón es grande");
      await cap("vr_juego_panel.png");
      await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(6);
      let d = await dbg(), j = await jue();
      assert.ok(j.vr && j.vr.id === "cae-la-cosecha" && j.vr.lamina.abierta, JSON.stringify(j.vr)); assert.strictEqual(d.panel, false, "el panel se cierra para ver la lámina");
      assert.strictEqual(j.abierto, null, "no hay ventana a pantalla completa"); assert.strictEqual(j.pausaMundo, false, "el mundo NO se pausa en VR");
      const lp = j.vr.lamina.pos, dist = Math.hypot(lp[0] - d.cabeza[0], lp[2] - d.cabeza[2]);
      assert.ok(dist > 1.2 && dist < 1.6 && Math.abs(lp[1] - d.cabeza[1]) < 0.3, "delante (1,4 m) y a la altura de los ojos: " + dist.toFixed(2) + " m, Δy " + (lp[1] - d.cabeza[1]).toFixed(2));
      await cap("vr_juego_abre.png");
      // presupuesto: el juego en lámina = 1 llamada (por ojo) y 1 textura más; el mundo sigue dibujándose
      let dl = await p.evaluate(desgloseLlamadas); for (let i = 0; i < 8 && !dl.total; i++) { await fot(2); dl = await p.evaluate(desgloseLlamadas); }   // (entre dos fotogramas el contador puede estar a cero)
      const [tex1, geo1] = await mem(), nJ = dl.filas.filter(f => /juegoVR/.test(f[0])).reduce((s, f) => s + f[1], 0);
      console.log("   juego en VR: " + nJ + " llamada(s) de " + dl.total + ", texturas " + tex0 + " → " + tex1 + ", geometrías " + geo0 + " → " + geo1 + ", lámina " + j.vr.lamina.w + " × " + j.vr.lamina.h + " px");
      assert.ok(nJ >= 1 && nJ <= 2, "la lámina del juego cuesta 1-2 llamadas (una por ojo): " + nJ);
      // (las texturas y geometrías del panel VR y de las teselas que llegan también cuentan entre tex0 y tex1: la lámina se mide al cerrarla, más abajo)
      const fr0 = await p.evaluate(() => window.__g.renderer.info.render.frame); await fot(8);
      assert.ok(await p.evaluate(f => window.__g.renderer.info.render.frame > f, fr0), "el mundo sigue dibujándose alrededor");
      // jugar con el rayo y el gatillo: zonas de «Izquierda», «Girar», «Derecha» y «Soltar» (el pie de la lámina)
      const pie = 930 + 65, X = [12, 232, 452, 672].map(x => x + 98), pint0 = (await jue()).vr.lamina.pintadas;
      await zona(X[0], pie); await zona(X[0], pie); await zona(X[1], pie); await zona(X[2], pie); await zona(X[3], pie);
      await cap("vr_juego_gatillo.png");
      assert.ok((await jue()).vr.lamina.pintadas > pint0, "tocar repinta la lámina");
      // la palanca derecha: ← → mueve, ↑ gira, ↓ suelta (y ni gira ni teletransporta al mundo)
      const rig0 = (await dbg()).rig, pint1 = (await jue()).vr.lamina.pintadas;
      await pal(-0.9, 0); await pal(0.9, 0); await pal(0, -0.9); await pal(0, 0.9);
      assert.ok((await jue()).vr.lamina.pintadas > pint1, "la palanca juega"); const rig1 = (await dbg()).rig;
      assert.ok(Math.abs(rig1.yaw - rig0.yaw) < 1e-6 && Math.hypot(rig1.x - rig0.x, rig1.z - rig0.z) < 0.05, "con el juego abierto la palanca no gira ni teletransporta al mundo");
      // B pausa y vuelve a seguir; no lleva al mirador
      await pulsa("right", 5); assert.strictEqual((await jue()).vr.pausada, true, "B pausa"); await cap("vr_juego_pausa.png");
      assert.strictEqual((await dbg()).vuelo, false, "B no lleva al mirador mientras hay juego");
      await pulsa("right", 5); assert.strictEqual((await jue()).vr.pausada, false, "B otra vez, sigue");
      // hasta el final: la palanca hacia atrás suelta ramas; sale «Se acabó la partida» con «Otra partida» y «Salir»
      for (let i = 0; i < 60 && !(await jue()).vr.estado.fin; i++) await pal(0, 0.9);
      j = await jue(); assert.ok(j.vr.estado.fin, "la partida acaba soltando ramas"); await fot(6);
      await p.waitForFunction(() => window.__juegos().vr && window.__juegos().vr.clasif, null, { timeout: 15000, polling: 200 }).catch(() => {});
      j = await jue(); assert.ok(j.vr.clasif && j.vr.clasif.mia && j.vr.clasif.mia.puesto === 6 && j.vr.clasif.total === 7, "la lámina de fin tiene la clasificación: " + JSON.stringify(j.vr.clasif)); await fot(4); await cap("vr_juego_fin.png");   // (la captura enseña tu puesto y la tabla corta)
      const puntosFin = j.vr.estado.puntos; await zona(12 + 98 + 100, 930 + 65); await fot(4);   // «Otra partida»
      j = await jue(); assert.ok(j.vr && !j.vr.estado.fin && j.vr.estado.puntos === 0, "«Otra partida» empieza de cero (la anterior hizo " + puntosFin + ")");
      // Salir (arriba a la derecha) cierra la lámina y libera lo que abrió
      await zona(790, 50); await fot(4);
      j = await jue(); assert.strictEqual(j.vr, null, "Salir cierra"); assert.strictEqual((await dbg()).on, true);
      await p.waitForTimeout(300); const [tex2, geo2] = await mem(); assert.strictEqual(tex1 - tex2, 1, "al cerrar se libera su textura (y solo esa): " + [tex1, tex2]); assert.strictEqual(await p.evaluate(() => !!window.__g.scene.getObjectByName("juegoVR")), false, "y su malla sale de la escena (las geometrías de las teselas que llegan cambian la cuenta: " + [geo1, geo2] + ")");
      // abrirlo otra vez y salir de VR con él abierto: se cierra y se libera
      await pulsa("left", 5); await fot(3); const q2 = await aBoton("juego:cae-la-cosecha"); assert.ok(q2, "el panel con la fila otra vez");
      await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(4); assert.ok((await jue()).vr, "abierto de nuevo");
      await p.evaluate(() => window.__mockXR.sesion.end()); await p.waitForFunction(() => !window.__vrDebug().on, null, { timeout: 30000, polling: 200 });
      await p.waitForFunction(() => window.__juegos().vr === null, null, { timeout: 5000, polling: 100 });
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });
});

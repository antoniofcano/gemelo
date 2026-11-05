"use strict";
// EV2-A6 (apps/web/motor/44b_carteles.js): carteles de haza en la linde y tablón en la entrada.
// En Node y sin navegador: la parte pura (los 3 más cercanos con histéresis, qué texto lleva cada cartel según la lista blanca, la maqueta del lienzo, los topes
// angulares de EV2-A0 en VR) y, con un THREE, un lienzo y unas hazas de mentira, el pool (3 + 1 mallas, creadas una vez, liberadas enteras) y que no se repinta
// sin cambio. Lo que NO dice: nada de legibilidad, nitidez ni comodidad en un casco ni en un móvil (no probado en unas Quest ni en un iPhone).
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/44b_carteles.js");
function trozo(ini, fin) { const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas " + ini); return FUENTE.slice(i, f); }
const PURO = trozo("// [puro:inicio]", "// [puro:fin]"), MOTOR = trozo("// [motor:inicio]", "// [motor:fin]");
const P = new Function("\"use strict\";\n" + PURO + "\nreturn CartelesPuro;")();
const LP = new Function("\"use strict\";\n" + (function () { const f = lee("apps/web/motor/02d_laminas.js"); return f.slice(f.indexOf("// [puro:inicio]"), f.indexOf("// [puro:fin]")); })() + "\nreturn LaminasPuro;")();
const medir = (t, px, neg) => String(t).length * px * (neg ? 0.6 : 0.55);

// una ficha pública COMPLETA con todo lo que la api puede mandar (y algo que no debería): ninguna de las cosas prohibidas puede acabar en un cartel
const PROHIBIDO = ["TITULAR-SECRETO", "KILOS-SECRETOS", "PERSONA-SECRETA", "GPS-SECRETO", "NOTA-LIBRE", "TRATAMIENTO-SECRETO", "AVANCE-SECRETO", "OT-SECRETO"];
const ficha = (extra) => Object.assign({
  id: 7, codigo: "H-07", nombre: "La Loma", finca: "hituelo", es_mia: false, alias: "Casa Olmo", superficie_ha: 3.4217,
  olivos: { lidar: { n: 1234, fuente: "LiDAR PNOA 2024", naturaleza: "medido" }, declarado: { n: 1300, fuente: "declaración PAC", naturaleza: "declarado" } },
  tratamientos: [{ fecha: "2026-10-01", componentes: [{ tipo: "fitosanitario", producto: "TRATAMIENTO-SECRETO" }], plazo_seguridad_dias: 7 }],
  fenologia: [{ fecha: "2026-10-01", bbch: 85 }], analiticas: [{ fecha: "2026-09-01", tipo: "suelo" }], avance: { pct: 40, fecha: "2026-10-30", parcelas: 3, parcelas_con_dato: 2, nota: "AVANCE-SECRETO" },
  ndvi_relativo: { valor: 0.12, fuente: "Sentinel-2", fecha: "2026-10-20" }, datos_de: "2026-11-01T10:00:00Z", completo: true, avisos: [],
  titular: "TITULAR-SECRETO", kilos: "KILOS-SECRETOS", persona: "PERSONA-SECRETA", gps: "GPS-SECRETO", texto_libre: "NOTA-LIBRE", ot: "OT-SECRETO" }, extra || {});
const textos = (c) => [c.titulo, c.alias].concat(c.datos.map(d => d.txt + " " + d.de)).join(" | ");

test("escoge: los 3 más cercanos, dentro del radio; el que ya estaba conserva su cartel", () => {
  const cand = [{ id: 1, d: 30 }, { id: 2, d: 10 }, { id: 3, d: 20 }, { id: 4, d: 5 }, { id: 5, d: 90 }];
  const a = P.escoge(cand, [null, null, null]);
  assert.deepStrictEqual(a.slice().sort(), [2, 3, 4], "los tres más cercanos (el 1 a 30 m queda fuera; el 5 está fuera del radio)");
  assert.strictEqual(a.length, P.MAX);
  const b = P.escoge([{ id: 2, d: 10 }, { id: 4, d: 5 }, { id: 9, d: 8 }], [2, null, 4]);
  assert.deepStrictEqual(b, [2, 9, 4]);
  assert.deepStrictEqual(P.escoge([], [1, 2, 3]), [null, null, null]);
  assert.deepStrictEqual(P.escoge([{ id: 1, d: P.RADIO + 1 }], [null, null, null]), [null, null, null], "fuera del radio no se enseña");
});

test("escoge: histéresis, no parpadea si otra haza empata por poco y cede si la supera por más del 20 %", () => {
  const act = [10, 11, 12];
  assert.deepStrictEqual(P.escoge([{ id: 10, d: 5 }, { id: 11, d: 6 }, { id: 12, d: 30 }, { id: 13, d: 28 }], act), [10, 11, 12]);
  assert.deepStrictEqual(P.escoge([{ id: 10, d: 5 }, { id: 11, d: 6 }, { id: 12, d: 30 }, { id: 13, d: 20 }], act), [10, 11, 13]);
  assert.deepStrictEqual(P.escoge([{ id: 10, d: 35 }], [10, null, null]), [10, null, null]);
  assert.deepStrictEqual(P.escoge([{ id: 10, d: 35 }], [null, null, null]), [null, null, null]);
  const x = P.escoge([{ id: 10, d: 5 }, { id: 11, d: 6 }, { id: 12, d: 7 }], [12, 10, 11]);
  assert.deepStrictEqual(x, [12, 10, 11]); assert.deepStrictEqual(P.escoge([{ id: 10, d: 5 }, { id: 11, d: 6 }, { id: 12, d: 7 }], x), x);
  const cien = []; for (let i = 0; i < 100; i++) cien.push({ id: i, d: 1 + i / 10 });
  assert.strictEqual(P.escoge(cien, [null, null, null]).filter(v => v !== null).length, 3);
});

test("la linde más cercana: el punto sobre el lado y la caja que descarta lo lejano", () => {
  const an = [[[0, 0], [100, 0], [100, 80], [0, 80], [0, 0]]];
  const q = P.masCerca(an, 50, -30); assert.ok(Math.abs(q.d - 30) < 1e-9 && q.x === 50 && q.y === 0, JSON.stringify(q));
  const dentro = P.masCerca(an, 90, 40); assert.ok(Math.abs(dentro.d - 10) < 1e-9 && dentro.x === 100, JSON.stringify(dentro));
  const esq = P.masCerca(an, -3, -4); assert.ok(Math.abs(esq.d - 5) < 1e-9 && esq.x === 0 && esq.y === 0);
  const c = P.caja(an); assert.deepStrictEqual(c, [0, 0, 100, 80]);
  assert.ok(P.lejosDeCaja(c, 300, 0, 45) && !P.lejosDeCaja(c, 130, 0, 45));
});

const REC = { hoy: "2026-11-05" }, FUERA = { hoy: "2026-06-15" };
test("contenido: nombre, alias público y lo medido (una línea), con su procedencia; fenología y, solo en recolección, % recogido", () => {
  const c = P.contenido({ nombre: "La Loma", es_mia: false }, ficha(), REC);
  assert.strictEqual(c.titulo, "La Loma");
  assert.strictEqual(c.alias, "Hogar visible como «Casa Olmo»");
  assert.strictEqual(c.datos.length, 2, JSON.stringify(c.datos));
  assert.ok(/^3,42 ha · 1\.?234 olivos$/.test(c.datos[0].txt) && /^medido · linde y LiDAR PNOA 2024$/.test(c.datos[0].de), JSON.stringify(c.datos));
  assert.strictEqual(c.datos[1].txt, "Maduración · 40 % recogido");
  assert.strictEqual(c.datos[1].de, "OlivarTrack · leído 1-nov-2026", "la procedencia que trae la ficha (datos_de)");
  c.datos.forEach(d => assert.ok(d.de.length > 3, "todo dato lleva procedencia"));
  assert.strictEqual(P.contenido({ nombre: "La Loma", es_mia: true }, ficha(), REC).alias, "");
  assert.deepStrictEqual(P.contenido({ nombre: "La Loma", es_mia: true }, null, REC).datos, []);
  const solo = P.contenido({ nombre: "La Loma" }, ficha({ olivos: { lidar: { n: 5, fuente: "x", naturaleza: "declarado" }, declarado: { n: 9, fuente: "y", naturaleza: "declarado" } } }), REC);
  assert.ok(!/olivos/.test(solo.datos[0].txt) && /^Superficie/.test(solo.datos[0].txt), "un conteo que no es «medido» no entra");
  assert.strictEqual(P.contenido({ nombre: "La Loma" }, ficha({ alias: null })).alias, "");
  assert.strictEqual(P.contenido({}, null).titulo, "Haza");
});

test("fenología y % recogido: la fenología si la ficha la trae; el % solo en recolección y solo con valor", () => {
  const sin = P.contenido({ nombre: "A" }, ficha({ fenologia: [] }), FUERA);
  assert.strictEqual(sin.datos.length, 1, "sin fenología y fuera de recolección, solo lo medido");
  const flor = P.contenido({ nombre: "A" }, ficha({ fenologia: [{ fecha: "2026-05-01", bbch: 5 }, { fecha: "2026-05-20", bbch: 65 }] }), FUERA);
  assert.strictEqual(flor.datos[1].txt, "En flor", "la fenología más reciente; fuera de recolección no hay %");
  assert.ok(!/recogido|%/.test(textos(flor)));
  [[10, "Brotación"], [55, "Botón floral"], [75, "Cuajado"], [82, "Envero"], [89, "Maduración"], [0, "Reposo"]].forEach(([b, t]) => assert.strictEqual(P.fenologia(b), t));
  assert.strictEqual(P.contenido({ nombre: "A" }, ficha({ avance: { pct: 40 } }), REC).datos[1].txt, "Maduración · 40 % recogido");
  assert.strictEqual(P.contenido({ nombre: "A" }, ficha({ avance: { pct: 0 } }), REC).datos[1].txt, "Maduración · 0 % recogido", "un 0 con valor es un valor");
  assert.strictEqual(P.contenido({ nombre: "A" }, ficha({ avance: { pct: null } }), REC).datos[1].txt, "Maduración", "sin valor no se enseña");
  assert.strictEqual(P.contenido({ nombre: "A" }, ficha({ fenologia: [], avance: { pct: 60 } }), REC).datos[1].txt, "60 % recogido");
  assert.strictEqual(P.contenido({ nombre: "A" }, ficha({ fenologia: [], avance: { pct: null } }), REC).datos.length, 1);
  assert.strictEqual(P.contenido({ nombre: "A" }, ficha(), null).datos[1].txt, "Maduración", "sin contexto no hay recolección");
  assert.ok(P.recoleccion("2026-10-01") && P.recoleccion("2027-01-31") && !P.recoleccion("2026-09-30") && !P.recoleccion("2026-02-01") && !P.recoleccion(undefined));
  assert.ok(/^OlivarTrack · leído 5-dic-2026$/.test(P.contenido({ nombre: "A" }, ficha({ datos_de: "2026-12-05T08:00:00Z" }), REC).datos[1].de));
});

test("guardián: nada fuera de la lista blanca llega a un cartel, venga lo que venga de la api", () => {
  [ficha(), ficha({ es_mia: true })].forEach(f => {
    [true, false].forEach(mia => {
      [REC, FUERA].forEach(ctx => {
      const c = P.contenido({ nombre: "La Loma", es_mia: mia }, f, ctx), todo = textos(c) + P.firma(c) + JSON.stringify(P.maqueta(c, medir).bloques);
      PROHIBIDO.forEach(p => assert.ok(todo.indexOf(p) < 0, "no debe salir " + p));
      ["tratamiento", "fenolog", "analítica", "Recogido:", "NDVI", "kilos", "titular", "declar", "BBCH", "2026-10-01", "1-oct", "plazo"].forEach(p => assert.ok(!new RegExp(p, "i").test(todo), "no debe salir «" + p + "»"));
      });
    });
  });
  const leidas = new Set(), prox = new Proxy(ficha(), { get(o, k) { leidas.add(String(k)); return o[k]; } });
  P.contenido({ nombre: "N", es_mia: false }, prox, REC);
  assert.deepStrictEqual([...leidas].sort(), ["alias", "avance", "datos_de", "fenologia", "olivos", "superficie_ha"].sort(), "solo estos campos de la ficha");
  const l2 = new Set(); P.contenido({ nombre: "N" }, new Proxy(ficha(), { get(o, k) { l2.add(String(k)); return o[k]; } }), FUERA);
  assert.ok(!l2.has("avance"), "fuera de recolección ni se mira el avance");
  const lav = new Set(); P.contenido({ nombre: "N" }, ficha({ avance: new Proxy({ pct: 3, nota: "AVANCE-SECRETO", parcelas: 4 }, { get(o, k) { lav.add(String(k)); return o[k]; } }) }), REC);
  assert.deepStrictEqual([...lav].sort(), ["pct"], "del avance, solo el porcentaje");
  const ol = new Set(), prox2 = new Proxy(ficha().olivos.lidar, { get(o, k) { ol.add(String(k)); return o[k]; } });
  P.contenido({ nombre: "N" }, { olivos: { lidar: prox2 }, superficie_ha: 1 });
  assert.deepStrictEqual([...ol].sort(), ["fuente", "n", "naturaleza"]);
  assert.ok(!/<script|innerHTML/.test(MOTOR + PURO.replace(/\/\/.*$/gm, "")), "ni HTML ni innerHTML en el motor ni en lo puro");
  assert.ok(!/fetch\(/.test(FUENTE), "el cartel no habla con la red: usa Hazas.datos");
  assert.strictEqual(P.contenido({ nombre: "A\u0000B\n<b>C" }, null).titulo, "A B <b>C");
});

test("el tablón: «Club La Linde» y la finca, hazas y olivos medidos, la época con su procedencia; «Hoy en el olivar» solo con datos", () => {
  assert.strictEqual(P.nombreFinca(undefined, "hituelo"), "Hituelo"); assert.strictEqual(P.nombreFinca("Mi finca", "hituelo"), "Mi finca"); assert.strictEqual(P.nombreFinca(null, null), "La finca");
  assert.strictEqual(P.nombreFinca(null, "cerro_velasco"), "Cerro velasco");
  const ctx = { hazas: 12, olivos: 4321, hoy: "2026-11-05", bbch: 82, origen: "calendario típico, sin observaciones que lo ajusten" };
  const t = P.tablon("Hituelo", ctx), m = P.maqueta(t, medir), todo = textos(t), pintado = m.bloques.map(b => b.texto).join(" | ");
  assert.strictEqual(t.titulo, "Club La Linde"); assert.strictEqual(t.alias, "Hituelo");
  assert.ok(/^12 hazas · 4\.?321 olivos$/.test(t.datos[0].txt), t.datos[0].txt); assert.ok(/^medido/.test(t.datos[0].de));
  assert.strictEqual(t.datos[1].txt, "Otoño: empieza el envero"); assert.strictEqual(t.datos[1].de, "ilustrativo · calendario típico");
  assert.strictEqual(P.tablon("H", Object.assign({}, ctx, { origen: "calendario típico ajustado con tu fenología (BBCH 70)" })).datos[1].de, "deducido · calendario ajustado");
  assert.ok(Array.isArray(t.hoy) && t.hoy.length === 0, "sin datos del campo, «Hoy en el olivar» queda vacía y no se pinta");
  assert.ok(!/Semana|OlivarTrack/i.test(todo + pintado + P.firma(t)), "sin datos, ni rastro de la línea");
  assert.ok(!/deslinde/.test(pintado), "sin el pie de las lindes");
  assert.deepStrictEqual(P.tablon("H", { hazas: 3, olivos: 0, hoy: "2026-01-10", bbch: 89 }).datos.map(d => d.txt), ["3 hazas", "Invierno: maduración del fruto"], "sin dato fiable de olivos, no se pone");
  assert.deepStrictEqual(P.tablon("H", {}).datos, [], "sin nada fiable, solo el título");
  assert.strictEqual(P.epoca("2026-04-20", 62, "").txt, "Primavera: en plena floración");
  assert.strictEqual(P.epoca("2026-07-20", 77, "").txt, "Verano: cuaja y crece el fruto");
  assert.strictEqual(P.epoca("x", 1, ""), null);
  assert.deepStrictEqual(P.entrada([{ centro: [100, 200] }], [0, 0, 1, 1]), [105, 198]);
  assert.deepStrictEqual(P.entrada([], [0, 100, 200, 0]), [100, 50]);
});

// EV-3c: «Hoy en el olivar»
const AHORA = Date.parse("2026-11-05T12:00:00Z"), CAMPO = { txt: "Semana: 9 tareas", de: "OlivarTrack", cuando: "2026-11-05T10:00:00.000Z" };
const TCTX = { hazas: 12, olivos: 4321, hoy: "2026-11-05", bbch: 82, origen: "", ahora: AHORA };
test("hoy en el olivar: con datos pasa por delante de la época y lleva su procedencia y frescura; sin datos o con datos malos, no se pinta", () => {
  const t = P.tablon("Hituelo", Object.assign({ campo: CAMPO }, TCTX));
  assert.deepStrictEqual(t.hoy, [{ txt: "Semana: 9 tareas", de: "OlivarTrack · leído hace 2 h" }]);
  assert.strictEqual(t.datos.length, 2, "hazas y olivos, y hoy; la época cede (solo caben dos pares)");
  assert.ok(/olivos$/.test(t.datos[0].txt) && t.datos[1].txt === CAMPO.txt);
  const m = P.maqueta(t, medir), pintado = m.bloques.map(b => b.texto);
  assert.ok(pintado.includes("OlivarTrack · leído hace 2 h") && pintado.includes("Semana: 9 tareas"));
  assert.ok(!pintado.some(x => /Otoño/.test(x)), "la época ilustrativa cede");
  // sin hazas: hoy y época caben juntas
  assert.deepStrictEqual(P.tablon("H", { hoy: "2026-11-05", bbch: 82, campo: CAMPO, ahora: AHORA }).datos.map(d => d.txt), ["Semana: 9 tareas", "Otoño: empieza el envero"]);
  // sin datos: como antes (nada de «hoy»)
  const base = P.tablon("H", TCTX).datos.map(d => d.txt);
  for (const mal of [undefined, null, {}, { txt: "", de: "OlivarTrack" }, { txt: "x", de: "" }, "texto", 7]) {
    const q = P.tablon("H", Object.assign({}, TCTX, { campo: mal })); assert.deepStrictEqual(q.hoy, [], JSON.stringify(mal));
    assert.deepStrictEqual(q.datos.map(d => d.txt), base);
  }
  assert.strictEqual(P.lineaHoy(Object.assign({}, CAMPO, { cuando: null }), AHORA).de, "OlivarTrack · sin fecha");
  assert.strictEqual(P.lineaHoy(Object.assign({}, CAMPO, { cuando: "2026-11-05T11:30:00Z" }), AHORA).de, "OlivarTrack · leído hace 30 min");
  assert.strictEqual(P.lineaHoy(Object.assign({}, CAMPO, { cuando: "2026-11-01T12:00:00Z" }), AHORA).de, "OlivarTrack · leído hace 4 días");
  // textos de fuera: sin controles y recortados; nunca HTML (el lienzo los pinta como texto)
  const ev = P.lineaHoy({ txt: "A\u0000B\n<b>C</b>" + "x".repeat(80), de: "<i>Fuente</i>muylarga".repeat(3), cuando: null }, AHORA);
  assert.ok(ev.txt.length <= 40 && !/[\u0000-\u001f]/.test(ev.txt) && ev.de.length <= 20 + " · sin fecha".length);
  // la firma cambia con el dato (repinta) y no sin él
  const f0 = P.firma(P.tablon("H", TCTX)), f1 = P.firma(P.tablon("H", Object.assign({ campo: CAMPO }, TCTX))), f2 = P.firma(P.tablon("H", Object.assign({ campo: CAMPO }, TCTX, { ahora: AHORA + 60000 })));
  assert.notStrictEqual(f0, f1); assert.strictEqual(f1, f2, "el mismo dato un minuto después: misma firma, sin repintar");
  assert.notStrictEqual(f1, P.firma(P.tablon("H", Object.assign({ campo: CAMPO }, TCTX, { ahora: AHORA + 3 * 3600000 }))), "pasa de «hace 2 h» a «hace 5 h»: cambia");
});

test("hoy en el olivar: la maqueta con la línea cabe en 512 × 320 y pasa los topes angulares de VR a todas las distancias", () => {
  const largo = { txt: "Semana: " + "w".repeat(60), de: "Vigía y OlivarTrack juntos y revueltos", cuando: "2026-11-05T10:00:00Z" };
  [CAMPO, largo].forEach(campo => [TCTX, { hoy: "2026-11-05", bbch: 82, ahora: AHORA }, {}].forEach(c => {
    const t = P.tablon("Finca con un nombre bastante largo del todo", Object.assign({ campo }, c)), m = P.maqueta(t, medir);
    assert.ok(m.usado <= P.H, "alto " + m.usado);
    m.bloques.forEach(b => assert.ok(b.y + P.LINEA[b.clase] <= P.H + 1e-9 && (b.x + medir(b.texto, b.px, b.negrita) <= P.W + 1e-9 || b.texto.split(" ").length === 1), "cabe: " + b.texto));
    assert.strictEqual(m.bloques.filter(b => b.clase === "dato").length, m.bloques.filter(b => b.clase === "fuente").length, "cada dato con su procedencia");
    [P.RADIO * (1 + P.HIST), P.LEJOS_TABLON, 3, 10, 25].forEach(dist => {
      const r = LP.legible({ mmPorPx: P.ANCHO_M * 1000 / P.W * P.escala(dist), dist: Math.max(dist, 0.5), lineas: m.interlineados });
      assert.deepStrictEqual(r.fallos, [], "a " + dist + " m: " + r.fallos.join("; "));
    });
  }));
  assert.ok(P.maqueta(P.tablon("H", Object.assign({ campo: CAMPO }, TCTX)), medir).bloques.some(b => b.texto === "OlivarTrack · leído hace 2 h"));
});

test("maqueta: cabe en 512 × 320, cada dato va con su procedencia y todo interlineado pasa los topes de EV2-A0 hasta la distancia máxima", () => {
  assert.ok(P.W <= 512 && P.H <= 320, "lienzo ≤ 512 × 320");
  const tctx = { hazas: 12, olivos: 4321, hoy: "2026-11-05", bbch: 82, origen: "" };
  const casos = [P.contenido({ nombre: "La Loma", es_mia: false }, ficha(), REC), P.contenido({ nombre: "Un nombre larguísimo de una haza que no cabe en una línea y que sigue y sigue y sigue", es_mia: true }, ficha(), REC),
    P.contenido({ nombre: "Sola" }, null), P.tablon("Hituelo", tctx), P.tablon("Hituelo"), P.contenido({ nombre: "Tres líneas de nombre " + "x".repeat(200) }, ficha(), REC), P.contenido({ nombre: "La Loma", es_mia: true }, ficha(), FUERA)];
  casos.forEach(c => {
    const m = P.maqueta(c, medir);
    assert.ok(m.usado <= P.H, "alto usado " + m.usado);
    m.bloques.forEach(b => { assert.ok(b.y + P.LINEA[b.clase] <= P.H + 1e-9, "dentro del lienzo: " + b.texto); assert.ok(b.x + medir(b.texto, b.px, b.negrita) <= P.W + 1e-9 || b.texto.split(" ").length === 1, "cabe a lo ancho: " + b.texto); });
    const d = m.bloques.filter(b => b.clase === "dato").length, f = m.bloques.filter(b => b.clase === "fuente" && !/^linde de gestión/.test(b.texto)).length;
    assert.strictEqual(f, d, "tantas procedencias como datos");
    const mmPx = P.ANCHO_M * 1000 / P.W;
    [P.RADIO * (1 + P.HIST), P.LEJOS_TABLON, 3, 10, 25].forEach(dist => {
      const e = P.escala(dist), r = LP.legible({ mmPorPx: mmPx * e, dist: Math.max(dist, 0.5), lineas: m.interlineados });
      assert.deepStrictEqual(r.fallos, [], "a " + dist + " m: " + r.fallos.join("; "));
    });
  });
  const nDatos = (c) => P.maqueta(c, medir).bloques.filter(b => b.clase === "dato").length;
  assert.strictEqual(nDatos(P.contenido({ nombre: "La Loma", es_mia: false }, ficha(), REC)), 2, "con alias y recolección caben los dos pares");
  assert.strictEqual(nDatos(P.contenido({ nombre: "La Loma", es_mia: true }, ficha(), REC)), 2);
  assert.strictEqual(nDatos(P.tablon("Hituelo", tctx)), 2, "el tablón lleva sus dos pares");
  assert.ok(P.maqueta(P.contenido({ nombre: "Sola" }, null), medir).bloques.every(b => b.clase === "titulo" || b.clase === "fuente"));
});

test("escala y colocación: crece con la distancia, entre 1 y 5,5; el cartel queda a 0,9 m del suelo y se vuelve hacia quien mira", () => {
  assert.strictEqual(P.escala(2), 1); assert.ok(Math.abs(P.escala(20) - 2.8) < 1e-9); assert.strictEqual(P.escala(500), 5.5);
  const c = P.coloca(10, 20, 100, 2); assert.ok(Math.abs(c.y - (100 + 0.9 + P.ALTO_M)) < 1e-9 && c.x === 10 && c.z === -20);
  assert.ok(Math.abs(P.mirando(0, 10, 0, 0)) < 1e-9, "con quien mira al sur (+z) el cartel no gira"); assert.ok(Math.abs(P.mirando(10, 0, 0, 0) - Math.PI / 2) < 1e-9);
});

test("presupuesto: 3 carteles + 1 tablón = 4 llamadas, 8 triángulos, y el manifiesto lo declara así", () => {
  assert.strictEqual(P.LLAMADAS, 4); assert.strictEqual(P.MAX, 3);
  assert.ok(/presupuesto: \{ llamadas: 4, triangulos: 8, texturasMB: 2\.5 \}/.test(FUENTE));
  assert.ok(/bandera: \{ defecto: true, url: "carteles" \}/.test(FUENTE), "?carteles=0 lo apaga");
  assert.ok(4 * 512 * 320 * 4 / 1048576 <= 2.5);
});

// ---- el motor, con un THREE, un lienzo y unas hazas de mentira
function mundo(opts) {
  const log = { geos: 0, mats: 0, texs: 0, mallas: [], disposed: { geo: 0, mat: 0, tex: 0 }, canvases: 0, pedidas: [] };
  class Obj { constructor() { this.visible = true; this.children = []; this.position = { set() {} }; this.scale = { setScalar() {} }; this.rotation = { y: 0 }; } add(o) { this.children.push(o); } remove(o) { this.children = this.children.filter(c => c !== o); } }
  const cam = { x: opts.x || 0, y: opts.y || 0 };
  const THREE = {
    Group: class extends Obj {}, Mesh: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; log.mallas.push(this); } },
    PlaneGeometry: class { constructor() { log.geos++; } dispose() { log.disposed.geo++; } },
    MeshBasicMaterial: class { constructor(o) { log.mats++; this.map = o.map; } dispose() { log.disposed.mat++; } },
    CanvasTexture: class { constructor(c) { log.texs++; this.image = c; } dispose() { log.disposed.tex++; } },
    Vector3: class { constructor() { this.x = 0; this.y = 0; this.z = 0; } copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } setFromMatrixPosition() { this.x = cam.x; this.y = 0; this.z = -cam.y; return this; } }
  };
  const document = { createElement() { log.canvases++; return { width: 0, height: 0, getContext() { return { clearRect() {}, fillRect() {}, fillText() {}, measureText(t) { return { width: t.length * 10 }; }, font: "", fillStyle: "" }; } }; } };
  const hazas = opts.hazas;
  const Hazas = {
    lindes: () => hazas.map(h => ({ id: h.id, anillos: h.anillos })),
    datos: (id) => { log.pedidas.push(id); const h = hazas.find(q => q.id === id); return h ? { id, codigo: "c", nombre: h.nombre, es_mia: false, ficha: h.ficha || null } : null; }
  };
  const scene = new THREE.Group(), escuchas = {};
  const n = { on: (ev, fn) => { escuchas[ev] = fn; return () => {}; }, limpia: () => {} };
  const camera = { updateMatrixWorld() {}, matrixWorld: {} }, win = {};
  const f = new Function("THREE", "document", "window", "scene", "camera", "VRX", "texColor", "gLinde", "suelo", "exag", "Hazas", "D", "Componentes", "cIn", "EST", "bbchEn", "hoyMadrid",
    "var CartelesPuro = null;\n" + "return function (P) { CartelesPuro = P; " + MOTOR + "\nreturn CartelesMotor; };");
  const D = { parcelas: [{ centro: [0, 0] }], ext: [-500, 500, 500, -500], finca_id: "hituelo" };
  const motor = f(THREE, document, win, scene, camera, { on: false }, t => t, { visible: true }, () => 2, 1, Hazas, D, {}, new Array(4321), { origen: "" }, () => 82, () => "2026-11-05")(P)(n);
  return { motor, log, scene, escuchas, win, mueve(x, y) { cam.x = x; cam.y = y; } };
}
const cuadro = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const haza = (id, x0, y0, x1, y1, f) => ({ id, nombre: "Haza " + id, anillos: [cuadro(x0, y0, x1, y1)], ficha: f || null });

test("motor: sin hazas no crea nada; con hazas, un pool de 3 + 1 mallas creadas una vez, y se libera entero", () => {
  const w0 = mundo({ hazas: [] });
  assert.strictEqual(w0.log.mallas.length, 0); assert.strictEqual(w0.log.geos, 0); w0.motor.tarde(); w0.motor.mundo(); w0.motor.libera();
  const hs = [haza(1, 10, 0, 20, 10), haza(2, -20, 0, -10, 10), haza(3, 0, 20, 10, 30), haza(4, 0, 40, 10, 50, ficha()), haza(5, 300, 300, 310, 310)];
  const w = mundo({ hazas: hs });
  assert.strictEqual(w.log.mallas.length, 4, "3 carteles + el tablón"); assert.strictEqual(w.log.geos, 1); assert.strictEqual(w.log.mats, 4); assert.strictEqual(w.log.texs, 4); assert.strictEqual(w.log.canvases, 4);
  for (let i = 0; i < 20; i++) { w.motor.tarde(); w.motor.mundo(); }
  assert.strictEqual(w.log.mallas.length, 4, "no se crea nada más al elegir ni al repintar"); assert.strictEqual(w.log.mats, 4); assert.strictEqual(w.log.texs, 4);
  const est = w.motor.estado();
  assert.strictEqual(est.carteles, 3, "como mucho 3 a la vista"); assert.strictEqual(w.log.mallas.filter(m => m.visible).length, 3 + 1, "3 carteles y el tablón (la finca está cerca)");
  assert.strictEqual(est.llamadas, 4);
  assert.deepStrictEqual(w.win.__carteles().ids.slice().sort(), [1, 2, 3], "la 4 está a 40 m, pero hay tres más cerca; la 5, fuera");
  w.motor.libera();
  assert.deepStrictEqual(w.log.disposed, { geo: 1, mat: 4, tex: 4 }, "se libera todo");
  assert.strictEqual(w.scene.children.length, 0, "y se quita de la escena"); w.motor.libera();
});

test("motor: repinta solo cuando cambia la haza o su ficha; al llegar la ficha, un repintado", () => {
  const hs = [haza(1, 10, 0, 20, 10)];
  const w = mundo({ hazas: hs });
  w.motor.tarde(); const p0 = w.motor.estado().pintadas;
  assert.strictEqual(p0, 2, "el tablón y la haza 1");
  for (let i = 0; i < 10; i++) { w.motor.tarde(); w.motor.mundo(); }
  assert.strictEqual(w.motor.estado().pintadas, p0, "sin cambios, no repinta");
  hs[0].ficha = ficha(); w.motor.tarde();
  assert.strictEqual(w.motor.estado().pintadas, p0 + 1, "al llegar la ficha, una vez");
  w.motor.tarde(); assert.strictEqual(w.motor.estado().pintadas, p0 + 1);
  hs.push(haza(2, 200, 0, 210, 10)); w.escuchas["hazas:cambia"](); w.mueve(205, 5); w.motor.tarde();
  assert.strictEqual(w.log.mats, 4); assert.deepStrictEqual(w.win.__carteles().ids.filter(v => v !== null), [2]);
  hs.length = 0; w.escuchas["hazas:cambia"](); assert.deepStrictEqual(w.log.disposed, { geo: 1, mat: 4, tex: 4 }); w.motor.tarde(); w.motor.mundo();
  w.motor.libera();
});

test("motor: «mundo:hoy» llena la línea del tablón, repinta solo si cambia, y null o basura la quitan", () => {
  const w = mundo({ hazas: [haza(1, 10, 0, 20, 10)] });
  assert.strictEqual(typeof w.escuchas["mundo:hoy"], "function", "escucha mundo:hoy");
  w.motor.tarde(); const p0 = w.motor.estado().pintadas;
  w.motor.tarde(); assert.strictEqual(w.motor.estado().pintadas, p0, "sin cambio, nada");
  w.escuchas["mundo:hoy"]({ linea: { txt: "Semana: poda 8", de: "OlivarTrack", cuando: new Date().toISOString() } }); w.motor.tarde();
  assert.strictEqual(w.motor.estado().pintadas, p0 + 1, "llega la línea: el tablón se repinta una vez");
  w.motor.tarde(); w.motor.tarde(); assert.strictEqual(w.motor.estado().pintadas, p0 + 1, "misma firma: sin repintar");
  w.escuchas["mundo:hoy"]({ linea: null }); w.motor.tarde(); assert.strictEqual(w.motor.estado().pintadas, p0 + 2, "null: se quita");
  w.escuchas["mundo:hoy"]({ linea: "basura" }); w.escuchas["mundo:hoy"](undefined); w.motor.tarde(); assert.strictEqual(w.motor.estado().pintadas, p0 + 2, "basura = sin línea, ya estaba quitada");
  assert.strictEqual(w.log.mallas.length, 4, "no se crea nada nuevo"); w.motor.libera();
});
test("manifiesto: el tablón escucha «mundo:hoy» y no pide nada a la red", () => {
  assert.ok(/escucha: \["hazas:cambia", "mundo:hoy"\]/.test(FUENTE)); assert.ok(!/fetch\(|XMLHttpRequest/.test(FUENTE.replace(/\/\/.*$/gm, "")));
});

test("manifiesto: componente «carteles-haza», con bandera y material básico (multiview)", () => {
  assert.ok(/id: "carteles-haza"/.test(FUENTE)); assert.ok(/fases: \{ mundo: 0, tarde: 0\.5 \}/.test(FUENTE));
  assert.ok(/libera: function \(api\)/.test(FUENTE));
  assert.ok(/MeshBasicMaterial/.test(MOTOR) && !/ShaderMaterial|onBeforeCompile|uniform |modelViewMatrix|projectionMatrix/.test(FUENTE.replace(/\/\/.*$/gm, "")), "multiview: material básico, sin GLSL propio");
});

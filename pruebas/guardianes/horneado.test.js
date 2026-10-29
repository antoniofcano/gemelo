"use strict";
// Receta horneada v1 y manifiestos del hornero (ADR-0018, O7b; contratos/olivo-horneado.md): sin red, sin Chrome y sin datos.
//   - los esquemas (manifiesto y calendario de épocas) compilan con ajv estricto, el ejemplo los cumple y rechazan lo que deben;
//   - el calendario cubre los 366 días con una sola época cada uno;
//   - ida y vuelta cuantizar → decuantizar de una receta SINTÉTICA (pruebas/olivo/horneado/sintetica.mjs) en los cuatro niveles: misma estructura,
//     enteros idénticos y pérdidas dentro de los topes de O6 (≤ 0,11 mm, ≤ 0,39°...); huella estable y fijada en manifiesto-ejemplo.json;
//   - brotli 9 va y viene sin cambiar la huella; un byte cambiado, otra versión de formato o un objeto cortado se rechazan;
//   - manifiesto binario de tesela: 68 B por olivo;
//   - con `cd apps/web/olivo && npm i`: lo mismo con recetas REALES de olivo-2 (E0, E1, E2, E2-VR), con el recuento de triángulos igual (se salta con aviso si no).
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const Ajv2020 = require("ajv/dist/2020").default;
const { RAIZ, fs, path } = require("./_util");

const json = (...p) => JSON.parse(fs.readFileSync(path.join(RAIZ, ...p), "utf8"));
const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
const V_MANIFIESTO = ajv.compile(json("contratos", "hornero-manifiesto.schema.json")), V_CALENDARIO = ajv.compile(json("contratos", "epocas-calendario.schema.json"));
const valida = (v, dato) => v(dato) ? [] : v.errors.map(e => (e.instancePath || "/") + ": " + e.message + " " + JSON.stringify(e.params));
const imp = (...p) => import(pathToFileURL(path.join(RAIZ, ...p)).href);
const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const SALTO_REAL = ["three-gen"].every(d => fs.existsSync(path.join(OLIVO, "node_modules", d, "package.json"))) ? null : "apps/web/olivo sin instalar (cd apps/web/olivo && npm i): las recetas reales NO se han horneado";

let H, N, E, S, Gen;   // horneado.js, horneado_node.js, epocas.js, sintetica.mjs, genera.mjs (no se importa: lo corre)
test.before(async () => {
  H = await imp("apps", "web", "olivo", "horneado.js"); N = await imp("apps", "web", "olivo", "horneado_node.js"); E = await imp("apps", "web", "olivo", "epocas.js");
  S = await imp("pruebas", "olivo", "horneado", "sintetica.mjs");
});
const EJEMPLO = () => json("pruebas", "olivo", "horneado", "manifiesto-ejemplo.json"), CAL = () => json("contratos", "epocas-calendario.json");
const clave = (e, nivel) => "olivo|" + S.GEN_VERSION_SINTETICA + "|c" + S.CACHE_VERSION_SINTETICA + "|" + nivel + "|" + e.tipo + "|" + e.epoca + "|" + e.semilla + "|{}";   // = genera.mjs
const OPC = (r, nivel) => ({ nivel, clave: clave(r.entrada, nivel), gen_version: S.GEN_VERSION_SINTETICA, cache_version: S.CACHE_VERSION_SINTETICA });

// ---------- calendario de épocas
test("el calendario de épocas cumple su esquema y cubre los 366 días con una sola época (decisión 64)", () => {
  const cal = CAL();
  assert.deepStrictEqual(valida(V_CALENDARIO, cal), []);
  assert.match(cal.estado, /de partida/, "mientras Antonio no lo dé por bueno, debe decir que es de partida");
  assert.deepStrictEqual(E.validaTabla(cal.comun), []);
  for (const [f, t] of Object.entries(cal.fincas)) assert.deepStrictEqual(E.validaTabla(t), [], "tabla de la finca " + f);
});
test("el calendario: la época de una fecha, la siguiente en el ciclo y una tabla rota se detecta", () => {
  const t = CAL().comun;
  assert.strictEqual(E.epocaDeFecha(t, "2026-10-29"), "envero");
  assert.strictEqual(E.epocaDeFecha(t, "2026-12-31"), "madura");
  assert.strictEqual(E.epocaDeFecha(t, "2027-01-15"), "madura", "la ventana que cruza el fin de año");
  assert.strictEqual(E.epocaDeFecha(t, "2027-01-16"), "reposo");
  assert.strictEqual(E.epocaDeFecha(t, "2028-02-29"), "reposo");
  assert.strictEqual(E.siguienteEpoca("madura"), "reposo");
  assert.strictEqual(E.siguienteEpoca("envero"), "madura");
  const hueco = JSON.parse(JSON.stringify(t)); hueco.flor.hasta = "06-01";
  assert.ok(E.validaTabla(hueco).some(l => /sin época/.test(l)), "un hueco debe detectarse");
  const solape = JSON.parse(JSON.stringify(t)); solape.flor.hasta = "06-20";
  assert.ok(E.validaTabla(solape).some(l => /varias/.test(l)), "un solape debe detectarse");
  const feb = JSON.parse(JSON.stringify(t)); feb.reposo.hasta = "02-28"; feb.boton.desde = "03-01";
  assert.ok(E.validaTabla(feb).length, "un límite el 28 de febrero deja sin época el 29");
  assert.notDeepStrictEqual(valida(V_CALENDARIO, Object.assign({}, CAL(), { comun: Object.assign({}, t, { flor: { desde: "13-01", hasta: "06-09" } }) })), [], "mes 13");
});

// ---------- manifiesto por finca
test("el manifiesto de ejemplo cumple el esquema y es coherente (época actual horneada, filas únicas, ventanas del calendario)", () => {
  const m = EJEMPLO();
  assert.deepStrictEqual(valida(V_MANIFIESTO, m), []);
  assert.ok(m.epocas.some(e => e.epoca === m.actual), "la época actual debe estar entre las horneadas");
  const cal = CAL().comun;
  for (const e of m.epocas) assert.deepStrictEqual({ desde: e.desde, hasta: e.hasta }, cal[e.epoca], "la ventana de " + e.epoca + " debe ser la del calendario");
  const claves = m.variantes.map(v => [v.tipo, v.semilla, v.nivel, v.epoca].join("|"));
  assert.strictEqual(new Set(claves).size, claves.length, "fila repetida");
  assert.strictEqual(new Set(m.variantes.map(v => v.huella)).size, m.variantes.length, "dos variantes con la misma huella");
  for (const v of m.variantes) assert.ok(m.epocas.some(e => e.epoca === v.epoca), "variante de una época que el manifiesto no lista: " + v.epoca);
  assert.strictEqual(m.propios.activos, false, "propios apagados por defecto");
});
test("el esquema del manifiesto rechaza lo que debe", () => {
  const roto = f => { const m = EJEMPLO(); f(m); return valida(V_MANIFIESTO, m); };
  const casos = {
    "sin gen_version": m => { delete m.gen_version; },
    "formato 2": m => { m.formato = 2; },
    "huella corta": m => { m.variantes[0].huella = m.variantes[0].huella.slice(1); },
    "huella en mayúsculas": m => { m.variantes[0].huella = m.variantes[0].huella.toUpperCase(); },
    "semilla negativa": m => { m.variantes[0].semilla = -1; },
    "semilla de 2^32": m => { m.variantes[0].semilla = 4294967296; },
    "nivel desconocido": m => { m.variantes[0].nivel = "E3"; },
    "tipo desconocido": m => { m.variantes[0].tipo = "olivos:centenario-3p"; },
    "época desconocida": m => { m.variantes[0].epoca = "invierno"; },
    "variante sin bytes_br": m => { delete m.variantes[0].bytes_br; },
    "campo de más en una variante": m => { m.variantes[0].url = "x"; },
    "propios activos sin manifiesto de tesela": m => { m.propios = { activos: true }; },
    "propios activos con ruta sin {kx}": m => { m.propios = { activos: true, combinaciones: [{ nivel: "E0", epoca: "envero" }], manifiesto_tesela: "t/x.olivos" }; },
    "propios con E2": m => { m.propios = { activos: false, combinaciones: [{ nivel: "E2", epoca: "envero" }] }; },
    "fecha con mes 13": m => { m.epocas[0].desde = "13-01"; },
    "horneado_en sin hora": m => { m.horneado_en = "2026-10-29"; },
    "sin épocas": m => { m.epocas = []; },
    "finca con mayúsculas": m => { m.finca = "Hituelo"; },
  };
  for (const [n, f] of Object.entries(casos)) assert.notDeepStrictEqual(roto(f), [], "el esquema debería rechazar: " + n);
  const ok = EJEMPLO(); ok.propios = { activos: true, combinaciones: [{ nivel: "E0", epoca: "envero" }, { nivel: "E1", epoca: "envero" }, { nivel: "E0", epoca: "madura" }, { nivel: "E1", epoca: "madura" }], manifiesto_tesela: "t/{kx}_{ky}.olivos" };
  assert.deepStrictEqual(valida(V_MANIFIESTO, ok), [], "propios activos con sus combinaciones y su ruta");
});

// ---------- ida y vuelta de la receta sintética
const radioUnidad = {};
for (const nivel of ["E0", "E1", "E2", "E2VR"]) {
  test("[sintética " + nivel + "] ida y vuelta: misma estructura, enteros idénticos, pérdidas dentro de los topes, huella estable", async () => {
    const r = S.recetaSintetica({ semilla: 11, nivel, epoca: "envero", grande: nivel === "E0" });
    const bytes = H.codifica(r, OPC(r, nivel)), bytes2 = H.codifica(r, OPC(r, nivel));
    assert.deepStrictEqual(bytes, bytes2, "mismos bytes para la misma receta");
    assert.strictEqual(await H.huellaBytes(bytes), await H.huellaBytes(bytes2));
    assert.match(await H.huellaBytes(bytes), /^[0-9a-f]{32}$/);
    const cab = H.leeCabecera(bytes);
    assert.deepStrictEqual(cab, { formato: 1, gen_version: S.GEN_VERSION_SINTETICA, cache_version: S.CACHE_VERSION_SINTETICA, nivel, epoca: "envero", clave: clave(r.entrada, nivel) });
    const d = H.decodifica(bytes);
    assert.deepStrictEqual(d.cabecera, cab);
    assert.deepStrictEqual(H.igualEstructura(r, d.receta), []);
    // tipos como los da el generador
    for (const p of d.receta.piezas) {
      if (p.indice) assert.ok(p.indice instanceof Uint32Array);
      if (p.nodo) assert.ok(p.nodo instanceof Int32Array);
      if (p.matrices) assert.ok(p.matrices instanceof Float32Array);
      if (p.atrib) assert.ok(p.atrib.position instanceof Float32Array);
    }
    assert.ok(d.receta.padre instanceof Int32Array);
    assert.deepStrictEqual(Array.from(d.receta.padre), Array.from(r.padre));
    assert.ok(r.piezas.some(p => p.matrices && p.colores === null) && r.piezas.some(p => p.clase === "puntos") === (nivel === "E2" || nivel === "E2VR"));
    // pérdidas
    const l = H.perdida(r, d.receta, { radios: radioUnidad });
    assert.ok(l.pos_mm > 0, "la prueba debe cuantizar de verdad (pérdida de posición > 0)");
    assert.ok(l.pos_mm <= H.TOPES.pos_mm, "posición " + l.pos_mm + " mm");
    assert.ok(l.traslacion_mm <= H.TOPES.traslacion_mm, "traslación " + l.traslacion_mm + " mm");
    assert.ok(l.normal_grados <= H.TOPES.normal_grados, "normales " + l.normal_grados + "°");
    assert.ok(l.color <= H.TOPES.color, "color " + l.color);
    assert.ok(l.lineal_mm_en_geometria <= H.TOPES.lineal_mm_en_geometria, "parte lineal " + l.lineal_mm_en_geometria + " mm");
    assert.ok(l.uv <= 1 / 131070 + 1e-9, "uv " + l.uv);              // mitad del paso: rango [0,1] en 65 535
    assert.ok(l.hueco_muerta <= 1 / 510 + 1e-9, "hueco/muerta " + l.hueco_muerta);   // rango [0,1] en 255
    // el índice de una malla grande va en Uint32 y el resto en Uint16: el tamaño lo dice
    const grande = r.piezas.find(p => p.atrib && p.atrib.position.length / 3 > 65535);
    if (grande) assert.ok(H.decodifica(bytes).receta.piezas.find(p => p.atrib && p.atrib.position.length / 3 > 65535).indice.every((v, i) => v === grande.indice[i]));
  });
}
test("los objetos del manifiesto de ejemplo: la huella y los bytes son los de la receta sintética (el formato v1 no cambia a escondidas)", async () => {
  const m = EJEMPLO();
  for (const v of m.variantes) {
    const r = S.recetaSintetica({ semilla: v.semilla, nivel: v.nivel, epoca: v.epoca }), o = await N.horneaObjeto(r, OPC(r, v.nivel), m.brotli);
    assert.strictEqual(o.huella, v.huella, "huella de " + [v.semilla, v.nivel, v.epoca].join("/") + ": si cambia el formato, sube FORMATO y regenera con pruebas/olivo/horneado/genera.mjs");
    assert.strictEqual(o.bytes, v.bytes);
    assert.ok(v.bytes_br > 0 && o.bytes_br > 0);
  }
});
test("brotli 9 y 11: ida y vuelta, la huella es de los bytes sin comprimir y no cambia con la calidad", async () => {
  const r = S.recetaSintetica({ semilla: 23, nivel: "E2", epoca: "madura" }), a = await N.horneaObjeto(r, OPC(r, "E2"), 9), b = await N.horneaObjeto(r, OPC(r, "E2"), 11);
  assert.strictEqual(a.huella, b.huella);
  for (const o of [a, b]) {
    const crudo = N.descomprimeBr(o.br);
    assert.deepStrictEqual(crudo, o.crudo);
    assert.ok(await H.verificaHuella(crudo, o.huella));
  }
  assert.ok(b.bytes_br <= a.bytes_br, "la 11 no pesa más que la 9");
});
test("un objeto estropeado se rechaza: un byte cambiado (huella), otra magia, otra versión de formato, cortado o con un array fuera", async () => {
  const r = S.recetaSintetica({ semilla: 11, nivel: "E2VR", epoca: "envero" }), b = H.codifica(r, OPC(r, "E2VR")), huella = await H.huellaBytes(b);
  const c = b.slice(); c[c.length - 1] ^= 1;
  assert.ok(!(await H.verificaHuella(c, huella)), "un byte cambiado debe cambiar la huella");
  const m = b.slice(); m[0] = 0x58; assert.throws(() => H.decodifica(m), /magia/);
  const v = b.slice(); new DataView(v.buffer).setUint16(4, 2, true); assert.throws(() => H.decodifica(v), /versión de formato 2/); assert.throws(() => H.leeCabecera(v), /versión de formato 2/);
  assert.throws(() => H.decodifica(b.subarray(0, b.length - 4)), /longitudes/);
  assert.throws(() => H.decodifica(b.subarray(0, 8)), /corto/);
  // un array que se sale de los datos: se cambia el offset en la cabecera JSON (mismo largo)
  const txt = new TextDecoder().decode(b.subarray(16, 16 + new DataView(b.buffer, b.byteOffset).getUint32(8, true))), i = txt.indexOf('"offset":0,');
  assert.ok(i > 0, "el primer array empieza en el offset 0");
  const roto = txt.slice(0, i) + '"offset":1,' + txt.slice(i + 11), e = b.slice(); e.set(new TextEncoder().encode(roto), 16);   // 1 no está alineado a 4
  assert.throws(() => H.decodifica(e), /fuera de los datos/);
  assert.throws(() => H.codifica(r, { nivel: "E2" }), /faltan/);
  const mala = S.recetaSintetica({ semilla: 1, nivel: "E2", epoca: "envero" }); mala.piezas[1].matrices[15] = 2;
  assert.throws(() => H.codifica(mala, OPC(mala, "E2")), /última fila/);
});

// ---------- manifiesto binario de tesela
test("manifiesto de tesela: 68 B por olivo (copas_id u32 + 4 huellas de 16 B), ordenado, con huellas ausentes", async () => {
  const hs = (n) => Array.from({ length: 4 }, (_, j) => (n * 4 + j).toString(16).padStart(32, "a"));
  const olivos = [7, 3, 90000, 2 ** 32 - 1].map((id, i) => ({ copas_id: id, huellas: i === 1 ? [hs(i)[0], null, hs(i)[2], null] : hs(i) }));
  const b = H.codificaManifiestoTesela({ combinaciones: 4, olivos });
  assert.strictEqual(b.length, 16 + 4 * 68);
  assert.strictEqual(new TextDecoder().decode(b.subarray(0, 4)), "OLVT");
  const d = H.decodificaManifiestoTesela(b);
  assert.deepStrictEqual(d.olivos.map(o => o.copas_id), [3, 7, 90000, 2 ** 32 - 1], "ordenado por copas_id");
  assert.deepStrictEqual(d.olivos.find(o => o.copas_id === 3).huellas, olivos[1].huellas, "las huellas ausentes vuelven como null");
  assert.deepStrictEqual(d.olivos.find(o => o.copas_id === 7).huellas, olivos[0].huellas);
  assert.throws(() => H.codificaManifiestoTesela({ combinaciones: 4, olivos: [olivos[0], olivos[0]] }), /repetido/);
  assert.throws(() => H.codificaManifiestoTesela({ combinaciones: 4, olivos: [{ copas_id: 1, huellas: ["xyz", null, null, null] }] }), /huella no válida/);
  assert.throws(() => H.decodificaManifiestoTesela(b.subarray(0, b.length - 1)), /longitud/);
  const v = b.slice(); new DataView(v.buffer).setUint16(4, 9, true); assert.throws(() => H.decodificaManifiestoTesela(v), /versión/);
});

// ---------- recetas reales de olivo-2
test("[olivo-2 real] E0, E1, E2 y E2-VR: ida y vuelta con las pérdidas de O6, mismos recuentos y triángulos, con la clave de la caché", async t => {
  if (SALTO_REAL) return t.skip(SALTO_REAL);
  const O = await imp("apps", "web", "olivo", "index.js"), GEOS = O.geos();
  const radios = {}; for (const g of Object.keys(GEOS)) { const c = GEOS[g] && GEOS[g].caja; if (c) radios[g] = Math.hypot(Math.max(Math.abs(c.min.x), Math.abs(c.max.x)), Math.max(Math.abs(c.min.y), Math.abs(c.max.y)), Math.max(Math.abs(c.min.z), Math.abs(c.max.z))); }
  const entrada = { tipo: "centenario3", epoca: "envero", semilla: 11, parametros: {} }, r0 = O.receta(entrada);
  for (const nivel of ["E0", "E1", "E2", "E2VR"]) {
    const r = nivel === "E0" ? r0 : O.aNivel(r0, nivel), ck = O.claveReceta(entrada, nivel);
    const o = await N.horneaObjeto(r, { nivel, clave: ck, gen_version: O.GEN_VERSION, cache_version: O.CACHE_VERSION }, 9), d = H.decodifica(o.crudo);
    assert.strictEqual(d.cabecera.clave, ck);
    assert.deepStrictEqual(H.igualEstructura(r, d.receta), [], nivel);
    assert.strictEqual(O.triangulos(d.receta), O.triangulos(r), nivel + ": triángulos");
    assert.strictEqual(O.llamadasNivel(d.receta), O.llamadasNivel(r), nivel + ": llamadas de dibujo");
    const l = H.perdida(r, d.receta, { radios });
    for (const k of Object.keys(H.TOPES)) assert.ok(l[k] <= H.TOPES[k], nivel + ": " + k + " " + l[k] + " > " + H.TOPES[k]);
    assert.ok(o.bytes < O.bytesReceta(r), nivel + ": cuantizada pesa menos que cruda");
    assert.ok(await H.verificaHuella(N.descomprimeBr(o.br), o.huella));
  }
});

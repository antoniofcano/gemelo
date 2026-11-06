"use strict";
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fixture, lee, fs, path } = require("./_util");
const { erroresTesela, enHuella } = require("./_tesela");
const Ajv2020 = require("ajv/dist/2020").default;
const contratoModulos = require(path.join(RAIZ, "pruebas", "contrato_modulos.js"));

const json = f => JSON.parse(fs.readFileSync(path.join(RAIZ, f), "utf8"));
const ESQ_INDICE = json("contratos/indice.schema.json"), ESQ_TESELA = json("contratos/tesela.schema.json"), IFACES = json("contratos/interfaces.json");
// JSON Schema 2020-12 estándar con ajv: estricto (una palabra desconocida, un tipo sin declarar o un array posicional sin cerrar no compilan) salvo
// strictRequired (aquí «required» sin «properties» es a propósito: se exige la presencia del campo y su forma no se fija); todos los errores
const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
const V_INDICE = ajv.compile(ESQ_INDICE), V_TESELA = ajv.compile(ESQ_TESELA);
/** [] si cumple; si no, los errores legibles: «/ruta: mensaje {parámetros}» */
const valida = (v, dato) => v(dato) ? [] : v.errors.map(e => (e.instancePath || "/") + ": " + e.message + " " + JSON.stringify(e.params));
const bytes = s => Buffer.from(s, "base64");
const esJpeg = b => b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;
const dataJpg = s => bytes(s.slice(s.indexOf(",") + 1));

let DIR; test.before(() => { DIR = fixture({ sinTileset: true }); });
const fx = (...p) => path.join(DIR, ...p);
const jsonFx = (...p) => JSON.parse(fs.readFileSync(fx(...p), "utf8"));

// ---------- datos: exportador → motor ----------
for (const finca of ["hituelo", "cerro"]) {
  const cargaIndice = () => jsonFx(finca, "indice.json");   // desde T8 fase 2 las dos fincas van con indice.json y t/ (Cerro ya no va embebido)

  test("[" + finca + "] el índice cumple contratos/indice.schema.json", () => {
    assert.ok(DIR);
    const errores = valida(V_INDICE, cargaIndice());
    assert.deepStrictEqual(errores.slice(0, 15), []);
  });

  test("[" + finca + "] coherencia interna del índice (referencias, tamaños de las rejillas)", () => {
    const I = cargaIndice();
    I.copas.forEach(c => assert.ok(c[4] <= I.parcelas.length, "copa con parcela fuera de rango"));
    // columnas paralelas opcionales del registro de árboles (ADR-0012): misma longitud que copas; ids únicos
    if (I.copas_id) { assert.strictEqual(I.copas_id.length, I.copas.length, "copas_id debe tener una entrada por copa"); assert.strictEqual(new Set(I.copas_id).size, I.copas_id.length, "copas_id repetido"); }
    if (I.copas_tipo) assert.strictEqual(I.copas_tipo.length, I.copas.length, "copas_tipo debe tener una entrada por copa");
    if (I.copas_semilla) assert.strictEqual(I.copas_semilla.length, I.copas.length, "copas_semilla debe tener una entrada por copa (ADR-0017)");
    if (I.copas_param) assert.strictEqual(I.copas_param.length, I.copas.length, "copas_param debe tener una entrada (fila o null) por copa (ADR-0017)");
    I.marcados.forEach(m => { assert.ok(m[2] < I.copas.length, "marcado que apunta a una copa inexistente"); assert.ok(m[3] < I.parcelas.length); });
    assert.deepStrictEqual(Object.keys(I.ot.parcelas).sort(), I.parcelas.map(p => p.id).sort(), "ot.parcelas debe tener las mismas parcelas");
    if (I.fincas) I.fincas.forEach(f => f.parcelas.forEach(k => assert.ok(k < I.parcelas.length)));
    const g = I.grueso; assert.strictEqual(bytes(g.b64).length, g.w * g.h * 2, "grueso: Int16 de w × h");
    const n = I.ndvi, nf = n.fechas.length, nb = n.u8 !== undefined ? bytes(n.u8).length : bytes(n.b64).length / 2;
    assert.strictEqual(nb, nf * n.w * n.h, "ndvi: fechas × h × w");
    assert.strictEqual(n.media.length, nf, "ndvi.media: una por fecha");
    const s = I.suelo_ndvi; assert.strictEqual(bytes(s.f).length, s.w * s.h * 2, "suelo_ndvi.f: Int16 de w × h"); assert.strictEqual(s.a.length, nf); assert.strictEqual(s.b.length, nf);
    assert.ok(esJpeg(dataJpg(I.mosaico.jpg)), "mosaico: no es un JPEG");
    const [cx, cy] = I.centro_utm;
    for (const [k, t] of Object.entries(I.teselas)) {
      assert.strictEqual(k, t.kx + "_" + t.ky);
      assert.ok(t.v[0] >= I.ext[0] && t.v[2] <= I.ext[2] && t.v[1] >= I.ext[3] && t.v[3] <= I.ext[1], "tesela " + k + " fuera de ext");
      // L4-03: v es el rectángulo con dato, dentro de la huella de la tesela; no tiene que estar alineado (Cerro recorta a la ventana)
      assert.ok(enHuella(t.v, t.kx, t.ky, I.centro_utm), "tesela " + k + ": v fuera de su huella (kx·256 − cx … +256)");
    }
  });

  test("[" + finca + "] cada tesela cumple tesela.schema.json y tiene los tamaños del contrato", () => {
    const I = cargaIndice();
    for (const k of Object.keys(I.teselas)) {
      const t = jsonFx(finca, "t", k + ".json");
      assert.deepStrictEqual(erroresTesela(t).slice(0, 10), [], "tesela " + k);
      assert.strictEqual(I.teselas[k].np, t.np, k + ": el índice y la tesela dicen distinto np");
      assert.ok(esJpeg(fs.readFileSync(fx(finca, "t", k + ".jpg"))), k + ": .jpg no es JPEG");
    }
  });
}

test("los esquemas rechazan lo que deben (arrays posicionales de otra longitud, claves de tesela mal formadas, parcela incompleta, tipos y rangos)", () => {
  const base = jsonFx("hituelo", "indice.json"), k0 = Object.keys(base.teselas)[0];
  const roto = cambia => { const I = JSON.parse(JSON.stringify(base)); cambia(I); return valida(V_INDICE, I); };
  const casos = {
    "centro_utm con 3 elementos": I => I.centro_utm.push(0),
    "centro_utm con 1 elemento": I => I.centro_utm.pop(),
    "centro_utm no entero": I => { I.centro_utm[0] += 0.5; },
    "ext con 3 elementos": I => I.ext.pop(),
    "copa con 6 elementos": I => I.copas[0].push(0),
    "copa con r8 de 7 radios": I => I.copas[0][3].pop(),
    "copa con parcela −1": I => { I.copas[0][4] = -1; },
    "marcado con 3 elementos": I => I.marcados.length ? I.marcados[0].pop() : I.marcados.push([0, 0, 0]),
    "clave de tesela mal formada": I => { I.teselas["a_b"] = I.teselas[k0]; },
    "tesela sin np": I => { delete I.teselas[k0].np; },
    "v de tesela con 5 elementos": I => I.teselas[k0].v.push(0),
    "parcela sin linde": I => { delete I.parcelas[0].linde; },
    "linde con un vértice de 3 coordenadas": I => I.parcelas[0].linde[0].push(0),
    "versión de contrato distinta": I => { I.v = 3; },
    "copas_tipo menor que −1": I => { I.copas_tipo[0] = -2; },
    "ndvi sin u8 ni b64": I => { delete I.ndvi.u8; delete I.ndvi.b64; },
    "finca_id con mayúsculas": I => { I.finca_id = "Hituelo"; },
  };
  for (const [n, f] of Object.entries(casos)) assert.notDeepStrictEqual(roto(f), [], "el esquema del índice debería rechazar: " + n);
  const t = jsonFx("hituelo", "t", k0 + ".json");
  assert.notDeepStrictEqual(valida(V_TESELA, Object.assign({}, t, { dtm: "no*base64" })), [], "tesela con dtm que no es base64");
  assert.notDeepStrictEqual(valida(V_TESELA, Object.assign({}, t, { np: -1 })), [], "tesela con np negativo");
});

// L4-04: una tesela de tamaño distinto a 258² (o de chm/suelo distinto) debe fallar; se hace con copias en un directorio temporal, sin tocar el fixture
test("una tesela de tamaño distinto falla (copia en un directorio temporal; el fixture no se toca)", () => {
  const base = jsonFx("hituelo", "t", Object.keys(jsonFx("hituelo", "indice.json").teselas)[0] + ".json");
  assert.deepStrictEqual(erroresTesela(base), [], "la tesela del fixture debe pasar antes de romperla");
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "gemelo-tesela-"));
  try {
    const malas = {
      "dtm 257²": Object.assign({}, base, { dtm: Buffer.alloc(257 * 257 * 2).toString("base64") }),
      "chm 255²": Object.assign({}, base, { chm: Buffer.alloc(255 * 255).toString("base64") }),
      "suelo 129²": Object.assign({}, base, { suelo: Buffer.alloc(129 * 129 * 3).toString("base64") }),
      "np que no cuadra con pts": Object.assign({}, base, { np: base.np + 1 }),
    };
    for (const [n, t] of Object.entries(malas)) {
      const f = path.join(tmp, n.replace(/[^\w]+/g, "_") + ".json");
      fs.writeFileSync(f, JSON.stringify(t));
      const leida = JSON.parse(fs.readFileSync(f, "utf8"));
      assert.notDeepStrictEqual(erroresTesela(leida), [], "una tesela con " + n + " debería fallar");
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("el fixture ejercita la calidad Base: hay una tesela sin nube (ADR-0003)", () => {
  const I = jsonFx("hituelo", "indice.json");
  assert.ok(Object.values(I.teselas).some(t => t.np === 0), "ninguna tesela sin pts");
  assert.ok(Object.values(I.teselas).some(t => t.np > 0), "ninguna tesela con pts");
});

test("el fixture ejercita las dos formas del registro de árboles: Hituelo con copas_id y copas_tipo (algún tipo asignado), Cerro sin ellas", () => {
  const H = jsonFx("hituelo", "indice.json"), C = jsonFx("cerro", "indice.json");
  assert.ok(H.copas_id && H.copas_tipo, "Hituelo debe llevar copas_id y copas_tipo");
  assert.ok(H.copas_param && H.copas_param.some(f => f === null) && H.copas_param.some(f => f !== null), "Hituelo debe llevar copas_param con filas medidas y sin medir (ADR-0017)");
  assert.ok(H.copas_tipo.some(t => t >= 0) && H.copas_tipo.some(t => t === -1), "Hituelo debe tener olivos con tipo y sin tipo");
  assert.ok(!("copas_id" in C) && !("copas_tipo" in C) && !("copas_param" in C), "Cerro conserva el formato de antes (sin columnas opcionales)");
});

test("la nube está barajada: el prefijo es una submuestra uniforme (no ordenada por posición)", () => {
  const t = jsonFx("hituelo", "t", "1000_16000.json"), b = bytes(t.pts), v = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  const n = Math.min(300, v.length / 3), xs = []; for (let i = 0; i < n; i++) xs.push(v[i * 3]);
  const crec = xs.filter((x, i) => i && x >= xs[i - 1]).length / (n - 1);
  assert.ok(crec > 0.3 && crec < 0.7, "los primeros puntos parecen ordenados (fracción creciente " + crec.toFixed(2) + ")");
});

// ---------- el motor: cabeceras e interfaces ----------
test("cada módulo de src/ tiene su cabecera «Expone / Consume» al día (node pruebas/contrato_modulos.js --escribe la regenera)", () => {
  assert.deepStrictEqual(contratoModulos.comprueba(), []);
});

test("las cabeceras son coherentes: lo que un módulo consume lo expone el módulo citado", () => {
  const d = contratoModulos.deriva(), exp = {};
  for (const f in d.expone) exp[f.slice(0, -3)] = new Set(d.expone[f]);
  for (const f in d.txt) {
    const h = contratoModulos.leeCabecera(fs.readFileSync(path.join(RAIZ, "apps", "web", "motor", f), "utf8"));
    assert.ok(h, f + ": sin cabecera");
    for (const [m, ns] of Object.entries(h.consume)) {
      assert.ok(exp[m], f + " consume de un módulo que no existe: " + m);
      for (const n of ns) assert.ok(exp[m].has(n), f + " dice consumir " + n + " de " + m + ", que no lo expone");
    }
  }
});

// L4-02: la derivación de «Consume» mira solo el código; con un motor de mentira (dos módulos en un directorio temporal)
function motorDeMentira(codigoB) {
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "gemelo-mod-"));
  fs.writeFileSync(path.join(dir, "01_a.js"), "  var Alfa = 1, yN = 2;\n  function Beta() { return Alfa; }\n");
  fs.writeFileSync(path.join(dir, "02_b.js"), codigoB);
  fs.writeFileSync(path.join(dir, "03_c.js"), "  var z = Alfa + yN + Beta();\n");   // lo que hace que 01_a «exponga» esos nombres
  return dir;
}
test("contrato_modulos: un nombre que solo está en un comentario o en una cadena no es un consumo", () => {
  const dir = motorDeMentira([
    "  // Alfa aparece aquí, y /* Beta */ aquí",
    "  var t = \"Alfa y yN\", u = 'Beta', v = `Alfa ${1 + 1} yN`;",
    "  var r = /Alfa/.test(t); var o = { Alfa: 1 }; var p = o.Beta;",
    "",
  ].join("\n"));
  try {
    const d = contratoModulos.deriva(dir);
    assert.deepStrictEqual(d.cons["02_b.js"], {}, "ningún consumo real");
    assert.deepStrictEqual(d.expone["01_a.js"], ["Alfa", "yN", "Beta"]);
    // y `--comprueba` suspende una cabecera que declara el consumo falso
    contratoModulos.escribe(dir);
    assert.deepStrictEqual(contratoModulos.comprueba(dir), []);
    const f = path.join(dir, "02_b.js"), s = fs.readFileSync(f, "utf8");
    fs.writeFileSync(f, s.replace("// Consume: (nada de otros módulos)", "// Consume: 01_a (Alfa)"));
    assert.deepStrictEqual(contratoModulos.comprueba(dir), ["02_b.js"], "consumo que solo existe en un comentario/cadena");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("contrato_modulos: el uso real en el código sí cuenta, también el de una expresión de plantilla y el de un nombre corto de la lista blanca", () => {
  const dir = motorDeMentira("  var x = Beta(); var s = `v=${yN}`;\n");
  try {
    const d = contratoModulos.deriva(dir);
    assert.deepStrictEqual(d.cons["02_b.js"], { "01_a": ["yN", "Beta"] });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** claves de primer nivel del último `return { … }` de la IIFE `var NOMBRE = (function`, o del literal `window.NOMBRE = {` */
function claves(fuente, ini) {
  const i = fuente.indexOf("{", ini); let prof = 0, instr = null, cur = "", out = [], esperaClave = true;
  for (let k = i; k < fuente.length; k++) {
    const ch = fuente[k];
    if (instr) { if (ch === "\\") k++; else if (ch === instr) instr = null; continue; }
    if (ch === "\"" || ch === "'" || ch === "`") { instr = ch; continue; }
    if ("{[(".includes(ch)) { prof++; if (prof === 1) { esperaClave = true; cur = ""; } continue; }
    if ("}])".includes(ch)) { prof--; if (prof === 0) { if (esperaClave && cur.trim()) out.push(cur.trim()); break; } continue; }   // la última, abreviada (TypeScript: { est, add })
    if (prof === 1) {
      if (ch === ",") { if (esperaClave && cur.trim()) out.push(cur.trim()); esperaClave = true; cur = ""; }   // una clave abreviada («est,») vale por su nombre
      else if (ch === ":" && esperaClave) { out.push(cur.trim()); esperaClave = false; }
      else if (esperaClave) cur += ch;
    }
  }
  return out;
}
function retornoDe(fuente, nombre) {
  const ini = fuente.indexOf("var " + nombre + " = (function");
  assert.ok(ini >= 0, "no encuentro «var " + nombre + " = (function»");
  const fin = fuente.indexOf("\n  })();", ini);
  const ret = fuente.lastIndexOf("return {", fin);
  assert.ok(ret > ini, "no encuentro el return de " + nombre);
  return claves(fuente, ret);
}

/** como retornoDe, para una fábrica de TypeScript: el último `return {…}` de `export function FABRICA` (cierra en la primera `}` sin sangría) */
function retornoDeFabrica(fuente, fabrica) {
  const ini = fuente.indexOf("export function " + fabrica + "(");
  assert.ok(ini >= 0, "no encuentro «export function " + fabrica + "»");
  const fin = fuente.indexOf("\n}\n", ini), ret = fuente.lastIndexOf("return {", fin);
  assert.ok(ret > ini, "no encuentro el return de " + fabrica);
  return claves(fuente, ret);
}

for (const [nombre, def] of Object.entries(IFACES.interfaces)) {
  test("interfaz " + nombre + " (" + def.modulo + "): devuelve exactamente los miembros de contratos/interfaces.json", () => {
    let real;
    if (def.fuente && def.objeto) {   // MU2-5: un objeto de TypeScript (`export const NOMBRE = { … }`) que el motor toma tal cual: `var NOMBRE = Nucleo.NOMBRE;`
      const src = lee(def.fuente), ini = src.indexOf("export const " + nombre + " = {");
      assert.ok(ini >= 0, "no encuentro «export const " + nombre + " = {» en " + def.fuente);
      real = claves(src, ini).sort();
      assert.match(lee("apps/web/motor/" + def.modulo), new RegExp("^  var " + nombre + " = Nucleo\\." + nombre + ";", "m"), def.modulo + " debe hacer var " + nombre + " = Nucleo." + nombre + ";");
    } else if (def.fuente) {   // migrada a TypeScript (A1-10): el contrato lo cumple la fábrica de apps/web/src/, y el módulo del motor es un talón que la llama
      real = retornoDeFabrica(lee(def.fuente), def.fabrica).sort();
      assert.match(lee("apps/web/motor/" + def.modulo), new RegExp("^  var " + nombre + " = (?:Nucleo|Mundos)\\." + def.fabrica + "\\(", "m"), def.modulo + " (talón) debe hacer var " + nombre + " = Nucleo|Mundos." + def.fabrica + "(…)");   // A3-1b: los componentes del exterior vienen de Mundos
    } else real = retornoDe(lee("apps/web/motor/" + def.modulo), nombre).sort();
    assert.deepStrictEqual(real, def.miembros.slice().sort(), "cambia contratos/interfaces.json y doc/sistema/CONTRATOS.md en el mismo commit");
  });
}

test("window.__g (gancho de las pruebas) publica los miembros del contrato", () => {
  const f = lee("apps/web/motor/27_debug.js"), real = claves(f, f.indexOf("window.__g = ")).sort();
  assert.deepStrictEqual(real, IFACES.ganchos_window.__g.miembros.slice().sort());
});

test("los ganchos window.__* de depuración existen donde dice el contrato", () => {
  for (const [n, def] of Object.entries(IFACES.ganchos_window)) {
    if (def.tipo !== "function") continue;
    assert.match(require("./_fuente").fuenteMotor(def.modulo) /* MU5-n: con el .ts de los migrados */, new RegExp("window\\." + n + " = function"), n + " no está en " + def.modulo);
  }
});

test("los alias heredados suelo, copaAlta, colorSuelo y orto siguen apuntando a Mundo", () => {
  assert.match(lee("apps/web/motor/02_mundo.js"), /var suelo = Mundo\.suelo, copaAlta = Mundo\.copaAlta, colorSuelo = Mundo\.colorSuelo, orto = Mundo\.orto;/);
});

test("la documentación nombra cada interfaz del contrato", () => {
  const doc = lee("doc/sistema/CONTRATOS.md");
  for (const n of Object.keys(IFACES.interfaces).concat(["window.__g", "indice.json", "t/<kx>_<ky>.json", "VR"])) assert.ok(doc.includes(n), "CONTRATOS.md no menciona " + n);
});

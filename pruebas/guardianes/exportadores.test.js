"use strict";
// Exportadores de tuberia/ (ADR-0012): emiten las columnas paralelas copas_id y copas_tipo (-1). copas_id = id del censo de OlivarTrack si la copa
// está emparejada con una marca que lo trae (tolerando el desfase de ~1,5 m de la ortofoto), y si no, uno provisional (>= 2^31) por posición UTM
// (tuberia/ids_copas.py).
// Siempre: la función de ids sobre entradas sintéticas (Python puro). Si hay numpy, scipy y pillow: el exportador de Hituelo (hituelo_conv.py) y el de
// Cerro (construye() de finca_8_teselas.py) de verdad sobre un mini conjunto SINTÉTICO de 1 tesela (pruebas/exportadores_sinteticos.py), y su índice
// valida contra contratos/indice.schema.json. Ningún dato real.
const test = require("node:test"), assert = require("node:assert");
const { propia, python, ejecuta, lee, fs, path } = require("./_util");
const Ajv2020 = require("ajv/dist/2020").default;   // el mismo validador y las mismas opciones que contratos.test.js

const py = python();
const ESQ = JSON.parse(lee("contratos/indice.schema.json"));
const V_INDICE = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true }).compile(ESQ);
const valida = (_esq, v) => V_INDICE(v) ? [] : V_INDICE.errors.map(e => (e.instancePath || "/") + ": " + e.message);
const SCRIPT = path.join("pruebas", "exportadores_sinteticos.py");
// sin -I: numpy/scipy/pillow suelen estar en el site-packages del usuario, que -I oculta; -P -E evitan la carpeta del script y las PYTHON*
const DEPS = py ? ejecuta(py, ["-P", "-E", "-c", "import numpy, scipy, PIL"]) : null;
const SIN_DEPS = !py ? "No hay Python 3" : DEPS.status !== 0 ? "faltan numpy, scipy o pillow (pip install -r requirements.txt)" : null;

const unicos = a => new Set(a).size === a.length;
function compruebaColumnas(I, que) {
  assert.ok(Array.isArray(I.copas_id) && Array.isArray(I.copas_tipo), que + ": faltan copas_id o copas_tipo");
  assert.strictEqual(I.copas_id.length, I.copas.length, que + ": copas_id con otra longitud que copas");
  assert.strictEqual(I.copas_tipo.length, I.copas.length, que + ": copas_tipo con otra longitud que copas");
  assert.ok(unicos(I.copas_id), que + ": copas_id repetidos");
  assert.ok(I.copas_id.every(k => Number.isInteger(k) && k >= 0 && k < 2 ** 32), que + ": copas_id fuera de [0, 2^32) (UINT32 de 3D Tiles)");
  assert.ok(I.copas_tipo.every(t => t === -1), que + ": hoy todo copas_tipo es -1 (sin asignar)");
  assert.ok(!("marcados_id" in I), que + ": marcados_id es un intermedio, no va al índice");
  const e = valida(ESQ, I);
  assert.deepStrictEqual(e.slice(0, 10), [], que + ": el índice no cumple contratos/indice.schema.json");
}
// id de cada copa por su posición (x, y), para comparar exportaciones con otro orden
const porPosicion = I => new Map(I.copas.map((c, i) => [c[0] + "," + c[1], I.copas_id[i]]));

test("ids_copas.py: misma longitud que copas, únicos, estables entre ejecuciones, con otro orden y con otro centro_utm", t => {
  if (!py) return t.skip("No hay Python 3: los ids NO se han comprobado");
  const r = ejecuta(py, ["-I", SCRIPT, "ids"]);
  assert.strictEqual(r.status, 0, "exportadores_sinteticos.py ids falló:\n" + r.stdout + r.stderr);
  const R = JSON.parse(r.stdout);
  assert.strictEqual(R.ids.length, R.n);
  assert.ok(unicos(R.ids), "ids repetidos (y hay una colisión a propósito en la misma celda de 1 m)");
  assert.deepStrictEqual(R.ids_repetido, R.ids, "dos ejecuciones dan ids distintos");
  assert.deepStrictEqual(R.ids_perm, R.perm.map(k => R.ids[k]), "el id depende del orden de copas");
  assert.deepStrictEqual(R.ids_otro_centro, R.ids, "el id depende de centro_utm (debe salir de la posición UTM absoluta)");
  assert.deepStrictEqual(R.columnas.copas_id, R.ids);
  assert.deepStrictEqual(R.columnas.copas_tipo, new Array(R.n).fill(-1), "copas_tipo debe ser -1 para todas");
  assert.strictEqual(R.choque_ids.length, R.choque_n); assert.ok(unicos(R.choque_ids), "colisiones múltiples con ids repetidos");
  assert.deepStrictEqual(R.vacio, { copas_id: [], copas_tipo: [] });
  assert.match(R.finca_grande, /más de 32768 m/, "una finca de más de 32,7 km debe pararse");
  assert.ok(R.ids.every(k => k >= R.prov), "sin censo, todos los ids son provisionales (>= 2^31)");
});

test("ids_copas.py: con censo, la copa emparejada (desfase de ~1,5 m corregido) toma el id del censo; las demás, provisionales y sin chocar", t => {
  if (!py) return t.skip("No hay Python 3: el censo NO se ha comprobado");
  const r = ejecuta(py, ["-I", SCRIPT, "ids"]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const R = JSON.parse(r.stdout);
  assert.deepStrictEqual(R.desfase, [1.3, 0.8], "desfase estimado de las marcas");
  assert.deepStrictEqual(R.par, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1], "emparejamiento marca → copa (la última marca está lejos de toda copa)");
  for (const [i, k] of Object.entries(R.esperado)) assert.strictEqual(R.ids_censo[+i], k, "la copa " + i + " debe llevar el id del censo " + k);
  const prov = R.ids_censo.filter((k, i) => !(String(i) in R.esperado));
  assert.ok(prov.every(k => k >= R.prov), "las copas sin marca con id llevan id provisional (>= 2^31)");
  assert.ok(unicos(R.ids_censo));
  assert.deepStrictEqual(R.ids_censo_perm, R.perm.map(k => R.ids_censo[k]), "con censo, el id depende del orden de copas");
  assert.deepStrictEqual(R.avisos_censo, []);
  assert.strictEqual(R.avisos_malos.length, 2, "un id del censo repetido y uno no entero deben avisar y quedar provisionales");
});

let BASE = null, FALLO = null;
test.before(() => {
  if (SIN_DEPS) return;
  BASE = propia("exportadores");
  const r = ejecuta(py, ["-P", "-E", SCRIPT, "exporta", BASE]);
  if (r.status !== 0) FALLO = "exportadores_sinteticos.py exporta falló:\n" + r.stdout + r.stderr;
});
const indice = d => JSON.parse(fs.readFileSync(path.join(BASE, d, "indice.json"), "utf8"));
const esperado = () => JSON.parse(fs.readFileSync(path.join(BASE, "esperado.json"), "utf8"));
const PROV = 2 ** 31;
// del censo (por posición) frente a lo esperado; el resto, provisionales
function compruebaCenso(I, esp, que) {
  const pp = porPosicion(I);
  for (const [pos, k] of Object.entries(esp)) assert.strictEqual(pp.get(pos), k, que + ": la copa en " + pos + " debe llevar el id del censo " + k);
  assert.strictEqual(I.copas_id.filter(k => k < PROV).length, Object.keys(esp).length, que + ": ids del censo de más o de menos");
}

test("hituelo_conv.py sobre 1 tesela sintética: columnas del contrato, índice válido y teselas escritas", t => {
  if (SIN_DEPS) return t.skip(SIN_DEPS + ": el exportador de Hituelo NO se ha ejecutado");
  assert.ifError(FALLO);
  const I = indice("hituelo_a");
  compruebaColumnas(I, "hituelo");
  assert.strictEqual(I.copas.length, 13, "13 olivos sintéticos (el árbol que no es olivo no entra)");
  compruebaCenso(I, esperado().hituelo, "hituelo");
  assert.deepStrictEqual(I.marcados.map(m => m[2]), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1], "marcados: índice de la copa emparejada (uno a uno)");
  for (const k of Object.keys(I.teselas)) for (const ext of [".json", ".jpg"]) assert.ok(fs.existsSync(path.join(BASE, "hituelo_a", "t", k + ext)), "falta t/" + k + ext);
});

test("hituelo_conv.py: dos exportaciones de los mismos datos dan los mismos ids; con los árboles en otro orden, el mismo id por posición", t => {
  if (SIN_DEPS) return t.skip(SIN_DEPS + ": la estabilidad del exportador NO se ha comprobado");
  assert.ifError(FALLO);
  const a = indice("hituelo_a"), b = indice("hituelo_b"), c = indice("hituelo_c");
  assert.deepStrictEqual(b.copas_id, a.copas_id, "reexportar los mismos datos cambió los ids");
  compruebaColumnas(c, "hituelo (otro orden)");
  assert.notDeepStrictEqual(c.copas.map(x => x[0] + "," + x[1]), a.copas.map(x => x[0] + "," + x[1]), "la prueba debe cambiar el orden de copas");
  assert.deepStrictEqual(porPosicion(c), porPosicion(a), "con otro orden de árboles, un mismo árbol cambió de id");
});

test("finca_8_teselas.py construye() (Cerro) sobre 1 tesela sintética: columnas del contrato, id del censo desde marcados_id, índice válido; mismo id provisional que Hituelo en la misma posición UTM", t => {
  if (SIN_DEPS) return t.skip(SIN_DEPS + ": el exportador de Cerro NO se ha ejecutado");
  assert.ifError(FALLO);
  const C = indice("cerro"), H = indice("hituelo_a");
  compruebaColumnas(C, "cerro");
  compruebaCenso(C, esperado().cerro, "cerro (marcados_id del intermedio)");
  const pc = porPosicion(C), ph = porPosicion(H);
  for (const [pos, k] of pc) if (k >= PROV && ph.get(pos) >= PROV) assert.strictEqual(ph.get(pos), k, "el id provisional de " + pos + " difiere entre Cerro y Hituelo");
  for (const k of Object.keys(C.teselas)) for (const ext of [".json", ".jpg"]) assert.ok(fs.existsSync(path.join(BASE, "cerro", "t", k + ext)), "Cerro: falta t/" + k + ext + " (se sirve con ficheros, como Hituelo; T8 fase 2)");
});

// copas_semilla dentro de los exportadores (ADR-0017, decisión 50, tuberia/semillas_copas.py): sin índice anterior, semilla = copas_id; con él (por
// --anterior, por GEMELO_INDICE_ANTERIOR o el indice.json que ya había en la salida), la heredada por id o por posición, aunque cambie el orden, el
// centro_utm o el id (provisional → censo).
test("exportadores: copas_semilla = copas_id sin índice anterior; heredada del anterior por argumento, variable o salida existente", t => {
  if (SIN_DEPS) return t.skip(SIN_DEPS + ": copas_semilla en los exportadores NO se ha comprobado");
  assert.ifError(FALLO);
  for (const d of ["hituelo_a", "hituelo_c", "cerro", "cerro_prov"]) {
    const I = indice(d);
    assert.deepStrictEqual(I.copas_semilla, I.copas_id, d + ": sin índice anterior, la semilla es el copas_id");
  }
  const A = JSON.parse(fs.readFileSync(path.join(BASE, "anterior.json"), "utf8"));
  const semPos = I => new Map(I.copas.map((c, i) => [c[0] + "," + c[1], I.copas_semilla[i]]));
  for (const d of ["hituelo_e", "hituelo_f", "hituelo_g"]) {
    const I = indice(d); compruebaColumnas(I, d);
    assert.deepStrictEqual(I.copas_semilla, A.copas_semilla, d + ": no heredó las semillas del índice anterior");
  }
  const D = indice("hituelo_d"); compruebaColumnas(D, "hituelo_d");
  assert.deepStrictEqual(semPos(D), semPos(A), "con otro orden de árboles, un mismo árbol cambió de semilla");
  const P = indice("cerro_prov"), C = indice("cerro_censo"), pos = Object.keys(esperado().cerro)[0];
  compruebaColumnas(C, "cerro_censo");
  const iC = C.copas.findIndex(c => c[0] + "," + c[1] === pos), iP = P.copas.findIndex(c => c[0] + "," + c[1] === pos);
  assert.strictEqual(C.copas_id[iC], 7000, "la copa del censo lleva su id");
  assert.ok(P.copas_id[iP] >= PROV, "antes del censo su id era provisional");
  assert.strictEqual(C.copas_semilla[iC], P.copas_id[iP], "al llegar el censo, el olivo conserva la semilla de su id provisional");
  assert.deepStrictEqual(semPos(C), semPos(P), "las demás copas conservan su semilla");
});

// tuberia/puntos_copas.py (de las hojas .laz a los puntos normalizados) y tuberia/parametros_copas.py, de punta a punta, sobre un .laz SINTÉTICO
// escrito en la propia prueba (pruebas/nube_sintetica.py): conserva solo la vegetación cerca de las copas, resta el suelo del dtm de la tesela
// (en pendiente), ignora la hoja lejana y el duplicado «(1)», lee por trozos, y copas_param cumple el contrato con las medidas esperadas.
const LAZ = !py ? "No hay Python 3" : ejecuta(py, ["-P", "-E", "-c", "import numpy, scipy, laspy, lazrs"]).status !== 0 ? "faltan numpy, scipy, laspy o lazrs (pip install -r requirements.txt)" : null;
test("puntos_copas.py + parametros_copas.py sobre un .laz sintético: puntos conservados, altura sobre el dtm y copas_param del contrato", { timeout: 300000 }, t => {
  if (LAZ) return t.skip(LAZ + ": puntos_copas.py NO se ha ejecutado");
  const d = propia("nube");
  const r = ejecuta(py, ["-P", "-E", path.join("pruebas", "nube_sintetica.py"), d]);
  assert.strictEqual(r.status, 0, "nube_sintetica.py falló:\n" + r.stdout + r.stderr);
  const R = JSON.parse(r.stdout);
  assert.deepStrictEqual(R.hojas, ["500-4001"], "solo la hoja que toca las copas (ni la lejana ni el duplicado «(1)»)");
  assert.ok(R.trozo_ok, "la hoja debe leerse en más de un trozo");
  assert.strictEqual(R.conservados, R.esperados, "puntos conservados: solo clases 3-5, 0,3-30 m, a ≤ 6,5 m de una copa y dentro del cuadro");
  assert.deepStrictEqual(R.clases, [3, 4, 5]);
  assert.deepStrictEqual(R.dtype, ["float32", "float32", "float32"]);
  assert.ok(R.h_err_max < 0.011, "altura sobre el suelo con error " + R.h_err_max + " m (el dtm va en cm)");
  const F = R.copas_param;
  assert.strictEqual(F.length, 4); assert.strictEqual(F[3], null, "la copa sin puntos lleva null");
  const V = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true }).compile(ESQ.properties.copas_param);
  assert.ok(V(F), "copas_param no cumple contratos/indice.schema.json: " + JSON.stringify(V.errors));
  R.olivos.forEach((o, i) => {
    const f = F[i], alto = o.base + 0.95 * (o.alto - o.base);    // p95 de alturas uniformes entre base y copa (más un penacho arriba)
    assert.ok(Math.abs(f[0] - alto) < 0.4 && f[0] <= o.alto, "olivo " + i + ": altura_m " + f[0] + " frente a ≈ " + alto.toFixed(2));
    assert.ok(Math.abs(f[1] - 2 * 0.975 * o.radio) < 0.4, "olivo " + i + ": copa_m " + f[1] + " frente a ≈ " + (1.95 * o.radio).toFixed(2));
    const u = Math.max(o.base, 1.2, 0.35 * o.alto), base = u + 0.05 * (o.alto - u);   // p5 de los puntos de copa (h ≥ max(1,2, 0,35·hmax))
    assert.ok(Math.abs(f[5] - base) < 0.3, "olivo " + i + ": base_m " + f[5] + " frente a ≈ " + base.toFixed(2));
    assert.strictEqual(f[7], o.tronco ? 0 : 2, "olivo " + i + ": tronco por LiDAR si hay retornos de 0,3-1,2 m; si no, el centro (sin marcas)");
  });
});

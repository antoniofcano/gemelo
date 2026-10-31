"use strict";
// Constructor de olivos generados (ADR-0017, apps/web/olivo/, contratos/olivo-generado.md). Sin la referencia (que no se versiona):
//   - las huellas del módulo (receta olivo-2 y metadatos de niveles) = las del oráculo (pruebas/olivo/huellas-<GEN_VERSION>.json): 245 casos
//     (7 tipos × 7 épocas × 5 semillas) y 28 con semillas ≥ 2^31 (las de ids provisionales);
//   - si cambia el código del núcleo (nucleo.js, tipos.js, azar.js) sin subir GEN_VERSION, falla «sube GEN_VERSION»;
//   - montar la misma receta con three 0.128.0 y 0.186.1 da el mismo grupo (triángulos y huella de lo montado), en cada nivel;
//   - niveles de detalle: centenario 3 pies, envero, semilla 7 → E0 102 978, E1 23 080, E2 = E2-VR 10 702 triángulos (tarjetas de racimo, O9b);
//   - semillas, épocas y parámetros desde el registro; calibración de tuberia/parametros_copas.py con olivos generados (sintéticos);
//   - el módulo del motor 07ab_generados.js en Node (pruebas/olivo/generados_motor.mjs): materiales con el parche del motor y el fundido;
//   - la escalera (?olivos=escalera, y ?olivos=gen con variantes horneadas; 07ab + 07ac + 07b) en Node (pruebas/olivo/escalera_motor.mjs): reparto,
//     histéresis, nunca un olivo sin dibujar y cuándo 07b pasa a la escalera y aparta el tileset (O8c);
//   - en Chrome (si lo hay): el trabajador da la misma huella que el hilo principal, las rebanadas no pasan de 3 ms y el IIFE carga con r128.
// Sin `cd apps/web/olivo && npm i` (three-gen 0.128.0, three-r186 0.186.1, vite) se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { RAIZ, ejecuta, fs, path } = require("./_util");

const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const MODS = path.join(OLIVO, "node_modules");
const SALTO = ["three-gen", "three-r186", "vite"].every(d => fs.existsSync(path.join(MODS, d, "package.json"))) ? null
  : "apps/web/olivo sin instalar (cd apps/web/olivo && npm i): el constructor de olivos NO se ha comprobado";
const GEN_VERSION = /GEN_VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(OLIVO, "version.js"), "utf8"))[1];
const HUELLAS = path.join(RAIZ, "pruebas", "olivo", "huellas-" + GEN_VERSION + ".json");

function nodo(args) {
  return new Promise(ok => {
    const p = spawn(process.execPath, args, { cwd: RAIZ }); let out = "", err = "";
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d);
    p.on("close", status => ok({ status, out, err }));
  });
}
const json = r => { try { return JSON.parse(r.out.trim().split("\n").pop()); } catch (e) { return { error: r.out + r.err }; } };

test("hay huellas para la versión del generador (" + GEN_VERSION + ")", t => {
  if (SALTO) return t.skip(SALTO);
  assert.ok(fs.existsSync(HUELLAS), "no hay " + path.relative(RAIZ, HUELLAS) + ": si has subido GEN_VERSION, escribe sus huellas (contratos/olivo-generado.md §4)");
  const H = JSON.parse(fs.readFileSync(HUELLAS, "utf8"));
  assert.strictEqual(H.gen_version, GEN_VERSION);
  assert.strictEqual(H.casos.filter(c => !c.alta).length, 245, "7 tipos × 7 épocas × 5 semillas");
  assert.ok(H.casos.filter(c => c.alta && c.semilla >= 2 ** 31).length >= 14, "faltan casos con semilla ≥ 2^31");
});

test("si cambia el código del núcleo, sube GEN_VERSION", t => {
  if (SALTO) return t.skip(SALTO);
  const H = JSON.parse(fs.readFileSync(HUELLAS, "utf8"));
  const h = crypto.createHash("sha256");
  for (const f of ["azar.js", "nucleo.js", "tipos.js"]) h.update(f + "\n" + fs.readFileSync(path.join(OLIVO, f), "utf8").replace(/\r\n/g, "\n"));
  assert.strictEqual(h.digest("hex"), H.fuente_sha256, "nucleo.js, tipos.js o azar.js han cambiado y GEN_VERSION sigue en «" + GEN_VERSION +
    "»: sube GEN_VERSION (y escribe sus huellas) o, si el árbol NO cambia (p. ej. un comentario), vuelve a sellar con «node pruebas/olivo/compara.mjs --todos --sella»");
});

test("las huellas del módulo son las del oráculo (todos los casos, en 4 procesos)", { timeout: 600000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const partes = await Promise.all([0, 1, 2, 3].map(k => nodo([path.join("pruebas", "olivo", "compara.mjs"), "--todos", "--parte", k + "/4"])));
  const res = partes.map(json), casos = res.reduce((s, r) => s + (r.casos || 0), 0);
  for (const r of res) assert.ok(!r.error, r.error);
  assert.deepStrictEqual(res.flatMap(r => r.mal), [], "huellas distintas: si el árbol ha cambiado a propósito, sube GEN_VERSION");
  assert.strictEqual(casos, JSON.parse(fs.readFileSync(HUELLAS, "utf8")).casos.length);
  t.diagnostic("casos: " + casos + " · ms por árbol (Node, medio / máx.): " + res.map(r => r.ms_medio + "/" + r.ms_max).join(", "));
});

test("montar la misma receta con three 0.128.0 y 0.186.1 da el mismo grupo en cada nivel", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const r = json(await nodo([path.join("pruebas", "olivo", "montaje.mjs")]));
  assert.ok(!r.error, r.error);
  assert.deepStrictEqual(r.mal, []);
  for (const f of r.filas) assert.strictEqual(f["0.128.0"].revision + f["0.186.1"].revision, "128186");
  t.diagnostic(r.filas.map(f => f.tipo + " " + f.nivel + ": " + f.receta + " tri, " + f["0.128.0"].llamadas + " llamadas").join(" · "));
});

test("niveles de detalle: los recuentos y las tarjetas de racimo de E1/E2 (O9b)", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const r = json(await nodo([path.join("pruebas", "olivo", "niveles.mjs")]));
  assert.ok(!r.error, r.error);
  assert.deepStrictEqual(r.mal, []);
  assert.deepStrictEqual(Object.fromEntries(Object.entries(r.niveles).map(([k, v]) => [k, v.triangulos])), { E0: 102978, E1: 23080, E2: 10702, E2VR: 10702 });
});

test("motor (07ab, ?olivos=gen) en Node: sin la bandera nada; materiales con nubes, escarcha y fundido; lote con fundido; huella intacta", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const r = json(await nodo([path.join("pruebas", "olivo", "generados_motor.mjs")]));
  assert.ok(!r.error, r.error);
  assert.deepStrictEqual(r.mal, []);
  t.diagnostic("lote 1: " + JSON.stringify(r.diag.primero.info) + " · " + r.diag.ms + " ms");
});

test("escalera (ADR-0019, ?olivos=escalera y ?olivos=gen con variantes horneadas) en Node: reparto por presupuesto (escritorio, móvil, gafas), histéresis, nunca un olivo sin dibujar y el reparto de 07b (O8c)", { timeout: 600000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const r = json(await nodo([path.join("pruebas", "olivo", "escalera_motor.mjs")]));
  assert.ok(!r.error, r.error);
  assert.deepStrictEqual(r.mal, []);
  t.diagnostic("reparto: " + Object.entries(r.diag.reparto).map(([k, v]) => k + " " + v.E0 + "/" + v.E1 + "/" + (v.E2 + v.E2VR)).join(" · ") + " · fixture: " + JSON.stringify(r.diag.fixture && { pasos: r.diag.fixture.pasos, huecos: r.diag.fixture.huecos, llamadas: r.diag.fixture.maxLlamadas, ms: r.diag.fixture.ms }));
});

test("motor con ?olivos=escalera (O8c, ADR-0019): sin nivel 0 ni niveles 1-2, ≤ 8 llamadas de olivos, triángulos dentro del presupuesto y topes de fixture_olivos_escalera", { timeout: 1500000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const { motivoSalto, sirve, lanza, mide, ESCENARIOS } = require("./_navegador");
  const { montaPagina, saltoPagina } = require("./_pagina");
  const m = motivoSalto("la escalera de olivos en el motor") || saltoPagina("la escalera de olivos en el motor"); if (m) return t.skip(m);
  const pag = path.join(montaPagina({ finca: "hituelo", olivos: true }).carpeta, "index.html");   // el cliente web con el constructor empaquetado (Vite) y el tileset
  const T = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "presupuesto.json"), "utf8")).fixture_olivos_escalera;
  const s = await sirve(path.dirname(pag)), nav = await lanza();
  try {
    const r = await mide(nav, "http://127.0.0.1:" + s.address().port + "/index.html?olivos=escalera", { escenarios: ESCENARIOS });
    assert.deepStrictEqual(r.errores, [], "errores en la página con ?olivos=escalera");
    for (const [n, x] of Object.entries(r.medidas)) {
      const e = x.olivos.escalera;
      t.diagnostic(n + ": " + x.llamadas + " llamadas, " + x.triangulos + " tri, heap " + x.heapMB + " MB · escalera E0 " + e.E0 + " E1 " + e.E1 + " E2 " + e.E2 + " lejanos " + e.lejanos + " (" + e.lejanosModo + ") · olivos " + e.triOlivos + " tri / " + e.llamadasOlivos + " llamadas");
      assert.ok(e.activa, n + ": la escalera no está activa (" + e.estado + ")");
      assert.strictEqual(e.nivel0Mallas, 0, n + ": hay celdas de nivel 0 dibujadas");
      assert.strictEqual(e.instanciasN12, 0, n + ": hay instancias de los niveles 1-2");
      assert.ok(e.llamadasOlivos <= T.llamadas_olivos, n + ": " + e.llamadasOlivos + " llamadas de olivos (tope " + T.llamadas_olivos + ")");
      assert.ok(e.triOlivos - e.triSaliendo <= e.presupuesto + 30000, n + ": " + e.triOlivos + " tri de olivos sobre el presupuesto " + e.presupuesto);
      assert.strictEqual(e.sombraMap, false, n + ": el motor no activa renderer.shadowMap (si se activa, el coste de la escalera vuelve a doblarse: revisar costo())");
      const tp = T[n]; if (tp) for (const k of ["llamadas", "triangulos", "heapMB"]) assert.ok(x[k] <= tp[k], n + ": " + k + " " + x[k] + " > tope " + tp[k]);
    }
  } finally { await nav.close(); s.close(); }
});

test("caché de recetas (O5): clave estable y distinta por época, semilla y versión; LRU en memoria y en disco; sin IndexedDB, igual", { timeout: 120000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const r = json(await nodo([path.join("pruebas", "olivo", "cache.mjs")]));
  assert.ok(!r.error, r.error);
  assert.deepStrictEqual(r.mal, []);
  t.diagnostic("clave: " + r.diag.clave);
});

test("caché de recetas (O5): expulsar libera, invalidación por versión, fallos del almacén y propiedades (fast-check)", { timeout: 120000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const r = json(await nodo([path.join("pruebas", "olivo", "cache_props.mjs")]));
  assert.ok(!r.error, r.error);
  assert.deepStrictEqual(r.mal, []);
  t.diagnostic(JSON.stringify(r.diag));
});

test("semilla guardada (copas_semilla) y nombres de catálogo de los tipos", t => {
  if (SALTO) return t.skip(SALTO);
  const { python } = require("./_util");
  const prog = `
    const O = await import(${JSON.stringify("file:///" + path.join(OLIVO, "index.js").split(path.sep).join("/"))});
    console.log(JSON.stringify({ g: O.semillaDeCopa([0, 0, 4, [2,2,2,2,2,2,2,2], 1], 1234, null, 99), gp: O.semillaDeCopa([0, 0, 4, [2,2,2,2,2,2,2,2], 1], 2 ** 31 + 5, null, 99),
      nombres: O.NOMBRE_TIPO, ida: O.tipoDeNombre("olivos:centenario-3p"), tabla: O.tablaLocal() }));`;
  const r = ejecuta(process.execPath, ["--input-type=module", "-e", prog]);
  assert.strictEqual(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.deepStrictEqual(o.g, { semilla: 99, provisional: false, guardada: true }, "la semilla guardada manda sobre el id");
  assert.deepStrictEqual(o.gp, { semilla: 99, provisional: true, guardada: true });
  assert.strictEqual(o.ida, "centenario3");
  for (const n of Object.values(o.nombres)) assert.match(n, /^olivos:[a-z]+(-[0-9]p)?$/, "nombre de catálogo sin versión dentro: " + n);
  assert.strictEqual(o.tabla.length, 7);
  // tuberia/semillas_copas.py: mismo id → su semilla; id nuevo del censo en la misma posición → hereda; árbol nuevo → su id
  const py = python(); if (!py) return t.skip("sin Python: semillas_copas.py NO se ha comprobado");
  const pr = ejecuta(py, ["-I", "-c", [
    "import sys, json; sys.path.insert(0, 'tuberia'); from semillas_copas import semillas",
    "ant = {'copas': [[0,0],[10,0],[20,0]], 'copas_id': [2**31+1, 5, 2**31+3], 'copas_semilla': [2**31+1, 777, 2**31+3]}",
    "print(json.dumps(semillas([[0.4,0.3],[10,0],[40,0],[20.2,0]], [123, 5, 2**31+9, 2**31+3], ant)))"].join("\n")]);
  assert.strictEqual(pr.status, 0, pr.stderr);
  assert.deepStrictEqual(JSON.parse(pr.stdout), [2 ** 31 + 1, 777, 2 ** 31 + 9, 2 ** 31 + 3]);
});

test("tuberia/factores_campo.py: plantilla de 10 olivos y factores de campo sobre el fixture (datos sintéticos)", t => {
  const { python, fixture, propia } = require("./_util");
  const py = python(); if (!py) return t.skip("sin Python: factores_campo.py NO se ha comprobado");
  const fx = fixture({ sinTileset: true }), dir = propia("olivo-campo"), ind = path.join(fx, "hituelo", "indice.json"), I = JSON.parse(fs.readFileSync(ind, "utf8"));
  const pl = path.join(dir, "plantilla.csv");
  const r1 = ejecuta(py, ["-I", path.join("tuberia", "factores_campo.py"), "--plantilla", pl, "--indice", ind]);
  assert.strictEqual(r1.status, 0, r1.stderr);
  const lineas = fs.readFileSync(pl, "utf8").trim().split(/\r?\n/);
  assert.strictEqual(lineas[0], "id_provisional,utm_e,utm_n,altura_m,copa_ns_m,copa_eo_m,fecha,notas");
  assert.strictEqual(lineas.length, 11, "10 olivos");
  // campo sintético: altura = 1,1 × la del LiDAR; copa = 0,9 × la del LiDAR (que en el fixture es 2 × r8 medio)
  const sel = I.copas.map((c, i) => i).filter(i => I.copas_param[i]).slice(0, 10);
  const csv = ["id_provisional,utm_e,utm_n,altura_m,copa_ns_m,copa_eo_m,fecha,notas"].concat(sel.map(i => { const c = I.copas[i], p = I.copas_param[i];
    return [I.copas_id[i], (c[0] + I.centro_utm[0]).toFixed(2), (c[1] + I.centro_utm[1]).toFixed(2), (p[0] * 1.1).toFixed(3), (p[1] * 0.9).toFixed(3), (p[1] * 0.9).toFixed(3), "2026-10-29", "sintético"].join(","); }));
  const med = path.join(dir, "campo.csv"); fs.writeFileSync(med, csv.join("\n") + "\n");
  const r2 = ejecuta(py, ["-I", path.join("tuberia", "factores_campo.py"), "--medidas", med, "--indice", ind]);
  assert.strictEqual(r2.status, 0, r2.stderr);
  const F = JSON.parse(r2.stdout.trim().split("\n").pop());
  assert.strictEqual(F.olivos, 10);
  assert.ok(Math.abs(F.factor_altura - 1.1) < 0.01 && Math.abs(F.factor_copa - 0.9) < 0.01, JSON.stringify(F));
  assert.strictEqual(F.r8_es, "radio", "copa de campo ≈ 2 × r8 medio → r8 es radio");
});

test("semillas, épocas y parámetros desde el registro", t => {
  if (SALTO) return t.skip(SALTO);
  const prog = `
    const O = await import(${JSON.stringify("file:///" + path.join(OLIVO, "index.js").split(path.sep).join("/"))});
    const out = {
      id: O.semillaDeCopa([1, 2, 4, [2,2,2,2,2,2,2,2], 1], 1234),
      prov: O.semillaDeCopa([10.04, -3.0, 4, [2,2,2,2,2,2,2,2], 1], -1, [400000, 4200000]),
      prov2: O.semillaDeCopa([10.04, -3.0, 4, [2,2,2,2,2,2,2,2], 1], undefined, [400000, 4200000]),
      provId: O.semillaDeCopa([0, 0, 4, [2,2,2,2,2,2,2,2], 1], 2 ** 31 + 77),
      sinNada: O.semillaDeCopa([0, 0, 4, [2,2,2,2,2,2,2,2], 1], -1),
      bbch: [0, 50, 57, 65, 71, 75, 81, 89, 99].map(O.bbchAEpoca),
      sinParam: O.parametrosDeCopa([0, 0, 4.4, [2,2,2,2,3,3,3,3], 1], null, null),
      sinParam1: O.parametrosDeCopa([0, 0, 4.4, [2,2,2,2,3,3,3,3], 1], null, null, { factorR8: 1 }),
      conParam: O.parametrosDeCopa([0, 0, 4.4, [2,2,2,2,3,3,3,3], 1], [4.6, 8.2, 0.9, 92, 0.8, 1.2, 0.3, 0], "centenario2"),
      tipos: Object.keys(O.TIPOS).map(k => [k, O.ID_TIPO[k], O.tipoDeId(O.ID_TIPO[k])]),
    };
    console.log(JSON.stringify(out));`;
  const r = ejecuta(process.execPath, ["--input-type=module", "-e", prog]);
  assert.strictEqual(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  assert.deepStrictEqual(o.id, { semilla: 1234, provisional: false });
  assert.ok(o.prov.provisional && o.prov.semilla >= 2 ** 31 && o.prov.semilla < 2 ** 32, "semilla provisional en 2^31 … 2^32 − 1");
  assert.deepStrictEqual(o.prov, o.prov2, "la semilla provisional depende solo de la posición");
  // el mismo id provisional que tuberia/ids_copas.py: 2^31 + (E_m mod 32768)·65536 + (N_m mod 65536); E 400010,04 → 400010, N 4199997,00 → 4199997
  assert.strictEqual(o.prov.semilla, 2 ** 31 + (400010 % 32768) * 65536 + (4199997 % 65536));
  assert.deepStrictEqual(o.provId, { semilla: 2 ** 31 + 77, provisional: true }, "un copas_id provisional (≥ 2^31) es la semilla y se marca");
  assert.strictEqual(o.sinNada, null, "sin id ni centro_utm no hay semilla estable");
  assert.deepStrictEqual(o.bbch, ["reposo", "reposo", "boton", "flor", "cuajado", "verde", "envero", "madura", "madura"]);
  assert.deepStrictEqual(o.sinParam.parametros, { altura: 4.4, copa: 2.5 }, "sin copas_param: altura = h y copa = 2 × r8 medio × factorR8 (0,5 por defecto, como el motor)");
  assert.deepStrictEqual(o.sinParam1.parametros, { altura: 4.4, copa: 5 }, "con factorR8 = 1, la copa a su radio medido");
  assert.strictEqual(o.conParam.tipo, "centenario2");
  assert.deepStrictEqual(Object.keys(o.conParam.parametros).sort(), ["altura", "asim", "copa", "densidad", "falda", "relieve", "rumbo"]);
  assert.strictEqual(o.conParam.parametros.rumbo, 90);
  assert.ok(Math.abs(o.conParam.parametros.asim - Math.min(0.6, 0.9 / 4.1 * 1.8)) < 1e-12);
  assert.strictEqual(o.conParam.origen.asim, "deducido"); assert.strictEqual(o.conParam.origen.altura, "medido");
  o.tipos.forEach(([k, id, k2]) => assert.strictEqual(k, k2, "id de tipo " + id));
});

test("calibración de tuberia/parametros_copas.py con olivos generados (datos sintéticos)", { timeout: 600000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const r = json(await nodo([path.join("pruebas", "olivo", "calibracion.mjs")]));
  if (r.salto) return t.skip(r.salto + ": la calibración NO se ha comprobado");
  assert.ok(!r.error, r.error);
  t.diagnostic("k = " + JSON.stringify(r.errores.k) + " · error tras k: altura " + r.errores.altura_m.medio + "/" + r.errores.altura_m.max + " m, copa " + r.errores.copa_m.medio + "/" +
    r.errores.copa_m.max + " m · rumbo " + r.errores.rumbo_gr.medio + "/" + r.errores.rumbo_gr.max + "° · asimetría " + r.errores.asim.medio + "/" + r.errores.asim.max + " (medio/máx.)");
  assert.deepStrictEqual(r.mal, []);
});

test("en Chrome: herramienta con three 0.128 y 0.186, trabajador = hilo principal, rebanadas ≤ 3 ms e IIFE con r128", { timeout: 900000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const { motivoSalto } = require("./_navegador");
  const m = motivoSalto("el constructor de olivos en el navegador"); if (m) return t.skip(m);
  const { propia } = require("./_util");
  const dist = propia("olivo-herramienta"), iife = propia("olivo-iife"), vite = path.join(MODS, "vite", "bin", "vite.js");
  const b1 = ejecuta(process.execPath, [vite, "build"], { cwd: OLIVO, env: Object.assign({}, process.env, { GEMELO_OLIVO_SALIDA: dist }) });
  assert.strictEqual(b1.status, 0, "vite build de la herramienta: " + b1.stdout + b1.stderr);
  const b2 = ejecuta(process.execPath, [path.join("herramientas", "iife.mjs"), "--salida", iife], { cwd: OLIVO });
  assert.strictEqual(b2.status, 0, "IIFE: " + b2.stdout + b2.stderr);
  const peso = JSON.parse(b2.stdout.trim().split("\n").pop());
  // los tiempos dependen de la carga de la máquina: hasta 3 intentos; la corrección (estructura y huellas) tiene que salir en todos
  let r = null;
  for (let k = 0; k < 3; k++) {
    r = json(await nodo([path.join("pruebas", "olivo", "navegador.mjs"), dist, iife]));
    assert.ok(!r.error, r.error);
    assert.deepStrictEqual((r.mal || []).filter(x => !/bloqueó|rebanada de/.test(x)), []);
    if (!r.mal.length) break;
  }
  t.diagnostic("IIFE: " + peso.bytes + " B (" + peso.gzip + " B gzip) · trabajador: hueco máx. " + r.trabajador.huecoMax + " ms (en reposo " + r.trabajador.huecoEnReposo + "), " + r.trabajador.ms.join("/") + " ms · rebanadas: máx. " +
    r.rebanadas.rebanadaMax + " ms, p95 " + r.rebanadas.rebanadaP95 + " ms, p99 " + r.rebanadas.rebanadaP99 + " ms, " + r.rebanadas.ms.join("/") + " ms · hilo de una vez: " + r.hiloPrincipal.ms.join("/") +
    " ms · heap " + r.heapMB.join("→") + " MB · huellas exactas como Node: " + r.exactasComoNode);
  assert.deepStrictEqual(r.mal, [], "tiempos fuera de tope en 3 intentos (¿máquina cargada?)");
});

test("motor con ?olivos=gen (P7, decisión 52): el fixture de Hituelo dibuja olivos generados en un lote de ≤ 7 llamadas y dentro de sus topes", { timeout: 1200000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const { motivoSalto } = require("./_navegador");
  const { montaPagina, saltoPagina } = require("./_pagina");
  const m = motivoSalto("los olivos generados en el motor") || saltoPagina("los olivos generados en el motor"); if (m) return t.skip(m);
  const pag = path.join(montaPagina({ finca: "hituelo", olivos: true }).carpeta, "index.html");   // el cliente web con el constructor empaquetado (Vite) y el tileset
  const r = json(await nodo([path.join("pruebas", "olivo", "p7_medidas.mjs"), pag, "--rapido"]));
  assert.ok(!r.error, r.error);
  assert.deepStrictEqual(r.errores.con, [], "errores en la página con ?olivos=gen");
  const c = r.con.cerca, T = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "presupuesto.json"), "utf8")).fixture_olivos_gen.cerca;
  t.diagnostic("cerca con ?olivos=gen: " + c.llamadas + " llamadas, " + c.triangulos + " tri, heap " + c.heapMB + " MB · lote: " + JSON.stringify(c.gen.info) + " · vía " + c.gen.via);
  assert.strictEqual(c.gen.estado, "activo", "Generados no arrancó: " + c.gen.motivo);
  assert.ok(c.gen.info.arboles > 0, "no se dibuja ningún olivo generado");
  assert.ok(c.gen.info.llamadas <= T.llamadas_lote, "el lote tiene " + c.gen.info.llamadas + " mallas (tope " + T.llamadas_lote + ")");
  for (const k of ["llamadas", "triangulos", "puntos", "heapMB"]) assert.ok(c[k] <= T[k], k + " " + c[k] + " > tope " + T[k]);
});

"use strict";
// Constructor de olivos generados (ADR-0017, apps/web/olivo/, contratos/olivo-generado.md). Sin la referencia (que no se versiona):
//   - las huellas del módulo (receta olivo-2 y metadatos de niveles) = las del oráculo (pruebas/olivo/huellas-<GEN_VERSION>.json): 245 casos
//     (7 tipos × 7 épocas × 5 semillas) y 28 con semillas ≥ 2^31 (las de ids provisionales);
//   - si cambia el código del núcleo (nucleo.js, tipos.js, azar.js) sin subir GEN_VERSION, falla «sube GEN_VERSION»;
//   - montar la misma receta con three 0.128.0 y 0.186.1 da el mismo grupo (triángulos y huella de lo montado), en cada nivel;
//   - niveles de detalle: centenario 3 pies, envero, semilla 7 → E0 102 978, E1 48 378, E2 19 366, E2-VR 14 618 triángulos; aclareo al 50 %;
//   - semillas, épocas y parámetros desde el registro; calibración de tuberia/parametros_copas.py con olivos generados (sintéticos);
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

test("niveles de detalle: los recuentos de la maqueta y el aclareo al 50 %", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const r = json(await nodo([path.join("pruebas", "olivo", "niveles.mjs")]));
  assert.ok(!r.error, r.error);
  assert.deepStrictEqual(r.mal, []);
  assert.deepStrictEqual(Object.fromEntries(Object.entries(r.niveles).map(([k, v]) => [k, v.triangulos])), { E0: 102978, E1: 48378, E2: 19366, E2VR: 14618 });
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
  assert.deepStrictEqual(o.sinParam.parametros, { altura: 4.4, copa: 5 }, "sin copas_param: altura = h y copa = 2 × radio medio de r8");
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

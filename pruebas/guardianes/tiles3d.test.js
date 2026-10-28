"use strict";
// Prototipo F1d (ADR-0015, Propuesto): la tubería tuberia/tiles3d/ genera del fixture sintético un tileset 3D Tiles 1.1 válido, con
// geometricError decreciente, glb válidos (cabecera, chunks, accessors), olivos como instancias GPU que salen del registro, el marco
// local de siempre y un presupuesto de triángulos por nivel. Si está el visor (tuberia/tiles3d/visor), lo carga en Chrome headless
// + SwiftShader y mide llamadas, triángulos y memoria (NUNCA fps). Sin dependencias instaladas se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, propia, python, fixture, ejecuta, fs, path } = require("./_util");
const { sirve, motivoSalto, lanza } = require("./_navegador");

const T3D = path.join(RAIZ, "tuberia", "tiles3d"), VISOR = path.join(T3D, "visor");
const MODS = path.join(T3D, "node_modules"), DEPS = ["@gltf-transform/core", "@gltf-transform/extensions", "@gltf-transform/functions", "meshoptimizer", "proj4", "sharp", "three"];
const falta = DEPS.filter(d => !fs.existsSync(path.join(MODS, d, "package.json")));
const SALTO = falta.length ? "faltan dependencias de tuberia/tiles3d (" + falta.join(", ") + "; cd tuberia/tiles3d && npm i): 3D Tiles NO se ha comprobado"
  : !python() ? "falta Python 3 para generar el fixture: 3D Tiles NO se ha comprobado" : null;
const VALIDADOR = path.join(MODS, "3d-tiles-validator");
const VITE = path.join(VISOR, "node_modules", "vite", "bin", "vite.js");
const SALTO_VISOR = SALTO || (!fs.existsSync(VITE) || !fs.existsSync(path.join(VISOR, "node_modules", "3d-tiles-renderer")) ? "visor sin instalar (cd tuberia/tiles3d/visor && npm i): el visor 3D Tiles NO se ha comprobado" : motivoSalto("el visor 3D Tiles"));
const TOPES = JSON.parse(fs.readFileSync(path.join(T3D, "presupuesto.json"), "utf8"));
const MIDE = !!process.env.GEMELO_MIDE;

let FIX, SAL, TS, RES, I, R, marco, gltf;
const recorre = (t, f, padre = null, prof = 0) => { f(t, padre, prof); (t.children || []).forEach(h => recorre(h, f, t, prof + 1)); };
const imp = f => import(pathToFileURL(f).href);

test.before(async () => {
  if (SALTO) return;
  FIX = fixture(); SAL = propia("tiles3d");
  const g = ejecuta(process.execPath, [path.join(T3D, "genera.mjs"), "--entrada", path.join(FIX, "hituelo"), "--salida", SAL]);
  assert.strictEqual(g.status, 0, "genera.mjs falló:\n" + g.stdout + g.stderr);
  TS = JSON.parse(fs.readFileSync(path.join(SAL, "tileset.json"), "utf8"));
  RES = JSON.parse(fs.readFileSync(path.join(SAL, "resumen.json"), "utf8"));
  const gen = await imp(path.join(T3D, "genera.mjs")), c = gen.leeContrato(path.join(FIX, "hituelo"));
  I = c.I; R = gen.relieve(c.I, c.teselas);
  marco = await imp(path.join(T3D, "marco.mjs"));
  const req = m => require(require.resolve(m, { paths: [T3D] }));
  gltf = { core: req("@gltf-transform/core"), ext: req("@gltf-transform/extensions") };
});

test("tileset.json: 3D Tiles 1.1, raíz con refine y transform, geometricError estrictamente decreciente y hojas casi a 0", t => {
  if (SALTO) return t.skip(SALTO);
  assert.strictEqual(TS.asset.version, "1.1");
  assert.ok(["REPLACE", "ADD"].includes(TS.root.refine), "la raíz necesita refine");
  assert.strictEqual(TS.root.transform.length, 16);
  assert.ok(TS.geometricError > TS.root.geometricError, "el geometricError del tileset debe superar al de la raíz");
  let hojas = 0;
  recorre(TS.root, (n, p) => {
    assert.strictEqual(n.boundingVolume.box.length, 12, "caja de 12 números");
    if (p) {
      assert.ok(n.geometricError < p.geometricError, n.content.uri + ": geometricError " + n.geometricError + " no menor que el del padre " + p.geometricError);
      const [cx, cy, , hx] = n.boundingVolume.box, [px, py, , phx] = p.boundingVolume.box;
      assert.ok(Math.abs(cx - px) + hx <= phx + 1e-6 && Math.abs(cy - py) + hx <= phx + 1e-6, n.content.uri + ": su caja se sale de la del padre");
    }
    if (!n.children) { hojas++; assert.ok(n.geometricError <= 0.1, n.content.uri + ": una hoja con geometricError " + n.geometricError); }
  });
  assert.ok(hojas >= 1);
});

test("cada contenido existe y es un glb válido: cabecera, chunks JSON y BIN, accessors dentro de su buffer e índices en rango", async t => {
  if (SALTO) return t.skip(SALTO);
  const uris = []; recorre(TS.root, n => uris.push(n.content.uri));
  assert.strictEqual(uris.length, RES.teselas.length);
  const io = new gltf.core.NodeIO().registerExtensions([gltf.ext.EXTMeshGPUInstancing]);
  for (const u of uris) {
    const f = path.join(SAL, u); assert.ok(fs.existsSync(f), "falta " + u);
    const b = fs.readFileSync(f);
    assert.strictEqual(b.readUInt32LE(0), 0x46546c67, u + ": magia «glTF»"); assert.strictEqual(b.readUInt32LE(4), 2, u + ": versión 2"); assert.strictEqual(b.readUInt32LE(8), b.length, u + ": longitud");
    const lj = b.readUInt32LE(12); assert.strictEqual(b.readUInt32LE(16), 0x4e4f534a, u + ": primer chunk JSON");
    const j = JSON.parse(b.subarray(20, 20 + lj).toString("utf8")), ob = 20 + lj, lb = b.readUInt32LE(ob);
    assert.strictEqual(b.readUInt32LE(ob + 4), 0x004e4942, u + ": segundo chunk BIN"); assert.ok(lj % 4 === 0 && lb % 4 === 0, u + ": chunks alineados a 4");
    for (const [k, a] of j.accessors.entries()) {
      const v = j.bufferViews[a.bufferView], tam = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type] * { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
      assert.ok((v.byteOffset || 0) + (a.byteOffset || 0) + a.count * (v.byteStride || tam) <= lb && (v.byteOffset || 0) + v.byteLength <= lb, u + ": accessor " + k + " se sale del BIN");
    }
    const doc = await io.readBinary(new Uint8Array(b));
    for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
      const ix = p.getIndices().getArray(), nv = p.getAttribute("POSITION").getCount();
      assert.ok(Math.max(...ix) < nv, u + ": índice fuera de rango"); assert.ok(p.getAttribute("POSITION").getMin([]).length === 3, u + ": POSITION sin min/max");
    }
    if (j.extensionsUsed && j.extensionsUsed.includes("EXT_mesh_gpu_instancing")) assert.ok((j.extensionsRequired || []).includes("EXT_mesh_gpu_instancing"), u + ": la extensión de instancias debe ser requerida");
  }
});

test("validador oficial de CesiumGS (3d-tiles-validator, que valida también los glb): 0 errores y 0 avisos", { timeout: 120000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!fs.existsSync(path.join(VALIDADOR, "package.json"))) return t.skip("3d-tiles-validator no instalado (devDependency de tuberia/tiles3d): validación oficial NO hecha");
  // en su propio proceso: trae sharp 0.32 y la tubería sharp 0.35; dos libvips en un proceso dan avisos de GLib
  const prog = "require(process.argv[1]).Validators.validateTilesetFile(process.argv[2]).then(r => process.stdout.write(JSON.stringify(r.toJson())))";
  const v = ejecuta(process.execPath, ["-e", prog, VALIDADOR, path.join(SAL, "tileset.json")]);
  assert.strictEqual(v.status, 0, "3d-tiles-validator falló:\n" + v.stderr);
  const r = JSON.parse(v.stdout);
  const malos = r.issues.flatMap(function aplana(i) { return [i].concat((i.causes || []).flatMap(aplana)); }).filter(i => i.severity === "ERROR" || i.severity === "WARNING").filter(i => !(i.causes || []).length);
  if (MIDE) t.diagnostic("validador: " + r.numErrors + " errores, " + r.numWarnings + " avisos, " + r.numInfos + " informativos (EXT_mesh_gpu_instancing no lo valida: lo dice como INFO)");
  assert.deepStrictEqual(malos.map(i => i.path + ": " + i.message), []);
});

test("los olivos son instancias GPU que salen del registro: id, posición sobre el relieve, giro y escala de la copa medida", async t => {
  if (SALTO) return t.skip(SALTO);
  const io = new gltf.core.NodeIO().registerExtensions([gltf.ext.EXTMeshGPUInstancing]), vistos = new Set();
  for (const f of RES.teselas.filter(f => f.olivos)) {
    const doc = await io.readBinary(new Uint8Array(fs.readFileSync(path.join(SAL, f.uri))));
    const nodos = doc.getRoot().listNodes().filter(n => n.getExtension("EXT_mesh_gpu_instancing"));
    assert.strictEqual(nodos.length, 1, f.uri + ": un nodo instanciado (tipo genérico −1)");
    const ex = nodos[0].getExtension("EXT_mesh_gpu_instancing"), A = k => ex.getAttribute(k);
    const n = A("TRANSLATION").getCount();
    assert.strictEqual(n, f.olivos);
    for (const k of ["ROTATION", "SCALE", "_COLOR_0", "_ID_ARBOL", "_TIPO"]) assert.strictEqual(A(k).getCount(), n, f.uri + ": " + k + " con otro número de instancias");
    for (let i = 0; i < n; i++) {
      const id = A("_ID_ARBOL").getScalar(i), c = I.copas[id], p = A("TRANSLATION").getElement(i, []), s = A("SCALE").getElement(i, []);
      assert.ok(Math.abs(p[0] - c[0]) < 1e-3 && Math.abs(p[2] + c[1]) < 1e-3, f.uri + ": olivo " + id + " fuera de su sitio");
      assert.ok(Math.abs(p[1] - R.H(c[0], c[1])) < 1e-3, f.uri + ": olivo " + id + " no está sobre el relieve");
      assert.ok(Math.abs(s[1] - c[2]) < 1e-4, f.uri + ": la altura de la instancia no es la del registro");
      assert.strictEqual(A("_TIPO").getScalar(i), -1);
      if (f.nivel === RES.niveles.length - 1) vistos.add(id);
    }
  }
  assert.strictEqual(vistos.size, RES.olivos, "en las hojas debe estar cada olivo una vez");
});

test("marco: la raíz georreferencia el marco local (UTM 30N − centro_utm) en ECEF con error < 2 cm en planta a 1,3 km; el GPS cae en el mismo marco", t => {
  if (SALTO) return t.skip(SALTO);
  const [CX, CY] = I.centro_utm, M = TS.root.transform, info = [];
  for (const [dx, dy, dz] of [[0, 0, 0], [1300, 0, 0], [0, -1300, 5], [-1300, 1300, 50], [-200, -130, 4]]) {
    const q = marco.deEcef(...marco.aplica(M, [dx, dy, dz])), u = marco.aUtm(q.lat, q.lon);
    const eh = Math.hypot(u.E - CX - dx, u.N - CY - dy), ev = q.h - I.z0 - dz;
    info.push(dx + "," + dy + ": " + (eh * 100).toFixed(1) + " cm en planta, " + (ev * 100).toFixed(1) + " cm en altura");
    assert.ok(eh < 0.02, "planta: " + eh + " m en " + dx + "," + dy);
    assert.ok(ev > -0.01 && ev < 0.35, "altura: " + ev + " m (la curvatura del plano tangente sube ~d²/2R)");
    const g = marco.deUtm(CX + dx, CY + dy), e = marco.gpsAEscena(g.lat, g.lon, I.centro_utm, I.z0);
    assert.ok(Math.abs(e.x - dx) < 1e-3 && Math.abs(e.y - dy) < 1e-3, "GPS → escena no devuelve el mismo punto");
  }
  if (MIDE) t.diagnostic(info.join(" · "));
  const o = TS.extras.gemelo.origen_geodesico, u = marco.aUtm(o.lat, o.lon);
  assert.ok(Math.hypot(u.E - CX, u.N - CY) < 1e-3, "origen_geodesico no es centro_utm");
});

test("presupuesto de triángulos por tesela y por nivel (topes en tuberia/tiles3d/presupuesto.json)", async t => {
  if (SALTO) return t.skip(SALTO);
  const io = new gltf.core.NodeIO().registerExtensions([gltf.ext.EXTMeshGPUInstancing]), por = [];
  for (const f of RES.teselas) {
    const doc = await io.readBinary(new Uint8Array(fs.readFileSync(path.join(SAL, f.uri))));
    let tri = 0;
    for (const n of doc.getRoot().listNodes()) if (n.getMesh()) {
      const ex = n.getExtension("EXT_mesh_gpu_instancing"), k = ex ? ex.getAttribute("TRANSLATION").getCount() : 1;
      for (const p of n.getMesh().listPrimitives()) tri += p.getIndices().getCount() / 3 * k;
    }
    assert.strictEqual(tri, f.tri_terreno + f.tri_olivos, f.uri + ": resumen.json no cuadra con el glb");
    assert.ok(tri <= TOPES.tesela.triangulos && f.tri_terreno <= TOPES.tesela.tri_terreno && f.bytes <= TOPES.tesela.bytes, f.uri + ": " + tri + " tri, " + f.bytes + " B");
    (por[f.nivel] = por[f.nivel] || { teselas: 0, triangulos: 0, bytes: 0 }); por[f.nivel].teselas++; por[f.nivel].triangulos += tri; por[f.nivel].bytes += f.bytes;
  }
  for (const [k, v] of Object.entries(TS.extras.gemelo.prototipos)) assert.ok(v <= TOPES.tesela.prototipos[k], k + ": " + v + " tri");
  if (MIDE) t.diagnostic(por.map((n, i) => "nivel " + i + ": " + n.teselas + " teselas, " + n.triangulos + " tri, " + n.bytes + " B").join(" · "));
  assert.strictEqual(por.length, TOPES.fixture.niveles.length, "otro número de niveles");
  por.forEach((n, i) => {
    const tope = TOPES.fixture.niveles[i];
    assert.strictEqual(n.teselas, tope.teselas, "nivel " + i + ": teselas");
    assert.ok(n.triangulos <= tope.triangulos && n.bytes <= tope.bytes, "nivel " + i + ": " + n.triangulos + " tri y " + n.bytes + " B superan " + JSON.stringify(tope));
  });
});

test("visor (3DTilesRendererJS + three moderno, SwiftShader): carga sin errores, el marco coincide con el del motor y cabe en su presupuesto", { timeout: 300000 }, async t => {
  if (SALTO_VISOR) return t.skip(SALTO_VISOR);
  const web = propia("tiles3d-visor");
  const b = ejecuta(process.execPath, [VITE, "build"], { cwd: VISOR, env: Object.assign({}, process.env, { GEMELO_T3D_SALIDA: web }) });
  assert.strictEqual(b.status, 0, "vite build falló:\n" + b.stdout + b.stderr);
  fs.cpSync(SAL, path.join(web, "tileset"), { recursive: true });
  const three = JSON.parse(fs.readFileSync(path.join(VISOR, "node_modules", "three", "package.json"), "utf8")).version;
  assert.ok(Number(three.split(".")[1]) >= 167, "three " + three + " < 0.167");
  const srv = await sirve(web), nav = await lanza(), base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  try {
    for (const escena of ["lejos", "cerca"]) {
      const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [], fallos = [];
      p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
      // errores: ninguno. Avisos: solo los conocidos (los de rendimiento del driver de SwiftShader y el de 3DTilesRendererJS 0.5.3
      // «tiles versions at 1.1 or higher have limited support», que sale con CUALQUIER tileset 1.1: ver TILES3D.md, riesgos)
      const CONOCIDOS = [/GL Driver Message/, /tiles versions at 1\.1 or higher have limited support/];
      p.on("console", m => { const s = m.text(); if (m.type() === "error" || (m.type() === "warning" && !CONOCIDOS.some(re => re.test(s)))) errores.push(m.type() + " " + s.slice(0, 300)); });
      p.on("requestfailed", r => fallos.push(r.url())); p.on("response", r => { if (r.status() >= 400) fallos.push(r.status() + " " + r.url()); });
      await p.goto(base + "?escena=" + escena);
      await p.waitForFunction(() => window.__t3d && window.__t3d.listo(), null, { timeout: 60000, polling: 250 });
      await p.waitForTimeout(800);
      await p.waitForFunction(() => window.__t3d.listo(), null, { timeout: 60000, polling: 250 });
      const m = await p.evaluate(() => window.__t3d.mide()), ins = await p.evaluate(() => window.__t3d.instancias(20));
      if (MIDE) t.diagnostic(escena + ": " + JSON.stringify(m));
      assert.deepStrictEqual(errores, [], escena + ": errores o avisos en consola");
      assert.deepStrictEqual(fallos, [], escena + ": peticiones fallidas");
      assert.strictEqual(m.fallos, 0); assert.ok(m.visibles.length > 0, escena + ": ninguna tesela visible");
      const tope = TOPES.visor[escena];
      assert.ok(m.llamadas <= tope.llamadas && m.triangulos <= tope.triangulos && m.heapMB <= tope.heapMB, escena + ": " + JSON.stringify(m) + " supera " + JSON.stringify(tope));
      // el marco: cada olivo dibujado está en (x, H(x, y), −y) del registro, como en la escena del motor de hoy
      assert.ok(ins.length > 0, escena + ": sin olivos dibujados");
      for (const o of ins) { const c = I.copas[o.id]; assert.ok(Math.hypot(o.pos[0] - c[0], o.pos[2] + c[1]) < 0.01 && Math.abs(o.pos[1] - R.H(c[0], c[1])) < 0.01, escena + ": olivo " + o.id + " en " + o.pos + ", esperado " + [c[0], R.H(c[0], c[1]), -c[1]]); }
      // y el terreno visible pasa por el relieve con el error que declara su tesela
      const geMax = Math.max(...RES.teselas.filter(f => m.visibles.includes(f.uri)).map(f => f.error_rejilla + f.error_simplificacion));
      for (const [x, y] of [[-130, -125], [-60, -100], [100, -180]]) {
        const h = await p.evaluate(([x, y]) => window.__t3d.alturaEn(x, y), [x, y]);
        if (h === null) continue;
        assert.ok(Math.abs(h - R.H(x, y)) <= geMax + 0.02, escena + ": terreno en " + x + "," + y + " a " + h + " m; relieve " + R.H(x, y) + " (error declarado " + geMax + ")");
      }
      await p.close();
    }
  } finally { await nav.close(); srv.close(); }
});

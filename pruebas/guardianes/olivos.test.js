"use strict";
// Catálogo de olivos-tipo (ADR-0012, contratos/olivos-tipo.md): el catálogo sintético de modelos/olivos/fixture/ cumple el esquema (ajv), cada glb pasa el
// validador oficial de Khronos (gltf-validator) y las reglas del contrato (metros, +Y, pivote en la base del tronco, sin luces ni cámaras, un material por
// pieza; leído con @gltf-transform/core) y su presupuesto de triángulos por nivel, y el generador da los mismos bytes. En Chrome (si lo hay): con el
// catálogo vacío no cambia nada; al instalarlo con un cargador inyectado (el GLTFLoader de la misma three, como módulo) los olivos de tipo 0 se dibujan con su modelo;
// al retirarlo, se vuelve a lo de antes.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, propia, python, fixture, ejecuta, lee, fs, path } = require("./_util");
const { sirve, motivoSalto, lanza, ESCENARIOS } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");
const Ajv2020 = require("ajv/dist/2020").default, validador = require("gltf-validator"), { NodeIO, getBounds } = require("@gltf-transform/core");

const ESQ = JSON.parse(lee("contratos/olivos-tipo.schema.json")), PRES = ESQ.presupuesto_tri;
const DIR = path.join(RAIZ, "modelos", "olivos", "fixture"), CAT = JSON.parse(fs.readFileSync(path.join(DIR, "catalogo.json"), "utf8"));
const tope = nv => Math.floor(PRES.objetivo[nv] * (1 + PRES.tolerancia));

test("el catálogo sintético cumple contratos/olivos-tipo.schema.json (ajv) y sus ids de tipo son únicos", () => {
  const ajv = new Ajv2020({ allErrors: true }); ajv.addVocabulary(["presupuesto_tri"]);
  const ok = ajv.validate(ESQ, CAT);
  assert.ok(ok, ajv.errorsText(ajv.errors));
  const ids = CAT.tipos.map(t => t.id);
  assert.strictEqual(new Set(ids).size, ids.length, "id de tipo repetido");
});

for (const tp of CAT.tipos) for (const [nv, d] of Object.entries(tp.niveles)) {
  test("tipo " + tp.id + " " + nv + " (" + d.glb + "): glb válido, reglas del contrato y presupuesto de triángulos (tope " + tope(nv) + ")", async () => {
    const f = path.join(DIR, d.glb);
    assert.ok(fs.existsSync(f), "no existe " + d.glb);
    const bytes = new Uint8Array(fs.readFileSync(f));
    const inf = await validador.validateBytes(bytes, { uri: d.glb, format: "glb" });
    assert.strictEqual(inf.issues.numErrors, 0, "gltf-validator: " + JSON.stringify(inf.issues.messages.slice(0, 5)));
    assert.strictEqual(inf.issues.numWarnings, 0, "gltf-validator (avisos): " + JSON.stringify(inf.issues.messages.slice(0, 5)));
    const I = inf.info;
    assert.deepStrictEqual(I.extensionsUsed || [], [], "sin extensiones (ni luces KHR_lights_punctual, ni compresión que pida un decodificador)");
    assert.ok(!I.animationCount && !I.hasSkins && !I.hasMorphTargets && !I.hasTextures, "sin animaciones, esqueletos, morph ni texturas (v1)");
    const doc = await new NodeIO().readBinary(bytes), raiz = doc.getRoot();
    assert.strictEqual(raiz.listCameras().length, 0, "sin cámaras");
    const nodos = raiz.listNodes(), mallas = raiz.listMeshes();
    nodos.forEach(n => {
      assert.ok(n.getMesh() && !n.getCamera() && n.listChildren().length === 0, "nodo «" + n.getName() + "»: una pieza = un nodo con su malla, sin hijos");
      assert.deepStrictEqual([n.getTranslation(), n.getRotation(), n.getScale()], [[0, 0, 0], [0, 0, 0, 1], [1, 1, 1]], "nodo «" + n.getName() + "» con transformación: el pivote y la escala van en la geometría");
    });
    assert.deepStrictEqual(nodos.map(n => n.getName()), d.piezas, "las piezas del glb no son las del catálogo");
    assert.ok(mallas.length <= PRES.piezas_max[nv], nv + ": más de " + PRES.piezas_max[nv] + " piezas (cada pieza es una llamada de dibujo por tipo)");
    mallas.forEach(m => {
      assert.strictEqual(m.listPrimitives().length, 1, m.getName() + ": una sola primitiva");
      const pr = m.listPrimitives()[0];
      assert.strictEqual(pr.getMode(), 4, m.getName() + ": solo triángulos");
      assert.ok(pr.getMaterial(), m.getName() + ": sin material (una pieza, un material)");
      assert.ok(pr.getIndices(), m.getName() + ": sin índices");
    });
    assert.strictEqual(I.totalTriangleCount, d.triangulos, "el catálogo declara " + d.triangulos + " triángulos y el glb tiene " + I.totalTriangleCount);
    assert.ok(I.totalTriangleCount <= tope(nv), nv + ": " + I.totalTriangleCount + " triángulos > tope " + tope(nv) + " (objetivo " + PRES.objetivo[nv] + ")");
    // metros y pivote: la base del tronco en (0, 0, 0), +Y arriba, del tamaño que dice el catálogo
    const { min, max } = getBounds(raiz.getDefaultScene()), ancho = Math.max(max[0] - min[0], max[2] - min[2]);
    assert.ok(min[1] >= -0.05, nv + ": geometría por debajo del pivote (" + min[1].toFixed(3) + " m)");
    if (d.piezas.includes("tronco")) assert.ok(Math.abs(min[1]) <= 0.05, nv + ": el punto más bajo está a " + min[1].toFixed(3) + " m (el pivote va en la base del tronco)");
    assert.ok(Math.abs((min[0] + max[0]) / 2) <= 0.1 * ancho && Math.abs((min[2] + max[2]) / 2) <= 0.1 * ancho, nv + ": el modelo no está centrado en el pivote");
    assert.ok(Math.abs(max[1] - tp.altura_m) <= 0.2 * tp.altura_m, nv + ": alto " + max[1].toFixed(2) + " m frente a altura_m " + tp.altura_m + " (¿unidades?)");
    assert.ok(Math.abs(ancho / 2 - tp.radio_m) <= 0.3 * tp.radio_m, nv + ": semiancho " + (ancho / 2).toFixed(2) + " m frente a radio_m " + tp.radio_m);
  });
}

test("el generador del catálogo sintético es determinista: da los mismos bytes que los versionados", () => {
  const dest = propia("olivos-genera"), r = ejecuta(process.execPath, [path.join(DIR, "genera.js"), "--salida", dest]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  for (const f of fs.readdirSync(dest)) assert.ok(fs.readFileSync(path.join(dest, f)).equals(fs.readFileSync(path.join(DIR, f))), f + " cambia al regenerarlo (node modelos/olivos/fixture/genera.js)");
  const total = fs.readdirSync(DIR).reduce((s, f) => s + fs.statSync(path.join(DIR, f)).size, 0);
  assert.ok(total < 100 * 1024, "el catálogo sintético pesa " + total + " B: debe seguir siendo pequeño");
});

test("el motor usa el mismo presupuesto de triángulos que el esquema (07a_catalogo.js, PRES_TRI y TOLERANCIA)", () => {
  const s = lee("apps/web/motor/07a_catalogo.js");
  assert.match(s, new RegExp("PRES_TRI = \\[" + ["L0", "L1", "L2"].map(n => PRES.objetivo[n]).join(", ") + "\\], TOLERANCIA = " + PRES.tolerancia));
});

test("los tipos del registro del fixture (copas_tipo) son −1 o tipos del catálogo sintético", () => {
  const FX = fixture({ sinTileset: true }), I = JSON.parse(fs.readFileSync(path.join(FX, "hituelo", "indice.json"), "utf8")), ids = new Set(CAT.tipos.map(t => t.id).concat([-1]));
  assert.ok(I.copas_tipo, "el fixture de Hituelo debe llevar copas_tipo");
  assert.deepStrictEqual(I.copas_tipo.filter(t => !ids.has(t)), []);
});

// ---------- en el navegador: el hueco funciona sin cambiar lo que se ve ----------
const JSM = path.join(RAIZ, "apps", "web", "node_modules", "three", "examples", "jsm"), GLTF = path.join(JSM, "loaders", "GLTFLoader.js");   // el de la misma three que la página (ADR-0016)
const PIEZAS_GLTF = ["loaders/GLTFLoader.js", "utils/BufferGeometryUtils.js", "utils/SkeletonUtils.js"];   // GLTFLoader y lo que importa por ruta relativa; «three», la del motor (ver la prueba)
const SALTO = motivoSalto("el catálogo de olivos-tipo en el navegador") || saltoPagina("el catálogo de olivos-tipo en el navegador") || (fs.existsSync(GLTF) ? null : "falta three en apps/web (cd apps/web && npm i): el catálogo en el navegador NO se ha comprobado");

async function ponEscena(p, e) {
  await p.evaluate(e => { const g = window.__g; g.orb.az = e.az; g.orb.el = e.el; g.orb.dist = e.dist; g.objetivo.x = e.ox; g.objetivo.z = -e.oy; g.objetivo.y = g.suelo(e.ox, e.oy) + 4; g.pon(e.modo); }, e);
  await p.waitForFunction(() => window.__g.Cola.pendientes() === 0, null, { timeout: 45000, polling: 500 }).catch(() => {});
  // las celdas de nivel 0 y los generados se montan a su ritmo: se espera a que el reparto se quede quieto (dos lecturas iguales a 1 s), hasta 20 s
  let previo = "";
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(1000);
    const ahora = await p.evaluate(() => { const a = window.__g.Arboles.resumen(); return [a.nivel0, a.nivel1, a.nivel2, a.faltan, window.__g.Cola.pendientes()].join(","); });
    if (ahora === previo) break; previo = ahora;
  }
  return p.evaluate(() => {
    const g = window.__g, r = g.renderer.info, C = g.Catalogo, modelo = { 1: 0, 2: 0 };
    for (const t of C.tipos()) if (t !== C.SIN) for (const nv of [1, 2]) { const geos = C.geometria(t, nv, 0).map(q => q.geo); g.scene.traverse(o => { if (o.isInstancedMesh && geos.includes(o.geometry) && o.material === C.geometria(t, nv, 0)[0].mat) modelo[nv] += o.count; }); }
    const a = g.Arboles.resumen();
    return { llamadas: r.render.calls, triangulos: r.render.triangles, nivel0: a.nivel0, nivel1: a.nivel1, nivel2: a.nivel2, modeloL1: modelo[1], modeloL2: modelo[2] };
  });
}

test("[hituelo] Catalogo en la página: vacío no cambia nada; instalado con un cargador inyectado dibuja el tipo 0; retirado vuelve a lo de antes", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const WEB = propia("olivos-web");
  // SIN tileset: con él, los olivos de media y larga distancia los dibuja el tileset (04c) y 07b no usa los niveles 1 y 2 del catálogo; sin escena,
  // el motor dibuja sus olivos como siempre y el aviso de la finca sin escena es el único error esperado (pacto de T8 fase 2, §1)
  fs.cpSync(montaPagina({ finca: "hituelo", conTileset: false }).carpeta, path.join(WEB, "hituelo"), { recursive: true });
  fs.mkdirSync(path.join(WEB, "hituelo", "olivos"), { recursive: true });
  for (const f of fs.readdirSync(DIR)) if (/\.(glb|json)$/.test(f)) fs.copyFileSync(path.join(DIR, f), path.join(WEB, "hituelo", "olivos", f));
  // el GLTFLoader de la misma three (ADR-0016): el motor va empaquetado por Vite (sin importmap), así que sus `import … from "three"` se cambian por
  // la three que el motor pasa al cargador (globalThis.__THREE_PRUEBA, la pone el cargador antes de importar)
  for (const f of PIEZAS_GLTF) {
    const d = path.join(WEB, "hituelo", "jsm", f); fs.mkdirSync(path.dirname(d), { recursive: true });
    const src = fs.readFileSync(path.join(JSM, f), "utf8").replace(/import\s*\{([^}]*)\}\s*from\s*['"]three['"];?/g, (m, n) => "const {" + n.replace(/\s+as\s+/g, ": ") + "} = globalThis.__THREE_PRUEBA;");
    assert.ok(!/from\s*['"]three['"]/.test(src), f + ": queda un import de «three»");
    fs.writeFileSync(d, src);
  }
  const srv = await sirve(WEB), nav = await lanza(), p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error") errores.push("CONSOLE " + m.text().slice(0, 300)); });
  try {
    await p.goto("http://127.0.0.1:" + srv.address().port + "/hituelo/index.html?debug&arbsc=1");   // escala de distancia fija: la adaptativa (07b) cambiaría los recuentos entre «antes» y «retirado»
    await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 45000 });
    const proc = await p.evaluate(() => { const C = window.__g.Catalogo; return { tipos: C.tipos(), l1: [0, 1, 2, 3].map(v => C.triangulos(-1, 1, v)), l2: [0, 1].map(v => C.triangulos(-1, 2, v)), l0: C.geometria(-1, 0, 0).length }; });
    assert.deepStrictEqual(proc.tipos, [-1], "sin catálogo instalado solo existe el tipo −1");
    assert.strictEqual(proc.l0, 0, "el L0 del tipo −1 no sale del catálogo (es la copa medida de 06_arboles.js)");
    proc.l1.forEach(n => assert.ok(n <= tope("L1"), "L1 por procedimiento: " + n + " > " + tope("L1")));
    proc.l2.forEach(n => assert.ok(n <= tope("L2"), "L2 por procedimiento: " + n + " > " + tope("L2")));
    t.diagnostic("triángulos por procedimiento: L1 " + proc.l1.join("/") + ", L2 " + proc.l2.join("/"));

    const ESC = { lejos: ESCENARIOS.lejos, cerca: ESCENARIOS.cerca }, antes = {}, con = {}, despues = {};
    for (const [n, e] of Object.entries(ESC)) antes[n] = await ponEscena(p, e);
    // el cargador lo inyecta quien llama (aquí, la prueba): el motor no añade dependencias. El GLTFLoader copiado toma la three que el motor le pasa al cargador
    const inst = await p.evaluate(async () => {
      const desc = await (await fetch("olivos/catalogo.json")).json();
      const cargador = async (url, THREE) => {
        globalThis.__THREE_PRUEBA = THREE;
        const { GLTFLoader } = await import(new URL("jsm/loaders/GLTFLoader.js", location.href).href);
        const g = await new GLTFLoader().loadAsync(url), out = []; g.scene.traverse(o => { if (o.isMesh) out.push({ nombre: o.name, geometria: o.geometry }); }); return out; };
      const tipos = await window.__g.Catalogo.instala(desc, cargador, "olivos/");
      return { tipos, avisos: window.__g.Catalogo.avisos(), info: window.__g.Catalogo.info(0) };
    });
    assert.deepStrictEqual(inst.tipos, [-1, 0]); assert.deepStrictEqual(inst.avisos, []);
    for (const [n, e] of Object.entries(ESC)) con[n] = await ponEscena(p, e);
    await p.evaluate(() => window.__g.Catalogo.retira(0));
    for (const [n, e] of Object.entries(ESC)) despues[n] = await ponEscena(p, e);
    t.diagnostic("antes " + JSON.stringify(antes) + " | con catálogo " + JSON.stringify(con) + " | retirado " + JSON.stringify(despues));

    assert.ok(con.lejos.modeloL2 > 0, "con el catálogo, los olivos de tipo 0 lejanos deberían dibujarse con su L2");
    assert.ok(con.cerca.modeloL1 > 0, "con el catálogo, los olivos de tipo 0 cercanos deberían dibujarse con su L1");
    for (const n of Object.keys(ESC)) {
      const total = x => x.nivel0 + x.nivel1 + x.nivel2;
      assert.strictEqual(total(con[n]), total(antes[n]), n + ": el catálogo no debe cambiar cuántos olivos se dibujan (L0+L1+L2)");
      // una celda de nivel 0 cercana puede estar montada o no según el orden de la Cola (sus olivos pasan de L1 a L0 y cambian las llamadas):
      // las llamadas y los triángulos solo se comparan entre lecturas con el mismo nivel 0
      if (con[n].nivel0 === antes[n].nivel0) assert.ok(con[n].llamadas <= antes[n].llamadas + 3 + 1, n + ": el tipo 0 cuesta más llamadas de las de sus piezas (" + antes[n].llamadas + " → " + con[n].llamadas + ")");
      if (despues[n].nivel0 === antes[n].nivel0) {
        assert.ok(Math.abs(despues[n].llamadas - antes[n].llamadas) <= 2, n + ": al retirar el catálogo las llamadas no vuelven (" + antes[n].llamadas + " → " + despues[n].llamadas + ")");
        assert.ok(Math.abs(despues[n].triangulos - antes[n].triangulos) <= Math.max(2, 0.01 * antes[n].triangulos), n + ": al retirar el catálogo los triángulos no vuelven");
      } else t.diagnostic(n + ": nivel 0 distinto entre antes y retirado (" + antes[n].nivel0 + " → " + despues[n].nivel0 + "): llamadas y triángulos no se comparan");
    }
    assert.deepStrictEqual(errores.filter(e => !/^CONSOLE escena 3D Tiles: falta el tileset/.test(e)), [], "errores de consola o de página");
    assert.strictEqual(errores.length, 1, "un solo console.error, el de la finca sin escena: " + JSON.stringify(errores));
  } finally { await p.close(); await nav.close(); srv.close(); }
});

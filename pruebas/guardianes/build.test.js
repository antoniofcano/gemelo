"use strict";
// Build de las dos fincas desde el fixture sintético, con los límites de la plataforma de artefactos (contratos/publicacion.json).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, python, fixture, propia, ejecuta, ficheros, fs, path } = require("./_util");

const LIM = JSON.parse(fs.readFileSync(path.join(RAIZ, "contratos", "publicacion.json"), "utf8"));
const py = python();
const SRC = ficheros().filter(f => /^apps\/web\/motor\/[^/]+\.js$/.test(f)).sort();
let FIX, SALIDA_WEB; test.before(() => { if (!py) return; FIX = path.relative(RAIZ, fixture()); SALIDA_WEB = propia("web-build"); });

function monta(args) {
  const r = ejecuta(py, ["-I", "tuberia/salida_artefacto/montar_v2.py"].concat(args));
  assert.strictEqual(r.status, 0, "montar_v2.py falló:\n" + r.stdout + r.stderr);
  return r.stdout;
}
function revisaPagina(html) {
  assert.match(html, /<script type="application\/json" id="datos">/, "falta el JSON de datos");
  const v = JSON.parse(fs.readFileSync(path.join(RAIZ, "apps", "web", "package.json"), "utf8")).dependencies.three;   // la misma three que el cliente web (ADR-0016)
  assert.ok(html.includes('"three": "https://cdn.jsdelivr.net/npm/three@' + v + '/build/three.module.js"'), "three " + v + " debe cargarse de jsDelivr con un importmap");
  const js = SRC.map(f => fs.readFileSync(path.join(RAIZ, f), "utf8")).join("");   // exactamente lo que concatena montar_v2.py: orden alfabético, sin huecos
  assert.ok(html.includes('<script type="module">import * as THREE from "three";\n' + js + "</script>"), "los módulos de src/ no están en la página tal cual, en orden alfabético y en un módulo que importa three");
}

test("Cerro (embebido): una sola página que cabe en el límite de 16 MB", t => {
  if (!py) return t.skip("No hay Python 3: el build NO se ha comprobado");
  const salida = path.join(SALIDA_WEB, "cerro", "index.html");
  monta(["--datos", "" + FIX + "/cerro/embebido.json", "--salida", path.relative(RAIZ, salida)]);
  const html = fs.readFileSync(salida, "utf8");
  assert.ok(Buffer.byteLength(html) <= LIM.pagina_max_bytes, "la página pasa de " + LIM.pagina_max_bytes + " bytes");
  revisaPagina(html);
  assert.ok(html.includes('"finca_id":"cerro"') || html.includes('"finca_id": "cerro"'));
});

test("Hituelo (ficheros): página ligera + t/ al lado, dentro de los límites de una publicación", t => {
  if (!py) return t.skip("No hay Python 3: el build NO se ha comprobado");
  const dir = path.join(SALIDA_WEB, "hituelo"); fs.rmSync(dir, { recursive: true, force: true });
  monta(["--finca", "hituelo", "--modo", "ficheros", "--datos", "" + FIX + "/hituelo/indice.json", "--salida", path.relative(RAIZ, path.join(dir, "index.html"))]);
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  revisaPagina(html);
  assert.ok(!html.includes('"dtm"'), "en modo ficheros la página no debe llevar el relieve de las teselas");
  const ts = fs.readdirSync(path.join(dir, "t"));
  assert.strictEqual(ts.filter(f => f.endsWith(".json")).length, 2);
  assert.strictEqual(ts.filter(f => f.endsWith(".jpg")).length, 2);
  const lista = ["index.html"].concat(ts.map(f => "t/" + f));
  let total = 0;
  for (const f of lista) {
    const ext = path.extname(f).slice(1), tam = fs.statSync(path.join(dir, f)).size; total += tam;
    assert.ok(LIM.tipos_admitidos.includes(ext), f + ": tipo «" + ext + "» no admitido por la plataforma");
    assert.ok(tam <= (["jpg", "png", "webp", "wasm"].includes(ext) ? LIM.fichero_binario_max_bytes : LIM.fichero_texto_max_bytes), f + " pasa del límite por fichero");
  }
  assert.ok(lista.length <= LIM.publicacion_max_ficheros, "más de " + LIM.publicacion_max_ficheros + " ficheros");
  assert.ok(total <= LIM.publicacion_max_bytes, "más de 64 MB en una publicación");
});

test("el montador con --salida deja los ficheros de apoyo junto a la página (no en publicar/)", t => {
  if (!py) return t.skip("No hay Python 3");
  const ts = path.join(SALIDA_WEB, "hituelo", "t");
  assert.ok(fs.existsSync(ts), "no hay t/ junto a la página montada");
  assert.ok(!fs.existsSync(path.join(RAIZ, "publicar")), "montar con --salida no debe crear publicar/");
});

test("los .html generados no se versionan (el repo es público, ADR-0004)", () => {
  const ver = ficheros().filter(f => f.endsWith(".html") && !f.startsWith("prototipos/"));   // las maquetas de UX sí se versionan (sin datos reales)
  // la portada y la entrada (apps/web/portada), la página de la herramienta del constructor de olivos (ADR-0017) y la de horneado de impostores (ADR-0019): sin datos
  assert.deepStrictEqual(ver, ["apps/web/olivo/herramienta/index.html", "apps/web/plantilla.html", "apps/web/portada/index.html", "tuberia/olivos/impostores/pagina.html"], "HTML versionados inesperados");
});

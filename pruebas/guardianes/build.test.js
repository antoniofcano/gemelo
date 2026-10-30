"use strict";
// Build de las dos fincas del fixture sintético con el cliente web (genera_motor.mjs + Vite: pruebas/guardianes/_pagina.js). Desde T8 fase 2
// (decisión 79) no hay salida artefacto: la página se sirve con su índice, t/ y tileset/ al lado, del mismo origen.
// Sin Vite o sin 3d-tiles-renderer instalados (cd apps/web && npm ci) se SALTA con aviso.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, ficheros, fs, path } = require("./_util");
const { montaPagina, saltoPagina, datosDe } = require("./_pagina");

const SALTO = saltoPagina("el build de las fincas");
const SRC = ficheros().filter(f => /^apps\/web\/motor\/[^/]+\.js$/.test(f)).sort();

for (const finca of ["cerro", "hituelo"]) {
  test("[" + finca + "] el build con tileset: la entrada es el motor en orden, la página lleva el índice (sin relieve de teselas) y tiene t/ y tileset/ al lado", t => {
    if (SALTO) return t.skip(SALTO);
    const P = montaPagina({ finca });
    const js = SRC.map(f => fs.readFileSync(path.join(RAIZ, f), "utf8")).join("");   // lo que concatena genera_motor.mjs: orden alfabético, sin huecos
    assert.strictEqual(fs.readFileSync(path.join(P.raiz, "entrada", "motor.generado.js"), "utf8"), 'import * as THREE from "three";\n' + js);
    const html = fs.readFileSync(path.join(P.carpeta, P.url), "utf8");
    assert.match(html, /<script type="module"[^>]*src="\.\/assets\/[^"]+\.js"/, "la página no carga el motor empaquetado de assets/");
    assert.ok(!/cdn\.jsdelivr\.net|<script type="importmap">/.test(html), "queda un importmap o una carga de jsDelivr (la salida artefacto ya no existe)");
    const D = datosDe(P.carpeta);
    assert.strictEqual(D.finca_id, finca);
    assert.strictEqual(D.tileset, "tileset/tileset.json", "el índice de la página debe llevar el tileset del mismo origen");
    assert.ok(Object.values(D.teselas).every(x => !("dtm" in x)), "la página no debe llevar el relieve de las teselas (va en t/)");
    const ts = fs.readdirSync(path.join(P.carpeta, "t"));
    assert.strictEqual(ts.filter(f => f.endsWith(".json")).length, Object.keys(D.teselas).length, "un t/<k>.json por tesela");
    assert.strictEqual(ts.filter(f => f.endsWith(".jpg")).length, Object.keys(D.teselas).length, "un t/<k>.jpg por tesela");
    const tileset = JSON.parse(fs.readFileSync(path.join(P.carpeta, "tileset", "tileset.json"), "utf8"));
    assert.ok(tileset.asset && tileset.root, "tileset/tileset.json no parece un tileset");
    assert.ok(fs.readdirSync(path.join(P.carpeta, "tileset"), { recursive: true }).some(f => String(f).endsWith(".glb")), "el tileset no trae glb");
  });
}

test("[hituelo] sin tileset: el índice de la página no lo lleva y no hay tileset/ al lado", t => {
  if (SALTO) return t.skip(SALTO);
  const P = montaPagina({ finca: "hituelo", conTileset: false });
  assert.ok(!("tileset" in datosDe(P.carpeta)));
  assert.ok(!fs.existsSync(path.join(P.carpeta, "tileset")));
});

test("la caché de páginas: la misma petición devuelve la misma carpeta sin reconstruir", t => {
  if (SALTO) return t.skip(SALTO);
  const a = montaPagina({ finca: "hituelo" }), antes = fs.statSync(path.join(a.carpeta, "index.html")).mtimeMs;
  const b = montaPagina({ finca: "hituelo" });
  assert.strictEqual(b.carpeta, a.carpeta);
  assert.strictEqual(fs.statSync(path.join(b.carpeta, "index.html")).mtimeMs, antes, "se reconstruyó");
  assert.notStrictEqual(montaPagina({ finca: "hituelo", conTileset: false }).carpeta, a.carpeta, "con otro índice, otra página");
});

test("los .html generados no se versionan (el repo es público, ADR-0004)", () => {
  const ver = ficheros().filter(f => f.endsWith(".html") && !f.startsWith("prototipos/"));   // las maquetas de UX sí se versionan (sin datos reales)
  // la portada y la entrada (apps/web/portada), la página de la herramienta del constructor de olivos (ADR-0017) la de horneado de impostores (ADR-0019) y la de la oficina (ADR-0024): sin datos
  assert.deepStrictEqual(ver, ["apps/web/oficina/index.html", "apps/web/olivo/herramienta/index.html", "apps/web/plantilla.html", "apps/web/portada/index.html", "tuberia/olivos/impostores/pagina.html"], "HTML versionados inesperados");
});

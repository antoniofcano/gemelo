"use strict";
// El contorno de cada finca (OF3b, decisión 140): tuberia/contorno/contorno_finca.py lo saca de una fuente pública oficial (SIGPAC o
// Catastro), la migración 0011 lo guarda y la api lo usa para limitar el editor de hazas. En Node, sin red, sin Docker ni Chrome:
//  - la tubería: la fuente es obligatoria (no elige por nadie), las dependencias con versión fijada, la entrada viene de GEMELO_* y los
//    ejemplos del repo son sintéticos (provincia 99 y referencias 99999…, que no existen);
//  - su prueba sintética (prueba_contorno.py: unión, CRS84 → EPSG:25830, cierre de rendijas, SQL, rechazos), si hay Python con
//    shapely, pyproj y jsonschema (si no, se salta con aviso);
//  - la migración 0011 (un solo contorno vigente por finca, la historia no se borra, la api no cambia geometrías) y las rutas, en el contrato.
const test = require("node:test"), assert = require("node:assert");
const { python, ejecuta, lee, fs, path, RAIZ } = require("./_util");

const py = python();
const DEPS = py ? ejecuta(py, ["-P", "-E", "-c", "import shapely, pyproj, jsonschema"]) : null;
const SIN_DEPS = !py ? "No hay Python 3" : DEPS.status !== 0 ? "faltan shapely, pyproj o jsonschema (pip install -r tuberia/contorno/requirements.txt)" : null;

test("la tubería: fuente obligatoria y pública, entrada por GEMELO_*, dependencias fijadas, ejemplos sintéticos", () => {
  const src = lee("tuberia/contorno/contorno_finca.py");
  assert.match(src, /"required": \["finca", "fuente", "parcelas"\]/, "la fuente no tiene valor por defecto: la elige quien carga (decisión 140)");
  assert.match(src, /GEMELO_CONTORNO_PARCELAS/); assert.match(src, /GEMELO_CONTORNO\b/);
  assert.match(src, /https:\/\/sigpac-hubcloud\.es\/ogcapi\/collections\/recintos\/items/);
  assert.match(src, /https:\/\/ovc\.catastro\.meh\.es\/INSPIRE\/wfsCP\.aspx/);
  assert.match(src, /CC BY 4\.0/); assert.match(src, /Dirección General del Catastro/);
  // OF3c (decisión 143): la fuente por defecto son las parcelas del gemelo (sin red), con la atribución de OlivarTrack/SIGPAC; el respaldo sigue
  assert.match(src, /GEMELO_PARCELAS/); assert.match(src, /def lee_gemelo\(/); assert.match(src, /--comparar/);
  assert.match(src, /"gemelo": "Parcelas de OlivarTrack \(polígono con origen SIGPAC, © Fondo Español de Garantía Agraria \(FEGA\), CC BY 4\.0\)/);
  assert.match(src, /FUENTE_EN_BASE = \{"gemelo": "sigpac"/, "en la base se guarda el origen: la tabla solo admite sigpac | catastro");
  const docc = lee("doc/operacion/DATOS.md");
  assert.match(docc, /parcelas del gemelo/); assert.match(docc, /OlivarTrack, con origen SIGPAC/); assert.match(docc, /1 m/);
  const req = lee("tuberia/contorno/requirements.txt").split("\n").filter(l => l.trim() && !l.startsWith("#"));
  assert.ok(req.length >= 3 && req.every(l => /^[a-z0-9_-]+==\d+(\.\d+)+$/i.test(l.trim())), "versiones fijadas: " + req.join(", "));
  for (const f of fs.readdirSync(path.join(RAIZ, "tuberia", "contorno", "ejemplo"))) {
    const d = JSON.parse(lee("tuberia/contorno/ejemplo/" + f));
    assert.strictEqual(d.sintetico, true, f + ": el ejemplo se declara sintético");
    for (const p of d.parcelas) {
      if (d.fuente === "sigpac") assert.strictEqual(p.provincia, 99, f + ": provincia 99, que no existe");
      else assert.match(p.refcat, /^99999/, f + ": referencia inventada (99999…)");
    }
  }
  const doc = lee("doc/operacion/DATOS.md");
  assert.match(doc, /Contorno de la finca/); assert.match(doc, /FEGA/); assert.match(doc, /Dirección General del Catastro/);
});

test("prueba sintética de la tubería (sin red): unión, proyección, rendijas, SQL y rechazos", t => {
  if (SIN_DEPS) return t.skip(SIN_DEPS + ": la tubería del contorno NO se ha comprobado");
  const r = ejecuta(py, ["-P", "-E", path.join("tuberia", "contorno", "prueba_contorno.py")]);
  assert.strictEqual(r.status, 0, "prueba_contorno.py falló:\n" + r.stdout + r.stderr);
  assert.match(r.stdout, /^ok$/m);
});

test("migración 0011: un contorno vigente por finca, historia sin borrar, la api solo añade y retira", () => {
  const m = lee("apps/api/migraciones/0011_fincas_contorno.sql");
  assert.match(m, /CREATE TABLE fincas_contorno/);
  assert.match(m, /geometry\(MultiPolygon, 25830\)/);
  assert.match(m, /CREATE UNIQUE INDEX fincas_contorno_vigente ON fincas_contorno \(finca\) WHERE retirado_en IS NULL/);
  assert.match(m, /fuente\s+text NOT NULL CHECK \(fuente IN \('sigpac', 'catastro'\)\)/);
  assert.match(m, /GRANT SELECT, INSERT ON fincas_contorno TO gemelo_api/);
  assert.match(m, /GRANT UPDATE \(retirado_en, retirado_por\) ON fincas_contorno TO gemelo_api/);
  assert.ok(!/refcat|poligono|parcela_ref/i.test(m.replace(/--.*$/gm, "")), "la tabla no guarda las referencias de las parcelas");
  const nums = fs.readdirSync(path.join(RAIZ, "apps", "api", "migraciones")).map(f => f.slice(0, 4));
  assert.strictEqual(new Set(nums).size, nums.length, "números de migración repetidos: " + nums.join(", "));
});

test("api y editor: la api manda (ST_CoveredBy con el contorno; sin él, la caja + 150 m); cargar y retirar, solo admin con confirmación", () => {
  const hz = lee("apps/api/src/admin/hazas.ts"), ct = lee("apps/api/src/admin/contorno.ts"), openapi = lee("contratos/api.openapi.yaml");
  assert.match(hz, /ST_CoveredBy\(x\.g, ST_Buffer\(k\.geom, \$3\)\)/);
  assert.match(hz, /fuera_de_contorno/); assert.match(hz, /fuera_de_finca/, "sin contorno, sigue la caja de hoy");
  assert.match(ct, /"\/api\/admin\/fincas\/:finca\/contorno", \{\s*preHandler: SOLO_ADMIN_CONFIRMADO/);
  assert.match(ct, /app\.delete[^\n]*"\/api\/admin\/fincas\/:finca\/contorno", \{ preHandler: SOLO_ADMIN_CONFIRMADO/);
  assert.match(ct, /SOLO_ADMIN_CONFIRMADO = \[requiereRol\("admin"\), requiereConfirmacionReciente\(\)\]/);
  assert.match(ct, /"admin\.contorno_cargado"/); assert.match(ct, /"admin\.contorno_retirado"/);
  for (const r of ["/api/admin/fincas/{finca}/limite", "/api/admin/fincas/{finca}/contorno"]) assert.ok(openapi.includes("  " + r + ":"), r + " está en api.openapi.yaml");
  const js = lee("apps/web/oficina/hazas.js");
  assert.match(js, /new Draw\(\{[^}]*condition: e => noModifierKeys\(e\) && puedePoner\(e\.coordinate\)/, "no se pone un vértice fuera del límite");
  assert.match(js, /if \(!cabe\(c\)\) \{ aviso\(/, "no se guarda fuera del límite");
  assert.match(js, /api\("GET", "\/api\/admin\/fincas\/" \+ encodeURIComponent\(f\) \+ "\/limite"\)/);
});

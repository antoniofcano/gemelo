"use strict";
// Servidor de la fase F1a (apps/api, infra/, tuberia/hazas; contratos/publicacion-vps.json).
//  - Siempre: imágenes de producción = contrato = infra/dev, con versión y digest; ningún puerto publicado; ningún
//    secreto escrito en el compose; el Dockerfile usa la imagen de Node del contrato; dependencias npm fijadas; el
//    OpenAPI y la ficha se leen; el cargador de hazas convierte el ejemplo sintético.
//  - Si apps/api tiene sus dependencias instaladas: tipos (tsc) y pruebas unitarias (sin base). Si no, se SALTA con aviso.
//  - Opcional (GEMELO_DOCKER=1): integración contra PostGIS en contenedor (21 pruebas) e infra/probar-caddy.sh.
const test = require("node:test"), assert = require("node:assert");
const { spawnSync } = require("child_process");
const { RAIZ, lee, python, ejecuta, fs, path, os } = require("./_util");

const API = path.join(RAIZ, "apps", "api");
const CONTRATO = JSON.parse(lee("contratos/publicacion-vps.json"));
const sinComentarios = f => lee(f).split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
const imagenes = f => [...sinComentarios(f).matchAll(/^\s*image:\s*(\S+)\s*$/gm)].map(m => m[1]).filter(i => !i.startsWith("gemelo-"));
const PRELIMINAR = /(^|[-.\d])(latest|edge|master|main|dev|devel|nightly|snapshot|rc\d*|beta\d*|alpha\d*|preview|canary|unstable)([-.\d]|$)/i;
const CON_DIGEST = /^([a-z0-9._/-]+):([A-Za-z0-9._-]+)@sha256:[a-f0-9]{64}$/;
const HAY_DEPS = fs.existsSync(path.join(API, "node_modules", "fastify"));
const SIN_DEPS = "apps/api sin dependencias (cd apps/api && npm ci)";
// el hijo NO debe heredar NODE_TEST_CONTEXT (si no, habla en el protocolo interno de node:test y no en texto)
const ENTORNO_HIJO = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_TEST_CONTEXT"));
const pruebas = (args, extra) => spawnSync(process.execPath, ["--test", "--test-reporter=spec", ...args],
  Object.assign({ cwd: API, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: ENTORNO_HIJO }, extra || {}));

test("imágenes de producción: versión exacta y digest, sin preliminares, y las del contrato", () => {
  const prod = imagenes("infra/compose.yml");
  assert.deepStrictEqual(prod.slice().sort(), [CONTRATO.imagenes.db, CONTRATO.imagenes.web].sort());
  const todas = [...prod, ...Object.values(CONTRATO.imagenes), ...Object.values(CONTRATO.imagenes_fase_2)];
  for (const i of todas) {
    const m = CON_DIGEST.exec(i);
    assert.ok(m, i + ": debe ser imagen:versión@sha256:<64 hex>");
    assert.ok(!PRELIMINAR.test(m[2]), i + ": etiqueta preliminar o móvil");
    assert.match(m[2], /\d+\.\d+|\d+-\d+\.\d+/, i + ": la etiqueta debe fijar la versión (no solo la mayor)");
  }
});

test("dev y producción usan las mismas imágenes de base, web y LiveKit", () => {
  const dev = imagenes("infra/dev/compose.yml");
  for (const i of [CONTRATO.imagenes.db, CONTRATO.imagenes.web, CONTRATO.imagenes_fase_2.livekit]) {
    assert.ok(dev.includes(i), "infra/dev/compose.yml no usa " + i + " (dev: " + dev.join(", ") + ")");
  }
});

test("producción: ningún puerto publicado, secretos solo por fichero, red de borde externa", () => {
  const c = sinComentarios("infra/compose.yml");
  assert.ok(!/^\s*ports:/m.test(c), "infra/compose.yml publica puertos (se entra solo por la red borde)");
  assert.ok(!/(PASSWORD|CLAVE|SECRETO|TOKEN)(_[A-Z]+)*:\s*["']?[^"'\s/][^\n]*$/m.test(c.replace(/_FICHERO:\s*\/run\/secrets\/\S+/g, "")),
    "hay un secreto escrito en el compose: van en /run/secrets (secretos de Docker)");
  assert.match(c, /borde:\s*\n\s*external:\s*true/, "la red borde debe ser externa (la crea Oficultor)");
  assert.match(c, /pg_datos:\/var\/lib\/postgresql\s*$/m, "con PostgreSQL 18 el volumen va en " + CONTRATO.volumen_bd);
  for (const s of CONTRATO.secretos) assert.match(c, new RegExp("^\\s*" + s + ":\\s*\\{\\s*file:\\s*/etc/gemelo/secretos/" + s + "\\s*\\}", "m"), "secreto " + s);
});

test("el Dockerfile usa la imagen de Node del contrato y corre sin root", () => {
  const d = lee("apps/api/Dockerfile");
  const froms = [...d.matchAll(/^FROM\s+(\S+)/gm)].map(m => m[1]);
  assert.ok(froms.length >= 1 && froms.every(f => f === CONTRATO.imagenes.node), "FROM distinto del contrato: " + froms.join(", "));
  assert.match(d, /^USER node$/m);
  assert.match(d, new RegExp("^EXPOSE " + CONTRATO.puerto_api + "$", "m"));
});

test("dependencias de apps/api fijadas a versión exacta y con package-lock", () => {
  const p = JSON.parse(lee("apps/api/package.json"));
  for (const [n, v] of Object.entries({ ...p.dependencies, ...p.devDependencies })) assert.match(v, /^\d+\.\d+\.\d+$/, n + "@" + v + ": versión sin fijar");
  assert.ok(fs.existsSync(path.join(API, "package-lock.json")), "falta apps/api/package-lock.json");
});

test("las variables que lee la api están declaradas en contratos/publicacion-vps.json", () => {
  const leidas = new Set();
  for (const f of fs.readdirSync(path.join(API, "src"), { recursive: true }).filter(f => String(f).endsWith(".ts"))) {
    const s = fs.readFileSync(path.join(API, "src", String(f)), "utf8");
    for (const m of s.matchAll(/"((?:GEMELO|NODE)_[A-Z_]+)"/g)) leidas.add(m[1]);
  }
  const conocidas = new Set(CONTRATO.variables_api.flatMap(v => [v, v.replace(/_FICHERO$/, "")]));
  const faltan = [...leidas].filter(v => !conocidas.has(v) && !conocidas.has(v + "_FICHERO"));
  assert.deepStrictEqual(faltan, [], "variables sin declarar en contratos/publicacion-vps.json");
});

test("contratos de la api: OpenAPI y ficha de haza se leen y la ficha es lista blanca", () => {
  const o = lee("contratos/api.openapi.yaml");
  assert.match(o, /^openapi: 3\.1\.0$/m);
  const h = JSON.parse(lee("contratos/haza.schema.json"));
  assert.strictEqual(h.additionalProperties, false);
  for (const p of ["titular", "kg", "correo"]) assert.ok(!(p in (h.properties || {})), "la ficha no puede tener " + p);
});

test("tuberia/hazas: el ejemplo sintético se convierte a SQL idempotente", t => {
  const py = python();
  if (!py) return t.skip("sin Python 3: el cargador de hazas NO se ha comprobado");
  const dep = spawnSync(py, ["-c", "import jsonschema"], { encoding: "utf8" });
  if (dep.status !== 0) return t.skip("sin jsonschema (pip install -r tuberia/hazas/requirements.txt): el cargador NO se ha comprobado");
  const sal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-hazas-")), "h.sql");
  const r = ejecuta(py, ["tuberia/hazas/carga_hazas.py", "--hazas", "tuberia/hazas/ejemplo/hazas.sintetico.geojson",
    "--olivos", "tuberia/hazas/ejemplo/olivos.sintetico.geojson", "--salida", sal]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout), { hazas: 3, olivos: 37, salida: "h.sql" });
  const sql = fs.readFileSync(sal, "utf8");
  assert.match(sql, /ON CONFLICT \(codigo\) DO UPDATE/);
  assert.ok(!/hogar_id/.test(sql.split("INSERT INTO haza_parcela")[0].split("INSERT INTO hazas")[1] || ""), "el cargador no debe tocar hogar_id");
});

test("apps/api: tipos y pruebas unitarias (sin base de datos)", { timeout: 600_000 }, t => {
  if (!HAY_DEPS) return t.skip(SIN_DEPS + ": tipos y unitarias de la api NO comprobados");
  const tsc = spawnSync(process.execPath, [path.join(API, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", "tsconfig.json"], { cwd: API, encoding: "utf8" });
  assert.strictEqual(tsc.status, 0, "tsc:\n" + tsc.stdout + tsc.stderr);
  const u = pruebas(["pruebas/unidad/*.test.ts"]);
  assert.strictEqual(u.status, 0, "pruebas unitarias de la api:\n" + u.stdout.split("\n").filter(l => /^(✖|not ok|ℹ)/.test(l)).join("\n"));
});

test("apps/api: integración contra PostGIS en contenedor (opcional, GEMELO_DOCKER=1)", { timeout: 600_000 }, t => {
  if (process.env.GEMELO_DOCKER !== "1") return t.skip("opcional: GEMELO_DOCKER=1 para la integración con PostGIS");
  if (!HAY_DEPS) return t.skip(SIN_DEPS);
  const r = pruebas(["--test-concurrency=1", "--test-timeout=240000", "pruebas/integracion/*.test.ts"]);
  const resumen = r.stdout.split("\n").filter(l => /^(✖|ℹ (pass|fail|skipped))/.test(l)).join("\n");
  assert.strictEqual(r.status, 0, "integración:\n" + resumen);
  assert.match(r.stdout, /ℹ skipped 0/, "alguna prueba de integración se saltó (¿Docker?):\n" + resumen);
});

test("infra/Caddyfile: cabeceras, sesión y registros (opcional, GEMELO_DOCKER=1)", { timeout: 300_000 }, t => {
  if (process.env.GEMELO_DOCKER !== "1") return t.skip("opcional: GEMELO_DOCKER=1 para infra/probar-caddy.sh");
  const r = spawnSync("bash", ["infra/probar-caddy.sh"], { cwd: RAIZ, encoding: "utf8" });
  assert.strictEqual(r.status, 0, r.stdout.split("\n").filter(l => /MAL|fallos/.test(l)).join("\n") + r.stderr);
});

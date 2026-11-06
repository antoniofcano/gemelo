"use strict";
// Frescura de los tipos de TypeScript generados desde contratos/*.schema.json (MUNDOS §1, MU1-11, regla 3).
// Regenera EN MEMORIA con apps/web/herramientas/genera_tipos.mjs y compara con lo versionado en
// apps/web/src/datos/contratos/: si un esquema cambió sin regenerar (o alguien editó a mano un tipo), la puerta cae.
// Se SALTA con aviso si apps/web no tiene dependencias (cd apps/web && npm ci).
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, fs, path } = require("./_util");

const WEB = path.join(RAIZ, "apps", "web");
const SALIDA = path.join(WEB, "src", "datos", "contratos");
const HAY_DEPS = fs.existsSync(path.join(WEB, "node_modules", "json-schema-to-typescript"));
const SIN_DEPS = "apps/web sin dependencias (cd apps/web && npm ci)";
const COMO = "regenera con: node apps/web/herramientas/genera_tipos.mjs (y súbelo en el mismo commit que el esquema)";
const gen = () => import(pathToFileURL(path.join(WEB, "herramientas", "genera_tipos.mjs")).href);

test("los tipos de apps/web/src/datos/contratos/ coinciden con los esquemas (frescura)", { skip: !HAY_DEPS && SIN_DEPS }, async () => {
  const { generaTodo } = await gen();
  const esperado = await generaTodo();
  const versionado = fs.existsSync(SALIDA) ? fs.readdirSync(SALIDA).filter(f => f.endsWith(".ts")) : [];
  assert.deepStrictEqual(versionado.sort(), Object.keys(esperado).sort(), `sobran o faltan ficheros en src/datos/contratos; ${COMO}`);
  for (const [f, texto] of Object.entries(esperado)) {
    assert.strictEqual(fs.readFileSync(path.join(SALIDA, f), "utf8"), texto, `${f} está desactualizado respecto a su esquema; ${COMO}`);
  }
});

test("la generación es determinista (dos pasadas dan los mismos bytes) y sin rutas locales", { skip: !HAY_DEPS && SIN_DEPS }, async () => {
  const { generaTodo } = await gen();
  const a = await generaTodo(), b = await generaTodo();
  assert.deepStrictEqual(a, b);
  for (const [f, t] of Object.entries(a)) assert.ok(!/[A-Za-z]:[\\/]Users|\/home\//.test(t), `${f} lleva una ruta local`);
});

"use strict";
// L9-08: la puerta de CI pasa gitleaks por TODO el historial (el repo es público y un secreto en un commit viejo sigue publicado). Este guardián
// comprueba que el paso existe y no se ha aflojado: historial completo, versión fijada y comprobada, config del repo, y que esa config no apaga reglas.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const CI = lee(".github/workflows/puerta.yml"), CONF = lee(".gitleaks.toml");
/** Los pasos del único job, como bloques de texto (cada uno empieza en «      - »). */
const pasos = CI.split(/\n(?=      - )/).slice(1);

test("el workflow de la puerta clona el historial completo y pasa gitleaks por él, con versión fijada y comprobada, antes de la puerta", () => {
  const checkout = pasos.find(p => /uses:\s*actions\/checkout@/.test(p));
  assert.ok(checkout, "hay checkout"); assert.match(checkout, /fetch-depth:\s*0\b/, "historial completo (fetch-depth: 0)");
  const i = pasos.findIndex(p => /gitleaks/.test(p) && /\brun:/.test(p));
  assert.ok(i >= 0, "hay un paso que ejecuta gitleaks");
  const g = pasos[i];
  assert.match(g, /GITLEAKS_VERSION:\s*\d+\.\d+\.\d+\s*$/m, "versión exacta (x.y.z), no «latest»");
  assert.doesNotMatch(g, /latest/i);
  assert.match(g, /checksums\.txt/); assert.match(g, /sha256sum -c/, "el binario se comprueba contra la suma de su publicación");
  assert.match(g, /gitleaks"? git\b/, "modo git: recorre los commits, no solo la copia de trabajo");
  assert.match(g, /--config \.gitleaks\.toml/); assert.match(g, /--exit-code 1/); assert.match(g, /--redact/, "no imprime el secreto en el registro público de CI");
  assert.doesNotMatch(g, /--log-opts|--no-git|continue-on-error|\|\|\s*true/, "sin recortar el historial ni tragarse el fallo");
  const puerta = pasos.findIndex(p => /npm run puerta/.test(p));
  assert.ok(puerta > i, "gitleaks va antes de la puerta");
});

test(".gitleaks.toml usa las reglas de gitleaks sin apagar ninguna y su única excepción es la del secreto sintético de avisos_correo", () => {
  assert.match(CONF, /^\[extend\]\s*\nuseDefault\s*=\s*true/m);
  assert.doesNotMatch(CONF, /disabledRules|^\s*\[\[rules\]\]/m, "no se desactiva ni se redefine ninguna regla");
  const bloques = CONF.split(/^\[\[allowlists\]\]/m).slice(1);
  assert.equal(bloques.length, 1, "una sola excepción");
  assert.doesNotMatch(CONF, /^\[allowlist\]/m, "ni la excepción global antigua");
  const b = bloques[0];
  assert.match(b, /condition\s*=\s*"AND"/, "ruta Y forma, no una u otra");
  const ruta = new RegExp(/paths\s*=\s*\['''(.+?)'''\]/.exec(b)[1]), forma = new RegExp(/regexes\s*=\s*\['''(.+?)'''\]/.exec(b)[1]);
  assert.ok(ruta.test("apps/api/pruebas/unidad/avisos_correo.test.ts"));
  assert.ok(!ruta.test("apps/api/src/avisos/correo.ts") && !ruta.test("x/apps/api/pruebas/unidad/avisos_correo.test.ts"), "solo ese fichero");
  const viejo = "const SECRETO = \"secreto-de-" + "prueba-secreto-de-" + "prueba-0123456789\";";   // su primera versión (por partes)
  assert.ok(forma.test(viejo), "la excepción cubre el literal sintético");
  assert.ok(!forma.test("const SECRETO = \"Ab3dE5fG7hJ9kL1mNp2Q0123456789\";"), "otro valor en ese fichero sigue saltando");
});

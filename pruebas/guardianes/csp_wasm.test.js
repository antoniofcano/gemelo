"use strict";
// EV-1f: la CSP de los dos Caddyfile (producción y desarrollo) admite WebAssembly solo con 'wasm-unsafe-eval' en script-src
// (transcodificador Basis de KTX2Loader y meshopt), nunca con 'unsafe-eval' a secas, y sigue en modo solo informe.
// Solo Node. La comprobación contra la cabecera real la hace infra/probar-caddy.sh (necesita Docker).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");

for (const rel of [["infra", "Caddyfile"], ["infra", "dev", "Caddyfile"]]) {
  test("la CSP de " + rel.join("/") + " admite 'wasm-unsafe-eval' en script-src y no 'unsafe-eval'", () => {
    const m = /Content-Security-Policy-Report-Only\s+"([^"]+)"/.exec(fs.readFileSync(path.join(RAIZ, ...rel), "utf8"));
    assert.ok(m, "no hay CSP en modo solo informe");
    const dir = m[1].split(";").map(x => x.trim()).find(x => x.startsWith("script-src "));
    assert.ok(dir, "no hay script-src");
    const fuentes = dir.split(/\s+/).slice(1);
    assert.ok(fuentes.includes("'wasm-unsafe-eval'"), "script-src sin 'wasm-unsafe-eval': " + dir);
    assert.ok(!/'unsafe-eval'/.test(m[1]), "la CSP abre 'unsafe-eval'");
  });
}

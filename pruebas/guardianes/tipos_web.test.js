"use strict";
// Cimientos de TypeScript de apps/web/src/ (ADR-0033, MUNDOS §9.1-§9.2, §1).
//  - tsc --noEmit -p apps/web (tipos del código nuevo) y vitest run (lógica pura en Node).
//  - dependency-cruiser con las reglas de las cuatro fronteras (apps/web/.dependency-cruiser.cjs): src/ debe cumplirlas
//    y, sobre un árbol temporal con cada frontera rota, debe DETECTAR cada violación (si no, el guardián no vigilaría nada).
// Si apps/web no tiene sus dependencias instaladas, se SALTA con aviso (cd apps/web && npm ci).
const test = require("node:test"), assert = require("node:assert");
const { spawnSync } = require("child_process");
const { RAIZ, fs, path, os } = require("./_util");

const WEB = path.join(RAIZ, "apps", "web");
const BIN = (...p) => path.join(WEB, "node_modules", ...p);
const HAY_DEPS = fs.existsSync(BIN("vitest")) && fs.existsSync(BIN("typescript")) && fs.existsSync(BIN("dependency-cruiser"));
const SIN_DEPS = "apps/web sin dependencias (cd apps/web && npm ci)";
// el hijo NO debe heredar NODE_TEST_CONTEXT (si no, habla en el protocolo interno de node:test)
const ENTORNO_HIJO = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_TEST_CONTEXT"));
const corre = (script, args, cwd) => spawnSync(process.execPath, [script, ...args],
  { cwd: cwd || WEB, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: ENTORNO_HIJO });
const CRUISER = () => BIN("dependency-cruiser", "bin", "dependency-cruiser.mjs");
const CONFIG = path.join(WEB, ".dependency-cruiser.cjs");

test("tsc --noEmit -p apps/web: el código nuevo tipa", { skip: !HAY_DEPS && SIN_DEPS }, () => {
  const r = corre(BIN("typescript", "bin", "tsc"), ["--noEmit", "-p", "tsconfig.json"]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test("vitest run: las pruebas de apps/web/src pasan", { skip: !HAY_DEPS && SIN_DEPS }, () => {
  const r = corre(BIN("vitest", "vitest.mjs"), ["run"]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test("dependency-cruiser: src/ respeta las cuatro fronteras y no tiene ciclos", { skip: !HAY_DEPS && SIN_DEPS }, () => {
  const r = corre(CRUISER(), ["--config", CONFIG, "src"]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test("dependency-cruiser DETECTA cada frontera rota (árbol temporal)", { skip: !HAY_DEPS && SIN_DEPS }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-fronteras-"));
  try {
    const f = (ruta, txt) => { const p = path.join(dir, ruta); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt); };
    fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { module: "esnext", moduleResolution: "bundler", allowImportingTsExtensions: true }, include: ["src"] }));
    const hoja = "export const x = 1;\n";
    for (const m of ["nucleo", "datos", "red", "ui"]) f(`src/${m}/hoja.ts`, hoja);
    f("src/mundos/exterior/hoja.ts", hoja);
    f("src/mundos/molino/hoja.ts", hoja);
    f("src/mundos/comun/hoja.ts", hoja);
    f("motor/legado.ts", hoja);
    // violaciones, una por regla
    f("src/nucleo/a.ts", 'import "../red/hoja.ts";\n');                    // nucleo-no-importa-de-nadie
    f("src/datos/a.ts", 'import "../nucleo/hoja.ts";\n');                   // datos-no-importa-de-nadie
    f("src/red/a.ts", 'import "../mundos/exterior/hoja.ts";\n');            // red-solo-importa-de-datos
    f("src/mundos/exterior/a.ts", 'import "../../ui/hoja.ts";\n');          // mundos-no-importa-de-ui
    f("src/mundos/molino/a.ts", 'import "../exterior/hoja.ts";\n');         // un-mundo-no-importa-a-otro
    f("src/ui/a.ts", 'import "../../motor/legado.ts";\n');                  // src-no-importa-del-legado
    f("src/ui/b.ts", 'import "../mundos/comun/hoja.ts";\n');               // ui-solo-importa-de-nucleo-y-datos (A3-7a): ni mundos/comun/…
    f("src/ui/d.ts", 'import "../red/hoja.ts";\n');                        // …ni red/
    f("src/arranque.ts", 'import "./nucleo/hoja.ts";\n');                   // la entrada (A3-8c)…
    f("src/nucleo/e.ts", 'import "../arranque.ts";\n');                    // …nadie-importa-el-arranque
    f("src/ui/c1.ts",'import "./c2.ts";\nexport const c1 = 1;\n');         // sin-ciclos
    f("src/ui/c2.ts", 'import "./c1.ts";\nexport const c2 = 2;\n');
    const r = corre(CRUISER(), ["--config", CONFIG, "--output-type", "json", "src"], dir);
    const salida = JSON.parse(r.stdout);
    const detectadas = new Set(salida.summary.violations.map(v => v.rule.name));
    for (const regla of ["sin-ciclos", "nucleo-no-importa-de-nadie", "datos-no-importa-de-nadie", "red-solo-importa-de-datos",
      "mundos-no-importa-de-ui", "un-mundo-no-importa-a-otro", "src-no-importa-del-legado", "ui-solo-importa-de-nucleo-y-datos", "nadie-importa-el-arranque"]) {
      assert.ok(detectadas.has(regla), `no detecta la regla ${regla}; detectadas: ${[...detectadas].join(", ")}`);
    }
    // A3-7a: las dos de ui/ (a mundos/comun/ y a red/) saltan las dos
    const deUi = salida.summary.violations.filter(v => v.rule.name === "ui-solo-importa-de-nucleo-y-datos").map(v => v.from).sort();
    assert.deepStrictEqual(deUi, ["src/ui/b.ts", "src/ui/d.ts"], "ui/ no importa de mundos/comun/ ni de red/");
    // y lo permitido no salta: red -> datos, mundos -> nucleo/datos/red, mismo mundo, ui -> nucleo/datos (A3-7a)
    f("src/red/ok.ts", 'import "../datos/hoja.ts";\n');
    f("src/ui/ok.ts", 'import "../nucleo/hoja.ts";\nimport "../datos/hoja.ts";\n');
    f("src/mundos/exterior/ok.ts", 'import "../../nucleo/hoja.ts";\nimport "../../datos/hoja.ts";\nimport "../../red/hoja.ts";\nimport "./hoja.ts";\n');
    const r2 = corre(CRUISER(), ["--config", CONFIG, "--output-type", "json", "src"], dir);
    const falsas = JSON.parse(r2.stdout).summary.violations.filter(v => /ok\.ts$/.test(v.from));
    assert.deepStrictEqual(falsas, [], "lo permitido no debe violar nada");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

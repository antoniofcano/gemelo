"use strict";
// Los exportadores de tuberia/ deben funcionar en Windows, Linux y macOS (DECISIONS-PENDING nº 8, PLAN D4):
// las rutas se arman con os.path.join (o pathlib), nunca con un separador «\» escrito a mano.
const test = require("node:test"), assert = require("node:assert");
const { ficheros, lee } = require("./_util");

const PY = ficheros().filter(f => /^tuberia\/.+\.py$/.test(f));

// cadena raw con un trozo de ruta tras «\»: r"\lidar", r"datos\x.json", r"\ort\%s.jpg", r"\PNOA_*.laz"
const RAW = /\b[rR][bB]?(["'])[^"'\n]*?\\[\w%*?[\]-]+(?:\\|\.\w{2,5}\b|\1)/;
// cadena normal con «\\» delante de un nombre: "\\lidar", "datos\\x.json"
const ESCAPADA = /(["'])[^"'\n]*?\\\\[\w%*?[]/;

function rutasConBarra(f) {
  return lee(f).split("\n").map((l, i) => [l, i + 1])
    .filter(([l]) => !/^\s*#/.test(l) && (RAW.test(l) || ESCAPADA.test(l)))
    .map(([l, n]) => f + ":" + n + ": " + l.trim().slice(0, 120));
}

test("hay scripts de Python en tuberia/ que revisar", () => assert.ok(PY.length >= 20, "sólo " + PY.length + " .py en tuberia/"));

test("sin rutas con separador «\\» literal en tuberia/**/*.py (usar os.path.join o pathlib)", () => {
  const mal = PY.flatMap(rutasConBarra);
  assert.deepStrictEqual(mal, [], "rutas con «\\» fijo (sólo valen en Windows):\n" + mal.join("\n"));
});

test("quien usa os.path.join importa os", () => {
  const mal = PY.filter(f => /\bos\.path\.join\(/.test(lee(f)) && !/^(?:import [^\n]*\bos\b|from (?:comun|img_comun) import \*)/m.test(lee(f)));
  assert.deepStrictEqual(mal, [], "usan os.path.join sin importar os: " + mal.join(", "));
});

// el propio detector, contra casos conocidos (para que no se quede ciego sin que nadie lo note)
test("el detector reconoce rutas con «\\» y deja pasar las expresiones regulares y los escapes", () => {
  const malas = ['L = HD + r"\\lidar"', 'open(R + r"\\finca_ventana.json")', 'IM + r"\\ort\\%s.jpg" % k', 'glob.glob(DL + r"\\PNOA_2024_AND_40[456]-41[78]?_H30_NPC01.laz")', 'p = "datos\\\\x.json"', "q = r'datos\\tesela'"];
  const buenas = ['os.path.join(HD, "lidar")', 're.sub(r"(<h1>.*?</h1>\\s*)<p>.*?</p>", f, s)', 'newline="\\n"', 's.replace("\\ufffd", "í")', 'BASE + "/indice.json"'];
  for (const l of malas) assert.ok(RAW.test(l) || ESCAPADA.test(l), "no detecta: " + l);
  for (const l of buenas) assert.ok(!RAW.test(l) && !ESCAPADA.test(l), "falso positivo: " + l);
});

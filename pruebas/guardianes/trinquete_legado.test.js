"use strict";
// Trinquete del legado (ADR-0033 §6, MUNDOS §8 y §10): las líneas de apps/web/motor/*.js SOLO BAJAN. El tope está escrito aquí (TOPE) y es
// exacto: si el motor sube, falla («quien toca, migra»: lo nuevo va a apps/web/src/); si baja, también falla hasta que el mismo commit baje
// el tope al número nuevo, para que lo ganado no se pueda volver a gastar. Cada migración (talón, MUNDOS §9.3) lo actualiza a la baja.
// Se cuentan las líneas de código de cada módulo SIN su cabecera «Expone / Consume» (la deriva pruebas/contrato_modulos.js del código y
// puede crecer o encoger sola al regenerarse: no es código del legado).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const C = require(path.join(RAIZ, "pruebas", "contrato_modulos.js"));

// 2026-11-06, A1-7 (el puente, sin ningún módulo migrado aún): 92 ficheros, 19.774 líneas sin cabeceras (511 más de cabeceras)
const TOPE = 19774;

/** líneas de un texto (la última sin salto también cuenta) */
const lineas = s => s === "" ? 0 : s.split("\n").length - (s.endsWith("\n") ? 1 : 0);
/** el texto de un módulo sin la cabecera de contrato, como lo lee contrato_modulos.js */
const sinCabecera = s => s.startsWith(C.MARCA_I) ? s.slice(s.indexOf(C.MARCA_F) + C.MARCA_F.length + 1) : s;

function cuenta(dir = C.SRC) {
  const por = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".js")).sort()) por[f] = lineas(sinCabecera(fs.readFileSync(path.join(dir, f), "utf8")));
  return { total: Object.values(por).reduce((a, n) => a + n, 0), por };
}

test("trinquete del legado: las líneas de apps/web/motor/*.js (sin cabeceras) no pasan del tope y el tope está al día", t => {
  const { total, por } = cuenta();
  const grandes = Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => f + " " + n).join(", ");
  t.diagnostic("legado: " + total + " líneas en " + Object.keys(por).length + " ficheros (tope " + TOPE + "); los más grandes: " + grandes);
  assert.ok(total <= TOPE, "el legado ha SUBIDO a " + total + " líneas (tope " + TOPE + ", +" + (total - TOPE) + "). Lo nuevo va a apps/web/src/ " +
    "(CLAUDE.md §5 «Código nuevo», ADR-0033 §6); si de verdad hay que tocar el legado, que no crezca");
  assert.strictEqual(total, TOPE, "el legado ha bajado a " + total + " líneas: baja TOPE en pruebas/guardianes/trinquete_legado.test.js a " + total +
    " en este mismo commit (el trinquete solo baja)");
});

test("trinquete: el contador no se engaña (cabecera fuera, última línea sin salto dentro)", () => {
  assert.strictEqual(lineas(""), 0);
  assert.strictEqual(lineas("a\nb\n"), 2);
  assert.strictEqual(lineas("a\nb"), 2);
  const cab = C.MARCA_I + "\n// Expone: X\n// Consume: (nada de otros módulos)\n" + C.MARCA_F + "\n";
  assert.strictEqual(lineas(sinCabecera(cab + "  var X = 1;\n")), 1);
});

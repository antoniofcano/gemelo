"use strict";
const test = require("node:test"), assert = require("node:assert");
const { ficheros, esTexto, lee } = require("./_util");

const TEXTOS = ficheros().filter(esTexto);
// los patrones se construyen por partes para que este fichero no se marque a sí mismo
const RUTA_LOCAL = new RegExp("[A-Za-z]:[\\\\/]+" + "Users[\\\\/]", "i");
const RUTA_UNIX = new RegExp("/(?:home|Users)/" + "[A-Za-z0-9._-]+/");
const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/g;
const CORREOS_PERMITIDOS = new Set(["noreply@anthropic.com"]);
// dominios reservados para ejemplos (RFC 2606 / 6761): los usan las maquetas y la documentación; nunca son de una persona
const DOMINIO_DE_EJEMPLO = /@(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|test|invalid|example)$/i;
// Excepción acotada: npm copia en los package-lock.json los avisos «deprecated» de los paquetes, y alguno lleva el
// correo público de su mantenedor (p. ej. glob 10, dependencia transitiva de testcontainers en apps/api). Solo vale en
// un package-lock.json y solo si TODAS las líneas donde aparece ese correo son un campo "deprecated".
function enAvisoDeNpm(f, s, correo) {
  if (!/(^|\/)package-lock\.json$/.test(f)) return false;
  const lineas = s.split("\n").filter(l => l.includes(correo));
  return lineas.length > 0 && lineas.every(l => /^\s*"deprecated": "/.test(l));
}

test("hay ficheros de texto que revisar", () => assert.ok(TEXTOS.length > 50, "sólo " + TEXTOS.length));

test("sin marcas de conflicto de git", () => {
  const mal = TEXTOS.filter(f => /^(<{7} |={7}$|>{7} )/m.test(lee(f)));
  assert.deepStrictEqual(mal, [], "marcas de conflicto en: " + mal.join(", "));
});

test("todo en LF (sin CRLF)", () => {
  const mal = TEXTOS.filter(f => lee(f).includes("\r\n"));
  assert.deepStrictEqual(mal, [], "CRLF en: " + mal.join(", ") + "  (convierte a LF; .gitattributes ya lo fuerza al commitear)");
});

test("sin rutas locales de usuario (el repo es público)", () => {
  const mal = TEXTOS.filter(f => RUTA_LOCAL.test(lee(f)) || RUTA_UNIX.test(lee(f)));
  assert.deepStrictEqual(mal, [], "ruta local en: " + mal.join(", ") + "  (usa variables GEMELO_* o rutas relativas)");
});

test("sin correos electrónicos (salvo los permitidos)", () => {
  const mal = [];
  for (const f of TEXTOS) for (const m of lee(f).match(CORREO) || []) if (!CORREOS_PERMITIDOS.has(m.toLowerCase()) && !DOMINIO_DE_EJEMPLO.test(m) && !enAvisoDeNpm(f, lee(f), m)) mal.push(f + " → " + m);
  assert.deepStrictEqual(mal, [], "correos en lo versionado");
});

test("los ficheros de texto acaban en salto de línea", () => {
  const mal = TEXTOS.filter(f => { const s = lee(f); return s.length > 0 && !s.endsWith("\n"); });
  assert.deepStrictEqual(mal, [], "sin salto de línea final: " + mal.join(", "));
});

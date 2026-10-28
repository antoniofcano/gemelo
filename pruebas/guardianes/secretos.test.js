"use strict";
// El repo es público (ADR-0004): nada de claves, datos de la explotación ni ficheros pesados.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, ficheros, esTexto, lee, fs, path } = require("./_util");

const TODOS = ficheros();
const TEXTOS = TODOS.filter(esTexto);

// patrones de secretos conocidos (construidos por partes para no marcarse a sí mismos)
const SECRETOS = [
  ["clave privada", new RegExp("-----BEGIN [A-Z ]*PRIVATE" + " KEY-----")],
  ["clave de API de Google", new RegExp("AIza" + "[0-9A-Za-z_-]{35}")],
  ["token de GitHub", new RegExp("gh[pousr]_" + "[A-Za-z0-9]{36,}")],
  ["clave de AWS", new RegExp("AKIA" + "[0-9A-Z]{16}")],
  ["token de Slack", new RegExp("xox[baprs]-" + "[0-9A-Za-z-]{10,}")],
  ["cadena de conexión con contraseña", /\b\w+:\/\/[^\s:@/]+:[^\s:@/]{3,}@[^\s/]+/],
  ["asignación de secreto", /\b(?:api[_-]?key|secret|passwd|password|token)\b\s*[:=]\s*["'][A-Za-z0-9+/_-]{16,}["']/i],
];
const EXT_DATOS = /\.(laz|las|tif|tiff|npy|npz|bin|gpkg|shp|dbf|kml|kmz|xlsx|xls|csv|sqlite|db|pem|p12|jks|keystore)$/i;
const NOMBRES_PRIVADOS = /(^|\/)(serviceAccount[^/]*|\.env[^/]*|credentials[^/]*|id_rsa[^/]*)$/i;
const ARTEFACTO = /claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]{8,}/;                // enlaces a artefactos privados
const ID_ARTEFACTO = /\b(?:artefacto|artifact)\b[^\n]{0,40}`[A-Za-z0-9]{20,24}`/i;        // «artefacto `14sj…`»

test("sin secretos en los ficheros versionados", () => {
  const mal = [];
  for (const f of TEXTOS) { const s = lee(f); for (const [nombre, re] of SECRETOS) if (re.test(s)) mal.push(f + ": " + nombre); }
  assert.deepStrictEqual(mal, []);
});

test("sin ficheros de datos, credenciales ni binarios pesados", () => {
  const datos = TODOS.filter(f => EXT_DATOS.test(f) || NOMBRES_PRIVADOS.test(f));
  assert.deepStrictEqual(datos, [], "ficheros de datos o credenciales versionados (van fuera del repo)");
  const grandes = TODOS.filter(f => fs.statSync(path.join(RAIZ, f)).size > 400 * 1024 && f !== "package-lock.json");
  assert.deepStrictEqual(grandes, [], "ficheros de más de 400 KB (¿datos?): " + grandes.join(", "));
});

test("sólo hay imágenes del fixture sintético (ninguna ortofoto real)", () => {
  const img = TODOS.filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f));
  assert.deepStrictEqual(img.filter(f => !f.startsWith("pruebas/fixture/")), [], "imágenes fuera de pruebas/fixture/: ¿ortofotos reales?");
  img.forEach(f => assert.ok(fs.statSync(path.join(RAIZ, f)).size < 20 * 1024, f + ": una imagen del fixture no debe pasar de 20 KB"));
});

test("sin enlaces ni ids de artefactos privados en lo versionado (sólo se permiten en la propia explicación del guardián)", () => {
  const mal = TEXTOS.filter(f => !f.startsWith("pruebas/guardianes/")).filter(f => ARTEFACTO.test(lee(f)) || ID_ARTEFACTO.test(lee(f)));
  assert.deepStrictEqual(mal, [], "enlace o id de artefacto en: " + mal.join(", ") + " (el enlace va en privado, no en un repo público)");
});

// Excepciones con motivo: decisiones de Antonio aún abiertas (doc/rumbo/DECISIONS-PENDING.md). Cuando se cierren, se quitan de aquí;
// el test de abajo falla si una excepción ya no hace falta, para que no se queden olvidadas.
const EXCEPCIONES_ID_INTERNO = { "doc/historico/DISENO-2026-10.md": "DECISIONS-PENDING nº 2: cifras reales e id interno en una foto del diseño" };
const ID_INTERNO = /\(id interno\)|id\s+interno\s*[:=]\s*[A-Za-z0-9]{15,}/i;

test("sin ids internos de OlivarTrack en lo versionado (salvo las excepciones con motivo)", () => {
  const mal = TEXTOS.filter(f => !f.startsWith("pruebas/guardianes/") && !(f in EXCEPCIONES_ID_INTERNO) && ID_INTERNO.test(lee(f)));
  assert.deepStrictEqual(mal, [], "restos de ids internos en: " + mal.join(", "));
});

test("las excepciones de ids internos siguen haciendo falta", () => {
  for (const f of Object.keys(EXCEPCIONES_ID_INTERNO)) assert.ok(ID_INTERNO.test(lee(f)), f + " ya no tiene el patrón: quita la excepción");
});

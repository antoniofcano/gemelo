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
  ["JWT", new RegExp("\\beyJ" + "[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}")],
  ["clave de LiveKit en una asignación", new RegExp("LIVEKIT_API_(?:KEY|SECRET)\\s*[:=]\\s*[\"']?[A-Za-z0-9_+/-]{16,}")],
  ["par clave:secreto de LiveKit", new RegExp("\\bAPI" + "[A-Za-z0-9]{10,}\\s*:\\s*[A-Za-z0-9+/]{30,}")],
  ["clave de API de Anthropic", new RegExp("sk-" + "ant-[A-Za-z0-9_-]{20,}")],
  // L9-08: los nombres del repo son españoles (GEMELO_SESION_SECRETO, GEMELO_*_CLAVE): «secreto», «clave» o «contraseña» con un valor de 16 o más
  // caracteres con alguna cifra (un nombre de fichero o una expresión no casan: llevan punto o paréntesis detrás)
  ["asignación de secreto (en español)", new RegExp("(?:^|[^A-Za-z])(?:secret" + "o|clave|contrase[ñn]a)\\s*[:=]\\s*[\"']?(?=[A-Za-z0-9+/_-]*\\d)[A-Za-z0-9+/_-]{16,}(?![A-Za-z0-9+/_.-])", "i")],
  ["cabecera Bearer con token", new RegExp("\\bBear" + "er\\s+(?=[A-Za-z0-9._~+/-]*\\d)[A-Za-z0-9._~+/-]{20,}=*")],
];
const EXT_DATOS = /\.(laz|las|tif|tiff|npy|npz|bin|gpkg|shp|dbf|kml|kmz|xlsx|xls|csv|sqlite|db|pem|p12|jks|keystore)$/i;
const NOMBRES_PRIVADOS = /(^|\/)(serviceAccount[^/]*|\.env[^/]*|credentials[^/]*|id_rsa[^/]*)$/i;
const ARTEFACTO = /claude\.ai\/(?:(?:code\/|public\/)?artifacts?|chat|share)\/[A-Za-z0-9_-]{8,}/;      // enlaces a artefactos privados o publicados (public/artifacts/…) y a conversaciones (chat/…, share/…; L9-08)
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

// Excepción acotada (decisión de Antonio nº 30, ADR-0017): las tres fotos de campo del constructor de olivos (corteza, musgo, madera vieja),
// con su licencia al lado; ni ortofotos ni datos de la explotación. Solo esos tres nombres y hasta 160 KB cada una.
const TEXTURAS_OLIVO = ["apps/web/olivo/texturas/corteza.jpg", "apps/web/olivo/texturas/musgo.jpg", "apps/web/olivo/texturas/muerta.jpg"];

// Excepción acotada (decisión 98): los iconos de la aplicación (manifiesto web y apple-touch-icon), PNG generados con sharp desde
// apps/web/public/icono.svg por apps/web/herramientas/iconos.mjs. Icono provisional hasta la marca (decisión 44); en public/ no hay más imágenes que estas y las texturas de suelo (abajo).
const ICONOS_APP = /^apps\/web\/public\/icono-[a-z0-9-]+\.png$/;

// Excepción acotada (decisión de Antonio del 2026-11-04, EV-1s): las texturas de suelo que salen de fotos de campo de la finca (las fotos
// originales nunca entran), generadas por tuberia/suelo/construye.mjs: solo las clases del manifiesto, con hasta 2 variantes más (_v1, _v2),
// 768 o 384 px, hasta 340 KB cada una y 4,5 MB en total, con su LICENCIA.md al lado. Con las variantes (13 niveles) son 4,2 MB: los topes no cambian.
const TEXTURAS_SUELO = /^apps\/web\/public\/suelo\/(calle|hojarasca|tierra_grava|compost|ruedo|camino|piedra)(_v[12])?_(768|384)(_relieve)?\.webp$/;

test("sólo hay imágenes del fixture sintético (ninguna ortofoto real) y las texturas de campo del olivo y del suelo", () => {
  const img = TODOS.filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f));
  assert.deepStrictEqual(img.filter(f => !f.startsWith("pruebas/fixture/") && !TEXTURAS_OLIVO.includes(f) && !ICONOS_APP.test(f) && !TEXTURAS_SUELO.test(f)), [], "imágenes fuera de pruebas/fixture/: ¿ortofotos reales?");
  const suelo = img.filter(f => TEXTURAS_SUELO.test(f));
  suelo.forEach(f => assert.ok(fs.statSync(path.join(RAIZ, f)).size <= 340 * 1024, f + ": una textura de suelo no debe pasar de 340 KB"));
  assert.ok(suelo.reduce((s, f) => s + fs.statSync(path.join(RAIZ, f)).size, 0) <= 4.5 * 1024 * 1024, "las texturas de suelo no deben pasar de 4,5 MB en total");
  if (suelo.length) assert.ok(fs.existsSync(path.join(RAIZ, "apps", "web", "public", "suelo", "LICENCIA.md")), "las texturas de suelo van con su LICENCIA.md");
  img.filter(f => TEXTURAS_OLIVO.includes(f)).forEach(f => assert.ok(fs.statSync(path.join(RAIZ, f)).size <= 160 * 1024, f + ": una textura del olivo no debe pasar de 160 KB"));
  if (img.some(f => TEXTURAS_OLIVO.includes(f))) assert.ok(fs.existsSync(path.join(RAIZ, "apps", "web", "olivo", "texturas", "LICENCIA.txt")), "las texturas del olivo van con su LICENCIA.txt");
  img.filter(f => ICONOS_APP.test(f)).forEach(f => assert.ok(fs.statSync(path.join(RAIZ, f)).size <= 30 * 1024, f + ": un icono no debe pasar de 30 KB"));
  img.filter(f => f.startsWith("pruebas/fixture/")).forEach(f => assert.ok(fs.statSync(path.join(RAIZ, f)).size < 20 * 1024, f + ": una imagen del fixture no debe pasar de 20 KB"));
});

test("sin enlaces ni ids de artefactos privados en lo versionado (sólo se permiten en la propia explicación del guardián)", () => {
  const mal = TEXTOS.filter(f => !f.startsWith("pruebas/guardianes/")).filter(f => ARTEFACTO.test(lee(f)) || ID_ARTEFACTO.test(lee(f)));
  assert.deepStrictEqual(mal, [], "enlace o id de artefacto en: " + mal.join(", ") + " (el enlace va en privado, no en un repo público)");
});

// L9-08: los patrones nuevos (JWT, LiveKit, Anthropic, artefactos publicados) marcan lo que deben y no lo parecido.
// Las muestras se construyen por partes, como en SECRETOS, para no marcarse a sí mismas.
test("los patrones nuevos de secretos y de artefactos publicados reconocen lo que deben y no lo parecido", () => {
  const re = nombre => SECRETOS.find(([n]) => n === nombre)[1];
  const jwt = "eyJ" + "hbGciOiJIUzI1NiJ9." + "eyJzdWIiOiJ1c3VhcmlvIn0." + "sGdQ3vT8kLm2Wz9xYb0c";
  const lkKey = "LIVEKIT_API_KEY=" + "APIaB3dE5fG7hJ9k";
  const lkPar = "API" + "aB3dE5fG7hJ9kL1m: " + "xY4zW8qR2tV6uP0sN3dF5gH7jK9lM1nB3vC5";
  const anth = "sk-" + "ant-" + "api03-a1B2c3D4e5F6g7H8i9J0k1L2";
  const art = "https://claude.ai/" + "public/" + "artifacts/" + "14sjQ8vR2mXk";
  const marca = (nombre, s) => assert.match(s, re(nombre), nombre + " debería marcarse: " + s);
  const deja = (nombre, s) => assert.doesNotMatch(s, re(nombre), nombre + " no debería marcarse: " + s);
  marca("JWT", "Authorization: " + jwt);
  deja("JWT", "eyJ sin partes, o «eyJ…» en un texto de ejemplo");
  deja("JWT", "un token de una sola parte " + "eyJ" + "hbGciOi");
  marca("clave de LiveKit en una asignación", lkKey);
  marca("clave de LiveKit en una asignación", "LIVEKIT_API_SECRET=" + "xY4zW8qR2tV6uP0sN3dF5gH7jK9l");
  deja("clave de LiveKit en una asignación", "LIVEKIT_API_KEY=${GEMELO_LIVEKIT_KEY}");
  deja("clave de LiveKit en una asignación", "LIVEKIT_API_KEY=devkey");
  marca("par clave:secreto de LiveKit", lkPar);
  deja("par clave:secreto de LiveKit", "APIsintetica1 y, luego, texto corto: sí");
  marca("clave de API de Anthropic", anth);
  deja("clave de API de Anthropic", "sk-ant-… (ejemplo sin clave) y sk-ant-api");
  assert.match(art, ARTEFACTO, "el enlace de public/artifacts se marca");
  assert.match("https://claude.ai/" + "chat/" + "0f3c9a2e-1b2c", ARTEFACTO, "un enlace a una conversación se marca");
  assert.doesNotMatch("claude.ai/chat (sin id)", ARTEFACTO);
  // L9-08: secreto, clave o contraseña en español, y Bearer (valores inventados)
  const sec = "Ab3dE5fG7hJ9kL1m" + "Np2Q";
  marca("asignación de secreto (en español)", "GEMELO_SESION_" + "SECRETO=" + sec);
  marca("asignación de secreto (en español)", "clave" + ": \"" + sec + "\"");
  marca("asignación de secreto (en español)", "contraseña = '" + sec + "'");
  deja("asignación de secreto (en español)", "clave: \"contratos/livekit-roles.json\"");
  deja("asignación de secreto (en español)", "secreto: \"c\".repeat(16)");
  deja("asignación de secreto (en español)", "GEMELO_SESION_SECRETO_FICHERO=/run/secrets/sesion");
  deja("asignación de secreto (en español)", "clave: AbrirLaPuertaDelCortijo");
  marca("cabecera Bearer con token", "Authorization: Bear" + "er " + sec + "xY7z");
  deja("cabecera Bearer con token", "Authorization: Bearer <token>");
  deja("cabecera Bearer con token", "Bearer ${TOKEN}");
  assert.doesNotMatch("claude.ai/public/artifacts/ (sin id) y la salida artefacto de claude.ai se retiró", ARTEFACTO);
});

// Sin excepciones: la última (doc/historico/DISENO-2026-10.md) se quitó al anonimizarlo (DECISIONS-PENDING nº 2, 2026-10-28).
const ID_INTERNO = /\(id interno\)|id\s+interno\s*[:=]\s*[A-Za-z0-9]{15,}/i;

test("sin ids internos de OlivarTrack en lo versionado", () => {
  const mal = TEXTOS.filter(f => !f.startsWith("pruebas/guardianes/") && ID_INTERNO.test(lee(f)));
  assert.deepStrictEqual(mal, [], "restos de ids internos en: " + mal.join(", "));
});

// Decisión 219 (Antonio, 2026-11-06; L9-01, L9-02): las referencias de parcela y las coordenadas exactas de las fincas no se versionan.
// Viven en GEMELO_DATOS, fuera del repo (Hituelo, el único mundo: decisiones 22 y 229). Los datos sintéticos
// usan cajas de 500000, 4100000 o de 430000, 4180000 y el polígono 9 (la forma de los ids de OlivarTrack en las grabaciones: «loma-(polígono-9-parcela-8)»). Patrones construidos por partes para no marcarse a sí mismos.
const EXPLOTACION = [
  ["referencia de polígono y parcela", new RegExp("pol(?:[ií]gono|\\.)[-_\\s]*(?!9\\D)\\d+[-_\\s,.]*parc(?:ela|\\.)?[-_\\s]*\\d+", "i")],
  ["coordenada UTM norte de la zona de las fincas", new RegExp("\\b417" + "[5-9]\\d{3}(?:\\.\\d+)?\\b")],
  // L9-08 / L9-02: la franja norte de la zona de las dos fincas (N entre los km 4.165 y 4.179: un rango, no un valor) con precisión de metro, también escrita
  // con puntos o espacios de millares; un múltiplo de 1.000 m (la comarca) no se marca. Los sintéticos van del km 4.180 en adelante
  ["coordenada UTM norte de la zona, con precisión de metro", new RegExp("\\b41" + "(?:6[5-9]|7\\d)(?!000\\b)\\d{3}(?:\\.\\d+)?\\b")],
  ["coordenada UTM norte de la zona, con separadores de millares", new RegExp("\\b4[.\\s]1" + "(?:6[5-9]|7\\d)[.\\s](?!000\\b)\\d{3}(?:,\\d+)?\\b")],
  // L9-08 (remate): la franja ESTE de la zona (E entre los km 405 y 429 del huso 30: un rango de comarca, no un valor) con precisión de metro; un múltiplo
  // de 1.000 m no se marca, ni un color (#4…), ni un decimal ni un trozo de otro número. Los sintéticos usan 400000 (y 400100), 430000 y 500000, fuera de la franja.
  // Con separadores de millares solo tras una etiqueta de este (E, X, este): «412.345» a secas es demasiado parecido a una medida con decimales
  ["coordenada UTM este de la zona, con precisión de metro", new RegExp("(?<![#\\w.,-])4" + "(?:0[5-9]|[12]\\d)(?!000\\b)\\d{3}(?:\\.\\d+)?\\b")],
  ["coordenada UTM este de la zona, con separadores de millares", new RegExp("\\b(?:E|X|este)\\s*[:=≈]\\s*4" + "(?:0[5-9]|[12]\\d)[.\\s](?!000\\b)\\d{3}(?:,\\d+)?\\b", "i")],
  ["latitud y longitud con más precisión que la comarca", new RegExp("\\b3[78]\\.\\d{2,}\\s*[,;]\\s*(?:LON\\s*=\\s*)?[-−]\\s?[34]\\.\\d{2,}")],
  ["latitud asignada con más precisión que la comarca", new RegExp("\\b(?:LAT|lat|fi)\\s*=\\s*3[78]\\.\\d{2,}")],
];

test("los patrones de datos de la explotación reconocen lo que deben y no lo sintético", () => {
  const debe = ["pol" + "ígono-12-parcela-345", "Pol" + ". 12 Parc. 345", "[40" + "0000, 41" + "77123]", "37" + ".731, -4.006", "LAT = 37" + ".73, LON = -4.006", "fi = 37" + ".73 * Math.PI",
    "N = 4." + "172.345", "centro [41" + "68321.5]", "4 1" + "71 234",   // L9-08: la zona en rango, con y sin separadores (valores inventados)
    "centro_utm: [4" + "17345, 4100000]", "E = 4" + "06789.25", "x: 4" + "29001", "E = 4" + "13.582", "este: 4" + "21 007"];   // L9-08: el este de la zona (inventados)
  const no = ["loma-(polígono-9-parcela-8)", "centro_utm: [500000, 4100000]", "const CX = 430000, CY = 4180000;", "LAT = 37.7, LON = -4.0", "poligono de la parcela", "4100150",
    "4180020.25", "4.180.096", "N ≈ 4.178.000 (la comarca)", "4194304", "41" + "70000",
    "x: 400100", "E 400010,04", "E = 430000", "[400000, 4100000]", "E ≈ 4" + "12.000 (la comarca)", "4" + "15000", "background: \"#4" + "06020\"", "0.4" + "12345", "1.4" + "12345 m",
    "el lote 4" + "123456", "tardó 4" + "12.345 ms"];
  for (const s of debe) assert.ok(EXPLOTACION.some(([, re]) => re.test(s)), "debería marcarse: " + s);
  for (const s of no) assert.ok(!EXPLOTACION.some(([, re]) => re.test(s)), "no debería marcarse: " + s);
});

test("sin referencias de parcela ni coordenadas exactas de las fincas en lo versionado (decisión 219)", () => {
  const mal = [];
  for (const f of TEXTOS) { if (f === "package-lock.json" || /(^|\/)package-lock\.json$/.test(f)) continue; const s = lee(f); for (const [nombre, re] of EXPLOTACION) if (re.test(s)) mal.push(f + ": " + nombre); }
  assert.deepStrictEqual(mal, [], "datos de la explotación en: " + mal.join(", ") + " (van a GEMELO_DATOS, no al repo público)");
});

"use strict";
// AG-0.3: UNA sola detección del aparato (apps/web/src/nucleo/aparato.ts; su talón, apps/web/motor/01a_aparato.js). En Node, sin navegador:
//   · MU5-n (A3-8a): la clasificación, la política, las capacidades, la línea, el módulo sobre un navigator de mentira y Aparato.pon pasaron a Vitest
//     (apps/web/src/nucleo/aparato.test.ts) con el código; aquí queda lo que cruza con el legado:
//   · el talón evaluado con el Nucleo de verdad sobre un navigator de mentira (y window.__aparato);
//   · el guardián: ningún fichero de apps/web/motor/ lee userAgent, deviceMemory, hardwareConcurrency ni maxTouchPoints (solo src/nucleo/aparato.ts);
//   · los consumidores (02_mundo, 07ab, 07b, …) preguntan a Aparato, y en 02_mundo se ve el efecto por clase.
// HONESTIDAD: los agentes de la tabla están reconstruidos a mano del formato conocido de cada navegador (no capturados en el aparato). Lo que NO está
// probado: un Quest ni un iPhone reales (qué anuncia de verdad su agente y qué mide su WebGL), ni el Vision Pro (¿maxTouchPoints?).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const { aparatoDe, modulo } = require("./_aparato");
const MUNDOS = require(path.join(RAIZ, "apps/web/src/mundos/index.ts"));   // MU5-n: el Mundo vive en src/mundos/exterior/teselas.ts; 02_mundo.js lo crea con Mundos.creaMundo

const MOTOR = path.join(RAIZ, "apps", "web", "motor");

const UA = {
  quest3: "Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/35.0.0.1.58 SamsungBrowser/4.0 Chrome/126.0.0.0 VR Safari/537.36",
  quest3s: "Mozilla/5.0 (Linux; Android 12; Quest 3S) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/37.0.0.0.0 Chrome/130.0.0.0 VR Safari/537.36",
  quest2: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/30.0.0.4.8 SamsungBrowser/4.0 Chrome/112.0.0.0 Mobile VR Safari/537.36 Quest 2",
  questPro: "Mozilla/5.0 (Linux; Android 12; Quest Pro) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/33.0.0.0.0 Chrome/120.0.0.0 VR Safari/537.36",
  quest1: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/12.0.0.4.8 Chrome/83.0.4103.106 Mobile VR Safari/537.36",
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  chromeLinux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  firefoxWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadMovil: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadComoMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  visionPro: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/2.0 Safari/605.1.15 (visionOS Safari)"
};

test("el talón de 01a_aparato.js, con el Nucleo de verdad: el Aparato del navigator que se le da y window.__aparato", () => {
  const ventana = {}, { Aparato, AparatoPuro } = modulo({ userAgent: UA.quest3, deviceMemory: 8 }, ventana);
  assert.deepStrictEqual([Aparato.clase(), Aparato.modelo(), Aparato.politica().perfilOlivos], ["quest", "quest-3", "gafas"]);
  assert.strictEqual(typeof ventana.__aparato, "function"); assert.strictEqual(ventana.__aparato().clase, "quest");
  assert.strictEqual(AparatoPuro.clasifica(UA.iphone, 5).clase, "movil");
  assert.strictEqual(aparatoDe(undefined).clase(), "escritorio", "sin navigator: escritorio");
});

test("guardián: solo src/nucleo/aparato.ts (por el talón 01a_aparato.js) lee userAgent, deviceMemory, hardwareConcurrency ni maxTouchPoints; el resto pregunta a Aparato", () => {
  const sinCom = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
  const PROHIBIDO = /\b(userAgent|userAgentData|deviceMemory|hardwareConcurrency|maxTouchPoints)\b/;
  // lista cerrada de excepciones, cada una con su motivo (hoy ninguna: 30_mide pide el agente en bruto a Aparato.agente())
  const EXCEPCIONES = {};
  const lectores = fs.readdirSync(MOTOR).filter(f => f.endsWith(".js"))   // A3-8a: tampoco el talón 01a_aparato.js, que solo da el navigator
    .filter(f => PROHIBIDO.test(sinCom(fs.readFileSync(path.join(MOTOR, f), "utf8"))) && !EXCEPCIONES[f]);
  assert.deepStrictEqual(lectores, [], "estos ficheros detectan el aparato por su cuenta: que pregunten a Aparato (01a_aparato.js)");
  const yo = fs.readFileSync(path.join(RAIZ, "apps", "web", "src", "nucleo", "aparato.ts"), "utf8");   // A3-8a: el código, en el núcleo
  for (const k of ["userAgent", "deviceMemory", "hardwareConcurrency", "maxTouchPoints"]) assert.ok(yo.includes(k), "el módulo sí lee " + k);
  // y los 9 sitios de antes llaman a la API nueva
  const usa = { "02_mundo.js": "Aparato.politica().ortoMax", "07ab_generados.js": "Aparato.politica()", "07b_arboles.js": "Aparato.politica().olivosLigero", "26b_avatares.js": "Aparato.clase()",
    "30_mide.js": "Aparato.agente()", "38_presencia_compartida.js": "Aparato.clase()", "45_voz.js": "Aparato.clase()", "47_habla.js": "Aparato.clase()", "28_depura.js": "Aparato.linea()", "03_escena.js": "Aparato.enlaza" };
  for (const [f, s] of Object.entries(usa)) assert.ok(require("./_fuente").fuenteMotor(f).includes(s), f + " usa " + s);   // A3-2a: de un talón, también su .ts
});

test("01a_aparato.js monta antes que todos los que lo consumen (orden alfabético) y no consume nada de otros módulos", () => {
  const f = fs.readdirSync(MOTOR).filter(x => x.endsWith(".js")).sort();
  assert.strictEqual(f[0], "01_datos.js"); assert.strictEqual(f[1], "01a_aparato.js", "justo detrás de 01_datos.js, antes de 02_mundo.js");
  assert.match(fs.readFileSync(path.join(MOTOR, "01a_aparato.js"), "utf8"), /\/\/ Consume: \(nada de otros módulos\)/);
});

test("02_mundo por clase: ortoMax 20 en escritorio, 8 en móvil, en gafas y con poca memoria (se ve el efecto en el consumidor)", () => {
  const fuente = fs.readFileSync(path.join(MOTOR, "02_mundo.js"), "utf8");
  const TS = 256, D = { ts: TS, res: 1, srs: 2, centro_utm: [0, 0], teselas: { k0: { kx: 0, ky: 0, v: [0, 0, TS, TS], np: 0 } }, grueso: { b64: "", x0: 0, yN: TS, res: 8, w: 32, h: 32 }, mosaico: { x0: 0, yN: TS, w: 1, h: 1, res: 1 }, copas: [], marcados: [] };
  const max = nav => {
    const M = Function("Mundos", "Aparato", "D", "b64", "i16", "RES", "document", "performance", "location", "navigator", "fetch", "ndviRel", "rampa", fuente + "\nreturn Mundo;")(
      MUNDOS, aparatoDe(nav), D, () => new Uint8Array(0), () => new Int16Array(32 * 32), 1, { createElement: () => ({ width: 4, height: 4, getContext: () => ({}) }) }, { now: () => 0 }, { search: "" }, nav, () => new Promise(() => {}), () => 0, () => [0, 0, 0]);
    return M.ortoEstado().max;
  };
  assert.strictEqual(max({ userAgent: UA.chromeWin, deviceMemory: 8 }), 20);
  assert.strictEqual(max({ userAgent: UA.chromeWin, deviceMemory: 4 }), 8);
  assert.strictEqual(max({ userAgent: UA.iphone, maxTouchPoints: 5 }), 8);
  assert.strictEqual(max({ userAgent: UA.quest3, deviceMemory: 8 }), 8);
  assert.strictEqual(max(undefined), 20, "sin navigator: escritorio");
});

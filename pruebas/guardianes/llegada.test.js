"use strict";
// La llegada (apps/web/motor/12b_llegada.js): el trozo puro, en Node y sin navegador. Rayo → suelo (el punto que se apunta desde el aire en VR o con un
// clic en pantalla), sin anillo por detrás de la mirada, tamaño del anillo según la distancia, el aterrizaje fuera de troncos y el umbral toque/arrastre.
// Abajo, en el navegador (por el turno del banco): el Dron en pantalla (clic/arrastre, «Aterrizar aquí», Intro) y, opcional con GEMELO_VR=1, la VR simulada.
const test = require("node:test"), { describe, before } = test, assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/12b_llegada.js");
function puro() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "12b_llegada.js debe marcar su trozo puro con // [puro:inicio] y // [puro:fin]");
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn LlegadaPuro;")();
}
const P = puro();
const EXT = [-500, 500, 500, -500];   // D.ext = [x0, yNorte, x1, ySur]
const llano = () => 100;              // suelo a 100 m (ya con exageración)
const cerca = (a, b, tol) => Math.abs(a - b) <= tol;

test("rayo → suelo llano desde 230 m: toca donde se apunta", () => {
  const o = { x: 0, y: 330, z: 0 }, d = { x: 0, y: -230, z: -100 };   // a 100 m hacia el norte (z = −norte)
  const p = P.rayoSuelo(o, d, llano, EXT);
  assert.ok(p, "debería tocar suelo");
  assert.ok(cerca(p.x, 0, 0.01) && cerca(p.z, -100, 0.05) && cerca(p.y, 100, 1e-9), JSON.stringify(p));
  assert.ok(cerca(p.dist, Math.hypot(230, 100), 0.1));
});

test("rayo → suelo con relieve: el punto queda en la superficie y antes de la loma", () => {
  const loma = (x, z) => 100 + Math.max(0, 40 - Math.hypot(x, z + 350) * 0.4);   // una loma de 40 m centrada 350 m al norte
  const o = { x: 0, y: 300, z: 0 }, d = { x: 0, y: -0.5, z: -1 };
  const p = P.rayoSuelo(o, d, loma, EXT);
  assert.ok(p, "debería tocar la loma");
  assert.ok(cerca(p.y, loma(p.x, p.z), 0.05), "sobre la superficie: " + JSON.stringify(p));
  assert.ok(cerca(o.y + (d.y / Math.hypot(d.y, d.z)) * p.dist, p.y, 0.05), "en el rayo");
  const enLlano = P.rayoSuelo(o, d, llano, EXT);
  assert.ok(p.dist < enLlano.dist, "con la loma delante, el rayo toca antes que en llano");
});

test("rayo → suelo: sin punto si apunta al horizonte o hacia arriba, fuera de la finca, más allá del tope o desde bajo tierra", () => {
  const o = { x: 0, y: 330, z: 0 };
  assert.strictEqual(P.rayoSuelo(o, { x: 0, y: 0.2, z: -1 }, llano, EXT), null, "hacia arriba");
  assert.strictEqual(P.rayoSuelo(o, { x: 0, y: -0.01, z: -1 }, llano, EXT), null, "casi horizontal");
  assert.strictEqual(P.rayoSuelo(o, { x: 0, y: -230, z: -600 }, llano, EXT), null, "cae al norte de la finca");
  assert.strictEqual(P.rayoSuelo(o, { x: 0, y: -230, z: -498.5 }, llano, EXT), null, "dentro del margen de 3 m del borde");
  assert.ok(P.rayoSuelo(o, { x: 0, y: -230, z: -495 }, llano, EXT), "a 5 m del borde sí");
  assert.strictEqual(P.rayoSuelo(o, { x: 0, y: -230, z: -100 }, llano, EXT, 100), null, "más allá del tope de distancia");
  assert.strictEqual(P.rayoSuelo({ x: 0, y: 90, z: 0 }, { x: 0, y: -1, z: 0 }, llano, EXT), null, "el origen ya está bajo el suelo");
  assert.strictEqual(P.rayoSuelo(o, { x: 0, y: 0, z: 0 }, llano, EXT), null, "sin dirección");
});

test("sin anillo por detrás de la mirada", () => {
  const c = { x: 0, y: 330, z: 0 }, mira = { x: 0, y: 0, z: -1 };   // mira al norte, horizontal
  assert.ok(P.delante(c, mira, { x: 0, y: 100, z: -300 }), "delante y abajo");
  assert.ok(P.delante(c, mira, { x: 0, y: 100, z: 0 }), "justo debajo (90°) se admite");
  assert.ok(!P.delante(c, mira, { x: 0, y: 100, z: 300 }), "detrás");
  assert.ok(P.delante(c, { x: 0, y: -1, z: 0 }, { x: 0, y: 100, z: 300 }), "mirando abajo, un punto bajo y algo atrás está a la vista");
});

test("el anillo crece con la distancia (≈1,4°) entre 0,4 y 30 m", () => {
  assert.strictEqual(P.radioMarca(2), 0.4);
  assert.ok(cerca(P.radioMarca(250), 6.25, 1e-9));
  assert.strictEqual(P.radioMarca(5000), 30);
  for (let d = 10; d < 1200; d += 10) assert.ok(P.radioMarca(d + 10) >= P.radioMarca(d));
});

test("el aterrizaje se aparta de los troncos de olivo (0,55 m) y deja lo que no es olivo", () => {
  const copas = [{ x: 10, y: 20, oliv: true }, { x: 30, y: 40, oliv: false }];
  const a = P.fueraDeTroncos(10.1, -20, copas);   // escena: z = −norte
  assert.ok(cerca(Math.hypot(a.x - 10, a.z + 20), 0.55, 1e-9), JSON.stringify(a));
  const b = P.fueraDeTroncos(10, -20, copas);      // justo en el tronco
  assert.ok(cerca(Math.hypot(b.x - 10, b.z + 20), 0.55, 1e-9), JSON.stringify(b));
  assert.deepStrictEqual(P.fueraDeTroncos(30, -40, copas), { x: 30, z: -40 }, "no olivo: no se aparta");
  assert.deepStrictEqual(P.fueraDeTroncos(15, -20, copas), { x: 15, z: -20 }, "lejos: no se toca");
});

test("dentro de la finca, con 3 m de margen", () => {
  assert.ok(P.dentro(0, 0, EXT)); assert.ok(P.dentro(496, -496, EXT));
  assert.ok(!P.dentro(498, 0, EXT)); assert.ok(!P.dentro(0, 498, EXT)); assert.ok(!P.dentro(0, -498, EXT));
});

test("toque frente a arrastre: umbral de movimiento (px) y de tiempo (ms)", () => {
  assert.ok(P.esToque(0, 120, "mouse"), "clic quieto");
  assert.ok(P.esToque(5, 300, "mouse"));
  assert.ok(!P.esToque(7, 100, "mouse"), "el ratón se ha movido: arrastre");
  assert.ok(P.esToque(11, 200, "touch"), "con el dedo se tolera más temblor");
  assert.ok(!P.esToque(13, 200, "touch"), "arrastrar con el dedo no pone anillo");
  assert.ok(!P.esToque(0, P.TOQUE_MS + 1, "touch"), "pulsación larga: no");
  assert.ok(P.esToque(3, 200, undefined), "tipo desconocido: como el ratón");
});

// ---------- en el navegador (Cerro del fixture, por file://). Chrome por lanza(): el compartido de la puerta o uno propio dentro del turno del banco.
// Comprueban la LÓGICA (dónde acaba el usuario, qué modo, sin errores); no dicen nada de comodidad ni de fps en un iPhone, un Android o unas Quest.
const { pathToFileURL } = require("url");
const { RAIZ, propia, python, fixture, ejecuta, path } = require("./_util");
const { motivoSalto, lanza } = require("./_navegador");
const SALTO = motivoSalto("la llegada en el navegador (Dron y VR)");
let nav, url, preparado = null;
const prepara = () => preparado || (preparado = (async () => {
  const FIX = path.relative(RAIZ, fixture()), pag = path.join(propia("llegada"), "cerro", "index.html");
  const r = ejecuta(python(), ["-I", "tuberia/salida_artefacto/montar_v2.py", "--datos", FIX + "/cerro/embebido.json", "--salida", path.relative(RAIZ, pag)]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  url = pathToFileURL(pag).href; nav = await lanza();
})());
test.after(async () => { if (nav) await nav.close(); });
async function abre(mockXR) {
  const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
  if (mockXR) await p.addInitScript({ content: lee("pruebas/mock_xr.js") });
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
  p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.goto(url + "?debug");
  await p.waitForFunction(() => window.__g && window.__g.listo() && window.__llegada, null, { timeout: 90000, polling: 500 });
  return { p, errores };
}
const LL = p => p.evaluate(() => window.__llegada());

// en su propio grupo: el turno del banco se espera en su before (sin tope), no dentro del tope de cada prueba ni antes de las de Node
describe("en el navegador", () => {
before(async () => { if (!SALTO) await prepara(); });

test("pantalla, con el Dron: arrastrar no pone anillo, un clic sí (otro lo mueve), Intro aterriza en él andando; sin anillo, «Aterrizar» guarda el Dron", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  await prepara();
  const { p, errores } = await abre(false);
  try {
    await p.click("#btnPaseo"); await p.waitForTimeout(3500);
    await p.keyboard.press("KeyE"); await p.waitForTimeout(800);
    let s = await LL(p);
    assert.ok(s.paseando && s.enDron, "no se sacó el Dron: " + JSON.stringify(s));
    assert.ok(s.boton && !s.boton.hidden && s.boton.texto === "Aterrizar", "el botón de aterrizar, sin anillo: " + JSON.stringify(s.boton));
    const caja = await p.locator("#lienzo").boundingBox(), px = caja.x + caja.width * 0.5, py = caja.y + caja.height * 0.82;
    // arrastrar (60 px) no pone anillo
    await p.mouse.move(px, py); await p.mouse.down(); await p.mouse.move(px + 30, py - 10, { steps: 4 }); await p.mouse.move(px + 60, py - 20, { steps: 4 }); await p.mouse.up();
    s = await LL(p); assert.strictEqual(s.punto, null, "un arrastre ha puesto el anillo");
    // un clic sí, y otro lo mueve
    await p.mouse.click(px, py); s = await LL(p);
    assert.ok(s.punto && s.visible && s.boton.texto === "Aterrizar aquí", "el clic en el suelo no puso el anillo: " + JSON.stringify(s));
    const p1 = s.punto;
    await p.mouse.click(px - caja.width * 0.15, py - caja.height * 0.05); s = await LL(p);
    assert.ok(s.punto && Math.hypot(s.punto[0] - p1[0], s.punto[2] - p1[2]) > 0.3, "otro clic no movió el anillo: " + JSON.stringify([p1, s.punto]));
    const meta = s.punto, n0 = s.n;
    await p.keyboard.press("Enter");
    await p.waitForFunction(n => { const l = window.__llegada(); return l.n > n && !l.fundiendo; }, n0, { timeout: 20000, polling: 100 });
    s = await LL(p);
    assert.ok(s.paseando && !s.enDron, "tras aterrizar: andando y sin Dron: " + JSON.stringify(s));
    assert.ok(Math.hypot(s.pp[0] - meta[0], s.pp[1] + meta[2]) <= 0.6, "de pie en el anillo (± 0,55 m de troncos): " + JSON.stringify({ pp: s.pp, meta }));
    assert.ok(s.boton.hidden && s.punto === null && !s.visible, "el anillo y el botón se van con el Dron");
    // sin anillo: «Aterrizar» guarda el Dron donde estás, sin salto
    await p.keyboard.press("KeyE"); await p.waitForTimeout(600); const antes = (await LL(p)).pp;
    await p.click("#padAterriza"); await p.waitForTimeout(600); s = await LL(p);
    assert.ok(!s.enDron && s.n === n0 + 1 && Math.hypot(s.pp[0] - antes[0], s.pp[1] - antes[1]) < 1, "sin anillo, aterrizar no salta: " + JSON.stringify(s));
    assert.deepStrictEqual(errores, []);
  } finally { await p.close(); }
});

// OPCIONAL (GEMELO_VR=1), como las demás VR con el mock: con SwiftShader la VR es inestable («Target crashed», vr.test.js).
test("VR simulada, desde el mirador: el rayo pone el anillo donde se apunta (no por detrás) y al soltar se aparece de pie allí, andando", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  if (!process.env.GEMELO_VR) return t.skip("opcional: define GEMELO_VR=1 para el teletransporte desde el aire con el WebXR simulado");
  await prepara();
  const { p, errores } = await abre(true);
  const dbg = () => p.evaluate(() => window.__vrDebug());
  const fot = async n => { const f0 = await p.evaluate(() => window.__mockXR.fotogramas); await p.waitForFunction(f => window.__mockXR.fotogramas >= f, f0 + n, { timeout: 60000, polling: 100 }); };
  const pulsa = async (mano, k) => { await p.evaluate(a => window.__mockXR.boton(a[0], a[1], true), [mano, k]); await fot(3); await p.evaluate(a => window.__mockXR.boton(a[0], a[1], false), [mano, k]); await fot(3); };
  // del mundo al espacio físico del mock: mundo − rig, deshaciendo el giro del rig
  const fisica = (r, w) => { const c = Math.cos(-r.yaw), s = Math.sin(-r.yaw), x = w[0] - r.x, y = w[1] - r.y, z = w[2] - r.z; return [x * c + z * s, y, -x * s + z * c]; };
  try {
    await p.waitForSelector("#btnVR", { timeout: 30000 }); await p.click("#btnVR");
    await p.waitForFunction(() => window.__vrDebug && window.__vrDebug().on, null, { timeout: 60000, polling: 200 });
    await fot(4); await pulsa("right", 5);   // B: el mirador (~230 m, volando)
    let d = await dbg();
    const suelo0 = await p.evaluate(c => window.__g.suelo(c[0], -c[2]) * window.__vrDebug().exag, d.cabeza);
    assert.ok(d.vuelo && d.rig.y - suelo0 > 150, "B no subió al mirador: " + JSON.stringify({ rig: d.rig, suelo0 }));
    const punto = dz => p.evaluate(a => { const x = a[0][0], z = a[0][2] + a[1]; return [x, window.__g.suelo(x, -z) * window.__vrDebug().exag, z]; }, [d.cabeza, dz]);
    const meta = await punto(-60), atras = await punto(60);   // 60 m al norte (delante: el mock mira al norte) y 60 m al sur (detrás)
    // por detrás de la mirada: sin anillo
    await p.evaluate(v => { window.__mockXR.apunta("right", v); window.__mockXR.ejes("right", 0, -1); }, fisica(d.rig, atras)); await fot(4);
    let s = await LL(p), v = await p.evaluate(() => window.__vrVuelo());
    assert.ok(v.apuntando && v.linea && s.punto === null, "por detrás no debe haber anillo: " + JSON.stringify({ s, v }));
    // delante: anillo donde se apunta, que crece con la distancia
    await p.evaluate(v => window.__mockXR.apunta("right", v), fisica(d.rig, meta)); await fot(4);
    s = await LL(p);
    assert.ok(s.punto && Math.hypot(s.punto[0] - meta[0], s.punto[2] - meta[2]) < 2, "el anillo no está donde se apunta: " + JSON.stringify({ punto: s.punto, meta }));
    assert.ok(s.visible && s.radio > 3, "desde 230 m el anillo debería medir varios metros: " + s.radio);
    const n0 = s.n;
    await p.evaluate(() => window.__mockXR.ejes("right", 0, 0));
    await p.waitForFunction(n => window.__llegada().n > n && window.__vrVuelo().fundido === 0, n0, { timeout: 60000, polling: 100 });
    await fot(3); d = await dbg();
    const suelo = await p.evaluate(c => window.__g.suelo(c[0], -c[2]) * window.__vrDebug().exag, d.cabeza);
    assert.ok(!d.vuelo, "tras bajar: andando, no volando");
    assert.ok(Math.hypot(d.cabeza[0] - meta[0], d.cabeza[2] - meta[2]) < 2, "la cabeza no acabó en el punto: " + JSON.stringify({ cab: d.cabeza, meta }));
    assert.ok(Math.abs(d.rig.y - suelo) < 0.6 && Math.abs(d.cabeza[1] - d.rig.y - 1.6) < 0.1, "de pie en el suelo: " + JSON.stringify({ rig: d.rig.y, suelo, cab: d.cabeza[1] }));
    assert.strictEqual((await LL(p)).visible, false, "el anillo se va al llegar");
    await p.evaluate(() => window.__mockXR.sesion.end()); await p.waitForFunction(() => !window.__vrDebug().on, null, { timeout: 30000, polling: 200 });
    assert.deepStrictEqual(errores, []);
  } finally { await p.close(); }
});
});

"use strict";
// EV2-B1 y EV2-B2 · la palanca para andar (PalancaPuro en apps/web/motor/12_paseo.js; módulo apps/web/motor/34b_palanca.js): en Node, sin navegador.
// Lo puro: zona muerta del 15 %, velocidad proporcional, saturación, dirección relativa a la cámara, giro y cuándo se enciende (por defecto sí en táctil;
// apagada con ?palanca=0 o el ajuste; nada en escritorio). Y sobre las fuentes: sin bandera el módulo no hace nada, estilos sin atributo style=, cruceta intacta.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const PASEO = lee("apps/web/motor/12_paseo.js"), MOD = lee("apps/web/motor/34b_palanca.js"), PL = lee("apps/web/plantilla.html"), css = lee("apps/web/plantilla.css");
function puro() {
  const i = PASEO.indexOf("// [puro:inicio]"), f = PASEO.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "12_paseo.js debe marcar el trozo puro de la palanca con // [puro:inicio] y // [puro:fin]");
  return new Function("\"use strict\";\n" + PASEO.slice(i, f) + "\nreturn PalancaPuro;")();
}
const P = puro(), cerca = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, (m || "") + " " + a + " ≠ " + b);

test("zona muerta del 15 %: dentro no se mueve, justo fuera sí y sin salto", () => {
  assert.strictEqual(P.ZONA_MUERTA, 0.15);
  for (const [x, y] of [[0, 0], [0.1, 0], [0, 0.15], [0.1, 0.1], [-0.14, 0.01]]) assert.deepStrictEqual(P.lee(x, y), { fuerza: 0, av: 0, lat: 0 }, x + "," + y);
  const fuera = P.lee(0, 0.1501); assert.ok(fuera.fuerza > 0 && fuera.fuerza < 0.001, "continuo en el borde: " + fuera.fuerza);
});

test("velocidad proporcional al desplazamiento y saturada en 1", () => {
  cerca(P.lee(0, 0.575).fuerza, 0.5, "mitad del recorrido útil");
  assert.ok(P.lee(0, 0.4).fuerza < P.lee(0, 0.6).fuerza && P.lee(0, 0.6).fuerza < P.lee(0, 0.9).fuerza, "crece con el desplazamiento");
  cerca(P.lee(0, 1).fuerza, 1); cerca(P.lee(0, 5).fuerza, 1, "más allá del radio no pasa de 1"); cerca(P.lee(30, 40).fuerza, 1);
  for (const v of [P.lee(3, 4), P.lee(-1, -1), P.lee(0.3, -0.7)]) assert.ok(Math.hypot(v.av, v.lat) <= 1 + 1e-9, "|av,lat| ≤ 1");
});

test("avance y lado: delante, atrás, derecha, izquierda y diagonales", () => {
  const d = P.lee(0, 1), a = P.lee(0, -1), r = P.lee(1, 0), i = P.lee(-1, 0), dg = P.lee(0.7, 0.7);
  cerca(d.av, 1); cerca(d.lat, 0); cerca(a.av, -1); cerca(r.lat, 1); cerca(r.av, 0); cerca(i.lat, -1);
  cerca(dg.av, dg.lat, "diagonal"); assert.ok(dg.av > 0.5 && dg.lat > 0.5 === false || dg.av > 0, "la diagonal avanza y se desplaza");
  cerca(Math.hypot(dg.av, dg.lat), dg.fuerza);
  assert.deepStrictEqual(P.lee(undefined, "x"), { fuerza: 0, av: 0, lat: 0 }, "valores raros: quieto, no NaN");
});

test("la dirección es relativa a la cámara (al rumbo del paseante): delante es siempre «hacia donde miras»", () => {
  // x al este, y al norte; ang 0 = norte, crece hacia el este (como pp.ang de 12_paseo.js)
  const m = (av, lat, ang) => { const v = P.mundo(av, lat, ang); return [Math.round(v.x * 1e9) / 1e9 + 0, Math.round(v.y * 1e9) / 1e9 + 0]; };
  assert.deepStrictEqual(m(1, 0, 0), [0, 1], "mirando al norte, delante = norte");
  assert.deepStrictEqual(m(1, 0, Math.PI / 2), [1, 0], "mirando al este, delante = este");
  assert.deepStrictEqual(m(1, 0, Math.PI), [0, -1].map(n => n + 0), "mirando al sur, delante = sur");
  assert.deepStrictEqual(m(0, 1, 0), [1, 0], "mirando al norte, la derecha es el este");
  assert.deepStrictEqual(m(0, 1, Math.PI / 2), [0, -1], "mirando al este, la derecha es el sur");
  for (const ang of [0.3, 1.7, -2.2]) { const v = P.mundo(0.6, -0.8, ang); cerca(Math.hypot(v.x, v.y), 1, "girar no cambia la velocidad"); }
});

test("el giro al arrastrar la otra mitad usa la sensibilidad de Configuración", () => {
  cerca(P.giro(100, 1), 0.6); cerca(P.giro(100, 2), 1.2); cerca(P.giro(-50, 0.4), -0.12);
  cerca(P.giro(100, 0), 0.6, "sensibilidad no válida: 1×"); cerca(P.giro(NaN, 1), 0);
});

test("se enciende por defecto en táctil; ?palanca=0 o el ajuste la apagan; en escritorio no aparece", () => {
  assert.strictEqual(P.activa(true, true, ""), true, "táctil y ajuste por defecto: encendida");
  assert.strictEqual(P.activa(true, undefined, "?debug"), true);
  assert.strictEqual(P.activa(true, true, "?palanca=0"), false, "la URL la apaga");
  assert.strictEqual(P.activa(true, true, "?debug&palanca=0&x=1"), false);
  assert.strictEqual(P.activa(true, false, ""), false, "el ajuste en no la apaga");
  assert.strictEqual(P.activa(false, true, ""), false, "escritorio sin táctil: nada");
  assert.strictEqual(P.activa(false, true, "?palanca=1"), true, "?palanca=1 la fuerza (probar con ratón)");
  assert.strictEqual(P.activa(true, false, "?palanca=1"), true, "la URL manda sobre el ajuste");
  assert.strictEqual(P.activa(true, true, "?palancas=0"), true, "otro parámetro no cuenta");
});

test("sin bandera el módulo no hace nada: nipplejs solo se pide encendida y con paseo; la cruceta sigue ahí", () => {
  assert.match(MOD, /import\("nipplejs"\)/, "nipplejs por import() perezoso");
  assert.ok(!/^\s*import\s+[\w{*]/m.test(MOD), "sin import estático: apagada no se descarga");
  assert.match(MOD, /if \(q && paseando\) enciende\(\); else if \(!q\) apaga\(\)/, "solo enciende si quiere y se pasea");
  assert.match(MOD, /PalancaPuro\.activa\(tac, aj, location\.search\)/, "la decisión es la pura");
  assert.match(css, /\.palanca \{[^}]*display: none/, "la zona está oculta por defecto");
  assert.match(css, /\[data-palanca="si"\] \.visor\.paseo \.palanca \{ display: block/, "solo se ve con la bandera y paseando");
  assert.match(css, /\[data-palanca="si"\] \.visor\.paseo \.pad-mov \{ display: none/, "la cruceta solo se esconde con la palanca encendida");
  for (const id of ["pad-up", "pad-down", "pad-left", "pad-right", "padMov"]) assert.match(PL, new RegExp('id="' + id + '"'), "la cruceta sigue en la plantilla: " + id);
  assert.match(PL, /<div class="palanca" id="palanca" aria-hidden="true"><\/div>/, "la zona de la palanca, sin estilos en línea");
});

test("la CSP (style-src 'self'): el módulo no escribe style= ni <style>; solo el CSSOM de nipplejs", () => {
  assert.ok(!/setAttribute\(\s*["']style|cssText|createElement\(["']style|innerHTML/.test(MOD), "el módulo no toca estilos en línea");
  assert.ok(!/\sstyle="/.test(PL.slice(PL.indexOf('id="palanca"') - 40, PL.indexOf('id="palanca"') + 80)), "la zona no lleva style=");
});

test("el paseo la suma por el camino que ya hay (sin duplicar la física) y el ajuste existe", () => {
  assert.match(PASEO, /av = Math\.max\(-1, Math\.min\(1, av \+ mandoPalanca\.av\)\)/, "se suma al avance del teclado y la cruceta");
  assert.match(PASEO, /var vel = velPaseo\(av, dt\)/, "la velocidad sigue saliendo de velPaseo (quad, pendiente, correr)");
  assert.match(PASEO, /if \(enQuad \|\| enDron\) gi = /, "en quad y dron el lado gira, como la cruceta");
  assert.match(PASEO, /ponPalanca\(0, 0\)/, "se suelta al salir del paseo y al perder el foco");
  assert.match(lee("apps/web/motor/33_ajustes.js"), /"controles\.palanca": bool\(true\)/, "el ajuste vale sí por defecto");
});

test("la palanca nace venga de donde venga el paseo (no solo el botón «Pasear»), y si nipplejs no carga vuelve la cruceta", () => {
  // fallo visto en un móvil el 2026-11-04: al entrar a pasear yendo andando a un punto (12b_llegada.js, entraPaseo() sin pulsar el botón)
  // la cruceta se ocultaba y la palanca no nacía: solo se podía girar
  assert.match(MOD, /new MutationObserver\(alPasear\)\.observe\(visor, \{ attributes: true, attributeFilter: \["class"\] \}\)/, "mira la clase «paseo» del visor");
  assert.match(MOD, /function alPasear\(\) \{ if \(paseando\) \{ if \(quiere\(\)\) enciende\(\); \}/);
  assert.match(MOD, /\.catch\(function \(\) \{ pidiendo = false; raiz\.setAttribute\("data-palanca", "no"\); \}\)/, "si no carga, data-palanca=no: vuelve la cruceta");
  assert.match(PASEO, /visor\.classList\.add\("paseo"\)/, "entraPaseo pone la clase que mira la palanca");
  assert.match(css, /\[data-palanca="si"\] \.visor\.paseo \.pad-mov \{ display: none; \}/, "la cruceta solo se oculta con data-palanca=si");
});

test("nipplejs 1.0: el manejador de «move» lee los datos de e.data (en 0.x eran un segundo argumento)", () => {
  // fallo visto en un móvil el 2026-11-04: con function (e, d) el vector nunca llegaba y el paseante no andaba (palanca_chrome.test.js lo comprueba en Chrome)
  assert.match(MOD, /joy\.on\("move", function \(e\) \{ var d = e && e\.data,/);
  assert.ok(!/joy\.on\("move", function \(e, d\)/.test(MOD), "sin la firma de 0.x");
  const d = lee("apps/web/node_modules/nipplejs/dist/index.mjs");
  assert.match(d, /e\.call\(this,\{type:t,target:this,data:i\}\)/, "nipplejs llama a los manejadores con { type, target, data }: si cambia, revisar 34b_palanca.js");
});

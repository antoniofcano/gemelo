"use strict";
// M4: tope de ortofotos decodificadas a la vez (apps/web/motor/02_mundo.js). Sin navegador: se evalúa 02_mundo.js con unas maquetas de los datos, del
// lienzo 2D y del reloj, y se comprueba que (1) pasado el tope se suelta la MENOS usada recientemente, (2) la tesela de la cámara y sus vecinas no se
// sueltan, (3) lo usado hace poco no se suelta (nada se decodifica en bucle), (4) ?ortoMax= manda y el valor por defecto distingue móvil de escritorio y
// (5) el corte de 900 m sigue. El heap real de un paseo y de un vuelo lo da el banco.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");

const FUENTE = fs.readFileSync(path.join(RAIZ, "apps", "web", "motor", "02_mundo.js"), "utf8");
const TS = 256;

function monta({ query = "", ua = "", mem, n = 5 } = {}) {   // una fila de n×1 teselas de 256 m
  const teselas = {}; for (let i = 0; i < n; i++) teselas["k" + i] = { kx: i, ky: 0, v: [i * TS, 0, (i + 1) * TS, TS], np: 0 };
  const D = { ts: TS, res: 1, srs: 2, centro_utm: [0, 0], teselas, grueso: { b64: "", x0: 0, yN: TS, res: 8, w: 32, h: 32 }, mosaico: { x0: 0, yN: TS, w: 1, h: 1, res: 1 }, copas: [], marcados: [] };
  let t = 0;
  const performance = { now: () => t };
  const lienzo = () => ({ width: 4, height: 4, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(64) }) }) });
  const document = { createElement: lienzo };
  const navigator = { userAgent: ua, deviceMemory: mem };
  const Mundo = Function("D", "b64", "i16", "RES", "document", "performance", "location", "navigator", "fetch", "ndviRel", "rampa", FUENTE + "\nreturn Mundo;")(
    D, () => new Uint8Array(0), () => new Int16Array(32 * 32), 1, document, performance, { search: query }, navigator, () => new Promise(() => {}), () => 0, () => [0, 0, 0]);
  Mundo.lista.forEach(tt => { tt.ortImg = { complete: true, naturalWidth: 4, width: 4 }; });
  return { Mundo, avanza: ms => { t += ms; } };
}
const vivas = M => M.lista.filter(x => x.ortPix).map(x => x.key).sort();
const x_de = i => i * TS + 10;
const FUERA = [768, 50, -556];   // la cámara al norte de la fila (fuera de la rejilla: no protege a ninguna) pero a menos de 900 m de todas (el corte no actúa)

test("pasado el tope se suelta la menos usada recientemente", () => {
  const { Mundo: M, avanza } = monta({ query: "?ortoMax=3", n: 6 });
  assert.strictEqual(M.ortoEstado().max, 3);
  for (let i = 0; i < 4; i++) { M.decodificaOrto(M.lista[i]); avanza(10000); }   // 10 s entre una y otra: ninguna está en gracia
  assert.strictEqual(M.ortoEstado().vivas, 3, "al decodificar la cuarta ya baja al tope");
  assert.deepStrictEqual(vivas(M), ["k1", "k2", "k3"], "k0 era la menos usada");
  // se muestrea k1 (la más vieja) y llega otra: se suelta k2
  M.actualiza(0, 0, 0); M.orto(x_de(1), 5, [0, 0, 0]); avanza(10000);
  M.decodificaOrto(M.lista[4]);
  assert.deepStrictEqual(vivas(M), ["k1", "k3", "k4"], "k2 era la menos usada tras muestrear k1");
});

test("la tesela de la cámara y sus vecinas cardinales no se sueltan aunque sean las menos usadas", () => {
  const { Mundo: M, avanza } = monta({ query: "?ortoMax=2", n: 6 });
  M.liberaOrtoLejos(x_de(2), 50, -10);   // el foco queda en k2 (x = 2·256+10; z = −y): protegidas k1, k2, k3
  for (let i = 0; i < 5; i++) { M.decodificaOrto(M.lista[i]); avanza(20000); }
  const v = vivas(M);
  for (const k of ["k1", "k2", "k3"]) assert.ok(v.includes(k), k + " debía quedarse: " + v);
  assert.ok(!v.includes("k0"), "k0 (la menos usada, sin protección) se suelta: " + v);
  assert.ok(v.length > M.ortoEstado().max, "el tope es blando: con tres protegidas y tope 2 se excede");
});

test("lo usado en los últimos segundos no se suelta (nada decodifica en bucle)", () => {
  const { Mundo: M, avanza } = monta({ query: "?ortoMax=2", n: 6 });
  M.liberaOrtoLejos(...FUERA);
  for (let i = 0; i < 6; i++) { M.decodificaOrto(M.lista[i]); avanza(500); }   // 3 s en total: todas dentro de la gracia
  assert.strictEqual(M.ortoEstado().vivas, 6, "nada se suelta mientras todas son recientes");
  const dec = M.ortoEstado().decodificadas;
  for (let i = 0; i < 20; i++) { avanza(100); M.actualiza(...FUERA); M.orto(x_de(i % 6), 5, [0, 0, 0]); }
  assert.strictEqual(M.ortoEstado().decodificadas, dec, "muestrear teselas vivas no vuelve a decodificar");
  avanza(20000); M.liberaOrtoLejos(...FUERA);
  assert.strictEqual(M.ortoEstado().vivas, 2, "pasada la gracia se baja al tope");
  assert.strictEqual(M.ortoEstado().desalojadas, 4);
});

test("el tope por defecto: 20 en escritorio, 8 en móvil y en gafas, y ?ortoMax= manda", () => {
  assert.strictEqual(monta({ ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/120" }).Mundo.ortoEstado().max, 20);
  assert.strictEqual(monta({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17) Mobile Safari" }).Mundo.ortoEstado().max, 8);
  assert.strictEqual(monta({ ua: "Mozilla/5.0 (X11; Linux) OculusBrowser/30 Quest" }).Mundo.ortoEstado().max, 8);
  assert.strictEqual(monta({ ua: "Chrome/120", mem: 4 }).Mundo.ortoEstado().max, 8);
  assert.strictEqual(monta({ ua: "iPhone Mobile", query: "?x=1&ortoMax=12" }).Mundo.ortoEstado().max, 12);
});

test("el corte de 900 m se mantiene", () => {
  const { Mundo: M } = monta({ query: "?ortoMax=20", n: 5 });
  M.lista.forEach(t => { M.decodificaOrto(t); t.hc = 0; });
  M.liberaOrtoLejos(0, 0, 0);   // cámara en x = 0: k4 (x ≥ 1024) está a más de 900 m
  assert.ok(!M.lista[4].ortPix && M.lista[0].ortPix, "k4 a más de 900 m se suelta; k0 se queda");
});

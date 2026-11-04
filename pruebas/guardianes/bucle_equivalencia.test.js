"use strict";
// AG-1.4c · equivalencia del bucle: cada pieza del motor que se reescribió sin reservas (o con otra estructura) da EXACTAMENTE lo mismo que el código anterior.
// Método: la «foto» del código anterior vive aquí, copiada tal cual; el código nuevo se saca del propio módulo (se corta la función del fichero y se evalúa en Node con
// sus dependencias simuladas), así la prueba no puede divergir de lo que se envía. Esto vale para el resultado, no para el coste: los ms de Node son relativos
// (regla 7); los fps o los tirones solo los da un dispositivo real.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");
const R = require("./_reservas");

/** El texto de una función (declaración entera) de un módulo del motor. */
function fuente(modulo, inicio) {
  const src = lee("apps/web/motor/" + modulo), i = src.indexOf(inicio), cu = R.cuerpo(src, inicio);
  assert.ok(i >= 0 && cu !== null, modulo + ": no se encuentra " + inicio);
  return src.slice(i, src.indexOf(cu, i) + cu.length + 1);
}
/** Un trozo contiguo del módulo, de `desde` hasta justo antes de `hasta` (ambos textos únicos). */
function trozo(modulo, desde, hasta) {
  const src = lee("apps/web/motor/" + modulo), i = src.indexOf(desde), j = src.indexOf(hasta, i);
  assert.ok(i >= 0 && j > i, modulo + ": no se encuentra el trozo " + desde);
  return src.slice(i, j);
}
// generador determinista (xorshift32), para que la prueba sea reproducible
function azar(sem) { let s = sem >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ---------- 1 · distArroyo (18_paisaje.js): rejilla en vez de recorrer el eje ----------
// La foto del código anterior (incluido su `i += 2` sobre la lista de pares: solo cuentan los puntos de índice par).
function distArroyoAntes(ejeArroyo) { return function (x, y) { var m = 1e9; for (var i = 0; i < ejeArroyo.length; i += 2) { var d = Math.hypot(ejeArroyo[i][0] - x, ejeArroyo[i][1] - y); if (d < m) m = d; } return m; }; }
function distArroyoAhora(ejeArroyo) {
  // desde `var ejeCel` (rejilla, celdaArroyo, celdaArroyoDist) hasta el final de distArroyo
  const cod = trozo("18_paisaje.js", "var ejeCel = 64", "function distArroyo(") + fuente("18_paisaje.js", "function distArroyo(");
  return new Function("ejeArroyo", cod + "\nreturn distArroyo;")(ejeArroyo);
}
function eje(sem, tipo) {   // varios cauces sintéticos (paseos aleatorios) con la forma de la lista plana de pares
  const az = azar(sem), res = [], nc = 1 + Math.floor(az() * 7);
  for (let c = 0; c < nc; c++) {
    let x = (az() - 0.5) * 1500, y = (az() - 0.5) * 1500, a = az() * 6.28; const n = tipo === "corto" ? 1 + Math.floor(az() * 5) : 30 + Math.floor(az() * 400);
    for (let i = 0; i < n; i++) { res.push([x, y]); a += (az() - 0.5) * 0.6; const p = tipo === "denso" ? 1 : 2 + az() * 14; x += Math.cos(a) * p; y += Math.sin(a) * p; }
  }
  return res;
}
test("distArroyo: la rejilla da exactamente lo mismo que el recorrido del eje entero (miles de puntos aleatorios)", () => {
  let comparados = 0;
  for (const tipo of ["normal", "denso", "corto"]) for (let sem = 1; sem <= 12; sem++) {
    const E = eje(sem * 7919 + (tipo === "denso" ? 1 : tipo === "corto" ? 2 : 0), tipo), antes = distArroyoAntes(E), ahora = distArroyoAhora(E), az = azar(sem * 31);
    for (let k = 0; k < 400; k++) {
      // dentro de la rejilla, en los bordes y bien fuera (el suelo y el sonido preguntan en cualquier sitio)
      const f = k % 4 === 0 ? 6000 : k % 4 === 1 ? 2400 : 1600, x = (az() - 0.5) * f, y = (az() - 0.5) * f;
      assert.strictEqual(ahora(x, y), antes(x, y), tipo + " semilla " + sem + " punto " + x + "," + y);
      comparados++;
    }
    // exactamente sobre los puntos del eje (pares e impares) y a distancias de la celda
    for (let i = 0; i < E.length; i += 3) { assert.strictEqual(ahora(E[i][0], E[i][1]), antes(E[i][0], E[i][1])); assert.strictEqual(ahora(E[i][0] + 64, E[i][1] - 64), antes(E[i][0] + 64, E[i][1] - 64)); comparados += 2; }
  }
  assert.ok(comparados > 15000, "se compararon " + comparados + " puntos");
});
test("distArroyo: sin eje devuelve 1e9; con un punto, su distancia", () => {
  assert.strictEqual(distArroyoAhora([])(3, 4), 1e9);
  assert.strictEqual(distArroyoAhora([[0, 0]])(3, 4), 5);
  assert.strictEqual(distArroyoAhora([[0, 0], [100, 100]])(100, 100), distArroyoAntes([[0, 0], [100, 100]])(100, 100), "el punto impar no cuenta (heredado del i += 2)");
});

// ---------- 2 · actualizaTiempo y pintaNubes (15_tiempo.js): temporales de módulo y bucles en vez de reservas por fotograma ----------
const F = require("./_fauna_mundo");
let THREE;
test.before(async () => { THREE = await F.cargaThree(); });

const { mundoTiempo, fotoTiempo } = require("./_tiempo_mundo");
for (const [nombre, ini] of [["de la tarde a la noche", Date.UTC(2026, 5, 21, 15, 0)], ["de la noche al amanecer", Date.UTC(2026, 5, 21, 2, 30)], ["en invierno, con el sol bajo y helada", Date.UTC(2026, 11, 21, 14, 0)]]) {
  test("actualizaTiempo + pintaNubes == su copia anterior, fotograma a fotograma, " + nombre, () => {
    const a = mundoTiempo(THREE, false), b = mundoTiempo(THREE, true), r = F.semilla(4242);
    for (const m of [a, b]) { m.W.cur.ms = m.W.meta.ms = ini; }
    let vistas = 0, oscuro = 0;
    for (let f = 0; f < 1600; f++) {
      // cada ~200 fotogramas el tiempo previsto cambia (nubes, lluvia, viento, helada, niebla) y la cámara y la calma también
      if (f % 200 === 0) {
        const q = { nub: r() * 100, viento: r() * 9, dir: r() * 360, lluvia: r() < 0.4 ? r() * 5 : 0, hr: 40 + r() * 60, temp: -3 + r() * 30 };
        for (const m of [a, b]) Object.assign(m.W.meta, q, { ms: m.W.meta.ms + (f % 600 === 0 ? 3600000 : 0) });
      }
      const dt = 0.004 + r() * 0.06, cam = [(r() - 0.5) * 900, 5 + r() * 300, (r() - 0.5) * 900], calma = f % 500 > 420;
      for (const m of [a, b]) { m.W.camera.position.set(cam[0], cam[1], cam[2]); m.W.camera.lookAt(0, 0, 0); m.W.camera.updateMatrixWorld(true); m.api.calma(calma); m.W.cur.ms += 15000; m.W.meta.ms += 15000; }
      a.api.act(dt); b.api.act(dt);
      const fa = fotoTiempo(a), fb = fotoTiempo(b);
      assert.deepStrictEqual(fb, fa, "fotograma " + f + ": el tiempo de ahora difiere del de antes");
      if (fa.draw[1] > 0) vistas++; if (fa.sol[2] < 0.2) oscuro++;
    }
    assert.ok(vistas > 300, "la prueba pinta nubes en bastantes fotogramas (" + vistas + ")");
  });
}

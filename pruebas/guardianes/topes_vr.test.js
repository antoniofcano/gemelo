"use strict";
// EV2-A0 (doc/sistema/VIABILIDAD-INTERACCION.md §A.2 y §A.5): topes angulares de lo que se lee y se pulsa en las láminas VR, en Node y sin navegador.
// Los topes (LaminasPuro.TOPES: texto ≥ 1,5° por línea, objetivos ≥ 2,5°, ≥ 12 mm entre botones vistos a 1 m) son CIFRAS PROPIAS DEL GEMELO, no
// verificadas contra la guía de Meta ni la de Apple ni en un casco. Se calculan desde las constantes del código (px del lienzo, metros de la lámina,
// distancia a los ojos), no se miden en las Quest. Las láminas que siguen a la cabeza (las de siempre, sin ?ui=capas) no llegan al tope de texto: se
// apuntan como HEREDADAS con su valor de hoy como suelo (no pueden empeorar); las de ?ui=capas (fichas en el mundo, EV2-A1) cumplen los tres topes.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

function trozo(fuente, ini, fin) {
  const i = fuente.indexOf(ini), f = fuente.indexOf(fin);
  assert.ok(i >= 0 && f > i, "debe marcar " + ini + " … " + fin);
  return fuente.slice(i, f);
}
const LP = new Function("\"use strict\";\n" + trozo(lee("apps/web/motor/02d_laminas.js"), "// [puro:inicio]", "// [puro:fin]") + "\nreturn LaminasPuro;")();
const VF = new Function("\"use strict\";\n" + trozo(lee("apps/web/motor/29_vr.js"), "// [puro:fichas:inicio]", "// [puro:fichas:fin]") + "\nreturn VrFichaPuro;")();

test("los topes son los del estudio y el cálculo angular es el de siempre", () => {
  assert.deepStrictEqual(LP.TOPES, { textoGrados: 1.5, objetivoGrados: 2.5, huecoMmA1m: 12 });
  assert.ok(Math.abs(LP.grados(26.18, 1) - 1.5) < 0.01, "26,2 mm a 1 m ≈ 1,5°");
  assert.ok(Math.abs(LP.grados(52.4, 2) - 1.5) < 0.01, "el doble de lejos, el doble de grande");
  assert.strictEqual(LP.hueco({ x: 0, y: 0, w: 10, h: 10 }, { x: 22, y: 0, w: 10, h: 10 }), 12, "lado a lado");
  assert.strictEqual(LP.hueco({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 14, w: 10, h: 10 }), 4, "uno encima de otro");
  assert.strictEqual(LP.hueco({ x: 0, y: 0, w: 10, h: 10 }, { x: 13, y: 14, w: 10, h: 10 }), 5, "en diagonal: la esquina");
  assert.strictEqual(LP.hueco({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), 0, "pisados");
  const r = LP.legible({ mmPorPx: 1, dist: 1, lineas: { a: 30, b: 20 }, botones: [{ x: 0, y: 0, w: 60, h: 60 }, { x: 70, y: 0, w: 60, h: 40 }] });
  assert.deepStrictEqual(r.fallos.length, 3, "texto b (1,15°), botón de 40 mm (2,29°) y hueco de 10 mm: " + r.fallos.join("; "));
  assert.ok(Math.abs(r.huecoMin - 10) < 1e-9 && r.textoMin < 1.2 && r.objetivoMin < 2.5);
});

// las tres láminas de siempre, con sus constantes (VrFichaPuro.MEDIDAS, que son las que usan creaLamina y vrSigue)
function pieza(nombre, botones) {
  const m = VF.MEDIDAS[nombre];
  return LP.legible({ mmPorPx: VF.mmPorPx(m), dist: VF.distancia(m), lineas: m.lineas || {}, botones: botones || [] });
}

test("la ficha de la baliza (fichaB): con 1 a 4 acciones, objetivos ≥ 2,5° y ≥ 12 mm entre botones a 1 m (antes 9,7 mm entre acciones)", () => {
  const m = VF.MEDIDAS.fichaB;
  assert.strictEqual(VF.HUECO_B, 16);
  for (let n = 1; n <= 4; n++) {
    const ac = Array.from({ length: n }, (_, k) => ({ id: "a" + k, txt: "Acción " + k })), B = VF.botonesB(ac, m.W, m.H);
    assert.strictEqual(B.length, n + 1, "las acciones y «Cerrar»");
    assert.ok(B[B.length - 1].cerrar && B[B.length - 1].id === "bce");
    B.forEach(b => assert.ok(b.x >= 0 && b.x + b.w <= m.W && b.y >= 0 && b.y + b.h <= m.H, "dentro del lienzo: " + JSON.stringify(b)));
    const r = pieza("fichaB", B), malos = r.fallos.filter(f => !/^texto/.test(f));
    assert.deepStrictEqual(malos, [], n + " acciones: " + malos.join("; "));
    if (n > 1) assert.ok(r.huecoMin >= 12, n + " acciones: hueco " + r.huecoMin.toFixed(1) + " mm");
  }
  // la cuenta del estudio: 16 px a 0,807 mm/px son 12,9 mm; a 1,04 m equivalen a 12,4 mm vistos a 1 m
  assert.ok(Math.abs(VF.mmPorPx(m) * 16 - 12.9) < 0.05);
});

// HEREDADAS: lo que hoy no llega al tope de texto en las láminas que siguen a la cabeza. Su valor de hoy es el suelo: si alguien las empeora, falla.
// Con ?ui=capas no se ven (las sustituyen las fichas en el mundo, EV2-A1).
const HEREDADAS = { "ficha.cuerpo": 1.44, "fichaB.destacado": 1.42, "fichaB.cuerpo": 1.33, "fichaB.pie": 0.98 };
test("las fichas de siempre: el texto que no llega a 1,5° está apuntado y no empeora", () => {
  const vistos = {};
  ["ficha", "fichaB"].forEach(n => {
    const r = pieza(n);
    Object.entries(r.texto).forEach(([k, g]) => {
      const clave = n + "." + k;
      if (g >= LP.TOPES.textoGrados) return;
      vistos[clave] = true;
      assert.ok(clave in HEREDADAS, clave + " baja de 1,5° (" + g.toFixed(2) + "°) y no está en HEREDADAS");
      assert.ok(g >= HEREDADAS[clave] - 0.005, clave + " empeora: " + g.toFixed(3) + "° < " + HEREDADAS[clave] + "°");
    });
  });
  Object.keys(HEREDADAS).forEach(k => assert.ok(vistos[k], k + " ya cumple: quítala de HEREDADAS"));
});

test("el panel nace a ~1,07 m y la ficha de la baliza a ~1,04 m (las cifras del estudio salen de las constantes)", () => {
  assert.ok(Math.abs(VF.distancia(VF.MEDIDAS.panel) - 1.069) < 0.002);
  assert.ok(Math.abs(VF.distancia(VF.MEDIDAS.fichaB) - 1.039) < 0.002);
  assert.ok(Math.abs(VF.mmPorPx(VF.MEDIDAS.panel) - 0.977) < 0.001 && Math.abs(VF.mmPorPx(VF.MEDIDAS.fichaB) - 0.807) < 0.001);
});

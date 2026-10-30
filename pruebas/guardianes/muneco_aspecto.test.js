"use strict";
// AV2 (decisión 131): el muñeco teñido, en Node. 10 tonos de piel, ropa de arriba y de abajo, altura, complexión y silla de ruedas; nada depende del género
// (criterios C2, C3, C5, C7 y C13 de doc/sistema/AVATARES-FAMILIA.md). Evalúa el trozo puro de apps/web/motor/26_presencia.js tal cual (Aspecto, Muneco, SalaPose).
// Lo que se dibuja (llamadas, triángulos) se mide por el banco con presencia.test.js y se escribe en doc/sistema/MEDIDAS.md.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/26_presencia.js");
function puro() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i);
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn { Muneco: Muneco, Aspecto: Aspecto, SalaPose: SalaPose };")();
}
const { Muneco, Aspecto, SalaPose } = puro();

const hex = n => "#" + n.toString(16).padStart(6, "0");
function luminancia(n) {   // L* de CIELAB (D65) de un color sRGB
  const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  const Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
}

test("AV2: 10 tonos de piel, de muy claro a muy oscuro, sin huecos de más de 10 en L* y sin repetidos; la ropa, 10 colores distintos (C2, C5)", () => {
  assert.strictEqual(Aspecto.PIELES.length, 10);
  assert.strictEqual(new Set(Aspecto.PIELES).size, 10);
  const L = Aspecto.PIELES.map(luminancia);
  assert.ok(L[0] > 85 && L[9] < 25, "de ≈ 90 a ≈ 20: " + L.map(x => x.toFixed(0)).join(" "));
  for (let i = 1; i < 10; i++) assert.ok(L[i] < L[i - 1] && L[i - 1] - L[i] <= 10.5, "hueco entre " + (i - 1) + " y " + i + ": " + (L[i - 1] - L[i]).toFixed(1));
  assert.strictEqual(new Set(Aspecto.ROPA).size, 10);
  assert.strictEqual(hex(Aspecto.PIELES[0]), "#f6dcc8", "los de la maqueta prototipos/avatares");
  assert.deepStrictEqual(Aspecto.PIEL_ANTES, [1, 2, 4, 6, 7], "piel 0-4 de antes: su tono más cercano de los 10");
});

test("AV2: lo que llega por los metadatos se lee como dato (listas cerradas); sin género; lo raro toma el valor neutro", () => {
  // (AV4 añade la receta del creador: cuerpo, pelo, color de pelo, vello, ropa y accesorios; sin ella, nula: avatares_piezas.test.js)
  assert.deepStrictEqual(Aspecto.lee({ tono: 9, arriba: 0, abajo: 5, altura: "alta", complexion: "ancha", movilidad: "silla" }), { tono: 9, arriba: 0, abajo: 5, altura: "alta", complexion: "ancha", movilidad: "silla", cuerpo: null, pelo: null, peloColor: null, vello: null, ropa: null, acc: [] });
  const raro = Aspecto.lee({ tono: 10, arriba: -1, abajo: 1.5, altura: "gigante", complexion: "__proto__", movilidad: "moto", sexo: "x", genero: "y" });
  assert.deepStrictEqual(raro, { tono: null, arriba: null, abajo: null, altura: "media", complexion: "media", movilidad: "pie", cuerpo: null, pelo: null, peloColor: null, vello: null, ropa: null, acc: [] });
  assert.ok(!("sexo" in raro) && !("genero" in raro), "ningún campo de género (C8)");
  for (const v of [null, undefined, "x", 3, []]) assert.strictEqual(Aspecto.lee(v).movilidad, "pie");
  const i = SalaPose.leeInfo(JSON.stringify({ alias: "Mirlo", avatar: { camisa: 2, sombrero: "gorra", piel: 3, tono: 4, movilidad: "baston", altura: "baja" } }));
  assert.deepStrictEqual([i.aspecto.tono, i.aspecto.movilidad, i.aspecto.altura, i.camisa, i.piel], [4, "baston", "baja", 2, 3], "los campos de antes no cambian");
  assert.deepStrictEqual(SalaPose.leeInfo(JSON.stringify({ alias: "Mirlo", avatar: { tono: 99, movilidad: "<img>" } })).aspecto, Aspecto.lee({}));
});

test("AV2: viste() — lo elegido manda; sin tono, el de antes o uno repartido por el alias (ninguno «de serie»); tres alturas y tres complexiones", () => {
  const v = Aspecto.viste({ alias: "Mirlo", camisa: 2, piel: 3, aspecto: Aspecto.lee({ tono: 9, arriba: 3, abajo: 8, altura: "alta", complexion: "ancha" }) });
  assert.deepStrictEqual([v.piel, v.camisa, v.pantalon, v.fa, v.fc, v.propioPiel, v.propioCamisa], [Aspecto.PIELES[9], Aspecto.ROPA[3], Aspecto.ROPA[8], 1.07, 1.24, true, true]);
  const antes = Aspecto.viste({ alias: "Mirlo", camisa: 2, piel: 3, aspecto: Aspecto.lee({}) });
  assert.deepStrictEqual([antes.piel, antes.camisa, antes.pantalon, antes.fa, antes.fc, antes.propioPiel, antes.mov], [Aspecto.PIELES[6], Aspecto.CAMISAS[2], Aspecto.PANTALON, 1, 1, false, "pie"], "sin aspecto, el muñeco de antes");
  // quien no ha elegido nada (la api manda piel 1): no todos con el mismo tono
  const tonos = new Set(["Mirlo", "Abubilla", "Jilguero", "Carbonero", "Alcaraván", "Verdecillo", "Golondrina", "Perdiz", "Abejaruco", "Cogujada", "Encina", "Lentisco"]
    .map(alias => Aspecto.viste({ alias, camisa: 0, piel: 1, aspecto: Aspecto.lee({}) }).tono));
  assert.ok(tonos.size >= 6, "repartidos por el alias, no uno de serie: " + tonos.size + " tonos en 12 alias");
  const p = () => Aspecto.viste({ alias: "Mirlo", camisa: 0, piel: 1, aspecto: Aspecto.lee({}) }).tono;
  assert.strictEqual(p(), p(), "estable");
  assert.deepStrictEqual(Object.values(Aspecto.ALTURAS).sort(), [0.93, 1, 1.07]);
  assert.deepStrictEqual(Object.values(Aspecto.COMPLEXIONES).sort(), [0.84, 1, 1.24]);
  for (const a of Object.keys(Aspecto.ALTURAS)) for (const c of Object.keys(Aspecto.COMPLEXIONES)) {   // cualquier cuerpo con cualquier ropa: no hay compatibilidades
    const w = Aspecto.viste({ alias: "x", camisa: 0, piel: 1, aspecto: Aspecto.lee({ tono: 0, arriba: 7, abajo: 1, altura: a, complexion: c }) });
    assert.deepStrictEqual([w.camisa, w.pantalon], [Aspecto.ROPA[7], Aspecto.ROPA[1]]);
  }
});

test("AV2: las cajas de accesorios — sombrero 1, bastón 1, andador 3, silla 2 — caben en CAJAS_MAX", () => {
  assert.deepStrictEqual(["pie", "baston", "andador", "silla"].map(m => Aspecto.cajas(0, m)), [0, 1, 3, 2]);
  assert.deepStrictEqual(["pie", "baston", "andador", "silla"].map(m => Aspecto.cajas(1, m)), [1, 2, 4, 3]);
  for (const m of Aspecto.MOVILIDADES) assert.ok(Aspecto.cajas(2, m) <= Aspecto.CAJAS_MAX, m);
});

test("AV2: la silla de ruedas — sentado como en el quad, sin paso, a la misma velocidad y por los mismos caminos; la cabeza a ≈ 1,3 m (C7)", () => {
  const st = Muneco.crea(), o = {};
  let x = 0;
  for (let i = 0; i < 120; i++) { x += 1.4 / 30; Muneco.avanza(st, x, 0, 0, 1 / 30, 100, 1, NaN, false, o, 0, true); }
  assert.strictEqual(o.vehiculo, 3, "3 = la silla (1 quad, 2 dron)");
  assert.strictEqual(o.piernaI, Muneco.SENTADO_P); assert.strictEqual(o.piernaD, Muneco.SENTADO_P, "piernas adelante, las del quad");
  assert.ok(Math.abs(o.yPies - (100 - Muneco.SILLA_BAJA)) < 1e-9, "el cuerpo baja: la cadera queda a ≈ 0,55 m");
  assert.ok(Math.abs(o.yCab - o.yPies - Muneco.ALTURA) < 1e-9 && o.yCab - 100 < 1.35 && o.yCab - 100 > 1.2, "cabeza a " + (o.yCab - 100).toFixed(2) + " m del suelo");
  assert.strictEqual(o.agacho, 0, "no se agacha con gafas: ya va sentado");
  assert.ok(o.vel > 1, "misma velocidad: sale de la posición, no de la silla (" + o.vel.toFixed(2) + " m/s)");
  assert.ok(Math.abs(o.brazoI - Muneco.SILLA_B) <= 0.2 + 1e-9, "brazos a las ruedas, con un leve vaivén al avanzar");
  // con manos de Quest los brazos no se animan; sin silla, todo igual que antes; en quad manda el quad
  assert.strictEqual(Muneco.avanza(Muneco.crea(), 0, 0, 0, 1 / 30, 100, 1, NaN, true, {}, 0, true).brazoI, 0);
  const pie = Muneco.avanza(Muneco.crea(), 0, 0, 0, 1 / 30, 100, 1, NaN, false, {}, 0, false); assert.strictEqual(pie.vehiculo, 0); assert.strictEqual(pie.yPies, 100);
  assert.strictEqual(Muneco.avanza(Muneco.crea(), 0, 0, 0, 1 / 30, 100, 1, NaN, false, {}, 1, true).vehiculo, 1);
});

test("AV2: en el código — ruedas con su reserva, dos por silla, la silla también con VRM (AV4), lo elegido manda sobre el catálogo y ningún campo de género", () => {
  assert.match(FUENTE, /rRuedas = reserva\(mRuedas\)/, "las ruedas, una malla instanciada más con su reserva");
  assert.match(FUENTE, /rRuedas\.toma\(2\)/, "dos ruedas por silla");
  assert.match(FUENTE, /outMu, o\.modo, a\.mov === "silla"\);/, "AV4: con VRM también va sentado en su silla (26b_avatares.js lo sienta)");
  assert.match(FUENTE, /camisa != null && !a\.propioCamisa[^\n]*piel != null && !a\.propioPiel/, "lo que eligió la persona manda sobre el catálogo VRM");
  assert.match(FUENTE, /malla\.count = n; malla\.visible = n > 0/, "sin sombreros ni sillas, esa malla no se dibuja");
  const asp = FUENTE.slice(FUENTE.indexOf("var Aspecto"), FUENTE.indexOf("var SalaPose"));
  assert.ok(!/\b(genero|género|sexo)\b\s*[:=]/.test(asp), "ningún campo de género en el aspecto");
});

"use strict";
// Configuración (U4, apps/web/motor/33_ajustes.js): el guardado, los valores por defecto, la validación y la precedencia URL > ajuste, evaluando el trozo puro tal cual en Node.
// La UI y la aplicación de cada ajuste se comprueban en Chrome por el banco (npm run puerta); aquí no hay DOM.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/33_ajustes.js");
function trozo() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "33_ajustes.js debe marcar su trozo puro con // [puro:inicio] y // [puro:fin]");
  return FUENTE.slice(i, f);
}
const P = new Function("\"use strict\";\n" + trozo() + "\nreturn AjustesPuro;")();
function almacen(datos, falla) {
  const d = Object.assign({}, datos);
  return {
    d,
    getItem: k => { if (falla) throw new Error("bloqueado"); return k in d ? d[k] : null; },
    setItem: (k, v) => { if (falla) throw new Error("bloqueado"); d[k] = String(v); },
    removeItem: k => { if (falla) throw new Error("bloqueado"); delete d[k]; }
  };
}

test("valores por defecto de todos los ajustes (los del diseño, UX-FINCA-JUEGO §4.5)", () => {
  const a = P.crea(almacen({}), "");
  const esperado = { "graficos.calidad": "auto", "graficos.ahorro": false, "vista.exag": 1, "vista.corr": 1, "vista.brujula": true, "vista.unidades": "ha", 
    "controles.tactil": "auto", "controles.mano": "diestra", "controles.sens": 1, "controles.invertir": false, "vr.giro": "30", "vr.vineta": "suave", "vr.vuelo": false, "vr.postura": "pie",
    "acc.texto": 100, "acc.contraste": false, "acc.movimiento": "sistema", "avanzado.contador": false };
  assert.deepStrictEqual(a.claves().sort(), Object.keys(esperado).sort());
  for (const k of Object.keys(esperado)) assert.strictEqual(a.lee(k), esperado[k], k);
  assert.strictEqual(a.lee("no.existe"), undefined);
});

test("guardado: pon escribe con el prefijo gemelo.ajustes. y otra instancia lo lee; el defecto no se guarda", () => {
  const al = almacen({}), a = P.crea(al, "");
  assert.ok(a.pon("vr.giro", "45")); assert.ok(a.pon("acc.texto", 150)); assert.ok(a.pon("acc.contraste", true));
  assert.strictEqual(al.d["gemelo.ajustes.vr.giro"], "\"45\""); assert.strictEqual(al.d["gemelo.ajustes.acc.texto"], "150");
  const b = P.crea(al, ""); assert.strictEqual(b.lee("vr.giro"), "45"); assert.strictEqual(b.lee("acc.texto"), 150); assert.strictEqual(b.lee("acc.contraste"), true);
  a.pon("vr.giro", "30"); assert.ok(!("gemelo.ajustes.vr.giro" in al.d), "volver al defecto borra la clave");
});

test("validación: lo ilegal se rechaza al poner y se cura al leer (almacén manipulado)", () => {
  const al = almacen({ "gemelo.ajustes.vr.giro": "\"90\"", "gemelo.ajustes.acc.texto": "999", "gemelo.ajustes.acc.contraste": "\"si\"", "gemelo.ajustes.vista.exag": "{roto" }), a = P.crea(al, "");
  assert.strictEqual(a.lee("vr.giro"), "30"); assert.strictEqual(a.lee("acc.texto"), 200); assert.strictEqual(a.lee("acc.contraste"), false); assert.strictEqual(a.lee("vista.exag"), 1);
  assert.strictEqual(a.pon("vr.giro", "90"), false); assert.strictEqual(a.pon("acc.contraste", "true"), false); assert.strictEqual(a.pon("acc.texto", NaN), false); assert.strictEqual(a.pon("nada", 1), false);
  assert.strictEqual(a.pon("acc.texto", 500), true); assert.strictEqual(a.lee("acc.texto"), 200, "los rangos se recortan");
});

test("sin localStorage (lanza): los ajustes duran la visita en memoria y nada revienta", () => {
  const a = P.crea(almacen({}, true), ""); assert.strictEqual(a.lee("vr.vineta"), "suave");
  assert.ok(a.pon("vr.vineta", "fuerte")); assert.strictEqual(a.lee("vr.vineta"), "fuerte");
  const sin = P.crea(null, ""); assert.ok(sin.pon("vr.postura", "sentado")); assert.strictEqual(sin.lee("vr.postura"), "sentado");
});

test("precedencia: la URL (?debug) manda sobre el ajuste, no se guarda y el ajuste vuelve al quitarla", () => {
  const al = almacen({}), conUrl = P.crea(al, "?olivos=gen&debug"), sinUrl = P.crea(al, "?otra=1");
  assert.strictEqual(conUrl.lee("avanzado.contador"), true); assert.strictEqual(sinUrl.lee("avanzado.contador"), false);
  conUrl.pon("avanzado.contador", false); assert.strictEqual(conUrl.lee("avanzado.contador"), true, "con ?debug el contador sigue encendido");
  assert.strictEqual(sinUrl.lee("avanzado.contador"), false, "...y sin la URL vale lo guardado (defecto)");
  assert.strictEqual(P.crea(al, "?debugger=1").lee("avanzado.contador"), false, "?debugger no es ?debug");
  assert.strictEqual(P.crea(almacen({ "gemelo.ajustes.avanzado.contador": "true" }), "").lee("avanzado.contador"), true, "sin URL, el ajuste guardado");
  assert.strictEqual(conUrl.forzado("avanzado.contador"), true); assert.strictEqual(conUrl.forzado("vr.giro"), undefined);
});

test("alCambiar avisa solo si cambia, con clave, valor y antes; se puede dejar de escuchar; restablece vuelve a los defectos", () => {
  const a = P.crea(almacen({}), ""), visto = [], quita = a.alCambiar((k, v, antes) => visto.push([k, v, antes]));
  a.pon("vr.giro", "45"); a.pon("vr.giro", "45"); a.pon("vista.exag", 2);
  assert.deepStrictEqual(visto, [["vr.giro", "45", "30"], ["vista.exag", 2, 1]]);
  a.restablece(); assert.strictEqual(a.lee("vr.giro"), "30"); assert.strictEqual(a.lee("vista.exag"), 1); assert.strictEqual(visto.length, 4);
  quita(); a.pon("vr.giro", "45"); assert.strictEqual(visto.length, 4);
  a.alCambiar(() => { throw new Error("oyente roto"); }); assert.doesNotThrow(() => a.pon("vr.giro", "30"));
});

test("superficie en hectáreas o metros cuadrados", () => {
  const f = (n, d) => n.toFixed(d).replace(".", ",");
  assert.strictEqual(P.superficie(1.6, "ha", f), "1,6 ha"); assert.strictEqual(P.superficie(1.6, "m2", f), "16000 m²");
});

test("el trozo puro no toca el DOM", () => {
  assert.ok(!/\bwindow\.|\bdocument\./.test(trozo()));
});

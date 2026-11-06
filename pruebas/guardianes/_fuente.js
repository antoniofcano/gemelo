"use strict";
// El texto de un módulo del motor que ya es un talón de un componente del exterior (A3-1b, MU5-n): el talón de apps/web/motor/ y el .ts de apps/web/src/mundos/exterior/
// juntos, que es lo que ve el motor. Las pruebas que miran el código de estos módulos con expresiones regulares (el enganche, lo que no reserva por fotograma, las marcas)
// lo leen de aquí en vez de leer solo el talón.
//   const { fuenteMotor, TS_DE } = require("./_fuente");   fuenteMotor("04b_escena3d.js")
const { lee } = require("./_util");

/** módulo del motor → el .ts de apps/web/src/ en que vive su código */
const TS_DE = {
  "04b_escena3d.js": "apps/web/src/mundos/exterior/escena-tiles.ts",
  "04c_olivos_tiles.js": "apps/web/src/mundos/exterior/olivos-tiles.ts",
  "04e_suelo_fondo.js": "apps/web/src/mundos/exterior/suelo-fondo.ts",
  "04f_suelo_fotos.js": "apps/web/src/mundos/exterior/suelo-fotos.ts",
  "02m_tope_olivos.js": "apps/web/src/mundos/exterior/tope-olivos.ts",   // A3-2b
  "06_arboles.js": "apps/web/src/mundos/exterior/arboles-l0.ts",   // A3-2b
  "07b_arboles.js": "apps/web/src/mundos/exterior/arboles.ts",   // A3-2b
  "07ac_lejanos.js": "apps/web/src/mundos/exterior/lejanos.ts",   // A3-2b
  "07_follaje.js": "apps/web/src/mundos/exterior/follaje.ts",   // A3-2b
  "08_marcadores.js": "apps/web/src/mundos/exterior/marcadores.ts",   // A3-2b
  "08b_marcadores_lidar.js": "apps/web/src/mundos/exterior/marcadores-lidar.ts",   // A3-2b
  "16_vida.js": "apps/web/src/mundos/exterior/vida.ts",   // A3-5
  "16b_fauna.js": "apps/web/src/mundos/exterior/fauna.ts",   // A3-5
  "25_perros.js": "apps/web/src/mundos/exterior/perros.ts",   // A3-5
  "22_huellas.js": "apps/web/src/mundos/exterior/huellas.ts",   // A3-5
  "22b_huellas_polvo.js": "apps/web/src/mundos/exterior/huellas-polvo.ts",   // A3-5
  "52_aves_mes.js": "apps/web/src/mundos/exterior/aves-mes.ts",   // A3-5
  "54_trabajo_hoy.js": "apps/web/src/mundos/exterior/trabajo-hoy.ts",   // A3-5
  "05_nube.js": "apps/web/src/mundos/exterior/nube.ts",
  "07a_catalogo.js": "apps/web/src/mundos/exterior/catalogo.ts",
  "18_paisaje.js": "apps/web/src/mundos/exterior/paisaje.ts",
  "19_balizas.js": "apps/web/src/mundos/exterior/balizas.ts",
  "44_lindes.js": "apps/web/src/mundos/exterior/lindes.ts",
  "44b_carteles.js": "apps/web/src/mundos/exterior/carteles.ts",
  "50_decoraciones.js": "apps/web/src/mundos/exterior/decoraciones.ts",
  // A3-2a: 07ab vive en varios ficheros (la escalera, el horneado, la cola, el sombreado, el lote y el módulo): se leen todos, en este orden
  // A3-6c: la VR y la locomoción, de todo mundo (apps/web/src/mundos/comun/)
  "36_mandos.js": "apps/web/src/mundos/comun/mandos.ts",
  "12c_ir_a.js": "apps/web/src/mundos/comun/ir-a.ts",
  "12b_llegada.js": "apps/web/src/mundos/comun/llegada.ts",
  "12_paseo.js": "apps/web/src/mundos/comun/paseo.ts",
  "09_camara.js": "apps/web/src/mundos/comun/camara.ts",
  "34b_palanca.js": "apps/web/src/mundos/comun/palanca.ts",
  "29_vr.js": ["vr.ts", "vr-rig.ts", "vr-teletransporte.ts", "vr-panel.ts", "vr-sesion.ts", "vr-puros.ts"].map(f => "apps/web/src/mundos/comun/" + f),
  "07ab_generados.js": ["generados.ts", "generados-escalera.ts", "generados-horneado.ts", "generados-cola.ts", "generados-sombreado.ts", "generados-lote.ts"].map(f => "apps/web/src/mundos/exterior/" + f),
};
/** A3-6c: los .ts de mundos/comun/ (la VR y la locomoción) se leen como el JavaScript que sale de ellos: sin los tipos (stripTypeScriptTypes de Node, que los cambia por
 *  espacios) y sin `export` al principio de línea, con los huecos que dejan los tipos recogidos. Así sus guardianes de siempre (los que buscan el código de 29_vr, 12_paseo… con
 *  expresiones regulares o evalúan sus trozos [puro] con new Function) miran el código movido tal cual, sin tener que aceptar «: T» en cada patrón. Solo para comun/: los
 *  guardianes de exterior/ ya leen su TypeScript con los tipos. */
const COMO_JS = /(^|\/)apps\/web\/src\/mundos\/comun\//;
function comoJs(ts) {
  const m = require("node:module"), avisa = process.emitWarning;
  process.emitWarning = () => {};   // «experimental»: no ensucia la salida de las pruebas
  let js; try { js = m.stripTypeScriptTypes(ts); } finally { process.emitWarning = avisa; }
  return js.replace(/^(\s*)export (?=(const|function|var|let|async|class)\b)/gm, "$1")
    .replace(/[ \t]{2,}(?=[),;\]])/g, "")             // (o: T) → (o), [a!] → [a]
    .replace(/(?<=[\])\w]) +(?=[[.])/g, "")            // a![0] → a[0], x!.y → x.y (los «!» que se van)
    .replace(/[ \t]{2,}(?=[={])/g, " ");               // var x: T = → var x =, function f(): T { → function f() {
}
/** el talón y el .ts juntos (o solo el fichero del motor, si no es de los migrados) */
function fuenteMotor(fichero) {
  const talon = lee("apps/web/motor/" + fichero);
  const ts = TS_DE[fichero];
  return ts ? [talon].concat([].concat(ts).map(f => COMO_JS.test(f) ? comoJs(lee(f)) : lee(f))).join("\n") : talon;
}

module.exports = { fuenteMotor, TS_DE, comoJs };

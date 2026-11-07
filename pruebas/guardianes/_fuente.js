"use strict";
// El texto de un módulo del motor que ya es un talón de un componente (A3-1b, MU5-n): el talón de apps/web/motor/ y el .ts de apps/web/src/ (mundos/exterior/, mundos/comun/ o red/)
// juntos, que es lo que ve el motor. Las pruebas que miran el código de estos módulos con expresiones regulares (el enganche, lo que no reserva por fotograma, las marcas)
// lo leen de aquí en vez de leer solo el talón.
//   const { fuenteMotor, fuenteMotorJs, TS_DE } = require("./_fuente");   fuenteMotor("04b_escena3d.js")
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
  "37_red.js": "apps/web/src/red/salas.ts",   // A3-6a: de todo mundo (red/)
  "26_presencia.js": ["apps/web/src/red/pose.ts", "apps/web/src/red/sala.ts", "apps/web/src/mundos/comun/muneco.ts"],   // A3-6a
  "38_presencia_compartida.js": "apps/web/src/mundos/comun/presencia.ts",   // A3-6a
  "26b_avatares.js": "apps/web/src/mundos/comun/avatares.ts",   // A3-6a
  "31c_muneca.js": "apps/web/src/mundos/comun/muneca.ts",   // A3-6a
  "45_voz.js": "apps/web/src/red/voz/voz.ts",   // A3-6b: de todo mundo (red/voz/)
  "47_habla.js": ["apps/web/src/mundos/comun/habla.ts", "apps/web/src/red/voz/habla.ts"],   // A3-6b: el componente (dibuja) y su lógica pura con el aviso de voz
  "47b_corro.js": ["apps/web/src/mundos/comun/corro.ts", "apps/web/src/red/voz/corro.ts"],   // A3-6b: el componente (dibuja) y su lógica pura con el aviso «cercania»
  "05_nube.js": "apps/web/src/mundos/exterior/nube.ts",
  "07a_catalogo.js": "apps/web/src/mundos/exterior/catalogo.ts",
  "18_paisaje.js": "apps/web/src/mundos/exterior/paisaje.ts",
  "19_balizas.js": "apps/web/src/mundos/exterior/balizas.ts",
  "44_lindes.js": "apps/web/src/mundos/exterior/lindes.ts",
  "44b_carteles.js": "apps/web/src/mundos/exterior/carteles.ts",
  "50_decoraciones.js": "apps/web/src/mundos/exterior/decoraciones.ts",
  // A3-7a: la interfaz (apps/web/src/ui/), que se lee como JavaScript sin tipos ni «dp.» (comoJsUi)
  "32b_capas.js": "apps/web/src/ui/capas.ts",
  "34_movibles.js": "apps/web/src/ui/movibles.ts",
  "32_ventanas.js": "apps/web/src/ui/ventanas.ts",
  "31_hud.js": "apps/web/src/ui/hud.ts",
  "31b_hud_personal.js": "apps/web/src/ui/hud-personal.ts",
  "33_ajustes.js": "apps/web/src/ui/ajustes.ts",
  "17_minimapa.js": "apps/web/src/ui/minimapa.ts",
  "27_debug.js": "apps/web/src/ui/ganchos.ts",
  "28_depura.js": "apps/web/src/ui/depura.ts",
  "30_mide.js": "apps/web/src/ui/mide.ts",
  "02d_laminas.js": "apps/web/src/ui/laminas.ts",
  "02e_entidades.js": "apps/web/src/ui/entidades.ts",
  // A3-7b2: lo social, los juegos y la oficina
  "49_avisos_correo.js": "apps/web/src/ui/avisos-correo.ts",
  "43_agenda.js": "apps/web/src/ui/agenda.ts",
  "46_guiada.js": "apps/web/src/ui/guiada.ts",
  "42_personalizacion.js": "apps/web/src/mundos/exterior/personalizacion.ts",
  "39_oficina_mundo.js": "apps/web/src/mundos/exterior/oficina-mundo.ts",
  "24_pantalla.js": ["apps/web/src/ui/pantalla.ts", "apps/web/src/mundos/comun/transicion.ts"],   // el menú y la pantalla completa (ui/); la transición del mapa al paseo (comun/)
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
  // A3-4: 15_tiempo es una extracción parcial; el tiempo vive en ocho ficheros (el módulo, lo puro, el parche, el cielo, la lluvia, la barrera, el paso y las fichas)
  "21_suelo.js": "apps/web/src/mundos/exterior/hierba.ts",   // A3-4
  "20_sonido.js": "apps/web/src/mundos/exterior/sonido.ts",   // A3-4
  "23_estacion.js": "apps/web/src/mundos/exterior/estacion.ts",   // A3-4
  "15_tiempo.js": ["tiempo.ts", "tiempo-puro.ts", "tiempo-parche.ts", "tiempo-cielo.ts", "tiempo-lluvia.ts", "tiempo-barrera.ts", "tiempo-paso.ts", "tiempo-fichas.ts"].map(f => "apps/web/src/mundos/exterior/" + f),
};
/** A3-6c: los .ts de mundos/comun/ (la VR y la locomoción) se leen como el JavaScript que sale de ellos: sin los tipos (stripTypeScriptTypes de Node, que los cambia por
 *  espacios) y sin `export` al principio de línea, con los huecos que dejan los tipos recogidos. Así sus guardianes de siempre (los que buscan el código de 29_vr, 12_paseo… con
 *  expresiones regulares o evalúan sus trozos [puro] con new Function) miran el código movido tal cual, sin tener que aceptar «: T» en cada patrón. Solo para comun/: los
 *  guardianes de exterior/ ya leen su TypeScript con los tipos. */
// solo los de A3-6c (la VR y la locomoción); los de A3-6a en comun/ (presencia, avatares, muñeca…) se leen con su TypeScript o con fuenteMotorJs, como los dejó A3-6a
// A3-7a: y los de la interfaz (apps/web/src/ui/), que además leen lo que el legado reescribe por getters del talón (`dp.paseando`): se lee sin el `dp.` (comoJsUi)
const COMO_JS = /(^|\/)apps\/web\/src\/(mundos\/comun\/(vr[\w-]*|mandos|paseo|llegada|ir-a|camara|palanca)|ui\/[\w-]+)\.ts$/;
// A3-7a: la transición del mapa al paseo (de 24_pantalla) también llega por dp. A3-7b2: y los componentes del exterior de lo social, los juegos y la oficina (personalizacion,
// oficina-mundo, juegos, cae-la-cosecha), que reciben lo del legado por dp como los de ui/.
const DE_UI = /(^|\/)apps\/web\/src\/(ui\/|mundos\/comun\/transicion\.ts$|mundos\/exterior\/(personalizacion|oficina-mundo|juegos|cae-la-cosecha)\.ts$)/;
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
  return ts ? [talon].concat([].concat(ts).map(f => DE_UI.test(f) ? comoJsUi(lee(f)) : COMO_JS.test(f) ? comoJs(lee(f)) : lee(f))).join("\n") : talon;
}
/** A3-7a: un .ts de ui/ como el JavaScript de antes: sin tipos (comoJs) y sin el prefijo `dp.` de lo que el talón le da por getters (paseando, Ventanas, Hud…) */
function comoJsUi(ts) { return comoJs(ts).replace(/(?<![\w.$])dp\./g, ""); }

/** A3-6a: el mismo texto sin las anotaciones mecánicas que puso la migración a TypeScript (`?: any`, `: any[]`, `: any`) ni el prefijo de las dependencias que
 *  llegan por getters (`dp.`): así las pruebas que miran el código de la presencia, los avatares y el menú de muñeca con expresiones regulares lo leen como antes */
function fuenteMotorJs(fichero) {
  return fuenteMotor(fichero).replace(/\?: any(?![\w$])/g, "").replace(/: any(?:\[\])?(?=[\s,)=;])/g, "").replace(/(?<![\w.$])dp\./g, "");
}

module.exports = { fuenteMotor, fuenteMotorJs, TS_DE, comoJs, comoJsUi, COMO_JS };

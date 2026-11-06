// El tiempo del exterior: el mundo del gemelo simula el que publica Vigía (contratos/tiempo.md). MU5-n (A3-4): antes apps/web/motor/15_tiempo.js (644 líneas),
// que queda como extracción parcial (cablea esto y conserva por su nombre lo que leen otros módulos). Componente «tiempo-mundo» de los mundos ["exterior"], con
// un libera() que suelta de verdad (L2-05 y L2-11, abajo). Mismo comportamiento que antes, salvo L8-05 (la chapita dice «estimado» con la estación de otra fecha).
// Partido por lo que hace cada trozo:
//   tiempo-puro.ts    TiempoPuro (la api, el contrato, el cielo deducido, el paso de hora), el nivel del sol, el reloj del mundo y los formatos: lo puro
//   tiempo-parche.ts  la sombra de las nubes, la helada y el viento en el follaje (uViento, uSombra, GLSL_SOMBRA, parcheTiempo): el parche de MATERIALES §1, fila 2
//   tiempo-cielo.ts   las nubes (una malla), el disco del sol y las estrellas
//   tiempo-lluvia.ts  la lluvia (rayas en una caja que sigue al blanco de la cámara)
//   tiempo-barrera.ts la barrera de luz de la linde de cada parcela
//   tiempo-paso.ts    el paso de cada fotograma (actualizaTiempo): el estado avanza hacia el objetivo y mueve todo lo anterior y la chapita del visor
//   tiempo-fichas.ts  las fichas del panel (estación y previsión), el «Momento que ves» y de dónde se lee el tiempo (la api o lo simulado), con sus relojes y escuchas
//   tiempo.ts (este)  el estado (TM, cur, meta), lo que tiende el mundo a enseñar, TiempoVivo y el ciclo de vida
// Qué entra y de dónde: la estación (medido) pone la temperatura y la humedad de «ahora»; la previsión (modelado, rejilla de ~5 km) pone las nubes, el viento
// y la lluvia. El sol sale de la fecha y la hora. Lo que se dibuja (nubes, lluvia, viento en la hierba y las copas) es ilustrativo.
// El Ambiente (MUNDOS §4, MU2-7): actualizaTiempo mueve el sol, el hemisferio, el fondo y la niebla en cada fotograma, partiendo del ambiente y solo con el
// exterior activo (es un paso del exterior en 90_final.js); con el exterior congelado no toca la escena.
// Del legado recibe por argumento lo que necesita; no lee globales.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { Materiales } from "../../nucleo/materiales.ts";
import { creaBarreras } from "./tiempo-barrera.ts";
import { PALETA_OCASO, creaCielo } from "./tiempo-cielo.ts";
import { creaFichasTiempo } from "./tiempo-fichas.ts";
import { creaLluvia } from "./tiempo-lluvia.ts";
import { GLSL_SOMBRA, creaParcheTiempo } from "./tiempo-parche.ts";
import { creaPasoTiempo } from "./tiempo-paso.ts";
import { DEMOS, LAT, LON, TiempoPuro, ZONA, creaFormatos, creaNivelSol, creaReloj, num1, rumbo } from "./tiempo-puro.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export interface DepsTiempo {
  THREE: A;
  /** 03_escena */
  scene: A; camera: A; sol: A; hemi: A; SRGB: A; LUZ_SOL: number; LUZ_CIELO: number;
  colorCss: (v: string) => A; colorVertSRGB: (sh: A) => void; texColor: (t: A) => A;
  /** 01_datos: la niebla de partida y las parcelas (D.parcelas: la linde de cada una lleva su barrera) */
  FOG0: number; FOG1: number; parcelas: A[];
  /** 04d: el ruido y los «maestros» del suelo y la ortofoto; 05: la nube (nube.material se lee en cada fotograma); 07_follaje: los del follaje */
  hash: (n: number) => number; matSuelo: A; matOrto: A; nube: { material: A }; matHojaG: A; matHojaP: A; matCorteza: A;
  /** 08_marcadores: el grupo de las lindes; 02j: Estaticos; 02_mundo: el suelo; Estado.exag */
  gLinde: A; Estaticos: { congela(o: A): void }; suelo: (x: number, y: number) => number; Estado: { exag: number };
  /** 09_camara: el blanco de la cámara orbital */
  objetivo: A;
  /** 23_estacion: lo que tiende el mundo a enseñar con la estación de otra fecha (objetivoMundo), y si la hay (EST.activa: L8-05, «estimado»). Van después en el montaje */
  objetivoMundo?: (() => A) | null;
  estimado?: (() => boolean) | null;
  /** 16_vida: temaEstela(oscuro), si está (va después en el montaje) */
  temaEstela?: ((oscuro: boolean) => void) | null;
  /** EV-1s: ?suelo=fotos (SueloFotos.activo) */
  ocasoFotos: boolean;
  /** el DOM: document.getElementById y un lienzo nuevo */
  $: (id: string) => A; lienzo: () => A;
  /** 02c: el Bus (la lámina de la previsión: «prevision:alterna»; «componentes:cambia») */
  Bus: { emite(ev: string, d?: A): A; on(ev: string, fn: A): A; hay(ev: string): boolean };
  /** HazasPuro.prefijoApi(location.search, D.base): «/api/» si la página la sirve el servidor (o ?api=), null si no */
  prefijoApi: () => A;
  /** window.fetch (con su window) o null; window.__TIEMPO_PRUEBA o null */
  red: () => A; prueba: () => A;
  /** location.search, el reloj de la máquina (Date.now) y prefers-reduced-motion */
  busqueda: string; reloj?: () => number; calma: boolean;
  /** la fábrica de materiales (nucleo/materiales): los del tiempo se piden con el dueño «tiempo-mundo» y libera() los suelta; el parche del tiempo, sin dueño */
  Materiales: Materiales;
  /** setInterval / clearInterval del navegador */
  temporizador: { setInterval(fn: () => void, ms: number): A; clearInterval(id: A): void };
  /** el tema (data-theme y prefers-color-scheme): apunta fn y devuelve cómo quitarla */
  alCambiarTema: (fn: () => void) => () => void;
}

export const ID_TIEMPO = "tiempo-mundo";

// Lo que ve el resto del motor (y otras piezas: fichas del tiempo, VR) de TiempoVivo (contratos/interfaces.json). Sin dentroDeUmbrales. Contrato: doc/sistema/CONTRATOS.md.
// alCambiar(fn): fn recibe lo mismo que lee(); devuelve la función para darse de baja. Sin estado propio: lee el TM que se le da y apunta los oyentes en TM.oyentes.
export function creaTiempoVivo(TM: A, ahoraMs: () => number) {
  function lee(): A {
    var sim = TM.origen === "simulado";
    return TiempoPuro.vivo(TM.origen, sim ? null : TM.est, sim ? null : TM.prev, sim ? [{ texto: "Tiempo simulado: no hay datos de Vigía." }] : TM.avisos, ahoraMs());
  }
  function alCambiar(fn: A): () => void {
    if (typeof fn !== "function") return function () {};
    TM.oyentes.push(fn); return function () { var i = TM.oyentes.indexOf(fn); if (i >= 0) TM.oyentes.splice(i, 1); };
  }
  return { lee: lee, alCambiar: alCambiar };
}

export function creaTiempo(d: DepsTiempo) {
  var THREE = d.THREE, reloj = d.reloj || Date.now;
  var F = creaFormatos(ZONA), fmtDia = F.fmtDia, fmtHora = F.fmtHora, fmtClaveDia = F.fmtClaveDia;
  var R = creaReloj(d.busqueda || "", fmtClaveDia, reloj), ahoraMs = R.ahoraMs;
  var NV = creaNivelSol(LAT, LON), nivelEn = NV.nivelEn, nivel = NV.nivel;
  // origen: de dónde sale lo que se ve («vigia», «fixture» o «simulado»); avisos: los de la api (de Vigía o del gemelo), como datos
  var TM: A = { est: null, prev: null, his: null, modo: "ahora", idx: 0, ahoraIdx: 0, corrimientoH: 0, demo: "", jugando: false, origen: "simulado", avisos: [], api: null, oyentes: [] };
  var cieloBase = d.colorCss("--sky");

  // --- el cielo, la lluvia y el parche del tiempo (la sombra de las nubes, la helada y el viento en el follaje)
  var materiales = d.Materiales.de(ID_TIEMPO);   // MU5-n: lo que crea este componente (nubes, sol, estrellas, lluvia y barrera) se libera con su libera()
  var cielo = creaCielo({ THREE: THREE, scene: d.scene, camera: d.camera, hash: d.hash, texColor: d.texColor, lienzo: d.lienzo, ocasoFotos: d.ocasoFotos, Materiales: d.Materiales, materiales: materiales });
  var ll = creaLluvia({ THREE: THREE, scene: d.scene, hash: d.hash, Materiales: d.Materiales, materiales: materiales });
  var PT = creaParcheTiempo({ THREE: THREE, colorVertSRGB: d.colorVertSRGB, Materiales: d.Materiales }), uViento = PT.uViento, uSombra = PT.uSombra, parcheTiempo = PT.parcheTiempo;
  // los materiales del ciclo del día llevan el parche (los de follaje, con viento); son de otros módulos: libera() les devuelve lo que tenían
  [d.matHojaG, d.matHojaP, d.matCorteza].forEach(function (m: A) { PT.aplica(m, true); });
  [d.matSuelo, d.matOrto, d.nube.material].forEach(function (m: A) { PT.aplica(m, false); });

  // --- el estado del mundo avanza hacia el objetivo con suavidad
  var cur: A = { ms: ahoraMs(), nub: 0, viento: 0, dir: 0, lluvia: 0, hr: 40, temp: 18 }, meta: A = { ms: ahoraMs(), nub: 0, viento: 0, dir: 0, lluvia: 0, hr: 40, temp: 18 };
  var barreras = creaBarreras({ THREE: THREE, gLinde: d.gLinde, Estaticos: d.Estaticos, suelo: d.suelo, Estado: d.Estado, cieloBase: function () { return cieloBase; },
    temaEstela: function (o: boolean) { var t = d.temaEstela; if (typeof t === "function") t(o); }, Materiales: d.Materiales, materiales: materiales });
  var paso = creaPasoTiempo({
    THREE: THREE, scene: d.scene, camera: d.camera, sol: d.sol, hemi: d.hemi, SRGB: d.SRGB, LUZ_SOL: d.LUZ_SOL, LUZ_CIELO: d.LUZ_CIELO, FOG0: d.FOG0, FOG1: d.FOG1,
    cieloBase: function () { return cieloBase; }, matHojaG: d.matHojaG, matHojaP: d.matHojaP, matCorteza: d.matCorteza, matOrto: d.matOrto, matSuelo: d.matSuelo, nube: d.nube,
    uSombra: uSombra, uViento: uViento, NUBES: cielo.NUBES, nubesMalla: cielo.nubesMalla, pintaNubes: cielo.pintaNubes, sprSol: cielo.sprSol, estrellas: cielo.estrellas,
    OCASO_FOTOS: cielo.OCASO_FOTOS, PALETA_OCASO: PALETA_OCASO, uOcasoN: cielo.uOcasoN, lluvia: ll.lluvia, uLluvia: ll.uLluvia, uBarrera: barreras.uBarrera, objetivo: d.objetivo,
    nivelEn: nivelEn, cur: cur, meta: meta, $: d.$, TiempoPuro: TiempoPuro, TM: TM, fmtHora: fmtHora, num1: num1, rumbo: rumbo,
    estimado: function () { return !!(d.estimado && d.estimado()); }, calma: d.calma
  });
  function pintaFondoTiempo(): void { cieloBase = d.colorCss("--sky"); barreras.temaBarrera(); }

  // --- lo que tiende a enseñar el mundo
  function objetivoMundoBase(): A {
    var h = TM.prev && TM.prev.horas, m: A = { ms: ahoraMs(), nub: 0, viento: 0, dir: 0, lluvia: 0, hr: 40, temp: 18 };
    if (TM.demo && DEMOS[TM.demo]) { var D0 = DEMOS[TM.demo]; m.nub = D0.nub; m.lluvia = D0.lluvia; m.viento = D0.viento; m.dir = D0.dir; m.hr = D0.hr; m.temp = D0.temp; m.ms = TM.modo === "ahora" || !h ? ahoraMs() : Date.parse(h[TM.idx].instante); return m; }
    if (!h || !h.length) { m.ms += TM.corrimientoH * 3600000; return m; }   // sin previsión: el paso de hora de VR es un corrimiento sobre el reloj
    var hh = h[Math.max(0, Math.min(h.length - 1, TM.idx))], e = TM.est;
    // la hora de la previsión (modelado) pone nubes, viento y lluvia; si a una hora le falta un dato, se queda el valor tranquilo de siempre (no se inventa otro)
    var ok = function (v: A) { return typeof v === "number" && isFinite(v); };
    if (ok(hh.nubosidad)) m.nub = hh.nubosidad; if (ok(hh.viento)) m.viento = hh.viento; if (ok(hh.direccion)) m.dir = hh.direccion; if (ok(hh.lluvia)) m.lluvia = hh.lluvia;
    if (ok(hh.humedadRelativa)) m.hr = hh.humedadRelativa; if (ok(hh.temperatura)) m.temp = hh.temperatura;
    // «ahora»: la temperatura y la humedad, las medidas en la estación. La lluvia medida es un acumulado (no dice si llueve ahora): la lluvia que se ve sale de la previsión
    if (TM.modo === "ahora") { m.ms = ahoraMs(); if (e && e.hayLectura) { if (ok(e.humedadRelativa)) m.hr = e.humedadRelativa; if (ok(e.temperatura)) m.temp = e.temperatura; } }
    else m.ms = Date.parse(hh.instante);
    return m;
  }
  function horaMundoTexto(): string { return fmtHora.format(new Date(meta.ms)); }   // la hora (de la zona de la finca) a la que tiende el mundo
  // con la estación de otra fecha (23_estacion.js, que va después en el montaje) manda su objetivoMundo; sin ella, el de siempre
  function objetivoMundo(): A { return typeof d.objetivoMundo === "function" ? d.objetivoMundo() : objetivoMundoBase(); }
  function aplicaMundo(): void { var m = objetivoMundo(); Object.keys(m).forEach(function (c) { meta[c] = m[c]; }); }

  var TiempoVivo = creaTiempoVivo(TM, ahoraMs);

  // --- las fichas del panel y de dónde se lee el tiempo
  // la lámina de la previsión en el mundo: la pide por el Bus («prevision:alterna», la atiende el componente fichas-tiempo de 35_fichas_tiempo.js); el botón solo
  // se ve si alguien la atiende (si el componente está apagado o fuera del motor, no hay botón muerto): se mira otra vez cuando cambian los componentes
  var bus = d.Bus;
  var previsionEnMundo = {
    alterna: function (): void { bus.emite("prevision:alterna"); },
    hay: function (): boolean { return bus.hay("prevision:alterna"); },
    alCambiar: function (fn: () => void): A { return bus.on("componentes:cambia", fn); }
  };
  var fichas = creaFichasTiempo({
    $: d.$, TiempoPuro: TiempoPuro, TM: TM, fmtDia: fmtDia, fmtHora: fmtHora, fmtClaveDia: fmtClaveDia, DEMOS: DEMOS, ahoraMs: ahoraMs, reloj: reloj,
    aplicaMundo: aplicaMundo, vivo: TiempoVivo.lee, horaMundoTexto: horaMundoTexto, previsionEnMundo: previsionEnMundo, prefijoApi: d.prefijoApi, red: d.red, prueba: d.prueba,
    calma: d.calma, temporizador: d.temporizador, alCambiarTema: d.alCambiarTema, pintaFondoTiempo: pintaFondoTiempo
  });
  var lectura = fichas.monta();
  var lindes = d.parcelas.map(barreras.creaBarrera);

  var suelto = false;
  /** Lo que suelta el componente al liberarse (L2-05 y L2-11): el cielo (geometrías, materiales y las texturas de las nubes y del sol), la lluvia, las barreras
   *  de las lindes, los relojes y las escuchas de las fichas, los oyentes de TiempoVivo y el parche de los materiales del ciclo del día (que no son suyos: se les
   *  devuelve el onBeforeCompile que tenían). Dos veces no libera dos veces. Devuelve cuántas cosas soltó. */
  function libera(): number {
    if (suelto) return 0;
    suelto = true;
    var n = cielo.libera() + ll.libera() + barreras.libera() + fichas.libera() + materiales.libera();
    TM.oyentes.length = 0;
    n += PT.suelta();
    return n;
  }
  return {
    TiempoPuro: TiempoPuro, ahoraMs: ahoraMs, TM: TM, nivelEn: nivelEn, nivel: nivel, texBrillo: cielo.texBrillo, uViento: uViento, uSombra: uSombra, GLSL_SOMBRA: GLSL_SOMBRA,
    parcheTiempo: parcheTiempo, nodosTsl: PT.nodosTsl, cur: cur, meta: meta, ins: paso.ins, tMundo: paso.tMundo, actualiza: paso.actualizaTiempo, temaBarrera: barreras.temaBarrera,
    colocaBarrera: barreras.colocaBarrera, fmtDia: fmtDia, fmtHora: fmtHora, fmtClaveDia: fmtClaveDia, objetivoMundoBase: objetivoMundoBase, pasoHoraMundo: fichas.pasoHoraMundo,
    horaMundoTexto: horaMundoTexto, aplicaMundo: aplicaMundo, TiempoVivo: TiempoVivo, lindes: lindes, lectura: lectura, libera: libera,
    // lo de dentro, para las pruebas y ?debug
    cielo: cielo, lluvia: ll, barreras: barreras, fichas: fichas, paso: paso, materiales: materiales
  };
}
export type Tiempo = ReturnType<typeof creaTiempo>;

/** El manifiesto del componente «tiempo-mundo»: el ciclo de vida del tiempo del exterior. El objeto que el motor usa (el de 15_tiempo.js) es el mismo que monta
 *  (lo crea el legado al cargarse: otros módulos leen sus nombres al montarse). Su paso por fotograma no es una fase de componente: es un paso del exterior
 *  (90_final.js: actualizaTiempo), que no corre con el exterior congelado. */
export function manifiestoTiempo(tiempo: Tiempo): Manifiesto {
  return {
    id: ID_TIEMPO, version: 1,
    consume: ["scene", "camera", "sol", "hemi", "matHojaG", "matHojaP", "matCorteza", "matSuelo", "matOrto", "nube", "gLinde", "objetivo", "Bus"],
    expone: ["TiempoVivo"],
    eventos: { escucha: ["componentes:cambia"], emite: ["prevision:alterna"] },
    bandera: { defecto: true },
    // solo ciclo de vida, como el tileset y el catálogo: no se apaga desde la URL (otros módulos leen sus nombres al montarse) y lo que dibuja (las nubes, el sol, las
    // estrellas, la lluvia y las barreras de las lindes) lo cuentan los topes de pruebas/presupuesto.json con el resto de la escena
    presupuesto: { llamadas: 0, triangulos: 0 },
    mundos: ["exterior"],
    monta: function () { return tiempo; },
    libera: function (api) { if (api) (api as Tiempo).libera(); }
  };
}

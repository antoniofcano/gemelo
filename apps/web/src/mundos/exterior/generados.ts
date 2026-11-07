// Los olivos GENERADOS cerca (ADR-0017, decisiones 26-28, 34 y 52) y la ESCALERA de todos (ADR-0019, ADR-0022). MU5-n (A3-2a): antes apps/web/motor/07ab_generados.js
// (902 líneas), que queda como talón. Componente «olivos-generados» de los mundos ["exterior"], con un libera() que suelta de verdad (abajo). Mismo comportamiento
// que antes, sin cambio visible. Partido por lo que hace cada trozo:
//   generados-escalera.ts  el reparto por presupuesto (Escalera) y la decisión de si se piden (GeneradosPuro): lo puro
//   generados-horneado.ts  el manifiesto de las variantes horneadas, su descarga y la fila de impostores que casa con ellas
//   generados-cola.ts      la cola propia (recetas y lote, por cercanía, con su parte del presupuesto de la Cola del motor)
//   generados-sombreado.ts el parche de luz del motor y el fundido por tramado (uFun, uBanda)
//   generados-lote.ts      el lote: las mallas compartidas, montadas a tramos, y las cartulinas recortadas a la silueta
//   generados.ts (este)    el módulo con su estado: el reparto de cada fotograma, las recetas y su caché, el fundido, los rótulos, el ciclo de vida
// POR DEFECTO (O10a, Antonio 2026-11-02): sin ?olivos=, si la finca trae copas_param y copas_id (y el aparato puede), se comporta como con ?olivos=gen;
// ?olivos=0 (o =no) lo apaga y el motor dibuja lo de siempre. La decisión es UNA función pura (GeneradosPuro.activo); si el constructor no está en el build o falla al cargar, lo de siempre sin avisar en consola (se dice en ?debug).
// El árbol lo da el constructor de olivos (apps/web/olivo/, three 0.128 dentro): window.OlivoGen o import("gemelo-olivo") (Vite; el import() se queda en el talón).
// Su forma es la de olivo-2 (forma ILUSTRATIVA con medidas del LiDAR: altura, copa y orientación de copas/copas_param).
// Presupuesto: el 45 % del tope de triángulos del aparato, contando también la pasada de sombras (550 k en escritorio; el del perfil VR en gafas). El más cercano en E0, el resto en E1
// mientras quepan; después VARIANTES compartidas en E2 (E2-VR en gafas) estiradas a cada copa, mientras quepan; más allá, los niveles 1 y 2 de siempre.
// Dentro del radio de lo generado se apaga el niv 0 de siempre (decisión 26), y solo cuando el generado ya está dibujado (antes, nunca). Se genera en un
// trabajador si lo hay; si no, a rebanadas en una cola PROPIA (recetas y lote, por cercanía) con su parte del presupuesto de la cola del motor (02b) en el fotograma: así
// el más cercano no espera detrás de las teselas y celdas pendientes, ni ellas detrás de él (en SwiftShader, con Hituelo real, la cola compartida
// tardó ≈ 7 min en dar 2 olivos: MEDIDAS). El tiempo que gasta se descuenta del de la cola del motor (presupuesto de 07b): el fotograma no paga más.
// El dibujo va fusionado DESPUÉS de la huella: una BatchedMesh por material (corteza, madera muerta, olivas), una malla instanciada por material de
// hoja (ramitas A y B, relleno) y unos puntos (olivas de E2), compartidas por todos los generados: ~6-7 llamadas en total, no por árbol.
// Luz: sus materiales llevan el mismo parche que el resto del motor (parcheTiempo: sombra de nubes y escarcha, color por instancia en sRGB) y sus
// colores y texturas se leen como sRGB (el convenio de 03_escena); la forma no cambia (la receta es la misma: huella olivo-2 y GEN_VERSION intactas).
// Fundido (sin saltos de forma): cada pieza del lote lleva un código (0 se queda, 1 entra, 2 sale; más la ranura de banda) y, al colocar un lote nuevo, un tramado de pantalla
// (descarte por ruido de gradiente entrelazado, sin transparencia ni ordenación, también en la pasada de sombras) deja aparecer lo que entra y
// desaparecer lo que sale en FUNDIDO s; lo que sale va en el mismo lote (al final) y se oculta al acabar. Mientras dura, el dibujo de siempre de lo que
// entra sigue dibujándose debajo y el de lo que sale vuelve a dibujarse desde el principio. ?olivosFundido=0 lo suprime (salto, como antes).
// Variantes HORNEADAS (ADR-0018, contratos/olivo-horneado.md, O7e): generados-horneado.ts. Los propios (E0/E1) se calculan siempre (decisión 63). ?olivosHorneado=0 (para
// comparar a ojo): se lee el manifiesto (mismas variantes y época) pero no se descarga nada; todas se calculan. Para pruebas y comparaciones sin
// servidor: ?olivosDir=<carpeta relativa del mismo origen, acabada en «/»> en vez de <D.base>olivos/, y ?olivosPropios=N (0-6) cuántos propios.
// ESCALERA (ADR-0019, fase A, O8c), solo con ?olivos=escalera: los mismos generados para TODOS los olivos, con el reparto del ADR (Escalera):
// presupuesto entero del aparato (no el 45 %) menos los lejanos (07ac); el escalón de cada olivo, por su alto en píxeles con las fronteras
// desplazadas a la vez por el presupuesto, y en la banda de cada frontera los dos escalones con el tramado complementario según la distancia (O9c,
// decisión 82, ADR-0022); un olivo cambia de escalón solo cuando el pedido está preparado (hasta entonces se queda en el que tenía) y,
// mientras no haya lejanos, lo que sale del 3D se queda en el lote (nunca sin dibujar). El coste ya no dobla por la pasada de sombras si
// renderer.shadowMap no está activo (el motor no lo activa: ver costo()). La copa y la altura de todos, las del propio (parametrosDe, decisión 81).
// Con ?olivos=gen (O8c, Escalera.modoGen): si el manifiesto trae variantes horneadas de la época, la MISMA escalera («horneada»): variantes E2 e
// impostores (07ac) en lugar del nivel 0 de siempre y de los olivos del tileset, en cuanto la capa de lejanos está (hasta entonces, como ?olivos=gen,
// con la escalera dentro de lo generado: Escalera.dibuja); sin variantes horneadas, o con ?olivosEscalera=0, lo de antes («gen»).
// Del legado recibe por argumento lo que necesita (abajo, DepsGenerados); lo que cambia después de cargarse (el renderer, la escena, quien pasea, FACTOR_R8_GEN,
// fetch) se pide en cada uso. No lee globales.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { Materiales } from "../../nucleo/materiales.ts";
import { Escalera, GeneradosPuro } from "./generados-escalera.ts";
import { descarga, dirHorneado, filaDe, filaImpostor, manifiestoNoVale, variantesDeEpoca } from "./generados-horneado.ts";
import { compiladoG as compiladoCon, creaColaPropia } from "./generados-cola.ts";
import { DEF_GEN_OLIVO, DEF_GEN_PROFUNDIDAD, MATERIAL_GEN_OLIVO, MATERIAL_GEN_PROFUNDIDAD, parcheFundidoDe, parcheLuzDe, uniformesFundido } from "./generados-sombreado.ts";
import { creaLote } from "./generados-lote.ts";

// three, el constructor de olivos y los objetos del legado no traen tipos: se tocan sin tiparlos (como en escena-tiles.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export interface DepsGenerados {
  THREE: A;
  /** el índice de la finca (copas, copas_param, copas_id, copas_semilla, centro_utm, base, finca_id) */
  D: A;
  /** 01_datos: el perfil de las gafas (VRP.on) */
  VRP: { on: boolean };
  /** 01_datos: FACTOR_R8_GEN, que la configuración del servidor puede cambiar (factorCopaDeConfig): se lee en cada uso */
  factorR8Gen: () => number;
  factorCopaDeConfig: () => number;
  /** 01a: la política del aparato (cacheMemMB, cacheMemVrMB) */
  Aparato: { politica(): A };
  /** 02c: la configuración del servidor (listo, param, umbrales, tablaEpocas, epocaDeFecha) */
  Config: A;
  /** la fábrica de materiales (encadena, recorte, cartulina, apuntaCartulina) */
  Materiales: Materiales;
  /** 06: el grupo de los árboles, del que cuelga el de los generados */
  gArboles: A;
  camera: A;
  /** 03: Estado.exag (un campo que cambia: se lee en cada uso) */
  Estado: { exag: number };
  /** 02_mundo: el suelo (m) en (x, y) */
  suelo: (x: number, y: number) => number;
  /** 15_tiempo: sombra de nubes, escarcha y color por instancia en sRGB (va después en el montaje: se llama al compilar) */
  parcheTiempo: (sh: A, viento: boolean) => void;
  /** A3-4: los nodos del tiempo en TSL (tiempo-parche.ts: nodosTsl), para la variante apagada; se piden al construirla */
  tiempoTsl?: (() => ((T: A) => A) | null) | null;
  /** location.search */
  busqueda: string;
  reloj: { now(): number };
  consola?: { warn(...a: unknown[]): void } | null;
  /** window (para window.__olivosGen, pruebas y ?debug); null sin navegador */
  ventana?: A;
  /** el constructor de olivos: window.OlivoGen o import("gemelo-olivo") (se queda en el talón, para que Vite lo trocee) */
  cargaConstructor: () => Promise<A>;
  /** lo que cambia o puede no existir aún: el renderer, la escena, quien pasea (12_paseo: pp si paseando) y fetch */
  renderer?: () => A;
  scene?: () => A;
  paseo?: () => { x: number; y: number } | null;
  red?: () => A;
}

export const ID_GENERADOS = "olivos-generados";

export function creaGenerados(d: DepsGenerados) {
  var THREE: A = d.THREE, D: A = d.D, VRP: A = d.VRP, Aparato: A = d.Aparato, Config: A = d.Config, Materiales: A = d.Materiales as A, gArboles: A = d.gArboles, camera: A = d.camera, Estado: A = d.Estado, suelo: A = d.suelo;
  var BUSQUEDA: A = d.busqueda || "", reloj: A = d.reloj, consola: A = d.consola || null, factorCopaDeConfig: A = d.factorCopaDeConfig;
  function rend(): A { return d.renderer ? d.renderer() : null; }
  // los uniformes y los parches del fundido y de la luz (generados-sombreado.ts): los mismos objetos para los 3D y para los lejanos de 07ac
  var materiales: A = d.Materiales;
  var UF: A = uniformesFundido(THREE), uFun: A = UF.uFun, uBanda: A = UF.uBanda, parcheFundido: A = parcheFundidoDe(UF), parcheLuz: A = parcheLuzDe(d.parcheTiempo);
  // O8c: con ?olivos=gen, «gen» u «horneada» (Escalera.modoGen) se decide con el manifiesto, antes de que Generados quede activo; ESCALERA
  // (reparte con la escalera: forzada u horneada) ya no cambia después
  var DECISION: A = GeneradosPuro.activo(BUSQUEDA, D, { batched: !!THREE.BatchedMesh }), BANDERA: A = DECISION.bandera, POR_DEFECTO: A = DECISION.defecto && !!BANDERA;
  var MODO: A = Escalera.modoGen({ bandera: BANDERA }), ESCALERA: A = MODO === "forzada", SIN_ESCALERA: A = /[?&]olivosEscalera=0\b/.test(BUSQUEDA);
  var pedido: A = !!BANDERA, estado: A = pedido ? "cargando" : "apagado", motivo: A = "", M: A = null, mats: A = null, fabrica: A = null;
  var fr: A = /[?&]olivosTri=([0-9.]+)/.exec(BUSQUEDA), FRACCION: A = fr && !ESCALERA ? Math.min(0.9, Number(fr[1])) : ESCALERA ? 1 : 0.45;
  var mpr: A = /[?&]olivosPropios=([0-6])\b/.exec(BUSQUEDA), MAX_PROPIOS_VR: A = null;   // MAX_PROPIOS_VR: el de las gafas, si la configuración lo da
  var ESTIM: A = { E0: 160000, E1: 80000, E2: 38000, E2VR: 28000 }, SEM_VAR: A = [11, 23, 37, 51], MAX_PROPIOS: A = mpr ? Number(mpr[1]) : 6, MAX_VAR: A = 48, RADIO_CAND: A = 160, MARGEN: A = 12;
  var SIL: A = null, silPend: A = false;   // AG-2.2 (?cartulina=silueta): la geometría recortada de cada cartulina de hoja, por clave de malla instanciada (claveInst)
  var nLotes: A = 0, recetas: A = {}, pidiendo: A = {}, nPidiendo: A = 0, plan: A = [], listos: A = {}, enLote: A = {}, lote: A = null, claveLote: A = "", nuevo: A = null, R: A = 0, triGen: A = 0, costoGen: A = 0, info: A = { llamadas: 0, triangulos: 0 };
  var ff: A = /[?&]olivosFundido=([0-9.]+)/.exec(BUSQUEDA), FUNDIDO: A = ff ? Math.min(3, Number(ff[1])) : 0.6;
  var HORNEADO: A = !/[?&]olivosHorneado=0\b/.test(BUSQUEDA), manif: A = null, varSem: A = null, epocaManif: A = null, fechaPrueba: A = null;
  var horn: A = { estado: "no", motivo: "", horneadas: 0, calculadas: 0, fallos: 0, cache: 0, propios: 0, ultimoFallo: "" };
  var cache: A = null, fundido: A = null, selLote: A = [], avisa: A = false, prof: A = null;   // fundido: {t, viejos: {i: true}, Rviejo} mientras dura
  var NADA: A = { radio: 0, tri: 0, tiene: function () { return false; } };
  // el lote (generados-lote.ts): lo que lee del estado de este módulo, por funciones (cambia con el tiempo)
  var LT: A = creaLote({ THREE: THREE, M: function () { return M; }, recetas: recetas, mats: function () { return mats; }, prof: function () { return prof; },
    sil: function () { return SIL; }, ponSil: function (s: A) { SIL = s; }, silPend: function () { return silPend; }, matrizDe: matrizDe, Materiales: Materiales });
  var grupo: A = new THREE.Group(); grupo.name = "olivosGenerados";
  function epoca() { var m: A = /[?&]epoca=([a-z]+)/.exec(BUSQUEDA); return m ? m[1] : epocaManif || epocaConfig(D.finca_id) || "envero"; }
  // la época de hoy según el calendario de la configuración del servidor (02c Config; null si no lo trae o no cubre los 366 días)
  function epocaConfig(finca: A) { var t: A = Config.tablaEpocas(finca); return t ? Config.epocaDeFecha(t, fechaPrueba || new Date()) : null; }
  function arrancaGen() {
    var p: A = d.cargaConstructor();   // window.OlivoGen o import("gemelo-olivo"): el import() se queda escrito en el talón, para que Vite lo trocee como antes
    // la configuración del servidor (02c Config: espera como mucho 2 s; sin servidor, al momento) se aplica antes del primer olivo: nada cambia en caliente
    Promise.all([p, Config.listo]).then(function (r: A) {
      if (liberado) return;   // MU5-n: liberado mientras cargaba: no se monta nada
      var m: A = r[0]; aplicaConfig();
      if (!m || !m.recetaG) throw new Error("sin el constructor de olivos (OlivoGen)");
      if (!THREE.BatchedMesh) throw new Error("este three no tiene BatchedMesh");
      // caché de recetas (O5): memoria con LRU (60 MB en móvil, gafas o con ≤ 4 GB; 150 MB si no) e IndexedDB (300 MB, LRU); ?olivosCache=0 la apaga
      cache = m.creaCache && !/[?&]olivosCache=0\b/.test(BUSQUEDA) ? m.creaCache({ memMB: topeCacheMem(), discoMB: 300 }) : null;
      M = m; return cargaManifiesto();   // antes de los materiales: la época puede salir del manifiesto
    }).then(function () {
      if (liberado || !M) return;
      // con ?olivos=gen y variantes horneadas de la época, la escalera (O8c); sin ellas, como siempre
      MODO = Escalera.modoGen({ bandera: BANDERA, manifiesto: !!manif, variantes: varSem ? varSem.length : 0, sinEscalera: SIN_ESCALERA });
      ESCALERA = MODO === "forzada" || MODO === "horneada";
      reemplazos = {};
      mats = M.creaMateriales(THREE, null, { epoca: epoca(), srgb: true, parche: parcheGen, mipsCobertura: !/[?&]olivosMips=0\b/.test(BUSQUEDA) });   // sin fotos de campo aquí: corteza dibujada (texturas.js); hojas con mipmaps que conservan la cobertura (ADR-0022 §6; ?olivosMips=0, los de la GPU)
      Object.keys(reemplazos).forEach(function (n) { mats[n] = reemplazos[n]; });   // solo con la TSL (MU6): con el clásico no hay ninguno
      prof = { corteza: profundidad(), muerta: profundidad() };   // la sombra de las mallas por lotes, con el mismo fundido
      var f: A = M.creaFabrica({ trabajador: true }); if (f.modo === "trabajador") fabrica = f; else f.cierra();
      if (liberado) { suelta(); return; }
      estado = "activo";
      if (Materiales.cartulina.silueta) { silPend = true; encola("Gsiluetas", -2, LT.siluetasG(), function () { silPend = false; }); }   // AG-2.2: antes del primer lote (prio −2 < −1 del lote)
    }).catch(function (e: A) { if (liberado) return; estado = "sin"; motivo = String(e && e.message || e); if (!POR_DEFECTO && consola) consola.warn("olivos generados: " + motivo); });   // por defecto, sin avisar: se dibuja lo de siempre y ?debug lo dice
  }
  // ---- el manifiesto de las variantes horneadas (generados-horneado.ts): solo con la página del servidor; si no vale, se ignora entero y todo se calcula (sin avisar en consola)
  var DIR: A = dirHorneado(BUSQUEDA, D.base);
  function cargaManifiesto() {
    var red: A = d.red ? d.red() : null;
    if (!M.decodifica || !DIR || !red) { horn.estado = "sin servidor"; return Promise.resolve(); }
    horn.estado = "pidiendo";
    return red(DIR + "manifiesto.json", { credentials: "same-origin", cache: "no-cache" })
      .then(function (r: A) { if (!r.ok) throw new Error("sin manifiesto (http " + r.status + ")"); return r.json(); })
      .then(function (m: A) {
        var no: A = manifiestoNoVale(m, M); if (no) throw new Error(no);
        manif = m;
        if (!/[?&]epoca=/.test(BUSQUEDA)) {   // la época por fecha: la del calendario de la configuración (decisión 112) si el hornero la tiene;
          // si no, con el calendario del manifiesto (sus ventanas); si hoy no cae en ninguna, la actual
          var ventanas: A = {}, ec: A = epocaConfig(m.finca); m.epocas.forEach(function (e: A) { ventanas[e.epoca] = { desde: e.desde, hasta: e.hasta }; });
          epocaManif = (ec && m.epocas.some(function (e: A) { return e.epoca === ec; }) ? ec : null) || M.epocaDeFecha(M.tablaDe({ comun: ventanas }, m.finca), fechaPrueba || new Date()) || m.actual;
        }
        var ep: A = epoca(); varSem = variantesDeEpoca(m, ep);
        if (!varSem) { horn.estado = "sin la época " + ep; } else horn.estado = HORNEADO ? "activo" : "apagado";
      })
      .catch(function (e: A) { manif = null; varSem = null; epocaManif = null; horn.estado = "ignorado"; horn.motivo = String(e && e.message || e).slice(0, 80); });
  }
  // MU5-n: los materiales por la fábrica (generados-sombreado.ts: define de «gen-olivo» y «gen-profundidad»), con dueño «olivos-generados»: libera() los suelta.
  // El constructor crea sus materiales y llama a parcheGen(m, n) con cada uno; lo que devuelve la fábrica (el mismo material con el clásico; otro con la TSL, en MU6)
  // se anota en reemplazos y se pone en mats al acabar (la biblioteca no recoge lo que devuelve su parche)
  materiales.define(MATERIAL_GEN_OLIVO, DEF_GEN_OLIVO); materiales.define(MATERIAL_GEN_PROFUNDIDAD, DEF_GEN_PROFUNDIDAD);
  var propios: A = materiales.de(ID_GENERADOS), reemplazos: A = {};
  function luzFundido(sh: A) { parcheLuz(sh); parcheFundido(sh); }
  function parcheGen(m: A, n?: A) {
    if (m.isMeshDepthMaterial) { anota(n, m, propios.crea(MATERIAL_GEN_PROFUNDIDAD, { material: m, fundido: parcheFundido, propia: M.encadena, uniformes: UF })); return; }
    if (m.color) m.color.convertSRGBToLinear();   // el número de la referencia es un color «tal como se ve» (sRGB): el convenio del motor
    Materiales.recorte(m);   // AG-2.1: relleno, ramitas y tarjetas (alphaTest > 0) a alphaToCoverage; la corteza no tiene recorte y no cambia
    anota(n, m, propios.crea(MATERIAL_GEN_OLIVO, { material: m, parche: luzFundido, propia: M.encadena, uniformes: UF, pieza: n, tiempo: d.tiempoTsl || null }));
  }
  function anota(n: A, m: A, r: A) { if (n !== undefined && r !== m) reemplazos[n] = r; }
  function profundidad() { return propios.crea(MATERIAL_GEN_PROFUNDIDAD, { material: null, fundido: parcheFundido, propia: M.encadena, uniformes: UF }); }
  // la entrada del generador para un olivo del registro: semilla guardada o su id; parámetros medidos (copas_param) o h y r8 × FACTOR_R8_GEN
  function entrada(c: A) {
    var raw: A = D.copas[c.i], id: A = D.copas_id ? D.copas_id[c.i] : -1;
    var s: A = M.semillaDeCopa(raw, id, D.centro_utm, D.copas_semilla ? D.copas_semilla[c.i] : undefined) || { semilla: c.i + 1, provisional: true };
    var p: A = parametrosDe(c);
    return { tipo: p.tipo, parametros: p.parametros, epoca: epoca(), semilla: s.semilla, provisional: s.provisional };
  }
  // LA fuente de la copa y la altura de un olivo (decisión 81, ADR-0022 §1): las del generador (copas_param si las hay; si no, h y 2 × r8 medio ×
  // FACTOR_R8_GEN, acotadas como en el constructor). El propio se genera con ellas (entrada) y la variante y el impostor se estiran a ellas
  // (matrizDe): el mismo olivo tiene la misma anchura y altura en todos los escalones. Se guarda en el olivo (no cambia con la época ni el nivel).
  function parametrosDe(c: A) {
    if (c.pgen && c.pgen.f === d.factorR8Gen()) return c.pgen.p;
    var raw: A = D.copas[c.i] || [c.x, c.y, c.h, c.perfil], p: A = M.parametrosDeCopa(raw, D.copas_param ? D.copas_param[c.i] : null, "centenario3", { factorR8: d.factorR8Gen() });
    c.pgen = { f: d.factorR8Gen(), p: p }; return p;
  }
  function topeCacheMem() {
    var p: A = Aparato.politica(); return VRP.on ? p.cacheMemVrMB : p.cacheMemMB;   // AG-0.3: 60 en VR, móvil, gafas o poca memoria; 150 en escritorio
  }
  // una receta: de la caché si está (memoria al instante; disco, sin bloquear) y, si no, se calcula (trabajador o cola propia) y se guarda en ella
  // (una variante que está en el manifiesto, antes de calcularse, se descarga horneada; si la descarga falla en algo, se calcula y se cuenta el fallo)
  function pide(clave: A, e: A, niv: A, prio: A, variante?: A) {
    if (liberado || recetas[clave] || pidiendo[clave] || nPidiendo >= 2) return;
    var e2: A = { tipo: e.tipo, parametros: e.parametros, epoca: e.epoca, semilla: e.semilla }, ck: A = M.claveReceta(e2, niv), r0: A = cache ? cache.mem(ck) : null;
    if (r0) { recetas[clave] = r0; if (variante) horn.cache++; return; }
    pidiendo[clave] = true; nPidiendo++;
    var llega: A = function (r: A) { if (liberado) return; delete pidiendo[clave]; nPidiendo--; recetas[clave] = r; };
    var hecha: A = function (r: A) { if (liberado) return; llega(r); if (cache) cache.pon(ck, r); };
    var calculada: A = function (r: A) { if (variante) horn.calculadas++; else horn.propios++; hecha(r); };
    var calcula: A = function () {
      if (fabrica) { fabrica.receta(e2, niv).then(calculada, function (err: A) { delete pidiendo[clave]; nPidiendo--; motivo = String(err); }); return; }
      encola("G" + clave, prio, seguro((function* () { var r: A = yield* M.recetaG(e2); if (niv !== "E0") r = yield* M.aNivelG(r, niv); return r; })()), function (r: A) { if (r) calculada(r); else { delete pidiendo[clave]; nPidiendo--; } });
    };
    var fila: A = variante && HORNEADO ? filaDe(manif, e2, niv) : null;
    var trae: A = !fila ? calcula : function () {
      descarga(d.red ? d.red() : null, DIR as string, M, fila, ck, niv).then(function (r: A) { horn.horneadas++; hecha(r); }, function (err: A) { horn.fallos++; horn.ultimoFallo = String(err && err.message || err).slice(0, 60); calcula(); });
    };
    if (cache && cache.estado().enDisco) cache.lee(ck).then(function (r: A) { if (r) { if (variante) horn.cache++; llega(r); } else trae(); }, trae); else trae();
  }
  // la transformación de cada árbol: su sitio, la exageración vertical y, en las variantes, el estirado a la copa y la altura medidas
  function matrizDe(c: A, r: A, variante: A) {
    var gz: A = suelo(c.x, c.y) * Estado.exag, sx: A = r.escala[0], sy: A = r.escala[1], sz: A = r.escala[2];
    if (variante) {   // a la copa y la altura del propio (parametrosDe); lo que no se sepa, a las de la receta
      var P: A = parametrosDe(c).parametros, k: A = P.copa > 0 ? P.copa / r.medidas.copa_m : 1, ky: A = P.altura > 0 ? P.altura / r.medidas.altura_m : 1;
      sx *= k; sz *= k; sy *= ky;
    }
    return new THREE.Matrix4().makeScale(sx, sy * Estado.exag, sz).setPosition(c.x, gz, -c.y);
  }
  function tri(r: A) { return r ? M.triangulosNivel(r) + extraSil(r) : 0; }
  // AG-2.2: lo que añaden las cartulinas recortadas (la biblioteca cuenta 2 triángulos por ramita o relleno y 6 por tarjeta): así el reparto por
  // presupuesto paga lo que de verdad se dibuja y los topes no se pasan (con la silueta, el reparto acerca las fronteras un poco)
  function extraSil(r: A) {
    if (!SIL) return 0;
    var t: A = 0, P: A = r.piezas;
    for (var i: A = 0; i < P.length; i++) { var z: A = P[i]; if (z.clase !== "instancias") continue; var s: A = SIL[LT.claveInst(z)]; if (s) t += z.n * s.extra; }
    return t;
  }
  // lo que cuesta de verdad por fotograma: sus triángulos más los de la pasada de sombras (todo proyecta sombra salvo las olivas y los puntos).
  // Con ?olivos=escalera, la pasada solo se cobra si existe: el motor no activa renderer.shadowMap (O8c lo comprobó con renderer.info: ver
  // doc/sistema/MEDIDAS.md) y entonces cuesta sus triángulos. ?olivos=gen sigue cobrándola (no cambia lo que dibuja).
  function sombras() { var renderer: A = rend(); return !ESCALERA || (!!renderer && !!renderer.shadowMap && !!renderer.shadowMap.enabled); }
  function costo(r: A) {
    if (!r) return 0;
    var t: A = tri(r), ol: A = 0;
    if (!sombras()) return t;
    r.piezas.forEach(function (z: A) { if (z.rol === "olivas" && z.clase === "instancias") ol += z.n * (z.geo === "octa" ? 8 : 20); });
    return 2 * t - ol;
  }
  var ESTIM_ESC: A = { E0: 105000, E1: 25000, E2: 11000, E2VR: 11000 };   // escalera, sin receta aún: los triángulos medidos (centenario3 semilla 7; E1/E2 con tarjetas, O9b) redondeados hacia arriba
  function estim(niv: A) { return ESCALERA ? ESTIM_ESC[niv] * (sombras() ? 2 : 1) : ESTIM[niv]; }

  // ---- reparte el presupuesto: lo llama el reparto de 07b_arboles.reclasifica con el foco (fx, fz) y el tope de triángulos del aparato
  function actualiza(fx: A, fz: A, tope: A, olivos: A, escala?: A, retener?: A) {
    if (estado !== "activo") return NADA;
    if (ESCALERA) return actualizaEscalera(fx, fz, tope, olivos, escala, retener);
    // lo que se observa (el foco: el punto de la órbita, o quien pasea), y solo si la cámara está cerca de él: desde lejos no se genera nada
    var cam: A = camera.position, amplia: A = Math.max(1, Math.sqrt(escala || 1)), lejos: A = Math.hypot(cam.x - fx, cam.z - fz, Math.max(0, cam.y - suelo(fx, -fz) * Estado.exag)) > 150 * amplia;   // con el aparato holgado (escala de 07b > 1) se genera desde más lejos: hasta ~240 m
    var pres: A = tope * FRACCION, vr: A = VRP.on, nivV: A = vr ? "E2VR" : "E2";
    var cand: A = [];
    if (!lejos) for (var i: A = 0; i < olivos.length; i++) { var c: A = olivos[i], d: A = Math.hypot(c.x - fx, -c.y - fz); if (d < RADIO_CAND * amplia) cand.push({ c: c, d: d }); }
    cand.sort(function (a: A, b: A) { return a.d - b.d; }); if (cand.length > 80) cand.length = 80;
    // histéresis (paseando, el foco se mueve a cada paso): un olivo propio del plan anterior se queda, con su MISMO nivel, mientras siga a menos de la
    // distancia del más lejano de aquel plan más MARGEN m; así su receta llega a usarse en vez de pedirse otra a cada metro. Los nuevos entran detrás
    var antes: A = {}, dAntes: A = 0, nuevoPlan: A = [], usado: A = 0, propios: A = true, nVar: A = 0, hayE0: A = false, nProp: A = 0;
    plan.forEach(function (p: A) { if (p.propio) { antes[p.c.i] = p; dAntes = Math.max(dAntes, p.d); } });
    cand.forEach(function (x: A) {
      var a: A = antes[x.c.i]; if (!a || x.d > dAntes + MARGEN || nProp >= MAX_PROPIOS) return;
      var t: A = recetas[a.clave] ? costo(recetas[a.clave]) : ESTIM[a.niv]; if (usado + t > pres) return;
      nuevoPlan.push({ c: x.c, d: x.d, clave: a.clave, niv: a.niv, propio: true }); usado += t; nProp++; x.puesto = true; if (a.niv === "E0") hayE0 = true;
    });
    for (var k: A = 0; k < cand.length; k++) {
      var x: A = cand[k], e: A = null;
      if (x.puesto) continue;
      if (propios && nProp < MAX_PROPIOS) {
        var niveles: A = !hayE0 ? ["E0", "E1"] : ["E1"], hecho: A = false;
        for (var q: A = 0; q < niveles.length && !hecho; q++) {
          var clave: A = "p" + x.c.i + ":" + niveles[q], t: A = recetas[clave] ? costo(recetas[clave]) : ESTIM[niveles[q]];
          if (usado + t <= pres) { nuevoPlan.push({ c: x.c, d: x.d, clave: clave, niv: niveles[q], propio: true }); usado += t; hecho = true; nProp++; if (niveles[q] === "E0") hayE0 = true; }
        }
        if (hecho) continue;
        propios = false;
      }
      if (nVar >= MAX_VAR) break;
      var cv: A = "v" + (x.c.i % (varSem || SEM_VAR).length) + ":" + nivV, tv: A = recetas[cv] ? costo(recetas[cv]) : ESTIM[nivV];
      if (usado + tv > pres) break;
      nuevoPlan.push({ c: x.c, d: x.d, clave: cv, niv: nivV, propio: false }); usado += tv; nVar++;
    }
    nuevoPlan.sort(function (a: A, b: A) { return a.d - b.d; });
    plan = nuevoPlan;
    // pedir lo que falta (lo más cercano primero; las variantes, una vez cada una)
    plan.forEach(function (p: A) {
      if (recetas[p.clave]) return;
      if (p.propio) { var e2: A = entrada(p.c); p.provisional = e2.provisional; pide(p.clave, e2, p.niv, p.d); }
      else {   // los tipos y semillas de las variantes: los del manifiesto si lo hay; si no, centenario3 con SEM_VAR
        var jv: A = Number(p.clave.slice(1, p.clave.indexOf(":"))), sv: A = varSem ? varSem[jv] : { tipo: "centenario3", semilla: SEM_VAR[jv] };
        pide(p.clave, { tipo: sv.tipo, epoca: epoca(), semilla: sv.semilla }, p.niv, p.d + 200, true);
      }
    });
    // lo que ya se puede dibujar; si cambia, se rehace el lote (a rebanadas, por la cola propia)
    // cada receta lista entra ya (lote incremental); si la de su nivel aún no está pero sí la del otro nivel de ese olivo, se dibuja esa mientras
    var listosAhora: A = [];
    plan.forEach(function (p: A) {
      if (recetas[p.clave]) { listosAhora.push(p); return; }
      var otra: A = p.propio ? "p" + p.c.i + ":" + (p.niv === "E0" ? "E1" : "E0") : null;
      if (otra && recetas[otra]) listosAhora.push({ c: p.c, d: p.d, clave: otra, niv: p.niv === "E0" ? "E1" : "E0", propio: true, provisional: p.provisional });
    });
    var cl: A = Estado.exag + "|" + listosAhora.map(function (p: A) { return p.c.i + "=" + p.clave; }).join(",");
    if (cl !== claveLote && !hay("Glote") && !fundido) {
      var fija: A = listosAhora.slice(), items: A = elementos(fija);
      encola("Glote", -1, seguro(compiladoG(LT.construyeG(items))), function (g: A) { if (g) colocaLote(g, fija, items, cl); });
    }
    return { radio: fundido ? Math.min(R, fundido.Rviejo) : R, tri: triGen, tiene: tiene };
  }
  // ---- la escalera (?olivos=escalera): todo el presupuesto que da 07b (ya sin los lejanos), el reparto de Escalera.planifica por alto en píxeles
  // (O9c) y, si retener (aún no hay lejanos), lo que sale del 3D se queda en el lote. ?olivosPx=E0,E1,E2 cambia los umbrales de partida (px de alto;
  // para afinarlos en aparato, O9d) y ?olivosBanda=m la media banda del fundido (0: sin banda, salto en la frontera con el fundido por tiempo).
  var estEsc: A = {}, reparto: A = { propios: 0, variantes: 0, usado: 0, pres: 0 }, prePide: A = {}, ranuraDe: A = {}, bandas: A = {}, lejRanura: A = {}, v2: A = null;
  var mU: A = /[?&]olivosPx=([0-9.]+),([0-9.]+),([0-9.]+)/.exec(BUSQUEDA), UMB: A = mU ? [Number(mU[1]), Number(mU[2]), Number(mU[3])] : Escalera.UMBRALES;
  var mB: A = /[?&]olivosBanda=([0-9.]+)/.exec(BUSQUEDA), BANDA: A = mB ? Math.min(5, Number(mB[1])) : Escalera.BANDA, PRE: A = 6, MAX_PRE: A = 2;
  var HIST_E: A = Escalera.HIST, FR_E0: A = Escalera.FR_E0_VR;
  // los parámetros de la escalera de la configuración del servidor (decisión 111, contratos/config.schema.json), una vez al arrancar: URL > configuración
  // > código, recortados a sus límites por Config (02c). El presupuesto de escritorio y el de móvil los aplica 07b; los de gafas, 29_vr (VR_PERFILES).
  function aplicaConfig() {
    UMB = Config.umbrales(Escalera.UMBRALES, mU ? UMB : null);
    BANDA = Config.param("escalera.bandaM", Escalera.BANDA, mB ? BANDA : null);
    HIST_E = Config.param("escalera.histeresis", Escalera.HIST);
    MAX_PROPIOS = Config.param("escalera.maxPropios", MAX_PROPIOS, mpr ? MAX_PROPIOS : null);
    MAX_PROPIOS_VR = Config.param("escalera.maxPropiosGafas", null, mpr ? MAX_PROPIOS : null);
    MAX_VAR = Config.param("escalera.maxVariantes", MAX_VAR);
    FR_E0 = Config.param("escalera.fraccionE0Gafas", Escalera.FR_E0_VR);
    factorCopaDeConfig();
  }
  function nVar() { return (varSem || SEM_VAR).length; }
  function pideVariante(j: A, niv: A, prio: A) {
    var sv: A = varSem ? varSem[j] : { tipo: "centenario3", semilla: SEM_VAR[j] };
    pide("v" + j + ":" + niv, { tipo: sv.tipo, epoca: epoca(), semilla: sv.semilla }, niv, prio, true);
  }
  // el ojo con el que se miden los píxeles: paseando, quien pasea (en el plano: girar en el sitio no cambia nada); si no, la cámara
  function ojoAhora() {
    var pp: A = d.paseo ? d.paseo() : null;   // 12_paseo: quien pasea, si pasea
    if (pp) return { x: pp.x, z: -pp.y, plano: true };
    var c: A = camera.position; return { x: c.x, y: c.y, z: c.z, plano: false };
  }
  function distOjo(c: A, o: A) {
    var dx: A = c.x - o.x, dz: A = -c.y - o.z; if (o.plano) return Math.hypot(dx, dz);
    return Math.hypot(dx, dz, Math.max(0, o.y - (c.gz !== undefined ? c.gz : suelo(c.x, c.y)) * Estado.exag));
  }
  // px por (metro de alto / metro de distancia): alto del búfer · P[5] / 2 (P[5] = 1 / tan(fov/2)); en VR, el de un ojo; sin cámara, 1080 p a 42°
  function kPixeles() {
    var renderer: A = rend();
    if (!renderer) return Escalera.K_PX;
    if (renderer.xr && renderer.xr.isPresenting) {
      var xc: A = renderer.xr.getCamera(), c0: A = xc && xc.cameras && xc.cameras[0];
      if (c0 && c0.viewport && c0.viewport.w > 0) return c0.viewport.w * c0.projectionMatrix.elements[5] / 2;
    }
    if (!renderer.getDrawingBufferSize || !camera.projectionMatrix) return Escalera.K_PX;
    v2 = v2 || new THREE.Vector2(); renderer.getDrawingBufferSize(v2);
    return v2.y > 0 ? v2.y * camera.projectionMatrix.elements[5] / 2 : Escalera.K_PX;
  }
  function altoDe(c: A) { var P: A = parametrosDe(c).parametros; return (P.altura > 0 ? P.altura : Math.max(1, c.h || 4)) * Estado.exag; }
  function actualizaEscalera(fx: A, fz: A, tope: A, olivos: A, escala: A, retener: A) {
    var cam: A = camera.position, amplia: A = Math.max(1, Math.sqrt(escala || 1)), lejos: A = Math.hypot(cam.x - fx, cam.z - fz, Math.max(0, cam.y - suelo(fx, -fz) * Estado.exag)) > 150 * amplia;
    var vr: A = VRP.on, NIV: A = ["E0", "E1", vr ? "E2VR" : "E2"], nv: A = nVar(), ojo: A = ojoAhora(), kPx: A = kPixeles(), cand: A = [];
    if (!lejos) for (var i: A = 0; i < olivos.length; i++) { var c: A = olivos[i]; if (Math.hypot(c.x - fx, -c.y - fz) < RADIO_CAND * amplia) cand.push({ c: c, d: distOjo(c, ojo) }); }
    cand.sort(function (a: A, b: A) { return a.d - b.d; }); if (cand.length > 120) cand.length = 120;
    var r: A = Escalera.planifica(cand, estEsc, { pres: tope, vr: vr, ahora: reloj.now() / 1000, kPx: kPx, umbrales: UMB, banda: BANDA, hist: HIST_E, frE0Vr: FR_E0,
      maxPropios: vr && MAX_PROPIOS_VR !== null ? MAX_PROPIOS_VR : MAX_PROPIOS, maxVar: MAX_VAR, alto: altoDe,
      costo: function (cl: A, niv: A) { return recetas[cl] ? costo(recetas[cl]) : estim(niv); },
      clavePropia: function (c: A, niv: A) { return "p" + c.i + ":" + niv; }, claveVar: function (c: A) { return "v" + (c.i % nv) + ":" + NIV[2]; } });
    plan = r.plan; reparto = { propios: r.propios, variantes: r.variantes, usado: Math.round(r.usado), pres: Math.round(tope), s: +r.s.toFixed(3), enBanda: r.enBanda, kPx: Math.round(kPx), umbrales: UMB, banda: BANDA };
    // lo que falta se pide por prioridad (como mucho 2 a la vez): los propios por su distancia; las variantes E2 de los lejanos (07ac), siempre
    // aunque no haya nada en 3D, justo después de los propios de menos de 50 m (sin ellas, de lejos no hay olivos: en SwiftShader, sin trabajador
    // y detrás de los propios, no llegaron en 12 min en el banco de O8c); las variantes del plan, detrás; y, detrás de todo, el escalón vecino de
    // un olivo a menos de PRE m de su banda (como mucho MAX_PRE), para que esté cuando entre en ella
    var pedir: A = [], pre: A = {}, nPre: A = 0;
    plan.forEach(function (p: A) {
      if (recetas[p.clave]) return;
      if (p.propio) pedir.push({ prio: p.d, f: function () { var e2: A = entrada(p.c); p.provisional = e2.provisional; pide(p.clave, e2, p.niv, p.d); } });
      else pedir.push({ prio: p.d + 200, f: function () { pideVariante(Number(p.clave.slice(1, p.clave.indexOf(":"))), p.niv, p.d + 200); } });
    });
    for (var j: A = 0; j < nv; j++) (function (j: A) { if (!recetas["v" + j + ":E2"]) pedir.push({ prio: 50 + j, f: function () { pideVariante(j, "E2", 50 + j); } }); })(j);
    plan.forEach(function (p: A) {
      if (p.rol !== 0 || !p.F) return;
      var F: A = p.F, n: A = NIV.indexOf(p.niv), quiere: A = [];
      if (n >= 1 && F.D[n - 1] > 0 && p.d < F.D[n - 1] + F.b[n - 1] + PRE) quiere.push(NIV[n - 1]);
      if (n === 0 && p.d > F.D[0] - F.b[0] - PRE) quiere.push("E1");
      quiere.forEach(function (niv: A) {
        var cl: A = "p" + p.c.i + ":" + niv; pre[cl] = true;
        if (!recetas[cl] && nPre < MAX_PRE) { nPre++; pedir.push({ prio: p.d + 300, f: function () { var e2: A = entrada(p.c); pide(cl, e2, niv, p.d + 300); } }); }
      });
    });
    prePide = pre;
    pedir.sort(function (a: A, b: A) { return a.prio - b.prio; }).forEach(function (x: A) { x.f(); });
    // lo que ya se puede dibujar, por olivo: sus partes si están todas; si en una banda solo está una, esa entera; si no hay ninguna, el otro
    // nivel propio de ese olivo o lo que tenía en el lote. Sin lejanos todavía (retener), lo de la banda E2|lejano va entero
    var antes: A = {}, porOlivo: A = {}, orden: A = [], listosAhora: A = [];
    selLote.forEach(function (p: A) { (antes[p.c.i] = antes[p.c.i] || []).push(p); });
    plan.forEach(function (p: A) { if (!porOlivo[p.c.i]) { porOlivo[p.c.i] = []; orden.push(p.c.i); } porOlivo[p.c.i].push(p); });
    orden.forEach(function (i: A) {
      var ps: A = porOlivo[i], hay: A = ps.filter(function (p: A) { return recetas[p.clave]; });
      if (hay.length === ps.length) { ps.forEach(function (p: A) { listosAhora.push(retener && p.lej ? conRol(p, 0) : p); }); return; }
      if (hay.length) { listosAhora.push(conRol(hay[0], 0)); return; }
      var p: A = ps[0], otra: A = p.propio ? "p" + i + ":" + (p.niv === "E0" ? "E1" : "E0") : null;
      if (otra && recetas[otra]) { listosAhora.push(Object.assign(conRol(p, 0), { clave: otra, niv: p.niv === "E0" ? "E1" : "E0" })); return; }
      (antes[i] || []).forEach(function (a: A) { if (recetas[a.clave]) listosAhora.push(Object.assign({}, a, { d: p.d })); });
    });
    if (retener) selLote.forEach(function (p: A) { if (!porOlivo[p.c.i] && recetas[p.clave]) listosAhora.push(p); });   // sin lejanos todavía: nada se queda sin dibujar
    listosAhora.sort(function (a: A, b: A) { return a.d - b.d || (a.rol || 0) - (b.rol || 0); });
    ranuras(listosAhora);
    var cl: A = Estado.exag + "|" + listosAhora.map(function (p: A) { return p.c.i + "=" + p.clave + ":" + (p.rol || 0) + ":" + (p.ranura || 0); }).join(",");
    if (cl !== claveLote && !hay("Glote") && !fundido) {
      var fija: A = listosAhora.slice(), items: A = elementos(fija);
      encola("Glote", -1, seguro(compiladoG(LT.construyeG(items))), function (g: A) { if (g) colocaLote(g, fija, items, cl); });
    }
    return { radio: fundido ? Math.min(R, fundido.Rviejo) : R, tri: triGen, tiene: tiene, fase: fase, ranura: ranuraLej };
  }
  function conRol(p: A, rol: A) { var q: A = Object.assign({}, p); q.rol = rol; if (!rol) { q.banda = null; q.ranura = 0; } return q; }
  // la ranura de cada olivo con partes en banda (1-63): la misma mientras siga en banda (en el lote colocado o en el que se monta), y se libera al
  // colocar un lote que ya no la usa (colocaLote)
  function ranuras(lista: A) {
    var usadas: A = {}; Object.keys(ranuraDe).forEach(function (i: A) { usadas[ranuraDe[i]] = true; });
    lista.forEach(function (p: A) {
      if (!(p.rol > 0)) { p.ranura = 0; return; }
      var i: A = p.c.i;
      if (!ranuraDe[i]) { for (var s: A = 1; s < 64; s++) if (!usadas[s]) { ranuraDe[i] = s; usadas[s] = true; break; } }
      if (!ranuraDe[i]) { p.rol = 0; p.ranura = 0; p.banda = null; return; }   // sin ranuras libres (más de 63 olivos en banda): entero
      p.ranura = ranuraDe[i];
    });
  }
  // durante un fundido, el dibujo de siempre de lo que entra sigue dibujándose (y el de lo que sale ya vuelve): tiene() solo si ya estaba antes
  function tiene(i: A) { return !!listos[i] && (!fundido || !!fundido.viejos[i]); }
  /** escalera: cómo está el olivo i en el lote, para el tramado complementario de los lejanos (07ac): 0 no está en 3D, 1 está (y no entra), 2 entra
   *  con fundido o está en la banda E2|lejano (el lejano sale con el tramado complementario), 3 sale con fundido (el lejano entra) */
  function fase(i: A) {
    if (lejRanura[i]) return 2;
    var en: A = !!listos[i]; if (!fundido) return en ? 1 : 0;
    var v: A = !!fundido.viejos[i]; return en ? (v ? 1 : 2) : v && saliendo[i] ? 3 : 0;
  }
  function ranuraLej(i: A) { return lejRanura[i] || 0; }
  var saliendo: A = {};
  // lo que va en el lote nuevo y su código (rol + 3 · ranura): en banda, el suyo; entero, 0 si ya estaba (entero o en banda) y 1 si entra con el
  // fundido por tiempo; y, al final, lo entero del lote anterior que se va (2). Lo que estaba en banda y se va, se va sin fundido: al salir de la
  // banda su peso ya es 0
  function elementos(fija: A) {
    var antes: A = {}, ahora: A = {}, out: A = [];
    selLote.forEach(function (p: A) { (antes[p.c.i] = antes[p.c.i] || {})[p.clave] = true; });
    fija.forEach(function (p: A) {
      (ahora[p.c.i] = ahora[p.c.i] || {})[p.clave] = true;
      out.push({ p: p, cod: p.rol > 0 ? p.rol + 3 * p.ranura : FUNDIDO > 0 && !(antes[p.c.i] && antes[p.c.i][p.clave]) ? 1 : 0 });
    });
    if (FUNDIDO > 0) selLote.forEach(function (p: A) { if (!(p.rol > 0) && !(ahora[p.c.i] && ahora[p.c.i][p.clave]) && recetas[p.clave]) out.push({ p: p, cod: 2 }); });
    return out;
  }
  // la cola propia (generados-cola.ts): como la del motor (menor prio = antes; cada next() es una rebanada), pero solo con lo de los generados y con su propio tope de ms
  var cola: A = creaColaPropia(reloj), encola: A = cola.encola, hay: A = cola.hay;
  // lo que falta para que el lote sea el del plan: trabajos de la cola propia, recetas en el trabajador, árboles del plan sin receta o fuera del lote y
  // el fundido en curso (lo esperan las pruebas: __g.pendientes() de 27_debug)
  function pendientes() {
    if (estado !== "activo") return 0;
    var n: A = cola.cuantos() + nPidiendo + (fundido ? 1 : 0);
    plan.forEach(function (p: A) { if (!recetas[p.clave] || !enLote[p.c.i] || !enLote[p.c.i][p.clave]) n++; });
    return n;
  }
  // AG-1.5: el lote acabado se compila antes de entrar en la escena (compiladoG, en generados-cola.ts), con el renderer, la cámara y la escena del legado
  function* compiladoG(gen: A) { return yield* compiladoCon(gen, function () { return { renderer: rend(), camara: camera, escena: d.scene ? d.scene() : null }; }); }
  // cada fotograma (lo llama 07b_arboles.actualiza con su parte de ms): avanza la cola propia y el fundido; true cuando el reparto de niveles debe
  // rehacerse (lote nuevo o fin del fundido)
  function paso(dt: A, ms: A) {
    cola.ponCero(); if (cola.cuantos()) cola.corre(Math.max(0.5, ms || 0));
    if (fundido) {
      fundido.t += Math.min(dt, 0.1); uFun.value = Math.min(1, fundido.t / FUNDIDO);
      if (fundido.t >= FUNDIDO) { terminaFundido(); avisa = true; }
    }
    pesaBandas();
    var a: A = avisa; avisa = false; return a;
  }
  // O9c: el peso de cada olivo en banda (el de su escalón más fino), con la distancia de ESTE fotograma a la frontera que tenía al montar el lote
  function pesaBandas() {
    var ks: A = Object.keys(bandas); if (!ks.length) return;
    var o: A = ojoAhora();
    ks.forEach(function (s: A) {
      var B: A = bandas[s], d: A = distOjo(B.c, o), f: A = B.b > 0 ? Math.min(1, Math.max(0, (B.D + B.b - d) / (2 * B.b))) : d <= B.D ? 1 : 0;
      uBanda.value[s >> 2].setComponent(s & 3, f);
    });
  }
  function terminaFundido() {   // lo que salía se oculta de verdad (deja de costar) y el lote queda quieto
    fundido = null; uFun.value = 1;
    var S: A = lote && lote.userData.salen; if (!S) return;
    Object.keys(S.B).forEach(function (b: A) { S.B[b].ids.forEach(function (id: A) { S.B[b].m.setVisibleAt(id, false); }); });
    Object.keys(S.I).forEach(function (k: A) { S.I[k].m.count = S.I[k].n; });
    if (S.P) S.P.m.geometry.setDrawRange(0, S.P.n);
    lote.userData.salen = null; info.saliendo = 0; info.triSaliendo = 0; saliendo = {};
  }
  function* seguro(gen: A) {   // si algo falla al montar el lote, Generados se apaga (y lo dice) sin parar el fotograma del motor
    try { return yield* gen; } catch (e: A) { estado = "sin"; motivo = String(e && e.message || e); if (!POR_DEFECTO && consola) consola.warn("olivos generados: " + motivo); return null; }
  }
  function colocaLote(g: A, sel: A, items: A, cl: A) {
    nLotes++;   // lotes montados desde el arranque: el medidor de fotogramas (30_mide, Q0g) mira si cambió en un fotograma lento
    if (lote) { grupo.remove(lote); LT.libera(lote); }   // lo que sale del lote anterior ya va dentro del nuevo
    var viejos: A = {}, Rviejo: A = R, entran: A = 0, salen: A = 0, triSalen: A = 0;
    selLote.forEach(function (p: A) { viejos[p.c.i] = true; });
    lote = g; grupo.add(g); claveLote = cl; listos = {}; enLote = {}; R = 0; triGen = 0; costoGen = 0;
    var nArb: A = 0, conRanura: A = {}; bandas = {}; lejRanura = {};
    sel.forEach(function (p: A) {
      if (!listos[p.c.i]) { listos[p.c.i] = p; nArb++; }   // el primero de cada olivo: el más fino (lo que dice el rótulo)
      (enLote[p.c.i] = enLote[p.c.i] || {})[p.clave] = true;
      if (p.rol > 0 && p.ranura) { conRanura[p.c.i] = true; bandas[p.ranura] = { c: p.c, D: p.banda.D, b: p.banda.b }; if (p.lej) lejRanura[p.c.i] = p.ranura; }
      R = Math.max(R, p.d + 8); triGen += tri(recetas[p.clave]); costoGen += costo(recetas[p.clave]);
    });
    Object.keys(ranuraDe).forEach(function (i: A) { if (!conRanura[i]) delete ranuraDe[i]; });   // las ranuras que este lote ya no usa quedan libres
    pesaBandas();
    saliendo = {};
    items.forEach(function (x: A) { if (x.cod === 1) entran++; else if (x.cod === 2) { salen++; triSalen += tri(recetas[x.p.clave]); saliendo[x.p.c.i] = true; } });
    info = { llamadas: g.children.length, triangulos: triGen, costo: costoGen, arboles: nArb, enBanda: Object.keys(conRanura).length, propios: sel.filter(function (p: A) { return p.propio; }).length, entran: entran, saliendo: salen, triSaliendo: triSalen };
    if (ESCALERA) { info.niveles = { E0: 0, E1: 0, E2: 0, E2VR: 0 }; sel.forEach(function (p: A) { info.niveles[p.niv]++; }); }
    selLote = sel; avisa = true;
    if (entran + salen > 0) { fundido = { t: 0, viejos: viejos, Rviejo: Rviejo }; uFun.value = 0; } else { fundido = null; uFun.value = 1; }
    // las recetas que ya no se usan se sueltan (las variantes se quedan; las del lote colocado, hasta el siguiente: son lo que saldrá con fundido)
    var usadas: A = Object.assign({}, prePide); plan.forEach(function (p: A) { usadas[p.clave] = true; if (p.propio) { usadas["p" + p.c.i + ":E0"] = true; usadas["p" + p.c.i + ":E1"] = true; } }); sel.forEach(function (p: A) { usadas[p.clave] = true; });
    Object.keys(recetas).forEach(function (k: A) { if (k.charAt(0) === "p" && !usadas[k]) delete recetas[k]; });
  }
  /** El rótulo de un olivo (decisión 34) si se dibuja generado: «forma ilustrativa con medidas del LiDAR» y, si su id no es del censo, «id provisional» */
  function rotulo(i: A) {
    var p: A = listos[i]; if (!p && !(ESCALERA && estado === "activo")) return null;   // con la escalera, todo olivo es del constructor: el que no está en 3D es «lejano»
    var id: A = D.copas_id ? D.copas_id[i] : -1, prov: A = !(id >= 0 && id < 2147483648);
    return p ? { forma: "ilustrativa con medidas del LiDAR", provisional: prov, niv: p.niv, variante: !p.propio } : { forma: "ilustrativa con medidas del LiDAR", provisional: prov, niv: "lejano", variante: true, lejano: true };
  }
  /** O2 (medida, no dibuja; sin índice, indexCount es -1 y se cuentan los vértices): qué cuesta cada pieza del lote que se está dibujando. Por malla fundida (gen-corteza, gen-olivas, gen-tarjeta…): tipo, instancias visibles,
   *  triángulos de UNA pasada (los de la pasada de sombras se suman aparte si la malla proyecta: sombra) y llamadas (1, más 1 si proyecta sombra); y por escalón
   *  (E0/E1/E2/E2VR) cuántos olivos y los triángulos de sus recetas. Lo pide pruebas/guardianes/_navegador.js con el desglose; sin lote, null. */
  function piezas() {
    if (!lote) return null;
    var out: A = [], tipoDe: A = function (o: A) { return o.isBatchedMesh ? "BatchedMesh" : o.isInstancedMesh ? "InstancedMesh" : o.isPoints ? "Points" : o.type; };
    lote.children.forEach(function (o: A) {
      var inst: A = 0, tri: A = 0, pts: A = 0;
      if (o.isBatchedMesh) {
        var r: A = {};
        for (var id: A = 0; id < o.maxInstanceCount; id++) {
          try { if (!o.getVisibleAt(id)) continue; inst++; o.getGeometryRangeAt(o.getGeometryIdAt(id), r); tri += (r.indexCount >= 0 ? r.indexCount : r.vertexCount) / 3; } catch (e) { /* instancia sin usar */ }
        }
      } else if (o.isInstancedMesh) { inst = o.count; var g: A = o.geometry; tri = o.count * (g.index ? g.index.count : g.attributes.position.count) / 3; }
      else if (o.isPoints) { var dr: A = o.geometry.drawRange, tot: A = o.geometry.attributes.position.count; pts = Math.min(tot, isFinite(dr.count) ? dr.count : tot); inst = pts; }
      out.push({ pieza: o.name, tipo: tipoDe(o), instancias: inst, triangulos: Math.round(tri), puntos: pts, llamadas: 1 + (o.castShadow ? 1 : 0), sombra: !!o.castShadow });
    });
    var niveles: A = {};
    selLote.forEach(function (p: A) { var n: A = niveles[p.niv] = niveles[p.niv] || { olivos: 0, triangulos: 0 }; n.olivos++; n.triangulos += tri(recetas[p.clave]) || 0; });
    return { piezas: out, niveles: niveles, info: info };
  }
  if (d.ventana) d.ventana.__olivosGen = function () {
    var k0: A = Object.keys(listos)[0], p0: A = k0 !== undefined ? listos[k0].c : null;   // un olivo generado ya dibujado
    return { defecto: POR_DEFECTO, apagadoPor: DECISION.motivo, primero: p0 ? { x: p0.x, y: p0.y, h: p0.h } : null, estado: estado, motivo: motivo, via: fabrica ? "trabajador" : "rebanadas", plan: plan.length, recetas: Object.keys(recetas).length, pidiendo: nPidiendo, trabajos: cola.cuantos(), radio: R, info: info,
      cache: cache ? cache.estado() : null,
      modoGen: MODO, escalera: ESCALERA ? { reparto: reparto, sombras: sombras(), variantes: nVar() } : undefined,
      horneado: { estado: horn.estado, motivo: horn.motivo, epoca: M && mats ? epoca() : null, variantes: (varSem || SEM_VAR).length, horneadas: horn.horneadas, calculadas: horn.calculadas,
        fallos: horn.fallos, cache: horn.cache, propiosCalculados: horn.propios, ultimoFallo: horn.ultimoFallo }, fundido: { activo: !!fundido, avance: +uFun.value.toFixed(3), duracion: FUNDIDO } };
  };
  // _prueba: para pruebas/olivo/generados_motor.mjs (Node), no para el motor
  // para los lejanos de la escalera (07ac): la variante j en E2 (null si aún no está), su matriz en un olivo (la misma que en 3D), montarla para
  // hornear su silueta, y los parches de luz y de fundido (el mismo uFun: el tramado de los lejanos es el complementario del de los 3D)
  var paraLejanos: A = { uFun: uFun, nVariantes: nVar, variante: function (j: A) { return recetas["v" + j + ":E2"] || null; },
    matriz: function (c: A, r: A) { return matrizDe(c, r, true); }, monta: function (r: A) { return M.montaOlivo(THREE, r, mats); }, libera: function (g: A) { M.liberaOlivo(g); },
    parcheLuz: parcheLuz, parcheFundido: parcheFundido, constructor: function () { return M; }, dir: function () { return DIR; },
    // A4-0: para la TSL de los lejanos (apagada): los MISMOS uniformes del fundido y los nodos del tiempo
    uniformes: UF, tiempoTsl: function () { return d.tiempoTsl ? d.tiempoTsl() : null; },
    impostor: function () { return filaImpostor(manif, varSem, M, epoca()); } };
  // ---- MU5-n (A3-2a): el ciclo de vida. libera() lo suelta TODO de verdad y deja el módulo apagado: el lote (sus geometrías y sus mallas por lotes e
  // instanciadas), el grupo de la escena, los materiales del constructor con sus texturas (mats.libera de la biblioteca), los dos de profundidad, el trabajador,
  // los trabajos de la cola propia (sin acabarlos) y la caché de recetas (las recetas en uso, vaciadas; la caché en memoria de la biblioteca, soltada; la de
  // IndexedDB NO: es persistente a propósito, O5, y la próxima visita la aprovecha). Lo que llegue tarde (el constructor, el manifiesto, una receta del trabajador,
  // una descarga) se tira. Dos veces no libera dos veces.
  var liberado: A = false;
  function suelta(): void {
    if (fabrica) { fabrica.cierra(); fabrica = null; }
    if (mats && typeof mats.libera === "function") mats.libera();
    mats = null;
    prof = null;
    propios.libera();   // los de la fábrica con dueño «olivos-generados»: los del constructor (ya soltados con sus texturas: no se sueltan dos veces) y los dos de profundidad
  }
  function libera(): boolean {
    if (liberado) return false;
    liberado = true; estado = "apagado"; motivo = "liberado";
    cola.vacia();
    if (fundido) terminaFundido();
    if (lote) { grupo.remove(lote); LT.libera(lote); lote = null; }
    if (grupo.parent) grupo.parent.remove(grupo);
    suelta();
    Object.keys(recetas).forEach(function (k) { delete recetas[k]; });   // el MISMO objeto (las pruebas lo leen por _prueba.recetas)
    pidiendo = {}; nPidiendo = 0; plan = []; listos = {}; enLote = {}; selLote = []; claveLote = ""; R = 0; triGen = 0; costoGen = 0; info = { llamadas: 0, triangulos: 0 };
    bandas = {}; ranuraDe = {}; lejRanura = {}; saliendo = {}; prePide = {}; Object.keys(estEsc).forEach(function (k) { delete estEsc[k]; });
    cache = null; SIL = null; silPend = false;
    return true;
  }
  if (pedido) { gArboles.add(grupo); arrancaGen(); }
  return { libera: libera, liberado: function () { return liberado; }, lotes: function () { return nLotes; }, escalera: function () { return ESCALERA; }, modoGen: function () { return MODO; }, lejanos: paraLejanos, activo: function () { return estado === "activo"; }, actualiza: actualiza, paso: paso, gastado: function () { return cola.gastado(); }, pendientes: pendientes, rotulo: rotulo, piezas: piezas, estado: function () { return estado; },
    _prueba: { fecha: function (f: A) { fechaPrueba = f; }, mats: function () { return mats; }, siluetas: function () { return SIL; }, silPend: function () { return silPend; }, prof: function () { return prof; }, uFun: uFun, lote: function () { return lote; }, tiene: tiene, fase: fase, listos: function () { return listos; }, saliendo: function () { return saliendo; }, recetas: function () { return recetas; },
      uBanda: uBanda, bandas: function () { return bandas; }, lejRanura: function () { return lejRanura; }, enLote: function () { return enLote; }, selLote: function () { return selLote; },
      construye: function (items: A) { return LT.construyeG(items); }, elementos: function (fija: A) { return elementos(fija); } } };   // AG-1.5a: pruebas/olivo/lote_tramos.mjs mide los tramos entre yield
}
export type Generados = ReturnType<typeof creaGenerados>;

/** El manifiesto del componente «olivos-generados»: el ciclo de vida de los olivos generados. El objeto que el motor usa (Generados) es el mismo que monta (lo crea el
 *  legado al cargarse: 07b, 07ac, 06 y 50 lo usan desde el primer fotograma). Sin fases: lo mueve 07b (actualiza y paso). */
export function manifiestoGenerados(generados: Generados): Manifiesto {
  return {
    id: ID_GENERADOS, version: 1,
    consume: ["D", "VRP", "Aparato", "Config", "Materiales", "gArboles", "camera", "Estado", "suelo"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },   // ?olivos=0 lo apaga, pero esa bandera es suya (GeneradosPuro.activo), no la del componente: sin él, 07b no reparte
    presupuesto: { llamadas: 0, triangulos: 0 },   // lo que dibuja (~6-7 llamadas) va dentro del reparto de 07b: TOPE_TRI × FRACCION, o el de la escalera (Escalera.tope); lo cuenta pruebas/presupuesto.json
    mundos: ["exterior"],
    monta: function () { return generados; },
    libera: function (api) { if (api) (api as Generados).libera(); }
  };
}

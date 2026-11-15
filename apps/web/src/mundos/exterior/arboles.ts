// Los olivos del modo Gemelo con tres niveles de detalle (MU5-n, A3-2b; antes apps/web/motor/07b_arboles.js, que queda como talón): el coste de dibujo no crece con la
// superficie de la finca. Componente «arboles» de los mundos ["exterior"] con un libera() que suelta de verdad: los trabajos de la Cola (celdas «C…»), las celdas de nivel 0
// con sus geometrías y las mallas instanciadas de los niveles 1 y 2 (y las de los tipos del catálogo). Los materiales y las geometrías de L1 y L2 son del catálogo (07a), que
// los libera él; los de las celdas de nivel 0, de 06 (materiales) y de 07 (hojas), y las geometrías de cada celda se sueltan aquí al quitarla.
// L1-04 (auditoría de noviembre de 2026): el nivel 0 se limitaba por número de olivos (tope0), nunca por TOPE_TRI, y con la escala adaptativa alta (esc hasta 2,5) podían salir
// 1.125 olivos de nivel 0 (≈ 0,9 M triángulos) frente a los 550 k de TOPE_TRI; y ajustaEscala solo bajaba esc hasta 1,6. Ahora el nivel 0 cuenta en TOPE_TRI: sus olivos no
// pasan de lo que cabe (TOPE_TRI − generados − tileset) / TRI0 y, mientras se pase del techo de diseño (1,7 M), esc baja hasta 1,0 (no hasta 1,6) y no vuelve a subir.
// El estado del legado que cambia (paseando, kcor, tinte, ndviIdx, objetivo, orb, pp, VRX, Ajustes: otros módulos los reescriben o se cargan después de 07b) se lee de los
// getters de las dependencias al entrar en cada función pública (sync): el cuerpo es el de siempre. Los guardianes que miran su texto lo leen junto al talón (pruebas/guardianes/_fuente.js).
// Medido / deducido / ilustrativo (regla 5): las copas de nivel 0 son medidas; las formas de L1 y L2 son ilustrativas (silueta con los radios medidos).
// Del legado recibe por argumento lo que necesita (THREE, el mundo, la Cola, las piezas de olivos y los getters); no lee globales.
import type { Manifiesto } from "../../nucleo/componentes.ts";

// three no trae tipos en el repo (como en ambiente.ts y presupuesto.ts): de él solo se toca lo mínimo, sin tiparlo; el motor son números, arrays y objetos del legado
/* eslint-disable @typescript-eslint/no-explicit-any */
type T3 = any;

export interface DepsArboles {
  THREE: T3;
  FACTOR_R8: number;
  /** location.search ("" si no hay): ?arbsc= fija la escala de los olivos */
  busqueda: string;
  Aparato: T3; Config: T3; Mundo: T3; Cola: T3; ColaExt: T3; CargaPuro: T3; XrPerillas: T3; VrControlPuro: T3; InfoDibujo: T3; Estaticos: { congela(o: unknown): void };
  TopeTilesPuro: T3; TopeOlivos: T3; OlivosTiles: T3; Catalogo: T3; Escalera: T3; Generados: T3; Lejanos: T3;
  renderer: T3; camera: T3; Estado: T3;
  suelo(x: number, y: number): number; copaAlta(x: number, y: number): number; aviva(c3: number[], x: number, y: number): void; hash(n: number): number;
  copas: T3[]; ALTO_MAX: number;
  /** TinteOrto.desfase (L3-01): el desfase copa-ortofoto de una copa de altura h, que el color de los niveles 1 y 2 aplica como el del nivel 0. Sin él, sin desfase */
  desfase?: (h: number, out: number[]) => void;
  gArboles: T3; arbolesG(arr: T3[]): Generator<unknown, T3[]>; follajeG(arr: T3[], P: T3, grupo: T3): Generator; construyeSombras(): void;
  /** el reloj (performance.now): se recibe para probar con un reloj de mentira */
  ahora(): number;
  /** window (para window.__olivosGen, que pone 07ab) */
  ventana: T3;
  /** los que cambian o se cargan después de 07b: getters (se leen al entrar en cada función pública) */
  readonly paseando: boolean; readonly kcor: number; readonly tinte: boolean; readonly ndviIdx: number;
  readonly objetivo: T3; readonly orb: T3; readonly pp: T3; readonly VRX: T3; readonly Ajustes: T3;
}

export const ID_ARBOLES = "arboles";

export function creaArboles(d: DepsArboles) {
  const THREE = d.THREE, FACTOR_R8 = d.FACTOR_R8, Aparato = d.Aparato, Config = d.Config, Mundo = d.Mundo, Cola = d.Cola, ColaExt = d.ColaExt, CargaPuro = d.CargaPuro, XrPerillas = d.XrPerillas;
  const VrControlPuro = d.VrControlPuro, InfoDibujo = d.InfoDibujo, Estaticos = d.Estaticos, TopeTilesPuro = d.TopeTilesPuro, TopeOlivos = d.TopeOlivos, OlivosTiles = d.OlivosTiles;
  const Catalogo = d.Catalogo, Escalera = d.Escalera, Generados = d.Generados, Lejanos = d.Lejanos, renderer = d.renderer, camera = d.camera, Estado = d.Estado;
  const suelo = d.suelo, copaAlta = d.copaAlta, aviva = d.aviva, hash = d.hash, copas = d.copas, ALTO_MAX = d.ALTO_MAX, gArboles = d.gArboles, arbolesG = d.arbolesG, follajeG = d.follajeG;
  const construyeSombras = d.construyeSombras, location = { search: d.busqueda }, window = d.ventana;
  // lo que cambia fuera de este módulo: se copia de las dependencias al entrar en cada función pública (sync), y el cuerpo lo lee como siempre
  let paseando: boolean = false, kcor: number = 1, tinte: boolean = false, ndviIdx: number = 0, objetivo: T3 = null, orb: T3 = null, pp: T3 = null, VRX: T3 = null, Ajustes: T3 = undefined;
  function sync(): void { paseando = d.paseando; kcor = d.kcor; tinte = d.tinte; ndviIdx = d.ndviIdx; objetivo = d.objetivo; orb = d.orb; pp = d.pp; VRX = d.VRX; Ajustes = d.Ajustes; }
  sync();
  let suelto = false;
// ---------- los olivos del modo Gemelo con tres niveles de detalle: el coste de dibujo no crece con la superficie de la finca
// Nivel 0: celdas de 64 m con el modelo completo (copa medida, troncos, hojas, flores y aceitunas) alrededor de lo que se mira (o de quien pasea), hasta MAX0 olivos.
// Nivel 1: olivos instanciados de ~170 triángulos con silueta de olivo: copa en vaso, lobulada y más ancha que alta (radios medidos, orientada según su eje largo), abierta por debajo, y tronco de 2 o 3 pies.
// Nivel 2: una masa de ~35 triángulos por olivo, con la misma silueta rota por el sombreador. Más lejos no se dibuja el árbol: ya está en la ortofoto del suelo.
// Las celdas siguen la cuadrícula UTM de las teselas (4 × 4 celdas por tesela), así que los puntos LiDAR de una celda están todos en una sola tesela.
// Para que los árboles buenos aparezcan pronto: se mide el tiempo por fotograma (el tope de olivos y el radio de nivel 0 crecen si el aparato va sobrado y bajan si va justo),
// las celdas se construyen por delante de quien se mueve y, en modo Nube, se «precargan» las de alrededor para que pulsar «Gemelo» no espere.
  var version = 0, CEL = 64, MAX0 = 450, MAX1 = 3000, MAX2 = 16000, U1 = 460, U2 = 1600, TOPE_TRI = 550000, TRI0 = 800, NP1 = Catalogo.variantes(Catalogo.SIN, 1), NP2 = Catalogo.variantes(Catalogo.SIN, 2);
  // L5-08: los triángulos por olivo de los niveles 1 y 2 son una cota: nunca por debajo de lo que dibuja la forma del catálogo (L2: 35, con los 7 degenerados del vértice de arriba; antes se contaban 30)
  function cotaNivel(n: number, def: number): number { var t = def; if (Catalogo.triangulos) for (var v = 0; v < Catalogo.variantes(Catalogo.SIN, n); v++) t = Math.max(t, Catalogo.triangulos(Catalogo.SIN, n, v)); return t; }
  var TRI1 = cotaNivel(1, 170), TRI2 = cotaNivel(2, 30);
  // L5-08: la mancha de sombra bajo cada olivo (follaje.ts: geoSombra, un plano de 2 triángulos, todos los olivos a cualquier distancia, en modo Gemelo) también cuenta en triEst
  var TRI_SOMBRA = 2;
  // L5-07: histéresis en los cambios de nivel 1 ↔ 2 (U1) y 2 ↔ nada (U2), como el nivel 0 (R0 · 1,15): un olivo que ya estaba en el nivel más fino sigue en él hasta U · HIST_NIVEL
  var HIST_NIVEL = 1.08;
  // L1-11: la firma del último reparto de los niveles 1 y 2 (qué olivo en qué nivel, en orden): si una repetición por tiempo (cámara quieta, nada cambiado) da la misma, no se vuelven a subir los búferes
  var firmaNiv = 0, nSubidas = 0;
  var olivos = copas.filter(function (c: any) { return c.oliv; }), celdas: any = {}, ultima = { x: 1e9, y: 1e9, z: 1e9, fx: 0, fz: 0, tms: 0, exag: -1, k: "" }, t = 0, sucio = true, nL0 = 0, n1 = 0, n2 = 0, faltan = 0, nPre = 0, triEst = 0;
  var cx = Mundo.cx, cy = Mundo.cy, m4 = new THREE.Matrix4(), c3: any = [0, 0, 0], vel = { x: 0, z: 0 };
  var vrP: any = null, TOPE_TRI0 = TOPE_TRI, TRI_MOVIL_CFG = 0;   // perfil de las gafas VR (29_vr.js): menos olivos de nivel 0, radio más corto y menos triángulos
  // Q0n (02m_tope_olivos.js): en VR, los triángulos de los olivos que dibuja el motor (triMotor, contados en cada reparto) y el reloj de su muestra
  var triMotor = 0, tMuestraO = 0;
  // el presupuesto de escritorio y el de móvil de la configuración del servidor (escalera.triangulos, contratos/config.schema.json; recortados por
  // Config, 02c), al llegar en el arranque; sin ella, los de siempre. Los de gafas van en VR_PERFILES (29_vr.js).
  Config.al(function () {
    TOPE_TRI0 = Config.param("escalera.triangulos.escritorio", TOPE_TRI0); if (!vrP) TOPE_TRI = TOPE_TRI0;
    TRI_MOVIL_CFG = Config.param("escalera.triangulos.movil", Escalera.TRI_MOVIL); sucio = true;
  });
  // el aparato: escala (0,7–2,5) de cuántos olivos de nivel 0 se pagan; sube si los fotogramas van holgados y baja si van justos (?arbsc=1 la fija).
  // Por encima de 1,6 solo con fotogramas muy holgados (< 16 ms): un aparato sobrado ve olivos detallados más lejos (radio hasta ~330 m en órbita).
  var fijaSc = /[?&]arbsc=([0-9.]+)/.exec(location.search), esc = fijaSc ? Number(fijaSc[1]) : 1, emaDt = 0.017, claveDib = "";
  function claveActual() { return Estado.exag + "|" + Estado.calidad + "|" + kcor + "|" + tinte + "|" + ndviIdx; }   // lo que está pegado a la geometría de una celda de nivel 0: si cambia, la celda se rehace

  // ----- las formas de los niveles 1 y 2 las da el catálogo (07a_catalogo.js): el tipo −1 son las de siempre, 4 variantes en L1 (copa + tronco) y 2 en L2
  function instancias(geo: any, mat: any, cap: any, color: any) { var m = new THREE.InstancedMesh(geo, mat, cap); if (color) m.setColorAt(0, new THREE.Color(1, 1, 1)); m.frustumCulled = false; cuenta(m, 0); Estaticos.congela(m); gArboles.add(m); return m; }
  // vacía no se dibuja: con count 0 three paga igual la pasada (programa, uniformes y VAO) sin dibujar nada; con el tileset de olivos, L1 y L2 van vacías siempre
  function cuenta(m: any, n: any) { m.count = n; m.visible = n > 0; }
  var iCopa1: any[] = [], iTron1: any[] = [], iCopa2: any[] = [], p: any, pz: any;
  for (p = 0; p < NP1; p++) { pz = Catalogo.geometria(Catalogo.SIN, 1, p); iCopa1.push(instancias(pz[0].geo, pz[0].mat, MAX1, true)); iTron1.push(instancias(pz[1].geo, pz[1].mat, MAX1, false)); }
  for (p = 0; p < NP2; p++) { pz = Catalogo.geometria(Catalogo.SIN, 2, p); iCopa2.push(instancias(pz[0].geo, pz[0].mat, MAX2, true)); }
  // los olivos-tipo de un catálogo cargado (ADR-0012): un juego de mallas instanciadas por tipo (una por pieza y nivel); vacío mientras no haya catálogo,
  // y entonces cada olivo, con o sin tipo en el registro, se dibuja como el tipo −1 (lo de siempre). El nivel 0 sigue siendo la copa medida de cada árbol.
  var extra: any = {};
  function montaTipos() {
    Object.keys(extra).forEach(function (t: any) { extra[t].m1.concat(extra[t].m2).forEach(function (m: any) { gArboles.remove(m); if (m.dispose) m.dispose(); }); });
    extra = {};
    Catalogo.tipos().forEach(function (t: any) {
      if (t === Catalogo.SIN) return;
      var mk = function (nivel: any, cap: any) { return Catalogo.geometria(t, nivel, 0).map(function (q: any) { return instancias(q.geo, q.mat, cap, q.pieza === "copa"); }); };
      extra[t] = { m1: mk(1, MAX1), m2: mk(2, MAX2), caja: Catalogo.info(t).caja, n1: 0, n2: 0 };
    });
    sucio = true;
  }
  Catalogo.alCambiar(montaTipos);
  function colocaModelo(X: any, c: any, l1: any, gz: any, tc: any) {   // un modelo del catálogo: pivote en la base del tronco y en metros; se estira a la altura y a los ejes de la copa medida
    var B = X.caja, sx = c.rx / B.rx, sz = c.rz / B.rz, sy = Math.max(c.h, 1) / B.alto * Estado.exag, cs = Math.cos(c.ang), sn = Math.sin(c.ang), e = m4.elements;
    e[0] = cs * sx; e[1] = 0; e[2] = -sn * sx; e[3] = 0; e[4] = 0; e[5] = sy; e[6] = 0; e[7] = 0; e[8] = sn * sz; e[9] = 0; e[10] = cs * sz; e[11] = 0; e[12] = c.x; e[13] = gz; e[14] = -c.y; e[15] = 1;
    var ms = l1 ? X.m1 : X.m2, n = l1 ? X.n1++ : X.n2++;
    ms.forEach(function (m: any) { m.setMatrixAt(n, m4); if (m.instanceColor) m.setColorAt(n, tc); });
  }

  // registro: celda, altura del suelo, forma y color de cada olivo (del mosaico: sirve de lejos)
  function clave(i: any, j: any) { return i * 100000 + j; }
  var listo0 = false;
  // L3-01: el color de los niveles 1 y 2 sale del mosaico de 1 m DESPLAZADO como el de la copa de nivel 0 (colorEn): copa y color casan. Se rehace si cambia kcor
  var kcorColor: any = null, dz: number[] = [0, 0];
  function recolorea() {
    kcorColor = kcor;
    olivos.forEach(function (c: any) { dz[0] = 0; dz[1] = 0; if (d.desfase) d.desfase(c.h, dz); Mundo.ortoGrueso(c.x + dz[0], c.y + dz[1], c3); c.cr = c3[0]; c.cg = c3[1]; c.cb = c3[2]; });
  }
  function inicia() { sync();
    listo0 = true;
    olivos.forEach(function (c: any) {
      c.gz = suelo(c.x, c.y); c.rm = c.perfil.reduce(function (a: any, b: any) { return a + b; }, 0) / 8; var ci = Math.floor((c.x + cx) / CEL), cj = Math.floor((c.y + cy) / CEL), k = clave(ci, cj);
      c.cel = celdas[k] || (celdas[k] = { k: k, i: ci, j: cj, x0: ci * CEL - cx, y0: cj * CEL - cy, arr: [], g: null, sucia: true, visto: 0, en: false, pre: false, enAntes: false, prio: 0, ts: Mundo.tesela(ci * CEL - cx + CEL / 2, cj * CEL - cy + CEL / 2) });
      c.cel.arr.push(c);
      // la silueta: el eje largo de la copa medida (pares de radios opuestos) y su perpendicular; semiejes = r8 × FACTOR_R8 (01_datos.js; hoy 0,5)
      var P = c.perfil, L: any = [0, 1, 2, 3].map(function (q: any) { return (P[q] + P[q + 4]) / 2; }), im = 0; for (var q2 = 1; q2 < 4; q2++) if (L[q2] > L[im]) im = q2;
      c.ang = im * Math.PI / 4; c.rx = Math.max(0.6, L[im] * FACTOR_R8); c.rz = Math.max(0.6, L[(im + 2) % 4] * FACTOR_R8); c.pr = Math.min(NP1 - 1, Math.floor(hash(c.i * 7.7 + 1) * NP1)); c.vf = 0.88 + 0.26 * hash(c.i * 3.7);
    });
    recolorea();
    Lejanos.inicia(olivos);   // ?olivos=escalera (07ac); sin la bandera no hace nada
  }
  function libera(g: any) { g.traverse(function (o: any) { if (o.geometry) o.geometry.dispose(); }); }
  // los puntos LiDAR de una celda: se reparten una vez por tesela en un mapa de celda → índices (a rebanadas)
  function* binsG(ts: any) {
    if (ts.bins) return; var A = ts.pts, b: any = {};
    for (var q = 0; q < A.length; q += 3) { var k = clave(Math.floor((ts.ox + A[q] / 100 + cx) / CEL), Math.floor((ts.oy + A[q + 1] / 100 + cy) / CEL)); (b[k] || (b[k] = [])).push(q); if (q % 60000 === 59997) yield; }
    ts.bins = b;
  }
  function* puntosCeldaG(cel: any) {
    var ts = cel.ts, P: any = { x: [], y: [], z: [], h: [], b: [], n: 0 }; if (!ts || !ts.pts) return P;
    while (!ts.bins) { if (!ColaExt.hay("B" + ts.key)) ColaExt.pon("B" + ts.key, cel.prio - 1, binsG(ts)); yield; }
    var L = ts.bins[cel.k] || [], A2 = ts.pts;
    for (var i = 0; i < L.length; i++) {
      var q2 = L[i], px = ts.ox + A2[q2] / 100, py = ts.oy + A2[q2 + 1] / 100, pz = A2[q2 + 2] / 100, h = pz - suelo(px, py);
      if (i % 4000 === 3999) yield;
      if (h > ALTO_MAX) continue;
      P.x.push(px); P.y.push(py); P.z.push(pz); P.h.push(h); P.b.push(h < 2.0 && copaAlta(px, py) > 2.6 ? 1 : 0); P.n++;
    }
    return P;
  }
  function* celdaG(cel: any) {   // el nivel 0 de una celda: puntos, copas y troncos, hojas y frutos
    if (cel.ts) yield* Mundo.aseguraOrto(cel.ts);
    var P = yield* puntosCeldaG(cel), ms = yield* arbolesG(cel.arr), g = new THREE.Group();
    ms.forEach(function (m: any) { g.add(m); });
    yield* follajeG(cel.arr, P, g);
    return g;
  }
  function encolaCelda(cel: any) {
    var kd = claveActual();
    ColaExt.pon("C" + cel.k, cel.prio, celdaG(cel), function (g: any) {
      if (cel.g) { gArboles.remove(cel.g); libera(cel.g); }
      Estaticos.congela(g);   // AG-1.15: la celda no se mueve (todo en sus vértices e instancias)
      cel.g = g; cel.tri = null; g.visible = false; gArboles.add(g); cel.kd = kd; cel.sucia = kd !== claveActual(); sucio = true;
    });
  }
  function quitaCelda(cel: any) { ColaExt.cancela("C" + cel.k); if (cel.g) { gArboles.remove(cel.g); libera(cel.g); cel.g = null; } cel.sucia = true; }
  // distancia horizontal del foco (el punto que se mira, o quien pasea) al borde de la celda, con un adelanto hacia donde se va
  function distFoco(cel: any, fx: any, fz: any) {
    var mx = cel.x0 + CEL / 2, mz = -(cel.y0 + CEL / 2), dx = Math.max(0, Math.abs(fx - mx) - CEL / 2), dz = Math.max(0, Math.abs(fz - mz) - CEL / 2), d = Math.sqrt(dx * dx + dz * dz), sp = Math.hypot(vel.x, vel.z);
    if (sp > 0.8) { var ux = (mx - fx), uz = (mz - fz), l = Math.hypot(ux, uz) || 1, ahead = (ux * vel.x + uz * vel.z) / (l * sp); d -= 42 * ahead * Math.min(1, sp / 4); }
    return Math.max(0, d);
  }
  function radioNivel0() { var r = paseando ? 112 * Math.sqrt(esc) * (vrP ? vrP.r : 1) : orb.dist < 520 ? Math.min(210, 40 + orb.dist * 0.5) * Math.sqrt(esc) : 0; return vrP && TopeOlivos.activo() ? r * Math.sqrt(TopeOlivos.factor()) : r; }   // Q0n: en VR, × √f (el área, × f)
  // Q0n: los triángulos de verdad de una celda de nivel 0 (sus mallas, por sus instancias), contados una vez al pedirlos; solo en VR
  function triCelda(cel: any) {
    if (cel.tri == null && cel.g) { var t = 0; cel.g.traverse(function (o: any) { if (!o.isMesh || !o.geometry) return; var g = o.geometry, n = g.index ? g.index.count / 3 : g.attributes.position ? g.attributes.position.count / 3 : 0; t += n * (o.isInstancedMesh ? o.count : 1); }); cel.tri = t; }
    return cel.tri || 0;
  }
  function triNivel0() { var t = 0; for (var k in celdas) { var c = celdas[k]; if (c.g && c.g.visible) t += triCelda(c); } return t; }
  function radioPre() { return paseando ? 175 : orb.dist < 1100 ? 190 : 0; }

  function reclasifica(soloTiempo?: boolean) {
    if (escalera()) return reclasificaEscalera();
    var cam = camera.position, vis = gArboles.visible, ahora = d.ahora(), R0 = vis ? radioNivel0() : 0, RP = radioPre(), todas = Object.keys(celdas).map(function (k: any) { return celdas[k]; });
    var fx = paseando ? cam.x : objetivo.x, fz = paseando ? cam.z : objetivo.z, dts = (ahora - ultima.tms) / 1000;
    if (ultima.tms && dts > 0.05 && dts < 3) { vel.x = 0.55 * vel.x + 0.45 * (fx - ultima.fx) / dts; vel.z = 0.55 * vel.z + 0.45 * (fz - ultima.fz) / dts; } else if (!ultima.tms || dts >= 3) { vel.x = vel.z = 0; }
    ultima.fx = fx; ultima.fz = fz; ultima.tms = ahora;
    // con la escena 3D Tiles (04c_olivos_tiles.js): los olivos de media y larga distancia los dibuja el tileset y sus triángulos cuentan en el tope
    var TIL = OlivosTiles.dibuja(), triTil = TIL ? OlivosTiles.triangulos() : 0;
    // Q0n: en VR con el tope de los olivos del motor (02m), su presupuesto BO (reserva × f) recorta el de los generados y el de los niveles 1 y 2,
    // y f el número de olivos de nivel 0; fuera de VR, BO = Infinity y f = 1: el reparto de siempre
    var QO = !!vrP && TopeOlivos.activo(), BO = QO ? TopeOlivos.presupuesto() : Infinity, fO = QO ? TopeOlivos.factor() : 1;
    // el foco de los generados, paseando, es quien pasea (pp), no la cámara: la cámara va detrás y, al girar en el sitio, describe un círculo
    // que cambiaba el plan y rehacía el lote (Antonio, en el móvil: «si giras sin moverte llega a desaparecer»)
    // con la escalera horneada esperando a sus lejanos (Escalera.dibuja), lo generado ya va por la escalera pero con la parte de ?olivos=gen
    var GEN = Generados.actualiza(paseando ? pp.x : fx, paseando ? -pp.y : fz, Math.min(BO, Math.max(0, TOPE_TRI - triTil)) * (Generados.escalera() ? Escalera.FR_ESPERA : 1), olivos, esc);   // ?olivos=gen (07ab): dentro de su radio, el nivel 0 de siempre se apaga; sin la bandera, radio 0
    ajustaEscala();
    var tope0 = MAX0 * esc * (vrP ? vrP.n : 1) * fO;
    // L1-04: el nivel 0 también cuenta en el tope de triángulos (antes solo lo limitaba el número de olivos): no más olivos de nivel 0 de los que caben en lo que queda del tope tras los generados y el tileset
    var topeL0 = Math.max(0, Math.floor((Math.min(TOPE_TRI, BO) - GEN.tri - triTil) / TRI0)); if (tope0 > topeL0) tope0 = topeL0;
    // 1) celdas de nivel 0 (las que se ven) y de precarga (las de alrededor y las de delante, que se construyen sin enseñarse)
    var bajo = !paseando && cam.y - suelo(cam.x, -cam.z) * Estado.exag < 45, RC = 95 * Math.sqrt(esc);   // con la cámara a ras de suelo se ve hasta lejos: también cuentan las celdas de su alrededor
    todas.forEach(function (c: any) { c.d = distFoco(c, fx, fz); if (bajo && R0 > 0) c.d = Math.min(c.d, distFoco(c, cam.x, cam.z) * R0 / RC); c.enAntes = c.en; c.en = false; c.pre = false; });
    var ok = todas.filter(function (c: any) { return c.ts && c.ts.estado === 2; }).sort(function (a: any, b: any) { return a.d - b.d; }), tot = 0, totP = 0;
    ok.forEach(function (c: any) {
      var lim = c.enAntes ? R0 * 1.15 : R0;
      if (vis && c.d < lim && !(c.d < GEN.radio) && (tot + c.arr.length <= tope0 || tot === 0)) { c.en = true; tot += c.arr.length; }
      else if (c.d < RP && totP + tot + c.arr.length <= tope0 * 1.6) { c.pre = true; totP += c.arr.length; }
    });
    faltan = 0; nPre = 0;
    todas.forEach(function (c: any) {
      if (c.en || c.pre) {
        c.visto = ahora; if (c.pre) nPre++;
        c.prio = c.en ? c.d : c.d + 300;
        if (!c.g || c.sucia) { if (c.en) faltan++; encolaCelda(c); }
      } else { if (ColaExt.hay("C" + c.k)) ColaExt.cancela("C" + c.k); if (c.g && ahora - c.visto > 8000) quitaCelda(c); }
      if (c.g) c.g.visible = c.en && !c.sucia;   // mientras se rehace, los olivos de esa celda se ven en los niveles 1 y 2
    });
    // 2) el resto, por distancia: nivel 1 (los más cercanos) y nivel 2; los de una celda de nivel 0 ya construida y visible no se repiten
    var rest: any[] = [], tri0 = 0, cerca: any[] = []; nL0 = 0;
    if (vis) olivos.forEach(function (c: any) {
      if (c.cel.en && c.cel.g && c.cel.g.visible) { nL0++; cerca.push(c.i); c.niv = 0; return; }
      if (GEN.tiene(c.i)) { cerca.push(c.i); c.niv = 0; return; }   // lo dibuja Generados
      if (TIL) { c.niv = 0; return; }   // lo dibuja el tileset
      var dx = c.x - cam.x, dz = -c.y - cam.z, dy = Math.max(0, cam.y - c.gz * Estado.exag); c.d = Math.sqrt(dx * dx + dz * dz + dy * dy); if (c.d < (c.niv ? U2 * HIST_NIVEL : U2)) rest.push(c); else c.niv = 0;   // L5-07
    });
    if (TIL) { OlivosTiles.cerca(cerca); triTil = OlivosTiles.triangulos(); }   // la máscara: los de cerca no se dibujan también en el tileset
    tri0 = nL0 * TRI0 + GEN.tri; rest.sort(function (a: any, b: any) { return a.d - b.d; });
    var tope1 = Math.max(QO ? 0 : 500, Math.min(MAX1, Math.floor((Math.min(TOPE_TRI, BO) - tri0 - TRI2 * Math.min(MAX2, rest.length)) / TRI1)));
    var cnt1: any[] = [], cnt2: any[] = [], a1 = 0, a2 = 0, tc = new THREE.Color(), mm = m4, e = mm.elements, i, k, firma = 17;
    for (k = 0; k < NP1; k++) cnt1.push(0); for (k = 0; k < NP2; k++) cnt2.push(0);
    for (k in extra) extra[k].n1 = extra[k].n2 = 0;
    for (i = 0; i < rest.length; i++) {
      var c = rest[i], ht = Math.min(1.5, Math.max(0.9, c.h * 0.3)), cb = ht + 0.1, top = Math.max(c.h, cb + 1.4), gz = c.gz * Estado.exag, H = (top - cb) * 0.82 * Estado.exag, cs = Math.cos(c.ang), sn = Math.sin(c.ang);
      var l1 = a1 < tope1 && c.d < (c.niv === 1 ? U1 * HIST_NIVEL : U1);   // L5-07: con histéresis
      if (!l1 && (a2 >= MAX2 || (QO && tri0 + a1 * TRI1 + (a2 + 1) * TRI2 > BO))) { c.niv = 0; continue; }   // Q0n: el nivel 2, dentro del presupuesto
      c.niv = l1 ? 1 : 2; firma = (Math.imul(firma, 31) + c.i * 2 + (l1 ? 1 : 0)) | 0;   // L1-11
      c3[0] = c.cr; c3[1] = c.cg; c3[2] = c.cb; aviva(c3, c.x, c.y);   // el tinte NDVI, si está activo, también llega de lejos
      tc.setRGB(c3[0] * 0.74 * c.vf, c3[1] * 0.88 * c.vf, c3[2] * 0.64 * c.vf);   // un verde plateado algo distinto en cada olivo
      var X = c.tipo !== -1 && c.cat === Catalogo.id() ? extra[c.tipo] : null;   // olivo con un tipo del catálogo cargado, si es el que nombra el índice (D-03), y piezas en este nivel; si no, el de siempre
      if (X && (l1 ? X.m1 : X.m2).length) { colocaModelo(X, c, l1, gz, tc); if (l1) a1++; else a2++; continue; }
      var sx = c.rx, sz = c.rz;
      e[0] = cs * sx; e[1] = 0; e[2] = -sn * sx; e[3] = 0; e[4] = 0; e[5] = H; e[6] = 0; e[7] = 0; e[8] = sn * sz; e[9] = 0; e[10] = cs * sz; e[11] = 0; e[12] = c.x; e[13] = gz + cb * Estado.exag; e[14] = -c.y; e[15] = 1;
      if (l1) {
        var q = c.pr, n = cnt1[q]++; a1++; iCopa1[q].setMatrixAt(n, mm); iCopa1[q].setColorAt(n, tc);
        e[0] = cs; e[2] = -sn; e[5] = (cb + 0.35) * Estado.exag; e[8] = sn; e[10] = cs; iTron1[q].setMatrixAt(n, mm);
      } else { var q2 = c.pr % NP2, n2b = cnt2[q2]++; a2++; iCopa2[q2].setMatrixAt(n2b, mm); iCopa2[q2].setColorAt(n2b, tc); }
    }
    // L1-11: una repetición por tiempo (soloTiempo: ni la cámara, ni la exageración, ni el tinte, ni nada marcado sucio) con el mismo reparto no vuelve a subir los búferes
    var sube = !soloTiempo || firma !== firmaNiv; firmaNiv = firma; if (sube) nSubidas++;
    for (k = 0; k < NP1; k++) { cuenta(iCopa1[k], cnt1[k]); cuenta(iTron1[k], cnt1[k]); if (sube) { iCopa1[k].instanceMatrix.needsUpdate = iTron1[k].instanceMatrix.needsUpdate = true; if (iCopa1[k].instanceColor) iCopa1[k].instanceColor.needsUpdate = true; } }
    for (k = 0; k < NP2; k++) { cuenta(iCopa2[k], cnt2[k]); if (sube) { iCopa2[k].instanceMatrix.needsUpdate = true; if (iCopa2[k].instanceColor) iCopa2[k].instanceColor.needsUpdate = true; } }
    for (k in extra) [[extra[k].m1, extra[k].n1], [extra[k].m2, extra[k].n2]].forEach(function (mn: any) { mn[0].forEach(function (m: any) { cuenta(m, mn[1]); if (sube) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } }); });
    n1 = a1; n2 = a2; triEst = tri0 + a1 * TRI1 + a2 * TRI2 + triTil + (vis ? olivos.length * TRI_SOMBRA : 0);   // L5-08: y las manchas de sombra
    if (vrP) triMotor = triNivel0() + GEN.tri + a1 * TRI1 + a2 * TRI2;   // Q0n: lo que dibujan los olivos del motor (el nivel 0, contado de su geometría)
    ultima.x = cam.x; ultima.y = cam.y; ultima.z = cam.z; ultima.exag = Estado.exag; ultima.k = tinte + "|" + ndviIdx + "|" + kcor; sucio = false;
  }
  // el aparato manda: sube o baja la escala según el tiempo por fotograma medido
  function ajustaEscala() {
    if (fijaSc) return;
    // la calidad fijada en Ajustes (33_ajustes: Baja 0,7, Media 1, Alta 1,6; «Automática», null) manda sobre la adaptativa. Con la escalera, esc entra
    // en Escalera.tope: la calidad mueve el presupuesto y, con él, el factor s que acerca o aleja todas las fronteras de escalón (O9c). L1-03 (A1-12): en VR el dt lo fija el casco aunque el fotograma vaya justo; «holgado» es el del controlador de nivel (VrControlPuro.holgura: JS contra su presupuesto, sin perdidos) y el techo, el perfil (escalaVr: ≤ 1 y solo crece si los triángulos caben)
    var fq = typeof Ajustes !== "undefined" && Ajustes.escalaArboles ? Ajustes.escalaArboles() : null;
    if (fq != null) { esc = fq; return; } if (vrP) { esc = VrControlPuro.escalaVr(esc, VrControlPuro.holgura(VRX, XrPerillas.js(), XrPerillas.jsSube()), InfoDibujo.triangulos(renderer), vrP.tri); return; }
    // por encima de 1,6 solo si además el fotograma va por debajo de 1,4 M triángulos; si pasa del techo de diseño (1,7 M, ADR-0002), baja
    var triFot = InfoDibujo.triangulos(renderer), techo = emaDt < 0.016 && triFot < 1400000 ? 2.5 : 1.6;
    if (triFot > 1700000 && esc > 1.0) esc = Math.max(1.0, esc - 0.10);   // L1-04: pasado el techo de diseño, la escala baja hasta 1,0 (antes se quedaba en 1,6), y no vuelve a subir mientras se pase
    else if (emaDt < 0.020 && triFot <= 1700000) esc = Math.min(Math.max(techo, esc > 1.6 ? esc : 0), esc + 0.05);
    else if (emaDt > 0.030) esc = Math.max(0.7, esc - 0.10);
  }

  // ----- ?olivos=escalera (ADR-0019, fase A): todos los olivos por la escalera del constructor (07ab en 3D, 07ac de lejos), repartidos por el
  // presupuesto del aparato (Escalera.tope: escritorio TOPE_TRI × esc, móvil 270 k sin medir con esc ≤ 1, gafas el tri del perfil); fuera el nivel 0
  // de siempre, los niveles 1 y 2 y los olivos del tileset, apartados todos con la máscara de 04c. Si el constructor no arranca
  // (Generados «sin»), vuelve lo de siempre.
  var MOVIL = Aparato.politica().olivosLigero;   // AG-0.3: ahora también las gafas Quest fuera de VR (antes no las reconocía y cargaba el presupuesto de escritorio)
  var tilApartados = false, presEsc = 0, mascara = "";
  // con ?olivos=escalera, siempre (si el constructor arranca); con ?olivos=gen y variantes horneadas (O8c), en cuanto está la capa de lejanos (07ab, Escalera.dibuja)
  function escalera() { return Escalera.dibuja({ modoGen: Generados.modoGen(), estado: Generados.estado(), hayCapa: Lejanos.hayCapa() }); }
  // todos: el tileset no dibuja ningún olivo (la máscara de 04c, con todos); si no, la máscara la pone reclasificaEscalera con los de 3D
  function apagaSiempre(todos: any) {
    Object.keys(celdas).forEach(function (k: any) { var c = celdas[k]; ColaExt.cancela("C" + k); if (c.g) quitaCelda(c); c.en = c.pre = false; });
    var k;
    for (k = 0; k < NP1; k++) { cuenta(iCopa1[k], 0); cuenta(iTron1[k], 0); }
    for (k = 0; k < NP2; k++) cuenta(iCopa2[k], 0);
    for (k in extra) extra[k].m1.concat(extra[k].m2).forEach(function (m: any) { cuenta(m, 0); });
    if (todos && !tilApartados) { tilApartados = true; OlivosTiles.cerca(olivos.map(function (c: any) { return c.i; })); }   // la máscara de 04c, con todos: el tileset no dibuja ninguno
    if (!todos) tilApartados = false;
  }
  function reclasificaEscalera() {
    var cam = camera.position, vis = gArboles.visible, fx = paseando ? cam.x : objetivo.x, fz = paseando ? cam.z : objetivo.z;
    // la máscara del tileset (O8c): con la horneada, mientras la capa de lejanos entra (1 s de tramado) el tileset sigue dibujando lo que no está en 3D,
    // y sus triángulos cuentan en el presupuesto
    var masc = Escalera.mascaraTiles({ modoGen: Generados.modoGen(), capaCompleta: Lejanos.capaCompleta() }), todos = masc === "todos", triTil = !todos && OlivosTiles.dibuja() ? OlivosTiles.triangulos() : 0;
    apagaSiempre(todos);
    ajustaEscala();
    presEsc = Escalera.tope({ base: TOPE_TRI, vr: vrP, movil: MOVIL, triMovil: TRI_MOVIL_CFG, escala: esc, triLejanos: Lejanos.triangulos() + triTil });
    if (vrP && TopeOlivos.activo()) presEsc = Math.min(presEsc, Math.max(0, TopeOlivos.presupuesto() - Lejanos.triangulos()));   // Q0n: generados y lejanos, dentro de la reserva × f
    // el foco, paseando, es quien pasea (pp); retener: sin lejanos todavía, lo que sale del 3D se queda en él
    var GEN = Generados.actualiza(paseando ? pp.x : fx, paseando ? -pp.y : fz, presEsc, olivos, esc, !Lejanos.hayCapa());
    if (vis) Lejanos.reparte(cam, GEN);
    if (!todos && OlivosTiles.dibuja()) { var en3d: any[] = []; olivos.forEach(function (c: any) { if (GEN.tiene(c.i)) en3d.push(c.i); }); OlivosTiles.cerca(en3d); triTil = OlivosTiles.triangulos(); }
    nL0 = n1 = n2 = 0; faltan = 0; nPre = 0; triEst = GEN.tri + Lejanos.triangulos() + triTil + (vis ? olivos.length * TRI_SOMBRA : 0); mascara = masc;   // L5-08: y las manchas de sombra
    if (vrP) triMotor = GEN.tri + Lejanos.triangulos();   // Q0n
    ultima.x = cam.x; ultima.y = cam.y; ultima.z = cam.z; ultima.exag = Estado.exag; ultima.k = tinte + "|" + ndviIdx + "|" + kcor; sucio = false;
  }
  function tileCargada(ts: any) { sync();   // llegaron los datos de una tesela: la altura de sus olivos pasa del relieve grueso al fino
    Object.keys(celdas).forEach(function (k: any) { var c = celdas[k]; if (c.ts !== ts) return; c.arr.forEach(function (o: any) { o.gz = suelo(o.x, o.y); }); c.sucia = true; }); sucio = true;
  }
  function refresca() { sync();   // cambió algo que afecta a todos (exageración, calidad, corrección de la ortofoto, tinte): las celdas se reconstruyen poco a poco; si no cambió nada (p. ej. pulsar «Gemelo»), no se toca lo ya construido
    var kd = claveActual(); sucio = true; construyeSombras(); if (kd === claveDib) return;
    claveDib = kd; Object.keys(celdas).forEach(function (k: any) { var c = celdas[k]; ColaExt.cancela("C" + k); if (c.g && c.kd !== kd) c.sucia = true; });
  }
  function actualiza(dt: any, forzar?: any) { sync();
    if (!listo0) return;
    // ?olivos=gen: los generados avanzan su cola propia (con una parte del presupuesto de la Cola: la mitad, el 30 % si faltan celdas de nivel 0, y todo
    // si la Cola no tiene nada) y su fundido; al colocar un lote o acabar el fundido, se reparte de nuevo. Sin la bandera, no hace nada y no gasta
    if (Generados.paso(dt, presupuestoBase() * (!Cola.pendientes() ? 1 : faltan > 0 ? 0.3 : 0.5))) sucio = true;
    if (Lejanos.paso(dt)) sucio = true;   // ?olivos=escalera: la capa de lejanos preparada (o fallida); sin la bandera, nada
    emaDt += (Math.min(dt, 0.1) - emaDt) * 0.04;
    if (vrP) muestraTopeOlivos(dt);   // Q0n: solo en VR
    var vis = gArboles.visible; if (!vis && Estado.modo !== "nube") return;   // en modo Ortofoto no hay árboles; en modo Nube se precargan los de alrededor
    t += dt;
    var cam = camera.position, umbral = paseando ? 2.5 : 6, mueve = Math.hypot(cam.x - ultima.x, cam.y - ultima.y, cam.z - ultima.z) > umbral, k = tinte + "|" + ndviIdx + "|" + kcor;
    if (kcorColor !== kcor) recolorea();   // L3-01: el deslizador de corrección mueve la copa y, con ella, el color de los niveles 1 y 2
    var cambio = forzar || sucio || ultima.exag !== Estado.exag || ultima.k !== k || (mueve && t > 0.25);
    if (cambio || t > (paseando ? 0.7 : 1.5)) { t = 0; reclasifica(!cambio); }   // L1-11: !cambio = repetición solo por tiempo
  }
  // Q0n: cada TopeTilesPuro.DEF.MUESTRA s en VR, el lazo de 02m mira los triángulos del último reparto; si cambia el factor, se reparte de nuevo
  function muestraTopeOlivos(dt: any) {
    tMuestraO += dt; if (tMuestraO < TopeTilesPuro.DEF.MUESTRA) return;
    var d = tMuestraO > 1 ? TopeTilesPuro.DEF.MUESTRA : tMuestraO, cam = camera.position; tMuestraO = 0;
    if (TopeOlivos.paso(d, triMotor, XrPerillas.topeTiles(vrP.tri), faltan > 0 || Generados.pendientes() > 0, cam.x, cam.z)) sucio = true;
  }
  function presupuesto() { sync(); return Math.max(0.5, presupuestoBase() - Generados.gastado()); }   // lo que ya gastaron los generados este fotograma, se descuenta
  // AG-1.5: el reloj de carga es UNO por fotograma: lo de siempre (más si faltan olivos de nivel 0 y el aparato va holgado), recortado por el tope del
  // aparato (Aparato.politica: cargaMs, y cargaMsVr dentro de una sesión inmersiva) y menos lo que el tileset gastó en el motor desde la última
  // Cola.corre (Cola.deuda). De él salen la parte de los generados (Generados.paso) y el resto para la Cola. La regla, en CargaPuro.base (02b_cola: se prueba en Node)
  var POL = Aparato.politica(), oBase = { emaDt: 0, faltan: 0, paseando: false, vr: false, pol: POL, deuda: 0 };   // oBase: el mismo objeto cada vez (sin basura por fotograma)
  function presupuestoBase() { oBase.emaDt = emaDt; oBase.faltan = faltan; oBase.paseando = paseando; oBase.vr = Aparato.vr(); oBase.deuda = Cola.deuda(); return CargaPuro.base(oBase); }
  function perfil(p: any) { sync();
    vrP = p || null; TOPE_TRI = p ? p.tri : TOPE_TRI0; sucio = true; tMuestraO = 0;
    if (p) TopeOlivos.paso(0, triMotor, XrPerillas.topeTiles(p.tri), true, camera.position.x, camera.position.z);   // Q0n: el tope del nivel, desde ya
    else { TopeOlivos.apaga(); triMotor = 0; }   // fuera de VR: sin reserva y f = 1
  }
  function resumen() { sync();
    var r: any = { olivos: olivos.length, nivel0: nL0, nivel1: n1, nivel2: n2, celdas: Object.keys(celdas).length, construidas: Object.keys(celdas).filter(function (k: any) { return celdas[k].g; }).length, faltan: faltan, precarga: nPre, esc: +esc.toFixed(2), triEst: triEst, subidas: nSubidas, tiles: OlivosTiles.dibuja(), emaMs: +(emaDt * 1000).toFixed(1) };
    if (Generados.escalera()) r.escalera = resumenEscalera();   // solo con la bandera: sin ella, el resumen es el de siempre
    if (vrP) r.topeOlivos = Object.assign(TopeOlivos.resumen(), { triMotor: triMotor });   // Q0n: solo en VR
    return r;
  }
  /** ?olivos=escalera: el reparto (E0/E1/E2/lejanos), triángulos y llamadas de olivos, para ?debug y el banco */
  function resumenEscalera() {
    var g = window.__olivosGen ? window.__olivosGen() : null, inf = g && g.info || {}, nv = inf.niveles || {}, L = Lejanos.resumen() || {};
    var inst1 = 0; for (var k = 0; k < NP1; k++) inst1 += iCopa1[k].count + iTron1[k].count; for (k = 0; k < NP2; k++) inst1 += iCopa2[k].count;
    var t = OlivosTiles.resumen();
    return { activa: escalera(), modoGen: Generados.modoGen(), mascaraTiles: mascara, estado: g ? g.estado : "", E0: nv.E0 || 0, E1: nv.E1 || 0, E2: (nv.E2 || 0) + (nv.E2VR || 0), vr: !!vrP, lejanos: L.dibujados || 0, lejanosModo: L.fuente, lejanosMiB: L.texturaMiB || 0,
      triOlivos: (inf.triangulos || 0) + (L.triangulos || 0), llamadasOlivos: (inf.llamadas || 0) + (L.llamadas || 0), triSaliendo: inf.triSaliendo || 0, presupuesto: Math.round(presEsc), movil: MOVIL,
      reparto: g && g.escalera ? g.escalera.reparto : null, sombras: g && g.escalera ? g.escalera.sombras : null, sombraMap: !!(renderer.shadowMap && renderer.shadowMap.enabled),
      nivel0Mallas: Object.keys(celdas).filter(function (k: any) { return celdas[k].g && celdas[k].g.visible; }).length, instanciasN12: inst1, tilesetDibujados: t.estado === "activo" ? t.dibujadas : 0, lejanosDetalle: L };
  }
  /** quita de la escena y suelta todo lo de este módulo: los trabajos de la Cola (celdas «C» y bins «B»), las celdas de nivel 0 (con la geometría de sus mallas) y las mallas
   *  instanciadas de los niveles 1 y 2 (búferes de instancias; sus geometrías y materiales son del catálogo, 07a). Después actualiza() no hace nada. Llamarlo dos veces no
   *  libera dos veces. */
  function liberaTodo(): void {
    if (suelto) return; suelto = true; listo0 = false;
    Object.keys(celdas).forEach(function (k: any) {
      const c = celdas[k]; ColaExt.cancela("C" + k); if (c.ts) ColaExt.cancela("B" + c.ts.key);
      if (c.g) { gArboles.remove(c.g); libera(c.g); c.g = null; }
    });
    const mallas: any[] = iCopa1.concat(iTron1, iCopa2);
    Object.keys(extra).forEach(function (t: any) { extra[t].m1.concat(extra[t].m2).forEach(function (m: any) { mallas.push(m); }); });
    mallas.forEach(function (m: any) { gArboles.remove(m); m.dispose(); });
    iCopa1 = []; iTron1 = []; iCopa2 = []; extra = {};
  }
  /** el componente (ADR-0023): el ciclo de vida de los olivos del motor (celdas y mallas instanciadas). Solo ciclo de vida: lo que dibuja lo cuenta resumen().triEst para el
   *  tope; no se apaga desde la URL (?olivos=0 los apaga por la ruta de siempre, 01_datos). Lo registra 90_final.js (el objeto lo usa el legado desde el primer fotograma). */
  const componente: Manifiesto = {
    id: ID_ARBOLES, version: 1,
    consume: ["Cola", "Mundo", "Catalogo", "Generados", "Escalera", "Estado", "gArboles"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },
    presupuesto: { llamadas: 250, triangulos: 550000 },   // el techo de olivos del motor: TOPE_TRI = 550.000 triángulos (L1-04: ahora cuenta también el nivel 0) y unas 250 llamadas (celdas de nivel 0 y mallas instanciadas)
    mundos: ["exterior"],
    monta: function () { return { libera: liberaTodo }; },
    libera: function () { liberaTodo(); }
  };
  return { perfil: perfil, inicia: inicia, tileCargada: tileCargada, refresca: refresca, actualiza: actualiza, presupuesto: presupuesto, resumen: resumen, celdas: celdas, libera: liberaTodo, componente: componente };
}
export type Arboles = ReturnType<typeof creaArboles>;

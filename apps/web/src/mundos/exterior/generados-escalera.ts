// La escalera de los olivos generados (ADR-0019, ADR-0022) y la decisión de si se piden (O10a): lo PURO de los olivos generados, sin THREE ni DOM. MU5-n (A3-2a): antes
// el trozo [puro:inicio]…[puro:fin] de apps/web/motor/07ab_generados.js, que queda como talón (`var Escalera = Mundos.Escalera;`). Lo evalúan en Node
// pruebas/olivo/escalera_motor.mjs, o9a_escalones.mjs y pruebas/guardianes/olivos_defecto.test.js (que importan este fichero), y generados-escalera.test.ts.
// El código es el de siempre, movido: solo se le han puesto los tipos (any: los objetos del reparto son los de 07b y 07ab, sin tipar).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

// O9c (decisión 82, ADR-0022 §4-5): el escalón de cada olivo sale de su alto en píxeles, px = h · kPx / d (kPx = alto del búfer / (2 · tan(fov/2))):
// E0 si px ≥ U0, E1 si ≥ U1, E2 (E2-VR en gafas) si ≥ U2 y lejano (07ac) por debajo. Dicho en metros, cada olivo tiene sus fronteras
// D_k = h · kPx / (U_k · s). Si el presupuesto (triángulos, 6 propios, 48 variantes) no da, s sube y TODAS las fronteras se acercan a la vez (nunca
// «el segundo baja a esquelético»); si sobra (cabe en el 70 %) y hace T_BAJA s (8) que no sube, s baja un paso del 2 % (hasta 1: los umbrales de partida). Alrededor de cada frontera, una BANDA de ± BANDA m
// en la que el olivo se dibuja en los dos escalones con un tramado complementario de peso f = (D + b − d) / 2b para el más fino: el paso de uno a
// otro es continuo con la distancia, no un disparo. Histéresis pequeña: se sale de la banda HIST (8 %, al menos 0,4 m) más allá de donde se entró,
// y un olivo sin banda no cambia de escalón hasta pasar la frontera ese mismo margen. Sin prima de E0: el E0 es el que se ve grande.
export const Escalera = (function () {
  var MAX_PROPIOS = 6, MAX_VAR = 48, TRI_MOVIL = 270000, FR_E0_VR = 0.4, UMBRALES = [700, 250, 90], BANDA = 1.5, HIST = 0.08, HIST_MIN = 0.4;
  var PASO_S = 1.02, S_MAX = 64, HOLGURA = 0.7, T_BAJA = 8, K_PX = 1080 / (2 * Math.tan(21 * Math.PI / 180));   // sin cámara: 1080 p con el fov de 42° del motor
  /** el presupuesto de triángulos de la escalera (ADR-0019 §1): {base: TOPE_TRI de escritorio, vr: perfil VR o null, movil, escala, triLejanos}.
   *  Gafas: el tri del perfil, escala 1. Móvil: triMovil (la configuración) o 270 k (valor de partida SIN medir), escala ≤ 1. Escritorio: base × escala.
   *  Menos lo que cuestan los lejanos. */
  function tope(o: A) {
    var t = o.vr ? o.vr.tri : o.movil ? (o.triMovil > 0 ? o.triMovil : TRI_MOVIL) : o.base, k = o.vr ? 1 : o.movil ? Math.min(1, o.escala) : o.escala;
    return Math.max(0, t * k - (o.triLejanos || 0));
  }
  /** las fronteras de un olivo de alto h (m): D[k] (m) entre el escalón k y el k+1 (E0|E1, E1|E2, E2|lejano) y la media banda b[k], que no
   *  pasa del 45 % del hueco con la frontera vecina (dos bandas nunca se pisan) */
  function fronteras(h: A, kPx: A, U: A, s: A, banda: A) {
    var D: A = [0, 1, 2].map(function (k: A) { return U[k] > 0 && isFinite(U[k]) ? h * kPx / (U[k] * s) : 0; }), b: A = [];
    for (var k = 0; k < 3; k++) {
      var lo = k ? D[k] - D[k - 1] : D[k], hi = k < 2 ? D[k + 1] - D[k] : Infinity;
      b.push(D[k] > 0 ? Math.max(0, Math.min(banda, 0.45 * lo, 0.45 * hi)) : 0);
    }
    return { D: D, b: b };
  }
  function peso(d: A, F: A, k: A) { return F.b[k] > 0 ? Math.min(1, Math.max(0, (F.D[k] + F.b[k] - d) / (2 * F.b[k]))) : d <= F.D[k] ? 1 : 0; }
  /** el estado de un olivo a d m: {n} escalón entero (0 E0, 1 E1, 2 E2, 3 lejano) o {k, f} en la banda de la frontera k con peso f del más fino;
   *  ant: el estado anterior (histéresis) */
  function estadoDe(d: A, F: A, ant: A, hist: A) {
    var m = function (k: A) { return Math.max(HIST_MIN, hist * F.D[k]); }, k;
    if (ant && ant.k !== undefined && F.b[ant.k] > 0 && Math.abs(d - F.D[ant.k]) <= F.b[ant.k] + m(ant.k)) return { k: ant.k, f: peso(d, F, ant.k) };
    for (k = 0; k < 3; k++) if (F.b[k] > 0 && Math.abs(d - F.D[k]) <= F.b[k]) return { k: k, f: peso(d, F, k) };
    var n = 0; while (n < 3 && d > F.D[n]) n++;
    if (ant && ant.n !== undefined && Math.abs(n - ant.n) === 1) { k = Math.min(n, ant.n); if (Math.abs(d - F.D[k]) <= F.b[k] + m(k)) return { n: ant.n }; }
    return { n: n };
  }
  /** El plan de la escalera. cand: [{c: {i, h?,…}, d}] (d: la distancia del ojo con la que se miden los píxeles); est: estado por olivo y la s
   *  ({_s, i: {n} | {k}}), que se actualiza aquí; o: {pres, vr, costo(clave, niv), clavePropia(c, niv), claveVar(c), kPx?, umbrales?, banda?,
   *  hist?, alto(c)?, maxPropios?, maxVar?, frE0Vr? (parte del presupuesto de gafas para el E0), ahora? (s)}. Devuelve {plan: [{c, d, clave, niv, propio, rol, banda, f, lej, F}] de cerca a lejos (rol 0: entero;
   *  en banda, 1 el más fino y 2 el más grueso; lej: el más grueso es el lejano de 07ac), usado, propios, variantes, s, enBanda}. */
  function planifica(cand: A, est: A, o: A) {
    var pres = o.pres, maxP = o.maxPropios === undefined ? MAX_PROPIOS : o.maxPropios, maxV = o.maxVar === undefined ? MAX_VAR : o.maxVar;
    var kPx = o.kPx > 0 ? o.kPx : K_PX, U0 = o.umbrales || UMBRALES, banda = o.banda === undefined ? BANDA : o.banda, hist = o.hist === undefined ? HIST : o.hist;
    var NV = ["E0", "E1", o.vr ? "E2VR" : "E2"], alto = o.alto || function (c: A) { return c.h > 0 ? c.h : 4; };
    // en gafas, el E0 solo si no pasa del 40 % del perfil (con el coste del primer candidato: todos los propios cuestan parecido)
    var frE0 = o.frE0Vr === undefined ? FR_E0_VR : o.frE0Vr, sinE0 = o.vr && cand.length && o.costo(o.clavePropia(cand[0].c, "E0"), "E0") > frE0 * pres, U = [sinE0 ? Infinity : U0[0], U0[1], U0[2]];
    var hs = cand.map(function (x: A) { return alto(x.c); });
    function evalua(s: A) {
      var L: A = [], usado = 0, nP = 0, nV = 0, nB = 0;
      for (var j = 0; j < cand.length; j++) {
        var x = cand[j], F = fronteras(hs[j], kPx, U, s, banda), st = estadoDe(x.d, F, est[x.c.i], hist), partes: A = [];
        if (st.n !== undefined) { if (st.n < 3) partes.push({ niv: NV[st.n], rol: 0 }); }
        else { nB++; partes.push({ niv: NV[st.k], rol: 1 }); if (st.k < 2) partes.push({ niv: NV[st.k + 1], rol: 2 }); }
        for (var q = 0; q < partes.length; q++) {
          var p = partes[q]; p.propio = p.niv === "E0" || p.niv === "E1"; p.clave = p.propio ? o.clavePropia(x.c, p.niv) : o.claveVar(x.c);
          usado += o.costo(p.clave, p.niv); if (p.propio) nP++; else nV++;
        }
        L.push({ x: x, F: F, st: st, partes: partes });
      }
      return { L: L, usado: usado, nP: nP, nV: nV, nB: nB, s: s };
    }
    function cabe(r: A, lim: A) { return r.usado <= lim && r.nP <= maxP && r.nV <= maxV; }
    var s0 = Math.max(1, est._s || 1), r = evalua(s0), ahora = o.ahora;
    if (!cabe(r, pres)) { var s = s0; while (s < S_MAX) { s = Math.min(S_MAX, s * PASO_S); r = evalua(s); if (cabe(r, pres)) break; } est._tSube = ahora; }
    else if (s0 > 1 && (ahora === undefined || est._tSube === undefined || ahora - est._tSube >= T_BAJA)) { var rb = evalua(Math.max(1, s0 / PASO_S)); if (cabe(rb, HOLGURA * pres)) r = rb; }
    var plan: A = [], vivos: A = {};
    r.L.forEach(function (e: A) {
      vivos[e.x.c.i] = true; est[e.x.c.i] = e.st.n !== undefined ? { n: e.st.n } : { k: e.st.k };
      e.partes.forEach(function (p: A) {
        plan.push({ c: e.x.c, d: e.x.d, clave: p.clave, niv: p.niv, propio: p.propio, rol: p.rol, f: e.st.f, lej: e.st.k === 2,
          banda: e.st.k !== undefined ? { k: e.st.k, D: e.F.D[e.st.k], b: e.F.b[e.st.k] } : null, F: e.F });
      });
    });
    Object.keys(est).forEach(function (i: A) { if (i.charAt(0) !== "_" && !vivos[i]) delete est[i]; });
    est._s = r.s;
    plan.sort(function (a: A, b: A) { return a.d - b.d || a.rol - b.rol; });
    return { plan: plan, usado: r.usado, propios: r.nP, variantes: r.nV, s: r.s, enBanda: r.nB };
  }
  /** el escalón entero de un olivo a d m con sus fronteras F, sin banda ni histéresis: 0 E0, 1 E1, 2 E2 (E2-VR), 3 lejano */
  function nivel(d: A, F: A) { var n = 0; while (n < 3 && d > F.D[n]) n++; return n; }
  // ---- O8c: cuándo dibuja el motor la escalera (ADR-0019) y qué olivos aparta del tileset
  /** cómo van los generados: {bandera: "escalera" | "gen" | null (?olivos=), manifiesto: el de la finca vale, variantes: las de la época en él,
   *  sinEscalera: ?olivosEscalera=0}. «forzada» con ?olivos=escalera (siempre, como en la fase A); «horneada» con ?olivos=gen y variantes horneadas
   *  de la época (la escalera real: variantes E2 e impostores en lugar del nivel 0 de siempre y de los olivos del tileset); «gen» con ?olivos=gen sin
   *  ellas (lo de antes: propios y variantes cerca y, más allá, lo de siempre); «apagado» sin la bandera */
  function modoGen(o: A) {
    if (o.bandera === "escalera") return "forzada";
    if (o.bandera !== "gen") return "apagado";
    return !o.sinEscalera && o.manifiesto && o.variantes > 0 ? "horneada" : "gen";
  }
  /** si 07b reparte con la escalera ({modoGen, estado de Generados, hayCapa: la de lejanos de 07ac}). La horneada espera a la capa de lejanos: hasta
   *  entonces 07b reparte como con ?olivos=gen (el nivel 0 de siempre y el tileset fuera de lo generado, que ya va por la escalera con FR_ESPERA del
   *  presupuesto), sin el hueco de la primera carga (ADR-0019 §3) que sí tiene la forzada */
  function dibuja(o: A) {
    if (o.estado === "sin") return false;
    if (o.modoGen === "forzada") return true;
    return o.modoGen === "horneada" && !!o.hayCapa;
  }
  /** qué olivos aparta 07b del tileset (la máscara de 04c) con la escalera: «todos» (la forzada, o la horneada con la capa de lejanos ya entera) o
   *  «3d» (solo los que están en 3D: durante el segundo en que la capa de lejanos entra con su tramado, el tileset sigue debajo) */
  function mascaraTiles(o: A) { return o.modoGen === "forzada" || o.capaCompleta ? "todos" : "3d"; }
  return { tope: tope, planifica: planifica, fronteras: fronteras, peso: peso, estado: estadoDe, nivel: nivel, modoGen: modoGen, dibuja: dibuja, mascaraTiles: mascaraTiles,
    MAX_PROPIOS: MAX_PROPIOS, MAX_VAR: MAX_VAR, TRI_MOVIL: TRI_MOVIL, UMBRALES: UMBRALES, BANDA: BANDA, HIST: HIST, FR_E0_VR: FR_E0_VR, K_PX: K_PX, FR_ESPERA: 0.45 };
})();
// O10a: ¿se piden los olivos generados? Una sola decisión, sin THREE ni DOM (la evalúa pruebas/guardianes/olivos_defecto.test.js). Entra la búsqueda de la URL,
// los datos de la finca (copas, copas_param, copas_id del índice) y las capacidades del aparato y del build ({constructor, batched: THREE.BatchedMesh,
// webgl2}; solo un false explícito las niega: lo que no se sabe de forma síncrona, lo dice después la carga del constructor, que cae a lo de siempre).
// Devuelve {bandera: "escalera" | "gen" | null, defecto: viene del valor por defecto, motivo: por qué NO, si bandera es null}
export const GeneradosPuro = (function () {
  function sinDato(d: A) { return !d || !d.copas || !d.copas.length ? "la finca no trae olivos detectados (copas)" : !d.copas_param || !d.copas_param.length ? "la finca no trae copas_param" : !d.copas_id || !d.copas_id.length ? "la finca no trae copas_id" : ""; }
  function activo(busqueda: A, datos: A, cap: A) {
    var m = /[?&]olivos=([^&#]*)/.exec(String(busqueda || "")), v = m ? m[1] : null;
    if (v === "escalera" || v === "gen") return { bandera: v, defecto: false, motivo: "" };
    if (v === "0" || v === "no") return { bandera: null, defecto: false, motivo: "apagados a mano (?olivos=" + v + ")" };
    cap = cap || {};
    if (cap.constructor === false) return { bandera: null, defecto: true, motivo: "este build no trae el constructor" };
    if (cap.batched === false) return { bandera: null, defecto: true, motivo: "este three no tiene BatchedMesh" };
    if (cap.webgl2 === false) return { bandera: null, defecto: true, motivo: "el aparato no tiene WebGL2" };
    var no = sinDato(datos); if (no) return { bandera: null, defecto: true, motivo: no };
    return { bandera: "gen", defecto: true, motivo: "" };
  }
  return { activo: activo };
})();

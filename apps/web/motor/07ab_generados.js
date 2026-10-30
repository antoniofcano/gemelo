// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Escalera, Generados
// Consume: 01_datos (D, VRP, FACTOR_R8_GEN, factorCopaDeConfig), 02_mundo (suelo, copas), 02c_componentes (Config),
//   03_escena (renderer, camera, colorVertSRGB, exag), 06_arboles (gArboles), 08_marcadores (aplica), 12_paseo (paseando, primera),
//   14_historia (hist, lista), 15_tiempo (parcheTiempo, nivel, hace), 16_vida (esfera), 29_vr (VR_PERFILES)
// ===============================================================================
  // ---------- olivos GENERADOS cerca (ADR-0017, decisiones 26-28, 34 y 52), solo con ?olivos=gen: sin la bandera no no actúa y el motor dibuja lo de siempre.
  // El árbol lo da el constructor de olivos (apps/web/olivo/, three 0.128 dentro): window.OlivoGen (el IIFE de la salida artefacto) o, en el cliente
  // web, import("gemelo-olivo") (Vite). Su forma es la de olivo-2 (forma ILUSTRATIVA con medidas del LiDAR: altura, copa y orientación de copas/copas_param).
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
  // Fundido (sin saltos de forma): cada pieza del lote lleva un código (0 se queda, 1 entra, 2 sale; más la ranura de banda, abajo) y, al colocar un lote nuevo, un tramado de pantalla
  // (descarte por ruido de gradiente entrelazado, sin transparencia ni ordenación, también en la pasada de sombras) deja aparecer lo que entra y
  // desaparecer lo que sale en FUNDIDO s; lo que sale va en el mismo lote (al final) y se oculta al acabar. Mientras dura, el dibujo de siempre de lo que
  // entra sigue dibujándose debajo y el de lo que sale vuelve a dibujarse desde el principio. ?olivosFundido=0 lo suprime (salto, como antes).
  // Variantes HORNEADAS (ADR-0018, contratos/olivo-horneado.md, O7e): con la página servida por el servidor (D.base /teselas/…) se pide
  // <D.base>olivos/manifiesto.json (mismo origen, con la cookie); si su formato, GEN_VERSION y CACHE_VERSION son las del motor, los tipos y semillas de
  // las variantes y la época (por fecha con su calendario, salvo ?epoca=) salen de él, y cada variante se busca en la caché de O5 y, si no está, se
  // descarga (<huella>.br, Content-Encoding: br), se comprueba (tamaño, huella, cabecera, clave) y se decodifica. Cualquier fallo, o sin manifiesto
  // (salida artefacto, fixture): se calcula, como siempre (plan B). Los propios (E0/E1) se calculan siempre (decisión 63). ?olivosHorneado=0 (para
  // comparar a ojo): se lee el manifiesto (mismas variantes y época) pero no se descarga nada; todas se calculan. Para pruebas y comparaciones sin
  // servidor: ?olivosDir=<carpeta relativa del mismo origen, acabada en «/»> en vez de <D.base>olivos/, y ?olivosPropios=N (0-6) cuántos propios.
  // ESCALERA (ADR-0019, fase A, O8c), solo con ?olivos=escalera: los mismos generados para TODOS los olivos, con el reparto del ADR (Escalera, abajo):
  // presupuesto entero del aparato (no el 45 %) menos los lejanos (07ac); el escalón de cada olivo, por su alto en píxeles con las fronteras
  // desplazadas a la vez por el presupuesto, y en la banda de cada frontera los dos escalones con el tramado complementario según la distancia (O9c,
  // decisión 82, ADR-0022: ver Escalera); un olivo cambia de escalón solo cuando el pedido está preparado (hasta entonces se queda en el que tenía) y,
  // mientras no haya lejanos, lo que sale del 3D se queda en el lote (nunca sin dibujar). El coste ya no dobla por la pasada de sombras si
  // renderer.shadowMap no está activo (el motor no lo activa: ver costo()). La copa y la altura de todos, las del propio (parametrosDe, decisión 81).
  // ?olivos=gen no cambia.

  // [puro:inicio] — el reparto de la escalera por presupuesto, sin THREE ni DOM (lo evalúan pruebas/olivo/escalera_motor.mjs y o9a_escalones.mjs)
  // O9c (decisión 82, ADR-0022 §4-5): el escalón de cada olivo sale de su alto en píxeles, px = h · kPx / d (kPx = alto del búfer / (2 · tan(fov/2))):
  // E0 si px ≥ U0, E1 si ≥ U1, E2 (E2-VR en gafas) si ≥ U2 y lejano (07ac) por debajo. Dicho en metros, cada olivo tiene sus fronteras
  // D_k = h · kPx / (U_k · s). Si el presupuesto (triángulos, 6 propios, 48 variantes) no da, s sube y TODAS las fronteras se acercan a la vez (nunca
  // «el segundo baja a esquelético»); si sobra (cabe en el 70 %) y hace T_BAJA s (8) que no sube, s baja un paso del 2 % (hasta 1: los umbrales de partida). Alrededor de cada frontera, una BANDA de ± BANDA m
  // en la que el olivo se dibuja en los dos escalones con un tramado complementario de peso f = (D + b − d) / 2b para el más fino: el paso de uno a
  // otro es continuo con la distancia, no un disparo. Histéresis pequeña: se sale de la banda HIST (8 %, al menos 0,4 m) más allá de donde se entró,
  // y un olivo sin banda no cambia de escalón hasta pasar la frontera ese mismo margen. Sin prima de E0: el E0 es el que se ve grande.
  var Escalera = (function () {
    var MAX_PROPIOS = 6, MAX_VAR = 48, TRI_MOVIL = 270000, FR_E0_VR = 0.4, UMBRALES = [700, 250, 90], BANDA = 1.5, HIST = 0.08, HIST_MIN = 0.4;
    var PASO_S = 1.02, S_MAX = 64, HOLGURA = 0.7, T_BAJA = 8, K_PX = 1080 / (2 * Math.tan(21 * Math.PI / 180));   // sin cámara: 1080 p con el fov de 42° del motor
    /** el presupuesto de triángulos de la escalera (ADR-0019 §1): {base: TOPE_TRI de escritorio, vr: perfil VR o null, movil, escala, triLejanos}.
     *  Gafas: el tri del perfil, escala 1. Móvil: triMovil (la configuración) o 270 k (valor de partida SIN medir), escala ≤ 1. Escritorio: base × escala.
     *  Menos lo que cuestan los lejanos. */
    function tope(o) {
      var t = o.vr ? o.vr.tri : o.movil ? (o.triMovil > 0 ? o.triMovil : TRI_MOVIL) : o.base, k = o.vr ? 1 : o.movil ? Math.min(1, o.escala) : o.escala;
      return Math.max(0, t * k - (o.triLejanos || 0));
    }
    /** las fronteras de un olivo de alto h (m): D[k] (m) entre el escalón k y el k+1 (E0|E1, E1|E2, E2|lejano) y la media banda b[k], que no
     *  pasa del 45 % del hueco con la frontera vecina (dos bandas nunca se pisan) */
    function fronteras(h, kPx, U, s, banda) {
      var D = [0, 1, 2].map(function (k) { return U[k] > 0 && isFinite(U[k]) ? h * kPx / (U[k] * s) : 0; }), b = [];
      for (var k = 0; k < 3; k++) {
        var lo = k ? D[k] - D[k - 1] : D[k], hi = k < 2 ? D[k + 1] - D[k] : Infinity;
        b.push(D[k] > 0 ? Math.max(0, Math.min(banda, 0.45 * lo, 0.45 * hi)) : 0);
      }
      return { D: D, b: b };
    }
    function peso(d, F, k) { return F.b[k] > 0 ? Math.min(1, Math.max(0, (F.D[k] + F.b[k] - d) / (2 * F.b[k]))) : d <= F.D[k] ? 1 : 0; }
    /** el estado de un olivo a d m: {n} escalón entero (0 E0, 1 E1, 2 E2, 3 lejano) o {k, f} en la banda de la frontera k con peso f del más fino;
     *  ant: el estado anterior (histéresis) */
    function estadoDe(d, F, ant, hist) {
      var m = function (k) { return Math.max(HIST_MIN, hist * F.D[k]); }, k;
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
    function planifica(cand, est, o) {
      var pres = o.pres, maxP = o.maxPropios === undefined ? MAX_PROPIOS : o.maxPropios, maxV = o.maxVar === undefined ? MAX_VAR : o.maxVar;
      var kPx = o.kPx > 0 ? o.kPx : K_PX, U0 = o.umbrales || UMBRALES, banda = o.banda === undefined ? BANDA : o.banda, hist = o.hist === undefined ? HIST : o.hist;
      var NV = ["E0", "E1", o.vr ? "E2VR" : "E2"], alto = o.alto || function (c) { return c.h > 0 ? c.h : 4; };
      // en gafas, el E0 solo si no pasa del 40 % del perfil (con el coste del primer candidato: todos los propios cuestan parecido)
      var frE0 = o.frE0Vr === undefined ? FR_E0_VR : o.frE0Vr, sinE0 = o.vr && cand.length && o.costo(o.clavePropia(cand[0].c, "E0"), "E0") > frE0 * pres, U = [sinE0 ? Infinity : U0[0], U0[1], U0[2]];
      var hs = cand.map(function (x) { return alto(x.c); });
      function evalua(s) {
        var L = [], usado = 0, nP = 0, nV = 0, nB = 0;
        for (var j = 0; j < cand.length; j++) {
          var x = cand[j], F = fronteras(hs[j], kPx, U, s, banda), st = estadoDe(x.d, F, est[x.c.i], hist), partes = [];
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
      function cabe(r, lim) { return r.usado <= lim && r.nP <= maxP && r.nV <= maxV; }
      var s0 = Math.max(1, est._s || 1), r = evalua(s0), ahora = o.ahora;
      if (!cabe(r, pres)) { var s = s0; while (s < S_MAX) { s = Math.min(S_MAX, s * PASO_S); r = evalua(s); if (cabe(r, pres)) break; } est._tSube = ahora; }
      else if (s0 > 1 && (ahora === undefined || est._tSube === undefined || ahora - est._tSube >= T_BAJA)) { var rb = evalua(Math.max(1, s0 / PASO_S)); if (cabe(rb, HOLGURA * pres)) r = rb; }
      var plan = [], vivos = {};
      r.L.forEach(function (e) {
        vivos[e.x.c.i] = true; est[e.x.c.i] = e.st.n !== undefined ? { n: e.st.n } : { k: e.st.k };
        e.partes.forEach(function (p) {
          plan.push({ c: e.x.c, d: e.x.d, clave: p.clave, niv: p.niv, propio: p.propio, rol: p.rol, f: e.st.f, lej: e.st.k === 2,
            banda: e.st.k !== undefined ? { k: e.st.k, D: e.F.D[e.st.k], b: e.F.b[e.st.k] } : null, F: e.F });
        });
      });
      Object.keys(est).forEach(function (i) { if (i.charAt(0) !== "_" && !vivos[i]) delete est[i]; });
      est._s = r.s;
      plan.sort(function (a, b) { return a.d - b.d || a.rol - b.rol; });
      return { plan: plan, usado: r.usado, propios: r.nP, variantes: r.nV, s: r.s, enBanda: r.nB };
    }
    return { tope: tope, planifica: planifica, fronteras: fronteras, peso: peso, MAX_PROPIOS: MAX_PROPIOS, MAX_VAR: MAX_VAR, TRI_MOVIL: TRI_MOVIL,
      UMBRALES: UMBRALES, BANDA: BANDA, HIST: HIST, FR_E0_VR: FR_E0_VR, K_PX: K_PX };
  })();
  // [puro:fin]

  var Generados = (function () {
    var ESCALERA = /[?&]olivos=escalera\b/.test(location.search);
    var pedido = ESCALERA || /[?&]olivos=gen\b/.test(location.search), estado = pedido ? "cargando" : "apagado", motivo = "", M = null, mats = null, fabrica = null;
    var fr = /[?&]olivosTri=([0-9.]+)/.exec(location.search), FRACCION = fr && !ESCALERA ? Math.min(0.9, Number(fr[1])) : ESCALERA ? 1 : 0.45;
    var mpr = /[?&]olivosPropios=([0-6])\b/.exec(location.search), MAX_PROPIOS_VR = null;   // MAX_PROPIOS_VR: el de las gafas, si la configuración lo da
    var ESTIM = { E0: 160000, E1: 80000, E2: 38000, E2VR: 28000 }, SEM_VAR = [11, 23, 37, 51], MAX_PROPIOS = mpr ? Number(mpr[1]) : 6, MAX_VAR = 48, RADIO_CAND = 160, MARGEN = 12;
    var recetas = {}, pidiendo = {}, nPidiendo = 0, plan = [], listos = {}, enLote = {}, lote = null, claveLote = "", nuevo = null, R = 0, triGen = 0, costoGen = 0, info = { llamadas: 0, triangulos: 0 };
    var ff = /[?&]olivosFundido=([0-9.]+)/.exec(location.search), FUNDIDO = ff ? Math.min(3, Number(ff[1])) : 0.6;
    var HORNEADO = !/[?&]olivosHorneado=0\b/.test(location.search), manif = null, varSem = null, epocaManif = null, fechaPrueba = null;
    var horn = { estado: "no", motivo: "", horneadas: 0, calculadas: 0, fallos: 0, cache: 0, propios: 0, ultimoFallo: "" };
    var cache = null, uFun = { value: 1 }, fundido = null, selLote = [], avisa = false, prof = null, trabajos = [], gastado = 0;   // fundido: {t, viejos: {i: true}, Rviejo} mientras dura
    var NADA = { radio: 0, tri: 0, tiene: function () { return false; } };
    var grupo = new THREE.Group(); grupo.name = "olivosGenerados";
    if (pedido) { gArboles.add(grupo); arrancaGen(); }
    function epoca() { var m = /[?&]epoca=([a-z]+)/.exec(location.search); return m ? m[1] : epocaManif || epocaConfig(D.finca_id) || "envero"; }
    // la época de hoy según el calendario de la configuración del servidor (02c Config; null si no lo trae o no cubre los 366 días)
    function epocaConfig(finca) { var t = Config.tablaEpocas(finca); return t ? Config.epocaDeFecha(t, fechaPrueba || new Date()) : null; }
    function arrancaGen() {
      var p = typeof window !== "undefined" && window.OlivoGen ? Promise.resolve(window.OlivoGen) : import("gemelo-olivo");
      // la configuración del servidor (02c Config: espera como mucho 2 s; sin servidor, al momento) se aplica antes del primer olivo: nada cambia en caliente
      Promise.all([p, Config.listo]).then(function (r) {
        var m = r[0]; aplicaConfig();
        if (!m || !m.recetaG) throw new Error("sin el constructor de olivos (OlivoGen)");
        if (!THREE.BatchedMesh) throw new Error("este three no tiene BatchedMesh");
        // caché de recetas (O5): memoria con LRU (60 MB en móvil, gafas o con ≤ 4 GB; 150 MB si no) e IndexedDB (300 MB, LRU); ?olivosCache=0 la apaga
        cache = m.creaCache && !/[?&]olivosCache=0\b/.test(location.search) ? m.creaCache({ memMB: topeCacheMem(), discoMB: 300 }) : null;
        M = m; return cargaManifiesto();   // antes de los materiales: la época puede salir del manifiesto
      }).then(function () {
        mats = M.creaMateriales(THREE, null, { epoca: epoca(), srgb: true, parche: parcheGen, mipsCobertura: !/[?&]olivosMips=0\b/.test(location.search) });   // sin fotos de campo aquí: corteza dibujada (texturas.js); hojas con mipmaps que conservan la cobertura (ADR-0022 §6; ?olivosMips=0, los de la GPU)
        prof = { corteza: profundidad(), muerta: profundidad() };   // la sombra de las mallas por lotes, con el mismo fundido
        var f = M.creaFabrica({ trabajador: true }); if (f.modo === "trabajador") fabrica = f; else f.cierra();
        estado = "activo";
      }).catch(function (e) { estado = "sin"; motivo = String(e && e.message || e); console.warn("olivos generados: " + motivo); });
    }
    // ---- el manifiesto de las variantes horneadas: solo con la página del servidor; si no vale, se ignora entero y todo se calcula (sin avisar en consola)
    // la carpeta de lo horneado: ?olivosDir= (solo una ruta relativa del mismo origen acabada en «/», como ?api= de 13b) o, con la página del servidor
    // (D.base /teselas/<finca>/), <D.base>olivos/; si no, ninguna
    var DIR = (function () {
      var m = /[?&]olivosDir=([^&#]*)/.exec(location.search);
      if (m) { var p = decodeURIComponent(m[1]); return p.length > 1 && p.charAt(p.length - 1) === "/" && !/[^A-Za-z0-9_\-./]/.test(p) && p.indexOf("//") < 0 && p.indexOf("..") < 0 ? p : null; }
      return /^\/teselas\//.test(D.base || "") ? D.base + "olivos/" : null;
    })();
    function cargaManifiesto() {
      if (!M.decodifica || !DIR || typeof fetch !== "function") { horn.estado = "sin servidor"; return Promise.resolve(); }
      horn.estado = "pidiendo";
      return fetch(DIR + "manifiesto.json", { credentials: "same-origin", cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error("sin manifiesto (http " + r.status + ")"); return r.json(); })
        .then(function (m) {
          var no = manifiestoNoVale(m); if (no) throw new Error(no);
          manif = m;
          if (!/[?&]epoca=/.test(location.search)) {   // la época por fecha: la del calendario de la configuración (decisión 112) si el hornero la tiene;
            // si no, con el calendario del manifiesto (sus ventanas); si hoy no cae en ninguna, la actual
            var ventanas = {}, ec = epocaConfig(m.finca); m.epocas.forEach(function (e) { ventanas[e.epoca] = { desde: e.desde, hasta: e.hasta }; });
            epocaManif = (ec && m.epocas.some(function (e) { return e.epoca === ec; }) ? ec : null) || M.epocaDeFecha(M.tablaDe({ comun: ventanas }, m.finca), fechaPrueba || new Date()) || m.actual;
          }
          var ep = epoca(), vistos = {}; varSem = [];
          m.variantes.forEach(function (v) { var k = v.tipo + "|" + v.semilla; if (v.epoca === ep && !vistos[k]) { vistos[k] = true; varSem.push({ tipo: v.tipo, semilla: v.semilla }); } });
          if (!varSem.length) { varSem = null; horn.estado = "sin la época " + ep; } else horn.estado = HORNEADO ? "activo" : "apagado";
        })
        .catch(function (e) { manif = null; varSem = null; epocaManif = null; horn.estado = "ignorado"; horn.motivo = String(e && e.message || e).slice(0, 80); });
    }
    var ORDEN = ["reposo", "boton", "flor", "cuajado", "verde", "envero", "madura"];
    function manifiestoNoVale(m) {
      if (!m || typeof m !== "object") return "manifiesto ilegible";
      if (m.v !== 1) return "manifiesto v" + m.v;
      if (m.formato !== M.FORMATO_HORNEADO) return "formato " + m.formato + " (el motor lee el " + M.FORMATO_HORNEADO + ")";
      if (m.gen_version !== M.GEN_VERSION) return "gen_version " + m.gen_version + " (la del motor es " + M.GEN_VERSION + ")";
      if (m.cache_version !== M.CACHE_VERSION) return "cache_version " + m.cache_version + " (la del motor es " + M.CACHE_VERSION + ")";
      if (!Array.isArray(m.variantes) || !Array.isArray(m.epocas) || !m.epocas.length || ORDEN.indexOf(m.actual) < 0) return "manifiesto sin variantes, épocas o época actual";
      for (var i = 0; i < m.variantes.length; i++) {   // la huella va en la URL: solo 32 hexadecimales
        var v = m.variantes[i];
        if (!v || !esCadena(v.huella, 32, /[^0-9a-f]/) || !M.TIPOS[v.tipo] || ORDEN.indexOf(v.epoca) < 0 || !(v.semilla >= 0 && v.semilla <= 4294967295 && v.semilla % 1 === 0) || !(v.bytes > 0)) return "fila de variante " + i + " mal formada";
      }
      for (var j = 0; j < m.epocas.length; j++) { var w = m.epocas[j]; if (!w || ORDEN.indexOf(w.epoca) < 0 || !esCadena(w.desde, 5, /[^0-9-]/) || !esCadena(w.hasta, 5, /[^0-9-]/)) return "época " + j + " mal formada"; }
      return "";
    }
    function esCadena(x, n, prohibido) { return typeof x === "string" && x.length === n && !prohibido.test(x); }   // longitud exacta y sin caracteres de fuera
    function filaDe(e, niv) {
      if (!manif) return null;
      for (var i = 0; i < manif.variantes.length; i++) { var v = manif.variantes[i]; if (v.tipo === e.tipo && v.semilla === e.semilla && v.nivel === niv && v.epoca === e.epoca) return v; }
      return null;
    }
    // una variante horneada: descarga (el navegador ya deshizo el brotli), tamaño, huella, cabecera (formato, versiones, nivel y la MISMA clave de la caché) y decodifica
    function descarga(fila, ck, niv) {
      return fetch(DIR + fila.huella + ".br", { credentials: "same-origin" })
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.arrayBuffer(); })
        .then(function (ab) {
          var b = new Uint8Array(ab);
          if (b.length !== fila.bytes) throw new Error("tamaño " + b.length + " ≠ " + fila.bytes);
          return M.huellaBytes(b).then(function (h) {
            if (h !== fila.huella) throw new Error("huella distinta");
            var cab = M.leeCabecera(b);
            if (cab.formato !== M.FORMATO_HORNEADO || cab.gen_version !== M.GEN_VERSION || cab.cache_version !== M.CACHE_VERSION || cab.nivel !== niv || cab.clave !== ck) throw new Error("cabecera que no es la pedida");
            var r = M.decodifica(b).receta;   // las normales, tal cual (sin renormalizar: el sombreador normaliza)
            if (!r || !Array.isArray(r.piezas) || !r.escala || !r.medidas) throw new Error("receta incompleta");
            return r;
          });
        });
    }
    // ---- los materiales: el parche del motor (luz, nubes, escarcha) y el fundido por tramado
    // GLSL: código de cada pieza c = rol + 3 · ranura. rol 0 se queda (no descarta nada), 1 entra (se dibuja donde el ruido < f), 2 sale (donde ≥ f: el
    // complementario). Ranura 0: f = uFun (0 → 1), el fundido por tiempo al colocar un lote; fuera de él vale 1. Ranuras 1-63 (O9c, la escalera): f
    // = uBanda[ranura], el peso del escalón más fino de un olivo en la banda de su frontera, que paso() pone cada fotograma según la distancia
    // (ADR-0022 §5). En las mallas por lotes, c va en el alfa del color por instancia (1 − c / 2: 1, 0,5, 0, −0,5…); en las instanciadas y los
    // puntos, en el atributo aFun. vFun = rol y vFr = f, del vértice al fragmento.
    var GLSL_FUN_V = "varying float vFun; varying float vFr; uniform float uFun; uniform vec4 uBanda[16];\n#ifndef USE_BATCHING\nattribute float aFun;\n#endif\n";
    var GLSL_FUN_M = "\n float ot_c;\n#ifdef USE_BATCHING_COLOR\n ot_c = floor((1.0 - getBatchingColor(getIndirectIndex(gl_DrawID)).a) * 2.0 + 0.5);\n#elif defined( USE_BATCHING )\n ot_c = 0.0;\n#else\n ot_c = aFun;\n#endif\n" +
      " float ot_s = floor(ot_c / 3.0 + 0.01); vFun = ot_c - 3.0 * ot_s; int ot_si = int(ot_s + 0.5);\n" +
      " vFr = ot_si == 0 ? uFun : dot(uBanda[ot_si / 4], vec4(equal(ivec4(0, 1, 2, 3), ivec4(ot_si - (ot_si / 4) * 4))));\n";
    var GLSL_FUN_F = "varying float vFun; varying float vFr;\nfloat ot_ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }\n";
    var uBanda = { value: [] }; for (var ib = 0; ib < 16; ib++) uBanda.value.push(new THREE.Vector4(1, 1, 1, 1));
    function parcheFundido(sh) {
      sh.uniforms.uFun = uFun; sh.uniforms.uBanda = uBanda;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + GLSL_FUN_V).replace("#include <begin_vertex>", "#include <begin_vertex>" + GLSL_FUN_M);
      sh.fragmentShader = sh.fragmentShader.replace("void main() {", GLSL_FUN_F + "void main() {\n if (vFun > 0.5) { float ot_d = ot_ign(gl_FragCoord.xy); if (vFun < 1.5 ? ot_d >= vFr : ot_d < vFr) discard; }");
    }
    function parcheLuz(sh) {
      parcheTiempo(sh, false);   // sombra de nubes y escarcha (15_tiempo) y color por instancia en sRGB (03_escena)
      // la sombra de nubes, en la posición del mundo (cada pieza va por lotes o instanciada: position.xz es la local)
      sh.vertexShader = sh.vertexShader.replace("vSomb = ot_sombra(position.xz);", "vec4 ot_w = vec4(transformed, 1.0);\n#ifdef USE_BATCHING\n ot_w = batchingMatrix * ot_w;\n#endif\n#ifdef USE_INSTANCING\n ot_w = instanceMatrix * ot_w;\n#endif\n vSomb = ot_sombra((modelMatrix * ot_w).xz);")
        // el color por instancia de las mallas por lotes también está escrito en sRGB (colorVertSRGB solo atiende a USE_COLOR y USE_INSTANCING_COLOR)
        .replace("#include <color_vertex>", "#include <color_vertex>\n#if defined( USE_BATCHING_COLOR ) && ! defined( USE_COLOR ) && ! defined( USE_INSTANCING_COLOR )\n vColor.rgb = ot_lin(vColor.rgb);\n#endif");
    }
    function parcheGen(m) {
      if (m.isMeshDepthMaterial) { M.encadena(m, parcheFundido, "gen-fundido"); return; }
      if (m.color) m.color.convertSRGBToLinear();   // el número de la referencia es un color «tal como se ve» (sRGB): el convenio del motor
      M.encadena(m, function (sh) { parcheLuz(sh); parcheFundido(sh); }, "gen-luz-fundido");
    }
    function profundidad() { var d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); M.encadena(d, parcheFundido, "gen-fundido"); return d; }
    // la entrada del generador para un olivo del registro: semilla guardada o su id; parámetros medidos (copas_param) o h y r8 × FACTOR_R8_GEN
    function entrada(c) {
      var raw = D.copas[c.i], id = D.copas_id ? D.copas_id[c.i] : -1;
      var s = M.semillaDeCopa(raw, id, D.centro_utm, D.copas_semilla ? D.copas_semilla[c.i] : undefined) || { semilla: c.i + 1, provisional: true };
      var p = parametrosDe(c);
      return { tipo: p.tipo, parametros: p.parametros, epoca: epoca(), semilla: s.semilla, provisional: s.provisional };
    }
    // LA fuente de la copa y la altura de un olivo (decisión 81, ADR-0022 §1): las del generador (copas_param si las hay; si no, h y 2 × r8 medio ×
    // FACTOR_R8_GEN, acotadas como en el constructor). El propio se genera con ellas (entrada) y la variante y el impostor se estiran a ellas
    // (matrizDe): el mismo olivo tiene la misma anchura y altura en todos los escalones. Se guarda en el olivo (no cambia con la época ni el nivel).
    function parametrosDe(c) {
      if (c.pgen && c.pgen.f === FACTOR_R8_GEN) return c.pgen.p;
      var raw = D.copas[c.i] || [c.x, c.y, c.h, c.perfil], p = M.parametrosDeCopa(raw, D.copas_param ? D.copas_param[c.i] : null, "centenario3", { factorR8: FACTOR_R8_GEN });
      c.pgen = { f: FACTOR_R8_GEN, p: p }; return p;
    }
    function topeCacheMem() {
      var nv = typeof navigator !== "undefined" ? navigator : {}, movil = /Mobi|Android|iPhone|iPad|OculusBrowser|Quest/i.test(nv.userAgent || "");
      return VRP.on || movil || (nv.deviceMemory && nv.deviceMemory <= 4) ? 60 : 150;
    }
    // una receta: de la caché si está (memoria al instante; disco, sin bloquear) y, si no, se calcula (trabajador o cola propia) y se guarda en ella
    // (una variante que está en el manifiesto, antes de calcularse, se descarga horneada; si la descarga falla en algo, se calcula y se cuenta el fallo)
    function pide(clave, e, niv, prio, variante) {
      if (recetas[clave] || pidiendo[clave] || nPidiendo >= 2) return;
      var e2 = { tipo: e.tipo, parametros: e.parametros, epoca: e.epoca, semilla: e.semilla }, ck = M.claveReceta(e2, niv), r0 = cache ? cache.mem(ck) : null;
      if (r0) { recetas[clave] = r0; if (variante) horn.cache++; return; }
      pidiendo[clave] = true; nPidiendo++;
      var llega = function (r) { delete pidiendo[clave]; nPidiendo--; recetas[clave] = r; };
      var hecha = function (r) { llega(r); if (cache) cache.pon(ck, r); };
      var calculada = function (r) { if (variante) horn.calculadas++; else horn.propios++; hecha(r); };
      var calcula = function () {
        if (fabrica) { fabrica.receta(e2, niv).then(calculada, function (err) { delete pidiendo[clave]; nPidiendo--; motivo = String(err); }); return; }
        encola("G" + clave, prio, seguro((function* () { var r = yield* M.recetaG(e2); if (niv !== "E0") r = yield* M.aNivelG(r, niv); return r; })()), function (r) { if (r) calculada(r); else { delete pidiendo[clave]; nPidiendo--; } });
      };
      var fila = variante && HORNEADO ? filaDe(e2, niv) : null;
      var trae = !fila ? calcula : function () {
        descarga(fila, ck, niv).then(function (r) { horn.horneadas++; hecha(r); }, function (err) { horn.fallos++; horn.ultimoFallo = String(err && err.message || err).slice(0, 60); calcula(); });
      };
      if (cache && cache.estado().enDisco) cache.lee(ck).then(function (r) { if (r) { if (variante) horn.cache++; llega(r); } else trae(); }, trae); else trae();
    }
    // la transformación de cada árbol: su sitio, la exageración vertical y, en las variantes, el estirado a la copa y la altura medidas
    function matrizDe(c, r, variante) {
      var gz = suelo(c.x, c.y) * exag, sx = r.escala[0], sy = r.escala[1], sz = r.escala[2];
      if (variante) {   // a la copa y la altura del propio (parametrosDe); lo que no se sepa, a las de la receta
        var P = parametrosDe(c).parametros, k = P.copa > 0 ? P.copa / r.medidas.copa_m : 1, ky = P.altura > 0 ? P.altura / r.medidas.altura_m : 1;
        sx *= k; sz *= k; sy *= ky;
      }
      return new THREE.Matrix4().makeScale(sx, sy * exag, sz).setPosition(c.x, gz, -c.y);
    }
    function tri(r) { return r ? M.triangulosNivel(r) : 0; }
    // lo que cuesta de verdad por fotograma: sus triángulos más los de la pasada de sombras (todo proyecta sombra salvo las olivas y los puntos).
    // Con ?olivos=escalera, la pasada solo se cobra si existe: el motor no activa renderer.shadowMap (O8c lo comprobó con renderer.info: ver
    // doc/sistema/MEDIDAS.md) y entonces cuesta sus triángulos. ?olivos=gen sigue cobrándola (no cambia lo que dibuja).
    function sombras() { return !ESCALERA || (typeof renderer !== "undefined" && !!renderer && !!renderer.shadowMap && !!renderer.shadowMap.enabled); }
    function costo(r) {
      if (!r) return 0;
      var t = tri(r), ol = 0;
      if (!sombras()) return t;
      r.piezas.forEach(function (z) { if (z.rol === "olivas" && z.clase === "instancias") ol += z.n * (z.geo === "octa" ? 8 : 20); });
      return 2 * t - ol;
    }
    var ESTIM_ESC = { E0: 105000, E1: 25000, E2: 11000, E2VR: 11000 };   // escalera, sin receta aún: los triángulos medidos (centenario3 semilla 7; E1/E2 con tarjetas, O9b) redondeados hacia arriba
    function estim(niv) { return ESCALERA ? ESTIM_ESC[niv] * (sombras() ? 2 : 1) : ESTIM[niv]; }

    // ---- reparte el presupuesto: lo llama el reparto de 07b_arboles.reclasifica con el foco (fx, fz) y el tope de triángulos del aparato
    function actualiza(fx, fz, tope, olivos, escala, retener) {
      if (estado !== "activo") return NADA;
      if (ESCALERA) return actualizaEscalera(fx, fz, tope, olivos, escala, retener);
      // lo que se observa (el foco: el punto de la órbita, o quien pasea), y solo si la cámara está cerca de él: desde lejos no se genera nada
      var cam = camera.position, amplia = Math.max(1, Math.sqrt(escala || 1)), lejos = Math.hypot(cam.x - fx, cam.z - fz, Math.max(0, cam.y - suelo(fx, -fz) * exag)) > 150 * amplia;   // con el aparato holgado (escala de 07b > 1) se genera desde más lejos: hasta ~240 m
      var pres = tope * FRACCION, vr = VRP.on, nivV = vr ? "E2VR" : "E2";
      var cand = [];
      if (!lejos) for (var i = 0; i < olivos.length; i++) { var c = olivos[i], d = Math.hypot(c.x - fx, -c.y - fz); if (d < RADIO_CAND * amplia) cand.push({ c: c, d: d }); }
      cand.sort(function (a, b) { return a.d - b.d; }); if (cand.length > 80) cand.length = 80;
      // histéresis (paseando, el foco se mueve a cada paso): un olivo propio del plan anterior se queda, con su MISMO nivel, mientras siga a menos de la
      // distancia del más lejano de aquel plan más MARGEN m; así su receta llega a usarse en vez de pedirse otra a cada metro. Los nuevos entran detrás
      var antes = {}, dAntes = 0, nuevoPlan = [], usado = 0, propios = true, nVar = 0, hayE0 = false, nProp = 0;
      plan.forEach(function (p) { if (p.propio) { antes[p.c.i] = p; dAntes = Math.max(dAntes, p.d); } });
      cand.forEach(function (x) {
        var a = antes[x.c.i]; if (!a || x.d > dAntes + MARGEN || nProp >= MAX_PROPIOS) return;
        var t = recetas[a.clave] ? costo(recetas[a.clave]) : ESTIM[a.niv]; if (usado + t > pres) return;
        nuevoPlan.push({ c: x.c, d: x.d, clave: a.clave, niv: a.niv, propio: true }); usado += t; nProp++; x.puesto = true; if (a.niv === "E0") hayE0 = true;
      });
      for (var k = 0; k < cand.length; k++) {
        var x = cand[k], e = null;
        if (x.puesto) continue;
        if (propios && nProp < MAX_PROPIOS) {
          var niveles = !hayE0 ? ["E0", "E1"] : ["E1"], hecho = false;
          for (var q = 0; q < niveles.length && !hecho; q++) {
            var clave = "p" + x.c.i + ":" + niveles[q], t = recetas[clave] ? costo(recetas[clave]) : ESTIM[niveles[q]];
            if (usado + t <= pres) { nuevoPlan.push({ c: x.c, d: x.d, clave: clave, niv: niveles[q], propio: true }); usado += t; hecho = true; nProp++; if (niveles[q] === "E0") hayE0 = true; }
          }
          if (hecho) continue;
          propios = false;
        }
        if (nVar >= MAX_VAR) break;
        var cv = "v" + (x.c.i % (varSem || SEM_VAR).length) + ":" + nivV, tv = recetas[cv] ? costo(recetas[cv]) : ESTIM[nivV];
        if (usado + tv > pres) break;
        nuevoPlan.push({ c: x.c, d: x.d, clave: cv, niv: nivV, propio: false }); usado += tv; nVar++;
      }
      nuevoPlan.sort(function (a, b) { return a.d - b.d; });
      plan = nuevoPlan;
      // pedir lo que falta (lo más cercano primero; las variantes, una vez cada una)
      plan.forEach(function (p) {
        if (recetas[p.clave]) return;
        if (p.propio) { var e2 = entrada(p.c); p.provisional = e2.provisional; pide(p.clave, e2, p.niv, p.d); }
        else {   // los tipos y semillas de las variantes: los del manifiesto si lo hay; si no, centenario3 con SEM_VAR
          var jv = Number(p.clave.slice(1, p.clave.indexOf(":"))), sv = varSem ? varSem[jv] : { tipo: "centenario3", semilla: SEM_VAR[jv] };
          pide(p.clave, { tipo: sv.tipo, epoca: epoca(), semilla: sv.semilla }, p.niv, p.d + 200, true);
        }
      });
      // lo que ya se puede dibujar; si cambia, se rehace el lote (a rebanadas, por la cola propia)
      // cada receta lista entra ya (lote incremental); si la de su nivel aún no está pero sí la del otro nivel de ese olivo, se dibuja esa mientras
      var listosAhora = [];
      plan.forEach(function (p) {
        if (recetas[p.clave]) { listosAhora.push(p); return; }
        var otra = p.propio ? "p" + p.c.i + ":" + (p.niv === "E0" ? "E1" : "E0") : null;
        if (otra && recetas[otra]) listosAhora.push({ c: p.c, d: p.d, clave: otra, niv: p.niv === "E0" ? "E1" : "E0", propio: true, provisional: p.provisional });
      });
      var cl = exag + "|" + listosAhora.map(function (p) { return p.c.i + "=" + p.clave; }).join(",");
      if (cl !== claveLote && !hay("Glote") && !fundido) {
        var fija = listosAhora.slice(), items = elementos(fija);
        encola("Glote", -1, seguro(construyeG(items)), function (g) { if (g) colocaLote(g, fija, items, cl); });
      }
      return { radio: fundido ? Math.min(R, fundido.Rviejo) : R, tri: triGen, tiene: tiene };
    }
    // ---- la escalera (?olivos=escalera): todo el presupuesto que da 07b (ya sin los lejanos), el reparto de Escalera.planifica por alto en píxeles
    // (O9c) y, si retener (aún no hay lejanos), lo que sale del 3D se queda en el lote. ?olivosPx=E0,E1,E2 cambia los umbrales de partida (px de alto;
    // para afinarlos en aparato, O9d) y ?olivosBanda=m la media banda del fundido (0: sin banda, salto en la frontera con el fundido por tiempo).
    var estEsc = {}, reparto = { propios: 0, variantes: 0, usado: 0, pres: 0 }, prePide = {}, ranuraDe = {}, bandas = {}, lejRanura = {}, v2 = null;
    var mU = /[?&]olivosPx=([0-9.]+),([0-9.]+),([0-9.]+)/.exec(location.search), UMB = mU ? [Number(mU[1]), Number(mU[2]), Number(mU[3])] : Escalera.UMBRALES;
    var mB = /[?&]olivosBanda=([0-9.]+)/.exec(location.search), BANDA = mB ? Math.min(5, Number(mB[1])) : Escalera.BANDA, PRE = 6, MAX_PRE = 2;
    var HIST_E = Escalera.HIST, FR_E0 = Escalera.FR_E0_VR;
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
    function pideVariante(j, niv, prio) {
      var sv = varSem ? varSem[j] : { tipo: "centenario3", semilla: SEM_VAR[j] };
      pide("v" + j + ":" + niv, { tipo: sv.tipo, epoca: epoca(), semilla: sv.semilla }, niv, prio, true);
    }
    // el ojo con el que se miden los píxeles: paseando, quien pasea (en el plano: girar en el sitio no cambia nada); si no, la cámara
    function ojoAhora() {
      if (typeof paseando !== "undefined" && paseando && typeof pp !== "undefined") return { x: pp.x, z: -pp.y, plano: true };
      var c = camera.position; return { x: c.x, y: c.y, z: c.z, plano: false };
    }
    function distOjo(c, o) {
      var dx = c.x - o.x, dz = -c.y - o.z; if (o.plano) return Math.hypot(dx, dz);
      return Math.hypot(dx, dz, Math.max(0, o.y - (c.gz !== undefined ? c.gz : suelo(c.x, c.y)) * exag));
    }
    // px por (metro de alto / metro de distancia): alto del búfer · P[5] / 2 (P[5] = 1 / tan(fov/2)); en VR, el de un ojo; sin cámara, 1080 p a 42°
    function kPixeles() {
      if (typeof renderer === "undefined" || !renderer) return Escalera.K_PX;
      if (renderer.xr && renderer.xr.isPresenting) {
        var xc = renderer.xr.getCamera(), c0 = xc && xc.cameras && xc.cameras[0];
        if (c0 && c0.viewport && c0.viewport.w > 0) return c0.viewport.w * c0.projectionMatrix.elements[5] / 2;
      }
      if (!renderer.getDrawingBufferSize || !camera.projectionMatrix) return Escalera.K_PX;
      v2 = v2 || new THREE.Vector2(); renderer.getDrawingBufferSize(v2);
      return v2.y > 0 ? v2.y * camera.projectionMatrix.elements[5] / 2 : Escalera.K_PX;
    }
    function altoDe(c) { var P = parametrosDe(c).parametros; return (P.altura > 0 ? P.altura : Math.max(1, c.h || 4)) * exag; }
    function actualizaEscalera(fx, fz, tope, olivos, escala, retener) {
      var cam = camera.position, amplia = Math.max(1, Math.sqrt(escala || 1)), lejos = Math.hypot(cam.x - fx, cam.z - fz, Math.max(0, cam.y - suelo(fx, -fz) * exag)) > 150 * amplia;
      var vr = VRP.on, NIV = ["E0", "E1", vr ? "E2VR" : "E2"], nv = nVar(), ojo = ojoAhora(), kPx = kPixeles(), cand = [];
      if (!lejos) for (var i = 0; i < olivos.length; i++) { var c = olivos[i]; if (Math.hypot(c.x - fx, -c.y - fz) < RADIO_CAND * amplia) cand.push({ c: c, d: distOjo(c, ojo) }); }
      cand.sort(function (a, b) { return a.d - b.d; }); if (cand.length > 120) cand.length = 120;
      var r = Escalera.planifica(cand, estEsc, { pres: tope, vr: vr, ahora: performance.now() / 1000, kPx: kPx, umbrales: UMB, banda: BANDA, hist: HIST_E, frE0Vr: FR_E0,
        maxPropios: vr && MAX_PROPIOS_VR !== null ? MAX_PROPIOS_VR : MAX_PROPIOS, maxVar: MAX_VAR, alto: altoDe,
        costo: function (cl, niv) { return recetas[cl] ? costo(recetas[cl]) : estim(niv); },
        clavePropia: function (c, niv) { return "p" + c.i + ":" + niv; }, claveVar: function (c) { return "v" + (c.i % nv) + ":" + NIV[2]; } });
      plan = r.plan; reparto = { propios: r.propios, variantes: r.variantes, usado: Math.round(r.usado), pres: Math.round(tope), s: +r.s.toFixed(3), enBanda: r.enBanda, kPx: Math.round(kPx), umbrales: UMB, banda: BANDA };
      // lo que falta se pide por prioridad (como mucho 2 a la vez): los propios por su distancia; las variantes E2 de los lejanos (07ac), siempre
      // aunque no haya nada en 3D, justo después de los propios de menos de 50 m (sin ellas, de lejos no hay olivos: en SwiftShader, sin trabajador
      // y detrás de los propios, no llegaron en 12 min en el banco de O8c); las variantes del plan, detrás; y, detrás de todo, el escalón vecino de
      // un olivo a menos de PRE m de su banda (como mucho MAX_PRE), para que esté cuando entre en ella
      var pedir = [], pre = {}, nPre = 0;
      plan.forEach(function (p) {
        if (recetas[p.clave]) return;
        if (p.propio) pedir.push({ prio: p.d, f: function () { var e2 = entrada(p.c); p.provisional = e2.provisional; pide(p.clave, e2, p.niv, p.d); } });
        else pedir.push({ prio: p.d + 200, f: function () { pideVariante(Number(p.clave.slice(1, p.clave.indexOf(":"))), p.niv, p.d + 200); } });
      });
      for (var j = 0; j < nv; j++) (function (j) { if (!recetas["v" + j + ":E2"]) pedir.push({ prio: 50 + j, f: function () { pideVariante(j, "E2", 50 + j); } }); })(j);
      plan.forEach(function (p) {
        if (p.rol !== 0 || !p.F) return;
        var F = p.F, n = NIV.indexOf(p.niv), quiere = [];
        if (n >= 1 && F.D[n - 1] > 0 && p.d < F.D[n - 1] + F.b[n - 1] + PRE) quiere.push(NIV[n - 1]);
        if (n === 0 && p.d > F.D[0] - F.b[0] - PRE) quiere.push("E1");
        quiere.forEach(function (niv) {
          var cl = "p" + p.c.i + ":" + niv; pre[cl] = true;
          if (!recetas[cl] && nPre < MAX_PRE) { nPre++; pedir.push({ prio: p.d + 300, f: function () { var e2 = entrada(p.c); pide(cl, e2, niv, p.d + 300); } }); }
        });
      });
      prePide = pre;
      pedir.sort(function (a, b) { return a.prio - b.prio; }).forEach(function (x) { x.f(); });
      // lo que ya se puede dibujar, por olivo: sus partes si están todas; si en una banda solo está una, esa entera; si no hay ninguna, el otro
      // nivel propio de ese olivo o lo que tenía en el lote. Sin lejanos todavía (retener), lo de la banda E2|lejano va entero
      var antes = {}, porOlivo = {}, orden = [], listosAhora = [];
      selLote.forEach(function (p) { (antes[p.c.i] = antes[p.c.i] || []).push(p); });
      plan.forEach(function (p) { if (!porOlivo[p.c.i]) { porOlivo[p.c.i] = []; orden.push(p.c.i); } porOlivo[p.c.i].push(p); });
      orden.forEach(function (i) {
        var ps = porOlivo[i], hay = ps.filter(function (p) { return recetas[p.clave]; });
        if (hay.length === ps.length) { ps.forEach(function (p) { listosAhora.push(retener && p.lej ? conRol(p, 0) : p); }); return; }
        if (hay.length) { listosAhora.push(conRol(hay[0], 0)); return; }
        var p = ps[0], otra = p.propio ? "p" + i + ":" + (p.niv === "E0" ? "E1" : "E0") : null;
        if (otra && recetas[otra]) { listosAhora.push(Object.assign(conRol(p, 0), { clave: otra, niv: p.niv === "E0" ? "E1" : "E0" })); return; }
        (antes[i] || []).forEach(function (a) { if (recetas[a.clave]) listosAhora.push(Object.assign({}, a, { d: p.d })); });
      });
      if (retener) selLote.forEach(function (p) { if (!porOlivo[p.c.i] && recetas[p.clave]) listosAhora.push(p); });   // sin lejanos todavía: nada se queda sin dibujar
      listosAhora.sort(function (a, b) { return a.d - b.d || (a.rol || 0) - (b.rol || 0); });
      ranuras(listosAhora);
      var cl = exag + "|" + listosAhora.map(function (p) { return p.c.i + "=" + p.clave + ":" + (p.rol || 0) + ":" + (p.ranura || 0); }).join(",");
      if (cl !== claveLote && !hay("Glote") && !fundido) {
        var fija = listosAhora.slice(), items = elementos(fija);
        encola("Glote", -1, seguro(construyeG(items)), function (g) { if (g) colocaLote(g, fija, items, cl); });
      }
      return { radio: fundido ? Math.min(R, fundido.Rviejo) : R, tri: triGen, tiene: tiene, fase: fase, ranura: ranuraLej };
    }
    function conRol(p, rol) { var q = Object.assign({}, p); q.rol = rol; if (!rol) { q.banda = null; q.ranura = 0; } return q; }
    // la ranura de cada olivo con partes en banda (1-63): la misma mientras siga en banda (en el lote colocado o en el que se monta), y se libera al
    // colocar un lote que ya no la usa (colocaLote)
    function ranuras(lista) {
      var usadas = {}; Object.keys(ranuraDe).forEach(function (i) { usadas[ranuraDe[i]] = true; });
      lista.forEach(function (p) {
        if (!(p.rol > 0)) { p.ranura = 0; return; }
        var i = p.c.i;
        if (!ranuraDe[i]) { for (var s = 1; s < 64; s++) if (!usadas[s]) { ranuraDe[i] = s; usadas[s] = true; break; } }
        if (!ranuraDe[i]) { p.rol = 0; p.ranura = 0; p.banda = null; return; }   // sin ranuras libres (más de 63 olivos en banda): entero
        p.ranura = ranuraDe[i];
      });
    }
    // durante un fundido, el dibujo de siempre de lo que entra sigue dibujándose (y el de lo que sale ya vuelve): tiene() solo si ya estaba antes
    function tiene(i) { return !!listos[i] && (!fundido || !!fundido.viejos[i]); }
    /** escalera: cómo está el olivo i en el lote, para el tramado complementario de los lejanos (07ac): 0 no está en 3D, 1 está (y no entra), 2 entra
     *  con fundido o está en la banda E2|lejano (el lejano sale con el tramado complementario), 3 sale con fundido (el lejano entra) */
    function fase(i) {
      if (lejRanura[i]) return 2;
      var en = !!listos[i]; if (!fundido) return en ? 1 : 0;
      var v = !!fundido.viejos[i]; return en ? (v ? 1 : 2) : v && saliendo[i] ? 3 : 0;
    }
    function ranuraLej(i) { return lejRanura[i] || 0; }
    var saliendo = {};
    // lo que va en el lote nuevo y su código (rol + 3 · ranura): en banda, el suyo; entero, 0 si ya estaba (entero o en banda) y 1 si entra con el
    // fundido por tiempo; y, al final, lo entero del lote anterior que se va (2). Lo que estaba en banda y se va, se va sin fundido: al salir de la
    // banda su peso ya es 0
    function elementos(fija) {
      var antes = {}, ahora = {}, out = [];
      selLote.forEach(function (p) { (antes[p.c.i] = antes[p.c.i] || {})[p.clave] = true; });
      fija.forEach(function (p) {
        (ahora[p.c.i] = ahora[p.c.i] || {})[p.clave] = true;
        out.push({ p: p, cod: p.rol > 0 ? p.rol + 3 * p.ranura : FUNDIDO > 0 && !(antes[p.c.i] && antes[p.c.i][p.clave]) ? 1 : 0 });
      });
      if (FUNDIDO > 0) selLote.forEach(function (p) { if (!(p.rol > 0) && !(ahora[p.c.i] && ahora[p.c.i][p.clave]) && recetas[p.clave]) out.push({ p: p, cod: 2 }); });
      return out;
    }
    // la cola propia: como la del motor (menor prio = antes; cada next() es una rebanada), pero solo con lo de los generados y con su propio tope de ms
    function encola(clave, prio, gen, fin) {
      for (var i = 0; i < trabajos.length; i++) if (trabajos[i].clave === clave) { trabajos[i].prio = prio; return; }
      trabajos.push({ clave: clave, prio: prio, gen: gen, fin: fin });
    }
    function hay(clave) { return trabajos.some(function (t) { return t.clave === clave; }); }
    // lo que falta para que el lote sea el del plan: trabajos de la cola propia, recetas en el trabajador, árboles del plan sin receta o fuera del lote y
    // el fundido en curso (lo esperan las pruebas: __g.pendientes() de 27_debug)
    function pendientes() {
      if (estado !== "activo") return 0;
      var n = trabajos.length + nPidiendo + (fundido ? 1 : 0);
      plan.forEach(function (p) { if (!recetas[p.clave] || !enLote[p.c.i] || !enLote[p.c.i][p.clave]) n++; });
      return n;
    }
    function corre(ms) {
      var t0 = performance.now();
      while (trabajos.length && performance.now() - t0 < ms) {
        var bi = 0; for (var i = 1; i < trabajos.length; i++) if (trabajos[i].prio < trabajos[bi].prio) bi = i;
        var j = trabajos[bi], r = j.gen.next();
        if (r.done) { trabajos.splice(bi, 1); if (j.fin) j.fin(r.value); }
      }
      gastado = performance.now() - t0;
    }
    // cada fotograma (lo llama 07b_arboles.actualiza con su parte de ms): avanza la cola propia y el fundido; true cuando el reparto de niveles debe
    // rehacerse (lote nuevo o fin del fundido)
    function paso(dt, ms) {
      gastado = 0; if (trabajos.length) corre(Math.max(0.5, ms || 0));
      if (fundido) {
        fundido.t += Math.min(dt, 0.1); uFun.value = Math.min(1, fundido.t / FUNDIDO);
        if (fundido.t >= FUNDIDO) { terminaFundido(); avisa = true; }
      }
      pesaBandas();
      var a = avisa; avisa = false; return a;
    }
    // O9c: el peso de cada olivo en banda (el de su escalón más fino), con la distancia de ESTE fotograma a la frontera que tenía al montar el lote
    function pesaBandas() {
      var ks = Object.keys(bandas); if (!ks.length) return;
      var o = ojoAhora();
      ks.forEach(function (s) {
        var B = bandas[s], d = distOjo(B.c, o), f = B.b > 0 ? Math.min(1, Math.max(0, (B.D + B.b - d) / (2 * B.b))) : d <= B.D ? 1 : 0;
        uBanda.value[s >> 2].setComponent(s & 3, f);
      });
    }
    function terminaFundido() {   // lo que salía se oculta de verdad (deja de costar) y el lote queda quieto
      fundido = null; uFun.value = 1;
      var S = lote && lote.userData.salen; if (!S) return;
      Object.keys(S.B).forEach(function (b) { S.B[b].ids.forEach(function (id) { S.B[b].m.setVisibleAt(id, false); }); });
      Object.keys(S.I).forEach(function (k) { S.I[k].m.count = S.I[k].n; });
      if (S.P) S.P.m.geometry.setDrawRange(0, S.P.n);
      lote.userData.salen = null; info.saliendo = 0; info.triSaliendo = 0; saliendo = {};
    }
    function* seguro(gen) {   // si algo falla al montar el lote, Generados se apaga (y lo dice) sin parar el fotograma del motor
      try { return yield* gen; } catch (e) { estado = "sin"; motivo = String(e && e.message || e); console.warn("olivos generados: " + motivo); return null; }
    }
    function colocaLote(g, sel, items, cl) {
      if (lote) { grupo.remove(lote); libera(lote); }   // lo que sale del lote anterior ya va dentro del nuevo
      var viejos = {}, Rviejo = R, entran = 0, salen = 0, triSalen = 0;
      selLote.forEach(function (p) { viejos[p.c.i] = true; });
      lote = g; grupo.add(g); claveLote = cl; listos = {}; enLote = {}; R = 0; triGen = 0; costoGen = 0;
      var nArb = 0, conRanura = {}; bandas = {}; lejRanura = {};
      sel.forEach(function (p) {
        if (!listos[p.c.i]) { listos[p.c.i] = p; nArb++; }   // el primero de cada olivo: el más fino (lo que dice el rótulo)
        (enLote[p.c.i] = enLote[p.c.i] || {})[p.clave] = true;
        if (p.rol > 0 && p.ranura) { conRanura[p.c.i] = true; bandas[p.ranura] = { c: p.c, D: p.banda.D, b: p.banda.b }; if (p.lej) lejRanura[p.c.i] = p.ranura; }
        R = Math.max(R, p.d + 8); triGen += tri(recetas[p.clave]); costoGen += costo(recetas[p.clave]);
      });
      Object.keys(ranuraDe).forEach(function (i) { if (!conRanura[i]) delete ranuraDe[i]; });   // las ranuras que este lote ya no usa quedan libres
      pesaBandas();
      saliendo = {};
      items.forEach(function (x) { if (x.cod === 1) entran++; else if (x.cod === 2) { salen++; triSalen += tri(recetas[x.p.clave]); saliendo[x.p.c.i] = true; } });
      info = { llamadas: g.children.length, triangulos: triGen, costo: costoGen, arboles: nArb, enBanda: Object.keys(conRanura).length, propios: sel.filter(function (p) { return p.propio; }).length, entran: entran, saliendo: salen, triSaliendo: triSalen };
      if (ESCALERA) { info.niveles = { E0: 0, E1: 0, E2: 0, E2VR: 0 }; sel.forEach(function (p) { info.niveles[p.niv]++; }); }
      selLote = sel; avisa = true;
      if (entran + salen > 0) { fundido = { t: 0, viejos: viejos, Rviejo: Rviejo }; uFun.value = 0; } else { fundido = null; uFun.value = 1; }
      // las recetas que ya no se usan se sueltan (las variantes se quedan; las del lote colocado, hasta el siguiente: son lo que saldrá con fundido)
      var usadas = Object.assign({}, prePide); plan.forEach(function (p) { usadas[p.clave] = true; if (p.propio) { usadas["p" + p.c.i + ":E0"] = true; usadas["p" + p.c.i + ":E1"] = true; } }); sel.forEach(function (p) { usadas[p.clave] = true; });
      Object.keys(recetas).forEach(function (k) { if (k.charAt(0) === "p" && !usadas[k]) delete recetas[k]; });
    }
    function libera(g) {
      g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.isBatchedMesh || o.isInstancedMesh) o.dispose(); });
    }

    // ---- el lote: todo lo generado en pocas mallas compartidas (las olivas, sin índices: icosaedro y octaedro)
    var BARK = { corteza: 1, pies: 1, musgo: 1, raiz: 1, tutor: 1 }, TINTE = { musgo: [0.82, 0.8, 0.7], raiz: [1.05, 1.04, 1.02], tutor: [0.95, 0.85, 0.65] };
    function geoDe(atrib, indice, marcas) {
      var g = new THREE.BufferGeometry(), n = atrib.position.length / 3;
      g.setAttribute("position", new THREE.BufferAttribute(atrib.position, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(atrib.normal || new Float32Array(n * 3), 3));
      g.setAttribute("uv", new THREE.BufferAttribute(atrib.uv || new Float32Array(n * 2), 2));
      if (marcas) { g.setAttribute("aHueco", new THREE.BufferAttribute(atrib.aHueco || new Float32Array(n), 1)); g.setAttribute("aMuerta", new THREE.BufferAttribute(atrib.aMuerta || new Float32Array(n), 1)); }
      if (indice) g.setIndex(new THREE.BufferAttribute(indice, 1));
      return g;
    }
    // las mallas instanciadas de hoja: por material, salvo las dos tarjetas de E1/E2 (O9b), que comparten material y cambian de geometría
    var GEO_INST = { ramita0: "ramita", ramita1: "ramita", relleno: "relleno", tarjeta: "tarjeta", tarjetaO: "tarjetaO" };
    function claveInst(z) { return z.geo === "tarjeta" || z.geo === "tarjetaO" ? z.geo : z.mat; }
    function* construyeG(items) {
      var G = M.geos(), out = new THREE.Group(), m4 = new THREE.Matrix4(), mp = new THREE.Matrix4(), mi = new THREE.Matrix4(), col = new THREE.Vector4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
      var sel = items.map(function (x) { return x.p; }), cod = 0;   // el código de cada pieza va en el alfa de su color en las mallas por lotes (1 − código / 2)
      var salen = { B: {}, I: {}, P: null }, hay2 = items.some(function (x) { return x.cod === 2; });
      // 1) recuento para dar a cada malla su tamaño justo
      var cap = { corteza: { i: 0, v: 0, x: 0 }, muerta: { i: 0, v: 0, x: 0 }, olivas: { i: 0, v: 0, x: 0 } }, inst = { ramita0: 0, ramita1: 0, relleno: 0, tarjeta: 0, tarjetaO: 0 }, npuntos = 0, vistas = {};
      function cuenta(b, geoClave, atrib, indice, n) {
        if (!vistas[b + geoClave]) { vistas[b + geoClave] = true; cap[b].v += atrib.position.length / 3; cap[b].x += indice ? indice.length : 0; }
        cap[b].i += n;
      }
      sel.forEach(function (p, ip) {
        var r = recetas[p.clave];
        r.piezas.forEach(function (z, iz) {
          var gk = z.geo === "propia" ? p.clave + "#" + iz : z.geo;
          if (z.clase === "malla" && BARK[z.mat]) cuenta("corteza", gk, z.atrib, z.indice, 1);
          else if (z.clase === "malla" && z.mat === "muerta") cuenta("muerta", gk, z.atrib, z.indice, 1);
          else if (z.geo === "tocon") cuenta("corteza", "tocon", G.tocon.atrib, G.tocon.indice, z.n);
          else if (z.geo === "corte") cuenta("muerta", "corte", G.corte.atrib, G.corte.indice, z.n);
          else if (z.geo === "oliva" || z.geo === "octa") cuenta("olivas", z.geo, G[z.geo].atrib, G[z.geo].indice, z.n);
          else if (z.clase === "instancias" && inst[claveInst(z)] !== undefined) inst[claveInst(z)] += z.n;
          else if (z.clase === "puntos") npuntos += z.n;
        });
      });
      yield;
      // 2) las mallas
      var B = {}, geoId = {}, ix = { ramita0: 0, ramita1: 0, relleno: 0, tarjeta: 0, tarjetaO: 0 }, I = {}, pts = npuntos ? { p: new Float32Array(npuntos * 3), c: new Float32Array(npuntos * 3), f: new Float32Array(npuntos), n: 0 } : null;
      var matDe = { corteza: mats.pies, muerta: mats.muerta, olivas: mats.oliva };
      Object.keys(cap).forEach(function (b) {
        if (!cap[b].i) return;
        var bm = new THREE.BatchedMesh(cap[b].i, cap[b].v, cap[b].x, matDe[b]); bm.name = "gen-" + b; bm.castShadow = b !== "olivas"; bm.receiveShadow = b !== "olivas"; B[b] = bm; out.add(bm);   // las olivas no proyectan sombra: muchas y diminutas
        if (prof[b]) bm.customDepthMaterial = prof[b];   // la sombra con el mismo fundido (la misma profundidad que la de serie)
      });
      Object.keys(inst).forEach(function (k) {
        if (!inst[k]) return;
        var gk = GEO_INST[k], mk = k === "tarjetaO" ? "tarjeta" : k, g = geoDe(G[gk].atrib, G[gk].indice, false);   // las dos tarjetas (O9b) comparten material: atlas con y sin olivas
        g.setAttribute("aFun", new THREE.InstancedBufferAttribute(new Float32Array(inst[k]), 1));   // el código de fundido de cada instancia
        var im = new THREE.InstancedMesh(g, mats[mk], inst[k]); im.name = "gen-" + k; im.castShadow = true; im.receiveShadow = true; im.customDepthMaterial = mats[mk + "_sombra"];
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(inst[k] * 3), 3); I[k] = im; out.add(im);
      });
      function idGeo(b, gk, atrib, indice) { var k = b + gk; if (geoId[k] === undefined) geoId[k] = B[b].addGeometry(geoDe(atrib, indice, b === "corteza")); return geoId[k]; }
      function ponBatch(b, gid, m, rgb) {
        var id = B[b].addInstance(gid); B[b].setMatrixAt(id, m); col.set(rgb[0], rgb[1], rgb[2], 1 - cod / 2); B[b].setColorAt(id, col);
        if (cod === 2) (salen.B[b] || (salen.B[b] = { m: B[b], ids: [] })).ids.push(id);
      }
      for (var ip = 0; ip < sel.length; ip++) {
        var p = sel[ip], r = recetas[p.clave], T = matrizDe(p.c, r, !p.propio);
        cod = items[ip].cod;
        if (cod === 2 && !salen.marcado) {   // desde aquí, lo que sale (va al final): lo de antes en cada malla instanciada y en los puntos se queda al ocultarlo
          salen.marcado = true; Object.keys(I).forEach(function (k) { salen.I[k] = { m: I[k], n: ix[k] }; }); if (pts) salen.n0 = pts.n;
        }
        for (var iz = 0; iz < r.piezas.length; iz++) {
          var z = r.piezas[iz], gk = z.geo === "propia" ? p.clave + "#" + iz : z.geo;
          mp.compose(v.fromArray(z.pos), q.fromArray(z.rot), s3.fromArray(z.esc)); m4.multiplyMatrices(T, mp);
          if (z.clase === "malla" && (BARK[z.mat] || z.mat === "muerta")) { var b = BARK[z.mat] ? "corteza" : "muerta"; ponBatch(b, idGeo(b, gk, z.atrib, z.indice), m4, TINTE[z.mat] || [1, 1, 1]); continue; }
          if (z.clase === "puntos") { for (var k2 = 0; k2 < z.n; k2++) { v.fromArray(z.posiciones, k2 * 3).applyMatrix4(m4); pts.p.set([v.x, v.y, v.z], pts.n * 3); pts.c.set(z.colores.subarray(k2 * 3, k2 * 3 + 3), pts.n * 3); pts.f[pts.n] = cod; pts.n++; } continue; }
          if (z.clase !== "instancias") continue;
          var bb = z.geo === "tocon" ? "corteza" : z.geo === "corte" ? "muerta" : (z.geo === "oliva" || z.geo === "octa") ? "olivas" : null;
          var ki = claveInst(z), gid = bb ? idGeo(bb, z.geo, G[z.geo].atrib, G[z.geo].indice) : -1, im2 = bb ? null : I[ki];
          for (var k3 = 0; k3 < z.n; k3++) {
            mi.fromArray(z.matrices, k3 * 16); mi.premultiply(m4);
            var rgb = z.colores ? [z.colores[k3 * 3], z.colores[k3 * 3 + 1], z.colores[k3 * 3 + 2]] : z.geo === "corte" ? r.corte : [1, 1, 1];
            if (bb) ponBatch(bb, gid, mi, rgb);
            else if (im2) { var n3 = ix[ki]++; im2.setMatrixAt(n3, mi); im2.instanceColor.setXYZ(n3, rgb[0], rgb[1], rgb[2]); im2.geometry.attributes.aFun.array[n3] = cod; }
            if (k3 % 512 === 511) yield;
          }
        }
        yield;
      }
      Object.keys(I).forEach(function (k) { I[k].instanceMatrix.needsUpdate = true; I[k].instanceColor.needsUpdate = true; I[k].geometry.attributes.aFun.needsUpdate = true; I[k].computeBoundingSphere(); I[k].computeBoundingBox(); });
      // el recorte por frustum de las mallas por lotes: su esfera y su caja con TODAS las instancias ya puestas (no la de la primera geometría)
      Object.keys(B).forEach(function (b) { B[b].computeBoundingBox(); B[b].computeBoundingSphere(); });
      if (pts && pts.n) {
        var gp = new THREE.BufferGeometry(); gp.setAttribute("position", new THREE.BufferAttribute(pts.p, 3)); gp.setAttribute("color", new THREE.BufferAttribute(pts.c, 3)); gp.setAttribute("aFun", new THREE.BufferAttribute(pts.f, 1)); gp.computeBoundingSphere();
        var pm = new THREE.Points(gp, mats.puntos); pm.name = "gen-puntos"; out.add(pm);   // las olivas en puntos (E2), con su esfera de recorte de las posiciones ya en el lote (generados_motor.mjs comprueba que cubre todo)
        if (salen.marcado) salen.P = { m: pm, n: salen.n0 === undefined ? pts.n : salen.n0 };
      }
      out.userData.salen = hay2 ? salen : null;
      return out;
    }
    /** El rótulo de un olivo (decisión 34) si se dibuja generado: «forma ilustrativa con medidas del LiDAR» y, si su id no es del censo, «id provisional» */
    function rotulo(i) {
      var p = listos[i]; if (!p && !(ESCALERA && estado === "activo")) return null;   // con la escalera, todo olivo es del constructor: el que no está en 3D es «lejano»
      var id = D.copas_id ? D.copas_id[i] : -1, prov = !(id >= 0 && id < 2147483648);
      return p ? { forma: "ilustrativa con medidas del LiDAR", provisional: prov, niv: p.niv, variante: !p.propio } : { forma: "ilustrativa con medidas del LiDAR", provisional: prov, niv: "lejano", variante: true, lejano: true };
    }
    window.__olivosGen = function () {
      var k0 = Object.keys(listos)[0], p0 = k0 !== undefined ? listos[k0].c : null;   // un olivo generado ya dibujado
      return { primero: p0 ? { x: p0.x, y: p0.y, h: p0.h } : null, estado: estado, motivo: motivo, via: fabrica ? "trabajador" : "rebanadas", plan: plan.length, recetas: Object.keys(recetas).length, pidiendo: nPidiendo, trabajos: trabajos.length, radio: R, info: info,
        cache: cache ? cache.estado() : null,
        escalera: ESCALERA ? { reparto: reparto, sombras: sombras(), variantes: nVar() } : undefined,
        horneado: { estado: horn.estado, motivo: horn.motivo, epoca: M && mats ? epoca() : null, variantes: (varSem || SEM_VAR).length, horneadas: horn.horneadas, calculadas: horn.calculadas,
          fallos: horn.fallos, cache: horn.cache, propiosCalculados: horn.propios, ultimoFallo: horn.ultimoFallo }, fundido: { activo: !!fundido, avance: +uFun.value.toFixed(3), duracion: FUNDIDO } };
    };
    // _prueba: para pruebas/olivo/generados_motor.mjs (Node), no para el motor
    // para los lejanos de la escalera (07ac): la variante j en E2 (null si aún no está), su matriz en un olivo (la misma que en 3D), montarla para
    // hornear su silueta, y los parches de luz y de fundido (el mismo uFun: el tramado de los lejanos es el complementario del de los 3D)
    var paraLejanos = { uFun: uFun, nVariantes: nVar, variante: function (j) { return recetas["v" + j + ":E2"] || null; },
      matriz: function (c, r) { return matrizDe(c, r, true); }, monta: function (r) { return M.montaOlivo(THREE, r, mats); }, libera: function (g) { M.liberaOlivo(g); },
      parcheLuz: parcheLuz, parcheFundido: parcheFundido, constructor: function () { return M; }, dir: function () { return DIR; },
      impostor: filaImpostor };
    /** la fila de impostores (contratos/olivo-impostor.md, formato 1) de la época que se dibuja, solo si casa con las variantes que dibuja el motor:
     *  mismas variantes en el mismo orden (tipo, semilla) y cada `fuente` es la huella de su E2 en el manifiesto; si no, {motivo} */
    function filaImpostor() {
      if (!manif || !Array.isArray(manif.impostores) || !varSem || !M || !M.IMPOSTOR) return null;
      var ep = epoca(), f = manif.impostores.filter(function (x) { return x && x.epoca === ep; })[0];
      if (!f) return null;
      var no = M.validaFilaImpostor(f);
      if (!no.length && f.variantes.length !== varSem.length) no.push(f.variantes.length + " variantes en el impostor y " + varSem.length + " en el motor");
      if (!no.length) f.variantes.forEach(function (v, k) {
        var e2 = filaDe({ tipo: varSem[k].tipo, semilla: varSem[k].semilla, epoca: ep }, "E2");
        if (v.tipo !== varSem[k].tipo || v.semilla !== varSem[k].semilla || !e2 || e2.huella !== v.fuente) no.push("la variante " + k + " del impostor no es la E2 del motor");
      });
      return no.length ? { motivo: no.join("; ").slice(0, 120) } : f;
    }
    return { escalera: function () { return ESCALERA; }, lejanos: paraLejanos, activo: function () { return estado === "activo"; }, actualiza: actualiza, paso: paso, gastado: function () { return gastado; }, pendientes: pendientes, rotulo: rotulo, estado: function () { return estado; },
      _prueba: { fecha: function (f) { fechaPrueba = f; }, mats: function () { return mats; }, prof: function () { return prof; }, uFun: uFun, lote: function () { return lote; }, tiene: tiene, fase: fase, listos: function () { return listos; }, saliendo: function () { return saliendo; }, recetas: function () { return recetas; },
        uBanda: uBanda, bandas: function () { return bandas; }, lejRanura: function () { return lejRanura; }, enLote: function () { return enLote; }, selLote: function () { return selLote; } } };
  })();

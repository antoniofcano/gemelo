// Las hazas en el mundo (F1, el «3c»; MU5-n, A3-7b1: antes apps/web/motor/13b_hazas.js, que queda como talón): sus límites (los dibuja sobre el suelo el componente
// «lindes-hazas», lindes.ts, con Hazas.lindes() y el evento «hazas:cambia») y, al tocar una, su ficha pública (ADR-0014, contratos/haza.schema.json). Es del EXTERIOR: la
// linde son coordenadas UTM de la finca, el toque va contra el relieve del exterior y la ficha cuelga de las entidades del exterior. Componente «hazas-mundo» de los mundos
// ["exterior"], con un libera() que suelta de verdad: la entidad «haza» de Entidades, la tecla H, la petición de la lista y las de las fichas en vuelo (AbortController),
// la caché y los avisos pendientes. HazasPuro (validación del GeoJSON, UTM→local, punto en haza, filas de la ficha) no tiene dependencias y sale aparte.
// Código movido tal cual (solo se tipan parámetros y variables); del legado recibe por argumento lo que necesita: THREE, D, el Bus, Entidades y Usables (02e), la cámara,
// Estado, el suelo, el objetivo de la cámara orbital y el paseante; «paseando» (que 12_paseo reescribe) entra por getter.
// Solo habla con la api cuando la página la sirve el servidor (D.base empieza por /teselas/) o con ?api=<prefijo> relativo del mismo origen (pruebas): sin api no pide nada, no crea
// nada y no escribe en la consola. La linde de cada haza la dibuja la oficina: es un límite de gestión, no un deslinde. Nunca se pide ni se muestra el titular.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import { creaSoltador } from "../../nucleo/soltador.ts";
import type { T } from "../comun/tipos.ts";

export const ID_HAZAS = "hazas-mundo";

/** Lo que el talón de 13b le da: THREE, el índice de la finca (D), el Bus, Entidades y Usables (02e), la cámara y Estado (03), el suelo (02), el objetivo de la órbita (09) y el
 *  paseante (12); por getter, «paseando» (12_paseo lo reescribe). Para las pruebas: la ventana, la ubicación y el fetch, que por defecto son los de la página. */
export interface DepsHazas {
  THREE: T; D: T; Bus: T; Entidades: T; Usables: T; camera: T; Estado: T; suelo: (x: number, y: number) => number; objetivo: T; pp: T; readonly paseando: boolean;
  ventana?: T; ubicacion?: T; fetch?: T;
}

  // [puro:inicio] — validación del GeoJSON, coordenadas, punto en haza y filas de la ficha: sin THREE ni DOM; lo evalúa en Node pruebas/guardianes/hazas.test.js
export var HazasPuro: T = (function () {
    var MAX_HAZAS = 2000, MAX_VERT = 200000, CLAVES_COL = ["type", "srs", "features"], CLAVES_F = ["type", "id", "geometry", "properties"], CLAVES_P = ["codigo", "nombre", "finca", "es_mia"];
    function esObj(o?: T) { return o !== null && typeof o === "object" && !Array.isArray(o); }
    function soloClaves(o?: T, permitidas?: T, req?: T) {   // como additionalProperties: false + required
      var k = Object.keys(o), i: T;
      for (i = 0; i < k.length; i++) if (permitidas.indexOf(k[i]) < 0) return "clave no permitida: " + k[i];
      for (i = 0; i < req.length; i++) if (!(req[i] in o)) return "falta " + req[i];
      return null;
    }
    function num(v?: T) { return typeof v === "number" && isFinite(v); }
    // GET /api/hazas (contratos/api.openapi.yaml, Hazas) → { hazas: [{ id, codigo, nombre, finca, es_mia, poligonos: [[anillo UTM [[x, y]…]…]…] }], error }
    // El motor pide srs=25830 y solo acepta EPSG:25830 (UTM 30N, el del mundo). Lo que no cumple, entero fuera: no se adivina.
    function validaColeccion(c?: T) {
      var mal = function (m?: T) { return { hazas: [], error: m }; };
      if (!esObj(c)) return mal("no es un objeto");
      var e = soloClaves(c, CLAVES_COL, CLAVES_COL); if (e) return mal(e);
      if (c.type !== "FeatureCollection") return mal("type no es FeatureCollection");
      if (c.srs !== "EPSG:25830") return mal("srs no es EPSG:25830");
      if (!Array.isArray(c.features)) return mal("features no es un array");
      if (c.features.length > MAX_HAZAS) return mal("demasiadas hazas");
      var out: T = [], nv = 0;
      for (var i = 0; i < c.features.length; i++) {
        var f = c.features[i], donde = "features[" + i + "]: ";
        if (!esObj(f)) return mal(donde + "no es un objeto");
        e = soloClaves(f, CLAVES_F, CLAVES_F); if (e) return mal(donde + e);
        if (f.type !== "Feature") return mal(donde + "type no es Feature");
        if (typeof f.id !== "number" || Math.floor(f.id) !== f.id) return mal(donde + "id no es entero");
        var p = f.properties; if (!esObj(p)) return mal(donde + "properties no es un objeto");
        e = soloClaves(p, CLAVES_P, CLAVES_P); if (e) return mal(donde + "properties: " + e);
        if (typeof p.codigo !== "string" || typeof p.nombre !== "string" || typeof p.finca !== "string" || typeof p.es_mia !== "boolean") return mal(donde + "properties: tipo no válido");
        var g = f.geometry; if (!esObj(g) || g.type !== "MultiPolygon" || !Array.isArray(g.coordinates)) return mal(donde + "geometry no es un MultiPolygon");
        var polis: T = [];
        for (var a = 0; a < g.coordinates.length; a++) {
          var pol = g.coordinates[a]; if (!Array.isArray(pol)) return mal(donde + "polígono no válido");
          var anillos: T = [];
          for (var b = 0; b < pol.length; b++) {
            var an = pol[b]; if (!Array.isArray(an) || an.length < 4) return mal(donde + "anillo con menos de 4 vértices");
            for (var v = 0; v < an.length; v++) if (!Array.isArray(an[v]) || an[v].length < 2 || !num(an[v][0]) || !num(an[v][1])) return mal(donde + "vértice no válido");
            nv += an.length; if (nv > MAX_VERT) return mal("demasiados vértices");
            anillos.push(an);
          }
          if (anillos.length) polis.push(anillos);
        }
        out.push({ id: f.id, codigo: p.codigo, nombre: p.nombre, finca: p.finca, es_mia: p.es_mia, poligonos: polis });
      }
      return { hazas: out, error: null };
    }
    // UTM 30N (EPSG:25830) → coordenadas del mundo: metros relativos a centro_utm (x al este, y al norte; en la escena, z = −y)
    function aLocal(p?: T, cx?: T, cy?: T) { return [p[0] - cx, p[1] - cy]; }
    function anillosLocales(h?: T, cx?: T, cy?: T) {
      var out: T = [];
      h.poligonos.forEach(function (pol?: T) { pol.forEach(function (an?: T) { out.push(an.map(function (q?: T) { return aLocal(q, cx, cy); })); }); });
      return out;
    }
    // ¿cae alguna parte de la haza dentro de la caja del mundo (ext = [x0, yN, x1, yS], local) con un margen? Lo de fuera no se dibuja.
    function enElMundo(anillos?: T, ext?: T, margen?: T) {
      for (var i = 0; i < anillos.length; i++) for (var j = 0; j < anillos[i].length; j++) {
        var q = anillos[i][j]; if (q[0] >= ext[0] - margen && q[0] <= ext[2] + margen && q[1] >= ext[3] - margen && q[1] <= ext[1] + margen) return true;
      }
      return false;
    }
    // par-impar sobre todos los anillos del polígono: un agujero (anillo interior) queda fuera
    function dentroPoligono(x?: T, y?: T, pol?: T) {
      var den = false;
      for (var r = 0; r < pol.length; r++) {
        var an = pol[r];
        for (var i = 0, j = an.length - 1; i < an.length; j = i++) {
          var xi = an[i][0], yi = an[i][1], xj = an[j][0], yj = an[j][1];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) den = !den;
        }
      }
      return den;
    }
    // la haza (de una hs de { poligonosLoc }) en la que cae el punto local (x, y), o −1
    function hazaEn(x?: T, y?: T, hs?: T) {
      for (var k = 0; k < hs.length; k++) for (var p = 0; p < hs[k].poligonosLoc.length; p++) if (dentroPoligono(x, y, hs[k].poligonosLoc[p])) return k;
      return -1;
    }
    // del toque al suelo: avanza por el rayo (origen o, dirección d unitaria, en la escena) hasta pasar bajo alturaEn(x, z) y afina por bisección.
    // Devuelve el punto local [x, y] (y = −z) o null si el rayo no toca el suelo antes de tMax.
    function rayoSuelo(o?: T, d?: T, alturaEn?: T, tMax?: T) {
      var tA = 0, t = 0, bajo = function (tt?: T) { var x = o[0] + d[0] * tt, y = o[1] + d[1] * tt, z = o[2] + d[2] * tt; return y <= alturaEn(x, z); };
      if (bajo(0)) return null;
      while (t < tMax) {
        tA = t; t += Math.max(1, t * 0.01);
        if (bajo(t)) {
          var lo = tA, hi = t; for (var i = 0; i < 24; i++) { var m = (lo + hi) / 2; if (bajo(m)) hi = m; else lo = m; }
          return [o[0] + d[0] * hi, -(o[2] + d[2] * hi)];
        }
      }
      return null;
    }
    // ---- la ficha: SOLO la hs blanca de contratos/haza.schema.json, campo a campo, cada dato con su procedencia y su fecha.
    // Lo que no está aquí no se enseña aunque llegue (titular, kilos, personas, GPS, texto libre: la api ya no los manda, ADR-0014).
    var MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    function fecha(s?: T) {   // «2026-10-01» o una fecha-hora ISO → «1-oct-2026» (la hora, si la hay, en la zona del navegador)
      if (typeof s !== "string") return "sin fecha";
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (m) return Number(m[3]) + "-" + MESES[Number(m[2]) - 1] + "-" + m[1];
      var d = new Date(s); if (isNaN(d.getTime())) return "sin fecha";
      return d.getDate() + "-" + MESES[d.getMonth()] + "-" + d.getFullYear() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    }
    function n1(v?: T, d?: T) { return Number(v).toLocaleString("es-ES", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
    function ultimo(hs?: T) { var u: T = null; (Array.isArray(hs) ? hs : []).forEach(function (e?: T) { if (e && typeof e.fecha === "string" && (!u || e.fecha > u.fecha)) u = e; }); return u; }
    var AVISOS: T = { ot_sin_sincronia: "aún no se ha leído OlivarTrack", ot_truncado: "una lectura de OlivarTrack llegó cortada", ot_parcial: "una lectura de OlivarTrack llegó incompleta", ot_error: "una lectura de OlivarTrack falló" };
    var TIPOS: T = { fitosanitario: "fitosanitario", nutricion: "nutrición", corrector: "corrector", otro: "otro" };
    var ANALITICA: T = { suelo: "de suelo", foliar: "foliar", agua: "de agua", otra: "otra" };
    // ficha (GET /api/hazas/{id}) → { titulo, quien, filas: [{ k, v, de }], alerta }   (de = procedencia y fecha; textos ya hechos, sin HTML)
    function fichaFilas(f?: T) {
      var filas: T = [], ot = "OlivarTrack · leído el " + fecha(f.datos_de);
      var quien = f.es_mia ? "Tu haza." : "Haza de otro hogar. Ves sus datos públicos; no quién es su titular.";
      if (!f.es_mia && typeof f.alias === "string" && f.alias) quien += " El hogar se muestra como «" + f.alias + "».";
      if (num(f.superficie_ha)) filas.push({ k: "Superficie", v: n1(f.superficie_ha, 2) + " ha", de: "calculada sobre la linde que dibuja la oficina" });
      var ol = f.olivos || {};
      if (ol.lidar && num(ol.lidar.n)) filas.push({ k: "Olivos contados", v: n1(ol.lidar.n), de: "detectado (LiDAR + regla) · " + (ol.lidar.fuente || "LiDAR") });
      if (ol.declarado) filas.push({ k: "Olivos declarados", v: num(ol.declarado.n) ? n1(ol.declarado.n) : "sin dato", de: "declarado" + (ol.declarado.fuente ? " · " + ol.declarado.fuente : "") });
      var nd = f.ndvi_relativo;
      filas.push(nd && num(nd.valor) ? { k: "Vigor (NDVI)", v: (nd.valor > 0 ? "+" : "") + n1(nd.valor, 2) + " frente al resto de la finca", de: "relativo, sin calibrar · " + (nd.fuente || "Sentinel-2") + " · " + fecha(nd.fecha) } : { k: "Vigor (NDVI)", v: "sin dato", de: "Sentinel-2" });
      var tr = ultimo(f.tratamientos);
      if (tr) {
        var comp = (Array.isArray(tr.componentes) ? tr.componentes : []).map(function (c?: T) { return (TIPOS[c.tipo] || "otro") + (typeof c.producto === "string" ? ": " + c.producto : ""); });
        filas.push({ k: "Último tratamiento", v: fecha(tr.fecha) + (comp.length ? " · " + comp.join(", ") : "") + (num(tr.plazo_seguridad_dias) ? " · plazo de seguridad " + n1(tr.plazo_seguridad_dias) + " d" : ""), de: ot });
      } else filas.push({ k: "Último tratamiento", v: "ninguno registrado", de: ot });
      var fe = ultimo(f.fenologia);
      filas.push({ k: "Fenología", v: fe && num(fe.bbch) ? "BBCH " + fe.bbch + " · " + fecha(fe.fecha) : "sin dato", de: ot });
      var an = ultimo(f.analiticas);
      filas.push({ k: "Última analítica", v: an ? (ANALITICA[an.tipo] || "otra") + " · " + fecha(an.fecha) : "ninguna registrada", de: ot });
      var av = f.avance || {};
      filas.push({ k: "Recogido", v: num(av.pct) ? n1(av.pct) + " % (" + n1(av.parcelas_con_dato) + " de " + n1(av.parcelas) + " parcelas con aforo)" : "sin aforo con que comparar", de: "OlivarTrack, solo el porcentaje · " + fecha(av.fecha) });
      filas.push({ k: "Troncos y ramas", v: "los del dibujo", de: "ilustrativo: el LiDAR mide la copa, no los pies" });
      var avisos = (Array.isArray(f.avisos) ? f.avisos : []).map(function (a?: T) { return AVISOS[a]; }).filter(Boolean);
      var alerta = f.completo === false || avisos.length ? "Ficha incompleta" + (avisos.length ? ": " + avisos.join("; ") : "") + ". No se sacan totales." : "";
      return { titulo: (typeof f.nombre === "string" ? f.nombre : "Haza") + (typeof f.codigo === "string" ? " · " + f.codigo : ""), quien: quien, filas: filas, alerta: alerta };
    }
    // ?api=<prefijo> (pruebas): solo una ruta relativa del mismo origen que acaba en «/»; si no, el del servidor cuando D.base es /teselas/…; si no, ninguno
    function prefijoApi(busqueda?: T, base?: T) {
      var m = /[?&]api=([^&#]*)/.exec(busqueda || "");
      if (m) { var p = decodeURIComponent(m[1] as string); return /^\/?[A-Za-z0-9_\-.][A-Za-z0-9_\-./]*\/$/.test(p) && p.indexOf("//") < 0 && p.indexOf("..") < 0 ? p : null; }
      return /^\/teselas\//.test(base || "") ? "/api/" : null;
    }
    return { validaColeccion: validaColeccion, aLocal: aLocal, anillosLocales: anillosLocales, enElMundo: enElMundo, dentroPoligono: dentroPoligono, hazaEn: hazaEn,
      rayoSuelo: rayoSuelo, fecha: fecha, fichaFilas: fichaFilas, prefijoApi: prefijoApi };
  })();
  // [puro:fin]

export function creaHazas(dp: DepsHazas) {
  var THREE: T = dp.THREE, D: T = dp.D, Bus: T = dp.Bus, Entidades: T = dp.Entidades, Usables: T = dp.Usables, camera: T = dp.camera, Estado: T = dp.Estado, suelo = dp.suelo, objetivo: T = dp.objetivo, pp: T = dp.pp;
  var window: T = dp.ventana || globalThis, location: T = dp.ubicacion || (globalThis as T).location, performance: T = globalThis.performance, fetch: T = dp.fetch || (globalThis as T).fetch.bind(globalThis);
  var suel = creaSoltador();   // lo que se engancha a la página (la tecla H) se apunta aquí y se suelta en libera()

  var Hazas = (function () {
    var P = HazasPuro, API = P.prefijoApi(location.search, D.base);
    var st: T = { activo: false, n: 0, propias: 0, error: null };
    var vivo = true, ctl = new AbortController();   // A3-7b1: libera() corta las peticiones en vuelo (la lista y las fichas) y tira lo que llegue tarde
    var hz: T = [], cache: T = {};
    function trae(url?: T) {
      return fetch(url, { credentials: "same-origin", headers: { accept: "application/geo+json, application/json" }, signal: ctl.signal }).then(function (r?: T) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
    }
    function monta(col?: T) {
      if (!vivo) return;
      var v = P.validaColeccion(col); if (v.error) { st.error = "no cumple el contrato: " + v.error; return; }
      var fid = D.finca_id, cx = D.centro_utm[0], cy = D.centro_utm[1];
      hz = v.hazas.filter(function (h?: T) { return !fid || h.finca === fid; }).map(function (h?: T) {
        var an = P.anillosLocales(h, cx, cy);
        return { id: h.id, codigo: h.codigo, nombre: h.nombre, es_mia: h.es_mia, anillos: an,
          poligonosLoc: h.poligonos.map(function (pol?: T) { return pol.map(function (r?: T) { return r.map(function (q?: T) { return P.aLocal(q, cx, cy); }); }); }) };
      }).filter(function (h?: T) { return P.enElMundo(h.anillos, D.ext, 50); });
      st.n = hz.length; st.propias = hz.filter(function (h?: T) { return h.es_mia; }).length;
      if (!hz.length) return;
      st.activo = true;
      // la linde la dibuja el componente «lindes-hazas» (44_lindes.js) si está encendido: aquí solo se avisa de que hay hazas nuevas (Hazas.lindes() las da)
      Bus.emite("hazas:cambia", { n: st.n, propias: st.propias });
      engancha();
    }
    // ---- C7 (02e_entidades.js): las hazas como entidades, haza:<id>. Su ficha va en el recuadro común (#ficha, con textContent: nunca HTML de la red) y la
    // pinta Usables; un toque corto en la órbita sobre una haza la elige solo si no hay delante otra cosa (es «de fondo»: el olivo o la baliza ganan).
    // La ficha pública se pide a la api la primera vez (y pasado un minuto): mientras, «leyendo…»; al llegar, Usables.refresca la repinta si sigue a la vista.
    var rayoH: T = null, ndc: T = null, quitaEnt: T = null, pend: T = {}, fallo: T = {};
    function alturaEscena(x?: T, z?: T) { return suelo(x, -z) * Estado.exag; }
    function bajoDedo(cx2?: T, cy2?: T, r?: T) {
      ndc.set((cx2 - r.left) / r.width * 2 - 1, -(cy2 - r.top) / r.height * 2 + 1); rayoH.setFromCamera(ndc, camera);
      var o = rayoH.ray.origin, d = rayoH.ray.direction, q = P.rayoSuelo([o.x, o.y, o.z], [d.x, d.y, d.z], alturaEscena, camera.far);
      return q ? P.hazaEn(q[0], q[1], hz) : -1;
    }
    function idHaza(h?: T) { return "haza:" + h.id; }
    function hazaDe(id?: T) { for (var k = 0; k < hz.length; k++) if (idHaza(hz[k]) === id) return hz[k]; return null; }
    function filasDe(h?: T, f?: T, msg?: T) {
      if (!f) return { titulo: h.nombre + " · " + h.codigo, filas: [{ k: "Haza", v: h.es_mia ? "la tuya" : "de otro hogar" }, { k: "Ficha", v: msg }] };
      var r = P.fichaFilas(f), out: T = [{ k: "Haza", v: r.quien, de: "linde: dato dibujado por la oficina (límite de gestión, no un deslinde)" }];
      r.filas.forEach(function (q?: T) { out.push({ k: q.k, v: q.v, de: q.de }); }); if (r.alerta) out.push({ k: "Aviso", v: r.alerta });
      return { titulo: r.titulo, filas: out };
    }
    // pide la ficha pública a la api (una vez a la vez por haza); al llegar, repinta lo que la tenga elegida. Lo usan fichaHaza y datos().
    function pide(h?: T, id?: T) {
      if (pend[h.id]) return;
      pend[h.id] = true;
      trae(API + "hazas/" + encodeURIComponent(h.id)).then(function (f?: T) {
        if (!vivo) return;
        delete pend[h.id]; if (!f || typeof f !== "object") { fallo[h.id] = true; } else cache[h.id] = { t: performance.now(), f: f }; Usables.refresca(id);
      }).catch(function () { if (!vivo) return; delete pend[h.id]; fallo[h.id] = true; Usables.refresca(id); });
    }
    function fichaHaza(id?: T) {
      var h = hazaDe(id); if (!h) return null;
      var c = cache[h.id]; if (c && performance.now() - c.t < 60000) return filasDe(h, c.f);
      if (fallo[h.id]) return filasDe(h, null, "no se ha podido leer (sin sesión o sin conexión)");
      pide(h, id);
      return filasDe(h, null, "leyendo…");
    }
    function engancha() {
      rayoH = new THREE.Raycaster(); ndc = new THREE.Vector2();
      quitaEnt = Entidades.registra({ tipo: "haza", dueno: "13b_hazas", prioridad: 0, fondo: true, sinAnillo: true, ficha: fichaHaza,
        pantalla: function (cx2?: T, cy2?: T, r?: T) { if (dp.paseando || !st.activo) return null; var k = bajoDedo(cx2, cy2, r); return k >= 0 ? { id: idHaza(hz[k]), s: 0 } : null; },   // solo en la órbita, como antes
        existe: function (id?: T) { return !!hazaDe(id); },
        muestra: function (id?: T) { var h = hazaDe(id); if (h) delete fallo[h.id]; return false; } });   // elegirla otra vez vuelve a intentar leerla
      // H (UX §5.2): la ficha de la haza en la que estás (en el paseo, donde andas; en la órbita, la del punto al que miras)
      suel.escucha(window, "keydown", function (e?: T) {
        if (e.code !== "KeyH" || !st.activo || e.ctrlKey || e.metaKey || e.altKey) return; var t = e.target && e.target.tagName; if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
        var x = dp.paseando ? pp.x : objetivo.x, y = dp.paseando ? pp.y : -objetivo.z, k = P.hazaEn(x, y, hz);
        if (k >= 0) Usables.elige(idHaza(hz[k]), "tecla"); else Usables.mensaje("Hazas", [{ k: "Aquí", v: "No estás dentro de ninguna haza." }]);
      });
    }
    function libera() {
      var habia = st.activo;
      vivo = false; ctl.abort();   // la lista y las fichas en vuelo se cortan; lo que llegue tarde no monta nada
      suel.suelta();   // la tecla H
      if (quitaEnt) { quitaEnt(); quitaEnt = null; }
      hz = []; st.activo = false; cache = {}; pend = {}; fallo = {}; rayoH = null; ndc = null;
      if (habia) Bus.emite("hazas:cambia", { n: 0, propias: 0 });
    }
    if (API) {
      var fq = typeof D.finca_id === "string" && /^[a-z0-9_-]{1,32}$/.test(D.finca_id) ? "&finca=" + D.finca_id : "";
      trae(API + "hazas?srs=25830" + fq).then(monta).catch(function (e?: T) { if (vivo) st.error = String(e && e.message || e); });   // sin sesión, sin api o sin red: no se dibuja nada, y en silencio
    }
    function estado() { var e: T = { api: !!API }; Object.keys(st).forEach(function (k?: T) { e[k] = st[k]; }); return e; }   // para ?debug y las pruebas
    // vistas() las hazas que se ven { id, es_mia } y enPunto(x este, y norte, locales) la que lo contiene o null (P7f: ¿este olivo es de mi haza?)
    function vistas() { return hz.map(function (h?: T) { return { id: h.id, es_mia: !!h.es_mia }; }); }
    function enPunto(x?: T, y?: T) { var k = P.hazaEn(x, y, hz); return k >= 0 ? { id: hz[k].id, es_mia: !!hz[k].es_mia } : null; }
    // lindes() la geometría de la linde de cada haza vista, para quien la dibuje (44_lindes.js): [{ id, codigo, es_mia, anillos: [[[x este, y norte] locales…]…] }].
    // Son las del contrato tal cual (la oficina las dibuja; aquí no se simplifican ni se mueven): una copia, que nadie toca las de Hazas.
    function lindes() { return hz.map(function (h?: T) { return { id: h.id, codigo: h.codigo, es_mia: !!h.es_mia, anillos: h.anillos.map(function (an?: T) { return an.map(function (q?: T) { return [q[0], q[1]]; }); }) }; }); }
    // datos(id) (id numérico de la haza) → { id, codigo, nombre, es_mia, ficha } para los carteles (44b_carteles.js): la ficha pública tal cual la dio la api (o null si aún
    // no ha llegado: la pide, como mucho una vez cada minuto), y SIN filtrar; quien la usa se limita a la lista blanca de contratos/haza.schema.json. null si la haza no se ve.
    function datos(id?: T) {
      var h = hazaDe("haza:" + id); if (!h) return null;
      var c = cache[h.id], viva = c && performance.now() - c.t < 60000;
      if (!viva && !fallo[h.id]) pide(h, idHaza(h));
      return { id: h.id, codigo: h.codigo, nombre: h.nombre, es_mia: !!h.es_mia, ficha: c ? c.f : null };
    }
    return { estado: estado, libera: libera, vistas: vistas, enPunto: enPunto, lindes: lindes, datos: datos };
  })();
  return Hazas;
}

/** El manifiesto del componente «hazas-mundo» (ADR-0023): solo ciclo de vida (sin fases). El objeto ya existe antes de que se monte (la lista de hazas se pide al cargar y 31b, 31c, 42, 44 y 44b lo usan),
 *  así que monta() devuelve ese mismo objeto y libera() llama a su libera(). */
export function manifiestoHazas(api: { libera(): void }): Manifiesto {
  return {
    id: ID_HAZAS, version: 1, consume: ["Entidades", "Usables", "Paseo"], expone: [], eventos: { escucha: [], emite: ["hazas:cambia"] }, bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0 }, fases: {}, mundos: ["exterior"], monta: function () { return api; }, libera: function () { api.libera(); }
  };
}

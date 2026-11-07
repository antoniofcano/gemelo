// La historia: un recorrido guiado que cruza el gemelo con lo que sabe OlivarTrack (MU5-n, A3-7b1: antes apps/web/motor/14_historia.js, que queda como talón). Es del EXTERIOR: sus escenas
// son de la finca de Hituelo (parcelas, copas, marcas, NDVI, relieve) y resaltan parcelas sobre el terreno. Componente «historia-recorrido» de los mundos ["exterior"], con un libera() que suelta
// de verdad: las escuchas de sus botones y de las flechas (soltador), los puntos de escena que creó, las mallas de resalte (escena, geometría y material, por la fábrica con dueño
// «historia-recorrido») y devuelve la ventana a su estado de antes de empezar.
// Los datos de OlivarTrack: la instantánea que trae el índice (D.ot). HistoriaPuro sabe leer lo de hoy de la api (GET /api/ot/hoy, contratos/ot-hoy.md; el navegador no habla con OlivarTrack ni con
// Vigía, decisión 79), pero la historia no lo cablea: en Hituelo el MCP no da la parcela de cada trabajo y, con 27 parcelas, no hay forma segura de asignarlo (se dice en la propia historia). VIVO (lo que
// marcaría Vigía) se queda en null; lo lee 19_balizas. Los textos de fuera (títulos de tarea, parcelas y motivos de Vigía, avisos) son DATOS: se escapan al pintarlos y nunca se siguen.
// Código movido tal cual (solo se tipan parámetros y variables); lo que el legado reescribe o se monta después entra por argumento (paseando y ndviIdx, por getter; ndviIdx se escribe con
// ponNdviIdx). Arreglo de la auditoría (L4-12): ndviEn no falla si el índice no trae NDVI. Lo que cambiaría lo que se ve o se hace (L6-10: el foco en «Siguiente» frena las flechas; L3-11, L3-14, L3-15,
// L3-20: cifras y nombres fijos, una deducción que sale como dato) queda apuntado para el banco.
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { DefMaterial, Materiales, MaterialMin } from "../../nucleo/materiales.ts";
import { creaSoltador } from "../../nucleo/soltador.ts";
import type { T } from "../comun/tipos.ts";
import { esc } from "./tiempo-puro.ts";

export const ID_HISTORIA = "historia-recorrido";

// ---------------------------------------------------------------- el material de resalte (MU5-n: por la fábrica, con su nombre de la tabla de MATERIALES §1, fila 16)
/** el nombre del material en la fábrica: es también la clave de su variante TSL */
export const MATERIAL_RESALTE = "resalte-parcela";
/** lo que pide el material: el uniforme de la exageración vertical del terreno (UN.uExag), que mueve el mundo; el sombreador lo lee, no lo copia */
export interface OpcResalte { uExag: { value: number } }
/** el sombreado de siempre: la y de cada vértice se multiplica por uExag (la malla se pegó al relieve sin exagerar y sigue la exageración sin tocar su matriz, AG-1.15) */
export function parcheResalte(sh: unknown, uExag: { value: number }): void {
  const s = sh as { uniforms: Record<string, unknown>; vertexShader: string };
  s.uniforms["uExag"] = uExag;
  s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nuniform float uExag;").replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed.y *= uExag;");
}
export const DEF_RESALTE: DefMaterial<OpcResalte> = {
  clasico: function (o, c) {
    const Basic = c.THREE["MeshBasicMaterial"] as new (opc: unknown) => MaterialMin;
    const m = new Basic({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    m.onBeforeCompile = function (sh: unknown) { parcheResalte(sh, o.uExag); };
    m.customProgramCacheKey = function () { return MATERIAL_RESALTE; };
    return m;
  },
  // MU5-n, tercer commit: la variante TSL, APAGADA (solo con el WebGPURenderer, que hasta MU6 no existe; nadie la usa hoy). Un MeshBasicNodeMaterial con el mismo estado de dibujo
  // (transparente al 42 %, sin escribir profundidad, con el desplazamiento de polígono) y la misma posición: la y local por uExag, con el MISMO { value } de UN.uExag (releído en cada
  // objeto, onObjectUpdate). FALTA: nada conocido; NO VERIFICADO que el grafo compile ni que se vea igual por ojo (capturas por material: MU6).
  tsl: function (o, c) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Tn = c.TSL as any, M = c.THREE["MeshBasicNodeMaterial"] as new (opc: unknown) => MaterialMin & { positionNode: unknown };
    const uExag = Tn.uniform(o.uExag.value).onObjectUpdate(function () { return o.uExag.value; });
    const m = new M({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    m.positionNode = Tn.vec3(Tn.positionLocal.x, Tn.positionLocal.y.mul(uExag), Tn.positionLocal.z);
    return m;
  }
};

/** Lo que el talón de 14 le da: THREE, el índice (D) y las utilidades de 01 ($, tinta, fmt), el mundo (02: suelo, copas, cIn, marc, med), la fábrica de materiales (02i), Estaticos (02j), la escena (03),
 *  UN (04d), la cámara orbital (09: orb, pon), el NDVI (10: NDV, pintaNdvi, y ndviIdx por getter con ponNdviIdx para escribirlo), el paseo (12: paseando por getter, salePaseo) y las parcelas (13) */
export interface DepsHistoria {
  THREE: T; D: T; $: (id: string) => T; tinta: (raiz: T) => void; fmt: (n: number, d?: number) => string;
  suelo: (x: number, y: number) => number; copas: T; cIn: T; marc: T; med: (a: number[]) => number; Materiales: Materiales & T; Estaticos: T; scene: T; UN: T;
  orb: T; pon: (modo: string) => void; NDV: T; pintaNdvi: () => void; readonly ndviIdx: number; ponNdviIdx: (i: number) => void; readonly paseando: boolean; salePaseo: () => void;
  parcelas: T; fincas: T; claseUsda: (a: number, l: number, c: number) => string; elegirParcela: (k: number) => void; elegirFinca: (f: number) => void;
}


  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/historia_vivo.test.js)
export var HistoriaPuro: T = (function () {
    var ORIGEN_OT: T = { olivartrack: 1, grabado: 1 }, ORIGEN_VIG: T = { vigia: 1, fixture: 1 };
    function parte(p?: T, lista?: T) { return p === null || (!!p && typeof p === "object" && typeof p.leidoEn === "string" && (!lista || Array.isArray(p[lista]))); }
    // ¿cumple lo esencial del contrato (contratos/ot-hoy.schema.json)? Lo demás se pinta con lo que haya
    function valida(r?: T) {
      if (!r || typeof r !== "object" || r.version !== 1 || !r.origen || !Array.isArray(r.avisos) || typeof r.completo !== "boolean") return false;
      if (r.origen.ot !== null && !ORIGEN_OT[r.origen.ot]) return false;
      if (r.origen.vigia !== null && !ORIGEN_VIG[r.origen.vigia]) return false;
      return parte(r.tareasAbiertas, "tareas") && parte(r.trabajoRealizado, "tareas") && parte(r.atencion, "puntos") && parte(r.vigia, "pidenUnaMirada");
    }
    // GET <prefijo>ot/hoy del mismo origen; nunca lanza: { ok, datos } o { ok: false, motivo }
    function lee(fetchFn?: T, prefijo?: T) {
      if (!prefijo || typeof fetchFn !== "function") return Promise.resolve({ ok: false, motivo: "sin_api" });
      return Promise.resolve().then(function () { return fetchFn(prefijo + "ot/hoy", { credentials: "same-origin", headers: { accept: "application/json" } }); })
        .then(function (r?: T) {
          if (!r || !r.ok) return { ok: false, motivo: "http_" + (r ? r.status : 0) };
          return r.json().then(function (j?: T) { return valida(j) ? { ok: true, datos: j } : { ok: false, motivo: "contrato" }; });
        })
        .catch(function () { return { ok: false, motivo: "red" }; });
    }
    // Un OT nuevo con la forma de D.ot: las tareas abiertas y hechas de la finca, cada una en su parcela (la suya, la de su tarea abierta
    // o, si no, la ÚNICA parcela cuyo nº de olivos marcados es el objetivo de la tarea); fenología y pases, de la instantánea (no se leen en vivo).
    // ids: los de las parcelas del mundo; olivosDe(id): sus olivos marcados. Sin tareas en la respuesta, el OT es el de la instantánea.
    function aplica(res?: T, base?: T, ids?: T, finca?: T, olivosDe?: T) {
      var ab = res.tareasAbiertas, tr = res.trabajoRealizado, ot = base;
      if (ab || tr) {
        ot = { fuente: "vivo", fecha_consulta: String((ab && (ab.consultadoEn || ab.leidoEn)) || (tr && (tr.consultadoEn || tr.leidoEn)) || res.consultadoEn).slice(0, 10),
          pases_finca: base.pases_finca, entregas_finca: base.entregas_finca, analiticas_finca: base.analiticas_finca, parcelas: {},
          incompleto: !!((ab && ab.truncado) || (tr && tr.truncado)) };
        ids.forEach(function (id?: T) { var b = base.parcelas && base.parcelas[id]; ot.parcelas[id] = { tareas: [], fenologia: b && b.fenologia ? b.fenologia.slice() : [] }; });
        var abiertas: T = {}, vistos: T = {}, dentro = function (id?: T) { return id != null && ids.indexOf(id) >= 0; };
        ((ab && ab.tareas) || []).forEach(function (t?: T) { abiertas[t.clave] = t; });
        ((tr && tr.tareas) || []).forEach(function (t?: T) {
          if (t.finca !== finca) return;
          var a = abiertas[t.clave], obj = t.avance ? t.avance.objetivo : null, pid: T = null;
          if (a && dentro(a.parcela)) pid = a.parcela;
          else if (dentro(t.parcela)) pid = t.parcela;
          else if (obj != null) { var c = ids.filter(function (id?: T) { return olivosDe(id) === obj; }); if (c.length === 1) pid = c[0]; }
          if (!pid) return;
          vistos[t.clave] = 1;
          ot.parcelas[pid].tareas.push({ tipo: t.tipo, titulo: t.titulo, fecha: t.completadaEn || (a && a.fecha) || null, estado: t.estado, avance: t.avance ? t.avance.pct : null, fuente: null, andados: t.avance ? t.avance.hecho : null, objetivo: obj });
        });
        Object.keys(abiertas).forEach(function (k?: T) { var a = abiertas[k]; if (vistos[k] || a.finca !== finca || !dentro(a.parcela)) return; ot.parcelas[a.parcela].tareas.push({ tipo: a.tipo, titulo: a.nombre, fecha: a.fecha, estado: a.estado, avance: null, fuente: null, andados: null, objetivo: null }); });
      }
      var v = res.vigia, f = v && v.frescura && v.frescura.generadoEn;
      return { ot: ot, vivo: { vigia: v ? v.pidenUnaMirada : null, vigiaFrescura: f ? String(f).slice(11, 16) + " UTC" : null, calibrada: v ? v.calibrada : null, atencion: res.atencion, completo: res.completo } };
    }
    // «hace N min / h» de un instante ISO (para el aviso)
    function haceIso(iso?: T, ahora?: T) { var t = Date.parse(iso); if (!isFinite(t)) return "?"; var m = Math.max(1, Math.round((ahora - t) / 60000)); return m < 90 ? "hace " + m + " min" : "hace " + Math.round(m / 60) + " h"; }
    // el aviso de la ventana: de dónde sale, de cuándo es y si está incompleto (texto plano: se pinta con textContent)
    function aviso(res?: T, ahora?: T) {
      var sint = res.origen.ot === "grabado" || res.origen.vigia === "fixture", l: T = [];
      if (res.tareasAbiertas || res.trabajoRealizado) l.push("OlivarTrack, leído por el servidor " + haceIso((res.tareasAbiertas || res.trabajoRealizado).leidoEn, ahora));
      else l.push("tareas: instantánea de OlivarTrack");
      if (res.vigia) l.push("Vigía " + haceIso(res.vigia.consultadoEn || res.vigia.leidoEn, ahora));
      var t = (sint ? "Datos de PRUEBA sintéticos · " : "En vivo · ") + l.join(" · ") + (res.completo ? "" : " · incompleto");
      return { texto: t, tipo: sint || !res.completo ? "parcial" : "vivo" };
    }
    // los puntos de atención de hoy en una línea (recuentos de OlivarTrack, sin nombres); "" si no hay
    function atencion(a?: T) {
      if (!a || !a.puntos || !a.puntos.length) return a && a.total === 0 ? "OlivarTrack no tiene nada pendiente hoy." : "";
      return "Pendiente hoy en OlivarTrack: " + a.puntos.map(function (p?: T) { return p.texto || (p.n + " " + String(p.tipo).replace(/_/g, " ")); }).join("; ") + (a.parcial ? " (incompleto: no es el total)" : "") + ".";
    }
    var MOTIVOS: T = { sin_api: "esta página no tiene servidor", http_401: "hace falta entrar con tu enlace", http_503: "el servidor no lee OlivarTrack ni Vigía ahora",
      contrato: "la respuesta del servidor no tiene la forma esperada", red: "no se pudo hablar con el servidor" };
    function motivo(m?: T) { return MOTIVOS[m] || "el servidor respondió con un error (" + String(m).replace(/^http_/, "") + ")"; }
    return { valida: valida, lee: lee, aplica: aplica, aviso: aviso, atencion: atencion, motivo: motivo };
  })();
  // [puro:fin]

export function creaHistoria(dp: DepsHistoria) {
  var THREE: T = dp.THREE, D: T = dp.D, $ = dp.$, tinta = dp.tinta, fmt = dp.fmt, suelo = dp.suelo, copas: T = dp.copas, cIn: T = dp.cIn, marc: T = dp.marc, med = dp.med, Materiales: T = dp.Materiales;
  var Estaticos: T = dp.Estaticos, scene: T = dp.scene, UN: T = dp.UN, orb: T = dp.orb, pon = dp.pon, NDV: T = dp.NDV, pintaNdvi = dp.pintaNdvi, parcelas: T = dp.parcelas, fincas: T = dp.fincas;
  var claseUsda = dp.claseUsda, elegirParcela = dp.elegirParcela, elegirFinca = dp.elegirFinca;
  Materiales.define(MATERIAL_RESALTE, DEF_RESALTE);
  var materiales = Materiales.de(ID_HISTORIA);   // lo que cree este componente se libera con su libera()
  var suel = creaSoltador();   // A3-7b1: lo que se engancha a la página se apunta aquí y se suelta en libera()

  var OT = D.ot, hist = -1, overlays: T = [], VIVO: T = null;
  var COL: T = { ok: 0x2e8b3d, atencion: 0xe0a030, nada: 0x8a8a8a };
  function creaOverlay(k?: T) {  // la parcela pegada al terreno (retícula de 2 m sobre el relieve); se construye la primera vez que se resalta
    var poly = parcelas[k].linde, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, PA = 2;
    poly.forEach(function (p?: T) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); });
    function dentro(x?: T, y?: T) { var ins = false; for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) { if (((poly[i][1] > y) !== (poly[j][1] > y)) && (x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1] + 1e-12) + poly[i][0])) ins = !ins; } return ins; }
    var ia = Math.floor(minx / PA) - 1, ib = Math.ceil(maxx / PA) + 1, ja = Math.floor(miny / PA) - 1, jb = Math.ceil(maxy / PA) + 1, nx = ib - ia + 1, ny = jb - ja + 1, pos = new Float32Array(nx * ny * 3), arr: T = [];
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) { var x = (ia + i) * PA, y = (jb - j) * PA, o = (j * nx + i) * 3; pos[o] = x; pos[o + 1] = suelo(x, y) + 0.15; pos[o + 2] = -y; }   // filas de norte a sur
    for (var j2 = 0; j2 < ny - 1; j2++) for (var i2 = 0; i2 < nx - 1; i2++) {
      if (!dentro((ia + i2 + 0.5) * PA, (jb - j2 - 0.5) * PA)) continue;
      var a = j2 * nx + i2, b = a + 1, c = a + nx, d = c + 1; arr.push(a, c, b, b, c, d);
    }
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(Uint32Array.from(arr), 1));
    // la esfera, de la caja de los vértices con la y de 1 a 3 veces (el sombreador la multiplica por uExag; el deslizador #exag va de 1 a 3): se recorta sin perderla
    var caja = new THREE.Box3().setFromBufferAttribute(g.attributes.position), y0 = caja.min.y, y1 = caja.max.y;
    caja.min.y = Math.min(y0, y0 * 3); caja.max.y = Math.max(y1, y1 * 3); g.boundingSphere = caja.getBoundingSphere(new THREE.Sphere());
    var m = overlays[k]; m.geometry.dispose(); m.geometry = g; m.userData.listo = true;
  }
  parcelas.forEach(function (pr?: T, k?: T) {   // una malla vacía por parcela; la geometría llega al resaltarla. Sigue la exageración vertical con el mismo uniforme del terreno
    var mat = materiales.crea(MATERIAL_RESALTE, { uExag: UN.uExag });   // A3-7b1: por la fábrica, con dueño «historia-recorrido»
    var m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.renderOrder = 3; m.visible = false; Estaticos.congela(m); scene.add(m); overlays.push(m);   // AG-1.15: sigue la exageración por el uniforme, no por la matriz
  });
  function resalta(mapa?: T) { overlays.forEach(function (m?: T, k?: T) { if (mapa && mapa[k] !== undefined) { if (!m.userData.listo) creaOverlay(k); m.material.color.setHex(mapa[k]); m.visible = true; } else m.visible = false; }); }
  function marca(id?: T, v?: T) { var e = $(id); if (e.checked !== v) { e.checked = v; e.dispatchEvent(new Event("change")); } }
  function vistaDe(k?: T, az?: T, el?: T, f?: T) { elegirParcela(k); orb.az = az; orb.el = el; orb.dist = orb.dist * f; }
  function ndviEn(iso?: T) { // la imagen Sentinel-2 más cercana a esa fecha
    if (!NDV || !NDV.fechas || !NDV.fechas.length) return;   // L4-12: el NDVI es opcional en el contrato
    var best = 0, bd = 1e12; NDV.fechas.forEach(function (f?: T, i?: T) { var d = Math.abs(+new Date(f) - +new Date(iso)); if (d < bd) { bd = d; best = i; } });
    dp.ponNdviIdx(best); $("ndviSel").value = best; marca("cNdvi", true); pintaNdvi();
  }
  function dd(iso?: T) { return iso ? esc(iso.split("-").reverse().join("/")) : "–"; }
  function tabla(cab?: T, filas?: T) {
    var h = '<table class="h-tabla"><thead><tr>' + cab.map(function (c?: T, i?: T) { return '<th' + (i ? ' class="n"' : "") + ">" + c + "</th>"; }).join("") + "</tr></thead><tbody>";
    filas.forEach(function (f?: T) { h += "<tr" + (f.cls ? ' class="' + f.cls + '"' : "") + ">" + f.c.map(function (c?: T, i?: T) { return "<td" + (i ? ' class="n"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; });
    return h + "</tbody></table>";
  }
  var lista = function (a?: T) { return a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " y " + a[a.length - 1]; };
  function tareasDe(k?: T, tipo?: T) { var e = OT.parcelas[parcelas[k].id]; return e ? e.tareas.filter(function (t?: T) { return !tipo || t.tipo === tipo; }) : []; }
  var nMarc = function (k?: T) { return marc.filter(function (m?: T) { return m.parc === k; }).length; };
  var nLidar = function (k?: T) { return cIn.filter(function (c?: T) { return c.parc === k; }).length; };
  var minMax = function (a?: T) { var s = a.slice().sort(); return [s[0], s[s.length - 1]]; };

  // ---------- la historia de Hituelo: cada escena sale de lo que OlivarTrack sabe de verdad (instantánea D.ot) y de lo que mide el gemelo.
  // Solo hay escenas donde los datos las sostienen; lo que falta se dice en la última («Lo que no sabemos aún»). Sin personas.
  var esH = D.finca_id === "hituelo";
  var PALF: T = [0x2e8b3d, 0xd98c2b, 0x3b82c4, 0x8e5bc4], COL_CANC = 0xc4504a;
  var colF = function (k?: T) { return PALF[parcelas[k].finca % PALF.length]; };
  var swH = function (k?: T) { return '<i class="h-sw" data-fondo="#' + colF(k).toString(16).padStart(6, "0") + '"></i>'; };
  var swFinca = function (f?: T) { return '<i class="h-sw" data-fondo="#' + PALF[f % PALF.length].toString(16).padStart(6, "0") + '"></i>'; };
  var pct = function (a?: T, b?: T) { return b ? Math.round((a - b) / b * 100) : null; };
  var conSigno = function (d?: T) { return (d > 0 ? "+" : "") + d + " %"; };
  var rango = function (a?: T, d?: T) { var lo = Math.min.apply(null, a), hi = Math.max.apply(null, a); return fmt(lo, d) === fmt(hi, d) ? fmt(lo, d) : fmt(lo, d) + "–" + fmt(hi, d); };
  var sumaK = function (ks?: T, fn?: T) { return ks.reduce(function (a?: T, k?: T) { return a + fn(k); }, 0); };
  var todasK = function () { return parcelas.map(function (p?: T, k?: T) { return k; }); };
  function vistaFinca(f?: T, az?: T, el?: T, fac?: T) { elegirFinca(f); orb.az = az; orb.el = el; orb.dist = orb.dist * fac; }
  function pintaTodo(fn?: T) { var m: T = {}; parcelas.forEach(function (p?: T, k?: T) { var c = fn(k); if (c != null) m[k] = c; }); resalta(m); }
  function origenH() {
    return "<p class='h-nota'>Instantánea de OlivarTrack del " + dd(OT.fecha_consulta) + ". La lectura en vivo (MCP) no está activada en Hituelo: el MCP no devuelve la parcela de cada trabajo y, con 27 parcelas, no hay forma segura de asignarlo.</p>";
  }
  var tareaH = function (k?: T, titulo?: T) { return tareasDe(k).filter(function (t?: T) { return t.titulo === titulo; })[0]; };
  function celdaTarea(t?: T) {
    if (!t) return "–";
    if (t.estado === "completado") return dd(t.fecha) + (t.andados != null && t.objetivo != null ? " · " + fmt(t.andados) + "/" + fmt(t.objetivo) : "");
    return t.estado === "cancelada" ? "cancelada" : "pendiente";
  }
  function desfaseH(ok?: T) {   // diferencia marca − copa pareada, en metros (x este, y norte)
    var dx: T = [], dy: T = [];
    marc.forEach(function (m?: T) { if (m.par >= 0 && ok(m.parc)) { dx.push(m.x - copas[m.par].x); dy.push(m.y - copas[m.par].y); } });
    return { n: dx.length, dx: med(dx), dy: med(dy), d: Math.hypot(med(dx), med(dy)) };
  }
  var fincaConMasTareas = function () {
    var mejor = 0, n = -1; fincas.forEach(function (f?: T, i?: T) { var c = sumaK(f.parcelas, function (k?: T) { return tareasDe(k).length; }); if (c > n) { n = c; mejor = i; } }); return mejor;
  };

  var ESCENAS_H: T = !esH ? [] : [
    { t: "Cuatro fincas, veintisiete parcelas", fuente: "OlivarTrack · fincas y olivosParcela",
      ir: function () { pon("orto"); marca("cLinde", true); marca("cCopas", false); marca("cMarc", false); marca("cDesf", false); marca("cNdvi", false); marca("cTinte", false); marca("cSolo", false); pintaTodo(colF); vistaFinca(-1, -0.5, 0.78, 1); },
      html: function () {
        var ha = parcelas.reduce(function (a?: T, p?: T) { return a + p.ha; }, 0), pastos = parcelas.filter(function (p?: T) { return p.pasto; });
        var filas = fincas.map(function (f?: T, i?: T) { return { c: [swFinca(i) + esc(f.nombre), fmt(f.parcelas.length), fmt(f.ha, 1), fmt(sumaK(f.parcelas, nMarc))] }; });
        return "<p>OlivarTrack tiene dadas de alta en Hituelo <strong>" + fincas.length + " fincas con " + parcelas.length + " parcelas</strong>: <strong>" + fmt(ha, 1) + " ha</strong> y <strong>" + fmt(marc.length) + " olivos marcados</strong>. " +
          "Lo que ves es un gemelo: la forma sale de los puntos del vuelo LiDAR de 2024 y el color, de la ortofoto del PNOA (vuelo de julio de 2022).</p>" +
          tabla(["Finca", "Parcelas", "ha", "Olivos"], filas) +
          "<p class='h-nota'>" + pastos.length + " de las parcelas son pasto (" + fmt(pastos.reduce(function (a?: T, p?: T) { return a + p.ha; }, 0), 1) + " ha) y no llevan olivos marcados. A partir de aquí cada escena cruza el modelo con algo que OlivarTrack ya sabe, y la última dice lo que todavía no.</p>"; } },

    { t: "Cuántos olivos hay y cuántos vemos", fuente: "OlivarTrack · olivosParcela · LiDAR 2024 (detector de copas)",
      ir: function () { pon("nube"); marca("cCopas", true); marca("cMarc", true); marca("cLinde", true); marca("cDesf", false); marca("cNdvi", false); pintaTodo(function (k?: T) { var a = nMarc(k), d: T = a ? pct(nLidar(k), a) : 0; return a && Math.abs(d) >= 10 ? COL.atencion : null; }); vistaFinca(-1, -0.4, 0.8, 0.9); },
      html: function () {
        var filas = fincas.map(function (f?: T, i?: T) { var a = sumaK(f.parcelas, nMarc), l = sumaK(f.parcelas, nLidar); return { c: [swFinca(i) + esc(f.nombre), fmt(a), fmt(l), conSigno(pct(l, a))] }; });
        var A = marc.length, L = cIn.length;
        var difs = parcelas.map(function (p?: T, k?: T) { var a = nMarc(k); return a ? { n: esc(p.nombre), d: pct(nLidar(k), a), a: a, l: nLidar(k) } : null; }).filter(function (x?: T) { return x && Math.abs(x.d) >= 10; }).sort(function (p?: T, q?: T) { return Math.abs(q.d) - Math.abs(p.d); });
        return "<p>El LiDAR ve <strong>" + fmt(L) + " copas de olivo frente a " + fmt(A) + " olivos marcados (" + conSigno(pct(L, A)) + ")</strong> en el conjunto. Por finca:</p>" +
          tabla(["Finca", "Marcados", "LiDAR", "Dif."], filas) +
          (difs.length ? "<p>Las parcelas en las que se separan <strong>10 % o más</strong> (en ámbar) son " + lista(difs.map(function (x?: T) { return "<strong>" + x.n + "</strong> (" + fmt(x.l) + " copas, " + fmt(x.a) + " marcas, " + conSigno(x.d) + ")"; })) + ". " : "<p>Ninguna parcela se separa un 10 % o más. ") +
          "Puede ser que copas que se tocan cuenten como una sola, que haya marcas de olivos que ya no están o árboles sin marcar: son sitios a mirar, no un veredicto.</p>" +
          "<p class='h-nota'>Las copas del LiDAR excluyen lo que pasa de ~8 m (postes, pinos, cables) y los árboles que no son olivo, que se dibujan aparte. Las tres parcelas de pasto no cuentan.</p>"; } },

    { t: "Las marcas caen un metro al este", fuente: "OlivarTrack · olivosParcela · ortofoto PNOA (julio de 2022)",
      ir: function () { pon("orto"); marca("cCopas", true); marca("cMarc", true); marca("cDesf", true); marca("cLinde", true); marca("cNdvi", false); resalta({}); var kM = 0, n = -1; parcelas.forEach(function (p?: T, k?: T) { if (nMarc(k) > n) { n = nMarc(k); kM = k; } }); vistaDe(kM, -0.2, 1.0, 0.55); },
      html: function () {
        var g = desfaseH(function () { return true; }), conPar = g.n;
        var filas = fincas.map(function (f?: T, i?: T) { var s: T = {}; f.parcelas.forEach(function (k?: T) { s[k] = 1; }); var d = desfaseH(function (k?: T) { return s[k]; }); return { c: [swFinca(i) + esc(f.nombre), fmt(d.n), fmt(d.d, 1) + " m"] }; });
        var dir = Math.abs(g.dx) >= Math.abs(g.dy) ? (g.dx > 0 ? "al este" : "al oeste") : (g.dy > 0 ? "al norte" : "al sur");
        return "<p>Las marcas de OlivarTrack caen <strong>" + fmt(g.d, 1) + " m " + dir + "</strong> de las copas del LiDAR (mediana de " + fmt(conPar) + " marcas con copa pareada, el " + Math.round(conPar / marc.length * 100) + " % de las " + fmt(marc.length) + "). " +
          "No es un error del LiDAR ni del panel: las marcas se pusieron sobre la ortofoto, y en una ortofoto los árboles altos aparecen desplazados respecto a su pie. El LiDAR sí está bien georreferenciado.</p>" +
          tabla(["Finca", "Marcas con copa", "Desfase"], filas) +
          "<p class='h-nota'>Activa «Desfase entre ambos» arriba para ver las flechas marca → copa.</p>" +
          "<p class='h-decision'><strong>Propuesta para OlivarTrack:</strong> guardar con cada olivo, además del punto marcado, su posición sobre el terreno ya corregida, y usarla para cruzar con LiDAR, NDVI y Vigía.</p>"; } },

    { t: "Preparación del suelo y desvarete", fuente: "OlivarTrack · trabajos (instantánea) · sin personas",
      ir: function () { pon("nube"); marca("cCopas", false); marca("cMarc", false); marca("cDesf", false); marca("cNdvi", false); marca("cTinte", false); marca("cLinde", true);
        pintaTodo(function (k?: T) { var v = tareaH(k, "Desvaretar"); if (v && v.estado === "completado") return COL.ok; return tareasDe(k).length ? COL.atencion : COL.nada; }); vistaFinca(fincaConMasTareas(), -0.5, 0.8, 1); },
      html: function () {
        var ks = todasK().filter(function (k?: T) { return tareasDe(k).length; }), nf = fincas.filter(function (f?: T) { return f.parcelas.some(function (k?: T) { return tareasDe(k).length; }); }).length;
        var filas = ks.map(function (k?: T) { return { c: [swH(k) + esc(parcelas[k].nombre), celdaTarea(tareaH(k, "Soplar Hojas")), celdaTarea(tareaH(k, "Rastra")), celdaTarea(tareaH(k, "Desvaretar"))] }; });
        var hechas = ks.filter(function (k?: T) { var v = tareaH(k, "Desvaretar"); return v && v.estado === "completado"; });
        var fe = hechas.length ? minMax(hechas.map(function (k?: T) { return tareaH(k, "Desvaretar").fecha; })) : null;
        var sinT = fincas.filter(function (f?: T) { return !f.parcelas.some(function (k?: T) { return tareasDe(k).length; }); });
        var raras: T = [];
        ks.forEach(function (k?: T) { tareasDe(k).forEach(function (t?: T) { var a = nMarc(k); if (t.estado === "completado" && t.objetivo != null && a && Math.abs(t.objetivo - a) / a > 0.15) raras.push("<strong>" + esc(parcelas[k].nombre) + "</strong>: «" + esc(t.titulo) + "» figura con " + fmt(t.andados) + " olivos andados de un objetivo de " + fmt(t.objetivo) + ", y la parcela tiene " + fmt(a) + " marcados"); }); });
        return "<p>OlivarTrack tiene trabajos de este otoño en <strong>" + ks.length + " de las " + parcelas.length + " parcelas</strong> (" + nf + " de las " + fincas.length + " fincas). " +
          (fe ? "El desvarete está completado en <strong>" + hechas.length + "</strong> de ellas, entre el " + dd(fe[0]) + " y el " + dd(fe[1]) + ". " : "") + "En cada celda: fecha de cierre y olivos andados / objetivo.</p>" +
          tabla(["Parcela", "Soplar hojas", "Rastra", "Desvaretar"], filas) +
          (sinT.length ? "<p class='h-aviso-t'><strong>" + lista(sinT.map(function (f?: T) { return esc(f.nombre); })) + "</strong> " + (sinT.length === 1 ? "no tiene" : "no tienen") + " ningún trabajo registrado" + (sinT.length === 1 ? " (" + fmt(sinT[0].ha, 1) + " ha y " + fmt(sumaK(sinT[0].parcelas, nMarc)) + " olivos marcados)" : "") + ": en gris en el mapa. O no se ha hecho, o no se ha anotado: el panel no distingue entre las dos cosas.</p>" : "") +
          (raras.length ? "<p><strong>Cifras que no cuadran:</strong> " + raras.join("; ") + ". Puede que el objetivo se guardara con otra zona; conviene mirarlo antes de fiarse del avance.</p>" : "") + origenH(); } },

    { t: "Lo que sigue abierto y lo cancelado", fuente: "OlivarTrack · tareas abiertas y canceladas (instantánea) · sin personas",
      ir: function () { pon("nube"); marca("cCopas", false); marca("cMarc", false); marca("cDesf", false); marca("cNdvi", false); marca("cLinde", true);
        pintaTodo(function (k?: T) { var ts = tareasDe(k); if (ts.some(function (t?: T) { return t.estado === "pendiente"; })) return COL.atencion; if (ts.some(function (t?: T) { return t.estado === "cancelada"; })) return COL_CANC; return null; }); vistaFinca(fincaConMasTareas(), -0.5, 0.8, 1); },
      html: function () {
        var ab: T = [], ca: T = [];
        parcelas.forEach(function (p?: T, k?: T) { tareasDe(k).forEach(function (t?: T) { if (t.estado === "pendiente") ab.push({ k: k, t: t }); else if (t.estado === "cancelada") ca.push({ k: k, t: t }); }); });
        var fila = function (x?: T, e?: T) { return { c: [swH(x.k) + esc(parcelas[x.k].nombre), esc(x.t.titulo), dd(x.t.fecha), e] }; };
        var filas = ab.map(function (x?: T) { return fila(x, "abierta" + (x.t.avance ? " · " + fmt(x.t.avance) + " %" : "")); }).concat(ca.map(function (x?: T) { return fila(x, "cancelada"); }));
        var desv = ca.filter(function (x?: T) { return x.t.titulo === "Desvaretar"; });
        return "<p>Hay <strong>" + ab.length + " tareas abiertas</strong> (en ámbar) y <strong>" + ca.length + " canceladas</strong> (en rojo apagado). En el panel una tarea abierta sale en Hoy › Atención; aquí se ve <em>dónde</em> está.</p>" +
          tabla(["Parcela", "Tarea", "Fecha", "Estado"], filas) +
          (desv.length ? "<p><strong>" + lista(desv.map(function (x?: T) { return esc(parcelas[x.k].nombre); })) + "</strong>: el desvarete figura como cancelado el " + dd(desv[0].t.fecha) + ", así que esa parcela no tiene el desvarete hecho aunque las de su alrededor sí.</p>" : "") +
          "<p class='h-nota'>«Cancelada» es el estado que guarda OlivarTrack; el motivo no se guarda con la tarea.</p>" + origenH(); } },

    { t: "Fenología: casi nada registrado", fuente: "OlivarTrack · fenología (instantánea) · Sentinel-2",
      ir: function () { pon("nube"); marca("cCopas", false); marca("cMarc", false); marca("cLinde", true); var fs: T = []; parcelas.forEach(function (p?: T) { var e = OT.parcelas[p.id]; if (e) e.fenologia.forEach(function (f?: T) { fs.push(f.fecha); }); }); ndviEn(fs.length ? minMax(fs)[0] : "2026-08-25"); marca("cTinte", false);
        pintaTodo(function (k?: T) { var e = OT.parcelas[parcelas[k].id]; return e && e.fenologia.length ? COL.ok : null; });
        var kk = -1; parcelas.forEach(function (p?: T, k?: T) { var e = OT.parcelas[p.id]; if (kk < 0 && e && e.fenologia.length) kk = k; }); if (kk >= 0) vistaDe(kk, -0.4, 0.8, 1); else vistaFinca(-1, -0.45, 0.7, 0.9); },
      html: function () {
        var reg: T = []; parcelas.forEach(function (p?: T, k?: T) { var e = OT.parcelas[p.id]; if (e) e.fenologia.forEach(function (f?: T) { reg.push({ k: k, f: f }); }); });
        var con: T = {}; reg.forEach(function (x?: T) { con[x.k] = 1; });
        var filas = reg.map(function (x?: T) { return { c: [swH(x.k) + esc(parcelas[x.k].nombre), dd(x.f.fecha), esc("BBCH " + x.f.bbch)] }; });
        var raro = false; reg.forEach(function (a?: T) { reg.forEach(function (b?: T) { if (a !== b && a.k === b.k && a.f.fecha === b.f.fecha && Math.abs(a.f.bbch - b.f.bbch) >= 10) raro = true; }); });
        return "<p>Solo <strong>" + Object.keys(con).length + " de las " + parcelas.length + " parcelas</strong> " + (Object.keys(con).length === 1 ? "tiene" : "tienen") + " fenología registrada" + (reg.length ? " (" + reg.length + " anotaciones)" : "") + ". El resto del mapa está sin dato.</p>" +
          (filas.length ? tabla(["Parcela", "Fecha", "Estado"], filas) : "") +
          (raro ? "<p class='h-aviso-t'><strong>Una discrepancia para revisar:</strong> hay dos anotaciones del mismo día con estados muy distintos (65 es plena floración; 75, fruto al 50 % de su tamaño final). Una de las dos está mal, o son dos zonas distintas de la parcela.</p>" : "") +
          "<p>Debajo, el NDVI de Sentinel-2 más cercano (" + dd(NDV.fechas[dp.ndviIdx]) + "): vigor medio de la zona " + fmt(NDV.media[dp.ndviIdx], 2) + ". La escala es relativa, como en Vigía.</p>" + origenH(); } },

    { t: "Cómo está el campo hoy", fuente: "Sentinel-2 L2A (Copernicus) · NDVI a 10 m, 48 fechas",
      ir: function () { pon("gem"); marca("cCopas", false); marca("cMarc", false); marca("cLinde", true); ndviEn(NDV.fechas[NDV.fechas.length - 1]); marca("cTinte", true); resalta({}); vistaFinca(-1, -0.45, 0.65, 0.9); },
      html: function () {
        var n = NDV.fechas.length, im = 0, ix = 0; NDV.media.forEach(function (v?: T, i?: T) { if (v > NDV.media[ix]) ix = i; if (v < NDV.media[im]) im = i; });
        return "<p>Última imagen Sentinel-2 útil: <strong>" + dd(NDV.fechas[n - 1]) + "</strong>, con un vigor medio de <strong>" + fmt(NDV.media[n - 1], 2) + "</strong>. En el último año (" + n + " fechas) el máximo fue de " + fmt(NDV.media[ix], 2) + " el " + dd(NDV.fechas[ix]) + " y el mínimo de " + fmt(NDV.media[im], 2) + " el " + dd(NDV.fechas[im]) + ".</p>" +
          "<p>Las copas toman el tono del vigor de su zona (marrón, menos; verde, más), con la escala relativa de esa fecha. Arrastra la fecha en «NDVI» para ver cómo cambia el año.</p>" +
          "<p>Ojo con lo que mide: a 10 m cada cuadro cubre varios olivos <em>y</em> la cubierta del suelo, así que la subida de primavera es sobre todo hierba entre calles. Es el vigor de una zona, no de un árbol, y ninguna capa está calibrada con observación de campo.</p>" +
          "<p class='h-nota'>En esta versión no se consulta Vigía: lo que ves es solo la imagen de satélite.</p>"; } },

    { t: "El suelo, parcela a parcela", fuente: "SoilGrids (ISRIC) · consulta de producción del 26-oct-2026",
      ir: function () { pon("gem"); marca("cCopas", false); marca("cMarc", false); marca("cNdvi", false); marca("cTinte", false); marca("cLinde", true); pintaTodo(colF); vistaFinca(-1, -0.5, 0.78, 1); },
      html: function () {
        var filas = fincas.map(function (f?: T, i?: T) {
          var ks = f.parcelas.filter(function (k?: T) { return parcelas[k].suelo; }), cl: T = {}, phs: T = [], mos: T = [];
          ks.forEach(function (k?: T) { var r = parcelas[k].suelo[0]; var c = claseUsda(r.a, r.l, r.c); cl[c] = (cl[c] || 0) + 1; phs.push(r.ph); mos.push(r.mo); });
          var txt = Object.keys(cl).sort(function (a?: T, b?: T) { return cl[b] - cl[a]; }).map(function (c?: T) { return c + " (" + cl[c] + ")"; }).join(", ");
          return { c: [swFinca(i) + esc(f.nombre), txt || "sin dato", phs.length ? rango(phs, 1) : "–", mos.length ? rango(mos, 1) : "–"] };
        });
        var sin = parcelas.filter(function (p?: T) { return !p.suelo; }).length;
        return "<p>SoilGrids da la textura, el pH y la materia orgánica de la capa de 0 a 5 cm de " + (parcelas.length - sin) + " de las " + parcelas.length + " parcelas. Resumen por finca (entre paréntesis, nº de parcelas):</p>" +
          tabla(["Finca", "Textura", "pH", "MO %"], filas) +
          "<p class='h-nota'>Es un modelo mundial a 250 m, no una analítica: un valor por parcela, y las parcelas cercanas comparten celda, así que salen casi iguales. Elige una parcela arriba para ver el perfil completo. OlivarTrack no tiene hoy ninguna analítica de suelo de Hituelo con la que contrastarlo.</p>"; } },

    { t: "Relieve, cauces y construcciones", fuente: "LiDAR 2024 (PNOA, CNIG) · MDT de 0,5 m · deducciones del gemelo",
      ir: function () { pon("gem"); marca("cCopas", false); marca("cMarc", false); marca("cNdvi", false); marca("cTinte", false); marca("cLinde", true); resalta({}); vistaFinca(-1, -0.9, 0.5, 0.85); },
      html: function () {
        var P = D.paisaje || {}, ed = (P.edificios || []).length, po = P.tendido && P.tendido.postes ? P.tendido.postes.length : 0, ca = P.arroyo && P.arroyo.ejes ? P.arroyo.ejes : [];
        var noOl = P.arboles || [], nf = noOl.filter(function (a?: T) { return a.tipo === "frondosa"; }).length, nb = noOl.filter(function (a?: T) { return a.tipo === "arbusto"; }).length;
        var filas = fincas.map(function (f?: T, i?: T) {
          var zs = f.parcelas.map(function (k?: T) { return D.z0 + suelo(parcelas[k].centro[0], parcelas[k].centro[1]); });
          return { c: [swFinca(i) + esc(f.nombre), rango(zs.map(function (z?: T) { return Math.round(z / 5) * 5; }), 0) + " m"] };
        });
        return "<p>Altitud del centro de las parcelas de cada finca, a ± unos metros:</p>" + tabla(["Finca", "Altitud"], filas) +
          "<p>Sobre el terreno, el gemelo dibuja <strong>" + ed + " edificios</strong> (medidos: el LiDAR los clasifica), <strong>" + po + " postes de un tendido</strong> y <strong>" + ca.length + " cauces secos</strong>, y <strong>" + fmt(noOl.length) + " árboles que no son olivo</strong> (" + fmt(nf) + " frondosas y " + fmt(nb) + " arbustos).</p>" +
          "<p class='h-nota'>Deducido, no medido: el tendido sale de la alineación de los postes (no hay retornos de cable, el hilo es una curva estimada); los cauces salen de dónde se acumularía el agua según el relieve (no hay clase de agua) y se dibujan secos con una anchura de regla; el tipo de cada árbol sale de su forma. Los cortijos cercanos se funden en una sola huella.</p>"; } },

    { t: "Lo que no sabemos aún", fuente: "OlivarTrack (instantánea) · lo medido por el gemelo",
      ir: function () { pon("orto"); marca("cCopas", false); marca("cMarc", false); marca("cNdvi", false); marca("cTinte", false); marca("cLinde", true); pintaTodo(function (k?: T) { return tareasDe(k).length ? null : COL.nada; }); vistaFinca(-1, -0.5, 0.75, 1); },
      html: function () {
        var sinT = fincas.filter(function (f?: T) { return !f.parcelas.some(function (k?: T) { return tareasDe(k).length; }); });
        var nFen = parcelas.filter(function (p?: T) { var e = OT.parcelas[p.id]; return e && e.fenologia.length; }).length;
        var li: T = [];
        sinT.forEach(function (f?: T) { li.push("<strong>" + esc(f.nombre) + "</strong> (" + f.parcelas.length + " parcelas, " + fmt(f.ha, 1) + " ha, " + fmt(sumaK(f.parcelas, nMarc)) + " olivos marcados) no tiene trabajos, fenología ni analíticas registrados: el mapa la pinta en gris."); });
        li.push("OlivarTrack no tiene ningún pase, entrega ni analítica de estas fincas (" + fmt(OT.pases_finca || 0) + " pases, " + fmt(OT.entregas_finca || 0) + " entregas, " + fmt(OT.analiticas_finca || 0) + " analíticas), y la fenología está en " + nFen + " de " + parcelas.length + " parcelas.");
        li.push("<strong>Frutales:</strong> ninguno está marcado. El LiDAR no distingue un frutal de otro árbol; hay que señalarlos a mano.");
        li.push("<strong>Tendido, cauces y tipo de árbol</strong> son deducciones (escena anterior), no medidas.");
        li.push("<strong>La ortofoto es de julio de 2022 y el LiDAR de 2024:</strong> un arranque o un replante entre medias se ve en la nube y no en la foto.");
        li.push("<strong>Borde norte:</strong> faltan dos hojas LiDAR (404-4181 y 406-4181). Tres teselas de ese borde tienen suelo, pero no nube de puntos ni copas completas.");
        li.push("<strong>Lectura en vivo:</strong> la historia no lee OlivarTrack en vivo (solo la instantánea de arriba). El MCP no devuelve la parcela de cada trabajo y, con 27 parcelas, asignarlos por el nº de olivos daría falsos emparejamientos.");
        return "<p>Un gemelo que solo cuenta lo que sabe sería deshonesto. Esto es lo que <strong>no</strong> sabemos, o sabemos a medias:</p><ul>" + li.map(function (x?: T) { return "<li>" + x + "</li>"; }).join("") + "</ul>"; } }
  ];
  var ESCENAS: T = ESCENAS_H;   // otra finca (el fixture sintético) no tiene recorrido: el botón de empezar se apaga

  // ---------- el aviso de la ventana
  function aviso(txt?: T, tipo?: T) { var e = $("hEstado"); e.textContent = txt; e.setAttribute("data-t", tipo || ""); }
  function pintaEscena() {
    var e = ESCENAS[hist]; $("hTitulo").textContent = (hist + 1) + ". " + e.t; $("hTexto").innerHTML = e.html(); tinta($("hTexto"));
    if (e.alMostrar) e.alMostrar();
    $("hFuente").innerHTML = "<span class=\"h-pill\">Conecta con OlivarTrack</span> " + e.fuente; $("hCont").textContent = (hist + 1) + " de " + ESCENAS.length;
    var pts = $("hPuntos").children; for (var i = 0; i < pts.length; i++) pts[i].setAttribute("aria-current", String(i === hist));
    $("hAnt").disabled = hist === 0; $("hSig").disabled = hist === ESCENAS.length - 1;
  }
  function vaA(i?: T) { hist = Math.max(0, Math.min(ESCENAS.length - 1, i)); $("hIntro").hidden = true; $("hCuerpo").hidden = false; $("hIni").textContent = "Volver a empezar"; if (dp.paseando) dp.salePaseo(); ESCENAS[hist].ir(); pintaEscena(); }
  function saleHistoria() { hist = -1; $("hCuerpo").hidden = true; $("hIntro").hidden = false; $("hIni").textContent = "Empezar el recorrido"; resalta({}); }
  (function () {
    if (!ESCENAS.length) { $("hIni").disabled = true; aviso("Esta finca no tiene recorrido guiado.", ""); return; }
    var cont = $("hPuntos"); ESCENAS.forEach(function (e?: T, i?: T) { var b = document.createElement("button"); b.type = "button"; b.className = "h-punto"; b.setAttribute("aria-label", "Escena " + (i + 1) + ": " + e.t); b.title = e.t; suel.escucha(b, "click", function () { vaA(i); }); suel.nodo(b); cont.appendChild(b); });
    suel.escucha($("hIni"), "click", function () { vaA(0); }); suel.escucha($("hAnt"), "click", function () { vaA(hist - 1); }); suel.escucha($("hSig"), "click", function () { vaA(hist + 1); }); suel.escucha($("hFin"), "click", saleHistoria);
    suel.escucha(window, "keydown", function (e?: T) {
      if (hist < 0 || dp.paseando) return; var t = e.target && e.target.tagName; if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || t === "BUTTON") return;
      if (e.code === "ArrowRight") { vaA(hist + 1); e.preventDefault(); } else if (e.code === "ArrowLeft") { vaA(hist - 1); e.preventDefault(); }
    });
    aviso("Datos: instantánea de OlivarTrack del " + dd(OT.fecha_consulta) + " · sin lectura en vivo", "");
  })();

  // A3-7b1: libera() devuelve la ventana a su estado de antes de empezar, suelta las escuchas y los puntos de escena, y saca las mallas de resalte de la escena con su geometría y su material
  function libera() {
    suel.suelta();
    if (hist >= 0) { var cu = $("hCuerpo"), intro = $("hIntro"), ini = $("hIni"); if (cu) cu.hidden = true; if (intro) intro.hidden = false; if (ini) ini.textContent = "Empezar el recorrido"; hist = -1; }
    overlays.forEach(function (m?: T) { scene.remove(m); m.geometry.dispose(); });
    materiales.libera();   // los materiales de resalte
    overlays.length = 0;
  }
  return { OT: OT, VIVO: VIVO, HistoriaPuro: HistoriaPuro, libera: libera, estado: function () { return { escena: hist, escenas: ESCENAS.length, mallas: overlays.length }; } };
}
export type Historia = ReturnType<typeof creaHistoria>;

/** El manifiesto del componente «historia-recorrido» (ADR-0023): solo ciclo de vida (sin fases). El objeto ya existe antes de que se monte (OT y VIVO los leen 19 y 23 desde el arranque), así que monta()
 *  devuelve ese mismo objeto y libera() llama a su libera(). */
export function manifiestoHistoria(api: { libera(): void }): Manifiesto {
  return {
    id: ID_HISTORIA, version: 1, consume: ["Materiales", "Estaticos", "paseando", "ndviIdx"], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, mundos: ["exterior"], dom: ["#ventanaHistoria", "#tarjetaRecorrido", "[data-abre=\"historia\"]"],   // A3-8b: su ventana, la tarjeta del recorrido y sus iconos, escondidos fuera del exterior
    monta: function () { return api; }, libera: function () { api.libera(); }
  };
}

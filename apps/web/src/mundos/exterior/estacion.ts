// El olivo estacional: la fecha de la estación (el deslizador de la fecha del campo) manda en el sol, el clima, el color de la copa y la fenología. MU5-n (A3-4):
// antes apps/web/motor/23_estacion.js, que queda como extracción parcial (cablea esto y conserva por su nombre EST, bbchEn, construyeFrutosLista, hoyMadrid,
// objetivoMundo y actualizaOlivo). Componente «estacion-olivo» de los mundos ["exterior"], con un libera() que suelta de verdad: el material de las flores y
// las aceitunas, el reloj de la lectura del clima, las escuchas (la fecha del campo, los modos y los botones de la tarjeta) y el gancho window.__otDebug.
// Mismo comportamiento que antes, sin cambio visible.
// Fenología: calendario típico del olivar de Jaén (BBCH según el día del año) ajustado con lo que se ha observado en OlivarTrack.
// Copa: NDVI de la copa de esa fecha (la recta NDVI = a + b·f del suelo, con la copa a + b). Clima: máximas, mínimas y lluvia de esa semana en la estación de Vigía.
// Lo que se ve de esto es estimado o ilustrativo y lo dice su tarjeta («estimado»); la chapita del tiempo, también (L8-05, tiempo-paso.ts).
import type { Manifiesto } from "../../nucleo/componentes.ts";
import type { DefMaterial } from "../../nucleo/materiales.ts";
import { centroPunto, espejoSprites, uvPunto } from "./puntos-tsl.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;

export interface DepsEstacion {
  THREE: A; $: (id: string) => A;
  /** 02i: la fábrica (el material de las flores y aceitunas); 03_escena: el renderer (su alto da el tamaño de los puntos), SRGB y Estado.modo */
  Materiales: A; renderer: A; SRGB: A; Estado: A;
  /** 04d: el ruido; 06: el grupo del follaje; 07_follaje: los materiales de las hojas (el tono de la copa los multiplica) */
  hash: (n: number) => number; gFollaje: A; matHojaG: A; matHojaP: A;
  /** 10_ndvi: NDV y la fecha elegida (ndviIdx cambia: por función); 21_suelo: SN; 13_parcelas: parcelas; 14_historia: OT */
  NDV: A; ndviIdx: () => number; SN: A; parcelas: A[]; OT: A;
  /** 15_tiempo: lo puro, el reloj del mundo, su estado, los formatos y lo que tiende el mundo a enseñar */
  TiempoPuro: A; ahoraMs: () => number; TM: A; fmtHora: A; fmtClaveDia: A; num1: (v: A, d?: A) => string; esc: (s: A) => string; objetivoMundoBase: () => A; aplicaMundo: () => void;
  /** window (__TIEMPO_PRUEBA, fetch, __otDebug), los temporizadores y el constructor de Event del navegador */
  ventana: A; temporizador: { setTimeout(fn: () => void, ms: number): A; clearTimeout(id: A): void }; Evento: A;
}

export const ID_ESTACION = "estacion-olivo";

// ---------------------------------------------------------------- el material por la fábrica (MU5-n: MATERIALES §1, fila 22)
/** el nombre del material de las flores y aceitunas en la fábrica: es también la clave de su variante TSL */
export const MATERIAL_FRUTO_FLOR = "fruto-flor";
/** lo que pide: sus uniformes (uBBCH, uEsc y uLuz: los MISMOS objetos que mueve actualizaOlivo) */
export interface OpcFrutoFlor { uniforms: A }
/** el clásico de siempre, movido: puntos que cambian con el BBCH (flores blancas de 58 a 70,5; aceitunas de verdes a negras de 70,5 a 91), acercados 1 m a la cámara */
export const DEF_FRUTO_FLOR: DefMaterial<OpcFrutoFlor> = {
  clasico: function (o, c) {
    return new (c.THREE as A).ShaderMaterial({
      uniforms: o.uniforms,
      vertexShader: "attribute float aR; attribute float aS; uniform float uBBCH; uniform float uEsc; varying vec3 vCol;\n" +
        "void main(){ float b = uBBCH + (aR - 0.5) * 7.0; float tam = 0.0; vec3 col = vec3(1.0);\n" +
        "if (b >= 58.0 && b < 70.5) { float dens = smoothstep(58.0, 62.0, b) * (1.0 - smoothstep(66.0, 70.5, b)) * 0.8; if (aS < dens) { tam = 0.5; col = vec3(0.97, 0.95, 0.86); } }\n" +
        "else if (b >= 70.5 && b < 91.0) { if (aS < 0.55) { tam = mix(0.25, 0.7, clamp((b - 71.0) / 8.0, 0.0, 1.0)); vec3 verde = vec3(0.5, 0.64, 0.2); vec3 violeta = vec3(0.5, 0.2, 0.38); vec3 negro = vec3(0.17, 0.1, 0.19); col = mix(verde, violeta, smoothstep(80.0, 85.0, b)); col = mix(col, negro, smoothstep(85.0, 90.0, b)); } }\n" +
        "vCol = col; vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.z += 1.0;\n" +
        "if (tam <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; } else { gl_Position = projectionMatrix * mv; gl_PointSize = tam * uEsc / max(0.5, -mv.z); } }",
      fragmentShader: "uniform vec3 uLuz; varying vec3 vCol; void main(){ vec2 d = gl_PointCoord - 0.5; float r2 = dot(d, d); if (r2 > 0.25) discard; float brillo = smoothstep(0.07, 0.0, length(d - vec2(-0.12, 0.12))); gl_FragColor = vec4(sRGBTransferEOTF(vec4(vCol, 1.0)).rgb * uLuz * (0.82 + 0.4 * (0.25 - r2)) + brillo * 0.3 * uLuz, 1.0);\n#include <colorspace_fragment>\n}"
    });
  },
  // MU5-n, tercer commit: la variante TSL, APAGADA (solo con el WebGPURenderer, MU6) y PARCIAL (MATERIALES §11). Un PointsNodeMaterial con las mismas cuentas: el
  // BBCH de cada punto (uBBCH ± 3,5 por aR), el tamaño y el color de flores y aceitunas, el disco con su brillo y la luz (uLuz), con los MISMOS uniformes.
  //   · lleva el tamaño en sizeNode (tam · uEsc / max(0,5, −mv.z), con el metro que lo acerca) y descarta en el fragmento los puntos sin tamaño y fuera del disco;
  //   · FALTA: con el WebGPURenderer un punto mide 1 px salvo como sprite instanciado (MULTIVIEW §2.3): los frutos tienen que pasar a sprites, y eso hay que medirlo;
  //   · DIFIERE: el clásico saca de la pantalla el punto sin tamaño (gl_Position fuera); aquí se descarta en el fragmento. Sin tono, como el clásico (toneMapped = false).
  tsl: function (o, c) {
    var W = c.THREE as A, T = c.TSL as A, un = o.uniforms;
    var m = new W["PointsNodeMaterial"]({ sizeAttenuation: false });
    m.toneMapped = false;
    var num = function (x: A): A { return T.uniform(x.value).onObjectUpdate(function () { return x.value; }); };
    var uBBCH = num(un.uBBCH), uEsc = num(un.uEsc), uLuz = num(un.uLuz), aR = T.attribute("aR", "float"), aS = T.attribute("aS", "float");
    var b = uBBCH.add(aR.sub(0.5).mul(7.0));
    var flor = b.greaterThanEqual(58.0).and(b.lessThan(70.5)), dens = T.smoothstep(58.0, 62.0, b).mul(T.float(1).sub(T.smoothstep(66.0, 70.5, b))).mul(0.8);
    var oliva = b.greaterThanEqual(70.5).and(b.lessThan(91.0));
    var tam = T.select(flor.and(aS.lessThan(dens)), T.float(0.5), T.select(oliva.and(aS.lessThan(0.55)), T.mix(T.float(0.25), T.float(0.7), T.clamp(b.sub(71.0).div(8.0), 0.0, 1.0)), T.float(0)));
    var colO = T.mix(T.mix(T.vec3(0.5, 0.64, 0.2), T.vec3(0.5, 0.2, 0.38), T.smoothstep(80.0, 85.0, b)), T.vec3(0.17, 0.1, 0.19), T.smoothstep(85.0, 90.0, b));
    var col = T.select(flor.and(aS.lessThan(dens)), T.vec3(0.97, 0.95, 0.86), T.select(oliva.and(aS.lessThan(0.55)), colO, T.vec3(1.0)));
    // A4-0: el centro del punto (también en el espejo de sprites, puntos-tsl.ts) y el tamaño en píxeles de la pantalla (gl_PointSize va en píxeles del dispositivo
    // y three multiplica el sizeNode por screenDPR)
    m.positionNode = centroPunto(T);
    // y el adelanto de 1 m hacia la cámara del clásico (mv.z += 1.0, que mueve el punto, no solo su tamaño): en la posición en la vista del material, que three usa
    // para proyectar (setupModelViewProjection) en un Points y en el espejo
    var vista = m.setupPositionView.bind(m); m.setupPositionView = function (bld: A) { return vista(bld).add(T.vec3(0, 0, 1)); };
    var mvz = T.positionView.z;
    m.sizeNode = tam.mul(uEsc).div(T.max(0.5, mvz.negate())).div(T.screenDPR);
    var vTam = T.varying(tam), vCol = T.varying(col), dd = uvPunto(T).sub(0.5), r2 = T.dot(dd, dd);
    m.maskNode = vTam.greaterThan(0.0).and(r2.lessThanEqual(0.25));
    var brillo = T.float(1).sub(T.smoothstep(0.0, 0.07, T.length(dd.sub(T.vec2(-0.12, 0.12)))));   // smoothstep(0.07, 0.0, …) del GLSL: WGSL no deja los bordes al revés
    m.colorNode = T.vec4(T.sRGBTransferEOTF(vCol).mul(uLuz).mul(T.float(0.82).add(T.float(0.25).sub(r2).mul(0.4))).add(uLuz.mul(brillo.mul(0.3))), 1.0);
    return m;
  }
};

export function creaEstacion(d: DepsEstacion) {
  var THREE = d.THREE, $ = d.$, Materiales = d.Materiales, renderer = d.renderer, SRGB = d.SRGB, Estado = d.Estado, hash = d.hash, gFollaje = d.gFollaje, matHojaG = d.matHojaG, matHojaP = d.matHojaP;
  var NDV = d.NDV, SN = d.SN, parcelas = d.parcelas, OT = d.OT, TiempoPuro = d.TiempoPuro, ahoraMs = d.ahoraMs, TM = d.TM, fmtHora = d.fmtHora, fmtClaveDia = d.fmtClaveDia;
  var num1 = d.num1, esc = d.esc, objetivoMundoBase = d.objetivoMundoBase, window = d.ventana;
  // ---------- el olivo estacional: la fecha de la estación (el deslizador de la hierba) manda en el sol, el clima, el color de la copa y la fenología
  var EST: A = { activa: false, deltaMs: 0, clima: null, estado: "", cache: {}, desfase: 0, origen: "", timer: null };
  var BBCH_ANCLAS = [[1, 89], [30, 89], [31, 0], [60, 9], [100, 15], [115, 51], [130, 59], [142, 65], [160, 69], [175, 71], [240, 75], [270, 79], [290, 81], [320, 85], [350, 89], [366, 89]] as number[][];
  function diaDelAnio(iso: string): number { var dd = new Date(iso + "T12:00:00Z"), i = Date.UTC(dd.getUTCFullYear(), 0, 0); return Math.round((dd.getTime() - i) / 86400000); }
  function bbchModelo(doy: number): number {
    var dd = ((doy - 1) % 366 + 366) % 366 + 1;
    for (var i = 1; i < BBCH_ANCLAS.length; i++) { var a = BBCH_ANCLAS[i - 1] as number[], b = BBCH_ANCLAS[i] as number[]; if (dd <= (b[0] as number)) return (a[1] as number) + ((b[1] as number) - (a[1] as number)) * (dd - (a[0] as number)) / Math.max(1e-9, (b[0] as number) - (a[0] as number)); }
    return 89;
  }
  function textoBBCH(b: number): string { b = Math.round(b); return b < 10 ? "reposo y brotación" : b < 50 ? "crecimiento de los brotes" : b < 60 ? "inflorescencias" : b < 70 ? "floración" : b < 80 ? "cuajado y crecimiento del fruto" : "envero y maduración"; }
  function calibraFenologia(): void {   // se desplaza el calendario para que case con lo observado: mediana de (día en que el calendario da ese BBCH − día en que se observó)
    var regs: A[] = []; parcelas.forEach(function (p: A) { var dd = OT && OT.parcelas && OT.parcelas[p.id]; (dd && dd.fenologia || []).forEach(function (f: A) { if (f.bbch != null && f.fecha) regs.push(f); }); });
    if (!regs.length) { EST.desfase = 0; EST.origen = "calendario típico, sin observaciones que lo ajusten"; return; }
    var ds = regs.map(function (f: A) { var dr = diaDelAnio(f.fecha), mejor = dr, md = 1e9; for (var k = Math.max(1, dr - 60); k <= Math.min(366, dr + 60); k++) { var e = Math.abs(bbchModelo(k) - f.bbch); if (e < md) { md = e; mejor = k; } } return mejor - dr; }).sort(function (a: number, b: number) { return a - b; });
    EST.desfase = ds[Math.floor(ds.length / 2)]; var u = regs.slice().sort(function (a: A, b: A) { return String(b.fecha).localeCompare(String(a.fecha)); })[0];
    EST.origen = "calendario típico ajustado con tu fenología (BBCH " + u.bbch + " el " + String(u.fecha).slice(8, 10) + "/" + String(u.fecha).slice(5, 7) + ", " + (EST.desfase === 0 ? "sin desfase" : (EST.desfase > 0 ? "adelanto de " : "retraso de ") + Math.abs(EST.desfase) + " días") + ")";
  }
  function bbchEn(iso: string): number { return bbchModelo(diaDelAnio(iso) + EST.desfase); }
  function copaSerie(): number[] {   // NDVI de la copa de cada fecha: a + b cuando la recta es fiable; si no, se interpola entre las vecinas
    var n = NDV.fechas.length, v: A[] = [], ok: boolean[] = [];
    for (var i = 0; i < n; i++) { var fiable = SN && SN.b[i] >= 0.1; ok.push(fiable); v.push(fiable ? SN.a[i] + SN.b[i] : null); }
    for (var j = 0; j < n; j++) if (v[j] == null) { var l = j - 1, r = j + 1; while (l >= 0 && v[l] == null) l--; while (r < n && v[r] == null) r++; v[j] = l >= 0 && r < n ? v[l] + (v[r] - v[l]) * (j - l) / (r - l) : (l >= 0 ? v[l] : (r < n ? v[r] : 0.7)); }
    return v;
  }
  var COPA: number[] = NDV && SN ? copaSerie() : [], COPA_MIN = 0.56, COPA_MAX = 0.84;
  function vigorCopa(i: number): number { return COPA.length ? Math.max(0, Math.min(1, ((COPA[i] as number) - COPA_MIN) / (COPA_MAX - COPA_MIN))) : 0.6; }

  // --- flores y aceitunas: puntos sobre las copas que cambian con el BBCH (cada uno madura a su ritmo)
  var uFruto = { uBBCH: { value: 0 }, uEsc: { value: 1000 }, uLuz: { value: new THREE.Color(1, 1, 1) } };
  // MU5-n: por la fábrica (define + crea con dueño «estacion-olivo»): lo que cree este componente se libera con su libera()
  Materiales.define(MATERIAL_FRUTO_FLOR, DEF_FRUTO_FLOR);
  var materiales = Materiales.de(ID_ESTACION);
  var matFruto: A = materiales.crea(MATERIAL_FRUTO_FLOR, { uniforms: uFruto });
  // fuera de lo que pinta el sombreador (b = uBBCH ± 3,5; flores con 58 < b < 70,5 y aceitunas con 70,5 ≤ b < 91) ningún punto tiene tamaño:
  // el material no se dibuja y no hay pasada vacía (reposo, brotación y crecimiento de los brotes, de febrero a mayo en el calendario típico)
  function frutosVisibles(b: number): boolean { return b > 54.5 && b < 94.5; }
  matFruto.visible = false;   // hasta que actualizaOlivo dé un BBCH con frutos (sin NDV se queda en 0: nada)
  function construyeFrutosLista(grupo: A): void {   // las flores y aceitunas de un grupo de olivos (una de cada cuatro hojas)
    var pos: number[] = [], aR: number[] = [], aS: number[] = [], k = 0;
    grupo.children.filter(function (o: A) { return o.material === matHojaG || o.material === matHojaP; }).forEach(function (o: A) { var a = o.geometry.attributes.position.array; for (var i = 0; i < a.length; i += 12) { pos.push(a[i], a[i + 1], a[i + 2]); aR.push(hash(k * 7.13)); aS.push(hash(k * 3.71 + 9)); k++; } });
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("aR", new THREE.Float32BufferAttribute(aR, 1)); g.setAttribute("aS", new THREE.Float32BufferAttribute(aS, 1)); g.computeBoundingSphere();
    g.boundingSphere.radius += 1;   // el sombreador acerca cada punto 1 m a la cámara (mv.z += 1.0): con ese margen se recorta sin perder ninguno
    var p = new THREE.Points(g, matFruto); grupo.add(p);
    if (matFruto && matFruto.isNodeMaterial) espejoSprites(THREE, p);   // A4-0: con la TSL (MU6), sprites instanciados (puntos-tsl.ts)
  }

  // --- la fecha manda: sol, clima y fenología
  // el día de hoy en Madrid según el reloj del mundo (ahoraMs: el real, o el de ?hora= / ?fecha=). EV-3a: la estación del olivo arranca HOY (la fenología del
  // calendario de hoy); al mover la fecha del campo a otra imagen, la de esa imagen. La copa (NDVI) es siempre la de la imagen elegida.
  function hoyMadrid(): string { return fmtClaveDia.format(new Date(ahoraMs())); }
  function fechaEstacion(): string { var ndviIdx = d.ndviIdx(); return NDV && ndviIdx !== NDV.fechas.length - 1 ? NDV.fechas[ndviIdx] : hoyMadrid(); }
  var suelto = false;
  function pideClima(iso: string): void {
    if (EST.cache[iso] !== undefined) { EST.clima = EST.cache[iso]; EST.estado = EST.clima ? "" : "sin dato de la estación esa semana"; pintaEstacion(); return; }
    function fin(c: A, msg: string): void { EST.cache[iso] = c; if (!suelto && fechaEstacion() === iso) { EST.clima = c; EST.estado = c ? "" : msg; pintaEstacion(); } }
    if (window.__TIEMPO_PRUEBA && window.__TIEMPO_PRUEBA.semana) { fin(window.__TIEMPO_PRUEBA.semana, ""); return; }
    // el histórico semanal sale de GET /api/tiempo/historico (contratos/tiempo.md); sin servidor o si falla, el clima del mundo sigue siendo el de hoy y se dice
    if (!TM.api) { EST.clima = null; EST.estado = "sin servidor del tiempo: el clima del mundo es " + (TM.origen === "simulado" ? "el simulado de hoy" : "el de hoy"); pintaEstacion(); return; }
    EST.estado = "leyendo el clima de esa semana en Vigía…"; EST.clima = null; pintaEstacion();
    var d1 = new Date(iso + "T12:00:00Z"), d0 = new Date(d1.getTime() - 6 * 86400000), ymd = function (dd: Date) { return dd.toISOString().slice(0, 10); };
    TiempoPuro.leeHistorico(window.fetch ? window.fetch.bind(window) : null, TM.api, ymd(d0), ymd(d1)).then(function (r: A) {
      if (suelto) return;   // lo que llega tras libera() se tira
      if (!r.ok) { if (fechaEstacion() === iso) { EST.clima = null; EST.estado = "no se pudo leer el clima de esa semana (" + TiempoPuro.motivo(r.motivo) + "): el clima del mundo es el de hoy"; pintaEstacion(); } return; }
      var c = TiempoPuro.climaSemana(r.datos, TM.est && TM.est.estacion ? TM.est.estacion.id : null);
      fin(c, "la estación no tiene datos de esa semana");
    });
  }
  function actualizaEstacion(): void {
    var ndviIdx = d.ndviIdx();
    EST.activa = !!NDV && ndviIdx !== NDV.fechas.length - 1;
    var iso = fechaEstacion(); EST.deltaMs = EST.activa ? Date.parse(iso + "T00:00:00Z") - Date.parse(hoyMadrid() + "T00:00:00Z") : 0;
    if (EST.activa) { d.temporizador.clearTimeout(EST.timer); EST.timer = d.temporizador.setTimeout(function () { pideClima(iso); }, 450); } else { EST.clima = null; EST.estado = ""; }
    pintaEstacion(); if (typeof d.aplicaMundo === "function") d.aplicaMundo();
  }
  function objetivoMundo(): A {   // en la estación de otra fecha: el sol de ese día a la hora de ahora y, si hay dato, su temperatura
    var m = objetivoMundoBase(); if (!EST || !EST.activa || TM.demo) return m;
    m.ms += EST.deltaMs;
    if (EST.clima) { var hl = parseInt(fmtHora.format(new Date(m.ms)).slice(0, 2), 10), f = 0.5 + 0.5 * Math.cos(2 * Math.PI * (hl - 15) / 24); m.temp = EST.clima.tmin + (EST.clima.tmax - EST.clima.tmin) * f; m.hr = 75 - 40 * f; m.lluvia = 0; m.nub = 20; m.viento = 1.5; m.dir = 270; }
    return m;
  }
  // las escuchas de los botones de la tarjeta: se rehacen con cada pintado (el innerHTML los cambia) y libera() quita las del último
  var bajasTarjeta: (() => void)[] = [];
  function enTarjeta(el: A, fn: A): void { if (!el) return; el.addEventListener("click", fn); bajasTarjeta.push(function () { el.removeEventListener("click", fn); }); }
  function pintaEstacion(): void {
    var c = $("tEstac"); if (!c || !NDV || suelto) return;
    var ndviIdx = d.ndviIdx();
    var iso = fechaEstacion(), bb = bbchEn(iso), v = vigorCopa(ndviIdx), a = SN ? SN.a[ndviIdx] : null, f = iso.split("-").reverse().join("/"), fImg = String(NDV.fechas[ndviIdx]).split("-").reverse().join("/");
    var h = '<h3>El olivo en esta fecha <span class="t-pill t-pill-m">estimado</span></h3><p class="t-sub">' + (EST.activa ? "Estación del " + f + " (no es hoy). " : "Hoy, " + f + ": la fenología es la del calendario de hoy y el tiempo, el real; la copa, de la imagen más reciente (" + fImg + "). ") + '<button type="button" class="h-btn" id="tHoy"' + (EST.activa ? "" : " hidden") + ">Volver a hoy</button></p>";
    h += '<dl class="t-cifras"><div><dt>Fenología (BBCH)</dt><dd>' + Math.round(bb) + ' <small>' + esc(textoBBCH(bb)) + '</small></dd></div><div><dt>NDVI de la copa</dt><dd>' + (COPA.length ? num1(COPA[ndviIdx], 2) : "—") + ' <small>' + (v > 0.66 ? "vigorosa" : v > 0.33 ? "normal" : "apagada") + '</small></dd></div><div><dt>NDVI del suelo</dt><dd>' + (a != null ? num1(a, 2) : "—") + '</dd></div></dl>';
    h += '<p class="t-sub">' + esc(EST.origen) + ".</p>";
    if (EST.activa) {
      if (EST.clima) h += '<p class="t-sub">Clima de esa semana (estación de Vigía): máx. <strong>' + num1(EST.clima.tmax, 1) + '</strong> °C · mín. <strong>' + num1(EST.clima.tmin, 1) + '</strong> °C · lluvia <strong>' + num1(EST.clima.lluvia, 1) + "</strong> mm" + (EST.clima.tmin <= 0 ? " · <strong>semana con helada</strong>" : "") + (EST.clima.lluvia >= 12 ? " · el arroyo se dibuja con agua (suposición de más de 12 mm en la semana; sin dato de caudal)" : "") + ".</p>";
      else if (EST.estado) h += '<p class="t-sub">' + esc(EST.estado) + ".</p>";
    }
    if (Estado.modo !== "gem") h += '<p class="t-aviso">Las flores y las aceitunas solo se ven en el modo «Gemelo» (copas en 3D). <button type="button" class="h-btn" id="tVerGem">Ver en Gemelo</button></p>';
    h += '<p class="t-sub">Flores y aceitunas son ilustrativas: la etapa sale de un calendario típico, el color de la copa del NDVI y el clima de la estación; no hay conteo de frutos.</p>';
    bajasTarjeta.splice(0).forEach(function (q) { q(); });
    c.innerHTML = h; var vg = $("tVerGem"); enTarjeta(vg, function () { $("mGem").click(); }); var b = $("tHoy"); enTarjeta(b, function () { var s = $("ndviSel"); s.value = NDV.fechas.length - 1; s.dispatchEvent(new d.Evento("input", { bubbles: true })); });
  }
  var tonoO = new THREE.Color(1, 1, 1);
  function actualizaOlivo(_dt: number): void {
    if (!NDV || suelto) return;
    var ndviIdx = d.ndviIdx();
    var iso = fechaEstacion(), bb = bbchEn(iso), v = vigorCopa(ndviIdx), brote = Math.max(0, 1 - Math.abs(bb - 15) / 7) * (bb >= 9 && bb < 30 ? 1 : 0), reposo = bb < 9 || (bb >= 89 && diaDelAnio(iso) < 35) ? 0.04 : 0;
    var vig = 0.9 + 0.2 * v;   // copa apagada: más pardo y más oscura; vigorosa: más verde
    tonoO.setRGB((1.06 - 0.1 * v) * (1 + 0.04 * brote) * (1 - reposo), vig * (1 + 0.12 * brote) * (1 - reposo), (0.96 + 0.06 * v) * (1 - 0.12 * brote) * (1 - reposo), SRGB);
    matHojaG.color.multiply(tonoO); matHojaP.color.multiply(tonoO);
    uFruto.uBBCH.value = bb; matFruto.visible = frutosVisibles(bb); uFruto.uEsc.value = renderer.domElement.height * 0.5; uFruto.uLuz.value.copy(matHojaG.color);
  }
  window.__otDebug = function () { var o = gFollaje.children.length ? gFollaje.children[gFollaje.children.length - 1].children.slice(-1)[0] : null; return { hijos: gFollaje.children.length, puntos: o && o.geometry && o.geometry.attributes.position ? o.geometry.attributes.position.count : -1, bbch: uFruto.uBBCH.value, esc: uFruto.uEsc.value, visible: gFollaje.visible, tipo: o && o.type }; };
  calibraFenologia();
  var bajas: (() => void)[] = [];
  function escucha(el: A, ev: string, fn: A): void { if (!el) return; el.addEventListener(ev, fn); bajas.push(function () { el.removeEventListener(ev, fn); }); }
  (function () {
    var h = $("ndviSel"); if (h) escucha(h, "input", function () { actualizaEstacion(); });   // la fecha del campo, una sola (decisión 88)
    ["mNube", "mGem", "mOrto"].forEach(function (id) { var b = $(id); if (b) escucha(b, "click", function () { d.temporizador.setTimeout(pintaEstacion, 0); }); });
    pintaEstacion();
  })();

  /** Lo que suelta el componente al liberarse: el material de las flores y aceitunas (los puntos, de cada grupo del follaje, se van con él), el reloj de la
   *  lectura del clima, las escuchas (la fecha del campo, los modos y los botones de la tarjeta) y window.__otDebug. Lo que llegue después se tira. */
  function libera(): number {
    if (suelto) return 0;
    suelto = true;
    var n = 0;
    if (EST.timer) { d.temporizador.clearTimeout(EST.timer); EST.timer = null; n++; }
    bajas.splice(0).concat(bajasTarjeta.splice(0)).forEach(function (q) { q(); n++; });
    n += materiales.libera();   // el material de los frutos
    if (window.__otDebug) { delete window.__otDebug; n++; }
    return n;
  }
  return {
    EST: EST, bbchEn: bbchEn, construyeFrutosLista: construyeFrutosLista, hoyMadrid: hoyMadrid, objetivoMundo: objetivoMundo, actualizaOlivo: actualizaOlivo, libera: libera,
    // lo de dentro, para las pruebas
    frutosVisibles: frutosVisibles, fechaEstacion: fechaEstacion, pintaEstacion: pintaEstacion, actualizaEstacion: actualizaEstacion, matFruto: function () { return matFruto; },
    vivos: function (): { escuchas: number; reloj: boolean } { return { escuchas: bajas.length + bajasTarjeta.length, reloj: !!EST.timer }; }
  };
}
export type Estacion = ReturnType<typeof creaEstacion>;

/** El manifiesto del componente «estacion-olivo»: el ciclo de vida del olivo estacional. El objeto que el motor usa (el de 23_estacion.js) es el mismo que monta
 *  (lo crea el legado al cargarse: otros módulos leen sus nombres). Su paso por fotograma es un paso del exterior (90_final.js: actualizaOlivo). */
export function manifiestoEstacion(e: Estacion): Manifiesto {
  return {
    id: ID_ESTACION, version: 1,
    consume: ["Materiales", "matHojaG", "matHojaP", "gFollaje", "TiempoPuro", "TM"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },
    // solo ciclo de vida, como el tiempo: no se apaga desde la URL (otros módulos leen EST, bbchEn y hoyMadrid) y lo que dibuja (los puntos de flores y aceitunas,
    // uno por grupo de olivos del nivel 0) va con el follaje de 07_follaje y lo cuentan los topes de pruebas/presupuesto.json
    presupuesto: { llamadas: 0, triangulos: 0 },
    mundos: ["exterior"],
    monta: function () { return e; },
    libera: function (api) { if (api) (api as Estacion).libera(); }
  };
}

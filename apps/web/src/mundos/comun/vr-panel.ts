// La VR, pieza 3 de 5 (MU5-n, A3-6c; antes la sección 3, la Gente, la ficha con botones, la medida y el gatillo de apps/web/motor/29_vr.js): las láminas flotantes (el panel y las
// fichas: un canvas en un plano que sigue a la cabeza con calma), agarrarlas con el grip, el panel por filas (PanelVR, ADR-0023), la sección Gente, la ficha con botones, la tarjeta de la
// medida y el gatillo. Código movido tal cual (solo se tipan los parámetros); lo que era global del legado llega por el contexto `c` (vr.ts). Lo que crea aquí (una vez por página) y
// suelta en libera(): las tres láminas (plano, material y CanvasTexture; el lienzo, a 1 × 1), las filas de siempre del panel, las escuchas del Bus (la medida), el presentador de
// fichas de VR y la suscripción a Configuración.
import type { T } from "./tipos.ts";
import type { CtxVr } from "./vr-tipos.ts";
import { VrFichaPuro, VrGentePuro } from "./vr-puros.ts";

/** una lámina: el lienzo, su contexto, la textura, el plano y su estado (ini, agarrada, puesta) */
export type Lamina = T;
// las pestañas del panel (U8, decisiones 83-90; la cuarta, Info, EV-1g) y los giros por saltos de Comodidad
export var VR_PESTANAS: [string, string][] = [["mundo", "Mundo"], ["ira", "Ir a"], ["comodidad", "Comodidad"], ["info", "Info"]], VR_GIROS = [15, 30, 45, 60];

  // ----- 3a'') el panel por filas (ADR-0023, C2): cada pestaña es una lista de filas que se apilan desde y0 en orden; una fila no sabe dónde cae, solo su
  // alto. PanelVR.filas(pestaña, { id, orden, alto, visible?(), botones?(b, y), pinta?(cx, y, W, h), firma?(), debug?() }) → quita: b(id, x, y, w, h, texto,
  // fn, encendido) añade un botón pulsable con el rayo (x en px del lienzo de 1.024); h = { fila(texto, y, valor), valores }; firma() se mira dos veces por
  // segundo con el panel abierto y, si cambia, se repinta; debug() se suma a window.__vrDebug(). Las filas de siempre (modos, hora, fecha; parcela y gente;
  // viñeta, giro, relieve y medida) se registran aquí mismo y caen donde caían. PanelVR.tapa(fn): una lámina propia que está delante (la ficha de
  // la baliza espera). PanelVR.cierra() cierra el panel (Y lo vuelve a abrir); PanelVR.rumbo(): hacia dónde mira quien ve el panel de frente.
  // EV2-A3 (menú de muñeca, 31c_muneca.js): PanelVR.alFotograma(fn(dt)) se llama cada fotograma en VR tras las láminas; PanelVR.alGatillo(fn(o, rayo)) se
  // pregunta ANTES que el panel al apretar un gatillo y, si devuelve true, el gatillo es suyo. Los dos devuelven quitar(). PanelVR.conmutaPanel() y
  // PanelVR.conmutaVineta() son lo mismo que Y y X (un solo sitio para los botones, el panel y la muñeca).
// A3-6c: era la IIFE `var PanelVR = (function () { … })()` de 29_vr; ahora una fábrica que crea creaVrPanel (el talón de 29_vr lo publica como PanelVR). El panel y las tres
// acciones (Y, X y el rumbo) son de creaVrPanel y llegan por función.
export interface CtxPanelVR { VRX: T; panel(): T; conmutaPanel(): void; conmutaVineta(): void; rumbo(): number }
export function creaPanelVR(c: CtxPanelVR) {
  var VRX = c.VRX, panel = { get m() { return c.panel().m; } };
  function vrPanelConmuta() { c.conmutaPanel(); }
  function vrVinetaConmuta() { c.conmutaVineta(); }
  function vrRumboPanel() { return c.rumbo(); }
  var filas: T = {}, tapan: T[] = [], porFot: T[] = [], porGat: T[] = [];
  function engancha(l: T, fn: T) { if (typeof fn !== "function") return function () { /* nada */ }; l.push(fn); return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; }
  function fotograma(dt: T) { for (var i = 0; i < porFot.length; i++) { try { porFot[i](dt); } catch (e) { try { console.error("[PanelVR] alFotograma", e); } catch (e2) { /* sin consola */ } } } }
  function gatillo(o: T, rr: T) { for (var i = 0; i < porGat.length; i++) { try { if (porGat[i](o, rr)) return true; } catch (e) { try { console.error("[PanelVR] alGatillo", e); } catch (e2) { /* sin consola */ } } } return false; }
  VR_PESTANAS.forEach(function (t: T) { filas[t[0]] = []; });
  function registra(pestana: T, def: T) {
    if (!filas[pestana] || !def || !def.id || !(def.alto > 0) || filas[pestana].some(function (f: T) { return f.id === def.id; })) return null;
    var f = Object.assign({ orden: 50 }, def, { y: 0, firmaVista: "" }); filas[pestana].push(f);
    filas[pestana].sort(function (a: T, b: T) { return a.orden - b.orden; }); VRX.sucio = true;
    return function () { var l = filas[pestana], i = l.indexOf(f); if (i >= 0) l.splice(i, 1); VRX.sucio = true; };
  }
  function visibles(p: T) { return (filas[p] || []).filter(function (f: T) { try { return !f.visible || f.visible(); } catch (e) { return false; } }); }
  function tapa(fn: T) { if (typeof fn !== "function") return function () { /* nada */ }; tapan.push(fn); return function () { var i = tapan.indexOf(fn); if (i >= 0) tapan.splice(i, 1); }; }
  function tapado() { return tapan.some(function (fn: T) { try { return !!fn(); } catch (e) { return false; } }); }
  function debug() { var o = {}; Object.keys(filas).forEach(function (p: T) { filas[p].forEach(function (f: T) { if (f.debug) { try { Object.assign(o, f.debug()); } catch (e) { /* fila rota */ } } }); }); return o; }
  return { filas: registra, visibles: visibles, tapa: tapa, tapado: tapado, debug: debug, cierra: function () { panel.m.visible = false; VRX.hover = ""; VRX.sucio = true; },
    alFotograma: function (fn: T) { return engancha(porFot, fn); }, alGatillo: function (fn: T) { return engancha(porGat, fn); }, fotograma: fotograma, gatillo: gatillo,
    conmutaPanel: function () { vrPanelConmuta(); }, conmutaVineta: function () { vrVinetaConmuta(); }, abierto: function () { return panel.m.visible; },
    repinta: function () { VRX.sucio = true; }, rumbo: function () { return vrRumboPanel(); }, enVR: function () { return VRX.on; } };
}
export type PanelVR = ReturnType<typeof creaPanelVR>;

export function creaVrPanel(c: CtxVr) {
  var d = c.d, VRX = c.VRX, THREE = d.THREE, Estado = d.Estado, LaminasPuro = d.LaminasPuro, Laminas = d.Laminas, Bus = d.Bus, $ = d.$, D = d.D, fmt = d.fmt, texColor = d.texColor;
  var ComponentesPuro = d.ComponentesPuro, EntidadesPuro = d.EntidadesPuro, Entidades = d.Entidades, Usables = d.Usables, Escena3D = d.Escena3D, pon = d.pon, pasoHoraMundo = d.pasoHoraMundo;
  var horaMundoTexto = d.horaMundoTexto, document: T = d.documento, RG = c.rig, TT = c.tele;
  var vrRayoDe = RG.vrRayoDe, vrBoton = RG.vrBoton, vrFlanco = RG.vrFlanco, vrPulso = RG.vrPulso, vrAj = RG.vrAj, vrAjPon = RG.vrAjPon, vrIrA = RG.vrIrA, VRC = RG.VRC, vrSalta = TT.vrSalta;
  var quitar: T[] = [];   // cómo quitar lo que se engancha (filas, escuchas, presentador, Configuración)
  // ----- 3) láminas flotantes (el panel y la ficha): un canvas en un plano que sigue a la cabeza con calma
  function creaLamina(W: T, H: T, pw: T, ph: T): Lamina {
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var tex = texColor(new THREE.CanvasTexture(cv)); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    var m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
    m.renderOrder = 998; m.visible = false;   // se recorta: el plano es fijo (solo se mueve y gira), así que el volumen que calcula three vale siempre
    return { cv: cv, cx: cv.getContext("2d"), tex: tex, m: m, W: W, H: H, pw: pw, ph: ph, ini: false };
  }
  // el panel (1 × 1,06 m; 1.024 px por metro), la ficha de un olivo y la de una baliza (I5: con «Ir a esta baliza» pulsable; 1.239 px por metro)
  var vrMed: T = VrFichaPuro.MEDIDAS;
  // EV2 (doc/sistema/VIABILIDAD-INTERACCION.md §A.5): la interfaz espacial en capas, solo con ?ui=capas (apagada por defecto). Aquí: el rayo ilumina los
  // botones de las láminas del mundo que lo piden (Laminas.apunta; las fichas en el mundo, EV2-A1) y el panel nace y se queda (EV2-A2). Sin la bandera, lo de siempre.
  var VR_CAPAS = ComponentesPuro.valorUrl(d.busqueda, "ui", "capas") === true;
  function creaDe(q: T) { return creaLamina(q.W, q.H, q.pw, q.ph); }
  var panel = creaDe(vrMed.panel), ficha = creaDe(vrMed.ficha), fichaB = creaDe(vrMed.fichaB);
  panel.nombre = "panel"; ficha.nombre = "ficha"; fichaB.nombre = "fichaB";
  function vrBajoRayo(l: T, B: T, rr: T) {   // ¿qué botón de la lámina l hay bajo el rayo? null si el rayo no toca la lámina; false si la toca fuera de los botones
    var ix = rr.intersectObject(l.m, false)[0]; if (!ix || !ix.uv) return null;
    var x = ix.uv.x * l.W, y = (1 - ix.uv.y) * l.H; B = B || [];
    for (var k = 0; k < B.length; k++) if (x >= B[k].x && x <= B[k].x + B[k].w && y >= B[k].y && y <= B[k].y + B[k].h) return B[k];
    return false;
  }
  // VR-L1: dónde nace y cómo sigue cada lámina. La mirada es VRX.mira (la pose de la cabeza, vrCabeza), NUNCA camera.getWorldDirection: tras actualizaPaseo()
  // la cámara lleva la posición del mundo como si fuera local al rig y su lookAt apunta hacia el centro de la finca (era la causa de que el panel naciera de lado).
  // Todas nacen por LaminasPuro.nace (02d), el mismo punto que las láminas del mundo. l.agarrada: la mueve el grip (vrArrastra); l.puesta: la dejó la mano
  // en otro sitio y se queda ahí hasta que se cierra y se abre, hay un salto o te alejas más de VrFichaPuro.ALCANCE m.
  function vrNace(l: T, dist: T, bajo: T) { var n = LaminasPuro.nace(VRX.cab, VRX.mira, dist, bajo); l.m.position.set(n.x, n.y, n.z); l.m.rotation.set(0, n.rotY, 0); l.ini = true; l.puesta = false; }
  function vrMiraCab(l: T) { l.m.rotation.set(0, LaminasPuro.mirando(VRX.cab, l.m.position), 0); }
  function vrSigue(l: T, dt: T, dist: T, bajo: T) {   // la lámina se queda delante de la cabeza, mirándola; solo se recoloca si te alejas o giras mucho
    if (!l.ini) { vrNace(l, dist, bajo); return; }
    if (l.agarrada) return;
    var h = VRX.cab, p = l.m.position;
    if (l.puesta) { if (Math.hypot(p.x - h.x, p.z - h.z) <= VrFichaPuro.ALCANCE) { vrMiraCab(l); return; } l.puesta = false; }
    var t = LaminasPuro.nace(h, VRX.mira, dist, bajo), d = Math.hypot(p.x - t.x, p.z - t.z), ang = LaminasPuro.desvio(h, p, VRX.mira);
    if (d > 0.9 || ang > 1.2 || Math.abs(p.y - t.y) > 0.6) { var k = Math.min(1, dt * 3); p.x += (t.x - p.x) * k; p.y += (t.y - p.y) * k; p.z += (t.z - p.z) * k; }
    vrMiraCab(l);
  }
  function vrQueda(l: T, dist: T, bajo: T, quieto: T) {   // EV2-A2 (?ui=capas): nace delante y se queda en el mundo; mirando siempre a la cabeza (solo gira, no se desplaza)
    if (l.agarrada) return;
    var h = VRX.cab, d = Math.hypot(l.m.position.x - h.x, l.m.position.y - h.y, l.m.position.z - h.z);
    var q = VrFichaPuro.queda({ ini: l.ini, salto: VRX.salto, d: d, quieto: quieto });
    if (q === "espera") l.ini = false;
    else if (q === "nace") vrNace(l, dist, bajo);
    vrMiraCab(l);
  }
  // ----- 3'') VR-L1: agarrar una lámina con el GRIP del mando que la apunta y llevarla a otro sitio. Mientras se aprieta, el punto agarrado sigue al rayo a la
  // misma distancia del mando y la lámina mira a la cabeza (LaminasPuro.agarra/arrastra); al soltar se queda ahí. Vale para el panel, las fichas de olivo y de
  // baliza y las láminas del mundo (Laminas: la previsión, el juego, las fichas en el mundo). El grip izquierdo sigue siendo «correr»: solo agarra si al
  // APRETARLO el rayo izquierdo toca una lámina (y mientras agarra, no corre); si ya lo tenías apretado para correr, pasar el rayo por una lámina no la coge.
  var vrAg: T = null;   // { o (el mando), l (panel, ficha o fichaB) | id (de Laminas), a (LaminasPuro.agarra) }
  function vrAgarra(o: T) {
    var rr = vrRayoDe(o), mejor: T = null;
    [panel, ficha, fichaB].forEach(function (l: T) {
      if (!l.m.visible) return; var ix = rr.intersectObject(l.m, false)[0];
      if (ix && (!mejor || ix.distance < mejor.d)) mejor = { d: ix.distance, l: l, c: { x: l.m.position.x, y: l.m.position.y, z: l.m.position.z }, rotY: l.m.rotation.y };
    });
    var lw = Laminas.bajoRayo(rr);
    if (lw && (!mejor || lw.distancia < mejor.d)) mejor = { d: lw.distancia, id: lw.id, c: { x: lw.pos[0], y: lw.pos[1], z: lw.pos[2] }, rotY: lw.rotY };
    if (!mejor) return false;
    vrAg = { o: o, l: mejor.l || null, id: mejor.id || "", a: LaminasPuro.agarra(rr.ray.origin, rr.ray.direction, mejor.d, mejor.c, mejor.rotY, VRX.cab) };
    if (vrAg.l) vrAg.l.agarrada = true;
    vrPulso(o, 0.3, 20); return true;
  }
  function vrSuelta() { if (!vrAg) return; if (vrAg.l) { vrAg.l.agarrada = false; vrAg.l.puesta = true; } vrPulso(vrAg.o, 0.15, 15); vrAg = null; }
  function vrArrastra(dt: T) {
    if (!vrAg) return;
    var o = vrAg.o, l = vrAg.l, info = l ? null : Laminas.info(vrAg.id);
    if (!o.src || !vrBoton(o.src, 1) || (l && !l.m.visible) || (info && !info.abierta)) { vrSuelta(); return; }
    var rr = vrRayoDe(o), prev = l ? l.m.position : { x: info.pos[0], y: info.pos[1], z: info.pos[2] };
    var n = LaminasPuro.arrastra(vrAg.a, rr.ray.origin, rr.ray.direction, VRX.cab, prev, dt);
    if (l) { l.m.position.set(n.x, n.y, n.z); l.m.rotation.set(0, n.rotY, 0); } else Laminas.mueve(vrAg.id, n.x, n.y, n.z, n.rotY);
  }
  function vrAgarreTic(dt: T) {   // cada fotograma: el flanco del grip de cada mando (de todos y siempre, para no perder ninguno) y el arrastre
    VRC.forEach(function (o: T) { if (vrFlanco("G" + o.i, !!o.src && vrBoton(o.src, 1)) && !vrAg) vrAgarra(o); });
    vrArrastra(dt);
  }
  function vrTexto(cx: T, txt: T, x: T, y: T, ancho: T, alto: T, linea: T, max: T) {   // texto con saltos de línea; devuelve cuántas líneas pintó
    var palabras: T = String(txt).split(/\s+/), l = "", n = 0;
    for (var i = 0; i < palabras.length; i++) {
      var t = l ? l + " " + palabras[i] : palabras[i];
      if (cx.measureText(t).width > ancho && l) { cx.fillText(l, x, y + n * linea); n++; l = palabras[i]; if (n >= max) return n; } else l = t;
    }
    if (l && n < max) { cx.fillText(l, x, y + n * linea); n++; }
    return n;
  }
  function vrRect(cx: T, x: T, y: T, w: T, h: T, r: T) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  function dd2(iso: T) { return iso ? iso.split("-").reverse().join("/") : "–"; }
  // ----- 3a) el panel en cuatro pestañas (U8, decisiones 83-90; la cuarta, Info, EV-1g: la agenda y las aves, que no cabían en Mundo): Mundo (modo, hora, fecha y lo que añadan los componentes, como el tiempo) · Ir a (parcelas y gente con «Ir con») · Comodidad (viñeta, giro, relieve y lo que añadan los componentes, como el sonido; «Medir 60 s» solo con ?debug).
  // «Salir de VR» y las ayudas de los mandos quedan abajo en todas. Botones de 64 px en 1.024 px por metro (6,25 cm a 1 m). Los ajustes de comodidad se leen de Configuración (Ajustes.lee("vr.*"))
  // si ese módulo existe; si no, valen los de siempre (viñeta sí, giro de 30°).
  function vrLeeAjustes() {   // al entrar en la sesión y cada vez que Configuración cambia algo
    var v = vrAj("vr.vineta", VRX.vineta); VRX.vineta = !(v === false || v === "false" || v === 0 || v === "no"); VRX.vinetaTipo = v === "fuerte" ? "fuerte" : "suave";
    var g = Number(vrAj("vr.giro", 30)); VRX.giro = isFinite(g) && g >= 5 && g <= 90 ? g : 30; VRX.sucio = true;
  }
  var vrSuscrito = false;   // 33_ajustes.js se monta después de este módulo: se suscribe al entrar en la sesión, no al cargar
  function vrSuscribe() { if (vrSuscrito) return; var Ajustes = d.Ajustes(); try { if (typeof Ajustes !== "undefined" && Ajustes && Ajustes.alCambiar) { quitar.push(Ajustes.alCambiar(function () { vrLeeAjustes(); })); vrSuscrito = true; } } catch (e) { /* sin Configuración */ } }
  function vrSinEscena() { try { return typeof Escena3D !== "undefined" && Escena3D.resumen().estado === "sin"; } catch (e) { return false; } }   // T8: #sinEscena (HTML) no se ve dentro de las gafas
  function vrMotivoSin() { try { return Escena3D.resumen().motivo || ""; } catch (e) { return ""; } }
  function vrY0() { return 196 + (VRX.sinPint ? 84 : 0); }   // dónde empieza el contenido de la pestaña (px del canvas): debajo de las pestañas y, si hace falta, del letrero
  function vrSlider(id: T, d: T) {
    var s = $(id); if (!s) return;
    if (s.tagName === "SELECT") s.selectedIndex = Math.max(0, Math.min(s.options.length - 1, s.selectedIndex + d)); else s.value = Math.max(Number(s.min), Math.min(Number(s.max), Number(s.value) + d * Number(s.step || 1)));
    s.dispatchEvent(new Event(s.tagName === "SELECT" ? "change" : "input", { bubbles: true })); VRX.sucio = true;
  }
  function vrFecha(d: T) { vrSlider($("hSel") ? "hSel" : "ndviSel", d); }   // una sola fecha del campo (decisión 88)
  // ----- 3a'') el panel por filas (ADR-0023, C2): cada pestaña es una lista de filas que se apilan desde y0 en orden; una fila no sabe dónde cae, solo su
  // alto. PanelVR.filas(pestaña, { id, orden, alto, visible?(), botones?(b, y), pinta?(cx, y, W, h), firma?(), debug?() }) → quita: b(id, x, y, w, h, texto,
  // fn, encendido) añade un botón pulsable con el rayo (x en px del lienzo de 1.024); h = { fila(texto, y, valor), valores }; firma() se mira dos veces por
  // segundo con el panel abierto y, si cambia, se repinta; debug() se suma a window.__vrDebug(). Las filas de siempre (modos, hora, fecha; parcela y gente;
  // viñeta, giro, relieve y medida) se registran aquí mismo y caen donde caían. PanelVR.tapa(fn): una lámina propia que está delante (la ficha de
  // la baliza espera). PanelVR.cierra() cierra el panel (Y lo vuelve a abrir); PanelVR.rumbo(): hacia dónde mira quien ve el panel de frente.
  // EV2-A3 (menú de muñeca, 31c_muneca.js): PanelVR.alFotograma(fn(dt)) se llama cada fotograma en VR tras las láminas; PanelVR.alGatillo(fn(o, rayo)) se
  // pregunta ANTES que el panel al apretar un gatillo y, si devuelve true, el gatillo es suyo. Los dos devuelven quitar(). PanelVR.conmutaPanel() y
  // PanelVR.conmutaVineta() son lo mismo que Y y X (un solo sitio para los botones, el panel y la muñeca).
  var PanelVR = creaPanelVR({ VRX: VRX, panel: function () { return panel; }, conmutaPanel: function () { vrPanelConmuta(); }, conmutaVineta: function () { vrVinetaConmuta(); }, rumbo: function () { return vrRumboPanel(); } });
  function vrPanelConmuta() { panel.m.visible = !panel.m.visible; if (panel.m.visible) { panel.ini = false; VRX.sucio = true; } else VRX.hover = ""; }   // Y, y la muñeca
  function vrVinetaConmuta() { VRX.vineta = !VRX.vineta; vrAjPon("vr.vineta", VRX.vineta ? (vrAj("vr.vineta", "suave") === "fuerte" ? "fuerte" : "suave") : "no"); VRX.sucio = true; }   // X, el panel y la muñeca
  function vrBotones() {
    var B: T[] = [];
    function b(id: T, x: T, y: T, w: T, h: T, txt: T, fn: T, on?: T) { B.push({ id: id, x: x, y: y, w: w, h: h, txt: txt, fn: fn, on: !!on }); }
    if (VRX.mideTarjeta) {   // PB9: «Enviar esta medida a la oficina» (con permiso: solo si se pulsa) y «Cerrar»
      var M = vrMedida(), envia = M.puedeEnviar || M.envio !== "";
      if (envia) b("mideEnvia", 40, 668, 600, 76, M.textoEnvio, function () { Bus.emite("medida:envia"); }, M.envio === "ok");
      b("mideX", envia ? 664 : 372, 668, envia ? 320 : 280, 76, "Cerrar", function () { VRX.mideTarjeta = false; }); return B;
    }   // T7a: con la tarjeta de la medida abierta, solo «Cerrar»
    var y = vrY0(), p = VRX.pestana;
    VR_PESTANAS.forEach(function (t: T, i: T) { b("t_" + t[0], 40 + i * 236, 104, 224, 64, t[1], function () { VRX.pestana = t[0]; VRX.hover = ""; }, p === t[0]); });
    PanelVR.visibles(p).forEach(function (f: T) { f.y = y; if (f.botones) { try { f.botones(b, y); } catch (e) { try { console.error("[PanelVR] " + f.id, e); } catch (e2) { /* sin consola */ } } } y += f.alto; });
    b("sal", 40, 984, 944, 64, "Salir de VR", function () { if (VRX.sesion) VRX.sesion.end(); }, false);   // siempre abajo
    VRX.gente = vrGente(); VRX.genteFirma = VrGentePuro.firma(VRX.gente);   // el estado de Gente también sin su pestaña (para detectar cambios y para las pruebas)
    return B;
  }
  // las filas de siempre, por pestañas (con los mismos altos de antes: caen en los mismos píxeles), las escuchas de la medida y el presentador de fichas de VR. Se enganchan
  // al crearse y, tras un libera(), otra vez en monta() (A3-6c: cada una guarda cómo quitarse)
  function engancha() {
    quitar.push(PanelVR.filas("mundo", { id: "modos", orden: 10, alto: 88, botones: function (b: T, y: T) { ["nube", "gem", "orto"].forEach(function (m: T, i: T) { b("m_" + m, 40 + i * 316, y, 300, 64, ["Nube LiDAR", "Gemelo", "Ortofoto"][i], function () { pon(m); VRX.sucio = true; }, Estado.modo === m); }); } }));
    quitar.push(PanelVR.filas("mundo", { id: "hora", orden: 20, alto: 88, botones: function (b: T, y: T) { b("h-", 420, y, 90, 64, "−", function () { pasoHoraMundo(-1); VRX.sucio = true; }); b("h+", 800, y, 90, 64, "+", function () { pasoHoraMundo(1); VRX.sucio = true; }); },
      pinta: function (cx: T, y: T, W: T, h: T) { h.fila("Hora", y, h.valores.hora); } }));
    quitar.push(PanelVR.filas("mundo", { id: "fecha", orden: 30, alto: 88, botones: function (b: T, y: T) { b("f-", 420, y, 90, 64, "−", function () { vrFecha(-1); }); b("f+", 800, y, 90, 64, "+", function () { vrFecha(1); }); },
      pinta: function (cx: T, y: T, W: T, h: T) { h.fila("Fecha del campo", y, h.valores.fecha); } }));
    quitar.push(PanelVR.filas("ira", { id: "parcela", orden: 10, alto: 96, botones: function (b: T, y: T) { b("p-", 420, y, 90, 64, "◀", function () { vrParcela(-1); }); b("p+", 800, y, 90, 64, "▶", function () { vrParcela(1); }); },
      pinta: function (cx: T, y: T, W: T, h: T) {
        h.fila("Parcela", y); cx.textAlign = "center"; cx.fillStyle = "#ffffff"; cx.font = "bold 24px system-ui, sans-serif";
        var nombre = h.valores.parcela; while (cx.measureText(nombre).width > 270 && nombre.length > 4) nombre = nombre.slice(0, -2); if (nombre !== h.valores.parcela) nombre += "…"; cx.fillText(nombre, 655, y + 33);
      } }));
    quitar.push(PanelVR.filas("ira", { id: "gente", orden: 20, alto: 400, botones: function (b: T, y: T) { vrGenteBotones(b, y); }, pinta: function (cx: T, y: T, W: T) { vrPintaGente(cx, W, y); },
      firma: function () { return VrGentePuro.firma(vrGente()); } }));
    quitar.push(PanelVR.filas("comodidad", { id: "vineta", orden: 10, alto: 88, pinta: function (cx: T, y: T, W: T, h: T) { h.fila("Viñeta", y); },
      botones: function (b: T, y: T) { b("vig", 420, y, 470, 64, "Viñeta: " + (VRX.vineta ? "sí" : "no"), vrVinetaConmuta, VRX.vineta); } }));
    quitar.push(PanelVR.filas("comodidad", { id: "giro", orden: 20, alto: 88, pinta: function (cx: T, y: T, W: T, h: T) { h.fila("Giro", y); },
      botones: function (b: T, y: T) { b("giro", 420, y, 470, 64, "Giro por saltos de " + VRX.giro + "°", function () { var i = VR_GIROS.indexOf(VRX.giro); VRX.giro = VR_GIROS[(i + 1) % VR_GIROS.length]; vrAjPon("vr.giro", String(VRX.giro)); VRX.sucio = true; }, false); } }));
    quitar.push(PanelVR.filas("comodidad", { id: "relieve", orden: 40, alto: 88, pinta: function (cx: T, y: T, W: T, h: T) { h.fila("Relieve", y, h.valores.exag); },
      botones: function (b: T, y: T) { b("e-", 420, y, 90, 64, "−", function () { vrSlider("exag", -1); }); b("e+", 800, y, 90, 64, "+", function () { vrSlider("exag", 1); }); } }));
    quitar.push(Bus.on("medida:empieza", function () { VRX.mideTarjeta = false; panel.m.visible = false; VRX.sucio = true; }));   // a andar: el panel no tapa la vista durante la medida
    quitar.push(Bus.on("medida:envio", function () { VRX.sucio = true; }));   // PB9: cambió el estado del envío (enviando, enviada…): repinta la tarjeta
    quitar.push(Bus.on("medida:fin", function () { VRX.mideTarjeta = true; panel.m.visible = true; panel.ini = false; VRX.sucio = true; }));
    // C7: la ficha común en VR (Usables.presentador): sin acciones, en la lámina pequeña (título y dos líneas «k: v», 14 s); con acciones, en la de los botones
    quitar.push(Usables.presentador("vr", function (f: T) {
      if (f.acciones && f.acciones.length) { VRX.tFicha = 1; return; }
      vrPintaFicha(f.titulo, EntidadesPuro.lineas(f)); VRX.fichaDe = f.id;
    }));
  }
  function vrValores() {
    var parcelas = d.parcelas(), fincas = d.fincas(), NDV = d.NDV(), ndviIdx = d.ndviIdx();
    var pr = parcelas[VRX.parcSel] || parcelas[0], fn = fincas.length > 1 && fincas[pr.finca] ? fincas[pr.finca].nombre + " · " : "";
    return { hora: horaMundoTexto(), fecha: NDV ? dd2(NDV.fechas[ndviIdx]) : "–", exag: fmt(Estado.exag, Estado.exag % 1 ? 2 : 0) + "×", parcela: fn + pr.nombre };
  }
  function vrPintaPanel() {
    VRX.sinPint = vrSinEscena();   // antes de construir los botones: el letrero desplaza el contenido
    var cx = panel.cx, W = panel.W, H = panel.H, B = vrBotones(), v = vrValores(), p = VRX.pestana;
    if (VRX.mideTarjeta) { vrPintaMide(B); return; }
    cx.clearRect(0, 0, W, H); cx.fillStyle = "rgba(14,18,22,0.93)"; vrRect(cx, 0, 0, W, H, 30); cx.fill();
    cx.fillStyle = "#e9eef2"; cx.font = "bold 40px system-ui, sans-serif"; cx.textBaseline = "middle"; cx.textAlign = "left"; cx.fillText(D.titulo_vr || (document.title || "Gemelo"), 40, 54);
    cx.font = "26px system-ui, sans-serif"; cx.fillStyle = "#9fb1bd"; cx.textAlign = "right"; cx.fillText("Y: ocultar · gatillo: pulsar", W - 36, 54); cx.textAlign = "left";
    if (VRX.sinPint) {   // T8: el aviso de la página no se ve en las gafas
      cx.fillStyle = "#5a2b22"; vrRect(cx, 40, 184, W - 80, 72, 14); cx.fill();
      cx.fillStyle = "#ffd9cf"; cx.font = "bold 26px system-ui, sans-serif"; cx.textBaseline = "top"; cx.fillText("Esta finca no tiene escena", 58, 192);
      cx.font = "22px system-ui, sans-serif"; var mo = vrMotivoSin(); while (mo && cx.measureText(mo).width > W - 120 && mo.length > 4) mo = mo.slice(0, -2); cx.fillText(mo, 58, 224); cx.textBaseline = "middle";
    }
    function fila(txt: T, y: T, valor: T) { cx.textAlign = "left"; cx.font = "28px system-ui, sans-serif"; cx.fillStyle = "#c9d5dc"; cx.fillText(txt, 40, y + 33); if (valor !== undefined) { cx.textAlign = "center"; cx.fillStyle = "#ffffff"; cx.font = "bold 30px system-ui, sans-serif"; cx.fillText(valor, 655, y + 33); } }
    var ayuda = { fila: fila, valores: v };
    PanelVR.visibles(p).forEach(function (f: T) {   // las filas pintan lo suyo (rótulos, valores, bloques) y apuntan su firma; los botones van encima
      if (f.pinta) { cx.save(); try { f.pinta(cx, f.y, W, ayuda); } catch (e) { try { console.error("[PanelVR] " + f.id, e); } catch (e2) { /* sin consola */ } } cx.restore(); }
      try { f.firmaVista = f.firma ? f.firma() : ""; } catch (e) { f.firmaVista = ""; }
    });
    B.forEach(function (q: T) {
      cx.fillStyle = VRX.hover === q.id ? "#4a5866" : q.on ? "#2e7d3a" : "#2a3139"; vrRect(cx, q.x, q.y, q.w, q.h, 14); cx.fill();
      cx.fillStyle = "#ffffff"; cx.font = "bold 28px system-ui, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText(q.txt, q.x + q.w / 2, q.y + q.h / 2 + 1);
    });
    cx.textAlign = "left"; cx.font = "22px system-ui, sans-serif"; cx.fillStyle = "#9fb1bd";
    cx.fillText("Mandos: izq. palanca = andar · grip = correr · X = viñeta · Y = panel · grip sobre una ficha = moverla", 40, 890);
    cx.fillText("der. palanca ←→ = girar " + VRX.giro + "° · ↑ = teletransporte · A = volar · B = mirador", 40, 920);
    cx.fillStyle = "#7fe3ff"; cx.fillText(VRX.vuelo ? "Volando: izq. avanza · der. ↑ apunta al suelo; al soltar, bajas allí" : "Caminando por el olivar", 40, 950);
    if (VRX.voz && VRX.voz.toma()) { cx.fillStyle = "#ffd58a"; cx.fillText("Gatillo izquierdo = tu micrófono de la visita guiada (la derecha sigue pulsando el panel)", 40, 990); }
    cx.fillStyle = "#6f808c"; cx.font = "20px system-ui, sans-serif"; cx.fillText("LiDAR PNOA 2024 · © Instituto Geográfico Nacional (CC BY 4.0)", 40, 1074);
    panel.tex.needsUpdate = true; VRX.sucio = false; VRX.botones = B;
  }
  function vrPintaFicha(titulo: T, lineas: T) {
    var cx = ficha.cx, W = ficha.W, H = ficha.H;
    cx.clearRect(0, 0, W, H); cx.fillStyle = "rgba(14,18,22,0.92)"; vrRect(cx, 0, 0, W, H, 22); cx.fill(); cx.textBaseline = "top";
    cx.fillStyle = "#ffffff"; cx.font = "bold 34px system-ui, sans-serif"; cx.fillText(titulo, 26, 18);
    cx.fillStyle = "#cfd9df"; cx.font = "25px system-ui, sans-serif"; var y = 66;
    var LC = vrMed.ficha.lineas.cuerpo; lineas.forEach(function (l: T) { y += vrTexto(cx, l, 26, y, W - 52, 40, LC, 3) * LC; });
    ficha.tex.needsUpdate = true; ficha.m.visible = true; ficha.ini = false; VRX.fichaT = 14;
  }
  function vrRumboPanel() { return ((-panel.m.rotation.y * 180 / Math.PI) % 360 + 360) % 360; }   // hacia dónde mira quien ve el panel de frente (PanelVR.rumbo)
  // ----- 3b) I5: la sección Gente del panel: una fila por persona que se ve (Entidades.lista("persona"): con pose, sin bloquear, no en vista aérea), las más
  // cercanas arriba, con «Ir con» pulsable con el rayo y el gatillo. Ir es su acción «ir» (Usables.usa; en 38_presencia_compartida.js): fundido a negro y de pie a 2,5-4 m de
  // ella, mirándola (Llegada, 12b_llegada.js), nunca un vuelo de cámara; al llegar se cierra el panel (para verla) y Y lo vuelve a abrir.
  var GENTE_FILAS = 4;   // filas que caben en la pestaña «Ir a»; la sección empieza donde le diga la pestaña (px del canvas del panel)
  function vrGente() {   // C7: las personas son entidades (la presencia compartida, 38_presencia_compartida.js, registra el tipo persona); sin ese tipo (sin presencia), null
    var l = Entidades.lista("persona"), pts = l ? l.map(function (q: T) { return { id: q.ref, alias: q.alias, x: q.x, y: q.y, modo: q.modo }; }) : null;
    return VrGentePuro.filas(pts, { x: VRX.cab.x, y: -VRX.cab.z }, GENTE_FILAS);
  }
  function vrGenteBotones(b: T, gy: T) {   // un «Ir con» grande (240 × 64 px = 23 × 6 cm a 1 m) por fila; gy = dónde empieza la sección
    var g = VRX.gente = vrGente(); VRX.genteFirma = VrGentePuro.firma(g);
    g.filas.forEach(function (f: T, i: T) { b("ir:" + f.id, 744, gy + 50 + i * 74, 240, 64, "Ir con", function () { vrIrCon(f.id); }, false); });
  }
  function vrPintaGente(cx: T, W: T, GENTE_Y: T) {   // la sección pinta su texto a la izquierda de sus botones (x < 720): no se pisa con ellos
    var g = VRX.gente || vrGente();
    cx.textBaseline = "middle"; cx.textAlign = "left"; cx.fillStyle = "#e9eef2"; cx.font = "bold 30px system-ui, sans-serif"; cx.fillText("Gente", 40, GENTE_Y + 20);
    cx.textAlign = "right"; cx.font = "24px system-ui, sans-serif"; cx.fillStyle = "#9fb1bd";
    cx.fillText(!g.activo ? "sin presencia compartida" : !g.n ? "nadie más a la vista" : (g.n === 1 ? "1 a la vista" : g.n + " a la vista") + (g.resto ? " · las " + g.filas.length + " más cerca" : ""), W - 36, GENTE_Y + 20);
    cx.textAlign = "left";
    if (!g.filas.length) { cx.font = "28px system-ui, sans-serif"; cx.fillStyle = "#c9d5dc"; cx.fillText("Solo tú", 40, GENTE_Y + 82); return; }
    g.filas.forEach(function (f: T, i: T) {
      var y = GENTE_Y + 50 + i * 74 + 33, t = f.alias + " · " + f.modo + " · " + f.dist;
      cx.font = "bold 28px system-ui, sans-serif"; cx.fillStyle = "#ffffff";
      while (cx.measureText(t).width > 680 && t.length > 4) t = t.slice(0, -2);
      cx.fillText(t, 40, y);
    });
  }
  function vrGenteTic(dt: T) {   // dos veces por segundo, con el panel abierto: ¿cambió lo que enseña alguna fila de la pestaña (la gente, el tiempo…) o el estado de la escena (T8)?
    VRX.tGente += dt; if (VRX.tGente < 0.5) return; VRX.tGente = 0;
    if (vrSinEscena() !== VRX.sinPint) VRX.sucio = true;
    if (!VRX.mideTarjeta) PanelVR.visibles(VRX.pestana).forEach(function (f: T) { if (!f.firma) return; var x = ""; try { x = f.firma(); } catch (e) { /* fila rota */ } if (x !== f.firmaVista) VRX.sucio = true; });
  }
  function vrIrCon(id: T) {
    if (!Usables.usa("persona:" + id, "ir")) { VRX.sucio = true; return false; }   // ya no se ve (se fue, la bloqueaste) o hay un fundido en curso
    panel.m.visible = false; VRX.hover = ""; return true;
  }

  // ----- 3c) la ficha con botones en VR (I5; C7: de cualquier entidad, Usables.abierta()), en su propia lámina: título, el color de su estado, lo destacado
  // (quién está), sus líneas, su pie y sus acciones («Ir a esta baliza», «Ir con»…) más «Cerrar», pulsables con el rayo y el gatillo. Sale cuando hay una
  // abierta (la baliza a menos de 17 m o con el rayo y el gatillo sobre su columna de luz; la persona elegida con el rayo) y no está delante el panel ni la
  // ficha de un olivo. Ir es la acción de la entidad (Usables.usa): fundido y de pie a unos metros, mirándola (Llegada).
  function vrFichaTic(dt: T) {
    VRX.tFicha += dt; if (VRX.tFicha < 0.6) return; VRX.tFicha = 0;
    var id = Usables.abierta(), b = id ? Entidades.ficha(id, "vr") : null;
    if (!b || !b.acciones || !b.acciones.length) { fichaB.m.visible = false; VRX.fichaId = ""; VRX.balFirma = ""; return; }
    if (panel.m.visible || ficha.m.visible || PanelVR.tapado()) { fichaB.m.visible = false; return; }
    var f = JSON.stringify(b);
    if (id !== VRX.fichaId || !fichaB.m.visible) fichaB.ini = false;
    if (id !== VRX.fichaId || f !== VRX.balFirma) { VRX.fichaId = id; VRX.balFirma = f; vrPintaAcciones(b); }
    fichaB.m.visible = true;
  }
  function vrPintaAcciones(b: T) {   // 768 × 480 px en 0,62 × 0,39 m; botones de 72 px (6 cm de alto): las acciones a la izquierda (470 px entre todas) y «Cerrar» a la derecha
    var cx = fichaB.cx, W = fichaB.W, H = fichaB.H, B: T[] = [], y = 70, id = b.id, ac = b.acciones || [], lineas = EntidadesPuro.lineas(b);
    VRX.balInfo = b;
    cx.clearRect(0, 0, W, H); cx.fillStyle = "rgba(14,18,22,0.93)"; vrRect(cx, 0, 0, W, H, 22); cx.fill(); cx.textBaseline = "top"; cx.textAlign = "left";
    if (b.color != null) { cx.fillStyle = "#" + ("000000" + (b.color || 0).toString(16)).slice(-6); vrRect(cx, 0, 22, 10, H - 44, 4); cx.fill(); }   // el color de su estado, como la columna
    cx.fillStyle = "#ffffff"; cx.font = "bold 34px system-ui, sans-serif"; vrTexto(cx, b.titulo || "", 26, 18, W - 52, 0, 40, 1);
    var LB = vrMed.fichaB.lineas;
    if (b.destacado) { cx.fillStyle = "#7fe3ff"; cx.font = "bold 26px system-ui, sans-serif"; y += vrTexto(cx, b.destacado, 26, y, W - 52, 0, LB.destacado, 2) * LB.destacado + 8; }
    cx.fillStyle = "#cfd9df"; cx.font = "24px system-ui, sans-serif";
    for (var i = 0; i < lineas.length && y < H - 160; i++) if (lineas[i]) y += vrTexto(cx, lineas[i], 26, y, W - 52, 0, LB.cuerpo, 2) * LB.cuerpo + 4;
    if (b.pie) { cx.fillStyle = "#6f808c"; cx.font = "18px system-ui, sans-serif"; vrTexto(cx, b.pie, 26, H - 120, W - 52, 0, LB.pie, 1); }
    VrFichaPuro.botonesB(ac, W, H).forEach(function (q: T) {   // EV2-A0: las posiciones, del trozo puro (16 px entre acciones: 12,9 mm)
      q.fn = q.cerrar ? function () { Usables.cierra(id, "cerrada"); fichaB.m.visible = false; VRX.fichaId = ""; VRX.balFirma = ""; } : function () { Usables.usa(id, q.id); };
      B.push(q);
    });
    cx.textBaseline = "middle"; cx.textAlign = "center"; cx.font = "bold 30px system-ui, sans-serif";
    B.forEach(function (q: T) { cx.fillStyle = VRX.hoverB === q.id ? "#4a5866" : q.prim ? "#1d5f6b" : "#2a3139"; vrRect(cx, q.x, q.y, q.w, q.h, 14); cx.fill(); cx.fillStyle = "#ffffff"; cx.fillText(q.txt, q.x + q.w / 2, q.y + q.h / 2 + 1); });
    cx.textAlign = "left"; fichaB.tex.needsUpdate = true; VRX.botonesB = B;
  }
  function vrParcela(d: T) { var parcelas = c.d.parcelas(); VRX.parcSel = (VRX.parcSel + d + parcelas.length) % parcelas.length; var p = parcelas[VRX.parcSel], px = p.centro[0], py = p.centro[1] - 6; VRX.sucio = true; vrSalta(px, py, function () { vrIrA(px, py); }); }
  // T7a: la tarjeta de la medida (30_mide.js) sobre el panel: texto a 29 px en un panel de 1 m (letra de ≈ 2,8 cm, legible a 1 m) y «Cerrar» pulsable con el gatillo
  function vrPintaMide(B: T) {
    var cx = panel.cx, W = panel.W, H = panel.H, M = vrMedida(), r = M.resultado;
    cx.clearRect(0, 0, W, H); cx.fillStyle = "rgba(14,18,22,0.96)"; vrRect(cx, 0, 0, W, H, 30); cx.fill(); cx.textBaseline = "middle"; cx.textAlign = "left";
    if (r) M.lineas.forEach(function (l: T, i: T) { cx.fillStyle = i === 0 ? "#7fe3ff" : i === 4 ? "#ffffff" : "#dbe6ec"; cx.font = (i === 4 ? "bold " : "") + "29px system-ui, sans-serif"; cx.fillText(l, 36, 44 + i * 46, W - 72); });
    else { cx.fillStyle = "#dbe6ec"; cx.font = "30px system-ui, sans-serif"; cx.fillText("Sin medida todavía", 36, 60); }
    B.forEach(function (q: T) { cx.fillStyle = VRX.hover === q.id ? "#4a5866" : "#2e7d3a"; vrRect(cx, q.x, q.y, q.w, q.h, 14); cx.fill(); cx.fillStyle = "#ffffff"; cx.font = "bold 32px system-ui, sans-serif"; cx.textAlign = "center"; cx.fillText(q.txt, q.x + q.w / 2, q.y + q.h / 2 + 1); });
    cx.textAlign = "left"; panel.tex.needsUpdate = true; VRX.sucio = false; VRX.botones = B;
  }
  // lo que dice el medidor de fotogramas (30_mide.js, componente) por el Bus: sin él (?medidor=0) la tarjeta no se abre nunca
  function vrMedida() { var q: T = { res: null }; Bus.emite("medida:estado", q); return q.res || { resultado: null, lineas: [], puedeEnviar: false, envio: "", textoEnvio: "" }; }

  // el gatillo: sobre el panel pulsa un botón; sobre un olivo, abre su ficha
  function vrGatillo(o: T) {
    var rr = vrRayoDe(o);
    if (PanelVR.gatillo(o, rr)) { vrPulso(o, 0.4, 25); return; }   // EV2-A3: el menú de muñeca, si está a la vista, va primero (está más cerca que el panel)
    if (panel.m.visible) {
      var q = vrBajoRayo(panel, VRX.botones, rr);
      if (q) { vrPulso(o, 0.4, 25); q.fn(); VRX.sucio = true; return; }
      if (q === false) return;
    }
    if (fichaB.m.visible) {   // la ficha con botones (I5, C7): sus acciones y «Cerrar»
      var qb = vrBajoRayo(fichaB, VRX.botonesB, rr);
      if (qb) { vrPulso(o, 0.4, 25); qb.fn(); return; }
      if (qb === false) return;
    }
    if (Laminas.toca(rr)) { vrPulso(o, 0.4, 25); return; }   // C8: una lámina del mundo con alTocar (02d_laminas.js) recibe el toque (u, v)
    if (Usables.rayo(rr)) { VRX.tFicha = 1; vrPulso(o, 0.4, 25); }   // C7: lo primero por el rayo (un olivo, la columna de luz de una baliza…); su ficha, abajo
  }

  engancha();
  /** suelta las tres láminas (plano, material y textura; el lienzo a 1 × 1), las filas de siempre, las escuchas del Bus, el presentador y la suscripción a Configuración */
  function libera() {
    vrSuelta();
    quitar.splice(0).forEach(function (f: T) { try { if (typeof f === "function") f(); } catch (e) { /* ya quitado */ } });
    vrSuscrito = false;
    [panel, ficha, fichaB].forEach(function (l: T) { if (l.m.parent) l.m.parent.remove(l.m); l.m.visible = false; l.m.geometry.dispose(); l.m.material.dispose(); l.tex.dispose(); l.cv.width = 1; l.cv.height = 1; l.ini = false; });
  }
  /** tras un libera(): las filas, las escuchas y el presentador otra vez (los planos y las texturas se vuelven a subir solos; los lienzos recuperan su tamaño) */
  function monta() {
    if (quitar.length) return;
    [panel, ficha, fichaB].forEach(function (l: T) { l.cv.width = l.W; l.cv.height = l.H; });
    engancha(); VRX.sucio = true;
  }
  return { creaLamina, panel, ficha, fichaB, vrMed, VR_CAPAS, vrBajoRayo, vrSigue, vrQueda, vrSuelta, vrAgarreTic, agarre: function () { return vrAg; }, vrRect, PanelVR,
    vrPanelConmuta, vrVinetaConmuta, vrLeeAjustes, vrSuscribe, vrPintaPanel, vrPintaFicha, vrGenteTic, vrFichaTic, vrPintaAcciones, vrGatillo, libera, monta };
}
export type VrPanel = ReturnType<typeof creaVrPanel>;

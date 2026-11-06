// La VR, pieza 4 de 5 (MU5-n, A3-6c; antes las secciones 1, 6, 7 y 8 de apps/web/motor/29_vr.js): ¿hay WebXR?, el botón «Entrar en VR», el perfil de rendimiento de las gafas y su
// adaptador por tiempo de fotograma, entrar y salir de la sesión, «sessiongranted» (solo con ?mide o ?debug; lo puro, VrConcedidaPuro, en vr-puros.ts) y los ganchos de depuración.
// Código movido tal cual (solo se tipan los parámetros); lo que era global del legado llega por el contexto `c` (vr.ts). Lo que engancha y suelta en libera(): el botón #btnVR con su
// escucha, la escucha «sessiongranted», el trabajo «vnivel» de la Cola y los ganchos window.__vrDebug, __vrPerfil, __vrOlivo y __vrBotones; si hay sesión abierta, la cierra antes.
// L2-06 (la fuga por sesión): entraVR y vrSale no crean mallas, geometrías, materiales ni texturas (lo vigila memoria_vr.test.js), la escucha «end» de la sesión se quita al salir y
// VRX.frame no se queda con el último XRFrame de una sesión cerrada.
import type { T } from "./tipos.ts";
import type { CtxVr } from "./vr-tipos.ts";
import { VrConcedidaPuro } from "./vr-puros.ts";

export function creaVrSesion(c: CtxVr) {
  var d = c.d, VRX = c.VRX, Nucleo = c.Nucleo, renderer = d.renderer, scene = d.scene, camera = d.camera, Estado = d.Estado, Bus = d.Bus, $ = d.$, Cola = d.Cola, Config = d.Config, VRP = d.VRP, UN = d.UN;
  var XrPerillas = d.XrPerillas, VrControlPuro = d.VrControlPuro, VrPresupuesto = d.VrPresupuesto, Arboles = d.Arboles, Escena3D = d.Escena3D, Aparato = d.Aparato, InfoDibujo = d.InfoDibujo;
  var pon = d.pon, TR = d.TR, pp = d.pp, sol = d.sol, meta = d.meta, suelo = d.suelo, copas = d.copas, horaMundoTexto = d.horaMundoTexto, ndviIdx = d.ndviIdx, cuadro = d.cuadro, tamano = d.tamano;
  var paseando = d.paseando, primera = d.primera, ponPrimera = d.ponPrimera, persona = d.persona, entraPaseo = d.entraPaseo, salePaseo = d.salePaseo, pideFotograma = d.pideFotograma;
  var window: T = d.ventana, document: T = d.documento, navigator: T = d.navegador, location = { search: d.busqueda };
  var RG = c.rig, TT = c.tele, P = c.panel, vrRig = RG.vrRig, VRC = RG.VRC, vrBaseY = RG.vrBaseY, vrAplicaRig = RG.vrAplicaRig, vrVueloEntra = TT.vrVueloEntra, vrVueloSale = TT.vrVueloSale;
  var arco = TT.arco, arcoMarca = TT.arcoMarca, panel = P.panel, ficha = P.ficha, fichaB = P.fichaB, vrSuelta = P.vrSuelta, vrSuscribe = P.vrSuscribe, vrLeeAjustes = P.vrLeeAjustes;
  var PanelVR = P.PanelVR, VR_CAPAS = P.VR_CAPAS, vrVineta = c.vrVineta;
  var suelto = false, boton: T = null, alBoton: T = null, sesionEscuchada: T = null;
  function vrEstado(t: T) { VRX.estado = t; window.VR_ESTADO = "WebXR: " + t; try { console.log("[VR] " + window.VR_ESTADO); } catch (e) { /* sin consola */ } }
  function vrDebugExtra() { return VRX.on ? " · VR nivel " + VRX.nivel + " · " + VRX.emaDt.toFixed(1) + " ms/fot · JS " + VRX.emaJs.toFixed(1) + " ms" + (VRX.vuelo ? " · vuelo" : "") : ""; }

  // ----- 1) ¿hay WebXR? ¿lo bloquea el marco (iframe) en el que se muestra la página?
  async function vrDetecta() {
    var marco = false, pol: T = null;
    try { marco = window.self !== window.top; } catch (e) { marco = true; }
    try { var pd = document.permissionsPolicy || document.featurePolicy; if (pd && pd.allowsFeature) pol = pd.allowsFeature("xr-spatial-tracking"); } catch (e) { /* sin política de permisos */ }
    if (pol === false) { vrEstado("bloqueado por el marco (la política de permisos no concede xr-spatial-tracking)"); return; }
    if (!navigator.xr) { vrEstado("no soportado (este navegador no ofrece WebXR" + (marco ? "; la página va dentro de un marco" : "") + ")"); return; }
    try {
      var ok = await navigator.xr.isSessionSupported("immersive-vr");
      if (ok) { VRX.soporta = true; vrEstado("soportado" + (marco ? " (dentro de un marco; si al entrar falla, es el marco)" : "")); creaBotonVR(); }
      else vrEstado("no soportado (no hay casco o el navegador no ofrece el modo VR inmersivo)");
    } catch (e: T) {
      vrEstado(e && e.name === "SecurityError" ? "bloqueado por el marco (SecurityError al comprobar la sesión VR)" : "no se pudo comprobar: " + (e && (e.name + " " + e.message) || e));
    }
  }
  function creaBotonVR() {
    var ref = $("btnPantalla"); if (!ref || $("btnVR")) return;
    var b = document.createElement("button"); b.type = "button"; b.id = "btnVR"; b.className = ref.className; b.textContent = "🥽 Entrar en VR"; b.title = "Ver el gemelo con las gafas de realidad virtual";
    ref.parentNode.insertBefore(b, ref); alBoton = function () { entraVR(); }; b.addEventListener("click", alBoton); boton = b;   // A3-6c: el botón y su escucha se quitan en libera()
  }

  // ----- 6) el perfil de rendimiento de las gafas y el adaptador por tiempo de fotograma
  var VR_PERFILES = [{ n: 0.8, r: 0.75, tri: 380000, h: 32, b: 1, e: 16 }, { n: 0.55, r: 0.6, tri: 270000, h: 20, b: 0, e: 24 }, { n: 0.35, r: 0.45, tri: 190000, h: 0, b: 0, e: 32 }, { n: 0.2, r: 0.3, tri: 130000, h: 0, b: 0, e: 48 }];   // b: relieve fino del suelo (uBumpK); se apaga en cuanto el fotograma va justo (decisión 24). e: errorTarget (px) de la escena 3D Tiles; valores de partida SIN medir en las gafas
  // C6/OF6: el presupuesto de cada perfil puede venir de la configuración del servidor (escalera.triangulos.gafas, contratos/config.schema.json), SOLO A
  // LA BAJA respecto a estos (Config.param, 02c, lo recorta); la escala adaptativa sigue bajando de perfil si el fotograma se alarga
  Config.al(function () { VR_PERFILES.forEach(function (p: T, i: T) { p.tri = Config.param("escalera.triangulos.gafas." + i, p.tri); }); });
  // Q0c-b: umbrales por casco (VrControlPuro.APARATOS en 02g, por el modelo que da Aparato, del user agent). Llegan con la configuración: URL (?xrjs) > escalera.vrJsMs > tabla > 8 ms
  Config.al(function () { var u = VrControlPuro.umbrales(Aparato.modelo()); VRX.umb = u; XrPerillas.defJs = u.baja; XrPerillas.tablaSube = u.sube; XrPerillas.configJs = Config.param("escalera.vrJsMs", u.baja); });
  function vrPerfil(n: T) { n = Math.max(0, Math.min(VR_PERFILES.length - 1, n)); VRX.nivel = n; Cola.cancela("vnivel"); var p = VR_PERFILES[n]!; VRP.hierba = p.h; UN.uBumpK.value = p.b; Arboles.perfil(p); Escena3D.perfil(p); VrPresupuesto.ponEscalon(n); }   // Q0c-a: el resto del presupuesto (paisaje, marcas, copas, sombras, suelo de fondo), en 02g. De golpe: la entrada, __vrPerfil y las pruebas
  // Q0c-b: el cambio de nivel del controlador va repartido por la Cola (un paso por fotograma o menos), no de golpe: el nivel lógico cambia ya y lo demás sigue
  function* vrNivelPasos(n: T) {
    var p = VR_PERFILES[n]!; VRP.hierba = p.h; UN.uBumpK.value = p.b; yield 0;
    Arboles.perfil(p); yield 1;
    Escena3D.perfil(p); yield 2;
    var g = VrPresupuesto.escalonPorPasos(n); while (!g.next().done) yield 3;
  }
  function vrNivelPorCola(n: T) { n = Math.max(0, Math.min(VR_PERFILES.length - 1, n)); VRX.nivel = n; Cola.cancela("vnivel"); Cola.add("vnivel", 5, vrNivelPasos(n)); }   // reserva-ok: por un cambio de nivel, no por fotograma
  // Q0c-b y A1-12: histéresis (VrControlPuro.decide, nucleo/presupuesto.ts): baja con XrPerillas.js() (8 ms de JS) o con fotogramas perdidos de forma sostenida; sube tras N fotogramas buenos (JS < jsSube(), 6 ms; estable() s, 10), el doble tras un rebote
  function vrAdapta(dtMs: T, jsMs: T, dt: T) {
    var d = VrControlPuro.decide(VRX, dtMs, jsMs, dt, VRX.nivel, VR_PERFILES.length - 1, XrPerillas.js(), XrPerillas.jsSube(), XrPerillas.estable(), XrPerillas.fijo(), VrPresupuesto.suelo(XrPerillas.gente()));   // Q0c-c: el último, el nivel mínimo que pide la gente a la vista (0 sin gente). fijo: nivel fijado por la URL, sin controlador (Q0b, 02f)
    if (d > 0) { VRX.nBaj++; vrNivelPorCola(VRX.nivel + 1); } else if (d < 0) { VRX.nAlt++; vrNivelPorCola(VRX.nivel - 1); }
  }
  // Q0c-b: al entrar en VR se precompilan los sombreadores de la escena con la cámara y el renderer ya en modo XR (con multiview el programa es otro y el primer
  // fotograma compilaba todos: candidato al peor de 40-70 ms). compileAsync en las dos builds (three 0.186.1 y super-three 0.185.0 lo tienen); si no está, compile; si falla, sigue sin romper
  function vrPrecompila() {
    var c: T = VRX.compila = { via: "", ok: null, ms: null, t0: performance.now() };   // reserva-ok: una vez por entrada
    try {
      if (typeof renderer.compileAsync === "function") {
        c.via = "compileAsync";
        renderer.compileAsync(scene, camera).then(function () { c.ok = true; c.ms = performance.now() - c.t0; }, function () { c.ok = false; });
      } else if (typeof renderer.compile === "function") { c.via = "compile"; renderer.compile(scene, camera); c.ok = true; c.ms = performance.now() - c.t0; }
    } catch (e) { c.ok = false; }
  }
  function vrFin(dt: T, jsMs: T) { vrAdapta(dt * 1000, jsMs, dt); }

  // ----- 7) entrar y salir
  async function entraVR() {
    var gm = d.gm();
    if (VRX.on || VRX.entrando || !VRX.soporta) return; VRX.entrando = true;
    Bus.emite("audio:desbloquea", {});   // el gesto de pulsar el botón es lo que deja arrancar el audio (quien haga sonido lo atiende)
    var ses: T = null;
    try {
      renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType("local-floor"); renderer.xr.setFramebufferScaleFactor(XrPerillas.efectivas.escala); XrPerillas.antes(renderer);   // Q0b: escala 0,9 y foveación 1 salvo las perillas xr de la URL (02f)
      // F2a: con el multiview pedido (build de VR, 02f) se pide también «layers»: super-three solo lo enciende sobre una capa de proyección (XRWebGLBinding,
      // textureType «texture-array»), y la API de capas de WebXR la exige entre las funciones de la sesión. Sin multiview, la sesión de siempre
      ses = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"].concat(XrPerillas.mv && XrPerillas.mv.activo ? ["layers"] : []) });   // manos: 36_mandos
      VRX.ojo = 0;
      try { await ses.requestReferenceSpace("local-floor"); } catch (e) { renderer.xr.setReferenceSpaceType("local"); VRX.ojo = 1.6; }
      renderer.setAnimationLoop(vrAnimacion);   // antes de setSession: así el bucle de la ventana se para al empezar la sesión
      await renderer.xr.setSession(ses);
    } catch (e: T) {
      VRX.entrando = false; renderer.setAnimationLoop(null); renderer.xr.enabled = false; vrEstado("no se pudo entrar: " + (e && (e.name + " " + e.message) || e)); try { if (ses) ses.end(); } catch (e2) { /* ya cerrada */ } return;
    }
    VRX.sesion = ses; VRX.base = renderer.xr.getReferenceSpace(); VRX.sesionesN++;
    XrPerillas.despues(ses);   // Q0b: foveación de la capa y frecuencia, con lo que anuncia el casco (72 Hz si no se pide otra)
    XrPerillas.mvEnUso(renderer);   // F2a: ¿encendió super-three el multiview en esta sesión? (la línea «VR: …» y la sonda de 30_mide lo dicen)
    ses.addEventListener("end", vrSale); sesionEscuchada = ses;   // L2-06 (A3-6c): la escucha se quita en vrSale; no queda colgada de la sesión cerrada
    vrSuscribe(); vrLeeAjustes(); VRX.pestana = "mundo";
    VRX.modoPrev = Estado.modo; VRX.calPrev = Estado.calidad;
    if (Estado.modo !== "gem") pon("gem"); Estado.calidad = 0; Nucleo.aplicaCamara(gm.ambiente(), camera, true);   // MU2-7: el near/far de VR del mundo activo; el exterior, near 0,1 (AG-2.3; perilla xrnear: ramas a <30 cm sin recortar, a costa de precisión de profundidad lejos) y far 6000
    scene.add(vrRig); vrRig.add(camera); camera.add(vrVineta); camera.position.set(0, VRX.ojo ? 0 : 1.6, 0); camera.quaternion.identity(); VRC.forEach(function (o: T) { vrRig.add(o.c); vrRig.add(o.g); }); Bus.emite("vr:rig-monta", { rig: vrRig }); scene.add(arco); scene.add(arcoMarca); scene.add(panel.m); scene.add(ficha.m); scene.add(fichaB.m); vrVueloEntra();
    VRP.on = true; vrPerfil(XrPerillas.fijo() ? XrPerillas.efectivas.nivel : 0); VrControlPuro.reinicia(VRX);   // A1-12: medias, periodo, perdidos, buenos y castigo, de cero
    if (!paseando()) entraPaseo(); ponPrimera(true); TR.act = false; persona().visible = false; Bus.emite("perros:llegan");
    var r = VRX.rig; r.x = pp.x; r.z = -pp.y; r.yaw = 0; r.y = gm.suelo(pp.x, pp.y) * Estado.exag + vrBaseY(); VRX.vuelo = false; VRX.mirador = false; VRX.prev = {}; VRX.giroOk = true; VRX.movF = 0; VRX.sucio = true; panel.m.visible = true; panel.ini = false; ficha.m.visible = false; fichaB.m.visible = false; VRX.fichaId = ""; VRX.balFirma = "";
    vrAplicaRig(); vrRig.updateMatrixWorld(true); VRX.on = true; VRX.entrando = false; vrEstado("sesión VR en marcha"); vrPrecompila(); Bus.emite("vr:entra");
  }
  function vrAnimacion(t: T, frame: T) { if (!frame || !VRX.on) return; VRX.frame = frame; cuadro(performance.now()); }
  function vrSale() {
    if (!VRX.on && !VRX.sesion) return;
    var gm = d.gm();
    if (sesionEscuchada) { try { sesionEscuchada.removeEventListener("end", vrSale); } catch (e) { /* sesión sin escuchas */ } sesionEscuchada = null; }   // L2-06 (A3-6c)
    vrSuelta(); Cola.cancela("vnivel");
    VRX.on = false; VRP.on = false; VRX.sesion = null; VRX.frame = null; renderer.setAnimationLoop(null);   // L2-06 (A3-6c): sin el último XRFrame, que retenía la sesión cerrada
    renderer.xr.enabled = false;
    vrRig.remove(camera); camera.remove(vrVineta); scene.remove(vrRig); VRC.forEach(function (o: T) { vrRig.remove(o.c); vrRig.remove(o.g); }); Bus.emite("vr:rig-libera"); scene.remove(arco); scene.remove(arcoMarca); scene.remove(panel.m); scene.remove(ficha.m); scene.remove(fichaB.m); vrVueloSale();
    Arboles.perfil(null); Escena3D.perfil(null); VrPresupuesto.ponEscalon(null); UN.uBumpK.value = 1; Estado.calidad = VRX.calPrev; Nucleo.aplicaCamara(gm.ambiente(), camera, false); camera.updateProjectionMatrix(); if (Estado.modo !== VRX.modoPrev) pon(VRX.modoPrev);
    camera.position.set(0, 0, 0); camera.quaternion.identity(); camera.scale.set(1, 1, 1);
    if (paseando()) salePaseo();
    VRX.vuelo = false; VRX.mirador = false; vrEstado("soportado (sesión terminada)"); Bus.emite("vr:sale"); tamano(); pideFotograma();
  }
  // ----- 8) entrar en VR sin pulsar (Q2c; lo puro, VrConcedidaPuro, en vr-puros.ts), SOLO con ?mide o ?debug (medidas automáticas desde adb, doc/sistema/IWSDK.md §2.2-B): el Quest Browser emite «sessiongranted» en navigator.xr cuando la página
  // se abre ya dentro de una sesión inmersiva (arranque por adb) y entonces deja pedir la sesión sin gesto. Entra por el MISMO camino que el botón (entraVR). En una visita normal no escucha nada.
  var vrDeteccion: T = null;
  var alConcedida: T = null;   // A3-6c: la escucha «sessiongranted», para quitarla en libera()
  function vrConcedida() {
    if (!VrConcedidaPuro.pideMedir(location.search) || !navigator.xr || !navigator.xr.addEventListener) return;   // sin ?mide/?debug ni siquiera se escucha
    navigator.xr.addEventListener("sessiongranted", alConcedida = function () {
      Promise.resolve(vrDeteccion).then(function () {   // el evento puede llegar antes de saber si hay soporte: se espera a vrDetecta
        if (!VrConcedidaPuro.decide({ busqueda: location.search, xr: !!navigator.xr, on: VRX.on, entrando: VRX.entrando, soporta: VRX.soporta })) return;
        vrEstado("sessiongranted: se entra en VR sin pulsar (?mide/?debug)"); entraVR();
      });
    });
  }
  window.__vrDebug = function () { var vrAg = P.agarre(); return Object.assign({ on: VRX.on, estado: VRX.estado, capas: VR_CAPAS, nivel: VRX.nivel, rig: JSON.parse(JSON.stringify(VRX.rig)), cabeza: [VRX.cab.x, VRX.cab.y, VRX.cab.z], pp: [pp.x, pp.y], vuelo: VRX.vuelo, panel: panel.m.visible, ficha: ficha.m.visible, hover: VRX.hover, pestana: VRX.pestana, giro: VRX.giro, sinEscena: VRX.sinPint, vinetaOn: VRX.vineta, vineta: vrVineta.material.uniforms.uK.value, sesionesN: VRX.sesionesN, paseando: paseando(), primera: primera(), modo: Estado.modo, exag: Estado.exag, hora: horaMundoTexto(), horaMs: meta.ms, solY: sol.position.y, solI: sol.intensity, ndvi: ndviIdx(), parcSel: VRX.parcSel, panelPos: panel.m.position.toArray(), fichaPos: ficha.m.position.toArray(), mira: [VRX.mira.x, VRX.mira.z], agarre: vrAg ? (vrAg.l ? vrAg.l.nombre : "lamina:" + vrAg.id) : "", panelPuesto: !!panel.puesta, frames: InfoDibujo.fotograma(renderer), nivelArb: Arboles.resumen(), hierba: VRP.hierba, bump: UN.uBumpK.value, perfiles: VR_PERFILES.length, xr: { near: XrPerillas.efectivas.near, topeJs: XrPerillas.js(), subeJs: XrPerillas.jsSube(), estableS: XrPerillas.estable(), umbrales: VRX.umb, compila: VRX.compila, fov: XrPerillas.efectivas.fov, escala: XrPerillas.efectivas.escala, hz: XrPerillas.efectivas.hz, aa: XrPerillas.aa, mv: XrPerillas.mv ? { existe: XrPerillas.mv.existe, activo: XrPerillas.mv.activo, enUso: XrPerillas.mv.enUso == null ? null : XrPerillas.mv.enUso } : null, nivelFijo: XrPerillas.efectivas.nivel, adaptativo: XrPerillas.efectivas.nivel == null, ignorados: XrPerillas.efectivas.ignorados, linea: XrPerillas.linea() }, near: camera.near, far: camera.far,
    panelTam: [panel.W, panel.H, panel.pw, panel.ph], fichaB: fichaB.m.visible, fichaBPos: fichaB.m.position.toArray(), fichaBTam: [fichaB.W, fichaB.H, fichaB.pw, fichaB.ph], fichaId: VRX.fichaId, hoverB: VRX.hoverB, fichaGente: VRX.balInfo && VRX.fichaId ? VRX.balInfo.gente : null,
    tiempo: null, fichaTiempo: null,   // los pone la fila del componente fichas-tiempo (35_fichas_tiempo.js) por PanelVR.debug(), si está
    gente: VRX.gente ? { activo: VRX.gente.activo, n: VRX.gente.n, filas: VRX.gente.filas.map(function (f: T) { return { id: f.id, alias: f.alias, modo: f.modo, dist: f.dist }; }) } : null }, PanelVR.debug()); };
  window.__vrPerfil = function (n: T) { vrPerfil(n); VRX.tNivel = 0; };   // fuerza un perfil (pruebas): el adaptador espera 4 s antes de volver a decidir
  window.__vrOlivo = function () { var h = VRX.cab, b: T = null, bd = 1e9; copas().forEach(function (c: T) { if (!c.oliv) return; var d = Math.hypot(c.x - h.x, -c.y - h.z); if (d > 6 && d < bd) { bd = d; b = c; } }); return b ? [b.x, (suelo(b.x, b.y) + b.h * 0.6) * Estado.exag, -b.y] : null; };
  window.__vrBotones = function (cual: T) { return ((cual === "baliza" ? VRX.botonesB : VRX.botones) || []).map(function (b: T) { return { id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }; }); };
  vrConcedida(); vrDeteccion = vrDetecta();

  /** suelta lo de la sesión: si hay una abierta, la termina (y vrSale lo deja todo como al salir); quita el botón, la escucha «sessiongranted», el trabajo «vnivel» y los ganchos */
  function libera() {
    if (suelto) return; suelto = true;
    if (VRX.sesion) { var s = VRX.sesion; vrSale(); try { s.end(); } catch (e) { /* ya cerrada */ } }
    Cola.cancela("vnivel");
    if (boton) { boton.removeEventListener("click", alBoton); if (boton.parentNode) boton.parentNode.removeChild(boton); boton = null; alBoton = null; }
    if (alConcedida && navigator.xr && navigator.xr.removeEventListener) navigator.xr.removeEventListener("sessiongranted", alConcedida);
    alConcedida = null;
    delete window.__vrDebug; delete window.__vrPerfil; delete window.__vrOlivo; delete window.__vrBotones;
  }
  /** tras un libera(): el botón otra vez si hay WebXR (los ganchos de depuración no vuelven: son de las pruebas) */
  function monta() { if (!suelto) return; suelto = false; if (VRX.soporta) creaBotonVR(); }
  return { vrEstado, vrDebugExtra, VR_PERFILES, vrPerfil, vrNivelPorCola, vrAdapta, vrFin, entraVR, vrSale, libera, monta, deteccion: function () { return vrDeteccion; } };
}
export type VrSesion = ReturnType<typeof creaVrSesion>;

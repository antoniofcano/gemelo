// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: tamano, gm, cuadro, bucle
// Consume: 01_datos (D, $, EXT, FOG0, FOG1), 02_mundo (Mundo, suelo, copas), 02b_cola (Cola, ColaExt),
//   02c_componentes (Reparto, Bus, Pausa, Componentes), 02d_laminas (Laminas), 02e_entidades (Usables), 02f_xr_perillas (XrPerillas),
//   02h_render (Render), 02i_materiales (Materiales), 03_escena (visor, renderer, scene, camera, hemi, sol, colorCss, Estado),
//   04b_escena3d (Escena3D), 04d_sombreado_tiles (SombreadoTiles), 05_nube (actualizaNubeTeselas, actualizaNube), 06_arboles (Arboles0),
//   07_follaje (Follaje), 07ac_lejanos (Lejanos), 07b_arboles (Arboles), 08_marcadores (listo, aplica), 09_camara (objetivo, camara),
//   10_ndvi (Ndvi), 12_paseo (paseando, persona, Paseo, pp, actualizaPaseo), 15_tiempo (actualizaTiempo), 16_vida (Vida, actualizaVida),
//   17_minimapa (actualizaMinimapa), 18_paisaje (actualizaPaisaje), 19_balizas (actualizaBalizas), 21_suelo (recoloreaSuelo, actualizaSuelo),
//   23_estacion (actualizaOlivo), 24_pantalla (transEntrada, transSalida), 28_depura (depuraCuadro),
//   29_vr (VRX, vrRig, vrCierra, vrAbre, vrRecoloca, vrActualiza, vrFin), 31_hud (Hud), 33_ajustes (Ajustes)
// Nota: Arranque y bucle: Mundo.arranca, Componentes.arranca y la lista de pasos del fotograma que recorre el Bucle del núcleo (apps/web/src/nucleo/bucle.ts: try/catch por fotograma, página oculta, reset del espacio XR, contexto perdido). Define el orden de las actualizaciones por fotograma: los módulos que aún no son componentes a mano y los componentes por fases (mundo, tarde, trasRender).
// ===============================================================================

  function tamano() { if (renderer.xr.isPresenting) return; var w = visor.clientWidth, h = visor.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); }
  window.addEventListener("resize", tamano); tamano();
  Mundo.alCargar(function (t) { Arboles.tileCargada(t); });
  Mundo.arranca(function () { Arboles.inicia(); actualizaNubeTeselas(camera.position.x, camera.position.y, camera.position.z); Cola.vacia(10000); recoloreaSuelo(); listo = true; aplica();
    if (/[?&]mundo=vacio(&|$)/.test(location.search)) gm.cambia("vacio").then(function (r) { if (!r.ok) console.error("?mundo=vacio: no se ha podido entrar", r); }); });   // MU2-6/MU2-8: con el exterior ya cargado, al vacío
  var actualizaCarga = Mundos.creaCargaTeselas({ mundo: Mundo, camara: camera, objetivo: objetivo, paseando: function () { return paseando; } });   // el paso «carga de teselas» del exterior
  // un fotograma: lo hace el bucle de la ventana o, en VR, el de las gafas (29_vr.js: vrActualiza). A1-14 (MUNDOS §9.4 fila 8): el bucle vive en apps/web/src/nucleo/bucle.ts (dt, pausa, reparto, ms del render,
  // ahorro de batería, «cuadro:fin»; L7-01, L7-02, L7-10). MU2-3: la lista se parte en dos: los pasos del EXTERIOR (src/mundos/exterior.ts) corren dentro de gm.actualiza y en el Bucle, los de todo mundo. bloque: el del reparto (Q0h); null = se mide dentro; caro: oculta, no corre.
  // MU2-6: las fases «mundo» y «tarde» de Componentes, las láminas y la Cola son de todo mundo y salen del exterior al Bucle, tras gm.actualiza; Escena3D.actualiza, del exterior, va en gm.antesDelRender (tras la Cola y antes del render, como siempre).
  // Lo único que cambia de orden: la fase «mundo» corría entre la nube y los árboles, y ahora corre tras los árboles y la carga de teselas (MUNDOS §3, «Cómo quedó (MU2-6)»).
  var bCamara = Reparto.reg("cámara/paseo/VR"), Bucle, temporizador = function (f, ms) { var h = setTimeout(f, ms); return function () { clearTimeout(h); }; };   // la cámara se registra antes que los del exterior (el reparto lista por orden de registro); Bucle se crea más abajo
  var deTodoMundo = function (o) { return o === camera || o === vrRig || o === persona; };   // MU2-6: lo que congelar el exterior no oculta (quien mira y su rig de VR)
  var hudExterior = ["hudEstado", "mapita", "ndviHud", "ficha", "baliza"].map(function (id) { return $(id); }).filter(Boolean);   // MU2-6: el HUD del exterior (brújula y tiempo, mapa, NDVI, fichas)
  var poseDelPaseo = { lee: function () { return pp; }, pon: function (p) { pp.x = p.x; pp.y = p.y; pp.ang = p.ang; } };   // MU2-6: la pose de quien mira (12_paseo: pp)
  // MU2-7: lo que el Ambiente del exterior lee del legado al aplicarse (el tema, la perilla xrnear y el deslizador #exag pueden haber cambiado); los valores, en src/mundos/exterior.ts
  var ambienteExt = { fondo: function () { return colorCss("--sky").getHex(); }, niebla: { cerca: FOG0, lejos: FOG1 }, luces: [hemi, sol], extension: EXT, nearVr: function () { return XrPerillas.efectivas.near; }, exag: function () { return Number($("exag").value) || 1; } };
  var exterior = Mundos.creaExterior({ suelo: suelo, ext: D.ext, copas: copas, recorre: function (p, dt, t) { Bucle.recorre(p, dt, t); }, cola: ColaExt, pose: poseDelPaseo, ambiente: ambienteExt,
    raices: function () { return scene.children.filter(function (o) { return !deTodoMundo(o); }); }, hud: function () { return hudExterior; }, pasos: [
      { bloque: Reparto.reg("entidades"), fn: function (dt) { Usables.actualiza(dt); } },   // la cercanía (02e_entidades.js): antes que las balizas, que la leen
      { bloque: Reparto.reg("tiempo"), fn: function (dt, t) { actualizaTiempo(dt, t); } }, { bloque: Reparto.reg("olivo (estación)"), fn: function (dt) { actualizaOlivo(dt); } },
      { bloque: Reparto.reg("vida (fauna y perros)"), fn: function (dt) { actualizaVida(dt); } }, { bloque: Reparto.reg("minimapa"), fn: function (dt) { actualizaMinimapa(dt); } },
      { bloque: Reparto.reg("paisaje"), fn: function (dt) { actualizaPaisaje(dt); } }, { bloque: Reparto.reg("balizas"), fn: function (dt) { actualizaBalizas(dt); } },
      { bloque: Reparto.reg("suelo"), fn: function (dt) { actualizaSuelo(dt); } }, { bloque: Reparto.reg("nube"), fn: function (dt) { actualizaNube(dt); } },
      { bloque: Reparto.reg("árboles (niveles)"), fn: function (dt) { Arboles.actualiza(dt); } },
      { bloque: Reparto.reg("carga de teselas"), caro: true, fn: actualizaCarga }
    ], antesDelRender: [{ bloque: Reparto.reg("Escena3D.actualiza"), caro: true, fn: function () { Escena3D.actualiza(); } }] });   // Escena3D: tras Cola.corre (su deuda es para el fotograma siguiente) y antes del render
  var escenaAmb = { scene: scene, camara: camera, renderer: renderer, estado: Estado, color: function (h) { return new THREE.Color(h); }, niebla: function (h, c, l) { return new THREE.Fog(h, c, l); } };   // MU2-7: dónde se aplica el Ambiente
  var luzDe = function (tipo, color, k, pos) { var l = tipo === "ambiental" ? new THREE.AmbientLight(color, k) : new THREE.DirectionalLight(color, k); if (pos) l.position.set(pos[0], pos[1], pos[2]); return l; };   // MU2-7: las luces de un interior, con THREE (src/ no lo importa)
  var gm =Nucleo.creaWorldManager({ fundido: Nucleo.creaFundidoPantalla({ documento: document, contenedor: visor, temporizador: temporizador, vr: { activa: function () { return VRX.on; }, cierra: vrCierra, abre: vrAbre } }), cola: Cola, temporizador: temporizador, ahora: function () { return performance.now(); }, consola: console,
    aplicaAmbiente: function (a) { Nucleo.aplicaAmbiente(a, escenaAmb); },   // MU2-7: el Ambiente del que entra (src/nucleo/ambiente.ts), a oscuras
    avisa: function (ev, d) { Bus.emite(ev, d); }, contexto: function (base) { base.limpia(function () { Componentes.liberaMundo(base.id); Materiales.libera(base.id); }); return base; } });   // avisa: «mundo:entra/sale» paran y retoman los componentes (MU2-5); al liberar un mundo, sus componentes y los materiales que pidió con Materiales.de(id) (MU5-0)
  gm.registra(function () { return Promise.resolve(exterior); }, "exterior");   // el gestor de mundos (MUNDOS §3): el exterior; fundido: en VR el velo de la cabeza, en pantalla uno de DOM
  gm.registra(function () { return Promise.resolve(Mundos.creaVacio({ pose: poseDelPaseo, luz: luzDe })); }, "vacio");   // MU2-6: el interior de prueba, sin entrada para el usuario salvo ?mundo=vacio (MU2-8 lo mide)
  Bucle = Nucleo.creaBucle({
    ahora: function () { return performance.now(); }, pideCuadro: function (fn) { requestAnimationFrame(fn); }, reparto: Reparto,
    enPausa: function () { return Pausa.activa() && !VRX.on; }, pausa: function (dt, t) { Componentes.actualiza("pausa", dt, t); depuraCuadro(t); },   // en pausa: ni cámara, ni módulos, ni Cola, ni render
    alFin: function (FIN) { Bus.emite("cuadro:fin", FIN); }, ahorro: function () { return Ajustes.lee("graficos.ahorro"); },   // FIN.r: ms de renderer.render() (F0, lo lee el medidor)
    xr: { activa: function () { return VRX.on; }, sesion: function () { return VRX.sesion; }, base: function () { return VRX.base; }, recoloca: vrRecoloca },
    aviso: function (s, ms) { if (Hud) Hud.aviso(s, ms); }, consola: console, documento: document, lienzo: renderer.domElement, temporizador: function (fn, ms) { return setTimeout(fn, ms); },
    pasos: [
      { bloque: bCamara, fn: function (dt, t) { if (VRX.on) vrActualiza(dt, t); else if (paseando) { actualizaPaseo(dt); transEntrada(dt); } else { camara(); transSalida(dt); } } },
      { bloque: null, fn: gm.actualiza },   // el mundo activo (el exterior), con sus pasos medidos por dentro
      { bloque: null, fn: function (dt, t) { Componentes.actualiza("mundo", dt, t); Componentes.actualiza("tarde", dt, t); } }, { bloque: Reparto.reg("láminas"), fn: function (dt) { Laminas.revisa(dt); } },   // de todo mundo (MU2-6)
      { bloque: Reparto.reg("Cola"), caro: true, fn: function () { Cola.corre(Arboles.presupuesto()); } }, { bloque: null, fn: gm.antesDelRender },   // la Cola, de todos; lo último del mundo activo (el exterior: Escena3D)
      { render: true, fn: function () { renderer.render(scene, camera); } }, { bloque: null, fn: function (dt, t) { Componentes.actualiza("trasRender", dt, t); } },
      { bloque: Reparto.reg("depura/vrFin"), fn: function (dt, t) { depuraCuadro(t); if (VRX.on) vrFin(dt, performance.now() - t); } }
    ]
  });
  var cuadro = Bucle.cuadro, bucle = Bucle.bucle, reambienta = function () { gm.reaplicaAmbiente(); };   // MU2-7: al cambiar el tema, el Ambiente del activo otra vez (el fondo y la niebla de partida del exterior salen de --sky; antes, pintaFondo de 03_escena)
  new MutationObserver(reambienta).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", reambienta);
  [Mundo, SombreadoTiles, Ndvi, Arboles0, Follaje, Lejanos, Arboles].forEach(function (c) { Componentes.registra(c.componente); });   // MU5-n (A3-1a): los del exterior que el motor lee por su nombre desde que se monta (src/mundos/exterior/): se liberan con él
  Componentes.registra(Vida.componente);   // MU5-n (A3-5): la vida del olivar (el quad, el dron y las estelas; 16_vida.js) se libera con el exterior
  Componentes.registra(Paseo.componente);   // MU5-n (A3-6c): el paseo (12_paseo.js), de todos los mundos; el legado lo usa por su nombre desde que se monta
  Componentes.registra(Vr.componente);   // MU5-n (A3-6c): la VR (29_vr.js), de todos los mundos: el legado la usa por su nombre desde que se monta; se libera con el último mundo
  window.__bucle = Bucle.estado; Componentes.arranca(); gm.arranca("exterior").then(function (r) { if (!r.ok) console.error("el exterior no ha arrancado", r); Render.arranca(renderer, bucle); });   // __bucle: fallos, salidas de VR, ocultación y contexto perdido (pruebas/prueba_vr.js y ?debug); Componentes tras montar todos los ficheros (URL > servidor > defecto de cada manifiesto); el primer fotograma, con el exterior ya entrado (arranca es asíncrona aunque no haya nada que esperar) y, con el renderizador nuevo, tras su init() (02h_render, F1)

// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: tamano, cuadro, bucle
// Consume: 02_mundo (Mundo, suelo), 02b_cola (Cola), 02c_componentes (Reparto, Bus, Pausa, Componentes), 02d_laminas (Laminas),
//   02e_entidades (Usables), 02h_render (Render), 03_escena (visor, renderer, scene, camera), 04b_escena3d (Escena3D),
//   05_nube (actualizaNubeTeselas, actualizaNube), 07b_arboles (Arboles), 08_marcadores (listo, aplica), 09_camara (objetivo, camara),
//   12_paseo (paseando, actualizaPaseo), 15_tiempo (actualizaTiempo), 16_vida (actualizaVida), 17_minimapa (actualizaMinimapa),
//   18_paisaje (actualizaPaisaje), 19_balizas (actualizaBalizas), 21_suelo (recoloreaSuelo, actualizaSuelo), 23_estacion (actualizaOlivo),
//   24_pantalla (transEntrada, transSalida), 28_depura (depuraCuadro), 29_vr (VRX, vrCierra, vrAbre, vrRecoloca, vrActualiza, vrFin), 31_hud (Hud),
//   33_ajustes (Ajustes)
// Nota: Arranque y bucle: Mundo.arranca, Componentes.arranca y la lista de pasos del fotograma que recorre el Bucle del núcleo (apps/web/src/nucleo/bucle.ts: try/catch por fotograma, página oculta, reset del espacio XR, contexto perdido). Define el orden de las actualizaciones por fotograma: los módulos que aún no son componentes a mano y los componentes por fases (mundo, tarde, trasRender).
// ===============================================================================

  function tamano() { if (renderer.xr.isPresenting) return; var w = visor.clientWidth, h = visor.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); }
  window.addEventListener("resize", tamano); tamano();
  Mundo.alCargar(function (t) { Arboles.tileCargada(t); });
  Mundo.arranca(function () { Arboles.inicia(); actualizaNubeTeselas(camera.position.x, camera.position.y, camera.position.z); Cola.vacia(10000); recoloreaSuelo(); listo = true; aplica(); });
  var actualizaCarga = Mundos.creaCargaTeselas({ mundo: Mundo, camara: camera, objetivo: objetivo, paseando: function () { return paseando; } });   // el paso «carga de teselas» del exterior
  // un fotograma: lo hace el bucle de la ventana o, en VR, el de las gafas (29_vr.js: vrActualiza). A1-14 (MUNDOS §9.4 fila 8): el bucle vive en apps/web/src/nucleo/bucle.ts (dt, pausa, reparto, ms del render,
  // ahorro de batería, «cuadro:fin»; L7-01, L7-02, L7-10). MU2-3: la lista se parte en dos, en el orden de siempre: los pasos del EXTERIOR (src/mundos/exterior.ts) corren dentro de gm.actualiza y en el Bucle, los de todo mundo. bloque: el del reparto (Q0h); null = se mide dentro; caro: oculta, no corre.
  // Las fases «mundo» y «tarde» de Componentes, las láminas y la Cola son de todo mundo pero van ENTRE pasos del exterior: un solo gm.actualiza no puede intercalarlos y van dentro para no cambiar el orden (MU2-6 los saca).
  var bCamara = Reparto.reg("cámara/paseo/VR"), Bucle, temporizador = function (f, ms) { var h = setTimeout(f, ms); return function () { clearTimeout(h); }; };   // la cámara se registra antes que los del exterior (el reparto lista por orden de registro); Bucle se crea más abajo
  var exterior = Mundos.creaExterior({ suelo: suelo, recorre: function (p, dt, t) { Bucle.recorre(p, dt, t); }, pasos: [
      { bloque: Reparto.reg("entidades"), fn: function (dt) { Usables.actualiza(dt); } },   // la cercanía (02e_entidades.js): antes que las balizas, que la leen
      { bloque: Reparto.reg("tiempo"), fn: function (dt, t) { actualizaTiempo(dt, t); } }, { bloque: Reparto.reg("olivo (estación)"), fn: function (dt) { actualizaOlivo(dt); } },
      { bloque: Reparto.reg("vida (fauna y perros)"), fn: function (dt) { actualizaVida(dt); } }, { bloque: Reparto.reg("minimapa"), fn: function (dt) { actualizaMinimapa(dt); } },
      { bloque: Reparto.reg("paisaje"), fn: function (dt) { actualizaPaisaje(dt); } }, { bloque: Reparto.reg("balizas"), fn: function (dt) { actualizaBalizas(dt); } },
      { bloque: Reparto.reg("suelo"), fn: function (dt) { actualizaSuelo(dt); } }, { bloque: Reparto.reg("nube"), fn: function (dt) { actualizaNube(dt); } },
      { bloque: null, fn: function (dt, t) { Componentes.actualiza("mundo", dt, t); } }, { bloque: Reparto.reg("árboles (niveles)"), fn: function (dt) { Arboles.actualiza(dt); } },
      { bloque: Reparto.reg("carga de teselas"), caro: true, fn: actualizaCarga },
      { bloque: null, fn: function (dt, t) { Componentes.actualiza("tarde", dt, t); } }, { bloque: Reparto.reg("láminas"), fn: function (dt) { Laminas.revisa(dt); } },
      { bloque: Reparto.reg("Cola"), caro: true, fn: function () { Cola.corre(Arboles.presupuesto()); } }, { bloque: Reparto.reg("Escena3D.actualiza"), caro: true, fn: function () { Escena3D.actualiza(); } }
  ] });
  var gm =Nucleo.creaWorldManager({ fundido: Nucleo.creaFundidoPantalla({ documento: document, contenedor: visor, temporizador: temporizador, vr: { activa: function () { return VRX.on; }, cierra: vrCierra, abre: vrAbre } }), cola: Cola, temporizador: temporizador, ahora: function () { return performance.now(); }, consola: console }); gm.registra(function () { return Promise.resolve(exterior); }, "exterior");   // el gestor de mundos (MUNDOS §3): hoy un solo mundo, el exterior; fundido: en VR el velo de la cabeza, en pantalla uno de DOM
  Bucle = Nucleo.creaBucle({
    ahora: function () { return performance.now(); }, pideCuadro: function (fn) { requestAnimationFrame(fn); }, reparto: Reparto,
    enPausa: function () { return Pausa.activa() && !VRX.on; }, pausa: function (dt, t) { Componentes.actualiza("pausa", dt, t); depuraCuadro(t); },   // en pausa: ni cámara, ni módulos, ni Cola, ni render
    alFin: function (FIN) { Bus.emite("cuadro:fin", FIN); }, ahorro: function () { return Ajustes.lee("graficos.ahorro"); },   // FIN.r: ms de renderer.render() (F0, lo lee el medidor)
    xr: { activa: function () { return VRX.on; }, sesion: function () { return VRX.sesion; }, base: function () { return VRX.base; }, recoloca: vrRecoloca },
    aviso: function (s, ms) { if (Hud) Hud.aviso(s, ms); }, consola: console, documento: document, lienzo: renderer.domElement, temporizador: function (fn, ms) { return setTimeout(fn, ms); },
    pasos: [
      { bloque: bCamara, fn: function (dt, t) { if (VRX.on) vrActualiza(dt, t); else if (paseando) { actualizaPaseo(dt); transEntrada(dt); } else { camara(); transSalida(dt); } } },
      { bloque: null, fn: gm.actualiza },   // el mundo activo (el exterior), con sus pasos medidos por dentro
      { render: true, fn: function () { renderer.render(scene, camera); } }, { bloque: null, fn: function (dt, t) { Componentes.actualiza("trasRender", dt, t); } },
      { bloque: Reparto.reg("depura/vrFin"), fn: function (dt, t) { depuraCuadro(t); if (VRX.on) vrFin(dt, performance.now() - t); } }
    ]
  });
  var cuadro = Bucle.cuadro, bucle = Bucle.bucle;
  window.__bucle = Bucle.estado; Componentes.arranca(); gm.arranca("exterior").then(function (r) { if (!r.ok) console.error("el exterior no ha arrancado", r); Render.arranca(renderer, bucle); });   // __bucle: fallos, salidas de VR, ocultación y contexto perdido (pruebas/prueba_vr.js y ?debug); Componentes tras montar todos los ficheros (URL > servidor > defecto de cada manifiesto); el primer fotograma, con el exterior ya entrado (arranca es asíncrona aunque no haya nada que esperar) y, con el renderizador nuevo, tras su init() (02h_render, F1)

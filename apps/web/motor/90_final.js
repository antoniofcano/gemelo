// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: tamano, cuadro, bucle
// Consume: 02_mundo (Mundo), 02b_cola (Cola), 02c_componentes (Componentes), 02d_laminas (Laminas), 03_escena (visor, renderer, scene, camera),
//   04b_escena3d (Escena3D), 04e_suelo_fondo (SueloFondo), 05_nube (actualizaNubeTeselas, actualizaNube), 07b_arboles (Arboles),
//   08_marcadores (listo, aplica), 09_camara (objetivo, camara), 12_paseo (paseando, actualizaPaseo), 13b_hazas (Hazas),
//   15_tiempo (actualizaTiempo, hace), 16_vida (quita, actualizaVida), 17_minimapa (actualizaMinimapa), 18_paisaje (actualizaPaisaje),
//   19_balizas (actualizaBalizas), 21_suelo (recoloreaSuelo, actualizaSuelo), 22_huellas (actualizaHuellas), 23_estacion (actualizaOlivo),
//   24_pantalla (transEntrada, transSalida), 25_perros (actualizaPerros), 26_presencia (Presencia), 28_depura (depuraCuadro),
//   29_vr (VRX, vrActualiza, vrFin), 30_mide (Mide), 33_ajustes (Ajustes)
// Nota: Arranque y bucle: Mundo.arranca, Componentes.arranca, cuadro() y requestAnimationFrame. Define el orden de las actualizaciones por fotograma: los módulos que aún no son componentes a mano y los componentes por fases (mundo, tarde, trasRender).
// ===============================================================================

  function tamano() { if (renderer.xr.isPresenting) return; var w = visor.clientWidth, h = visor.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); }
  window.addEventListener("resize", tamano); tamano();
  Mundo.alCargar(function (t) { Arboles.tileCargada(t); });
  Mundo.arranca(function () { Arboles.inicia(); actualizaNubeTeselas(camera.position.x, camera.position.y, camera.position.z); Cola.vacia(10000); recoloreaSuelo(); listo = true; aplica(); });
  var tCarga = 0;
  var tOrto = 0;
  function actualizaCarga(dt) { tCarga += dt; if (tCarga < 0.2) return; tCarga = 0; Mundo.actualiza(camera.position.x, camera.position.y, camera.position.z); if (!paseando) Mundo.actualiza(objetivo.x, objetivo.y, objetivo.z); tOrto += 0.2; if (tOrto > 3) { tOrto = 0; Mundo.liberaOrtoLejos(camera.position.x, camera.position.y, camera.position.z); } }
  var tAnt = performance.now();
  // un fotograma: lo hace el bucle de la ventana o, en una sesión de realidad virtual, el de las gafas (29_vr.js: vrActualiza coloca la cabeza donde está el usuario y mueve el «paseo»)
  // Los componentes registrados (02c_componentes.js, ADR-0023) van por fases sin nombrarlos: «mundo» tras la cámara, «tarde» antes de la Cola y «trasRender».
  // Los módulos que aún no son componentes siguen llamándose aquí a mano (migración incremental: cada uno que se convierte quita su llamada).
  function cuadro(t) {
    var dt = Math.min(0.1, (t - tAnt) / 1000); tAnt = t;
    if (VRX.on) vrActualiza(dt, t); else if (paseando) { actualizaPaseo(dt); transEntrada(dt); } else { camara(); transSalida(dt); }
    actualizaTiempo(dt, t); actualizaOlivo(dt); actualizaVida(dt); actualizaMinimapa(dt); actualizaPaisaje(dt); actualizaBalizas(dt); actualizaSuelo(dt); actualizaNube(dt);
    Componentes.actualiza("mundo", dt, t);
    Arboles.actualiza(dt); actualizaCarga(dt); actualizaHuellas(dt); actualizaPerros(dt); Presencia.actualiza(dt); Hazas.actualiza(dt);
    Componentes.actualiza("tarde", dt, t); Laminas.revisa(dt);
    Cola.corre(Arboles.presupuesto()); SueloFondo.actualiza(); Escena3D.actualiza();
    renderer.render(scene, camera); Componentes.actualiza("trasRender", dt, t); depuraCuadro(t); if (VRX.on) vrFin(dt, performance.now() - t); if (Mide.on) Mide.cuadro(t);
  }
  var tAhorro = 0;   // Configuración → Gráficos → Ahorro de batería: salta los fotogramas que llegan antes de ~25 ms (unos 30 por segundo)
  function bucle() { if (VRX.on) return; var ahora = performance.now(); if (Ajustes.lee("graficos.ahorro") && ahora - tAhorro < 25) { requestAnimationFrame(bucle); return; } tAhorro = ahora; cuadro(ahora); requestAnimationFrame(bucle); }
  Componentes.arranca();   // tras montar todos los ficheros: URL > configuración del servidor > defecto de cada manifiesto
  bucle();


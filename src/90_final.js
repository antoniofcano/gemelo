
  function tamano() { if (renderer.xr.isPresenting) return; var w = visor.clientWidth, h = visor.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); }
  window.addEventListener("resize", tamano); tamano();
  Mundo.alCargar(function (t) { Terreno.tileCargada(t); Arboles.tileCargada(t); });
  Mundo.arranca(function () { Arboles.inicia(); Terreno.iniciaMosaico(); Terreno.montaTodas(); actualizaNubeTeselas(camera.position.x, camera.position.y, camera.position.z); Cola.vacia(10000); recoloreaSuelo(); listo = true; aplica(); });
  var tCarga = 0;
  var tOrto = 0;
  function actualizaCarga(dt) { tCarga += dt; if (tCarga < 0.2) return; tCarga = 0; Mundo.actualiza(camera.position.x, camera.position.y, camera.position.z); if (!paseando) Mundo.actualiza(objetivo.x, objetivo.y, objetivo.z); tOrto += 0.2; if (tOrto > 3) { tOrto = 0; Mundo.liberaOrtoLejos(camera.position.x, camera.position.y, camera.position.z); } }
  var tAnt = performance.now();
  // un fotograma: lo hace el bucle de la ventana o, en una sesión de realidad virtual, el de las gafas (29_vr.js: vrActualiza coloca la cabeza donde está el usuario y mueve el «paseo»)
  function cuadro(t) {
    var dt = Math.min(0.1, (t - tAnt) / 1000); tAnt = t;
    if (VRX.on) vrActualiza(dt, t); else if (paseando) { actualizaPaseo(dt); transEntrada(dt); } else { camara(); transSalida(dt); }
    actualizaTiempo(dt, t); actualizaOlivo(dt); actualizaVida(dt); actualizaMinimapa(dt); actualizaPaisaje(dt); actualizaBalizas(dt); actualizaSonido(dt); actualizaSuelo(dt); actualizaTerreno(dt); actualizaNube(dt); Arboles.actualiza(dt); actualizaCarga(dt); actualizaHuellas(dt); actualizaPerros(dt); Cola.corre(Arboles.presupuesto());
    renderer.render(scene, camera); if (DEPURA) depuraCuadro(t); if (VRX.on) vrFin(dt, performance.now() - t);
  }
  function bucle() { if (VRX.on) return; cuadro(performance.now()); requestAnimationFrame(bucle); }
  bucle();


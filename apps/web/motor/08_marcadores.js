// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: gLinde, tmp, listo, aplica, capas, aplicaLuego
// Consume: 01_datos (D, $), 02c_componentes (Bus), 02j_estaticos (Estaticos), 03_escena (scene, Estado), 04d_sombreado_tiles (UN),
//   05_nube (nube, pintaNube), 06_arboles (gArboles, gFollaje, gSombras), 07b_arboles (Arboles), 15_tiempo (colocaBarrera),
//   18_paisaje (colocaPaisaje), 19_balizas (colocaBalizas), 21_suelo (recoloreaSuelo)
// ===============================================================================

  // la linde y lo que cuelga del terreno al aplicar. Las copas del LiDAR, los anillos de OlivarTrack y el desfase son el componente «marcadores-lidar»
  // (08b_marcadores_lidar.js): aplica() les avisa con «mundo:aplica» y capas() con «capas:cambia»; sin él (?marcadores=0) esas tres casillas no hacen nada.
  var gLinde = new THREE.Group();
  Estaticos.congela(gLinde);   // AG-1.15: las barreras (15_tiempo) y la linde (44_lindes) cuelgan de aquí y se congelan al crearlas
  gLinde.name = "lindes"; scene.add(gLinde);   // el nombre lo usa el desglose de llamadas de las pruebas
  // (las lindes son ahora una barrera de luz: ver el bloque del tiempo)
  var tmp = new THREE.Object3D();
  function marcadores() {
    D.parcelas.forEach(function (pr, k) {
      colocaBarrera(k);
    });
    Bus.emite("mundo:aplica");   // el componente de los marcadores recoloca copas, anillos y desfase
  }

  var NOTAS = {
    nube: "Los puntos del vuelo de 2024, con el color de la ortofoto corregido por altura. Los puntos bajos bajo cada copa, en color corteza, son el tronco.",
    gem: "Cada punto del LiDAR es un montoncito de hojas de olivo, de modo que la copa conserva el volumen medido. Los troncos y las ramas son una forma ilustrativa con los 2 o 3 pies habituales del olivo en vaso: el LiDAR mide la copa, no cuántos pies tiene cada árbol (solo llega un punto por olivo a la altura del tronco). Color de la ortofoto.",
    orto: "El terreno real con la ortofoto del PNOA tal cual, sin vegetación en 3D. Las copas se ven desplazadas hacia el este."
  };
  var listo = false;   // los datos de las teselas ya están
  function aplica() {
    if (!listo) return;
    UN.uExag.value = Estado.exag; if (Estado.modo === "nube") pintaNube(); if (Estado.modo === "gem") Arboles.refresca(); marcadores(); colocaPaisaje(); colocaBalizas(); recoloreaSuelo();
    UN.uModoOrto.value = Estado.modo === "orto" ? 1 : 0;   // el relieve (04d) pinta la ortofoto del glb tal cual
    nube.visible = Estado.modo === "nube"; gArboles.visible = Estado.modo === "gem"; gFollaje.visible = Estado.modo === "gem"; gSombras.visible = Estado.modo === "gem";
    $("notaModo").textContent = NOTAS[Estado.modo]; capas();
    if ($("cSolo") && $("cSolo").checked) { gArboles.visible = false; gFollaje.visible = false; gSombras.visible = false; nube.visible = false; }
  }
  function capas() { gLinde.visible = $("cLinde").checked; Bus.emite("capas:cambia"); }   // las casillas de copas, marcas y desfase las atiende su componente
  var pendiente = false;
  function aplicaLuego() { if (pendiente) return; pendiente = true; requestAnimationFrame(function () { pendiente = false; aplica(); }); }

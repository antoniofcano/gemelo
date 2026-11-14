// La VR, pieza 2 de 5 (MU5-n, A3-6c; antes las secciones 2, 2b y el mirador de apps/web/motor/29_vr.js): el arco de teletransporte a pie, el teletransporte desde el aire (vuelo y
// mirador), el fundido a negro (estado y tiempos en nucleo/fundido.ts) y el mirador. Código movido tal cual (solo se tipan los parámetros); lo que era global del legado llega por el
// contexto `c` (vr.ts). Lo que crea aquí (una vez por página) y suelta en libera(): el arco y su marca, la línea del teletransporte desde el aire y el velo negro (geometrías y
// materiales), y el gancho de pruebas window.__vrVuelo.
import type { T } from "./tipos.ts";
import type { CtxVr } from "./vr-tipos.ts";

export function creaVrTeletransporte(c: CtxVr) {
  var d = c.d, VRX = c.VRX, Nucleo = c.Nucleo, materiales = c.materiales, THREE = d.THREE, scene = d.scene, camera = d.camera, Estado = d.Estado, Llegada = d.Llegada, window: T = d.ventana, RG = c.rig;
  var vrRayoDe = RG.vrRayoDe, vrCabeza = RG.vrCabeza, vrIrA = RG.vrIrA, vrAsienta = RG.vrAsienta, vrAplicaRig = RG.vrAplicaRig, vrPulso = RG.vrPulso, vrBaseY = RG.vrBaseY, vrV2 = RG.vrV2, vrV3 = RG.vrV3, vrEjeY = RG.vrEjeY;
  var panel: T = null, ficha: T = null, fichaB: T = null;   // las láminas son del panel (vr-panel.ts), que se crea después: enlaza() las pone
  var arcoGeo = new THREE.BufferGeometry(), arcoPos = new Float32Array(34 * 3); arcoGeo.setAttribute("position", new THREE.BufferAttribute(arcoPos, 3));
  var arco = new THREE.Line(arcoGeo, materiales.estandar("LineBasicMaterial", { color: 0x7fe3ff, fog: false, transparent: true, opacity: 0.9 })); arco.frustumCulled = false; arco.visible = false;
  var arcoMarca = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24).rotateX(-Math.PI / 2), materiales.estandar("MeshBasicMaterial", { color: 0x7fe3ff, fog: false, side: THREE.DoubleSide })); arcoMarca.visible = false;
  function vrArco(o: T) {   // trayectoria balística desde el mando derecho hasta el suelo; devuelve el punto de caída o null
    var gm = d.gm();
    var r = vrRayoDe(o), ox = r.ray.origin.x, oy = r.ray.origin.y, oz = r.ray.origin.z, dx = r.ray.direction.x * 9, dy = r.ray.direction.y * 9, dz = r.ray.direction.z * 9, hit: T = null, n = 0, px = ox, py = oy, pz = oz;
    for (var k = 0; k < 33; k++) {
      var t = (k + 1) * 0.06; px = ox + dx * t; py = oy + dy * t - 4.9 * t * t; pz = oz + dz * t; arcoPos[k * 3] = px; arcoPos[k * 3 + 1] = py; arcoPos[k * 3 + 2] = pz; n = k + 1;
      var g = gm.suelo(px, -pz) * Estado.exag; if (py <= g) { hit = { x: px, z: pz }; break; }   // el suelo y la caja son los del mundo activo (MU2-4)
    }
    arcoPos[0] = ox; arcoPos[1] = oy; arcoPos[2] = oz;
    for (var q = n; q < 34; q++) { arcoPos[q * 3] = px; arcoPos[q * 3 + 1] = py; arcoPos[q * 3 + 2] = pz; }
    arcoGeo.attributes.position.needsUpdate = true;
    if (hit && !gm.dentro(hit.x, -hit.z)) hit = null;
    return hit;
  }

  // ----- 2b) teletransporte desde el aire (en vuelo o en el mirador): palanca derecha ↑ mantenida = un rayo recto del mando al suelo y el anillo de llegada
  // (12b_llegada.js: el mismo cálculo y el mismo anillo que el Dron en pantalla; crece con la distancia, para verse desde arriba). Al soltar con anillo: fundido
  // a negro (~0,3 s), de pie en ese punto andando, y fundido de vuelta. Sin anillo (no toca suelo dentro de la finca o cae por detrás de la mirada) soltar no hace nada.
  var VT = { act: false };
  var vtLinGeo = new THREE.BufferGeometry(), vtLinPos = new Float32Array(6); vtLinGeo.setAttribute("position", new THREE.BufferAttribute(vtLinPos, 3));
  var vtLin = new THREE.Line(vtLinGeo, materiales.estandar("LineBasicMaterial", { color: 0xffc94a, fog: false, transparent: true, opacity: 0.45 })); vtLin.frustumCulled = false; vtLin.visible = false;
  // el fundido a negro: un velo pegado a la cabeza; estado y tiempos en apps/web/src/nucleo/fundido.ts (MU2-2). vrCierra() oscurece y su promesa se cumple a negro (se QUEDA
  // opaco hasta vrAbre(): entre los dos cabe cargar un mundo); vrFundido(fn) = cierra, fn a oscuras, abre (false si ya hay uno). vrSalta: los saltos de >5 m (L7-05) y las láminas nacen delante (L7-06)
  var vrFun = Nucleo.creaFundido(), vrNegro = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), materiales.estandar("MeshBasicMaterial", { color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
  vrNegro.position.set(0, 0, -0.3); vrNegro.renderOrder = 1000; vrNegro.frustumCulled = false; vrNegro.visible = false;
  function vrNegroPinta() { vrNegro.material.opacity = vrFun.opacidad; vrNegro.visible = vrFun.visible; }
  function vrCierra(alNegro: T) { var p = vrFun.cierra(alNegro); vrNegroPinta(); return p; }
  function vrAbre() { var p = vrFun.abre(); vrNegroPinta(); return p; }
  // L7-12: si fn lleva el rig (vrIrA) a un sitio cuya tesela aún no trae el relieve fino (VRX.esperaSuelo), el velo se QUEDA a negro hasta que llega (o ESPERA_SUELO_S),
  // se asienta la altura a oscuras y entonces se abre: la cabeza no se desliza en vertical a la vista. Pasado el tope, se abre con el grueso y el suelo se sigue a dt·12 como siempre
  var ESPERA_SUELO_S = 2, espera: T = null;
  function vrFundido(fn: T) {
    if (vrFun.fase !== "abierto") return false;
    VRX.esperaSuelo = null;   // lo que dejara un salto corto anterior (sin fundido) no cuenta
    vrFun.cierra(function () { try { if (fn) fn(); } finally { if (VRX.esperaSuelo) espera = { t: 0 }; else vrFun.abre(); } });
    vrNegroPinta(); return true;
  }
  function vrEsperaPaso(dt: T) {
    var e = VRX.esperaSuelo, gm = d.gm(); espera.t += dt;
    if (e && !(gm.sueloListo ? gm.sueloListo(e.x, e.y) : true) && espera.t < ESPERA_SUELO_S) return;
    if (e && !VRX.vuelo) vrAsienta(e.x, e.y);
    VRX.esperaSuelo = null; espera = null; vrFun.abre();
  }
  function vrFundidoPaso(dt: T) { if (vrFun.fase === "abierto") return; try { if (espera) vrEsperaPaso(dt); else vrFun.paso(dt); } finally { vrNegroPinta(); } }   // al principio de vrActualiza: lo que fn mueva ya cuenta
  function vrSalta(px: T, py: T, fn: T) {   // dist null = siempre (el mirador); con otro fundido en curso el salto se descarta (como Llegada.funde)
    var h = vrCabeza(), d = px === null ? null : Math.hypot(px - h.x, -py - h.z);
    return d !== null && !Nucleo.FundidoPuro.necesitaFundido(d) ? (fn(), true) : vrFundido(function () { fn(); panel.ini = false; ficha.ini = false; fichaB.ini = false; VRX.sucio = true; });
  }
  function vrVueloOculta() { VT.act = false; vtLin.visible = false; Llegada.borra(); }
  function vrVueloTp(R: T, apunta: T) {   // cada fotograma mientras se vuela (o mientras quede un apuntado abierto)
    arco.visible = false; arcoMarca.visible = false; VRX.tpAct = false; VRX.tp = null;
    if (apunta && vrFun.fase === "abierto") {
      var rr = vrRayoDe(R), o = rr.ray.origin, d = rr.ray.direction, p = Llegada.apunta(o, d, VRX.cab, camera.getWorldDirection(vrV3));
      VT.act = true;
      var fin = p || { x: o.x + d.x * 40, y: o.y + d.y * 40, z: o.z + d.z * 40 };   // sin suelo, un rayo corto (40 m) que solo dice adónde apuntas
      vtLinPos[0] = o.x; vtLinPos[1] = o.y; vtLinPos[2] = o.z; vtLinPos[3] = fin.x; vtLinPos[4] = fin.y; vtLinPos[5] = fin.z; vtLinGeo.attributes.position.needsUpdate = true;
      vtLin.visible = true; vtLin.material.opacity = p ? 0.45 : 0.2;
      return;
    }
    if (VT.act && Llegada.punto() && vrFun.fase === "abierto") { Llegada.alAnillo(); vrPulso(R, 0.35, 30); }
    vrVueloOculta();
  }
  // aparecer de pie en (px, py) del mundo (py = norte), andando (deja el vuelo y el mirador); con ang (ángulo del paseo: 0 = norte), gira el rig en torno a la cabeza para mirar
  // hacia allí. Lo llama Llegada.aparece (12b_llegada.js), que ya ha apartado el punto de los troncos.
  function vrAparece(px: T, py: T, ang: T) {
    VRX.vuelo = false; VRX.mirador = false; vrIrA(px, py);
    if (ang !== undefined && ang !== null) {
      var h = vrCabeza(), g = VRX.mira, d = Math.atan2(g.x, -g.z) - ang, r = VRX.rig;
      vrV2.set(r.x - h.x, 0, r.z - h.z).applyAxisAngle(vrEjeY, d); r.x = h.x + vrV2.x; r.z = h.z + vrV2.z; r.yaw += d;
    }
    vrAplicaRig(); VRX.hMov = 0.35; VRX.sucio = true; panel.ini = false; ficha.ini = false; fichaB.ini = false;   // las láminas, ya delante al aclarar (sin cruzar el mundo)
  }
  function vrVueloEntra() { camera.add(vrNegro); scene.add(vtLin); vrVueloOculta(); espera = null; VRX.esperaSuelo = null; vrFun.reinicia(); vrNegroPinta(); }
  function vrVueloSale() { camera.remove(vrNegro); scene.remove(vtLin); vrVueloOculta(); espera = null; VRX.esperaSuelo = null; vrFun.reinicia(); vrNegroPinta(); }
  window.__vrVuelo = function () { return { apuntando: VT.act, linea: vtLin.visible, fundido: vrFun.fase === "abierto" ? 0 : vrFun.fase === "cerrando" ? 1 : 2, esperaSuelo: !!espera, negro: vrNegro.material.opacity }; };

  function vrMirador(on: T) {   // 230 m de golpe: siempre por el fundido (L7-05)
    var gm = d.gm();
    vrSalta(null, 0, function () { VRX.mirador = on; VRX.vuelo = on; VRX.sucio = true; var h = vrCabeza(); VRX.rig.y = gm.suelo(h.x, -h.z) * Estado.exag + (on ? 230 : vrBaseY()); VRX.salto = true; });
  }

  function enlaza(p: T) { panel = p.panel; ficha = p.ficha; fichaB = p.fichaB; }
  /** suelta el arco, su marca, la línea del teletransporte desde el aire y el velo (geometrías y materiales) y el gancho de pruebas */
  function libera() {
    [arco, arcoMarca, vtLin, vrNegro].forEach(function (m: T) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); });
    delete window.__vrVuelo;
  }
  return { arco, arcoMarca, VT, vtLin, vrNegro, vrArco, vrCierra, vrAbre, vrFundido, vrFundidoPaso, vrSalta, vrVueloOculta, vrVueloTp, vrAparece, vrVueloEntra, vrVueloSale, vrMirador,
    fundido: vrFun, enlaza, libera };
}
export type VrTeletransporte = ReturnType<typeof creaVrTeletransporte>;

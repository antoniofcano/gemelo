// La VR, pieza 1 de 5 (MU5-n, A3-6c; antes las secciones 2 y 4 de apps/web/motor/29_vr.js): el rig y la cámara, y los mandos como rayos (sus escuchas, los ejes, los botones, los
// flancos y la vibración), con la altura de la vista. Código movido tal cual (lo genera el reparto de 29_vr: solo se tipan los parámetros); lo que era global del legado llega por el
// contexto `c` (vr.ts) con su mismo nombre. Lo que crea aquí (una vez por página, no por sesión) y suelta en libera(): la geometría y el material de los dos rayos y las escuchas de
// los dos mandos. El aspecto del mando o de la mano, en el grip, lo pone mundos/comun/mandos.ts (36_mandos) por el Bus.
import type { T } from "./tipos.ts";
import type { CtxVr } from "./vr-tipos.ts";

export function creaVrRig(c: CtxVr) {
  var d = c.d, VRX = c.VRX, Nucleo = c.Nucleo, THREE = d.THREE, renderer = d.renderer, camera = d.camera, Estado = d.Estado, LaminasPuro = d.LaminasPuro;
  var vrGatillo = function (o: T) { c.vrGatillo(o); };   // el gatillo lo atiende el panel (vr-panel.ts), que se crea después
  var vrRig = new THREE.Group();

  // ----- 2) mandos, rayo y arco de teletransporte (el aspecto del mando o de la mano, en el grip, lo pone 36_mandos: Mandos.monta/libera)
  var vrRayo = new THREE.Raycaster(), vrV1 = new THREE.Vector3(), vrV2 = new THREE.Vector3(), vrV3 = new THREE.Vector3(), vrM4 = new THREE.Matrix4(), vrEjeY = new THREE.Vector3(0, 1, 0), vrQ = new THREE.Quaternion();
  // A3-6c: las escuchas de cada mando se guardan para quitarlas en libera() (los mandos de three viven toda la vida de la página) y volver a ponerlas en monta()
  var escuchas: (() => void)[] = [];
  function engancha(o: T) {
    var c = o.c, lin = o.rayo;
    var alConecta = function (e: T) { o.src = e.data || null; o.mano = (e.data && e.data.handedness) || ""; lin.visible = !!(e.data && e.data.targetRayMode !== "gaze"); };
    var alSuelta = function () { o.src = null; o.mano = ""; lin.visible = false; };
    var alGatillo = function () { if (VRX.on && !(o.mano === "left" && VRX.voz && VRX.voz.toma())) vrGatillo(o); };   // F3e: en una visita guiada con micrófono, el gatillo izquierdo es el micro (47_habla.js), no pulsa con el rayo
    c.addEventListener("connected", alConecta); c.addEventListener("disconnected", alSuelta); c.addEventListener("selectstart", alGatillo);
    escuchas.push(function () { c.removeEventListener("connected", alConecta); c.removeEventListener("disconnected", alSuelta); c.removeEventListener("selectstart", alGatillo); });
  }
  var VRC = [0, 1].map(function (i: T) {
    var c = renderer.xr.getController(i), g = renderer.xr.getControllerGrip(i), o: T = { i: i, c: c, g: g, src: null, mano: "", rayo: null };
    var lin = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -8)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, fog: false }));
    lin.visible = false; c.add(lin); o.rayo = lin;
    engancha(o);
    return o;
  });
  function vrMano(m: T) { var a = VRC.filter(function (o: T) { return o.src && o.mano === m; })[0]; return a || (m === "right" ? VRC[1] : VRC[0]); }
  function vrRayoDe(o: T) { o.c.updateMatrixWorld(true); vrV1.setFromMatrixPosition(o.c.matrixWorld); vrM4.extractRotation(o.c.matrixWorld); vrV2.set(0, 0, -1).applyMatrix4(vrM4).normalize(); vrRayo.set(vrV1, vrV2); return vrRayo; }

  // AV2 (decisión 133): «Altura de la vista» (Configuración, vista.altura). Sentado baja la vista VR_SENTADO m respecto a la que dan las gafas (se SUMA al suelo de la sesión: si el visor ya da la
  // altura real de quien está sentado, se deja «De pie»); independiente del avatar. Solo cambia dónde está el rig: el mundo no se mueve.
  var VR_SENTADO = 0.42;   // 1,62 m de pie → 1,20 m sentado (los mismos ojos que el paseo en primera persona)
  function vrBaseY() { return VRX.ojo - (vrAj("vista.altura", "pie") === "sentado" ? VR_SENTADO : 0); }
  function vrAj(clave: T, def: T) { var Ajustes = d.Ajustes(); try { if (typeof Ajustes !== "undefined" && Ajustes && Ajustes.lee) { var v = Ajustes.lee(clave); if (v !== undefined && v !== null) return v; } } catch (e) { /* sin Configuración */ } return def; }
  function vrAjPon(clave: T, v: T) { var Ajustes = d.Ajustes(); try { if (typeof Ajustes !== "undefined" && Ajustes && Ajustes.pon) Ajustes.pon(clave, v); } catch (e) { /* sin Configuración */ } }

  // ----- 4) la persona en la escena: posición del rig (el espacio de referencia desplazado) y locomoción
  function vrAplicaRig() {
    var r = VRX.rig; vrRig.position.set(r.x, r.y, r.z); vrRig.rotation.set(0, r.yaw, 0);
  }
  var vrQCab = new THREE.Quaternion(), vrM4Cab = new THREE.Matrix4();
  function vrCabeza() {   // la cabeza en el mundo: la pose local que dejó three al pintar, girada y trasladada por el rig
    var r = VRX.rig; VRX.cab.copy(camera.position).applyAxisAngle(vrEjeY, r.yaw); VRX.cab.x += r.x; VRX.cab.y += r.y; VRX.cab.z += r.z;
    // VR-L1: y hacia dónde mira (VRX.mira, horizontal y en el mundo): la orientación de la pose del XRFrame de ESTE fotograma (en el espacio del rig; en el
    // primer fotograma la cámara aún no la tiene) o, fuera del fotograma (eventos de los mandos), la que dejó three al pintar
    var q = camera.quaternion, vp: T = null;
    try { vp = VRX.frame && VRX.base ? VRX.frame.getViewerPose(VRX.base) : null; } catch (e) { vp = null; }
    if (vp && vp.transform) { if (vp.transform.orientation) q = vp.transform.orientation; else if (vp.transform.matrix) q = vrQCab.setFromRotationMatrix(vrM4Cab.fromArray(vp.transform.matrix)); }
    VRX.mira = LaminasPuro.miradaH(q, r.yaw);
    return VRX.cab;
  }
  // L7-02: tras el «reset» del espacio de referencia (recentrar en el casco), el rig se recoloca para que la cabeza siga en el mismo sitio y mirando a lo mismo (BuclePuro.recoloca; lo llama nucleo/bucle.ts)
  function vrRecoloca() {
    var vp: T = null; try { vp = VRX.frame && VRX.base ? VRX.frame.getViewerPose(VRX.base) : null; } catch (e) { vp = null; } var tf = vp && vp.transform, p = tf && tf.position, q = tf && tf.orientation; if (!tf) return;
    if (!p || !q) { vrM4Cab.fromArray(tf.matrix).decompose(vrV3, vrQ, vrV2); p = vrV3; q = vrQ; }
    var n = Nucleo.BuclePuro.recoloca(VRX.rig, { p: camera.position, q: camera.quaternion }, { p: p, q: q }); VRX.rig.x = n.x; VRX.rig.z = n.z; VRX.rig.yaw = n.yaw; camera.position.set(p.x, p.y, p.z); camera.quaternion.set(q.x, q.y, q.z, q.w); vrAplicaRig(); VRX.sucio = true;
  }
  function vrIrA(px: T, py: T) { var gm = d.gm();   // lleva la cabeza a (px, py) del mundo (py hacia el norte), sin cambiar la dirección de la mirada
    var h = vrCabeza(); VRX.rig.x += px - h.x; VRX.rig.z += -py - h.z; VRX.rig.y = gm.suelo(px, py) * Estado.exag + vrBaseY(); VRX.salto = true;   // salto: con ?ui=capas el panel nace delante (EV2-A2)
  }
  function vrEjes(src: T) { var g = src && src.gamepad; if (!g || !g.axes) return { x: 0, y: 0, ok: false }; var a = g.axes, i = a.length >= 4 ? 2 : 0; return { x: a[i] || 0, y: a[i + 1] || 0, ok: true }; }
  function vrBoton(src: T, k: T) { var g = src && src.gamepad, b = g && g.buttons && g.buttons[k]; return !!(b && b.pressed); }
  function vrFlanco(clave: T, v: T) { var a = VRX.prev[clave]; VRX.prev[clave] = v; return v && !a; }
  function vrPulso(o: T, fuerza: T, ms: T) { try { var g = o && o.src && o.src.gamepad, h = g && g.hapticActuators && g.hapticActuators[0]; if (h && h.pulse) h.pulse(fuerza, ms); } catch (e) { /* sin vibración */ } }
  var vrPulsoIzq = function (fuerza: T, ms: T) { vrPulso(vrMano("left"), fuerza, ms); };
  var vrDz = function (v: T) { return Math.abs(v) < 0.18 ? 0 : v; };

  /** suelta los rayos (geometría y material) y quita las escuchas de los mandos de three (que viven toda la vida de la página) */
  function libera() {
    escuchas.splice(0).forEach(function (f) { f(); });
    VRC.forEach(function (o: T) { if (o.rayo.parent) o.rayo.parent.remove(o.rayo); o.rayo.geometry.dispose(); o.rayo.material.dispose(); });
  }
  /** tras un libera(): las escuchas otra vez y el rayo en su mando (la geometría y el material se vuelven a subir solos al dibujarse) */
  function monta() { if (escuchas.length) return; VRC.forEach(function (o: T) { if (!o.rayo.parent) o.c.add(o.rayo); engancha(o); }); }
  return { vrRig, VRC, vrMano, vrRayoDe, vrAj, vrAjPon, vrBaseY, vrAplicaRig, vrCabeza, vrRecoloca, vrIrA, vrEjes, vrBoton, vrFlanco, vrPulso, vrPulsoIzq, vrDz,
    vrV2, vrV3, vrEjeY, libera, monta };
}
export type VrRig = ReturnType<typeof creaVrRig>;

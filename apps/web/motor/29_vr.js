// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: VRX, vrDebugExtra, vrFundido, vrAparece, panel, ficha, PanelVR, vrMideEmpieza, vrMideEnvio, vrMideFin, vrActualiza, VR_PERFILES, vrFin
// Consume: 01_datos (D, $, fmt, VRP), 02_mundo (Mundo, suelo, orto, copas), 02c_componentes (Bus, Config), 02d_laminas (Laminas),
//   02e_entidades (EntidadesPuro, Entidades, Usables), 03_escena (lienzo, visor, renderer, scene, camera, texColor, exag, modo, calidad),
//   04b_escena3d (Escena3D), 05_nube (nube), 07b_arboles (Arboles), 09_camara (pon), 10_ndvi (NDV, ndviIdx),
//   12_paseo (paseando, persona, teclas, primera, entraPaseo, salePaseo, actualizaPaseo), 12b_llegada (Llegada), 13_parcelas (parcelas, fincas),
//   14_historia (lista, aviso), 15_tiempo (calma, nivel, rumbo, hace), 16_vida (quita, mira, quad, dron), 22_huellas (pendFactor),
//   24_pantalla (suave), 30_mide (MideEst, Mide), 33_ajustes (Ajustes), 36_mandos (Mandos), 90_final (tamano, cuadro, bucle)
// Nota: Publica además window.__vrDebug, __vrOlivo, __vrBotones, __vrVuelo y VR_ESTADO (depuración y pruebas VR).
// ===============================================================================
  // ---------- modo VR inmersivo (WebXR, Meta Quest Browser): el paseo en primera persona con mandos, un panel flotante y un perfil de rendimiento propio
  // Fuera de una sesión XR este bloque no hace nada salvo comprobar (una vez) si el navegador ofrece WebXR y, si lo ofrece, mostrar el botón «Entrar en VR».
  // La cámara cuelga de un «rig» (Group) que es el origen del espacio de seguimiento: mover o girar el rig mueve o gira al usuario por el mundo (three r128 no puede desplazar el espacio de referencia).
  // Durante la sesión, camera.position es la pose LOCAL de la cabeza dentro del rig (la reescribe three al pintar); la cabeza en el mundo es VRX.cab (rig + giro · pose local).
  // El resto del programa sigue leyendo camera.position como siempre: justo antes de usarlo, actualizaPaseo() lo deja en la cabeza del mundo (pp), y three lo vuelve a sobrescribir al pintar.
  var VRX = {
    on: false, entrando: false, sesion: null, base: null, soporta: false, estado: "comprobando…", ojo: 0, frame: null,
    rig: { x: 0, y: 0, z: 0, yaw: 0 }, vuelo: false, mirador: false, correr: false, vineta: true, nivel: 0,
    modoPrev: "nube", calPrev: 1, nearPrev: 0.5, farPrev: 5000, prev: {}, giroOk: true, parcSel: 0, emaDt: 13.9, emaJs: 6, nBaj: 0, nAlt: 0, tNivel: 0,
    tp: null, hover: "", tFicha: 0, fichaT: 0, fichaDe: "", sucio: true, hapt: 0, hMov: 0, sesionesN: 0, cab: new THREE.Vector3(),
    captura: null, voz: null, gente: null, genteFirma: "", tGente: 0, pestana: "mundo", giro: 30, sinPint: false, fichaId: "", balFirma: "", balInfo: null, hoverB: "", botonesB: []
  };
  var vrRig = new THREE.Group();
  function vrEstado(t) { VRX.estado = t; window.VR_ESTADO = "WebXR: " + t; try { console.log("[VR] " + window.VR_ESTADO); } catch (e) {} }
  function vrDebugExtra() { return VRX.on ? " · VR nivel " + VRX.nivel + " · " + VRX.emaDt.toFixed(1) + " ms/fot · JS " + VRX.emaJs.toFixed(1) + " ms" + (VRX.vuelo ? " · vuelo" : "") : ""; }

  // ----- 1) ¿hay WebXR? ¿lo bloquea el marco (iframe) en el que se muestra la página?
  async function vrDetecta() {
    var marco = false, pol = null;
    try { marco = window.self !== window.top; } catch (e) { marco = true; }
    try { var pd = document.permissionsPolicy || document.featurePolicy; if (pd && pd.allowsFeature) pol = pd.allowsFeature("xr-spatial-tracking"); } catch (e) {}
    if (pol === false) { vrEstado("bloqueado por el marco (la política de permisos no concede xr-spatial-tracking)"); return; }
    if (!navigator.xr) { vrEstado("no soportado (este navegador no ofrece WebXR" + (marco ? "; la página va dentro de un marco" : "") + ")"); return; }
    try {
      var ok = await navigator.xr.isSessionSupported("immersive-vr");
      if (ok) { VRX.soporta = true; vrEstado("soportado" + (marco ? " (dentro de un marco; si al entrar falla, es el marco)" : "")); creaBotonVR(); }
      else vrEstado("no soportado (no hay casco o el navegador no ofrece el modo VR inmersivo)");
    } catch (e) {
      vrEstado(e && e.name === "SecurityError" ? "bloqueado por el marco (SecurityError al comprobar la sesión VR)" : "no se pudo comprobar: " + (e && (e.name + " " + e.message) || e));
    }
  }
  function creaBotonVR() {
    var ref = $("btnPantalla"); if (!ref || $("btnVR")) return;
    var b = document.createElement("button"); b.type = "button"; b.id = "btnVR"; b.className = ref.className; b.textContent = "🥽 Entrar en VR"; b.title = "Ver el gemelo con las gafas de realidad virtual";
    ref.parentNode.insertBefore(b, ref); b.addEventListener("click", function () { entraVR(); });
  }

  // ----- 2) mandos, rayo y arco de teletransporte (el aspecto del mando o de la mano, en el grip, lo pone 36_mandos: Mandos.monta/libera)
  var vrRayo = new THREE.Raycaster(), vrV1 = new THREE.Vector3(), vrV2 = new THREE.Vector3(), vrV3 = new THREE.Vector3(), vrM4 = new THREE.Matrix4(), vrEjeY = new THREE.Vector3(0, 1, 0), vrQ = new THREE.Quaternion();
  var VRC = [0, 1].map(function (i) {
    var c = renderer.xr.getController(i), g = renderer.xr.getControllerGrip(i), o = { i: i, c: c, g: g, src: null, mano: "", rayo: null };
    var lin = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -8)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, fog: false }));
    lin.visible = false; c.add(lin); o.rayo = lin;
    c.addEventListener("connected", function (e) { o.src = e.data || null; o.mano = (e.data && e.data.handedness) || ""; lin.visible = !!(e.data && e.data.targetRayMode !== "gaze"); });
    c.addEventListener("disconnected", function () { o.src = null; o.mano = ""; lin.visible = false; });
    c.addEventListener("selectstart", function () { if (VRX.on && !(o.mano === "left" && VRX.voz && VRX.voz.toma())) vrGatillo(o); });   // F3e: en una visita guiada con micrófono, el gatillo izquierdo es el micro (47_habla.js), no pulsa con el rayo
    return o;
  });
  function vrMano(m) { var a = VRC.filter(function (o) { return o.src && o.mano === m; })[0]; return a || (m === "right" ? VRC[1] : VRC[0]); }
  function vrRayoDe(o) { o.c.updateMatrixWorld(true); vrV1.setFromMatrixPosition(o.c.matrixWorld); vrM4.extractRotation(o.c.matrixWorld); vrV2.set(0, 0, -1).applyMatrix4(vrM4).normalize(); vrRayo.set(vrV1, vrV2); return vrRayo; }
  var arcoGeo = new THREE.BufferGeometry(), arcoPos = new Float32Array(34 * 3); arcoGeo.setAttribute("position", new THREE.BufferAttribute(arcoPos, 3));
  var arco = new THREE.Line(arcoGeo, new THREE.LineBasicMaterial({ color: 0x7fe3ff, fog: false, transparent: true, opacity: 0.9 })); arco.frustumCulled = false; arco.visible = false;
  var arcoMarca = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fe3ff, fog: false, side: THREE.DoubleSide })); arcoMarca.visible = false;
  function vrArco(o) {   // trayectoria balística desde el mando derecho hasta el suelo; devuelve el punto de caída o null
    var r = vrRayoDe(o), ox = r.ray.origin.x, oy = r.ray.origin.y, oz = r.ray.origin.z, dx = r.ray.direction.x * 9, dy = r.ray.direction.y * 9, dz = r.ray.direction.z * 9, e = D.ext, hit = null, n = 0, px = ox, py = oy, pz = oz;
    for (var k = 0; k < 33; k++) {
      var t = (k + 1) * 0.06; px = ox + dx * t; py = oy + dy * t - 4.9 * t * t; pz = oz + dz * t; arcoPos[k * 3] = px; arcoPos[k * 3 + 1] = py; arcoPos[k * 3 + 2] = pz; n = k + 1;
      var g = suelo(px, -pz) * exag; if (py <= g) { hit = { x: px, z: pz }; break; }
    }
    arcoPos[0] = ox; arcoPos[1] = oy; arcoPos[2] = oz;
    for (var q = n; q < 34; q++) { arcoPos[q * 3] = px; arcoPos[q * 3 + 1] = py; arcoPos[q * 3 + 2] = pz; }
    arcoGeo.attributes.position.needsUpdate = true;
    if (hit && (hit.x < e[0] + 3 || hit.x > e[2] - 3 || -hit.z < e[3] + 3 || -hit.z > e[1] - 3)) hit = null;
    return hit;
  }

  // ----- 2b) teletransporte desde el aire (en vuelo o en el mirador): palanca derecha ↑ mantenida = un rayo recto del mando al suelo y el anillo de llegada
  // (12b_llegada.js: el mismo cálculo y el mismo anillo que el Dron en pantalla; crece con la distancia, para verse desde arriba). Al soltar con anillo: fundido
  // a negro (~0,3 s), de pie en ese punto andando, y fundido de vuelta. Sin anillo (no toca suelo dentro de la finca o cae por detrás de la mirada) soltar no hace nada.
  var VT = { act: false };
  var vtLinGeo = new THREE.BufferGeometry(), vtLinPos = new Float32Array(6); vtLinGeo.setAttribute("position", new THREE.BufferAttribute(vtLinPos, 3));
  var vtLin = new THREE.Line(vtLinGeo, new THREE.LineBasicMaterial({ color: 0xffc94a, fog: false, transparent: true, opacity: 0.45 })); vtLin.frustumCulled = false; vtLin.visible = false;
  // el fundido a negro: un velo pegado a la cabeza. vrFundido(fn) oscurece, llama a fn a oscuras y aclara (0,15 s + 0,15 s); devuelve false si ya hay uno en curso
  var FUNDIDO_S = 0.15, vrFun = { fase: 0, t: 0, fn: null };
  var vrNegro = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
  vrNegro.position.set(0, 0, -0.3); vrNegro.renderOrder = 1000; vrNegro.frustumCulled = false; vrNegro.visible = false;
  function vrFundido(fn) { if (vrFun.fase) return false; vrFun.fase = 1; vrFun.t = 0; vrFun.fn = fn || null; vrNegro.material.opacity = 0; vrNegro.visible = true; return true; }
  function vrFundidoPaso(dt) {   // al principio de vrActualiza: lo que fn mueva ya cuenta para el resto del fotograma
    if (!vrFun.fase) return;
    vrFun.t += dt; var k = Math.min(1, vrFun.t / FUNDIDO_S);
    if (vrFun.fase === 1) { vrNegro.material.opacity = k; if (k >= 1) { var f = vrFun.fn; vrFun.fn = null; vrFun.fase = 2; vrFun.t = 0; if (f) f(); } }
    else { vrNegro.material.opacity = 1 - k; if (k >= 1) { vrFun.fase = 0; vrNegro.visible = false; } }
  }
  function vrVueloOculta() { VT.act = false; vtLin.visible = false; Llegada.borra(); }
  function vrVueloTp(R, apunta) {   // cada fotograma mientras se vuela (o mientras quede un apuntado abierto)
    arco.visible = false; arcoMarca.visible = false; VRX.tpAct = false; VRX.tp = null;
    if (apunta && !vrFun.fase) {
      var rr = vrRayoDe(R), o = rr.ray.origin, d = rr.ray.direction, p = Llegada.apunta(o, d, VRX.cab, camera.getWorldDirection(vrV3));
      VT.act = true;
      var fin = p || { x: o.x + d.x * 40, y: o.y + d.y * 40, z: o.z + d.z * 40 };   // sin suelo, un rayo corto (40 m) que solo dice adónde apuntas
      vtLinPos[0] = o.x; vtLinPos[1] = o.y; vtLinPos[2] = o.z; vtLinPos[3] = fin.x; vtLinPos[4] = fin.y; vtLinPos[5] = fin.z; vtLinGeo.attributes.position.needsUpdate = true;
      vtLin.visible = true; vtLin.material.opacity = p ? 0.45 : 0.2;
      return;
    }
    if (VT.act && Llegada.punto() && !vrFun.fase) { Llegada.alAnillo(); vrPulso(R, 0.35, 30); }
    vrVueloOculta();
  }
  // aparecer de pie en (px, py) del mundo (py = norte), andando (deja el vuelo y el mirador); con ang (ángulo del paseo: 0 = norte), gira el rig en torno a la cabeza para mirar
  // hacia allí. Lo llama Llegada.aparece (12b_llegada.js), que ya ha apartado el punto de los troncos.
  function vrAparece(px, py, ang) {
    VRX.vuelo = false; VRX.mirador = false; vrIrA(px, py);
    if (ang !== undefined && ang !== null) {
      var h = vrCabeza(), g = camera.getWorldDirection(vrV3), d = Math.atan2(g.x, -g.z) - ang, r = VRX.rig;
      vrV2.set(r.x - h.x, 0, r.z - h.z).applyAxisAngle(vrEjeY, d); r.x = h.x + vrV2.x; r.z = h.z + vrV2.z; r.yaw += d;
    }
    vrAplicaRig(); VRX.hMov = 0.35; VRX.sucio = true; panel.ini = false; ficha.ini = false; fichaB.ini = false;   // las láminas, ya delante al aclarar (sin cruzar el mundo)
  }
  function vrVueloEntra() { camera.add(vrNegro); scene.add(vtLin); vrVueloOculta(); vrFun.fase = 0; vrFun.fn = null; vrNegro.visible = false; }
  function vrVueloSale() { camera.remove(vrNegro); scene.remove(vtLin); vrVueloOculta(); vrFun.fase = 0; vrFun.fn = null; vrNegro.visible = false; }
  window.__vrVuelo = function () { return { apuntando: VT.act, linea: vtLin.visible, fundido: vrFun.fase, negro: vrNegro.material.opacity }; };

  // ----- 3) láminas flotantes (el panel y la ficha): un canvas en un plano que sigue a la cabeza con calma
  function creaLamina(W, H, pw, ph) {
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var tex = texColor(new THREE.CanvasTexture(cv)); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    var m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
    m.renderOrder = 998; m.visible = false; m.frustumCulled = false;
    return { cv: cv, cx: cv.getContext("2d"), tex: tex, m: m, W: W, H: H, pw: pw, ph: ph, ini: false };
  }
  // el panel (1 × 1,06 m; 1.024 px por metro), la ficha de un olivo y la de una baliza (I5: con «Ir a esta baliza» pulsable; 1.239 px por metro)
  var panel = creaLamina(1024, 1088, 1.0, 1.0625), ficha = creaLamina(768, 256, 0.62, 0.206), fichaB = creaLamina(768, 480, 0.62, 0.3875);
  function vrBajoRayo(l, B, rr) {   // ¿qué botón de la lámina l hay bajo el rayo? null si el rayo no toca la lámina; false si la toca fuera de los botones
    var ix = rr.intersectObject(l.m, false)[0]; if (!ix || !ix.uv) return null;
    var x = ix.uv.x * l.W, y = (1 - ix.uv.y) * l.H; B = B || [];
    for (var k = 0; k < B.length; k++) if (x >= B[k].x && x <= B[k].x + B[k].w && y >= B[k].y && y <= B[k].y + B[k].h) return B[k];
    return false;
  }
  function vrSigue(l, dt, dist, bajo) {   // la lámina se queda delante de la cabeza, mirándola; solo se recoloca si te alejas o giras mucho
    var h = VRX.cab, g = camera.getWorldDirection(vrV3); g.y = 0; if (g.lengthSq() < 1e-4) g.set(0, 0, -1); g.normalize();
    var tx = h.x + g.x * dist, tz = h.z + g.z * dist, ty = h.y + bajo, d = Math.hypot(l.m.position.x - tx, l.m.position.z - tz);
    var ang = Math.abs(Math.atan2(l.m.position.x - h.x, l.m.position.z - h.z) - Math.atan2(g.x, g.z)); ang = Math.min(ang, 6.283 - ang);
    if (!l.ini) { l.m.position.set(tx, ty, tz); l.ini = true; }
    else if (d > 0.9 || ang > 1.2 || Math.abs(l.m.position.y - ty) > 0.6) { var k = Math.min(1, dt * 3); l.m.position.x += (tx - l.m.position.x) * k; l.m.position.y += (ty - l.m.position.y) * k; l.m.position.z += (tz - l.m.position.z) * k; }
    l.m.rotation.set(0, Math.atan2(h.x - l.m.position.x, h.z - l.m.position.z), 0);
  }
  function vrTexto(cx, txt, x, y, ancho, alto, linea, max) {   // texto con saltos de línea; devuelve cuántas líneas pintó
    var palabras = String(txt).split(/\s+/), l = "", n = 0;
    for (var i = 0; i < palabras.length; i++) {
      var t = l ? l + " " + palabras[i] : palabras[i];
      if (cx.measureText(t).width > ancho && l) { cx.fillText(l, x, y + n * linea); n++; l = palabras[i]; if (n >= max) return n; } else l = t;
    }
    if (l && n < max) { cx.fillText(l, x, y + n * linea); n++; }
    return n;
  }
  function vrRect(cx, x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  function dd2(iso) { return iso ? iso.split("-").reverse().join("/") : "–"; }
  // ----- 3a) el panel en tres pestañas (U8, decisiones 83-90): Mundo (modo, hora, fecha y lo que añadan los componentes, como el tiempo) · Ir a (parcelas y gente con «Ir con») · Comodidad (viñeta, giro, relieve y lo que añadan los componentes, como el sonido; «Medir 60 s» solo con ?debug).
  // «Salir de VR» y las ayudas de los mandos quedan abajo en todas. Botones de 64 px en 1.024 px por metro (6,25 cm a 1 m). Los ajustes de comodidad se leen de Configuración (Ajustes.lee("vr.*"))
  // si ese módulo existe; si no, valen los de siempre (viñeta sí, giro de 30°).
  var VR_PESTANAS = [["mundo", "Mundo"], ["ira", "Ir a"], ["comodidad", "Comodidad"]], VR_GIROS = [15, 30, 45, 60], VR_DEBUG = /[?&]debug\b/.test(location.search);
  function vrAj(clave, def) { try { if (typeof Ajustes !== "undefined" && Ajustes && Ajustes.lee) { var v = Ajustes.lee(clave); if (v !== undefined && v !== null) return v; } } catch (e) {} return def; }
  function vrAjPon(clave, v) { try { if (typeof Ajustes !== "undefined" && Ajustes && Ajustes.pon) Ajustes.pon(clave, v); } catch (e) {} }
  // AV2 (decisión 133): «Altura de la vista» (Configuración, vista.altura). Sentado baja la vista VR_SENTADO m respecto a la que dan las gafas (se SUMA al suelo de la sesión: si el visor ya da la
  // altura real de quien está sentado, se deja «De pie»); independiente del avatar. Solo cambia dónde está el rig: el mundo no se mueve.
  var VR_SENTADO = 0.42;   // 1,62 m de pie → 1,20 m sentado (los mismos ojos que el paseo en primera persona)
  function vrBaseY() { return VRX.ojo - (vrAj("vista.altura", "pie") === "sentado" ? VR_SENTADO : 0); }
  function vrLeeAjustes() {   // al entrar en la sesión y cada vez que Configuración cambia algo
    var v = vrAj("vr.vineta", VRX.vineta); VRX.vineta = !(v === false || v === "false" || v === 0 || v === "no");
    var g = Number(vrAj("vr.giro", 30)); VRX.giro = isFinite(g) && g >= 5 && g <= 90 ? g : 30; VRX.sucio = true;
  }
  var vrSuscrito = false;   // 33_ajustes.js se monta después de este módulo: se suscribe al entrar en la sesión, no al cargar
  function vrSuscribe() { if (vrSuscrito) return; try { if (typeof Ajustes !== "undefined" && Ajustes && Ajustes.alCambiar) { Ajustes.alCambiar(function () { vrLeeAjustes(); }); vrSuscrito = true; } } catch (e) {} }
  function vrSinEscena() { try { return typeof Escena3D !== "undefined" && Escena3D.resumen().estado === "sin"; } catch (e) { return false; } }   // T8: #sinEscena (HTML) no se ve dentro de las gafas
  function vrMotivoSin() { try { return Escena3D.resumen().motivo || ""; } catch (e) { return ""; } }
  function vrY0() { return 196 + (VRX.sinPint ? 84 : 0); }   // dónde empieza el contenido de la pestaña (px del canvas): debajo de las pestañas y, si hace falta, del letrero
  function vrSlider(id, d) {
    var s = $(id); if (!s) return;
    if (s.tagName === "SELECT") s.selectedIndex = Math.max(0, Math.min(s.options.length - 1, s.selectedIndex + d)); else s.value = Math.max(Number(s.min), Math.min(Number(s.max), Number(s.value) + d * Number(s.step || 1)));
    s.dispatchEvent(new Event(s.tagName === "SELECT" ? "change" : "input", { bubbles: true })); VRX.sucio = true;
  }
  function vrFecha(d) { vrSlider($("hSel") ? "hSel" : "ndviSel", d); }   // una sola fecha del campo (decisión 88)
  // ----- 3a'') el panel por filas (ADR-0023, C2): cada pestaña es una lista de filas que se apilan desde y0 en orden; una fila no sabe dónde cae, solo su
  // alto. PanelVR.filas(pestaña, { id, orden, alto, visible?(), botones?(b, y), pinta?(cx, y, W, h), firma?(), debug?() }) → quita: b(id, x, y, w, h, texto,
  // fn, encendido) añade un botón pulsable con el rayo (x en px del lienzo de 1.024); h = { fila(texto, y, valor), valores }; firma() se mira dos veces por
  // segundo con el panel abierto y, si cambia, se repinta; debug() se suma a window.__vrDebug(). Las filas de siempre (modos, hora, fecha; parcela y gente;
  // viñeta, giro, relieve y medida) se registran aquí mismo y caen donde caían. PanelVR.tapa(fn): una lámina propia que está delante (la ficha de
  // la baliza espera). PanelVR.cierra() cierra el panel (Y lo vuelve a abrir); PanelVR.rumbo(): hacia dónde mira quien ve el panel de frente.
  var PanelVR = (function () {
    var filas = {}, tapan = [];
    VR_PESTANAS.forEach(function (t) { filas[t[0]] = []; });
    function registra(pestana, def) {
      if (!filas[pestana] || !def || !def.id || !(def.alto > 0) || filas[pestana].some(function (f) { return f.id === def.id; })) return null;
      var f = Object.assign({ orden: 50 }, def, { y: 0, firmaVista: "" }); filas[pestana].push(f);
      filas[pestana].sort(function (a, b) { return a.orden - b.orden; }); VRX.sucio = true;
      return function () { var l = filas[pestana], i = l.indexOf(f); if (i >= 0) l.splice(i, 1); VRX.sucio = true; };
    }
    function visibles(p) { return (filas[p] || []).filter(function (f) { try { return !f.visible || f.visible(); } catch (e) { return false; } }); }
    function tapa(fn) { if (typeof fn !== "function") return function () {}; tapan.push(fn); return function () { var i = tapan.indexOf(fn); if (i >= 0) tapan.splice(i, 1); }; }
    function tapado() { return tapan.some(function (fn) { try { return !!fn(); } catch (e) { return false; } }); }
    function debug() { var o = {}; Object.keys(filas).forEach(function (p) { filas[p].forEach(function (f) { if (f.debug) { try { Object.assign(o, f.debug()); } catch (e) {} } }); }); return o; }
    return { filas: registra, visibles: visibles, tapa: tapa, tapado: tapado, debug: debug, cierra: function () { panel.m.visible = false; VRX.hover = ""; VRX.sucio = true; },
      repinta: function () { VRX.sucio = true; }, rumbo: function () { return vrRumboPanel(); }, enVR: function () { return VRX.on; } };
  })();
  function vrBotones() {
    var B = [];
    function b(id, x, y, w, h, txt, fn, on) { B.push({ id: id, x: x, y: y, w: w, h: h, txt: txt, fn: fn, on: !!on }); }
    if (VRX.mideTarjeta) {   // PB9: «Enviar esta medida a la oficina» (con permiso: solo si se pulsa) y «Cerrar»
      var envia = Mide.puedeEnviar() || Mide.envio() !== "";
      if (envia) b("mideEnvia", 40, 668, 600, 76, Mide.textoEnvio(), function () { Mide.envia(); }, Mide.envio() === "ok");
      b("mideX", envia ? 664 : 372, 668, envia ? 320 : 280, 76, "Cerrar", function () { VRX.mideTarjeta = false; }); return B;
    }   // T7a: con la tarjeta de la medida abierta, solo «Cerrar»
    var y = vrY0(), p = VRX.pestana;
    VR_PESTANAS.forEach(function (t, i) { b("t_" + t[0], 40 + i * 316, 104, 300, 64, t[1], function () { VRX.pestana = t[0]; VRX.hover = ""; }, p === t[0]); });
    PanelVR.visibles(p).forEach(function (f) { f.y = y; if (f.botones) { try { f.botones(b, y); } catch (e) { try { console.error("[PanelVR] " + f.id, e); } catch (e2) {} } } y += f.alto; });
    b("sal", 40, 984, 944, 64, "Salir de VR", function () { if (VRX.sesion) VRX.sesion.end(); }, false);   // siempre abajo
    VRX.gente = vrGente(); VRX.genteFirma = VrGentePuro.firma(VRX.gente);   // el estado de Gente también sin su pestaña (para detectar cambios y para las pruebas)
    return B;
  }
  // las filas de siempre, por pestañas (con los mismos altos de antes: caen en los mismos píxeles)
  PanelVR.filas("mundo", { id: "modos", orden: 10, alto: 88, botones: function (b, y) { ["nube", "gem", "orto"].forEach(function (m, i) { b("m_" + m, 40 + i * 316, y, 300, 64, ["Nube LiDAR", "Gemelo", "Ortofoto"][i], function () { pon(m); VRX.sucio = true; }, modo === m); }); } });
  PanelVR.filas("mundo", { id: "hora", orden: 20, alto: 88, botones: function (b, y) { b("h-", 420, y, 90, 64, "−", function () { vrSlider("hora", -1); }); b("h+", 800, y, 90, 64, "+", function () { vrSlider("hora", 1); }); },
    pinta: function (cx, y, W, h) { h.fila("Hora", y, h.valores.hora); } });
  PanelVR.filas("mundo", { id: "fecha", orden: 30, alto: 88, botones: function (b, y) { b("f-", 420, y, 90, 64, "−", function () { vrFecha(-1); }); b("f+", 800, y, 90, 64, "+", function () { vrFecha(1); }); },
    pinta: function (cx, y, W, h) { h.fila("Fecha del campo", y, h.valores.fecha); } });
  PanelVR.filas("ira", { id: "parcela", orden: 10, alto: 96, botones: function (b, y) { b("p-", 420, y, 90, 64, "◀", function () { vrParcela(-1); }); b("p+", 800, y, 90, 64, "▶", function () { vrParcela(1); }); },
    pinta: function (cx, y, W, h) {
      h.fila("Parcela", y); cx.textAlign = "center"; cx.fillStyle = "#ffffff"; cx.font = "bold 24px system-ui, sans-serif";
      var nombre = h.valores.parcela; while (cx.measureText(nombre).width > 270 && nombre.length > 4) nombre = nombre.slice(0, -2); if (nombre !== h.valores.parcela) nombre += "…"; cx.fillText(nombre, 655, y + 33);
    } });
  PanelVR.filas("ira", { id: "gente", orden: 20, alto: 400, botones: function (b, y) { vrGenteBotones(b, y); }, pinta: function (cx, y, W) { vrPintaGente(cx, W, y); },
    firma: function () { return VrGentePuro.firma(vrGente()); } });
  PanelVR.filas("comodidad", { id: "vineta", orden: 10, alto: 88, pinta: function (cx, y, W, h) { h.fila("Viñeta", y); },
    botones: function (b, y) { b("vig", 420, y, 470, 64, "Viñeta: " + (VRX.vineta ? "sí" : "no"), function () { VRX.vineta = !VRX.vineta; vrAjPon("vr.vineta", VRX.vineta ? (vrAj("vr.vineta", "suave") === "fuerte" ? "fuerte" : "suave") : "no"); VRX.sucio = true; }, VRX.vineta); } });
  PanelVR.filas("comodidad", { id: "giro", orden: 20, alto: 88, pinta: function (cx, y, W, h) { h.fila("Giro", y); },
    botones: function (b, y) { b("giro", 420, y, 470, 64, "Giro por saltos de " + VRX.giro + "°", function () { var i = VR_GIROS.indexOf(VRX.giro); VRX.giro = VR_GIROS[(i + 1) % VR_GIROS.length]; vrAjPon("vr.giro", String(VRX.giro)); VRX.sucio = true; }, false); } });
  PanelVR.filas("comodidad", { id: "relieve", orden: 40, alto: 88, pinta: function (cx, y, W, h) { h.fila("Relieve", y, h.valores.exag); },
    botones: function (b, y) { b("e-", 420, y, 90, 64, "−", function () { vrSlider("exag", -1); }); b("e+", 800, y, 90, 64, "+", function () { vrSlider("exag", 1); }); } });
  PanelVR.filas("comodidad", { id: "mide", orden: 50, alto: 88, visible: function () { return VR_DEBUG; }, pinta: function (cx, y, W, h) { h.fila("Medida", y); },
    botones: function (b, y) { b("mide", 420, y, 470, 64, "Medir " + Mide.segundos() + " s", function () { Mide.inicia(); }, Mide.estado() === "midiendo"); } });
  function vrValores() {
    var h = Number($("hora").value), hh = Math.floor(h), mm = h % 1 ? "30" : "00", pr = parcelas[VRX.parcSel] || parcelas[0], fn = fincas.length > 1 && fincas[pr.finca] ? fincas[pr.finca].nombre + " · " : "";
    return { hora: hh + ":" + mm, fecha: NDV ? dd2(NDV.fechas[ndviIdx]) : "–", exag: fmt(exag, exag % 1 ? 2 : 0) + "×", parcela: fn + pr.nombre };
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
    function fila(txt, y, valor) { cx.textAlign = "left"; cx.font = "28px system-ui, sans-serif"; cx.fillStyle = "#c9d5dc"; cx.fillText(txt, 40, y + 33); if (valor !== undefined) { cx.textAlign = "center"; cx.fillStyle = "#ffffff"; cx.font = "bold 30px system-ui, sans-serif"; cx.fillText(valor, 655, y + 33); } }
    var ayuda = { fila: fila, valores: v };
    PanelVR.visibles(p).forEach(function (f) {   // las filas pintan lo suyo (rótulos, valores, bloques) y apuntan su firma; los botones van encima
      if (f.pinta) { cx.save(); try { f.pinta(cx, f.y, W, ayuda); } catch (e) { try { console.error("[PanelVR] " + f.id, e); } catch (e2) {} } cx.restore(); }
      try { f.firmaVista = f.firma ? f.firma() : ""; } catch (e) { f.firmaVista = ""; }
    });
    B.forEach(function (q) {
      cx.fillStyle = VRX.hover === q.id ? "#4a5866" : q.on ? "#2e7d3a" : "#2a3139"; vrRect(cx, q.x, q.y, q.w, q.h, 14); cx.fill();
      cx.fillStyle = "#ffffff"; cx.font = "bold 28px system-ui, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText(q.txt, q.x + q.w / 2, q.y + q.h / 2 + 1);
    });
    cx.textAlign = "left"; cx.font = "22px system-ui, sans-serif"; cx.fillStyle = "#9fb1bd";
    cx.fillText("Mandos: izq. palanca = andar · grip = correr · X = viñeta · Y = panel", 40, 890);
    cx.fillText("der. palanca ←→ = girar " + VRX.giro + "° · ↑ = teletransporte · A = volar · B = mirador", 40, 920);
    cx.fillStyle = "#7fe3ff"; cx.fillText(VRX.vuelo ? "Volando: izq. avanza · der. ↑ apunta al suelo; al soltar, bajas allí" : "Caminando por el olivar", 40, 950);
    if (VRX.voz && VRX.voz.toma()) { cx.fillStyle = "#ffd58a"; cx.fillText("Gatillo izquierdo = tu micrófono de la visita guiada (la derecha sigue pulsando el panel)", 40, 990); }
    cx.fillStyle = "#6f808c"; cx.font = "20px system-ui, sans-serif"; cx.fillText("LiDAR PNOA 2024 · © Instituto Geográfico Nacional (CC BY 4.0)", 40, 1074);
    panel.tex.needsUpdate = true; VRX.sucio = false; VRX.botones = B;
  }
  function vrPintaFicha(titulo, lineas) {
    var cx = ficha.cx, W = ficha.W, H = ficha.H;
    cx.clearRect(0, 0, W, H); cx.fillStyle = "rgba(14,18,22,0.92)"; vrRect(cx, 0, 0, W, H, 22); cx.fill(); cx.textBaseline = "top";
    cx.fillStyle = "#ffffff"; cx.font = "bold 34px system-ui, sans-serif"; cx.fillText(titulo, 26, 18);
    cx.fillStyle = "#cfd9df"; cx.font = "25px system-ui, sans-serif"; var y = 66;
    lineas.forEach(function (l) { y += vrTexto(cx, l, 26, y, W - 52, 40, 32, 3) * 32; });
    ficha.tex.needsUpdate = true; ficha.m.visible = true; ficha.ini = false; VRX.fichaT = 14;
  }
  function vrRumboPanel() { return ((-panel.m.rotation.y * 180 / Math.PI) % 360 + 360) % 360; }   // hacia dónde mira quien ve el panel de frente (PanelVR.rumbo)
  // ----- 3b) I5: la sección Gente del panel: una fila por persona que se ve (Entidades.lista("persona"): con pose, sin bloquear, no en vista aérea), las más
  // cercanas arriba, con «Ir con» pulsable con el rayo y el gatillo. Ir es su acción «ir» (Usables.usa; en 38_presencia_compartida.js): fundido a negro y de pie a 2,5-4 m de
  // ella, mirándola (Llegada, 12b_llegada.js), nunca un vuelo de cámara; al llegar se cierra el panel (para verla) y Y lo vuelve a abrir.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/vr_gente.test.js)
  var VrGentePuro = (function () {
    var MODOS = ["a pie", "en quad", "con el dron"];
    // la distancia como se lee en el panel: por metros hasta 20 m, de 5 en 5 hasta 100, de 10 en 10 hasta 1 km y luego en km con un decimal
    // (así el panel no se repinta cada vez que alguien da un paso lejos)
    function distTxt(m) {
      if (!(m >= 0)) return "–";
      if (m < 20) return Math.round(m) + " m";
      if (m < 100) return Math.round(m / 5) * 5 + " m";
      if (m < 995) return Math.round(m / 10) * 10 + " m";
      return (Math.round(m / 100) / 10).toFixed(1).replace(".", ",") + " km";
    }
    // puntos: [{id, alias, x este, y norte, modo 0|1|2}] o null (sin presencia); desde = {x, y}; max filas. Devuelve
    // { activo, n (cuántos se ven), filas: [{id, alias, modo (texto), d (m), dist (texto)}] (las max más cercanas), resto (las que no caben) }
    function filas(puntos, desde, max) {
      if (!puntos) return { activo: false, n: 0, filas: [], resto: 0 };
      var l = puntos.map(function (p) { var d = Math.hypot(p.x - desde.x, p.y - desde.y); return { id: p.id, alias: String(p.alias || "Visitante"), modo: MODOS[p.modo | 0] || MODOS[0], d: d, dist: distTxt(d) }; });
      l.sort(function (a, b) { return a.d - b.d || (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0); });
      return { activo: true, n: l.length, filas: l.slice(0, max), resto: Math.max(0, l.length - max) };
    }
    // lo que se ve de la sección: si cambia, se repinta el panel (y solo entonces: subir la textura del panel cuesta)
    function firma(g) { return (g.activo ? "1" : "0") + g.n + ":" + g.filas.map(function (f) { return f.id + "|" + f.alias + "|" + f.modo + "|" + f.dist; }).join(";"); }
    return { distTxt: distTxt, filas: filas, firma: firma, MODOS: MODOS };
  })();
  // [puro:fin]
  var GENTE_FILAS = 4;   // filas que caben en la pestaña «Ir a»; la sección empieza donde le diga la pestaña (px del canvas del panel)
  function vrGente() {   // C7: las personas son entidades (la presencia compartida, 38_presencia_compartida.js, registra el tipo persona); sin ese tipo (sin presencia), null
    var l = Entidades.lista("persona"), pts = l ? l.map(function (q) { return { id: q.ref, alias: q.alias, x: q.x, y: q.y, modo: q.modo }; }) : null;
    return VrGentePuro.filas(pts, { x: VRX.cab.x, y: -VRX.cab.z }, GENTE_FILAS);
  }
  function vrGenteBotones(b, gy) {   // un «Ir con» grande (240 × 64 px = 23 × 6 cm a 1 m) por fila; gy = dónde empieza la sección
    var g = VRX.gente = vrGente(); VRX.genteFirma = VrGentePuro.firma(g);
    g.filas.forEach(function (f, i) { b("ir:" + f.id, 744, gy + 50 + i * 74, 240, 64, "Ir con", function () { vrIrCon(f.id); }, false); });
  }
  function vrPintaGente(cx, W, GENTE_Y) {   // la sección pinta su texto a la izquierda de sus botones (x < 720): no se pisa con ellos
    var g = VRX.gente || vrGente();
    cx.textBaseline = "middle"; cx.textAlign = "left"; cx.fillStyle = "#e9eef2"; cx.font = "bold 30px system-ui, sans-serif"; cx.fillText("Gente", 40, GENTE_Y + 20);
    cx.textAlign = "right"; cx.font = "24px system-ui, sans-serif"; cx.fillStyle = "#9fb1bd";
    cx.fillText(!g.activo ? "sin presencia compartida" : !g.n ? "nadie más a la vista" : (g.n === 1 ? "1 a la vista" : g.n + " a la vista") + (g.resto ? " · las " + g.filas.length + " más cerca" : ""), W - 36, GENTE_Y + 20);
    cx.textAlign = "left";
    if (!g.filas.length) { cx.font = "28px system-ui, sans-serif"; cx.fillStyle = "#c9d5dc"; cx.fillText("Solo tú", 40, GENTE_Y + 82); return; }
    g.filas.forEach(function (f, i) {
      var y = GENTE_Y + 50 + i * 74 + 33, t = f.alias + " · " + f.modo + " · " + f.dist;
      cx.font = "bold 28px system-ui, sans-serif"; cx.fillStyle = "#ffffff";
      while (cx.measureText(t).width > 680 && t.length > 4) t = t.slice(0, -2);
      cx.fillText(t, 40, y);
    });
  }
  function vrGenteTic(dt) {   // dos veces por segundo, con el panel abierto: ¿cambió lo que enseña alguna fila de la pestaña (la gente, el tiempo…) o el estado de la escena (T8)?
    VRX.tGente += dt; if (VRX.tGente < 0.5) return; VRX.tGente = 0;
    if (vrSinEscena() !== VRX.sinPint) VRX.sucio = true;
    if (!VRX.mideTarjeta) PanelVR.visibles(VRX.pestana).forEach(function (f) { if (!f.firma) return; var x = ""; try { x = f.firma(); } catch (e) {} if (x !== f.firmaVista) VRX.sucio = true; });
  }
  function vrIrCon(id) {
    if (!Usables.usa("persona:" + id, "ir")) { VRX.sucio = true; return false; }   // ya no se ve (se fue, la bloqueaste) o hay un fundido en curso
    panel.m.visible = false; VRX.hover = ""; return true;
  }

  // ----- 3c) la ficha con botones en VR (I5; C7: de cualquier entidad, Usables.abierta()), en su propia lámina: título, el color de su estado, lo destacado
  // (quién está), sus líneas, su pie y sus acciones («Ir a esta baliza», «Ir con»…) más «Cerrar», pulsables con el rayo y el gatillo. Sale cuando hay una
  // abierta (la baliza a menos de 17 m o con el rayo y el gatillo sobre su columna de luz; la persona elegida con el rayo) y no está delante el panel ni la
  // ficha de un olivo. Ir es la acción de la entidad (Usables.usa): fundido y de pie a unos metros, mirándola (Llegada).
  function vrFichaTic(dt) {
    VRX.tFicha += dt; if (VRX.tFicha < 0.6) return; VRX.tFicha = 0;
    var id = Usables.abierta(), b = id ? Entidades.ficha(id, "vr") : null;
    if (!b || !b.acciones || !b.acciones.length) { fichaB.m.visible = false; VRX.fichaId = ""; VRX.balFirma = ""; return; }
    if (panel.m.visible || ficha.m.visible || PanelVR.tapado()) { fichaB.m.visible = false; return; }
    var f = JSON.stringify(b);
    if (id !== VRX.fichaId || !fichaB.m.visible) fichaB.ini = false;
    if (id !== VRX.fichaId || f !== VRX.balFirma) { VRX.fichaId = id; VRX.balFirma = f; vrPintaAcciones(b); }
    fichaB.m.visible = true;
  }
  function vrPintaAcciones(b) {   // 768 × 480 px en 0,62 × 0,39 m; botones de 72 px (6 cm de alto): las acciones a la izquierda (470 px entre todas) y «Cerrar» a la derecha
    var cx = fichaB.cx, W = fichaB.W, H = fichaB.H, B = [], y = 70, id = b.id, ac = b.acciones || [], lineas = EntidadesPuro.lineas(b);
    VRX.balInfo = b;
    cx.clearRect(0, 0, W, H); cx.fillStyle = "rgba(14,18,22,0.93)"; vrRect(cx, 0, 0, W, H, 22); cx.fill(); cx.textBaseline = "top"; cx.textAlign = "left";
    if (b.color != null) { cx.fillStyle = "#" + ("000000" + (b.color || 0).toString(16)).slice(-6); vrRect(cx, 0, 22, 10, H - 44, 4); cx.fill(); }   // el color de su estado, como la columna
    cx.fillStyle = "#ffffff"; cx.font = "bold 34px system-ui, sans-serif"; vrTexto(cx, b.titulo || "", 26, 18, W - 52, 0, 40, 1);
    if (b.destacado) { cx.fillStyle = "#7fe3ff"; cx.font = "bold 26px system-ui, sans-serif"; y += vrTexto(cx, b.destacado, 26, y, W - 52, 0, 32, 2) * 32 + 8; }
    cx.fillStyle = "#cfd9df"; cx.font = "24px system-ui, sans-serif";
    for (var i = 0; i < lineas.length && y < H - 160; i++) if (lineas[i]) y += vrTexto(cx, lineas[i], 26, y, W - 52, 0, 30, 2) * 30 + 4;
    if (b.pie) { cx.fillStyle = "#6f808c"; cx.font = "18px system-ui, sans-serif"; vrTexto(cx, b.pie, 26, H - 120, W - 52, 0, 22, 1); }
    var n = Math.max(1, ac.length), wa = (470 - (n - 1) * 12) / n;
    ac.forEach(function (a, k) { B.push({ id: a.id, x: 26 + k * (wa + 12), y: H - 92, w: wa, h: 72, txt: a.txt, prim: k === 0, fn: function () { Usables.usa(id, a.id); } }); });
    B.push({ id: "bce", x: 516, y: H - 92, w: 226, h: 72, txt: "Cerrar", fn: function () { Usables.cierra(id, "cerrada"); fichaB.m.visible = false; VRX.fichaId = ""; VRX.balFirma = ""; } });
    cx.textBaseline = "middle"; cx.textAlign = "center"; cx.font = "bold 30px system-ui, sans-serif";
    B.forEach(function (q) { cx.fillStyle = VRX.hoverB === q.id ? "#4a5866" : q.prim ? "#1d5f6b" : "#2a3139"; vrRect(cx, q.x, q.y, q.w, q.h, 14); cx.fill(); cx.fillStyle = "#ffffff"; cx.fillText(q.txt, q.x + q.w / 2, q.y + q.h / 2 + 1); });
    cx.textAlign = "left"; fichaB.tex.needsUpdate = true; VRX.botonesB = B;
  }
  function vrParcela(d) { VRX.parcSel = (VRX.parcSel + d + parcelas.length) % parcelas.length; var p = parcelas[VRX.parcSel]; vrIrA(p.centro[0], p.centro[1] - 6); VRX.sucio = true; }
  // T7a: la tarjeta de la medida (30_mide.js) sobre el panel: texto a 29 px en un panel de 1 m (letra de ≈ 2,8 cm, legible a 1 m) y «Cerrar» pulsable con el gatillo
  function vrPintaMide(B) {
    var cx = panel.cx, W = panel.W, H = panel.H, r = Mide.resultado();
    cx.clearRect(0, 0, W, H); cx.fillStyle = "rgba(14,18,22,0.96)"; vrRect(cx, 0, 0, W, H, 30); cx.fill(); cx.textBaseline = "middle"; cx.textAlign = "left";
    if (r) MideEst.lineas(r, true).forEach(function (l, i) { cx.fillStyle = i === 0 ? "#7fe3ff" : i === 4 ? "#ffffff" : "#dbe6ec"; cx.font = (i === 4 ? "bold " : "") + "29px system-ui, sans-serif"; cx.fillText(l, 36, 44 + i * 46, W - 72); });
    else { cx.fillStyle = "#dbe6ec"; cx.font = "30px system-ui, sans-serif"; cx.fillText("Sin medida todavía", 36, 60); }
    B.forEach(function (q) { cx.fillStyle = VRX.hover === q.id ? "#4a5866" : "#2e7d3a"; vrRect(cx, q.x, q.y, q.w, q.h, 14); cx.fill(); cx.fillStyle = "#ffffff"; cx.font = "bold 32px system-ui, sans-serif"; cx.textAlign = "center"; cx.fillText(q.txt, q.x + q.w / 2, q.y + q.h / 2 + 1); });
    cx.textAlign = "left"; panel.tex.needsUpdate = true; VRX.sucio = false; VRX.botones = B;
  }
  function vrMideEmpieza() { VRX.mideTarjeta = false; panel.m.visible = false; VRX.sucio = true; }   // a andar: el panel no tapa la vista durante la medida
  function vrMideEnvio() { VRX.sucio = true; }   // PB9: cambió el estado del envío (enviando, enviada…): repinta la tarjeta
  function vrMideFin() { VRX.mideTarjeta = true; panel.m.visible = true; panel.ini = false; VRX.sucio = true; }

  // ----- 4) la persona en la escena: posición del rig (el espacio de referencia desplazado) y locomoción
  function vrAplicaRig() {
    var r = VRX.rig; vrRig.position.set(r.x, r.y, r.z); vrRig.rotation.set(0, r.yaw, 0);
  }
  function vrCabeza() {   // la cabeza en el mundo: la pose local que dejó three al pintar, girada y trasladada por el rig
    var r = VRX.rig; VRX.cab.copy(camera.position).applyAxisAngle(vrEjeY, r.yaw); VRX.cab.x += r.x; VRX.cab.y += r.y; VRX.cab.z += r.z; return VRX.cab;
  }
  function vrIrA(px, py) {   // lleva la cabeza a (px, py) del mundo (py hacia el norte), sin cambiar la dirección de la mirada
    var h = vrCabeza(); VRX.rig.x += px - h.x; VRX.rig.z += -py - h.z; VRX.rig.y = suelo(px, py) * exag + vrBaseY();
  }
  function vrEjes(src) { var g = src && src.gamepad; if (!g || !g.axes) return { x: 0, y: 0, ok: false }; var a = g.axes, i = a.length >= 4 ? 2 : 0; return { x: a[i] || 0, y: a[i + 1] || 0, ok: true }; }
  function vrBoton(src, k) { var g = src && src.gamepad, b = g && g.buttons && g.buttons[k]; return !!(b && b.pressed); }
  function vrFlanco(clave, v) { var a = VRX.prev[clave]; VRX.prev[clave] = v; return v && !a; }
  function vrPulso(o, fuerza, ms) { try { var g = o && o.src && o.src.gamepad, h = g && g.hapticActuators && g.hapticActuators[0]; if (h && h.pulse) h.pulse(fuerza, ms); } catch (e) {} }
  var vrPulsoIzq = function (fuerza, ms) { vrPulso(vrMano("left"), fuerza, ms); };
  var vrDz = function (v) { return Math.abs(v) < 0.18 ? 0 : v; };
  function vrActualiza(dt, tms) {
    vrFundidoPaso(dt);
    var r = VRX.rig, h = vrCabeza(), L = vrMano("left"), R = vrMano("right"), iz = vrEjes(L.src), de = vrEjes(R.src);
    // botones: Y panel, X viñeta, A vuelo, B mirador
    if (vrFlanco("Y", vrBoton(L.src, 5))) { panel.m.visible = !panel.m.visible; if (panel.m.visible) { panel.ini = false; VRX.sucio = true; } vrPulso(L, 0.2, 20); }
    if (vrFlanco("X", vrBoton(L.src, 4))) { VRX.vineta = !VRX.vineta; vrAjPon("vr.vineta", VRX.vineta ? (vrAj("vr.vineta", "suave") === "fuerte" ? "fuerte" : "suave") : "no"); VRX.sucio = true; }
    if (vrFlanco("A", vrBoton(R.src, 4))) { VRX.vuelo = !VRX.vuelo; VRX.mirador = false; VRX.sucio = true; vrPulso(R, 0.2, 20); }
    var fB = vrFlanco("B", vrBoton(R.src, 5)), fP = vrFlanco("RS", vrBoton(R.src, 3));
    if (VRX.captura && (fB || fP)) { if (VRX.captura.boton(fB ? "B" : "palanca")) vrPulso(R, 0.3, 25); }   // C9b: con un juego en lámina, B pausa y pulsar la palanca sale
    else if (fB) { vrMirador(!VRX.mirador); vrPulso(R, 0.3, 25); }
    VRX.correr = vrBoton(L.src, 1);
    if (VRX.voz) VRX.voz.mando(vrBoton(L.src, 0), vrPulsoIzq);   // F3e: el gatillo izquierdo (botón 0) y el pulso del mando, cada fotograma
    // giro a saltos (palanca derecha ← →) y teletransporte (palanca derecha ↑: arco; al soltar, salta)
    var gx = vrDz(de.x), gy = vrDz(de.y), mueveStick = 0;
    if (VRX.captura) { VRX.captura.palanca(de.x, de.y, dt); gx = gy = 0; }   // C9b: la palanca derecha es del juego en lámina (ni giro ni teletransporte)
    if (Math.abs(gx) > 0.7 && Math.abs(gx) > Math.abs(gy)) {
      if (VRX.giroOk) { VRX.giroOk = false; var d = -Math.sign(gx) * VRX.giro * Math.PI / 180; vrV2.set(r.x - h.x, 0, r.z - h.z).applyAxisAngle(vrEjeY, d); r.x = h.x + vrV2.x; r.z = h.z + vrV2.z; r.yaw += d; VRX.hMov = 0.25; vrPulso(R, 0.1, 10); }
    } else if (Math.abs(gx) < 0.35) VRX.giroOk = true;
    if (VRX.vuelo || VT.act) vrVueloTp(R, gy < -0.6 && Math.abs(gx) < 0.5);   // desde el aire: rayo recto y anillo (2b)
    else if (gy < -0.6 && Math.abs(gx) < 0.5) { VRX.tp = vrArco(R); arco.visible = true; arcoMarca.visible = !!VRX.tp; if (VRX.tp) arcoMarca.position.set(VRX.tp.x, suelo(VRX.tp.x, -VRX.tp.z) * exag + 0.08, VRX.tp.z); VRX.tpAct = true; }
    else { if (VRX.tpAct && VRX.tp) { vrIrA(VRX.tp.x, -VRX.tp.z); VRX.hMov = 0.35; vrPulso(R, 0.35, 30); } VRX.tpAct = false; VRX.tp = null; arco.visible = false; arcoMarca.visible = false; }
    // andar (palanca izquierda): relativo a la mirada
    var av = -vrDz(iz.y), la = vrDz(iz.x), g = camera.getWorldDirection(vrV3);
    var fx = g.x, fz = g.z, hl = Math.hypot(fx, fz) || 1, hx = fx / hl, hz = fz / hl;   // dirección horizontal de la mirada
    var vel = VRX.vuelo ? (VRX.correr ? 30 : 10) : (VRX.correr ? 4.3 : 1.7) * pendFactor(), mov = Math.min(1, Math.hypot(av, la));
    var dx = 0, dz = 0, dy = 0;
    if (mov > 0) {
      if (VRX.vuelo) { dx = g.x * av * vel * dt - hz * la * vel * dt; dz = g.z * av * vel * dt + hx * la * vel * dt; dy = g.y * av * vel * dt; }
      else { dx = hx * av * vel * dt - hz * la * vel * dt; dz = hz * av * vel * dt + hx * la * vel * dt; }
    }
    var nx = h.x + dx, nz = h.z + dz;
    if (!VRX.vuelo || h.y - suelo(h.x, -h.z) * exag < 3) {   // los troncos no se atraviesan (a pie, o volando a ras)
      for (var i = 0; i < copas.length; i++) { var c = copas[i]; if (!c.oliv) continue; var ex = nx - c.x, ez = nz + c.y, d2 = ex * ex + ez * ez; if (d2 < 0.3025) { var dl = Math.sqrt(d2) || 0.001; nx = c.x + ex / dl * 0.55; nz = -c.y + ez / dl * 0.55; } }
    }
    var e = D.ext; nx = Math.max(e[0] + 3, Math.min(e[2] - 3, nx)); nz = Math.max(-e[1] + 3, Math.min(-e[3] - 3, nz));
    r.x += nx - h.x; r.z += nz - h.z; if (VRX.vuelo) r.y += dy;
    var gnd = suelo(nx, -nz) * exag + vrBaseY();
    if (VRX.vuelo) r.y = Math.max(r.y, gnd + 0.4); else r.y += (gnd - r.y) * Math.min(1, dt * 12);
    VRX.hMov = Math.max(0, VRX.hMov - dt); var mueve = mov > 0 || VRX.hMov > 0;
    // lo que el resto del programa mira: el «paseo» (pp) es la cabeza; el muñequito va oculto
    pp.x = nx; pp.y = -nz; pp.ang = Math.atan2(hx, -hz); if (!VRX.vuelo && mov > 0) pp.paso += vel * mov * dt * 3.4;
    teclas.up = teclas.down = teclas.left = teclas.right = false;
    actualizaPaseo(dt); primera = true; persona.visible = false;
    vrAplicaRig();
    // viñeta de confort mientras te mueves
    vrVineta.visible = VRX.vineta; vrVineta.material.uniforms.uK.value += ((mueve ? 0.55 : 0) - vrVineta.material.uniforms.uK.value) * Math.min(1, dt * 8);
    // láminas
    var rr = vrRayoDe(R), hv = "";
    if (panel.m.visible) {
      vrSigue(panel, dt, 1.05, -0.2); vrGenteTic(dt);
      var q = vrBajoRayo(panel, VRX.botones, rr); hv = q ? q.id : "";
      if (hv !== VRX.hover) { VRX.hover = hv; VRX.sucio = true; }
      if (VRX.sucio) vrPintaPanel();
    }
    if (ficha.m.visible) { vrSigue(ficha, dt, 0.95, -0.38); VRX.fichaT -= dt; if (VRX.fichaT <= 0) { ficha.m.visible = false; if (VRX.fichaDe) Usables.cierra(VRX.fichaDe, "tiempo"); VRX.fichaDe = ""; } }
    vrFichaTic(dt);
    if (fichaB.m.visible) {
      vrSigue(fichaB, dt, 0.95, -0.42);
      var qb = vrBajoRayo(fichaB, VRX.botonesB, rr), hb = qb ? qb.id : "";
      if (hb !== VRX.hoverB) { VRX.hoverB = hb; if (VRX.balInfo) vrPintaAcciones(VRX.balInfo); }
    }
  }
  function vrMirador(on) {
    VRX.mirador = on; VRX.vuelo = on; VRX.sucio = true; var h = vrCabeza();
    if (on) { VRX.rig.y = suelo(h.x, -h.z) * exag + 230; } else { VRX.rig.y = suelo(h.x, -h.z) * exag + vrBaseY(); }
  }
  // el gatillo: sobre el panel pulsa un botón; sobre un olivo, abre su ficha
  function vrGatillo(o) {
    var rr = vrRayoDe(o);
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
  // C7: la ficha común en VR (Usables.presentador): sin acciones, en la lámina pequeña (título y dos líneas «k: v», 14 s); con acciones, en la de los botones
  Usables.presentador("vr", function (f) {
    if (f.acciones && f.acciones.length) { VRX.tFicha = 1; return; }
    vrPintaFicha(f.titulo, EntidadesPuro.lineas(f)); VRX.fichaDe = f.id;
  });

  // ----- 5) la viñeta de confort (un velo con el centro transparente, pegado a la cabeza)
  var vrVineta = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform float uK; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(0.28, 0.62, r) * uK; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }"
  }));
  vrVineta.position.set(0, 0, -0.32); vrVineta.renderOrder = 999; vrVineta.frustumCulled = false; vrVineta.visible = false;

  // ----- 6) el perfil de rendimiento de las gafas y el adaptador por tiempo de fotograma
  var VR_PERFILES = [{ n: 0.8, r: 0.75, tri: 380000, h: 32, b: 1, e: 16 }, { n: 0.55, r: 0.6, tri: 270000, h: 20, b: 0, e: 24 }, { n: 0.35, r: 0.45, tri: 190000, h: 0, b: 0, e: 32 }, { n: 0.2, r: 0.3, tri: 130000, h: 0, b: 0, e: 48 }];   // b: relieve fino del suelo (uBumpK); se apaga en cuanto el fotograma va justo (decisión 24). e: errorTarget (px) de la escena 3D Tiles; valores de partida SIN medir en las gafas
  // C6/OF6: el presupuesto de cada perfil puede venir de la configuración del servidor (escalera.triangulos.gafas, contratos/config.schema.json), SOLO A
  // LA BAJA respecto a estos (Config.param, 02c, lo recorta); la escala adaptativa sigue bajando de perfil si el fotograma se alarga
  Config.al(function () { VR_PERFILES.forEach(function (p, i) { p.tri = Config.param("escalera.triangulos.gafas." + i, p.tri); }); });
  function vrPerfil(n) { n = Math.max(0, Math.min(VR_PERFILES.length - 1, n)); VRX.nivel = n; var p = VR_PERFILES[n]; VRP.hierba = p.h; UN.uBumpK.value = p.b; Arboles.perfil(p); Escena3D.perfil(p); }
  function vrAdapta(dtMs, jsMs, dt) {   // por encima de 13 ms de trabajo (o con fotogramas perdidos) baja de nivel; tras un rato holgado, sube
    VRX.emaDt += (dtMs - VRX.emaDt) * 0.05; VRX.emaJs += (jsMs - VRX.emaJs) * 0.05; VRX.tNivel += dt;
    if (VRX.tNivel < 4) return;
    if ((VRX.emaJs > 13 || VRX.emaDt > 15.2) && VRX.nivel < VR_PERFILES.length - 1) { VRX.tNivel = 0; VRX.nBaj++; vrPerfil(VRX.nivel + 1); }
    else if (VRX.emaJs < 7 && VRX.emaDt < 14.4 && VRX.nivel > 0 && VRX.tNivel > 25) { VRX.tNivel = 0; VRX.nAlt++; vrPerfil(VRX.nivel - 1); }
  }
  function vrFin(dt, jsMs) { vrAdapta(dt * 1000, jsMs, dt); }

  // ----- 7) entrar y salir
  async function entraVR() {
    if (VRX.on || VRX.entrando || !VRX.soporta) return; VRX.entrando = true;
    Bus.emite("audio:desbloquea", {});   // el gesto de pulsar el botón es lo que deja arrancar el audio (quien haga sonido lo atiende)
    var ses = null;
    try {
      renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType("local-floor"); renderer.xr.setFramebufferScaleFactor(0.9);
      ses = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"] });   // manos: 36_mandos
      VRX.ojo = 0;
      try { await ses.requestReferenceSpace("local-floor"); } catch (e) { renderer.xr.setReferenceSpaceType("local"); VRX.ojo = 1.6; }
      renderer.setAnimationLoop(vrAnimacion);   // antes de setSession: así el bucle de la ventana se para al empezar la sesión
      await renderer.xr.setSession(ses);
    } catch (e) {
      VRX.entrando = false; renderer.setAnimationLoop(null); renderer.xr.enabled = false; vrEstado("no se pudo entrar: " + (e && (e.name + " " + e.message) || e)); try { if (ses) ses.end(); } catch (e2) {} return;
    }
    VRX.sesion = ses; VRX.base = renderer.xr.getReferenceSpace(); VRX.sesionesN++;
    try { var capa = ses.renderState && ses.renderState.baseLayer; if (capa && "fixedFoveation" in capa) capa.fixedFoveation = 1; } catch (e) {}
    try { if (ses.supportedFrameRates && ses.updateTargetFrameRate && Array.prototype.indexOf.call(ses.supportedFrameRates, 72) >= 0) ses.updateTargetFrameRate(72); } catch (e) {}
    ses.addEventListener("end", vrSale);
    vrSuscribe(); vrLeeAjustes(); VRX.pestana = "mundo";
    VRX.modoPrev = modo; VRX.calPrev = calidad; VRX.nearPrev = camera.near; VRX.farPrev = camera.far;
    if (modo !== "gem") pon("gem"); calidad = 0; camera.near = 0.3; camera.far = 6000;
    scene.add(vrRig); vrRig.add(camera); camera.add(vrVineta); camera.position.set(0, VRX.ojo ? 0 : 1.6, 0); camera.quaternion.identity(); VRC.forEach(function (o) { vrRig.add(o.c); vrRig.add(o.g); }); Mandos.monta(renderer, vrRig); scene.add(arco); scene.add(arcoMarca); scene.add(panel.m); scene.add(ficha.m); scene.add(fichaB.m); vrVueloEntra();
    VRP.on = true; vrPerfil(0); VRX.emaDt = 13.9; VRX.emaJs = 6; VRX.tNivel = 0;
    if (!paseando) entraPaseo(); primera = true; TR.act = false; persona.visible = false; Bus.emite("perros:llegan");
    var r = VRX.rig; r.x = pp.x; r.z = -pp.y; r.yaw = 0; r.y = suelo(pp.x, pp.y) * exag + vrBaseY(); VRX.vuelo = false; VRX.mirador = false; VRX.prev = {}; VRX.giroOk = true; VRX.sucio = true; panel.m.visible = true; panel.ini = false; ficha.m.visible = false; fichaB.m.visible = false; VRX.fichaId = ""; VRX.balFirma = "";
    vrAplicaRig(); vrRig.updateMatrixWorld(true); VRX.on = true; VRX.entrando = false; vrEstado("sesión VR en marcha"); Bus.emite("vr:entra");
  }
  function vrAnimacion(t, frame) { if (!frame || !VRX.on) return; VRX.frame = frame; cuadro(performance.now()); }
  function vrSale() {
    if (!VRX.on && !VRX.sesion) return;
    VRX.on = false; VRP.on = false; VRX.sesion = null; renderer.setAnimationLoop(null); renderer.xr.enabled = false;
    vrRig.remove(camera); camera.remove(vrVineta); scene.remove(vrRig); VRC.forEach(function (o) { vrRig.remove(o.c); vrRig.remove(o.g); }); Mandos.libera(); scene.remove(arco); scene.remove(arcoMarca); scene.remove(panel.m); scene.remove(ficha.m); scene.remove(fichaB.m); vrVueloSale();
    Arboles.perfil(null); Escena3D.perfil(null); UN.uBumpK.value = 1; calidad = VRX.calPrev; camera.near = VRX.nearPrev; camera.far = VRX.farPrev; camera.updateProjectionMatrix(); if (modo !== VRX.modoPrev) pon(VRX.modoPrev);
    camera.position.set(0, 0, 0); camera.quaternion.identity(); camera.scale.set(1, 1, 1);
    if (paseando) salePaseo();
    VRX.vuelo = false; VRX.mirador = false; vrEstado("soportado (sesión terminada)"); Bus.emite("vr:sale"); tamano(); requestAnimationFrame(bucle);
  }
  window.__vrDebug = function () { return Object.assign({ on: VRX.on, estado: VRX.estado, nivel: VRX.nivel, rig: JSON.parse(JSON.stringify(VRX.rig)), cabeza: [VRX.cab.x, VRX.cab.y, VRX.cab.z], pp: [pp.x, pp.y], vuelo: VRX.vuelo, panel: panel.m.visible, ficha: ficha.m.visible, hover: VRX.hover, pestana: VRX.pestana, giro: VRX.giro, sinEscena: VRX.sinPint, vinetaOn: VRX.vineta, vineta: vrVineta.material.uniforms.uK.value, sesionesN: VRX.sesionesN, paseando: paseando, primera: primera, modo: modo, exag: exag, hora: $("hora").value, ndvi: ndviIdx, parcSel: VRX.parcSel, panelPos: panel.m.position.toArray(), fichaPos: ficha.m.position.toArray(), frames: renderer.info.render.frame, nivelArb: Arboles.resumen(), hierba: VRP.hierba, bump: UN.uBumpK.value, perfiles: VR_PERFILES.length, near: camera.near, far: camera.far,
    panelTam: [panel.W, panel.H, panel.pw, panel.ph], fichaB: fichaB.m.visible, fichaBPos: fichaB.m.position.toArray(), fichaBTam: [fichaB.W, fichaB.H, fichaB.pw, fichaB.ph], fichaId: VRX.fichaId, hoverB: VRX.hoverB, fichaGente: VRX.balInfo && VRX.fichaId ? VRX.balInfo.gente : null,
    tiempo: null, fichaTiempo: null,   // los pone la fila del componente fichas-tiempo (35_fichas_tiempo.js) por PanelVR.debug(), si está
    gente: VRX.gente ? { activo: VRX.gente.activo, n: VRX.gente.n, filas: VRX.gente.filas.map(function (f) { return { id: f.id, alias: f.alias, modo: f.modo, dist: f.dist }; }) } : null }, PanelVR.debug()); };
  window.__vrPerfil = function (n) { vrPerfil(n); VRX.tNivel = 0; };   // fuerza un perfil (pruebas): el adaptador espera 4 s antes de volver a decidir
  window.__vrOlivo = function () { var h = VRX.cab, b = null, bd = 1e9; copas.forEach(function (c) { if (!c.oliv) return; var d = Math.hypot(c.x - h.x, -c.y - h.z); if (d > 6 && d < bd) { bd = d; b = c; } }); return b ? [b.x, (suelo(b.x, b.y) + b.h * 0.6) * exag, -b.y] : null; };
  window.__vrBotones = function (cual) { return ((cual === "baliza" ? VRX.botonesB : VRX.botones) || []).map(function (b) { return { id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }; }); };
  vrDetecta();

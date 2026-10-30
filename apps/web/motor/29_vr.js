// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: VRX, vrDebugExtra, vrFundido, vrAparece, panel, ficha, vrMideEmpieza, vrMideFin, vrActualiza, VR_PERFILES, vrFin
// Consume: 01_datos (D, $, fmt, VRP), 02_mundo (suelo, orto, copas), 03_escena (renderer, scene, camera, texColor, exag, modo, calidad),
//   04b_escena3d (Escena3D), 05_nube (nube), 07b_arboles (Arboles), 09_camara (eligeCopa, pon), 10_ndvi (NDV, ndviIdx),
//   12_paseo (paseando, persona, teclas, primera, entraPaseo, salePaseo, actualizaPaseo), 12b_llegada (Llegada), 13_parcelas (parcelas, fincas),
//   15_tiempo (calma, nivel, hace), 16_vida (mira, quad, dron),
//   19_balizas (BAL, cierraBaliza, balizaAbierta, abreBaliza, balizaVR, irABaliza, tBal), 20_sonido (snd, iniciaSonido), 22_huellas (pendFactor),
//   25_perros (perrosLlegan), 26_presencia (Presencia), 30_mide (MideEst, Mide), 90_final (tamano, cuadro, bucle)
// Nota: Publica además window.__vrDebug, __vrOlivo, __vrBotones, __vrVuelo, __vrBalizas y VR_ESTADO (depuración y pruebas VR).
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
    tp: null, hover: "", tBal: 0, fichaT: 0, sucio: true, hapt: 0, hMov: 0, sesionesN: 0, cab: new THREE.Vector3(),
    gente: null, genteFirma: "", tGente: 0, balK: -1, balFirma: "", balInfo: null, hoverB: "", botonesB: []
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

  // ----- 2) mandos, rayo y arco de teletransporte
  var vrRayo = new THREE.Raycaster(), vrV1 = new THREE.Vector3(), vrV2 = new THREE.Vector3(), vrV3 = new THREE.Vector3(), vrM4 = new THREE.Matrix4(), vrEjeY = new THREE.Vector3(0, 1, 0), vrQ = new THREE.Quaternion();
  var VRC = [0, 1].map(function (i) {
    var c = renderer.xr.getController(i), g = renderer.xr.getControllerGrip(i), o = { i: i, c: c, g: g, src: null, mano: "", rayo: null };
    var lin = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -8)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, fog: false }));
    lin.visible = false; c.add(lin); o.rayo = lin;
    var cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.13), new THREE.MeshBasicMaterial({ color: 0x4a5560, fog: false })); g.add(cuerpo);
    c.addEventListener("connected", function (e) { o.src = e.data || null; o.mano = (e.data && e.data.handedness) || ""; lin.visible = !!(e.data && e.data.targetRayMode !== "gaze"); });
    c.addEventListener("disconnected", function () { o.src = null; o.mano = ""; lin.visible = false; });
    c.addEventListener("selectstart", function () { if (VRX.on) vrGatillo(o); });
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
  function vrSlider(id, d) { var s = $(id); if (!s) return; var v = Math.max(Number(s.min), Math.min(Number(s.max), Number(s.value) + d * Number(s.step || 1))); s.value = v; s.dispatchEvent(new Event("input", { bubbles: true })); VRX.sucio = true; }
  function vrBotones() {
    var B = [];
    function b(id, x, y, w, h, txt, fn, on) { B.push({ id: id, x: x, y: y, w: w, h: h, txt: txt, fn: fn, on: !!on }); }
    if (VRX.mideTarjeta) { b("mideX", 372, 668, 280, 76, "Cerrar", function () { VRX.mideTarjeta = false; }); return B; }   // T7a: con la tarjeta de la medida abierta, solo «Cerrar»
    ["nube", "gem", "orto"].forEach(function (m, i) { b("m_" + m, 40 + i * 316, 112, 300, 64, ["Nube LiDAR", "Gemelo", "Ortofoto"][i], function () { pon(m); VRX.sucio = true; }, modo === m); });
    b("h-", 420, 200, 90, 64, "−", function () { vrSlider("hora", -1); }); b("h+", 800, 200, 90, 64, "+", function () { vrSlider("hora", 1); });
    b("f-", 420, 276, 90, 64, "−", function () { vrSlider("hSel", -1); }); b("f+", 800, 276, 90, 64, "+", function () { vrSlider("hSel", 1); });
    b("e-", 420, 352, 90, 64, "−", function () { vrSlider("exag", -1); }); b("e+", 800, 352, 90, 64, "+", function () { vrSlider("exag", 1); });
    b("p-", 420, 428, 90, 64, "◀", function () { vrParcela(-1); }); b("p+", 800, 428, 90, 64, "▶", function () { vrParcela(1); });
    b("snd", 40, 520, 222, 64, "Sonido: " + ($("cSonido").checked ? "sí" : "no"), function () { var c = $("cSonido"); c.checked = !c.checked; c.dispatchEvent(new Event("change", { bubbles: true })); if (c.checked) iniciaSonido(); VRX.sucio = true; }, $("cSonido").checked);
    b("vig", 278, 520, 222, 64, "Viñeta: " + (VRX.vineta ? "sí" : "no"), function () { VRX.vineta = !VRX.vineta; VRX.sucio = true; }, VRX.vineta);
    b("mide", 516, 520, 222, 64, "Medir " + Mide.segundos() + " s", function () { Mide.inicia(); }, Mide.estado() === "midiendo");
    b("sal", 754, 520, 230, 64, "Salir de VR", function () { if (VRX.sesion) VRX.sesion.end(); }, false);
    vrGenteBotones(b);
    return B;
  }
  function vrValores() {
    var h = Number($("hora").value), hh = Math.floor(h), mm = h % 1 ? "30" : "00", pr = parcelas[VRX.parcSel] || parcelas[0], fn = fincas.length > 1 && fincas[pr.finca] ? fincas[pr.finca].nombre + " · " : "";
    return { hora: hh + ":" + mm, fecha: NDV ? dd2(NDV.fechas[ndviIdx]) : "–", exag: fmt(exag, exag % 1 ? 2 : 0) + "×", parcela: fn + pr.nombre };
  }
  function vrPintaPanel() {
    var cx = panel.cx, W = panel.W, H = panel.H, B = vrBotones(), v = vrValores();
    if (VRX.mideTarjeta) { vrPintaMide(B); return; }
    cx.clearRect(0, 0, W, H); cx.fillStyle = "rgba(14,18,22,0.93)"; vrRect(cx, 0, 0, W, H, 30); cx.fill();
    cx.fillStyle = "#e9eef2"; cx.font = "bold 40px system-ui, sans-serif"; cx.textBaseline = "middle"; cx.fillText(D.titulo_vr || (document.title || "Gemelo"), 40, 54);
    cx.font = "26px system-ui, sans-serif"; cx.fillStyle = "#9fb1bd"; cx.textAlign = "right"; cx.fillText("Y: ocultar · gatillo: pulsar", W - 36, 54); cx.textAlign = "left";
    cx.font = "28px system-ui, sans-serif"; cx.fillStyle = "#c9d5dc";
    [["Hora", 232], ["Fecha NDVI", 308], ["Exageración", 384], ["Parcela", 460]].forEach(function (f) { cx.fillText(f[0], 40, f[1]); });
    cx.textAlign = "center"; cx.fillStyle = "#ffffff"; cx.font = "bold 30px system-ui, sans-serif";
    cx.fillText(v.hora, 655, 232); cx.fillText(v.fecha, 655, 308); cx.fillText(v.exag, 655, 384);
    cx.font = "bold 24px system-ui, sans-serif"; var nombre = v.parcela; while (cx.measureText(nombre).width > 270 && nombre.length > 4) nombre = nombre.slice(0, -2); if (nombre !== v.parcela) nombre += "…"; cx.fillText(nombre, 655, 460);
    B.forEach(function (q) {
      cx.fillStyle = VRX.hover === q.id ? "#4a5866" : q.on ? "#2e7d3a" : "#2a3139"; vrRect(cx, q.x, q.y, q.w, q.h, 14); cx.fill();
      cx.fillStyle = "#ffffff"; cx.font = "bold 28px system-ui, sans-serif"; cx.textAlign = "center"; cx.fillText(q.txt, q.x + q.w / 2, q.y + q.h / 2 + 1);
    });
    vrPintaGente(cx, W);
    cx.textAlign = "left"; cx.font = "24px system-ui, sans-serif"; cx.fillStyle = "#9fb1bd"; cx.fillText("Mandos: izq. palanca = andar · grip = correr · X = viñeta · Y = panel", 40, 966);
    cx.fillText("der. palanca ←→ = girar 30° · ↑ = teletransporte · A = volar · B = mirador", 40, 1000);
    cx.fillStyle = "#7fe3ff"; cx.fillText(VRX.vuelo ? "Volando: izq. avanza · der. ↑ apunta al suelo; al soltar, bajas allí" : "Caminando por el olivar", 40, 1036);
    cx.fillStyle = "#6f808c"; cx.font = "20px system-ui, sans-serif"; cx.fillText("LiDAR PNOA 2024 · © Instituto Geográfico Nacional (CC BY 4.0)", 40, 1068);
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
  // ----- 3b) I5: la sección Gente del panel: una fila por persona que se ve (Presencia.puntos: con pose, sin bloquear, no en vista aérea), las más
  // cercanas arriba, con «Ir con» pulsable con el rayo y el gatillo. Ir es Presencia.irCon (26_presencia.js): fundido a negro y de pie a 2,5-4 m de
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
  var GENTE_FILAS = 4, GENTE_Y = 604;   // filas que caben en el panel; dónde empieza la sección (px del canvas del panel)
  function vrGente() { var pts = typeof Presencia !== "undefined" && Presencia.activo() ? Presencia.puntos() : null; return VrGentePuro.filas(pts, { x: VRX.cab.x, y: -VRX.cab.z }, GENTE_FILAS); }
  function vrGenteBotones(b) {   // un «Ir con» grande (240 × 64 px = 23 × 6 cm a 1 m) por fila
    var g = VRX.gente = vrGente(); VRX.genteFirma = VrGentePuro.firma(g);
    g.filas.forEach(function (f, i) { b("ir:" + f.id, 744, GENTE_Y + 50 + i * 74, 240, 64, "Ir con", function () { vrIrCon(f.id); }, false); });
  }
  function vrPintaGente(cx, W) {
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
  function vrGenteTic(dt) { VRX.tGente += dt; if (VRX.tGente < 0.5) return; VRX.tGente = 0; if (VrGentePuro.firma(vrGente()) !== VRX.genteFirma) VRX.sucio = true; }   // dos veces por segundo, con el panel abierto
  function vrIrCon(id) {
    if (typeof Presencia === "undefined" || !Presencia.irCon(id)) { VRX.sucio = true; return false; }   // ya no se ve (se fue, la bloqueaste) o hay un fundido en curso
    panel.m.visible = false; VRX.hover = ""; return true;
  }

  // ----- 3c) I5: la ficha de la baliza en VR, en su propia lámina: estado, quién está y «Ir a esta baliza» y «Cerrar», pulsables con el rayo y el gatillo.
  // Sale cuando la ficha de la baliza está abierta (a menos de 17 m de ella, o con el rayo y el gatillo sobre su columna de luz) y no está delante el
  // panel ni la ficha de un olivo. Ir es irABaliza (19_balizas.js): fundido y de pie a 4-5,5 m de la columna, mirándola (Llegada.ve).
  function vrBalizaTic(dt) {
    VRX.tBal += dt; if (VRX.tBal < 0.6) return; VRX.tBal = 0;
    var k = balizaAbierta();
    if (k < 0) { fichaB.m.visible = false; VRX.balK = -1; VRX.balFirma = ""; return; }
    if (panel.m.visible || ficha.m.visible) { fichaB.m.visible = false; return; }
    var b = balizaVR(k), f = JSON.stringify(b);
    if (k !== VRX.balK || !fichaB.m.visible) fichaB.ini = false;
    if (k !== VRX.balK || f !== VRX.balFirma) { VRX.balK = k; VRX.balFirma = f; vrPintaBaliza(b); }
    fichaB.m.visible = true;
  }
  function vrPintaBaliza(b) {   // 768 × 480 px en 0,62 × 0,39 m; botones de 72 px (6 cm de alto)
    var cx = fichaB.cx, W = fichaB.W, H = fichaB.H, B = [], y = 70;
    VRX.balInfo = b;
    cx.clearRect(0, 0, W, H); cx.fillStyle = "rgba(14,18,22,0.93)"; vrRect(cx, 0, 0, W, H, 22); cx.fill(); cx.textBaseline = "top"; cx.textAlign = "left";
    cx.fillStyle = "#" + ("000000" + (b.color || 0).toString(16)).slice(-6); vrRect(cx, 0, 22, 10, H - 44, 4); cx.fill();   // el color de su estado, como la columna
    cx.fillStyle = "#ffffff"; cx.font = "bold 34px system-ui, sans-serif"; vrTexto(cx, "Baliza · " + b.titulo, 26, 18, W - 52, 0, 40, 1);
    if (b.gente) { cx.fillStyle = "#7fe3ff"; cx.font = "bold 26px system-ui, sans-serif"; y += vrTexto(cx, b.gente.length ? "Aquí están: " + b.gente.join(", ") : "No hay nadie en esta parcela", 26, y, W - 52, 0, 32, 2) * 32 + 8; }
    cx.fillStyle = "#cfd9df"; cx.font = "24px system-ui, sans-serif";
    for (var i = 0; i < b.lineas.length && y < H - 160; i++) y += vrTexto(cx, b.lineas[i], 26, y, W - 52, 0, 30, 2) * 30 + 4;
    cx.fillStyle = "#6f808c"; cx.font = "18px system-ui, sans-serif"; vrTexto(cx, b.pie, 26, H - 120, W - 52, 0, 22, 1);
    B.push({ id: "bir", x: 26, y: H - 92, w: 470, h: 72, txt: "Ir a esta baliza", fn: function () { irABaliza(b.k); } });
    B.push({ id: "bce", x: 516, y: H - 92, w: 226, h: 72, txt: "Cerrar", fn: function () { cierraBaliza(); fichaB.m.visible = false; VRX.balK = -1; VRX.balFirma = ""; } });
    cx.textBaseline = "middle"; cx.textAlign = "center"; cx.font = "bold 30px system-ui, sans-serif";
    B.forEach(function (q) { cx.fillStyle = VRX.hoverB === q.id ? "#4a5866" : q.id === "bir" ? "#1d5f6b" : "#2a3139"; vrRect(cx, q.x, q.y, q.w, q.h, 14); cx.fill(); cx.fillStyle = "#ffffff"; cx.fillText(q.txt, q.x + q.w / 2, q.y + q.h / 2 + 1); });
    cx.textAlign = "left"; fichaB.tex.needsUpdate = true; VRX.botonesB = B;
  }
  var vrW0 = new THREE.Vector3();
  function vrColumnaBajo(rr) {   // ¿apunta el rayo a la columna de luz de una baliza (del pie a 28,5 m)? { i, t (m por el rayo) } o null; el radio crece con la distancia
    var o = rr.ray.origin, d = rr.ray.direction, b = d.y, den = 1 - b * b, mejor = null, ms = 1e9;
    if (den < 1e-6) return null;
    for (var i = 0; i < BAL.length; i++) {
      var g = BAL[i].position; vrW0.set(o.x - g.x, o.y - g.y, o.z - g.z);
      var dw = d.x * vrW0.x + d.y * vrW0.y + d.z * vrW0.z, s = Math.max(0, Math.min(28.5, (vrW0.y - b * dw) / den));   // altura del punto más cercano en la columna
      var t = (g.x - o.x) * d.x + (g.y + s - o.y) * d.y + (g.z - o.z) * d.z; if (t < 0.5 || t > 2500) continue;
      var dist = Math.hypot(o.x + d.x * t - g.x, o.y + d.y * t - g.y - s, o.z + d.z * t - g.z), rad = Math.max(1.2, t * 0.012), sc = dist / rad;
      if (sc < 1 && sc + t * 0.0005 < ms) { ms = sc + t * 0.0005; mejor = { i: i, t: t }; }
    }
    return mejor;
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
  function vrMideFin() { VRX.mideTarjeta = true; panel.m.visible = true; panel.ini = false; VRX.sucio = true; }

  // ----- 4) la persona en la escena: posición del rig (el espacio de referencia desplazado) y locomoción
  function vrAplicaRig() {
    var r = VRX.rig; vrRig.position.set(r.x, r.y, r.z); vrRig.rotation.set(0, r.yaw, 0);
  }
  function vrCabeza() {   // la cabeza en el mundo: la pose local que dejó three al pintar, girada y trasladada por el rig
    var r = VRX.rig; VRX.cab.copy(camera.position).applyAxisAngle(vrEjeY, r.yaw); VRX.cab.x += r.x; VRX.cab.y += r.y; VRX.cab.z += r.z; return VRX.cab;
  }
  function vrIrA(px, py) {   // lleva la cabeza a (px, py) del mundo (py hacia el norte), sin cambiar la dirección de la mirada
    var h = vrCabeza(); VRX.rig.x += px - h.x; VRX.rig.z += -py - h.z; VRX.rig.y = suelo(px, py) * exag + VRX.ojo;
  }
  function vrEjes(src) { var g = src && src.gamepad; if (!g || !g.axes) return { x: 0, y: 0, ok: false }; var a = g.axes, i = a.length >= 4 ? 2 : 0; return { x: a[i] || 0, y: a[i + 1] || 0, ok: true }; }
  function vrBoton(src, k) { var g = src && src.gamepad, b = g && g.buttons && g.buttons[k]; return !!(b && b.pressed); }
  function vrFlanco(clave, v) { var a = VRX.prev[clave]; VRX.prev[clave] = v; return v && !a; }
  function vrPulso(o, fuerza, ms) { try { var g = o && o.src && o.src.gamepad, h = g && g.hapticActuators && g.hapticActuators[0]; if (h && h.pulse) h.pulse(fuerza, ms); } catch (e) {} }
  var vrDz = function (v) { return Math.abs(v) < 0.18 ? 0 : v; };
  function vrActualiza(dt, tms) {
    vrFundidoPaso(dt);
    var r = VRX.rig, h = vrCabeza(), L = vrMano("left"), R = vrMano("right"), iz = vrEjes(L.src), de = vrEjes(R.src);
    // botones: Y panel, X viñeta, A vuelo, B mirador
    if (vrFlanco("Y", vrBoton(L.src, 5))) { panel.m.visible = !panel.m.visible; if (panel.m.visible) { panel.ini = false; VRX.sucio = true; } vrPulso(L, 0.2, 20); }
    if (vrFlanco("X", vrBoton(L.src, 4))) { VRX.vineta = !VRX.vineta; VRX.sucio = true; }
    if (vrFlanco("A", vrBoton(R.src, 4))) { VRX.vuelo = !VRX.vuelo; VRX.mirador = false; VRX.sucio = true; vrPulso(R, 0.2, 20); }
    if (vrFlanco("B", vrBoton(R.src, 5))) { vrMirador(!VRX.mirador); vrPulso(R, 0.3, 25); }
    VRX.correr = vrBoton(L.src, 1);
    // giro a saltos (palanca derecha ← →) y teletransporte (palanca derecha ↑: arco; al soltar, salta)
    var gx = vrDz(de.x), gy = vrDz(de.y), mueveStick = 0;
    if (Math.abs(gx) > 0.7 && Math.abs(gx) > Math.abs(gy)) {
      if (VRX.giroOk) { VRX.giroOk = false; var d = -Math.sign(gx) * Math.PI / 6; vrV2.set(r.x - h.x, 0, r.z - h.z).applyAxisAngle(vrEjeY, d); r.x = h.x + vrV2.x; r.z = h.z + vrV2.z; r.yaw += d; VRX.hMov = 0.25; vrPulso(R, 0.1, 10); }
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
    var gnd = suelo(nx, -nz) * exag + VRX.ojo;
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
    if (ficha.m.visible) { vrSigue(ficha, dt, 0.95, -0.38); VRX.fichaT -= dt; if (VRX.fichaT <= 0) ficha.m.visible = false; }
    vrBalizaTic(dt);
    if (fichaB.m.visible) {
      vrSigue(fichaB, dt, 0.95, -0.42);
      var qb = vrBajoRayo(fichaB, VRX.botonesB, rr), hb = qb ? qb.id : "";
      if (hb !== VRX.hoverB) { VRX.hoverB = hb; if (VRX.balInfo) vrPintaBaliza(VRX.balInfo); }
    }
  }
  function vrMirador(on) {
    VRX.mirador = on; VRX.vuelo = on; VRX.sucio = true; var h = vrCabeza();
    if (on) { VRX.rig.y = suelo(h.x, -h.z) * exag + 230; } else { VRX.rig.y = suelo(h.x, -h.z) * exag + VRX.ojo; }
  }
  // el gatillo: sobre el panel pulsa un botón; sobre un olivo, abre su ficha
  function vrGatillo(o) {
    var rr = vrRayoDe(o);
    if (panel.m.visible) {
      var q = vrBajoRayo(panel, VRX.botones, rr);
      if (q) { vrPulso(o, 0.4, 25); q.fn(); VRX.sucio = true; return; }
      if (q === false) return;
    }
    if (fichaB.m.visible) {   // la ficha de la baliza (I5): «Ir a esta baliza» y «Cerrar»
      var qb = vrBajoRayo(fichaB, VRX.botonesB, rr);
      if (qb) { vrPulso(o, 0.4, 25); qb.fn(); return; }
      if (qb === false) return;
    }
    var best = null, bs = 1e9, bt = 1e9, ro = rr.ray.origin, rd = rr.ray.direction;
    copas.forEach(function (c) {
      if (!c.oliv) return; var cy = (suelo(c.x, c.y) + c.h * 0.6) * exag; vrV3.set(c.x - ro.x, cy - ro.y, -c.y - ro.z); var t = vrV3.dot(rd); if (t < 0.4 || t > 150) return;
      var perp = vrV3.addScaledVector(rd, -t).length(), rad = Math.max(1.3, 0.55 * (c.perfil.reduce(function (a, b) { return a + b; }, 0) / 8)), s = perp / rad; if (s < 1 && t * 0.02 + s < bs) { bs = t * 0.02 + s; best = c; bt = t; }
    });
    var col = vrColumnaBajo(rr);   // la columna de luz de una baliza, si está antes que el olivo: abre su ficha (I5; como tocarla en pantalla)
    if (col && (!best || col.t < bt)) { abreBaliza(col.i); VRX.tBal = 1; vrPulso(o, 0.4, 25); return; }
    if (best) {
      eligeCopa(best); var pares = [], dts = $("fichaDatos").children; for (var j = 0; j + 1 < dts.length; j += 2) pares.push(dts[j].textContent + ": " + dts[j + 1].textContent);
      $("ficha").hidden = true; vrPintaFicha($("fichaTitulo").textContent, [pares.slice(0, 3).join(" · "), pares.slice(3).join(" · ")]); vrPulso(o, 0.4, 25);
    }
  }

  // ----- 5) la viñeta de confort (un velo con el centro transparente, pegado a la cabeza)
  var vrVineta = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform float uK; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(0.28, 0.62, r) * uK; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }"
  }));
  vrVineta.position.set(0, 0, -0.32); vrVineta.renderOrder = 999; vrVineta.frustumCulled = false; vrVineta.visible = false;

  // ----- 6) el perfil de rendimiento de las gafas y el adaptador por tiempo de fotograma
  var VR_PERFILES = [{ n: 0.8, r: 0.75, tri: 380000, h: 32, b: 1, e: 16 }, { n: 0.55, r: 0.6, tri: 270000, h: 20, b: 0, e: 24 }, { n: 0.35, r: 0.45, tri: 190000, h: 0, b: 0, e: 32 }, { n: 0.2, r: 0.3, tri: 130000, h: 0, b: 0, e: 48 }];   // b: relieve fino del suelo (uBumpK); se apaga en cuanto el fotograma va justo (decisión 24). e: errorTarget (px) de la escena 3D Tiles; valores de partida SIN medir en las gafas
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
    try { iniciaSonido(); } catch (e) {}   // el gesto de pulsar el botón es lo que deja arrancar el audio
    var ses = null;
    try {
      renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType("local-floor"); renderer.xr.setFramebufferScaleFactor(0.9);
      ses = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor"] });
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
    VRX.modoPrev = modo; VRX.calPrev = calidad; VRX.nearPrev = camera.near; VRX.farPrev = camera.far;
    if (modo !== "gem") pon("gem"); calidad = 0; camera.near = 0.3; camera.far = 6000;
    scene.add(vrRig); vrRig.add(camera); camera.add(vrVineta); camera.position.set(0, VRX.ojo ? 0 : 1.6, 0); camera.quaternion.identity(); VRC.forEach(function (o) { vrRig.add(o.c); vrRig.add(o.g); }); scene.add(arco); scene.add(arcoMarca); scene.add(panel.m); scene.add(ficha.m); scene.add(fichaB.m); vrVueloEntra();
    VRP.on = true; vrPerfil(0); VRX.emaDt = 13.9; VRX.emaJs = 6; VRX.tNivel = 0;
    if (!paseando) entraPaseo(); primera = true; TR.act = false; persona.visible = false; try { perrosLlegan(); } catch (e) {}
    var r = VRX.rig; r.x = pp.x; r.z = -pp.y; r.yaw = 0; r.y = suelo(pp.x, pp.y) * exag + VRX.ojo; VRX.vuelo = false; VRX.mirador = false; VRX.prev = {}; VRX.giroOk = true; VRX.sucio = true; panel.m.visible = true; panel.ini = false; ficha.m.visible = false; fichaB.m.visible = false; VRX.balK = -1; VRX.balFirma = "";
    vrAplicaRig(); vrRig.updateMatrixWorld(true); VRX.on = true; VRX.entrando = false; vrEstado("sesión VR en marcha");
  }
  function vrAnimacion(t, frame) { if (!frame || !VRX.on) return; VRX.frame = frame; cuadro(performance.now()); }
  function vrSale() {
    if (!VRX.on && !VRX.sesion) return;
    VRX.on = false; VRP.on = false; VRX.sesion = null; renderer.setAnimationLoop(null); renderer.xr.enabled = false;
    vrRig.remove(camera); camera.remove(vrVineta); scene.remove(vrRig); VRC.forEach(function (o) { vrRig.remove(o.c); vrRig.remove(o.g); }); scene.remove(arco); scene.remove(arcoMarca); scene.remove(panel.m); scene.remove(ficha.m); scene.remove(fichaB.m); vrVueloSale();
    Arboles.perfil(null); Escena3D.perfil(null); UN.uBumpK.value = 1; calidad = VRX.calPrev; camera.near = VRX.nearPrev; camera.far = VRX.farPrev; camera.updateProjectionMatrix(); if (modo !== VRX.modoPrev) pon(VRX.modoPrev);
    camera.position.set(0, 0, 0); camera.quaternion.identity(); camera.scale.set(1, 1, 1);
    if (paseando) salePaseo();
    VRX.vuelo = false; VRX.mirador = false; vrEstado("soportado (sesión terminada)"); tamano(); requestAnimationFrame(bucle);
  }
  window.__vrDebug = function () { return { on: VRX.on, estado: VRX.estado, nivel: VRX.nivel, rig: JSON.parse(JSON.stringify(VRX.rig)), cabeza: [VRX.cab.x, VRX.cab.y, VRX.cab.z], pp: [pp.x, pp.y], vuelo: VRX.vuelo, panel: panel.m.visible, ficha: ficha.m.visible, hover: VRX.hover, vineta: vrVineta.material.uniforms.uK.value, sesionesN: VRX.sesionesN, paseando: paseando, primera: primera, modo: modo, exag: exag, hora: $("hora").value, ndvi: ndviIdx, parcSel: VRX.parcSel, panelPos: panel.m.position.toArray(), fichaPos: ficha.m.position.toArray(), frames: renderer.info.render.frame, nivelArb: Arboles.resumen(), hierba: VRP.hierba, bump: UN.uBumpK.value, perfiles: VR_PERFILES.length, near: camera.near, far: camera.far,
    panelTam: [panel.W, panel.H, panel.pw, panel.ph], fichaB: fichaB.m.visible, fichaBPos: fichaB.m.position.toArray(), fichaBTam: [fichaB.W, fichaB.H, fichaB.pw, fichaB.ph], balK: VRX.balK, hoverB: VRX.hoverB, balGente: VRX.balInfo ? VRX.balInfo.gente : null,
    gente: VRX.gente ? { activo: VRX.gente.activo, n: VRX.gente.n, filas: VRX.gente.filas.map(function (f) { return { id: f.id, alias: f.alias, modo: f.modo, dist: f.dist }; }) } : null }; };
  window.__vrPerfil = function (n) { vrPerfil(n); VRX.tNivel = 0; };   // fuerza un perfil (pruebas): el adaptador espera 4 s antes de volver a decidir
  window.__vrOlivo = function () { var h = VRX.cab, b = null, bd = 1e9; copas.forEach(function (c) { if (!c.oliv) return; var d = Math.hypot(c.x - h.x, -c.y - h.z); if (d > 6 && d < bd) { bd = d; b = c; } }); return b ? [b.x, (suelo(b.x, b.y) + b.h * 0.6) * exag, -b.y] : null; };
  window.__vrBotones = function (cual) { return ((cual === "baliza" ? VRX.botonesB : VRX.botones) || []).map(function (b) { return { id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }; }); };
  window.__vrBalizas = function () { return BAL.map(function (g) { return g.position.toArray(); }); };   // el pie de cada columna de luz (pruebas, I5)
  vrDetecta();

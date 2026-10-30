// Un WebXR de mentira para ejercitar el modo VR sin casco: sesión, espacios de referencia con desplazamiento, vista estéreo, dos mandos con palancas, botones y gatillo.
// Se inyecta ANTES de que cargue la página (Playwright addInitScript). No sustituye al hardware: solo comprueba que el código JS entra, se mueve, pinta el panel y sale sin errores.
(function () {
  function I() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function rigidInv(m) { var o = I(); for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) o[c * 4 + r] = m[r * 4 + c]; for (var r2 = 0; r2 < 3; r2++) o[12 + r2] = -(o[r2] * m[12] + o[4 + r2] * m[13] + o[8 + r2] * m[14]); return o; }
  function fromPQ(p, q) { var x = q.x, y = q.y, z = q.z, w = q.w, xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    return new Float32Array([1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0, 2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0, 2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0, p.x, p.y, p.z, 1]); }
  function lookMat(pos, dir) {   // matriz cuyo -z apunta a dir
    var zx = -dir[0], zy = -dir[1], zz = -dir[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    var xx = 0 * zz - 1 * zy, xy = 1 * zx - 0 * zz, xz = 0 * zy - 0 * zx; if (Math.hypot(xx, xy, xz) < 1e-6) { xx = 1; xy = 0; xz = 0; } var lx = Math.hypot(xx, xy, xz); xx /= lx; xy /= lx; xz /= lx;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, xy, xz, 0, yx, yy, yz, 0, zx, zy, zz, 0, pos[0], pos[1], pos[2], 1]);
  }
  window.XRRigidTransform = function (p, q) { p = p || { x: 0, y: 0, z: 0, w: 1 }; q = q || { x: 0, y: 0, z: 0, w: 1 }; this.position = p; this.orientation = q; this.matrix = fromPQ(p, q); };
  function Espacio(off) { this.off = off || null; this.mat = off ? off.matrix : I(); }
  Espacio.prototype.getOffsetReferenceSpace = function (tr) { return new Espacio(tr); };
  window.XRWebGLLayer = function (ses, gl, o) { this.framebuffer = null; this.framebufferWidth = gl.drawingBufferWidth; this.framebufferHeight = gl.drawingBufferHeight; this.fixedFoveation = 0; this.getViewport = function (v) { var w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; return v.eye === "left" ? { x: 0, y: 0, width: w / 2, height: h } : { x: w / 2, y: 0, width: w / 2, height: h }; }; };
  [window.WebGLRenderingContext, window.WebGL2RenderingContext].forEach(function (C) { if (C) C.prototype.makeXRCompatible = function () { return Promise.resolve(); }; });

  // perfiles que anuncia cada mando (I6): el izquierdo, lo que se espera de un Quest 3; el derecho, uno que el gemelo no copia (cae en el genérico)
  var M = window.__mockXR = { perfiles: { left: ["meta-quest-touch-plus", "oculus-touch-v3", "oculus-touch-v2", "oculus-touch", "generic-trigger-squeeze-thumbstick"], right: ["oculus-touch"] }, sesion: null, cabeza: [0, 1.6, 0], mandos: {}, fotogramas: 0, tope: 0, bloqueadoMarco: false, soporta: true, soloLocal: false, registro: [] };
  function mando(mano) {
    var x = mano === "left" ? -0.25 : 0.25, pos = [x, 1.2, -0.3];
    return { handedness: mano, targetRayMode: "tracked-pointer", profiles: (M.perfiles && M.perfiles[mano]) || ["oculus-touch"], hand: null, pos: pos, dir: [0, 0, -1],
      targetRaySpace: { get mat() { return lookMat(this.owner.pos, this.owner.dir); } }, gripSpace: { get mat() { return lookMat(this.owner.pos, this.owner.dir); } },
      gamepad: { axes: [0, 0, 0, 0], buttons: [0, 1, 2, 3, 4, 5].map(function () { return { pressed: false, touched: false, value: 0 }; }), hapticActuators: [{ pulse: function () { M.registro.push("pulso"); return Promise.resolve(true); } }] } };
  }
  function nuevaSesion() {
    var s = new EventTarget(); s.renderState = { baseLayer: null, depthNear: 0.1, depthFar: 1000 }; s.inputSources = []; s.supportedFrameRates = [72, 90]; s.fin = false;
    s.updateRenderState = function (o) { Object.keys(o).forEach(function (k) { s.renderState[k] = o[k]; }); };
    s.requestReferenceSpace = function (t) { if (t === "local-floor" && M.soloLocal) return Promise.reject(new Error("no local-floor")); return Promise.resolve(new Espacio()); };
    s.updateTargetFrameRate = function (f) { M.registro.push("fps " + f); return Promise.resolve(); };
    s.requestAnimationFrame = function (cb) { return setTimeout(function () { if (s.fin) return; M.fotogramas++; cb(performance.now(), frame(s)); }, 14); };
    s.cancelAnimationFrame = function (id) { clearTimeout(id); };
    s.end = function () { if (s.fin) return Promise.resolve(); s.fin = true; s.dispatchEvent(new Event("end")); M.sesion = null; return Promise.resolve(); };
    var l = mando("left"), r = mando("right"); l.targetRaySpace.owner = l; l.gripSpace.owner = l; r.targetRaySpace.owner = r; r.gripSpace.owner = r; M.mandos = { left: l, right: r };
    setTimeout(function () { s.inputSources = [l, r]; var ev = new Event("inputsourceschange"); ev.added = [l, r]; ev.removed = []; s.dispatchEvent(ev); }, 30);
    return s;
  }
  function frame(s) {
    return { session: s,
      getViewerPose: function (space) {
        var cab = lookMat(M.cabeza.map(function (v, i) { return v + (i === 0 ? Math.sin(M.fotogramas / 40) * 0.02 : 0); }), M.dirCabeza || [0, 0, -1]), enEsp = mul(rigidInv(space.mat), cab);
        var f = 1 / Math.tan(0.8), a = 1, n = 0.1, fa = 1000, pm = new Float32Array([f / a, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]);
        function vista(eye, dx) { var t = mul(enEsp, fromPQ({ x: dx, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 })); return { eye: eye, projectionMatrix: pm, transform: { matrix: t, inverse: { matrix: rigidInv(t) } } }; }
        return { transform: { matrix: enEsp }, views: [vista("left", -0.032), vista("right", 0.032)] };
      },
      getPose: function (sp, base) { return { transform: { matrix: mul(rigidInv(base.mat), sp.mat) }, emulatedPosition: false }; } };
  }
  Object.defineProperty(navigator, "xr", { configurable: true, value: {
    isSessionSupported: function () { if (M.bloqueadoMarco) return Promise.reject(Object.assign(new Error("blocked"), { name: "SecurityError" })); return Promise.resolve(M.soporta); },
    requestSession: function () { var s = nuevaSesion(); M.sesion = s; return Promise.resolve(s); }
  } });
  // controles para el test
  M.ejes = function (mano, x, y) { var g = M.mandos[mano].gamepad; g.axes[2] = x; g.axes[3] = y; };
  M.boton = function (mano, k, v) { var b = M.mandos[mano].gamepad.buttons[k]; b.pressed = !!v; b.value = v ? 1 : 0; };
  M.apunta = function (mano, p) { var m = M.mandos[mano]; m.dir = [p[0] - m.pos[0], p[1] - m.pos[1], p[2] - m.pos[2]]; };
  M.gatillo = function (mano) { var s = M.sesion, m = M.mandos[mano]; ["selectstart", "select", "selectend"].forEach(function (t) { var ev = new Event(t); ev.inputSource = m; ev.frame = frame(s); s.dispatchEvent(ev); }); };
})();

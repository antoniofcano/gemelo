// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Mandos
// Consume: 03_escena (renderer)
// ===============================================================================
  // ---------- I6: el aspecto de los mandos y de las manos en VR. Antes eran dos cubos; ahora, como en el menú de las Meta, el MODELO REAL del mando
  // que anuncia el aparato (perfiles de WebXR Input Profiles: un Quest 3 anuncia el de los Touch Plus y un Quest 2 «oculus-touch-v3») y, con
  // seguimiento de manos, la MANO ARTICULADA (malla con huesos de «generic-hand»). No se reinventa nada (regla 12): XRControllerModelFactory y
  // XRHandModelFactory de three 0.186.1, pedidas con import() solo al entrar en VR. Los modelos NO bajan de jsDelivr (lo que hacen las fábricas por
  // defecto): vite.config.js copia los perfiles de @webxr-input-profiles/assets (MIT) a <página>/xr/perfiles/ y aquí se les dice setPath() (§5 de CLAUDE.md).
  // Respaldo: si un modelo de mando no llega (sin import(), 404, glb roto o más de 6 s), el cubo de siempre en ese mando; si la malla de la mano no
  // llega, la mano de esferas (una sola llamada). Se avisa en consola una vez. Ilustrativo: el modelo es el del catálogo del perfil, no un escaneo.
  // Presupuesto (regla 6): sin sombras (ni proyectan ni reciben), y todo lo de GPU se libera al salir de la sesión (libera()).
  // Las fábricas escuchan a un «apoderado» (un EventDispatcher por mando y sesión), no a los grupos de three, que viven toda la vida de la página:
  // así cada sesión empieza limpia y no se acumulan escuchas. Los grupos reales (grip y mano) solo los escucha este módulo, una vez.
  var Mandos = (function () {
    var RUTA = "./xr/perfiles", ESPERA = 6000;
    var pideLib = null, S = null, avisos = {};
    function avisa1(clave, txt) { if (avisos[clave]) return; avisos[clave] = true; try { console.warn("[VR] " + txt); } catch (e) {} }
    function lib() {
      return pideLib || (pideLib = Promise.all([import("three/addons/webxr/XRControllerModelFactory.js"), import("three/addons/webxr/XRHandModelFactory.js"),
        import("three/addons/webxr/XRHandPrimitiveModel.js"), import("three/addons/loaders/GLTFLoader.js")])
        .then(function (m) { return { FabC: m[0].XRControllerModelFactory, FabM: m[1].XRHandModelFactory, Prim: m[2].XRHandPrimitiveModel, GLTFLoader: m[3].GLTFLoader }; })
        .catch(function (e) { pideLib = null; throw e; }));
    }
    // un GLTFLoader cuyo error se queda aquí (el de la fábrica de mandos lanza una excepción sin capturar): avisa y pone el respaldo
    function cargador(L, alFallar) {
      var l = new L.GLTFLoader(), ld = l.load.bind(l);
      l.load = function (url, ok, prog) { return ld(url, ok, prog, function (e) { alFallar(url, e); }); };
      return l;
    }

    // los dos mandos de three (índice 0 y 1): grip (dónde se agarra, donde va el modelo) y mano (las articulaciones)
    var E = [0, 1].map(function (i) {
      var e = { i: i, grip: renderer.xr.getControllerGrip(i), mano: renderer.xr.getHand(i), src: null, pxC: null, pxM: null, modC: null, modM: null, okC: false, okM: false, cubo: null, reloj: 0 };
      e.grip.addEventListener("connected", function (ev) { conecta(e, ev.data); });
      e.grip.addEventListener("disconnected", function () { desconecta(e); });
      return e;
    });
    function esMando(src) { return !!(src && src.targetRayMode === "tracked-pointer" && src.gamepad && !src.hand); }
    function conecta(e, src) {
      e.src = src || null; e.okC = false; e.okM = false; e.primitiva = false; if (e.cubo) e.cubo.visible = false;
      if (!S || !e.src) return;
      if (e.pxC) { e.pxC.dispatchEvent({ type: "connected", data: e.src }); e.pxM.dispatchEvent({ type: "connected", data: e.src }); }
      clearTimeout(e.reloj); var s0 = S, src0 = e.src;
      e.reloj = setTimeout(function () {   // ¿llegó el modelo? si no, el respaldo (cubre también el fallo al pedir profilesList.json/profile.json, que la fábrica solo avisa)
        if (S !== s0 || e.src !== src0) return;
        if (esMando(src0) && !e.okC) respaldoMando(e, "el modelo del mando no llegó en " + ESPERA / 1000 + " s");
        if (src0.hand && !e.okM) respaldoMano(e, "la malla de la mano no llegó en " + ESPERA / 1000 + " s");
      }, ESPERA);
    }
    function desconecta(e) {
      clearTimeout(e.reloj); e.src = null; e.okC = false; e.okM = false; e.primitiva = false; if (e.cubo) e.cubo.visible = false;
      if (e.pxC) { e.pxC.dispatchEvent({ type: "disconnected" }); e.pxM.dispatchEvent({ type: "disconnected" }); }
    }

    // lo que llega: sin sombras, apuntado para liberarlo al salir (los clones comparten geometría y material con la copia en caché)
    function prepara(s, obj) {
      obj.traverse(function (o) {
        if (!o.isMesh) return;
        o.castShadow = false; o.receiveShadow = false;
        if (!s) return;
        s.gpu.add(o.geometry);
        if (o.isInstancedMesh) s.gpu.add(o);                    // su instanceMatrix
        if (o.isSkinnedMesh && o.skeleton) s.gpu.add(o.skeleton);   // su textura de huesos
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          s.gpu.add(m); Object.keys(m).forEach(function (k) { if (m[k] && m[k].isTexture) s.gpu.add(m[k]); });
        });
      });
    }
    function respaldoMando(e, porque) {
      if (!S || !esMando(e.src) || e.okC) return;
      avisa1("mando", "mandos: " + porque + "; se dibuja una caja en su lugar");
      if (!e.cubo) { e.cubo = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.13), new THREE.MeshBasicMaterial({ color: 0x4a5560, fog: false })); e.grip.add(e.cubo); }
      e.cubo.visible = true;
    }
    function respaldoMano(e, porque) {
      if (!S || !S.L || !e.src || !e.src.hand || e.okM || !e.modM) return;
      avisa1("mano", "manos: " + porque + "; se dibujan esferas en las articulaciones");
      var hm = e.modM; hm.clear();
      hm.motionController = new S.L.Prim(hm, e.pxM, RUTA, e.src.handedness, { primitive: "sphere" });
      prepara(S, hm.motionController.handMesh); e.okM = true; e.primitiva = true;
    }

    function monta(rend, rig) {
      if (S) return;
      var s = S = { rig: rig, L: null, gpu: new Set() };
      E.forEach(function (e) { rig.add(e.mano); });
      lib().then(function (L) {
        if (S !== s) return;
        s.L = L;
        var fc = new L.FabC(cargador(L, function (url) { E.forEach(function (e) { respaldoMando(e, "no se pudo cargar " + url); }); }), function (escM) {
          var e = E.filter(function (x) { return x.modC === escM.parent; })[0];
          if (S !== s || !e) return;
          prepara(s, escM); e.okC = true; if (e.cubo) e.cubo.visible = false;
        }).setPath(RUTA);
        var lm = cargador(L, function (url) { E.forEach(function (e) { respaldoMano(e, "no se pudo cargar " + url); }); });
        lm.setPath(RUTA + "/generic-hand/");
        var fm = new L.FabM(lm, function (obj) {
          var e = E.filter(function (x) { return x.modM === obj.parent; })[0];
          if (S !== s || !e) return;
          if (e.primitiva) { obj.parent.remove(obj); return; }   // llegó tarde: ya están las esferas
          prepara(s, obj); e.okM = true;
        }).setPath(RUTA + "/generic-hand/");
        E.forEach(function (e) {
          e.pxC = new THREE.EventDispatcher(); e.pxM = new THREE.EventDispatcher();
          Object.defineProperty(e.pxM, "joints", { get: function () { return e.mano.joints; } });   // lo que leen los modelos de mano
          e.modC = fc.createControllerModel(e.pxC); e.grip.add(e.modC);
          e.modM = fm.createHandModel(e.pxM, "mesh"); e.mano.add(e.modM);
          if (e.src) conecta(e, e.src);   // el mando ya estaba conectado antes de que llegaran las fábricas
        });
      }).catch(function (err) {
        if (S !== s) return;
        avisa1("lib", "mandos: no se pudieron cargar las fábricas de modelos de three (" + (err && err.message || err) + ")");
        E.forEach(function (e) { respaldoMando(e, "sin fábricas de modelos"); });
      });
    }

    function libera() {
      if (!S) return;
      var s = S;
      E.forEach(function (e) {
        clearTimeout(e.reloj);
        if (e.pxC) { e.pxC.dispatchEvent({ type: "disconnected" }); e.pxM.dispatchEvent({ type: "disconnected" }); }   // las fábricas sueltan su modelo
        if (e.modC) e.grip.remove(e.modC);
        if (e.modM) { e.modM.clear(); e.mano.remove(e.modM); }
        if (e.cubo) { e.grip.remove(e.cubo); e.cubo.geometry.dispose(); e.cubo.material.dispose(); e.cubo = null; }
        s.rig.remove(e.mano);
        e.pxC = e.pxM = e.modC = e.modM = null; e.okC = e.okM = false; e.primitiva = false;
      });
      s.gpu.forEach(function (r) { try { r.dispose(); } catch (err) {} });
      s.gpu.clear(); S = null;
    }

    // para pruebas y ?debug: qué se dibuja en cada mando, con sus triángulos y mallas (cada malla, una llamada)
    function resumen() {
      var tri = 0, mallas = 0;
      var filas = E.map(function (e) {
        var t = 0, n = 0;
        [e.modC, e.modM, e.cubo].forEach(function (o) {
          if (!o || o.visible === false) return;
          o.traverse(function (m) {
            if (!m.isMesh || !m.visible) return;
            var g = m.geometry, k = (g.index ? g.index.count : g.attributes.position.count) / 3;
            if (m.isInstancedMesh) k *= m.count;
            t += k; n++;
          });
        });
        tri += t; mallas += n;
        return { mano: e.src ? e.src.handedness : "", tipo: !e.src ? "" : e.src.hand ? "mano" : "mando", perfil: e.modC && e.modC.motionController ? e.modC.motionController.id : "",
          modelo: e.okC || e.okM ? (e.primitiva ? "esferas" : "modelo") : e.cubo && e.cubo.visible ? "caja" : "", tri: Math.round(t), mallas: n };
      });
      return { montado: !!S, fabricas: !!(S && S.L), filas: filas, tri: Math.round(tri), mallas: mallas, gpu: S ? S.gpu.size : 0 };
    }
    window.__mandos = resumen;
    return { monta: monta, libera: libera, resumen: resumen };
  })();

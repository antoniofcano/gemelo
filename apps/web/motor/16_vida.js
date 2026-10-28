// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: tVida, enQuad, vq, gFauna, esfera, altSuelo, mira, conejos, quad, temaEstela, velPaseo, giroPaseo, ponQuad, vidaPaseo, enDron, dr, dron,
//   ponDron, cicloVista, dronMando, camaraDron, vidaEntra, vidaSale, actualizaVida
// Consume: 01_datos (D, $), 02_mundo (suelo, copaAlta, copas, cIn), 03_escena (scene, camera, exag, modo), 04_terreno (terreno),
//   07_follaje (matSombra, geoSombra), 12_paseo (paseando, persona, teclas, primera, camPos),
//   15_tiempo (calma, texBrillo, cur, meta, ins, nivel, temaBarrera, num1, rumbo), 22_huellas (pendFactor, quadInc, inclinaQuad),
//   25_perros (amenazaConejo)
// ===============================================================================
  // ---------- la vida del olivar: pájaros, conejos y un quad con estela de luz (Tron) para el paseo
  var tVida = 0, enQuad = false, vq = 0, gFauna = new THREE.Group(); scene.add(gFauna);
  var matAveC = new THREE.MeshLambertMaterial({ color: 0x4a3f33 }), matAveV = new THREE.MeshLambertMaterial({ color: 0xd9cdb4 }), matAla = new THREE.MeshLambertMaterial({ color: 0x302b2a, side: THREE.DoubleSide }), matPico = new THREE.MeshLambertMaterial({ color: 0xd49a30 });
  var matConejo = new THREE.MeshLambertMaterial({ color: 0x8b755a }), matConejoB = new THREE.MeshLambertMaterial({ color: 0xece4d4 }), matOreja = new THREE.MeshLambertMaterial({ color: 0xa88f78 });
  function esfera(r, m, sx, sy, sz, x, y, z, padre) { var me = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m); me.scale.set(sx, sy, sz); me.position.set(x, y, z); padre.add(me); return me; }
  function altSuelo(x, y) { return suelo(x, y) * exag; }
  function quita(a, o) { var i = a.indexOf(o); if (i >= 0) a.splice(i, 1); }

  // --- pájaros: el ave mira hacia -z; el aleteo mueve dos alas con bisagra
  function creaAve() {
    var g = new THREE.Group();
    esfera(0.1, matAveC, 0.85, 0.8, 1.8, 0, 0, 0, g); esfera(0.1, matAveV, 0.7, 0.45, 1.2, 0, -0.035, 0.02, g); esfera(0.065, matAveC, 1, 1, 1, 0, 0.03, -0.2, g);
    var pico = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 5), matPico); pico.rotation.x = -Math.PI / 2; pico.position.set(0, 0.025, -0.3); g.add(pico);
    var cola = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.2), matAveC); cola.position.set(0, 0.01, 0.27); g.add(cola);
    function ala(lado) { var piv = new THREE.Group(); piv.position.set(lado * 0.05, 0.02, -0.02); var m = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.2), matAla); m.rotation.x = -Math.PI / 2; m.position.x = lado * 0.22; piv.add(m); g.add(piv); return piv; }
    g.userData = { ai: ala(-1), ad: ala(1), fase: Math.random() * 6.28 };
    gFauna.add(g); return g;
  }
  function aleteo(g, quieta, rapido) {
    var u = g.userData, a = quieta ? 0.05 : Math.sin(tVida * (rapido ? 22 : 15) + u.fase) * 0.85;
    u.ai.rotation.z = a; u.ad.rotation.z = -a;
  }
  function mira(g, hx, hz) { g.rotation.y = Math.atan2(-hx, -hz); }
  function escalaVista(g, base) { var d = camera.position.distanceTo(g.position); g.scale.setScalar(base * Math.max(1, Math.min(9, d / 60))); }
  var bandada = [], BANDADAS = [{ a: 320, b: 150, w: 0.11, h: 38, ph: 0 }, { a: 210, b: 260, w: -0.085, h: 55, ph: 2.4 }];
  BANDADAS.forEach(function (b, k) { for (var i = 0; i < 7; i++) { var g = creaAve(); g.userData.b = k; g.userData.of = [(Math.random() - 0.5) * 26, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 26]; g.userData.fx = 0.5 + Math.random(); bandada.push(g); } });
  var posadas = [];
  for (var ip = 0; ip < 8; ip++) { var av0 = creaAve(); av0.visible = false; av0.userData.est = "fuera"; av0.userData.t = 0; posadas.push(av0); }

  // --- conejos
  function creaConejo() {
    var g = new THREE.Group();
    esfera(0.2, matConejo, 0.78, 0.74, 1.25, 0, 0.2, 0, g); var cab = esfera(0.12, matConejo, 0.9, 0.9, 1, 0, 0.32, -0.25, g);
    esfera(0.05, matConejoB, 1, 1, 1, 0, 0.23, 0.27, g);
    var orejas = [-1, 1].map(function (l) { var o = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.02), matOreja); o.position.set(l * 0.045, 0.52, -0.25); g.add(o); return o; });
    var sb = new THREE.Mesh(geoSombra, matSombra); sb.scale.set(0.8, 1, 0.8); sb.position.y = 0.03; g.add(sb);
    g.userData = { cab: cab, orejas: orejas, est: "fuera", t: 0, x: 0, y: 0, dir: 0, fase: Math.random() * 6 }; g.visible = false; gFauna.add(g); return g;
  }
  var conejos = []; for (var ic = 0; ic < 6; ic++) conejos.push(creaConejo());
  function arbolCerca(rmin, rmax) { for (var k = 0; k < 50; k++) { var c = cIn[(Math.random() * cIn.length) | 0], d = Math.hypot(c.x - pp.x, c.y - pp.y); if (d >= rmin && d <= rmax) return c; } return null; }

  // --- el quad: mira hacia -z; las ruedas giran con la velocidad; los acentos de neón combinan con la linde
  var quad = (function () {
    var g = new THREE.Group(), mt = function (c) { return new THREE.MeshLambertMaterial({ color: c }); }, neon = new THREE.MeshBasicMaterial({ color: 0x40f0ff }), ruedas = [];
    function caja(w, h, d, m, x, y, z) { var me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); g.add(me); return me; }
    caja(0.62, 0.22, 1.55, mt(0x2a2e34), 0, 0.46, 0); caja(0.5, 0.3, 0.5, mt(0xd9561c), 0, 0.78, -0.22); caja(0.38, 0.14, 0.62, mt(0x15171a), 0, 0.74, 0.28);
    caja(0.78, 0.07, 0.4, mt(0xd9561c), 0, 0.55, -0.82); caja(0.78, 0.07, 0.36, mt(0x2a2e34), 0, 0.55, 0.82);
    caja(0.05, 0.4, 0.05, mt(0x15171a), 0, 0.82, -0.52); caja(0.92, 0.05, 0.05, mt(0x15171a), 0, 1.02, -0.5);
    caja(0.04, 0.04, 1.5, neon, -0.32, 0.44, 0); caja(0.04, 0.04, 1.5, neon, 0.32, 0.44, 0);
    var faro = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6d0 })); faro.position.set(0, 0.7, -0.95); g.add(faro);
    [[-0.58, -0.62], [0.58, -0.62], [-0.58, 0.62], [0.58, 0.62]].forEach(function (p) {
      var w = new THREE.Group(); w.position.set(p[0], 0.3, p[1]);
      var r = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.26, 14), mt(0x1a1b1d)); r.rotation.z = Math.PI / 2; w.add(r);
      var tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.28, 8), mt(0xb9bcc2)); tapa.rotation.z = Math.PI / 2; w.add(tapa); g.add(w); ruedas.push(w);
    });
    var sb = new THREE.Mesh(geoSombra, matSombra); sb.scale.set(1.9, 1, 2.5); sb.position.y = 0.03; g.add(sb);
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: texBrillo(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0 })); glow.scale.set(3.4, 3.4, 1); glow.position.set(0, 0.7, -1.1); g.add(glow);
    g.userData = { ruedas: ruedas, glow: glow }; g.visible = false; scene.add(g); return g;
  })();

  // --- las estelas: un muro de luz que se apaga con el tiempo (como en Tron); una para el quad (naranja) y otra para el dron (cian)
  var ESTELAS = [];
  function creaEstela(colOsc, colCla, alto, vida, NE) {
    var e = { n: 0, ult: null, alto: alto, NE: NE }, pos = new Float32Array(NE * 6), av = new Float32Array(NE * 2), ab = new Float32Array(NE * 2), idx = [];
    for (var i = 0; i < NE; i++) { av[i * 2] = 0; av[i * 2 + 1] = 1; if (i < NE - 1) { var a0 = i * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); } }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aV", new THREE.BufferAttribute(av, 1)); g.setAttribute("aB", new THREE.BufferAttribute(ab, 1)); g.setIndex(idx); g.setDrawRange(0, 0);
    e.u = { uNow: { value: 0 }, uVida: { value: vida }, uColor: { value: new THREE.Color(colOsc) }, uAlpha: { value: 1 } };
    e.mat = new THREE.ShaderMaterial({
      uniforms: e.u, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: "attribute float aV; attribute float aB; varying float vV; varying float vB; void main(){ vV = aV; vB = aB; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float uNow; uniform float uVida; uniform vec3 uColor; uniform float uAlpha; varying float vV; varying float vB; " +
        "void main(){ float edad = clamp((uNow - vB) / uVida, 0.0, 1.0); float v = (1.0 - edad); v *= v; " +
        "float caida = pow(1.0 - vV, 1.3); float pie = smoothstep(0.14, 0.0, vV); float filo = smoothstep(0.88, 1.0, vV) * 0.7; " +
        "float a = (0.14 + 0.6 * caida + pie * 0.9 + filo) * v * uAlpha; " +
        "gl_FragColor = vec4(uColor * (1.0 + 0.9 * pie * (1.0 - edad)), clamp(a, 0.0, 1.0)); }"
    });
    e.malla = new THREE.Mesh(g, e.mat); e.malla.frustumCulled = false; e.malla.renderOrder = 6; scene.add(e.malla);
    e.tema = function (oscuro) { e.mat.blending = oscuro ? THREE.AdditiveBlending : THREE.NormalBlending; e.u.uColor.value.set(oscuro ? colOsc : colCla); e.u.uAlpha.value = oscuro ? 1 : 1.3; e.mat.needsUpdate = true; };
    e.reinicia = function () { e.ult = null; };
    e.emite = function (x, y, y0, sep) {
      if (e.ult && Math.hypot(x - e.ult[0], y - e.ult[1]) < (sep || 0.55)) return;
      e.ult = [x, y];
      if (e.n === NE) { pos.copyWithin(0, 6); ab.copyWithin(0, 2); e.n -= 1; }
      var i = e.n++;
      pos[i * 6] = x; pos[i * 6 + 1] = y0; pos[i * 6 + 2] = -y; pos[i * 6 + 3] = x; pos[i * 6 + 4] = y0 + e.alto; pos[i * 6 + 5] = -y;
      ab[i * 2] = ab[i * 2 + 1] = tVida;
      g.attributes.position.needsUpdate = true; g.attributes.aB.needsUpdate = true; g.setDrawRange(0, Math.max(0, (e.n - 1) * 6));
    };
    ESTELAS.push(e); return e;
  }
  var estelaQuad = creaEstela(0xff9a2e, 0xd25a00, 1.3, 6.5, 240), estelaDron = creaEstela(0x40f0ff, 0x007f99, 0.5, 5, 260);
  function temaEstela(oscuro) { if (!ESTELAS) return; ESTELAS.forEach(function (e) { e.tema(oscuro); }); if (anilloDron) { anilloDron.material.blending = oscuro ? THREE.AdditiveBlending : THREE.NormalBlending; anilloDron.material.color.set(oscuro ? 0x40f0ff : 0x007f99); anilloDron.material.needsUpdate = true; } }

  // --- el paseo: el quad cambia la velocidad, el giro, la colisión y la cámara
  function velPaseo(av, dt) {
    if (!enQuad) { vq = 0; return av * (teclas.run ? 4.3 : 1.7) * (av < 0 ? 0.55 : 1) * pendFactor(); }
    var meta = av * (teclas.run ? 12 : 7.5) * (av < 0 ? 0.4 : 1) * pendFactor(), k = (Math.abs(meta) < Math.abs(vq) || meta * vq < 0) ? 4.5 : 2.2;
    vq += (meta - vq) * Math.min(1, dt * k); if (Math.abs(vq) < 0.02 && !av) vq = 0; return vq;
  }
  function giroPaseo(vel) { if (!enQuad) return 1.9; return 2.2 * (0.3 + 0.7 * Math.min(1, Math.abs(vel) / 3)) * (1 - 0.35 * Math.min(1, Math.abs(vel) / 12)); }
  function ponQuad(v) {
    if (v && enDron) ponDron(false);
    enQuad = !!v && paseando; vq = 0; estelaQuad.reinicia(); quad.visible = enQuad;
    $("btnQuad").setAttribute("aria-pressed", String(enQuad)); $("btnQuad").textContent = enQuad ? "Bajar del quad" : "Subir al quad"; $("padQuad").setAttribute("aria-pressed", String(enQuad));
    if (!enQuad) { var u = persona.userData; u.pi.rotation.x = u.pd.rotation.x = u.bi.rotation.x = u.bd.rotation.x = 0; }
  }
  function vidaPaseo(dt, gy, vel) {
    if (enDron) { var ud = persona.userData; ud.pi.rotation.x = ud.pd.rotation.x = 0; ud.bi.rotation.x = ud.bd.rotation.x = 1.0; }
    if (!enQuad) { quad.visible = false; return; }
    var fx = Math.sin(pp.ang), fz = -Math.cos(pp.ang), u = persona.userData, mov = Math.min(1, Math.abs(vel) / 6);
    quad.visible = true; quad.position.set(pp.x, gy + 0.02 + Math.sin(tVida * 31) * 0.012 * mov, -pp.y); inclinaQuad(dt);
    quad.userData.ruedas.forEach(function (r) { r.rotation.x -= vel * dt / 0.3; });
    persona.position.set(pp.x - fx * 0.2, gy - 0.02, -pp.y - fz * 0.2); persona.rotation.set(quadInc.pit * 0.9, -pp.ang, quadInc.rol * 0.9, "YXZ");
    u.pi.rotation.x = u.pd.rotation.x = 1.15; u.bi.rotation.x = u.bd.rotation.x = 1.05;
    var noche = 1 - nivel(cur.ms).d; quad.userData.glow.material.opacity = 0.2 + 0.7 * noche;
    if (Math.abs(vel) > 0.8) estelaQuad.emite(pp.x - fx * 1.0, pp.y - Math.cos(pp.ang) * 1.0, gy + 0.06);
  }

  // --- el dron: lo vuela el muñequito desde donde está (el dron mira hacia -z, como todo lo demás)
  var enDron = false, vistaD = 0, dr = { x: 0, y: 0, h: 0, yaw: 0, vf: 0, vh: 0, giro: 0, pit: 0, rol: 0 };
  var dron = (function () {
    var g = new THREE.Group(), mt = function (c) { return new THREE.MeshLambertMaterial({ color: c }); }, led = function (c) { return new THREE.MeshBasicMaterial({ color: c }); }, props = [], leds = [];
    function caja(w, h, d, m, x, y, z, ry) { var me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); if (ry) me.rotation.y = ry; g.add(me); return me; }
    caja(0.3, 0.1, 0.42, mt(0xe9ebee), 0, 0, 0); caja(0.24, 0.06, 0.3, mt(0x2b2f36), 0, 0.07, 0.02); caja(0.26, 0.16, 0.3, mt(0xf4f6f8), 0, -0.14, 0.04);
    var cam = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mt(0x15171a)); cam.position.set(0, -0.08, -0.2); g.add(cam);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p, k) {
      var mx = p[0] * 0.4, mz = p[1] * 0.4, largo = Math.hypot(mx, mz);
      caja(0.045, 0.035, largo, mt(0x2b2f36), mx / 2, 0.03, mz / 2, Math.atan2(mx, mz));
      var motor = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 10), mt(0x15171a)); motor.position.set(mx, 0.05, mz); g.add(motor);
      var h = new THREE.Group(); h.position.set(mx, 0.1, mz);
      var disco = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshBasicMaterial({ color: 0xd8dde3, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })); disco.rotation.x = -Math.PI / 2; h.add(disco);
      var pala = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.008, 0.03), mt(0x20232a)); h.add(pala); g.add(h); props.push({ g: h, s: k % 2 ? 1 : -1 });
      var l = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), led(p[1] < 0 ? 0xff3b30 : 0x34e07a)); l.position.set(mx, 0.0, mz + p[1] * 0.04); g.add(l); leds.push(l);
    });
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: texBrillo(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0, color: 0x9ff4ff })); glow.scale.set(5, 5, 1); glow.position.set(0, -0.25, 0); g.add(glow);
    g.scale.setScalar(1.8); g.userData = { props: props, leds: leds, glow: glow }; g.visible = false; scene.add(g); return g;
  })();
  var anilloDron = (function () {
    var g = new THREE.RingGeometry(0.86, 1, 56); g.rotateX(-Math.PI / 2);
    var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x40f0ff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    m.visible = false; m.renderOrder = 4; scene.add(m); return m;
  })();
  function angDifRad(a, b) { var d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; }
  function textoAyudaPaseo() {
    return enDron ? "Dron: W/S avanzar · A/D girar · Espacio/C subir y bajar · Mayús rápido · V cambia la cámara · E guardar el dron · Esc: salir"
      : "Flechas o WASD: andar y girar · Mayús: correr · V: primera persona · Q: quad · E: dron · M: minimapa · Esc: salir";
  }
  function ponDron(v) {
    var quiero = !!v && paseando;
    if (quiero && enQuad) ponQuad(false);
    enDron = quiero; vistaD = 0; primera = false; dron.visible = enDron; anilloDron.visible = enDron; estelaDron.reinicia();
    if (enDron) {
      var gy0 = altSuelo(pp.x, pp.y); dr.x = pp.x + Math.sin(pp.ang) * 1.2; dr.y = pp.y + Math.cos(pp.ang) * 1.2; dr.yaw = pp.ang; dr.h = gy0 + 3; dr.vf = dr.vh = dr.giro = 0;
    } else { var u = persona.userData; u.pi.rotation.x = u.pd.rotation.x = u.bi.rotation.x = u.bd.rotation.x = 0; }
    $("btnDron").setAttribute("aria-pressed", String(enDron)); $("btnDron").textContent = enDron ? "Guardar el dron" : "Sacar el dron"; $("padDron").setAttribute("aria-pressed", String(enDron));
    $("padSube").hidden = !enDron; $("padBaja").hidden = !enDron; $("tDron").hidden = !enDron; $("ayudaPaseo").textContent = textoAyudaPaseo();
  }
  function cicloVista() {
    if (enDron) { vistaD = (vistaD + 1) % 3; primera = vistaD === 1; } else primera = !primera;
  }
  // el mando: se llama desde el paseo con lo que se pulsa (y el muñequito deja de andar)
  function dronMando(av, gi, dt) {
    var vmax = teclas.run ? 15 : 8.5, sube = (teclas.sube ? 1 : 0) - (teclas.baja ? 1 : 0), k = Math.min(1, dt * 2.4);
    dr.vf += (av * vmax * (av < 0 ? 0.6 : 1) - dr.vf) * k; dr.giro += (gi * 1.7 - dr.giro) * Math.min(1, dt * 5); dr.yaw += dr.giro * dt; dr.vh += (sube * 5.5 - dr.vh) * Math.min(1, dt * 3);
    // el viento del tiempo lo empuja (más de lo real para que se note); mismo marco que el mundo: x este, y norte
    var rad = Math.PI / 180, wx = -Math.sin(cur.dir * rad) * cur.viento * 0.35, wy = -Math.cos(cur.dir * rad) * cur.viento * 0.35;
    var fx = Math.sin(dr.yaw), fy = Math.cos(dr.yaw), e = D.ext;
    dr.x = Math.max(e[0] + 3, Math.min(e[2] - 3, dr.x + (fx * dr.vf + wx) * dt)); dr.y = Math.max(e[3] + 3, Math.min(e[1] - 3, dr.y + (fy * dr.vf + wy) * dt));
    var suel = altSuelo(dr.x, dr.y), copa = copaAlta(dr.x, dr.y) * exag, minH = suel + copa + 1.0;   // sobrevuela las copas, no las atraviesa
    dr.h = Math.max(minH, Math.min(suel + 90, dr.h + dr.vh * dt));
    dr.pit += (dr.vf * 0.022 - dr.pit) * Math.min(1, dt * 5); dr.rol += (-dr.giro * 0.2 - dr.rol) * Math.min(1, dt * 5);
    // el muñequito se vuelve a mirar el dron
    pp.ang += angDifRad(Math.atan2(dr.x - pp.x, dr.y - pp.y), pp.ang) * Math.min(1, dt * 3);
  }
  // la cámara en modo dron: true si la lleva ella
  var camV = new THREE.Vector3();
  function camaraDron(dt, gy) {
    if (!enDron) return false;
    var dp = new THREE.Vector3(dr.x, dr.h, -dr.y);
    if (vistaD === 2) { var f = new THREE.Vector3(Math.sin(dr.yaw), -0.2 - dr.pit * 2, -Math.cos(dr.yaw)); camera.position.set(dr.x, dr.h - 0.1, -dr.y); camera.lookAt(camera.position.clone().add(f.multiplyScalar(10))); return true; }
    if (vistaD === 1) { camera.position.set(pp.x, gy + 1.62, -pp.y); camera.lookAt(dp); return true; }
    var fx = Math.sin(pp.ang), fz = -Math.cos(pp.ang), ox = pp.x - fx * 4.6, oz = -pp.y - fz * 4.6, oy = Math.max(gy + 2.4, altSuelo(ox, -oz) + 1.3);
    camV.set(ox, oy, oz); camPos.x += (camV.x - camPos.x) * Math.min(1, dt * 4); camPos.y += (camV.y - camPos.y) * Math.min(1, dt * 4); camPos.z += (camV.z - camPos.z) * Math.min(1, dt * 4);
    camera.position.copy(camPos); camera.lookAt(dp.x * 0.7 + pp.x * 0.3, dp.y * 0.8 + (gy + 1.4) * 0.2, dp.z * 0.7 - pp.y * 0.3); return true;
  }
  function vidaDron(dt) {
    if (!enDron) return;
    var u = dron.userData, suel = altSuelo(dr.x, dr.y);
    dron.position.set(dr.x, dr.h + Math.sin(tVida * 2.2) * 0.04, -dr.y); dron.rotation.set(dr.pit, -dr.yaw, dr.rol, "YXZ");
    u.props.forEach(function (p) { p.g.rotation.y += p.s * dt * 70; });
    var parp = Math.floor(tVida * 2.2) % 2 === 0; u.leds.forEach(function (l, i) { l.visible = i < 2 ? parp : true; });
    u.glow.material.opacity = 0.15 + 0.5 * (1 - nivel(cur.ms).d);
    var alt = dr.h - suel; anilloDron.visible = true; anilloDron.position.set(dr.x, suel + 0.15, -dr.y); anilloDron.scale.setScalar(1.6 + alt * 0.28);
    anilloDron.material.opacity = Math.max(0.15, 0.7 - alt * 0.008) * (0.8 + 0.2 * Math.sin(tVida * 4));
    if (Math.abs(dr.vf) > 0.6 || Math.abs(dr.vh) > 0.6) estelaDron.emite(dr.x - Math.sin(dr.yaw) * 0.5, dr.y - Math.cos(dr.yaw) * 0.5, dr.h - 0.3, 0.5);
    ins.d = (ins.d || 0) + dt;
    if (ins.d > 0.25) {
      ins.d = 0; var vient = cur.viento;
      $("tDron").textContent = "Dron · " + num1(alt, 0) + " m de altura · " + num1(Math.abs(dr.vf), 1) + " m/s · viento " + (vient < 0.3 ? "en calma" : rumbo(cur.dir) + " " + num1(vient, 1) + " m/s") + (vient > 9 ? " · demasiado para volar" : "");
    }
  }

  // --- el ciclo de vida de la fauna
  function nacePosada(av) {
    var c = arbolCerca(26, 70); if (!c) return false;
    var u = av.userData; u.est = "posada"; u.cx = c.x + (Math.random() - 0.5) * 0.8; u.cy = c.y + (Math.random() - 0.5) * 0.8; u.cz = c.h; u.fase = Math.random() * 6;
    av.position.set(u.cx, altSuelo(u.cx, u.cy) + c.h * exag + 0.32, -u.cy); av.rotation.y = Math.random() * 6.28; av.visible = true; aleteo(av, true); return true;
  }
  function naceConejo(co) {
    var c = arbolCerca(18, 55); if (!c) return false;
    var u = co.userData, a = Math.random() * 6.28; u.est = "pasta"; u.x = c.x + Math.cos(a) * (1.6 + Math.random() * 2); u.y = c.y + Math.sin(a) * (1.6 + Math.random() * 2); u.dir = Math.random() * 6.28; u.t = 1 + Math.random() * 2; co.visible = true; return true;
  }
  function vidaEntra() {
    $("btnQuad").hidden = false; $("padQuad").hidden = false; $("btnDron").hidden = false; $("padDron").hidden = false; ponQuad(false); ponDron(false); $("ayudaPaseo").textContent = textoAyudaPaseo();
    posadas.forEach(function (a) { a.userData.est = "fuera"; a.visible = false; }); conejos.forEach(function (c) { c.userData.est = "fuera"; c.visible = false; });
    posadas.forEach(nacePosada); conejos.forEach(naceConejo);
  }
  function vidaSale() {
    ponQuad(false); ponDron(false); $("btnQuad").hidden = true; $("padQuad").hidden = true; $("btnDron").hidden = true; $("padDron").hidden = true;
    posadas.forEach(function (a) { a.userData.est = "fuera"; a.visible = false; }); conejos.forEach(function (c) { c.userData.est = "fuera"; c.visible = false; });
  }
  function actualizaVida(dt) {
    tVida += dt; ESTELAS.forEach(function (e) { e.u.uNow.value = tVida; }); vidaDron(dt);
    var lv = nivel(cur.ms), dia = lv.d, lluviosa = cur.lluvia > 1.5, vuelan = dia > 0.12 && !lluviosa;
    gFauna.visible = $("cFauna").checked;
    // la bandada da vueltas sobre la finca, a la altura del terreno y con más prisa si hay viento
    bandada.forEach(function (g) {
      var u = g.userData, b = BANDADAS[u.b]; g.visible = vuelan;
      if (!vuelan) return;
      var th = b.ph + b.w * tVida * (1 + cur.viento * 0.05), x = Math.cos(th) * b.a + u.of[0], y = Math.sin(th) * b.b + u.of[2], hx = -Math.sin(th) * b.a * b.w, hy = Math.cos(th) * b.b * b.w;
      var alt = altSuelo(x, y) + b.h + u.of[1] + Math.sin(tVida * 0.9 * u.fx + u.fase) * 2.5;
      g.position.set(x, alt, -y); mira(g, hx, -hy); g.rotation.z = Math.sign(b.w) * -0.25; aleteo(g, false, false); escalaVista(g, 1);
    });
    if (!paseando) return;
    var dq = enQuad ? 16 : 9;
    // aves posadas: salen volando si te acercas, suben y se alejan; luego otra ocupa su sitio
    posadas.forEach(function (a) {
      var u = a.userData;
      if (u.est === "posada") {
        var d = Math.hypot(u.cx - pp.x, u.cy - pp.y); a.visible = vuelan || dia > 0.02; aleteo(a, true);
        if (d < dq) { u.est = "vuela"; u.t = 9; u.h = Math.atan2(u.cy - pp.y, u.cx - pp.x) + (Math.random() - 0.5) * 1.2; u.vy = 0; u.px = u.cx; u.py = u.cy; u.pz = a.position.y; }
        else if (d > 120) nacePosada(a);
      } else if (u.est === "vuela") {
        u.t -= dt; u.px += Math.cos(u.h) * 8 * dt; u.py += Math.sin(u.h) * 8 * dt; u.pz += Math.min(3.2, 7 - (u.pz - altSuelo(u.px, u.py))) * dt * 0.8;
        a.position.set(u.px, u.pz, -u.py); mira(a, Math.cos(u.h), -Math.sin(u.h)); a.rotation.x = -0.25; aleteo(a, false, true); a.scale.setScalar(1);
        if (u.t <= 0) { a.visible = false; a.rotation.x = 0; u.est = "fuera"; u.t = 2 + Math.random() * 4; }
      } else { u.t -= dt; if (u.t <= 0) nacePosada(a); }
    });
    // conejos: pastan y dan saltitos entre los olivos; si te acercas, huyen
    conejos.forEach(function (co) {
      var u = co.userData;
      if (u.est === "fuera") { if (!naceConejo(co)) return; }
      var d = Math.hypot(u.x - pp.x, u.y - pp.y);
      if (d > 120) { u.est = "fuera"; co.visible = false; return; }
      var am = amenazaConejo(u.x, u.y); if (u.est !== "huye" && am) { u.est = "huye"; u.t = 2 + Math.random() * 1.6; u.dir = Math.atan2(u.y - am.y, u.x - am.x) + (Math.random() - 0.5) * 1.0; }
      var vel = 0;
      if (u.est === "huye") { vel = 6.5; u.t -= dt; if (u.t <= 0) { u.est = "pasta"; u.t = 1.5 + Math.random() * 2; } }
      else { u.t -= dt; if (u.t <= 0) { u.dir = Math.random() * 6.28; u.t = 1.2 + Math.random() * 2.4; u.salta = Math.random() < 0.55; } vel = u.salta ? 0.9 : 0; }
      var nx = u.x + Math.cos(u.dir) * vel * dt, ny = u.y + Math.sin(u.dir) * vel * dt;
      for (var i = 0; i < copas.length; i++) { var c = copas[i]; if (!c.oliv) continue; var ex = nx - c.x, ey = ny - c.y; if (ex * ex + ey * ey < 0.5 * 0.5) { var dd = Math.sqrt(ex * ex + ey * ey) || 0.001; nx = c.x + ex / dd * 0.5; ny = c.y + ey / dd * 0.5; } }
      var e = D.ext; u.x = Math.max(e[0] + 3, Math.min(e[2] - 3, nx)); u.y = Math.max(e[3] + 3, Math.min(e[1] - 3, ny));
      u.fase += dt * (vel > 3 ? 15 : vel > 0 ? 8 : 2);
      var salto = vel > 0 ? Math.abs(Math.sin(u.fase)) * (vel > 3 ? 0.3 : 0.1) : 0;
      co.position.set(u.x, altSuelo(u.x, u.y) + salto, -u.y); co.rotation.y = Math.atan2(-Math.cos(u.dir), Math.sin(u.dir)); co.rotation.x = vel > 3 ? -Math.sin(u.fase) * 0.2 : 0;
      u.cab.position.y = 0.32 + (vel > 0 ? 0 : -Math.abs(Math.sin(u.fase * 1.3)) * 0.07); u.cab.rotation.x = vel > 0 ? 0 : 0.5 * Math.abs(Math.sin(u.fase * 1.3));
      u.orejas.forEach(function (o, k) { o.rotation.x = vel > 3 ? 0.9 : (u.est === "huye" ? 0.5 : 0.05 * Math.sin(u.fase * 0.7 + k)); });
      co.visible = true;
    });
  }
  (function () {
    $("btnQuad").addEventListener("click", function () { ponQuad(!enQuad); }); $("padQuad").addEventListener("click", function () { ponQuad(!enQuad); });
    $("btnDron").addEventListener("click", function () { ponDron(!enDron); }); $("padDron").addEventListener("click", function () { ponDron(!enDron); });
    [["padSube", "sube"], ["padBaja", "baja"]].forEach(function (p) { var b = $(p[0]); b.addEventListener("pointerdown", function (e) { e.preventDefault(); teclas[p[1]] = true; b.setPointerCapture(e.pointerId); }); b.addEventListener("pointerup", function () { teclas[p[1]] = false; }); b.addEventListener("pointercancel", function () { teclas[p[1]] = false; }); });
  })();
  temaBarrera();



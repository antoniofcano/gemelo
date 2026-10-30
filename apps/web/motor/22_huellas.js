// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: pendienteRumbo, pendFactor, quadInc, inclinaQuad, hSig, emitePolvo, sueloSeco, actualizaHuellas
// Consume: 02_mundo (suelo), 03_escena (scene, exag), 08_marcadores (pendiente), 12_paseo (paseando, teclas), 15_tiempo (cur, nivel, rumbo),
//   16_vida (tVida, enQuad, altSuelo, quad, enDron), 18_paisaje (aguaNivel), 21_suelo (cubierta)
// ===============================================================================
  // ---------- huellas, polvo y pendiente: el suelo se deja marcar y el quad y el paso se adaptan al terreno
  function pendienteRumbo(x, y, ang) {   // pendiente del terreno a lo largo del rumbo y de lado (positiva = sube), con la exageración vertical
    var ds = 0.9, fx = Math.sin(ang), fy = Math.cos(ang), rx = Math.cos(ang), ry = -Math.sin(ang);
    return [(suelo(x + fx * ds, y + fy * ds) - suelo(x - fx * ds, y - fy * ds)) / (2 * ds) * exag, (suelo(x + rx * ds, y + ry * ds) - suelo(x - rx * ds, y - ry * ds)) / (2 * ds) * exag];
  }
  function pendFactor() { var s = pendienteRumbo(pp.x, pp.y, pp.ang)[0]; return Math.max(0.35, Math.min(1.25, 1 - 1.25 * s)); }   // cuesta arriba cuesta más
  var quadInc = { pit: 0, rol: 0 };
  function inclinaQuad(dt) {
    var pe = pendienteRumbo(pp.x, pp.y, pp.ang), k = Math.min(1, dt * 6);
    quadInc.pit += (Math.atan(pe[0]) - quadInc.pit) * k; quadInc.rol += (Math.atan(pe[1]) - quadInc.rol) * k; quad.rotation.set(quadInc.pit, -pp.ang, quadInc.rol, "YXZ");
  }

  // --- huellas: pisadas y rodadas que se desvanecen (un anillo de decals instanciados que siguen el terreno)
  var NH = 900, hBorn = new Float32Array(NH).fill(-1e4), hVida = new Float32Array(NH).fill(1), hTipo = new Float32Array(NH), hSig = 0, hPasoAnt = 0, hUlt = null;
  var geoH = new THREE.PlaneGeometry(1, 1); geoH.rotateX(-Math.PI / 2);
  geoH.setAttribute("aBorn", new THREE.InstancedBufferAttribute(hBorn, 1)); geoH.setAttribute("aVida", new THREE.InstancedBufferAttribute(hVida, 1)); geoH.setAttribute("aTipo", new THREE.InstancedBufferAttribute(hTipo, 1));
  var uHuella = { uNow: { value: 0 }, uColor: { value: new THREE.Color(0x2c2218) } };
  var matHuella = new THREE.ShaderMaterial({
    uniforms: uHuella, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    vertexShader: "attribute float aBorn; attribute float aVida; attribute float aTipo; uniform float uNow; varying vec2 vUv; varying float vAge; varying float vTipo;\n" +
      "void main(){ vUv = uv; vTipo = aTipo; vAge = clamp((uNow - aBorn) / aVida, 0.0, 1.0); gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 uColor; varying vec2 vUv; varying float vAge; varying float vTipo;\n" +
      "void main(){ vec2 p = vUv - 0.5; float a;\n" +
      "if (vTipo < 0.5) { float borde = smoothstep(0.5, 0.34, abs(p.x)); float tacos = 0.62 + 0.38 * step(0.5, fract(vUv.y * 5.0 + abs(p.x) * 2.5)); a = borde * tacos * 0.6; }\n" +
      "else { float planta = smoothstep(1.0, 0.7, length(vec2(p.x / 0.3, (p.y + 0.14) / 0.32))); float punta = smoothstep(1.0, 0.7, length(vec2(p.x / 0.36, (p.y - 0.30) / 0.16))); a = max(planta, punta * 0.9) * 0.55; }\n" +
      "a *= 1.0 - smoothstep(0.55, 1.0, vAge); gl_FragColor = vec4(uColor, a);\n#include <colorspace_fragment>\n}"
  });
  var iHuella = new THREE.InstancedMesh(geoH, matHuella, NH); iHuella.frustumCulled = false; iHuella.count = 0; iHuella.renderOrder = 2; scene.add(iHuella);
  var tmpH = new THREE.Object3D();
  function emiteHuella(x, y, ang, w, l, tipo, vida) {
    var i = hSig++ % NH; tmpH.position.set(x, suelo(x, y) * exag + 0.07, -y); tmpH.rotation.set(0, -ang, 0); tmpH.scale.set(w, 1, l); tmpH.updateMatrix(); iHuella.setMatrixAt(i, tmpH.matrix);
    hBorn[i] = tVida; hVida[i] = vida; hTipo[i] = tipo; iHuella.count = Math.min(hSig, NH);
    iHuella.instanceMatrix.needsUpdate = true; ["aBorn", "aVida", "aTipo"].forEach(function (k) { geoH.attributes[k].needsUpdate = true; });
  }

  // --- polvo: bocanadas que suben, se abren y se apagan; solo con el suelo seco
  var NPV = 200, pvPos = new Float32Array(NPV * 3), pvVel = new Float32Array(NPV * 3), pvBorn = new Float32Array(NPV).fill(-1e4), pvVida = new Float32Array(NPV).fill(1), pvTam = new Float32Array(NPV), pvSig = 0;
  var geoPv = new THREE.BufferGeometry(); geoPv.setAttribute("position", new THREE.BufferAttribute(pvPos, 3)); geoPv.setAttribute("aBorn", new THREE.BufferAttribute(pvBorn, 1)); geoPv.setAttribute("aVida", new THREE.BufferAttribute(pvVida, 1)); geoPv.setAttribute("aTam", new THREE.BufferAttribute(pvTam, 1));
  var uPolvo = { uNow: { value: 0 }, uColor: { value: new THREE.Color(0xb89e74) }, uLuz: { value: 1 } };
  var matPolvo = new THREE.ShaderMaterial({
    uniforms: uPolvo, transparent: true, depthWrite: false,
    vertexShader: "attribute float aBorn; attribute float aVida; attribute float aTam; uniform float uNow; varying float vA;\n" +
      "void main(){ float e = clamp((uNow - aBorn) / aVida, 0.0, 1.0); vA = (1.0 - e) * (1.0 - e); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aTam * (1.0 + 2.4 * e) * (520.0 / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform vec3 uColor; uniform float uLuz; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(uColor * uLuz, smoothstep(1.0, 0.1, d) * vA * 0.62);\n#include <colorspace_fragment>\n}"
  });
  var puntosPolvo = new THREE.Points(geoPv, matPolvo); puntosPolvo.frustumCulled = false; puntosPolvo.renderOrder = 7; scene.add(puntosPolvo);
  function emitePolvo(x, y, h, vx, vy, vz, tam, vida) {
    var i = pvSig++ % NPV; pvPos[i * 3] = x; pvPos[i * 3 + 1] = h; pvPos[i * 3 + 2] = -y; pvVel[i * 3] = vx; pvVel[i * 3 + 1] = vy; pvVel[i * 3 + 2] = -vz; pvBorn[i] = tVida; pvVida[i] = vida; pvTam[i] = tam;
  }
  function sueloSeco(x, y) { return cur.lluvia < 0.3 && aguaNivel < 0.15 && cur.hr < 92 && cubierta(x, y)[0] < 0.8; }
  var hAcPol = 0;
  function actualizaHuellas(dt) {
    uHuella.uNow.value = tVida; uPolvo.uNow.value = tVida; uPolvo.uLuz.value = 0.22 + 0.78 * nivel(cur.ms).d;
    var fx = Math.sin(pp.ang), fy = Math.cos(pp.ang), rx = Math.cos(pp.ang), ry = -Math.sin(pp.ang);
    if (paseando && !enDron && !enQuad) {   // pisadas: una por zancada, alternando pie
      var z = Math.floor(pp.paso / Math.PI);
      if (z !== hPasoAnt && Math.abs(pp.paso) > 0.1) { var lado = (z % 2 === 0 ? 1 : -1) * 0.13; emiteHuella(pp.x + rx * lado, pp.y + ry * lado, pp.ang, 0.13, 0.3, 1, 75); if (teclas.run && sueloSeco(pp.x, pp.y)) emitePolvo(pp.x - fx * 0.2, pp.y - fy * 0.2, suelo(pp.x, pp.y) * exag + 0.1, -fx * 0.4 + (Math.random() - 0.5) * 0.5, 0.5, -fy * 0.4 + (Math.random() - 0.5) * 0.5, 0.3, 0.9); }
      hPasoAnt = z;
    } else hPasoAnt = Math.floor(pp.paso / Math.PI);
    if (paseando && enQuad && Math.abs(vq) > 0.3) {   // rodadas de las dos ruedas traseras y polvo si el suelo está seco
      var traseraX = pp.x - fx * 0.62, traseraY = pp.y - fy * 0.62;
      if (!hUlt || Math.hypot(traseraX - hUlt[0], traseraY - hUlt[1]) > 0.7) { hUlt = [traseraX, traseraY]; [-0.58, 0.58].forEach(function (s) { emiteHuella(traseraX + rx * s, traseraY + ry * s, pp.ang, 0.26, 0.95, 0, 170); }); }
      if (Math.abs(vq) > 2.5 && sueloSeco(pp.x, pp.y)) { hAcPol += dt * 22 * Math.min(1, Math.abs(vq) / 9); while (hAcPol >= 1) { hAcPol -= 1; var s = Math.random() < 0.5 ? -0.58 : 0.58; emitePolvo(traseraX + rx * s, traseraY + ry * s, suelo(traseraX, traseraY) * exag + 0.15, -fx * 1.3 + (Math.random() - 0.5) * 0.9, 0.7 + Math.random() * 0.6, -fy * 1.3 + (Math.random() - 0.5) * 0.9, 0.55 + Math.random() * 0.4, 1.3 + Math.random() * 0.8); } }
    } else hUlt = null;
    if (enDron) {   // el viento de las hélices levanta polvo cuando vuela bajo
      var alt = dr.h - altSuelo(dr.x, dr.y);
      if (alt < 5.5 && sueloSeco(dr.x, dr.y)) { hAcPol += dt * 34 * (1 - alt / 5.5); while (hAcPol >= 1) { hAcPol -= 1; var a = Math.random() * 6.283, r0 = 0.4 + Math.random() * 1.5; emitePolvo(dr.x + Math.cos(a) * r0, dr.y + Math.sin(a) * r0, altSuelo(dr.x, dr.y) + 0.15, Math.cos(a) * 2.6, 0.3 + Math.random() * 0.4, Math.sin(a) * 2.6, 0.5 + Math.random() * 0.4, 1.0 + Math.random() * 0.6); } }
    }
    // el polvo avanza, se frena y sube un poco; el viento del mundo lo arrastra
    var rad = Math.PI / 180, wx = -Math.sin(cur.dir * rad) * cur.viento * 0.4, wz = Math.cos(cur.dir * rad) * cur.viento * 0.4, dra = Math.max(0, 1 - 1.6 * dt);
    for (var i = 0; i < NPV; i++) {
      if (tVida - pvBorn[i] > pvVida[i]) continue;
      pvVel[i * 3] = pvVel[i * 3] * dra + wx * dt; pvVel[i * 3 + 1] = pvVel[i * 3 + 1] * dra + 0.15 * dt; pvVel[i * 3 + 2] = pvVel[i * 3 + 2] * dra + wz * dt;
      pvPos[i * 3] += pvVel[i * 3] * dt; pvPos[i * 3 + 1] += pvVel[i * 3 + 1] * dt; pvPos[i * 3 + 2] += pvVel[i * 3 + 2] * dt;
    }
    geoPv.attributes.position.needsUpdate = true; geoPv.attributes.aBorn.needsUpdate = true; geoPv.attributes.aVida.needsUpdate = true; geoPv.attributes.aTam.needsUpdate = true;
  }



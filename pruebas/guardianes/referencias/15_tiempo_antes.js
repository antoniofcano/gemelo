"use strict";
// FOTO, no se mantiene: pintaNubes y actualizaTiempo de apps/web/motor/15_tiempo.js tal como estaban tras AG-1.4b, ANTES de AG-1.4c, para que
// pruebas/guardianes/bucle_equivalencia.test.js compruebe que la versión de ahora da exactamente lo mismo. No es parte del motor ni se carga en la web.
  var nubesOrden = [], vTmp = new THREE.Vector3();
  function pintaNubes() {   // las manchas con opacidad, de la más lejana a la más cercana a la cámara, en los buffers de la malla
    var G = nubesMalla.geometry, P = G.attributes.position.array, T = G.attributes.tam.array, A = G.attributes.alfa.array, n = 0;
    nubesOrden.length = 0;
    NUBES.forEach(function (gr) { if (gr.o > 0) gr.sp.forEach(function (s) { vTmp.copy(gr.position).add(s.p); nubesOrden.push({ s: s, gr: gr, x: vTmp.x, y: vTmp.y, z: vTmp.z, d: vTmp.distanceToSquared(camera.position) }); }); });
    nubesOrden.sort(function (a, b) { return b.d - a.d; });
    nubesOrden.forEach(function (q) {
      for (var v = 0; v < 4; v++) { var k = n * 4 + v; P[k * 3] = q.x; P[k * 3 + 1] = q.y; P[k * 3 + 2] = q.z; T[k * 2] = q.s.sx; T[k * 2 + 1] = q.s.sy; A[k] = q.gr.o; }
      n++;
    });
    G.attributes.position.needsUpdate = G.attributes.tam.needsUpdate = G.attributes.alfa.needsUpdate = true;
    G.setDrawRange(0, n * 6); nubesMalla.visible = n > 0;
  }
  var lvT = { s: { alt: 0, az: 0 }, d: 0 };   // el nivel del sol de actualizaTiempo, el mismo objeto cada fotograma (AG-1.4b)
  function lerpN(a, b, t) { return a + (b - a) * t; }
  function angDif(a, b) { var d = ((b - a + 540) % 360) - 180; return d; }
  function actualizaTiempo(dt, tms) {
    var k = Math.min(1, dt * 3.2);
    if (Math.abs(meta.ms - cur.ms) > 2 * 86400000) cur.ms = meta.ms;   // un cambio de fecha (la estación) es un salto, no un viaje en el tiempo
    cur.ms += (meta.ms - cur.ms) * Math.min(1, dt * 4); if (Math.abs(meta.ms - cur.ms) < 2000) cur.ms = meta.ms;
    ["nub", "viento", "lluvia", "hr", "temp"].forEach(function (c) { cur[c] += (meta[c] - cur[c]) * k; });
    cur.dir = (cur.dir + angDif(cur.dir, meta.dir) * k + 360) % 360;
    tMundo += calma ? 0 : dt;
    var lv = nivelEn(cur.ms, lvT), alt = lv.s.alt, d = lv.d, nub = cur.nub / 100, oc = 1 - 0.55 * nub - 0.2 * Math.min(1, cur.lluvia / 3);
    // sol: dirección y color
    var dirS = new THREE.Vector3(Math.sin(lv.s.az) * Math.cos(alt), Math.sin(alt), -Math.cos(lv.s.az) * Math.cos(alt));
    sol.position.copy(dirS).multiplyScalar(300); if (alt < 0.02) sol.position.y = 6;
    var bajo = Math.max(0, Math.min(1, 1 - Math.sin(alt) / 0.35)), noc = 1 - d;   // bajo: 1 = sol rasante · noc: 1 = noche cerrada
    sol.color.setRGB(1, 0.94 - 0.38 * bajo, 0.82 - 0.58 * bajo, SRGB);
    sol.intensity = (0.08 + 0.85 * d * (1 - 0.8 * nub)) * LUZ_SOL;
    hemi.intensity = (0.2 + 0.7 * d * (0.55 + 0.45 * oc)) * LUZ_CIELO;
    // cielo y niebla
    var dia = cieloBase.clone(), noche = new THREE.Color(0x070b18), ocaso = new THREE.Color(0xc77b4e), gris = new THREE.Color(0x8a8f94);
    var c = noche.clone().lerp(dia, d); if (bajo > 0 && d > 0.02) c.lerp(ocaso, 0.8 * bajo * Math.min(1, d * 2.5) * (1 - 0.7 * nub)); c.lerp(gris.multiplyScalar(0.25 + 0.75 * d), 0.55 * nub);
    scene.background = c; if (scene.fog) {
      scene.fog.color.copy(c); var h = Math.max(0, Math.min(1, (cur.hr - 70) / 30));
      scene.fog.near = lerpN(FOG0, 15, h * h); scene.fog.far = lerpN(FOG1, 260, h) * (1 - 0.35 * Math.min(1, cur.lluvia / 4));
    }
    // luz de lo que no se ilumina (follaje en puntos, nube de puntos, ortofoto): el mismo ciclo de día y noche
    var f = 0.2 + 0.8 * d * (0.7 + 0.3 * oc), r = Math.min(1, f * (1 + 0.1 * bajo - 0.22 * noc)), gc = f * (1 - 0.1 * bajo - 0.1 * noc), bc = Math.min(1, f * (1 - 0.3 * bajo + 0.28 * noc));
    [matHojaG, matHojaP, matCorteza, nube.material, matOrto].forEach(function (m) { m.color.setRGB(r, gc, bc, SRGB); });
    matSuelo.color.setRGB(1 - 0.18 * Math.min(1, cur.lluvia / 2), 1 - 0.14 * Math.min(1, cur.lluvia / 2), 1 - 0.1 * Math.min(1, cur.lluvia / 2), SRGB);
    // sombras de las nubes: avanzan con el viento y se ven desde arriba, que es desde donde se mira el gemelo
    var rad0 = Math.PI / 180, vxS = -Math.sin(cur.dir * rad0), vzS = Math.cos(cur.dir * rad0), velS = calma ? 0 : 3 + cur.viento * 5;
    uSombra.uCov.value = nub; uSombra.uSomb.value = 0.5 * d * (1 - 0.55 * nub);
    // la helada: el aire a 2 °C o menos, cielo despejado y calma dejan escarcha sobre el suelo y las copas (más de noche que de día)
    uSombra.uHielo.value = Math.max(0, Math.min(1, (2 - cur.temp) / 3)) * (1 - 0.8 * nub) * (cur.viento > 3.5 ? 0.35 : 1) * (1 - 0.6 * d);
    uSombra.uDrift.value.x += vxS * velS * dt * 0.0042; uSombra.uDrift.value.y += vzS * velS * dt * 0.0042;
    // objetos del cielo siguen a la cámara
    sprSol.position.copy(camera.position).addScaledVector(dirS, 3500); sprSol.visible = alt > -0.05; sprSol.material.opacity = Math.max(0, Math.min(1, (Math.sin(alt) + 0.05) * 6)) * (1 - 0.85 * nub);
    sprSol.material.color.setRGB(1, 0.85 - 0.25 * bajo, 0.65 - 0.3 * bajo, SRGB);
    estrellas.position.copy(camera.position); estrellas.material.opacity = Math.max(0, Math.min(1, (-Math.sin(alt) - 0.02) * 8)) * (1 - nub);
    // nubes: tantas como diga la nubosidad; derivan hacia donde sopla el viento (más deprisa de lo real, para que se vea)
    var rad = Math.PI / 180, vx = -Math.sin(cur.dir * rad), vz = Math.cos(cur.dir * rad), vel = calma ? 0 : 3 + cur.viento * 5;
    var tinta = new THREE.Color(1, 1, 1).lerp(new THREE.Color(0x6e747b), Math.min(1, cur.lluvia / 2.5) * 0.9 + 0.1 * nub);
    var luz = new THREE.Color().setRGB(r * (0.55 + 0.6 * d), gc * (0.55 + 0.6 * d), bc * (0.55 + 0.6 * d), SRGB);
    NUBES.forEach(function (g) {
      g.position.x += vx * vel * dt; g.position.z += vz * vel * dt;
      if (g.position.x > 1300) g.position.x -= 2600; else if (g.position.x < -1300) g.position.x += 2600;
      if (g.position.z > 1100) g.position.z -= 2200; else if (g.position.z < -1100) g.position.z += 2200;
      g.o = nub > g.umbral ? Math.min(1, (nub - g.umbral) * 14) * (0.35 + 0.55 * nub) : 0;
    });
    nubesMalla.material.uniforms.diffuse.value.copy(tinta).multiply(luz); pintaNubes();
    // viento sobre el follaje
    var amp = calma ? 0 : Math.min(0.5, 0.03 + 0.1 * cur.viento);
    uViento.uT.value = tMundo; uViento.uAmp.value = amp; uViento.uDir.value.set(vx, vz);
    // lluvia
    lluviaVis += ((cur.lluvia > 0.05 ? 1 : 0) - lluviaVis) * k; var inten = Math.min(1, cur.lluvia / 3) * 0.8 + (cur.lluvia > 0.05 ? 0.15 : 0);
    lluvia.visible = lluviaVis > 0.02 && inten > 0.02; lluvia.position.set(objetivo.x, objetivo.y - 20, objetivo.z);
    uLluvia.uT.value = tMundo; uLluvia.uInt.value = inten * lluviaVis; uLluvia.uViento.value.set(vx * Math.min(1, cur.viento / 6), vz * Math.min(1, cur.viento / 6)); uLluvia.uColor.value.setRGB(0.4 + 0.5 * d, 0.5 + 0.45 * d, 0.6 + 0.35 * d, SRGB);
    // la chapita del visor: hora, temperatura, nubes y viento, con la flecha de dónde viene el viento respecto a cómo miras
    ins.t += dt; if (ins.t > 0.25) {
      // la flecha apunta a DE DÓNDE VIENE el viento (como lo da Vigía y como las fichas del tiempo), respecto a hacia dónde mira la cámara
      // (vale en la vista aérea, a pie, en quad y en dron: se mira la cámara, no la órbita)
      ins.t = 0; camera.getWorldDirection(vFlecha); var lf = Math.hypot(vFlecha.x, vFlecha.z) || 1, fw = [vFlecha.x / lf, vFlecha.z / lf], rg = [-fw[1], fw[0]];
      var ang = Math.atan2(-vxS * rg[0] - vzS * rg[1], -vxS * fw[0] - vzS * fw[1]) * 180 / Math.PI;
      $("tFlecha").style.transform = "rotate(" + ang.toFixed(0) + "deg)"; $("tFlecha").style.opacity = cur.viento < 0.3 ? 0.25 : 1;
      // temperatura, cielo (deducido) y viento del momento que ves; «simulado» si no hay datos de Vigía (los efectos de ejemplo ya lo dicen en la ventana)
      var cie = TiempoPuro.cielo(meta.nub, meta.lluvia, meta.hr) || "cielo sin dato";
      var txt = fmtHora.format(new Date(cur.ms)) + " · " + num1(cur.temp, 0) + " °C · " + (cur.temp <= 0 ? "helada · " : "") + cie + " · " + (cur.viento < 0.3 ? "calma" : "viento del " + rumbo(cur.dir) + " " + num1(cur.viento, 1) + " m/s") +
        (TM.demo ? " · ejemplo" : TM.origen === "simulado" ? " · simulado" : TM.origen === "fixture" ? " · prueba" : "");
      if (txt !== ins.txt) {
        ins.txt = txt; $("tInsT").textContent = txt;
        $("tIns").setAttribute("aria-label", "El tiempo: " + txt + ". Abre la ventana del tiempo");
      }
    }
    // la barrera de la linde (Tron) late
    uBarrera.uT.value = tMundo;
  }

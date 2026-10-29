// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Generados
// Consume: 01_datos (D, VRP, FACTOR_R8), 02_mundo (suelo, copas), 02b_cola (Cola), 03_escena (camera, exag), 06_arboles (gArboles)
// ===============================================================================
  // ---------- olivos GENERADOS cerca (ADR-0017, decisiones 26-28, 34 y 52), solo con ?olivos=gen: sin la bandera no no actúa y el motor dibuja lo de siempre.
  // El árbol lo da el constructor de olivos (apps/web/olivo/, three 0.128 dentro): window.OlivoGen (el IIFE de la salida artefacto) o, en el cliente
  // web, import("gemelo-olivo") (Vite). Su forma es la de olivo-2 (forma ILUSTRATIVA con medidas del LiDAR: altura, copa y orientación de copas/copas_param).
  // Presupuesto: el 45 % del tope de triángulos del aparato, contando también la pasada de sombras (550 k en escritorio; el del perfil VR en gafas). El más cercano en E0, el resto en E1
  // mientras quepan; después VARIANTES compartidas en E2 (E2-VR en gafas) estiradas a cada copa, mientras quepan; más allá, los niveles 1 y 2 de siempre.
  // Dentro del radio de lo generado se apaga el niv 0 de siempre (decisión 26). Se genera en un trabajador si lo hay; si no, a rebanadas por la Cola.
  // El dibujo va fusionado DESPUÉS de la huella: una BatchedMesh por material (corteza, madera muerta, olivas), una malla instanciada por material de
  // hoja (ramitas A y B, relleno) y unos puntos (olivas de E2), compartidas por todos los generados: ~6-7 llamadas en total, no por árbol.
  var Generados = (function () {
    var pedido = /[?&]olivos=gen\b/.test(location.search), estado = pedido ? "cargando" : "apagado", motivo = "", M = null, mats = null, fabrica = null;
    var fr = /[?&]olivosTri=([0-9.]+)/.exec(location.search), FRACCION = fr ? Math.min(0.9, Number(fr[1])) : 0.45;
    var ESTIM = { E0: 160000, E1: 80000, E2: 38000, E2VR: 28000 }, SEM_VAR = [11, 23, 37, 51], MAX_PROPIOS = 6, MAX_VAR = 48, RADIO_CAND = 160;
    var recetas = {}, pidiendo = {}, nPidiendo = 0, plan = [], listos = {}, lote = null, claveLote = "", nuevo = null, R = 0, triGen = 0, costoGen = 0, info = { llamadas: 0, triangulos: 0 };
    var NADA = { radio: 0, tri: 0, tiene: function () { return false; } };
    var grupo = new THREE.Group(); grupo.name = "olivosGenerados";
    if (pedido) { gArboles.add(grupo); arrancaGen(); }
    function epoca() { var m = /[?&]epoca=([a-z]+)/.exec(location.search); return m ? m[1] : "envero"; }
    function arrancaGen() {
      var p = typeof window !== "undefined" && window.OlivoGen ? Promise.resolve(window.OlivoGen) : import("gemelo-olivo");
      p.then(function (m) {
        if (!m || !m.recetaG) throw new Error("sin el constructor de olivos (OlivoGen)");
        if (!THREE.BatchedMesh) throw new Error("este three no tiene BatchedMesh");
        M = m; mats = M.creaMateriales(THREE, null, { epoca: epoca() });   // sin fotos de campo aquí: corteza dibujada (texturas.js)
        var f = M.creaFabrica({ trabajador: true }); if (f.modo === "trabajador") fabrica = f; else f.cierra();
        estado = "activo";
      }).catch(function (e) { estado = "sin"; motivo = String(e && e.message || e); console.warn("olivos generados: " + motivo); });
    }
    // la entrada del generador para un olivo del registro: semilla guardada o su id; parámetros medidos (copas_param) o h y r8 × factorR8
    function entrada(c) {
      var raw = D.copas[c.i], id = D.copas_id ? D.copas_id[c.i] : -1;
      var s = M.semillaDeCopa(raw, id, D.centro_utm, D.copas_semilla ? D.copas_semilla[c.i] : undefined) || { semilla: c.i + 1, provisional: true };
      var p = M.parametrosDeCopa(raw, D.copas_param ? D.copas_param[c.i] : null, "centenario3", { factorR8: FACTOR_R8 });
      return { tipo: p.tipo, parametros: p.parametros, epoca: epoca(), semilla: s.semilla, provisional: s.provisional };
    }
    function pide(clave, e, niv, prio) {
      if (recetas[clave] || pidiendo[clave] || nPidiendo >= 2) return;
      pidiendo[clave] = true; nPidiendo++;
      var hecha = function (r) { delete pidiendo[clave]; nPidiendo--; recetas[clave] = r; };
      var e2 = { tipo: e.tipo, parametros: e.parametros, epoca: e.epoca, semilla: e.semilla };
      if (fabrica) { fabrica.receta(e2, niv).then(hecha, function (err) { delete pidiendo[clave]; nPidiendo--; motivo = String(err); }); return; }
      Cola.add("G" + clave, prio, seguro((function* () { var r = yield* M.recetaG(e2); if (niv !== "E0") r = yield* M.aNivelG(r, niv); return r; })()), function (r) { if (r) hecha(r); });
    }
    // la transformación de cada árbol: su sitio, la exageración vertical y, en las variantes, el estirado a la copa y la altura medidas
    function matrizDe(c, r, variante) {
      var gz = suelo(c.x, c.y) * exag, sx = r.escala[0], sy = r.escala[1], sz = r.escala[2];
      if (variante) {
        var rm = c.perfil.reduce(function (a, b) { return a + b; }, 0) / 8, copa = Math.max(0.8, 2 * rm * FACTOR_R8), k = copa / r.medidas.copa_m, ky = Math.max(1, c.h) / r.medidas.altura_m;
        sx *= k; sz *= k; sy *= ky;
      }
      return new THREE.Matrix4().makeScale(sx, sy * exag, sz).setPosition(c.x, gz, -c.y);
    }
    function tri(r) { return r ? M.triangulosNivel(r) : 0; }
    // lo que cuesta de verdad por fotograma: sus triángulos más los de la pasada de sombras (todo proyecta sombra salvo las olivas y los puntos)
    function costo(r) {
      if (!r) return 0;
      var t = tri(r), ol = 0;
      r.piezas.forEach(function (z) { if (z.rol === "olivas" && z.clase === "instancias") ol += z.n * (z.geo === "octa" ? 8 : 20); });
      return 2 * t - ol;
    }

    // ---- reparte el presupuesto: lo llama el reparto de 07b_arboles.reclasifica con el foco (fx, fz) y el tope de triángulos del aparato
    function actualiza(fx, fz, tope, olivos) {
      if (estado !== "activo") return NADA;
      // lo que se observa (el foco: el punto de la órbita, o quien pasea), y solo si la cámara está cerca de él: desde lejos no se genera nada
      var cam = camera.position, lejos = Math.hypot(cam.x - fx, cam.z - fz, Math.max(0, cam.y - suelo(fx, -fz) * exag)) > 150;
      var pres = tope * FRACCION, vr = VRP.on, nivV = vr ? "E2VR" : "E2";
      var cand = [];
      if (!lejos) for (var i = 0; i < olivos.length; i++) { var c = olivos[i], d = Math.hypot(c.x - fx, -c.y - fz); if (d < RADIO_CAND) cand.push({ c: c, d: d }); }
      cand.sort(function (a, b) { return a.d - b.d; }); if (cand.length > 80) cand.length = 80;
      var nuevoPlan = [], usado = 0, propios = true, nVar = 0;
      for (var k = 0; k < cand.length; k++) {
        var x = cand[k], e = null;
        if (propios && nuevoPlan.length < MAX_PROPIOS) {
          var niveles = nuevoPlan.length === 0 ? ["E0", "E1"] : ["E1"], hecho = false;
          for (var q = 0; q < niveles.length && !hecho; q++) {
            var clave = "p" + x.c.i + ":" + niveles[q], t = recetas[clave] ? costo(recetas[clave]) : ESTIM[niveles[q]];
            if (usado + t <= pres) { nuevoPlan.push({ c: x.c, d: x.d, clave: clave, niv: niveles[q], propio: true }); usado += t; hecho = true; }
          }
          if (hecho) continue;
          propios = false;
        }
        if (nVar >= MAX_VAR) break;
        var cv = "v" + (x.c.i % SEM_VAR.length) + ":" + nivV, tv = recetas[cv] ? costo(recetas[cv]) : ESTIM[nivV];
        if (usado + tv > pres) break;
        nuevoPlan.push({ c: x.c, d: x.d, clave: cv, niv: nivV, propio: false }); usado += tv; nVar++;
      }
      plan = nuevoPlan;
      // pedir lo que falta (lo más cercano primero; las variantes, una vez cada una)
      plan.forEach(function (p) {
        if (recetas[p.clave]) return;
        if (p.propio) { var e2 = entrada(p.c); p.provisional = e2.provisional; pide(p.clave, e2, p.niv, p.d); }
        else pide(p.clave, { tipo: "centenario3", epoca: epoca(), semilla: SEM_VAR[Number(p.clave.slice(1, p.clave.indexOf(":")))] }, p.niv, p.d + 200);
      });
      // lo que ya se puede dibujar; si cambia, se rehace el lote (a rebanadas, por la Cola)
      var listosAhora = plan.filter(function (p) { return recetas[p.clave]; }), cl = exag + "|" + listosAhora.map(function (p) { return p.c.i + "=" + p.clave; }).join(",");
      if (cl !== claveLote && !Cola.hay("Glote")) {
        var fija = listosAhora.slice();
        Cola.add("Glote", 50, seguro(construyeG(fija)), function (g) { if (g) colocaLote(g, fija, cl); });
      }
      return { radio: R, tri: triGen, tiene: function (i) { return !!listos[i]; } };
    }
    function* seguro(gen) {   // si algo falla al montar el lote, Generados se apaga (y lo dice) sin parar el fotograma del motor
      try { return yield* gen; } catch (e) { estado = "sin"; motivo = String(e && e.message || e); console.warn("olivos generados: " + motivo); return null; }
    }
    function colocaLote(g, sel, cl) {
      if (lote) { grupo.remove(lote); libera(lote); }
      lote = g; grupo.add(g); claveLote = cl; listos = {}; R = 0; triGen = 0; costoGen = 0;
      sel.forEach(function (p) { listos[p.c.i] = p; R = Math.max(R, p.d + 8); triGen += tri(recetas[p.clave]); costoGen += costo(recetas[p.clave]); });
      info = { llamadas: g.children.length, triangulos: triGen, costo: costoGen, arboles: sel.length, propios: sel.filter(function (p) { return p.propio; }).length };
      // las recetas que ya no se usan se sueltan (las variantes se quedan)
      var usadas = {}; plan.forEach(function (p) { usadas[p.clave] = true; });
      Object.keys(recetas).forEach(function (k) { if (k.charAt(0) === "p" && !usadas[k]) delete recetas[k]; });
    }
    function libera(g) {
      g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.isBatchedMesh || o.isInstancedMesh) o.dispose(); });
    }

    // ---- el lote: todo lo generado en pocas mallas compartidas (las olivas, sin índices: icosaedro y octaedro)
    var BARK = { corteza: 1, pies: 1, musgo: 1, raiz: 1, tutor: 1 }, TINTE = { musgo: [0.82, 0.8, 0.7], raiz: [1.05, 1.04, 1.02], tutor: [0.95, 0.85, 0.65] };
    function geoDe(atrib, indice, marcas) {
      var g = new THREE.BufferGeometry(), n = atrib.position.length / 3;
      g.setAttribute("position", new THREE.BufferAttribute(atrib.position, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(atrib.normal || new Float32Array(n * 3), 3));
      g.setAttribute("uv", new THREE.BufferAttribute(atrib.uv || new Float32Array(n * 2), 2));
      if (marcas) { g.setAttribute("aHueco", new THREE.BufferAttribute(atrib.aHueco || new Float32Array(n), 1)); g.setAttribute("aMuerta", new THREE.BufferAttribute(atrib.aMuerta || new Float32Array(n), 1)); }
      if (indice) g.setIndex(new THREE.BufferAttribute(indice, 1));
      return g;
    }
    function* construyeG(sel) {
      var G = M.geos(), out = new THREE.Group(), m4 = new THREE.Matrix4(), mp = new THREE.Matrix4(), mi = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
      // 1) recuento para dar a cada malla su tamaño justo
      var cap = { corteza: { i: 0, v: 0, x: 0 }, muerta: { i: 0, v: 0, x: 0 }, olivas: { i: 0, v: 0, x: 0 } }, inst = { ramita0: 0, ramita1: 0, relleno: 0 }, npuntos = 0, vistas = {};
      function cuenta(b, geoClave, atrib, indice, n) {
        if (!vistas[b + geoClave]) { vistas[b + geoClave] = true; cap[b].v += atrib.position.length / 3; cap[b].x += indice ? indice.length : 0; }
        cap[b].i += n;
      }
      sel.forEach(function (p, ip) {
        var r = recetas[p.clave];
        r.piezas.forEach(function (z, iz) {
          var gk = z.geo === "propia" ? p.clave + "#" + iz : z.geo;
          if (z.clase === "malla" && BARK[z.mat]) cuenta("corteza", gk, z.atrib, z.indice, 1);
          else if (z.clase === "malla" && z.mat === "muerta") cuenta("muerta", gk, z.atrib, z.indice, 1);
          else if (z.geo === "tocon") cuenta("corteza", "tocon", G.tocon.atrib, G.tocon.indice, z.n);
          else if (z.geo === "corte") cuenta("muerta", "corte", G.corte.atrib, G.corte.indice, z.n);
          else if (z.geo === "oliva" || z.geo === "octa") cuenta("olivas", z.geo, G[z.geo].atrib, G[z.geo].indice, z.n);
          else if (z.clase === "instancias" && inst[z.mat] !== undefined) inst[z.mat] += z.n;
          else if (z.clase === "puntos") npuntos += z.n;
        });
      });
      yield;
      // 2) las mallas
      var B = {}, geoId = {}, ix = { ramita0: 0, ramita1: 0, relleno: 0 }, I = {}, pts = npuntos ? { p: new Float32Array(npuntos * 3), c: new Float32Array(npuntos * 3), n: 0 } : null;
      var matDe = { corteza: mats.pies, muerta: mats.muerta, olivas: mats.oliva };
      Object.keys(cap).forEach(function (b) {
        if (!cap[b].i) return;
        var bm = new THREE.BatchedMesh(cap[b].i, cap[b].v, cap[b].x, matDe[b]); bm.name = "gen-" + b; bm.castShadow = b !== "olivas"; bm.receiveShadow = b !== "olivas"; B[b] = bm; out.add(bm);   // las olivas no proyectan sombra: muchas y diminutas
      });
      Object.keys(inst).forEach(function (k) {
        if (!inst[k]) return;
        var g = geoDe(k === "relleno" ? G.relleno.atrib : G.ramita.atrib, k === "relleno" ? G.relleno.indice : G.ramita.indice, false);
        var im = new THREE.InstancedMesh(g, mats[k], inst[k]); im.name = "gen-" + k; im.castShadow = true; im.receiveShadow = true; im.customDepthMaterial = mats[k + "_sombra"];
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(inst[k] * 3), 3); I[k] = im; out.add(im);
      });
      function idGeo(b, gk, atrib, indice) { var k = b + gk; if (geoId[k] === undefined) geoId[k] = B[b].addGeometry(geoDe(atrib, indice, b === "corteza")); return geoId[k]; }
      function ponBatch(b, gid, m, rgb) { var id = B[b].addInstance(gid); B[b].setMatrixAt(id, m); col.setRGB(rgb[0], rgb[1], rgb[2]); B[b].setColorAt(id, col); }
      for (var ip = 0; ip < sel.length; ip++) {
        var p = sel[ip], r = recetas[p.clave], T = matrizDe(p.c, r, !p.propio);
        for (var iz = 0; iz < r.piezas.length; iz++) {
          var z = r.piezas[iz], gk = z.geo === "propia" ? p.clave + "#" + iz : z.geo;
          mp.compose(v.fromArray(z.pos), q.fromArray(z.rot), s3.fromArray(z.esc)); m4.multiplyMatrices(T, mp);
          if (z.clase === "malla" && (BARK[z.mat] || z.mat === "muerta")) { var b = BARK[z.mat] ? "corteza" : "muerta"; ponBatch(b, idGeo(b, gk, z.atrib, z.indice), m4, TINTE[z.mat] || [1, 1, 1]); continue; }
          if (z.clase === "puntos") { for (var k2 = 0; k2 < z.n; k2++) { v.fromArray(z.posiciones, k2 * 3).applyMatrix4(m4); pts.p.set([v.x, v.y, v.z], pts.n * 3); pts.c.set(z.colores.subarray(k2 * 3, k2 * 3 + 3), pts.n * 3); pts.n++; } continue; }
          if (z.clase !== "instancias") continue;
          var bb = z.geo === "tocon" ? "corteza" : z.geo === "corte" ? "muerta" : (z.geo === "oliva" || z.geo === "octa") ? "olivas" : null;
          var gid = bb ? idGeo(bb, z.geo, G[z.geo].atrib, G[z.geo].indice) : -1, im2 = bb ? null : I[z.mat];
          for (var k3 = 0; k3 < z.n; k3++) {
            mi.fromArray(z.matrices, k3 * 16); mi.premultiply(m4);
            var rgb = z.colores ? [z.colores[k3 * 3], z.colores[k3 * 3 + 1], z.colores[k3 * 3 + 2]] : z.geo === "corte" ? r.corte : [1, 1, 1];
            if (bb) ponBatch(bb, gid, mi, rgb);
            else if (im2) { var n3 = ix[z.mat]++; im2.setMatrixAt(n3, mi); im2.instanceColor.setXYZ(n3, rgb[0], rgb[1], rgb[2]); }
            if (k3 % 512 === 511) yield;
          }
        }
        yield;
      }
      Object.keys(I).forEach(function (k) { I[k].instanceMatrix.needsUpdate = true; I[k].instanceColor.needsUpdate = true; I[k].computeBoundingSphere(); });
      if (pts && pts.n) {
        var gp = new THREE.BufferGeometry(); gp.setAttribute("position", new THREE.BufferAttribute(pts.p, 3)); gp.setAttribute("color", new THREE.BufferAttribute(pts.c, 3)); gp.computeBoundingSphere();
        var pm = new THREE.Points(gp, mats.puntos); pm.name = "gen-puntos"; out.add(pm);
      }
      return out;
    }
    /** El rótulo de un olivo (decisión 34) si se dibuja generado: «forma ilustrativa con medidas del LiDAR» y, si su id no es del censo, «id provisional» */
    function rotulo(i) {
      var p = listos[i]; if (!p) return null;
      var id = D.copas_id ? D.copas_id[i] : -1, prov = !(id >= 0 && id < 2147483648);
      return { forma: "ilustrativa con medidas del LiDAR", provisional: prov, niv: p.niv, variante: !p.propio };
    }
    window.__olivosGen = function () {
      var k0 = Object.keys(listos)[0], p0 = k0 !== undefined ? listos[k0].c : null;   // un olivo generado ya dibujado
      return { primero: p0 ? { x: p0.x, y: p0.y, h: p0.h } : null, estado: estado, motivo: motivo, via: fabrica ? "trabajador" : "rebanadas", plan: plan.length, recetas: Object.keys(recetas).length, pidiendo: nPidiendo, radio: R, info: info };
    };
    return { activo: function () { return estado === "activo"; }, actualiza: actualiza, rotulo: rotulo, estado: function () { return estado; } };
  })();

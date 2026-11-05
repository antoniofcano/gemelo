// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02c_componentes (ComponentesPuro, Bus), 02e_entidades (Usables), 03_escena (lienzo, renderer, camera), 08_marcadores (capas),
//   12_paseo (primera, actualizaPaseo), 12b_llegada (Llegada), 13b_hazas (Hazas), 14_historia (hist), 15_tiempo (horaMundoTexto), 16_vida (mira),
//   29_vr (VRX, vrRig, vrMano, vrRayoDe, creaLamina, panel, ficha, vrBajoRayo, vrRect, vrAj, PanelVR, vrPintaFicha, vrPulso, vrActualiza),
//   31b_hud_personal (HudPersonalPuro)
// Nota: EV2-A3: el menú de muñeca en VR («hora · tu haza · hablar · volver», con los textos de HudPersonalPuro de 31b). No es un componente: se engancha a 29_vr por PanelVR.alFotograma y PanelVR.alGatillo; ?xrmuneca=0 y el ajuste vr.muneca lo apagan. Publica además window.__vrMuneca y __vrMunecaPulsa (pruebas VR). El trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/vr_muneca.test.js.
// ===============================================================================
  // ---------- EV2-A3: el menú de muñeca en VR (doc/sistema/VIABILIDAD-INTERACCION.md §A.5, paso 4; tanda 9, 2026-11-05). Al girar la muñeca hacia la cara
  // (como quien mira un reloj: el dorso o la palma hacia los ojos, y mirándola) aparece pegado a ella una lámina pequeña con lo tuyo: «hora · tu haza ·
  // hablar · volver», los mismos cuatro de la capa personal de pantalla (EV2-A4, 31b_hud_personal.js), con sus textos (HudPersonalPuro). Se pulsa con el
  // rayo y el gatillo del OTRO mando o tocándola con la punta del otro mando («dedo»). Desaparece al bajar la muñeca o dejar de mirarla. No sustituye al
  // panel grande (Y): lo complementa, también con ?ui=capas (EV2-A2: el panel nace y se queda en el mundo; la muñeca va contigo).
  // Qué muñeca: la contraria a la mano que apunta, según Configuración → Controles → Mano (controles.mano): diestra = la izquierda, zurda = la derecha.
  // Con mando, la lámina sigue al grip; con manos (seguimiento de manos), a la articulación «wrist», y el eje de la palma sale de la muñeca y los nudillos.
  // Encendido por defecto [SUPUESTO]: ?xrmuneca=0|1 manda; si no, Configuración → Comodidad VR (vr.muneca); si no, sí.
  // Regla 12: no hay acciones propias. Hora = la previsión del tiempo de 35_fichas_tiempo («prevision:alterna», la lámina del tiempo; la misma que el botón
  // de la ventana Tiempo) · tu haza = la ficha de la haza donde estás (Hazas.enPunto y Usables.elige, como la tecla H y 31b) · hablar = «habla:alterna»
  // (47_habla.js; solo dentro de una visita guiada y con permiso, como en 31b) · volver = de vuelta donde empezó la sesión VR (Llegada.ve, con fundido)
  // [SUPUESTO: en pantalla «volver» es la vista aérea, que en VR no existe]. La lámina es creaLamina de 29_vr (canvas como textura de un plano,
  // MeshBasicMaterial: vale con multiview), el rayo vrRayoDe/vrBajoRayo y el pintado vrRect. Se engancha con PanelVR.alFotograma y PanelVR.alGatillo
  // (los puntos de extensión de 29_vr), así 29_vr no nombra este módulo. Va después de 31b porque consume HudPersonalPuro.
  // Presupuesto (regla 6): UNA malla (2 triángulos, 1 llamada solo mientras se ve) y una textura de 512 × 384 sin mipmaps (768 KB), creadas la primera vez
  // que aparece en la sesión, reutilizadas y liberadas al salir de VR («vr:sale»). El lienzo solo se repinta si cambia lo que se ve (firma, mirada 4 veces
  // por segundo, o el resaltado). No entra en los escalones de 02g_vr_presupuesto (no hay nada que recortar por distancia). Nada de esto probado en unas Quest.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/vr_muneca.test.js)
  var MunecaPuro = (function () {
    // Umbrales de partida [SUPUESTO], sin probar en un casco. cara: coseno entre el eje de la palma y la línea muñeca → ojos (0,70 ≈ 46°); mirada: coseno
    // entre hacia dónde mira la cabeza y la línea ojos → muñeca (0,85 ≈ 32°). d: metros de la muñeca a los ojos. Para aparecer tiene que cumplirse «entra»
    // durante tEntra s seguidos; para irse, dejar de cumplirse «sigue» (más holgado: histéresis) durante tSale s. lado: "ambos" (dorso o palma), "dorso"
    // o "palma". En el grip de WebXR el dorso de la mano izquierda mira a −X y el de la derecha a +X (especificación WebXR, gripSpace).
    var U = { entraCara: 0.70, sigueCara: 0.45, entraMirada: 0.85, sigueMirada: 0.65, dMin: 0.12, dMax: 0.70, dSigue: 0.85, tEntra: 0.25, tSale: 0.35, lado: "ambos" };
    // La lámina: 0,16 × 0,12 m, 512 × 384 px (0,31 mm/px). dist: a cuánto se mira una muñeca [SUPUESTO]. alto/acerca: la lámina, por encima de la muñeca y
    // un poco hacia los ojos (m). Cuatro botones en rejilla de 2 × 2 con huecos de 16 px (5 mm: 14 mm equivalentes a 1 m vistos a 0,35 m).
    var MEDIDAS = { W: 512, H: 384, pw: 0.16, ph: 0.12, dist: 0.35, alto: 0.07, acerca: 0.03, cab: 64, margen: 16, hueco: 16, cols: 2, filas: 2, lineas: { titulo: 36, boton: 34 } };
    var DEDO = { arma: 0.03, toca: 0.008, atras: -0.04 };   // el «dedo»: se arma a más de 3 cm delante de la lámina y pulsa al llegar a 8 mm (o hasta 4 cm detrás)
    var t1 = { x: 0, y: 0, z: 0 }, t2 = { x: 0, y: 0, z: 0 };
    // v' = q · v · q⁻¹ (la misma cuenta que Vector3.applyQuaternion de three)
    function rota(q, x, y, z, out) {
      var qx = q.x, qy = q.y, qz = q.z, qw = q.w;
      var ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
      out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy; out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz; out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
      return out;
    }
    // el eje del dorso con mando: el ±X del grip (q) según la mano. out = { x, y, z } de largo 1
    function ejeGrip(q, mano, out) { return rota(q, mano === "right" ? 1 : -1, 0, 0, out || {}); }
    // con manos: la normal del plano muñeca–nudillo del índice–nudillo del meñique (w, i, p = posiciones de las articulaciones wrist, index-finger-metacarpal
    // y pinky-finger-metacarpal). Su sentido (dorso o palma) no está comprobado en un casco [SUPUESTO]: con lado "ambos" no importa
    function ejeMano(w, i, p, mano, out) {
      out = out || {};
      var ax = i.x - w.x, ay = i.y - w.y, az = i.z - w.z, bx = p.x - w.x, by = p.y - w.y, bz = p.z - w.z, s = mano === "right" ? -1 : 1;
      var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-6;
      out.x = s * nx / l; out.y = s * ny / l; out.z = s * nz / l; return out;
    }
    // w = posición de la muñeca, eje = hacia dónde mira su dorso (largo 1), c = { p, q } la cabeza; todo en el MISMO espacio (el del rig).
    // → out { d, dorso, palma, cara, mirada }
    function mide(w, eje, c, out, u) {
      u = u || U; out = out || {};
      var dx = c.p.x - w.x, dy = c.p.y - w.y, dz = c.p.z - w.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      dx /= d; dy /= d; dz /= d;
      var sx = eje.x * dx + eje.y * dy + eje.z * dz, F = rota(c.q, 0, 0, -1, t2);
      out.d = d; out.dorso = sx; out.palma = -sx;
      out.cara = u.lado === "dorso" ? sx : u.lado === "palma" ? -sx : Math.abs(sx);
      out.mirada = -(F.x * dx + F.y * dy + F.z * dz);
      return out;
    }
    // la histéresis con retardo. st = { visible, t } (se modifica); m = mide(…) o null (sin pose: cuenta como «no»). → "aparece" | "desaparece" | ""
    function decide(st, m, dt, u) {
      u = u || U;
      var entra = !!m && m.d >= u.dMin && m.d <= u.dMax && m.cara >= u.entraCara && m.mirada >= u.entraMirada;
      var sigue = !!m && m.d >= u.dMin && m.d <= u.dSigue && m.cara >= u.sigueCara && m.mirada >= u.sigueMirada;
      if (!st.visible) {
        st.t = entra ? st.t + dt : 0;
        if (st.t >= u.tEntra) { st.visible = true; st.t = 0; return "aparece"; }
        return "";
      }
      st.t = sigue ? 0 : st.t + dt;
      if (st.t >= u.tSale) { st.visible = false; st.t = 0; return "desaparece"; }
      return "";
    }
    // dónde va la lámina (en el espacio del rig) y cómo gira para mirar a los ojos: Euler «YXZ» = (pitch, yaw, 0); su cara (+Z) apunta a la cabeza
    function coloca(w, c, out, medida) {
      medida = medida || MEDIDAS; out = out || {};
      var dx = c.p.x - w.x, dy = c.p.y - w.y, dz = c.p.z - w.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      out.x = w.x + dx / d * medida.acerca; out.y = w.y + medida.alto + dy / d * medida.acerca; out.z = w.z + dz / d * medida.acerca;
      var hx = c.p.x - out.x, hy = c.p.y - out.y, hz = c.p.z - out.z;
      out.yaw = Math.atan2(hx, hz); out.pitch = -Math.atan2(hy, Math.hypot(hx, hz));
      return out;
    }
    // qué muñeca lleva el menú: la contraria a la mano que apunta (controles.mano: "diestra" → la izquierda; "zurda" → la derecha)
    function manoMenu(ajuste) { return ajuste === "zurda" ? "right" : "left"; }
    // los accesos, con los textos de la capa personal de pantalla. hp = HudPersonalPuro (31b); e = { hora (texto), hazas (¿hay?), haza ({ id, es_mia } o
    // null), voz (el último «voz:estado» o null) } → [{ id, txt, nombre, on }] en el orden de la pantalla: hora · tu haza · hablar · volver
    function accesos(hp, e) {
      var l = [], h = hp.hora(e.hora), z = hp.haza(e.haza || null, !!e.hazas), b = hp.hablar(e.voz || null), v = hp.volver("vr");
      l.push({ id: "hora", txt: h.texto, nombre: h.nombre, on: false });
      if (z.visible) l.push({ id: "haza", txt: z.texto, nombre: z.nombre, on: !!(e.haza && e.haza.es_mia) });
      if (b.visible) l.push({ id: "hablar", txt: b.texto, nombre: b.nombre, on: b.pulsado });
      l.push({ id: "volver", txt: v.texto, nombre: "Volver adonde empezaste en las gafas", on: false });
      return l;
    }
    // los botones en la rejilla (px del lienzo), por filas de izquierda a derecha
    function rejilla(l, medida) {
      medida = medida || MEDIDAS;
      var w = Math.floor((medida.W - 2 * medida.margen - (medida.cols - 1) * medida.hueco) / medida.cols), h = Math.floor((medida.H - medida.cab - medida.margen - (medida.filas - 1) * medida.hueco) / medida.filas);
      return l.slice(0, medida.cols * medida.filas).map(function (a, k) { var c = k % medida.cols, f = Math.floor(k / medida.cols); return { id: a.id, txt: a.txt, on: a.on, x: medida.margen + c * (w + medida.hueco), y: medida.cab + f * (h + medida.hueco), w: w, h: h }; });
    }
    // el toque con la punta del otro mando: z = metros delante de la cara de la lámina (positivo, del lado de los ojos); dentro = ¿cae sobre la lámina?
    // st = { armado } (se modifica). → true el fotograma en que pulsa (una vez por acercamiento)
    function dedo(st, z, dentro) {
      if (z > DEDO.arma) { st.armado = true; return false; }
      if (!dentro) return false;
      if (st.armado && z <= DEDO.toca && z >= DEDO.atras) { st.armado = false; return true; }
      return false;
    }
    function bajo(B, x, y) { for (var k = 0; k < B.length; k++) if (x >= B[k].x && x <= B[k].x + B[k].w && y >= B[k].y && y <= B[k].y + B[k].h) return B[k]; return null; }
    // lo que se ve: si cambia, se repinta (y solo entonces)
    function firma(l, hover) { return hover + "|" + l.map(function (a) { return a.id + (a.on ? "1" : "0") + a.txt; }).join(";"); }
    // ?xrmuneca manda (true/false; undefined si no está); si no, el ajuste vr.muneca; si no, encendido
    function encendido(url, ajuste) {
      if (url === true || url === false) return url;
      return !(ajuste === false || ajuste === "false" || ajuste === 0 || ajuste === "no");
    }
    return { U: U, MEDIDAS: MEDIDAS, DEDO: DEDO, rota: rota, ejeGrip: ejeGrip, ejeMano: ejeMano, mide: mide, decide: decide, coloca: coloca, manoMenu: manoMenu,
      accesos: accesos, rejilla: rejilla, dedo: dedo, bajo: bajo, firma: firma, encendido: encendido };
  })();
  // [puro:fin]
  var Muneca = (function () {
    var M = MunecaPuro.MEDIDAS, lam = null, st = { visible: false, t: 0 }, dd = { armado: false }, B = [], items = [], hover = "", firmaVista = "", tFirma = 0;
    var inicio = null, sesion = -1, pinturas = 0, voz = null, lado = "left", fuente = "";
    var w = { x: 0, y: 0, z: 0 }, eje = { x: 1, y: 0, z: 0 }, c = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }, medida = {}, pos = {};
    var m4 = new THREE.Matrix4(), v = new THREE.Vector3(), qc = new THREE.Quaternion();
    var URL_ON = ComponentesPuro.valorUrl(typeof location !== "undefined" ? location.search : "", "xrmuneca");
    function activo() { return MunecaPuro.encendido(URL_ON, vrAj("vr.muneca", true)); }
    function crea() { if (lam) return; lam = creaLamina(M.W, M.H, M.pw, M.ph); lam.nombre = "muneca"; vrRig.add(lam.m); }   // reserva-ok: la primera vez de cada sesión
    function libera() {
      st.visible = false; st.t = 0; dd.armado = false; hover = ""; firmaVista = ""; B = []; items = []; sesion = -1;
      if (!lam) return;
      vrRig.remove(lam.m); lam.m.geometry.dispose(); lam.m.material.dispose(); lam.tex.dispose(); lam.cv.width = lam.cv.height = 0; lam = null;
    }
    function cabeza() {   // la pose de la cabeza en el espacio del rig, la del XRFrame de este fotograma (camera.position ya lleva la del mundo: actualizaPaseo)
      var vp = null; try { vp = VRX.frame && VRX.base ? VRX.frame.getViewerPose(VRX.base) : null; } catch (e) { vp = null; }
      var t = vp && vp.transform; if (!t) return false;
      if (t.position && t.orientation) { c.p.x = t.position.x; c.p.y = t.position.y; c.p.z = t.position.z; c.q.x = t.orientation.x; c.q.y = t.orientation.y; c.q.z = t.orientation.z; c.q.w = t.orientation.w; return true; }
      if (!t.matrix) return false;   // solo la matriz (como en el WebXR de mentira de las pruebas): de ella, la posición y el giro
      m4.fromArray(t.matrix); c.p.x = t.matrix[12]; c.p.y = t.matrix[13]; c.p.z = t.matrix[14]; qc.setFromRotationMatrix(m4); c.q.x = qc.x; c.q.y = qc.y; c.q.z = qc.z; c.q.w = qc.w;
      return true;
    }
    // la muñeca que lleva el menú, en el espacio del rig: con manos, la articulación wrist (y el eje de la palma, de los nudillos); con mando, el grip
    function muneca(o) {
      fuente = "";
      if (!o || !o.src || o.mano !== lado) return false;
      if (o.src.hand) {
        var J = renderer.xr.getHand(o.i).joints, a = J && J["wrist"], i = J && J["index-finger-metacarpal"], p = J && J["pinky-finger-metacarpal"];
        if (!a || !i || !p || !a.visible) return false;
        w.x = a.position.x; w.y = a.position.y; w.z = a.position.z; MunecaPuro.ejeMano(a.position, i.position, p.position, lado, eje); fuente = "mano"; return true;
      }
      if (!o.g.visible) return false;
      w.x = o.g.position.x; w.y = o.g.position.y; w.z = o.g.position.z; MunecaPuro.ejeGrip(o.g.quaternion, lado, eje); fuente = "grip"; return true;
    }
    function hazaAqui() { try { return Hazas.enPunto(pp.x, pp.y); } catch (e) { return null; } }   // en VR, pp es la cabeza (vrActualiza)
    function hayHazas() { try { return !!Hazas.estado().activo; } catch (e) { return false; } }
    function pulsa(b) {
      if (!b) return;
      if (b.id === "hora") Bus.emite("prevision:alterna");   // la lámina de la previsión (35_fichas_tiempo); sin ese componente, nadie la atiende
      else if (b.id === "haza") { var q = hazaAqui(); if (q) Usables.elige("haza:" + q.id, "tecla"); else vrPintaFicha("Hazas", ["No estás dentro de ninguna haza."]); }   // lo mismo que H y 31b
      else if (b.id === "hablar") Bus.emite("habla:alterna", {});
      else if (b.id === "volver") { if (inicio) Llegada.ve(inicio.x, inicio.y); }
      tFirma = 1;   // a mirar ya lo que cambió
    }
    function pinta() {
      var cx = lam.cx, W = M.W, H = M.H;
      cx.clearRect(0, 0, W, H); cx.fillStyle = "rgba(14,18,22,0.93)"; vrRect(cx, 0, 0, W, H, 22); cx.fill();
      cx.textBaseline = "middle"; cx.textAlign = "left"; cx.fillStyle = "#e9eef2"; cx.font = "bold 28px system-ui, sans-serif"; cx.fillText("Lo tuyo", 18, 34);
      cx.textAlign = "right"; cx.font = "22px system-ui, sans-serif"; cx.fillStyle = "#9fb1bd"; cx.fillText("gatillo o toca", W - 18, 34);
      cx.font = "bold 30px system-ui, sans-serif"; cx.textAlign = "center";
      B.forEach(function (q) {
        cx.fillStyle = hover === q.id ? "#4a5866" : q.on ? "#2e7d3a" : "#2a3139"; vrRect(cx, q.x, q.y, q.w, q.h, 14); cx.fill();
        var t = q.txt; while (cx.measureText(t).width > q.w - 20 && t.length > 4) t = t.slice(0, -2); if (t !== q.txt) t += "…";
        cx.fillStyle = "#ffffff"; cx.fillText(t, q.x + q.w / 2, q.y + q.h / 2 + 1);
      });
      cx.textAlign = "left"; lam.tex.needsUpdate = true; pinturas++;
    }
    function fotograma(dt) {
      if (!VRX.on) return;
      if (sesion !== VRX.sesionesN) { sesion = VRX.sesionesN; inicio = { x: VRX.cab.x, y: -VRX.cab.z }; st.visible = false; st.t = 0; }   // reserva-ok: una vez por sesión (dónde empezó)
      if (!activo()) { st.visible = false; st.t = 0; if (lam) lam.m.visible = false; return; }
      var nl = MunecaPuro.manoMenu(vrAj("controles.mano", "diestra")); if (nl !== lado) { lado = nl; st.visible = false; st.t = 0; }
      var L = vrMano(lado), m = cabeza() && muneca(L) ? MunecaPuro.mide(w, eje, c, medida) : null;
      if (MunecaPuro.decide(st, m, dt) === "aparece") { crea(); firmaVista = ""; tFirma = 1; dd.armado = false; vrPulso(L, 0.12, 12); }
      if (!st.visible || !lam) { if (lam) lam.m.visible = false; return; }
      if (m) { MunecaPuro.coloca(w, c, pos); lam.m.position.set(pos.x, pos.y, pos.z); lam.m.rotation.set(pos.pitch, pos.yaw, 0, "YXZ"); }
      lam.m.visible = true; lam.m.updateWorldMatrix(true, false);
      tFirma += dt;
      if (tFirma >= 0.25) { tFirma = 0; var hy = hayHazas(); items = MunecaPuro.accesos(HudPersonalPuro, { hora: horaMundoTexto(), hazas: hy, haza: hy ? hazaAqui() : null, voz: voz }); B = MunecaPuro.rejilla(items); }   // reserva-ok: 4 veces por segundo, solo a la vista
      var R = vrMano(lado === "left" ? "right" : "left"), hv = "";
      if (R.src && R.mano && R.mano !== lado) {
        var q = vrBajoRayo(lam, B, vrRayoDe(R)); hv = q ? q.id : "";
        lam.m.updateMatrix(); m4.copy(lam.m.matrix).invert(); v.copy(R.c.position).applyMatrix4(m4);   // la punta del otro mando, en la lámina (los dos cuelgan del rig)
        var dentro = Math.abs(v.x) <= M.pw / 2 && Math.abs(v.y) <= M.ph / 2;
        var bd = dentro ? MunecaPuro.bajo(B, (v.x / M.pw + 0.5) * M.W, (0.5 - v.y / M.ph) * M.H) : null;
        if (bd && v.z < MunecaPuro.DEDO.arma) hv = bd.id;
        if (MunecaPuro.dedo(dd, v.z, dentro) && bd) { vrPulso(R, 0.4, 25); pulsa(bd); }
      }
      if (hv !== hover) hover = hv;
      var f = MunecaPuro.firma(items, hover);   // reserva-ok: solo con el menú a la vista
      if (f !== firmaVista) { firmaVista = f; pinta(); }
    }
    function gatillo(o, rr) {   // el gatillo del otro mando; true = es del menú (también si cae entre botones: no pulsa lo de detrás)
      if (!lam || !lam.m.visible || o.mano === lado) return false;
      lam.m.updateWorldMatrix(true, false);
      var q = vrBajoRayo(lam, B, rr); if (q === null) return false;
      if (q) pulsa(q);
      return true;
    }
    PanelVR.alFotograma(fotograma); PanelVR.alGatillo(gatillo);
    Bus.on("vr:sale", libera);
    Bus.on("voz:estado", function (e) { voz = e || null; tFirma = 1; });
    window.__vrMuneca = function () {   // pruebas (vr_mock) y ?debug
      return { activo: activo(), visible: !!(lam && lam.m.visible), creada: !!lam, mano: lado, fuente: fuente, hover: hover, pinturas: pinturas, inicio: inicio,
        botones: B.map(function (b) { return { id: b.id, txt: b.txt, x: b.x, y: b.y, w: b.w, h: b.h }; }), pos: lam ? lam.m.position.toArray() : null };
    };
    window.__vrMunecaPulsa = function (id) { for (var k = 0; k < B.length; k++) if (B[k].id === id) { pulsa(B[k]); return true; } return false; };
    return { pulsa: pulsa, libera: libera };
  })();

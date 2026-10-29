// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: BAL, colocaBalizas, cierraBaliza, balizaAbierta, abreBaliza, balizaVR, eligeBaliza, sueltaBaliza, irABaliza, avisoBaliza,
//   dibujaBalizasMini, tBal, actualizaBalizas
// Consume: 01_datos (D, $), 02_mundo (suelo, copas), 03_escena (lienzo, visor, scene, camera, exag), 09_camara (objetivo, suelta),
//   12_paseo (paseando, teclas), 12b_llegada (Llegada), 13_parcelas (parcelas), 13b_hazas (HazasPuro), 14_historia (VIVO, marca, aviso),
//   15_tiempo (num1, esc, hace), 16_vida (tVida, enQuad, enDron), 20_sonido (sonidoBaliza), 26_presencia (Encuentro, sitioJunto, Presencia),
//   29_vr (VRX, ficha)
// ===============================================================================
  // ---------- las balizas: una por parcela, con lo que OlivarTrack sabe de ella; en el paseo, al acercarte, sale su ficha
  // Los datos son los de la historia (instantánea embebida, o la lectura en vivo por el MCP si se ha pulsado «Leer de OlivarTrack»).
  var gBal = new THREE.Group(); scene.add(gBal);
  var COLB = { alerta: 0xff4d3d, abierta: 0xffb02e, hecha: 0x35d07f, nada: 0x9aa4ad };
  var uBaliza = { uT: { value: 0 } };
  var BAL = parcelas.map(function (pr, k) {
    var col = new THREE.Color(COLB.nada), g = new THREE.Group();
    var mat = new THREE.ShaderMaterial({
      uniforms: { uT: uBaliza.uT, uColor: { value: col }, uPulso: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: "varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float uT; uniform vec3 uColor; uniform float uPulso; varying float vY;\n" +
        "void main(){ float t = clamp(vY / 26.0 + 0.5, 0.0, 1.0); float a = (0.42 * (1.0 - t) + 0.04) * (0.8 + 0.2 * sin(uT * 3.0 + uPulso * 6.0 * t)) * (1.0 + uPulso * 0.5 * sin(uT * 7.0)); gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.7));\n#include <colorspace_fragment>\n}"
    });
    var col3 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 26, 14, 1, true), mat); col3.position.y = 13; g.add(col3);
    var rombo = new THREE.Mesh(new THREE.OctahedronGeometry(1.05), new THREE.MeshBasicMaterial({ color: col, fog: false })); rombo.position.y = 27.5; g.add(rombo);
    var anillo = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.2, 36), new THREE.MeshBasicMaterial({ color: col, transparent: true, forceSinglePass: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, fog: false })); anillo.rotation.x = -Math.PI / 2; anillo.position.y = 0.2; g.add(anillo);   // forceSinglePass: desde r150 lo transparente de dos caras se dibuja en dos pasadas (una llamada más); un anillo plano no lo necesita
    g.userData = { k: k, mat: mat, col: col, rombo: rombo, anillo: anillo, estado: "nada", visita: false };
    gBal.add(g); return g;
  });
  var balCerca = -1, balVisitas = 0, balSig = "", balCerrada = -1, balForzada = -1;   // cerrada: la × la quitó hasta alejarse; forzada: abierta al tocarla
  function nombreParcelaIA(x) { return String(x || "").toLowerCase(); }
  function vigiaMarca(pr) {
    var v = VIVO && VIVO.vigia; if (!v) return null; var m = nombreParcelaIA(pr.nombre);
    var r = v.filter(function (x) { var n = nombreParcelaIA(x.parcela); return n && (n === m || n.indexOf(m) >= 0 || m.indexOf(n) >= 0); }); return r.length ? r[0] : null;
  }
  function datosBal(k) {
    var pr = parcelas[k], d = (OT && OT.parcelas && OT.parcelas[pr.id]) || { tareas: [], fenologia: [] }, vg = vigiaMarca(pr);
    var abiertas = (d.tareas || []).filter(function (t) { return t.estado !== "completado" && t.estado !== "cancelado" && t.estado !== "anulado"; });
    var hechas = (d.tareas || []).filter(function (t) { return t.estado === "completado"; }).sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
    var estado = vg ? "alerta" : abiertas.length ? "abierta" : hechas.length ? "hecha" : "nada";
    return { pr: pr, abiertas: abiertas, hechas: hechas, fen: (d.fenologia || []).slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); })[0] || null, vg: vg, estado: estado };
  }
  function refrescaBalizas() {
    BAL.forEach(function (g) {
      var u = g.userData, d = datosBal(u.k); u.estado = d.estado; u.col.setHex(COLB[d.estado]); u.rombo.material.color.setHex(COLB[d.estado]); u.anillo.material.color.setHex(COLB[d.estado]); u.mat.uniforms.uPulso.value = d.estado === "alerta" ? 1 : 0;
    });
  }
  function colocaBalizas() { BAL.forEach(function (g) { var pr = parcelas[g.userData.k]; g.position.set(pr.centro[0], suelo(pr.centro[0], pr.centro[1]) * exag, -pr.centro[1]); }); refrescaBalizas(); }
  var PILL_TXT = { alerta: "Vigía pide una mirada", abierta: "Hay tareas abiertas", hecha: "Sin tareas abiertas", nada: "Sin datos de tareas" };
  function fuenteBal() { var fch = OT && OT.fecha_consulta ? String(OT.fecha_consulta).slice(8, 10) + "/" + String(OT.fecha_consulta).slice(5, 7) : "?"; return OT && OT.fuente === "vivo" ? "OlivarTrack, leído en vivo el " + fch : "OlivarTrack, instantánea del " + fch; }
  var BBCH_TXT = { 7: "desarrollo del fruto", 8: "maduración del fruto", 6: "floración", 5: "aparición de la inflorescencia", 1: "desarrollo de las hojas", 0: "reposo y brotación", 9: "senescencia y reposo" };
  function fichaBal(k) {
    var d = datosBal(k), pr = d.pr, h = '<button type="button" class="cerrar-baliza" aria-label="Cerrar la ficha de la parcela">×</button>';
    var pill = [PILL_TXT[d.estado], { alerta: "var(--guardado)", abierta: "var(--guardado)", hecha: "var(--olivo)", nada: "var(--muted)" }[d.estado]];
    h += '<div class="b-cab"><strong>' + esc(pr.nombre) + '</strong><span class="b-pill" style="--c:' + pill[1] + '">' + pill[0] + "</span></div>";
    h += '<p class="b-sub">' + num1(pr.ha, 1) + " ha</p>";
    if (d.vg) h += '<p class="b-aviso">Vigía marca esta parcela hoy (' + esc(d.vg.gravedad || "pide una mirada") + "). Es relativo y sin calibrar: sirve para decidir dónde mirar, no para decir que algo está enfermo.</p>";
    if (d.abiertas.length) h += "<h4>Abiertas</h4><ul>" + d.abiertas.slice(0, 3).map(function (t) { return "<li>" + esc(t.titulo) + ' <span class="b-n">' + (t.avance != null ? num1(t.avance, 0) + " %" : t.estado) + "</span></li>"; }).join("") + "</ul>";
    if (d.hechas.length) h += "<h4>Hecho hace poco</h4><ul>" + d.hechas.slice(0, 2).map(function (t) { return "<li>" + esc(t.titulo) + ' <span class="b-n">' + esc(String(t.fecha).slice(8, 10) + "/" + String(t.fecha).slice(5, 7)) + (t.andados != null && t.objetivo ? " · " + t.andados + " de " + t.objetivo + " olivos" : "") + "</span></li>"; }).join("") + "</ul>";
    if (d.fen) h += '<h4>Fenología</h4><p class="b-sub">BBCH ' + d.fen.bbch + " · " + (BBCH_TXT[Math.floor(d.fen.bbch / 10)] || "") + " · " + esc(String(d.fen.fecha).slice(8, 10) + "/" + String(d.fen.fecha).slice(5, 7)) + "</p>";
    var fuente = fuenteBal();
    var gente = genteEnBaliza(k);   // I4: con la presencia compartida, quién está ahora en esta parcela; y el botón para ir
    if (gente) h += '<p class="b-sub">' + (gente.length ? "Aquí están: " + gente.map(esc).join(", ") : "No hay nadie en esta parcela") + "</p>";
    h += '<button type="button" class="ir-baliza" data-k="' + k + '">Ir a esta baliza</button>';
    h += '<p class="b-pie">' + fuente + " · balizas visitadas " + balVisitas + " de " + BAL.length + (balVisitas === BAL.length ? " · inspección completa" : "") + "</p>";
    return h;
  }
  // la × de la ficha y tocar una baliza: cerrarla la esconde hasta alejarse; tocar la columna de luz la vuelve a abrir (en el paseo y en la órbita)
  $("baliza").addEventListener("click", function (e) {
    var ib = e.target.closest && e.target.closest(".ir-baliza");
    if (ib) { irABaliza(Number(ib.getAttribute("data-k"))); return; }
    if (!e.target.closest || !e.target.closest(".cerrar-baliza")) return;
    cierraBaliza();
  });
  function cierraBaliza() { balCerrada = balForzada >= 0 ? balForzada : balCerca; balForzada = -1; $("baliza").hidden = true; }
  // I5, la ficha de baliza en VR (29_vr.js la pinta en su lámina y allí «Ir a esta baliza» se pulsa con el rayo): qué baliza tiene la ficha abierta
  // (-1 si ninguna), abrir la de la baliza i (el rayo sobre su columna de luz, como tocarla en pantalla) y su contenido en texto llano.
  function balizaAbierta() { var b = $("baliza"), ib = b && !b.hidden && b.querySelector(".ir-baliza"); return ib ? Number(ib.getAttribute("data-k")) : -1; }
  function abreBaliza(i) { if (!BAL[i]) return false; balCerrada = -1; balForzada = i; ultFicha = -2; return true; }
  function balizaVR(k) {   // { k, titulo, estado, lineas, gente (como genteEnBaliza: null sin presencia), pie }; los alias van como texto (se pintan en un canvas, nunca HTML)
    var d = datosBal(k), pr = d.pr, l = [PILL_TXT[d.estado] + " · " + num1(pr.ha, 1) + " ha"], dm = function (f) { return String(f).slice(8, 10) + "/" + String(f).slice(5, 7); };
    if (d.vg) l.push("Vigía la marca hoy (" + (d.vg.gravedad || "pide una mirada") + "): relativo y sin calibrar, sirve para decidir dónde mirar.");
    if (d.abiertas.length) l.push("Abiertas: " + d.abiertas.slice(0, 3).map(function (t) { return t.titulo + (t.avance != null ? " (" + num1(t.avance, 0) + " %)" : ""); }).join("; "));
    else if (d.hechas.length) l.push("Hecho hace poco: " + d.hechas[0].titulo + " (" + dm(d.hechas[0].fecha) + ")");
    if (d.fen) l.push("Fenología: BBCH " + d.fen.bbch + " · " + (BBCH_TXT[Math.floor(d.fen.bbch / 10)] || "") + " · " + dm(d.fen.fecha));
    return { k: k, titulo: pr.nombre, estado: d.estado, color: COLB[d.estado], lineas: l, gente: genteEnBaliza(k), pie: fuenteBal() + " · visitadas " + balVisitas + " de " + BAL.length };
  }
  function eligeBaliza(cx, cy) {   // toque en pantalla (cx, cy): ¿está sobre la columna de luz de alguna baliza? (de su pie a 27 m de alto)
    var r = lienzo.getBoundingClientRect(), a = new THREE.Vector3(), b = new THREE.Vector3(), mejor = -1, md = 22;
    BAL.forEach(function (g, i) {
      var pr = parcelas[g.userData.k], y0 = suelo(pr.centro[0], pr.centro[1]) * exag;
      a.set(pr.centro[0], y0, -pr.centro[1]).project(camera); b.set(pr.centro[0], y0 + 27, -pr.centro[1]).project(camera); if (a.z > 1 && b.z > 1) return;
      var ax = (a.x * 0.5 + 0.5) * r.width + r.left, ay = (-a.y * 0.5 + 0.5) * r.height + r.top, bx = (b.x * 0.5 + 0.5) * r.width + r.left, by = (-b.y * 0.5 + 0.5) * r.height + r.top;
      var vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy) / L)), d = Math.hypot(cx - (ax + t * vx), cy - (ay + t * vy));
      if (d < md) { md = d; mejor = i; }
    });
    if (mejor < 0) return false;
    balCerrada = -1; balForzada = mejor; ultFicha = -2; return true;
  }
  function sueltaBaliza() { balForzada = -1; }
  // ---- I4: las balizas como punto de encuentro. Quién está en la parcela (con ?presencia: los que se dibujan, dentro de su linde; null sin presencia),
  // el aviso del minimapa («¿Ir a esta baliza?», con Ir y Cancelar) e ir: a 4-5,5 m de la columna, fuera de copas y troncos, mirándola (Llegada.ve)
  function genteEnBaliza(k) {
    if (typeof Presencia === "undefined" || !Presencia.activo()) return null;
    return Encuentro.enParcela(Presencia.puntos(), parcelas[k].linde, HazasPuro.dentroPoligono);
  }
  function irABaliza(k) {
    var pr = parcelas[k]; if (!pr) return false;
    var desde = paseando || VRX.on ? { x: pp.x, y: pp.y } : { x: objetivo.x, y: -objetivo.z };
    var L = sitioJunto({ x: pr.centro[0], y: pr.centro[1] }, desde, Encuentro.BALIZA, enQuad && !VRX.on ? 1.05 : 0.55);
    cierraAvisoBaliza(); balForzada = -1; balCerrada = -1;
    return Llegada.ve(L.x, L.y, L.ang);
  }
  var avisoB = null;
  function textoAvisoBaliza(k) {
    var g = genteEnBaliza(k), pr = parcelas[k];
    return "Parcela " + pr.nombre + " · " + (g === null ? "¿Ir a esta baliza?" : g.length ? "aquí están: " + g.join(", ") + ". ¿Ir a esta baliza?" : "No hay nadie en esta parcela. ¿Ir?");
  }
  function avisoBaliza(k) {   // el aviso pequeño del minimapa; el texto va con textContent (los alias son de otras personas: nunca HTML)
    if (!avisoB) {
      var raiz = document.createElement("div"), txt = document.createElement("p"), ir = document.createElement("button"), no = document.createElement("button");
      raiz.setAttribute("role", "dialog"); raiz.setAttribute("aria-label", "Ir a la baliza"); raiz.hidden = true;
      raiz.style.cssText = "position:absolute;left:12px;top:12px;z-index:31;max-width:min(300px,calc(100% - 24px));padding:10px;border-radius:12px;background:rgba(16,20,24,0.92);color:#fff;font:13px/1.35 system-ui,sans-serif;box-sizing:border-box";
      txt.style.margin = "0 0 8px"; txt.id = "avisoBalTxt"; raiz.setAttribute("aria-describedby", "avisoBalTxt");
      var bs = "font:inherit;color:inherit;border-radius:8px;padding:6px 14px;min-height:44px;min-width:44px;cursor:pointer;margin-right:8px;";
      ir.type = "button"; ir.textContent = "Ir"; ir.style.cssText = bs + "background:rgba(64,240,255,0.22);border:1px solid rgba(64,240,255,0.7)";
      no.type = "button"; no.textContent = "Cancelar"; no.style.cssText = bs + "background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.35)";
      ir.addEventListener("click", function () { if (avisoB.k >= 0) irABaliza(avisoB.k); });
      no.addEventListener("click", cierraAvisoBaliza);
      raiz.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Escape") { cierraAvisoBaliza(); e.preventDefault(); } });   // las teclas no mueven al paseante
      raiz.appendChild(txt); raiz.appendChild(ir); raiz.appendChild(no); (visor || document.body).appendChild(raiz);
      avisoB = { raiz: raiz, txt: txt, ir: ir, k: -1, foco: null };
    }
    avisoB.k = k; avisoB.txt.textContent = textoAvisoBaliza(k); avisoB.foco = document.activeElement; avisoB.raiz.hidden = false;
    try { avisoB.ir.focus({ preventScroll: true }); } catch (e) {}
    return true;
  }
  function cierraAvisoBaliza() {
    if (!avisoB || avisoB.raiz.hidden) return;
    avisoB.raiz.hidden = true; avisoB.k = -1;
    try { if (avisoB.foco && avisoB.foco.focus) avisoB.foco.focus({ preventScroll: true }); } catch (e) {}
  }   // al tocar otra cosa (olivo, suelo), la ficha forzada se suelta y vuelve la de cercanía
  function dibujaBalizasMini(c, X, Y, pts) {   // pts (opcional): ahí se apunta dónde cae cada rombo, para tocarlo (17_minimapa.js)
    if (pts) pts.length = 0;
    BAL.forEach(function (g) {
      var pr = parcelas[g.userData.k], x = X(pr.centro[0]), y = Y(pr.centro[1]);
      if (pts) pts.push({ k: g.userData.k, px: x, py: y });
      c.fillStyle = "#" + ("000000" + COLB[g.userData.estado].toString(16)).slice(-6); c.strokeStyle = "#101418"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 4.5, y); c.lineTo(x, y + 6); c.lineTo(x - 4.5, y); c.closePath(); c.fill(); c.stroke();
      if (g.userData.visita) { c.strokeStyle = "#ffffff"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x - 2, y); c.lineTo(x - 0.5, y + 2); c.lineTo(x + 2.5, y - 2); c.stroke(); }
    });
  }
  var tBal = 0, ultFicha = -2;
  function actualizaBalizas(dt) {
    uBaliza.uT.value = tVida; tBal += dt;
    var firma = (OT && OT.fecha_consulta) + "|" + (OT === D.ot ? "i" : "v") + "|" + (VIVO ? (VIVO.vigia ? VIVO.vigia.length : "x") : "n");
    if (firma !== balSig) { balSig = firma; refrescaBalizas(); ultFicha = -2; }
    BAL.forEach(function (g, i) {
      var u = g.userData; u.rombo.rotation.y += dt * 1.4; u.rombo.position.y = 27.5 + Math.sin(tVida * 1.8 + i) * 0.5;
      u.anillo.scale.setScalar(1 + 0.12 * Math.sin(tVida * 3 + i * 2)); g.visible = true;
    });
    if (balForzada >= 0) { if (ultFicha !== balForzada || tBal > 2) { tBal = 0; ultFicha = balForzada; $("baliza").innerHTML = fichaBal(BAL[balForzada].userData.k); } $("baliza").hidden = false; return; }   // abierta al tocar su baliza
    if (!paseando) { $("baliza").hidden = true; balCerca = -1; return; }
    if (TR.act && TR.t < TR.tCae + 0.4) { $("baliza").hidden = true; return; }   // la ficha espera a que el muñequito aterrice
    var mejor = -1, md = 1e9; BAL.forEach(function (g, i) { var pr = parcelas[g.userData.k], d = Math.hypot(pr.centro[0] - (enDron ? dr.x : pp.x), pr.centro[1] - (enDron ? dr.y : pp.y)); if (d < md) { md = d; mejor = i; } });
    var dentro = mejor >= 0 && md < 17;
    if (dentro) {
      if (!BAL[mejor].userData.visita) { BAL[mejor].userData.visita = true; balVisitas = BAL.filter(function (g) { return g.userData.visita; }).length; if (typeof sonidoBaliza === "function") sonidoBaliza(balVisitas === BAL.length); ultFicha = -2; }
      if (mejor !== ultFicha || tBal > 2) { tBal = 0; ultFicha = mejor; $("baliza").innerHTML = fichaBal(BAL[mejor].userData.k); }
      $("baliza").hidden = mejor === balCerrada; balCerca = mejor;   // cerrada con la ×: no vuelve sola hasta que te alejes
    } else { $("baliza").hidden = true; balCerca = -1; ultFicha = -2; balCerrada = -1; }
  }



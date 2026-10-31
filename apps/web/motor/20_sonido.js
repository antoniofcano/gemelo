// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (fmt), 02c_componentes (Bus, Componentes), 09_camara (suelta), 12_paseo (paseando, teclas), 15_tiempo (lluvia, cur, nivel),
//   16_vida (tVida, enQuad, quad, enDron, dron), 18_paisaje (aguaNivel, distArroyo), 29_vr (VRX, panel, PanelVR), 33_ajustes (Ajustes)
// ===============================================================================
  // ---------- el sonido del olivar: todo sintetizado en el navegador (no hay ficheros de audio) y atado al tiempo del mundo
  var snd = { ctx: null, master: null, t: 0, ave: 1.5, grillo: 0.5, pasoAnt: 0 };
  function sRuido(ctx, marron) {
    var n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), l = 0;
    for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; if (marron) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; }
    return b;
  }
  function sBucle(buf, tipo, f, q) {
    var c = snd.ctx, s = c.createBufferSource(); s.buffer = buf; s.loop = true;
    var fl = c.createBiquadFilter(); fl.type = tipo; fl.frequency.value = f; fl.Q.value = q || 0.7; var g = c.createGain(); g.gain.value = 0;
    s.connect(fl); fl.connect(g); g.connect(snd.master); s.start(); return { f: fl, g: g };
  }
  function sOsc(tipo, f) { var c = snd.ctx, o = c.createOscillator(); o.type = tipo; o.frequency.value = f; var g = c.createGain(); g.gain.value = 0; o.connect(g); o.start(); return { o: o, g: g }; }
  var AJ_DEF = { activo: true, volumen: 80 };   // sin Configuración (Ajustes) se usan los de siempre
  function sAjuste(k) { return typeof Ajustes !== "undefined" && Ajustes.lee ? Ajustes.lee("sonido." + k) : AJ_DEF[k]; }
  function iniciaSonido() {
    if (snd.ctx) { if (snd.ctx.state === "suspended") snd.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC || !sAjuste("activo")) return;
    var c = snd.ctx = new AC(); snd.master = c.createGain(); snd.master.gain.value = 0; snd.master.connect(c.destination);
    var blanco = sRuido(c, false), marron = sRuido(c, true);
    snd.viento = sBucle(marron, "lowpass", 400, 0.5); snd.silbo = sBucle(blanco, "bandpass", 900, 7); snd.lluvia = sBucle(blanco, "highpass", 2400, 0.6); snd.agua = sBucle(blanco, "bandpass", 1500, 0.9);
    // quad: dos osciladores graves por un filtro; dron: dientes de sierra algo desafinados
    var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.connect(snd.master);
    snd.m1 = sOsc("sawtooth", 40); snd.m2 = sOsc("square", 20); snd.m1.g.disconnect(); snd.m2.g.disconnect(); snd.m1.g.connect(lp); snd.m2.g.connect(lp); snd.lp = lp;
    var lp2 = c.createBiquadFilter(); lp2.type = "bandpass"; lp2.frequency.value = 600; lp2.Q.value = 0.7; lp2.connect(snd.master);
    snd.d1 = sOsc("sawtooth", 180); snd.d2 = sOsc("sawtooth", 184); snd.d1.g.disconnect(); snd.d2.g.disconnect(); snd.d1.g.connect(lp2); snd.d2.g.connect(lp2);
    snd.blanco = blanco; snd.ctx.resume();
  }
  function sSuave(param, v, tc) { if (param && snd.ctx) param.setTargetAtTime(v, snd.ctx.currentTime, tc || 0.2); }
  function sPan() { var c = snd.ctx; if (c.createStereoPanner) { var p = c.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; p.connect(snd.master); return p; } return snd.master; }
  function sPio(vol) {   // un trino de pájaro: de 2 a 5 notas con barrido de frecuencia
    var c = snd.ctx, t = c.currentTime + 0.02, dest = sPan(), notas = 2 + Math.floor(Math.random() * 4), f0 = 2200 + Math.random() * 2200, dir = Math.random() < 0.5 ? 1 : -1;
    for (var i = 0; i < notas; i++) {
      var o = c.createOscillator(), g = c.createGain(), ini = t + i * (0.09 + Math.random() * 0.05), f = f0 * (1 + 0.12 * i * dir), dur = 0.05 + Math.random() * 0.06;
      o.type = "sine"; o.frequency.setValueAtTime(f, ini); o.frequency.exponentialRampToValueAtTime(f * (1.25 + Math.random() * 0.4), ini + dur);
      g.gain.setValueAtTime(0.0001, ini); g.gain.exponentialRampToValueAtTime(vol, ini + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, ini + dur); o.connect(g); g.connect(dest); o.start(ini); o.stop(ini + dur + 0.02);
    }
  }
  function sGrillo(vol, rapidez) {   // tres pulsos agudos
    var c = snd.ctx, t = c.currentTime + 0.01, dest = sPan(), f = 4100 + Math.random() * 500;
    for (var i = 0; i < 3; i++) { var o = c.createOscillator(), g = c.createGain(), ini = t + i * 0.055 / rapidez; o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, ini); g.gain.linearRampToValueAtTime(vol, ini + 0.008); g.gain.linearRampToValueAtTime(0.0001, ini + 0.03); o.connect(g); g.connect(dest); o.start(ini); o.stop(ini + 0.04); }
  }
  function sPaso(vol) {
    var c = snd.ctx, s = c.createBufferSource(); s.buffer = snd.blanco; var f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 450 + Math.random() * 350; f.Q.value = 0.8; var g = c.createGain(); var t = c.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); s.connect(f); f.connect(g); g.connect(snd.master); s.start(t, Math.random(), 0.1);
  }
  function sonidoBaliza(completa) {   // campanilla al llegar a una baliza; si son todas, un arpegio
    if (!snd.ctx || snd.ctx.state !== "running") return; var c = snd.ctx, t = c.currentTime, notas = completa ? [660, 880, 1100, 1320] : [880, 1320];
    notas.forEach(function (f, i) { var o = c.createOscillator(), g = c.createGain(), ini = t + i * 0.11; o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, ini); g.gain.exponentialRampToValueAtTime(0.16, ini + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ini + 0.9); o.connect(g); g.connect(snd.master); o.start(ini); o.stop(ini + 1); });
  }
  function actualizaSonido(dt) {
    var quiere = sAjuste("activo") && !document.hidden;   // un solo interruptor (Configuración → Sonido, decisión 89)
    if (!snd.ctx) return; if (snd.ctx.state !== "running") { if (quiere) snd.ctx.resume(); return; }
    sSuave(snd.master.gain, quiere ? 0.9 * sAjuste("volumen") / 100 : 0, 0.3);
    var d = nivel(cur.ms).d, v = Math.min(1, cur.viento / 9), rafaga = 0.78 + 0.22 * Math.sin(tVida * 0.7 + Math.sin(tVida * 0.23) * 2);
    sSuave(snd.viento.g.gain, (0.012 + 0.11 * v * v) * rafaga, 0.4); sSuave(snd.viento.f.frequency, 260 + 750 * v, 0.4);
    sSuave(snd.silbo.g.gain, 0.012 * Math.pow(Math.min(1, cur.viento / 6), 1.6), 0.4); sSuave(snd.silbo.f.frequency, 700 + 900 * v + 200 * Math.sin(tVida * 0.9), 0.3);
    sSuave(snd.lluvia.g.gain, cur.lluvia > 0.05 ? Math.min(0.13, 0.014 + cur.lluvia * 0.03) : 0, 0.5);
    var dc = paseando ? distArroyo(enDron ? dr.x : pp.x, enDron ? dr.y : pp.y) : 90; sSuave(snd.agua.g.gain, aguaNivel > 0.05 ? 0.075 * aguaNivel * Math.max(0.12, 1 - dc / 70) : 0, 0.5);
    // los motores
    var vqa = Math.abs(vq), vd = Math.abs(dr.vf) + Math.abs(dr.vh) * 1.4;
    sSuave(snd.m1.g.gain, enQuad ? 0.07 + 0.09 * Math.min(1, vqa / 10) : 0, 0.15); sSuave(snd.m2.g.gain, enQuad ? 0.05 + 0.06 * Math.min(1, vqa / 10) : 0, 0.15);
    sSuave(snd.m1.o.frequency, 38 + vqa * 6.5 + Math.sin(tVida * 21) * 1.2, 0.1); sSuave(snd.m2.o.frequency, 19 + vqa * 3.2, 0.1); sSuave(snd.lp.frequency, 420 + vqa * 55, 0.2);
    sSuave(snd.d1.g.gain, enDron ? 0.018 + 0.02 * Math.min(1, vd / 12) : 0, 0.2); sSuave(snd.d2.g.gain, enDron ? 0.016 + 0.018 * Math.min(1, vd / 12) : 0, 0.2);
    sSuave(snd.d1.o.frequency, 165 + vd * 5, 0.15); sSuave(snd.d2.o.frequency, 169 + vd * 5, 0.15);
    // los pasos, a cada zancada
    var zanc = Math.floor(pp.paso / Math.PI);
    if (paseando && !enQuad && !enDron && zanc !== snd.pasoAnt && Math.abs(pp.paso) > 0.1) { sPaso(0.05 + 0.04 * Math.min(1, (teclas.run ? 1 : 0.5))); }
    snd.pasoAnt = zanc;
    // los pájaros de día, los grillos de noche (más rápidos cuanto más calor)
    snd.ave -= dt; snd.grillo -= dt;
    if (snd.ave <= 0) { snd.ave = (1.1 + Math.random() * 3.4) / Math.max(0.3, d); if (d > 0.25 && cur.lluvia < 1 && cur.temp > 3 && cur.viento < 10) sPio(0.045 + 0.04 * Math.random()); }
    if (snd.grillo <= 0) { snd.grillo = Math.max(0.18, 0.55 - (cur.temp - 8) * 0.02) * (0.7 + Math.random() * 0.6); if (d < 0.35 && cur.lluvia < 0.3 && cur.temp > 9 && cur.viento < 6) sGrillo(0.014 + 0.012 * (1 - d), 1 + Math.max(0, cur.temp - 14) * 0.04); }
  }
  function sLadrido(grave) {   // guau-guau sintetizado: el cruce, más grave (lo pide el evento de los perros)
    if (!snd.ctx || snd.ctx.state !== "running") return;
    [0, 0.26].forEach(function (retraso) {
      var c = snd.ctx, t = c.currentTime + retraso, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.setValueAtTime(grave ? 160 : 300, t); o.frequency.exponentialRampToValueAtTime(grave ? 95 : 190, t + 0.15); f.type = "bandpass"; f.frequency.value = grave ? 460 : 820; f.Q.value = 1.1;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19); o.connect(f); f.connect(g); g.connect(snd.master); o.start(t); o.stop(t + 0.22);
    });
  }
  function sGolpe() { if (snd.ctx && snd.ctx.state === "running") { sPaso(0.2); setTimeout(function () { sPaso(0.12); }, 90); } }   // el aterrizaje del muñequito: un golpe sordo y su rebote
  // los sonidos de los juegos casuales (C9a): cortos y suaves, sintetizados; los pide el juego por el Bus («sonido:juego») y siguen el interruptor y el volumen
  // de siempre. que: mueve | gira | asienta | grupo (con cadena: cada eslabón, una nota más aguda) | fin
  function sJuego(d) {
    if (!snd.ctx || snd.ctx.state !== "running" || !d) return;
    var c = snd.ctx, t = c.currentTime, que = d.que, notas;
    if (que === "mueve") notas = [[520, 0.035, 0.035, "triangle"]];
    else if (que === "gira") notas = [[660, 0.05, 0.05, "triangle"]];
    else if (que === "asienta") notas = [[180, 0.08, 0.09, "sine"]];
    else if (que === "grupo") { var k = Math.min(5, Math.max(1, d.cadena || 1)); notas = [[523 * Math.pow(1.122, k - 1), 0.1, 0.12, "sine"], [659 * Math.pow(1.122, k - 1), 0.1, 0.16, "sine"]]; }
    else if (que === "fin") notas = [[392, 0.12, 0.25, "sine"], [330, 0.12, 0.3, "sine"], [262, 0.12, 0.45, "sine"]];
    else return;
    var ini = t;
    notas.forEach(function (q) {   // [frecuencia, volumen, duración, forma]
      var o = c.createOscillator(), g = c.createGain(); o.type = q[3]; o.frequency.value = q[0];
      g.gain.setValueAtTime(0.0001, ini); g.gain.exponentialRampToValueAtTime(q[1], ini + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ini + q[2]);
      o.connect(g); g.connect(snd.master); o.start(ini); o.stop(ini + q[2] + 0.02); ini += q[2] * 0.7;
    });
  }
  function sueltaSonido() {   // cierra el AudioContext y suelta todos los nodos (libera del componente)
    var c = snd.ctx; snd.ctx = null; snd.master = null; snd.blanco = null;
    ["viento", "silbo", "lluvia", "agua", "m1", "m2", "d1", "d2", "lp"].forEach(function (k) { snd[k] = null; });
    snd.t = 0; snd.ave = 1.5; snd.grillo = 0.5; snd.pasoAnt = 0;
    if (c) { try { var r = c.close(); if (r && r.catch) r.catch(function () {}); } catch (e) {} }
  }
  function SonidoMotor(n) {
    var montado = false;
    ["pointerdown", "keydown"].forEach(function (ev) { window.addEventListener(ev, iniciaSonido, { passive: true }); n.limpia(function () { window.removeEventListener(ev, iniciaSonido); }); });   // el audio solo arranca tras un gesto del usuario
    n.on("audio:desbloquea", function () { try { iniciaSonido(); } catch (e) {} });
    n.on("sonido:baliza", function (d) { sonidoBaliza(!!(d && d.completa)); });
    n.on("sonido:golpe", sGolpe);
    n.on("sonido:ladrido", function (d) { sLadrido(!!(d && d.grave)); });
    n.on("sonido:juego", sJuego);
    // el interruptor y el volumen: su pestaña en Configuración (Ajustes.registra) y su fila en la pestaña Comodidad del panel VR (PanelVR.filas); sin ellos, el sonido sigue con los valores de siempre
    if (typeof Ajustes !== "undefined" && Ajustes.registra) {
      n.limpia(Ajustes.registra("sonido", { activo: { tipo: "bool", def: true }, volumen: { tipo: "num", def: 80, min: 0, max: 100, paso: 5 } },
        { id: "sonido", t: "Sonido", campos: [{ k: "activo", t: "Sonido ambiente (pájaros, pasos, viento)" }, { k: "volumen", t: "Volumen", fmt: function (v) { return v + " %"; } }] },
        function (k, v) { if (montado && k === "sonido.activo" && v) iniciaSonido(); }));   // al activarlo en Configuración (un gesto), arranca
    }
    if (typeof PanelVR !== "undefined" && PanelVR.filas) {
      n.limpia(PanelVR.filas("comodidad", { id: "sonido", orden: 30, alto: 88, pinta: function (cx, y, W, h) { h.fila("Sonido", y); },
        botones: function (b, y) {
          var si = !!sAjuste("activo");
          b("snd", 420, y, 470, 64, "Sonido: " + (si ? "sí" : "no"), function () { if (typeof Ajustes !== "undefined") Ajustes.pon("sonido.activo", !si); if (!si) iniciaSonido(); VRX.sucio = true; }, si);
        } }));
    }
    montado = true;
    return { inicia: iniciaSonido, activo: function () { return !!snd.ctx; } };
  }
  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?sonido=0 lo apaga; ?sonido=1 lo enciende.
  Componentes.registra({
    id: "sonido-ambiente", version: 1,
    consume: ["Ajustes", "PanelVR", "VRX", "paseando", "teclas", "cur", "nivel", "tVida", "enQuad", "quad", "vq", "enDron", "dr", "pp", "aguaNivel", "distArroyo"],
    expone: [],
    eventos: { escucha: ["audio:desbloquea", "sonido:baliza", "sonido:golpe", "sonido:juego", "sonido:ladrido"], emite: [] },
    bandera: { defecto: true, url: "sonido" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // sin dibujo: solo Web Audio (un AudioContext, ~14 nodos fijos y los de cada trino, que se sueltan solos)
    fases: { mundo: 0 },
    monta: function (n) { return SonidoMotor(n); },
    actualiza: { mundo: function (dt) { actualizaSonido(dt); } },
    libera: function () { sueltaSonido(); }
  });

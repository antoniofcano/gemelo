// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $, ALTO), 02_mundo (suelo), 02c_componentes (Componentes), 02d_laminas (Laminas), 02e_entidades (Entidades),
//   03_escena (visor, scene, camera, exag, modo), 09_camara (objetivo, suelta), 12_paseo (paseando, teclas, primera), 12b_llegada (Llegada),
//   13_parcelas (parcelas), 13b_hazas (HazasPuro), 14_historia (lista, aviso), 15_tiempo (hace, anuncia), 16_vida (enQuad), 17_minimapa (Minimapa),
//   26_presencia (Aspecto, Chat, Encuentro, sitioJunto), 29_vr (VRX, panel, ficha), 31_hud (Hud), 32_ventanas (Ventanas)
// Nota: Componente «oficina-mundo» (OF10, ADR-0023 y ADR-0024; decisiones 107 y 114): lo que la oficina hace en el mundo. Solo se registra; nadie lo nombra. Consume la red (sala «visita») y la presencia. Anuncios (tema «anuncio»: aviso arriba, lámina en VR y chat), invitación a otra sala (tema «sala»: «Ir» o «Quedarme»), balizas oficiales (tipo «baliza-oficial» de Entidades, GET /api/balizas-oficiales, tema «balizas») y, si tu rol en la sala es de oficina, la ventana «Oficina» (anunciar, invitar, poner baliza). Los tres temas solo valen SIN participante (los manda la api). Emite oficina:anuncio y oficina:sala. Publica window.__oficinaMundo (pruebas). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/oficina_mundo.test.js.
// ===============================================================================
  // ---------- el mundo en modo oficina (OF10; doc/sistema/OFICINA.md §6; ADR-0024; decisiones 107 y 114): lo que la oficina hace en el mundo y lo que ven los demás.
  // Es un COMPONENTE (ADR-0023, bandera ?oficina=0 la apaga): se registra y nadie lo nombra. Consume la red (la sala «visita» de 37_red.js) y la presencia
  // (38_presencia_compartida.js: quién eres en la sala, en qué sala estás, cambiar de sala, el chat). Cómo se VE la oficina (chaleco, insignia, «◆ Oficina»)
  // no es de aquí: lo dibuja la presencia con Aspecto (26_presencia.js), porque es parte del muñeco. Aquí:
  //  · ANUNCIOS (tema «anuncio»): un aviso de texto arriba, unos segundos, que no recibe toques ni tapa los controles (sale bajo la barra y se cierra solo);
  //    en VR, una lámina delante (Laminas, anclada al mundo, nunca pegada a la cara) que se cierra sola o con el gatillo; y queda en el chat como «Oficina».
  //  · INVITACIÓN A OTRA SALA (tema «sala»): «La oficina os invita a la Sala de la visita» con «Ir» y «Quedarme». Nadie cambia de sala sin pulsar: cambiar
  //    de sala no te mueve de sitio, cambia con quién estás (y la presencia pide su token de la otra sala). En VR, la misma pregunta en una lámina.
  //  · BALIZAS OFICIALES (tema «balizas» + GET /api/balizas-oficiales): columnas verde oliva con una bandera clara, más bajas que las de las parcelas
  //    (19_balizas.js: de colores por su estado y con rombo) y en el minimapa como una bandera cuadrada con ◆: el tipo «baliza-oficial» de Entidades, con
  //    su ficha común (título, texto, hasta cuándo, «Ir a esta baliza») y, si eres de la oficina, «Mover aquí» y «Quitar».
  //  · EL PANEL DE LA OFICINA (solo si tu rol en la sala es oficina o admin, en pantalla; decisión 116: la oficina, en ordenador): una ventana «Oficina» con
  //    la sala en la que estás, anunciar, invitar a la otra sala y poner una baliza donde estás. Todo va por la api, que comprueba el rol y lo apunta en la
  //    auditoría (src/presencia/oficina_mundo.ts): aquí solo se decide qué ofrecer.
  // SEGURIDAD: LiveKit no deja restringir un tema por rol. Los tres temas los manda SOLO la api (RoomService.sendData) y llegan SIN participante: lo que
  // llegue por ellos con participante (un navegador que los publique) se descarta. Lo que llega es dato: se valida y se pinta como texto, nunca como HTML.
  // Sin servidor (sin D.base /teselas/… ni ?api=) no pide balizas; sin ?presencia=red no hay sala, ni anuncios, ni panel.
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/oficina_mundo.test.js)
  var OficinaMundoPuro = (function () {
    var TEMAS = ["anuncio", "sala", "balizas"], SALAS = { general: "Visita libre", visita: "Sala de la visita" }, RE_FINCA = /^[a-z0-9_-]{1,32}$/;
    var MAX_BYTES = 2048, ANUNCIO_MAX = 280, TITULO_MAX = 60, TEXTO_MAX = 280, BALIZAS_MAX = 20, HORAS = [1, 2, 4, 8, 24, 72, 168];
    var dec = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: true }) : null;
    function corta(s, max) { var c = Array.from(s); return c.length > max ? c.slice(0, max).join("").trim() : s; }
    // un mensaje de la sala por uno de los temas de la oficina → { tema, texto } | { tema, a } | { tema, finca }, o null si no vale.
    // de = el participante que lo manda (37_red.js); la api los manda SIN participante: con uno, se descarta (no es de la api).
    function lee(tema, bytes, de, limpia) {
      if (de || TEMAS.indexOf(tema) < 0 || !bytes || typeof bytes.byteLength !== "number" || !bytes.byteLength || bytes.byteLength > MAX_BYTES || !dec) return null;
      var m; try { m = JSON.parse(dec.decode(bytes)); } catch (e) { return null; }
      if (!m || typeof m !== "object" || Array.isArray(m) || m.v !== 1) return null;
      if (tema === "anuncio") { var t = typeof m.texto === "string" ? limpia(m.texto) : null; return t ? { tema: tema, texto: corta(t, ANUNCIO_MAX) } : null; }
      if (tema === "sala") return typeof m.a === "string" && Object.prototype.hasOwnProperty.call(SALAS, m.a) ? { tema: tema, a: m.a } : null;
      return typeof m.finca === "string" && RE_FINCA.test(m.finca) ? { tema: tema, finca: m.finca } : null;
    }
    // la respuesta de GET /api/balizas-oficiales → [{ id, x (este, m locales), y (norte), titulo, texto, hasta (ms) }] (como mucho 20; lo que no cuadra, fuera)
    function leeBalizas(r, centro, finca, limpia) {
      if (!r || typeof r !== "object" || r.finca !== finca || r.srs !== "EPSG:25830" || !Array.isArray(r.balizas) || !centro) return [];
      var l = [], vistos = {};
      for (var i = 0; i < r.balizas.length && l.length < BALIZAS_MAX; i++) {
        var b = r.balizas[i]; if (!b || typeof b !== "object") continue;
        var id = b.id, x = b.x, y = b.y, t = typeof b.titulo === "string" ? limpia(b.titulo) : null, h = typeof b.hasta === "string" ? Date.parse(b.hasta) : NaN;
        if (typeof id !== "number" || id % 1 !== 0 || id < 1 || vistos[id] || !isFinite(x) || !isFinite(y) || !t || !isFinite(h)) continue;
        var tx = typeof b.texto === "string" ? limpia(b.texto) : null;
        vistos[id] = true;
        l.push({ id: id, x: x - centro[0], y: y - centro[1], titulo: corta(t, TITULO_MAX), texto: tx ? corta(tx, TEXTO_MAX) : null, hasta: h });
      }
      return l;
    }
    function aUtm(x, y, centro) { return { x: Math.round((x + centro[0]) * 100) / 100, y: Math.round((y + centro[1]) * 100) / 100 }; }
    // «hasta las 18:30» (hoy) o «hasta el 02/11, 18:30», en la hora del aparato
    function hasta(ms, ahora) {
      var d = new Date(ms), a = new Date(ahora), hm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
      return d.toDateString() === a.toDateString() ? "hasta las " + hm : "hasta el " + ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + ", " + hm;
    }
    // cuánto se ve un anuncio: 6 s y 60 ms por carácter, como mucho 15 s (se lee sin prisa y no se queda)
    function dura(texto) { return Math.min(15, 6 + Array.from(String(texto || "")).length * 0.06); }
    function otraSala(s) { return s === "visita" ? "general" : "visita"; }
    // lo que el panel manda a la api (la api lo vuelve a comprobar todo): null si no vale
    function cuerpoAnuncio(texto, sala, limpia) { var t = limpia(texto); return t && (sala === "todas" || SALAS[sala]) ? { texto: corta(t, ANUNCIO_MAX), sala: sala } : null; }
    function cuerpoBaliza(finca, pos, centro, titulo, texto, horas, limpia) {
      var t = limpia(titulo), tx = texto ? limpia(texto) : null;
      if (!RE_FINCA.test(finca || "") || !t || !pos || !isFinite(pos.x) || !isFinite(pos.y) || HORAS.indexOf(horas) < 0) return null;
      var u = aUtm(pos.x, pos.y, centro), c = { finca: finca, x: u.x, y: u.y, titulo: corta(t, TITULO_MAX), horas: horas };
      if (tx) c.texto = corta(tx, TEXTO_MAX);
      return c;
    }
    return { TEMAS: TEMAS, SALAS: SALAS, HORAS: HORAS, ANUNCIO_MAX: ANUNCIO_MAX, TITULO_MAX: TITULO_MAX, TEXTO_MAX: TEXTO_MAX, BALIZAS_MAX: BALIZAS_MAX,
      lee: lee, leeBalizas: leeBalizas, aUtm: aUtm, hasta: hasta, dura: dura, otraSala: otraSala, cuerpoAnuncio: cuerpoAnuncio, cuerpoBaliza: cuerpoBaliza };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa en Node pruebas/guardianes/oficina_mundo.test.js con THREE, DOM, la red y la presencia de mentira)
  function OficinaMundoMotor(n, R, P) {
    var OP = OficinaMundoPuro, API = HazasPuro.prefijoApi(location.search, D.base), FINCA_ID = D.finca_id || "", CENTRO = D.centro_utm || null;
    var COLOR = Aspecto.CHALECO, CLARO = Aspecto.INSIGNIA, ALTO = 18, LAM_A = "oficina-anuncio", LAM_S = "oficina-sala", REFRESCO_S = 300;
    var S = R ? R.sala("visita") : null, balizas = [], st = { anuncios: 0, descartados: 0, invitaciones: 0, pedidas: 0, error: null };
    var banner = null, tBanner = 0, anuncioVR = null, invitacion = null, dialogo = null, tRefresco = 0, panelOf = null, vivo = true;
    var gB = null, mCol = null, mBan = null, geos = [], mats = [], m4 = null, v1 = null, v2 = null, q0 = null, vS = null, w0 = null;
    function limpia(t) { return Chat.limpia(t); }
    function el(tag, props, hijos) { var e = document.createElement(tag); if (props) Object.keys(props).forEach(function (k) { if (k === "style") e.style.cssText = props[k]; else if (k in e) e[k] = props[k]; else e.setAttribute(k, props[k]); }); (hijos || []).forEach(function (h) { e.appendChild(typeof h === "string" ? document.createTextNode(h) : h); }); return e; }
    function yo() { return P && P.yo ? P.yo() : null; }
    function soyOficina() { var y = yo(); return !!(y && y.oficial); }
    function oyente() { if (VRX.on) return { x: VRX.cab.x, y: -VRX.cab.z }; if (paseando) return { x: pp.x, y: pp.y }; return { x: objetivo.x, y: -objetivo.z }; }
    function pide(metodo, ruta, cuerpo) {
      if (!API) return Promise.reject(new Error("sin servidor"));
      var o = { method: metodo, credentials: "same-origin", headers: { accept: "application/json" } };
      if (cuerpo) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(cuerpo); }
      return fetch(API + ruta, o).then(function (r) {
        if (r.status === 204) return null;
        return r.json().catch(function () { return null; }).then(function (j) { if (!r.ok) { var e = new Error(j && typeof j.mensaje === "string" ? j.mensaje : "La api respondió " + r.status + "."); e.status = r.status; throw e; } return j; });
      });
    }

    // ---- lo que llega por la sala (solo de la api: sin participante)
    var quitaTemas = [];
    if (S) OP.TEMAS.forEach(function (t) { quitaTemas.push(S.escucha(t, function (bytes, de) { recibe(t, bytes, de); })); });
    function recibe(tema, bytes, de) {
      var m = OP.lee(tema, bytes, de, limpia); if (!m) { st.descartados++; return; }
      if (m.tema === "anuncio") muestraAnuncio(m.texto);
      else if (m.tema === "sala") invita(m.a);
      else if (m.finca === FINCA_ID) refresca();
    }

    // ---- el anuncio: arriba en pantalla (sin toques: no tapa nada que se pulse), en VR una lámina delante; y en el chat, como «Oficina»
    function muestraAnuncio(texto) {
      st.anuncios++; tBanner = OP.dura(texto);
      if (P && P.mensaje) P.mensaje("Oficina", texto);
      n.emite("oficina:anuncio", { texto: texto });
      if (VRX.on) { anuncioVR = texto; Laminas.abre({ id: LAM_A, ancho: 1.1, alto: 0.36, w: 880, h: 288, pinta: pintaAnuncioVR, firma: function () { return anuncioVR; }, alTocar: function () { Laminas.cierra(LAM_A); return true; } }); return; }
      if (!banner) {
        banner = el("div", { id: "oficinaAnuncio", role: "status", "aria-live": "polite", style: "position:absolute;left:50%;top:64px;transform:translateX(-50%);z-index:32;max-width:min(560px,calc(100% - 32px));padding:10px 14px;border-radius:12px;background:rgba(72,84,20,0.95);color:#fff;font:15px/1.4 system-ui,sans-serif;box-sizing:border-box;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,0.35)" });
        (visor || document.body).appendChild(banner);
      }
      banner.textContent = "◆ Oficina: " + texto; banner.hidden = false;
    }
    function pintaAnuncioVR(cx, w, h) {
      cx.fillStyle = "rgba(72,84,20,0.96)"; cx.fillRect(0, 0, w, h);
      cx.fillStyle = "#f4ecc2"; cx.font = "600 34px system-ui, sans-serif"; cx.textBaseline = "top"; cx.fillText("◆ Oficina", 28, 22);
      cx.fillStyle = "#ffffff"; cx.font = "30px system-ui, sans-serif";
      lineas(cx, anuncioVR || "", w - 56).slice(0, 5).forEach(function (l, i) { cx.fillText(l, 28, 78 + i * 38); });
    }
    function lineas(cx, t, ancho) {   // el texto partido en líneas que caben (por palabras)
      var out = [], linea = ""; String(t).split(" ").forEach(function (p) { var x = linea ? linea + " " + p : p; if (cx.measureText(x).width > ancho && linea) { out.push(linea); linea = p; } else linea = x; });
      if (linea) out.push(linea); return out;
    }

    // ---- la invitación a otra sala: se pregunta; nadie cambia de sala sin pulsar
    function invita(a) {
      if (!P || !P.sala || a === P.sala()) return;
      st.invitaciones++; invitacion = a; n.emite("oficina:sala", { a: a });
      var txt = "La oficina os invita a la " + OP.SALAS[a] + ". Cambiar de sala no te mueve de sitio: cambia con quién estás.";
      if (VRX.on) {
        Laminas.abre({ id: LAM_S, ancho: 1.1, alto: 0.5, w: 880, h: 400, firma: function () { return invitacion || ""; },
          pinta: function (cx, w, h) {
            cx.fillStyle = "rgba(16,20,24,0.94)"; cx.fillRect(0, 0, w, h); cx.fillStyle = "#fff"; cx.font = "30px system-ui, sans-serif"; cx.textBaseline = "top";
            lineas(cx, txt, w - 56).slice(0, 4).forEach(function (l, i) { cx.fillText(l, 28, 24 + i * 38); });
            cx.fillStyle = "rgba(64,240,255,0.3)"; cx.fillRect(28, h - 120, w / 2 - 42, 92); cx.fillStyle = "rgba(255,255,255,0.14)"; cx.fillRect(w / 2 + 14, h - 120, w / 2 - 42, 92);
            cx.fillStyle = "#fff"; cx.font = "600 34px system-ui, sans-serif"; cx.textAlign = "center"; cx.fillText("Ir", w / 4, h - 92); cx.fillText("Quedarme", w * 3 / 4, h - 92); cx.textAlign = "left";
          },
          alTocar: function (u, v) { if (v < 0.68) return false; if (u < 0.5) aceptaSala(); else rechazaSala(); return true; } });
        return;
      }
      if (!dialogo) {
        var bs = "font:inherit;color:inherit;border-radius:8px;padding:6px 14px;min-height:44px;min-width:44px;cursor:pointer;margin-right:8px;";
        var p = el("p", { id: "oficinaSalaTxt", style: "margin:0 0 8px" }), ir = el("button", { type: "button", style: bs + "background:rgba(64,240,255,0.22);border:1px solid rgba(64,240,255,0.7)" }, ["Ir"]);
        var no = el("button", { type: "button", style: bs + "background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.35)" }, ["Quedarme"]);
        var raiz = el("div", { id: "oficinaInvitacion", role: "dialog", "aria-label": "Invitación de la oficina", "aria-describedby": "oficinaSalaTxt", style: "position:absolute;left:50%;top:120px;transform:translateX(-50%);z-index:33;max-width:min(380px,calc(100% - 32px));padding:12px;border-radius:12px;background:rgba(16,20,24,0.94);color:#fff;font:14px/1.4 system-ui,sans-serif;box-sizing:border-box" }, [p, ir, no]);
        ir.addEventListener("click", aceptaSala); no.addEventListener("click", rechazaSala);
        raiz.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Escape") { rechazaSala(); e.preventDefault(); } });   // las teclas no mueven al paseante
        (visor || document.body).appendChild(raiz);
        dialogo = { raiz: raiz, txt: p, ir: ir, foco: null };
      }
      dialogo.txt.textContent = txt; dialogo.foco = document.activeElement; dialogo.raiz.hidden = false;
      try { dialogo.ir.focus({ preventScroll: true }); } catch (e) {}
    }
    function cierraInvitacion() {
      invitacion = null; if (Laminas.hay(LAM_S)) Laminas.cierra(LAM_S);
      if (dialogo && !dialogo.raiz.hidden) { dialogo.raiz.hidden = true; try { if (dialogo.foco && dialogo.foco.focus) dialogo.foco.focus({ preventScroll: true }); } catch (e) {} }
    }
    function aceptaSala() { var a = invitacion; cierraInvitacion(); if (a && P && P.cambiaSala) return P.cambiaSala(a).then(function (ok) { pintaPanel(); return ok; }); return Promise.resolve(false); }
    function rechazaSala() { cierraInvitacion(); }

    // ---- las balizas oficiales: dos mallas instanciadas (columna y bandera, 20 como mucho: 2 llamadas para todas), creadas con la primera
    function montaGrafica() {
      m4 = new THREE.Matrix4(); v1 = new THREE.Vector3(); v2 = new THREE.Vector3(); q0 = new THREE.Quaternion(); vS = new THREE.Vector3(1, 1, 1); w0 = new THREE.Vector3();
      gB = new THREE.Group(); gB.name = "balizas-oficiales"; scene.add(gB);
      var gC = new THREE.CylinderGeometry(0.3, 0.55, ALTO, 10, 1, true), gF = new THREE.BoxGeometry(1.5, 0.95, 0.06);
      gC.translate(0, ALTO / 2, 0); gF.translate(0.78, ALTO + 0.1, 0);   // la bandera, a un lado de lo alto de la columna
      var mC = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), mF = new THREE.MeshBasicMaterial({ color: CLARO, fog: false });
      geos = [gC, gF]; mats = [mC, mF];
      mCol = new THREE.InstancedMesh(gC, mC, OP.BALIZAS_MAX); mBan = new THREE.InstancedMesh(gF, mF, OP.BALIZAS_MAX);
      [mCol, mBan].forEach(function (m) { m.count = 0; m.frustumCulled = false; gB.add(m); });
    }
    function coloca() {
      if (!balizas.length && !gB) return;
      if (!gB) montaGrafica();
      balizas.forEach(function (b, i) {
        b.pos = { x: b.x, y: suelo(b.x, b.y) * exag, z: -b.y };
        m4.compose(v1.set(b.pos.x, b.pos.y, b.pos.z), q0, vS); mCol.setMatrixAt(i, m4); mBan.setMatrixAt(i, m4);
      });
      mCol.count = mBan.count = balizas.length; mCol.instanceMatrix.needsUpdate = true; mBan.instanceMatrix.needsUpdate = true;
      gB.visible = balizas.length > 0;
    }
    function refresca() {
      if (!API || !FINCA_ID || !CENTRO) return Promise.resolve(false);
      st.pedidas++; tRefresco = 0;
      return pide("GET", "balizas-oficiales?finca=" + encodeURIComponent(FINCA_ID)).then(function (j) {
        if (!vivo) return false;
        balizas = OP.leeBalizas(j, CENTRO, FINCA_ID, limpia); st.error = null; coloca(); return true;
      }, function (e) { st.error = e && e.message ? e.message : String(e); return false; });
    }
    function idDe(b) { return "baliza-oficial:" + b.id; }
    function deId(id) { for (var i = 0; i < balizas.length; i++) if (idDe(balizas[i]) === id) return balizas[i]; return null; }
    function enPantalla(cx, cy, r) {   // ¿el toque cae en la columna (del pie a lo alto, a menos de 22 px)?
      var mejor = null, md = 22;
      balizas.forEach(function (b) {
        if (!b.pos) return;
        v1.set(b.pos.x, b.pos.y, b.pos.z).project(camera); v2.set(b.pos.x, b.pos.y + ALTO, b.pos.z).project(camera); if (v1.z > 1 && v2.z > 1) return;
        var ax = (v1.x * 0.5 + 0.5) * r.width + r.left, ay = (-v1.y * 0.5 + 0.5) * r.height + r.top, bx = (v2.x * 0.5 + 0.5) * r.width + r.left, by = (-v2.y * 0.5 + 0.5) * r.height + r.top;
        var vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy) / L)), d = Math.hypot(cx - (ax + t * vx), cy - (ay + t * vy));
        if (d < md) { md = d; mejor = b; }
      });
      return mejor ? { id: idDe(mejor), s: md / 22 } : null;
    }
    function enRayo(rr) {   // como las balizas de las parcelas: el punto de la columna más cercano al rayo, con un radio que crece con la distancia
      var o = rr.ray.origin, d = rr.ray.direction, bb = d.y, den = 1 - bb * bb, mejor = null, ms = 1e9;
      if (den < 1e-6) return null;
      balizas.forEach(function (b) {
        var g = b.pos; if (!g) return; w0.set(o.x - g.x, o.y - g.y, o.z - g.z);
        var dw = d.x * w0.x + d.y * w0.y + d.z * w0.z, s = Math.max(0, Math.min(ALTO + 0.6, (w0.y - bb * dw) / den));
        var t = (g.x - o.x) * d.x + (g.y + s - o.y) * d.y + (g.z - o.z) * d.z; if (t < 0.5 || t > 2500) return;
        var dist = Math.hypot(o.x + d.x * t - g.x, o.y + d.y * t - g.y - s, o.z + d.z * t - g.z), rad = Math.max(1.2, t * 0.012), sc = dist / rad;
        if (sc < 1 && sc + t * 0.0005 < ms) { ms = sc + t * 0.0005; mejor = { id: idDe(b), t: t, s: sc }; }
      });
      return mejor;
    }
    function irA(b) {
      var L = sitioJunto({ x: b.x, y: b.y }, oyente(), Encuentro.BALIZA, enQuad && !VRX.on ? 1.05 : 0.55);
      return Llegada.ve(L.x, L.y, L.ang);
    }
    function fichaBaliza(id, modo) {
      var b = deId(id); if (!b) return null;
      var f = { titulo: "◆ Oficina · " + b.titulo, color: COLOR, filas: [], lineas: [], pie: "Baliza oficial: la puso la oficina", acciones: [{ id: "oir", txt: "Ir a esta baliza", fn: function () { return irA(b); } }] };
      if (b.texto) { f.filas.push({ k: "Dice", v: b.texto }); f.lineas.push(b.texto); }
      var h = OP.hasta(b.hasta, Date.now()); f.filas.push({ k: "Se ve", v: h }); f.lineas.push("Se ve " + h);
      if (soyOficina() && API) {   // la oficina la mueve a donde está o la quitaTemas (la api lo vuelve a comprobar)
        f.acciones.push({ id: "omv", txt: "Mover aquí", fn: function () { return mueve(b); } });
        f.acciones.push({ id: "oqu", txt: modo === "vr" ? "Quitar" : "Quitar baliza", fn: function () { return quitaBaliza(b); } });
      }
      return f;
    }
    var quitaTipo = Entidades.registra({ tipo: "baliza-oficial", dueno: "39_oficina_mundo", prioridad: 21, sinAnillo: true, pantalla: enPantalla, rayo: enRayo, ficha: fichaBaliza,
      existe: function (id) { return !!deId(id); },
      lista: function () { return balizas.map(function (b) { return { id: idDe(b), x: b.x, y: b.y, titulo: b.titulo }; }); },
      pos: function (id) { var b = deId(id); return b && b.pos ? { x: b.pos.x, y: b.pos.y, z: b.pos.z } : null; },
      radio: function () { return 1.2; } });
    n.limpia(quitaTipo);
    // en el minimapa: una bandera cuadrada verde oliva con ◆ (las de las parcelas son rombos de colores)
    n.limpia(Minimapa.capa(function (c, X, Y) {
      balizas.forEach(function (b) {
        var x = X(b.x), y = Y(b.y);
        c.strokeStyle = "#101418"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y + 6); c.lineTo(x, y - 7); c.stroke();
        c.fillStyle = "#a3b236"; c.fillRect(x, y - 7, 8, 6); c.strokeRect(x, y - 7, 8, 6);
        c.fillStyle = "#f4ecc2"; c.beginPath(); c.moveTo(x + 4, y - 6.2); c.lineTo(x + 5.6, y - 4); c.lineTo(x + 4, y - 1.8); c.lineTo(x + 2.4, y - 4); c.closePath(); c.fill();
      });
    }, 5));

    // ---- lo que hace la oficina (la api lo comprueba todo y lo apunta en la auditoría)
    function mueve(b) {
      var u = OP.aUtm(oyente().x, oyente().y, CENTRO);
      return pide("PUT", "admin/balizas/" + b.id, { x: u.x, y: u.y }).then(function () { avisaOficina("Baliza movida."); return refresca(); }, function (e) { avisaOficina(e.message); return false; });
    }
    function quitaBaliza(b) { return pide("DELETE", "admin/balizas/" + b.id).then(function () { avisaOficina("Baliza quitada."); return refresca(); }, function (e) { avisaOficina(e.message); return false; }); }
    function avisaOficina(t) { if (panelOf) panelOf.estado.textContent = t; else if (typeof Hud !== "undefined" && Hud.aviso) Hud.avisaOficina(t); }
    // el panel: una ventana «Oficina» con su icono en la barra, solo mientras tu rol en la sala es de oficina (y en pantalla: en VR no hay teclado)
    function montaPanel() {
      if (panelOf) return;
      var cu = null, quitaV = Ventanas.registra("oficina", { titulo: "Oficina en el mundo", construye: function (c) { cu = c; } });
      if (!quitaV || !cu) return;
      var css = "font:inherit;color:inherit;border-radius:8px;padding:6px 12px;min-height:44px;cursor:pointer;background:rgba(163,178,54,0.2);border:1px solid rgba(163,178,54,0.75)";
      var campo = "font:inherit;width:100%;box-sizing:border-box;min-height:44px;padding:6px 8px;border-radius:8px;margin:4px 0";
      var salaTxt = el("p", { style: "margin:0 0 6px" }), irOtra = el("button", { type: "button", style: css }), invitar = el("button", { type: "button", style: css + ";margin-left:8px" });
      var aTxt = el("textarea", { maxLength: OP.ANUNCIO_MAX, rows: 3, style: campo, "aria-label": "Texto del anuncio (hasta " + OP.ANUNCIO_MAX + " caracteres)" }), aCuenta = el("span", { style: "opacity:0.7;font-size:12px" }, ["0 / " + OP.ANUNCIO_MAX]);
      var aSala = el("select", { style: campo, "aria-label": "A quién se anuncia" }, [el("option", { value: "todas" }, ["A las dos salas"]), el("option", { value: "general" }, ["A la Visita libre"]), el("option", { value: "visita" }, ["A la Sala de la visita"])]);
      var aBtn = el("button", { type: "button", style: css }, ["Anunciar"]);
      var bTit = el("input", { type: "text", maxLength: OP.TITULO_MAX, style: campo, "aria-label": "Título de la baliza (hasta " + OP.TITULO_MAX + ")", placeholder: "Aquí se recoge hoy" });
      var bTxt = el("textarea", { maxLength: OP.TEXTO_MAX, rows: 2, style: campo, "aria-label": "Texto de la baliza (opcional)" });
      var bHoras = el("select", { style: campo, "aria-label": "Cuánto dura la baliza" }, OP.HORAS.map(function (h) { return el("option", { value: String(h) }, [h < 24 ? h + " h" : h / 24 + (h === 24 ? " día" : " días")]); }));
      bHoras.value = "8";
      var bBtn = el("button", { type: "button", style: css }, ["Poner aquí"]), estado = el("p", { role: "status", "aria-live": "polite", style: "margin:8px 0 0;min-height:1.4em" });
      var h3 = function (t) { return el("h3", { style: "margin:12px 0 4px;font-size:14px" }, [t]); };
      [h3("Sala"), salaTxt, irOtra, invitar, h3("Anunciar"), aTxt, aCuenta, aSala, aBtn, h3("Baliza oficial donde estás"), bTit, bTxt, bHoras, bBtn, estado,
        el("p", { style: "margin:8px 0 0;opacity:0.7;font-size:12px" }, ["Te ven con chaleco e insignia. Todo lo que haces aquí queda en la auditoría."])].forEach(function (x) { cu.appendChild(x); });
      aTxt.addEventListener("input", function () { aCuenta.textContent = Array.from(aTxt.value).length + " / " + OP.ANUNCIO_MAX; });
      irOtra.addEventListener("click", function () { var a = OP.otraSala(P.sala()); estado.textContent = "Cambiando de sala…"; P.cambiaSala(a).then(function (ok) { estado.textContent = ok ? "Estás en la " + OP.SALAS[a] + "." : "No se pudo cambiar de sala."; pintaPanel(); }); });
      invitar.addEventListener("click", function () {
        var de = P.sala(), a = OP.otraSala(de);
        pide("POST", "admin/presencia/llevar", { de: de, a: a }).then(function (j) { estado.textContent = j && j.enviado ? "Invitación enviada a la " + OP.SALAS[de] + "." : "En la " + OP.SALAS[de] + " no hay nadie."; }, function (e) { estado.textContent = e.message; });
      });
      aBtn.addEventListener("click", function () {
        var c = OP.cuerpoAnuncio(aTxt.value, aSala.value, limpia); if (!c) { estado.textContent = "Escribe el anuncio."; aTxt.focus(); return; }
        aBtn.disabled = true;
        pide("POST", "admin/presencia/anuncio", c).then(function (j) { estado.textContent = j && j.salas && j.salas.length ? "Anuncio enviado." : "Anuncio enviado, pero no había nadie en la sala."; aTxt.value = ""; aCuenta.textContent = "0 / " + OP.ANUNCIO_MAX; },
          function (e) { estado.textContent = e.message; }).then(function () { aBtn.disabled = false; });
      });
      bBtn.addEventListener("click", function () {
        var c = OP.cuerpoBaliza(FINCA_ID, oyente(), CENTRO, bTit.value, bTxt.value, Number(bHoras.value), limpia); if (!c) { estado.textContent = "La baliza necesita un título."; bTit.focus(); return; }
        bBtn.disabled = true;
        pide("POST", "admin/balizas", c).then(function () { estado.textContent = "Baliza puesta."; bTit.value = ""; bTxt.value = ""; return refresca(); }, function (e) { estado.textContent = e.message; }).then(function () { bBtn.disabled = false; });
      });
      var quitaI = Hud.icono({ id: "oficina", ico: "◆", txt: "Oficina", prio: 2, ventana: "oficina" });
      panelOf = { salaTxt: salaTxt, irOtra: irOtra, invitar: invitar, estado: estado, quitaTemas: function () { quitaI(); quitaV(); } };
      pintaPanel();
    }
    function pintaPanel() {
      if (!panelOf || !P) return;
      var s = P.sala(), o = OP.otraSala(s);
      panelOf.salaTxt.textContent = "Estás en la " + OP.SALAS[s] + ".";
      panelOf.irOtra.textContent = "Ir a la " + OP.SALAS[o]; panelOf.invitar.textContent = "Invitar a todos a la " + OP.SALAS[o];
    }
    function quitaPanel() { if (panelOf) { panelOf.quitaTemas(); panelOf = null; } }

    // ---- fase «tarde» (cada 0,5 s): el anuncio se va solo, el panel aparece o se va con tu rol y las balizas se repiden cada 5 min (y se recolocan si cambia la exageración)
    var exagHecha = exag;
    function tarde(dt) {
      if (tBanner > 0) { tBanner -= dt; if (tBanner <= 0) { if (banner) banner.hidden = true; if (Laminas.hay(LAM_A)) Laminas.cierra(LAM_A); anuncioVR = null; } }
      var debe = soyOficina() && !VRX.on && !!API;
      if (debe && !panelOf) montaPanel(); else if (!debe && panelOf && !VRX.on) quitaPanel();
      tRefresco += dt; if (tRefresco >= REFRESCO_S) refresca();
      if (exag !== exagHecha) { exagHecha = exag; coloca(); }
    }
    function libera() {
      vivo = false;
      quitaTemas.splice(0).forEach(function (q) { q(); });
      quitaPanel(); cierraInvitacion();
      if (Laminas.hay(LAM_A)) Laminas.cierra(LAM_A);
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner); banner = null;
      if (dialogo && dialogo.raiz.parentNode) dialogo.raiz.parentNode.removeChild(dialogo.raiz); dialogo = null;
      if (gB) { scene.remove(gB); [mCol, mBan].forEach(function (m) { m.dispose(); }); geos.forEach(function (g) { g.dispose(); }); mats.forEach(function (m) { m.dispose(); }); gB = null; mCol = mBan = null; }
      balizas = [];
    }
    function estado() {
      return { balizas: balizas.map(function (b) { return { id: b.id, x: b.x, y: b.y, titulo: b.titulo }; }), anuncios: st.anuncios, descartados: st.descartados, invitaciones: st.invitaciones,
        pedidas: st.pedidas, error: st.error, panel: !!panelOf, invitacion: invitacion, banner: !!(banner && !banner.hidden), mallas: gB ? [mCol.count, mBan.count] : null };
    }
    refresca();
    // gancho de pruebas: estado; «refresca» (pide las balizas), «acepta» (la invitación), «libera» (apaga el componente y lo suelta todo)
    window.__oficinaMundo = function (accion) {
      if (accion === "refresca") return refresca(); if (accion === "acepta") return aceptaSala();
      if (accion === "libera") { Componentes.libera("oficina-mundo"); return null; }
      return estado();
    };
    n.limpia(function () { try { delete window.__oficinaMundo; } catch (e) { window.__oficinaMundo = undefined; } });
    return { tarde: tarde, libera: libera, estado: estado, refresca: refresca };
  }
  // [motor:fin]

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?oficina=0 lo apaga.
  // Consume la red y la presencia: sin ellas (?red=0, ?presencia=0 o fuera del motor) no se monta.
  Componentes.registra({
    id: "oficina-mundo", version: 1,
    consume: ["Red", "Presencia", "Aspecto", "Chat", "HazasPuro", "Entidades", "Laminas", "Ventanas", "Hud", "Minimapa", "Encuentro", "sitioJunto", "Llegada", "VRX",
      "paseando", "pp", "objetivo", "enQuad"],
    expone: [],
    eventos: { escucha: [], emite: ["oficina:anuncio", "oficina:sala"] },
    bandera: { defecto: true, url: "oficina" },
    // las balizas oficiales: columna y bandera instanciadas (2 llamadas para las 20, y solo si hay alguna; 20 + 12 triángulos cada una, contados con three 0.186.1:
    // 640 con las 20) y la lámina del anuncio o de la invitación en VR (1 llamada, 2 triángulos, una textura de 880 × 400 sin mipmaps: 1,4 MB, solo mientras se ve)
    presupuesto: { llamadas: 3, triangulos: 650, texturasMB: 2 },
    fases: { tarde: 0.5 },
    monta: function (n) { return OficinaMundoMotor(n, n.api("red-salas"), n.api("presencia-compartida")); },
    actualiza: { tarde: function (dt, t, api) { api.tarde(dt); } },
    libera: function (api) { if (api) api.libera(); }
  });

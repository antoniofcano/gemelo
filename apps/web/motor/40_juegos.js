// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 01_datos (D, $), 02_mundo (Mundo), 02c_componentes (Bus, Pausa, ConfigPuro, Teclas, Componentes, Config), 02d_laminas (Laminas),
//   03_escena (lienzo, modo), 09_camara (suelta), 12_paseo (teclas), 14_historia (hist, lista), 15_tiempo (hace), 16_vida (mira),
//   29_vr (VRX, panel, PanelVR), 31_hud (Hud), 32_ventanas (Ventanas), 36_mandos (Mandos), 90_final (bucle)
// Nota: Componente «juegos» (ADR-0023, C9a): el anfitrión de juegos casuales. Solo se registra; nadie lo nombra. Montado: icono y ventana «Juegos», tecla J, recoge los juegos por el Bus («juego:ofrece» / «juego:pide» / «juego:retira»), abre uno a pantalla completa con el mundo en pausa (Pausa de 02c; su fase «pausa») y guarda el récord (localStorage y, con servidor, /api/juegos/<id>/…). Publica window.__juegos (pruebas). El trozo [puro:…] lo evalúa en Node pruebas/guardianes/juego_cosecha.test.js.
// ===============================================================================

  // ---------- el anfitrión de juegos (C9a, decisiones 125 y 136; doc/sistema/JUEGOS.md): recoge los juegos casuales que se le ofrecen por el Bus, los enseña
  // en la ventana «Juegos» (icono de la barra y tecla J), abre uno a pantalla completa sobre el mundo EN PAUSA (Pausa de 02c: el bucle sigue, pero el mundo no
  // avanza ni se pinta; solo corre la fase «pausa», que es la de aquí), lo cierra con Esc o con su botón y devuelve a quien juega donde estaba. Guarda el
  // récord: en el aparato (localStorage, con try/catch) y, si la página la sirve el servidor, el de la familia en la api (POST /api/juegos/<id>/partidas
  // y GET …/records; contrato en contratos/api.openapi.yaml). El récord es el del propio hogar; además (C9c, decisión 137) la clasificación por alias entre familias (GET …/clasificacion): puesto, puntos y el alias solo si el hogar lo hizo visible («Otra familia» si no), en la ventana y al acabar la partida.
  // Un juego es OTRO componente: se ofrece con «juego:ofrece» { id, titulo, descripcion, ayuda?, crea(ctx) → partida } (si llega antes que el anfitrión,
  // el anfitrión le pregunta con «juego:pide») y se retira con «juego:retira» { id }. ctx = { lienzo, mandos, epoca, semilla, reducido }; la partida da
  // redimensiona(w, h, dpr), actualiza(dt) → ¿repintar?, pinta(), tecla(code) → ¿usada?, pausa(si), pausada(), estado() { puntos, fin }, resultado()
  // { puntos, duracion_s } y libera(). El anfitrión pone la barra (título, puntos, récord, Pausa y Cerrar), el teclado (Esc y P son suyas) y el final.
  // Es un COMPONENTE (ADR-0023): se registra y nadie lo nombra. ?juegos=0 o la configuración del servidor (decisión 118) lo apagan: sin icono, sin ventana.
  // En VR (C9b) el juego es una LÁMINA (Laminas, 02d): el panel VR lo ofrece en la pestaña Mundo (fila «Juegos») si el juego trae `vr` ({ botones, palanca, ayuda? }
  // y pintaEn(g, w, h), firma(), accion(a) en su partida); se pinta con el dibujo del propio juego, el mundo NO se pausa y el rayo con el gatillo toca las zonas
  // (izquierda, girar, derecha, soltar; Pausa y Salir arriba). La palanca derecha hace lo mismo y B pausa; pulsar la palanca sale. Si se entra en VR con un juego abierto en pantalla, se cierra.
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/juego_cosecha.test.js)
  var JuegosPuro = (function () {
    var ID = /^[a-z][a-z0-9-]{1,31}$/;
    // un juego ofrecido: los errores (vacía si vale)
    function validaJuego(d) {
      var e = [];
      if (!d || typeof d !== "object") return ["el juego no es un objeto"];
      if (typeof d.id !== "string" || !ID.test(d.id)) e.push("id: minúsculas, cifras y guiones (2-32), empezando por letra");
      if (typeof d.titulo !== "string" || !d.titulo.trim()) e.push("titulo");
      if (typeof d.crea !== "function") e.push("crea: función");
      return e;
    }
    // el mejor de dos récords ({ puntos, duracion_s, fecha } o null)
    function mejor(a, b) { if (!a || !(a.puntos >= 0)) return b && b.puntos >= 0 ? b : null; if (!b || !(b.puntos >= 0)) return a; return b.puntos > a.puntos ? b : a; }
    function claveLocal(id) { return "gemelo.record." + id; }
    function leeLocal(almacen, id) {
      try { var v = almacen && almacen.getItem(claveLocal(id)); if (!v) return null; var j = JSON.parse(v); return j && typeof j.puntos === "number" && j.puntos >= 0 ? j : null; } catch (e) { return null; }
    }
    // guarda en el aparato si es mejor; devuelve { record, nuevo }
    function guardaLocal(almacen, id, res, fecha) {
      var antes = leeLocal(almacen, id), r = { puntos: res.puntos, duracion_s: res.duracion_s, fecha: fecha };
      if (antes && antes.puntos >= res.puntos) return { record: antes, nuevo: false };
      try { if (almacen) almacen.setItem(claveLocal(id), JSON.stringify(r)); } catch (e) {}
      return { record: r, nuevo: res.puntos > 0 };
    }
    function rutaPartidas(prefijo, id) { return prefijo ? prefijo + "juegos/" + encodeURIComponent(id) + "/partidas" : null; }
    function rutaClasificacion(prefijo, id, n) { return prefijo ? prefijo + "juegos/" + encodeURIComponent(id) + "/clasificacion?n=" + (n || 5) : null; }
    // la respuesta de la clasificación, validada y sin nada de más (lista blanca, contratos/juegos-clasificacion.schema.json); null si no es lo esperado
    function validaClasificacion(j, id) {
      function puesto(p) {
        if (!p || typeof p !== "object" || !(p.puesto >= 1) || !(p.puntos >= 1) || typeof p.es_mia !== "boolean") return null;
        if (p.alias !== null && (typeof p.alias !== "string" || p.alias.length > 20)) return null;
        return { puesto: Math.floor(p.puesto), alias: p.alias, puntos: Math.floor(p.puntos), es_mia: p.es_mia };
      }
      if (!j || typeof j !== "object" || j.juego !== id || !(j.total >= 0) || !Array.isArray(j["puestos"])) return null;
      var filas = []; for (var i = 0; i < j["puestos"].length && i < 20; i++) { var q = puesto(j["puestos"][i]); if (!q) return null; filas.push(q); }
      var mia = j.mia == null ? null : puesto(j.mia); if (j.mia != null && !mia) return null;
      return { total: Math.floor(j.total), puestos: filas, mia: mia };
    }
    // cómo se llama una fila: el alias si es visible; la propia, «(tú)»; sin alias, «Otra familia»
    function nombrePuesto(p) { return p.es_mia ? (p.alias ? p.alias + " (tú)" : "Tu familia") : (p.alias || "Otra familia"); }
    function textoPuesto(c) {
      if (!c || !c.mia) return "Aún no estás en la clasificación.";
      return "Tu puesto: " + c.mia.puesto + ".º de " + c.total + (c.total === 1 ? " familia" : " familias");
    }
    function rutaRecords(prefijo, id) { return prefijo ? prefijo + "juegos/" + encodeURIComponent(id) + "/records" : null; }
    // una semilla por partida (o la de ?semilla=N, para las pruebas)
    function semilla(busqueda, ahora) { var m = /[?&]semilla=(\d{1,9})(?:[&#]|$)/.exec(busqueda || ""); return m ? Number(m[1]) : (Math.floor(ahora) % 2147483646) + 1; }
    function fmtDuracion(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), r = s % 60; return m ? m + " min " + r + " s" : r + " s"; }
    function fmtPuntos(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
    // ---- VR (C9b): la lámina del juego (px del lienzo; 1,1 × 1,4 m a 800 px/m) y qué hace cada sitio donde cae el rayo con el gatillo
    var VR = { w: 880, h: 1120, barra: 100, recordY: 100, tabY: 140, tabH: 780, pieY: 930, pieH: 130, ayudaY: 1068 };
    function dentro(r, x, y) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
    // los rectángulos de la lámina: Pausa y Salir arriba; abajo, n botones del juego (o «Otra partida» y «Salir» si ha acabado)
    function geoVR(n) {
      var g = { pausa: { x: 470, y: 14, w: 230, h: 72 }, salir: { x: 716, y: 14, w: 150, h: 72 }, botones: [] }, hueco = 12, k = Math.max(1, n), ancho = (VR.w - 24 - hueco * (k - 1)) / k;
      for (var i = 0; i < k; i++) g.botones.push({ x: 12 + i * (ancho + hueco), y: VR.pieY, w: ancho, h: VR.pieH });
      return g;
    }
    // (u, v) de la lámina (0 a 1, v de arriba abajo) → { tipo: "accion", a } | { tipo: "pausa" } | { tipo: "salir" } | { tipo: "otra" } | null
    // botones: las acciones del juego, de izquierda a derecha; fin: la partida ha acabado (entonces el pie es «Otra partida» y «Salir»)
    function zonaVR(u, v, botones, fin) {
      var x = u * VR.w, y = v * VR.h, g = geoVR(fin ? 2 : botones.length);
      if (dentro(g.salir, x, y)) return { tipo: "salir" };
      if (!fin && dentro(g.pausa, x, y)) return { tipo: "pausa" };
      for (var i = 0; i < g.botones.length; i++) if (dentro(g.botones[i], x, y)) return fin ? { tipo: i ? "salir" : "otra" } : { tipo: "accion", a: botones[i].a };
      return null;
    }
    // la palanca del mando derecho: st = { dir, t } (empieza en { dir: "", t: 0 }); devuelve las órdenes que salen en este fotograma ("izquierda", "derecha",
    // "arriba" o "abajo"). Se mira el eje que más se inclina; a los lados se repite (0,35 s y luego cada 0,14 s), arriba y abajo solo al inclinar. Con la palanca
    // quieta (< 0,35) se rearma. y negativo = hacia delante (como en WebXR).
    function palanca(st, x, y, dt) {
      var mx = Math.abs(x), my = Math.abs(y), dir = "";
      if (Math.max(mx, my) >= 0.6) dir = mx >= my ? (x < 0 ? "izquierda" : "derecha") : (y < 0 ? "arriba" : "abajo");
      else if (Math.max(mx, my) >= 0.35) dir = st.dir;   // histéresis
      var sale = [];
      if (dir !== st.dir) { st.dir = dir; st.t = 0.35; if (dir) sale.push(dir); }
      else if (dir === "izquierda" || dir === "derecha") { st.t -= dt; if (st.t <= 0) { st.t = 0.14; sale.push(dir); } }
      return sale;
    }
    return { VR: VR, geoVR: geoVR, zonaVR: zonaVR, palanca: palanca, ID: ID, validaJuego: validaJuego, mejor: mejor, claveLocal: claveLocal, leeLocal: leeLocal, guardaLocal: guardaLocal, rutaPartidas: rutaPartidas,
      rutaClasificacion: rutaClasificacion, validaClasificacion: validaClasificacion, nombrePuesto: nombrePuesto, textoPuesto: textoPuesto, rutaRecords: rutaRecords, semilla: semilla, fmtDuracion: fmtDuracion, fmtPuntos: fmtPuntos };
  })();
  // [puro:fin]

  function JuegosMotor(n) {
    var JP = JuegosPuro, juegos = {}, orden = [], records = {}, clasif = {}, cuerpo = null, abierto = null, vr = null, LAM = "juego-vr", mide = { n: 0, ms: 0, pintadas: 0 };
    var prefijo = ConfigPuro.prefijoApi(location.search, D && D.base);
    var almacen = null; try { almacen = window.localStorage; } catch (e) { almacen = null; }

    function el(tag, css, txt) { var x = document.createElement(tag); if (css) x.style.cssText = css; if (txt != null) x.textContent = txt; return x; }
    var BOTON = "min-height:48px;min-width:48px;padding:0 16px;border-radius:12px;border:2px solid rgba(255,255,255,0.5);background:rgba(255,255,255,0.14);color:#fff;font:600 17px system-ui,sans-serif;cursor:pointer";
    function recordDe(id) { var r = records[id] || {}; return { familia: r.familia || null, aparato: JP.leeLocal(almacen, id) }; }
    function textoRecord(id) {
      var r = recordDe(id);
      if (r.familia) return "Récord de la familia: " + JP.fmtPuntos(r.familia.puntos);
      if (r.aparato) return "Récord en este aparato: " + JP.fmtPuntos(r.aparato.puntos);
      return "Sin récord todavía";
    }
    // el récord de la familia (solo con servidor); sin servidor, sin sesión o sin red, queda el del aparato y no se dice nada en la consola
    function pideRecord(id) {
      var url = JP.rutaRecords(prefijo, id); if (!url || typeof fetch !== "function") return;
      fetch(url, { credentials: "same-origin", cache: "no-cache", headers: { accept: "application/json" } }).then(function (r) { return r.status === 200 ? r.json() : null; })
        .then(function (j) { if (j && j.juego === id) { records[id] = { familia: j.record || null, partidas: j.partidas || 0 }; pintaLista(); pintaBarra(); if (vr && vr.id === id) vr.recordTxt = textoRecord(id); } }).catch(function () {});
    }
    // la clasificación entre familias por alias (solo con servidor); sin servidor, sin sesión o sin red, no se enseña y no se dice nada
    function pideClasificacion(id) {
      var url = JP.rutaClasificacion(prefijo, id, 5);
      if (!url || typeof fetch !== "function") return Promise.resolve(null);
      return fetch(url, { credentials: "same-origin", cache: "no-cache", headers: { accept: "application/json" } }).then(function (r) { return r.status === 200 ? r.json() : null; })
        .then(function (j) { var c = JP.validaClasificacion(j, id); if (c) { clasif[id] = c; if (!abierto) pintaLista(); } return c; }).catch(function () { return null; });
    }
    // el puesto y las primeras filas dentro de `cont` (textContent siempre: el alias lo escribe quien juega)
    function pintaTabla(cont, c) {
      cont.textContent = "";
      cont.appendChild(el("p", "margin:0 0 4px;font-size:16px;font-weight:700", JP.textoPuesto(c)));
      if (!c.puestos.length) { cont.appendChild(el("p", "margin:0;font-size:14px;opacity:.8", "Todavía nadie ha puntuado.")); return; }
      var t = el("ol", "margin:0;padding:0;list-style:none;font-size:15px;text-align:left");
      c.puestos.forEach(function (f) {
        var li = el("li", "display:flex;gap:8px;padding:2px 0" + (f.es_mia ? ";font-weight:700;color:#ffe9a8" : ""));
        li.appendChild(el("span", "flex:0 0 2.2em;opacity:.85", f.puesto + ".º")); li.appendChild(el("span", "flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", JP.nombrePuesto(f)));
        li.appendChild(el("span", "flex:0 0 auto", JP.fmtPuntos(f.puntos))); t.appendChild(li);
      });
      cont.appendChild(t);
      if (c.mia && c.mia.puesto > c.puestos.length && !c.puestos.some(function (f) { return f.es_mia; })) {
        var m = el("div", "display:flex;gap:8px;padding:4px 0 0;font-weight:700;color:#ffe9a8;font-size:15px;text-align:left");
        m.appendChild(el("span", "flex:0 0 2.2em", c.mia.puesto + ".º")); m.appendChild(el("span", "flex:1 1 auto", JP.nombrePuesto(c.mia))); m.appendChild(el("span", "flex:0 0 auto", JP.fmtPuntos(c.mia.puntos)));
        cont.appendChild(m);
      }
    }
    function guarda(id, res) {
      var loc = JP.guardaLocal(almacen, id, res, new Date().toISOString()), url = JP.rutaPartidas(prefijo, id);
      if (!url || typeof fetch !== "function") return Promise.resolve({ nuevo: loc.nuevo, donde: "aparato" });
      var antes = (records[id] && records[id].familia) || null;
      return fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ puntos: res.puntos, duracion_s: res.duracion_s }) })
        .then(function (r) { return r.status === 201 ? r.json() : null; })
        .then(function (j) {
          if (!j) return { nuevo: loc.nuevo, donde: "aparato" };
          records[id] = { familia: j.record || null, partidas: j.partidas || 0 }; pintaLista();
          return { nuevo: !!j.es_record && (!antes || res.puntos > antes.puntos), donde: "familia" };
        }).catch(function () { return { nuevo: loc.nuevo, donde: "aparato" }; });
    }

    // --- la ventana «Juegos»: una tarjeta por juego con su récord y «Jugar»
    function pintaLista() {
      if (!cuerpo) return;
      cuerpo.textContent = "";
      if (!orden.length) { cuerpo.appendChild(el("p", "margin:8px 0", "No hay juegos encendidos.")); return; }
      orden.forEach(function (id) {
        var d = juegos[id], t = el("div", "padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.15)");
        t.appendChild(el("h3", "margin:0 0 4px;font-size:18px", d.titulo));
        if (d.descripcion) t.appendChild(el("p", "margin:0 0 6px;font-size:16px;line-height:1.35", d.descripcion));
        var rec = el("p", "margin:0 0 8px;font-size:15px;opacity:.85", textoRecord(id)); rec.setAttribute("data-record", id); t.appendChild(rec);
        var b = el("button", BOTON, "Jugar"); b.type = "button"; b.setAttribute("data-juega", id); b.addEventListener("click", function () { abre(id); });
        t.appendChild(b);
        if (clasif[id]) { var cl = el("div", "margin:10px 0 0;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.08)"); cl.setAttribute("data-clasificacion", id); cl.appendChild(el("h4", "margin:0 0 4px;font-size:15px;opacity:.85", "Clasificación")); var ct = el("div"); pintaTabla(ct, clasif[id]); cl.appendChild(ct); t.appendChild(cl); }
        cuerpo.appendChild(t);
      });
      cuerpo.appendChild(el("p", "margin:10px 0 0;font-size:14px;opacity:.75", "El mundo se queda en pausa mientras juegas. Sin compras ni anuncios. " +
        (prefijo ? "El récord es el de tu familia. En la clasificación, las otras familias salen con su alias si lo hicieron visible, y si no, como «Otra familia»." : "El récord se guarda en este aparato.")));
    }

    // --- la partida a pantalla completa
    function pintaBarra() {
      if (!abierto) return;
      var est = abierto.partida.estado();
      abierto.puntos.textContent = JP.fmtPuntos(est.puntos) + " puntos";
      abierto.record.textContent = textoRecord(abierto.id);
      abierto.bPausa.textContent = abierto.partida.pausada() ? "Seguir" : "Pausa";
      abierto.bPausa.setAttribute("aria-pressed", abierto.partida.pausada() ? "true" : "false");
    }
    function medidas() {
      if (!abierto) return;
      var r = abierto.area.getBoundingClientRect();
      abierto.partida.redimensiona(r.width, r.height, window.devicePixelRatio || 1);
    }
    // lo que el anfitrión da a quien crea una partida, salvo el lienzo y los botones (la época del olivo de hoy, la semilla, el movimiento reducido)
    function ctxBase() {
      var ep = null; try { var m = /[?&]epoca=([a-z]+)/.exec(location.search); ep = m ? m[1] : (Config.tablaEpocas(D.finca_id) ? Config.epocaDeFecha(Config.tablaEpocas(D.finca_id), new Date()) : null); } catch (e) { ep = null; }
      var reducido = false; try { reducido = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}
      return { epoca: ep, semilla: JP.semilla(location.search, Date.now()), reducido: reducido };
    }
    function nuevaPartida() {
      var a = abierto, d = juegos[a.id];
      if (a.partida) a.partida.libera();
      a.fin.hidden = true; a.guardado = false; a.mandos.textContent = "";
      try { a.partida = d.crea(Object.assign(ctxBase(), { lienzo: a.lienzo, mandos: a.mandos })); }
      catch (e) { a.partida = null; try { console.error("[juegos] " + a.id, e); } catch (e2) {} cierra(); return false; }
      medidas(); pintaBarra(); a.partida.pinta();
      return true;
    }
    function abre(id) {
      if (typeof VRX !== "undefined" && VRX.on) return abreVR(id);   // en VR, una lámina (C9b)
      if (abierto || !juegos[id]) return false;
      if (Ventanas.abierta()) Ventanas.cierra();
      var d = juegos[id], previo = document.activeElement;
      var capa = el("div", "position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;background:rgba(14,20,15,0.96);color:#fff;font:16px system-ui,sans-serif;" +
        "padding:max(8px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));box-sizing:border-box");
      capa.id = "juegoCapa"; capa.setAttribute("role", "dialog"); capa.setAttribute("aria-modal", "true"); capa.setAttribute("aria-label", d.titulo); capa.tabIndex = -1;
      var barra = el("div", "display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-height:52px");
      var titulo = el("h2", "margin:0;font-size:20px;flex:0 0 auto", d.titulo), puntos = el("span", "font-size:19px;font-weight:700;flex:0 0 auto"), record = el("span", "font-size:15px;opacity:.85;flex:1 1 auto");
      puntos.setAttribute("data-puntos", ""); puntos.setAttribute("aria-live", "off");
      var bPausa = el("button", BOTON, "Pausa"), bCerrar = el("button", BOTON + ";font-size:24px;padding:0 14px", "×");
      bPausa.type = "button"; bCerrar.type = "button"; bCerrar.setAttribute("aria-label", "Salir del juego y volver al olivar (Esc)"); bCerrar.title = "Volver al olivar · Esc";
      [titulo, puntos, record, bPausa, bCerrar].forEach(function (x) { barra.appendChild(x); });
      var area = el("div", "flex:1 1 auto;min-height:0;position:relative;display:flex;align-items:center;justify-content:center");
      var tela = el("canvas", "display:block;max-width:100%;max-height:100%"); tela.setAttribute("role", "img"); area.appendChild(tela);
      var mandos = el("div", "display:flex;gap:8px;justify-content:center;padding-top:8px;flex:0 0 auto");
      var ayuda = d.ayuda ? el("p", "margin:6px 0 0;font-size:14px;opacity:.75;text-align:center", d.ayuda) : null;
      var fin = el("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,14,10,0.82)"); fin.hidden = true;
      fin.setAttribute("role", "alertdialog"); fin.setAttribute("aria-live", "polite");
      area.appendChild(fin);
      capa.appendChild(barra); capa.appendChild(area); capa.appendChild(mandos); if (ayuda) capa.appendChild(ayuda);
      document.body.appendChild(capa);
      abierto = { id: id, capa: capa, area: area, lienzo: tela, mandos: mandos, fin: fin, puntos: puntos, record: record, bPausa: bPausa, previo: previo, partida: null, quitar: [], guardado: false };
      function on(x, ev, fn, op) { x.addEventListener(ev, fn, op); abierto.quitar.push(function () { x.removeEventListener(ev, fn, op); }); }
      on(bCerrar, "click", function () { cierra(); });
      on(bPausa, "click", function () { alternaPausa(); });
      // el teclado, mientras está abierto, es del juego: se coge en la fase de captura y no llega al paseo, al HUD ni a las otras teclas
      on(window, "keydown", function (ev) {
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        ev.stopImmediatePropagation();
        if (ev.code === "Escape") { ev.preventDefault(); cierra(); return; }
        if (ev.code === "KeyP") { ev.preventDefault(); if (!ev.repeat) alternaPausa(); return; }
        var t = ev.target && ev.target.tagName;
        if (t === "BUTTON" && (ev.code === "Enter" || ev.code === "Space" || ev.code === "NumpadEnter")) return;   // Intro sobre un botón lo pulsa
        if (abierto.partida && !abierto.fin.hidden) return;
        if (abierto.partida && abierto.partida.tecla(ev.code)) ev.preventDefault();
      }, true);
      on(window, "resize", medidas);
      on(document, "visibilitychange", function () { if (document.hidden && abierto && abierto.partida && !abierto.partida.pausada() && !abierto.partida.estado().fin) alternaPausa(); });
      Pausa.pon("juegos");
      if (!nuevaPartida()) return false;
      capa.focus({ preventScroll: true });
      if (!records[id]) pideRecord(id);
      return true;
    }

    // ---------- el juego en VR (C9b): una lámina (Laminas, 02d) delante, a la altura de los ojos y anclada al mundo. El mundo NO se pausa (sigue dibujándose alrededor);
    // la lámina pinta con la función del juego (pintaEn) solo cuando cambia su firma. Mandos: el rayo con el gatillo toca las zonas (alTocar), la palanca derecha
    // (VRX.captura, que 29_vr.js lee en lugar del giro y el teletransporte) mueve, gira y suelta, B pausa y pulsar la palanca sale.
    function ofrecidosVR() { return orden.filter(function (id) { var d = juegos[id]; return d && d.vr && d.vr.botones && d.vr.botones.length; }); }
    function rrect(cx, x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
    function botonVR(cx, r, txt, tam, relleno) {
      cx.fillStyle = relleno || "rgba(255,255,255,0.14)"; rrect(cx, r.x, r.y, r.w, r.h, 18); cx.fill(); cx.lineWidth = 3; cx.strokeStyle = "rgba(255,255,255,0.55)"; cx.stroke();
      cx.fillStyle = "#fff"; cx.font = "700 " + tam + "px system-ui, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText(txt, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }
    function pintaVR(cx, w, h) {
      var v = vr; if (!v) return;
      var V = JP.VR, p = v.partida, est = p.estado(), fin = est.fin, g = JP.geoVR(fin ? 2 : v.def.vr.botones.length);
      cx.fillStyle = "#0e140f"; cx.fillRect(0, 0, w, h);
      cx.textBaseline = "middle"; cx.textAlign = "left"; cx.fillStyle = "#fff"; cx.font = "700 40px system-ui, sans-serif"; cx.fillText(v.def.titulo, 24, 38);
      cx.font = "700 36px system-ui, sans-serif"; cx.fillStyle = "#ffe9a8"; cx.fillText(JP.fmtPuntos(est.puntos), 24, 82);
      cx.font = "600 28px system-ui, sans-serif"; cx.fillStyle = "#cfdccb"; cx.fillText(v.recordTxt, 190, 84);
      if (!fin) botonVR(cx, g.pausa, p.pausada() ? "Seguir" : "Pausa", 32);
      botonVR(cx, g.salir, "Salir", 32);
      cx.save(); cx.beginPath(); cx.rect(0, V.tabY, w, V.tabH); cx.clip(); cx.translate(0, V.tabY); p.pintaEn(cx, w, V.tabH); cx.restore();
      if (fin) {
        var r = p.resultado(); cx.fillStyle = "rgba(10,14,10,0.86)"; rrect(cx, 80, V.tabY + 200, w - 160, 330, 24); cx.fill();
        cx.textAlign = "center"; cx.fillStyle = "#fff"; cx.font = "700 46px system-ui, sans-serif"; cx.fillText("Se acabó la partida", w / 2, V.tabY + 270);
        cx.font = "700 52px system-ui, sans-serif"; cx.fillStyle = "#ffe9a8"; cx.fillText(JP.fmtPuntos(r.puntos) + " puntos", w / 2, V.tabY + 350);
        cx.font = "600 30px system-ui, sans-serif"; cx.fillStyle = "#e8eee4"; cx.fillText("en " + JP.fmtDuracion(r.duracion_s), w / 2, V.tabY + 410); cx.fillText(v.mensaje, w / 2, V.tabY + 470);
        botonVR(cx, g.botones[0], "Otra partida", 34); botonVR(cx, g.botones[1], "Salir", 34);
      } else v.def.vr.botones.forEach(function (b, i) { botonVR(cx, g.botones[i], b.t, 36); });
      cx.textAlign = "center"; cx.font = "600 24px system-ui, sans-serif"; cx.fillStyle = "#a9bba5"; cx.fillText(v.def.vr.ayuda || "", w / 2, V.ayudaY + 16);
    }
    function firmaVR() { var v = vr; return v ? v.partida.firma() + "|" + v.mensaje + "|" + v.recordTxt : ""; }
    function nuevaVR() {
      var v = vr, d = v.def;
      if (v.partida) v.partida.libera();
      v.guardado = false; v.mensaje = ""; v.recordTxt = textoRecord(v.id);
      try { v.partida = d.crea(Object.assign(ctxBase(), { lienzo: null, mandos: null, vr: true })); } catch (e) { v.partida = null; try { console.error("[juegos] " + v.id, e); } catch (e2) {} return false; }
      return true;
    }
    function zonaTocada(z) {
      var v = vr; if (!v || !z) return;
      if (z.tipo === "salir") cierraVR();
      else if (z.tipo === "otra") nuevaVR();
      else if (z.tipo === "pausa") alternaPausaVR();
      else if (z.tipo === "accion") v.partida.accion(z.a);
    }
    function alternaPausaVR() { var v = vr; if (!v || !v.partida || v.partida.estado().fin) return; v.partida.pausa(!v.partida.pausada()); }
    function abreVR(id) {
      var d = juegos[id]; if (!d || !d.vr || !d.vr.botones || typeof VRX === "undefined" || !VRX.on || typeof Laminas === "undefined") return false;
      if (vr) cierraVR();
      if (abierto) cierra();
      var v = { id: id, def: d, partida: null, guardado: false, mensaje: "", recordTxt: textoRecord(id), pal: { dir: "", t: 0 } };
      vr = v;
      if (!nuevaVR()) { vr = null; return false; }
      var ok = Laminas.abre({ id: LAM, nombre: "juegoVR", ancho: JP.VR.w / 800, alto: JP.VR.h / 800, w: JP.VR.w, h: JP.VR.h, modo: "vr", bajo: { vr: 0.15 },
        pinta: function (cx, w, h) { pintaVR(cx, w, h); }, firma: firmaVR,
        alTocar: function (u, vv) { zonaTocada(JP.zonaVR(u, vv, v.def.vr.botones, v.partida && v.partida.estado().fin)); return true; },
        alCierra: function () {
          try { if (v.partida) v.partida.libera(); } catch (e) {}
          if (vr === v) { vr = null; VRX.captura = null; }
          if (typeof PanelVR !== "undefined") PanelVR.repinta();
        } });
      if (!ok) { if (vr === v) vr = null; try { v.partida.libera(); } catch (e) {} return false; }
      VRX.captura = {
        palanca: function (x, y, dt) { if (vr !== v || !v.partida) return; JP.palanca(v.pal, x, y, dt).forEach(function (o) { var a = v.def.vr.palanca && v.def.vr.palanca[o]; if (a) v.partida.accion(a); }); },
        boton: function (k) { if (vr !== v) return false; if (k === "B") { alternaPausaVR(); return true; } if (k === "palanca") { cierraVR(); return true; } return false; }
      };
      if (typeof PanelVR !== "undefined") { PanelVR.cierra(); PanelVR.repinta(); }
      if (!records[id]) pideRecord(id);
      return true;
    }
    function cierraVR() { return Laminas.cierra(LAM, "cerrada"); }
    // cada fotograma en VR (fase «mundo»: el mundo no está en pausa): avanza la partida y, si cambió lo que se ve, repinta la lámina (la textura solo se sube con firma nueva)
    function turnoVR(dt) {
      var v = vr; if (!v || !v.partida) return;
      v.partida.actualiza(dt);
      if (v.partida.estado().fin && !v.guardado) {
        v.guardado = true; v.mensaje = "Guardando…";
        guarda(v.id, v.partida.resultado()).then(function (g) { if (vr === v) v.mensaje = (g.nuevo ? "¡Récord nuevo! " : "") + textoRecord(v.id); });
      }
      Laminas.repinta(LAM);
    }
    function alternaPausa() { if (!abierto || !abierto.partida || abierto.partida.estado().fin) return; abierto.partida.pausa(!abierto.partida.pausada()); pintaBarra(); }
    function cierra() {
      if (!abierto) return false;
      var a = abierto; abierto = null;
      try { if (a.partida) a.partida.libera(); } catch (e) {}
      a.quitar.splice(0).forEach(function (fn) { try { fn(); } catch (e) {} });
      if (a.capa.parentNode) a.capa.parentNode.removeChild(a.capa);
      Pausa.quita("juegos");
      if (a.previo && a.previo.focus && document.contains(a.previo)) { try { a.previo.focus({ preventScroll: true }); } catch (e) {} }
      pintaLista();
      return true;
    }
    function acaba() {
      var a = abierto, res = a.partida.resultado(); a.guardado = true;
      a.fin.textContent = "";
      var c = el("div", "max-width:360px;margin:12px;padding:20px;border-radius:16px;background:#22301f;border:2px solid rgba(255,255,255,0.35);text-align:center");
      c.appendChild(el("h3", "margin:0 0 10px;font-size:24px", "Se acabó la partida"));
      c.appendChild(el("p", "margin:0 0 6px;font-size:22px;font-weight:700", JP.fmtPuntos(res.puntos) + " puntos"));
      c.appendChild(el("p", "margin:0 0 12px;font-size:16px;opacity:.85", "en " + JP.fmtDuracion(res.duracion_s)));
      var linea = el("p", "margin:0 0 16px;font-size:17px", "Guardando…"); c.appendChild(linea);
      var puesto = el("div", "margin:0 0 14px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.08)"); puesto.setAttribute("data-clasificacion", a.id); puesto.hidden = true; c.appendChild(puesto);
      var otra = el("button", BOTON + ";margin:4px", "Otra partida"), volver = el("button", BOTON + ";margin:4px", "Volver al olivar");
      otra.type = "button"; volver.type = "button"; otra.addEventListener("click", function () { if (abierto === a) nuevaPartida(); }); volver.addEventListener("click", function () { cierra(); });
      c.appendChild(otra); c.appendChild(volver); a.fin.appendChild(c); a.fin.hidden = false; otra.focus({ preventScroll: true });
      guarda(a.id, res).then(function (g) {
        linea.textContent = (g.nuevo ? "¡Récord nuevo! " : "") + textoRecord(a.id);
        if (abierto === a) pintaBarra();
        return pideClasificacion(a.id);
      }).then(function (cl) { if (cl && abierto === a) { pintaTabla(puesto, cl); puesto.hidden = false; } });
    }
    // la fase «pausa» (solo con el mundo en pausa): avanza la partida y la pinta si cambió
    function turno(dt) {
      if (!abierto || !abierto.partida) return;
      var t0 = performance.now(), p = abierto.partida;
      if (p.actualiza(dt)) { if (p.pinta()) mide.pintadas++; pintaBarra(); }
      if (p.estado().fin && !abierto.guardado) acaba();
      mide.n++; mide.ms += performance.now() - t0;
    }

    n.on("juego:ofrece", function (d) {
      var e = JP.validaJuego(d); if (e.length) { try { console.warn("[juegos] juego no válido: " + e.join("; ")); } catch (er) {} return; }
      if (!juegos[d.id]) orden.push(d.id);
      juegos[d.id] = d; pintaLista();
    });
    n.on("juego:retira", function (d) {
      var id = d && d.id; if (!juegos[id]) return;
      if (abierto && abierto.id === id) cierra();
      delete juegos[id]; orden = orden.filter(function (x) { return x !== id; }); pintaLista();
    });
    n.on("vr:entra", function () { cierra(); });
    n.on("vr:sale", function () { if (vr) cierraVR(); });
    if (typeof PanelVR !== "undefined") {   // la fila «Juegos» de la pestaña Mundo del panel VR: un botón por juego que sabe jugarse en VR
      n.limpia(PanelVR.filas("mundo", { id: "juegos", orden: 60, alto: 88, visible: function () { return ofrecidosVR().length > 0; },
        pinta: function (cx, y, W, h) { h.fila("Juegos", y); },
        botones: function (b, y) {
          var ids = ofrecidosVR(), k = Math.max(1, ids.length), w = (470 - 12 * (k - 1)) / k;
          ids.forEach(function (id, i) { var on = !!(vr && vr.id === id); b("juego:" + id, 420 + i * (w + 12), y, w, 64, on ? "Cerrar" : juegos[id].titulo, function () { if (on) cierraVR(); else abreVR(id); }, on); });
        },
        firma: function () { return ofrecidosVR().join(",") + "|" + (vr ? vr.id : ""); } }));
    }
    n.limpia(Ventanas.registra("juegos", { titulo: "Juegos", construye: function (cu) { cuerpo = cu; pintaLista(); } }));
    // al abrir la ventana se pide el récord de la familia (solo con servidor)
    if (cuerpo && window.MutationObserver && cuerpo.parentNode) {
      var mo = new MutationObserver(function () { if (!cuerpo.parentNode.hidden) orden.forEach(function (id) { pideRecord(id); pideClasificacion(id); }); });
      mo.observe(cuerpo.parentNode, { attributes: true, attributeFilter: ["hidden"] }); n.limpia(function () { mo.disconnect(); });
    }
    n.limpia(Hud.icono({ id: "juegos", ico: "🎲", txt: "Juegos", tecla: "J", prio: 2, ventana: "juegos" }));
    n.limpia(Teclas.registra("KeyJ", function () { if (typeof VRX !== "undefined" && VRX.on) return false; Hud.alterna("juegos", null); }, "juegos"));
    n.limpia(function () { cierra(); if (vr) cierraVR(); cuerpo = null; });
    window.__juegos = function () {
      return { juegos: orden.slice(), abierto: abierto ? abierto.id : null, pausaMundo: Pausa.activa(), estado: abierto && abierto.partida ? abierto.partida.estado() : null,
        vr: vr ? { id: vr.id, estado: vr.partida ? vr.partida.estado() : null, pausada: !!(vr.partida && vr.partida.pausada()), lamina: Laminas.info(LAM) } : null,
        ofrecidosVR: ofrecidosVR(), tocaVR: function (u, v) { return vr ? zonaTocada(JP.zonaVR(u, v, vr.def.vr.botones, vr.partida.estado().fin)) : null; },
        msPorCuadro: mide.n ? mide.ms / mide.n : 0, cuadros: mide.n, pintadas: mide.pintadas, prefijo: prefijo, clasificacion: clasif, record: abierto ? recordDe(abierto.id) : null,
        reinicia: function () { mide.n = 0; mide.ms = 0; mide.pintadas = 0; } };
    };
    n.limpia(function () { try { delete window.__juegos; } catch (e) { window.__juegos = undefined; } });
    n.emite("juego:pide", {});
    return { abre: abre, cierra: cierra, turno: turno, turnoVR: turnoVR, abreVR: abreVR, cierraVR: cierraVR, abierto: function () { return abierto ? abierto.id : null; } };
  }

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?juegos=0 lo apaga; ?juegos=1 lo enciende.
  Componentes.registra({
    id: "juegos", version: 1,
    consume: ["Hud", "Ventanas", "Teclas", "VRX", "Laminas", "PanelVR"],
    expone: [],
    eventos: { escucha: ["juego:ofrece", "juego:retira", "vr:entra", "vr:sale"], emite: ["juego:pide"] },
    bandera: { defecto: true, url: "juegos" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // nada en la escena 3D: un canvas 2D por encima y el mundo en pausa (sin render) mientras se juega
    fases: { pausa: 0, mundo: 0 },
    monta: function (n) { return JuegosMotor(n); },
    actualiza: { pausa: function (dt, t, api) { api.turno(dt); }, mundo: function (dt, t, api) { api.turnoVR(dt); } },
    libera: function (api) { if (api) api.cierra(); }
  });

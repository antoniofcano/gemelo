// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Movibles
// Consume: 03_escena (visor)
// ===============================================================================
  // ---------- ventanas flotantes que se pueden mover (UX-del-juego §6): el chat, su burbuja y el minimapa se arrastran por su barra, recuerdan su sitio por
  // forma de pantalla (escritorio, vertical, horizontal) y nunca se quedan encima de los controles (cruceta, barra, estado, «Pasear aquí»): si caen allí,
  // se apartan al hueco libre más cercano. Sin arrastrar (WCAG 2.5.7): flechas e Inicio desde el agarre y «Llevar a…» con las cuatro esquinas.
  // Regla 12: el arrastre son Pointer Events del navegador (≈ 30 líneas). @neodrag/vanilla (lo que proponía UX §7) no evita varios rectángulos a la vez
  // —esa lógica es la que hay que escribir de todos modos—, añadiría una dependencia y una importación dinámica que la salida artefacto (un solo HTML, sin servidor) no puede resolver.
  // [puro:inicio]
  // El cálculo, sin DOM (lo evalúa en Node pruebas/guardianes/movibles.test.js): rectángulos {x, y, w, h} en píxeles del contenedor.
  var MoviblesPuro = (function () {
    var HUECO = 6, SEPARA = 4;
    function seCruzan(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
    function engorda(r, m) { return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }; }
    function marg(mg) { mg = mg || {}; return { t: mg.t || 0, b: mg.b || 0, l: mg.l || 0, r: mg.r || 0 }; }
    // t: {w, h} lo que ocupa la ventana; W, H: el contenedor; mg: márgenes de zona segura. Lo deja dentro, con 6 px de aire
    function limita(t, x, y, W, H, mg) {
      mg = marg(mg);
      var xmax = Math.max(mg.l + HUECO, W - mg.r - t.w - HUECO), ymax = Math.max(mg.t + HUECO, H - mg.b - t.h - HUECO);
      return { x: Math.max(mg.l + HUECO, Math.min(xmax, x)), y: Math.max(mg.t + HUECO, Math.min(ymax, y)) };
    }
    // el sitio libre más cercano a (x, y) fuera de las zonas (que ya vienen con su margen): prueba encima, debajo y a los lados de cada zona y una rejilla de reserva.
    // Devuelve {x, y, libre}; libre=false si no hay hueco en ningún sitio (entonces deja la ventana donde la pidieron, dentro de los límites)
    function libre(t, x, y, zonas, W, H, mg) {
      var p = limita(t, x, y, W, H, mg);
      function ok(q) { var r = { x: q.x, y: q.y, w: t.w, h: t.h }; return zonas.every(function (z) { return !seCruzan(r, z); }); }
      if (ok(p)) return { x: p.x, y: p.y, libre: true };
      var cand = [], i, gx, gy;
      zonas.forEach(function (z) { cand.push(limita(t, p.x, z.y - t.h - SEPARA, W, H, mg), limita(t, p.x, z.y + z.h + SEPARA, W, H, mg), limita(t, z.x - t.w - SEPARA, p.y, W, H, mg), limita(t, z.x + z.w + SEPARA, p.y, W, H, mg)); });
      for (gy = 0; gy <= 1.001; gy += 0.125) for (gx = 0; gx <= 1.001; gx += 0.125) cand.push(limita(t, gx * W, gy * H, W, H, mg));
      cand = cand.filter(ok);
      if (!cand.length) return { x: p.x, y: p.y, libre: false };
      var mejor = cand[0], dm = Infinity, d;
      for (i = 0; i < cand.length; i++) { d = Math.hypot(cand[i].x - p.x, cand[i].y - p.y); if (d < dm) { dm = d; mejor = cand[i]; } }
      return { x: mejor.x, y: mejor.y, libre: true };
    }
    // la forma de pantalla, que decide qué sitio guardado vale: lo que vale en vertical no vale al girar
    function forma(W, H, tactil) { return !tactil ? "escritorio" : W >= H ? "horizontal" : "vertical"; }
    function clave(nombre, f) { return "gemelo." + nombre + ".pos." + f; }
    // guardado en fracciones del contenedor; almacen es un Storage (o algo con setItem/getItem/removeItem) o null. Nunca lanza
    function guarda(almacen, nombre, f, x, y, W, H) {
      if (!almacen || !(W > 0) || !(H > 0)) return false;
      try { almacen.setItem(clave(nombre, f), JSON.stringify({ fx: Math.round(x / W * 10000) / 10000, fy: Math.round(y / H * 10000) / 10000 })); return true; } catch (e) { return false; }
    }
    function lee(almacen, nombre, f, W, H) {
      if (!almacen) return null;
      try {
        var g = JSON.parse(almacen.getItem(clave(nombre, f)));
        if (!g || typeof g.fx !== "number" || typeof g.fy !== "number" || !isFinite(g.fx) || !isFinite(g.fy)) return null;
        return { x: g.fx * W, y: g.fy * H };
      } catch (e) { return null; }
    }
    function olvida(almacen, nombres) {
      if (!almacen) return false;
      try { nombres.forEach(function (n) { ["escritorio", "vertical", "horizontal"].forEach(function (f) { almacen.removeItem(clave(n, f)); }); }); return true; } catch (e) { return false; }
    }
    // «Llevar a…»: ai arriba-izquierda, ad arriba-derecha, bi abajo-izquierda, bd abajo-derecha (pegada al borde; libre() la aparta de lo que tape)
    function esquina(cual, t, W, H, mg) { return limita(t, cual.charAt(1) === "i" ? 0 : W, cual.charAt(0) === "a" ? 0 : H, W, H, mg); }
    // flechas (16 px; con Mayús, 64 px); null si la tecla no mueve. Inicio lo resuelve quien llama (es su sitio de partida)
    function mueve(tecla, mayus, x, y) {
      var d = mayus ? 64 : 16;
      if (tecla === "ArrowLeft") return { x: x - d, y: y }; if (tecla === "ArrowRight") return { x: x + d, y: y };
      if (tecla === "ArrowUp") return { x: x, y: y - d }; if (tecla === "ArrowDown") return { x: x, y: y + d };
      return null;
    }
    return { HUECO: HUECO, seCruzan: seCruzan, engorda: engorda, limita: limita, libre: libre, forma: forma, clave: clave, guarda: guarda, lee: lee, olvida: olvida, esquina: esquina, mueve: mueve };
  })();
  // [puro:fin]

  var Movibles = (function () {
    var registro = [], SEL_RESPALDO = ".pad-mov, .pad-acc, #hudBarra, #hudEstado, #bPasear, .pad, .t-barra, #tIns, #norte", zonasEl = null, avisoEl = null, tAvisa = 0, cola = 0;
    function almacen() { try { return window.localStorage; } catch (e) { return null; } }
    function cont(m) { return m.el.parentElement || document.body; }
    function medidas(c) {
      var cs = getComputedStyle(c), n = function (v) { return parseFloat(cs.getPropertyValue(v)) || 0; };
      return { W: c.clientWidth, H: c.clientHeight, mg: { t: n("--sa-t"), b: n("--sa-b"), l: n("--sa-l"), r: n("--sa-r") } };
    }
    function tactil() { try { return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (e) { return false; } }
    function visible(el) { return !el.hidden && el.getClientRects().length > 0; }
    function relativo(r, c) { var cr = c.getBoundingClientRect(); return { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height }; }
    function tam(m) { return { w: m.el.offsetWidth, h: m.el.offsetHeight }; }
    // lo que una ventana flotante nunca tapa: Hud.zonasProhibidas() (31_hud.js) si existe; si no, los selectores de respaldo. Más el resto de flotantes visibles
    function zonas(m, soloFijas) {
      var c = cont(m), z = [];
      if (typeof Hud !== "undefined" && Hud && typeof Hud.zonasProhibidas === "function") { try { z = Hud.zonasProhibidas().slice(); } catch (e) { z = []; } }
      else Array.prototype.forEach.call(c.ownerDocument.querySelectorAll(SEL_RESPALDO), function (el) { if (c.contains(el) && visible(el)) z.push(relativo(el.getBoundingClientRect(), c)); });
      if (!soloFijas) registro.forEach(function (o) { if (o !== m && o.el.parentElement === c && visible(o.el)) z.push(relativo(o.el.getBoundingClientRect(), c)); });
      return z.map(function (r) { return MoviblesPuro.engorda(r, MoviblesPuro.HUECO); });
    }
    function situa(m, q) { m.el.style.left = Math.round(q.x) + "px"; m.el.style.top = Math.round(q.y) + "px"; }
    // primero evitando también a los otros flotantes; en una pantalla pequeña puede no haber hueco para todos, y entonces solo mandan los controles (cruceta, barra, estado)
    function libreEn(m, x, y) {
      var d = medidas(cont(m)), q = MoviblesPuro.libre(tam(m), x, y, zonas(m), d.W, d.H, d.mg);
      return q.libre ? q : MoviblesPuro.libre(tam(m), x, y, zonas(m, true), d.W, d.H, d.mg);
    }
    function avisa(txt) {
      if (typeof Hud !== "undefined" && Hud && typeof Hud.aviso === "function") { Hud.aviso(txt, 2500); return; }
      var c = registro.length ? cont(registro[0]) : document.body;
      if (!avisoEl || avisoEl.parentElement !== c) { avisoEl = document.createElement("div"); avisoEl.setAttribute("role", "status"); avisoEl.style.cssText = "position:absolute;left:50%;top:48px;transform:translateX(-50%);z-index:40;max-width:calc(100% - 24px);padding:5px 12px;border-radius:99px;font:13px system-ui,sans-serif;color:#fff;background:rgba(16,20,24,0.88);pointer-events:none"; c.appendChild(avisoEl); }
      avisoEl.textContent = txt; avisoEl.hidden = false; clearTimeout(tAvisa); tAvisa = setTimeout(function () { avisoEl.hidden = true; }, 2500);
    }
    function muestraZonas(m, ver) {
      if (zonasEl) { zonasEl.remove(); zonasEl = null; }
      if (!ver) return;
      var c = cont(m); zonasEl = document.createElement("div"); zonasEl.setAttribute("aria-hidden", "true"); zonasEl.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:29";
      zonas(m).forEach(function (z) { var d = document.createElement("div"); d.style.cssText = "position:absolute;left:" + z.x + "px;top:" + z.y + "px;width:" + z.w + "px;height:" + z.h + "px;border:2px dashed #e5484d;background:rgba(229,72,77,0.12);border-radius:12px"; zonasEl.appendChild(d); });
      c.appendChild(zonasEl);
    }
    function formaAhora(m) { var d = medidas(cont(m)); return MoviblesPuro.forma(d.W, d.H, tactil()); }
    function guardaPos(m) { var d = medidas(cont(m)); MoviblesPuro.guarda(almacen(), m.nombre, MoviblesPuro.forma(d.W, d.H, tactil()), m.el.offsetLeft, m.el.offsetTop, d.W, d.H); }
    function defecto(m) {
      var d = medidas(cont(m)), t = tam(m), q = m.opc.defecto ? m.opc.defecto({ W: d.W, H: d.H, mg: d.mg, w: t.w, h: t.h, tactil: tactil() }) : null;
      return q || { x: d.mg.l + 10, y: d.H - d.mg.b - t.h - 10 };
    }
    // sitio guardado para esta forma de pantalla (o el de partida), y luego al hueco libre más cercano. Hay que llamarla con la ventana ya visible (si no, no tiene medidas)
    function coloca(m) {
      if (!visible(m.el)) return false;
      var d = medidas(cont(m)), g = MoviblesPuro.lee(almacen(), m.nombre, MoviblesPuro.forma(d.W, d.H, tactil()), d.W, d.H), q = g || defecto(m), l = libreEn(m, q.x, q.y);
      situa(m, l); m.forma = MoviblesPuro.forma(d.W, d.H, tactil()); return true;
    }
    function llevaA(m, cual) {
      var d = medidas(cont(m)), t = tam(m), q = cual === "defecto" ? defecto(m) : MoviblesPuro.esquina(cual, t, d.W, d.H, d.mg), l = libreEn(m, q.x, q.y);
      situa(m, l); guardaPos(m);
    }
    function hazMovible(el, asa, nombre, alClic, opc) {
      var m = { el: el, asa: asa, nombre: nombre, alClic: alClic, opc: opc || {}, forma: "" }, a = null;
      registro = registro.filter(function (o) { return o.el !== el; }); registro.push(m);
      if (getComputedStyle(el).position === "static") el.style.position = "absolute";
      asa.style.touchAction = "none";   // solo en el asa: el resto de la ventana (la registro del chat) se sigue desplazando con el dedo
      asa.addEventListener("pointerdown", function (e) {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        var b = e.target.closest ? e.target.closest("button, a, input") : null;
        if (b && b !== asa && !b.classList.contains("agarre")) return;   // los botones de la barra (minimizar, ⋯, zoom…) no arrastran
        a = { id: e.pointerId, x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, mov: 0 };
        try { asa.setPointerCapture(e.pointerId); } catch (x) { /* sin captura el arrastre sigue mientras el puntero esté encima */ }
        e.preventDefault();
      });
      asa.addEventListener("pointermove", function (e) {
        if (!a || e.pointerId !== a.id) return;
        var dx = e.clientX - a.x, dy = e.clientY - a.y; a.mov = Math.max(a.mov, Math.hypot(dx, dy));
        if (a.mov < 4) return;
        var d = medidas(cont(m)); el.classList.add("arrastrando"); situa(m, MoviblesPuro.limita(tam(m), a.l + dx, a.t + dy, d.W, d.H, d.mg)); if (!zonasEl) muestraZonas(m, true);
      });
      function fin(e) {
        if (!a || e.pointerId !== a.id) return;
        var mov = a.mov; a = null; el.classList.remove("arrastrando"); muestraZonas(m, false);
        if (mov < 6) { if (alClic) alClic(); return; }   // un toque sin mover (< 6 px) es un clic (la burbuja se abre)
        var q = libreEn(m, el.offsetLeft, el.offsetTop);
        if (Math.abs(q.x - el.offsetLeft) > 1 || Math.abs(q.y - el.offsetTop) > 1) avisa("Recolocado para no tapar los controles");
        situa(m, q); guardaPos(m);
      }
      asa.addEventListener("pointerup", fin); asa.addEventListener("pointercancel", fin);
      asa.addEventListener("click", function (e) { if (e.detail === 0 && alClic && asa === el) alClic(); });   // con teclado (Intro o Espacio) abre; con el dedo lo decide fin()
      asa.addEventListener("keydown", function (e) {   // sin arrastrar (WCAG 2.5.7): flechas, Mayús más deprisa, Inicio al sitio de partida
        if (e.target !== asa && !(e.target.classList && e.target.classList.contains("agarre"))) return;
        var q = e.key === "Home" ? defecto(m) : MoviblesPuro.mueve(e.key, e.shiftKey, el.offsetLeft, el.offsetTop);
        if (!q) return;
        e.preventDefault(); e.stopPropagation(); situa(m, libreEn(m, q.x, q.y)); guardaPos(m);
      });
      return { coloca: function () { return coloca(m); }, llevaA: function (cual) { llevaA(m, cual); }, el: el, nombre: nombre,
        menuLlevar: function (boton) { return menuLlevar(m, boton); } };
    }
    // «Llevar a…»: el botón ⋯ de la barra abre cuatro esquinas y «Donde estaba al principio» dentro de la propia ventana
    var ESQ = [["ai", "↖ Arriba a la izquierda"], ["ad", "↗ Arriba a la derecha"], ["bi", "↙ Abajo a la izquierda"], ["bd", "↘ Abajo a la derecha"], ["defecto", "Donde estaba al principio"]];
    function menuLlevar(m, boton) {
      var menu = document.createElement("div"); menu.hidden = true; menu.setAttribute("role", "group"); menu.setAttribute("aria-label", "Llevar a…");
      menu.style.cssText = "position:absolute;right:6px;top:46px;z-index:2;width:220px;max-width:calc(100% - 12px);padding:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px;border-radius:10px;background:rgba(16,20,24,0.96);border:1px solid rgba(255,255,255,0.3);color:#fff;font:13px system-ui,sans-serif";
      ESQ.forEach(function (e) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = e[1]; b.setAttribute("data-esquina", e[0]);
        b.style.cssText = "font:inherit;color:inherit;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);border-radius:8px;min-height:44px;padding:0 6px;cursor:pointer" + (e[0] === "defecto" ? ";grid-column:1/-1" : "");
        b.addEventListener("click", function () { llevaA(m, e[0]); cierra(); var ag = m.el.querySelector(".agarre"); if (ag) ag.focus(); });
        menu.appendChild(b);
      });
      function cierra() { menu.hidden = true; boton.setAttribute("aria-expanded", "false"); }
      boton.setAttribute("aria-haspopup", "true"); boton.setAttribute("aria-expanded", "false");
      boton.addEventListener("click", function () { var ab = menu.hidden; menu.hidden = !ab; boton.setAttribute("aria-expanded", String(ab)); if (ab) menu.querySelector("button").focus(); });
      menu.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); cierra(); boton.focus(); } });
      m.el.appendChild(menu);
      return menu;
    }
    // tras un cambio de maniobra (aparece la cruceta), de ventana o de tamaño: nada flotante encima de los controles. Si la forma de pantalla cambió (se giró), vuelve
    // al sitio guardado para la nueva forma. Devuelve cuántas ventanas se han movidas
    function revisa() {
      var movidas = 0;
      registro.forEach(function (m) {
        if (!visible(m.el)) return;
        if (m.forma && m.forma !== formaAhora(m)) { coloca(m); movidas++; return; }
        var q = libreEn(m, m.el.offsetLeft, m.el.offsetTop);
        if (Math.abs(q.x - m.el.offsetLeft) > 1 || Math.abs(q.y - m.el.offsetTop) > 1) { situa(m, q); movidas++; }
      });
      if (movidas) avisa("He apartado el chat o el mapa para no tapar los controles");
      return movidas;
    }
    function pronto() { if (cola) return; cola = requestAnimationFrame(function () { cola = 0; revisa(); }); }
    // «Devolver el chat y el mapa a su sitio» (Configuración): borra lo guardado y recoloca
    function restablece() {
      MoviblesPuro.olvida(almacen(), registro.map(function (m) { return m.nombre; }));
      registro.forEach(function (m) { coloca(m); });
    }
    window.addEventListener("resize", pronto); window.addEventListener("orientationchange", pronto);
    if (typeof MutationObserver !== "undefined" && typeof visor !== "undefined" && visor) new MutationObserver(pronto).observe(visor, { attributes: true });   // la maniobra (la cruceta aparece) cambia las clases del visor
    return { hazMovible: hazMovible, revisa: revisa, restablece: restablece, coloca: function (el) { registro.forEach(function (m) { if (m.el === el) coloca(m); }); } };
  })();

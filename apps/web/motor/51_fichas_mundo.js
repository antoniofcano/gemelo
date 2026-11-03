// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02c_componentes (Bus, Componentes), 02d_laminas (Laminas), 02e_entidades (EntidadesPuro, Entidades, Usables),
//   03_escena (lienzo, camera, modo), 06_arboles (tronco), 08_marcadores (capas), 09_camara (suelta, elige), 12_paseo (persona), 15_tiempo (hace),
//   16_vida (mira), 29_vr (VRX, ficha, fichaB, PanelVR)
// Nota: Componente «fichas-mundo» (EV2-A1, ?ui=capas, apagado por defecto): en VR, la ficha de un olivo o de una baliza colgada junto a lo que describe con Laminas (encima de la copa, girándose hacia quien mira, como mucho 3), en lugar de las láminas de 29_vr que siguen a la cabeza (presentador encadenado de Usables y PanelVR.tapa). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/fichas_mundo.test.js.
// ===============================================================================
  // ---------- EV2-A1: las fichas en el mundo (doc/sistema/VIABILIDAD-INTERACCION.md §A.5, paso 2), solo con ?ui=capas (apagado por defecto).
  // En VR, la ficha de un olivo o de una baliza deja de ir pegada a la cara (las láminas ficha y fichaB de 29_vr.js, que siguen a la cabeza) y se cuelga JUNTO a lo
  // que describe: en el borde de su copa (o de su columna de luz) que da hacia quien mira, a la altura de los ojos, girándose despacio hacia él (Laminas: se
  // vuelve, no se mueve). Es OTRO PRESENTADOR de la misma ficha de Entidades (texto llano, mismas acciones): no hay modelo de datos nuevo ni sabe de olivos.
  //   · Se abre al apuntar y apretar (Usables.presentador «vr», encadenado delante del de 29_vr) o al acercarse (Usables.abierta(): la baliza a < 17 m).
  //   · Sustituye, no suma: mientras está montado, las fichas de olivo y baliza de 29_vr no salen (presentador encadenado y PanelVR.tapa). Las de otros
  //     tipos (la persona con «Ir con», la baliza oficial…) siguen en 29_vr como siempre.
  //   · Se lee: el tamaño crece con la distancia a la que se abre (FichasMundoPuro.coloca: escala = distancia / 1,5 m, entre 0,9 y 4,5 m) para que el texto
  //     no baje de 1,5° por línea al abrirla (topes de 02d_laminas.js; cifras propias sin verificar en un casco); si lo descrito está más lejos o más cerca,
  //     se pone delante, en la línea hacia él. Se pinta por encima de todo (Laminas «encima»): las hojas de la copa no la tapan (a cambio, tampoco un tronco
  //     que se cruce; por eso se cierra al alejarse: 15 m el olivo, 22 m la baliza).
  //   · Como mucho MAX = 3 vivas: la cuarta cierra la más antigua. Los botones se resaltan al apuntarlos (Laminas.apunta, desde 29_vr.js) y «Cerrar» la cierra.
  // Presupuesto (regla 6): por ficha viva, UNA lámina (1 llamada y 2 triángulos; en VR sin multiview, una por ojo) y una textura de 600 × h px (h ≤ 720:
  // ≤ 1,7 MB) sin mipmaps, liberadas enteras al cerrar (lo hace Laminas). A lo sumo 3 llamadas (6 por fotograma en VR) frente a la 1 de la ficha que sustituye.
  // Sin reloj propio: la fase «tarde» cada 0,5 s (y solo en VR) mira qué ficha hay abierta y si cambió lo que dicen las vivas.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/fichas_mundo.test.js)
  var FichasMundoPuro = (function () {
    var TIPOS = { olivo: { cierraA: 15 }, baliza: { cierraA: 22 } };   // los tipos que se cuelgan del mundo; m de la cabeza a los que se cierran
    var MAX = 3, W = 600, PX_M = 1000, HMAX = 720, REF = 1.5, DMIN = 0.9, DMAX = 4.5, MARGEN = 0.3, BAJO = 0.15, PAD = 24, BARRA = 12;
    // px a 1 mm/px (escala 1): cuerpo de letra y su interlineado. A 1,5 m (lo peor: más cerca crece el ángulo; más lejos crece la lámina) el interlineado
    // da 1,99° (título), 1,76° (destacado), 1,68° (cuerpo) y 1,53° (pie); los botones, 96 px (3,7°) con 28 px entre ellos (18,7 mm vistos a 1 m)
    var LETRA = { titulo: 40, destacado: 34, cuerpo: 32, pie: 28 }, LINEA = { titulo: 52, destacado: 46, cuerpo: 44, pie: 40 };
    var MAXL = { titulo: 2, destacado: 2, cuerpo: 6, pie: 2 }, BOTON = { h: 96, hueco: 28, porFila: 3 };
    function maneja(tipo) { return Object.prototype.hasOwnProperty.call(TIPOS, tipo); }
    function cierraA(tipo) { return maneja(tipo) ? TIPOS[tipo].cierraA : 15; }
    // dónde colgarla: o = el pie de lo descrito {x, y, z} (escena), radio (m), cab = la cabeza {x, y, z}, dirM = la dirección de la mirada horizontal {x, z} (por si no hay
    // otra dirección). Devuelve { x, y, z, dist (m a la cabeza), escala (≥ 1), junto (true: en el borde de lo descrito; false: delante, hacia él) }
    function coloca(o, radio, cab, dirM) {
      var dx = cab.x - o.x, dz = cab.z - o.z, dh = Math.hypot(dx, dz), sep = (radio > 0 ? radio : 1) + MARGEN;
      var y = Math.max(o.y + 0.8, Math.min(o.y + 3, cab.y - BAJO));   // a la altura de los ojos, sin enterrarse ni subirse lejos de lo descrito
      if (dh > sep) {
        var ux = dx / dh, uz = dz / dh, p = { x: o.x + ux * sep, y: y, z: o.z + uz * sep }, d = Math.hypot(cab.x - p.x, cab.y - p.y, cab.z - p.z);
        if (d >= DMIN && d <= DMAX) return { x: p.x, y: p.y, z: p.z, dist: d, escala: Math.max(1, d / REF), junto: true };
      }
      // demasiado lejos, demasiado cerca o dentro de la copa: delante de los ojos, en la dirección de lo descrito (o de la mirada), entre DMIN y DMAX
      var hx, hz;
      if (dh > 0.3) { hx = -dx / dh; hz = -dz / dh; } else { var ml = Math.hypot(dirM && dirM.x || 0, dirM && dirM.z || 0); hx = ml > 1e-6 ? dirM.x / ml : 0; hz = ml > 1e-6 ? dirM.z / ml : -1; }
      var dd = Math.max(DMIN, Math.min(DMAX, dh - sep > 0 ? Math.hypot(dh - sep, cab.y - y) : DMIN));
      return { x: cab.x + hx * dd, y: cab.y - BAJO, z: cab.z + hz * dd, dist: Math.hypot(dd, BAJO), escala: Math.max(1, dd / REF), junto: false };
    }
    // corta un texto en líneas de ancho px con medir(texto, px de letra, negrita) → px; a lo sumo max líneas (la última con «…» si no cabe)
    function envuelve(texto, ancho, medir, px, negrita, max) {
      var pal = String(texto == null ? "" : texto).split(/\s+/).filter(Boolean), out = [], l = "";
      for (var i = 0; i < pal.length; i++) {
        var t = l ? l + " " + pal[i] : pal[i];
        if (l && medir(t, px, negrita) > ancho) { out.push(l); l = pal[i]; } else l = t;
      }
      if (l) out.push(l);
      if (out.length > max) { out = out.slice(0, max); var u = out[max - 1]; while (u.length > 1 && medir(u + "…", px, negrita) > ancho) u = u.slice(0, -1); out[max - 1] = u + "…"; }
      return out;
    }
    // la maqueta: f = { titulo, destacado?, lineas: [texto], pie?, color?, acciones?: [{ id, txt }] }. Devuelve { w, h, x0, bloques: [{ clase, texto, x, y,
    // px, negrita }] (y = arriba de la línea), botones: [{ id, txt, x, y, w, h, cerrar? }] } en px del lienzo (1 mm/px a escala 1)
    function maqueta(f, medir) {
      var x0 = PAD + (f.color != null ? BARRA + 8 : 0), ancho = W - x0 - PAD, y = PAD, bloques = [], botones = [];
      function bloque(clase, texto, negrita, max) {
        envuelve(texto, ancho, medir, LETRA[clase], negrita, max).forEach(function (t) { bloques.push({ clase: clase, texto: t, x: x0, y: y, px: LETRA[clase], negrita: negrita }); y += LINEA[clase]; });
      }
      bloque("titulo", f.titulo || "", true, MAXL.titulo);
      if (f.destacado) bloque("destacado", f.destacado, true, MAXL.destacado);
      var quedan = MAXL.cuerpo;
      (f.lineas || []).forEach(function (t) { if (!t || quedan <= 0) return; var n0 = bloques.length; bloque("cuerpo", t, false, Math.min(2, quedan)); quedan -= bloques.length - n0; });
      if (f.pie) bloque("pie", f.pie, false, MAXL.pie);
      y += 12;
      var items = (f.acciones || []).map(function (a) { return { id: a.id, txt: a.txt }; }).concat([{ id: "cerrar", txt: "Cerrar", cerrar: true }]);
      for (var i = 0; i < items.length; i += BOTON.porFila) {
        var fila = items.slice(i, i + BOTON.porFila), bw = (W - 2 * PAD - (fila.length - 1) * BOTON.hueco) / fila.length;
        fila.forEach(function (it, k) { var b = { id: it.id, txt: it.txt, x: PAD + k * (bw + BOTON.hueco), y: y, w: bw, h: BOTON.h }; if (it.cerrar) b.cerrar = true; botones.push(b); });
        y += BOTON.h + BOTON.hueco;
      }
      y += PAD - BOTON.hueco;
      return { w: W, h: Math.min(HMAX, Math.ceil(y)), x0: x0, bloques: bloques, botones: botones };
    }
    function boton(B, x, y) { for (var i = 0; i < (B || []).length; i++) { var b = B[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b; } return null; }
    // las vivas en orden de apertura y la que se abre: cuáles hay que cerrar para no pasar de max (la más antigua primero)
    function cupo(vivas, id, max) { var l = (vivas || []).filter(function (x) { return x !== id; }); return { cierra: l.slice(0, Math.max(0, l.length - (max - 1))) }; }
    // lo que se ve (si cambia, Laminas repinta): el texto de la ficha (sin funciones) y el botón apuntado
    function sello(f, hover) {
      var a = (f.acciones || []).map(function (q) { return q.id + "|" + q.txt; }).join(";");
      return JSON.stringify([f.titulo || "", f.destacado || "", f.lineas || [], f.pie || "", f.color == null ? null : f.color, a, hover || ""]);
    }
    // las medidas para el guardián de topes (02d_laminas.js): mm por px y distancia de la vista, a la distancia d (m) a la que se abre
    function vista(d) { var k = Math.max(1, d / REF); return { mmPorPx: 1000 / PX_M * k, dist: d, lineas: LINEA }; }
    return { TIPOS: TIPOS, MAX: MAX, W: W, PX_M: PX_M, HMAX: HMAX, REF: REF, DMIN: DMIN, DMAX: DMAX, LETRA: LETRA, LINEA: LINEA, BOTON: BOTON,
      maneja: maneja, cierraA: cierraA, coloca: coloca, envuelve: envuelve, maqueta: maqueta, boton: boton, cupo: cupo, sello: sello, vista: vista };
  })();
  // [puro:fin]

  // [motor:inicio] (lo evalúa también en Node pruebas/guardianes/fichas_mundo.test.js con Laminas, Entidades y Usables de mentira)
  function FichasMundoMotor(n) {
    var P = FichasMundoPuro, E = {}, vivas = [], medidor = null, quitas = [];
    function lid(id) { return "ficha-mundo:" + id; }
    function medir(t, px, negrita) {
      if (!medidor) { var c = document.createElement("canvas"); c.width = c.height = 1; medidor = c.getContext("2d"); }   // solo para medir texto: 1 × 1 px, sin GPU
      medidor.font = (negrita ? "bold " : "") + px + "px system-ui, sans-serif"; return medidor.measureText(t).width;
    }
    function miradaH() { var e = camera.matrixWorld.elements; return { x: -e[8], z: -e[10] }; }   // hacia dónde mira la cámara, en horizontal
    function datos(f) { return { titulo: f.titulo, destacado: f.destacado, lineas: EntidadesPuro.lineas(f), pie: f.pie, color: f.color, acciones: f.acciones }; }
    function radioDe(id) { var d = Entidades.de(id), r = 1; try { if (d && d.radio) r = +d.radio(id) || 1; } catch (e) {} return r; }
    function rr(cx, x, y, w, h, r) { cx.beginPath(); if (cx.roundRect) cx.roundRect(x, y, w, h, r); else cx.rect(x, y, w, h); }
    function pinta(cx, w, h, e) {
      if (!e) return;
      var m = e.maq;
      cx.clearRect(0, 0, w, h); cx.fillStyle = "rgba(14,18,22,0.94)"; rr(cx, 0, 0, w, h, 22); cx.fill();
      if (e.d.color != null) { cx.fillStyle = "#" + ("000000" + (e.d.color || 0).toString(16)).slice(-6); rr(cx, 24, 24, 12, h - 48, 4); cx.fill(); }   // el color de su estado
      cx.textBaseline = "top"; cx.textAlign = "left";
      var COLOR = { titulo: "#ffffff", destacado: "#7fe3ff", cuerpo: "#dbe6ec", pie: "#a9b8c2" };
      m.bloques.forEach(function (b) { cx.fillStyle = COLOR[b.clase]; cx.font = (b.negrita ? "bold " : "") + b.px + "px system-ui, sans-serif"; cx.fillText(b.texto, b.x, b.y + (P.LINEA[b.clase] - b.px) / 2); });
      cx.textBaseline = "middle"; cx.textAlign = "center"; cx.font = "bold 32px system-ui, sans-serif";
      m.botones.forEach(function (b, i) {
        cx.fillStyle = e.hover === b.id ? "#4a5866" : b.cerrar ? "#2a3139" : i === 0 ? "#1d5f6b" : "#2a3139"; rr(cx, b.x, b.y, b.w, b.h, 16); cx.fill();
        if (e.hover === b.id) { cx.strokeStyle = "#7fe3ff"; cx.lineWidth = 4; rr(cx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 14); cx.stroke(); }
        cx.fillStyle = "#ffffff"; cx.fillText(b.txt, b.x + b.w / 2, b.y + b.h / 2 + 1, b.w - 16);
      });
      cx.textAlign = "left";
    }
    function lee(id, e) {   // la ficha de la entidad, ahora (en VR); null si ya no está
      var f = Entidades.existe(id) ? Entidades.ficha(id, "vr") : null; if (!f) return null;
      e.d = datos(f); e.maq = P.maqueta(e.d, medir); e.sello = P.sello(e.d, e.hover); return e;
    }
    function abre(id, origen, donde) {
      var tipo = EntidadesPuro.tipoDe(id); if (!P.maneja(tipo)) return false;
      var p = Entidades.pos(id); if (!p) return false;
      var e = { id: id, origen: origen, hover: "" }; if (!lee(id, e)) return false;
      var c = donde || P.coloca(p, radioDe(id), VRX.cab, miradaH());
      P.cupo(vivas, id, P.MAX).cierra.forEach(function (x) { Laminas.cierra(lid(x), "cupo"); });
      e.en = c; E[id] = e;
      var ok = Laminas.abre({ id: lid(id), nombre: lid(id), modo: "vr", w: e.maq.w, h: e.maq.h, ancho: e.maq.w / P.PX_M * c.escala, alto: e.maq.h / P.PX_M * c.escala,
        en: { x: c.x, y: c.y, z: c.z }, encima: true, cierraA: { vr: P.cierraA(tipo) },
        pinta: function (cx, w, h) { pinta(cx, w, h, E[id]); },
        firma: function () { return E[id] ? E[id].sello : ""; },
        alTocar: function (u, v, t) { return toca(id, t); },
        alApuntar: function (u, v, t) { apunta(id, t); },
        alCierra: function (motivo) { cerrada(id, motivo); } });
      if (!ok) { delete E[id]; return false; }
      E[id] = e; vivas = vivas.filter(function (x) { return x !== id; }).concat(id);
      return true;
    }
    function cerrada(id, motivo) {
      if (motivo === "reabierta") return;   // se vuelve a abrir con lo nuevo: no se suelta nada
      delete E[id]; vivas = vivas.filter(function (x) { return x !== id; });
      if (motivo !== "cerrada" && motivo !== "sale-vr" && Usables.elegido() === id) Usables.cierra(id, motivo);
    }
    function toca(id, t) {
      var e = E[id], b = e ? P.boton(e.maq.botones, t.x, t.y) : null;
      if (!b) return true;   // en la ficha pero fuera de los botones: el toque es suyo (no elige lo que haya detrás)
      if (b.cerrar) { Usables.cierra(id, "cerrada"); Laminas.cierra(lid(id), "cerrada"); return true; }
      Usables.usa(id, b.id); return true;
    }
    function apunta(id, t) {
      var e = E[id]; if (!e) return;
      var b = t ? P.boton(e.maq.botones, t.x, t.y) : null, h = b ? b.id : "";
      if (h === e.hover) return;
      e.hover = h; e.sello = P.sello(e.d, h); Laminas.repinta(lid(id));
    }
    // cada 0,5 s en VR: ¿hay una ficha con acciones abierta (la elegida o la baliza cercana) que aún no está colgada? ¿cambió lo que dicen las vivas?
    function tarde() {
      if (!VRX.on) return;
      var a = Usables.abierta();
      if (a && P.maneja(EntidadesPuro.tipoDe(a)) && !E[a]) abre(a, "abierta");
      vivas.slice().forEach(function (id) {
        var e = E[id]; if (!e) return;
        if (e.origen === "abierta" && a !== id && Usables.elegido() !== id) { Laminas.cierra(lid(id), "lejos"); return; }   // la baliza cercana: al salir de su radio, como antes
        var h = e.maq.h;
        if (!lee(id, e)) { Laminas.cierra(lid(id), "quitada"); return; }
        if (e.maq.h !== h) abre(id, e.origen, e.en);   // cambió de alto: se rehace en el mismo sitio
      });
    }
    // la ficha de la entidad elegida (Usables): la de olivo y baliza, aquí; la de los demás tipos, al presentador de antes (29_vr.js)
    quitas.push(Usables.presentador("vr", function (f) {
      if (!f || !P.maneja(f.tipo)) return false;
      abre(f.id, f.acciones && f.acciones.length ? "abierta" : "elegida");
      return true;
    }));
    // la ficha de botones de 29_vr (fichaB) espera mientras la abierta sea de un tipo que se cuelga del mundo
    quitas.push(PanelVR.tapa(function () { var a = Usables.abierta(); return !!(a && P.maneja(EntidadesPuro.tipoDe(a))); }));
    var api = {
      tarde: tarde,
      vivas: function () { return vivas.slice(); },
      info: function (id) { var e = E[id]; return e ? { origen: e.origen, en: e.en, hover: e.hover, alto: e.maq.h, botones: e.maq.botones.map(function (b) { return b.id; }) } : null; },
      cierra: function () { quitas.splice(0).forEach(function (q) { try { q(); } catch (e) {} }); vivas.slice().forEach(function (id) { Laminas.cierra(lid(id), "cerrada"); }); if (typeof window !== "undefined" && window.__fichasMundo === resumen) delete window.__fichasMundo; }
    };
    // pruebas (pruebas/prueba_vr_capas.js) y ?debug: qué fichas hay colgadas, dónde y qué botón se apunta
    function resumen() { return vivas.map(function (id) { var e = E[id], i = Laminas.info(lid(id)); return { id: id, origen: e.origen, junto: e.en.junto, escala: e.en.escala, pos: i.pos, w: i.w, h: i.h, hover: e.hover, botones: e.maq.botones.map(function (b) { return { id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }; }), ancho: e.maq.w / P.PX_M * e.en.escala, alto: e.maq.h / P.PX_M * e.en.escala }; }); }
    if (typeof window !== "undefined") window.__fichasMundo = resumen;
    return api;
  }
  // [motor:fin]

  Componentes.registra({
    id: "fichas-mundo", version: 1,
    consume: ["VRX", "PanelVR"],   // Laminas, Entidades, Usables y Bus son del núcleo
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: false, url: "ui", valor: "capas" },   // ?ui=capas (EV2): apagado por defecto
    presupuesto: { llamadas: 3, triangulos: 6, texturasMB: 5 },   // como mucho 3 láminas de 2 triángulos y 600 × ≤ 720 px (≤ 1,7 MB cada una), solo con fichas abiertas
    fases: { tarde: 0.5 },
    actualiza: { tarde: function (api) { if (api) api.tarde(); } },
    monta: function (n) { return FichasMundoMotor(n); },
    libera: function (api) { if (api) api.cierra(); }
  });

// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: (nada al resto de módulos)
// Consume: 02c_componentes (Bus, Componentes), 03_escena (lienzo)
// Nota: Componente «cae-la-cosecha» (ADR-0023, C9a): el primer juego casual (diseño propio del género «piezas que caen»). Solo se registra; nadie lo nombra. Se ofrece al anfitrión por el Bus y pide sus sonidos con «sonido:juego». Los trozos [puro:…] (las reglas, con semilla) y [dibujo:…] los evalúa en Node pruebas/guardianes/juego_cosecha.test.js.
// ===============================================================================
  // ---------- «Cae la cosecha» (C9a, decisiones 125 y 136; doc/sistema/JUEGOS.md): el primer juego casual. Diseño propio del género «piezas que caen»
  // (no copia de ningún juego concreto): un tablero de 7 × 12 donde caen ramas de 2 (y, pasado un rato, de 3) piezas del olivar; se mueven, se giran y
  // se dejan caer; al tocarse 3 o más iguales —en cualquier forma, con tal de que se toquen por un lado— se van al capacho, las de arriba caen y, si al
  // caer se juntan otras, cuenta como cadena (más puntos). La partida acaba cuando una rama no cabe. La caída se acelera poco a poco: 1-3 minutos.
  // Regla elegida: GRUPO CONECTADO (por los lados), no «en línea». Para abuelos y nietos es la más clara: «si se tocan tres iguales, se van»; no hay que
  // ver diagonales ni contar en fila, y una línea de tres también es un grupo, así que nadie se lleva una sorpresa en contra.
  // Piezas: aceituna verde, aceituna negra (en floración, la flor en su lugar), hoja, piedra y terrón. Cada una con su FORMA (no solo su color: óvalo de pie,
  // dos aceitunas juntas, hoja estrecha en diagonal, flor de cuatro pétalos, piedra de aristas, terrón redondeado), dibujadas con trazos en un canvas, sin
  // emoji ni fuentes de iconos: se ven igual en todos los aparatos.
  // Es un COMPONENTE (ADR-0023): se registra y nadie lo nombra. Se ofrece al anfitrión de juegos por el Bus («juego:ofrece»; si el anfitrión llega
  // después, responde a «juego:pide») y se retira al liberarse («juego:retira»). El anfitrión le da un lienzo, una caja para los botones y la época; aquí
  // solo están las reglas (CaeLaCosechaPuro, probadas en Node con semilla en pruebas/guardianes/juego_cosecha.test.js), el dibujo y los mandos. Los
  // sonidos, por el Bus («sonido:juego», que atiende el componente de sonido si está encendido).
  // [puro:inicio] (sin DOM ni THREE: lo evalúa en Node pruebas/guardianes/juego_cosecha.test.js)
  var CaeLaCosechaPuro = (function () {
    var ANCHO_TAB = 7, ALTO_TAB = 12, CADENA_MAX = 5;
    var PIEZAS = ["verde", "negra", "hoja", "flor", "piedra", "terron"];
    var NOMBRES = { verde: "aceituna verde", negra: "aceituna negra", hoja: "hoja", flor: "flor", piedra: "piedra", terron: "terrón" };
    var LETRAS = { V: 0, N: 1, H: 2, F: 3, P: 4, T: 5 };
    // tope de puntos creíbles por duración (lo mismo en apps/api/src/juegos/rutas.ts; lo comprueba el guardián): con 50 + 10 puntos por pieza como mucho
    // (cadena ×5 y grupo grande) y unas pocas piezas por segundo, una partida de verdad queda muy por debajo; solo para trampas groseras
    var TOPE = { base: 1000, porSegundo: 200 };
    var DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // orientación de la rama: 0 hacia arriba desde su pieza inicial, 1 derecha, 2 abajo, 3 izquierda
    var EPOCAS_FLOR = { boton: true, flor: true, cuajado: true };
    // las piezas de la partida según la época del olivo (de la configuración, si la trae): en floración la flor sustituye a la aceituna negra
    function tiposDeEpoca(ep) { return (EPOCAS_FLOR[ep] ? ["verde", "flor", "hoja", "piedra", "terron"] : ["verde", "negra", "hoja", "piedra", "terron"]).map(function (t) { return PIEZAS.indexOf(t); }); }
    // generador con semilla (Park-Miller, el mismo de 07_follaje.js): la misma semilla da la misma partida
    function azar(semilla) { var r = (Math.abs(Math.floor(semilla)) % 2147483646) + 1; return function () { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; }; }
    function intervalo(t) { return Math.max(0.25, 0.8 - 0.05 * Math.floor(t / 15)); }   // segundos por fila: de 0,8 a 0,25 en dos minutos y medio
    function probTrio(t) { return t >= 90 ? 0.6 : t >= 40 ? 0.3 : 0; }
    function puntosGrupo(n, cadena) { return 10 * n * Math.min(cadena, CADENA_MAX) + 10 * Math.max(0, n - 3); }
    function tope(duracion) { return TOPE.base + TOPE.porSegundo * Math.max(0, duracion); }

    function nueva(o) {
      o = o || {};
      var e = { ancho: o.ancho || ANCHO_TAB, alto: o.alto || ALTO_TAB, celdas: [], tipos: tiposDeEpoca(o.epoca), rnd: azar(o.semilla == null ? 1 : o.semilla),
        t: 0, acum: 0, puntos: 0, cadenaMax: 0, quitadas: 0, ramas: 0, fin: false, actual: null, siguiente: null, eventos: [], v: 0 };
      for (var i = 0; i < e.ancho * e.alto; i++) e.celdas.push(-1);
      e.siguiente = sortea(e); saca(e);
      return e;
    }
    function sortea(e) {
      var n = e.rnd() < probTrio(e.t) ? 3 : 2, t = [];
      for (var i = 0; i < n; i++) t.push(e.tipos[Math.floor(e.rnd() * e.tipos.length)]);
      return { t: t, x: 0, y: 0, o: 0 };
    }
    function celda(e, x, y) { return x < 0 || x >= e.ancho || y >= e.alto ? -2 : y < 0 ? -1 : e.celdas[y * e.ancho + x]; }
    function piezasDe(p) { var out = []; for (var i = 0; i < p.t.length; i++) out.push([p.x + DIR[p.o][0] * i, p.y + DIR[p.o][1] * i, p.t[i]]); return out; }
    function cabe(e, p) { return piezasDe(p).every(function (c) { return celda(e, c[0], c[1]) === -1; }); }
    function copia(p, dx, dy, o) { return { t: p.t, x: p.x + (dx || 0), y: p.y + (dy || 0), o: o == null ? p.o : o }; }
    function evento(e, tipo, datos) { var d = datos || {}; d.tipo = tipo; e.eventos.push(d); e.v++; }
    function saca(e) {
      var p = e.siguiente; p.x = Math.floor(e.ancho / 2); p.y = 0; p.o = 0;
      e.siguiente = sortea(e); e.actual = p; e.acum = 0; e.v++;
      if (!cabe(e, p)) termina(e, "lleno");
    }
    function termina(e, motivo) { if (e.fin) return; e.fin = true; e.actual = null; evento(e, "fin", { motivo: motivo }); }
    function mueve(e, dx) {
      if (e.fin || !e.actual) return false;
      var q = copia(e.actual, dx, 0); if (!cabe(e, q)) return false;
      e.actual = q; evento(e, "mueve"); return true;
    }
    // girar un cuarto de vuelta en el sentido del reloj sobre la pieza inicial; si choca, se prueba a correrla de lado (o una fila arriba)
    function gira(e) {
      if (e.fin || !e.actual) return false;
      var o = (e.actual.o + 1) % 4, prueba = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];
      for (var i = 0; i < prueba.length; i++) { var q = copia(e.actual, prueba[i][0], prueba[i][1], o); if (cabe(e, q)) { e.actual = q; evento(e, "gira"); return true; } }
      return false;
    }
    function baja(e) {
      if (e.fin || !e.actual) return false;
      var q = copia(e.actual, 0, 1); if (cabe(e, q)) { e.actual = q; e.v++; return true; }
      asienta(e); return false;
    }
    function dejaCaer(e) { if (e.fin || !e.actual) return -1; var n = 0; while (cabe(e, copia(e.actual, 0, 1))) { e.actual = copia(e.actual, 0, 1); n++; } asienta(e); return n; }
    // dónde caería la rama si se alSoltar ahora (la sombra que se dibuja)
    function sombra(e) { if (!e.actual) return null; var q = e.actual; while (cabe(e, copia(q, 0, 1))) q = copia(q, 0, 1); return q; }
    // los grupos de 3 o más piezas iguales que se tocan por un lado: [{ tipo, celdas: [[x, y], …] }]
    function grupos(e) {
      var visto = {}, out = [];
      for (var y = 0; y < e.alto; y++) for (var x = 0; x < e.ancho; x++) {
        var k = y * e.ancho + x, tp = e.celdas[k]; if (tp < 0 || visto[k]) continue;
        var pila = [[x, y]], g = []; visto[k] = true;
        while (pila.length) {
          var c = pila.pop(); g.push(c);
          for (var d = 0; d < 4; d++) {
            var nx = c[0] + DIR[d][0], ny = c[1] + DIR[d][1], nk = ny * e.ancho + nx;
            if (nx >= 0 && nx < e.ancho && ny >= 0 && ny < e.alto && !visto[nk] && e.celdas[nk] === tp) { visto[nk] = true; pila.push([nx, ny]); }
          }
        }
        if (g.length >= 3) out.push({ tipo: tp, celdas: g });
      }
      return out;
    }
    // las piezas sueltas caen hasta apoyarse (cada columna, de abajo arriba)
    function gravedad(e) {
      for (var x = 0; x < e.ancho; x++) {
        var fila = e.alto - 1;
        for (var y = e.alto - 1; y >= 0; y--) { var tp = e.celdas[y * e.ancho + x]; if (tp >= 0) { e.celdas[y * e.ancho + x] = -1; e.celdas[fila * e.ancho + x] = tp; fila--; } }
      }
    }
    // la rama se apoya: cada pieza cae por su columna; luego, los grupos se van al capacho y lo de arriba cae, en cadena
    function asienta(e) {
      var p = e.actual, cs = piezasDe(p).sort(function (a, b) { return b[1] - a[1]; }), lleno = false;
      e.actual = null; e.ramas++;
      cs.forEach(function (c) {
        var y = -1; for (var yy = e.alto - 1; yy >= 0; yy--) if (e.celdas[yy * e.ancho + c[0]] < 0) { y = yy; break; }
        if (y < 0) lleno = true; else e.celdas[y * e.ancho + c[0]] = c[2];
      });
      gravedad(e);
      evento(e, "asienta");
      var cadena = 0;
      for (;;) {
        var gs = grupos(e); if (!gs.length) break;
        cadena++;
        gs.forEach(function (g) {
          g.celdas.forEach(function (c) { e.celdas[c[1] * e.ancho + c[0]] = -1; });
          var pts = puntosGrupo(g.celdas.length, cadena); e.puntos += pts; e.quitadas += g.celdas.length;
          evento(e, "grupo", { pieza: PIEZAS[g.tipo], celdas: g.celdas, cadena: cadena, puntos: pts });
        });
        gravedad(e);
      }
      if (cadena > e.cadenaMax) e.cadenaMax = cadena;
      if (lleno) { termina(e, "lleno"); return; }
      saca(e);
    }
    // el paso del tiempo: la rama baja una fila cada intervalo (que se acorta con la partida)
    function avanza(e, dt) {
      if (e.fin) return;
      e.t += dt; e.acum += dt;
      var iv = intervalo(e.t);
      while (e.acum >= iv && !e.fin) { e.acum -= iv; baja(e); }
    }
    // una acción de quien juega: "izquierda", "derecha", "gira", "baja" (una fila) o "cae" (hasta el fondo)
    function accion(e, a) {
      if (a === "izquierda") return mueve(e, -1);
      if (a === "derecha") return mueve(e, 1);
      if (a === "gira") return gira(e);
      if (a === "baja") { e.acum = 0; return baja(e); }
      if (a === "cae") return dejaCaer(e) >= 0;
      return false;
    }
    function resultado(e) { return { puntos: e.puntos, duracion_s: Math.max(1, Math.round(e.t)), cadenaMax: e.cadenaMax, quitadas: e.quitadas, ramas: e.ramas }; }
    // para las pruebas: pone el tablero desde filas de texto (de arriba abajo; «.» vacía, V N H F P T las piezas)
    function ponTablero(e, filas) {
      var off = e.alto - filas.length;
      for (var i = 0; i < e.celdas.length; i++) e.celdas[i] = -1;
      filas.forEach(function (f, j) { for (var x = 0; x < e.ancho; x++) { var ch = f.charAt(x); e.celdas[(off + j) * e.ancho + x] = ch in LETRAS ? LETRAS[ch] : -1; } });
      e.v++;
    }
    function texto(e) {
      var L = "VNHFPT", out = [];
      for (var y = 0; y < e.alto; y++) { var s = ""; for (var x = 0; x < e.ancho; x++) { var tp = e.celdas[y * e.ancho + x]; s += tp < 0 ? "." : L.charAt(tp); } out.push(s); }
      return out;
    }
    return { ANCHO_TAB: ANCHO_TAB, ALTO_TAB: ALTO_TAB, PIEZAS: PIEZAS, NOMBRES: NOMBRES, TOPE: TOPE, CADENA_MAX: CADENA_MAX, tiposDeEpoca: tiposDeEpoca, azar: azar, intervalo: intervalo,
      probTrio: probTrio, puntosGrupo: puntosGrupo, tope: tope, nueva: nueva, piezasDe: piezasDe, cabe: cabe, grupos: grupos, gravedad: gravedad, sombra: sombra,
      avanza: avanza, accion: accion, resultado: resultado, ponTablero: ponTablero, texto: texto };
  })();
  // [puro:fin]

  // ---------- el dibujo de las piezas: formas sobrias con trazos (cada pieza con su silueta; el color ayuda, pero no es lo único que las distingue)
  // [dibujo:inicio] (lo usa también la prueba de Node con un contexto 2D de mentira: no toca el DOM)
  var CaeLaCosechaDibujo = (function () {
    var COLOR = {
      verde: { relleno: "#93b23a", borde: "#3d5214" }, negra: { relleno: "#4b2b52", borde: "#e6d7ea" }, hoja: { relleno: "#a9c2a0", borde: "#33502d" },
      flor: { relleno: "#f6f2dc", borde: "#8a7a2c" }, piedra: { relleno: "#9ea3a8", borde: "#3b3f44" }, terron: { relleno: "#a8743f", borde: "#2a1a08" }
    };
    function ovalo(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); }
    // una pieza centrada en (x, y) dentro de un hueco de radio r
    function pieza(g, nombre, x, y, r) {
      var c = COLOR[nombre]; if (!c) return;
      g.save(); g.lineWidth = Math.max(1.5, r * 0.11); g.lineJoin = "round"; g.fillStyle = c.relleno; g.strokeStyle = c.borde;
      if (nombre === "verde") {          // una aceituna de pie, con su rabillo
        ovalo(g, x, y + r * 0.08, r * 0.58, r * 0.8); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(x, y - r * 0.7); g.lineTo(x + r * 0.18, y - r * 0.98); g.stroke();
        g.fillStyle = "rgba(255,255,255,0.45)"; ovalo(g, x - r * 0.2, y - r * 0.2, r * 0.12, r * 0.24); g.fill();
      } else if (nombre === "negra") {   // dos aceitunas maduras juntas (silueta doble)
        ovalo(g, x - r * 0.3, y + r * 0.12, r * 0.42, r * 0.62, -0.35); g.fill(); g.stroke();
        ovalo(g, x + r * 0.32, y - r * 0.1, r * 0.42, r * 0.62, 0.35); g.fill(); g.stroke();
        g.fillStyle = "rgba(255,255,255,0.55)"; ovalo(g, x + r * 0.2, y - r * 0.32, r * 0.09, r * 0.17, 0.35); g.fill();
      } else if (nombre === "hoja") {    // la hoja del olivo: estrecha y larga, en diagonal, con su nervio
        g.beginPath(); g.moveTo(x - r * 0.85, y + r * 0.85);
        g.quadraticCurveTo(x + r * 0.42, y + r * 0.42, x + r * 0.85, y - r * 0.85); g.quadraticCurveTo(x - r * 0.42, y - r * 0.42, x - r * 0.85, y + r * 0.85);
        g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(x - r * 0.7, y + r * 0.7); g.lineTo(x + r * 0.7, y - r * 0.7); g.lineWidth = Math.max(1, r * 0.06); g.stroke();
      } else if (nombre === "flor") {    // la flor del olivo: cuatro pétalos en cruz y el centro amarillo
        for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2; ovalo(g, x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.42, r * 0.26, a); g.fill(); g.stroke(); }
        g.fillStyle = "#e0b62a"; g.beginPath(); g.arc(x, y, r * 0.24, 0, Math.PI * 2); g.fill(); g.stroke();
      } else if (nombre === "piedra") {  // una piedra de aristas
        var pts = [[-0.8, 0.2], [-0.45, -0.6], [0.2, -0.78], [0.82, -0.25], [0.7, 0.55], [0.05, 0.8], [-0.6, 0.62]];
        g.beginPath(); pts.forEach(function (q, j) { if (j) g.lineTo(x + q[0] * r, y + q[1] * r); else g.moveTo(x + q[0] * r, y + q[1] * r); }); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(x - r * 0.45, y - r * 0.6); g.lineTo(x - r * 0.05, y + r * 0.05); g.lineTo(x + r * 0.7, y + r * 0.55); g.lineWidth = Math.max(1, r * 0.06); g.stroke();
      } else if (nombre === "terron") {  // un terrón redondeado, de bultos, con granos
        g.beginPath();
        for (var k = 0; k <= 8; k++) { var b = k / 8 * Math.PI * 2, rr = r * (k % 2 ? 0.86 : 0.7); if (k) g.lineTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr); else g.moveTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr); }
        g.closePath(); g.fill(); g.stroke();
        g.fillStyle = c.borde; [[-0.3, -0.2], [0.25, 0.1], [-0.05, 0.35], [0.3, -0.35]].forEach(function (q) { g.beginPath(); g.arc(x + q[0] * r, y + q[1] * r, r * 0.08, 0, Math.PI * 2); g.fill(); });
      }
      g.restore();
    }
    return { COLOR: COLOR, pieza: pieza };
  })();
  // [dibujo:fin]

  // ---------- una partida en pantalla: la crea el anfitrión con su lienzo y su caja de botones; aquí, el dibujo, el teclado, el puntero y los botones
  function CaeLaCosechaPartida(ctx, suena) {
    var P = CaeLaCosechaPuro, Dib = CaeLaCosechaDibujo;
    var e = P.nueva({ semilla: ctx.semilla, epoca: ctx.epoca }), cv = ctx.lienzo, g = cv.getContext("2d");
    var W = 0, H = 0, dpr = 1, cs = 0, ox = 0, oy = 0, sucio = true, vista = -1, pausada = false, destellos = [], quitar = [];
    var pulsado = null, tPulsado = 0, REPITE_TRAS = 0.28, REPITE_CADA = 0.09;

    function on(el, ev, fn, op) { el.addEventListener(ev, fn, op); quitar.push(function () { el.removeEventListener(ev, fn, op); }); }
    function redimensiona(w, h, ratio) {
      W = Math.max(1, Math.floor(w)); H = Math.max(1, Math.floor(h)); dpr = Math.min(2, ratio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px";
      cs = Math.max(8, Math.floor(Math.min(W / (e.ancho + 2.8), (H - 8) / e.alto)));
      ox = Math.floor((W - cs * (e.ancho + 2.8)) / 2); oy = Math.floor((H - cs * e.alto) / 2); sucio = true;
    }
    function hacer(a) {
      if (pausada || e.fin) return false;
      var ok = P.accion(e, a); sucio = true; return ok;
    }
    // los sonidos (cortos y opcionales: los pone el componente de sonido si está encendido) y los destellos de lo que se va al capacho
    function atiende() {
      e.eventos.splice(0).forEach(function (ev) {
        if (ev.tipo === "grupo") {
          suena({ que: "grupo", cadena: ev.cadena });
          if (!ctx.reducido) ev.celdas.forEach(function (c) { destellos.push({ x: c[0], y: c[1], pieza: ev.pieza, t: 0 }); });
        } else if (ev.tipo === "gira" || ev.tipo === "mueve" || ev.tipo === "asienta" || ev.tipo === "fin") suena({ que: ev.tipo });
      });
    }
    // cada fotograma con el mundo en pausa (lo llama el anfitrión): avanza, repite el botón mantenido y dice si hay que repintar
    function actualiza(dt) {
      if (!pausada && !e.fin) {
        P.avanza(e, dt);
        if (pulsado) { tPulsado += dt; while (tPulsado >= REPITE_TRAS) { tPulsado -= REPITE_CADA; if (!hacer(pulsado)) break; } }
      }
      atiende();
      if (destellos.length) { destellos.forEach(function (d) { d.t += dt; }); destellos = destellos.filter(function (d) { return d.t < 0.35; }); sucio = true; }
      if (e.v !== vista) sucio = true;
      return sucio;
    }
    function texto(t, x, y, tam, color, alin) { g.font = "600 " + tam + "px system-ui, -apple-system, Segoe UI, Roboto, sans-serif"; g.fillStyle = color; g.textAlign = alin || "left"; g.textBaseline = "middle"; g.fillText(t, x, y); }
    function pinta() {
      if (!sucio) return false;
      sucio = false; vista = e.v;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      var bw = cs * e.ancho, bh = cs * e.alto, r = cs * 0.42, x, y;
      // el tablero: tierra oscura con la cuadrícula tenue y la raya de arriba (si una rama no cabe ahí, se acaba)
      g.fillStyle = "#1f2b1c"; g.fillRect(ox, oy, bw, bh);
      g.strokeStyle = "rgba(255,255,255,0.07)"; g.lineWidth = 1; g.beginPath();
      for (x = 1; x < e.ancho; x++) { g.moveTo(ox + x * cs + 0.5, oy); g.lineTo(ox + x * cs + 0.5, oy + bh); }
      for (y = 1; y < e.alto; y++) { g.moveTo(ox, oy + y * cs + 0.5); g.lineTo(ox + bw, oy + y * cs + 0.5); }
      g.stroke();
      g.strokeStyle = "rgba(230,120,90,0.75)"; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(ox, oy + cs); g.lineTo(ox + bw, oy + cs); g.stroke(); g.setLineDash([]);
      for (y = 0; y < e.alto; y++) for (x = 0; x < e.ancho; x++) { var tp = e.celdas[y * e.ancho + x]; if (tp >= 0) Dib.pieza(g, P.PIEZAS[tp], ox + (x + 0.5) * cs, oy + (y + 0.5) * cs, r); }
      // la sombra (dónde caerá) y la rama que cae
      var s = P.sombra(e);
      if (s && e.actual && s.y !== e.actual.y) P.piezasDe(s).forEach(function (c) { if (c[1] >= 0) { g.strokeStyle = "rgba(255,255,255,0.45)"; g.lineWidth = 2; g.setLineDash([4, 4]); g.strokeRect(ox + c[0] * cs + 4, oy + c[1] * cs + 4, cs - 8, cs - 8); g.setLineDash([]); } });
      if (e.actual) P.piezasDe(e.actual).forEach(function (c) { if (c[1] >= 0) { g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(ox + c[0] * cs + 1, oy + c[1] * cs + 1, cs - 2, cs - 2); Dib.pieza(g, P.PIEZAS[c[2]], ox + (c[0] + 0.5) * cs, oy + (c[1] + 0.5) * cs, r); } });
      // lo que se va al capacho: un aro que se abre
      destellos.forEach(function (d) { var k = d.t / 0.35; g.strokeStyle = "rgba(255,240,170," + (1 - k).toFixed(2) + ")"; g.lineWidth = 3; g.beginPath(); g.arc(ox + (d.x + 0.5) * cs, oy + (d.y + 0.5) * cs, r * (0.6 + k * 0.8), 0, Math.PI * 2); g.stroke(); });
      g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 2; g.strokeRect(ox - 1, oy - 1, bw + 2, bh + 2);
      // al lado: la rama siguiente
      var sx = ox + bw + cs * 0.4, tam = Math.max(16, Math.round(cs * 0.36));
      texto("Siguiente", sx, oy + tam * 0.7, tam, "#e8eee4");
      if (e.siguiente) e.siguiente.t.forEach(function (tp, i) { var cy = oy + tam * 1.5 + cs * (e.siguiente.t.length - i - 0.5); g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(sx, cy - cs / 2 + 1, cs * 1.6, cs - 2); Dib.pieza(g, P.PIEZAS[tp], sx + cs * 0.8, cy, r); });
      if (pausada && !e.fin) {
        g.fillStyle = "rgba(10,14,10,0.78)"; g.fillRect(ox, oy, bw, bh);
        texto("En pausa", ox + bw / 2, oy + bh / 2 - tam, Math.round(tam * 1.4), "#ffffff", "center");
        texto("P o «Seguir» para continuar", ox + bw / 2, oy + bh / 2 + tam * 0.8, Math.max(16, Math.round(tam * 0.8)), "#e8eee4", "center");
      }
      cv.setAttribute("aria-label", "Tablero de Cae la cosecha: " + e.puntos + " puntos" + (pausada ? ", en pausa" : "") + (e.fin ? ", partida acabada" : ""));
      return true;
    }
    // el teclado lo reparte el anfitrión (que se queda Esc y la P): flechas o WASD para mover y girar, abajo para bajar, espacio o Intro para dejar caer
    var TECLAS = { ArrowLeft: "izquierda", KeyA: "izquierda", ArrowRight: "derecha", KeyD: "derecha", ArrowUp: "gira", KeyW: "gira", KeyX: "gira",
      ArrowDown: "baja", KeyS: "baja", Space: "cae", Enter: "cae", NumpadEnter: "cae" };
    function tecla(code) { var a = TECLAS[code]; if (!a) return false; hacer(a); return true; }
    // el puntero (ratón o dedo) sobre el tablero: deslizar de lado mueve una columna por cada casilla recorrida; deslizar hacia abajo, deprisa, deja caer;
    // un toque corto sin moverse, gira
    var toque = null;
    on(cv, "pointerdown", function (ev) { if (ev.button > 0) return; toque = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: performance.now(), hechos: 0, cae: false, lejos: false }; try { cv.setPointerCapture(ev.pointerId); } catch (er) {} ev.preventDefault(); });
    on(cv, "pointermove", function (ev) {
      if (!toque || ev.pointerId !== toque.id) return;
      var dx = ev.clientX - toque.x, dy = ev.clientY - toque.y, paso = Math.max(18, cs * 0.8), quiere = Math.trunc(dx / paso);
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) toque.lejos = true;
      while (toque.hechos < quiere) { hacer("derecha"); toque.hechos++; }
      while (toque.hechos > quiere) { hacer("izquierda"); toque.hechos--; }
      if (!toque.cae && dy > cs * 2 && dy > Math.abs(dx) * 1.5 && performance.now() - toque.t < 450) { toque.cae = true; hacer("cae"); }
    });
    function alSoltar(ev) {
      if (!toque || ev.pointerId !== toque.id) return;
      if (!toque.lejos && performance.now() - toque.t < 350 && ev.type === "pointerup") hacer("gira");
      toque = null;
    }
    on(cv, "pointerup", alSoltar); on(cv, "pointercancel", alSoltar);
    cv.style.touchAction = "none";

    // los botones grandes (≥ 56 px; para quien no quiera deslizar): mantener pulsado repite mover y bajar
    var BOTONES = [
      { a: "izquierda", t: "Izquierda", d: "M15 5 L7 12 L15 19", repite: true }, { a: "gira", t: "Girar", d: "M18 12 A6 6 0 1 1 12 6 L12 3 L16 6.5 L12 10 L12 7", repite: false },
      { a: "derecha", t: "Derecha", d: "M9 5 L17 12 L9 19", repite: true }, { a: "baja", t: "Bajar", d: "M5 9 L12 16 L19 9", repite: true },
      { a: "cae", t: "Soltar", d: "M5 6 L12 13 L19 6 M5 12 L12 19 L19 12", repite: false }
    ];
    var caja = ctx.mandos;
    BOTONES.forEach(function (b) {
      var el = document.createElement("button"), svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"), ruta = document.createElementNS("http://www.w3.org/2000/svg", "path"), et = document.createElement("span");
      el.type = "button"; el.setAttribute("aria-label", b.t); el.setAttribute("data-accion", b.a);
      el.style.cssText = "flex:1 1 0;min-width:56px;max-width:120px;min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;" +
        "border-radius:14px;border:2px solid rgba(255,255,255,0.45);background:rgba(255,255,255,0.12);color:#fff;font:600 15px system-ui,sans-serif;touch-action:none;cursor:pointer;user-select:none;-webkit-user-select:none";
      svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "28"); svg.setAttribute("height", "28"); svg.setAttribute("aria-hidden", "true");
      ruta.setAttribute("d", b.d); ruta.setAttribute("fill", "none"); ruta.setAttribute("stroke", "currentColor"); ruta.setAttribute("stroke-width", "2.6"); ruta.setAttribute("stroke-linecap", "round"); ruta.setAttribute("stroke-linejoin", "round");
      svg.appendChild(ruta); et.textContent = b.t; el.appendChild(svg); el.appendChild(et); caja.appendChild(el);
      on(el, "pointerdown", function (ev) { ev.preventDefault(); hacer(b.a); if (b.repite) { pulsado = b.a; tPulsado = 0; } });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (k) { on(el, k, function () { if (pulsado === b.a) pulsado = null; }); });
      on(el, "click", function (ev) { if (ev.detail === 0) hacer(b.a); });   // con el teclado (Intro o espacio sobre el botón) no hay pointerdown
      quitar.push(function () { if (el.parentNode) el.parentNode.removeChild(el); });
    });

    return {
      redimensiona: redimensiona, actualiza: actualiza, pinta: pinta, tecla: tecla,
      pausa: function (si) { pausada = !!si; pulsado = null; sucio = true; },
      pausada: function () { return pausada; },
      estado: function () { return { puntos: e.puntos, fin: e.fin, t: e.t, cadenaMax: e.cadenaMax, piezas: e.tipos.map(function (tp) { return P.PIEZAS[tp]; }) }; },
      resultado: function () { return P.resultado(e); },
      libera: function () { quitar.splice(0).forEach(function (fn) { try { fn(); } catch (er) {} }); pulsado = null; toque = null; },
      _e: e
    };
  }

  // el manifiesto (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?cosecha=0 lo apaga.
  Componentes.registra({
    id: "cae-la-cosecha", version: 1,
    consume: [],
    expone: [],
    eventos: { escucha: ["juego:pide"], emite: ["juego:ofrece", "juego:retira", "sonido:juego"] },
    bandera: { defecto: true, url: "cosecha" },
    presupuesto: { llamadas: 0, triangulos: 0 },   // nada en la escena 3D: un canvas 2D sobre el mundo en pausa, que solo se repinta si cambia
    fases: {},
    monta: function (n) {
      var def = {
        id: "cae-la-cosecha", version: 1, titulo: "Cae la cosecha",
        descripcion: "Junta tres o más piezas iguales del olivar para echarlas al capacho. Partidas de uno a tres minutos.",
        ayuda: "Flechas o deslizar: mover · Arriba o tocar: girar · Abajo: bajar · Espacio o deslizar hacia abajo: soltar · P: pausa · Esc: salir",
        crea: function (ctx) { return CaeLaCosechaPartida(ctx, function (d) { n.emite("sonido:juego", d); }); }
      };
      n.on("juego:pide", function () { n.emite("juego:ofrece", def); });
      n.emite("juego:ofrece", def);
      return { def: def };
    },
    libera: function () { Bus.emite("juego:retira", { id: "cae-la-cosecha" }); }
  });

// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: IrA
// Consume: 02_mundo (suelo, copas), 02e_entidades (Usables), 06_arboles (tronco), 08_marcadores (pendiente),
//   12_paseo (paseando, persona, teclas, actualizaPaseo), 12b_llegada (LlegadaPuro, Llegada), 15_tiempo (meta, rumbo, hace),
//   16_vida (enQuad, quad, enDron, dron), 29_vr (VRX, ficha), 33_ajustes (Ajustes)
// ===============================================================================
  // ---------- tocar para ir andando (tanda 9): en pantalla (ratón y táctil, no en VR), a pie, un clic o un toque corto en el suelo hace que el paseante camine hasta allí.
  // No salta ni se teletransporta: gira hacia el punto y anda con el avance de siempre (la misma velocidad, pendiente, troncos y borde de la finca de actualizaPaseo, 12_paseo.js),
  // con el anillo de la llegada (Llegada, 12b_llegada.js: una sola malla ya existente) en el destino. Se cancela con cualquier tecla, la cruceta, la palanca o el quad/dron; otro toque cambia el destino.
  // Un arrastre o una pulsación larga no lo dispara. Si el toque cae sobre un olivo, una baliza o una persona, manda lo que ya hacía (elegir/ficha; 09_camara.js): aquí solo llega lo que no eligió nada.
  // Ajuste «controles.tocarIr» (Configuración → Controles; encendido); en la dirección, ?tocar=0 lo apaga y ?tocar=1 lo fuerza.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/ir_a.test.js)
  var IrAPuro = (function () {
    var LLEGA = 0.5, TOQUE_MS = 400, TOQUE_PX = { mouse: 6, pen: 8, touch: 12 }, GIRO = 3.2, ATASCO_S = 1.2, ATASCO_M = 0.15;
    // ¿un clic/toque corto (y no un arrastre ni una pulsación larga)? mov: lo más lejos (px) que se fue el puntero; ms: lo que duró
    function esToque(mov, ms, tipo) { return mov <= (TOQUE_PX[tipo] || TOQUE_PX.mouse) && ms <= TOQUE_MS; }
    // URL > ajuste > defecto (encendido): ?tocar=0 lo apaga, ?tocar=1 lo fuerza
    function activa(ajuste, busqueda) {
      var m = /[?&]tocar=([01])(?![0-9A-Za-z])/.exec(busqueda || "");
      if (m) return m[1] === "1";
      return ajuste !== false;
    }
    // rumbo (0 = norte, crece hacia el este: el del paseo) de (x, y) a (dx, dy)
    function rumbo(x, y, dx, dy) { return Math.atan2(dx - x, dy - y); }
    // diferencia más corta entre dos ángulos, en (−π, π]
    function difAng(a, b) { var d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; else if (d <= -Math.PI) d += 2 * Math.PI; return d; }
    // gira a hacia meta como mucho GIRO·dt rad
    function gira(a, meta, dt) { var d = difAng(a, meta), t = GIRO * dt; return a + (Math.abs(d) <= t ? d : (d > 0 ? t : -t)); }
    // avance 0..1: entero con el destino delante, nada si hay que girar más de ~90°, y justo lo que falta al llegar (sin pasarse)
    function avance(dist, dif, dt, vel) { var c = Math.max(0, Math.cos(dif)); return Math.min(1, dist / Math.max(1e-6, vel * dt)) * c; }
    function crea() { return { dest: null, mejor: Infinity, quieto: 0 }; }
    function ir(st, x, y) { st.dest = { x: x, y: y }; st.mejor = Infinity; st.quieto = 0; }
    function cancela(st) { st.dest = null; st.mejor = Infinity; st.quieto = 0; }
    // un paso: pos = { x, y, ang } del paseante (y = norte); devuelve { av, ang, fin } (fin: null, "llego" o "atascado") o null sin destino.
    // Atascado: andando (avance > 0,3) y sin acercarse ATASCO_M m en ATASCO_S s (un tronco, un desnivel…).
    function paso(st, pos, dt, vel) {
      if (!st.dest) return null;
      var dx = st.dest.x - pos.x, dy = st.dest.y - pos.y, dist = Math.hypot(dx, dy);
      if (dist < LLEGA) { cancela(st); return { av: 0, ang: pos.ang, fin: "llego" }; }
      var meta = rumbo(pos.x, pos.y, st.dest.x, st.dest.y), ang = gira(pos.ang, meta, dt), av = avance(dist, difAng(ang, meta), dt, vel);
      if (av > 0.3) {
        if (dist < st.mejor - ATASCO_M) { st.mejor = dist; st.quieto = 0; } else { st.quieto += dt; if (st.quieto > ATASCO_S) { cancela(st); return { av: 0, ang: ang, fin: "atascado" }; } }
      }
      return { av: av, ang: ang, fin: null };
    }
    return { LLEGA: LLEGA, TOQUE_MS: TOQUE_MS, TOQUE_PX: TOQUE_PX, GIRO: GIRO, esToque: esToque, activa: activa, rumbo: rumbo, difAng: difAng, gira: gira, avance: avance, crea: crea, ir: ir, cancela: cancela, paso: paso };
  })();
  // [puro:fin]
  var IrA = (function () {
    var st = IrAPuro.crea();
    function activo() { var a = true; try { a = Ajustes.lee("controles.tocarIr"); } catch (e) {} return IrAPuro.activa(a, location.search); }
    function cancela() { if (st.dest) { IrAPuro.cancela(st); Llegada.borra(); } }
    // un toque corto o un clic sin nada elegido debajo (09_camara.js lo llama tras Usables.toque); mov y ms, desde que bajó el puntero. Devuelve si echó a andar
    function toca(cx, cy, mov, ms, tipo) {
      if (!paseando || VRX.on || enDron || !activo() || !IrAPuro.esToque(mov, ms, tipo)) return false;
      var q = Llegada.apuntaPantalla(cx, cy); if (!q) return false;   // cielo o fuera de la finca: no pasa nada (y el anillo que hubiera sigue)
      var f = LlegadaPuro.fueraDeTroncos(q.x, q.z, copas, 0.9);      // el destino no cae dentro de un tronco
      IrAPuro.ir(st, f.x, -f.z); return true;
    }
    // desde actualizaPaseo (12_paseo.js), una vez por fotograma. manda: hay tecla, cruceta o palanca en uso → se cancela. Devuelve { av, ang } o null
    function paso(dt, manda) {
      if (!st.dest) return null;
      if (manda || enQuad || enDron || VRX.on || !paseando) { cancela(); return null; }
      var r = IrAPuro.paso(st, pp, dt, teclas.run ? 4.3 : 1.7);
      if (!r || r.fin) { Llegada.borra(); return null; }
      return r;
    }
    return { toca: toca, paso: paso, cancela: cancela, activo: activo, destino: function () { return st.dest; } };
  })();

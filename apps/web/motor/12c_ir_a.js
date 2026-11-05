// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: IrA
// Consume: 01_datos (D), 02_mundo (suelo, copas), 02e_entidades (Usables), 03_escena (scene, exag), 06_arboles (tronco), 08_marcadores (pendiente),
//   12_paseo (paseando, persona, teclas, actualizaPaseo), 12b_llegada (LlegadaPuro, Llegada), 14_historia (marca, lista),
//   15_tiempo (meta, rumbo, hace), 16_vida (enQuad, quad, enDron, dron), 29_vr (VRX, ficha), 33_ajustes (Ajustes)
// ===============================================================================
  // ---------- tocar para ir andando (tanda 9): en pantalla (ratón y táctil, no en VR), a pie, un clic o un toque corto en el suelo hace que el paseante camine hasta allí.
  // No salta ni se teletransporta: gira hacia el punto y anda con el avance de siempre (la misma velocidad, pendiente, troncos y borde de la finca de actualizaPaseo, 12_paseo.js),
  // con el anillo de la llegada (Llegada, 12b_llegada.js: una sola malla ya existente) en el destino. Se cancela con cualquier tecla, la cruceta, la palanca o el quad/dron; otro toque cambia el destino.
  // Rodea los troncos (EV2-B3): al tocar se planifica un rodeo local (IrAPuro.planifica: por cada tronco que cruza el camino recto, un punto intermedio por el lado libre; sin A* ni
  // dependencia, porque los olivos van en marco de plantación y basta con esquivar el primero que estorba y repetir en cada tramo); si no hay rodeo, va recto y, si se atasca, replanifica una vez
  // con más margen y, si tampoco, se rinde como antes (~1,2 s). Una línea de puntos (una sola THREE.Points, creada una vez, oculta sin destino) marca el camino y se acorta al avanzar.
  // Un arrastre o una pulsación larga no lo dispara. Si el toque cae sobre un olivo, una baliza o una persona, manda lo que ya hacía (elegir/ficha; 09_camara.js): aquí solo llega lo que no eligió nada.
  // Ajuste «controles.tocarIr» (Configuración → Controles; encendido); en la dirección, ?tocar=0 lo apaga y ?tocar=1 lo fuerza.
  // [puro:inicio] (sin THREE ni DOM: lo evalúa en Node pruebas/guardianes/ir_a.test.js)
  var IrAPuro = (function () {
    var LLEGA = 0.5, LLEGA_INTER = 0.7, TOQUE_MS = 400, TOQUE_PX = { mouse: 6, pen: 8, touch: 12 }, GIRO = 3.2, ATASCO_S = 1.2, ATASCO_M = 0.15;
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
    // --- rodeo local de troncos. Los troncos son copas con oliv (x, y = norte); se esquivan a R m (el paseo los empuja a 0,55 m).
    var R_TRONCO = 1.0, R_REPLAN = 1.35, TOPE_PLAN = 60, PROF_PLAN = 8, SALIDA = 0.25;
    // el primer tronco (no excluido) que el segmento a→b roza a menos de R, con su proyección delante de a. Devuelve { i, c, t } o null
    function obstaculo(a, b, copas, R, ex) {
      var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, mejor = null;
      var x0 = Math.min(a.x, b.x) - R, x1 = Math.max(a.x, b.x) + R, y0 = Math.min(a.y, b.y) - R, y1 = Math.max(a.y, b.y) + R;
      for (var i = 0; i < copas.length; i++) {
        var c = copas[i]; if (!c.oliv || ex[i] || c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
        var t = l2 > 0 ? ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2 : 0; if (t <= 0) continue; if (t > 1) t = 1;
        var ex2 = a.x + dx * t - c.x, ey2 = a.y + dy * t - c.y;
        if (ex2 * ex2 + ey2 * ey2 < R * R && (!mejor || t < mejor.t)) mejor = { i: i, c: c, t: t };
      }
      return mejor;
    }
    function libre(p, copas, r, ext) {
      if (ext && (p.x < ext[0] + 3 || p.x > ext[2] - 3 || p.y < ext[3] + 3 || p.y > ext[1] - 3)) return false;
      for (var i = 0; i < copas.length; i++) { var c = copas[i]; if (c.oliv && Math.hypot(c.x - p.x, c.y - p.y) < r) return false; }
      return true;
    }
    // camino de a a b esquivando troncos: lista de puntos que acaba en b (sin a), [b] si el recto está libre, o null si no hay rodeo
    // (más de PROF_PLAN niveles o TOPE_PLAN tramos mirados: el tope de tiempo). ext = D.ext para no salirse de la finca (opcional).
    function planifica(a, b, copas, R, ext) {
      R = R || R_TRONCO; var pts = [], n = 0;
      function tramo(p, q, prof, ex) {
        if (++n > TOPE_PLAN || prof > PROF_PLAN) return false;
        var ob = obstaculo(p, q, copas, R, ex); if (!ob) { pts.push(q); return true; }
        var dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        var lado = ((ob.c.x - p.x) * dy - (ob.c.y - p.y) * dx) > 0 ? -1 : 1;   // primero el lado contrario al que cae el tronco
        var ex2 = {}; for (var k in ex) ex2[k] = true; ex2[ob.i] = true;
        for (var v = 0; v < 2; v++) {
          var s = v ? -lado : lado, w = { x: ob.c.x + nx * s * (R + SALIDA), y: ob.c.y + ny * s * (R + SALIDA) };
          if (!libre(w, copas, 0.8, ext)) continue;
          var antes = pts.length;
          if (tramo(p, w, prof + 1, ex2) && tramo(w, q, prof + 1, ex2)) return true;
          pts.length = antes;
        }
        return false;
      }
      return tramo({ x: a.x, y: a.y }, { x: b.x, y: b.y }, 0, {}) ? pts : null;
    }
    // puntos de la línea de puntos: sobre el camino (pos → ruta → dest), cada `paso` m contados desde el destino (así no se mueven al andar y se van apagando
    // al pasar), sin el del propio destino (lo marca el anillo) ni los de menos de 0,8 m de los pies; como mucho `max`, los más cercanos al paseante
    function puntosLinea(pos, st, paso, max) {
      if (!st.dest) return [];
      var v = [{ x: pos.x, y: pos.y }].concat(st.ruta || [], [st.dest]), acum = [0], L = 0;
      for (var i = 1; i < v.length; i++) { L += Math.hypot(v[i].x - v[i - 1].x, v[i].y - v[i - 1].y); acum.push(L); }
      var out = [], j = 1, kmax = Math.floor((L - 0.8) / paso);
      for (var k = kmax; k >= 1 && out.length < max; k--) {
        var s = L - k * paso; while (j < v.length - 1 && acum[j] < s) j++;
        var l = acum[j] - acum[j - 1] || 1, f = (s - acum[j - 1]) / l;
        out.push({ x: v[j - 1].x + (v[j].x - v[j - 1].x) * f, y: v[j - 1].y + (v[j].y - v[j - 1].y) * f });
      }
      return out;
    }
    function crea() { return { dest: null, ruta: [], copas: null, ext: null, replan: 0, mejor: Infinity, quieto: 0 }; }
    // ruta: puntos intermedios (de planifica, sin el destino); copas/ext (opcionales): permiten replanificar una vez si se atasca
    function ir(st, x, y, ruta, copas, ext) { st.dest = { x: x, y: y }; st.ruta = ruta || []; st.copas = copas || null; st.ext = ext || null; st.replan = 0; st.mejor = Infinity; st.quieto = 0; }
    function cancela(st) { st.dest = null; st.ruta = []; st.copas = null; st.mejor = Infinity; st.quieto = 0; }
    // un paso: pos = { x, y, ang } del paseante (y = norte); devuelve { av, ang, fin } (fin: null, "llego" o "atascado") o null sin destino.
    // Atascado: andando (avance > 0,3) y sin acercarse ATASCO_M m en ATASCO_S s (un tronco, un desnivel…).
    function paso(st, pos, dt, vel) {
      if (!st.dest) return null;
      var inter = st.ruta.length > 0, o = inter ? st.ruta[0] : st.dest;   // el punto al que se va ahora: el siguiente del rodeo o el destino
      var dx = o.x - pos.x, dy = o.y - pos.y, dist = Math.hypot(dx, dy);
      if (inter && dist < LLEGA_INTER) { st.ruta.shift(); st.mejor = Infinity; st.quieto = 0; return { av: 0, ang: pos.ang, fin: null }; }
      if (!inter && dist < LLEGA) { cancela(st); return { av: 0, ang: pos.ang, fin: "llego" }; }
      var meta = rumbo(pos.x, pos.y, o.x, o.y), ang = gira(pos.ang, meta, dt), av = avance(inter ? 1e9 : dist, difAng(ang, meta), dt, vel);   // en un punto intermedio no frena
      if (av > 0.3) {
        if (dist < st.mejor - ATASCO_M) { st.mejor = dist; st.quieto = 0; }
        else {
          st.quieto += dt;
          if (st.quieto > ATASCO_S) {
            var r2 = st.replan < 1 && st.copas ? planifica(pos, st.dest, st.copas, R_REPLAN, st.ext) : null;   // una sola vez, con más margen
            st.replan++; st.mejor = Infinity; st.quieto = 0;
            if (r2) { st.ruta = r2.slice(0, -1); return { av: 0, ang: ang, fin: null }; }
            cancela(st); return { av: 0, ang: ang, fin: "atascado" };
          }
        }
      }
      return { av: av, ang: ang, fin: null };
    }
    return { LLEGA: LLEGA, TOQUE_MS: TOQUE_MS, TOQUE_PX: TOQUE_PX, GIRO: GIRO, esToque: esToque, activa: activa, rumbo: rumbo, difAng: difAng, gira: gira, avance: avance, planifica: planifica, puntosLinea: puntosLinea, R_TRONCO: R_TRONCO, crea: crea, ir: ir, cancela: cancela, paso: paso };
  })();
  // [puro:fin]
  var IrA = (function () {
    var st = IrAPuro.crea(), MAXP = 80, PASO_P = 1.2;
    // la línea de puntos: una sola malla de puntos (1 llamada, solo con destino); el búfer se rellena cada fotograma, no se crea nada nuevo
    var bufP = new Float32Array(MAXP * 3), geoP = new THREE.BufferGeometry(), atrP = new THREE.BufferAttribute(bufP, 3);
    atrP.setUsage(THREE.DynamicDrawUsage); geoP.setAttribute("position", atrP); geoP.setDrawRange(0, 0);
    var matP = new THREE.PointsMaterial({ color: 0xffc94a, size: 5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, depthWrite: false });
    var linea = new THREE.Points(geoP, matP); linea.frustumCulled = false; linea.visible = false; linea.renderOrder = 5; scene.add(linea);
    function pintaLinea() {
      if (!st.dest) { linea.visible = false; return; }
      var v = IrAPuro.puntosLinea(pp, st, PASO_P, MAXP);
      for (var i = 0; i < v.length; i++) { bufP[i * 3] = v[i].x; bufP[i * 3 + 1] = suelo(v[i].x, v[i].y) * exag + 0.18; bufP[i * 3 + 2] = -v[i].y; }
      geoP.setDrawRange(0, v.length); atrP.needsUpdate = true; linea.visible = v.length > 0;
    }
    function activo() { var a = true; try { a = Ajustes.lee("controles.tocarIr"); } catch (e) {} return IrAPuro.activa(a, location.search); }
    function cancela() { if (st.dest) { IrAPuro.cancela(st); Llegada.borra(); } linea.visible = false; }
    // un toque corto o un clic sin nada elegido debajo (09_camara.js lo llama tras Usables.toque); mov y ms, desde que bajó el puntero. Devuelve si echó a andar
    function toca(cx, cy, mov, ms, tipo) {
      if (!paseando || VRX.on || enDron || !activo() || !IrAPuro.esToque(mov, ms, tipo)) return false;
      var q = Llegada.apuntaPantalla(cx, cy); if (!q) return false;   // cielo o fuera de la finca: no pasa nada (y el anillo que hubiera sigue)
      var f = LlegadaPuro.fueraDeTroncos(q.x, q.z, copas, 0.9);      // el destino no cae dentro de un tronco
      var d = { x: f.x, y: -f.z }, ruta = IrAPuro.planifica(pp, d, copas, IrAPuro.R_TRONCO, D.ext);   // null: sin rodeo, va recto (y si se atasca, replanifica o se rinde)
      IrAPuro.ir(st, d.x, d.y, ruta ? ruta.slice(0, -1) : [], copas, D.ext); pintaLinea(); return true;
    }
    // desde actualizaPaseo (12_paseo.js), una vez por fotograma. manda: hay tecla, cruceta o palanca en uso → se cancela. Devuelve { av, ang } o null
    function paso(dt, manda) {
      if (!st.dest) return null;
      if (manda || enQuad || enDron || VRX.on || !paseando) { cancela(); return null; }
      var r = IrAPuro.paso(st, pp, dt, teclas.run ? 4.3 : 1.7);
      if (!r || r.fin) { Llegada.borra(); linea.visible = false; return null; }
      pintaLinea(); return r;
    }
    // libera la malla (la escena no la vuelve a necesitar)
    function libera() { cancela(); scene.remove(linea); geoP.dispose(); matP.dispose(); }
    return { libera: libera, linea: linea, toca: toca, paso: paso, cancela: cancela, activo: activo, destino: function () { return st.dest; } };
  })();

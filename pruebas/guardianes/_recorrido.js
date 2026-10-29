// Recorridos de la escena 3D Tiles en una página ya abierta (Playwright): criterios 3 y 4 del ADR-0015. Lo usan escena3d.test.js (fixture) y
// pruebas/escena3d_recorrido.js (cualquier finca servida, p. ej. Hituelo real). Solo cuentan rayos y comparan alturas: con SwiftShader vale
// (es CPU y recuentos), NO dice nada de fps.
"use strict";

/** Vuelo de punta a punta SIN esperar a que carguen las teselas: el objetivo de la órbita va de A a B en `pasos` saltos, con `cada` fotogramas
 *  por salto, y en cada uno Escena3D.sondea() lanza rayos desde la cámara (rejilla de pantalla + vertical bajo la cámara y bajo el objetivo).
 *  Un rayo cuenta si en la CPU corta el relieve dentro de los datos; falla si no encuentra relieve dibujado ni a 1 cm (si lo encuentra a 1 cm,
 *  pasaba por una arista: «aristas», que no es un hueco). Devuelve los totales y los primeros
 *  fallos. Lo pesado (rayos) va dentro de la página, en una sola llamada. */
function vuela(p, { A, B, pasos = 40, cada = 2, dist = 45, el = 0.5, az = -0.4, nx = 7, ny = 5 }) {
  return p.evaluate(async o => {
    const g = window.__g, E = g.Escena3D, raf = () => new Promise(r => requestAnimationFrame(r));
    const out = { pasos: o.pasos + 1, rayos: 0, enDatos: 0, sinRelieve: 0, aristas: 0, pasosConHueco: 0, visiblesMin: Infinity, visiblesMax: 0, fallos: [], ms: 0 };
    const t0 = performance.now();
    g.orb.dist = o.dist; g.orb.el = o.el; g.orb.az = o.az;
    for (let i = 0; i <= o.pasos; i++) {
      const t = i / o.pasos, x = o.A[0] + (o.B[0] - o.A[0]) * t, y = o.A[1] + (o.B[1] - o.A[1]) * t;
      g.objetivo.x = x; g.objetivo.z = -y; g.objetivo.y = g.suelo(x, y) + 4;
      for (let k = 0; k < o.cada; k++) await raf();
      const s = E.sondea(o.nx, o.ny);
      out.rayos += s.rayos; out.enDatos += s.enDatos; out.sinRelieve += s.sinRelieve; out.aristas += s.aristas;
      out.visiblesMin = Math.min(out.visiblesMin, s.visibles); out.visiblesMax = Math.max(out.visiblesMax, s.visibles);
      if (s.sinRelieve) out.pasosConHueco++;
      if ((s.sinRelieve || s.aristas) && out.fallos.length < 8) { out.fallos.push({ paso: i, objetivo: [+x.toFixed(2), +y.toFixed(2)], sinRelieve: s.sinRelieve, aristas: s.aristas, enDatos: s.enDatos, visibles: s.visibles, muestras: s.muestras }); }
    }
    out.ms = Math.round(performance.now() - t0);
    return out;
  }, { A, B, pasos, cada, dist, el, az, nx, ny });
}

/** Caja de los datos de la página (de las teselas del Mundo), para elegir A y B */
function cajaDatos(p) {
  return p.evaluate(() => { const L = window.__g.Mundo.lista; return [Math.min(...L.map(t => t.v[0])), Math.min(...L.map(t => t.v[1])), Math.max(...L.map(t => t.v[2])), Math.max(...L.map(t => t.v[3]))]; });
}

/** El relieve dibujado frente a Mundo.suelo (criterio 4) en los puntos dados, con las teselas que haya cargadas. Para cada punto:
 *  - «interior»: |dibujado − CPU| frente al geometricError de la tesela que lo dibuja (cota del error de rejilla + simplificación de ese nivel);
 *  - «vértice»: el mismo glb en el vértice de borde más cercano (los bordes del cuadrado no se simplifican, LockBorder de meshoptimizer, y sus
 *    vértices son H(x, y) de la misma interpolación que Mundo.suelo): ahí la diferencia mide solo el MARCO (transform, exageración, z0, giro),
 *    y debe ser < 1 cm en todos los niveles. El punto se mete 1 mm dentro del cuadrado para que el rayo no caiga en el faldón ni en la vecina.
 *  Devuelve una fila por punto: [x, y, uri, lado, error, interior, vertice | null]. */
function comparaRelieve(p, puntos) {
  return p.evaluate(P => {
    const g = window.__g, E = g.Escena3D, M = g.Mundo, filas = [];
    for (const [x, y] of P) {
      const r = E.relieveEn(x, y); if (!r) { filas.push([x, y, null]); continue; }
      const L = r.lado, s = L / 128, x0 = Math.floor((x + M.cx) / L) * L - M.cx, y0 = Math.floor((y + M.cy) / L) * L - M.cy;
      // el vértice de borde más cercano: en el lado (S, N, O, E) más próximo, en la retícula de paso s sin las esquinas
      const dS = y - y0, dN = y0 + L - y, dO = x - x0, dE = x0 + L - x, m = Math.min(dS, dN, dO, dE), cl = v => Math.min(127, Math.max(1, Math.round(v)));
      let vx, vy, ex, ey;
      if (m === dS || m === dN) { vx = x0 + s * cl((x - x0) / s); vy = m === dS ? y0 : y0 + L; ex = vx; ey = vy + (m === dS ? 1e-3 : -1e-3); }
      else { vy = y0 + s * cl((y - y0) / s); vx = m === dO ? x0 : x0 + L; ey = vy; ex = vx + (m === dO ? 1e-3 : -1e-3); }
      const v = E.relieveEn(ex, ey), dv = v && v.uri === r.uri ? Math.abs(v.h - g.suelo(vx, vy)) : null;
      filas.push([x, y, r.uri, L, r.error, Math.abs(r.h - g.suelo(x, y)), dv]);
    }
    return filas;
  }, puntos);
}

module.exports = { vuela, cajaDatos, comparaRelieve };

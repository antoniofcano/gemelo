"use strict";
// AG-1.4c (segunda parte) · equivalencia de los perros, el rastro del minimapa y la firma de las balizas con el código anterior. En Node, sin navegador; compara resultados, no
// tiempos (los tiempos, relativos y de Node, están en pruebas/medida_bucle.js; fps o tirones, solo un dispositivo real).
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");
const R = require("./_reservas");
const F = require("./_fauna_mundo");

let THREE;
test.before(async () => { THREE = await F.cargaThree(); });

// ---------- 5a · 25_perros.js == su copia anterior (referencias/25_perros_antes.js), con la misma semilla, fotograma a fotograma ----------
const { mundoPerros } = require("./_perros_mundo");
const foto5 = (m) => {
  const o = [];
  for (const d of m.api.perros()) {
    o.push(d.nombre, d.x, d.y, d.ang, d.v, d.est, d.t, d.fase, d.pit, d.rol, d.sentado, d.excit, d.ult, d.malla.visible, d.tag.visible, d.tag.material.opacity);
    o.push(...d.malla.position.toArray(), d.malla.rotation.x, d.malla.rotation.y, d.malla.rotation.z, ...d.tag.position.toArray(), ...d.tag.scale.toArray());
    const u = d.malla.userData; o.push(...u.patas.map(p => p.rotation.x), u.cuerpo.rotation.x, u.cuerpo.position.y, u.cola.rotation.x, u.cola.rotation.y, u.cab.rotation.x, u.cab.rotation.y);
  }
  for (const c of m.conejos) o.push(c.userData.x, c.userData.y, c.userData.est, c.userData.t, c.userData.dir);
  return o;
};
const estados = new Set();
for (const [nombre, guion] of [
  ["paseando a ratos, con quad y dron", (f) => ({ paseando: f % 900 < 800, enQuad: f % 600 > 400, enDron: f % 700 > 540 })],
  ["siempre a pie (los perros siguen, exploran, persiguen conejos y descansan)", () => ({ paseando: true, enQuad: false, enDron: false })],
  ["a pie y sin conejos (exploran y olfatean)", () => ({ paseando: true, enQuad: false, enDron: false, sinConejos: true })]]) {
  test("25_perros.js == su copia anterior, fotograma a fotograma, " + nombre, () => {
    const a = mundoPerros(THREE, "pruebas/guardianes/referencias/25_perros_antes.js", 77), b = mundoPerros(THREE, "apps/web/motor/25_perros.js", 77), r = F.semilla(5), antes = { p: false };
    let amenazas = 0;
    for (let f = 0; f < 2400; f++) {
      const dt = 0.008 + r() * 0.04, s = guion(f), parado = f % 800 > 250 && f % 800 < 650, x = parado ? 10 : 10 + 40 * Math.sin(f * 0.004) + (f % 400 > 380 ? 30 : 0), y = parado ? 10 : 10 + 30 * Math.cos(f * 0.0053), ang = f * 0.01;
      for (const m of [a, b]) {
        Object.assign(m.E, s); if (s.sinConejos) for (const c of m.conejos) c.visible = false; m.E.tVida += dt; m.g.pp.x = x; m.g.pp.y = y; m.g.pp.ang = ang; m.g.camera.position.set(x + 5, 6, -y + 8);
        if (s.paseando && !antes.p) m.api.llegan();   // vuelve a pasear: los perros llegan de nuevo
        for (const c of m.conejos) { const u = c.userData; if (u.est === "huye") { u.t -= dt; if (u.t <= 0) u.est = "pasta"; u.x += Math.cos(u.dir) * 3 * dt; u.y += Math.sin(u.dir) * 3 * dt; } }
        m.api.actualiza(dt);
      }
      antes.p = s.paseando;
      // las preguntas «perros:amenaza» de los conejos: la respuesta se lee al instante (copia de los valores), como hace la fauna
      const qs = [[x + 1, y], [x + 30, y + 3], [x + 4, y + 4]].concat(a.api.perros().map(d => [d.x + 2, d.y]));
      for (const [qx, qy] of qs) {
        const qa = { x: qx, y: qy, res: null }, qb = { x: qx, y: qy, res: null }; a.g.Bus.emite("perros:amenaza", qa); b.g.Bus.emite("perros:amenaza", qb);
        assert.deepStrictEqual(qb.res && { x: qb.res.x, y: qb.res.y }, qa.res && { x: qa.res.x, y: qa.res.y }, "fotograma " + f + ": amenaza distinta en " + qx + "," + qy); if (qa.res) amenazas++;
        const ra = a.api.amenaza(qx, qy), rb = b.api.amenaza(qx, qy); assert.strictEqual(JSON.stringify(rb), JSON.stringify(ra)); if (rb) assert.notStrictEqual(rb, b.api.amenaza(qx, qy), "la API pública amenaza sigue dando un objeto nuevo");
      }
      assert.deepStrictEqual(foto5(b), foto5(a), "fotograma " + f + ": los perros de ahora difieren de los de antes");
      for (const d of a.api.perros()) estados.add(d.est);
    }
    assert.deepStrictEqual(b.eventos, a.eventos, "los mismos eventos (polvo, ladridos) con los mismos datos y en el mismo orden");
    assert.ok(amenazas > 50, "hubo amenazas (" + amenazas + ")"); assert.ok(estados.size >= 4);
    assert.ok(a.eventos.length > 0, "hubo eventos");
  });
}
test("la comparación de los perros pasó por todos los estados que cambian el camino del código (cobertura de la prueba)", () => {
  for (const e of ["viene", "sigue", "explora", "olfatea", "persigue", "frustra", "descansa", "mira", "fuera"]) assert.ok(estados.has(e), "estado sin cubrir: " + e + " (vistos: " + [...estados].join(",") + ")");
});

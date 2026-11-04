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
/** El texto de una función (declaración entera) de un módulo del motor. */
function fuente(modulo, inicio) {
  const src = lee("apps/web/motor/" + modulo), i = src.indexOf(inicio), cu = R.cuerpo(src, inicio);
  assert.ok(i >= 0 && cu !== null, modulo + ": no se encuentra " + inicio);
  return src.slice(i, src.indexOf(cu, i) + cu.length + 1);
}

// ---------- 5b · el rastro del minimapa (17_minimapa.js): mismo rastro punto a punto, sin hypot y reciclando pares ----------
const RASTRO_ANTES = function (mini, pp) {   // foto del código anterior, tal cual
  var u = mini.rastro[mini.rastro.length - 1];
  if (u && Math.hypot(u[0] - pp.x, u[1] - pp.y) > 25) mini.rastro.length = 0;
  if (!u || Math.hypot(u[0] - pp.x, u[1] - pp.y) > 2.5) { mini.rastro.push([pp.x, pp.y]); if (mini.rastro.length > 240) mini.rastro.shift(); }
};
test("actualizaRastro da exactamente el mismo rastro que antes (caminatas, saltos, paradas y distancias justo en 2,5 m y 25 m)", () => {
  const nuevo = new Function("mini", "pp", fuente("17_minimapa.js", "function actualizaRastro(") + "\nreturn actualizaRastro;");
  const r = F.semilla(31), A = { rastro: [] }, B = { rastro: [] }, ppA = { x: 100, y: 100 }, ppB = { x: 100, y: 100 }, pasoB = nuevo(B, ppB);
  const justos = [[2.5, 0], [0, 2.5], [1.5, 2], [2, 1.5], [7, 24], [24, 7], [15, 20], [25, 0], [0, -25], [2.5000001, 0], [24.9999999, 0], [2.4999999, 0], [0, 0]];
  let maxLargo = 0, saltos = 0, reciclados = 0;
  for (let i = 0; i < 40000; i++) {
    const q = r(); let dx, dy;
    if (q < 0.2) { const a = r() * 6.2832, d = r() * 4; dx = Math.cos(a) * d; dy = Math.sin(a) * d; }
    else if (q < 0.25) { dx = 0; dy = 0; }
    else if (q < 0.2515) { const a = r() * 6.2832, d = 26 + r() * 80; dx = Math.cos(a) * d; dy = Math.sin(a) * d; saltos++; }
    else if (q < 0.2525) { dx = 25.0000001; dy = 0; saltos++; }
    else if (q < 0.4) { const j = justos[Math.floor(r() * justos.length)]; dx = j[0] * (r() < 0.5 ? 1 : -1); dy = j[1] * (r() < 0.5 ? 1 : -1); }
    else { const a = r() * 6.2832; dx = Math.cos(a) * 2.6; dy = Math.sin(a) * 2.6; }   // andar sostenido: el rastro se llena
    for (const p of [ppA, ppB]) { p.x += dx; p.y += dy; }
    const antesLargo = B.rastro.length; RASTRO_ANTES(A, ppA); pasoB();
    assert.strictEqual(JSON.stringify(B.rastro), JSON.stringify(A.rastro), "paso " + i + " (" + dx + "," + dy + ")");
    if (antesLargo === 240 && B.rastro.length === 240) reciclados++; maxLargo = Math.max(maxLargo, B.rastro.length);
  }
  assert.strictEqual(maxLargo, 240, "el rastro llega a 240 y no pasa de ahí"); assert.ok(saltos > 20 && reciclados > 100, "la prueba incluye saltos (" + saltos + ") y rastro lleno (" + reciclados + ")");
});

// ---------- 5c · la firma de las balizas (19_balizas.js): comparar campos == comparar la cadena de antes ----------
test("firmaCambia dice «cambió» exactamente cuando cambiaba la cadena firma de antes (fecha, fábrica o vivo, avisos de Vigía)", () => {
  const ANTES = `var balSig = ""; var OT, D, VIVO; function cambia(o, d, v) { OT = o; D = d; VIVO = v;
    var firma = (OT && OT.fecha_consulta) + "|" + (OT === D.ot ? "i" : "v") + "|" + (VIVO ? (VIVO.vigia ? VIVO.vigia.length : "x") : "n");
    if (firma !== balSig) { balSig = firma; return true; } return false; } return cambia;`;
  const AHORA = "var balSigOk = false, balSigF, balSigI = false, balSigV = \"\"; var OT, D, VIVO;\n" + fuente("19_balizas.js", "function firmaCambia(") + "\nreturn function (o, d, v) { OT = o; D = d; VIVO = v; return firmaCambia(); };";
  const a = new Function(ANTES)(), b = new Function(AHORA)(), r = F.semilla(8);
  const fabrica = { fecha_consulta: "2026-10-01", fuente: "fabrica" }, vivo1 = { fecha_consulta: "2026-11-03", fuente: "vivo" }, vivo2 = { fecha_consulta: "2026-11-04", fuente: "vivo" }, sinFecha = { fuente: "vivo" };
  const OTs = [fabrica, vivo1, vivo2, sinFecha, null, undefined], VIVOs = [null, undefined, {}, { vigia: [] }, { vigia: [1, 2] }, { vigia: [1, 2, 3] }];
  let cambios = 0, quietos = 0;
  for (let i = 0; i < 20000; i++) {
    const o = r() < 0.9 && i ? b.__o : OTs[Math.floor(r() * OTs.length)], v = r() < 0.9 && i ? b.__v : VIVOs[Math.floor(r() * VIVOs.length)], d = { ot: r() < 0.5 ? fabrica : null };
    b.__o = o; b.__v = v;
    const ra = a(o, d, v), rb = b(o, d, v); assert.strictEqual(rb, ra, "paso " + i); ra ? cambios++ : quietos++;
  }
  assert.ok(cambios > 1000 && quietos > 1000, "cambios " + cambios + ", quietos " + quietos);
  assert.strictEqual(new Function(AHORA)()(fabrica, { ot: fabrica }, null), true, "el primer fotograma siempre cambia");
});

test("la comparación de los perros pasó por todos los estados que cambian el camino del código (cobertura de la prueba)", () => {
  for (const e of ["viene", "sigue", "explora", "olfatea", "persigue", "frustra", "descansa", "mira", "fuera"]) assert.ok(estados.has(e), "estado sin cubrir: " + e + " (vistos: " + [...estados].join(",") + ")");
});

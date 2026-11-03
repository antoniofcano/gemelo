"use strict";
// EV2-A1 (doc/sistema/VIABILIDAD-INTERACCION.md §A.5, paso 2): las fichas de olivo y baliza colgadas en el mundo, tras ?ui=capas (apps/web/motor/51_fichas_mundo.js).
// En Node y sin navegador: la parte pura (dónde se cuelga, a qué escala, la maqueta, el cupo de 3, los topes angulares) y, con Laminas, Entidades,
// Usables y PanelVR de mentira, que el componente sustituye a las fichas de 29_vr para esos tipos (y solo para esos), que como mucho hay 3 vivas, que
// «Cerrar» y alejarse las cierran y que liberar el componente lo suelta todo. Lo que NO dice: nada de legibilidad, nitidez ni comodidad en un casco
// (no probado en unas Quest); la prueba con el WebXR simulado está en vr_mock (pruebas/prueba_vr.js), sin ejecutar por este agente.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/51_fichas_mundo.js");
function trozo(fuente, ini, fin) {
  const i = fuente.indexOf(ini), f = fuente.indexOf(fin);
  assert.ok(i >= 0 && f > i, "debe marcar " + ini + " … " + fin);
  return fuente.slice(i, f);
}
const P = new Function("\"use strict\";\n" + trozo(FUENTE, "// [puro:inicio]", "// [puro:fin]") + "\nreturn FichasMundoPuro;")();
const LP = new Function("\"use strict\";\n" + trozo(lee("apps/web/motor/02d_laminas.js"), "// [puro:inicio]", "// [puro:fin]") + "\nreturn LaminasPuro;")();
const EP = new Function("\"use strict\";\n" + trozo(lee("apps/web/motor/02e_entidades.js"), "// [puro:inicio]", "// [puro:fin]") + "\nreturn EntidadesPuro;")();
const medir = (t, px, negrita) => String(t).length * px * (negrita ? 0.6 : 0.55);

test("puro: solo olivo y baliza se cuelgan del mundo", () => {
  assert.ok(P.maneja("olivo") && P.maneja("baliza"));
  assert.ok(!P.maneja("persona") && !P.maneja("haza") && !P.maneja("baliza-oficial") && !P.maneja("toString"));
  assert.strictEqual(P.cierraA("olivo"), 15); assert.strictEqual(P.cierraA("baliza"), 22);
});

test("puro: se cuelga en el borde de la copa que da hacia quien mira, a la altura de los ojos, y crece con la distancia", () => {
  const cab = { x: 0, y: 1.6, z: 0 }, mira = { x: 0, z: -1 };
  // olivo a 4 m al norte (z = −4), radio 1,5: borde a 4 − 1,8 = 2,2 m
  const c = P.coloca({ x: 0, y: 0, z: -4 }, 1.5, cab, mira);
  assert.ok(c.junto, "junto al olivo"); assert.ok(Math.abs(c.z + 2.2) < 1e-9 && Math.abs(c.x) < 1e-9, JSON.stringify(c));
  assert.ok(Math.abs(c.y - 1.45) < 1e-9, "15 cm bajo los ojos");
  assert.ok(Math.abs(c.escala - c.dist / 1.5) < 1e-9 && c.escala > 1, "a 2,2 m, escala 1,47");
  // muy cerca: la escala no baja de 1
  const cerca = P.coloca({ x: 0, y: 0, z: -2.3 }, 1, cab, mira); assert.ok(cerca.junto && cerca.escala === 1 && cerca.dist >= 0.9, JSON.stringify(cerca));
  // lejos (30 m): delante, en la línea hacia el olivo, a 4,5 m y escala 3
  const lejos = P.coloca({ x: 30, y: 0, z: 0 }, 1.5, cab, mira);
  assert.ok(!lejos.junto && Math.abs(lejos.x - 4.5) < 1e-9 && Math.abs(lejos.z) < 1e-9 && Math.abs(lejos.escala - 3) < 1e-9, JSON.stringify(lejos));
  // dentro de la copa: delante de los ojos, hacia la mirada si no hay otra dirección
  const dentro = P.coloca({ x: 0.1, y: 0, z: 0 }, 2, cab, mira);
  assert.ok(!dentro.junto && Math.abs(dentro.z + 0.9) < 1e-9 && dentro.escala === 1, JSON.stringify(dentro));
  // en una ladera: la ficha no se entierra ni se va a las nubes respecto del pie del olivo
  const alto = P.coloca({ x: 0, y: 1, z: -4 }, 1, cab, mira), bajo = P.coloca({ x: 0, y: -2, z: -4 }, 1, cab, mira);
  assert.ok(alto.junto && Math.abs(alto.y - 1.8) < 1e-9, "olivo más alto: 0,8 m sobre su pie " + JSON.stringify(alto));
  assert.ok(bajo.junto && Math.abs(bajo.y - 1) < 1e-9, "olivo más bajo: como mucho 3 m sobre su pie " + JSON.stringify(bajo));
  const risco = P.coloca({ x: 0, y: 5, z: -4 }, 1, cab, mira);
  assert.ok(!risco.junto && Math.abs(risco.y - 1.45) < 1e-9, "en un risco, lejos en vertical: delante de los ojos " + JSON.stringify(risco));
});

test("puro: la maqueta (título, destacado, líneas, pie y botones con «Cerrar» siempre) cabe en el lienzo y sus botones no se pisan", () => {
  const f = { titulo: "Olivo 1234 · Cerro", destacado: "Aquí: Ana", lineas: ["Altura: 4,5 m · Copa: 6,1 m · Haza: La Loma", "Medido: LiDAR PNOA 2024"], pie: "Fuente: IGN CC BY 4.0", color: 0x40f0ff,
    acciones: [{ id: "nombra", txt: "Nombrar" }, { id: "denuncia", txt: "Denunciar" }, { id: "x", txt: "Otra" }] };
  const m = P.maqueta(f, medir);
  assert.strictEqual(m.w, 600); assert.ok(m.h <= P.HMAX && m.h > 300, "alto " + m.h);
  assert.deepStrictEqual(m.botones.map(b => b.id), ["nombra", "denuncia", "x", "cerrar"]); assert.ok(m.botones[3].cerrar);
  m.botones.forEach(b => assert.ok(b.x >= 0 && b.x + b.w <= m.w + 1e-9 && b.y + b.h <= m.h, JSON.stringify(b)));
  m.bloques.forEach(b => assert.ok(medir(b.texto, b.px, b.negrita) <= m.w - m.x0 - 24 + 1e-9 || b.texto.split(" ").length === 1, "cabe: " + b.texto));
  for (let i = 0; i < m.botones.length; i++) for (let j = i + 1; j < m.botones.length; j++) assert.ok(LP.hueco(m.botones[i], m.botones[j]) >= P.BOTON.hueco - 1e-9);
  assert.strictEqual(P.boton(m.botones, m.botones[1].x + 5, m.botones[1].y + 5).id, "denuncia"); assert.strictEqual(P.boton(m.botones, 1, 1), null);
  // sin acciones: solo «Cerrar»; un texto larguísimo no desborda (líneas con tope y «…»)
  const larga = P.maqueta({ titulo: "x", lineas: [Array(80).fill("palabra").join(" ")] }, medir);
  assert.deepStrictEqual(larga.botones.map(b => b.id), ["cerrar"]); assert.ok(larga.bloques.filter(b => b.clase === "cuerpo").length <= 2 && /…$/.test(larga.bloques[larga.bloques.length - 1].texto));
  assert.ok(P.maqueta({ titulo: "x", lineas: Array(20).fill("una línea") }, medir).bloques.filter(b => b.clase === "cuerpo").length <= 6, "como mucho 6 líneas de cuerpo");
});

test("puro: cumple los topes angulares (02d_laminas.js; cifras propias sin verificar) entre 0,9 y 4,5 m", () => {
  const f = { titulo: "Baliza · P1", lineas: ["a: b"], acciones: [{ id: "bir", txt: "Ir a esta baliza" }] }, m = P.maqueta(f, medir);
  [P.DMIN, 1, P.REF, 2.5, P.DMAX].forEach(d => {
    const v = P.vista(d), r = LP.legible({ mmPorPx: v.mmPorPx, dist: d, lineas: v.lineas, botones: m.botones });
    assert.deepStrictEqual(r.fallos, [], "a " + d + " m: " + r.fallos.join("; "));
  });
});

test("puro: el cupo (como mucho 3, se va la más antigua) y el sello (cambia con el texto y con el botón apuntado, no con las funciones)", () => {
  assert.deepStrictEqual(P.cupo([], "a", 3).cierra, []);
  assert.deepStrictEqual(P.cupo(["a", "b"], "c", 3).cierra, []);
  assert.deepStrictEqual(P.cupo(["a", "b", "c"], "d", 3).cierra, ["a"]);
  assert.deepStrictEqual(P.cupo(["a", "b", "c"], "b", 3).cierra, [], "reabrir una viva no cierra otra");
  const f = { titulo: "t", lineas: ["x"], acciones: [{ id: "a", txt: "A", fn() {} }] };
  assert.strictEqual(P.sello(f, ""), P.sello(Object.assign({}, f, { acciones: [{ id: "a", txt: "A", fn() { return 1; } }] }), ""));
  assert.notStrictEqual(P.sello(f, ""), P.sello(f, "a")); assert.notStrictEqual(P.sello(f, ""), P.sello(Object.assign({}, f, { titulo: "u" }), ""));
});

// ---------- el componente con servicios de mentira
function mundo() {
  const reg = { abiertas: {}, cerradas: [], repintadas: [], usadas: [], cerradasU: [] };
  const Laminas = {
    abre(o) { if (reg.abiertas[o.id]) Laminas.cierra(o.id, "reabierta"); reg.abiertas[o.id] = o; o.pinta(lienzo(), o.w, o.h); return true; },
    cierra(id, m) { const o = reg.abiertas[id]; if (!o) return false; delete reg.abiertas[id]; reg.cerradas.push([id, m]); if (o.alCierra) o.alCierra(m || "cerrada"); return true; },
    repinta(id) { reg.repintadas.push(id); return true; }
  };
  function lienzo() { const f = () => {}; return { clearRect: f, fillRect: f, beginPath: f, roundRect: f, rect: f, fill: f, stroke: f, fillText: f, measureText: t => ({ width: medir(t, 30) }) }; }
  const tipos = {
    olivo: { radio: () => 1.5, pos: id => ({ x: 0, y: 0, z: -4 - Number(id.split(":")[2]) }), ficha: id => ({ titulo: "Olivo " + id, filas: [{ k: "Altura", v: "4 m" }] }) },
    baliza: { pos: () => ({ x: 6, y: 0, z: 0 }), ficha: id => ({ titulo: "Baliza " + id, acciones: [{ id: "bir", txt: "Ir", fn() { reg.usadas.push(id); } }] }) },
    persona: { pos: () => ({ x: 1, y: 0, z: 1 }), ficha: () => ({ titulo: "Ana", acciones: [{ id: "ir", txt: "Ir con", fn() {} }] }) }
  };
  const est = { elegido: null, abierta: null };
  const Entidades = { de: id => tipos[EP.tipoDe(id)] || null, existe: id => !!tipos[EP.tipoDe(id)], pos: id => tipos[EP.tipoDe(id)].pos(id),
    ficha: (id, modo) => { const f = tipos[EP.tipoDe(id)].ficha(id, modo); f.id = id; f.tipo = EP.tipoDe(id); return f; } };
  const pres = [], tapas = [];
  const Usables = {
    presentador: (m, fn) => { pres.push(fn); return () => { const i = pres.indexOf(fn); if (i >= 0) pres.splice(i, 1); }; },
    abierta: () => est.abierta, elegido: () => est.elegido,
    cierra: (id, m) => { reg.cerradasU.push([id, m]); if (est.elegido === id) est.elegido = null; if (est.abierta === id) est.abierta = null; return true; },
    usa: (id, a) => { reg.usadas.push(id + ":" + a); return true; }
  };
  const PanelVR = { tapa: fn => { tapas.push(fn); return () => { const i = tapas.indexOf(fn); if (i >= 0) tapas.splice(i, 1); }; } };
  const VRX = { on: true, cab: { x: 0, y: 1.6, z: 0 } }, camera = { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } };
  const documento = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ font: "", measureText: t => ({ width: medir(t, 30) }) }) }) };
  let manif = null;
  const Componentes = { registra: d => { manif = d; return true; } };
  new Function("Laminas", "Entidades", "EntidadesPuro", "Usables", "PanelVR", "VRX", "camera", "document", "Componentes",
    "\"use strict\";\n" + FUENTE.slice(FUENTE.indexOf("// [puro:inicio]")))(Laminas, Entidades, EP, Usables, PanelVR, VRX, camera, documento, Componentes);
  const api = manif.monta({ on: () => () => {}, limpia: f => f });
  // la ficha que pide Usables al elegir en VR: el último presentador primero; si devuelve false, el de antes (29_vr)
  const antes = [];
  function presenta(id) { const f = Entidades.ficha(id, "vr"); for (let i = pres.length - 1; i >= 0; i--) if (pres[i](f) !== false) return "componente"; antes.push(id); return "29_vr"; }
  return { reg, est, api, manif, presenta, antes, tapas, pres, VRX, Laminas };
}
const ids = m => Object.keys(m.reg.abiertas).sort();

test("componente: manifiesto con ?ui=capas apagado por defecto, presupuesto de 3 láminas y una fase «tarde»", () => {
  const m = mundo(), d = m.manif;
  assert.strictEqual(d.id, "fichas-mundo"); assert.deepStrictEqual(d.bandera, { defecto: false, url: "ui", valor: "capas" });
  assert.deepStrictEqual(d.presupuesto, { llamadas: 3, triangulos: 6, texturasMB: 5 }); assert.deepStrictEqual(d.fases, { tarde: 0.5 });
  assert.deepStrictEqual(d.consume.slice().sort(), ["PanelVR", "VRX"]); assert.deepStrictEqual(d.expone, []);
});

test("componente: el olivo y la baliza se cuelgan del mundo (encima de la copa, con su sitio y su escala); la persona sigue en 29_vr", () => {
  const m = mundo();
  m.est.elegido = "olivo:cerro:1"; assert.strictEqual(m.presenta("olivo:cerro:1"), "componente");
  const o = m.reg.abiertas["ficha-mundo:olivo:cerro:1"];
  assert.ok(o && o.encima && o.modo === "vr" && o.en && o.cierraA.vr === 15, JSON.stringify(o && { en: o.en, encima: o.encima }));
  assert.ok(Math.abs(o.en.z + 3.2) < 1e-9, "en el borde de la copa (5 − 1,8 m)"); assert.ok(Math.abs(o.ancho - 0.6 * Math.hypot(3.2, 0.15) / 1.5) < 1e-6, "0,6 m × escala");
  assert.strictEqual(m.presenta("persona:a1"), "29_vr"); assert.deepStrictEqual(m.antes, ["persona:a1"]);
  // la baliza a menos de 17 m (abierta por su tipo, sin presentador): la recoge la fase tarde; la fichaB de 29_vr espera (tapa)
  m.est.abierta = "baliza:p1"; assert.ok(m.tapas.some(fn => fn()), "fichaB tapada para la baliza");
  m.api.tarde(); assert.deepStrictEqual(ids(m), ["ficha-mundo:baliza:p1", "ficha-mundo:olivo:cerro:1"]);
  m.est.abierta = "persona:a1"; assert.ok(!m.tapas.some(fn => fn()), "la de la persona sí sale en 29_vr");
  m.api.tarde(); assert.deepStrictEqual(ids(m), ["ficha-mundo:olivo:cerro:1"], "al salir del radio de la baliza, su ficha se va (como antes)");
});

test("componente: como mucho 3 vivas (la cuarta cierra la más antigua y la suelta si estaba elegida)", () => {
  const m = mundo();
  [1, 2, 3].forEach(k => m.presenta("olivo:cerro:" + k));
  assert.strictEqual(ids(m).length, 3);
  m.est.elegido = "olivo:cerro:1";
  m.presenta("olivo:cerro:4");
  assert.deepStrictEqual(ids(m), ["ficha-mundo:olivo:cerro:2", "ficha-mundo:olivo:cerro:3", "ficha-mundo:olivo:cerro:4"]);
  assert.deepStrictEqual(m.reg.cerradasU.pop(), ["olivo:cerro:1", "cupo"]);
  assert.deepStrictEqual(m.api.vivas(), ["olivo:cerro:2", "olivo:cerro:3", "olivo:cerro:4"]);
  m.presenta("olivo:cerro:2"); assert.strictEqual(ids(m).length, 3, "reabrir una viva no cierra otra");
});

test("componente: apuntar resalta el botón (repinta), el gatillo usa la acción o cierra con «Cerrar», y fuera de los botones el toque es suyo", () => {
  const m = mundo(); m.est.abierta = "baliza:p1"; m.api.tarde();
  const o = m.reg.abiertas["ficha-mundo:baliza:p1"], inf = m.api.info("baliza:p1");
  assert.deepStrictEqual(inf.botones, ["bir", "cerrar"]);
  const maq = FUENTE && P.maqueta({ titulo: "Baliza baliza:p1", lineas: EP.lineas({ titulo: "x" }), acciones: [{ id: "bir", txt: "Ir" }] }, medir);
  const b0 = maq.botones[0], b1 = maq.botones[1], sello0 = o.firma();
  o.alApuntar(0, 0, { x: b0.x + 4, y: b0.y + 4 }); assert.deepStrictEqual(m.reg.repintadas, ["ficha-mundo:baliza:p1"]); assert.notStrictEqual(o.firma(), sello0);
  o.alApuntar(0, 0, { x: b0.x + 8, y: b0.y + 4 }); assert.strictEqual(m.reg.repintadas.length, 1, "el mismo botón no repinta");
  o.alApuntar(0, 0, null); assert.strictEqual(m.reg.repintadas.length, 2); assert.strictEqual(o.firma(), sello0);
  assert.strictEqual(o.alTocar(0, 0, { x: 1, y: 1 }), true, "fuera de los botones: suyo");
  o.alTocar(0, 0, { x: b0.x + 4, y: b0.y + 4 }); assert.deepStrictEqual(m.reg.usadas, ["baliza:p1:bir"]);
  o.alTocar(0, 0, { x: b1.x + 4, y: b1.y + 4 });
  assert.deepStrictEqual(ids(m), []); assert.deepStrictEqual(m.reg.cerradasU.pop(), ["baliza:p1", "cerrada"]);
});

test("componente: lejos (Laminas) la cierra y suelta lo elegido; fuera de VR no hace nada; liberar quita presentador, tapa y láminas", () => {
  const m = mundo();
  m.est.elegido = "olivo:cerro:1"; m.presenta("olivo:cerro:1");
  m.Laminas.cierra("ficha-mundo:olivo:cerro:1", "lejos");
  assert.deepStrictEqual(m.reg.cerradasU.pop(), ["olivo:cerro:1", "lejos"]); assert.deepStrictEqual(m.api.vivas(), []);
  m.VRX.on = false; m.est.abierta = "baliza:p1"; m.api.tarde(); assert.deepStrictEqual(ids(m), [], "fuera de VR no abre");
  m.VRX.on = true; m.api.tarde(); m.presenta("olivo:cerro:2"); assert.strictEqual(ids(m).length, 2);
  m.manif.libera(m.api);
  assert.deepStrictEqual(ids(m), []); assert.strictEqual(m.pres.length, 0); assert.strictEqual(m.tapas.length, 0);
});

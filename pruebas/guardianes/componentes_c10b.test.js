"use strict";
// C10, segunda tanda (doc/sistema/COMPONENTES.md): los componentes «fauna-olivar» (apps/web/motor/16b_fauna.js) y «mandos-vr» (36_mandos.js). En Node y sin
// navegador, con el three de verdad (el de apps/web) y un mundo y un DOM de mentira: se montan, se cuentan las llamadas y los triángulos (los números de su
// presupuesto), se atienden los eventos del Bus, se mueven unos fotogramas y, al liberar, la escena queda como estaba y los recursos de GPU se sueltan (dispose).
// Lo de Chrome (que se vea igual) va por el banco; lo no probado en Quest ni iPhone sigue sin probar.
const test = require("node:test"), assert = require("node:assert"), vm = require("vm"), path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");

let THREE;
test.before(async () => { THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); });

function mundo(extra) {
  const E = Object.assign({ paseando: true, enQuad: false, tVida: 0 }, extra || {});
  const scene = new THREE.Scene(), gFauna = new THREE.Group(); scene.add(gFauna);
  const bus = {};
  const Bus = { on(ev, fn) { (bus[ev] = bus[ev] || []).push(fn); return () => { bus[ev] = (bus[ev] || []).filter(f => f !== fn); }; },
    emite(ev, d) { (bus[ev] || []).slice().forEach(f => f(d)); return (bus[ev] || []).length; }, hay: ev => !!(bus[ev] && bus[ev].length) };
  const capas = [], Minimapa = { capa(fn, o) { capas.push({ fn, o }); return () => capas.splice(capas.findIndex(c => c.fn === fn), 1); } };
  const copas = [], cIn = [];
  for (let i = 0; i < 40; i++) { const c = { x: -60 + (i % 8) * 16, y: -40 + Math.floor(i / 8) * 16, h: 4, oliv: true }; copas.push(c); cIn.push(c); }
  const defs = [], g = {
    THREE, scene, gFauna, Bus, Minimapa, Componentes: { registra: d => { defs.push(d); return true; } }, console, Math, Date, setTimeout, clearTimeout,
    window: {}, document: {}, exag: 1, altSuelo: () => 0, copas, cIn, D: { ext: [-500, 500, 500, -500] }, pp: { x: 0, y: 0, ang: 0 },
    cur: { lluvia: 0, viento: 1, dir: 0, ms: 0 }, nivel: () => ({ d: 1 }), camera: new THREE.PerspectiveCamera(),
    matSombra: new THREE.MeshBasicMaterial(), geoSombra: new THREE.PlaneGeometry(1, 1),
    esfera(r, m, sx, sy, sz, x, y, z, padre) { const me = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m); me.scale.set(sx, sy, sz); me.position.set(x, y, z); padre.add(me); return me; },
    mira(o, hx, hz) { o.rotation.y = Math.atan2(-hx, -hz); }
  };
  for (const k of ["paseando", "enQuad", "tVida"]) Object.defineProperty(g, k, { get: () => E[k], enumerable: true });
  return { E, g, defs, scene, gFauna, Bus, capas };
}
function carga(fichero, m) {
  vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/" + fichero), vm.createContext(m.g), { filename: fichero });
  assert.strictEqual(m.defs.length, 1, "un componente por fichero");
  return m.defs[0];
}
function contexto(m) {
  const sueltas = [], n = { on: (ev, fn) => (sueltas.push(m.Bus.on(ev, fn)), fn), emite: (ev, d) => m.Bus.emite(ev, d), limpia: fn => (sueltas.push(fn), fn), api: () => null, parametros: {} };
  n.suelta = () => sueltas.splice(0).reverse().forEach(f => f());
  return n;
}
function dibujo(raiz) {
  let llamadas = 0, tri = 0;
  (function anda(o) {
    if (o.visible === false) return;
    if (o.isMesh || o.isPoints || o.isSprite) {
      if (o.isInstancedMesh && o.count === 0) return;
      llamadas++;
      if (!o.isPoints) { const gm = o.geometry, k = gm.index ? gm.index.count / 3 : gm.attributes.position.count / 3; tri += k * (o.isInstancedMesh ? o.count : 1); }
    }
    o.children.forEach(anda);
  })(raiz);
  return { llamadas, triangulos: tri };
}
function espiaDispose() {
  let n = 0; const orig = THREE.EventDispatcher.prototype.dispatchEvent;
  THREE.EventDispatcher.prototype.dispatchEvent = function (e) { if (e && e.type === "dispose") n++; return orig.call(this, e); };
  return { cuenta: () => n, quita: () => { THREE.EventDispatcher.prototype.dispatchEvent = orig; } };
}

test("fauna-olivar: manifiesto, montaje, paseo:entra coloca aves y conejos, presupuesto medido, fauna:conejo-cerca, minimapa y liberar suelta todo", () => {
  const m = mundo(), d = carga("16b_fauna.js", m), n = contexto(m);
  assert.strictEqual(d.id, "fauna-olivar"); assert.strictEqual(d.bandera.url, "fauna"); assert.strictEqual(JSON.stringify(d.fases), "{\"mundo\":0}");
  assert.strictEqual(m.gFauna.children.length, 0, "antes de montar la fauna no tiene nada");
  const api = d.monta(n);
  assert.ok(m.gFauna.children.length >= 8, "dos mallas de aves y seis conejos");
  assert.strictEqual(m.capas.length, 1, "su capa del minimapa");
  for (const ev of ["paseo:entra", "paseo:sale", "fauna:conejo-cerca"]) assert.ok(m.Bus.hay(ev), ev);
  // de día y sin pasear solo vuelan las dos bandadas (14 aves = 2 llamadas); los conejos no están
  m.E.paseando = false; api.actualiza(0.05);
  assert.strictEqual(api.conejos().filter(c => c.visible).length, 0);
  assert.strictEqual(dibujo(m.gFauna).llamadas, 2, "cuerpos y alas de la bandada, instanciados");
  // paseo:entra: los seis conejos y las ocho aves posadas
  m.E.paseando = true; m.Bus.emite("paseo:entra");
  for (let i = 0; i < 20; i++) { m.E.tVida += 0.05; api.actualiza(0.05); }
  const dib = dibujo(m.gFauna); console.log("medido fauna-olivar (paseando, todo a la vista):", JSON.stringify(dib));
  assert.ok(api.conejos().filter(c => c.visible).length >= 4, "los conejos salen");
  assert.ok(dib.llamadas <= d.presupuesto.llamadas && dib.triangulos <= d.presupuesto.triangulos, JSON.stringify(dib) + " frente a " + JSON.stringify(d.presupuesto));
  // fauna:conejo-cerca
  const c0 = api.conejos().find(c => c.visible), q = { x: c0.userData.x, y: c0.userData.y, radio: 5, res: null };
  m.Bus.emite("fauna:conejo-cerca", q); assert.strictEqual(q.res, c0);
  const q2 = { x: 9999, y: 9999, radio: 5, res: null }; m.Bus.emite("fauna:conejo-cerca", q2); assert.strictEqual(q2.res, null);
  // huyen si alguien les amenaza (perros:amenaza)
  let preguntas = 0; m.Bus.on("perros:amenaza", x => { preguntas++; x.res = { x: x.x - 1, y: x.y }; });
  m.E.tVida += 0.05; api.actualiza(0.05); assert.ok(preguntas >= 4, "cada conejo pregunta si hay algo de lo que huir");
  assert.ok(api.conejos().some(c => c.userData.est === "huye"), "y huye");
  // la capa del minimapa pinta sin romper
  const c2d = new Proxy({}, { get: () => () => {}, set: () => true });
  assert.doesNotThrow(() => m.capas[0].fn(c2d, x => x, y => y, {}));
  // paseo:sale esconde
  m.Bus.emite("paseo:sale"); assert.strictEqual(api.conejos().filter(c => c.visible).length, 0);
  // de noche las aves no vuelan
  m.g.nivel = () => ({ d: 0 }); m.E.paseando = false; api.actualiza(0.05); assert.strictEqual(dibujo(m.gFauna).llamadas, 0, "de noche, ni bandada");
  const sp = espiaDispose();
  try { d.libera(); n.suelta(); } finally { sp.quita(); }
  assert.ok(sp.cuenta() >= 10, "dispose de geometrías y materiales: " + sp.cuenta());
  assert.strictEqual(m.gFauna.children.length, 0, "la fauna queda como estaba");
  assert.strictEqual(m.capas.length, 0); assert.ok(!m.Bus.hay("paseo:entra") && !m.Bus.hay("fauna:conejo-cerca"));
  assert.doesNotThrow(() => d.libera(), "liberar dos veces no rompe");
});

test("fauna-olivar: sin montar nadie responde (los perros no persiguen a nadie) y 16_vida ya no la nombra", () => {
  const m = mundo(); carga("16b_fauna.js", m);
  const q = { x: 0, y: 0, radio: 9, res: null }; assert.strictEqual(m.Bus.emite("fauna:conejo-cerca", q), 0); assert.strictEqual(q.res, null);
  const v = lee("apps/web/motor/16_vida.js").replace(/\/\/.*$/gm, "");
  assert.ok(!/\b(conejos|bandada|posadas|empacaAves)\b/.test(v), "16_vida.js sigue nombrando la fauna");
  assert.match(v, /Bus\.emite\("paseo:entra"\)/); assert.match(v, /Bus\.emite\("paseo:sale"\)/);
  assert.ok(!/\bconejos\b/.test(lee("apps/web/motor/17_minimapa.js").replace(/^\s*\/\/.*$/gm, "")), "17_minimapa.js sigue nombrando los conejos");
});

/** dos mandos con grip y mano de three, sin WebXR */
function xr() {
  const grips = [new THREE.Group(), new THREE.Group()], manos = [new THREE.Group(), new THREE.Group()];
  return { grips, manos, renderer: { xr: { getControllerGrip: i => grips[i], getHand: i => manos[i] } } };
}

test("mandos-vr: manifiesto, monta sin dibujar nada, vr:rig-monta pone el respaldo (caja) sin fábricas, vr:rig-libera lo suelta y apagar quita las escuchas", async () => {
  const m = mundo(), X = xr(); m.g.renderer = X.renderer;
  const d = carga("36_mandos.js", m), n = contexto(m);
  assert.strictEqual(d.id, "mandos-vr"); assert.strictEqual(d.bandera.url, "mandos"); assert.strictEqual(JSON.stringify(d.fases), "{}");
  assert.strictEqual(d.presupuesto.llamadas, 0);
  d.monta(n);
  assert.ok(m.Bus.hay("vr:rig-monta") && m.Bus.hay("vr:rig-libera"));
  assert.strictEqual(m.g.window.__mandos().montado, false);
  const rig = new THREE.Group(); m.Bus.emite("vr:rig-monta", { rig });
  assert.strictEqual(m.g.window.__mandos().montado, true);
  assert.strictEqual(rig.children.length, 2, "las dos manos cuelgan del rig");
  // sin import() en este contexto las fábricas no llegan: un mando conectado se queda con la caja de respaldo (una llamada, 12 triángulos)
  const aviso = console.warn; console.warn = () => {};
  try {
    X.grips[0].dispatchEvent({ type: "connected", data: { targetRayMode: "tracked-pointer", gamepad: {}, handedness: "left" } });
    await new Promise(r => setTimeout(r, 30));
  } finally { console.warn = aviso; }
  const r = m.g.window.__mandos(); console.log("medido mandos-vr (un mando, respaldo):", JSON.stringify({ tri: r.tri, mallas: r.mallas }));
  assert.strictEqual(r.filas[0].modelo, "caja"); assert.strictEqual(r.mallas, 1); assert.strictEqual(r.tri, 12);
  const sp = espiaDispose();
  try { m.Bus.emite("vr:rig-libera"); } finally { sp.quita(); }
  assert.ok(sp.cuenta() >= 2, "la caja suelta su geometría y su material");
  assert.strictEqual(m.g.window.__mandos().montado, false); assert.strictEqual(rig.children.length, 0);
  // apagar el componente: ya no escucha nada ni deja el gancho
  m.Bus.emite("vr:rig-monta", { rig }); d.libera(); n.suelta();
  assert.strictEqual(m.g.window.__mandos, undefined); assert.strictEqual(rig.children.length, 0);
  assert.ok(!m.Bus.hay("vr:rig-monta") && !m.Bus.hay("vr:rig-libera"));
  assert.ok(!(X.grips[0]._listeners && X.grips[0]._listeners.connected && X.grips[0]._listeners.connected.length), "quita sus escuchas del mando");
  assert.doesNotThrow(() => d.libera());
});

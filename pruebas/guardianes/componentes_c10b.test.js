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

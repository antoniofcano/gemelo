"use strict";
// Los componentes «huellas-polvo» (apps/web/motor/22b_huellas_polvo.js) y «perros-paseo» (25_perros.js), C10 de doc/rumbo/PLAN.md. En Node y sin navegador,
// con el three de verdad (el de apps/web) y un DOM y un mundo de mentira: se montan, se cuentan las llamadas de dibujo y los triángulos que crean (los números
// de su presupuesto), se atienden los eventos del Bus (polvo:emite, perros:llegan, perros:amenaza), se mueven unos fotogramas y, al liberar, la escena queda
// como estaba y todos los recursos de GPU se han soltado (dispose). Lo de Chrome (que se vea igual) va por el banco; lo no probado en Quest ni iPhone sigue sin probar.
const test = require("node:test"), assert = require("node:assert"), vm = require("vm"), path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");

let THREE;
test.before(async () => { THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); });

/** el mundo de mentira: lo que el motor deja ver a un componente; E cambia y los accesores lo reflejan */
function mundo(extra) {
  const E = Object.assign({ paseando: true, enQuad: false, enDron: false, vq: 0, tVida: 0 }, extra || {});
  const scene = new THREE.Scene(), gFauna = new THREE.Group(); scene.add(gFauna);
  const bus = {}, log = [];
  const Bus = { on(ev, fn) { (bus[ev] = bus[ev] || []).push(fn); return () => { bus[ev] = bus[ev].filter(f => f !== fn); }; },
    emite(ev, d) { log.push(ev); (bus[ev] || []).slice().forEach(f => f(d)); return (bus[ev] || []).length; }, hay: ev => !!(bus[ev] && bus[ev].length) };
  const capas = [], Minimapa = { capa(fn, o) { capas.push({ fn, o }); return () => capas.splice(capas.findIndex(c => c.fn === fn), 1); } };
  const lienzo = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => k === "measureText" ? () => ({ width: 10 }) : () => {}, set: () => true }) });
  const defs = [], g = {
    THREE, scene, gFauna, Bus, Minimapa, Componentes: { registra: d => { defs.push(d); return true; } }, console, Math, Date, setTimeout, clearTimeout,
    window: {}, document: { createElement: lienzo }, exag: 1, suelo: () => 0, altSuelo: () => 0, hash: i => (Math.sin(i * 12.9898) * 43758.5453) % 1 * 0.5 + 0.5,
    texColor: t => t, pp: { x: 0, y: 0, ang: 0, paso: 0 }, dr: { x: 0, y: 0, h: 0 }, teclas: { run: false }, cur: { lluvia: 0, hr: 40, viento: 1, dir: 0 },
    nivel: () => ({ d: 1 }), sueloSeco: () => true, pendienteRumbo: () => [0, 0], conejos: [], copas: [], D: { ext: [-500, 500, 500, -500] }, esc: {},
    camera: new THREE.PerspectiveCamera(), matSombra: new THREE.MeshBasicMaterial(), geoSombra: new THREE.PlaneGeometry(1, 1)
  };
  for (const k of ["paseando", "enQuad", "enDron", "vq", "tVida"]) Object.defineProperty(g, k, { get: () => E[k], enumerable: true });
  return { E, g, defs, log, capas, scene, gFauna, Bus };
}
function carga(fichero, m) {
  const ctx = vm.createContext(m.g);
  vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/" + fichero), ctx, { filename: fichero });
  assert.strictEqual(m.defs.length, 1, "un componente por fichero");
  return m.defs[0];
}
/** el contexto n que recibe monta(): lo enganchado se suelta al liberar */
function contexto(m) {
  const sueltas = [], n = { on: (ev, fn) => (sueltas.push(m.Bus.on(ev, fn)), fn), emite: (ev, d) => m.Bus.emite(ev, d), limpia: fn => (sueltas.push(fn), fn), api: () => null, parametros: {} };
  n.suelta = () => sueltas.splice(0).forEach(f => f());
  return n;
}
/** lo que se dibuja: mallas e instancias visibles (1 llamada cada una) y sus triángulos */
function dibujo(raiz) {
  let llamadas = 0, tri = 0, objs = 0;
  (function anda(o) {
    if (o.visible === false) return;
    if (o.isMesh || o.isPoints || o.isSprite) {
      objs++; llamadas++;
      if (!o.isPoints) { const gm = o.geometry, n = gm.index ? gm.index.count / 3 : gm.attributes.position.count / 3; tri += n * (o.isInstancedMesh ? o.count : 1); }
    }
    o.children.forEach(anda);
  })(raiz);
  return { llamadas, triangulos: tri, objetos: objs };
}
function espiaDispose(escena) {
  let n = 0; const orig = THREE.EventDispatcher.prototype.dispatchEvent;
  const f = function (e) { if (e && e.type === "dispose") n++; return orig.call(this, e); };
  THREE.EventDispatcher.prototype.dispatchEvent = f;
  return { cuenta: () => n, quita: () => { THREE.EventDispatcher.prototype.dispatchEvent = orig; } };
}

test("huellas-polvo: manifiesto, montaje con su presupuesto, el polvo por el Bus, las huellas al andar y liberar lo suelta todo", () => {
  const m = mundo(), d = carga("22b_huellas_polvo.js", m), n = contexto(m);
  assert.strictEqual(d.id, "huellas-polvo"); assert.strictEqual(d.bandera.url, "huellas"); assert.strictEqual(JSON.stringify(d.fases), "{\"mundo\":0}");
  assert.strictEqual(m.scene.children.length, 1, "antes de montar no hay nada en la escena (solo la fauna)");
  const api = d.monta(n);
  assert.strictEqual(m.scene.children.length, 3, "monta: una malla instanciada y una nube de puntos");
  assert.ok(m.Bus.hay("polvo:emite"));
  // 900 huellas (el anillo entero) y 200 bocanadas: lo máximo que puede dibujar
  for (let i = 0; i < 900; i++) api.emiteHuella(i, 0, 0, 0.13, 0.3, 1, 75);
  for (let i = 0; i < 250; i++) m.Bus.emite("polvo:emite", { x: i, y: 0, h: 0, vx: 1, vy: 0.5, vz: 0, tam: 0.3, vida: 0.9 });
  const dib = dibujo(m.scene); console.log("medido huellas-polvo (lleno):", JSON.stringify(dib));
  assert.ok(dib.llamadas <= d.presupuesto.llamadas && dib.triangulos <= d.presupuesto.triangulos, JSON.stringify(dib) + " frente a " + JSON.stringify(d.presupuesto));
  assert.strictEqual(api.huellas(), 900, "el anillo se queda en 900");
  // andar: una pisada por zancada
  const antes = api.huellas(); m.g.pp.paso = 0; api.actualiza(0.016); m.g.pp.paso = Math.PI * 3.2; m.E.tVida += 0.016; api.actualiza(0.016);
  assert.ok(api.huellas() >= antes, "sigue acotado");
  const sp = espiaDispose();
  try { d.libera(); n.suelta(); } finally { sp.quita(); }
  assert.ok(sp.cuenta() >= 4, "dispose de geometrías y materiales: " + sp.cuenta());
  assert.strictEqual(m.scene.children.length, 1, "liberar deja la escena como estaba");
  assert.ok(!m.Bus.hay("polvo:emite"), "y no escucha");
  assert.doesNotThrow(() => d.libera(), "liberar dos veces no rompe");
});

test("huellas-polvo: las bocanadas con el suelo mojado no salen y apagado (sin montar) nada se dibuja", () => {
  const m = mundo(), d = carga("22b_huellas_polvo.js", m);
  assert.strictEqual(dibujo(m.scene).llamadas, 0);
  assert.strictEqual(m.Bus.emite("polvo:emite", { x: 0, y: 0, h: 0 }), 0, "sin montar nadie atiende el polvo");
  assert.ok(d.presupuesto && typeof d.libera === "function");
});

test("perros-paseo: manifiesto, montaje (llamadas y triángulos reales), llegada, amenaza, capa del minimapa, ladrido y polvo por el Bus, y liberar suelta todo", () => {
  const m = mundo(), d = carga("25_perros.js", m), n = contexto(m);
  assert.strictEqual(d.id, "perros-paseo"); assert.strictEqual(d.bandera.url, "perros");
  assert.strictEqual(m.gFauna.children.length, 0);
  const api = d.monta(n);
  assert.strictEqual(m.gFauna.children.length, 1, "un grupo de perros colgado de la fauna");
  assert.strictEqual(m.capas.length, 1, "su capa del minimapa"); assert.ok(typeof m.g.window.__perrosDebug === "function");
  // todos fuera hasta que el muñequito aterriza
  assert.strictEqual(dibujo(m.gFauna).llamadas, 0);
  m.Bus.emite("perros:llegan");
  const ladridos = [], polvos = []; m.Bus.on("sonido:ladrido", x => ladridos.push(x)); m.Bus.on("polvo:emite", x => polvos.push(x));
  for (let i = 0; i < 30; i++) { m.E.tVida += 0.05; api.actualiza(0.05); }
  const dib = dibujo(m.gFauna); console.log("medido perros-paseo (los dos a la vista):", JSON.stringify(dib));
  assert.ok(dib.llamadas > 0 && dib.llamadas <= d.presupuesto.llamadas && dib.triangulos <= d.presupuesto.triangulos, JSON.stringify(dib) + " frente a " + JSON.stringify(d.presupuesto));
  const dbg = m.g.window.__perrosDebug(); assert.strictEqual(dbg.length, 2); assert.ok(dbg.every(p => p.vis && p.est !== "fuera"), JSON.stringify(dbg));
  // la amenaza: un conejo pegado al muñequito huye; lejos de todo, no
  const q1 = { x: 2, y: 0, res: null }; m.Bus.emite("perros:amenaza", q1); assert.ok(q1.res && typeof q1.res.x === "number", "huye de quien pasea");
  const q2 = { x: 300, y: 300, res: null }; m.Bus.emite("perros:amenaza", q2); assert.strictEqual(q2.res, null);
  // la capa del minimapa pinta sin romper
  const c2d = new Proxy({}, { get: () => () => {}, set: () => true });
  assert.doesNotThrow(() => m.capas[0].fn(c2d, x => x, y => y, {}));
  // el polvo con velocidad: un perro rápido y el suelo seco lo pide por el Bus (probabilístico, así que se fuerza)
  const perros = api.perros(); perros[0].v = 7; perros[0].est = "viene";
  const rnd = Math.random; Math.random = () => 0; try { m.E.tVida += 0.05; api.actualiza(0.05); } finally { Math.random = rnd; }
  assert.ok(polvos.length >= 1 && typeof polvos[0].x === "number" && polvos[0].tam === 0.35, "polvo:emite con sus campos");
  // dejar de pasear: se esconden
  m.E.paseando = false; api.actualiza(0.05); assert.strictEqual(dibujo(m.gFauna).llamadas, 0);
  m.E.paseando = true;
  const sp = espiaDispose();
  try { d.libera(); n.suelta(); } finally { sp.quita(); }
  assert.ok(sp.cuenta() >= 10, "dispose de geometrías, materiales y texturas: " + sp.cuenta());
  assert.strictEqual(m.gFauna.children.length, 0, "la fauna queda como estaba");
  assert.strictEqual(m.capas.length, 0); assert.ok(!m.Bus.hay("perros:llegan") && !m.Bus.hay("perros:amenaza"));
  assert.strictEqual(m.g.window.__perrosDebug, undefined);
  assert.doesNotThrow(() => d.libera());
});

test("perros-paseo: sin montar, nadie responde a la llegada ni a la amenaza (la fauna sigue sin perros)", () => {
  const m = mundo(); carga("25_perros.js", m);
  const q = { x: 0, y: 0, res: null }; assert.strictEqual(m.Bus.emite("perros:amenaza", q), 0); assert.strictEqual(q.res, null);
  assert.strictEqual(m.Bus.emite("perros:llegan"), 0);
});

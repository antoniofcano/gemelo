"use strict";
// C10, tercera tanda (doc/sistema/COMPONENTES.md): los componentes «medidor-fotogramas» (apps/web/motor/30_mide.js), «suelo-fondo» (04e_suelo_fondo.js) y
// «marcadores-lidar» (08_marcadores.js). En Node y sin navegador, con el three de verdad (el de apps/web) y un mundo y un DOM de mentira: se montan, se atienden
// los eventos del Bus, se cuentan llamadas y triángulos (los números de su presupuesto), y al liberar la escena queda como estaba y los recursos de GPU se
// sueltan (dispose). Lo de Chrome (que se vea igual, el panel de VR en el Quest) va por el banco; lo no probado en Quest ni iPhone sigue sin probar.
const test = require("node:test"), assert = require("node:assert"), vm = require("vm"), path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");

let THREE;
test.before(async () => { THREE = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); });

function bus() {
  const oy = {};
  return { on(ev, fn) { (oy[ev] = oy[ev] || []).push(fn); return () => { oy[ev] = (oy[ev] || []).filter(f => f !== fn); }; },
    emite(ev, d) { (oy[ev] || []).slice().forEach(f => f(d)); return (oy[ev] || []).length; }, hay: ev => !!(oy[ev] && oy[ev].length) };
}
/** el contexto que recibe monta(n), como el de 02c_componentes.js: lo que engancha con on/limpia se suelta con suelta() */
function contexto(Bus) {
  const sueltas = [], n = { on: (ev, fn) => { const q = Bus.on(ev, fn); sueltas.push(q); return q; }, emite: (ev, d) => Bus.emite(ev, d), limpia: fn => { if (typeof fn === "function") sueltas.push(fn); return fn; }, api: () => null, parametros: {} };
  n.suelta = () => sueltas.splice(0).reverse().forEach(f => f());
  return n;
}
function carga(fichero, g, defs) {
  g.Componentes = { registra: d => { defs.push(d); return true; } };
  vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/" + fichero), vm.createContext(g), { filename: fichero });
  assert.strictEqual(defs.length, 1, "un componente por fichero");
  return defs[0];
}
function dibujo(raiz) {
  let llamadas = 0, tri = 0;
  (function anda(o) {
    if (o.visible === false) return;
    if (o.isMesh || o.isPoints || o.isSprite || o.isLine || o.isLineSegments) {
      if (o.isInstancedMesh && o.count === 0) return;
      llamadas++;
      if (o.isMesh) { const gm = o.geometry, k = gm.index ? gm.index.count / 3 : gm.attributes.position.count / 3; tri += k * (o.isInstancedMesh ? o.count : 1); }
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
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

// ---------------------------------------------------------------- medidor-fotogramas
/** un elemento del DOM de mentira: lo justo para la caja del medidor */
function el() {
  const e = { style: {}, children: [], hidden: false, disabled: false, textContent: "", parentNode: null, listeners: {},
    appendChild(c) { c.parentNode = e; e.children.push(c); return c; }, removeChild(c) { e.children = e.children.filter(x => x !== c); c.parentNode = null; return c; },
    addEventListener(t, f) { (e.listeners[t] = e.listeners[t] || []).push(f); } };
  return e;
}
function mundoMide(busqueda, extra) {
  const Bus = bus(), visor = el(), ventana = {}, filas = [], docL = {};
  const g = Object.assign({
    Bus, visor, window: ventana, location: { search: busqueda || "" }, navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36" },
    document: { hidden: false, createElement: () => el(), addEventListener: (t, f) => (docL[t] = f), removeEventListener: t => delete docL[t] },
    renderer: { xr: { isPresenting: false } }, modo: "nube", D: { finca_id: "cerro", base: "t/" }, DEPURA: false, ConfigPuro: { prefijoApi: () => null },
    Ajustes: { lee: () => false }, Arboles: { resumen: () => ({ nivel0: 3, nivel1: 5, nivel2: 7 }) }, Escena3D: { resumen: () => ({ estado: "activo" }) },
    VRX: { on: false, nivel: null, soporta: false, entrando: false },
    PanelVR: { filas: (p, d) => { filas.push({ p, d }); return () => { const i = filas.findIndex(f => f.d === d); if (i >= 0) filas.splice(i, 1); }; } },
    localStorage: (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; })(),
    performance, Date, Math, JSON, Number, Array, Object, Promise, Error, console, setTimeout, clearTimeout, String, isFinite, isNaN, parseInt, RegExp
  }, extra || {});
  return { g, Bus, visor, ventana, filas, docL };
}

test("medidor-fotogramas: manifiesto, sin &mide no escucha el fotograma ni dibuja nada; la línea del contador y la fila de VR se enganchan por el Bus", () => {
  const m = mundoMide(), defs = [], d = carga("30_mide.js", m.g, defs), n = contexto(m.Bus);
  assert.strictEqual(d.id, "medidor-fotogramas"); assert.strictEqual(d.bandera.url, "medidor"); assert.strictEqual(JSON.stringify(d.fases), "{}");
  assert.deepStrictEqual([d.presupuesto.llamadas, d.presupuesto.triangulos], [0, 0]);
  assert.strictEqual(m.ventana.__mide, undefined, "antes de montar no hay gancho");
  const api = d.monta(n);
  assert.strictEqual(m.ventana.__mide().estado, "inactivo");
  assert.strictEqual(m.Bus.hay("cuadro:fin"), false, "sin &mide ni botón, el bucle no paga nada: nadie escucha el fotograma");
  assert.strictEqual(m.visor.children.length, 0, "sin ?debug ni &mide no hay caja");
  assert.strictEqual(m.filas.length, 1); assert.strictEqual(m.filas[0].p, "comodidad"); assert.strictEqual(m.filas[0].d.id, "mide");
  assert.strictEqual(m.filas[0].d.visible(), false, "la fila de VR solo con ?debug");
  for (const ev of ["depura:lineas", "medida:estado", "medida:envia", "medida:inicia", "medida:muestra"]) assert.ok(m.Bus.hay(ev), ev);
  const ext = { lineas: [] }; m.Bus.emite("depura:lineas", ext); assert.strictEqual(ext.lineas.length, 0, "inactivo no añade línea");
  const q = { res: null }; m.Bus.emite("medida:estado", q); assert.strictEqual(q.res.resultado, null); assert.strictEqual(q.res.lineas.length, 0); assert.strictEqual(q.res.puedeEnviar, false);
  assert.strictEqual(typeof api.inicia, "function");
  d.libera(); n.suelta();
  assert.strictEqual(m.ventana.__mide, undefined); assert.strictEqual(m.filas.length, 0);
  for (const ev of ["depura:lineas", "medida:estado", "medida:envia", "medida:inicia", "medida:muestra"]) assert.ok(!m.Bus.hay(ev), ev + " suelto");
  assert.doesNotThrow(() => d.libera(), "liberar dos veces no rompe");
});

test("medidor-fotogramas: medida:inicia mide con «cuadro:fin», termina, la tarjeta de VR y el contador piden sus datos por el Bus, y liberar lo suelta todo", () => {
  const m = mundoMide("?debug", { DEPURA: true, Ajustes: { lee: () => true } }), defs = [], d = carga("30_mide.js", m.g, defs), n = contexto(m.Bus), vistos = [];
  for (const ev of ["medida:empieza", "medida:fin", "medida:envio"]) m.Bus.on(ev, () => vistos.push(ev));
  d.monta(n);
  assert.strictEqual(m.visor.children.length, 1, "con ?debug la caja está en el visor"); assert.strictEqual(m.filas[0].d.visible(), true);
  m.Bus.emite("medida:inicia", { segundos: 2 });
  assert.strictEqual(m.ventana.__mide().estado, "midiendo"); assert.ok(m.Bus.hay("cuadro:fin"), "mientras mide escucha el fotograma");
  assert.strictEqual(vistos.length, 0, "en pantalla (no VR) la tarjeta del panel no se entera");
  const ext = { lineas: [] }; m.Bus.emite("depura:lineas", ext); assert.ok(/^medida: /.test(ext.lineas[0]), ext.lineas.join("|"));
  const t0 = performance.now(), FIN = { t: 0 };
  for (let i = 0; i < 80 && m.ventana.__mide().estado === "midiendo"; i++) { FIN.t = t0 + i * 100; m.Bus.emite("cuadro:fin", FIN); }   // 100 ms por fotograma: pasa de 3 s + 2 s
  const r = m.ventana.__mide(); assert.strictEqual(r.estado, "listo"); assert.ok(r.resultado.est.n >= 10, "fotogramas medidos: " + r.resultado.est.n);
  assert.strictEqual(r.resultado.duracion, 2); assert.strictEqual(r.resultado.olivos.join(), "3,5,7"); assert.strictEqual(r.resultado.escena, "tiles");
  assert.ok(!m.Bus.hay("cuadro:fin"), "al terminar deja de escuchar el fotograma");
  const q = { res: null }; m.Bus.emite("medida:estado", q);
  assert.ok(q.res.resultado && q.res.lineas.length >= 5 && /Intervalo/.test(q.res.lineas.join("\n")), "la tarjeta de VR recibe las líneas");
  assert.strictEqual(q.res.puedeEnviar, false, "sin api no hay envío"); assert.strictEqual(q.res.textoEnvio, "Enviar esta medida a la oficina");
  m.Bus.emite("depura:lineas", (ext.lineas = [], ext)); assert.ok(/^medida lista/.test(ext.lineas[0]));
  // dentro de VR avisa al panel
  m.g.VRX.on = true; m.Bus.emite("medida:inicia", { segundos: 1 }); assert.strictEqual(vistos.join(), "medida:empieza");
  for (let i = 0; i < 80 && m.ventana.__mide().estado === "midiendo"; i++) { FIN.t = performance.now() + i * 100; m.Bus.emite("cuadro:fin", FIN); }
  assert.strictEqual(vistos.join(), "medida:empieza,medida:fin");
  // medida:muestra esconde y enseña la caja
  m.Bus.emite("medida:muestra", { on: false }); m.Bus.emite("medida:muestra", { on: true });
  d.libera(); n.suelta();
  assert.strictEqual(m.visor.children.length, 0, "la caja sale del DOM"); assert.strictEqual(m.ventana.__mide, undefined);
  assert.ok(!m.Bus.hay("cuadro:fin") && !m.Bus.hay("medida:estado"));
});

test("medidor-fotogramas: ni 28_depura, ni 29_vr, ni 33_ajustes, ni 90_final nombran ya a Mide; hablan por el Bus", () => {
  const f = n => sinComentarios(lee("apps/web/motor/" + n + ".js")).replace(/"(?:[^"\\\n]|\\.)*"/g, "\"\"");
  for (const n of ["28_depura", "29_vr", "33_ajustes", "90_final"]) assert.ok(!/(?<![\w$.])(Mide|MideEst|vrMideEmpieza|vrMideEnvio|vrMideFin)(?![\w$])/.test(f(n)), n + " sigue nombrando al medidor");
  const bruto = n => lee("apps/web/motor/" + n + ".js");
  assert.match(bruto("90_final"), /Bus\.emite\("cuadro:fin", FIN\)/);
  assert.match(bruto("29_vr"), /Bus\.on\("medida:fin"/); assert.match(bruto("29_vr"), /Bus\.emite\("medida:estado", q\)/); assert.match(bruto("29_vr"), /Bus\.emite\("medida:envia"\)/);
  assert.match(bruto("33_ajustes"), /Bus\.emite\("medida:muestra"/); assert.match(bruto("33_ajustes"), /Bus\.emite\("medida:inicia"/);
});

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

// ---------------------------------------------------------------- suelo-fondo
function mundoFondo(grueso) {
  const scene = new THREE.Scene(), tex = new THREE.Texture(), est = { v: "activo" };
  const g = { THREE, scene, D: { mosaico: { x0: 1000, yN: 4000, w: 2000, h: 1500, res: 1 }, grueso: grueso || { x0: 1000, yN: 4000, w: 32, h: 64, res: 8 } },
    Mundo: { grueso: (x, y) => 100 + 0.01 * x + 0.02 * y }, UN: { uMos: { value: tex } }, matSuelo: new THREE.MeshLambertMaterial({}), Escena3D: { estado: () => est.v }, exag: 1, location: { search: "" } };
  return { g, scene, tex, est };
}

test("suelo-fondo: manifiesto, con la caja del fixture dibuja 1 llamada y 10.824 triángulos (los de pruebas/presupuesto.json), cabe en su tope y libera sin tocar la textura", () => {
  const m = mundoFondo(), d = carga("04e_suelo_fondo.js", m.g, []), n = contexto(bus());
  assert.strictEqual(d.id, "suelo-fondo"); assert.strictEqual(d.bandera.url, "fondo"); assert.strictEqual(JSON.stringify(d.fases), "{\"tarde\":0}");
  assert.strictEqual(m.scene.children.length, 0, "antes de montar la escena está vacía");
  const api = d.monta(n);
  assert.strictEqual(m.scene.children.length, 0, "montado, sin actualizar, tampoco dibuja");
  d.actualiza.tarde(0.016, 0, api);
  const dib = dibujo(m.scene); console.log("medido suelo-fondo (caja del fixture):", JSON.stringify(dib));
  assert.strictEqual(dib.llamadas, 1); assert.strictEqual(dib.triangulos, 10824);
  assert.ok(dib.llamadas <= d.presupuesto.llamadas && dib.triangulos <= d.presupuesto.triangulos);
  // el tope del manifiesto es el de una finca enorme (128 × 128 celdas): no se pasa
  const grande = mundoFondo({ x0: 0, yN: 10000, w: 5000, h: 5000, res: 8 }), d2 = carga("04e_suelo_fondo.js", grande.g, []);
  assert.strictEqual(d2.presupuesto.triangulos, 128 * 128 * 2);
  const api2 = d2.monta(contexto(bus())); api2.actualiza();
  assert.ok(dibujo(grande.scene).triangulos <= d2.presupuesto.triangulos, "una finca enorme sigue dentro del tope");
  d2.libera();
  const sp = espiaDispose();
  try { d.libera(); } finally { sp.quita(); }
  assert.strictEqual(sp.cuenta(), 2, "dispose de la geometría y del material, y de nada más (la textura es de 04d)");
  assert.strictEqual(m.scene.children.length, 0); assert.doesNotThrow(() => d.libera(), "liberar dos veces no rompe");
});

test("suelo-fondo: sin escena activa no existe, y 90_final ya no lo nombra", () => {
  const m = mundoFondo(), d = carga("04e_suelo_fondo.js", m.g, []), api = d.monta(contexto(bus()));
  m.est.v = "cargando"; api.actualiza(); assert.strictEqual(api.malla(), null);
  m.est.v = "activo"; api.actualiza(); assert.ok(api.malla());
  assert.ok(!/SueloFondo|suelo-fondo/.test(sinComentarios(lee("apps/web/motor/90_final.js"))), "el bucle ya no lo llama");
  d.libera();
});

// ---------------------------------------------------------------- marcadores-lidar
function mundoMarc(nCopas, nMarc, extra) {
  const Bus = bus(), scene = new THREE.Scene(), cas = { cCopas: { checked: true }, cMarc: { checked: true }, cDesf: { checked: false }, cLinde: { checked: true } };
  const copas = [], cIn = [], marc = [];
  for (let i = 0; i < nCopas; i++) { const c = { x: -60 + (i % 20) * 6, y: -40 + Math.floor(i / 20) * 6, h: 4 }; copas.push(c); cIn.push(c); }
  for (let i = 0; i < nMarc; i++) marc.push({ x: copas[i].x + 1, y: copas[i].y, par: i % 5 ? i : -1 });
  const estado = { listo: false, exag: 1 };
  const g = Object.assign({ THREE, scene, Bus, $: id => cas[id], colorCss: () => 0x58b6e8, cIn, marc, copas, suelo: () => 100, location: { search: "" } }, extra || {});
  Object.defineProperty(g, "listo", { get: () => estado.listo }); Object.defineProperty(g, "exag", { get: () => estado.exag });
  return { g, Bus, scene, cas, estado };
}

test("marcadores-lidar: manifiesto; mundo:aplica coloca copas, anillos y desfase; las casillas mandan; presupuesto medido (8·copas + 40·marcas); liberar suelta todo", () => {
  const m = mundoMarc(140, 60), d = carga("08b_marcadores_lidar.js", m.g, []), n = contexto(m.Bus);
  assert.strictEqual(d.id, "marcadores-lidar"); assert.strictEqual(d.bandera.url, "marcadores"); assert.strictEqual(JSON.stringify(d.fases), "{}");
  assert.strictEqual(m.scene.children.length, 0, "antes de montar la escena está vacía");
  const api = d.monta(n);
  assert.deepStrictEqual(m.scene.children.map(c => c.name), ["copas", "marcas", "desfase"]);
  assert.ok(m.Bus.hay("mundo:aplica") && m.Bus.hay("capas:cambia"));
  assert.strictEqual(m.scene.children[2].visible, false, "el desfase empieza apagado, como su casilla");
  // aplica(): coloca (y con la exageración, sube)
  m.Bus.emite("mundo:aplica");
  const mc = m.scene.children[0].children[0], mm = m.scene.children[1].children[0];
  assert.ok(Math.abs(mc.instanceMatrix.array[13] - (100 + 4 + 1.4)) < 1e-4, "la copa a la altura del suelo + h + 1,4");
  assert.ok(Math.abs(mm.instanceMatrix.array[13] - (100 + 0.35)) < 1e-4);
  m.estado.exag = 2; m.Bus.emite("mundo:aplica"); assert.ok(Math.abs(mc.instanceMatrix.array[13] - (100 + 4 + 1.4) * 2) < 1e-4, "sigue la exageración");
  assert.ok(m.scene.children[2].children[0].geometry.attributes.position.count > 0, "líneas de desfase");
  // presupuesto: copas y anillos visibles (casillas por defecto) y, con «Desfase», las líneas
  const dib = dibujo(m.scene); console.log("medido marcadores-lidar (140 copas, 60 marcas):", JSON.stringify(dib));
  assert.strictEqual(dib.llamadas, 2); assert.strictEqual(dib.triangulos, 8 * 140 + 40 * 60);
  m.cas.cDesf.checked = true; m.Bus.emite("capas:cambia"); assert.strictEqual(dibujo(m.scene).llamadas, 3, "con el desfase, la llamada de las líneas");
  m.cas.cCopas.checked = false; m.cas.cMarc.checked = false; m.Bus.emite("capas:cambia"); assert.strictEqual(dibujo(m.scene).triangulos, 0, "sin copas ni anillos");
  // techo del manifiesto: 10.000 copas y 10.000 marcas caben
  assert.ok(8 * 10000 + 40 * 10000 <= d.presupuesto.triangulos && d.presupuesto.llamadas >= 3);
  assert.ok(dib.llamadas <= d.presupuesto.llamadas && dib.triangulos <= d.presupuesto.triangulos);
  assert.strictEqual(typeof api.coloca, "function");
  const sp = espiaDispose();
  try { d.libera(); n.suelta(); } finally { sp.quita(); }
  assert.ok(sp.cuenta() >= 8, "dispose de mallas, geometrías y materiales: " + sp.cuenta());
  assert.strictEqual(m.scene.children.length, 0, "la escena queda como estaba"); assert.ok(!m.Bus.hay("mundo:aplica") && !m.Bus.hay("capas:cambia"));
  assert.doesNotThrow(() => d.libera(), "liberar dos veces no rompe");
});

test("marcadores-lidar: montado tarde (ya estaba listo) coloca al momento; sin montar, aplica() y capas() del núcleo no se rompen", () => {
  const m = mundoMarc(40, 10); m.estado.listo = true;
  const d = carga("08b_marcadores_lidar.js", m.g, []), api = d.monta(contexto(m.Bus));
  const mc = m.scene.children[0].children[0]; assert.ok(Math.abs(mc.instanceMatrix.array[13] - 105.4) < 1e-4, "ya colocado al montar");
  d.libera();
  // el núcleo (08_marcadores.js) con la bandera apagada: aplica y capas emiten y nadie escucha
  const Bus = bus(), gl = [], vistos = [];
  for (const ev of ["mundo:aplica", "capas:cambia"]) Bus.on(ev, () => vistos.push(ev));
  const g = { THREE, Bus, scene: new THREE.Scene(), D: { parcelas: [{}, {}] }, $: id => ({ cLinde: { checked: true }, notaModo: { textContent: "" }, cSolo: null }[id] || { checked: false, textContent: "" }),
    colocaBarrera: k => gl.push(k), nube: {}, gArboles: {}, gFollaje: {}, gSombras: {}, Arboles: { refresca() {} }, pintaNube() {}, colocaPaisaje() {}, colocaBalizas() {}, recoloreaSuelo() {},
    UN: { uExag: {}, uModoOrto: {} }, exag: 1, modo: "gem", avTipo: null, pintaAvance() {}, requestAnimationFrame: f => f() };
  const nucleo = vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/08_marcadores.js") + "\nlisto = true; aplica(); ({ gl: gLinde });", vm.createContext(g));
  assert.ok(nucleo.gl.isGroup); assert.strictEqual(gl.join(), "0,1", "las barreras de las parcelas siguen siendo del núcleo");
  assert.strictEqual(vistos.join(), "mundo:aplica,capas:cambia", "aplica avisa y nadie lo atiende: no se rompe");
});

test("marcadores-lidar: 08_marcadores.js ya no dibuja copas, anillos ni desfase; avisa por el Bus", () => {
  const f = sinComentarios(lee("apps/web/motor/08_marcadores.js"));
  assert.ok(!/mCopas|mMarc|desfGeo|gCopas|gMarc|gDesf|InstancedMesh/.test(f), "08_marcadores.js sigue dibujando los marcadores");
  assert.match(f, /Bus\.emite\("mundo:aplica"\)/); assert.match(f, /Bus\.emite\("capas:cambia"\)/);
});

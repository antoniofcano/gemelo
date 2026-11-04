"use strict";
// AG-1.5 «carga sin tirones»: el reloj de carga compartido, en Node (sin Chrome ni Docker), con un reloj de mentira que avanza lo que cuesta cada rebanada:
//   · CargaPuro.base (02b_cola): en escritorio da lo mismo que la regla de siempre de 07b_arboles; en móvil y gafas no pasa de cargaMs y en VR de
//     cargaMsVr (Aparato.politica); la deuda (lo que el tileset gastó en el motor) se descuenta; nunca negativo;
//   · la Cola (02b_cola, el módulo entero): con rebanadas de coste conocido, ningún fotograma pasa del presupuesto salvo por la rebanada inicial de
//     cada llamada (que va siempre: la Cola no se para); el desborde nunca es mayor que con la Cola de antes; el orden de las rebanadas, el de los
//     trabajos acabados y sus resultados son los MISMOS que con la Cola de antes (equivalencia); lo más cercano (menor prio) acaba antes;
//     Cola.debe / Cola.cobra / Cola.deuda;
//   · la cola propia de los generados (07ab_generados: corre y compiladoG): sin renderer el lote sale en el mismo next() (lo montado no cambia); con
//     un compileAsync que tarda, el trabajo duerme sin gastar el presupuesto en vueltas vacías, los demás siguen, y al acabar sale el mismo lote;
//   · CargaPuro.parseTiles y CargaPuro.prioridadRed (la pista de red de 04b_escena3d) y que 04b los usa.
// HONESTIDAD: los ms son de un reloj de mentira (deterministas), no de Chrome ni de un aparato. Lo que NO se prueba aquí: cuánto cuesta de verdad
// cada rebanada, cuánto tarda compileAsync en un Quest ni si Chrome atiende la prioridad de red: eso es del banco y del aparato (doc/sistema/MEDIDAS.md).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const { modulo } = require("./_aparato");

const MOTOR = path.join(RAIZ, "apps", "web", "motor"), lee = f => fs.readFileSync(path.join(MOTOR, f), "utf8");
const COLA = lee("02b_cola.js"), G07 = lee("07ab_generados.js"), B04 = lee("04b_escena3d.js"), A07 = lee("07b_arboles.js");
const { AparatoPuro } = modulo({});

// el módulo 02b entero sobre un reloj de mentira: reloj.t avanza lo que «cuesta» cada rebanada
function cola02b() {
  const reloj = { t: 0, now() { return this.t; } };
  const r = new Function("performance", "\"use strict\";\n" + COLA + "\nreturn { Cola, CargaPuro };")(reloj);
  r.reloj = reloj; return r;
}
const { CargaPuro } = cola02b();

// la Cola de antes de AG-1.5 (02b_cola.js en c8dd340), como referencia de la equivalencia
function colaAntes(performance) {
  var jobs = [], activos = {}, est = {};
  function add(clave, prio, gen, fin) { var j = activos[clave]; if (j) { j.prio = prio; return false; } j = { clave: clave, prio: prio, gen: gen, fin: fin }; jobs.push(j); activos[clave] = j; return true; }
  function corre(ms) {
    var t0 = performance.now();
    while (jobs.length && performance.now() - t0 < ms) {
      var bi = 0; for (var i = 1; i < jobs.length; i++) if (jobs[i].prio < jobs[bi].prio) bi = i;
      var j = jobs[bi];
      if (j.muerto) { jobs.splice(bi, 1); continue; }
      var r = j.gen.next();
      if (r.done) { jobs.splice(bi, 1); if (activos[j.clave] === j) delete activos[j.clave]; if (j.fin) j.fin(r.value); }
    }
  }
  return { add: add, corre: corre, est: est, pendientes: () => jobs.length };
}
// la regla de siempre de 07b_arboles.presupuestoBase (antes de AG-1.5)
const baseAntes = o => { const justo = o.emaDt > 0.034; if (o.faltan > 0 && !justo) return o.paseando ? 8 : 12; return justo ? (o.paseando ? 3 : 4.5) : (o.paseando ? 3.5 : 6); };

// un trabajo: costes[i] ms por rebanada; apunta cada rebanada en «traza» y acaba devolviendo su nombre
function* trabajo(reloj, nombre, costes, traza) { for (let i = 0; i < costes.length; i++) { reloj.t += costes[i]; traza.push(nombre + "#" + i); if (i < costes.length - 1) yield; } return "hecho:" + nombre; }
// costes pseudoaleatorios deterministas (semilla fija)
function azar(s) { return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
function lote(semilla) {
  const a = azar(semilla), L = [];
  for (let k = 0; k < 24; k++) { const n = 1 + Math.floor(a() * 30), tipo = "CNRDB"[k % 5], base = 0.2 + a() * 2.5; L.push({ clave: tipo + k, prio: Math.floor(a() * 400), costes: Array.from({ length: n }, () => +(base * (0.6 + a() * 0.8)).toFixed(3)) }); }
  return L;
}
// corre fotogramas con presupuesto ms hasta vaciar; devuelve la traza, los acabados, el gasto por fotograma y el desborde (gasto − ms) de cada uno
function simula(hazCola, L, ms) {
  const reloj = { t: 0, now() { return this.t; } }, C = hazCola(reloj), traza = [], acabados = [], gasto = [];
  L.forEach(j => C.add(j.clave, j.prio, trabajo(reloj, j.clave, j.costes, traza), v => acabados.push(v)));
  for (let f = 0; f < 100000 && C.pendientes(); f++) { const t0 = reloj.t; C.corre(ms); gasto.push(reloj.t - t0); }
  return { traza, acabados, gasto, fotogramas: gasto.length };
}
const nueva = reloj => new Function("performance", "\"use strict\";\n" + COLA + "\nreturn Cola;")(reloj);

test("CargaPuro.base: en escritorio, lo de siempre; móvil y gafas ≤ cargaMs, VR ≤ cargaMsVr; la deuda se descuenta y nunca baja de 0", () => {
  const esc = AparatoPuro.politica("escritorio", false), mov = AparatoPuro.politica("movil", false), q = AparatoPuro.politica("quest", false);
  assert.deepStrictEqual([esc.cargaMs, mov.cargaMs, q.cargaMs, esc.cargaMsVr], [12, 6, 6, 3]);
  for (const emaDt of [0.011, 0.017, 0.03, 0.04, 0.09]) for (const faltan of [0, 3]) for (const paseando of [false, true]) {
    const o = { emaDt, faltan, paseando }, b0 = baseAntes(o);
    assert.strictEqual(CargaPuro.base(Object.assign({ pol: esc }, o)), b0, "escritorio fuera de VR: igual que antes " + JSON.stringify(o));
    assert.strictEqual(CargaPuro.base(o), b0, "sin política: igual que antes");
    assert.strictEqual(CargaPuro.base(Object.assign({ pol: mov }, o)), Math.min(b0, 6));
    assert.strictEqual(CargaPuro.base(Object.assign({ pol: q }, o)), Math.min(b0, 6), "las gafas fuera de VR: el tope ligero");
    for (const pol of [esc, mov, q]) assert.strictEqual(CargaPuro.base(Object.assign({ pol, vr: true }, o)), Math.min(b0, 3), "en VR, el tope de VR");
    assert.strictEqual(CargaPuro.base(Object.assign({ pol: esc, deuda: 2 }, o)), b0 - 2);
    assert.strictEqual(CargaPuro.base(Object.assign({ pol: esc, deuda: 50 }, o)), 0);
    assert.strictEqual(CargaPuro.base(Object.assign({ pol: esc, deuda: -4 }, o)), b0, "una deuda negativa no da presupuesto de más");
  }
  assert.doesNotThrow(() => CargaPuro.base()); assert.doesNotThrow(() => CargaPuro.base({ pol: null }));
  assert.match(A07, /CargaPuro\.base\(oBase\)/, "07b_arboles toma su presupuesto de CargaPuro.base");
  assert.match(A07, /oBase\.vr = Aparato\.vr\(\); oBase\.deuda = Cola\.deuda\(\)/, "con la VR del Aparato y la deuda de la Cola");
});

test("Cola: ninguna rebanada se empieza si no cabe (salvo la inicial de cada fotograma) y el desborde nunca es mayor que antes", () => {
  for (const ms of [0.5, 2, 3, 6, 12]) for (const semilla of [1, 7, 42]) {
    const L = lote(semilla), a = simula(colaAntes, L, ms), n = simula(nueva, L, ms);
    const desA = Math.max(...a.gasto.map(g => g - ms)), desN = Math.max(...n.gasto.map(g => g - ms));
    assert.ok(desN <= desA + 1e-9, "ms " + ms + " semilla " + semilla + ": desborde " + desN.toFixed(2) + " > antes " + desA.toFixed(2));
    // rebanadas de coste parecido (± 40 % de la media de su tipo): el desborde de la nueva queda en menos de UNA rebanada de su tipo (la inicial) o
    // en lo que la media se queda corta; con la de antes era hasta una rebanada entera cada fotograma
    const maxReb = Math.max(...L.flatMap(j => j.costes));
    assert.ok(desN <= maxReb + 1e-9, "desborde " + desN + " > la mayor rebanada " + maxReb);
  }
  // rebanadas iguales: con la media aprendida, la nueva no se pasa NUNCA del presupuesto salvo con una sola rebanada (la que va siempre)
  const L = [{ clave: "C1", prio: 1, costes: Array(200).fill(1.5) }];
  const n = simula(nueva, L, 4), a = simula(colaAntes, L, 4);
  assert.ok(n.gasto.slice(1).every(g => g <= 4 + 1e-9), "con rebanadas de 1,5 ms y 4 ms de presupuesto, ningún fotograma pasa de 4: " + n.gasto.slice(0, 6));
  assert.ok(a.gasto.some(g => g > 4), "la Cola de antes sí se pasaba (4,5 ms): " + a.gasto.slice(0, 6));
});

test("Cola: equivalencia con la de antes (mismo orden de rebanadas, mismos acabados y resultados) y lo cercano (menor prio) acaba antes", () => {
  for (const semilla of [1, 7, 42]) for (const ms of [0.5, 3, 12]) {
    const L = lote(semilla), a = simula(colaAntes, L, ms), n = simula(nueva, L, ms);
    assert.deepStrictEqual(n.traza, a.traza, "el orden de las rebanadas cambió (semilla " + semilla + ", " + ms + " ms)");
    assert.deepStrictEqual(n.acabados, a.acabados, "el orden o el resultado de los trabajos acabados cambió");
    const porPrio = L.slice().sort((x, y) => x.prio - y.prio || L.indexOf(x) - L.indexOf(y)).map(j => "hecho:" + j.clave);
    assert.deepStrictEqual(n.acabados, porPrio, "con prioridades fijas, acaban por cercanía");
    assert.ok(n.fotogramas >= a.fotogramas, "repartir sin pasarse no puede necesitar menos fotogramas");
  }
});

test("Cola: deuda (debe, cobra, deuda) que se salda en corre, y est por fuente para ?debug", () => {
  const { Cola, reloj } = cola02b();
  assert.strictEqual(Cola.deuda(), 0);
  Cola.debe(2.5, "T"); Cola.debe(-1, "T"); Cola.debe(NaN, "T");
  assert.strictEqual(Cola.deuda(), 2.5); assert.strictEqual(Cola.est.T.n, 1);
  const f = Cola.cobra("T", function (x) { reloj.t += 4; return x * 2; });
  assert.strictEqual(f(21), 42); assert.strictEqual(Cola.deuda(), 6.5); assert.strictEqual(Cola.est.T.max, 4);
  const g = Cola.cobra("T", () => { reloj.t += 1; throw new Error("x"); });
  assert.throws(() => g()); assert.strictEqual(Cola.deuda(), 7.5, "lo que tardó se cobra aunque falle");
  Cola.corre(3); assert.strictEqual(Cola.deuda(), 0, "corre salda la deuda (ya se descontó del presupuesto de este fotograma)");
});

// ---- la cola propia de los generados: corre y compiladoG sacados de 07ab tal cual
function trozoFun(src, ini) { const a = src.indexOf(ini); assert.ok(a >= 0, "no está " + ini); const b = src.indexOf("\n    }\n", a); return src.slice(a, b + 6); }
function colaGenerados(reloj, renderer) {
  const cuerpo = "var trabajos = [], gastado = 0;\n" + trozoFun(G07, "    function corre(ms) {") + "\n" + trozoFun(G07, "    function* compiladoG(gen) {") +
    "\nfunction encola(clave, prio, gen, fin) { trabajos.push({ clave: clave, prio: prio, gen: gen, fin: fin }); }" +
    "\nreturn { corre: corre, compiladoG: compiladoG, encola: encola, trabajos: trabajos, gastado: function () { return gastado; } };";
  return new Function("performance", "renderer", "camera", "scene", "\"use strict\";\n" + cuerpo)(reloj, renderer, {}, {});
}
function* construye(reloj, g, n) { for (let i = 0; i < n; i++) { reloj.t += 1; yield; } return g; }

test("generados: sin renderer (Node) el lote sale en el mismo next(); con compileAsync, duerme sin gastar y sale el MISMO lote", async () => {
  const reloj = { t: 0, now() { return this.t; } }, lote = { nombre: "lote" };
  // sin compileAsync: igual que construyeG solo (mismo número de rebanadas, mismo lote)
  let G = colaGenerados(reloj, undefined), sale = null;
  G.encola("Glote", -1, G.compiladoG(construye(reloj, lote, 5)), v => { sale = v; });
  let vueltas = 0; while (G.trabajos.length && vueltas < 100) { G.corre(1); vueltas++; }
  assert.strictEqual(sale, lote); assert.strictEqual(vueltas, 6, "5 yield + la vuelta final, como sin compiladoG");
  // con un compileAsync que no acaba hasta que se le dice
  let suelta, llamadas = [];
  const renderer = { compileAsync(o, c, s) { llamadas.push(o); return new Promise(r => { suelta = r; }); } };
  G = colaGenerados(reloj, renderer); sale = null; const otros = [];
  G.encola("Glote", -1, G.compiladoG(construye(reloj, lote, 3)), v => { sale = v; });
  G.encola("Gp1", 5, construye(reloj, "receta", 40), v => otros.push(v));
  for (let f = 0; f < 4; f++) G.corre(2);
  assert.deepStrictEqual(llamadas, [lote], "el lote acabado se compila una vez, antes de entrar en la escena");
  assert.strictEqual(sale, null, "mientras compila, el lote no se coloca");
  const t0 = reloj.t; G.corre(2); assert.ok(reloj.t - t0 > 0, "los demás trabajos siguen mientras el lote espera");
  // solo el lote esperando: corre no da vueltas vacías (el reloj no se mueve y vuelve enseguida)
  while (G.trabajos.length > 1) G.corre(50);
  const t1 = reloj.t; G.corre(5); assert.strictEqual(reloj.t, t1); assert.strictEqual(G.gastado(), 0, "esperar no gasta presupuesto");
  suelta(); await new Promise(r => setTimeout(r, 0));
  G.corre(2); assert.strictEqual(sale, lote, "acabada la compilación, sale el mismo lote"); assert.strictEqual(G.trabajos.length, 0);
  // si compileAsync falla (o lanza), el lote entra igual
  G = colaGenerados(reloj, { compileAsync() { throw new Error("sin contexto"); } }); sale = null;
  G.encola("Glote", -1, G.compiladoG(construye(reloj, lote, 1)), v => { sale = v; }); for (let f = 0; f < 4; f++) G.corre(5);
  assert.strictEqual(sale, lote);
  G = colaGenerados(reloj, { compileAsync() { return Promise.reject(new Error("no")); } }); sale = null;
  G.encola("Glote", -1, G.compiladoG(construye(reloj, lote, 1)), v => { sale = v; }); G.corre(5); await new Promise(r => setTimeout(r, 0)); G.corre(5);
  assert.strictEqual(sale, lote);
  assert.strictEqual((G07.match(/seguro\(compiladoG\(construyeG\(items\)\)\)/g) || []).length, 2, "los dos sitios que montan el lote pasan por compiladoG");
});

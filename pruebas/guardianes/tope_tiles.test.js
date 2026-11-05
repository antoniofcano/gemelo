"use strict";
// Q0k (apps/web/motor/02l_tope_tiles.js; doc/sistema/VR.md#tope-de-triangulos-del-tileset-q0k): el lazo que sube el error del tileset 3D cuando sus
// triángulos pasan del tope del nivel de VR y lo baja cuando sobra. En Node, sin navegador, contra un modelo de escena:
//   · tri(k): los triángulos que dibujaría el tileset en el paso k (no crecen al subir el error), con retraso de carga y ruido;
//   · propiedades (fast-check): converge bajo el tope si hay paso que quepa; no oscila (cambios acotados en una escena quieta); baja cuando sobra;
//     nunca se sale de [eBase, errMax]; con el tope a 0, el error del nivel y nada más;
//   · las perillas ?xrtri= y ?xrtrierr= (02f) y que 04b y 02f lo enganchan (texto).
// Lo que NO dice: fps ni triángulos en un casco. No probado en Quest (la medida: ?debug&mide=60 con y sin ?xrtri=0, desde la llegada, sin girar).
const test = require("node:test"), assert = require("node:assert");
const fc = require("fast-check");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/02l_tope_tiles.js");
function trozo(src, ini, fin) { const i = src.indexOf(ini), f = src.indexOf(fin); assert.ok(i >= 0 && f > i, "debe marcar " + ini + " … " + fin); return src.slice(i, f); }
const T = new Function("\"use strict\";\n" + trozo(FUENTE, "// [puro:inicio]", "// [puro:fin]") + "\nreturn TopeTilesPuro;")();
const PER = lee("apps/web/motor/02f_xr_perillas.js");
const XP = new Function("\"use strict\";\n" + trozo(PER, "// [puro:inicio]", "// [puro:fin]") + "\nreturn XrPerillasPuro;")();
const D = T.DEF;

// simula `seg` segundos con muestras de D.MUESTRA. escena(k, t) → tri. retraso: s que tarda un cambio de error en verse (carga de teselas).
// → { s, serie: [{ t, k, tri, e }] }
function simula(o) {
  const s = o.s || T.nuevo(), dtm = D.MUESTRA, n = Math.round(o.seg / dtm), serie = [];
  let kVisto = s.k, tCambio = -1e9, kAnt = s.k;
  for (let i = 0; i < n; i++) {
    const t = i * dtm;
    if (s.k !== kAnt) { tCambio = t; kAnt = s.k; }
    const cargando = t - tCambio < (o.retraso || 0);
    if (!cargando) kVisto = s.k;
    const tri = o.escena(kVisto, t);
    const pos = o.pos ? o.pos(t) : [0, 0];
    const e = T.paso(s, { dt: dtm, tri, tope: o.tope, eBase: o.eBase, errMax: o.errMax, cargando, x: pos[0], z: pos[1] });
    serie.push({ t, k: s.k, tri, e });
  }
  return { s, serie };
}
// escena quieta: tri(k) = base · r^k (r < 1: subir el error quita triángulos), con suelo
const quieta = (base, r, suelo) => (k) => Math.max(suelo || 0, base * Math.pow(r, k));

test("pasos y error: de eBase a errMax por pasos de ×PASO, sin pasarse", () => {
  assert.strictEqual(T.pasos(48, 128), 5);   // 48 · 1,25^5 = 146 > 128 → el último paso se recorta a 128
  assert.strictEqual(T.error(48, 5, 128), 128);
  assert.strictEqual(T.error(48, 0, 128), 48);
  assert.strictEqual(T.pasos(16, 16), 0); assert.strictEqual(T.pasos(200, 128), 0);
  assert.strictEqual(T.error(200, 0, 128), 200, "si el nivel ya pide más que errMax, manda el nivel");
});

test("con el tope a 0 (xrtri=0) o sin nivel: el error del nivel, sin memoria ni cambios", () => {
  const s = T.nuevo();
  for (let i = 0; i < 100; i++) assert.strictEqual(T.paso(s, { dt: 0.25, tri: 9e6, tope: 0, eBase: 48, errMax: 128, x: 0, z: 0 }), 48);
  assert.strictEqual(s.cambios, 0); assert.strictEqual(s.activo, false);
  assert.strictEqual(T.paso(s, { dt: 0.25, tri: 9e6, tope: 130000, eBase: 0, errMax: 128 }), null, "fuera de VR: nada");
});

test("caso del Quest (nivel 3): 220 k frente a 130 k sube el error hasta caber, y no se mueve más", () => {
  const { s, serie } = simula({ seg: 120, tope: 130000, eBase: 48, errMax: 128, retraso: 0.75, escena: quieta(220000, 0.78) });
  const fin = serie[serie.length - 1];
  assert.ok(fin.tri <= 130000, "acaba bajo el tope: " + fin.tri);
  assert.strictEqual(s.bajadas, 0, "no baja a un paso que no cabía");
  assert.ok(fin.e > 48 && fin.e <= 128);
  const primero = serie.findIndex(m => m.tri <= 130000);
  assert.ok(primero >= 0 && serie[primero].t < 15, "cabe en menos de 15 s: " + (primero >= 0 && serie[primero].t));
});

// propiedad: escena quieta y monótona, con un paso que cabe → converge bajo el tope y se queda (salvo las visitas, tras OLVIDA_S, al paso de abajo)
test("propiedad: converge bajo el tope y no oscila (escena quieta, con retraso de carga)", () => {
  fc.assert(fc.property(
    fc.integer({ min: 40000, max: 800000 }), fc.double({ min: 0.5, max: 0.95, noNaN: true }), fc.integer({ min: 0, max: 5 }),
    fc.constantFrom(16, 24, 32, 48), fc.constantFrom(64, 128, 256), fc.double({ min: 0, max: 1.4, noNaN: true }), fc.integer({ min: 30000, max: 400000 }),
    (base, r, k0, eBase, errMax, retraso, tope) => {
      const K = T.pasos(eBase, errMax), esc = quieta(base, r);
      fc.pre(esc(K) <= tope * 0.98);   // hay un paso que cabe
      const s = T.nuevo(); s.k = Math.min(k0, K);
      const seg = 600, { serie } = simula({ s, seg, tope, eBase, errMax, retraso, escena: esc });
      const kOk = (() => { for (let k = 0; k <= K; k++) if (esc(k) <= tope) return k; return K; })();
      // tras converger (30 s), el tiempo por encima del tope se acota: como mucho una visita (GUARDA + SOBRE_S + retraso + muestra) por cada OLVIDA_S
      const tras = serie.filter(m => m.t >= 30), sobre = tras.filter(m => m.tri > tope).length * D.MUESTRA;
      const visitas = Math.ceil((seg - 30) / D.OLVIDA_S) + 1, porVisita = D.GUARDA + D.SOBRE_S + retraso + 2 * D.MUESTRA + D.CARGA_MAX * (retraso > 0 ? 1 : 0);
      if (sobre > visitas * porVisita) return false;
      // no oscila: cambios acotados (llegar: ≤ 2K+2; luego, ≤ 2 por cada OLVIDA_S)
      if (s.cambios > 2 * K + 2 + 2 * visitas) return false;
      // y acaba en el paso justo o uno por encima (la memoria es conservadora: no baja a ciegas)
      const kFin = serie[serie.length - 1].k;
      return kFin >= kOk && kFin <= Math.min(K, kOk + 1) || esc(kFin) <= tope && esc(kFin) >= tope * D.BAJO;
    }), { numRuns: 300 });
});

test("propiedad: nunca se sale de [eBase, max(eBase, errMax)] y el paso está en [0, K]", () => {
  fc.assert(fc.property(
    fc.array(fc.integer({ min: 0, max: 600000 }), { minLength: 20, maxLength: 400 }), fc.constantFrom(16, 24, 32, 48), fc.constantFrom(16, 64, 128, 256), fc.integer({ min: 20000, max: 400000 }),
    (tris, eBase, errMax, tope) => {
      const s = T.nuevo(), K = T.pasos(eBase, errMax);
      for (let i = 0; i < tris.length; i++) {
        const e = T.paso(s, { dt: 0.25, tri: tris[i], tope, eBase, errMax, cargando: i % 7 === 0, x: i, z: 0 });
        if (!(e >= eBase - 1e-9 && e <= Math.max(eBase, errMax) + 1e-9) || s.k < 0 || s.k > K) return false;
      }
      return true;
    }), { numRuns: 300 });
});

test("propiedad: baja cuando sobra (escena ligera: vuelve al error del nivel)", () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 1000, max: 90000 }), fc.double({ min: 0, max: 1, noNaN: true }), (k0, tri, retraso) => {
    const s = T.nuevo(); s.k = Math.min(k0, T.pasos(48, 128));
    const { serie } = simula({ s, seg: 60, tope: 130000, eBase: 48, errMax: 128, retraso, escena: () => tri });
    return serie[serie.length - 1].k === 0 && serie[serie.length - 1].e === 48;
  }), { numRuns: 200 });
});

test("propiedad: con ruido (±8 %) en una escena quieta, los cambios siguen acotados", () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 2 ** 30 }), fc.integer({ min: 150000, max: 400000 }), fc.double({ min: 0.6, max: 0.9, noNaN: true }), (semilla, base, r) => {
    let x = semilla; const ruido = () => { x = (x * 1103515245 + 12345) % 2147483648; return 1 + 0.16 * (x / 2147483648 - 0.5); };
    const K = T.pasos(48, 128), esc = k => base * Math.pow(r, k) * ruido();
    fc.pre(base * Math.pow(r, K) * 1.08 <= 130000);
    const s = T.nuevo(), seg = 600;
    simula({ s, seg, tope: 130000, eBase: 48, errMax: 128, retraso: 0.5, escena: esc });
    return s.cambios <= 2 * K + 2 + 2 * (Math.ceil(seg / D.OLVIDA_S) + 1);
  }), { numRuns: 200 });
});

test("una mirada de un instante a lo denso (menos de SOBRE_S) no sube el error", () => {
  const { s } = simula({ seg: 30, tope: 130000, eBase: 48, errMax: 128, escena: (k, t) => (t % 10 < 0.25 ? 300000 : 100000) });
  assert.strictEqual(s.subidas, 0);
});

test("moverse más de OLVIDA_M olvida la memoria: en otro sitio más ligero vuelve a bajar", () => {
  const s = T.nuevo();
  // primero, sitio denso: sube; luego camina 60 m a un sitio ligero
  simula({ s, seg: 40, tope: 130000, eBase: 48, errMax: 128, escena: quieta(220000, 0.78) });
  const kDenso = s.k; assert.ok(kDenso > 0);
  simula({ s, seg: 40, tope: 130000, eBase: 48, errMax: 128, escena: () => 60000, pos: t => [Math.min(60, t * 2), 0] });
  assert.strictEqual(s.k, 0, "en el sitio ligero, el error del nivel");
});

test("cambiar de nivel (otro eBase) olvida lo aprendido y recorta el paso a los que caben", () => {
  const s = T.nuevo(); s.k = 5;
  T.paso(s, { dt: 0.25, tri: 100000, tope: 130000, eBase: 96, errMax: 128, x: 0, z: 0 });
  assert.strictEqual(s.K, T.pasos(96, 128)); assert.ok(s.k <= s.K); assert.ok(s.error <= 128);
});

test("la línea: tri del tileset, tope, mallas, error y paso; apagado con xrtri=0; nada fuera de VR", () => {
  const s = T.nuevo();
  assert.strictEqual(T.linea(s), "");
  T.paso(s, { dt: 0.25, tri: 152400, tope: 130000, eBase: 48, errMax: 128, x: 0, z: 0 });
  assert.strictEqual(T.linea(s, { mallas: 41 }), "tileset 152 k / tope 130 k tri · 41 mallas · error 48 px (lazo 0/5)");
  const a = T.nuevo(); T.paso(a, { dt: 0.25, tri: 200000, tope: 0, eBase: 48, errMax: 128 });
  assert.strictEqual(T.linea(a, { apagado: true, tri: 200000 }), "tileset 200 k tri · error 48 px (lazo apagado: xrtri=0)");
});

test("perillas (02f): ?xrtri=0 apaga, ?xrtri=N fija el tope, ?xrtrierr=, con recortes dichos", () => {
  assert.deepStrictEqual(XP.leeTiles(""), { tri: null, err: null, ignorados: [] });
  assert.strictEqual(XP.leeTiles("?xrtri=0").tri, 0);
  assert.strictEqual(XP.leeTiles("?xrtri=150000&xrtrierr=96").tri, 150000);
  assert.strictEqual(XP.leeTiles("?xrtri=150000&xrtrierr=96").err, 96);
  const bajo = XP.leeTiles("?xrtri=100"); assert.strictEqual(bajo.tri, 20000); assert.match(bajo.ignorados[0].motivo, /recortado a 20000/);
  assert.strictEqual(XP.leeTiles("?xrtrierr=999").err, 256);
  assert.strictEqual(XP.leeTiles("?xrtri=mucho").tri, null); assert.strictEqual(XP.leeTiles("?xrtri=mucho").ignorados[0].motivo, "no es un número");
  assert.strictEqual(XP.DEFT.err, D.ERR_MAX, "el defecto de la perilla y el del lazo son el mismo");
});

test("enganche (texto): 04b mide solo en VR y pone el error; 02f da el tope y la línea; 29_vr no cambia", () => {
  const E = lee("apps/web/motor/04b_escena3d.js");
  assert.match(E, /if \(errorPerfil\) muestraTope\(cx\);/, "solo con el perfil de VR puesto (en pantalla y móvil no corre)");
  assert.match(E, /TopeTilesPuro\.paso\(tope, mm\)/);
  assert.match(E, /XrPerillas\.topeTiles\(triNivel\)/);
  assert.match(E, /XrPerillas\.lineaTiles = function/);
  assert.match(E, /tiles\.visibleTiles\.forEach\(sumaVisible\)/);
  assert.match(PER, /X\.lineaTiles \? X\.lineaTiles\(\) : ""/);
  assert.match(lee("apps/web/motor/29_vr.js"), /Escena3D\.perfil\(p\)/, "el nivel de VR sigue llegando por Escena3D.perfil");
});

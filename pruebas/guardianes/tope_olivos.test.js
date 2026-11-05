"use strict";
// Q0n (apps/web/motor/02m_tope_olivos.js; doc/sistema/VR.md#tope-de-triángulos-de-los-olivos-del-motor-q0n): los olivos que dibuja el motor (07b,
// 07ab, 07ac) respetan también el tope de triángulos de cada nivel de VR. En Node, sin navegador, contra un modelo de escena:
//   · la reserva (FR × T), la parte del tileset (T − lo que ocupan, con pico retenido y en pasos), el presupuesto (reserva × f) y ?xrolivos=;
//   · propiedades (fast-check): f siempre en [F_MIN, 1]; converge bajo la reserva si hay factor que quepa; no oscila; vuelve a 1 cuando sobra;
//     la suma de la parte del tileset y lo que ocupan nunca pasa de T; con el tope a 0 (xrtri=0) o xrolivos=0, f = 1 y el tileset con T entero;
//   · que 07b y 04b lo enganchan (texto) y que fuera de VR el reparto de 07b no cambia (BO = Infinity, f = 1).
// Lo que NO dice: fps ni triángulos en un casco. No probado en Quest (la medida: ?debug&mide=60 con y sin &xrolivos=0, desde la llegada, sin girar).
const test = require("node:test"), assert = require("node:assert");
const fc = require("fast-check");
const { lee } = require("./_util");

function trozo(src, ini, fin) { const i = src.indexOf(ini), f = src.indexOf(fin); assert.ok(i >= 0 && f > i, "debe marcar " + ini + " … " + fin); return src.slice(i, f); }
const PURO = (f) => trozo(lee(f), "// [puro:inicio]", "// [puro:fin]");
const { O, T } = new Function("\"use strict\";\n" + PURO("apps/web/motor/02l_tope_tiles.js") + PURO("apps/web/motor/02m_tope_olivos.js") + "\nreturn { O: TopeOlivosPuro, T: TopeTilesPuro };")();
const D = O.DEF, MU = T.DEF.MUESTRA;

// simula `seg` s con muestras de MUESTRA. escena(f, t) → los triángulos de los olivos del motor con el factor f; retraso: s hasta que se ve un cambio
function simula(o) {
  const s = o.s || O.nuevo(), n = Math.round(o.seg / MU), serie = [];
  let fVisto = s.f, tCambio = -1e9, fAnt = s.f;
  for (let i = 0; i < n; i++) {
    const t = i * MU;
    if (s.f !== fAnt) { tCambio = t; fAnt = s.f; }
    const cargando = t - tCambio < (o.retraso || 0);
    if (!cargando) fVisto = s.f;
    const tri = o.escena(fVisto, t), pos = o.pos ? o.pos(t) : [0, 0];
    const f = O.paso(s, { dt: MU, tri, tope: o.tope, fr: o.fr === undefined ? null : o.fr, cargando, x: pos[0], z: pos[1] });
    serie.push({ t, f, tri, tiles: O.parteTiles(s, o.tope), ocupa: s.ocupa });
  }
  return { s, serie };
}
// olivos del motor: proporcionales al factor (el número de nivel 0 y los presupuestos van × f), con un suelo (el más cercano siempre está)
const lineal = (base, suelo) => (f) => Math.max(suelo || 0, base * f);

test("reserva, fracción y ?xrolivos=: 30 % por defecto, 0 apaga, recortes dichos", () => {
  assert.strictEqual(O.reserva(130000, null), 39000);
  assert.strictEqual(O.reserva(130000, 0), 0);
  assert.strictEqual(O.reserva(0, null), 0, "con xrtri=0 no hay reserva");
  assert.strictEqual(O.reserva(380000, 0.5), 190000);
  assert.deepStrictEqual(O.lee("?debug&xrolivos=0"), { fr: 0, ignorados: [] });
  assert.strictEqual(O.lee("?xrolivos=0.4").fr, 0.4);
  assert.strictEqual(O.lee("?xrolivos=0,4").fr, 0.4, "con coma también");
  assert.strictEqual(O.lee("").fr, null);
  const alto = O.lee("?xrolivos=2"); assert.strictEqual(alto.fr, D.FR_MAX); assert.match(alto.ignorados[0].motivo, /recortado a 0.7/);
  const bajo = O.lee("?xrolivos=0.01"); assert.strictEqual(bajo.fr, D.FR_MIN);
  assert.strictEqual(O.lee("?xrolivos=mucho").fr, null); assert.strictEqual(O.lee("?xrolivos=mucho").ignorados[0].motivo, "no es un número");
});

test("apagado (tope 0 = xrtri=0, o xrolivos=0) o fuera de VR: f = 1, sin reserva, el tileset con el tope entero", () => {
  for (const [tope, fr] of [[0, null], [130000, 0], [0, 0.3]]) {
    const s = O.nuevo();
    for (let i = 0; i < 100; i++) assert.strictEqual(O.paso(s, { dt: MU, tri: 9e6, tope, fr, x: 0, z: 0 }), 1);
    assert.strictEqual(s.activo, false); assert.strictEqual(s.lazo.cambios, 0);
    assert.strictEqual(O.parteTiles(s, tope), tope); assert.strictEqual(O.presupuesto(s), Infinity, "07b reparte como siempre");
    assert.strictEqual(O.linea(s), "");
  }
});

test("caso del Quest (nivel 3, 130 k): 90 k de olivos del motor bajan bajo su reserva de 39 k, y no se mueven más", () => {
  const { s, serie } = simula({ seg: 120, tope: 130000, retraso: 0.75, escena: lineal(90000) });
  const fin = serie[serie.length - 1];
  assert.ok(fin.tri <= 39000, "acaba bajo la reserva: " + fin.tri);
  assert.ok(fin.f >= D.F_MIN && fin.f < 1, "factor " + fin.f);
  assert.strictEqual(s.lazo.bajadas, 0, "no vuelve a un factor que no cabía");
  assert.ok(fin.tiles + fin.ocupa <= 130000 && fin.tiles >= 130000 - 39000, "el tileset recibe el resto: " + fin.tiles);
  const primero = serie.findIndex(m => m.tri <= 39000);
  assert.ok(primero >= 0 && serie[primero].t < 20, "cabe en menos de 20 s: " + (primero >= 0 && serie[primero].t));
});

test("si los olivos del motor gastan poco, el tileset no pierde: su parte es T menos lo que ocupan (en pasos de 5 %)", () => {
  const { serie } = simula({ seg: 20, tope: 130000, escena: () => 7000 });
  const fin = serie[serie.length - 1];
  assert.strictEqual(fin.f, 1);
  assert.strictEqual(fin.ocupa, 13000, "7 k → un paso de 6,5 k no basta: 2 pasos = 13 k");
  assert.strictEqual(fin.tiles, 117000);
});

test("el pico se retiene RETEN_S s: un bajón breve no le da al tileset lo que los olivos vuelven a pedir", () => {
  const s = O.nuevo(), m = (tri) => O.paso(s, { dt: MU, tri, tope: 130000, fr: null, x: 0, z: 0 });
  for (let i = 0; i < 8; i++) m(30000);
  assert.strictEqual(s.ocupa, 32500);
  for (let i = 0; i < Math.floor(D.RETEN_S / MU) - 1; i++) m(5000);
  assert.strictEqual(s.ocupa, 32500, "aún retenido");
  m(5000); m(5000);
  assert.strictEqual(s.ocupa, 6500, "pasado RETEN_S, baja a lo de ahora");
});

test("propiedad: f en [F_MIN, 1]; la parte del tileset y lo que ocupan nunca pasan de T; ocupa ≤ reserva", () => {
  fc.assert(fc.property(
    fc.array(fc.integer({ min: 0, max: 600000 }), { minLength: 20, maxLength: 400 }), fc.integer({ min: 20000, max: 400000 }), fc.constantFrom(null, 0.1, 0.3, 0.5, 0.7),
    (tris, tope, fr) => {
      const s = O.nuevo();
      for (let i = 0; i < tris.length; i++) {
        const f = O.paso(s, { dt: MU, tri: tris[i], tope, fr, cargando: i % 7 === 0, x: i, z: 0 });
        if (!(f >= D.F_MIN - 1e-9 && f <= 1 + 1e-9)) return false;
        if (O.parteTiles(s, tope) + s.ocupa > tope + 1e-6 || s.ocupa > s.reserva + 1e-6 || O.parteTiles(s, tope) < 0) return false;
        if (Math.abs(O.presupuesto(s) - s.reserva * f) > 1e-6) return false;
      }
      return true;
    }), { numRuns: 300 });
});

// escena quieta y monótona en f, con un factor que cabe → converge bajo la reserva y no oscila
test("propiedad: converge bajo la reserva y no oscila (escena quieta, con retraso de construcción)", () => {
  fc.assert(fc.property(
    fc.integer({ min: 5000, max: 400000 }), fc.integer({ min: 0, max: 20000 }), fc.integer({ min: 40000, max: 400000 }), fc.constantFrom(null, 0.2, 0.3, 0.5), fc.double({ min: 0, max: 1.4, noNaN: true }),
    (base, suelo, tope, fr, retraso) => {
      const R = O.reserva(tope, fr), esc = lineal(base, suelo);
      fc.pre(esc(D.F_MIN) <= R * 0.98);
      const seg = 600, { s, serie } = simula({ seg, tope, fr, retraso, escena: esc });
      const tras = serie.filter(m => m.t >= 40), sobre = tras.filter(m => m.tri > R).length * MU;
      const visitas = Math.ceil((seg - 40) / T.DEF.OLVIDA_S) + 1, porVisita = T.DEF.GUARDA + T.DEF.SOBRE_S + retraso + 2 * MU + T.DEF.CARGA_MAX;
      if (sobre > visitas * porVisita) return false;
      const K = s.lazo.K;
      return s.lazo.cambios <= 2 * K + 2 + 2 * visitas;
    }), { numRuns: 300 });
});

test("propiedad: cuando sobra, vuelve a f = 1", () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 7 }), fc.integer({ min: 0, max: 25000 }), fc.double({ min: 0, max: 1, noNaN: true }), (k0, tri, retraso) => {
    const s = O.nuevo();
    O.paso(s, { dt: 0, tri: 0, tope: 130000, fr: null, x: 0, z: 0 });
    s.lazo.k = Math.min(k0, s.lazo.K); s.f = 1 / T.error(1, s.lazo.k, 1 / D.F_MIN);
    const { serie } = simula({ s, seg: 90, tope: 130000, retraso, escena: () => tri });
    return serie[serie.length - 1].f === 1;
  }), { numRuns: 200 });
});

test("una mirada breve a lo denso no recorta; cambiar de nivel olvida la memoria pero conserva el factor", () => {
  const { s } = simula({ seg: 30, tope: 130000, escena: (f, t) => (t % 10 < 0.25 ? 200000 : 20000) });
  assert.strictEqual(s.lazo.subidas, 0);
  const s2 = simula({ seg: 40, tope: 130000, escena: lineal(90000) }).s, f2 = s2.f;
  assert.ok(f2 < 1 && s2.lazo.mem.some(Boolean));
  O.paso(s2, { dt: MU, tri: 20000, tope: 190000, fr: null, x: 0, z: 0 });
  assert.ok(!s2.lazo.mem.some(Boolean), "memoria olvidada"); assert.strictEqual(s2.f, f2, "el factor se queda"); assert.strictEqual(s2.reserva, 57000);
});

test("la línea: olivos, reserva, factor y paso; apagado con xrolivos=0; nada sin tope", () => {
  const { s } = simula({ seg: 40, tope: 130000, escena: lineal(90000) });
  assert.match(O.linea(s), /^olivos \d+ k \/ 39 k tri · ×0,\d+ \(lazo \d\/\d(, saturado)?\)$/);
  assert.strictEqual(O.linea(O.nuevo(), { apagado: true, tri: 52000 }), "olivos del motor 52 k tri (sin tope: xrolivos=0)");
  assert.strictEqual(O.linea(O.nuevo()), "");
});

test("enganche (texto): 07b recorta solo en VR y fuera de VR reparte como siempre; 04b le da al tileset su parte", () => {
  const A = lee("apps/web/motor/07b_arboles.js"), E = lee("apps/web/motor/04b_escena3d.js"), M = lee("apps/web/motor/02m_tope_olivos.js");
  assert.match(A, /var QO = !!vrP && TopeOlivos\.activo\(\), BO = QO \? TopeOlivos\.presupuesto\(\) : Infinity, fO = QO \? TopeOlivos\.factor\(\) : 1;/, "fuera de VR: BO = Infinity y f = 1");
  assert.match(A, /Math\.min\(BO, Math\.max\(0, TOPE_TRI - triTil\)\)/, "los generados: min(Infinity, x) = x fuera de VR");
  assert.match(A, /var tope0 = MAX0 \* esc \* \(vrP \? vrP\.n : 1\) \* fO;/);
  assert.match(A, /Math\.min\(TOPE_TRI, BO\)/);
  assert.match(A, /if \(vrP\) muestraTopeOlivos\(dt\);/, "la muestra, solo en VR");
  assert.match(A, /XrPerillas\.topeTiles\(vrP\.tri\)/, "el tope de los olivos es el del tileset: ?xrtri=0 apaga los dos");
  assert.match(A, /else \{ TopeOlivos\.apaga\(\); triMotor = 0; \}/, "al salir de VR, apagado");
  assert.match(A, /return vrP && TopeOlivos\.activo\(\) \? r \* Math\.sqrt\(TopeOlivos\.factor\(\)\) : r;/, "el radio del nivel 0, × √f solo en VR");
  assert.match(A, /if \(vrP && TopeOlivos\.activo\(\)\) presEsc = Math\.min\(presEsc/, "la escalera también");
  assert.match(E, /mm\.tope = TopeOlivos\.parteTiles\(XrPerillas\.topeTiles\(triNivel\)\);/);
  assert.match(E, /TopeOlivos\.linea\(/);
  assert.match(M, /TopeTilesPuro\.paso\(s\.lazo, mm\)/, "reutiliza el lazo de Q0k (regla 12)");
});

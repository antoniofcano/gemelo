"use strict";
// Presencia compartida (F2, contratos/presencia.md y contratos/livekit-roles.json). En Node: el códec de pose (tamaños exactos, disposición de los bytes,
// ida y vuelta con errores máximos medidos, rechazo de lo que no es del contrato, vueltas de la secuencia y del reloj) y el búfer de interpolación, evaluando
// el trozo puro de apps/web/motor/26_presencia.js tal cual; los permisos de LiveKit de F2 (solo datos). En Chrome (si lo hay): sin ?presencia el motor no añade
// nada; con ?presencia=sim los avatares cuestan las mismas llamadas con 10 que con 40 visitantes (instanciado), sin errores, y libera() suelta la GPU.
// GEMELO_MIDE=1 imprime las cifras. SwiftShader vale para recuentos, no para fps.
const test = require("node:test"), assert = require("node:assert");
const { lee, path } = require("./_util");
const { sirve, motivoSalto, lanza, ESCENARIOS, desgloseLlamadas, VENTANA_CHICA, ventanaDe } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");

const MIDE = !!process.env.GEMELO_MIDE;
const FUENTE = lee("apps/web/motor/26_presencia.js");
function puro() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "26_presencia.js debe marcar su trozo puro con // [puro:inicio] y // [puro:fin]");
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn { PoseCodec: PoseCodec, BufferPose: BufferPose, Muneco: Muneco, Encuentro: Encuentro };")();
}
const { PoseCodec, BufferPose, Muneco, Encuentro } = puro();

// azar con semilla (mulberry32): las pruebas dan siempre lo mismo
function azarCon(s) { return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function quatAzar(r) {   // uniforme en SO(3) (Shoemake)
  const u1 = r(), u2 = r() * 2 * Math.PI, u3 = r() * 2 * Math.PI, a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}
const angulo = (q, p) => 2 * Math.acos(Math.min(1, Math.abs(q[0] * p[0] + q[1] * p[1] + q[2] * p[2] + q[3] * p[3]))) * 180 / Math.PI;
const pieza = (r, ext) => ({ p: [(r() - 0.5) * ext, r() * 900 - 100, (r() - 0.5) * ext], q: quatAzar(r) });

test("tamaños exactos del contrato: 24 B en escritorio y 56 B en Quest (con o sin manos)", () => {
  const r = azarCon(1), cab = pieza(r, 4000);
  assert.strictEqual(PoseCodec.codifica({ tipo: 1, seq: 1, t: 1, cab }).byteLength, 24);
  assert.strictEqual(PoseCodec.codifica({ tipo: 2, seq: 1, t: 1, cab, izq: pieza(r, 4000), der: pieza(r, 4000) }).byteLength, 56);
  assert.strictEqual(PoseCodec.codifica({ tipo: 2, seq: 1, t: 1, cab, izq: null, der: null }).byteLength, 56);
  assert.deepStrictEqual(PoseCodec.BYTES, { 1: 24, 2: 56 });
  assert.strictEqual(PoseCodec.VERSION, 1);
});

test("disposición de los bytes (little-endian) igual a la tabla de contratos/presencia.md", () => {
  const b = PoseCodec.codifica({ tipo: 2, seq: 0x1234, t: 0xa1b2c3d4, cab: { p: [1.23, -4.56, 78.9], q: [0, 0, 0, 1] }, izq: null, der: { p: [-0.01, 0, 2147483.6], q: [0, 0, 0, 1] } });
  const dv = new DataView(b.buffer);
  assert.strictEqual(dv.getUint8(0), 1, "byte 0: versión");
  assert.strictEqual(dv.getUint8(1), 2 | 8, "byte 1: tipo 2 + bit 3 (mano derecha); sin bit 2 (no hay izquierda)");
  assert.strictEqual(dv.getUint16(2, true), 0x1234, "bytes 2-3: secuencia");
  assert.strictEqual(dv.getUint32(4, true), 0xa1b2c3d4, "bytes 4-7: reloj del emisor");
  assert.deepStrictEqual([dv.getInt32(8, true), dv.getInt32(12, true), dv.getInt32(16, true)], [123, -456, 7890], "bytes 8-19: cabeza en cm");
  assert.strictEqual(dv.getUint32(20, true) >>> 30, 3, "bytes 20-23: la identidad tiene w como mayor (índice 3)");
  assert.deepStrictEqual([...b.slice(24, 40)], new Array(16).fill(0), "bytes 24-39: mano izquierda ausente = ceros");
  assert.deepStrictEqual([dv.getInt32(40, true), dv.getInt32(44, true), dv.getInt32(48, true)], [-1, 0, 214748360], "bytes 40-51: mano derecha en cm");
});

test("ida y vuelta: errores máximos medidos dentro del contrato (≤ 5 mm por eje, ≤ 0,25° de giro)", () => {
  const r = azarCon(20261029), N = 200000;
  let ePos = 0, eAng = 0, eAngMano = 0;
  for (let i = 0; i < N; i++) {
    const quest = i % 2 === 1, pose = { tipo: quest ? 2 : 1, seq: i & 0xffff, t: (i * 97) >>> 0, cab: pieza(r, 8000), izq: quest ? pieza(r, 8000) : null, der: quest ? pieza(r, 8000) : null };
    const d = PoseCodec.decodifica(PoseCodec.codifica(pose));
    assert.ok(d, "no se pudo decodificar");
    assert.strictEqual(d.tipo, pose.tipo); assert.strictEqual(d.seq, pose.seq); assert.strictEqual(d.t, pose.t);
    const piezas = quest ? ["cab", "izq", "der"] : ["cab"];
    for (const k of piezas) {
      for (let j = 0; j < 3; j++) ePos = Math.max(ePos, Math.abs(d[k].p[j] - pose[k].p[j]));
      const a = angulo(d[k].q, pose[k].q); if (k === "cab") eAng = Math.max(eAng, a); else eAngMano = Math.max(eAngMano, a);
    }
    if (!quest) assert.ok(d.izq === null && d.der === null);
  }
  if (MIDE) console.log("MEDIDO códec: " + N + " poses · error máx posición " + (ePos * 1000).toFixed(3) + " mm por eje · giro cabeza " + eAng.toFixed(4) + "° · manos " + eAngMano.toFixed(4) + "°");
  assert.ok(ePos <= 0.005 + 1e-9, "error de posición " + (ePos * 1000).toFixed(3) + " mm > 5 mm");
  assert.ok(eAng <= 0.25 && eAngMano <= 0.25, "error de giro " + Math.max(eAng, eAngMano).toFixed(4) + "° > 0,25°");
});

test("el códec rechaza lo que no es del contrato (devuelve null o lanza; nunca adivina)", () => {
  const b = PoseCodec.codifica({ tipo: 1, seq: 0, t: 0, cab: { p: [0, 0, 0], q: [0, 0, 0, 1] } });
  const cambia = (f) => { const c = b.slice(); f(c); return PoseCodec.decodifica(c); };
  assert.strictEqual(cambia(c => { c[0] = 2; }), null, "versión 2");
  assert.strictEqual(cambia(c => { c[1] = 0; }), null, "tipo 0");
  assert.strictEqual(cambia(c => { c[1] = 3; }), null, "tipo 3");
  assert.strictEqual(cambia(c => { c[1] = 2; }), null, "tipo 2 con 24 B");
  assert.strictEqual(PoseCodec.decodifica(b.slice(0, 23)), null, "23 B");
  assert.strictEqual(PoseCodec.decodifica(new Uint8Array(57)), null, "57 B");
  assert.strictEqual(PoseCodec.decodifica(new Uint8Array(0)), null, "vacío");
  assert.ok(PoseCodec.decodifica(b.buffer), "un ArrayBuffer también vale");
  const sub = new Uint8Array(30); sub.set(b, 3); assert.ok(PoseCodec.decodifica(sub.subarray(3, 27)), "una vista con desplazamiento también vale");
  assert.throws(() => PoseCodec.codifica({ tipo: 1, seq: 0, t: 0, cab: { p: [NaN, 0, 0], q: [0, 0, 0, 1] } }), RangeError);
  assert.throws(() => PoseCodec.codifica({ tipo: 1, seq: 0, t: 0, cab: { p: [3e7, 0, 0], q: [0, 0, 0, 1] } }), RangeError, "más de 21.474 km");
  assert.throws(() => PoseCodec.codifica({ tipo: 1, seq: 0, t: 0, cab: { p: [0, 0, 0], q: [0, 0, 0, 0] } }), RangeError, "cuaternión nulo");
});

test("búfer: descarta repetidas y viejas, acepta la vuelta de la secuencia (65535 → 0) y la del reloj u32", () => {
  const b = BufferPose.crea(), cab = { p: [0, 0, 0], q: [0, 0, 0, 1] };
  const pose = (seq, t) => ({ tipo: 1, seq, t: t >>> 0, cab, izq: null, der: null });
  assert.ok(BufferPose.recibe(b, pose(65534, 4294967196), 1000));
  assert.ok(!BufferPose.recibe(b, pose(65534, 4294967196), 1001), "repetida");
  assert.ok(!BufferPose.recibe(b, pose(65000, 4294960000), 1002), "vieja");
  assert.ok(BufferPose.recibe(b, pose(65535, 4294967296 - 1), 1100));
  assert.ok(BufferPose.recibe(b, pose(0, 4294967296 + 99), 1200), "la secuencia da la vuelta");
  assert.deepStrictEqual(b.m.map(m => m.t), [4294967196, 4294967295, 4294967395], "el reloj se desenrolla: sigue creciendo tras dar la vuelta");
  assert.strictEqual(b.viejas, 2);
});

test("interpolación: con la red simulada del motor (10 Hz, retardo 30-90 ms) el error frente a la verdad es de centímetros; a 2 Hz, de decímetros", () => {
  for (const [hz, retardo, tope] of [[10, 150, 0.03], [2, 650, 0.15]]) {
    const r = azarCon(7), b = BufferPose.crea(), out = BufferPose.salida(), relojE = 4294967296 - 2000, verdad = t => [5 + 1.4 * t / 1000 + Math.sin(t / 900) * 0.4, 300 + Math.sin(t / 300) * 0.03, -20 - Math.cos(t / 1300) * 3];
    const red = []; let eMax = 0, seq = 65530, n = 0;
    for (let ahora = 0; ahora < 20000; ahora += 1000 / 60) {
      if (Math.floor(ahora / (1000 / hz)) !== Math.floor((ahora - 1000 / 60) / (1000 / hz)) || ahora === 0) {
        seq = (seq + 1) & 0xffff;
        red.push({ en: ahora + 30 + r() * 60, b: PoseCodec.codifica({ tipo: 1, seq, t: Math.round(relojE + ahora) >>> 0, cab: { p: verdad(Math.round(ahora)), q: [0, 0, 0, 1] } }) });
      }
      red.sort((x, y) => x.en - y.en);
      while (red.length && red[0].en <= ahora) BufferPose.recibe(b, PoseCodec.decodifica(red.shift().b), ahora);
      if (ahora < 2000 || !BufferPose.muestra(b, ahora, retardo, out)) continue;
      const tE = out.t - relojE, v = verdad(tE);   // la pose mostrada frente a la verdad EN EL INSTANTE QUE DICE MOSTRAR (lo que añade la interpolación, no el retardo)
      eMax = Math.max(eMax, Math.hypot(out.cab.p[0] - v[0], out.cab.p[1] - v[1], out.cab.p[2] - v[2])); n++;
    }
    if (MIDE) console.log("MEDIDO interpolación " + hz + " Hz, retardo " + retardo + " ms: error máx " + (eMax * 100).toFixed(2) + " cm en " + n + " fotogramas");
    assert.ok(n > 1000);
    assert.ok(eMax <= tope, hz + " Hz: error " + eMax.toFixed(3) + " m > " + tope);
  }
});

test("búfer: una mano que deja de llegar deja de dibujarse; la cabeza sigue", () => {
  const b = BufferPose.crea(), out = BufferPose.salida(), pz = { p: [0, 0, 0], q: [0, 0, 0, 1] };
  BufferPose.recibe(b, PoseCodec.decodifica(PoseCodec.codifica({ tipo: 2, seq: 1, t: 0, cab: pz, izq: pz, der: null })), 0);
  BufferPose.recibe(b, PoseCodec.decodifica(PoseCodec.codifica({ tipo: 2, seq: 2, t: 100, cab: pz, izq: null, der: null })), 100);
  assert.ok(BufferPose.muestra(b, 1000, 0, out));
  assert.strictEqual(out.hayDer, false); assert.strictEqual(out.hayIzq, true, "entre una con mano y otra sin, se usa la que hay");
  BufferPose.recibe(b, PoseCodec.decodifica(PoseCodec.codifica({ tipo: 2, seq: 3, t: 200, cab: pz, izq: null, der: null })), 200);
  BufferPose.muestra(b, 1000, 0, out); assert.strictEqual(out.hayIzq, false);
});

// ---------- el muñeco de los demás (P5): el mismo paseante que el local, animado con la velocidad que sale de la interpolación
const PASEO = lee("apps/web/motor/12_paseo.js");
/** anda en línea recta a `vel` m/s hacia `rumbo` (0 = −z) durante `seg` a 60 fps; devuelve la última salida y el balanceo máximo */
function anda(st, vel, seg, { x = 0, z = 0, rumbo = 0, suelo = 100, exag = 1, hCab = NaN, manos = false, yawCab = 0 } = {}) {
  const dt = 1 / 60, o = {}, max = { pierna: 0, brazo: 0 };
  for (let i = 0; i < Math.round(seg * 60); i++) {
    x += -Math.sin(rumbo) * vel * dt; z += -Math.cos(rumbo) * vel * dt;
    Muneco.avanza(st, x, z, yawCab, dt, suelo, exag, hCab, manos, o);
    max.pierna = Math.max(max.pierna, Math.abs(o.piernaI)); max.brazo = Math.max(max.brazo, Math.abs(o.brazoI));
  }
  return { o, max, x, z };
}
test("muñeco: las piezas y la animación son las del paseante local (12_paseo.js)", () => {
  for (const [w, h, d, x, y] of Muneco.PIEZAS.slice(1)) assert.ok(PASEO.includes("miembro(" + w + ", " + h + ", " + d + ", ") && PASEO.includes(", " + x + ", " + y + ", 0)"), "pieza " + [w, h, d, x, y] + " distinta de creaPersona");
  assert.ok(PASEO.includes("caja(0.46, 0.62, 0.25, camisa, 0, 1.17, 0)"), "el tronco de creaPersona (centro 1,17 → arriba 1,48)");
  assert.ok(Math.abs(Muneco.PIEZAS[0][4] - (1.17 + 0.62 / 2)) < 1e-9);
  for (const t of ["pp.paso += Math.abs(vel) * dt * 3.4", "Math.min(1, Math.abs(vel) / 1.7)", "Math.sin(pp.paso) * 0.75 * mov", "-sw * 0.8", "Math.abs(Math.sin(pp.paso)) * 0.03 * mov"]) assert.ok(PASEO.includes(t), "12_paseo.js ya no anima así: " + t + " (cambia también Muneco)");
});
test("muñeco: andando balancea brazos y piernas en proporción a la velocidad; quieto, en reposo", () => {
  const lento = anda(Muneco.crea(), 0.6, 4).max, normal = anda(Muneco.crea(), 1.4, 4).max, corre = anda(Muneco.crea(), 4, 4).max;
  assert.ok(lento.pierna > 0.15 && lento.pierna < normal.pierna, "más despacio, menos balanceo: " + lento.pierna + " / " + normal.pierna);
  assert.ok(normal.pierna > 0.5 && normal.pierna <= 0.75 + 1e-9, "a 1,4 m/s, casi el balanceo pleno: " + normal.pierna);
  assert.ok(Math.abs(corre.pierna - 0.75) < 0.01, "corriendo, el tope del paseante (0,75 rad): " + corre.pierna);
  assert.ok(Math.abs(normal.brazo - normal.pierna * 0.8) < 0.02, "los brazos, al 80 % y en contra de las piernas");
  const st = Muneco.crea(), fin = anda(st, 1.4, 3);
  const quieto = anda(st, 0, 2, { x: fin.x, z: fin.z });
  assert.ok(quieto.o.vel < 0.01, "se para: " + quieto.o.vel);
  assert.ok(Math.abs(quieto.o.piernaI) < 0.01 && Math.abs(quieto.o.brazoD) < 0.01, "quieto, piernas y brazos en reposo");
  const q0 = anda(Muneco.crea(), 0, 3).o;
  assert.deepStrictEqual([q0.piernaI, q0.piernaD, q0.brazoI, q0.brazoD].map(v => Math.abs(v)), [0, 0, 0, 0], "sin moverse nunca, reposo exacto");
  // un salto de posición (vuelve tras un hueco) no es andar
  const sj = Muneco.crea(), o = {}; Muneco.avanza(sj, 0, 0, 0, 1 / 60, 0, 1, NaN, false, o); Muneco.avanza(sj, 40, 0, 0, 1 / 60, 0, 1, NaN, false, o);
  assert.strictEqual(o.vel, 0);
});
test("muñeco: gira suave hacia donde anda; quieto, hacia donde mira; los pies, en el suelo de ESTE mundo", () => {
  const st = Muneco.crea(), o = {};
  Muneco.avanza(st, 0, 0, 0, 1 / 60, 50, 1, NaN, false, o);
  const r = anda(st, 1.4, 0.15, { rumbo: Math.PI / 2 }).o;   // gira 90° a la izquierda: tras 150 ms aún no ha llegado
  assert.ok(r.yaw > 0.05 && r.yaw < Math.PI / 2 - 0.1, "gira poco a poco: " + r.yaw);
  const r2 = anda(st, 1.4, 2, { rumbo: Math.PI / 2 }).o;
  assert.ok(Math.abs(r2.yaw - Math.PI / 2) < 0.02, "acaba mirando hacia donde anda: " + r2.yaw);
  const r3 = anda(st, 0, 3, { yawCab: -1 }).o;
  assert.ok(Math.abs(r3.yaw + 1) < 0.02, "quieto, se vuelve hacia donde mira su cabeza: " + r3.yaw);
  // pies: suelo local × exageración (más el bote del paso); NO la cota que trae la pose
  const p = anda(Muneco.crea(), 1.4, 2, { suelo: 230, exag: 1.5 }).o;
  assert.ok(p.yPies >= 345 && p.yPies <= 345 + 0.03 + 1e-9, "pies en suelo·exag: " + p.yPies);
  assert.ok(Math.abs(p.yCab - p.yPies - 1.6) < 1e-9, "de pie, cabeza a 1,6 m de sus pies");
  assert.strictEqual(anda(Muneco.crea(), 0, 1, { suelo: 230, exag: 1.5 }).o.yPies, 345, "quieto, sin bote");
});
test("muñeco con gafas: la altura de su cabeza sobre el suelo lo agacha; con manos, los brazos no se animan", () => {
  const dePie = anda(Muneco.crea(), 0, 1, { hCab: 1.62 }).o, agachado = anda(Muneco.crea(), 0, 1, { hCab: 1.0, suelo: 10 }).o, tumbado = anda(Muneco.crea(), 0, 1, { hCab: 0.2 }).o;
  assert.strictEqual(dePie.agacho, 0);
  assert.ok(Math.abs(agachado.agacho - 0.6) < 1e-9 && Math.abs(agachado.yCab - 11.0) < 1e-9, "agachado: la cabeza a 1,0 m de su suelo");
  assert.strictEqual(tumbado.agacho, 0.9, "como mucho 0,9 m");
  const conManos = anda(Muneco.crea(), 1.4, 3, { manos: true }).max;
  assert.strictEqual(conManos.brazo, 0, "con manos de la pose, brazos quietos"); assert.ok(conManos.pierna > 0.5, "las piernas sí andan");
});
test("muñeco: la pose del contrato v1 no cambia (24 B escritorio, 56 B Quest; versión 1)", () => {
  const b = PoseCodec.codifica({ tipo: 1, seq: 1, t: 2, cab: { p: [1, 2, 3], q: [0, 0, 0, 1] }, izq: null, der: null });
  assert.strictEqual(b.byteLength, 24); assert.strictEqual(b[0], 1);
  assert.strictEqual(PoseCodec.codifica({ tipo: 2, seq: 1, t: 2, cab: { p: [1, 2, 3], q: [0, 0, 0, 1] }, izq: { p: [0, 1, 0], q: [0, 0, 0, 1] }, der: null }).byteLength, 56);
});

// ---------- P6: el modo de quien publica (a pie, quad, dron) en los bits 4-5 del byte 1, sin cambiar la v1
test("modo (P6): ida y vuelta a pie, en quad y con el dron, en los dos tipos; en los bits 4-5 del byte 1; sin él, a pie", () => {
  const cab = { p: [1, 2, 3], q: [0, 0, 0, 1] }, mano = { p: [0, 1, 0], q: [0, 0, 0, 1] };
  for (const tipo of [1, 2]) for (const modo of [0, 1, 2]) {
    const b = PoseCodec.codifica({ tipo, seq: 7, t: 9, cab, izq: tipo === 2 ? mano : null, der: null, modo });
    assert.strictEqual(b.byteLength, PoseCodec.BYTES[tipo], "el tamaño no cambia"); assert.strictEqual(b[0], 1, "sigue siendo la versión 1");
    assert.strictEqual((b[1] >> 4) & 3, modo, "bits 4-5"); assert.strictEqual(b[1] & 3, tipo, "bits 0-1, el tipo, intactos");
    const d = PoseCodec.decodifica(b); assert.strictEqual(d.modo, modo); assert.strictEqual(d.tipo, tipo);
    if (tipo === 2) assert.ok(d.izq && !d.der, "las banderas de las manos, intactas");
  }
  assert.strictEqual(PoseCodec.decodifica(PoseCodec.codifica({ tipo: 1, seq: 0, t: 0, cab })).modo, 0, "sin modo, a pie");
  assert.strictEqual(PoseCodec.codifica({ tipo: 1, seq: 0, t: 0, cab, modo: 7 })[1], 1, "un modo que no existe viaja como a pie");
  assert.deepStrictEqual([PoseCodec.PIE, PoseCodec.QUAD, PoseCodec.DRON], [0, 1, 2]);
});
test("modo (P6): un receptor de antes lo ignora (solo mira los bits 0-3); el valor 3 y los bits 6-7, reservados, no descartan la pose", () => {
  const b = PoseCodec.codifica({ tipo: 2, seq: 1, t: 2, cab: { p: [1, 2, 3], q: [0, 0, 0, 1] }, izq: null, der: { p: [0, 1, 0], q: [0, 0, 0, 1] }, modo: 1 });
  const viejo = band => ({ tipo: band & 3, izq: !!(band & 4), der: !!(band & 8) });   // lo que leía el códec v1 de antes de P6
  assert.deepStrictEqual(viejo(b[1]), { tipo: 2, izq: false, der: true });
  const c = b.slice(); c[1] = (c[1] & 0x0f) | (3 << 4) | 0xc0;
  const d = PoseCodec.decodifica(c); assert.ok(d, "no se descarta"); assert.strictEqual(d.modo, 0, "3 = reservado: a pie"); assert.ok(d.der);
});
test("modo (P6): el búfer lo lleva hasta la pose que se dibuja", () => {
  const b = BufferPose.crea(), out = BufferPose.salida(), pz = { p: [0, 0, 0], q: [0, 0, 0, 1] };
  assert.strictEqual(out.modo, 0);
  BufferPose.recibe(b, PoseCodec.decodifica(PoseCodec.codifica({ tipo: 1, seq: 1, t: 0, cab: pz, modo: 0 })), 0);
  BufferPose.recibe(b, PoseCodec.decodifica(PoseCodec.codifica({ tipo: 1, seq: 2, t: 100, cab: pz, modo: 1 })), 100);
  BufferPose.muestra(b, 1000, 0, out); assert.strictEqual(out.modo, 1, "el de la pose más reciente de las dos que se interpolan");
});
test("muñeco (P6): en quad, sentado (piernas 1,15 y brazos 1,05 rad, los de 16_vida.js), sin balanceo ni bote, 0,2 m detrás del quad; con el dron, de pie y brazos al mando", () => {
  const VIDA = lee("apps/web/motor/16_vida.js");
  assert.ok(VIDA.includes("u.pi.rotation.x = u.pd.rotation.x = 1.15; u.bi.rotation.x = u.bd.rotation.x = 1.05"), "16_vida.js ya no sienta así al paseante (cambia también Muneco)");
  assert.ok(VIDA.includes("ud.bi.rotation.x = ud.bd.rotation.x = 1.0"), "16_vida.js ya no pone así los brazos con el dron");
  assert.ok(VIDA.includes("persona.position.set(pp.x - fx * 0.2, gy - 0.02, -pp.y - fz * 0.2)"), "16_vida.js ya no coloca así al paseante en el quad");
  const avanzaCon = (modo, vel, seg, yawCab = 0.7) => { const st = Muneco.crea(), o = {}, dt = 1 / 60; let x = 0, z = 0, maxP = -9, minP = 9, maxBote = -1;
    for (let i = 0; i < seg * 60; i++) { z -= vel * dt; Muneco.avanza(st, x, z, yawCab, dt, 100, 1, NaN, false, o, modo); maxP = Math.max(maxP, o.piernaI); minP = Math.min(minP, o.piernaI); maxBote = Math.max(maxBote, o.yPies); }
    return { o, maxP, minP, maxBote }; };
  const q = avanzaCon(1, 8, 3);
  assert.strictEqual(q.o.vehiculo, 1); assert.strictEqual(q.maxP, 1.15); assert.strictEqual(q.minP, 1.15, "sin balanceo aunque vaya a 8 m/s");
  assert.strictEqual(q.o.brazoI, 1.05); assert.strictEqual(q.o.brazoD, 1.05);
  assert.ok(Math.abs(q.maxBote - 99.98) < 1e-9, "pies a suelo − 0,02, sin bote: " + q.maxBote); assert.ok(Math.abs(q.o.yVeh - 100.02) < 1e-9, "el quad a suelo + 0,02");
  assert.strictEqual(q.o.atras, 0.2); assert.ok(Math.abs(q.o.yaw - 0.7) < 0.02, "en quad, el cuerpo con el rumbo publicado (el del quad), no con el de la marcha");
  assert.ok(q.o.vel > 7, "la velocidad del quad no se recorta a la de andar: " + q.o.vel);
  const d = avanzaCon(2, 0, 1);
  assert.strictEqual(d.o.vehiculo, 2); assert.strictEqual(d.o.piernaI, 0); assert.strictEqual(d.o.brazoI, 1.0); assert.strictEqual(d.o.atras, 0);
  assert.ok(Math.abs(d.o.yCab - d.o.yPies - 1.6) < 1e-9);
  const p = avanzaCon(0, 1.4, 3);
  assert.strictEqual(p.o.vehiculo, 0); assert.ok(p.maxP > 0.5 && p.minP < -0.5, "a pie, como siempre");
  const mm = {}; Muneco.avanza(Muneco.crea(), 0, 0, 0, 1 / 60, 0, 1, NaN, true, mm, 1); assert.strictEqual(mm.brazoI, 0, "con manos de la pose, los brazos no se tocan");
});

// ---------- I1: «Ir con alguien»: dónde te deja (Encuentro.punto)
const EXT = [0, 200, 200, 0];   // oeste, norte, este, sur
function rejilla(paso, r, x0 = 0, y0 = 0, n = 40) { const o = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) o.push({ x: x0 + i * paso, y: y0 + j * paso, r }); return o; }
function compruebaLlegada(L, t, obst, rT, msg) {
  assert.ok(L.d >= 2 - 1e-9 && L.d <= 4 + 1e-9, msg + ": a 2-4 m (" + L.d + ")");
  assert.ok(Math.abs(Math.hypot(L.x - t.x, L.y - t.y) - L.d) < 1e-6, msg + ": d es la distancia de verdad");
  for (const o of obst) assert.ok(Math.hypot(L.x - o.x, L.y - o.y) >= rT + 0.2 - 1e-9, msg + ": dentro de un tronco en " + o.x + "," + o.y);
  assert.ok(L.x >= EXT[0] + 3 && L.x <= EXT[2] - 3 && L.y >= EXT[3] + 3 && L.y <= EXT[1] - 3, msg + ": dentro de la finca");
  const fx = Math.sin(L.ang), fy = Math.cos(L.ang), dx = (t.x - L.x) / L.d, dy = (t.y - L.y) / L.d;
  assert.ok(fx * dx + fy * dy > 0.9999, msg + ": mirando hacia ella");
}
test("ir con alguien: en campo abierto, a 2,5 m por el lado desde el que llegas, mirándola y en el suelo", () => {
  const t = { x: 100, y: 100 }, L = Encuentro.punto(t, { x: 100, y: 50 }, [], EXT, { suelo: (x, y) => 300 + x * 0.01 + y * 0.02 });
  compruebaLlegada(L, t, [], 0.55, "abierto");
  assert.strictEqual(L.d, 2.5); assert.ok(Math.abs(L.x - 100) < 1e-9 && Math.abs(L.y - 97.5) < 1e-9, "por el sur, de donde vienes: " + L.x + "," + L.y);
  assert.ok(Math.abs(L.ang) < 1e-9, "mirando al norte"); assert.strictEqual(L.libre, "copa");
  assert.ok(Math.abs(L.z - (300 + L.x * 0.01 + L.y * 0.02)) < 1e-9, "z = suelo(x, y)");
});
test("ir con alguien: en un olivar en marco de 7 m (copas de 2 m), nunca dentro de una copa ni de un tronco", () => {
  const obst = rejilla(7, 2, 2, 2, 28);
  for (const [tx, ty, dx, dy] of [[100, 100, 0, -1], [100, 100, 1, 0], [102.1, 103.4, -1, 1], [16, 16, 0, 1], [9, 9, -1, -1], [5.5, 5.5, 1, 1]]) {
    const t = { x: tx, y: ty }, L = Encuentro.punto(t, { x: tx + dx * 40, y: ty + dy * 40 }, obst, EXT);
    compruebaLlegada(L, t, obst, 0.55, "olivar " + tx + "," + ty);
    assert.strictEqual(L.libre, "copa", "hay sitio fuera de las copas"); for (const o of obst) assert.ok(Math.hypot(L.x - o.x, L.y - o.y) >= o.r, "dentro de una copa");
  }
});
test("ir con alguien: en quad, el radio del tronco es el del quad (1,05 m); si todo cae bajo copa, al menos fuera de los troncos; si ni eso, empujado como el paseo", () => {
  const t = { x: 50, y: 50 }, denso = rejilla(3, 2.5, 30, 30, 15);   // copas que se tocan: no hay suelo despejado
  const L = Encuentro.punto(t, { x: 0, y: 50 }, denso, EXT, { rTronco: 1.05 });
  compruebaLlegada(L, t, denso, 1.05, "denso en quad"); assert.strictEqual(L.libre, "tronco");
  const apretado = rejilla(1, 0, 40, 40, 21);   // un tronco cada metro: no cabe nadie
  const E = Encuentro.punto(t, { x: 0, y: 50 }, apretado, EXT);
  assert.strictEqual(E.libre, "empujado"); assert.ok(Number.isFinite(E.x) && Number.isFinite(E.y) && Number.isFinite(E.ang));
});
test("ir con alguien: junto a la linde de la finca, dentro (3 m de margen); y sin dirección de llegada, por el sur", () => {
  const t = { x: 4, y: 196 }, L = Encuentro.punto(t, { x: -50, y: 250 }, [], EXT);
  compruebaLlegada(L, t, [], 0.55, "esquina");
  const S = Encuentro.punto({ x: 100, y: 100 }, { x: 100, y: 100 }, [], EXT); assert.ok(Math.abs(S.x - 100) < 1e-9 && S.y < 100, "encima de ella: por el sur");
});
test("ir con alguien y minimapa: en la página, solo con la bandera; con ella, solo a quien se dibuja (de la sala, con pose, sin bloquear)", () => {
  const M = lee("apps/web/motor/17_minimapa.js"), F = lee("apps/web/motor/38_presencia_compartida.js");
  // C5: el minimapa no nombra a la presencia: pinta las entidades «persona» (las registra la presencia solo con su bandera) e «Ir con» es su acción «ir»
  assert.match(M, /var gente = Entidades\.lista\("persona"\);[^\n]*\n\s*if \(gente\) \{/, "el minimapa solo pinta a los demás si hay tipo «persona» (presencia activa)");
  assert.match(M, /Usables\.usa\(mejor\.id, "ir"\)/, "el segundo toque va con esa persona por su acción «ir»");
  assert.match(F, /if \(variante\) quitaPersona = Entidades\.registra\(\{ tipo: "persona"/, "el tipo «persona» solo con ?presencia=sim|red");
  assert.match(F, /function seVe\(a, tMs\) \{ return !!a && a\.visto && \(variante !== "red" \|\| SalaPose\.seVe\(SP, a\.id, tMs, bloqueados\)\); \}/);
  assert.match(F, /function irCon\(id\) \{\s*if \(!activo\) return false;\s*var a = busca\(id\); if \(!seVe\(a, performance\.now\(\)\)\) return false;/, "irCon solo va con quien se ve");
  assert.match(F, /if \(x\.enMundo && !bl\) \{/, "el botón «Ir con» solo para quien está en el olivar y no está bloqueado");
});
// ---------- I4: las balizas como punto de encuentro
const HAZAS = lee("apps/web/motor/13b_hazas.js");
const { HazasPuro } = new Function("\"use strict\";\n" + HAZAS.slice(HAZAS.indexOf("// [puro:inicio]"), HAZAS.indexOf("// [puro:fin]")) + "\nreturn { HazasPuro: HazasPuro };")();
test("balizas (I4): quién está en una parcela, por su linde (HazasPuro.dentroPoligono), en orden alfabético", () => {
  const linde = [[0, 0], [50, 0], [50, 30], [20, 30], [20, 60], [0, 60]];   // en L
  const pts = [{ alias: "Mirlo", x: 10, y: 10 }, { alias: "Abubilla", x: 10, y: 55 }, { alias: "Perdiz", x: 40, y: 45 }, { alias: "Jara", x: 49.9, y: 1 }, { alias: "Fuera", x: -1, y: 5 }];
  assert.deepStrictEqual(Encuentro.enParcela(pts, linde, HazasPuro.dentroPoligono), ["Abubilla", "Jara", "Mirlo"], "Perdiz cae en el hueco de la L; Fuera, fuera");
  assert.deepStrictEqual(Encuentro.enParcela([], linde, HazasPuro.dentroPoligono), []);
  assert.deepStrictEqual(Encuentro.enParcela(null, linde, HazasPuro.dentroPoligono), []);
  // los de vista aérea y los bloqueados no llegan aquí: enParcela recibe las entidades «persona», que son los puntos de la presencia, que ya los quita (seVe; prueba de SalaPose.seVe en presencia_red.test.js)
  const B = lee("apps/web/motor/19_balizas.js");
  assert.match(B, /return Encuentro\.enParcela\(gente, parcelas\[k\]\.linde, HazasPuro\.dentroPoligono\);/, "la lista sale de las entidades «persona»");
  assert.match(B, /var gente = Entidades\.lista\("persona"\); if \(!gente\) return null;/, "sin presencia (sin tipo «persona»), no hay lista (el aviso solo pregunta)");
  assert.match(lee("apps/web/motor/38_presencia_compartida.js"), /lista: function \(\) \{ return puntos\(\)\.map\(/, "la lista del tipo «persona» son los puntos de la presencia (los que se dibujan)");
  assert.match(B, /avisoB\.txt\.textContent = textoAvisoBaliza\(k\)/, "el aviso pone los alias como texto, nunca como HTML");
  assert.match(B, /gente\.map\(esc\)/, "en la ficha (HTML), los alias escapados");
});
test("balizas (I4): ir a una baliza te deja a 4-5,5 m de la columna, fuera de copas y troncos, en el suelo y mirándola", () => {
  const obst = rejilla(7, 2, 2, 2, 28);
  for (const [bx, by] of [[100, 100], [58.5, 72.5], [9, 9]]) {
    const t = { x: bx, y: by }, L = Encuentro.punto(t, { x: 20, y: 180 }, obst, EXT, { dists: Encuentro.BALIZA, suelo: () => 412 });
    assert.ok(L.d >= 3.5 - 1e-9 && L.d <= 5.5 + 1e-9, "a 3,5-5,5 m: " + L.d);
    for (const o of obst) assert.ok(Math.hypot(L.x - o.x, L.y - o.y) >= 0.75 - 1e-9, "dentro de un tronco");
    assert.strictEqual(L.libre, "copa"); assert.strictEqual(L.z, 412);
    const fx = Math.sin(L.ang), fy = Math.cos(L.ang); assert.ok(fx * (bx - L.x) / L.d + fy * (by - L.y) / L.d > 0.9999, "mirándola");
  }
  assert.strictEqual(Encuentro.punto({ x: 100, y: 100 }, { x: 100, y: 0 }, [], EXT, { dists: Encuentro.BALIZA }).d, 4.5, "en abierto, a 4,5 m");
});
test("contratos/livekit-roles.json: en F2 ningún rol publica audio ni vídeo, todos publican datos, nadie lleva roomAdmin y la identidad es opaca", () => {
  const R = JSON.parse(lee("contratos/livekit-roles.json"));
  assert.strictEqual(R.contrato, "livekit-roles"); assert.strictEqual(R.version, 5); assert.strictEqual(R.fase, "F2");
  assert.deepStrictEqual(Object.keys(R.roles).sort(), ["admin", "corresponsal", "guia", "hogar", "oficina"], "los roles de contratos/sesion.md");
  assert.strictEqual(R.roles.oficina.hidden, false, "la oficina es siempre visible en el mundo (decisión 107)");
  for (const [rol, p] of Object.entries(R.roles)) {
    assert.strictEqual(p.canPublish, false, rol + ": canPublish (pistas de audio o vídeo) debe ser false en F2");
    assert.deepStrictEqual(p.canPublishSources, [], rol + ": sin fuentes (ni cámara ni micrófono) en F2");
    assert.strictEqual(p.canPublishData, true, rol + ": publica su pose y el chat");
    assert.strictEqual(p.roomAdmin, false, rol + ": la moderación la hace la api, no un cliente");
    assert.strictEqual(p.canUpdateOwnMetadata, false, rol + ": el alias y el avatar los pone la api");
  }
  assert.match(R.identidad.identity, /opaco/); assert.match(R.identidad.identity, /sesión/, "una identidad por sesión (aparato), no por hogar");
  assert.ok(new RegExp(R.identidad.formato).test("h_" + "a".repeat(22) + "_" + "b-_c".repeat(2))); assert.doesNotMatch(JSON.stringify(R.identidad.metadata.campos), /correo|email/);
  assert.strictEqual(R.temas_de_datos.pose.fiable, false); assert.strictEqual(R.temas_de_datos.chat.se_guarda, false, "decisión 40");
  // v4 (OF10): los temas que solo manda la api (sin participante) y las dos salas por clave
  for (const t of ["anuncio", "sala", "balizas"]) { assert.strictEqual(R.temas_de_datos[t].lo_manda, "api", t); assert.strictEqual(R.temas_de_datos[t].fiable, true, t); }
  assert.deepStrictEqual(Object.values(R.salas).filter(s => s.clave).map(s => s.clave + "=" + s.nombre).sort(), ["general=hituelo-libre", "visita=hituelo-visita"]);
  const md = lee("contratos/presencia.md");
  for (const s of ["24 B", "56 B", "smallest-three", "livekit-roles.json", "versión"]) assert.ok(md.includes(s), "presencia.md no menciona «" + s + "»");
});

// ---------- en Chrome
const SALTO = motivoSalto("la presencia simulada en navegador") || saltoPagina("la presencia simulada en navegador");
let srv, navegador, base;
test.before(async () => {
  if (SALTO) return;
  srv = await sirve(montaPagina({ finca: "cerro" }).carpeta); base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

async function abre(consulta) {
  const p = await navegador.newPage({ viewport: ventanaDe(VENTANA_CHICA) }), errores = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error") errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.goto(base + "?debug" + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 60000 });
  const e = ESCENARIOS.cerca;
  await p.evaluate(e => { const g = window.__g; g.orb.az = e.az; g.orb.el = e.el; g.orb.dist = e.dist; g.objetivo.x = e.ox; g.objetivo.z = -e.oy; g.objetivo.y = g.suelo(e.ox, e.oy) + 4; g.pon(e.modo); }, e);
  await p.waitForFunction(() => window.__g.Cola.pendientes() === 0 && window.__g.Escena3D.listo(), null, { timeout: 60000, polling: 500 }).catch(() => {});
  await p.waitForTimeout(3000);
  const m = await p.evaluate(() => {
    const g = window.__g, r = g.renderer.info, dep = [...document.querySelectorAll("#visor div")].map(d => d.textContent).find(t => /fps · JS/.test(t)) || "";
    return { llamadas: r.render.calls, triangulos: r.render.triangles, puntos: r.render.points, geometrias: r.memory.geometries, texturas: r.memory.textures,
      grupo: !!g.scene.getObjectByName("presencia"), pres: window.__presencia(), jsFotograma: Number((/JS ([\d.]+) ms/.exec(dep) || [])[1]) };
  });
  // las llamadas del grupo «presencia» de un fotograma (desgloseLlamadas): la diferencia de totales entre dos cargas la mueve también el nivel 0 de
  // los olivos (qué celdas cercanas están montadas), que no es cosa de la presencia (medido en T8 fase 2: ±5 llamadas entre cargas)
  const d = await p.evaluate(desgloseLlamadas);
  m.presLlamadas = d.filas.filter(([k]) => / presencia:/.test(k)).reduce((a, f) => a + f[1], 0);
  // los triángulos del grupo «presencia» (instancias incluidas): la diferencia de triángulos totales entre cargas también la mueven las celdas de olivos montadas (medido en PB2: +1152 con 10, +6268 / +7108 con 40 según la carga y la ventana)
  m.presTri = await p.evaluate(() => { const g = window.__g.scene.getObjectByName("presencia"); let t = 0; if (g) g.traverse(o => { if (!o.isMesh || !o.geometry || o.visible === false) return; const n = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; t += n / 3 * (o.isInstancedMesh ? o.count : 1); }); return Math.round(t); });
  return { p, errores, m };
}

test("en Chrome: sin ?presencia no se añade nada; con ?presencia=sim, 10 y 40 visitantes cuestan las mismas llamadas (instanciado), sin errores; libera() suelta la GPU", { timeout: 300000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const sin = await abre(""); await sin.p.close();
  assert.deepStrictEqual(sin.errores, []);
  assert.strictEqual(sin.m.grupo, false, "sin la bandera no debe haber grupo «presencia» en la escena");
  assert.strictEqual(sin.m.pres.activo, false);
  const res = { 0: sin.m };
  for (const n of [10, 40]) {
    const r = await abre("&presencia=sim&n=" + n);
    assert.deepStrictEqual(r.errores, [], "errores con n=" + n);
    assert.ok(r.m.grupo && r.m.pres.activo && r.m.pres.n === n);
    assert.strictEqual(r.m.pres.vistos, n, "todos los visitantes simulados deben haber llegado por el códec y estar dibujados");
    assert.ok(r.m.pres.recibidos > 0 && r.m.pres.bytes > 0);
    if (n === 40) {
      const antes = await r.p.evaluate(() => ({ g: window.__g.renderer.info.memory.geometries, t: window.__g.renderer.info.memory.textures }));
      await r.p.evaluate(() => window.__presencia("libera")); await r.p.waitForTimeout(500);
      const desp = await r.p.evaluate(() => ({ g: window.__g.renderer.info.memory.geometries, t: window.__g.renderer.info.memory.textures, grupo: !!window.__g.scene.getObjectByName("presencia"), activo: window.__presencia().activo }));
      assert.ok(!desp.grupo && !desp.activo, "tras libera() no queda grupo ni simulación");
      assert.ok(antes.g - desp.g >= 5 && antes.t - desp.t >= 1, "libera() debe soltar 5 geometrías y 1 textura (antes " + JSON.stringify(antes) + ", después " + JSON.stringify(desp) + ")");
    }
    await r.p.close();
    res[n] = r.m;
  }
  if (MIDE) for (const n of [0, 10, 40]) console.log("MEDIDO presencia n=" + n + " " + JSON.stringify(res[n]));
  const d10 = res[10].presLlamadas - res[0].presLlamadas, d40 = res[40].presLlamadas - res[0].presLlamadas;
  assert.ok(d10 >= 4 && d10 <= 6, "10 visitantes: " + d10 + " llamadas más (esperadas 4-6: cuerpo, cabeza, sombrero y apoyo, nombres, manos si hay Quest y las ruedas si alguien lleva silla)");
  assert.ok(d40 === 5 || d40 === 6, "40 visitantes: " + d40 + " llamadas más (esperadas 5, o 6 con las ruedas de la silla de ruedas: AV2, decisión 131)");
  // P5: el muñeco del paseante: 5 cajas (60) + cabeza (icosaedro, 20) + sombrero (12) + nombre (2) = 94; con gafas, +24 de las manos
  assert.ok(res[40].presTri <= 40 * 120, "40 visitantes: más de 120 triángulos por avatar");
});

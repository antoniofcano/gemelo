"use strict";
// Presencia compartida (F2, contratos/presencia.md y contratos/livekit-roles.json). En Node: el códec de pose (tamaños exactos, disposición de los bytes,
// ida y vuelta con errores máximos medidos, rechazo de lo que no es del contrato, vueltas de la secuencia y del reloj) y el búfer de interpolación, evaluando
// el trozo puro de apps/web/motor/26_presencia.js tal cual; los permisos de LiveKit de F2 (solo datos). En Chrome (si lo hay): sin ?presencia el motor no añade
// nada; con ?presencia=sim los avatares cuestan las mismas llamadas con 10 que con 40 visitantes (instanciado), sin errores, y libera() suelta la GPU.
// GEMELO_MIDE=1 imprime las cifras. SwiftShader vale para recuentos, no para fps.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, propia, python, fixture, ejecuta, lee, path } = require("./_util");
const { sirve, motivoSalto, lanza, ESCENARIOS } = require("./_navegador");

const MIDE = !!process.env.GEMELO_MIDE;
const FUENTE = lee("apps/web/motor/26_presencia.js");
function puro() {
  const i = FUENTE.indexOf("// [puro:inicio]"), f = FUENTE.indexOf("// [puro:fin]");
  assert.ok(i >= 0 && f > i, "26_presencia.js debe marcar su trozo puro con // [puro:inicio] y // [puro:fin]");
  return new Function("\"use strict\";\n" + FUENTE.slice(i, f) + "\nreturn { PoseCodec: PoseCodec, BufferPose: BufferPose };")();
}
const { PoseCodec, BufferPose } = puro();

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

test("contratos/livekit-roles.json: en F2 ningún rol publica audio ni vídeo, todos publican datos, nadie lleva roomAdmin y la identidad es opaca", () => {
  const R = JSON.parse(lee("contratos/livekit-roles.json"));
  assert.strictEqual(R.contrato, "livekit-roles"); assert.strictEqual(R.version, 2); assert.strictEqual(R.fase, "F2");
  assert.deepStrictEqual(Object.keys(R.roles).sort(), ["admin", "corresponsal", "guia", "hogar"], "los roles de contratos/sesion.md");
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
  const md = lee("contratos/presencia.md");
  for (const s of ["24 B", "56 B", "smallest-three", "livekit-roles.json", "versión"]) assert.ok(md.includes(s), "presencia.md no menciona «" + s + "»");
});

// ---------- en Chrome
const SALTO = motivoSalto("la presencia simulada en navegador");
let srv, navegador, base;
test.before(async () => {
  if (SALTO) return;
  const FIX = path.relative(RAIZ, fixture()), WEB = propia("web-presencia");
  const r = ejecuta(python(), ["-I", "tuberia/salida_artefacto/montar_v2.py", "--datos", FIX + "/cerro/embebido.json", "--salida", path.relative(RAIZ, path.join(WEB, "cerro", "index.html"))]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  srv = await sirve(WEB); base = "http://127.0.0.1:" + srv.address().port + "/cerro/index.html";
  navegador = await lanza();
});
test.after(async () => { if (navegador) await navegador.close(); if (srv) srv.close(); });

async function abre(consulta) {
  const p = await navegador.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
  p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 400)));
  p.on("console", m => { if (m.type() === "error") errores.push("CONSOLE " + m.text().slice(0, 300)); });
  await p.goto(base + "?debug" + consulta);
  await p.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 60000 });
  const e = ESCENARIOS.cerca;
  await p.evaluate(e => { const g = window.__g; g.orb.az = e.az; g.orb.el = e.el; g.orb.dist = e.dist; g.objetivo.x = e.ox; g.objetivo.z = -e.oy; g.objetivo.y = g.suelo(e.ox, e.oy) + 4; g.pon(e.modo); }, e);
  await p.waitForFunction(() => window.__g.Cola.pendientes() === 0, null, { timeout: 60000, polling: 500 }).catch(() => {});
  await p.waitForTimeout(3000);
  const m = await p.evaluate(() => {
    const g = window.__g, r = g.renderer.info, dep = [...document.querySelectorAll("#visor div")].map(d => d.textContent).find(t => /fps · JS/.test(t)) || "";
    return { llamadas: r.render.calls, triangulos: r.render.triangles, puntos: r.render.points, geometrias: r.memory.geometries, texturas: r.memory.textures,
      grupo: !!g.scene.getObjectByName("presencia"), pres: window.__presencia(), jsFotograma: Number((/JS ([\d.]+) ms/.exec(dep) || [])[1]) };
  });
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
  const d10 = res[10].llamadas - res[0].llamadas, d40 = res[40].llamadas - res[0].llamadas;
  assert.ok(d10 >= 4 && d10 <= 5, "10 visitantes: " + d10 + " llamadas más (esperadas 4-5: cuerpo, cabeza, sombrero, nombres y manos si hay Quest)");
  assert.strictEqual(d40, 5, "40 visitantes: " + d40 + " llamadas más (esperadas 5)");
  assert.ok(res[40].triangulos - res[0].triangulos <= 40 * 60, "40 visitantes: más de 60 triángulos por avatar");
});

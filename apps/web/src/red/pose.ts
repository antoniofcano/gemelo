// La pose de la presencia compartida (F2, contratos/presencia.md v1; MU5-n, A3-6a: antes el trozo puro de apps/web/motor/26_presencia.js, que queda como talón):
// el códec de la pose (PoseCodec: 24 B a pie o en pantalla, 56 B con gafas y manos; posición en centímetros int32 y giro «smallest-three» en un u32) y el búfer
// de interpolación de cada visitante remoto (BufferPose). Movidos tal cual, sin cambiar un byte del protocolo. ADR-0036 (2026-11-14): los bits 6-7 del byte 1 llevan el
// MUNDO de quien publica (MUNDOS: la tabla `mundos_pose` de contratos/livekit-roles.json v9; 0 = exterior, lo que ve un cliente de antes). Sin three ni DOM: es red (MUNDOS §1, solo importa de datos/). Lo prueban pose.test.ts (número a número con los ejemplos del
// contrato) y pruebas/guardianes/presencia.test.js.

// [puro:inicio] — códec de pose y búfer de interpolación: sin THREE ni DOM
export const PoseCodec: any = (function () {
  var VERSION: any = 1, ESCRITORIO: any = 1, QUEST: any = 2, BYTES: any = { 1: 24, 2: 56 };
  var PIE: any = 0, QUAD: any = 1, DRON: any = 2;   // modo de quien publica, bits 4-5 del byte 1 (P6; los receptores de antes los ignoran: sigue siendo la v1)
  // ADR-0036: el mundo de quien publica, bits 6-7 del byte 1; el índice es el código (contratos/livekit-roles.json v9, «mundos_pose»: lo vigila pose.test.ts).
  // Un mundo que no está en la lista viaja como 3 «otro»; sin mundo, 0 (exterior: lo que publicaba todo el mundo antes)
  var MUNDOS: any = ["exterior", "patios", "fabrica", "otro"], OTRO: any = 3;
  function codigoMundo(nombre?: any) { if (nombre == null) return 0; var i: any = MUNDOS.indexOf(nombre); return i >= 0 ? i : OTRO; }
  function nombreMundo(c?: any) { return MUNDOS[c & 3]; }
  var R2: any = Math.SQRT2, IR2: any = Math.SQRT1_2, QMAX: any = 1023, I32MAX: any = 2147483647, I32MIN: any = -2147483648;
  function cm(v?: any) {   // metros → centímetros enteros (int32); fuera del int32 o no finita es un error del que llama
    var c: any = Math.round(v * 100);
    if (!isFinite(c) || c > I32MAX || c < I32MIN) throw new RangeError("posición fuera del contrato de pose: " + v);
    return c;
  }
  // cuaternión [x, y, z, w] → u32 «smallest-three»: bits 30-31 = índice de la componente mayor (se vuelve positiva y no viaja); 3 × 10 bits = las otras tres
  function empaquetaQ(q?: any) {
    var l: any = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    if (!(l > 1e-9) || !isFinite(l)) throw new RangeError("cuaternión no válido");
    var im: any = 0, j: any, a: any = [0, 0, 0], k: any = 0;
    for (j = 1; j < 4; j++) if (Math.abs(q[j]) > Math.abs(q[im])) im = j;
    var s: any = q[im] < 0 ? -1 / l : 1 / l;
    for (j = 0; j < 4; j++) {
      if (j === im) continue;
      var v: any = Math.round((q[j] * s + IR2) / R2 * QMAX); a[k++] = v < 0 ? 0 : v > QMAX ? QMAX : v;
    }
    return ((im << 30) | (a[0] << 20) | (a[1] << 10) | a[2]) >>> 0;
  }
  function desempaquetaQ(u?: any, out?: any) {
    var im: any = u >>> 30, a: any = [(u >>> 20) & 1023, (u >>> 10) & 1023, u & 1023], k: any = 0, s: any = 0;
    for (var j: any = 0; j < 4; j++) { if (j === im) continue; var v: any = a[k++] / QMAX * R2 - IR2; out[j] = v; s += v * v; }
    out[im] = Math.sqrt(Math.max(0, 1 - s));
    return out;
  }
  function escribePieza(dv?: any, o?: any, pz?: any) { dv.setInt32(o, cm(pz.p[0]), true); dv.setInt32(o + 4, cm(pz.p[1]), true); dv.setInt32(o + 8, cm(pz.p[2]), true); dv.setUint32(o + 12, empaquetaQ(pz.q), true); }
  function leePieza(dv?: any, o?: any) { return { p: [dv.getInt32(o, true) / 100, dv.getInt32(o + 4, true) / 100, dv.getInt32(o + 8, true) / 100], q: desempaquetaQ(dv.getUint32(o + 12, true), [0, 0, 0, 1]) }; }
  // pose = { tipo: 1|2, seq: u16, t: ms u32 del reloj del emisor, cab: {p:[x,y,z] m, q:[x,y,z,w]}, izq, der: {p, q} o null (solo tipo 2), modo: 0 a pie | 1 quad | 2 dron (si falta, a pie),
  //   mundo: código 0-3 (codigoMundo(nombre); si falta o no es 0-3, 0) } → Uint8Array de 24 o 56 B
  function codifica(pose?: any) {
    var tipo: any = pose.tipo === QUEST ? QUEST : ESCRITORIO, b: any = new Uint8Array(BYTES[tipo]), dv: any = new DataView(b.buffer);
    var modo: any = pose.modo === QUAD || pose.modo === DRON ? pose.modo : PIE;
    var mundo: any = pose.mundo === 1 || pose.mundo === 2 || pose.mundo === 3 ? pose.mundo : 0;
    var band: any = tipo | (tipo === QUEST && pose.izq ? 4 : 0) | (tipo === QUEST && pose.der ? 8 : 0) | (modo << 4) | (mundo << 6);
    dv.setUint8(0, VERSION); dv.setUint8(1, band); dv.setUint16(2, pose.seq & 0xffff, true); dv.setUint32(4, pose.t >>> 0, true);
    escribePieza(dv, 8, pose.cab);
    if (tipo === QUEST) { if (pose.izq) escribePieza(dv, 24, pose.izq); if (pose.der) escribePieza(dv, 40, pose.der); }
    return b;
  }
  // Uint8Array (o ArrayBuffer) → pose, o null si no es una pose de esta versión (longitud, versión o tipo desconocidos: se descarta, no se adivina)
  function decodifica(b?: any) {
    if (b instanceof ArrayBuffer) b = new Uint8Array(b);
    if (!b || typeof b.byteLength !== "number" || b.byteLength < 2) return null;
    var dv: any = new DataView(b.buffer, b.byteOffset, b.byteLength), ver: any = dv.getUint8(0), band: any = dv.getUint8(1), tipo: any = band & 3;
    if (ver !== VERSION || !BYTES[tipo] || b.byteLength !== BYTES[tipo]) return null;
    var modo: any = (band >> 4) & 3;   // 3 está reservado: se toma como a pie (no se descarta la pose por eso)
    var pose: any = { tipo: tipo, seq: dv.getUint16(2, true), t: dv.getUint32(4, true), cab: leePieza(dv, 8), izq: null, der: null, modo: modo === 3 ? PIE : modo, mundo: (band >> 6) & 3 };   // ADR-0036: el mundo, tal cual
    if (tipo === QUEST) { if (band & 4) pose.izq = leePieza(dv, 24); if (band & 8) pose.der = leePieza(dv, 40); }
    return pose;
  }
  return { VERSION: VERSION, ESCRITORIO: ESCRITORIO, QUEST: QUEST, BYTES: BYTES, PIE: PIE, QUAD: QUAD, DRON: DRON, MUNDOS: MUNDOS, OTRO: OTRO, codigoMundo: codigoMundo, nombreMundo: nombreMundo, codifica: codifica, decodifica: decodifica, empaquetaQ: empaquetaQ, desempaquetaQ: desempaquetaQ };
})();

// Búfer de interpolación de UN visitante remoto: guarda las últimas poses (por orden de secuencia), estima el desfase de relojes (mínimo de llegada − envío)
// y devuelve la pose de «retardo» ms atrás, interpolada (posición lineal, giro nlerp); si falta la siguiente, extrapola como mucho EXTRA ms y luego se queda quieto.
export const BufferPose: any = (function () {
  var MAX: any = 12, EXTRA: any = 120;
  function crea() { return { m: [], seq: -1, tBajo: 0, tExt: 0, desfase: Infinity, viejas: 0 }; }
  function recibe(b?: any, pose?: any, ahora?: any) {
    if (b.seq >= 0) { var d: any = (pose.seq - b.seq) & 0xffff; if (d === 0 || d >= 0x8000) { b.viejas++; return false; } }   // repetida o más vieja que la última: fuera
    var t: any = b.seq >= 0 ? b.tExt + ((pose.t - b.tBajo) | 0) : pose.t;   // el reloj del emisor es u32 y da la vuelta: se desenrolla con la diferencia con signo
    b.seq = pose.seq; b.tBajo = pose.t >>> 0; b.tExt = t;
    if (ahora - t < b.desfase) b.desfase = ahora - t;
    b.m.push({ t: t, tipo: pose.tipo, cab: pose.cab, izq: pose.izq, der: pose.der, modo: pose.modo | 0, mundo: pose.mundo | 0 });
    if (b.m.length > MAX) b.m.shift();
    return true;
  }
  function lerpP(a?: any, c?: any, k?: any, o?: any) { o[0] = a[0] + (c[0] - a[0]) * k; o[1] = a[1] + (c[1] - a[1]) * k; o[2] = a[2] + (c[2] - a[2]) * k; }
  function nlerpQ(a?: any, c?: any, k?: any, o?: any) {
    var s: any = a[0] * c[0] + a[1] * c[1] + a[2] * c[2] + a[3] * c[3] < 0 ? -1 : 1, l: any = 0, i: any;
    for (i = 0; i < 4; i++) { o[i] = a[i] * (1 - k) + c[i] * s * k; l += o[i] * o[i]; }
    l = Math.sqrt(l) || 1; for (i = 0; i < 4; i++) o[i] /= l;
  }
  function pieza(a?: any, c?: any, k?: any, o?: any) {   // a o c pueden faltar (una mano que se pierde): se toma la que haya
    if (!a && !c) return false; if (!a) a = c; if (!c) c = a;
    lerpP(a.p, c.p, k, o.p); nlerpQ(a.q, c.q, Math.max(0, Math.min(1, k)), o.q); return true;
  }
  // out = { cab: {p, q}, izq: {p, q}, der: {p, q}, hayIzq, hayDer, tipo, modo, mundo (ADR-0036: el de la última pose, no se interpola), t } (se reutiliza); devuelve false si aún no hay nada
  function muestra(b?: any, ahora?: any, retardo?: any, out?: any) {
    var m: any = b.m, n: any = m.length; if (!n) return false;
    var tr: any = ahora - b.desfase - retardo, a: any = m[0], c: any = m[0], k: any = 0, i: any;
    if (tr >= m[n - 1].t) {
      a = n > 1 ? m[n - 2] : m[n - 1]; c = m[n - 1];
      var dtc: any = c.t - a.t; k = dtc > 0 ? 1 + Math.min(tr - c.t, EXTRA) / dtc : 1;
    } else if (tr > m[0].t) {
      for (i = 1; i < n; i++) if (m[i].t > tr) { a = m[i - 1]; c = m[i]; k = (tr - a.t) / (c.t - a.t); break; }
    }
    out.tipo = c.tipo; out.modo = c.modo | 0; out.mundo = c.mundo | 0; out.t = Math.min(tr, c.t + (k > 1 ? Math.min(tr - c.t, EXTRA) : 0));
    pieza(a.cab, c.cab, k, out.cab);
    out.hayIzq = pieza(a.izq, c.izq, Math.min(k, 1), out.izq); out.hayDer = pieza(a.der, c.der, Math.min(k, 1), out.der);
    return true;
  }
  function salida() { return { cab: { p: [0, 0, 0], q: [0, 0, 0, 1] }, izq: { p: [0, 0, 0], q: [0, 0, 0, 1] }, der: { p: [0, 0, 0], q: [0, 0, 0, 1] }, hayIzq: false, hayDer: false, tipo: 1, modo: 0, mundo: 0, t: 0 }; }
  return { MAX: MAX, EXTRA: EXTRA, crea: crea, recibe: recibe, muestra: muestra, salida: salida };
})();
// [puro:fin]

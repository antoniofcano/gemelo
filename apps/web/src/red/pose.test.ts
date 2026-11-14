// El códec de la pose (red/pose.ts; contratos/presencia.md v1), de forma pura y número a número con la tabla de bytes del contrato. MU5-n (A3-6a): el protocolo no
// cambia al pasar a TypeScript; esta prueba lo fija byte a byte (los errores medidos de ida y vuelta, las tasas y el resto los cubre pruebas/guardianes/presencia.test.js).
import { describe, expect, it } from "vitest";
import { BufferPose, PoseCodec } from "./pose.ts";
import roles from "../../../../contratos/livekit-roles.json";

const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, "0")).join(" ");

describe("PoseCodec: la tabla de bytes del contrato (little-endian)", () => {
  it("escritorio (tipo 1, 24 B): versión, tipo y modo, secuencia, reloj, cabeza en cm y el giro smallest-three", () => {
    const b = PoseCodec.codifica({ tipo: 1, seq: 0x1234, t: 0x01020304, cab: { p: [1.5, -2.25, 300.01], q: [0, 0, 0, 1] }, izq: null, der: null, modo: PoseCodec.QUAD });
    expect(b.byteLength).toBe(24);
    // byte 0: versión 1 · byte 1: tipo 1 | modo 1 en los bits 4-5 (= 0x11) · 2-3: u16 0x1234 · 4-7: u32 0x01020304
    // 8-19: x 150 cm, y −225 cm, z 30001 cm (i32) · 20-23: giro identidad → índice 3 (w) y las otras tres a 512 (= 0xe0080200)
    expect(hex(b)).toBe("01 11 34 12 04 03 02 01 96 00 00 00 1f ff ff ff 31 75 00 00 00 02 08 e0");
    const p = PoseCodec.decodifica(b);
    expect(p).toMatchObject({ tipo: 1, seq: 0x1234, t: 0x01020304, modo: 1, izq: null, der: null });
    expect(p.cab.p).toEqual([1.5, -2.25, 300.01]);
    expect(p.cab.q[3]).toBeCloseTo(1, 5);   // la identidad, con la cuantización de 10 bits
  });

  it("Quest (tipo 2, 56 B): las banderas de cada mano y ceros en la que falta; el modo con gafas es 0", () => {
    const b = PoseCodec.codifica({ tipo: 2, seq: 7, t: 1, cab: { p: [0, 1.6, 0], q: [0, 0, 0, 1] }, izq: { p: [-0.25, 1, -0.3], q: [0, 0, 0, 1] }, der: null });
    expect(b.byteLength).toBe(56);
    expect(b[1]).toBe(2 | 4);   // tipo 2, mano izquierda (bit 2), sin la derecha (bit 3)
    const dv = new DataView(b.buffer);
    expect([dv.getInt32(24, true), dv.getInt32(28, true), dv.getInt32(32, true)]).toEqual([-25, 100, -30]);
    expect(Array.from(b.subarray(40, 56)).every(x => x === 0)).toBe(true);
    const p = PoseCodec.decodifica(b);
    expect(p.izq.p).toEqual([-0.25, 1, -0.3]); expect(p.der).toBeNull(); expect(p.modo).toBe(0);
  });

  it("lo que no es del contrato se descarta, no se adivina; los bits reservados se ignoran", () => {
    const b = PoseCodec.codifica({ tipo: 1, seq: 1, t: 1, cab: { p: [0, 0, 0], q: [0, 0, 0, 1] }, izq: null, der: null });
    const v2 = b.slice(); v2[0] = 2; expect(PoseCodec.decodifica(v2)).toBeNull();                        // otra versión
    for (const t of [0, 3]) { const x = b.slice(); x[1] = t; expect(PoseCodec.decodifica(x), "tipo " + t).toBeNull(); }   // tipos reservados
    expect(PoseCodec.decodifica(b.slice(0, 23))).toBeNull();                                               // longitud que no es la del tipo
    expect(PoseCodec.decodifica(new Uint8Array(56))).toBeNull();
    const m3 = b.slice(); m3[1] = 1 | (3 << 4); expect(PoseCodec.decodifica(m3).modo).toBe(PoseCodec.PIE);  // modo 3 (reservado): a pie, no se descarta
    const r = b.slice(); r[1] = 1 | 0xc0; expect(PoseCodec.decodifica(r)!.mundo).toBe(PoseCodec.OTRO);     // bits 6-7 = 3: el mundo «otro» (ADR-0036), no se descarta
    expect(PoseCodec.decodifica(b.buffer)).not.toBeNull();                                                   // un ArrayBuffer también vale
    expect(() => PoseCodec.codifica({ tipo: 1, seq: 0, t: 0, cab: { p: [3e7, 0, 0], q: [0, 0, 0, 1] } })).toThrow(RangeError);   // fuera del int32 en cm
  });

  it("smallest-three: la componente mayor no viaja; ida y vuelta dentro del cuarto de grado del contrato", () => {
    const q = [0.1, -0.7, 0.2, 0.68], l = Math.hypot(...q), n = q.map(v => v / l);
    const u = PoseCodec.empaquetaQ(q);
    expect(u >>> 30).toBe(1);   // y es la mayor (en valor absoluto)
    const o = PoseCodec.desempaquetaQ(u, [0, 0, 0, 0]);
    const dot = Math.abs(o.reduce((s: number, v: number, i: number) => s + v * (n[i] ?? 0), 0));
    expect(2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI).toBeLessThanOrEqual(0.25);
  });
});

describe("BufferPose", () => {
  it("descarta la repetida y la vieja (módulo 2^16) e interpola la posición a «retardo» ms", () => {
    const b = BufferPose.crea(), o = BufferPose.salida(), P = (seq: number, t: number, x: number) => ({ tipo: 1, seq, t, cab: { p: [x, 0, 0], q: [0, 0, 0, 1] }, izq: null, der: null, modo: 0 });
    expect(BufferPose.recibe(b, P(65535, 1000, 0), 5000)).toBe(true);
    expect(BufferPose.recibe(b, P(0, 1100, 10), 5100)).toBe(true);    // da la vuelta: es la siguiente
    expect(BufferPose.recibe(b, P(0, 1100, 10), 5100)).toBe(false);   // repetida
    expect(BufferPose.recibe(b, P(65000, 900, 0), 5100)).toBe(false); // más vieja
    expect(BufferPose.muestra(b, 5150, 100, o)).toBe(true);           // 50 ms tras la primera (desfase 4000)
    expect(o.cab.p[0]).toBeCloseTo(5, 9);
  });
});

describe("PoseCodec: el mundo en los bits 6-7 del byte 1 (ADR-0036, contratos/livekit-roles.json v9)", () => {
  const cab = { p: [1, 2, 3], q: [0, 0, 0, 1] }, mano = { p: [0, 1, 0], q: [0, 0, 0, 1] };
  it("la tabla es la del contrato (mundos_pose): el índice es el código; un mundo que no está, «otro»; sin mundo, el exterior", () => {
    expect(PoseCodec.MUNDOS).toEqual(roles.mundos_pose.lista);
    expect(["exterior", "patios", "fabrica", "otro"].map(PoseCodec.codigoMundo)).toEqual([0, 1, 2, 3]);
    expect(PoseCodec.codigoMundo("vacio")).toBe(3); expect(PoseCodec.codigoMundo("bodega")).toBe(3); expect(PoseCodec.codigoMundo(null)).toBe(0); expect(PoseCodec.codigoMundo(undefined)).toBe(0);
    expect([0, 1, 2, 3].map(PoseCodec.nombreMundo)).toEqual(roles.mundos_pose.lista);
  });
  it("ida y vuelta de los cuatro mundos con los tres modos y los dos tipos: el tamaño, la versión, el tipo, las manos y el modo no cambian", () => {
    for (const tipo of [1, 2]) for (const modo of [0, 1, 2]) for (const mundo of [0, 1, 2, 3]) {
      const b = PoseCodec.codifica({ tipo, seq: 9, t: 5, cab, izq: tipo === 2 ? mano : null, der: null, modo: tipo === 2 ? 0 : modo, mundo });
      expect(b.byteLength).toBe(PoseCodec.BYTES[tipo]); expect(b[0]).toBe(1);
      expect(b[1]! >> 6).toBe(mundo); expect(b[1]! & 3).toBe(tipo); expect((b[1]! >> 4) & 3).toBe(tipo === 2 ? 0 : modo);
      const d = PoseCodec.decodifica(b);
      expect(d).toMatchObject({ tipo, mundo, modo: tipo === 2 ? 0 : modo }); expect(d.cab.p).toEqual([1, 2, 3]);
      if (tipo === 2) { expect(d.izq).not.toBeNull(); expect(d.der).toBeNull(); }
    }
  });
  it("lectura antigua: un cliente de antes solo miraba los bits 0-5 y ve la misma pose; una pose de antes (bits 6-7 a 0) es del exterior", () => {
    const b = PoseCodec.codifica({ tipo: 1, seq: 1, t: 2, cab, modo: PoseCodec.QUAD, mundo: PoseCodec.codigoMundo("fabrica") });
    const viejo = (band: number) => ({ tipo: band & 3, izq: !!(band & 4), der: !!(band & 8), modo: (band >> 4) & 3 });
    expect(viejo(b[1]!)).toEqual({ tipo: 1, izq: false, der: false, modo: 1 });
    const antes = PoseCodec.codifica({ tipo: 1, seq: 1, t: 2, cab });
    expect(antes[1]).toBe(1); expect(PoseCodec.decodifica(antes).mundo).toBe(0);
    expect(PoseCodec.codifica({ tipo: 1, seq: 1, t: 2, cab, mundo: 7 })[1]).toBe(1);   // un código que no es 0-3 viaja como exterior (quien publica pasa codigoMundo)
  });
  it("el búfer lleva el mundo de la última pose hasta la que se dibuja", () => {
    const bf = BufferPose.crea(), out = BufferPose.salida();
    expect(out.mundo).toBe(0);
    BufferPose.recibe(bf, PoseCodec.decodifica(PoseCodec.codifica({ tipo: 1, seq: 1, t: 0, cab, mundo: 0 })), 0);
    BufferPose.recibe(bf, PoseCodec.decodifica(PoseCodec.codifica({ tipo: 1, seq: 2, t: 100, cab, mundo: 2 })), 100);
    BufferPose.muestra(bf, 300, 0, out); expect(out.mundo).toBe(2);
  });
});

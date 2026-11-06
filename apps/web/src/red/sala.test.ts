// La lógica de la sala (red/sala.ts; contratos/presencia.md v1; MU5-n, A3-6a): tasas, cercanía, metadatos leídos como datos, chat y arranque solo.
// Lo de siempre lo cubre a fondo pruebas/guardianes/presencia_red.test.js; aquí, que lo movido a TypeScript se comporta igual en lo que fija el contrato.
import { describe, expect, it } from "vitest";
import { Aspecto, AutoPresencia, Chat, Reintento, SalaPose } from "./sala.ts";
import { PoseCodec } from "./pose.ts";

const pose = (x: number, z: number) => ({ tipo: 1, seq: 0, t: 0, cab: { p: [x, 1.6, z], q: [0, 0, 0, 1] }, izq: null, der: null });

describe("SalaPose", () => {
  it("2 Hz a toda la sala; 10 Hz a quien entra a 55 m y sale a 65 m; en vista aérea, nada", () => {
    const s = SalaPose.crea(0);
    let ahora = 1000, todos = 0, aCerca = 0;
    SalaPose.entra(s, "h", null);
    const otra = (x: number) => { SalaPose.recibe(s, "h", PoseCodec.codifica({ tipo: 1, seq: ahora & 0xffff, t: ahora, cab: { p: [x, 1.6, 0], q: [0, 0, 0, 1] } }), ahora); };
    for (let i = 0; i < 10; i++, ahora += 100) { otra(50); const e = SalaPose.tic(s, ahora, pose(0, 0)); for (const m of e || []) { if (m.destinos === null) todos++; else aCerca++; } }
    expect(todos).toBe(2); expect(aCerca).toBe(8);   // a 50 m: cerca (entra a < 55)
    otra(60); SalaPose.tic(s, ahora += 100, pose(0, 0)); expect(s.otros.h.cerca).toBe(true);    // 60 m: sigue cerca (sale a > 65)
    otra(66); SalaPose.tic(s, ahora += 100, pose(0, 0)); expect(s.otros.h.cerca).toBe(false);
    expect(SalaPose.tic(s, ahora += 100, null)).toEqual([]);   // vista aérea: no se publica
  });

  it("leeInfo: los metadatos de la api son DATOS; lo que no cuadra toma un valor neutro y nadie se hace pasar por la oficina", () => {
    expect(SalaPose.leeInfo("no es json")).toMatchObject({ alias: "Visitante", rol: "hogar", dispositivo: "escritorio", camisa: 0, piel: 1, sombrero: 1, vrm: null });
    expect(SalaPose.leeInfo(JSON.stringify({ alias: "0ficina", rol: "hogar" })).alias).toBe("Visitante");
    expect(SalaPose.leeInfo(JSON.stringify({ alias: "Ana", rol: "oficina" }))).toMatchObject({ alias: "Oficina", oficial: true });
    expect(SalaPose.leeInfo(JSON.stringify({ avatar: { vrm: "../x", tono: 12, movilidad: "silla" } })).aspecto).toMatchObject({ tono: null, movilidad: "silla" });
    expect(Aspecto.cajas(true, "andador", true)).toBe(5);
  });
});

describe("Chat, AutoPresencia y Reintento", () => {
  it("el chat quita los caracteres de control y de dirección, junta espacios y corta a 280", () => {
    expect(Chat.limpia("  hola‮  \u0000mundo ")).toBe("hola mundo");
    expect(Chat.decodifica(Chat.codifica("x".repeat(400)))).toHaveLength(280);
    expect(Chat.decodifica(new Uint8Array([0xff, 0xfe]))).toBeNull();
  });
  it("arranca sola solo con { red: true } exacto; el reintento crece hasta su tope y se rinde", () => {
    expect(AutoPresencia.decide("?presencia=red", null, true)).toBe("red");
    expect(AutoPresencia.decide("", "/api/", true)).toBe("pregunta");
    expect(AutoPresencia.decide("", "/api/", false)).toBe("");
    expect([{ red: true }, { red: "si" }, null].map(AutoPresencia.decideRed)).toEqual([true, false, false]);
    expect([1, 2, 6, 7].map(Reintento.espera)).toEqual([30000, 60000, 600000, -1]);
  });
});

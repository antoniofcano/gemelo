// La pendiente del paseo (A3-5, MU5-n; antes 22_huellas.js). Sin three ni DOM: un suelo inclinado y un quad de mentira. Se comprueba la pendiente a lo largo del rumbo y de lado (con la
// exageración), el factor de velocidad acotado, la inclinación suavizada del quad y «sueloSeco» (lluvia, arroyo, humedad y cubierta). No tiene recursos que soltar.
import { describe, expect, it } from "vitest";
import { creaHuellas } from "./huellas.ts";
import type { DepsHuellas } from "./huellas.ts";

function monta(extra: Partial<DepsHuellas> = {}) {
  const rot: number[][] = [];
  const deps: DepsHuellas = {
    suelo: (x, y) => 0.1 * x + 0.05 * y,   // sube hacia el este (0,1 m/m) y hacia el norte (0,05 m/m)
    Estado: { exag: 1 }, pp: { x: 0, y: 0, ang: 0, paso: 0 },
    quad: () => ({ rotation: { set: (x: number, y: number, z: number) => { rot.push([x, y, z]); } } }),
    cur: { lluvia: 0, hr: 40 }, aguaNivel: () => 0, cubierta: () => [0.2, 0, 0], ...extra
  };
  return { H: creaHuellas(deps), deps, rot };
}

describe("pendiente del paseo", () => {
  it("la pendiente a lo largo del rumbo y de lado, con la exageración vertical", () => {
    const { H, deps } = monta();
    // rumbo 0 = norte (fy = 1): a lo largo sube 0,05; de lado (este, rx = 1) sube 0,1
    const p = H.pendienteRumbo(0, 0, 0); expect(p[0]).toBeCloseTo(0.05, 9); expect(p[1]).toBeCloseTo(0.1, 9);
    deps.Estado.exag = 2; const q = H.pendienteRumbo(0, 0, 0); expect(q[0]).toBeCloseTo(0.1, 9);
  });
  it("cuesta arriba cuesta más y el factor está acotado entre 0,35 y 1,25", () => {
    const { H, deps } = monta();
    expect(H.pendFactor()).toBeCloseTo(1 - 1.25 * 0.05, 9);
    deps.pp.ang = Math.PI / 2; expect(H.pendFactor()).toBeCloseTo(1 - 1.25 * 0.1, 9);   // hacia el este
    deps.pp.ang = -Math.PI / 2; expect(H.pendFactor()).toBeCloseTo(1 + 1.25 * 0.1, 9);   // cuesta abajo
    const m = monta({ suelo: (x: number) => 10 * x }); m.deps.pp.ang = Math.PI / 2; expect(m.H.pendFactor()).toBe(0.35);
    const n = monta({ suelo: (x: number) => -10 * x }); n.deps.pp.ang = Math.PI / 2; expect(n.H.pendFactor()).toBe(1.25);
  });
  it("el quad se inclina poco a poco hacia la pendiente y lo escribe en su rotación (orden YXZ)", () => {
    const { H, deps, rot } = monta(); deps.pp.ang = 0;
    H.inclinaQuad(1 / 60); const a = H.quadInc.pit; expect(a).toBeGreaterThan(0); expect(a).toBeLessThan(Math.atan(0.05));
    for (let i = 0; i < 300; i++) H.inclinaQuad(1 / 60);
    expect(H.quadInc.pit).toBeCloseTo(Math.atan(0.05), 3); expect(H.quadInc.rol).toBeCloseTo(Math.atan(0.1), 3);
    expect(rot.length).toBe(301); expect(rot[300]![1]).toBeCloseTo(-0, 9);
  });
  it("sueloSeco: sin lluvia, con el arroyo bajo, hr < 92 y poca hierba; cualquier otra cosa lo moja", () => {
    const { H, deps } = monta(); expect(H.sueloSeco(0, 0)).toBe(true);
    deps.cur.lluvia = 0.5; expect(H.sueloSeco(0, 0)).toBe(false); deps.cur.lluvia = 0;
    deps.cur.hr = 95; expect(H.sueloSeco(0, 0)).toBe(false); deps.cur.hr = 40;
    expect(monta({ aguaNivel: () => 0.3 }).H.sueloSeco(0, 0)).toBe(false);
    expect(monta({ cubierta: () => [0.9, 0, 0] }).H.sueloSeco(0, 0)).toBe(false);
  });
});

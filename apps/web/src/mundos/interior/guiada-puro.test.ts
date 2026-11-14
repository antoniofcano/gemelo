// La visita guiada compartida, lo puro: el evento «guiada:visita» comprobado, qué se ofrece a la familia (parada o mundo), el puesto en anillo alrededor de
// una parada (por identidad, dentro de las zonas del interior y mirando al ancla) y quién manda en las máquinas. Con el ejemplo sintético del contrato.
import { describe, expect, it } from "vitest";
import ejemplo from "../../../../../modelos/interiores/ejemplo/mundo.json";
import type { MundoInterior } from "../../datos/contratos/mundo-interior.ts";
import { GuiadaPuro as G } from "./guiada-puro.ts";
import type { VisitaGuiada } from "./guiada-puro.ts";
import { InteriorPuro } from "./puro.ts";
import { VisitaPuro } from "./visita-puro.ts";

const MAN = ejemplo as unknown as MundoInterior;
const v = (o: Partial<VisitaGuiada> = {}): VisitaGuiada => ({ mundo: "fabrica", parada: null, maquinas: null, n: 1, soyGuia: false, ...o });

describe("GuiadaPuro.lee", () => {
  it("el evento bueno, tal cual; parada ausente = null", () => {
    expect(G.lee({ mundo: "exterior", parada: null, maquinas: { marcha: true, desde: 5 }, n: 7, soyGuia: true })).toEqual({ mundo: "exterior", parada: null, maquinas: { marcha: true, desde: 5 }, n: 7, soyGuia: true });
    expect(G.lee({ mundo: "patios", maquinas: null, n: 0 })).toEqual({ mundo: "patios", parada: null, maquinas: null, n: 0, soyGuia: false });
  });
  it("lo que no se entiende, null (es dato de otros)", () => {
    for (const x of [null, 3, {}, { mundo: "otro", n: 1 }, { mundo: "fabrica", n: -1 }, { mundo: "fabrica", n: 1.5 }, { mundo: "fabrica", n: 1, parada: 64 }, { mundo: "fabrica", n: 1, parada: "2" },
      { mundo: "fabrica", n: 1, maquinas: { marcha: "si", desde: 1 } }, { mundo: "fabrica", n: 1, maquinas: { marcha: true } }]) expect(G.lee(x)).toBeNull();
  });
});

describe("GuiadaPuro.decide", () => {
  const ctx = { mundo: "fabrica", titulos: ["La llegada", "La prensa", "La salida"] };
  it("al guía y a lo viejo o repetido, nada", () => {
    expect(G.decide(v({ parada: 1, soyGuia: true }), null, ctx).tipo).toBe("nada");
    expect(G.decide(v({ parada: 1, n: 3 }), v({ parada: 0, n: 3 }), ctx).tipo).toBe("nada");
    expect(G.decide(v({ parada: 1, n: 2 }), v({ parada: 0, n: 3 }), ctx).tipo).toBe("nada");
  });
  it("en el mismo mundo, la parada nueva con su número y título; la misma parada, solo máquinas o una parada que no hay, nada", () => {
    expect(G.decide(v({ parada: 1, n: 4 }), v({ parada: 0, n: 3 }), ctx)).toEqual({ tipo: "parada", k: 1, texto: "El guía va a la parada 2 · La prensa" });
    expect(G.decide(v({ parada: 1, n: 4, maquinas: { marcha: true, desde: 1 } }), v({ parada: 1, n: 3 }), ctx).tipo).toBe("nada");
    expect(G.decide(v({ parada: 9, n: 4 }), v({ n: 3 }), ctx).tipo).toBe("nada");
    expect(G.decide(v({ parada: null, n: 4 }), v({ parada: 1, n: 3 }), ctx).tipo).toBe("nada");
  });
  it("quien llega tarde (antes null) recibe la parada en curso", () => {
    expect(G.decide(v({ parada: 2, n: 9 }), null, ctx)).toMatchObject({ tipo: "parada", k: 2 });
  });
  it("la visita en otro mundo: «La visita está en la fábrica» al cambiar de mundo o al llegar tarde, no en cada parada", () => {
    const fuera = { mundo: "exterior", titulos: [] };
    expect(G.decide(v({ n: 2 }), v({ mundo: "exterior", n: 1 }), fuera)).toEqual({ tipo: "mundo", mundo: "fabrica", parada: null, texto: "La visita está en la fábrica" });
    expect(G.decide(v({ n: 2, parada: 1 }), null, fuera)).toMatchObject({ tipo: "mundo", mundo: "fabrica", parada: 1 });
    expect(G.decide(v({ n: 3, parada: 2 }), v({ n: 2, parada: 1 }), fuera).tipo).toBe("nada");
    expect(G.decide(v({ mundo: "exterior", n: 5 }), v({ n: 4 }), ctx)).toMatchObject({ texto: "La visita está fuera, en el cortijo" });
    expect(G.decide(v({ mundo: "patios", n: 5 }), v({ n: 4 }), ctx)).toMatchObject({ texto: "La visita está en los patios" });
  });
});

describe("GuiadaPuro.puesto (anillo alrededor de la parada)", () => {
  const Z = InteriorPuro.creaZonas(MAN.zonas), P = MAN.paradas!, dentro = (x: number, y: number) => Z.dentro(x, y);
  const ids = Array.from({ length: 15 }, (_, i) => "familia-" + i);
  it("cada uno dentro de las zonas (con su cuerpo), a menos del radio + la histéresis (la ficha no se cierra al llegar) y mirando al ancla", () => {
    for (const p of P) for (const id of ids) {
      const q = G.puesto(p, id, dentro)!;
      expect(q).not.toBeNull();
      for (const [dx, dy] of [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) expect(Z.dentro(q.x + dx!, q.y + dy!)).toBe(true);
      expect(VisitaPuro.aParada(p, q.x, q.y)).toBeLessThan(p.radio + VisitaPuro.HISTERESIS);
      expect(q.ang).toBeCloseTo(VisitaPuro.angHacia(q.x, q.y, p.ancla.pos), 9);
    }
  });
  it("la misma identidad, el mismo sitio; 15 familias se reparten (no todas en el mismo punto)", () => {
    const p = P[1]!, a = G.puesto(p, "x", dentro), b = G.puesto(p, "x", dentro);
    expect(a).toEqual(b);
    const sitios = new Set(ids.map(id => { const q = G.puesto(p, id, dentro)!; return q.x.toFixed(2) + "," + q.y.toFixed(2); }));
    expect(sitios.size).toBeGreaterThanOrEqual(6);
  });
  it("si no cabe en el anillo, en la propia parada; si ni ahí, null (no se mueve)", () => {
    const p = P[0]!, cx = p.pos[0], cy = -p.pos[2];
    const solo = (x: number, y: number) => Math.hypot(x - cx, y - cy) < 0.4;
    expect(G.puesto(p, "a", solo)).toMatchObject({ x: cx, y: cy });
    expect(G.puesto(p, "a", () => false)).toBeNull();
  });
  it("los radios del anillo, dentro del radio + la histéresis", () => {
    for (const r of [0.5, 1, 2, 4]) for (const d of G.radios(r, false).concat(G.radios(r, true))) expect(d).toBeLessThan(r + VisitaPuro.HISTERESIS);
  });
});

describe("GuiadaPuro.maquinas", () => {
  it("sin estado del guía, cada aparato el suyo", () => { expect(G.maquinas(null, true, true)).toEqual({ mando: "propio" }); });
  it("con él, la marcha del grupo salvo reducir movimiento o «parar para mí»", () => {
    expect(G.maquinas({ marcha: true, desde: 0 }, false, false)).toEqual({ mando: "guia", marcha: true, grupo: true, motivo: "grupo" });
    expect(G.maquinas({ marcha: false, desde: 0 }, false, false)).toMatchObject({ marcha: false, motivo: "grupo" });
    expect(G.maquinas({ marcha: true, desde: 0 }, true, false)).toEqual({ mando: "guia", marcha: false, grupo: true, motivo: "reducido" });
    expect(G.maquinas({ marcha: true, desde: 0 }, false, true)).toEqual({ mando: "guia", marcha: false, grupo: true, motivo: "paraMi" });
  });
});

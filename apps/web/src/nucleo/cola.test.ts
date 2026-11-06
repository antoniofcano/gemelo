// La Cola y CargaPuro (A1-10 / MU1-6). Estas pruebas vivían en pruebas/guardianes/carga_sin_tirones.test.js evaluando el trozo [puro] de
// apps/web/motor/02b_cola.js; ahora prueban el módulo de verdad. HONESTIDAD: los ms son de un reloj de mentira (deterministas), no de
// Chrome ni de un aparato: cuánto cuesta cada rebanada en un dispositivo es cosa del banco y de ?debug (doc/sistema/MEDIDAS.md).
import { describe, expect, it } from "vitest";
import { CargaPuro, creaCola, creaColaDeMundo, duenoDe } from "./cola.ts";
import type { Trabajo } from "./cola.ts";

interface Reloj { t: number; ahora(): number }
const nuevoReloj = (): Reloj => ({ t: 0, ahora() { return this.t; } });
const colaCon = (reloj: Reloj) => creaCola({ ahora: () => reloj.ahora() });

// la Cola de antes de AG-1.5 (02b_cola.js en c8dd340), como referencia de la equivalencia
function colaAntes(reloj: Reloj) {
  interface J { clave: string; prio: number; gen: Trabajo; fin?: (v: unknown) => void; muerto?: boolean }
  const jobs: J[] = [], activos: Record<string, J> = {}, est = {};
  function add(clave: string, prio: number, gen: Trabajo, fin?: (v: unknown) => void): boolean {
    let j = activos[clave]; if (j) { j.prio = prio; return false; }
    j = { clave, prio, gen, fin }; jobs.push(j); activos[clave] = j; return true;
  }
  function corre(ms: number): void {
    const t0 = reloj.ahora();
    while (jobs.length && reloj.ahora() - t0 < ms) {
      let bi = 0; for (let i = 1; i < jobs.length; i++) if ((jobs[i] as J).prio < (jobs[bi] as J).prio) bi = i;
      const j = jobs[bi] as J;
      if (j.muerto) { jobs.splice(bi, 1); continue; }
      const r = j.gen.next();
      if (r.done) { jobs.splice(bi, 1); if (activos[j.clave] === j) delete activos[j.clave]; if (j.fin) j.fin(r.value); }
    }
  }
  return { add, corre, est, pendientes: () => jobs.length };
}
// la regla de siempre de 07b_arboles.presupuestoBase (antes de AG-1.5)
const baseAntes = (o: { emaDt: number; faltan: number; paseando: boolean }): number => {
  const justo = o.emaDt > 0.034;
  if (o.faltan > 0 && !justo) return o.paseando ? 8 : 12;
  return justo ? (o.paseando ? 3 : 4.5) : (o.paseando ? 3.5 : 6);
};

// un trabajo: costes[i] ms por rebanada; apunta cada rebanada en «traza» y acaba devolviendo su nombre
function* trabajo(reloj: Reloj, nombre: string, costes: number[], traza: string[]): Trabajo {
  for (let i = 0; i < costes.length; i++) { reloj.t += costes[i] ?? 0; traza.push(nombre + "#" + i); if (i < costes.length - 1) yield; }
  return "hecho:" + nombre;
}
// costes pseudoaleatorios deterministas (semilla fija)
function azar(s: number): () => number { return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
interface Lote { clave: string; prio: number; costes: number[] }
function lote(semilla: number): Lote[] {
  const a = azar(semilla), L: Lote[] = [];
  for (let k = 0; k < 24; k++) {
    const n = 1 + Math.floor(a() * 30), tipo = "CNRDB".charAt(k % 5), base = 0.2 + a() * 2.5;
    L.push({ clave: tipo + k, prio: Math.floor(a() * 400), costes: Array.from({ length: n }, () => +(base * (0.6 + a() * 0.8)).toFixed(3)) });
  }
  return L;
}
interface ColaMin { add(c: string, p: number, g: Trabajo, f?: (v: unknown) => void): boolean; corre(ms: number): void; pendientes(): number }
// corre fotogramas con presupuesto ms hasta vaciar; devuelve la traza, los acabados, el gasto por fotograma
function simula(hazCola: (r: Reloj) => ColaMin, L: Lote[], ms: number) {
  const reloj = nuevoReloj(), C = hazCola(reloj), traza: string[] = [], acabados: unknown[] = [], gasto: number[] = [];
  L.forEach(j => C.add(j.clave, j.prio, trabajo(reloj, j.clave, j.costes, traza), v => acabados.push(v)));
  for (let f = 0; f < 100000 && C.pendientes(); f++) { const t0 = reloj.t; C.corre(ms); gasto.push(reloj.t - t0); }
  return { traza, acabados, gasto, fotogramas: gasto.length };
}
const nueva = (r: Reloj): ColaMin => colaCon(r);

describe("CargaPuro.base", () => {
  const esc = { cargaMs: 12, cargaMsVr: 3 }, mov = { cargaMs: 6, cargaMsVr: 3 };   // los valores de Aparato.politica (la guarda de 01a_aparato la comprueba carga_sin_tirones.test.js)
  it("en escritorio, lo de siempre; móvil y gafas ≤ cargaMs, VR ≤ cargaMsVr; la deuda se descuenta y nunca baja de 0", () => {
    for (const emaDt of [0.011, 0.017, 0.03, 0.04, 0.09]) for (const faltan of [0, 3]) for (const paseando of [false, true]) {
      const o = { emaDt, faltan, paseando }, b0 = baseAntes(o);
      expect(CargaPuro.base({ pol: esc, ...o })).toBe(b0);
      expect(CargaPuro.base(o)).toBe(b0);   // sin política: igual que antes
      expect(CargaPuro.base({ pol: mov, ...o })).toBe(Math.min(b0, 6));
      for (const pol of [esc, mov]) expect(CargaPuro.base({ pol, vr: true, ...o })).toBe(Math.min(b0, 3));   // en VR, el tope de VR
      expect(CargaPuro.base({ pol: esc, deuda: 2, ...o })).toBe(b0 - 2);
      expect(CargaPuro.base({ pol: esc, deuda: 50, ...o })).toBe(0);
      expect(CargaPuro.base({ pol: esc, deuda: -4, ...o })).toBe(b0);   // una deuda negativa no da presupuesto de más
    }
    expect(() => CargaPuro.base()).not.toThrow();
    expect(() => CargaPuro.base({ pol: null })).not.toThrow();
  });
});

describe("CargaPuro.parseTiles y prioridadRed", () => {
  it("teselas analizadas a la vez por política y VR; sin política, las 5 de la librería", () => {
    const esc = { tilesParse: 5, tilesParseVr: 3 }, q = { tilesParse: 3, tilesParseVr: 2 };
    expect([CargaPuro.parseTiles(esc, false), CargaPuro.parseTiles(q, false), CargaPuro.parseTiles(q, true), CargaPuro.parseTiles(null, false), CargaPuro.parseTiles({}, true)]).toEqual([5, 3, 2, 5, 5]);
    expect(CargaPuro.parseTiles({ tilesParse: 2.9 }, false)).toBe(2);
  });
  it("prioridad de red alta a lo cercano y a la vista, baja a lo que no se ve, auto en lo que no se sabe", () => {
    const tr = (inFrustum: boolean, distanceFromCamera: number) => ({ traversal: { inFrustum, distanceFromCamera } });
    expect(CargaPuro.prioridadRed(tr(true, 0))).toBe("high");
    expect(CargaPuro.prioridadRed(tr(true, CargaPuro.CERCA - 1))).toBe("high");
    expect(CargaPuro.prioridadRed(tr(true, CargaPuro.CERCA))).toBe("auto");
    expect(CargaPuro.prioridadRed(tr(false, 10))).toBe("low");   // fuera del encuadre, baja aunque esté cerca
    for (const t of [undefined, null, {}, { traversal: {} }]) expect(CargaPuro.prioridadRed(t)).toBe("auto");
  });
});

describe("Cola: presupuesto por fotograma", () => {
  it("ninguna rebanada se empieza si no cabe (salvo la inicial de cada fotograma) y el desborde nunca es mayor que antes", () => {
    for (const ms of [0.5, 2, 3, 6, 12]) for (const semilla of [1, 7, 42]) {
      const L = lote(semilla), a = simula(colaAntes, L, ms), n = simula(nueva, L, ms);
      const desA = Math.max(...a.gasto.map(g => g - ms)), desN = Math.max(...n.gasto.map(g => g - ms));
      expect(desN, `ms ${ms} semilla ${semilla}`).toBeLessThanOrEqual(desA + 1e-9);
      // el desborde de la nueva queda en menos de UNA rebanada (la inicial) o en lo que la media se queda corta
      const maxReb = Math.max(...L.flatMap(j => j.costes));
      expect(desN).toBeLessThanOrEqual(maxReb + 1e-9);
    }
    // rebanadas iguales: con la media aprendida, la nueva no se pasa NUNCA del presupuesto salvo con una sola rebanada (la que va siempre)
    const L = [{ clave: "C1", prio: 1, costes: Array(200).fill(1.5) as number[] }];
    const n = simula(nueva, L, 4), a = simula(colaAntes, L, 4);
    expect(n.gasto.slice(1).every(g => g <= 4 + 1e-9)).toBe(true);
    expect(a.gasto.some(g => g > 4)).toBe(true);   // la Cola de antes sí se pasaba (4,5 ms)
  });

  it("equivalencia con la de antes (mismo orden de rebanadas, mismos acabados y resultados) y lo cercano (menor prio) acaba antes", () => {
    for (const semilla of [1, 7, 42]) for (const ms of [0.5, 3, 12]) {
      const L = lote(semilla), a = simula(colaAntes, L, ms), n = simula(nueva, L, ms);
      expect(n.traza, `orden de rebanadas (semilla ${semilla}, ${ms} ms)`).toEqual(a.traza);
      expect(n.acabados).toEqual(a.acabados);
      const porPrio = L.slice().sort((x, y) => x.prio - y.prio || L.indexOf(x) - L.indexOf(y)).map(j => "hecho:" + j.clave);
      expect(n.acabados).toEqual(porPrio);   // con prioridades fijas, acaban por cercanía
      expect(n.fotogramas).toBeGreaterThanOrEqual(a.fotogramas);   // repartir sin pasarse no puede necesitar menos fotogramas
    }
  });

  it("add con una clave ya activa solo cambia la prioridad; cancela y hay; vacia termina lo pendiente", () => {
    const reloj = nuevoReloj(), C = colaCon(reloj), traza: string[] = [];
    expect(C.add("N1", 5, trabajo(reloj, "N1", [1, 1], traza))).toBe(true);
    expect(C.add("N1", 1, trabajo(reloj, "otro", [1], traza))).toBe(false);
    expect(C.hay("N1")).toBe(true);
    C.add("N2", 3, trabajo(reloj, "N2", [1], traza));
    C.cancela("N2"); expect(C.hay("N2")).toBe(false);
    C.vacia(1000);
    expect(traza).toEqual(["N1#0", "N1#1"]);
    expect(C.pendientes()).toBe(0);
  });
});

describe("Cola: deuda y est", () => {
  it("debe, cobra y deuda; corre salda la deuda; est por fuente para ?debug", () => {
    const reloj = nuevoReloj(), Cola = colaCon(reloj);
    expect(Cola.deuda()).toBe(0);
    Cola.debe(2.5, "T"); Cola.debe(-1, "T"); Cola.debe(NaN, "T");
    expect(Cola.deuda()).toBe(2.5); expect(Cola.est.T!.n).toBe(1);
    const f = Cola.cobra("T", function (x: number) { reloj.t += 4; return x * 2; });
    expect(f(21)).toBe(42); expect(Cola.deuda()).toBe(6.5); expect(Cola.est.T!.max).toBe(4);
    const g = Cola.cobra("T", () => { reloj.t += 1; throw new Error("x"); });
    expect(() => g()).toThrow(); expect(Cola.deuda()).toBe(7.5);   // lo que tardó se cobra aunque falle
    Cola.corre(3); expect(Cola.deuda()).toBe(0);   // corre salda la deuda (ya se descontó del presupuesto de este fotograma)
  });

  it("tot suma lo de todos los tipos (para la autopsia de fotogramas lentos de 30_mide)", () => {
    const reloj = nuevoReloj(), C = colaCon(reloj), traza: string[] = [];
    C.add("N1", 1, trabajo(reloj, "N1", [2, 3], traza)); C.add("B1", 2, trabajo(reloj, "B1", [1], traza));
    C.vacia(1000);
    expect(C.tot.n).toBe(3); expect(C.tot.ms).toBe(6);
    expect(Object.keys(C.est).sort()).toEqual(["B", "N"]);
  });
});

describe("Cola: dueño por prefijo (MUNDOS §6)", () => {
  it("duenoDe: lo anterior al primer «:»; sin «:» (o vacío) no hay dueño", () => {
    expect(duenoDe("exterior:N12")).toBe("exterior");
    expect(duenoDe("hituelo:B3:x")).toBe("hituelo");
    expect(duenoDe("N12")).toBeNull();
    expect(duenoDe(":N12")).toBeNull();
  });

  it("cancelaDe cancela los trabajos de un dueño y no toca los de los demás ni los que no tienen dueño", () => {
    const reloj = nuevoReloj(), C = colaCon(reloj), traza: string[] = [], acabados: unknown[] = [];
    const pon = (clave: string, prio: number) => C.add(clave, prio, trabajo(reloj, clave, [1, 1], traza), v => acabados.push(v));
    pon("exterior:N1", 1); pon("exterior:N2", 2); pon("interior:N1", 3); pon("sinDueno", 4);
    expect(C.pendientesDe("exterior")).toBe(2); expect(C.pendientesDe("interior")).toBe(1);
    C.corre(0.5);   // la rebanada inicial de exterior:N1 va siempre
    expect(C.cancelaDe("exterior")).toBe(2);
    expect(C.hay("exterior:N1")).toBe(false); expect(C.hay("exterior:N2")).toBe(false);
    expect(C.hay("interior:N1")).toBe(true); expect(C.hay("sinDueno")).toBe(true);
    expect(C.pendientesDe("exterior")).toBe(0); expect(C.pendientesDe("interior")).toBe(1);
    C.vacia(1000);
    expect(acabados).toEqual(["hecho:interior:N1", "hecho:sinDueno"]);   // lo cancelado no llama a su fin
    expect(traza.filter(t => t.startsWith("exterior:N2"))).toEqual([]);
    expect(C.cancelaDe("exterior")).toBe(0);
  });

  it("«exterior» no cancela a «exteriorX:…» (es un prefijo con «:», no una cadena que empieza igual) y una clave puede repetirse tras cancelarla", () => {
    const reloj = nuevoReloj(), C = colaCon(reloj), traza: string[] = [];
    C.add("exteriorX:N1", 1, trabajo(reloj, "a", [1], traza)); C.add("exterior:N1", 2, trabajo(reloj, "b", [1], traza));
    expect(C.cancelaDe("exterior")).toBe(1); expect(C.hay("exteriorX:N1")).toBe(true);
    expect(C.add("exterior:N1", 2, trabajo(reloj, "c", [1], traza))).toBe(true);
  });

  it("el tipo de trabajo (est) de una clave con dueño es el de lo que sigue al dueño; sin dueño, la 1.ª letra de siempre", () => {
    const reloj = nuevoReloj(), C = colaCon(reloj), traza: string[] = [];
    C.add("exterior:N1", 1, trabajo(reloj, "a", [1], traza)); C.add("N2", 2, trabajo(reloj, "b", [1], traza));
    C.vacia(1000);
    expect(Object.keys(C.est)).toEqual(["N"]); expect(C.est.N!.n).toBe(2);
  });
});

describe("ColaDeMundo (MU2-1, MUNDOS §6)", () => {
  it("pone las claves con el dueño delante y cancelaTodo() solo toca las suyas", () => {
    const reloj = nuevoReloj(), C = colaCon(reloj), traza: string[] = [];
    const mol = creaColaDeMundo(C, "molino"), bod = creaColaDeMundo(C, "bodega");
    expect(mol.pon("M1", 1, trabajo(reloj, "a", [1, 1], traza))).toBe(true);
    expect(mol.pon("M1", 0, trabajo(reloj, "a2", [1], traza))).toBe(false);   // la misma clave: solo cambia la prioridad
    bod.pon("M1", 2, trabajo(reloj, "b", [1, 1], traza));
    C.add("N1", 3, trabajo(reloj, "c", [1, 1], traza));
    expect(C.hay("molino:M1")).toBe(true); expect(mol.hay("M1")).toBe(true); expect(mol.pendientes()).toBe(1);
    expect(mol.cancelaTodo()).toBe(1);
    expect(mol.hay("M1")).toBe(false); expect(bod.hay("M1")).toBe(true); expect(C.hay("N1")).toBe(true);
    bod.cancela("M1"); expect(bod.pendientes()).toBe(0);
    C.vacia(1000);
    expect(traza).toEqual(["c#0", "c#1"]);
  });
  it("el dueño no puede ser vacío ni llevar «:»", () => {
    const C = colaCon(nuevoReloj());
    expect(() => creaColaDeMundo(C, "")).toThrow(); expect(() => creaColaDeMundo(C, "a:b")).toThrow();
    expect(creaColaDeMundo(C, "molino").dueno).toBe("molino");
  });
});

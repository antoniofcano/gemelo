// El registro de componentes y su ciclo de vida (ADR-0023; MU2-5). Las pruebas puras de ComponentesPuro vivían en pruebas/guardianes/componentes.test.js
// evaluando el trozo [puro] de apps/web/motor/02c_componentes.js; ahora prueban el módulo de verdad, y el registro con un Bus y un reloj de mentira.
// Lo que cruza con el legado (el Bus de 02c, los ficheros componente, el catálogo frente al código, la configuración frente a su esquema) se queda
// en el guardián de Node. Los datos de «mundo:entra» y «mundo:sale» son los ejemplos del contrato (contratos/eventos.json).
import { describe, expect, it } from "vitest";
import catalogo from "../../../../contratos/eventos.json";
import { ComponentesPuro as P, creaComponentes } from "./componentes.ts";
import type { BusComponentes, ContextoComponente, Manifiesto } from "./componentes.ts";
import { creaCola } from "./cola.ts";
import { creaWorldManager } from "./mundos.ts";
import type { AvisoMundo, IdMundo, MundoBase } from "./mundos.ts";

function manifiesto(def: Partial<Manifiesto> & Record<string, unknown> = {}): Manifiesto {
  return { id: "x", consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
    fases: {}, actualiza: {}, monta: () => ({}), libera: () => {}, ...def } as Manifiesto;
}

/** un Bus como el de 02c: on devuelve quita, emite cuenta oyentes; un oyente que falla no corta a los demás */
function bus(): BusComponentes & { vistos: [string, unknown][] } {
  const oy: Record<string, ((d?: unknown) => void)[]> = {}, vistos: [string, unknown][] = [];
  return {
    vistos,
    on(ev, fn) { (oy[ev] = oy[ev] || []).push(fn); return () => { oy[ev] = (oy[ev] || []).filter(f => f !== fn); }; },
    emite(ev, d) { vistos.push([ev, d]); const l = (oy[ev] || []).slice(); for (const f of l) { try { f(d); } catch { /* como el Bus */ } } return l.length; },
  };
}
function consola() {
  const errores: string[] = [];
  return { errores, error: (...a: unknown[]) => { errores.push(a.map(String).join(" ")); }, warn: (...a: unknown[]) => { errores.push(a.map(String).join(" ")); } };
}
function registro(o: { busqueda?: string; config?: unknown; reparto?: { on: boolean; reg(n: string): number; pasa(i: number, q: number): number } } = {}) {
  const b = bus(), c = consola(), reloj = { n: 0 };
  const documento = { getElementById: (id: string) => (id === "config" && o.config ? { textContent: JSON.stringify(o.config) } : null) };
  const C = creaComponentes({ bus: b, reparto: o.reparto || null, ahora: () => { reloj.n++; return 0; }, busqueda: () => o.busqueda || "", documento, consola: c });
  return { C, bus: b, errores: c.errores, reloj };
}
const ejemplo = (ev: "mundo:entra" | "mundo:sale"): AvisoMundo => (catalogo.eventos[ev] as unknown as { ejemplo: AvisoMundo }).ejemplo;

describe("ComponentesPuro", () => {
  it("el manifiesto: lo que vale y lo que no (presupuesto y libera obligatorios, fases conocidas con su función)", () => {
    expect(P.valida(manifiesto())).toEqual([]);
    expect(P.valida(manifiesto({ fases: { tarde: 0.5, mundo: 0 }, actualiza: { tarde() {}, mundo() {} }, cultivo: "olivar", version: 2, bandera: { defecto: false, url: "cosa2" } }))).toEqual([]);
    const mal: Record<string, Record<string, unknown>> = {
      "sin libera": { libera: undefined }, "sin presupuesto": { presupuesto: undefined }, "presupuesto negativo": { presupuesto: { llamadas: -1, triangulos: 0 } },
      "fase desconocida": { fases: { luego: 1 }, actualiza: { luego() {} } }, "fase sin función": { fases: { tarde: 1 } }, "función sin fase": { actualiza: { mundo() {} } },
      "id con mayúsculas": { id: "Fichas" }, "bandera sin defecto": { bandera: {} }, "url rara": { bandera: { defecto: true, url: "a-b" } }, "consume no es lista": { consume: "TiempoVivo" },
      "sin monta": { monta: undefined }, "eventos mal": { eventos: { escucha: "x" } },
    };
    for (const [k, v] of Object.entries(mal)) expect(P.valida(manifiesto(v)), "debería fallar: " + k).not.toEqual([]);
    expect(P.valida(null)).toEqual(["el manifiesto no es un objeto"]);
  });

  it("mundos (MU2-5): una lista sin repetir de los mundos de IdMundo; sin el campo, el exterior", () => {
    expect(P.MUNDOS).toEqual(["exterior", "molino", "bodega", "vacio"]);
    expect(P.valida(manifiesto({ mundos: ["molino"] }))).toEqual([]);
    expect(P.valida(manifiesto({ mundos: ["exterior", "bodega", "vacio"] }))).toEqual([]);
    for (const m of [[], ["luna"], ["molino", "molino"], "molino", [3]]) expect(P.valida(manifiesto({ mundos: m as IdMundo[] })).filter(e => /^mundos/.test(e)), JSON.stringify(m)).toHaveLength(1);
    expect(P.mundosDe(manifiesto())).toEqual(["exterior"]);
    expect(P.mundosDe(manifiesto({ mundos: ["molino", "bodega"] }))).toEqual(["molino", "bodega"]);
    expect(P.deMundo(manifiesto(), "exterior")).toBe(true);
    expect(P.deMundo(manifiesto(), "molino")).toBe(false);
    expect(P.deMundo(manifiesto({ mundos: ["molino"] }), "molino")).toBe(true);
    expect(P.deMundo(manifiesto(), null)).toBe(false);   // sin mundo activo (a oscuras), nadie
  });

  it("mundos: \"todos\" (A3-6a): un componente de todo mundo vive en cada uno de MUNDOS, también en los que se añadan; nada más vale como palabra", () => {
    expect(P.TODOS).toBe("todos");
    expect(P.valida(manifiesto({ mundos: "todos" }))).toEqual([]);
    for (const m of ["todo", "Todos", "exterior", ["todos"]]) expect(P.valida(manifiesto({ mundos: m as IdMundo[] })).filter(e => /^mundos/.test(e)), JSON.stringify(m)).toHaveLength(1);
    expect(P.mundosDe(manifiesto({ mundos: "todos" }))).toEqual(P.MUNDOS);
    for (const id of P.MUNDOS) expect(P.deMundo(manifiesto({ mundos: "todos" }), id), id).toBe(true);
    expect(P.deMundo(manifiesto({ mundos: "todos" }), null)).toBe(false);   // a oscuras, entre dos mundos, tampoco corre (como todos)
    expect(P.deTodos(manifiesto({ mundos: "todos" }))).toBe(true);
    expect(P.deTodos(manifiesto({ mundos: [...P.MUNDOS] }))).toBe(false);   // la lista entera no es lo mismo: no hereda un mundo nuevo
    expect(P.deTodos(manifiesto())).toBe(false);
  });

  it("el orden de montaje: quien consume lo que otro expone va después; los ciclos se detectan", () => {
    const a = manifiesto({ id: "a", expone: ["A"] }), b = manifiesto({ id: "b", consume: ["A"], expone: ["B"] }), c = manifiesto({ id: "c", consume: ["B", "TiempoVivo"] });
    const o = P.orden([c, b, a]);
    expect(o.orden).toEqual(["a", "b", "c"]); expect(o.ciclos).toEqual([]);
    expect(o.depende).toEqual({ a: [], b: ["a"], c: ["b"] });
    const x = manifiesto({ id: "x", consume: ["Y"], expone: ["X"] }), y = manifiesto({ id: "y", consume: ["X"], expone: ["Y"] });
    expect(P.orden([x, y]).ciclos.length).toBeGreaterThan(0);
  });

  it("encendido: URL > servidor > defecto del manifiesto", () => {
    const d = manifiesto({ id: "fichas-tiempo", bandera: { defecto: true, url: "fichas" } });
    expect(P.encendido(d, "", null)).toEqual({ activo: true, origen: "defecto" });
    expect(P.encendido(d, "?a=1", { "fichas-tiempo": { activo: false } })).toEqual({ activo: false, origen: "servidor" });
    expect(P.encendido(d, "?debug&fichas=1", { "fichas-tiempo": { activo: false } })).toEqual({ activo: true, origen: "url" });
    expect(P.encendido(d, "?fichas=0", null)).toEqual({ activo: false, origen: "url" });
    for (const [q, v] of [["?fichas", true], ["?fichas=no", false], ["?fichas=sí", true], ["?x=1&fichas=off#a", false], ["?fichasx=0", undefined], ["?fichas=quizá", undefined]] as const) expect(P.valorUrl(q, "fichas"), q).toBe(v);
    expect(P.encendido(manifiesto({ bandera: { defecto: false } }), "?x=1", {})).toEqual({ activo: false, origen: "defecto" });
    // EV2: bandera con valor (?ui=capas): enciende si el parámetro lo nombra, apaga con 0/no/off; con otra cosa mandan el servidor o el defecto
    const c = manifiesto({ id: "fichas-mundo", bandera: { defecto: false, url: "ui", valor: "capas" } });
    for (const [q, v] of [["?ui=capas", true], ["?ui=otra,capas", true], ["?ui=CAPAS", true], ["?ui=0", false], ["?ui=off", false], ["?ui", undefined], ["?ui=1", undefined], ["?ui=capasx", undefined], ["", undefined]] as const) expect(P.valorUrl(q, "ui", "capas"), q).toBe(v);
    expect(P.encendido(c, "?ui=capas", null)).toEqual({ activo: true, origen: "url" });
    expect(P.encendido(c, "?ui=otra", { "fichas-mundo": { activo: true } })).toEqual({ activo: true, origen: "servidor" });
    expect(P.encendido(c, "", null)).toEqual({ activo: false, origen: "defecto" });
    expect(P.valida(manifiesto({ bandera: { defecto: false, valor: "capas" } })).filter(e => /valor/.test(e))).toHaveLength(1);
    expect(P.valida(manifiesto({ bandera: { defecto: false, url: "ui", valor: "Capas!" } })).filter(e => /valor/.test(e))).toHaveLength(1);
    expect(P.valorUrl("?a=1", undefined)).toBeUndefined();
  });

  it("validaConfig y toca", () => {
    expect(P.validaConfig({ a: { activo: true, parametros: { n: 1 } } })).toEqual([]);
    expect(P.validaConfig([])).toHaveLength(1);
    expect(P.validaConfig({ A: { activo: true } })).toHaveLength(1);
    expect(P.validaConfig({ a: { activo: true, otro: 1 } })).toHaveLength(1);
    const est = { acum: 0 };
    expect(P.toca(est, 0.5, 0.2)).toBe(-1); expect(P.toca(est, 0.5, 0.2)).toBe(-1);
    expect(P.toca(est, 0.5, 0.2)).toBeCloseTo(0.6); expect(est.acum).toBe(0);
  });
});

describe("creaComponentes: el ciclo de vida (el mismo de 02c_componentes.js)", () => {
  it("arranca monta en orden, las fases llaman a los encendidos («tarde» a su ritmo), libera suelta lo enganchado y los dependientes primero", () => {
    const { C, bus: B } = registro(), log: string[] = [];
    const mk = (id: string, extra: Partial<Manifiesto>) => manifiesto({ id, monta: (n: ContextoComponente) => { log.push("monta " + id); n.on("prueba:x", () => log.push("oye " + id)); n.limpia(() => log.push("limpia " + id)); return { id }; },
      libera: (api: unknown) => { log.push("libera " + (api as { id: string }).id); }, ...extra });
    expect(C.registra(mk("b", { consume: ["A"], fases: { mundo: 0 }, actualiza: { mundo: (_dt, _t, api) => { log.push("mundo " + (api as { id: string }).id); } } }))).toBe(true);
    expect(C.registra(mk("a", { expone: ["A"], fases: { tarde: 0.5 }, actualiza: { tarde: dt => { log.push("tarde " + dt.toFixed(1)); } } }))).toBe(true);
    expect(C.registra(mk("a", {}))).toBe(false);
    expect(C.registra({ id: "roto" } as unknown as Manifiesto)).toBe(false);
    expect(C.resumen().map(r => [r.id, r.motivo])).toEqual([["b", "sin arrancar"], ["a", "sin arrancar"]]);
    C.arranca();
    expect(log.splice(0)).toEqual(["monta a", "monta b"]);
    for (let i = 0; i < 10; i++) { C.actualiza("mundo", 0.1, i); C.actualiza("tarde", 0.1, i); }
    expect(log.filter(x => x === "mundo b")).toHaveLength(10);
    const tardes = log.filter(x => x.startsWith("tarde"));
    expect(tardes.length).toBeGreaterThanOrEqual(1); expect(tardes.length).toBeLessThanOrEqual(2);
    log.length = 0; B.emite("prueba:x"); expect(log.splice(0).sort()).toEqual(["oye a", "oye b"]);
    expect(C.libera("a")).toBe(true);
    expect(log.splice(0)).toEqual(["libera b", "limpia b", "libera a", "limpia a"]);
    B.emite("prueba:x"); expect(log).toEqual([]);
    expect(C.api("a")).toBeNull(); expect(C.activo("b")).toBe(false);
    expect(C.enciende("b", true)).toBe(false); expect(C.resumen().find(r => r.id === "b")?.motivo).toMatch(/falta a/);
    expect(C.enciende("a", true) && C.enciende("b", true)).toBe(true);
    expect(C.enciende("nadie", true)).toBe(false);
    expect(B.vistos.filter(([e]) => e === "componentes:cambia").map(([, d]) => d)).toEqual([
      { id: "a", activo: true }, { id: "b", activo: true }, { id: "b", activo: false }, { id: "a", activo: false }, { id: "a", activo: true }, { id: "b", activo: true }]);
  });

  it("un componente que falla en su fase se apaga solo (y lo dice); uno que falla al montar no queda a medias", () => {
    const { C, errores } = registro(), log: string[] = [];
    C.registra(manifiesto({ id: "malo", fases: { mundo: 0 }, actualiza: { mundo() { throw new Error("ay"); } }, monta: (n: ContextoComponente) => { n.limpia(() => log.push("limpia malo")); return {}; } }));
    C.registra(manifiesto({ id: "bueno", fases: { mundo: 0 }, actualiza: { mundo() { log.push("bueno"); } } }));
    C.registra(manifiesto({ id: "rompe", monta: (n: ContextoComponente) => { n.limpia(() => log.push("limpia rompe")); throw new Error("no monto"); } }));
    C.arranca();
    expect(log.splice(0)).toEqual(["limpia rompe"]); expect(C.activo("rompe")).toBe(false);
    expect(C.resumen().find(r => r.id === "rompe")?.motivo).toBe("error al montar: no monto");
    C.actualiza("mundo", 0.016, 0); C.actualiza("mundo", 0.016, 1);
    expect(C.activo("malo")).toBe(false); expect(log).toEqual(["limpia malo", "bueno", "bueno"]);
    expect(C.resumen().find(r => r.id === "malo")?.motivo).toMatch(/error en «mundo»: ay/);
    expect(errores.length).toBeGreaterThanOrEqual(2);
  });

  it("?bandera manda; la configuración de la página o del servidor enciende y apaga en caliente; un componente tardío se monta al registrarse", () => {
    const def = (id: string, url: string, defecto: boolean) => manifiesto({ id, bandera: { defecto, url } });
    const r = registro({ busqueda: "?uno=0", config: { v: 1, componentes: { dos: { activo: true, parametros: { k: 7 } }, uno: { activo: true } } } });
    let param: unknown = null;
    r.C.registra(def("uno", "uno", true)); r.C.registra({ ...def("dos", "dos", false), monta: (n: ContextoComponente) => { param = n.parametros.k; return {}; } });
    r.C.arranca(); r.C.arranca();   // dos veces, una
    expect(r.C.resumen().map(x => [x.id, x.activo, x.origen])).toEqual([["uno", false, "url"], ["dos", true, "servidor"]]);
    expect(param).toBe(7);
    expect(r.C.configura({ dos: { activo: false } })).toBe(true); expect(r.C.activo("dos")).toBe(false);
    expect(r.C.resumen().find(x => x.id === "dos")?.motivo).toBe("apagado (servidor)");
    expect(r.C.configura({ dos: { activo: "no" } })).toBe(false); expect(r.errores.some(e => /configuración no válida/.test(e))).toBe(true);
    r.C.registra(def("tres", "tres", true)); expect(r.C.activo("tres")).toBe(true);
    const vacio = registro(); vacio.C.arranca(); expect(vacio.C.resumen()).toEqual([]);
  });

  it("el reparto del JS (Q0h): sin medir no lee el reloj; midiendo, una lectura por componente y fase, en su bloque «c:<id>»", () => {
    const pasos: [number, number][] = [], R = { on: false, reg: (n: string) => (n === "c:a" ? 7 : -1), pasa: (i: number, q: number) => { pasos.push([i, q]); return 0; } };
    const { C, reloj } = registro({ reparto: R });
    C.registra(manifiesto({ id: "a", fases: { mundo: 0 }, actualiza: { mundo() {} } }));
    C.arranca();
    C.actualiza("mundo", 0.016, 0); expect(reloj.n).toBe(0); expect(pasos).toEqual([]);
    R.on = true; C.actualiza("mundo", 0.016, 1); C.actualiza("mundo", 0.016, 2);
    expect(reloj.n).toBe(2); expect(pasos).toEqual([[7, 0], [7, 0]]);
  });
});

describe("creaComponentes: el filtro por mundo (MU2-5)", () => {
  function tres() {
    const r = registro(), log: string[] = [];
    const mk = (id: string, mundos?: IdMundo[]) => manifiesto({ id, fases: { mundo: 0, pausa: 0 }, actualiza: { mundo: () => { log.push(id); }, pausa: () => { log.push("pausa " + id); } },
      monta: () => { log.push("monta " + id); return {}; }, libera: () => { log.push("libera " + id); }, ...(mundos ? { mundos } : {}) });
    r.C.registra(mk("fuera")); r.C.registra(mk("dentro", ["molino"])); r.C.registra(mk("ambos", ["exterior", "molino"]));
    return { ...r, log };
  }

  it("«todos» (A3-6a): corre en el exterior, en el molino y en el vacío; a oscuras no; y no se libera mientras quede un mundo vivo", () => {
    const r = registro(), log: string[] = [];
    r.C.registra(manifiesto({ id: "gente", mundos: "todos", fases: { mundo: 0 }, actualiza: { mundo: () => { log.push("gente"); } },
      monta: () => { log.push("monta gente"); return {}; }, libera: () => { log.push("libera gente"); } }));
    r.C.registra(manifiesto({ id: "olivar", fases: { mundo: 0 }, actualiza: { mundo: () => { log.push("olivar"); } }, monta: () => ({}), libera: () => { log.push("libera olivar"); } }));
    r.C.arranca();
    expect(log.splice(0)).toEqual(["monta gente"]);
    r.C.actualiza("mundo", 0.016, 0);
    expect(log.splice(0)).toEqual(["gente", "olivar"]);
    for (const [desde, hacia] of [["exterior", "molino"], ["molino", "vacio"]] as const) {
      r.bus.emite("mundo:sale", { id: desde, desde, hacia });
      r.C.actualiza("mundo", 0.016, 0);
      expect(log.splice(0), "a oscuras").toEqual([]);
      r.bus.emite("mundo:entra", { id: hacia, desde, hacia });
      r.C.actualiza("mundo", 0.016, 0);
      expect(log.splice(0), "en " + hacia).toEqual(["gente"]);
    }
    expect(r.C.liberaMundo("exterior")).toBe(1);   // se va el exterior: el olivar, que es solo suyo; la gente sigue (el vacío está vivo)
    expect(log.splice(0)).toEqual(["libera olivar"]);
    expect(r.C.activo("gente")).toBe(true);
    r.C.liberaMundo("molino"); expect(r.C.activo("gente")).toBe(true);
    expect(r.C.liberaMundo("vacio")).toBe(1);   // el último mundo vivo: ahora sí
    expect(log.splice(0)).toEqual(["libera gente"]);
  });

  it("sin «mundos», del exterior: hoy todo corre como antes y nada cambia sin eventos", () => {
    const { C, log } = tres();
    C.arranca();
    expect(log.splice(0)).toEqual(["monta fuera", "monta ambos"]);
    expect(C.mundo()).toBe("exterior");
    C.actualiza("mundo", 0.016, 0); C.actualiza("pausa", 0.016, 0);
    expect(log).toEqual(["fuera", "ambos", "pausa fuera", "pausa ambos"]);
    expect(C.resumen().find(r => r.id === "dentro")).toMatchObject({ activo: false, motivo: "fuera de su mundo (molino)", mundos: ["molino"] });
  });

  it("«mundo:sale» deja a oscuras (ninguna fase); «mundo:entra» activa el mundo y monta lo suyo si no estaba cargado; el que sale queda congelado", () => {
    const { C, bus: B, log } = tres();
    C.arranca(); log.length = 0;
    expect(ejemplo("mundo:sale")).toEqual({ id: "exterior", desde: "exterior", hacia: "molino" });
    B.emite("mundo:sale", ejemplo("mundo:sale"));
    expect(C.mundo()).toBeNull();
    for (const f of ["mundo", "pausa"] as const) C.actualiza(f, 0.016, 0);
    expect(log).toEqual([]);
    B.emite("mundo:entra", ejemplo("mundo:entra"));
    expect(C.mundo()).toBe("molino");
    expect(log.splice(0)).toEqual(["monta dentro"]);
    C.actualiza("mundo", 0.016, 1);
    expect(log.splice(0)).toEqual(["dentro", "ambos"]);
    expect(C.activo("fuera")).toBe(true);   // congelado: sigue montado
    // vuelta al exterior: ya estaba vivo, no se monta nada otra vez
    B.emite("mundo:sale", { id: "molino", desde: "molino", hacia: "exterior" }); B.emite("mundo:entra", { id: "exterior", desde: "molino", hacia: "exterior" });
    expect(log.splice(0)).toEqual([]);
    C.actualiza("mundo", 0.016, 2);
    expect(log).toEqual(["fuera", "ambos"]);
  });

  it("«mundo:sale» de un mundo que no es el activo, o con datos raros, no cambia nada", () => {
    const { C, bus: B } = tres();
    C.arranca();
    B.emite("mundo:sale", { id: "molino", desde: "molino", hacia: "exterior" }); expect(C.mundo()).toBe("exterior");
    B.emite("mundo:entra", { id: "luna" }); B.emite("mundo:entra"); B.emite("mundo:sale", null); expect(C.mundo()).toBe("exterior");
  });

  it("liberaMundo: se liberan los que se quedan sin ningún mundo vivo (los de los dos, no); al volver a entrar, se montan otra vez", () => {
    const { C, bus: B, log } = tres();
    C.arranca();
    B.emite("mundo:sale", ejemplo("mundo:sale")); B.emite("mundo:entra", ejemplo("mundo:entra"));
    log.length = 0;
    expect(C.liberaMundo("exterior")).toBe(1);
    expect(log.splice(0)).toEqual(["libera fuera"]);
    expect(C.resumen().find(r => r.id === "fuera")?.motivo).toBe("su mundo se liberó (exterior)");
    expect(C.liberaMundo("exterior")).toBe(0);   // ya no estaba vivo
    C.actualiza("mundo", 0.016, 0); expect(log.splice(0)).toEqual(["dentro", "ambos"]);
    B.emite("mundo:sale", { id: "molino", desde: "molino", hacia: "exterior" }); B.emite("mundo:entra", { id: "exterior", desde: "molino", hacia: "exterior" });
    expect(log.splice(0)).toEqual(["monta fuera"]);   // el exterior vuelve a estar vivo: lo suyo se monta otra vez
    C.actualiza("mundo", 0.016, 1); expect(log).toEqual(["fuera", "ambos"]);
  });

  it("al liberar un mundo, quien consume de un componente liberado se libera antes (como libera)", () => {
    const r = registro(), log: string[] = [];
    r.C.registra(manifiesto({ id: "base", expone: ["Base"], mundos: ["molino"], libera: () => { log.push("libera base"); } }));
    r.C.registra(manifiesto({ id: "usa", consume: ["Base"], mundos: ["exterior", "molino"], libera: () => { log.push("libera usa"); } }));
    r.C.arranca();
    expect(r.C.activo("base")).toBe(false); expect(r.C.resumen().find(x => x.id === "usa")?.motivo).toBe("falta base");
    r.bus.emite("mundo:sale", ejemplo("mundo:sale")); r.bus.emite("mundo:entra", ejemplo("mundo:entra"));
    expect(r.C.activo("base") && r.C.activo("usa")).toBe(true);
    r.C.liberaMundo("molino");
    expect(log).toEqual(["libera usa", "libera base"]);
    expect(r.C.resumen().find(x => x.id === "usa")?.motivo).toBe("sin base");
  });

  it("con el gestor de mundos de verdad (nucleo/mundos.ts): su avisa al Bus mueve el filtro; en una vuelta atrás, el de antes vuelve a ser el activo", async () => {
    const { C, bus: B, log } = tres();
    C.arranca(); log.length = 0;
    const falso = (id: IdMundo, falla = false): MundoBase => ({
      id, async carga() { if (falla) throw new Error("no carga"); }, entra() {}, actualiza() {}, sale: () => ({ x: 0, y: 0, ang: 0 }), congela() {}, libera() {},
      suelo: () => 0, dentro: () => true, obstaculo: () => null,
    });
    const W = creaWorldManager({ fundido: { cierra: async () => {}, abre: async () => {} }, cola: creaCola({ ahora: () => 0 }), temporizador: () => () => {},
      avisa: (ev, d) => { B.emite(ev, d); } });
    W.registra(async () => falso("exterior"), "exterior"); W.registra(async () => falso("molino"), "molino"); W.registra(async () => falso("bodega", true), "bodega");
    expect((await W.arranca("exterior")).ok).toBe(true);
    expect(C.mundo()).toBe("exterior");
    expect((await W.cambia("molino")).ok).toBe(true);
    expect(C.mundo()).toBe("molino"); expect(log.splice(0)).toEqual(["monta dentro"]);
    const r = await W.cambia("bodega");   // la carga falla: se vuelve al molino
    expect(r.ok).toBe(false); expect(r.motivo).toBe("fallo_carga");
    expect(C.mundo()).toBe("molino");
    expect(B.vistos.filter(([e]) => /^mundo:/.test(e))).toEqual([
      ["mundo:entra", { id: "exterior", desde: null, hacia: "exterior" }],
      ["mundo:sale", { id: "exterior", desde: "exterior", hacia: "molino" }], ["mundo:entra", { id: "molino", desde: "exterior", hacia: "molino" }],
      ["mundo:sale", { id: "molino", desde: "molino", hacia: "bodega" }], ["mundo:entra", { id: "molino", desde: "bodega", hacia: "molino" }]]);
    C.actualiza("mundo", 0.016, 0);
    expect(log).toEqual(["dentro", "ambos"]);
  });
});

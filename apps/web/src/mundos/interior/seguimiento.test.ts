// La visita guiada compartida, con dobles: el seguimiento de la familia (la oferta en pantalla y en VR, «Ir» a tu puesto con el fundido o al mundo de la
// visita con la parada pendiente, «Seguir al guía», el guía sin ofertas, el fin de la guiada) y las máquinas bajo el guía (la marcha del grupo, reducir
// movimiento, «Parar para mí», el interruptor del guía que pide a la api). Lo que se ve de verdad y entre tres Chrome, en el banco (ver el informe).
import { afterEach, describe, expect, it } from "vitest";
import type { Maquina } from "../../datos/contratos/mundo-interior.ts";
import { creaMundo } from "../../nucleo/prueba-dom.ts";
import type { Pose2 } from "../../nucleo/mundos.ts";
import { creaMaquinas } from "./maquinas.ts";
import { creaSeguimiento, manifiestoSeguimiento } from "./seguimiento.ts";
import type { InteriorGuiado } from "./seguimiento.ts";

let limpia: (() => void) | null = null;
afterEach(() => { if (limpia) limpia(); limpia = null; });

function banco(o: { actual?: string; vr?: boolean; papel?: string; evento?: number | null } = {}) {
  const M = creaMundo(); limpia = M.limpia;
  M.documento.body.appendChild(M.el("section", "ficha"));
  const st = { actual: o.actual || "fabrica", vr: !!o.vr, estadoG: { evento: o.evento === undefined ? 5 : o.evento, papel: o.papel || "familia", yo: "fam-1" } as Record<string, unknown> };
  const oy: Record<string, (d?: unknown) => void> = {}, emitidos: Array<[string, unknown]> = [], cambios: string[] = [], fundidos: number[] = [], apariciones: Pose2[] = [], vaA: number[] = [], alGuiada: unknown[] = [];
  const laminas: Record<string, any> = {};
  const interior: InteriorGuiado = {
    titulos: () => ["La llegada", "La prensa", "La salida"],
    puesto: (k, id) => ({ x: k, y: id.length, ang: 0.5 }),
    vaA: k => { vaA.push(k); return true; },
    alGuiada: v => { alGuiada.push(v); },
  };
  const s = creaSeguimiento({
    actual: () => st.actual, interior: id => (id === "fabrica" ? interior : null),
    cambia: a => { cambios.push(a); return Promise.resolve({ ok: true, mundo: a } as any); },
    Llegada: { funde: fn => { fundidos.push(1); fn(); return true; }, aparece: (x, y, ang) => { apariciones.push({ x, y, ang: ang! }); } },
    pose: { pon() {} }, vr: () => st.vr, documento: M.documento, aviso() {},
    Laminas: { abre: (l: any) => { laminas[l.id] = l; }, cierra: id => { const h = !!laminas[id]; delete laminas[id]; return h; }, hay: id => !!laminas[id], repinta: () => true },
  });
  const ctx: any = { id: "visita-compartida", parametros: {}, limpia: (f: unknown) => f,
    on: (ev: string, fn: (d?: unknown) => void) => { oy[ev] = fn; return () => { delete oy[ev]; }; },
    emite: (ev: string, d?: unknown) => { emitidos.push([ev, d]); return ev === "guiada:pide" ? 1 : 0; },
    api: (id: string) => (id === "visita-guiada" ? { estado: () => st.estadoG } : null) };
  const m = manifiestoSeguimiento(s); m.monta(ctx);
  const caja = () => M.documento.getElementById("guiadaSigue");
  const boton = (t: string) => (caja() ? caja().querySelectorAll("button").find((b: any) => b.textContent === t) : undefined);
  const visita = (v: Record<string, unknown>) => oy["guiada:visita"]!({ mundo: "fabrica", parada: null, maquinas: null, soyGuia: false, ...v });
  return { M, s, m, st, oy, emitidos, cambios, fundidos, apariciones, vaA, alGuiada, laminas, caja, boton, visita };
}

describe("el seguimiento de la familia (visita-compartida)", () => {
  it("el manifiesto: de todos los mundos, escucha guiada:visita y mundo:entra, emite guiada:pide", () => {
    const b = banco();
    expect(b.m).toMatchObject({ id: "visita-compartida", mundos: "todos", eventos: { escucha: ["guiada:visita", "mundo:entra"], emite: ["guiada:pide"] } });
  });
  it("en pantalla: «El guía va a la parada 2 · La prensa» con Ir y Me quedo; Ir funde y te deja en tu puesto con la ficha abierta", () => {
    const b = banco();
    b.visita({ parada: 1, n: 2 });
    expect(b.caja().textContent).toContain("El guía va a la parada 2 · La prensa");
    expect(b.boton("Me quedo")).toBeTruthy();
    expect(b.boton("Seguir al guía").getAttribute("aria-pressed")).toBe("false");   // apagado por defecto
    expect(b.alGuiada).toHaveLength(1);
    b.boton("Ir").click();
    expect(b.fundidos).toHaveLength(1); expect(b.apariciones).toEqual([{ x: 1, y: 5, ang: 0.5 }]); expect(b.vaA).toEqual([1]);
    expect(b.boton("Ir")).toBeUndefined();   // la oferta se cierra
  });
  it("Me quedo: nada se mueve; el mismo evento otra vez o solo las máquinas no vuelven a ofrecer", () => {
    const b = banco();
    b.visita({ parada: 1, n: 2 }); b.boton("Me quedo").click();
    expect(b.vaA).toEqual([]); expect(b.boton("Ir")).toBeUndefined();
    b.visita({ parada: 1, n: 2 }); b.visita({ parada: 1, n: 3, maquinas: { marcha: true, desde: 1 } });
    expect(b.boton("Ir")).toBeUndefined();
    b.visita({ parada: 2, n: 4 }); expect(b.boton("Ir")).toBeTruthy();
  });
  it("la visita en otro mundo: «La visita está en la fábrica»; Ir cambia de mundo y al entrar se pide la parada una vez", async () => {
    const b = banco({ actual: "exterior" });
    b.visita({ parada: 2, n: 7 });
    expect(b.caja().textContent).toContain("La visita está en la fábrica");
    b.boton("Ir").click();
    expect(b.cambios).toEqual(["fabrica"]);
    expect(b.s.pendiente("patios")).toBeNull();
    expect(b.s.pendiente("fabrica")).toBe(2); expect(b.s.pendiente("fabrica")).toBeNull();
    b.st.actual = "fabrica"; b.oy["mundo:entra"]!({ id: "fabrica", desde: "exterior", hacia: "fabrica" });
    expect(b.boton("Ir")).toBeUndefined();   // ya está en su puesto: no se le ofrece otra vez
  });
  it("quien cruza por su cuenta recibe dónde está la visita; el guía no recibe ofertas", () => {
    const b = banco({ actual: "exterior" });
    b.visita({ parada: 1, n: 3 }); b.boton("Me quedo").click();
    b.st.actual = "fabrica"; b.oy["mundo:entra"]!({ id: "fabrica", desde: "exterior", hacia: "fabrica" });
    expect(b.caja().textContent).toContain("parada 2");
    const g = banco({ papel: "guia" });
    g.visita({ parada: 1, n: 2, soyGuia: true });
    expect(g.caja()).toBeNull(); expect(g.s.soyGuia()).toBe(true);
    expect(g.s.pide({ parada: 1 })).toBe(true);
    expect(g.emitidos).toContainEqual(["guiada:pide", { parada: 1 }]);
  });
  it("«Seguir al guía» en pantalla va solo; en VR nunca: una lámina que solo se toca con el gatillo sobre Ir o Me quedo", () => {
    const b = banco();
    b.visita({ parada: 0, n: 1 }); b.boton("Me quedo").click();
    b.boton("Seguir al guía").click();
    expect(b.boton("Siguiendo al guía").getAttribute("aria-pressed")).toBe("true");
    b.visita({ parada: 2, n: 2 });
    expect(b.vaA).toEqual([2]);
    b.st.vr = true; b.visita({ parada: 1, n: 3 });
    expect(b.vaA).toEqual([2]);   // en VR, aunque siga al guía, no se mueve sin su gesto
    expect(b.caja()).toBeNull();
    const l = b.laminas["guiada-oferta"]; expect(l).toBeTruthy();
    expect(l.alTocar(0.3, 0.2)).toBe(false);   // arriba: no es un botón
    expect(l.alTocar(0.3, 0.8)).toBe(true);
    expect(b.vaA).toEqual([2, 1]); expect(b.laminas["guiada-oferta"]).toBeUndefined();
    b.visita({ parada: 0, n: 4 }); b.laminas["guiada-oferta"].alTocar(0.8, 0.8);
    expect(b.vaA).toEqual([2, 1]); expect(b.laminas["guiada-oferta"]).toBeUndefined();
  });
  it("al terminar la guiada: fuera la oferta y el recuadro, y el interior vuelve a lo suyo (alGuiada(null))", () => {
    const b = banco();
    b.visita({ parada: 1, n: 2 }); b.m.actualiza!.tarde!(0.5, 0, null as never);
    expect(b.caja()).not.toBeNull();
    b.st.estadoG = { evento: null, papel: "" };
    b.m.actualiza!.tarde!(0.5, 0, null as never);
    expect(b.caja()).toBeNull(); expect(b.alGuiada[b.alGuiada.length - 1]).toBeNull(); expect(b.s.estado()).toBeNull();
  });
  it("lo que no se entiende se descarta; libera quita el recuadro", () => {
    const b = banco();
    b.oy["guiada:visita"]!({ mundo: "luna", n: 1 }); b.oy["guiada:visita"]!(null);
    expect(b.s.estadoSeguimiento()).toMatchObject({ descartados: 2, eventos: 0 });
    b.visita({ parada: 1, n: 2 }); b.m.libera(null);
    expect(b.caja()).toBeNull();
  });
});

describe("las máquinas en una visita guiada", () => {
  const giro: Maquina = { id: "rueda", nodo: "rueda", tipo: "giro", eje: [0, 1, 0], velocidad: 6, luz: "propia", fuente: "ilustrativo" } as Maquina;
  function maq(o: { guia?: boolean; reducido?: boolean; ahora?: number } = {}) {
    const M = creaMundo(); limpia = M.limpia;
    const nodo = { quaternion: { x: 0, y: 0, z: 0, w: 1, set() {} }, position: { x: 0, y: 0, z: 0, set() {} }, traverse() {} };
    const m = creaMaquinas({ maquinas: [giro], raiz: { getObjectByName: () => nodo } });
    const pedidas: unknown[] = [], avisos: string[] = [];
    const guiada = { enGuiada: () => true, soyGuia: () => !!o.guia, estado: () => null, pendiente: () => null, identidad: () => "x", pide: (c: unknown) => { pedidas.push(c); return true; } };
    m.monta({ documento: M.documento, reducido: () => !!o.reducido, guiada, aviso: s => { avisos.push(s); }, reloj: () => o.ahora || 0 });
    const b = () => M.documento.getElementById("maquinasInterior").querySelector("button");
    return { m, b, pedidas, avisos };
  }
  const v = (marcha: boolean, desde = 1000) => ({ mundo: "fabrica" as const, parada: null, maquinas: { marcha, desde }, n: 1, soyGuia: false });
  it("la familia: la marcha del grupo y solo «Parar para mí»; con el grupo parado, el botón no hace nada", () => {
    const x = maq();
    x.m.alGuiada(v(false));
    expect(x.m.enMarcha()).toBe(false); expect(x.b().textContent).toBe("El guía las ha parado"); expect(x.b().disabled).toBe(true);
    x.m.alGuiada(v(true, 2000));
    expect(x.m.enMarcha()).toBe(true); expect(x.b().textContent).toBe("Parar para mí");
    x.b().click();
    expect(x.m.enMarcha()).toBe(false); expect(x.b().getAttribute("aria-pressed")).toBe("true"); expect(x.b().textContent).toBe("Volver a la marcha del grupo");
    x.b().click(); expect(x.m.enMarcha()).toBe(true);
    expect(x.pedidas).toEqual([]);
    x.m.alGuiada(null);   // fin de la guiada: el interruptor de siempre, tal como estén
    expect(x.b().textContent).toBe("Parar las máquinas");
  });
  it("reducir movimiento manda: paradas aquí, con el aviso de que el guía las ha puesto en marcha (una vez por cambio)", () => {
    const x = maq({ reducido: true });
    x.m.alGuiada(v(true)); x.m.alGuiada(v(true));
    expect(x.m.enMarcha()).toBe(false); expect(x.b().disabled).toBe(true);
    expect(x.avisos).toHaveLength(1); expect(x.avisos[0]).toMatch(/el guía ha puesto las máquinas en marcha/i);
  });
  it("el guía: «Máquinas para todos» pide el cambio a la api (no lo aplica él solo)", () => {
    const x = maq({ guia: true });
    x.m.alGuiada(v(true));
    expect(x.b().textContent).toBe("Máquinas para todos: en marcha");
    x.b().click();
    expect(x.pedidas).toEqual([{ maquinas: { marcha: false } }]);
    expect(x.m.enMarcha()).toBe(true);
  });
  it("quien llega tarde las ve donde los demás (fija con los segundos desde «desde»)", () => {
    const x = maq({ ahora: 61_000 });
    x.m.alGuiada(v(true, 1000));
    expect(x.m.estado().marcha).toBe(1);
  });
});

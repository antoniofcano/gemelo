// Hablar en la guiada y en un corro (mundos/comun/habla.ts y red/voz/habla.ts; MU5-n, A3-6b: antes 47_habla.js). En Node, con un DOM, una voz, una guiada, una api,
// Teclas, Ajustes, PanelVR, Laminas y un 29_vr de mentira. Lo que pide la migración: el turno y los modos de forma pura (no cambian), el componente de todo mundo y
// que su libera() lo suelte todo (la caja, el aviso de voz, la tarjeta, la lámina, el gatillo de VR, la tecla T, la fila del panel, la pestaña, las escuchas y el
// gancho), también lo que la api contesta después (hallazgo de A3-6b). Lo de siempre (la mano, el aviso, la tarjeta, los modos) lo cubre a fondo
// pruebas/guardianes/habla.test.js; lo de verdad en un navegador, habla_chrome.test.js (por el banco). HONESTIDAD: no se abre ningún micrófono (regla 7).
import { describe, expect, it } from "vitest";
import { HablaPuro } from "../../red/voz/habla.ts";
import { ID_HABLA, creaHabla, manifiestoHabla } from "./habla.ts";
import type { DepsHabla } from "./habla.ts";

describe("HablaPuro: el turno de palabra y los modos no cambian (A3-6b)", () => {
  it("pulsar alterna; mantener abre al apretar y cierra al soltar (el guía siempre pulsa)", () => {
    expect(HablaPuro.entrada({ modo: "pulsar", papel: "familia", tipo: "baja", micro: "cerrado" })).toEqual({ accion: "abre", sosten: false });
    expect(HablaPuro.entrada({ modo: "pulsar", papel: "familia", tipo: "baja", micro: "abierto" })).toEqual({ accion: "cierra", sosten: false });
    expect(HablaPuro.entrada({ modo: "mantener", papel: "familia", tipo: "baja", micro: "cerrado" })).toEqual({ accion: "abre", sosten: true });
    expect(HablaPuro.entrada({ modo: "mantener", papel: "familia", tipo: "suelta", micro: "abierto", sosten: true })).toEqual({ accion: "cierra", sosten: false });
    expect(HablaPuro.entrada({ modo: "mantener", papel: "guia", tipo: "baja", micro: "cerrado" })).toEqual({ accion: "abre", sosten: false });
  });
  it("sin la palabra, la familia levanta la mano; con ella, habla; en un corro, el micro se cierra tras 60 s sin que se le oiga", () => {
    const e = { guiada: true, papel: "familia", puede: false, micro: "cerrado", motivo: "", auriculares: false, mano: false, puesto: null, ocupado: false };
    expect(HablaPuro.vista(e, "pulsar").primaria.accion).toBe("levantar");
    expect(HablaPuro.vista({ ...e, mano: true, puesto: 2 }, "pulsar").cola).toBe("Estás 2.º en la cola.");
    expect(HablaPuro.vista({ ...e, puede: true }, "pulsar").primaria.accion).toBe("micro");
    expect(HablaPuro.SILENCIO_S).toBe(60);
    expect(HablaPuro.silencio({ corro: true, micro: "abierto", habla: false, t: 59.9, dt: 0.25 })).toEqual({ t: 0, cierra: true });
    expect(HablaPuro.silencio({ corro: false, micro: "abierto", habla: false, t: 59.9, dt: 0.25 })).toEqual({ t: 0, cierra: false });   // en la guiada, no: lo cierra el turno
  });
  it("el aviso de voz: solo las familias, con su versión (la de la api)", () => {
    expect(HablaPuro.AVISO_VERSION).toBe(1); expect(HablaPuro.AVISO.version).toBe(1);
    expect(HablaPuro.requiere("familia", "levantar", "?")).toBe("comprobar"); expect(HablaPuro.requiere("familia", "micro", "no")).toBe("aviso");
    expect(HablaPuro.requiere("guia", "micro", "no")).toBe("nada"); expect(HablaPuro.consentimiento({ version: 1, aceptada: true })).toBe("si");
  });
});

// ---------- dobles
class El {
  tagName: string; children: El[] = []; style: Record<string, string> = {}; attrs: Record<string, string> = {}; oy: Record<string, ((e: unknown) => void)[]> = {};
  hidden = false; parentNode: El | null = null; textContent = ""; disabled = false; checked = false; title = ""; id = ""; type = "";
  constructor(t: string) { this.tagName = t.toUpperCase(); }
  appendChild(c: El) { if (c.parentNode) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; }
  removeChild(c: El) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  addEventListener(n: string, f: (e: unknown) => void) { (this.oy[n] = this.oy[n] || []).push(f); } removeEventListener() {}
  focus() {} dispara(n: string) { (this.oy[n] || []).slice().forEach(f => f({ preventDefault() {}, target: this })); }
  todos(id: string): El[] { return (this.id === id || this.attrs["id"] === id ? [this as El] : []).concat(...this.children.map(c => (c.todos ? c.todos(id) : []))); }
}
function monta({ papel = "familia", puede = false, consent = true, ranura = null as El | null } = {}) {
  const voz = { sala: "guiada-12", dentro: true, guiada: true, corro: false, papel, puede, micro: "cerrado", auriculares: false, motivo: "" };
  const Vz = { estado: () => ({ ...voz }), abre: () => { voz.micro = "abierto"; return Promise.resolve(true); }, cierra: () => { voz.micro = "cerrado"; return Promise.resolve(true); },
    auriculares: (si?: boolean) => { if (si !== undefined) voz.auriculares = si; return voz.auriculares; }, hablan: () => [] };
  const Gd = { estado: () => ({ evento: 12, yo: "h_yo", manos: [] }) };
  const visor = new El("div"), limpias: (() => void)[] = [], bus: Record<string, number> = {}, escuchas: Record<string, number> = {};
  const pendientes: (() => void)[] = [];   // las respuestas de la api, retenidas hasta que la prueba las suelte
  const cuenta = { pestanas: 0, pestanasQuitadas: 0, filas: 0, filasQuitadas: 0, teclas: 0, teclasQuitadas: 0, laminas: {} as Record<string, unknown> };
  const resp = (st: number, j: unknown) => new Promise(r => pendientes.push(() => r({ ok: st < 300, status: st, json: () => Promise.resolve(j) })));
  const VRX: any = { on: false, voz: null };
  const dp: DepsHabla = {
    location: { search: "" }, window: { addEventListener: (n: string) => { escuchas[n] = (escuchas[n] || 0) + 1; }, removeEventListener: (n: string) => { escuchas[n]!--; } },
    document: { createElement: (t: string) => new El(t), createTextNode: (t: string) => ({ texto: t }), body: new El("body"), activeElement: null, getElementById: (id: string) => (id === "hudVoz" ? ranura : null) },
    fetch: (u: string, o: any) => (u === "/api/presencia/voz/consentimiento" && o.method === "GET" ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: 1, aceptada: consent }) })
      : u === "/api/presencia/voz/consentimiento" ? resp(200, { version: 1, aceptada: true }) : resp(200, { puesto: 1 })),
    D: {}, ConfigPuro: { prefijoApi: () => "/api" }, visor,
    VRX, Aparato: { clase: () => "escritorio" },
    PanelVR: { filas: () => { cuenta.filas++; return () => { cuenta.filasQuitadas++; }; }, repinta() {} },
    Ajustes: { registra: (_p: string, _e: unknown, _t: unknown, fn: (k: string, v: unknown) => void) => { cuenta.pestanas++; fn("habla.modo", "pulsar"); return () => { cuenta.pestanasQuitadas++; }; }, pinta() {} },
    PrimeraVezPuro: { CLAVE: "habla.tarjeta", debeVerse: () => false, ambitoDe: () => "guiada", tarjeta: () => ({ titulo: "", lineas: [], pie: "", boton: "" }), FILA_VOLVER: "Volver a leer" },
    Laminas: { abre: (o: { id: string }) => { cuenta.laminas[o.id] = o; return true; }, cierra: (id: string) => { delete cuenta.laminas[id]; return true; }, hay: (id: string) => id in cuenta.laminas, repinta: () => true },
    Teclas: { registra: () => { cuenta.teclas++; return () => { cuenta.teclasQuitadas++; }; } }
  };
  const oy: Record<string, ((d?: unknown) => void)[]> = {};
  const n = { emite: () => 0, on: (e: string, f: (d?: unknown) => void) => { bus[e] = (bus[e] || 0) + 1; (oy[e] = oy[e] || []).push(f); limpias.push(() => { bus[e]!--; }); }, limpia: (f: () => void) => { limpias.push(f); return f; } };
  const api: any = creaHabla(dp, n, Vz, Gd);
  return { api, dp, visor, oy, voz, VRX, cuenta, bus, escuchas, pendientes, suelta: async () => { pendientes.splice(0).forEach(f => f()); for (let i = 0; i < 5; i++) await Promise.resolve(); },
    libera: () => { api.libera(); limpias.splice(0).forEach(f => f()); }, gancho: () => (dp.window as any).__habla };
}
const espera = () => new Promise(r => setTimeout(r, 0));

describe("creaHabla: componente de todo mundo con libera() de verdad (A3-6b)", () => {
  it("el manifiesto es de todo mundo, con la bandera ?habla y su presupuesto de siempre", () => {
    const def = manifiestoHabla({} as DepsHabla);
    expect(def.id).toBe(ID_HABLA); expect(def.mundos).toBe("todos"); expect(def.bandera).toEqual({ defecto: true, url: "habla" });
    expect(def.presupuesto).toEqual({ llamadas: 1, triangulos: 2, texturasMB: 4 }); expect(def.expone).toEqual([]);
    expect(def.eventos.emite).toEqual(["habla:micro", "habla:mano", "habla:consentimiento"]);
  });

  it("L6-05: con el sitio reservado del HUD (#hudVoz) la caja del micro va allí, no centrada encima del HUD", async () => {
    const ranura = new El("div"), m = monta({ papel: "familia", puede: true, ranura });
    m.api.tarde(0.25); await espera();
    expect(ranura.todos("hablaCaja")).toHaveLength(1); expect(m.visor.todos("hablaCaja")).toHaveLength(0);
    expect(String((ranura.todos("hablaCaja")[0] as any).style.cssText)).not.toMatch(/position:absolute/);
    m.libera();
  });

  it("libera() quita la caja, el aviso de voz, la lámina de VR, el gatillo, la tecla T, la fila del panel, la pestaña, las escuchas y el gancho", async () => {
    const m = monta({ papel: "familia", puede: false, consent: false });
    m.api.tarde(0.25); await espera();
    expect(m.visor.todos("hablaCaja")).toHaveLength(1); expect(m.VRX.voz).not.toBeNull(); expect(typeof m.gancho()).toBe("function");
    m.visor.todos("hablaBoton")[0]!.dispara("click"); await espera();   // «Levantar la mano» sin consentimiento: sale el aviso de voz
    expect(m.visor.todos("hablaConsent")).toHaveLength(1);
    m.VRX.on = true; m.voz.puede = true; m.voz.micro = "abierto"; m.oy["voz:estado"]!.forEach(f => f());   // y en VR, el micro abierto: la lámina de 3 s
    expect(Object.keys(m.cuenta.laminas)).toEqual(["habla-micro"]);
    m.libera();
    expect(m.visor.children).toHaveLength(0);   // ni caja ni aviso ni tarjeta
    expect(Object.keys(m.cuenta.laminas)).toEqual([]);
    expect(m.VRX.voz).toBeNull(); expect(m.gancho()).toBeUndefined();
    expect(m.cuenta.teclasQuitadas).toBe(m.cuenta.teclas); expect(m.cuenta.filasQuitadas).toBe(m.cuenta.filas); expect(m.cuenta.pestanasQuitadas).toBe(m.cuenta.pestanas);
    expect(Object.values(m.escuchas).every(v => v === 0)).toBe(true); expect(Object.values(m.bus).every(v => v === 0)).toBe(true);
  });

  it("hallazgo A3-6b: lo que contesta la api después de liberarlo (la mano, el aviso aceptado) ya no vuelve a montar la caja ni a registrar la pestaña", async () => {
    const m = monta({ papel: "familia", puede: false, consent: true });
    m.api.tarde(0.25); await espera();
    m.visor.todos("hablaBoton")[0]!.dispara("click"); await espera();   // pide la mano: el POST queda en vuelo
    expect(m.pendientes.length).toBeGreaterThan(0);
    m.libera(); const pestanas = m.cuenta.pestanas;
    await m.suelta();   // contesta la api
    expect(m.visor.children).toHaveLength(0);   // antes: msg("Mano levantada.") → pinta() → monta() volvía a poner la caja
    // y el aviso aceptado en vuelo
    const k = monta({ papel: "familia", puede: false, consent: false });
    k.api.tarde(0.25); await espera();
    k.visor.todos("hablaBoton")[0]!.dispara("click"); await espera();
    k.gancho()("acepta"); expect(k.pendientes.length).toBeGreaterThan(0);   // el PUT del consentimiento, en vuelo
    k.libera(); const antes = k.cuenta.pestanas;
    await k.suelta();
    expect(k.cuenta.pestanas).toBe(antes);   // antes: registraAjuste() volvía a poner la pestaña «Hablar» tras liberar
    expect(k.visor.children).toHaveLength(0);
    expect(pestanas).toBeGreaterThan(0);
  });
});

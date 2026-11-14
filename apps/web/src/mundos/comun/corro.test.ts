// La voz por cercanía en corros (mundos/comun/corro.ts y red/voz/corro.ts; MU5-n, A3-6b: antes 47b_corro.js). En Node, con el three de verdad (sin GPU) y una api,
// una presencia, una voz, una red, Ajustes, PanelVR, Laminas, Entidades y un DOM de mentira. Lo que pide la migración: la cercanía (invitar a menos de 8 m; salir a
// más de 40 m durante 60 s, con la histéresis de 35 m) de forma pura y sin cambios, el componente de todo mundo y que su libera() lo suelte todo: el DOM, los
// enganches (panel, ficha, Entidades, el tema «corro», la pestaña), los halos y los iconos (mallas, geometría, materiales y lienzos, con su dispose) y la voz del corro;
// también lo que la api contesta después (hallazgos de A3-6b). Lo de siempre (el aviso «cercania», invitar, aceptar, silenciar, bloquear, avisar) lo cubre a fondo
// pruebas/guardianes/corro.test.js. HONESTIDAD: nada se dibuja ni suena aquí (regla 7).
import { describe, expect, it } from "vitest";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { CorroPuro } from "../../red/voz/corro.ts";
import { ID_CORRO, creaCorro, manifiestoCorro } from "./corro.ts";
import type { DepsCorro } from "./corro.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

const YO = "h_" + "a".repeat(22), ANA = "h_" + "b".repeat(22), ANA_ID = ANA + "_aaaaaaaa", SALA = "corro-ABCdef123_-x";

describe("CorroPuro: la cercanía no cambia (A3-6b)", () => {
  it("invitar solo a menos de 8 m, a otro hogar, sin repetir y con sitio en el corro (como mucho 5 hogares)", () => {
    const e = { ...CorroPuro.vacio(), disponible: true, activa: true, puedo: true };
    expect(CorroPuro.DIST).toEqual({ invitar: 8, lejos: 40, vuelve: 35 }); expect(CorroPuro.MAX_HOGARES).toBe(5);
    expect(CorroPuro.puedeInvitar(e, ANA_ID, 8, YO)).toBe(""); expect(CorroPuro.puedeInvitar(e, ANA_ID, 8.01, YO)).toBe("lejos");
    expect(CorroPuro.puedeInvitar(e, YO + "_yyyyyyyy", 1, YO)).toBe("mismo_hogar"); expect(CorroPuro.puedeInvitar({ ...e, puedo: false }, ANA_ID, 1, YO)).toBe("no_puedes");
  });
  it("salir por lejanía: a más de 40 m de todos durante 60 s, con histéresis (vuelve a contar como cerca a 35 m o menos); 60 s en vista aérea", () => {
    let l = { lejos: false, t: 0, sale: false };
    for (let i = 0; i < 239; i++) l = CorroPuro.lejania({ distancias: [41], lejos: l.lejos, t: l.t, dt: 0.25 });
    expect(l.sale).toBe(false); l = CorroPuro.lejania({ distancias: [41], lejos: l.lejos, t: l.t, dt: 0.25 }); expect(l.sale).toBe(true);
    expect(CorroPuro.lejania({ distancias: [38], lejos: true, t: 10, dt: 0.25 }).lejos).toBe(true);   // entre 35 y 40 m sigue lejos si ya lo estaba
    expect(CorroPuro.lejania({ distancias: [35], lejos: true, t: 10, dt: 0.25 })).toEqual({ lejos: false, t: 0, sale: false });
    expect(CorroPuro.aerea({ aerea: true, t: 59.9, dt: 0.25 }).sale).toBe(true); expect(CorroPuro.aerea({ aerea: false, t: 59.9, dt: 0.25 })).toEqual({ t: 0, sale: false });
  });
});

// ---------- dobles
class El {
  tagName: string; children: El[] = []; style: Record<string, string> = {}; attrs: Record<string, string> = {}; oy: Record<string, ((e: unknown) => void)[]> = {};
  hidden = false; parentNode: El | null = null; textContent = ""; disabled = false; checked = false; title = ""; id = ""; type = ""; width = 0; height = 0;
  constructor(t: string) { this.tagName = t.toUpperCase(); }
  get firstChild(): El | null { return this.children[0] || null; }
  appendChild(c: El) { if (c.parentNode) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; }
  removeChild(c: El) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  addEventListener(n: string, f: (e: unknown) => void) { (this.oy[n] = this.oy[n] || []).push(f); } removeEventListener() {}
  focus() {} getContext() { return new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : () => {}), set: () => true }); }
}
function monta({ vr = false, ranura = null as El | null } = {}) {
  const srv = { corro: { sala: SALA, miembros: [{ prefijo: YO, alias: "Yo", yo: true }, { prefijo: ANA, alias: "Ana" }] } as any, retenidas: [] as (() => void)[], retener: false };
  const J = (st: number, j: unknown) => ({ ok: st < 300, status: st, json: () => Promise.resolve(j) });
  const fetch = (u: string, o: any) => {
    const r = u === "/api/presencia/corros/estado" ? J(200, { disponible: true, ajuste: { activa: true }, consentimiento: { version: 1, aceptada: true }, suspension: null, puedo: true, corro: srv.corro, invitaciones: { recibidas: [], enviadas: [] } })
      : u === "/api/presencia/corros" ? J(200, { corros: [{ id: "ZZZZZZZZZZZZ", prefijos: ["h_" + "z".repeat(22)] }] })
      : u === "/api/presencia/corros/salir" ? J(204, null) : J(201, {});
    if (srv.retener && o.method !== "GET") return new Promise(res => srv.retenidas.push(() => res(r)));
    return Promise.resolve(r);
  };
  const scene = new THREE.Scene(), visor = new El("div"), filas: unknown[] = [], cuenta = { filasQuitadas: 0, pestana: 0, pestanaQuitada: 0, acciones: 0, accionesQuitadas: 0, tipos: 0, tiposQuitados: 0, tema: 0, temaQuitado: 0 };
  const laminas: Record<string, unknown> = {}, bus: Record<string, number> = {}, limpias: (() => void)[] = [];
  const voz = { sala: "", corro: false, guiada: false, entrando: false, salidas: 0, entra: null as null | ((ok: boolean) => void) };
  const Vz = { estado: () => ({ sala: voz.sala, corro: voz.corro, guiada: voz.guiada, entrando: voz.entrando }),
    entraCorro: () => new Promise<boolean>(res => { voz.entra = (ok: boolean) => { if (ok) { voz.sala = SALA; voz.corro = true; } res(ok); }; }),
    sale: () => { voz.salidas++; voz.sala = ""; voz.corro = false; return Promise.resolve(); }, silencia: () => true };
  const lejana = { [ANA_ID]: 3, ["h_" + "z".repeat(22) + "_zzzzzzzz"]: 12 };
  const P = { estado: () => ({ activo: true, variante: "red", conectado: true, sala: "general", identidad: YO + "_yyyyyyyy", enVistaAerea: false }),
    puntos: () => Object.keys(lejana).map(id => ({ id })), distancia: (id: string) => (lejana as any)[id] ?? null, cabeza: () => ({ x: 1, y: 11.6, z: -1 }),
    accionesPersona: () => { cuenta.acciones++; return () => { cuenta.accionesQuitadas++; }; }, repintaGente() {} };
  const R = { sala: (c: string) => (c === "visita" ? { escucha: () => { cuenta.tema++; return () => { cuenta.temaQuitado++; }; } } : null) };
  const Ajustes = { registra: (_p: string, _e: unknown, _t: unknown, fn: (k: string, v: unknown) => void) => { cuenta.pestana++; fn("voz.cercania", true); return () => { cuenta.pestanaQuitada++; }; }, lee: () => true, pon: () => true, pinta() {} };
  const Materiales = creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" });
  const dp: DepsCorro = { THREE, scene, camera: new THREE.PerspectiveCamera(), Materiales, location: { search: "" }, window: {}, fetch,
    document: { createElement: (t: string) => new El(t), createTextNode: (t: string) => ({ texto: t }), body: new El("body"), activeElement: null, getElementById: (id: string) => (id === "hudVoz" ? ranura : null) },
    D: {}, ConfigPuro: { prefijoApi: () => "/api/" }, LaminasPuro: { lineas: (t: string) => [t] }, visor,
    VRX: { on: vr }, Aparato: { clase: () => "escritorio" }, PanelVR: { filas: (_p: string, d: unknown) => { filas.push(d); return () => { cuenta.filasQuitadas++; }; }, repinta() {} },
    Ajustes, Hud: { aviso() {} }, Laminas: { abre: (o: { id: string }) => { laminas[o.id] = o; return true; }, cierra: (id: string) => { delete laminas[id]; return true; }, hay: (id: string) => id in laminas, repinta: () => true },
    Entidades: { registra: () => { cuenta.tipos++; return () => { cuenta.tiposQuitados++; }; } }, TextDecoder: undefined };
  const oy: Record<string, ((d?: unknown) => void)[]> = {};
  const n = { emite: () => 0, on: (e: string, f: (d?: unknown) => void) => { bus[e] = (bus[e] || 0) + 1; (oy[e] = oy[e] || []).push(f); limpias.push(() => { bus[e]!--; }); }, limpia: (f: () => void) => { limpias.push(f); return f; } };
  const api: any = creaCorro(dp, n, R, P, Vz);
  return { api, srv, scene, visor, filas, cuenta, laminas, bus, voz, dp, oy, libera: () => { api.libera(); limpias.splice(0).forEach(f => f()); }, gancho: (a: string, x?: unknown) => (dp.window as any).__corro(a, x) };
}
const espera = async (k = 6) => { for (let i = 0; i < k; i++) await new Promise(r => setTimeout(r, 0)); };
/** lo que cuelga de la escena: geometrías, materiales y texturas, para ver que se sueltan con su dispose */
function recursos(scene: any) {
  const g = new Set<any>(), m = new Set<any>(), t = new Set<any>();
  scene.traverse((x: any) => { if (x.geometry) g.add(x.geometry); if (x.material) { m.add(x.material); if (x.material.map) t.add(x.material.map); } });
  return { g: [...g], m: [...m], t: [...t] };
}

describe("creaCorro: componente de todo mundo con libera() de verdad (A3-6b)", () => {
  it("el manifiesto es de todo mundo, con la bandera ?corro y su presupuesto de siempre", () => {
    const def = manifiestoCorro({} as DepsCorro);
    expect(def.id).toBe(ID_CORRO); expect(def.mundos).toBe("todos"); expect(def.bandera).toEqual({ defecto: true, url: "corro" });
    expect(def.presupuesto).toEqual({ llamadas: 3, triangulos: 26, texturasMB: 6 }); expect(def.fases).toEqual({ mundo: 0, tarde: 0.25 });
  });

  it("libera() quita el DOM, los enganches, los halos y los iconos (con su dispose) y saca la voz del corro", async () => {
    const m = monta();
    await espera(); m.voz.entra!(true); await espera();   // en el corro, con la voz dentro
    m.api.tarde(10); await espera(); m.api.tarde(0.25); await espera();   // los corros de los que no eres (el icono)
    (m.api as any).mundo();
    expect(m.gancho("mundo").montado).toBe(true);
    const r = recursos(m.scene);
    expect(r.g).toHaveLength(1); expect(r.m).toHaveLength(2); expect(r.t).toHaveLength(2);   // un plano, dos materiales (halo e icono) y sus dos lienzos
    expect(m.dp.Materiales.duenos()[ID_CORRO]).toBe(2);   // segundo commit: los dos, estándar por la fábrica con dueño «corro-voz»
    expect(r.m.every((x: any) => x.isMeshBasicMaterial && x.transparent && !x.depthWrite && !x.toneMapped)).toBe(true);   // los de siempre
    const sueltos = { g: 0, m: 0, t: 0 };
    r.g.forEach((x: any) => x.addEventListener("dispose", () => sueltos.g++)); r.m.forEach((x: any) => x.addEventListener("dispose", () => sueltos.m++)); r.t.forEach((x: any) => x.addEventListener("dispose", () => sueltos.t++));
    expect(m.visor.children.length).toBeGreaterThan(0); expect(m.voz.corro).toBe(true);
    m.libera();
    expect(m.scene.children).toHaveLength(0);   // halos e iconos, fuera de la escena
    expect(m.dp.Materiales.duenos()[ID_CORRO]).toBeUndefined();   // la fábrica ya no guarda nada suyo
    expect(sueltos.g).toBe(1); expect(sueltos.m).toBeGreaterThanOrEqual(2); expect(sueltos.t).toBe(2);
    expect(m.visor.children).toHaveLength(0);
    expect(m.cuenta.filasQuitadas).toBe(m.filas.length); expect(m.cuenta.accionesQuitadas).toBe(m.cuenta.acciones); expect(m.cuenta.tiposQuitados).toBe(m.cuenta.tipos);
    expect(m.cuenta.temaQuitado).toBe(m.cuenta.tema); expect(m.cuenta.pestanaQuitada).toBe(m.cuenta.pestana);
    expect(m.voz.corro).toBe(false); expect((m.dp.window as any).__corro).toBeUndefined();
    expect(Object.values(m.bus).every(v => v === 0)).toBe(true);
  });

  it("L6-05: con el sitio reservado del HUD (#hudVoz) la caja del corro va allí y no flota sobre el estado", async () => {
    const ranura = new El("div"), m = monta({ ranura });
    await espera(); m.voz.entra!(true); await espera(); m.api.tarde(0.25); await espera();
    const caja = ranura.children.find(c => c.attrs.id === "corroCaja" || c.id === "corroCaja");
    expect(caja).toBeTruthy(); expect(m.visor.children.some(c => c === caja)).toBe(false);
    expect(String((caja as any).style.cssText)).not.toMatch(/position:absolute/);
    m.libera(); expect(ranura.children).toHaveLength(0);
  });
  it("L6-06: cuando alguien empieza o deja de hablar, la lista se pone al día sin rehacer sus botones (no se pierde el foco ni el toque)", async () => {
    const m = monta();
    await espera(); m.voz.entra!(true); await espera(); m.api.tarde(0.25); await espera();
    const caja = m.visor.children.find(c => c.id === "corroCaja" || c.attrs.id === "corroCaja") as any, lista = caja._l as El;
    const botones = () => lista.children.flatMap(li => li.children.filter(h => h.tagName === "BUTTON"));
    const antes = botones(); expect(antes.length).toBeGreaterThanOrEqual(1);
    (m.oy["voz:habla"] || []).forEach(f => f({ identidad: ANA_ID, habla: true })); m.api.tarde(0.25);
    expect(lista.children.map(li => li.children[0]!.textContent).join("|")).toMatch(/Ana · habla/);
    expect(botones()).toEqual(antes);   // los mismos nodos: el que tenía el foco sigue ahí
    (m.oy["voz:habla"] || []).forEach(f => f({ identidad: ANA_ID, habla: false })); m.api.tarde(0.25);
    expect(botones()).toEqual(antes);
    m.libera();
  });

  it("hallazgo A3-6b: liberado mientras la voz entraba en el corro, la voz sale en cuanto entra", async () => {
    const m = monta();
    await espera(); expect(m.voz.entra).not.toBeNull();   // la voz está entrando (Voz.entraCorro en vuelo)
    m.libera(); const antes = m.voz.salidas;
    m.voz.entra!(true); await espera();
    expect(m.voz.corro).toBe(false); expect(m.voz.salidas).toBe(antes + 1);   // antes se quedaba en la sala del corro sin el componente que la sacara
  });

  it("hallazgo A3-6b: en VR, lo que contesta la api después de liberarlo no abre una lámina que ya nadie cierra", async () => {
    const m = monta({ vr: true });
    await espera(); m.voz.entra!(true); await espera();
    m.srv.retener = true; m.gancho("sale", "salir");   // «Salir del corro»: el POST queda en vuelo
    m.libera();
    m.srv.retener = false; m.srv.retenidas.splice(0).forEach(f => f()); await espera();
    expect(Object.keys(m.laminas)).toEqual([]);   // antes: dice("Has salido del corro.") abría la lámina de mensaje tras liberar
  });
});

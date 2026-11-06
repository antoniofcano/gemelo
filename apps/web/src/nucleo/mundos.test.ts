// El gestor de mundos (MU2-1, MUNDOS §3) con mundos falsos: la máquina de estados, el fundido a negro, la vuelta atrás, el tope de tiempo, congelar
// frente a liberar, la Cola por dueño y el retorno. Sin three, sin DOM y sin Chrome: el fundido, la Cola (la de verdad), el temporizador y los mundos
// son de mentira o deterministas. HONESTIDAD: esto prueba la lógica del cambio; que la sesión XR sobreviva al cambio de raíz en un Quest, no (banco y
// aparato, MU2-8 y MU2-9).
import { describe, expect, it } from "vitest";
import { creaCola } from "./cola.ts";
import type { Trabajo } from "./cola.ts";
import { WorldManagerPuro, creaWorldManager } from "./mundos.ts";
import type { ContextoBase, EstadoCambio, IdMundo, MundoBase, Pose2 } from "./mundos.ts";

type Velo = "abierto" | "cerrando" | "negro" | "abriendo";

function fundidoFalso() {
  const f = {
    velo: "abierto" as Velo, traza: [] as string[],
    cierra(): Promise<void> { f.velo = "cerrando"; f.traza.push("cierra"); return Promise.resolve().then(() => { f.velo = "negro"; }); },
    abre(): Promise<void> { f.velo = "abriendo"; f.traza.push("abre"); return Promise.resolve().then(() => { f.velo = "abierto"; }); },
  };
  return f;
}

function temporizadorFalso() {
  const pend: Array<{ fn: () => void; ms: number; vivo: boolean }> = [];
  return {
    pend,
    temporizador(fn: () => void, ms: number): () => void { const t = { fn, ms, vivo: true }; pend.push(t); return () => { t.vivo = false; }; },
    dispara(): void { for (const t of pend.splice(0)) if (t.vivo) t.fn(); },
    vivos: (): number => pend.filter(t => t.vivo).length,
  };
}

function* trabajoLargo(): Trabajo { for (;;) yield; }

interface OpcFalso { alSalir?: "congela" | "libera"; carga?: (ctx: ContextoBase) => Promise<void>; fallaEntra?: boolean; fallaSale?: boolean; cota?: number; salida?: Pose2 }

// un mundo de mentira que apunta cada llamada con el estado del gestor y del velo en ese momento
function mundoFalso(id: IdMundo, entorno: { traza: string[]; velo: () => Velo; estado: () => EstadoCambio }, o: OpcFalso = {}) {
  const llamadas = { carga: 0, entra: [] as Array<Pose2 | null>, sale: 0, congela: 0, libera: 0, actualiza: 0 };
  let ctx: ContextoBase | null = null;
  const apunta = (m: string): void => { entorno.traza.push(id + "." + m + "@" + entorno.estado() + "/" + entorno.velo()); };
  const w: MundoBase & { llamadas: typeof llamadas; ctx: () => ContextoBase | null } = {
    id, llamadas, ctx: () => ctx,
    ...(o.alSalir ? { alSalir: o.alSalir } : {}),
    carga(c: ContextoBase): Promise<void> {
      apunta("carga"); llamadas.carga++; ctx = c;
      c.cola.pon("T1", 1, trabajoLargo());   // un trabajo suyo, para ver que se cancela al salir
      return o.carga ? o.carga(c) : Promise.resolve();
    },
    entra(_desde, llegada): void { apunta("entra"); llamadas.entra.push(llegada); if (o.fallaEntra) throw new Error("entra falla"); },
    actualiza(): void { llamadas.actualiza++; },
    sale(): Pose2 { apunta("sale"); llamadas.sale++; if (o.fallaSale) throw new Error("sale falla"); return o.salida || { x: 1, y: 2, ang: 0.5 }; },
    congela(): void { apunta("congela"); llamadas.congela++; },
    libera(): void { apunta("libera"); llamadas.libera++; },
    suelo: () => o.cota ?? 0,
    dentro: () => true,
    obstaculo: () => null,
  };
  return w;
}

function banco(opc: { permiso?: (a: IdMundo) => boolean; tiempoMax?: number } = {}) {
  const fundido = fundidoFalso(), reloj = temporizadorFalso(), traza: string[] = [], avisos: string[] = [];
  let t = 0;
  const cola = creaCola({ ahora: () => t });
  const gm = creaWorldManager({
    fundido, cola, temporizador: reloj.temporizador, ahora: () => (t += 1),
    ...(opc.tiempoMax ? { tiempoMax: opc.tiempoMax } : {}),
    ...(opc.permiso ? { permiso: opc.permiso } : {}),
    avisa: (ev, d) => { avisos.push(ev + ":" + d.id); },
  });
  const entorno = { traza, velo: () => fundido.velo, estado: () => gm.estado };
  const mundos: Record<string, ReturnType<typeof mundoFalso>> = {};
  const defs: Record<string, number> = {};
  function pon(id: IdMundo, o?: OpcFalso) {
    const w = mundoFalso(id, entorno, o); mundos[id] = w; defs[id] = 0;
    gm.registra(() => { defs[id] = (defs[id] || 0) + 1; return Promise.resolve(w); }, id);
    return w;
  }
  return { gm, fundido, reloj, traza, avisos, cola, mundos, defs, pon };
}

describe("WorldManagerPuro.transicion", () => {
  it("el camino entero y la vuelta atrás", () => {
    const tr = WorldManagerPuro.transicion;
    let s: EstadoCambio = "en";
    const camino: EstadoCambio[] = [];
    for (const ev of ["pide", "cerrado", "salido", "cargado", "entrado", "abierto"] as const) { s = tr(s, ev) as EstadoCambio; camino.push(s); }
    expect(camino).toEqual(["cerrando", "saliendo", "cargando", "entrando", "abriendo", "en"]);
    expect(tr("cargando", "falla")).toBe("entrando");
    expect(tr("saliendo", "falla")).toBe("entrando");
    expect(tr("entrando", "falla")).toBe("entrando");
    expect(tr("en", "arranca")).toBe("cargando");
  });
  it("lo que no vale es null: no se cierra dos veces, no se pide con un cambio en curso, no se falla con el velo abierto", () => {
    const tr = WorldManagerPuro.transicion;
    expect(tr("cerrando", "pide")).toBeNull();
    expect(tr("cargando", "pide")).toBeNull();
    expect(tr("en", "falla")).toBeNull();
    expect(tr("abriendo", "falla")).toBeNull();
    expect(tr("cerrando", "falla")).toBeNull();
    for (const s of WorldManagerPuro.ESTADOS) expect(Object.keys(WorldManagerPuro.TABLA[s]).length).toBeGreaterThan(0);
  });
});

describe("WorldManager con mundos falsos", () => {
  it("camino feliz: a negro, sale y congela el de antes, carga y entra el nuevo, abre", async () => {
    const b = banco(); b.pon("exterior"); b.pon("molino");
    expect(b.gm.actual).toBeNull();
    expect((await b.gm.arranca("exterior")).ok).toBe(true);
    expect(b.gm.actual).toBe("exterior");
    expect(b.fundido.traza).toEqual([]);   // arrancar no funde
    b.traza.length = 0;
    const r = await b.gm.cambia("molino", { x: 0, y: 1.5, ang: Math.PI });
    expect(r).toMatchObject({ ok: true, mundo: "molino" });
    expect(r.motivo).toBeUndefined();
    expect(b.gm.actual).toBe("molino");
    expect(b.gm.estado).toBe("en");
    expect(b.traza).toEqual([
      "exterior.sale@saliendo/negro", "exterior.congela@saliendo/negro",
      "molino.carga@cargando/negro", "molino.entra@entrando/negro",
    ]);
    expect(b.fundido.traza).toEqual(["cierra", "abre"]);
    expect(b.fundido.velo).toBe("abierto");
    expect(b.mundos.molino?.llamadas.entra).toEqual([{ x: 0, y: 1.5, ang: Math.PI }]);
    expect(b.avisos).toEqual(["mundo:entra:exterior", "mundo:sale:exterior", "mundo:entra:molino"]);
    expect(b.reloj.vivos()).toBe(0);   // el tope de tiempo se canceló
  });

  it("el import() es perezoso: no se hace al registrar y solo una vez", async () => {
    const b = banco(); b.pon("exterior"); b.pon("molino", { alSalir: "libera" });
    expect(b.defs).toEqual({ exterior: 0, molino: 0 });
    await b.gm.arranca("exterior");
    expect(b.defs).toEqual({ exterior: 1, molino: 0 });
    await b.gm.cambia("molino"); await b.gm.cambia("exterior"); await b.gm.cambia("molino");
    expect(b.defs).toEqual({ exterior: 1, molino: 1 });
    expect(b.mundos.molino?.llamadas.carga).toBe(2);   // liberado al salir: se vuelve a cargar, pero el módulo ya estaba
  });

  it("cambiar al mismo mundo no hace nada", async () => {
    const b = banco(); b.pon("exterior");
    await b.gm.arranca("exterior"); b.traza.length = 0;
    const r = await b.gm.cambia("exterior");
    expect(r).toMatchObject({ ok: false, motivo: "mismo", mundo: "exterior" });
    expect(b.traza).toEqual([]); expect(b.fundido.traza).toEqual([]);
  });

  it("un mundo sin registrar no se pide y registrar dos veces lanza", async () => {
    const b = banco(); b.pon("exterior");
    await b.gm.arranca("exterior");
    expect(await b.gm.cambia("bodega")).toMatchObject({ ok: false, motivo: "sin_registrar", mundo: "exterior" });
    expect(b.fundido.traza).toEqual([]);
    expect(() => b.gm.registra(() => Promise.resolve(b.mundos.exterior as MundoBase), "exterior")).toThrow(/ya está registrado/);
  });

  it("con un cambio en curso no se acepta otro (ni arrancar)", async () => {
    const b = banco();
    let suelta: () => void = () => {};
    b.pon("exterior"); b.pon("molino", { carga: () => new Promise<void>(r => { suelta = r; }) }); b.pon("bodega");
    await b.gm.arranca("exterior");
    const p = b.gm.cambia("molino");
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(b.gm.estado).toBe("cargando");
    expect(await b.gm.cambia("bodega")).toMatchObject({ ok: false, motivo: "ocupado" });
    expect(await b.gm.cambia("exterior")).toMatchObject({ ok: false, motivo: "ocupado" });
    expect(await b.gm.arranca("bodega")).toMatchObject({ ok: false, motivo: "ocupado" });
    expect(b.mundos.bodega?.llamadas.carga).toBe(0);
    suelta();
    expect(await p).toMatchObject({ ok: true, mundo: "molino" });
  });

  it("fallo de carga: vuelve al de antes, abierto, y el nuevo queda liberado y sin trabajos", async () => {
    const b = banco(); b.pon("exterior", { salida: { x: 10, y: 20, ang: 1 } });
    const mol = b.pon("molino", { carga: () => Promise.reject(new Error("glb roto")) });
    await b.gm.arranca("exterior"); b.traza.length = 0;
    const r = await b.gm.cambia("molino");
    expect(r).toMatchObject({ ok: false, motivo: "fallo_carga", mundo: "exterior" });
    expect(String(r.error)).toMatch(/glb roto/);
    expect(b.gm.actual).toBe("exterior"); expect(b.gm.estado).toBe("en");
    expect(b.fundido.velo).toBe("abierto"); expect(b.fundido.traza).toEqual(["cierra", "abre"]);
    expect(b.traza).toEqual([
      "exterior.sale@saliendo/negro", "exterior.congela@saliendo/negro",
      "molino.carga@cargando/negro", "molino.libera@cargando/negro",
      "exterior.entra@entrando/negro",
    ]);
    expect(b.mundos.exterior?.llamadas.entra.at(-1)).toEqual({ x: 10, y: 20, ang: 1 });   // donde estaba
    expect(b.gm.fichaDe("molino")).toBe("sin_cargar");
    expect(b.cola.pendientesDe("molino")).toBe(0);
    expect(mol.ctx()?.senal.aborted).toBe(true);
    expect(b.reloj.vivos()).toBe(0);
  });

  it("un talón que da otro mundo es un fallo de carga", async () => {
    const b = banco(); b.pon("exterior");
    const falso = b.pon("bodega");
    b.gm.registra(() => Promise.resolve(falso as MundoBase), "molino");
    await b.gm.arranca("exterior");
    expect(await b.gm.cambia("molino")).toMatchObject({ ok: false, motivo: "fallo_carga", mundo: "exterior" });
  });

  it("tiempo agotado: vuelve al de antes, aborta la señal y libera también lo que llegue tarde", async () => {
    const b = banco({ tiempoMax: 5000 });
    let suelta: () => void = () => {};
    b.pon("exterior");
    const mol = b.pon("molino", { carga: () => new Promise<void>(r => { suelta = r; }) });
    await b.gm.arranca("exterior");
    const p = b.gm.cambia("molino");
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(b.gm.estado).toBe("cargando");
    expect(b.reloj.pend.at(-1)?.ms).toBe(5000);
    b.reloj.dispara();
    const r = await p;
    expect(r).toMatchObject({ ok: false, motivo: "tiempo", mundo: "exterior" });
    expect(b.fundido.velo).toBe("abierto");
    expect(mol.ctx()?.senal.aborted).toBe(true);
    expect(mol.llamadas.libera).toBe(1);
    suelta();   // la carga acaba después del tope
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(mol.llamadas.libera).toBe(2);
    expect(b.gm.actual).toBe("exterior"); expect(b.gm.fichaDe("molino")).toBe("sin_cargar");
  });

  it("fallo de entra() del nuevo: lo saca, lo libera y vuelve", async () => {
    const b = banco(); b.pon("exterior"); const mol = b.pon("molino", { fallaEntra: true });
    await b.gm.arranca("exterior");
    expect(await b.gm.cambia("molino")).toMatchObject({ ok: false, motivo: "fallo_entra", mundo: "exterior" });
    expect(mol.llamadas.sale).toBe(1); expect(mol.llamadas.libera).toBe(1);
    expect(b.gm.fichaDe("exterior")).toBe("activo"); expect(b.fundido.velo).toBe("abierto");
  });

  it("fallo de sale() del viejo: no se carga el nuevo y se vuelve a entrar en el viejo", async () => {
    const b = banco(); b.pon("exterior", { fallaSale: true }); const mol = b.pon("molino");
    await b.gm.arranca("exterior");
    expect(await b.gm.cambia("molino")).toMatchObject({ ok: false, motivo: "fallo_sale", mundo: "exterior" });
    expect(mol.llamadas.carga).toBe(0);
    expect(b.fundido.velo).toBe("abierto"); expect(b.gm.estado).toBe("en");
  });

  it("sin permiso no se oscurece nada", async () => {
    const b = banco({ permiso: a => a !== "bodega" }); b.pon("exterior"); const bod = b.pon("bodega");
    await b.gm.arranca("exterior");
    expect(await b.gm.cambia("bodega")).toMatchObject({ ok: false, motivo: "sin_permiso", mundo: "exterior" });
    expect(b.fundido.traza).toEqual([]); expect(bod.llamadas.carga).toBe(0);
    expect(b.gm.estado).toBe("en");
  });

  it("congela frente a libera: el congelado vuelve sin cargar; el que se libera, después de entrar el nuevo", async () => {
    const b = banco();
    const ext = b.pon("exterior");                          // por defecto, congela (decisión 218)
    const mol = b.pon("molino", { alSalir: "libera" });
    await b.gm.arranca("exterior");
    await b.gm.cambia("molino");
    expect(b.gm.fichaDe("exterior")).toBe("listo"); expect(ext.llamadas.congela).toBe(1); expect(ext.llamadas.libera).toBe(0);
    b.traza.length = 0;
    await b.gm.cambia("exterior");
    expect(ext.llamadas.carga).toBe(1);   // no se vuelve a cargar
    expect(b.gm.fichaDe("molino")).toBe("sin_cargar"); expect(mol.llamadas.libera).toBe(1);
    expect(b.traza).toEqual([
      "molino.sale@saliendo/negro", "molino.congela@saliendo/negro",
      "exterior.entra@entrando/negro", "molino.libera@abriendo/negro",   // liberar no tiene vuelta atrás: solo con el nuevo ya dentro
    ]);
    expect(mol.ctx()?.senal.aborted).toBe(true);
  });

  it("la política la puede decidir quien crea el gestor", async () => {
    const fundido = fundidoFalso(), reloj = temporizadorFalso(), cola = creaCola({ ahora: () => 0 });
    const gm = creaWorldManager({ fundido, cola, temporizador: reloj.temporizador, politica: () => "libera" });
    const e = { traza: [] as string[], velo: () => fundido.velo, estado: () => gm.estado };
    const ext = mundoFalso("exterior", e), mol = mundoFalso("molino", e);
    gm.registra(() => Promise.resolve(ext), "exterior"); gm.registra(() => Promise.resolve(mol), "molino");
    await gm.arranca("exterior"); await gm.cambia("molino");
    expect(ext.llamadas.libera).toBe(1); expect(gm.fichaDe("exterior")).toBe("sin_cargar");
  });

  it("al salir se cancelan los trabajos de la Cola del que sale, no los del otro ni los de siempre", async () => {
    const b = banco(); b.pon("exterior"); b.pon("molino");
    await b.gm.arranca("exterior");
    b.cola.add("N12", 5, trabajoLargo());                   // una clave sin dueño (la de siempre)
    expect(b.cola.pendientesDe("exterior")).toBe(1);
    await b.gm.cambia("molino");
    expect(b.cola.pendientesDe("exterior")).toBe(0);
    expect(b.cola.pendientesDe("molino")).toBe(1);
    expect(b.cola.hay("N12")).toBe(true);
    expect(b.mundos.molino?.ctx()?.cola.hay("T1")).toBe(true);
  });

  it("retorno recuerda dónde se dejó cada mundo y se usa al volver sin llegada", async () => {
    const b = banco();
    const ext = b.pon("exterior", { salida: { x: 100, y: -50, ang: 2 } });
    b.pon("molino", { salida: { x: 3, y: 4, ang: 0 } });
    await b.gm.arranca("exterior");
    expect(b.gm.retorno("exterior")).toBeNull();
    await b.gm.cambia("molino");
    const r = b.gm.retorno("exterior");
    expect(r).toEqual({ x: 100, y: -50, ang: 2 });
    if (r) r.x = 0;   // es una copia
    expect(b.gm.retorno("exterior")).toEqual({ x: 100, y: -50, ang: 2 });
    await b.gm.cambia("exterior");
    expect(ext.llamadas.entra.at(-1)).toEqual({ x: 100, y: -50, ang: 2 });
    expect(b.gm.retorno("molino")).toEqual({ x: 3, y: 4, ang: 0 });
    await b.gm.cambia("molino", { x: 9, y: 9, ang: 9 });   // una llegada explícita (la de la puerta) manda sobre el retorno
    expect(b.mundos.molino?.llamadas.entra.at(-1)).toEqual({ x: 9, y: 9, ang: 9 });
    expect(b.gm.retorno("bodega")).toBeNull();
  });

  it("el velo está a negro en todo lo que pasa entre cierra y abre, también al fallar", async () => {
    const b = banco();
    b.pon("exterior"); b.pon("molino"); b.pon("bodega", { carga: () => Promise.reject(new Error("x")) });
    await b.gm.arranca("exterior"); b.traza.length = 0;
    await b.gm.cambia("molino"); await b.gm.cambia("bodega"); await b.gm.cambia("exterior");
    expect(b.traza.length).toBeGreaterThan(8);
    for (const l of b.traza) expect(l.endsWith("/negro")).toBe(true);
    expect(b.fundido.traza.join(",")).toBe("cierra,abre,cierra,abre,cierra,abre");
    expect(b.fundido.velo).toBe("abierto");
  });

  it("actualiza solo el mundo activo y no a oscuras; los delegados son los del activo", async () => {
    const b = banco(); const ext = b.pon("exterior", { cota: 7 }); const mol = b.pon("molino", { cota: 0.2 });
    expect(b.gm.suelo(0, 0)).toBe(0); expect(b.gm.dentro(0, 0)).toBe(false); expect(b.gm.obstaculo(0, 0, 1)).toBeNull();
    b.gm.actualiza(0.016, 0);
    await b.gm.arranca("exterior");
    b.gm.actualiza(0.016, 1);
    expect(ext.llamadas.actualiza).toBe(1); expect(b.gm.suelo(0, 0)).toBe(7); expect(b.gm.dentro(0, 0)).toBe(true);
    let suelta: () => void = () => {};
    const mol2 = b.pon("bodega", { carga: () => new Promise<void>(r => { suelta = r; }) });
    const p = b.gm.cambia("bodega");
    for (let i = 0; i < 5; i++) await Promise.resolve();
    b.gm.actualiza(0.016, 2);   // cargando: nadie
    expect(ext.llamadas.actualiza).toBe(1); expect(mol2.llamadas.actualiza).toBe(0);
    suelta(); await p;
    b.gm.actualiza(0.016, 3);
    expect(mol2.llamadas.actualiza).toBe(1); expect(b.gm.suelo(0, 0)).toBe(0);
    await b.gm.cambia("molino");
    expect(b.gm.suelo(0, 0)).toBe(0.2); expect(mol.llamadas.actualiza).toBe(0);
  });

  it("MU2-6: antesDelRender, si el mundo activo lo tiene y con la misma regla que actualiza (no a oscuras); sin él, nada", async () => {
    const b = banco(); const ext = b.pon("exterior"); b.pon("molino");
    let n = 0; (ext as { antesDelRender?: () => void }).antesDelRender = () => { n++; };
    b.gm.antesDelRender(0.016, 0); expect(n).toBe(0);   // sin mundo activo
    await b.gm.arranca("exterior");
    b.gm.antesDelRender(0.016, 1); expect(n).toBe(1);
    await b.gm.cambia("molino");
    expect(() => b.gm.antesDelRender(0.016, 2)).not.toThrow(); expect(n).toBe(1);   // el molino no lo tiene; el exterior, congelado
  });

  it("arrancar con fallo deja el gestor sin mundo, en «en» y listo para otro intento", async () => {
    const b = banco();
    let falla = true;
    b.pon("exterior", { carga: () => (falla ? Promise.reject(new Error("índice")) : Promise.resolve()) });
    expect(await b.gm.arranca("exterior")).toMatchObject({ ok: false, motivo: "fallo_carga", mundo: null });
    expect(b.gm.estado).toBe("en"); expect(b.gm.actual).toBeNull();
    falla = false;
    expect(await b.gm.arranca("exterior")).toMatchObject({ ok: true, mundo: "exterior" });
    expect(await b.gm.arranca("exterior")).toMatchObject({ ok: false, motivo: "mismo" });
  });

  it("el gestor no recibe ni toca renderer, scene ni renderer.xr: sus dependencias son el fundido, la Cola y el reloj", () => {
    const b = banco();
    expect(Object.keys(b.gm).sort()).toEqual(["actual", "actualiza", "antesDelRender", "arranca", "cambia", "dentro", "estado", "fichaDe", "obstaculo", "registra", "retorno", "suelo"]);
  });
});

// Lo puro de los olivos generados (A3-2a, MU5-n; antes trozos de 07ab_generados.js): la escalera y la decisión (generados-escalera.ts), el manifiesto de lo horneado y la
// fila de impostores (generados-horneado.ts) y la cola propia (generados-cola.ts). Sin THREE ni GPU. Las pruebas grandes de la escalera con el constructor de verdad
// siguen en pruebas/olivo/escalera_motor.mjs y o9a_escalones.mjs (olivo.test.js); aquí, sus reglas de forma pequeña y legible.
import { describe, expect, it } from "vitest";
import { Escalera, GeneradosPuro } from "./generados-escalera.ts";
import { ORDEN_EPOCAS, descarga, dirHorneado, filaDe, filaImpostor, manifiestoNoVale, variantesDeEpoca } from "./generados-horneado.ts";
import { compiladoG, creaColaPropia } from "./generados-cola.ts";

const TRI: Record<string, number> = { E0: 100000, E1: 25000, E2: 11000, E2VR: 9000 };
const opc = (pres: number, extra: Record<string, unknown> = {}) => ({ pres, vr: null, costo: (_c: string, n: string) => TRI[n] as number, clavePropia: (c: { i: number }, n: string) => "p" + c.i + ":" + n, claveVar: (c: { i: number }) => "v" + (c.i % 4) + ":E2", ...extra });
const linea = (n: number, paso: number) => Array.from({ length: n }, (_, k) => ({ c: { i: k, h: 4 }, d: (k + 1) * paso }));

describe("la escalera (Escalera)", () => {
  it("tope: escritorio base × escala; móvil 270 k sin configurar (≤ 1); gafas el del perfil; menos los lejanos", () => {
    expect(Escalera.tope({ base: 550000, escala: 1, triLejanos: 10000 })).toBe(540000);
    expect(Escalera.tope({ base: 550000, movil: true, escala: 2 })).toBe(Escalera.TRI_MOVIL);
    expect(Escalera.tope({ base: 550000, movil: true, triMovil: 100000, escala: 0.5 })).toBe(50000);
    expect(Escalera.tope({ base: 550000, vr: { tri: 380000 }, escala: 3, triLejanos: 80000 })).toBe(300000);
    expect(Escalera.tope({ base: 1, escala: 1, triLejanos: 10 })).toBe(0);
  });
  it("fronteras por alto en píxeles: se acercan a la vez al subir s y las bandas no se pisan", () => {
    const F1 = Escalera.fronteras(4, Escalera.K_PX, Escalera.UMBRALES, 1, Escalera.BANDA), F2 = Escalera.fronteras(4, Escalera.K_PX, Escalera.UMBRALES, 2, Escalera.BANDA);
    F1.D.forEach((d: number, k: number) => { expect(F2.D[k]).toBeCloseTo(d / 2, 9); });
    expect(F1.D[0]).toBeLessThan(F1.D[1]); expect(F1.D[1]).toBeLessThan(F1.D[2]);
    for (let k = 0; k < 2; k++) expect(F1.D[k] + F1.b[k]).toBeLessThan(F1.D[k + 1] - F1.b[k + 1]);
    expect(Escalera.nivel(0.1, F1)).toBe(0); expect(Escalera.nivel(F1.D[2] + 1, F1)).toBe(3);
  });
  it("planifica: cabe en el presupuesto y en los topes de propios y variantes; con poco, s sube y nadie más cercano va más grueso", () => {
    for (const pres of [1e9, 538000, 200000]) {
      const est: Record<string, unknown> = {}; let r: { plan: { c: { i: number }; niv: string; rol: number }[]; usado: number; propios: number; variantes: number; s: number } = Escalera.planifica(linea(120, 1.7), est, opc(pres, { maxPropios: 999, maxVar: 999 }));
      for (let k = 0; k < 3; k++) r = Escalera.planifica(linea(120, 1.7), est, opc(pres, { maxPropios: 999, maxVar: 999 }));
      if (pres < 1e9) { expect(r.usado).toBeLessThanOrEqual(pres); expect(r.s).toBeGreaterThan(1); } else expect(r.s).toBe(1);
      const ORD: Record<string, number> = { E0: 0, E1: 1, E2: 2 }, fino: Record<number, number> = {};
      r.plan.forEach(p => { fino[p.c.i] = Math.min(fino[p.c.i] ?? 9, ORD[p.niv] as number); });
      const ids = Object.keys(fino).map(Number).sort((a, b) => a - b);
      for (let q = 1; q < ids.length; q++) expect(fino[ids[q] as number]).toBeGreaterThanOrEqual(fino[ids[q - 1] as number] as number);
    }
    const r = Escalera.planifica(linea(120, 1.7), {}, opc(1e9));
    expect(r.propios).toBeLessThanOrEqual(Escalera.MAX_PROPIOS); expect(r.variantes).toBeLessThanOrEqual(Escalera.MAX_VAR);
  });
  it("en gafas, sin E0 si el primero pasa del 40 % del perfil", () => {
    const r = Escalera.planifica(linea(30, 1), {}, opc(150000, { vr: { tri: 150000 } }));
    expect(r.plan.some((p: { niv: string }) => p.niv === "E0")).toBe(false);
  });
  it("modoGen, dibuja y mascaraTiles: forzada con ?olivos=escalera; horneada con variantes; gen sin ellas; la horneada espera a los lejanos", () => {
    expect(Escalera.modoGen({ bandera: "escalera" })).toBe("forzada");
    expect(Escalera.modoGen({ bandera: "gen", manifiesto: true, variantes: 4 })).toBe("horneada");
    expect(Escalera.modoGen({ bandera: "gen", manifiesto: true, variantes: 4, sinEscalera: true })).toBe("gen");
    expect(Escalera.modoGen({ bandera: null })).toBe("apagado");
    expect(Escalera.dibuja({ modoGen: "horneada", estado: "activo", hayCapa: false })).toBe(false);
    expect(Escalera.dibuja({ modoGen: "horneada", estado: "activo", hayCapa: true })).toBe(true);
    expect(Escalera.dibuja({ modoGen: "forzada", estado: "sin" })).toBe(false);
    expect(Escalera.mascaraTiles({ modoGen: "horneada", capaCompleta: false })).toBe("3d");
  });
  it("GeneradosPuro.activo: la bandera manda; sin ella, por defecto si la finca y el aparato pueden", () => {
    const D = { copas: [[0]], copas_param: [[1]], copas_id: [1] };
    expect(GeneradosPuro.activo("?olivos=escalera", null, {}).bandera).toBe("escalera");
    expect(GeneradosPuro.activo("?olivos=0", D, {}).motivo).toMatch(/a mano/);
    expect(GeneradosPuro.activo("", D, {})).toEqual({ bandera: "gen", defecto: true, motivo: "" });
    expect(GeneradosPuro.activo("", D, { batched: false }).motivo).toMatch(/BatchedMesh/);
  });
});

describe("lo horneado (manifiesto, filas e impostores)", () => {
  const M = { FORMATO_HORNEADO: 1, GEN_VERSION: "olivo-2", CACHE_VERSION: 3, TIPOS: { centenario3: {} } };
  const h = (c: string) => c.repeat(32);
  const manif = () => ({ v: 1, formato: 1, gen_version: "olivo-2", cache_version: 3, actual: "envero", epocas: [{ epoca: "envero", desde: "09-01", hasta: "10-31" }],
    variantes: [{ tipo: "centenario3", semilla: 11, epoca: "envero", nivel: "E2", huella: h("a"), bytes: 10 }, { tipo: "centenario3", semilla: 11, epoca: "envero", nivel: "E2VR", huella: h("b"), bytes: 10 },
      { tipo: "centenario3", semilla: 23, epoca: "envero", nivel: "E2", huella: h("c"), bytes: 10 }, { tipo: "centenario3", semilla: 5, epoca: "madura", nivel: "E2", huella: h("d"), bytes: 10 }] });
  it("la carpeta: ?olivosDir= solo relativa del mismo origen y acabada en «/»; si no, la del servidor; si no, ninguna", () => {
    expect(dirHorneado("?olivosDir=o/v/", "")).toBe("o/v/");
    for (const mala of ["?olivosDir=//otro/", "?olivosDir=../x/", "?olivosDir=sin", "?olivosDir=a%3Ab/"]) expect(dirHorneado(mala, "/teselas/h/")).toBeNull();
    expect(dirHorneado("", "/teselas/hituelo/")).toBe("/teselas/hituelo/olivos/"); expect(dirHorneado("", "datos/")).toBeNull();
  });
  it("el manifiesto vale con las versiones del motor; cualquier fila mal formada lo invalida entero", () => {
    expect(manifiestoNoVale(manif(), M)).toBe("");
    expect(manifiestoNoVale({ ...manif(), gen_version: "x" }, M)).toMatch(/gen_version/);
    const m = manif(); m.variantes[1]!.huella = "../../etc"; expect(manifiestoNoVale(m, M)).toMatch(/fila de variante 1/);
    expect(manifiestoNoVale(null, M)).toMatch(/ilegible/); expect(ORDEN_EPOCAS).toContain("envero");
  });
  it("variantes de la época (sin repetir, en orden) y la fila de cada una por nivel", () => {
    const m = manif();
    expect(variantesDeEpoca(m, "envero")).toEqual([{ tipo: "centenario3", semilla: 11 }, { tipo: "centenario3", semilla: 23 }]);
    expect(variantesDeEpoca(m, "flor")).toBeNull();
    expect(filaDe(m, { tipo: "centenario3", semilla: 11, epoca: "envero" }, "E2VR").huella).toBe(h("b"));
    expect(filaDe(null, {}, "E2")).toBeNull();
  });
  it("la fila de impostores solo vale si casa con las variantes del motor (mismo orden y la huella de su E2)", () => {
    const m: Record<string, unknown> = manif(), varSem = variantesDeEpoca(m, "envero");
    const Mi = { ...M, IMPOSTOR: {}, validaFilaImpostor: () => [] as string[] };
    m["impostores"] = [{ epoca: "envero", variantes: [{ tipo: "centenario3", semilla: 11, fuente: h("a") }, { tipo: "centenario3", semilla: 23, fuente: h("c") }] }];
    expect(filaImpostor(m, varSem, Mi, "envero")).toBe((m["impostores"] as unknown[])[0]);
    (m["impostores"] as { variantes: { fuente: string }[] }[])[0]!.variantes[1]!.fuente = h("e");
    expect(filaImpostor(m, varSem, Mi, "envero").motivo).toMatch(/variante 1/);
    expect(filaImpostor(m, varSem, Mi, "madura")).toBeNull(); expect(filaImpostor(m, varSem, M, "envero")).toBeNull();
  });
  it("la descarga comprueba tamaño, huella y cabecera antes de decodificar", async () => {
    const fila = { huella: h("a"), bytes: 4 }, r = { piezas: [], escala: [1, 1, 1], medidas: {} };
    const Mx = { ...M, huellaBytes: async () => h("a"), leeCabecera: () => ({ formato: 1, gen_version: "olivo-2", cache_version: 3, nivel: "E2", clave: "k" }), decodifica: () => ({ receta: r }) };
    const red = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array(4).buffer });
    expect(await descarga(red, "d/", Mx, fila, "k", "E2")).toBe(r);
    await expect(descarga(red, "d/", Mx, fila, "otra", "E2")).rejects.toThrow(/cabecera/);
    await expect(descarga(red, "d/", Mx, { ...fila, bytes: 5 }, "k", "E2")).rejects.toThrow(/tamaño/);
    await expect(descarga(async () => ({ ok: false, status: 404 }), "d/", Mx, fila, "k", "E2")).rejects.toThrow(/404/);
  });
});

describe("la cola propia", () => {
  const reloj = { t: 0, now() { return this.t; } };
  function* trabajo(n: number, v: unknown) { for (let i = 0; i < n; i++) { reloj.t += 1; yield; } return v; }
  it("por prioridad, con su tope de ms; una clave repetida solo cambia la prioridad", () => {
    const C = creaColaPropia(reloj), fin: unknown[] = [];
    C.encola("b", 5, trabajo(2, "b"), v => fin.push(v)); C.encola("a", 1, trabajo(2, "a"), v => fin.push(v)); C.encola("b", 0, trabajo(9, "otro"), v => fin.push(v));
    expect(C.cuantos()).toBe(2); expect(C.hay("a")).toBe(true);
    C.corre(100); expect(fin).toEqual(["b", "a"]); expect(C.cuantos()).toBe(0); expect(C.gastado()).toBe(4);
    C.encola("c", 0, trabajo(50, "c")); C.corre(3); expect(C.cuantos()).toBe(1); expect(C.gastado()).toBe(3);
  });
  it("vacia() suelta los trabajos sin acabarlos (cierra sus generadores y no llama a su fin)", () => {
    const C = creaColaPropia(reloj); let cerrado = false, fin = false;
    function* g() { try { while (true) { reloj.t++; yield; } } finally { cerrado = true; } }
    C.encola("x", 0, g(), () => { fin = true; }); C.corre(2);
    expect(C.vacia()).toBe(1); expect(C.cuantos()).toBe(0); expect(cerrado).toBe(true); expect(fin).toBe(false); expect(C.vacia()).toBe(0);
  });
  it("compiladoG: sin renderer el lote sale tal cual; con compileAsync, duerme hasta que acaba", async () => {
    const C = creaColaPropia(reloj), lote = { n: 1 }; let sale: unknown = null, suelta: () => void = () => {};
    C.encola("L", 0, compiladoG(trabajo(1, lote), () => ({ renderer: null, camara: null, escena: null })), v => { sale = v; }); C.corre(10); expect(sale).toBe(lote);
    sale = null;
    const renderer = { compileAsync: () => new Promise<void>(r => { suelta = r; }) };
    C.encola("L", 0, compiladoG(trabajo(1, lote), () => ({ renderer, camara: {}, escena: {} })), v => { sale = v; });
    C.corre(10); expect(sale).toBeNull(); const t = reloj.t; C.corre(10); expect(reloj.t).toBe(t);
    suelta(); await new Promise(r => setTimeout(r, 0)); C.corre(10); expect(sale).toBe(lote);
  });
});

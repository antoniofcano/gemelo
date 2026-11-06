// Las aves probables este mes (A3-5, MU5-n; antes 52_aves_mes.js). Con dobles del DOM, del reloj y del fetch (sin red, sin navegador). Se comprueba: lo puro (lista blanca, mes
// de Madrid, probables, filaVR) y el ciclo de vida: libera() corta la descarga en curso (AbortController), quita la ventana, el icono y la fila de VR, y no deja relojes ni escuchas.
// HONESTIDAD: nada se dibuja aquí (regla 7); el panel de VR en el Quest, no probado.
import { describe, expect, it, vi } from "vitest";
import { AvesMesPuro as P, creaAvesMes, manifiestoAvesMes } from "./aves-mes.ts";
import type { DepsAvesMes } from "./aves-mes.ts";
import type { ContextoComponente } from "../../nucleo/componentes.ts";

const ENERO = Date.UTC(2026, 0, 15, 12);
const mes = (n: number, anios: number) => ({ n, anios });
const meses = (enEnero: [number, number]) => Array.from({ length: 12 }, (_, i) => (i === 0 ? mes(...enEnero) : mes(0, 0)));
const EJ = {
  v: 1, origen: "gbif", grupo: "aves", sintetico: true, generado: "2026-11-01", anios: { desde: 2017, hasta: 2026 }, cuadro_km: 10, atribucion: "Datos de ejemplo (GBIF.org).",
  fuentes: [{ titulo: "Conjunto A", doi: "10.0000/a", cita: "c", licencias: ["CC0_1_0"], registros: 5 }],
  especies: [{ nombre_cientifico: "Erithacus rubecula", nombre_comun: "Petirrojo europeo", meses: meses([30, 6]) }, { nombre_cientifico: "Parus major", nombre_comun: "Carbonero común", meses: meses([20, 5]) }]
};
const json = (d: unknown) => ({ status: 200, json: () => Promise.resolve(d) });
const espera = () => new Promise((r) => setTimeout(r, 5));

function nodo(tag: string): Record<string, unknown> {
  const x: Record<string, unknown> = { tag, hijos: [] as unknown[], style: {}, className: "", textContent: "" };
  x["appendChild"] = (h: Record<string, unknown>) => { (x["hijos"] as unknown[]).push(h); h["parentNode"] = x; return h; };
  x["removeChild"] = (h: unknown) => { (x["hijos"] as unknown[]).splice((x["hijos"] as unknown[]).indexOf(h), 1); };
  Object.defineProperty(x, "firstChild", { get: () => (x["hijos"] as unknown[])[0] });
  return x;
}
function monta(respuesta: unknown, base = "/teselas/x/") {
  const reg = { ventanas: [] as { id: string }[], iconos: [] as unknown[], quitadas: 0, fetches: [] as string[], filas: [] as unknown[], señales: [] as AbortSignal[], limpias: [] as (() => void)[] };
  const deps: DepsAvesMes = {
    D: { base, biodiversidad: "biodiversidad.json" },
    fetch: (u: string, o: { signal?: AbortSignal }) => { reg.fetches.push(u); if (o.signal) reg.señales.push(o.signal); return Promise.resolve(respuesta); },
    Ventanas: { registra: (id: string, def: { construye(cu: unknown): void }) => { const cu = nodo("div"); cu["parentNode"] = { hidden: true }; def.construye(cu); reg.ventanas.push({ id }); return () => { reg.quitadas++; }; } },
    Hud: { icono: (def: unknown) => { reg.iconos.push(def); return () => { reg.quitadas++; }; } },
    PanelVR: { filas: (_p: string, def: unknown) => { reg.filas.push(def); return () => { reg.filas.pop(); reg.quitadas++; }; } },
    document: { createElement: nodo, createTextNode: (t: string) => ({ tag: "#text", textContent: t, hijos: [] }) }, window: {}, ahora: () => ENERO
  };
  const n = { id: "aves-mes", parametros: {}, limpia: <F>(f: F) => { reg.limpias.push(f as unknown as () => void); return f; }, on: () => () => {}, emite: () => 0, api: () => null } as ContextoComponente;
  return { api: creaAvesMes(deps, n), reg, n };
}

describe("aves probables este mes: lo puro", () => {
  it("valida el fichero: una licencia fuera de la lista blanca lo rechaza entero", () => {
    expect(P.valida(EJ)).not.toBeNull();
    expect(P.valida({ ...EJ, fuentes: [{ ...EJ.fuentes[0], licencias: ["CC_BY_NC_4_0"] }] })).toBeNull();
    expect(P.valida({ ...EJ, v: 2 })).toBeNull();
  });
  it("las probables del mes y la fila de VR: tres y «y X más», con «deducido»", () => {
    const d = P.valida(EJ)!;
    expect(P.probables(d, 1).map((x: { nombre: string }) => x.nombre)).toEqual(["Petirrojo europeo", "Carbonero común"]);
    const f = P.filaVR(d, 1)!; expect(f.cab).toMatch(/deducido/); expect(f.nota).toMatch(/no se ha observado en la finca/); expect(P.filaVR(d, 7)).toBeNull();
  });
  it("sin servidor ni índice no hay ruta; con ellos, solo su mismo origen", () => {
    expect(P.rutaDatos("", "biodiversidad.json")).toBeNull(); expect(P.rutaDatos("/t/", undefined)).toBeNull(); expect(P.rutaDatos("/t/", "biodiversidad.json")).toBe("/t/biodiversidad.json");
  });
});

describe("aves probables este mes: el componente y su ciclo de vida", () => {
  it("con datos pone ventana, icono y fila de VR; libera() los quita y no deja relojes", async () => {
    const intervalos = vi.spyOn(globalThis, "setInterval"), plazos = vi.spyOn(globalThis, "setTimeout");
    const { api, reg } = monta(json(EJ)); const llamadasPlazo = plazos.mock.calls.length;
    await espera();
    expect(reg.fetches).toEqual(["/teselas/x/biodiversidad.json"]); expect(reg.ventanas.map((v) => v.id)).toEqual(["aves"]); expect(reg.iconos).toHaveLength(1); expect(reg.filas).toHaveLength(1);
    api!.libera(); api!.libera();   // dos veces: la segunda no hace nada
    expect(reg.quitadas).toBe(3); expect(reg.filas).toHaveLength(0);
    expect(intervalos).not.toHaveBeenCalled(); expect(plazos.mock.calls.length - llamadasPlazo).toBe(1);   // el único temporizador es el de espera() de la prueba
    intervalos.mockRestore(); plazos.mockRestore();
  });
  it("liberar antes de que llegue el fichero corta la descarga y no monta nada", async () => {
    const { api, reg } = monta(json(EJ));
    expect(reg.señales).toHaveLength(1); expect(reg.señales[0]!.aborted).toBe(false);
    api!.libera(); expect(reg.señales[0]!.aborted).toBe(true);
    await espera(); expect(reg.ventanas).toHaveLength(0); expect(reg.iconos).toHaveLength(0); expect(reg.filas).toHaveLength(0);
  });
  it("el contexto también la llama al liberar el componente (n.limpia)", async () => {
    const { reg, api } = monta(json(EJ)); await espera();
    reg.limpias.forEach((f) => f()); expect(reg.quitadas).toBe(3); api!.libera(); expect(reg.quitadas).toBe(3);
  });
  it("sin servidor, con un fichero malo o sin aves de este mes no monta nada y no lanza", async () => {
    expect(monta(json(EJ), "").api).toBeNull();
    for (const malo of [json({ v: 1 }), { status: 404, json: () => Promise.reject(new Error("no")) }, json({ ...EJ, especies: [] })]) {
      const m = monta(malo); await espera(); expect(m.reg.ventanas.length + m.reg.iconos.length).toBe(0); m.api!.libera();
    }
  });
  it("el manifiesto: ?aves, sin escena 3D, del exterior; su libera() acepta null", () => {
    const m = manifiestoAvesMes({} as DepsAvesMes);
    expect(m.id).toBe("aves-mes"); expect(m.bandera).toEqual({ defecto: true, url: "aves" }); expect(m.presupuesto).toEqual({ llamadas: 0, triangulos: 0 }); expect(m.mundos).toEqual(["exterior"]);
    expect(() => m.libera(null)).not.toThrow();
  });
});

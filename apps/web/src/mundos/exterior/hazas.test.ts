// Las hazas (F1, el «3c»; MU5-n, A3-7b1: antes apps/web/motor/13b_hazas.js). Su validación y sus filas las prueba el guardián de Node (pruebas/guardianes/hazas.test.js, contra
// el esquema del contrato); aquí, el CICLO DE VIDA con dobles del DOM (nucleo/prueba-dom.ts): sin api no hace nada; con api, libera() corta la lista y las fichas en vuelo
// (AbortController), quita la tecla H y la entidad «haza», y lo que llegue tarde no monta nada. HONESTIDAD: sin navegador, sin relieve ni toque de verdad (eso, en el banco).
import { afterEach, describe, expect, it } from "vitest";
import { ID_HAZAS, HazasPuro, creaHazas, manifiestoHazas } from "./hazas.ts";
import { creaMundo, type Mundo } from "../../nucleo/prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });

const CX = 430000, CY = 4180000;   // un centro_utm de mentira
const cuadro = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const coleccion = () => ({ type: "FeatureCollection", srs: "EPSG:25830", features: [
  { type: "Feature", id: 1, properties: { codigo: "H-1", nombre: "Una", finca: "fx", es_mia: true }, geometry: { type: "MultiPolygon", coordinates: [[cuadro(CX, CY, CX + 100, CY + 80)]] } }] });

function monta(opc: { api: boolean; respuesta?: () => Promise<unknown> }) {
  m = creaMundo();
  const reg = { fetch: [] as Array<[string, { signal?: AbortSignal }]>, entidades: 0, quitadas: 0, eventos: [] as string[] };
  const fetch = (u: string, op: { signal?: AbortSignal }) => { reg.fetch.push([u, op]); return opc.respuesta ? opc.respuesta() : new Promise(() => {}); };
  const H = creaHazas({
    THREE: { Raycaster: class { ray = { origin: {}, direction: {} }; setFromCamera() {} }, Vector2: class { set() {} } }, D: { base: opc.api ? "/teselas/fx/" : "", finca_id: "fx", centro_utm: [CX, CY], ext: [-300, 300, 300, -300] },
    Bus: { emite: (ev: string) => { reg.eventos.push(ev); return 0; } }, Entidades: { registra: () => { reg.entidades++; return () => { reg.quitadas++; }; } }, Usables: {},
    camera: { far: 5000 }, Estado: { exag: 1 }, suelo: () => 0, objetivo: { x: 0, z: 0 }, pp: { x: 0, y: 0 }, paseando: false,
    ventana: m.ventana, ubicacion: { search: "" }, fetch
  });
  return { H, reg, m };
}
const espera = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };   // microtareas: el setTimeout de los dobles no corre solo
const ok = (cuerpo: unknown) => () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) });

describe("hazas: ciclo de vida", () => {
  it("sin api no pide nada ni engancha nada", async () => {
    const { H, reg, m } = monta({ api: false }); await espera();
    expect(reg.fetch.length).toBe(0); expect(m.escuchas()).toBe(0); expect(H.estado().activo).toBe(false);
    H.libera();
  });
  it("libera() corta la lista en vuelo: la señal se aborta y lo que llegue tarde no monta nada", async () => {
    let suelta: (r: unknown) => void = () => {};
    const { H, reg, m } = monta({ api: true, respuesta: () => new Promise(r => { suelta = r; }) });
    expect(reg.fetch.length).toBe(1); expect(reg.fetch[0]![1].signal!.aborted).toBe(false);
    H.libera();
    expect(reg.fetch[0]![1].signal!.aborted).toBe(true);
    suelta({ ok: true, status: 200, json: () => Promise.resolve(coleccion()) }); await espera();
    expect(H.estado().activo).toBe(false); expect(reg.entidades).toBe(0); expect(m.escuchas()).toBe(0); expect(reg.eventos).toEqual([]);
  });
  it("con datos: la entidad y la tecla H; libera() las quita y avisa de que ya no hay hazas", async () => {
    const { H, reg, m } = monta({ api: true, respuesta: ok(coleccion()) }); await espera();
    expect(H.estado().activo).toBe(true); expect(reg.entidades).toBe(1); expect(m.escuchas()).toBe(1); expect(H.lindes().length).toBe(1);
    H.libera();
    expect(reg.quitadas).toBe(1); expect(m.escuchas()).toBe(0); expect(H.estado().activo).toBe(false); expect(H.lindes()).toEqual([]);
    expect(reg.eventos).toEqual(["hazas:cambia", "hazas:cambia"]);
    H.libera(); expect(reg.eventos.length).toBe(2);   // dos veces no avisa dos veces
  });
  it("diez montajes y liberaciones no dejan escuchas ni entidades vivas", async () => {
    for (let i = 0; i < 10; i++) {
      const { H, reg, m } = monta({ api: true, respuesta: ok(coleccion()) }); await espera();
      H.libera(); expect(m.escuchas()).toBe(0); expect(reg.quitadas).toBe(reg.entidades);
      m.limpia();
    }
    m = null;
  });
  it("el componente es del exterior y solo de ciclo de vida; HazasPuro sale aparte", () => {
    const { H } = monta({ api: false }); const c = manifiestoHazas(H);
    expect(c.id).toBe(ID_HAZAS); expect(c.mundos).toEqual(["exterior"]); expect(c.fases).toEqual({}); expect(c.presupuesto).toEqual({ llamadas: 0, triangulos: 0 });
    expect(c.monta({} as never)).toBe(H);
    expect(HazasPuro.prefijoApi("", "/teselas/x/")).toBe("/api/");
  });
});

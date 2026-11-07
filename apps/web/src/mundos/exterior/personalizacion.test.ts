// La personalización de los árboles (A3-7b2, MU5-n; antes 42_personalizacion.js). La lógica (lista blanca, nombrar, subir, decorar, denunciar, los rótulos) la prueba
// pruebas/guardianes/personalizacion.test.js; aquí, el ciclo de vida con el registro de componentes de verdad y un DOM de mentira: libera() CANCELA las peticiones en vuelo
// (AbortController), quita el complemento de la ficha, la capa de rótulos y window.__personaliza; L2-08: el ImageBitmap de una foto demasiado grande se cierra aunque no
// se use; L6-12: el recuadro se anuncia con su título. HONESTIDAD: DOM, api y three de mentira; el recuadro con teclado real, en el iPhone y en el Quest, no está probado.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ID_PERSONALIZACION, manifiestoPersonalizacion } from "./personalizacion.ts";
import { busPrueba, montaComponente } from "../../nucleo/prueba-componentes.ts";
import { creaMundo, type Mundo } from "../../nucleo/prueba-dom.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
let m: Mundo | null = null;
afterEach(() => { vi.unstubAllGlobals(); if (m) m.limpia(); m = null; });
const tiempoReal = globalThis.setTimeout;   // creaMundo() cambia setTimeout por un doble que nunca salta
const espera = () => new Promise(r => tiempoReal(r, 5));

const LISTA = { haza_id: 1, es_mia: true, olivos: [{ id: 7, finca: "hituelo", copas_id: 100, nombre: "El abuelo", objeto: null }] };
const J = (estado: number, cuerpo: unknown) => Promise.resolve({ status: estado, json: () => Promise.resolve(cuerpo) });

function monta(fetchDoble: (u: string, op: A) => Promise<unknown>, opc: { gafas?: boolean } = {}) {
  m = creaMundo();
  const llamadas: Array<{ u: string; signal: AbortSignal }> = [], bus = busPrueba(), complementos: A[] = [], quitados = { complemento: 0 };
  vi.stubGlobal("fetch", (u: string, op: A) => { llamadas.push({ u, signal: op.signal }); return fetchDoble(u, op); });
  class V3 { x = 0; y = 0; z = 0; set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; } project() { return this; } }
  const pos: Record<string, { x: number; y: number; z: number }> = { "olivo:hituelo:100": { x: 10, y: 3, z: -10 } };
  const dp = {
    THREE: { Vector3: V3 }, D: { base: "/teselas/hituelo/", finca_id: "hituelo" }, Bus: bus, Laminas: { abre: () => true, cierra: () => true, repinta: () => true },
    Entidades: { complementa: (_t: string, fn: unknown) => { complementos.push(fn); return () => { quitados.complemento++; }; }, pos: (id: string) => pos[id] || null },
    Usables: { refresca() { /* doble */ } }, lienzo: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }, camera: { position: { x: 12, y: 2, z: -10 } }, Estado: { exag: 1 },
    HazasPuro: { prefijoApi: () => "/api/" }, Hazas: { vistas: () => [{ id: 1, es_mia: true }], enPunto: () => ({ id: 1, es_mia: true }) }, VRX: { on: !!opc.gafas },
  };
  const c = montaComponente(manifiestoPersonalizacion(dp as A), bus);
  return { c, llamadas, complementos, quitados, bus, m, api: c.api() as A };
}

describe("la personalización de los árboles", () => {
  it("el componente es del exterior (vive de sus olivos y hazas) y sin api no crea nada", () => {
    expect(manifiestoPersonalizacion({} as A).mundos).toEqual(["exterior"]); expect(manifiestoPersonalizacion({} as A).id).toBe(ID_PERSONALIZACION);
    m = creaMundo();
    const c = montaComponente(manifiestoPersonalizacion({ HazasPuro: { prefijoApi: () => null }, D: { base: "" } } as A));
    expect(c.activo()).toBe(true); expect(() => c.libera()).not.toThrow(); expect(c.errores).toEqual([]);
  });
  it("libera() cancela las peticiones en vuelo y deja la página como estaba", async () => {
    const s = monta(() => new Promise(() => { /* la api no contesta */ }));
    s.api.actualiza("tarde", 0.4); await espera();
    expect(s.llamadas.map(l => l.u).sort()).toEqual(["/api/hazas/1/olivos", "/api/sesion"]);
    expect(s.llamadas.every(l => l.signal.aborted === false)).toBe(true);
    expect(typeof (s.m.ventana as A).__personaliza).toBe("function"); expect(s.complementos).toHaveLength(1);
    s.c.libera();
    expect(s.llamadas.every(l => l.signal.aborted)).toBe(true); expect(s.quitados.complemento).toBe(1);
    expect((s.m.ventana as A).__personaliza).toBeUndefined();
    expect(s.m.relojes()).toBe(0); expect(s.m.observadores()).toBe(0);
    expect(s.bus.oyentes("usable:elige") + s.bus.oyentes("usable:suelta") + s.bus.oyentes("decoraciones:pide")).toBe(0);
  });
  it("L6-12: el recuadro de «Nombrar» se anuncia con su título (aria-labelledby apunta al h2)", async () => {
    const s = monta((u) => (u === "/api/sesion" ? J(200, { titular: true }) : u === "/api/hazas/1/olivos" ? J(200, LISTA) : J(404, null)));
    s.api.actualiza("tarde", 0.4); await espera();
    const f: A = { filas: [] }; s.complementos[0](f, "olivo:hituelo:100", "pantalla");
    const nombrar = f.acciones.find((a: A) => a.id === "nombrar"); expect(nombrar).toBeTruthy();
    nombrar.fn();
    const dialogo = s.m.documento.getElementById("personalizaPanel"); expect(dialogo).toBeTruthy();
    const h2 = dialogo.querySelector("h2");
    expect(h2.textContent).toBe("Nombrar este olivo"); expect(dialogo.getAttribute("aria-labelledby")).toBe(h2.getAttribute("id"));
    s.c.libera();
    expect(s.m.documento.getElementById("personalizaPanel")).toBeNull();
  });
  it("L2-08: el ImageBitmap de una foto demasiado grande se cierra aunque no se use", async () => {
    const cerrar = vi.fn();
    vi.stubGlobal("createImageBitmap", () => Promise.resolve({ width: 9000, height: 9000, close: cerrar }));
    const s = monta((u) => (u === "/api/sesion" ? J(200, { titular: true }) : u === "/api/hazas/1/olivos" ? J(200, LISTA) : J(404, null)));
    s.api.actualiza("tarde", 0.4); await espera();
    const f: A = { filas: [] }; s.complementos[0](f, "olivo:hituelo:100", "pantalla");
    f.acciones.find((a: A) => a.id === "foto").fn();
    const dialogo = s.m.documento.getElementById("personalizaPanel");
    const archivo = dialogo.querySelector("input"), acepta = dialogo.querySelector("[data-acepta]"), ok = dialogo.querySelector("[data-ok]");
    archivo.files = [{ type: "image/jpeg", size: 1000 }]; acepta.checked = true; ok.disabled = false;
    ok.click(); await espera();
    expect(cerrar).toHaveBeenCalledTimes(1);   // 9000 × 9000 px pasa de los 40 Mpx: no se usa, pero se cierra
    expect(dialogo.querySelector("[data-msg]").textContent).toMatch(/No se ha podido leer esa imagen/);
    s.c.libera();
  });
});

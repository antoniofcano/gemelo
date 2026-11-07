// La memoria de lo social, los juegos y la oficina del exterior (A3-7b2, MU5-n): la personalización de los árboles, el mundo en modo oficina, el anfitrión de juegos y «Cae la cosecha»
// montados juntos en un mismo registro de componentes (el del núcleo, de verdad) con three de verdad (sin GPU), con una petición de cada uno en vuelo y una partida abierta, y luego
// liberados como los liberaría el último mundo vivo. A3-8b: de la oficina, aquí solo sus balizas oficiales («oficina-balizas», del exterior; la oficina, de todo mundo, vive en ui/ y
// este paquete no puede importarla: va con un doble de lo que expone, OficinaMundo, y juntas las prueba src/oficina-mundo.test.ts). Tras liberar: las peticiones canceladas, la escena
// vacía, los materiales de la fábrica a cero (la fábrica no guarda nada de «oficina-balizas»), la pausa devuelta al mundo y ni relojes, observadores ni escuchas en la ventana, el documento o el Bus. HONESTIDAD: DOM, red y api de mentira; en el navegador,
// la prueba de «con y sin» (renderer.info.memory) va por el banco.
// @ts-expect-error three no trae tipos en el repo (MUNDOS §9.1): aquí se usa de verdad, sin GPU, solo para geometrías y materiales
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { manifiestoCaeLaCosecha } from "./cae-la-cosecha.ts";
import { manifiestoJuegos } from "./juegos.ts";
import { manifiestoOficinaBalizas } from "./oficina-balizas.ts";
import { manifiestoPersonalizacion } from "./personalizacion.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import { busPrueba, montaComponente } from "../../nucleo/prueba-componentes.ts";
import { creaMundo, type Mundo } from "../../nucleo/prueba-dom.ts";
import type { Manifiesto } from "../../nucleo/componentes.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
let m: Mundo | null = null;
afterEach(() => { vi.unstubAllGlobals(); if (m) m.limpia(); m = null; });
const tiempoReal = globalThis.setTimeout;
const espera = () => new Promise(r => tiempoReal(r, 5));
const vivasEn = (nodos: Array<{ _escuchas: Record<string, unknown[]> }>) => nodos.reduce((s, n) => s + Object.values(n._escuchas).reduce((a, l) => a + l.length, 0), 0);
const dobleDe = (id: string, expone: string, api: object): Manifiesto => ({ id, version: 1, consume: [], expone: [expone], eventos: {}, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
  mundos: "todos", monta: () => api, libera: () => { /* doble */ } }) as Manifiesto;
const CENTRO = [500000, 4200000];
const BALIZAS = { finca: "hituelo", srs: "EPSG:25830", balizas: [{ id: 7, finca: "hituelo", x: CENTRO[0]! + 30, y: CENTRO[1]! + 40, titulo: "Aquí se recoge hoy", texto: "Traed agua", hasta: "2030-01-01T10:00:00Z" }] };

describe("lo social, los juegos y la oficina del exterior, montados y liberados", () => {
  it("no dejan relojes, observadores, escuchas, materiales ni nada en la escena, y cancelan lo que estaba en vuelo", async () => {
    m = creaMundo({ busqueda: "?presencia=red" });
    const bus = busPrueba(), senales: AbortSignal[] = [], pausas = new Set<string>();
    // las balizas oficiales contestan (para que haya mallas); lo demás, nadie (peticiones en vuelo)
    vi.stubGlobal("fetch", (u: string, op: { signal: AbortSignal }) => {
      senales.push(op.signal);
      return u.startsWith("/api/balizas-oficiales") ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(BALIZAS) }) : new Promise(() => { /* nadie contesta */ });
    });
    vi.stubGlobal("location", { search: "?presencia=red" });
    const hijos: unknown[] = [], scene = { add: (g: unknown) => { hijos.push(g); }, remove: (g: unknown) => { hijos.splice(hijos.indexOf(g), 1); } };
    const visor = m.el("div"); m.documento.body.appendChild(visor);
    const Materiales = creaMateriales({ THREE: THREE as A, busqueda: "" });
    const Ventanas = { registra: (_id: string, d: { construye(c: unknown): void }) => { const cu = m!.el("div"), cont = m!.el("section"); cont.appendChild(cu); d.construye(cu); return () => { /* doble */ }; }, abierta: () => null, cierra() { /* doble */ } };
    const Hud = { icono: () => () => { /* doble */ }, alterna() { /* doble */ }, aviso() { /* doble */ } }, Laminas = { abre: () => true, cierra: () => true, hay: () => false, repinta() { /* doble */ }, info: () => null };
    const Entidades = { registra: () => () => { /* doble */ }, complementa: () => () => { /* doble */ }, pos: () => null };
    const sala = { escucha: () => () => { /* doble */ } };
    const previos = [dobleDe("red-salas", "Red", { sala: () => sala }), dobleDe("presencia-compartida", "Presencia", { yo: () => ({ oficial: false }), sala: () => "general", mensaje() { /* doble */ } }),
      // A3-8b: lo que la oficina (ui/oficina-mundo.ts) expone a sus balizas: pedir a la api con la cancelación de quien pide, avisar y lo puro que usan (un doble mínimo)
      dobleDe("oficina-mundo", "OficinaMundo", { hayApi: () => true, soyOficina: () => false, limpia: (t: string) => t, avisa() { /* doble */ },
        pideCon: (senal: AbortSignal) => (metodo: string, ruta: string) => (fetch as A)("/api/" + ruta, { method: metodo, signal: senal }).then((r: A) => r.json()),
        Puro: { BALIZAS_MAX: 20, leeBalizas: (j: A) => j.balizas.map((b: A) => ({ id: b.id, x: b.x - CENTRO[0]!, y: b.y - CENTRO[1]!, titulo: b.titulo, texto: b.texto, hasta: Date.parse(b.hasta) })) } }),
      manifiestoCaeLaCosecha({ Bus: bus }),
      manifiestoJuegos({ D: { base: "/teselas/x/", finca_id: "finca-x" }, Pausa: { pon: (k: string) => { pausas.add(k); return true; }, quita: (k: string) => { pausas.delete(k); }, activa: () => pausas.size > 0 },
        ConfigPuro: { prefijoApi: () => "/api/" }, Config: { tablaEpocas: () => null }, Teclas: { registra: () => () => { /* doble */ } }, Laminas, Hud, Ventanas, VRX: { on: false }, PanelVR: undefined } as A),
      manifiestoPersonalizacion({ THREE, D: { base: "/teselas/hituelo/", finca_id: "hituelo" }, Bus: bus, Laminas, Entidades, Usables: { refresca() { /* doble */ } },
        lienzo: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }, camera: { position: new THREE.Vector3() }, Estado: { exag: 1 }, HazasPuro: { prefijoApi: () => "/api/" },
        Hazas: { vistas: () => [{ id: 1, es_mia: true }], enPunto: () => null }, VRX: { on: false } } as A)];
    const c = montaComponente(manifiestoOficinaBalizas({ THREE, D: { base: "/teselas/hituelo/", finca_id: "hituelo", centro_utm: CENTRO }, suelo: () => 10, Componentes: null, Laminas, Entidades,
      Estaticos: { congela() { /* doble */ } }, Materiales, visor, scene, camera: { position: new THREE.Vector3() }, Estado: { exag: 1 }, objetivo: new THREE.Vector3(), pp: { x: 0, y: 0 }, Llegada: { ve: () => true },
      HazasPuro: { prefijoApi: () => "/api/" }, Minimapa: { capa: () => () => { /* doble */ } }, Aspecto: { CHALECO: 1, INSIGNIA: 2 }, Chat: { limpia: (t: string) => t }, Encuentro: { BALIZA: 1 }, sitioJunto: () => ({}),
      Hud, Ventanas, VRX: { on: false }, paseando: true, enQuad: false } as A), bus, previos);
    await espera();
    (c.C.api("personalizacion") as A).actualiza("tarde", 0.4);
    (c.C.api("juegos") as A).abre("cae-la-cosecha"); await espera();
    expect(c.C.resumen().filter(f => f.activo).map(f => f.id).sort()).toEqual(["cae-la-cosecha", "juegos", "oficina-balizas", "oficina-mundo", "personalizacion", "presencia-compartida", "red-salas"]);
    expect(senales.length).toBeGreaterThanOrEqual(3); expect(hijos).toHaveLength(1); expect(Materiales.duenos()["oficina-balizas"]).toBe(2); expect(pausas.size).toBe(1);
    c.libera();
    expect(c.C.resumen().filter(f => f.activo)).toEqual([]);
    expect(senales.every(s => s.aborted)).toBe(true); expect(hijos).toHaveLength(0); expect(Object.keys(Materiales.duenos())).toEqual([]); expect(pausas.size).toBe(0);
    expect(m.relojes()).toBe(0); expect(m.observadores()).toBe(0); expect(vivasEn([m.ventana, m.documento])).toBe(0);
    expect(bus.oyentes("juego:ofrece") + bus.oyentes("juego:pide") + bus.oyentes("usable:elige") + bus.oyentes("decoraciones:pide") + bus.oyentes("vr:entra")).toBe(0);
    for (const k of ["__juegos", "__personaliza"]) expect((m.ventana as A)[k], k).toBeUndefined();
    expect(c.errores).toEqual([]);
  });
});

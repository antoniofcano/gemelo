// El mundo en modo oficina (A3-7b2, MU5-n; antes 39_oficina_mundo.js). La lógica (los tres temas solo de la api, el panel, las balizas, el anuncio, la invitación) la prueba
// pruebas/guardianes/oficina_mundo.test.js; aquí, el ciclo de vida con el registro de componentes de verdad, un DOM de mentira y three de verdad (sin GPU): libera() CANCELA las
// peticiones en vuelo (AbortController), suelta las mallas de las balizas (geometría y material) y lo que colgó de la escena, y quita el tipo de Entidades, la capa del minimapa y
// window.__oficinaMundo; y el hallazgo propio: mover una baliza sin el panel abierto (en VR) avisa por Hud.aviso en lugar de saltar un TypeError.
// HONESTIDAD: sala, presencia, api y DOM de mentira; el panel y las láminas en el iPhone y en el Quest, no están probados.
// @ts-expect-error three no trae tipos en el repo (MUNDOS §9.1): aquí se usa de verdad, sin GPU, solo para geometrías y materiales
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ID_OFICINA_MUNDO, manifiestoOficinaMundo } from "./oficina-mundo.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import { busPrueba, montaComponente } from "../../nucleo/prueba-componentes.ts";
import { creaMundo, type Mundo } from "../../nucleo/prueba-dom.ts";
import type { Manifiesto } from "../../nucleo/componentes.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
let m: Mundo | null = null;
afterEach(() => { vi.unstubAllGlobals(); if (m) m.limpia(); m = null; });
const tiempoReal = globalThis.setTimeout;   // creaMundo() cambia setTimeout por un doble que nunca salta
const espera = () => new Promise(r => tiempoReal(r, 5));

const CENTRO = [500000, 4200000];
const BALIZAS = { finca: "hituelo", srs: "EPSG:25830", balizas: [{ id: 7, finca: "hituelo", x: CENTRO[0]! + 30, y: CENTRO[1]! + 40, titulo: "Aquí se recoge hoy", texto: "Traed agua", hasta: "2030-01-01T10:00:00Z" }] };
const J = (estado: number, cuerpo: unknown) => Promise.resolve({ ok: estado < 300, status: estado, json: () => (cuerpo === undefined ? Promise.reject(new Error("vacío")) : Promise.resolve(cuerpo)) });
const dobleDe = (id: string, expone: string, api: object): Manifiesto => ({ id, version: 1, consume: [], expone: [expone], eventos: {}, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
  mundos: "todos", monta: () => api, libera: () => { /* doble */ } }) as Manifiesto;

function monta(fetchDoble: (u: string, op: A) => Promise<unknown>, opc: { oficina?: boolean; gafas?: boolean } = {}) {
  m = creaMundo();
  const llamadas: Array<{ u: string; metodo: string; signal: AbortSignal }> = [], bus = busPrueba();
  vi.stubGlobal("fetch", (u: string, op: A) => { llamadas.push({ u, metodo: op.method, signal: op.signal }); return fetchDoble(u, op); });
  vi.stubGlobal("location", { search: "?presencia=red" });
  const tipos: Record<string, A> = {}, cuenta = { escena: 0, capas: 0, avisos: [] as string[], quitados: [] as string[] };
  const grupos: A[] = [];
  const scene = { add: (g: A) => { cuenta.escena++; grupos.push(g); }, remove: () => { cuenta.escena--; } };
  const visor = m.el("div"); m.documento.body.appendChild(visor);
  const dp = {
    THREE, D: { base: "/teselas/hituelo/", finca_id: "hituelo", centro_utm: CENTRO }, suelo: () => 10, Componentes: null, Laminas: { abre: () => true, cierra: () => true, hay: () => false },
    Entidades: { registra: (d: A) => { tipos[d.tipo] = d; return () => { cuenta.quitados.push(d.tipo); delete tipos[d.tipo]; }; } },
    Estaticos: { congela() { /* doble */ } }, Materiales: creaMateriales({ THREE: THREE as A, busqueda: "" }), visor, scene, camera: { position: new THREE.Vector3(0, 20, 0) }, Estado: { exag: 1 }, objetivo: new THREE.Vector3(50, 0, -50), pp: { x: 50, y: 60 },
    Llegada: { ve: () => true }, HazasPuro: { prefijoApi: () => "/api/" }, Minimapa: { capa: () => { cuenta.capas++; return () => { cuenta.capas--; }; } },
    Aspecto: { CHALECO: 0x5b6b00, INSIGNIA: 0xf4ecc2 }, Chat: { limpia: (t: string) => (String(t).trim() || null) }, Encuentro: { BALIZA: 1 }, sitioJunto: () => ({ x: 0, y: 0, ang: 0 }),
    Hud: { icono: () => () => { /* doble */ }, aviso: (t: string) => { cuenta.avisos.push(t); } }, Ventanas: { registra: () => null }, VRX: { on: !!opc.gafas, cab: new THREE.Vector3() }, paseando: true, enQuad: false,
  };
  const sala = { escucha: () => () => { /* sin temas */ } };
  const previos = [dobleDe("red-salas", "Red", { sala: () => sala }),
    dobleDe("presencia-compartida", "Presencia", { yo: () => ({ oficial: opc.oficina !== false }), sala: () => "general", mensaje() { /* doble */ }, cambiaSala: () => Promise.resolve(true) })];
  const c = montaComponente(manifiestoOficinaMundo(dp as A), bus, previos);
  return { dp, c, llamadas, tipos, cuenta, grupos, bus, m, visor, api: c.api() as A };
}

describe("el mundo en modo oficina", () => {
  it("el componente es del exterior (las balizas son de su escena, su suelo y su minimapa)", () => {
    expect(manifiestoOficinaMundo({} as A).mundos).toEqual(["exterior"]); expect(manifiestoOficinaMundo({} as A).id).toBe(ID_OFICINA_MUNDO);
  });
  it("libera() cancela la petición en vuelo y deja la escena y la página como estaban", async () => {
    const s = monta((u) => (u.startsWith("/api/balizas-oficiales") ? J(200, BALIZAS) : J(404, { mensaje: "no" })));
    await espera();
    expect(s.llamadas.map(l => l.u)).toEqual(["/api/balizas-oficiales?finca=hituelo"]);
    expect(s.cuenta.escena).toBe(1); expect(s.tipos["baliza-oficial"]).toBeTruthy(); expect(s.cuenta.capas).toBe(1); expect(typeof (s.m.ventana as A).__oficinaMundo).toBe("function");
    const g = s.grupos[0], mallas = g.children as A[], libres = { geo: 0, mat: 0 };
    mallas.forEach(x => { const gd = x.geometry.dispose.bind(x.geometry), md = x.material.dispose.bind(x.material); x.geometry.dispose = () => { libres.geo++; gd(); }; x.material.dispose = () => { libres.mat++; md(); }; });
    expect(s.dp.Materiales.duenos()["oficina-mundo"]).toBe(2);   // A3-7b2: los dos materiales (columna y bandera) son de la fábrica
    s.c.libera();
    expect(s.dp.Materiales.duenos()["oficina-mundo"]).toBeUndefined();
    expect(s.cuenta.escena).toBe(0); expect(s.cuenta.quitados).toEqual(["baliza-oficial"]); expect(s.cuenta.capas).toBe(0); expect((s.m.ventana as A).__oficinaMundo).toBeUndefined();
    expect(libres.geo).toBe(2); expect(libres.mat).toBe(2);
    expect(s.m.relojes()).toBe(0); expect(s.m.observadores()).toBe(0);
  });
  it("libera() cancela lo que esté en vuelo (la petición de las balizas, retenida)", async () => {
    const s = monta(() => new Promise(() => { /* la api no contesta */ }));
    await espera();
    expect(s.llamadas).toHaveLength(1); expect(s.llamadas[0]!.signal.aborted).toBe(false);
    s.c.libera();
    expect(s.llamadas[0]!.signal.aborted).toBe(true);
  });
  it("hallazgo propio: mover una baliza sin el panel abierto (en VR) avisa por Hud.aviso, no salta un TypeError, y refresca", async () => {
    const s = monta((u, op) => (u.startsWith("/api/balizas-oficiales") ? J(200, BALIZAS) : op.method === "PUT" ? J(200, { id: 7 }) : J(404, { mensaje: "no" })), { gafas: true });
    await espera();
    const ficha = s.tipos["baliza-oficial"].ficha("baliza-oficial:7", "vr");
    const mover = ficha.acciones.find((a: A) => a.id === "omv"); expect(mover).toBeTruthy();
    const antes = s.llamadas.length;
    expect(await mover.fn()).toBe(true);   // refresca() devuelve true; antes, el TypeError dejaba la promesa rechazada
    expect(s.cuenta.avisos).toEqual(["Baliza movida."]);
    expect(s.llamadas.slice(antes).map(l => l.metodo + " " + l.u)).toEqual(["PUT /api/admin/balizas/7", "GET /api/balizas-oficiales?finca=hituelo"]);
    s.c.libera();
  });
});

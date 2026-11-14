// El mundo interior genérico (eje B) con dobles: carga (ruta por perfil, manifiesto, glb, texturas por la Cola), entra/sale, puertas, Ambiente y
// liberación (la memoria de GPU vuelve a cero: geometrías, materiales y texturas, como vigila renderer.info.memory en el navegador).
import { describe, expect, it } from "vitest";
import catalogo from "../../../../../contratos/eventos.json";
import { creaCola, creaColaDeMundo } from "../../nucleo/cola.ts";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import type { ContextoBase, IdMundo, Pose2, Puerta } from "../../nucleo/mundos.ts";
import { creaInterior, FONDO_INTERIOR } from "./index.ts";
import { cableaInteriores, mundoDeUrl, RUTA_BASIS, urlConMundo } from "./cableado.ts";
import { InteriorPuro } from "./puro.ts";
import type { DepsInterior, Material3D, Nodo3D, Textura3D } from "./index.ts";
import type { MundoInterior } from "../../datos/contratos/mundo-interior.ts";

/** el código del mundo interior, sin las pruebas (Vite: import.meta.glob ?raw) */
const fuentes = import.meta.glob(["./*.ts", "!./*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
/** el arranque, para ver qué import() escribe (v1.3: los decodificadores) */
const fuentesArranque = (): string => Object.values(import.meta.glob("../../arranque.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>)[0]!;

const MAN: MundoInterior = {
  v: 1, id: "patios", nombre: "Patios (sintético)", fuente: "ilustrativo", licencia: { spdx: "CC0-1.0", autor: "prueba", atribucion: "" }, glb: "patios.glb", unidades: "m", arriba: "+Y",
  zonas: [{ id: "sur", anillo: [[-3, 0], [3, 0], [3, -20], [-3, -20]], y: -0.1 }],
  puertas: [
    { id: "principal", a: "exterior", pos: [0, 0, 0], rumbo: 0, ancho: 6, alto: 2.8, llegada: { pos: [0, -0.1, -1.7], rumbo: 180 } },
    { id: "fabrica", a: "fabrica", pos: [3.2, -0.1, -15], rumbo: 90, ancho: 1, alto: 2.3, llegada: { pos: [1.5, -0.1, -15], rumbo: 270 } },
    { id: "verja", a: "vivienda", pos: [-3.2, -0.1, -5], rumbo: 270, ancho: 2, alto: 2, llegada: { pos: [-1.5, -0.1, -5], rumbo: 90 } },
  ],
};

/** una escena de glb falsa: tres mallas (una sin luz, unas hojas con COLOR_0 y recorte, un vidrio con luz), dos texturas compartidas */
function glbFalso() {
  const cuenta = { geo: 0, mat: 0, tex: 0, cerrados: 0 };
  const tex = (): Textura3D => ({ isTexture: true, dispose() { cuenta.tex++; }, image: { close() { cuenta.cerrados++; } } });
  const atlas = tex(), muros = tex();
  const mat = (o: Partial<Material3D>): Material3D => ({ toneMapped: true, ...o, dispose() { cuenta.mat++; } });
  const geo = (n: number) => ({ index: { count: n * 3 }, dispose() { cuenta.geo++; } });
  const mallas: Nodo3D[] = [
    { isMesh: true, geometry: geo(1000), material: mat({ isMeshBasicMaterial: true, map: muros }), traverse() {} },
    { isMesh: true, geometry: geo(500), material: mat({ isMeshBasicMaterial: true, map: atlas, vertexColors: true, alphaTest: 0.5 }), traverse() {} },
    { isMesh: true, geometry: geo(10), material: mat({ transparent: true }), traverse() {} },
  ];
  const escena: Nodo3D = { traverse(fn) { fn(escena); for (const m of mallas) fn(m); } };
  return { escena, mallas, cuenta };
}

function banco(o: { manifiesto?: unknown; glbStatus?: number; vr?: boolean; clase?: string; existe?: (a: string) => boolean } = {}) {
  const pedidas: string[] = [], colgados: Nodo3D[] = [], avisos: string[] = [], cruces: Array<{ a: IdMundo; puerta: Puerta }> = [], subidas: Textura3D[] = [];
  const g = glbFalso();
  const pp: Pose2 = { x: 99, y: 99, ang: 0 };
  let entradas = 0, salidas = 0;
  const deps: DepsInterior = {
    id: "patios", base: "/teselas/hituelo/", vr: () => !!o.vr, clase: () => o.clase || "escritorio",
    descarga: async (url) => {
      pedidas.push(url);
      if (url.endsWith("mundo.json")) return { ok: true, status: 200, json: async () => (o.manifiesto === undefined ? JSON.parse(JSON.stringify(MAN)) : o.manifiesto), arrayBuffer: async () => new ArrayBuffer(0) };
      const st = o.glbStatus || 200;
      return { ok: st === 200, status: st, json: async () => null, arrayBuffer: async () => new ArrayBuffer(8) };
    },
    cargaGltf: async () => ({ GLTFLoader: class { async parseAsync() { return { scene: g.escena }; } } }),
    escena: { add: x => { colgados.push(x); }, remove: x => { colgados.splice(colgados.indexOf(x), 1); } },
    pose: { lee: () => pp, pon: p => { pp.x = p.x; pp.y = p.y; pp.ang = p.ang; } },
    subeTextura: t => { subidas.push(t); },
    luz: (_t, c, k) => ({ color: c, k, sueltas: 0, dispose() { (this as any).sueltas++; } }),
    existe: o.existe || (a => a === "exterior" || a === "fabrica"),
    cruza: (a, puerta) => { cruces.push({ a, puerta }); },
    aviso: s => { avisos.push(s); },
    alEntrar: () => { entradas++; }, alSalir: () => { salidas++; },
  };
  const cola = creaCola({ ahora: () => 0 }), ctrl = new AbortController();
  const ctx: ContextoBase = { id: "patios", senal: ctrl.signal, cola: creaColaDeMundo(cola, "patios"), limpia() {} };
  const w = creaInterior(deps);
  /** carga() y, mientras, la Cola corre como en el bucle */
  async function carga(): Promise<void> {
    const p = w.carga(ctx); let hecho = false, err: unknown = null;
    p.then(() => { hecho = true; }, e => { hecho = true; err = e; });
    for (let i = 0; i < 50 && !hecho; i++) { await new Promise(r => setTimeout(r, 0)); cola.corre(10); }
    if (err) throw err;
    if (!hecho) throw new Error("la carga no terminó");
  }
  return { w, deps, pp, pedidas, colgados, avisos, cruces, subidas, g, cola, ctrl, ctx, carga, entradas: () => entradas, salidas: () => salidas };
}

describe("creaInterior: carga", () => {
  it("pide <base><id>/pantalla/ en escritorio: mundo.json y su glb; los «sin luz» salen del tone mapping; cuenta lo que dibuja; sube las texturas por la Cola", async () => {
    const b = banco();
    await b.carga();
    expect(b.pedidas).toEqual(["/teselas/hituelo/patios/pantalla/mundo.json", "/teselas/hituelo/patios/pantalla/patios.glb"]);
    const e = b.w.estado();
    expect(e).toMatchObject({ id: "patios", perfil: "pantalla", triangulos: 1510, llamadas: 3, materiales: 3, texturas: 2, sinLuz: 2, conColor: 1, recorte: 1, colgado: false, liberado: false, nombre: "Patios (sintético)", fuente: "ilustrativo" });
    expect(b.g.mallas.map(m => (m.material as Material3D).toneMapped)).toEqual([false, false, true]);
    expect(b.subidas.length).toBe(2);
    expect(b.colgados).toEqual([]);   // carga() no toca la escena
    expect(b.w.alSalir).toBe("libera"); expect(b.w.marco).toBe("local"); expect(b.w.sala).toBeNull();
  });
  it("en VR o en unas gafas pide la carpeta «quest»", async () => {
    for (const o of [{ vr: true }, { clase: "quest" }]) {
      const b = banco(o); await b.carga();
      expect(b.pedidas[0]).toBe("/teselas/hituelo/patios/quest/mundo.json"); expect(b.w.estado().perfil).toBe("quest");
    }
  });
  it("falla (y el gestor vuelve al mundo de antes) si el manifiesto no cumple el contrato, si es de otro mundo, si el glb no está o si se cancela", async () => {
    await expect(banco({ manifiesto: { ...MAN, v: 2 } }).carga()).rejects.toThrow(/contrato mundo-interior v1/);
    await expect(banco({ manifiesto: { ...MAN, id: "fabrica" } }).carga()).rejects.toThrow(/se pidió «patios»/);
    await expect(banco({ glbStatus: 404 }).carga()).rejects.toThrow(/patios\.glb dio 404/);
    const b = banco(); const p = b.w.carga(b.ctx); b.ctrl.abort();
    await expect(p).rejects.toThrow(/cancelada/);
  });
  it("precarga() (eje B): baja y lee el glb sin tocar la GPU; carga() lo aprovecha (no lo vuelve a pedir) y solo sube las texturas", async () => {
    const b = banco();
    await b.w.precarga!(b.ctx);
    expect(b.pedidas.length).toBe(2); expect(b.subidas.length).toBe(0); expect(b.w.estado().precargado).toBe(true); expect(b.colgados).toEqual([]);
    await b.carga();
    expect(b.pedidas.length).toBe(2); expect(b.subidas.length).toBe(2); expect(b.w.estado()).toMatchObject({ precargado: false, triangulos: 1510 });
  });
  it("si entre la precarga y la carga se entra en la VR, lo precargado se suelta y se pide la carpeta «quest»; libera() suelta una precarga sin usar", async () => {
    const o = { vr: false }, b = banco(o);
    await b.w.precarga!(b.ctx); o.vr = true;
    await b.carga();
    expect(b.pedidas.slice(2)).toEqual(["/teselas/hituelo/patios/quest/mundo.json", "/teselas/hituelo/patios/quest/patios.glb"]);
    expect(b.g.cuenta.geo).toBe(3);   // la escena de «pantalla», soltada
    const c = banco(); await c.w.precarga!(c.ctx); c.w.libera();
    expect(c.g.cuenta).toEqual({ geo: 3, mat: 3, tex: 2, cerrados: 2 }); expect(c.w.estado().precargado).toBe(false);
  });
});

describe("creaInterior: entrar, andar, puertas y salir", () => {
  it("entra(): cuelga el glb, avisa, y pone a quien mira en la principal (o en la llegada de la puerta que lleva al mundo de donde viene)", async () => {
    const b = banco(); await b.carga();
    b.w.entra(null, null);
    expect(b.colgados).toEqual([b.g.escena]); expect(b.entradas()).toBe(1);
    expect(b.pp.x).toBeCloseTo(0); expect(b.pp.y).toBeCloseTo(1.7); expect(b.pp.ang).toBeCloseTo(0);
    expect(b.avisos[0]).toBe("Patios (sintético) · ilustrativo · luz horneada, ilustrativa");
    expect(b.w.sale()).toEqual({ x: b.pp.x, y: b.pp.y, ang: b.pp.ang }); expect(b.colgados).toEqual([]); expect(b.salidas()).toBe(1);
    const desdeFabrica: Puerta = { id: "x", de: "fabrica", a: "patios", pos: { x: 0, y: 0 }, radio: 0.6, histeresis: 0.8 };
    b.w.entra(desdeFabrica, { x: 7, y: 7, ang: 0 });   // por una puerta manda su llegada, no el retorno
    expect(b.pp.x).toBeCloseTo(1.5); expect(b.pp.y).toBeCloseTo(15);
    b.w.sale();
    b.w.entra(null, { x: 1, y: 8, ang: 0.3 });   // sin puerta (una vuelta atrás): donde se dejó
    expect(b.pp).toMatchObject({ x: 1, y: 8, ang: 0.3 });
    b.w.sale();
    b.w.entra(null, { x: 2.9, y: 15, ang: 1.5 });   // se dejó en el umbral de la puerta de la fábrica: a su llegada, dentro y mirando hacia dentro
    expect(b.pp.x).toBeCloseTo(1.5); expect(b.pp.y).toBeCloseTo(15); expect(b.pp.ang).toBeCloseTo(-Math.PI / 2);
    b.w.sale();
    // eje B: la puerta del exterior trae la llegada de la puerta del interior por la que se entra (la conoce por el anclaje)
    b.w.entra({ id: "y", de: "exterior", a: "patios", pos: { x: 0, y: 0 }, radio: 1, histeresis: 1, llegada: { x: 1.5, y: 5, ang: 1 } }, null);
    expect(b.pp).toMatchObject({ x: 1.5, y: 5, ang: 1 });
  });
  it("suelo, dentro y obstaculo son los de sus zonas; antes de cargar, nadie está dentro", async () => {
    const b = banco();
    expect(b.w.dentro(0, 5)).toBe(false); expect(b.w.suelo(0, 5)).toBe(0); expect(b.w.obstaculo(9, 9, 0.5)).toBeNull();
    await b.carga();
    expect(b.w.dentro(0, 5)).toBe(true); expect(b.w.suelo(0, 5)).toBe(-0.1);
    const o = b.w.obstaculo(5, 5, 0.55); expect(o!.x).toBeCloseTo(3, 1);
  });
  it("acercarse a una puerta a un mundo registrado la cruza (gm.cambia con la puerta, de «patios»); a uno que no existe, queda inerte y lo dice una vez", async () => {
    const b = banco(); await b.carga(); b.w.entra(null, null);
    b.w.actualiza(0.016, 0); expect(b.cruces).toEqual([]);
    b.pp.x = 2.8; b.pp.y = 15; b.w.actualiza(0.016, 0);
    expect(b.cruces.length).toBe(1); expect(b.cruces[0]!.a).toBe("fabrica");
    expect(b.cruces[0]!.puerta).toMatchObject({ de: "patios", a: "fabrica", pos: { x: 3.2, y: 15 } }); expect(b.cruces[0]!.puerta.llegada).toBeUndefined();
    b.pp.x = -2.9; b.pp.y = 5; b.w.actualiza(0.016, 0); b.w.actualiza(0.016, 0);
    expect(b.cruces.length).toBe(1);
    expect(b.avisos.filter(a => /vivienda/.test(a))).toEqual(["Esta puerta lleva a «vivienda», que aún no está en el gemelo"]);
    b.pp.x = 0; b.pp.y = 1.8; b.w.actualiza(0.016, 0);   // la principal, armada desde la llegada: al exterior
    b.pp.x = 0; b.pp.y = 0.2; b.w.actualiza(0.016, 0);
    expect(b.cruces.map(c => c.a)).toEqual(["fabrica", "exterior"]);
  });
  it("su Ambiente es de interior: sin cielo ni niebla, su fondo, una luz ambiental (la misma en cada visita), near/far de interior y exag 1", async () => {
    const b = banco(); await b.carga();
    const a = b.w.ambiente();
    expect(a).toMatchObject({ cielo: "ninguno", fondo: FONDO_INTERIOR, niebla: null, camara: { near: 0.05, far: 250 }, exag: 1 });
    expect(a.luces.length).toBe(1); expect(b.w.ambiente().luces[0]).toBe(a.luces[0]);
    expect(b.w.presupuesto({ clase: "vr", nivel: 1 }).triangulos).toBe(300000); expect(b.w.presupuesto({ clase: "pantalla" }).triangulos).toBe(1000000);
  });
});

describe("creaInterior: libera()", () => {
  it("suelta TODO lo de la GPU (cada geometría, material y textura una vez; cierra los ImageBitmap) y su luz; se puede llamar dos veces; vuelve a cargar", async () => {
    const b = banco(); await b.carga(); const luz = b.w.ambiente().luces[0] as any;
    b.w.entra(null, null);
    b.w.libera(); b.w.libera();
    expect(b.colgados).toEqual([]);
    expect(b.g.cuenta).toEqual({ geo: 3, mat: 3, tex: 2, cerrados: 2 });
    expect(luz.sueltas).toBe(1);
    expect(b.w.estado()).toMatchObject({ liberado: true, colgado: false });
    expect(b.w.dentro(0, 5)).toBe(false);
    expect(() => b.w.entra(null, null)).toThrow(/sin carga/);
    await b.carga(); expect(b.w.estado().liberado).toBe(false); expect(b.w.ambiente().luces.length).toBe(1);
  });
});

describe("guardianes del interior (MUNDOS §8; regla 13)", () => {
  it("«mundo:entra» y «mundo:sale» (contratos/eventos.json) nombran exactamente los mundos de IdMundo (ComponentesPuro.MUNDOS), con patios y fábrica", () => {
    const ev = (catalogo as any).eventos;
    for (const nombre of ["mundo:entra", "mundo:sale"]) {
      const pr = ev[nombre].datos.properties;
      for (const k of ["id", "desde", "hacia"]) expect(pr[k].enum.filter((x: unknown) => x !== null), nombre + "." + k).toEqual([...ComponentesPuro.MUNDOS]);
    }
    expect(ComponentesPuro.MUNDOS).toContain("patios"); expect(ComponentesPuro.MUNDOS).toContain("fabrica");
  });
  it("interiores sin sombreadores propios: el mundo interior no escribe onBeforeCompile, ShaderMaterial, RawShaderMaterial ni NodeMaterial (ADR-0033 §5)", () => {
    expect(Object.keys(fuentes).sort()).toEqual(["./cableado.ts", "./index.ts", "./maquinas-puro.ts", "./maquinas.ts", "./porton.ts", "./puro.ts", "./visita-puro.ts", "./visita.ts", "./voz-puro.ts", "./voz.ts"]);
    for (const [f, txt] of Object.entries(fuentes)) expect(txt.replace(/\/\/.*$/gm, ""), f).not.toMatch(/onBeforeCompile|ShaderMaterial|RawShaderMaterial|NodeMaterial/);
  });
});

describe("cableaInteriores (90_final)", () => {
  function cable(vr = false) {
    const registrados: Array<[string, () => Promise<unknown>]> = [], cambios: unknown[][] = [], avisos: string[] = [], aparece: number[][] = [];
    let pedidos = 0, resultado: any = { ok: true };
    const Paseo = { E: { paseando: false, primera: false }, entraPaseo() { this.E.paseando = true; TR.act = true; } }, TR = { act: false };
    const pp = { x: 0, y: 0, ang: 0 }, ventana: any = { fetch: async () => ({ ok: false, status: 404 }) };
    const I = cableaInteriores({
      gm: { registra: (def, id) => { registrados.push([id, def]); }, cambia: async (...a: unknown[]) => { cambios.push(a); return resultado; }, fichaDe: id => (id === "fabrica" || id === "patios" ? "sin_cargar" : "sin_registrar") },
      ids: ["patios", "fabrica"], D: { base: "/teselas/hituelo/" }, THREE: { AmbientLight: class { c: number; k: number; constructor(c: number, k: number) { this.c = c; this.k = k; } } }, scene: {}, renderer: {},
      Aparato: { clase: () => "escritorio" }, VRX: { on: vr }, vrAparece: (x, y, a) => { aparece.push([x, y, a]); }, pose: { lee: () => pp, pon: p => Object.assign(pp, p) },
      Paseo, TR, Hud: () => ({ aviso: (s: string) => { avisos.push(s); } }),
      modulo: async () => { pedidos++; return { creaInterior }; }, cargaGltf: async () => ({ GLTFLoader: class {} as any }), ventana, consola: null,
    });
    return { I, registrados, cambios, avisos, aparece, Paseo, TR, pp, ventana, pedidos: () => pedidos, pon: (r: unknown) => { resultado = r; } };
  }
  it("?mundo=<id>: el id (vacio, patios, fabrica…); exterior o nada, null", () => {
    expect(mundoDeUrl("?mundo=patios")).toBe("patios"); expect(mundoDeUrl("?debug&mundo=fabrica&x=1")).toBe("fabrica"); expect(mundoDeUrl("?mundo=vacio")).toBe("vacio");
    expect(mundoDeUrl("?mundo=exterior")).toBeNull(); expect(mundoDeUrl("")).toBeNull(); expect(mundoDeUrl("?mundo=../x")).toBeNull(); expect(mundoDeUrl("?nomundo=patios")).toBeNull();
  });
  it("registra los interiores sin descargar nada; el talón pide el módulo y crea el interior con su id; entraPorUrl cambia de mundo y, si no puede, avisa", async () => {
    const c = cable();
    expect(c.registrados.map(r => r[0])).toEqual(["patios", "fabrica"]); expect(c.pedidos()).toBe(0);
    const w: any = await c.registrados[1]![1](); expect(w.id).toBe("fabrica"); expect(c.pedidos()).toBe(1); expect(c.ventana.__interior()).toMatchObject({ id: "fabrica", colgado: false });
    c.I.entraPorUrl("?mundo=patios"); c.I.entraPorUrl("?debug"); await Promise.resolve();
    expect(c.cambios).toEqual([["patios"]]);
    await c.ventana.__cambiaMundo("fabrica"); expect(c.cambios).toEqual([["patios"], ["fabrica"]]);
    c.pon({ ok: false, motivo: "fallo_carga" }); c.I.entraPorUrl("?mundo=patios"); await new Promise(r => setTimeout(r, 0));
    expect(c.avisos).toEqual(["No se ha podido entrar en «patios»"]);
  });
  it("al entrar: paseo en primera persona sin la caída; al salir, la vista de antes. En VR la llegada recoloca el rig. Una puerta que falla avisa (ocupado no)", async () => {
    const c = cable(), d = c.I.deps("patios");
    d.alEntrar!(); expect(c.Paseo.E).toEqual({ paseando: true, primera: true }); expect(c.TR.act).toBe(false);
    d.alSalir!(); expect(c.Paseo.E.primera).toBe(false);
    d.pose!.pon({ x: 1, y: 2, ang: 3 }); expect(c.aparece).toEqual([]);
    const v = cable(true), dv = v.I.deps("fabrica"); dv.pose!.pon({ x: 1, y: 2, ang: 3 }); expect(v.aparece).toEqual([[1, 2, 3]]);
    dv.alEntrar!(); expect(v.Paseo.E.paseando).toBe(false);   // en VR no se entra en el paseo de pantalla
    expect(d.existe("fabrica")).toBe(true); expect(d.existe("vivienda")).toBe(false); expect(d.base).toBe("/teselas/hituelo/");
    c.pon({ ok: false, motivo: "ocupado" }); d.cruza("fabrica", {} as Puerta); await new Promise(r => setTimeout(r, 0)); expect(c.avisos).toEqual([]);
    c.pon({ ok: false, motivo: "tiempo" }); d.cruza("fabrica", {} as Puerta); await new Promise(r => setTimeout(r, 0)); expect(c.avisos).toEqual(["No se ha podido entrar en «fabrica»"]);
  });
  it("la dirección (eje B): cada cambio que sale bien pone ?mundo=<id> con replaceState; volver al exterior lo quita; lo demás se conserva", async () => {
    expect(urlConMundo("https://x.es/gemelo/?debug#a", "patios")).toBe("/gemelo/?debug&mundo=patios#a");
    expect(urlConMundo("https://x.es/?mundo=patios&debug=1", "exterior")).toBe("/?debug=1");
    expect(urlConMundo("https://x.es/?mundo=fabrica", "patios")).toBe("/?mundo=patios"); expect(urlConMundo("https://x.es/?mundo=fabrica", "exterior")).toBe("/");
    expect(urlConMundo("no es una url", "patios")).toBeNull();
    const c = cable(), puestas: string[] = [];
    c.ventana.location = { href: "https://x.es/?debug=1", search: "?debug=1" }; c.ventana.history = { state: null, replaceState: (_s: unknown, _t: string, u: string) => { puestas.push(u); } };
    c.pon({ ok: true, mundo: "patios" }); await c.ventana.__cambiaMundo("patios");
    c.pon({ ok: false, motivo: "fallo_carga", mundo: "exterior" }); await c.ventana.__cambiaMundo("fabrica");
    expect(puestas).toEqual(["/?debug=1&mundo=patios"]);
  });
});

describe("creaInterior: la visita del museo (v1.1)", () => {
  const PARADA = { id: "una", pos: [0, -0.1, -10], radio: 1, ancla: { pos: [0, 1, -12], aprox: true }, ficha: { titulo: "Una", texto: "x", procedencia_visible: "ilustrativo", procedencia_texto: ["sin_fuente"], fuentes: [] } };
  it("con paradas y lo de la UI, entra() la monta y sale() la suelta; sin UI o con paradas rotas, el interior entra sin visita", async () => {
    const filas: string[] = [];
    const ui = { THREE: null, documento: null, PanelVR: { filas: (_p: string, f: { id: string }) => { filas.push(f.id); return () => { filas.splice(filas.indexOf(f.id), 1); }; } } };
    let b = banco({ manifiesto: { ...MAN, paradas: [PARADA] } });
    (b.deps as { visita?: unknown }).visita = ui;
    await b.carga(); b.w.entra(null, null);
    expect(b.w.estado().visita).toMatchObject({ modo: "oferta", paradas: 1 }); expect(filas).toEqual(["visita", "visita-ficha"]);
    b.w.sale();
    expect(b.w.estado().visita).toBeNull(); expect(filas).toEqual([]);
    b = banco({ manifiesto: { ...MAN, paradas: [PARADA] } }); await b.carga(); b.w.entra(null, null);
    expect(b.w.estado().visita).toBeNull();   // sin deps.visita
    b = banco({ manifiesto: { ...MAN, paradas: [{ ...PARADA, pos: [1] }] } });
    (b.deps as { visita?: unknown }).visita = ui;
    await b.carga(); b.w.entra(null, null);
    expect(b.w.estado()).toMatchObject({ colgado: true, visita: null });
  });
});

describe("creaInterior: la luz aparte y las máquinas (v1.2)", () => {
  const SONDA = Array.from({ length: 9 }, (_, i) => [i === 0 ? 1 : 0, i === 0 ? 1 : 0, i === 0 ? 1 : 0]);
  const LUZ = { modo: "mapa", escala: 2, sonda: SONDA };
  const MAQ = [
    { id: "rueda", nodo: "rueda", tipo: "giro", pivote: [0, 1, 0], eje: [0, 0, 1], velocidad: 60, luz: "propia", fuente: "ilustrativo" },
    { id: "correa", nodo: "correa", tipo: "textura", material: "cuero", uv: [0, 1], relacion: { con: "rueda", factor: 0.5 }, luz: "horneada", fuente: "ilustrativo" },
    { id: "piston", nodo: "piston", tipo: "vaiven", pivote: [1, 0, 0], eje: [0, 1, 0], recorrido: 0.3, velocidad: 30, luz: "horneada", fuente: "ilustrativo" },
  ];
  /** un glb leído con su parser: tres unlit (dos con el mismo mapa de luz, uno sin él), uno con luz propia (aoMap) y tres nodos que se mueven */
  function glbLuz() {
    const suelto = { tex: 0, mat: 0, geo: 0 };
    const tex = (): any => ({ isTexture: true, offset: { x: 0.1, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } }, dispose() { suelto.tex++; }, clone() { return tex(); } });
    const mat = (o: Record<string, unknown>): any => ({ toneMapped: true, ...o, dispose() { suelto.mat++; } });
    const A = mat({ isMeshBasicMaterial: true, map: tex() }), B = mat({ isMeshBasicMaterial: true, name: "cuero", map: tex() }), C = mat({ isMeshBasicMaterial: true }), D = mat({ aoMap: tex(), map: tex() });
    const json = { materials: [{ occlusionTexture: { index: 5, texCoord: 1 } }, { occlusionTexture: { index: 5, texCoord: 1 } }, {}, { occlusionTexture: { index: 6, texCoord: 1 } }] };
    const associations = new Map<unknown, { materials?: number }>([[A, { materials: 0 }], [B, { materials: 1 }], [C, { materials: 2 }], [D, { materials: 3 }]]);
    const pedidas: number[] = [];
    const parser = { json, associations, getDependency: async (_t: "texture", i: number) => { pedidas.push(i); return tex(); } };
    const nodo = (name: string, material: any): any => {
      const n: any = {
        name, isMesh: true, geometry: { index: { count: 3 }, dispose() { suelto.geo++; } }, material,
        quaternion: { x: 0, y: 0, z: 0, w: 1, set(x: number, y: number, z: number, w: number) { Object.assign(this, { x, y, z, w }); } },
        position: { x: name === "piston" ? 1 : 0, y: name === "rueda" ? 1 : 0, z: 0, set(x: number, y: number, z: number) { Object.assign(this, { x, y, z }); } },
      };
      n.traverse = (fn: (o: any) => void) => fn(n);
      return n;
    };
    const nodos = [nodo("fijo", A), nodo("correa", B), nodo("otro", C), nodo("rueda", D), nodo("piston", A)];
    const escena: any = { traverse(fn: (o: any) => void) { fn(escena); for (const n of nodos) fn(n); }, getObjectByName: (s: string) => nodos.find(n => n.name === s) };
    return { escena, parser, A, B, C, D, nodos, pedidas, suelto };
  }
  function bancoLuz(extra: Record<string, unknown> = {}, ui?: unknown) {
    const b = banco({ manifiesto: { ...MAN, luz: LUZ, maquinas: MAQ, ...extra } }), g = glbLuz(), entornos: Array<{ sonda: number[]; sueltos: number }> = [];
    (b.deps as any).cargaGltf = async () => ({ GLTFLoader: class { async parseAsync() { return { scene: g.escena, parser: g.parser }; } } });
    (b.deps as any).entorno = (sonda: number[]) => { const e = { sonda, sueltos: 0 }; entornos.push(e); return { textura: { isTexture: true, dispose() {} }, dispose() { e.sueltos++; } }; };
    if (ui) (b.deps as { visita?: unknown }).visita = ui;
    return { b, g, entornos };
  }
  it("luz «mapa»: el occlusionTexture de cada unlit pasa a lightMap (canal 1, sRGB, π × escala; un clon por índice), lo de luz propia sale del tone mapping con el entorno de la sonda, y sin luz ambiental", async () => {
    const { b, g, entornos } = bancoLuz();
    await b.carga();
    expect(g.pedidas).toEqual([5]);   // los dos unlit comparten el mapa: se pide una vez
    expect(g.A.lightMap).toBeDefined(); expect(g.A.lightMap).toBe(g.B.lightMap);
    expect(g.A.lightMap).toMatchObject({ channel: 1, colorSpace: "srgb" });
    expect(g.A.lightMapIntensity).toBeCloseTo(2 * Math.PI, 12);
    expect(g.C.lightMap).toBeUndefined(); expect(g.D.lightMap).toBeUndefined();
    expect([g.A.toneMapped, g.C.toneMapped, g.D.toneMapped]).toEqual([false, false, false]);
    expect(entornos.length).toBe(1); expect(entornos[0]!.sonda.length).toBe(27); expect(g.D.envMap).toBeDefined();
    expect(b.w.estado().luz).toEqual({ modo: "mapa", mapas: 2, propia: 1, entorno: true });
    b.w.entra(null, null);
    expect(b.w.ambiente().luces).toEqual([]);
    b.w.sale(); b.w.libera();
    expect(entornos[0]!.sueltos).toBe(1); expect(g.D.envMap).toBeNull();
  });
  it("sin luz (v1): ni mapas ni entorno, la luz ambiental de siempre y lo con luz sigue en el tone mapping", async () => {
    const { b, g, entornos } = bancoLuz({ luz: undefined, maquinas: undefined });
    await b.carga();
    expect(g.pedidas).toEqual([]); expect(g.A.lightMap).toBeUndefined(); expect(g.D.toneMapped).toBe(true); expect(entornos).toEqual([]);
    expect(b.w.estado()).toMatchObject({ luz: { modo: "base", mapas: 0, propia: 0, entorno: false }, maquinas: null });
    b.w.entra(null, null); expect(b.w.ambiente().luces.length).toBe(1);
  });
  it("máquinas: arrancan al entrar con rampa (giro por el eje, vaivén por el eje, la textura corre con un clon de su mapa), el interruptor las para, y con «reducir movimiento» entran paradas", async () => {
    const filas: string[] = [];
    const ui = { THREE: null, documento: null, PanelVR: { filas: (_p: string, f: { id: string }) => { filas.push(f.id); return () => { filas.splice(filas.indexOf(f.id), 1); }; } } };
    const { b, g } = bancoLuz({}, ui);
    const mapaCuero = g.B.map;
    await b.carga();
    expect(g.B.map).not.toBe(mapaCuero);   // el clon: no arrastra a otros materiales con el mismo mapa
    b.w.entra(null, null);
    expect(filas).toContain("maquinas");
    expect(b.w.estado().maquinas).toMatchObject({ maquinas: 3, piezas: 3, faltan: [], enMarcha: true, marcha: 0 });
    for (let i = 0; i < 30; i++) b.w.actualiza(0.1, i * 0.1);
    const correa = g.nodos[1], rueda = g.nodos[3], piston = g.nodos[4];
    expect(b.w.estado().maquinas!.marcha).toBe(1);
    expect(Math.hypot(rueda.quaternion.x, rueda.quaternion.y)).toBeLessThan(1e-12);   // gira en torno a Z
    expect(Math.abs(rueda.quaternion.z)).toBeGreaterThan(0);
    expect(rueda.position).toMatchObject({ x: 0, y: 1, z: 0 });   // por su pivote: no se desplaza
    expect(piston.position.x).toBe(1); expect(piston.position.y).toBeGreaterThanOrEqual(0); expect(piston.position.y).toBeLessThanOrEqual(0.3);
    expect(correa.material.map.offset.x).toBeCloseTo(0.1, 12); expect(correa.material.map.offset.y).not.toBe(0);
    b.w.maquinas()!.pon(false);
    for (let i = 0; i < 20; i++) b.w.actualiza(0.1, 0);
    const q = { ...rueda.quaternion }; b.w.actualiza(0.1, 0);
    expect(rueda.quaternion).toMatchObject({ x: q.x, y: q.y, z: q.z, w: q.w });   // parada: nada se mueve
    b.w.sale(); expect(filas).toEqual([]);
    const r = bancoLuz({}); (r.b.deps as any).reducido = () => true;
    await r.b.carga(); r.b.w.entra(null, null);
    expect(r.b.w.estado().maquinas).toMatchObject({ enMarcha: false, interruptor: false });
  });
  it("unas máquinas que el motor no entiende dejan el interior sin máquinas, no sin interior", async () => {
    const { b } = bancoLuz({ maquinas: [{ ...MAQ[0], velocidad: undefined }] });
    await b.carga(); b.w.entra(null, null);
    expect(b.w.estado()).toMatchObject({ colgado: true, maquinas: null });
  });
});

describe("creaInterior: el glb comprimido (v1.3, ADR-0035)", () => {
  /** un glb mínimo: la cabecera y el trozo JSON con esas extensiones (lo único que el motor mira antes de leerlo) */
  function glbCon(usadas: string[]): ArrayBuffer {
    const j = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, extensionsUsed: usadas, extensionsRequired: usadas }));
    const pad = (4 - (j.length % 4)) % 4, n = 20 + j.length + pad, b = new ArrayBuffer(n), dv = new DataView(b);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, n, true); dv.setUint32(12, j.length + pad, true); dv.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(b, 20).set(j); new Uint8Array(b, 20 + j.length, pad).fill(0x20);
    return b;
  }
  /** el banco de siempre con ese glb, un GLTFLoader que apunta lo que le ponen y unos decodificadores que cuentan */
  function conGlb(usadas: string[], o: { sinDecodificadores?: boolean; fallaParse?: boolean } = {}) {
    const b = banco(), cuenta = { meshopt: 0, ktx2: 0, cargadores: 0, sueltos: 0, ruta: "", soporte: null as unknown, ponMeshopt: 0, ponKtx2: 0 };
    const datos = glbCon(usadas), renderer = { soy: "renderer" }, base = b.deps.descarga;
    b.deps.descarga = async (url, i) => (url.endsWith(".glb") ? { ok: true, status: 200, json: async () => null, arrayBuffer: async () => datos } : base(url, i));
    b.deps.cargaGltf = async () => ({ GLTFLoader: class {
      setMeshoptDecoder() { cuenta.ponMeshopt++; return this; }
      setKTX2Loader() { cuenta.ponKtx2++; return this; }
      async parseAsync() { if (o.fallaParse) throw new Error("glb roto"); return { scene: b.g.escena }; }
    } });
    class KTX2Falso {
      constructor() { cuenta.cargadores++; }
      setTranscoderPath(r: string) { cuenta.ruta = r; return this; }
      setWorkerLimit() { return this; }
      detectSupport(r: unknown) { cuenta.soporte = r; return this; }
      dispose() { cuenta.sueltos++; }
    }
    b.deps.decodificadores = o.sinDecodificadores ? null : {
      meshopt: async () => { cuenta.meshopt++; return { MeshoptDecoder: { ready: Promise.resolve() } }; },
      ktx2: async () => { cuenta.ktx2++; return { KTX2Loader: KTX2Falso }; },
      renderer, ruta: "basis/",
    };
    return { ...b, cuenta, renderer };
  }

  it("lee las extensiones del trozo JSON del glb; lo que no es un glb da null", () => {
    expect(InteriorPuro.extensionesGlb(glbCon(["KHR_materials_unlit", "EXT_meshopt_compression"]))).toEqual({ usadas: ["KHR_materials_unlit", "EXT_meshopt_compression"], requeridas: ["KHR_materials_unlit", "EXT_meshopt_compression"] });
    expect(InteriorPuro.extensionesGlb(new ArrayBuffer(8))).toBeNull();
    expect(InteriorPuro.extensionesGlb(new TextEncoder().encode("{\"no\": \"es un glb\", \"de verdad\": 1}").buffer as ArrayBuffer)).toBeNull();
    expect(InteriorPuro.decodificadores(["KHR_texture_basisu"])).toEqual({ meshopt: false, ktx2: true });
  });

  it("un glb sin comprimir no descarga ningún decodificador", async () => {
    const b = conGlb(["KHR_materials_unlit"]);
    await b.carga();
    expect(b.cuenta).toMatchObject({ meshopt: 0, ktx2: 0, cargadores: 0, ponMeshopt: 0, ponKtx2: 0 });
    expect(b.w.estado().comprimido).toMatchObject({ meshopt: false, ktx2: false, cargadoresKtx2: 0 });
  });

  it("con meshopt y KTX2: pide los dos, se los pone al GLTFLoader (KTX2 con el transcodificador del mismo origen y el renderer) y suelta el KTX2Loader al acabar de leer", async () => {
    const b = conGlb(["KHR_materials_unlit", "EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_texture_basisu"]);
    await b.carga();
    expect(b.cuenta).toMatchObject({ meshopt: 1, ktx2: 1, cargadores: 1, sueltos: 1, ruta: "basis/", ponMeshopt: 1, ponKtx2: 1 });
    expect(b.cuenta.soporte).toBe(b.renderer);
    expect(b.w.estado().comprimido).toMatchObject({ meshopt: true, ktx2: true, cargadoresKtx2: 0 });
    b.w.libera();
    expect(b.cuenta.sueltos).toBe(1);
  });

  it("solo meshopt: no crea KTX2Loader", async () => {
    const b = conGlb(["EXT_meshopt_compression"]);
    await b.carga();
    expect(b.cuenta).toMatchObject({ meshopt: 1, ktx2: 0, cargadores: 0, ponMeshopt: 1, ponKtx2: 0 });
  });

  it("si el glb no se puede leer, el KTX2Loader se suelta igual; sin decodificadores, un glb comprimido no entra y lo dice", async () => {
    const roto = conGlb(["KHR_texture_basisu"], { fallaParse: true });
    await expect(roto.carga()).rejects.toThrow(/glb roto/);
    expect(roto.cuenta).toMatchObject({ cargadores: 1, sueltos: 1 });
    expect(roto.w.estado().comprimido.cargadoresKtx2).toBe(0);
    const sin = conGlb(["EXT_meshopt_compression", "KHR_texture_basisu"], { sinDecodificadores: true });
    await expect(sin.carga()).rejects.toThrow(/comprimido \(meshopt, KTX2\).*decodificadores/);
  });

  it("el cableado da los decodificadores con la carpeta «basis/» (la que copia vite.config.js) y el renderer; sin sus import(), ninguno", () => {
    expect(RUTA_BASIS).toBe("basis/");
    const renderer = { soy: "renderer" }, meshopt = async () => ({ MeshoptDecoder: {} }), ktx2 = async () => ({ KTX2Loader: class {} as any });
    const base = { gm: { registra() {}, cambia: async () => ({ ok: true }) as any, fichaDe: () => "sin_registrar" }, ids: ["fabrica"] as IdMundo[], D: { base: "" }, THREE: {}, scene: {}, renderer,
      Aparato: { clase: () => "escritorio" }, VRX: { on: false }, vrAparece() {}, pose: { lee: () => ({ x: 0, y: 0, ang: 0 }), pon() {} }, Paseo: { E: { paseando: false, primera: false }, entraPaseo() {} }, TR: { act: false },
      Hud: () => null, modulo: async () => ({ creaInterior }), cargaGltf: async () => ({ GLTFLoader: class {} as any }), ventana: { fetch: async () => ({ ok: false, status: 404 }) } as any, consola: null };
    expect(cableaInteriores({ ...base, cargaMeshopt: meshopt, cargaKtx2: ktx2 }).deps("fabrica").decodificadores).toEqual({ meshopt, ktx2, renderer, ruta: "basis/" });
    expect(cableaInteriores({ ...base, ventana: { fetch: async () => ({ ok: false, status: 404 }) } as any }).deps("fabrica").decodificadores).toBeNull();
    const arranque = fuentesArranque();
    expect(arranque).toMatch(/cargaMeshopt: function \(\) \{ return import\("three\/addons\/libs\/meshopt_decoder\.module\.js"\); \}/);
    expect(arranque).toMatch(/cargaKtx2: function \(\) \{ return import\("three\/addons\/loaders\/KTX2Loader\.js"\); \}, ventana/);
  });
});

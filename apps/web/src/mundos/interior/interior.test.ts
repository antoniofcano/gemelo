// El mundo interior genérico (eje B) con dobles: carga (ruta por perfil, manifiesto, glb, texturas por la Cola), entra/sale, puertas, Ambiente y
// liberación (la memoria de GPU vuelve a cero: geometrías, materiales y texturas, como vigila renderer.info.memory en el navegador).
import { describe, expect, it } from "vitest";
import catalogo from "../../../../../contratos/eventos.json";
import { creaCola, creaColaDeMundo } from "../../nucleo/cola.ts";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import type { ContextoBase, IdMundo, Pose2, Puerta } from "../../nucleo/mundos.ts";
import { creaInterior, FONDO_INTERIOR } from "./index.ts";
import { cableaInteriores, mundoDeUrl } from "./cableado.ts";
import type { DepsInterior, Material3D, Nodo3D, Textura3D } from "./index.ts";
import type { MundoInterior } from "../../datos/contratos/mundo-interior.ts";

/** el código del mundo interior, sin las pruebas (Vite: import.meta.glob ?raw) */
const fuentes = import.meta.glob(["./*.ts", "!./*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

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
    expect(Object.keys(fuentes).sort()).toEqual(["./cableado.ts", "./index.ts", "./puro.ts"]);
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
});

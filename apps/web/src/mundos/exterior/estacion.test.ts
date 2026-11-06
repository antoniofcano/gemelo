// El olivo estacional (A3-4, MU5-n; antes 23_estacion.js), con el three de verdad, la fábrica de verdad, un DOM y unos relojes de mentira y un NDVI sintético.
// Se comprueba: la fenología por fecha, lo que tiende el mundo a enseñar con la estación de otra fecha, las flores y aceitunas y, sobre todo, el ciclo de vida:
// libera() suelta el material, para el reloj de la lectura del clima, quita las escuchas (las de la tarjeta también) y el gancho __otDebug. HONESTIDAD: nada se dibuja.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { creaEstacion, manifiestoEstacion } from "./estacion.ts";
import { TiempoPuro, creaFormatos } from "./tiempo-puro.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const THREE: A = await import(/* @vite-ignore */ "three" as string);
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
function elemento() {
  const oy: Record<string, A[]> = {};
  return { oy, innerHTML: "", value: 0, addEventListener(ev: string, f: A) { (oy[ev] = oy[ev] || []).push(f); }, removeEventListener(ev: string, f: A) { oy[ev] = (oy[ev] || []).filter(x => x !== f); },
    dispatchEvent() {}, click() {}, n() { return Object.values(oy).reduce((a, l) => a + l.length, 0); }, dispara(ev: string) { (oy[ev] || []).slice().forEach(f => f({})); } };
}
function monta() {
  const els: Record<string, A> = {}; ["tEstac", "ndviSel", "mNube", "mGem", "mOrto", "tHoy", "tVerGem"].forEach(id => { els[id] = elemento(); });
  const relojes = new Map<number, A>(); let n = 0, idx = 2;
  const F = creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), ventana: A = {};
  const fmt = creaFormatos("Europe/Madrid"), matHojaG = new THREE.PointsMaterial(), matHojaP = new THREE.PointsMaterial();
  const E = creaEstacion({
    THREE, $: (id: string) => els[id] || null, Materiales: F, renderer: { domElement: { height: 800 } }, SRGB: THREE.SRGBColorSpace, Estado: { modo: "gem" }, hash, gFollaje: new THREE.Group(), matHojaG, matHojaP,
    NDV: { fechas: ["2026-01-15", "2026-06-15", "2026-11-01"] }, ndviIdx: () => idx, SN: { a: [0.3, 0.35, 0.32], b: [0.2, 0.25, 0.22] }, parcelas: [], OT: null,
    TiempoPuro, ahoraMs: () => Date.UTC(2026, 10, 6, 11), TM: { api: null, origen: "simulado", demo: "" }, fmtHora: fmt.fmtHora, fmtClaveDia: fmt.fmtClaveDia, num1: (v: A) => String(v), esc: (s: A) => String(s),
    objetivoMundoBase: () => ({ ms: Date.UTC(2026, 10, 6, 11), nub: 50, viento: 3, dir: 0, lluvia: 0, hr: 40, temp: 18 }), aplicaMundo: () => {},
    ventana, temporizador: { setTimeout: (f: A) => { relojes.set(++n, f); return n; }, clearTimeout: (id: A) => { relojes.delete(id); } }, Evento: function () {}
  });
  return { E, els, relojes, F, ventana, matHojaG, pon: (i: number) => { idx = i; } };
}

describe("el olivo estacional (componente del exterior)", () => {
  it("la fenología por fecha (enero, aceituna madura; junio, floración y cuajado; noviembre, envero) y los frutos solo donde los pinta el sombreador", () => {
    const { E } = monta();
    expect(E.bbchEn("2026-01-15")).toBeGreaterThan(85); expect(E.bbchEn("2026-06-15")).toBeGreaterThan(60); expect(E.bbchEn("2026-03-01")).toBeLessThan(20);
    expect(E.frutosVisibles(30)).toBe(false); expect(E.frutosVisibles(65)).toBe(true); expect(E.frutosVisibles(97)).toBe(false);
    expect(E.hoyMadrid()).toBe("2026-11-06"); expect(E.fechaEstacion()).toBe("2026-11-06");   // la última imagen: hoy
    E.libera();
  });
  it("con la estación de otra fecha, el sol de ese día; con el clima de su semana, su temperatura y un cielo «tranquilo» (estimado)", () => {
    const { E, relojes, pon } = monta();
    pon(1); E.actualizaEstacion();
    expect(E.EST.activa).toBe(true); expect(relojes.size).toBe(1);   // la lectura del clima, en 450 ms
    const m = E.objetivoMundo(); expect(m.ms).toBe(Date.UTC(2026, 10, 6, 11) + (Date.parse("2026-06-15T00:00:00Z") - Date.parse("2026-11-06T00:00:00Z")));
    E.EST.clima = { tmin: 14, tmax: 32, lluvia: 0 }; const c = E.objetivoMundo(); expect(c.nub).toBe(20); expect(c.temp).toBeGreaterThan(14); expect(c.temp).toBeLessThanOrEqual(32);
    E.libera();
  });
  it("las flores y aceitunas: unos puntos por grupo con el material de la fábrica («fruto-flor»), recortados con un metro más de esfera", () => {
    const { E, F, matHojaG } = monta(), g = new THREE.Group(), pos: number[] = [];
    for (let i = 0; i < 48; i++) pos.push(i * 0.1, 3, -i * 0.1);
    g.add(new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)), matHojaG));
    E.construyeFrutosLista(g); const p = g.children.find((o: A) => o.isPoints && o.material === E.matFruto());
    expect(p).toBeTruthy(); expect(F.inventario()["fruto-flor"]).toEqual({ tipo: "define", n: 1 }); expect(F.duenos()).toEqual({ "estacion-olivo": 1 });
    expect(E.matFruto().isShaderMaterial).toBe(true); expect(E.matFruto().vertexShader).toContain("mv.z += 1.0;");
    E.actualizaOlivo(0.016); expect(E.matFruto().visible).toBe(true);   // noviembre: envero
    E.libera();
  });
  it("libera(): suelta el material, para el reloj del clima, quita las escuchas (también las de la tarjeta) y el gancho __otDebug; dos veces no libera dos veces", () => {
    const { E, els, relojes, ventana, pon } = monta();
    expect(typeof ventana.__otDebug).toBe("function"); expect(els.ndviSel.n()).toBe(1); expect(els.mGem.n()).toBe(1);
    pon(0); E.actualizaEstacion(); expect(relojes.size).toBe(1);
    expect(E.vivos().escuchas).toBeGreaterThanOrEqual(4);   // la fecha, los tres modos y, con la estación activa, «Volver a hoy»
    let suelto = 0; E.matFruto().addEventListener("dispose", () => { suelto++; });
    expect(E.libera()).toBeGreaterThan(0);
    expect(suelto).toBe(1); expect(relojes.size).toBe(0); expect(ventana.__otDebug).toBeUndefined();
    ["ndviSel", "mNube", "mGem", "mOrto", "tHoy", "tVerGem"].forEach(id => expect(els[id].n()).toBe(0)); expect(E.vivos()).toEqual({ escuchas: 0, reloj: false });
    expect(E.libera()).toBe(0); E.actualizaOlivo(0.016);   // ya no hace nada
  });
  it("la variante TSL (apagada y PARCIAL): solo con el renderizador nuevo; con three/webgpu y three/tsl de verdad, un PointsNodeMaterial con sus nodos", async () => {
    const W: A = await import(/* @vite-ignore */ "three/webgpu" as string), TSL: A = await import(/* @vite-ignore */ "three/tsl" as string);
    const { DEF_FRUTO_FLOR } = await import("./estacion.ts");
    const hoy = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: { tipo: "clasico", pedido: "" }, nodos: () => ({ THREE: W, TSL }) });
    hoy.define("fruto-flor", DEF_FRUTO_FLOR); expect(hoy.ruta("fruto-flor")).toBe("clasico");
    const F = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: { tipo: "nuevo", pedido: "nuevo" }, nodos: () => ({ THREE: W, TSL }) });
    F.define("fruto-flor", DEF_FRUTO_FLOR); expect(F.ruta("fruto-flor")).toBe("tsl"); expect(F.cobertura()["fruto-flor"]).toMatchObject({ clasico: true, tsl: true });
    const un = { uBBCH: { value: 80 }, uEsc: { value: 400 }, uLuz: { value: new THREE.Color(1, 1, 1) } }, m: A = F.crea("fruto-flor", { uniforms: un });
    expect(m.isPointsNodeMaterial).toBe(true); expect(m.sizeNode && m.maskNode && m.colorNode).toBeTruthy(); expect(m.toneMapped).toBe(false);
  });
  it("el manifiesto vale, es de los mundos [exterior], monta el mismo objeto y su libera lo suelta", () => {
    const { E, ventana } = monta(), man = manifiestoEstacion(E);
    expect(ComponentesPuro.valida(man)).toEqual([]); expect(man.id).toBe("estacion-olivo"); expect(man.mundos).toEqual(["exterior"]);
    expect(man.monta({} as never)).toBe(E); man.libera(E as never); expect(ventana.__otDebug).toBeUndefined(); expect(() => man.libera(null)).not.toThrow();
  });
});

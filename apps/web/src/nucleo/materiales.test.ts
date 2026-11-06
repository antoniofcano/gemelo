// La fábrica de materiales (MU5-0, doc/sistema/MATERIALES.md). Con dobles de THREE (clases que apuntan con qué se construyeron y si se liberaron) y, en
// una prueba, con three/webgpu y three/tsl de verdad para la variante de ejemplo. Lo que cruza con el legado (02i como talón, el three de verdad, los
// nombres de los sitios del motor y el trinquete) se queda en pruebas/guardianes/materiales_f1.test.js. HONESTIDAD: sin GPU; nada se dibuja.
import { describe, expect, it } from "vitest";
import { DEF_EJEMPLO, EJEMPLO_TSL, MaterialesPuro, creaMateriales } from "./materiales.ts";
import type { DefMaterial, MaterialMin, ThreeMin } from "./materiales.ts";
import { creaRender } from "./render.ts";

// ---------------------------------------------------------------- dobles
class MatFalso implements MaterialMin {
  opciones: unknown; liberado = 0; alphaTest = 0; alphaToCoverage = false; needsUpdate = false;
  onBeforeCompile?: ((sh: unknown, r: unknown) => void) | undefined;
  customProgramCacheKey?: (() => string) | undefined;
  constructor(o?: unknown) { this.opciones = o; if (o && typeof (o as { alphaTest?: unknown }).alphaTest === "number") this.alphaTest = (o as { alphaTest: number }).alphaTest; }
  dispose(): void { this.liberado++; }
}
class Shader extends MatFalso { isShaderMaterial = true; }
class Basico extends MatFalso { isMeshBasicMaterial = true; }
class Estandar extends MatFalso { isMeshStandardMaterial = true; }
class BasicoNodo extends MatFalso { isNodeMaterial = true; colorNode: unknown = null; }
const THREE = { ShaderMaterial: Shader, MeshBasicMaterial: Basico, MeshStandardMaterial: Estandar } as unknown as ThreeMin;
const NODOS = { THREE: { MeshBasicNodeMaterial: BasicoNodo }, TSL: { color: (h: number) => ({ h, mul: (x: unknown) => ({ h, x }) }), uniform: (v: number) => ({ v, onObjectUpdate: (f: () => number) => ({ v, f }) }) } };
const consolaFalsa = () => { const avisos: string[] = []; return { avisos, warn: (...a: unknown[]) => { avisos.push(String(a[0])); }, error: () => {} }; };
const clasico = { tipo: "clasico", pedido: "" }, pedidoSinNuevo = { tipo: "clasico", pedido: "nuevo" }, nuevo = { tipo: "nuevo", pedido: "nuevo" };
/** un material de prueba con sus dos variantes */
const DEF: DefMaterial<{ k: number }> = {
  clasico: (o, c) => { const m = new (c.THREE["MeshBasicMaterial"] as typeof Basico)(o); m.onBeforeCompile = function () {}; return m; },
  tsl: (o, c) => new (c.THREE["MeshBasicNodeMaterial"] as typeof BasicoNodo)(o)
};

describe("la ruta: el clásico por defecto; la TSL solo con el renderizador nuevo y la variante", () => {
  it("sin nada, el clásico (el de siempre, con su parche) y ningún aviso", () => {
    const c = consolaFalsa(), M = creaMateriales({ THREE, render: clasico, nodos: () => NODOS, consola: c });
    M.define("prueba", DEF);
    const m = M.crea("prueba", { k: 1 });
    expect(m).toBeInstanceOf(Basico); expect(typeof m.onBeforeCompile).toBe("function");
    expect(M.ruta("prueba")).toBe("clasico"); expect(M.estado.tsl).toBe(false); expect(c.avisos).toEqual([]);
  });
  it("?renderer=webgpu con el WebGLRenderer (hoy): el clásico, y avisa UNA vez de que TSL necesita el WebGPURenderer", () => {
    const c = consolaFalsa(), R = creaRender({ busqueda: "?renderer=webgpu", consola: c });
    expect(R.tipo).toBe("clasico"); expect(R.pedido).toBe("nuevo");
    const M = creaMateriales({ THREE, render: R, nodos: () => NODOS, consola: c });
    M.define("prueba", DEF);
    expect(M.crea("prueba", { k: 1 })).toBeInstanceOf(Basico); M.crea("prueba", { k: 2 });
    expect(M.sombreador("otro", {})).toBeInstanceOf(Shader);
    expect(M.estado).toMatchObject({ pedido: true, tsl: false });
    const suyos = c.avisos.filter(a => a.indexOf("materiales:") === 0);
    expect(suyos).toHaveLength(1); expect(suyos[0]).toMatch(/TSL solo funcionan con el WebGPURenderer.*clásicos/);
  });
  it("con el renderizador nuevo y la variante, la TSL (con el THREE y el TSL de nodos()); sin variante, el clásico y un aviso por nombre", () => {
    const c = consolaFalsa(), M = creaMateriales({ THREE, render: nuevo, nodos: () => NODOS, consola: c });
    M.define("prueba", DEF);
    const t = M.crea("prueba", { k: 3 });
    expect(t).toBeInstanceOf(BasicoNodo); expect((t as BasicoNodo).opciones).toEqual({ k: 3 }); expect(M.ruta("prueba")).toBe("tsl");
    M.define("solo-clasico", { clasico: DEF.clasico as DefMaterial<unknown>["clasico"] });
    expect(M.crea("solo-clasico", {})).toBeInstanceOf(Basico); M.crea("solo-clasico", {});
    expect(M.ruta("solo-clasico")).toBe("clasico");
    expect(c.avisos.filter(a => /«solo-clasico» no tiene variante TSL/.test(a))).toHaveLength(1);
  });
  it("con el renderizador nuevo pero sin TSL cargado (nodos() da null o lanza): el clásico y el aviso", () => {
    for (const nodos of [null, () => null, () => { throw new Error("sin three/tsl"); }]) {
      const c = consolaFalsa(), M = creaMateriales({ THREE, render: nuevo, nodos, consola: c });
      M.define("prueba", DEF);
      expect(M.crea("prueba", { k: 1 })).toBeInstanceOf(Basico);
      expect(M.estado.tsl).toBe(false); expect(c.avisos.join("\n")).toMatch(/no hay TSL/);
    }
  });
  it("los sitios del legado (parchea, encadena, sombreador) usan la variante registrada con su mismo nombre (nuevo() o define())", () => {
    const M = creaMateriales({ THREE, render: nuevo, nodos: () => NODOS });
    let recibido: unknown = null;
    M.nuevo("parche-x", (e) => { recibido = e; return new BasicoNodo(); });
    const base = new Basico(), fn = () => {};
    expect(M.parchea(base, "parche-x", fn)).toBeInstanceOf(BasicoNodo); expect(recibido).toBe(base);
    expect(base.onBeforeCompile).toBeUndefined();   // el clásico no se toca
    M.define("sombra-x", { tsl: (o) => new BasicoNodo(o) });
    expect((M.sombreador("sombra-x", { u: 1 }) as BasicoNodo).opciones).toEqual({ u: 1 });
    // y con el clásico, lo de siempre: la MISMA función de parche (three usa su texto como clave) y la clave, si se da
    const C = creaMateriales({ THREE, render: clasico });
    C.nuevo("parche-x", () => new BasicoNodo());
    const m = C.parchea(new Basico(), "parche-x", fn, "mi-clave");
    expect(m.onBeforeCompile).toBe(fn); expect(m.customProgramCacheKey && m.customProgramCacheKey()).toBe("mi-clave");
  });
  it("crea() de un nombre sin clásico definido lanza; el nombre es obligatorio", () => {
    const M = creaMateriales({ THREE });
    expect(() => M.crea("no-existe")).toThrow(/no está definido/);
    M.define("solo-tsl", { tsl: () => new BasicoNodo() });
    expect(() => M.crea("solo-tsl")).toThrow(/no está definido/);
    expect(() => M.define("", DEF)).toThrow(/falta el nombre/);
    expect(() => M.sombreador("", {})).toThrow(/falta el nombre/);
  });
  it("define() en dos pasos (MU5-n: el clásico en el 2.º commit, la TSL en el 3.º) junta las dos variantes", () => {
    const M = creaMateriales({ THREE, render: nuevo, nodos: () => NODOS });
    M.define("dos-pasos", { clasico: DEF.clasico as DefMaterial<unknown>["clasico"] });
    expect(M.cobertura()["dos-pasos"]).toMatchObject({ clasico: true, tsl: false });
    M.define("dos-pasos", { tsl: DEF.tsl as DefMaterial<unknown>["tsl"] });
    expect(M.cobertura()["dos-pasos"]).toMatchObject({ clasico: true, tsl: true });
    expect(M.crea("dos-pasos", {})).toBeInstanceOf(BasicoNodo);
  });
});

describe("los materiales estándar valen en los dos renderizadores sin cambio", () => {
  it("estandar(clase, opciones) da la misma clase con las mismas opciones por la ruta clásica y por la nueva", () => {
    const op = { color: 0x336699, roughness: 0.8 };
    const a = creaMateriales({ THREE, render: clasico }).estandar("MeshStandardMaterial", op);
    const b = creaMateriales({ THREE, render: nuevo, nodos: () => NODOS }).estandar("MeshStandardMaterial", op);
    expect(a).toBeInstanceOf(Estandar); expect(b).toBeInstanceOf(Estandar);
    expect(b.constructor).toBe(a.constructor); expect((b as Estandar).opciones).toEqual((a as Estandar).opciones);
    expect(a.onBeforeCompile).toBeUndefined(); expect(b.onBeforeCompile).toBeUndefined();
  });
  it("no da sombreadores propios ni nombres que no sean un material", () => {
    const M = creaMateriales({ THREE });
    expect(() => M.estandar("ShaderMaterial", {})).toThrow(/no es un material estándar/);
    expect(() => M.estandar("NoExiste", {})).toThrow(/no es un material estándar/);
  });
});

describe("libera(dueño): suelta lo suyo y nada más", () => {
  it("cada dueño libera solo lo que creó con él; lo creado sin dueño no se toca", () => {
    const M = creaMateriales({ THREE });
    M.define("prueba", DEF);
    const ext = M.de("exterior"), vac = M.de("vacio");
    const a = ext.crea("prueba", { k: 1 }) as MatFalso, b = ext.estandar("MeshBasicMaterial") as MatFalso, c = ext.sombreador("s", {}) as MatFalso;
    const d = ext.parchea(new Basico(), "p", () => {}) as MatFalso, e = ext.encadena(new Basico(), "e", () => {}, "k") as MatFalso, f = ext.adopta(new Basico());
    const g = vac.estandar("MeshBasicMaterial") as MatFalso, sinDueno = M.estandar("MeshBasicMaterial") as MatFalso, legado = M.sombreador("s", {}) as MatFalso;
    expect(M.duenos()).toEqual({ exterior: 6, vacio: 1 });
    expect(M.libera("exterior")).toBe(6);
    for (const m of [a, b, c, d, e, f]) expect(m.liberado).toBe(1);
    for (const m of [g, sinDueno, legado]) expect(m.liberado).toBe(0);
    expect(M.duenos()).toEqual({ vacio: 1 });
    expect(M.libera("exterior")).toBe(0);   // dos veces no libera dos veces
    expect(a.liberado).toBe(1);
    expect(vac.libera()).toBe(1); expect(g.liberado).toBe(1);
    expect(M.libera("nadie")).toBe(0);
    expect(() => M.de("")).toThrow(/falta el dueño/);
  });
  it("lo liberado sale de los recortes alfa (AG-2.1): recortes() ya no lo toca", () => {
    const M = creaMateriales({ THREE, busqueda: "?a2c=1" });
    const ext = M.de("exterior");
    const r = M.recorte(ext.estandar("MeshBasicMaterial", { alphaTest: 0.5 }) as MatFalso), q = M.recorte(new Basico({ alphaTest: 0.4 }));
    expect(M.a2c.n).toBe(2); expect(r.alphaToCoverage).toBe(true);
    ext.libera();
    expect(M.a2c.n).toBe(1);
    M.recortes(false);
    expect(r.alphaToCoverage).toBe(true); expect(q.alphaToCoverage).toBe(false);
  });
});

describe("la variante de ejemplo (apagada por defecto)", () => {
  it("está registrada, da el clásico con su parche, y su parche multiplica el color por uBrillo (el mismo { value })", () => {
    const M = creaMateriales({ THREE });
    expect(M.cobertura()[EJEMPLO_TSL]).toMatchObject({ clasico: true, tsl: true, usado: 0 });
    const brillo = { value: 0.5 }, m = M.crea(EJEMPLO_TSL, { color: 0x112233, brillo }) as MatFalso;
    expect(m).toBeInstanceOf(Basico); expect(m.opciones).toEqual({ color: 0x112233 });
    const sh = { uniforms: {} as Record<string, unknown>, fragmentShader: "void main() {\n#include <color_fragment>\n}" };
    (m.onBeforeCompile as (s: unknown, r: unknown) => void)(sh, null);
    expect(sh.uniforms["uBrillo"]).toBe(brillo); expect(sh.fragmentShader).toMatch(/uniform float uBrillo;[\s\S]*diffuseColor\.rgb \*= uBrillo;/);
  });
  it("con three/webgpu y three/tsl de verdad, la variante TSL es un MeshBasicNodeMaterial con su colorNode", async () => {
    const rutaW = "three/webgpu", rutaT = "three/tsl";   // por variable: three no trae tipos (y así tampoco entra en el grafo de dependency-cruiser)
    const W = await import(/* @vite-ignore */ rutaW), T = await import(/* @vite-ignore */ rutaT);
    const M = creaMateriales({ THREE, render: nuevo, nodos: () => ({ THREE: W, TSL: T }) });
    const brillo = { value: 2 }, m = M.crea(EJEMPLO_TSL, { color: 0x336699, brillo }) as MaterialMin & { colorNode?: unknown; type?: string };
    expect(m.isNodeMaterial).toBe(true); expect(m.type).toBe("MeshBasicNodeMaterial"); expect(m.colorNode).toBeTruthy();
    expect(M.ruta(EJEMPLO_TSL)).toBe("tsl");
    expect(typeof DEF_EJEMPLO.tsl).toBe("function");
  });
});

describe("lo de siempre de 02i (sin cambio)", () => {
  it("encadena(): el parche previo y luego el nuevo, con la clave combinada; con la de la biblioteca, es ella", () => {
    const M = creaMateriales({ THREE }), orden: string[] = [];
    const m = new Basico(); m.onBeforeCompile = () => { orden.push("previo"); }; m.customProgramCacheKey = () => "mtoon";
    M.encadena(m, "x", () => { orden.push("fn"); }, "vrm-fundido");
    (m.onBeforeCompile as (s: unknown, r: unknown) => void)({}, null);
    expect(orden).toEqual(["previo", "fn"]); expect(m.customProgramCacheKey && m.customProgramCacheKey()).toBe("mtoon|vrm-fundido");
    const llamadas: unknown[] = [], propia = (mm: MaterialMin, f: unknown, k?: string) => { llamadas.push([f, k]); return mm; };
    const fn = () => {}; M.encadena(new Basico(), "gen", fn, "k", propia);
    expect(llamadas).toEqual([[fn, "k"]]);
  });
  it("inventario() cuenta por nombre y tipo, también lo que sale de define/crea", () => {
    const M = creaMateriales({ THREE });
    M.parchea(new Basico(), "a", () => {}); M.parchea(new Basico(), "a", () => {}); M.sombreador("b", {}); M.crea(EJEMPLO_TSL, {});
    expect(M.inventario()).toEqual({ a: { tipo: "parche", n: 2 }, b: { tipo: "sombreador", n: 1 }, [EJEMPLO_TSL]: { tipo: "define", n: 1 } });
  });
  it("a2c y cartulina: la URL, luego el ajuste, luego el defecto; sin MSAA no hay alphaToCoverage", () => {
    expect(MaterialesPuro.eligeA2c("?a2c=1", true, undefined)).toMatchObject({ activo: true, origen: "url" });
    expect(MaterialesPuro.eligeA2c("", true, true)).toMatchObject({ activo: true, origen: "ajuste" });
    expect(MaterialesPuro.eligeA2c("?a2c=1", false, undefined)).toMatchObject({ activo: false, msaa: false });
    expect(MaterialesPuro.eligeA2c("?a2c=7", true, undefined).advertencia).toMatch(/solo vale 0 o 1/);
    expect(MaterialesPuro.eligeCartulina("?cartulina=silueta")).toMatchObject({ modo: "silueta", silueta: true, origen: "url" });
    expect(MaterialesPuro.eligeCartulina("?cartulina=x")).toMatchObject({ modo: "rect", origen: "defecto" });
    const almacen = () => ({ getItem: (k: string) => (k === "gemelo.ajustes.vista.a2c" ? "true" : null) });
    expect(creaMateriales({ THREE, almacen }).a2c).toMatchObject({ activo: true, origen: "ajuste" });
    expect(creaMateriales({ THREE, almacen: () => { throw new Error("sin almacén"); } }).a2c.activo).toBe(false);
  });
});

describe("render: ?renderer=webgl|webgpu (MU5-0) es el mismo pedido que ?render=clasico|nuevo", () => {
  it("webgpu = nuevo y webgl = clasico; ?renderer= manda sobre ?render=; un valor desconocido avisa", () => {
    const c = consolaFalsa();
    expect(creaRender({ busqueda: "?renderer=webgpu" })).toMatchObject({ pedido: "nuevo", tipo: "clasico" });
    expect(creaRender({ busqueda: "?renderer=webgl&render=nuevo" })).toMatchObject({ pedido: "clasico", tipo: "clasico", advertencia: "" });
    expect(creaRender({ busqueda: "?render=nuevo" }).pedido).toBe("nuevo");
    expect(creaRender({ busqueda: "?renderer=vulkan", consola: c }).advertencia).toMatch(/renderer=vulkan no existe/);
    expect(MaterialesPuro.estadoDe(pedidoSinNuevo, true)).toMatchObject({ pedido: true, tsl: false });
  });
});

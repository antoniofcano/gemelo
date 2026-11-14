// El paisaje del exterior (A3-3, MU5-n; antes 18_paisaje.js). Con el three de verdad (sin GPU: geometrías, materiales y mallas existen sin renderizador) y la fábrica de
// materiales de verdad. Se comprueba: lo que se monta con un paisaje de mentira (edificios, tendido, derivación, árboles, cauces), que se coloca sobre el relieve y sigue la
// exageración, las sombras que siguen al sol, el agua del arroyo, la distancia al cauce y, sobre todo, el ciclo de vida (L2-05): montar y liberar suelta cada geometría, cada
// InstancedMesh y cada material, deja las escenas como estaban y se puede volver a montar. HONESTIDAD: nada se dibuja; lo que se ve lo dice el banco y el Quest, no probado aquí.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { COLOR_TEJADO_DEFECTO, DEF_ARROYO, FS_ARROYO, MATERIAL_ARROYO, VS_ARROYO, colorTejado, creaPaisaje, manifiestoPaisaje } from "./paisaje.ts";
import type { DatosPaisaje, DepsPaisaje } from "./paisaje.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const PA: DatosPaisaje = {
  edificios: [{ x: 100, y: 200, ang: 0.3, largo: 20, ancho: 10, hAlero: 4, hCumbrera: 6, color: [200, 180, 160] }, { x: 300, y: 50, ang: 1, largo: 8, ancho: 6, hAlero: 3, hCumbrera: 3, color: [150, 150, 150] }],
  tendido: {
    linea: [[0, 0, 12], [50, 0, 12], [100, 10, 12]], postes: [{ x: 0, y: 0, zBase: 3, zAlto: 12 }, { x: 50, y: 0, zBase: 3, zAlto: 12 }],
    derivaciones: [{ postes: [{ x: 60, y: 5, zBase: 3, zAlto: 10 }], linea: [[60, 5, 10], [80, 40, 6]] }],
  },
  arroyo: { ejes: [[[0, 0, 0, 2], [20, 10, 0, 2], [40, 30, 0, 2], [60, 30, 0, 3]], [[500, 500, 0, 2], [520, 520, 0, 2], [540, 530, 0, 2]]] },
  arboles: [{ x: 10, y: 20, h: 8, r: 3, tipo: "pino" }, { x: 30, y: 40, h: 4, r: 2, tipo: "frutal" }, { x: 50, y: 60, h: 2, r: 1.5, tipo: "arbusto" }],
};
const suelo = (x: number, y: number) => 100 + 0.01 * x + 0.02 * y;

function casilla() {
  const oyentes: Record<string, (() => void)[]> = {}, c = {
    checked: true, oyentes,
    addEventListener(t: string, f: () => void) { (oyentes[t] = oyentes[t] || []).push(f); },
    removeEventListener(t: string, f: () => void) { oyentes[t] = (oyentes[t] || []).filter(x => x !== f); },
  };
  return c;
}
function monta(extra: Partial<DepsPaisaje> = {}, datos: DatosPaisaje = PA) {
  const scene = new THREE.Scene(), gSombras = new THREE.Group(), Estado = { exag: 1 }, cas = casilla(), vr = { llamadas: [] as string[] };
  const inst07 = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), 2); inst07.count = 2;
  const cur = { ms: 1000, nub: 0, lluvia: 0 }, EST = { activa: false, clima: null as { lluvia: number } | null }, reloj = { t: 5 }, agua = { v: -1 }, matSombra = new THREE.MeshBasicMaterial({ transparent: true });
  const deps: DepsPaisaje = {
    THREE, D: { paisaje: datos }, $: () => cas, ESC_R8: 2, suelo, hash, SRGB: THREE.SRGBColorSpace, Estado, Estaticos: { congela() { /* sin efecto en la prueba */ } },
    Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), scene, gSombras, matSombra, geoSombra: new THREE.PlaneGeometry(1, 1), instSombra: () => inst07,
    copas: [{ oliv: true, perfil: [2, 2, 2, 2, 2, 2, 2, 2], x: 5, y: 5, h: 4 }, { oliv: false, perfil: [1, 1, 1, 1, 1, 1, 1, 1], x: 6, y: 6, h: 9 }],
    tMundo: () => reloj.t, cur, nivelEn: (_ms, s) => { s.s.alt = 0.8; s.s.az = 1; s.d = 1; return s; }, EST: () => EST,
    VrPresupuesto: { instancias: (id) => { vr.llamadas.push("instancias:" + id); }, renueva: (id) => { vr.llamadas.push("renueva:" + id); }, olvida: (id) => { vr.llamadas.push("olvida:" + id); } },
    ponAgua: (v) => { agua.v = v; }, ...extra,
  };
  return { api: creaPaisaje(deps), deps, scene, gSombras, Estado, cas, vr, cur, EST, reloj, agua, inst07, matSombra };
}
/** apunta los dispose de toda la geometría y todo el material (y los InstancedMesh) que cuelgan de un grupo */
function espia(raiz: { traverse(f: (o: never) => void): void }) {
  const hechos = { geometria: new Set<unknown>(), material: new Set<unknown>(), malla: new Set<unknown>() }, vivos = { geometria: new Set<unknown>(), material: new Set<unknown>(), malla: new Set<unknown>() };
  const apunta = (o: { addEventListener(t: string, f: () => void): void }, k: keyof typeof hechos) => { if (vivos[k].has(o)) return; vivos[k].add(o); o.addEventListener("dispose", () => { hechos[k].add(o); }); };
  raiz.traverse((o: never) => {
    const x = o as { isMesh?: boolean; isLine?: boolean; isInstancedMesh?: boolean; geometry?: never; material?: never };
    if (x.geometry) apunta(x.geometry, "geometria"); if (x.material) apunta(x.material, "material"); if (x.isInstancedMesh) apunta(o, "malla");
  });
  return { hechos, vivos };
}

describe("paisaje (componente del exterior)", () => {
  it("monta edificios (muro y tejado), postes, hilos, cuatro InstancedMesh de árboles y un cauce por eje, todo en un grupo «paisaje» de la escena", () => {
    const { api, scene, vr } = monta(), g = api.grupo();
    expect(scene.children).toEqual([g]); expect(g.name).toBe("paisaje");
    expect(api.resumen()).toEqual({ edificios: 2, postes: 3, arboles: 3, cauces: 2, montado: true });
    expect(g.children.filter((o: { isGroup?: boolean }) => o.isGroup)).toHaveLength(2);
    expect(g.children.filter((o: { isInstancedMesh?: boolean }) => o.isInstancedMesh)).toHaveLength(4);
    expect(g.children.filter((o: { isLine?: boolean }) => o.isLine)).toHaveLength(2);   // el hilo del tendido y el de la derivación
    expect(g.children.filter((o: { geometry?: { attributes: { aV?: unknown } } }) => o.geometry && o.geometry.attributes.aV)).toHaveLength(2);   // los cauces
    expect(vr.llamadas).toEqual(["instancias:arbolesPaisaje"]);
    expect(api.matTronco.isMeshLambertMaterial).toBe(true); expect(api.matTronco.color.getHex()).toBe(0x5a4636);
  });

  it("L4-05: un edificio sin color (o con un color roto) no tumba el montaje: su tejado sale del gris por defecto", () => {
    const sinColor: DatosPaisaje = { ...PA, edificios: [{ ...PA.edificios[0]!, color: undefined }, { ...PA.edificios[1]!, color: [1, 2] }] };
    let r: ReturnType<typeof monta> | null = null;
    expect(() => { r = monta({}, sinColor); }).not.toThrow();
    expect(r!.api.resumen().edificios).toBe(2);
    expect(colorTejado(undefined)).toBe(COLOR_TEJADO_DEFECTO); expect(colorTejado([1, 2])).toBe(COLOR_TEJADO_DEFECTO); expect(colorTejado([1, NaN, 3])).toBe(COLOR_TEJADO_DEFECTO);
    expect(colorTejado([10, 20, 30])).toEqual([10, 20, 30]);
  });
  it("se coloca sobre el relieve, sigue la exageración y se recorta (esferas) sin vértices no finitos; renueva el presupuesto de VR", () => {
    const { api, Estado, vr } = monta(), g = api.grupo();
    api.colocaPaisaje();
    const ed = g.children.filter((o: { isGroup?: boolean }) => o.isGroup)[0];
    expect(ed.position.y).toBeCloseTo(suelo(100, 200) * 1, 9); expect(ed.position.z).toBe(-200); expect(ed.rotation.y).toBeCloseTo(0.3, 9);
    Estado.exag = 2; api.colocaPaisaje(); expect(ed.position.y).toBeCloseTo(suelo(100, 200) * 2, 9);
    const hilo = g.children.filter((o: { isLine?: boolean }) => o.isLine)[1]; expect(hilo.geometry.attributes.position.getY(1)).toBeCloseTo(24, 9);   // el del tendido (el de la derivación va antes) expect(hilo.geometry.boundingSphere).toBeTruthy();
    const cauces = g.children.filter((o: { geometry?: { attributes: { aV?: unknown } } }) => o.geometry && o.geometry.attributes.aV);
    expect(cauces[0].geometry.attributes.position.getY(0)).toBeGreaterThan(0); expect(cauces[0].geometry.boundingSphere.radius).toBeGreaterThan(0);
    expect(vr.llamadas.filter(l => l === "renueva:arbolesPaisaje")).toHaveLength(2);
  });

  it("las sombras siguen al sol: una malla de instancias (árboles y edificios) en el grupo de 06_arboles, más las manchas de 07_follaje con su opacidad", () => {
    const { api, gSombras, matSombra, cur, inst07 } = monta();
    api.colocaPaisaje();
    expect(gSombras.children).toHaveLength(1); const sPA = api.sombrasPA(); expect(sPA.count).toBe(3 + 2); expect(sPA.visible).toBe(true);
    expect(matSombra.opacity).toBeGreaterThan(0.5);
    expect(inst07.visible).toBe(true);   // la de los olivos de 07_follaje: este módulo solo la recoloca (olivasS: 1 copa de olivo) y le pone la visibilidad
    cur.nub = 100; api.sombrasSol(true); expect(matSombra.opacity).toBeCloseTo(Math.max(0, Math.min(1, (Math.sin(0.8) - 0.03) * 4)) * 0.25, 9);
    const m0 = sPA.instanceMatrix.array.slice(0, 16); api.sombrasSol(false); expect(Array.from(sPA.instanceMatrix.array.slice(0, 16))).toEqual(Array.from(m0));   // sin mover el sol, no se recoloca
    expect(gSombras.children).toHaveLength(1);
  });

  it("el agua del arroyo sube con la lluvia (o una semana lluviosa) y baja despacio; la casilla «Paisaje» lo muestra y oculta", () => {
    const { api, cur, EST, reloj, agua, cas } = monta();
    api.actualizaPaisaje(1); expect(api.agua()).toBe(0); expect(agua.v).toBe(0);
    cur.lluvia = 1; for (let i = 0; i < 10; i++) api.actualizaPaisaje(1); const alto = api.agua(); expect(alto).toBeGreaterThan(0.5); expect(agua.v).toBe(alto);
    cur.lluvia = 0; api.actualizaPaisaje(1); expect(api.agua()).toBeLessThan(alto);
    EST.activa = true; EST.clima = { lluvia: 15 }; const antes = api.agua(); api.actualizaPaisaje(1); expect(api.agua()).toBeGreaterThan(antes);
    reloj.t = 42; api.actualizaPaisaje(0.1);
    cas.checked = false; api.actualizaPaisaje(0.1); expect(api.grupo().visible).toBe(false);
    cas.checked = true; cas.oyentes["change"]!.forEach(f => f()); expect(api.grupo().visible).toBe(true);
  });

  it("el cauce: el uniforme del agua y del reloj del mundo lo mueve actualizaPaisaje (el ShaderMaterial de siempre)", () => {
    const { api, reloj, cur } = monta(); reloj.t = 77; cur.lluvia = 1; api.actualizaPaisaje(5);
    const cauce = api.grupo().children.filter((o: { geometry?: { attributes: { aV?: unknown } } }) => o.geometry && o.geometry.attributes.aV)[0];
    expect(cauce.material.isShaderMaterial).toBe(true);
    expect(cauce.material.uniforms.uT.value).toBe(77); expect(cauce.material.uniforms.uAgua.value).toBeGreaterThan(0); expect(cauce.material.uniforms.uLuz.value).toBeCloseTo(1, 9);
  });

  it("la distancia al cauce más cercano es la de siempre (solo cuentan los puntos de índice par del eje) y es mil millones sin cauces", () => {
    const { api } = monta(), pts = api.ejeArroyo.filter((_: unknown, i: number) => i % 2 === 0);
    expect(api.ejeArroyo).toHaveLength(7);
    for (const [x, y] of [[0, 0], [30, 20], [100, 100], [510, 510], [-300, 40], [1000, 1000]] as const) {
      const bruta = pts.reduce((m: number, p: number[]) => Math.min(m, Math.hypot(p[0]! - x, p[1]! - y)), 1e9);
      expect(api.distArroyo(x, y)).toBeCloseTo(bruta, 9);
    }
    const sin = monta({}, { ...PA, arroyo: { eje: [] } }).api; expect(sin.distArroyo(5, 5)).toBe(1e9); expect(sin.ejeArroyo).toEqual([]);
  });

  it("L2-05: montar y liberar (varias veces) suelta cada geometría, cada InstancedMesh y cada material (uno por tejado, el del cauce y los fijos), saca todo de las escenas y olvida la fuente de VR", () => {
    const { api, scene, gSombras, vr, cas, deps } = monta(), F = deps.Materiales;
    for (let v = 0; v < 3; v++) {
      api.colocaPaisaje();
      const g = api.grupo(), sPA = api.sombrasPA(), sp = espia(g), spS = espia(gSombras);
      expect(sp.vivos.geometria.size).toBeGreaterThan(8); expect(sp.vivos.material.size).toBeGreaterThanOrEqual(5 + 2 + 1);   // fijos + dos tejados + el cauce
      expect(F.duenos()["paisaje-lidar"]).toBeGreaterThanOrEqual(8);
      api.libera();
      expect(scene.children).toHaveLength(0); expect(gSombras.children).toHaveLength(0);
      expect(sp.hechos.geometria.size).toBe(sp.vivos.geometria.size); expect(sp.hechos.material.size).toBe(sp.vivos.material.size); expect(sp.hechos.malla.size).toBe(sp.vivos.malla.size);
      expect(sp.vivos.malla.size).toBe(4); expect(spS.hechos.malla.has(sPA)).toBe(true);
      expect(F.duenos()).toEqual({}); expect(api.grupo()).toBeNull(); expect(api.sombrasPA()).toBeNull(); expect(cas.oyentes["change"]).toHaveLength(0);
      expect(vr.llamadas[vr.llamadas.length - 1]).toBe("olvida:arbolesPaisaje");
      api.monta();   // el exterior vuelve a entrar: todo de nuevo, en su sitio
      expect(scene.children).toHaveLength(1); expect(cas.oyentes["change"]).toHaveLength(1);
    }
    api.libera(); api.libera();   // dos veces no rompe ni libera de más
    expect(scene.children).toHaveLength(0);
    // sin montar, nada que colocar ni actualizar
    expect(() => { api.colocaPaisaje(); api.actualizaPaisaje(1); }).not.toThrow();
  });

  it("al volver a montar tras liberar, el paisaje se coloca solo en su sitio (ya se había colocado antes)", () => {
    const { api } = monta();
    api.colocaPaisaje(); api.libera(); api.monta();
    const ed = api.grupo().children.filter((o: { isGroup?: boolean }) => o.isGroup)[0];
    expect(ed.position.y).toBeCloseTo(suelo(100, 200), 9);
  });

  it("sus materiales salen de la fábrica con dueño: el cauce por define + crea («arroyo», el ShaderMaterial de siempre) y los demás como estándar; matTronco es el mismo objeto antes y después de liberar", () => {
    const { api, deps } = monta(), F = deps.Materiales;
    expect(MATERIAL_ARROYO).toBe("arroyo");
    expect(F.cobertura()["arroyo"]).toEqual({ clasico: true, tsl: true, usado: 1 }); expect(F.inventario()["arroyo"]).toEqual({ tipo: "define", n: 1 });
    expect(F.duenos()).toEqual({ "paisaje-lidar": 5 + 2 + 1 });   // matMuro, matPoste, matCable, matTronco, matCopaArb + un tejado por edificio + el cauce
    const cauce = api.grupo().children.filter((o: { geometry?: { attributes: { aV?: unknown } } }) => o.geometry && o.geometry.attributes.aV)[0].material;
    // el clásico es el de siempre: el mismo ShaderMaterial que new THREE.ShaderMaterial(opciones), con los uniformes por referencia y la clave de programa de three
    const uni = { uT: { value: 0 }, uAgua: { value: 0 }, uLuz: { value: 1 }, uArena: { value: new THREE.Color(0xa8977a) } };
    const opc = { uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
    const a = new THREE.ShaderMaterial({ ...opc, vertexShader: VS_ARROYO, fragmentShader: FS_ARROYO }), b = DEF_ARROYO.clasico!(opc, { THREE, nombre: "arroyo" }) as typeof a;
    for (const k of ["vertexShader", "fragmentShader", "transparent", "depthWrite", "side", "polygonOffset", "polygonOffsetFactor", "polygonOffsetUnits", "fog", "blending"] as const) expect(b[k]).toEqual(a[k]);
    expect(b.uniforms).toBe(uni); expect(b.customProgramCacheKey()).toBe(a.customProgramCacheKey());
    expect(cauce.isShaderMaterial).toBe(true); expect(cauce.vertexShader).toBe(VS_ARROYO); expect(cauce.fragmentShader).toBe(FS_ARROYO);
    expect(cauce.side).toBe(THREE.DoubleSide); expect(cauce.transparent).toBe(true); expect(cauce.depthWrite).toBe(false); expect(cauce.polygonOffsetFactor).toBe(-3);
    const t = api.matTronco; expect(t.isMeshLambertMaterial).toBe(true);
    api.libera(); expect(F.duenos()).toEqual({}); api.monta();
    expect(api.matTronco).toBe(t); expect(F.inventario()["arroyo"]).toEqual({ tipo: "define", n: 2 }); expect(F.duenos()).toEqual({ "paisaje-lidar": 8 });
  });

  it("la variante TSL del cauce (apagada): solo con el renderizador nuevo; con three/webgpu y three/tsl de verdad se construye un MeshBasicNodeMaterial con el estado de dibujo del clásico y su colorNode", async () => {
    const rutaW = "three/webgpu", rutaT = "three/tsl";   // por variable: three no trae tipos
    const W = await import(/* @vite-ignore */ rutaW as string), TSL = await import(/* @vite-ignore */ rutaT as string);
    const nuevo = { tipo: "nuevo", pedido: "nuevo" }, clasico = { tipo: "clasico", pedido: "" };
    const uni = { uT: { value: 3 }, uAgua: { value: 0.5 }, uLuz: { value: 0.8 }, uArena: { value: new W.Color(0xa8977a) } };
    const opc = { uniforms: uni, transparent: true, depthWrite: false, side: W.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
    // sin renderizador nuevo (hoy, siempre): el clásico, aunque haya nodos
    const hoy = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: clasico, nodos: () => ({ THREE: W, TSL }) });
    hoy.define(MATERIAL_ARROYO, DEF_ARROYO);
    expect(hoy.ruta(MATERIAL_ARROYO)).toBe("clasico"); expect((hoy.crea(MATERIAL_ARROYO, opc) as { isShaderMaterial?: boolean }).isShaderMaterial).toBe(true);
    // con él y la variante: el TSL
    const F = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: nuevo, nodos: () => ({ THREE: W, TSL }) });
    F.define(MATERIAL_ARROYO, DEF_ARROYO);
    expect(F.ruta(MATERIAL_ARROYO)).toBe("tsl"); expect(F.cobertura()[MATERIAL_ARROYO]).toMatchObject({ clasico: true, tsl: true });
    const m = F.crea(MATERIAL_ARROYO, opc) as { isNodeMaterial: boolean; isMeshBasicNodeMaterial: boolean; colorNode: { isNode?: boolean }; transparent: boolean; depthWrite: boolean; side: number; polygonOffset: boolean; polygonOffsetFactor: number; fog: boolean; toneMapped: boolean; uniforms?: unknown };
    expect(m.isNodeMaterial).toBe(true); expect(m.isMeshBasicNodeMaterial).toBe(true); expect(m.colorNode.isNode).toBe(true);
    expect(m.transparent).toBe(true); expect(m.depthWrite).toBe(false); expect(m.side).toBe(W.DoubleSide); expect(m.polygonOffset).toBe(true); expect(m.polygonOffsetFactor).toBe(-3); expect(m.fog).toBe(false); expect(m.toneMapped).toBe(false);
    expect(m.uniforms).toBeUndefined();   // no es un ShaderMaterial: los uniformes que mueve actualizaPaisaje (opc.uniforms) los relee el nodo en cada objeto
  });

  it("el manifiesto vale, es de los mundos [exterior], y su libera suelta de verdad", () => {
    const { api, scene } = monta(), man = manifiestoPaisaje(api);
    expect(ComponentesPuro.valida(man)).toEqual([]);
    expect(man.id).toBe("paisaje-lidar"); expect(man.mundos).toEqual(["exterior"]); expect(man.bandera).toEqual({ defecto: true });
    const a = man.monta({} as never) as typeof api; expect(a).toBe(api); expect(scene.children).toHaveLength(1);
    man.libera(a); expect(scene.children).toHaveLength(0); expect(() => man.libera(a)).not.toThrow(); expect(() => man.libera(null)).not.toThrow();
    man.monta({} as never); expect(scene.children).toHaveLength(1);
  });
});

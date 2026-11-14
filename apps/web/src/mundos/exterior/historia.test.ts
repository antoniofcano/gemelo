// La historia (MU5-n, A3-7b1: antes apps/web/motor/14_historia.js). Lo puro (HistoriaPuro) lo prueba el guardián de Node contra el ejemplo del contrato; aquí, con three de verdad y los
// dobles del DOM (nucleo/prueba-dom.ts): una malla de resalte por parcela que libera() saca de la escena y suelta (geometría y material), las escuchas y los puntos de escena que libera()
// quita, la ventana que vuelve a su estado de antes de empezar, un título hostil que no entra como código (L9-03) y ndviEn sin NDVI (L4-12). HONESTIDAD: sin navegador ni GPU; cómo se
// ve el recorrido, en el banco.
import { afterEach, describe, expect, it } from "vitest";
import { DEF_RESALTE, ID_HISTORIA, MATERIAL_RESALTE, creaHistoria, manifiestoHistoria } from "./historia.ts";
import { creaMundo, type Mundo } from "../../nucleo/prueba-dom.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);
let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });

const IDS = ["cLinde", "cCopas", "cMarc", "cDesf", "cNdvi", "cTinte", "cSolo", "hTitulo", "hTexto", "hFuente", "hCont", "hPuntos", "hAnt", "hSig", "hIntro", "hCuerpo", "hIni", "hFin", "hEstado", "ndviSel"];
const parcela = (id: string, nombre: string, finca: number) => ({ id, nombre, finca, ha: 1, centro: [0, 0], linde: [[-4, -4], [4, -4], [4, 4], [-4, 4]], suelo: null });

function monta(o: { hituelo?: boolean; ndvi?: boolean; titulo?: string } = {}) {
  m = creaMundo();
  for (const id of IDS) m.documento.body.appendChild(m.el(/^c[A-Z]/.test(id) ? "input" : id === "hIni" || id === "hAnt" || id === "hSig" || id === "hFin" ? "button" : "div", id));
  const parcelas = [parcela("p1", "Una", 0), parcela("p2", "Otra", 1)];
  const fincas = [{ nombre: "F1", ha: 1, olivos: 1, parcelas: [0] }, { nombre: "F2", ha: 1, olivos: 1, parcelas: [1] }];
  const D = { finca_id: o.hituelo === false ? "otra" : "hituelo", ot: { fecha_consulta: "2026-10-26", pases_finca: 0, entregas_finca: 0, analiticas_finca: 0,
    parcelas: { p1: { tareas: [{ tipo: "t", titulo: o.titulo || "Desvaretar", estado: "completado", fecha: "2026-10-01", avance: null, andados: null, objetivo: null }], fenologia: [] }, p2: { tareas: [], fenologia: [] } } }, paisaje: {} };
  const scene = { children: [] as unknown[], add(x: unknown) { this.children.push(x); }, remove(x: unknown) { const i = this.children.indexOf(x); if (i >= 0) this.children.splice(i, 1); } };
  let idx = 0, sale = 0;
  const Materiales = creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" });
  const NDV = o.ndvi === false ? null : { fechas: ["2026-01-01", "2026-06-01"], media: [0.3, 0.4] };
  const H = creaHistoria({
    THREE, D, $: (id: string) => m!.documento.getElementById(id), tinta: () => {}, fmt: (n: number, d = 0) => (n == null ? "–" : n.toFixed(d)), suelo: () => 0, copas: [], cIn: [], marc: [], med: () => 0,
    Materiales,
    Estaticos: { congela: () => {} }, scene, UN: { uExag: { value: 1 } }, orb: { az: 0, el: 0, dist: 100 }, pon: () => {}, NDV, pintaNdvi: () => {},
    get ndviIdx() { return idx; }, ponNdviIdx: (i: number) => { idx = i; }, get paseando() { return false; }, salePaseo: () => { sale++; },
    parcelas, fincas, claseUsda: () => "franco", elegirParcela: () => {}, elegirFinca: () => {}
  });
  return { H, m, scene, D, Materiales, idx: () => idx, sale: () => sale };
}
const el = (m: Mundo, id: string) => m.documento.getElementById(id);

describe("historia: ciclo de vida", () => {
  it("crea una malla de resalte por parcela y libera() las saca de la escena y suelta su geometría y su material", () => {
    const { H, scene, Materiales } = monta();
    expect(scene.children.length).toBe(2);
    const mallas = scene.children.slice() as Array<{ geometry: { dispose(): void }; material: { dispose(): void } }>; let g = 0, ma = 0;
    mallas.forEach(x => { const gd = x.geometry.dispose.bind(x.geometry), md = x.material.dispose.bind(x.material); x.geometry.dispose = () => { g++; gd(); }; x.material.dispose = () => { ma++; md(); }; });
    expect(Materiales.duenos()["historia-recorrido"]).toBe(2);   // un material de resalte por parcela, con su dueño en la fábrica
    H.libera();
    expect(scene.children.length).toBe(0); expect([g, ma]).toEqual([2, 2]); expect(H.estado().mallas).toBe(0); expect(Materiales.duenos()["historia-recorrido"]).toBeUndefined();
  });
  it("empezar crea los puntos y las escuchas; libera() las quita y deja la ventana como antes de empezar", () => {
    const { H, m } = monta();
    expect(el(m, "hPuntos").children.length).toBe(H.estado().escenas); expect(m.escuchas()).toBeGreaterThan(4);
    el(m, "hIni").click(); expect(H.estado().escena).toBe(0); expect(el(m, "hCuerpo").hidden).toBe(false); expect(el(m, "hTitulo").textContent).toMatch(/^1\./);
    H.libera();
    expect(m.escuchas()).toBe(0); expect(el(m, "hPuntos").children.length).toBe(0); expect(el(m, "hCuerpo").hidden).toBe(true); expect(el(m, "hIntro").hidden).toBe(false); expect(el(m, "hIni").textContent).toBe("Empezar el recorrido");
  });
  it("L9-03: un título de tarea con código no entra como código en ninguna escena", () => {
    const { H, m } = monta({ titulo: "<img src=x onerror=alert(1)>" });
    for (let i = 0; i < H.estado().escenas; i++) { el(m, "hPuntos").children[i].click(); expect(el(m, "hTexto").innerHTML).not.toMatch(/<img/); }
    H.libera();
  });
  it("L6-10: ← → mueven el recorrido con el foco en un botón (donde lo deja «Siguiente»), pero no en un campo, un deslizador ni unas pestañas", () => {
    const { H, m } = monta(), v = m.ventana, tecla = (code: string, target: unknown) => { const e = { type: "keydown", code, target, preventDefault() { /* doble */ } }; v.dispatchEvent(e); };
    el(m, "hIni").click(); expect(H.estado().escena).toBe(0);
    tecla("ArrowRight", el(m, "hSig")); expect(H.estado().escena).toBe(1);
    tecla("ArrowLeft", el(m, "hAnt")); expect(H.estado().escena).toBe(0);
    const campo = m.el("input"), pest = m.el("button"); pest.setAttribute("role", "tab");
    tecla("ArrowRight", campo); tecla("ArrowRight", pest); expect(H.estado().escena).toBe(0);
    H.libera();
  });
  it("otra finca no tiene recorrido: el botón se apaga, no hay puntos ni escuchas de escena", () => {
    const { H, m } = monta({ hituelo: false });
    expect(H.estado().escenas).toBe(0); expect(el(m, "hIni").disabled).toBe(true); H.libera();
  });
  it("la escena de la fenología elige la imagen de NDVI más cercana y la escribe con ponNdviIdx (el legado la lee por getter)", () => {
    const { H, m, idx } = monta();
    const i = H.estado().escenas; expect(i).toBeGreaterThan(4);
    el(m, "hPuntos").children[4].click(); expect(idx()).toBe(0); H.libera();
  });
  it("la variante TSL (apagada): solo con el renderizador nuevo; con three/webgpu y three/tsl de verdad se construye un MeshBasicNodeMaterial con su positionNode y el mismo estado de dibujo", async () => {
    const rutaW = "three/webgpu", rutaT = "three/tsl";   // por variable: three no trae tipos
    const W = await import(/* @vite-ignore */ rutaW as string), TSL = await import(/* @vite-ignore */ rutaT as string);
    const uExag = { value: 2 };
    const hoy = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: { tipo: "clasico", pedido: "" }, nodos: () => ({ THREE: W, TSL }) });
    hoy.define(MATERIAL_RESALTE, DEF_RESALTE);
    const c = hoy.crea(MATERIAL_RESALTE, { uExag }) as { isMeshBasicMaterial?: boolean; onBeforeCompile?: unknown };
    expect(hoy.ruta(MATERIAL_RESALTE)).toBe("clasico"); expect(c.isMeshBasicMaterial).toBe(true); expect(typeof c.onBeforeCompile).toBe("function");
    const F = creaMateriales({ THREE: THREE as unknown as ThreeMin, render: { tipo: "nuevo", pedido: "nuevo" }, nodos: () => ({ THREE: W, TSL }) });
    F.define(MATERIAL_RESALTE, DEF_RESALTE);
    expect(F.ruta(MATERIAL_RESALTE)).toBe("tsl"); expect(F.cobertura()[MATERIAL_RESALTE]).toMatchObject({ clasico: true, tsl: true });
    const t = F.crea(MATERIAL_RESALTE, { uExag }) as { isNodeMaterial: boolean; isMeshBasicNodeMaterial: boolean; positionNode: unknown; transparent: boolean; opacity: number; depthWrite: boolean; polygonOffsetFactor: number };
    expect(t.isNodeMaterial).toBe(true); expect(t.isMeshBasicNodeMaterial).toBe(true); expect(t.positionNode).toBeTruthy();
    expect([t.transparent, t.opacity, t.depthWrite, t.polygonOffsetFactor]).toEqual([true, 0.42, false, -3]);
  });
  it("diez montajes y liberaciones no dejan escuchas ni mallas", () => {
    for (let i = 0; i < 10; i++) { const { H, m, scene } = monta(); H.libera(); expect(m.escuchas()).toBe(0); expect(scene.children.length).toBe(0); m.limpia(); }
    m = null;
  });
  it("el componente es del exterior y solo de ciclo de vida", () => {
    const { H } = monta(); const c = manifiestoHistoria(H);
    expect(c.id).toBe(ID_HISTORIA); expect(c.mundos).toEqual(["exterior"]); expect(c.fases).toEqual({}); expect(c.monta({} as never)).toBe(H);
  });
});

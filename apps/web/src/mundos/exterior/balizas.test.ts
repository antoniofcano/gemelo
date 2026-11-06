// Las balizas del exterior (A3-3, MU5-n; antes 19_balizas.js). Con el three de verdad (sin GPU), la fábrica de materiales de verdad y un DOM, un Entidades y un Bus de mentira.
// Se comprueba: una baliza por parcela con sus tres piezas, el color por estado (Vigía, tareas abiertas, hechas, nada), cómo se colocan y siguen la exageración, la ficha (con los
// textos escapados), las visitas y el aviso a Sonido, la elección por pantalla y por rayo, el minimapa y, sobre todo, el ciclo de vida (L2-05): montar y liberar suelta cada
// geometría y cada material, quita el tipo de Entidades, el oyente, el aviso del minimapa y window.__vrBalizas, y se puede volver a montar. HONESTIDAD: nada se dibuja;
// lo que se ve lo dice el banco y el Quest, no probado aquí.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { COLB, DEF_BALIZA, FS_BALIZA, MATERIAL_BALIZA, VS_BALIZA, creaBalizas, manifiestoBalizas } from "./balizas.ts";
import type { DepsBalizas } from "./balizas.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

const PARCELAS = [0, 1, 2].map(k => ({ id: "p" + k, nombre: k === 1 ? "La <Loma> & Co" : "Parcela " + k, ha: 2.5 + k, centro: [100 * k, 50], linde: [] as unknown }));
const suelo = (x: number, y: number) => 100 + 0.01 * x + 0.02 * y;
const hoy = { fecha_consulta: "2026-11-03", fuente: "vivo", parcelas: {
  p0: { tareas: [{ titulo: "Podar", estado: "abierta", avance: 40 }], fenologia: [{ bbch: 85, fecha: "2026-10-01" }, { bbch: 81, fecha: "2026-09-01" }] },
  p1: { tareas: [{ titulo: "Arar", estado: "completado", fecha: "2026-10-20", andados: 3, objetivo: 10 }], fenologia: [] },
} };

/** un elemento del DOM de mentira: lo que usa el módulo de la ficha y del aviso */
function elemento(extra: Record<string, unknown> = {}) {
  const oyentes: Record<string, ((e: unknown) => void)[]> = {}, hijos: unknown[] = [];
  const e: Record<string, unknown> = {
    hidden: false, innerHTML: "", textContent: "", style: { cssText: "", margin: "" }, oyentes, hijos, parentNode: null,
    addEventListener(t: string, f: (e: unknown) => void) { (oyentes[t] = oyentes[t] || []).push(f); },
    removeEventListener(t: string, f: (e: unknown) => void) { oyentes[t] = (oyentes[t] || []).filter(x => x !== f); },
    setAttribute() { /* sin efecto */ }, appendChild(h: { parentNode: unknown }) { hijos.push(h); h.parentNode = e; }, removeChild(h: unknown) { hijos.splice(hijos.indexOf(h), 1); },
    focus() { /* sin foco */ }, querySelector() { return null; }, ...extra,
  };
  return e as Record<string, unknown> & { oyentes: Record<string, ((e: unknown) => void)[]>; hijos: unknown[]; hidden: boolean; innerHTML: string };
}
function monta(extra: Partial<DepsBalizas> = {}) {
  const scene = new THREE.Scene(), Estado = { exag: 1 }, ficha = elemento(), visor = elemento(), ventana: Record<string, unknown> = {}, emitidos: [string, unknown][] = [];
  const st = { OT: hoy as unknown, VIVO: null as unknown, paseando: false, cercano: null as { id: string } | null, quita: 0, registrado: null as Record<string, (...a: never[]) => unknown> | null, t: 0, TR: { act: false, t: 0, tCae: 1 } };
  const D = { ot: null as unknown };
  const documento = { createElement: () => elemento(), body: elemento(), activeElement: null };
  const deps: DepsBalizas = {
    THREE, $: (id: string) => id === "baliza" ? ficha : elemento(), suelo, bus: { emite: (ev, d) => { emitidos.push([ev, d]); return 1; } },
    Entidades: { registra: (def) => { st.registrado = def; return () => { st.quita++; }; }, lista: () => null },
    Usables: { cercano: () => st.cercano }, Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), Estaticos: { congela() { /* sin efecto en la prueba */ } },
    visor: visor as unknown as DepsBalizas["visor"], scene, camera: new THREE.PerspectiveCamera(), Estado, objetivo: { x: 0, z: 0 }, paseando: () => st.paseando, pp: { x: 0, y: 0 }, Llegada: { ve: () => true },
    parcelas: PARCELAS, HazasPuro: { dentroPoligono: () => true }, D, OT: () => st.OT, VIVO: () => st.VIVO,
    num1: (v, dd) => v.toFixed(dd), esc: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), tVida: () => st.t, enQuad: () => false,
    TR: () => st.TR, Encuentro: () => ({ enParcela: () => null, BALIZA: {} }), sitioJunto: (c) => ({ x: c.x, y: c.y, ang: 0 }), VRX: () => ({ on: false }), documento, ventana, ...extra,
  };
  return { api: creaBalizas(deps), deps, scene, Estado, ficha, visor, ventana, emitidos, st, D, documento };
}
/** apunta los dispose de toda la geometría y todo el material que cuelgan de un grupo */
function espia(raiz: { traverse(f: (o: never) => void): void }) {
  const hechos = { geometria: new Set<unknown>(), material: new Set<unknown>() }, vivos = { geometria: new Set<unknown>(), material: new Set<unknown>() };
  const apunta = (o: { addEventListener(t: string, f: () => void): void }, k: keyof typeof hechos) => { if (vivos[k].has(o)) return; vivos[k].add(o); o.addEventListener("dispose", () => { hechos[k].add(o); }); };
  raiz.traverse((o: never) => { const x = o as { geometry?: never; material?: never }; if (x.geometry) apunta(x.geometry, "geometria"); if (x.material) apunta(x.material, "material"); });
  return { hechos, vivos };
}

describe("balizas (componente del exterior)", () => {
  it("una baliza por parcela con su columna, su rombo y su anillo, en un grupo «balizas» de la escena", () => {
    const { api, scene, ventana, st } = monta(), g = api.grupo();
    expect(scene.children).toEqual([g]); expect(g.name).toBe("balizas"); expect(g.children).toHaveLength(3);
    g.children.forEach((b: { children: unknown[] }) => { expect(b.children).toHaveLength(3); });
    expect(api.resumen()).toEqual({ balizas: 3, visitadas: 0, montado: true });
    expect(typeof ventana["__vrBalizas"]).toBe("function"); expect(st.registrado).toBeTruthy(); expect(st.registrado!["abierta"]).toBeTruthy();
  });

  it("se coloca sobre el relieve y sigue la exageración; el color de cada una sale de su estado (Vigía, abiertas, hechas, nada)", () => {
    const { api, Estado, st } = monta(), B = api.balizas();
    api.colocaBalizas();
    expect(B[0].position.y).toBeCloseTo(suelo(0, 50), 9); expect(B[1].position.x).toBe(100); expect(B[1].position.z).toBe(-50);
    Estado.exag = 2; api.colocaBalizas(); expect(B[2].position.y).toBeCloseTo(suelo(200, 50) * 2, 9);
    expect(B.map((b: { userData: { estado: string } }) => b.userData.estado)).toEqual(["abierta", "hecha", "nada"]);
    expect(B.map((b: { userData: { col: { getHex(): number } } }) => b.userData.col.getHex())).toEqual([COLB["abierta"], COLB["hecha"], COLB["nada"]]);
    st.VIVO = { vigia: [{ parcela: "parcela 2", gravedad: "media" }] }; api.actualizaBalizas(0.016);   // Vigía marca la 2: alerta y pulso
    expect(B[2].userData.estado).toBe("alerta"); expect(B[2].userData.uni.uPulso.value).toBe(1); expect(B[0].userData.uni.uPulso.value).toBe(0);
    expect(B[2].userData.rombo.material.color.getHex()).toBe(COLB["alerta"]);
  });

  it("la ficha como datos (para VR y para «Ir a esta baliza») y la de HTML escapan los nombres y los alias", () => {
    const { api, st, ficha } = monta(); api.colocaBalizas();
    const f = st.registrado!["ficha"] as unknown as (id: string) => { titulo: string; lineas: string[]; pie: string; acciones: { id: string }[]; color: number };
    const f0 = f("baliza:p0"); expect(f0.titulo).toBe("Baliza · Parcela 0"); expect(f0.lineas[0]).toContain("Hay tareas abiertas"); expect(f0.lineas.join("|")).toContain("Abiertas: Podar (40 %)");
    expect(f0.lineas.join("|")).toContain("Fenología: BBCH 85"); expect(f0.pie).toContain("leído en vivo el 03/11"); expect(f0.acciones[0]!.id).toBe("bir"); expect(f0.color).toBe(COLB["abierta"]);
    expect(f("baliza:no")).toBeNull();
    // la ficha de HTML (al forzarla con muestra): el nombre con < y & sale escapado
    expect((st.registrado!["muestra"] as unknown as (id: string) => boolean)("baliza:p1")).toBe(true);
    api.actualizaBalizas(0.016);
    expect(ficha.hidden).toBe(false); expect(ficha.innerHTML).toContain("La &lt;Loma&gt; &amp; Co"); expect(ficha.innerHTML).not.toContain("<Loma>"); expect(ficha.innerHTML).toContain("Hecho hace poco");
    expect(ficha.innerHTML).toContain("3 de 10 olivos"); expect(ficha.innerHTML).toContain('data-k="1"');
  });

  it("al pasear, la cercanía de Usables abre la ficha, cuenta la visita y avisa a Sonido; con las tres, «inspección completa»; la × la cierra hasta alejarse", () => {
    const { api, st, ficha, emitidos } = monta(); api.colocaBalizas();
    st.paseando = true;
    for (let k = 0; k < 3; k++) { st.cercano = { id: "baliza:p" + k }; api.actualizaBalizas(0.016); expect(ficha.hidden).toBe(false); }
    expect(api.visitas()).toBe(3); expect(emitidos.map(e => e[0])).toEqual(["sonido:baliza", "sonido:baliza", "sonido:baliza"]); expect(emitidos[2]![1]).toEqual({ completa: true }); expect(emitidos[0]![1]).toEqual({ completa: false });
    expect(ficha.innerHTML).toContain("inspección completa");
    // la × (cerrar): no vuelve sola hasta que te alejes
    (st.registrado!["cierra"] as unknown as () => void)(); expect(ficha.hidden).toBe(true);
    api.actualizaBalizas(0.016); expect(ficha.hidden).toBe(true);
    st.cercano = null; api.actualizaBalizas(0.016); st.cercano = { id: "baliza:p2" }; api.actualizaBalizas(0.016); expect(ficha.hidden).toBe(false);
    // y la ficha espera a que el muñequito aterrice
    st.TR = { act: true, t: 0.5, tCae: 1 }; api.actualizaBalizas(0.016); expect(ficha.hidden).toBe(true);
    // fuera del paseo, sin ficha forzada: escondida
    st.TR = { act: false, t: 0, tCae: 1 }; st.paseando = false; api.actualizaBalizas(0.016); expect(ficha.hidden).toBe(true);
  });

  it("tocar la columna por pantalla o apuntar con el rayo elige la baliza más cercana; la más cercana a quien pasea es la de Entidades.cerca", () => {
    const { api, st, deps } = monta(); api.colocaBalizas();
    deps.camera.position.set(0, 100, 100); deps.camera.lookAt(0, 120, -50); deps.camera.updateMatrixWorld(true); deps.camera.updateProjectionMatrix();
    const pant = st.registrado!["pantalla"] as unknown as (x: number, y: number, r: unknown) => { id: string; s: number } | null;
    const r = { width: 800, height: 600, left: 0, top: 0 };
    const p0 = new THREE.Vector3(0, suelo(0, 50) + 13, -50).project(deps.camera), px = (p0.x * 0.5 + 0.5) * 800, py = (-p0.y * 0.5 + 0.5) * 600;
    expect(pant(px, py, r)?.id).toBe("baliza:p0"); expect(pant(px, py, r)!.s).toBeLessThan(0.5); expect(pant(5, 5, r)).toBeNull();
    const rayo = st.registrado!["rayo"] as unknown as (rr: unknown) => { id: string } | null, b = api.balizas()[1].position;
    const dir = new THREE.Vector3(b.x - 0, b.y + 10 - 20, b.z - 0).normalize();
    expect(rayo({ ray: { origin: new THREE.Vector3(0, 20, 0), direction: dir } })?.id).toBe("baliza:p1");
    expect(rayo({ ray: { origin: new THREE.Vector3(0, 20, 0), direction: new THREE.Vector3(0, 1, 0) } })).toBeNull();   // vertical: sin columna a la vista
    const cerca = st.registrado!["cerca"] as unknown as (x: number, y: number) => { id: string; d: number };
    expect(cerca(190, 40).id).toBe("baliza:p2"); expect(cerca(190, 40).d).toBeCloseTo(Math.hypot(10, 10), 9);
    expect((st.registrado!["pos"] as unknown as (id: string) => { x: number })("baliza:p1").x).toBe(100);
    expect((st.registrado!["existe"] as unknown as (id: string) => boolean)("baliza:p9")).toBe(false);
  });

  it("el minimapa: un rombo por baliza con el color de su estado, la marca de visitada y los puntos donde tocarlas", () => {
    const { api, st } = monta(); api.colocaBalizas(); st.paseando = true; st.cercano = { id: "baliza:p1" }; api.actualizaBalizas(0.016);
    const llamadas: string[] = [], c = { fillStyle: "", strokeStyle: "", lineWidth: 0, beginPath: () => llamadas.push("b"), moveTo: () => llamadas.push("m"), lineTo: () => llamadas.push("l"), closePath: () => llamadas.push("c"), fill: () => llamadas.push("f"), stroke: () => llamadas.push("s") };
    const pts: { k: number; px: number; py: number }[] = [];
    api.dibujaBalizasMini(c, (x: number) => x / 10, (y: number) => y / 10, pts);
    expect(pts).toEqual([{ k: 0, px: 0, py: 5 }, { k: 1, px: 10, py: 5 }, { k: 2, px: 20, py: 5 }]);
    expect(llamadas.filter(l => l === "f")).toHaveLength(3); expect(llamadas.filter(l => l === "s")).toHaveLength(4);   // 3 rombos y la marca de la visitada
    expect(() => api.dibujaBalizasMini(c, (x: number) => x, (y: number) => y)).not.toThrow();
  });

  it("el aviso del minimapa: un diálogo con el texto como textContent (nunca HTML), que se reutiliza y se quita al liberar", () => {
    const { api, visor } = monta();
    expect(api.avisoBaliza(1)).toBe(true); expect(visor.hijos).toHaveLength(1);
    const raiz = visor.hijos[0] as { hidden: boolean; hijos: { textContent: string }[] };
    expect(raiz.hidden).toBe(false); expect(raiz.hijos[0]!.textContent).toBe("Parcela La <Loma> & Co · ¿Ir a esta baliza?");   // textContent: el < y el & van tal cual, sin interpretar
    api.avisoBaliza(2); expect(visor.hijos).toHaveLength(1); expect(raiz.hijos[0]!.textContent).toContain("Parcela 2");
    api.libera(); expect(visor.hijos).toHaveLength(0);
  });

  it("L2-05: montar y liberar (varias veces) suelta cada geometría y cada material, saca el grupo de la escena y quita el tipo de Entidades, el oyente de la ficha y window.__vrBalizas", () => {
    const { api, scene, st, ficha, ventana, deps } = monta(), F = deps.Materiales;
    let registros = 1;
    for (let v = 0; v < 3; v++) {
      api.colocaBalizas();
      const sp = espia(api.grupo());
      expect(sp.vivos.geometria.size).toBe(9); expect(sp.vivos.material.size).toBe(9); expect(F.duenos()).toEqual({ "balizas-parcela": 9 });
      expect(ficha.oyentes["click"]).toHaveLength(1);
      api.libera();
      expect(scene.children).toHaveLength(0); expect(st.quita).toBe(v + 1); expect(ficha.oyentes["click"]).toHaveLength(0); expect("__vrBalizas" in ventana).toBe(false);
      expect(sp.hechos.geometria.size).toBe(9); expect(sp.hechos.material.size).toBe(9); expect(F.duenos()).toEqual({}); expect(api.grupo()).toBeNull(); expect(ficha.hidden).toBe(true);
      api.monta(); registros++;   // el exterior vuelve a entrar: todo de nuevo, ya en su sitio
      expect(scene.children).toHaveLength(1); expect(ficha.oyentes["click"]).toHaveLength(1); expect(typeof ventana["__vrBalizas"]).toBe("function");
      expect(api.balizas()[2].position.x).toBe(200);   // ya se había colocado antes
    }
    expect(registros).toBe(4); api.libera(); api.libera();
    expect(st.quita).toBe(4); expect(scene.children).toHaveLength(0);
    expect(() => { api.colocaBalizas(); api.actualizaBalizas(1); }).not.toThrow();   // sin montar, nada que hacer
  });

  it("la columna sale de la fábrica por define + crea («baliza»: el ShaderMaterial de siempre, con los uniformes por referencia y el mismo uT compartido); rombo y anillo, como estándar", () => {
    const { api, deps } = monta(), F = deps.Materiales;
    expect(MATERIAL_BALIZA).toBe("baliza");
    expect(F.cobertura()["baliza"]).toEqual({ clasico: true, tsl: false, usado: 3 }); expect(F.inventario()["baliza"]).toEqual({ tipo: "define", n: 3 }); expect(F.ruta("baliza")).toBe("clasico");
    const col = api.balizas()[0].children[0].material;
    expect(col.isShaderMaterial).toBe(true); expect(col.uniforms).toBe(api.balizas()[0].userData.uni); expect(col.uniforms.uT).toBe(api.uBaliza.uT);
    expect(col.blending).toBe(THREE.AdditiveBlending); expect(col.fog).toBe(false); expect(col.depthWrite).toBe(false); expect(col.transparent).toBe(true); expect(col.side).toBe(THREE.DoubleSide);
    expect(col.vertexShader).toBe(VS_BALIZA); expect(col.fragmentShader).toBe(FS_BALIZA);
    // el clásico es el de siempre: el mismo ShaderMaterial que new THREE.ShaderMaterial(opciones)
    const uni = { uT: { value: 0 }, uColor: { value: new THREE.Color(0x336699) }, uPulso: { value: 0 } };
    const opc = { uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false };
    const a = new THREE.ShaderMaterial({ ...opc, vertexShader: VS_BALIZA, fragmentShader: FS_BALIZA }), b = DEF_BALIZA.clasico!(opc, { THREE, nombre: "baliza" }) as typeof a;
    for (const k of ["vertexShader", "fragmentShader", "transparent", "depthWrite", "side", "blending", "fog"] as const) expect(b[k]).toEqual(a[k]);
    expect(b.uniforms).toBe(uni); expect(b.customProgramCacheKey()).toBe(a.customProgramCacheKey());
    const rombo = api.balizas()[0].children[1].material, anillo = api.balizas()[0].children[2].material;
    expect(rombo.isMeshBasicMaterial && anillo.isMeshBasicMaterial).toBe(true); expect(anillo.transparent && anillo.forceSinglePass && anillo.opacity === 0.8).toBe(true); expect(rombo.fog).toBe(false);
    api.actualizaBalizas(0.1); expect(api.uBaliza.uT.value).toBe(0);
  });

  it("el manifiesto vale, es de los mundos [exterior], emite «sonido:baliza» y su libera suelta de verdad", () => {
    const { api, scene } = monta(), man = manifiestoBalizas(api);
    expect(ComponentesPuro.valida(man)).toEqual([]);
    expect(man.id).toBe("balizas-parcela"); expect(man.mundos).toEqual(["exterior"]); expect(man.bandera).toEqual({ defecto: true }); expect(man.eventos.emite).toEqual(["sonido:baliza"]);
    const a = man.monta({} as never) as typeof api; expect(a).toBe(api); expect(scene.children).toHaveLength(1);
    man.libera(a); expect(scene.children).toHaveLength(0); expect(() => man.libera(a)).not.toThrow(); expect(() => man.libera(null)).not.toThrow();
    man.monta({} as never); expect(scene.children).toHaveLength(1);
  });
});

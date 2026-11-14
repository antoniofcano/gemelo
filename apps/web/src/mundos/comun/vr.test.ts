// La VR (A3-6c, MU5-n; antes 29_vr.js), en Node y sin GPU, con el three de verdad y dobles de WebXR (navigator.xr, la sesión, renderer.xr con sus mandos), del DOM (lienzos 2D de mentira)
// y del legado (el gestor de mundos, el paseo, la Cola, el Bus…). Se prueba cada pieza:
//   · el rig: ir a un punto deja la cabeza allí sin girar la mirada; el giro por saltos (palanca derecha) gira el rig 30° en torno a la cabeza, que no se mueve;
//   · el teletransporte: el arco cae dentro del mundo y no fuera; un salto corto es inmediato y uno largo va por el fundido a negro;
//   · el panel: PanelVR registra y quita filas, y el panel pinta sus pestañas y «Salir de VR» abajo;
//   · L2-06, la fuga por sesión: diez sesiones (entrar, unos fotogramas, salir) no crean geometrías, materiales ni texturas, ni dejan escuchas en la sesión cerrada, ni el XRFrame;
//   · libera(): suelta todo lo que la VR creó (geometrías, materiales y texturas, con sus eventos «dispose»), quita las escuchas de los mandos, del Bus, el botón y los ganchos.
// HONESTIDAD: aquí no hay renderer.info (sin GPU) ni WebXR de verdad; lo que se cuenta son las creaciones y los «dispose» de three. La medida en el navegador es memoria_vr_chrome.test.js
// (banco, WebXR simulado); en el Quest, NO probado.
import { describe, expect, it } from "vitest";
import { MATERIAL_VINETA, creaVr, defVineta } from "./vr.ts";
import type { DepsVr } from "./vr-tipos.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { VrControlPuro } from "../../nucleo/presupuesto.ts";
import { creaRender } from "../../nucleo/render.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const T0: A = await import(/* @vite-ignore */ "three" as string);

/** un THREE que cuenta lo vivo: geometrías, materiales y texturas creadas que aún no han lanzado «dispose» */
function threeContado() {
  const vivos = new Set<A>();
  const cuenta = (C: A) => class extends C { constructor(...a: A[]) { super(...a); vivos.add(this); (this as A).addEventListener("dispose", () => vivos.delete(this)); } };
  const T: A = Object.create(T0);
  for (const k of Object.keys(T0)) if (/(Geometry|Material|Texture)$/.test(k) && typeof T0[k] === "function" && T0[k].prototype && T0[k].prototype.dispose) T[k] = cuenta(T0[k]);
  return { T, vivos };
}
/** un lienzo 2D que no pinta (Node no tiene canvas) */
function lienzo() {
  const cx: A = new Proxy({}, { get: (o: A, k: string) => k in o ? o[k] : k === "measureText" ? () => ({ width: 10 }) : () => undefined, set: (o: A, k: string, v: A) => { o[k] = v; return true; } });
  return { width: 0, height: 0, getContext: () => cx };
}
function monta(opc?: { busqueda?: string; parcelas?: A[] }) {
  const { T, vivos } = threeContado();
  const ctl = [new T.Group(), new T.Group()], grip = [new T.Group(), new T.Group()];
  const bus: Record<string, ((x?: A) => void)[]> = {};
  const Bus = { on: (ev: string, fn: A) => { (bus[ev] = bus[ev] || []).push(fn); return () => { bus[ev] = (bus[ev] || []).filter(f => f !== fn); }; },
    emite: (ev: string, x?: A) => { (bus[ev] || []).slice().forEach(f => f(x)); return (bus[ev] || []).length; } };
  const sesiones: A[] = [];
  const navegador: A = new EventTarget();
  navegador.xr = Object.assign(new EventTarget(), {
    isSessionSupported: () => Promise.resolve(true),
    requestSession: () => { const s: A = new EventTarget(), add = s.addEventListener.bind(s), quita = s.removeEventListener.bind(s); s.n = 0; s.addEventListener = (t: string, f: A) => { s.n++; add(t, f); }; s.removeEventListener = (t: string, f: A) => { s.n--; quita(t, f); }; s.end = () => s.dispatchEvent(new Event("end")); s.requestReferenceSpace = () => Promise.resolve({}); sesiones.push(s); return Promise.resolve(s); }
  });
  let bucle: A = null;
  const renderer: A = { xr: { enabled: false, isPresenting: false, getController: (i: number) => ctl[i], getControllerGrip: (i: number) => grip[i], setReferenceSpaceType() { /* doble */ },
    setFramebufferScaleFactor() { /* doble */ }, setSession: () => Promise.resolve(), getReferenceSpace: () => ({}) }, setAnimationLoop: (f: A) => { bucle = f; },
    getRenderTarget: () => null, compilados: [] as A[], compileAsync(this: A, o: A, c: A) { this.compilados.push({ o, c, destino: this.getRenderTarget() }); return Promise.resolve(); } };
  const mv = { isWebGLMultiviewRenderTarget: true, numViews: 2 }, camXr = { xr: true };
  const Render = creaRender({}); Render.enlaza({ rd: renderer, escena: null, camara: null, camaraXr: () => (renderer.xr.enabled ? camXr : null), destinoXr: () => (renderer.xr.enabled ? mv : null) });
  const scene = new T.Scene(), camera = new T.PerspectiveCamera();
  const botones: Record<string, A> = {};
  const elemento = (tag: string) => {
    if (tag === "canvas") return lienzo();
    const e: A = new EventTarget(); e.tagName = tag.toUpperCase(); e.parentNode = { insertBefore: (b: A) => { botones[b.id] = b; b.parentNode = e.parentNode; }, removeChild: (b: A) => { delete botones[b.id]; } }; return e;
  };
  const ref = elemento("button"); ref.className = "boton";
  const documento: A = { createElement: elemento, title: "Gemelo" };
  const $ = (id: string) => id === "btnPantalla" ? ref : botones[id] || null;
  const quitados: string[] = [], estado: A = { paseando: false, primera: false, teclas: {} }, persona = { visible: true }, ventana: A = {};
  const gm: A = { suelo: () => 0, dentro: (x: number, y: number) => Math.abs(x) < 100 && Math.abs(y) < 100, obstaculo: () => null,
    ambiente: () => ({ cielo: "exterior", fondo: null, niebla: null, luces: [], camara: { near: 0.5, far: 5000, vr: { near: 0.1, far: 6000 } }, exag: 1 }) };
  const d: DepsVr = {
    THREE: T, renderer, scene, camera, Estado: { modo: "gem", calidad: 1, exag: 1 }, sol: { position: { y: 1 }, intensity: 1 }, texColor: (t: A) => t,
    D: {}, $, fmt: (n: number) => String(n), VRP: { on: false, hierba: 0 }, Aparato: { modelo: () => "quest3" }, suelo: () => 0, copas: () => [],
    Cola: { cancela() { /* doble */ }, add() { /* doble */ } }, ComponentesPuro: { valorUrl: () => null }, Bus, Config: { al: (f: A) => f(), param: (_k: string, v: A) => v },
    LaminasPuro: { nace: () => ({ x: 0, y: 1.4, z: -1, rotY: 0 }), mirando: () => 0, desvio: () => 0, miradaH: () => ({ x: 0, z: -1 }), agarra: () => ({}), arrastra: () => ({ x: 0, y: 0, z: 0, rotY: 0 }) },
    Laminas: { bajoRayo: () => null, info: () => null, mueve() { /* doble */ }, toca: () => false, apunta() { /* doble */ } },
    EntidadesPuro: { lineas: () => [] }, Entidades: { lista: () => null, ficha: () => null },
    Usables: { presentador: () => () => { quitados.push("presentador"); }, abierta: () => null, usa: () => false, cierra() { /* doble */ }, rayo: () => false },
    XrPerillas: { efectivas: { escala: 0.9, near: 0.1, nivel: null, fov: 1, hz: 72, ignorados: [] }, antes() { /* doble */ }, despues() { /* doble */ }, mvEnUso() { /* doble */ }, fijo: () => false,
      js: () => 8, jsSube: () => 6, estable: () => 10, gente: () => 0, linea: () => "", mv: null, aa: "" },
    VrControlPuro: VrControlPuro, VrPresupuesto: { ponEscalon() { /* doble */ }, mueve() { /* doble */ }, suelo: () => 0, escalonPorPasos: function* () { /* nada */ } },
    InfoDibujo: { fotograma: () => ({}) }, Materiales: creaMateriales({ THREE: T as unknown as ThreeMin, busqueda: "" }), UN: { uBumpK: { value: 1 } },
    Arboles: { perfil() { /* doble */ }, resumen: () => ({}) }, Render, Escena3D: { perfil() { /* doble */ }, resumen: () => ({ estado: "listo" }) }, pon: (m: string) => { d.Estado.modo = m; },
    NDV: () => null, ndviIdx: () => 0, parcelas: () => (opc && opc.parcelas) || [{ nombre: "Sintética", centro: [10, 20], finca: 0 }], fincas: () => [], meta: { ms: 0 }, pasoHoraMundo() { /* doble */ }, horaMundoTexto: () => "12:00",
    paseando: () => estado.paseando, primera: () => estado.primera, ponPrimera: (v: boolean) => { estado.primera = v; }, persona: () => persona, teclas: () => estado.teclas, pp: { x: 0, y: 0, ang: 0, paso: 0 },
    entraPaseo: () => { estado.paseando = true; }, salePaseo: () => { estado.paseando = false; }, actualizaPaseo() { /* doble */ },
    Llegada: { borra() { /* doble */ }, apunta: () => null, punto: () => null, alAnillo() { /* doble */ } }, pendFactor: () => 1, TR: { act: false }, Ajustes: () => null,
    gm: () => gm, cuadro() { /* doble */ }, tamano() { /* doble */ }, pideFotograma() { /* doble */ },
    busqueda: (opc && opc.busqueda) || "", navegador, documento, ventana
  };
  const vr = creaVr(d);
  return { vr, d, T, vivos, ctl, grip, bus, sesiones, scene, camera, botones, ventana, navegador, renderer, quitados, mv, camXr, bucle: () => bucle };
}
const espera = () => new Promise(r => setTimeout(r, 0));
const escuchas = (o: A) => Object.values(o._listeners || {}).reduce((s: number, l: A) => s + l.length, 0);
const cuantos = (bus: Record<string, unknown[]>) => Object.values(bus).reduce((s, l) => s + l.length, 0);
async function sesion(m: ReturnType<typeof monta>, fotogramas = 3) {
  await m.vr.entraVR();
  expect(m.vr.VRX.on).toBe(true);
  for (let i = 0; i < fotogramas; i++) { m.vr.VRX.frame = { getViewerPose: () => null }; m.vr.vrActualiza(1 / 72); }
  const s = m.sesiones[m.sesiones.length - 1]; s.end();
  expect(m.vr.VRX.on).toBe(false);
  return s;
}

describe("VR: el rig y la cámara", () => {
  it("ir a un punto lleva la cabeza allí (con la altura del suelo del mundo activo y los ojos) sin cambiar la mirada", async () => {
    const m = monta(); await espera();
    m.camera.position.set(0.3, 1.6, -0.2);   // la pose local de la cabeza dentro del rig
    m.vr.partes.rig.vrIrA(12, 34);
    const h = m.vr.partes.rig.vrCabeza();
    expect(h.x).toBeCloseTo(12); expect(h.z).toBeCloseTo(-34); expect(m.vr.VRX.rig.yaw).toBe(0); expect(m.vr.VRX.salto).toBe(true);
  });
  it("el giro por saltos (palanca derecha a un lado) gira el rig 30° en torno a la cabeza, que se queda donde estaba", async () => {
    const m = monta(); await espera();
    await m.vr.entraVR();
    const R = m.vr.partes.rig.VRC[1]; R.src = { handedness: "right", gamepad: { axes: [0, 0, 1, 0], buttons: [] } }; R.mano = "right";
    m.camera.position.set(0, 1.6, 0); m.vr.VRX.frame = null;
    const antes = m.vr.partes.rig.vrCabeza().clone(), yaw0 = m.vr.VRX.rig.yaw;
    m.vr.vrActualiza(1 / 72);
    expect(m.vr.VRX.rig.yaw - yaw0).toBeCloseTo(-30 * Math.PI / 180);
    const h = m.vr.partes.rig.vrCabeza(); expect(h.x).toBeCloseTo(antes.x); expect(h.z).toBeCloseTo(antes.z);
    m.vr.vrActualiza(1 / 72); expect(m.vr.VRX.rig.yaw - yaw0).toBeCloseTo(-30 * Math.PI / 180);   // mantener la palanca no gira otra vez (hay que soltarla)
    m.sesiones[0].end();
  });
});

describe("VR: el teletransporte", () => {
  it("el arco desde el mando cae al suelo dentro del mundo; si cae fuera de la caja (gm.dentro), no hay punto", async () => {
    const m = monta(); await espera();
    const o = { c: new m.T.Object3D() }; o.c.position.set(0, 1.5, 0); o.c.rotation.x = -0.3;
    const p = m.vr.partes.tele.vrArco(o); expect(p).not.toBeNull(); expect(p.z).toBeLessThan(0);
    o.c.position.set(95, 1.5, 0); o.c.rotation.set(0, -Math.PI / 2, 0); o.c.rotateX(0.2);   // hacia el este, desde el borde: cae fuera
    expect(m.vr.partes.tele.vrArco(o)).toBeNull();
  });
  it("un salto corto (≤ 5 m) es inmediato; uno largo va por el fundido a negro y se hace a oscuras", async () => {
    const m = monta(); await espera();
    m.camera.position.set(0, 1.6, 0);
    let n = 0; expect(m.vr.partes.tele.vrSalta(2, 0, () => { n++; })).toBe(true); expect(n).toBe(1);
    expect(m.vr.partes.tele.vrSalta(50, 0, () => { n++; })).toBe(true); expect(n).toBe(1);
    for (let i = 0; i < 60 && n < 2; i++) { m.vr.partes.tele.vrFundidoPaso(1 / 60); await espera(); }
    expect(n).toBe(2);
  });
});

describe("VR: el panel", () => {
  it("PanelVR registra filas en su pestaña (sin repetir id) y las quita; una pestaña que no existe, nada", async () => {
    const m = monta(); await espera();
    const P = m.vr.PanelVR, antes = P.visibles("info").length;
    const q = P.filas("info", { id: "prueba", orden: 5, alto: 88 }); expect(typeof q).toBe("function");
    expect(P.filas("info", { id: "prueba", orden: 5, alto: 88 })).toBeNull();
    expect(P.filas("no-existe", { id: "x", alto: 10 })).toBeNull();
    expect(P.visibles("info").length).toBe(antes + 1); q!(); expect(P.visibles("info").length).toBe(antes);
    expect(P.visibles("mundo").map((f: A) => f.id)).toEqual(["modos", "hora", "fecha"]);
    expect(P.visibles("comodidad").map((f: A) => f.id)).toEqual(["vineta", "giro", "relieve"]);
  });
  it("al pintar: las cuatro pestañas en su fila y «Salir de VR» abajo; la pestaña Comodidad lleva la viñeta y el giro", async () => {
    const m = monta(); await espera();
    m.vr.partes.panel.vrPintaPanel();
    const B = m.vr.VRX.botones.map((b: A) => b.id);
    expect(B.slice(0, 4)).toEqual(["t_mundo", "t_ira", "t_comodidad", "t_info"]);
    expect(m.vr.VRX.botones.find((b: A) => b.id === "sal").y).toBe(984);
    m.vr.VRX.pestana = "comodidad"; m.vr.partes.panel.vrPintaPanel();
    expect(m.vr.VRX.botones.map((b: A) => b.id)).toEqual(expect.arrayContaining(["vig", "giro", "e-", "e+"]));
  });
});

describe("VR: L7-04, la precompilación al entrar", () => {
  it("compila la escena con la cámara XR y el destino de la sesión (el multiview), no con el lienzo; __vrDebug lo cuenta", async () => {
    const m = monta(); await espera();
    await m.vr.entraVR(); await espera();
    const c = (m.renderer as A).compilados;
    expect(c.length).toBe(1);
    expect(c[0].o).toBe(m.scene); expect(c[0].c).toBe(m.camXr); expect(c[0].destino).toBe(m.mv);
    expect(m.renderer.getRenderTarget()).toBeNull();   // el destino prestado se devuelve
    expect(m.vr.VRX.compila).toMatchObject({ via: "compileAsync", ok: true, mv: true });
  });
});

describe("VR: L7-13, un mundo sin parcelas", () => {
  it("entrar, pintar la pestaña «Ir a» y pulsar ◀/▶ no rompe: la parcela se pinta «–» y no hay salto", async () => {
    const m = monta({ parcelas: [] }); await espera();
    await m.vr.entraVR(); expect(m.vr.VRX.on).toBe(true);
    m.vr.VRX.pestana = "ira"; expect(() => m.vr.partes.panel.vrPintaPanel()).not.toThrow();
    const rig0 = JSON.stringify(m.vr.VRX.rig);
    expect(() => { m.vr.partes.panel.vrParcela(1); m.vr.partes.panel.vrParcela(-1); }).not.toThrow();
    expect(m.vr.VRX.parcSel).toBe(0); expect(JSON.stringify(m.vr.VRX.rig)).toBe(rig0);
  });
});

describe("VR: L2-06, nada crece por sesión", () => {
  it("diez sesiones: ni geometrías, ni materiales, ni texturas nuevas; la escena como estaba; sin escuchas en la sesión cerrada; sin el último XRFrame", async () => {
    const m = monta(); await espera();
    const vivos0 = m.vivos.size, hijos0 = m.scene.children.length, bus0 = cuantos(m.bus), ctl0 = escuchas(m.ctl[0]) + escuchas(m.ctl[1]);
    for (let i = 0; i < 10; i++) {
      const s = await sesion(m);
      expect(m.vivos.size).toBe(vivos0);
      expect(m.scene.children.length).toBe(hijos0);
      expect(s.n).toBe(0);   // la escucha «end» de la sesión cerrada se quitó
      expect(m.vr.VRX.frame).toBeNull();
      expect(cuantos(m.bus)).toBe(bus0);
      expect(escuchas(m.ctl[0]) + escuchas(m.ctl[1])).toBe(ctl0);
    }
    expect(m.vr.VRX.sesionesN).toBe(10);
  });
});

describe("VR: libera() suelta de verdad", () => {
  it("todo lo creado (rayos, arco, marca, línea, velo, viñeta y las tres láminas con su textura) lanza «dispose»; sin escuchas, botón ni ganchos", async () => {
    const m = monta(); await espera();
    expect(m.botones.btnVR).toBeTruthy(); expect(typeof m.ventana.__vrDebug).toBe("function"); expect(typeof m.ventana.__vrVuelo).toBe("function");
    expect(m.vivos.size).toBeGreaterThan(0);
    m.vr.libera();
    expect(m.vivos.size).toBe(0);
    expect(escuchas(m.ctl[0]) + escuchas(m.ctl[1])).toBe(0);
    expect(cuantos(m.bus)).toBe(0);
    expect(m.quitados).toContain("presentador");
    expect(m.botones.btnVR).toBeUndefined();
    for (const g of ["__vrDebug", "__vrPerfil", "__vrOlivo", "__vrBotones", "__vrVuelo"]) expect(m.ventana[g]).toBeUndefined();
    expect(() => m.vr.libera()).not.toThrow();
  });
  it("con una sesión abierta, libera() la cierra como al salir (y la escena vuelve a como estaba)", async () => {
    const m = monta(); await espera();
    const hijos0 = m.scene.children.length;
    await m.vr.entraVR(); expect(m.scene.children.length).toBeGreaterThan(hijos0);
    m.vr.libera();
    expect(m.vr.VRX.on).toBe(false); expect(m.scene.children.length).toBe(hijos0); expect(m.vivos.size).toBe(0);
  });
  it("monta() tras libera(): vuelven las escuchas de los mandos, las filas del panel y el botón", async () => {
    const m = monta(); await espera();
    const ctl0 = escuchas(m.ctl[0]); m.vr.libera(); expect(escuchas(m.ctl[0])).toBe(0);
    m.vr.monta();
    expect(escuchas(m.ctl[0])).toBe(ctl0); expect(m.vr.PanelVR.visibles("mundo").length).toBe(3); expect(m.botones.btnVR).toBeTruthy();
  });
  it("los materiales salen de la fábrica con dueño «vr» (10: los dos rayos, el arco, su marca, la línea, el velo, las tres láminas y la viñeta) y libera() los suelta", async () => {
    const m = monta(); await espera();
    expect(m.d.Materiales.duenos()["vr"]).toBe(10);
    m.vr.libera();
    expect(m.d.Materiales.duenos()["vr"] || 0).toBe(0);
  });
  it("la viñeta (vineta-vr) es el ShaderMaterial de siempre: el mismo código, el mismo estado de dibujo, la misma clave de programa y los mismos uniformes", () => {
    const m = monta(), v = m.vr.vrVineta.material;
    const a = new T0.ShaderMaterial({ uniforms: { uK: { value: 0 }, uA: { value: 0.4 } }, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float uK; uniform float uA; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(uA, uA + 0.34, r) * uK; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }" });
    expect(v.isShaderMaterial).toBe(true);
    for (const k of ["vertexShader", "fragmentShader", "transparent", "depthTest", "depthWrite", "fog"]) expect(v[k]).toEqual(a[k]);
    expect(v.customProgramCacheKey()).toBe(a.customProgramCacheKey());
    expect(Object.keys(v.uniforms)).toEqual(["uK", "uA"]);
    expect(m.d.Materiales.ruta("vineta-vr")).toBe("clasico");
  });
  it("la variante TSL de la viñeta (apagada): con three/webgpu y three/tsl de verdad, un MeshBasicNodeMaterial con su opacityNode, el estado del clásico, y solo con el renderer nuevo", async () => {
    const rutaW = "three/webgpu", rutaT = "three/tsl";   // por variable: three no trae tipos (y así tampoco entra en el grafo de dependency-cruiser)
    const W = await import(/* @vite-ignore */ rutaW), Tn = await import(/* @vite-ignore */ rutaT);
    const nuevo = creaMateriales({ THREE: T0 as unknown as ThreeMin, render: { tipo: "nuevo", pedido: "nuevo" }, nodos: () => ({ THREE: W, TSL: Tn }) });
    const clasico = creaMateriales({ THREE: T0 as unknown as ThreeMin, busqueda: "" });
    for (const M of [nuevo, clasico]) M.define(MATERIAL_VINETA, defVineta());
    expect(nuevo.ruta(MATERIAL_VINETA)).toBe("tsl"); expect(clasico.ruta(MATERIAL_VINETA)).toBe("clasico");
    const u = { uK: { value: 0 }, uA: { value: 0.4 } };
    const m = nuevo.crea(MATERIAL_VINETA, { uniforms: u }) as A;
    expect(m.isNodeMaterial).toBe(true); expect(m.type).toBe("MeshBasicNodeMaterial"); expect(m.opacityNode).toBeTruthy(); expect(m.colorNode).toBeTruthy();
    expect(m.transparent).toBe(true); expect(m.depthTest).toBe(false); expect(m.depthWrite).toBe(false); expect(m.fog).toBe(false);
    expect(clasico.crea(MATERIAL_VINETA, { uniforms: u })).toMatchObject({ type: "ShaderMaterial" });
    expect(nuevo.cobertura()[MATERIAL_VINETA]).toMatchObject({ clasico: true, tsl: true });
  });
  it("el componente es de todos los mundos y solo de ciclo de vida", () => {
    const m = monta(), c = m.vr.componente;
    expect(c.id).toBe("vr"); expect(c.mundos).toBe("todos"); expect(c.fases).toEqual({});
  });
});

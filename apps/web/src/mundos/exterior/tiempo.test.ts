// El tiempo del exterior (A3-4, MU5-n; antes 15_tiempo.js). Con el three de verdad (sin GPU: geometrías, materiales y texturas existen sin renderizador), un DOM
// de mentira y relojes de mentira. Se comprueba: lo puro (el reloj del mundo y el rótulo de la chapita, L8-05), el parche del tiempo y su vuelta atrás, y sobre todo
// el ciclo de vida: libera() suelta cada geometría, material y textura que creó (L2-05) y para sus relojes y quita sus escuchas (L2-11).
// HONESTIDAD: nada se dibuja; lo que se ve lo dice el banco.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { creaParcheTiempo } from "./tiempo-parche.ts";
import { TiempoPuro, creaFormatos, creaReloj, ZONA } from "./tiempo-puro.ts";
import { creaTiempo, manifiestoTiempo } from "./tiempo.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const THREE: A = await import(/* @vite-ignore */ "three" as string);
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };   // el de 04d

/** un THREE que cuenta las geometrías y las texturas vivas (creadas y no liberadas): la prueba de memoria sin GPU (lo que renderer.info.memory contaría al dibujarlas) */
function contado() {
  const vivas = { geo: 0, tex: 0 };
  const cuenta = (o: A, k: "geo" | "tex") => { vivas[k]++; let ya = false; o.addEventListener("dispose", () => { if (!ya) { ya = true; vivas[k]--; } }); };
  class Geo extends THREE.BufferGeometry { constructor() { super(); cuenta(this, "geo"); } }
  class Ico extends THREE.IcosahedronGeometry { constructor(...a: A[]) { super(...a); cuenta(this, "geo"); } }
  class Lienzo extends THREE.CanvasTexture { constructor(...a: A[]) { super(...a); cuenta(this, "tex"); } }
  class Datos extends THREE.DataTexture { constructor(...a: A[]) { super(...a); cuenta(this, "tex"); } }
  return { T: Object.assign({}, THREE, { BufferGeometry: Geo, IcosahedronGeometry: Ico, CanvasTexture: Lienzo, DataTexture: Datos }), vivas };
}
/** un elemento del DOM de mentira que lleva la cuenta de sus escuchas */
function elemento() {
  const oy: Record<string, A[]> = {};
  return {
    oy, style: {} as A, attrs: {} as A, textContent: "", innerHTML: "", hidden: false, value: "", disabled: false, max: 0,
    addEventListener(ev: string, fn: A) { (oy[ev] = oy[ev] || []).push(fn); },
    removeEventListener(ev: string, fn: A) { const l = oy[ev] || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    setAttribute(k: string, v: A) { this.attrs[k] = v; }, removeAttribute(k: string) { delete this.attrs[k]; },
    escuchas() { return Object.values(oy).reduce((a, l) => a + l.length, 0); },
    dispara(ev: string) { (oy[ev] || []).slice().forEach(f => f({})); }
  };
}
function lienzo() {
  const g = { addColorStop() {} };
  return { width: 0, height: 0, getContext: () => ({ createRadialGradient: () => g, fillRect() {}, set fillStyle(_v: A) {} }) };
}
/** relojes de mentira: setInterval apunta y clearInterval quita */
function temporizador() {
  const vivos = new Map<number, () => void>(); let n = 0;
  return { vivos, setInterval(fn: () => void) { vivos.set(++n, fn); return n; }, clearInterval(id: A) { vivos.delete(id); } };
}
const IDS = ["tEstado", "tEst", "tPrev", "tMomento", "tMomentoV", "tAhora", "tResumen", "tControl", "tDemo", "tPlay", "tLeer", "tVerMundo", "tFlecha", "tInsT", "tIns", "tLinea"];
function monta(o: { T?: A; api?: A; prueba?: A; estimado?: () => boolean; F?: A } = {}) {
  const T = o.T || THREE, els: Record<string, A> = {}; IDS.forEach(id => { els[id] = elemento(); });
  const F = o.F || creaMateriales({ THREE: T as unknown as ThreeMin, busqueda: "" });
  const tema: A[] = [], bus: Record<string, A[]> = {}, tm = temporizador(), emitidos: string[] = [];
  const Bus = { emite(ev: string) { emitidos.push(ev); (bus[ev] || []).forEach(f => f()); return 0; }, on(ev: string, fn: A) { (bus[ev] = bus[ev] || []).push(fn); return () => { bus[ev] = (bus[ev] || []).filter(f => f !== fn); }; }, hay: (ev: string) => ev === "prevision:alterna" };
  const mats = { matHojaG: new T.PointsMaterial(), matHojaP: new T.PointsMaterial(), matCorteza: new T.PointsMaterial(), matSuelo: new T.MeshLambertMaterial(), matOrto: new T.MeshBasicMaterial(), nube: { material: new T.PointsMaterial() } };
  const scene = new T.Scene(); scene.fog = new T.Fog(0xaaaaaa, 100, 900);
  const gLinde = new T.Group();
  const respuesta = (cuerpo: A) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) });
  const tiempo = creaTiempo(Object.assign({
    THREE: T, scene, camera: new T.PerspectiveCamera(), sol: new T.DirectionalLight(), hemi: new T.HemisphereLight(), SRGB: T.SRGBColorSpace, LUZ_SOL: 1, LUZ_CIELO: 1,
    colorCss: () => new T.Color(0x87b5e0), colorVertSRGB: () => {}, texColor: (t: A) => { t.colorSpace = T.SRGBColorSpace; return t; },
    FOG0: 120, FOG1: 1200, parcelas: [{ linde: [[0, 0], [40, 0], [40, 30]] }, { linde: [[100, 100], [140, 100], [140, 150], [100, 150]] }], hash,
    gLinde, Estaticos: { congela() {} }, suelo: () => 10, Estado: { exag: 1 }, objetivo: new T.Vector3(),
    estimado: o.estimado || null, ocasoFotos: false, $: (id: string) => els[id] || null, lienzo, Bus,
    prefijoApi: () => o.api ? "/api/" : null, red: () => o.api ? () => respuesta(o.api) : null, prueba: () => o.prueba || null,
    busqueda: "?hora=2026-06-21T12:00", reloj: () => Date.UTC(2026, 5, 21, 10), calma: false, temporizador: tm, Materiales: F,
    alCambiarTema: (fn: A) => { tema.push(fn); return () => { const i = tema.indexOf(fn); if (i >= 0) tema.splice(i, 1); }; }
  }, mats));
  return { tiempo, els, tema, bus, tm, scene, gLinde, mats, emitidos, F };
}

describe("el tiempo del exterior: lo puro", () => {
  it("L8-05: la chapita rotula «estimado» con la estación de otra fecha; los ejemplos ganan; luego simulado y prueba", () => {
    expect(TiempoPuro.rotuloOrigen("", "vigia", false)).toBe("");
    expect(TiempoPuro.rotuloOrigen("", "vigia", true)).toBe(" · estimado");
    expect(TiempoPuro.rotuloOrigen("", "simulado", true)).toBe(" · estimado");
    expect(TiempoPuro.rotuloOrigen("niebla", "simulado", true)).toBe(" · ejemplo");
    expect(TiempoPuro.rotuloOrigen("", "simulado", false)).toBe(" · simulado");
    expect(TiempoPuro.rotuloOrigen("", "fixture", false)).toBe(" · prueba");
  });
  it("el reloj del mundo, de forma pura: sin parámetros el de la máquina; ?hora= lo fija; ?fecha= corre días enteros", () => {
    const fmt = creaFormatos(ZONA).fmtClaveDia, ms = Date.UTC(2026, 10, 6, 9, 30);
    expect(creaReloj("", fmt, () => ms).ahoraMs()).toBe(ms);
    expect(creaReloj("?hora=2026-01-02T08:00", fmt, () => ms).ahoraMs()).toBe(Date.parse("2026-01-02T08:00"));
    const r = creaReloj("?fecha=2026-04-15", fmt, () => ms); expect(fmt.format(new Date(r.ahoraMs()))).toBe("2026-04-15");
    expect(r.fechaFija).toBe("2026-04-15"); expect(r.horaFija).toBe(null);
  });
});

describe("el parche del tiempo (MATERIALES §1, fila 2)", () => {
  it("lleva la sombra de nubes y la helada (y el viento al follaje) con los MISMOS uniformes; suelta() devuelve a cada material lo que tenía", () => {
    const P = creaParcheTiempo({ THREE, colorVertSRGB: () => {} });
    const sh = { uniforms: {} as A, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    P.parcheTiempo(sh, true);
    expect(sh.uniforms.uDrift).toBe(P.uSombra.uDrift); expect(sh.uniforms.uT).toBe(P.uViento.uT);
    expect(sh.vertexShader).toContain("vSomb = ot_sombra(position.xz);"); expect(sh.vertexShader).toContain("transformed.xz += uDir");
    expect(sh.fragmentShader).toContain("gl_FragColor.rgb *= vSomb;");
    // lo que ya pasaba (hallazgo de A3-4, sin cambiarlo): el sombreador de puntos de three 0.186 no tiene <dithering_fragment>, así que en el follaje de puntos
    // (matHojaG, matHojaP, matCorteza) y en la nube LiDAR el parche calcula vSomb y mueve las hojas con el viento, pero no oscurece ni escarcha el color
    const pt = { uniforms: {} as A, vertexShader: THREE.ShaderLib.points.vertexShader, fragmentShader: THREE.ShaderLib.points.fragmentShader };
    P.parcheTiempo(pt, true); expect(pt.vertexShader).toContain("transformed.xz += uDir"); expect(pt.fragmentShader).not.toContain("*= vSomb");
    const previo = () => {}, m = new THREE.MeshLambertMaterial(); m.onBeforeCompile = previo;
    P.aplica(m, false); expect(m.onBeforeCompile).not.toBe(previo);
    expect(P.suelta()).toBe(1); expect(m.onBeforeCompile).toBe(previo); expect(P.suelta()).toBe(0);
  });
});

describe("el tiempo del exterior: el componente", () => {
  it("monta: cuelga el cielo y la lluvia, una barrera por linde, parchea los seis materiales del ciclo del día y pinta la chapita al pasar el tiempo", () => {
    const { tiempo, scene, gLinde, mats, els } = monta();
    expect(scene.children.length).toBe(4);   // el grupo de las nubes, el sol, las estrellas y la lluvia
    expect(gLinde.children.length).toBe(2); expect(tiempo.lindes.length).toBe(2);
    for (const m of [mats.matHojaG, mats.matHojaP, mats.matCorteza, mats.matSuelo, mats.matOrto, mats.nube.material]) expect(typeof m.onBeforeCompile).toBe("function");
    tiempo.actualiza(0.3); expect(scene.background).toBeTruthy(); expect(els.tInsT.textContent).toMatch(/°C/);
    expect(els.tInsT.textContent).toMatch(/· simulado$/);
    tiempo.libera();
  });
  it("MU5-n (2.º commit): sus materiales salen de la fábrica con su nombre; los del tiempo, con su dueño, y el parche de los seis del ciclo del día, sin dueño (no son suyos)", () => {
    const { tiempo, F, mats } = monta();
    expect(F.inventario()).toMatchObject({ "parche-tiempo": { tipo: "define", n: 6 }, nubes: { tipo: "define", n: 1 }, lluvia: { tipo: "define", n: 1 }, barrera: { tipo: "define", n: 1 } });
    expect(F.duenos()).toEqual({ "tiempo-mundo": 5 });   // nubes, sol, estrellas, lluvia y barrera
    expect(F.ruta("nubes")).toBe("clasico"); expect(F.ruta("parche-tiempo")).toBe("clasico");
    const n = tiempo.cielo.nubesMalla.material; expect(n.isShaderMaterial && n.transparent && !n.depthWrite && !n.fog).toBe(true);
    expect(n.fragmentShader).toContain("#include <tonemapping_fragment>"); expect(tiempo.barreras.matBarrera.side).toBe(THREE.DoubleSide);
    expect(tiempo.lluvia.lluvia.material.uniforms).toBe(tiempo.lluvia.uLluvia);   // los MISMOS uniformes que mueve el paso
    expect(typeof mats.matHojaG.onBeforeCompile).toBe("function");   // con el clásico, el MISMO material, parcheado
    tiempo.libera(); expect(F.duenos()).toEqual({}); expect(mats.matHojaG.onBeforeCompile).toBe(THREE.Material.prototype.onBeforeCompile);   // el de three, como antes de montarse
  });
  it("L8-05: con la estación de otra fecha, la chapita dice «estimado»", () => {
    const { tiempo, els } = monta({ estimado: () => true });
    tiempo.actualiza(0.3); expect(els.tInsT.textContent).toMatch(/· estimado$/);
    tiempo.libera();
  });
  it("memoria (L2-05): montar, mover el tiempo y liberar deja las geometrías y las texturas vivas como estaban, y saca todo de la escena y de gLinde", () => {
    const { T, vivas } = contado(), antes = { ...vivas };
    const { tiempo, scene, gLinde } = monta({ T });
    for (let i = 0; i < 20; i++) tiempo.actualiza(0.05);
    expect(vivas.geo - antes.geo).toBe(5);   // las nubes, las estrellas, la lluvia y las dos barreras
    expect(vivas.tex - antes.tex).toBe(2);   // la textura de las nubes y la del sol
    let sueltos = 0; [tiempo.cielo.nubesMalla.material, tiempo.cielo.sprSol.material, tiempo.cielo.estrellas.material, tiempo.lluvia.lluvia.material, tiempo.barreras.matBarrera].forEach((m: A) => m.addEventListener("dispose", () => { sueltos++; }));
    expect(tiempo.libera()).toBeGreaterThan(0);
    expect(vivas).toEqual(antes); expect(sueltos).toBe(5);
    expect(scene.children.length).toBe(0); expect(gLinde.children.length).toBe(0);
    expect(tiempo.libera()).toBe(0); expect(sueltos).toBe(5);   // dos veces no libera dos veces
  });
  it("L2-11: con la api, la relectura cada 10 min y «Reproducir» son relojes que libera() para, y las escuchas del panel, del tema y del Bus se quitan", async () => {
    // lo mínimo que cumple el contrato (contratos/tiempo.schema.json): datos de prueba sintéticos, sin estación y con dos horas de previsión
    const api = { version: 1, origen: "fixture", avisos: [], consultadoEn: "2026-06-21T09:50:00Z", actual: null,
      prevision: { naturaleza: "modelado", horas: [{ instante: "2026-06-21T09:00:00Z", nubosidad: 30, temperatura: 22 }, { instante: "2026-06-21T10:00:00Z", nubosidad: 60, temperatura: 24 }] } };
    const { tiempo, els, tema, bus, tm, emitidos } = monta({ api });
    await tiempo.lectura;
    expect(tm.vivos.size).toBe(1);   // la relectura cada 10 min
    els.tPlay.dispara("click"); expect(tm.vivos.size).toBe(2);   // «Reproducir»
    els.tPlay.dispara("click"); expect(tm.vivos.size).toBe(1);   // «Pausa» para el suyo
    els.tPlay.dispara("click"); expect(tm.vivos.size).toBe(2);
    els.tVerMundo.dispara("click"); expect(emitidos).toEqual(["prevision:alterna"]);
    const conEscuchas = ["tMomento", "tAhora", "tDemo", "tPlay", "tLeer", "tVerMundo"];
    conEscuchas.forEach(id => expect(els[id].escuchas()).toBe(1));
    expect(tema.length).toBe(1); expect((bus["componentes:cambia"] || []).length).toBe(1);
    expect(tiempo.fichas.vivos()).toEqual({ relojes: 2, escuchas: 8 });
    tiempo.libera();
    expect(tm.vivos.size).toBe(0); conEscuchas.forEach(id => expect(els[id].escuchas()).toBe(0));
    expect(tema.length).toBe(0); expect((bus["componentes:cambia"] || []).length).toBe(0);
    expect(tiempo.fichas.vivos()).toEqual({ relojes: 0, escuchas: 0 });
  });
  it("el manifiesto vale, es de los mundos [exterior], monta el mismo objeto y su libera lo suelta", () => {
    const { tiempo, scene } = monta(), man = manifiestoTiempo(tiempo);
    expect(ComponentesPuro.valida(man)).toEqual([]); expect(man.id).toBe("tiempo-mundo"); expect(man.mundos).toEqual(["exterior"]);
    expect(man.monta({} as never)).toBe(tiempo);
    man.libera(tiempo as never); expect(scene.children.length).toBe(0); expect(() => man.libera(null)).not.toThrow();
  });
});

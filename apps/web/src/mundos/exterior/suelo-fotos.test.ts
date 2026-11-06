// El suelo de fotos del exterior (A3-1b, MU5-n; antes 04f_suelo_fotos.js). Con el three de verdad para las texturas (sin GPU: DataTexture y DataArrayTexture
// existen sin renderizador), una Cola, imágenes, lienzos y KTX2Loader de mentira. Lo puro (decide, ficheros, presupuesto, campo del ruedo, GLSL y sus
// anclas, el orden de formatos) lo prueba también pruebas/guardianes/suelo_fotos.test.js contra este mismo módulo. Aquí, sobre todo, el CICLO DE VIDA:
// cargar y liberar suelta cada textura que se creó (la del array, la del KTX2 que llega tarde, los campos del ruedo y el neutro), el KTX2Loader y el
// trabajo de la Cola. HONESTIDAD: nada se dibuja ni se mide en la GPU; el formato que elige detectSupport en el Quest o el iPhone no está probado.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { SueloFotosPuro as P, creaSueloFotos, manifiestoSueloFotos } from "./suelo-fotos.ts";
import type { DepsSueloFotos } from "./suelo-fotos.ts";

// three no trae tipos en el repo: se carga por variable (como materiales.test.ts) y se toca sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

/** cuenta los dispose de toda textura de three que se le apunta */
function espia() {
  const n = { textura: 0 };
  return { n, apunta(t: { addEventListener(e: string, f: () => void): void }) { t.addEventListener("dispose", () => { n.textura++; }); } };
}
/** una Cola de mentira: guarda el trabajo y lo corre entero cuando se le dice, como la de verdad al llegarle el turno */
function colaFalsa() {
  const pend = new Map<string, { gen: Generator<unknown, unknown, unknown>; fin: ((v: unknown) => void) | undefined }>(), canceladas: string[] = [];
  return {
    canceladas, pend,
    pon(k: string, _p: number, gen: Generator<unknown, unknown, unknown>, fin?: (v: unknown) => void) { if (pend.has(k)) return false; pend.set(k, { gen, fin }); return true; },
    cancela(k: string) { canceladas.push(k); pend.delete(k); },
    corre() { for (const [k, t] of [...pend]) { pend.delete(k); let r = t.gen.next(); while (!r.done) r = t.gen.next(); t.fin?.(r.value); } },
  };
}
const lienzoFalso = (px: number) => ({ width: px, height: px, getContext: () => ({ clearRect() {}, drawImage() {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }) }) });
const esperaMicrotareas = async (n = 8) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

function monta(busqueda: string, extra: Partial<DepsSueloFotos> = {}) {
  const cola = colaFalsa(), avisos: string[] = [], vr = { v: false };
  const copas = [{ x: 10, y: 10, oliv: true, perfil: [2, 2, 2, 2, 2, 2, 2, 2] }];
  const deps: DepsSueloFotos = {
    THREE, Aparato: { clase: () => "escritorio", vr: () => vr.v }, Mundo: { TS: 256 }, copas, ColaExt: cola, renderer: {}, busqueda,
    imagen: () => Promise.resolve({ width: 4, height: 4 }), lienzo: lienzoFalso, consola: { warn: (...a: unknown[]) => { avisos.push(String(a[0])); } }, ...extra,
  };
  return { S: creaSueloFotos(deps), cola, avisos, vr, deps };
}

describe("suelo de fotos: apagado por defecto", () => {
  it("sin la bandera no carga nada, no pide trabajo a la Cola ni crea texturas; libera no rompe", () => {
    const { S, cola } = monta("");
    expect(S.activo).toBe(false);
    S.actualiza(); S.actualiza(); expect(cola.pend.size).toBe(0); expect(S.resumen()).toMatchObject({ activo: false, hecho: false, campos: 0, gpuMB: null });
    expect(() => S.libera()).not.toThrow();
  });
  it("el ajuste guardado (vista.suelo) lo enciende y la URL manda sobre él", () => {
    expect(monta("", { ajuste: () => true }).S.activo).toBe(true);
    expect(monta("?suelo=0", { ajuste: () => true }).S.activo).toBe(false);
    expect(monta("?suelo=fotos", { ajuste: () => false }).S.activo).toBe(true);
  });
});

describe("suelo de fotos: ciclo de vida de lo que crea", () => {
  it("WebP: carga por la Cola, se enciende (en VR, solo con ?sueloVR=1) y libera() suelta la textura en array, los campos del ruedo y el neutro", async () => {
    const { S, cola, vr } = monta("?suelo=fotos&suelofmt=png"), sp = espia();
    S.actualiza(); expect(cola.pend.size).toBe(0);   // las imágenes aún no han llegado
    await esperaMicrotareas(); expect(cola.pend.has("SF")).toBe(true);
    cola.corre(); await esperaMicrotareas();
    const r = S.resumen(); expect(r).toMatchObject({ hecho: true, cargado: "png", px: 768 });
    expect(r.gpuMB).toBe(P.presupuesto(768).texturaMB);
    const t = S.U.uFot.value; expect(t.isDataArrayTexture).toBe(true); expect(t.image.depth).toBe(P.CAPAS); sp.apunta(t);
    const c1 = S.campo({ ox: 0, oy: 0 }), c2 = S.campo({ ox: 256, oy: 0 }), neutro = S.rueNeutro(); [c1, c2, neutro].forEach(sp.apunta);
    expect(S.rueNeutro()).toBe(neutro); expect(S.resumen().campos).toBe(2);
    S.actualiza(); expect(S.U.uFotK.value).toBe(1);
    vr.v = true; S.actualiza(); expect(S.U.uFotK.value).toBe(0); expect(monta("?suelo=fotos&sueloVR=1").vr.v).toBe(false);
    S.libera();
    expect(sp.n.textura).toBe(4);   // el array, los dos campos y el neutro: ni una más ni una menos
    expect(S.U.uFot.value).toBeNull(); expect(S.U.uFotK.value).toBe(0); expect(S.resumen()).toMatchObject({ hecho: false, campos: 0, cargado: null, gpuMB: null }); expect(cola.canceladas).toContain("SF");
    S.libera(); expect(sp.n.textura).toBe(4);   // dos veces no libera de más
  });

  it("KTX2: el loader se suelta tanto si carga como si falla; las WebP son la segunda opción y se avisa", async () => {
    let sueltas = 0, fallos = 0;
    const KTX2Loader = class { setTranscoderPath() { return this; } setWorkerLimit() { return this; } detectSupport() { return this; } dispose() { sueltas++; } loadAsync() { fallos++; return Promise.reject(new Error("sin transcodificador")); } };
    const { S, cola, avisos } = monta("?suelo=fotos", { cargaKtx2: () => Promise.resolve({ KTX2Loader }) });
    S.actualiza(); await esperaMicrotareas(20);
    expect(fallos).toBe(1); expect(sueltas).toBe(1); expect(avisos.some((a) => /suelo=fotos \(ktx2\).*vuelvo a las WebP/.test(a))).toBe(true);
    expect(cola.pend.has("SF")).toBe(true); cola.corre(); await esperaMicrotareas(); expect(S.resumen().cargado).toBe("png");
    S.libera();
  });

  it("KTX2 bueno: los bytes de la tarjeta son los de los mipmaps, y al liberar se suelta la textura", async () => {
    const px = 768, n = 1 + Math.floor(Math.log2(px)), sp = espia();
    const t = new THREE.DataArrayTexture(new Uint8Array(4), 1, 1, 1); t.image = { width: px, height: px, depth: P.CAPAS };
    t.mipmaps = Array.from({ length: n }, (_, i) => ({ data: new Uint8Array(1000 * (i + 1)) })); sp.apunta(t);
    let sueltas = 0;
    const KTX2Loader = class { setTranscoderPath() { return this; } setWorkerLimit() { return this; } detectSupport() { return this; } dispose() { sueltas++; } loadAsync() { return Promise.resolve(t); } };
    const { S, cola } = monta("?suelo=fotos", { cargaKtx2: () => Promise.resolve({ KTX2Loader }) });
    S.actualiza(); await esperaMicrotareas(20); cola.corre(); await esperaMicrotareas();
    expect(sueltas).toBe(1); expect(S.resumen()).toMatchObject({ cargado: "ktx2", gpuBytes: 1000 * n * (n + 1) / 2 });
    S.libera(); expect(sp.n.textura).toBe(1);
  });

  it("si libera() llega con las imágenes aún en vuelo, la textura que se monta tarde se tira (no queda ninguna sin soltar) y no se enciende", async () => {
    const creadas: unknown[] = [], sueltas = { n: 0 };
    class Array3D extends THREE.DataArrayTexture { constructor(...a: unknown[]) { super(...a); creadas.push(this); this.addEventListener("dispose", () => { sueltas.n++; }); } }
    let llegan: () => void = () => {}; const llegada = new Promise<void>((ok) => { llegan = ok; });
    const { S, cola } = monta("?suelo=fotos&suelofmt=png", { THREE: { ...THREE, DataArrayTexture: Array3D }, imagen: () => llegada.then(() => ({ width: 4, height: 4 })) });
    S.actualiza(); await esperaMicrotareas();
    S.libera();                         // la carga estaba en vuelo
    llegan(); await esperaMicrotareas(); cola.corre(); await esperaMicrotareas();
    expect(creadas).toHaveLength(1); expect(sueltas.n).toBe(1);   // se montó y se tiró: ninguna sin liberar
    expect(S.resumen().hecho).toBe(false); expect(S.U.uFot.value).toBeNull(); expect(S.U.uFotK.value).toBe(0);
  });

  it("el manifiesto vale, es de los mundos [exterior], y su libera suelta de verdad (sin api no hace nada)", () => {
    const { S } = monta("?suelo=fotos&suelofmt=png"), sp = espia(), man = manifiestoSueloFotos(S);
    expect(ComponentesPuro.valida(man)).toEqual([]); expect(man.id).toBe("suelo-fotos"); expect(man.mundos).toEqual(["exterior"]);
    expect(man.presupuesto).toMatchObject({ llamadas: 0, triangulos: 0, texturasMB: 39 });
    const api = man.monta({} as never); expect(api).toBe(S);
    const c = S.campo({ ox: 0, oy: 0 }); sp.apunta(c);
    man.libera(api as never); expect(sp.n.textura).toBe(1); expect(() => man.libera(null)).not.toThrow();
  });
});

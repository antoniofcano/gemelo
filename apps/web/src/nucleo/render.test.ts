// El renderizador y la lectura de lo dibujado (A1-11 / MU1-7). Estas pruebas vivían en pruebas/guardianes/render_f1.test.js evaluando
// apps/web/motor/02h_render.js en un vm; ahora prueban el módulo de verdad. Lo que cruza con el legado (el WebGLInfo de three, 90_final, los lectores
// de renderer.info del motor) se queda en el guardián. HONESTIDAD: renderers de mentira; ni GPU ni Quest.
import { describe, expect, it } from "vitest";
import { InfoDibujo, RenderPuro, creaRender } from "./render.ts";
import type { RenderizadorMinimo } from "./render.ts";

// el renderer.info de cada uno, como lo dejan tras un fotograma (WebGLInfo.js y common/Info.js de three 0.186.1)
const clasico = () => ({ info: { memory: { geometries: 12, textures: 7 }, render: { frame: 41, calls: 166, triangles: 900000, points: 3000, lines: 20 }, programs: [{}, {}, {}] } });
const nuevo = () => ({ info: { frame: 41, calls: 9999, render: { calls: 123456, drawCalls: 83, triangles: 450000, points: 1500, lines: 10 }, memory: { geometries: 12, textures: 7, programs: 3 } } });
const consolaFalsa = () => { const avisos: string[] = [], errores: string[] = []; return { avisos, errores, warn: (...a: unknown[]) => { avisos.push(String(a[0])); }, error: (...a: unknown[]) => { errores.push(String(a[0])); } }; };

describe("InfoDibujo.lee", () => {
  it("la misma forma para el clásico y para el nuevo (llamadas por fotograma, no las acumuladas del nuevo)", () => {
    expect(InfoDibujo.lee(clasico())).toEqual({ renderizador: "clasico", fotograma: 41, llamadas: 166, triangulos: 900000, puntos: 3000, lineas: 20, geometrias: 12, texturas: 7, programas: 3 });
    expect(InfoDibujo.lee(nuevo())).toEqual({ renderizador: "nuevo", fotograma: 41, llamadas: 83, triangulos: 450000, puntos: 1500, lineas: 10, geometrias: 12, texturas: 7, programas: 3 });
    for (const r of [clasico(), nuevo()]) {
      expect(InfoDibujo.fotograma(r)).toBe(41);
      expect(InfoDibujo.triangulos(r)).toBe(r.info.render.triangles);
      expect(InfoDibujo.llamadas(r)).toBe(InfoDibujo.lee(r).llamadas);
    }
  });
  it("escribe en el objeto que se le da (sin crear uno por fotograma)", () => {
    const o = {}; expect(InfoDibujo.lee(clasico(), o)).toBe(o);
  });
  it("es tolerante: sin renderer, sin info, sin programas (antes del primer fotograma el clásico tiene programs = null)", () => {
    const vacio = { renderizador: "clasico", fotograma: 0, llamadas: 0, triangulos: 0, puntos: 0, lineas: 0, geometrias: 0, texturas: 0, programas: 0 };
    expect(InfoDibujo.lee(null)).toEqual(vacio);
    expect(InfoDibujo.lee({})).toEqual(vacio);
    const sinProg = clasico() as { info: { programs: unknown } }; sinProg.info.programs = null;
    expect(InfoDibujo.lee(sinProg as RenderizadorMinimo).programas).toBe(0);
    expect(InfoDibujo.fotograma(null)).toBe(0);
    expect(InfoDibujo.triangulos({})).toBe(0);
  });
});

describe("?render=", () => {
  it("nada o clasico → el clásico sin aviso; nuevo → reservado (aviso y clásico); otro → aviso y clásico", () => {
    expect(RenderPuro.eligeTipo("", false)).toEqual({ pedido: "", tipo: "clasico", advertencia: "" });
    expect(RenderPuro.eligeTipo("?debug&render=clasico", false)).toEqual({ pedido: "clasico", tipo: "clasico", advertencia: "" });
    const n = RenderPuro.eligeTipo("?render=nuevo&mide=60", false);
    expect(n.pedido).toBe("nuevo"); expect(n.tipo).toBe("clasico"); expect(n.advertencia).toMatch(/reservado.*WebGPURenderer.*aún no existe/);
    expect(RenderPuro.eligeTipo("?render=nuevo", true).tipo).toBe("nuevo");   // cuando la build lo traiga (F2+), se elige
    const raro = RenderPuro.eligeTipo("?render=webgpu", true); expect(raro.tipo).toBe("clasico"); expect(raro.advertencia).toMatch(/no existe/);
    expect(RenderPuro.eligeTipo(undefined, false).tipo).toBe("clasico");
  });
  it("la build es la que inyecta Vite (__GEMELO_BUILD__); sin ella, o con otra, la de pantalla", () => {
    expect(creaRender({}).build).toBe("pantalla");
    expect(creaRender({ build: "vr" }).build).toBe("vr");
    expect(creaRender({ build: "otra" }).build).toBe("pantalla");
  });
  it("avisa por la consola que se le da, y solo si hay algo que avisar", () => {
    const c = consolaFalsa();
    const r = creaRender({ busqueda: "?render=nuevo&tono=raro", consola: c });
    expect(r.tipo).toBe("clasico"); expect(c.avisos).toHaveLength(2); expect(c.avisos[0]).toMatch(/^render: /); expect(c.avisos[1]).toMatch(/^tono: /);
    const c2 = consolaFalsa(); creaRender({ busqueda: "?debug", consola: c2 }); expect(c2.avisos).toEqual([]);
  });
});

describe("el tono (AG-2.5): la URL, luego el ajuste «vista.tono», luego neutro", () => {
  it("lee el ajuste guardado del almacén que se le da, una vez; con basura o sin almacén, neutro", () => {
    const con = (v: string | null) => creaRender({ almacen: () => ({ getItem: (k: string) => (k === "gemelo.ajustes.vista.tono" ? v : null) }) }).tono;
    expect(con("\"agx\"")).toMatchObject({ tono: "agx", origen: "ajuste", constante: "AgXToneMapping" });
    expect(con(null).tono).toBe("neutro");
    expect(con("{no es json").tono).toBe("neutro");
    expect(creaRender({ almacen: () => { throw new Error("bloqueado"); } }).tono.tono).toBe("neutro");
    expect(creaRender({ busqueda: "?tono=aces", almacen: () => ({ getItem: () => "\"agx\"" }) }).tono).toMatchObject({ tono: "aces", origen: "url" });
  });
});

describe("arranque tolerante", () => {
  it("sin init() el primer fotograma sale YA (como hoy)", () => {
    let n = 0; expect(RenderPuro.arranca({}, () => n++)).toBeNull(); expect(n).toBe(1);
  });
  it("con init() asíncrono, después de él", async () => {
    const orden: string[] = []; let suelta: () => void = () => {};
    const r = { init: () => new Promise<void>(res => { suelta = res; }) };
    const p = RenderPuro.arranca(r, () => orden.push("bucle")); orden.push("tras arranca");
    expect(orden).toEqual(["tras arranca"]); suelta(); await p; expect(orden).toEqual(["tras arranca", "bucle"]);
  });
  it("si init() falla se avisa y el fotograma no sale", async () => {
    const c = consolaFalsa(), orden: string[] = [];
    await creaRender({ consola: c }).arranca({ init: () => Promise.reject(new Error("sin WebGL2")) }, () => orden.push("no"));
    expect(c.errores).toEqual(["render: init() falló"]); expect(orden).toEqual([]);
  });
});

describe("Render.info, memoria y compila (MUNDOS §6)", () => {
  it("sin renderizador enlazado: todo a cero y compila no rompe", async () => {
    const r = creaRender({});
    expect(r.memoria()).toEqual({ geometrias: 0, texturas: 0, bytesEstimados: 0 });
    expect(r.info().llamadas).toBe(0);
    await expect(r.compila({})).resolves.toBeUndefined();
  });
  it("enlazado: info() y memoria() leen renderer.info del clásico y del nuevo", () => {
    const r = creaRender({});
    r.enlaza({ rd: clasico() });
    expect(r.info()).toMatchObject({ renderizador: "clasico", llamadas: 166 });
    expect(r.memoria()).toEqual({ geometrias: 12, texturas: 7, bytesEstimados: 0 });
    r.enlaza({ rd: nuevo() });
    expect(r.info()).toMatchObject({ renderizador: "nuevo", llamadas: 83 });
    expect(r.memoria()).toMatchObject({ geometrias: 12, texturas: 7 });
  });
  it("compila(obj): compileAsync con la cámara XR si hay sesión, la de pantalla si no; sin compileAsync usa compile; si falla, sigue", async () => {
    const llamadas: unknown[][] = []; let xr: unknown = null;
    const rd: RenderizadorMinimo = { compileAsync: (o, c, e) => { llamadas.push([o, c, e]); return Promise.resolve(); } };
    const r = creaRender({}), obj = { id: "olivos" }, esc = { id: "escena" }, camP = { id: "camara" }, camXr = { id: "xr" };
    r.enlaza({ rd, escena: esc, camara: camP, camaraXr: () => xr });
    await r.compila(obj); xr = camXr; await r.compila(obj);
    expect(llamadas).toEqual([[obj, camP, esc], [obj, camXr, esc]]);
    const cs: unknown[][] = []; r.enlaza({ rd: { compile: (o, c) => { cs.push([o, c]); } }, camara: camP });
    await r.compila(obj); expect(cs).toEqual([[obj, camP]]);
    r.enlaza({ rd: { compileAsync: () => Promise.reject(new Error("x")) } }); await expect(r.compila(obj)).resolves.toBeUndefined();
    r.enlaza({ rd: { compileAsync: () => { throw new Error("y"); } } }); await expect(r.compila(obj)).resolves.toBeUndefined();
  });
});

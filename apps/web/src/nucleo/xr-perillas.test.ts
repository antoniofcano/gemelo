// Perillas de rendimiento VR por URL (Q0b, AG-2.3, F2a; A1-11 / MU1-7). Estas pruebas vivían en pruebas/guardianes/xr_perillas.test.js evaluando
// el trozo [puro] y el [motor] de apps/web/motor/02f_xr_perillas.js con new Function; ahora prueban el módulo de verdad. Se quedan en el guardián
// el cableado por texto (29_vr, 03_escena, 28_depura, 30_mide) y el banco de 29_vr, que cruzan con el legado. HONESTIDAD: renderer y sesión de
// mentira; nada de esto dice cómo rinde un casco real (Quest: no probado).
import { describe, expect, it } from "vitest";
import { XrPerillasPuro as P, creaXrPerillas } from "./xr-perillas.ts";
import type { SesionXr } from "./xr-perillas.ts";

const QUEST = { frameRates: [72, 80, 90] };
const estado = (busqueda: string) => creaXrPerillas({ busqueda });

describe("XrPerillasPuro.lee y plan", () => {
  it("sin parámetros: nada pedido, nada ignorado y los valores de siempre", () => {
    for (const q of ["", "?debug", "?a=1&xr=2", undefined]) {
      expect(P.lee(q, QUEST), String(q)).toEqual({ fov: null, escala: null, hz: null, aa: null, nivel: null, near: null, js: null, ignorados: [] });
    }
    const pl = P.plan(P.lee("", QUEST), QUEST);
    expect([pl.fov, pl.escala, pl.hz, pl.aa, pl.nivel, pl.near, pl.js, pl.tocadas.length]).toEqual([1, 0.9, 72, true, null, 0.1, 8, 0]);
    expect(P.linea(pl)).toBe("VR: fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto · near 0,1 · umbral JS 8 ms");
  });

  it("valores válidos, con coma decimal y en cualquier orden", () => {
    expect(P.lee("?debug&xrescala=1.2&xrfov=0.5&xrhz=90&xraa=0&xrnivel=2", QUEST)).toEqual({ fov: 0.5, escala: 1.2, hz: 90, aa: false, nivel: 2, near: null, js: null, ignorados: [] });
    expect(P.lee("?xrescala=0,7", null).escala).toBe(0.7);
    expect(P.lee("?xrfov=0", null).fov).toBe(0);   // 0 es un valor, no ausencia
    expect(P.lee("?xrnivel=0", null).nivel).toBe(0);
    expect(P.lee("?xraa=1", null).aa).toBe(true);
  });

  it("fuera de rango: se recorta y se anota con el motivo", () => {
    const r = P.lee("?xrfov=3&xrescala=0.1&xrnivel=9", null);
    expect([r.fov, r.escala, r.nivel]).toEqual([1, 0.5, 3]);
    expect(r.ignorados.map(i => i.param)).toEqual(["xrfov", "xrescala", "xrnivel"]);
    expect(r.ignorados.every(i => /fuera de rango/.test(i.motivo))).toBe(true);
    expect(P.lee("?xrescala=9", null).escala).toBe(1.5);
    expect(P.lee("?xrfov=-1", null).fov).toBe(0);
    const n = P.lee("?xrnivel=1.4", null); expect(n.nivel).toBe(1); expect(n.ignorados).toHaveLength(1);   // un nivel no entero se redondea y se anota
  });

  it("no numérico o inválido: sin efecto y con motivo", () => {
    const r = P.lee("?xrfov=mucho&xrescala=&xrnivel=NaN&xraa=2&xrhz=60", null);
    expect([r.fov, r.escala, r.nivel, r.aa, r.hz]).toEqual([null, null, null, null, null]);
    expect(r.ignorados.map(i => i.param)).toEqual(["xrfov", "xrescala", "xrnivel", "xrhz", "xraa"]);
  });

  it("xrhz: solo 72/80/90/120 y solo si el casco la anuncia", () => {
    expect(P.lee("?xrhz=120", null).hz).toBe(120);   // sin sesión todavía no se puede saber: se acepta
    expect(P.lee("?xrhz=90", QUEST).hz).toBe(90);
    const r = P.lee("?xrhz=120", QUEST);
    expect(r.hz).toBeNull(); expect(r.ignorados[0]?.motivo).toMatch(/no soportado/);
    const s = P.lee("?xrhz=90", { frameRates: null });
    expect(s.hz).toBeNull(); expect(s.ignorados[0]?.motivo).toMatch(/no soportado/);
    expect(P.plan(r, QUEST).hz).toBe(72);   // no soportada la pedida: queda la de siempre (72) si el casco la admite
    expect(P.plan(P.lee("", { frameRates: [90] }), { frameRates: [90] }).hz).toBeNull();   // si ni los 72 Hz están, no se pide ninguna
  });

  it("la línea del informe dice las perillas efectivas y lo ignorado", () => {
    const pl = P.plan(P.lee("?xrfov=0.5&xrescala=1&xrhz=120&xraa=0&xrnivel=2", QUEST), QUEST);
    expect(P.linea(pl)).toMatch(/^VR: fov 0,5 · escala 1 · 72 Hz · MSAA no · nivel 2 fijo · near 0,1 · umbral JS 8 ms · ignorado: xrhz=120 \(no soportado/);
  });

  it("xrnear y xrjs (AG-2.3): por defecto 0,1 y 8; límites 0,05-0,3 y 4-16; recorte con motivo; no numérico ignorado", () => {
    expect([P.DEF.near, P.DEF.js]).toEqual([0.1, 8]);
    const v = P.lee("?xrnear=0,05&xrjs=4", null); expect([v.near, v.js, v.ignorados.length]).toEqual([0.05, 4, 0]);
    const r = P.lee("?xrnear=0.01&xrjs=40", null);
    expect([r.near, r.js]).toEqual([0.05, 16]); expect(r.ignorados.map(i => i.param)).toEqual(["xrnear", "xrjs"]);
    expect(r.ignorados.every(i => /fuera de rango/.test(i.motivo))).toBe(true);
    expect(P.lee("?xrnear=0.9", null).near).toBe(0.3); expect(P.lee("?xrjs=1", null).js).toBe(4);
    const n = P.lee("?xrnear=cerca&xrjs=", null); expect([n.near, n.js]).toEqual([null, null]);
    expect(n.ignorados.map(i => i.motivo)).toEqual(["no es un número", "no es un número"]);
    expect(P.linea(P.plan(P.lee("?xrnear=0.2&xrjs=6.5", null), null))).toMatch(/near 0,2 · umbral JS 6,5 ms/);
    expect(P.linea(P.plan(P.lee("?xrnear=0.01", null), null))).toMatch(/near 0,05 .*ignorado: xrnear=0.01 \(fuera de rango/);
  });
});

describe("el estado XrPerillas (creaXrPerillas)", () => {
  const sesion = (frameRates: number[], llamadas: unknown[][]): SesionXr => ({ supportedFrameRates: frameRates, renderState: { baseLayer: { fixedFoveation: 0 } }, updateTargetFrameRate: (f: number) => { llamadas.push(["hz", f]); } });
  const renderer = (llamadas: unknown[][]) => ({ xr: { setFoveation: (v: number) => { llamadas.push(["fov", v]); } } });

  it("sin perillas llegan 0,9, foveación 1 y 72 Hz, y el controlador sigue activo", () => {
    const X = estado(""), llamadas: unknown[][] = [], ses = sesion([72, 90], llamadas);
    expect(X.aa).toBe(true); expect(X.efectivas.escala).toBe(0.9);
    X.antes(renderer(llamadas)); X.despues(ses);
    expect(llamadas).toEqual([["fov", 1], ["hz", 72]]);
    expect(ses.renderState?.baseLayer?.fixedFoveation).toBe(1);
    expect(X.fijo()).toBe(false); expect(X.entro).toBe(true);
    expect(X.linea()).toBe("VR: fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto · near 0,1 · umbral JS 8 ms");
  });

  it("las perillas llegan a la escala, la foveación, la frecuencia y el nivel fijo", () => {
    const X = estado("?xrescala=1.1&xrfov=0.3&xrhz=90&xraa=0&xrnivel=3"), llamadas: unknown[][] = [], ses = sesion([72, 90], llamadas);
    expect(X.aa).toBe(false);   // se lee antes de crear el renderer
    expect(X.efectivas.escala).toBe(1.1);   // setFramebufferScaleFactor(efectivas.escala) en 29_vr
    X.antes(renderer(llamadas)); X.despues(ses);
    expect(llamadas).toEqual([["fov", 0.3], ["hz", 90]]);
    expect(ses.renderState?.baseLayer?.fixedFoveation).toBe(0.3);
    expect(X.fijo()).toBe(true); expect(X.efectivas.nivel).toBe(3);
  });

  it("una frecuencia no soportada no llama a updateTargetFrameRate si el casco no admite ni los 72 Hz, y se anota", () => {
    const X = estado("?xrhz=120"), llamadas: unknown[][] = [];
    X.despues(sesion([90], llamadas));
    expect(llamadas).toEqual([]); expect(X.efectivas.hz).toBeNull();
    expect(X.efectivas.ignorados[0]?.param).toBe("xrhz"); expect(X.linea()).toMatch(/Hz sin cambiar.*ignorado: xrhz=120/);
    expect(() => estado("").despues({ renderState: {} })).not.toThrow();   // un casco sin supportedFrameRates ni updateTargetFrameRate no rompe
  });

  it("el umbral es URL > configuración > 8, y near llega a las efectivas", () => {
    const A = estado(""); expect(A.js()).toBe(8); expect(A.efectivas.near).toBe(0.1);
    A.configJs = 7; expect(A.js()).toBe(7);   // la configuración sustituye al código
    const B = estado("?xrjs=5&xrnear=0.05"); B.configJs = 7; expect(B.js()).toBe(5); expect(B.efectivas.near).toBe(0.05);   // la URL manda
    B.despues({ renderState: {} }); expect(B.efectivas.near).toBe(0.05);   // el plan real al abrir la sesión conserva la perilla
    expect(B.linea()).toMatch(/near 0,05 · umbral JS 5 ms/);
  });

  it("la histéresis y la gente (Q0c-b, Q0c-c): URL > tabla del aparato > defecto", () => {
    const X = estado(""); expect([X.jsSube(), X.estable(), X.gente()]).toEqual([6, 10, 8]);
    X.tablaSube = 3; expect(X.jsSube()).toBe(3);
    const Y = estado("?xrjssube=6&xrestable=30&xrgente=12"); Y.tablaSube = 3; expect([Y.jsSube(), Y.estable(), Y.gente()]).toEqual([6, 30, 12]);
    const Z = P.leeControl("?xrgente=1000&xrestable=abc"); expect(Z.gente).toBe(64); expect(Z.ignorados.map(i => i.param)).toEqual(["xrestable", "xrgente"]);
  });

  it("el tope del tileset (Q0k): 0 apaga el lazo; ?xrtri= o el tri del nivel; el error máximo, 128 por defecto", () => {
    const X = estado(""); expect(X.topeTiles(500000)).toBe(500000); expect(X.topeTiles(0)).toBe(0); expect(X.errMaxTiles()).toBe(128);
    expect(estado("?xrtri=0").topeTiles(500000)).toBe(0);
    expect(estado("?xrtri=300000&xrtrierr=64").topeTiles(500000)).toBe(300000); expect(estado("?xrtri=300000&xrtrierr=64").errMaxTiles()).toBe(64);
    const r = P.leeTiles("?xrtri=5&xrtrierr=999"); expect([r.tri, r.err]).toEqual([20000, 256]); expect(r.ignorados).toHaveLength(2);
    const X2 = estado(""); X2.lineaTiles = () => "tileset 500000 tri · error 128 px"; expect(X2.linea()).toMatch(/ · tileset 500000 tri · error 128 px$/);
  });

  it("los ignorados de ?xrolivos= (02m) salen en la misma línea, por la función que presta el legado", () => {
    const X = creaXrPerillas({ busqueda: "", ignoradosOlivos: () => [{ param: "xrolivos", valor: "x", motivo: "no es un número" }] });
    expect(X.linea()).toMatch(/ignorado: xrolivos=x \(no es un número\)$/);
  });
});

describe("xrmv (F2a): el multiview de super-three, solo en la build de VR", () => {
  it("en la build de VR, por defecto sí, 0 lo apaga, 1 lo pide y otro valor se ignora con motivo; en la de pantalla no existe y se dice", () => {
    expect(P.multiview("", "vr")).toEqual({ existe: true, activo: true, pedido: null, ignorado: null, origen: "defecto" });
    expect(P.multiview("?debug&xrmv=0", "vr")).toEqual({ existe: true, activo: false, pedido: "0", ignorado: null, origen: "url" });
    expect(P.multiview("?xrmv=1&mide=60", "vr")).toEqual({ existe: true, activo: true, pedido: "1", ignorado: null, origen: "url" });
    const raro = P.multiview("?xrmv=si", "vr"); expect(raro.activo).toBe(true); expect(raro.ignorado?.motivo).toMatch(/solo vale 0 o 1/);
    expect(P.multiview("", "pantalla")).toEqual({ existe: false, activo: false, pedido: null, ignorado: null });
    const pa = P.multiview("?xrmv=1", "pantalla"); expect(pa.activo).toBe(false); expect(pa.ignorado?.motivo).toMatch(/solo existe en la build de VR/);
    expect(P.multiview("?xrmv=1", undefined).activo).toBe(false);   // sin build conocida, pantalla
    // la línea: en pantalla, la de siempre (sin «multiview»); en VR, pedido / en uso / no en uso / apagado
    const pl = P.plan(P.lee("", QUEST), QUEST);
    expect(P.linea({ ...pl, mv: P.multiview("", "pantalla") })).toBe("VR: fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto · near 0,1 · umbral JS 8 ms");
    expect(P.linea({ ...pl, mv: P.multiview("", "vr") })).toBe("VR: fov 1 · escala 0,9 · 72 Hz · MSAA sí · multiview pedido · nivel auto · near 0,1 · umbral JS 8 ms");
    expect(P.linea({ ...pl, mv: { ...P.multiview("", "vr"), enUso: true } })).toMatch(/MSAA sí · multiview sí · nivel/);
    expect(P.linea({ ...pl, mv: { ...P.multiview("", "vr"), enUso: false } })).toMatch(/multiview pedido, no en uso/);
    expect(P.linea({ ...pl, mv: P.multiview("?xrmv=0", "vr") })).toMatch(/multiview no \(xrmv=0\)/);
  });

  it("la URL, luego el ajuste «vr.multiview», luego encendido; en pantalla no existe y el ajuste no hace nada", () => {
    expect(P.multiview("", "vr", undefined).activo).toBe(true);   // defecto: encendido
    expect(P.multiview("", "vr", true).activo).toBe(true);
    const aj = P.multiview("", "vr", false); expect(aj.activo).toBe(false); expect(aj.origen).toBe("ajuste");
    expect(P.multiview("?xrmv=1", "vr", false).activo).toBe(true);   // la URL enciende aunque el ajuste lo apague
    expect(P.multiview("?xrmv=1", "vr", false).origen).toBe("url");
    expect(P.multiview("?xrmv=0", "vr", true).activo).toBe(false);   // la URL apaga aunque el ajuste lo encienda
    const raro = P.multiview("?xrmv=si", "vr", false); expect(raro.activo).toBe(false); expect(raro.ignorado).toBeTruthy();   // un valor raro cae al ajuste
    const pa = P.multiview("", "pantalla", false); expect(pa.existe).toBe(false); expect(pa.activo).toBe(false); expect(pa.origen).toBeUndefined();
    expect(P.linea({ ...P.plan(P.lee("", null), null), mv: aj })).toMatch(/multiview no \(ajuste\)/);   // la línea dice de dónde viene
    expect(P.linea({ ...P.plan(P.lee("", null), null), mv: P.multiview("?xrmv=0", "vr", true) })).toMatch(/multiview no \(xrmv=0\)/);
  });

  it("el estado lee el ajuste guardado UNA vez, del almacén que se le da; con basura o sin almacén, encendido", () => {
    const con = (v: string | null) => creaXrPerillas({ almacen: () => ({ getItem: (k: string) => (k === "gemelo.ajustes.vr.multiview" ? v : null) }) }).multiview("vr");
    expect(con("false")).toMatchObject({ activo: false, origen: "ajuste" });
    expect(con("true").activo).toBe(true); expect(con(null).activo).toBe(true); expect(con("{no json").activo).toBe(true);
    expect(creaXrPerillas({ almacen: () => { throw new Error("bloqueado"); } }).multiview("vr").activo).toBe(true);
  });

  it("XrPerillas.multiview(build) se decide una vez; mvEnUso lee renderer.xr.isMultiview; la línea lo dice y anota lo ignorado", () => {
    const V = estado("?xrmv=1");
    expect(V.mv).toBeNull();   // sin llamar, nada
    expect(V.multiview("vr").activo).toBe(true); expect(V.multiview("pantalla").existe).toBe(true);   // se decide una vez (la primera, la de 03_escena)
    V.despues({ renderState: {} }); V.mvEnUso({ xr: { isMultiview: true } });
    expect(V.linea()).toMatch(/MSAA sí · multiview sí · nivel auto/);
    V.mvEnUso({ xr: {} }); expect(V.linea()).toMatch(/multiview pedido, no en uso/);   // three de pantalla o sin capa: no en uso
    const A = estado("?xrmv=0"); A.multiview("vr"); expect(A.linea()).toMatch(/multiview no \(xrmv=0\)/);
    const S = estado("?xrmv=1"); S.multiview("pantalla"); S.mvEnUso({ xr: { isMultiview: true } });
    expect(S.linea()).not.toMatch(/multiview (sí|pedido|no)/);   // en la build de pantalla la línea no habla del multiview
    expect(S.linea()).toMatch(/ignorado: xrmv=1 \(solo existe en la build de VR/);
    expect(estado("").linea()).toBe("VR: fov 1 · escala 0,9 · 72 Hz · MSAA sí · nivel auto · near 0,1 · umbral JS 8 ms");   // sin multiview() la línea es la de siempre
  });
});

// El presupuesto de VR por escalón y el controlador de nivel (A1-12 / MU1-8). Estas pruebas vivían en pruebas/guardianes/vr_presupuesto.test.js,
// vr_control.test.js y vr_gente_presupuesto.test.js evaluando el trozo [puro] de apps/web/motor/02g_vr_presupuesto.js; ahora prueban el módulo de
// verdad. Lo que cruza con el legado (VR_PERFILES y la Cola de 29_vr, las perillas de 02f, Aparato de 01a, los módulos que se apuntan) sigue allí.
// HONESTIDAD: series sintéticas de ms y mallas falsas, en Node. Ni fps, ni triángulos, ni lo que se nota en un casco: no probado en Quest.
import { describe, expect, it } from "vitest";
import { VrControlPuro as C, VrPresupuestoPuro as P, creaVrPresupuesto } from "./presupuesto.ts";
import type { EstadoControl, MallaInstanciada, ValorFuente } from "./presupuesto.ts";

const inf = (v: ValorFuente | undefined): number => v === null || v === undefined ? Infinity : (v as number);

// ---------------------------------------------------------------- la tabla
describe("VrPresupuestoPuro: la tabla", () => {
  it("el escalón 0 es lo de pantalla, fuera de VR es la base y fuera de los límites se recorta", () => {
    expect(P.reparto(0)).toEqual(P.base());
    for (const n of [null, undefined, NaN, "2"]) expect(P.reparto(n)).toEqual(P.base());
    expect(P.reparto(9)).toEqual(P.reparto(P.ESCALONES.length - 1));
    expect(P.reparto(-3)).toEqual(P.reparto(0));
    expect(Object.keys(P.FUENTES).sort()).toEqual(P.ORDEN.slice().sort());
    P.ESCALONES.forEach(f => expect(Object.keys(f).sort()).toEqual(P.ORDEN.slice().sort()));
  });

  it("cada escalón quita lo mismo o más que el anterior, y lo medido cae después que lo deducido e ilustrativo (regla 5)", () => {
    for (let i = 1; i < P.ESCALONES.length; i++) {
      const a = P.ESCALONES[i - 1]!, b = P.ESCALONES[i]!;
      for (const k of P.ORDEN) {
        const q = P.FUENTES[k].que;
        if (q === "radio") expect(inf(b[k]) <= inf(a[k]), k + " no crece al bajar a " + i).toBe(true);
        if (q === "si") expect(!!(b[k] && !a[k]), k + " no vuelve al bajar").toBe(false);
        if (q === "celdas") expect((b[k] as number) <= (a[k] as number), k + " no gana celdas al bajar").toBe(true);
      }
    }
    P.ESCALONES.forEach((f, i) => {
      if (f.copasLidar !== null) expect(f.sombras === false && inf(f.arbolesPaisaje) < inf(f.copasLidar) && inf(f.marcasOT) < inf(f.copasLidar), "escalón " + i).toBe(true);
      if ((f.sueloFondo as number) < (P.FUENTES.sueloFondo.base as number)) expect(f.copasLidar, "el relieve se pide más grueso solo en el último recurso").not.toBeNull();
      expect(f.sueloFondo as number).toBeGreaterThanOrEqual(32);   // el relieve nunca se apaga
    });
    for (const k of ["copasLidar", "sueloFondo"] as const) expect(P.FUENTES[k].clase).toBe("medido");
    expect(P.FUENTES.arbolesPaisaje.clase).toBe("deducido"); expect(P.FUENTES.sombras.clase).toBe("ilustrativo");
    expect(P.ORDEN.indexOf("copasLidar") > P.ORDEN.indexOf("arbolesPaisaje") && P.ORDEN.indexOf("sueloFondo") > P.ORDEN.indexOf("sombras")).toBe(true);
  });

  it("paso, recorte por distancia y hundimiento", () => {
    expect(P.paso(P.base())).toBeNull();
    expect(P.paso(P.reparto(3))).toBe(Math.max(P.PASO_MIN, 100 / 4));
    expect(P.paso({ arbolesPaisaje: 400, marcasOT: null, copasLidar: null })).toBe(100);
    const mat = new Float32Array(16 * 5), idx = new Int32Array(5);
    [[0, 0], [3, 4], [6, 8], [-5, 0], [100, 100]].forEach(([x, z], i) => { mat[i * 16 + 12] = x!; mat[i * 16 + 14] = z!; });
    expect(P.recorta(mat, 5, 0, 0, 5, idx)).toBe(3); expect([...idx.slice(0, 3)]).toEqual([0, 1, 3]);
    expect(P.recorta(mat, 5, 100, 100, 1, idx)).toBe(1); expect(idx[0]).toBe(4);
    expect(P.hundimiento(128, 128, 1.5)).toBe(1.5); expect(P.hundimiento(64, 128, 1.5)).toBe(3);
  });
});

// ---------------------------------------------------------------- el motor con mallas falsas
interface Falsa extends MallaInstanciada { esferas: number }
/** n instancias en fila sobre el eje x (x = i·paso, y = 1, z = 0), con color por instancia si se pide: lo que usa VrPresupuesto de un InstancedMesh */
function malla(n: number, paso: number, color?: boolean): Falsa {
  const m = new Float32Array(n * 16), c = color ? new Float32Array(n * 3) : null;
  for (let i = 0; i < n; i++) { m[i * 16] = m[i * 16 + 5] = m[i * 16 + 10] = m[i * 16 + 15] = 1; m[i * 16 + 12] = i * paso; m[i * 16 + 13] = 1; if (c) c[i * 3] = i / n; }
  return { instanceMatrix: { array: m, count: n, needsUpdate: false }, instanceColor: c ? { array: c, needsUpdate: false } : null, visible: true, count: n, frustumCulled: true, esferas: 0, computeBoundingSphere() { this.esferas++; } };
}
const foto = (m: MallaInstanciada) => ({ count: m.count, visible: m.visible, mat: Array.from(m.instanceMatrix.array), col: m.instanceColor ? Array.from(m.instanceColor.array) : null });
function apunta(V: ReturnType<typeof creaVrPresupuesto>) {
  const arb = [malla(300, 5, true), malla(300, 5, true)], marc = [malla(600, 1)], cop = [malla(600, 1)], llamadas = { sombras: [] as unknown[], sueloFondo: [] as unknown[] };
  V.instancias("arbolesPaisaje", arb); V.instancias("marcasOT", marc); V.instancias("copasLidar", cop);
  V.fuente("sombras", v => llamadas.sombras.push(v)); V.fuente("sueloFondo", v => llamadas.sueloFondo.push(v));
  const todas = () => arb.concat(marc, cop);
  return { arb, marc, cop, llamadas, todas, antes: todas().map(foto) };
}
const enRadio = (n: number, paso: number, cx: number, r: number): number => { let k = 0; for (let i = 0; i < n; i++) if (Math.abs(i * paso - cx) <= r) k++; return k; };

describe("VrPresupuesto con mallas falsas", () => {
  it("fuera de VR no cambia nada: apuntarse, moverse y salir sin haber entrado no tocan ni una instancia ni llaman a nadie", () => {
    const V = creaVrPresupuesto(), s = apunta(V);
    V.mueve(0, 0); V.mueve(500, 0); V.ponEscalon(null); V.mueve(900, 0);
    expect(s.todas().map(foto)).toEqual(s.antes);
    expect(s.llamadas).toEqual({ sombras: [], sueloFondo: [] });
    expect(V.estado().recortes).toBe(0);
  });

  it("qué recibe cada fuente en cada escalón (recuento exacto) y al volver al 0 y al salir se restaura todo", () => {
    const V = creaVrPresupuesto(), s = apunta(V), cx = 400;
    for (let n = 0; n < P.ESCALONES.length; n++) {
      V.ponEscalon(n); V.mueve(cx, 0);
      const f = P.ESCALONES[n]!;
      const esp = {
        arbolesPaisaje: f.arbolesPaisaje === null ? 300 : enRadio(300, 5, cx, f.arbolesPaisaje as number),
        marcasOT: f.marcasOT === null ? 600 : enRadio(600, 1, cx, f.marcasOT as number),
        copasLidar: f.copasLidar === null ? 600 : enRadio(600, 1, cx, f.copasLidar as number)
      };
      expect(s.arb[0]!.count, "paisaje, escalón " + n).toBe(esp.arbolesPaisaje); expect(s.arb[1]!.count).toBe(esp.arbolesPaisaje);
      expect(s.marc[0]!.count).toBe(esp.marcasOT); expect(s.cop[0]!.count).toBe(esp.copasLidar);
      const e = V.estado();
      expect(e.escalon).toBe(n);
      expect(e.fuentes.sombras).toEqual({ valor: f.sombras }); expect(e.fuentes.sueloFondo).toEqual({ valor: f.sueloFondo });
      expect((e.fuentes.marcasOT as { dibujadas: number }).dibujadas).toBe(esp.marcasOT);
      if (f.arbolesPaisaje !== null) for (let q = 0; q < s.arb[0]!.count; q++) {   // cada instancia que queda está a ≤ r, con SU color
        const x = s.arb[0]!.instanceMatrix.array[q * 16 + 12]!, i = Math.round(x / 5);
        expect(Math.abs(x - cx) <= (f.arbolesPaisaje as number)).toBe(true);
        expect(Math.abs(s.arb[1]!.instanceColor!.array[q * 3]! - i / 300)).toBeLessThan(1e-6);
      }
    }
    // las fuentes de valor solo se llaman cuando su valor cambia
    const vals = P.ESCALONES.map(f => f.sombras), cel = P.ESCALONES.map(f => f.sueloFondo);
    expect(s.llamadas.sombras).toEqual(vals.filter((v, i) => v !== (i ? vals[i - 1] : true)));
    expect(s.llamadas.sueloFondo).toEqual(cel.filter((v, i) => v !== (i ? cel[i - 1] : 128)));
    V.ponEscalon(0);
    expect(s.todas().map(foto)).toEqual(s.antes);   // escalón 0: todo como estaba, byte a byte
    expect(s.llamadas.sombras.at(-1)).toBe(true); expect(s.llamadas.sueloFondo.at(-1)).toBe(128);
    V.ponEscalon(3); V.mueve(cx, 0); V.ponEscalon(null);
    expect(s.todas().map(foto)).toEqual(s.antes);   // al salir de VR: todo como estaba
    expect(V.estado().centro).toBeNull();
  });

  it("moverse: por debajo del umbral no recorta; por encima, sí; sin nada en el radio la malla no se dibuja y vuelve al restaurar", () => {
    const V = creaVrPresupuesto(), s = apunta(V);
    V.ponEscalon(3); V.mueve(0, 0); const r0 = V.estado().recortes;
    V.mueve((P.paso(P.reparto(3)) as number) - 1, 0); expect(V.estado().recortes).toBe(r0);
    V.mueve(5000, 0); expect(V.estado().recortes).toBeGreaterThan(r0);
    for (const m of s.todas()) { expect(m.count).toBe(0); expect(m.visible).toBe(false); }
    V.ponEscalon(null); for (const m of s.todas()) expect(m.visible).toBe(true);
    const V2 = creaVrPresupuesto(), s2 = apunta(V2); V2.ponEscalon(3); expect(s2.marc[0]!.count).toBe(600); V2.mueve(0, 0); expect(s2.marc[0]!.count).toBeLessThan(600);
  });

  it("renueva: el módulo reescribe sus instancias con el recorte puesto; se recorta con las nuevas y al salir quedan las nuevas", () => {
    const V = creaVrPresupuesto(), s = apunta(V), m = s.marc[0]!;
    V.ponEscalon(3); V.mueve(0, 0); const k = m.count;
    for (let i = 0; i < 600; i++) { m.instanceMatrix.array[i * 16 + 12] = i; m.instanceMatrix.array[i * 16 + 13] = 7; m.instanceMatrix.array[i * 16 + 14] = 0; }   // lo que hace coloca(): las 600, en su orden
    V.renueva("marcasOT");
    expect(m.count).toBe(k); expect(m.instanceMatrix.array[13]).toBe(7);
    V.ponEscalon(null); expect(m.count).toBe(600); expect(m.instanceMatrix.array[599 * 16 + 13]).toBe(7);
    V.olvida("marcasOT"); V.ponEscalon(3); V.mueve(0, 0); expect(m.count).toBe(600);
  });

  it("entrar en VR con una fuente apuntada más tarde: recibe ya su escalón", () => {
    const V = creaVrPresupuesto(); V.ponEscalon(3); V.mueve(0, 0);
    const vistos: unknown[] = []; V.fuente("sombras", v => vistos.push(v)); expect(vistos).toEqual([false]);
    const m = malla(600, 1); V.instancias("marcasOT", [m]); expect(m.count).toBe(enRadio(600, 1, 0, 100));
  });

  it("escalonPorPasos deja lo mismo que ponEscalon, repartido en una fuente por paso", () => {
    function monta(modo: "golpe" | "pasos") {
      const V = creaVrPresupuesto(), vistos: unknown[][] = [], t = malla(100, 10);
      t.frustumCulled = false;
      V.fuente("sombras", v => vistos.push(["sombras", v])); V.fuente("sueloFondo", v => vistos.push(["suelo", v])); V.instancias("arbolesPaisaje", [t]);
      if (modo === "pasos") { const g = V.escalonPorPasos(3); let n = 0; while (!g.next().done) n++; expect(n).toBe(P.ORDEN.length); } else V.ponEscalon(3);
      V.mueve(0, 0);
      return { est: V.estado(), vistos, count: t.count };
    }
    const a = monta("golpe"), b = monta("pasos");
    expect(b.est).toEqual(a.est); expect(b.vistos).toEqual(a.vistos); expect(b.count).toBe(a.count);
    expect(a.count).toBeLessThan(100);
  });

  it("publica el estado en la ventana que se le da (window.__vrPresupuesto en el legado), y sin ventana no publica nada", () => {
    const w: { __vrPresupuesto?: unknown } = {}, V = creaVrPresupuesto({ ventana: w });
    expect(w.__vrPresupuesto).toBe(V.estado);
    expect(() => creaVrPresupuesto({ ventana: null })).not.toThrow();
  });

  it("al salir de VR (ponEscalon(null)) la gente contada y el suelo se olvidan; un recuento negativo o con decimales se sanea", () => {
    const V = creaVrPresupuesto(); V.ponGente(20); expect(V.suelo(8)).toBe(1); expect(V.estado().gente).toBe(20);
    V.ponEscalon(null); expect(V.estado().gente).toBe(0); expect(V.suelo(8)).toBe(0);
    V.ponGente(-3); expect(V.estado().gente).toBe(0); V.ponGente(7.9); expect(V.estado().gente).toBe(7);
    expect(creaVrPresupuesto().suelo(8)).toBe(0);   // sin ponGente: suelo 0
  });
});

// ---------------------------------------------------------------- el controlador
const FPS = 72, DT = 1 / FPS;
const estadoNuevo = (): EstadoControl => ({ emaDt: 13.9, emaJs: 6, tNivel: 0, tEstable: 0 });
type Serie = (nivel: number, t: number, i: number) => number;
interface OpcCorre { js: Serie; dt?: Serie; baja?: number; sube?: number; estable?: number; maxNivel?: number; nivel?: number; seg?: number; fijo?: boolean; decide?: typeof C.decide }
type Cambio = [number, number, number];
// avanza el controlador `seg` segundos de reloj (la suma de los dt) con js(nivel, t, i) y dt(nivel, t, i) en ms; devuelve los cambios [t, de, a] y el
// tiempo pasado en cada nivel. Por defecto, 72 Hz exactos (13,9 ms) y los umbrales de la tabla (8 y 6 ms, 10 s)
function corre(opts: OpcCorre) {
  const u = { baja: 8, sube: 6, estable: 10, maxNivel: 3, nivel: 0, seg: 300, fijo: false, dt: (() => 13.9) as Serie, decide: C.decide, ...opts };
  const e = estadoNuevo(), cambios: Cambio[] = [], enNivel = [0, 0, 0, 0];
  let nivel = u.nivel, t = 0;
  for (let i = 0; t < u.seg; i++) {
    const dtMs = u.dt(nivel, t, i), js = u.js(nivel, t, i), d = u.decide(e, dtMs, js, dtMs / 1000, nivel, u.maxNivel, u.baja, u.sube, u.estable, u.fijo);
    enNivel[nivel] = (enNivel[nivel] as number) + dtMs / 1000; t += dtMs / 1000;
    if (d) { cambios.push([t, nivel, nivel + d]); nivel += d; }
  }
  return { cambios, nivel, e, enNivel };
}
// el controlador de ANTES de A1-12 (Q0c-b/Q0c-c, nucleo/presupuesto.ts en el commit de la migración), para reproducir L7-03 con su código
function decideAntes(e: EstadoControl, dtMs: number, jsMs: number, dt: number, nivel: number, maxNivel: number, baja: number, sube: number, estable: number, fijo: boolean, suelo?: number): number {
  e.emaDt += (dtMs - e.emaDt) * 0.05; e.emaJs += (jsMs - e.emaJs) * 0.05; e.tNivel += dt;
  const s = sube > baja - 1 ? baja - 1 : sube;
  if (e.emaJs < s && e.emaDt < 14.4) e.tEstable += dt; else e.tEstable = 0;
  if (fijo) return 0;
  if (e.tNivel < 4) return 0;
  const s0 = suelo as number, sg = s0 > 0 ? Math.min(s0 | 0, maxNivel) : 0;
  if (nivel < sg) { e.tNivel = 0; e.tEstable = 0; return 1; }
  if ((e.emaJs > baja || e.emaDt > 15.2) && nivel < maxNivel) { e.tNivel = 0; e.tEstable = 0; return 1; }
  if (nivel > sg && e.tEstable >= estable) { e.tNivel = 0; e.tEstable = 0; return -1; }
  return 0;
}
const antes = (o: OpcCorre) => corre({ sube: 5, decide: decideAntes, ...o });   // con su tabla de entonces (subir con 5 ms)
// la regla de ANTES (AG-2.3), para contrastar: baja con >8 (guarda de 4 s), sube con <7 tras 25 s
function reglaVieja(js: (nivel: number, t: number) => number, seg: number): number {
  const e = { emaDt: 13.9, emaJs: 6, tNivel: 0 }; let nivel = 0, cambios = 0;
  for (let i = 0; i < seg * FPS; i++) {
    e.emaDt += (13.9 - e.emaDt) * 0.05; e.emaJs += (js(nivel, i * DT) - e.emaJs) * 0.05; e.tNivel += DT;
    if (e.tNivel < 4) continue;
    if ((e.emaJs > 8 || e.emaDt > 15.2) && nivel < 3) { e.tNivel = 0; nivel++; cambios++; }
    else if (e.emaJs < 7 && e.emaDt < 14.4 && nivel > 0 && e.tNivel > 25) { e.tNivel = 0; nivel--; cambios++; }
  }
  return cambios;
}
// JS por nivel como en el Quest 3 de MEDIDAS.md (p95 10-12 ms en el nivel 0; cada nivel quita ~1,5 ms) con un temblor determinista de ±0,6 ms
const JS_QUEST = (nivel: number, t: number): number => 11 - 1.5 * nivel + 0.6 * Math.sin(t * 5.3) + 0.3 * Math.sin(t * 1.7);

const subidas = (r: { cambios: Cambio[] }) => r.cambios.filter(c => c[2] < c[1]);
const bajadas = (r: { cambios: Cambio[] }) => r.cambios.filter(c => c[2] > c[1]);

describe("VrControlPuro.decide (Q0c-b)", () => {
  it("histéresis: la serie que oscilaba con la regla de AG-2.3 baja a 3 y se queda (el nivel 2 no cabe: no sube a probarlo)", () => {
    expect(reglaVieja(JS_QUEST, 300)).toBeGreaterThanOrEqual(5);
    const r = corre({ js: JS_QUEST });
    expect(r.cambios.map(c => c[2])).toEqual([1, 2, 3]);
    expect(r.nivel).toBe(3);
    expect(r.cambios.every((c, i, a) => i === 0 || c[0] - a[i - 1]![0] >= 4 - 1e-9)).toBe(true);
    const pegado = corre({ js: JS_QUEST, sube: 7, estable: 1 });
    expect(subidas(pegado).length).toBeGreaterThan(0);   // sin histéresis (sube 7 ms, 1 s) sí sube después de bajar
  });

  it("subida: no llega antes de 10 s estables; un pico reinicia la cuenta; con JS entre 6 y 8 ms no sube ni baja", () => {
    const r = corre({ js: () => 3, nivel: 2, seg: 60 });
    const t0 = r.cambios[0]![0];
    expect(r.cambios[0]![2]).toBe(1);
    expect(t0).toBeGreaterThanOrEqual(10); expect(t0).toBeLessThan(10.2);   // 720 fotogramas buenos de 13,9 ms = 10,0 s
    expect(r.cambios[1]![0] - t0).toBeGreaterThanOrEqual(10 - 1e-9);
    const p = corre({ js: (_n, t) => (t % 8) < 1 ? 14 : 3, nivel: 1, seg: 120, baja: 12 });
    expect(subidas(p)).toEqual([]);
    expect(corre({ js: () => 6.5, nivel: 2, seg: 120 }).cambios).toEqual([]);
  });

  it("el umbral de subir nunca queda a menos de 1 ms del de bajar, y con nivel fijo el controlador no actúa", () => {
    expect(corre({ js: () => 6.5, baja: 5, sube: 9, nivel: 2, seg: 60, maxNivel: 2 }).cambios.length).toBe(0);
    expect(corre({ js: () => 14, fijo: true, seg: 30 }).cambios.length).toBe(0);
    expect(corre({ js: () => 14, nivel: 3, seg: 30 }).cambios.length).toBe(0);
  });

  it("tabla por aparato: [SUPUESTO] donde no hay medida, sin modelo el defecto, una copia cada vez, y subir = bajar − 2 ms", () => {
    for (const m of ["quest-2", "quest-3s", "quest-pro"]) { expect(C.APARATOS[m]!.supuesto).toBe(true); expect(C.APARATOS[m]!.base).toMatch(/\[SUPUESTO\]/); }
    expect(C.APARATOS["quest-3"]!.supuesto).toBe(false); expect(C.APARATOS["quest-3"]!.base).toMatch(/MEDIDAS\.md/);
    const q3 = C.umbrales("quest-3"); expect([q3.baja, q3.sube, q3.estable]).toEqual([8, 6, 10]);
    for (const m of ["", undefined, null, "quest-9", "iphone", "toString", "__proto__"]) expect(C.umbrales(m).fila).toBe("defecto");
    expect(C.umbrales("quest-2").fila).toBe("quest-2");
    expect(C.umbrales("quest-3")).not.toBe(C.umbrales("quest-3"));
    for (const f of Object.values(C.APARATOS)) { expect(f.baja - f.sube).toBeGreaterThanOrEqual(C.DEF.margen); expect(f.sube).toBe(f.baja - C.DEF.holguraSube); }
    expect(C.DEF.sube).toBe(C.APARATOS.defecto!.sube);
  });

  it("un estado de antes (solo emaDt, emaJs, tNivel, tEstable) se completa sin NaN; reinicia lo deja todo de cero", () => {
    const e: EstadoControl = { emaDt: 13.9, emaJs: 6, tNivel: 0, tEstable: 0 };
    for (let i = 0; i < 100; i++) C.decide(e, 13.9, 5, 13.9 / 1000, 0, 3, 8, 6, 10, false);
    expect([e.periodo, e.fPerd, e.buenos, e.castigo, e.tSubida].every(v => Number.isFinite(v))).toBe(true);
    expect(e.buenos).toBe(100);
    e.castigo = 3; C.reinicia(e);
    expect(e).toEqual({ emaDt: 13.9, emaJs: 6, tNivel: 0, tEstable: 0, periodo: 13.9, fPerd: 0, buenos: 0, castigo: 0, tSubida: 0, vigila: false });
  });
});

// ---------------------------------------------------------------- A1-12: la simulación del controlador con series de tiempos de fotograma (L7-03)
describe("A1-12 (L7-03): simulación con tiempos de fotograma", () => {
  const PICOS = [42, 55, 100, 342];
  // el paseo de siempre a 72 Hz, con JS holgado (6,5 ms, bajo los 8 de bajar) y UN fotograma largo a los 40 s (el tirón de una tesela, una compilación)
  const conPico = (ms: number) => ({ dt: ((_n: number, t: number, i: number) => i === 2880 ? ms : 13.9) as Serie, js: ((_n: number, t: number, i: number) => i === 2880 ? ms - 1 : 6.5) as Serie, seg: 120 });

  it("un solo fotograma largo (42, 55, 100 o 342 ms) ya no baja el nivel; con el controlador de antes, sí (lo que vio L7-03)", () => {
    for (const ms of PICOS) {
      expect(antes(conPico(ms)).nivel, "antes, con un pico de " + ms + " ms").toBe(1);
      expect(corre(conPico(ms)).cambios, "ahora, con un pico de " + ms + " ms").toEqual([]);
    }
    // tampoco una racha corta (5 perdidos seguidos de 27,8 ms: un tirón de 140 ms repartido)
    expect(corre({ dt: (_n, _t, i) => i >= 2880 && i < 2885 ? 27.8 : 13.9, js: () => 6.5, seg: 120 }).cambios).toEqual([]);
  });

  it("baja: con fotogramas perdidos de forma sostenida (media frecuencia), con JS sostenido por encima de 8 ms, y con una racha larga de perdidos", () => {
    const media = corre({ dt: () => 27.8, js: () => 5, seg: 30 });
    expect(bajadas(media).length).toBeGreaterThanOrEqual(1);
    expect(media.cambios[0]![0]).toBeGreaterThanOrEqual(4); expect(media.cambios[0]![0]).toBeLessThan(4.1);   // en cuanto pasa la guarda de 4 s
    expect(media.nivel).toBe(3);
    const js = corre({ js: () => 10, seg: 30 }); expect(js.cambios[0]![0]).toBeLessThan(4.1); expect(js.nivel).toBe(3);
    // 20 perdidos seguidos (≈ 0,55 s a media frecuencia) pasado el arranque: baja un nivel, solo uno
    const racha = corre({ dt: (_n, _t, i) => i >= 2880 && i < 2900 ? 27.8 : 13.9, js: (n) => 6.5 - 1.5 * n, seg: 120 });
    expect(racha.cambios.map(c => [c[1], c[2]])).toEqual([[0, 1], [1, 0]]);   // y al cabo de 10 s buenos, vuelve (el nivel 0 cabe)
  });

  it("sube: tras N fotogramas buenos seguidos, N = `estable` s en fotogramas del casco (720 a 72 Hz, 900 a 90 Hz)", () => {
    const a72 = corre({ js: () => 3, nivel: 1, seg: 30 }), a90 = corre({ js: () => 3, dt: () => 1000 / 90, nivel: 1, seg: 30 });
    expect(a72.cambios[0]).toEqual([expect.closeTo(720 * 13.9 / 1000, 5), 1, 0]);
    expect(a90.cambios[0]![0]).toBeCloseTo(900 / 90, 5);   // el periodo se estima del dt: a 90 Hz también 10 s
    expect(a90.e.periodo).toBeCloseTo(1000 / 90, 3);
    // un fotograma perdido o un pico de JS reinicia la cuenta: con uno perdido cada 9 s nunca hay 10 s seguidos de buenos
    const cortado = corre({ js: () => 3, dt: (_n, t, i) => i % 648 === 600 ? 27.8 : 13.9, nivel: 1, seg: 90 });
    expect(subidas(cortado)).toEqual([]);
    // fotogramas con temblor (13,9 ± 0,6 ms) cuentan como buenos: «holgado» es contra el periodo del casco (× 1,25), no contra 14,4 ms fijos
    const temblor = corre({ js: () => 3, dt: (_n, _t, i) => 13.9 + 0.6 * Math.sin(i * 1.3), nivel: 1, seg: 30 });
    expect(subidas(temblor).length).toBe(1);
  });

  it("el trinquete desaparece: tras una bajada legítima (3 s de carga), el nivel vuelve a subir cuando cabe; con el de antes se quedaba abajo", () => {
    // JS por nivel: 6,5 ms en el 0 (cabe) y 1,5 menos por nivel; de 20 a 23 s, una carga de 12 ms de JS
    const serie = { js: ((n: number, t: number) => (t >= 20 && t < 23 ? 12 : 6.5 - 1.5 * n)) as Serie, seg: 300 };
    const ahora = corre(serie), entonces = antes(serie);
    expect(ahora.cambios.map(c => [c[1], c[2]])).toEqual([[0, 1], [1, 0]]);
    expect(ahora.nivel).toBe(0);
    expect(ahora.cambios[1]![0] - ahora.cambios[0]![0]).toBeLessThan(16);   // la guarda, la media de JS que vuelve y 10 s buenos
    expect(entonces.nivel).toBe(1);   // L7-03: con 5 ms de JS en el nivel 1 no se cumplía «< 5 ms durante 10 s»
    expect(subidas(entonces)).toEqual([]);
  });

  it("no oscila entre dos niveles: si el de arriba no cabe, cada nueva prueba espera el doble (hasta × 16) y se pasa allí menos del 6 % del tiempo", () => {
    // el nivel 1 va holgado (5 ms) y el 0 no cabe (9 ms): la peor serie para oscilar entre 0 y 1
    const r = corre({ js: (n) => (n === 0 ? 9 : 5), nivel: 1, seg: 1200 });
    const s = subidas(r).map(c => c[0]), esperas = s.slice(1).map((t, i) => t - s[i]!);
    expect(r.cambios.every(c => Math.abs(c[2] - c[1]) === 1 && c[1] <= 1 && c[2] <= 1)).toBe(true);   // solo entre 0 y 1
    expect(s.length).toBeLessThanOrEqual(10);   // en 20 min; sin el castigo serían ~80 (una cada ~15 s)
    for (let i = 1; i < Math.min(esperas.length, 4); i++) expect(esperas[i]!).toBeGreaterThan(1.8 * esperas[i - 1]!);   // 10 → 20 → 40 → 80 → 160 s
    expect(Math.max(...esperas)).toBeLessThan(16 * 10 + 10);   // el castigo tiene techo: nunca deja de probar
    expect(r.enNivel[0]! / 1200).toBeLessThan(0.06);
    expect(r.e.castigo).toBe(C.DEF.castigoMax);
    // y si el de arriba pasa a caber (a los 20 min el 0 cuesta 6,5 ms), sube, se queda y el castigo se va perdonando
    const luego = corre({ js: (n, t) => (n === 0 ? (t < 600 ? 9 : 6.5) : 5), nivel: 1, seg: 1500 });
    expect(luego.nivel).toBe(0);
    const ultima = luego.cambios.at(-1)!; expect(ultima[2]).toBe(0); expect(ultima[0]).toBeLessThan(600 + 16 * 10 + 20);
    expect(luego.e.castigo).toBeLessThan(C.DEF.castigoMax);
  });

  it("con la gente (sueloGente) una bajada no castiga: es pedida, no un rebote", () => {
    const e = estadoNuevo(); let n = 1, t = 0;
    for (let i = 0; i < 72 * 20; i++, t += DT) { const d = C.decide(e, 13.9, 3, DT, n, 3, 8, 6, 10, false, t > 12 ? 1 : 0); n += d; }
    expect(e.castigo).toBe(0);
    expect(n).toBe(1);   // subió a 0 a los 10 s y la gente lo bajó a 1 a los 14 s (la guarda), sin castigo
  });
});

// ---------------------------------------------------------------- A1-12: la escala de los olivos en VR (L1-03)
describe("A1-12 (L1-03): «holgado» en VR contra el presupuesto del perfil", () => {
  // la regla de pantalla de 07b_arboles.ajustaEscala (emaDt en s), la que antes corría también en VR
  const escalaPantalla = (esc: number, emaDt: number, triFot: number): number => {
    const techo = emaDt < 0.016 && triFot < 1400000 ? 2.5 : 1.6;
    if (triFot > 1700000 && esc > 1.6) return Math.max(1.6, esc - 0.10);
    if (emaDt < 0.020) return Math.min(Math.max(techo, esc > 1.6 ? esc : 0), esc + 0.05);
    if (emaDt > 0.030) return Math.max(0.7, esc - 0.10);
    return esc;
  };
  // el estado del controlador tras `seg` s con un JS fijo a 72 Hz
  const estadoTras = (js: number, dtMs = 13.9, seg = 10) => { const e = estadoNuevo(); for (let i = 0; i < seg * 72; i++) C.decide(e, dtMs, js, dtMs / 1000, 0, 3, 8, 6, 10, true); return e; };

  it("holgura: justo con JS sobre 8 ms o con perdidos sostenidos; holgado con JS bajo 6 y casi sin perdidos; en medio, 0", () => {
    expect(C.holgura(estadoTras(10), 8, 6)).toBe(-1);
    expect(C.holgura(estadoTras(4, 27.8), 8, 6)).toBe(-1);
    expect(C.holgura(estadoTras(4), 8, 6)).toBe(1);
    expect(C.holgura(estadoTras(7), 8, 6)).toBe(0);
    expect(C.holgura({ emaDt: 13.9, emaJs: 7, tNivel: 0, tEstable: 0 }, 8, 6)).toBe(0);   // un estado de antes también vale
  });

  it("en VR la escala no pasa de 1 (el perfil tal cual), sube solo si va holgado y los triángulos caben, y baja hasta 0,7 si va justo", () => {
    // un casco a 72 Hz va siempre a 13,9 ms aunque el fotograma vaya justo: con la regla de pantalla, la escala sube a 2,5 (L1-03)
    let viejo = 1; for (let i = 0; i < 100; i++) viejo = escalaPantalla(viejo, 0.0139, 200000);
    expect(viejo).toBe(2.5);
    const holg = C.holgura(estadoTras(4), 8, 6), justo = C.holgura(estadoTras(10), 8, 6);
    let esc = 0.7; for (let i = 0; i < 100; i++) esc = C.escalaVr(esc, holg, 200000, 380000);
    expect(esc).toBe(1);
    let lleno = 0.7; for (let i = 0; i < 100; i++) lleno = C.escalaVr(lleno, holg, 400000, 380000);
    expect(lleno).toBe(0.7);   // holgado de JS pero sin sitio en el perfil: no crece
    let baja = 1; for (let i = 0; i < 100; i++) baja = C.escalaVr(baja, justo, 200000, 380000);
    expect(baja).toBe(0.7);
    expect(C.escalaVr(2.5, 0, 0, 380000)).toBe(1);   // venía de pantalla con 2,5: en VR, al techo del perfil
    expect(C.escalaVr(0.85, 0, 0, 380000)).toBe(0.85);   // en medio, se queda
  });
});

// ---------------------------------------------------------------- la gente (Q0c-c)
// avanza `seg` s con js(t) y gente(t) (personas a la vista); `suelo` como lo calcula VrPresupuesto.suelo(umbral). Devuelve los cambios [t, de, a]
function correGente(o: { js: (t: number) => number; gente: (t: number) => number; seg: number; umbral?: number; nivel?: number; fijo?: boolean; usaSuelo?: boolean }) {
  const { js, gente, seg, umbral = 8, nivel = 0, fijo = false, usaSuelo = true } = o;
  const e = estadoNuevo(), V = creaVrPresupuesto(), cambios: [number, number, number][] = []; let n = nivel;
  for (let i = 0; i < Math.round(seg * FPS); i++) {
    const t = i * DT; V.ponGente(gente(t));
    const s = usaSuelo ? V.suelo(umbral) : undefined, d = C.decide(e, 13.9, js(t), DT, n, 3, 8, 5, 10, fijo, s);
    if (d) { cambios.push([+t.toFixed(2), n, n + d]); n += d; }
  }
  return { cambios, nivel: n };
}

describe("la gente en el presupuesto (Q0c-c)", () => {
  it("sueloGente: 0 personas, 0; más de N, un escalón; con histéresis para no oscilar en el borde", () => {
    expect(C.sueloGente(0, 8, 0)).toBe(0); expect(C.sueloGente(0, 8, 1)).toBe(0);
    expect(C.sueloGente(8, 8, 0)).toBe(0); expect(C.sueloGente(9, 8, 0)).toBe(1); expect(C.sueloGente(40, 8, 0)).toBe(1);
    expect(C.sueloGente(8, 8, 1)).toBe(1); expect(C.sueloGente(7, 8, 1)).toBe(1); expect(C.sueloGente(6, 8, 1)).toBe(0);
    expect(C.sueloGente(NaN, 8, 0)).toBe(0); expect(C.sueloGente(10, 0, 0)).toBe(0);
  });

  it("con 0 personas el controlador es idéntico al de antes (misma serie de cambios, con y sin el argumento nuevo)", () => {
    const series = [
      (t: number) => 11 - 0.5 * Math.sin(t) + 0.6 * Math.sin(t * 5.3),
      (t: number) => 4 + 0.5 * Math.sin(t * 3.1),
      (t: number) => (Math.floor(t / 40) % 2 ? 4 : 10) + 0.3 * Math.sin(t * 2.7)
    ];
    for (const js of series) {
      const antes = correGente({ js, gente: () => 0, seg: 300, usaSuelo: false }), con0 = correGente({ js, gente: () => 0, seg: 300 });
      const e = estadoNuevo(), r: [number, number, number][] = []; let n = 0;
      for (let i = 0; i < 300 * FPS; i++) { const d = C.decide(e, 13.9, js(i * DT), DT, n, 3, 8, 5, 10, false, 0); if (d) { r.push([+(i * DT).toFixed(2), n, n + d]); n += d; } }
      expect(con0.cambios).toEqual(antes.cambios); expect(r).toEqual(antes.cambios);
    }
    expect(correGente({ js: series[0]!, gente: () => 0, seg: 300 }).cambios.length).toBeGreaterThanOrEqual(1);
  });

  it("bajada anticipada: con más de N personas baja UN escalón sin esperar al JS, no baja más y no sube mientras siga la gente", () => {
    const holgado = () => 4;
    const r = correGente({ js: holgado, gente: () => 12, seg: 120 });
    expect(r.cambios.map(c => [c[1], c[2]])).toEqual([[0, 1]]);
    expect(r.cambios[0]![0]).toBeGreaterThanOrEqual(C.DEF.guarda);
    expect(r.nivel).toBe(1);
    expect(correGente({ js: holgado, gente: () => 3, seg: 120 }).cambios).toEqual([]);
    expect(correGente({ js: holgado, gente: () => 8, seg: 120 }).cambios).toEqual([]);
    const va = correGente({ js: holgado, gente: t => t < 30 ? 12 : 2, seg: 120 });
    expect(va.cambios.map(c => [c[1], c[2]])).toEqual([[0, 1], [1, 0]]);
    expect(va.cambios[1]![0]).toBeGreaterThanOrEqual(30);
    expect(correGente({ js: holgado, gente: t => Math.floor(t) % 2 ? 7 : 9, seg: 200 }).cambios.length).toBe(1);
    expect(correGente({ js: () => 12, gente: () => 12, seg: 120 }).nivel).toBe(3);
    expect(correGente({ js: holgado, gente: () => 40, seg: 60, fijo: true }).cambios).toEqual([]);
    expect(correGente({ js: holgado, gente: () => 12, seg: 60, umbral: 20 }).cambios.length).toBe(0);
    expect(correGente({ js: holgado, gente: () => 4, seg: 60, umbral: 3 }).cambios.length).toBe(1);
  });
});

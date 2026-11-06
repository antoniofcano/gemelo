// La llegada y tocar para ir andando (A1-11 / MU1-7). Estas pruebas vivían en pruebas/guardianes/llegada.test.js y ir_a.test.js evaluando los trozos [puro] de
// apps/web/motor/12b_llegada.js y 12c_ir_a.js; ahora prueban el módulo de verdad. Se quedan en los guardianes la costura por texto (09_camara, 12_paseo,
// 33_ajustes) y lo que corre en el navegador (el Dron, el anillo, la VR simulada). HONESTIDAD: el paseante es un modelo sin pasos ni relieve; no dice nada
// de comodidad en un iPhone ni en un Quest.
import { describe, expect, it } from "vitest";
import { IrAPuro as I, LlegadaPuro as L } from "./locomocion.ts";
import type { Copa, Punto2 } from "./locomocion.ts";

const cerca = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
const EXT = [-500, 500, 500, -500];   // D.ext = [x0, yNorte, x1, ySur]
const llano = (): number => 100;      // suelo a 100 m (ya con exageración)

describe("LlegadaPuro", () => {
  it("rayo → suelo llano desde 230 m: toca donde se apunta", () => {
    const o = { x: 0, y: 330, z: 0 }, d = { x: 0, y: -230, z: -100 };   // a 100 m hacia el norte (z = −norte)
    const p = L.rayoSuelo(o, d, llano, EXT);
    expect(p).not.toBeNull();
    expect(cerca(p!.x, 0, 0.01) && cerca(p!.z, -100, 0.05) && cerca(p!.y, 100, 1e-9), JSON.stringify(p)).toBe(true);
    expect(cerca(p!.dist, Math.hypot(230, 100), 0.1)).toBe(true);
  });

  it("rayo → suelo con relieve: el punto queda en la superficie y antes de la loma", () => {
    const loma = (x: number, z: number): number => 100 + Math.max(0, 40 - Math.hypot(x, z + 350) * 0.4);   // una loma de 40 m centrada 350 m al norte
    const o = { x: 0, y: 300, z: 0 }, d = { x: 0, y: -0.5, z: -1 };
    const p = L.rayoSuelo(o, d, loma, EXT);
    expect(p).not.toBeNull();
    expect(cerca(p!.y, loma(p!.x, p!.z), 0.05), "sobre la superficie: " + JSON.stringify(p)).toBe(true);
    expect(cerca(o.y + (d.y / Math.hypot(d.y, d.z)) * p!.dist, p!.y, 0.05), "en el rayo").toBe(true);
    const enLlano = L.rayoSuelo(o, d, llano, EXT);
    expect(p!.dist).toBeLessThan(enLlano!.dist);   // con la loma delante, el rayo toca antes que en llano
  });

  it("rayo → suelo: sin punto si apunta al horizonte o hacia arriba, fuera de la finca, más allá del tope o desde bajo tierra", () => {
    const o = { x: 0, y: 330, z: 0 };
    expect(L.rayoSuelo(o, { x: 0, y: 0.2, z: -1 }, llano, EXT)).toBeNull();   // hacia arriba
    expect(L.rayoSuelo(o, { x: 0, y: -0.01, z: -1 }, llano, EXT)).toBeNull();   // casi horizontal
    expect(L.rayoSuelo(o, { x: 0, y: -230, z: -600 }, llano, EXT)).toBeNull();   // cae al norte de la finca
    expect(L.rayoSuelo(o, { x: 0, y: -230, z: -498.5 }, llano, EXT)).toBeNull();   // dentro del margen de 3 m del borde
    expect(L.rayoSuelo(o, { x: 0, y: -230, z: -495 }, llano, EXT)).toBeTruthy();   // a 5 m del borde sí
    expect(L.rayoSuelo(o, { x: 0, y: -230, z: -100 }, llano, EXT, 100)).toBeNull();   // más allá del tope de distancia
    expect(L.rayoSuelo({ x: 0, y: 90, z: 0 }, { x: 0, y: -1, z: 0 }, llano, EXT)).toBeNull();   // el origen ya está bajo el suelo
    expect(L.rayoSuelo(o, { x: 0, y: 0, z: 0 }, llano, EXT)).toBeNull();   // sin dirección
  });

  it("sin anillo por detrás de la mirada", () => {
    const c = { x: 0, y: 330, z: 0 }, mira = { x: 0, y: 0, z: -1 };   // mira al norte, horizontal
    expect(L.delante(c, mira, { x: 0, y: 100, z: -300 })).toBe(true);   // delante y abajo
    expect(L.delante(c, mira, { x: 0, y: 100, z: 0 })).toBe(true);   // justo debajo (90°) se admite
    expect(L.delante(c, mira, { x: 0, y: 100, z: 300 })).toBe(false);   // detrás
    expect(L.delante(c, { x: 0, y: -1, z: 0 }, { x: 0, y: 100, z: 300 })).toBe(true);   // mirando abajo, un punto bajo y algo atrás está a la vista
  });

  it("el anillo crece con la distancia (≈1,4°) entre 0,4 y 30 m", () => {
    expect(L.radioMarca(2)).toBe(0.4);
    expect(cerca(L.radioMarca(250), 6.25, 1e-9)).toBe(true);
    expect(L.radioMarca(5000)).toBe(30);
    for (let d = 10; d < 1200; d += 10) expect(L.radioMarca(d + 10)).toBeGreaterThanOrEqual(L.radioMarca(d));
  });

  it("el aterrizaje se aparta de los troncos de olivo (0,55 m) y deja lo que no es olivo", () => {
    const copas: Copa[] = [{ x: 10, y: 20, oliv: true }, { x: 30, y: 40, oliv: false }];
    const a = L.fueraDeTroncos(10.1, -20, copas);   // escena: z = −norte
    expect(cerca(Math.hypot(a.x - 10, a.z + 20), 0.55, 1e-9), JSON.stringify(a)).toBe(true);
    const b = L.fueraDeTroncos(10, -20, copas);   // justo en el tronco
    expect(cerca(Math.hypot(b.x - 10, b.z + 20), 0.55, 1e-9), JSON.stringify(b)).toBe(true);
    expect(L.fueraDeTroncos(30, -40, copas)).toEqual({ x: 30, z: -40 });   // no olivo: no se aparta
    expect(L.fueraDeTroncos(15, -20, copas)).toEqual({ x: 15, z: -20 });   // lejos: no se toca
  });

  it("dentro de la finca, con 3 m de margen", () => {
    expect(L.dentro(0, 0, EXT)).toBe(true); expect(L.dentro(496, -496, EXT)).toBe(true);
    expect(L.dentro(498, 0, EXT)).toBe(false); expect(L.dentro(0, 498, EXT)).toBe(false); expect(L.dentro(0, -498, EXT)).toBe(false);
  });

  it("toque frente a arrastre: umbral de movimiento (px) y de tiempo (ms)", () => {
    expect(L.esToque(0, 120, "mouse")).toBe(true);   // clic quieto
    expect(L.esToque(5, 300, "mouse")).toBe(true);
    expect(L.esToque(7, 100, "mouse")).toBe(false);   // el ratón se ha movido: arrastre
    expect(L.esToque(11, 200, "touch")).toBe(true);   // con el dedo se tolera más temblor
    expect(L.esToque(13, 200, "touch")).toBe(false);   // arrastrar con el dedo no pone anillo
    expect(L.esToque(0, L.TOQUE_MS + 1, "touch")).toBe(false);   // pulsación larga: no
    expect(L.esToque(3, 200, undefined)).toBe(true);   // tipo desconocido: como el ratón
  });
});

describe("IrAPuro", () => {
  it("toque corto sí; arrastre o pulsación larga no (según el puntero)", () => {
    expect(I.esToque(0, 120, "mouse") && I.esToque(5, 399, "mouse")).toBe(true);
    expect(I.esToque(7, 100, "mouse")).toBe(false);   // 7 px con ratón ya es arrastre
    expect(I.esToque(11, 100, "touch") && !I.esToque(13, 100, "touch")).toBe(true);   // el dedo tiembla más
    expect(I.esToque(2, 401, "mouse")).toBe(false);   // pulsación larga
    expect(I.esToque(6, 100, "otro")).toBe(true);   // tipo desconocido: como el ratón
  });

  it("URL > ajuste > encendido por defecto", () => {
    expect(I.activa(undefined, "")).toBe(true);
    expect(I.activa(true, "?debug")).toBe(true);
    expect(I.activa(false, "")).toBe(false);
    expect(I.activa(true, "?tocar=0")).toBe(false);
    expect(I.activa(false, "?a=1&tocar=1")).toBe(true);
    expect(I.activa(true, "?tocar=10")).toBe(true);   // valor no válido: se ignora
  });

  it("rumbo: 0 = norte, π/2 = este; la diferencia de ángulos va por el lado corto", () => {
    expect(Math.abs(I.rumbo(0, 0, 0, 10))).toBeLessThan(1e-9);
    expect(Math.abs(I.rumbo(0, 0, 10, 0) - Math.PI / 2)).toBeLessThan(1e-9);
    expect(Math.abs(I.difAng(3.0, -3.0) - (2 * Math.PI - 6))).toBeLessThan(1e-9);   // de 3 a −3 rad son 0,28 rad hacia delante
    expect(Math.abs(I.difAng(0, 0.5) - 0.5)).toBeLessThan(1e-9);
  });

  it("gira a lo sumo GIRO·dt y no se pasa de la meta", () => {
    expect(Math.abs(I.gira(0, 3, 0.1) - I.GIRO * 0.1)).toBeLessThan(1e-9);
    expect(I.gira(0, 0.01, 0.1)).toBe(0.01);
    expect(I.gira(0, -1, 0.1)).toBeLessThan(0);
  });

  it("avance: entero de frente, nada de espaldas, justo lo que falta al llegar", () => {
    expect(Math.abs(I.avance(50, 0, 0.016, 1.7) - 1)).toBeLessThan(1e-9);
    expect(I.avance(50, Math.PI, 0.016, 1.7)).toBe(0);
    expect(I.avance(50, Math.PI / 2 + 0.1, 0.016, 1.7)).toBe(0);
    expect(I.avance(0.01, 0, 0.016, 1.7)).toBeLessThan(0.5);   // casi en el punto: frena
  });

  it("caminar hasta el punto: llega, sin pasarse, a la velocidad de paseo y recto", () => {
    const st = I.crea(), pos = { x: 0, y: 0, ang: 0 }; I.ir(st, 3, 20);
    let t = 0, fin: string | null = null, vmax = 0;
    for (; t < 60 && !fin; t += 0.016) {
      const r = I.paso(st, pos, 0.016, 1.7); if (!r) break; fin = r.fin; pos.ang = r.ang;
      const v = r.av * 1.7; vmax = Math.max(vmax, v);
      pos.x += Math.sin(pos.ang) * v * 0.016; pos.y += Math.cos(pos.ang) * v * 0.016;
    }
    expect(fin).toBe("llego");
    expect(Math.hypot(pos.x - 3, pos.y - 20), JSON.stringify(pos)).toBeLessThan(I.LLEGA + 0.05);
    expect(vmax).toBeLessThanOrEqual(1.7 + 1e-9);   // nunca más rápido que andar
    expect(t > 20.2 / 1.7 - 0.5 && t < 20.2 / 1.7 + 2.5, "tarda lo que andar esa distancia (más el giro): " + t).toBe(true);
    expect(st.dest).toBeNull();   // al llegar no queda destino
  });

  it("de espaldas al destino primero gira (sin andar hacia atrás) y luego anda", () => {
    const st = I.crea(), pos = { x: 0, y: 0, ang: Math.PI }; I.ir(st, 0, 30);
    const r1 = I.paso(st, pos, 0.016, 1.7); expect(r1?.av).toBe(0);   // aún de espaldas
    let r = r1; for (let k = 0; k < 70; k++) { r = I.paso(st, pos, 0.016, 1.7); pos.ang = r!.ang; }
    expect(r!.av > 0.9 && Math.abs(I.difAng(pos.ang, 0)) < 0.05, "tras ~1 s (π a 3,2 rad/s) mira al destino y anda").toBe(true);
  });

  it("otro toque cambia el destino; cancelar lo borra; sin destino no hay paso", () => {
    const st = I.crea(), pos = { x: 0, y: 0, ang: 0 };
    expect(I.paso(st, pos, 0.016, 1.7)).toBeNull();
    I.ir(st, 10, 10); I.ir(st, -5, 8); expect(st.dest).toEqual({ x: -5, y: 8 });
    I.cancela(st); expect(I.paso(st, pos, 0.016, 1.7)).toBeNull();
  });

  it("atascado: si andando no se acerca (un tronco) se rinde en ~1,2 s", () => {
    const st = I.crea(), pos = { x: 0, y: 0, ang: 0 }; I.ir(st, 0, 30);
    let fin: string | null = null, t = 0; for (; t < 5 && !fin; t += 0.016) fin = I.paso(st, pos, 0.016, 1.7)!.fin;   // la posición no cambia: algo lo para
    expect(fin).toBe("atascado"); expect(t > 1.1 && t < 1.6, String(t)).toBe(true);
  });

  // ---- rodear troncos y línea de puntos (EV2-B3)
  const marco = (n: number, m: number, sep: number): Copa[] => { const c: Copa[] = []; for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) c.push({ x: i * sep, y: j * sep, oliv: true }); return c; };
  function camina(st: ReturnType<typeof I.crea>, pos: { x: number; y: number; ang: number }, tope: number, copas: Copa[]) {   // simula actualizaPaseo: avanza y empuja fuera de los troncos (0,55 m)
    let t = 0, fin: string | null = null, minD = Infinity;
    for (; t < tope && !fin; t += 0.016) {
      const r = I.paso(st, pos, 0.016, 1.7); if (!r) break; fin = r.fin; pos.ang = r.ang;
      pos.x += Math.sin(pos.ang) * r.av * 1.7 * 0.016; pos.y += Math.cos(pos.ang) * r.av * 1.7 * 0.016;
      for (const c of copas) { const dx = pos.x - c.x, dy = pos.y - c.y, d = Math.hypot(dx, dy); if (d < 0.55) { pos.x = c.x + dx / d * 0.55; pos.y = c.y + dy / d * 0.55; } minD = Math.min(minD, d); }
    }
    return { fin, t, minD };
  }

  it("planifica: camino libre = solo el destino; con un tronco en medio, un punto por el lado libre", () => {
    expect(I.planifica({ x: 0, y: 0 }, { x: 0, y: 10 }, [{ x: 5, y: 5, oliv: true }])).toEqual([{ x: 0, y: 10 }]);
    const ruta = I.planifica({ x: 0, y: 0 }, { x: 0, y: 10 }, [{ x: 0, y: 5, oliv: true }]) as Punto2[];
    expect(ruta).toHaveLength(2); expect(ruta[1]).toEqual({ x: 0, y: 10 });
    expect(Math.hypot(ruta[0]!.x - 0, ruta[0]!.y - 5)).toBeGreaterThanOrEqual(I.R_TRONCO);   // pasa a más de 1 m del tronco
    const alto = I.planifica({ x: 0, y: 0 }, { x: 0, y: 10 }, [{ x: 0, y: 5, oliv: true }, { x: -1.3, y: 5, oliv: true }]) as Punto2[];
    expect(alto[0]!.x).toBeGreaterThan(0);   // si un lado está tapado por otro tronco, va por el otro
    expect(I.planifica({ x: 0, y: 0 }, { x: 0, y: 10 }, [{ x: 0, y: 5, oliv: false }])).toHaveLength(1);   // lo que no es olivo no estorba
  });

  it("andar a través de un marco de olivos de 6 m llega sin rendirse y sin pegarse al tronco", () => {
    const copas = marco(8, 8, 6), pos = { x: 3, y: 3, ang: 0.7 }, d = { x: 33, y: 33 };
    const ruta = I.planifica(pos, d, copas); expect(ruta, "hay rodeo").toBeTruthy();
    const st = I.crea(); I.ir(st, d.x, d.y, ruta!.slice(0, -1), copas);
    const r = camina(st, pos, 80, copas);
    expect(r.fin, JSON.stringify([r, pos, ruta])).toBe("llego");
    expect(r.minD).toBeGreaterThan(0.55 - 1e-9);
  });

  it("sin rodeo posible no se cuelga (tope) y se rinde: atascado tras replanificar una vez", () => {
    const copas: Copa[] = []; for (let i = -3; i <= 3; i++) copas.push({ x: i * 0.9, y: 5, oliv: true });   // un muro de troncos
    const ext = [-50, 50, 50, -50], t0 = Date.now(); const ruta = I.planifica({ x: 0, y: 0 }, { x: 0, y: 10 }, copas, 1.0, [-50, 50, 50, -50]);
    expect(Date.now() - t0).toBeLessThan(100);   // el tope de tramos acota el tiempo
    const st = I.crea(), pos = { x: 0, y: 0, ang: 0 }; I.ir(st, 0, 10, [], copas, ext);
    const r = camina(st, pos, 8, copas); expect(r.fin, JSON.stringify([ruta, r])).toBe("atascado");
  });

  it("línea de puntos: sobre el camino, cada 1,2 m desde el destino, sin el del destino, se acorta al avanzar y respeta el tope", () => {
    const st = I.crea(); I.ir(st, 0, 12.5, [{ x: 3, y: 6 }]);
    const v = I.puntosLinea({ x: 0, y: 0 }, st, 1.2, 80);
    expect(v.length >= 8 && v.length <= 14, String(v.length)).toBe(true);
    expect(v.every(p => Math.hypot(p.x - 0, p.y - 12.5) > 1.0), "ninguno sobre el destino").toBe(true);
    const w = I.puntosLinea({ x: 3, y: 6 }, st, 1.2, 80);
    expect(w.length).toBeLessThan(v.length);   // al avanzar quedan menos
    const wl = w[w.length - 1]!, vl = v[v.length - 1]!;
    expect(Math.abs(wl.x - vl.x) < 1e-6 && Math.abs(wl.y - vl.y) < 1e-6, "los de delante no se mueven").toBe(true);
    st.dest = { x: 0, y: 500 }; expect(I.puntosLinea({ x: 0, y: 0 }, st, 1.2, 80)).toHaveLength(80);
    I.cancela(st); expect(I.puntosLinea({ x: 0, y: 0 }, st, 1.2, 80)).toEqual([]);
  });
});

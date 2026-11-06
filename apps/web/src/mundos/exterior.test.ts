// El exterior como primer mundo registrado (MU2-3). Con pasos falsos, un bucle de verdad y el gestor de verdad: el exterior llama a sus pasos en orden,
// los pasos «caro» no corren con la página oculta, el reparto suma por bloque, y el gestor arranca con «exterior» y lo actualiza.
// HONESTIDAD: prueba el envoltorio; que el motor legado siga igual en pantalla se mira en el banco, no aquí.
import { describe, expect, it } from "vitest";
import { creaBucle } from "../nucleo/bucle.ts";
import type { PasoBucle } from "../nucleo/bucle.ts";
import { creaCola } from "../nucleo/cola.ts";
import { creaWorldManager } from "../nucleo/mundos.ts";
import { creaExterior } from "./exterior.ts";

const recorreSimple = (p: readonly PasoBucle[], dt: number, t: number): void => { for (const x of p) x.fn(dt, t); };
const pasosFalsos = (reg: string[]): PasoBucle[] => ["entidades", "tiempo", "mundo", "carga", "Cola", "Escena3D"].map((n) => ({ bloque: null, fn: () => { reg.push(n); } }));
const fundidoFalso = () => ({ cierra: () => Promise.resolve(), abre: () => Promise.resolve() });

describe("creaExterior", () => {
  it("es un mundo «exterior» y actualiza(dt, t) llama a sus pasos en el orden dado, con dt y t", () => {
    const reg: string[] = [], vistos: Array<[number, number]> = [];
    const pasos: PasoBucle[] = [...pasosFalsos(reg), { fn: (dt, t) => { vistos.push([dt, t]); } }];
    const e = creaExterior({ pasos, recorre: recorreSimple });
    expect(e.id).toBe("exterior");
    e.actualiza(0.016, 5000);
    expect(reg).toEqual(["entidades", "tiempo", "mundo", "carga", "Cola", "Escena3D"]);
    expect(vistos).toEqual([[0.016, 5000]]);
  });
  it("carga, entra, congela y libera (mínimos, MU2-6) no lanzan ni tocan los pasos; libera se puede llamar dos veces", async () => {
    const reg: string[] = [];
    const e = creaExterior({ pasos: pasosFalsos(reg), recorre: recorreSimple });
    await expect(e.carga({} as never)).resolves.toBeUndefined();
    e.entra(null, null); e.congela(); e.libera(); e.libera();
    expect(e.sale()).toEqual({ x: 0, y: 0, ang: 0 });
    expect(reg).toEqual([]);
  });
  it("suelo es el que se le da (en metros); sin él, 0. dentro y obstaculo no restringen todavía (MU2-4)", () => {
    expect(creaExterior({ pasos: [], recorre: recorreSimple, suelo: (x, y) => x + 2 * y }).suelo(3, 4)).toBe(11);
    const e = creaExterior({ pasos: [], recorre: recorreSimple });
    expect(e.suelo(3, 4)).toBe(0); expect(e.dentro(1e6, 1e6)).toBe(true); expect(e.obstaculo(0, 0, 1)).toBeNull();
  });
});

describe("el gestor con el exterior", () => {
  it("arranca con «exterior» (sin fundido), queda activo y gm.actualiza corre los pasos; antes de arrancar no corre nada", async () => {
    const reg: string[] = [];
    const gm = creaWorldManager({ fundido: fundidoFalso(), cola: creaCola({ ahora: () => 0 }), temporizador: (f, ms) => { const h = setTimeout(f, ms); return () => clearTimeout(h); } });
    gm.registra(() => Promise.resolve(creaExterior({ pasos: pasosFalsos(reg), recorre: recorreSimple })), "exterior");
    gm.actualiza(0.016, 0); expect(reg).toEqual([]);   // aún sin mundo
    const r = await gm.arranca("exterior");
    expect(r.ok).toBe(true); expect(r.mundo).toBe("exterior"); expect(gm.actual).toBe("exterior"); expect(gm.estado).toBe("en"); expect(gm.fichaDe("exterior")).toBe("activo");
    gm.actualiza(0.016, 1000);
    expect(reg).toEqual(["entidades", "tiempo", "mundo", "carga", "Cola", "Escena3D"]);
    expect(gm.suelo(1, 2)).toBe(0);
  });
});

describe("el exterior dentro del bucle (Bucle.recorre)", () => {
  function monta() {
    const reg: string[] = [], bloques: number[] = [];
    let oculto = false, repartoOn = false, t = 1000;
    const doc = { visibilityState: "visible", addEventListener(_t: string, fn: (e: unknown) => void) { this.fn = fn; }, fn: (() => {}) as (e?: unknown) => void };
    const R = { get on() { return repartoOn; }, ini: () => 0, pasa: (b: number, q: number) => { bloques.push(b); return q; } };
    const pasosExt: PasoBucle[] = [
      { bloque: 7, fn: () => { reg.push("a"); } },
      { bloque: 8, caro: true, fn: () => { reg.push("cola"); } },
      { bloque: null, fn: () => { reg.push("fase"); } },
    ];
    let B: ReturnType<typeof creaBucle>;
    const ext = creaExterior({ pasos: pasosExt, recorre: (p, dt, tt) => B.recorre(p, dt, tt) });
    const gm = creaWorldManager({ fundido: fundidoFalso(), cola: creaCola({ ahora: () => 0 }), temporizador: (f, ms) => { const h = setTimeout(f, ms); return () => clearTimeout(h); } });
    gm.registra(() => Promise.resolve(ext), "exterior");
    B = creaBucle({
      ahora: () => t, pideCuadro: () => {}, reparto: R, documento: doc,
      pasos: [{ bloque: 1, fn: () => { reg.push("camara"); } }, { bloque: null, fn: gm.actualiza }, { render: true, fn: () => { reg.push("render"); } }],
    });
    return { reg, bloques, gm, B, doc, oculta: () => { oculto = true; doc.visibilityState = "hidden"; doc.fn(); }, midiendo: () => { repartoOn = true; }, avanza: () => { t += 16; B.cuadro(t); }, esOculto: () => oculto };
  }
  it("los pasos del exterior corren entre la cámara y el render, en su orden", async () => {
    const m = monta(); await m.gm.arranca("exterior");
    m.avanza(); expect(m.reg).toEqual(["camara", "a", "cola", "fase", "render"]);
  });
  it("con la página oculta, el paso «caro» del exterior no corre, igual que en el bucle", async () => {
    const m = monta(); await m.gm.arranca("exterior"); m.oculta();
    m.avanza(); expect(m.reg).toEqual(["camara", "a", "fase", "render"]);
  });
  it("midiendo, los bloques numéricos del exterior suman al reparto y las fases no", async () => {
    const m = monta(); await m.gm.arranca("exterior"); m.midiendo();
    m.avanza(); expect(m.bloques).toEqual([1, 7, 8]);
  });
});

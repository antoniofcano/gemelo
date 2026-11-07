// La previsión del tiempo como lámina (MU5-n, A3-7b1: antes apps/web/motor/35_fichas_tiempo.js). La maqueta y el dibujo, y la lámina con un THREE de mentira, los cubre el guardián de Node
// (pruebas/guardianes/fichas_tiempo.test.js); aquí, con Vitest, el manifiesto y el CICLO DE VIDA con dependencias de mentira: montar engancha la tecla P, la fila y la tapa del panel VR, la
// suscripción a TiempoVivo, el aviso «prevision:alterna» y window.__fichaTiempo; libera() cierra la lámina y, con el contexto, lo suelta todo.
// HONESTIDAD: sin GPU ni casco; cómo se ve la lámina en un Quest, en el banco (no probado).
import { afterEach, describe, expect, it } from "vitest";
import { FichasTiempoPuro, ID_FICHAS_TIEMPO, manifiestoFichasTiempo } from "./fichas-tiempo.ts";
import { creaMundo, type Mundo } from "../../nucleo/prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });

function monta() {
  m = creaMundo();
  const vivos = { teclas: 0, filas: 0, tapas: 0, tiempoVivo: 0, bus: 0 }, laminas = { abiertas: 0, cerradas: 0 }, limpias: Array<() => void> = [];
  const quita = (k: keyof typeof vivos) => { vivos[k]++; return () => { vivos[k]--; }; };
  const dp = {
    THREE: { Vector3: class { x = 0; y = 0; z = 0; } },
    Laminas: { abre: () => { laminas.abiertas++; return true; }, cierra: () => { laminas.cerradas++; return true; }, hay: () => false, repinta: () => true, revisa() {}, info: () => ({ abierta: false, modo: "pantalla", pos: [0, 0, 0], rumbo: 0 }) },
    Teclas: { registra: () => quita("teclas") }, Hud: { aviso() {} }, VRX: { on: false, cab: { x: 0, y: 1.6, z: 0 } },
    PanelVR: { filas: () => quita("filas"), tapa: () => quita("tapas"), repinta() {}, cierra() {}, rumbo: () => 0 }, camera: { getWorldDirection: () => ({ x: 0, z: -1 }) },
    TiempoVivo: { lee: () => null, alCambiar: () => quita("tiempoVivo") }, ahoraMs: () => Date.parse("2026-11-05T10:00:00Z"), nivel: () => ({ d: 1 }), paseando: true
  };
  const c = manifiestoFichasTiempo(dp);
  const n = { id: "fichas-tiempo", parametros: {}, limpia: <F>(f: F) => { limpias.push(f as () => void); return f; }, on: () => { const q = quita("bus"); limpias.push(q); return q; }, emite: () => 0, api: () => null };
  const api = c.monta(n as never) as { abre(f?: string): boolean; cierra(): boolean; resumen(): unknown };
  const libera = () => { c.libera(api as never); limpias.splice(0).reverse().forEach(f => f()); };
  return { c, api, vivos, laminas, libera, m };
}

describe("fichas del tiempo: ciclo de vida", () => {
  it("el manifiesto es del exterior, con su bandera ?fichas= y su presupuesto de una lámina", () => {
    const { c } = monta();
    expect(c.id).toBe(ID_FICHAS_TIEMPO); expect(c.mundos).toEqual(["exterior"]); expect(c.bandera).toEqual({ defecto: true, url: "fichas" });
    expect(c.presupuesto).toEqual({ llamadas: 1, triangulos: 2, texturasMB: 3 }); expect(c.eventos).toEqual({ escucha: ["prevision:alterna"], emite: [] });
  });
  it("montar engancha la tecla P, la fila y la tapa del panel, TiempoVivo, el aviso del Bus y window.__fichaTiempo", () => {
    const { vivos, m } = monta();
    expect(vivos).toEqual({ teclas: 1, filas: 1, tapas: 1, tiempoVivo: 1, bus: 1 }); expect(typeof m.ventana.__fichaTiempo).toBe("function");
  });
  it("libera() cierra la lámina y suelta todo lo enganchado; window.__fichaTiempo desaparece", () => {
    const { api, vivos, laminas, libera, m } = monta();
    api.abre("pantalla"); expect(laminas.abiertas).toBe(1);
    libera();
    expect(laminas.cerradas).toBe(1); expect(vivos).toEqual({ teclas: 0, filas: 0, tapas: 0, tiempoVivo: 0, bus: 0 }); expect(m.ventana.__fichaTiempo).toBeUndefined();
  });
  it("diez montajes y liberaciones no dejan nada enganchado", () => {
    for (let i = 0; i < 10; i++) { const { vivos, libera, m } = monta(); libera(); expect(Object.values(vivos).every(v => v === 0)).toBe(true); expect(m.ventana.__fichaTiempo).toBeUndefined(); m.limpia(); }
    m = null;
  });
  it("lo puro: sin datos hay un respaldo rotulado «simulado» (no es el tiempo real) y nunca habla de tratamientos", () => {
    const mq = FichasTiempoPuro.maqueta(FichasTiempoPuro.respaldo(Date.parse("2026-11-05T10:00:00Z")), { ahora: Date.parse("2026-11-05T10:00:00Z") });
    expect(mq.origen).toBe("simulado"); expect(JSON.stringify(mq)).not.toMatch(/tratar|umbral|atomizador/i);
  });
});

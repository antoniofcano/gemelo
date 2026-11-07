// El medidor de fotogramas (A3-7a, MU5-n; antes 30_mide.js). Con dobles del DOM (prueba-dom.ts) y un Bus de mentira: es de todos los mundos; montado sin &mide no
// escucha el fotograma ni crea la caja; con &mide la crea y publica __mide; libera() saca la caja, quita __mide, la escucha de la pestaña y el fotograma, y suelta
// sus filas del panel de VR. La estadística (MideEst) la prueba mide.test.js; el montaje con el three de verdad, componentes_c10c.test.js.
// HONESTIDAD: en Node los ms no valen como fps (regla 7); en el Quest y en el iPhone, NO probado.
import { afterEach, describe, expect, it } from "vitest";
import { ID_MEDIDOR, MideEst, manifiestoMide } from "./mide.ts";
import { creaMundo, type Mundo } from "./prueba-dom.ts";

let m: Mundo | null = null;
afterEach(() => { if (m) m.limpia(); m = null; });
function monta(busqueda: string) {
  m = creaMundo({ busqueda });
  const visor = m.el("div", "visor"), oy: Record<string, number> = {}, filas: unknown[] = [], sueltas: Array<() => void> = [];
  m.documento.body.appendChild(visor);
  const d = manifiestoMide({ D: { base: "t/" }, DEPURA: false, Aparato: { agente: () => "x", capacidades: () => null }, Cola: { est: {}, tot: { n: 0, ms: 0 } }, Reparto: { on: false },
    ConfigPuro: { prefijoApi: () => null }, XrPerillas: { mv: null }, Render: { tono: {}, build: "pantalla" }, Materiales: {}, visor, renderer: { xr: {}, info: {} }, Estado: { modo: "gemelo" },
    Escena3D: {}, SueloFotos: {}, Generados: { lotes: () => 0 }, Arboles: {}, VRX: { on: false, soporta: false },
    PanelVR: { filas: (_p: string, f: unknown) => { filas.push(f); return () => filas.splice(filas.indexOf(f), 1); } }, Ajustes: null, location: m.ventana.location, localStorage: m.ventana.localStorage,
    navigator: {}, ventana: m.ventana, documento: m.documento });
  const n = { on: (ev: string) => { oy[ev] = (oy[ev] || 0) + 1; let ya = false; const q = () => { if (!ya) { ya = true; oy[ev]!--; } }; sueltas.push(q); return q; }, emite() { return 0; },
    limpia: (f: () => void) => { sueltas.push(f); return f; } };
  return { d, n, m, visor, oy, filas, sueltas };
}

describe("medidor de fotogramas", () => {
  it("lo puro sigue igual: la mediana y el p95", () => {
    const s = MideEst.serie([1, 2, 3, 4]); expect(s.mediana).toBe(2.5); expect(s.p95).toBe(4);
  });
  it("es de todos los mundos; sin &mide no escucha el fotograma ni crea la caja", () => {
    const { d, n, visor, oy } = monta("");
    expect(d.id).toBe(ID_MEDIDOR); expect(d.mundos).toBe("todos");
    d.monta(n as never); expect(oy["cuadro:fin"] || 0).toBe(0); expect(visor.children.length).toBe(0);
  });
  it("con &mide arma la medida y crea la caja; libera() la saca, quita __mide y suelta sus filas de VR", () => {
    const { d, n, m, visor, oy, filas, sueltas } = monta("?mide=5");
    d.monta(n as never); expect(oy["cuadro:fin"]).toBe(1); expect(visor.children.length).toBe(1); expect(typeof m.ventana.__mide).toBe("function"); expect(filas.length).toBe(3);
    d.libera({} as never); sueltas.splice(0).forEach(f => f());   // lo que hace Componentes al liberar: libera() y luego lo que se apuntó con n.on y n.limpia
    expect(visor.children.length).toBe(0); expect(m.ventana.__mide).toBe(undefined); expect(oy["cuadro:fin"]).toBe(0); expect(filas.length).toBe(0); expect(Object.values(m.documento._escuchas).flat().length).toBe(0);   // la de la pestaña (las de sus botones se van con la caja)
  });
});

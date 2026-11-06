// El menú de muñeca en VR (mundos/comun/muneca.ts; MU5-n, A3-6a: antes 31c_muneca.js, que no era un componente ni se soltaba nunca). Con el three de verdad (sin GPU)
// y un 29_vr de mentira (PanelVR, la lámina, los mandos y la pose de la cabeza). Se comprueba el ciclo de vida: de todo mundo; al girar la muñeca hacia la cara aparece
// una lámina; al salir de VR («vr:sale») se suelta (como antes); y el libera() del componente suelta la lámina, quita sus enganches de PanelVR y del Bus y los ganchos
// de las pruebas. El gesto, la rejilla y el resto los cubre pruebas/guardianes/vr_muneca.test.js. HONESTIDAD: nada se dibuja; no probado en unas Quest.
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { ID_MUNECA, MunecaPuro, creaMuneca, manifiestoMuneca } from "./muneca.ts";
import type { DepsMuneca } from "./muneca.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

function monta() {
  const porFot: ((dt: number) => void)[] = [], porGat: unknown[] = [], oyentes: Record<string, ((d?: unknown) => void)[]> = {}, emitidos: string[] = [], window: Record<string, unknown> = {};
  const vrRig = new THREE.Group(), sueltos = new Set<string>();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);   // el dorso de la izquierda (−X del grip) mirando a los ojos (+Z)
  const VRX = { on: true, sesionesN: 1, cab: { x: 0, z: 0 }, base: {}, frame: { getViewerPose: () => ({ transform: { position: { x: 0, y: 1.6, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }) } };
  const engancha = (l: unknown[]) => (fn: unknown) => { l.push(fn); return () => { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; };
  const deps: DepsMuneca = {
    THREE, location: { search: "" }, window, renderer: { xr: { getHand: () => ({ joints: {} }) } }, ComponentesPuro,
    VRX, vrRig, PanelVR: { alFotograma: engancha(porFot), alGatillo: engancha(porGat) },
    HudPersonalPuro: { hora: (t: string) => ({ texto: t, nombre: "Hora" }), haza: () => ({ visible: false }), hablar: () => ({ visible: false }), volver: () => ({ texto: "Volver" }) },
    Hazas: { estado: () => ({ activo: false }), enPunto: () => null }, Usables: { elige() {} }, Llegada: { ve() {} }, pp: { x: 0, y: 0 },
    vrMano: (lado: string) => (lado === "left" ? { src: {}, mano: "left", g: { visible: true, position: { x: 0, y: 1.6, z: -0.35 }, quaternion: q } } : { src: null }),
    vrRayoDe: () => null, vrBajoRayo: () => null, vrRect() {}, vrAj: (_k: string, d: unknown) => d, vrPintaFicha() {}, vrPulso() {}, horaMundoTexto: () => "07:06",
    creaLamina: (W: number, H: number, pw: number, ph: number) => {
      const tex = new THREE.Texture(), m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex }));
      for (const [k, o] of [["geometria", m.geometry], ["material", m.material], ["textura", tex]] as const) o.addEventListener("dispose", () => sueltos.add(k));
      return { m, tex, cv: { width: W, height: H }, cx: new Proxy({}, { get: () => () => ({ width: 10 }), set: () => true }) };
    }
  };
  const n = { emite: (ev: string) => { emitidos.push(ev); return 0; }, on: (ev: string, fn: (d?: unknown) => void) => { (oyentes[ev] = oyentes[ev] || []).push(fn); return () => { oyentes[ev] = (oyentes[ev] || []).filter(f => f !== fn); }; } };
  return { api: creaMuneca(deps, n), porFot, porGat, oyentes, emitidos, window, vrRig, sueltos };
}

describe("muneca-vr: de todo mundo y con libera() de verdad (A3-6a)", () => {
  it("el manifiesto vale y es de todo mundo, con su bandera para medir con y sin", () => {
    const def = manifiestoMuneca({} as DepsMuneca);
    expect(ComponentesPuro.valida(def)).toEqual([]); expect(ComponentesPuro.deTodos(def)).toBe(true);
    expect(def.bandera).toEqual({ defecto: true, url: "muneca" }); expect(def.id).toBe(ID_MUNECA);
    expect(MunecaPuro.manoMenu("zurda")).toBe("right");
  });

  it("aparece al mirar la muñeca, se suelta al salir de VR y el libera() del componente quita sus enganches y sus ganchos", () => {
    const r = monta();
    expect(r.porFot).toHaveLength(1); expect(r.porGat).toHaveLength(1); expect(Object.keys(r.oyentes).sort()).toEqual(["voz:estado", "vr:sale"]);
    for (let i = 0; i < 4; i++) (r.porFot[0] as (dt: number) => void)(0.1);   // 0,4 s mirándola (aparece a los 0,25)
    expect((r.window.__vrMuneca as () => { visible: boolean; creada: boolean })()).toMatchObject({ visible: true, creada: true });
    expect(r.vrRig.children).toHaveLength(1);
    (r.window.__vrMunecaPulsa as (id: string) => boolean)("hora"); expect(r.emitidos).toEqual(["prevision:alterna"]);
    (r.oyentes["vr:sale"] as ((d?: unknown) => void)[])[0]!();   // salir de VR: la lámina se suelta, como antes
    expect([...r.sueltos].sort()).toEqual(["geometria", "material", "textura"]); expect(r.vrRig.children).toHaveLength(0);
    r.api.libera();
    expect(r.porFot).toHaveLength(0); expect(r.porGat).toHaveLength(0);   // A3-6a: antes se quedaban enganchados para siempre
    expect(Object.values(r.oyentes).every(l => l.length === 0)).toBe(true);
    expect(r.window.__vrMuneca).toBeUndefined(); expect(r.window.__vrMunecaPulsa).toBeUndefined();
    r.api.libera();   // dos veces: no falla
  });
});

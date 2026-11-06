// aplicaAmbiente y aplicaCamara (MU2-7, MUNDOS §4) con dobles de la scene, la cámara, el renderizador y las fábricas de color y niebla.
// HONESTIDAD: prueba lo que el aplicador escribe en los dobles; que se vea igual en un navegador lo mira el banco, no esto.
import { describe, expect, it } from "vitest";
import { aplicaAmbiente, aplicaCamara } from "./ambiente.ts";
import type { Ambiente, EscenaAmbiente, LuzAmbiente } from "./ambiente.ts";

class Color { hex: number; constructor(h: number) { this.hex = h; } setHex(h: number) { this.hex = h; return this; } }
class Niebla { color: Color; near: number; far: number; constructor(h: number, c: number, l: number) { this.color = new Color(h); this.near = c; this.far = l; } }
interface Luz extends LuzAmbiente { nombre: string }

function escena() {
  const children: LuzAmbiente[] = [];
  const scene = {
    background: null as unknown, fog: null as unknown, children,
    // como Object3D.add de three: si ya colgaba de otra escena (las luces son las mismas en todas las pruebas), se descuelga de ella
    add(o: LuzAmbiente) { const p = o.parent as { remove?(x: LuzAmbiente): void } | null | undefined; if (p && p !== scene && p.remove) p.remove(o); if (children.indexOf(o) < 0) children.push(o); o.parent = scene; },
    remove(o: LuzAmbiente) { const i = children.indexOf(o); if (i >= 0) children.splice(i, 1); o.parent = null; },
  };
  let proyecciones = 0, colores = 0, nieblas = 0;
  const camara = { near: 0.1, far: 2000, updateProjectionMatrix() { proyecciones++; } };
  const renderer = { xr: { isPresenting: false } }, estado = { exag: 2.5 };
  const d: EscenaAmbiente = {
    scene, camara, renderer, estado,
    color: h => { colores++; return new Color(h); },
    niebla: (h, c, l) => { nieblas++; return new Niebla(h, c, l); },
  };
  return { d, scene, camara, renderer, estado, cuentas: () => ({ proyecciones, colores, nieblas }) };
}
const luz = (nombre: string): Luz => ({ nombre, parent: null });

const hemi = luz("hemi"), sol = luz("sol"), amb = luz("ambiental"), dir = luz("direccional");
const exterior = (exag = 2.5): Ambiente => ({
  cielo: "exterior", fondo: 0x9ec5e8, niebla: { color: 0x9ec5e8, cerca: 600, lejos: 4000 }, luces: [hemi, sol],
  camara: { near: 0.5, far: 5000, vr: { near: 0.1, far: 6000 } }, exag,
});
const vacio = (): Ambiente => ({ cielo: "ninguno", fondo: 0x8a8a8a, niebla: null, luces: [amb, dir], camara: { near: 0.05, far: 80 }, exag: 1 });

/** lo que se ve de la escena: fondo, niebla, luces colgadas, near/far y exag */
function foto(e: ReturnType<typeof escena>) {
  const bg = e.scene.background as Color | null, f = e.scene.fog as Niebla | null;
  return {
    fondo: bg ? bg.hex : null, niebla: f ? [f.color.hex, f.near, f.far] : null,
    luces: e.scene.children.map(l => (l as Luz).nombre), camara: [e.camara.near, e.camara.far], exag: e.estado.exag,
  };
}

describe("aplicaAmbiente", () => {
  it("deja el fondo, la niebla, las luces, el near/far y la exag que pide el Ambiente (el del exterior, como hacía 03_escena al montarse)", () => {
    const e = escena();
    aplicaAmbiente(exterior(), e.d);
    expect(foto(e)).toEqual({ fondo: 0x9ec5e8, niebla: [0x9ec5e8, 600, 4000], luces: ["hemi", "sol"], camara: [0.5, 5000], exag: 2.5 });
    expect(e.cuentas()).toEqual({ proyecciones: 1, colores: 1, nieblas: 1 });
  });

  it("es idempotente: aplicarlo otra vez no cuelga dos veces una luz, no crea ni color ni niebla y no recalcula la proyección", () => {
    const e = escena();
    aplicaAmbiente(exterior(), e.d);
    const fondo = e.scene.background, niebla = e.scene.fog, antes = foto(e);
    aplicaAmbiente(exterior(), e.d); aplicaAmbiente(exterior(), e.d);
    expect(foto(e)).toEqual(antes);
    expect(e.scene.background).toBe(fondo); expect(e.scene.fog).toBe(niebla);
    expect(e.cuentas()).toEqual({ proyecciones: 1, colores: 1, nieblas: 1 });
  });

  it("un interior: sin niebla, su fondo gris, sus luces en vez de las del exterior, su near/far y exag 1", () => {
    const e = escena();
    aplicaAmbiente(exterior(), e.d);
    aplicaAmbiente(vacio(), e.d);
    expect(foto(e)).toEqual({ fondo: 0x8a8a8a, niebla: null, luces: ["ambiental", "direccional"], camara: [0.05, 80], exag: 1 });
    expect(hemi.parent).toBeNull(); expect(sol.parent).toBeNull();
  });

  it("exterior → vacío → exterior deja la escena como estaba (mismos objetos de fondo y niebla, mismas luces y la exag del usuario)", () => {
    const e = escena();
    aplicaAmbiente(exterior(2.5), e.d);
    const antes = foto(e), fondo = e.scene.background, niebla = e.scene.fog;
    // 15_tiempo mueve la niebla y pone su propio color de fondo mientras el exterior está activo: al volver, el ambiente da otra vez el punto de partida
    (e.scene.fog as Niebla).near = 15; e.scene.background = new Color(0x070b18);
    aplicaAmbiente(vacio(), e.d);
    aplicaAmbiente(exterior(2.5), e.d);
    expect(foto(e)).toEqual(antes);
    expect(e.scene.background).toBe(fondo); expect(e.scene.fog).toBe(niebla);
    expect(amb.parent).toBeNull(); expect(dir.parent).toBeNull();
    expect(e.cuentas().colores).toBe(1); expect(e.cuentas().nieblas).toBe(1);
  });

  it("no descuelga lo que no colgó él, y un fondo null quita el fondo", () => {
    const e = escena(), otro = luz("del-rig");
    e.scene.add(otro);
    aplicaAmbiente(exterior(), e.d);
    aplicaAmbiente({ ...vacio(), fondo: null, luces: [] }, e.d);
    expect(foto(e).luces).toEqual(["del-rig"]);
    expect(e.scene.background).toBeNull();
  });

  it("en una sesión de VR usa el near/far de VR del mundo (el de pantalla si no trae otro)", () => {
    const e = escena();
    e.renderer.xr.isPresenting = true;
    aplicaAmbiente(exterior(), e.d);
    expect([e.camara.near, e.camara.far]).toEqual([0.1, 6000]);
    aplicaAmbiente(vacio(), e.d);
    expect([e.camara.near, e.camara.far]).toEqual([0.05, 80]);
  });

  it("sin estado ni renderizador: no toca la exag y aplica el near/far de pantalla", () => {
    const e = escena(), d: EscenaAmbiente = { ...e.d, estado: null, renderer: null };
    aplicaAmbiente(exterior(3), d);
    expect(e.estado.exag).toBe(2.5);
    expect([e.camara.near, e.camara.far]).toEqual([0.5, 5000]);
  });
});

describe("aplicaCamara", () => {
  it("pone el near/far de VR o de pantalla, recalcula la proyección solo si cambia y, sin Ambiente, no toca nada", () => {
    const e = escena();
    expect(aplicaCamara(exterior(), e.camara, true)).toBe(true);
    expect([e.camara.near, e.camara.far]).toEqual([0.1, 6000]);
    expect(aplicaCamara(exterior(), e.camara, true)).toBe(false);
    expect(aplicaCamara(exterior(), e.camara, false)).toBe(true);
    expect([e.camara.near, e.camara.far]).toEqual([0.5, 5000]);
    expect(e.cuentas().proyecciones).toBe(2);
    expect(aplicaCamara(null, e.camara, true)).toBe(false);
    expect([e.camara.near, e.camara.far]).toEqual([0.5, 5000]);
  });
});

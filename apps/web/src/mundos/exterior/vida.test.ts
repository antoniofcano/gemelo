// La vida del olivar: el quad y el dron (A3-5, MU5-n; antes 16_vida.js). Con el three de verdad (sin GPU) y un DOM, un tiempo y un mundo de mentira. Se comprueba: los mandos del paseo
// (la velocidad a pie y en quad, el espejo del estado hacia el legado), el dron (se saca solo paseando, se mueve con el suelo y el borde del mundo ACTIVO y sobrevuela las copas), las estelas,
// los avisos «paseo:entra» y «paseo:sale» y el ciclo de vida: libera() quita de la escena el grupo de la fauna, el quad, el dron, el anillo y las estelas, suelta geometrías, materiales y texturas
// (los dos resplandores; no la sombra compartida), quita las escuchas de los botones y no deja relojes, una sola vez (L2-05 y L2-11 de la auditoría de noviembre de 2026). HONESTIDAD: nada se
// dibuja aquí (regla 7); el quad y el dron son ILUSTRATIVOS (regla 5); el mando del dron en el Quest, no probado.
import { describe, expect, it } from "vitest";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { ID_VIDA, creaVida } from "./vida.ts";
import type { DepsVida, EstadoVida } from "./vida.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

/** un elemento del DOM de mentira: guarda sus escuchas y los atributos que se le ponen */
function elemento() {
  const oy: Record<string, ((e?: unknown) => void)[]> = {}, atrib: Record<string, string> = {}, quitadas: string[] = [];
  return {
    hidden: false, textContent: "", checked: true, oy, atrib, quitadas,
    addEventListener(ev: string, fn: (e?: unknown) => void) { (oy[ev] = oy[ev] || []).push(fn); },
    removeEventListener(ev: string, fn: (e?: unknown) => void) { oy[ev] = (oy[ev] || []).filter((f) => f !== fn); quitadas.push(ev); },
    setAttribute(k: string, v: string) { atrib[k] = v; }, setPointerCapture() {},
    dispara(ev: string, e?: unknown) { (oy[ev] || []).slice().forEach((f) => f(e)); }
  };
}
const IDS = ["btnQuad", "padQuad", "btnDron", "padDron", "padSube", "padBaja", "tDron", "ayudaPaseo", "cFauna"];

function monta(extra: { paseando?: boolean } = {}) {
  const scene = new THREE.Scene(), els: Record<string, ReturnType<typeof elemento>> = {};
  for (const id of IDS) els[id] = elemento();
  const S = { paseando: extra.paseando ?? true, primera: false, teclas: { run: false } as Record<string, boolean>, mundoSuelo: 3, borde: null as { x: number; y: number } | null };
  const persona = new THREE.Group(); persona.userData = { pi: new THREE.Object3D(), pd: new THREE.Object3D(), bi: new THREE.Object3D(), bd: new THREE.Object3D() };
  const espejos: EstadoVida[] = [], emitidos: string[] = [], conDron: boolean[] = [], inclina: number[] = [], llamadasMundo: string[] = [];
  const geoSombra = new THREE.PlaneGeometry(1, 1), matSombra = new THREE.MeshBasicMaterial(), texturas: unknown[] = [];
  const deps: DepsVida = {
    THREE, scene, camera: new THREE.PerspectiveCamera(), Estado: { exag: 1 }, Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), Bus: { emite: (ev: string) => { emitidos.push(ev); return 0; } }, $: (id: string) => els[id] as ReturnType<typeof elemento>,
    suelo: () => 2, copaAlta: () => 4, sueloMundo: (x: number, y: number) => { llamadasMundo.push("suelo:" + x + "," + y); return S.mundoSuelo; },
    obstaculo: (x: number, y: number, r: number) => { llamadasMundo.push("obstaculo:" + r); return S.borde; },
    geoSombra, matSombra, texBrillo: () => { const t = new THREE.CanvasTexture({}); texturas.push(t); return t; },
    nivelEn: () => ({ d: 1 }), cur: { ms: 0, dir: 0, viento: 0 }, ins: { d: 0 }, num1: (n: number, dec = 0) => n.toFixed(dec), rumbo: () => "N",
    paseando: () => S.paseando, teclas: () => S.teclas, persona: () => persona, primera: () => S.primera, ponPrimera: (v: boolean) => { S.primera = v; },
    pp: { x: 10, y: 20, ang: 0, paso: 0 }, camPos: new THREE.Vector3(), Llegada: { conDron: (on: boolean) => { conDron.push(on); }, porFotograma() {} },
    pendFactor: () => 1, quadInc: () => ({ pit: 0, rol: 0 }), inclinaQuad: (dt: number) => { inclina.push(dt); },
    espeja: (e: EstadoVida) => { espejos.push({ ...e }); }
  };
  const vida = creaVida(deps);
  return { vida, deps, scene, els, S, espejos, emitidos, conDron, inclina, llamadasMundo, geoSombra, matSombra, texturas, persona };
}
const recorre = (raiz: any, f: (o: any) => void) => { f(raiz); raiz.children.forEach((c: any) => recorre(c, f)); };   // eslint-disable-line @typescript-eslint/no-explicit-any

describe("vida del olivar: el montaje y los mandos del paseo", () => {
  it("monta el grupo de la fauna, el quad, el dron, el anillo y las dos estelas, todo oculto hasta que se use", () => {
    const { vida, scene } = monta();
    expect(scene.children).toContain(vida.gFauna); expect(scene.children).toContain(vida.quad); expect(scene.children).toContain(vida.dron); expect(scene.children).toContain(vida.anilloDron);
    expect(scene.children).toHaveLength(6);   // fauna, quad, dron, anillo y dos estelas (la sombra es un hijo del quad)
    expect(vida.quad.visible).toBe(false); expect(vida.dron.visible).toBe(false); expect(vida.anilloDron.visible).toBe(false);
  });
  it("a pie, la velocidad es la de andar (más al correr, menos hacia atrás) por la pendiente; en quad se acelera poco a poco y el estado se espeja al legado", () => {
    const { vida, S, espejos } = monta();
    expect(vida.velPaseo(1, 0.016)).toBeCloseTo(1.7, 9); S.teclas.run = true; expect(vida.velPaseo(1, 0.016)).toBeCloseTo(4.3, 9); expect(vida.velPaseo(-1, 0.016)).toBeCloseTo(-4.3 * 0.55, 9); S.teclas.run = false;
    vida.ponQuad(true); expect(vida.E.enQuad).toBe(true); expect(espejos.at(-1)!.enQuad).toBe(true);
    const v1 = vida.velPaseo(1, 0.1), v2 = vida.velPaseo(1, 0.1); expect(v1).toBeGreaterThan(0); expect(v2).toBeGreaterThan(v1); expect(v2).toBeLessThan(7.5);
    expect(espejos.at(-1)!.vq).toBe(v2); expect(vida.giroPaseo(v2)).toBeLessThan(2.2);
  });
  it("el quad solo se sube paseando; al bajar, el muñequito vuelve a la pose de pie", () => {
    const { vida, S, persona } = monta({ paseando: false });
    vida.ponQuad(true); expect(vida.E.enQuad).toBe(false);
    S.paseando = true; vida.ponQuad(true); expect(vida.E.enQuad).toBe(true); expect(vida.quad.visible).toBe(true);
    persona.userData.pi.rotation.x = 1.15; vida.ponQuad(false); expect(vida.E.enQuad).toBe(false); expect(persona.userData.pi.rotation.x).toBe(0);
  });
  it("el dron: se saca paseando, avisa a la llegada, y sacar el dron baja del quad (y al revés)", () => {
    const { vida, S, conDron, els } = monta();
    vida.ponQuad(true); vida.ponDron(true);
    expect(vida.E.enDron).toBe(true); expect(vida.E.enQuad).toBe(false); expect(vida.dron.visible).toBe(true); expect(conDron.at(-1)).toBe(true);
    expect(els["padSube"]!.hidden).toBe(false); expect(els["btnDron"]!.textContent).toBe("Guardar el dron"); expect(S.primera).toBe(false);
    vida.ponQuad(true); expect(vida.E.enDron).toBe(false); expect(vida.E.enQuad).toBe(true);
    vida.ponDron(false); S.paseando = false; vida.ponDron(true); expect(vida.E.enDron).toBe(false);
  });
  it("el dron se mueve con el suelo y el borde del mundo ACTIVO y sobrevuela las copas (no las atraviesa)", () => {
    const { vida, S, llamadasMundo } = monta();
    S.mundoSuelo = 10; vida.ponDron(true);
    expect(vida.dr.h).toBeCloseTo(13, 9);   // el suelo del mundo activo (10) + 3
    S.borde = { x: 99, y: 98 }; vida.dronMando(1, 0, 0.1);
    expect(vida.dr.x).toBe(99); expect(vida.dr.y).toBe(98); expect(llamadasMundo.some((l) => l === "obstaculo:0")).toBe(true);
    S.borde = null; vida.dr.h = 0; vida.dronMando(0, 0, 0.1); expect(vida.dr.h).toBeGreaterThanOrEqual(10 + 4 + 1);   // suelo + copa (4 · exag) + 1 m
  });
  it("cicloVista da las tres vistas del dron y, sin dron, alterna la primera persona", () => {
    const { vida, S } = monta();
    vida.cicloVista(); expect(S.primera).toBe(true); vida.cicloVista(); expect(S.primera).toBe(false);
    vida.ponDron(true); vida.cicloVista(); expect(S.primera).toBe(true); vida.cicloVista(); expect(S.primera).toBe(false); vida.cicloVista(); expect(S.primera).toBe(false);
  });
  it("actualizaVida suma el tiempo, lo espeja y deja la fauna a la vista según su casilla", () => {
    const { vida, els, espejos } = monta();
    vida.actualizaVida(0.5); vida.actualizaVida(0.25);
    expect(vida.E.tVida).toBeCloseTo(0.75, 9); expect(espejos.at(-1)!.tVida).toBeCloseTo(0.75, 9);
    expect(vida.gFauna.visible).toBe(true); els["cFauna"]!.checked = false; vida.actualizaVida(0.1); expect(vida.gFauna.visible).toBe(false);
  });
  it("vidaEntra y vidaSale avisan a la fauna y a los perros por el Bus, y enseñan y esconden los botones", () => {
    const { vida, emitidos, els } = monta();
    vida.vidaEntra(); expect(emitidos).toEqual(["paseo:entra"]); expect(els["btnQuad"]!.hidden).toBe(false);
    vida.vidaSale(); expect(emitidos).toEqual(["paseo:entra", "paseo:sale"]); expect(els["btnQuad"]!.hidden).toBe(true);
  });
  it("las estelas: una por vehículo, que se enciende al moverse y se apaga al reiniciar", () => {
    const { vida, S, inclina, deps } = monta();
    vida.ponQuad(true);
    for (let i = 0; i < 8; i++) { S.teclas.run = true; deps.pp.x += 1; const v = vida.velPaseo(1, 0.1); vida.actualizaVida(0.1); vida.vidaPaseo(0.1, 2, v); }
    expect(inclina.length).toBeGreaterThan(0);
    const estela = vida.quad.parent.children.find((o: any) => o.renderOrder === 6 && o.visible);   // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(estela).toBeTruthy(); expect(estela.geometry.drawRange.count).toBeGreaterThan(0);
  });
  it("los botones del paseo suben y bajan del quad y del dron, y los de subir y bajar mueven las teclas del dron", () => {
    const { vida, els, S } = monta();
    els["btnQuad"]!.dispara("click"); expect(vida.E.enQuad).toBe(true); els["padQuad"]!.dispara("click"); expect(vida.E.enQuad).toBe(false);
    els["btnDron"]!.dispara("click"); expect(vida.E.enDron).toBe(true);
    els["padSube"]!.dispara("pointerdown", { preventDefault() {}, pointerId: 1 }); expect(S.teclas["sube"]).toBe(true); els["padSube"]!.dispara("pointerup"); expect(S.teclas["sube"]).toBe(false);
    els["padBaja"]!.dispara("pointerdown", { preventDefault() {}, pointerId: 1 }); expect(S.teclas["baja"]).toBe(true); els["padBaja"]!.dispara("pointercancel"); expect(S.teclas["baja"]).toBe(false);
  });
});

describe("vida del olivar: el ciclo de vida", () => {
  it("libera() quita de la escena todo lo suyo, suelta geometrías, materiales y texturas (no la sombra compartida), quita las escuchas y esconde los botones, una sola vez", () => {
    const { vida, scene, els, geoSombra, matSombra, texturas } = monta();
    const geos = new Set<any>(), mats = new Set<any>(), compartidas: string[] = [];   // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const g of [vida.quad, vida.dron, vida.anilloDron]) recorre(g, (o) => { if (o.geometry && o.geometry !== geoSombra && !o.isSprite) geos.add(o.geometry); if (o.material && o.material !== matSombra) mats.add(o.material); });
    scene.children.filter((o: any) => o.renderOrder === 6).forEach((o: any) => { geos.add(o.geometry); mats.add(o.material); });   // eslint-disable-line @typescript-eslint/no-explicit-any
    geoSombra.addEventListener("dispose", () => compartidas.push("geo")); matSombra.addEventListener("dispose", () => compartidas.push("mat"));
    const vistos = { geo: new Set<unknown>(), mat: new Set<unknown>(), tex: new Set<unknown>() };
    geos.forEach((g) => g.addEventListener("dispose", () => vistos.geo.add(g))); mats.forEach((m) => m.addEventListener("dispose", () => vistos.mat.add(m))); texturas.forEach((t: any) => t.addEventListener("dispose", () => vistos.tex.add(t)));   // eslint-disable-line @typescript-eslint/no-explicit-any
    vida.libera(); vida.libera();
    expect(scene.children).toHaveLength(0);
    expect(vistos.geo.size).toBe(geos.size); expect(vistos.mat.size).toBe(mats.size); expect(vistos.tex.size).toBe(2); expect(texturas).toHaveLength(2);   // el resplandor del quad y el del dron
    expect(compartidas).toEqual([]);
    for (const id of ["btnQuad", "padQuad", "btnDron", "padDron"]) { expect(els[id]!.oy["click"] || []).toHaveLength(0); expect(els[id]!.hidden).toBe(true); }
    for (const id of ["padSube", "padBaja"]) for (const ev of ["pointerdown", "pointerup", "pointercancel"]) expect(els[id]!.oy[ev] || []).toHaveLength(0);
  });
  it("memoria: montar y liberar varias veces no deja ninguna geometría, material ni textura vivos", () => {
    const vivas = new Set<unknown>();
    for (let v = 0; v < 4; v++) {
      const { vida, scene, geoSombra, matSombra, texturas } = monta();
      const todo = new Set<any>();   // eslint-disable-line @typescript-eslint/no-explicit-any
      recorre(scene, (o) => { if (o.geometry && o.geometry !== geoSombra && !o.isSprite) todo.add(o.geometry); if (o.material && o.material !== matSombra) { todo.add(o.material); if (o.material.map) todo.add(o.material.map); } });
      texturas.forEach((t) => todo.add(t));
      todo.forEach((x) => { vivas.add(x); x.addEventListener("dispose", () => { vivas.delete(x); }); });
      vida.libera();
    }
    expect(vivas.size).toBe(0);
  });
  it("no deja relojes: ni setInterval ni setTimeout propios", () => {
    expect(/setInterval|setTimeout/.test(String(creaVida))).toBe(false);
  });
  it("el componente: del exterior, solo ciclo de vida, y su libera() es la del objeto", () => {
    const { vida, scene } = monta();
    expect(vida.componente.id).toBe(ID_VIDA); expect(vida.componente.mundos).toEqual(["exterior"]); expect(vida.componente.presupuesto).toEqual({ llamadas: 0, triangulos: 0 });
    expect(vida.componente.eventos).toEqual({ escucha: [], emite: ["paseo:entra", "paseo:sale"] });
    expect(vida.componente.monta({} as never)).toEqual({ libera: vida.libera }); vida.componente.libera(null); expect(scene.children).toHaveLength(0);
  });
});

// Los perros del paseo (A3-5, MU5-n; antes 25_perros.js). Con el three de verdad (sin GPU), un azar de semilla, un reloj doble y un DOM de mentira. Se comprueba: el montaje (un grupo
// colgado de la fauna), la llegada (salen del olivar y piden el reloj del primer ladrido), la amenaza a los conejos, y el ciclo de vida: libera() saca el grupo de la fauna, suelta
// geometrías, materiales y texturas (el pelaje y los dos rótulos; no la sombra compartida), para el reloj, quita la capa del minimapa, las escuchas y window.__perrosDebug, una sola
// vez. La equivalencia con el código anterior, fotograma a fotograma, la comprueban bucle_equivalencia2 y perros_instanciados. HONESTIDAD: nada se dibuja aquí (regla 7).
import { describe, expect, it } from "vitest";
import type { ContextoComponente } from "../../nucleo/componentes.ts";
import { ID_PERROS, angCorto, creaPerros, manifiestoPerros } from "./perros.ts";
import type { DepsPerros } from "./perros.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

function semilla(s: number): () => number { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** la fusión de geometrías de 02k (aquí, la mínima: posición y color por vértice, con UV si se pide) */
function fusiona(partes: [any, any][], conUv?: boolean) {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const g = new THREE.BufferGeometry(), pos: number[] = [], col: number[] = [], uv: number[] = [];
  for (const [geo, c] of partes) { const ni = geo.toNonIndexed(), p = ni.attributes.position, u = ni.attributes.uv; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); col.push(c.r, c.g, c.b); if (conUv) uv.push(u.getX(i), u.getY(i)); } }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); if (conUv) g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); return g;
}
const lienzo = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : () => {}), set: () => true }) });

function monta() {
  const E = { paseando: true, enQuad: false, enDron: false, tVida: 0 }, rnd = semilla(77);
  const scene = new THREE.Scene(), gFauna = new THREE.Group(); scene.add(gFauna);
  const oyentes: Record<string, ((d?: unknown) => void)[]> = {}, capas: unknown[] = [], emitidos: string[] = [], relojes = new Map<number, () => void>(); let idReloj = 0;
  const window: Record<string, unknown> = {}, geoSombra = new THREE.PlaneGeometry(1, 1), matSombra = new THREE.MeshBasicMaterial();
  const copas = Array.from({ length: 30 }, () => ({ x: (rnd() - 0.5) * 100, y: (rnd() - 0.5) * 100, oliv: true }));
  const deps: DepsPerros = {
    THREE, D: { ext: [-100, 100, 100, -100] }, copas, camera: new THREE.PerspectiveCamera(), texColor: (t: unknown) => t, hash: (i: number) => (Math.sin(i * 12.9898) * 43758.5453) % 1 * 0.5 + 0.5,
    geoSombra, matSombra, gFauna, paseando: () => E.paseando, pp: { x: 10, y: 10, ang: 0, paso: 0 }, tVida: () => E.tVida, enQuad: () => E.enQuad, enDron: () => E.enDron,
    altSuelo: (x: number, y: number) => 2 + 0.01 * x + Math.sin(y * 0.1), pendienteRumbo: () => [0.1, 0.05], sueloSeco: () => true,
    Minimapa: { capa: (fn) => { capas.push(fn); return () => { capas.pop(); }; } }, fusionaGeometrias: fusiona, document: { createElement: lienzo }, window, aleatorio: rnd,
    reloj: { setTimeout: (f: () => void) => { relojes.set(++idReloj, f); return idReloj; }, clearTimeout: (id: unknown) => { relojes.delete(id as number); } }
  };
  const n = { id: ID_PERROS, parametros: {}, limpia: <F>(f: F) => f, emite: (ev: string, d?: unknown) => { emitidos.push(ev); (oyentes[ev] || []).forEach((f) => f(d)); return 0; }, api: () => null,
    on: (ev: string, fn: (d?: unknown) => void) => { (oyentes[ev] = oyentes[ev] || []).push(fn); return () => { oyentes[ev] = (oyentes[ev] || []).filter((f) => f !== fn); }; } } as ContextoComponente;
  const emite = (ev: string, d?: unknown) => (oyentes[ev] || []).slice().forEach((f) => f(d));
  return { api: creaPerros(deps, n), deps, E, scene, gFauna, emite, capas, emitidos, relojes, window, geoSombra, matSombra, oyentes };
}
const recorre = (raiz: any, f: (o: any) => void) => { f(raiz); raiz.children.forEach((c: any) => recorre(c, f)); };   // eslint-disable-line @typescript-eslint/no-explicit-any

describe("perros: el componente", () => {
  it("angCorto da el camino más corto entre dos ángulos", () => {
    expect(angCorto(0, 1)).toBeCloseTo(1, 9); expect(angCorto(0, 6)).toBeCloseTo(6 - 6.2832, 9); expect(angCorto(6, 0)).toBeCloseTo(6.2832 - 6, 9);
  });
  it("monta un grupo colgado de la fauna, su capa del minimapa y su ayuda de depuración; nada se ve hasta que llegan", () => {
    const { gFauna, capas, window } = monta();
    expect(gFauna.children).toHaveLength(1); expect(capas).toHaveLength(1); expect(typeof window["__perrosDebug"]).toBe("function");
    let visibles = 0; recorre(gFauna, (o) => { if ((o.isMesh || o.isSprite) && o.visible) visibles++; }); expect(visibles).toBe(0);
  });
  it("al llegar, salen los dos y se pide el reloj del primer ladrido; con 30 fotogramas están a la vista", () => {
    const { api, emite, E, relojes, window } = monta(); emite("perros:llegan");
    expect(relojes.size).toBe(1);
    for (let i = 0; i < 30; i++) { E.tVida += 0.05; api.actualiza(0.05); }
    const dbg = (window["__perrosDebug"] as () => { vis: boolean; est: string }[])(); expect(dbg).toHaveLength(2); expect(dbg.every((p) => p.vis && p.est !== "fuera")).toBe(true);
  });
  it("la amenaza: un conejo pegado a quien pasea huye; lejos de todo, no", () => {
    const { emite } = monta();
    const q1 = { x: 11, y: 10, res: null as { x: number } | null }; emite("perros:amenaza", q1); expect(q1.res).toBeTruthy();
    const q2 = { x: 90, y: 90, res: null as unknown }; emite("perros:amenaza", q2); expect(q2.res).toBeNull();
  });
  it("sin pasear, todo fuera", () => {
    const { api, emite, E, gFauna } = monta(); emite("perros:llegan"); api.actualiza(0.05);
    E.paseando = false; api.actualiza(0.05);
    let visibles = 0; recorre(gFauna, (o) => { if ((o.isMesh || o.isSprite) && o.visible) visibles++; }); expect(visibles).toBe(0);
  });
  it("el manifiesto: ?perros, del exterior, fase mundo; su libera() acepta null", () => {
    const m = manifiestoPerros({} as DepsPerros);
    expect(m.id).toBe("perros-paseo"); expect(m.bandera).toEqual({ defecto: true, url: "perros" }); expect(m.mundos).toEqual(["exterior"]); expect(m.fases).toEqual({ mundo: 0 });
    expect(() => m.libera(null)).not.toThrow();
  });
});

describe("perros: el ciclo de vida", () => {
  it("libera() saca el grupo de la fauna, para el reloj, quita la capa, las escuchas y la ayuda de depuración, y suelta geometrías, materiales y texturas (no la sombra compartida), una sola vez", () => {
    const { api, emite, gFauna, capas, relojes, window, geoSombra, matSombra, oyentes } = monta(); emite("perros:llegan");
    expect(relojes.size).toBe(1);
    const geos = new Set<any>(), mats = new Set<any>(), texs = new Set<any>(), compartidas: string[] = [];   // eslint-disable-line @typescript-eslint/no-explicit-any
    recorre(gFauna, (o) => {
      if (o.geometry && o.geometry !== geoSombra && !o.isSprite) geos.add(o.geometry);   // el Sprite usa una geometría compartida de three, que no es nuestra
      if (o.material && o.material !== matSombra) { mats.add(o.material); if (o.material.map) texs.add(o.material.map); }
    });
    geoSombra.addEventListener("dispose", () => compartidas.push("geo")); matSombra.addEventListener("dispose", () => compartidas.push("mat"));
    // se cuentan los objetos distintos soltados (las cuatro piezas de un perro comparten material y geometrías de la sombra: dispose() más de una vez sobre el mismo es inocuo)
    const vistos = { geo: new Set<unknown>(), mat: new Set<unknown>(), tex: new Set<unknown>() };
    geos.forEach((g) => { g.addEventListener("dispose", () => { vistos.geo.add(g); }); }); mats.forEach((m) => m.addEventListener("dispose", () => { vistos.mat.add(m); })); texs.forEach((t) => t.addEventListener("dispose", () => { vistos.tex.add(t); }));
    api.libera(); api.libera();
    expect(gFauna.children).toHaveLength(0); expect(relojes.size).toBe(0); expect(capas).toHaveLength(0); expect(window["__perrosDebug"]).toBeUndefined();
    expect(vistos.geo.size).toBe(geos.size); expect(vistos.mat.size).toBe(mats.size); expect(vistos.tex.size).toBe(texs.size); expect(texs.size).toBeGreaterThanOrEqual(3);   // el pelaje (que comparte la dálmata) y los dos rótulos
    expect(compartidas).toEqual([]);
    for (const ev of ["perros:llegan", "perros:amenaza"]) expect((oyentes[ev] || []).length).toBe(0);
  });
  it("memoria: montar y liberar varias veces no deja ninguna geometría, material ni textura vivos, ni relojes", () => {
    const vivas = new Set<unknown>();
    for (let v = 0; v < 4; v++) {
      const { api, emite, gFauna, relojes, geoSombra, matSombra } = monta(); emite("perros:llegan");
      const todo = new Set<any>();   // eslint-disable-line @typescript-eslint/no-explicit-any
      recorre(gFauna, (o) => { if (o.geometry && o.geometry !== geoSombra && !o.isSprite) todo.add(o.geometry); if (o.material && o.material !== matSombra) { todo.add(o.material); if (o.material.map) todo.add(o.material.map); } });
      todo.forEach((x) => { vivas.add(x); x.addEventListener("dispose", () => { vivas.delete(x); }); });
      api.libera(); expect(relojes.size).toBe(0);
    }
    expect(vivas.size).toBe(0);
  });
  it("sin llegar nunca no hay reloj que parar, y liberar sin haber montado nada del todo no lanza", () => {
    const { api, relojes } = monta(); expect(relojes.size).toBe(0); expect(() => api.libera()).not.toThrow();
  });
});

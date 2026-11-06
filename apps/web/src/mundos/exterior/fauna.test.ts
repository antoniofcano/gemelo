// La fauna del olivar (A3-5, MU5-n; antes 16b_fauna.js). Con el three de verdad (sin GPU), un azar de semilla y un mundo de mentira. Se comprueba: el montaje (2 mallas de aves y 4 de
// conejos, instanciadas, colgadas del grupo de la fauna), que al empezar el paseo salen las aves posadas y los conejos, que los conejos responden a los perros y huyen, que de noche
// o con lluvia no vuelan las bandadas y el ciclo de vida: libera() saca las mallas del grupo, suelta sus geometrías y materiales (no la sombra compartida de 07_follaje) y la capa del
// minimapa, una sola vez; montar y liberar varias veces no deja ninguna geometría ni material propios vivos. La equivalencia con el código anterior, fotograma a fotograma, la comprueba
// pruebas/guardianes/fauna_equivalencia.test.js. HONESTIDAD: nada se dibuja aquí (regla 7); la fauna es ILUSTRATIVA (regla 5).
import { describe, expect, it } from "vitest";
import type { ContextoComponente } from "../../nucleo/componentes.ts";
import { creaMateriales } from "../../nucleo/materiales.ts";
import type { ThreeMin } from "../../nucleo/materiales.ts";
import { ID_FAUNA, creaFauna, manifiestoFauna } from "./fauna.ts";
import type { DepsFauna } from "./fauna.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

/** un azar con semilla (mulberry32) */
function semilla(s: number): () => number { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** la fusión de geometrías de 02k_fusiona (aquí, la mínima: una BufferGeometry con el color por vértice) */
function fusiona(partes: [any, any][]) {   // eslint-disable-line @typescript-eslint/no-explicit-any
  const g = new THREE.BufferGeometry(), pos: number[] = [], col: number[] = [];
  for (const [geo, c] of partes) { const p = geo.toNonIndexed().attributes.position; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); col.push(c.r, c.g, c.b); } }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); return g;
}

function monta(extra: Partial<{ paseando: boolean; dia: number; lluvia: number }> = {}) {
  const E = { paseando: true, enQuad: false, tVida: 0, dia: extra.dia ?? 1 }, rnd = semilla(7);
  const scene = new THREE.Scene(), gFauna = new THREE.Group(); scene.add(gFauna);
  E.paseando = extra.paseando ?? true;
  const copas = Array.from({ length: 60 }, (_, i) => ({ x: (rnd() - 0.5) * 120, y: (rnd() - 0.5) * 120, h: 4, oliv: i % 9 !== 0 }));
  const cIn = copas.filter((c) => c.oliv);
  const oyentes: Record<string, ((d?: unknown) => void)[]> = {}, quitadas: string[] = [], capas: unknown[] = [], emitidos: string[] = [];
  const geoSombra = new THREE.PlaneGeometry(1, 1), matSombra = new THREE.MeshBasicMaterial();
  const deps: DepsFauna = {
    THREE, Materiales: creaMateriales({ THREE: THREE as unknown as ThreeMin, busqueda: "" }), camera: new THREE.PerspectiveCamera(), D: { ext: [-200, 200, 200, -200] }, copas, cIn, geoSombra, matSombra, gFauna,
    paseando: () => E.paseando, pp: { x: 0, y: 0, ang: 0, paso: 0 }, cur: { ms: 0, viento: 1, dir: 0, lluvia: extra.lluvia ?? 0, hr: 40 }, nivelEn: () => ({ s: { alt: 0, az: 0 }, d: E.dia }),
    tVida: () => E.tVida, enQuad: () => E.enQuad, altSuelo: () => 2, mira: (g: any, hx: number, hz: number) => { g.rotation.y = Math.atan2(-hx, -hz); },   // eslint-disable-line @typescript-eslint/no-explicit-any
    Estado: { exag: 1 }, Minimapa: { capa: (fn) => { capas.push(fn); return () => { capas.pop(); quitadas.push("capa"); }; } }, fusionaGeometrias: fusiona, aleatorio: rnd
  };
  const n = { id: ID_FAUNA, parametros: {}, limpia: <F>(f: F) => f, emite: (ev: string, d?: unknown) => { emitidos.push(ev); (oyentes[ev] || []).forEach((f) => f(d)); return 0; }, api: () => null,
    on: (ev: string, fn: (d?: unknown) => void) => { (oyentes[ev] = oyentes[ev] || []).push(fn); return () => { quitadas.push(ev); oyentes[ev] = (oyentes[ev] || []).filter((f) => f !== fn); }; } } as ContextoComponente;
  const emite = (ev: string, d?: unknown) => (oyentes[ev] || []).slice().forEach((f) => f(d));
  return { api: creaFauna(deps, n), deps, E, scene, gFauna, emite, quitadas, capas, emitidos, geoSombra, matSombra, oyentes };
}
const instanciadas = (g: { children: any[] }) => g.children.filter((o) => o.isInstancedMesh);   // eslint-disable-line @typescript-eslint/no-explicit-any

describe("fauna: el componente", () => {
  it("monta 2 mallas de aves y 4 de conejos, instanciadas, colgadas del grupo de la fauna y sin dibujar nada hasta que haya algo", () => {
    const { gFauna } = monta();
    const ms = instanciadas(gFauna); expect(ms.map((m) => m.name).sort()).toEqual(["aves", "aves-alas", "conejos", "conejos-cabeza", "conejos-orejas", "conejos-sombra"]);
    expect(ms.every((m) => m.count === 0 && m.visible === false)).toBe(true);
  });
  it("de día y sin lluvia vuelan las dos bandadas; de noche, no", () => {
    const dia = monta({ paseando: false }); dia.api.actualiza(0.016);
    expect(dia.gFauna.children.find((m: any) => m.name === "aves").count).toBe(14);   // eslint-disable-line @typescript-eslint/no-explicit-any
    const noche = monta({ dia: 0, paseando: false }); noche.api.actualiza(0.016);
    expect(noche.gFauna.children.find((m: any) => m.name === "aves").count).toBe(0);   // eslint-disable-line @typescript-eslint/no-explicit-any
    const lluvia = monta({ lluvia: 3, paseando: false }); lluvia.api.actualiza(0.016);
    expect(lluvia.gFauna.children.find((m: any) => m.name === "aves").count).toBe(0);   // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  it("al entrar en el paseo nacen las aves posadas y los conejos; al salir, se van", () => {
    const { api, emite, gFauna } = monta(); emite("paseo:entra"); api.actualiza(0.016);
    expect(api.conejos().filter((c: any) => c.visible).length).toBeGreaterThan(0);   // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(gFauna.children.find((m: any) => m.name === "conejos").count).toBe(api.conejos().filter((c: any) => c.visible).length);   // eslint-disable-line @typescript-eslint/no-explicit-any
    emite("paseo:sale"); expect(api.conejos().every((c: any) => !c.visible)).toBe(true);   // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  it("los conejos responden a «fauna:conejo-cerca» con el más cercano y preguntan «perros:amenaza»", () => {
    const { api, emite, emitidos } = monta(); emite("paseo:entra"); api.actualiza(0.016);
    const c = api.conejos().find((x: any) => x.visible)!, q = { x: c.userData.x + 1, y: c.userData.y, radio: 50, res: null as unknown };   // eslint-disable-line @typescript-eslint/no-explicit-any
    emite("fauna:conejo-cerca", q); expect(q.res).toBe(c);
    expect(emitidos).toContain("perros:amenaza");
  });
  it("los tres materiales salen de la fábrica con su dueño: Lambert estándar, con los colores de siempre", () => {
    const { deps, gFauna } = monta();
    expect(deps.Materiales.duenos()["fauna-olivar"]).toBe(3);
    const mats = new Set(instanciadas(gFauna).map((m) => m.material)); mats.delete(undefined);
    const lamberts = [...mats].filter((m: any) => m.isMeshLambertMaterial);   // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(lamberts.length).toBeGreaterThanOrEqual(3);
    expect(instanciadas(gFauna).find((m) => m.name === "aves-alas")!.material.side).toBe(THREE.DoubleSide);
  });
  it("el manifiesto: ?fauna, del exterior, fase mundo; su libera() acepta null", () => {
    const m = manifiestoFauna({} as DepsFauna);
    expect(m.id).toBe("fauna-olivar"); expect(m.bandera).toEqual({ defecto: true, url: "fauna" }); expect(m.mundos).toEqual(["exterior"]); expect(m.fases).toEqual({ mundo: 0 });
    expect(() => m.libera(null)).not.toThrow();
  });
});

describe("fauna: el ciclo de vida", () => {
  it("libera() saca las mallas del grupo, suelta sus geometrías y materiales (no la sombra compartida) y la capa del minimapa, una sola vez", () => {
    const { api, gFauna, quitadas, capas, geoSombra, matSombra, oyentes, deps } = monta();
    const ms = instanciadas(gFauna), vistos: string[] = [];
    for (const m of ms) { m.addEventListener("dispose", () => vistos.push("malla")); }
    const compartidas: string[] = []; geoSombra.addEventListener("dispose", () => compartidas.push("geo")); matSombra.addEventListener("dispose", () => compartidas.push("mat"));
    expect(capas).toHaveLength(1);
    api.libera(); api.libera();
    expect(deps.Materiales.duenos()["fauna-olivar"]).toBeUndefined();   // la fábrica ya no guarda nada de este dueño
    expect(gFauna.children).toHaveLength(0); expect(vistos).toHaveLength(6); expect(compartidas).toEqual([]);
    expect(capas).toHaveLength(0); expect(quitadas.filter((x) => x === "capa")).toHaveLength(1);
    for (const ev of ["paseo:entra", "paseo:sale", "fauna:conejo-cerca"]) expect((oyentes[ev] || []).length).toBe(0);   // las tres escuchas, sueltas
  });
  it("memoria: montar y liberar varias veces no deja ninguna geometría ni material propios vivos", () => {
    let vivas = 0;
    for (let v = 0; v < 4; v++) {
      const { api, gFauna, matSombra } = monta();
      const geos = new Set(), mats = new Set();
      for (const m of instanciadas(gFauna)) { if (m.name !== "conejos-sombra") geos.add(m.geometry); if (m.material !== matSombra) mats.add(m.material); }
      for (const g of geos as Set<any>) { vivas++; g.addEventListener("dispose", () => { vivas--; }); }   // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const m of mats as Set<any>) { vivas++; m.addEventListener("dispose", () => { vivas--; }); }   // eslint-disable-line @typescript-eslint/no-explicit-any
      api.libera();
    }
    expect(vivas).toBe(0);
  });
  it("no deja relojes: ni setInterval ni setTimeout propios", () => {
    expect(/setInterval|setTimeout/.test(String(creaFauna))).toBe(false);
  });
});

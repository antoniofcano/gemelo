// El trabajo de hoy (A3-5, MU5-n; antes 54_trabajo_hoy.js). Con el three de verdad (sin GPU). Se comprueba: lo puro (lista blanca del payload, sitios, tractor de 72 triángulos),
// el componente (nada sin datos, un tractor en la haza correcta, se vuelve a posar al cambiar la exageración) y el ciclo de vida: libera() quita la malla, suelta geometría y
// material, retira la entidad y la escucha, y montar y liberar varias veces no deja nada vivo. HONESTIDAD: nada se dibuja aquí (regla 7).
import { describe, expect, it } from "vitest";
import { ID_TRABAJO_HOY, TrabajoHoyPuro, creaTrabajoHoy, manifiestoTrabajoHoy } from "./trabajo-hoy.ts";
import type { DepsTrabajoHoy } from "./trabajo-hoy.ts";
import type { ContextoComponente } from "../../nucleo/componentes.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);

const PARCELAS = [{ id: "sintetica-1", nombre: "Parcela sintética", centro: [-58, -43] }, { id: "sintetica-2", nombre: "Otra", centro: [40, 20] }];
const CON = { trabajo: { parcelas: ["sintetica-1"], cuando: "2026-11-05T10:00:00.000Z" } };

function monta() {
  const scene = new THREE.Scene(), quitadas: string[] = [], registradas: { tipo: string }[] = [], oyentes: Record<string, ((d?: unknown) => void)[]> = {}, quitaOyentes: string[] = [];
  const estado = { exag: 1 };
  const deps: DepsTrabajoHoy = {
    THREE, scene, Estado: estado, D: { parcelas: PARCELAS }, suelo: () => 10,
    Entidades: { registra: (d: { tipo: string }) => { registradas.push(d); return () => { quitadas.push(d.tipo); }; } }
  };
  const n = {
    id: ID_TRABAJO_HOY, parametros: {}, limpia: <F>(f: F) => f, emite: () => 0, api: () => null,
    on: (ev: string, fn: (d?: unknown) => void) => { (oyentes[ev] = oyentes[ev] || []).push(fn); return () => { quitaOyentes.push(ev); oyentes[ev] = (oyentes[ev] || []).filter((f) => f !== fn); }; }
  } as ContextoComponente;
  const emite = (d: unknown) => (oyentes["mundo:hoy"] || []).slice().forEach((f) => f(d));
  return { api: creaTrabajoHoy(deps, n), scene, estado, quitadas, registradas, emite, quitaOyentes, oyentes };
}

describe("trabajo de hoy: lo puro", () => {
  it("lee el payload por lista blanca: ids con la forma de OlivarTrack, sin repetidos y como mucho 16", () => {
    expect(TrabajoHoyPuro.lee(null)).toBeNull(); expect(TrabajoHoyPuro.lee({ trabajo: { parcelas: [] } })).toBeNull();
    const r = TrabajoHoyPuro.lee({ trabajo: { parcelas: ["a-1", "a-1", "<b>", 5, "con espacio", "Ñandú:2"], cuando: "2026-11-05T10:00:00Z" } });
    expect(r!.ids).toEqual(["a-1", "Ñandú:2"]);
    expect(TrabajoHoyPuro.lee({ trabajo: { parcelas: Array.from({ length: 40 }, (_, i) => "p" + i) } })!.ids).toHaveLength(16);
  });
  it("el tractor son 72 triángulos y el coste es de diseño (1 llamada)", () => {
    const g = TrabajoHoyPuro.geometria();
    expect(g.triangulos).toBe(72); expect(g.posicion.length).toBe(72 * 9);
    expect(TrabajoHoyPuro.coste(0)).toEqual({ llamadas: 0, triangulos: 0 }); expect(TrabajoHoyPuro.coste(3)).toEqual({ llamadas: 1, triangulos: 216 });
  });
  it("solo coloca las parcelas que el índice conoce (no inventa sitios)", () => {
    expect(TrabajoHoyPuro.sitios(["sintetica-1", "no-existe"], PARCELAS).map((s: { id: string }) => s.id)).toEqual(["sintetica-1"]);
  });
});

describe("trabajo de hoy: el componente", () => {
  it("sin datos no sale nada; con datos, un tractor en el centro de la haza; sin datos otra vez, nada", () => {
    const { api, scene, emite } = monta();
    expect(scene.children).toHaveLength(0);
    emite(null); emite({}); emite({ trabajo: { parcelas: ["no-existe"] } }); expect(scene.children).toHaveLength(0);
    emite(CON);
    const im = scene.children[0]; expect(im.isInstancedMesh).toBe(true); expect(im.count).toBe(1);
    const k = new THREE.Matrix4(); im.getMatrixAt(0, k); const p = new THREE.Vector3().setFromMatrixPosition(k);
    expect([p.x, p.y, p.z]).toEqual([-58, 10, 43]);
    expect(api.estado()).toEqual({ tractores: 1, llamadas: 1, triangulos: 72, ids: ["sintetica-1"] });
    emite({ trabajo: null }); expect(im.visible).toBe(false);
  });
  it("se vuelve a posar al cambiar la exageración (fase tarde)", () => {
    const { api, scene, estado, emite } = monta(); emite(CON);
    const y = () => { const k = new THREE.Matrix4(); scene.children[0].getMatrixAt(0, k); return new THREE.Vector3().setFromMatrixPosition(k).y; };
    expect(y()).toBe(10); estado.exag = 2; api.tarde(); expect(y()).toBe(20);
  });
  it("el manifiesto: apagado por defecto, ?trabajo, del exterior, y su libera() es el del api", () => {
    const m = manifiestoTrabajoHoy({} as DepsTrabajoHoy);
    expect(m.id).toBe("trabajo-hoy"); expect(m.bandera).toEqual({ defecto: false, url: "trabajo" }); expect(m.mundos).toEqual(["exterior"]);
    expect(m.presupuesto).toEqual({ llamadas: 1, triangulos: 1152 }); expect(m.eventos.escucha).toEqual(["mundo:hoy"]);
    expect(() => m.libera(null)).not.toThrow();
  });
});

describe("trabajo de hoy: el ciclo de vida", () => {
  it("libera() quita la malla, suelta geometría y material, retira la entidad y la escucha, y se puede llamar dos veces", () => {
    const { api, scene, quitadas, emite, quitaOyentes } = monta(); emite(CON);
    const im = scene.children[0], vistos: string[] = [];
    im.geometry.addEventListener("dispose", () => vistos.push("geometria")); im.material.addEventListener("dispose", () => vistos.push("material")); im.addEventListener("dispose", () => vistos.push("malla"));
    api.libera(); api.libera();
    expect(scene.children).toHaveLength(0); expect(vistos.sort()).toEqual(["geometria", "malla", "material"]); expect(quitadas).toEqual(["trabajo"]); expect(quitaOyentes).toEqual(["mundo:hoy"]);
    emite(CON); expect(scene.children).toHaveLength(0);
  });
  it("memoria: montar y liberar varias veces no deja ninguna geometría ni material vivos", () => {
    let vivas = 0;
    for (let v = 0; v < 4; v++) {
      const { api, scene, emite } = monta(); emite(CON);
      const im = scene.children[0]; vivas += 2;
      im.geometry.addEventListener("dispose", () => { vivas--; }); im.material.addEventListener("dispose", () => { vivas--; });
      api.libera();
    }
    expect(vivas).toBe(0);
  });
});

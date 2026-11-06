// Los olivos del tileset del exterior (A3-1b, MU5-n; antes 04c_olivos_tiles.js). Mallas instanciadas de mentira (lo que lee el módulo: count, instanceMatrix,
// instanceColor y los atributos de instancia de la geometría) y el crypto.subtle de Node. La resolución contra el tileset generado de verdad (huellas de
// tuberia/tiles3d/genera.mjs) sigue en pruebas/guardianes/escena3d.test.js, que ahora evalúa este mismo módulo. Aquí: la máscara, la identidad por huella, el
// apagado y, sobre todo, el CICLO DE VIDA: libera() quita de la escena cada malla de olivo, suelta su geometría y su material, olvida la máscara y las marcas y se
// desengancha de Escena3D; dos veces no rompe. HONESTIDAD: sin GPU; los glb en sí y sus ImageBitmap los libera 3DTilesRendererJS (no se prueba aquí).
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { IdTiles, creaOlivosTiles, manifiestoOlivosTiles } from "./olivos-tiles.ts";
import type { CopaTesela, GanchosTiles } from "./olivos-tiles.ts";

const subtle = globalThis.crypto.subtle;
const espera = async (cond: () => boolean, ms = 2000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error("tiempo agotado"); await new Promise((r) => setTimeout(r, 5)); } };

// ---- un mundo de 6 copas (4 olivos en el cuadrado [0, 100) y 1 fuera; la sexta no es olivo)
const COPAS: CopaTesela[] = [{ x: 10, y: 10, oliv: true }, { x: 20, y: 10, oliv: true }, { x: 30, y: 10, oliv: true }, { x: 40, y: 10, oliv: true }, { x: 500, y: 10, oliv: true }, { x: 50, y: 10, oliv: false }];
const CUADRO = [0, 0, 100];
const LISTA = [0, 1, 2, 3];

interface Atributo { array: Float32Array | Uint32Array | Int16Array; itemSize: number; isInstancedBufferAttribute: true; needsUpdate: boolean }
const at = (a: Float32Array | Uint32Array | Int16Array, s: number): Atributo => ({ array: a.slice() as Atributo["array"], itemSize: s, isInstancedBufferAttribute: true, needsUpdate: false });
/** una InstancedMesh de mentira con n = 4 instancias (las del cuadrado), con su geometría y su material que cuentan los dispose */
function mallaFalsa(ix = [0, 1, 2, 3], tipos = [0, 1, 0, 1]) {
  const n = ix.length, M = new Float32Array(16 * n); for (let i = 0; i < n; i++) M[i * 16 + 12] = i;
  const geo = {
    attributes: { position: { array: new Float32Array(9), itemSize: 3, count: 3 }, _INDICE_COPA: at(Float32Array.from(ix), 1), _TIPO: at(Int16Array.from(tipos), 1) },
    index: { count: 30 }, getAttribute(k: string) { return (this.attributes as Record<string, unknown>)[k]; }, liberadas: 0, dispose() { this.liberadas++; },
  };
  const mat = { liberados: 0, dispose() { this.liberados++; } };
  return { isInstancedMesh: true, count: n, visible: true, instanceMatrix: at(M, 16), instanceColor: null, geometry: geo, material: mat, fuera: false, liberada: 0,
    removeFromParent() { this.fuera = true; }, dispose() { this.liberada++; }, computeBoundingSphere() {} };
}
type Malla = ReturnType<typeof mallaFalsa>;

async function huellaDe(copasId: number[] | null): Promise<{ registro: string; tesela: string }> {
  const ids = IdTiles.ids(COPAS.length, copasId);
  return { registro: await IdTiles.huella(ids, subtle), tesela: await IdTiles.huella(IdTiles.de(ids, LISTA), subtle) };
}
function monta(o: { estado?: string; copasId?: number[] | null; subtle?: typeof subtle | null; gArboles?: { visible: boolean } } = {}) {
  const ganchos: Partial<GanchosTiles> = {}, engancha: Partial<GanchosTiles>[] = [], avisos: string[] = [];
  const gArboles = o.gArboles || { visible: true };
  const OT = creaOlivosTiles({
    D: { copas_id: o.copasId === undefined ? null : o.copasId }, copas: COPAS, gArboles, subtle: o.subtle === undefined ? subtle : o.subtle, consola: { warn: (s) => { avisos.push(String(s)); } },
    Escena3D: { resumen: () => ({ estado: o.estado || "cargando" }), engancha: (g) => { engancha.push(g); Object.assign(ganchos, g); } },
  });
  return { OT, ganchos, engancha, avisos, gArboles };
}
async function tesela(h: Awaited<ReturnType<typeof huellaDe>>, m: Malla, extras: Record<string, unknown> = {}) {
  const e = { cuadro: CUADRO, olivos: LISTA.length, huella: h.tesela, ...extras };
  const tile = { extras: { gemelo: e }, content: { uri: "t.glb" }, traversal: { visible: true } };
  return { tile, escena: { traverse: (fn: (o: unknown) => void) => fn(m) } };
}
const TILESET = (h: { registro: string }, extra: Record<string, unknown> = {}) => ({ extras: { gemelo: { contrato_tileset: 2, id_fuente: "indice", huella_registro: h.registro, tipos: { "-1": null, "0": "viejo", "1": "joven" }, catalogo_tipos: "fixture", ...extra } } });

describe("IdTiles (puro)", () => {
  it("las copas de una tesela: los olivos dentro del cuadrado, en el orden de copas[]", () => {
    expect([...IdTiles.copasDe(COPAS, CUADRO)]).toEqual(LISTA);
    expect([...IdTiles.copasDe(COPAS, [450, 0, 100])]).toEqual([4]);
  });
  it("la máscara aparta al final los olivos que dibuja el motor de cerca, sin perder ninguno, y sin nada marcado vuelve a lo del glb", () => {
    const m = mallaFalsa(), attrs = [{ array: m.instanceMatrix.array, size: 16 }, { array: (m.geometry.attributes._INDICE_COPA as Atributo).array, size: 1 }];
    const M = IdTiles.Mascara((m.geometry.attributes._INDICE_COPA as Atributo).array, LISTA, attrs);
    const marcas = new Uint8Array(COPAS.length); marcas[1] = 1; marcas[3] = 1;
    expect(M.reparte(marcas)).toBe(2); expect(M.apartadoG(1)).toBe(true); expect(M.apartadoG(0)).toBe(false); expect(M.apartadoG(99)).toBeNull();
    expect([...(m.geometry.attributes._INDICE_COPA as Atributo).array]).toEqual([0, 2, 1, 3]);
    expect(M.reparte(marcas)).toBe(-1);   // nada cambió
    marcas.fill(0); expect(M.reparte(marcas)).toBe(4); expect([...(m.geometry.attributes._INDICE_COPA as Atributo).array]).toEqual([0, 1, 2, 3]);
  });
});

describe("OlivosTiles: la resolución, los apagados y el ciclo de vida", () => {
  it("con el registro que casa: se queda con los olivos de cada glb, guarda _TIPO, aparta los de cerca y cuenta triángulos", async () => {
    const h = await huellaDe(null), { OT, ganchos } = monta(), m = mallaFalsa(), { tile, escena } = await tesela(h, m);
    ganchos.alRaiz!(TILESET(h)); await espera(() => OT.resumen().estado === "activo");
    expect(ganchos.alModelo!(escena, tile)).toBe(true); expect(m.visible).toBe(false);   // hasta comprobar su huella
    await espera(() => OT.resumen().hechas === 1);
    expect(OT.dibuja()).toBe(true); expect(OT.resumen()).toMatchObject({ instancias: 4, dibujadas: 4, apartadas: 0, porHuella: true, catalogo: "fixture" });
    expect(OT.tipo(1)).toEqual({ n: 1, nombre: "joven" }); expect(OT.tipo(0)).toEqual({ n: 0, nombre: "viejo" }); expect(OT.tipos()).toEqual({ catalogo: "fixture", nombres: { "-1": null, "0": "viejo", "1": "joven" } });
    ganchos.fotograma!(); expect(m.visible).toBe(true);
    OT.cerca([1, 3]); expect(m.count).toBe(2); expect(OT.resumen()).toMatchObject({ dibujadas: 2, apartadas: 2, cerca: 2 }); expect(OT.triangulos()).toBe(2 * 10);
    expect(OT.instanciasDe(1)).toEqual([{ uri: "t.glb", apartado: true, visible: true }]);
    OT.cerca([]); expect(m.count).toBe(4);
  });

  it("si el registro no casa con la huella del tileset: se apagan los olivos del tileset (los dibuja el motor) y 04b retira los de cada glb", async () => {
    const h = await huellaDe(null), { OT, ganchos, avisos } = monta(), m = mallaFalsa(), { tile, escena } = await tesela(h, m);
    ganchos.alRaiz!(TILESET({ registro: "sha256:otra" })); await espera(() => OT.resumen().estado === "sin");
    expect(OT.dibuja()).toBe(false); expect(avisos.some((a) => /huella del registro/.test(a))).toBe(true);
    expect(ganchos.alModelo!(escena, tile)).toBe(false);
  });

  it("sin crypto.subtle: avisa y resuelve solo por el índice; una tesela con otra huella se retira", async () => {
    const h = await huellaDe(null), { OT, ganchos, avisos } = monta({ subtle: null }), m = mallaFalsa(), { tile, escena } = await tesela(h, m);
    ganchos.alRaiz!(TILESET(h)); expect(OT.resumen()).toMatchObject({ estado: "activo", porHuella: false }); expect(avisos.some((a) => /sin crypto\.subtle/.test(a))).toBe(true);
    expect(ganchos.alModelo!(escena, tile)).toBe(true); await espera(() => OT.resumen().hechas === 1);
    const { OT: OT2, ganchos: g2 } = monta(), m2 = mallaFalsa(), t2 = await tesela(h, m2, { huella: "sha256:mala" });
    g2.alRaiz!(TILESET(h)); await espera(() => OT2.resumen().estado === "activo"); g2.alModelo!(t2.escena, t2.tile); await espera(() => m2.fuera);
    expect(OT2.resumen().teselas).toBe(0); expect(m2.geometry.liberadas).toBe(1);
  });

  it("sin escena (estado «sin») no se engancha", () => {
    const { OT, engancha } = monta({ estado: "sin" });
    expect(engancha).toEqual([]); expect(OT.dibuja()).toBe(false); expect(OT.resumen().estado).toBe("apagado");
  });

  it("libera(): quita de la escena cada malla, suelta su geometría y su material, olvida máscara y marcas y se desengancha; dos veces no rompe ni libera de más", async () => {
    const h = await huellaDe(null), { OT, ganchos, engancha } = monta(), mallas = [mallaFalsa(), mallaFalsa()], ts = await Promise.all(mallas.map((m) => tesela(h, m)));
    ganchos.alRaiz!(TILESET(h)); await espera(() => OT.resumen().estado === "activo");
    ts.forEach((t) => expect(ganchos.alModelo!(t.escena, t.tile)).toBe(true)); await espera(() => OT.resumen().hechas === 2);
    OT.cerca([0, 1]); expect(OT.resumen()).toMatchObject({ cerca: 2, teselas: 2, apartadas: 4 });
    OT.libera();
    mallas.forEach((m) => { expect(m.fuera).toBe(true); expect(m.geometry.liberadas).toBe(1); expect(m.material.liberados).toBe(1); expect(m.liberada).toBe(1); });
    expect(OT.resumen()).toMatchObject({ estado: "apagado", teselas: 0, instancias: 0, cerca: 0, motivo: "liberado" }); expect(OT.dibuja()).toBe(false); expect(OT.tipo(0)).toBeNull(); expect(OT.triangulos()).toBe(0);
    const ultimo = engancha[engancha.length - 1]!; expect(ultimo).toEqual({ alRaiz: null, alModelo: null, alSoltar: null, alApagar: null, fotograma: null });
    OT.libera(); mallas.forEach((m) => { expect(m.geometry.liberadas).toBe(1); expect(m.material.liberados).toBe(1); });
    // tras liberar, Escena3D ya no tiene gancho de modelo: 04b retira los olivos de las teselas que lleguen
    expect(ultimo.alModelo).toBeNull();
  });

  it("el manifiesto vale, es de los mundos [exterior], y su libera suelta de verdad (sin api no hace nada)", async () => {
    const h = await huellaDe(null), { OT, ganchos } = monta(), man = manifiestoOlivosTiles(OT), m = mallaFalsa(), t = await tesela(h, m);
    expect(ComponentesPuro.valida(man)).toEqual([]); expect(man.id).toBe("olivos-tiles"); expect(man.mundos).toEqual(["exterior"]);
    const api = man.monta({} as never); expect(api).toBe(OT);
    ganchos.alRaiz!(TILESET(h)); await espera(() => OT.resumen().estado === "activo"); ganchos.alModelo!(t.escena, t.tile);
    man.libera(api as never); expect(m.fuera).toBe(true); expect(m.geometry.liberadas).toBe(1); expect(() => man.libera(null)).not.toThrow();
  });
});

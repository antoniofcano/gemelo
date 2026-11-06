// La escena 3D Tiles del exterior (A3-1b, MU5-n; antes 04b_escena3d.js). Con un TilesRenderer de mentira (lo que usa el módulo: setCamera, registerPlugin, los eventos, update,
// dispose, el grupo y el caché) y, para el caché, con el LRUCache DE VERDAD de 3d-tiles-renderer (el tope de bytes se prueba con la clase real). El tileset generado de verdad,
// los perfiles de VR y el aviso en la página los comprueba pruebas/guardianes/escena3d.test.js (y, en Chrome, el banco). HONESTIDAD: no se dibuja nada; cuánto ocupa de verdad un
// tileset en la GPU y los MB del caché de móvil y gafas están SIN MEDIR (L2-04: los valores de LRU_MB son un [SUPUESTO] de partida).
import { describe, expect, it } from "vitest";
import { ComponentesPuro } from "../../nucleo/componentes.ts";
import { LruTilesPuro, RayosPuro, creaEscena3D, limitaAviso, manifiestoEscena3D, motivoMarco } from "./escena-tiles.ts";
import type { DepsEscena3D } from "./escena-tiles.ts";

// three y 3d-tiles-renderer no traen tipos en el repo: se cargan por variable (como materiales.test.ts) y se tocan sin tiparlos
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const THREE: any = await import(/* @vite-ignore */ "three" as string);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { LRUCache }: any = await import(/* @vite-ignore */ "3d-tiles-renderer/core" as string);

const MB = 1048576, nada = () => {};
const esperaMicrotareas = async (n = 10) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

/** un TilesRenderer de mentira que apunta lo que se le hace; su caché es el real */
class TilesFalso {
  static ultimo: TilesFalso | null = null;
  plugins: { name: string; dispose?: () => void }[] = []; parseQueue: { maxJobs?: number } = {}; group = new THREE.Group(); lruCache = new LRUCache(); errorTarget = 0; cameras: unknown[] = [];
  oyentes: Record<string, ((e: unknown) => void)[]> = {}; visibleTiles = new Set(); stats = { queued: 0, downloading: 0, parsing: 0 }; loadProgress = 1;
  dispuesto = 0; actualizado = 0;
  url: string;
  constructor(url: string) { this.url = url; this.lruCache.unloadPriorityCallback = (a: number, b: number) => a - b; TilesFalso.ultimo = this; }
  registerPlugin(p: { name: string; dispose?: () => void }) { this.plugins.push(p); }
  setCamera(c: unknown) { this.cameras.push(c); } setResolutionFromRenderer() {} setResolution() {} hasCamera(c: unknown) { return this.cameras.includes(c); } deleteCamera(c: unknown) { this.cameras = this.cameras.filter((x) => x !== c); }
  addEventListener(t: string, f: (e: unknown) => void) { (this.oyentes[t] = this.oyentes[t] || []).push(f); }
  emite(t: string, e: unknown) { (this.oyentes[t] || []).forEach((f) => f(e)); }
  update() { this.actualizado++; }
  dispose() { this.dispuesto++; this.plugins.forEach((p) => p.dispose?.()); }
}

function monta(o: { busqueda?: string; D?: Record<string, unknown>; clase?: string; sombreado?: unknown; documento?: unknown } = {}) {
  TilesFalso.ultimo = null;
  const errores: string[] = [], avisos: unknown[][] = [], hijos: unknown[] = [], scene = { add: (x: unknown) => { hijos.push(x); }, remove: (x: unknown) => { const i = hijos.indexOf(x); if (i >= 0) hijos.splice(i, 1); } };
  const consola = { warn: (...a: unknown[]) => { avisos.push(a); }, error: (...a: unknown[]) => { errores.push(String(a[0])); } };
  const S = { libera: 0, modelo: 0, suelta: 0, actualiza: 0 };
  const sombreado = o.sombreado === undefined ? { modelo: () => { S.modelo++; }, suelta: () => { S.suelta++; }, actualiza: () => { S.actualiza++; }, libera: () => { S.libera++; } } : o.sombreado;
  const sched = { sesion: "x" as unknown, setXRSession(s: unknown) { this.sesion = s; } };
  const deps: DepsEscena3D = {
    THREE, D: { tileset: "tiles/tileset.json", finca_id: "f", centro_utm: [100, 200], z0: 5, ...(o.D || {}) }, Aparato: { politica: () => ({ clase: o.clase || "escritorio" }) },
    CargaPuro: { parseTiles: () => 5, prioridadRed: () => "auto" }, TopeTilesPuro: { nuevo: () => ({ activo: false }), DEF: { MUESTRA: 0.25 }, paso: nada, error: (e: number) => e, linea: () => "" },
    TopeOlivos: { parteTiles: (n: number) => n, linea: () => "" }, XrPerillas: { errMaxTiles: () => 200, topeTiles: () => 0 }, Cola: { cobra: (_k: string, f: (e: unknown) => void) => f },
    Mundo: { tesela: () => ({}) }, suelo: () => 0, renderer: { xr: { isPresenting: false }, getSize: nada }, scene, camera: { updateMatrixWorld: nada }, Estado: { exag: 1 },
    SombreadoTiles: () => sombreado as ReturnType<DepsEscena3D["SombreadoTiles"]>, OlivosTiles: () => null, busqueda: o.busqueda || "", documento: o.documento ?? null, consola,
    cargaTiles: () => Promise.resolve({ TilesRenderer: TilesFalso, Scheduler: sched }),
  };
  const E = creaEscena3D(deps);
  return { E, deps, errores, avisos, hijos, scene, S, sched, consola };
}
const RAIZ = { tileset: { root: { transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, extras: { gemelo: { finca_id: "f", centro_utm: [100, 200], z0: 5 } } } };

describe("la escena: sin tileset, de otro host o con otro marco, se queda sin escena y lo dice", () => {
  it("sin tileset: estado «sin», UN console.error y el aviso de la página; listo() es true", () => {
    const aviso = { hidden: true }, tx = { textContent: "" }, doc = { getElementById: (id: string) => (id === "sinEscena" ? aviso : id === "sinEscenaMotivo" ? tx : null) };
    const { E, errores } = monta({ D: { tileset: undefined }, documento: doc });
    expect(E.estado()).toBe("sin"); expect(errores).toHaveLength(1); expect(errores[0]).toMatch(/^escena 3D Tiles: falta el tileset/);
    expect(aviso.hidden).toBe(false); expect(tx.textContent).toBe("falta el tileset"); expect(E.listo()).toBe(true);
  });
  it("un tileset de otro host (?tileset= o el índice) no se pide", () => {
    for (const o of [{ busqueda: "?tileset=https://otro.example/t.json" }, { busqueda: "?tileset=//otro/t.json" }, { D: { tileset: "data:text/plain,x" } }]) {
      const { E, errores } = monta(o); expect(E.estado()).toBe("sin"); expect(errores[0]).toMatch(/fuera del mismo origen/); expect(TilesFalso.ultimo).toBeNull();
    }
  });
  it("un tileset de otra exportación (otro centro_utm) o de otra finca falla al leer la raíz, y sale la tesela del grupo", async () => {
    for (const [G, motivo] of [[{ finca_id: "f", centro_utm: [110, 200], z0: 5 }, /otra exportación/], [{ finca_id: "otra", centro_utm: [100, 200], z0: 5 }, /otra con datos de f|de otra/]] as const) {
      const { E, errores, hijos } = monta(); await esperaMicrotareas();
      TilesFalso.ultimo!.emite("load-root-tileset", { tileset: { root: RAIZ.tileset.root, extras: { gemelo: G } } });
      expect(E.estado()).toBe("sin"); expect(errores[0]).toMatch(motivo); expect(hijos).toHaveLength(0);
    }
  });
});

describe("la escena activa y su ciclo de vida", () => {
  it("con el tileset: crea el TilesRenderer, registra el complemento de red, se activa con la raíz y avisa a 04c", async () => {
    const { E, hijos } = monta(); expect(E.estado()).toBe("cargando"); expect(E.listo()).toBe(false);
    await esperaMicrotareas(); const t = TilesFalso.ultimo!;
    expect(t.url).toBe("tiles/tileset.json"); expect(t.errorTarget).toBe(16); expect(t.parseQueue.maxJobs).toBe(5); expect(t.plugins.map((p) => p.name)).toEqual(["GEMELO_PRIORIDAD_RED"]); expect(hijos).toEqual([t.group]);
    const alRaiz: unknown[] = []; E.engancha({ alRaiz: (ts: unknown) => { alRaiz.push(ts); } });
    t.emite("load-root-tileset", RAIZ); expect(E.estado()).toBe("activo"); expect(alRaiz).toHaveLength(1); expect(E.listo()).toBe(true);
    E.actualiza(); expect(t.actualizado).toBe(1);
  });

  it("libera(): dispose del TilesRenderer, su grupo fuera de la escena, el sombreado de 04d, el filtro del aviso y el Scheduler; estado «apagado»; dos veces no rompe ni libera de más", async () => {
    const { E, hijos, S, sched, consola } = monta(), warnPuesto = consola.warn; await esperaMicrotareas(); const t = TilesFalso.ultimo!;
    const apagados: string[] = []; E.engancha({ alApagar: (m: string) => { apagados.push(m); } });
    t.emite("load-root-tileset", RAIZ); expect(consola.warn).not.toBe(warnPuesto);   // el filtro del aviso de escala está puesto
    E.libera();
    expect(t.dispuesto).toBe(1); expect(hijos).toHaveLength(0); expect(S.libera).toBe(1); expect(apagados).toEqual(["liberada"]); expect(sched.sesion).toBeNull();
    expect(consola.warn).toBe(warnPuesto);   // restaurado
    expect(E.estado()).toBe("apagado"); expect(E.grupo()).toBeFalsy(); expect(E.listo()).toBe(true); expect(E.resumen().cache).toBeNull();
    E.actualiza(); expect(t.actualizado).toBe(0);   // sin tiles no hace nada
    E.libera(); expect(t.dispuesto).toBe(1); expect(S.libera).toBe(1);
  });

  it("libera() con la librería aún cargándose: la carga que llegue después se tira (no crea ningún TilesRenderer)", async () => {
    const { E, hijos } = monta(); expect(E.estado()).toBe("cargando");
    E.libera(); expect(E.estado()).toBe("apagado");
    await esperaMicrotareas(); expect(TilesFalso.ultimo).toBeNull(); expect(hijos).toHaveLength(0);
  });

  it("falla a mitad (la raíz no casa): libera lo que había, una sola vez", async () => {
    const { E, S, hijos } = monta(); await esperaMicrotareas(); const t = TilesFalso.ultimo!;
    t.emite("load-root-tileset", { tileset: { root: { transform: [1] }, extras: { gemelo: { finca_id: "otra" } } } });
    expect(E.estado()).toBe("sin"); expect(t.dispuesto).toBe(1); expect(S.libera).toBe(1); expect(hijos).toHaveLength(0);
    E.libera(); expect(t.dispuesto).toBe(1);   // ya no hay tiles que liberar
  });

  it("el manifiesto vale, es de los mundos [exterior] y su libera suelta de verdad", async () => {
    const { E, hijos } = monta(), man = manifiestoEscena3D(E); await esperaMicrotareas();
    expect(ComponentesPuro.valida(man)).toEqual([]); expect(man.id).toBe("escena-tiles"); expect(man.mundos).toEqual(["exterior"]);
    const api = man.monta({} as never); expect(api).toBe(E);
    man.libera(api as never); expect(TilesFalso.ultimo!.dispuesto).toBe(1); expect(hijos).toHaveLength(0); expect(() => man.libera(null)).not.toThrow();
  });
});

describe("L2-04: el caché LRU del tileset, ajustado al presupuesto del aparato y del perfil", () => {
  it("los MB por clase: escritorio lo de la librería; móvil y gafas, menos; el perfil de VR los baja hasta la mitad; ?tilesCacheMB= manda", () => {
    const L = LruTilesPuro.limites;
    expect(L("escritorio")).toEqual({ minBytesSize: 322 * MB, maxBytesSize: 430 * MB });
    expect(L("movil").maxBytesSize).toBe(215 * MB); expect(L("quest").maxBytesSize).toBe(172 * MB); expect(L("quest").minBytesSize).toBe(128 * MB);
    expect(L("quest", 380000)).toEqual(L("quest")); expect(L("quest", 190000)).toEqual({ minBytesSize: 64 * MB, maxBytesSize: 86 * MB }); expect(L("quest", 130000).maxBytesSize).toBe(86 * MB);   // el suelo: la mitad
    expect(L("quest", 1e6)).toEqual(L("quest"));   // por encima del perfil más alto, no sube
    expect(L("otra-cosa")).toEqual(L("escritorio"));
    expect(L("quest", 190000, "?tilesCacheMB=50,100")).toEqual({ minBytesSize: 50 * MB, maxBytesSize: 100 * MB });
    for (const mal of ["?tilesCacheMB=100,50", "?tilesCacheMB=0,10", "?tilesCacheMB=5000,6000", "?tilesCacheMB=abc", "?tilesCacheMB=10"]) expect(LruTilesPuro.lruUrl(mal), mal).toBeNull();
    expect(Object.values(LruTilesPuro.LRU_MB).every(([a, b]) => a < b)).toBe(true);
    expect(LruTilesPuro.LRU_MB["quest"]![1]).toBeLessThan(350);   // por debajo del presupuesto de toda la página (pruebas/presupuesto.json)
  });

  it("el TilesRenderer lleva un caché PROPIO (no el compartido de la librería) con los bytes de su clase y la misma prioridad de descarga", async () => {
    for (const clase of ["escritorio", "movil", "quest"]) {
      const { E } = monta({ clase }); await esperaMicrotareas(); const t = TilesFalso.ultimo!, lim = LruTilesPuro.limites(clase);
      expect(t.lruCache.maxBytesSize).toBe(lim.maxBytesSize); expect(t.lruCache.minBytesSize).toBe(lim.minBytesSize);
      expect(typeof t.lruCache.unloadPriorityCallback).toBe("function");   // sin él, queuedTiles.sort(null) lanza
      E.libera();
    }
    const { E } = monta({ clase: "quest", busqueda: "?tilesCacheMB=40,80" }); await esperaMicrotareas();
    expect(TilesFalso.ultimo!.lruCache.maxBytesSize).toBe(80 * MB); E.libera();
  });

  it("perfil(p) en VR: el caché sigue el `tri` del perfil, y al salir vuelve a los de la clase; resumen().cache dice el límite", async () => {
    const { E } = monta({ clase: "quest" }); await esperaMicrotareas(); const t = TilesFalso.ultimo!;
    E.perfil({ e: 16, tri: 380000 }); expect(t.lruCache.maxBytesSize).toBe(172 * MB);
    E.perfil({ e: 48, tri: 190000 }); expect(t.lruCache.maxBytesSize).toBe(86 * MB); expect(E.resumen().cache).toMatchObject({ bytes: 0, items: 0, maxBytes: 86 * MB, minBytes: 64 * MB });
    E.perfil(null); expect(t.lruCache.maxBytesSize).toBe(172 * MB); expect(t.errorTarget).toBe(16);
  });

  it("PRUEBA DE BYTES con el LRUCache de verdad: el caché se llena al tope, la poda baja de él y lo que se usa no se suelta", () => {
    const lim = LruTilesPuro.limites("quest", 190000), lru = new LRUCache(); LruTilesPuro.aplica(lru, lim); lru.unloadPercent = 1;
    const cada = 8 * MB, soltadas: number[] = [], items = Array.from({ length: 40 }, (_, i) => i);   // 40 teselas de 8 MB = 320 MB; el tope es de 86 MB
    for (const i of items) expect(lru.add(i, (x: number) => { soltadas.push(x); })).toBe(true);   // la librería solo pide teselas mientras no isFull()
    for (const i of items) { lru.setMemoryUsage(i, cada); lru.setLoaded(i, true); }
    expect(lru.cachedBytes).toBe(320 * MB); expect(lru.isFull()).toBe(true);
    // las 3 últimas se siguen usando (se ven); el resto, no
    lru.markAllUnused(); [37, 38, 39].forEach((i) => lru.markUsed(i));
    lru.unloadUnusedContent();
    expect(lru.cachedBytes).toBeLessThanOrEqual(lim.maxBytesSize); expect(lru.cachedBytes).toBeGreaterThanOrEqual(3 * cada);
    expect(soltadas.length).toBeGreaterThan(25); expect(soltadas).not.toContain(37); expect(soltadas).not.toContain(38); expect(soltadas).not.toContain(39);
    expect(lru.isFull()).toBe(false);   // ya se pueden pedir más teselas
    // con el caché de la librería por defecto (430 MB) las mismas 40 teselas (320 MB) NO se habrían soltado nunca: la auditoría L2-04
    const porDefecto = new LRUCache(); porDefecto.unloadPercent = 1; let n = 0;
    for (const i of items) porDefecto.add(i, () => { n++; });
    for (const i of items) { porDefecto.setMemoryUsage(i, cada); porDefecto.setLoaded(i, true); }
    expect(porDefecto.isFull()).toBe(false); expect(porDefecto.cachedBytes).toBeLessThan(porDefecto.maxBytesSize); expect(n).toBe(0);   // bajo su tope de ~430 MB, ni empieza a podar
  });
});

describe("lo puro que salió de 04b", () => {
  it("limitaAviso: deja pasar UNA vez el aviso de la escala no uniforme y todo lo demás; restaura() devuelve el original", () => {
    const dichos: unknown[][] = [], consola = { warn: (...a: unknown[]) => { dichos.push(a); } }, original = consola.warn, AVISO = "x: Non uniform scale used for tile which may cause issues";
    const f = limitaAviso(consola, "Non uniform scale used for tile");
    for (let i = 0; i < 100; i++) consola.warn(AVISO);
    expect(dichos).toHaveLength(1); consola.warn("otro", 42); expect(dichos).toHaveLength(2); expect(dichos[1]).toEqual(["otro", 42]);
    f.restaura(); expect(consola.warn).toBe(original); consola.warn(AVISO); expect(dichos).toHaveLength(3);
  });
  it("motivoMarco: el tileset de otro centro_utm o z0 no se usa (L4-01)", () => {
    const DD = { centro_utm: [256128, 4096128], z0: 480.5 };
    expect(motivoMarco({ centro_utm: [256128.001, 4096127.999], z0: 480.501 }, DD)).toBeNull();
    expect(motivoMarco({ centro_utm: [256138, 4096128], z0: 480.5 }, DD)).toMatch(/otra exportación/); expect(motivoMarco({ centro_utm: [256128, 4096128] }, DD)).toMatch(/no trae/); expect(motivoMarco(undefined, DD)).toMatch(/no trae/);
  });
  it("RayosPuro: opt-in sin efecto sobre mallas pequeñas ni InstancedMesh; quita() deja la geometría como estaba", () => {
    const lib = { MeshBVH: class { g: unknown; constructor(g: unknown) { this.g = g; } }, acceleratedRaycast: () => {} };
    const grande = { isMesh: true, geometry: { attributes: { position: { count: 3 * 3000 } }, index: null, boundsTree: null }, userData: {} as Record<string, unknown>, raycast: undefined as unknown };
    const chica = { isMesh: true, geometry: { attributes: { position: { count: 30 } }, index: null, boundsTree: null }, userData: {} }, inst = { isInstancedMesh: true, userData: {} as Record<string, unknown>, raycast: undefined as unknown };
    const raiz = { traverse: (f: (o: unknown) => void) => { [grande, chica, inst].forEach(f); } };
    expect(RayosPuro.pon(raiz, lib)).toEqual({ mallas: 1, triangulos: 3000 }); expect(RayosPuro.cuenta(raiz)).toBe(1); expect(RayosPuro.pon(raiz, lib).mallas).toBe(0);   // idempotente
    expect(grande.raycast).toBe(lib.acceleratedRaycast); expect(typeof inst.raycast).toBe("function");
    expect(RayosPuro.quita(raiz)).toBe(1); expect(RayosPuro.cuenta(raiz)).toBe(0); expect(grande.userData["bvhRaycast"]).toBeUndefined();
  });
});

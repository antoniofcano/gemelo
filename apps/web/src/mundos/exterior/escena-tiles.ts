// La escena en 3D Tiles 1.1 (ADR-0015, aceptado; formato en doc/sistema/TILES3D.md): la ÚNICA escena (T8 fase 2, decisión 79). MU5-n (A3-1b): antes apps/web/motor/04b_escena3d.js,
// que queda como talón. Aquí: RayosPuro (el BVH de los rayos), limitaAviso, motivoMarco y LruTilesPuro (puros); creaEscena3D (el módulo con su estado) y el manifiesto del
// componente «escena-tiles» de los mundos ["exterior"], con un libera() que suelta de verdad el TilesRenderer y lo que cuelga de él.
// El relieve con su ortofoto lo dibuja 3DTilesRendererJS (versión fijada en apps/web/package.json) desde un tileset.json de tuberia/tiles3d/, con el sombreado
// de 04d_sombreado_tiles.js. Sin tileset (ni D.tileset en el índice ni ?tileset=) o si falla (la librería, otro origen, la raíz), no hay otra
// escena a la que volver: estado "sin", un console.error y el aviso #sinEscena de la página («Esta finca no tiene escena: <motivo>»); el Mundo
// se carga igual, así que el panel, las fichas, la nube y los olivos siguen funcionando.
// La física y las consultas en CPU (alturas, copa y color de la tierra para el paseo, la VR, las balizas y las huellas) siguen con el json de
// siempre (decisión 38: doble descarga aceptada); los puntos LiDAR (decisión 37) y las construcciones (decisión 36) no cambian. Los olivos
// del glb los gestiona 04c_olivos_tiles.js por los ganchos de engancha() (alRaiz, alModelo, alSoltar, alApagar, fotograma); sin él, o si los rechaza, se quitan.
// Tileset: ?tileset=<ruta relativa> (pruebas), si no D.tileset (el índice); nunca otro host (§5 de CLAUDE.md: solo el mismo origen).
// Marco: la raíz lleva LOCAL → ECEF; el grupo lo deshace y pasa de z arriba a y arriba, como la página de prueba de tuberia/tiles3d/, y
// aplica la exageración vertical en la misma matriz.
// Del legado recibe por argumento lo que necesita (THREE, D, Aparato, CargaPuro, TopeTilesPuro, TopeOlivos, XrPerillas, la Cola, renderer, scene, camera, Estado, Mundo, la URL, el DOM
// y los import() de 3d-tiles-renderer y de three-mesh-bvh); no lee globales. Lo que viene detrás en el montaje (04d, 04c, 09_camara) entra por funciones que se piden en cada uso.
import type { Manifiesto } from "../../nucleo/componentes.ts";

// three y 3DTilesRendererJS no traen tipos en el repo (como en ambiente.ts y presupuesto.ts): de ellos solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

// ---------------------------------------------------------------- lo puro
// AG-1.6: BVH (three-mesh-bvh, versión fijada en apps/web/package.json) para los rayos CONTRA MALLAS del relieve de las teselas. Solo los gasta relieveEn/sondea
// (pruebas y depuración): el toque, el rayo de los mandos y el teletransporte no lanzan rayo contra mallas (los olivos, las balizas y las personas se eligen
// en analítico; el suelo, con Mundo.suelo). Por eso es opt-in (?bvh): sin él, ni se descarga la librería ni se construye nada. `lib` se inyecta ({ MeshBVH,
// acceleratedRaycast }) para poder probarlo en Node. indirect: true deja intacta la geometría (no reordena su índice) y no toca lo que ve la GPU.
const MIN_TRIANGULOS = 2000;   // por debajo, el recorrido lineal de three ya es barato y el árbol no compensa
function nada(): void {}
function triangulos(g: T3): number { const i = g.index; return i ? i.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0); }
function candidata(m: T3, min?: number | null): boolean {
  return !!(m && m.isMesh && !m.isInstancedMesh && !m.isSkinnedMesh && !m.isBatchedMesh && m.geometry && m.geometry.attributes && m.geometry.attributes.position &&
    !m.geometry.boundsTree && triangulos(m.geometry) >= (min == null ? MIN_TRIANGULOS : min));
}
/** pone el BVH a las mallas grandes de `raiz` (una tesela) y apaga el raycast de sus InstancedMesh (los olivos del glb: el relieve ya los filtra y cada
 *  rayo los recorría todos). Devuelve cuántas mallas con árbol y cuántos triángulos cubre. Idempotente. */
function pon(raiz: T3, lib: T3, min?: number | null): { mallas: number; triangulos: number } {
  let n = 0, tri = 0;
  raiz.traverse(function (o: T3) {
    if (o.isInstancedMesh) { if (o.raycast !== nada) { o.raycast = nada; o.userData.bvhRaycast = 1; } return; }
    if (!candidata(o, min)) return;
    o.geometry.boundsTree = new lib.MeshBVH(o.geometry, { indirect: true }); o.raycast = lib.acceleratedRaycast; o.userData.bvhRaycast = 1; n++; tri += triangulos(o.geometry);
  });
  return { mallas: n, triangulos: tri };
}
/** lo deshace (dispose-model, apagar): suelta el árbol y devuelve el raycast de three. Idempotente */
function quita(raiz: T3): number {
  let n = 0;
  raiz.traverse(function (o: T3) {
    if (o.userData && o.userData.bvhRaycast) { delete o.raycast; delete o.userData.bvhRaycast; }
    if (o.geometry && o.geometry.boundsTree) { o.geometry.boundsTree = null; n++; }
  });
  return n;
}
function cuenta(raiz: T3): number { let n = 0; raiz.traverse(function (o: T3) { if (o.geometry && o.geometry.boundsTree) n++; }); return n; }
export const RayosPuro = { pon, quita, cuenta, candidata, triangulos, MIN_TRIANGULOS };

// Aviso de 3DTilesRendererJS por la escala no uniforme del grupo (la exageración vertical, colocaGrupo): lo da prepareForTraversal en CADA fotograma
// con exag ≠ 1 (unos 78/s en una sesión real de Chrome con ?debug&mide=60). Se deja pasar UNA vez y se descarta el resto del
// mismo texto; cualquier otro console.warn pasa intacto. Se restaura con restaura() (en falla()).
export function limitaAviso(consola: T3, texto: string): { restaura(): void } {
  const orig = consola.warn; let visto = false, activo = true;
  function filtro(this: unknown, ...args: unknown[]): unknown {
    const m = args[0];
    if (activo && typeof m === "string" && m.indexOf(texto) >= 0) { if (visto) return undefined; visto = true; }
    return orig.apply(consola, args);
  }
  consola.warn = filtro;
  return { restaura: function () { activo = false; if (consola.warn === filtro) consola.warn = orig; } };   // si otro lo envolvió después, el nuestro queda inerte y deja pasar todo
}

/** L4-01 (MU0-1): el tileset trae el centro_utm y el z0 del índice con el que se generó (extras.gemelo, contratos/tileset.schema.json). Si no son los del
 *  índice D que sirve esta página (más de 1 cm de diferencia), su transform raíz coloca la escena corrida respecto del Mundo, las fichas y la física, y la
 *  huella del registro no lo ve (los ids salen de la posición UTM absoluta): no se usa. Devuelve el motivo del fallo, o null si casa. */
export function motivoMarco(G: T3, DD: T3): string | null {
  if (!G || !G.centro_utm || G.z0 === undefined) return "el tileset no trae el centro_utm y el z0 con los que se generó (extras.gemelo)";
  const dE = Math.abs(G.centro_utm[0] - DD.centro_utm[0]), dN = Math.abs(G.centro_utm[1] - DD.centro_utm[1]), dz = Math.abs(G.z0 - DD.z0);
  if (!(dE <= 0.01 && dN <= 0.01 && dz <= 0.01)) return "el tileset es de otra exportación: su centro_utm " + G.centro_utm + " y z0 " + G.z0 + " no son los del índice (" + DD.centro_utm + ", " + DD.z0 + "); hay que regenerarlo";
  return null;
}

// L2-04: el caché LRU de 3DTilesRendererJS. Todo TilesRenderer comparte por defecto UN caché (DEFAULT_LRU_CACHE) que solo suelta teselas sin uso al pasar de 8.000
// entradas o de unos 430 MB (y entonces baja a 6.000 o 322 MB): en el Quest, por encima de los ~350 MB de presupuesto de toda la página (pruebas/presupuesto.json), así que
// «todo lo que se haya cargado se queda cargado». Aquí el caché es propio del tileset y sus bytes salen del aparato y, en VR, del perfil de triángulos.
// Cuenta la librería (getBytesUsed: geometrías y texturas de cada tesela cargada), no la GPU: es una cota, no una medida de la tarjeta.
// [SUPUESTO] los MB de partida de móvil y gafas (la mitad y algo más de la mitad de los de escritorio): NO MEDIDOS en un aparato; ?tilesCacheMB=<mín>,<máx> los cambia para medirlos
// (con resumen().cache y ?debug). Si el tope se queda corto para lo que se ve, la librería no pide más teselas (isFull) y se queda con la tesela padre (más borrosa): no hay agujeros.
const MB = 1048576;
const LRU_MB: Record<string, [number, number]> = { escritorio: [322, 430], movil: [160, 215], quest: [128, 172] };   // [mínimo al que baja, máximo que dispara la poda]; escritorio, lo de la librería
const LRU_TRI_REF = 380000;   // el perfil de VR más alto (VR_PERFILES[0].tri en 29_vr.js): con él, los MB de la clase; los perfiles que bajan triángulos bajan también bytes, hasta la mitad
export interface LimitesLru { minBytesSize: number; maxBytesSize: number }
/** ?tilesCacheMB=<mín>,<máx> (MB; 0 < mín < máx ≤ 4096), o null */
function lruUrl(busqueda: string | null | undefined): [number, number] | null {
  const m = /[?&]tilesCacheMB=(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?![^&#])/.exec(busqueda || "");
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  return a > 0 && a < b && b <= 4096 ? [a, b] : null;
}
/** los límites de bytes del caché para esta clase de aparato («escritorio», «movil», «quest»), el `tri` del perfil de VR en curso (null fuera de VR) y la URL */
function lruLimites(clase: string, triPerfil?: number | null, busqueda?: string | null): LimitesLru {
  const u = lruUrl(busqueda), base = u || LRU_MB[clase] || LRU_MB["escritorio"] as [number, number];
  const f = !u && triPerfil && triPerfil > 0 ? Math.max(0.5, Math.min(1, triPerfil / LRU_TRI_REF)) : 1;
  return { minBytesSize: Math.round(base[0] * f * MB), maxBytesSize: Math.round(base[1] * f * MB) };
}
/** deja en `lru` esos límites (la librería los lee en cada paso, así que valen al momento) */
function lruAplica(lru: T3, lim: LimitesLru): void { lru.minBytesSize = lim.minBytesSize; lru.maxBytesSize = lim.maxBytesSize; }
/** un caché PROPIO para este tileset, del mismo tipo que el de la librería y con su misma prioridad de descarga, y con los límites puestos; en vez del compartido */
function lruPropio(tiles: T3, lim: LimitesLru): T3 {
  const base = tiles.lruCache, Clase = base.constructor, lru = new Clase();
  if (base.unloadPriorityCallback) lru.unloadPriorityCallback = base.unloadPriorityCallback;   // sin él, queuedTiles.sort(null) lanza
  lruAplica(lru, lim); tiles.lruCache = lru; return lru;
}
export const LruTilesPuro = { MB, LRU_MB, LRU_TRI_REF, lruUrl, limites: lruLimites, aplica: lruAplica, propio: lruPropio };

// ---------------------------------------------------------------- el módulo
export interface DepsEscena3D {
  THREE: T3;
  /** el índice: de él salen tileset, finca_id, centro_utm y z0 */
  D: T3;
  Aparato: { politica(): T3 };
  CargaPuro: { parseTiles(pol: T3, enVr: boolean): number; prioridadRed(tile: T3): string };
  TopeTilesPuro: T3;
  TopeOlivos: { parteTiles(n: number): number; linea(): string };
  XrPerillas: T3;
  /** la Cola: cobra(clave, fn) apunta lo que hace fn al llegar una tesela como deuda del fotograma siguiente */
  Cola: { cobra(clave: string, fn: (e: T3) => void): (e: T3) => void };
  Mundo: { tesela(x: number, y: number): unknown };
  /** Mundo.suelo (02_mundo): la cota del suelo en la CPU */
  suelo(x: number, y: number): number;
  renderer: T3;
  scene: T3;
  camera: T3;
  Estado: { exag: number };
  /** 04d (detrás de este módulo en el montaje): se pide en cada uso; null mientras no exista */
  SombreadoTiles(): { modelo(e: T3, t: T3): void; suelta(e: T3): void; actualiza(): void; libera(): void } | null;
  /** 04c (detrás): se pide en cada uso; null si no existe */
  OlivosTiles(): { dibuja(): boolean; triangulos(): number } | null;
  /** 09_camara: el punto que mira (detrás): se pide en cada uso; null si no existe */
  objetivo?: (() => { x: number; z: number } | null) | undefined;
  /** location.search ("" si no hay) */
  busqueda: string;
  /** document, para el aviso #sinEscena; null fuera del navegador */
  documento?: T3;
  consola: T3;
  /** import("3d-tiles-renderer") (lo escribe el legado: Vite lo trocea con el motor) */
  cargaTiles: () => Promise<T3>;
  /** import("three-mesh-bvh"), solo con ?bvh */
  cargaBvh?: (() => Promise<T3>) | undefined;
  ahora?: (() => number) | undefined;
}

export function creaEscena3D(d: DepsEscena3D) {
  const THREE = d.THREE, D = d.D, camera = d.camera, renderer = d.renderer, scene = d.scene, Estado = d.Estado, Cola = d.Cola, XrPerillas = d.XrPerillas, TopeTilesPuro = d.TopeTilesPuro, TopeOlivos = d.TopeOlivos;
  const ahora = d.ahora || function () { return performance.now(); }, busqueda = d.busqueda;
  const pedida = /[?&]tileset=[^&#]/.test(busqueda) || (typeof D.tileset === "string" && D.tileset.length > 0);
  let estado = pedida ? "cargando" : "apagado", motivo = "", tiles: T3 = null, Sched: T3 = null, raizT: T3 = null, exagPuesta = NaN, sesion: T3 = null, errores = 0;
  const ERROR_ESCRITORIO = (function () { const m = /[?&]tilesError=([0-9.]+)/.exec(busqueda), v = m ? Number(m[1]) : 16; return v > 0 && v <= 256 ? v : 16; })();
  let errorPerfil: number | null = null;   // el del perfil VR (29_vr.js, campo e de cada perfil); null = el de escritorio
  // Q0k (02l_tope_tiles.js): el lazo que sube el error del tileset si sus triángulos pasan del tope del perfil de VR (y lo baja cuando sobra). Solo en VR;
  // en pantalla y móvil no corre. triNivel: el `tri` del perfil; vistoT: lo último contado (relieve de las teselas visibles + sus olivos), cada MUESTRA s
  const tope = TopeTilesPuro.nuevo();
  let triNivel: number | null = null, ultMuestra = 0;
  const cab = new THREE.Vector3();
  const vistoT = { tri: 0, relieve: 0, olivos: 0, mallas: 0 }, mm = { dt: 0, tri: 0, tope: 0, eBase: 0, errMax: 0, cargando: false, x: 0, z: 0 };
  const tam = new THREE.Vector2();
  const BVH = /[?&]bvh(=1|=true)?(&|#|$)/.test(busqueda), bvhN = { mallas: 0, triangulos: 0 };   // AG-1.6 (opt-in): ver RayosPuro
  let bvhLib: T3 = null;
  const POL = d.Aparato.politica();   // AG-1.5: tilesParse / tilesParseVr (cuántas teselas analiza la librería a la vez)
  // AG-1.5: prioridad de red alta a lo cercano. Un complemento de 3DTilesRendererJS: preprocessURL (que recibe la tesela) apunta de qué tesela es cada
  // dirección y fetchData pide la descarga a la propia librería (tiles.fetchData: el fetch de siempre, al mismo origen) con RequestInit.priority
  // de CargaPuro.prioridadRed: "high" lo que se ve a menos de 200 m, "low" lo que está fuera del encuadre. Es una pista para el navegador
  // (Chrome la atiende; otros la ignoran): no cambia qué se descarga ni el orden de la cola de la librería, que ya va por error y distancia.
  function prioridadRed(): T3 {
    const deTesela = new Map();
    return {
      name: "GEMELO_PRIORIDAD_RED",
      preprocessURL: function (u: T3, tile: T3) { if (tile) deTesela.set(String(u), tile); return u; },
      fetchData: function (u: T3, op: T3) {
        const k = String(u), t = deTesela.get(k), pr = d.CargaPuro.prioridadRed(t); deTesela.delete(k);
        return tiles.fetchData(u, pr === "auto" ? op : Object.assign({}, op, { priority: pr }));
      },
      dispose: function () { deTesela.clear(); }
    };
  }
  /** los ganchos que pone 04c_olivos_tiles.js con engancha(): alRaiz(tileset), alModelo(scene, tile) → true si se queda con sus olivos, alSoltar(scene), alApagar(motivo), fotograma() */
  const ganchos: Record<string, T3> = {};
  function url(): string {
    const m = /[?&]tileset=([^&#]+)/.exec(busqueda), u = m ? decodeURIComponent(m[1] as string) : D.tileset;
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(u)) throw new Error("tileset fuera del mismo origen: " + u);   // ni http(s):, ni data:, ni //host
    return u;
  }
  let avisoEscala: { restaura(): void } | null = null;
  function falla(e: T3): void {
    if (estado === "sin") return;
    estado = "sin"; if (avisoEscala) { avisoEscala.restaura(); avisoEscala = null; } motivo = String(e && e.message || e); d.consola.error("escena 3D Tiles: " + motivo + " (esta finca se queda sin escena)");
    if (tiles) { try { scene.remove(tiles.group); tiles.dispose(); } catch (e2) { /* ya estaba suelto */ } tiles = null; }
    // falla() puede llegar mientras se monta el motor (sin tileset, o un ?tileset= de otro host, falla al definir este módulo): 04d y 04c
    // vienen después y aún no existen; a 04c se le avisa al engancharse (engancha)
    const S = d.SombreadoTiles(); if (S) S.libera();
    if (ganchos.alApagar) ganchos.alApagar(motivo);
    avisa(motivo);
  }
  // el aviso en la página (#sinEscena de plantilla.html): role="alert", no tapa los toques del visor ni el panel
  function avisa(m: string): void {
    const doc = d.documento; if (!doc) return;   // (las pruebas de Node evalúan el módulo sin DOM)
    const el = doc.getElementById("sinEscena"), tx = doc.getElementById("sinEscenaMotivo"); if (!el) return;
    if (tx) tx.textContent = m; el.hidden = false;
  }
  function colocaGrupo(): void {   // tiles.group.matrix = escala vertical (exag) · Rx(−π/2) · transform⁻¹ de la raíz
    if (!tiles || !raizT) return;
    const M = new THREE.Matrix4().makeScale(1, Estado.exag, 1).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(raizT.clone().invert());
    tiles.group.matrixAutoUpdate = false; tiles.group.matrix.copy(M); tiles.group.updateMatrixWorld(true); exagPuesta = Estado.exag;
  }
  function quitaOlivos(raizModelo: T3): void {   // los nodos instanciados del glb (EXT_mesh_gpu_instancing → InstancedMesh): fuera y liberados
    const fuera: T3[] = [];
    raizModelo.traverse(function (o: T3) { if (o.isInstancedMesh) fuera.push(o); });
    fuera.forEach(function (o) { o.removeFromParent(); o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m: T3) { m.dispose(); }); o.dispose(); });
  }
  // L2-04: el límite de bytes de este tileset: el de su clase de aparato y, en VR, el del perfil (triNivel)
  function limitesLru(): LimitesLru { return lruLimites(POL.clase as string, errorPerfil ? triNivel : null, busqueda); }
  function arranca(): void {
    let u: string;
    try { u = url(); } catch (e) { falla(e); return; }
    d.cargaTiles().then(function (m: T3) {
      if (!m || !m.TilesRenderer) throw new Error("sin 3DTilesRendererJS");
      if (estado !== "cargando") return;
      Sched = m.Scheduler || null;
      tiles = new m.TilesRenderer(u);
      lruPropio(tiles, limitesLru());   // L2-04: su caché, con los bytes de este aparato (y no el compartido de la librería, de 322-430 MB)
      if (!avisoEscala && d.consola) avisoEscala = limitaAviso(d.consola, "Non uniform scale used for tile");
      tiles.errorTarget = ERROR_ESCRITORIO;
      tiles.parseQueue.maxJobs = d.CargaPuro.parseTiles(POL, false);   // AG-1.5: menos teselas analizadas a la vez en móvil y gafas (y en VR, en actualiza)
      tiles.registerPlugin(prioridadRed());
      tiles.setCamera(camera); tiles.setResolutionFromRenderer(camera, renderer);
      tiles.addEventListener("load-root-tileset", function (e: T3) {
        const r = e.tileset && e.tileset.root, G = e.tileset && e.tileset.extras && e.tileset.extras.gemelo;
        if (!r || !r.transform) { falla(new Error("la raíz del tileset no trae transform")); return; }
        if (G && G.finca_id && D.finca_id && G.finca_id !== D.finca_id) { falla(new Error("tileset de " + G.finca_id + " con datos de " + D.finca_id)); return; }
        const mm0 = motivoMarco(G, D); if (mm0) { falla(new Error(mm0)); return; }
        raizT = new THREE.Matrix4().fromArray(r.transform); colocaGrupo(); estado = "activo";
        if (ganchos.alRaiz) ganchos.alRaiz(e.tileset);
      });
      // AG-1.5: lo que el motor ejecuta al llegar una tesela (olivos de 04c, sombreado de 04d) corre fuera de la Cola, cuando la librería acaba de
      // analizarla; Cola.cobra lo apunta como deuda («T» en ?debug) y el fotograma siguiente carga menos (07b_arboles, CargaPuro.base)
      tiles.addEventListener("load-model", Cola.cobra("T", function (e: T3) { if (!(ganchos.alModelo && ganchos.alModelo(e.scene, e.tile))) quitaOlivos(e.scene); const r = cuentaRelieve(e.scene); e.scene.userData.tesela = { uri: e.tile.content && e.tile.content.uri, lado: e.tile.boundingVolume && e.tile.boundingVolume.box ? 2 * e.tile.boundingVolume.box[3] : null, error: e.tile.geometricError, tri: r.tri, mallas: r.mallas }; }));   // Q0k: los triángulos del relieve, una vez por tesela
      tiles.addEventListener("load-model", Cola.cobra("T", function (e: T3) { const S = d.SombreadoTiles(); if (S) S.modelo(e.scene, e.tile); }));   // el relieve, con su sombreado (04d)
      tiles.addEventListener("dispose-model", function (e: T3) { const S = d.SombreadoTiles(); if (S) S.suelta(e.scene); });
      if (BVH) {   // AG-1.6: el BVH de cada tesela al llegar (en la deuda «T») y fuera al soltarla; la librería se pide aparte y, al llegar, cubre las ya cargadas
        tiles.addEventListener("load-model", Cola.cobra("T", function (e: T3) { if (bvhLib) sumaBVH(RayosPuro.pon(e.scene, bvhLib)); }));
        tiles.addEventListener("dispose-model", function (e: T3) { RayosPuro.quita(e.scene); });
        if (d.cargaBvh) d.cargaBvh().then(function (m2: T3) { bvhLib = m2; if (tiles) sumaBVH(RayosPuro.pon(tiles.group, m2)); }).catch(function (er: unknown) { d.consola.warn("sin three-mesh-bvh: los rayos siguen sin BVH", er); });
      }
      tiles.addEventListener("dispose-model", function (e: T3) { if (ganchos.alSoltar) ganchos.alSoltar(e.scene); });   // los olivos (04c)
      tiles.addEventListener("load-error", function (e: T3) {
        errores++; d.consola.error("escena 3D Tiles: tesela con fallo " + (e.url || "") + " " + (e.error && e.error.message || ""));
        if (!raizT) falla(new Error("no se pudo leer " + u));
      });
      scene.add(tiles.group);
    }).catch(falla);
  }
  // el error en pantalla que se pide: el del perfil VR si lo hay; si no, el de escritorio (?tilesError=, 16 px por defecto como la librería).
  // Q0k: con el lazo en marcha, el error del perfil por el paso en que esté (al cambiar de perfil, el lazo olvida lo aprendido y sigue desde ese paso)
  // L2-04: y el caché, a los bytes del perfil
  function perfil(p: T3): void {
    errorPerfil = p && p.e > 0 ? p.e : null; triNivel = p && p.tri > 0 ? p.tri : null;
    if (!errorPerfil) { mm.tope = 0; mm.eBase = 0; TopeTilesPuro.paso(tope, mm); ultMuestra = 0; }   // fuera de VR: el lazo, a cero
    if (tiles) { tiles.errorTarget = errorPerfil ? (tope.activo ? TopeTilesPuro.error(errorPerfil, tope.k, XrPerillas.errMaxTiles()) : errorPerfil) : ERROR_ESCRITORIO; lruAplica(tiles.lruCache, limitesLru()); }
  }
  // Q0k: los triángulos y mallas del relieve de una tesela (lo que no es olivo instanciado), al llegar
  function cuentaRelieve(sc: T3): { tri: number; mallas: number } {
    const r = { tri: 0, mallas: 0 };
    sc.traverse(function (o: T3) { if (!o.isMesh || o.isInstancedMesh || !o.geometry) return; r.tri += RayosPuro.triangulos(o.geometry); r.mallas++; });
    return r;
  }
  function sumaVisible(t: T3): void { const sc = t.engineData && t.engineData.scene, u = sc && sc.userData.tesela; if (u && u.tri) { vistoT.relieve += u.tri; vistoT.mallas += u.mallas; } }
  // Q0k: cada MUESTRA s en VR (no cada fotograma): cuenta lo que el tileset manda a dibujar y deja que el lazo (02l) decida el error. Solo sumas y una
  // asignación: no hay trabajo que repartir por la Cola (lo pesado lo lleva la librería en su update, con sus propias colas)
  function muestraTope(cx: T3): void {
    const ahoraT = ahora(); let dt = (ahoraT - ultMuestra) / 1000;
    if (ultMuestra && dt < TopeTilesPuro.DEF.MUESTRA) return;
    if (!ultMuestra || dt > 1) dt = TopeTilesPuro.DEF.MUESTRA;   // al empezar, o tras una pausa: una muestra normal
    ultMuestra = ahoraT;
    vistoT.relieve = 0; vistoT.mallas = 0; tiles.visibleTiles.forEach(sumaVisible);   // reserva-ok: Set.forEach con una función ya declarada (sin cierre nuevo)
    const OT = d.OlivosTiles(); vistoT.olivos = OT && OT.dibuja() ? OT.triangulos() : 0; vistoT.tri = vistoT.relieve + vistoT.olivos;
    const s = tiles.stats; cx.getWorldPosition(cab);
    mm.dt = dt; mm.tri = vistoT.tri; mm.tope = TopeOlivos.parteTiles(XrPerillas.topeTiles(triNivel)); mm.eBase = errorPerfil as number; mm.errMax = XrPerillas.errMaxTiles(); mm.cargando = s.queued + s.downloading + s.parsing > 0; mm.x = cab.x; mm.z = cab.z;   // Q0n (02m): el tope, menos lo que ocupan los olivos del motor
    const e = TopeTilesPuro.paso(tope, mm);
    if (e > 0 && tiles.errorTarget !== e) tiles.errorTarget = e;
  }
  // la línea de ?debug y del medidor (XrPerillas.linea, 02f): «tileset 152 k / tope 130 k tri · 41 mallas · error 60 px (lazo 1/4)»; "" fuera de VR
  XrPerillas.lineaTiles = function (): string {
    if (!errorPerfil || !tiles) return "";
    const t = XrPerillas.topeTiles(triNivel) > 0 ? TopeTilesPuro.linea(tope, { mallas: vistoT.mallas }) : TopeTilesPuro.linea(tope, { apagado: true, tri: vistoT.tri });
    const o = TopeOlivos.linea();   // Q0n: los olivos del motor, detrás
    return t && o ? t + " · " + o : t || o;
  };
  // cada fotograma, antes de dibujar. En una sesión XR, como el ejemplo de XR de 3DTilesRendererJS: la cámara de la sesión (sus dos ojos) en
  // lugar de la de siempre, con la resolución de un ojo; y el Scheduler de la librería atado a la sesión (si no, sus colas esperan al
  // requestAnimationFrame de la ventana, que en las gafas no corre)
  function actualiza(): void {
    if (!tiles) return;
    const xr = renderer.xr, enXR = !!(xr && xr.isPresenting), s = enXR ? xr.getSession() : null;
    if (Sched && s !== sesion) { Sched.setXRSession(s); sesion = s; tiles.parseQueue.maxJobs = d.CargaPuro.parseTiles(POL, !!s); }
    if (enXR) {
      if (tiles.hasCamera(camera)) tiles.deleteCamera(camera);
      const cx = xr.getCamera(); tiles.setCamera(cx);
      const ojo = cx.cameras && cx.cameras[0]; if (ojo && ojo.viewport) tiles.setResolution(cx, ojo.viewport.z, ojo.viewport.w);
      if (errorPerfil) muestraTope(cx);   // Q0k: el tope de triángulos del perfil (con lo que dibujó el fotograma anterior)
    } else {
      if (tiles.cameras.length !== 1 || !tiles.hasCamera(camera)) { tiles.cameras.slice().forEach(function (c: T3) { tiles.deleteCamera(c); }); tiles.setCamera(camera); }
      renderer.getSize(tam); tiles.setResolution(camera, tam.x, tam.y);
    }
    if (Estado.exag !== exagPuesta) colocaGrupo();
    camera.updateMatrixWorld();
    tiles.update();
    const S = d.SombreadoTiles(); if (S) S.actualiza();
    if (ganchos.fotograma) ganchos.fotograma();
  }
  function sumaBVH(r: { mallas: number; triangulos: number }): void { bvhN.mallas += r.mallas; bvhN.triangulos += r.triangulos; }
  function resumen() {
    let vis = 0; if (tiles) tiles.visibleTiles.forEach(function (t: T3) { if (t.content && t.content.uri) vis++; });
    const lru = tiles && tiles.lruCache;
    return { estado, motivo, errores, visibles: vis, bvh: BVH ? { activo: !!bvhLib, mallas: tiles ? RayosPuro.cuenta(tiles.group) : 0, construidas: bvhN.mallas, triangulos: bvhN.triangulos } : null, errorTarget: tiles ? tiles.errorTarget : null,
      tope: { activo: tope.activo, tope: tope.tope, tri: vistoT.tri, relieve: vistoT.relieve, olivos: vistoT.olivos, mallas: vistoT.mallas, error: tope.error, k: tope.k, K: tope.K, saturado: tope.saturado, cambios: tope.cambios, subidas: tope.subidas, bajadas: tope.bajadas },   // Q0k
      // L2-04: el caché del tileset: cuántos bytes (según la librería) y teselas guarda, y a qué límites; null sin tileset
      cache: lru ? { bytes: lru.cachedBytes, items: lru.itemSet.size, minBytes: lru.minBytesSize, maxBytes: lru.maxBytesSize } : null,
      stats: tiles ? JSON.parse(JSON.stringify(tiles.stats)) : null };
  }
  // altura del relieve DIBUJADO en (x, y) del marco local (rayo vertical contra las teselas visibles: la librería saca de tiles.group las que no
  // se dibujan), sin exageración; null si no hay tesela. relieveEn dice además qué glb lo dibuja (uri, lado y geometricError de su tesela).
  // Solo para pruebas y depuración: la física usa la altura de la CPU (decisión 38)
  const rayo = new THREE.Raycaster(), abajo = new THREE.Vector3(0, -1, 0);
  rayo.firstHitOnly = true;   // la propiedad que lee acceleratedRaycast (three la ignora): solo el impacto más cercano de cada malla
  function teselaDe(o: T3): T3 { for (let p = o; p; p = p.parent) if (p.userData && p.userData.tesela) return p.userData.tesela; return null; }
  function relieveEn(x: number, y: number): { h: number; uri: string | null; lado: number | null; error: number | null } | null {
    if (!tiles || !raizT) return null;
    rayo.set(new THREE.Vector3(x, 1e4, -y), abajo);
    const r = rayo.intersectObject(tiles.group, true).filter(function (h: T3) { return !h.object.isInstancedMesh; })[0];   // el relieve, no los olivos
    if (!r) return null;
    const t = teselaDe(r.object) || {};
    return { h: r.point.y / Estado.exag, uri: t.uri || null, lado: t.lado || null, error: t.error === undefined ? null : t.error };
  }
  function alturaEn(x: number, y: number): number | null { const r = relieveEn(x, y); return r ? r.h : null; }
  // Sonda de huecos (criterio 3 del ADR-0015; solo pruebas): nx × ny rayos desde la cámara por la pantalla, más uno vertical bajo la cámara y otro
  // bajo el objetivo. Para cada rayo se busca en la CPU dónde corta el relieve (Mundo.suelo, marcha de 1 m y bisección; con la exageración puesta)
  // y, si ese punto cae dentro de los datos (tesela del contrato con un margen de 2 m), el rayo debe dar con el relieve dibujado: las teselas
  // visibles del tileset (sin escena no hay relieve dibujado: todo rayo en los datos cuenta como sin relieve). Devuelve cuántos rayos caen en los datos y cuántos no
  // encuentran relieve (con las primeras muestras de los que fallan).
  const ndc = new THREE.Vector2();
  function cortaCPU(o: T3, dir: T3): number {   // primer t > 0 con o + t·d bajo el relieve de la CPU, o −1 (hasta 6 km)
    const f = function (t: number) { const x = o.x + dir.x * t, z = o.z + dir.z * t; return o.y + dir.y * t - d.suelo(x, -z) * Estado.exag; };
    let a = 0, fa = f(0); if (fa <= 0) return -1;
    for (let t = 1; t < 6000; t += Math.max(1, Math.min(20, fa * 0.5))) { const ft = f(t); if (ft <= 0) { for (let k = 0; k < 30; k++) { const m = (a + t) / 2; if (f(m) > 0) a = m; else t = m; } return t; } a = t; fa = ft; }
    return -1;
  }
  function enDatos(x: number, y: number): boolean { const M = 2; return !!(d.Mundo.tesela(x - M, y - M) && d.Mundo.tesela(x + M, y - M) && d.Mundo.tesela(x - M, y + M) && d.Mundo.tesela(x + M, y + M)); }
  function sondea(nx?: number, ny?: number) {
    nx = nx || 7; ny = ny || 5;
    const objs: T3[] = []; if (tiles && estado === "activo") objs.push(tiles.group);
    camera.updateMatrixWorld();
    const rayos: { o: T3; d: T3; que: string }[] = [], cam = camera.getWorldPosition(new THREE.Vector3());
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { ndc.set(-0.9 + 1.8 * i / (nx - 1), -0.9 + 1.8 * j / (ny - 1)); rayo.setFromCamera(ndc, camera); rayos.push({ o: rayo.ray.origin.clone(), d: rayo.ray.direction.clone(), que: "pantalla " + i + "," + j }); }
    rayos.push({ o: cam.clone(), d: abajo.clone(), que: "bajo la cámara" });
    const obj = d.objetivo ? d.objetivo() : null;
    if (obj) rayos.push({ o: new THREE.Vector3(obj.x, cam.y + 50, obj.z), d: abajo.clone(), que: "bajo el objetivo" });
    let n = 0, sin = 0, aristas = 0, r0: { d: T3 } | null = null;
    const muestras: { que: string; x: number; y: number; arista: boolean }[] = [], o2 = new THREE.Vector3();
    const da = function (o: T3) { rayo.set(o, (r0 as { d: T3 }).d); rayo.far = Infinity; return objs.length && rayo.intersectObjects(objs, true).some(function (h: T3) { return !h.object.isInstancedMesh; }); };
    rayos.forEach(function (r) {
      const t = cortaCPU(r.o, r.d); if (t < 0) return;
      const x = r.o.x + r.d.x * t, y = -(r.o.z + r.d.z * t); if (!enDatos(x, y)) return;
      n++; r0 = r;
      if (da(r.o)) return;
      // un rayo que pasa justo por una arista (entre dos triángulos o entre dos glb vecinos, que comparten vértices) puede no dar con ninguno en el
      // Raycaster de three; no es un hueco en pantalla. Si a 1 cm, en cualquiera de las cuatro direcciones, sí hay relieve, cuenta como arista
      const cerca = [[0.01, 0], [-0.01, 0], [0, 0.01], [0, -0.01]].some(function (e) { return da(o2.set(r.o.x + (e[0] as number), r.o.y, r.o.z + (e[1] as number))); });
      if (cerca) aristas++; else sin++;
      if (muestras.length < 5) muestras.push({ que: r.que, x: +x.toFixed(2), y: +y.toFixed(2), arista: cerca });
    });
    return { rayos: rayos.length, enDatos: n, sinRelieve: sin, aristas, muestras, visibles: tiles ? resumen().visibles : 0 };
  }
  function cargada(): boolean {   // no se llama listo(): taparía el listo del motor (08_marcadores.js) que mira falla()
    if (estado === "apagado" || estado === "sin") return true;
    const s = tiles && tiles.stats;
    return estado === "activo" && tiles.loadProgress === 1 && s.queued + s.downloading + s.parsing === 0;
  }
  /** Lo que suelta el componente al apagarse (MU5): el TilesRenderer con su dispose (que libera la geometría, los materiales y las texturas de cada tesela y cierra sus
   *  ImageBitmap: TilesRenderer.disposeTile), su grupo fuera de la escena, el BVH, el sombreado de 04d (y con él lo suyo), el Scheduler soltado de la sesión XR, el filtro
   *  del aviso de escala, el caché LRU propio y el lazo del tope de triángulos. Si aún estaba cargando la librería, la carga que llegue después se tira (estado ≠ «cargando»).
   *  Se puede llamar dos veces. Tras liberar, el estado es «apagado» (cargada() dice true, actualiza() no hace nada). */
  function libera(): void {
    if (!tiles && estado !== "cargando") return;
    if (tiles) {
      if (BVH) RayosPuro.quita(tiles.group);
      const S = d.SombreadoTiles(); if (S) S.libera();
      if (ganchos.alApagar) ganchos.alApagar("liberada");
      if (Sched) Sched.setXRSession(null);
      scene.remove(tiles.group); tiles.dispose(); tiles = null;
    }
    if (avisoEscala) { avisoEscala.restaura(); avisoEscala = null; }
    estado = "apagado"; raizT = null; exagPuesta = NaN; sesion = null; errorPerfil = null; triNivel = null; ultMuestra = 0;
    vistoT.tri = 0; vistoT.relieve = 0; vistoT.olivos = 0; vistoT.mallas = 0;
  }
  function engancha(g: Record<string, T3>): void { for (const k in g) ganchos[k] = g[k]; if (estado === "sin" && ganchos.alApagar) ganchos.alApagar(motivo); }
  if (pedida) arranca(); else falla(new Error("falta el tileset"));
  return { actualiza, estado: function () { return estado; }, perfil, resumen, libera, listo: cargada, alturaEn, relieveEn, sondea, engancha, grupo: function () { return tiles && tiles.group; } };
}
export type Escena3D = ReturnType<typeof creaEscena3D>;

/** El manifiesto del componente «escena-tiles»: el ciclo de vida de la escena 3D Tiles. El objeto que el motor usa (Escena3D) es el mismo que monta (lo crea el legado al cargarse y se le
 *  da aquí, para que 04c, 04d, 07b, 29_vr y el fotograma lo tengan desde el principio y no dependan de cuándo se monte el componente). */
export function manifiestoEscena3D(escena: Escena3D): Manifiesto {
  return {
    id: "escena-tiles", version: 1,
    consume: ["D", "Aparato", "CargaPuro", "TopeTilesPuro", "TopeOlivos", "XrPerillas", "Cola", "Mundo", "renderer", "scene", "camera", "Estado"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0 },   // lo que dibuja el tileset lo cuenta pruebas/presupuesto.json («lejos», «cerca») y, en VR, el tope del perfil (02l_tope_tiles)
    mundos: ["exterior"],
    dom: ["#sinEscena"],   // A3-8b: el aviso «Esta finca no tiene escena», escondido fuera del exterior (COMPONENTES §3.2)
    monta: function () { return escena; },
    libera: function (api) { if (api) (api as Escena3D).libera(); }
  };
}

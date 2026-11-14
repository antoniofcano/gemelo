// Los olivos del tileset (F1d paso 4, ADR-0015; contrato tileset v2 en contratos/tileset.schema.json), solo cuando hay escena 3D Tiles (Escena3D, escena-tiles.ts).
// MU5-n (A3-1b): antes apps/web/motor/04c_olivos_tiles.js, que queda como talón. IdTiles (copas de cada tesela, huellas y máscara) es puro; creaOlivosTiles
// es el módulo con su estado; y manifiestoOlivosTiles es el componente «olivos-tiles» de los mundos ["exterior"], con un libera() que suelta de verdad.
// Sin tileset no actúa. Con él, los olivos de media y larga distancia los dibuja el tileset (las instancias EXT_mesh_gpu_instancing de cada
// glb, que Escena3D ya no retira) y los de cerca siguen siendo del motor: el detalle de cerca de siempre (07b_arboles.js) y, con ?olivos=gen,
// los generados (07ab_generados.js). Para que ningún olivo se dibuje dos veces, una MÁSCARA: 07b dice qué olivos dibuja de cerca (índices de copas[])
// y en cada malla del tileset esas instancias se apartan al final y no se dibujan (count menor; ver Mascara), sin rehacer el glb.
// Identidad (doc/sistema/TILES3D.md, «Identidad y tipo por instancia»): instancia → k = _INDICE_COPA → g = lst[k] → copas[g], con las copas de la
// tesela rehechas aquí desde el json (la regla de olivo de 02_mundo.js dentro del cuadrado de extras.gemelo, en el orden de copas[]). Antes de
// resolver nada se comprueban las huellas (crypto.subtle): la del registro (huella_registro) y la de cada tesela. Si el registro no casa, el json no
// es el del tileset: fuera los olivos del tileset y el motor dibuja los suyos como siempre. Si no casa una tesela, sus olivos se retiran (se avisa)
// en vez de dar a un árbol el id de otro. Sin crypto.subtle (contexto no seguro) se avisa y se resuelve solo por el índice.
// _TIPO y sus nombres (extras.gemelo.tipos) se guardan por olivo para el catálogo de 07a (tipo(g), tipos()); no se dibuja por tipo todavía.
// Presupuesto: los triángulos de olivo que el tileset manda a dibujar (sin los apartados) cuentan en el tope de 07b (TOPE_TRI): se restan del de
// los generados y entran en su triEst.
// Del legado recibe por argumento lo que necesita (el índice D, las copas, Escena3D, gArboles, crypto.subtle y la consola); no lee globales.
import type { Manifiesto } from "../../nucleo/componentes.ts";

// three no trae tipos en el repo (como en ambiente.ts y presupuesto.ts): de él solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;

// ---------------------------------------------------------------- lo puro: copas de cada tesela, huellas y máscara (sin THREE ni DOM)
/** una copa como la de 02_mundo.js: lo que lee la regla de la tesela */
export interface CopaTesela { x: number; y: number; oliv?: boolean | number }
/** un atributo por instancia (matriz, color, _INDICE_COPA, _TIPO…), que se permuta junto con los demás */
export interface AtributoInstancia { array: { set(a: ArrayLike<number>, o: number): void; slice(a: number, b: number): ArrayLike<number> & { subarray(a: number, b: number): ArrayLike<number> } } & ArrayLike<number>; size: number; a?: unknown }
interface Subtle { digest(alg: string, datos: ArrayBufferView | ArrayBuffer): Promise<ArrayBuffer> }

/** índices g de copas[] (objetos {x, y, oliv} como los de 02_mundo.js) de los olivos con x0 ≤ x < x0+lado e y0 ≤ y < y0+lado, en el orden de copas[] */
function copasDe(cs: readonly CopaTesela[], cuad: readonly number[]): Int32Array {
  const x0 = cuad[0] as number, y0 = cuad[1] as number, L = cuad[2] as number, r: number[] = [];
  for (let g = 0; g < cs.length; g++) { const c = cs[g] as CopaTesela; if (c.oliv && c.x >= x0 && c.x < x0 + L && c.y >= y0 && c.y < y0 + L) r.push(g); }
  return Int32Array.from(r);
}
/** ids de todas las copas: copas_id si el índice lo trae (id_fuente «copas_id»); si no, su índice (id_fuente «indice») */
function ids(n: number, copasId: ArrayLike<number> | null | undefined): Uint32Array { const r = new Uint32Array(n); for (let g = 0; g < n; g++) r[g] = copasId ? (copasId[g] as number) : g; return r; }
function de(todos: ArrayLike<number>, lst: ArrayLike<number>): Uint32Array { const r = new Uint32Array(lst.length); for (let k = 0; k < lst.length; k++) r[k] = todos[lst[k] as number] as number; return r; }
/** "sha256:" + hex del SHA-256 de los ids como Uint32 little-endian (las máquinas de destino lo son); promesa */
function huella(u32: Uint32Array, subtle: Subtle): Promise<string> {
  return subtle.digest("SHA-256", u32).then(function (b) {
    const h = new Uint8Array(b); let s = "sha256:";
    for (let i = 0; i < h.length; i++) s += ((h[i] as number) < 16 ? "0" : "") + (h[i] as number).toString(16);
    return s;
  });
}
/** La máscara de una malla instanciada: ix = _INDICE_COPA (k por instancia), lst = las copas de la tesela y attrs = [{array, size}] con TODOS los
 *  atributos por instancia (matriz, color, _INDICE_COPA, _TIPO…), que se permutan juntos. reparte(m) pone primero, en su orden, las instancias cuyo
 *  olivo no está marcado (m[g] = 1: lo dibuja el motor de cerca) y detrás las marcadas; devuelve cuántas se dibujan (el count de la malla) o −1 si
 *  no cambió nada. Sin nada marcado, los arrays vuelven a ser exactamente los del glb. */
function Mascara(ix: ArrayLike<number>, lst: ArrayLike<number>, attrs: readonly AtributoInstancia[]) {
  const n = ix.length, gDe = new Int32Array(n), oculta = new Uint8Array(n), base = attrs.map(function (a) { return a.array.slice(0, n * a.size); });
  let visibles = n, inicial = true;
  for (let i = 0; i < n; i++) { const k = ix[i] as number; gDe[i] = k >= 0 && k < lst.length && k === Math.floor(k) ? (lst[k] as number) : -1; }
  function reparte(m: ArrayLike<number>): number {
    let cambia = inicial, nv = 0; inicial = false;
    for (let i = 0; i < n; i++) { const g = gDe[i] as number, o = g >= 0 && m[g] ? 1 : 0; if (o !== oculta[i]) { oculta[i] = o; cambia = true; } if (!o) nv++; }
    if (!cambia) return -1;
    let v = 0, h = nv;
    for (let i = 0; i < n; i++) {
      const dst = oculta[i] ? h++ : v++;
      for (let a = 0; a < attrs.length; a++) { const at = attrs[a] as AtributoInstancia, s = at.size; at.array.set((base[a] as ArrayLike<number> & { subarray(a: number, b: number): ArrayLike<number> }).subarray(i * s, i * s + s), dst * s); }
    }
    visibles = nv; return nv;
  }
  function apartadoG(g: number): boolean | null { for (let i = 0; i < n; i++) if (gDe[i] === g) return !!oculta[i]; return null; }   // null: ese olivo no está en esta malla
  return { n, gDe, reparte, apartadoG, visibles: function () { return visibles; } };
}
export const IdTiles = { copasDe, ids, de, huella, Mascara };

// ---------------------------------------------------------------- el módulo
/** los ganchos que pone con Escena3D.engancha (la escena 3D Tiles los llama en load-root-tileset, load-model, dispose-model, al apagarse y cada fotograma) */
export interface GanchosTiles {
  alRaiz: ((tileset: T3) => void) | null;
  alModelo: ((escena: T3, tile: T3) => boolean) | null;
  alSoltar: ((escena: T3) => void) | null;
  alApagar: ((motivo: string) => void) | null;
  fotograma: (() => void) | null;
}
export interface DepsOlivosTiles {
  /** el índice: de él solo se lee copas_id (el id de cada copa, si el índice lo trae) */
  /** el índice: copas_id y v (la versión del contrato de datos, que el tileset dice en extras.gemelo.contrato_origen; L4-14) */
  D: { copas_id?: ArrayLike<number> | null; v?: number };
  /** el censo de árboles (02_mundo: copas), con la regla de olivo ya aplicada */
  copas: readonly CopaTesela[];
  /** la escena 3D Tiles: su estado y dónde engancharse */
  Escena3D: { resumen(): { estado: string }; engancha(g: Partial<GanchosTiles>): void };
  /** el grupo de los árboles del motor (06_arboles): las mallas del tileset solo se ven si se ven ellos (no en los modos Ortofoto ni Nube) */
  gArboles: { visible: boolean };
  /** crypto.subtle, si el contexto es seguro; null o ausente: se avisa y se resuelve solo por el índice */
  subtle?: Subtle | null | undefined;
  consola?: { warn(...a: unknown[]): void } | undefined;
}

/** una tesela cargada con olivos: su glb, sus mallas instanciadas y la máscara de cada una */
interface TeselaOlivos { tile: T3; raizM: T3; uri: string | undefined; e: T3; mallas: T3[]; masc: { m: T3; M: ReturnType<typeof Mascara>; attrs: AtributoInstancia[] }[]; hecha: boolean; fuera: boolean }

export function creaOlivosTiles(d: DepsOlivosTiles) {
  const Escena3D = d.Escena3D, copas = d.copas, D = d.D, subtle = d.subtle || null, consola = d.consola || null;
  let estado = Escena3D.resumen().estado === "sin" ? "apagado" : "esperando", motivo = "", porHuella = true;
  const avisados: Record<string, boolean> = {};
  let G: T3 = null, idsT: Uint32Array | null = null, teselas: TeselaOlivos[] = [], marcas = new Uint8Array(copas.length), deCerca: number[] = [], tipoG: Int16Array | null = null, nombres: Record<string, string | null> | null = null, visPuesta: boolean | null = null;
  function avisa(s: string): void { if (avisados[s]) return; avisados[s] = true; if (consola) consola.warn("olivos del tileset: " + s); }
  function retira(T: TeselaOlivos): void {   // fuera de la escena y liberadas (si la tesela sigue cargada; las de una tesela que descarga la librería, las libera ella)
    T.mallas.forEach(function (o: T3) { o.removeFromParent(); o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m: T3) { m.dispose(); }); o.dispose(); });
    T.mallas = []; T.masc = []; T.hecha = false;
  }
  function apaga(porque: string, callado?: boolean): void {
    if (estado === "sin" || estado === "apagado") return;
    estado = "sin"; motivo = porque; if (!callado) avisa(porque + " (los olivos los dibuja el motor como siempre)");
    teselas.forEach(retira); teselas = [];
  }
  function descarta(T: TeselaOlivos, porque: string): void { avisa(porque); retira(T); teselas = teselas.filter(function (x) { return x !== T; }); }

  // ----- ganchos de Escena3D
  function alRaiz(ts: T3): void {   // load-root-tileset
    if (estado !== "esperando") return;
    G = ts && ts.extras && ts.extras.gemelo;
    if (!G || G.contrato_tileset !== 2) return apaga("el tileset no trae el contrato tileset v2");
    // L4-14: además de la huella, el tileset dice de qué contrato de datos y en qué sistema de referencia salió; si no casan, no se resuelve nada
    if (G.contrato_origen !== D.v) return apaga("el tileset sale del contrato de datos v" + G.contrato_origen + " y el índice es v" + D.v);
    if (G.srs !== "EPSG:25830") return apaga("el tileset no está en EPSG:25830 (" + G.srs + ")");
    if (G.id_fuente === "copas_id" && !D.copas_id) return apaga("el tileset identifica por copas_id y el json no lo trae");
    if (G.id_fuente !== "copas_id" && D.copas_id) return apaga("el tileset identifica por índice y el json trae copas_id");
    idsT = IdTiles.ids(copas.length, G.id_fuente === "copas_id" ? D.copas_id : null);
    nombres = G.tipos || { "-1": null }; tipoG = new Int16Array(copas.length).fill(-1);
    if (!subtle) {
      porHuella = false; estado = "activo";
      avisa("sin crypto.subtle (¿contexto no seguro?): no se comprueban las huellas y los olivos se resuelven solo por el índice");
      teselas.forEach(prepara); return;
    }
    estado = "comprobando";
    IdTiles.huella(idsT, subtle).then(function (h) {
      if (estado !== "comprobando") return;
      if (h !== G.huella_registro) return apaga("la huella del registro no es la del tileset: el json no es del que salió");
      estado = "activo"; teselas.forEach(prepara);
    }, function (e: Error) { apaga("no se pudo calcular la huella del registro: " + (e && e.message || e)); });
  }
  function alModelo(raizM: T3, tile: T3): boolean {   // load-model: true = este módulo se queda con los olivos del glb; false = Escena3D los retira
    if (estado === "apagado" || estado === "sin") return false;
    const mallas: T3[] = [];
    raizM.traverse(function (o: T3) { if (o.isInstancedMesh && o.geometry.getAttribute("_INDICE_COPA")) mallas.push(o); });
    if (!mallas.length) return false;
    const e = tile && tile.extras && tile.extras.gemelo;
    if (!e || !e.cuadro) { avisa("tesela con olivos sin extras.gemelo (" + (tile && tile.content && tile.content.uri) + "): se retiran"); return false; }
    const T: TeselaOlivos = { tile, raizM, uri: tile.content && tile.content.uri, e, mallas, masc: [], hecha: false, fuera: false };
    mallas.forEach(function (m) { m.visible = false; });   // hasta comprobar su huella
    teselas.push(T);
    if (estado === "activo") prepara(T);
    return true;
  }
  function alSoltar(raizM: T3): void {   // dispose-model: la librería libera geometría y materiales; aquí solo se olvida la tesela
    teselas = teselas.filter(function (T) { if (T.raizM !== raizM) return true; T.fuera = true; return false; });
  }
  function prepara(T: TeselaOlivos): void {
    const lst = IdTiles.copasDe(copas, T.e.cuadro);
    if (lst.length !== T.e.olivos) return descarta(T, T.uri + ": las copas rehechas desde el json son " + lst.length + " olivos y la tesela trae " + T.e.olivos);
    if (T.mallas.some(function (m) { return m.count !== lst.length; })) return descarta(T, T.uri + ": instancias distintas de extras.gemelo.olivos");
    (porHuella ? IdTiles.huella(IdTiles.de(idsT as Uint32Array, lst), subtle as Subtle) : Promise.resolve(null)).then(function (h) {
      if (T.fuera || estado !== "activo" || !T.mallas.length) return;
      if (porHuella && h !== T.e.huella) return descarta(T, T.uri + ": su huella no es la de sus copas en el json; sus olivos no se resuelven");
      T.mallas.forEach(function (m) {
        m.computeBoundingSphere();   // con todas las instancias, antes de apartar ninguna (three la calcula una vez)
        const gm = m.geometry, ix = gm.getAttribute("_INDICE_COPA"), tp = gm.getAttribute("_TIPO"), attrs: AtributoInstancia[] = [{ array: m.instanceMatrix.array, size: 16, a: m.instanceMatrix }];
        if (m.instanceColor) attrs.push({ array: m.instanceColor.array, size: m.instanceColor.itemSize, a: m.instanceColor });
        Object.keys(gm.attributes).forEach(function (k) { const a = gm.attributes[k]; if (a.isInstancedBufferAttribute) attrs.push({ array: a.array, size: a.itemSize, a: a }); });
        const M = IdTiles.Mascara(ix.array.slice(0, m.count), lst, attrs);
        if (tp && tipoG) for (let i = 0; i < M.n; i++) { const g = M.gDe[i] as number; if (g >= 0) tipoG[g] = tp.array[i]; }
        T.masc.push({ m, M, attrs });
      });
      T.hecha = true; repartirT(T); visPuesta = null;
    }, function (e: Error) { descarta(T, T.uri + ": " + (e && e.message || e)); });
  }
  function repartirT(T: TeselaOlivos): void {
    T.masc.forEach(function (x) {
      const nv = x.M.reparte(marcas); if (nv < 0) return;
      x.m.count = nv; x.attrs.forEach(function (a) { (a.a as { needsUpdate: boolean }).needsUpdate = true; });
    });
  }

  // ----- de 07b_arboles.js (reclasifica): los índices g de copas[] que el motor dibuja de cerca (su detalle visible y los generados)
  function cerca(lst: readonly number[]): void {
    let i: number;
    for (i = 0; i < deCerca.length; i++) marcas[deCerca[i] as number] = 0;
    for (i = 0; i < lst.length; i++) marcas[lst[i] as number] = 1;
    deCerca = lst.slice();
    teselas.forEach(function (T) { if (T.hecha) repartirT(T); });
  }
  // cada fotograma (desde Escena3D): las mallas del tileset solo se ven si se ven los árboles del motor (no en los modos Ortofoto ni Nube)
  function fotograma(): void {
    const v = estado === "activo" && d.gArboles.visible; if (v === visPuesta) return; visPuesta = v;
    teselas.forEach(function (T) { T.mallas.forEach(function (m) { m.visible = v && T.hecha; }); });
  }
  /** triángulos de olivo que el tileset manda a dibujar (instancias no apartadas de las mallas visibles de teselas visibles) */
  function triangulos(): number {
    if (estado !== "activo") return 0;
    let t = 0;
    teselas.forEach(function (T) {
      if (!T.hecha || (T.tile.traversal && !T.tile.traversal.visible)) return;
      T.masc.forEach(function (x) { if (!x.m.visible) return; const g = x.m.geometry, n = g.index ? g.index.count : g.getAttribute("position").count; t += x.m.count * n / 3; });
    });
    return t;
  }
  function resumen() {
    let inst = 0, vis = 0, hechas = 0;
    teselas.forEach(function (T) { if (T.hecha) hechas++; T.masc.forEach(function (x) { inst += x.M.n; vis += x.m.count; }); });
    return { estado, motivo, porHuella, teselas: teselas.length, hechas, instancias: inst, dibujadas: vis, apartadas: inst - vis, cerca: deCerca.length, triangulos: triangulos(), catalogo: G && G.catalogo_tipos || null };
  }
  /** _TIPO del olivo g (número local del tileset) y su nombre de catálogo (null = sin asignar); null si ninguna tesela cargada lo trajo todavía */
  function tipo(g: number): { n: number; nombre: string | null } | null { if (!tipoG || !nombres || g < 0 || g >= tipoG.length) return null; const n = tipoG[g] as number, nm = nombres[String(n)]; return { n, nombre: nm === undefined ? null : nm }; }
  function tipos(): { catalogo: unknown; nombres: Record<string, string | null> } | null { return nombres ? { catalogo: G.catalogo_tipos, nombres: JSON.parse(JSON.stringify(nombres)) } : null; }
  /** pruebas: en qué teselas cargadas está el olivo g y si está apartado en cada una */
  function instanciasDe(g: number): { uri: string | undefined; apartado: boolean; visible: boolean }[] {
    const r: { uri: string | undefined; apartado: boolean; visible: boolean }[] = [];
    teselas.forEach(function (T) { T.masc.forEach(function (x) { const o = x.M.apartadoG(g); if (o !== null) r.push({ uri: T.uri, apartado: o, visible: x.m.visible }); }); });
    return r;
  }
  /** Lo que suelta el componente al apagarse (MU5): las mallas de olivo de cada tesela cargada (quitadas de la escena y con su geometría y su material
   *  liberados), la máscara y las marcas de los olivos de cerca, los ids y los tipos; y se desengancha de Escena3D (con él, las teselas que lleguen después
   *  pierden sus olivos instanciados, como si 04c no existiera). Los glb en sí, con sus ImageBitmap, los libera la librería de 3D Tiles. Se puede llamar dos veces. */
  function libera(): void {
    if (estado === "apagado") return;
    teselas.forEach(retira); teselas = [];
    Escena3D.engancha({ alRaiz: null, alModelo: null, alSoltar: null, alApagar: null, fotograma: null });
    estado = "apagado"; motivo = "liberado"; G = null; idsT = null; tipoG = null; nombres = null; visPuesta = null; deCerca = []; marcas = new Uint8Array(copas.length);
  }

  if (estado === "esperando") Escena3D.engancha({ alRaiz, alModelo, alSoltar, alApagar: function (m) { apaga(m, true); }, fotograma });
  return { dibuja: function () { return estado === "activo"; }, cerca, triangulos, resumen, tipo, tipos, instanciasDe, libera };
}
export type OlivosTiles = ReturnType<typeof creaOlivosTiles>;

/** El manifiesto del componente «olivos-tiles»: el ciclo de vida de los olivos del tileset. El objeto que 07b y Escena3D usan es el mismo que monta (lo crea el legado al
 *  cargarse y se le da aquí, para que lo tengan desde el primer fotograma y no dependan de cuándo se monte el componente). */
export function manifiestoOlivosTiles(olivos: OlivosTiles): Manifiesto {
  return {
    id: "olivos-tiles", version: 1,
    consume: ["D", "copas", "Escena3D", "gArboles"],
    expone: [],
    eventos: { escucha: [], emite: [] },
    bandera: { defecto: true },
    presupuesto: { llamadas: 0, triangulos: 0 },   // los olivos del tileset los dibuja la librería con sus teselas: su coste entra en el del tileset (triangulos() los cuenta para el tope de 07b)
    mundos: ["exterior"],
    monta: function () { return olivos; },
    libera: function (api) { if (api) (api as OlivosTiles).libera(); }
  };
}

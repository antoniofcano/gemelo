// El presupuesto de VR por escalón y el controlador de nivel (antes apps/web/motor/02g_vr_presupuesto.js; MUNDOS §9.4, pieza 3).
// Nada de aquí lee globales al cargarse: lo que necesita del legado (la ventana, para window.__vrPresupuesto) entra por argumento de
// creaVrPresupuesto({ ventana }). El legado lo ve por el talón 02g: VrPresupuestoPuro, VrControlPuro y VrPresupuesto.

// ---------- Q0c-a: el escalón de los perfiles de 29_vr manda también en lo que el perfil no tocaba (doc/sistema/VR.md#perfil-de-rendimiento-vr).
// Medido en un Quest (MEDIDAS.md, 2026-11-04): en el escalón 3, 1,43 M triángulos por fotograma y p95 de 23 ms; el desglose de Hituelo real dice que
// lo que más pesa no lo tocaba el perfil (anillos de OlivarTrack, árboles del paisaje, octaedros del LiDAR, fondo del relieve, manchas de sombra).
// Aquí viven los escalones (VrPresupuestoPuro.ESCALONES, una fila por perfil de 29_vr) y UN punto que los pone: 29_vr llama a VrPresupuesto.ponEscalon(n)
// al cambiar de perfil y ponEscalon(null) al salir. Cada fuente se apunta desde su módulo:
//   VrPresupuesto.fuente(id, fn)          fn(valor) recibe el valor de su fila al cambiar (sombras: sí/no; sueloFondo: celdas por lado)
//   VrPresupuesto.instancias(id, mallas)  InstancedMesh que comparten índice (p. ej. el pie y tres masas de copa): se recortan por distancia a la cabeza
//   VrPresupuesto.renueva(id)             el módulo acaba de escribir TODAS sus instancias (cambió la exageración): se toma de nuevo la copia y se recorta
//   VrPresupuesto.olvida(id)              el módulo se libera
//   VrPresupuesto.mueve(x, z)             29_vr, cada fotograma en VR: solo una resta y una comparación; recorta de nuevo al pasar del umbral (≥ 15 m)
// Regla 5: lo deducido e ilustrativo cae antes que lo medido; los octaedros del LiDAR solo se recortan en el último escalón y el relieve (teselas, fondo
// del relieve) nunca se apaga, solo se pide más grueso. Fuera de VR (ponEscalon(null)) todo vuelve a como estaba y, si nunca se entró, nada se toca.
// Los radios y las celdas son de partida, SIN medir en las gafas (como los e de los perfiles de 29_vr): se ajustan con la perilla del escalón fijo (xrnivel) y la medida de 60 s (debug, mide) en el Quest.

export type ClaveFuente = "arbolesPaisaje" | "sombras" | "marcasOT" | "copasLidar" | "sueloFondo";
/** el valor de una fuente en un escalón: metros (null = todas), sí/no, o celdas por lado */
export type ValorFuente = number | boolean | null;
export interface Fuente { que: "radio" | "si" | "celdas"; clase: string; base: ValorFuente; modulo: string; texto: string }
export type Reparto = Record<ClaveFuente, ValorFuente>;

// que: «radio» (metros alrededor de la cabeza; null = todas), «si» (se dibuja o no), «celdas» (lado de la rejilla); base: el valor fuera de VR
const FUENTES: Record<ClaveFuente, Fuente> = {
  arbolesPaisaje: { que: "radio", clase: "deducido", base: null, modulo: "18_paisaje", texto: "árboles que no son olivo: clasificación deducida, forma ilustrativa" },
  sombras: { que: "si", clase: "ilustrativo", base: true, modulo: "07_follaje", texto: "manchas de sombra (olivos, paisaje, fauna y perros)" },
  marcasOT: { que: "radio", clase: "registro", base: null, modulo: "08b_marcadores_lidar", texto: "anillos de los olivos guardados en OlivarTrack" },
  copasLidar: { que: "radio", clase: "medido", base: null, modulo: "08b_marcadores_lidar", texto: "octaedros de cada copa detectada en el LiDAR" },
  sueloFondo: { que: "celdas", clase: "medido", base: 128, modulo: "04e_suelo_fondo", texto: "fondo del relieve: el mismo relieve grueso medido, con menos celdas" }
};
const ORDEN: ClaveFuente[] = ["arbolesPaisaje", "sombras", "marcasOT", "copasLidar", "sueloFondo"];   // de lo primero que se sacrifica a lo último
const ESCALONES: Reparto[] = [
  { arbolesPaisaje: null, sombras: true, marcasOT: null, copasLidar: null, sueloFondo: 128 },   // 0: como en pantalla
  { arbolesPaisaje: 400, sombras: true, marcasOT: 300, copasLidar: null, sueloFondo: 128 },
  { arbolesPaisaje: 200, sombras: false, marcasOT: 180, copasLidar: null, sueloFondo: 128 },
  { arbolesPaisaje: 120, sombras: false, marcasOT: 100, copasLidar: 250, sueloFondo: 64 }
];
const PASO_MIN = 15;   // m que hay que moverse para volver a recortar (y nunca menos de un cuarto del radio más corto)

function base(): Reparto { const o = {} as Reparto; ORDEN.forEach(function (k) { o[k] = FUENTES[k].base; }); return o; }
// la fila de un escalón (n fuera de los límites se recorta; null, undefined o no numérico = fuera de VR: la base)
function reparto(n: unknown): Reparto {
  if (n === null || n === undefined || typeof n !== "number" || !isFinite(n)) return base();
  const f = ESCALONES[Math.max(0, Math.min(ESCALONES.length - 1, Math.round(n)))] as Reparto, o = {} as Reparto;
  ORDEN.forEach(function (k) { o[k] = f[k]; }); return o;
}
// cuánto hay que moverse para recortar otra vez (null si nada va por radio)
function paso(rep: Partial<Record<ClaveFuente, ValorFuente | undefined>>): number | null {
  let m: number | null = null;
  ORDEN.forEach(function (k) { const v = rep[k]; if (FUENTES[k].que === "radio" && v !== null && v !== undefined) m = m === null ? (v as number) : Math.min(m, v as number); });
  return m === null ? null : Math.max(PASO_MIN, (m as number) / 4);
}
// las instancias de `mat` (16 números por instancia, la posición en 12 y 14) a ≤ r de (cx, cz): sus índices en `idx`, en orden; devuelve cuántas
function recorta(mat: ArrayLike<number>, n: number, cx: number, cz: number, r: number, idx: Int32Array): number {
  let k = 0;
  const r2 = r * r;
  for (let i = 0; i < n; i++) { const dx = (mat[i * 16 + 12] as number) - cx, dz = (mat[i * 16 + 14] as number) - cz; if (dx * dx + dz * dz <= r2) idx[k++] = i; }
  return k;
}
// el hundimiento del fondo con menos celdas: la rejilla más gruesa se separa más del relieve fino en las vaguadas, así que baja en proporción
function hundimiento(celdas: number, celdasBase: number, baja: number): number { return celdas >= celdasBase ? baja : baja * celdasBase / Math.max(1, celdas); }

export const VrPresupuestoPuro = { FUENTES, ORDEN, ESCALONES, PASO_MIN, base, reparto, paso, recorta, hundimiento };

// ---------- Q0c-b: el controlador de nivel de VR, con histéresis y umbrales por aparato (doc/sistema/VR.md#controlador-de-nivel-vr-q0c-b).
// Medido en un Quest 3 (MEDIDAS.md, 2026-11-04): p95 de JS de 10-12 ms y el nivel oscilaba 0→3→2→3 porque bajaba con 8 ms y subía con 7 (1 ms de margen).
// Ahora baja cuando el JS (media móvil) pasa de `baja`, y solo SUBE cuando está por debajo de `sube` (mucho más abajo) durante `estable` segundos seguidos.
// Los umbrales salen de una tabla por casco (el modelo lo da Aparato.modelo(), del user agent); sin modelo conocido, la fila «defecto». La URL manda
// sobre la tabla: ?xrjs (baja, ya existía), ?xrjssube y ?xrestable (02f). NINGUNA cifra de esta tabla está calibrada en el casco: la de «quest-3» es la
// de AG-2.3 más la histéresis de Q0c-b (hipótesis, a medir); las demás filas son [SUPUESTO] (no hay medida de ese casco en MEDIDAS.md) y valen lo mismo que el defecto.

export interface FilaAparato { baja: number; sube: number; supuesto: boolean; base: string }
export interface Umbrales { baja: number; sube: number; estable: number; fila: string; supuesto: boolean; base: string }
/** el estado del controlador (el VRX de 29_vr): lo escribe decide, sin reservas */
export interface EstadoControl { emaDt: number; emaJs: number; tNivel: number; tEstable: number }

const DEF = { baja: 8, sube: 5, estable: 10, dtBaja: 15.2, dtSube: 14.4, guarda: 4, margen: 1 };   // ms de JS · ms de JS · s · ms de fotograma · ms de fotograma · s tras un cambio · ms mínimos entre sube y baja
const APARATOS: Record<string, FilaAparato> = {
  defecto: { baja: 8, sube: 5, supuesto: false, base: "AG-2.3 (8 ms) + histéresis de Q0c-b; sin casco conocido" },
  "quest-3": { baja: 8, sube: 5, supuesto: false, base: "MEDIDAS.md, Quest 3 (2026-11-04): p95 de JS 10-12 ms; los umbrales siguen sin calibrar" },
  "quest-3s": { baja: 8, sube: 5, supuesto: true, base: "[SUPUESTO] mismo SoC que el Quest 3; sin medida propia" },
  "quest-2": { baja: 8, sube: 5, supuesto: true, base: "[SUPUESTO] sin medida de este casco (CPU más lenta que la del Quest 3: probablemente necesite más holgura)" },
  "quest-pro": { baja: 8, sube: 5, supuesto: true, base: "[SUPUESTO] sin medida de este casco" }
};
// → { baja, sube, estable, fila, supuesto, base } (una copia; `modelo` es Aparato.modelo(): «quest-3», …, o «» / otra cosa = defecto)
function umbrales(modelo: unknown): Umbrales {
  const f = Object.prototype.hasOwnProperty.call(APARATOS, modelo as PropertyKey) ? (modelo as string) : "defecto", a = APARATOS[f] as FilaAparato;
  return { baja: a.baja, sube: a.sube, estable: DEF.estable, fila: f, supuesto: a.supuesto, base: a.base };
}
// el estado vive en `e` ({ emaDt, emaJs, tNivel, tEstable }, el VRX de 29_vr): SIN reservas, se llama cada fotograma en VR.
// Devuelve +1 (bajar un nivel), -1 (subir) o 0. `fijo`: nivel fijado por la URL, solo se actualizan las medias.
// Q0c-c: `suelo` (opcional, 0 si falta) es el nivel mínimo que pide la gente a la vista (sueloGente): por debajo de él se baja ya, sin esperar al JS, y no se sube
function decide(e: EstadoControl, dtMs: number, jsMs: number, dt: number, nivel: number, maxNivel: number, baja: number, sube: number, estable: number, fijo: boolean, suelo?: number): number {
  e.emaDt += (dtMs - e.emaDt) * 0.05; e.emaJs += (jsMs - e.emaJs) * 0.05; e.tNivel += dt;
  const s = sube > baja - DEF.margen ? baja - DEF.margen : sube;   // la subida nunca queda a menos de `margen` de la bajada
  if (e.emaJs < s && e.emaDt < DEF.dtSube) e.tEstable += dt; else e.tEstable = 0;
  if (fijo) return 0;
  if (e.tNivel < DEF.guarda) return 0;
  const s0 = suelo as number, sg = s0 > 0 ? Math.min(s0 | 0, maxNivel) : 0;
  if (nivel < sg) { e.tNivel = 0; e.tEstable = 0; return 1; }   // la gente a la vista pide bajar un escalón con antelación (un nivel por vez, con la misma guarda)
  if ((e.emaJs > baja || e.emaDt > DEF.dtBaja) && nivel < maxNivel) { e.tNivel = 0; e.tEstable = 0; return 1; }
  if (nivel > sg && e.tEstable >= estable) { e.tNivel = 0; e.tEstable = 0; return -1; }
  return 0;
}
// Q0c-c: el nivel mínimo que pide la gente. 0 con pocas personas; 1 (UN escalón de antelación, no más) si hay más de `n` a la vista. Con histéresis: una vez pedido,
// sigue hasta que baje a `n - SALIDA_GENTE` o menos, para que alguien en el borde del campo de visión no haga subir y bajar el nivel. Sin gente (0 personas) siempre 0.
const SALIDA_GENTE = 2, ESCALON_GENTE = 1;   // [PROPUESTA] personas de histéresis · escalones de antelación
function sueloGente(vistos: number, n: number, previo: number): number {
  if (!(vistos > 0) || !(n > 0)) return 0;
  if (vistos > n) return ESCALON_GENTE;
  return previo > 0 && vistos > n - SALIDA_GENTE ? ESCALON_GENTE : 0;
}

export const VrControlPuro = { DEF, APARATOS, SALIDA_GENTE, ESCALON_GENTE, umbrales, decide, sueloGente };

// ---------- VrPresupuesto: el que pone el escalón (fuentes de valor y mallas instanciadas recortadas por distancia a la cabeza)

/** lo que se usa de un THREE.InstancedMesh (sin importar three: el núcleo no depende del renderer) */
export interface MallaInstanciada {
  instanceMatrix: { array: Float32Array; count: number; needsUpdate: boolean };
  instanceColor: { array: Float32Array; needsUpdate: boolean } | null;
  visible: boolean;
  count: number;
  frustumCulled: boolean;
  computeBoundingSphere(): void;
}
interface Copia { m: MallaInstanciada; mat: Float32Array; col: Float32Array | null; vis: boolean }
interface FuenteValor { tipo: "valor"; fn: (v: ValorFuente | undefined) => void; puesto: ValorFuente | undefined }
interface FuenteInst { tipo: "inst"; copias: Copia[]; n: number; idx: Int32Array; r: number | null; k: number }
type FuenteApuntada = FuenteValor | FuenteInst;

export interface OpcionesVrPresupuesto {
  /** donde se publica `__vrPresupuesto` (el estado, para las pruebas y el banco); en el legado, `window`; sin ella, no se publica */
  ventana?: { __vrPresupuesto?: unknown } | null;
}

export function creaVrPresupuesto(opc?: OpcionesVrPresupuesto | null) {
  const P = VrPresupuestoPuro, F: Record<string, FuenteApuntada> = {}, cuenta = { cambios: 0, recortes: 0 };
  let rep: Record<string, ValorFuente | undefined> = P.base(), escalon: number | null = null, cx = NaN, cz = NaN, pasoM: number | null = null, gente = 0, sueloG = 0;
  function copia(m: MallaInstanciada): Copia { return { m: m, mat: new Float32Array(m.instanceMatrix.array), col: m.instanceColor ? new Float32Array(m.instanceColor.array) : null, vis: m.visible }; }
  function marcaSubida(m: MallaInstanciada, k: number): void { m.count = k; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; if (m.frustumCulled !== false && k > 0) m.computeBoundingSphere(); }
  function restaura(f: FuenteInst): void {
    f.copias.forEach(function (c) { c.m.instanceMatrix.array.set(c.mat); if (c.col && c.m.instanceColor) c.m.instanceColor.array.set(c.col); c.m.visible = c.vis; marcaSubida(c.m, f.n); });
    f.r = null;
  }
  function recortaInst(f: FuenteInst, r: number): void {   // por un suceso (cambio de escalón o paso de umbral), no por fotograma
    const c0 = f.copias[0] as Copia, k = P.recorta(c0.mat, f.n, cx, cz, r, f.idx);
    for (let j = 0; j < f.copias.length; j++) {
      const c = f.copias[j] as Copia, a = c.m.instanceMatrix.array, ac = c.col && c.m.instanceColor ? c.m.instanceColor.array : null;
      for (let q = 0; q < k; q++) {
        const i = f.idx[q] as number;
        let s: number, d: number;
        for (s = i * 16, d = q * 16; s < i * 16 + 16; s++, d++) a[d] = c.mat[s] as number;
        if (ac && c.col) for (s = i * 3, d = q * 3; s < i * 3 + 3; s++, d++) ac[d] = c.col[s] as number;
      }
      c.m.visible = c.vis && k > 0; marcaSubida(c.m, k);
    }
    f.r = r; f.k = k; cuenta.recortes++;
  }
  function aplicaUna(id: string): void {
    const f = F[id]; if (!f) return; const v = rep[id];
    if (f.tipo === "valor") { if (f.puesto !== v) { f.puesto = v; f.fn(v); } return; }
    if (v === null || v === undefined) { if (f.r !== null) restaura(f); return; }
    if (!isFinite(cx)) return;   // aún no se sabe dónde está la cabeza: lo hará el siguiente mueve
    recortaInst(f, v as number);
  }
  function aplicaTodo(): void { P.ORDEN.forEach(aplicaUna); }
  // una fuente de valor: fn(valor) solo cuando su valor cambia; al apuntarse dentro de VR recibe ya el de su escalón
  function fuente(id: string, fn: (v: ValorFuente | undefined) => void): void { F[id] = { tipo: "valor", fn: fn, puesto: Object.prototype.hasOwnProperty.call(P.FUENTES, id) ? P.FUENTES[id as ClaveFuente].base : undefined }; aplicaUna(id); }
  // mallas instanciadas que comparten índice: la de delante da la posición. Los colores por instancia se copian al apuntarse (no cambian después)
  function instancias(id: string, mallas: MallaInstanciada[]): void {
    const n = (mallas[0] as MallaInstanciada).instanceMatrix.count;
    F[id] = { tipo: "inst", copias: mallas.map(copia), n: n, idx: new Int32Array(Math.max(1, n)), r: null, k: n };
    aplicaUna(id);
  }
  function renueva(id: string): void {
    const f = F[id]; if (!f || f.tipo !== "inst") return;
    f.copias.forEach(function (c) { c.mat.set(c.m.instanceMatrix.array); });   // el módulo acaba de escribir las n en su orden
    if (f.r !== null) { f.copias.forEach(function (c) { c.m.count = f.n; }); const r = f.r; f.r = null; if (isFinite(cx)) recortaInst(f, r); else restaura(f); }
  }
  function olvida(id: string): void { delete F[id]; }
  function fijaEscalon(n: number | null | undefined): void {
    const fuera = n === null || n === undefined;
    escalon = fuera ? null : Math.max(0, Math.min(P.ESCALONES.length - 1, (n as number) | 0));
    rep = P.reparto(escalon); pasoM = P.paso(rep); if (fuera) { cx = NaN; cz = NaN; }
    cuenta.cambios++;
  }
  function ponEscalon(n: number | null | undefined): void { fijaEscalon(n); aplicaTodo(); if (n === null || n === undefined) { gente = 0; sueloG = 0; } }   // al salir de VR, la gente que se contó ya no vale
  // Q0c-c: las personas a la vista (26b_avatares.js lo anota cada medio segundo, solo en VR) y el nivel mínimo que piden (sueloGente, con histéresis). Sin reservas
  function ponGente(n: number): void { gente = n > 0 ? n | 0 : 0; }
  function suelo(umbral: number): number { sueloG = VrControlPuro.sueloGente(gente, umbral, sueloG); return sueloG; }
  // Q0c-b: lo mismo, repartido: una fuente por paso (la Cola de 29_vr lo avanza con yield, no de golpe). Cancelado a medias, el siguiente ponEscalon o escalonPorPasos acaba lo que falte
  function* escalonPorPasos(n: number | null | undefined): Generator<number, void, unknown> { fijaEscalon(n); for (let i = 0; i < P.ORDEN.length; i++) { aplicaUna(P.ORDEN[i] as string); yield i; } }
  // cada fotograma en VR (29_vr): sin reservas; solo recorta al moverse más que el umbral
  function mueve(x: number, z: number): void {
    if (pasoM === null) return;
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < pasoM * pasoM) return;   // con cx sin poner (NaN) la comparación es falsa: recorta esa vez
    cx = x; cz = z;
    for (let i = 0; i < P.ORDEN.length; i++) { const id = P.ORDEN[i] as string, f = F[id]; if (f && f.tipo === "inst") aplicaUna(id); }
  }
  function estado() {
    const o = { escalon: escalon, gente: gente, sueloGente: sueloG, reparto: rep, paso: pasoM, centro: isFinite(cx) ? [cx, cz] : null, cambios: cuenta.cambios, recortes: cuenta.recortes, fuentes: {} as Record<string, { valor: ValorFuente | undefined } | { radio: number | null; dibujadas: number; total: number }> };
    Object.keys(F).forEach(function (id) { const f = F[id] as FuenteApuntada; o.fuentes[id] = f.tipo === "valor" ? { valor: f.puesto } : { radio: f.r, dibujadas: f.r === null ? f.n : f.k, total: f.n }; });
    return o;
  }
  if (opc && opc.ventana) opc.ventana.__vrPresupuesto = estado;   // pruebas y banco (escalón fijo por la perilla xrnivel, con la VR simulada)
  return { fuente, instancias, renueva, olvida, ponEscalon, ponGente, suelo, escalonPorPasos, mueve, estado };
}

export type VrPresupuesto = ReturnType<typeof creaVrPresupuesto>;

// La linde de las hazas en el mundo (A4, el «3c»; ADR-0014, decisiones 12, 13, 95 y 139; MU5-n, A3-3: antes apps/web/motor/44_lindes.js, que queda como talón): la de las tuyas
// destacada (ámbar, gruesa, opaca), las de los demás hogares discretas (blanco roto, fina, medio transparente), pegadas al relieve. La linde es un DATO DIBUJADO POR LA OFICINA
// (decisión 12): un límite de gestión, no un deslinde ni una medida; la ficha de la haza (13b_hazas.js) lo dice. Las hazas las trae 13b_hazas.js de la api (Hazas.lindes()
// y el evento «hazas:cambia»); sin servidor o sin hazas, este componente no crea nada.
// Es un COMPONENTE «lindes-hazas» (ADR-0023) de los mundos ["exterior"]: se registra y nadie lo nombra. ?lindes=0 (o la configuración del servidor) lo apaga: las hazas siguen
// (ficha, H, minimapa), sin dibujo en el mundo ni en el minimapa. La casilla «Linde» del menú lo enciende y apaga a la vista (cuelga de gLinde).
//
// Técnica (regla 12: la de three): LineSegments2 + LineSegmentsGeometry + LineMaterial de three 0.186.1 (three/addons/lines), pedidos con import() al montarse (en el talón:
// aquí entran por cargaLib). Cada tramo es una instancia de 6 triángulos dibujada en espacio de pantalla con el ancho en píxeles: igual de legible de cerca que de lejos, en
// WebGL2 y en las gafas, sin depender de gl.lineWidth (que en WebGL vale 1). UNA llamada para las propias y OTRA para las ajenas (2 en total).
// Pegada al relieve: cada lado se parte en tramos de ≤ PASO_MIN m y, además, en cada borde de tesela (256 m), así que ningún tramo cruza de una tesela a otra
// y cada vértice se sienta en el relieve de la CPU (suelo(), el mismo que usan la llegada y las balizas) a ALTURA m × exag. Al llegar relieve fino
// (Mundo.alCargar) o al cambiar la exageración se reescriben las posiciones en el mismo búfer (fase «tarde», cada 0,5 s), sin crear memoria.
// Sin parpadeo: no es coplanaria con el suelo (va ALTURA m por encima) y, además, el sombreador acerca cada vértice a la cámara una fracción de su distancia
// (ESTILO.acerca: 0,4 % la propia, 0,2 % las ajenas) escalando su posición de cámara; eso no mueve nada en pantalla, solo la profundidad, y absorbe la
// diferencia entre el relieve de la CPU y el del tileset a cualquier distancia (a 500 m, 2 m). La propia, más acercada, gana a la ajena donde coinciden;
// los lados comunes (misma clave, a 1 cm) se dibujan una sola vez y, si uno es de una haza tuya, como propio.
// Presupuesto (regla 6): 2 llamadas; 6 triángulos por tramo: 3 por metro de linde con el paso de 2 m más 6 por cada corte de tesela o vértice; tope de
// MAX_SEG tramos (48.000 triángulos): con más linde, el paso crece hasta caber y, si ni así, se recortan primero las ajenas (estado().recortado).
// También pinta las hazas en el minimapa (A4b, Minimapa.capa, la casilla «Linde» las apaga). Lee Hazas.lindes() al oír «hazas:cambia»; da su línea de ?debug por «depura:lineas».
// Publica window.__lindes (pruebas).
//
// Del legado recibe por argumento lo que necesita (THREE, el Mundo, el suelo, las hazas, el minimapa, la fábrica de materiales…); no lee globales. Mismo comportamiento que
// antes, sin cambio visible.
import type { ContextoComponente, Manifiesto } from "../../nucleo/componentes.ts";
import type { DefMaterial, Materiales, MaterialMin } from "../../nucleo/materiales.ts";

// three no trae tipos en el repo (como en suelo-fondo.ts): de él solo se toca lo mínimo, sin tiparlo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T3 = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cualquiera = any;

export const ID_LINDES = "lindes-hazas";
type Punto = number[];
type Lado = Punto[];
type Anillo = Punto[];
interface HazaLinde { id?: number | string; codigo?: string; es_mia?: boolean; anillos?: Anillo[] }

// LindesPuro: sin DOM ni THREE (lo prueba en Node pruebas/guardianes/lindes.test.js y lindes.test.ts)
export const LindesPuro = (function () {
  const TRI_SEG = 6, PASO_MIN = 2, MAX_SEG = 8000, ALTURA = 0.2, VR_ANCHO = 1.5, EPS_T = 1e-9, JUNTA = 1e-3;
  // colores tal como se ven (sRGB; THREE.Color los pasa a lineal), ancho en píxeles CSS (en VR, × VR_ANCHO en píxeles del ojo) y acercamiento de profundidad
  const ESTILO = {
    propia: { color: 0xffb020, ancho: 4, opacidad: 1, acerca: 0.004 },
    ajena: { color: 0xe8ecf0, ancho: 2, opacidad: 0.6, acerca: 0.002 }
  };
  function largo(a: Punto, b: Punto): number { return Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!); }
  function clave(a: Punto, b: Punto): string {   // el lado sin sentido, a 1 cm: dos hazas que comparten lado lo dan con los mismos vértices (la oficina ajusta a vecinas)
    const p = Math.round(a[0]! * 100) + "," + Math.round(a[1]! * 100), q = Math.round(b[0]! * 100) + "," + Math.round(b[1]! * 100);
    return p < q ? p + "|" + q : q + "|" + p;
  }
  // hs: [{ es_mia, anillos: [[[x, y]…]…] }] (locales) → { propia: [[a, b]…], ajena: [[a, b]…] }: cada lado una vez (el de una haza tuya, como propio);
  // los anillos sin cerrar se cierran; los lados de menos de 1 mm se saltan
  function lados(hs: HazaLinde[] | null | undefined): { propia: Lado[]; ajena: Lado[] } {
    const visto: Record<string, boolean> = {}, out: { propia: Lado[]; ajena: Lado[] } = { propia: [], ajena: [] };
    [true, false].forEach(function (mia) {
      (hs || []).forEach(function (h) {
        if (!!h.es_mia !== mia) return;
        (h.anillos || []).forEach(function (an) {
          if (!an || an.length < 2) return;
          const n = an.length, cerrado = an[0]![0] === an[n - 1]![0] && an[0]![1] === an[n - 1]![1];
          for (let i = 0; i < (cerrado ? n - 1 : n); i++) {
            const a = an[i]!, b = an[(i + 1) % n]!;
            if (largo(a, b) < JUNTA) continue;
            const k = clave(a, b); if (visto[k]) continue; visto[k] = true;
            out[mia ? "propia" : "ajena"].push([a, b]);
          }
        });
      });
    });
    return out;
  }
  // los cortes de un lado a → b: parámetros t ∈ [0, 1] (0 y 1 incluidos, crecientes) con tramos de ≤ paso m y un corte en cada borde de tesela
  // (múltiplos de TS en UTM: x + ox, y + oy; ox, oy = centro_utm). Dos cortes a menos de 1 mm se funden.
  function cortes(a: Punto, b: Punto, paso: number, TS: number, ox: number, oy: number): number[] {
    const L = largo(a, b), m = Math.max(1, Math.ceil(L / paso - EPS_T)), ts: number[] = [];
    for (let s = 0; s <= m; s++) ts.push(s / m);
    if (TS > 0) {
      [[a[0]! + ox, b[0]! + ox], [a[1]! + oy, b[1]! + oy]].forEach(function (u) {
        if (u[0] === u[1]) return;
        const lo = Math.min(u[0]!, u[1]!), hi = Math.max(u[0]!, u[1]!);
        for (let g = Math.floor(lo / TS) + 1; g * TS < hi; g++) { const t = (g * TS - u[0]!) / (u[1]! - u[0]!); if (t > 0 && t < 1) ts.push(t); }
      });
      ts.sort(function (p, q) { return p - q; });
    }
    const out = [ts[0]!];
    for (let s = 1; s < ts.length; s++) if ((ts[s]! - out[out.length - 1]!) * L >= JUNTA) out.push(ts[s]!);
    if (out[out.length - 1] !== 1) out[out.length - 1] = 1;   // el último es siempre el final del lado (si se fundió con un corte de tesela a < 1 mm)
    return out;
  }
  function tramos(ls: Lado[], paso: number, TS: number, ox: number, oy: number): number { let n = 0; for (let i = 0; i < ls.length; i++) n += cortes(ls[i]![0]!, ls[i]![1]!, paso, TS, ox, oy).length - 1; return n; }
  function longitud(ls: Lado[]): number { let L = 0; for (let i = 0; i < ls.length; i++) L += largo(ls[i]![0]!, ls[i]![1]!); return L; }
  // el plan: el paso (≥ PASO_MIN) con el que todo cabe en maxSeg tramos y cuántos de cada grupo se dibujan (si ni con el paso más largo cabe, las ajenas
  // se recortan primero: las propias son las que importan). → { lados, paso, n: { propia, ajena }, total, recortado, longitud }
  function plan(hs: HazaLinde[], TS: number, ox: number, oy: number, maxSeg?: number) {
    const ls = lados(hs), todos = ls.propia.concat(ls.ajena), L = longitud(todos), max = maxSeg || MAX_SEG;
    let paso = Math.max(PASO_MIN, L / (max * 0.9)), np = tramos(ls.propia, paso, TS, ox, oy), na = tramos(ls.ajena, paso, TS, ox, oy), it = 0;
    while (np + na > max && it < 40) { paso *= 1.25; np = tramos(ls.propia, paso, TS, ox, oy); na = tramos(ls.ajena, paso, TS, ox, oy); it++; }
    const recortado = np + na > max;
    if (recortado) { np = Math.min(np, max); na = Math.max(0, max - np); }
    return { lados: ls, paso: paso, n: { propia: np, ajena: na } as Record<string, number>, total: np + na, recortado: recortado, longitud: L };
  }
  // las posiciones de los tramos de una lista de lados: (x, (suelo + alto) × exag, −y) del principio y del final de cada tramo, 6 números por tramo (el formato
  // de LineSegmentsGeometry.setPositions). limite: como mucho tantos tramos. pos: si tiene el largo justo, se reescribe (repegar sin crear memoria).
  function escribe(ls: Lado[], paso: number, TS: number, ox: number, oy: number, suelo: (x: number, y: number) => number, exag: number, alto: number, limite?: number, pos?: Float32Array) {
    const n = Math.min(tramos(ls, paso, TS, ox, oy), limite === undefined ? Infinity : limite); let k = 0;
    const out = pos && pos.length === n * 6 ? pos : new Float32Array(n * 6);
    function punto(x: number, y: number): void { out[k++] = x; out[k++] = (suelo(x, y) + alto) * exag; out[k++] = -y; }
    for (let i = 0; i < ls.length && k < n * 6; i++) {
      const a = ls[i]![0]!, b = ls[i]![1]!, ts = cortes(a, b, paso, TS, ox, oy), dx = b[0]! - a[0]!, dy = b[1]! - a[1]!;
      for (let s = 0; s + 1 < ts.length && k < n * 6; s++) { punto(a[0]! + dx * ts[s]!, a[1]! + dy * ts[s]!); punto(a[0]! + dx * ts[s + 1]!, a[1]! + dy * ts[s + 1]!); }
    }
    return { pos: out, n: n };
  }
  function triangulos(n: number): number { return TRI_SEG * n; }
  // ---- el minimapa (A4b): las mismas hazas como polígonos finos sobre el mapa 2D. Sin DOM: pintaMini recibe el contexto 2D (c) y las funciones X(este), Y(norte)
  const MINI = {
    propia: { trazo: "#ffb020", relleno: "rgba(255,176,32,0.12)" as string | null, ancho: 2, texto: "#ffb020" },
    ajena: { trazo: "rgba(232,236,240,0.6)", relleno: null as string | null, ancho: 1, texto: "rgba(232,236,240,0.6)" }
  };
  // el centro para el código: el centroide (por área) del anillo exterior más grande; la caja de todos los anillos, para saltar lo que cae fuera de la vista
  function miniLista(hs: HazaLinde[] | null | undefined) {
    const out: { id: HazaLinde["id"]; es_mia: boolean; codigo: string; anillos: Anillo[]; bb: number[]; cen: number[] }[] = [];
    (hs || []).forEach(function (h) {
      const anillos = (h.anillos || []).filter(function (an) { return an && an.length >= 3; });
      if (!anillos.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, mejor: number[] = [0, 0], ma = -1;
      anillos.forEach(function (an) {
        let A = 0, cx = 0, cy = 0; const n = an.length;
        for (let i = 0; i < n; i++) {
          const p = an[i]!, q = an[(i + 1) % n]!, w = p[0]! * q[1]! - q[0]! * p[1]!;
          A += w; cx += (p[0]! + q[0]!) * w; cy += (p[1]! + q[1]!) * w;
          if (p[0]! < x0) x0 = p[0]!; if (p[0]! > x1) x1 = p[0]!; if (p[1]! < y0) y0 = p[1]!; if (p[1]! > y1) y1 = p[1]!;
        }
        if (Math.abs(A) > ma) { ma = Math.abs(A); mejor = Math.abs(A) > 1e-9 ? [cx / (3 * A), cy / (3 * A)] : [an[0]![0]!, an[0]![1]!]; }
      });
      out.push({ id: h.id, es_mia: !!h.es_mia, codigo: typeof h.codigo === "string" ? h.codigo : "", anillos: anillos, bb: [x0, y0, x1, y1], cen: mejor });
    });
    return out;
  }
  // pinta la lista (las ajenas debajo, la tuya encima); vista = { MW, MH }: lo que cae fuera del mapa se salta. Devuelve cuántas dibujó (pruebas)
  function pintaMini(c: Cualquiera, X: (v: number) => number, Y: (v: number) => number, vista: { MW?: number; MH?: number } | null | undefined, hs: ReturnType<typeof miniLista>): number {
    let hechas = 0; const MW = (vista && vista.MW) || 0, MH = (vista && vista.MH) || 0;
    [false, true].forEach(function (mia) {
      const e = mia ? MINI.propia : MINI.ajena;
      hs.forEach(function (h) {
        if (h.es_mia !== mia) return;
        const ax = X(h.bb[0]!), bx = X(h.bb[2]!), ay = Y(h.bb[3]!), by = Y(h.bb[1]!);   // Y crece hacia el sur: el norte (bb[3]) queda arriba
        if (bx < 0 || ax > MW || by < 0 || ay > MH) return;
        c.beginPath();
        h.anillos.forEach(function (an) { an.forEach(function (q, i) { if (i) c.lineTo(X(q[0]!), Y(q[1]!)); else c.moveTo(X(q[0]!), Y(q[1]!)); }); c.closePath(); });
        if (e.relleno) { c.fillStyle = e.relleno; c.fill("evenodd"); }
        c.lineWidth = e.ancho; c.strokeStyle = e.trazo; c.lineJoin = "round"; c.stroke();
        hechas++;
        if (h.codigo) {   // el código en el centro, solo si cabe en la caja de la haza en el mapa
          c.font = "600 9px system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
          if (c.measureText(h.codigo).width + 6 < bx - ax && 12 < by - ay) {
            const tx = X(h.cen[0]!), ty = Y(h.cen[1]!);
            c.lineWidth = 2.5; c.strokeStyle = "rgba(10,14,8,0.7)"; c.strokeText(h.codigo, tx, ty); c.fillStyle = e.texto; c.fillText(h.codigo, tx, ty);
          }
        }
      });
    });
    return hechas;
  }
  // el ancho en píxeles y la resolución con que lo mide LineMaterial: en VR, el viewport de cada ojo (píxeles del ojo) y el ancho × VR_ANCHO
  function ancho(base: number, vr: boolean): number { return vr ? base * VR_ANCHO : base; }
  // el acercamiento de profundidad en el sombreador de LineMaterial: tras las posiciones de cámara de los dos extremos del tramo, se escalan hacia el ojo.
  // Devuelve el sombreador cambiado, o el mismo si three cambió y no está la línea de referencia (entonces, sin acercar: se ve igual, con algo más de riesgo
  // de parpadeo donde el tileset sube sobre la linde)
  const ANCLA = "vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );";
  function conAcercamiento(vs: unknown): unknown {
    if (typeof vs !== "string" || vs.indexOf(ANCLA) < 0) return vs;
    return vs.replace("uniform float linewidth;", "uniform float linewidth;\nuniform float uAcerca;").replace(ANCLA, ANCLA + "\n\t\t\tstart.xyz *= uAcerca; end.xyz *= uAcerca;");
  }
  return { TRI_SEG: TRI_SEG, PASO_MIN: PASO_MIN, MAX_SEG: MAX_SEG, ALTURA: ALTURA, VR_ANCHO: VR_ANCHO, ESTILO: ESTILO, ANCLA: ANCLA,
    MINI: MINI, miniLista: miniLista, pintaMini: pintaMini, clave: clave, lados: lados, cortes: cortes, tramos: tramos, longitud: longitud, plan: plan, escribe: escribe, triangulos: triangulos, ancho: ancho, conAcercamiento: conAcercamiento };
})();


// ---------------------------------------------------------------- el material de las líneas (MU5-n: por la fábrica, con su nombre de la tabla de MATERIALES §1, fila 26)
/** el nombre del material en la fábrica: es también la clave de su variante TSL */
export const MATERIAL_LINDES = "lindes-acerca";
/** lo que pide el material: el LineMaterial de three/addons (que llega con el import() del talón), sus parámetros, la fracción de acercamiento de profundidad y el parche del sombreador */
export interface OpcLindes {
  LineMaterial: T3;
  params: { color: number; linewidth: number; worldUnits: boolean; transparent: boolean; opacity: number; depthWrite: boolean };
  acerca: number;
  parche(sh: unknown): void;
}
/** el LineMaterial de siempre, con el uniforme uAcerca, el parche de acercamiento de profundidad asignado tal cual y una clave de programa propia: un solo programa para las dos líneas */
export const DEF_LINDES: DefMaterial<OpcLindes> = {
  clasico: function (o) {
    const mat = new o.LineMaterial(o.params) as MaterialMin & { uniforms: Record<string, { value: unknown }> };
    mat.uniforms["uAcerca"] = { value: 1 - o.acerca };
    mat.onBeforeCompile = o.parche; mat.customProgramCacheKey = function () { return "lindes-hazas-acerca"; };
    return mat;
  },
  // MU5-n, tercer commit (A3-3) y A4-0: la variante TSL, APAGADA (solo con el WebGPURenderer, MU6; nadie la usa hoy): la Line2NodeMaterial de three/webgpu (el
  // LineMaterial de la versión nueva) con los mismos parámetros (color, ancho en píxeles, opacidad, escritura de profundidad) y (A4-0) el acercamiento de profundidad
  // (uAcerca) en su positionNode: el clásico escala hacia el ojo los dos extremos del tramo en el espacio de la vista; aquí se escala el vértice ya ensanchado (lo que
  // three pone en positionLocal antes de positionNode), que da lo mismo en la pantalla (en perspectiva, escalar la posición en la vista no mueve su proyección) y la
  // misma profundidad. El ancho × VR_ANCHO por ojo: con la TSL, resolucion() pone el linewidth del material (la Line2NodeMaterial mide sola el viewport); la VR no
  // usará la TSL (el Quest se queda en super-three: decisión 231), así que el ancho por ojo no se ha comprobado y no hace falta. NO se puede decir que sea equivalente
  // hasta las capturas de MU6.
  tsl: function (o, c) {
    const Linea2 = c.THREE["Line2NodeMaterial"] as new (opc: unknown) => MaterialMin & { positionNode?: unknown };
    const T = c.TSL as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const m = new Linea2(o.params), k = T["uniform"](1 - o.acerca);   // el uAcerca del clásico (1 − acerca), constante
    const ojo = T["modelWorldMatrixInverse"].mul(T["vec4"](T["cameraPosition"], 1)).xyz;   // la cámara en el espacio del objeto
    m.positionNode = ojo.add(T["positionLocal"].sub(ojo).mul(k));   // = inversa(modelView) · (uAcerca · (modelView · p))
    return m;
  }
};

/** Las clases de three/addons/lines que se piden con import() al montarse (en el talón: aquí entran por cargaLib). */
export interface LibLineas { LineSegments2: T3; LineSegmentsGeometry: T3; LineMaterial: T3 }

export interface DepsLindes {
  THREE: T3;
  /** 02_mundo: el tamaño de la tesela, el centro UTM y el aviso de relieve fino (alCargar no tiene «quitar»: se engancha UNA vez) */
  Mundo: { TS: number; cx: number; cy: number; alCargar(fn: () => void): void };
  suelo(x: number, y: number): number;
  Estado: { exag: number };
  /** 08_marcadores: el grupo de la linde y de las barreras; la casilla «Linde» del menú lo muestra y oculta */
  gLinde: { visible: boolean; add(o: unknown): void; remove(o: unknown): void };
  Materiales: Materiales;
  /** 13b_hazas: la geometría de la linde de cada haza vista */
  Hazas: { lindes(): HazaLinde[] };
  /** 17_minimapa: el punto de extensión de las capas */
  Minimapa: { capa(fn: (c: Cualquiera, X: (v: number) => number, Y: (v: number) => number, info: Cualquiera) => void, orden: number): () => void };
  /** el registro de componentes (para window.__lindes("libera")) y la ventana (para publicar window.__lindes) */
  Componentes: { libera(id: string): unknown };
  ventana: Record<string, unknown>;
}

export interface EstadoLindes {
  lib: string; hazas: number; tramos: { propia: number; ajena: number }; triangulos: number; llamadas: number; paso: number; longitud: number; recortado: boolean; repegadas: number; acerca: boolean; mini: number;
}

/** Las lindes de las hazas: el componente y su motor. `aviso` (Mundo.alCargar no tiene «quitar») vive mientras viva el registro del componente. */
export function creaLindes(d: DepsLindes) {
  const P = LindesPuro;
  const aviso: { fn: (() => void) | null; puesto: boolean } = { fn: null, puesto: false };   // Mundo.alCargar no tiene «quitar»: se engancha UNA vez y llama al montaje vivo, si lo hay

  function LindesMotor(n: ContextoComponente, cargaLib: () => Promise<LibLineas>) {
    d.Materiales.define(MATERIAL_LINDES, DEF_LINDES);   // (aquí y no al crear: el manifiesto se pide sin dependencias para medirlo)
    const materiales = d.Materiales.de(ID_LINDES);   // lo que cree este componente se libera con su libera()
    const THREE = d.THREE, Mundo = d.Mundo, TS = Mundo.TS, OX = Mundo.cx, OY = Mundo.cy, Estado = d.Estado, suelo = d.suelo, gLinde = d.gLinde;
    let vivo = true, L: LibLineas | null = null, grupo: T3 = null, mallas: Record<string, { obj: T3; geo: T3; mat: T3 }> = {}, pl: ReturnType<typeof P.plan> | null = null, sucio = false, exagHecha = -1;
    const st: EstadoLindes = { lib: "pidiendo", hazas: 0, tramos: { propia: 0, ajena: 0 }, triangulos: 0, llamadas: 0, paso: 0, longitud: 0, recortado: false, repegadas: 0, acerca: false, mini: 0 };
    const vp = new THREE.Vector4();
    function vaciaLindes(): void {
      if (grupo) gLinde.remove(grupo);
      Object.keys(mallas).forEach(function (k) { mallas[k]!.geo.dispose(); });
      materiales.libera();   // los LineMaterial de las dos líneas
      grupo = null; mallas = {}; pl = null;
      st.tramos = { propia: 0, ajena: 0 }; st.triangulos = 0; st.llamadas = 0; st.paso = 0; st.longitud = 0; st.recortado = false;
    }
    function acercaShader(sh: Cualquiera): void { const v = P.conAcercamiento(sh.vertexShader); st.acerca = v !== sh.vertexShader; sh.vertexShader = v; }
    // el ancho en píxeles lo mide LineMaterial con su «resolution»: fuera de VR, el viewport del lienzo (lo que hace LineSegments2); en VR, el de cada ojo
    // (la cámara de cada ojo trae su viewport), con el ancho algo mayor (no probado en unas gafas reales)
    function resolucion(o: T3, base: number) {
      return function (r: Cualquiera, _escena: unknown, cam: Cualquiera): void {
        const u = o.material.uniforms, v = cam && cam.viewport;
        if (o.material.isNodeMaterial) { o.material.linewidth = P.ancho(base, !!(v && v.z > 0)); return; }   // A4-0: la TSL (MU6) no tiene uniforms: mide sola el viewport
        if (v && v.z > 0) { u.resolution.value.set(v.z, v.w); u.linewidth.value = P.ancho(base, true); }
        else { r.getViewport(vp); u.resolution.value.set(vp.z, vp.w); u.linewidth.value = P.ancho(base, false); }
      };
    }
    function construye(): void {
      vaciaLindes();
      const hs = d.Hazas.lindes(); st.hazas = hs.length;
      if (!L || !hs.length) return;
      pl = P.plan(hs, TS, OX, OY, P.MAX_SEG);
      grupo = new THREE.Group(); grupo.name = "linde de las hazas";
      (["propia", "ajena"] as const).forEach(function (k) {
        if (!pl!.n[k]) return;
        const e = P.ESTILO[k], w = P.escribe(pl!.lados[k], pl!.paso, TS, OX, OY, suelo, Estado.exag, P.ALTURA, pl!.n[k]);
        const geo = new L!.LineSegmentsGeometry(); geo.setPositions(w.pos);
        const mat = materiales.crea(MATERIAL_LINDES, {
          LineMaterial: L!.LineMaterial, acerca: e.acerca, parche: acercaShader,
          params: { color: e.color, linewidth: e.ancho, worldUnits: false, transparent: e.opacidad < 1, opacity: e.opacidad, depthWrite: e.opacidad >= 1 }
        } as OpcLindes) as T3;
        const o = new L!.LineSegments2(geo, mat);
        o.name = k === "propia" ? "lindes propias" : "lindes ajenas"; o.renderOrder = k === "propia" ? 2 : 1;
        o.raycast = function () { /* la haza se elige por el suelo (13b_hazas.js), no por la línea; y así ningún rayo sin cámara la pregunta */ };
        o.onBeforeRender = resolucion(o, e.ancho);
        o.matrixAutoUpdate = false; o.updateMatrix();
        grupo.add(o); mallas[k] = { obj: o, geo: geo, mat: mat };
        st.tramos[k] = w.n;
      });
      gLinde.add(grupo);
      exagHecha = Estado.exag; sucio = false;
      st.triangulos = P.triangulos(st.tramos.propia + st.tramos.ajena); st.llamadas = Object.keys(mallas).length; st.paso = pl.paso; st.longitud = pl.longitud; st.recortado = pl.recortado;
    }
    // repegar al relieve: las mismas posiciones reescritas en el mismo búfer (el que LineSegmentsGeometry comparte entre instanceStart e instanceEnd)
    function repega(): void {
      Object.keys(mallas).forEach(function (k) {
        const g = mallas[k]!.geo, a = g.getAttribute("instanceStart"), buf = a.data;
        P.escribe(pl!.lados[k as "propia" | "ajena"], pl!.paso, TS, OX, OY, suelo, Estado.exag, P.ALTURA, pl!.n[k]!, buf.array);
        buf.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere();
      });
      exagHecha = Estado.exag; sucio = false; st.repegadas++;
    }
    function tarde(): void { if (pl && (sucio || Estado.exag !== exagHecha)) repega(); }
    aviso.fn = function () { sucio = true; };
    if (!aviso.puesto) { aviso.puesto = true; Mundo.alCargar(function () { if (aviso.fn) aviso.fn(); }); }
    // el minimapa (A4b): la misma linde en 2D con Minimapa.capa (punto de extensión C10); la lista se rehace al oír «hazas:cambia» y la casilla «Linde» (gLinde.visible)
    // la apaga igual que apaga el dibujo 3D. Va bajo los conejos y los perros (orden −30) y sobre las parcelas. No necesita las líneas de three.
    let miniHazas = P.miniLista(d.Hazas.lindes());
    n.limpia(d.Minimapa.capa(function (c, X, Y, info) { if (gLinde.visible) st.mini = P.pintaMini(c, X, Y, info, miniHazas); }, -30));
    n.on("hazas:cambia", function () { miniHazas = P.miniLista(d.Hazas.lindes()); if (L) construye(); else st.hazas = d.Hazas.lindes().length; });
    n.on("depura:lineas", function (dd: Cualquiera) {
      if (dd && dd.lineas && st.llamadas) dd.lineas.push("Lindes: " + st.llamadas + " llamadas · " + (st.tramos.propia + st.tramos.ajena) + " tramos · " + st.triangulos + " triángulos · paso " + st.paso.toFixed(1) + " m" + (st.recortado ? " · RECORTADAS" : ""));
    });
    cargaLib().then(function (m) { if (!vivo) return; L = m; st.lib = "lista"; construye(); }, function (e) { if (vivo) st.lib = "sin líneas: " + String(e && e.message || e).slice(0, 80); });
    function estado(): EstadoLindes { const o: Cualquiera = {}; (Object.keys(st) as (keyof EstadoLindes)[]).forEach(function (k) { o[k] = k === "tramos" ? { propia: st.tramos.propia, ajena: st.tramos.ajena } : st[k]; }); return o; }
    d.ventana["__lindes"] = function (que?: string) { if (que === "libera") { d.Componentes.libera(ID_LINDES); return null; } return estado(); };   // pruebas y ?debug
    n.limpia(function () { try { delete d.ventana["__lindes"]; } catch (e) { d.ventana["__lindes"] = undefined; } });
    /** lo que suelta el componente al apagarse: el grupo de la escena, las geometrías y los materiales de las dos líneas, el aviso de relieve y lo que pidiera la carga de las líneas */
    function libera(): void { vivo = false; if (aviso.fn) aviso.fn = null; vaciaLindes(); }
    return { tarde: tarde, libera: libera, estado: estado };
  }
  return { LindesMotor, aviso };
}

/** El manifiesto del componente «lindes-hazas» (ADR-0023): lo lee el guardián pruebas/guardianes/componentes.test.js sin montar nada. ?lindes=0 lo apaga; ?lindes=1 lo enciende.
 *  cargaLib pide las líneas de three con import() (se queda en el talón, para que Vite lo trocee igual). */
export function manifiestoLindes(d: DepsLindes, cargaLib: () => Promise<LibLineas>): Manifiesto {
  const lindes = creaLindes(d);
  return {
    id: ID_LINDES, version: 1,
    consume: ["Materiales", "Hazas", "gLinde", "Minimapa"],
    expone: [],
    eventos: { escucha: ["hazas:cambia", "depura:lineas"], emite: [] },   // el minimapa no emite ni escucha nada más: pinta con Minimapa.capa
    bandera: { defecto: true, url: "lindes" },
    // 2 llamadas (propias y ajenas, cada una una malla instanciada de three) y como mucho MAX_SEG tramos de 6 triángulos: 48.000 (con la linde de una
    // finca normal, unas decenas de miles menos: 3 por metro). Sin texturas.
    presupuesto: { llamadas: 2, triangulos: 48000 },
    fases: { tarde: 0.5 },
    mundos: ["exterior"],
    monta: function (n) { return lindes.LindesMotor(n, cargaLib); },
    actualiza: { tarde: function (_dt, _t, api) { (api as ReturnType<typeof lindes.LindesMotor>).tarde(); } },
    libera: function (api) { if (api) (api as ReturnType<typeof lindes.LindesMotor>).libera(); }
  };
}

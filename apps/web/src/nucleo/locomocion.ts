// La lógica pura de llegar a un sitio y de ir andando hasta él (antes los trozos [puro] de apps/web/motor/12b_llegada.js y 12c_ir_a.js; MUNDOS §9.4, pieza 6):
// rayo contra el suelo, aterrizar de pie fuera de troncos, toque frente a arrastre, girar y avanzar hacia un punto, rodear troncos y la línea de puntos del camino.
// Sin THREE ni DOM ni globales del legado. Las funciones ya reciben lo que necesitan (el suelo como función `alto`, la caja `ext` de la finca y los obstáculos `copas`),
// que es lo que pide MUNDOS §2: el mundo de cada finca les presta su suelo, su caja y sus obstáculos. Los módulos de motor/ conservan lo que toca THREE y el DOM
// (el anillo, el velo, los oyentes, el estado del paseo): 12b_llegada.js (Llegada) y 12c_ir_a.js (IrA).
// Coordenadas: la escena tiene z = −norte; el mundo (copas, ext, paseo) tiene y = norte. D.ext = [x0, yNorte, x1, ySur].

/** un punto del plano del mundo (y = norte) */
export interface Punto2 { x: number; y: number }
/** un punto de la escena */
export interface Punto3 { x: number; y: number; z: number }
/** un tronco (copa con oliv) o cualquier otra copa: x este, y norte */
export interface Copa { x: number; y: number; oliv?: boolean | number }
/** D.ext = [x0, yNorte, x1, ySur] */
export type Ext = readonly [number, number, number, number] | readonly number[];
/** ¿se puede estar en (x, y) del mundo (y = norte)? Es el `dentro` del mundo activo (gm.dentro; MUNDOS §2, MU2-4) */
export type Dentro = (x: number, y: number) => boolean;
/** la caja de la finca (D.ext, con el margen de 3 m) o el `dentro` del mundo activo, que es lo que pasa el legado desde MU2-4 */
export type Caja = Ext | Dentro;
export type TipoPuntero = "mouse" | "pen" | "touch" | string | undefined;
export interface Impacto { x: number; y: number; z: number; dist: number }

// =====================================================================================================================================================
// La llegada (12b_llegada.js)
// =====================================================================================================================================================
const LL_MAX = 2500, LL_MARGEN = 3, LL_TOQUE_MS = 400, LL_TOQUE_PX: Readonly<Record<string, number>> = { mouse: 6, pen: 8, touch: 12 };

// ¿(x, z) de la escena (z = −norte) dentro de D.ext = [x0, yNorte, x1, ySur], con 3 m de margen (como el paseo y el teletransporte a pie)?
// Con una función (el `dentro` del mundo activo, en coordenadas del mundo), es la que decide (MU2-4).
function dentro(x: number, z: number, e: Caja): boolean {
  const y = -z;
  if (typeof e === "function") return e(x, y);
  return x >= (e[0] as number) + LL_MARGEN && x <= (e[2] as number) - LL_MARGEN && y >= (e[3] as number) + LL_MARGEN && y <= (e[1] as number) - LL_MARGEN;
}

// rayo (origen o, dirección d) contra el suelo alto(x, z) (m de la escena, ya con exageración). Avanza a pasos de la mitad de la altura que le queda
// (0,5–25 m) y afina con bisección. ext: la caja D.ext o el `dentro` del mundo (gm.dentro, MU2-4). Devuelve { x, y, z, dist } o null si apunta hacia arriba, no toca suelo en `max` m o cae fuera de la finca.
function rayoSuelo(o: Punto3, d: Punto3, alto: (x: number, z: number) => number, ext: Caja, max?: number): Impacto | null {
  const l = Math.hypot(d.x, d.y, d.z); if (!(l > 0)) return null;
  const dx = d.x / l, dy = d.y / l, dz = d.z / l, tope = max || LL_MAX;
  if (dy > -0.02) return null;
  let t = 0, prev = 0, h = o.y - alto(o.x, o.z);
  if (!(h > 0)) return null;
  while (t < tope) {
    prev = t; t = Math.min(tope, t + Math.max(0.5, Math.min(25, h * 0.5)));
    h = o.y + dy * t - alto(o.x + dx * t, o.z + dz * t);
    if (h <= 0) {
      let a = prev, b = t;
      for (let k = 0; k < 16; k++) { const m = (a + b) / 2; if (o.y + dy * m - alto(o.x + dx * m, o.z + dz * m) > 0) a = m; else b = m; }
      const tt = (a + b) / 2, px = o.x + dx * tt, pz = o.z + dz * tt;
      return dentro(px, pz, ext) ? { x: px, y: alto(px, pz), z: pz, dist: tt } : null;
    }
  }
  return null;
}

// ¿el punto p está a la vista desde c mirando hacia `mirada`? (sin anillo por detrás del usuario: ángulo con la mirada menor de ~96°)
function delante(c: Punto3, mirada: Punto3, p: Punto3): boolean {
  const vx = p.x - c.x, vy = p.y - c.y, vz = p.z - c.z, l = Math.hypot(vx, vy, vz), lm = Math.hypot(mirada.x, mirada.y, mirada.z);
  if (!(l > 0) || !(lm > 0)) return true;
  return (vx * mirada.x + vy * mirada.y + vz * mirada.z) / (l * lm) > -0.1;
}

// radio del anillo (m) según la distancia a quien observa: ~1,4° de ángulo, entre 0,4 y 30 m (se ve desde el aire y no tapa de cerca)
function radioMarca(dist: number): number { return Math.max(0.4, Math.min(30, dist * 0.025)); }

// aparta (x, z) de los troncos de olivo (copas: { x, y = norte, oliv }) a r m (0,55, como al andar)
function fueraDeTroncos(x: number, z: number, copas: readonly Copa[], r?: number): { x: number; z: number } {
  const rr = r || 0.55, r2 = rr * rr;
  for (let i = 0; i < copas.length; i++) {
    const c = copas[i] as Copa; if (!c.oliv) continue;
    let ex = x - c.x, ez = z + c.y, d2 = ex * ex + ez * ez;
    if (d2 < r2) { if (d2 === 0) { ex = 1; ez = 0; d2 = 1; } const dl = Math.sqrt(d2); x = c.x + ex / dl * rr; z = -c.y + ez / dl * rr; }
  }
  return { x: x, z: z };
}

// ¿un clic/toque (y no un arrastre ni una pulsación larga)? mov: lo más lejos (px) que se fue el puntero desde que bajó; ms: lo que duró
function esToqueLlegada(mov: number, ms: number, tipo?: TipoPuntero): boolean { return mov <= (LL_TOQUE_PX[tipo as string] || (LL_TOQUE_PX.mouse as number)) && ms <= LL_TOQUE_MS; }

export const LlegadaPuro = { rayoSuelo, delante, radioMarca, fueraDeTroncos, dentro, esToque: esToqueLlegada, MAX: LL_MAX, MARGEN: LL_MARGEN, TOQUE_MS: LL_TOQUE_MS, TOQUE_PX: LL_TOQUE_PX };

// =====================================================================================================================================================
// Tocar para ir andando (12c_ir_a.js)
// =====================================================================================================================================================
const LLEGA = 0.5, LLEGA_INTER = 0.7, TOQUE_MS = 400, TOQUE_PX: Readonly<Record<string, number>> = { mouse: 6, pen: 8, touch: 12 }, GIRO = 3.2, ATASCO_S = 1.2, ATASCO_M = 0.15;

/** el estado de un trayecto: el destino, el rodeo que falta por andar y lo que hace falta para replanificar o rendirse */
export interface EstadoIr { dest: Punto2 | null; ruta: Punto2[]; copas: readonly Copa[] | null; ext: Caja | null; replan: number; mejor: number; quieto: number }
export interface PasoIr { av: number; ang: number; fin: null | "llego" | "atascado" }

// ¿un clic/toque corto (y no un arrastre ni una pulsación larga)? mov: lo más lejos (px) que se fue el puntero; ms: lo que duró
function esToque(mov: number, ms: number, tipo?: TipoPuntero): boolean { return mov <= (TOQUE_PX[tipo as string] || (TOQUE_PX.mouse as number)) && ms <= TOQUE_MS; }
// URL > ajuste > defecto (encendido): ?tocar=0 lo apaga, ?tocar=1 lo fuerza
function activa(ajuste: unknown, busqueda?: string): boolean {
  const m = /[?&]tocar=([01])(?![0-9A-Za-z])/.exec(busqueda || "");
  if (m) return m[1] === "1";
  return ajuste !== false;
}
// rumbo (0 = norte, crece hacia el este: el del paseo) de (x, y) a (dx, dy)
function rumbo(x: number, y: number, dx: number, dy: number): number { return Math.atan2(dx - x, dy - y); }
// diferencia más corta entre dos ángulos, en (−π, π]
function difAng(a: number, b: number): number { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; else if (d <= -Math.PI) d += 2 * Math.PI; return d; }
// gira a hacia meta como mucho GIRO·dt rad
function gira(a: number, meta: number, dt: number): number { const d = difAng(a, meta), t = GIRO * dt; return a + (Math.abs(d) <= t ? d : (d > 0 ? t : -t)); }
// avance 0..1: entero con el destino delante, nada si hay que girar más de ~90°, y justo lo que falta al llegar (sin pasarse)
function avance(dist: number, dif: number, dt: number, vel: number): number { const c = Math.max(0, Math.cos(dif)); return Math.min(1, dist / Math.max(1e-6, vel * dt)) * c; }

// --- rodeo local de troncos. Los troncos son copas con oliv (x, y = norte); se esquivan a R m (el paseo los empuja a 0,55 m).
const R_TRONCO = 1.0, R_REPLAN = 1.35, TOPE_PLAN = 60, PROF_PLAN = 8, SALIDA = 0.25;
// el primer tronco (no excluido) que el segmento a→b roza a menos de R, con su proyección delante de a. Devuelve { i, c, t } o null
function obstaculo(a: Punto2, b: Punto2, copas: readonly Copa[], R: number, ex: Record<number, boolean>): { i: number; c: Copa; t: number } | null {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let mejor: { i: number; c: Copa; t: number } | null = null;
  const x0 = Math.min(a.x, b.x) - R, x1 = Math.max(a.x, b.x) + R, y0 = Math.min(a.y, b.y) - R, y1 = Math.max(a.y, b.y) + R;
  for (let i = 0; i < copas.length; i++) {
    const c = copas[i] as Copa; if (!c.oliv || ex[i] || c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
    let t = l2 > 0 ? ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2 : 0; if (t <= 0) continue; if (t > 1) t = 1;
    const ex2 = a.x + dx * t - c.x, ey2 = a.y + dy * t - c.y;
    if (ex2 * ex2 + ey2 * ey2 < R * R && (!mejor || t < mejor.t)) mejor = { i: i, c: c, t: t };
  }
  return mejor;
}
function libre(p: Punto2, copas: readonly Copa[], r: number, ext?: Caja | null): boolean {
  if (ext && !dentro(p.x, -p.y, ext)) return false;   // la caja con 3 m de margen (la misma comparación de siempre) o el `dentro` del mundo
  for (let i = 0; i < copas.length; i++) { const c = copas[i] as Copa; if (c.oliv && Math.hypot(c.x - p.x, c.y - p.y) < r) return false; }
  return true;
}
// camino de a a b esquivando troncos: lista de puntos que acaba en b (sin a), [b] si el recto está libre, o null si no hay rodeo
// (más de PROF_PLAN niveles o TOPE_PLAN tramos mirados: el tope de tiempo). ext = D.ext o el `dentro` del mundo (gm.dentro, MU2-4), para no salirse (opcional).
function planifica(a: Punto2, b: Punto2, copas: readonly Copa[], R?: number, ext?: Caja | null): Punto2[] | null {
  const rr = R || R_TRONCO, pts: Punto2[] = []; let n = 0;
  function tramo(p: Punto2, q: Punto2, prof: number, ex: Record<number, boolean>): boolean {
    if (++n > TOPE_PLAN || prof > PROF_PLAN) return false;
    const ob = obstaculo(p, q, copas, rr, ex); if (!ob) { pts.push(q); return true; }
    const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const lado = ((ob.c.x - p.x) * dy - (ob.c.y - p.y) * dx) > 0 ? -1 : 1;   // primero el lado contrario al que cae el tronco
    const ex2: Record<number, boolean> = {}; for (const k in ex) ex2[k as unknown as number] = true; ex2[ob.i] = true;
    for (let v = 0; v < 2; v++) {
      const s = v ? -lado : lado, w = { x: ob.c.x + nx * s * (rr + SALIDA), y: ob.c.y + ny * s * (rr + SALIDA) };
      if (!libre(w, copas, 0.8, ext)) continue;
      const antes = pts.length;
      if (tramo(p, w, prof + 1, ex2) && tramo(w, q, prof + 1, ex2)) return true;
      pts.length = antes;
    }
    return false;
  }
  return tramo({ x: a.x, y: a.y }, { x: b.x, y: b.y }, 0, {}) ? pts : null;
}
// puntos de la línea de puntos: sobre el camino (pos → ruta → dest), cada `paso` m contados desde el destino (así no se mueven al andar y se van apagando
// al pasar), sin el del propio destino (lo marca el anillo) ni los de menos de 0,8 m de los pies; como mucho `max`, los más cercanos al paseante
function puntosLinea(pos: Punto2, st: EstadoIr, paso: number, max: number): Punto2[] {
  if (!st.dest) return [];
  const v: Punto2[] = [{ x: pos.x, y: pos.y }].concat(st.ruta || [], [st.dest]), acum = [0]; let L = 0;
  for (let i = 1; i < v.length; i++) { L += Math.hypot((v[i] as Punto2).x - (v[i - 1] as Punto2).x, (v[i] as Punto2).y - (v[i - 1] as Punto2).y); acum.push(L); }
  const out: Punto2[] = [], kmax = Math.floor((L - 0.8) / paso); let j = 1;
  for (let k = kmax; k >= 1 && out.length < max; k--) {
    const s = L - k * paso; while (j < v.length - 1 && (acum[j] as number) < s) j++;
    const l = (acum[j] as number) - (acum[j - 1] as number) || 1, f = (s - (acum[j - 1] as number)) / l, a = v[j - 1] as Punto2, b = v[j] as Punto2;
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}
function crea(): EstadoIr { return { dest: null, ruta: [], copas: null, ext: null, replan: 0, mejor: Infinity, quieto: 0 }; }
// ruta: puntos intermedios (de planifica, sin el destino); copas/ext (opcionales): permiten replanificar una vez si se atasca
function ir(st: EstadoIr, x: number, y: number, ruta?: Punto2[] | null, copas?: readonly Copa[] | null, ext?: Caja | null): void { st.dest = { x: x, y: y }; st.ruta = ruta || []; st.copas = copas || null; st.ext = ext || null; st.replan = 0; st.mejor = Infinity; st.quieto = 0; }
function cancela(st: EstadoIr): void { st.dest = null; st.ruta = []; st.copas = null; st.mejor = Infinity; st.quieto = 0; }
// un paso: pos = { x, y, ang } del paseante (y = norte); devuelve { av, ang, fin } (fin: null, "llego" o "atascado") o null sin destino.
// Atascado: andando (avance > 0,3) y sin acercarse ATASCO_M m en ATASCO_S s (un tronco, un desnivel…).
function paso(st: EstadoIr, pos: Punto2 & { ang: number }, dt: number, vel: number): PasoIr | null {
  if (!st.dest) return null;
  const inter = st.ruta.length > 0, o = inter ? (st.ruta[0] as Punto2) : st.dest;   // el punto al que se va ahora: el siguiente del rodeo o el destino
  const dx = o.x - pos.x, dy = o.y - pos.y, dist = Math.hypot(dx, dy);
  if (inter && dist < LLEGA_INTER) { st.ruta.shift(); st.mejor = Infinity; st.quieto = 0; return { av: 0, ang: pos.ang, fin: null }; }
  if (!inter && dist < LLEGA) { cancela(st); return { av: 0, ang: pos.ang, fin: "llego" }; }
  const meta = rumbo(pos.x, pos.y, o.x, o.y), ang = gira(pos.ang, meta, dt), av = avance(inter ? 1e9 : dist, difAng(ang, meta), dt, vel);   // en un punto intermedio no frena
  if (av > 0.3) {
    if (dist < st.mejor - ATASCO_M) { st.mejor = dist; st.quieto = 0; }
    else {
      st.quieto += dt;
      if (st.quieto > ATASCO_S) {
        const r2 = st.replan < 1 && st.copas ? planifica(pos, st.dest, st.copas, R_REPLAN, st.ext) : null;   // una sola vez, con más margen
        st.replan++; st.mejor = Infinity; st.quieto = 0;
        if (r2) { st.ruta = r2.slice(0, -1); return { av: 0, ang: ang, fin: null }; }
        cancela(st); return { av: 0, ang: ang, fin: "atascado" };
      }
    }
  }
  return { av: av, ang: ang, fin: null };
}

export const IrAPuro = { LLEGA, TOQUE_MS, TOQUE_PX, GIRO, esToque, activa, rumbo, difAng, gira, avance, planifica, puntosLinea, R_TRONCO, crea, ir, cancela, paso };

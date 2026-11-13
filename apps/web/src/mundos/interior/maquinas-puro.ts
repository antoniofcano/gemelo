// Las máquinas de un interior, lo puro (contrato contratos/mundo-interior.md v1.2, §1e; ADR-0034): sin three ni DOM, con Vitest (maquinas-puro.test.ts).
//   · valida(maquinas): lo que el motor necesita para no romperse (tipos, campos de cada tipo, velocidad o relación, relaciones sin ciclos). La validación
//     entera (el nodo en el glb, el pivote = origen del nodo, ejes unitarios con tolerancia, el material con textura) es de tuberia/interiores/valida.js.
//   · velocidades(maquinas): la velocidad de cada una, directa o por su relación (la de otra por un factor, en cadena).
//   · creaMarcha(maquinas): el estado de todas (una fase por máquina) que avanza con dt y la marcha (0 parada, 1 en marcha, con rampa: arrancan y paran
//     suaves); valor(i) da el ángulo (giro), el desplazamiento (vaivén, traslación) y desplazU/desplazV (textura). Sin reservas por fotograma.
//   · rotaEnPadre(eje, ang, q0, sal): el cuaternión de reposo girado `ang` en torno a `eje` (en el marco del padre), escrito en `sal`.
// Unidades (contrato): giro en vueltas por minuto, vaivén en ciclos por minuto, traslación en m/s, textura en unidades de UV por segundo.
import type { Maquina } from "../../datos/contratos/mundo-interior.ts";

const TIPOS = ["giro", "vaiven", "traslacion", "textura"] as const;
const num = (v: unknown): v is number => typeof v === "number" && isFinite(v);
const vec = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(num);
/** segundos que tarda en arrancar o en pararse del todo [SUPUESTO: a ojo; una transmisión de correas no arranca de golpe] */
export const RAMPA_S = 1.5;
const DOS_PI = Math.PI * 2;

/** Errores (vacía = vale). Una lista con errores deja el interior sin máquinas, no sin interior (como las paradas). */
function valida(maquinas: unknown): string[] {
  const e: string[] = [];
  if (!Array.isArray(maquinas)) return ["maquinas: una lista"];
  const ids = new Map<string, Record<string, unknown>>();
  maquinas.forEach((x, i) => {
    const m = x as Record<string, unknown> | null;
    if (!m || typeof m !== "object" || typeof m.id !== "string" || !m.id) { e.push("maquinas[" + i + "]: sin id"); return; }
    const q = "la máquina «" + m.id + "»";
    if (ids.has(m.id)) e.push(q + ": id repetido");
    ids.set(m.id, m);
    if (typeof m.nodo !== "string" || !m.nodo) e.push(q + ": sin nodo");
    if (!(TIPOS as readonly unknown[]).includes(m.tipo)) { e.push(q + ": tipo «" + String(m.tipo) + "» desconocido"); return; }
    if ((m.velocidad === undefined) === (m.relacion === undefined)) e.push(q + ": velocidad o relación, una sola");
    if (m.velocidad !== undefined && !num(m.velocidad)) e.push(q + ": velocidad no es un número");
    if (m.relacion !== undefined) {
      const r = m.relacion as Record<string, unknown> | null;
      if (!r || typeof r.con !== "string" || !num(r.factor)) e.push(q + ": relación {con, factor}");
    }
    if (m.tipo === "textura") {
      if (typeof m.material !== "string" || !m.material) e.push(q + ": textura sin material");
      if (!vec(m.uv, 2)) e.push(q + ": uv [u, v]");
    } else {
      if (!vec(m.eje, 3) || Math.abs(Math.hypot(...(m.eje as number[])) - 1) > 0.01) e.push(q + ": eje unitario [x, y, z]");
      if (m.tipo !== "giro" && (!num(m.recorrido) || (m.recorrido as number) <= 0)) e.push(q + ": recorrido en metros");
      if (m.pausa_s !== undefined && (!num(m.pausa_s) || (m.pausa_s as number) < 0)) e.push(q + ": pausa_s en segundos");
    }
  });
  // las relaciones: a una máquina que existe y sin ciclos
  for (const [id, m] of ids) {
    const r = m.relacion as { con?: unknown } | undefined;
    if (!r || typeof r.con !== "string") continue;
    if (!ids.has(r.con)) { e.push("la máquina «" + id + "»: su relación es con «" + r.con + "», que no existe"); continue; }
    const vistos = new Set([id]);
    let c: string | undefined = r.con;
    while (c !== undefined) {
      if (vistos.has(c)) { e.push("la máquina «" + id + "»: relaciones en ciclo"); break; }
      vistos.add(c);
      const sig = ids.get(c)?.relacion as { con?: unknown } | undefined;
      c = sig && typeof sig.con === "string" && ids.has(sig.con) ? sig.con : undefined;
    }
  }
  return e;
}

/** La velocidad de cada máquina (en sus unidades), en el orden de la lista. Supone una lista válida (valida() vacía). */
function velocidades(maquinas: readonly Maquina[]): number[] {
  const porId = new Map(maquinas.map(m => [m.id, m] as const)), hechas = new Map<string, number>();
  const de = (m: Maquina, prof: number): number => {
    const ya = hechas.get(m.id);
    if (ya !== undefined) return ya;
    let v = 0;
    if (num(m.velocidad)) v = m.velocidad;
    else if (m.relacion && prof < maquinas.length) { const o = porId.get(m.relacion.con); v = o ? de(o, prof + 1) * m.relacion.factor : 0; }
    hechas.set(m.id, v);
    return v;
  };
  return maquinas.map(m => de(m, 0));
}

/** La traslación: de 0 a L a velocidad v, pausa p, vuelta a 0, pausa p (t en segundos dentro del ciclo de 2·(L/v + p)). */
function posTraslacion(t: number, L: number, v: number, p: number): number {
  const ida = L / v, T = 2 * (ida + p);
  let s = t % T; if (s < 0) s += T;
  if (s < ida) return v * s;
  if (s < ida + p) return L;
  if (s < 2 * ida + p) return L - v * (s - ida - p);
  return 0;
}

/** El vaivén: de 0 a L y vuelta, suave (coseno), con `ciclos` ya recorridos. */
function posVaiven(ciclos: number, L: number): number { return L * (1 - Math.cos(DOS_PI * ciclos)) / 2; }

/** q = giro(eje, ang) · q0 (el giro, en el marco del padre, tras la pose de reposo), en sal [x, y, z, w]. Sin reservas. */
function rotaEnPadre(eje: readonly number[], ang: number, q0: readonly number[], sal: number[]): number[] {
  const s = Math.sin(ang / 2), ax = eje[0]! * s, ay = eje[1]! * s, az = eje[2]! * s, aw = Math.cos(ang / 2);
  const bx = q0[0]!, by = q0[1]!, bz = q0[2]!, bw = q0[3]!;
  sal[0] = aw * bx + ax * bw + ay * bz - az * by;
  sal[1] = aw * by - ax * bz + ay * bw + az * bx;
  sal[2] = aw * bz + ax * by - ay * bx + az * bw;
  sal[3] = aw * bw - ax * bx - ay * by - az * bz;
  return sal;
}

/** suavizado de la rampa (la velocidad sigue a la marcha con una S: sin tirón al arrancar ni al parar) */
const ese = (x: number): number => x * x * (3 - 2 * x);

function creaMarcha(maquinas: readonly Maquina[], rampa = RAMPA_S) {
  const n = maquinas.length, vel = velocidades(maquinas);
  const tipo = maquinas.map(m => TIPOS.indexOf(m.tipo));
  const a = new Float64Array(n), b = new Float64Array(n);   // fase: giro (rad), vaivén (ciclos), traslación (s), textura (u, v)
  let marcha = 0, objetivo = 0;
  return {
    n,
    /** las velocidades resueltas (en sus unidades) */
    velocidades: vel,
    /** poner en marcha (true) o parar (false): la marcha va hacia ahí con la rampa */
    objetivo(on: boolean): void { objetivo = on ? 1 : 0; },
    enMarcha(): boolean { return objetivo === 1; },
    /** 0 parada … 1 en marcha */
    marcha(): number { return marcha; },
    /** ¿hay algo que mover? (parada del todo y sin ir a arrancar: nada) */
    quieta(): boolean { return marcha === 0 && objetivo === 0; },
    avanza(dt: number): void {
      if (marcha !== objetivo) marcha = objetivo > marcha ? Math.min(1, marcha + dt / rampa) : Math.max(0, marcha - dt / rampa);
      const k = ese(marcha) * dt;
      if (k === 0) return;
      for (let i = 0; i < n; i++) {
        const v = vel[i]!, m = maquinas[i]!;
        switch (tipo[i]) {
          case 0: a[i] = (a[i]! + DOS_PI * v / 60 * k) % DOS_PI; break;
          case 1: a[i] = (a[i]! + v / 60 * k) % 1; break;
          case 2: a[i] = a[i]! + k; { const L = m.recorrido || 0, w = Math.abs(v) || 1, T = 2 * (L / w + (m.pausa_s || 0)); if (T > 0) a[i] = a[i]! % T; } break;
          case 3: { const uv = m.uv || [0, 0]; a[i] = (a[i]! - uv[0]! * v * k) % 1; b[i] = (b[i]! - uv[1]! * v * k) % 1; } break;
        }
      }
    },
    /** giro: ángulo (rad); vaivén y traslación: metros desde el reposo por el eje; textura: desplazamiento U */
    valor(i: number): number {
      const m = maquinas[i]!;
      switch (tipo[i]) {
        case 1: return posVaiven(a[i]!, m.recorrido || 0);
        case 2: return posTraslacion(a[i]!, m.recorrido || 0, Math.abs(vel[i]!) || 1, m.pausa_s || 0);
        default: return a[i]!;
      }
    },
    /** textura: desplazamiento V */
    valorV(i: number): number { return b[i]!; },
  };
}

export const MaquinasPuro = { valida, velocidades, posTraslacion, posVaiven, rotaEnPadre, creaMarcha, RAMPA_S };
export type Marcha = ReturnType<typeof creaMarcha>;

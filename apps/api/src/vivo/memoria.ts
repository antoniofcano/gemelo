// La memoria de las lecturas en vivo (Vigía y OlivarTrack por MCP): una sola pieza para todas, para no martillear a los
// servicios ni dejar al motor sin nada cuando fallan (contratos/tiempo.md, contratos/ot-hoy.md).
//  · De la memoria si la lectura es más nueva que su plazo (ttl).
//  · Varias peticiones a la vez para la misma clave hacen UNA llamada.
//  · Tras un fallo, no se vuelve a llamar a esa clave hasta pasada la espera.
//  · Tope de llamadas reales por clave y hora: pasado el tope se sirve lo último que llegó (o nada), como tras un fallo.
//  · Si falla (o se llega al tope) y hay una lectura anterior de menos de `maxViejo`, se devuelve esa con `fallo: true`
//    (o `tope: true`) para que quien la sirve diga de cuándo es.
// Lo que se guarda es la respuesta CRUDA del servicio; la lista blanca se aplica al servir (así un cambio de lista no exige vaciar nada).
// Por qué no una librería de caché (lru-cache…): ninguna mantenida junta las cinco reglas (la espera tras el fallo, el tope por
// hora y servir lo viejo con su antigüedad); ésta salió de ServicioTiempo (vigia/servicio.ts), que ahora la usa también.

const MIN = 60_000;
const HORA = 60 * MIN;

export interface Lectura { crudo: unknown; leidoEn: number }
/** lo que hay para servir: la lectura (fresca o vieja) y por qué no es fresca, si no lo es */
export interface Parte { lectura: Lectura | null; fallo: boolean; tope: boolean }

export interface OpcionesMemoria {
  /** plazo de una lectura (ms); por clave con `ttlDe` */
  ttlMs?: number;
  ttlDe?: (clave: string) => number;
  /** tras un fallo, cuánto esperar antes de volver a llamar (por defecto 1 min) */
  esperaTrasFalloMs?: number;
  /** la lectura vieja más antigua que se sirve si el servicio falla (por defecto 24 h) */
  maxViejoMs?: number;
  /** llamadas reales por clave en una hora (por defecto 30) */
  topePorHora?: number;
  /** claves que se recuerdan como mucho (las más antiguas se olvidan; por defecto 40) */
  maxClaves?: number;
  reloj?: () => number;
}

export class MemoriaDeLecturas {
  private readonly ttlDe: (clave: string) => number;
  private readonly espera: number;
  private readonly maxViejo: number;
  private readonly tope: number;
  private readonly maxClaves: number;
  readonly reloj: () => number;
  private readonly cache = new Map<string, Lectura>();
  private readonly enCurso = new Map<string, Promise<Parte>>();
  private readonly falloEn = new Map<string, number>();
  private readonly llamadas = new Map<string, number[]>();

  constructor(o: OpcionesMemoria = {}) {
    const ttl = o.ttlMs ?? 10 * MIN;
    this.ttlDe = o.ttlDe ?? (() => ttl);
    this.espera = o.esperaTrasFalloMs ?? MIN;
    this.maxViejo = o.maxViejoMs ?? 24 * HORA;
    this.tope = o.topePorHora ?? 30;
    this.maxClaves = o.maxClaves ?? 40;
    this.reloj = o.reloj ?? Date.now;
  }

  /** La lectura de `clave`: de la memoria si está fresca; si no, `llama()` (una a la vez); si falla, la última (si no es muy vieja). Nunca lanza. */
  async lee(clave: string, llama: () => Promise<unknown>): Promise<Parte> {
    const ahora = this.reloj(), c = this.cache.get(clave);
    if (c && ahora - c.leidoEn < this.ttlDe(clave)) return { lectura: c, fallo: false, tope: false };
    const viejo = (tope: boolean): Parte => ({ lectura: c && this.reloj() - c.leidoEn < this.maxViejo ? c : null, fallo: !tope, tope });
    const f = this.falloEn.get(clave);
    if (f !== undefined && ahora - f < this.espera) return viejo(false);
    const ya = this.enCurso.get(clave);
    if (ya) return ya;
    const hechas = (this.llamadas.get(clave) ?? []).filter(t => ahora - t < HORA);
    if (hechas.length >= this.tope) { this.llamadas.set(clave, hechas); return viejo(true); }
    hechas.push(ahora); this.llamadas.set(clave, hechas);
    const p = (async (): Promise<Parte> => {
      try {
        const l = { crudo: await llama(), leidoEn: this.reloj() };
        this.cache.delete(clave); this.cache.set(clave, l); this.falloEn.delete(clave);
        while (this.cache.size > this.maxClaves) this.olvida(this.cache.keys().next().value as string);
        return { lectura: l, fallo: false, tope: false };
      } catch {
        this.falloEn.set(clave, this.reloj());
        return viejo(false);
      } finally { this.enCurso.delete(clave); }
    })();
    this.enCurso.set(clave, p);
    return p;
  }

  private olvida(clave: string): void { this.cache.delete(clave); this.falloEn.delete(clave); this.llamadas.delete(clave); }

  /** Solo lectura (para Sistema en la oficina): de cuándo es lo último de una clave y si el último intento falló. No llama a nadie. */
  estado(clave: string): { leidoEn: string | null; fallo: boolean } {
    const c = this.cache.get(clave);
    return { leidoEn: c ? new Date(c.leidoEn).toISOString() : null, fallo: this.falloEn.has(clave) };
  }
}

/** «hace N min» / «hace N h» desde una lectura, para los avisos */
export function hace(ahora: number, leidoEn: number): string {
  const m = Math.max(1, Math.round((ahora - leidoEn) / MIN));
  return m < 90 ? m + " min" : Math.round(m / 60) + " h";
}

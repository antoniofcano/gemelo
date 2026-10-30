// El tiempo de la explotación para el motor (contratos/tiempo.md): lee de Vigía las dos herramientas, se queda SOLO con la
// lista blanca de contratos/tiempo.schema.json y lo guarda en memoria para no martillear a Vigía (el actual 10 min, la
// previsión 1 h; tras un fallo no se vuelve a llamar hasta pasado un minuto). Si Vigía falla y hay una lectura anterior
// de menos de un día, se sirve esa con un aviso que dice de cuándo es.
// Lo que viene de Vigía son DATOS: los textos se recortan y se mandan tal cual (el motor los escapa); nunca se interpretan.
// `dentroDeUmbrales`, `impedimento` y `queSignificaDentroDeUmbrales` NO pasan: Vigía no autoriza tratamientos y el gemelo
// no lo insinúa. Lo que Vigía no devuelve va a null: no se estima.
import type { HerramientaTiempo, LectorVigia } from "./lector.ts";

const MIN = 60_000;

export interface Frescura { generadoEn: string | null; horasDeAntiguedad: number | null; datosDeMaqueta: boolean | null }
export interface Actual {
  naturaleza: "medido";
  estacion: { id: string | null; distanciaKm: number | null; advertencia: string | null };
  temperatura: number | null; humedadRelativa: number | null; viento: number | null; racha: number | null;
  direccion: { grados: number | null; advertencia: string | null };
  lluviaAcumulada: number | null; deltaT: number | null; inhabilitados: string[]; frescura: Frescura;
}
export interface Hora {
  instante: string; temperatura: number | null; humedadRelativa: number | null; viento: number | null; racha: number | null;
  direccion: number | null; nubosidad: number | null; lluvia: number | null; probabilidadLluvia: number | null; deltaT: number | null;
}
export interface Prevision { naturaleza: "modelado"; ambito: string | null; horas: Hora[]; frescura: Frescura }
export interface Aviso { de: "vigia" | "gemelo"; texto: string }
export interface RespuestaTiempo {
  version: 1; origen: "vigia" | "fixture"; consultadoEn: string;
  actual: Actual | null; prevision: Prevision | null; avisos: Aviso[];
}

// ---------- la lista blanca
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
/** número finito dentro del rango; si no, null (no se recorta: un dato fuera de rango no se arregla, se descarta) */
function num(v: unknown, min = -Infinity, max = Infinity): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
}
/** texto de Vigía: sin caracteres de control y recortado; el motor lo escapa al pintarlo */
function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}
function fecha(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
function frescura(v: unknown): Frescura {
  const f = obj(v) ?? {};
  return { generadoEn: fecha(f["generadoEn"]), horasDeAntiguedad: num(f["horasDeAntiguedad"], 0), datosDeMaqueta: typeof f["datosDeMaqueta"] === "boolean" ? f["datosDeMaqueta"] : null };
}
/** los avisos de antigüedad que Vigía mete en su frescura (si los trae), tal cual */
function avisosDeFrescura(v: unknown): string[] {
  const f = obj(v) ?? {};
  return ["aviso", "advertencia", "avisoDeAntiguedad"].map(k => texto(f[k], 400)).filter((s): s is string => !!s);
}

export function normalizaActual(v: unknown): Actual | null {
  const d = obj(v);
  if (!d || d["hayLectura"] !== true) return null;
  const e = obj(d["estacion"]) ?? {}, dv = obj(d["direccionViento"]) ?? {};
  const inh = Array.isArray(d["inhabilitados"]) ? d["inhabilitados"].map(x => texto(x, 60)).filter((s): s is string => !!s).slice(0, 20) : [];
  return {
    naturaleza: "medido",
    estacion: { id: texto(e["id"], 60), distanciaKm: num(e["distanciaKm"], 0), advertencia: texto(e["advertencia"], 400) },
    temperatura: num(d["temperatura"], -60, 60), humedadRelativa: num(d["humedadRelativa"], 0, 100),
    viento: num(d["viento"], 0, 100), racha: num(d["racha"], 0, 120),
    direccion: { grados: num(dv["grados"], 0, 360), advertencia: texto(dv["advertencia"], 400) },
    lluviaAcumulada: num(d["lluviaAcumulada"], 0, 2000), deltaT: num(d["deltaT"], -30, 60),
    inhabilitados: inh, frescura: frescura(d["frescura"]),
  };
}

export function normalizaPrevision(v: unknown): Prevision | null {
  const d = obj(v);
  if (!d || d["hayPrevision"] !== true || !Array.isArray(d["horas"])) return null;
  const horas: Hora[] = [];
  for (const x of d["horas"] as unknown[]) {
    const h = obj(x), instante = h && fecha(h["instante"]);
    if (!h || !instante) continue;
    horas.push({
      instante, temperatura: num(h["temperatura"], -60, 60), humedadRelativa: num(h["humedadRelativa"], 0, 100),
      viento: num(h["viento"], 0, 100), racha: num(h["racha"], 0, 120), direccion: num(h["direccion"], 0, 360),
      nubosidad: num(h["nubosidad"], 0, 100), lluvia: num(h["lluvia"], 0, 500), probabilidadLluvia: num(h["probabilidadLluvia"], 0, 100),
      deltaT: num(h["deltaT"], -30, 60),
    });
  }
  horas.sort((a, b) => Date.parse(a.instante) - Date.parse(b.instante));
  if (!horas.length) return null;
  return { naturaleza: "modelado", ambito: texto(d["ambito"], 200), horas: horas.slice(0, 96), frescura: frescura(d["frescura"]) };
}

// ---------- el histórico (GET /api/tiempo/historico)
export interface FuenteHistorico {
  id: string; temperaturaMaxima: number | null; temperaturaMinima: number | null; lluviaTotalMm: number | null;
  dias: number | null; diasSinDato: number | null;
}
export interface RespuestaHistorico {
  version: 1; origen: "vigia" | "fixture"; consultadoEn: string; desde: string; hasta: string;
  fuentes: FuenteHistorico[]; frescura: Frescura; avisos: Aviso[];
}
const entero = (v: unknown, max: number): number | null => { const n = num(v, 0, max); return n !== null && Number.isInteger(n) ? n : null; };

/** Lista blanca de historico_meteo: solo las fuentes con id (una por estación) y sus cifras de la semana; lo que falta, null. */
export function normalizaHistorico(v: unknown): { fuentes: FuenteHistorico[]; frescura: Frescura } | null {
  const d = obj(v);
  if (!d || !Array.isArray(d["porFuente"])) return null;
  const fuentes: FuenteHistorico[] = [];
  for (const x of d["porFuente"] as unknown[]) {
    const f = obj(x), id = f && texto(f["id"], 60);
    if (!f || !id) continue;
    fuentes.push({
      id, temperaturaMaxima: num(f["temperaturaMaxima"], -60, 60), temperaturaMinima: num(f["temperaturaMinima"], -60, 60),
      lluviaTotalMm: num(f["lluviaTotalMm"], 0, 5000), dias: entero(f["dias"], 366), diasSinDato: entero(f["diasSinDato"], 366),
    });
  }
  return { fuentes: fuentes.slice(0, 10), frescura: frescura(d["frescura"]) };
}

// ---------- la caché
interface Lectura { crudo: unknown; leidoEn: number }
interface Parte { lectura: Lectura | null; fallo: boolean }

export interface OpcionesServicio {
  ttlActualMs?: number; ttlPrevisionMs?: number; esperaTrasFalloMs?: number; maxViejoMs?: number; reloj?: () => number;
}

export class ServicioTiempo {
  private readonly lector: LectorVigia;
  private readonly ttl: Record<HerramientaTiempo, number>;
  private readonly espera: number;
  private readonly maxViejo: number;
  private readonly reloj: () => number;
  private readonly cache = new Map<HerramientaTiempo, Lectura>();
  private readonly enCurso = new Map<HerramientaTiempo, Promise<Parte>>();
  private readonly falloEn = new Map<HerramientaTiempo, number>();

  constructor(lector: LectorVigia, o: OpcionesServicio = {}) {
    this.lector = lector;
    this.ttl = { tiempo_en_la_explotacion: o.ttlActualMs ?? 10 * MIN, prevision_72_horas: o.ttlPrevisionMs ?? 60 * MIN };
    this.espera = o.esperaTrasFalloMs ?? MIN;
    this.maxViejo = o.maxViejoMs ?? 24 * 60 * MIN;
    this.reloj = o.reloj ?? Date.now;
  }

  get origen() { return this.lector.origen; }

  /** una herramienta: de la caché si está fresca; si no, una sola llamada a la vez; si falla, la última lectura (si no es muy vieja) */
  private async parte(h: HerramientaTiempo): Promise<Parte> {
    const ahora = this.reloj(), c = this.cache.get(h);
    if (c && ahora - c.leidoEn < this.ttl[h]) return { lectura: c, fallo: false };
    const viejo = (): Parte => ({ lectura: c && this.reloj() - c.leidoEn < this.maxViejo ? c : null, fallo: true });
    const f = this.falloEn.get(h);
    if (f !== undefined && ahora - f < this.espera) return viejo();
    const ya = this.enCurso.get(h);
    if (ya) return ya;
    const p = (async (): Promise<Parte> => {
      try {
        const crudo = await this.lector.llama(h);
        const l = { crudo, leidoEn: this.reloj() };
        this.cache.set(h, l); this.falloEn.delete(h);
        return { lectura: l, fallo: false };
      } catch {
        this.falloEn.set(h, this.reloj());
        return viejo();
      } finally { this.enCurso.delete(h); }
    })();
    this.enCurso.set(h, p);
    return p;
  }

  /** null si Vigía no ha respondido a ninguna de las dos y no hay lectura anterior que servir */
  async lee(): Promise<RespuestaTiempo | null> {
    const [a, p] = await Promise.all([this.parte("tiempo_en_la_explotacion"), this.parte("prevision_72_horas")]);
    if (!a.lectura && !p.lectura) return null;
    const ahora = this.reloj(), avisos: Aviso[] = [];
    const actual = a.lectura ? normalizaActual(a.lectura.crudo) : null;
    const prevision = p.lectura ? normalizaPrevision(p.lectura.crudo) : null;
    const hace = (l: Lectura) => { const m = Math.max(1, Math.round((ahora - l.leidoEn) / MIN)); return m < 90 ? m + " min" : Math.round(m / 60) + " h"; };
    for (const [parte, nombre, valor, crudo] of [[a, "La lectura de la estación", actual, a.lectura?.crudo], [p, "La previsión", prevision, p.lectura?.crudo]] as const) {
      if (parte.fallo && parte.lectura) avisos.push({ de: "gemelo", texto: "Vigía no ha respondido ahora: " + nombre.toLowerCase() + " es la última que llegó, de hace " + hace(parte.lectura) + "." });
      else if (parte.fallo) avisos.push({ de: "gemelo", texto: nombre + " no ha llegado de Vigía." });
      else if (!valor) avisos.push({ de: "gemelo", texto: nombre + ": Vigía no tiene dato ahora mismo." });
      const o = obj(crudo);
      if (o) for (const t of avisosDeFrescura(o["frescura"])) avisos.push({ de: "vigia", texto: t });
      if (valor?.frescura.datosDeMaqueta) avisos.push({ de: "gemelo", texto: nombre + ": Vigía avisa de que son datos de maqueta." });
    }
    const leidos = [a.lectura, p.lectura].filter((l): l is Lectura => !!l).map(l => l.leidoEn);
    return {
      version: 1, origen: this.lector.origen, consultadoEn: new Date(Math.min(...leidos)).toISOString(),
      actual, prevision, avisos: avisos.slice(0, 20),
    };
  }

  private readonly cacheHis = new Map<string, Lectura>();
  private readonly enCursoHis = new Map<string, Promise<RespuestaHistorico | null>>();
  private readonly falloHis = new Map<string, number>();

  /** El histórico entre dos días (caché 1 h por rango, una llamada a la vez, un minuto de espera tras un fallo). null si no hay dato que servir. */
  async historico(desde: string, hasta: string): Promise<RespuestaHistorico | null> {
    const clave = desde + "|" + hasta, ahora = this.reloj(), c = this.cacheHis.get(clave);
    const arma = (l: Lectura, viejo: boolean): RespuestaHistorico | null => {
      const n = normalizaHistorico(l.crudo);
      if (!n) return null;
      const avisos: Aviso[] = [];
      if (viejo) avisos.push({ de: "gemelo", texto: "Vigía no ha respondido ahora: el histórico es el último que llegó, de hace " + Math.max(1, Math.round((this.reloj() - l.leidoEn) / MIN)) + " min." });
      for (const t of avisosDeFrescura(obj(l.crudo)?.["frescura"])) avisos.push({ de: "vigia", texto: t });
      if (n.frescura.datosDeMaqueta) avisos.push({ de: "gemelo", texto: "El histórico: Vigía avisa de que son datos de maqueta." });
      return { version: 1, origen: this.lector.origen, consultadoEn: new Date(l.leidoEn).toISOString(), desde, hasta, fuentes: n.fuentes, frescura: n.frescura, avisos: avisos.slice(0, 20) };
    };
    if (c && ahora - c.leidoEn < this.ttl["prevision_72_horas"]) return arma(c, false);
    const viejo = () => (c && this.reloj() - c.leidoEn < this.maxViejo ? arma(c, true) : null);
    const f = this.falloHis.get(clave);
    if (f !== undefined && ahora - f < this.espera) return viejo();
    const ya = this.enCursoHis.get(clave);
    if (ya) return ya;
    const p = (async (): Promise<RespuestaHistorico | null> => {
      try {
        const l = { crudo: await this.lector.historico(desde, hasta), leidoEn: this.reloj() };
        this.cacheHis.set(clave, l); this.falloHis.delete(clave);
        if (this.cacheHis.size > 40) this.cacheHis.delete(this.cacheHis.keys().next().value as string);
        return arma(l, false);
      } catch { this.falloHis.set(clave, this.reloj()); return viejo(); }
      finally { this.enCursoHis.delete(clave); }
    })();
    this.enCursoHis.set(clave, p);
    return p;
  }

  async cierra(): Promise<void> { await this.lector.cierra(); }
}

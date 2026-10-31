// Lector de pruebas: respuestas SINTÉTICAS (ninguna es de Vigía real) en <carpeta>/<herramienta>.json, con la forma que
// devuelve Vigía. Para que el mundo tenga sentido en local, las fechas se corren a «ahora»: la previsión empieza en la hora
// en curso y lo generado es de hace 20 minutos. Nunca en producción (config.ts lo impide).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ErrorDeVigia, esHerramientaTiempo, type HerramientaTiempo, type LectorVigia } from "./lector.ts";

const HORA = 3_600_000;

/** Corre las fechas de una respuesta sintética para que valga «ahora» (sin tocar el resto). */
export function reubica(herramienta: HerramientaTiempo, datos: unknown, ahora: number): unknown {
  const d = structuredClone(datos) as Record<string, unknown>;
  const f = d["frescura"] as Record<string, unknown> | undefined;
  if (f && typeof f === "object") { f["generadoEn"] = new Date(ahora - 20 * 60_000).toISOString(); f["horasDeAntiguedad"] = 0.3; }
  if (herramienta === "prevision_72_horas" && Array.isArray(d["horas"])) {
    const horas = d["horas"] as Record<string, unknown>[];
    const primera = Date.parse(String(horas[0]?.["instante"]));
    if (Number.isFinite(primera)) {
      const salto = Math.floor(ahora / HORA) * HORA - primera;
      for (const h of horas) { const t = Date.parse(String(h["instante"])); if (Number.isFinite(t)) h["instante"] = new Date(t + salto).toISOString(); }
    }
  }
  return d;
}

export class LectorVigiaFixture implements LectorVigia {
  readonly origen = "fixture" as const;
  readonly llamadas: HerramientaTiempo[] = [];
  /** para las pruebas: respuestas que sustituyen a las del fichero, o un error */
  readonly sustituye = new Map<HerramientaTiempo, unknown>();
  private readonly carpeta: string;
  private readonly reloj: () => number;

  constructor(carpeta: string, reloj: () => number = Date.now) { this.carpeta = carpeta; this.reloj = reloj; }

  async llama(herramienta: HerramientaTiempo): Promise<unknown> {
    if (!esHerramientaTiempo(herramienta)) throw new ErrorDeVigia("herramienta fuera de la lista del tiempo");
    this.llamadas.push(herramienta);
    const s = this.sustituye.get(herramienta);
    if (s instanceof Error) throw s;
    if (s !== undefined) return structuredClone(s);
    let datos: unknown;
    try { datos = JSON.parse(await readFile(join(this.carpeta, herramienta + ".json"), "utf8")); }
    catch { throw new ErrorDeVigia(herramienta + ": no se puede leer el fixture"); }
    return reubica(herramienta, datos, this.reloj());
  }

  /** el histórico sintético (<carpeta>/historico_meteo.json), tal cual; en pruebas se sustituye con `sustituyeHistorico` (o un Error) */
  sustituyeHistorico: unknown = undefined;
  readonly llamadasHistorico: [string, string][] = [];
  async historico(desde: string, hasta: string): Promise<unknown> {
    this.llamadasHistorico.push([desde, hasta]);
    const s = this.sustituyeHistorico;
    if (s instanceof Error) throw s;
    if (s !== undefined) return structuredClone(s);
    try { return JSON.parse(await readFile(join(this.carpeta, "historico_meteo.json"), "utf8")); }
    catch { throw new ErrorDeVigia("historico_meteo: no se puede leer el fixture"); }
  }

  /** el estado del olivar sintético (<carpeta>/estado_del_olivar_hoy.json), generado «hace 20 min»; en pruebas, `sustituyeOlivar` (o un Error) */
  sustituyeOlivar: unknown = undefined;
  llamadasOlivar = 0;
  async olivarHoy(): Promise<unknown> {
    this.llamadasOlivar++;
    const s = this.sustituyeOlivar;
    if (s instanceof Error) throw s;
    if (s !== undefined) return structuredClone(s);
    let d: Record<string, unknown>;
    try { d = JSON.parse(await readFile(join(this.carpeta, "estado_del_olivar_hoy.json"), "utf8")) as Record<string, unknown>; }
    catch { throw new ErrorDeVigia("estado_del_olivar_hoy: no se puede leer el fixture"); }
    const f = d["frescura"] as Record<string, unknown> | undefined;
    if (f && typeof f === "object") { f["generadoEn"] = new Date(this.reloj() - 20 * 60_000).toISOString(); f["horasDeAntiguedad"] = 0.3; }
    return d;
  }

  async cierra(): Promise<void> { /* nada */ }
}

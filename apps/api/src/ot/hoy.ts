// GET /api/ot/hoy (contratos/ot-hoy.md, versión 1): lo de HOY que la historia leía por el conector de claude.ai (retirado,
// decisión 79), ahora leído por la api: de OlivarTrack, `tareas_abiertas`, `trabajo_realizado` y `atencion_de_hoy`; de
// Vigía, `estado_del_olivar_hoy`. Solo lectura, con la memoria común de las lecturas en vivo (vivo/memoria.ts: plazo,
// una llamada a la vez, espera tras un fallo, tope por hora y lo último que llegó si falla) y con LISTA BLANCA campo a campo:
//  · nada por persona (ni quién, ni asignados, ni horas por persona), ni GPS ni geometrías, ni textos de campo (partes,
//    observaciones, asuntos). Pasan el título de la tarea (lo pone la oficina; ya lo trae la instantánea D.ot), el `texto`
//    de los recuentos de atención (OlivarTrack los da «sin un nombre») y el motivo de Vigía: recortados y como DATOS.
//  · los ids de tarea de OlivarTrack no salen: van como `clave`, una huella opaca que solo sirve para cruzar las dos listas.
//  · `truncado` / `parcial` se dicen (y `completo: false`); lo que no tiene la forma esperada se descarta y se cuenta.
//  · de Vigía no pasan `dentroDeUmbrales` ni ids internos ni geometrías: Vigía no autoriza tratamientos.
// [NO VERIFICADO contra los servicios reales: las formas son las que leía el motor por el conector y las que describen las herramientas]
import { huella } from "../seguridad/cripto.ts";
import type { LectorVigia } from "../vigia/lector.ts";
import { avisosDeFrescura, type Frescura, frescura } from "../vigia/servicio.ts";
import { clave, dia, entero, fecha, idParcela, num, obj, texto } from "../vivo/lista-blanca.ts";
import { hace, type Lectura, MemoriaDeLecturas, type Parte } from "../vivo/memoria.ts";
import type { HerramientaHoy, LectorOlivarTrack } from "./lector.ts";

const MIN = 60_000;
export const MAX_TAREAS = 500;
const MAX_MIRADAS = 100;
const MAX_ATENCION = 30;
const ESTADOS_ABIERTOS = new Set(["pendiente", "activo", "pausada"]);

export type De = "gemelo" | "olivartrack" | "vigia";
export interface Aviso { de: De; texto: string }
export interface TareaAbierta { clave: string; parcela: string | null; finca: string | null; tipo: string; nombre: string | null; fecha: string | null; estado: string }
export interface Avance { pct: number | null; hecho: number | null; objetivo: number | null }
export interface TareaHecha { clave: string; parcela: string | null; finca: string | null; tipo: string; titulo: string | null; completadaEn: string | null; estado: string; avance: Avance | null }
export interface PuntoAtencion { tipo: string; n: number; severidad: string | null; texto: string | null }
export interface Mirada { parcela: string; gravedad: string | null; motivo: string | null; comoSeLee: string | null }
interface ParteComun { leidoEn: string; consultadoEn: string | null; viejo: boolean; descartadas: number }
export interface ParteAbiertas extends ParteComun { truncado: boolean; tareas: TareaAbierta[] }
export interface ParteTrabajo extends ParteComun { desde: string; hasta: string | null; truncado: boolean; tareas: TareaHecha[] }
export interface ParteAtencion extends ParteComun { parcial: boolean; total: number | null; puntos: PuntoAtencion[] }
export interface ParteVigia extends ParteComun { fecha: string | null; calibrada: boolean | null; frescura: Frescura; pidenUnaMirada: Mirada[] }
export interface RespuestaHoy {
  version: 1;
  origen: { ot: "olivartrack" | "grabado" | null; vigia: "vigia" | "fixture" | null };
  consultadoEn: string; completo: boolean;
  tareasAbiertas: ParteAbiertas | null; trabajoRealizado: ParteTrabajo | null; atencion: ParteAtencion | null; vigia: ParteVigia | null;
  avisos: Aviso[];
}

// ---------- la lista blanca (pura: se prueba sola)
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const cl = (id: unknown): string | null => (typeof id === "string" && id.length > 0 && id.length <= 120) || (typeof id === "number" && Number.isFinite(id)) ? huella("ot-tarea:" + String(id)) : null;
const si = (v: unknown): boolean => v === true;

export function normalizaAbiertas(v: unknown): { truncado: boolean; tareas: TareaAbierta[]; descartadas: number; consultadoEn: string | null; recortado: boolean } | null {
  const d = obj(v);
  if (!d || !Array.isArray(d["tareas"])) return null;
  const tareas: TareaAbierta[] = [];
  let descartadas = 0;
  for (const x of lista(d["tareas"])) {
    const t = obj(x), k = t && cl(t["id"]), tipo = t && clave(t["tipo"]), estado = t && clave(t["estado"]);
    if (!t || !k || !tipo || !estado || !ESTADOS_ABIERTOS.has(estado)) { descartadas++; continue; }
    tareas.push({ clave: k, parcela: idParcela(t["parcelaId"]), finca: texto(t["fincaNombre"], 80), tipo, nombre: texto(t["nombre"], 120), fecha: dia(t["fecha"]), estado });
  }
  return { truncado: si(d["truncado"]), tareas: tareas.slice(0, MAX_TAREAS), descartadas, consultadoEn: fecha(d["consultadoEn"]), recortado: tareas.length > MAX_TAREAS };
}

function avance(v: unknown): Avance | null {
  const a = obj(v);
  if (!a) return null;
  const r = { pct: num(a["pct"], 0, 100), hecho: entero(a["hecho"], 1e7), objetivo: entero(a["objetivo"], 1e7) };
  return r.pct === null && r.hecho === null && r.objetivo === null ? null : r;
}

export function normalizaTrabajo(v: unknown): { truncado: boolean; tareas: TareaHecha[]; descartadas: number; consultadoEn: string | null; hasta: string | null; recortado: boolean } | null {
  const d = obj(v);
  if (!d || !Array.isArray(d["tareas"])) return null;
  const tareas: TareaHecha[] = [];
  let descartadas = 0;
  for (const x of lista(d["tareas"])) {
    const t = obj(x), k = t && cl(t["id"]), tipo = t && clave(t["tipo"]), estado = t && clave(t["estado"]);
    if (!t || !k || !tipo || !estado) { descartadas++; continue; }
    tareas.push({ clave: k, parcela: idParcela(t["parcela"]), finca: texto(t["finca"], 80), tipo, titulo: texto(t["titulo"], 120), completadaEn: dia(t["completadaEn"]), estado, avance: avance(t["avance"]) });
  }
  return { truncado: si(d["truncado"]), tareas: tareas.slice(0, MAX_TAREAS), descartadas, consultadoEn: fecha(d["consultadoEn"]), hasta: dia(d["hasta"]), recortado: tareas.length > MAX_TAREAS };
}

export function normalizaAtencion(v: unknown): { parcial: boolean; total: number | null; puntos: PuntoAtencion[]; descartadas: number; consultadoEn: string | null; avisos: string[] } | null {
  const d = obj(v);
  if (!d || !Array.isArray(d["atencion"])) return null;
  const puntos: PuntoAtencion[] = [];
  let descartadas = 0;
  for (const x of lista(d["atencion"])) {
    const p = obj(x), tipo = p && clave(p["tipo"], 60), n = p && entero(p["n"], 1e6);
    if (!p || !tipo || n === null) { descartadas++; continue; }
    puntos.push({ tipo, n, severidad: clave(p["severidad"]), texto: texto(p["texto"], 160) });
  }
  const avisos = lista(d["avisos"]).map(a => texto(a, 400)).filter((s): s is string => !!s).slice(0, 5);
  return { parcial: si(d["parcial"]), total: entero(d["total"], 1e6), puntos: puntos.slice(0, MAX_ATENCION), descartadas, consultadoEn: fecha(d["consultadoEn"]), avisos };
}

export function normalizaOlivar(v: unknown): { fecha: string | null; calibrada: boolean | null; frescura: Frescura; pidenUnaMirada: Mirada[]; descartadas: number; avisos: string[] } | null {
  const d = obj(v);
  if (!d || !Array.isArray(d["pidenUnaMirada"])) return null;
  const pidenUnaMirada: Mirada[] = [];
  let descartadas = 0;
  for (const x of lista(d["pidenUnaMirada"])) {
    const m = obj(x), parcela = m && texto(m["parcela"], 80);
    if (!m || !parcela) { descartadas++; continue; }
    pidenUnaMirada.push({ parcela, gravedad: clave(m["gravedad"]), motivo: texto(m["motivo"], 300), comoSeLee: texto(m["comoSeLee"], 300) });
  }
  const c = obj(d["calibracion"]);
  return {
    fecha: dia(d["fecha"]), calibrada: c && typeof c["calibrada"] === "boolean" ? c["calibrada"] : null, frescura: frescura(d["frescura"]),
    pidenUnaMirada: pidenUnaMirada.slice(0, MAX_MIRADAS), descartadas, avisos: avisosDeFrescura(d["frescura"]),
  };
}

/** el primer día del mes de hace seis meses (UTC): el `desde` de trabajo_realizado; estable todo el mes, para que la memoria sirva */
export function desdeTrabajo(ahora: number): string {
  const d = new Date(ahora);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 6, 1)).toISOString().slice(0, 10);
}

// ---------- el servicio
export interface OpcionesHoy { ttlMs?: Partial<Record<HerramientaHoy | "estado_del_olivar_hoy", number>>; esperaTrasFalloMs?: number; maxViejoMs?: number; topePorHora?: number; reloj?: () => number }
export interface FuenteOt { lector: LectorOlivarTrack; origen: "olivartrack" | "grabado" }

const NOMBRES: Record<string, string> = { tareas_abiertas: "Las tareas abiertas", trabajo_realizado: "El trabajo hecho", atencion_de_hoy: "La atención de hoy", estado_del_olivar_hoy: "Lo que marca Vigía" };
const titulo = (h: string): string => NOMBRES[h] ?? h;

export class ServicioHoy {
  private readonly ot: FuenteOt | null;
  private readonly vig: LectorVigia | null;
  private readonly memoria: MemoriaDeLecturas;
  private readonly reloj: () => number;

  constructor(ot: FuenteOt | null, vigia: LectorVigia | null, o: OpcionesHoy = {}) {
    this.ot = ot; this.vig = vigia;
    this.reloj = o.reloj ?? Date.now;
    const ttl: Record<string, number> = { tareas_abiertas: 10 * MIN, trabajo_realizado: 30 * MIN, atencion_de_hoy: 10 * MIN, estado_del_olivar_hoy: 60 * MIN, ...o.ttlMs };
    this.memoria = new MemoriaDeLecturas({
      ttlDe: k => ttl[k.split("|")[0]!] ?? 10 * MIN, esperaTrasFalloMs: o.esperaTrasFalloMs ?? MIN, maxViejoMs: o.maxViejoMs ?? 24 * 60 * MIN,
      topePorHora: o.topePorHora ?? 12, maxClaves: 10, reloj: this.reloj,
    });
  }

  get activo(): boolean { return !!(this.ot || this.vig); }

  /** null si no hay nada que servir (todo apagado, o todo ha fallado sin lectura anterior) */
  async lee(): Promise<RespuestaHoy | null> {
    const ahora = this.reloj(), desde = desdeTrabajo(ahora), ot = this.ot, vig = this.vig;
    const nada: Promise<Parte | null> = Promise.resolve(null);
    const [pa, pt, pn, pv] = await Promise.all([
      ot ? this.memoria.lee("tareas_abiertas", () => ot.lector.llama("tareas_abiertas", {})) : nada,
      ot ? this.memoria.lee("trabajo_realizado|" + desde, () => ot.lector.llama("trabajo_realizado", { desde })) : nada,
      ot ? this.memoria.lee("atencion_de_hoy", () => ot.lector.llama("atencion_de_hoy", {})) : nada,
      vig ? this.memoria.lee("estado_del_olivar_hoy", () => vig.olivarHoy()) : nada,
    ]);
    const avisos: Aviso[] = [];
    let completo = true, masViejo = Infinity;
    const comun = (h: string, p: Parte | null): { l: Lectura; c: Omit<ParteComun, "consultadoEn" | "descartadas"> } | null => {
      if (!p) { completo = false; return null; }
      const viejo = p.fallo || p.tope;
      if (viejo) completo = false;
      const quien = h === "estado_del_olivar_hoy" ? "Vigía" : "OlivarTrack";
      if (!p.lectura) { avisos.push({ de: "gemelo", texto: titulo(h) + ": " + quien + " no ha respondido y no hay una lectura anterior." }); return null; }
      if (viejo) avisos.push({ de: "gemelo", texto: titulo(h) + ": " + (p.tope ? "el servidor ya ha preguntado a " + quien + " muchas veces esta hora" : quien + " no ha respondido ahora") + "; es lo último que llegó, de hace " + hace(this.reloj(), p.lectura.leidoEn) + "." });
      masViejo = Math.min(masViejo, p.lectura.leidoEn);
      return { l: p.lectura, c: { leidoEn: new Date(p.lectura.leidoEn).toISOString(), viejo } };
    };
    const malForma = (h: string) => { completo = false; avisos.push({ de: "gemelo", texto: titulo(h) + ": la respuesta no tiene la forma esperada y no se muestra." }); };
    const descartes = (h: string, n: number) => { if (n <= 0) return; completo = false; avisos.push({ de: "gemelo", texto: titulo(h) + ": " + n + (n === 1 ? " elemento" : " elementos") + " sin la forma esperada no se muestra" + (n === 1 ? "" : "n") + "." }); };
    const incompleta = (h: string, por: string) => { completo = false; avisos.push({ de: "olivartrack", texto: titulo(h) + ": OlivarTrack avisa de que no está completo (" + por + "); no se sacan totales." }); };

    let tareasAbiertas: ParteAbiertas | null = null, trabajoRealizado: ParteTrabajo | null = null, atencion: ParteAtencion | null = null, vigia: ParteVigia | null = null;
    const a = comun("tareas_abiertas", pa);
    if (a) {
      const n = normalizaAbiertas(a.l.crudo);
      if (!n) malForma("tareas_abiertas");
      else {
        if (n.truncado || n.recortado) incompleta("tareas_abiertas", "truncado");
        descartes("tareas_abiertas", n.descartadas);
        tareasAbiertas = { ...a.c, consultadoEn: n.consultadoEn, descartadas: n.descartadas, truncado: n.truncado || n.recortado, tareas: n.tareas };
      }
    }
    const t = comun("trabajo_realizado", pt);
    if (t) {
      const n = normalizaTrabajo(t.l.crudo);
      if (!n) malForma("trabajo_realizado");
      else {
        if (n.truncado || n.recortado) incompleta("trabajo_realizado", "truncado");
        descartes("trabajo_realizado", n.descartadas);
        trabajoRealizado = { ...t.c, consultadoEn: n.consultadoEn, descartadas: n.descartadas, desde, hasta: n.hasta, truncado: n.truncado || n.recortado, tareas: n.tareas };
      }
    }
    const at = comun("atencion_de_hoy", pn);
    if (at) {
      const n = normalizaAtencion(at.l.crudo);
      if (!n) malForma("atencion_de_hoy");
      else {
        if (n.parcial) incompleta("atencion_de_hoy", "parcial");
        for (const s of n.avisos) avisos.push({ de: "olivartrack", texto: s });
        descartes("atencion_de_hoy", n.descartadas);
        atencion = { ...at.c, consultadoEn: n.consultadoEn, descartadas: n.descartadas, parcial: n.parcial, total: n.total, puntos: n.puntos };
      }
    }
    const v = comun("estado_del_olivar_hoy", pv);
    if (v) {
      const n = normalizaOlivar(v.l.crudo);
      if (!n) malForma("estado_del_olivar_hoy");
      else {
        for (const s of n.avisos) avisos.push({ de: "vigia", texto: s });
        if (n.frescura.datosDeMaqueta) avisos.push({ de: "gemelo", texto: "Lo que marca Vigía: Vigía avisa de que son datos de maqueta." });
        descartes("estado_del_olivar_hoy", n.descartadas);
        vigia = { ...v.c, consultadoEn: n.frescura.generadoEn, descartadas: n.descartadas, fecha: n.fecha, calibrada: n.calibrada, frescura: n.frescura, pidenUnaMirada: n.pidenUnaMirada };
      }
    }
    if (!tareasAbiertas && !trabajoRealizado && !atencion && !vigia) return null;
    return {
      version: 1, origen: { ot: ot ? ot.origen : null, vigia: vig ? vig.origen : null },
      consultadoEn: new Date(Number.isFinite(masViejo) ? masViejo : ahora).toISOString(), completo,
      tareasAbiertas, trabajoRealizado, atencion, vigia, avisos: avisos.slice(0, 20),
    };
  }

  /** Solo lectura (Sistema en la oficina): de cuándo es lo último de cada herramienta. No llama a nadie. */
  estado() {
    const desde = desdeTrabajo(this.reloj());
    return ["tareas_abiertas", "trabajo_realizado|" + desde, "atencion_de_hoy", "estado_del_olivar_hoy"].map(k => ({ herramienta: k.split("|")[0]!, ...this.memoria.estado(k) }));
  }
}


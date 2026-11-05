// GET /api/mundo/hoy (contratos/mundo-hoy.md, versión 1): «el mundo de hoy» en una sola respuesta pequeña, para que el motor arranque en el día
// real (EV-3a; idea D de doc/rumbo/EV-3-QUE-LA-GENTE-VUELVA.md). NO lee nada nuevo de fuera (regla 12): compone lo que ya leen
//  · ServicioTiempo (vigia/servicio.ts): el actual MEDIDO de la estación y la previsión MODELADA, resumida por días (hoy, mañana, pasado);
//  · ServicioHoy (ot/hoy.ts): las tareas abiertas y el trabajo hecho de OlivarTrack y lo que marca Vigía, con su memoria, su tope y su lista blanca;
//  · la fenología que la sincronía ya guardó en la base (eventos_haza, olivartrack-sync.md), con una memoria de GEMELO_OT_CADA_MIN.
// Reglas (contratos/mcp.md):
//  · NADA POR PERSONA: el trabajo de la semana va agregado por parcela y por finca, contado por tipo de tarea; ni títulos ni personas.
//  · truncado / parcial NO es completo: se dice (`completo: false`) y los recuentos van a null (no se sacan totales).
//  · Los textos de fuera (nombres de finca y de parcela de Vigía) son DATOS: recortados, sin caracteres de control; el motor los escapa. Los AVISOS DEL
//    CAMPO los redacta el gemelo con frases fijas y solo cifras: ningún texto de fuera entra en su frase (las parcelas van aparte, en `parcelas`).
//  · VIGÍA NO AUTORIZA TRATAMIENTOS: lo que marca solo dice dónde mirar. Ninguna frase de aviso habla de tratar; ni ventanas de tratamiento, ni
//    `dentroDeUmbrales`, ni delta T pasan a esta respuesta.
//  · Cada parte dice de cuándo es (`leidoEn`: cuándo la leyó la api; `consultadoEn`: lo que dice la fuente) y de dónde sale (`procedencia`).
// Con GEMELO_OT=no y GEMELO_VIGIA=no responde igual, con esas partes en null y `disponible: false` por fuente (la ruta nunca da 503).
import { dia as diaDe, idParcela, obj, texto } from "../vivo/lista-blanca.ts";
import { MemoriaDeLecturas, type Parte } from "../vivo/memoria.ts";
import type { RespuestaHoy, ServicioHoy } from "../ot/hoy.ts";
import type { RespuestaTiempo, ServicioTiempo } from "../vigia/servicio.ts";

export const ZONA = "Europe/Madrid";
const MIN = 60_000, DIA = 86_400_000;
const MAX_PARCELAS = 200, MAX_AVISO_PARCELAS = 50, MAX_NOTAS = 20;

export type Procedencia = "medido" | "modelado" | "deducido";
export type TipoAviso = "recogida" | "helada" | "lluvia" | "fenologia" | "mirada";
export const TIPOS_AVISO: readonly TipoAviso[] = ["recogida", "helada", "lluvia", "fenologia", "mirada"];
export type De = "gemelo" | "olivartrack" | "vigia";

/** La frase fija que acompaña a todo lo que viene de Vigía. Es la ÚNICA mención a tratamientos que puede llevar un aviso, y es para negarla. */
export const NO_AUTORIZA = "Sirve para decidir dónde mirar: no es un diagnóstico ni una recomendación de tratamiento, y ninguna capa está calibrada con observación de campo.";

export interface AvisoCampo {
  clave: string; tipo: TipoAviso; texto: string; parcelas: string[]; de: "olivartrack" | "vigia";
  procedencia: "deducido"; basadoEn: "medido" | "modelado"; consultadoEn: string | null; completo: boolean;
}
export interface Nota { de: De; texto: string }
export interface EstadoFuente {
  encendida: boolean; disponible: boolean; origen: string | null;
  leidoEn: string | null; consultadoEn: string | null; viejo: boolean; completo: boolean; motivo: "apagada" | "sin_respuesta" | null;
}
export interface DiaPrevision { fecha: string; tmax: number | null; tmin: number | null; lluviaMm: number | null; probabilidadLluviaMax: number | null; horas: number }
export interface TiempoHoy {
  leidoEn: string;
  actual: { procedencia: "medido"; consultadoEn: string | null; estacion: string | null; temperatura: number | null; humedadRelativa: number | null; viento: number | null; lluviaAcumulada: number | null } | null;
  previsionCorta: { procedencia: "modelado"; consultadoEn: string | null; dias: DiaPrevision[] } | null;
}
export interface FenologiaParcela { parcela: string; bbch: number; fecha: string; etapa: string }
export interface FenologiaHoy { procedencia: "medido"; leidoEn: string; consultadoEn: string | null; viejo: boolean; completo: boolean; parcelas: FenologiaParcela[] }
export interface Recuento { tipo: string; n: number | null }
export interface TrabajoParcela { parcela: string; finca: string | null; enCurso: Recuento[]; hechas: Recuento[] }
export interface TrabajoFinca { finca: string; enCurso: number | null; hechas: number | null }
export interface TrabajoSemana {
  procedencia: "medido"; desde: string; hasta: string; leidoEn: string; consultadoEn: string | null; viejo: boolean; completo: boolean;
  porParcela: TrabajoParcela[]; porFinca: TrabajoFinca[]; sinParcela: number | null;
}
export interface MiradasHoy { procedencia: "deducido"; leidoEn: string; consultadoEn: string | null; viejo: boolean; calibrada: boolean | null; nota: string; parcelas: { parcela: string; gravedad: string | null }[] }
export interface RespuestaMundoHoy {
  version: 1;
  generadoEn: string;
  ahora: { fecha: string; hora: string; zona: typeof ZONA; diaDelAnio: number; estacionDelAnio: "primavera" | "verano" | "otoño" | "invierno" };
  fuentes: { olivartrack: EstadoFuente; vigia: EstadoFuente };
  tiempo: TiempoHoy | null;
  fenologia: FenologiaHoy | null;
  trabajoSemana: TrabajoSemana | null;
  miradas: MiradasHoy | null;
  avisos: AvisoCampo[];
  notas: Nota[];
  completo: boolean;
}

// ---------------------------------------------------------------- el día de Madrid (puro)
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** «AAAA-MM-DD» del día de Madrid en ese instante */
export const diaMadrid = (ms: number): string => fmtDia.format(new Date(ms));
/** «HH:MM» de Madrid en ese instante */
export const horaMadrid = (ms: number): string => fmtHora.format(new Date(ms));
/** el día «AAAA-MM-DD» n días después (o antes) */
export function sumaDias(d: string, n: number): string { return new Date(Date.parse(d + "T12:00:00Z") + n * DIA).toISOString().slice(0, 10); }
export function diaDelAnio(d: string): number { const t = Date.parse(d + "T12:00:00Z"), y = new Date(t).getUTCFullYear(); return Math.round((t - Date.UTC(y, 0, 0, 12)) / DIA); }
/** la estación astronómica aproximada (deducida del calendario; los equinoccios y solsticios se toman fijos) */
export function estacionDelAnio(d: string): RespuestaMundoHoy["ahora"]["estacionDelAnio"] {
  const md = d.slice(5);
  return md >= "12-21" || md < "03-20" ? "invierno" : md < "06-21" ? "primavera" : md < "09-22" ? "verano" : "otoño";
}
/** la etapa de un BBCH en palabras (la misma escala que 23_estacion.js) */
export function etapaBBCH(b: number): string {
  return b < 10 ? "reposo y brotación" : b < 50 ? "crecimiento de los brotes" : b < 60 ? "inflorescencias" : b < 70 ? "floración" : b < 80 ? "cuajado y crecimiento del fruto" : "envero y maduración";
}

// ---------------------------------------------------------------- el tiempo de hoy (puro)
/** La previsión horaria resumida por días de Madrid: hoy, mañana y pasado (lo que falte, no se estima). */
export function previsionPorDias(t: RespuestaTiempo | null, hoy: string): DiaPrevision[] {
  const horas = t?.prevision?.horas ?? [], dias = [hoy, sumaDias(hoy, 1), sumaDias(hoy, 2)];
  return dias.map(fecha => {
    const hs = horas.filter(h => diaMadrid(Date.parse(h.instante)) === fecha);
    const v = (k: "temperatura" | "lluvia" | "probabilidadLluvia") => hs.map(h => h[k]).filter((x): x is number => typeof x === "number");
    const te = v("temperatura"), ll = v("lluvia"), pr = v("probabilidadLluvia");
    return {
      fecha, horas: hs.length, tmax: te.length ? Math.max(...te) : null, tmin: te.length ? Math.min(...te) : null,
      lluviaMm: ll.length ? Math.round(ll.reduce((a, b) => a + b, 0) * 10) / 10 : null, probabilidadLluviaMax: pr.length ? Math.max(...pr) : null,
    };
  }).filter(d => d.horas > 0);
}

export function tiempoHoy(t: RespuestaTiempo | null, hoy: string): TiempoHoy | null {
  if (!t) return null;
  const a = t.actual, dias = previsionPorDias(t, hoy);
  return {
    leidoEn: t.consultadoEn,
    actual: a ? { procedencia: "medido", consultadoEn: a.frescura.generadoEn, estacion: a.estacion.id, temperatura: a.temperatura, humedadRelativa: a.humedadRelativa, viento: a.viento, lluviaAcumulada: a.lluviaAcumulada } : null,
    previsionCorta: t.prevision && dias.length ? { procedencia: "modelado", consultadoEn: t.prevision.frescura.generadoEn, dias } : null,
  };
}

// ---------------------------------------------------------------- la fenología registrada (puro)
export interface LecturaFenologia { filas: unknown; consultadoEn: unknown; estado: unknown }
/** Lista blanca de lo que da la base: parcela, día y BBCH 0–99 (lo demás se tira); la última sincronía de novedades dice si está completa. */
export function normalizaFenologia(v: unknown): { parcelas: FenologiaParcela[]; consultadoEn: string | null; completo: boolean } | null {
  const d = obj(v);
  if (!d || !Array.isArray(d["filas"])) return null;
  const vistas = new Map<string, FenologiaParcela>();
  for (const x of d["filas"] as unknown[]) {
    const f = obj(x), parcela = f && idParcela(f["parcela"]), fecha = f && diaDe(f["fecha"]), b = f ? f["bbch"] : null;
    if (!f || !parcela || !fecha || typeof b !== "number" || !Number.isInteger(b) || b < 0 || b > 99) continue;
    const ya = vistas.get(parcela);
    if (!ya || ya.fecha < fecha) vistas.set(parcela, { parcela, bbch: b, fecha, etapa: etapaBBCH(b) });
  }
  const c = d["consultadoEn"];
  return {
    parcelas: [...vistas.values()].sort((a, b) => a.parcela.localeCompare(b.parcela)).slice(0, MAX_PARCELAS),
    consultadoEn: c instanceof Date ? c.toISOString() : typeof c === "string" && Number.isFinite(Date.parse(c)) ? new Date(c).toISOString() : null,
    completo: d["estado"] === "ok",
  };
}

// ---------------------------------------------------------------- el trabajo de la semana (puro): por parcela y por finca, contado por tipo
/** Tipos de tarea que son recogida. [SUPUESTO: los nombres de tipo de OlivarTrack no se han visto en una respuesta real] */
export const RECOGIDA = /^(recoleccion|recogida|vareo|cosecha)/;

const cuenta = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const recuentos = (m: Map<string, number>, sabe: boolean): Recuento[] => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([tipo, n]) => ({ tipo, n: sabe ? n : null }));
const minIso = (xs: (string | null | undefined)[]): string | null => { const v = xs.filter((x): x is string => !!x).sort(); return v[0] ?? null; };

export function trabajoSemana(h: RespuestaHoy | null, hoy: string): TrabajoSemana | null {
  const ab = h?.tareasAbiertas ?? null, tr = h?.trabajoRealizado ?? null;
  if (!ab && !tr) return null;
  const desde = sumaDias(hoy, -6);
  // se sabe contar solo si la parte llegó entera: con truncado no hay totales (ni por parcela)
  const sabeCurso = !!ab && !ab.truncado, sabeHechas = !!tr && !tr.truncado;
  const enCurso = (ab?.tareas ?? []).filter(t => t.estado === "activo");
  const hechas = (tr?.tareas ?? []).filter(t => !!t.completadaEn && t.completadaEn >= desde && t.completadaEn <= hoy);
  const parcelas = new Map<string, { finca: string | null; c: Map<string, number>; h: Map<string, number> }>();
  const fincas = new Map<string, { c: number; h: number }>();
  let sinParcela = 0;
  const anota = (t: { parcela: string | null; finca: string | null; tipo: string }, cual: "c" | "h") => {
    if (t.finca) { const f = fincas.get(t.finca) ?? { c: 0, h: 0 }; f[cual]++; fincas.set(t.finca, f); }
    if (!t.parcela) { sinParcela++; return; }
    const p = parcelas.get(t.parcela) ?? { finca: t.finca, c: new Map(), h: new Map() };
    p.finca ??= t.finca; cuenta(p[cual], t.tipo); parcelas.set(t.parcela, p);
  };
  for (const t of enCurso) anota(t, "c");
  for (const t of hechas) anota(t, "h");
  return {
    procedencia: "medido", desde, hasta: hoy,
    leidoEn: minIso([ab?.leidoEn, tr?.leidoEn])!, consultadoEn: minIso([ab?.consultadoEn, tr?.consultadoEn]), viejo: !!(ab?.viejo || tr?.viejo),
    completo: sabeCurso && sabeHechas && !ab!.descartadas && !tr!.descartadas,
    porParcela: [...parcelas.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, MAX_PARCELAS)
      .map(([parcela, p]) => ({ parcela, finca: p.finca, enCurso: recuentos(p.c, sabeCurso), hechas: recuentos(p.h, sabeHechas) })),
    porFinca: [...fincas.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 20)
      .map(([finca, f]) => ({ finca, enCurso: sabeCurso ? f.c : null, hechas: sabeHechas ? f.h : null })),
    sinParcela: sabeCurso && sabeHechas ? sinParcela : null,
  };
}

export function miradasHoy(h: RespuestaHoy | null): MiradasHoy | null {
  const v = h?.vigia;
  if (!v) return null;
  // solo el nombre (según Vigía, como dato) y la gravedad: ni el motivo ni cómo se lee, que ya sirve /api/ot/hoy a la historia con su contexto
  return { procedencia: "deducido", leidoEn: v.leidoEn, consultadoEn: v.consultadoEn, viejo: v.viejo, calibrada: v.calibrada, nota: NO_AUTORIZA,
    parcelas: v.pidenUnaMirada.map(m => ({ parcela: m.parcela, gravedad: m.gravedad })).slice(0, MAX_PARCELAS) };
}

// ---------------------------------------------------------------- los avisos del campo (puro): frases FIJAS del gemelo, solo con cifras
const plural = (n: number, uno: string, varios: string) => n + " " + (n === 1 ? uno : varios);
const cifra = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");

export function avisosDelCampo(p: { hoy: string; tiempo: TiempoHoy | null; fenologia: FenologiaHoy | null; trabajo: RespuestaHoy | null; miradas: MiradasHoy | null }): AvisoCampo[] {
  const out: AvisoCampo[] = [], ab = p.trabajo?.tareasAbiertas ?? null;
  // 1. hoy se recoge (tareas de recogida en curso)
  if (ab) {
    const rec = ab.tareas.filter(t => t.estado === "activo" && RECOGIDA.test(t.tipo));
    if (rec.length) {
      const ps = [...new Set(rec.map(t => t.parcela).filter((x): x is string => !!x))].sort().slice(0, MAX_AVISO_PARCELAS);
      const entero = !ab.truncado;
      out.push({ clave: "recogida-" + p.hoy, tipo: "recogida", de: "olivartrack", procedencia: "deducido", basadoEn: "medido", consultadoEn: ab.consultadoEn ?? ab.leidoEn, completo: entero, parcelas: ps,
        texto: !entero ? "Hoy hay recogida en curso. OlivarTrack avisa de que la lista no está completa: no se cuentan las parcelas."
          : ps.length ? "Hoy hay recogida en curso en " + plural(ps.length, "parcela", "parcelas") + "." : "Hoy hay recogida en curso (sin parcela anotada)." });
    }
  }
  // 2 y 3. helada y lluvia mañana (previsión: modelado)
  const pc = p.tiempo?.previsionCorta, manana = pc?.dias.find(d => d.fecha === sumaDias(p.hoy, 1));
  if (pc && manana) {
    const base = { de: "vigia" as const, procedencia: "deducido" as const, basadoEn: "modelado" as const, consultadoEn: pc.consultadoEn, completo: manana.horas >= 20, parcelas: [] };
    if (manana.tmin !== null && manana.tmin <= 0)
      out.push({ ...base, clave: "helada-" + manana.fecha, tipo: "helada", texto: "Previsión de helada para mañana: mínima de " + cifra(manana.tmin) + " °C. Es una previsión (modelado) y puede cambiar." });
    if ((manana.lluviaMm ?? 0) >= 1 || (manana.probabilidadLluviaMax ?? 0) >= 60)
      out.push({ ...base, clave: "lluvia-" + manana.fecha, tipo: "lluvia",
        texto: "Previsión de lluvia para mañana" + (manana.lluviaMm !== null && manana.lluviaMm >= 0.1 ? ": unos " + cifra(manana.lluviaMm) + " mm" : "") +
          (manana.probabilidadLluviaMax !== null ? " (probabilidad de hasta el " + Math.round(manana.probabilidadLluviaMax) + " %)" : "") + ". Es una previsión (modelado) y puede cambiar." });
  }
  // 4. fenología anotada esta semana
  const f = p.fenologia;
  if (f) {
    const semana = f.parcelas.filter(x => x.fecha >= sumaDias(p.hoy, -6) && x.fecha <= p.hoy);
    if (semana.length) {
      const bs = semana.map(x => x.bbch), mx = Math.max(...bs), mn = Math.min(...bs);
      out.push({ clave: "fenologia-" + p.hoy, tipo: "fenologia", de: "olivartrack", procedencia: "deducido", basadoEn: "medido", consultadoEn: f.consultadoEn ?? f.leidoEn, completo: f.completo,
        parcelas: semana.map(x => x.parcela).slice(0, MAX_AVISO_PARCELAS),
        texto: "Esta semana se ha anotado la fenología de " + plural(semana.length, "parcela", "parcelas") + ": " + etapaBBCH(mx) + " (BBCH " + (mn === mx ? mx : mn + "–" + mx) + ")." +
          (f.completo ? "" : " La última lectura de OlivarTrack no está completa.") });
    }
  }
  // 5. lo que marca Vigía: dónde mirar, nunca qué hacer
  const m = p.miradas;
  if (m && m.parcelas.length)
    out.push({ clave: "mirada-" + p.hoy, tipo: "mirada", de: "vigia", procedencia: "deducido", basadoEn: "medido", consultadoEn: m.consultadoEn ?? m.leidoEn, completo: true,
      parcelas: m.parcelas.map(x => x.parcela).slice(0, MAX_AVISO_PARCELAS), texto: "Vigía marca " + plural(m.parcelas.length, "parcela", "parcelas") + " para mirar hoy. " + NO_AUTORIZA });
  return out;
}

// ---------------------------------------------------------------- todo junto (puro)
const PARTES_HOY = ["Las tareas abiertas", "El trabajo hecho", "Lo que marca Vigía"];

export interface Entradas {
  ahora: number; otEncendido: boolean; vigiaEncendido: boolean;
  hoy: RespuestaHoy | null; tiempo: RespuestaTiempo | null; fenologia: Parte | null;
}

export function componeMundoHoy(e: Entradas): RespuestaMundoHoy {
  const dia = diaMadrid(e.ahora), notas: Nota[] = [];
  const tiempo = e.vigiaEncendido ? tiempoHoy(e.tiempo, dia) : null;
  const trabajo = e.otEncendido ? trabajoSemana(e.hoy, dia) : null;
  const miradas = e.vigiaEncendido ? miradasHoy(e.hoy) : null;
  let fenologia: FenologiaHoy | null = null;
  if (e.otEncendido && e.fenologia) {
    const l = e.fenologia.lectura, n = l ? normalizaFenologia(l.crudo) : null;
    if (l && n) {
      fenologia = { procedencia: "medido", leidoEn: new Date(l.leidoEn).toISOString(), consultadoEn: n.consultadoEn, viejo: e.fenologia.fallo || e.fenologia.tope, completo: n.completo, parcelas: n.parcelas };
      if (!n.completo) notas.push({ de: "gemelo", texto: "La fenología: la última lectura de OlivarTrack no está completa (o falló); se muestra lo que hay guardado." });
      if (fenologia.viejo) notas.push({ de: "gemelo", texto: "La fenología: no se ha podido volver a leer de la base; es lo último que llegó." });
    } else notas.push({ de: "gemelo", texto: "La fenología: no se ha podido leer lo que guardó la sincronía con OlivarTrack." });
  }
  // las notas de las lecturas en vivo (antigüedad, truncado, maqueta): las de las partes que se usan aquí, como datos
  if (e.hoy) for (const a of e.hoy.avisos) if (a.de === "vigia" ? e.vigiaEncendido : PARTES_HOY.some(p => a.texto.startsWith(p + ":"))) notas.push({ de: a.de, texto: a.texto });
  if (e.tiempo && e.vigiaEncendido) for (const a of e.tiempo.avisos) notas.push({ de: a.de, texto: a.texto });

  const ab = e.hoy?.tareasAbiertas ?? null, tr = e.hoy?.trabajoRealizado ?? null;
  const ot: EstadoFuente = !e.otEncendido ? apagada() : (() => {
    const partes = [ab, tr, fenologia].filter((x): x is NonNullable<typeof x> => !!x);
    if (!partes.length) return { ...apagada(), encendida: true, motivo: "sin_respuesta" as const };
    return { encendida: true, disponible: true, origen: e.hoy?.origen.ot ?? null, leidoEn: minIso(partes.map(x => x.leidoEn)), consultadoEn: minIso(partes.map(x => x.consultadoEn)),
      viejo: partes.some(x => x.viejo), completo: !!ab && !!tr && !!fenologia && !!trabajo?.completo && fenologia.completo && !ab.viejo && !tr.viejo && !fenologia.viejo, motivo: null };
  })();
  const vig: EstadoFuente = !e.vigiaEncendido ? apagada() : (() => {
    if (!tiempo && !miradas) return { ...apagada(), encendida: true, motivo: "sin_respuesta" as const };
    const viejoT = !!e.tiempo?.avisos.some(a => a.de === "gemelo" && /última que llegó|no ha llegado|no tiene dato/.test(a.texto));
    return { encendida: true, disponible: true, origen: e.tiempo?.origen ?? e.hoy?.origen.vigia ?? null,
      leidoEn: minIso([tiempo?.leidoEn, miradas?.leidoEn]), consultadoEn: minIso([tiempo?.actual?.consultadoEn, tiempo?.previsionCorta?.consultadoEn, miradas?.consultadoEn]),
      viejo: viejoT || !!miradas?.viejo, completo: !!tiempo?.actual && !!tiempo.previsionCorta && !!miradas && !viejoT && !miradas.viejo, motivo: null };
  })();

  const vistas = new Set<string>();
  return {
    version: 1, generadoEn: new Date(e.ahora).toISOString(),
    ahora: { fecha: dia, hora: horaMadrid(e.ahora), zona: ZONA, diaDelAnio: diaDelAnio(dia), estacionDelAnio: estacionDelAnio(dia) },
    fuentes: { olivartrack: ot, vigia: vig },
    tiempo, fenologia, trabajoSemana: trabajo, miradas,
    avisos: avisosDelCampo({ hoy: dia, tiempo, fenologia, trabajo: e.otEncendido ? e.hoy : null, miradas }),
    notas: notas.map(n => ({ de: n.de, texto: texto(n.texto, 400) ?? "" })).filter(n => n.texto && !vistas.has(n.texto) && vistas.add(n.texto)).slice(0, MAX_NOTAS),
    completo: ot.completo && vig.completo,
  };
}
function apagada(): EstadoFuente { return { encendida: false, disponible: false, origen: null, leidoEn: null, consultadoEn: null, viejo: false, completo: false, motivo: "apagada" }; }

// ---------------------------------------------------------------- el servicio
/** La fenología que la sincronía guardó (mundo/registro.ts la lee de la base; las pruebas ponen una de mentira). */
export interface LectorRegistro { fenologia(desde: string): Promise<LecturaFenologia> }

export interface OpcionesMundoHoy {
  hoy?: ServicioHoy | null; tiempo?: ServicioTiempo | null; registro?: LectorRegistro | null;
  otEncendido?: boolean; vigiaEncendido?: boolean;
  /** cada cuántos minutos se vuelve a leer la fenología de la base (la de la sincronía: GEMELO_OT_CADA_MIN); mínimo 5 */
  cadaMin?: number; reloj?: () => number;
}

export class ServicioMundoHoy {
  private readonly o: OpcionesMundoHoy;
  private readonly reloj: () => number;
  private readonly memoria: MemoriaDeLecturas;
  constructor(o: OpcionesMundoHoy = {}) {
    this.o = o; this.reloj = o.reloj ?? Date.now;
    this.memoria = new MemoriaDeLecturas({ ttlMs: Math.max(5, o.cadaMin ?? 60) * MIN, esperaTrasFalloMs: MIN, maxViejoMs: DIA, topePorHora: 30, maxClaves: 4, reloj: this.reloj });
  }

  /** Nunca lanza: lo que falla se queda en null y se dice. */
  async lee(): Promise<RespuestaMundoHoy> {
    const ahora = this.reloj(), o = this.o, ot = !!o.otEncendido, vig = !!o.vigiaEncendido;
    const desde = sumaDias(diaMadrid(ahora), -60), reg = o.registro;
    const [hoy, tiempo, fenologia] = await Promise.all([
      o.hoy && (ot || vig) ? o.hoy.lee().catch(() => null) : Promise.resolve(null),
      o.tiempo && vig ? o.tiempo.lee().catch(() => null) : Promise.resolve(null),
      reg && ot ? this.memoria.lee("fenologia|" + desde, () => reg.fenologia(desde)) : Promise.resolve(null),
    ]);
    return componeMundoHoy({ ahora, otEncendido: ot, vigiaEncendido: vig, hoy, tiempo, fenologia });
  }
}

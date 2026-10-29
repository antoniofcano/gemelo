// Ficha de una haza con LISTA BLANCA (ADR-0014, contratos/haza.schema.json): cada campo de salida se copia uno a uno
// desde datos ya tipados. Nunca sale el titular (solo su alias, si el hogar quiere), ni kilos, ni personas, ni GPS, ni
// texto libre. Además, Fastify serializa la respuesta con el esquema del contrato (additionalProperties: false), que
// descarta cualquier campo que se colara: dos barreras.

export const HERRAMIENTAS_FICHA = ["pases_del_periodo", "novedades", "aforo_y_avance_de_recoleccion"] as const;
export type Aviso = "ot_sin_sincronia" | "ot_truncado" | "ot_parcial" | "ot_error";

export interface FilaHaza {
  id: number; codigo: string; nombre: string; finca: string;
  es_mia: boolean; alias: string | null;
  superficie_ha: number; olivos_lidar: number;
  olivos_declarados: number | null; olivos_declarados_fuente: string | null;
  ndvi_relativo: number | null; ndvi_fecha: string | null; ndvi_fuente: string | null;
}
export interface FilaEvento { tipo: string; fecha: string; parcela_ot: string; datos: Record<string, unknown> }
export interface FilaParcela { parcela_ot: string; ha_compartidas: number | null }
export interface FilaSincronia { herramienta: string; estado: string; consultado_en: Date | null }

type Componente = { tipo: string; producto: string; n_registro: string | null; dosis: number | null; unidad: string | null };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ent = (v: unknown): number | null => (Number.isInteger(v) ? (v as number) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function componentes(v: unknown): Componente[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap(c => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    const tipo = str(o["tipo"]), producto = str(o["producto"]);
    if (!tipo || !producto) return [];
    return [{ tipo, producto, n_registro: str(o["n_registro"]), dosis: num(o["dosis"]), unidad: str(o["unidad"]) }];
  });
}

/** Evita repetir un mismo hecho que llega por dos parcelas de la misma haza (mismo pase, misma observación). */
function unicos<T>(eventos: FilaEvento[], tipo: string, mapea: (d: Record<string, unknown>, fecha: string) => T | null): T[] {
  const vistos = new Set<string>(), out: T[] = [];
  for (const e of eventos) {
    if (e.tipo !== tipo) continue;
    const clave = (str(e.datos["grupo"]) ?? JSON.stringify(e.datos)) + "|" + e.fecha;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const m = mapea(e.datos, e.fecha);
    if (m) out.push(m);
  }
  return out;
}

function avance(eventos: FilaEvento[], parcelas: FilaParcela[]) {
  // el último avance de cada parcela; la haza, media ponderada por la superficie compartida (o a partes iguales)
  const ultimo = new Map<string, { pct: number; fecha: string }>();
  for (const e of eventos) {
    if (e.tipo !== "avance") continue;
    const pct = num(e.datos["pct"]);
    if (pct === null) continue;
    const prev = ultimo.get(e.parcela_ot);
    if (!prev || e.fecha > prev.fecha) ultimo.set(e.parcela_ot, { pct, fecha: e.fecha });
  }
  let suma = 0, peso = 0, fecha: string | null = null;
  for (const p of parcelas) {
    const u = ultimo.get(p.parcela_ot);
    if (!u) continue;
    const w = p.ha_compartidas ?? 1;
    suma += u.pct * w; peso += w;
    if (!fecha || u.fecha > fecha) fecha = u.fecha;
  }
  return {
    pct: peso > 0 ? Math.round((suma / peso) * 10) / 10 : null,
    parcelas_con_dato: parcelas.filter(p => ultimo.has(p.parcela_ot)).length,
    parcelas: parcelas.length,
    fecha,
  };
}

function frescura(sincronias: FilaSincronia[]): { datos_de: string | null; completo: boolean; avisos: Aviso[] } {
  const avisos = new Set<Aviso>();
  let datosDe: Date | null = null;
  for (const h of HERRAMIENTAS_FICHA) {
    const s = sincronias.find(x => x.herramienta === h);
    if (!s) { avisos.add("ot_sin_sincronia"); continue; }
    if (s.estado === "truncado") avisos.add("ot_truncado");
    else if (s.estado === "parcial") avisos.add("ot_parcial");
    else if (s.estado === "error") avisos.add("ot_error");
    if (s.consultado_en && (!datosDe || s.consultado_en < datosDe)) datosDe = s.consultado_en;
  }
  return { datos_de: datosDe ? datosDe.toISOString() : null, completo: avisos.size === 0, avisos: [...avisos].sort() };
}

export function construyeFicha(h: FilaHaza, eventos: FilaEvento[], parcelas: FilaParcela[], sincronias: FilaSincronia[]) {
  const ord = [...eventos].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  return {
    id: h.id,
    codigo: h.codigo,
    nombre: h.nombre,
    finca: h.finca,
    es_mia: h.es_mia,
    alias: h.alias,
    superficie_ha: h.superficie_ha,
    olivos: {
      lidar: { n: h.olivos_lidar, fuente: "LiDAR PNOA (CNIG), vuelo 2024", naturaleza: "medido" as const },
      declarado: { n: h.olivos_declarados, fuente: h.olivos_declarados_fuente, naturaleza: "declarado" as const },
    },
    tratamientos: unicos(ord, "tratamiento", (d, fecha) => ({ fecha, componentes: componentes(d["componentes"]), plazo_seguridad_dias: ent(d["plazo_seguridad_dias"]) })).slice(0, 50),
    analiticas: unicos(ord, "analitica", (d, fecha) => {
      const tipo = str(d["tipo"]);
      const r = d["resultados"];
      if (!tipo || !r || typeof r !== "object") return null;
      const resultados: Record<string, number> = {};
      for (const [k, v] of Object.entries(r)) if (/^[A-Za-z0-9_]{1,24}$/.test(k) && typeof v === "number" && Number.isFinite(v)) resultados[k] = v;
      return { fecha, tipo, resultados };
    }).slice(0, 20),
    fenologia: unicos(ord, "fenologia", (d, fecha) => {
      const bbch = ent(d["bbch"]);
      return bbch === null ? null : { fecha, bbch };
    }).slice(0, 20),
    avance: avance(eventos, parcelas),
    ndvi_relativo: h.ndvi_relativo === null || h.ndvi_fecha === null ? null
      : { valor: h.ndvi_relativo, fecha: h.ndvi_fecha, fuente: h.ndvi_fuente ?? "Sentinel-2 (Copernicus)", naturaleza: "relativo" as const },
    ...frescura(sincronias),
  };
}

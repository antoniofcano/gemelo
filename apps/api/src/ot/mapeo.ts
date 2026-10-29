// De una respuesta de OlivarTrack a eventos de haza, por LISTA BLANCA (contratos/olivartrack-sync.md).
// La respuesta es entrada NO CONFIABLE: se valida con ajv; un elemento que no cumple se descarta (y se cuenta), no tumba
// la lectura. Solo se copian los campos agronómicos permitidos: nada de personas (ni el aplicador), ni GPS, ni kilos,
// ni textos escritos en el campo (asuntos, observaciones). Las formas de entrada son las que se ESPERAN: [NO VERIFICADO].
import { Ajv } from "ajv";
import { huella } from "../seguridad/cripto.ts";
import type { HerramientaLectura } from "./lector.ts";

export type TipoEvento = "tratamiento" | "analitica" | "fenologia" | "avance";
export interface Evento { parcela_ot: string; tipo: TipoEvento; fecha: string; clave: string; datos: Record<string, unknown> }
export interface Lectura {
  eventos: Evento[];
  /** estado de la lectura: truncado/parcial no permiten totales ni borrar lo que no vino */
  estado: "ok" | "truncado" | "parcial";
  consultadoEn: string | null;
  recibidos: number;
  descartados: number;
  hayMas: boolean;
  siguienteDesde: string | null;
}

const ajv = new Ajv({ allErrors: false, strict: true, allowUnionTypes: true });
const FECHA = "^\\d{4}-\\d{2}-\\d{2}";
const ID = "^[A-Za-z0-9:_.-]{1,64}$";
const PRODUCTO = /^[\p{L}\p{N} .,%()/+-]{1,80}$/u;
const REGISTRO = /^[A-Za-z0-9./-]{1,20}$/;

const cabecera = {
  consultadoEn: { type: "string", maxLength: 40 },
  truncado: { type: "boolean" },
  parcial: { type: "boolean" },
};
const vPases = ajv.compile({ type: "object", required: ["pases"], properties: { ...cabecera, pases: { type: "array", maxItems: 20000 } } });
const vPase = ajv.compile({
  type: "object", required: ["id", "fecha", "parcelas"],
  properties: {
    id: { type: ["string", "integer"] },
    fecha: { type: "string", pattern: FECHA },
    parcelas: { type: "array", maxItems: 500, items: { anyOf: [{ type: "string", pattern: ID }, { type: "object", required: ["id"], properties: { id: { type: "string", pattern: ID } } }] } },
    componentes: { type: "array", maxItems: 50, items: { type: "object" } },
    plazoSeguridadDias: { type: ["integer", "null"], minimum: 0, maximum: 3650 },
  },
});
const vNovedades = ajv.compile({
  type: "object", required: ["novedades"],
  properties: { ...cabecera, novedades: { type: "array", maxItems: 5000 }, hayMas: { type: "boolean" }, siguienteDesde: { type: ["string", "null"], maxLength: 40 } },
});
const vNovedad = ajv.compile({
  type: "object", required: ["tipo", "ocurridoEn", "claveDedupe", "carga"],
  properties: { tipo: { type: "string", maxLength: 64 }, ocurridoEn: { type: "string", pattern: FECHA }, claveDedupe: { type: "string", minLength: 1, maxLength: 120 }, carga: { type: "object" } },
});
const vFenologia = ajv.compile({ type: "object", required: ["parcela", "bbch"], properties: { parcela: { type: "string", pattern: ID }, bbch: { type: "integer", minimum: 0, maximum: 99 } } });
const vAnalitica = ajv.compile({
  type: "object", required: ["parcela", "tipo", "resultados"],
  properties: { parcela: { type: "string", pattern: ID }, tipo: { type: "string", enum: ["suelo", "foliar", "agua", "otra"] }, fecha: { type: "string", pattern: FECHA }, resultados: { type: "object", maxProperties: 60 } },
});
const vAforo = ajv.compile({ type: "object", required: ["parcelas"], properties: { ...cabecera, parcelas: { type: "array", maxItems: 2000 } } });
const vAforoParcela = ajv.compile({
  type: "object", required: ["id"],
  properties: { id: { type: "string", pattern: ID }, pctRecogido: { type: ["number", "null"], minimum: 0, maximum: 100 } },
});

const TIPOS_COMPONENTE: Record<string, string> = { fitosanitario: "fitosanitario", nutricion: "nutricion", "nutrición": "nutricion", corrector: "corrector" };
const UNIDADES: Record<string, string> = { "l/ha": "l/ha", "kg/ha": "kg/ha", "%": "%", "cc/hl": "cc/hl", "g/hl": "g/hl" };

function componente(c: Record<string, unknown>) {
  const producto = typeof c["producto"] === "string" ? c["producto"].trim() : "";
  if (!PRODUCTO.test(producto)) return null;
  const reg = typeof c["registro"] === "string" ? c["registro"].trim() : "";
  const unidad = typeof c["unidad"] === "string" ? UNIDADES[c["unidad"].trim().toLowerCase()] ?? null : null;
  const dosis = typeof c["dosis"] === "number" && Number.isFinite(c["dosis"]) && c["dosis"] >= 0 ? c["dosis"] : null;
  return {
    tipo: TIPOS_COMPONENTE[String(c["tipo"] ?? "").toLowerCase()] ?? "otro",
    producto,
    n_registro: REGISTRO.test(reg) ? reg : null,
    dosis,
    unidad,
  };
}

function cabeceraDe(r: Record<string, unknown>) {
  const estado: Lectura["estado"] = r["truncado"] === true ? "truncado" : r["parcial"] === true ? "parcial" : "ok";
  return { estado, consultadoEn: typeof r["consultadoEn"] === "string" ? r["consultadoEn"] : null };
}

export class RespuestaNoValida extends Error {}

export function mapea(herramienta: HerramientaLectura, respuesta: unknown): Lectura {
  const vacia = { eventos: [] as Evento[], recibidos: 0, descartados: 0, hayMas: false, siguienteDesde: null as string | null };
  if (herramienta === "pases_del_periodo") {
    if (!vPases(respuesta)) throw new RespuestaNoValida("pases_del_periodo: forma inesperada");
    const r = respuesta as unknown as Record<string, unknown>, pases = r["pases"] as unknown[];
    const out = { ...vacia, ...cabeceraDe(r), recibidos: pases.length };
    for (const p of pases) {
      if (!vPase(p)) { out.descartados++; continue; }
      const pase = p as { id: string | number; fecha: string; parcelas: (string | { id: string })[]; componentes?: Record<string, unknown>[]; plazoSeguridadDias?: number | null };
      const comps = (pase.componentes ?? []).map(componente).filter(c => c !== null);
      if (!comps.length) { out.descartados++; continue; }
      const grupo = huella("pase:" + pase.id);
      for (const pa of pase.parcelas) {
        const parcela = typeof pa === "string" ? pa : pa.id;
        out.eventos.push({
          parcela_ot: parcela, tipo: "tratamiento", fecha: pase.fecha.slice(0, 10), clave: "pase:" + pase.id + ":" + parcela,
          datos: { grupo, componentes: comps.slice(0, 12), plazo_seguridad_dias: pase.plazoSeguridadDias ?? null },
        });
      }
    }
    return out;
  }
  if (herramienta === "novedades") {
    if (!vNovedades(respuesta)) throw new RespuestaNoValida("novedades: forma inesperada");
    const r = respuesta as unknown as Record<string, unknown>, lista = r["novedades"] as unknown[];
    const out = {
      ...vacia, ...cabeceraDe(r), recibidos: lista.length,
      hayMas: r["hayMas"] === true, siguienteDesde: typeof r["siguienteDesde"] === "string" ? r["siguienteDesde"] : null,
    };
    for (const n of lista) {
      if (!vNovedad(n)) { out.descartados++; continue; }
      const nov = n as { tipo: string; ocurridoEn: string; claveDedupe: string; carga: Record<string, unknown> };
      const grupo = huella("nov:" + nov.claveDedupe);
      if (nov.tipo === "fenologia.registrada") {
        if (!vFenologia(nov.carga)) { out.descartados++; continue; }
        const c = nov.carga as { parcela: string; bbch: number };
        out.eventos.push({ parcela_ot: c.parcela, tipo: "fenologia", fecha: nov.ocurridoEn.slice(0, 10), clave: "nov:" + nov.claveDedupe + ":" + c.parcela, datos: { grupo, bbch: c.bbch } });
      } else if (nov.tipo === "analitica.validada") {
        if (!vAnalitica(nov.carga)) { out.descartados++; continue; }
        const c = nov.carga as { parcela: string; tipo: string; fecha?: string; resultados: Record<string, unknown> };
        const resultados: Record<string, number> = {};
        for (const [k, v] of Object.entries(c.resultados)) if (/^[A-Za-z0-9_]{1,24}$/.test(k) && typeof v === "number" && Number.isFinite(v)) resultados[k] = v;
        out.eventos.push({ parcela_ot: c.parcela, tipo: "analitica", fecha: (c.fecha ?? nov.ocurridoEn).slice(0, 10), clave: "nov:" + nov.claveDedupe + ":" + c.parcela, datos: { grupo, tipo: c.tipo, resultados } });
      }
      // el resto de tipos (partes, entregas, incidencias…) no se proyectan a la haza: se ignoran a propósito
    }
    return out;
  }
  // aforo_y_avance_de_recoleccion: SOLO el porcentaje recogido; los kilos no salen de aquí (decisión 13)
  if (!vAforo(respuesta)) throw new RespuestaNoValida("aforo_y_avance_de_recoleccion: forma inesperada");
  const r = respuesta as unknown as Record<string, unknown>, parcelas = r["parcelas"] as unknown[];
  const cab = cabeceraDe(r);
  const fecha = (cab.consultadoEn ?? new Date().toISOString()).slice(0, 10);
  const out = { ...vacia, ...cab, recibidos: parcelas.length };
  for (const p of parcelas) {
    if (!vAforoParcela(p)) { out.descartados++; continue; }
    const pa = p as { id: string; pctRecogido?: number | null };
    if (typeof pa.pctRecogido !== "number") continue;      // sin aforo con el que comparar: no se sabe (no es un 0 %)
    out.eventos.push({ parcela_ot: pa.id, tipo: "avance", fecha, clave: "avance:" + pa.id + ":" + fecha, datos: { pct: Math.round(pa.pctRecogido * 10) / 10 } });
  }
  return out;
}

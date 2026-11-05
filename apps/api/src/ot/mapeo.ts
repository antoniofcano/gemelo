// De una respuesta de OlivarTrack a eventos de haza, por LISTA BLANCA (contratos/olivartrack-sync.md).
// La respuesta es entrada NO CONFIABLE: se valida con ajv; un elemento que no cumple se descarta (y se cuenta), no tumba
// la lectura. Solo se copian los campos agronómicos permitidos: nada de personas (ni el aplicador), ni GPS, ni kilos,
// ni textos escritos en el campo (asuntos, observaciones). Formas comprobadas en solo lectura el 2026-11-05 (pases, novedades con
// tarea.* y cierre.parte, aforo); siguen [NO VERIFICADAS] las cargas de fenologia.registrada y analitica.validada (no se ha visto ninguna).
import { Ajv } from "ajv";
import { huella } from "../seguridad/cripto.ts";
import { PATRON_ID_PARCELA } from "../vivo/lista-blanca.ts";
import type { HerramientaSincronia } from "./lector.ts";

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
  /** bien formados pero apartados a propósito (pases en borrador, aforo que viene por nombre de parcela): no son errores */
  apartados: number;
  /** frases PROPIAS (nunca texto del otro lado) que explican lo apartado; van a sincronias_ot.avisos */
  avisos: string[];
}

// ajv compila los `pattern` con la bandera «u» (unicodeRegExp, por omisión): PATRON_ID_PARCELA usa \p{L} y \p{N}
const ajv = new Ajv({ allErrors: false, strict: true, allowUnionTypes: true });
const FECHA = "^\\d{4}-\\d{2}-\\d{2}";
const ID = PATRON_ID_PARCELA;
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
    estado: { type: "string", maxLength: 40 },
    componentes: { type: "array", maxItems: 50, items: { type: "object" } },
    plazoSeguridadDias: { type: ["integer", "null"], minimum: 0, maximum: 3650 },
    plazoSeguridad: { type: ["object", "null"], properties: { dias: { type: ["integer", "null"], minimum: 0, maximum: 3650 } } },
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
// aforo_y_avance_de_recoleccion: `aforo.porParcela[]` (una fila por parcela CON aforo). `parcela` es el NOMBRE legible, no el id;
// si algún día trae `parcelaId` (o `id`) con forma de id, se usa ese.
const vAforo = ajv.compile({
  type: "object", required: ["aforo"],
  properties: { ...cabecera, aforo: { type: "object", required: ["porParcela"], properties: { porParcela: { type: "array", maxItems: 2000 } } } },
});
const vAforoParcela = ajv.compile({
  type: "object", required: ["pct"],
  properties: { parcelaId: { type: "string", pattern: ID }, id: { type: "string", pattern: ID }, pct: { type: ["number", "null"], minimum: 0, maximum: 100 } },
});
/** estados de un pase que NO se proyectan como tratamiento: aún no se aplicó. «borrador» se ha visto; ningún otro estado de pase se ha visto. */
const ESTADOS_SIN_APLICAR = new Set(["borrador"]);

// «fito» es lo que trae OlivarTrack (comprobado el 2026-11-05); el resto de nombres son los que se esperaban [NO VERIFICADOS]
const TIPOS_COMPONENTE: Record<string, string> = { fito: "fitosanitario", fitosanitario: "fitosanitario", nutricion: "nutricion", "nutrición": "nutricion", corrector: "corrector" };
const UNIDADES: Record<string, string> = { "l/ha": "l/ha", "kg/ha": "kg/ha", "%": "%", "cc/hl": "cc/hl", "g/hl": "g/hl" };

function componente(c: Record<string, unknown>) {
  const producto = typeof c["producto"] === "string" ? c["producto"].trim() : "";
  if (!PRODUCTO.test(producto)) return null;
  const r0 = typeof c["numRegistro"] === "string" ? c["numRegistro"] : c["registro"];   // numRegistro: el nombre real
  const reg = typeof r0 === "string" ? r0.trim() : "";
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

export function mapea(herramienta: HerramientaSincronia, respuesta: unknown): Lectura {
  const vacia = { eventos: [] as Evento[], recibidos: 0, descartados: 0, hayMas: false, siguienteDesde: null as string | null, apartados: 0, avisos: [] as string[] };
  if (herramienta === "pases_del_periodo") {
    if (!vPases(respuesta)) throw new RespuestaNoValida("pases_del_periodo: forma inesperada");
    const r = respuesta as unknown as Record<string, unknown>, pases = r["pases"] as unknown[];
    const out = { ...vacia, ...cabeceraDe(r), recibidos: pases.length };
    for (const p of pases) {
      if (!vPase(p)) { out.descartados++; continue; }
      const pase = p as { id: string | number; fecha: string; estado?: string; parcelas: (string | { id: string })[]; componentes?: Record<string, unknown>[]; plazoSeguridadDias?: number | null; plazoSeguridad?: { dias?: number | null } | null };
      // un pase en borrador no se ha aplicado: no es un tratamiento de la haza (se aparta y se cuenta, no es un error)
      if (typeof pase.estado === "string" && ESTADOS_SIN_APLICAR.has(pase.estado.trim().toLowerCase())) { out.apartados++; continue; }
      const comps = (pase.componentes ?? []).map(componente).filter(c => c !== null);
      if (!comps.length) { out.descartados++; continue; }
      const plazo = pase.plazoSeguridad && typeof pase.plazoSeguridad.dias === "number" ? pase.plazoSeguridad.dias : pase.plazoSeguridadDias ?? null;
      const grupo = huella("pase:" + pase.id);
      for (const pa of pase.parcelas) {
        const parcela = typeof pa === "string" ? pa : pa.id;
        out.eventos.push({
          parcela_ot: parcela, tipo: "tratamiento", fecha: pase.fecha.slice(0, 10), clave: "pase:" + pase.id + ":" + parcela,
          datos: { grupo, componentes: comps.slice(0, 12), plazo_seguridad_dias: plazo },
        });
      }
    }
    if (out.apartados) out.avisos.push(out.apartados + (out.apartados === 1 ? " pase en borrador no se proyecta" : " pases en borrador no se proyectan") + " (aún no se han aplicado).");
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
      // [NO VERIFICADO] las cargas de fenologia.registrada y analitica.validada: ninguna se ha visto en una respuesta real (el 2026-11-05
      // solo llegaron tarea.creada, tarea.completada y cierre.parte, que no se proyectan a la haza)
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
  // aforo_y_avance_de_recoleccion: SOLO el porcentaje recogido; los kilos no salen de aquí (decisión 13). Cada fila de aforo.porParcela
  // es una parcela CON aforo: un pct 0 es un dato (0 % recogido); un pct null no lo es. La fila trae la parcela por su NOMBRE, no por
  // su id, y no hay tabla nombre→id con la que casarla con haza_parcela: sin id, la fila se APARTA y se cuenta, con su aviso. No se
  // adivina el id por el nombre.
  if (!vAforo(respuesta)) throw new RespuestaNoValida("aforo_y_avance_de_recoleccion: forma inesperada");
  const r = respuesta as unknown as Record<string, unknown>, filas = (r["aforo"] as { porParcela: unknown[] }).porParcela;
  const cab = cabeceraDe(r);
  const fecha = (cab.consultadoEn ?? new Date().toISOString()).slice(0, 10);
  const out = { ...vacia, ...cab, recibidos: filas.length };
  for (const p of filas) {
    if (!vAforoParcela(p)) { out.descartados++; continue; }
    const pa = p as { parcelaId?: string; id?: string; pct: number | null };
    if (typeof pa.pct !== "number") continue;      // sin porcentaje no hay dato (no es un 0 %)
    const id = pa.parcelaId ?? pa.id;
    if (!id) { out.apartados++; continue; }
    out.eventos.push({ parcela_ot: id, tipo: "avance", fecha, clave: "avance:" + id + ":" + fecha, datos: { pct: Math.round(pa.pct * 10) / 10 } });
  }
  if (out.apartados) out.avisos.push("El aforo viene por nombre de parcela; falta la tabla nombre→id: " + out.apartados + (out.apartados === 1 ? " parcela" : " parcelas") + " sin avance en la haza.");
  return out;
}

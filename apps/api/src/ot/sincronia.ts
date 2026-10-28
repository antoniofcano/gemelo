// Sincronía OlivarTrack → eventos_haza (contratos/olivartrack-sync.md). Idempotente: cada evento tiene clave natural y
// se escribe con ON CONFLICT, así que repetir la lectura no duplica. Con `truncado` o `parcial` se guarda lo que llegó,
// pero NO se borra lo que falta ni se avanza el cursor de novedades: la próxima lectura lo completa.
import type { Bd } from "../bd/pool.ts";
import { enTransaccion } from "../bd/pool.ts";
import { ErrorDeLectura, type HerramientaLectura, type LectorOlivarTrack } from "./lector.ts";
import { type Evento, type Lectura, mapea, RespuestaNoValida } from "./mapeo.ts";

export interface Resumen {
  herramienta: HerramientaLectura;
  estado: "ok" | "truncado" | "parcial" | "error";
  recibidos: number; guardados: number; descartados: number; sinHaza: number; borrados: number;
}

const DIA = 86_400_000;
const MAX_PAGINAS = 20;
const fechaIso = (d: Date) => d.toISOString().slice(0, 10);

/** Mensaje propio (nunca el texto que venga del otro lado). */
function motivo(e: unknown): string {
  if (e instanceof ErrorDeLectura || e instanceof RespuestaNoValida) return e.message.slice(0, 200);
  return "fallo de red o del servidor de OlivarTrack";
}

async function reparto(bd: Bd): Promise<Map<string, number[]>> {
  const r = await bd.query<{ haza_id: number; parcela_ot: string }>("SELECT haza_id, parcela_ot FROM haza_parcela");
  const m = new Map<string, number[]>();
  for (const f of r.rows) m.set(f.parcela_ot, [...(m.get(f.parcela_ot) ?? []), f.haza_id]);
  return m;
}

async function guarda(bd: Bd, herramienta: HerramientaLectura, empezada: Date, l: Lectura, cursor: string | null,
  mapa: Map<string, number[]>, borrarDesde: string | null): Promise<Resumen> {
  const filas: [number, Evento][] = [];
  let sinHaza = 0;
  for (const e of l.eventos) {
    const hazas = mapa.get(e.parcela_ot);
    if (!hazas) { sinHaza++; continue; }
    for (const h of hazas) filas.push([h, e]);
  }
  const consultado = l.consultadoEn && !Number.isNaN(Date.parse(l.consultadoEn)) ? new Date(l.consultadoEn) : new Date();
  return enTransaccion(bd, async c => {
    let guardados = 0, borrados = 0;
    for (let i = 0; i < filas.length; i += 1000) {
      const t = filas.slice(i, i + 1000);
      const r = await c.query(
        `INSERT INTO eventos_haza (haza_id, parcela_ot, tipo, fecha, clave_natural, datos, consultado_en)
         SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[], $4::date[], $5::text[], $6::jsonb[], $7::timestamptz[])
         ON CONFLICT (haza_id, clave_natural) DO UPDATE
           SET datos = EXCLUDED.datos, fecha = EXCLUDED.fecha, tipo = EXCLUDED.tipo, consultado_en = EXCLUDED.consultado_en, actualizado_en = now()
         WHERE eventos_haza.datos IS DISTINCT FROM EXCLUDED.datos OR eventos_haza.fecha IS DISTINCT FROM EXCLUDED.fecha`,
        [t.map(x => x[0]), t.map(x => x[1].parcela_ot), t.map(x => x[1].tipo), t.map(x => x[1].fecha), t.map(x => x[1].clave),
          t.map(x => JSON.stringify(x[1].datos)), t.map(() => consultado)]);
      guardados += r.rowCount ?? 0;
    }
    // un pase que ya no aparece en una lectura COMPLETA del periodo se anuló en el cuaderno: se quita
    if (borrarDesde && l.estado === "ok") {
      const r = await c.query(
        "DELETE FROM eventos_haza WHERE tipo = 'tratamiento' AND fecha >= $1 AND NOT (clave_natural = ANY($2::text[]))",
        [borrarDesde, l.eventos.map(e => e.clave)]);
      borrados = r.rowCount ?? 0;
    }
    await c.query(
      `INSERT INTO sincronias_ot (herramienta, empezada_en, terminada_en, estado, consultado_en, recibidos, guardados, cursor, avisos)
       VALUES ($1, $2, now(), $3, $4, $5, $6, $7, $8)`,
      [herramienta, empezada, l.estado, consultado, l.recibidos, guardados, l.estado === "ok" ? cursor : null,
        JSON.stringify(l.descartados ? [{ descartados: l.descartados }] : [])]);
    return { herramienta, estado: l.estado, recibidos: l.recibidos, guardados, descartados: l.descartados, sinHaza, borrados };
  });
}

async function anotaError(bd: Bd, herramienta: HerramientaLectura, empezada: Date, e: unknown): Promise<Resumen> {
  await bd.query(
    "INSERT INTO sincronias_ot (herramienta, empezada_en, terminada_en, estado, avisos) VALUES ($1, $2, now(), 'error', $3)",
    [herramienta, empezada, JSON.stringify([{ error: motivo(e) }])]);
  return { herramienta, estado: "error", recibidos: 0, guardados: 0, descartados: 0, sinHaza: 0, borrados: 0 };
}

export async function sincroniza(bd: Bd, lector: LectorOlivarTrack, ahora: Date = new Date()): Promise<Resumen[]> {
  const mapa = await reparto(bd);
  const resumen: Resumen[] = [];
  const desde = fechaIso(new Date(ahora.getTime() - 365 * DIA));   // la herramienta no admite más de 366 días

  // 1. tratamientos (cuaderno de campo)
  let t0 = new Date();
  try {
    const l = mapea("pases_del_periodo", await lector.llama("pases_del_periodo", { desde, hasta: fechaIso(ahora) }));
    resumen.push(await guarda(bd, "pases_del_periodo", t0, l, null, mapa, desde));
  } catch (e) { resumen.push(await anotaError(bd, "pases_del_periodo", t0, e)); }

  // 2. fenología y analíticas (novedades, por páginas, desde el último cursor completo)
  t0 = new Date();
  try {
    const previo = await bd.query<{ cursor: string }>(
      "SELECT cursor FROM sincronias_ot WHERE herramienta = 'novedades' AND estado = 'ok' AND cursor IS NOT NULL ORDER BY empezada_en DESC LIMIT 1");
    let marca = previo.rows[0]?.cursor ?? new Date(ahora.getTime() - 365 * DIA).toISOString();
    const total: Lectura = { eventos: [], estado: "ok", consultadoEn: null, recibidos: 0, descartados: 0, hayMas: false, siguienteDesde: null };
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const l = mapea("novedades", await lector.llama("novedades", { desde: marca, limite: 500 }));
      total.eventos.push(...l.eventos);
      total.recibidos += l.recibidos; total.descartados += l.descartados;
      total.consultadoEn ??= l.consultadoEn;
      if (l.estado !== "ok") total.estado = l.estado;
      if (l.siguienteDesde) marca = l.siguienteDesde;
      if (!l.hayMas || !l.siguienteDesde) break;
      if (pagina === MAX_PAGINAS - 1) total.estado = "truncado";   // quedan páginas: no está completo
    }
    resumen.push(await guarda(bd, "novedades", t0, total, marca, mapa, null));
  } catch (e) { resumen.push(await anotaError(bd, "novedades", t0, e)); }

  // 3. avance de recolección (solo %)
  t0 = new Date();
  try {
    const l = mapea("aforo_y_avance_de_recoleccion", await lector.llama("aforo_y_avance_de_recoleccion", {}));
    resumen.push(await guarda(bd, "aforo_y_avance_de_recoleccion", t0, l, null, mapa, null));
  } catch (e) { resumen.push(await anotaError(bd, "aforo_y_avance_de_recoleccion", t0, e)); }

  return resumen;
}

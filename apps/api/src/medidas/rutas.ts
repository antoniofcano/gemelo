// Telemetría de fluidez en aparatos (PB9; contrato: contratos/medidas.md; tabla: migraciones/0017_medidas_fluidez.sql). El medidor del motor
// (apps/web/motor/30_mide.js, `&mide=60`) enseña mediana, p95 y peor de una medida de 60 s; si la persona pulsa «Enviar esta medida a la oficina»
// llega aquí.
//  - POST /api/medidas (cualquier sesión, también unas gafas vinculadas): esquema ESTRICTO (nada de campos de más) y límite por hogar y día, EN MEMORIA:
//    el hogar solo sirve de clave del límite, nunca se guarda (la tabla no tiene hogar_id, ni IP, ni agente de usuario entero, ni posición).
//    No se audita: la auditoría guarda el hogar, y eso enlazaría la medida con una familia.
//  - GET /api/admin/medidas (oficina): agregada por día, aparato y VR, con filtros por aparato y fechas. Es lo MEDIDO por cada aparato de sí mismo
//    (regla 5), sin GPU de referencia: SwiftShader no vale como fps y la tarjeta lo dice.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requiereSesion } from "../auth/roles.ts";
import type { Contexto } from "../contexto.ts";
import { OFICINA } from "../oficina/acceso.ts";

export const APARATOS = ["escritorio", "movil", "quest"] as const;
export type Aparato = (typeof APARATOS)[number];
export const MEDIDAS_POR_DIA = 10;
/** Objetivo de p95 por aparato (ms). Quest: 13,9 ms = 72 Hz (ADR-0015, criterio 5). Escritorio y móvil: no hay umbral escrito (VR.md: «no hay umbral decidido»): solo la cifra. */
export const OBJETIVO_P95_MS: Record<Aparato, number | null> = { escritorio: null, movil: null, quest: 13.9 };
export const LIMITE_FILAS = { porDefecto: 100, max: 500 } as const;
const VENTANA = { pasadoMs: 7 * 86_400_000, futuroMs: 5 * 60_000 } as const;
const TEXTO_LIMITE = "Hoy ya se han mandado varias medidas desde esta familia. Vuelve a probar mañana.";

export interface CuerpoMedida {
  aparato: Aparato; navegador: string; nav_mayor: number; perfil: number; finca: string; modo: string; vr: boolean;
  mediana_ms: number; p95_ms: number; peor_ms: number; fotogramas: number; duracion_s: number; version: string; medida_en: string;
}

/** El esquema estricto del cuerpo (el mismo que contratos/medidas.schema.json; lo comprueba pruebas/unidad/medidas.test.ts). */
export const CUERPO_MEDIDA = {
  type: "object", additionalProperties: false,
  required: ["aparato", "navegador", "nav_mayor", "perfil", "finca", "modo", "vr", "mediana_ms", "p95_ms", "peor_ms", "fotogramas", "duracion_s", "version", "medida_en"],
  properties: {
    aparato: { type: "string", enum: [...APARATOS] },
    navegador: { type: "string", pattern: "^[A-Za-z][A-Za-z ]{0,23}$" },
    nav_mayor: { type: "integer", minimum: 0, maximum: 999 },
    perfil: { type: "integer", minimum: -1, maximum: 9 },
    finca: { type: "string", pattern: "^[A-Za-z0-9_-]{1,40}$" },
    modo: { type: "string", pattern: "^[A-Za-z0-9_-]{1,24}$" },
    vr: { type: "boolean" },
    mediana_ms: { type: "number", minimum: 0, maximum: 10000 },
    p95_ms: { type: "number", minimum: 0, maximum: 10000 },
    peor_ms: { type: "number", minimum: 0, maximum: 100000 },
    fotogramas: { type: "integer", minimum: 10, maximum: 1000000 },
    duracion_s: { type: "integer", minimum: 1, maximum: 600 },
    version: { type: "string", pattern: "^[0-9A-Za-z.+-]{1,24}$" },
    medida_en: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?Z$" },
  },
} as const;

const CONSULTA = {
  type: "object", additionalProperties: false,
  properties: {
    aparato: { type: "string", enum: [...APARATOS] },
    desde: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    hasta: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    limite: { type: "integer", minimum: 1, maximum: LIMITE_FILAS.max, default: LIMITE_FILAS.porDefecto },
  },
} as const;

/** Lo que el esquema no puede decir: el orden de las cifras y que la fecha sea de ahora. Devuelve el motivo, o null si cuadra. Pura. */
export function motivoNoCreible(m: Pick<CuerpoMedida, "mediana_ms" | "p95_ms" | "peor_ms" | "medida_en">, ahora: number = Date.now()): string | null {
  if (!(m.mediana_ms <= m.p95_ms && m.p95_ms <= m.peor_ms)) return "orden";   // mediana ≤ p95 ≤ peor, siempre
  const t = Date.parse(m.medida_en);
  if (!Number.isFinite(t)) return "fecha";
  if (t > ahora + VENTANA.futuroMs || t < ahora - VENTANA.pasadoMs) return "fecha";
  return null;
}

/** ¿Es una fecha AAAA-MM-DD real? (el esquema solo mira la forma) */
export function fechaValida(s: string): boolean {
  const t = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export interface FilaAgregada {
  dia: Date | string; aparato: Aparato; vr: boolean; n: string; p95_mediano: number; p95_peor: number; mediana_mediana: number; peor: number; fotogramas: string; navegadores: string[]; versiones: string[];
}
export interface FilaMedidas {
  dia: string; aparato: Aparato; vr: boolean; medidas: number; p95_mediano_ms: number; p95_peor_ms: number; mediana_ms: number; peor_ms: number; fotogramas: number;
  navegadores: string[]; versiones: string[]; objetivo_p95_ms: number | null; cumple: boolean | null;
}

const r1 = (v: number): number => Math.round(v * 10) / 10;
/** Da forma pública a las filas agregadas: redondea a 0,1 ms y compara con el objetivo (cumple = el p95 mediano del día ≤ objetivo; null si no hay objetivo). Pura. */
export function formaFilas(filas: FilaAgregada[]): FilaMedidas[] {
  return filas.map(f => {
    const objetivo = OBJETIVO_P95_MS[f.aparato] ?? null, p95 = r1(Number(f.p95_mediano));
    return {
      dia: typeof f.dia === "string" ? f.dia.slice(0, 10) : f.dia.toISOString().slice(0, 10), aparato: f.aparato, vr: f.vr, medidas: Number(f.n),
      p95_mediano_ms: p95, p95_peor_ms: r1(Number(f.p95_peor)), mediana_ms: r1(Number(f.mediana_mediana)), peor_ms: r1(Number(f.peor)), fotogramas: Number(f.fotogramas),
      navegadores: f.navegadores, versiones: f.versiones, objetivo_p95_ms: objetivo, cumple: objetivo === null ? null : p95 <= objetivo,
    };
  });
}

export async function rutasMedidas(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;
  const porHogarYDia = app.createRateLimit({ max: MEDIDAS_POR_DIA, timeWindow: 86_400_000, keyGenerator: (r: FastifyRequest) => "medidas:" + String(r.session?.hogarId ?? "?") });

  app.post<{ Body: CuerpoMedida }>("/api/medidas", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
    schema: { body: CUERPO_MEDIDA },
  }, async (req, rep) => {
    const m = req.body;
    if (motivoNoCreible(m)) return rep.code(422).send({ error: "medida_no_creible", mensaje: "Esa medida no cuadra (cifras desordenadas o fecha que no es de ahora) y no se ha guardado." });
    const lim = await porHogarYDia(req);
    if (!lim.isAllowed && lim.isExceeded) return rep.code(429).send({ error: "demasiadas_peticiones", mensaje: TEXTO_LIMITE });
    // ni hogar ni IP ni cabeceras: solo el cuerpo ya validado
    await bd.query(
      `INSERT INTO medidas_fluidez (medida_en, aparato, navegador, nav_mayor, perfil, finca, modo, vr, mediana_ms, p95_ms, peor_ms, fotogramas, duracion_s, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [m.medida_en, m.aparato, m.navegador, m.nav_mayor, m.perfil, m.finca, m.modo, m.vr, m.mediana_ms, m.p95_ms, m.peor_ms, m.fotogramas, m.duracion_s, m.version]);
    return rep.code(201).send({ guardada: true });
  });

  app.get<{ Querystring: { aparato?: Aparato; desde?: string; hasta?: string; limite?: number } }>("/api/admin/medidas", {
    preHandler: OFICINA, schema: { querystring: CONSULTA },
  }, async (req, rep) => {
    const { aparato, desde, hasta } = req.query, limite = req.query.limite ?? LIMITE_FILAS.porDefecto;
    if ((desde && !fechaValida(desde)) || (hasta && !fechaValida(hasta))) return rep.code(400).send({ error: "peticion_no_valida", mensaje: "Una fecha no es válida (AAAA-MM-DD)." });
    rep.header("cache-control", "no-store");
    const r = await bd.query<FilaAgregada>(
      `SELECT (medida_en AT TIME ZONE 'UTC')::date AS dia, aparato, vr, count(*) AS n,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY p95_ms) AS p95_mediano, max(p95_ms) AS p95_peor,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY mediana_ms) AS mediana_mediana, max(peor_ms) AS peor, sum(fotogramas) AS fotogramas,
              array_agg(DISTINCT navegador || ' ' || nav_mayor ORDER BY navegador || ' ' || nav_mayor) AS navegadores, array_agg(DISTINCT version ORDER BY version) AS versiones
         FROM medidas_fluidez
        WHERE ($1::text IS NULL OR aparato = $1) AND ($2::date IS NULL OR medida_en >= $2::date) AND ($3::date IS NULL OR medida_en < $3::date + 1)
        GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2, 3 LIMIT $4`, [aparato ?? null, desde ?? null, hasta ?? null, limite]);
    return { generado_en: new Date().toISOString(), objetivos_p95_ms: OBJETIVO_P95_MS, filas: formaFilas(r.rows) };
  });
}

// EV-3a: la fuente AUTOMÁTICA de avisos del campo. De vez en cuando mira GET /api/mundo/hoy (el mismo servicio, sin llamar a nadie más) y, si
// hay un aviso de los tipos elegidos, lo deja en la tabla `avisos` (tipo «labor», sin autor) para los hogares a los que toca; el correo lo manda
// el repartidor de siempre (avisos/correo.ts: reintentos, baja con un clic, solo a quien lo pidió). APAGADA por defecto (GEMELO_AVISOS_CAMPO=no).
//  · FRECUENCIA MÁXIMA: como mucho un aviso automático cada `minHoras` (GEMELO_AVISOS_CAMPO_MIN_HORAS, 168 = uno por semana) para todos: si ya
//    salió uno, no sale otro, aunque haya más novedades (irán al resumen semanal, EV-3b). Y solo de 9:00 a 21:00 de Madrid.
//  · A QUIÉN: un aviso con parcelas de OlivarTrack (la recogida, la fenología), a los hogares con una haza en esas parcelas (haza_parcela); el
//    del tiempo (helada, lluvia), a todos los hogares activos con haza. «mirada» (lo que marca Vigía) solo si se pone en GEMELO_AVISOS_CAMPO_TIPOS.
//  · QUÉ DICE: el título fijo de su tipo y la frase fija que redacta mundo/hoy.ts (solo cifras), con de dónde sale y de cuándo es. Nunca un texto
//    de fuera, nunca el nombre de una persona, nunca «trata»: Vigía no autoriza tratamientos.
//  · AUDITORÍA: un asiento `avisos.campo` con el tipo y el número de hogares; nunca quiénes.
import { audita } from "../auth/servicio.ts";
import type { Bd } from "../bd/pool.ts";
import type { TipoAvisoCampo } from "../config.ts";
import type { BdConsulta } from "./correo.ts";
import { type AvisoCampo, horaMadrid, type RespuestaMundoHoy } from "../mundo/hoy.ts";

const TITULOS: Record<TipoAvisoCampo, string> = {
  recogida: "Hoy se recoge en el olivar",
  helada: "Mañana puede helar en el olivar",
  lluvia: "Mañana puede llover en el olivar",
  fenologia: "Novedades del olivar esta semana",
  mirada: "Vigía marca parcelas para mirar",
};
const FUENTE = { olivartrack: "OlivarTrack, el cuaderno de campo", vigia: "Vigía" } as const;
const PROC = { medido: "registrado", modelado: "previsión, modelado" } as const;

/** El aviso que toca mandar: el primero de `tipos` (en ese orden de prioridad) que trae mundo/hoy; null si ninguno. */
export function eligeAviso(r: RespuestaMundoHoy, tipos: readonly TipoAvisoCampo[]): AvisoCampo | null {
  for (const t of tipos) { const a = r.avisos.find(x => x.tipo === t); if (a) return a; }
  return null;
}

/** Título y texto del aviso para la campana y el correo: frases fijas, de dónde sale y de cuándo es. */
export function textoDeAviso(a: AvisoCampo): { titulo: string; texto: string } {
  const cuando = a.consultadoEn ? new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(a.consultadoEn)) : null;
  return {
    titulo: TITULOS[a.tipo],
    texto: a.texto + "\n\nDe " + FUENTE[a.de] + " (" + PROC[a.basadoEn] + ")" + (cuando ? ", dato del " + cuando : "") + ". Lo redacta el gemelo a partir de ese dato" + (a.completo ? "" : "; la lectura no estaba completa") + ".",
  };
}

export interface OpcionesAvisosCampo {
  minHoras: number; tipos: readonly TipoAvisoCampo[];
  /** franja de Madrid en la que puede salir (por defecto, de 9 a 21) */
  horaDesde?: number; horaHasta?: number;
  reloj?: () => number;
  /** se llama tras dejar un aviso (el repartidor: despierta) */
  alCrear?: () => void;
  log?: { info(o: object, m: string): void; warn(o: object, m: string): void };
}
export interface ResultadoPasada { creado: TipoAvisoCampo | null; motivo: "creado" | "fuera_de_hora" | "frecuencia" | "nada" | "sin_destinatarios"; hogares: number }

export class FuenteAvisosCampo {
  private readonly bd: BdConsulta;
  private readonly mundo: { lee(): Promise<RespuestaMundoHoy> };
  private readonly o: OpcionesAvisosCampo;
  private corriendo: Promise<ResultadoPasada> | null = null;
  constructor(bd: BdConsulta, mundo: { lee(): Promise<RespuestaMundoHoy> }, o: OpcionesAvisosCampo) { this.bd = bd; this.mundo = mundo; this.o = o; }

  /** Una pasada (si ya hay una en marcha, devuelve esa). No manda correo: deja el aviso y despierta al repartidor. */
  pasada(): Promise<ResultadoPasada> {
    if (!this.corriendo) this.corriendo = this.haz().finally(() => { this.corriendo = null; });
    return this.corriendo;
  }

  private async haz(): Promise<ResultadoPasada> {
    const { bd, o } = this, ahora = (o.reloj ?? Date.now)(), h = Number(horaMadrid(ahora).slice(0, 2));
    if (h < (o.horaDesde ?? 9) || h >= (o.horaHasta ?? 21)) return { creado: null, motivo: "fuera_de_hora", hogares: 0 };
    const u = (await bd.query("SELECT max(creado_en) AS ultimo FROM avisos WHERE tipo = 'labor' AND autor_id IS NULL")).rows[0]?.ultimo;
    if (u && ahora - new Date(u).getTime() < o.minHoras * 3_600_000) return { creado: null, motivo: "frecuencia", hogares: 0 };
    const a = eligeAviso(await this.mundo.lee(), o.tipos);
    if (!a) return { creado: null, motivo: "nada", hogares: 0 };
    const porParcela = a.de === "olivartrack" && a.parcelas.length > 0;
    const destino = `SELECT DISTINCT hz.hogar_id FROM hazas hz JOIN hogares g ON g.id = hz.hogar_id AND g.activo
       WHERE NOT $3::boolean OR EXISTS (SELECT 1 FROM haza_parcela hp WHERE hp.haza_id = hz.id AND hp.parcela_ot = ANY($4::text[]))`;
    const { titulo, texto } = textoDeAviso(a);
    // un solo INSERT … SELECT: si no hay a quién, no se crea el aviso (y no gasta la frecuencia)
    const r = await bd.query(
      `WITH d AS (${destino}),
            a AS (INSERT INTO avisos (tipo, titulo, texto, enlace, caduca_en)
                  SELECT 'labor', $1, $2, '/', now() + interval '3 days' WHERE EXISTS (SELECT 1 FROM d) RETURNING id)
       INSERT INTO avisos_hogar (aviso_id, hogar_id) SELECT a.id, d.hogar_id FROM a, d RETURNING aviso_id`,
      [titulo, texto, porParcela, porParcela ? a.parcelas : []]);
    const n = r.rowCount ?? 0;
    if (!n) return { creado: null, motivo: "sin_destinatarios", hogares: 0 };
    await audita(bd as Bd, null, "avisos.campo", { tipo: a.tipo, hogares: n }).catch(() => undefined);
    o.log?.info({ evento: "aviso_campo", tipo: a.tipo, hogares: n }, "aviso del campo para los hogares");
    o.alCrear?.();
    return { creado: a.tipo, motivo: "creado", hogares: n };
  }
}

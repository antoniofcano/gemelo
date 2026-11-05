// La fenología que la sincronía con OlivarTrack ya guardó en la base (eventos_haza, tipo «fenologia»: contratos/olivartrack-sync.md), para
// GET /api/mundo/hoy. No llama a OlivarTrack: lee lo que hay (la última anotación de cada parcela desde `desde`) y el estado de la última
// sincronía de `novedades` (si fue truncada, parcial o falló, la respuesta lo dice). Solo parcela, día y BBCH: lo demás no sale de aquí.
import type { BdConsulta } from "../avisos/correo.ts";
import type { LecturaFenologia, LectorRegistro } from "./hoy.ts";

export class RegistroPg implements LectorRegistro {
  private readonly bd: BdConsulta;
  constructor(bd: BdConsulta) { this.bd = bd; }

  async fenologia(desde: string): Promise<LecturaFenologia> {
    const f = await this.bd.query(
      `SELECT DISTINCT ON (parcela_ot) parcela_ot AS parcela, to_char(fecha, 'YYYY-MM-DD') AS fecha,
              CASE WHEN datos->>'bbch' ~ '^[0-9]{1,2}$' THEN (datos->>'bbch')::int END AS bbch
         FROM eventos_haza
        WHERE tipo = 'fenologia' AND fecha >= $1::date
        ORDER BY parcela_ot, fecha DESC
        LIMIT 500`, [desde]);
    const s = await this.bd.query(
      "SELECT estado, consultado_en FROM sincronias_ot WHERE herramienta = 'novedades' ORDER BY empezada_en DESC LIMIT 1");
    return { filas: f.rows, consultadoEn: s.rows[0]?.consultado_en ?? null, estado: s.rows[0]?.estado ?? null };
  }
}

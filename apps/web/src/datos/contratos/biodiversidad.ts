/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/biodiversidad.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * Aves de GBIF por especie y mes en el cuadro de 10 km de una finca (EV-1g, v 1). Lo escribe tuberia/biodiversidad/gbif_aves.py (fuera del repo) y se publica junto al índice de la finca como biodiversidad.json; lo lee el motor (apps/web/src/mundos/exterior/aves-mes.ts). DEDUCIDO: registros de GBIF en 10 km, no observado en la finca. Solo licencias CC0, CC BY y CC BY-SA (decisión 198). No lleva el centro ni el cuadro: solo su lado.
 */
export interface Biodiversidad {
  v: 1;
  origen: "gbif";
  /**
   * true solo en el ejemplo y los fixtures: las cifras son inventadas
   */
  sintetico?: boolean;
  grupo: "aves";
  generado: string;
  cuadro_km: number;
  anios: {
    desde: number;
    hasta: number;
  };
  descarga: {
    fecha: string;
    via: string;
    consulta: string;
    cita: string;
    /**
     * DOI de una descarga de GBIF con cuenta, si se hizo; la API pública no lo da y entonces va cada conjunto en fuentes
     */
    doi?: string | null;
  };
  /**
   * frase que el motor enseña tal cual junto a la ficha
   */
  atribucion: string;
  /**
   * los conjuntos de datos de GBIF de los que salen los registros contados, cada uno con su cita, su DOI (si lo tiene) y las licencias de lo contado
   */
  fuentes: {
    id: string;
    titulo: string;
    doi: string | null;
    cita: string;
    /**
     * @minItems 1
     */
    licencias: ["CC0_1_0" | "CC_BY_4_0" | "CC_BY_SA_4_0", ...("CC0_1_0" | "CC_BY_4_0" | "CC_BY_SA_4_0")[]];
    registros: number;
  }[];
  especies: {
    taxon_key: number;
    nombre_cientifico: string;
    nombre_comun?: string;
    /**
     * enero a diciembre: registros de ese mes sumados en todos los años, y en cuántos años distintos hay alguno
     *
     * @minItems 12
     * @maxItems 12
     */
    meses: [
      {
        n: number;
        anios: number;
      },
      {
        n: number;
        anios: number;
      },
      {
        n: number;
        anios: number;
      },
      {
        n: number;
        anios: number;
      },
      {
        n: number;
        anios: number;
      },
      {
        n: number;
        anios: number;
      },
      {
        n: number;
        anios: number;
      },
      {
        n: number;
        anios: number;
      },
      {
        n: number;
        anios: number;
      },
      {
        n: number;
        anios: number;
      },
      {
        n: number;
        anios: number;
      },
      {
        n: number;
        anios: number;
      },
      ...{
        n: number;
        anios: number;
      }[]
    ];
  }[];
}

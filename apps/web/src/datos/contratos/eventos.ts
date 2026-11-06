/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/eventos.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * eventos
 */
export interface Eventos {
  v: 1;
  $comment?: string;
  eventos: {
    [k: string]: {
      descripcion: string;
      datos: {};
      /**
       * @minItems 1
       */
      emiten: [string, ...string[]];
      escuchan: string[];
    };
  };
}

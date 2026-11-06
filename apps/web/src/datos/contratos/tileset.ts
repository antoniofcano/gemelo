/* GENERADO por apps/web/herramientas/genera_tipos.mjs desde contratos/tileset.schema.json. NO EDITAR.
 * Regenerar: node apps/web/herramientas/genera_tipos.mjs (el guardián tipos_contratos lo comprueba). */

/**
 * Tileset 3D Tiles 1.1 del gemelo: lo propio (extras.gemelo) entre tuberia/tiles3d y el motor
 */
export interface Tileset {
  asset: {
    version: "1.1";
  };
  geometricError: number;
  extras: {
    gemelo: {
      contrato_tileset: 2;
      contrato_origen: 2;
      finca_id: string;
      srs: "EPSG:25830";
      /**
       * @minItems 2
       */
      centro_utm: [number, number];
      z0: number;
      id_fuente: "copas_id" | "indice";
      huella_registro: string;
      catalogo_tipos: string;
      tipos: {
        "-1": null;
        [k: string]: string | null;
      };
      tipo_generico: -1;
    };
  };
  root: Raiz;
}
export interface Raiz {
  boundingVolume: Caja;
  geometricError: number;
  refine: "REPLACE";
  /**
   * @minItems 16
   * @maxItems 16
   */
  transform: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    ...number[]
  ];
  /**
   * @minItems 1
   */
  children: [Tesela, ...Tesela[]];
}
export interface Caja {
  /**
   * @minItems 12
   * @maxItems 12
   */
  box: [number, number, number, number, number, number, number, number, number, number, number, number, ...number[]];
}
export interface Tesela {
  boundingVolume: Caja;
  geometricError: number;
  content: {
    uri: string;
  };
  extras?: {
    gemelo: {
      /**
       * @minItems 3
       */
      cuadro: [number, number, number];
      olivos: number;
      huella: string;
    };
  };
  /**
   * @minItems 1
   */
  children?: [Tesela, ...Tesela[]];
}

// Validador del contrato de la ficha (contratos/haza.schema.json) con ajv en modo estricto y formatos.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import formatos from "ajv-formats";

export const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));
export const CONTRATOS = RAIZ + "contratos/";

type Plugin = (a: Ajv) => Ajv;
const anade = ((formatos as unknown as { default?: Plugin }).default ?? (formatos as unknown as Plugin));

export function validadorFicha() {
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  anade(ajv);
  // «any» a propósito: las pruebas leen campos de una ficha que el propio validador acaba de comprobar
  return ajv.compile<Record<string, any>>(JSON.parse(readFileSync(CONTRATOS + "haza.schema.json", "utf8")));
}

/** Validador del tiempo (contratos/tiempo.schema.json), igual de estricto. */
export function validadorTiempo() {
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  anade(ajv);
  return ajv.compile<Record<string, any>>(JSON.parse(readFileSync(CONTRATOS + "tiempo.schema.json", "utf8")));
}

/** Validador del histórico (contratos/tiempo-historico.schema.json). */
export function validadorTiempoHistorico() {
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  anade(ajv);
  return ajv.compile<Record<string, any>>(JSON.parse(readFileSync(CONTRATOS + "tiempo-historico.schema.json", "utf8")));
}

/** Validador de lo de hoy en vivo (contratos/ot-hoy.schema.json). */
export function validadorOtHoy() {
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  anade(ajv);
  return ajv.compile<Record<string, any>>(JSON.parse(readFileSync(CONTRATOS + "ot-hoy.schema.json", "utf8")));
}

/** Validador de la lista blanca de los olivos personalizados de una haza (contratos/olivos-haza.schema.json). */
export function validadorOlivosHaza() {
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  anade(ajv);
  return ajv.compile<Record<string, any>>(JSON.parse(readFileSync(CONTRATOS + "olivos-haza.schema.json", "utf8")));
}

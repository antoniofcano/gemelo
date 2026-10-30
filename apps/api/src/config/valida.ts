// Validación de la configuración versionada (contratos/config.schema.json; C6 de ADR-0023, OF6 de doc/sistema/OFICINA.md):
// el esquema (con sus límites seguros, decisión 111: en las gafas los presupuestos solo bajan) y las reglas entre campos que
// el esquema no dice: E1 ≤ E0 / 1,5 y E2 ≤ E1 / 1,5, y cada tabla de épocas cubre los 366 días con una sola época por día
// (decisión 112; la misma regla que apps/web/olivo/epocas.js validaTabla). La página de la oficina también lo comprobará,
// pero la barrera es esta. El motor, además, recorta cada valor a sus límites al leerlo.
import { Ajv2020 } from "ajv/dist/2020.js";
import { esquemaContrato } from "../hazas/rutas.ts";

export const EPOCAS = ["reposo", "boton", "flor", "cuajado", "verde", "envero", "madura"] as const;
type Ventana = { desde: string; hasta: string };
type Tabla = Record<string, Ventana>;

const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
const esquema = ajv.compile(esquemaContrato("config.schema.json"));

const mmdd = (d: Date) => String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
const dentro = (m: string, v: Ventana) => (v.desde <= v.hasta ? m >= v.desde && m <= v.hasta : m >= v.desde || m <= v.hasta);

/** [] si la tabla cubre los 366 días de un año bisiesto con UNA sola época cada uno; si no, lo que falla (hasta 5 líneas). */
export function validaTabla(t: Tabla): string[] {
  const err: string[] = [];
  for (let d = 0; d < 366; d++) {
    const m = mmdd(new Date(Date.UTC(2024, 0, 1 + d))), n = EPOCAS.filter(e => t[e] && dentro(m, t[e])).length;
    if (n !== 1) err.push(m + (n ? ": en varias épocas" : ": sin época"));
  }
  return err.slice(0, 5);
}

/** Lo que falla de un cuerpo de configuración ([] si vale). */
export function validaConfig(c: unknown): string[] {
  if (!esquema(c)) return (esquema.errors ?? []).slice(0, 8).map(e => (e.instancePath || "/") + " " + (e.message ?? "no vale"));
  const cfg = c as { escalera?: { umbralesPx?: { e0: number; e1: number; e2: number } }; epocas?: { comun: Tabla; fincas?: Record<string, Tabla> } };
  const err: string[] = [];
  const u = cfg.escalera?.umbralesPx;
  if (u && u.e1 > u.e0 / 1.5) err.push("/escalera/umbralesPx e1 debe ser ≤ e0 / 1,5");
  if (u && u.e2 > u.e1 / 1.5) err.push("/escalera/umbralesPx e2 debe ser ≤ e1 / 1,5");
  if (cfg.epocas) {
    const tablas: [string, Tabla][] = [["comun", cfg.epocas.comun], ...Object.entries(cfg.epocas.fincas ?? {}).map(([k, t]) => ["fincas/" + k, t] as [string, Tabla])];
    for (const [k, t] of tablas) for (const e of validaTabla(t)) err.push("/epocas/" + k + " " + e);
  }
  return err;
}

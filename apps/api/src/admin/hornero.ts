// El hornero visto desde la oficina (OF5, Sistema): SOLO LEE lo que él deja (tuberia/olivos/servicio.mjs): <estado>/servicio.json (el latido),
// <estado>/<finca>.json (el estado de su última vuelta) y <salida>/<finca>/olivos/manifiesto.json (qué hay horneado). No escribe nada:
// «re-hornear» es de OF9. Sin GEMELO_HORNERO_ESTADO la sección dice «sin conectar». Lo que sale a la pantalla es una lista blanca:
// nunca rutas del servidor (los mensajes de error se limpian) ni el pid.
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const txt = (v: unknown, max = 80): string | null => (typeof v === "string" && v ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, max) : null);
const iso = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
const nat = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const FINCA = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function leeJson(ruta: string): Obj | null {
  try { return obj(JSON.parse(readFileSync(ruta, "utf8"))); } catch { return null; }
}

/** Un mensaje de error del hornero sin rutas ni direcciones: lo que parezca una ruta se sustituye por «…». */
export function limpiaMensaje(t: unknown): string | null {
  const s = txt(t, 400);
  return s ? s.replace(/(?:[A-Za-z]:)?[\\/][^\s"'`):,;]*|[^\s:,;]*[\\/]\S+/g, "…").slice(0, 200) : null;
}

export interface FincaHornero {
  finca: string;
  fase: string | null; error: string | null;
  epoca_actual: string | null; epoca_siguiente: string | null;
  horneado_en: string | null; actualizado_en: string | null; durmiendo_hasta: string | null; ultimo_motivo: string | null;
  objetos: number | null; bytes: number | null;
}
export interface Hornero {
  conectado: boolean;
  /** ok: late y nada falló · aviso: algo falló o falta el estado de una finca · mal: no late · apagado: sin conectar */
  salud: "ok" | "aviso" | "mal" | "apagado";
  detalle: string;
  latido_en: string | null;
  fincas: FincaHornero[];
}

export function leeHornero(cfg: { estado: string | null; salida: string | null }, ahoraMs: number = Date.now()): Hornero {
  if (!cfg.estado) return { conectado: false, salud: "apagado", detalle: "La api no está conectada al estado del hornero.", latido_en: null, fincas: [] };
  const sv = leeJson(join(cfg.estado, "servicio.json"));
  if (!sv) return { conectado: true, salud: "mal", detalle: "El hornero no ha dejado su latido.", latido_en: null, fincas: [] };
  const latido = iso(sv["latido_en"]), compruebaS = nat(sv["comprueba_s"]) ?? 600;
  const fincasSv = obj(sv["fincas"]) ?? {};
  const fincas: FincaHornero[] = [];
  let aviso = false, enCurso = false;
  for (const id of Object.keys(fincasSv).filter(k => FINCA.test(k)).slice(0, 20)) {
    const f = obj(fincasSv[id]) ?? {}, st = leeJson(join(cfg.estado, id + ".json")), man = cfg.salida ? leeJson(join(cfg.salida, id, "olivos", "manifiesto.json")) : null;
    const vars = Array.isArray(man?.["variantes"]) ? (man["variantes"] as unknown[]) : null;
    const eps = Array.isArray(man?.["epocas"]) ? (man["epocas"] as unknown[]).map(e => txt(obj(e)?.["epoca"], 40)).filter((e): e is string => !!e) : [];
    const actual = txt(man?.["actual"], 40) ?? txt(st?.["epoca_actual"], 40);
    const fase = txt(st?.["fase"], 60), error = limpiaMensaje(st?.["error"]) ?? limpiaMensaje(f["fallo"]);
    if (error || fase === "error" || !st) aviso = true;
    if (fase && !["listo", "error"].includes(fase)) enCurso = true;
    fincas.push({
      finca: id, fase, error,
      epoca_actual: actual, epoca_siguiente: eps.find(e => e !== actual) ?? null,
      horneado_en: iso(man?.["horneado_en"]), actualizado_en: iso(st?.["actualizado_en"]), durmiendo_hasta: iso(f["durmiendo_hasta"]), ultimo_motivo: txt(f["ultimo_motivo"], 80),
      objetos: vars ? vars.length : null,
      bytes: vars ? vars.reduce<number>((a, v) => a + (nat(obj(v)?.["bytes_br"]) ?? 0), 0) : null,
    });
  }
  const viejo = !latido || ahoraMs - Date.parse(latido) > (3 * compruebaS + 60) * 1000;
  // en una vuelta larga el latido lo escribe el propio hornero en el estado, no en servicio.json (tuberia/olivos/salud.mjs)
  if (viejo && !enCurso) return { conectado: true, salud: "mal", detalle: "El hornero no late desde hace más de lo esperado.", latido_en: latido, fincas };
  if (aviso) return { conectado: true, salud: "aviso", detalle: "La última vuelta de alguna finca falló o no hay estado todavía.", latido_en: latido, fincas };
  return { conectado: true, salud: "ok", detalle: enCurso ? "Horneando ahora." : "En marcha.", latido_en: latido, fincas };
}

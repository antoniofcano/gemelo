// L9-06 (auditoría de noviembre): el centinela de reingresos. LiveKit no revoca un token ya firmado: al expulsar, la api deja de dar tokens nuevos y saca
// las conexiones con RemoveParticipant, pero quien guardó el suyo (o el que LiveKit le renueva mientras está conectado, que según su documentación vale
// 10 min [NO VERIFICADO contra la 1.13.11]) podría volver a entrar hasta que caduque. Por eso acortar TTL_S no basta, y la api, que no está en el camino
// de la conexión, hace lo que sí puede: mientras dure la marca de expulsión, mira cada BARRIDO_MS las salas del mundo y vuelve a sacar a ese hogar si
// está dentro. Sin marcas vivas no llama a LiveKit. No toca los clientes ni la configuración de LiveKit.
// Un webhook de LiveKit («participant_joined») lo haría al instante, pero pide cambiar infra/livekit.yaml en el VPS (ADR-0033, MU3-2): queda como mejora.
// Las marcas viven en memoria, pero cada expulsión queda en la auditoría (admin.presencia_expulsado, guiada.expulsado) con su hora: al arrancar,
// reconstruyeMarcas las vuelve a poner desde ahí (un reinicio ya no deja entrar con el token anterior). Sin tabla nueva ni datos personales nuevos.
import type { Bd } from "../bd/pool.ts";
import type { ModeradorSala } from "./livekit.ts";
import { SALA_GUIADA, TTL_S } from "./livekit.ts";

/** Dónde apunta el centinela lo que falla (el registro de Fastify cumple). */
export interface RegistroCentinela { warn(o: object, m: string): void }

export interface DepsReingreso {
  moderador: Pick<ModeradorSala, "expulsaHogar">;
  /** el prefijo opaco del hogar en las salas (prefijoHogar) */
  prefijo: (hogar: number) => string;
  /** expulsados de la visita compartida (rutas.ts): fuera de TODAS las salas del mundo */
  expulsados: { vivos(ahora?: number): number[] };
  /** las salas donde mirar: las fijas, las guiadas abiertas y las de los corros */
  salas: () => Promise<string[]>;
  /** expulsados de una guiada (voz_rutas.ts): fuera de `guiada-<evento>` */
  guiada?: { vivos(ahora?: number): { evento: number; hogar: number }[] };
  ahora?: () => number;
  /** L9-06: un fallo de LiveKit en una sala se apunta aquí y la pasada sigue con las demás */
  log?: RegistroCentinela;
}

/** Una pasada: vuelve a sacar a los expulsados que estén dentro. Devuelve cuántas conexiones sacó (0 = nadie había vuelto). */
export async function vuelveAExpulsar(d: DepsReingreso): Promise<number> {
  const ahora = (d.ahora ?? Date.now)();
  const generales = d.expulsados.vivos(ahora), deGuiada = d.guiada ? d.guiada.vivos(ahora) : [];
  if (!generales.length && !deGuiada.length) return 0;   // lo normal: nadie expulsado, ninguna llamada a LiveKit
  let n = 0;
  // L9-06: cada sala por su cuenta: un error de LiveKit (que no sea el 404 de «la sala no existe», que expulsaHogar ya da por 0) en una sala se apunta
  // y no corta la pasada para las demás
  const saca = async (sala: string, prefijo: string) => {
    try { n += await d.moderador.expulsaHogar(sala, prefijo); }
    catch (e) { d.log?.warn({ sala, err: (e as Error).message }, "presencia: el centinela no pudo mirar una sala; sigue con las demás"); }
  };
  if (generales.length) {
    const salas = await d.salas();
    for (const h of generales) { const p = d.prefijo(h); for (const s of salas) await saca(s, p); }
  }
  for (const { evento, hogar } of deGuiada) await saca(SALA_GUIADA(evento), d.prefijo(hogar));
  return n;
}

/** Lo que el centinela necesita para programarse: el de verdad es setInterval (sin retener el proceso); las pruebas ponen uno a mano. */
export interface Temporizador { cada(ms: number, fn: () => void): unknown; para(h: unknown): void }
export const TEMPORIZADOR_REAL: Temporizador = {
  cada: (ms, fn) => { const t = setInterval(fn, ms); t.unref(); return t; },
  para: h => clearInterval(h as NodeJS.Timeout),
};

/**
 * L9-06: arranca el centinela (una pasada de vuelveAExpulsar cada `ms`) y devuelve cómo pararlo. Una pasada no empieza si la anterior sigue en curso
 * (LiveKit lento no amontona llamadas). Lo que saca o lo que falla va al registro.
 */
export function arrancaCentinela(d: DepsReingreso & { log: RegistroCentinela }, ms: number, t: Temporizador = TEMPORIZADOR_REAL): () => void {
  let enCurso = false;
  const h = t.cada(ms, () => {
    if (enCurso) return;
    enCurso = true;
    vuelveAExpulsar(d)
      .then(n => { if (n > 0) d.log.warn({ conexiones: n }, "presencia: un expulsado volvió a entrar con un token anterior; se le ha vuelto a sacar"); })
      .catch(e => d.log.warn({ err: (e as Error).message }, "presencia: el centinela de reingresos falló"))
      .finally(() => { enCurso = false; });
  });
  return () => t.para(h);
}

/** Las marcas que se pueden reconstruir: las de la visita compartida y las de cada guiada. */
export interface MarcasReingreso {
  expulsados: { marca(hogar: number, ahora?: number): void };
  guiada?: { marca(evento: number, hogar: number, ahora?: number): void };
}
export const SQL_EXPULSIONES_VIVAS =
  `SELECT accion, detalle->>'hogar' AS hogar, detalle->>'evento' AS evento, (extract(epoch FROM cuando) * 1000)::float8 AS en
     FROM auditoria
    WHERE accion IN ('admin.presencia_expulsado', 'guiada.expulsado') AND cuando > now() - make_interval(secs => $1)
    ORDER BY cuando`;

/**
 * L9-06: al arrancar, vuelve a poner las marcas de las expulsiones de los últimos TTL_S segundos leyéndolas de la auditoría, cada una con la hora
 * a la que se hizo (así vence cuando habría vencido). Devuelve cuántas puso. Una fila con el detalle raro se salta.
 */
export async function reconstruyeMarcas(bd: Pick<Bd, "query">, m: MarcasReingreso): Promise<number> {
  const r = await bd.query<{ accion: string; hogar: string | null; evento: string | null; en: number | string }>(SQL_EXPULSIONES_VIVAS, [TTL_S]);
  let n = 0;
  for (const f of r.rows) {
    const hogar = Number(f.hogar), en = Number(f.en);
    if (!Number.isSafeInteger(hogar) || hogar < 1 || !Number.isFinite(en)) continue;
    if (f.accion === "admin.presencia_expulsado") { m.expulsados.marca(hogar, en); n++; }
    else if (f.accion === "guiada.expulsado" && m.guiada) {
      const evento = Number(f.evento);
      if (!Number.isSafeInteger(evento) || evento < 1) continue;
      m.guiada.marca(evento, hogar, en); n++;
    }
  }
  return n;
}

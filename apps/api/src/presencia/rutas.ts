// Presencia compartida (F2): el token para entrar a la sala libre de LiveKit y la moderación mínima (decisión 42: la
// oficina expulsa desde el servidor y queda en la auditoría). Contrato: contratos/api.openapi.yaml,
// contratos/livekit-roles.json. Con sesión; el Origin lo comprueba app.ts como en todo POST.
import type { FastifyInstance } from "fastify";
import { requiereRol, requiereSesion } from "../auth/roles.ts";
import { audita } from "../auth/servicio.ts";
import type { Bd } from "../bd/pool.ts";
import type { ConfigLiveKit } from "../config.ts";
import type { Contexto } from "../contexto.ts";
import { AVATAR_POR_DEFECTO, type Avatar, type ClaveSala, CLAVES_SALA, DISPOSITIVOS, limpiaAspecto, type Dispositivo, Expulsados, esRolOficina, firmaToken, ModeradorLiveKit, type ModeradorSala, prefijoHogar, SALA_LIBRE, SALAS } from "./livekit.ts";
import { LigaduraVisita, puedeEntrar } from "./acceso_visita.ts";
import { rutasOficinaMundo } from "./oficina_mundo.ts";
import { ExpulsadosGuiada, rutasVoz } from "./voz_rutas.ts";
import { arrancaCentinela, MARCA_GENERAL, RecuperaMarcas } from "./reingreso.ts";
import { BARRIDO_MS } from "./corro.ts";
import { creaCorros, rutasCorros } from "./corro_rutas.ts";
import type { Corros } from "./corro.ts";

const APAGADA = { error: "presencia_apagada", mensaje: "La visita compartida no está disponible en este servidor." } as const;

export interface DepsExpulsion {
  bd: Pick<Bd, "query">; lk: ConfigLiveKit; moderador: ModeradorSala; expulsados: Expulsados;
  /** F3c: las salas guiadas abiertas ahora (`guiada-<evento>`), para sacarle también de ellas; sin esto, solo las dos fijas */
  guiadas?: () => Promise<string[]>;
  /** F3k-1: los corros de la visita libre: se le saca del suyo (y se borran sus invitaciones) y de su sala `corro-<id>` */
  corros?: Corros | null;
}
export type ResultadoExpulsion = { ok: true; estaba_en_sala: boolean; conexiones: number } | { ok: false; motivo: "no_existe" };

/**
 * Expulsión (solo la oficina): no se le dan tokens nuevos durante 15 min, se sacan con RoomService TODAS sus conexiones (una por aparato) de TODAS las
 * salas del mundo (OF10: la general y la de la visita) y se apunta en la auditoría (quién, a qué hogar, de qué salas, si estaba, cuántas y el motivo;
 * `sala` lleva las salas donde estaba, separadas por comas, o la libre si no estaba en ninguna). Si LiveKit falla, la marca se queda y el error sube
 * (500): la oficina lo ve y puede repetir. H-3: la marca se apunta en la auditoría (MARCA_GENERAL) ANTES de llamar a LiveKit: aunque falle, el centinela
 * le saca en su siguiente pasada y un reinicio la reconstruye.
 */
export async function expulsa(d: DepsExpulsion, adminId: number, hogarId: number, motivo: string | null): Promise<ResultadoExpulsion> {
  const r = await d.bd.query("SELECT 1 FROM hogares WHERE id = $1", [hogarId]);
  if (!r.rowCount) return { ok: false, motivo: "no_existe" };
  d.expulsados.marca(hogarId);
  // mientras esta función le saca, el centinela no (si no, le sacaba él en medio y la oficina veía menos conexiones de las que había)
  const suelta = d.expulsados.sacando(hogarId);
  try { return await sacaYApunta(d, adminId, hogarId, motivo); } finally { suelta(); }
}
/** Lo de expulsa() tras la marca: la auditoría (H-3: antes de LiveKit), el corro, las salas y el resultado. */
async function sacaYApunta(d: DepsExpulsion, adminId: number, hogarId: number, motivo: string | null): Promise<ResultadoExpulsion> {
  await audita(d.bd as Bd, adminId, MARCA_GENERAL, { hogar: hogarId });
  const prefijo = prefijoHogar(d.lk, hogarId), donde: string[] = [];
  let conexiones = 0;
  // F3k-1: primero se le saca de su corro (sale de la sala del corro con su RemoveParticipant y, si quedan menos de dos, el corro se deshace)
  const corro = d.corros?.corroDe(hogarId) ?? null;
  if (d.corros) await d.corros.sacaHogar(hogarId, "expulsion", adminId);
  const salas = [...CLAVES_SALA.map(k => SALAS[k]), ...(d.guiadas ? await d.guiadas() : [])];
  for (const s of salas) { const n = await d.moderador.expulsaHogar(s, prefijo); if (n > 0) donde.push(s); conexiones += n; }
  if (corro) donde.push("corro-" + corro);
  const estaba = conexiones > 0;
  await audita(d.bd as Bd, adminId, "admin.presencia_expulsado", { hogar: hogarId, sala: donde.length ? donde.join(",") : SALA_LIBRE, estaba, conexiones, ...(motivo ? { motivo } : {}) });
  return { ok: true, estaba_en_sala: estaba, conexiones };
}

export async function rutasPresencia(app: FastifyInstance, ctx: Contexto): Promise<void> {
  const { bd } = ctx;
  const expulsados = new Expulsados();
  const ligadura = new LigaduraVisita();   // OF10b: el evento de la agenda al que está ligada la sala de la visita (null = abierta a quien invite la oficina)
  const lk = ctx.config.livekit;
  const real = lk ? new ModeradorLiveKit(lk) : null;
  const moderador: ModeradorSala | null = ctx.moderador ?? real;
  // F3c: con un moderador de mentira (pruebas) y sin uno de voz, la voz queda apagada (503) en vez de llamar a un LiveKit que no existe
  const voz = ctx.moderadorVoz ?? (ctx.moderador ? null : real);
  // F3k-1: los corros de la visita libre (en memoria; null sin LiveKit o sin voz: sus rutas dan 503)
  const depsCorros = { lk: lk ?? null, voz, moderador, expulsados, permitida: ctx.config.vozCercania.permitida, ...(ctx.relojVoz ? { reloj: ctx.relojVoz } : {}) };
  const corros = creaCorros(bd, depsCorros, app.log);
  // L9-06: el centinela de reingresos (reingreso.ts): mientras dure una expulsión, cada BARRIDO_MS vuelve a sacar de las salas a quien entre con un token
  // firmado antes de ella. Con un reloj de pruebas y sin temporizador de pruebas no se arranca (como el barrido de los corros); sin expulsados vivos no
  // llama a LiveKit. Al arrancar, las marcas de los últimos TTL_S se reconstruyen desde la auditoría (un reinicio no las pierde)
  const expulsadosGuiada = new ExpulsadosGuiada();
  let paraCentinela: (() => void) | null = null;
  // H-3: si leer la auditoría falla al arrancar, se reintenta en cada pasada del centinela (no se queda sin marcas)
  const recupera = new RecuperaMarcas(bd, { expulsados, guiada: expulsadosGuiada }, app.log);
  if (lk && moderador && (ctx.temporizador || !ctx.relojVoz)) {
    const salasDelMundo = async () => [...CLAVES_SALA.map(k => SALAS[k]), ...(voz ? await voz.salasGuiadas() : []), ...(corros ? corros.salas() : [])];
    paraCentinela = arrancaCentinela({ moderador, prefijo: h => prefijoHogar(lk, h), expulsados, guiada: expulsadosGuiada, salas: salasDelMundo, log: app.log, recupera }, BARRIDO_MS, ctx.temporizador);
  }
  if (lk) {
    app.addHook("onReady", async () => { await recupera.intenta(); });
  }
  app.addHook("onClose", async () => { paraCentinela?.(); });

  // F2b: ¿hay presencia en red en este servidor? Barato y sin secretos (solo si LiveKit está configurado); con sesión, como el resto. El motor lo
  // pregunta una vez para activarse solo, sin ?presencia=red
  app.get("/api/presencia", { preHandler: requiereSesion }, async () => ({ red: !!lk }));

  // OF10: `sala` (opcional) elige la sala del mundo: «general» (la de siempre, por omisión) o «visita» (a la que invita la oficina)
  app.post<{ Body: { dispositivo: Dispositivo; sala?: ClaveSala } }>("/api/presencia/token", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["dispositivo"], properties: { dispositivo: { type: "string", enum: [...DISPOSITIVOS] }, sala: { type: "string", enum: [...CLAVES_SALA] } } } },
  }, async (req, rep) => {
    if (!lk) return rep.code(503).send(APAGADA);
    const id = req.session.hogarId!;
    if (expulsados.esta(id)) return rep.code(403).send({ error: "expulsado", mensaje: "La oficina te ha sacado de la visita compartida. Podrás volver a entrar más tarde." });
    // OF10b (decisión 154): la sala de la visita ligada a un evento es solo de la oficina y de los hogares apuntados (no en espera) a ese evento
    const evento = req.body.sala === "visita" ? ligadura.vigente() : null;
    if (evento !== null && !esRolOficina(req.session.rol!)) {
      const apuntado = ((await bd.query(
        `SELECT 1 FROM visitas_asistentes a JOIN visitas v ON v.id = a.visita_id JOIN hogares g ON g.id = a.hogar_id AND g.activo
          WHERE a.visita_id = $1 AND a.hogar_id = $2 AND a.estado = 'apuntado' AND v.estado <> 'cancelada'`, [evento, id])).rowCount ?? 0) > 0;
      const d = puedeEntrar({ sala: "visita", esOficina: false, evento, apuntado });
      if (!d.ok) return rep.code(403).send({ error: d.codigo, mensaje: d.mensaje });
    }
    const r = await bd.query<{ alias: string | null; camisa: number | null; sombrero: Avatar["sombrero"] | null; piel: number | null; vrm: string | null; aspecto: unknown }>(
      "SELECT g.alias, a.camisa, a.sombrero, a.piel, a.vrm, a.aspecto FROM hogares g LEFT JOIN avatares a ON a.hogar_id = g.id WHERE g.id = $1", [id]);
    const f = r.rows[0];
    if (!f) return rep.code(401).send({ error: "sin_sesion", mensaje: "Hace falta entrar con tu enlace." });
    // sin alias, un nombre neutro con un trozo del prefijo opaco del hogar (nada del correo ni del id de la base)
    const alias = f.alias ?? "Visitante " + prefijoHogar(lk, id).slice(2, 6);
    const avatar: Avatar = f.camisa === null || f.sombrero === null || f.piel === null ? AVATAR_POR_DEFECTO : { camisa: f.camisa, sombrero: f.sombrero, piel: f.piel, ...(f.vrm ? { vrm: f.vrm } : {}), ...limpiaAspecto(f.aspecto) };
    return firmaToken(lk, id, req.session.sessionId, { alias, avatar, rol: req.session.rol!, dispositivo: req.body.dispositivo }, Date.now(), req.body.sala ?? "general");
  });

  app.post<{ Body: { hogar_id: number; motivo?: string } }>("/api/admin/presencia/expulsar", {
    preHandler: requiereRol("oficina", "admin"),
    schema: {
      body: {
        type: "object", additionalProperties: false, required: ["hogar_id"],
        properties: { hogar_id: { type: "integer", minimum: 1, maximum: 2147483647 }, motivo: { type: "string", minLength: 1, maxLength: 200 } },
      },
    },
  }, async (req, rep) => {
    if (!lk || !moderador) return rep.code(503).send(APAGADA);
    const motivo = req.body.motivo?.trim().replace(/\s+/g, " ") || null;
    const r = await expulsa({ bd, lk, moderador, expulsados, corros, ...(voz ? { guiadas: () => voz.salasGuiadas() } : {}) }, req.session.hogarId!, req.body.hogar_id, motivo);
    if (!r.ok) return rep.code(404).send({ error: "no_existe" });
    return { estaba_en_sala: r.estaba_en_sala, conexiones: r.conexiones };
  });

  // OF10: el mundo en modo oficina (anunciar, llevar a otra sala, balizas oficiales): src/presencia/oficina_mundo.ts
  await rutasOficinaMundo(app, ctx, moderador, ligadura, voz ? () => voz.salasGuiadas() : undefined);
  // F3c: la voz de las visitas guiadas (sala `guiada-<evento>`, la palabra, silenciar, expulsar): src/presencia/voz_rutas.ts
  await rutasVoz(app, bd, { lk: lk ?? null, voz, expulsados, expulsadosGuiada, corros, ...(ctx.relojVoz ? { reloj: ctx.relojVoz } : {}) });
  // F3k-1 (ADR-0032): la voz por cercanía en corros (invitar, aceptar, salir, token de `corro-<id>`, bloqueos, avisos, suspensiones, interruptor): corro_rutas.ts
  await rutasCorros(app, bd, depsCorros, corros);
}

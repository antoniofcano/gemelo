// F3k-1: las rutas de la voz por cercanía en la visita libre, en corros (ADR-0032; contratos: api.openapi.yaml, livekit-roles.json v8, presencia.md,
// voz-consentimiento.md). Lógica de los corros en corro.ts (en memoria); lo que se guarda, en cercania.ts (migración 0025). Todas con sesión; el Origin lo
// comprueba app.ts en todo POST, PUT y DELETE. Ningún token lleva roomAdmin: lo que modera lo hace ESTA api con su clave de servidor. Nada se graba.
//  Cualquiera con sesión (lo que puede cada uno lo deciden Corros y Puertas con la base):
//   GET    /api/presencia/corros/estado                               mi estado: si la hay en el servidor, mi ajuste, mi consentimiento, mi suspensión, mi corro y mis invitaciones
//   GET    /api/presencia/corros                                      los corros vivos (qué identidades de hogar están en cada uno), para el icono «hablan entre ellos»
//   GET    /api/presencia/corros/ajuste  ·  PUT { activa }             el ajuste «Voz por cercanía» de mi cuenta (activarlo pide el consentimiento «cercania» vigente)
//   POST   /api/presencia/corros/invitaciones       { identidad }     invitar a esa conexión de la sala libre (su hogar) a mi corro
//   POST   /api/presencia/corros/invitaciones/:id/aceptar             aceptar una invitación mía
//   POST   /api/presencia/corros/invitaciones/:id/rechazar            «Ahora no»
//   DELETE /api/presencia/corros/invitaciones/:id                     retirar una invitación que mandé
//   POST   /api/presencia/corros/salir              { motivo? }       salir de mi corro (si quedan menos de dos, se deshace)
//   POST   /api/presencia/corros/token              { dispositivo }   el token de la sala de mi corro, `corro-<id>` (solo audio, solo micrófono)
//   GET    /api/presencia/corros/bloqueos  ·  POST { identidad }  ·  DELETE /api/presencia/corros/bloqueos/:prefijo   mis bloqueos de voz (en el servidor)
//   POST   /api/presencia/corros/avisos             { identidad, motivo, texto? }   avisar a la oficina (sin audio); quien avisa sale de su corro
//  La oficina (rol oficina o admin, aparato aprobado):
//   GET    /api/admin/voz/cercania  ·  PUT { activa }                  el interruptor general (apagado por omisión) y un resumen
//   GET    /api/admin/voz/avisos  ·  POST /api/admin/voz/avisos/:id/estado { estado }      los avisos de persona
//   POST   /api/admin/voz/suspensiones { hogar_id, dias }  ·  DELETE /api/admin/voz/suspensiones/:id   suspender y levantar la voz por cercanía de un hogar
//  La expulsión de siempre (POST /api/admin/presencia/expulsar) saca también del corro (rutas.ts).
// La oficina no tiene papel propio en los corros (EIPD-VOZ §13.4): puede estar en uno como cualquier cuenta (con el alias «Oficina») y modera por la api.
// Quien no tiene la voz por cercanía disponible recibe 409 con un código; a quien invita a alguien que no puede (apagada, sin aviso aceptado, suspendido,
// bloqueo, en otro corro, vetado) solo se le dice «no disponible», sin la razón: así un bloqueo no se nota (ADR-0032 e).
import type { FastifyInstance, FastifyReply } from "fastify";
import { audita } from "../auth/servicio.ts";
import { requiereSesion } from "../auth/roles.ts";
import type { Bd } from "../bd/pool.ts";
import type { ConfigLiveKit } from "../config.ts";
import { OFICINA } from "../oficina/acceso.ts";
import { consiente, estadoConsentimiento, VERSION_AVISO } from "./consentimiento_voz.ts";
import {
  ajuste, AVISOS_SUSPENDEN, bloquea, bloqueados, DIAS_SUSPENSION, desbloquea, disponibles, ESTADOS_AVISO, guardaAviso, hayBloqueo, interruptor, levantaSuspension,
  MOTIVOS_AVISO, type MotivoAviso, poneAjuste, poneInterruptor, suspende, suspension, TEXTO_AVISO_MAX,
} from "./cercania.ts";
import { Corros, BARRIDO_MS, MOTIVOS_CLIENTE, type MotivoSalida } from "./corro.ts";
import {
  ALIAS_OFICINA, AVATAR_POR_DEFECTO, type Avatar, DISPOSITIVOS, type Dispositivo, type Expulsados, firmaTokenCorro, type ModeradorSala, type ModeradorVoz,
  limpiaAspecto, prefijoHogar, SALA_LIBRE,
} from "./livekit.ts";
import { hogarDeIdentidad } from "./voz_rutas.ts";
import type { Reloj } from "./voz.ts";

const APAGADA = { error: "presencia_apagada", mensaje: "La visita compartida no está disponible en este servidor." } as const;
const CERCANIA_APAGADA = { error: "cercania_apagada", mensaje: "La voz por cercanía no está disponible ahora." } as const;
/** El tema de datos que manda la api a la sala libre (livekit-roles v8, «temas_de_datos.corro»): «mira tu estado de corro», sin más. */
export const TEMA_CORRO = "corro";
const IDENTIDAD = { type: "string", pattern: "^h_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$" } as const;
const PREFIJO = { type: "string", pattern: "^h_[A-Za-z0-9_-]{22}$" } as const;
const ID_INV = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", pattern: "^[A-Za-z0-9_-]{12}$" } } } as const;
const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 9007199254740991 } } } as const;
const VACIO = { type: "object", additionalProperties: false, properties: {} } as const;
const MENSAJES: Record<string, [number, string]> = {
  mismo_hogar: [409, "No puedes invitar a tu propio hogar."],
  no_puedes: [409, "Activa la voz por cercanía en Configuración (y acepta su aviso) para hablar en corro."],
  no_disponible: [409, "Esa persona no está disponible para hablar ahora."],
  ya_en_tu_corro: [409, "Ya estáis en el mismo corro."],
  corro_lleno: [409, "El corro ya tiene cinco hogares."],
  demasiadas_invitaciones: [429, "Has mandado muchas invitaciones seguidas: espera unos minutos."],
  no_existe: [404, "Esa invitación ya no está: ha caducado o la han retirado."],
  ya_en_un_corro: [409, "Ya estás en un corro: sal de él antes de entrar en otro."],
  sin_corro: [409, "No estás en ningún corro."],
};
const falla = (rep: FastifyReply, codigo: string) => { const [http, mensaje] = MENSAJES[codigo] ?? [409, codigo]; return rep.code(http).send({ error: codigo, mensaje }); };

export interface DepsCorros {
  lk: ConfigLiveKit | null; voz: ModeradorVoz | null; moderador: ModeradorSala | null; expulsados: Expulsados; permitida: boolean; reloj?: Reloj;
}

/** El alias con el que se ve a un hogar (como en el token de la sala libre): el suyo, «Oficina» para la oficina, o un nombre neutro con su prefijo opaco. */
export function aliasPublico(lk: Pick<ConfigLiveKit, "secreto">, f: { id: number; alias: string | null; rol: string }): string {
  if (f.rol === "oficina" || f.rol === "admin") return ALIAS_OFICINA;
  return f.alias ?? "Visitante " + prefijoHogar(lk, f.id).slice(2, 6);
}

/** Crea los corros con la base como Puertas y LiveKit como sala; null si no hay LiveKit o voz (entonces todo da 503). */
export function creaCorros(bd: Pick<Bd, "query">, d: DepsCorros, log: { warn: (o: unknown, m: string) => void }): Corros | null {
  const { lk, voz, moderador } = d;
  if (!lk || !voz) return null;
  return new Corros({
    sala: voz, prefijo: h => prefijoHogar(lk, h), log, ...(d.reloj ? { reloj: d.reloj } : {}),
    // sin el tope del servidor, nadie está disponible (el interruptor de la base no basta para encenderla)
    puertas: { disponibles: hs => (d.permitida ? disponibles(bd, hs) : Promise.resolve(new Set<number>())), bloqueo: (h, otros) => hayBloqueo(bd, h, otros) },
    audita: (actor, accion, detalle) => audita(bd as Bd, actor, accion, detalle),
    // comodidad: «mira tu estado de corro» a las conexiones de esos hogares en la sala libre (sin participante; el cliente pregunta por la api)
    avisa: async hogares => {
      if (!moderador?.participantes) return;
      const pre = hogares.map(h => prefijoHogar(lk, h) + "_");
      const destinos = (await moderador.participantes(SALA_LIBRE)).map(p => p.identidad).filter(i => pre.some(p => i.startsWith(p)));
      if (destinos.length) await moderador.envia(SALA_LIBRE, TEMA_CORRO, new TextEncoder().encode(JSON.stringify({ v: 1, que: "corro" })), destinos);
    },
  });
}

export async function rutasCorros(app: FastifyInstance, bd: Bd, d: DepsCorros, corros: Corros | null): Promise<void> {
  const { lk } = d;
  let barrido: NodeJS.Timeout | null = null;
  // el barrido de los desconectados: solo con el reloj de verdad (las pruebas lo llaman a mano)
  if (corros && !d.reloj) { barrido = setInterval(() => { corros.barre().catch(e => app.log.warn({ err: (e as Error).message }, "corros: barrido fallido")); }, BARRIDO_MS); barrido.unref(); }
  app.addHook("onClose", async () => { if (barrido) clearInterval(barrido); corros?.cierra(); });

  const sinCache = (rep: FastifyReply) => rep.header("cache-control", "no-store");
  /** Para todo lo de los corros: 503 sin LiveKit, null si ya respondió. */
  const base = async (rep: FastifyReply): Promise<{ lk: ConfigLiveKit; corros: Corros } | null> => {
    if (!lk || !corros) { await rep.code(503).send(APAGADA); return null; }
    return { lk, corros };
  };
  /** ¿Está encendida en el servidor? (el tope del entorno y el interruptor de la oficina) */
  const encendida = async () => d.permitida && (await interruptor(bd)).activa;
  const hogaresActivos = async () => (await bd.query<{ id: string | number }>("SELECT id FROM hogares WHERE activo")).rows.map(f => Number(f.id));
  /** De qué hogar activo es esa identidad (o ese prefijo) de la sala libre; null si de ninguno. Para 40 hogares, un HMAC por hogar es nada. */
  const hogarDe = async (l: ConfigLiveKit, identidad: string) => hogarDeIdentidad(l, identidad, await hogaresActivos());
  const alias = async (l: ConfigLiveKit, ids: number[]): Promise<Map<number, string>> => {
    if (!ids.length) return new Map();
    const r = await bd.query<{ id: string | number; alias: string | null; rol: string }>("SELECT id, alias, rol FROM hogares WHERE id = ANY($1::bigint[])", [ids]);
    return new Map(r.rows.map(f => [Number(f.id), aliasPublico(l, { id: Number(f.id), alias: f.alias, rol: f.rol })]));
  };

  // ---------------------------------------------------------------- lo de cada uno

  app.get("/api/presencia/corros/estado", { preHandler: requiereSesion, config: { rateLimit: { max: 120, timeWindow: 60_000 } } }, async (req, rep) => {
    // sin LiveKit no hay voz por cercanía, y se dice con un 200 «no disponible» (no un 503): el motor lo pregunta al montarse y un error ensuciaría la consola de todos
    if (!lk || !corros) { sinCache(rep); return { disponible: false, ajuste: { activa: false }, consentimiento: null, suspension: null, puedo: false, corro: null, invitaciones: { recibidas: [], enviadas: [] } }; }
    const b = await base(rep); if (!b) return rep;
    sinCache(rep);
    const h = req.session.hogarId!, v = b.corros.vista(h);
    const [en, aj, cons, sus] = await Promise.all([encendida(), ajuste(bd, h), estadoConsentimiento(bd, h, "cercania"), suspension(bd, h)]);
    const ids = [...(v.corro?.miembros.map(m => m.hogar) ?? []), ...v.recibidas.map(i => i.de), ...v.enviadas.map(i => i.a)];
    const al = await alias(b.lk, ids), quien = (x: number) => ({ prefijo: prefijoHogar(b.lk, x), alias: al.get(x) ?? null });
    return {
      disponible: en, ajuste: aj, consentimiento: cons, suspension: sus,
      puedo: en && aj.activa && cons.aceptada && !sus,
      corro: v.corro ? { id: v.corro.id, sala: v.corro.sala, desde: v.corro.desde, miembros: v.corro.miembros.map(m => ({ ...quien(m.hogar), desde: m.desde, yo: m.hogar === h })) } : null,
      invitaciones: {
        recibidas: v.recibidas.map(i => ({ id: i.id, de: quien(i.de), caduca_en: i.caduca_en })),
        enviadas: v.enviadas.map(i => ({ id: i.id, a: quien(i.a), caduca_en: i.caduca_en })),
      },
    };
  });

  app.get("/api/presencia/corros", { preHandler: requiereSesion, config: { rateLimit: { max: 120, timeWindow: 60_000 } } }, async (_req, rep) => {
    const b = await base(rep); if (!b) return rep;
    sinCache(rep);
    // a quien está fuera solo se le dice qué hogares (su prefijo, el mismo de sus identidades en la sala libre) están juntos: ni alias ni nada más
    if (!(await encendida())) return { corros: [] };
    return { corros: b.corros.publicos().map(c => ({ id: c.id, prefijos: c.miembros.map(m => prefijoHogar(b.lk, m)) })) };
  });

  app.get("/api/presencia/corros/ajuste", { preHandler: requiereSesion }, async (req, rep) => { sinCache(rep); return ajuste(bd, req.session.hogarId!); });
  app.put<{ Body: { activa: boolean } }>("/api/presencia/corros/ajuste", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["activa"], properties: { activa: { type: "boolean" } } } },
  }, async (req, rep) => {
    sinCache(rep);
    const h = req.session.hogarId!;
    // decisión 211: antes de activarla, el aviso propio (con la declaración de mayor de edad); el motor lo enseña, pero quien manda es la api
    if (req.body.activa && !(await consiente(bd, h, "cercania")))
      return rep.code(409).send({ error: "sin_consentimiento", mensaje: "Antes de activar la voz por cercanía hay que aceptar su aviso.", version: VERSION_AVISO.cercania });
    if (await poneAjuste(bd, h, req.body.activa)) await audita(bd, h, "corro.ajuste", { hogar: h, activa: req.body.activa });
    if (!req.body.activa) await corros?.sacaHogar(h, "ajuste", h);
    return ajuste(bd, h);
  });

  // ---------------------------------------------------------------- invitar, aceptar, rechazar, salir

  app.post<{ Body: { identidad: string } }>("/api/presencia/corros/invitaciones", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["identidad"], properties: { identidad: IDENTIDAD } } },
  }, async (req, rep) => {
    const b = await base(rep); if (!b) return rep;
    if (!(await encendida())) return rep.code(409).send(CERCANIA_APAGADA);
    const h = req.session.hogarId!;
    if (d.expulsados.esta(h)) return rep.code(403).send({ error: "expulsado", mensaje: "La oficina te ha sacado de la visita compartida. Podrás volver a entrar más tarde." });
    const a = await hogarDe(b.lk, req.body.identidad);
    if (a === null) return falla(rep, "no_disponible");
    const r = await b.corros.invita(h, a);
    if (!r.ok) return falla(rep, r.codigo);
    return rep.code(201).send({ id: r.id, caduca_en: r.caduca_en });
  });

  app.post<{ Params: { id: string }; Body: Record<string, never> }>("/api/presencia/corros/invitaciones/:id/aceptar", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: { params: ID_INV, body: VACIO },
  }, async (req, rep) => {
    const b = await base(rep); if (!b) return rep;
    if (!(await encendida())) return rep.code(409).send(CERCANIA_APAGADA);
    if (d.expulsados.esta(req.session.hogarId!)) return rep.code(403).send({ error: "expulsado", mensaje: "La oficina te ha sacado de la visita compartida. Podrás volver a entrar más tarde." });
    const r = await b.corros.acepta(req.session.hogarId!, req.params.id);
    if (!r.ok) return falla(rep, r.codigo);
    return { corro: r.corro, sala: r.sala };
  });

  app.post<{ Params: { id: string }; Body: Record<string, never> }>("/api/presencia/corros/invitaciones/:id/rechazar", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { params: ID_INV, body: VACIO },
  }, async (req, rep) => {
    const b = await base(rep); if (!b) return rep;
    const r = await b.corros.rechaza(req.session.hogarId!, req.params.id);
    if (!r.ok) return falla(rep, r.codigo);
    return rep.code(204).send();
  });

  app.delete<{ Params: { id: string } }>("/api/presencia/corros/invitaciones/:id", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { params: ID_INV },
  }, async (req, rep) => {
    const b = await base(rep); if (!b) return rep;
    await b.corros.cancela(req.session.hogarId!, req.params.id);
    return rep.code(204).send();
  });

  app.post<{ Body: { motivo?: MotivoSalida } }>("/api/presencia/corros/salir", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, properties: { motivo: { type: "string", enum: [...MOTIVOS_CLIENTE] } } } },
  }, async (req, rep) => {
    const b = await base(rep); if (!b) return rep;
    await b.corros.sale(req.session.hogarId!, req.body?.motivo ?? "salir");
    return rep.code(204).send();
  });

  app.post<{ Body: { dispositivo: Dispositivo } }>("/api/presencia/corros/token", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["dispositivo"], properties: { dispositivo: { type: "string", enum: [...DISPOSITIVOS] } } } },
  }, async (req, rep) => {
    const b = await base(rep); if (!b) return rep;
    const h = req.session.hogarId!;
    if (d.expulsados.esta(h)) return rep.code(403).send({ error: "expulsado", mensaje: "La oficina te ha sacado de la visita compartida. Podrás volver a entrar más tarde." });
    const corro = b.corros.corroDe(h);
    if (!corro) return falla(rep, "sin_corro");
    // se vuelve a mirar todo en el momento de firmar (interruptor, ajuste, consentimiento, suspensión): sin eso no hay token, esté o no en el corro
    if (!(await encendida())) return rep.code(409).send(CERCANIA_APAGADA);
    if (!(await disponibles(bd, [h])).has(h)) { await b.corros.sacaHogar(h, "no_disponible", null); return falla(rep, "no_puedes"); }
    const f = (await bd.query<{ alias: string | null; camisa: number | null; sombrero: Avatar["sombrero"] | null; piel: number | null; vrm: string | null; aspecto: unknown }>(
      "SELECT g.alias, a.camisa, a.sombrero, a.piel, a.vrm, a.aspecto FROM hogares g LEFT JOIN avatares a ON a.hogar_id = g.id WHERE g.id = $1", [h])).rows[0];
    if (!f) return rep.code(401).send({ error: "sin_sesion", mensaje: "Hace falta entrar con tu enlace." });
    const nombre = f.alias ?? "Visitante " + prefijoHogar(b.lk, h).slice(2, 6);
    const avatar: Avatar = f.camisa === null || f.sombrero === null || f.piel === null ? AVATAR_POR_DEFECTO : { camisa: f.camisa, sombrero: f.sombrero, piel: f.piel, ...(f.vrm ? { vrm: f.vrm } : {}), ...limpiaAspecto(f.aspecto) };
    const t = await firmaTokenCorro(b.lk, h, req.session.sessionId, { alias: nombre, avatar, rol: req.session.rol!, dispositivo: req.body.dispositivo }, corro);
    return { ...t, papel: "miembro", corro };
  });

  // ---------------------------------------------------------------- bloqueos de voz (en el servidor)

  app.get("/api/presencia/corros/bloqueos", { preHandler: requiereSesion }, async (req, rep) => {
    const b = await base(rep); if (!b) return rep;
    sinCache(rep);
    return { bloqueos: (await bloqueados(bd, req.session.hogarId!)).map(x => ({ prefijo: prefijoHogar(b.lk, x.hogar), alias: aliasPublico(b.lk, { id: x.hogar, alias: x.alias, rol: x.rol }), desde: x.desde })) };
  });

  app.post<{ Body: { identidad: string } }>("/api/presencia/corros/bloqueos", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["identidad"], properties: { identidad: IDENTIDAD } } },
  }, async (req, rep) => {
    const b = await base(rep); if (!b) return rep;
    const h = req.session.hogarId!, x = await hogarDe(b.lk, req.body.identidad);
    if (x === null || x === h) return rep.code(404).send({ error: "no_existe", mensaje: "No se encuentra a esa persona." });
    if (await bloquea(bd, h, x)) await audita(bd, h, "corro.bloqueo", { hogar: h, bloqueado: x });
    // si estaban juntos, sale QUIEN bloquea (al otro no se le dice nada: solo verá que ya no está)
    const c = b.corros.corroDe(h);
    if (c !== null && c === b.corros.corroDe(x)) await b.corros.sale(h, "bloqueo");
    return rep.code(201).send({ prefijo: prefijoHogar(b.lk, x) });
  });

  app.delete<{ Params: { prefijo: string } }>("/api/presencia/corros/bloqueos/:prefijo", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: { params: { type: "object", additionalProperties: false, required: ["prefijo"], properties: { prefijo: PREFIJO } } },
  }, async (req, rep) => {
    const b = await base(rep); if (!b) return rep;
    const h = req.session.hogarId!, x = (await bloqueados(bd, h)).find(y => prefijoHogar(b.lk, y.hogar) === req.params.prefijo);
    if (x && await desbloquea(bd, h, x.hogar)) await audita(bd, h, "corro.desbloqueo", { hogar: h, bloqueado: x.hogar });
    return rep.code(204).send();
  });

  // ---------------------------------------------------------------- avisar a la oficina (sin audio)

  app.post<{ Body: { identidad: string; motivo: MotivoAviso; texto?: string } }>("/api/presencia/corros/avisos", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 10, timeWindow: 3600_000 } },
    schema: {
      body: {
        type: "object", additionalProperties: false, required: ["identidad", "motivo"],
        properties: { identidad: IDENTIDAD, motivo: { type: "string", enum: [...MOTIVOS_AVISO] }, texto: { type: "string", minLength: 1, maxLength: TEXTO_AVISO_MAX, pattern: "^[^\\u0000-\\u0008\\u000b-\\u001f\\u007f]*$" } },
      },
    },
  }, async (req, rep) => {
    const b = await base(rep); if (!b) return rep;
    const h = req.session.hogarId!, x = await hogarDe(b.lk, req.body.identidad);
    if (x === null || x === h) return rep.code(404).send({ error: "no_existe", mensaje: "No se encuentra a esa persona." });
    const texto = req.body.texto?.normalize("NFC").trim().slice(0, TEXTO_AVISO_MAX) || null;
    const cH = b.corros.corroDe(h), corro = cH !== null && cH === b.corros.corroDe(x) ? cH : null;
    const r = await guardaAviso(bd, { avisa: h, avisado: x, corro, motivo: req.body.motivo, texto });
    await audita(bd, h, "corro.aviso", { aviso: r.id, hogar: h, avisado: x, motivo: req.body.motivo, ...(corro ? { corro } : {}) });
    await b.corros.sale(h, "aviso");   // quien avisa sale del corro al momento
    if (r.suspender) {
      // Mo1 (provisional): avisos de AVISOS_SUSPENDEN hogares distintos en 7 días → suspensión automática hasta que la oficina la revise (no es definitiva)
      await suspende(bd, x, null, true, null);
      await audita(bd, null, "corro.suspendido", { hogar: x, automatica: true, avisos: AVISOS_SUSPENDEN });
      await b.corros.sacaHogar(x, "suspension", null);
    }
    return rep.code(201).send({ id: r.id });
  });

  // ---------------------------------------------------------------- la oficina

  app.get("/api/admin/voz/cercania", { preHandler: OFICINA }, async (_req, rep) => {
    sinCache(rep);
    const [i, n, s] = await Promise.all([
      interruptor(bd),
      bd.query<{ n: number }>("SELECT count(*)::int AS n FROM voz_avisos WHERE estado = 'nuevo'"),
      bd.query<{ hogar_id: string | number; alias: string | null; rol: string; desde: Date; hasta: Date | null; automatica: boolean }>(
        `SELECT s.hogar_id, g.alias, g.rol, s.desde, s.hasta, s.automatica FROM voz_cercania_suspensiones s JOIN hogares g ON g.id = s.hogar_id
          WHERE s.hasta IS NULL OR s.hasta > now() ORDER BY s.desde DESC`),
    ]);
    return {
      permitida: d.permitida, presencia: !!lk, interruptor: i, ...(corros ? corros.cuenta() : { corros: 0, hogares: 0 }), avisos_nuevos: n.rows[0]?.n ?? 0,
      suspensiones: s.rows.map(f => ({ hogar_id: Number(f.hogar_id), alias: f.alias, desde: f.desde, hasta: f.hasta, automatica: f.automatica })),
    };
  });

  app.put<{ Body: { activa: boolean } }>("/api/admin/voz/cercania", {
    preHandler: OFICINA,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["activa"], properties: { activa: { type: "boolean" } } } },
  }, async (req, rep) => {
    sinCache(rep);
    if (req.body.activa && !d.permitida) return rep.code(409).send({ error: "no_permitida", mensaje: "Este servidor tiene la voz por cercanía apagada (GEMELO_VOZ_CERCANIA=no)." });
    const yo = req.session.hogarId!;
    const cambio = await poneInterruptor(bd, req.body.activa, yo);
    let deshechos = 0;
    if (!req.body.activa && corros) deshechos = await corros.apagaTodo(yo);   // apagarla deshace todos los corros (DeleteRoom), aunque ya estuviera apagada
    if (cambio || deshechos) await audita(bd, yo, "corro.interruptor", { activa: req.body.activa, corros: deshechos });
    return { interruptor: await interruptor(bd), deshechos };
  });

  app.get<{ Querystring: { estado?: (typeof ESTADOS_AVISO)[number]; limite?: number } }>("/api/admin/voz/avisos", {
    preHandler: OFICINA,
    schema: { querystring: { type: "object", additionalProperties: false, properties: { estado: { type: "string", enum: [...ESTADOS_AVISO] }, limite: { type: "integer", minimum: 1, maximum: 500 } } } },
  }, async (req, rep) => {
    sinCache(rep);
    const r = await bd.query(
      `SELECT v.id, v.motivo, v.texto, v.estado, v.corro, v.creado_en, v.decidido_en, v.avisa_id, ga.alias AS avisa_alias, v.avisado_id, gb.alias AS avisado_alias,
              (SELECT count(DISTINCT w.avisa_id)::int FROM voz_avisos w WHERE w.avisado_id = v.avisado_id AND w.creado_en > now() - interval '7 days') AS hogares_7d,
              EXISTS (SELECT 1 FROM voz_cercania_suspensiones s WHERE s.hogar_id = v.avisado_id AND (s.hasta IS NULL OR s.hasta > now())) AS suspendido
         FROM voz_avisos v LEFT JOIN hogares ga ON ga.id = v.avisa_id LEFT JOIN hogares gb ON gb.id = v.avisado_id
        WHERE ($1::text IS NULL OR v.estado = $1) ORDER BY v.id DESC LIMIT $2`, [req.query.estado ?? null, req.query.limite ?? 100]);
    // el texto del aviso es un DATO (la oficina lo pinta con textContent) y una queja, no una prueba de lo dicho (EIPD-VOZ §13.3)
    return {
      avisos: r.rows.map(f => ({
        id: Number(f.id), motivo: f.motivo, texto: f.texto, estado: f.estado, corro: f.corro, creado_en: f.creado_en, decidido_en: f.decidido_en,
        avisa: f.avisa_id === null ? null : { hogar_id: Number(f.avisa_id), alias: f.avisa_alias },
        avisado: f.avisado_id === null ? null : { hogar_id: Number(f.avisado_id), alias: f.avisado_alias, hogares_7d: f.hogares_7d, suspendido: f.suspendido },
      })),
    };
  });

  app.post<{ Params: { id: number }; Body: { estado: "visto" | "resuelto" | "descartado" } }>("/api/admin/voz/avisos/:id/estado", {
    preHandler: OFICINA,
    schema: { params: ID, body: { type: "object", additionalProperties: false, required: ["estado"], properties: { estado: { type: "string", enum: ["visto", "resuelto", "descartado"] } } } },
  }, async (req, rep) => {
    const yo = req.session.hogarId!, e = req.body.estado;
    const r = await bd.query(
      `UPDATE voz_avisos SET estado = $2, decidido_en = CASE WHEN $2 = 'visto' THEN decidido_en ELSE now() END, decidido_por = CASE WHEN $2 = 'visto' THEN decidido_por ELSE $3 END
        WHERE id = $1 RETURNING id`, [req.params.id, e, yo]);
    if (!r.rowCount) return rep.code(404).send({ error: "no_existe" });
    await audita(bd, yo, "corro.aviso_estado", { aviso: req.params.id, estado: e });
    return rep.code(204).send();
  });

  app.post<{ Body: { hogar_id: number; dias: number | null } }>("/api/admin/voz/suspensiones", {
    preHandler: OFICINA,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { body: { type: "object", additionalProperties: false, required: ["hogar_id", "dias"], properties: { hogar_id: { type: "integer", minimum: 1, maximum: 2147483647 }, dias: { enum: [...DIAS_SUSPENSION, null] } } } },
  }, async (req, rep) => {
    const yo = req.session.hogarId!, h = req.body.hogar_id;
    if (!(await bd.query("SELECT 1 FROM hogares WHERE id = $1", [h])).rowCount) return rep.code(404).send({ error: "no_existe", mensaje: "Esa familia no existe." });
    await suspende(bd, h, req.body.dias, false, yo);
    // sigue pudiendo pasear y escribir: solo pierde la voz por cercanía (sale de su corro y no recibe invitaciones ni token)
    await corros?.sacaHogar(h, "suspension", yo);
    await audita(bd, yo, "corro.suspendido", { hogar: h, automatica: false, ...(req.body.dias === null ? { indefinida: true } : { dias: req.body.dias }) });
    return { suspension: await suspension(bd, h) };
  });

  app.delete<{ Params: { id: number } }>("/api/admin/voz/suspensiones/:id", { preHandler: OFICINA, schema: { params: ID } }, async (req, rep) => {
    const yo = req.session.hogarId!;
    if (await levantaSuspension(bd, req.params.id)) await audita(bd, yo, "corro.suspension_levantada", { hogar: req.params.id });
    return rep.code(204).send();
  });
}


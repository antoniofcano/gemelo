// F3c: las rutas de la voz de las visitas guiadas (ADR-0026; contratos: api.openapi.yaml, livekit-roles.json v6, presencia.md). Lógica en voz.ts.
// Todas con sesión; el Origin lo comprueba app.ts en todo POST, PUT y DELETE. Ningún token de cliente lleva roomAdmin: lo que modera lo hace ESTA api con
// su clave de servidor (RoomService) y queda en la auditoría (decisión 42, ADR-0024). Nada se graba (sin Egress) y la api no recibe audio.
//  Cualquiera con sesión (lo que puede cada uno lo decide decideGuiada con la base):
//   POST   /api/presencia/guiadas/:evento/token          { dispositivo }   el token de `guiada-<evento>`: guía y oficina con micrófono; familias apuntadas sin él
//  Una familia apuntada, desde su conexión a la sala:
//   POST   /api/presencia/guiadas/:evento/mano           {}                levantar la mano (cola del servidor, en orden de llegada)
//   DELETE /api/presencia/guiadas/:evento/mano                             bajarla
//  El guía del evento (visitas.guia_id) o la oficina (rol oficina o admin, aparato aprobado):
//   GET    /api/presencia/guiadas/:evento/palabra                          quién tiene la palabra (y hasta cuándo) y las manos, en orden
//   POST   /api/presencia/guiadas/:evento/palabra        { identidad }     dar la palabra a esa conexión de una familia apuntada, 2 min (una sola familia a la vez)
//   POST   /api/presencia/guiadas/:evento/palabra/alargar {}               +1 min
//   DELETE /api/presencia/guiadas/:evento/palabra                          quitarla (cortar)
//   POST   /api/presencia/guiadas/:evento/silenciar      {}                silenciar a todos menos al guía (MutePublishedTrack) y quitar la palabra
//   POST   /api/presencia/guiadas/:evento/expulsar       { identidad, motivo? }  sacar de la sala a todas las conexiones de ese hogar (RemoveParticipant), 15 min
//   POST   /api/presencia/guiadas/:evento/cerrar         { segundos? }     F3f (decisión 155): aviso por el tema «cierre» y, a los segundos (15 por omisión), DeleteRoom
//  La oficina:
//   PUT    /api/admin/eventos/:id/guia                   { hogar_id | null }  el guía del evento (una cuenta activa de rol guia, oficina o admin)
// Por qué /api/presencia/guiadas y no /api/admin/directos (OFICINA §8 lo esbozaba así): el guía no es la oficina, y las rutas /api/admin/* son solo suyas.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { audita, esOficina } from "../auth/servicio.ts";
import { requiereSesion } from "../auth/roles.ts";
import type { Bd } from "../bd/pool.ts";
import type { ConfigLiveKit } from "../config.ts";
import { OFICINA } from "../oficina/acceso.ts";
import { AVATAR_POR_DEFECTO, type Avatar, DISPOSITIVOS, type Dispositivo, Expulsados, firmaTokenGuiada, identidadOpaca, limpiaAspecto, type ModeradorVoz, prefijoHogar, SALA_GUIADA } from "./livekit.ts";
import { AVISO_CIERRE_MAX_S, AVISO_CIERRE_MIN_S, AVISO_CIERRE_S, type Auditor, Cierres, cuerpoCierre, decideGuiada, esGuiada, type EventoGuiada, Palabra, puedeModerar, type Rechazo, type Reloj, RELOJ_REAL, TEMA_CIERRE, ventana } from "./voz.ts";

const APAGADA = { error: "presencia_apagada", mensaje: "La visita compartida no está disponible en este servidor." } as const;
const EVENTO = { type: "object", additionalProperties: false, required: ["evento"], properties: { evento: { type: "integer", minimum: 1, maximum: 2147483647 } } } as const;
const ID = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer", minimum: 1, maximum: 2147483647 } } } as const;
/** El formato de identidad del contrato (livekit-roles.json, «identidad.formato») */
const IDENTIDAD = { type: "string", pattern: "^h_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$" } as const;
const VACIO = { type: "object", additionalProperties: false, properties: {} } as const;
/** Lo que se le dice a quien no puede moderar ese evento */
const SIN_PERMISO = { error: "sin_permiso", mensaje: "Solo el guía de esta visita o la oficina pueden hacer esto." } as const;
const MENSAJES: Record<string, string> = {
  palabra_ocupada: "Otra familia tiene la palabra: quítasela antes de dársela a otra.",
  ya_tiene_la_palabra: "Esa familia ya tiene la palabra.",
  no_esta_en_la_sala: "Esa conexión ya no está en la sala.",
  no_estas_en_la_sala: "Entra en la sala de la visita para levantar la mano.",
  nadie_tiene_la_palabra: "Ahora no tiene nadie la palabra.",
  tope_de_alargues: "Este turno ya no se puede alargar más.",
  ya_tienes_la_palabra: "Ya tienes la palabra.",
  demasiadas_manos: "Hay demasiadas manos levantadas; espera un poco.",
  no_es_familia_apuntada: "Esa conexión no es de una familia apuntada a esta visita.",
  ya_cerrandose: "La sala ya se está cerrando.",
};
const falla = (rep: FastifyReply, http: number, codigo: string) => rep.code(http).send({ error: codigo, mensaje: MENSAJES[codigo] ?? codigo });

export interface DepsVoz { lk: ConfigLiveKit | null; voz: ModeradorVoz | null; expulsados: Expulsados; reloj?: Reloj }

/** Expulsados de una sala guiada por el guía o la oficina: 15 min sin token de ESA sala (en memoria, como Expulsados). */
export class ExpulsadosGuiada {
  private readonly porEvento = new Map<number, Expulsados>();
  marca(evento: number, hogar: number, ahora = Date.now()): void {
    let e = this.porEvento.get(evento);
    if (!e) { e = new Expulsados(); this.porEvento.set(evento, e); }
    e.marca(hogar, ahora);
  }
  esta(evento: number, hogar: number, ahora = Date.now()): boolean { return this.porEvento.get(evento)?.esta(hogar, ahora) ?? false; }
}

async function cargaEvento(bd: Pick<Bd, "query">, id: number): Promise<EventoGuiada | null> {
  const f = (await bd.query<EventoGuiada & { guia_id: string | number | null }>("SELECT tipo, estado, empieza_en, termina_en, guia_id FROM visitas WHERE id = $1", [id])).rows[0];
  return f ? { ...f, guia_id: f.guia_id === null ? null : Number(f.guia_id) } : null;
}
/** Los hogares APUNTADOS (no en espera, ni anulados) y activos de un evento */
async function apuntados(bd: Pick<Bd, "query">, evento: number): Promise<number[]> {
  return (await bd.query<{ hogar_id: string | number }>(
    `SELECT a.hogar_id FROM visitas_asistentes a JOIN hogares g ON g.id = a.hogar_id AND g.activo
      WHERE a.visita_id = $1 AND a.estado = 'apuntado'`, [evento])).rows.map(f => Number(f.hogar_id));
}
/** ¿De qué hogar apuntado (que no sea el guía) es esa identidad? El prefijo opaco del hogar se recalcula con el secreto (livekit.ts). */
export function hogarDeIdentidad(lk: Pick<ConfigLiveKit, "secreto">, identidad: string, candidatos: number[]): number | null {
  const p = identidad.slice(0, 24);
  return candidatos.find(h => prefijoHogar(lk, h) === p) ?? null;
}

export async function rutasVoz(app: FastifyInstance, bd: Bd, d: DepsVoz): Promise<Palabra | null> {
  const { lk, voz } = d;
  const auditor: Auditor = (actor, accion, detalle) => audita(bd, actor, accion, detalle);
  const palabra = voz ? new Palabra(voz, auditor, d.reloj ?? RELOJ_REAL, app.log) : null;
  const expulsadosGuiada = new ExpulsadosGuiada();
  const reloj = d.reloj ?? RELOJ_REAL, cierres = new Cierres(), borrados = new Map<number, unknown>();
  app.addHook("onClose", async () => { palabra?.cierra(); for (const h of borrados.values()) reloj.cancela(h); borrados.clear(); });

  const quien = async (req: FastifyRequest, evento: number) => {
    const hogarId = req.session.hogarId!, ofi = esOficina(req.session.rol);
    const apuntado = ofi ? false : (await apuntados(bd, evento)).includes(hogarId);
    return { hogarId, esOficina: ofi, apuntado };
  };
  /** Para las rutas de quien modera: el evento (guiada o directo) y que quien pide sea su guía o la oficina. null si ya respondió. */
  const moderable = async (req: FastifyRequest, rep: FastifyReply, evento: number): Promise<EventoGuiada | null> => {
    const e = await cargaEvento(bd, evento);
    if (!esGuiada(e)) { await rep.code(404).send({ error: "guiada_no_existe", mensaje: "Esa visita guiada no existe." }); return null; }
    if (!puedeModerar(e, { hogarId: req.session.hogarId!, esOficina: esOficina(req.session.rol) })) { await rep.code(403).send(SIN_PERMISO); return null; }
    return e;
  };
  const rechaza = (rep: FastifyReply, r: Rechazo) => rep.code(r.http).send({ error: r.codigo, mensaje: r.mensaje, ...(r.abre_en ? { abre_en: r.abre_en } : {}) });

  // ---- el token de la sala guiada
  app.post<{ Params: { evento: number }; Body: { dispositivo: Dispositivo } }>("/api/presencia/guiadas/:evento/token", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    schema: { params: EVENTO, body: { type: "object", additionalProperties: false, required: ["dispositivo"], properties: { dispositivo: { type: "string", enum: [...DISPOSITIVOS] } } } },
  }, async (req, rep) => {
    if (!lk) return rep.code(503).send(APAGADA);
    const id = req.session.hogarId!, ev = req.params.evento;
    if (d.expulsados.esta(id) || expulsadosGuiada.esta(ev, id)) return rep.code(403).send({ error: "expulsado", mensaje: "Te han sacado de esta visita. Podrás volver a entrar más tarde." });
    const dec = decideGuiada(await cargaEvento(bd, ev), await quien(req, ev));
    if (!dec.ok) return rechaza(rep, dec);
    // F3f: cerrada por el guía o la oficina (decisión 155): las familias ya no entran; el guía y la oficina sí
    if (dec.papel === "familia" && cierres.cerrada(ev, reloj.ahora()) !== null) return rep.code(409).send({ error: "guiada_cerrada", mensaje: "La visita guiada ha terminado: el guía ha cerrado la sala." });
    const r = await bd.query<{ alias: string | null; camisa: number | null; sombrero: Avatar["sombrero"] | null; piel: number | null; vrm: string | null; aspecto: unknown }>(
      "SELECT g.alias, a.camisa, a.sombrero, a.piel, a.vrm, a.aspecto FROM hogares g LEFT JOIN avatares a ON a.hogar_id = g.id WHERE g.id = $1", [id]);
    const f = r.rows[0];
    if (!f) return rep.code(401).send({ error: "sin_sesion", mensaje: "Hace falta entrar con tu enlace." });
    const alias = f.alias ?? "Visitante " + prefijoHogar(lk, id).slice(2, 6);
    const avatar: Avatar = f.camisa === null || f.sombrero === null || f.piel === null ? AVATAR_POR_DEFECTO : { camisa: f.camisa, sombrero: f.sombrero, piel: f.piel, ...(f.vrm ? { vrm: f.vrm } : {}), ...limpiaAspecto(f.aspecto) };
    const t = await firmaTokenGuiada(lk, id, req.session.sessionId, { alias, avatar, rol: req.session.rol!, dispositivo: req.body.dispositivo }, ev, dec.papel);
    return { ...t, papel: dec.papel };
  });

  // ---- levantar y bajar la mano (una familia apuntada, desde la conexión de esta sesión)
  const deFamilia = async (req: FastifyRequest<{ Params: { evento: number } }>, rep: FastifyReply): Promise<{ identidad: string; hogar: number } | null> => {
    if (!lk || !palabra) { await rep.code(503).send(APAGADA); return null; }
    const dec = decideGuiada(await cargaEvento(bd, req.params.evento), await quien(req, req.params.evento));
    if (!dec.ok) { await rechaza(rep, dec); return null; }
    if (dec.papel !== "familia") { await rep.code(409).send({ error: "no_eres_familia", mensaje: "El guía y la oficina no levantan la mano: ya tienen micrófono." }); return null; }
    return { identidad: identidadOpaca(lk, req.session.hogarId!, req.session.sessionId), hogar: req.session.hogarId! };
  };
  app.post<{ Params: { evento: number }; Body: Record<string, never> }>("/api/presencia/guiadas/:evento/mano", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
    schema: { params: EVENTO, body: VACIO },
  }, async (req, rep) => {
    const f = await deFamilia(req, rep);
    if (!f) return rep;
    const r = await palabra!.levanta(req.params.evento, f.identidad, f.hogar);
    if (!r.ok) return falla(rep, 409, r.codigo);
    return { puesto: r.puesto };
  });
  app.delete<{ Params: { evento: number } }>("/api/presencia/guiadas/:evento/mano", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
    schema: { params: EVENTO },
  }, async (req, rep) => {
    const f = await deFamilia(req, rep);
    if (!f) return rep;
    await palabra!.baja(req.params.evento, f.identidad, f.hogar);
    return rep.code(204).send();
  });

  // ---- la palabra (el guía del evento o la oficina)
  app.get<{ Params: { evento: number } }>("/api/presencia/guiadas/:evento/palabra", {
    preHandler: requiereSesion,
    schema: { params: EVENTO },
  }, async (req, rep) => {
    if (!lk || !voz || !palabra) return rep.code(503).send(APAGADA);
    const e = await moderable(req, rep, req.params.evento);
    if (!e) return rep;
    rep.header("cache-control", "no-store");
    const ev = req.params.evento, sala = SALA_GUIADA(ev);
    // F3f, preparar la visita: cuántas familias apuntadas hay y cuántas están ya en la sala (hogares con al menos una conexión). Solo números: los alias
    // de quien está dentro los tiene el panel por la sala; de las que no han entrado no se dice nada más
    const hogares = (await apuntados(bd, ev)).filter(h => h !== e.guia_id), dentro = (await voz.presentes(sala)).map(p => p.identidad);
    const conectados = hogares.filter(h => { const pr = prefijoHogar(lk, h); return dentro.some(i => i.startsWith(pr + "_")); }).length;
    const en = cierres.cerrandose(ev, reloj.ahora());
    return { evento: ev, sala, ...palabra.vista(ev), inscritos: { apuntados: hogares.length, conectados }, cierra_en: en === null ? null : new Date(en).toISOString() };
  });

  app.post<{ Params: { evento: number }; Body: { identidad: string } }>("/api/presencia/guiadas/:evento/palabra", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    schema: { params: EVENTO, body: { type: "object", additionalProperties: false, required: ["identidad"], properties: { identidad: IDENTIDAD } } },
  }, async (req, rep) => {
    if (!lk || !palabra) return rep.code(503).send(APAGADA);
    const e = await moderable(req, rep, req.params.evento);
    if (!e) return rep;
    if (e.estado === "cancelada" || e.estado === "borrador") return rep.code(409).send({ error: "guiada_no_vigente", mensaje: "Esa visita está cancelada o aún sin abrir." });
    // solo a una familia APUNTADA (no al guía: ese ya habla)
    const hogar = hogarDeIdentidad(lk, req.body.identidad, (await apuntados(bd, req.params.evento)).filter(h => h !== e.guia_id));
    if (hogar === null) return falla(rep, 409, "no_es_familia_apuntada");
    const r = await palabra.da(req.params.evento, req.body.identidad, hogar, req.session.hogarId!);
    if (!r.ok) return falla(rep, 409, r.codigo);
    return { identidad: req.body.identidad, hasta: r.hasta };
  });

  app.post<{ Params: { evento: number }; Body: Record<string, never> }>("/api/presencia/guiadas/:evento/palabra/alargar", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    schema: { params: EVENTO, body: VACIO },
  }, async (req, rep) => {
    if (!palabra) return rep.code(503).send(APAGADA);
    if (!(await moderable(req, rep, req.params.evento))) return rep;
    const r = await palabra.alarga(req.params.evento, req.session.hogarId!);
    if (!r.ok) return falla(rep, 409, r.codigo);
    return { hasta: r.hasta };
  });

  app.delete<{ Params: { evento: number } }>("/api/presencia/guiadas/:evento/palabra", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    schema: { params: EVENTO },
  }, async (req, rep) => {
    if (!palabra) return rep.code(503).send(APAGADA);
    if (!(await moderable(req, rep, req.params.evento))) return rep;
    const r = await palabra.quita(req.params.evento, req.session.hogarId!, "cortada");
    if (!r.ok) return falla(rep, 409, r.codigo);
    return rep.code(204).send();
  });

  // ---- silenciar a todos menos al guía (y a quien lo pide), y expulsar
  app.post<{ Params: { evento: number }; Body: Record<string, never> }>("/api/presencia/guiadas/:evento/silenciar", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: { params: EVENTO, body: VACIO },
  }, async (req, rep) => {
    if (!lk || !voz || !palabra) return rep.code(503).send(APAGADA);
    if (!(await moderable(req, rep, req.params.evento))) return rep;
    const ev = req.params.evento, sala = SALA_GUIADA(ev), yo = identidadOpaca(lk, req.session.hogarId!, req.session.sessionId);
    const habia = (await palabra.quita(ev, req.session.hogarId!, "silencio")).ok;
    // MutePublishedTrack a todo micrófono que no sea del guía ni de quien lo pide (la oficina que modera sigue hablando); nadie puede quitar ese silencio desde fuera
    const otros = (await voz.presentes(sala)).filter(p => p.papel !== "guia" && p.identidad !== yo && p.pistasMicro.length).map(p => p.identidad);
    const pistas = otros.length ? await voz.silencia(sala, otros) : 0;
    await audita(bd, req.session.hogarId!, "guiada.silenciados", { evento: ev, pistas, palabra_quitada: habia });
    return { pistas, palabra_quitada: habia };
  });

  app.post<{ Params: { evento: number }; Body: { identidad: string; motivo?: string } }>("/api/presencia/guiadas/:evento/expulsar", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    schema: { params: EVENTO, body: { type: "object", additionalProperties: false, required: ["identidad"], properties: { identidad: IDENTIDAD, motivo: { type: "string", minLength: 1, maxLength: 200 } } } },
  }, async (req, rep) => {
    if (!lk || !voz || !palabra) return rep.code(503).send(APAGADA);
    const e = await moderable(req, rep, req.params.evento);
    if (!e) return rep;
    const ev = req.params.evento;
    // solo familias apuntadas (al guía y a la oficina no los saca un guía; la oficina tiene POST /api/admin/presencia/expulsar)
    const hogar = hogarDeIdentidad(lk, req.body.identidad, (await apuntados(bd, ev)).filter(h => h !== e.guia_id));
    if (hogar === null) return falla(rep, 409, "no_es_familia_apuntada");
    expulsadosGuiada.marca(ev, hogar);
    await palabra.olvidaHogar(ev, hogar, req.session.hogarId!);
    const conexiones = await voz.expulsaHogar(SALA_GUIADA(ev), prefijoHogar(lk, hogar));
    const motivo = req.body.motivo?.trim().replace(/\s+/g, " ") || null;
    await audita(bd, req.session.hogarId!, "guiada.expulsado", { evento: ev, hogar, conexiones, ...(motivo ? { motivo } : {}) });
    return { conexiones };
  });

  // ---- cerrar la sala (F3f, decisión 155): aviso a todos por el tema «cierre» (sin participante: solo lo manda la api) con el instante del borrado y la sala a la
  // que se vuelve («general»); se quita la palabra y se bajan las manos; a los `segundos`, DeleteRoom (LiveKit saca a quien siga dentro). Las familias no
  // vuelven a recibir token de esa sala hasta que acabe la ventana del evento (Cierres, en memoria). Sin desmute remoto ni Egress: nada de eso cambia aquí
  app.post<{ Params: { evento: number }; Body: { segundos?: number } }>("/api/presencia/guiadas/:evento/cerrar", {
    preHandler: requiereSesion,
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
    schema: { params: EVENTO, body: { type: "object", additionalProperties: false, properties: { segundos: { type: "integer", minimum: AVISO_CIERRE_MIN_S, maximum: AVISO_CIERRE_MAX_S } } } },
  }, async (req, rep) => {
    if (!lk || !voz || !palabra) return rep.code(503).send(APAGADA);
    const e = await moderable(req, rep, req.params.evento);
    if (!e) return rep;
    const ev = req.params.evento, sala = SALA_GUIADA(ev), ahora = reloj.ahora();
    const ya = cierres.cerrandose(ev, ahora);
    if (ya !== null) return rep.code(409).send({ error: "ya_cerrandose", mensaje: MENSAJES.ya_cerrandose, cierra_en: new Date(ya).toISOString() });
    const segundos = req.body?.segundos ?? AVISO_CIERRE_S, en = ahora + segundos * 1000;
    // primero se marca (ninguna familia entra mientras se avisa) y se quita la palabra; luego el aviso (si no hay nadie, LiveKit dice que no existe: se borra igual)
    cierres.marca(ev, en, ventana(e, "familia").cierra);
    const palabraQuitada = await palabra.cierraSala(ev, req.session.hogarId!);
    const avisados = await voz.envia(sala, TEMA_CIERRE, cuerpoCierre(en));
    const previo = borrados.get(ev); if (previo !== undefined) reloj.cancela(previo);
    borrados.set(ev, reloj.programa(segundos * 1000, () => {
      borrados.delete(ev);
      palabra.olvidaSala(ev);
      voz.borraSala(sala).catch(err => app.log.warn({ err: (err as Error).message, evento: ev }, "voz: no se pudo borrar la sala guiada al cerrarla"));
    }));
    await audita(bd, req.session.hogarId!, "guiada.cerrada", { evento: ev, segundos, palabra_quitada: palabraQuitada, avisados });
    return { cierra_en: new Date(en).toISOString(), segundos, avisados };
  });

  // ---- el guía del evento (la oficina)
  app.put<{ Params: { id: number }; Body: { hogar_id: number | null } }>("/api/admin/eventos/:id/guia", {
    preHandler: OFICINA,
    config: { rateLimit: { max: 60, timeWindow: 60_000 } },
    schema: { params: ID, body: { type: "object", additionalProperties: false, required: ["hogar_id"], properties: { hogar_id: { type: ["integer", "null"], minimum: 1, maximum: 2147483647 } } } },
  }, async (req, rep) => {
    const e = await cargaEvento(bd, req.params.id);
    if (!e) return rep.code(404).send({ error: "no_existe" });
    if (e.estado === "cancelada") return rep.code(409).send({ error: "cancelado", mensaje: "El evento está cancelado: no se puede editar." });
    const g = req.body.hogar_id;
    if (g !== null) {
      const f = (await bd.query<{ rol: string }>("SELECT rol FROM hogares WHERE id = $1 AND activo", [g])).rows[0];
      if (!f) return rep.code(404).send({ error: "guia_no_existe", mensaje: "Esa cuenta no existe o está de baja." });
      if (!["guia", "oficina", "admin"].includes(f.rol)) return rep.code(409).send({ error: "no_es_guia", mensaje: "Solo una cuenta de guía o de la oficina puede guiar una visita." });
    }
    await bd.query("UPDATE visitas SET guia_id = $2, actualizada_en = now() WHERE id = $1", [req.params.id, g]);
    await audita(bd, req.session.hogarId!, "admin.evento_guia", { evento: req.params.id, ...(g !== null ? { guia: g } : { sin_guia: true }) });
    return { guia_id: g };
  });

  return palabra;
}

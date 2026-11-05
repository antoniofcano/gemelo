// Todo lo que se guarda de un hogar, en un objeto (derecho de acceso y portabilidad, RGPD). Lo usa la exportación de la oficina
// (GET /api/admin/hogares/:id/exportar) y GET /api/yo/datos (src/yo/rutas.ts): una sola lista, para que no se separen (la copia que
// hubo en yo/rutas.ts se separó al añadir los juegos). Una prueba de integración (familias.test.ts) compara las claves de las dos.
import type { Bd } from "../bd/pool.ts";

export async function datosDelHogar(bd: Bd, id: number): Promise<Record<string, unknown> | null> {
  const [h, av, hz, pr, vi, se, cv] = await Promise.all([
    bd.query("SELECT correo, rol, alias, alias_visible, normas_version, normas_aceptadas_en, avisos_correo, creado_en FROM hogares WHERE id = $1", [id]),
    bd.query("SELECT camisa, sombrero, piel, vrm, aspecto, actualizado_en FROM avatares WHERE hogar_id = $1", [id]),
    bd.query("SELECT codigo, nombre FROM hazas WHERE hogar_id = $1 ORDER BY codigo", [id]),
    bd.query("SELECT texto, creada_en, respuesta, respondida_en FROM preguntas WHERE hogar_id = $1 ORDER BY creada_en", [id]),
    bd.query("SELECT v.titulo, v.empieza_en, a.personas, a.estado FROM visitas_asistentes a JOIN visitas v ON v.id = a.visita_id WHERE a.hogar_id = $1 ORDER BY v.empieza_en", [id]),
    bd.query("SELECT creada_en, ultima_actividad_en, expira_en, revocada_en FROM sesiones WHERE hogar_id = $1 ORDER BY creada_en", [id]),
    bd.query("SELECT creado_en, aprobado_en, usado_en FROM codigos_vinculo WHERE hogar_id = $1 ORDER BY creado_en", [id]),
  ]);
  if (!h.rows[0]) return null;
  const [pe, me, de, su, avi, lo, ll] = await Promise.all([
    bd.query(`SELECT o.finca, o.copas_id, p.nombre, p.decoracion, p.objeto_tipo, p.estado, p.creada_en, p.actualizada_en, p.retirada_en, p.motivo_retirada
                FROM personalizaciones p JOIN olivos o ON o.id = p.olivo_id WHERE p.hogar_id = $1 ORDER BY p.id`, [id]),
    bd.query("SELECT '/api/medios/' || clave AS url, bytes, ancho, alto, aviso_version, aviso_aceptado_en, creado_en FROM medios WHERE hogar_id = $1 ORDER BY id", [id]),
    bd.query("SELECT motivo, texto, creada_en, resolucion FROM denuncias WHERE hogar_id = $1 ORDER BY id", [id]),
    bd.query("SELECT texto, estado, creada_en FROM bandeja WHERE hogar_id = $1 AND tipo = 'sugerencia' ORDER BY id", [id]),
    bd.query("SELECT a.titulo, a.texto, a.creado_en, ah.leido_en FROM avisos_hogar ah JOIN avisos a ON a.id = ah.aviso_id WHERE ah.hogar_id = $1 ORDER BY a.id", [id]),
    bd.query("SELECT l.codigo, l.campana FROM lote_hogar lh JOIN lotes l ON l.id = lh.lote_id WHERE lh.hogar_id = $1 ORDER BY l.codigo", [id]),
    // las llaves de acceso (0013/0021, OF13b-4): nombre, fechas y banderas; nunca el id de credencial, la clave pública ni el contador (son material criptográfico, no un dato de la persona)
    bd.query("SELECT nombre, creada_en, ultima_vez_en, revocada_en, respaldada AS sincronizada, descubrible FROM llaves_acceso WHERE hogar_id = $1 ORDER BY id", [id]),
  ]);
  // los juegos (0009): sus partidas
  const ju = await bd.query("SELECT juego, puntos, duracion_s, jugada_en FROM juegos_partidas WHERE hogar_id = $1 ORDER BY id", [id]);
  // el consentimiento de voz (0018, F3j): qué versión del aviso aceptó y cuándo (o nada)
  const vz = await bd.query("SELECT version, aceptado_en FROM voz_consentimientos WHERE hogar_id = $1 AND ambito = 'guiada'", [id]);
  // la voz por cercanía (0025, F3k-1): su consentimiento, su ajuste, a quién bloquea (alias, como lo ve en el mundo), los avisos que ha mandado y su suspensión.
  // De los avisos RECIBIDOS solo el motivo, el estado y la fecha: ni quién avisó ni su texto [SUPUESTO: lo valida la asesoría, EIPD-VOZ §13.5 punto 3]
  const [vc, va, vb, ve, vr, vs] = await Promise.all([
    bd.query("SELECT version, aceptado_en FROM voz_consentimientos WHERE hogar_id = $1 AND ambito = 'cercania'", [id]),
    bd.query("SELECT activa, cambiada_en FROM voz_cercania_ajustes WHERE hogar_id = $1", [id]),
    bd.query("SELECT g.alias, b.creado_en FROM voz_bloqueos b LEFT JOIN hogares g ON g.id = b.bloqueado_id WHERE b.hogar_id = $1 ORDER BY b.creado_en", [id]),
    bd.query("SELECT motivo, texto, estado, creado_en FROM voz_avisos WHERE avisa_id = $1 ORDER BY id", [id]),
    bd.query("SELECT motivo, estado, creado_en FROM voz_avisos WHERE avisado_id = $1 ORDER BY id", [id]),
    bd.query("SELECT desde, hasta, automatica FROM voz_cercania_suspensiones WHERE hogar_id = $1", [id]),
  ]);
  return {
    hogar: h.rows[0], avatar: av.rows[0] ?? null, hazas: hz.rows, preguntas: pr.rows, visitas: vi.rows, sesiones: se.rows, aparatos_vinculados: cv.rows,
    olivos_personalizados: pe.rows, fotos_subidas: me.rows, denuncias: de.rows, sugerencias: su.rows, avisos: avi.rows, lotes: lo.rows, llaves_de_acceso: ll.rows, partidas_de_juegos: ju.rows, voz_consentimiento: vz.rows[0] ?? null,
    voz_cercania: { consentimiento: vc.rows[0] ?? null, ajuste: va.rows[0] ?? null, bloqueos: vb.rows, avisos_mandados: ve.rows, avisos_recibidos: vr.rows, suspension: vs.rows[0] ?? null },
  };
}

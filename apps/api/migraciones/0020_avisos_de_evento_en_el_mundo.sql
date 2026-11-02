-- 0020_avisos_de_evento_en_el_mundo.sql — los avisos de un evento se ven también en el gemelo (OF11g, doc/sistema/OFICINA.md §7).
-- `avisos.evento_id` (0016) ya existe, pero hasta aquí solo lo rellenaban los avisos del sistema (inscripción, cambio, cancelación): el que la oficina
-- manda con «Avisar…» quedaba sin evento y no se podía mostrar junto a él. La api lo guarda ya desde ahora; esto rescata los de antes con la auditoría
-- (`admin.evento_avisado` guarda { evento, aviso }). La lectura por hogar es `avisos_hogar.leido_en` (0004), sin columna nueva. Sin datos de personas.
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada.

-- Up Migration

UPDATE avisos a
   SET evento_id = (au.detalle ->> 'evento')::bigint
  FROM auditoria au
 WHERE au.accion = 'admin.evento_avisado'
   AND a.evento_id IS NULL AND a.tipo = 'evento'
   AND (au.detalle ->> 'aviso') ~ '^[0-9]{1,18}$' AND (au.detalle ->> 'evento') ~ '^[0-9]{1,18}$'
   AND a.id = (au.detalle ->> 'aviso')::bigint
   AND EXISTS (SELECT 1 FROM visitas v WHERE v.id = (au.detalle ->> 'evento')::bigint);

-- los avisos de un evento, por evento (la ficha del evento en el mundo y la de la oficina)
CREATE INDEX avisos_evento ON avisos (evento_id, creado_en DESC) WHERE evento_id IS NOT NULL;

-- 0012_agenda.sql — la Agenda de la oficina (OF11, doc/sistema/OFICINA.md §7, decisión 97): eventos con aforo, inscripciones por hogar y lista
-- de espera con promoción automática. Las tablas `visitas` y `visitas_asistentes` ya existen (0001, ampliadas en la 0004); aquí solo se añade lo
-- que faltaba: dos tipos de evento (cata y directo), quién lo creó, la marca de «le tocó plaza desde la espera» y el índice de la cola.
-- La promoción de la espera la hace la api (src/agenda/rutas.ts) dentro de la misma transacción que libera la plaza, con la fila del evento
-- bloqueada (SELECT … FOR UPDATE): dos inscripciones a la vez no pasan del aforo. Sin datos de personas: el hogar. El aforo (`plazas`) cuenta PERSONAS.
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada; se añade 0013_….

-- Up Migration

-- ---------------------------------------------------------------- tipos de evento: cata y directo (OFICINA.md §7)
-- Las dos restricciones nuevas van NOT VALID: no comprueban lo que hubiera de antes (la tabla no tenía rutas), solo lo que se escriba desde ahora.
ALTER TABLE visitas DROP CONSTRAINT visitas_tipo_check;
ALTER TABLE visitas
  ADD CONSTRAINT visitas_tipo_check CHECK (tipo IN ('guiada', 'libre', 'evento', 'taller', 'recoleccion', 'cata', 'directo')),
  ADD COLUMN creada_por     bigint REFERENCES hogares (id) ON DELETE SET NULL,
  ADD COLUMN actualizada_en timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN cancelada_en   timestamptz,
  ADD CONSTRAINT visitas_cancelada_coherente CHECK ((estado = 'cancelada') = (cancelada_en IS NOT NULL)) NOT VALID,
  ADD CONSTRAINT visitas_inscripcion_antes_de_empezar CHECK (inscripcion_hasta IS NULL OR inscripcion_hasta <= empieza_en) NOT VALID;

-- ---------------------------------------------------------------- inscripciones: de la espera a la plaza
-- promovida_en: cuándo pasó de «en_espera» a «apuntado» sola (al liberarse plaza); NULL si entró directa.
-- El orden de la cola es apuntado_en (se renueva si el hogar se borra y vuelve a apuntarse: pasa al final).
ALTER TABLE visitas_asistentes ADD COLUMN promovida_en timestamptz;
CREATE INDEX visitas_asistentes_cola ON visitas_asistentes (visita_id, estado, apuntado_en);
CREATE INDEX visitas_proximas ON visitas (empieza_en) WHERE estado IN ('abierta', 'cerrada');

-- (los permisos de fila de gemelo_api de la 0004 ya cubren las columnas nuevas de tablas existentes)

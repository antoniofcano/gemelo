-- 0016_correo_avisos.sql — el correo de los avisos y el .ics de cada evento (OF11c, doc/sistema/OFICINA.md §7).
-- Hasta aquí los avisos de la Agenda y de la oficina quedaban en la campana con `avisos_hogar.correo_enviado_en` en NULL. Ahora la api los manda
-- por correo, en segundo plano, a los hogares con `hogares.avisos_correo`; para eso hace falta anotar los intentos (reintento acotado) y, en los
-- avisos que vienen de un evento, de cuál y qué invitación de calendario llevan (la api la genera al enviar, con el estado del evento de ese momento).
-- Sin datos de personas: solo contadores y marcas de tiempo. Los permisos de fila de gemelo_api de la 0004 ya cubren las columnas nuevas.
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada; se añade 0017_….

-- Up Migration

ALTER TABLE avisos_hogar
  ADD COLUMN correo_intentos        smallint NOT NULL DEFAULT 0 CHECK (correo_intentos >= 0),
  ADD COLUMN correo_ultimo_intento  timestamptz,
  ADD COLUMN correo_desistido_en    timestamptz;

-- los pendientes de mandar, que es lo único que recorre el repartidor
CREATE INDEX avisos_hogar_correo_pendiente ON avisos_hogar (aviso_id) WHERE correo_enviado_en IS NULL AND correo_desistido_en IS NULL;

-- de qué evento viene un aviso y qué .ics lleva: inscripción (o promoción desde la espera), cambio de fecha o lugar, cancelación
ALTER TABLE avisos
  ADD COLUMN evento_id bigint REFERENCES visitas (id) ON DELETE SET NULL,
  ADD COLUMN ics       text CHECK (ics IN ('inscripcion', 'cambio', 'cancelacion'));

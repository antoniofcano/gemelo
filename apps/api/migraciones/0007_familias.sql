-- 0007_familias.sql — la sección Familias de la oficina (OF2, doc/sistema/OFICINA.md §3, decisiones 108 y 109).
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada; se añade 0008_….

-- Up Migration

-- ---------------------------------------------------------------- nombre interno (decisión 109)
-- Cómo reconoce la oficina a una familia («Ruiz Molina»). Solo lo ve la oficina: NO entra en ninguna proyección de las rutas
-- de los hogares (/api/yo, /api/hazas, /api/sesion…); un guardián de las pruebas lo comprueba. Sin teléfono ni dirección.
-- ---------------------------------------------------------------- baja con 30 días (decisión 108)
-- Dar de baja = activo = false + baja_en. Los contenidos se ocultan en el acto (la haza queda sin titular, y lo que se ve del
-- mundo cuelga de la haza), y a los 30 días la purga (src/admin/bajas.ts) borra la cuenta y todo lo suyo en cascada.
-- baja_hazas: las hazas que tenía al darse de baja, para devolvérselas al reactivar (las que sigan sin titular).
ALTER TABLE hogares
  ADD COLUMN nombre_interno text CHECK (nombre_interno IS NULL OR char_length(nombre_interno) BETWEEN 1 AND 60),
  ADD COLUMN baja_en        timestamptz,
  ADD COLUMN baja_hazas     bigint[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT hogares_baja_coherente CHECK (baja_en IS NULL OR NOT activo);
CREATE INDEX hogares_baja ON hogares (baja_en) WHERE baja_en IS NOT NULL;

-- ---------------------------------------------------------------- aparato de cada sesión
-- Nombre deducido del agente («Windows · Chrome», «Gafas (código corto)») para que la oficina reconozca cada sesión abierta de
-- una familia; nunca el agente entero. NULL en las anteriores a esta migración.
ALTER TABLE sesiones ADD COLUMN aparato_nombre text CHECK (aparato_nombre IS NULL OR char_length(aparato_nombre) BETWEEN 1 AND 40);

-- (los permisos de fila de gemelo_api ya cubren columnas nuevas de tablas existentes)

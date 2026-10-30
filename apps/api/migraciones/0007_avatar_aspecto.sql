-- 0007_avatar_aspecto.sql — aspecto del muñeco (AV2, decisión 131): tono de piel (10), color de ropa de arriba y de abajo, altura, complexión y
-- movilidad. Contrato: contratos/presencia.md y api.openapi.yaml (campos OPCIONALES del avatar v1). No se edita una vez publicada: se añade 0008_….

-- Up Migration

-- Un objeto JSON con solo lo elegido ({"tono":4,"arriba":2,"altura":"alta",…}). NULL = nada elegido: el muñeco de siempre. La lista cerrada de
-- valores la valida la api (apps/api/src/presencia/livekit.ts, ASPECTO) al guardar y otra vez al leer; aquí solo se asegura que sea un objeto.
ALTER TABLE avatares ADD COLUMN aspecto jsonb CHECK (jsonb_typeof(aspecto) = 'object');

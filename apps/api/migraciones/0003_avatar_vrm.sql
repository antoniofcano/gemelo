-- 0003_avatar_vrm.sql — avatar VRM elegido del catálogo (ADR-0020, P7d). Contrato: contratos/avatares.md y api.openapi.yaml.
-- No se edita una vez publicada: se añade 0004_….

-- Up Migration

-- Id del avatar en /avatares/catalogo.json (mismo patrón que el esquema del catálogo). NULL = sin VRM: se dibuja el muñeco de
-- bloque con camisa, sombrero y piel, que además es el nivel lejano y la caída (ADR-0020 §5-6). La api no conoce el catálogo
-- (lo sirve Caddy desde GEMELO_AVATARES): un id que ya no esté en él lo trata el cliente como ausente.
ALTER TABLE avatares ADD COLUMN vrm text CHECK (vrm ~ '^[a-z0-9-]{1,32}$');

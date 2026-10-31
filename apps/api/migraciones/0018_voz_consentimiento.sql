-- 0018_voz_consentimiento.sql — F3j (ADR-0026; decisiones 163 y 164; doc/sistema/EIPD-VOZ.md; contrato contratos/voz-consentimiento.md).
-- Dos cosas:
--  1. El consentimiento de VOZ de cada hogar: una fila por hogar con la versión del aviso que aceptó. Sin fila, o con una versión distinta de la vigente
--     (VOZ_AVISO_VERSION en src/presencia/consentimiento_voz.ts), el servidor no da la palabra a ese hogar. Retirar = borrar la fila. Nada de la voz:
--     no hay audio, ni texto, ni IP; solo «este hogar aceptó la versión N el día D».
--  2. El plazo de la auditoría de voz (decisión 164: la campaña y un año más). `gemelo_api` solo puede LEER y AÑADIR en `auditoria` (0001): no se le da
--     DELETE. Se borra con una función SECURITY DEFINER que solo toca las acciones de la voz (`guiada.*` y los consentimientos retirados) anteriores al
--     corte que le pasa la api; el resto de la auditoría sigue siendo solo-añadir. Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada.

-- Up Migration

CREATE TABLE voz_consentimientos (
  hogar_id    bigint PRIMARY KEY REFERENCES hogares (id) ON DELETE CASCADE,
  version     smallint NOT NULL CHECK (version >= 1),
  aceptado_en timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION purga_auditoria_voz(corte timestamptz) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  DELETE FROM auditoria a
   WHERE a.cuando < corte
     AND (a.accion LIKE 'guiada.%'
          OR a.accion = 'voz.consentimiento_retirado'
          -- un «dado» solo cuando ya no hay consentimiento vigente de ese hogar (mientras lo haya, es su prueba)
          OR (a.accion = 'voz.consentimiento_dado'
              AND NOT EXISTS (SELECT 1 FROM voz_consentimientos c WHERE c.hogar_id = a.hogar_id)));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;
REVOKE ALL ON FUNCTION purga_auditoria_voz(timestamptz) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON voz_consentimientos TO gemelo_api;
    GRANT EXECUTE ON FUNCTION purga_auditoria_voz(timestamptz) TO gemelo_api;
  END IF;
END
$$;

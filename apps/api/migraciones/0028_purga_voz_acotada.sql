-- 0028_purga_voz_acotada.sql — auditoría de la api del 2026-11-14 (A-11). purga_auditoria_voz es SECURITY DEFINER (gemelo_api no puede borrar
-- de `auditoria`, que es solo-añadir) y hasta ahora borraba hasta el `corte` que le pasara la api: con la api comprometida, toda la auditoría
-- de voz al momento. Ahora la propia función acota el corte al del plazo (decisión 164: la campaña de octubre a septiembre y un año más; lo
-- mismo que corteAuditoriaVoz en src/presencia/consentimiento_voz.ts): el 1 de octubre del año anterior si ya es octubre o después, y si no
-- del de dos años antes, en UTC. Un corte más antiguo se respeta (borra menos); uno más reciente se recorta al del plazo.
-- Mismo nombre y firma: conserva el dueño, el REVOKE de PUBLIC y el EXECUTE de gemelo_api. Las acciones, las de la 0025. Solo hacia arriba.

-- Up Migration

CREATE OR REPLACE FUNCTION purga_auditoria_voz(corte timestamptz) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  n integer;
  hoy timestamp := now() AT TIME ZONE 'UTC';
  tope timestamptz := make_timestamptz(extract(year FROM hoy)::int - CASE WHEN extract(month FROM hoy) >= 10 THEN 1 ELSE 2 END, 10, 1, 0, 0, 0, 'UTC');
  hasta timestamptz := LEAST(corte, tope);
BEGIN
  DELETE FROM auditoria a
   WHERE a.cuando < hasta
     AND (a.accion LIKE 'guiada.%'
          OR a.accion LIKE 'corro.%'
          OR a.accion = 'voz.consentimiento_retirado'
          -- un «dado» solo cuando ya no hay consentimiento vigente de ese hogar EN ESE ÁMBITO (mientras lo haya, es su prueba); sin ámbito, el de la guiada (F3j)
          OR (a.accion = 'voz.consentimiento_dado'
              AND NOT EXISTS (SELECT 1 FROM voz_consentimientos c WHERE c.hogar_id = a.hogar_id AND c.ambito = coalesce(a.detalle ->> 'ambito', 'guiada'))));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;
REVOKE ALL ON FUNCTION purga_auditoria_voz(timestamptz) FROM PUBLIC;

-- 0025_voz_cercania.sql — F3k-1: la voz por cercanía en la visita libre, en corros (ADR-0032; decisiones 205-213: 210, 211 y 213 cerradas por Antonio el
-- 2026-11-05; 205-209 y 212, PROVISIONALES con la opción recomendada; doc/sistema/EIPD-VOZ.md §13; contratos: voz-consentimiento.md, livekit-roles.json v8).
-- Los corros NO se guardan (viven en memoria de la api: no hay grafo social). Lo que sí:
--  1. El consentimiento de voz pasa a ser por ÁMBITO (`guiada`, el de F3j, o `cercania`, el aviso propio de la decisión 211). Las filas que había son de la
--     guiada (el valor por omisión), así que nada cambia para ellas.
--  2. El ajuste «Voz por cercanía» de cada cuenta (decisión 210, V1): sin fila o con `activa` falso, apagada (lo que hay por omisión).
--  3. Los bloqueos de voz (quién bloquea a quién), en el servidor: el bloqueado no invita ni entra en un corro de quien le bloqueó. Se borran con cualquiera de
--     los dos hogares (cascada) o cuando quien bloquea lo quita (decisión 212, provisional).
--  4. Los avisos a la oficina (motivo de lista y texto ≤ 280; SIN audio): quién avisa, de qué hogar, cuándo y en qué corro. Plazo: la campaña y un año más una
--     vez atendidos (como la 164 y la 100; purgaVozCercania en src/presencia/cercania.ts).
--  5. Las suspensiones de la voz por cercanía de un hogar (7 días, 30 días o hasta nuevo aviso; o automática con avisos de 3 hogares en 7 días, hasta que la
--     oficina la revise). La fila se borra al levantarla o al vencer; su historia queda en la auditoría (corro.suspendido, corro.suspension_levantada).
--  6. El interruptor general (una fila): APAGADO al crearse. Lo enciende la oficina (PUT /api/admin/voz/cercania).
--  7. La purga de la auditoría de voz (decisión 164, y 212 provisional) incluye ahora `corro.*`, y el «consentimiento dado» se mira por ámbito.
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada.

-- Up Migration

-- 1. consentimiento por ámbito
ALTER TABLE voz_consentimientos ADD COLUMN ambito text NOT NULL DEFAULT 'guiada' CHECK (ambito IN ('guiada', 'cercania'));
ALTER TABLE voz_consentimientos DROP CONSTRAINT voz_consentimientos_pkey;
ALTER TABLE voz_consentimientos ADD PRIMARY KEY (hogar_id, ambito);

-- 2. el ajuste por cuenta
CREATE TABLE voz_cercania_ajustes (
  hogar_id    bigint PRIMARY KEY REFERENCES hogares (id) ON DELETE CASCADE,
  activa      boolean NOT NULL DEFAULT false,
  cambiada_en timestamptz NOT NULL DEFAULT now()
);

-- 3. los bloqueos de voz
CREATE TABLE voz_bloqueos (
  hogar_id     bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  bloqueado_id bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hogar_id, bloqueado_id),
  CHECK (hogar_id <> bloqueado_id)
);
CREATE INDEX voz_bloqueos_bloqueado ON voz_bloqueos (bloqueado_id);

-- 4. los avisos a la oficina
CREATE TABLE voz_avisos (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  avisa_id     bigint REFERENCES hogares (id) ON DELETE SET NULL,
  avisado_id   bigint REFERENCES hogares (id) ON DELETE SET NULL,
  corro        text CHECK (corro ~ '^[A-Za-z0-9_-]{12}$'),
  motivo       text NOT NULL CHECK (motivo IN ('insultos', 'acoso', 'contenido_sexual', 'parece_menor', 'otro')),
  texto        text CHECK (char_length(texto) BETWEEN 1 AND 280),
  estado       text NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'visto', 'resuelto', 'descartado')),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  decidido_en  timestamptz,
  decidido_por bigint REFERENCES hogares (id) ON DELETE SET NULL,
  CHECK (estado IN ('nuevo', 'visto') OR decidido_en IS NOT NULL)
);
CREATE INDEX voz_avisos_avisado ON voz_avisos (avisado_id, creado_en DESC);
CREATE INDEX voz_avisos_estado ON voz_avisos (estado, creado_en DESC);

-- 5. las suspensiones
CREATE TABLE voz_cercania_suspensiones (
  hogar_id   bigint PRIMARY KEY REFERENCES hogares (id) ON DELETE CASCADE,
  desde      timestamptz NOT NULL DEFAULT now(),
  hasta      timestamptz,                                  -- NULL: hasta nuevo aviso (o, si es automática, hasta que la oficina la revise)
  automatica boolean NOT NULL DEFAULT false,
  por_id     bigint REFERENCES hogares (id) ON DELETE SET NULL,
  CHECK (hasta IS NULL OR hasta > desde)
);

-- 6. el interruptor general: una sola fila, apagado
CREATE TABLE voz_cercania_interruptor (
  id           boolean PRIMARY KEY DEFAULT true CHECK (id),
  activa       boolean NOT NULL DEFAULT false,
  cambiada_en  timestamptz NOT NULL DEFAULT now(),
  cambiada_por bigint REFERENCES hogares (id) ON DELETE SET NULL
);
INSERT INTO voz_cercania_interruptor (id, activa) VALUES (true, false);

-- 7. la purga de la auditoría de voz, con los corros y el consentimiento por ámbito (mismo nombre y firma: conserva el dueño y el EXECUTE de gemelo_api)
CREATE OR REPLACE FUNCTION purga_auditoria_voz(corte timestamptz) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  DELETE FROM auditoria a
   WHERE a.cuando < corte
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON voz_cercania_ajustes, voz_bloqueos, voz_avisos, voz_cercania_suspensiones TO gemelo_api;
    -- el interruptor: leerlo y cambiarlo; ni otra fila ni borrarla
    GRANT SELECT, UPDATE ON voz_cercania_interruptor TO gemelo_api;
    REVOKE INSERT, DELETE, TRUNCATE ON voz_cercania_interruptor FROM gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
    GRANT EXECUTE ON FUNCTION purga_auditoria_voz(timestamptz) TO gemelo_api;
  END IF;
END
$$;

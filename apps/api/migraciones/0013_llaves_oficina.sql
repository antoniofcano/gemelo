-- 0013_llaves_oficina.sql — llave de acceso (WebAuthn, passkey) de las cuentas de oficina (OF13, ADR-0024, decisión 105;
-- doc/sistema/OFICINA.md §2). Contrato: contratos/sesion.md § Llave de acceso. Código: apps/api/src/oficina/llaves*.ts.
-- Solo hacia arriba (src/bd/migra.ts): no se edita una vez publicada; se añade 0014_….

-- Up Migration

-- ---------------------------------------------------------------- las llaves
-- Una credencial WebAuthn de una cuenta de oficina (rol oficina o admin). Se guarda lo que la verificación necesita y nada
-- más: el id de la credencial (base64url, como lo da el navegador), la clave PÚBLICA (COSE), el contador de firmas y los
-- transports que dijo el navegador (pistas para la próxima vez). Ni la clave privada ni la biometría salen nunca del aparato.
-- nombre: el que le da la persona («Portátil de la oficina», «iPhone»); respaldada: la llave se sincroniza (iCloud, Google…).
-- Revocar una llave cierra las sesiones que se abrieron o confirmaron con ella (lo hace la api) y no se puede deshacer.
CREATE TABLE llaves_oficina (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hogar_id       bigint NOT NULL REFERENCES hogares (id) ON DELETE CASCADE,
  credencial_id  text NOT NULL UNIQUE CHECK (credencial_id ~ '^[A-Za-z0-9_-]{16,1366}$'),
  clave_publica  bytea NOT NULL CHECK (octet_length(clave_publica) BETWEEN 16 AND 2048),
  contador       bigint NOT NULL DEFAULT 0 CHECK (contador >= 0),
  transports     text[] NOT NULL DEFAULT '{}',
  nombre         text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 40),
  respaldada     boolean NOT NULL DEFAULT false,
  creada_en      timestamptz NOT NULL DEFAULT now(),
  -- desde qué aparato de oficina se dio de alta (pista para reconocerla; el aparato puede revocarse después)
  aparato_id     bigint REFERENCES aparatos_oficina (id) ON DELETE SET NULL,
  ultima_vez_en  timestamptz,
  revocada_en    timestamptz,
  revocada_por   bigint REFERENCES hogares (id) ON DELETE SET NULL
);
CREATE INDEX llaves_oficina_hogar ON llaves_oficina (hogar_id);

-- ---------------------------------------------------------------- la cuenta
-- llave_usuario: el «user handle» de WebAuthn, al azar y estable por cuenta (nunca el id ni el correo: el autenticador lo guarda).
-- llave_rehabilitada_hasta: el camino de recuperación. Una cuenta que ya tuvo alguna llave solo puede dar de alta otra con la
--   sesión del enlace (sin llave) si un `admin` le rehabilitó el alta (24 h; nunca la suya propia) o desde la consola del
--   servidor (RUNBOOK-VPS). Se borra al dar de alta la llave nueva. Una cuenta que NUNCA tuvo llave puede darla de alta con la
--   sesión del enlace y el aparato aprobado (la primera vez).
ALTER TABLE hogares
  ADD COLUMN llave_usuario            bytea UNIQUE CHECK (llave_usuario IS NULL OR octet_length(llave_usuario) = 32),
  ADD COLUMN llave_rehabilitada_hasta timestamptz;

-- ---------------------------------------------------------------- las sesiones
-- llave_id: la llave con la que se abrió o se confirmó esta sesión de oficina (NULL: solo con el enlace). Con la llave
--   obligatoria (GEMELO_OFICINA_LLAVE, por defecto), una sesión de oficina sin llave viva solo sirve para darla de alta o entrar
--   con ella. confirmada_en (0005) pasa a ser la última aserción WebAuthn: la «confirmación reciente».
ALTER TABLE sesiones ADD COLUMN llave_id bigint REFERENCES llaves_oficina (id) ON DELETE SET NULL;
CREATE INDEX sesiones_llave ON sesiones (llave_id) WHERE llave_id IS NOT NULL;

-- ---------------------------------------------------------------- los retos
-- El reto (challenge) de cada ceremonia, de un solo uso y de 5 minutos, atado a la sesión que lo pidió. La sesión no guarda
-- campos libres (src/auth/almacen.ts), por eso van aquí; se borran al usarlos, al caducar la sesión (cascada) y en la purga.
CREATE TABLE llaves_retos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sesion_id  bigint NOT NULL REFERENCES sesiones (id) ON DELETE CASCADE,
  tipo       text NOT NULL CHECK (tipo IN ('alta', 'entrada')),
  reto       text NOT NULL CHECK (reto ~ '^[A-Za-z0-9_-]{32,128}$'),
  expira_en  timestamptz NOT NULL,
  UNIQUE (sesion_id, tipo)
);

-- ---------------------------------------------------------------- permisos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemelo_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON llaves_oficina, llaves_retos TO gemelo_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemelo_api;
  END IF;
END
$$;

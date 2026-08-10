-- Flag de administrador para panel spappweb (login vía verify_login + status)
-- Sustituido por 20260612700000_add_users_status.sql (status = normal | admin).
-- Se mantiene por historial si ya se aplicó; la migración posterior migra is_admin → status.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_is_admin
  ON public.users (is_admin)
  WHERE is_admin = true;

COMMENT ON COLUMN public.users.is_admin IS
  'Deprecated: usar users.status = admin. Migrado en 20260612700000_add_users_status.sql.';

-- Rol del usuario: normal (app cliente) o admin (panel spappweb)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'normal'
  CHECK (status IN ('normal', 'admin'));

CREATE INDEX IF NOT EXISTS idx_users_status_admin
  ON public.users (status)
  WHERE status = 'admin';

COMMENT ON COLUMN public.users.status IS
  'normal = usuario de la app. admin = acceso al panel spappweb tras verify_login.';

-- Migrar admins existentes desde is_admin (si la columna ya existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'is_admin'
  ) THEN
    UPDATE public.users
    SET status = 'admin'
    WHERE is_admin = true;

    DROP INDEX IF EXISTS idx_users_is_admin;
    ALTER TABLE public.users DROP COLUMN IF EXISTS is_admin;
  END IF;
END $$;

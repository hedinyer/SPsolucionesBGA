-- Silent location tracking for signed contract users
CREATE TABLE public.users_tracking (
  id           bigserial PRIMARY KEY,
  user_id      bigint NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  ubicacion_1  jsonb,
  ubicacion_2  jsonb,
  ubicacion_3  jsonb,
  ubicacion_4  jsonb,
  ubicacion_5  jsonb,
  ubicacion_6  jsonb,
  ubicacion_7  jsonb,
  ubicacion_8  jsonb,
  ubicacion_9  jsonb,
  ubicacion_10 jsonb,
  ubicacion_11 jsonb,
  seguimiento  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_tracking_user_id ON public.users_tracking(user_id);

CREATE OR REPLACE FUNCTION public.set_users_tracking_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_tracking_updated_at
  BEFORE UPDATE ON public.users_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.set_users_tracking_updated_at();

-- Rotate nightly snapshots: 11 <- 10 <- ... <- 3 <- 2, new location -> ubicacion_2
CREATE OR REPLACE FUNCTION public.rotate_nightly_location(
  p_user_id bigint,
  p_location jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users_tracking
  SET
    ubicacion_11 = ubicacion_10,
    ubicacion_10 = ubicacion_9,
    ubicacion_9  = ubicacion_8,
    ubicacion_8  = ubicacion_7,
    ubicacion_7  = ubicacion_6,
    ubicacion_6  = ubicacion_5,
    ubicacion_5  = ubicacion_4,
    ubicacion_4  = ubicacion_3,
    ubicacion_3  = ubicacion_2,
    ubicacion_2  = p_location
  WHERE user_id = p_user_id;
END;
$$;

-- Backup: create tracking row when contract is signed
CREATE OR REPLACE FUNCTION public.ensure_users_tracking_on_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'firmado'
     AND (OLD.status IS DISTINCT FROM 'firmado') THEN
    INSERT INTO public.users_tracking (user_id, seguimiento)
    VALUES (NEW.user_id, false)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ensure_users_tracking_on_signed
  AFTER UPDATE ON public.digital_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_users_tracking_on_signed();

-- Realtime for seguimiento and ubicacion_1 monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.users_tracking;

-- Client app may update location fields but NOT seguimiento (service_role only)
REVOKE UPDATE (seguimiento) ON public.users_tracking FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rotate_nightly_location(bigint, jsonb) TO anon, authenticated;

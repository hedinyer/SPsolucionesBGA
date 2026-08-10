-- Garaje: inventario físico de motos en parqueaderos

CREATE TABLE IF NOT EXISTS public.garaje_parqueaderos (
  id          bigserial PRIMARY KEY,
  nombre      text NOT NULL UNIQUE,
  slug        text NOT NULL UNIQUE,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.garaje_motos (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parqueadero_id          bigint REFERENCES public.garaje_parqueaderos(id) ON DELETE SET NULL,
  placa                   text,
  placa_foto_url          text,
  referencia              text NOT NULL,
  modelo                  text NOT NULL,
  color                   text NOT NULL,
  origen                  text NOT NULL DEFAULT 'manual'
    CHECK (origen IN ('manual', 'recuperacion')),
  condicion               text NOT NULL DEFAULT 'recuperada'
    CHECK (condicion IN ('nueva', 'segunda_mano', 'recuperada')),
  estado                  text NOT NULL DEFAULT 'en_garaje'
    CHECK (estado IN ('en_garaje', 'disponible', 'vendida', 'baja')),
  moto_para_recoger_id    uuid UNIQUE REFERENCES public.motos_para_recoger(id) ON DELETE SET NULL,
  user_moto_compra_id     uuid REFERENCES public.user_moto_compra(id) ON DELETE SET NULL,
  notas                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_garaje_motos_parqueadero_estado
  ON public.garaje_motos (parqueadero_id, estado);

CREATE INDEX IF NOT EXISTS idx_garaje_motos_origen
  ON public.garaje_motos (origen);

CREATE INDEX IF NOT EXISTS idx_garaje_motos_placa
  ON public.garaje_motos (placa);

CREATE OR REPLACE FUNCTION public.set_garaje_parqueaderos_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_garaje_parqueaderos_updated_at ON public.garaje_parqueaderos;
CREATE TRIGGER trg_garaje_parqueaderos_updated_at
  BEFORE UPDATE ON public.garaje_parqueaderos
  FOR EACH ROW EXECUTE FUNCTION public.set_garaje_parqueaderos_updated_at();

CREATE OR REPLACE FUNCTION public.set_garaje_motos_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_garaje_motos_updated_at ON public.garaje_motos;
CREATE TRIGGER trg_garaje_motos_updated_at
  BEFORE UPDATE ON public.garaje_motos
  FOR EACH ROW EXECUTE FUNCTION public.set_garaje_motos_updated_at();

-- Al marcar moto como recogida: alta automática en garaje
CREATE OR REPLACE FUNCTION public.sync_garaje_on_moto_recogida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  compra record;
BEGIN
  IF NEW.estado = 'recogida'
     AND (OLD.estado IS DISTINCT FROM 'recogida') THEN

    IF NEW.fecha_recogida IS NULL THEN
      NEW.fecha_recogida := now();
    END IF;

    SELECT modelo, color, placa, referencia, chasis
    INTO compra
    FROM public.user_moto_compra
    WHERE id = NEW.user_moto_compra_id;

    IF FOUND THEN
      INSERT INTO public.garaje_motos (
        placa,
        referencia,
        modelo,
        color,
        origen,
        condicion,
        moto_para_recoger_id,
        user_moto_compra_id,
        notas
      ) VALUES (
        compra.placa,
        COALESCE(NULLIF(trim(compra.referencia), ''), NULLIF(trim(compra.chasis), ''), 'sin-referencia'),
        compra.modelo,
        compra.color,
        'recuperacion',
        'recuperada',
        NEW.id,
        NEW.user_moto_compra_id,
        'Creado automáticamente al marcar moto como recogida.'
      )
      ON CONFLICT (moto_para_recoger_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_garaje_on_moto_recogida ON public.motos_para_recoger;
CREATE TRIGGER trg_sync_garaje_on_moto_recogida
  BEFORE UPDATE ON public.motos_para_recoger
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_garaje_on_moto_recogida();

INSERT INTO public.garaje_parqueaderos (nombre, slug, orden)
VALUES
  ('Lavadero', 'lavadero', 1),
  ('Parqueadero', 'parqueadero', 2)
ON CONFLICT (slug) DO NOTHING;

-- Storage bucket fotos de placa
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'garaje-imagenes',
  'garaje-imagenes',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow public read garaje images'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow public read garaje images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'garaje-imagenes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin upload garaje images'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin upload garaje images"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'garaje-imagenes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin update garaje images'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin update garaje images"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'garaje-imagenes');
  END IF;
END;
$$;

GRANT SELECT ON public.garaje_parqueaderos, public.garaje_motos TO anon, authenticated;

-- Admin operations (service_role):
-- INSERT/UPDATE/DELETE garaje_parqueaderos, garaje_motos
-- UPDATE motos_para_recoger SET estado = 'recogida'

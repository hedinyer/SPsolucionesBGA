-- Visitadores: perfiles de quienes realizan visitas domiciliarias
CREATE TABLE IF NOT EXISTS public.visitadores (
  id          bigserial PRIMARY KEY,
  nombre      text NOT NULL,
  foto_url    text,
  telefono    text,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitadores_activo ON public.visitadores(activo);

-- Visitas domiciliarias vinculadas a contratos firmados
CREATE TABLE IF NOT EXISTS public.visitas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             bigint NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  digital_contract_id uuid REFERENCES public.digital_contracts(id) ON DELETE SET NULL,
  visitador_id        bigint REFERENCES public.visitadores(id) ON DELETE SET NULL,
  estado              text NOT NULL DEFAULT 'pendiente_asignacion'
    CHECK (estado IN ('pendiente_asignacion', 'asignada', 'completada', 'cancelada')),
  cliente_nombre      text,
  cliente_celular     text,
  direccion_visita    text,
  barrio              text,
  fecha_programada    timestamptz,
  notas               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitas_user_id ON public.visitas(user_id);
CREATE INDEX IF NOT EXISTS idx_visitas_visitador_id ON public.visitas(visitador_id);
CREATE INDEX IF NOT EXISTS idx_visitas_estado ON public.visitas(estado);

CREATE OR REPLACE FUNCTION public.set_visitadores_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visitadores_updated_at ON public.visitadores;
CREATE TRIGGER trg_visitadores_updated_at
  BEFORE UPDATE ON public.visitadores
  FOR EACH ROW
  EXECUTE FUNCTION public.set_visitadores_updated_at();

CREATE OR REPLACE FUNCTION public.set_visitas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visitas_updated_at ON public.visitas;
CREATE TRIGGER trg_visitas_updated_at
  BEFORE UPDATE ON public.visitas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_visitas_updated_at();

-- Auto-create visita when contract is signed (snapshot client data from hoja_vida)
CREATE OR REPLACE FUNCTION public.ensure_visita_on_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'firmado'
     AND (OLD.status IS DISTINCT FROM 'firmado') THEN
    INSERT INTO public.visitas (
      user_id,
      digital_contract_id,
      cliente_nombre,
      cliente_celular,
      direccion_visita,
      barrio
    )
    VALUES (
      NEW.user_id,
      NEW.id,
      COALESCE(NEW.hoja_vida_data->>'nombre_completo', ''),
      COALESCE(NEW.hoja_vida_data->>'celular', ''),
      COALESCE(NEW.hoja_vida_data->>'direccion', ''),
      COALESCE(NEW.hoja_vida_data->>'barrio', '')
    )
    ON CONFLICT (user_id) DO UPDATE SET
      digital_contract_id = EXCLUDED.digital_contract_id,
      cliente_nombre = EXCLUDED.cliente_nombre,
      cliente_celular = EXCLUDED.cliente_celular,
      direccion_visita = EXCLUDED.direccion_visita,
      barrio = EXCLUDED.barrio,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_visita_on_signed ON public.digital_contracts;
CREATE TRIGGER trg_ensure_visita_on_signed
  AFTER UPDATE ON public.digital_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_visita_on_signed();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'visitador-fotos',
  'visitador-fotos',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow public read visitador photos'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow public read visitador photos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'visitador-fotos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'visitas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.visitas;
  END IF;
END $$;

-- Required so Realtime delivers UPDATE events with user_id for client filtering
ALTER TABLE public.visitas REPLICA IDENTITY FULL;

GRANT SELECT ON public.visitadores TO anon, authenticated;
GRANT SELECT ON public.visitas TO anon, authenticated;

-- Admin operations (service_role):
-- INSERT INTO visitadores (nombre, foto_url, telefono) VALUES (...);
-- UPDATE visitas SET visitador_id = <id>, fecha_programada = '...', estado = 'asignada'
--   WHERE user_id = <id> AND estado = 'pendiente_asignacion';

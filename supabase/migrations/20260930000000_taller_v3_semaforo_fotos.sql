-- Taller v3: semáforo en tareas, foto/color de mecánico, motivo de pausa, bucket y realtime

ALTER TABLE public.mecanicos
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE public.orden_taller_zonas
  ADD COLUMN IF NOT EXISTS gravedad text;

ALTER TABLE public.orden_taller_zonas
  DROP CONSTRAINT IF EXISTS orden_taller_zonas_gravedad_check;
ALTER TABLE public.orden_taller_zonas
  ADD CONSTRAINT orden_taller_zonas_gravedad_check
  CHECK (gravedad IS NULL OR gravedad IN ('bien', 'pronto', 'urgente'));

ALTER TABLE public.orden_taller_tiempos
  ADD COLUMN IF NOT EXISTS motivo_pausa text;

-- Cronómetro con motivo de pausa
CREATE OR REPLACE FUNCTION public.taller_timer_stop(p_orden_id uuid, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_secs integer;
BEGIN
  UPDATE public.orden_taller_tiempos
  SET fin = now(),
      motivo_pausa = nullif(trim(p_motivo), '')
  WHERE orden_id = p_orden_id AND fin IS NULL
  RETURNING greatest(0, floor(extract(epoch FROM (fin - inicio))))::integer INTO v_secs;

  UPDATE public.ordenes_taller
  SET timer_running = false,
      timer_started_at = NULL,
      segundos_acumulados = segundos_acumulados + coalesce(v_secs, 0)
  WHERE id = p_orden_id;
END;
$$;

-- Bucket fotos de ingreso / mecánicos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'taller-fotos',
  'taller-fotos',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow public read taller fotos'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow public read taller fotos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'taller-fotos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin upload taller fotos'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin upload taller fotos"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'taller-fotos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin update taller fotos'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin update taller fotos"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'taller-fotos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin delete taller fotos'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin delete taller fotos"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'taller-fotos');
  END IF;
END $$;

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ordenes_taller'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ordenes_taller;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orden_taller_repuestos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orden_taller_repuestos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orden_taller_zonas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orden_taller_zonas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orden_taller_tiempos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orden_taller_tiempos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mecanicos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mecanicos;
  END IF;
END $$;

ALTER TABLE public.ordenes_taller REPLICA IDENTITY FULL;
ALTER TABLE public.orden_taller_repuestos REPLICA IDENTITY FULL;
ALTER TABLE public.orden_taller_zonas REPLICA IDENTITY FULL;
ALTER TABLE public.orden_taller_tiempos REPLICA IDENTITY FULL;
ALTER TABLE public.mecanicos REPLICA IDENTITY FULL;

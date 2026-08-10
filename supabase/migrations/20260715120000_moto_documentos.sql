-- Documentos post-entrega: tarjeta de propiedad, SOAT, tecnomecánica (PDF)
ALTER TABLE public.user_moto_compra
  ADD COLUMN IF NOT EXISTS doc_tarjeta_propiedad_path text,
  ADD COLUMN IF NOT EXISTS doc_soat_path text,
  ADD COLUMN IF NOT EXISTS doc_tecno_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'moto-documentos',
  'moto-documentos',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Políticas para panel admin (anon key en servidor, mismo patrón que bike-images)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Allow admin read moto documentos'
  ) THEN
    CREATE POLICY "Allow admin read moto documentos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'moto-documentos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Allow admin upload moto documentos'
  ) THEN
    CREATE POLICY "Allow admin upload moto documentos"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'moto-documentos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Allow admin update moto documentos'
  ) THEN
    CREATE POLICY "Allow admin update moto documentos"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'moto-documentos')
      WITH CHECK (bucket_id = 'moto-documentos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Allow admin delete moto documentos'
  ) THEN
    CREATE POLICY "Allow admin delete moto documentos"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'moto-documentos');
  END IF;
END $$;

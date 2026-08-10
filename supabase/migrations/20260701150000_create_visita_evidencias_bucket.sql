-- Bucket para fotos/videos de visitas (faltaba en prod; ver visitador_module.sql)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'visita-evidencias',
  'visita-evidencias',
  true,
  52428800,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow public read visita evidencias'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow public read visita evidencias"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'visita-evidencias');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow upload visita evidencias'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow upload visita evidencias"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'visita-evidencias');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow update visita evidencias'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow update visita evidencias"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'visita-evidencias');
  END IF;
END $$;

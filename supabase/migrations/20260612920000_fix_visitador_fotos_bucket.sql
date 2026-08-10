-- Alinear bucket de fotos de visitadores con el nombre real del proyecto.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'visitador-fotos',
  'visitador-fotos',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public read visitador photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin upload visitador photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin update visitador photos" ON storage.objects;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow public read visitador fotos'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow public read visitador fotos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'visitador-fotos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin upload visitador fotos'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin upload visitador fotos"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'visitador-fotos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin update visitador fotos'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin update visitador fotos"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'visitador-fotos');
  END IF;
END $$;

-- Bucket para fotos del catálogo de motos (admin panel)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bike-images',
  'bike-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow public read bike images'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow public read bike images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'bike-images');
  END IF;
END $$;

-- Subida desde panel admin (anon key en servidor)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin upload visitador photos'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin upload visitador photos"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'visitador-fotos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin update visitador photos'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin update visitador photos"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'visitador-fotos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin upload bike images'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin upload bike images"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'bike-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin update bike images'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin update bike images"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'bike-images');
  END IF;
END $$;

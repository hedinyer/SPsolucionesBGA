-- Bucket for client identity photos (front/back/selfie)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-documents',
  'user-documents',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Allow public read user documents'
  ) THEN
    CREATE POLICY "Allow public read user documents"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'user-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Allow public upload user documents'
  ) THEN
    CREATE POLICY "Allow public upload user documents"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'user-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Allow public update user documents'
  ) THEN
    CREATE POLICY "Allow public update user documents"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'user-documents')
      WITH CHECK (bucket_id = 'user-documents');
  END IF;
END $$;

DROP POLICY IF EXISTS "Allow public update contract documents" ON storage.objects;

CREATE POLICY "Allow public update contract documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'contract-documents')
  WITH CHECK (bucket_id = 'contract-documents');

DROP POLICY IF EXISTS "Allow public upload contract documents" ON storage.objects;

CREATE POLICY "Allow public upload contract documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'contract-documents');

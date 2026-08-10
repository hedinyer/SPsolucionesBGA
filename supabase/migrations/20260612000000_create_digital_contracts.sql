-- Digital contracts for post-approval form filling
CREATE TABLE public.digital_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id bigint NOT NULL REFERENCES public.users(id),
  users_documents_id bigint REFERENCES public.users_documents(id),
  status text NOT NULL DEFAULT 'borrador'
    CHECK (status IN ('borrador', 'completado', 'firmado')),
  hoja_vida_data jsonb NOT NULL DEFAULT '{}',
  contrato_data jsonb NOT NULL DEFAULT '{}',
  admin_data jsonb NOT NULL DEFAULT '{}',
  signature_path text,
  hoja_vida_pdf_path text,
  contrato_pdf_path text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, users_documents_id)
);

CREATE INDEX idx_digital_contracts_user_id ON public.digital_contracts(user_id);

CREATE OR REPLACE FUNCTION public.set_digital_contracts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_digital_contracts_updated_at
  BEFORE UPDATE ON public.digital_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_digital_contracts_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contract-documents',
  'contract-documents',
  true,
  10485760,
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public read contract documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'contract-documents');

CREATE POLICY "Allow public upload contract documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'contract-documents');

CREATE POLICY "Allow public update contract documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'contract-documents');

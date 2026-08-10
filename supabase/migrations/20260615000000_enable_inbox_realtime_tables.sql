-- Realtime for inbox queue counters (users_documents, motos_para_recoger)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'users_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users_documents;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'motos_para_recoger'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.motos_para_recoger;
  END IF;
END $$;

ALTER TABLE public.users_documents REPLICA IDENTITY FULL;
ALTER TABLE public.motos_para_recoger REPLICA IDENTITY FULL;

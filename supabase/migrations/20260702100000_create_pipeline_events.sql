-- Eventos del pipeline de crédito para notificaciones vía Hermes Agent (WhatsApp).

CREATE TABLE IF NOT EXISTS public.pipeline_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  step_id       text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  whatsapp_hint text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  acked_at      timestamptz,
  acked_by      text
);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_pending
  ON public.pipeline_events (created_at)
  WHERE acked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_events_user
  ON public.pipeline_events (user_id, created_at DESC);

COMMENT ON TABLE public.pipeline_events IS
  'Cola de eventos del pipeline (crédito→moto→contrato→pago→visita→entrega) para que Hermes Agent envíe WhatsApp.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pipeline_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_events;
  END IF;
END $$;

ALTER TABLE public.pipeline_events REPLICA IDENTITY FULL;

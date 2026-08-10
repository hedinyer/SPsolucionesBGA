-- Participantes de la rifa Día del Tendero 2026 (/neomundo).

CREATE TABLE IF NOT EXISTS public.neomundo_participantes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            text NOT NULL,
  telefono_whatsapp text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.neomundo_participantes IS
  'Registros del formulario público /neomundo (rifa Bera SBR 150 cc).';

GRANT INSERT, SELECT ON public.neomundo_participantes TO anon, authenticated;

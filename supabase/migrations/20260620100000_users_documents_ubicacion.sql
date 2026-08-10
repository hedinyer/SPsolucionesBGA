-- GPS capturado al enviar solicitud web (hojadevida)
ALTER TABLE public.users_documents
  ADD COLUMN IF NOT EXISTS ubicacion_solicitud jsonb;

COMMENT ON COLUMN public.users_documents.ubicacion_solicitud IS
  'Ubicación GPS al enviar solicitud: { lat, lng, accuracy?, captured_at }';

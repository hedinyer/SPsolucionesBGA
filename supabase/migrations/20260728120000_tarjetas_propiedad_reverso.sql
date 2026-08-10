-- Frente + reverso de Licencia de Tránsito
ALTER TABLE public.tarjetas_propiedad
  ADD COLUMN IF NOT EXISTS imagen_reverso_url text;

COMMENT ON COLUMN public.tarjetas_propiedad.imagen_url IS
  'Foto del anverso (frente) de la Licencia de Tránsito.';
COMMENT ON COLUMN public.tarjetas_propiedad.imagen_reverso_url IS
  'Foto del reverso de la Licencia de Tránsito.';

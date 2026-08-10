-- Estado físico/operacional de motos entregadas (panel Vendidas)

ALTER TABLE public.user_moto_compra
  ADD COLUMN IF NOT EXISTS estado_fisico text NOT NULL DEFAULT 'activa'
    CHECK (estado_fisico IN ('activa', 'recogida', 'robada', 'en_transito', 'en_patio'));

UPDATE public.user_moto_compra
SET estado_fisico = 'activa'
WHERE estado = 'entregada';

CREATE INDEX IF NOT EXISTS idx_user_moto_compra_estado_fisico
  ON public.user_moto_compra (estado_fisico)
  WHERE estado = 'entregada';

-- Referencia única por cliente en pagos confirmados

CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_user_referencia_unique
  ON public.pagos (user_id, upper(trim(referencia)))
  WHERE referencia IS NOT NULL AND trim(referencia) <> '';

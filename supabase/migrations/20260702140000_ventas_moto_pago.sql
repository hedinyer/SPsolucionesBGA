-- Pago en venta de moto (contado o abono parcial)

ALTER TABLE public.ventas_moto
  ADD COLUMN IF NOT EXISTS valor_venta integer,
  ADD COLUMN IF NOT EXISTS monto_pagado integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ventas_moto.valor_venta IS 'Precio total acordado de la moto.';
COMMENT ON COLUMN public.ventas_moto.monto_pagado IS 'Monto recibido en el momento de la venta.';

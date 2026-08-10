-- Precio total de venta de contado (distinto de cuota_inicial del renting)

ALTER TABLE public.bike_table
  ADD COLUMN IF NOT EXISTS precio_venta integer;

COMMENT ON COLUMN public.bike_table.precio_venta IS
  'Precio total de la moto al contado (venta en mostrador).';

-- Serial del motor (aparte del chasis) en compras a crédito
ALTER TABLE public.user_moto_compra
  ADD COLUMN IF NOT EXISTS serial_motor text;

COMMENT ON COLUMN public.user_moto_compra.serial_motor IS
  'Serial / número de motor de la moto';

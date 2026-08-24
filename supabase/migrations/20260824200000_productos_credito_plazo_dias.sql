-- Plazo (días) de la cuota diaria en productos a crédito

ALTER TABLE public.productos_credito
  ADD COLUMN IF NOT EXISTS plazo_dias integer;

ALTER TABLE public.compra_productos_credito
  ADD COLUMN IF NOT EXISTS plazo_dias integer;

ALTER TABLE public.productos_credito
  DROP CONSTRAINT IF EXISTS productos_credito_plazo_dias_check;
ALTER TABLE public.productos_credito
  ADD CONSTRAINT productos_credito_plazo_dias_check
  CHECK (plazo_dias IS NULL OR plazo_dias > 0);

ALTER TABLE public.compra_productos_credito
  DROP CONSTRAINT IF EXISTS compra_productos_credito_plazo_dias_check;
ALTER TABLE public.compra_productos_credito
  ADD CONSTRAINT compra_productos_credito_plazo_dias_check
  CHECK (plazo_dias IS NULL OR plazo_dias > 0);

COMMENT ON COLUMN public.productos_credito.plazo_dias IS
  'Días durante los cuales se cobra la cuota diaria del producto.';
COMMENT ON COLUMN public.compra_productos_credito.plazo_dias IS
  'Días durante los cuales el cliente paga la cuota diaria de este ítem.';

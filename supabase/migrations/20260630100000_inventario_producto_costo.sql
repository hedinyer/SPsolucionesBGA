-- Costo de adquisición del producto (interno, distinto del precio de venta)

ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS costo integer NOT NULL DEFAULT 0 CHECK (costo >= 0);

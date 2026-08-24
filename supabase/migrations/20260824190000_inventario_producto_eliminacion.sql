-- Soft-delete de productos con auditoríaía de quién y por qué
ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS eliminado_por text,
  ADD COLUMN IF NOT EXISTS motivo_eliminacion text,
  ADD COLUMN IF NOT EXISTS eliminado_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_inventario_productos_no_eliminados
  ON public.inventario_productos (stock, nombre)
  WHERE eliminado_at IS NULL;

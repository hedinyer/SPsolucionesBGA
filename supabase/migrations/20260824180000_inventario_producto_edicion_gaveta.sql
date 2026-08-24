-- Auditoría de edición y gaveta cuando el producto está en Bodega
ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS gaveta text,
  ADD COLUMN IF NOT EXISTS editado_por text,
  ADD COLUMN IF NOT EXISTS motivo_edicion text,
  ADD COLUMN IF NOT EXISTS editado_at timestamptz;

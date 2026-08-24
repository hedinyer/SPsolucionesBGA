-- Historial de novedades, anotaciones y auditoría por producto de inventario

CREATE TABLE IF NOT EXISTS public.inventario_producto_novedades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id bigint NOT NULL REFERENCES public.inventario_productos(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('anotacion', 'edicion', 'eliminacion', 'creacion')),
  autor       text NOT NULL,
  contenido   text NOT NULL,
  detalle     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventario_producto_novedades_producto
  ON public.inventario_producto_novedades (producto_id, created_at DESC);

COMMENT ON TABLE public.inventario_producto_novedades IS
  'Anotaciones y historial de cambios por producto de inventario.';

GRANT SELECT, INSERT ON public.inventario_producto_novedades TO anon, authenticated;

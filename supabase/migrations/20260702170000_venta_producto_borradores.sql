-- Borradores de carrito POS (móvil → escritorio vía código de 6 dígitos)

CREATE TABLE IF NOT EXISTS public.venta_producto_borradores (
  code         char(6) PRIMARY KEY,
  items        jsonb NOT NULL,
  created_by   bigint REFERENCES public.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '4 hours'
);

CREATE INDEX IF NOT EXISTS idx_venta_producto_borradores_expires
  ON public.venta_producto_borradores (expires_at);

COMMENT ON TABLE public.venta_producto_borradores IS
  'Carrito temporal escaneado en móvil; se carga en caja con el código de 6 dígitos.';

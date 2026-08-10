-- Ventas de productos de inventario en mostrador (POS)

CREATE TABLE IF NOT EXISTS public.ventas_producto (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nombre   text NOT NULL,
  cliente_cedula   text,
  cliente_celular  text NOT NULL,
  total            integer NOT NULL CHECK (total >= 0),
  monto_pagado     integer NOT NULL DEFAULT 0 CHECK (monto_pagado >= 0),
  notas            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venta_producto_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id         uuid NOT NULL REFERENCES public.ventas_producto(id) ON DELETE CASCADE,
  producto_id      bigint NOT NULL REFERENCES public.inventario_productos(id) ON DELETE RESTRICT,
  cantidad         integer NOT NULL CHECK (cantidad > 0),
  precio_unitario  integer NOT NULL CHECK (precio_unitario >= 0),
  subtotal         integer NOT NULL CHECK (subtotal >= 0),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ventas_producto_created
  ON public.ventas_producto (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_venta_producto_items_venta
  ON public.venta_producto_items (venta_id);

COMMENT ON TABLE public.ventas_producto IS
  'Ventas de repuestos/productos de inventario en mostrador.';

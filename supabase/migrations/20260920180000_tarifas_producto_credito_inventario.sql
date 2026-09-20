-- Productos a crédito desde inventario + talonario diario propio

ALTER TABLE public.compra_productos_credito
  ADD COLUMN IF NOT EXISTS inventario_producto_id bigint
    REFERENCES public.inventario_productos(id) ON DELETE SET NULL;

ALTER TABLE public.compra_productos_credito
  ADD COLUMN IF NOT EXISTS ubicacion text
    CHECK (ubicacion IS NULL OR ubicacion IN ('Soluciones', 'Bera', 'Bodega'));

CREATE INDEX IF NOT EXISTS idx_compra_productos_credito_inventario
  ON public.compra_productos_credito (inventario_producto_id);

CREATE TABLE IF NOT EXISTS public.tarifas_producto_credito (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_producto_credito_id  uuid NOT NULL
    REFERENCES public.compra_productos_credito(id) ON DELETE CASCADE,
  user_id                     bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  numero_periodo              integer NOT NULL CHECK (numero_periodo > 0),
  fecha_vencimiento           date NOT NULL,
  monto_esperado              integer NOT NULL CHECK (monto_esperado > 0),
  monto_pagado                integer CHECK (monto_pagado IS NULL OR monto_pagado > 0),
  estado                      text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'pagada', 'vencida')),
  pagada_at                   timestamptz,
  confirmada_por              text,
  notas                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (compra_producto_credito_id, numero_periodo)
);

CREATE INDEX IF NOT EXISTS idx_tarifas_producto_credito_item
  ON public.tarifas_producto_credito (compra_producto_credito_id);

CREATE INDEX IF NOT EXISTS idx_tarifas_producto_credito_user_estado
  ON public.tarifas_producto_credito (user_id, estado);

CREATE OR REPLACE FUNCTION public.set_tarifas_producto_credito_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tarifas_producto_credito_updated_at
  ON public.tarifas_producto_credito;
CREATE TRIGGER trg_tarifas_producto_credito_updated_at
  BEFORE UPDATE ON public.tarifas_producto_credito
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tarifas_producto_credito_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarifas_producto_credito TO anon, authenticated;

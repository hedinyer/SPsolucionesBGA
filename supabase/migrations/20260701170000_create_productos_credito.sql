-- Catálogo de productos vendibles a crédito (forros, accesorios, etc.)
CREATE TABLE IF NOT EXISTS public.productos_credito (
  id              bigserial PRIMARY KEY,
  nombre          text NOT NULL,
  descripcion     text,
  cuota_inicial   integer NOT NULL DEFAULT 0 CHECK (cuota_inicial >= 0),
  cuota_diaria    integer NOT NULL DEFAULT 5000 CHECK (cuota_diaria > 0),
  imagen_url      text,
  activo          boolean NOT NULL DEFAULT true,
  orden           integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productos_credito_activo
  ON public.productos_credito (activo, orden);

-- Productos a crédito ligados a la compra de moto del cliente
CREATE TABLE IF NOT EXISTS public.compra_productos_credito (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_moto_compra_id     uuid NOT NULL REFERENCES public.user_moto_compra(id) ON DELETE CASCADE,
  user_id                 bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  producto_credito_id     bigint REFERENCES public.productos_credito(id) ON DELETE SET NULL,
  nombre                  text NOT NULL,
  cuota_inicial_monto     integer NOT NULL CHECK (cuota_inicial_monto >= 0),
  cuota_diaria_monto      integer NOT NULL CHECK (cuota_diaria_monto > 0),
  cantidad                integer NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  notas                   text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compra_productos_credito_compra
  ON public.compra_productos_credito (user_moto_compra_id);

CREATE INDEX IF NOT EXISTS idx_compra_productos_credito_user
  ON public.compra_productos_credito (user_id);

CREATE OR REPLACE FUNCTION public.set_productos_credito_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_productos_credito_updated_at ON public.productos_credito;
CREATE TRIGGER trg_productos_credito_updated_at
  BEFORE UPDATE ON public.productos_credito
  FOR EACH ROW
  EXECUTE FUNCTION public.set_productos_credito_updated_at();

GRANT SELECT ON public.productos_credito TO anon, authenticated;

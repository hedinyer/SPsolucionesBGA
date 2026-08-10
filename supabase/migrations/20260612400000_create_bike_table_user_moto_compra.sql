-- Catálogo de motos (modelo + color) administrado desde software interno
CREATE TABLE IF NOT EXISTS public.bike_table (
  id              bigserial PRIMARY KEY,
  modelo          text NOT NULL,
  color           text NOT NULL,
  imagen_url      text,
  stock           integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  cuota_inicial   integer NOT NULL,
  cuota_diaria    integer NOT NULL DEFAULT 38000,
  descripcion     text,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (modelo, color)
);

CREATE INDEX IF NOT EXISTS idx_bike_table_activo_stock
  ON public.bike_table (activo, stock);

-- Selección de moto y pagos del cliente post-visita
CREATE TABLE IF NOT EXISTS public.user_moto_compra (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     bigint NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  digital_contract_id         uuid REFERENCES public.digital_contracts(id) ON DELETE SET NULL,
  bike_id                     bigint NOT NULL REFERENCES public.bike_table(id) ON DELETE RESTRICT,
  modelo                      text NOT NULL,
  color                       text NOT NULL,
  frecuencia_pago             text NOT NULL
    CHECK (frecuencia_pago IN ('diario', 'semanal', 'quincenal', 'mensual')),
  cuota_inicial_monto         integer NOT NULL,
  monto_cuota_periodo         integer NOT NULL,
  monto_total_primer_pago     integer NOT NULL,
  estado                      text NOT NULL DEFAULT 'pendiente_pago'
    CHECK (estado IN ('pendiente_pago', 'lista_retiro', 'entregada', 'cancelada')),
  pago_inicial_confirmado     boolean NOT NULL DEFAULT false,
  pago_cuota_confirmado       boolean NOT NULL DEFAULT false,
  pago_inicial_confirmado_at  timestamptz,
  pago_cuota_confirmado_at    timestamptz,
  placa                       text,
  chasis                      text,
  referencia                  text,
  fecha_entrega               date,
  admin_data                  jsonb NOT NULL DEFAULT '{}',
  seleccionado_at             timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_moto_compra_user_id ON public.user_moto_compra(user_id);
CREATE INDEX IF NOT EXISTS idx_user_moto_compra_estado ON public.user_moto_compra(estado);
CREATE INDEX IF NOT EXISTS idx_user_moto_compra_bike_id ON public.user_moto_compra(bike_id);

CREATE OR REPLACE FUNCTION public.set_bike_table_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bike_table_updated_at ON public.bike_table;
CREATE TRIGGER trg_bike_table_updated_at
  BEFORE UPDATE ON public.bike_table
  FOR EACH ROW
  EXECUTE FUNCTION public.set_bike_table_updated_at();

CREATE OR REPLACE FUNCTION public.set_user_moto_compra_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_moto_compra_updated_at ON public.user_moto_compra;
CREATE TRIGGER trg_user_moto_compra_updated_at
  BEFORE UPDATE ON public.user_moto_compra
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_moto_compra_updated_at();

-- Al confirmar ambos pagos: estado lista_retiro y reservar stock
CREATE OR REPLACE FUNCTION public.sync_compra_estado_on_pago()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pago_inicial_confirmado AND NEW.pago_cuota_confirmado THEN
    IF NOT (OLD.pago_inicial_confirmado AND OLD.pago_cuota_confirmado) THEN
      NEW.estado := 'lista_retiro';

      IF NEW.pago_inicial_confirmado_at IS NULL THEN
        NEW.pago_inicial_confirmado_at := now();
      END IF;
      IF NEW.pago_cuota_confirmado_at IS NULL THEN
        NEW.pago_cuota_confirmado_at := now();
      END IF;

      UPDATE public.bike_table
      SET stock = GREATEST(stock - 1, 0)
      WHERE id = NEW.bike_id AND stock > 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_compra_estado_on_pago ON public.user_moto_compra;
CREATE TRIGGER trg_sync_compra_estado_on_pago
  BEFORE UPDATE ON public.user_moto_compra
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_compra_estado_on_pago();

-- Sincronizar datos de moto/contrato hacia digital_contracts.admin_data
CREATE OR REPLACE FUNCTION public.sync_compra_to_contract_admin_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contract_id uuid;
  merged jsonb;
BEGIN
  contract_id := COALESCE(NEW.digital_contract_id, OLD.digital_contract_id);
  IF contract_id IS NULL THEN
    RETURN NEW;
  END IF;

  merged := jsonb_build_object(
    'moto_modelo', NEW.modelo,
    'moto_color', NEW.color,
    'frecuencia_pago', NEW.frecuencia_pago,
    'cuota_inicial', NEW.cuota_inicial_monto,
    'valor_cuota', NEW.monto_cuota_periodo,
    'monto_total_primer_pago', NEW.monto_total_primer_pago,
    'placa', NEW.placa,
    'chasis', NEW.chasis,
    'referencia', NEW.referencia,
    'fecha_entrega', NEW.fecha_entrega,
    'compra_estado', NEW.estado,
    'pago_inicial_confirmado', NEW.pago_inicial_confirmado,
    'pago_cuota_confirmado', NEW.pago_cuota_confirmado
  );

  UPDATE public.digital_contracts
  SET admin_data = COALESCE(admin_data, '{}'::jsonb) || merged,
      updated_at = now()
  WHERE id = contract_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_compra_to_contract_admin_data ON public.user_moto_compra;
CREATE TRIGGER trg_sync_compra_to_contract_admin_data
  AFTER INSERT OR UPDATE ON public.user_moto_compra
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_compra_to_contract_admin_data();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_moto_compra'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_moto_compra;
  END IF;
END $$;

ALTER TABLE public.user_moto_compra REPLICA IDENTITY FULL;

GRANT SELECT ON public.bike_table TO anon, authenticated;
GRANT SELECT, INSERT ON public.user_moto_compra TO anon, authenticated;

-- Admin operations (service_role):
-- INSERT/UPDATE/DELETE bike_table
-- UPDATE user_moto_compra SET pago_inicial_confirmado, pago_cuota_confirmado, placa, chasis, referencia, estado

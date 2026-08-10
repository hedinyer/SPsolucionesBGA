-- Ventas de moto en mostrador (registro + ticket POS)

CREATE TABLE IF NOT EXISTS public.ventas_moto (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bike_id          bigint REFERENCES public.bike_table(id) ON DELETE SET NULL,
  modelo           text NOT NULL,
  color            text NOT NULL,
  placa            text,
  chasis           text,
  cliente_nombre   text NOT NULL,
  cliente_cedula   text NOT NULL,
  cliente_celular  text NOT NULL,
  cuota_inicial    integer,
  notas            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ventas_moto_created
  ON public.ventas_moto (created_at DESC);

COMMENT ON TABLE public.ventas_moto IS
  'Ventas de moto registradas en mostrador (bandeja / POS).';

-- OCR / archivo de Licencias de Tránsito (tarjeta de propiedad)

CREATE TABLE IF NOT EXISTS public.tarjetas_propiedad (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_licencia        text,
  placa                  text,
  marca                  text,
  linea                  text,
  modelo                 text,
  cilindrada             text,
  color                  text,
  servicio               text,
  clase_vehiculo         text,
  tipo_carroceria        text,
  combustible            text,
  capacidad              text,
  numero_motor           text,
  motor_reg              text,
  vin                    text,
  numero_serie           text,
  serie_reg              text,
  numero_chasis          text,
  chasis_reg             text,
  propietario            text,
  identificacion_tipo    text,
  identificacion_numero  text,
  imagen_url             text NOT NULL,
  raw_ocr_text           text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tarjetas_propiedad_placa_unique
  ON public.tarjetas_propiedad (placa)
  WHERE placa IS NOT NULL AND placa <> '';

CREATE INDEX IF NOT EXISTS idx_tarjetas_propiedad_created
  ON public.tarjetas_propiedad (created_at DESC);

COMMENT ON TABLE public.tarjetas_propiedad IS
  'Datos extraídos por OCR de Licencias de Tránsito (tarjeta de propiedad).';

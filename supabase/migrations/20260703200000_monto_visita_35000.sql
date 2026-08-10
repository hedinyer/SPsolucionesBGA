-- Visita domiciliaria: referencia $35.000 (antes $50.000)

ALTER TABLE public.bike_table
  ALTER COLUMN monto_visita SET DEFAULT 35000;

UPDATE public.bike_table
SET monto_visita = 35000
WHERE monto_visita = 50000;

UPDATE public.user_moto_compra
SET
  monto_visita_monto = 35000,
  monto_total_primer_pago =
    cuota_inicial_monto + monto_cuota_periodo + 35000
WHERE monto_visita_monto = 50000;

-- Linda (1013661114) y Adonys (1106310912)
UPDATE public.user_moto_compra
SET
  monto_visita_monto = 35000,
  monto_total_primer_pago =
    cuota_inicial_monto + monto_cuota_periodo + 35000
WHERE user_id IN (11, 23);

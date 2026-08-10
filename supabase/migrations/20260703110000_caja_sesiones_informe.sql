-- Informe de cierre guardado al cerrar la caja (desglose por medio de pago)

ALTER TABLE public.caja_sesiones
  ADD COLUMN IF NOT EXISTS informe_cierre jsonb;

COMMENT ON COLUMN public.caja_sesiones.informe_cierre IS
  'Snapshot del informe de ingresos al cerrar (efectivo, Nequi, Davivienda, etc.).';

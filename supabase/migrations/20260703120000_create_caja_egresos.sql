-- Pagos / egresos de caja (dinero que sale)

CREATE TABLE IF NOT EXISTS public.caja_egresos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id     uuid NOT NULL REFERENCES public.caja_sesiones(id) ON DELETE CASCADE,
  concepto      text NOT NULL,
  beneficiario  text,
  monto         integer NOT NULL CHECK (monto > 0),
  medio_pago    text NOT NULL CHECK (medio_pago IN ('efectivo', 'nequi', 'davivienda')),
  notas         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    bigint REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_caja_egresos_sesion
  ON public.caja_egresos (sesion_id, created_at);

COMMENT ON TABLE public.caja_egresos IS
  'Pagos y gastos registrados durante la sesión de caja (dinero que sale).';

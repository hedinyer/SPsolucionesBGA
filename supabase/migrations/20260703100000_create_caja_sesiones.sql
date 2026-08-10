-- Cuadre de caja: apertura/cierre diario y movimientos de efectivo

CREATE TABLE IF NOT EXISTS public.caja_sesiones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha            date NOT NULL,
  monto_apertura   integer NOT NULL CHECK (monto_apertura >= 0),
  monto_cierre     integer CHECK (monto_cierre IS NULL OR monto_cierre >= 0),
  notas_apertura   text,
  notas_cierre     text,
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  opened_by        bigint REFERENCES public.users(id),
  closed_by        bigint REFERENCES public.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_caja_sesiones_fecha
  ON public.caja_sesiones (fecha);

CREATE INDEX IF NOT EXISTS idx_caja_sesiones_opened
  ON public.caja_sesiones (opened_at DESC);

CREATE TABLE IF NOT EXISTS public.caja_movimientos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id   uuid NOT NULL REFERENCES public.caja_sesiones(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  monto       integer NOT NULL CHECK (monto > 0),
  concepto    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  bigint REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_sesion
  ON public.caja_movimientos (sesion_id, created_at);

COMMENT ON TABLE public.caja_sesiones IS
  'Sesión diaria de caja: apertura al inicio del día y cierre al final.';
COMMENT ON TABLE public.caja_movimientos IS
  'Entradas y salidas manuales de efectivo durante la sesión de caja.';

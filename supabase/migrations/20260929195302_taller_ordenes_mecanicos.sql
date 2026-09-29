-- Mecánicos del taller
CREATE TABLE IF NOT EXISTS public.mecanicos (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  telefono text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mecanicos_activo ON public.mecanicos (activo) WHERE activo = true;

-- Órdenes de taller (cliente o particular)
CREATE TABLE IF NOT EXISTS public.ordenes_taller (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  user_moto_compra_id uuid REFERENCES public.user_moto_compra(id) ON DELETE SET NULL,
  placa text,
  modelo text NOT NULL,
  color text,
  contacto_nombre text,
  contacto_telefono text,
  descripcion_falla text,
  mecanico_id integer REFERENCES public.mecanicos(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'recibida'
    CHECK (estado IN (
      'recibida', 'en_reparacion', 'esperando_repuestos',
      'repuestos_rechazados', 'lista', 'entregada', 'cancelada'
    )),
  timer_running boolean NOT NULL DEFAULT false,
  timer_started_at timestamptz,
  segundos_acumulados integer NOT NULL DEFAULT 0 CHECK (segundos_acumulados >= 0),
  notas text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_taller_estado ON public.ordenes_taller (estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_taller_mecanico ON public.ordenes_taller (mecanico_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_taller_created ON public.ordenes_taller (created_at DESC);

-- Zonas / partes de la moto con notas de trabajo
CREATE TABLE IF NOT EXISTS public.orden_taller_zonas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_taller(id) ON DELETE CASCADE,
  zona text NOT NULL,
  nota text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (orden_id, zona)
);

CREATE INDEX IF NOT EXISTS idx_orden_taller_zonas_orden ON public.orden_taller_zonas (orden_id);

-- Repuestos solicitados (sin descuento hasta aprobación)
CREATE TABLE IF NOT EXISTS public.orden_taller_repuestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes_taller(id) ON DELETE CASCADE,
  producto_id integer NOT NULL REFERENCES public.inventario_productos(id),
  cantidad integer NOT NULL CHECK (cantidad > 0),
  estado text NOT NULL DEFAULT 'solicitado'
    CHECK (estado IN ('solicitado', 'aprobado', 'rechazado')),
  motivo_rechazo text,
  costo_unitario integer,
  notas text,
  created_by text,
  aprobado_por text,
  aprobado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orden_taller_repuestos_orden ON public.orden_taller_repuestos (orden_id);
CREATE INDEX IF NOT EXISTS idx_orden_taller_repuestos_estado ON public.orden_taller_repuestos (estado);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mecanicos_updated_at ON public.mecanicos;
CREATE TRIGGER trg_mecanicos_updated_at
  BEFORE UPDATE ON public.mecanicos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ordenes_taller_updated_at ON public.ordenes_taller;
CREATE TRIGGER trg_ordenes_taller_updated_at
  BEFORE UPDATE ON public.ordenes_taller
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_orden_taller_zonas_updated_at ON public.orden_taller_zonas;
CREATE TRIGGER trg_orden_taller_zonas_updated_at
  BEFORE UPDATE ON public.orden_taller_zonas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_orden_taller_repuestos_updated_at ON public.orden_taller_repuestos;
CREATE TRIGGER trg_orden_taller_repuestos_updated_at
  BEFORE UPDATE ON public.orden_taller_repuestos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

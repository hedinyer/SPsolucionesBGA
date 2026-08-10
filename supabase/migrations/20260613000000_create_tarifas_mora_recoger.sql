-- Tarifas recurrentes post-entrega, mora y motos para recoger

CREATE TABLE IF NOT EXISTS public.tarifas_pagadas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_moto_compra_id   uuid NOT NULL REFERENCES public.user_moto_compra(id) ON DELETE CASCADE,
  user_id               bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  numero_periodo        integer NOT NULL CHECK (numero_periodo > 0),
  fecha_vencimiento     date NOT NULL,
  monto_esperado        integer NOT NULL CHECK (monto_esperado > 0),
  monto_pagado          integer CHECK (monto_pagado IS NULL OR monto_pagado > 0),
  estado                text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'pagada', 'vencida')),
  pagada_at             timestamptz,
  confirmada_por        text,
  notas                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_moto_compra_id, numero_periodo)
);

CREATE INDEX IF NOT EXISTS idx_tarifas_pagadas_user_estado
  ON public.tarifas_pagadas (user_id, estado);

CREATE INDEX IF NOT EXISTS idx_tarifas_pagadas_vencimiento_estado
  ON public.tarifas_pagadas (fecha_vencimiento, estado);

CREATE INDEX IF NOT EXISTS idx_tarifas_pagadas_compra
  ON public.tarifas_pagadas (user_moto_compra_id);

CREATE TABLE IF NOT EXISTS public.morosos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_moto_compra_id   uuid NOT NULL UNIQUE REFERENCES public.user_moto_compra(id) ON DELETE CASCADE,
  user_id               bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tarifa_vencida_id     uuid REFERENCES public.tarifas_pagadas(id) ON DELETE SET NULL,
  dias_atraso           integer NOT NULL CHECK (dias_atraso >= 3),
  monto_adeudado        integer NOT NULL DEFAULT 0,
  estado                text NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo', 'regularizado')),
  fecha_ingreso         timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_morosos_estado
  ON public.morosos (estado);

CREATE INDEX IF NOT EXISTS idx_morosos_user_id
  ON public.morosos (user_id);

CREATE TABLE IF NOT EXISTS public.motos_para_recoger (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_moto_compra_id   uuid NOT NULL UNIQUE REFERENCES public.user_moto_compra(id) ON DELETE CASCADE,
  moroso_id             uuid REFERENCES public.morosos(id) ON DELETE SET NULL,
  user_id               bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  dias_atraso           integer NOT NULL CHECK (dias_atraso >= 4),
  monto_adeudado        integer NOT NULL DEFAULT 0,
  estado                text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'asignada', 'recogida', 'cancelada')),
  fecha_ingreso         timestamptz NOT NULL DEFAULT now(),
  fecha_recogida        timestamptz,
  notas                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_motos_para_recoger_estado
  ON public.motos_para_recoger (estado);

CREATE INDEX IF NOT EXISTS idx_motos_para_recoger_user_id
  ON public.motos_para_recoger (user_id);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.set_tarifas_pagadas_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tarifas_pagadas_updated_at ON public.tarifas_pagadas;
CREATE TRIGGER trg_tarifas_pagadas_updated_at
  BEFORE UPDATE ON public.tarifas_pagadas
  FOR EACH ROW EXECUTE FUNCTION public.set_tarifas_pagadas_updated_at();

CREATE OR REPLACE FUNCTION public.set_morosos_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_morosos_updated_at ON public.morosos;
CREATE TRIGGER trg_morosos_updated_at
  BEFORE UPDATE ON public.morosos
  FOR EACH ROW EXECUTE FUNCTION public.set_morosos_updated_at();

CREATE OR REPLACE FUNCTION public.set_motos_para_recoger_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_motos_para_recoger_updated_at ON public.motos_para_recoger;
CREATE TRIGGER trg_motos_para_recoger_updated_at
  BEFORE UPDATE ON public.motos_para_recoger
  FOR EACH ROW EXECUTE FUNCTION public.set_motos_para_recoger_updated_at();

-- Period count and interval by payment frequency
CREATE OR REPLACE FUNCTION public.tarifa_period_config(p_frecuencia text)
RETURNS TABLE(total_periodos integer, dias_intervalo integer)
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN QUERY SELECT
    CASE p_frecuencia
      WHEN 'diario' THEN 365
      WHEN 'semanal' THEN 52
      WHEN 'quincenal' THEN 24
      WHEN 'mensual' THEN 12
      ELSE 365
    END,
    CASE p_frecuencia
      WHEN 'diario' THEN 1
      WHEN 'semanal' THEN 7
      WHEN 'quincenal' THEN 15
      WHEN 'mensual' THEN 30
      ELSE 1
    END;
END;
$$;

-- Generate payment schedule for a delivered purchase
CREATE OR REPLACE FUNCTION public.generate_tarifas_for_compra(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra record;
  v_total integer;
  v_intervalo integer;
  v_fecha_base date;
  v_i integer;
BEGIN
  SELECT *
  INTO v_compra
  FROM public.user_moto_compra
  WHERE id = p_compra_id;

  IF v_compra IS NULL OR v_compra.estado <> 'entregada' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tarifas_pagadas WHERE user_moto_compra_id = p_compra_id
  ) THEN
    RETURN;
  END IF;

  SELECT total_periodos, dias_intervalo
  INTO v_total, v_intervalo
  FROM public.tarifa_period_config(v_compra.frecuencia_pago);

  v_fecha_base := COALESCE(v_compra.fecha_entrega, CURRENT_DATE);

  FOR v_i IN 1..v_total LOOP
    INSERT INTO public.tarifas_pagadas (
      user_moto_compra_id,
      user_id,
      numero_periodo,
      fecha_vencimiento,
      monto_esperado,
      monto_pagado,
      estado,
      pagada_at,
      confirmada_por,
      notas
    ) VALUES (
      v_compra.id,
      v_compra.user_id,
      v_i,
      v_fecha_base + (v_i * v_intervalo),
      v_compra.monto_cuota_periodo,
      CASE WHEN v_i = 1 THEN v_compra.monto_cuota_periodo ELSE NULL END,
      CASE WHEN v_i = 1 THEN 'pagada' ELSE 'pendiente' END,
      CASE WHEN v_i = 1 THEN COALESCE(v_compra.pago_cuota_confirmado_at, now()) ELSE NULL END,
      CASE WHEN v_i = 1 THEN 'sistema' ELSE NULL END,
      CASE WHEN v_i = 1 THEN 'Cuota adelantada al retiro' ELSE NULL END
    );
  END LOOP;
END;
$$;

-- Trigger: generate tarifas when moto is marked delivered
CREATE OR REPLACE FUNCTION public.generate_tarifas_on_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'entregada'
     AND (OLD.estado IS DISTINCT FROM 'entregada') THEN
    PERFORM public.generate_tarifas_for_compra(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_tarifas_on_entrega ON public.user_moto_compra;
CREATE TRIGGER trg_generate_tarifas_on_entrega
  AFTER UPDATE ON public.user_moto_compra
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_tarifas_on_entrega();

-- Regularize mora when all overdue tarifas are paid
CREATE OR REPLACE FUNCTION public.sync_mora_on_tarifa_pagada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vencidas integer;
BEGIN
  IF NEW.estado = 'pagada' AND OLD.estado IS DISTINCT FROM 'pagada' THEN
    SELECT COUNT(*)
    INTO v_vencidas
    FROM public.tarifas_pagadas
    WHERE user_moto_compra_id = NEW.user_moto_compra_id
      AND estado = 'vencida';

    IF v_vencidas = 0 THEN
      UPDATE public.morosos
      SET estado = 'regularizado', updated_at = now()
      WHERE user_moto_compra_id = NEW.user_moto_compra_id
        AND estado = 'activo';

      UPDATE public.motos_para_recoger
      SET estado = 'cancelada', updated_at = now()
      WHERE user_moto_compra_id = NEW.user_moto_compra_id
        AND estado IN ('pendiente', 'asignada');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_mora_on_tarifa_pagada ON public.tarifas_pagadas;
CREATE TRIGGER trg_sync_mora_on_tarifa_pagada
  AFTER UPDATE ON public.tarifas_pagadas
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_mora_on_tarifa_pagada();

-- Daily mora evaluation (also callable manually)
CREATE OR REPLACE FUNCTION public.evaluar_mora_diaria()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra record;
  v_tarifa record;
  v_dias integer;
  v_monto integer;
  v_moroso_id uuid;
  v_today date;
BEGIN
  v_today := (now() AT TIME ZONE 'America/Bogota')::date;

  -- Mark overdue pending tarifas as vencida
  UPDATE public.tarifas_pagadas
  SET estado = 'vencida', updated_at = now()
  WHERE estado = 'pendiente'
    AND fecha_vencimiento < v_today;

  -- Process each delivered compra with unpaid overdue tarifas
  FOR v_compra IN
    SELECT DISTINCT c.id, c.user_id
    FROM public.user_moto_compra c
    INNER JOIN public.tarifas_pagadas t ON t.user_moto_compra_id = c.id
    WHERE c.estado = 'entregada'
      AND t.estado = 'vencida'
  LOOP
    SELECT t.id, t.fecha_vencimiento, t.monto_esperado
    INTO v_tarifa
    FROM public.tarifas_pagadas t
    WHERE t.user_moto_compra_id = v_compra.id
      AND t.estado = 'vencida'
    ORDER BY t.fecha_vencimiento ASC
    LIMIT 1;

    IF v_tarifa IS NULL THEN
      CONTINUE;
    END IF;

    v_dias := v_today - v_tarifa.fecha_vencimiento;

    SELECT COALESCE(SUM(monto_esperado), 0)
    INTO v_monto
    FROM public.tarifas_pagadas
    WHERE user_moto_compra_id = v_compra.id
      AND estado = 'vencida';

    -- Day 3+: morosos
    IF v_dias >= 3 THEN
      INSERT INTO public.morosos (
        user_moto_compra_id,
        user_id,
        tarifa_vencida_id,
        dias_atraso,
        monto_adeudado,
        estado
      ) VALUES (
        v_compra.id,
        v_compra.user_id,
        v_tarifa.id,
        v_dias,
        v_monto,
        'activo'
      )
      ON CONFLICT (user_moto_compra_id) DO UPDATE SET
        tarifa_vencida_id = EXCLUDED.tarifa_vencida_id,
        dias_atraso = EXCLUDED.dias_atraso,
        monto_adeudado = EXCLUDED.monto_adeudado,
        estado = CASE
          WHEN public.morosos.estado = 'regularizado' THEN 'activo'
          ELSE public.morosos.estado
        END,
        updated_at = now()
      RETURNING id INTO v_moroso_id;

      IF v_moroso_id IS NULL THEN
        SELECT id INTO v_moroso_id
        FROM public.morosos
        WHERE user_moto_compra_id = v_compra.id;
      END IF;
    END IF;

    -- Day 4+: motos para recoger + auto GPS
    IF v_dias >= 4 THEN
      INSERT INTO public.motos_para_recoger (
        user_moto_compra_id,
        moroso_id,
        user_id,
        dias_atraso,
        monto_adeudado,
        estado
      ) VALUES (
        v_compra.id,
        v_moroso_id,
        v_compra.user_id,
        v_dias,
        v_monto,
        'pendiente'
      )
      ON CONFLICT (user_moto_compra_id) DO UPDATE SET
        moroso_id = EXCLUDED.moroso_id,
        dias_atraso = EXCLUDED.dias_atraso,
        monto_adeudado = EXCLUDED.monto_adeudado,
        estado = CASE
          WHEN public.motos_para_recoger.estado IN ('recogida', 'cancelada')
            THEN public.motos_para_recoger.estado
          ELSE 'pendiente'
        END,
        updated_at = now();

      UPDATE public.users_tracking
      SET seguimiento = true, updated_at = now()
      WHERE user_id = v_compra.user_id;
    END IF;
  END LOOP;
END;
$$;

-- Retroactive: generate tarifas for already-delivered purchases
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id FROM public.user_moto_compra WHERE estado = 'entregada'
  LOOP
    PERFORM public.generate_tarifas_for_compra(v_id);
  END LOOP;
END;
$$;

-- pg_cron daily job (6 AM Colombia = 11 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evaluar_mora_diaria') THEN
    PERFORM cron.unschedule('evaluar_mora_diaria');
  END IF;
END;
$$;

SELECT cron.schedule(
  'evaluar_mora_diaria',
  '0 11 * * *',
  $$SELECT public.evaluar_mora_diaria()$$
);

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tarifas_pagadas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tarifas_pagadas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'morosos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.morosos;
  END IF;
END;
$$;

ALTER TABLE public.tarifas_pagadas REPLICA IDENTITY FULL;
ALTER TABLE public.morosos REPLICA IDENTITY FULL;

-- Permissions
GRANT SELECT ON public.tarifas_pagadas TO anon, authenticated;
GRANT SELECT ON public.morosos TO anon, authenticated;
GRANT SELECT ON public.motos_para_recoger TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.evaluar_mora_diaria() TO service_role;

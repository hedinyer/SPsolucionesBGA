-- Pagos recurrentes (transacciones reales) y vista de atrasos

-- ---------------------------------------------------------------------------
-- Tabla pagos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pagos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_moto_compra_id   uuid NOT NULL REFERENCES public.user_moto_compra(id) ON DELETE CASCADE,
  user_id               bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  monto                 integer NOT NULL CHECK (monto > 0),
  dias_cubiertos        integer CHECK (dias_cubiertos IS NULL OR dias_cubiertos > 0),

  medio_pago_usuario    text NOT NULL
    CHECK (medio_pago_usuario IN ('nequi', 'davivienda')),

  medio_pago_admin      text
    CHECK (medio_pago_admin IN (
      'nequi_nicolas', 'nequi_pedro', 'nequi_marisol', 'davivienda'
    )),

  referencia            text,
  comprobante_url       text,

  origen                text NOT NULL DEFAULT 'usuario'
    CHECK (origen IN ('usuario', 'admin')),

  estado                text NOT NULL DEFAULT 'pendiente_confirmacion'
    CHECK (estado IN ('pendiente_confirmacion', 'confirmado', 'rechazado')),

  reportado_at          timestamptz NOT NULL DEFAULT now(),
  confirmado_at         timestamptz,
  confirmado_por        text,
  rechazado_at          timestamptz,
  motivo_rechazo        text,
  notas_admin           text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_user_id
  ON public.pagos (user_id);

CREATE INDEX IF NOT EXISTS idx_pagos_compra_estado
  ON public.pagos (user_moto_compra_id, estado);

CREATE INDEX IF NOT EXISTS idx_pagos_estado_reportado
  ON public.pagos (estado, reportado_at DESC);

-- ---------------------------------------------------------------------------
-- Tabla puente pago ↔ tarifa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pago_tarifa_aplicaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id         uuid NOT NULL REFERENCES public.pagos(id) ON DELETE CASCADE,
  tarifa_id       uuid NOT NULL REFERENCES public.tarifas_pagadas(id) ON DELETE CASCADE,
  monto_aplicado  integer NOT NULL CHECK (monto_aplicado > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pago_id, tarifa_id)
);

CREATE INDEX IF NOT EXISTS idx_pago_tarifa_aplicaciones_pago
  ON public.pago_tarifa_aplicaciones (pago_id);

CREATE INDEX IF NOT EXISTS idx_pago_tarifa_aplicaciones_tarifa
  ON public.pago_tarifa_aplicaciones (tarifa_id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_pagos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pagos_updated_at ON public.pagos;
CREATE TRIGGER trg_pagos_updated_at
  BEFORE UPDATE ON public.pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_pagos_updated_at();

-- ---------------------------------------------------------------------------
-- Validación de reglas de negocio en pagos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_pago()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Admin: derivar medio visible al usuario desde la cuenta exacta
  IF NEW.origen = 'admin' AND NEW.medio_pago_admin IS NOT NULL THEN
    IF NEW.medio_pago_admin = 'davivienda' THEN
      NEW.medio_pago_usuario := 'davivienda';
    ELSE
      NEW.medio_pago_usuario := 'nequi';
    END IF;
  END IF;

  IF NEW.origen = 'usuario' AND NEW.comprobante_url IS NULL THEN
    RAISE EXCEPTION 'Los pagos reportados por el usuario requieren comprobante_url';
  END IF;

  IF NEW.estado = 'confirmado' THEN
    IF NEW.medio_pago_admin IS NULL THEN
      RAISE EXCEPTION 'Un pago confirmado requiere medio_pago_admin';
    END IF;
    IF NEW.confirmado_at IS NULL THEN
      NEW.confirmado_at := now();
    END IF;
  END IF;

  IF NEW.estado = 'rechazado' AND NEW.rechazado_at IS NULL THEN
    NEW.rechazado_at := now();
  END IF;

  IF NEW.origen = 'admin'
     AND NEW.estado = 'confirmado'
     AND TG_OP = 'INSERT'
     AND NEW.confirmado_por IS NULL THEN
    NEW.confirmado_por := 'admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_pago ON public.pagos;
CREATE TRIGGER trg_validate_pago
  BEFORE INSERT OR UPDATE ON public.pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_pago();

-- ---------------------------------------------------------------------------
-- Aplicar pago confirmado sobre tarifas_pagadas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_pago_confirmado(p_pago_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago record;
  v_compra record;
  v_dias_intervalo integer;
  v_cuota_diaria integer;
  v_dias_cubiertos integer;
  v_periodos_a_aplicar integer;
  v_monto_restante integer;
  v_tarifa record;
  v_aplicado integer;
  v_excedente integer;
  v_notas text;
  v_periodos_marcados integer := 0;
BEGIN
  SELECT *
  INTO v_pago
  FROM public.pagos
  WHERE id = p_pago_id;

  IF v_pago IS NULL THEN
    RAISE EXCEPTION 'Pago no encontrado: %', p_pago_id;
  END IF;

  IF v_pago.estado <> 'confirmado' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pago_tarifa_aplicaciones WHERE pago_id = p_pago_id
  ) THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_compra
  FROM public.user_moto_compra
  WHERE id = v_pago.user_moto_compra_id;

  IF v_compra IS NULL THEN
    RAISE EXCEPTION 'Compra no encontrada para el pago %', p_pago_id;
  END IF;

  SELECT dias_intervalo
  INTO v_dias_intervalo
  FROM public.tarifa_period_config(v_compra.frecuencia_pago);

  v_cuota_diaria := v_compra.monto_cuota_periodo / v_dias_intervalo;

  IF v_cuota_diaria <= 0 THEN
    RAISE EXCEPTION 'Cuota diaria inválida para compra %', v_compra.id;
  END IF;

  v_dias_cubiertos := FLOOR(v_pago.monto::numeric / v_cuota_diaria::numeric)::integer;

  IF v_dias_cubiertos <= 0 AND v_pago.dias_cubiertos IS NULL THEN
    RAISE EXCEPTION 'El monto % no cubre ningún día (cuota diaria %)',
      v_pago.monto, v_cuota_diaria;
  END IF;

  -- dias_cubiertos explícito = cantidad de periodos (tarifas) a marcar
  -- si no, convertir días calculados del monto a periodos según frecuencia
  v_periodos_a_aplicar := COALESCE(
    v_pago.dias_cubiertos,
    GREATEST(1, CEIL(v_dias_cubiertos::numeric / v_dias_intervalo::numeric)::integer)
  );

  v_monto_restante := v_pago.monto;
  v_excedente := 0;

  v_notas := trim(both ' ' FROM concat_ws(
    ' · ',
    CASE WHEN v_pago.referencia IS NOT NULL
      THEN 'Ref: ' || v_pago.referencia
      ELSE NULL
    END,
    'Pago ' || left(p_pago_id::text, 8)
  ));

  FOR v_tarifa IN
    SELECT id, monto_esperado, estado
    FROM public.tarifas_pagadas
    WHERE user_moto_compra_id = v_pago.user_moto_compra_id
      AND estado IN ('pendiente', 'vencida')
    ORDER BY fecha_vencimiento ASC
    LIMIT v_periodos_a_aplicar
  LOOP
    IF v_monto_restante < v_tarifa.monto_esperado THEN
      EXIT;
    END IF;

    v_aplicado := v_tarifa.monto_esperado;

    UPDATE public.tarifas_pagadas
    SET
      estado = 'pagada',
      monto_pagado = v_aplicado,
      pagada_at = COALESCE(v_pago.confirmado_at, now()),
      confirmada_por = COALESCE(v_pago.confirmado_por, 'pago'),
      notas = COALESCE(v_notas, notas),
      updated_at = now()
    WHERE id = v_tarifa.id;

    INSERT INTO public.pago_tarifa_aplicaciones (pago_id, tarifa_id, monto_aplicado)
    VALUES (p_pago_id, v_tarifa.id, v_aplicado);

    v_monto_restante := v_monto_restante - v_aplicado;
    v_periodos_marcados := v_periodos_marcados + 1;
  END LOOP;

  IF v_monto_restante > 0 THEN
    v_excedente := v_monto_restante;
    UPDATE public.pagos
    SET notas_admin = trim(both ' ' FROM concat_ws(
      ' · ',
      notas_admin,
      'Excedente no aplicado: $' || v_excedente::text
    ))
    WHERE id = p_pago_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_aplicar_pago_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'confirmado'
     AND (
       TG_OP = 'INSERT'
       OR OLD.estado IS DISTINCT FROM 'confirmado'
     ) THEN
    PERFORM public.aplicar_pago_confirmado(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aplicar_pago_on_confirm ON public.pagos;
CREATE TRIGGER trg_aplicar_pago_on_confirm
  AFTER INSERT OR UPDATE ON public.pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_aplicar_pago_on_confirm();

-- ---------------------------------------------------------------------------
-- Vista atrasos (se recalcula al consultar / cuando cambian tarifas)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.atrasos
WITH (security_invoker = true) AS
SELECT
  c.id AS user_moto_compra_id,
  c.user_id,
  t.id AS tarifa_vencida_id,
  t.fecha_vencimiento AS fecha_desde_atraso,
  CASE
    WHEN t.id IS NULL THEN 0
    ELSE GREATEST(0, (tz.v_today - t.fecha_vencimiento))
  END AS dias_atraso,
  COALESCE(adeudado.monto_adeudado, 0) AS monto_adeudado,
  CASE
    WHEN t.id IS NULL THEN 'al_dia'
    WHEN (tz.v_today - t.fecha_vencimiento) >= 3 THEN 'moroso'
    WHEN (tz.v_today - t.fecha_vencimiento) >= 1 THEN 'vencido'
    ELSE 'al_dia'
  END AS estado
FROM public.user_moto_compra c
CROSS JOIN LATERAL (
  SELECT (now() AT TIME ZONE 'America/Bogota')::date AS v_today
) tz
LEFT JOIN LATERAL (
  SELECT id, fecha_vencimiento
  FROM public.tarifas_pagadas
  WHERE user_moto_compra_id = c.id
    AND estado = 'vencida'
  ORDER BY fecha_vencimiento ASC
  LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(monto_esperado), 0) AS monto_adeudado
  FROM public.tarifas_pagadas
  WHERE user_moto_compra_id = c.id
    AND estado = 'vencida'
) adeudado ON true
WHERE c.estado = 'entregada';

-- ---------------------------------------------------------------------------
-- Storage: comprobantes de pago
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pagos-comprobantes',
  'pagos-comprobantes',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow public read pagos comprobantes'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow public read pagos comprobantes"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'pagos-comprobantes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow upload pagos comprobantes'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow upload pagos comprobantes"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'pagos-comprobantes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow update pagos comprobantes'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow update pagos comprobantes"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'pagos-comprobantes');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pagos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pagos;
  END IF;
END $$;

ALTER TABLE public.pagos REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON public.pagos TO anon, authenticated;
GRANT SELECT ON public.pago_tarifa_aplicaciones TO anon, authenticated;
GRANT SELECT ON public.atrasos TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.aplicar_pago_confirmado(uuid) TO service_role;

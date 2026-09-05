-- Primer pago en caja: adelantada libre (monto_cuota_adelantada),
-- cobros agrupados (pagos.cobro_grupo_id), sync flags incluye visita.

ALTER TABLE public.user_moto_compra
  ADD COLUMN IF NOT EXISTS monto_cuota_adelantada integer;

UPDATE public.user_moto_compra
SET monto_cuota_adelantada = CASE
  WHEN COALESCE((admin_data->>'cobra_cuota_adelantada')::boolean, true) = false
    THEN 0
  ELSE COALESCE(monto_cuota_periodo, 0)
END
WHERE monto_cuota_adelantada IS NULL;

ALTER TABLE public.user_moto_compra
  ALTER COLUMN monto_cuota_adelantada SET DEFAULT 0,
  ALTER COLUMN monto_cuota_adelantada SET NOT NULL;

ALTER TABLE public.user_moto_compra
  DROP CONSTRAINT IF EXISTS user_moto_compra_monto_cuota_adelantada_check;

ALTER TABLE public.user_moto_compra
  ADD CONSTRAINT user_moto_compra_monto_cuota_adelantada_check
  CHECK (monto_cuota_adelantada >= 0);

ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS cobro_grupo_id uuid;

CREATE INDEX IF NOT EXISTS idx_pagos_cobro_grupo_id
  ON public.pagos (cobro_grupo_id)
  WHERE cobro_grupo_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_compra_pago_flags(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra record;
  v_sum_inicial integer;
  v_sum_cuota integer;
  v_sum_visita integer;
  v_inicial_ok boolean;
  v_cuota_ok boolean;
  v_visita_ok boolean;
  v_monto_adelantada integer;
BEGIN
  SELECT *
  INTO v_compra
  FROM public.user_moto_compra
  WHERE id = p_compra_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_compra.estado NOT IN ('pendiente_pago', 'lista_retiro') THEN
    RETURN;
  END IF;

  v_monto_adelantada := COALESCE(v_compra.monto_cuota_adelantada, 0);
  IF v_compra.monto_cuota_adelantada IS NULL THEN
    IF COALESCE((v_compra.admin_data->>'cobra_cuota_adelantada')::boolean, true) = false THEN
      v_monto_adelantada := 0;
    ELSE
      v_monto_adelantada := COALESCE(v_compra.monto_cuota_periodo, 0);
    END IF;
  END IF;

  SELECT COALESCE(SUM(monto), 0)
  INTO v_sum_inicial
  FROM public.pagos
  WHERE user_moto_compra_id = p_compra_id
    AND contexto_pago = 'inicial'
    AND estado = 'confirmado';

  SELECT COALESCE(SUM(monto), 0)
  INTO v_sum_cuota
  FROM public.pagos
  WHERE user_moto_compra_id = p_compra_id
    AND contexto_pago = 'cuota_adelantada'
    AND estado = 'confirmado';

  SELECT COALESCE(SUM(monto), 0)
  INTO v_sum_visita
  FROM public.pagos
  WHERE user_moto_compra_id = p_compra_id
    AND contexto_pago = 'visita'
    AND estado = 'confirmado';

  v_inicial_ok := v_sum_inicial >= COALESCE(v_compra.cuota_inicial_monto, 0);
  v_cuota_ok := v_sum_cuota >= v_monto_adelantada;
  v_visita_ok :=
    COALESCE(v_compra.monto_visita_monto, 0) <= 0
    OR v_sum_visita >= v_compra.monto_visita_monto;

  UPDATE public.user_moto_compra
  SET
    pago_inicial_confirmado = v_inicial_ok,
    pago_cuota_confirmado = v_cuota_ok,
    pago_visita_confirmado = v_visita_ok,
    pago_inicial_confirmado_at = CASE
      WHEN v_inicial_ok AND NOT pago_inicial_confirmado THEN now()
      WHEN NOT v_inicial_ok THEN NULL
      ELSE pago_inicial_confirmado_at
    END,
    pago_cuota_confirmado_at = CASE
      WHEN v_cuota_ok AND NOT pago_cuota_confirmado THEN now()
      WHEN NOT v_cuota_ok THEN NULL
      ELSE pago_cuota_confirmado_at
    END,
    pago_visita_confirmado_at = CASE
      WHEN v_visita_ok AND NOT pago_visita_confirmado THEN now()
      WHEN NOT v_visita_ok THEN NULL
      ELSE pago_visita_confirmado_at
    END
  WHERE id = p_compra_id
    AND (
      pago_inicial_confirmado IS DISTINCT FROM v_inicial_ok
      OR pago_cuota_confirmado IS DISTINCT FROM v_cuota_ok
      OR pago_visita_confirmado IS DISTINCT FROM v_visita_ok
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_compra_pago_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra_id uuid;
  v_contexto text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_compra_id := OLD.user_moto_compra_id;
    v_contexto := OLD.contexto_pago;
  ELSE
    v_compra_id := NEW.user_moto_compra_id;
    v_contexto := NEW.contexto_pago;
  END IF;

  IF v_contexto IN ('inicial', 'cuota_adelantada', 'visita') THEN
    PERFORM public.sync_compra_pago_flags(v_compra_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

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
  v_fecha_inicio date;
  v_pago record;
  v_tiene_adelantada boolean;
  v_cobra_adelantada boolean;
  v_cuota_contrato integer;
  v_monto_adelantada integer;
BEGIN
  SELECT * INTO v_compra FROM public.user_moto_compra WHERE id = p_compra_id;

  IF v_compra IS NULL OR v_compra.estado NOT IN ('lista_retiro', 'entregada') THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tarifas_pagadas WHERE user_moto_compra_id = p_compra_id
  ) THEN
    RETURN;
  END IF;

  IF COALESCE(v_compra.monto_cuota_periodo, 0) <= 0 THEN
    SELECT (dc.contrato_data->>'valor_cuota')::integer
    INTO v_cuota_contrato
    FROM public.digital_contracts dc
    WHERE dc.user_id = v_compra.user_id
      AND dc.status = 'firmado'
    ORDER BY dc.signed_at DESC NULLS LAST
    LIMIT 1;

    IF v_cuota_contrato IS NULL OR v_cuota_contrato <= 0 THEN
      RETURN;
    END IF;

    UPDATE public.user_moto_compra
    SET monto_cuota_periodo = v_cuota_contrato
    WHERE id = p_compra_id;

    v_compra.monto_cuota_periodo := v_cuota_contrato;
  END IF;

  SELECT total_periodos, dias_intervalo
  INTO v_total, v_intervalo
  FROM public.tarifa_period_config(v_compra.frecuencia_pago);

  v_fecha_inicio := public.compra_fecha_inicio_tarifas(p_compra_id);

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
  )
  SELECT
    v_compra.id,
    v_compra.user_id,
    g,
    v_fecha_inicio + ((g - 1) * v_intervalo),
    v_compra.monto_cuota_periodo,
    NULL,
    'pendiente',
    NULL,
    NULL,
    NULL
  FROM generate_series(1, v_total) AS g;

  v_tiene_adelantada := FALSE;
  FOR v_pago IN
    SELECT id
    FROM public.pagos
    WHERE user_moto_compra_id = p_compra_id
      AND estado = 'confirmado'
      AND contexto_pago = 'cuota_adelantada'
    ORDER BY confirmado_at NULLS LAST, created_at
  LOOP
    v_tiene_adelantada := TRUE;
    PERFORM public.aplicar_cuota_adelantada_a_tarifas(v_pago.id);
  END LOOP;

  v_monto_adelantada := COALESCE(v_compra.monto_cuota_adelantada, 0);
  v_cobra_adelantada := COALESCE(
    (v_compra.admin_data->>'cobra_cuota_adelantada')::boolean,
    v_monto_adelantada > 0
  );

  IF NOT v_tiene_adelantada
     AND v_compra.pago_cuota_confirmado
     AND v_monto_adelantada > 0
     AND v_cobra_adelantada
  THEN
    UPDATE public.tarifas_pagadas
    SET
      monto_pagado = monto_esperado,
      estado = 'pagada',
      pagada_at = COALESCE(v_compra.pago_cuota_confirmado_at, now()),
      confirmada_por = 'sistema',
      notas = 'Cuota adelantada al retiro',
      updated_at = now()
    WHERE user_moto_compra_id = p_compra_id
      AND numero_periodo = 1;
  END IF;
END;
$$;

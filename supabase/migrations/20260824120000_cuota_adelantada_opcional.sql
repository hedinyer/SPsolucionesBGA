-- Algunos clientes no pagan la cuota adelantada en el primer pago.
-- admin_data.cobra_cuota_adelantada = false: la cuota periódica sigue,
-- pero no se cobra ni se aplica al periodo 1 al entregar.

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
  v_cobra_adelantada boolean;
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

  v_cobra_adelantada := COALESCE(
    (v_compra.admin_data->>'cobra_cuota_adelantada')::boolean,
    true
  );

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

  v_inicial_ok := v_sum_inicial >= v_compra.cuota_inicial_monto;
  v_cuota_ok :=
    NOT v_cobra_adelantada
    OR v_sum_cuota >= v_compra.monto_cuota_periodo;
  v_visita_ok :=
    v_compra.monto_visita_monto <= 0
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
BEGIN
  SELECT * INTO v_compra FROM public.user_moto_compra WHERE id = p_compra_id;

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

  v_fecha_inicio := COALESCE(
    v_compra.fecha_entrega,
    (now() AT TIME ZONE 'America/Bogota')::date
  ) + 2;

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

  v_cobra_adelantada := COALESCE(
    (v_compra.admin_data->>'cobra_cuota_adelantada')::boolean,
    true
  );

  -- Fallback legacy: flag confirmado sin fila de pago (solo si sí se cobró adelantada)
  IF NOT v_tiene_adelantada
     AND v_compra.pago_cuota_confirmado
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

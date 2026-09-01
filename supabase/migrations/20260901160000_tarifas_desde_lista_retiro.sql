-- Talonario al completar pago (lista_retiro), no solo al marcar entregada.
-- Corrige monto_cuota_periodo $0 desde contrato antes de insertar tarifas.

CREATE OR REPLACE FUNCTION public.aplicar_cuota_adelantada_a_tarifas(p_pago_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago record;
  v_tarifa record;
  v_restante integer;
  v_aplicado integer;
  v_total_aplicado integer := 0;
  v_notas text;
  v_huerfano integer;
BEGIN
  SELECT * INTO v_pago FROM public.pagos WHERE id = p_pago_id;
  IF v_pago IS NULL THEN
    RAISE EXCEPTION 'Pago no encontrado: %', p_pago_id;
  END IF;
  IF v_pago.estado <> 'confirmado' OR v_pago.contexto_pago <> 'cuota_adelantada' THEN
    RETURN 0;
  END IF;

  FOR v_tarifa IN
    SELECT id, monto_esperado, COALESCE(monto_pagado, monto_esperado) AS pagado
    FROM public.tarifas_pagadas t
    WHERE t.user_moto_compra_id = v_pago.user_moto_compra_id
      AND t.estado = 'pagada'
      AND t.notas ILIKE '%Cuota adelantada al retiro%'
      AND NOT EXISTS (
        SELECT 1 FROM public.pago_tarifa_aplicaciones pta WHERE pta.tarifa_id = t.id
      )
    ORDER BY t.numero_periodo
  LOOP
    v_huerfano := LEAST(
      v_tarifa.pagado,
      GREATEST(
        0,
        v_pago.monto - COALESCE((
          SELECT SUM(monto_aplicado)
          FROM public.pago_tarifa_aplicaciones
          WHERE pago_id = p_pago_id
        ), 0)
      )
    );
    EXIT WHEN v_huerfano <= 0;

    INSERT INTO public.pago_tarifa_aplicaciones (pago_id, tarifa_id, monto_aplicado)
    VALUES (p_pago_id, v_tarifa.id, v_huerfano)
    ON CONFLICT (pago_id, tarifa_id) DO UPDATE
      SET monto_aplicado = public.pago_tarifa_aplicaciones.monto_aplicado + EXCLUDED.monto_aplicado;

    v_total_aplicado := v_total_aplicado + v_huerfano;
  END LOOP;

  v_restante := v_pago.monto - COALESCE((
    SELECT SUM(monto_aplicado)
    FROM public.pago_tarifa_aplicaciones
    WHERE pago_id = p_pago_id
  ), 0);

  IF v_restante <= 0 THEN
    RETURN v_total_aplicado;
  END IF;

  v_notas := trim(both ' ' FROM concat_ws(
    ' · ',
    CASE WHEN v_pago.referencia IS NOT NULL THEN 'Ref: ' || v_pago.referencia ELSE NULL END,
    'Cuota adelantada'
  ));

  FOR v_tarifa IN
    SELECT id
    FROM public.tarifas_pagadas
    WHERE user_moto_compra_id = v_pago.user_moto_compra_id
      AND COALESCE(monto_pagado, 0) < monto_esperado
    ORDER BY numero_periodo ASC
  LOOP
    EXIT WHEN v_restante <= 0;

    v_aplicado := public.aplicar_monto_sobre_tarifa(
      p_pago_id,
      v_tarifa.id,
      v_restante,
      v_pago.confirmado_at,
      COALESCE(v_pago.confirmado_por, 'sistema'),
      v_notas
    );
    v_restante := v_restante - v_aplicado;
    v_total_aplicado := v_total_aplicado + v_aplicado;
  END LOOP;

  RETURN v_total_aplicado;
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

  v_cobra_adelantada := COALESCE(
    (v_compra.admin_data->>'cobra_cuota_adelantada')::boolean,
    true
  );

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

CREATE OR REPLACE FUNCTION public.generate_tarifas_on_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado IN ('lista_retiro', 'entregada')
     AND (OLD.estado IS DISTINCT FROM NEW.estado) THEN
    PERFORM public.generate_tarifas_for_compra(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Compras ya pagadas sin talonario (ej. Mario @1005333020)
SELECT public.generate_tarifas_for_compra(c.id)
FROM public.user_moto_compra c
WHERE c.estado IN ('lista_retiro', 'entregada')
  AND NOT EXISTS (
    SELECT 1 FROM public.tarifas_pagadas t WHERE t.user_moto_compra_id = c.id
  );

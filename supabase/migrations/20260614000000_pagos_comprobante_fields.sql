-- Campos adicionales para comprobantes de pago y aplicación dirigida a tarifa

ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS fecha_comprobante timestamptz,
  ADD COLUMN IF NOT EXISTS tarifa_objetivo_id uuid
    REFERENCES public.tarifas_pagadas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contexto_pago text
    CHECK (contexto_pago IS NULL OR contexto_pago IN (
      'tarifa', 'inicial', 'cuota_adelantada'
    ));

CREATE INDEX IF NOT EXISTS idx_pagos_tarifa_objetivo
  ON public.pagos (tarifa_objetivo_id)
  WHERE tarifa_objetivo_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Aplicar pago confirmado: soporta tarifa_objetivo_id
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

  -- Pagos iniciales / cuota adelantada no aplican sobre tarifas_pagadas
  IF v_pago.contexto_pago IN ('inicial', 'cuota_adelantada') THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_compra
  FROM public.user_moto_compra
  WHERE id = v_pago.user_moto_compra_id;

  IF v_compra IS NULL THEN
    RAISE EXCEPTION 'Compra no encontrada para el pago %', p_pago_id;
  END IF;

  v_notas := trim(both ' ' FROM concat_ws(
    ' · ',
    CASE WHEN v_pago.referencia IS NOT NULL
      THEN 'Ref: ' || v_pago.referencia
      ELSE NULL
    END,
    'Pago ' || left(p_pago_id::text, 8)
  ));

  -- Aplicación dirigida a una tarifa específica (confirmación admin por fila)
  IF v_pago.tarifa_objetivo_id IS NOT NULL THEN
    SELECT id, monto_esperado, estado
    INTO v_tarifa
    FROM public.tarifas_pagadas
    WHERE id = v_pago.tarifa_objetivo_id
      AND user_moto_compra_id = v_pago.user_moto_compra_id;

    IF v_tarifa IS NULL THEN
      RAISE EXCEPTION 'Tarifa objetivo no encontrada para el pago %', p_pago_id;
    END IF;

    IF v_tarifa.estado = 'pagada' THEN
      RETURN;
    END IF;

    v_aplicado := LEAST(v_pago.monto, v_tarifa.monto_esperado);

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

    IF v_pago.monto > v_tarifa.monto_esperado THEN
      v_excedente := v_pago.monto - v_tarifa.monto_esperado;
      UPDATE public.pagos
      SET notas_admin = trim(both ' ' FROM concat_ws(
        ' · ',
        notas_admin,
        'Excedente no aplicado: $' || v_excedente::text
      ))
      WHERE id = p_pago_id;
    END IF;

    RETURN;
  END IF;

  -- Aplicación automática por monto (flujo legacy / usuario)
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

  v_periodos_a_aplicar := COALESCE(
    v_pago.dias_cubiertos,
    GREATEST(1, CEIL(v_dias_cubiertos::numeric / v_dias_intervalo::numeric)::integer)
  );

  v_monto_restante := v_pago.monto;
  v_excedente := 0;

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

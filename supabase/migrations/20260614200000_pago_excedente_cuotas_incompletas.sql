-- Pagos parciales no marcan cuota completa; excedentes cubren cuotas incompletas

-- Corregir cuotas marcadas pagadas con abono parcial
UPDATE public.tarifas_pagadas
SET
  estado = CASE
    WHEN fecha_vencimiento < (now() AT TIME ZONE 'America/Bogota')::date
      THEN 'vencida'
    ELSE 'pendiente'
  END,
  pagada_at = NULL,
  confirmada_por = NULL,
  updated_at = now()
WHERE estado = 'pagada'
  AND COALESCE(monto_pagado, 0) > 0
  AND COALESCE(monto_pagado, 0) < monto_esperado;

CREATE OR REPLACE FUNCTION public.aplicar_monto_sobre_tarifa(
  p_pago_id uuid,
  p_tarifa_id uuid,
  p_monto_disponible integer,
  p_confirmado_at timestamptz,
  p_confirmado_por text,
  p_notas text
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_tarifa record;
  v_faltante integer;
  v_aplicado integer;
  v_nuevo_pagado integer;
  v_completa boolean;
  v_estado_nuevo text;
BEGIN
  IF p_monto_disponible <= 0 THEN
    RETURN 0;
  END IF;

  SELECT
    id,
    monto_esperado,
    COALESCE(monto_pagado, 0) AS pagado_actual,
    estado,
    fecha_vencimiento
  INTO v_tarifa
  FROM public.tarifas_pagadas
  WHERE id = p_tarifa_id
  FOR UPDATE;

  IF v_tarifa IS NULL THEN
    RETURN 0;
  END IF;

  v_faltante := v_tarifa.monto_esperado - v_tarifa.pagado_actual;
  IF v_faltante <= 0 THEN
    RETURN 0;
  END IF;

  v_aplicado := LEAST(p_monto_disponible, v_faltante);
  v_nuevo_pagado := v_tarifa.pagado_actual + v_aplicado;
  v_completa := v_nuevo_pagado >= v_tarifa.monto_esperado;

  IF v_completa THEN
    v_estado_nuevo := 'pagada';
  ELSIF v_tarifa.estado = 'pagada' THEN
    v_estado_nuevo := CASE
      WHEN v_tarifa.fecha_vencimiento < (now() AT TIME ZONE 'America/Bogota')::date
        THEN 'vencida'
      ELSE 'pendiente'
    END;
  ELSE
    v_estado_nuevo := v_tarifa.estado;
  END IF;

  UPDATE public.tarifas_pagadas
  SET
    monto_pagado = v_nuevo_pagado,
    estado = v_estado_nuevo,
    pagada_at = CASE
      WHEN v_completa THEN COALESCE(p_confirmado_at, now())
      ELSE pagada_at
    END,
    confirmada_por = CASE
      WHEN v_completa THEN COALESCE(p_confirmado_por, 'pago')
      ELSE confirmada_por
    END,
    notas = CASE
      WHEN v_completa THEN COALESCE(p_notas, notas)
      ELSE trim(both ' ' FROM concat_ws(
        ' · ',
        notas,
        'Parcial $' || v_nuevo_pagado::text || ' / $' || v_tarifa.monto_esperado::text
      ))
    END,
    updated_at = now()
  WHERE id = p_tarifa_id;

  INSERT INTO public.pago_tarifa_aplicaciones (pago_id, tarifa_id, monto_aplicado)
  VALUES (p_pago_id, p_tarifa_id, v_aplicado)
  ON CONFLICT (pago_id, tarifa_id) DO UPDATE
    SET monto_aplicado = public.pago_tarifa_aplicaciones.monto_aplicado + EXCLUDED.monto_aplicado;

  RETURN v_aplicado;
END;
$$;

CREATE OR REPLACE FUNCTION public.aplicar_pago_confirmado(p_pago_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago record;
  v_compra record;
  v_tarifa record;
  v_aplicado integer;
  v_monto_restante integer;
  v_excedente integer;
  v_notas text;
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

  v_monto_restante := v_pago.monto;

  -- 1) Cuota objetivo del admin (si aplica)
  IF v_pago.tarifa_objetivo_id IS NOT NULL THEN
    v_aplicado := public.aplicar_monto_sobre_tarifa(
      p_pago_id,
      v_pago.tarifa_objetivo_id,
      v_monto_restante,
      v_pago.confirmado_at,
      v_pago.confirmado_por,
      v_notas
    );
    v_monto_restante := v_monto_restante - v_aplicado;
  END IF;

  -- 2) Excedente (o pago sin objetivo) hacia cuotas incompletas, más antiguas primero
  FOR v_tarifa IN
    SELECT id
    FROM public.tarifas_pagadas
    WHERE user_moto_compra_id = v_pago.user_moto_compra_id
      AND COALESCE(monto_pagado, 0) < monto_esperado
      AND (
        v_pago.tarifa_objetivo_id IS NULL
        OR id <> v_pago.tarifa_objetivo_id
      )
    ORDER BY numero_periodo ASC
  LOOP
    EXIT WHEN v_monto_restante <= 0;

    v_aplicado := public.aplicar_monto_sobre_tarifa(
      p_pago_id,
      v_tarifa.id,
      v_monto_restante,
      v_pago.confirmado_at,
      v_pago.confirmado_por,
      v_notas
    );
    v_monto_restante := v_monto_restante - v_aplicado;
  END LOOP;

  IF v_monto_restante > 0 THEN
    v_excedente := v_monto_restante;
    UPDATE public.pagos
    SET notas_admin = trim(both ' ' FROM concat_ws(
      ' · ',
      notas_admin,
      'Excedente sin cuota incompleta: $' || v_excedente::text
    ))
    WHERE id = p_pago_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_monto_sobre_tarifa(uuid, uuid, integer, timestamptz, text, text) TO service_role;

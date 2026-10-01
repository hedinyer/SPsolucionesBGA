-- Evita statement timeout al confirmar abonos grandes:
-- aplicar_pago_confirmado actualiza N tarifas y cada UPDATE disparaba sync_mora_for_compra
-- (vista atrasos cara). Además, sync_mora_for_compra reentraba al marcar pendientes→vencidas.
-- Solución: flag de sesión app.skip_mora_sync para diferir el sync a una sola pasada.

CREATE OR REPLACE FUNCTION public.sync_mora_on_tarifa_pagada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.skip_mora_sync', true) = '1' THEN
    RETURN NEW;
  END IF;

  PERFORM public.sync_mora_for_compra(NEW.user_moto_compra_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_mora_for_compra(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_moroso_id uuid;
  v_today date;
  v_prev text;
BEGIN
  IF p_compra_id IS NULL THEN
    RETURN;
  END IF;

  v_today := (now() AT TIME ZONE 'America/Bogota')::date;
  v_prev := current_setting('app.skip_mora_sync', true);

  -- Evita reentrada cuando este UPDATE dispara trg_sync_mora_on_tarifa_pagada.
  PERFORM set_config('app.skip_mora_sync', '1', true);

  UPDATE public.tarifas_pagadas
  SET estado = 'vencida', updated_at = now()
  WHERE user_moto_compra_id = p_compra_id
    AND estado = 'pendiente'
    AND fecha_vencimiento <= v_today;

  PERFORM set_config('app.skip_mora_sync', COALESCE(v_prev, ''), true);

  SELECT *
  INTO v_row
  FROM public.atrasos
  WHERE user_moto_compra_id = p_compra_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_moroso_id := NULL;

  IF v_row.monto_adeudado <= 0 THEN
    UPDATE public.morosos
    SET estado = 'regularizado', updated_at = now()
    WHERE user_moto_compra_id = p_compra_id
      AND estado = 'activo';

    UPDATE public.motos_para_recoger
    SET estado = 'cancelada', updated_at = now()
    WHERE user_moto_compra_id = p_compra_id
      AND estado IN ('pendiente', 'asignada');

    UPDATE public.users_tracking
    SET seguimiento = false, updated_at = now()
    WHERE user_id = v_row.user_id
      AND seguimiento = true;

    RETURN;
  END IF;

  IF v_row.dias_atraso >= 1 THEN
    UPDATE public.users_tracking
    SET seguimiento = true, updated_at = now()
    WHERE user_id = v_row.user_id;
  END IF;

  IF v_row.dias_atraso >= 3 AND v_row.dias_atraso < 4 THEN
    INSERT INTO public.morosos (
      user_moto_compra_id,
      user_id,
      tarifa_vencida_id,
      dias_atraso,
      monto_adeudado,
      estado
    ) VALUES (
      v_row.user_moto_compra_id,
      v_row.user_id,
      v_row.tarifa_vencida_id,
      v_row.dias_atraso,
      v_row.monto_adeudado,
      'activo'
    )
    ON CONFLICT (user_moto_compra_id) DO UPDATE SET
      tarifa_vencida_id = EXCLUDED.tarifa_vencida_id,
      dias_atraso = EXCLUDED.dias_atraso,
      monto_adeudado = EXCLUDED.monto_adeudado,
      estado = CASE
        WHEN public.morosos.estado IN ('regularizado') THEN 'activo'
        WHEN public.morosos.estado = 'activo' THEN 'activo'
        ELSE 'activo'
      END,
      updated_at = now()
    RETURNING id INTO v_moroso_id;

    IF v_moroso_id IS NULL THEN
      SELECT id INTO v_moroso_id
      FROM public.morosos
      WHERE user_moto_compra_id = v_row.user_moto_compra_id;
    END IF;
  ELSE
    UPDATE public.morosos
    SET estado = 'regularizado', updated_at = now()
    WHERE user_moto_compra_id = p_compra_id
      AND estado = 'activo';
  END IF;

  IF v_row.dias_atraso >= 4 THEN
    IF v_moroso_id IS NULL THEN
      SELECT id INTO v_moroso_id
      FROM public.morosos
      WHERE user_moto_compra_id = v_row.user_moto_compra_id;
    END IF;

    INSERT INTO public.motos_para_recoger (
      user_moto_compra_id,
      moroso_id,
      user_id,
      dias_atraso,
      monto_adeudado,
      estado
    ) VALUES (
      v_row.user_moto_compra_id,
      v_moroso_id,
      v_row.user_id,
      v_row.dias_atraso,
      v_row.monto_adeudado,
      'pendiente'
    )
    ON CONFLICT (user_moto_compra_id) DO UPDATE SET
      moroso_id = COALESCE(EXCLUDED.moroso_id, public.motos_para_recoger.moroso_id),
      dias_atraso = EXCLUDED.dias_atraso,
      monto_adeudado = EXCLUDED.monto_adeudado,
      estado = CASE
        WHEN public.motos_para_recoger.estado = 'recogida'
          THEN 'recogida'
        ELSE 'pendiente'
      END,
      updated_at = now();
  ELSE
    UPDATE public.motos_para_recoger
    SET estado = 'cancelada', updated_at = now()
    WHERE user_moto_compra_id = p_compra_id
      AND estado IN ('pendiente', 'asignada');
  END IF;
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
  v_prev text;
BEGIN
  SELECT * INTO v_pago FROM public.pagos WHERE id = p_pago_id;
  IF v_pago IS NULL THEN RAISE EXCEPTION 'Pago no encontrado: %', p_pago_id; END IF;
  IF v_pago.estado <> 'confirmado' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.pago_tarifa_aplicaciones WHERE pago_id = p_pago_id) THEN RETURN; END IF;
  IF v_pago.contexto_pago IN (
    'inicial',
    'cuota_adelantada',
    'visita',
    'liquidacion',
    'producto_inicial',
    'producto_cuota'
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_compra FROM public.user_moto_compra WHERE id = v_pago.user_moto_compra_id;
  IF v_compra IS NULL THEN RAISE EXCEPTION 'Compra no encontrada para el pago %', p_pago_id; END IF;

  v_notas := trim(both ' ' FROM concat_ws(
    ' · ',
    CASE WHEN v_pago.referencia IS NOT NULL THEN 'Ref: ' || v_pago.referencia ELSE NULL END,
    'Pago ' || left(p_pago_id::text, 8)
  ));

  v_prev := current_setting('app.skip_mora_sync', true);
  PERFORM set_config('app.skip_mora_sync', '1', true);

  v_monto_restante := v_pago.monto;

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

  FOR v_tarifa IN
    SELECT id
    FROM public.tarifas_pagadas
    WHERE user_moto_compra_id = v_pago.user_moto_compra_id
      AND COALESCE(monto_pagado, 0) < monto_esperado
      AND (v_pago.tarifa_objetivo_id IS NULL OR id <> v_pago.tarifa_objetivo_id)
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

  -- Restaura el flag; trg_sync_mora_on_pago (AFTER INSERT) hará un solo sync.
  PERFORM set_config('app.skip_mora_sync', COALESCE(v_prev, ''), true);
END;
$$;

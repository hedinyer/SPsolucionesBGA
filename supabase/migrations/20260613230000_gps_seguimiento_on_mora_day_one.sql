-- Activar seguimiento intensivo desde el día 1 de mora (no esperar al día 4)

CREATE OR REPLACE FUNCTION public.evaluar_mora_diaria()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_moroso_id uuid;
  v_today date;
BEGIN
  v_today := (now() AT TIME ZONE 'America/Bogota')::date;

  UPDATE public.tarifas_pagadas
  SET estado = 'vencida', updated_at = now()
  WHERE estado = 'pendiente'
    AND fecha_vencimiento <= v_today;

  FOR v_row IN
    SELECT *
    FROM public.atrasos
    WHERE monto_adeudado > 0
  LOOP
    v_moroso_id := NULL;

    IF v_row.dias_atraso >= 1 THEN
      UPDATE public.users_tracking
      SET seguimiento = true, updated_at = now()
      WHERE user_id = v_row.user_id;

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
          WHEN public.morosos.estado = 'regularizado' THEN 'activo'
          ELSE public.morosos.estado
        END,
        updated_at = now()
      RETURNING id INTO v_moroso_id;

      IF v_moroso_id IS NULL THEN
        SELECT id INTO v_moroso_id
        FROM public.morosos
        WHERE user_moto_compra_id = v_row.user_moto_compra_id;
      END IF;
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
          WHEN public.motos_para_recoger.estado IN ('recogida', 'cancelada')
            THEN public.motos_para_recoger.estado
          ELSE 'pendiente'
        END,
        updated_at = now();
    END IF;
  END LOOP;

  UPDATE public.morosos m
  SET estado = 'regularizado', updated_at = now()
  FROM public.atrasos a
  WHERE a.user_moto_compra_id = m.user_moto_compra_id
    AND m.estado = 'activo'
    AND a.monto_adeudado <= 0;

  UPDATE public.motos_para_recoger r
  SET estado = 'cancelada', updated_at = now()
  FROM public.atrasos a
  WHERE a.user_moto_compra_id = r.user_moto_compra_id
    AND r.estado IN ('pendiente', 'asignada')
    AND a.monto_adeudado <= 0;

  UPDATE public.users_tracking ut
  SET seguimiento = false, updated_at = now()
  FROM public.atrasos a
  WHERE a.user_id = ut.user_id
    AND a.monto_adeudado <= 0
    AND ut.seguimiento = true;
END;
$$;

SELECT public.evaluar_mora_diaria();

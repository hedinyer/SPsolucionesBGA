-- Bandejas mutuamente excluyentes: mora = exactamente 3 días; para recoger = 4+ días.



UPDATE public.morosos

SET estado = 'regularizado', updated_at = now()

WHERE estado = 'activo'

  AND dias_atraso >= 4;



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

BEGIN

  IF p_compra_id IS NULL THEN

    RETURN;

  END IF;



  v_today := (now() AT TIME ZONE 'America/Bogota')::date;



  UPDATE public.tarifas_pagadas

  SET estado = 'vencida', updated_at = now()

  WHERE user_moto_compra_id = p_compra_id

    AND estado = 'pendiente'

    AND fecha_vencimiento <= v_today;



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



  -- Seguimiento GPS desde el día 1 de atraso

  IF v_row.dias_atraso >= 1 THEN

    UPDATE public.users_tracking

    SET seguimiento = true, updated_at = now()

    WHERE user_id = v_row.user_id;

  END IF;



  -- Bandeja "Clientes en mora": solo 3 días (no 4+)

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

  ELSE

    UPDATE public.morosos

    SET estado = 'regularizado', updated_at = now()

    WHERE user_moto_compra_id = p_compra_id

      AND estado = 'activo';

  END IF;



  -- Bandeja "Motos para recoger": 4+ días

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

  ELSE

    UPDATE public.motos_para_recoger

    SET estado = 'cancelada', updated_at = now()

    WHERE user_moto_compra_id = p_compra_id

      AND estado IN ('pendiente', 'asignada');

  END IF;

END;

$$;



SELECT public.evaluar_mora_diaria();



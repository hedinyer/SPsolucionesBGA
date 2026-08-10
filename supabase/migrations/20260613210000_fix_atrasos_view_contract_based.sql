-- Atrasos calculados desde fecha inicio del contrato, frecuencia y lo pagado
-- (no depende de que evaluar_mora_diaria haya marcado tarifas como vencida)

DROP VIEW IF EXISTS public.atrasos;

CREATE VIEW public.atrasos
WITH (security_invoker = true) AS
SELECT
  c.id                    AS user_moto_compra_id,
  c.user_id,
  c.frecuencia_pago,
  base.fecha_inicio,
  cfg.dias_intervalo,
  calc.periodos_debidos,
  calc.periodos_pagados,
  calc.monto_esperado,
  calc.monto_pagado,
  calc.monto_adeudado,
  calc.fecha_desde_atraso,
  calc.dias_atraso,
  calc.tarifa_vencida_id,
  CASE
    WHEN calc.monto_adeudado <= 0 THEN 'al_dia'
    WHEN calc.dias_atraso >= 3 THEN 'moroso'
    WHEN calc.monto_adeudado > 0 THEN 'vencido'
    ELSE 'al_dia'
  END AS estado
FROM public.user_moto_compra c
LEFT JOIN LATERAL (
  SELECT dc.signed_at
  FROM public.digital_contracts dc
  WHERE dc.user_id = c.user_id
    AND dc.status = 'firmado'
  ORDER BY dc.signed_at DESC NULLS LAST
  LIMIT 1
) dc ON true
CROSS JOIN LATERAL (
  SELECT (now() AT TIME ZONE 'America/Bogota')::date AS v_today
) tz
CROSS JOIN LATERAL (
  SELECT COALESCE(
    c.fecha_entrega,
    (dc.signed_at AT TIME ZONE 'America/Bogota')::date,
    c.seleccionado_at::date
  ) AS fecha_inicio
) base
CROSS JOIN LATERAL (
  SELECT
    tpc.dias_intervalo,
    tpc.total_periodos
  FROM public.tarifa_period_config(c.frecuencia_pago) tpc
) cfg
CROSS JOIN LATERAL (
  SELECT
    GREATEST(0, LEAST(
      cfg.total_periodos,
      ((tz.v_today - base.fecha_inicio) / NULLIF(cfg.dias_intervalo, 0))::integer
    )) AS periodos_debidos,
    (
      COALESCE((
        SELECT SUM(COALESCE(t.monto_pagado, t.monto_esperado, 0))
        FROM public.tarifas_pagadas t
        WHERE t.user_moto_compra_id = c.id
          AND t.estado = 'pagada'
      ), 0)
      + CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM public.tarifas_pagadas t
            WHERE t.user_moto_compra_id = c.id
          )
          AND c.pago_cuota_confirmado
          THEN c.monto_cuota_periodo
          ELSE 0
        END
      + COALESCE((
        SELECT SUM(p.monto)
        FROM public.pagos p
        WHERE p.user_moto_compra_id = c.id
          AND p.estado = 'confirmado'
          AND NOT EXISTS (
            SELECT 1
            FROM public.pago_tarifa_aplicaciones pta
            WHERE pta.pago_id = p.id
          )
      ), 0)
    )::bigint AS monto_pagado_raw
) paid
CROSS JOIN LATERAL (
  SELECT
    paid.periodos_debidos,
    GREATEST(
      0,
      FLOOR(
        paid.monto_pagado_raw::numeric / NULLIF(c.monto_cuota_periodo, 0)::numeric
      )::integer
    ) AS periodos_pagados,
    (paid.periodos_debidos * c.monto_cuota_periodo) AS monto_esperado,
    paid.monto_pagado_raw AS monto_pagado,
    GREATEST(
      0,
      (paid.periodos_debidos * c.monto_cuota_periodo) - paid.monto_pagado_raw
    ) AS monto_adeudado,
    CASE
      WHEN GREATEST(
        0,
        (paid.periodos_debidos * c.monto_cuota_periodo) - paid.monto_pagado_raw
      ) <= 0 THEN NULL
      ELSE base.fecha_inicio + (
        GREATEST(
          0,
          FLOOR(
            paid.monto_pagado_raw::numeric
              / NULLIF(c.monto_cuota_periodo, 0)::numeric
          )::integer
        ) + 1
      ) * cfg.dias_intervalo
    END AS fecha_desde_atraso,
    CASE
      WHEN GREATEST(
        0,
        (paid.periodos_debidos * c.monto_cuota_periodo) - paid.monto_pagado_raw
      ) <= 0 THEN 0
      ELSE GREATEST(0,
        tz.v_today - (
          base.fecha_inicio + (
            GREATEST(
              0,
              FLOOR(
                paid.monto_pagado_raw::numeric
                  / NULLIF(c.monto_cuota_periodo, 0)::numeric
              )::integer
            ) + 1
          ) * cfg.dias_intervalo
        )
      )
    END AS dias_atraso,
    (
      SELECT t.id
      FROM public.tarifas_pagadas t
      WHERE t.user_moto_compra_id = c.id
        AND t.estado IN ('pendiente', 'vencida')
        AND t.fecha_vencimiento <= tz.v_today
      ORDER BY t.fecha_vencimiento ASC
      LIMIT 1
    ) AS tarifa_vencida_id
) calc
WHERE c.estado = 'entregada';

GRANT SELECT ON public.atrasos TO anon, authenticated;

-- Regenerar calendario de tarifas si falta (para admin y aplicación de pagos)
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

-- evaluar_mora_diaria: usar pendientes vencidos por fecha (sin esperar estado vencida)
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
    AND fecha_vencimiento < v_today;

  FOR v_row IN
    SELECT *
    FROM public.atrasos
    WHERE monto_adeudado > 0
  LOOP
    v_moroso_id := NULL;

    IF v_row.dias_atraso >= 3 THEN
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
        GREATEST(v_row.dias_atraso, 3),
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

      UPDATE public.users_tracking
      SET seguimiento = true, updated_at = now()
      WHERE user_id = v_row.user_id;
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
END;
$$;

-- Sincronizar mora ahora con la nueva lógica
SELECT public.evaluar_mora_diaria();

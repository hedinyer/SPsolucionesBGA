-- El credito empieza el dia DESPUES de la entrega / pago inicial.
-- Antes: fecha_inicio = fecha_entrega -> el dia del retiro ya contaba en atrasos.
-- Ahora: fecha_inicio = fecha_entrega + 1 (primer dia de obligacion).
-- Las tarifas ya nacian en entrega+1, +2, ...; solo se alinea el ancla de atrasos
-- y se aclara el generador.

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
  v_i integer;
BEGIN
  SELECT *
  INTO v_compra
  FROM public.user_moto_compra
  WHERE id = p_compra_id;

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

  -- Día siguiente a la entrega / pago inicial
  v_fecha_inicio := COALESCE(v_compra.fecha_entrega, CURRENT_DATE) + 1;

  FOR v_i IN 1..v_total LOOP
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
    ) VALUES (
      v_compra.id,
      v_compra.user_id,
      v_i,
      v_fecha_inicio + ((v_i - 1) * v_intervalo),
      v_compra.monto_cuota_periodo,
      CASE WHEN v_i = 1 THEN v_compra.monto_cuota_periodo ELSE NULL END,
      CASE WHEN v_i = 1 THEN 'pagada' ELSE 'pendiente' END,
      CASE WHEN v_i = 1 THEN COALESCE(v_compra.pago_cuota_confirmado_at, now()) ELSE NULL END,
      CASE WHEN v_i = 1 THEN 'sistema' ELSE NULL END,
      CASE WHEN v_i = 1 THEN 'Cuota adelantada al retiro' ELSE NULL END
    );
  END LOOP;
END;
$$;

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
  -- Primer día de crédito = día siguiente a entrega / firma / selección
  SELECT (
    COALESCE(
      c.fecha_entrega,
      (dc.signed_at AT TIME ZONE 'America/Bogota')::date,
      c.seleccionado_at::date
    ) + 1
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
    COALESCE((
      SELECT SUM(
        LEAST(
          cc.dias,
          GREATEST(
            0,
            tz.v_today - (cc.created_at AT TIME ZONE 'America/Bogota')::date
          )
        )
      )
      FROM public.congelamientos_cuotas cc
      WHERE cc.user_moto_compra_id = c.id
    ), 0)::integer AS dias_congelados,
    (
      SELECT MAX(
        (cc.created_at AT TIME ZONE 'America/Bogota')::date + cc.dias
      )
      FROM public.congelamientos_cuotas cc
      WHERE cc.user_moto_compra_id = c.id
    ) AS freeze_end
) frz
CROSS JOIN LATERAL (
  SELECT
    GREATEST(0, LEAST(
      cfg.total_periodos,
      ((tz.v_today - base.fecha_inicio - frz.dias_congelados) / NULLIF(cfg.dias_intervalo, 0))::integer
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
          AND COALESCE(p.contexto_pago, 'tarifa') NOT IN ('inicial', 'visita', 'cuota_adelantada')
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
      -- fecha_inicio ya es el vencimiento del periodo 1 → siguiente = inicio + pagados * intervalo
      ELSE GREATEST(
        base.fecha_inicio + frz.dias_congelados + (
          GREATEST(
            0,
            FLOOR(
              paid.monto_pagado_raw::numeric
                / NULLIF(c.monto_cuota_periodo, 0)::numeric
            )::integer
          )
        ) * cfg.dias_intervalo,
        frz.freeze_end
      )
    END AS fecha_desde_atraso,
    CASE
      WHEN GREATEST(
        0,
        (paid.periodos_debidos * c.monto_cuota_periodo) - paid.monto_pagado_raw
      ) <= 0 THEN 0
      WHEN frz.freeze_end IS NOT NULL AND tz.v_today < frz.freeze_end THEN 0
      ELSE GREATEST(0,
        (tz.v_today - GREATEST(
          base.fecha_inicio + frz.dias_congelados + (
            GREATEST(
              0,
              FLOOR(
                paid.monto_pagado_raw::numeric
                  / NULLIF(c.monto_cuota_periodo, 0)::numeric
              )::integer
            )
          ) * cfg.dias_intervalo,
          frz.freeze_end
        )) + 1
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

SELECT public.evaluar_mora_diaria();

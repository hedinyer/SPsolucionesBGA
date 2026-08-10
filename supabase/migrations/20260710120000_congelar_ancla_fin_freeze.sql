-- Congelar: las cuotas pendientes/vencidas se corren para que la más temprana
-- caiga el día en que termina el congelamiento (no solo +N sobre fechas viejas,
-- que dejaba vencimientos dentro del periodo congelado).
--
-- Atrasos: contar solo días de freeze ya transcurridos (pausa el reloj durante
-- el freeze) y no iniciar mora antes del fin del último congelamiento.

CREATE OR REPLACE FUNCTION public.congelar_cuotas_compra(
  p_compra_id uuid,
  p_dias integer,
  p_observaciones text DEFAULT NULL,
  p_admin text DEFAULT 'admin'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra record;
  v_today date;
  v_freeze_end date;
  v_min date;
  v_delta integer;
  v_afectadas integer;
BEGIN
  IF p_dias IS NULL OR p_dias <= 0 THEN
    RAISE EXCEPTION 'Los días deben ser mayores a cero.';
  END IF;

  SELECT *
  INTO v_compra
  FROM public.user_moto_compra
  WHERE id = p_compra_id;

  IF v_compra IS NULL THEN
    RAISE EXCEPTION 'Compra no encontrada.';
  END IF;

  IF v_compra.estado <> 'entregada' THEN
    RAISE EXCEPTION 'Solo se pueden congelar cuotas de compras entregadas.';
  END IF;

  v_today := (now() AT TIME ZONE 'America/Bogota')::date;
  v_freeze_end := v_today + p_dias;

  SELECT MIN(t.fecha_vencimiento)
  INTO v_min
  FROM public.tarifas_pagadas t
  WHERE t.user_moto_compra_id = p_compra_id
    AND t.estado IN ('pendiente', 'vencida');

  IF v_min IS NULL THEN
    RAISE EXCEPTION 'No hay cuotas pendientes o vencidas para congelar.';
  END IF;

  -- Al menos p_dias; si había vencidas, empuja el bloque hasta freeze_end.
  v_delta := GREATEST(p_dias, v_freeze_end - v_min);

  UPDATE public.tarifas_pagadas
  SET
    fecha_vencimiento = fecha_vencimiento + v_delta,
    estado = CASE
      WHEN estado = 'vencida'
        AND (fecha_vencimiento + v_delta) >= v_today
        THEN 'pendiente'
      ELSE estado
    END,
    updated_at = now()
  WHERE user_moto_compra_id = p_compra_id
    AND estado IN ('pendiente', 'vencida');

  GET DIAGNOSTICS v_afectadas = ROW_COUNT;

  INSERT INTO public.congelamientos_cuotas (
    user_moto_compra_id,
    user_id,
    dias,
    observaciones,
    creado_por
  ) VALUES (
    p_compra_id,
    v_compra.user_id,
    p_dias,
    NULLIF(trim(p_observaciones), ''),
    p_admin
  );

  PERFORM public.sync_mora_for_compra(p_compra_id);

  RETURN v_afectadas;
END;
$$;

GRANT EXECUTE ON FUNCTION public.congelar_cuotas_compra(uuid, integer, text, text) TO anon, authenticated, service_role;

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
      ELSE GREATEST(
        base.fecha_inicio + frz.dias_congelados + (
          GREATEST(
            0,
            FLOOR(
              paid.monto_pagado_raw::numeric
                / NULLIF(c.monto_cuota_periodo, 0)::numeric
            )::integer
          ) + 1
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
            ) + 1
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

-- Repara compras cuyo bloque de cuotas quedó con vencimientos antes del fin
-- del último congelamiento (efecto del +N relativo anterior).
WITH bounds AS (
  SELECT
    cc.user_moto_compra_id,
    MAX((cc.created_at AT TIME ZONE 'America/Bogota')::date + cc.dias) AS freeze_end
  FROM public.congelamientos_cuotas cc
  GROUP BY cc.user_moto_compra_id
),
mins AS (
  SELECT
    t.user_moto_compra_id,
    MIN(t.fecha_vencimiento) AS v_min
  FROM public.tarifas_pagadas t
  WHERE t.estado IN ('pendiente', 'vencida')
  GROUP BY t.user_moto_compra_id
),
deltas AS (
  SELECT
    b.user_moto_compra_id,
    (b.freeze_end - m.v_min) AS delta
  FROM bounds b
  JOIN mins m ON m.user_moto_compra_id = b.user_moto_compra_id
  WHERE b.freeze_end > m.v_min
)
UPDATE public.tarifas_pagadas t
SET
  fecha_vencimiento = t.fecha_vencimiento + d.delta,
  estado = CASE
    WHEN (t.fecha_vencimiento + d.delta) >= (now() AT TIME ZONE 'America/Bogota')::date
      THEN 'pendiente'
    ELSE 'vencida'
  END,
  updated_at = now()
FROM deltas d
WHERE t.user_moto_compra_id = d.user_moto_compra_id
  AND t.estado IN ('pendiente', 'vencida');

SELECT public.sync_mora_for_compra(d.user_moto_compra_id)
FROM (
  SELECT DISTINCT cc.user_moto_compra_id
  FROM public.congelamientos_cuotas cc
) d;

SELECT public.evaluar_mora_diaria();

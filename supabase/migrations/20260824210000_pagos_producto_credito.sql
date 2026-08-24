-- Pagos de productos a crédito (inicial y cuotas diarias)
-- No deben aplicarse a tarifas de la moto ni contar en atrasos del renting.

ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS compra_producto_credito_id uuid
    REFERENCES public.compra_productos_credito(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_compra_producto_credito
  ON public.pagos (compra_producto_credito_id)
  WHERE compra_producto_credito_id IS NOT NULL;

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_contexto_pago_check;
ALTER TABLE public.pagos
  ADD CONSTRAINT pagos_contexto_pago_check
  CHECK (
    contexto_pago IS NULL
    OR contexto_pago IN (
      'tarifa',
      'inicial',
      'cuota_adelantada',
      'visita',
      'liquidacion',
      'producto_inicial',
      'producto_cuota'
    )
  );

COMMENT ON COLUMN public.pagos.compra_producto_credito_id IS
  'Producto a crédito al que aplica el pago (inicial o cuota diaria).';

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

-- Excluir pagos de productos a crédito del monto pagado del renting
CREATE OR REPLACE VIEW public.atrasos AS
 SELECT c.id AS user_moto_compra_id,
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
            WHEN calc.monto_adeudado <= 0 THEN 'al_dia'::text
            WHEN calc.dias_atraso >= 3 THEN 'moroso'::text
            WHEN calc.monto_adeudado > 0 THEN 'vencido'::text
            ELSE 'al_dia'::text
        END AS estado
   FROM user_moto_compra c
     LEFT JOIN LATERAL ( SELECT dc_1.signed_at
           FROM digital_contracts dc_1
          WHERE dc_1.user_id = c.user_id AND dc_1.status = 'firmado'::text
          ORDER BY dc_1.signed_at DESC NULLS LAST
         LIMIT 1) dc ON true
     CROSS JOIN LATERAL ( SELECT (now() AT TIME ZONE 'America/Bogota'::text)::date AS v_today) tz
     CROSS JOIN LATERAL ( SELECT COALESCE(c.fecha_entrega, (dc.signed_at AT TIME ZONE 'America/Bogota'::text)::date, c.seleccionado_at::date) + 2 AS fecha_inicio) base
     CROSS JOIN LATERAL ( SELECT tpc.dias_intervalo,
            tpc.total_periodos
           FROM tarifa_period_config(c.frecuencia_pago) tpc(total_periodos, dias_intervalo)) cfg
     CROSS JOIN LATERAL ( SELECT COALESCE(( SELECT sum(LEAST(cc.dias, GREATEST(0, tz.v_today - (cc.created_at AT TIME ZONE 'America/Bogota'::text)::date))) AS sum
                   FROM congelamientos_cuotas cc
                  WHERE cc.user_moto_compra_id = c.id), 0::bigint)::integer AS dias_congelados,
            ( SELECT max((cc.created_at AT TIME ZONE 'America/Bogota'::text)::date + cc.dias) AS max
                   FROM congelamientos_cuotas cc
                  WHERE cc.user_moto_compra_id = c.id) AS freeze_end) frz
     CROSS JOIN LATERAL ( SELECT GREATEST(0, LEAST(cfg.total_periodos,
                CASE
                    WHEN tz.v_today < base.fecha_inicio THEN 0
                    ELSE (tz.v_today - base.fecha_inicio - frz.dias_congelados) / NULLIF(cfg.dias_intervalo, 0) + 1
                END)) AS periodos_debidos,
            COALESCE(( SELECT sum(COALESCE(t.monto_pagado, t.monto_esperado, 0)) AS sum
                   FROM tarifas_pagadas t
                  WHERE t.user_moto_compra_id = c.id AND t.estado = 'pagada'::text), 0::bigint) +
                CASE
                    WHEN NOT (EXISTS ( SELECT 1
                       FROM tarifas_pagadas t
                      WHERE t.user_moto_compra_id = c.id)) AND c.pago_cuota_confirmado THEN c.monto_cuota_periodo
                    ELSE 0
                END + COALESCE(( SELECT sum(p.monto) AS sum
                   FROM pagos p
                  WHERE p.user_moto_compra_id = c.id AND p.estado = 'confirmado'::text AND (COALESCE(p.contexto_pago, 'tarifa'::text) <> ALL (ARRAY['inicial'::text, 'visita'::text, 'cuota_adelantada'::text, 'producto_inicial'::text, 'producto_cuota'::text, 'liquidacion'::text])) AND NOT (EXISTS ( SELECT 1
                           FROM pago_tarifa_aplicaciones pta
                          WHERE pta.pago_id = p.id))), 0::bigint) AS monto_pagado_raw) paid
     CROSS JOIN LATERAL ( SELECT paid.periodos_debidos,
            GREATEST(0, floor(paid.monto_pagado_raw::numeric / NULLIF(c.monto_cuota_periodo, 0)::numeric)::integer) AS periodos_pagados,
            paid.periodos_debidos * c.monto_cuota_periodo AS monto_esperado,
            paid.monto_pagado_raw AS monto_pagado,
            GREATEST(0::bigint, paid.periodos_debidos * c.monto_cuota_periodo - paid.monto_pagado_raw) AS monto_adeudado,
                CASE
                    WHEN GREATEST(0::bigint, paid.periodos_debidos * c.monto_cuota_periodo - paid.monto_pagado_raw) <= 0 THEN NULL::date
                    ELSE GREATEST(base.fecha_inicio + frz.dias_congelados + GREATEST(0, floor(paid.monto_pagado_raw::numeric / NULLIF(c.monto_cuota_periodo, 0)::numeric)::integer) * cfg.dias_intervalo, frz.freeze_end)
                END AS fecha_desde_atraso,
                CASE
                    WHEN GREATEST(0::bigint, paid.periodos_debidos * c.monto_cuota_periodo - paid.monto_pagado_raw) <= 0 THEN 0
                    WHEN frz.freeze_end IS NOT NULL AND tz.v_today < frz.freeze_end THEN 0
                    ELSE GREATEST(0, tz.v_today - GREATEST(base.fecha_inicio + frz.dias_congelados + GREATEST(0, floor(paid.monto_pagado_raw::numeric / NULLIF(c.monto_cuota_periodo, 0)::numeric)::integer) * cfg.dias_intervalo, frz.freeze_end) + 1)
                END AS dias_atraso,
            ( SELECT t.id
                   FROM tarifas_pagadas t
                  WHERE t.user_moto_compra_id = c.id AND (t.estado = ANY (ARRAY['pendiente'::text, 'vencida'::text])) AND t.fecha_vencimiento <= tz.v_today
                  ORDER BY t.fecha_vencimiento
                 LIMIT 1) AS tarifa_vencida_id) calc
  WHERE c.estado = 'entregada'::text;

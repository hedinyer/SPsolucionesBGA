-- Marcar entrega con frecuencia diaria hacía timeout:
-- 365 INSERTs × sync_mora (vista atrasos) por fila.
-- Bulk insert + mora solo en UPDATE de tarifas.

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
BEGIN
  SELECT * INTO v_compra FROM public.user_moto_compra WHERE id = p_compra_id;

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

  v_fecha_inicio := COALESCE(
    v_compra.fecha_entrega,
    (now() AT TIME ZONE 'America/Bogota')::date
  ) + 2;

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

  -- Fallback legacy: flag confirmado sin fila de pago
  IF NOT v_tiene_adelantada AND v_compra.pago_cuota_confirmado THEN
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

DROP TRIGGER IF EXISTS trg_sync_mora_on_tarifa_pagada ON public.tarifas_pagadas;
CREATE TRIGGER trg_sync_mora_on_tarifa_pagada
  AFTER UPDATE OF estado, monto_pagado ON public.tarifas_pagadas
  FOR EACH ROW
  WHEN (
    OLD.estado IS DISTINCT FROM NEW.estado
    OR OLD.monto_pagado IS DISTINCT FROM NEW.monto_pagado
  )
  EXECUTE FUNCTION public.sync_mora_on_tarifa_pagada();

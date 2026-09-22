-- Refinanciación: nuevo calendario desde una fecha, con duración y cuota diaria.
-- Conserva tarifas ya pagadas; elimina pendientes/vencidas y genera el nuevo plan.

CREATE OR REPLACE FUNCTION public.refinanciar_compra(
  p_compra_id uuid,
  p_fecha_refinanciacion date,
  p_dias integer,
  p_cuota_diaria integer,
  p_admin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra record;
  v_intervalo integer;
  v_periodos integer;
  v_monto_periodo integer;
  v_offset integer;
  v_borradas integer;
  v_creadas integer;
  v_admin_data jsonb;
BEGIN
  IF p_dias IS NULL OR p_dias < 1 OR p_dias > 1095 THEN
    RAISE EXCEPTION 'Los días de refinanciación deben estar entre 1 y 1095.';
  END IF;
  IF p_cuota_diaria IS NULL OR p_cuota_diaria < 1 THEN
    RAISE EXCEPTION 'La cuota diaria debe ser mayor a 0.';
  END IF;
  IF p_fecha_refinanciacion IS NULL THEN
    RAISE EXCEPTION 'Indica la fecha de refinanciación.';
  END IF;

  SELECT * INTO v_compra
  FROM public.user_moto_compra
  WHERE id = p_compra_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada.';
  END IF;

  IF v_compra.estado <> 'entregada' THEN
    RAISE EXCEPTION 'Solo se puede refinanciar un crédito entregado.';
  END IF;

  SELECT dias_intervalo INTO v_intervalo
  FROM public.tarifa_period_config(v_compra.frecuencia_pago);

  IF v_compra.frecuencia_pago = 'diario' THEN
    v_periodos := p_dias;
    v_monto_periodo := p_cuota_diaria;
  ELSIF v_compra.frecuencia_pago = 'semanal' THEN
    v_periodos := GREATEST(1, ROUND(p_dias::numeric / 7.0)::integer);
    v_monto_periodo := p_cuota_diaria * 7;
  ELSIF v_compra.frecuencia_pago = 'quincenal' THEN
    v_periodos := GREATEST(1, ROUND(p_dias::numeric / 15.0)::integer);
    v_monto_periodo := p_cuota_diaria * 15;
  ELSIF v_compra.frecuencia_pago = 'mensual' THEN
    v_periodos := GREATEST(1, ROUND(p_dias::numeric / 30.0)::integer);
    v_monto_periodo := p_cuota_diaria * 30;
  ELSE
    v_periodos := p_dias;
    v_monto_periodo := p_cuota_diaria;
    v_intervalo := 1;
  END IF;

  DELETE FROM public.tarifas_pagadas
  WHERE user_moto_compra_id = p_compra_id
    AND estado IS DISTINCT FROM 'pagada';

  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  SELECT COALESCE(MAX(numero_periodo), 0) INTO v_offset
  FROM public.tarifas_pagadas
  WHERE user_moto_compra_id = p_compra_id;

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
    v_offset + g,
    p_fecha_refinanciacion + ((g - 1) * v_intervalo),
    v_monto_periodo,
    NULL,
    'pendiente',
    NULL,
    NULL,
    'Refinanciación ' || p_fecha_refinanciacion::text
  FROM generate_series(1, v_periodos) AS g;

  GET DIAGNOSTICS v_creadas = ROW_COUNT;

  v_admin_data := COALESCE(v_compra.admin_data, '{}'::jsonb)
    || jsonb_build_object(
      'dias_contrato', p_dias,
      'refinanciacion', jsonb_build_object(
        'fecha', p_fecha_refinanciacion,
        'dias', p_dias,
        'cuota_diaria', p_cuota_diaria,
        'periodos_nuevos', v_periodos,
        'monto_periodo', v_monto_periodo,
        'at', to_jsonb(now()),
        'by', to_jsonb(p_admin)
      )
    );

  UPDATE public.user_moto_compra
  SET
    monto_cuota_periodo = v_monto_periodo,
    admin_data = v_admin_data,
    updated_at = now()
  WHERE id = p_compra_id;

  IF v_compra.digital_contract_id IS NOT NULL THEN
    UPDATE public.digital_contracts
    SET
      admin_data = COALESCE(admin_data, '{}'::jsonb)
        || jsonb_build_object(
          'valor_cuota', v_monto_periodo,
          'dias_contrato', p_dias
        ),
      updated_at = now()
    WHERE id = v_compra.digital_contract_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tarifasBorradas', v_borradas,
    'tarifasCreadas', v_creadas,
    'periodos', v_periodos,
    'montoPeriodo', v_monto_periodo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refinanciar_compra(uuid, date, integer, integer, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.refinanciar_compra(uuid, date, integer, integer, text) IS
  'Refinancia un crédito entregado: borra tarifas no pagadas y genera un nuevo plan.';

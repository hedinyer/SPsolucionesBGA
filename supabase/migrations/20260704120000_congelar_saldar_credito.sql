-- Congelar cuotas (posponer vencimientos) y liquidación negociada del crédito

ALTER TABLE public.user_moto_compra DROP CONSTRAINT IF EXISTS user_moto_compra_estado_check;

ALTER TABLE public.user_moto_compra
  ADD CONSTRAINT user_moto_compra_estado_check
  CHECK (estado IN ('pendiente_pago', 'lista_retiro', 'entregada', 'cancelada', 'saldada'));

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_contexto_pago_check;

ALTER TABLE public.pagos
  ADD CONSTRAINT pagos_contexto_pago_check
  CHECK (
    contexto_pago IS NULL
    OR contexto_pago IN ('tarifa', 'inicial', 'cuota_adelantada', 'visita', 'liquidacion')
  );

CREATE TABLE IF NOT EXISTS public.congelamientos_cuotas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_moto_compra_id   uuid NOT NULL REFERENCES public.user_moto_compra(id) ON DELETE CASCADE,
  user_id               bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  dias                  integer NOT NULL CHECK (dias > 0),
  observaciones         text,
  creado_por            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_congelamientos_cuotas_compra
  ON public.congelamientos_cuotas (user_moto_compra_id, created_at DESC);

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

  IF v_pago.contexto_pago IN ('inicial', 'cuota_adelantada', 'visita', 'liquidacion') THEN
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

  UPDATE public.tarifas_pagadas
  SET
    fecha_vencimiento = fecha_vencimiento + p_dias,
    estado = CASE
      WHEN estado = 'vencida'
        AND (fecha_vencimiento + p_dias) >= v_today
        THEN 'pendiente'
      ELSE estado
    END,
    updated_at = now()
  WHERE user_moto_compra_id = p_compra_id
    AND estado IN ('pendiente', 'vencida');

  GET DIAGNOSTICS v_afectadas = ROW_COUNT;

  IF v_afectadas = 0 THEN
    RAISE EXCEPTION 'No hay cuotas pendientes o vencidas para congelar.';
  END IF;

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

CREATE OR REPLACE FUNCTION public.saldar_credito_compra(
  p_compra_id uuid,
  p_user_id bigint,
  p_monto integer,
  p_medio_pago_admin text,
  p_referencia text,
  p_comprobante_url text DEFAULT NULL,
  p_notas_admin text DEFAULT NULL,
  p_confirmado_por text DEFAULT 'admin',
  p_fecha_comprobante timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra record;
  v_pago_id uuid;
  v_now timestamptz;
  v_tarifa record;
  v_pendientes integer;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero.';
  END IF;

  IF p_referencia IS NULL OR trim(p_referencia) = '' THEN
    RAISE EXCEPTION 'Ingresa la referencia del pago.';
  END IF;

  SELECT *
  INTO v_compra
  FROM public.user_moto_compra
  WHERE id = p_compra_id
    AND user_id = p_user_id;

  IF v_compra IS NULL THEN
    RAISE EXCEPTION 'Compra no encontrada para este cliente.';
  END IF;

  IF v_compra.estado <> 'entregada' THEN
    RAISE EXCEPTION 'Solo se puede saldar un crédito entregado.';
  END IF;

  SELECT COUNT(*)
  INTO v_pendientes
  FROM public.tarifas_pagadas
  WHERE user_moto_compra_id = p_compra_id
    AND estado <> 'pagada';

  IF v_pendientes = 0 THEN
    RAISE EXCEPTION 'No hay cuotas pendientes para liquidar.';
  END IF;

  v_now := now();

  INSERT INTO public.pagos (
    user_moto_compra_id,
    user_id,
    monto,
    medio_pago_admin,
    referencia,
    comprobante_url,
    origen,
    estado,
    confirmado_at,
    confirmado_por,
    fecha_comprobante,
    contexto_pago,
    notas_admin
  ) VALUES (
    p_compra_id,
    p_user_id,
    p_monto,
    p_medio_pago_admin,
    upper(trim(p_referencia)),
    p_comprobante_url,
    'admin',
    'confirmado',
    v_now,
    p_confirmado_por,
    COALESCE(p_fecha_comprobante, v_now),
    'liquidacion',
    NULLIF(trim(p_notas_admin), '')
  )
  RETURNING id INTO v_pago_id;

  FOR v_tarifa IN
    SELECT id, monto_esperado
    FROM public.tarifas_pagadas
    WHERE user_moto_compra_id = p_compra_id
      AND estado <> 'pagada'
    ORDER BY numero_periodo ASC
  LOOP
    UPDATE public.tarifas_pagadas
    SET
      estado = 'pagada',
      monto_pagado = v_tarifa.monto_esperado,
      pagada_at = v_now,
      confirmada_por = p_confirmado_por,
      notas = trim(both ' ' FROM concat_ws(
        ' · ',
        notas,
        'Liquidación negociada'
      )),
      updated_at = v_now
    WHERE id = v_tarifa.id;

    INSERT INTO public.pago_tarifa_aplicaciones (pago_id, tarifa_id, monto_aplicado)
    VALUES (v_pago_id, v_tarifa.id, v_tarifa.monto_esperado)
    ON CONFLICT (pago_id, tarifa_id) DO NOTHING;
  END LOOP;

  UPDATE public.user_moto_compra
  SET estado = 'saldada'
  WHERE id = p_compra_id;

  PERFORM public.sync_mora_for_compra(p_compra_id);

  RETURN v_pago_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.congelar_cuotas_compra(uuid, integer, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.saldar_credito_compra(uuid, bigint, integer, text, text, text, text, text, timestamptz) TO anon, authenticated, service_role;

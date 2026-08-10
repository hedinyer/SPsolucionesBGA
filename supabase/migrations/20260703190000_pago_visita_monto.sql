-- Cuota de visita domiciliaria en catálogo/compra y pagos contexto visita

ALTER TABLE public.bike_table
  ADD COLUMN IF NOT EXISTS monto_visita integer NOT NULL DEFAULT 50000
    CHECK (monto_visita >= 0);

ALTER TABLE public.user_moto_compra
  ADD COLUMN IF NOT EXISTS monto_visita_monto integer NOT NULL DEFAULT 0
    CHECK (monto_visita_monto >= 0),
  ADD COLUMN IF NOT EXISTS pago_visita_confirmado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pago_visita_confirmado_at timestamptz;

UPDATE public.user_moto_compra c
SET monto_visita_monto = b.monto_visita
FROM public.bike_table b
WHERE b.id = c.bike_id
  AND c.monto_visita_monto = 0
  AND b.monto_visita > 0;

UPDATE public.user_moto_compra
SET monto_total_primer_pago =
  cuota_inicial_monto + monto_cuota_periodo + monto_visita_monto;

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_contexto_pago_check;

ALTER TABLE public.pagos
  ADD CONSTRAINT pagos_contexto_pago_check
  CHECK (
    contexto_pago IS NULL
    OR contexto_pago IN ('tarifa', 'inicial', 'cuota_adelantada', 'visita')
  );

CREATE OR REPLACE FUNCTION public.sync_compra_pago_flags(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra record;
  v_sum_inicial integer;
  v_sum_cuota integer;
  v_sum_visita integer;
  v_inicial_ok boolean;
  v_cuota_ok boolean;
  v_visita_ok boolean;
BEGIN
  SELECT *
  INTO v_compra
  FROM public.user_moto_compra
  WHERE id = p_compra_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_compra.estado NOT IN ('pendiente_pago', 'lista_retiro') THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(monto), 0)
  INTO v_sum_inicial
  FROM public.pagos
  WHERE user_moto_compra_id = p_compra_id
    AND contexto_pago = 'inicial'
    AND estado = 'confirmado';

  SELECT COALESCE(SUM(monto), 0)
  INTO v_sum_cuota
  FROM public.pagos
  WHERE user_moto_compra_id = p_compra_id
    AND contexto_pago = 'cuota_adelantada'
    AND estado = 'confirmado';

  SELECT COALESCE(SUM(monto), 0)
  INTO v_sum_visita
  FROM public.pagos
  WHERE user_moto_compra_id = p_compra_id
    AND contexto_pago = 'visita'
    AND estado = 'confirmado';

  v_inicial_ok := v_sum_inicial >= v_compra.cuota_inicial_monto;
  v_cuota_ok := v_sum_cuota >= v_compra.monto_cuota_periodo;
  v_visita_ok :=
    v_compra.monto_visita_monto <= 0
    OR v_sum_visita >= v_compra.monto_visita_monto;

  UPDATE public.user_moto_compra
  SET
    pago_inicial_confirmado = v_inicial_ok,
    pago_cuota_confirmado = v_cuota_ok,
    pago_visita_confirmado = v_visita_ok,
    pago_inicial_confirmado_at = CASE
      WHEN v_inicial_ok AND NOT pago_inicial_confirmado THEN now()
      WHEN NOT v_inicial_ok THEN NULL
      ELSE pago_inicial_confirmado_at
    END,
    pago_cuota_confirmado_at = CASE
      WHEN v_cuota_ok AND NOT pago_cuota_confirmado THEN now()
      WHEN NOT v_cuota_ok THEN NULL
      ELSE pago_cuota_confirmado_at
    END,
    pago_visita_confirmado_at = CASE
      WHEN v_visita_ok AND NOT pago_visita_confirmado THEN now()
      WHEN NOT v_visita_ok THEN NULL
      ELSE pago_visita_confirmado_at
    END
  WHERE id = p_compra_id
    AND (
      pago_inicial_confirmado IS DISTINCT FROM v_inicial_ok
      OR pago_cuota_confirmado IS DISTINCT FROM v_cuota_ok
      OR pago_visita_confirmado IS DISTINCT FROM v_visita_ok
    );
END;
$$;

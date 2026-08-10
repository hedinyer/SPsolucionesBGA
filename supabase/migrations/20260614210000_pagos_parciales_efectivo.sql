-- Pagos parciales por concepto (inicial / cuota adelantada) y medio efectivo

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_medio_pago_usuario_check;
ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_medio_pago_admin_check;

ALTER TABLE public.pagos
  ADD CONSTRAINT pagos_medio_pago_usuario_check
  CHECK (medio_pago_usuario IN ('nequi', 'davivienda', 'efectivo'));

ALTER TABLE public.pagos
  ADD CONSTRAINT pagos_medio_pago_admin_check
  CHECK (
    medio_pago_admin IS NULL
    OR medio_pago_admin IN (
      'nequi_nicolas', 'nequi_pedro', 'nequi_marisol', 'davivienda', 'efectivo'
    )
  );

CREATE OR REPLACE FUNCTION public.validate_pago()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.origen = 'admin' AND NEW.medio_pago_admin IS NOT NULL THEN
    IF NEW.medio_pago_admin = 'davivienda' THEN
      NEW.medio_pago_usuario := 'davivienda';
    ELSIF NEW.medio_pago_admin = 'efectivo' THEN
      NEW.medio_pago_usuario := 'efectivo';
    ELSE
      NEW.medio_pago_usuario := 'nequi';
    END IF;
  END IF;

  IF NEW.origen = 'usuario' AND NEW.comprobante_url IS NULL THEN
    RAISE EXCEPTION 'Los pagos reportados por el usuario requieren comprobante_url';
  END IF;

  IF NEW.estado = 'confirmado' THEN
    IF NEW.medio_pago_admin IS NULL THEN
      RAISE EXCEPTION 'Un pago confirmado requiere medio_pago_admin';
    END IF;
    IF NEW.confirmado_at IS NULL THEN
      NEW.confirmado_at := now();
    END IF;
  END IF;

  IF NEW.estado = 'rechazado' AND NEW.rechazado_at IS NULL THEN
    NEW.rechazado_at := now();
  END IF;

  IF NEW.origen = 'admin'
     AND NEW.estado = 'confirmado'
     AND TG_OP = 'INSERT'
     AND NEW.confirmado_por IS NULL THEN
    NEW.confirmado_por := 'admin';
  END IF;

  RETURN NEW;
END;
$$;

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
  v_inicial_ok boolean;
  v_cuota_ok boolean;
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

  v_inicial_ok := v_sum_inicial >= v_compra.cuota_inicial_monto;
  v_cuota_ok := v_sum_cuota >= v_compra.monto_cuota_periodo;

  UPDATE public.user_moto_compra
  SET
    pago_inicial_confirmado = v_inicial_ok,
    pago_cuota_confirmado = v_cuota_ok,
    pago_inicial_confirmado_at = CASE
      WHEN v_inicial_ok AND NOT pago_inicial_confirmado THEN now()
      WHEN NOT v_inicial_ok THEN NULL
      ELSE pago_inicial_confirmado_at
    END,
    pago_cuota_confirmado_at = CASE
      WHEN v_cuota_ok AND NOT pago_cuota_confirmado THEN now()
      WHEN NOT v_cuota_ok THEN NULL
      ELSE pago_cuota_confirmado_at
    END
  WHERE id = p_compra_id
    AND (
      pago_inicial_confirmado IS DISTINCT FROM v_inicial_ok
      OR pago_cuota_confirmado IS DISTINCT FROM v_cuota_ok
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_sync_compra_pago_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra_id uuid;
  v_contexto text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_compra_id := OLD.user_moto_compra_id;
    v_contexto := OLD.contexto_pago;
  ELSE
    v_compra_id := NEW.user_moto_compra_id;
    v_contexto := NEW.contexto_pago;
  END IF;

  IF v_contexto IN ('inicial', 'cuota_adelantada') THEN
    PERFORM public.sync_compra_pago_flags(v_compra_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_compra_pago_flags ON public.pagos;
CREATE TRIGGER trg_sync_compra_pago_flags
  AFTER INSERT OR UPDATE OR DELETE ON public.pagos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_compra_pago_flags();

-- Recalcular flags existentes según abonos registrados
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id
    FROM public.user_moto_compra
    WHERE estado IN ('pendiente_pago', 'lista_retiro')
  LOOP
    PERFORM public.sync_compra_pago_flags(v_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_compra_pago_flags(uuid) TO authenticated, service_role;

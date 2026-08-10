-- Medio datáfono en pagos de crédito (presencial)

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_medio_pago_usuario_check;
ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_medio_pago_admin_check;

ALTER TABLE public.pagos
  ADD CONSTRAINT pagos_medio_pago_usuario_check
  CHECK (medio_pago_usuario IN ('nequi', 'davivienda', 'efectivo', 'datafono'));

ALTER TABLE public.pagos
  ADD CONSTRAINT pagos_medio_pago_admin_check
  CHECK (
    medio_pago_admin IS NULL
    OR medio_pago_admin IN (
      'nequi_nicolas', 'nequi_pedro', 'nequi_marisol', 'davivienda', 'efectivo', 'datafono'
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
    ELSIF NEW.medio_pago_admin = 'datafono' THEN
      NEW.medio_pago_usuario := 'datafono';
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

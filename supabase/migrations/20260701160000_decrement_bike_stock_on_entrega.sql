-- El stock del catálogo (bike_table) solo baja al entregar la moto al cliente,
-- no al asignar moto ni al confirmar pagos.

-- Devolver stock reservado prematuramente en compras aún no entregadas
UPDATE public.bike_table b
SET stock = stock + sub.cnt
FROM (
  SELECT bike_id, COUNT(*) AS cnt
  FROM public.user_moto_compra
  WHERE estado = 'lista_retiro'
  GROUP BY bike_id
) sub
WHERE b.id = sub.bike_id;

CREATE OR REPLACE FUNCTION public.sync_compra_estado_on_pago()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pago_inicial_confirmado AND NEW.pago_cuota_confirmado THEN
    IF NOT (OLD.pago_inicial_confirmado AND OLD.pago_cuota_confirmado) THEN
      NEW.estado := 'lista_retiro';

      IF NEW.pago_inicial_confirmado_at IS NULL THEN
        NEW.pago_inicial_confirmado_at := now();
      END IF;
      IF NEW.pago_cuota_confirmado_at IS NULL THEN
        NEW.pago_cuota_confirmado_at := now();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_bike_stock_on_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'entregada'
     AND (OLD.estado IS DISTINCT FROM 'entregada')
     AND NEW.bike_id IS NOT NULL THEN
    UPDATE public.bike_table
    SET stock = GREATEST(stock - 1, 0)
    WHERE id = NEW.bike_id AND stock > 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_bike_stock_on_entrega ON public.user_moto_compra;
CREATE TRIGGER trg_decrement_bike_stock_on_entrega
  AFTER UPDATE ON public.user_moto_compra
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_bike_stock_on_entrega();

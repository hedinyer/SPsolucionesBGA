-- Estados nuevos de garaje + precios para crédito
ALTER TABLE public.garaje_motos DROP CONSTRAINT IF EXISTS garaje_motos_estado_check;
ALTER TABLE public.garaje_motos
  ADD CONSTRAINT garaje_motos_estado_check
  CHECK (estado = ANY (ARRAY[
    'en_garaje'::text,
    'retenida'::text,
    'en_mantenimiento'::text,
    'disponible'::text,
    'vendida'::text,
    'devuelta'::text,
    'baja'::text
  ]));

ALTER TABLE public.garaje_motos
  ADD COLUMN IF NOT EXISTS cuota_inicial integer,
  ADD COLUMN IF NOT EXISTS cuota_diaria integer,
  ADD COLUMN IF NOT EXISTS monto_visita integer;

-- Trigger: recuperadas entran como retenida
CREATE OR REPLACE FUNCTION public.sync_garaje_on_moto_recogida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  compra record;
BEGIN
  IF NEW.estado = 'recogida'
     AND (OLD.estado IS DISTINCT FROM 'recogida') THEN
    IF NEW.fecha_recogida IS NULL THEN
      NEW.fecha_recogida := now();
    END IF;
    SELECT modelo, color, placa, referencia, chasis
    INTO compra
    FROM public.user_moto_compra
    WHERE id = NEW.user_moto_compra_id;
    IF FOUND THEN
      INSERT INTO public.garaje_motos (
        placa, referencia, modelo, color, origen, condicion, estado,
        moto_para_recoger_id, user_moto_compra_id, notas
      ) VALUES (
        compra.placa,
        COALESCE(NULLIF(trim(compra.referencia), ''), NULLIF(trim(compra.chasis), ''), 'sin-referencia'),
        compra.modelo, compra.color, 'recuperacion', 'recuperada', 'retenida',
        NEW.id, NEW.user_moto_compra_id,
        'Creado automáticamente al marcar moto como recogida.'
      )
      ON CONFLICT (moto_para_recoger_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TABLE IF NOT EXISTS public.garaje_mantenimiento_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  garaje_moto_id uuid NOT NULL REFERENCES public.garaje_motos(id) ON DELETE CASCADE,
  producto_id bigint NOT NULL REFERENCES public.inventario_productos(id),
  cantidad integer NOT NULL CHECK (cantidad > 0),
  costo_unitario integer NOT NULL DEFAULT 0,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

CREATE INDEX IF NOT EXISTS garaje_mantenimiento_items_moto_idx
  ON public.garaje_mantenimiento_items (garaje_moto_id);

ALTER TABLE public.user_moto_compra
  ADD COLUMN IF NOT EXISTS garaje_moto_id uuid REFERENCES public.garaje_motos(id);

CREATE INDEX IF NOT EXISTS user_moto_compra_garaje_moto_idx
  ON public.user_moto_compra (garaje_moto_id)
  WHERE garaje_moto_id IS NOT NULL;

-- Fix Linda (crédito liquidado que quedó como entregada)
UPDATE public.user_moto_compra
SET estado = 'saldada', updated_at = now()
WHERE id = 'aee03cb3-60e1-47a8-98b1-12fc8c655b76'
  AND estado = 'entregada';

ALTER TABLE public.user_moto_compra ALTER COLUMN bike_id DROP NOT NULL;


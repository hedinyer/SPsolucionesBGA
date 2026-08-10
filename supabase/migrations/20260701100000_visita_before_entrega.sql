-- Visita domiciliaria antes de la entrega física de la moto.

CREATE OR REPLACE FUNCTION public.ensure_visita_on_lista_retiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contract_row public.digital_contracts%ROWTYPE;
BEGIN
  IF NEW.estado = 'lista_retiro'
     AND (OLD.estado IS DISTINCT FROM 'lista_retiro') THEN

    IF NEW.digital_contract_id IS NOT NULL THEN
      SELECT * INTO contract_row
      FROM public.digital_contracts
      WHERE id = NEW.digital_contract_id;
    ELSE
      SELECT * INTO contract_row
      FROM public.digital_contracts
      WHERE user_id = NEW.user_id AND status = 'firmado'
      ORDER BY updated_at DESC
      LIMIT 1;
    END IF;

    INSERT INTO public.visitas (
      user_id,
      digital_contract_id,
      cliente_nombre,
      cliente_celular,
      direccion_visita,
      barrio
    )
    VALUES (
      NEW.user_id,
      contract_row.id,
      COALESCE(contract_row.hoja_vida_data->>'nombre_completo', ''),
      COALESCE(contract_row.hoja_vida_data->>'celular', ''),
      COALESCE(contract_row.hoja_vida_data->>'direccion', ''),
      COALESCE(contract_row.hoja_vida_data->>'barrio', '')
    )
    ON CONFLICT (user_id) DO UPDATE SET
      digital_contract_id = EXCLUDED.digital_contract_id,
      cliente_nombre = EXCLUDED.cliente_nombre,
      cliente_celular = EXCLUDED.cliente_celular,
      direccion_visita = EXCLUDED.direccion_visita,
      barrio = EXCLUDED.barrio,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_visita_on_entrega ON public.user_moto_compra;
DROP FUNCTION IF EXISTS public.ensure_visita_on_entrega();

CREATE TRIGGER trg_ensure_visita_on_lista_retiro
  AFTER UPDATE ON public.user_moto_compra
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_visita_on_lista_retiro();

-- Motos ya en lista_retiro sin visita
INSERT INTO public.visitas (
  user_id,
  digital_contract_id,
  cliente_nombre,
  cliente_celular,
  direccion_visita,
  barrio
)
SELECT
  c.user_id,
  dc.id,
  COALESCE(dc.hoja_vida_data->>'nombre_completo', ''),
  COALESCE(dc.hoja_vida_data->>'celular', ''),
  COALESCE(dc.hoja_vida_data->>'direccion', ''),
  COALESCE(dc.hoja_vida_data->>'barrio', '')
FROM public.user_moto_compra c
LEFT JOIN public.digital_contracts dc
  ON dc.id = COALESCE(
    c.digital_contract_id,
    (
      SELECT id
      FROM public.digital_contracts
      WHERE user_id = c.user_id AND status = 'firmado'
      ORDER BY updated_at DESC
      LIMIT 1
    )
  )
WHERE c.estado IN ('lista_retiro', 'entregada')
  AND NOT EXISTS (
    SELECT 1 FROM public.visitas v WHERE v.user_id = c.user_id
  )
ON CONFLICT (user_id) DO NOTHING;

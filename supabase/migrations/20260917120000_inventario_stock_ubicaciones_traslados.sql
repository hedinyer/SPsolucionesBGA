-- Stock por sede + ledger de traslados + sede en ítems de venta
-- Incluye prerequisitos (ubicacion/gaveta/novedades) por si no estaban aplicadas.

-- 0a) Ubicación / gaveta en productos
ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS ubicacion text;

UPDATE public.inventario_productos
SET ubicacion = 'Soluciones'
WHERE ubicacion IS NULL;

ALTER TABLE public.inventario_productos
  ALTER COLUMN ubicacion SET DEFAULT 'Soluciones';

ALTER TABLE public.inventario_productos
  ALTER COLUMN ubicacion SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventario_productos_ubicacion_check'
  ) THEN
    ALTER TABLE public.inventario_productos
      ADD CONSTRAINT inventario_productos_ubicacion_check
      CHECK (ubicacion IN ('Soluciones', 'Bera', 'Bodega'));
  END IF;
END $$;

ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS gaveta text;

ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS editado_por text;

ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS motivo_edicion text;

ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS editado_at timestamptz;

ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS eliminado_por text;

ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS motivo_eliminacion text;

ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS eliminado_at timestamptz;

-- 0b) Novedades
CREATE TABLE IF NOT EXISTS public.inventario_producto_novedades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id bigint NOT NULL REFERENCES public.inventario_productos(id) ON DELETE CASCADE,
  tipo        text NOT NULL,
  autor       text NOT NULL,
  contenido   text NOT NULL,
  detalle     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventario_producto_novedades_producto
  ON public.inventario_producto_novedades (producto_id, created_at DESC);

ALTER TABLE public.inventario_producto_novedades
  DROP CONSTRAINT IF EXISTS inventario_producto_novedades_tipo_check;

ALTER TABLE public.inventario_producto_novedades
  ADD CONSTRAINT inventario_producto_novedades_tipo_check
  CHECK (tipo IN ('anotacion', 'edicion', 'eliminacion', 'creacion', 'traslado'));

GRANT SELECT, INSERT ON public.inventario_producto_novedades TO anon, authenticated;

-- 1) Stock por ubicación
CREATE TABLE IF NOT EXISTS public.inventario_stock_ubicaciones (
  producto_id bigint NOT NULL REFERENCES public.inventario_productos(id) ON DELETE CASCADE,
  ubicacion text NOT NULL CHECK (ubicacion IN ('Soluciones', 'Bera', 'Bodega')),
  cantidad integer NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  gaveta text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, ubicacion),
  CONSTRAINT inventario_stock_ubicaciones_gaveta_bodega_check
    CHECK (ubicacion = 'Bodega' OR gaveta IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_inventario_stock_ubicaciones_ubicacion
  ON public.inventario_stock_ubicaciones (ubicacion)
  WHERE cantidad > 0;

COMMENT ON TABLE public.inventario_stock_ubicaciones IS
  'Cantidad de cada producto por sede (Soluciones / Bera / Bodega).';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_stock_ubicaciones TO anon, authenticated;

-- 2) Ledger de traslados
CREATE TABLE IF NOT EXISTS public.inventario_traslados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id bigint NOT NULL REFERENCES public.inventario_productos(id) ON DELETE CASCADE,
  desde text NOT NULL CHECK (desde IN ('Soluciones', 'Bera', 'Bodega')),
  hacia text NOT NULL CHECK (hacia IN ('Soluciones', 'Bera', 'Bodega')),
  cantidad integer NOT NULL CHECK (cantidad > 0),
  autor text NOT NULL,
  nota text,
  gaveta_destino text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventario_traslados_distintos CHECK (desde <> hacia)
);

CREATE INDEX IF NOT EXISTS idx_inventario_traslados_producto
  ON public.inventario_traslados (producto_id, created_at DESC);

COMMENT ON TABLE public.inventario_traslados IS
  'Constancia inmutable de traslados de inventario entre sedes.';

GRANT SELECT, INSERT ON public.inventario_traslados TO anon, authenticated;

-- 3) Sede en ítems de venta
ALTER TABLE public.venta_producto_items
  ADD COLUMN IF NOT EXISTS ubicacion text;

UPDATE public.venta_producto_items vpi
SET ubicacion = COALESCE(ip.ubicacion, 'Soluciones')
FROM public.inventario_productos ip
WHERE vpi.producto_id = ip.id
  AND vpi.ubicacion IS NULL;

UPDATE public.venta_producto_items
SET ubicacion = 'Soluciones'
WHERE ubicacion IS NULL;

ALTER TABLE public.venta_producto_items
  ALTER COLUMN ubicacion SET DEFAULT 'Soluciones';

ALTER TABLE public.venta_producto_items
  ALTER COLUMN ubicacion SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'venta_producto_items_ubicacion_check'
  ) THEN
    ALTER TABLE public.venta_producto_items
      ADD CONSTRAINT venta_producto_items_ubicacion_check
      CHECK (ubicacion IN ('Soluciones', 'Bera', 'Bodega'));
  END IF;
END $$;

-- 4) Backfill: 3 filas por producto
INSERT INTO public.inventario_stock_ubicaciones (producto_id, ubicacion, cantidad, gaveta)
SELECT
  p.id,
  u.ubicacion,
  CASE
    WHEN u.ubicacion = COALESCE(p.ubicacion, 'Soluciones') THEN GREATEST(p.stock, 0)
    ELSE 0
  END,
  CASE
    WHEN u.ubicacion = 'Bodega' AND COALESCE(p.ubicacion, 'Soluciones') = 'Bodega'
      THEN p.gaveta
    ELSE NULL
  END
FROM public.inventario_productos p
CROSS JOIN (VALUES ('Soluciones'), ('Bera'), ('Bodega')) AS u(ubicacion)
ON CONFLICT (producto_id, ubicacion) DO NOTHING;

UPDATE public.inventario_productos p
SET stock = COALESCE((
  SELECT SUM(s.cantidad)
  FROM public.inventario_stock_ubicaciones s
  WHERE s.producto_id = p.id
), 0);

-- 5) Helpers
CREATE OR REPLACE FUNCTION public.sync_producto_stock_total(p_producto_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.inventario_productos
  SET stock = COALESCE((
    SELECT SUM(cantidad)
    FROM public.inventario_stock_ubicaciones
    WHERE producto_id = p_producto_id
  ), 0)
  WHERE id = p_producto_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_stock_ubicaciones(p_producto_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.inventario_stock_ubicaciones (producto_id, ubicacion, cantidad)
  VALUES
    (p_producto_id, 'Soluciones', 0),
    (p_producto_id, 'Bera', 0),
    (p_producto_id, 'Bodega', 0)
  ON CONFLICT (producto_id, ubicacion) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.descontar_stock_fifo_ubicaciones(
  p_producto_id bigint,
  p_cantidad integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_restante integer := p_cantidad;
  v_ubicacion text;
  v_disponible integer;
  v_tomar integer;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN;
  END IF;

  PERFORM public.ensure_stock_ubicaciones(p_producto_id);

  FOR v_ubicacion IN
    SELECT unnest(ARRAY['Soluciones', 'Bera', 'Bodega'])
  LOOP
    EXIT WHEN v_restante <= 0;
    SELECT cantidad INTO v_disponible
    FROM public.inventario_stock_ubicaciones
    WHERE producto_id = p_producto_id AND ubicacion = v_ubicacion
    FOR UPDATE;

    v_disponible := COALESCE(v_disponible, 0);
    IF v_disponible <= 0 THEN
      CONTINUE;
    END IF;

    v_tomar := LEAST(v_disponible, v_restante);
    UPDATE public.inventario_stock_ubicaciones
    SET cantidad = cantidad - v_tomar, updated_at = now()
    WHERE producto_id = p_producto_id AND ubicacion = v_ubicacion;

    v_restante := v_restante - v_tomar;
  END LOOP;

  IF v_restante > 0 THEN
    RAISE EXCEPTION 'Stock insuficiente por sede para producto %', p_producto_id;
  END IF;

  PERFORM public.sync_producto_stock_total(p_producto_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.devolver_stock_ubicacion(
  p_producto_id bigint,
  p_cantidad integer,
  p_ubicacion text DEFAULT 'Soluciones'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN;
  END IF;
  IF p_ubicacion NOT IN ('Soluciones', 'Bera', 'Bodega') THEN
    RAISE EXCEPTION 'Ubicación inválida: %', p_ubicacion;
  END IF;

  PERFORM public.ensure_stock_ubicaciones(p_producto_id);

  UPDATE public.inventario_stock_ubicaciones
  SET cantidad = cantidad + p_cantidad, updated_at = now()
  WHERE producto_id = p_producto_id AND ubicacion = p_ubicacion;

  PERFORM public.sync_producto_stock_total(p_producto_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.descontar_stock_ubicacion(
  p_producto_id bigint,
  p_ubicacion text,
  p_cantidad integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_disponible integer;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN;
  END IF;
  IF p_ubicacion NOT IN ('Soluciones', 'Bera', 'Bodega') THEN
    RAISE EXCEPTION 'Ubicación inválida: %', p_ubicacion;
  END IF;

  PERFORM public.ensure_stock_ubicaciones(p_producto_id);

  SELECT cantidad INTO v_disponible
  FROM public.inventario_stock_ubicaciones
  WHERE producto_id = p_producto_id AND ubicacion = p_ubicacion
  FOR UPDATE;

  IF COALESCE(v_disponible, 0) < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente en % (hay %)', p_ubicacion, COALESCE(v_disponible, 0);
  END IF;

  UPDATE public.inventario_stock_ubicaciones
  SET cantidad = cantidad - p_cantidad, updated_at = now()
  WHERE producto_id = p_producto_id AND ubicacion = p_ubicacion;

  PERFORM public.sync_producto_stock_total(p_producto_id);
END;
$$;

-- 6) RPC traslado atómico
CREATE OR REPLACE FUNCTION public.trasladar_inventario(
  p_producto_id bigint,
  p_desde text,
  p_hacia text,
  p_cantidad integer,
  p_autor text,
  p_nota text DEFAULT NULL,
  p_gaveta_destino text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origen integer;
  v_traslado_id uuid;
  v_label_desde text;
  v_label_hacia text;
BEGIN
  IF p_producto_id IS NULL THEN
    RAISE EXCEPTION 'Producto requerido';
  END IF;
  IF p_desde IS NULL OR p_hacia IS NULL
     OR p_desde NOT IN ('Soluciones', 'Bera', 'Bodega')
     OR p_hacia NOT IN ('Soluciones', 'Bera', 'Bodega') THEN
    RAISE EXCEPTION 'Ubicaciones inválidas';
  END IF;
  IF p_desde = p_hacia THEN
    RAISE EXCEPTION 'Origen y destino deben ser distintos';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que cero';
  END IF;
  IF p_autor IS NULL OR btrim(p_autor) = '' THEN
    RAISE EXCEPTION 'Autor requerido';
  END IF;

  PERFORM public.ensure_stock_ubicaciones(p_producto_id);

  SELECT cantidad INTO v_origen
  FROM public.inventario_stock_ubicaciones
  WHERE producto_id = p_producto_id AND ubicacion = p_desde
  FOR UPDATE;

  IF COALESCE(v_origen, 0) < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente en % (hay %)', p_desde, COALESCE(v_origen, 0);
  END IF;

  UPDATE public.inventario_stock_ubicaciones
  SET cantidad = cantidad - p_cantidad, updated_at = now()
  WHERE producto_id = p_producto_id AND ubicacion = p_desde;

  UPDATE public.inventario_stock_ubicaciones
  SET
    cantidad = cantidad + p_cantidad,
    gaveta = CASE
      WHEN p_hacia = 'Bodega' AND p_gaveta_destino IS NOT NULL AND btrim(p_gaveta_destino) <> ''
        THEN btrim(p_gaveta_destino)
      ELSE gaveta
    END,
    updated_at = now()
  WHERE producto_id = p_producto_id AND ubicacion = p_hacia;

  UPDATE public.inventario_productos p
  SET
    stock = COALESCE((
      SELECT SUM(s.cantidad) FROM public.inventario_stock_ubicaciones s WHERE s.producto_id = p.id
    ), 0),
    ubicacion = (
      SELECT s.ubicacion
      FROM public.inventario_stock_ubicaciones s
      WHERE s.producto_id = p.id
      ORDER BY s.cantidad DESC, CASE s.ubicacion
        WHEN 'Soluciones' THEN 1 WHEN 'Bera' THEN 2 ELSE 3 END
      LIMIT 1
    ),
    gaveta = (
      SELECT s.gaveta
      FROM public.inventario_stock_ubicaciones s
      WHERE s.producto_id = p.id AND s.ubicacion = 'Bodega'
      LIMIT 1
    )
  WHERE p.id = p_producto_id;

  INSERT INTO public.inventario_traslados (
    producto_id, desde, hacia, cantidad, autor, nota, gaveta_destino
  ) VALUES (
    p_producto_id, p_desde, p_hacia, p_cantidad, btrim(p_autor),
    NULLIF(btrim(COALESCE(p_nota, '')), ''),
    CASE WHEN p_hacia = 'Bodega' THEN NULLIF(btrim(COALESCE(p_gaveta_destino, '')), '') ELSE NULL END
  )
  RETURNING id INTO v_traslado_id;

  v_label_desde := CASE WHEN p_desde = 'Soluciones' THEN 'Soluciones Pinilla' ELSE p_desde END;
  v_label_hacia := CASE WHEN p_hacia = 'Soluciones' THEN 'Soluciones Pinilla' ELSE p_hacia END;

  INSERT INTO public.inventario_producto_novedades (
    producto_id, tipo, autor, contenido, detalle
  ) VALUES (
    p_producto_id,
    'traslado',
    btrim(p_autor),
    format('Trasladó %s de %s → %s', p_cantidad, v_label_desde, v_label_hacia),
    jsonb_build_object(
      'traslado_id', v_traslado_id,
      'desde', p_desde,
      'hacia', p_hacia,
      'cantidad', p_cantidad,
      'cambios', jsonb_build_array(
        format('%s → %s: %s und', v_label_desde, v_label_hacia, p_cantidad)
      )
    )
  );

  RETURN v_traslado_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trasladar_inventario(bigint, text, text, integer, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_producto_stock_total(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_stock_ubicaciones(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descontar_stock_fifo_ubicaciones(bigint, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_stock_ubicacion(bigint, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descontar_stock_ubicacion(bigint, text, integer) TO anon, authenticated;

-- 7) Trigger solicitudes: descontar por sede
CREATE OR REPLACE FUNCTION public.decrement_stock_on_solicitud_completada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_item record;
BEGIN
  IF NEW.estado = 'completada' AND (OLD.estado IS DISTINCT FROM 'completada') THEN
    FOR v_item IN
      SELECT producto_id, cantidad
      FROM public.solicitud_repuesto_items
      WHERE solicitud_id = NEW.id
    LOOP
      PERFORM public.descontar_stock_fifo_ubicaciones(v_item.producto_id, v_item.cantidad);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

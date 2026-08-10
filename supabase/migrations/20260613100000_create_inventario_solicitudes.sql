-- Inventario tienda + solicitudes de taller

CREATE TABLE IF NOT EXISTS public.inventario_categorias (
  id          bigserial PRIMARY KEY,
  nombre      text NOT NULL,
  slug        text NOT NULL UNIQUE,
  descripcion text,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventario_productos (
  id                  bigserial PRIMARY KEY,
  categoria_id        bigint NOT NULL REFERENCES public.inventario_categorias(id) ON DELETE RESTRICT,
  sku                 text NOT NULL UNIQUE,
  nombre              text NOT NULL,
  descripcion         text,
  precio              integer NOT NULL CHECK (precio >= 0),
  stock               integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_minimo        integer NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  imagen_url          text,
  compatible_modelos  text[] NOT NULL DEFAULT '{}',
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventario_productos_categoria_activo
  ON public.inventario_productos (categoria_id, activo);

CREATE INDEX IF NOT EXISTS idx_inventario_productos_activo_stock
  ON public.inventario_productos (activo, stock);

CREATE TABLE IF NOT EXISTS public.solicitudes_taller (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_moto_compra_id   uuid REFERENCES public.user_moto_compra(id) ON DELETE SET NULL,
  tipo                  text NOT NULL
    CHECK (tipo IN ('repuestos', 'reparacion', 'cambio_aceite')),
  estado                text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_proceso', 'completada', 'cancelada')),
  notas_cliente         text,
  notas_admin           text,
  fecha_preferida       date,
  descripcion_falla     text,
  total_estimado        integer NOT NULL DEFAULT 0 CHECK (total_estimado >= 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_taller_user_id
  ON public.solicitudes_taller (user_id);

CREATE INDEX IF NOT EXISTS idx_solicitudes_taller_estado
  ON public.solicitudes_taller (estado);

CREATE INDEX IF NOT EXISTS idx_solicitudes_taller_tipo_estado
  ON public.solicitudes_taller (tipo, estado);

CREATE TABLE IF NOT EXISTS public.solicitud_repuesto_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id    uuid NOT NULL REFERENCES public.solicitudes_taller(id) ON DELETE CASCADE,
  producto_id     bigint NOT NULL REFERENCES public.inventario_productos(id) ON DELETE RESTRICT,
  cantidad        integer NOT NULL CHECK (cantidad > 0),
  precio_unitario integer NOT NULL CHECK (precio_unitario >= 0),
  subtotal        integer NOT NULL CHECK (subtotal >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitud_repuesto_items_solicitud
  ON public.solicitud_repuesto_items (solicitud_id);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.set_inventario_categorias_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_inventario_categorias_updated_at ON public.inventario_categorias;
CREATE TRIGGER trg_inventario_categorias_updated_at
  BEFORE UPDATE ON public.inventario_categorias
  FOR EACH ROW EXECUTE FUNCTION public.set_inventario_categorias_updated_at();

CREATE OR REPLACE FUNCTION public.set_inventario_productos_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_inventario_productos_updated_at ON public.inventario_productos;
CREATE TRIGGER trg_inventario_productos_updated_at
  BEFORE UPDATE ON public.inventario_productos
  FOR EACH ROW EXECUTE FUNCTION public.set_inventario_productos_updated_at();

CREATE OR REPLACE FUNCTION public.set_solicitudes_taller_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_solicitudes_taller_updated_at ON public.solicitudes_taller;
CREATE TRIGGER trg_solicitudes_taller_updated_at
  BEFORE UPDATE ON public.solicitudes_taller
  FOR EACH ROW EXECUTE FUNCTION public.set_solicitudes_taller_updated_at();

-- Validate repuestos stock on insert items (via RPC from app) and on complete
CREATE OR REPLACE FUNCTION public.decrement_stock_on_solicitud_completada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
BEGIN
  IF NEW.estado = 'completada'
     AND OLD.estado IS DISTINCT FROM 'completada'
     AND NEW.tipo = 'repuestos' THEN
    FOR v_item IN
      SELECT producto_id, cantidad
      FROM public.solicitud_repuesto_items
      WHERE solicitud_id = NEW.id
    LOOP
      UPDATE public.inventario_productos
      SET stock = GREATEST(stock - v_item.cantidad, 0)
      WHERE id = v_item.producto_id;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_stock_on_solicitud_completada ON public.solicitudes_taller;
CREATE TRIGGER trg_decrement_stock_on_solicitud_completada
  AFTER UPDATE ON public.solicitudes_taller
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_stock_on_solicitud_completada();

-- RPC: create repuestos solicitud with stock validation
CREATE OR REPLACE FUNCTION public.create_solicitud_repuestos(
  p_user_id bigint,
  p_user_moto_compra_id uuid,
  p_notas_cliente text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solicitud_id uuid;
  v_item jsonb;
  v_producto record;
  v_total integer := 0;
  v_cantidad integer;
  v_producto_id bigint;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El carrito está vacío';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := (v_item->>'producto_id')::bigint;
    v_cantidad := (v_item->>'cantidad')::integer;

    SELECT id, precio, stock, activo, nombre
    INTO v_producto
    FROM public.inventario_productos
    WHERE id = v_producto_id;

    IF v_producto IS NULL OR NOT v_producto.activo THEN
      RAISE EXCEPTION 'Producto no disponible: %', v_producto_id;
    END IF;

    IF v_producto.stock < v_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente para %', v_producto.nombre;
    END IF;

    v_total := v_total + (v_producto.precio * v_cantidad);
  END LOOP;

  INSERT INTO public.solicitudes_taller (
    user_id, user_moto_compra_id, tipo, estado,
    notas_cliente, total_estimado
  ) VALUES (
    p_user_id, p_user_moto_compra_id, 'repuestos', 'pendiente',
    p_notas_cliente, v_total
  )
  RETURNING id INTO v_solicitud_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := (v_item->>'producto_id')::bigint;
    v_cantidad := (v_item->>'cantidad')::integer;

    SELECT precio INTO v_producto
    FROM public.inventario_productos
    WHERE id = v_producto_id;

    INSERT INTO public.solicitud_repuesto_items (
      solicitud_id, producto_id, cantidad, precio_unitario, subtotal
    ) VALUES (
      v_solicitud_id,
      v_producto_id,
      v_cantidad,
      v_producto.precio,
      v_producto.precio * v_cantidad
    );
  END LOOP;

  RETURN v_solicitud_id;
END;
$$;

-- Seed categorías
INSERT INTO public.inventario_categorias (nombre, slug, descripcion, orden)
VALUES
  ('Repuestos', 'repuestos', 'Partes y componentes para motos', 1),
  ('Lubricantes', 'lubricantes', 'Aceites y lubricantes', 2),
  ('Accesorios', 'accesorios', 'Accesorios y complementos', 3)
ON CONFLICT (slug) DO NOTHING;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventario-imagenes',
  'inventario-imagenes',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow public read inventario images'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow public read inventario images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'inventario-imagenes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin upload inventario images'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin upload inventario images"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'inventario-imagenes');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Allow admin update inventario images'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Allow admin update inventario images"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'inventario-imagenes');
  END IF;
END;
$$;

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'solicitudes_taller'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitudes_taller;
  END IF;
END;
$$;

ALTER TABLE public.solicitudes_taller REPLICA IDENTITY FULL;

-- Permissions
GRANT SELECT ON public.inventario_categorias TO anon, authenticated;
GRANT SELECT ON public.inventario_productos TO anon, authenticated;
GRANT SELECT, INSERT ON public.solicitudes_taller TO anon, authenticated;
GRANT SELECT, INSERT ON public.solicitud_repuesto_items TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_solicitud_repuestos(bigint, uuid, text, jsonb) TO anon, authenticated;

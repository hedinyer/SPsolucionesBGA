-- Ejecutar en Supabase Dashboard → SQL Editor
-- Proyecto: hvtbzxifzkbvmqpshmqw
-- Crea inventario con columna costo incluida.

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
  costo               integer NOT NULL DEFAULT 0 CHECK (costo >= 0),
  stock               integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_minimo        integer NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  imagen_url          text,
  compatible_modelos  text[] NOT NULL DEFAULT '{}',
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Si la tabla ya existía sin costo, agregar la columna:
ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS costo integer NOT NULL DEFAULT 0 CHECK (costo >= 0);

CREATE INDEX IF NOT EXISTS idx_inventario_productos_categoria_activo
  ON public.inventario_productos (categoria_id, activo);

CREATE INDEX IF NOT EXISTS idx_inventario_productos_activo_stock
  ON public.inventario_productos (activo, stock);

INSERT INTO public.inventario_categorias (nombre, slug, descripcion, orden)
VALUES
  ('Repuestos', 'repuestos', 'Partes y componentes para motos', 1),
  ('Lubricantes', 'lubricantes', 'Aceites y lubricantes', 2),
  ('Accesorios', 'accesorios', 'Accesorios y complementos', 3)
ON CONFLICT (slug) DO NOTHING;

GRANT SELECT ON public.inventario_categorias TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_productos TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_categorias TO anon, authenticated;

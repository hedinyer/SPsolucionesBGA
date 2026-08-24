-- Ubicación física del stock (un solo stock total; no dual Soluciones/Bera)
ALTER TABLE public.inventario_productos
  ADD COLUMN IF NOT EXISTS ubicacion text NOT NULL DEFAULT 'Soluciones';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventario_productos_ubicacion_check'
  ) THEN
    ALTER TABLE public.inventario_productos
      ADD CONSTRAINT inventario_productos_ubicacion_check
      CHECK (ubicacion IN ('Soluciones', 'Bera', 'Bodega'));
  END IF;
END $$;

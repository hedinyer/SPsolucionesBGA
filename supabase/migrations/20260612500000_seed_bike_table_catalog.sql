-- Catálogo inicial de motos en tienda (modelo + color + stock)
-- El admin puede ajustar stock, cuota_inicial e imagen_url desde su software.

INSERT INTO public.bike_table (
  modelo,
  color,
  stock,
  cuota_inicial,
  cuota_diaria,
  descripcion,
  activo
)
VALUES
  (
    'Bera SBR 150',
    'Negro',
    3,
    500000,
    38000,
    'Urbana · 150 cc · 4 tiempos',
    true
  ),
  (
    'Bera GBR 200',
    'Negra',
    2,
    500000,
    38000,
    'Deportiva · 200 cc · doble disco',
    true
  ),
  (
    'Bera GBR 200',
    'Blanca',
    2,
    500000,
    38000,
    'Deportiva · 200 cc · doble disco',
    true
  ),
  (
    'Bera GBR 200',
    'Amarilla',
    1,
    500000,
    38000,
    'Deportiva · 200 cc · doble disco',
    true
  ),
  (
    'Bera Milan 150',
    'Negra',
    2,
    500000,
    38000,
    'Automática CVT · 150 cc',
    true
  ),
  (
    'Bera Milan 150',
    'Azul',
    2,
    500000,
    38000,
    'Automática CVT · 150 cc',
    true
  ),
  (
    'Bera Milan 150',
    'Rosa',
    1,
    500000,
    38000,
    'Automática CVT · 150 cc',
    true
  ),
  (
    'AKT NKD 125',
    'Negro',
    3,
    500000,
    38000,
    'Clásica · 124 cc · CBS',
    true
  )
ON CONFLICT (modelo, color) DO NOTHING;

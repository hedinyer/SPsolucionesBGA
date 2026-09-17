-- Entrega operativa de motos vendidas de contado (salen del listado operativo).
alter table public.ventas_moto
  add column if not exists entregada_at timestamptz;

comment on column public.ventas_moto.entregada_at is
  'Fecha/hora en que se marcó la moto como entregada al cliente. NULL = pendiente en tabla Contado.';

create index if not exists ventas_moto_pendientes_idx
  on public.ventas_moto (created_at desc)
  where entregada_at is null;

-- Cajas (puestos de cobro) y turnos.
-- Regla: una caja tiene a lo sumo un turno abierto; un usuario también.
-- Las RPC abrir_turno / cerrar_turno están en la migración de turnos.

create table public.cajas (
  id        bigint generated always as identity primary key,
  nombre    text not null unique check (btrim(nombre) <> ''),
  activa    boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.turnos (
  id                  bigint generated always as identity primary key,
  caja_id             bigint not null references public.cajas (id),
  usuario_id          uuid not null references public.perfiles (id),
  abierto_en          timestamptz not null default now(),
  cerrado_en          timestamptz,
  observaciones       text,
  -- Foto de totales al cerrar (las vistas calculan los valores en vivo).
  cantidad_ventas     integer,
  total_efectivo      numeric(12,2),
  total_transferencia numeric(12,2),
  total_tarjeta       numeric(12,2),
  total_gastos        numeric(12,2),
  check (cerrado_en is null or cerrado_en >= abierto_en)
);

create unique index turnos_un_abierto_por_caja
  on public.turnos (caja_id) where cerrado_en is null;
create unique index turnos_un_abierto_por_usuario
  on public.turnos (usuario_id) where cerrado_en is null;
create index turnos_abierto_en on public.turnos (abierto_en desc);

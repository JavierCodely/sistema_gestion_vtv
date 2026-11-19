-- Catálogo de servicios que se cobran (ej. "Vehículo particular" en "Vehicular").

create table public.categorias_servicio (
  id        bigint generated always as identity primary key,
  nombre    text not null unique check (btrim(nombre) <> ''),
  activa    boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.servicios (
  id                   bigint generated always as identity primary key,
  nombre               text not null unique check (btrim(nombre) <> ''),
  categoria_id         bigint not null references public.categorias_servicio (id),
  precio               numeric(12,2) not null check (precio >= 0),
  requiere_certificado boolean not null default true,
  activo               boolean not null default true,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);

create index servicios_categoria on public.servicios (categoria_id);

create trigger servicios_actualizado_en
  before update on public.servicios
  for each row execute function public.tg_actualizado_en();

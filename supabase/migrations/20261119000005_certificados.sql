-- Certificados (hojas impresas que se entregan con cada servicio).
-- stock_hojas y costo_promedio SOLO los modifican las RPC (compra, venta, ajuste);
-- el cliente no tiene permiso de UPDATE sobre esas columnas (ver migración de RLS).

create table public.certificados (
  id               bigint generated always as identity primary key,
  nombre           text not null unique check (btrim(nombre) <> ''),
  unidad_compra    public.unidad_compra not null default 'caja',
  hojas_por_unidad integer not null check (hojas_por_unidad > 0),
  alcance          public.alcance_certificado not null default 'global',
  categoria_id     bigint references public.categorias_servicio (id),
  servicio_id      bigint references public.servicios (id),
  stock_minimo     integer not null default 0 check (stock_minimo >= 0),
  stock_hojas      integer not null default 0 check (stock_hojas >= 0),
  costo_promedio   numeric(14,4) not null default 0 check (costo_promedio >= 0),
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  constraint certificados_unidad_suelta
    check (unidad_compra <> 'unidad' or hojas_por_unidad = 1),
  constraint certificados_alcance_coherente check (
       (alcance = 'global'    and categoria_id is null     and servicio_id is null)
    or (alcance = 'categoria' and categoria_id is not null and servicio_id is null)
    or (alcance = 'servicio'  and servicio_id is not null  and categoria_id is null)
  )
);

-- Un solo certificado activo por destino, para que la elección sea inequívoca.
create unique index certificados_un_global_activo
  on public.certificados (alcance) where alcance = 'global' and activo;
create unique index certificados_uno_por_categoria
  on public.certificados (categoria_id) where alcance = 'categoria' and activo;
create unique index certificados_uno_por_servicio
  on public.certificados (servicio_id) where alcance = 'servicio' and activo;

create trigger certificados_actualizado_en
  before update on public.certificados
  for each row execute function public.tg_actualizado_en();

-- Kardex: cada entrada/salida de hojas con su costo.
-- compra_id y venta_id se enlazan en las migraciones de compras y ventas.
create table public.movimientos_certificado (
  id                         bigint generated always as identity primary key,
  certificado_id             bigint not null references public.certificados (id),
  tipo                       public.tipo_mov_certificado not null,
  hojas                      integer not null check (hojas <> 0),
  costo_unitario             numeric(14,4) not null check (costo_unitario >= 0),
  costo_total                numeric(14,2) not null,
  stock_resultante           integer not null check (stock_resultante >= 0),
  costo_promedio_resultante  numeric(14,4) not null,
  compra_id                  bigint,
  venta_id                   bigint,
  nota                       text,
  usuario_id                 uuid references public.perfiles (id),
  creado_en                  timestamptz not null default now()
);

create index movimientos_certificado_cert
  on public.movimientos_certificado (certificado_id, creado_en desc);

-- Certificado que corresponde a un servicio: el más específico activo
-- (servicio > categoría > global). Null si el servicio no lleva certificado
-- o no hay ninguno configurado.
create function public.certificado_para_servicio(p_servicio_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.servicios s
  join public.certificados c
    on c.activo
   and (   (c.alcance = 'servicio'  and c.servicio_id  = s.id)
        or (c.alcance = 'categoria' and c.categoria_id = s.categoria_id)
        or  c.alcance = 'global')
  where s.id = p_servicio_id
    and s.requiere_certificado
  order by case c.alcance when 'servicio' then 1 when 'categoria' then 2 else 3 end
  limit 1
$$;

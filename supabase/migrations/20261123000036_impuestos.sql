-- Impuestos (decisiones del negocio, 2026-11-23). Solo admin; es un REPORTE.
--
-- * Catálogo `impuestos`: nombre (normalizado, único sin mayúsculas), tipo (porcentaje o monto fijo
--   por venta), valor, medios de pago alcanzados (uno o más; "todos" = los tres) y activo. CRUD
--   directo con grants por columna; un impuesto usado en una venta no se borra (FK): se desactiva.
-- * Servicios alcanzados: todos (`todos_servicios`, incluye los que se creen después) o una lista
--   (`impuesto_servicios`). Se fijan de una vez con `fijar_servicios_impuesto()` (atómica).
-- * NO cambia lo que paga el cliente: el precio, el cobro, el cajón, la factura y Fondos siguen igual.
--   Del precio cobrado, la BD calcula cuánto corresponde a cada impuesto y lo guarda como FOTO en
--   `venta_impuestos` al registrarse la venta (también las de fecha pasada). Cambiar o desactivar un
--   impuesto después no cambia las ventas anteriores; un impuesto nuevo cuenta desde que se crea.
-- * Cálculo por venta (una fila por impuesto y medio, solo si el monto es > 0):
--     base alcanzada = suma de las partes de `venta_pagos` pagadas con medios del impuesto;
--     porcentaje → total = round(base alcanzada × valor / 100, 2);
--     monto fijo → total = round(valor × base alcanzada / precio, 2) (todo el valor si la venta se
--                  pagó entera con medios alcanzados; precio $ 0 → el valor entero);
--     el total se reparte entre los medios alcanzados en proporción a lo pagado con cada uno
--     (prorrateo, como en un pago mixto) y la parte más grande se lleva el redondeo: la suma por
--     medio da exactamente el total.
-- * Lo calcula un trigger de sentencia sobre `venta_pagos` (las RPC insertan todos los pagos de una
--   venta en una sola sentencia), con todos los pagos de la venta: no hace falta tocar las RPC de
--   venta y no hay forma de registrar una venta sin su cálculo. Las anuladas conservan su foto y los
--   reportes las excluyen.
-- * Reporte (admin): `resumen_impuestos(desde, hasta, turno)`: total y por impuesto, con cantidad de
--   ventas y el monto por efectivo, transferencia y tarjeta. Período por día de negocio de la venta.

create type public.tipo_impuesto as enum ('porcentaje', 'monto_fijo');

-- Catálogo ------------------------------------------------------------------------------------------

create table public.impuestos (
  id              bigint generated always as identity primary key,
  nombre          text not null
    constraint impuestos_nombre_valido check (btrim(nombre) <> '' and char_length(nombre) <= 100),
  tipo            public.tipo_impuesto not null,
  -- Porcentaje: 0 < valor < 100 (hasta 2 decimales). Monto fijo: pesos por venta, > 0.
  valor           numeric(12,2) not null
    constraint impuestos_valor_valido
      check (valor <> 'NaN'::numeric and valor > 0 and (tipo <> 'porcentaje' or valor < 100)),
  medios          public.medio_pago[] not null default array['efectivo', 'transferencia', 'tarjeta']::public.medio_pago[]
    -- Al menos uno, sin nulos ni repetidos.
    constraint impuestos_medios_validos check (
      cardinality(medios) >= 1
      and array_position(medios, null) is null
      and cardinality(array_positions(medios, 'efectivo')) <= 1
      and cardinality(array_positions(medios, 'transferencia')) <= 1
      and cardinality(array_positions(medios, 'tarjeta')) <= 1),
  todos_servicios boolean not null default false,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create unique index impuestos_nombre_unico on public.impuestos (lower(nombre));

create trigger impuestos_normalizar_nombre
  before insert or update of nombre on public.impuestos
  for each row execute function public.tg_normalizar_nombre();
create trigger impuestos_actualizado_en
  before update on public.impuestos
  for each row execute function public.tg_actualizado_en();

create table public.impuesto_servicios (
  impuesto_id bigint not null references public.impuestos (id) on delete cascade,
  servicio_id bigint not null references public.servicios (id) on delete cascade,
  primary key (impuesto_id, servicio_id)
);

create index impuesto_servicios_servicio on public.impuesto_servicios (servicio_id);

-- Foto de cada venta -------------------------------------------------------------------------------

create table public.venta_impuestos (
  venta_id        bigint not null references public.ventas (id) on delete cascade,
  -- Sin cascade: un impuesto usado no se borra (se desactiva).
  impuesto_id     bigint not null references public.impuestos (id),
  impuesto_nombre text not null check (char_length(impuesto_nombre) <= 100),
  tipo            public.tipo_impuesto not null,
  valor           numeric(12,2) not null check (valor <> 'NaN'::numeric and valor > 0),
  medio           public.medio_pago not null,
  -- Lo pagado con este medio (la parte de `venta_pagos`).
  base            numeric(12,2) not null check (base <> 'NaN'::numeric and base >= 0),
  monto           numeric(12,2) not null check (monto <> 'NaN'::numeric and monto > 0),
  primary key (venta_id, impuesto_id, medio)
);

create index venta_impuestos_impuesto on public.venta_impuestos (impuesto_id);

-- RLS y grants (todo solo admin) -------------------------------------------------------------------

alter table public.impuestos enable row level security;
alter table public.impuesto_servicios enable row level security;
alter table public.venta_impuestos enable row level security;

create policy "admin lee impuestos" on public.impuestos
  for select to authenticated using ((select public.es_admin()));
create policy "admin crea impuestos" on public.impuestos
  for insert to authenticated with check ((select public.es_admin()));
create policy "admin edita impuestos" on public.impuestos
  for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin borra impuestos" on public.impuestos
  for delete to authenticated using ((select public.es_admin()));

create policy "admin lee servicios de impuestos" on public.impuesto_servicios
  for select to authenticated using ((select public.es_admin()));

create policy "admin lee impuestos de ventas" on public.venta_impuestos
  for select to authenticated using ((select public.es_admin()));

grant select (id, nombre, tipo, valor, medios, todos_servicios, activo, creado_en, actualizado_en)
  on public.impuestos to authenticated;
-- Los servicios (todos o la lista) se fijan solo con fijar_servicios_impuesto().
grant insert (nombre, tipo, valor, medios, activo), update (nombre, tipo, valor, medios, activo), delete
  on public.impuestos to authenticated;
grant select on public.impuesto_servicios to authenticated;
grant select on public.venta_impuestos to authenticated;

-- Fijar de una vez los servicios alcanzados (admin) -----------------------------------------------
-- p_todos = true: todos los servicios, también los que se creen después (la lista queda vacía).
-- p_todos = false: solo los de p_servicio_ids ('{}' = ninguno).

create function public.fijar_servicios_impuesto(
  p_impuesto_id  bigint,
  p_todos        boolean,
  p_servicio_ids bigint[]
)
returns public.impuestos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_impuesto public.impuestos;
  v_ids      bigint[];
begin
  perform public._exigir_admin();

  if p_todos is null then
    raise exception 'Indicá si el impuesto alcanza a todos los servicios' using errcode = '22023';
  end if;
  if not p_todos and p_servicio_ids is null then
    raise exception 'Indicá los servicios del impuesto (la lista puede estar vacía)' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids
  from unnest(case when p_todos then '{}'::bigint[] else p_servicio_ids end) x;
  if array_position(v_ids, null) is not null then
    raise exception 'Hay un servicio inválido en la lista' using errcode = '22023';
  end if;

  select * into v_impuesto from public.impuestos where id = p_impuesto_id for update;
  if v_impuesto.id is null then
    raise exception 'El impuesto no existe' using errcode = '22023';
  end if;

  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.servicios s where s.id = x)) then
    raise exception 'Hay un servicio que no existe en la lista' using errcode = '22023';
  end if;

  update public.impuestos set todos_servicios = p_todos where id = p_impuesto_id
  returning * into v_impuesto;

  delete from public.impuesto_servicios
  where impuesto_id = p_impuesto_id and servicio_id <> all (v_ids);

  insert into public.impuesto_servicios (impuesto_id, servicio_id)
  select p_impuesto_id, x from unnest(v_ids) x
  on conflict do nothing;

  return v_impuesto;
end;
$$;

revoke all on function public.fijar_servicios_impuesto(bigint, boolean, bigint[]) from public, anon;
grant execute on function public.fijar_servicios_impuesto(bigint, boolean, bigint[]) to authenticated;

-- Cálculo de la foto de una venta. Uso interno (lo llama el trigger) -------------------------------

create function public._calcular_impuestos_venta(p_venta_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta public.ventas;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if v_venta.id is null then
    return;
  end if;

  delete from public.venta_impuestos where venta_id = p_venta_id;

  insert into public.venta_impuestos
    (venta_id, impuesto_id, impuesto_nombre, tipo, valor, medio, base, monto)
  with alcanzados as (
    select i.id, i.nombre, i.tipo, i.valor, i.medios
    from public.impuestos i
    where i.activo
      and (i.todos_servicios
           or exists (select 1 from public.impuesto_servicios s
                      where s.impuesto_id = i.id and s.servicio_id = v_venta.servicio_id))
  ),
  partes as (
    select a.id, a.nombre, a.tipo, a.valor, p.medio, p.monto as base,
           sum(p.monto) over (partition by a.id) as base_alcanzada,
           row_number() over (partition by a.id order by p.monto desc, p.medio) as orden
    from alcanzados a
    join public.venta_pagos p on p.venta_id = p_venta_id and p.medio = any (a.medios)
  ),
  con_total as (
    select pt.*,
           (case pt.tipo
              when 'porcentaje' then round(pt.base_alcanzada * pt.valor / 100, 2)
              else round(pt.valor * case when v_venta.precio = 0 then 1
                                         else pt.base_alcanzada / v_venta.precio end, 2)
            end) as total
    from partes pt
  ),
  repartido as (
    select ct.*,
           (case when ct.base_alcanzada = 0 then (case when ct.orden = 1 then ct.total else 0 end)
                 else round(ct.total * ct.base / ct.base_alcanzada, 2) end) as parte
    from con_total ct
  ),
  final as (
    select r.id, r.nombre, r.tipo, r.valor, r.medio, r.base,
           (case when r.orden = 1
                 then r.total - (sum(r.parte) over (partition by r.id) - r.parte)
                 else r.parte end) as monto
    from repartido r
    where r.total > 0
  )
  select p_venta_id, f.id, f.nombre, f.tipo, f.valor, f.medio, f.base, f.monto
  from final f
  where f.monto > 0;
end;
$$;

revoke execute on function public._calcular_impuestos_venta(bigint) from public, anon, authenticated;

create function public.tg_impuestos_de_pagos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._calcular_impuestos_venta(x.venta_id)
  from (select distinct n.venta_id from nuevos n) x;
  return null;
end;
$$;

revoke execute on function public.tg_impuestos_de_pagos() from public, anon, authenticated;

create trigger venta_pagos_impuestos
  after insert on public.venta_pagos
  referencing new table as nuevos
  for each statement execute function public.tg_impuestos_de_pagos();

-- Reporte (admin) -----------------------------------------------------------------------------------
-- Ventas no anuladas con día de negocio en el rango (NULL = sin límite) y, si se indica, de un turno.
-- agrupacion = 'total' (una fila, id NULL, aunque no haya nada: todo en 0) · 'impuesto' (nombre
-- actual del catálogo), de mayor a menor total.

create function public.resumen_impuestos(
  p_desde    date default null,
  p_hasta    date default null,
  p_turno_id bigint default null
)
returns table (
  agrupacion          text,
  id                  bigint,
  nombre              text,
  cantidad_ventas     bigint,
  total               numeric(14,2),
  total_efectivo      numeric(14,2),
  total_transferencia numeric(14,2),
  total_tarjeta       numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  if p_desde is not null and p_hasta is not null and p_desde > p_hasta then
    raise exception 'La fecha "desde" no puede ser posterior a "hasta"' using errcode = '22023';
  end if;

  return query
  with filas as (
    select vi.venta_id, vi.impuesto_id, vi.medio, vi.monto
    from public.venta_impuestos vi
    join public.ventas v on v.id = vi.venta_id
    where not v.anulada
      and (p_desde is null or public.fecha_local(v.creado_en) >= p_desde)
      and (p_hasta is null or public.fecha_local(v.creado_en) <= p_hasta)
      and (p_turno_id is null or v.turno_id = p_turno_id)
  ),
  agrupado as (
    select 'total'::text as grupo, 0 as orden, null::bigint as clave, 'Total'::text as etiqueta,
           count(distinct f.venta_id) as cantidad,
           coalesce(sum(f.monto), 0) as t,
           coalesce(sum(f.monto) filter (where f.medio = 'efectivo'), 0) as t_ef,
           coalesce(sum(f.monto) filter (where f.medio = 'transferencia'), 0) as t_tr,
           coalesce(sum(f.monto) filter (where f.medio = 'tarjeta'), 0) as t_ta
    from filas f
    union all
    select 'impuesto', 1, i.id, i.nombre,
           count(distinct f.venta_id),
           sum(f.monto),
           coalesce(sum(f.monto) filter (where f.medio = 'efectivo'), 0),
           coalesce(sum(f.monto) filter (where f.medio = 'transferencia'), 0),
           coalesce(sum(f.monto) filter (where f.medio = 'tarjeta'), 0)
    from filas f
    join public.impuestos i on i.id = f.impuesto_id
    group by i.id, i.nombre
  )
  select a.grupo, a.clave, a.etiqueta, a.cantidad,
         a.t::numeric(14,2), a.t_ef::numeric(14,2), a.t_tr::numeric(14,2), a.t_ta::numeric(14,2)
  from agrupado a
  order by a.orden, a.t desc, a.etiqueta;
end;
$$;

revoke all on function public.resumen_impuestos(date, date, bigint) from public, anon;
grant execute on function public.resumen_impuestos(date, date, bigint) to authenticated;
